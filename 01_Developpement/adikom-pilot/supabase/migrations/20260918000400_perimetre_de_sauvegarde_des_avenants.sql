-- =============================================================================
-- ADIKOM PILOT — 090 · Les avenants et les segments entrent dans la sauvegarde
-- LOT 22 — DEC-045 · Plan 02 §13.2 et §13.3
--
-- POURQUOI UNE MIGRATION À PART
--
-- « Chaque lot livre sa propre migration de périmètre de sauvegarde, et
--   `verify:backup` passe avant la clôture du lot. Le repousser à la fin
--   garantit l'oubli. » (Plan 02 §13.3)
--
-- CE QU'UNE TABLE ABSENTE DU PÉRIMÈTRE COÛTERAIT ICI
--
-- L'histoire des véhicules d'un contrat. Après une restauration, une location
-- ayant changé de véhicule n'aurait plus ni avenant, ni segment, ni coût gelé —
-- et ses occupations désigneraient des segments disparus.
--
-- L'ORDRE EST IMPÉRATIF — DES PARENTS VERS LES ENFANTS
--
--   rentals ──▶ rental_amendments ──▶ rental_segments ──▶ rental_segment_costs
--   vehicles ────────────────────────▶       │
--   suppliers, supplier_vehicle_rates ───────┴──────────▶ rental_segment_costs
--                                            │
--                                            └──────────▶ vehicle_occupations
--
-- ⚠ `vehicle_occupations` PORTE DÉSORMAIS UNE CLÉ VERS `rental_segments`. Elle
-- figurait déjà dans le périmètre, mais sa position devient CONTRAIGNANTE :
-- restaurer une occupation avant son segment échouerait. Elle vient donc
-- APRÈS — et la réinitialisation, qui parcourt la liste à l'envers, la vide
-- AVANT, ce qui est exactement l'ordre dont elle a besoin.
--
-- 3 TABLES LÀ OÙ LE PLAN 02 §13.2 EN ANNONÇAIT 2
--
-- Le plan prévoyait `rental_amendments` et `rental_segments`, le coût gelé
-- vivant en colonnes `locked_cost_*` sur le segment. Il y en a trois : RLS
-- filtre des LIGNES, pas des COLONNES, et `rental_segments` s'ouvre par
-- `rental.rentals.view`. Un coût rangé sur le segment serait rendu par un
-- `select *` à quiconque consulte une location — la confidentialité du LOT 21
-- serait contournée par la porte du contrat.
--
-- Périmètre : 50 → 53 tables.
-- =============================================================================

create or replace function public.backup_scope()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array[
    -- Référentiel
    'vehicle_categories',
    'clients',
    'suppliers',
    'partners',
    'supplier_payment_details',
    'vehicles',
    'vehicle_supplier_history',
    'vehicle_documents',
    'pricing_rules',
    -- Coût d'acquisition des véhicules — LOT 21 ; après `suppliers` ET `vehicles`
    'supplier_vehicle_rates',
    'financial_accounts',
    -- Catalogue de services — LOT 20, des parents vers les enfants
    'service_categories',
    'services',
    'service_variants',
    'service_variant_prices',
    'service_variant_costs',
    -- Cycle d'exploitation
    'reservations',
    'rentals',
    -- Avenants et segments — LOT 22, dans cet ordre :
    --   l'avenant est cité par le segment qu'il ouvre,
    --   le segment est cité par son coût gelé ET par son occupation.
    'rental_amendments',
    'rental_segments',
    'rental_segment_costs',
    'rental_inspections',
    'rental_inspection_photos',
    -- APRÈS `rental_segments` depuis le LOT 22 : elle le désigne.
    'vehicle_occupations',
    'vehicle_incidents',
    'incident_damages',
    'incident_photos',
    'vehicle_maintenances',
    'maintenance_quotes',
    'maintenance_costs',
    'maintenance_cost_lines',
    'maintenance_documents',
    -- Facturation et imputation
    'supplier_invoices',
    'supplier_invoice_lines',
    'imputations',
    'imputation_documents',
    'customer_invoices',
    'customer_invoice_lines',
    -- Trésorerie
    'supplier_payments',
    'customer_payments',
    'internal_transfers',
    'misc_payments',
    'treasury_entries',
    -- Projets et planification
    'projects',
    'project_members',
    'project_tasks',
    'project_meetings',
    'project_meeting_participants',
    'project_appointments',
    'project_appointment_participants',
    'project_decisions',
    'project_actions',
    -- Lecture des notifications
    'notification_reads'
  ]::text[];
$$;

comment on function public.backup_scope() is
  'Tables métier de la sauvegarde, ordonnées des parents vers les enfants. Ni les comptes, ni les permissions, ni le journal d''audit n''y figurent.';

