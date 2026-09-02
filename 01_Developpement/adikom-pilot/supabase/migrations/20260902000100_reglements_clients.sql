-- =============================================================================
-- ADIKOM PILOT — 053 · Règlements clients, et le solde d'une créance
-- Étape 2.5 (DEC-021), LOT 8
--
-- CE QUE CETTE MIGRATION POSE
--
-- Le dernier maillon financier du cycle : l'argent que le client verse. Le
-- LOT 7 a reconnu la créance ; il ne pouvait pas dire ce qu'il en restait.
--
--   Workflow 07 §61 : « Le statut doit être calculé à partir des règlements
--                      réellement enregistrés. »
--   Workflow 08 §47 : « Lorsqu'un paiement client est encaissé :
--                      Banque/Caisse AUGMENTE. »
--
-- Un encaissement est donc une ENTRÉE sur un compte — l'exact miroir du
-- règlement fournisseur, qui en est une sortie. Le sens est porté par le sens,
-- jamais par le signe du montant (Module 06 §19).
--
-- CE QUE CE LOT LIVRE
--
--   · RÈGLEMENTS CLIENTS : l'encaissement qui solde une facture émise, et
--     l'écriture d'entrée qu'il produit sur le compte mouvementé.
--   · LE SOLDE D'UNE FACTURE : total − encaissements validés (§28, §32).
--   · « PAYÉE » ET « PARTIELLEMENT PAYÉE » deviennent LISIBLES — et restent
--     NON ÉCRITES : elles se calculent de la somme des règlements (§61).
--
-- CE QUE CE LOT NE FAIT PAS, ET POURQUOI
--
--   · AUCUN TROP-PERÇU. Workflow 08 §40 : « Si un client verse un montant
--     supérieur à une facture, le système doit appliquer une RÈGLE DÉFINIE PAR
--     ADIKOM », et conclut : « Le système ne doit pas décider automatiquement
--     sans règle métier. » Aucune règle n'est définie (DEC-008). Un règlement
--     qui dépasse le reste dû est donc REFUSÉ, avec son motif — comme au LOT 6
--     pour le fournisseur (§22).
--   · AUCUNE AVANCE CLIENT (§41), aucune affectation d'avance (§42) : « lorsque
--     cette fonctionnalité est retenue ». Elle ne l'est pas. Un encaissement se
--     rattache donc toujours à une facture émise.
--   · AUCUNE RÉPARTITION SUR PLUSIEURS FACTURES (§37) : même réserve, mêmes
--     mots. Un règlement solde UNE facture.
--   · AUCUN RAPPROCHEMENT bancaire ou de caisse (§43, §44 — « rapprochement
--     futur », Module 06 §42).
--   · AUCUNE ÉCRITURE LIBRE. Dépôts, retraits et virements internes restent
--     hors périmètre : une écriture naît d'un règlement, et de rien d'autre.
--   · AUCUNE PERMISSION NOUVELLE. `billing.customer_payments.view`, `.create`
--     et `.cancel` existent depuis la migration 007. Catalogue : 153, inchangé.
--
-- LA NUMÉROTATION N'INVENTE AUCUN FORMAT
--
-- La règle `payment` — « Règlement », `REG`, année, six chiffres, remise à zéro
-- annuelle — est enregistrée depuis la migration 005 et sert déjà les
-- règlements fournisseurs. Elle est GÉNÉRIQUE : un règlement est un règlement.
-- En créer une seconde inventerait un format que DEC-005 n'a pas arrêté ; la
-- série reste donc unique, et paramétrable si ADIKOM veut l'en séparer.
--
-- LES CINQ COUCHES DE L'AUDIT 041–042, RECONDUITES
--
--   1. FONCTION   — chaque acte vérifie SA capacité par `require_capability`.
--   2. DONNÉE     — un règlement ne se réécrit pas ; une écriture non plus.
--   3. TRANSITION — annuler exige `cancel` ; aucun autre changement n'existe.
--   4. RLS        — lecture, création, annulation.
--   5. ÉTAT DE DÉPART — un règlement naît validé, y compris par `INSERT`
--                   direct, que le déclencheur de transition ne verrait pas.
--
-- Aucune fonction n'est `SECURITY DEFINER` (DEC-022, DEC-026 §f).
-- =============================================================================


