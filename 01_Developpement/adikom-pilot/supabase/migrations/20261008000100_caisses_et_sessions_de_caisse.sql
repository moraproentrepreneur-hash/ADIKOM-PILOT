-- =============================================================================
-- ADIKOM PILOT — 108 · Point de vente : caisses et sessions de caisse
-- LOT 27 — Plan 02 §7.5, §8, §9.1, §9.4, §9.5, §11.4, §12 · Plan 01 §16.1,
-- §16.9–16.13 · Module 12 (`00 Documentation/03_Modules/12_Point_de_Vente.md`)
-- Décisions Direction du 8 octobre 2026 : B-8, B-9, B-13, C-27, T-1.
--
-- CE QUE CETTE MIGRATION POSE
--
--   · l'énumération `pos_session_status` (OPEN · CLOSED) — NOUVELLE, donc
--     utilisable dans la même migration (aucun `alter type … add value`) ;
--   · trois tables : `pos_registers`, `pos_sessions`, `pos_session_amounts` ;
--   · leurs contraintes, index, gardes, journal et RLS.
--
-- Les FONCTIONS (déclarer, ouvrir, clôturer, dériver) relèvent de la migration
-- SUIVANTE ; les capacités et la numérotation de la 110 ; la sauvegarde de la 111.
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 🟥 UNE CAISSE N'EST PAS UN COMPTE : ELLE EN UTILISE UN
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Plan 02 §20.1, garantie n° 5 : « une seule trésorerie ». Une caisse s'adosse à
-- un compte financier de type `CASH`. Elle ne porte ni solde, ni écriture :
-- `financial_account_balance()` reste l'unique vérité du solde.
--
-- LE TYPE `CASH` EST GARANTI PAR UNE CLÉ ÉTRANGÈRE COMPOSITE, PAS PAR UNE LECTURE.
-- `(account_id, account_kind)` → `financial_accounts (id, kind)`, avec
-- `account_kind = 'CASH'`. Une clé étrangère s'évalue sous le propriétaire de la
-- table : elle ne lit RIEN à travers RLS, et elle tient dans la durée — changer
-- en « compte bancaire » le type d'un compte qui adosse une caisse est refusé.
-- C'est le motif de la migration 097 §3 (`service_variants (id, service_id)`).
--
-- L'ÉTAT `ACTIVE` N'EST PAS EXPRIMABLE PAR UNE CLÉ (il change légitimement) : la
-- garde le lit SOUS LES DROITS DE L'APPELANT et REFUSE si elle ne le voit pas.
-- Elle ne conclut jamais « actif » faute de lecture — l'échec est FERMÉ.
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 🟥 T-1 — LES MONTANTS DANS UNE TABLE SŒUR
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- `pos.sessions.view` doit montrer QUI était en caisse sans montrer COMBIEN il y
-- avait dedans. RLS filtre des LIGNES, jamais des colonnes (DEC-044, précédent
-- `maintenance_costs`) : le fond de caisse et le montant compté vivent donc dans
-- `pos_session_amounts`, sœur 1:1 de la session.
--
-- B-13 — sa lecture dépend de QUI EST SUR LA LIGNE :
--
--     pos.sessions.amounts.view   OU   cashier_id = current_actor()
--
-- `cashier_id` y est RECOPIÉ, et la clé étrangère composite
-- `(session_id, cashier_id)` → `pos_sessions (id, cashier_id)` garantit que la
-- copie dit vrai. La policy n'a donc pas à relire la session à travers RLS.
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 🟥 NÉES — ET MODIFIÉES — PAR LEURS FONCTIONS (Rapport 20 §3)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- La leçon du Rapport 20 est appliquée DÈS LA NAISSANCE, et plus largement qu'au
-- LOT 26 : sur ces trois tables, aucune INSERTION ni aucune MODIFICATION ne passe
-- hors des fonctions prévues. Un drapeau local à la transaction est posé par la
-- fonction juste avant son écriture et refermé juste après ; un déclencheur
-- `zzz_…`, DERNIER de sa table, le relit.
--
--   adikom.pos_register   ←  create_pos_register, update_pos_register,
--                            set_pos_register_active
--   adikom.pos_session    ←  open_pos_session, close_pos_session
--
-- Sans cela, un `POST` ou un `PATCH` direct contournerait le numéroteur, la
-- caisse active, le compte `CASH`, l'unicité par utilisateur, ou clôturerait une
-- session sans montant compté.
--
-- 🟥 AUCUNE FONCTION `SECURITY DEFINER` (doctrine D4, consigne du LOT 27).
-- =============================================================================


-- =============================================================================
-- 1. L'ÉNUMÉRATION — Plan 02 §9.5
-- =============================================================================

do $$ begin
  create type public.pos_session_status as enum ('OPEN', 'CLOSED');
exception when duplicate_object then null; end $$;

comment on type public.pos_session_status is
  'OPEN : la session est en cours. CLOSED : close, état terminal — une session close ne se rouvre pas.';


-- =============================================================================
-- 2. LA CAISSE
-- =============================================================================

