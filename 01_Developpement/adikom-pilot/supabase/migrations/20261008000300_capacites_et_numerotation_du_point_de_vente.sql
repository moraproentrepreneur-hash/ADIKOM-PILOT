-- =============================================================================
-- ADIKOM PILOT — 110 · Point de vente : capacités et numérotation
-- LOT 27 — Plan 02 §10.2, §10.3 · décision C-27 (8 octobre 2026) · Module 12 §7
--
-- MODULE `pos`, ORDRE 12, libellé « Point de vente ». Deux menus :
--
--   `registers` (1) « Caisses »               view · create · update · archive
--   `sessions`  (2) « Sessions de caisse »    view · open · close · export✓
--                    └ sous-menu `amounts` « Montants de session » : view✓
--
-- 🟥 `pos.sessions.amounts.view` EST LA CAPACITÉ LA PLUS IMPORTANTE DU LOT
-- (Plan 02 §10.2) : un responsable de planning doit savoir QUI était en caisse
-- sans voir COMBIEN il y avait dedans. C'est elle qui donne à
-- `pos.sessions.view` sa raison d'être. Un caissier voit SES montants sans elle
-- (B-13) : la policy par ligne de la migration 108 le permet.
--
-- C-27 — LES NEUF, TELLES QUELLES. AUCUNE AUTRE :
--   · pas de `pos.sessions.variance.view` — l'écart est la soustraction de deux
--     montants qu'`amounts.view` ouvre déjà (Plan 02 §10.3) ;
--   · pas de `download` ni de `print` — aucun document de session n'est prévu ;
--   · pas de `pos.sales.*` — LOT 28.
--
-- B-12 — AUCUNE AFFECTATION AUTOMATIQUE aux groupes système : attribution
-- manuelle, comme aux LOT 25 et 26.
--
-- Catalogue : 229 → 238.
-- =============================================================================


-- =============================================================================
-- 1. LES NEUF CAPACITÉS
--
-- La liste de colonnes ouvre par `(code, module_code` : c'est la forme que le
-- contrôle de parité TS/SQL (`permissions.test.ts`) reconnaît.
-- =============================================================================

with nouvelles (
  code, module_code, menu_code, menu_label, menu_order,
  submenu_code, submenu_label, action, label, sensitive, rang
) as (values
  ('pos.registers.view',        'pos', 'registers', 'Caisses', 1,
   null, null, 'VIEW',     'Consulter les caisses',                   false, 1),
  ('pos.registers.create',      'pos', 'registers', 'Caisses', 1,
   null, null, 'CREATE',   'Déclarer une caisse',                     false, 2),
  ('pos.registers.update',      'pos', 'registers', 'Caisses', 1,
   null, null, 'UPDATE',   'Modifier une caisse',                     false, 3),
  ('pos.registers.archive',     'pos', 'registers', 'Caisses', 1,
   null, null, 'ARCHIVE',  'Désactiver / réactiver une caisse',       false, 4),

  ('pos.sessions.view',         'pos', 'sessions', 'Sessions de caisse', 2,
   null, null, 'VIEW',     'Consulter les sessions, sans leurs montants', false, 1),
  ('pos.sessions.open',         'pos', 'sessions', 'Sessions de caisse', 2,
   null, null, 'CREATE',   'Ouvrir une session de caisse',            false, 2),
  ('pos.sessions.close',        'pos', 'sessions', 'Sessions de caisse', 2,
   null, null, 'VALIDATE', 'Clôturer une session de caisse',          false, 3),
  ('pos.sessions.export',       'pos', 'sessions', 'Sessions de caisse', 2,
   null, null, 'EXPORT',   'Exporter la liste des sessions',          true,  4),
  ('pos.sessions.amounts.view', 'pos', 'sessions', 'Sessions de caisse', 2,
   'amounts', 'Montants de session', 'VIEW', 'Voir les montants de toutes les sessions', true, 5)
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
    when 'UPDATE'   then 3
    when 'VALIDATE' then 4
    when 'ARCHIVE'  then 6
    when 'EXPORT'   then 7
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
-- 2. NUMÉROTATION — CAI ET SES, AUCUN SECOND NUMÉROTEUR
--
-- Plan 01 §16.1 et §16.9 : `CAI-000001`, `SES-2026-000001`.
--
-- La caisse ne porte PAS d'année : c'est un équipement durable, non un acte
-- daté — comme un compte financier (`COMP-000001`). La session en porte une, et
-- repart à 1 chaque exercice comorien, comme toute pièce datée.
-- =============================================================================

insert into public.numbering_rules
  (entity_key, label, prefix, include_year, padding, separator, reset_yearly, current_value)
values
  ('pos_register', 'Caisse',             'CAI', false, 6, '-', false, 0),
  ('pos_session',  'Session de caisse',  'SES', true,  6, '-', true,  0)
on conflict (entity_key) do nothing;


-- =============================================================================
-- 3. CONTRÔLES — le total du catalogue n'est affirmé QU'ICI (DEC-046)
-- =============================================================================

do $$
declare
  v_total     int;
  v_attendu   text[] := array[
    'pos.registers.view', 'pos.registers.create', 'pos.registers.update', 'pos.registers.archive',
    'pos.sessions.view', 'pos.sessions.amounts.view', 'pos.sessions.open',
    'pos.sessions.close', 'pos.sessions.export'
  ];
  v_manquantes text[];
  v_inconnues  text[];
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 238 then
    raise exception 'Catalogue attendu à 238 permissions, obtenu %.', v_total;
  end if;

  select array_agg(c) into v_manquantes
  from unnest(v_attendu) c
  where not exists (select 1 from public.permissions p where p.code = c);
  if v_manquantes is not null then
    raise exception 'Capacités du LOT 27 absentes : %', v_manquantes;
  end if;

  -- AUCUNE capacité inventée sous `pos` (CLAUDE.md §19 bis, Plan 02 §10.3).
  select array_agg(p.code) into v_inconnues
  from public.permissions p
  where p.module_code = 'pos' and not (p.code = any (v_attendu));
  if v_inconnues is not null then
    raise exception 'Capacité créée sans fonctionnalité correspondante : %', v_inconnues;
  end if;

  -- Les deux capacités sensibles, et elles seules.
  if exists (
    select 1 from public.permissions
    where module_code = 'pos'
      and is_sensitive is distinct from (code in ('pos.sessions.amounts.view', 'pos.sessions.export'))
  ) then
    raise exception 'La sensibilité des capacités du point de vente ne suit pas le Plan 02 §10.2.';
  end if;

  if exists (
    select 1 from public.permissions
    where module_code = 'pos' and (module_order <> 12 or module_label <> 'Point de vente')
  ) then
    raise exception 'Le module `pos` n''est pas à l''ordre 12.';
  end if;

  -- L'ordre 12 est libre : aucun autre module ne le porte.
  if exists (
    select 1 from public.permissions where module_order = 12 and module_code <> 'pos'
  ) then
    raise exception 'L''ordre 12 est déjà porté par un autre module.';
  end if;

  if not exists (
    select 1 from public.numbering_rules
    where entity_key = 'pos_register' and prefix = 'CAI' and not include_year and padding = 6
  ) or not exists (
    select 1 from public.numbering_rules
    where entity_key = 'pos_session' and prefix = 'SES' and include_year and reset_yearly and padding = 6
  ) then
    raise exception 'Une règle de numérotation du point de vente est absente ou mal formée.';
  end if;

  raise notice '[OK] 110. Module pos à l''ordre 12 : 9 capacités, catalogue à 238 ; numérotation CAI et SES.';
end $$;