-- --- Type ---------------------------------------------------------------------------
--
-- Deux états, comme pour le règlement fournisseur, et pour la même raison : le
-- catalogue n'expose que `view`, `create` et `cancel` — AUCUNE capacité de
-- validation. Workflow 08 §56 pose la séparation saisie/validation comme une
-- faculté (« ADIKOM PEUT décider de séparer… ») ; en créer une d'office
-- inventerait une organisation qu'ADIKOM n'a pas demandée (DEC-024, DEC-029 §c).
--
-- Un encaissement CONSTATE de l'argent reçu. Il naît validé, et s'annule.

do $$ begin
  create type public.customer_payment_status as enum ('VALIDATED', 'CANCELLED');
exception when duplicate_object then null; end $$;


-- =============================================================================
-- LES RÈGLEMENTS CLIENTS — Workflow 08 §5, §32 · Workflow 07 §32
-- =============================================================================

create table public.customer_payments (
  id uuid primary key default gen_random_uuid(),

  -- §9 : identifiant unique. Série `payment` (REG), partagée avec les
  -- règlements fournisseurs : un numéro y reste unique, et aucun format
  -- nouveau n'est inventé.
  payment_no text not null unique,

  -- §5 : « Un paiement client doit être lié à une facture client. »
  customer_invoice_id uuid not null
    references public.customer_invoices (id) on delete restrict,

  /*
   * §13 : le compte financier mouvementé. §46 : « Le paiement utilise l'un de
   * ces comptes. » `restrict` : un compte qui a servi ne disparaît pas.
   */
  account_id uuid not null references public.financial_accounts (id) on delete restrict,

  -- DEC-010 : entier, en KMF.
  amount bigint not null check (amount > 0),

  /*
   * §11 : « La date réelle du règlement doit être enregistrée. Elle ne doit pas
   * être confondue avec la date de facture. » Deux colonnes, deux tables.
   */
  received_on date not null,

  method public.payment_method not null,

  -- §16 : référence externe — numéro de virement, de chèque, de bordereau.
  external_ref text,
  notes        text,

  status public.customer_payment_status not null default 'VALIDATED',

  /*
   * §57 : le règlement conserve qui l'a enregistré et quand. Saisie et
   * validation étant ici le même acte, le valideur est le créateur — et la
   * donnée reste distincte, pour le jour où la séparation existera.
   */
  validated_at timestamptz not null default now(),
  validated_by uuid references public.app_users (id) on delete set null,

  cancelled_at  timestamptz,
  cancelled_by  uuid references public.app_users (id) on delete set null,
  status_reason text,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  constraint customer_payments_external_ref_not_blank check (
    external_ref is null or btrim(external_ref) <> ''
  ),

  -- §28 : un règlement annulé est historisé. Un état sans date est un acte que
  -- personne ne peut situer.
  constraint customer_payments_cancellation_dated check (
    status <> 'CANCELLED' or cancelled_at is not null
  )
);

comment on table public.customer_payments is
  'Encaissement constatant le règlement d''une facture client (Workflow 08 §5). Il AUGMENTE le compte mouvementé (§47).';
comment on column public.customer_payments.received_on is
  'Date réelle de l''encaissement (§11). Jamais confondue avec la date de la facture.';
comment on column public.customer_payments.status is
  '« Payée » et « Partiellement payée » ne sont pas des états DU RÈGLEMENT mais de la FACTURE, et se calculent (Workflow 07 §61).';

create index customer_payments_invoice_idx on public.customer_payments (customer_invoice_id);
create index customer_payments_account_idx on public.customer_payments (account_id, received_on desc);
create index customer_payments_status_idx  on public.customer_payments (status);


-- =============================================================================
-- L'ÉCRITURE RELIÉE À SON ORIGINE — Module 06 §20
--
-- « Lorsqu'une écriture provient d'un autre module, elle doit pouvoir être
-- reliée à son origine. » Une colonne par origine, et JAMAIS LES DEUX : une
-- écriture qui se réclamerait de deux règlements ne serait la contrepartie
-- d'aucun.
-- =============================================================================

alter table public.treasury_entries
  add column customer_payment_id uuid
  references public.customer_payments (id) on delete restrict;

comment on column public.treasury_entries.customer_payment_id is
  'Origine de l''écriture lorsqu''elle vient d''un règlement client (§20).';

alter table public.treasury_entries
  add constraint treasury_entries_single_origin check (
    supplier_payment_id is null or customer_payment_id is null
  );