/*
 * La clé étrangère composite exige un index d'unicité sur la paire désignée.
 * `id` étant déjà unique, celui-ci ne contraint RIEN de plus `financial_accounts` :
 * il rend seulement la paire désignable. Aucune ligne, aucune colonne, aucune
 * policy de la table n'est touchée.
 */
create unique index if not exists financial_accounts_id_kind_idx
  on public.financial_accounts (id, kind);

create table public.pos_registers (
  id uuid primary key default gen_random_uuid(),

  -- CAI-000001 — règle `pos_register` (migration 110), sans année.
  register_no text not null unique,

  label text not null,

  account_id   uuid not null,
  -- Toujours `CASH` : la colonne n'existe que pour porter la clé composite.
  account_kind public.financial_account_kind not null default 'CASH',

  location text,

  is_active boolean not null default true,

  status_reason     text,
  status_changed_at timestamptz,
  status_changed_by uuid references public.app_users (id) on delete set null,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  constraint pos_registers_label_not_blank check (btrim(label) <> ''),
  constraint pos_registers_location_not_blank check (location is null or btrim(location) <> ''),
  constraint pos_registers_account_is_cash check (account_kind = 'CASH'),

  -- 🟥 LA GARANTIE « UNE SEULE TRÉSORERIE » : le compte est une caisse, et le
  -- reste. Évaluée sans RLS.
  constraint pos_registers_cash_account
    foreign key (account_id, account_kind)
    references public.financial_accounts (id, kind)
    on delete restrict
);

comment on table public.pos_registers is
  'Caisse du point de vente, adossée à un compte financier CASH actif. Ne porte ni solde ni écriture : une seule trésorerie (Plan 02 §20.1).';
comment on column public.pos_registers.account_kind is
  'Toujours CASH. Porte la clé étrangère composite qui garantit, sans lecture à travers RLS, que le compte adossé est une caisse.';

create index pos_registers_account_idx on public.pos_registers (account_id);
create index pos_registers_active_idx  on public.pos_registers (is_active, label);


-- =============================================================================
-- 3. LA SESSION
-- =============================================================================

create table public.pos_sessions (
  id uuid primary key default gen_random_uuid(),

  -- SES-2026-000001 — règle `pos_session` (migration 110), avec année.
  session_no text not null unique,

  register_id uuid not null references public.pos_registers (id) on delete restrict,

  -- LE CAISSIER EST L'UTILISATEUR QUI OUVRE. Nul n'ouvre au nom d'un autre.
  cashier_id uuid not null references public.app_users (id) on delete restrict,

  status public.pos_session_status not null default 'OPEN',

  -- Horodatés par la base, jamais saisis.
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.app_users (id) on delete set null,

  closing_note text,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  -- Rend la paire désignable par la table sœur.
  constraint pos_sessions_id_cashier_key unique (id, cashier_id),

  constraint pos_sessions_closed_is_dated check (
    (status = 'OPEN'   and closed_at is null and closed_by is null and closing_note is null)
    or (status = 'CLOSED' and closed_at is not null)
  ),
  constraint pos_sessions_closed_after_opened check (closed_at is null or closed_at >= opened_at),
  constraint pos_sessions_note_not_blank check (closing_note is null or btrim(closing_note) <> '')
);

comment on table public.pos_sessions is
  'Session de caisse : qui (caissier), sur quelle caisse, de quand à quand. AUCUN montant : ils vivent dans pos_session_amounts (T-1).';
comment on column public.pos_sessions.cashier_id is
  'Le caissier — l''utilisateur qui a ouvert la session. Immuable.';

/*
 * 🟥 B-8 — DEUX UNICITÉS, TENUES PAR LA BASE.
 *
 * Une session ouverte par caisse ; une session ouverte par utilisateur, même s'il
 * existe plusieurs caisses. Les fonctions le disent AVANT d'écrire ; les index
 * font autorité, y compris pour deux clics simultanés.
 */
create unique index pos_sessions_one_open_per_register_idx
  on public.pos_sessions (register_id) where status = 'OPEN';

create unique index pos_sessions_one_open_per_cashier_idx
  on public.pos_sessions (cashier_id) where status = 'OPEN';

/*
 * « QUI ÉTAIT EN CAISSE LE J ENTRE 10H00 ET 11H30 ? » — Plan 02 §9.4.
 *
 * La période d'une session est `[ouverture, clôture)`, une session ouverte
 * courant jusqu'à l'infini. `pos_sessions_in_window` (migration 109) interroge
 * EXACTEMENT cette expression : c'est ce qui permet au planificateur d'employer
 * l'index.
 */
create index pos_sessions_period_gist_idx
  on public.pos_sessions
  using gist (tstzrange(opened_at, coalesce(closed_at, 'infinity'::timestamptz), '[)'));

create index pos_sessions_register_idx on public.pos_sessions (register_id, opened_at desc);
create index pos_sessions_cashier_idx  on public.pos_sessions (cashier_id, opened_at desc);
create index pos_sessions_opened_idx   on public.pos_sessions (opened_at desc);


