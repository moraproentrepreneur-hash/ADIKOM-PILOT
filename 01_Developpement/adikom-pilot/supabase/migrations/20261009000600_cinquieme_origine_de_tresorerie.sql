-- =============================================================================
-- ADIKOM PILOT — 117 · La 5ᵉ origine de trésorerie : le paiement au comptoir
-- LOT 28 — décisions C-2 et T-2 (DEC-055, 8 octobre 2026) · Plan 02 §7.5,
-- §9.2, §16.2 · Module 12 §13
--
-- 🟥 UN ENCAISSEMENT, UNE SEULE ÉCRITURE.
--
-- Tout franc reçu au comptoir a exactement UNE origine de trésorerie : le
-- PAIEMENT PDV. T-2 : une écriture PAR PAIEMENT — jamais une écriture globale
-- par vente —, parce qu'un paiement mixte (espèces + Mvola) entre sur deux
-- comptes distincts (D-3). Le Plan 02 §9.2 nommait `pos_sale_id` ; le principe
-- est le sien, seule la granularité change.
--
-- CE QUI EST RÉVISÉ ENSEMBLE — chacun repris de SA DERNIÈRE VERSION ACTIVE
-- (mémoire du LOT 22 : « une policy réécrite se reprend à sa dernière version ») :
--
--   · `treasury_entries_single_origin`  migration 071 → 5 origines ;
--   · `fn_treasury_entry_source`        migration 077 (`20260908000200`) ;
--   · `fn_treasury_entry_immutable`     migration 074 (`20260906000400`) ;
--   · `fn_treasury_entry_consistent`    migration 071 (`20260906000100`) ;
--   · policy `treasury_entries_insert`  migration 071 ;
--   · policy `treasury_entries_update`  migration 073 (`20260906000300`).
--
-- Les quatre origines existantes sont rendues À L'IDENTIQUE ; seule la 5ᵉ
-- s'ajoute — et, dans la branche du règlement client, le refus du règlement
-- ADOSSÉ (C-2), qui n'a jamais d'écriture.
--
-- 🟥 AUCUNE FONCTION `SECURITY DEFINER`.
-- =============================================================================


-- =============================================================================
-- 1. LA COLONNE, L'ORIGINE UNIQUE, L'UNICITÉ PAR PAIEMENT
-- =============================================================================

alter table public.treasury_entries
  add column if not exists pos_payment_id uuid
    references public.pos_payments (id) on delete restrict;

comment on column public.treasury_entries.pos_payment_id is
  'Origine de l''écriture lorsqu''elle vient d''un paiement reçu au comptoir (5ᵉ origine, C-2 / T-2). Une écriture par paiement, du montant ENCAISSÉ.';

alter table public.treasury_entries
  drop constraint if exists treasury_entries_single_origin;

alter table public.treasury_entries
  add constraint treasury_entries_single_origin check (
    (case when supplier_payment_id  is not null then 1 else 0 end)
  + (case when customer_payment_id  is not null then 1 else 0 end)
  + (case when internal_transfer_id is not null then 1 else 0 end)
  + (case when misc_payment_id      is not null then 1 else 0 end)
  + (case when pos_payment_id       is not null then 1 else 0 end)
    <= 1
  );

/*
 * 🟥 UNE SEULE ÉCRITURE PAR PAIEMENT — sans exception d'état. Un paiement
 * annulé ne produit plus rien (la source l'exige validé) ; l'index peut donc
 * porter sur toutes les écritures, et un second appel ne trouve aucune place.
 */
create unique index if not exists treasury_entries_one_per_pos_payment_idx
  on public.treasury_entries (pos_payment_id)
  where pos_payment_id is not null;


-- =============================================================================
-- 2. UNE ÉCRITURE DIT LA VÉRITÉ SUR SON ORIGINE — migration 077 + 5ᵉ origine
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
  pp public.pos_payments%rowtype;
  v_sale public.pos_sale_status;
