-- =============================================================================
-- ADIKOM PILOT — 049 · Banques & Caisses (socle) et règlements fournisseurs
-- Étape 2.5 (DEC-021), LOT 6
--
-- POURQUOI LES DEUX DANS LE MÊME LOT
--
-- `Workflow 08` §13 : « Chaque paiement doit être associé au COMPTE FINANCIER
-- utilisé. » §46 : « Le module Banques & Caisses doit centraliser les comptes
-- financiers. Le paiement utilise l'un de ces comptes. » §47 : un paiement
-- fournisseur DIMINUE le solde du compte.
--
-- Un règlement sans compte serait donc un règlement que la documentation
-- interdit. Le socle de Banques & Caisses — comptes, écritures, solde — est
-- livré ici parce que le règlement ne peut pas exister sans lui, et pas un
-- objet de plus.
--
-- CE QUE CE LOT LIVRE
--
--   · COMPTES financiers : banques et caisses (§5), leur identifiant (§9), leur
--     statut (§10), leur devise (§11), leur solde initial (§12).
--   · ÉCRITURES : un mouvement, son sens, son type, son origine (§18 à §20).
--   · SOLDE : solde initial + entrées − sorties (§17), CALCULÉ, jamais stocké.
--   · RÈGLEMENTS FOURNISSEURS : le décaissement qui solde une facture, et
--     l'écriture qu'il produit sur le compte mouvementé.
--
-- CE QUE CE LOT NE FAIT PAS
--
--   · AUCUN VIREMENT INTERNE (Module 06 §28 à §33), aucun rapprochement
--     bancaire ou de caisse (§42 : « rapprochement FUTUR »), aucun tableau de
--     bord financier, aucun seuil d'alerte.
--   · AUCUNE ÉCRITURE LIBRE. Dépôts et retraits figurent au vocabulaire de §20,
--     mais aucun écran ne les produit : une écriture naît ici d'un règlement,
--     et de rien d'autre.
--   · AUCUN RÈGLEMENT CLIENT, aucun paiement divers : la facture client
--     n'existe pas.
--   · AUCUN CONTRÔLE DE DÉCOUVERT. Arbitrage ADIKOM du 31/08/2026 : la
--     documentation ne définit ni découvert autorisé ni seuil — Module 06 §30
--     ne pose ce contrôle que pour le virement interne. Le solde est AFFICHÉ,
--     jamais opposé. Aucune règle n'est inventée (DEC-008).
--   · AUCUNE PERMISSION NOUVELLE. `treasury.accounts.*`, `treasury.balances.view`,
--     `treasury.entries.*` et `billing.supplier_payments.*` existent depuis la
--     migration 007. Catalogue : 153, inchangé.
--
-- « PAYÉE » ET « PARTIELLEMENT PAYÉE » RESTENT DÉRIVÉES
--
-- Le LOT 5 refusait ces deux états faute de règlements. Ils existent désormais
-- — et restent NON ÉCRITS.
--
--   Module 07 §55 : « La logique doit être calculée automatiquement. »
--
-- Un statut stocké doublerait une donnée qui le dit déjà — la somme des
-- règlements validés — et pourrait la contredire : il suffirait d'un règlement
-- annulé pour qu'une facture reste « Payée » sans l'être. Même traitement que
-- « En retard » (DEC-025 §a) et que « imputation en attente de facture »
-- (DEC-026 §b). Le refus de transition demeure ; seul son motif change.
--
-- LES QUATRE COUCHES DE L'AUDIT 041–042, RECONDUITES
--
--   1. FONCTION   — chaque acte vérifie SA capacité par `require_capability`.
--   2. DONNÉE     — un règlement validé fige son montant, son compte et sa
--                   facture ; une écriture ne se modifie jamais.
--   3. TRANSITION — annuler exige `cancel` ; aucun autre changement d'état
--                   n'existe.
--   4. RLS        — lecture, création, annulation, sur les trois tables.
--
-- Aucune fonction n'est `SECURITY DEFINER`.
-- =============================================================================


-- --- Types -----------------------------------------------------------------------

-- Module 06 §5 : « au minimum comptes bancaires et caisses ». Rien de plus :
-- « une évolution future pourra permettre d'ajouter d'autres types ».
do $$ begin
  create type public.financial_account_kind as enum (
    'BANK',  -- Compte bancaire (§7)
    'CASH'   -- Caisse (§8)
  );
exception when duplicate_object then null; end $$;

-- Module 06 §10 — les trois statuts cités. « Un compte inactif ou archivé ne
-- doit normalement plus être proposé pour de nouvelles opérations. Son
-- historique doit cependant rester consultable. »
do $$ begin
  create type public.financial_account_status as enum ('ACTIVE', 'INACTIVE', 'ARCHIVED');
exception when duplicate_object then null; end $$;

-- Module 06 §19 : « au minimum entrée et sortie ».
do $$ begin
  create type public.treasury_direction as enum ('IN', 'OUT');
exception when duplicate_object then null; end $$;

/*
 * Module 06 §20 — l'origine de l'écriture.
 *
 * C'est un VOCABULAIRE de classement, non une liste de capacités : les valeurs
 * citées par §20 y figurent toutes. Une seule est produite aujourd'hui —
 * `SUPPLIER_PAYMENT` — et aucun écran ne produit les autres.
 */
do $$ begin
  create type public.treasury_entry_kind as enum (
    'SUPPLIER_PAYMENT',  -- paiement fournisseur   — SEUL PRODUIT PAR CE LOT
    'CUSTOMER_PAYMENT',  -- règlement client       — facture client : à venir
    'MISC_PAYMENT',      -- paiement divers        — à venir
    'DEPOSIT',           -- dépôt
    'WITHDRAWAL',        -- retrait
    'TRANSFER',          -- virement interne       — Module 06 §28 : à venir
    'CORRECTION'         -- correction autorisée   — §34
  );
