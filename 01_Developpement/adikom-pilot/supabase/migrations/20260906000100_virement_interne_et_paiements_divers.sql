-- =============================================================================
-- ADIKOM PILOT — 071 · Virement interne et Paiements divers
-- Étape 2.5 / Module 06 §28 à §33 · Module 07 §43 à §46 — LOT 17
--
-- LES DEUX DERNIERS SOUS-MENUS « À VENIR »
--
-- Le LOT 6 avait posé le socle de Banques & Caisses en écartant explicitement
-- le virement interne (DEC-029 §i). Le LOT 8 avait écarté le paiement divers.
-- Les deux tables manquantes sont les seules qui restent entre le système et un
-- module 6 complet.
--
-- CE QUE CETTE MIGRATION LIVRE
--
--   · VIREMENT INTERNE — un transfert entre deux comptes d'ADIKOM, qui produit
--     DEUX écritures liées : une sortie sur la source, une entrée sur la
--     destination (§31). Jamais l'une sans l'autre.
--   · PAIEMENT DIVERS — un décaissement qui ne se rattache à aucune facture
--     (Module 07 §43), et l'écriture de sortie qu'il produit (§45).
--
-- LA SÉPARATION SAISIE / VALIDATION EXISTE ICI, ET LE CATALOGUE LE DIT
--
-- DEC-029 §c a posé la doctrine : le catalogue est l'autorité sur la question
-- de savoir si une opération se valide en un ou deux temps.
--
--   `billing.supplier_payments`  view · create · cancel                → un acte
--   `billing.customer_payments`  view · create · cancel                → un acte
--   `billing.misc_payments`      view · create · VALIDATE · cancel     → deux
--   `treasury.transfers`         create · VALIDATE · cancel            → deux
--
-- Module 07 §46 le confirme mot pour mot pour le paiement divers : « Brouillon ;
-- Validé ; Annulé ». Module 06 §45 nomme, parmi les notifications du module,
-- « opération nécessitant une validation » — et le virement est la seule
-- opération de trésorerie à porter une capacité de validation.
--
-- Un règlement CONSTATE un mouvement déjà survenu ; il naît validé. Un virement
-- et un paiement divers, eux, DÉCIDENT d'un mouvement : l'argent ne bouge qu'à
-- la validation. C'est aussi le seul ordre qui permette au contrôle de solde de
-- §30 de porter sur l'instant où les fonds sortent réellement.
--
-- Arbitrage ADIKOM du 05/09/2026 (DEC-040) : cette lecture est retenue.
--
-- LA SEULE CAPACITÉ CRÉÉE, ET POURQUOI ELLE MANQUAIT
--
-- `treasury.transfers.view`. Le catalogue de la migration 007 ouvrait le menu
-- « Virements internes » avec create · validate · cancel, sans lecture. Or un
-- virement en BROUILLON n'a produit aucune écriture : personne ne pouvait le
-- lire pour le valider. Une capacité de validation sans lecture correspondante
-- est inapplicable.
--
-- Elle n'est pas déduite d'une autre (DEC-024) : consulter les virements n'est
-- ni consulter les écritures, ni en effectuer un. Catalogue : 170 → 171.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS
--
--   · AUCUNE ÉCRITURE LIBRE. `treasury.entries.create` reste sans écran :
--     dépôt, retrait et correction (Module 06 §20, §34) figurent au vocabulaire,
--     aucun acte ne les produit.
--   · AUCUN JUSTIFICATIF de paiement divers (Module 07 §44) : aucune capacité
--     de document n'existe pour ce menu, et en créer une d'office inventerait
--     une fonctionnalité (DEC-024, précédent DEC-029 §i).
--   · AUCUN MODE DE PAIEMENT sur le paiement divers : §44 énumère ses
--     informations et n'en cite pas. Le TYPE DU COMPTE — banque ou caisse — dit
--     déjà par où l'argent est sorti.
--   · AUCUNE MODIFICATION après saisie. Module 07 §52 cite « modifier » parmi
--     les permissions envisageables, mais `billing.misc_payments.update`
--     n'existe pas au catalogue. Un brouillon erroné s'annule, et un paiement
--     correct est saisi — comme un règlement (Workflow 08 §30, §31).
--   · AUCUN CONTRÔLE DE DÉCOUVERT hors du virement. DEC-029 §b : la
--     documentation ne définit ni découvert autorisé ni seuil, et Module 06 §30
--     ne pose ce contrôle que pour le virement. Il est donc appliqué LÀ, et
--     nulle part ailleurs.
--   · AUCUN FORMAT DE NUMÉROTATION INVENTÉ. La règle `transfer` — « Virement
--     interne », `VIR`, année, six chiffres — existe depuis la migration 005.
--     Le paiement divers emprunte la série `payment` (REG), générique et déjà
--     partagée par les deux règlements (DEC-031).
--
-- LES CINQ COUCHES, RECONDUITES — ET UNE SIXIÈME
--
--   1. FONCTION      — chaque acte vérifie SA capacité par `require_capability`.
--   2. DONNÉE        — montant, comptes et date se figent dès la création.
--   3. TRANSITION    — Brouillon → Validé → Annulé, et rien d'autre.
--   4. RLS           — lecture, création, validation, annulation.
--   5. ÉTAT DE DÉPART— un virement et un paiement divers naissent BROUILLON,
--                      y compris par `INSERT` direct.
--   6. COHÉRENCE DIFFÉRÉE — un contrôle `deferrable initially deferred` vérifie,
--                      À LA VALIDATION DE LA TRANSACTION, qu'un virement validé
--                      porte EXACTEMENT ses deux écritures et qu'un paiement
--                      divers validé porte EXACTEMENT la sienne.
--
-- LA SIXIÈME COUCHE EST CE QUI REND LE DEMI-VIREMENT IMPOSSIBLE
--
-- Les couches 1 à 5 encadrent les actes. Aucune n'empêche à elle seule qu'un
-- `PATCH` direct passe un virement à « Validé » sans produire d'écriture, ni
-- qu'un porteur de `treasury.entries.create` fabrique une troisième écriture se
-- réclamant d'un virement. Un contrôle différé le fait : il s'exécute quand tout
-- est écrit, et refuse la transaction ENTIÈRE si le compte n'y est pas.
--
-- Il COMPTE — donc il doit compter la vérité. Sous RLS, un appelant sans
-- `treasury.entries.view` n'en verrait aucune et conclurait « zéro ». Les actes
-- qui déclenchent ce contrôle exigent donc cette lecture nommément : c'est la
-- doctrine de la migration 054, appliquée en amont plutôt qu'après coup.
--
-- Aucune fonction n'est `SECURITY DEFINER` (DEC-022, DEC-026 §f).
-- =============================================================================


-- =============================================================================
-- 0. LA CAPACITÉ MANQUANTE — `treasury.transfers.view`
--
-- La liste de colonnes commence par `(code, module_code` : c'est la forme que le
-- contrôle de parité TS/SQL (`permissions.test.ts`) reconnaît pour rejouer le
-- catalogue sans interpréter du SQL.
-- =============================================================================