-- =============================================================================
-- 4. LES MONTANTS — table sœur 1:1 (T-1)
-- =============================================================================

create table public.pos_session_amounts (
  session_id uuid primary key,

  /*
   * RECOPIÉ de la session, pour la policy par ligne (B-13).
   *
   * Il cite AUSSI `app_users` directement : la restauration écarte une ligne
   * dont l'utilisateur obligatoire a disparu (migration 075). La session et ses
   * montants sont alors écartés ENSEMBLE — sans quoi les montants orphelins
   * feraient échouer la reprise sur la clé composite.
   */
  cashier_id uuid not null references public.app_users (id) on delete restrict,

  -- DEC-010 : entiers, en KMF.
  opening_float  bigint not null,
  counted_amount bigint,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  constraint pos_session_amounts_float_positive   check (opening_float >= 0),
  constraint pos_session_amounts_counted_positive check (counted_amount is null or counted_amount >= 0),

  -- 🟥 La copie dit vrai : le caissier des montants EST celui de la session.
  constraint pos_session_amounts_session_fk
    foreign key (session_id, cashier_id)
    references public.pos_sessions (id, cashier_id)
    on delete restrict
);

comment on table public.pos_session_amounts is
  'Montants d''une session (T-1) : fond de caisse et montant compté. Lecture par ligne : pos.sessions.amounts.view OU caissier de la ligne (B-13). Théorique et écart sont DÉRIVÉS, jamais stockés (D1).';
comment on column public.pos_session_amounts.counted_amount is
  'Montant compté à la clôture, obligatoire pour clôturer. NULL tant que la session est ouverte.';

create index pos_session_amounts_cashier_idx on public.pos_session_amounts (cashier_id);


-- =============================================================================
-- 5. LES GARDES DE COHÉRENCE ET DE CYCLE DE VIE
--
-- Elles passent AVANT la garde « née par sa fonction » (préfixe `zzz_`) : une
-- écriture mal formée est refusée pour SA raison, et la recette éprouve ce
-- qu'elle nomme (Rapport 20 §3).
--
-- La restauration les lève (`is_restoring()`) : elle REMET ce qui a existé, elle
-- ne le revalide pas contre l'état d'aujourd'hui (migration 075).
-- =============================================================================

-- --- 5.1 La caisse --------------------------------------------------------------

create or replace function public.fn_pos_register_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_seen   boolean := false;
  v_kind   public.financial_account_kind;
  v_status public.financial_account_status;
  v_label  text;
begin
  if public.is_restoring() then return new; end if;

  if tg_op = 'UPDATE' then
    if new.register_no is distinct from old.register_no
       or new.created_at is distinct from old.created_at
       or new.created_by is distinct from old.created_by then
      raise exception
        'Opération refusée : le numéro et l''origine d''une caisse ne se réécrivent pas.'
        using errcode = 'check_violation';
    end if;
  end if;

  /*
   * LE COMPTE ADOSSÉ EST UNE CAISSE ACTIVE — à la déclaration, au changement de
   * compte, et à la réactivation.
   *
   * Le TYPE est déjà tenu par la clé composite ; l'ÉTAT ne peut l'être que par
   * une lecture. Elle se fait sous les droits de l'appelant, et l'échec est
   * FERMÉ : un compte invisible n'est jamais présumé actif. Les fonctions
   * exigent `treasury.accounts.view` pour que ce refus ne frappe que ce qu'il
   * doit frapper.
   */
  if tg_op = 'INSERT'
     or new.account_id is distinct from old.account_id
     or (new.is_active and not old.is_active) then

    select true, a.kind, a.status, a.label
      into v_seen, v_kind, v_status, v_label
    from public.financial_accounts a
    where a.id = new.account_id;

    if not coalesce(v_seen, false) then
      raise exception
        'Le compte adossé à la caisse est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;

    if v_kind <> 'CASH' then
      raise exception
        'Opération refusée : « % » est un compte bancaire. Une caisse s''adosse obligatoirement à un compte de type Caisse.',
        v_label
        using errcode = 'check_violation';
    end if;

    if new.is_active and v_status <> 'ACTIVE' then
      raise exception
        'Opération refusée : le compte « % » n''est pas actif. Un compte inactif ou archivé ne reçoit plus de nouvelle opération (Module 06 §10).',
        v_label
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.fn_pos_register_guard() is
  'Garde d''une caisse : numéro immuable ; compte adossé CASH et ACTIF à la déclaration, au changement de compte et à la réactivation. Lit sous les droits de l''appelant, échec fermé.';

revoke execute on function public.fn_pos_register_guard() from public, anon;

create trigger pos_registers_guard
  before insert or update on public.pos_registers
  for each row execute function public.fn_pos_register_guard();


-- --- 5.2 La session ------------------------------------------------------------

