-- =============================================================================
-- ADIKOM PILOT — 014 · Tiers · Clients et fournisseurs
-- Étape 2.2 (DEC-021)
--
-- Règles appliquées :
--   · Un tiers n'est pas un utilisateur du SaaS : aucune connexion, aucun compte
--     (README §65 et §66, 05_Regles_Metier/05_Permissions.md §3).
--   · Un tiers porteur d'historique ne se supprime pas : il s'archive
--     (03_Modules/04_Tiers.md §19, 05_Regles_Metier/04_Fournisseurs.md §48).
--   · Les coordonnées bancaires sont des données sensibles, protégées par une
--     permission dédiée (Fournisseurs §44 à §46, Tiers §22).
--   · Identifiants internes générés côté serveur, jamais saisis
--     (DEC-005, formats confirmés par DEC-021 : CLI-000001 · FOU-000001).
-- =============================================================================

-- --- Interdiction de suppression des données métier -------------------------
--
-- `fn_forbid_mutation` existe déjà, mais son message annonce une table « en
-- écriture seule » : exact pour le journal d'audit, trompeur pour un client ou
-- un véhicule, qui se modifient normalement et ne refusent que la suppression.
-- Un message d'erreur juste fait partie de la gestion des erreurs (CLAUDE.md §43).

create or replace function public.fn_forbid_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception
    'Suppression refusée : cette donnée porte un historique métier. Elle doit être archivée (%).',
    tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

comment on function public.fn_forbid_delete() is
  'Bloque la suppression physique des données métier historisées (CLAUDE.md §22).';


-- --- Extension de la rédaction du journal d'audit ---------------------------
--
-- Les coordonnées bancaires ne doivent pas être recopiées dans le journal :
-- 05_Regles_Metier/06_Audit.md §79 et §80 — aucune donnée sensible inutile.
-- Le journal conserve QUI a modifié QUOI et QUAND, ce qu'exige Fournisseurs §45,
-- sans conserver le numéro de compte lui-même.

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
    - 'account_number' - 'iban' - 'swift_bic';
$$;


-- --- Clients ----------------------------------------------------------------

create table public.clients (
  id                   uuid primary key default gen_random_uuid(),

  -- Identifiant interne CLI-000001, produit par public.next_number('client').
  -- Distinct du nom : il permet de départager deux tiers homonymes (§5.5).
  client_no            text        not null unique,

  type                 public.client_type not null,

  -- Raison sociale (entreprise) ou nom complet (particulier) — §5.2.
  legal_name           text        not null check (length(btrim(legal_name)) > 0),
  trade_name           text,                       -- nom commercial
  first_name           text,                       -- prénom, pour un particulier

  -- Coordonnées. Le téléphone est obligatoire : c'est le seul moyen de contact
  -- systématiquement disponible dans les opérations d'ADIKOM (DEC-021 §4).
  phone                text        not null check (length(btrim(phone)) > 0),
  phone_secondary      text,
  email                text,
  address              text,
  city                 text,
  country              text        default 'Comores',

  -- Identification (§5.3). Les champs applicables varient selon le type de
  -- client ; aucun n'est rendu obligatoire faute de règle ADIKOM.
  id_document_type     text,
  id_document_number   text,
  registration_number  text,                       -- registre du commerce
  tax_identifier       text,                       -- identifiant fiscal
  administrative_notes text,

  status               public.client_status not null default 'ACTIVE',
  status_reason        text,
  status_changed_at    timestamptz,
  status_changed_by    uuid references public.app_users (id) on delete set null,

  notes                text,

  created_at           timestamptz not null default now(),
  created_by           uuid references public.app_users (id) on delete set null,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references public.app_users (id) on delete set null
);

comment on table  public.clients is
  'Clients d''ADIKOM. Donnée métier interne : un client n''a jamais de compte d''accès.';
comment on column public.clients.client_no is
  'Identifiant interne CLI-000001 (DEC-005 / DEC-021). Généré côté serveur, jamais saisi.';
comment on column public.clients.status is
  'ACTIVE · INACTIVE · PROSPECT · ARCHIVED. Un client archivé conserve tout son historique (§19).';

