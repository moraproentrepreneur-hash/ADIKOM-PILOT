-- =============================================================================
-- ADIKOM PILOT — 043 · Consulter le coût d'une maintenance
-- Étape 2.4, LOT 3 — arbitrage ADIKOM du 28 août 2026 (point L1)
--
-- POURQUOI CETTE PERMISSION, ET POURQUOI UNE SEULE
--
-- Le catalogue sépare partout la lecture des montants de la lecture du reste :
-- `rental.rentals.financial.view`, `parties.suppliers.financial.view`,
-- `dashboard.financial.view`. La maintenance n'avait que l'ÉCRITURE —
-- `rental.maintenance.cost.update`, « Saisir le coût et le montant imputable ».
-- Personne ne disait qui avait le droit de VOIR un coût.
--
-- Sans elle, deux issues également mauvaises : ou bien tout exploitant capable
-- de consulter une intervention en connaît le prix, ou bien il faudrait faire
-- de la capacité d'écriture un droit de lecture — ce que DEC-024 interdit
-- explicitement, consulter et modifier étant deux capacités distinctes.
--
-- Catalogue : 152 → 153. C'est la seule création de ce lot.
--
-- CE QU'ELLE NE COUVRE PAS
--
-- Elle donne à VOIR, rien d'autre : ni saisir un coût (`cost.update`), ni
-- engager une maintenance (`validate`), ni la terminer (`close`), ni imputer
-- (`billing.imputations.*`), ni facturer, ni payer. L'audit 041 a montré ce que
-- coûte une capacité qui en implique une autre ; la recette
-- `verify:capabilities` éprouve chacune de ces frontières.
--
-- SENSIBLE
--
-- Comme les trois autres capacités financières du catalogue : un coût de
-- réparation renseigne sur les conditions consenties par un prestataire, et
-- prépare une imputation à un fournisseur.
-- =============================================================================

with nouvelle (code, module_code, menu_code, submenu_code, submenu_label, action, label, rang) as (values
  ('rental.maintenance.cost.view', 'rental', 'maintenance', 'cost', 'Coûts', 'VIEW',
   'Consulter le coût d''une maintenance', 1)
)
insert into public.permissions (
  code, module_code, module_label, menu_code, menu_label,
  submenu_code, submenu_label, action, label, is_sensitive,
  module_order, menu_order, submenu_order, action_order
)
select
  n.code,
  n.module_code,
  ref.module_label,
  n.menu_code,
  ref.menu_label,
  n.submenu_code,
  n.submenu_label,
  n.action::public.permission_action,
  n.label,
  true,
  ref.module_order,
  ref.menu_order,
  -- Le sous-menu « Coûts » existe déjà : `rental.maintenance.cost.update` y est
  -- rangée. La nouvelle capacité s'y place, avant elle — consulter précède
  -- toujours modifier dans l'arborescence de la fiche utilisateur.
  ref.submenu_order,
  1
from nouvelle n
join lateral (
  select p.module_label, p.menu_label, p.module_order, p.menu_order, p.submenu_order
  from public.permissions p
  where p.code = 'rental.maintenance.cost.update'
  limit 1
) ref on true
on conflict (code) do update set
  module_label  = excluded.module_label,
  menu_label    = excluded.menu_label,
  submenu_label = excluded.submenu_label,
  label         = excluded.label,
  is_sensitive  = excluded.is_sensitive,
  module_order  = excluded.module_order,
  menu_order    = excluded.menu_order,
  submenu_order = excluded.submenu_order,
  action_order  = excluded.action_order;


do $$
declare v_total int;
begin
  select count(*) into v_total from public.permissions;

  if v_total <> 153 then
    raise exception 'Catalogue attendu à 153 permissions, obtenu %.', v_total;
  end if;
end $$;