create or replace function public.fn_pos_session_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_restoring() then return new; end if;

  if tg_op = 'INSERT' then
    -- Une session NAÎT ouverte.
    if new.status <> 'OPEN' or new.closed_at is not null or new.closed_by is not null
       or new.closing_note is not null then
      raise exception
        'Opération refusée : une session de caisse naît ouverte. Elle se clôt ensuite, avec son montant compté.'
        using errcode = 'check_violation';
    end if;

    -- Le caissier est l'utilisateur qui ouvre : nul n'ouvre au nom d'un autre.
    if public.current_actor() is not null and new.cashier_id <> public.current_actor() then
      raise exception
        'Opération refusée : une session s''ouvre au nom de l''utilisateur qui l''ouvre, jamais au nom d''un autre.'
        using errcode = 'check_violation';
    end if;

    return new;
  end if;

  -- UPDATE ----------------------------------------------------------------------
  if new.session_no  is distinct from old.session_no
     or new.register_id is distinct from old.register_id
     or new.cashier_id  is distinct from old.cashier_id
     or new.opened_at   is distinct from old.opened_at
     or new.created_at  is distinct from old.created_at
     or new.created_by  is distinct from old.created_by then
    raise exception
      'Opération refusée : la caisse, le caissier, le numéro et l''heure d''ouverture d''une session ne se réécrivent pas.'
      using errcode = 'check_violation';
  end if;

  -- 🟥 ÉTAT TERMINAL — une session close ne se rouvre pas, ni ne se retouche.
  if old.status = 'CLOSED' then
    if new.status is distinct from old.status then
      raise exception
        'Opération refusée : une session close ne se rouvre pas.'
        using errcode = 'check_violation';
    end if;

    if new.closed_at    is distinct from old.closed_at
       or new.closed_by    is distinct from old.closed_by
       or new.closing_note is distinct from old.closing_note then
      raise exception
        'Opération refusée : une session close est figée — sa clôture et son observation ne se réécrivent pas.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.fn_pos_session_guard() is
  'Garde d''une session : naît ouverte, au nom de son caissier ; caisse, caissier, numéro et ouverture immuables ; CLOSED est terminal et figé.';

revoke execute on function public.fn_pos_session_guard() from public, anon;

create trigger pos_sessions_guard
  before insert or update on public.pos_sessions
  for each row execute function public.fn_pos_session_guard();


-- --- 5.3 Les montants ------------------------------------------------------------

create or replace function public.fn_pos_session_amounts_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_restoring() then return new; end if;

  if tg_op = 'INSERT' then
    -- Les montants naissent avec la session : seul le fond est connu.
    if new.counted_amount is not null then
      raise exception
        'Opération refusée : le montant compté se constate à la clôture, jamais à l''ouverture.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.session_id is distinct from old.session_id
     or new.cashier_id is distinct from old.cashier_id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception
      'Opération refusée : les montants d''une session ne changent ni de session ni de caissier.'
      using errcode = 'check_violation';
  end if;

  -- Le fond de caisse est DÉCLARÉ à l'ouverture : le réécrire déplacerait l'écart.
  if new.opening_float is distinct from old.opening_float then
    raise exception
      'Opération refusée : le fond de caisse déclaré à l''ouverture ne se réécrit pas.'
      using errcode = 'check_violation';
  end if;

  -- Le montant compté se constate UNE FOIS, à la clôture.
  if old.counted_amount is not null and new.counted_amount is distinct from old.counted_amount then
    raise exception
      'Opération refusée : le montant compté d''une session close ne se réécrit pas.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_pos_session_amounts_guard() is
  'Garde des montants : fond de caisse immuable ; montant compté posé une seule fois, à la clôture.';

revoke execute on function public.fn_pos_session_amounts_guard() from public, anon;

create trigger pos_session_amounts_guard
  before insert or update on public.pos_session_amounts
  for each row execute function public.fn_pos_session_amounts_guard();


-- --- 5.4 Session et montants vont ensemble — vérifié à la validation ---------
--
-- Une session OUVERTE a son fond de caisse ; une session CLOSE a son montant
-- compté. Les deux tables s'écrivent dans la même transaction : le contrôle est
-- DIFFÉRÉ à sa fin, quand tout est écrit (motif de la migration 063).
--
-- Il lit les montants sous les droits de l'appelant. Les acteurs légitimes — le
-- caissier, ou un porteur de `pos.sessions.amounts.view` exigé par
-- `close_pos_session` pour clôturer la session d'un autre — les voient. Ne pas
-- les voir est traité comme une absence : l'échec est FERMÉ.

create or replace function public.fn_pos_session_amounts_consistent()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_seen    boolean := false;
  v_counted bigint;
  v_status  public.pos_session_status;
begin
  if public.is_restoring() then return null; end if;

  select s.status into v_status from public.pos_sessions s where s.id = new.id;
  if v_status is null then return null; end if;  -- ligne remplacée depuis

  select true, a.counted_amount into v_seen, v_counted
  from public.pos_session_amounts a
  where a.session_id = new.id;

  if not coalesce(v_seen, false) then
    raise exception
      'Opération refusée : une session de caisse porte toujours son fond de caisse. Elle s''ouvre par la fonction prévue.'
      using errcode = 'check_violation';
  end if;

  if v_status = 'CLOSED' and v_counted is null then
    raise exception
      'Opération refusée : une session se clôt avec un montant compté obligatoire.'
      using errcode = 'check_violation';
  end if;

  if v_status = 'OPEN' and v_counted is not null then
    raise exception
      'Opération refusée : une session ouverte ne porte pas encore de montant compté.'
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

