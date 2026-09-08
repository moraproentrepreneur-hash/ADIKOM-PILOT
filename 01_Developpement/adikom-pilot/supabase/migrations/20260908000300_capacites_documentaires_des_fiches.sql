-- =============================================================================
-- ADIKOM PILOT — 078 · Les capacités documentaires des fiches restantes
-- Ajustement fonctionnel du 08/09/2026 — DEC-042 §c
--
-- CE QU'ADIKOM A DEMANDÉ
--
-- Quatre fiches n'offraient aucune barre d'actions documentaire, là où le client,
-- le fournisseur, le partenaire, le véhicule et la tarification en ont une :
--
--   · la RÉSERVATION ;
--   · la FACTURE CLIENT ;
--   · la FACTURE FOURNISSEUR ;
--   · le PAIEMENT DIVERS.
--
-- L'expérience doit être homogène : ouvrir une fiche métier, c'est retrouver
-- « Aperçu · Télécharger PDF · Imprimer · Modifier ».
--
-- SEPT CAPACITÉS, PAS UNE DE PLUS — DEC-024
--
--   `rental.reservations.download`      `rental.reservations.print`
--   `billing.customer_invoices.download`
--   `billing.supplier_invoices.download` `billing.supplier_invoices.print`
--   `billing.misc_payments.download`     `billing.misc_payments.print`
--
-- `billing.customer_invoices.print` EXISTE déjà, depuis la migration 007 : elle
-- attendait son document. Elle n'est pas recréée — un code attribué ne se touche
-- pas. Seul son compagnon de téléchargement manquait.
--
-- Catalogue : 171 → 178.
--
-- POURQUOI LES DEUX CAPACITÉS DE RÉSERVATION REVIENNENT
--
-- La migration 037 les avait RETIRÉES, avec ce motif : « aucun document de
-- réservation n'existe. Une réservation n'est pas une pièce remise au client. »
-- Le raisonnement était juste tant qu'aucun document n'était produit : une
-- permission qui ne débloque rien ne doit pas être attribuable (CLAUDE.md §19
-- bis).
--
-- ADIKOM demande aujourd'hui cette pièce (DEC-042 §c) : une CONFIRMATION DE
-- RÉSERVATION, remise au client, portant l'engagement — période, véhicule ou
-- catégorie, tarif verrouillé le cas échéant. Le motif du retrait tombe donc
-- avec le fait qui le fondait. Les codes reviennent à l'identique : ils n'ont
-- jamais changé de sens, et aucun autre code ne les a remplacés entre-temps.
--
-- CE QUE CES CAPACITÉS N'OUVRENT PAS
--
-- Rien. La route documentaire exige la capacité de CONSULTER la ressource EN
-- PLUS de la capacité documentaire (migration 026, route `/api/documents`) :
-- `download` n'est jamais une porte dérobée sur une fiche qu'on n'a pas le droit
-- de voir. Et l'inverse reste vrai : `view` n'autorise ni à télécharger ni à
-- imprimer.
--
-- Toutes sont SENSIBLES : ces pièces sortent du système en portant l'identité
-- d'un tiers et des montants (Règles permissions §28, §71).
-- =============================================================================


-- =============================================================================
-- 1. LES SEPT CAPACITÉS
--
-- La liste de colonnes ouvre par `(code, module_code` : c'est la forme que le
-- contrôle de parité TS/SQL (`permissions.test.ts`) reconnaît pour rejouer le
-- catalogue sans interpréter du SQL.
-- =============================================================================

with nouvelles (
  code, module_code, menu_code, submenu_code, submenu_label, action, label, rang
) as (values
  -- === Location · Réservations ==============================================
  ('rental.reservations.download', 'rental', 'reservations', null, null,
   'DOWNLOAD', 'Télécharger la confirmation de réservation en PDF', 1),
  ('rental.reservations.print', 'rental', 'reservations', null, null,
   'PRINT', 'Imprimer la confirmation de réservation', 2),

  -- === Facturation · Factures clients =======================================
  -- `billing.customer_invoices.print` existe depuis la migration 007.
  ('billing.customer_invoices.download', 'billing', 'customer_invoices', 'list', 'Liste',
   'DOWNLOAD', 'Télécharger une facture client en PDF', 3),

  -- === Facturation · Factures fournisseurs ==================================
  ('billing.supplier_invoices.download', 'billing', 'supplier_invoices', 'list', 'Liste',
   'DOWNLOAD', 'Télécharger une facture fournisseur en PDF', 4),
  ('billing.supplier_invoices.print', 'billing', 'supplier_invoices', 'list', 'Liste',
   'PRINT', 'Imprimer une facture fournisseur', 5),

  -- === Facturation · Paiements divers =======================================
  ('billing.misc_payments.download', 'billing', 'misc_payments', null, null,
   'DOWNLOAD', 'Télécharger le reçu d''un paiement divers en PDF', 6),
  ('billing.misc_payments.print', 'billing', 'misc_payments', null, null,
   'PRINT', 'Imprimer le reçu d''un paiement divers', 7)
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
  -- Une pièce qui sort du système en portant l'identité d'un tiers et des
  -- montants : sensible, comme toutes les capacités documentaires (DEC-024).
  true,
  ref.module_order,
  ref.menu_order,
  ref.last_order + n.rang,
  case n.action
    when 'EXPORT'   then 7
    when 'DOWNLOAD' then 8
    when 'PRINT'    then 9
    else 99
  end
from nouvelles n
join lateral (
  select
    p.module_label,
    p.menu_label,
    p.module_order,
    p.menu_order,
    max(p.submenu_order) over () as last_order
  from public.permissions p
  where p.module_code = n.module_code
    and p.menu_code   = n.menu_code
  limit 1
) ref on true
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
-- 2. CONTRÔLES DE NON-RÉGRESSION
-- =============================================================================

do $$
declare
  v_total   int;
  v_missing text[];
  v_soft    text[];
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 178 then
    raise exception 'Catalogue attendu à 178 permissions, obtenu %.', v_total;
  end if;

  select array_agg(c) into v_missing
  from unnest(array[
    'rental.reservations.download',
    'rental.reservations.print',
    'billing.customer_invoices.download',
    'billing.customer_invoices.print',
    'billing.supplier_invoices.download',
    'billing.supplier_invoices.print',
    'billing.misc_payments.download',
    'billing.misc_payments.print'
  ]) c
  where not exists (select 1 from public.permissions p where p.code = c);

  if v_missing is not null then
    raise exception 'Capacités documentaires absentes du catalogue : %.',
      array_to_string(v_missing, ', ');
  end if;

  /*
   * Les sept nouvelles doivent être SENSIBLES.
   *
   * Le contrôle ne porte pas sur toutes les capacités documentaires du
   * catalogue : `rental.fleet.download` et `rental.fleet.print` ne le sont
   * délibérément pas — « l'identification d'un véhicule ne l'est pas »
   * (migration 026). Les élever ici modifierait un arbitrage rendu ailleurs.
   */
  select array_agg(p.code) into v_soft
  from public.permissions p
  where p.code in (
    'rental.reservations.download', 'rental.reservations.print',
    'billing.customer_invoices.download',
    'billing.supplier_invoices.download', 'billing.supplier_invoices.print',
    'billing.misc_payments.download', 'billing.misc_payments.print'
  )
    and p.is_sensitive is not true;

  if v_soft is not null then
    raise exception 'Capacités documentaires non sensibles : %.',
      array_to_string(v_soft, ', ');
  end if;
end $$;
