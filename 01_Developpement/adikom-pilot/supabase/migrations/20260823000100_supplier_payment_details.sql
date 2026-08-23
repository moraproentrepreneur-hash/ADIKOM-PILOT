-- =============================================================================
-- ADIKOM PILOT — 028 · Informations de paiement fournisseur
-- Arbitrage ADIKOM du 23 août 2026
--
-- CE QUE CETTE MIGRATION CORRIGE
--
-- `supplier_bank_details` a pour clé primaire `supplier_id` : l'unicité n'y est
-- pas une règle métier, c'est la structure même de la table. Un fournisseur ne
-- pouvait donc porter qu'un seul jeu de coordonnées, alors qu'il peut
-- légitimement en avoir plusieurs — deux comptes bancaires, par exemple.
--
-- La table est REMPLACÉE par une collection : `supplier_payment_details`, une
-- ligne par coordonnée de règlement, sur le modèle de `vehicle_documents`
-- (collection typée rattachée à un parent, désactivable, jamais supprimée).
--
-- CE QU'ELLE NE FAIT PAS
--
-- Elle ne supprime pas encore l'ancienne table : le code déployé la lit
-- toujours, et la retirer avant la mise en ligne casserait la fiche
-- fournisseur en production. La suppression fait l'objet de la migration 029,
-- appliquée APRÈS le déploiement (CLAUDE.md §28 : le fonctionnement réel
-- d'abord). Les éventuelles lignes présentes sont reprises ici.
--
-- Elle ne décrit pas non plus le MOYEN employé pour une transaction : cette
-- table dit où et comment un fournisseur peut être payé. Le moyen réellement
-- utilisé pour un règlement, et le compte financier mouvementé, relèvent de
-- Facturation & Paiement (03_Modules/07 §22 et §23, 04_Workflows/08 §12
-- et §13). Les deux ne doivent pas être confondus.
--
-- AUCUNE PERMISSION NOUVELLE
--
-- `parties.suppliers.bank.view` et `parties.suppliers.bank.update` couvrent
-- l'ensemble des gestes : consulter, ajouter, modifier, activer, désactiver,
-- désigner la coordonnée principale. Toutes sont soit « consulter », soit
-- « modifier » le même objet sensible (DEC-024). Le catalogue reste à 148.
-- =============================================================================


-- --- Nature d'une coordonnée de règlement ------------------------------------
--
-- DEUX VALEURS, ET PAS UNE DE PLUS.
--
-- `BANK_ACCOUNT` est le seul moyen confirmé par la documentation
-- (05_Regles_Metier/04_Fournisseurs.md §44, 03_Modules/09_Parametres.md §12,
-- 03_Modules/07_Facturation_et_Paiement.md §22 : « virement bancaire »).
--
-- `OTHER` est délibérément générique : il permet d'enregistrer une coordonnée
-- sans prétendre nommer un moyen métier qu'ADIKOM n'a pas encore arrêté. Les
-- valeurs précises — s'il y en a — seront ajoutées par migration lorsque les
-- pratiques réelles seront confirmées ; ajouter une valeur à une énumération
-- PostgreSQL ne rompt rien.

do $$ begin
  create type public.supplier_payment_kind as enum ('BANK_ACCOUNT', 'OTHER');
exception when duplicate_object then null; end $$;


-- --- Coordonnées de règlement -------------------------------------------------

create table public.supplier_payment_details (
  id                 uuid primary key default gen_random_uuid(),
  supplier_id        uuid not null references public.suppliers (id) on delete cascade,

  kind               public.supplier_payment_kind not null,

  -- Ce qui permet de désigner la coordonnée à l'écran et dans le journal :
  -- « Compte principal », « Compte devises »… Jamais une donnée sensible.
  label              text not null check (length(btrim(label)) > 0),

  account_holder     text,
  currency_code      text check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),

  -- Coordonnées bancaires structurées. Les noms de colonnes sont repris À
  -- L'IDENTIQUE de l'ancienne table : c'est ce qui les maintient couvertes par
  -- `fn_audit_redact`, qui travaille sur les noms de champs.
  bank_name          text,
  bank_branch        text,
  account_number     text,
  iban               text,
  swift_bic          text,

  -- Toute autre coordonnée : UNE zone identifiante, pas une colonne par moyen.
  -- Tant qu'aucun moyen n'est confirmé, en créer les colonnes reviendrait à
  -- inventer le besoin (CLAUDE.md §29).
  account_reference  text,

  is_primary         boolean not null default false,
  is_active          boolean not null default true,
  notes              text,

  created_at         timestamptz not null default now(),
  created_by         uuid references public.app_users (id) on delete set null,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.app_users (id) on delete set null,

  -- Un compte bancaire porte au moins un élément d'identification, et
  -- n'emprunte pas la zone générique : les deux voies restent exclusives.
  constraint supplier_payment_bank_shape check (
    kind <> 'BANK_ACCOUNT'
    or (coalesce(bank_name, account_number, iban) is not null and account_reference is null)
  ),

  -- Toute autre coordonnée porte sa référence, et aucune colonne bancaire :
  -- un IBAN sur une coordonnée non bancaire serait une donnée mal rangée.
  constraint supplier_payment_other_shape check (
    kind = 'BANK_ACCOUNT'
    or (account_reference is not null
        and bank_name is null and bank_branch is null and account_number is null
        and iban is null and swift_bic is null)
  )
);

