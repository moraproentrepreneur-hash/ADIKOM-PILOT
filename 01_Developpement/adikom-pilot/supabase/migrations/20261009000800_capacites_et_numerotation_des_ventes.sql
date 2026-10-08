-- =============================================================================
-- ADIKOM PILOT — 119 · Point de vente : capacités et numérotation des ventes
-- LOT 28 — Plan 02 §10.2, §10.3 · décision C-28 (DEC-055, 8 octobre 2026) ·
-- Module 12 §20
--
-- MODULE `pos`, ORDRE 12. Un troisième menu :
--
--   `sales` (3) « Ventes »   view · create · discount✓ · credit✓ · cancel✓
--                            download✓ · print✓ · export✓
--
-- 🟥 `discount` ET `credit` SÉPARÉES DE `create` (Plan 02 §10.2, A-14) :
-- encaisser 60 000 sur 60 000 dus et accorder 10 000 de remise ne sont pas le
-- même geste. Un caissier encaisse ; consentir un rabais ou un crédit engage
-- ADIKOM. Action `ADMIN`, comme au Plan 02.
--
-- C-28 — LES HUIT, TELLES QUELLES. AUCUNE AUTRE :
--   · pas de capacité « facture sur demande » — elle réemploie
--     `billing.customer_invoices.create` / `.issue` et
--     `billing.customer_payments.create` (Module 12 §18) ;
--   · `catalog.services.cost.view` garde le coût copié : EXISTANTE ;
--   · pas de `pos.sales.refund` — B-11, hors périmètre.
--
-- B-12 reconduite : AUCUNE affectation automatique aux groupes système.
--
-- Catalogue : 238 → 246 (PROVISOIRE : 238 suppose le LOT 27 validé en local).
-- =============================================================================