exception when duplicate_object then null; end $$;

-- Module 06 §36 : « Pour le MVP, le système doit rester simple et ne proposer
-- que les états réellement nécessaires. » Deux suffisent : une écriture compte,
-- ou elle a été annulée avec l'opération qui l'a produite.
do $$ begin
  create type public.treasury_entry_status as enum ('VALIDATED', 'CANCELLED');
exception when duplicate_object then null; end $$;

/*
 * Workflow 08 §24 énumère Brouillon · En attente · Validé · Annulé, puis ajoute :
 * « Le statut définitif dépendra des règles d'implémentation. »
 *
 * DEUX ÉTATS SUFFISENT ICI, ET LE CATALOGUE LE DIT.
 *
 * `billing.supplier_payments` n'expose que `view`, `create` et `cancel` :
 * AUCUNE capacité de validation. Ce n'est pas un oubli — `billing.misc_payments`
 * en possède une, elle. §56 pose d'ailleurs la séparation saisie/validation
 * comme une faculté : « ADIKOM PEUT décider de séparer… ».
 *
 * Un règlement fournisseur CONSTATE un décaissement déjà effectué (Module 07
 * §35 : « les paiements EFFECTUÉS aux fournisseurs »). Il naît donc validé, et
 * s'annule. Créer une capacité de validation pour atteindre « Brouillon » et
 * « En attente » reviendrait à inventer une organisation qu'ADIKOM n'a pas
 * demandée (DEC-024).
 */
do $$ begin
  create type public.supplier_payment_status as enum ('VALIDATED', 'CANCELLED');
exception when duplicate_object then null; end $$;

/*
 * Workflow 08 §12 — les modes cités, sans ajout.
 *
 * « La liste définitive doit être configurable selon les pratiques d'ADIKOM » :
 * elle le sera par migration, comme tous les vocabulaires de ce système. Aucun
 * mécanisme de liste modifiable en exploitation n'est construit pour cela — il
 * n'en existe pour aucun autre type, et rien ne justifie d'en créer un ici
 * (CLAUDE.md §29).
 */
do $$ begin
  create type public.payment_method as enum (
    'CASH',           -- espèces
    'BANK_TRANSFER',  -- virement bancaire
    'BANK_DEPOSIT',   -- dépôt bancaire
    'CHEQUE',         -- chèque
    'OTHER'           -- autre mode validé
  );
exception when duplicate_object then null; end $$;


-- =============================================================================
-- LES COMPTES FINANCIERS — Module 06 §5 à §12
-- =============================================================================

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),

  -- §9 : COMP-000001. Règle `account` de `numbering_rules`, migration 005.
  account_no text not null unique,

  kind  public.financial_account_kind not null,
  label text not null,

  /*
   * §7 : le nom de la banque. §8 : le responsable de la caisse. Une seule
   * colonne pour les deux — c'est la même information, « qui tient ce
   * compte », et deux colonnes dont une serait toujours vide diraient moins.
   */
  institution text,

  -- §7 : numéro de compte ou référence interne. Donnée sensible : sa lecture
  -- relève de `treasury.accounts.view`, marquée sensible au catalogue.
  account_reference text,

  -- §11 : « Chaque compte doit être associé à une devise. » KMF par défaut,
  -- la colonne existant pour que d'autres soient possibles sans migration.
  currency_code text not null default 'KMF',

  /*
   * §12 : le solde initial est une information comptable identifiable, que
   * l'utilisateur ne doit pas pouvoir « modifier librement après le démarrage
   * du compte ». Il se fige donc dès la première écriture — voir le
   * déclencheur `financial_accounts_guard`.
   *
   * DEC-010 : entier, en KMF. Peut être négatif : un compte peut ouvrir à
   * découvert, et le refuser inventerait une règle (DEC-008).
   */
  opening_balance bigint not null default 0,
  opened_on       date,

  status public.financial_account_status not null default 'ACTIVE',

  description text,

  status_reason     text,
  status_changed_at timestamptz,
  status_changed_by uuid references public.app_users (id) on delete set null,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  constraint financial_accounts_label_not_blank check (btrim(label) <> '')
);

comment on table public.financial_accounts is
  'Comptes bancaires et caisses d''ADIKOM (Module 06 §5). Le solde n''y est pas stocké : il se calcule des écritures (§17).';
comment on column public.financial_accounts.opening_balance is
  'Solde initial (§12). Figé dès la première écriture : le modifier après coup déplacerait un solde sans mouvement correspondant.';
comment on column public.financial_accounts.institution is
  'Banque du compte (§7) ou responsable de la caisse (§8) — la même information selon le type.';

create index financial_accounts_status_idx on public.financial_accounts (status, label);


-- =============================================================================
-- LES ÉCRITURES — Module 06 §18 à §20
-- =============================================================================

create table public.treasury_entries (
  id uuid primary key default gen_random_uuid(),

  account_id uuid not null references public.financial_accounts (id) on delete restrict,

  entry_date date not null,
  direction  public.treasury_direction not null,
  kind       public.treasury_entry_kind not null,

  -- DEC-010 : entier positif. Le SENS porte le signe, jamais le montant : un
  -- montant négatif dans une sortie inverserait silencieusement l'opération.
  amount bigint not null check (amount > 0),

  description text,
  reference   text,

  status public.treasury_entry_status not null default 'VALIDATED',

  /*
   * §20 : « Lorsqu'une écriture provient d'un autre module, elle doit pouvoir
   * être reliée à son origine. » La clé étrangère est posée après la table des
   * règlements, qui n'existe pas encore à cette ligne.
   */
  supplier_payment_id uuid,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null
);

