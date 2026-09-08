-- =============================================================================
-- ADIKOM PILOT — 077 · Le sens d'un paiement divers
-- Ajustement métier du 08/09/2026 — DEC-042 §b
--
-- LA RÈGLE QUE LE LOT 17 N'AVAIT PAS
--
-- Module 07 §43 décrit le paiement divers comme « un paiement qui n'est pas
-- directement rattaché à une facture client ou fournisseur ». Le LOT 17 l'a
-- implémenté comme un DÉCAISSEMENT, et rien d'autre : une sortie de trésorerie.
--
-- ADIKOM tranche (DEC-042 §b) : un paiement divers peut aller dans les DEUX
-- SENS.
--
--   ENCAISSEMENT   une entrée : le compte AUGMENTE
--   DÉCAISSEMENT   une sortie : le compte DIMINUE
--
-- Ce n'est pas un confort d'écran. Le sens décide de ce que fait l'écriture au
-- solde d'un compte : le porter dans la donnée est la seule façon d'en répondre.
--
-- CE QUE CETTE MIGRATION FAIT
--
--   1. une colonne `direction` sur `misc_payments`, du même type que celui des
--      écritures — `public.treasury_direction` : le sens s'exprime dans un seul
--      vocabulaire, jamais deux ;
--   2. le sens est FIGÉ dès la saisie, comme le montant, le compte et la date ;
--   3. l'écriture produite à la validation reprend CE sens, et le déclencheur
--      d'origine refuse toute autre combinaison ;
--   4. le contrôle différé compte l'écriture attendue DANS LE BON SENS.
--
-- LES DONNÉES EXISTANTES NE BOUGENT PAS
--
-- `default 'OUT'` : les paiements divers déjà enregistrés — dont ceux du jeu de
-- démonstration — restent exactement ce qu'ils étaient, des décaissements. Aucun
-- solde ne change, aucune écriture n'est réécrite. La valeur par défaut est
-- CONSERVÉE sur la colonne : elle décrit ce qu'était le paiement divers avant
-- cette migration, et un appel qui omettrait le sens obtiendrait le comportement
-- d'hier plutôt qu'une erreur — mais l'acte `create_misc_payment`, lui, EXIGE le
-- sens (voir §5).
--
-- CE QUE CETTE MIGRATION NE FAIT PAS
--
--   · AUCUNE permission créée. Saisir un encaissement divers et saisir un
--     décaissement divers sont le même acte, sur le même objet, dans le même
--     menu : `billing.misc_payments.create` les couvre tous deux. En créer deux
--     surchargerait le catalogue sans qu'ADIKOM ait à arbitrer quoi que ce soit
--     (CLAUDE.md §19 bis).
--   · AUCUN contrôle de solde à la validation d'un décaissement : la
--     documentation ne pose ce contrôle que pour le virement (Module 06 §30,
--     DEC-029 §b). En ajouter un ici inventerait une règle.
--   · AUCUNE modification après saisie : `billing.misc_payments.update` n'existe
--     toujours pas. Un sens erroné s'annule, et un paiement correct est saisi.
-- =============================================================================


-- =============================================================================
-- 1. LA COLONNE
-- =============================================================================

alter table public.misc_payments
  add column if not exists direction public.treasury_direction not null default 'OUT';

comment on column public.misc_payments.direction is
  'Sens de l''opération — ENTRÉE (encaissement) ou SORTIE (décaissement). Figé dès la saisie ; l''écriture produite à la validation le reprend (DEC-042 §b).';

comment on column public.misc_payments.beneficiary is
  'L''autre partie : le bénéficiaire d''un décaissement, le payeur d''un encaissement (Module 07 §44).';

comment on table public.misc_payments is
  'Paiement sans facture rattachée (Module 07 §43). Encaissement ou décaissement selon `direction` ; il produit UNE écriture de ce sens à sa validation (§45, DEC-042 §b).';

create index if not exists misc_payments_direction_idx
  on public.misc_payments (direction, paid_on desc);