comment on table public.supplier_payment_details is
  'Coordonnées de règlement d''un fournisseur — où et comment il peut être payé. Donnée sensible : lecture et écriture soumises à une permission dédiée. Ne décrit PAS le moyen employé pour une transaction, qui relève de Facturation & Paiement.';
comment on column public.supplier_payment_details.label is
  'Désignation lisible de la coordonnée. Reprise à l''écran et dans le journal d''audit : ne doit porter aucune donnée sensible.';
comment on column public.supplier_payment_details.account_reference is
  'Identifiant d''une coordonnée non bancaire. Générique tant qu''aucun moyen précis n''est arrêté par ADIKOM.';
comment on column public.supplier_payment_details.is_primary is
  'Coordonnée à utiliser par défaut. Une seule par fournisseur, imposée par index unique partiel.';

create index supplier_payment_details_supplier_idx
  on public.supplier_payment_details (supplier_id, is_active);


-- --- Une seule coordonnée principale, imposée par la base ----------------------
--
-- L'index garantit la règle quelle que soit la voie d'écriture ; le trigger la
-- rend tenable, en basculant l'ancienne principale plutôt qu'en refusant la
-- nouvelle. Sans lui, désigner une principale exigerait deux écritures
-- ordonnées, donc une transaction que l'application ne maîtrise pas.

create unique index supplier_payment_primary_uniq
  on public.supplier_payment_details (supplier_id)
  where is_primary;

create or replace function public.fn_supplier_payment_single_primary()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Une coordonnée désactivée ne peut pas rester la coordonnée par défaut.
  if not new.is_active then
    new.is_primary := false;
  end if;

  if new.is_primary then
    -- La mise à jour ci-dessous redéclenche ce trigger sur les lignes
    -- concernées, avec is_primary = false : la branche n'est pas reprise, il
    -- n'y a donc pas de récursion.
    update public.supplier_payment_details
       set is_primary = false
     where supplier_id = new.supplier_id
       and is_primary
       and id <> new.id;
  end if;

  return new;
end;
$$;

comment on function public.fn_supplier_payment_single_primary is
  'Garantit une seule coordonnée de règlement principale par fournisseur, et qu''une coordonnée désactivée ne le reste pas.';

create trigger supplier_payment_details_single_primary
  before insert or update on public.supplier_payment_details
  for each row execute function public.fn_supplier_payment_single_primary();

create trigger supplier_payment_details_set_updated_at
  before update on public.supplier_payment_details
  for each row execute function public.fn_set_updated_at();

-- Toute modification est historisée : opération sensible (Fournisseurs §45).
create trigger supplier_payment_details_audit
  after insert or update or delete on public.supplier_payment_details
  for each row execute function public.fn_audit_row('parties');