create index treasury_entries_customer_payment_idx
  on public.treasury_entries (customer_payment_id)
  where customer_payment_id is not null;


-- =============================================================================
-- LE MONTANT ENCAISSÉ — UNE FONCTION, PAS UNE COLONNE
--
-- Workflow 08 §21 : « Solde = Montant dû − Total des paiements VALIDÉS. »
-- §28 : « Un paiement annulé ne doit plus être comptabilisé. »
--
-- `SECURITY INVOKER` : la somme est calculée sous les droits de l'appelant. Sans
-- `billing.customer_payments.view`, elle vaut 0 — raison pour laquelle chaque
-- acte qui s'y fie EXIGE nommément cette capacité avant de l'appeler. Un
-- encaissement invisible n'est pas un encaissement nul (doctrine du LOT 4,
-- confirmée par la migration 050).
-- =============================================================================

create or replace function public.customer_invoice_paid(p_invoice_id uuid)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(p.amount), 0)::bigint
  from public.customer_payments p
  where p.customer_invoice_id = p_invoice_id
    and p.status = 'VALIDATED';
$$;

comment on function public.customer_invoice_paid(uuid) is
  'Σ des encaissements validés d''une facture client (§21, §28). Lue sous `customer_payments.view` : sans ce droit elle vaut 0, et l''acte qui s''y fie doit refuser.';


-- =============================================================================
-- COUCHE 2 · UNE ÉCRITURE RESTE IMMUABLE — Module 06 §34, §35
--
-- La liste des colonnes figées s'étend à la nouvelle origine : sans quoi un
-- `PATCH` pourrait rattacher après coup une écriture existante à un règlement
-- client, et fabriquer une contrepartie qui n'a jamais eu lieu.
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
     or new.supplier_payment_id is distinct from old.supplier_payment_id
     or new.customer_payment_id is distinct from old.customer_payment_id then
    raise exception
      'Opération refusée : une écriture financière ne se modifie pas. Une correction passe par une opération inverse, jamais par la réécriture de l''historique (Module 06 §34).'
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
  'Une écriture est immuable ; seul son statut suit l''opération qui l''a produite (Module 06 §34, §35).';


-- =============================================================================
-- COUCHE 2 · UNE ÉCRITURE DIT LA VÉRITÉ SUR SON ORIGINE
--
-- Sans ce contrôle, un `POST` direct fabriquerait une écriture se réclamant
-- d'un règlement sans en reprendre le compte, le montant ni le sens — et le
-- solde du compte deviendrait faux tout en paraissant justifié.
--
-- LE SENS EST IMPOSÉ PAR L'ORIGINE (Workflow 08 §47) :
--
--   règlement FOURNISSEUR → SORTIE   le compte diminue
--   règlement CLIENT      → ENTRÉE   le compte augmente
-- =============================================================================

create or replace function public.fn_treasury_entry_source()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  sp public.supplier_payments%rowtype;
  cp public.customer_payments%rowtype;
begin
  if new.supplier_payment_id is not null and new.customer_payment_id is not null then
    raise exception
      'Opération refusée : une écriture ne provient que d''une seule opération (Module 06 §20).'
      using errcode = 'check_violation';
  end if;

  if new.supplier_payment_id is null and new.customer_payment_id is null then
    -- Aucune origine : l'écriture est libre, et relève alors de
    -- `treasury.entries.create` seule (voir la policy).
    if new.kind in ('SUPPLIER_PAYMENT', 'CUSTOMER_PAYMENT') then
      raise exception
        'Opération refusée : une écriture de règlement doit désigner le règlement dont elle provient (Module 06 §20).'
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
end;
$$;

comment on function public.fn_treasury_entry_source is
  'Une écriture issue d''un règlement en reprend le compte, le montant et le sens (§47) — sortie pour un fournisseur, entrée pour un client. Ferme la fabrication d''écritures par appel direct.';


-- =============================================================================
-- COUCHE 3 ET 5 · LE RÈGLEMENT NAÎT VALIDÉ, ET NE CHANGE QU'EN S'ANNULANT
-- =============================================================================

create or replace function public.fn_customer_payment_starts_validated()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'VALIDATED' then
    raise exception
      'Opération refusée : un règlement constate un encaissement effectué. Il naît validé, et s''annule ensuite si nécessaire.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function public.fn_customer_payment_starts_validated is
  'Un encaissement naît validé. Ferme la naissance d''un règlement annulé, qui produirait une écriture sans contrepartie.';


