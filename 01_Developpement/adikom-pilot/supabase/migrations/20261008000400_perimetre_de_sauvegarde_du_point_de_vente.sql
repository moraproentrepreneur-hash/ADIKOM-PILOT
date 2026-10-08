-- =============================================================================
-- ADIKOM PILOT — 111 · Le point de vente entre dans la sauvegarde
-- LOT 27 — Plan 02 §13.2 et §13.3 · décision T-1 (8 octobre 2026)
--
-- « Chaque lot livre sa propre migration de périmètre de sauvegarde. » (§13.3)
--
-- TROIS TABLES, ET NON DEUX : le Plan 02 §13.2 prévoyait `pos_registers` et
-- `pos_sessions` ; T-1 a placé les montants dans une table sœur. L'oublier
-- restaurerait des sessions SANS fond de caisse ni montant compté — et le
-- contrôle différé de la migration 108 n'aurait plus rien à vérifier.
--
-- L'ORDRE — DES PARENTS VERS LES ENFANTS
--
--   financial_accounts ──▶ pos_registers ──▶ pos_sessions ──▶ pos_session_amounts
--
-- Placées juste après `financial_accounts`, AVANT le catalogue et le cycle
-- d'exploitation : le LOT 28 y fera suivre les ventes, qui citeront la session.
-- La réinitialisation parcourt la liste à l'envers : les montants partent avant
-- les sessions, les sessions avant les caisses, les caisses avant les comptes.
--
-- `backup_columns` lit `information_schema` : `account_kind` et `cashier_id`
-- (recopié) sont repris d'eux-mêmes — le contrôle le CONSTATE.
--
-- Le format de sauvegarde, `backup_columns` et le moteur de restauration ne
-- changent PAS. Les tables sauvegardées changent : le cycle destructif
-- SAUVEGARDE → RÉINITIALISATION → RESTAURATION est donc DÛ en local
-- (CLAUDE.md §47 bis).
--
-- Périmètre : 62 → 65 tables.
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
    -- Point de vente — LOT 27. APRÈS `financial_accounts`, que la caisse cite ;
    -- la session cite la caisse, les montants citent la session.
    'pos_registers',
    'pos_sessions',
    'pos_session_amounts',
    -- Catalogue de services — LOT 20, des parents vers les enfants
    'service_categories',
    'services',
    'service_variants',
    'service_variant_prices',
    'service_variant_costs',
    -- Commerce client — LOT 25. APRÈS `clients` et `service_variants`, que les
    -- lignes citent ; AVANT `customer_invoices`, qui cite la commande.
    'sales_quotes',
    'sales_quote_lines',
    'sales_orders',
    'sales_order_lines',
    -- Commerce fournisseur — LOT 26. APRÈS `suppliers` et `service_variants` ;
    -- AVANT `supplier_invoices`, qui cite la commande.
    'purchase_quotes',
    'purchase_quote_lines',
    'purchase_orders',
    'purchase_order_lines',
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


revoke truncate on public.pos_registers       from authenticated;
revoke truncate on public.pos_sessions        from authenticated;
revoke truncate on public.pos_session_amounts from authenticated;


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
  v_pos_par  int;
begin
  if array_length(v_scope, 1) <> 65 then
    raise exception 'Périmètre attendu à 65 tables, obtenu %.', array_length(v_scope, 1);
  end if;

  select array_agg(t) into v_absentes
  from unnest(array['pos_registers', 'pos_sessions', 'pos_session_amounts']) t
  where not (t = any (v_scope));
  if v_absentes is not null then
    raise exception 'Tables du point de vente hors du périmètre : %', v_absentes;
  end if;

  -- Les acquis des lots 20 à 26 demeurent : la fonction est réécrite ENTIÈRE.
  select array_agg(t) into v_absentes
  from unnest(array[
    'service_categories', 'services', 'service_variants', 'service_variant_prices',
    'service_variant_costs', 'supplier_vehicle_rates', 'rental_amendments', 'rental_segments',
    'rental_segment_costs', 'rental_billing_periods', 'sales_quotes', 'sales_quote_lines',
    'sales_orders', 'sales_order_lines', 'purchase_quotes', 'purchase_quote_lines',
    'purchase_orders', 'purchase_order_lines', 'financial_accounts', 'treasury_entries',
    'notification_reads'
  ]) t
  where not (t = any (v_scope));
  if v_absentes is not null then
    raise exception 'Un acquis d''un lot antérieur a disparu du périmètre : %', v_absentes;
  end if;

  if exists (
    select 1 from unnest(array[
      'app_users', 'user_groups', 'user_permissions', 'user_departments',
      'permissions', 'groups', 'group_permissions', 'departments',
      'company_settings', 'numbering_rules', 'audit_log'
    ]) t where t = any (v_scope)
  ) then
    raise exception 'Périmètre de sauvegarde invalide : un objet interdit y figure.';
  end if;

  select array_agg(t) into v_absentes
  from unnest(v_scope) t
  where not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t);
  if v_absentes is not null then
    raise exception 'Tables du périmètre introuvables : %', v_absentes;
  end if;

  -- L'ordre, paire par paire.
  foreach v_paire in array array[
    'pos_registers:financial_accounts',
    'pos_sessions:pos_registers',
    'pos_session_amounts:pos_sessions',
    'purchase_order_lines:purchase_orders',
    'supplier_invoices:purchase_orders',
    'customer_invoices:sales_orders',
    'customer_invoices:rental_billing_periods',
    'treasury_entries:financial_accounts'
  ] loop
    v_pos     := array_position(v_scope, split_part(v_paire, ':', 1));
    v_pos_par := array_position(v_scope, split_part(v_paire, ':', 2));
    if v_pos is null or v_pos_par is null or v_pos < v_pos_par then
      raise exception 'Ordre du périmètre invalide : « % » précède « % ».',
        split_part(v_paire, ':', 1), split_part(v_paire, ':', 2);
    end if;
  end loop;

  select array_agg(t) into v_ouvertes
  from unnest(v_scope) t
  where has_table_privilege('authenticated', 'public.' || quote_ident(t), 'TRUNCATE');
  if v_ouvertes is not null then
    raise exception 'TRUNCATE encore accordé à authenticated sur : %', v_ouvertes;
  end if;

  if public.backup_columns('pos_registers') not like '%account_kind%' then
    raise exception '`backup_columns` ignore `account_kind` : la clé composite refuserait la restauration.';
  end if;
  if public.backup_columns('pos_session_amounts') not like '%cashier_id%'
     or public.backup_columns('pos_session_amounts') not like '%opening_float%'
     or public.backup_columns('pos_session_amounts') not like '%counted_amount%' then
    raise exception '`backup_columns` ne rend pas les montants d''une session.';
  end if;

  raise notice '[OK] 111. Périmètre de sauvegarde à % tables ; caisses, sessions et montants après les comptes.',
    array_length(v_scope, 1);
end $$;