with nouvelles (code, module_code, menu_code, menu_label, action, label, rang) as (values
  ('treasury.transfers.view', 'treasury', 'transfers', 'Virements internes',
   'VIEW', 'Consulter les virements internes', 1)
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
  n.menu_label,
  null,
  null,
  n.action::public.permission_action,
  n.label,
  -- Un virement expose des comptes et des montants : sensible, comme toutes les
  -- capacités de trésorerie (Règles permissions §28, §71).
  true,
  ref.module_order,
  ref.menu_order,
  0,
  n.rang
from nouvelles n
join lateral (
  select p.module_label, p.module_order, p.menu_order
  from public.permissions p
  where p.code = 'treasury.transfers.create'
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

-- Le menu « Virements internes » portait un libellé nul sur ses trois
-- capacités d'origine : l'arborescence de la fiche utilisateur les affichait
-- sans nom de menu. La lecture le porte ; les trois autres l'adoptent.
update public.permissions
   set menu_label = 'Virements internes'
 where module_code = 'treasury'
   and menu_code = 'transfers'
   and menu_label is null;

update public.permissions
   set menu_label = 'Paiements divers'
 where module_code = 'billing'
   and menu_code = 'misc_payments'
   and menu_label is null;


-- =============================================================================
-- 1. TYPES
-- =============================================================================

/*
 * Module 07 §46, mot pour mot : « Brouillon ; Validé ; Annulé ». Module 06 §36
 * autorise les mêmes états pour une opération de trésorerie, en rappelant de
 * « ne proposer que les états réellement nécessaires » : ces trois-là le sont,
 * puisque le catalogue distingue saisie et validation.
 */
do $$ begin
  create type public.internal_transfer_status as enum ('DRAFT', 'VALIDATED', 'CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.misc_payment_status as enum ('DRAFT', 'VALIDATED', 'CANCELLED');
exception when duplicate_object then null; end $$;

/*
 * Module 07 §43 — les quatre cas cités, sans ajout ni interprétation :
 * « frais administratifs ; petite dépense ; prestation ponctuelle ; autre
 * paiement autorisé ».
 */
do $$ begin
  create type public.misc_payment_category as enum (
    'ADMIN_FEE',        -- Frais administratifs
    'SMALL_EXPENSE',    -- Petite dépense
    'ONE_OFF_SERVICE',  -- Prestation ponctuelle
    'OTHER'             -- Autre paiement autorisé
  );
exception when duplicate_object then null; end $$;


-- =============================================================================
-- 2. LE VIREMENT INTERNE — Module 06 §28 à §33
-- =============================================================================

create table public.internal_transfers (
  id uuid primary key default gen_random_uuid(),

  -- §32 : la référence du virement. Règle `transfer` de `numbering_rules`,
  -- migration 005 (`VIR`, année, six chiffres, remise à zéro annuelle).
  transfer_no text not null unique,

  -- §29 : compte source et compte destination.
  source_account_id      uuid not null references public.financial_accounts (id) on delete restrict,
  destination_account_id uuid not null references public.financial_accounts (id) on delete restrict,

  -- DEC-010 : entier positif, en KMF. Le SENS est porté par les deux écritures,
  -- jamais par le signe du montant (§19).
  amount bigint not null check (amount > 0),

  -- §29 : la devise. Reprise des comptes, qui doivent la partager : aucune
  -- conversion n'est définie, et en inventer une fausserait deux soldes.
  currency_code text not null default 'KMF',

  transfer_date date not null,

  -- §29 : motif, référence, commentaire.
  purpose   text,
  reference text,
  notes     text,

  status public.internal_transfer_status not null default 'DRAFT',

  -- §32 : auteur, date et heure de l'opération.
  validated_at timestamptz,
  validated_by uuid references public.app_users (id) on delete set null,

  cancelled_at  timestamptz,
  cancelled_by  uuid references public.app_users (id) on delete set null,
  status_reason text,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  -- §29 : « Le compte source et le compte destination doivent être distincts. »
  -- Un virement d'un compte vers lui-même ne déplace rien et fausserait le
  -- journal de deux écritures qui s'annulent.
  constraint internal_transfers_accounts_distinct
    check (source_account_id <> destination_account_id),

  -- Un état daté : sans date, l'acte reste introuvable dans le temps.
  constraint internal_transfers_validation_dated
    check (status <> 'VALIDATED' or validated_at is not null),
  constraint internal_transfers_cancellation_dated
    check (status <> 'CANCELLED' or cancelled_at is not null)
);

comment on table public.internal_transfers is
  'Transfert entre deux comptes d''ADIKOM (Module 06 §28). Ni recette ni dépense : un mouvement interne, qui produit deux écritures liées (§31).';
comment on column public.internal_transfers.status is
  'Brouillon (aucune écriture) → Validé (les deux écritures) → Annulé. La séparation saisie/validation est portée par le catalogue (DEC-040).';
comment on column public.internal_transfers.amount is
  'Montant positif, en KMF. Le sens est porté par chacune des deux écritures (§19, §31).';

create index internal_transfers_source_idx
  on public.internal_transfers (source_account_id, transfer_date desc);
create index internal_transfers_destination_idx
  on public.internal_transfers (destination_account_id, transfer_date desc);
create index internal_transfers_status_idx
  on public.internal_transfers (status, transfer_date desc);


-- =============================================================================
-- 3. LE PAIEMENT DIVERS — Module 07 §43 à §46
-- =============================================================================

create table public.misc_payments (
  id uuid primary key default gen_random_uuid(),

  -- Série `payment` (REG), partagée avec les deux règlements : un numéro y
  -- reste unique, et aucun format nouveau n'est inventé (DEC-005, DEC-031).
  payment_no text not null unique,

  -- §44 : le compte source. §45 : « Lorsqu'un paiement divers est validé, il
  -- doit être associé au compte financier utilisé. »
  account_id uuid not null references public.financial_accounts (id) on delete restrict,

  -- DEC-010 : entier positif, en KMF.
  amount bigint not null check (amount > 0),

  paid_on date not null,

  -- §44 : catégorie et bénéficiaire.
  category    public.misc_payment_category not null,
  beneficiary text not null,

  -- §43 : « Chaque paiement doit toutefois être suffisamment documenté. » Le
  -- motif est donc obligatoire — un décaissement sans cause écrite ne se
  -- contrôle pas.
  purpose text not null,

  -- §44 : référence et commentaire.
  external_ref text,
  notes        text,

  status public.misc_payment_status not null default 'DRAFT',

  validated_at timestamptz,
  validated_by uuid references public.app_users (id) on delete set null,

  cancelled_at  timestamptz,
  cancelled_by  uuid references public.app_users (id) on delete set null,
  status_reason text,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  constraint misc_payments_beneficiary_not_blank check (btrim(beneficiary) <> ''),
  constraint misc_payments_purpose_not_blank     check (btrim(purpose) <> ''),

  constraint misc_payments_validation_dated
    check (status <> 'VALIDATED' or validated_at is not null),
  constraint misc_payments_cancellation_dated
    check (status <> 'CANCELLED' or cancelled_at is not null)
);

comment on table public.misc_payments is
  'Décaissement sans facture rattachée (Module 07 §43). Documenté par un bénéficiaire, une catégorie et un motif ; il produit une écriture de sortie à sa validation (§45).';
comment on column public.misc_payments.status is
  'Brouillon (aucune écriture) → Validé (l''écriture de sortie) → Annulé — Module 07 §46, mot pour mot.';

create index misc_payments_account_idx  on public.misc_payments (account_id, paid_on desc);
create index misc_payments_status_idx   on public.misc_payments (status, paid_on desc);
create index misc_payments_category_idx on public.misc_payments (category);


-- =============================================================================
-- 4. LES ÉCRITURES ONT DEUX NOUVELLES ORIGINES — Module 06 §20
--
-- « Lorsqu'une écriture provient d'un autre module, elle doit pouvoir être
-- reliée à son origine. » Une colonne par origine, et JAMAIS DEUX : une écriture
-- qui se réclamerait de deux opérations ne serait la contrepartie d'aucune.
-- =============================================================================

alter table public.treasury_entries
  add column internal_transfer_id uuid
    references public.internal_transfers (id) on delete restrict,
  add column misc_payment_id uuid
    references public.misc_payments (id) on delete restrict;

comment on column public.treasury_entries.internal_transfer_id is
  'Origine de l''écriture lorsqu''elle est l''une des deux moitiés d''un virement interne (§20, §31).';
comment on column public.treasury_entries.misc_payment_id is
  'Origine de l''écriture lorsqu''elle vient d''un paiement divers (§20, Module 07 §45).';

-- La contrainte d'origine unique du LOT 8 ne connaissait que deux colonnes.
alter table public.treasury_entries
  drop constraint if exists treasury_entries_single_origin;

alter table public.treasury_entries
  add constraint treasury_entries_single_origin check (
    (case when supplier_payment_id  is not null then 1 else 0 end)
  + (case when customer_payment_id  is not null then 1 else 0 end)
  + (case when internal_transfer_id is not null then 1 else 0 end)
  + (case when misc_payment_id      is not null then 1 else 0 end)
    <= 1
  );

create index treasury_entries_transfer_idx
  on public.treasury_entries (internal_transfer_id)
  where internal_transfer_id is not null;

create index treasury_entries_misc_payment_idx
  on public.treasury_entries (misc_payment_id)
  where misc_payment_id is not null;


-- =============================================================================
-- 5. COUCHE 2 · UNE ÉCRITURE RESTE IMMUABLE — Module 06 §34, §35
--
-- La liste des colonnes figées s'étend aux deux nouvelles origines : sans quoi
-- un `PATCH` rattacherait après coup une écriture existante à un virement, et
-- fabriquerait une contrepartie qui n'a jamais eu lieu.
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
     or new.misc_payment_id      is distinct from old.misc_payment_id then
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
-- 6. COUCHE 2 · UNE ÉCRITURE DIT LA VÉRITÉ SUR SON ORIGINE
--
-- LE SENS EST IMPOSÉ PAR L'ORIGINE :
--
--   règlement FOURNISSEUR → SORTIE       le compte diminue   (Workflow 08 §47)
--   règlement CLIENT      → ENTRÉE       le compte augmente  (Workflow 08 §47)
--   paiement DIVERS       → SORTIE       le compte diminue   (Module 07 §45)
--   virement, côté source → SORTIE       Module 06 §31
--   virement, côté dest.  → ENTRÉE       Module 06 §31
--
-- Et l'opération dont l'écriture se réclame doit être VALIDÉE : une écriture
-- adossée à un brouillon serait un mouvement décidé par personne.
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
    -- Aucune origine : l'écriture est libre, et relève alors de
    -- `treasury.entries.create` seule (voir la policy). Les genres qui NOMMENT
    -- une opération ne peuvent pas s'en passer.
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

    if mp.status <> 'VALIDATED' then
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

  if tr.status <> 'VALIDATED' then
    raise exception
      'Opération refusée : un virement ne produit ses écritures qu''à sa VALIDATION. Un brouillon ne déplace aucun fonds (Module 06 §31).'
      using errcode = 'check_violation';
  end if;

  if new.kind <> 'TRANSFER' or new.amount is distinct from tr.amount then
    raise exception
      'Opération refusée : cette écriture ne correspond pas au virement dont elle se réclame. Les deux moitiés portent le montant transféré (Module 06 §31).'
      using errcode = 'check_violation';
  end if;

  /*
   * §31 : « Compte source → Sortie. Compte destination → Entrée. »
   *
   * Une écriture de virement n'a donc que DEUX formes possibles. Toute autre
   * combinaison — une entrée sur la source, une sortie sur un troisième compte
   * — fabriquerait de l'argent.
   */
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
  'Une écriture issue d''une opération en reprend le compte, le montant et le sens (§20, §31, §47). Ferme la fabrication d''écritures par appel direct.';


-- =============================================================================
-- 7. COUCHE 6 · LA COHÉRENCE, VÉRIFIÉE QUAND TOUT EST ÉCRIT
--
-- Ces deux fonctions sont des CONTRÔLES, pas des gardes de capacité : elles
-- s'exécutent quel que soit l'acteur, y compris pour la clé de service. Placer
-- un `current_actor() is null` en tête effacerait la règle de cohérence pour
-- tout ce qui n'est pas une session applicative.
--
-- Elles LISENT sous RLS, et une lecture partielle conclurait « aucune écriture »
-- là où il y en a. C'est voulu : dans ce sens, l'erreur est un REFUS. Les actes
-- exigent la lecture des écritures pour que le refus ne les frappe jamais à tort.
-- =============================================================================

create or replace function public.assert_transfer_entries(p_transfer_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  tr        public.internal_transfers%rowtype;
  v_total   int;
  v_valid   int;
  v_out     int;
  v_in      int;
begin
  select * into tr from public.internal_transfers where id = p_transfer_id;

  if not found then
    raise exception
      'Opération refusée : le virement concerné n''est pas lisible, et sa cohérence ne peut donc pas être vérifiée (Module 06 §31).'
      using errcode = 'insufficient_privilege';
  end if;

  select
    count(*),
    count(*) filter (where e.status = 'VALIDATED'),
    count(*) filter (where e.status = 'VALIDATED'
                       and e.direction = 'OUT'
                       and e.account_id = tr.source_account_id
                       and e.amount = tr.amount),
    count(*) filter (where e.status = 'VALIDATED'
                       and e.direction = 'IN'
                       and e.account_id = tr.destination_account_id
                       and e.amount = tr.amount)
  into v_total, v_valid, v_out, v_in
  from public.treasury_entries e
  where e.internal_transfer_id = p_transfer_id;

  if tr.status = 'DRAFT' then
    if v_total <> 0 then
      raise exception
        'Opération refusée : un virement en brouillon ne porte aucune écriture. Les fonds ne bougent qu''à la validation (Module 06 §31).'
        using errcode = 'check_violation';
    end if;
    return;
  end if;

  if tr.status = 'VALIDATED' then
    if v_total <> 2 or v_valid <> 2 or v_out <> 1 or v_in <> 1 then
      raise exception
        'Opération refusée : un virement validé porte EXACTEMENT deux écritures — une sortie du compte source et une entrée sur le compte destination, du même montant (Module 06 §31). L''état obtenu (% écriture(s), dont % validée(s)) ne le respecte pas.',
        v_total, v_valid
        using errcode = 'check_violation';
    end if;
    return;
  end if;

  -- Annulé : soit il n'a jamais rien produit (annulé en brouillon), soit ses
  -- deux écritures ont suivi. Une seule écriture vivante laisserait un compte
  -- porteur d'un mouvement sans contrepartie (Module 06 §33).
  if v_valid <> 0 then
    raise exception
      'Opération refusée : % écriture(s) de ce virement reste(nt) validée(s). Un compte porterait un mouvement dont la contrepartie a disparu (Module 06 §33).',
      v_valid
      using errcode = 'check_violation';
  end if;

  if v_total <> 0 and v_total <> 2 then
    raise exception
      'Opération refusée : un virement annulé conserve ses deux écritures, ou aucune. L''état obtenu (%) ne le respecte pas.',
      v_total
      using errcode = 'check_violation';
  end if;
end;
$$;

comment on function public.assert_transfer_entries(uuid) is
  'Un virement validé porte ses DEUX écritures, un brouillon aucune, un annulé aucune vivante (Module 06 §31, §33). Contrôle différé : il refuse la transaction entière.';


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
                       and e.direction = 'OUT'
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
        'Opération refusée : un paiement divers validé porte EXACTEMENT une écriture de sortie, du montant payé, sur le compte source (Module 07 §45).'
        using errcode = 'check_violation';
    end if;
    return;
  end if;

  if v_ok <> 0 then
    raise exception
      'Opération refusée : l''écriture de ce paiement divers reste validée. Le compte porterait une sortie sans cause (Workflow 08 §45).'
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
  'Un paiement divers validé porte SON écriture de sortie, un brouillon aucune, un annulé aucune vivante (Module 07 §45, §46).';


create or replace function public.fn_internal_transfer_consistent()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.assert_transfer_entries(new.id);
  return null;
end;
$$;

create or replace function public.fn_misc_payment_consistent()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.assert_misc_payment_entries(new.id);
  return null;
end;
$$;

/*
 * Le même contrôle, déclenché depuis l'ÉCRITURE.
 *
 * Sans lui, une troisième écriture ajoutée à un virement déjà validé passerait :
 * la ligne du virement n'ayant pas bougé, son propre contrôle ne s'exécuterait
 * pas. C'est la voie qu'emprunterait un porteur de `treasury.entries.create`.
 */
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
  end if;
  return null;
end;
$$;


-- =============================================================================
-- 8. COUCHES 3 ET 5 · LES TRANSITIONS, ET L'ÉTAT DE DÉPART
-- =============================================================================

/**
 * Un virement naît BROUILLON — y compris par `INSERT` direct.
 *
 * Le faire naître « Validé » contournerait la validation, donc le contrôle de
 * solde de §30, et laisserait un virement validé sans écriture. Le contrôle
 * différé le rattraperait ; mieux vaut refuser tout de suite, avec son motif.
 */
create or replace function public.fn_internal_transfer_starts_draft()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'DRAFT' then
    raise exception
      'Opération refusée : un virement interne se saisit en brouillon, puis se valide. Les fonds ne bougent qu''à la validation (Module 06 §30, §31).'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

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
   * Il ne se réécrit pas davantage : un virement erroné s'annule, et un virement
   * correct est saisi. Réécrire un montant après validation déplacerait deux
   * soldes sans qu'aucune écriture ne l'explique.
   */
  if new.source_account_id      is distinct from old.source_account_id
     or new.destination_account_id is distinct from old.destination_account_id
     or new.amount               is distinct from old.amount
     or new.currency_code        is distinct from old.currency_code
     or new.transfer_date        is distinct from old.transfer_date
     or new.transfer_no          is distinct from old.transfer_no then
    raise exception
      'Opération refusée : un virement ne se modifie pas. Il s''annule, et un virement correct est enregistré (Module 06 §33, §34).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_internal_transfer_transition is
  'Brouillon → Validé → Annulé, chaque passage sous SA capacité. Comptes, montant et date sont figés dès la saisie (§33).';


create or replace function public.fn_misc_payment_starts_draft()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'DRAFT' then
    raise exception
      'Opération refusée : un paiement divers se saisit en brouillon, puis se valide (Module 07 §46).'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

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
   * catalogue. Module 07 §47 : « Lorsqu'une opération doit être annulée, le
   * système doit conserver sa trace. » Un brouillon erroné s'annule.
   */
  if new.account_id  is distinct from old.account_id
     or new.amount    is distinct from old.amount
     or new.paid_on   is distinct from old.paid_on
     or new.category  is distinct from old.category
     or new.beneficiary is distinct from old.beneficiary
     or new.purpose   is distinct from old.purpose
     or new.payment_no is distinct from old.payment_no then
    raise exception
      'Opération refusée : un paiement divers ne se modifie pas. Il s''annule, et un paiement correct est enregistré (Module 07 §47).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_misc_payment_transition is
  'Brouillon → Validé → Annulé, chaque passage sous SA capacité. Aucune modification : le catalogue n''expose pas `update`.';


-- --- Déclencheurs ------------------------------------------------------------------

create trigger internal_transfers_starts_draft
  before insert on public.internal_transfers
  for each row execute function public.fn_internal_transfer_starts_draft();

create trigger internal_transfers_transition
  before update on public.internal_transfers
  for each row execute function public.fn_internal_transfer_transition();

create trigger internal_transfers_updated_at
  before update on public.internal_transfers
  for each row execute function public.fn_set_updated_at();

create trigger internal_transfers_audit
  after insert or update on public.internal_transfers
  for each row execute function public.fn_audit_row('treasury');

create trigger internal_transfers_no_delete
  before delete on public.internal_transfers
  for each row execute function public.fn_forbid_delete();

create constraint trigger internal_transfers_consistent
  after insert or update on public.internal_transfers
  deferrable initially deferred
  for each row execute function public.fn_internal_transfer_consistent();


create trigger misc_payments_starts_draft
  before insert on public.misc_payments
  for each row execute function public.fn_misc_payment_starts_draft();

create trigger misc_payments_transition
  before update on public.misc_payments
  for each row execute function public.fn_misc_payment_transition();

create trigger misc_payments_updated_at
  before update on public.misc_payments
  for each row execute function public.fn_set_updated_at();

create trigger misc_payments_audit
  after insert or update on public.misc_payments
  for each row execute function public.fn_audit_row('billing');

create trigger misc_payments_no_delete
  before delete on public.misc_payments
  for each row execute function public.fn_forbid_delete();

create constraint trigger misc_payments_consistent
  after insert or update on public.misc_payments
  deferrable initially deferred
  for each row execute function public.fn_misc_payment_consistent();


create constraint trigger treasury_entries_consistent
  after insert or update on public.treasury_entries
  deferrable initially deferred
  for each row execute function public.fn_treasury_entry_consistent();


-- =============================================================================
-- 9. COUCHE 1 · LES ACTES
-- =============================================================================

/**
 * Saisir un virement interne — Module 06 §29.
 *
 * TROIS CAPACITÉS
 *
 *   `treasury.transfers.create`  l'acte lui-même
 *   `treasury.transfers.view`    relire le virement saisi
 *   `treasury.accounts.view`     désigner deux comptes (§29)
 *
 * AUCUN CONTRÔLE DE SOLDE ICI, ET C'EST VOULU.
 *
 * §30 contrôle le solde AVANT LE VIREMENT — c'est-à-dire avant que les fonds ne
 * bougent, donc à la validation. L'exiger dès la saisie obligerait la personne
 * qui saisit à détenir `treasury.balances.view`, ce que DEC-024 refuse de
 * déduire : saisir n'est pas consulter la trésorerie. Et un solde contrôlé à la
 * saisie serait périmé au moment où l'argent sort.
 */
create or replace function public.create_internal_transfer(
  p_source_account_id      uuid,
  p_destination_account_id uuid,
  p_amount                 bigint,
  p_transfer_date          date,
  p_purpose                text default null,
  p_reference              text default null,
  p_notes                  text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id  uuid;
  v_no  text;
  src   public.financial_accounts%rowtype;
  dst   public.financial_accounts%rowtype;
begin
  perform public.require_capability(
    array['treasury.transfers.create'], 'effectuer un virement interne'
  );
  perform public.require_capability(
    array['treasury.transfers.view'], 'consulter le virement saisi'
  );
  perform public.require_capability(
    array['treasury.accounts.view'], 'désigner les comptes du virement'
  );

  if p_amount is null or p_amount <= 0 then
    raise exception 'Le montant du virement doit être un entier positif, en KMF.'
      using errcode = 'check_violation';
  end if;

  if p_transfer_date is null then
    raise exception 'La date du virement est obligatoire (Module 06 §29).'
      using errcode = 'check_violation';
  end if;

  if p_source_account_id is null or p_destination_account_id is null then
    raise exception 'Un virement désigne un compte source ET un compte destination (§29).'
      using errcode = 'check_violation';
  end if;

  if p_source_account_id = p_destination_account_id then
    raise exception
      'Opération refusée : le compte source et le compte destination doivent être distincts (Module 06 §29).'
      using errcode = 'check_violation';
  end if;

  select * into src from public.financial_accounts where id = p_source_account_id;
  if not found then
    raise exception
      'Le compte source est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  select * into dst from public.financial_accounts where id = p_destination_account_id;
  if not found then
    raise exception
      'Le compte destination est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  -- Module 06 §10 : « un compte inactif ou archivé ne doit normalement plus être
  -- proposé pour de nouvelles opérations. » Des DEUX côtés du virement.
  if src.status <> 'ACTIVE' then
    raise exception
      'Opération refusée : le compte source « % » n''est pas actif. Un compte inactif ou archivé ne reçoit plus de nouvelle opération (Module 06 §10).',
      src.label
      using errcode = 'check_violation';
  end if;

  if dst.status <> 'ACTIVE' then
    raise exception
      'Opération refusée : le compte destination « % » n''est pas actif. Un compte inactif ou archivé ne reçoit plus de nouvelle opération (Module 06 §10).',
      dst.label
      using errcode = 'check_violation';
  end if;

  if src.currency_code is distinct from dst.currency_code then
    raise exception
      'Opération refusée : la devise du compte source (%) diffère de celle du compte destination (%). Aucune conversion n''est définie.',
      src.currency_code, dst.currency_code
      using errcode = 'check_violation';
  end if;

  v_no := public.next_number('transfer');

  insert into public.internal_transfers
    (transfer_no, source_account_id, destination_account_id, amount, currency_code,
     transfer_date, purpose, reference, notes, created_by, updated_by)
  values
    (v_no, p_source_account_id, p_destination_account_id, p_amount, src.currency_code,
     p_transfer_date,
     nullif(btrim(coalesce(p_purpose, '')), ''),
     nullif(btrim(coalesce(p_reference, '')), ''),
     nullif(btrim(coalesce(p_notes, '')), ''),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.create_internal_transfer is
  'Saisit un virement en BROUILLON (Module 06 §29). Aucune écriture, aucun fonds déplacé : la validation s''en charge.';


/**
 * Valider un virement — Module 06 §30 et §31.
 *
 * CINQ CAPACITÉS, ET AUCUNE N'EST DU DÉCOR
 *
 *   `treasury.transfers.validate`  l'acte
 *   `treasury.transfers.view`      lire le virement à valider
 *   `treasury.accounts.view`       relire les deux comptes et leur état
 *   `treasury.balances.view`       le contrôle de solde de §30
 *   `treasury.entries.view`        la somme dont le solde est fait, ET le
 *                                  contrôle différé qui compte les écritures
 *
 * Sans `entries.view`, le solde renverrait le solde d'ouverture (migration 050)
 * et le contrôle de cohérence ne verrait aucune écriture : le virement serait
 * refusé après coup, sans que rien n'explique pourquoi. Il est exigé d'emblée.
 */
create or replace function public.validate_internal_transfer(p_transfer_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  tr        public.internal_transfers%rowtype;
  src       public.financial_accounts%rowtype;
  dst       public.financial_accounts%rowtype;
  v_balance bigint;
begin
  perform public.require_capability(
    array['treasury.transfers.validate'], 'valider un virement interne'
  );
  perform public.require_capability(
    array['treasury.transfers.view'], 'consulter le virement à valider'
  );
  perform public.require_capability(
    array['treasury.accounts.view'], 'consulter les comptes du virement'
  );
  perform public.require_capability(
    array['treasury.balances.view'], 'contrôler le solde du compte source (Module 06 §30)'
  );
  perform public.require_capability(
    array['treasury.entries.view'], 'produire et relire les deux écritures du virement'
  );

  select * into tr from public.internal_transfers where id = p_transfer_id for update;

  if not found then
    raise exception 'Virement introuvable.' using errcode = 'no_data_found';
  end if;

  if tr.status <> 'DRAFT' then
    raise exception
      'Opération refusée : seul un virement en brouillon peut être validé. Celui-ci est déjà % .',
      case tr.status when 'VALIDATED' then 'validé' else 'annulé' end
      using errcode = 'check_violation';
  end if;

  select * into src from public.financial_accounts where id = tr.source_account_id;
  if not found then
    raise exception
      'Le compte source est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  select * into dst from public.financial_accounts where id = tr.destination_account_id;
  if not found then
    raise exception
      'Le compte destination est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  -- Un compte peut avoir été archivé entre la saisie et la validation.
  if src.status <> 'ACTIVE' or dst.status <> 'ACTIVE' then
    raise exception
      'Opération refusée : un compte du virement n''est plus actif. Un compte inactif ou archivé ne reçoit plus de nouvelle opération (Module 06 §10).'
      using errcode = 'check_violation';
  end if;

  if src.currency_code is distinct from dst.currency_code then
    raise exception
      'Opération refusée : les deux comptes ne partagent plus la même devise. Aucune conversion n''est définie.'
      using errcode = 'check_violation';
  end if;

  /*
   * §30 : « Le système doit vérifier que le compte source dispose du montant
   * nécessaire. […] Pour le MVP, l'option la plus sûre est de BLOQUER le
   * virement lorsque les fonds disponibles sont insuffisants. »
   *
   * C'est le seul contrôle de découvert du système, et la documentation ne le
   * pose que là (DEC-029 §b).
   */
  v_balance := public.financial_account_balance(tr.source_account_id);

  if v_balance is null then
    raise exception
      'Opération refusée : le solde du compte source n''a pas pu être calculé. Un virement ne se valide pas sans ce contrôle (Module 06 §30).'
      using errcode = 'insufficient_privilege';
  end if;

  if v_balance < tr.amount then
    raise exception
      'Opération refusée : le compte source ne dispose que de % KMF, et le virement porte sur % KMF. Les fonds disponibles sont insuffisants (Module 06 §30).',
      v_balance, tr.amount
      using errcode = 'check_violation';
  end if;

  update public.internal_transfers
     set status       = 'VALIDATED',
         validated_at = now(),
         validated_by = public.current_actor(),
         updated_by   = public.current_actor()
   where id = tr.id;

  -- §31 : les DEUX mouvements, liés au même virement. Ils sont écrits dans la
  -- même instruction : aucune fenêtre où l'un existerait sans l'autre.
  insert into public.treasury_entries
    (account_id, entry_date, direction, kind, amount, description, reference,
     internal_transfer_id, created_by, updated_by)
  values
    (tr.source_account_id, tr.transfer_date, 'OUT', 'TRANSFER', tr.amount,
     'Virement ' || tr.transfer_no || ' — vers ' || dst.label,
     tr.reference, tr.id, public.current_actor(), public.current_actor()),
    (tr.destination_account_id, tr.transfer_date, 'IN', 'TRANSFER', tr.amount,
     'Virement ' || tr.transfer_no || ' — depuis ' || src.label,
     tr.reference, tr.id, public.current_actor(), public.current_actor());
end;
$$;

comment on function public.validate_internal_transfer is
  'Contrôle le solde du compte source (§30) puis produit les DEUX écritures liées (§31). Le contrôle différé refuse la transaction si l''une manque.';


/**
 * Annuler un virement — Module 06 §33.
 *
 * « Un virement déjà enregistré ne doit pas être simplement supprimé. » Les deux
 * écritures sont annulées AVEC lui : les deux soldes reviennent, l'historique
 * reste. Un brouillon s'annule aussi — il n'avait rien produit.
 *
 * `treasury.entries.view` est exigée nommément : sous RLS, un `UPDATE … WHERE`
 * LIT les lignes qu'il vise. Sans ce droit, l'annulation ne toucherait aucune
 * écriture et ne dirait rien (migration 054).
 */
create or replace function public.cancel_internal_transfer(
  p_transfer_id uuid,
  p_reason      text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  tr     public.internal_transfers%rowtype;
  v_left int;
begin
  perform public.require_capability(
    array['treasury.transfers.cancel'], 'annuler un virement interne'
  );
  perform public.require_capability(
    array['treasury.transfers.view'], 'consulter le virement à annuler'
  );
  perform public.require_capability(
    array['treasury.entries.view'], 'annuler les écritures produites par ce virement'
  );

  select * into tr from public.internal_transfers where id = p_transfer_id for update;

  if not found then
    raise exception 'Virement introuvable.' using errcode = 'no_data_found';
  end if;

  if tr.status = 'CANCELLED' then
    raise exception 'Opération refusée : ce virement est déjà annulé.'
      using errcode = 'check_violation';
  end if;

  update public.internal_transfers
     set status        = 'CANCELLED',
         cancelled_at  = now(),
         cancelled_by  = public.current_actor(),
         status_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_by    = public.current_actor()
   where id = tr.id;

  update public.treasury_entries
     set status     = 'CANCELLED',
         updated_by = public.current_actor()
   where internal_transfer_id = tr.id
     and status = 'VALIDATED';

  -- Le filet : une écriture vivante laisserait un compte porteur d'un mouvement
  -- dont la contrepartie a disparu. On refuse tout plutôt que de le laisser.
  select count(*) into v_left
  from public.treasury_entries
  where internal_transfer_id = tr.id and status = 'VALIDATED';

  if v_left > 0 then
    raise exception
      'Opération refusée : les écritures produites par ce virement n''ont pas pu être annulées. Un compte porterait un mouvement sans contrepartie (Module 06 §33).'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

comment on function public.cancel_internal_transfer is
  'Annule un virement ET ses deux écritures (§33). Les soldes reviennent ; rien n''est effacé.';


/**
 * Saisir un paiement divers — Module 07 §43 et §44.
 *
 * TROIS CAPACITÉS
 *
 *   `billing.misc_payments.create`  l'acte
 *   `billing.misc_payments.view`    relire le paiement saisi
 *   `treasury.accounts.view`        désigner le compte source (§44)
 */
create or replace function public.create_misc_payment(
  p_account_id   uuid,
  p_amount       bigint,
  p_paid_on      date,
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
    array['treasury.accounts.view'], 'désigner le compte source du paiement'
  );

  if p_amount is null or p_amount <= 0 then
    raise exception 'Le montant du paiement doit être un entier positif, en KMF.'
      using errcode = 'check_violation';
  end if;

  if p_paid_on is null then
    raise exception 'La date du paiement est obligatoire (Module 07 §44).'
      using errcode = 'check_violation';
  end if;

  -- §43 : « Chaque paiement doit toutefois être suffisamment documenté. »
  if coalesce(btrim(p_beneficiary), '') = '' then
    raise exception 'Le bénéficiaire du paiement est obligatoire (Module 07 §44).'
      using errcode = 'check_violation';
  end if;

  if coalesce(btrim(p_purpose), '') = '' then
    raise exception
      'Le motif du paiement est obligatoire : un décaissement sans cause écrite ne se contrôle pas (Module 07 §43).'
      using errcode = 'check_violation';
  end if;

  select * into v_acc from public.financial_accounts where id = p_account_id;

  if not found then
    raise exception
      'Le compte source est introuvable ou n''est pas lisible avec vos droits.'
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
    (payment_no, account_id, amount, paid_on, category, beneficiary, purpose,
     external_ref, notes, created_by, updated_by)
  values
    (v_no, p_account_id, p_amount, p_paid_on, p_category,
     btrim(p_beneficiary), btrim(p_purpose),
     nullif(btrim(coalesce(p_external_ref, '')), ''),
     nullif(btrim(coalesce(p_notes, '')), ''),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.create_misc_payment is
  'Saisit un paiement divers en BROUILLON (Module 07 §43, §44). Aucune écriture : la validation s''en charge (§45).';


/**
 * Valider un paiement divers — Module 07 §45 et §46.
 *
 * QUATRE CAPACITÉS
 *
 *   `billing.misc_payments.validate`  l'acte
 *   `billing.misc_payments.view`      lire le paiement à valider
 *   `treasury.accounts.view`          relire le compte source et son état
 *   `treasury.entries.view`           le contrôle différé compte les écritures ;
 *                                     sans cette lecture il n'en verrait aucune
 *                                     et refuserait un paiement pourtant correct
 *
 * AUCUN CONTRÔLE DE SOLDE : la documentation ne le pose que pour le virement
 * (Module 06 §30, DEC-029 §b). En ajouter un ici inventerait une règle.
 */
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
      'Le compte source est introuvable ou n''est pas lisible avec vos droits.'
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

  -- §45 : « Le système doit générer ou référencer l'écriture financière
  -- correspondante. » Une SORTIE, du montant payé, sur le compte source.
  insert into public.treasury_entries
    (account_id, entry_date, direction, kind, amount, description, reference,
     misc_payment_id, created_by, updated_by)
  values
    (mp.account_id, mp.paid_on, 'OUT', 'MISC_PAYMENT', mp.amount,
     'Paiement divers ' || mp.payment_no || ' — ' || mp.beneficiary,
     mp.external_ref, mp.id, public.current_actor(), public.current_actor());
end;
$$;

comment on function public.validate_misc_payment is
  'Valide un paiement divers et produit SON écriture de sortie (Module 07 §45). Le contrôle différé refuse la transaction si elle manque.';


/**
 * Annuler un paiement divers — Module 07 §47.
 *
 * « Lorsqu'une opération doit être annulée, le système doit conserver sa
 * trace. » L'écriture est annulée avec le paiement : le solde du compte remonte.
 */
create or replace function public.cancel_misc_payment(
  p_payment_id uuid,
  p_reason     text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  mp     public.misc_payments%rowtype;
  v_left int;
begin
  perform public.require_capability(
    array['billing.misc_payments.cancel'], 'annuler un paiement divers'
  );
  perform public.require_capability(
    array['billing.misc_payments.view'], 'consulter le paiement à annuler'
  );
  perform public.require_capability(
    array['treasury.entries.view'], 'annuler l''écriture produite par ce paiement'
  );

  select * into mp from public.misc_payments where id = p_payment_id for update;

  if not found then
    raise exception 'Paiement divers introuvable.' using errcode = 'no_data_found';
  end if;

  if mp.status = 'CANCELLED' then
    raise exception 'Opération refusée : ce paiement est déjà annulé.'
      using errcode = 'check_violation';
  end if;

  update public.misc_payments
     set status        = 'CANCELLED',
         cancelled_at  = now(),
         cancelled_by  = public.current_actor(),
         status_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_by    = public.current_actor()
   where id = mp.id;

  update public.treasury_entries
     set status     = 'CANCELLED',
         updated_by = public.current_actor()
   where misc_payment_id = mp.id
     and status = 'VALIDATED';

  select count(*) into v_left
  from public.treasury_entries
  where misc_payment_id = mp.id and status = 'VALIDATED';

  if v_left > 0 then
    raise exception
      'Opération refusée : l''écriture produite par ce paiement n''a pas pu être annulée. Le compte porterait une sortie sans cause (Workflow 08 §45).'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

comment on function public.cancel_misc_payment is
  'Annule un paiement divers ET l''écriture qu''il a produite (Module 07 §47). Le solde du compte remonte ; l''historique reste.';


-- =============================================================================
-- 10. DROITS D'EXÉCUTION — DEC-022
-- =============================================================================

revoke execute on function public.assert_transfer_entries(uuid) from public;
grant  execute on function public.assert_transfer_entries(uuid) to authenticated, service_role;

revoke execute on function public.assert_misc_payment_entries(uuid) from public;
grant  execute on function public.assert_misc_payment_entries(uuid) to authenticated, service_role;

revoke execute on function public.create_internal_transfer(
  uuid, uuid, bigint, date, text, text, text) from public;
grant  execute on function public.create_internal_transfer(
  uuid, uuid, bigint, date, text, text, text) to authenticated, service_role;

revoke execute on function public.validate_internal_transfer(uuid) from public;
grant  execute on function public.validate_internal_transfer(uuid) to authenticated, service_role;

revoke execute on function public.cancel_internal_transfer(uuid, text) from public;
grant  execute on function public.cancel_internal_transfer(uuid, text) to authenticated, service_role;

revoke execute on function public.create_misc_payment(
  uuid, bigint, date, public.misc_payment_category, text, text, text, text) from public;
grant  execute on function public.create_misc_payment(
  uuid, bigint, date, public.misc_payment_category, text, text, text, text)
  to authenticated, service_role;

revoke execute on function public.validate_misc_payment(uuid) from public;
grant  execute on function public.validate_misc_payment(uuid) to authenticated, service_role;

revoke execute on function public.cancel_misc_payment(uuid, text) from public;
grant  execute on function public.cancel_misc_payment(uuid, text) to authenticated, service_role;


-- =============================================================================
-- 11. COUCHE 4 · RLS
-- =============================================================================

revoke all on public.internal_transfers from anon;
revoke all on public.misc_payments      from anon;

revoke delete on public.internal_transfers from authenticated;
revoke delete on public.misc_payments      from authenticated;

alter table public.internal_transfers enable row level security;
alter table public.misc_payments      enable row level security;

/*
 * La lecture porte SA capacité, et elle n'est déduite d'aucune autre.
 *
 * `treasury.entries.view` ouvre les MOUVEMENTS ; un virement en brouillon n'en
 * a produit aucun. `treasury.transfers.create` ouvre l'ACTE de saisir. Aucune
 * des deux ne dit qui a le droit de lire la liste des virements (DEC-024).
 *
 * La garde est enveloppée dans un sous-select : sans quoi `has_permission` est
 * appelée une fois PAR LIGNE lue.
 */
create policy internal_transfers_select on public.internal_transfers
  for select to authenticated
  using ((select public.has_permission('treasury.transfers.view')));

create policy internal_transfers_insert on public.internal_transfers
  for insert to authenticated
  with check ((select public.has_permission('treasury.transfers.create')));

create policy internal_transfers_update on public.internal_transfers
  for update to authenticated
  using (
    (select public.has_permission('treasury.transfers.validate'))
    or (select public.has_permission('treasury.transfers.cancel'))
  )
  with check (
    (select public.has_permission('treasury.transfers.validate'))
    or (select public.has_permission('treasury.transfers.cancel'))
  );

create policy misc_payments_select on public.misc_payments
  for select to authenticated
  using ((select public.has_permission('billing.misc_payments.view')));

create policy misc_payments_insert on public.misc_payments
  for insert to authenticated
  with check ((select public.has_permission('billing.misc_payments.create')));

create policy misc_payments_update on public.misc_payments
  for update to authenticated
  using (
    (select public.has_permission('billing.misc_payments.validate'))
    or (select public.has_permission('billing.misc_payments.cancel'))
  )
  with check (
    (select public.has_permission('billing.misc_payments.validate'))
    or (select public.has_permission('billing.misc_payments.cancel'))
  );


/*
 * L'ÉCRITURE PRODUITE SUIT LA CAPACITÉ DE L'ACTE QUI LA PRODUIT.
 *
 * Elle en est la conséquence, pas un acte distinct (DEC-029 §f). Ici, l'acte
 * n'est plus la création mais la VALIDATION : c'est elle qui déplace les fonds.
 * Le déclencheur `treasury_entries_source` vérifie que l'écriture correspond
 * réellement à l'opération dont elle se réclame, et le contrôle différé qu'il
 * n'en manque ni n'en traîne aucune.
 */
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
  );

-- Seul le statut change, et seulement pour suivre l'annulation de l'opération.
drop policy if exists treasury_entries_update on public.treasury_entries;

create policy treasury_entries_update on public.treasury_entries
  for update to authenticated
  using (
    (select public.has_permission('billing.supplier_payments.cancel'))
    or (select public.has_permission('billing.customer_payments.cancel'))
    or (select public.has_permission('treasury.transfers.cancel'))
    or (select public.has_permission('billing.misc_payments.cancel'))
  )
  with check (
    (select public.has_permission('billing.supplier_payments.cancel'))
    or (select public.has_permission('billing.customer_payments.cancel'))
    or (select public.has_permission('treasury.transfers.cancel'))
    or (select public.has_permission('billing.misc_payments.cancel'))
  );


-- =============================================================================
-- 12. LE JOURNAL D'ACTIVITÉ CONNAÎT LES DEUX NOUVEAUX OBJETS — DEC-038
--
-- « Ce qui n'est pas nommé est fermé » : sans ces deux lignes, le détail
-- avant / après d'un virement ne serait lisible que par le Super Admin. La
-- capacité exigée est celle qui ouvre l'objet lui-même, jamais une autre.
-- =============================================================================

create or replace function public.audit_detail_permission(p_entity_type text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_entity_type

    -- --- Utilisateurs & Groupes ---------------------------------------------
    when 'app_users'                      then 'users.users.view'
    when 'user_departments'               then 'users.users.view'
    when 'user_groups'                    then 'users.users.view'
    when 'groups'                         then 'users.groups.view'
    when 'group_permissions'              then 'users.groups.view'
    when 'user_permissions'               then 'users.users.permissions.view'

    -- --- Tiers ---------------------------------------------------------------
    when 'clients'                        then 'parties.clients.view'
    when 'suppliers'                      then 'parties.suppliers.view'
    when 'partners'                       then 'parties.partners.view'
    when 'supplier_bank_details'          then 'parties.suppliers.bank.view'
    when 'supplier_payment_details'       then 'parties.suppliers.bank.view'

    -- --- Gestion de location -------------------------------------------------
    when 'vehicles'                       then 'rental.fleet.view'
    when 'vehicle_supplier_history'       then 'rental.fleet.view'
    when 'vehicle_occupations'            then 'rental.fleet.view'
    when 'vehicle_categories'             then 'rental.categories.view'
    when 'vehicle_documents'              then 'rental.documents.view'
    when 'pricing_rules'                  then 'rental.pricing.view'
    when 'reservations'                   then 'rental.reservations.view'
    when 'rentals'                        then 'rental.rentals.view'
    when 'rental_inspections'             then 'rental.rentals.view'
    when 'rental_inspection_photos'       then 'rental.rentals.view'
    when 'vehicle_incidents'              then 'rental.incidents.view'
    when 'incident_damages'               then 'rental.incidents.view'
    when 'incident_photos'                then 'rental.incidents.view'
    when 'vehicle_maintenances'           then 'rental.maintenance.view'
    when 'maintenance_documents'          then 'rental.maintenance.view'
    when 'maintenance_quotes'             then 'rental.maintenance.view'
    when 'maintenance_costs'              then 'rental.maintenance.cost.view'
    when 'maintenance_cost_lines'         then 'rental.maintenance.cost.view'

    -- --- Facturation & Paiement ----------------------------------------------
    when 'customer_invoices'              then 'billing.customer_invoices.view'
    when 'customer_invoice_lines'         then 'billing.customer_invoices.view'
    when 'customer_payments'              then 'billing.customer_payments.view'
    when 'supplier_invoices'              then 'billing.supplier_invoices.view'
    when 'supplier_invoice_lines'         then 'billing.supplier_invoices.view'
    when 'supplier_payments'              then 'billing.supplier_payments.view'
    when 'imputations'                    then 'billing.imputations.view'
    when 'imputation_documents'           then 'billing.imputations.view'
    when 'misc_payments'                  then 'billing.misc_payments.view'

    -- --- Banques & Caisses ---------------------------------------------------
    when 'financial_accounts'             then 'treasury.accounts.view'
    when 'treasury_entries'               then 'treasury.entries.view'
    when 'internal_transfers'             then 'treasury.transfers.view'

    -- --- Projets & Planification ---------------------------------------------
    when 'projects'                       then 'projects.view'
    when 'project_members'                then 'projects.view'
    when 'project_tasks'                  then 'projects.tasks.view'
    when 'project_meetings'               then 'projects.meetings.view'
    when 'project_meeting_participants'   then 'projects.meetings.view'
    when 'project_appointments'           then 'projects.appointments.view'
    when 'project_appointment_participants' then 'projects.appointments.view'
    when 'project_decisions'              then 'projects.decisions.view'
    when 'project_actions'                then 'projects.actions.view'

    -- --- Paramètres ----------------------------------------------------------
    when 'company_settings'               then 'settings.company.view'
    when 'numbering_rules'                then 'settings.numbering.view'

    else null
  end;
$$;

comment on function public.audit_detail_permission(text) is
  'Capacité exigée pour lire le détail avant/après d''un événement (DEC-038). NULL = Super Admin uniquement.';


-- =============================================================================
-- 13. CONTRÔLE DE NON-RÉGRESSION DU CATALOGUE
-- =============================================================================

do $$
declare
  v_total   int;
  v_missing text[];
begin
  select count(*) into v_total from public.permissions;

  if v_total <> 171 then
    raise exception 'Catalogue attendu à 171 permissions, obtenu %.', v_total;
  end if;

  select array_agg(c) into v_missing
  from unnest(array[
    'treasury.transfers.view',
    'treasury.transfers.create',
    'treasury.transfers.validate',
    'treasury.transfers.cancel',
    'treasury.accounts.view',
    'treasury.balances.view',
    'treasury.entries.view',
    'billing.misc_payments.view',
    'billing.misc_payments.create',
    'billing.misc_payments.validate',
    'billing.misc_payments.cancel'
  ]) c
  where not exists (select 1 from public.permissions p where p.code = c);

  if v_missing is not null then
    raise exception 'Capacités absentes du catalogue : %', v_missing;
  end if;

  if not exists (select 1 from public.numbering_rules where entity_key = 'transfer') then
    raise exception 'Règle de numérotation « transfer » absente.';
  end if;
end $$;
