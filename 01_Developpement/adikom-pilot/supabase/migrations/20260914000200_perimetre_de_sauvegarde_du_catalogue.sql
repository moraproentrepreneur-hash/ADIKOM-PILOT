-- =============================================================================
-- ADIKOM PILOT — 082 · Le catalogue de services entre dans la sauvegarde
-- LOT 20 — DEC-043 · Plan 02 §13.2 et §13.3
--
-- POURQUOI UNE MIGRATION À PART
--
-- « Chaque lot livre sa propre migration de périmètre de sauvegarde, et
--   `verify:backup` passe avant la clôture du lot. Le repousser à la fin
--   garantit l'oubli. » (Plan 02 §13.3)
--
-- CE QU'UNE TABLE ABSENTE DU PÉRIMÈTRE COÛTE
--
-- Elle n'est ni exportée, ni réinitialisée, ni restaurée. Après une
-- restauration, elle référencerait des lignes disparues : des prix rattachés à
-- des variantes qui n'existent plus.
--
-- L'ORDRE EST IMPÉRATIF — DES PARENTS VERS LES ENFANTS
--
--   service_categories → services → service_variants
--                                        ├── service_variant_prices
--                                        └── service_variant_costs
--
-- L'export et la restauration parcourent la liste à l'endroit, la
-- réinitialisation à l'envers. Une restauration qui insérerait une ligne de
-- prix avant sa variante échouerait.
--
-- LA SAUVEGARDE CONTIENT LES COÛTS — ET NE LES DIVULGUE PAS
--
-- Les trois opérations s'exécutent avec la clé de service, hors de toute
-- session applicative : le fichier produit contient donc les prix d'achat. Cela
-- ne les rend pas lisibles pour autant — la lecture applicative reste gardée
-- par `catalog.services.cost.view`, restauration comprise. Un Super Admin qui
-- exporte a, par ailleurs, déjà accès à tout (Module 08 §34).
--
-- Périmètre : 44 → 49 tables.
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
    'rental_inspections',
    'rental_inspection_photos',
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
-- viderait le catalogue sans laisser une entrée au journal.
-- =============================================================================

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'service_categories', 'services', 'service_variants',
    'service_variant_prices', 'service_variant_costs'
  ] loop
    execute format('revoke truncate on public.%I from authenticated', v_table);
  end loop;
end $$;


-- =============================================================================
-- CONTRÔLES
-- =============================================================================

do $$
declare
  v_scope    text[] := public.backup_scope();
  v_absentes text[];
  v_ouvertes text[];
  v_nouvelles text[] := array[
    'service_categories', 'services', 'service_variants',
    'service_variant_prices', 'service_variant_costs'
  ];
  v_pos_variant int;
  v_pos_prix    int;
begin
  -- Les cinq tables du lot sont dans le périmètre.
  select array_agg(t) into v_absentes
  from unnest(v_nouvelles) t
  where not (t = any (v_scope));

  if v_absentes is not null then
    raise exception
      'Tables du catalogue hors du périmètre de sauvegarde : %', v_absentes;
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

  -- L'ORDRE : une variante avant ses prix, sans quoi la restauration échoue.
  select array_position(v_scope, 'service_variants')       into v_pos_variant;
  select array_position(v_scope, 'service_variant_prices') into v_pos_prix;

  if v_pos_variant is null or v_pos_prix is null or v_pos_variant > v_pos_prix then
    raise exception
      'Ordre du périmètre invalide : les prix précèdent les variantes qu''ils désignent.';
  end if;

  -- TRUNCATE refermé sur tout le périmètre, les nouvelles tables comprises.
  select array_agg(t) into v_ouvertes
  from unnest(v_scope) t
  where has_table_privilege('authenticated', 'public.' || quote_ident(t), 'TRUNCATE');

  if v_ouvertes is not null then
    raise exception 'TRUNCATE encore accordé à authenticated sur : %', v_ouvertes;
  end if;

  raise notice
    '[OK] 082. Périmètre de sauvegarde à % tables ; le catalogue de services y figure, dans l''ordre.',
    array_length(v_scope, 1);
end $$;