-- =============================================================================
-- 2. LE SENS EST FIGÉ — comme le montant, le compte et la date
--
-- Réécrire le sens après validation inverserait un mouvement de trésorerie sans
-- qu'aucune écriture ne l'explique : le solde du compte deviendrait faux de deux
-- fois le montant.
-- =============================================================================

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
   * une documentation réécrivable après coup ne documente rien (migration 074).
   *
   * Le SENS rejoint cette liste : l'inverser après validation retournerait un
   * mouvement de trésorerie sans qu'aucune écriture ne l'explique.
   */
  if new.account_id     is distinct from old.account_id
     or new.amount       is distinct from old.amount
     or new.direction    is distinct from old.direction
     or new.paid_on      is distinct from old.paid_on
     or new.category     is distinct from old.category
     or new.beneficiary  is distinct from old.beneficiary
     or new.purpose      is distinct from old.purpose
     or new.payment_no   is distinct from old.payment_no
     or new.external_ref is distinct from old.external_ref
     or new.notes        is distinct from old.notes then
    raise exception
      'Opération refusée : un paiement divers ne se modifie pas — ni son montant, ni son sens, ni ce qui le justifie. Il s''annule, et un paiement correct est enregistré (Module 07 §43, §47).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_misc_payment_transition is
  'Brouillon → Validé → Annulé, chaque passage sous SA capacité. Compte, montant, SENS, date et documentation sont figés dès la saisie.';


-- =============================================================================
-- 3. L'ÉCRITURE DIT LA VÉRITÉ SUR SON ORIGINE — le sens compris
--
-- Le déclencheur comparait le sens de l'écriture à la constante 'OUT'. Il le
-- compare désormais au sens PORTÉ PAR LE PAIEMENT : c'est ce qui ferme la
-- fabrication, par appel direct, d'une entrée adossée à un décaissement.
--
-- LE RESTE DE LA FONCTION EST REPRIS À L'IDENTIQUE DE SA DERNIÈRE VERSION.
--
-- Elle a été corrigée deux fois depuis le LOT 17, et ces corrections tiennent :
--
--   · migration 072 — l'état de l'opération d'origine n'est exigé qu'à l'INSERT.
--     Sur `UPDATE`, l'écriture ne fait que SUIVRE l'annulation de l'opération ;
--     le réexiger empêcherait d'annuler un virement ou un paiement ;
--   · migration 075 — `is_restoring()` lève ce même contrôle pendant une
--     restauration, qui remet un état déjà advenu.
--
-- Les repartir de la version d'origine les aurait effacées en silence.
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
  'Une écriture issue d''une opération en reprend le compte, le montant et le sens (§20, §31, §47). Le sens d''un paiement divers est celui du paiement (DEC-042 §b) ; l''état de l''origine n''est exigé qu''à la création, hors restauration.';


-- =============================================================================
-- 4. LE CONTRÔLE DIFFÉRÉ COMPTE L'ÉCRITURE DANS LE BON SENS
--
-- Sans cela, un paiement divers ENCAISSÉ serait refusé à la validation : le
-- contrôle chercherait une sortie et n'en trouverait pas.
-- =============================================================================

