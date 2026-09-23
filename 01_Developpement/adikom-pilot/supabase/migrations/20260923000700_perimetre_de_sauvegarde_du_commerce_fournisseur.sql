-- =============================================================================
-- ADIKOM PILOT — 103 · Le commerce fournisseur entre dans la sauvegarde
-- LOT 26 — Plan 02 §13.2 et §13.3
--
-- POURQUOI UNE MIGRATION À PART
--
-- « Chaque lot livre sa propre migration de périmètre de sauvegarde, et
--   `verify:backup` passe avant la clôture du lot. Le repousser à la fin
--   garantit l'oubli. » (Plan 02 §13.3)
--
-- CE QU'UNE TABLE ABSENTE DU PÉRIMÈTRE COÛTERAIT ICI
--
-- Le prix négocié, et la dette qui en découle. Après une restauration, les
-- factures fournisseurs nées de commandes désigneraient, par `purchase_order_id`,
-- des lignes disparues — et la restauration ÉCHOUERAIT sur la clé étrangère, au
-- pire moment : celui où l'on remet la base d'aplomb. Le prix proposé par le
-- fournisseur, figé sur la ligne de devis, serait perdu sans recours : le
-- catalogue, lui, n'en garde AUCUNE trace — c'est tout l'objet de P-5.
--
-- L'ORDRE EST IMPÉRATIF — DES PARENTS VERS LES ENFANTS
--
--   suppliers ──▶ purchase_quotes ──▶ purchase_quote_lines
--                       │                     │
--                       ▼                     ▼
--                purchase_orders ──▶ purchase_order_lines
--                       │
--                       └──────────────────────▶ supplier_invoices
--
--   services · service_variants ──▶ (les deux tables de lignes)
--
-- ⚠ CINQ CONTRAINTES NOUVELLES DE POSITION :
--
--   · `purchase_quotes` cite `suppliers` : elle vient APRÈS lui — et après
--     `service_variants`, que ses LIGNES citent ;
--   · `purchase_orders` cite `purchase_quotes` : APRÈS elle ;
--   · `purchase_order_lines` cite `purchase_quote_lines`
--     (`source_quote_line_id`) : APRÈS elle ;
--   · `supplier_invoices` cite `purchase_orders`. Elle figurait déjà au
--     périmètre, mais sa position devient CONTRAIGNANTE — elle est de toute
--     façon bien plus loin dans la liste.
--
-- OÙ LES PLACER : juste après le commerce client, dont il est le pendant.
-- Le commerce, client et fournisseur, s'insère APRÈS le catalogue de services et
-- AVANT le cycle d'exploitation ; la facturation qui les suit dépend des deux.
--
-- La réinitialisation parcourt la liste À L'ENVERS : elle vide donc les factures
-- AVANT les commandes, les commandes AVANT les devis. Exactement l'ordre dont
-- elle a besoin.
--
-- Périmètre : 58 → 62 tables.
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


-- =============================================================================
-- `TRUNCATE` REFERMÉ SUR LES TABLES NOUVELLES — DEC-039 §g
--
-- Déjà retiré par la migration 101 ; la reprise ici rend cette migration
-- autonome, et le contrôle plus bas s'en assure pour TOUT le périmètre.
-- =============================================================================