comment on table public.treasury_entries is
  'Mouvements financiers d''un compte (Module 06 §18). Une écriture ne se modifie ni ne se supprime : elle s''annule avec l''opération qui l''a produite.';
comment on column public.treasury_entries.amount is
  'Montant positif, en KMF. Le SENS porte le signe (§19) : jamais le montant.';
comment on column public.treasury_entries.supplier_payment_id is
  'Origine de l''écriture lorsqu''elle vient d''un règlement fournisseur (§20).';

create index treasury_entries_account_idx on public.treasury_entries (account_id, entry_date desc);
create index treasury_entries_status_idx  on public.treasury_entries (status);
create index treasury_entries_payment_idx on public.treasury_entries (supplier_payment_id)
  where supplier_payment_id is not null;


-- =============================================================================
-- LES RÈGLEMENTS FOURNISSEURS — Workflow 08, Module 07 §35 et §36
-- =============================================================================

create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),

  -- §9 : identifiant unique. Règle `payment` de `numbering_rules`, migration
  -- 005 (`REG`, année, six chiffres, remise à zéro annuelle), jamais consommée
  -- jusqu'ici. Le format reste paramétrable (même réserve que DEC-023 §4).
  payment_no text not null unique,

  supplier_invoice_id uuid not null
    references public.supplier_invoices (id) on delete restrict,

  /*
   * §13 : le compte financier mouvementé. `restrict` : un compte qui a servi
   * ne disparaît pas — de toute façon rien ne se supprime ici.
   */
  account_id uuid not null references public.financial_accounts (id) on delete restrict,

  -- DEC-010 : entier, en KMF.
  amount bigint not null check (amount > 0),

  /*
   * §11 : « La date réelle du règlement doit être enregistrée. Elle ne doit pas
   * être confondue avec la date de facture. » Deux colonnes, deux tables.
   */
  paid_on date not null,

  method public.payment_method not null,

  -- §16 : référence externe — numéro de virement, de chèque, de bordereau.
  external_ref text,
  notes        text,

  status public.supplier_payment_status not null default 'VALIDATED',

  /*
   * §57 : le règlement conserve qui l'a enregistré et quand. Saisie et
   * validation étant ici le même acte (§56 : la séparation est une faculté
   * qu'ADIKOM n'a pas demandée), le valideur est le créateur — et la donnée
   * reste distincte, pour le jour où la séparation existera.
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

  constraint supplier_payments_external_ref_not_blank check (
    external_ref is null or btrim(external_ref) <> ''
  ),

  -- §28 : un règlement annulé est historisé. Un état sans date est un acte que
  -- personne ne peut situer.
  constraint supplier_payments_cancellation_dated check (
    status <> 'CANCELLED' or cancelled_at is not null
  )
);

comment on table public.supplier_payments is
  'Décaissement constatant le règlement d''une facture fournisseur (Workflow 08). Distinct d''une imputation, qui n''est jamais un paiement (Module 07 §37).';
comment on column public.supplier_payments.paid_on is
  'Date réelle du règlement (§11). Jamais confondue avec la date de la facture.';
comment on column public.supplier_payments.status is
  '« Payée » et « Partiellement payée » ne sont pas des états DU RÈGLEMENT mais de la FACTURE, et se calculent (Module 07 §55).';

create index supplier_payments_invoice_idx on public.supplier_payments (supplier_invoice_id);
create index supplier_payments_account_idx on public.supplier_payments (account_id, paid_on desc);
create index supplier_payments_status_idx  on public.supplier_payments (status);

-- §20 : l'écriture est reliée à son origine.
alter table public.treasury_entries
  add constraint treasury_entries_supplier_payment_fkey
  foreign key (supplier_payment_id)
  references public.supplier_payments (id) on delete restrict;


-- =============================================================================
-- LE SOLDE — CALCULÉ, JAMAIS STOCKÉ (Module 06 §17)
--
--   Solde initial + entrées − sorties = solde actuel
--
-- Une colonne `balance` serait une seconde source du même chiffre, capable de
-- diverger de ses écritures — exactement ce que §17 interdit : « le système
-- doit éviter que le solde soit simplement modifié manuellement sans écriture
-- correspondante ».
--
-- POURQUOI LA FONCTION EXIGE SA CAPACITÉ
--
-- `treasury.balances.view` existe au catalogue, DISTINCTE de
-- `treasury.accounts.view`. Voir un compte et voir ce qu'il contient sont donc
-- deux droits (DEC-024). Sans la garde, un appel direct au calcul rendrait le
-- second gratuit dès qu'on détient le premier.
--
-- (La migration 050 y ajoute `treasury.entries.view` : la somme porte sur des
-- écritures lues sous RLS, et sans ce droit elle renverrait un solde faux.)
-- =============================================================================

create or replace function public.financial_account_balance(p_account_id uuid)
returns bigint
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_opening bigint;
  v_in      bigint;
  v_out     bigint;
begin
  perform public.require_capability(
    array['treasury.balances.view'], 'consulter le solde d''un compte financier'
  );

  select a.opening_balance into v_opening
  from public.financial_accounts a where a.id = p_account_id;

  if v_opening is null then
    return null;   -- compte introuvable, ou invisible : on n'invente pas un zéro
  end if;

  select
    coalesce(sum(e.amount) filter (where e.direction = 'IN'), 0),
    coalesce(sum(e.amount) filter (where e.direction = 'OUT'), 0)
  into v_in, v_out
  from public.treasury_entries e
  where e.account_id = p_account_id
    and e.status = 'VALIDATED';

  return v_opening + v_in - v_out;
end;
$$;

comment on function public.financial_account_balance(uuid) is
  'Solde initial + entrées − sorties, écritures validées seulement (Module 06 §17). Exige `balances.view` ET `entries.view` : une somme sur des écritures illisibles serait fausse.';


/**
 * Total réglé sur une facture — Workflow 08 §21.
 *
 * « Solde = Montant dû − Total des paiements VALIDÉS. » Un règlement annulé
 * n'est plus comptabilisé (§28) : il sort de la somme, comme l'imputation
 * annulée sort du plafond.
 */
