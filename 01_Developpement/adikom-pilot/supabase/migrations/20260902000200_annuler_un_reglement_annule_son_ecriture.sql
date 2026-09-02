-- =============================================================================
-- ADIKOM PILOT — 054 · Annuler un règlement doit annuler SON ÉCRITURE
-- Étape 2.5 (DEC-021), correction du LOT 6 découverte par l'audit du LOT 8
--
-- LE DÉFAUT, ET COMMENT IL A ÉTÉ TROUVÉ
--
-- `cancel_supplier_payment` et `cancel_customer_payment` annulent l'écriture
-- produite par le règlement :
--
--   update public.treasury_entries
--      set status = 'CANCELLED'
--    where <origine> = p.id and status = 'VALIDATED';
--
-- Sous RLS, un `UPDATE … WHERE` LIT les lignes qu'il vise : la policy de
-- SELECT de `treasury_entries` s'applique donc, en plus de celle d'UPDATE. Un
-- appelant sans `treasury.entries.view` ne voit AUCUNE écriture — l'`UPDATE`
-- n'en trouve aucune, et ne dit rien.
--
-- Résultat : le règlement passait « Annulé », son écriture restait « Validée »,
-- et le solde du compte CONSERVAIT un mouvement qui n'avait plus de cause.
-- Workflow 08 §45 nomme précisément cette situation parmi les incohérences à
-- éviter : « un paiement annulé continue d'être comptabilisé ».
--
-- L'audit des capacités du LOT 8 l'a révélé : un compte portant exactement
-- `customer_payments.view` et `.cancel` annulait le règlement, et l'écriture
-- restait validée. Le défaut existait à l'identique côté fournisseur depuis le
-- LOT 6 ; il n'avait jamais été vu parce que le profil qui l'éprouvait portait
-- `treasury.entries.view` par ailleurs.
--
-- C'est la « somme muette » du LOT 4, sous une autre forme : une écriture
-- invisible n'est pas une écriture inexistante (DEC-026 §f, migration 050).
--
-- LA CORRECTION
--
-- `treasury.entries.view` est exigée NOMMÉMENT par les deux annulations, avec
-- son motif — on ne défait pas un mouvement qu'on n'a pas le droit de lire. Et
-- l'annulation VÉRIFIE ensuite que l'écriture a bien suivi : si elle n'a pas
-- suivi, la transaction est refusée dans son ensemble, plutôt que de laisser un
-- règlement annulé avec un mouvement vivant.
--
-- Ce n'est pas du zèle : c'est la conséquence assumée du refus de
-- `SECURITY DEFINER` (DEC-022). Une fonction qui s'exécute avec les droits de
-- l'appelant ne peut pas prétendre écrire ce qu'il n'a pas le droit de lire —
-- elle doit REFUSER, jamais réussir à moitié.
-- =============================================================================

create or replace function public.cancel_supplier_payment(
  p_payment_id uuid,
  p_reason     text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  p       public.supplier_payments%rowtype;
  v_left  int;
begin
  perform public.require_capability(
    array['billing.supplier_payments.cancel'], 'annuler un règlement fournisseur'
  );
  perform public.require_capability(
    array['billing.supplier_payments.view'], 'consulter le règlement à annuler'
  );
  -- L'annulation doit défaire l'écriture produite. Sous RLS, la lire est la
  -- condition de pouvoir l'écrire.
  perform public.require_capability(
    array['treasury.entries.view'], 'annuler l''écriture produite par ce règlement'
  );

  select * into p from public.supplier_payments where id = p_payment_id for update;

  if not found then
    raise exception 'Règlement introuvable.' using errcode = 'no_data_found';
  end if;

  if p.status = 'CANCELLED' then
    raise exception
      'Opération refusée : ce règlement est déjà annulé.'
      using errcode = 'check_violation';
  end if;

  update public.supplier_payments
     set status        = 'CANCELLED',
         cancelled_at  = now(),
         cancelled_by  = public.current_actor(),
         status_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_by    = public.current_actor()
   where id = p.id;

  update public.treasury_entries
     set status     = 'CANCELLED',
         updated_by = public.current_actor()
   where supplier_payment_id = p.id
     and status = 'VALIDATED';

  -- Le filet : si une écriture validée subsiste, le solde du compte porterait
  -- un décaissement sans cause. On refuse tout plutôt que de le laisser (§45).
  select count(*) into v_left
  from public.treasury_entries
  where supplier_payment_id = p.id and status = 'VALIDATED';

  if v_left > 0 then
    raise exception
      'Opération refusée : l''écriture produite par ce règlement n''a pas pu être annulée. Le solde du compte porterait un mouvement sans cause (Workflow 08 §45).'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

comment on function public.cancel_supplier_payment is
  'Annule un règlement ET l''écriture qu''il a produite (§28, §29). Exige `treasury.entries.view` : on ne défait pas un mouvement qu''on ne peut pas lire.';


create or replace function public.cancel_customer_payment(
  p_payment_id uuid,
  p_reason     text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  p      public.customer_payments%rowtype;
  v_left int;
begin
  perform public.require_capability(
    array['billing.customer_payments.cancel'], 'annuler un règlement client'
  );
  perform public.require_capability(
    array['billing.customer_payments.view'], 'consulter le règlement à annuler'
  );
  perform public.require_capability(
    array['treasury.entries.view'], 'annuler l''écriture produite par ce règlement'
  );

  select * into p from public.customer_payments where id = p_payment_id for update;

  if not found then
    raise exception 'Règlement introuvable.' using errcode = 'no_data_found';
  end if;

  if p.status = 'CANCELLED' then
    raise exception
      'Opération refusée : ce règlement est déjà annulé.'
      using errcode = 'check_violation';
  end if;

  update public.customer_payments
     set status        = 'CANCELLED',
         cancelled_at  = now(),
         cancelled_by  = public.current_actor(),
         status_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_by    = public.current_actor()
   where id = p.id;

  update public.treasury_entries
     set status     = 'CANCELLED',
         updated_by = public.current_actor()
   where customer_payment_id = p.id
     and status = 'VALIDATED';

  select count(*) into v_left
  from public.treasury_entries
  where customer_payment_id = p.id and status = 'VALIDATED';

  if v_left > 0 then
    raise exception
      'Opération refusée : l''écriture produite par ce règlement n''a pas pu être annulée. Le solde du compte porterait un mouvement sans cause (Workflow 08 §45).'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

comment on function public.cancel_customer_payment is
  'Annule un encaissement ET l''écriture qu''il a produite (§28, §29). Exige `treasury.entries.view` : on ne défait pas un mouvement qu''on ne peut pas lire.';


do $$
declare v_total int;
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 153 then
    raise exception 'Catalogue attendu à 153 permissions, obtenu %.', v_total;
  end if;
end $$;