comment on function public.fn_pos_session_amounts_consistent() is
  'Contrôle différé : une session OUVERTE porte son fond de caisse, une session CLOSE son montant compté.';

revoke execute on function public.fn_pos_session_amounts_consistent() from public, anon;

create constraint trigger pos_sessions_amounts_consistent
  after insert or update on public.pos_sessions
  deferrable initially deferred
  for each row execute function public.fn_pos_session_amounts_consistent();


-- =============================================================================
-- 6. NÉES — ET MODIFIÉES — PAR LEURS FONCTIONS (Rapport 20 §3)
--
-- 🟥 ELLES SE DÉCLENCHENT EN DERNIER : le préfixe `zzz_` les place après toutes
-- les autres gardes BEFORE de leur table. En premier, elles masqueraient leurs
-- refus.
--
-- Elles ne lisent que `current_setting` et `is_restoring()` : aucune fonction
-- `SECURITY DEFINER` n'est nécessaire.
-- =============================================================================

create or replace function public.fn_pos_register_born_by_function()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_restoring() then return new; end if;

  if coalesce(current_setting('adikom.pos_register', true), 'off') <> 'on' then
    raise exception
      'Opération refusée : une caisse se déclare et se modifie par les fonctions prévues, jamais par écriture directe. Sans elles, le numéroteur et le contrôle du compte adossé seraient contournés.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.fn_pos_register_born_by_function() is
  'Une caisse naît et se modifie par create_pos_register, update_pos_register, set_pos_register_active — ou par une restauration. Jamais par écriture directe.';

revoke execute on function public.fn_pos_register_born_by_function() from public, anon;

create trigger pos_registers_zzz_born_by_function
  before insert or update on public.pos_registers
  for each row execute function public.fn_pos_register_born_by_function();


create or replace function public.fn_pos_session_born_by_function()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_restoring() then return new; end if;

  if coalesce(current_setting('adikom.pos_session', true), 'off') <> 'on' then
    raise exception
      'Opération refusée : une session de caisse s''ouvre et se clôt par les fonctions prévues, jamais par écriture directe. Sans elles, le numéroteur, la caisse active et le montant compté seraient contournés.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.fn_pos_session_born_by_function() is
  'Une session et ses montants naissent par open_pos_session et se modifient par close_pos_session — ou par une restauration. Jamais par écriture directe.';

revoke execute on function public.fn_pos_session_born_by_function() from public, anon;

create trigger pos_sessions_zzz_born_by_function
  before insert or update on public.pos_sessions
  for each row execute function public.fn_pos_session_born_by_function();

create trigger pos_session_amounts_zzz_born_by_function
  before insert or update on public.pos_session_amounts
  for each row execute function public.fn_pos_session_born_by_function();


-- =============================================================================
-- 7. HORODATAGE, SUPPRESSION, JOURNAL
-- =============================================================================

create trigger pos_registers_set_updated_at
  before update on public.pos_registers
  for each row execute function public.fn_set_updated_at();
create trigger pos_sessions_set_updated_at
  before update on public.pos_sessions
  for each row execute function public.fn_set_updated_at();
create trigger pos_session_amounts_set_updated_at
  before update on public.pos_session_amounts
  for each row execute function public.fn_set_updated_at();

-- D6 : une caisse se désactive, une session se clôt — rien ne s'efface.
create trigger pos_registers_no_delete
  before delete on public.pos_registers
  for each row execute function public.fn_forbid_delete();
create trigger pos_sessions_no_delete
  before delete on public.pos_sessions
  for each row execute function public.fn_forbid_delete();
create trigger pos_session_amounts_no_delete
  before delete on public.pos_session_amounts
  for each row execute function public.fn_forbid_delete();

create trigger pos_registers_audit
  after insert or update on public.pos_registers
  for each row execute function public.fn_audit_row('pos');


/*
 * LE JOURNAL DES SESSIONS — Plan 02 §12 : ouverture `CREATE`, clôture `VALIDATE`.
 *
 * `fn_audit_row` qualifierait la clôture de `STATUS_CHANGE`. Le Plan 02 la nomme
 * `VALIDATE` : c'est un acte de constat, pas un simple changement d'état. Cette
 * fonction le dit, et rien d'autre ne change — elle délègue à `log_audit`.
 *
 * 🟥 B-9 — LA CLÔTURE CONSTATE L'ÉCART ET L'AUDITE.
 *
 * L'événement de clôture des MONTANTS porte, en plus du montant compté, le
 * théorique et l'écart TELS QU'ILS ÉTAIENT AU MOMENT DE LA CLÔTURE. Ce n'est pas
 * un montant stocké (D1) : c'est le témoignage daté d'un constat, dans le
 * journal — qui, lui, ne se réécrit jamais. La vérité courante reste calculée
 * par `pos_session_variance`.
 *
 * L'entité de la ligne de montants est la SESSION : les deux tables partagent le
 * même identifiant d'objet, et l'historique d'une session se lit d'un trait.
 *
 * Le détail de chaque événement reste gardé par `audit_detail_permission` : un
 * événement de montants ne s'ouvre qu'à `pos.sessions.amounts.view` (DEC-038).
 */