create or replace function public.supplier_invoice_paid(p_invoice_id uuid)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(p.amount), 0)::bigint
  from public.supplier_payments p
  where p.supplier_invoice_id = p_invoice_id
    and p.status = 'VALIDATED';
$$;

comment on function public.supplier_invoice_paid(uuid) is
  'Σ des règlements validés d''une facture (§21). Lue sous `billing.supplier_payments.view` : sans ce droit elle vaut 0, et l''acte qui s''y fie doit refuser.';


-- =============================================================================
-- COUCHE 2 · CE QUI SE FIGE
-- =============================================================================

/**
 * Le solde initial ne bouge plus dès qu'une écriture existe — §12.
 *
 * Le modifier après coup déplacerait le solde du compte sans qu'aucun mouvement
 * ne l'explique : c'est précisément ce que §17 proscrit.
 */
create or replace function public.fn_financial_account_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.opening_balance is distinct from old.opening_balance
     or new.currency_code is distinct from old.currency_code
     or new.kind is distinct from old.kind then

    if exists (select 1 from public.treasury_entries e where e.account_id = new.id) then
      raise exception
        'Opération refusée : ce compte porte des écritures. Son solde initial, sa devise et son type ne se modifient plus — les corriger déplacerait un solde sans mouvement correspondant (Module 06 §12, §17).'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.fn_financial_account_guard is
  'Fige le solde initial, la devise et le type dès la première écriture (Module 06 §12).';


/**
 * Une écriture ne se modifie jamais — Module 06 §34 et §35.
 *
 * « Les écritures financières importantes ne doivent pas être modifiées
 * arbitrairement. » Seul son STATUT change, et seulement pour suivre le sort de
 * l'opération qui l'a produite.
 */
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
     or new.supplier_payment_id is distinct from old.supplier_payment_id then
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


/**
 * Une écriture d'origine « règlement » dit la vérité sur son règlement.
 *
 * Sans ce contrôle, un `POST` direct pourrait fabriquer une écriture qui se
 * réclame d'un règlement sans en reprendre le compte, le montant ni le sens —
 * et le solde du compte deviendrait faux tout en paraissant justifié.
 */
create or replace function public.fn_treasury_entry_source()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  p public.supplier_payments%rowtype;
begin
  if new.supplier_payment_id is null then
    -- Aucune origine : l'écriture est libre, et relève alors de
    -- `treasury.entries.create` seule (voir la policy).
    if new.kind = 'SUPPLIER_PAYMENT' then
      raise exception
        'Opération refusée : une écriture de type « paiement fournisseur » doit désigner le règlement dont elle provient (Module 06 §20).'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  select * into p from public.supplier_payments where id = new.supplier_payment_id;

  if not found then
    raise exception
      'Le règlement dont se réclame cette écriture est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if new.kind <> 'SUPPLIER_PAYMENT'
     or new.direction <> 'OUT'
     or new.amount is distinct from p.amount
     or new.account_id is distinct from p.account_id then
    raise exception
      'Opération refusée : cette écriture ne correspond pas au règlement dont elle se réclame. Un règlement fournisseur est une SORTIE, du montant réglé, sur le compte mouvementé (Workflow 08 §47).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_treasury_entry_source is
  'Une écriture issue d''un règlement en reprend le compte, le montant et le sens (§47). Ferme la fabrication d''écritures par appel direct.';


create trigger financial_accounts_guard
  before update on public.financial_accounts
  for each row execute function public.fn_financial_account_guard();

create trigger financial_accounts_updated_at
  before update on public.financial_accounts
  for each row execute function public.fn_set_updated_at();

create trigger financial_accounts_audit
  after insert or update on public.financial_accounts
  for each row execute function public.fn_audit_row('treasury');

create trigger financial_accounts_no_delete
  before delete on public.financial_accounts
  for each row execute function public.fn_forbid_delete();

create trigger treasury_entries_immutable
  before update on public.treasury_entries
  for each row execute function public.fn_treasury_entry_immutable();

create trigger treasury_entries_source
  before insert or update on public.treasury_entries
  for each row execute function public.fn_treasury_entry_source();

create trigger treasury_entries_updated_at
  before update on public.treasury_entries
  for each row execute function public.fn_set_updated_at();

create trigger treasury_entries_audit
  after insert or update on public.treasury_entries
  for each row execute function public.fn_audit_row('treasury');

create trigger treasury_entries_no_delete
  before delete on public.treasury_entries
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- COUCHE 3 · LE RÈGLEMENT NAÎT VALIDÉ, ET NE CHANGE QU'EN S'ANNULANT
-- =============================================================================