revoke truncate on public.purchase_quotes      from authenticated;
revoke truncate on public.purchase_quote_lines from authenticated;
revoke truncate on public.purchase_orders      from authenticated;
revoke truncate on public.purchase_order_lines from authenticated;


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
  -- Les quatre tables du lot figurent au périmètre.
  select array_agg(t) into v_absentes
  from unnest(array[
    'purchase_quotes', 'purchase_quote_lines', 'purchase_orders', 'purchase_order_lines'
  ]) t
  where not (t = any (v_scope));

  if v_absentes is not null then
    raise exception
      'Tables du commerce fournisseur hors du périmètre de sauvegarde : %. Le prix négocié ne serait ni exporté, ni restauré.',
      v_absentes;
  end if;

  if array_length(v_scope, 1) <> 62 then
    raise exception 'Périmètre attendu à 62 tables, obtenu %.', array_length(v_scope, 1);
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
   * LES ACQUIS DES LOTS 20 À 25 SONT TOUJOURS LÀ.
   *
   * Cette migration réécrit la fonction ENTIÈRE : une omission se lirait comme
   * une suppression silencieuse, et ne se découvrirait qu'à la restauration
   * suivante — quand il serait trop tard.
   */
  select array_agg(t) into v_absentes
  from unnest(array[
    'service_categories', 'services', 'service_variants',
    'service_variant_prices', 'service_variant_costs', 'supplier_vehicle_rates',
    'rental_amendments', 'rental_segments', 'rental_segment_costs',
    'rental_billing_periods',
    'sales_quotes', 'sales_quote_lines', 'sales_orders', 'sales_order_lines'
  ]) t
  where not (t = any (v_scope));

  if v_absentes is not null then
    raise exception 'Un acquis d''un lot antérieur a disparu du périmètre : %', v_absentes;
  end if;

  /*
   * L'ORDRE, VÉRIFIÉ PAIRE PAR PAIRE — et non par un simple décompte : une liste
   * fautive peut porter le bon nombre de tables.
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
    'rental_billing_periods:rentals',
    'rental_billing_periods:rental_amendments',
    'customer_invoices:rental_billing_periods',
    -- LOT 25
    'sales_quotes:clients',
    'sales_quote_lines:sales_quotes',
    'sales_quote_lines:services',
    'sales_quote_lines:service_variants',
    'sales_orders:clients',
    'sales_orders:sales_quotes',
    'sales_order_lines:sales_orders',
    'sales_order_lines:sales_quote_lines',
    'sales_order_lines:services',
    'sales_order_lines:service_variants',
    'customer_invoices:sales_orders',
    'customer_invoice_lines:sales_order_lines',
    'customer_invoice_lines:services',
    'customer_invoice_lines:service_variants',
    -- LOT 26
    'purchase_quotes:suppliers',
    'purchase_quote_lines:purchase_quotes',
    'purchase_quote_lines:services',
    'purchase_quote_lines:service_variants',
    'purchase_orders:suppliers',
    'purchase_orders:purchase_quotes',
    'purchase_order_lines:purchase_orders',
    'purchase_order_lines:purchase_quote_lines',
    'purchase_order_lines:services',
    'purchase_order_lines:service_variants',
    'supplier_invoices:purchase_orders',
    'supplier_invoice_lines:services',
    'supplier_invoice_lines:service_variants'
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

  -- TRUNCATE refermé sur tout le périmètre, les tables nouvelles comprises.
  select array_agg(t) into v_ouvertes
  from unnest(v_scope) t
  where has_table_privilege('authenticated', 'public.' || quote_ident(t), 'TRUNCATE');

  if v_ouvertes is not null then
    raise exception 'TRUNCATE encore accordé à authenticated sur : %', v_ouvertes;
  end if;

  /*
   * `backup_columns` reprend les colonnes d'elle-même : vérifié, pas supposé.
   * Elle lit `information_schema`, donc les colonnes nouvelles et les tables
   * nouvelles sont reprises toutes seules — encore faut-il le CONSTATER.
   */
  if public.backup_columns('purchase_quote_lines') not like '%unit_price%' then
    raise exception
      '`backup_columns` ne rend pas le prix figé des lignes de devis fournisseur : le montant proposé serait perdu, et le catalogue n''en garde aucune trace.';
  end if;

  if public.backup_columns('purchase_quotes') not like '%external_ref%' then
    raise exception
      '`backup_columns` ignore la référence du fournisseur : le document reçu deviendrait introuvable dans ses archives.';
  end if;

  if public.backup_columns('purchase_order_lines') not like '%source_quote_line_id%' then
    raise exception
      '`backup_columns` ignore le lien de la ligne de commande vers sa ligne de devis.';
  end if;

  if public.backup_columns('supplier_invoices') not like '%purchase_order_id%' then
    raise exception
      '`backup_columns` ignore `supplier_invoices.purchase_order_id` : la facture reviendrait détachée de sa commande.';
  end if;

  raise notice
    '[OK] 103. Périmètre de sauvegarde à % tables ; le commerce fournisseur y figure, entre le commerce client et le cycle d''exploitation.',
    array_length(v_scope, 1);
end $$;
