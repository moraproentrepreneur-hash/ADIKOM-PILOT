-- =============================================================================
-- ADIKOM PILOT — 074 · Un motif ne se réécrit pas après coup
-- LOT 17, seconde faiblesse de la même famille que la 073
--
-- LE DÉFAUT
--
-- Les gardes d'immuabilité protégeaient les colonnes qui portent l'ARGENT —
-- montant, compte, sens, date — et laissaient libres celles qui portent la
-- JUSTIFICATION :
--
--   `treasury_entries`      description · reference
--   `internal_transfers`    purpose · reference · notes
--   `misc_payments`         external_ref · notes
--
-- Aucun écran ne les modifie, et aucune capacité ne le permet : il n'existe ni
-- `treasury.transfers.update` ni `billing.misc_payments.update`. Mais la policy
-- d'UPDATE, ouverte pour que l'annulation puisse écrire son statut, laissait
-- passer un `PATCH` direct sur ces colonnes.
--
-- POURQUOI CELA COMPTE
--
-- `Module 06` §32 range le MOTIF et la RÉFÉRENCE parmi ce que le système doit
-- CONSERVER d'un virement, au même titre que son auteur et son montant. §34
-- proscrit « la réécriture de l'historique ». Un décaissement dont on peut
-- changer la cause après coup n'est pas traçable : le montant reste juste, et
-- l'explication devient fausse.
--
-- `Module 07` §43 l'énonce pour le paiement divers : « chaque paiement doit
-- être suffisamment documenté ». Une documentation réécrivable ne documente
-- rien.
--
-- CE QUI RESTE ÉCRIVABLE, ET POURQUOI
--
--   · `status`, `validated_at/by`, `cancelled_at/by`, `updated_at/by` — les
--     actes de validation et d'annulation les écrivent.
--   · `status_reason` — c'est le MOTIF DE L'ANNULATION, écrit AU MOMENT de
--     l'annulation. Le figer interdirait l'acte qui le pose.
--
-- Rien d'autre. Une erreur de saisie s'annule, et une opération correcte est
-- enregistrée (`Module 06` §33, `Module 07` §47).
-- =============================================================================

create or replace function public.fn_treasury_entry_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.account_id  is distinct from old.account_id
     or new.amount    is distinct from old.amount
     or new.direction is distinct from old.direction
     or new.kind      is distinct from old.kind
     or new.entry_date is distinct from old.entry_date
     or new.supplier_payment_id  is distinct from old.supplier_payment_id
     or new.customer_payment_id  is distinct from old.customer_payment_id
     or new.internal_transfer_id is distinct from old.internal_transfer_id
     or new.misc_payment_id      is distinct from old.misc_payment_id
     -- Ce qui EXPLIQUE le mouvement se fige comme le mouvement lui-même :
     -- un montant juste sous une cause fausse n'est pas traçable (§32, §34).
     or new.description is distinct from old.description
     or new.reference   is distinct from old.reference then
    raise exception
      'Opération refusée : une écriture financière ne se modifie pas — ni son montant, ni ce qui l''explique. Une correction passe par une opération inverse, jamais par la réécriture de l''historique (Module 06 §34).'
      using errcode = 'check_violation';
  end if;

  -- Une écriture annulée est un état terminal : elle ne revient pas.
  if old.status = 'CANCELLED' and new.status <> 'CANCELLED' then
    raise exception
      'Opération refusée : une écriture annulée ne se réactive pas.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_treasury_entry_immutable is
  'Une écriture est immuable — montant, compte, sens, date ET justification (§32, §34). Seul son statut suit l''opération qui l''a produite.';


create or replace function public.fn_internal_transfer_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    case
      when old.status = 'DRAFT' and new.status = 'VALIDATED' then
        perform public.require_capability(
          array['treasury.transfers.validate'], 'valider un virement interne'
        );

      when old.status in ('DRAFT', 'VALIDATED') and new.status = 'CANCELLED' then
        perform public.require_capability(
          array['treasury.transfers.cancel'], 'annuler un virement interne'
        );

      else
        raise exception
          'Transition de virement refusée : % ne peut pas devenir %.', old.status, new.status
          using errcode = 'check_violation';
    end case;
  end if;

  /*
   * §33 : « Un virement déjà enregistré ne doit pas être simplement supprimé. »
   * Il ne se réécrit pas davantage — ni ce qu'il déplace, ni POURQUOI il le
   * déplace. §32 range le motif et la référence parmi ce que le système doit
   * conserver, au même titre que le montant.
   *
   * `status_reason` reste écrivable : c'est le motif de l'ANNULATION, posé par
   * l'acte d'annuler.
   */
  if new.source_account_id      is distinct from old.source_account_id
     or new.destination_account_id is distinct from old.destination_account_id
     or new.amount               is distinct from old.amount
     or new.currency_code        is distinct from old.currency_code
     or new.transfer_date        is distinct from old.transfer_date
     or new.transfer_no          is distinct from old.transfer_no
     or new.purpose              is distinct from old.purpose
     or new.reference            is distinct from old.reference
     or new.notes                is distinct from old.notes then
    raise exception
      'Opération refusée : un virement ne se modifie pas — ni son montant, ni son motif. Il s''annule, et un virement correct est enregistré (Module 06 §32, §33).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_internal_transfer_transition is
  'Brouillon → Validé → Annulé, chaque passage sous SA capacité. Comptes, montant, date ET justification sont figés dès la saisie (§32, §33).';


create or replace function public.fn_misc_payment_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    case
      when old.status = 'DRAFT' and new.status = 'VALIDATED' then
        perform public.require_capability(
          array['billing.misc_payments.validate'], 'valider un paiement divers'
        );

      when old.status in ('DRAFT', 'VALIDATED') and new.status = 'CANCELLED' then
        perform public.require_capability(
          array['billing.misc_payments.cancel'], 'annuler un paiement divers'
        );

      else
        raise exception
          'Transition de paiement divers refusée : % ne peut pas devenir %.', old.status, new.status
          using errcode = 'check_violation';
    end case;
  end if;

  /*
   * Aucune modification : `billing.misc_payments.update` n'existe pas au
   * catalogue. §43 exige que chaque paiement soit « suffisamment documenté » —
   * une documentation réécrivable après coup ne documente rien.
   */
  if new.account_id    is distinct from old.account_id
     or new.amount      is distinct from old.amount
     or new.paid_on     is distinct from old.paid_on
     or new.category    is distinct from old.category
     or new.beneficiary is distinct from old.beneficiary
     or new.purpose     is distinct from old.purpose
     or new.payment_no  is distinct from old.payment_no
     or new.external_ref is distinct from old.external_ref
     or new.notes        is distinct from old.notes then
    raise exception
      'Opération refusée : un paiement divers ne se modifie pas — ni son montant, ni ce qui le justifie. Il s''annule, et un paiement correct est enregistré (Module 07 §43, §47).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_misc_payment_transition is
  'Brouillon → Validé → Annulé, chaque passage sous SA capacité. Aucune modification : le catalogue n''expose pas `update`, et §43 exige une documentation stable.';


do $$
declare v_total int;
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 171 then
    raise exception 'Catalogue attendu à 171 permissions, obtenu %.', v_total;
  end if;
end $$;
