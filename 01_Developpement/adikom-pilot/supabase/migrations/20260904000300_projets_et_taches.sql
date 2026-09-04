-- =============================================================================
-- ADIKOM PILOT — 058 · Projets & Tâches
-- Phase 4 — Organisation · LOT 12 (Module 03 — Projets & Planification)
--
-- CE QUE CETTE MIGRATION POSE
--
-- Le socle de coordination interne du Module 03 : un projet, ses participants,
-- ses tâches. « Une idée → un projet → des tâches → un responsable → une
-- échéance → un suivi » (§54).
--
-- Trois tables — `projects`, `project_members`, `project_tasks` — et QUATRE
-- capacités nouvelles, celles que le §42 nomme littéralement pour les tâches :
-- consulter, créer, modifier, clôturer. Catalogue : 153 → 157 (DEC-035 §a).
--
-- CE QU'ELLE NE FAIT PAS, ET CE N'EST PAS UN OUBLI
--
--   · AUCUNE RÉUNION, AUCUN RENDEZ-VOUS, AUCUNE DÉCISION, AUCUNE ACTION,
--     AUCUN CALENDRIER (§19 à §26). Ils forment le second volet du module et
--     relèvent du LOT 13 (DEC-035 §g). Leurs capacités ne sont donc pas créées :
--     une capacité sans fonctionnalité est une capacité d'office (DEC-024).
--   · AUCUNE SOUS-TÂCHE, AUCUNE DÉPENDANCE (§17, §18). §18 les renvoie
--     explicitement à « progressivement selon les besoins du MVP », et aucune
--     ne figure aux critères d'acceptation du §53. Les inventer supposerait
--     d'arrêter la règle de propagation d'un avancement — et un pourcentage
--     faux fait autorité plus longtemps qu'un pourcentage absent (DEC-034 §a).
--   · AUCUN COMMENTAIRE, AUCUN DOCUMENT (§29, §30). Un commentaire suppose sa
--     propre capacité ; il accompagnera le compte rendu de réunion, au LOT 13.
--   · AUCUN AVANCEMENT STOCKÉ. `projects_task_counts()` le REFAIT à chaque
--     lecture, sur les tâches réelles (§33, doctrine de DEC-032 §a).
--   · AUCUNE RÉFÉRENCE `PRJ-…`. Le module n'en demande aucune : un projet est
--     une coordination interne, pas une pièce remise à un tiers. Aucune règle
--     de numérotation n'est donc créée (DEC-035 §e).
--   · AUCUNE NOTIFICATION STOCKÉE. Les deux familles ajoutées à la veille sont
--     DÉRIVÉES, comme les onze autres (migration 056).
--
-- CE QU'ELLE RÉUTILISE, SANS LE REDÉFINIR
--
--   · `fn_set_updated_at`, `fn_audit_row`, `fn_forbid_delete`, `current_actor`,
--     `has_permission`, `require_capability`, `holds_capabilities` ;
--   · `notifications_watch()`, à laquelle deux familles sont ajoutées.
--
-- FUSEAU
--
-- « En retard » et « échéance proche » se lisent sur `Indian/Comoro`
-- (DEC-025 §e). Une échéance au 30 n'est pas dépassée le 30.
-- =============================================================================


-- =============================================================================
-- 1. TYPES — les statuts du module, tels qu'il les nomme
--
-- §7 et §12 les énumèrent. Ils sont repris À L'IDENTIQUE : le système ne crée
-- pas un second vocabulaire pour dire la même chose (CLAUDE.md §59).
-- =============================================================================

do $$ begin
  create type public.project_status as enum (
    'DRAFT',      -- Brouillon
    'UPCOMING',   -- À venir
    'ACTIVE',     -- En cours
    'ON_HOLD',    -- En pause
    'DONE',       -- Terminé
    'CANCELLED'   -- Annulé
  );
exception when duplicate_object then null; end $$;

