-- =============================================================================
-- ADIKOM PILOT — 004 · Journal d'audit
--
-- Objectif (05_Regles_Metier/06_Audit.md §1) : répondre à
--   Qui ? · Quoi ? · Quand ? · Sur quelle donnée ? · Avant ? · Après ? · Pourquoi ?
--
-- Règles appliquées :
--   §40/§77 — journal protégé contre modification, suppression, falsification ;
--   §78     — les actions du Super Admin sont également journalisées ;
--   §79/§80 — aucun mot de passe ni donnée sensible inutile dans le journal ;
--   §81.17  — une action refusée n'est jamais enregistrée comme réussie.
-- =============================================================================

create table public.audit_log (
  id             bigint generated always as identity primary key,
  occurred_at    timestamptz not null default now(),

  -- Auteur. ON DELETE SET NULL + libellé figé : l'historique reste lisible même
  -- si le compte est supprimé (§81.13 — un utilisateur désactivé doit rester
  -- identifiable dans l'historique).
  actor_id       uuid references public.app_users (id) on delete set null,
  actor_label    text,

  action         public.audit_action not null,
  result         public.audit_result not null default 'SUCCESS',

  -- Objet concerné (§7)
  module_code    text,
  entity_type    text not null,
  entity_id      text,
  entity_label   text,

  -- Avant / après (§9 et §10). Les champs sensibles sont retirés en amont.
  before_data    jsonb,
  after_data     jsonb,
  changed_fields text[],

  -- Contexte (§11 et §12)
  reason         text,
  comment        text,

  ip_address     inet,
  user_agent     text
);

comment on table public.audit_log is
  'Journal d''audit en écriture seule. Toute opération sensible y est tracée, Super Admin compris.';
comment on column public.audit_log.actor_label is
  'Nom de l''auteur figé au moment de l''action : l''historique reste lisible après désactivation.';
comment on column public.audit_log.result is
  'SUCCESS · FAILURE · DENIED. Une action refusée ne doit jamais apparaître comme réussie.';

create index audit_log_occurred_idx on public.audit_log (occurred_at desc);
create index audit_log_actor_idx    on public.audit_log (actor_id, occurred_at desc);
create index audit_log_entity_idx   on public.audit_log (entity_type, entity_id, occurred_at desc);
create index audit_log_module_idx   on public.audit_log (module_code, occurred_at desc);
create index audit_log_action_idx   on public.audit_log (action, occurred_at desc);


-- Écriture seule : aucune modification ni suppression, quel que soit le rôle
-- applicatif. Double barrière : triggers + absence de policy RLS UPDATE/DELETE.
create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.fn_forbid_mutation();

create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.fn_forbid_mutation();


-- --- Écriture applicative ---------------------------------------------------
-- SECURITY DEFINER : l'application journalise sans détenir de droit d'écriture
-- direct sur la table.

create or replace function public.log_audit(
  p_action         public.audit_action,
  p_entity_type    text,
  p_entity_id      text        default null,
  p_entity_label   text        default null,
  p_module_code    text        default null,
  p_before         jsonb       default null,
  p_after          jsonb       default null,
  p_reason         text        default null,
  p_comment        text        default null,
  p_result         public.audit_result default 'SUCCESS'
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := public.current_actor();
  v_label  text;
  v_fields text[];
  v_id     bigint;
begin
  select u.first_name || ' ' || u.last_name
    into v_label
  from public.app_users u
  where u.id = v_actor;

  -- Champs réellement modifiés, pour une lecture rapide du journal.
  if p_before is not null and p_after is not null then
    select array_agg(key order by key)
      into v_fields
    from jsonb_each(p_after) a(key, value)
    where p_before -> a.key is distinct from a.value;
  end if;

  insert into public.audit_log (
    actor_id, actor_label, action, result, module_code,
    entity_type, entity_id, entity_label,
    before_data, after_data, changed_fields, reason, comment
  )
  values (
    v_actor, v_label, p_action, p_result, p_module_code,
    p_entity_type, p_entity_id, p_entity_label,
    p_before, p_after, v_fields, p_reason, p_comment
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.log_audit is
  'Enregistre un événement d''audit applicatif (validation, annulation, refus, changement de droits).';


-- Enregistrement d'une connexion réussie.
--
-- SECURITY DEFINER pour une raison précise : la fiche utilisateur n'est
-- modifiable que par un administrateur autorisé. Un utilisateur ordinaire ne
-- doit pas pouvoir écrire dans sa propre fiche — ni son poste, ni son
-- responsable, ni son email, dont la divergence avec le compte
-- d'authentification romprait le lien.
--
-- Cette fonction met à jour la seule donnée qu'une connexion produit
-- légitimement, et journalise l'événement (05_Regles_Metier/06_Audit.md §25).
create or replace function public.record_login()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.current_actor();
  v_label text;
begin
  if v_actor is null then
    return;
  end if;

  update public.app_users
     set last_login_at = now()
   where id = v_actor
   returning first_name || ' ' || last_name into v_label;

  if not found then
    return;
  end if;

  insert into public.audit_log (
    actor_id, actor_label, action, result, module_code, entity_type, entity_id, entity_label
  )
  values (
    v_actor, v_label, 'LOGIN', 'SUCCESS', 'users', 'app_users', v_actor::text, v_label
  );
end;
$$;

comment on function public.record_login() is
  'Horodate la connexion de l''utilisateur courant et la journalise. Seule écriture autorisée sur sa propre fiche.';


-- --- Journalisation automatique des tables sensibles ------------------------

-- Champs à ne jamais recopier dans le journal (§79 et §80).
create or replace function public.fn_audit_redact(p_data jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_data
    - 'password' - 'encrypted_password' - 'password_hash'
    - 'token' - 'refresh_token' - 'access_token'
    - 'secret' - 'api_key';
$$;


create or replace function public.fn_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action  public.audit_action;
  v_before  jsonb;
  v_after   jsonb;
  v_id      text;
  -- Le premier argument du trigger porte le code du module d'origine.
  v_module  text := coalesce(tg_argv[0], null);
begin
  if tg_op = 'INSERT' then
    v_action := 'CREATE';
    v_after  := public.fn_audit_redact(to_jsonb(new));
    v_id     := (to_jsonb(new) ->> 'id');

  elsif tg_op = 'UPDATE' then
    v_before := public.fn_audit_redact(to_jsonb(old));
    v_after  := public.fn_audit_redact(to_jsonb(new));
    v_id     := (to_jsonb(new) ->> 'id');

    -- Rien de significatif n'a changé : ne pas polluer le journal.
    if v_before = v_after then
      return new;
    end if;

    -- Un changement de statut est qualifié comme tel (§34).
    if (to_jsonb(old) ? 'status')
       and (to_jsonb(old) ->> 'status') is distinct from (to_jsonb(new) ->> 'status')
    then
      v_action := 'STATUS_CHANGE';
    else
      v_action := 'UPDATE';
    end if;

  else
    v_action := 'DELETE';
    v_before := public.fn_audit_redact(to_jsonb(old));
    v_id     := (to_jsonb(old) ->> 'id');
  end if;

  perform public.log_audit(
    p_action      => v_action,
    p_entity_type => tg_table_name,
    p_entity_id   => v_id,
    p_module_code => v_module,
    p_before      => v_before,
    p_after       => v_after
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on function public.fn_audit_row() is
  'Trigger générique de journalisation. Argument 1 : code du module d''origine.';


-- Tables sensibles du socle. Les tables métier reçoivent le même trigger
-- au fur et à mesure de leur création.
create trigger app_users_audit
  after insert or update or delete on public.app_users
  for each row execute function public.fn_audit_row('users');

create trigger groups_audit
  after insert or update or delete on public.groups
  for each row execute function public.fn_audit_row('users');

create trigger user_groups_audit
  after insert or update or delete on public.user_groups
  for each row execute function public.fn_audit_row('users');

create trigger user_departments_audit
  after insert or update or delete on public.user_departments
  for each row execute function public.fn_audit_row('users');


-- Les changements de permissions sont qualifiés explicitement : ce sont les
-- événements les plus sensibles du système (§23 et §81.8).
create or replace function public.fn_audit_permission_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code   text;
  v_label  text;
  v_target text;
begin
  select p.code into v_code
  from public.permissions p
  where p.id = coalesce(new.permission_id, old.permission_id);

  if tg_table_name = 'user_permissions' then
    v_target := coalesce(new.user_id, old.user_id)::text;
    select u.first_name || ' ' || u.last_name into v_label
    from public.app_users u where u.id = coalesce(new.user_id, old.user_id);
  else
    v_target := coalesce(new.group_id, old.group_id)::text;
    select g.name into v_label
    from public.groups g where g.id = coalesce(new.group_id, old.group_id);
  end if;

  perform public.log_audit(
    p_action       => 'PERMISSION_CHANGE',
    p_entity_type  => tg_table_name,
    p_entity_id    => v_target,
    p_entity_label => v_label,
    p_module_code  => 'users',
    p_before       => case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    p_after        => case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    p_comment      => 'Permission : ' || coalesce(v_code, 'inconnue')
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger user_permissions_audit
  after insert or update or delete on public.user_permissions
  for each row execute function public.fn_audit_permission_change();

create trigger group_permissions_audit
  after insert or update or delete on public.group_permissions
  for each row execute function public.fn_audit_permission_change();