create or replace function public.fn_audit_pos_session_row()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_action public.audit_action;
  v_before jsonb;
  v_after  jsonb;
  v_id     text;
  v_exp    bigint;
begin
  if tg_op = 'INSERT' then
    v_action := 'CREATE';
    v_after  := to_jsonb(new);
  else
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);

    if (v_before - 'updated_at' - 'updated_by') = (v_after - 'updated_at' - 'updated_by') then
      return new;
    end if;

    if tg_table_name = 'pos_sessions'
       and (v_before ->> 'status') = 'OPEN' and (v_after ->> 'status') = 'CLOSED' then
      v_action := 'VALIDATE';
    elsif tg_table_name = 'pos_session_amounts'
       and (v_before ->> 'counted_amount') is null and (v_after ->> 'counted_amount') is not null then
      v_action := 'VALIDATE';

      if not public.is_restoring() then
        -- Le théorique du LOT 27 est le fond de caisse ; la migration 109 le
        -- calcule, et le LOT 28 l'enrichira sans toucher à ce journal.
        v_exp := public.pos_session_expected((v_after ->> 'session_id')::uuid);
        v_after := v_after
          || jsonb_build_object(
               'expected_amount', v_exp,
               'variance', case when v_exp is null then null
                                else (v_after ->> 'counted_amount')::bigint - v_exp end);
      end if;
    else
      v_action := 'UPDATE';
    end if;
  end if;

  v_id := coalesce(v_after ->> 'id', v_after ->> 'session_id');

  perform public.log_audit(
    p_action      => v_action,
    p_entity_type => tg_table_name,
    p_entity_id   => v_id,
    p_module_code => 'pos',
    p_before      => v_before,
    p_after       => v_after
  );

  return new;
end;
$$;

comment on function public.fn_audit_pos_session_row() is
  'Journal des sessions de caisse : ouverture CREATE, clôture VALIDATE — les montants de clôture portent le théorique et l''écart constatés (B-9).';

revoke execute on function public.fn_audit_pos_session_row() from public, anon;

create trigger pos_sessions_audit
  after insert or update on public.pos_sessions
  for each row execute function public.fn_audit_pos_session_row();

create trigger pos_session_amounts_audit
  after insert or update on public.pos_session_amounts
  for each row execute function public.fn_audit_pos_session_row();


-- =============================================================================
-- 8. RLS — patron du Plan 02 §8.2, `has_permission` en SOUS-SELECT
-- =============================================================================

revoke all on public.pos_registers       from anon;
revoke all on public.pos_sessions        from anon;
revoke all on public.pos_session_amounts from anon;

revoke delete on public.pos_registers       from authenticated;
revoke delete on public.pos_sessions        from authenticated;
revoke delete on public.pos_session_amounts from authenticated;

-- DEC-039 §g : TRUNCATE contournerait `fn_forbid_delete` et le journal.
revoke truncate on public.pos_registers       from authenticated;
revoke truncate on public.pos_sessions        from authenticated;
revoke truncate on public.pos_session_amounts from authenticated;

alter table public.pos_registers       enable row level security;
alter table public.pos_sessions        enable row level security;
alter table public.pos_session_amounts enable row level security;


-- --- Caisses --------------------------------------------------------------------

create policy pos_registers_select on public.pos_registers
  for select to authenticated
  using ((select public.has_permission('pos.registers.view')));

create policy pos_registers_insert on public.pos_registers
  for insert to authenticated
  with check ((select public.has_permission('pos.registers.create')));

create policy pos_registers_update on public.pos_registers
  for update to authenticated
  using (
    (select public.has_permission('pos.registers.update'))
    or (select public.has_permission('pos.registers.archive'))
  )
  with check (
    (select public.has_permission('pos.registers.update'))
    or (select public.has_permission('pos.registers.archive'))
  );


-- --- Sessions — AUCUN montant ici ---------------------------------------------

create policy pos_sessions_select on public.pos_sessions
  for select to authenticated
  using ((select public.has_permission('pos.sessions.view')));

-- On n'ouvre une session qu'à son propre nom.
create policy pos_sessions_insert on public.pos_sessions
  for insert to authenticated
  with check (
    (select public.has_permission('pos.sessions.open'))
    and cashier_id = (select public.current_actor())
  );

create policy pos_sessions_update on public.pos_sessions
  for update to authenticated
  using ((select public.has_permission('pos.sessions.close')))
  with check ((select public.has_permission('pos.sessions.close')));