create or replace function public.fn_customer_payment_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    if old.status = 'VALIDATED' and new.status = 'CANCELLED' then
      perform public.require_capability(
        array['billing.customer_payments.cancel'], 'annuler un règlement client'
      );
    else
      raise exception
        'Transition de règlement refusée : % ne peut pas devenir %.', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;

  /*
   * §30 : « Une erreur de saisie doit être corrigée selon une PROCÉDURE
   * CONTRÔLÉE. » §31 : ni suppression, mais annulation ou contrepassation.
   *
   * Un règlement ne se réécrit donc pas : il s'annule, et un règlement correct
   * est enregistré. L'écriture qu'il a produite suit, et le solde du compte
   * comme celui de la facture reviennent d'eux-mêmes.
   */
  if new.amount is distinct from old.amount
     or new.account_id is distinct from old.account_id
     or new.customer_invoice_id is distinct from old.customer_invoice_id
     or new.received_on is distinct from old.received_on
     or new.method is distinct from old.method then
    raise exception
      'Opération refusée : un règlement ne se modifie pas. Il s''annule, et un règlement correct est enregistré (Workflow 08 §30, §31).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_customer_payment_transition is
  'Un encaissement naît validé et ne change qu''en s''annulant, sous `customer_payments.cancel`. Aucune correction sur place (§30, §31).';


create trigger customer_payments_starts_validated
  before insert on public.customer_payments
  for each row execute function public.fn_customer_payment_starts_validated();

create trigger customer_payments_transition
  before update on public.customer_payments
  for each row execute function public.fn_customer_payment_transition();

create trigger customer_payments_updated_at
  before update on public.customer_payments
  for each row execute function public.fn_set_updated_at();

create trigger customer_payments_audit
  after insert or update on public.customer_payments
  for each row execute function public.fn_audit_row('billing');

create trigger customer_payments_no_delete
  before delete on public.customer_payments
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- UNE FACTURE ENCAISSÉE NE S'ANNULE PAS
--
-- Le LOT 6 pose la règle côté fournisseur : annuler une facture déjà réglée
-- laisserait un décaissement pesant sur un document annulé. Côté client, c'est
-- le symétrique — de l'argent est ENTRÉ, et il faudrait le rendre.
--
-- L'annulation reste possible tant qu'aucun encaissement ne pèse sur la
-- facture : ses règlements s'annulent d'abord, et le chemin est nommé.
-- =============================================================================

create or replace function public.fn_customer_invoice_no_cancel_when_paid()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_paid bigint;
begin
  if new.status <> 'CANCELLED' or old.status = 'CANCELLED' then
    return new;
  end if;

  /*
   * La somme est lue sous les droits de l'appelant : sans le droit de voir les
   * règlements, elle vaudrait 0 et l'annulation passerait sur une facture
   * encaissée. La capacité est donc EXIGÉE, et le refus la nomme (DEC-024).
   */
  if public.current_actor() is not null
     and not public.has_permission('billing.customer_payments.view') then
    raise exception
      'Opération refusée : annuler une facture exige de pouvoir consulter les règlements qui la soldent.'
      using errcode = 'insufficient_privilege';
  end if;

  v_paid := public.customer_invoice_paid(new.id);

  if v_paid > 0 then
    raise exception
      'Opération refusée : % KMF ont été encaissés sur cette facture. Chaque règlement doit d''abord être annulé.', v_paid
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_customer_invoice_no_cancel_when_paid is
  'Une facture encaissée ne s''annule pas : l''argent est entré sur un compte. Les règlements s''annulent d''abord.';

-- `zz_` : ce contrôle s'exécute APRÈS le déclencheur de transition, qui exige
-- d'abord la capacité d'annuler. L'ordre des déclencheurs est alphabétique.
create trigger customer_invoices_zz_no_cancel_when_paid
  before update on public.customer_invoices
  for each row execute function public.fn_customer_invoice_no_cancel_when_paid();


-- =============================================================================
-- « PAYÉE » ET « PARTIELLEMENT PAYÉE » RESTENT DÉRIVÉES
--
-- Le LOT 7 les refusait faute de règlements. Ils existent : le refus DEMEURE,
-- et seul son motif change.
--
--   Workflow 07 §61 : « Le statut doit être calculé à partir des règlements
--                      réellement enregistrés. »
--
-- Un statut stocké doublerait la donnée qui le dit — la somme des encaissements
-- validés — et pourrait la contredire : il suffirait d'un règlement annulé pour
-- qu'une facture reste « Payée » sans l'être. Même traitement qu'au LOT 6 pour
-- la facture fournisseur.
-- =============================================================================