revoke execute on function public.backup_scope() from public, anon, authenticated;
grant  execute on function public.backup_scope() to service_role;


-- =============================================================================
-- `TRUNCATE` RETIRÉ SUR LES TABLES NOUVELLES — DEC-039 §g
--
-- Le droit est accordé par défaut au propriétaire du schéma et hérité par
-- `authenticated` sur les tables créées par la migration. `TRUNCATE` ne
-- déclenche AUCUN déclencheur de ligne : il contournerait `fn_forbid_delete` et
-- effacerait l'histoire des véhicules d'un contrat sans laisser une entrée au
-- journal. La 087 l'a déjà retiré ; la reprise ici rend la migration autonome.
-- =============================================================================

revoke truncate on public.rental_amendments    from authenticated;
revoke truncate on public.rental_segments      from authenticated;
revoke truncate on public.rental_segment_costs from authenticated;


-- =============================================================================
-- CONTRÔLES
-- =============================================================================

do $$
declare
  v_scope    text[] := public.backup_scope();
  v_absentes text[];
  v_ouvertes text[];
  v_nouvelle text;
  v_pos      int;
  v_parent   text;
  v_pos_par  int;
begin
  -- Les trois tables du lot figurent au périmètre.
  select array_agg(t) into v_absentes
  from unnest(array['rental_amendments', 'rental_segments', 'rental_segment_costs']) t
  where not (t = any (v_scope));

  if v_absentes is not null then
    raise exception 'Tables du LOT 22 hors du périmètre de sauvegarde : %', v_absentes;
  end if;

  -- Rien de ce qui touche aux comptes n'y est entré par mégarde.
  if exists (
    select 1 from unnest(array[
      'app_users', 'user_groups', 'user_permissions', 'user_departments',
      'permissions', 'groups', 'group_permissions', 'departments',
      'company_settings', 'numbering_rules', 'audit_log'
    ]) t where t = any (v_scope)
  ) then
    raise exception 'Périmètre de sauvegarde invalide : un objet interdit y figure.';
  end if;

  -- Toutes les tables citées existent réellement.
  select array_agg(t) into v_absentes
  from unnest(v_scope) t
  where not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = t
  );

  if v_absentes is not null then
    raise exception 'Tables du périmètre introuvables : %', v_absentes;
  end if;

  -- Les acquis des LOTS 20 et 21 sont toujours là : cette migration réécrit la
  -- fonction ENTIÈRE, et une omission se lirait comme une suppression.
  select array_agg(t) into v_absentes
  from unnest(array[
    'service_categories', 'services', 'service_variants',
    'service_variant_prices', 'service_variant_costs', 'supplier_vehicle_rates'
  ]) t
  where not (t = any (v_scope));

  if v_absentes is not null then
    raise exception 'Un acquis d''un lot antérieur a disparu du périmètre : %', v_absentes;
  end if;

  /*
   * L'ORDRE, VÉRIFIÉ PAIRE PAR PAIRE.
   *
   * Une restauration qui insérerait un segment avant son avenant, un coût gelé
   * avant son segment, ou une occupation avant le segment qu'elle désigne,
   * échouerait sur une clé étrangère — au pire moment, celui où l'on remet la
   * base d'aplomb.
   */
  foreach v_nouvelle in array array[
    'rental_amendments:rentals',
    'rental_segments:rentals',
    'rental_segments:vehicles',
    'rental_segments:rental_amendments',
    'rental_segment_costs:rental_segments',
    'rental_segment_costs:suppliers',
    'rental_segment_costs:supplier_vehicle_rates',
    'vehicle_occupations:rental_segments'
  ] loop
    v_parent := split_part(v_nouvelle, ':', 2);
    select array_position(v_scope, split_part(v_nouvelle, ':', 1)) into v_pos;
    select array_position(v_scope, v_parent) into v_pos_par;

    if v_pos is null or v_pos_par is null or v_pos < v_pos_par then
      raise exception
        'Ordre du périmètre invalide : « % » précède « % », la restauration échouerait.',
        split_part(v_nouvelle, ':', 1), v_parent;
    end if;
  end loop;

  -- TRUNCATE refermé sur tout le périmètre, les tables nouvelles comprises.
  select array_agg(t) into v_ouvertes
  from unnest(v_scope) t
  where has_table_privilege('authenticated', 'public.' || quote_ident(t), 'TRUNCATE');

  if v_ouvertes is not null then
    raise exception 'TRUNCATE encore accordé à authenticated sur : %', v_ouvertes;
  end if;

  raise notice
    '[OK] 090. Périmètre de sauvegarde à % tables ; avenants, segments et coût gelé y figurent, dans l''ordre.',
    array_length(v_scope, 1);
end $$;