-- --- 🟥 Montants — LA POLICY PAR LIGNE (B-13, Plan 02 §11.4) -------------------
--
-- Premier objet du SaaS dont la lecture dépend de QUI EST SUR LA LIGNE :
--   · `pos.sessions.amounts.view` : tous les montants ;
--   · sinon : les montants de SES PROPRES sessions, et ceux-là seulement.
--
-- Le caissier A ne voit pas les montants du caissier B. Écrit, testé dans les
-- deux sens (`supabase/tests/pos_sessions.sql`).

create policy pos_session_amounts_select on public.pos_session_amounts
  for select to authenticated
  using (
    (select public.has_permission('pos.sessions.amounts.view'))
    or cashier_id = (select public.current_actor())
  );

create policy pos_session_amounts_insert on public.pos_session_amounts
  for insert to authenticated
  with check (
    (select public.has_permission('pos.sessions.open'))
    and cashier_id = (select public.current_actor())
  );

-- Clôturer, c'est poser le montant compté : sur SA session, ou sur celle d'un
-- autre si l'on peut en voir les montants (Module 12 §11, Q-2).
create policy pos_session_amounts_update on public.pos_session_amounts
  for update to authenticated
  using (
    (select public.has_permission('pos.sessions.close'))
    and (
      (select public.has_permission('pos.sessions.amounts.view'))
      or cashier_id = (select public.current_actor())
    )
  )
  with check (
    (select public.has_permission('pos.sessions.close'))
    and (
      (select public.has_permission('pos.sessions.amounts.view'))
      or cashier_id = (select public.current_actor())
    )
  );


-- =============================================================================
-- 9. LE JOURNAL N'OUVRE PAS CE QUE LA TABLE FERME — DEC-038
--
-- Reprise ENTIÈRE de la DERNIÈRE VERSION ACTIVE (migration 101,
-- `20260923000500_commerce_fournisseur_devis_et_commandes.sql`), à laquelle
-- s'ajoutent les trois tables du lot. Une correspondance omise refermerait un
-- objet sur le seul Super Admin, en silence : le contrôle du §10 les vérifie.
--
-- 🟥 LES MONTANTS GARDENT LEUR LECTURE JUSQUE DANS LE JOURNAL. Un événement de
-- `pos_session_amounts` porte un fond de caisse, un compté, un écart : il ne
-- s'ouvre qu'à `pos.sessions.amounts.view`. Le journal ne sait pas appliquer la
-- règle « caissier de la ligne » : il retient la lecture la plus étroite.
-- =============================================================================