-- Recherche et détection de doublons (§7.3 et §18).
create index clients_legal_name_idx on public.clients (lower(legal_name));
create index clients_phone_idx      on public.clients (phone);
create index clients_email_idx      on public.clients (lower(email)) where email is not null;
create index clients_status_idx     on public.clients (status);
create index clients_city_idx       on public.clients (city);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.fn_set_updated_at();

create trigger clients_audit
  after insert or update on public.clients
  for each row execute function public.fn_audit_row('parties');

-- Un client ne se supprime pas : il s'archive (§19).
create trigger clients_no_delete
  before delete on public.clients
  for each row execute function public.fn_forbid_delete();


-- --- Fournisseurs -----------------------------------------------------------

create table public.suppliers (
  id                   uuid primary key default gen_random_uuid(),

  supplier_no          text        not null unique,   -- FOU-000001

  type                 public.supplier_type not null default 'VEHICLE_SUPPLIER',

  legal_name           text        not null check (length(btrim(legal_name)) > 0),
  trade_name           text,
  contact_name         text,                          -- personne de contact (§4)

  phone                text        not null check (length(btrim(phone)) > 0),
  phone_secondary      text,
  email                text,
  address              text,
  city                 text,
  country              text        default 'Comores',

  registration_number  text,
  tax_identifier       text,
  administrative_notes text,

  status               public.supplier_status not null default 'ACTIVE',
  status_reason        text,                          -- motif, notamment en cas de suspension (§9)
  status_changed_at    timestamptz,
  status_changed_by    uuid references public.app_users (id) on delete set null,

  notes                text,

  created_at           timestamptz not null default now(),
  created_by           uuid references public.app_users (id) on delete set null,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references public.app_users (id) on delete set null
);

comment on table  public.suppliers is
  'Fournisseurs d''ADIKOM. Donnée métier interne : aucun portail, aucun compte d''accès.';
comment on column public.suppliers.status is
  'ACTIVE · INACTIVE · SUSPENDED · ARCHIVED. Seul un fournisseur actif peut porter de nouvelles opérations (§6).';

create index suppliers_legal_name_idx on public.suppliers (lower(legal_name));
create index suppliers_phone_idx      on public.suppliers (phone);
create index suppliers_email_idx      on public.suppliers (lower(email)) where email is not null;
create index suppliers_status_idx     on public.suppliers (status);
create index suppliers_type_idx       on public.suppliers (type);

create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.fn_set_updated_at();

create trigger suppliers_audit
  after insert or update on public.suppliers
  for each row execute function public.fn_audit_row('parties');

create trigger suppliers_no_delete
  before delete on public.suppliers
  for each row execute function public.fn_forbid_delete();


-- --- Coordonnées bancaires du fournisseur -----------------------------------
--
-- Table distincte, et non colonnes de `suppliers`, pour une raison de sécurité :
-- une permission dédiée doit pouvoir en interdire la lecture (Fournisseurs §44
-- et §46). Une policy RLS s'applique à une ligne entière, pas à une colonne :
-- séparer la table est le seul moyen d'appliquer réellement cette restriction
-- au niveau des données, et pas seulement à l'affichage (Tiers §22).

create table public.supplier_bank_details (
  supplier_id     uuid primary key references public.suppliers (id) on delete cascade,

  bank_name       text,
  account_holder  text,
  account_number  text,
  iban            text,
  swift_bic       text,
  notes           text,

  created_at      timestamptz not null default now(),
  created_by      uuid references public.app_users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.app_users (id) on delete set null
);

comment on table public.supplier_bank_details is
  'Coordonnées bancaires fournisseur. Donnée sensible : lecture et écriture soumises à une permission dédiée.';

create trigger supplier_bank_details_set_updated_at
  before update on public.supplier_bank_details
  for each row execute function public.fn_set_updated_at();

-- Toute modification est historisée : opération sensible (Fournisseurs §45).
create trigger supplier_bank_details_audit
  after insert or update or delete on public.supplier_bank_details
  for each row execute function public.fn_audit_row('parties');
