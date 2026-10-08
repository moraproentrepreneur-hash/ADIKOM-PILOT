-- =============================================================================
-- ADIKOM PILOT — 120 · Les ventes du point de vente entrent dans la sauvegarde
-- LOT 28 — Plan 02 §13.2 et §13.3 · Module 12 §22.3
--
-- « Chaque lot livre sa propre migration de périmètre de sauvegarde. » (§13.3)
--
-- QUATRE TABLES (Plan 02 §13.2) : `pos_sales`, `pos_sale_lines`,
-- `pos_payments`, `commercial_line_costs`.
--
-- L'ORDRE — DES PARENTS VERS LES ENFANTS
--
--   pos_session_amounts ─┐
--   clients ─────────────┼─▶ pos_sales ─▶ pos_sale_lines ─▶ commercial_line_costs
--   service_variant_* ───┘        └─────▶ pos_payments
--                                             │
--   customer_invoices (pos_sale_id) ◀─────────┤  (cite la vente)
--   customer_payments (pos_payment_id) ◀──────┤  (cite le paiement)
--   treasury_entries  (pos_payment_id) ◀──────┘  (cite le paiement)
--
-- Les trois tables qui citent la vente ou ses paiements sont DÉJÀ placées
-- après le catalogue : les ventes s'insèrent donc juste après
-- `service_variant_costs`, avant le commerce et le cycle d'exploitation. La
-- réinitialisation parcourt la liste à l'envers.
--
-- `backup_columns` lit `information_schema` : les colonnes nouvelles
-- (`customer_invoices.pos_sale_id`, `customer_payments.pos_payment_id`,
-- `treasury_entries.pos_payment_id`) sont reprises d'elles-mêmes — le contrôle
-- le CONSTATE.
--
-- Le format, `backup_columns` et le moteur de restauration ne changent PAS. Les
-- tables sauvegardées changent : le cycle destructif SAUVEGARDE →
-- RÉINITIALISATION → RESTAURATION est DÛ en local (CLAUDE.md §47 bis).
--
-- Périmètre : 65 → 69 tables (PROVISOIRE : 65 suppose le LOT 27 validé).
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
    -- Point de vente, ventes — LOT 28. APRÈS `pos_session_amounts` (la session),
    -- `clients` et `service_variants` / `service_variant_prices` (les lignes) ;
    -- le coût copié APRÈS sa ligne et `service_variant_costs`. AVANT
    -- `customer_invoices`, `customer_payments` et `treasury_entries`, qui
    -- citent la vente et ses paiements.
    'pos_sales',
    'pos_sale_lines',
    'pos_payments',
    'commercial_line_costs',
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

comment on function public.backup_scope() is
  'Tables métier de la sauvegarde, ordonnées des parents vers les enfants. Ni les comptes, ni les permissions, ni le journal d''audit n''y figurent.';

revoke execute on function public.backup_scope() from public, anon, authenticated;
grant  execute on function public.backup_scope() to service_role;


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
  if array_length(v_scope, 1) <> 69 then
    raise exception 'Périmètre attendu à 69 tables, obtenu %.', array_length(v_scope, 1);
  end if;

  -- Les acquis des lots 20 à 27 demeurent : la fonction est réécrite ENTIÈRE.
  select array_agg(t) into v_absentes
  from unnest(array[
    'pos_sales', 'pos_sale_lines', 'pos_payments', 'commercial_line_costs',
    'pos_registers', 'pos_sessions', 'pos_session_amounts',
    'service_categories', 'services', 'service_variants', 'service_variant_prices',
    'service_variant_costs', 'supplier_vehicle_rates', 'rental_amendments', 'rental_segments',
    'rental_segment_costs', 'rental_billing_periods', 'sales_quotes', 'sales_quote_lines',
    'sales_orders', 'sales_order_lines', 'purchase_quotes', 'purchase_quote_lines',
    'purchase_orders', 'purchase_order_lines', 'financial_accounts', 'treasury_entries',
    'customer_invoices', 'customer_payments', 'notification_reads'
  ]) t
  where not (t = any (v_scope));
  if v_absentes is not null then
    raise exception 'Tables absentes du périmètre : %', v_absentes;
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

  -- L'ordre, paire par paire (enfant:parent).
  foreach v_paire in array array[
    'pos_sales:pos_session_amounts',
    'pos_sales:clients',
    'pos_sale_lines:pos_sales',
    'pos_sale_lines:service_variant_prices',
    'commercial_line_costs:pos_sale_lines',
    'commercial_line_costs:service_variant_costs',
    'pos_payments:pos_sales',
    'pos_payments:financial_accounts',
    'customer_invoices:pos_sales',
    'customer_payments:pos_payments',
    'customer_payments:customer_invoices',
    'treasury_entries:pos_payments',
    'treasury_entries:customer_payments',
    'pos_registers:financial_accounts',
    'pos_sessions:pos_registers',
    'pos_session_amounts:pos_sessions',
    'customer_invoices:sales_orders',
    'customer_invoices:rental_billing_periods',
    'supplier_invoices:purchase_orders'
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

  -- Les liens du lot sont repris par `backup_columns`.
  if public.backup_columns('customer_invoices') not like '%pos_sale_id%'
     or public.backup_columns('customer_payments') not like '%pos_payment_id%'
     or public.backup_columns('treasury_entries') not like '%pos_payment_id%' then
    raise exception '`backup_columns` ignore un lien du LOT 28 : la restauration détacherait une facture, un règlement ou une écriture de sa vente.';
  end if;
  if public.backup_columns('pos_payments') not like '%applied_amount%'
     or public.backup_columns('pos_payments') not like '%tendered_amount%'
     or public.backup_columns('pos_sale_lines') not like '%service_price_id%' then
    raise exception '`backup_columns` ne rend pas les montants ou la version de prix d''une vente.';
  end if;

  raise notice '[OK] 120. Périmètre de sauvegarde à % tables ; ventes, lignes, paiements et coûts copiés avant ce qui les cite.',
    array_length(v_scope, 1);
end $$;