begin
  if (case when new.supplier_payment_id  is not null then 1 else 0 end)
   + (case when new.customer_payment_id  is not null then 1 else 0 end)
   + (case when new.internal_transfer_id is not null then 1 else 0 end)
   + (case when new.misc_payment_id      is not null then 1 else 0 end)
   + (case when new.pos_payment_id       is not null then 1 else 0 end) > 1 then
    raise exception
      'Opération refusée : une écriture ne provient que d''une seule opération (Module 06 §20).'
      using errcode = 'check_violation';
  end if;

  if new.supplier_payment_id is null
     and new.customer_payment_id is null
     and new.internal_transfer_id is null
     and new.misc_payment_id is null
     and new.pos_payment_id is null then
    if new.kind in ('SUPPLIER_PAYMENT', 'CUSTOMER_PAYMENT', 'MISC_PAYMENT', 'TRANSFER', 'POS_SALE') then
      raise exception
        'Opération refusée : une écriture de règlement, de paiement divers, de virement ou de vente au comptoir doit désigner l''opération dont elle provient (Module 06 §20).'
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

    /*
     * 🟥 C-2 — UN RÈGLEMENT ADOSSÉ N'A JAMAIS D'ÉCRITURE.
     *
     * Il solde la facture d'une vente avec un paiement DÉJÀ entré en trésorerie
     * par sa propre écriture `POS_SALE`. Une écriture `CUSTOMER_PAYMENT` sur lui
     * compterait deux fois le même argent.
     */
    if cp.pos_payment_id is not null then
      raise exception
        'Opération refusée : ce règlement est adossé à un paiement reçu au comptoir, déjà inscrit en trésorerie. Un encaissement n''a qu''une seule écriture (C-2).'
        using errcode = 'check_violation';
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

  /*
   * 🟥 5ᵉ ORIGINE — LE PAIEMENT REÇU AU COMPTOIR (C-2, T-2).
   *
   * Une ENTRÉE, sur le compte du paiement (D-3), du montant ENCAISSÉ — jamais du
   * montant donné : la monnaie rendue n'est jamais entrée (Plan 02 §7.5). Le
   * paiement et sa vente sont validés à la création, hors restauration.
   */
  if new.pos_payment_id is not null then
    select * into pp from public.pos_payments where id = new.pos_payment_id;

    if not found then
      raise exception
        'Le paiement dont se réclame cette écriture est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;

    if tg_op = 'INSERT' and not public.is_restoring() then
      select s.status into v_sale from public.pos_sales s where s.id = pp.pos_sale_id;

      if pp.status <> 'VALIDATED' or v_sale is distinct from 'VALIDATED' then
        raise exception
          'Opération refusée : seul un paiement validé, d''une vente validée, produit son écriture (C-2).'
          using errcode = 'check_violation';
      end if;
    end if;

    if new.kind <> 'POS_SALE'
       or new.direction <> 'IN'
       or new.amount is distinct from pp.applied_amount
       or new.account_id is distinct from pp.account_id then
      raise exception
        'Opération refusée : cette écriture ne correspond pas au paiement dont elle se réclame. Une vente au comptoir est une ENTRÉE, du montant ENCAISSÉ — jamais du montant donné —, sur le compte du paiement (Plan 02 §7.5).'
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
    -- Une restauration, elle, remet un état déjà advenu (migrations 072 et 075).
    if tg_op = 'INSERT' and mp.status <> 'VALIDATED' and not public.is_restoring() then
      raise exception
        'Opération refusée : un paiement divers ne produit son écriture qu''à sa VALIDATION. Un brouillon ne déplace aucun fonds (Module 07 §45, §46).'
        using errcode = 'check_violation';
    end if;

    /*
     * LE SENS VIENT DU PAIEMENT, JAMAIS D'AILLEURS.
     *
     * Une entrée adossée à un décaissement — ou l'inverse — augmenterait un
     * solde que l'opération devait diminuer. C'est le seul point où le sens
     * peut être trahi : il est vérifié ici, à l'écriture même.
     */
    if new.kind <> 'MISC_PAYMENT'
       or new.direction is distinct from mp.direction
       or new.amount is distinct from mp.amount
       or new.account_id is distinct from mp.account_id then
      raise exception
        'Opération refusée : cette écriture ne correspond pas au paiement divers dont elle se réclame. Elle doit en reprendre le compte, le montant et le SENS (Module 07 §45).'
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

  if tg_op = 'INSERT' and tr.status <> 'VALIDATED' and not public.is_restoring() then
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
  'Une écriture issue d''une opération en reprend le compte, le montant et le sens (§20, §31, §47) ; une vente au comptoir : ENTRÉE de l''ENCAISSÉ sur le compte du paiement (C-2). Un règlement adossé n''a jamais d''écriture. L''état de l''origine n''est exigé qu''à la création, hors restauration.';