create or replace function public.fn_supplier_payment_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    if old.status = 'VALIDATED' and new.status = 'CANCELLED' then
      perform public.require_capability(
        array['billing.supplier_payments.cancel'], 'annuler un règlement fournisseur'
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
     or new.supplier_invoice_id is distinct from old.supplier_invoice_id
     or new.paid_on is distinct from old.paid_on
     or new.method is distinct from old.method then
    raise exception
      'Opération refusée : un règlement ne se modifie pas. Il s''annule, et un règlement correct est enregistré (Workflow 08 §30, §31).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_supplier_payment_transition is
  'Un règlement naît validé et ne change qu''en s''annulant, sous `supplier_payments.cancel`. Aucune correction sur place (§30, §31).';


-- Un règlement naît VALIDÉ : l'INSERT direct ne peut pas le faire naître
-- annulé, ce qui produirait une écriture sans contrepartie.
create or replace function public.fn_supplier_payment_starts_validated()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'VALIDATED' then
    raise exception
      'Opération refusée : un règlement constate un décaissement effectué. Il naît validé, et s''annule ensuite si nécessaire.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger supplier_payments_starts_validated
  before insert on public.supplier_payments
  for each row execute function public.fn_supplier_payment_starts_validated();

create trigger supplier_payments_transition
  before update on public.supplier_payments
  for each row execute function public.fn_supplier_payment_transition();

create trigger supplier_payments_updated_at
  before update on public.supplier_payments
  for each row execute function public.fn_set_updated_at();

create trigger supplier_payments_audit
  after insert or update on public.supplier_payments
  for each row execute function public.fn_audit_row('billing');

create trigger supplier_payments_no_delete
  before delete on public.supplier_payments
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- UNE FACTURE RÉGLÉE NE S'ANNULE PAS
--
-- Le LOT 5 refuse déjà l'annulation d'une facture portant une imputation :
-- annuler laisserait une déduction pesant sur un document annulé. Un règlement
-- pose le même problème, en pire — l'argent est sorti du compte.
-- =============================================================================

create or replace function public.fn_supplier_invoice_no_cancel_when_paid()
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

  if public.current_actor() is not null
     and not public.has_permission('billing.supplier_payments.view') then
    raise exception
      'Opération refusée : annuler une facture exige de pouvoir consulter les règlements qui la soldent.'
      using errcode = 'insufficient_privilege';
  end if;

  v_paid := public.supplier_invoice_paid(new.id);

  if v_paid > 0 then
    raise exception
      'Opération refusée : % KMF ont été réglés sur cette facture. Chaque règlement doit d''abord être annulé.', v_paid
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_supplier_invoice_no_cancel_when_paid is
  'Une facture réglée ne s''annule pas : l''argent est sorti du compte. Les règlements s''annulent d''abord.';

create trigger supplier_invoices_zz_no_cancel_when_paid
  before update on public.supplier_invoices
  for each row execute function public.fn_supplier_invoice_no_cancel_when_paid();


-- =============================================================================
-- « PAYÉE » ET « PARTIELLEMENT PAYÉE » RESTENT DÉRIVÉES
--
-- Le LOT 5 les refusait faute de règlements. Ils existent : le refus demeure,
-- et seul son motif change. Module 07 §55 : « La logique doit être calculée
-- automatiquement. » Un statut stocké pourrait contredire la somme qui le dit.
-- =============================================================================

create or replace function public.fn_supplier_invoice_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_gross   bigint;
  v_imputed bigint;
begin
  if new.status is distinct from old.status then

    if new.status in ('PARTIALLY_PAID', 'PAID') then
      raise exception
        'Opération refusée : l''état de règlement d''une facture se CALCULE des règlements enregistrés (Module 07 §55). Il ne se déclare pas — un statut écrit pourrait contredire la somme qui le dit.'
        using errcode = 'check_violation';
    end if;

    if new.status = 'OVERDUE' then
      raise exception
        'Opération refusée : « En retard » se déduit de l''échéance et de la date du jour. Ce statut ne s''écrit pas.'
        using errcode = 'check_violation';
    end if;

    case
      when old.status = 'DRAFT' and new.status = 'PENDING' then
        perform public.require_capability(
          array['billing.supplier_invoices.update'], 'soumettre une facture fournisseur au contrôle'
        );

      when old.status = 'PENDING' and new.status = 'DRAFT' then
        perform public.require_capability(
          array['billing.supplier_invoices.update'], 'remettre une facture fournisseur en saisie'
        );

      when old.status = 'PENDING' and new.status = 'VALIDATED' then
        perform public.require_capability(
          array['billing.supplier_invoices.validate'], 'valider une facture fournisseur'
        );

        v_gross := public.supplier_invoice_gross(new.id);

        if v_gross <= 0 then
          raise exception
            'Opération refusée : cette facture ne porte aucune ligne, ou ses lignes ne sont pas lisibles avec vos droits. Un montant brut est nécessaire à la validation.'
            using errcode = 'check_violation';
        end if;

      when old.status in ('DRAFT', 'PENDING', 'VALIDATED')
           and new.status = 'CANCELLED' then
        perform public.require_capability(
          array['billing.supplier_invoices.cancel'], 'annuler une facture fournisseur'
        );

        if public.current_actor() is not null
           and not public.has_permission('billing.imputations.view') then
          raise exception
            'Opération refusée : annuler une facture exige de pouvoir consulter les imputations qui la réduisent.'
            using errcode = 'insufficient_privilege';
        end if;

        v_imputed := public.supplier_invoice_imputed(new.id);

        if v_imputed > 0 then
          raise exception
            'Opération refusée : % KMF sont imputés sur cette facture. Chaque imputation doit d''abord en être détachée.', v_imputed
            using errcode = 'check_violation';
        end if;

      else
        raise exception
          'Transition de facture fournisseur refusée : % ne peut pas devenir %.', old.status, new.status
          using errcode = 'check_violation';
    end case;
  end if;

  if old.status in ('VALIDATED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')
     and (new.supplier_id  is distinct from old.supplier_id
       or new.invoice_date is distinct from old.invoice_date
       or new.due_date     is distinct from old.due_date
       or new.external_ref is distinct from old.external_ref
       or new.invoice_no   is distinct from old.invoice_no) then
    raise exception
      'Opération refusée : une facture fournisseur validée ou annulée ne se modifie plus. Son annulation, elle, conserve l''historique.'
      using errcode = 'check_violation';
  end if;

  if old.status in ('DRAFT', 'PENDING')
     and (new.supplier_id  is distinct from old.supplier_id
       or new.invoice_date is distinct from old.invoice_date
       or new.due_date     is distinct from old.due_date
       or new.external_ref is distinct from old.external_ref
       or new.notes        is distinct from old.notes) then
    perform public.require_capability(
      array['billing.supplier_invoices.update'], 'modifier une facture fournisseur'
    );
  end if;

  return new;
end;
$$;

comment on function public.fn_supplier_invoice_transition is
  'Chaque transition exige SA capacité. « Payée », « Partiellement payée » et « En retard » se calculent : aucune ne s''écrit.';


-- =============================================================================
-- COUCHE 1 · LES FONCTIONS
--
-- Chacune vérifie la capacité qu'elle incarne AVANT d'engager le travail.
-- Aucune n'est `SECURITY DEFINER`.
-- =============================================================================

/** Ouvre un compte bancaire ou une caisse — Module 06 §6, §7, §8. */
create or replace function public.create_financial_account(
  p_kind              public.financial_account_kind,
  p_label             text,
  p_institution       text default null,
  p_account_reference text default null,
  p_opening_balance   bigint default 0,
  p_opened_on         date default null,
  p_description       text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_no text;
begin
  perform public.require_capability(
    array['treasury.accounts.create'], 'ouvrir un compte financier'
  );
  perform public.require_capability(
    array['treasury.accounts.view'], 'consulter le compte ouvert'
  );

  if coalesce(btrim(p_label), '') = '' then
    raise exception 'Un compte financier doit être nommé (Module 06 §6).'
      using errcode = 'check_violation';
  end if;

  v_no := public.next_number('account');

  insert into public.financial_accounts
    (account_no, kind, label, institution, account_reference,
     opening_balance, opened_on, description, created_by, updated_by)
  values
    (v_no, p_kind, btrim(p_label),
     nullif(btrim(coalesce(p_institution, '')), ''),
     nullif(btrim(coalesce(p_account_reference, '')), ''),
     coalesce(p_opening_balance, 0), p_opened_on,
     nullif(btrim(coalesce(p_description, '')), ''),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.create_financial_account is
  'Ouvre un compte bancaire ou une caisse. Le solde initial est enregistré une fois ; il se fige à la première écriture (§12).';


/** Modifie un compte — le solde initial se fige dès la première écriture. */
create or replace function public.update_financial_account(
  p_account_id        uuid,
  p_label             text,
  p_institution       text default null,
  p_account_reference text default null,
  p_opening_balance   bigint default null,
  p_opened_on         date default null,
  p_description       text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  a public.financial_accounts%rowtype;
begin
  perform public.require_capability(
    array['treasury.accounts.update'], 'modifier un compte financier'
  );
  perform public.require_capability(
    array['treasury.accounts.view'], 'consulter le compte à modifier'
  );

  select * into a from public.financial_accounts where id = p_account_id for update;

  if not found then
    raise exception 'Compte financier introuvable.' using errcode = 'no_data_found';
  end if;

  if coalesce(btrim(p_label), '') = '' then
    raise exception 'Un compte financier doit être nommé.' using errcode = 'check_violation';
  end if;

  update public.financial_accounts
     set label             = btrim(p_label),
         institution       = nullif(btrim(coalesce(p_institution, '')), ''),
         account_reference = nullif(btrim(coalesce(p_account_reference, '')), ''),
         opening_balance   = coalesce(p_opening_balance, a.opening_balance),
         opened_on         = p_opened_on,
         description       = nullif(btrim(coalesce(p_description, '')), ''),
         updated_by        = public.current_actor()
   where id = a.id;
end;
$$;

comment on function public.update_financial_account is
  'Modifie un compte. Le déclencheur refuse de toucher au solde initial dès qu''une écriture existe (§12, §17).';


/** Change le statut d'un compte — Module 06 §10. */
create or replace function public.set_financial_account_status(
  p_account_id uuid,
  p_status     public.financial_account_status,
  p_reason     text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.require_capability(
    array['treasury.accounts.archive'], 'changer le statut d''un compte financier'
  );
  perform public.require_capability(
    array['treasury.accounts.view'], 'consulter le compte concerné'
  );

  update public.financial_accounts
     set status            = p_status,
         status_reason     = nullif(btrim(coalesce(p_reason, '')), ''),
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = p_account_id;

  if not found then
    raise exception 'Compte financier introuvable.' using errcode = 'no_data_found';
  end if;
end;
$$;

comment on function public.set_financial_account_status is
  'Actif, inactif, archivé (§10). Un compte non actif n''est plus proposé pour une nouvelle opération ; son historique reste consultable.';


/**
 * Enregistre un règlement fournisseur — Workflow 08.
 *
 * CINQ CAPACITÉS, NOMMÉMENT.
 *
 *   `billing.supplier_payments.create`  l'acte lui-même
 *   `billing.supplier_payments.view`    relire le règlement, et le contrôle
 *                                       de cohérence de son écriture
 *   `billing.supplier_invoices.view`    le montant brut, dont dépend le net
 *   `billing.imputations.view`          les imputations, dont dépend le net
 *   `treasury.accounts.view`            le compte mouvementé (§13)
 *
 * Les quatre lectures ne sont pas du décor. §21 pose que le solde se calcule du
 * montant DÛ, §22 qu'un règlement supérieur à ce reste doit être signalé : sans
 * ces lectures, le contrôle porterait sur des sommes muettes et laisserait
 * passer exactement ce qu'il doit refuser.
 *
 * L'ÉCRITURE EST UNE CONSÉQUENCE, PAS UN SECOND ACTE.
 *
 * `treasury.entries.create` n'est PAS exigée : le règlement PRODUIT son
 * écriture, il ne l'écrit pas librement. Même traitement que l'occupation de
 * calendrier posée par une maintenance, qui ne réclame aucune capacité de
 * calendrier. La policy d'insertion des écritures le dit explicitement, et le
 * déclencheur `treasury_entries_source` vérifie que l'écriture correspond bien
 * à son règlement.
 */
create or replace function public.record_supplier_payment(
  p_invoice_id   uuid,
  p_account_id   uuid,
  p_amount       bigint,
  p_paid_on      date,
  p_method       public.payment_method,
  p_external_ref text default null,
  p_notes        text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id       uuid;
  v_no       text;
  f          public.supplier_invoices%rowtype;
  v_acc      public.financial_accounts%rowtype;
  v_gross    bigint;
  v_imputed  bigint;
  v_paid     bigint;
  v_due      bigint;
begin
  perform public.require_capability(
    array['billing.supplier_payments.create'], 'enregistrer un règlement fournisseur'
  );
  perform public.require_capability(
    array['billing.supplier_payments.view'], 'consulter les règlements de cette facture'
  );
  perform public.require_capability(
    array['billing.supplier_invoices.view'], 'consulter la facture à régler'
  );
  perform public.require_capability(
    array['billing.imputations.view'], 'consulter les imputations qui réduisent la facture'
  );
  perform public.require_capability(
    array['treasury.accounts.view'], 'consulter le compte à mouvementer'
  );

  if p_amount is null or p_amount <= 0 then
    raise exception 'Le montant du règlement doit être un entier positif, en KMF.'
      using errcode = 'check_violation';
  end if;

  if p_paid_on is null then
    raise exception 'La date réelle du règlement est obligatoire (Workflow 08 §11).'
      using errcode = 'check_violation';
  end if;

  select * into f from public.supplier_invoices where id = p_invoice_id for update;

  if not found then
    raise exception
      'La facture à régler est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  -- Une facture non validée n'est pas une dette reconnue ; une facture annulée
  -- n'en est plus une.
  if f.status <> 'VALIDATED' then
    raise exception
      'Opération refusée : seule une facture fournisseur validée peut être réglée.'
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

  /*
   * §21 : Solde = Montant dû − Σ règlements validés, le montant dû étant le NET
   * à payer après imputations (§33 : « le paiement doit tenir compte du montant
   * net réellement dû après imputation »).
   */
  v_gross   := public.supplier_invoice_gross(p_invoice_id);
  v_imputed := public.supplier_invoice_imputed(p_invoice_id);
  v_paid    := public.supplier_invoice_paid(p_invoice_id);
  v_due     := v_gross - v_imputed - v_paid;

  -- §23 : « Une facture dont le solde est nul ne doit normalement plus accepter
  -- de nouveau paiement. »
  if v_due <= 0 then
    raise exception
      'Opération refusée : cette facture est déjà soldée. Aucun règlement supplémentaire n''est accepté (Workflow 08 §23).'
      using errcode = 'check_violation';
  end if;

  -- §22 : « Le système doit signaler l'anomalie. Il ne doit pas créer
  -- automatiquement un solde négatif sans règle métier explicitement définie. »
  if p_amount > v_due then
    raise exception
      'Opération refusée : le règlement (% KMF) dépasse le reste dû sur cette facture (% KMF). Aucun solde négatif n''est créé automatiquement (Workflow 08 §22).',
      p_amount, v_due
      using errcode = 'check_violation';
  end if;

  v_no := public.next_number('payment');

  insert into public.supplier_payments
    (payment_no, supplier_invoice_id, account_id, amount, paid_on, method,
     external_ref, notes, validated_by, created_by, updated_by)
  values
    (v_no, p_invoice_id, p_account_id, p_amount, p_paid_on, p_method,
     nullif(btrim(coalesce(p_external_ref, '')), ''),
     nullif(btrim(coalesce(p_notes, '')), ''),
     public.current_actor(), public.current_actor(), public.current_actor())
  returning id into v_id;

  -- §47 : un paiement fournisseur DIMINUE le compte. L'écriture est la
  -- conséquence du règlement, jamais un acte séparé.
  insert into public.treasury_entries
    (account_id, entry_date, direction, kind, amount, description, reference,
     supplier_payment_id, created_by, updated_by)
  values
    (p_account_id, p_paid_on, 'OUT', 'SUPPLIER_PAYMENT', p_amount,
     'Règlement ' || v_no || ' — facture ' || f.invoice_no,
     nullif(btrim(coalesce(p_external_ref, '')), ''),
     v_id, public.current_actor(), public.current_actor());

  return v_id;
end;
$$;

comment on function public.record_supplier_payment is
  'Constate un décaissement et produit son écriture (§13, §47). Refuse au-delà du reste dû (§22) et sur une facture soldée (§23).';


/**
 * Annule un règlement — Workflow 08 §28 et §29.
 *
 * « Un paiement annulé ne doit plus être comptabilisé dans le total des
 * paiements valides. » L'écriture qu'il a produite est annulée avec lui : le
 * solde du compte remonte, celui de la facture aussi. Rien n'est effacé.
 */
create or replace function public.cancel_supplier_payment(
  p_payment_id uuid,
  p_reason     text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  p public.supplier_payments%rowtype;
begin
  perform public.require_capability(
    array['billing.supplier_payments.cancel'], 'annuler un règlement fournisseur'
  );
  perform public.require_capability(
    array['billing.supplier_payments.view'], 'consulter le règlement à annuler'
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
end;
$$;

comment on function public.cancel_supplier_payment is
  'Annule un règlement et l''écriture qu''il a produite (§28, §29). Le solde du compte et celui de la facture remontent ; l''historique reste.';


-- =============================================================================
-- DROITS D'EXÉCUTION — DEC-022
-- =============================================================================

revoke execute on function public.financial_account_balance(uuid) from public;
grant  execute on function public.financial_account_balance(uuid) to authenticated, service_role;

revoke execute on function public.supplier_invoice_paid(uuid) from public;
grant  execute on function public.supplier_invoice_paid(uuid) to authenticated, service_role;

revoke execute on function public.create_financial_account(
  public.financial_account_kind, text, text, text, bigint, date, text) from public;
grant  execute on function public.create_financial_account(
  public.financial_account_kind, text, text, text, bigint, date, text)
  to authenticated, service_role;

revoke execute on function public.update_financial_account(
  uuid, text, text, text, bigint, date, text) from public;
grant  execute on function public.update_financial_account(
  uuid, text, text, text, bigint, date, text)
  to authenticated, service_role;

revoke execute on function public.set_financial_account_status(
  uuid, public.financial_account_status, text) from public;
grant  execute on function public.set_financial_account_status(
  uuid, public.financial_account_status, text)
  to authenticated, service_role;

revoke execute on function public.record_supplier_payment(
  uuid, uuid, bigint, date, public.payment_method, text, text) from public;
grant  execute on function public.record_supplier_payment(
  uuid, uuid, bigint, date, public.payment_method, text, text)
  to authenticated, service_role;

revoke execute on function public.cancel_supplier_payment(uuid, text) from public;
grant  execute on function public.cancel_supplier_payment(uuid, text)
  to authenticated, service_role;


-- =============================================================================
-- COUCHE 4 · RLS
-- =============================================================================

revoke all    on public.financial_accounts from anon;
revoke all    on public.treasury_entries   from anon;
revoke all    on public.supplier_payments  from anon;

revoke delete on public.financial_accounts from authenticated;
revoke delete on public.treasury_entries   from authenticated;
revoke delete on public.supplier_payments  from authenticated;

alter table public.financial_accounts enable row level security;
alter table public.treasury_entries   enable row level security;
alter table public.supplier_payments  enable row level security;

create policy financial_accounts_select on public.financial_accounts
  for select to authenticated
  using (public.has_permission('treasury.accounts.view'));

create policy financial_accounts_insert on public.financial_accounts
  for insert to authenticated
  with check (public.has_permission('treasury.accounts.create'));

create policy financial_accounts_update on public.financial_accounts
  for update to authenticated
  using (
    public.has_permission('treasury.accounts.update')
    or public.has_permission('treasury.accounts.archive')
  )
  with check (
    public.has_permission('treasury.accounts.update')
    or public.has_permission('treasury.accounts.archive')
  );

create policy treasury_entries_select on public.treasury_entries
  for select to authenticated
  using (public.has_permission('treasury.entries.view'));

/*
 * UNE ÉCRITURE LIBRE EXIGE `treasury.entries.create`.
 *
 * Celle qui PROVIENT d'un règlement suit la capacité du règlement : elle en est
 * la conséquence, pas un acte distinct. Le déclencheur `treasury_entries_source`
 * vérifie qu'elle correspond réellement au règlement dont elle se réclame —
 * sans quoi cette ouverture permettrait d'écrire n'importe quoi.
 */
create policy treasury_entries_insert on public.treasury_entries
  for insert to authenticated
  with check (
    public.has_permission('treasury.entries.create')
    or (
      supplier_payment_id is not null
      and public.has_permission('billing.supplier_payments.create')
    )
  );

-- Seul le statut change, et seulement pour suivre l'annulation d'un règlement.
create policy treasury_entries_update on public.treasury_entries
  for update to authenticated
  using (public.has_permission('billing.supplier_payments.cancel'))
  with check (public.has_permission('billing.supplier_payments.cancel'));

create policy supplier_payments_select on public.supplier_payments
  for select to authenticated
  using (public.has_permission('billing.supplier_payments.view'));

create policy supplier_payments_insert on public.supplier_payments
  for insert to authenticated
  with check (public.has_permission('billing.supplier_payments.create'));

create policy supplier_payments_update on public.supplier_payments
  for update to authenticated
  using (public.has_permission('billing.supplier_payments.cancel'))
  with check (public.has_permission('billing.supplier_payments.cancel'));


-- =============================================================================
-- CONTRÔLE DE NON-RÉGRESSION DU CATALOGUE
--
-- Le LOT 6 n'ajoute aucune permission : les huit codes employés existent depuis
-- la migration 007.
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
    'treasury.accounts.view',
    'treasury.accounts.create',
    'treasury.accounts.update',
    'treasury.accounts.archive',
    'treasury.balances.view',
    'treasury.entries.view',
    'treasury.entries.export',
    'billing.supplier_payments.view',
    'billing.supplier_payments.create',
    'billing.supplier_payments.cancel'
  ]) c
  where not exists (select 1 from public.permissions p where p.code = c);

  if v_missing is not null then
    raise exception 'Capacités absentes du catalogue : %', v_missing;
  end if;

  if not exists (select 1 from public.numbering_rules where entity_key in ('account', 'payment')) then
    raise exception 'Règles de numérotation « account » et « payment » absentes.';
  end if;
end $$;
