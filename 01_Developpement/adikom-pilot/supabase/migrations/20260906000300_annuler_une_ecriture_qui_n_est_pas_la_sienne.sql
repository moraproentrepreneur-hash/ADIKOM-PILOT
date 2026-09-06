-- =============================================================================
-- ADIKOM PILOT — 073 · On n'annule pas l'écriture d'une opération qui n'est pas
--                      la sienne
-- LOT 17, défaut préexistant trouvé à la relecture du lot
--
-- LE DÉFAUT
--
-- La policy d'UPDATE des écritures était une disjonction de CAPACITÉS, sans
-- aucun lien avec l'origine de la ligne visée :
--
--   using (
--     has_permission('billing.supplier_payments.cancel')
--     or has_permission('billing.customer_payments.cancel')
--   )
--
-- Un porteur de `supplier_payments.cancel` pouvait donc, par `PATCH` direct,
-- passer à « Annulée » l'écriture d'un règlement CLIENT — sans toucher au
-- règlement lui-même, qui restait « Validé ».
--
-- Résultat : le solde du compte remontait, la facture restait soldée, et rien
-- n'expliquait l'écart. C'est exactement la situation que `Workflow 08` §45
-- range parmi les incohérences à éviter, prise par l'autre bout : non plus « un
-- paiement annulé continue d'être comptabilisé », mais un paiement VIVANT qui
-- cesse de l'être.
--
-- Le défaut est né au LOT 6, s'est élargi au LOT 8, et le LOT 17 l'aurait
-- élargi de deux capacités de plus — `treasury.transfers.cancel` et
-- `billing.misc_payments.cancel` — chacune ouvrant les écritures des trois
-- autres domaines.
--
-- POURQUOI AUCUNE RECETTE NE L'AVAIT VU
--
-- Les recettes éprouvent qu'un acte est REFUSÉ à qui n'a pas la capacité, et
-- POSSIBLE à qui l'a. Ici, les deux tenaient : chaque profil annulait bien son
-- propre règlement. Ce qu'aucune n'essayait, c'était d'annuler l'écriture d'un
-- domaine VOISIN — le seul geste que la policy laissait passer.
--
-- LA CORRECTION
--
-- La capacité doit correspondre à L'ORIGINE de l'écriture visée. C'est déjà la
-- règle de la policy d'INSERT (DEC-029 §f) : l'écriture suit la capacité de
-- l'opération qui la produit. Elle vaut à l'identique pour la défaire.
--
-- Une écriture LIBRE — sans origine — devient non modifiable : aucun écran n'en
-- produit, `treasury.entries.create` n'a pas de capacité d'annulation au
-- catalogue, et lui en inventer une par la bande serait exactement ce que
-- DEC-024 écarte.
-- =============================================================================

drop policy if exists treasury_entries_update on public.treasury_entries;

create policy treasury_entries_update on public.treasury_entries
  for update to authenticated
  using (
    (supplier_payment_id is not null
      and (select public.has_permission('billing.supplier_payments.cancel')))
    or (customer_payment_id is not null
      and (select public.has_permission('billing.customer_payments.cancel')))
    or (internal_transfer_id is not null
      and (select public.has_permission('treasury.transfers.cancel')))
    or (misc_payment_id is not null
      and (select public.has_permission('billing.misc_payments.cancel')))
  )
  with check (
    (supplier_payment_id is not null
      and (select public.has_permission('billing.supplier_payments.cancel')))
    or (customer_payment_id is not null
      and (select public.has_permission('billing.customer_payments.cancel')))
    or (internal_transfer_id is not null
      and (select public.has_permission('treasury.transfers.cancel')))
    or (misc_payment_id is not null
      and (select public.has_permission('billing.misc_payments.cancel')))
  );

comment on table public.treasury_entries is
  'Mouvements financiers d''un compte (Module 06 §18). Une écriture ne se modifie ni ne se supprime : elle s''annule avec l''opération qui l''a produite, et sous LA capacité de cette opération.';


do $$
declare v_total int;
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 171 then
    raise exception 'Catalogue attendu à 171 permissions, obtenu %.', v_total;
  end if;
end $$;