-- =============================================================================
-- 3. UNE ÉCRITURE RESTE IMMUABLE — migration 074 + 5ᵉ origine
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
     or new.pos_payment_id       is distinct from old.pos_payment_id
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
  'Une écriture est immuable — montant, compte, sens, date, origine (cinq) ET justification (§32, §34). Seul son statut suit l''opération qui l''a produite.';


-- =============================================================================
-- 4. LA COHÉRENCE — migration 071 + 5ᵉ origine
--
-- Une écriture `POS_SALE` SUIT son paiement : validée tant qu'il l'est, annulée
-- quand il l'est. Sans ce contrôle, un porteur de `pos.sales.cancel` annulerait
-- par `PATCH` direct l'écriture d'un paiement VIVANT — l'argent disparaîtrait du
-- compte, la vente resterait encaissée (le défaut de la migration 073, pris par
-- la 5ᵉ origine).
--
-- Le contrôle lit le PAIEMENT, sous les droits de l'appelant ; les actes exigent
-- `pos.sales.view`. Invisible = refus.
-- =============================================================================

create or replace function public.assert_pos_payment_entry(
  p_payment_id   uuid,
  p_entry_status public.treasury_entry_status
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status public.pos_sale_status;
begin
  select p.status into v_status from public.pos_payments p where p.id = p_payment_id;

  if v_status is null then
    raise exception
      'Opération refusée : le paiement de cette écriture n''est pas lisible, et sa cohérence ne peut donc pas être vérifiée.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_entry_status = 'VALIDATED' and v_status <> 'VALIDATED' then
    raise exception
      'Opération refusée : l''écriture d''un paiement annulé ne reste pas validée. Le compte porterait un encaissement sans cause.'
      using errcode = 'check_violation';
  end if;

  if p_entry_status = 'CANCELLED' and v_status <> 'CANCELLED' then
    raise exception
      'Opération refusée : l''écriture d''un paiement reçu au comptoir ne s''annule qu''avec sa vente (B-10). L''argent sortirait du compte sans que la vente le dise.'
      using errcode = 'check_violation';
  end if;
end;
$$;

comment on function public.assert_pos_payment_entry(uuid, public.treasury_entry_status) is
  'Une écriture POS_SALE suit son paiement : validée avec lui, annulée avec lui (C-2, B-10).';

revoke execute on function public.assert_pos_payment_entry(uuid, public.treasury_entry_status) from public, anon;
grant  execute on function public.assert_pos_payment_entry(uuid, public.treasury_entry_status) to authenticated, service_role;


create or replace function public.fn_treasury_entry_consistent()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.internal_transfer_id is not null then
    perform public.assert_transfer_entries(new.internal_transfer_id);
  elsif new.misc_payment_id is not null then
    perform public.assert_misc_payment_entries(new.misc_payment_id);
  elsif new.pos_payment_id is not null then
    perform public.assert_pos_payment_entry(new.pos_payment_id, new.status);
  end if;
  return null;
end;
$$;

comment on function public.fn_treasury_entry_consistent() is
  'Contrôle différé déclenché depuis l''écriture : virement (deux moitiés), paiement divers (une écriture), paiement au comptoir (l''écriture suit son paiement).';


-- =============================================================================
-- 5. LES POLICIES — reprises de leur dernière version, + 5ᵉ origine
--
-- L'écriture produite SUIT LA CAPACITÉ DE L'ACTE QUI LA PRODUIT (DEC-029 §f) :
-- encaisser une vente (`pos.sales.create`) produit l'entrée ; l'annuler
-- (`pos.sales.cancel`) l'annule. Et la capacité correspond à L'ORIGINE de la
-- ligne visée (migration 073) : `pos.sales.cancel` n'annule l'écriture d'aucun
-- autre domaine.
-- =============================================================================

drop policy if exists treasury_entries_insert on public.treasury_entries;

create policy treasury_entries_insert on public.treasury_entries
  for insert to authenticated
  with check (
    (select public.has_permission('treasury.entries.create'))
    or (
      supplier_payment_id is not null
      and (select public.has_permission('billing.supplier_payments.create'))
    )
    or (
      customer_payment_id is not null
      and (select public.has_permission('billing.customer_payments.create'))
    )
    or (
      internal_transfer_id is not null
      and (select public.has_permission('treasury.transfers.validate'))
    )
    or (
      misc_payment_id is not null
      and (select public.has_permission('billing.misc_payments.validate'))
    )
    or (
      pos_payment_id is not null
      and (select public.has_permission('pos.sales.create'))
    )
  );

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
    or (pos_payment_id is not null
      and (select public.has_permission('pos.sales.cancel')))
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
    or (pos_payment_id is not null
      and (select public.has_permission('pos.sales.cancel')))
  );


