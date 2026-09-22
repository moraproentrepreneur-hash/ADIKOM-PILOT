-- =============================================================================
-- ADIKOM PILOT — 096 · Les périodes facturables entrent dans la sauvegarde
-- LOT 23 — DEC-047 · Plan 02 §13.2 et §13.3
--
-- POURQUOI UNE MIGRATION À PART
--
-- « Chaque lot livre sa propre migration de périmètre de sauvegarde, et
--   `verify:backup` passe avant la clôture du lot. Le repousser à la fin
--   garantit l'oubli. » (Plan 02 §13.3)
--
-- CE QU'UNE TABLE ABSENTE DU PÉRIMÈTRE COÛTERAIT ICI
--
-- Le découpage de la créance. Après une restauration, une longue durée aurait
-- ses factures mais plus aucune période — et chaque facture désignerait, par
-- `billing_period_id`, une ligne disparue. La restauration elle-même échouerait
-- sur la clé étrangère, au pire moment : celui où l'on remet la base d'aplomb.
--
-- L'ORDRE EST IMPÉRATIF — DES PARENTS VERS LES ENFANTS
--
--   rentals ──▶ rental_amendments ──▶ rental_billing_periods ──▶ customer_invoices
--                      │
--                      └──▶ rental_segments ──▶ rental_segment_costs
--
-- ⚠ DEUX CONTRAINTES NOUVELLES DE POSITION :
--
--   · `rental_billing_periods` cite `rental_amendments` (l'avenant qui l'a
--     ouverte) : elle vient APRÈS lui ;
--   · `customer_invoices` cite `rental_billing_periods` : elle vient APRÈS
--     elle. Elle figurait déjà au périmètre, mais sa position devient
--     CONTRAIGNANTE — et elle est de toute façon déjà bien plus loin dans la
--     liste, après la facturation fournisseur.
--
-- La réinitialisation parcourt la liste À L'ENVERS : elle vide donc les
-- factures AVANT les périodes, et les périodes AVANT les avenants. Exactement
-- l'ordre dont elle a besoin.
--
-- Périmètre : 53 → 54 tables.
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
    -- Périodes facturables — LOT 23. APRÈS `rental_amendments`, qu'elles
    -- citent ; AVANT `customer_invoices`, qui les cite.
    'rental_billing_periods',
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
-- `TRUNCATE` REFERMÉ SUR LA TABLE NOUVELLE — DEC-039 §g
--
-- Le droit est accordé par défaut au propriétaire du schéma et hérité par
-- `authenticated`. `TRUNCATE` ne déclenche AUCUN déclencheur de ligne : il
-- contournerait `fn_forbid_delete` et effacerait le découpage de la créance sans
-- laisser une entrée au journal. La 094 l'a déjà retiré ; la reprise ici rend la
-- migration autonome.
-- =============================================================================

revoke truncate on public.rental_billing_periods from authenticated;


-- =============================================================================
-- CONTRÔLES
-- =============================================================================

do $$
declare
  v_scope    text[] := public.backup_scope();
  v_absentes text[];
  v_ouvertes text[];
  v_paire    text;
  v_pos      int;
  v_parent   text;
  v_pos_par  int;
begin
  -- La table du lot figure au périmètre.
  if not ('rental_billing_periods' = any (v_scope)) then
    raise exception
      'La table `rental_billing_periods` est hors du périmètre de sauvegarde : le découpage de la créance ne serait ni exporté, ni restauré.';
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

  /*
   * LES ACQUIS DES LOTS 20, 21 ET 22 SONT TOUJOURS LÀ.
   *
   * Cette migration réécrit la fonction ENTIÈRE : une omission se lirait comme
   * une suppression silencieuse, et ne se découvrirait qu'à la restauration
   * suivante — quand il serait trop tard.
   */
  select array_agg(t) into v_absentes
  from unnest(array[
    'service_categories', 'services', 'service_variants',
    'service_variant_prices', 'service_variant_costs', 'supplier_vehicle_rates',
    'rental_amendments', 'rental_segments', 'rental_segment_costs'
  ]) t
  where not (t = any (v_scope));

  if v_absentes is not null then
    raise exception 'Un acquis d''un lot antérieur a disparu du périmètre : %', v_absentes;
  end if;

  /*
   * L'ORDRE, VÉRIFIÉ PAIRE PAR PAIRE — et non par un simple décompte : une
   * liste fautive peut porter le bon nombre de tables.
   */
  foreach v_paire in array array[
    'rental_amendments:rentals',
    'rental_segments:rentals',
    'rental_segments:vehicles',
    'rental_segments:rental_amendments',
    'rental_segment_costs:rental_segments',
    'rental_segment_costs:suppliers',
    'rental_segment_costs:supplier_vehicle_rates',
    'vehicle_occupations:rental_segments',
    -- LOT 23
    'rental_billing_periods:rentals',
    'rental_billing_periods:rental_amendments',
    'customer_invoices:rental_billing_periods'
  ] loop
    v_parent := split_part(v_paire, ':', 2);
    select array_position(v_scope, split_part(v_paire, ':', 1)) into v_pos;
    select array_position(v_scope, v_parent) into v_pos_par;

    if v_pos is null or v_pos_par is null or v_pos < v_pos_par then
      raise exception
        'Ordre du périmètre invalide : « % » précède « % », la restauration échouerait.',
        split_part(v_paire, ':', 1), v_parent;
    end if;
  end loop;

  -- TRUNCATE refermé sur tout le périmètre, la table nouvelle comprise.
  select array_agg(t) into v_ouvertes
  from unnest(v_scope) t
  where has_table_privilege('authenticated', 'public.' || quote_ident(t), 'TRUNCATE');

  if v_ouvertes is not null then
    raise exception 'TRUNCATE encore accordé à authenticated sur : %', v_ouvertes;
  end if;

  /*
   * `backup_columns` n'a RIEN À CHANGER, et c'est vérifié plutôt que supposé :
   * elle lit `information_schema`, donc la colonne `billing_period_id` et la
   * table nouvelle sont reprises d'elles-mêmes.
   */
  if public.backup_columns('customer_invoices') not like '%billing_period_id%' then
    raise exception
      '`backup_columns` ignore `customer_invoices.billing_period_id` : la facture reviendrait détachée de sa période.';
  end if;

  if coalesce(public.backup_columns('rental_billing_periods'), '') not like '%period%' then
    raise exception '`backup_columns` ne rend pas les colonnes de `rental_billing_periods`.';
  end if;

  raise notice
    '[OK] 096. Périmètre de sauvegarde à % tables ; les périodes facturables y figurent, entre leur avenant et leur facture.',
    array_length(v_scope, 1);
end $$;