create or replace function public.fn_customer_invoice_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_subtotal bigint;
  v_discount bigint;
begin
  if new.status is distinct from old.status then

    if new.status in ('PARTIALLY_PAID', 'PAID') then
      raise exception
        'Opération refusée : l''état de règlement d''une facture se CALCULE des encaissements enregistrés (Workflow 07 §61). Il ne se déclare pas — un statut écrit pourrait contredire la somme qui le dit.'
        using errcode = 'check_violation';
    end if;

    -- DEC-025 §a : « En retard » se calcule de l'échéance, il ne se déclare pas.
    if new.status = 'OVERDUE' then
      raise exception
        'Opération refusée : « En retard » se déduit de l''échéance et du solde (§30). Ce statut ne s''écrit pas.'
        using errcode = 'check_violation';
    end if;

    case
      when old.status = 'DRAFT' and new.status = 'ISSUED' then
        perform public.require_capability(
          array['billing.customer_invoices.issue'], 'émettre une facture client'
        );

        v_subtotal := public.customer_invoice_subtotal(new.id);
        v_discount := public.customer_invoice_discount(new.id);

        if v_subtotal <= 0 then
          raise exception
            'Opération refusée : cette facture ne porte aucune ligne facturable, ou ses lignes ne sont pas lisibles avec vos droits. Un total est nécessaire à l''émission (§22, §60).'
            using errcode = 'check_violation';
        end if;

        if v_discount > v_subtotal then
          raise exception
            'Opération refusée : les réductions (% KMF) dépassent le sous-total (% KMF). Une facture ne devient pas un avoir : celui-ci relève de règles qu''ADIKOM n''a pas arrêtées (§44).',
            v_discount, v_subtotal
            using errcode = 'check_violation';
        end if;

        if v_subtotal - v_discount <= 0 then
          raise exception
            'Opération refusée : le total de cette facture serait nul. Une créance de zéro n''est pas une créance.'
            using errcode = 'check_violation';
        end if;

      when old.status in ('DRAFT', 'ISSUED') and new.status = 'CANCELLED' then
        perform public.require_capability(
          array['billing.customer_invoices.cancel'], 'annuler une facture client'
        );

      else
        raise exception
          'Transition de facture client refusée : % ne peut pas devenir %.', old.status, new.status
          using errcode = 'check_violation';
    end case;
  end if;

  /*
   * COUCHE 2 — LE VERROU (§45).
   *
   * Une facture émise ou annulée fige ce qui fonde la créance : son client, sa
   * location, sa date, son échéance et son numéro. Les LIGNES le sont par leur
   * propre déclencheur.
   */
  if old.status in ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')
     and (new.client_id    is distinct from old.client_id
       or new.rental_id    is distinct from old.rental_id
       or new.invoice_date is distinct from old.invoice_date
       or new.due_date     is distinct from old.due_date
       or new.invoice_no   is distinct from old.invoice_no) then
    raise exception
      'Opération refusée : une facture client émise ou annulée ne se modifie plus (§45). Son annulation, elle, conserve l''historique.'
      using errcode = 'check_violation';
  end if;

  -- Modifier une facture encore en brouillon relève de `update` (§25).
  if old.status = 'DRAFT'
     and (new.client_id    is distinct from old.client_id
       or new.rental_id    is distinct from old.rental_id
       or new.invoice_date is distinct from old.invoice_date
       or new.due_date     is distinct from old.due_date
       or new.notes        is distinct from old.notes) then
    perform public.require_capability(
      array['billing.customer_invoices.update'], 'modifier une facture client'
    );
  end if;

  return new;
end;
$$;

comment on function public.fn_customer_invoice_transition is
  'Chaque transition exige SA capacité, y compris par PATCH direct. « Payée », « Partiellement payée » et « En retard » se CALCULENT : aucune ne s''écrit.';


-- =============================================================================
-- COUCHE 1 · LES FONCTIONS
--
-- Chacune vérifie la capacité qu'elle incarne AVANT d'engager le travail. Ce
-- n'est pas redondant avec RLS : la policy dit qui peut écrire dans la table,
-- ceci dit qui peut accomplir CET acte — la leçon de l'audit 041.
--
-- Aucune n'est `SECURITY DEFINER` : elles s'exécutent avec les droits de
-- l'appelant, RLS comprise.
-- =============================================================================