create or replace function public.audit_detail_permission(p_entity_type text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_entity_type
    -- --- Utilisateurs & Groupes ----------------------------------------------
    when 'app_users'                      then 'users.users.view'
    when 'user_groups'                    then 'users.users.view'
    when 'user_departments'               then 'users.users.view'
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
    when 'supplier_vehicle_rates'         then 'rental.pricing.supplier.view'
    when 'reservations'                   then 'rental.reservations.view'
    when 'rentals'                        then 'rental.rentals.view'
    when 'rental_inspections'             then 'rental.rentals.view'
    when 'rental_inspection_photos'       then 'rental.rentals.view'
    -- LOT 22 : l'acte et ses effets se lisent avec le contrat…
    when 'rental_amendments'              then 'rental.rentals.view'
    when 'rental_segments'                then 'rental.rentals.view'
    -- … le COÛT GELÉ, lui, garde SA lecture jusque dans le journal (A-2).
    when 'rental_segment_costs'           then 'rental.pricing.supplier.view'
    -- LOT 23 : le découpage de la créance, sans aucun montant.
    when 'rental_billing_periods'         then 'rental.rentals.view'
    when 'vehicle_incidents'              then 'rental.incidents.view'
    when 'incident_damages'               then 'rental.incidents.view'
    when 'incident_photos'                then 'rental.incidents.view'
    when 'vehicle_maintenances'           then 'rental.maintenance.view'
    when 'maintenance_documents'          then 'rental.maintenance.view'
    when 'maintenance_quotes'             then 'rental.maintenance.view'
    when 'maintenance_costs'              then 'rental.maintenance.cost.view'
    when 'maintenance_cost_lines'         then 'rental.maintenance.cost.view'

    -- --- Produits & Services — LOT 20 ----------------------------------------
    when 'service_categories'             then 'catalog.categories.view'
    when 'services'                       then 'catalog.services.view'
    when 'service_variants'               then 'catalog.services.view'
    when 'service_variant_prices'         then 'catalog.services.view'
    when 'service_variant_costs'          then 'catalog.services.cost.view'

    -- --- Commerce client — LOT 25 --------------------------------------------
    -- Deux menus, deux capacités : consulter les devis n'ouvre pas les
    -- commandes, et réciproquement (A-14).
    when 'sales_quotes'                   then 'commerce.sales_quotes.view'
    when 'sales_quote_lines'              then 'commerce.sales_quotes.view'
    when 'sales_orders'                   then 'commerce.sales_orders.view'
    when 'sales_order_lines'              then 'commerce.sales_orders.view'

    -- --- Commerce fournisseur — LOT 26 ---------------------------------------
    -- 🟥 Ces événements portent des PRIX D'ACHAT dans leur avant/après. Le
    -- journal ne les ouvre donc pas plus largement que la table (DEC-038).
    when 'purchase_quotes'                then 'commerce.purchase_quotes.view'
    when 'purchase_quote_lines'           then 'commerce.purchase_quotes.view'
    when 'purchase_orders'                then 'commerce.purchase_orders.view'
    when 'purchase_order_lines'           then 'commerce.purchase_orders.view'

    -- --- Point de vente — LOT 27 ---------------------------------------------
    -- La session se lit sans ses montants ; les montants gardent LEUR lecture.
    when 'pos_registers'                  then 'pos.registers.view'
    when 'pos_sessions'                   then 'pos.sessions.view'
    when 'pos_session_amounts'            then 'pos.sessions.amounts.view'

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
-- 10. CONTRÔLES
-- =============================================================================

do $$
declare
  v_table text;
  v_n     int;
  v_fn    text;
begin
  foreach v_table in array array['pos_registers', 'pos_sessions', 'pos_session_amounts'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_table)::regclass) then
      raise exception 'RLS non activée sur %.', v_table;
    end if;
    if has_table_privilege('anon', 'public.' || v_table, 'SELECT') then
      raise exception 'La table % est lisible par anon.', v_table;
    end if;
    if has_table_privilege('authenticated', 'public.' || v_table, 'DELETE') then
      raise exception 'DELETE encore accordé à authenticated sur %.', v_table;
    end if;
    if has_table_privilege('authenticated', 'public.' || v_table, 'TRUNCATE') then
      raise exception 'TRUNCATE encore accordé à authenticated sur %.', v_table;
    end if;

    -- La garde « née par sa fonction » est la DERNIÈRE de sa table.
    select count(*) into v_n
    from pg_trigger
    where tgrelid = ('public.' || v_table)::regclass
      and not tgisinternal
      and tgname > (v_table || '_zzz_born_by_function');
    if v_n > 0 or not exists (
      select 1 from pg_trigger
      where tgrelid = ('public.' || v_table)::regclass
        and tgname = v_table || '_zzz_born_by_function'
    ) then
      raise exception 'La garde « née par sa fonction » de % est absente ou n''est pas la dernière.', v_table;
    end if;
  end loop;

  -- B-8 : les deux unicités.
  if not exists (select 1 from pg_indexes where indexname = 'pos_sessions_one_open_per_register_idx')
     or not exists (select 1 from pg_indexes where indexname = 'pos_sessions_one_open_per_cashier_idx') then
    raise exception 'Une unicité de session ouverte (caisse ou utilisateur) est absente : B-8 n''est pas tenue en base.';
  end if;

  if not exists (select 1 from pg_indexes where indexname = 'pos_sessions_period_gist_idx'
                 and indexdef ilike '%gist%') then
    raise exception 'L''index GiST de période est absent.';
  end if;

  -- T-1 : aucun montant sur la session.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pos_sessions'
      and (column_name like '%amount%' or column_name like '%float%' or column_name like '%variance%'
        or column_name like '%expected%')
  ) then
    raise exception 'Un montant figure sur pos_sessions : pos.sessions.view l''ouvrirait (T-1).';
  end if;

  -- D1 : aucun écart ni théorique stocké.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pos_session_amounts'
      and (column_name like '%variance%' or column_name like '%expected%')
  ) then
    raise exception 'Un écart ou un théorique est stocké : D1 l''interdit.';
  end if;

  -- D4 : aucune fonction SECURITY DEFINER.
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and p.proname in ('fn_pos_register_guard', 'fn_pos_session_guard',
                      'fn_pos_session_amounts_guard', 'fn_pos_session_amounts_consistent',
                      'fn_pos_register_born_by_function', 'fn_pos_session_born_by_function',
                      'fn_audit_pos_session_row');
  if v_n > 0 then
    raise exception '% fonction(s) du point de vente sont SECURITY DEFINER (D4).', v_n;
  end if;

  -- Le journal : les acquis demeurent, les trois tables s'y ajoutent.
  foreach v_fn in array array[
    'supplier_vehicle_rates', 'rental_segment_costs', 'service_variant_costs',
    'sales_quotes', 'purchase_quotes', 'purchase_order_lines', 'customer_invoices',
    'maintenance_costs', 'numbering_rules'
  ] loop
    if public.audit_detail_permission(v_fn) is null then
      raise exception 'Le journal s''est refermé sur « % ».', v_fn;
    end if;
  end loop;

  if public.audit_detail_permission('pos_session_amounts') <> 'pos.sessions.amounts.view'
     or public.audit_detail_permission('pos_sessions') <> 'pos.sessions.view'
     or public.audit_detail_permission('pos_registers') <> 'pos.registers.view' then
    raise exception 'Le point de vente n''est pas correctement rattaché au journal.';
  end if;

  raise notice
    '[OK] 108. Caisses et sessions : 3 tables, RLS par ligne sur les montants, deux unicités ouvertes, nées par leurs fonctions.';
end $$;