-- =============================================================================
-- 1. NUMÉROTATION — VTE, avec année (Plan 01 §16.2 : VTE-2026-000001)
--
-- ⚠ PLACÉE AVANT LES CAPACITÉS (même raison qu'aux migrations 101 et 110) : le
-- contrôle de parité TS/SQL lit les tuples qui suivent la liste de colonnes du
-- catalogue.
-- =============================================================================

insert into public.numbering_rules
  (entity_key, label, prefix, include_year, padding, separator, reset_yearly, current_value)
values
  ('pos_sale', 'Vente au comptoir', 'VTE', true, 6, '-', true, 0)
on conflict (entity_key) do nothing;


-- =============================================================================
-- 2. LES HUIT CAPACITÉS
--
-- La liste de colonnes ouvre par `(code, module_code` : c'est la forme que le
-- contrôle de parité TS/SQL (`permissions.test.ts`) reconnaît.
-- =============================================================================

with nouvelles (
  code, module_code, menu_code, menu_label, menu_order,
  submenu_code, submenu_label, action, label, sensitive, rang
) as (values
  ('pos.sales.view',     'pos', 'sales', 'Ventes', 3,
   null, null, 'VIEW',     'Consulter les ventes',          false, 1),
  ('pos.sales.create',   'pos', 'sales', 'Ventes', 3,
   null, null, 'CREATE',   'Encaisser une vente',           false, 2),
  ('pos.sales.discount', 'pos', 'sales', 'Ventes', 3,
   null, null, 'ADMIN',    'Accorder une remise',           true,  3),
  ('pos.sales.credit',   'pos', 'sales', 'Ventes', 3,
   null, null, 'ADMIN',    'Valider une vente non soldée',  true,  4),
  ('pos.sales.cancel',   'pos', 'sales', 'Ventes', 3,
   null, null, 'CANCEL',   'Annuler une vente',             true,  5),
  ('pos.sales.download', 'pos', 'sales', 'Ventes', 3,
   null, null, 'DOWNLOAD', 'Télécharger un reçu',           true,  6),
  ('pos.sales.print',    'pos', 'sales', 'Ventes', 3,
   null, null, 'PRINT',    'Imprimer un reçu',              true,  7),
  ('pos.sales.export',   'pos', 'sales', 'Ventes', 3,
   null, null, 'EXPORT',   'Exporter les ventes',           true,  8)
)
insert into public.permissions (
  code, module_code, module_label, menu_code, menu_label,
  submenu_code, submenu_label, action, label, is_sensitive,
  module_order, menu_order, submenu_order, action_order
)
select
  n.code,
  n.module_code,
  'Point de vente',
  n.menu_code,
  n.menu_label,
  n.submenu_code,
  n.submenu_label,
  n.action::public.permission_action,
  n.label,
  n.sensitive,
  12,
  n.menu_order,
  n.rang,
  case n.action
    when 'VIEW'     then 1
    when 'CREATE'   then 2
    when 'CANCEL'   then 5
    when 'EXPORT'   then 7
    when 'DOWNLOAD' then 8
    when 'PRINT'    then 9
    when 'ADMIN'    then 10
    else 99
  end
from nouvelles n
on conflict (code) do update set
  module_label  = excluded.module_label,
  menu_label    = excluded.menu_label,
  submenu_code  = excluded.submenu_code,
  submenu_label = excluded.submenu_label,
  label         = excluded.label,
  is_sensitive  = excluded.is_sensitive,
  module_order  = excluded.module_order,
  menu_order    = excluded.menu_order,
  submenu_order = excluded.submenu_order,
  action_order  = excluded.action_order;


-- =============================================================================
-- 3. CONTRÔLES — le total du catalogue n'est affirmé QU'ICI (DEC-046)
-- =============================================================================

do $$
declare
  v_total     int;
  v_attendu   text[] := array[
    -- LOT 27
    'pos.registers.view', 'pos.registers.create', 'pos.registers.update', 'pos.registers.archive',
    'pos.sessions.view', 'pos.sessions.amounts.view', 'pos.sessions.open',
    'pos.sessions.close', 'pos.sessions.export',
    -- LOT 28
    'pos.sales.view', 'pos.sales.create', 'pos.sales.discount', 'pos.sales.credit',
    'pos.sales.cancel', 'pos.sales.download', 'pos.sales.print', 'pos.sales.export'
  ];
  v_manquantes text[];
  v_inconnues  text[];
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 246 then
    raise exception 'Catalogue attendu à 246 permissions, obtenu %.', v_total;
  end if;

  select array_agg(c) into v_manquantes
  from unnest(v_attendu) c
  where not exists (select 1 from public.permissions p where p.code = c);
  if v_manquantes is not null then
    raise exception 'Capacités du point de vente absentes : %', v_manquantes;
  end if;

  -- AUCUNE capacité inventée sous `pos` (CLAUDE.md §19 bis, Plan 02 §10.3).
  select array_agg(p.code) into v_inconnues
  from public.permissions p
  where p.module_code = 'pos' and not (p.code = any (v_attendu));
  if v_inconnues is not null then
    raise exception 'Capacité créée sans fonctionnalité correspondante : %', v_inconnues;
  end if;

  -- Sensibilité : Plan 02 §10.2, mot pour mot — seuls `view` et `create` ne le sont pas.
  if exists (
    select 1 from public.permissions
    where module_code = 'pos' and menu_code = 'sales'
      and is_sensitive is distinct from (code not in ('pos.sales.view', 'pos.sales.create'))
  ) then
    raise exception 'La sensibilité des capacités de vente ne suit pas le Plan 02 §10.2.';
  end if;

  if (select action from public.permissions where code = 'pos.sales.discount') <> 'ADMIN'
     or (select action from public.permissions where code = 'pos.sales.credit') <> 'ADMIN'
     or (select action from public.permissions where code = 'pos.sales.cancel') <> 'CANCEL'
     or (select action from public.permissions where code = 'pos.sales.download') <> 'DOWNLOAD' then
    raise exception 'Une action de capacité de vente ne suit pas le Plan 02 §10.2.';
  end if;

  if exists (
    select 1 from public.permissions
    where module_code = 'pos' and (module_order <> 12 or module_label <> 'Point de vente')
  ) then
    raise exception 'Le module `pos` n''est pas à l''ordre 12.';
  end if;

  if not exists (
    select 1 from public.numbering_rules
    where entity_key = 'pos_sale' and prefix = 'VTE' and include_year and reset_yearly and padding = 6
  ) then
    raise exception 'La règle de numérotation des ventes est absente ou mal formée.';
  end if;

  raise notice '[OK] 119. Huit capacités de vente, catalogue à 246 ; numérotation VTE.';
end $$;