/**
 * Enregistre un encaissement client — Workflow 08 §5, §13, §47.
 *
 * QUATRE CAPACITÉS, NOMMÉMENT.
 *
 *   `billing.customer_payments.create`   l'acte lui-même
 *   `billing.customer_payments.view`     relire les encaissements, dont dépend
 *                                        le solde, et le contrôle de cohérence
 *                                        de l'écriture produite
 *   `billing.customer_invoices.view`     le total de la facture, dont dépend
 *                                        le reste dû (§21)
 *   `treasury.accounts.view`             le compte mouvementé (§13)
 *
 * Les trois lectures ne sont pas du décor : sans elles, le contrôle du reste dû
 * porterait sur des sommes muettes et laisserait passer exactement ce qu'il
 * doit refuser (leçon de la migration 050).
 *
 * `parties.clients.view` n'est PAS exigée : encaisser une facture ne suppose
 * pas le droit de consulter le tiers (DEC-024). Le règlement porte la facture,
 * qui porte le client (§32).
 *
 * L'ÉCRITURE EST UNE CONSÉQUENCE, PAS UN SECOND ACTE.
 *
 * `treasury.entries.create` n'est pas exigée : le règlement PRODUIT son
 * écriture, il ne l'écrit pas librement — même doctrine que le règlement
 * fournisseur (DEC-029 §f) et que l'occupation de calendrier posée par une
 * maintenance. Le déclencheur `treasury_entries_source` vérifie que l'écriture
 * correspond bien au règlement dont elle se réclame.
 */