-- §8 : « la priorité ne doit pas être utilisée pour transformer artificiellement
-- tous les projets en projets urgents ». La valeur par défaut est donc NORMAL,
-- jamais HIGH.
do $$ begin
  create type public.project_priority as enum (
    'LOW',       -- Faible
    'NORMAL',    -- Normale
    'HIGH',      -- Importante
    'URGENT'     -- Urgente
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.project_task_status as enum (
    'TODO',         -- À faire
    'IN_PROGRESS',  -- En cours
    'WAITING',      -- En attente
    'DONE',         -- Terminée
    'CANCELLED'     -- Annulée
  );
exception when duplicate_object then null; end $$;

-- §9 : « le système doit distinguer responsable, participant, observateur ».
-- Le RESPONSABLE n'est pas un rôle de cette table : il est porté par le projet
-- lui-même (`owner_id`). Deux emplacements pour la même personne feraient deux
-- vérités, dont l'une finirait par mentir.
do $$ begin
  create type public.project_member_role as enum (
    'PARTICIPANT',
    'OBSERVER'
  );
exception when duplicate_object then null; end $$;


-- =============================================================================
-- 2. PROJETS — §5, §6, §7, §8, §9, §28
-- =============================================================================

create table public.projects (
  id            uuid primary key default gen_random_uuid(),

  name          text not null,
  description   text,
  objective     text,

  -- §9 : un responsable principal. `on delete set null` : un compte supprimé ne
  -- doit pas emporter le projet (convention de `app_users`).
  owner_id      uuid references public.app_users (id) on delete set null,

  status        public.project_status   not null default 'DRAFT',
  priority      public.project_priority not null default 'NORMAL',

  -- §6 : date de début, date prévue de fin. Des JOURS civils, pas des instants :
  -- un projet ne commence pas à 08:30.
  starts_on     date,
  due_on        date,

  /*
   * §28 — LE TIERS CONCERNÉ, QUAND IL Y EN A UN.
   *
   * Trois références nullables plutôt qu'un couple (type, id) : la base garantit
   * alors elle-même que le tiers désigné existe. Une seule à la fois — un projet
   * ne se rattache pas simultanément à un client et à un fournisseur, et rien
   * dans le module ne le prévoit.
   *
   * Sans `parties.*.view`, RLS masque la ligne du tiers : l'écran affiche
   * « non lisible » et le projet reste lisible (doctrine de DEC-034 §d).
   */
  client_id     uuid references public.clients   (id) on delete restrict,
  supplier_id   uuid references public.suppliers (id) on delete restrict,
  partner_id    uuid references public.partners  (id) on delete restrict,

  status_reason     text,
  status_changed_at timestamptz,
  status_changed_by uuid references public.app_users (id) on delete set null,

  -- §48 : un projet terminé ne se supprime pas. Il se range.
  is_archived   boolean not null default false,
  archived_at   timestamptz,
  archived_by   uuid references public.app_users (id) on delete set null,

  created_at    timestamptz not null default now(),
  created_by    uuid references public.app_users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.app_users (id) on delete set null,

  constraint projects_name_not_blank check (btrim(name) <> ''),
  constraint projects_dates_coherent check (
    starts_on is null or due_on is null or due_on >= starts_on
  ),
  constraint projects_single_party check (
    (client_id is not null)::int
    + (supplier_id is not null)::int
    + (partner_id is not null)::int <= 1
  )
);

comment on table public.projects is
  'Projet interne d''ADIKOM (Module 03 §5). Couche d''organisation : ne duplique aucune donnée opérationnelle d''un autre module (§45).';
comment on column public.projects.owner_id is
  'Responsable principal du projet (§9). Les participants et observateurs vivent dans `project_members`.';
comment on column public.projects.is_archived is
  'Projet rangé (§48). Ses données restent consultables ; ses tâches cessent d''alimenter la veille.';

create index projects_status_idx   on public.projects (status) where not is_archived;
create index projects_owner_idx    on public.projects (owner_id) where not is_archived;
create index projects_due_idx      on public.projects (due_on) where not is_archived;
create index projects_client_idx   on public.projects (client_id)   where client_id   is not null;
create index projects_supplier_idx on public.projects (supplier_id) where supplier_id is not null;
create index projects_partner_idx  on public.projects (partner_id)  where partner_id  is not null;


-- =============================================================================
-- 3. PARTICIPANTS — §9, §44
--
-- Une personne peut porter plusieurs responsabilités (§44) : l'attribution
-- reste fondée sur l'UTILISATEUR réel, jamais sur un rôle ou un département.
-- =============================================================================

create table public.project_members (
  project_id  uuid not null references public.projects  (id) on delete cascade,
  user_id     uuid not null references public.app_users (id) on delete cascade,
  role        public.project_member_role not null default 'PARTICIPANT',

  created_at  timestamptz not null default now(),
  created_by  uuid references public.app_users (id) on delete set null,

  primary key (project_id, user_id)
);

comment on table public.project_members is
  'Participants et observateurs d''un projet (§9). Le responsable est `projects.owner_id`.';

create index project_members_user_idx on public.project_members (user_id);


-- =============================================================================
-- 4. TÂCHES — §10 à §16
--
-- §10 : une tâche peut être INDÉPENDANTE. `project_id` est donc nullable, et
-- ce n'est pas une facilité : « préparer les documents du fournisseur A » n'a
-- pas toujours de projet, et l'obliger à en avoir un en ferait inventer.
-- =============================================================================

create table public.project_tasks (
  id            uuid primary key default gen_random_uuid(),

  project_id    uuid references public.projects (id) on delete restrict,

  title         text not null,
  description   text,

  -- §13 : attribuée à un utilisateur autorisé, identifiable clairement.
  assignee_id   uuid references public.app_users (id) on delete set null,

  status        public.project_task_status not null default 'TODO',
  priority      public.project_priority    not null default 'NORMAL',

  starts_on     date,
  -- §14 : l'échéance est FACULTATIVE — « tâches sans échéance » est l'un des
  -- cinq cas que le système doit savoir distinguer.
  due_on        date,

  -- Le jour où elle a été déclarée terminée. Posé et retiré par le déclencheur :
  -- ce n'est pas une saisie, c'est un fait.
  completed_at  timestamptz,

  status_reason     text,
  status_changed_at timestamptz,
  status_changed_by uuid references public.app_users (id) on delete set null,

  created_at    timestamptz not null default now(),
  created_by    uuid references public.app_users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.app_users (id) on delete set null,

  constraint tasks_title_not_blank check (btrim(title) <> ''),
  constraint tasks_dates_coherent check (
    starts_on is null or due_on is null or due_on >= starts_on
  )
);

comment on table public.project_tasks is
  'Action concrète à effectuer (§10). Peut être indépendante de tout projet. Le RETARD n''est pas stocké : il se dérive de l''échéance et du jour (§16).';
comment on column public.project_tasks.completed_at is
  'Instant où la tâche a été déclarée terminée. Posé par le déclencheur, effacé à la réouverture.';

create index tasks_project_idx  on public.project_tasks (project_id) where project_id is not null;
create index tasks_assignee_idx on public.project_tasks (assignee_id, status);
create index tasks_due_idx      on public.project_tasks (due_on) where due_on is not null;
create index tasks_status_idx   on public.project_tasks (status);


-- =============================================================================
-- 5. TRANSITIONS — ce qui a un sens, imposé par la base
--
-- Même dispositif qu'au cycle d'exploitation (DEC-025 §k) et aux incidents
-- (migration 038) : une permission dit QUI peut agir, une transition dit CE QUI
-- a un sens. Un appel direct à l'API ne peut pas davantage produire un
-- enchaînement absurde.
--
-- ANNULÉ EST TERMINAL, TERMINÉ NE L'EST PAS.
--
-- Un projet abandonné ne reprend pas : on en ouvre un autre. Un projet ou une
-- tâche déclarés terminés à tort se REPRENNENT — et le journal d'audit conserve
-- les deux mouvements, si bien que rien ne devient indiscernable (DEC-035 §d).
-- =============================================================================

create or replace function public.fn_project_status_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_allowed public.project_status[];
begin
  if new.status = old.status then
    return new;
  end if;

  v_allowed := case old.status
    when 'DRAFT'     then array['UPCOMING','ACTIVE','CANCELLED']::public.project_status[]
    when 'UPCOMING'  then array['ACTIVE','ON_HOLD','CANCELLED']::public.project_status[]
    when 'ACTIVE'    then array['ON_HOLD','DONE','CANCELLED']::public.project_status[]
    when 'ON_HOLD'   then array['ACTIVE','DONE','CANCELLED']::public.project_status[]
    -- Reprise d'un projet clos par erreur.
    when 'DONE'      then array['ACTIVE']::public.project_status[]
    else array[]::public.project_status[]
  end;

  if not (new.status = any(v_allowed)) then
    raise exception
      'Transition de projet refusée : % ne peut pas devenir %.', old.status, new.status
      using errcode = 'check_violation';
  end if;

  new.status_changed_at := now();
  new.status_changed_by := coalesce(public.current_actor(), new.status_changed_by);

  return new;
end;
$$;

comment on function public.fn_project_status_transition is
  'Impose les enchaînements de statut du §7. Annulé est terminal ; terminé peut être repris.';


create or replace function public.fn_task_status_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_allowed public.project_task_status[];
begin
  if new.status = old.status then
    return new;
  end if;

  v_allowed := case old.status
    when 'TODO'        then array['IN_PROGRESS','WAITING','DONE','CANCELLED']::public.project_task_status[]
    when 'IN_PROGRESS' then array['TODO','WAITING','DONE','CANCELLED']::public.project_task_status[]
    when 'WAITING'     then array['TODO','IN_PROGRESS','DONE','CANCELLED']::public.project_task_status[]
    -- Réouverture : une tâche jugée faite, puis constatée incomplète.
    when 'DONE'        then array['TODO','IN_PROGRESS']::public.project_task_status[]
    else array[]::public.project_task_status[]
  end;

  if not (new.status = any(v_allowed)) then
    raise exception
      'Transition de tâche refusée : % ne peut pas devenir %.', old.status, new.status
      using errcode = 'check_violation';
  end if;

  new.status_changed_at := now();
  new.status_changed_by := coalesce(public.current_actor(), new.status_changed_by);

  -- Le fait, jamais la saisie : terminée aujourd'hui, plus terminée demain.
  if new.status = 'DONE' then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;

  return new;
end;
$$;

comment on function public.fn_task_status_transition is
  'Impose les enchaînements du §12 et pose `completed_at`. Annulée est terminale ; terminée peut être rouverte.';


-- =============================================================================
-- 6. CAPACITÉS EXACTES — ce que la policy seule ne peut pas distinguer
--
-- Une policy d'UPDATE dit qui peut écrire dans la table ; elle ne sait pas
-- distinguer ARCHIVER de MODIFIER, ni CLÔTURER de MODIFIER. Sans ces
-- déclencheurs, `projects.archive` et `projects.tasks.close` seraient IMPLIQUÉES
-- par `.update` — exactement ce que DEC-024 interdit, et exactement le défaut
-- que la migration 040 a corrigé pour la maintenance.
--
-- La barrière est ici au niveau du DÉCLENCHEUR, et non d'une fonction : ces
-- tables se modifient directement par PostgREST, et une garde placée dans une
-- fonction ne se trouve pas sur ce chemin-là.
-- =============================================================================

create or replace function public.fn_project_write_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_before jsonb;
  v_after  jsonb;
begin
  -- Migration, script d'environnement, clé de service (convention de la 021).
  if public.current_actor() is null then
    return new;
  end if;

  if new.is_archived is distinct from old.is_archived then
    perform public.require_capability(
      array['projects.archive'],
      case when new.is_archived then 'archiver un projet' else 'restaurer un projet' end
    );

    new.archived_at := case when new.is_archived then now() end;
    new.archived_by := case when new.is_archived then public.current_actor() end;
  end if;

  -- Tout le reste — nom, responsable, statut, échéance, tiers — relève de la
  -- modification. Les colonnes de l'archivage et les colonnes techniques sont
  -- écartées de la comparaison : sans cela, archiver exigerait aussi `.update`.
  v_before := to_jsonb(old) - 'is_archived' - 'archived_at' - 'archived_by'
              - 'updated_at' - 'updated_by' - 'status_changed_at' - 'status_changed_by';
  v_after  := to_jsonb(new) - 'is_archived' - 'archived_at' - 'archived_by'
              - 'updated_at' - 'updated_by' - 'status_changed_at' - 'status_changed_by';

  if v_before is distinct from v_after then
    perform public.require_capability(array['projects.update'], 'modifier un projet');
  end if;

  return new;
end;
$$;

comment on function public.fn_project_write_guard is
  'Archiver n''est pas modifier (DEC-024) : chaque acte exige SA capacité, y compris en appel direct.';


create or replace function public.fn_task_write_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_before jsonb;
  v_after  jsonb;
begin
  if public.current_actor() is null then
    return new;
  end if;

  if new.status is distinct from old.status then
    /*
     * §42 nomme « clôturer une tâche » à côté de « modifier une tâche ». Déclarer
     * un travail fait n'est pas le décrire autrement : c'est ce qui fait avancer
     * le pourcentage du projet et fait taire la veille.
     */
    if new.status = 'DONE' then
      perform public.require_capability(array['projects.tasks.close'], 'clôturer une tâche');
    else
      perform public.require_capability(
        array['projects.tasks.update'], 'changer l''état d''une tâche'
      );
    end if;
  end if;

  -- Le motif accompagne le changement d'état ; il n'est donc pas compté comme
  -- une modification distincte. Tout le reste — titre, responsable, échéance —
  -- exige `.update`, y compris dans le même ordre SQL qu'une clôture.
  v_before := to_jsonb(old) - 'status' - 'status_reason' - 'status_changed_at'
              - 'status_changed_by' - 'completed_at' - 'updated_at' - 'updated_by';
  v_after  := to_jsonb(new) - 'status' - 'status_reason' - 'status_changed_at'
              - 'status_changed_by' - 'completed_at' - 'updated_at' - 'updated_by';

  if v_before is distinct from v_after then
    perform public.require_capability(array['projects.tasks.update'], 'modifier une tâche');
  end if;

  return new;
end;
$$;

comment on function public.fn_task_write_guard is
  'Clôturer n''est pas modifier (DEC-024, §42) : `projects.tasks.close` est exigée pour l''état « Terminée », y compris en appel direct.';


-- Cohérence : on ne range pas une tâche dans un projet rangé.
--
-- Un projet archivé est mis de côté (§48). Y ajouter une tâche, ou y déplacer
-- une tâche existante, produirait un travail que plus aucun écran de suivi ne
-- montre — et que la veille ne rappellerait pas.
create or replace function public.fn_task_project_coherence()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_archived boolean;
begin
  if new.project_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.project_id is not distinct from old.project_id then
    return new;
  end if;

  select p.is_archived into v_archived
  from public.projects p
  where p.id = new.project_id;

  -- Introuvable ici signifie « non lisible » : la clé étrangère garantit
  -- l'existence, RLS peut masquer la ligne. Aucune conclusion n'en est tirée.
  if v_archived then
    raise exception 'Opération refusée : ce projet est archivé.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_task_project_coherence is
  'Refuse de rattacher une tâche à un projet archivé (§48).';


-- --- Déclencheurs -----------------------------------------------------------

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.fn_set_updated_at();

create trigger projects_transition
  before update on public.projects
  for each row execute function public.fn_project_status_transition();

create trigger projects_write_guard
  before update on public.projects
  for each row execute function public.fn_project_write_guard();

create trigger projects_audit
  after insert or update on public.projects
  for each row execute function public.fn_audit_row('projects');

create trigger projects_no_delete
  before delete on public.projects
  for each row execute function public.fn_forbid_delete();


-- `project_members` reçoit l'audit y compris en suppression : retirer un
-- participant est un fait, et le journal en conserve la trace. La table n'est
-- pas protégée par `fn_forbid_delete` — une association légère se défait, elle
-- ne s'archive pas (même traitement que `user_permissions`).
create trigger project_members_audit
  after insert or update or delete on public.project_members
  for each row execute function public.fn_audit_row('projects');


create trigger tasks_updated_at
  before update on public.project_tasks
  for each row execute function public.fn_set_updated_at();

create trigger tasks_transition
  before update on public.project_tasks
  for each row execute function public.fn_task_status_transition();

create trigger tasks_write_guard
  before update on public.project_tasks
  for each row execute function public.fn_task_write_guard();

create trigger tasks_project_coherence
  before insert or update on public.project_tasks
  for each row execute function public.fn_task_project_coherence();

create trigger tasks_audit
  after insert or update on public.project_tasks
  for each row execute function public.fn_audit_row('projects');

create trigger tasks_no_delete
  before delete on public.project_tasks
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- 7. AVANCEMENT — §32, §33 · refait à la lecture, jamais recopié
--
-- « 10 tâches au total, 6 terminées → 60 % ». Le pourcentage n'est écrit nulle
-- part : le tenir à jour supposerait un déclencheur sur chaque création, chaque
-- clôture, chaque annulation — et le premier oubli produirait un avancement
-- faux, qui ferait autorité plus longtemps qu'un avancement absent (DEC-034 §a).
--
-- LES TÂCHES ANNULÉES NE COMPTENT NI AU NUMÉRATEUR NI AU DÉNOMINATEUR.
--
-- Une tâche annulée n'est pas un travail restant : la compter ferait plafonner
-- l'avancement d'un projet dont plus rien n'est à faire. §33 met en garde contre
-- « un pourcentage trompeur » — c'en serait un.
--
-- UNE SYNTHÈSE SANS SA LECTURE SE TAIT.
--
-- La fonction EXIGE `projects.tasks.view` (DEC-034 §c) : sans elle, RLS rendrait
-- zéro tâche, et l'avancement se lirait « 0 % » — c'est-à-dire « rien n'est
-- fait », là où la vérité est « je n'ai pas le droit de compter ». L'écran, lui,
-- nomme la capacité manquante (DEC-017).
-- =============================================================================

create or replace function public.projects_task_counts(p_project_id uuid default null)
returns table (
  project_id uuid,
  total      integer,   -- tâches non annulées
  done       integer,
  late       integer,
  percent    integer    -- NULL lorsqu'il n'y a aucune tâche à compter
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Indian/Comoro')::date;
begin
  perform public.require_capability(array['projects.tasks.view'], 'consulter les tâches');

  return query
  select
    t.project_id,
    count(*) filter (where t.status <> 'CANCELLED')::integer,
    count(*) filter (where t.status = 'DONE')::integer,
    count(*) filter (
      where t.status not in ('DONE', 'CANCELLED')
        and t.due_on is not null
        and t.due_on < v_today
    )::integer,
    case
      when count(*) filter (where t.status <> 'CANCELLED') = 0 then null
      else round(
        100.0 * count(*) filter (where t.status = 'DONE')
        / count(*) filter (where t.status <> 'CANCELLED')
      )::integer
    end
  from public.project_tasks t
  where t.project_id is not null
    and (p_project_id is null or t.project_id = p_project_id)
  group by t.project_id;
end;
$$;

comment on function public.projects_task_counts(uuid) is
  'Avancement et retards d''un projet, refaits sur les tâches réelles (§33). Exige `projects.tasks.view` : une somme muette est refusée, jamais approchée.';


-- =============================================================================
-- 8. LA VEILLE APPREND DEUX SITUATIONS — Module 03 §38, Module 02 §4
--
-- §38 : « échéance proche », « tâche en retard ». Ce sont des SITUATIONS, donc
-- dérivables — contrairement à « tâche attribuée », qui est un ÉVÉNEMENT de
-- création et relève de l'arbitrage ouvert par DEC-033 §h.
--
-- NIVEAUX — pris dans le Module 02, jamais choisis.
--
--   échéance proche  → Rappel      (§4.2, comme « départ prévu demain »)
--   tâche en retard  → À surveiller (§4.3, « situation qui mérite une
--                                    vérification »). Rien ne fixe de seuil
--                                    au-delà duquel un retard devient
--                                    « important » : le niveau le plus BAS des
--                                    deux lectures est retenu, comme pour les
--                                    factures échues (DEC-033).
--
-- AUDIENCE — la capacité de lecture, comme les onze autres familles. Une
-- diffusion nominative au seul responsable de la tâche (§23 du Module 02) reste
-- l'arbitrage ouvert de DEC-033 §h : elle suppose de désigner les destinataires.
--
-- LES TÂCHES D'UN PROJET ARCHIVÉ NE DISENT RIEN. Ranger un projet, c'est cesser
-- de le suivre (§48) ; continuer à en rappeler les échéances ferait du bruit sur
-- ce qu'ADIKOM a délibérément mis de côté.
-- =============================================================================

create or replace function public.notifications_watch()
returns table (
  key         text,
  kind        text,
  level       text,
  source      text,
  subject     text,
  detail      text,
  object_type text,
  object_id   uuid,
  occurred_at timestamptz,
  due_on      date,
  amount      bigint
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_now      timestamptz := now();
  v_today    date := (now() at time zone 'Indian/Comoro')::date;
  v_tomorrow date := (now() at time zone 'Indian/Comoro')::date + 1;
  v_maintenance_horizon date := (now() at time zone 'Indian/Comoro')::date + 7;
  v_document_horizon    date := (now() at time zone 'Indian/Comoro')::date + 30;
begin
  perform public.require_capability(
    array['notifications.view'], 'consulter ses notifications'
  );

  /* ----------------------------------------------------------------------- */
  /*  §8 — DÉPART PRÉVU · Rappel                                             */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(array['rental.reservations.view']) then
    return query
    select
      'reservation.departure:' || r.id::text,
      'RESERVATION_DEPARTURE'::text,
      'REMINDER'::text,
      'rental'::text,
      r.reservation_no,
      nullif(
        concat_ws(
          ' · ',
          public.notification_vehicle_label(v.brand, v.model, v.plate),
          c.legal_name
        ),
        ''
      ),
      'reservation'::text,
      r.id,
      lower(r.period),
      (lower(r.period) at time zone 'Indian/Comoro')::date,
      null::bigint
    from public.reservations r
    left join public.vehicles v on v.id = r.vehicle_id
    left join public.clients  c on c.id = r.client_id
    where r.status in ('CONFIRMED', 'PREPARING')
      and (lower(r.period) at time zone 'Indian/Comoro')::date
          between v_today and v_tomorrow;
  end if;

  /* ----------------------------------------------------------------------- */
  /*  §9 — RETOUR PRÉVU · Rappel                                             */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(array['rental.rentals.view']) then
    return query
    select
      'rental.return.due:' || l.id::text,
      'RENTAL_RETURN_DUE'::text,
      'REMINDER'::text,
      'rental'::text,
      l.rental_no,
      nullif(
        concat_ws(
          ' · ',
          public.notification_vehicle_label(v.brand, v.model, v.plate),
          c.legal_name
        ),
        ''
      ),
      'rental'::text,
      l.id,
      l.expected_return_at,
      (l.expected_return_at at time zone 'Indian/Comoro')::date,
      null::bigint
    from public.rentals l
    left join public.vehicles v on v.id = l.vehicle_id
    left join public.clients  c on c.id = l.client_id
    where l.status in ('IN_PROGRESS', 'EXTENDED')
      and l.expected_return_at >= v_now
      and (l.expected_return_at at time zone 'Indian/Comoro')::date
          between v_today and v_tomorrow;

    /* ------------------------------------------------------------------- */
    /*  §4.4 et §9 — RETOUR NON ENREGISTRÉ · Important                     */
    /* ------------------------------------------------------------------- */

    return query
    select
      'rental.return.late:' || l.id::text,
      'RENTAL_RETURN_LATE'::text,
      'IMPORTANT'::text,
      'rental'::text,
      l.rental_no,
      nullif(
        concat_ws(
          ' · ',
          public.notification_vehicle_label(v.brand, v.model, v.plate),
          c.legal_name
        ),
        ''
      ),
      'rental'::text,
      l.id,
      l.expected_return_at,
      (l.expected_return_at at time zone 'Indian/Comoro')::date,
      null::bigint
    from public.rentals l
    left join public.vehicles v on v.id = l.vehicle_id
    left join public.clients  c on c.id = l.client_id
    where l.status in ('IN_PROGRESS', 'EXTENDED', 'LATE')
      and l.expected_return_at < v_now;

    /* ------------------------------------------------------------------- */
    /*  §9 — CONTRÔLE DE RETOUR À EFFECTUER · Attention                    */
    /* ------------------------------------------------------------------- */

    return query
    select
      'rental.control:' || l.id::text,
      'RENTAL_TO_CONTROL'::text,
      'ATTENTION'::text,
      'rental'::text,
      l.rental_no,
      nullif(
        concat_ws(
          ' · ',
          public.notification_vehicle_label(v.brand, v.model, v.plate),
          c.legal_name
        ),
        ''
      ),
      'rental'::text,
      l.id,
      l.returned_at,
      (l.returned_at at time zone 'Indian/Comoro')::date,
      null::bigint
    from public.rentals l
    left join public.vehicles v on v.id = l.vehicle_id
    left join public.clients  c on c.id = l.client_id
    where l.status = 'TO_CONTROL';
  end if;

  /* ----------------------------------------------------------------------- */
  /*  §11 et §28 — MAINTENANCE PRÉVUE · Rappel                               */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(array['rental.maintenance.view']) then
    return query
    select
      'maintenance.planned:' || m.id::text,
      'MAINTENANCE_PLANNED'::text,
      'REMINDER'::text,
      'rental'::text,
      m.maintenance_no,
      nullif(
        concat_ws(
          ' · ',
          public.notification_vehicle_label(v.brand, v.model, v.plate),
          m.reason
        ),
        ''
      ),
      'maintenance'::text,
      m.id,
      m.planned_at,
      (m.planned_at at time zone 'Indian/Comoro')::date,
      null::bigint
    from public.vehicle_maintenances m
    left join public.vehicles v on v.id = m.vehicle_id
    where m.status = 'PLANNED'
      and m.planned_at is not null
      and m.planned_at >= v_now
      and (m.planned_at at time zone 'Indian/Comoro')::date <= v_maintenance_horizon;

    /* ------------------------------------------------------------------- */
    /*  §6 et §11 — MAINTENANCE EN RETARD · Attention                      */
    /* ------------------------------------------------------------------- */

    return query
    select
      'maintenance.late:' || m.id::text,
      'MAINTENANCE_LATE'::text,
      'ATTENTION'::text,
      'rental'::text,
      m.maintenance_no,
      nullif(
        concat_ws(
          ' · ',
          public.notification_vehicle_label(v.brand, v.model, v.plate),
          m.reason
        ),
        ''
      ),
      'maintenance'::text,
      m.id,
      m.planned_at,
      (m.planned_at at time zone 'Indian/Comoro')::date,
      null::bigint
    from public.vehicle_maintenances m
    left join public.vehicles v on v.id = m.vehicle_id
    where m.status = 'PLANNED'
      and m.planned_at is not null
      and m.planned_at < v_now;
  end if;

  /* ----------------------------------------------------------------------- */
  /*  §4.4 et §10 — VÉHICULE IMMOBILISÉ · Important                          */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(array['rental.fleet.view']) then
    return query
    select
      'vehicle.immobilized:' || v.id::text,
      'VEHICLE_IMMOBILIZED'::text,
      'IMPORTANT'::text,
      'rental'::text,
      coalesce(public.notification_vehicle_label(v.brand, v.model, v.plate), v.vehicle_no),
      nullif(concat_ws(' · ', v.vehicle_no, v.status_reason), ''),
      'vehicle'::text,
      v.id,
      coalesce(v.status_changed_at, v.updated_at),
      null::date,
      null::bigint
    from public.vehicles v
    where v.status = 'IMMOBILIZED'
      and not exists (
        select 1
        from public.rentals l
        where l.vehicle_id = v.id
          and l.status in ('IN_PROGRESS', 'EXTENDED')
      );
  end if;

  /* ----------------------------------------------------------------------- */
  /*  §4.5 — VÉHICULE IMMOBILISÉ PENDANT UNE LOCATION · Urgent               */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(array['rental.fleet.view', 'rental.rentals.view']) then
    return query
    select
      'rental.vehicle.immobilized:' || l.id::text,
      'RENTAL_VEHICLE_IMMOBILIZED'::text,
      'URGENT'::text,
      'rental'::text,
      l.rental_no,
      nullif(
        concat_ws(
          ' · ',
          public.notification_vehicle_label(v.brand, v.model, v.plate),
          c.legal_name,
          v.status_reason
        ),
        ''
      ),
      'rental'::text,
      l.id,
      coalesce(v.status_changed_at, l.started_at, l.created_at),
      null::date,
      null::bigint
    from public.rentals l
    join public.vehicles v on v.id = l.vehicle_id
    left join public.clients c on c.id = l.client_id
    where l.status in ('IN_PROGRESS', 'EXTENDED')
      and v.status = 'IMMOBILIZED';
  end if;

  /* ----------------------------------------------------------------------- */
  /*  §4.5 et §6 — INCIDENT SUR UN VÉHICULE EN LOCATION                      */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(array['rental.incidents.view', 'rental.rentals.view']) then
    return query
    select
      'incident.rental:' || i.id::text,
      'INCIDENT_ON_RENTAL'::text,
      case
        when exists (
          select 1
          from public.incident_damages d
          where d.incident_id = i.id
            and d.severity = 'MAJOR'
        ) then 'URGENT'
        else 'ATTENTION'
      end::text,
      'rental'::text,
      i.incident_no,
      nullif(
        concat_ws(
          ' · ',
          public.notification_vehicle_label(v.brand, v.model, v.plate),
          l.rental_no,
          i.description
        ),
        ''
      ),
      'incident'::text,
      i.id,
      i.occurred_at,
      null::date,
      null::bigint
    from public.vehicle_incidents i
    join public.rentals l on l.id = i.rental_id
    left join public.vehicles v on v.id = i.vehicle_id
    where i.status in ('OPEN', 'IN_PROGRESS')
      and l.status in ('IN_PROGRESS', 'EXTENDED');
  end if;

  /* ----------------------------------------------------------------------- */
  /*  §4.3, §10 et §28 — ÉCHÉANCE DOCUMENTAIRE                               */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(array['rental.documents.view'])
     or public.holds_capabilities(array['rental.fleet.view'])
  then
    return query
    select
      'vehicle.document.expiring:' || d.id::text,
      'VEHICLE_DOCUMENT_EXPIRING'::text,
      'ATTENTION'::text,
      'rental'::text,
      d.label,
      nullif(
        concat_ws(
          ' · ',
          public.notification_vehicle_label(v.brand, v.model, v.plate),
          d.reference
        ),
        ''
      ),
      'vehicle'::text,
      d.vehicle_id,
      (d.expires_on::timestamp at time zone 'Indian/Comoro'),
      d.expires_on,
      null::bigint
    from public.vehicle_documents d
    left join public.vehicles v on v.id = d.vehicle_id
    where d.is_archived = false
      and d.expires_on is not null
      and d.expires_on >= v_today
      and d.expires_on <= v_document_horizon;

    return query
    select
      'vehicle.document.expired:' || d.id::text,
      'VEHICLE_DOCUMENT_EXPIRED'::text,
      'IMPORTANT'::text,
      'rental'::text,
      d.label,
      nullif(
        concat_ws(
          ' · ',
          public.notification_vehicle_label(v.brand, v.model, v.plate),
          d.reference
        ),
        ''
      ),
      'vehicle'::text,
      d.vehicle_id,
      (d.expires_on::timestamp at time zone 'Indian/Comoro'),
      d.expires_on,
      null::bigint
    from public.vehicle_documents d
    left join public.vehicles v on v.id = d.vehicle_id
    where d.is_archived = false
      and d.expires_on is not null
      and d.expires_on < v_today;
  end if;

  /* ----------------------------------------------------------------------- */
  /*  §12 — FACTURE CLIENT ÉCHUE NON SOLDÉE · Attention                      */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(
       array['billing.customer_invoices.view', 'billing.customer_payments.view']
     )
  then
    return query
    select
      'customer_invoice.overdue:' || f.id::text,
      'CUSTOMER_INVOICE_OVERDUE'::text,
      'ATTENTION'::text,
      'billing'::text,
      f.invoice_no,
      nullif(concat_ws(' · ', c.legal_name), ''),
      'customer_invoice'::text,
      f.id,
      (f.due_date::timestamp at time zone 'Indian/Comoro'),
      f.due_date,
      public.customer_invoice_total(f.id) - public.customer_invoice_paid(f.id)
    from public.customer_invoices f
    left join public.clients c on c.id = f.client_id
    where f.status = 'ISSUED'
      and f.due_date is not null
      and f.due_date < v_today
      and public.customer_invoice_total(f.id) - public.customer_invoice_paid(f.id) > 0;
  end if;

  /* ----------------------------------------------------------------------- */
  /*  §12 et §13 — FACTURE FOURNISSEUR ÉCHUE · Attention                     */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(
       array[
         'billing.supplier_invoices.view',
         'billing.imputations.view',
         'billing.supplier_payments.view'
       ]
     )
  then
    return query
    select
      'supplier_invoice.overdue:' || f.id::text,
      'SUPPLIER_INVOICE_OVERDUE'::text,
      'ATTENTION'::text,
      'billing'::text,
      f.invoice_no,
      nullif(concat_ws(' · ', s.legal_name, f.external_ref), ''),
      'supplier_invoice'::text,
      f.id,
      (f.due_date::timestamp at time zone 'Indian/Comoro'),
      f.due_date,
      public.supplier_invoice_gross(f.id)
        - public.supplier_invoice_imputed(f.id)
        - public.supplier_invoice_paid(f.id)
    from public.supplier_invoices f
    left join public.suppliers s on s.id = f.supplier_id
    where f.status = 'VALIDATED'
      and f.due_date is not null
      and f.due_date < v_today
      and public.supplier_invoice_gross(f.id)
          - public.supplier_invoice_imputed(f.id)
          - public.supplier_invoice_paid(f.id) > 0;
  end if;

  /* ----------------------------------------------------------------------- */
  /*  Module 03 §15 et §38 — ÉCHÉANCE DE TÂCHE PROCHE · Rappel               */
  /*                                                                         */
  /*  Aujourd'hui ou demain, en jours CIVILS : « cette tâche arrive à         */
  /*  échéance demain » (§15). Le projet et le responsable arrivent par       */
  /*  jointure EXTERNE — sans `projects.view` ni `users.users.view`, la       */
  /*  tâche reste lisible sans eux, elle ne disparaît pas.                   */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(array['projects.tasks.view']) then
    return query
    select
      'task.due:' || t.id::text,
      'TASK_DUE'::text,
      'REMINDER'::text,
      'projects'::text,
      t.title,
      nullif(
        concat_ws(' · ', p.name, btrim(u.first_name || ' ' || u.last_name)),
        ''
      ),
      'task'::text,
      t.id,
      (t.due_on::timestamp at time zone 'Indian/Comoro'),
      t.due_on,
      null::bigint
    from public.project_tasks t
    left join public.projects  p on p.id = t.project_id
    left join public.app_users u on u.id = t.assignee_id
    where t.status in ('TODO', 'IN_PROGRESS', 'WAITING')
      and t.due_on is not null
      and t.due_on between v_today and v_tomorrow
      and not exists (
        select 1 from public.projects a
        where a.id = t.project_id and a.is_archived
      );

    /* ------------------------------------------------------------------- */
    /*  Module 03 §16 — TÂCHE EN RETARD · À surveiller                     */
    /*                                                                     */
    /*  « Échéance dépassée et tâche non terminée » : dérivé du jour, comme */
    /*  tous les retards du système (DEC-025 §a). Aucun statut « En retard » */
    /*  n'est écrit — il serait faux le lendemain de sa clôture.           */
    /* ------------------------------------------------------------------- */

    return query
    select
      'task.late:' || t.id::text,
      'TASK_LATE'::text,
      'ATTENTION'::text,
      'projects'::text,
      t.title,
      nullif(
        concat_ws(' · ', p.name, btrim(u.first_name || ' ' || u.last_name)),
        ''
      ),
      'task'::text,
      t.id,
      (t.due_on::timestamp at time zone 'Indian/Comoro'),
      t.due_on,
      null::bigint
    from public.project_tasks t
    left join public.projects  p on p.id = t.project_id
    left join public.app_users u on u.id = t.assignee_id
    where t.status in ('TODO', 'IN_PROGRESS', 'WAITING')
      and t.due_on is not null
      and t.due_on < v_today
      and not exists (
        select 1 from public.projects a
        where a.id = t.project_id and a.is_archived
      );
  end if;
end;
$$;

comment on function public.notifications_watch() is
  'La veille : les situations réelles du système qui appellent une information ou un geste (Module 02 §4 à §13, Module 03 §38). Aucune notification n''est stockée ; chaque famille exige ses lectures et se tait sinon (§22).';


-- =============================================================================
-- 9. SÉCURITÉ AU NIVEAU DES DONNÉES — deuxième barrière de DEC-011
--
-- La visibilité suit la CAPACITÉ, non l'appartenance au projet : c'est le modèle
-- de tout le SaaS, et §51 — « un utilisateur ne doit pas pouvoir consulter un
-- projet auquel il n'a pas accès » — s'y lit sans ambiguïté dès lors qu'aucune
-- confidentialité par projet n'est documentée. Une telle confidentialité serait
-- une règle métier nouvelle : elle est signalée, non inventée (DEC-035 §c).
--
-- Les policies d'écriture acceptent l'une OU l'autre capacité, et les
-- déclencheurs de la §6 exigent ensuite celle de l'acte demandé.
-- =============================================================================

revoke all on public.projects        from anon;
revoke all on public.project_members from anon;
revoke all on public.project_tasks   from anon;

revoke delete on public.projects      from authenticated;
revoke delete on public.project_tasks from authenticated;

alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.project_tasks   enable row level security;

-- --- Projets
create policy projects_select on public.projects
  for select to authenticated
  using (public.has_permission('projects.view'));

create policy projects_insert on public.projects
  for insert to authenticated
  with check (public.has_permission('projects.create'));

create policy projects_update on public.projects
  for update to authenticated
  using (
    public.has_permission('projects.update')
    or public.has_permission('projects.archive')
  )
  with check (
    public.has_permission('projects.update')
    or public.has_permission('projects.archive')
  );

-- --- Participants
--
-- Composer une équipe, c'est modifier le projet : la même capacité gouverne les
-- trois écritures. `projects.create` y est jointe pour l'insertion, afin que le
-- responsable puisse désigner les participants au moment même de la création.
create policy project_members_select on public.project_members
  for select to authenticated
  using (public.has_permission('projects.view'));

create policy project_members_insert on public.project_members
  for insert to authenticated
  with check (
    public.has_permission('projects.update')
    or public.has_permission('projects.create')
  );

create policy project_members_update on public.project_members
  for update to authenticated
  using (public.has_permission('projects.update'))
  with check (public.has_permission('projects.update'));

create policy project_members_delete on public.project_members
  for delete to authenticated
  using (public.has_permission('projects.update'));

-- --- Tâches
create policy project_tasks_select on public.project_tasks
  for select to authenticated
  using (public.has_permission('projects.tasks.view'));

create policy project_tasks_insert on public.project_tasks
  for insert to authenticated
  with check (public.has_permission('projects.tasks.create'));

create policy project_tasks_update on public.project_tasks
  for update to authenticated
  using (
    public.has_permission('projects.tasks.update')
    or public.has_permission('projects.tasks.close')
  )
  with check (
    public.has_permission('projects.tasks.update')
    or public.has_permission('projects.tasks.close')
  );


-- --- Exécution : rien pour PUBLIC (DEC-022) ---------------------------------

revoke execute on function public.projects_task_counts(uuid) from public;
grant  execute on function public.projects_task_counts(uuid) to authenticated, service_role;

revoke execute on function public.fn_project_status_transition() from public;
revoke execute on function public.fn_task_status_transition()    from public;
revoke execute on function public.fn_project_write_guard()       from public;
revoke execute on function public.fn_task_write_guard()          from public;
revoke execute on function public.fn_task_project_coherence()    from public;


-- =============================================================================
-- 10. LE CATALOGUE — quatre capacités, celles que le §42 nomme
--
-- « consulter les tâches ; créer une tâche ; modifier une tâche ; clôturer une
-- tâche ». Elles ne sont pas déduites d'un modèle général : elles sont écrites
-- dans le module, et aucune n'existait au catalogue — les tâches n'étaient
-- couvertes par rien.
--
-- CE QUI N'EST PAS CRÉÉ, ET POURQUOI (DEC-024 — ne pas surcharger le catalogue)
--
--   · `projects.tasks.assign` — attribuer une tâche, c'est la créer ou la
--     modifier. §42 ne la nomme pas, et l'écran n'offre pas d'acte séparé.
--   · `projects.tasks.archive` — une tâche s'annule (§12), elle ne s'archive pas.
--   · `projects.export`, `.download`, `.print` — aucun état, aucun document
--     n'est produit par ce lot. Une capacité sans fonctionnalité est une
--     capacité d'office.
--   · `projects.meetings.*`, `projects.decisions.*` — le LOT 13 les proposera
--     avec les écrans correspondants.
--
-- Catalogue : 153 → 157.
-- =============================================================================

-- La liste de colonnes commence par `(code, module_code` : c'est la forme que le
-- contrôle de parité TS/SQL (`permissions.test.ts`) reconnaît pour rejouer le
-- catalogue sans interpréter du SQL.
with nouvelles (code, module_code, menu_code, menu_label, action, label, rang) as (values
  ('projects.tasks.view',   'projects', 'tasks', 'Tâches', 'VIEW',     'Consulter les tâches', 1),
  ('projects.tasks.create', 'projects', 'tasks', 'Tâches', 'CREATE',   'Créer une tâche',      2),
  ('projects.tasks.update', 'projects', 'tasks', 'Tâches', 'UPDATE',   'Modifier une tâche',   3),
  ('projects.tasks.close',  'projects', 'tasks', 'Tâches', 'VALIDATE', 'Clôturer une tâche',   4)
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
  -- Une tâche ne porte ni montant, ni donnée bancaire, ni tarif : rien de ce que
  -- §28 et §71 des règles de permissions qualifient de sensible.
  false,
  ref.module_order,
  -- Le module n'avait aucun menu : les quatre capacités existantes sont posées
  -- au niveau du module. « Tâches » devient son premier menu.
  1,
  0,
  n.rang
from nouvelles n
join lateral (
  select p.module_label, p.module_order
  from public.permissions p
  where p.code = 'projects.view'
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


do $$
declare
  v_total int;
  v_tasks int;
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 157 then
    raise exception 'Catalogue attendu à 157 permissions, obtenu %.', v_total;
  end if;

  select count(*) into v_tasks
  from public.permissions
  where code like 'projects.tasks.%';

  if v_tasks <> 4 then
    raise exception 'Quatre capacités de tâches attendues, obtenu %.', v_tasks;
  end if;
end $$;
