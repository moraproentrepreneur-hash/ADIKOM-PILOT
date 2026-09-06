-- =============================================================================
-- ADIKOM PILOT — 072 · Annuler une écriture n'est pas la recréer
-- LOT 17, défaut trouvé par `db:verify:transfers` avant livraison
--
-- LE DÉFAUT
--
-- `fn_treasury_entry_source` s'exécute `before insert OR UPDATE`. La migration
-- 071 y a ajouté, pour les deux nouvelles origines, la condition « l'opération
-- dont l'écriture se réclame doit être VALIDÉE » — juste, à la création.
--
-- Elle ne l'est plus à l'annulation. `cancel_internal_transfer` passe d'abord le
-- virement à « Annulé », puis met ses deux écritures à « Annulée ». Cet `UPDATE`
-- rejouait le contrôle, lisait un virement désormais annulé, et refusait :
--
--   « un virement ne produit ses écritures qu'à sa VALIDATION »
--
-- L'annulation devenait impossible. La recette l'a arrêtée au contrôle 11.
--
-- LA CORRECTION
--
-- L'état de l'origine n'est contrôlé qu'à l'INSERTION. Sur `UPDATE`, il n'y a
-- rien à contrôler : `fn_treasury_entry_immutable` fige déjà l'origine, le
-- compte, le montant, le sens, le genre et la date. Seul le statut change, et
-- seulement pour suivre l'opération.
--
-- Le reste du contrôle — compte, montant, sens — demeure sur les deux
-- opérations : il est vrai dans les deux cas, et le laisser garde la barrière
-- entière si une colonne devenait un jour modifiable.
-- =============================================================================

create or replace function public.fn_treasury_entry_source()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  sp public.supplier_payments%rowtype;
  cp public.customer_payments%rowtype;
  tr public.internal_transfers%rowtype;
  mp public.misc_payments%rowtype;
begin
  if (case when new.supplier_payment_id  is not null then 1 else 0 end)
   + (case when new.customer_payment_id  is not null then 1 else 0 end)
   + (case when new.internal_transfer_id is not null then 1 else 0 end)
   + (case when new.misc_payment_id      is not null then 1 else 0 end) > 1 then
    raise exception
      'Opération refusée : une écriture ne provient que d''une seule opération (Module 06 §20).'
      using errcode = 'check_violation';
  end if;

  if new.supplier_payment_id is null
     and new.customer_payment_id is null
     and new.internal_transfer_id is null
     and new.misc_payment_id is null then
    if new.kind in ('SUPPLIER_PAYMENT', 'CUSTOMER_PAYMENT', 'MISC_PAYMENT', 'TRANSFER') then
      raise exception
        'Opération refusée : une écriture de règlement, de paiement divers ou de virement doit désigner l''opération dont elle provient (Module 06 §20).'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.supplier_payment_id is not null then
    select * into sp from public.supplier_payments where id = new.supplier_payment_id;

    if not found then
      raise exception
        'Le règlement dont se réclame cette écriture est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;

    if new.kind <> 'SUPPLIER_PAYMENT'
       or new.direction <> 'OUT'
       or new.amount is distinct from sp.amount
       or new.account_id is distinct from sp.account_id then
      raise exception
        'Opération refusée : cette écriture ne correspond pas au règlement dont elle se réclame. Un règlement fournisseur est une SORTIE, du montant réglé, sur le compte mouvementé (Workflow 08 §47).'
        using errcode = 'check_violation';
    end if;

    return new;
  end if;

  if new.customer_payment_id is not null then
    select * into cp from public.customer_payments where id = new.customer_payment_id;

    if not found then
      raise exception
        'Le règlement dont se réclame cette écriture est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;

    if new.kind <> 'CUSTOMER_PAYMENT'
       or new.direction <> 'IN'
       or new.amount is distinct from cp.amount
       or new.account_id is distinct from cp.account_id then
      raise exception
        'Opération refusée : cette écriture ne correspond pas au règlement dont elle se réclame. Un encaissement client est une ENTRÉE, du montant reçu, sur le compte mouvementé (Workflow 08 §47).'
        using errcode = 'check_violation';
    end if;

    return new;
  end if;

  if new.misc_payment_id is not null then
    select * into mp from public.misc_payments where id = new.misc_payment_id;

    if not found then
      raise exception
        'Le paiement divers dont se réclame cette écriture est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;

    -- À la CRÉATION seulement : une écriture ne devance pas la validation.
    -- Sur `UPDATE`, l'écriture ne fait que suivre l'annulation du paiement.
    if tg_op = 'INSERT' and mp.status <> 'VALIDATED' then
      raise exception
        'Opération refusée : un paiement divers ne produit son écriture qu''à sa VALIDATION. Un brouillon ne déplace aucun fonds (Module 07 §45, §46).'
        using errcode = 'check_violation';
    end if;

    if new.kind <> 'MISC_PAYMENT'
       or new.direction <> 'OUT'
       or new.amount is distinct from mp.amount
       or new.account_id is distinct from mp.account_id then
      raise exception
        'Opération refusée : cette écriture ne correspond pas au paiement divers dont elle se réclame. Un paiement divers est une SORTIE, du montant payé, sur le compte source (Module 07 §45).'
        using errcode = 'check_violation';
    end if;

    return new;
  end if;

  -- --- Virement interne ------------------------------------------------------
  select * into tr from public.internal_transfers where id = new.internal_transfer_id;

  if not found then
    raise exception
      'Le virement dont se réclame cette écriture est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if tg_op = 'INSERT' and tr.status <> 'VALIDATED' then
    raise exception
      'Opération refusée : un virement ne produit ses écritures qu''à sa VALIDATION. Un brouillon ne déplace aucun fonds (Module 06 §31).'
      using errcode = 'check_violation';
  end if;

  if new.kind <> 'TRANSFER' or new.amount is distinct from tr.amount then
    raise exception
      'Opération refusée : cette écriture ne correspond pas au virement dont elle se réclame. Les deux moitiés portent le montant transféré (Module 06 §31).'
      using errcode = 'check_violation';
  end if;

  if not (
       (new.account_id = tr.source_account_id      and new.direction = 'OUT')
    or (new.account_id = tr.destination_account_id and new.direction = 'IN')
  ) then
    raise exception
      'Opération refusée : un virement sort du compte source et entre sur le compte destination (Module 06 §31). Aucun autre mouvement ne s''y rattache.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_treasury_entry_source is
  'Une écriture issue d''une opération en reprend le compte, le montant et le sens (§20, §31, §47). L''état de l''origine n''est exigé qu''à la création : ensuite, l''écriture ne fait que suivre.';


do $$
declare v_total int;
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 171 then
    raise exception 'Catalogue attendu à 171 permissions, obtenu %.', v_total;
  end if;
end $$;