create or replace function public.record_customer_payment(
  p_invoice_id   uuid,
  p_account_id   uuid,
  p_amount       bigint,
  p_received_on  date,
  p_method       public.payment_method,
  p_external_ref text default null,
  p_notes        text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_no    text;
  f       public.customer_invoices%rowtype;
  v_acc   public.financial_accounts%rowtype;
  v_total bigint;
  v_paid  bigint;
  v_due   bigint;
begin
  perform public.require_capability(
    array['billing.customer_payments.create'], 'enregistrer un règlement client'
  );
  perform public.require_capability(
    array['billing.customer_payments.view'], 'consulter les règlements de cette facture'
  );
  perform public.require_capability(
    array['billing.customer_invoices.view'], 'consulter la facture à encaisser'
  );
  perform public.require_capability(
    array['treasury.accounts.view'], 'consulter le compte à mouvementer'
  );

  if p_amount is null or p_amount <= 0 then
    raise exception 'Le montant du règlement doit être un entier positif, en KMF.'
      using errcode = 'check_violation';
  end if;

  if p_received_on is null then
    raise exception 'La date réelle du règlement est obligatoire (Workflow 08 §11).'
      using errcode = 'check_violation';
  end if;

  /*
   * SÉRIALISER SANS RÉCLAMER UN DROIT D'ÉCRITURE (migration 051).
   *
   * Deux encaissements simultanés sur la même facture doivent se suivre, sans
   * quoi chacun verrait le même reste dû et le plafond de §40 laisserait passer
   * les deux. Un `select … for update` appliquerait, sous RLS, la policy
   * d'ÉCRITURE de `customer_invoices` — trois capacités qu'un encaisseur n'a
   * aucune raison de détenir. Le verrou consultatif fait le même travail sans
   * rien réclamer, et tombe avec la transaction.
   */
  perform pg_advisory_xact_lock(hashtext(p_invoice_id::text)::bigint);

  select * into f from public.customer_invoices where id = p_invoice_id;

  if not found then
    raise exception
      'La facture à encaisser est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  /*
   * §26 : une facture ÉMISE reconnaît la créance. Un brouillon n'en est pas
   * une, une facture annulée n'en est plus une — encaisser l'un ou l'autre
   * enregistrerait de l'argent reçu sur une créance qui n'existe pas.
   */
  if f.status <> 'ISSUED' then
    raise exception
      'Opération refusée : seule une facture client émise peut être encaissée. Celle-ci est « % ».', f.status
      using errcode = 'check_violation';
  end if;

  select * into v_acc from public.financial_accounts where id = p_account_id;

  if not found then
    raise exception
      'Le compte financier est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  -- Module 06 §10 : « un compte inactif ou archivé ne doit normalement plus
  -- être proposé pour de nouvelles opérations. »
  if v_acc.status <> 'ACTIVE' then
    raise exception
      'Opération refusée : le compte « % » n''est pas actif. Un compte inactif ou archivé ne reçoit plus de nouvelle opération (Module 06 §10).',
      v_acc.label
      using errcode = 'check_violation';
  end if;

  if v_acc.currency_code is distinct from f.currency_code then
    raise exception
      'Opération refusée : la devise du compte (%) diffère de celle de la facture (%). Aucune conversion n''est définie.',
      v_acc.currency_code, f.currency_code
      using errcode = 'check_violation';
  end if;

  -- §21 : Solde = Montant dû − Σ règlements validés. Le montant dû d'une
  -- facture client est son TOTAL : sous-total − réductions (Workflow 07 §23).
  v_total := public.customer_invoice_total(p_invoice_id);
  v_paid  := public.customer_invoice_paid(p_invoice_id);
  v_due   := v_total - v_paid;

  -- §23 : « Une facture dont le solde est nul ne doit normalement plus accepter
  -- de nouveau paiement. »
  if v_due <= 0 then
    raise exception
      'Opération refusée : cette facture est déjà soldée. Aucun règlement supplémentaire n''est accepté (Workflow 08 §23).'
      using errcode = 'check_violation';
  end if;

  /*
   * §40 : « Si un client verse un montant supérieur à une facture, le système
   * doit appliquer une règle définie par ADIKOM. […] Le système ne doit pas
   * décider automatiquement sans règle métier. »
   *
   * Aucune règle n'est définie : ni affectation à une autre facture (§37), ni
   * avance (§41). Le dépassement est donc REFUSÉ, avec son motif — le système
   * ne fabrique ni avoir ni avance par accident.
   */
  if p_amount > v_due then
    raise exception
      'Opération refusée : le règlement (% KMF) dépasse le reste dû sur cette facture (% KMF). Le traitement d''un trop-perçu relève de règles qu''ADIKOM n''a pas arrêtées (Workflow 08 §40).',
      p_amount, v_due
      using errcode = 'check_violation';
  end if;

  v_no := public.next_number('payment');

  insert into public.customer_payments
    (payment_no, customer_invoice_id, account_id, amount, received_on, method,
     external_ref, notes, validated_by, created_by, updated_by)
  values
    (v_no, p_invoice_id, p_account_id, p_amount, p_received_on, p_method,
     nullif(btrim(coalesce(p_external_ref, '')), ''),
     nullif(btrim(coalesce(p_notes, '')), ''),
     public.current_actor(), public.current_actor(), public.current_actor())
  returning id into v_id;

  -- §47 : un encaissement client AUGMENTE le compte. L'écriture est la
  -- conséquence du règlement, jamais un acte séparé.
  insert into public.treasury_entries
    (account_id, entry_date, direction, kind, amount, description, reference,
     customer_payment_id, created_by, updated_by)
  values
    (p_account_id, p_received_on, 'IN', 'CUSTOMER_PAYMENT', p_amount,
     'Encaissement ' || v_no || ' — facture ' || f.invoice_no,
     nullif(btrim(coalesce(p_external_ref, '')), ''),
     v_id, public.current_actor(), public.current_actor());

  return v_id;
end;
$$;

comment on function public.record_customer_payment is
  'Constate un encaissement et produit son écriture d''entrée (§13, §47). Refuse au-delà du reste dû (§40) et sur une facture soldée (§23).';


/**
 * Annule un encaissement — Workflow 08 §28 et §29.
 *
 * « Un paiement annulé ne doit plus être comptabilisé dans le total des
 * paiements valides. » L'écriture qu'il a produite est annulée avec lui : le
 * solde du compte redescend, le reste dû de la facture remonte. Rien n'est
 * effacé (§31).
 */
create or replace function public.cancel_customer_payment(
  p_payment_id uuid,
  p_reason     text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  p public.customer_payments%rowtype;
begin
  perform public.require_capability(
    array['billing.customer_payments.cancel'], 'annuler un règlement client'
  );
  perform public.require_capability(
    array['billing.customer_payments.view'], 'consulter le règlement à annuler'
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
end;
$$;

comment on function public.cancel_customer_payment is
  'Annule un encaissement et l''écriture qu''il a produite (§28, §29). Le solde du compte et le reste dû de la facture reviennent ; l''historique reste.';


-- =============================================================================
-- DROITS D'EXÉCUTION — DEC-022
--
-- « Un droit ne se retire pas en général : il se retire à chaque source qui
-- l'accorde. » PostgreSQL accorde EXECUTE à PUBLIC sur toute fonction créée.
-- =============================================================================

revoke execute on function public.customer_invoice_paid(uuid) from public;
grant  execute on function public.customer_invoice_paid(uuid) to authenticated, service_role;

revoke execute on function public.record_customer_payment(
  uuid, uuid, bigint, date, public.payment_method, text, text) from public;
grant  execute on function public.record_customer_payment(
  uuid, uuid, bigint, date, public.payment_method, text, text)
  to authenticated, service_role;

revoke execute on function public.cancel_customer_payment(uuid, text) from public;
grant  execute on function public.cancel_customer_payment(uuid, text)
  to authenticated, service_role;


-- =============================================================================
-- COUCHE 4 · RLS
--
-- Les policies d'écriture restent larges — une table sert plusieurs actes, et
-- PostgreSQL n'accepte qu'une policy d'UPDATE par table. Ce sont les
-- déclencheurs qui exigent, eux, la capacité correspondant à l'acte demandé.
-- =============================================================================

revoke all    on public.customer_payments from anon;
revoke delete on public.customer_payments from authenticated;

alter table public.customer_payments enable row level security;

create policy customer_payments_select on public.customer_payments
  for select to authenticated
  using (public.has_permission('billing.customer_payments.view'));

create policy customer_payments_insert on public.customer_payments
  for insert to authenticated
  with check (public.has_permission('billing.customer_payments.create'));

create policy customer_payments_update on public.customer_payments
  for update to authenticated
  using (public.has_permission('billing.customer_payments.cancel'))
  with check (public.has_permission('billing.customer_payments.cancel'));


/*
 * L'ÉCRITURE PRODUITE PAR UN ENCAISSEMENT SUIT LA CAPACITÉ DE L'ENCAISSEMENT.
 *
 * Elle en est la conséquence, pas un acte distinct (DEC-029 §f). Le
 * déclencheur `treasury_entries_source` vérifie qu'elle correspond réellement
 * au règlement dont elle se réclame — sans quoi cette ouverture permettrait
 * d'écrire n'importe quoi.
 */
drop policy if exists treasury_entries_insert on public.treasury_entries;

create policy treasury_entries_insert on public.treasury_entries
  for insert to authenticated
  with check (
    public.has_permission('treasury.entries.create')
    or (
      supplier_payment_id is not null
      and public.has_permission('billing.supplier_payments.create')
    )
    or (
      customer_payment_id is not null
      and public.has_permission('billing.customer_payments.create')
    )
  );

-- Seul le statut change, et seulement pour suivre l'annulation d'un règlement.
drop policy if exists treasury_entries_update on public.treasury_entries;

create policy treasury_entries_update on public.treasury_entries
  for update to authenticated
  using (
    public.has_permission('billing.supplier_payments.cancel')
    or public.has_permission('billing.customer_payments.cancel')
  )
  with check (
    public.has_permission('billing.supplier_payments.cancel')
    or public.has_permission('billing.customer_payments.cancel')
  );


-- =============================================================================
-- CONTRÔLE DE NON-RÉGRESSION DU CATALOGUE
--
-- Le LOT 8 n'ajoute aucune permission : les trois codes
-- `billing.customer_payments.*` existent depuis la migration 007.
-- =============================================================================

do $$
declare
  v_total   int;
  v_missing text[];
begin
  select count(*) into v_total from public.permissions;

  if v_total <> 153 then
    raise exception 'Catalogue attendu à 153 permissions, obtenu %.', v_total;
  end if;

  select array_agg(c) into v_missing
  from unnest(array[
    'billing.customer_payments.view',
    'billing.customer_payments.create',
    'billing.customer_payments.cancel',
    'billing.customer_invoices.view',
    'treasury.accounts.view',
    'treasury.entries.view'
  ]) c
  where not exists (select 1 from public.permissions p where p.code = c);

  if v_missing is not null then
    raise exception 'Capacités d''encaissement absentes du catalogue : %', v_missing;
  end if;

  if not exists (select 1 from public.numbering_rules where entity_key = 'payment') then
    raise exception 'Règle de numérotation « payment » absente.';
  end if;
end $$;