create or replace function public.assert_misc_payment_entries(p_payment_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  mp      public.misc_payments%rowtype;
  v_total int;
  v_ok    int;
begin
  select * into mp from public.misc_payments where id = p_payment_id;

  if not found then
    raise exception
      'Opération refusée : le paiement divers concerné n''est pas lisible, et sa cohérence ne peut donc pas être vérifiée (Module 07 §45).'
      using errcode = 'insufficient_privilege';
  end if;

  select
    count(*),
    count(*) filter (where e.status = 'VALIDATED'
                       and e.direction = mp.direction
                       and e.account_id = mp.account_id
                       and e.amount = mp.amount)
  into v_total, v_ok
  from public.treasury_entries e
  where e.misc_payment_id = p_payment_id;

  if mp.status = 'DRAFT' then
    if v_total <> 0 then
      raise exception
        'Opération refusée : un paiement divers en brouillon ne porte aucune écriture (Module 07 §45, §46).'
        using errcode = 'check_violation';
    end if;
    return;
  end if;

  if mp.status = 'VALIDATED' then
    if v_total <> 1 or v_ok <> 1 then
      raise exception
        'Opération refusée : un paiement divers validé porte EXACTEMENT une écriture, du montant payé, dans son sens, sur le compte désigné (Module 07 §45).'
        using errcode = 'check_violation';
    end if;
    return;
  end if;

  if v_ok <> 0 then
    raise exception
      'Opération refusée : l''écriture de ce paiement divers reste validée. Le compte porterait un mouvement sans cause (Workflow 08 §45).'
      using errcode = 'check_violation';
  end if;

  if v_total > 1 then
    raise exception
      'Opération refusée : un paiement divers ne produit qu''une écriture.'
      using errcode = 'check_violation';
  end if;
end;
$$;

comment on function public.assert_misc_payment_entries(uuid) is
  'Un paiement divers validé porte SON écriture, dans SON sens ; un brouillon aucune, un annulé aucune vivante (Module 07 §45, §46, DEC-042 §b).';


-- =============================================================================
-- 5. SAISIR — LE SENS EST OBLIGATOIRE
--
-- L'ancienne signature disparaît : la laisser en place permettrait de saisir un
-- paiement sans se prononcer sur son sens, ce qui reviendrait à décider en
-- silence qu'il s'agit d'un décaissement. Le sens est une donnée métier, il se
-- demande.
-- =============================================================================

drop function if exists public.create_misc_payment(
  uuid, bigint, date, public.misc_payment_category, text, text, text, text
);

create or replace function public.create_misc_payment(
  p_account_id   uuid,
  p_amount       bigint,
  p_paid_on      date,
  p_direction    public.treasury_direction,
  p_category     public.misc_payment_category,
  p_beneficiary  text,
  p_purpose      text,
  p_external_ref text default null,
  p_notes        text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id  uuid;
  v_no  text;
  v_acc public.financial_accounts%rowtype;
begin
  perform public.require_capability(
    array['billing.misc_payments.create'], 'créer un paiement divers'
  );
  perform public.require_capability(
    array['billing.misc_payments.view'], 'consulter le paiement saisi'
  );
  perform public.require_capability(
    array['treasury.accounts.view'], 'désigner le compte du paiement'
  );

  if p_direction is null then
    raise exception
      'Le sens du paiement est obligatoire : un encaissement et un décaissement ne font pas le même effet sur le solde (DEC-042 §b).'
      using errcode = 'check_violation';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Le montant du paiement doit être un entier positif, en KMF.'
      using errcode = 'check_violation';
  end if;

  if p_paid_on is null then
    raise exception 'La date du paiement est obligatoire (Module 07 §44).'
      using errcode = 'check_violation';
  end if;

  if coalesce(btrim(p_beneficiary), '') = '' then
    raise exception 'Le bénéficiaire du paiement est obligatoire (Module 07 §44).'
      using errcode = 'check_violation';
  end if;

  if coalesce(btrim(p_purpose), '') = '' then
    raise exception
      'Le motif du paiement est obligatoire : un mouvement sans cause écrite ne se contrôle pas (Module 07 §43).'
      using errcode = 'check_violation';
  end if;

  select * into v_acc from public.financial_accounts where id = p_account_id;

  if not found then
    raise exception
      'Le compte est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if v_acc.status <> 'ACTIVE' then
    raise exception
      'Opération refusée : le compte « % » n''est pas actif. Un compte inactif ou archivé ne reçoit plus de nouvelle opération (Module 06 §10).',
      v_acc.label
      using errcode = 'check_violation';
  end if;

  v_no := public.next_number('payment');

  insert into public.misc_payments
    (payment_no, account_id, amount, paid_on, direction, category, beneficiary, purpose,
     external_ref, notes, created_by, updated_by)
  values
    (v_no, p_account_id, p_amount, p_paid_on, p_direction, p_category,
     btrim(p_beneficiary), btrim(p_purpose),
     nullif(btrim(coalesce(p_external_ref, '')), ''),
     nullif(btrim(coalesce(p_notes, '')), ''),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.create_misc_payment is
  'Saisit un paiement divers en BROUILLON, dans son sens (Module 07 §43, §44, DEC-042 §b). Aucune écriture : la validation s''en charge (§45).';


-- =============================================================================
-- 6. VALIDER — L'ÉCRITURE PREND LE SENS DU PAIEMENT
-- =============================================================================

create or replace function public.validate_misc_payment(p_payment_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  mp    public.misc_payments%rowtype;
  v_acc public.financial_accounts%rowtype;
begin
  perform public.require_capability(
    array['billing.misc_payments.validate'], 'valider un paiement divers'
  );
  perform public.require_capability(
    array['billing.misc_payments.view'], 'consulter le paiement à valider'
  );
  perform public.require_capability(
    array['treasury.accounts.view'], 'consulter le compte à mouvementer'
  );
  perform public.require_capability(
    array['treasury.entries.view'], 'produire et relire l''écriture du paiement'
  );

  select * into mp from public.misc_payments where id = p_payment_id for update;

  if not found then
    raise exception 'Paiement divers introuvable.' using errcode = 'no_data_found';
  end if;

  if mp.status <> 'DRAFT' then
    raise exception
      'Opération refusée : seul un paiement divers en brouillon peut être validé. Celui-ci est déjà % .',
      case mp.status when 'VALIDATED' then 'validé' else 'annulé' end
      using errcode = 'check_violation';
  end if;

  select * into v_acc from public.financial_accounts where id = mp.account_id;

  if not found then
    raise exception
      'Le compte est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if v_acc.status <> 'ACTIVE' then
    raise exception
      'Opération refusée : le compte « % » n''est plus actif. Un compte inactif ou archivé ne reçoit plus de nouvelle opération (Module 06 §10).',
      v_acc.label
      using errcode = 'check_violation';
  end if;

  update public.misc_payments
     set status       = 'VALIDATED',
         validated_at = now(),
         validated_by = public.current_actor(),
         updated_by   = public.current_actor()
   where id = mp.id;

  /*
   * §45 : « Le système doit générer ou référencer l'écriture financière
   * correspondante. » UNE écriture, du montant payé, sur le compte désigné, DANS
   * LE SENS DU PAIEMENT — entrée pour un encaissement, sortie pour un
   * décaissement (DEC-042 §b).
   */
  insert into public.treasury_entries
    (account_id, entry_date, direction, kind, amount, description, reference,
     misc_payment_id, created_by, updated_by)
  values
    (mp.account_id, mp.paid_on, mp.direction, 'MISC_PAYMENT', mp.amount,
     case mp.direction when 'IN' then 'Encaissement divers ' else 'Paiement divers ' end
       || mp.payment_no || ' — ' || mp.beneficiary,
     mp.external_ref, mp.id, public.current_actor(), public.current_actor());
end;
$$;

comment on function public.validate_misc_payment is
  'Valide un paiement divers et produit SON écriture, dans SON sens (Module 07 §45, DEC-042 §b). Le contrôle différé refuse la transaction si elle manque.';


-- =============================================================================
-- 7. DROITS D'EXÉCUTION — DEC-022
--
-- La nouvelle signature n'hérite d'aucun droit : ils se posent à neuf.
-- =============================================================================

revoke execute on function public.create_misc_payment(
  uuid, bigint, date, public.treasury_direction, public.misc_payment_category,
  text, text, text, text) from public;
revoke execute on function public.create_misc_payment(
  uuid, bigint, date, public.treasury_direction, public.misc_payment_category,
  text, text, text, text) from anon;
grant  execute on function public.create_misc_payment(
  uuid, bigint, date, public.treasury_direction, public.misc_payment_category,
  text, text, text, text) to authenticated, service_role;


-- =============================================================================
-- 8. CONTRÔLES DE NON-RÉGRESSION
-- =============================================================================

do $$
declare
  v_total    int;
  v_existing int;
  v_wrong    int;
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 171 then
    raise exception 'Catalogue attendu à 171 permissions, obtenu %.', v_total;
  end if;

  -- Les paiements divers déjà enregistrés restent des décaissements.
  select count(*) into v_existing from public.misc_payments where direction <> 'OUT';
  if v_existing <> 0 then
    raise exception
      '% paiement(s) divers existant(s) ne sont plus des décaissements : la reprise a modifié des données.',
      v_existing;
  end if;

  -- Et leurs écritures restent cohérentes avec ce sens.
  select count(*) into v_wrong
  from public.treasury_entries e
  join public.misc_payments m on m.id = e.misc_payment_id
  where e.direction <> m.direction;

  if v_wrong <> 0 then
    raise exception
      '% écriture(s) de paiement divers portent un sens différent de leur paiement.', v_wrong;
  end if;

  -- L'ancienne signature ne doit plus exister : elle laisserait saisir un
  -- paiement sans se prononcer sur son sens.
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_misc_payment'
      and pg_get_function_identity_arguments(p.oid) not like '%treasury_direction%'
  ) then
    raise exception 'L''ancienne signature de `create_misc_payment` subsiste.';
  end if;
end $$;