-- =============================================================================
-- 6. CONTRÔLES
-- =============================================================================

do $$
declare
  v_def text;
  v_n   int;
begin
  -- La contrainte porte les cinq origines.
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint where conname = 'treasury_entries_single_origin';
  if v_def not like '%supplier_payment_id%' or v_def not like '%customer_payment_id%'
     or v_def not like '%internal_transfer_id%' or v_def not like '%misc_payment_id%'
     or v_def not like '%pos_payment_id%' then
    raise exception 'L''origine unique ne porte pas les cinq colonnes : %', v_def;
  end if;

  -- La source : les quatre origines demeurent, la 5ᵉ s'ajoute, le règlement
  -- adossé est refusé — et les acquis 072, 075, 077 sont là.
  v_def := pg_get_functiondef('public.fn_treasury_entry_source()'::regprocedure);
  if v_def not like '%pos_payment_id%' or v_def not like '%POS_SALE%'
     or v_def not like '%applied_amount%'
     or v_def not like '%cp.pos_payment_id is not null%'
     or v_def not like '%SUPPLIER_PAYMENT%' or v_def not like '%MISC_PAYMENT%'
     or v_def not like '%TRANSFER%'
     or v_def not like '%new.direction is distinct from mp.direction%'   -- 077
     or v_def not like '%is_restoring%'                                  -- 075
     or v_def not like '%tg_op = ''INSERT''%' then                       -- 072
    raise exception '`fn_treasury_entry_source` a perdu un acquis, ou ignore la 5ᵉ origine.';
  end if;
  -- 🟥 Jamais le montant DONNÉ.
  if v_def like '%tendered%' then
    raise exception '`fn_treasury_entry_source` mentionne le montant donné : l''écriture porte l''encaissé.';
  end if;

  v_def := pg_get_functiondef('public.fn_treasury_entry_immutable()'::regprocedure);
  if v_def not like '%pos_payment_id%' or v_def not like '%new.description%'
     or v_def not like '%misc_payment_id%' then
    raise exception '`fn_treasury_entry_immutable` a perdu un acquis, ou ignore la 5ᵉ origine.';
  end if;

  v_def := pg_get_functiondef('public.fn_treasury_entry_consistent()'::regprocedure);
  if v_def not like '%assert_transfer_entries%' or v_def not like '%assert_misc_payment_entries%'
     or v_def not like '%assert_pos_payment_entry%' then
    raise exception '`fn_treasury_entry_consistent` a perdu un acquis, ou ignore la 5ᵉ origine.';
  end if;

  -- Les policies : cinq origines chacune, en sous-select.
  select with_check into v_def from pg_policies
  where tablename = 'treasury_entries' and policyname = 'treasury_entries_insert';
  if v_def not like '%pos.sales.create%' or v_def not like '%billing.misc_payments.validate%'
     or v_def not like '%treasury.entries.create%' then
    raise exception 'La policy d''insertion des écritures est incomplète.';
  end if;

  select qual into v_def from pg_policies
  where tablename = 'treasury_entries' and policyname = 'treasury_entries_update';
  if v_def not like '%pos.sales.cancel%' or v_def not like '%pos_payment_id IS NOT NULL%'
     or v_def not like '%misc_payment_id IS NOT NULL%' then
    raise exception 'La policy de modification des écritures ne lie pas la capacité à l''origine (073).';
  end if;

  if not exists (select 1 from pg_indexes where indexname = 'treasury_entries_one_per_pos_payment_idx') then
    raise exception 'L''unicité « une écriture par paiement » est absente.';
  end if;

  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and p.proname in ('fn_treasury_entry_source', 'fn_treasury_entry_immutable',
                      'fn_treasury_entry_consistent', 'assert_pos_payment_entry');
  if v_n > 0 then
    raise exception 'Une fonction de trésorerie est SECURITY DEFINER (D4).';
  end if;

  raise notice '[OK] 117. 5ᵉ origine : une écriture POS_SALE par paiement, de l''encaissé ; règlement adossé sans écriture.';
end $$;