-- --- Rédaction du journal d'audit ----------------------------------------------
--
-- DEUX MANQUES CONSTATÉS, CORRIGÉS ENSEMBLE.
--
-- 1. `account_reference` est nouveau, et porte l'identifiant d'une coordonnée
--    non bancaire : aussi sensible qu'un numéro de compte.
--
-- 2. `company_settings.bank_account_details` — les coordonnées bancaires
--    d'ADIKOM elle-même (03_Modules/09_Parametres.md §12) — n'a JAMAIS été
--    couvert, alors que la table porte un trigger d'audit depuis la migration
--    005. Vérification faite le 23/08/2026 : `audit_log.after_data` contient
--    bien la clé, vide seulement parce que le paramètre n'est pas renseigné.
--    Le jour où ADIKOM y saisit son RIB, il partirait en clair dans le
--    journal. Le défaut est comblé avant d'être un incident
--    (05_Regles_Metier/06_Audit.md §79 et §80).
--
-- Le journal conserve QUI a modifié QUOI et QUAND — `label`, `bank_name` et
-- `account_holder` restent lisibles, sans quoi il ne dirait plus QUELLE
-- coordonnée a changé.

create or replace function public.fn_audit_redact(p_data jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_data
    - 'password' - 'encrypted_password' - 'password_hash'
    - 'token' - 'refresh_token' - 'access_token'
    - 'secret' - 'api_key'
    - 'account_number' - 'iban' - 'swift_bic'
    - 'account_reference' - 'bank_account_details';
$$;

comment on function public.fn_audit_redact is
  'Retire du journal les valeurs sensibles, par nom de champ : secrets d''authentification et identifiants de règlement.';


-- --- Reprise des données existantes ---------------------------------------------
--
-- `supplier_bank_details` est vide en production (vérifié le 23/08/2026). La
-- reprise est écrite quand même : une ligne apparue entre-temps serait
-- transportée, et une ligne inexploitable ferait échouer la migration — ce qui
-- vaut mieux que de la perdre en silence.

insert into public.supplier_payment_details (
  supplier_id, kind, label, account_holder,
  bank_name, account_number, iban, swift_bic,
  notes, is_primary, is_active,
  created_at, created_by, updated_at, updated_by
)
select
  supplier_id,
  'BANK_ACCOUNT',
  'Compte bancaire',
  account_holder,
  bank_name, account_number, iban, swift_bic,
  notes, true, true,
  created_at, created_by, updated_at, updated_by
from public.supplier_bank_details;


-- --- Sécurité au niveau des données ---------------------------------------------
--
-- Deuxième barrière de DEC-011. Le périmètre est celui de l'ancienne table
-- (05_Regles_Metier/04_Fournisseurs.md §44 et §46 : voir un fournisseur ne
-- donne pas accès à ses coordonnées de règlement), avec une correction :
--
-- L'ANCIENNE POLICY ÉTAIT `FOR ALL`, DONC LA SUPPRESSION ÉTAIT POSSIBLE.
-- `supplier_bank_details` ne figurait pas non plus dans les `revoke delete`
-- de la migration 018. Un compte porteur de `bank.update` pouvait effacer la
-- ligne. Ici, aucune policy DELETE et le droit retiré : une coordonnée erronée
-- se DÉSACTIVE, comme un tarif ou un document de véhicule (CLAUDE.md §22).

revoke all    on public.supplier_payment_details from anon;
revoke delete on public.supplier_payment_details from authenticated;

alter table public.supplier_payment_details enable row level security;

create policy supplier_payment_details_select on public.supplier_payment_details
  for select to authenticated
  using (public.has_permission('parties.suppliers.bank.view'));

create policy supplier_payment_details_insert on public.supplier_payment_details
  for insert to authenticated
  with check (public.has_permission('parties.suppliers.bank.update'));

create policy supplier_payment_details_update on public.supplier_payment_details
  for update to authenticated
  using (public.has_permission('parties.suppliers.bank.update'))
  with check (public.has_permission('parties.suppliers.bank.update'));

-- Aucune policy DELETE : voir ci-dessus.
