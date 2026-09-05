-- =============================================================================
-- ADIKOM PILOT — 059 · Calendrier, Réunions, Rendez-vous, Décisions, Actions
-- Phase 4 — Organisation · LOT 13 (Module 03 — Projets & Planification)
--
-- CE QUE CETTE MIGRATION POSE
--
-- Le second volet du Module 03 : ce qui se PLANIFIE dans le temps (réunions,
-- rendez-vous), ce qui en DÉCOULE (décisions, actions), et la vue qui rassemble
-- le tout (calendrier). Le LOT 12 avait livré la moitié qui tient le module
-- debout — « une idée → un projet → des tâches » (§54) ; celle-ci livre
-- « une réunion → des décisions → des actions → un suivi ».
--
-- Les critères d'acceptation du §53 se répartissaient sans reste entre les deux
-- lots. Le LOT 12 a couvert 1 à 8, 14 à 18 et 20 ; celui-ci couvre 9 à 13.
--
-- SIX TABLES, TREIZE CAPACITÉS
--
--   `project_meetings`                   réunion (§21) et son compte rendu (§23)
--   `project_meeting_participants`       qui y prend part (§21)
--   `project_appointments`               rendez-vous (§26) et son tiers (§27)
--   `project_appointment_participants`   qui y prend part (§26)
--   `project_decisions`                  ce qui a été décidé (§24)
--   `project_actions`                    ce qui en découle (§25)
--
-- Catalogue : 157 → 170 (DEC-036 §a).
--
-- CE QU'ELLE NE FAIT PAS, ET CE N'EST PAS UN OUBLI
--
--   · AUCUNE CAPACITÉ DE CALENDRIER. Le calendrier ne montre RIEN qu'une autre
--     capacité n'ouvre déjà : tâches, réunions, rendez-vous. Une permission qui
--     ne ferait que masquer un écran n'en serait pas une — elle donnerait
--     l'illusion d'un contrôle sans rien contrôler. Chaque couche du calendrier
--     exige SA lecture, et les couches fermées sont NOMMÉES (DEC-036 §d).
--   · AUCUN DOCUMENT (§26 « documents », §29). Le stockage suppose sa propre
--     capacité et son propre écran ; rien ici n'en produit.
--   · AUCUN COMMENTAIRE (§30) — même raison, reconduite du LOT 12.
--   · AUCUNE RÉCURRENCE de réunion (§52 la cite comme évolution future).
--   · AUCUNE NOTIFICATION STOCKÉE. Les deux familles ajoutées sont DÉRIVÉES,
--     comme les treize autres (migrations 056 et 058).
--   · AUCUNE TABLE DE PARTICIPANTS POUR LES DÉCISIONS. §24 cite les
--     « participants concernés » : ce sont ceux de la réunion dont la décision
--     est issue, plus son responsable. Une troisième table les recopierait —
--     §53.20 refuse la duplication inutile (DEC-036 §f).
--
-- CE QU'ELLE RÉUTILISE, SANS LE REDÉFINIR
--
--   · `fn_set_updated_at`, `fn_audit_row`, `fn_forbid_delete`, `current_actor`,
--     `has_permission`, `require_capability`, `holds_capabilities` ;
--   · `notifications_watch()`, à laquelle deux familles sont ajoutées.
--
-- FUSEAU
--
-- Une réunion a une DATE ET UNE HEURE (§21) : `starts_at` est un INSTANT, et le
-- jour civil s'en déduit sur `Indian/Comoro` (DEC-025 §e). Une réunion à 01:00
-- le 5 aux Comores ne doit pas se lire le 4 au soir.
-- =============================================================================


-- =============================================================================
-- 1. TYPES — deux vocabulaires, et pas un de plus
--
-- CLAUDE.md §59 : « ne crée pas plusieurs statuts différents pour représenter le
-- même état sans justification ». Une réunion et un rendez-vous vivent le même
-- cycle — prévu, tenu, annulé — et partagent donc UN SEUL type. Les mots
-- français diffèrent (« Tenue » / « Honoré ») ; les états, non.
-- =============================================================================

do $$ begin
  create type public.planning_status as enum (
    'PLANNED',    -- Planifiée / Planifié
    'HELD',       -- Tenue / Honoré
    'CANCELLED'   -- Annulée / Annulé
  );
exception when duplicate_object then null; end $$;

/*
 * L'état d'une action — §25.
 *
 * Trois valeurs, reprises MOT POUR MOT de celles des tâches (§12) pour les mêmes
 * états. Une action n'a ni « En cours » ni « En attente » : ce degré de suivi
 * est précisément ce qui la fait devenir une TÂCHE (§25). Lui donner cinq états
 * effacerait la distinction que le module pose.
 */
do $$ begin
  create type public.project_action_status as enum (
    'TODO',       -- À faire
    'DONE',       -- Terminée
    'CANCELLED'   -- Annulée
  );
exception when duplicate_object then null; end $$;


-- =============================================================================
-- 2. RÉUNIONS — §21, §22, §23
-- =============================================================================

create table public.project_meetings (
  id            uuid primary key default gen_random_uuid(),

  title         text not null,
  objective     text,

  -- §41 : les réunions se filtrent par projet. Le rattachement reste FACULTATIF —
  -- une réunion de direction ne relève d'aucun projet.
  project_id    uuid references public.projects (id) on delete restrict,

  owner_id      uuid references public.app_users (id) on delete set null,

  /*
   * §21 : « date ; heure ; durée ».
   *
   * Un INSTANT, et non un jour : c'est la différence avec une échéance de tâche.
   * La saisie passe donc par `fromLocalInput` (DEC-025 §e), faute de quoi une
   * réunion à 08:00 aux Comores serait enregistrée à 08:00 UTC et relue à 11:00.
   */
  starts_at         timestamptz not null,
  duration_minutes  integer not null default 60,

  location      text,
  agenda        text,   -- ordre du jour (§21)

  status        public.planning_status not null default 'PLANNED',
  status_reason text,
  status_changed_at timestamptz,
  status_changed_by uuid references public.app_users (id) on delete set null,

  /*
   * §23 — LE COMPTE RENDU.
   *
   * Ce qui s'est dit, écrit APRÈS. Il n'est pas une modification de la réunion :
   * organiser une rencontre et consigner ce qui s'y est décidé sont deux actes,
   * que §43 énumère d'ailleurs séparément. `projects.meetings.report` les
   * distingue, et `fn_meeting_write_guard` le fait respecter.
   */
  minutes             text,
  minutes_recorded_at timestamptz,
  minutes_recorded_by uuid references public.app_users (id) on delete set null,

  created_at    timestamptz not null default now(),
  created_by    uuid references public.app_users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.app_users (id) on delete set null,

  constraint meetings_title_not_blank check (btrim(title) <> ''),
  -- Une réunion de zéro minute n'a pas eu lieu ; une de trois jours n'est pas
  -- une réunion. Les bornes ferment la saisie absurde, pas le jugement.
  constraint meetings_duration_sane check (duration_minutes between 5 and 1440)
);

comment on table public.project_meetings is
  'Réunion interne ou professionnelle (Module 03 §21). Son compte rendu (§23) relève d''une capacité distincte de sa modification.';
comment on column public.project_meetings.starts_at is
  'Instant de début. Le jour civil s''en déduit sur `Indian/Comoro` (DEC-025 §e).';
comment on column public.project_meetings.minutes is
  'Compte rendu (§23). Écrit par `projects.meetings.report`, jamais par `.update`.';

create index meetings_starts_idx  on public.project_meetings (starts_at);
create index meetings_project_idx on public.project_meetings (project_id) where project_id is not null;
create index meetings_owner_idx   on public.project_meetings (owner_id);
create index meetings_status_idx  on public.project_meetings (status);


create table public.project_meeting_participants (
  meeting_id uuid not null references public.project_meetings (id) on delete cascade,
  user_id    uuid not null references public.app_users        (id) on delete cascade,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,

  primary key (meeting_id, user_id)
);

comment on table public.project_meeting_participants is
  'Participants d''une réunion (§21). Le responsable est `project_meetings.owner_id` : deux emplacements pour la même personne feraient deux vérités.';

create index meeting_participants_user_idx on public.project_meeting_participants (user_id);


-- =============================================================================
-- 3. RENDEZ-VOUS — §26, §27
-- =============================================================================

create table public.project_appointments (
  id            uuid primary key default gen_random_uuid(),

  subject       text not null,   -- objet (§26)

  starts_at         timestamptz not null,
  duration_minutes  integer not null default 60,

  location      text,

  owner_id      uuid references public.app_users (id) on delete set null,

  /*
   * §27 — LE TIERS CONCERNÉ.
   *
   * « Rendez-vous → Fournisseur A → Fiche fournisseur » : trois références
   * nullables plutôt qu'un couple (type, id), pour que la base garantisse
   * elle-même l'existence du tiers désigné. Même dispositif qu'aux projets
   * (migration 058).
   */
  client_id     uuid references public.clients   (id) on delete restrict,
  supplier_id   uuid references public.suppliers (id) on delete restrict,
  partner_id    uuid references public.partners  (id) on delete restrict,

  /*
   * §26 : « personne OU organisation concernée ».
   *
   * Toutes ne sont pas enregistrées dans ADIKOM PILOT — un notaire, un agent
   * administratif, un contact chez un fournisseur. Ce champ les nomme, et il
   * COEXISTE avec un tiers : « Client A » et « M. X, directeur » sont deux
   * informations, pas deux réponses à la même question.
   */
  external_contact text,

  notes         text,

  status        public.planning_status not null default 'PLANNED',
  status_reason text,
  status_changed_at timestamptz,
  status_changed_by uuid references public.app_users (id) on delete set null,

  created_at    timestamptz not null default now(),
  created_by    uuid references public.app_users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.app_users (id) on delete set null,

  constraint appointments_subject_not_blank check (btrim(subject) <> ''),
  constraint appointments_duration_sane check (duration_minutes between 5 and 1440),
  constraint appointments_single_party check (
    (client_id is not null)::int
    + (supplier_id is not null)::int
    + (partner_id is not null)::int <= 1
  )
);

comment on table public.project_appointments is
  'Rendez-vous professionnel (§26), rattachable au tiers concerné (§27) afin de conserver la continuité de la relation.';

create index appointments_starts_idx   on public.project_appointments (starts_at);
create index appointments_owner_idx    on public.project_appointments (owner_id);
create index appointments_client_idx   on public.project_appointments (client_id)   where client_id   is not null;
create index appointments_supplier_idx on public.project_appointments (supplier_id) where supplier_id is not null;
create index appointments_partner_idx  on public.project_appointments (partner_id)  where partner_id  is not null;


create table public.project_appointment_participants (
  appointment_id uuid not null references public.project_appointments (id) on delete cascade,
  user_id        uuid not null references public.app_users            (id) on delete cascade,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,

  primary key (appointment_id, user_id)
);

comment on table public.project_appointment_participants is
  'Participants d''un rendez-vous (§26). Le responsable est `project_appointments.owner_id`.';

create index appointment_participants_user_idx on public.project_appointment_participants (user_id);


-- =============================================================================
-- 4. DÉCISIONS — §24
--
-- « L'objectif est d'éviter que les décisions importantes soient perdues dans
-- des échanges informels. » Une décision ne se supprime donc jamais
-- (`fn_forbid_delete`), et elle n'a PAS DE STATUT : ce n'est pas un travail en
-- cours, c'est un fait daté. Lui donner un cycle de vie laisserait croire
-- qu'une décision peut être « en attente » — auquel cas elle n'est pas prise.
-- =============================================================================

create table public.project_decisions (
  id            uuid primary key default gen_random_uuid(),

  title         text not null,   -- titre (§24)
  context       text,            -- contexte (§24)
  statement     text not null,   -- décision prise (§24)

  -- Le JOUR où elle a été prise, pas celui où elle a été saisie. Une décision de
  -- la réunion de mardi reste datée de mardi si on l'enregistre jeudi.
  decided_on    date not null default (now() at time zone 'Indian/Comoro')::date,

  owner_id      uuid references public.app_users (id) on delete set null,

  project_id    uuid references public.projects         (id) on delete restrict,
  meeting_id    uuid references public.project_meetings (id) on delete restrict,

  created_at    timestamptz not null default now(),
  created_by    uuid references public.app_users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.app_users (id) on delete set null,

  constraint decisions_title_not_blank check (btrim(title) <> ''),
  constraint decisions_statement_not_blank check (btrim(statement) <> '')
);

comment on table public.project_decisions is
  'Décision importante conservée (§24). Aucun statut : une décision est un fait daté, pas un travail en cours. Elle ne se supprime pas.';
comment on column public.project_decisions.statement is
  'La décision elle-même, telle qu''elle a été prise. Obligatoire : un titre sans énoncé ne conserve rien.';

create index decisions_decided_idx on public.project_decisions (decided_on desc);
create index decisions_meeting_idx on public.project_decisions (meeting_id) where meeting_id is not null;
create index decisions_project_idx on public.project_decisions (project_id) where project_id is not null;
create index decisions_owner_idx   on public.project_decisions (owner_id);


-- =============================================================================
-- 5. ACTIONS — §25
--
-- « Une action représente une opération à réaliser À LA SUITE d'une réunion,
-- d'une décision ou d'un événement. »
--
-- UNE ACTION SANS ORIGINE N'EST PAS UNE ACTION : C'EST UNE TÂCHE.
--
-- C'est ce qui justifie une table distincte plutôt qu'une colonne de plus sur
-- `project_tasks` : l'action est le PROLONGEMENT d'un moment — elle en garde le
-- lien. La contrainte `actions_has_origin` en fait une règle, non une habitude.
--
-- « UNE ACTION PEUT ÊTRE TRANSFORMÉE EN TÂCHE LORSQU'UN SUIVI DÉTAILLÉ EST
-- NÉCESSAIRE. »
--
-- La transformation crée une VRAIE tâche et l'y rattache. À partir de ce
-- moment, l'action conserve la trace de ce qui a été décidé, et la tâche porte
-- le suivi : l'état de l'action est GELÉ (`fn_action_write_guard`), parce que
-- deux états pour un même travail feraient deux vérités dont l'une finirait par
-- mentir (DEC-036 §c).
-- =============================================================================

create table public.project_actions (
  id            uuid primary key default gen_random_uuid(),

  title         text not null,
  description   text,

  meeting_id    uuid references public.project_meetings  (id) on delete restrict,
  decision_id   uuid references public.project_decisions (id) on delete restrict,

  assignee_id   uuid references public.app_users (id) on delete set null,
  due_on        date,

  status        public.project_action_status not null default 'TODO',
  status_reason text,
  status_changed_at timestamptz,
  status_changed_by uuid references public.app_users (id) on delete set null,
  completed_at  timestamptz,

  -- La tâche née de la transformation (§25). `unique` : une action ne se
  -- transforme qu'une fois, et deux actions ne partagent pas une même tâche.
  task_id        uuid unique references public.project_tasks (id) on delete restrict,
  task_linked_at timestamptz,
  task_linked_by uuid references public.app_users (id) on delete set null,

  created_at    timestamptz not null default now(),
  created_by    uuid references public.app_users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.app_users (id) on delete set null,

  constraint actions_title_not_blank check (btrim(title) <> ''),
  constraint actions_has_origin check (
    meeting_id is not null or decision_id is not null
  )
);

comment on table public.project_actions is
  'Opération à réaliser à la suite d''une réunion ou d''une décision (§25). Sans origine, ce serait une tâche : la contrainte l''impose.';
comment on column public.project_actions.task_id is
  'Tâche née de la transformation (§25). Une fois posée, l''état de l''action est gelé : le suivi appartient à la tâche.';

create index actions_meeting_idx  on public.project_actions (meeting_id)  where meeting_id  is not null;
create index actions_decision_idx on public.project_actions (decision_id) where decision_id is not null;
create index actions_assignee_idx on public.project_actions (assignee_id, status);
create index actions_due_idx      on public.project_actions (due_on) where due_on is not null;
create index actions_status_idx   on public.project_actions (status);


-- =============================================================================
-- 6. TRANSITIONS — ce qui a un sens, imposé par la base
--
-- Même dispositif qu'au LOT 12 (DEC-035 §d) : ANNULÉ EST TERMINAL, TENU NE
-- L'EST PAS. Une réunion marquée tenue par erreur se replanifie ; une réunion
-- annulée ne se reprend pas — on en convoque une autre.
-- =============================================================================

create or replace function public.fn_planning_status_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_allowed public.planning_status[];
begin
  if new.status = old.status then
    return new;
  end if;

  v_allowed := case old.status
    when 'PLANNED'   then array['HELD','CANCELLED']::public.planning_status[]
    -- Correction d'une erreur de saisie : ce qui n'a pas eu lieu se replanifie.
    when 'HELD'      then array['PLANNED']::public.planning_status[]
    else array[]::public.planning_status[]
  end;

  if not (new.status = any(v_allowed)) then
    raise exception
      'Transition refusée : % ne peut pas devenir %.', old.status, new.status
      using errcode = 'check_violation';
  end if;

  new.status_changed_at := now();
  new.status_changed_by := coalesce(public.current_actor(), new.status_changed_by);

  return new;
end;
$$;

comment on function public.fn_planning_status_transition is
  'Enchaînements d''une réunion ou d''un rendez-vous. Annulé est terminal ; tenu se replanifie.';


create or replace function public.fn_action_status_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_allowed public.project_action_status[];
begin
  if new.status = old.status then
    return new;
  end if;

  v_allowed := case old.status
    when 'TODO' then array['DONE','CANCELLED']::public.project_action_status[]
    when 'DONE' then array['TODO']::public.project_action_status[]
    else array[]::public.project_action_status[]
  end;

  if not (new.status = any(v_allowed)) then
    raise exception
      'Transition d''action refusée : % ne peut pas devenir %.', old.status, new.status
      using errcode = 'check_violation';
  end if;

  new.status_changed_at := now();
  new.status_changed_by := coalesce(public.current_actor(), new.status_changed_by);

  -- Le fait, jamais la saisie — comme pour une tâche (migration 058).
  if new.status = 'DONE' then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;

  return new;
end;
$$;

comment on function public.fn_action_status_transition is
  'Enchaînements d''une action (§25) et pose de `completed_at`. Annulée est terminale ; réalisée se rouvre.';


-- =============================================================================
-- 7. CAPACITÉS EXACTES — ce que la policy seule ne peut pas distinguer
--
-- Une policy d'UPDATE dit qui peut écrire dans la table ; elle ne sait pas
-- distinguer ENREGISTRER UN COMPTE RENDU de MODIFIER UNE RÉUNION. Sans ce
-- déclencheur, `projects.meetings.report` serait IMPLIQUÉE par `.update` —
-- exactement ce que DEC-024 interdit, et le défaut que la migration 040 avait
-- corrigé pour la maintenance.
--
-- La barrière est au DÉCLENCHEUR : ces tables se modifient directement par
-- PostgREST, et une garde placée dans une fonction ne se trouve pas sur ce
-- chemin-là.
-- =============================================================================

create or replace function public.fn_meeting_write_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_report boolean := false;
begin
  /*
   * §23 — LE COMPTE RENDU EST UN ACTE.
   *
   * Deux gestes le composent, et ils vont ensemble : écrire ce qui s'est dit, et
   * déclarer que la réunion a eu lieu. Les séparer obligerait à détenir aussi
   * `.update` pour poser l'état, ce qui rendrait la capacité inutilisable seule.
   */
  v_report :=
    new.minutes is distinct from old.minutes
    or (new.status is distinct from old.status and new.status = 'HELD');

  -- L'HORODATAGE EST UN FAIT, PAS UN DROIT : il se pose quel que soit l'auteur,
  -- et `minutes_recorded_by` reste NULL hors session applicative. Le placer
  -- après le test d'acteur laisserait un compte rendu sans date dès qu'il
  -- viendrait d'un script.
  if new.minutes is distinct from old.minutes then
    new.minutes_recorded_at := case when new.minutes is not null then now() end;
    new.minutes_recorded_by := case when new.minutes is not null then public.current_actor() end;
  end if;

  -- Migration, script d'environnement, clé de service (convention de la 021) :
  -- pas de session, donc pas de capacité à vérifier.
  if public.current_actor() is null then
    return new;
  end if;

  if v_report then
    perform public.require_capability(
      array['projects.meetings.report'], 'enregistrer le compte rendu d''une réunion'
    );
  end if;

  -- Tout le reste — titre, objectif, date, lieu, responsable, annulation —
  -- relève de la modification. Les colonnes du compte rendu et les colonnes
  -- techniques sont écartées de la comparaison : sans cela, rédiger un compte
  -- rendu exigerait aussi `.update`.
  v_before := to_jsonb(old) - 'minutes' - 'minutes_recorded_at' - 'minutes_recorded_by'
              - 'updated_at' - 'updated_by' - 'status_changed_at' - 'status_changed_by';
  v_after  := to_jsonb(new) - 'minutes' - 'minutes_recorded_at' - 'minutes_recorded_by'
              - 'updated_at' - 'updated_by' - 'status_changed_at' - 'status_changed_by';

  -- L'état et son motif accompagnent le compte rendu : ils ne sont alors pas
  -- comptés comme une modification distincte.
  if v_report then
    v_before := v_before - 'status' - 'status_reason';
    v_after  := v_after  - 'status' - 'status_reason';
  end if;

  if v_before is distinct from v_after then
    perform public.require_capability(array['projects.meetings.update'], 'modifier une réunion');
  end if;

  return new;
end;
$$;

comment on function public.fn_meeting_write_guard is
  'Consigner n''est pas organiser (DEC-024, §23, §43) : `projects.meetings.report` est exigée pour le compte rendu, y compris en appel direct.';


/*
 * L'action transformée en tâche — §25.
 *
 * Deux règles, et aucune n'est une commodité :
 *
 *   1. TRANSFORMER, C'EST CRÉER UNE TÂCHE. La capacité exigée est donc
 *      `projects.tasks.create`, en plus de `projects.actions.update` que la
 *      policy réclame déjà. Sans cela, un PATCH direct posant `task_id`
 *      contournerait la seule capacité qui gouverne la création de tâches.
 *   2. UNE FOIS TRANSFORMÉE, L'ACTION NE PORTE PLUS SON ÉTAT. Le suivi
 *      appartient à la tâche ; laisser les deux évoluer produirait une action
 *      « à faire » sous une tâche terminée, ou l'inverse.
 */
create or replace function public.fn_action_write_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  /*
   * D'ABORD LA COHÉRENCE, ET ELLE NE S'EFFACE POUR PERSONNE.
   *
   * Ces deux règles ne parlent pas de DROIT mais de SENS : une action ne se
   * transforme qu'une fois, et une action transformée n'a plus d'état propre.
   * Elles s'appliquent donc aussi à une migration, à un script d'environnement
   * ou à la clé de service — contrairement aux gardes de capacité, qui n'ont
   * pas de session à interroger (convention de la 021).
   *
   * Les placer après le test d'acteur les aurait rendues inopérantes pour tout
   * ce qui n'est pas un utilisateur connecté : la base aurait accepté d'un
   * script ce qu'elle refuse à un humain.
   */
  if old.task_id is not null and new.task_id is distinct from old.task_id then
    raise exception 'Cette action est déjà suivie comme tâche.'
      using errcode = 'check_violation';
  end if;

  if old.task_id is not null and new.status is distinct from old.status then
    raise exception
      'Cette action est suivie comme tâche : son état est celui de la tâche.'
      using errcode = 'check_violation';
  end if;

  -- Le rattachement est un FAIT : il s'horodate quel que soit l'auteur, et
  -- `task_linked_by` reste NULL hors session applicative.
  if new.task_id is distinct from old.task_id and new.task_id is not null then
    new.task_linked_at := now();
    new.task_linked_by := public.current_actor();
  end if;

  -- Ensuite seulement, le DROIT — et lui suppose une session.
  if public.current_actor() is null then
    return new;
  end if;

  if new.task_id is distinct from old.task_id then
    perform public.require_capability(
      array['projects.tasks.create'], 'transformer une action en tâche'
    );
  end if;

  return new;
end;
$$;

comment on function public.fn_action_write_guard is
  'Transformer une action en tâche exige `projects.tasks.create` (§25), et gèle ensuite l''état de l''action : une seule vérité par travail.';


/*
 * LA TRANSFORMATION ELLE-MÊME — §25
 *
 * POURQUOI UNE FONCTION, ET NON DEUX APPELS DEPUIS L'APPLICATION.
 *
 * Créer la tâche puis rattacher l'action sont deux écritures. Menées depuis
 * l'application, un échec entre les deux laisserait une tâche ORPHELINE, née
 * d'une transformation qui n'a pas eu lieu — et que la base refuse de
 * supprimer (§48). Ici, les deux vivent dans la même transaction : elles
 * réussissent ensemble ou pas du tout.
 *
 * TROIS CAPACITÉS, ET AUCUNE N'EST DE TROP.
 *
 *   `projects.actions.view`   — lire l'action que l'on transforme ; sans elle,
 *                               RLS masquerait la ligne et l'UPDATE ne dirait
 *                               rien (le silence est le pire des refus) ;
 *   `projects.actions.update` — la rattacher ;
 *   `projects.tasks.create`   — car il naît une VRAIE tâche.
 *
 * Elles sont exigées ici pour pouvoir les NOMMER, et de nouveau par la policy
 * et le déclencheur — un appel direct rencontre les mêmes barrières.
 */
create or replace function public.transform_action_to_task(p_action_id uuid)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_action  public.project_actions%rowtype;
  v_project uuid;
  v_task    uuid;
begin
  perform public.require_capability(
    array['projects.actions.view'], 'transformer une action en tâche'
  );
  perform public.require_capability(
    array['projects.actions.update'], 'transformer une action en tâche'
  );
  perform public.require_capability(
    array['projects.tasks.create'], 'transformer une action en tâche'
  );

  select * into v_action from public.project_actions where id = p_action_id;
  if not found then
    raise exception 'Action introuvable.' using errcode = 'no_data_found';
  end if;

  if v_action.task_id is not null then
    raise exception 'Cette action est déjà suivie comme tâche.'
      using errcode = 'check_violation';
  end if;

  if v_action.status <> 'TODO' then
    raise exception 'Seule une action à faire se transforme en tâche.'
      using errcode = 'check_violation';
  end if;

  -- Une action ne porte pas de projet : il vient de la décision dont elle
  -- découle, ou à défaut de la réunion. La tâche née hérite donc du rattachement
  -- de son origine, et compte dans l'avancement du bon projet (§33).
  select coalesce(d.project_id, m.project_id) into v_project
  from public.project_actions x
  left join public.project_decisions d on d.id = x.decision_id
  left join public.project_meetings  m on m.id = x.meeting_id
  where x.id = p_action_id;

  insert into public.project_tasks (
    project_id, title, description, assignee_id, due_on, created_by, updated_by
  )
  values (
    v_project,
    v_action.title,
    v_action.description,
    v_action.assignee_id,
    v_action.due_on,
    public.current_actor(),
    public.current_actor()
  )
  returning id into v_task;

  update public.project_actions
     set task_id = v_task
   where id = p_action_id;

  return v_task;
end;
$$;

comment on function public.transform_action_to_task(uuid) is
  'Transforme une action en tâche (§25) : la tâche naît et l''action s''y rattache, dans une seule transaction. Exige la lecture et la modification des actions, ET la création de tâches.';


/*
 * On ne planifie pas dans un projet rangé.
 *
 * Même règle qu'aux tâches (migration 058) : un projet archivé est mis de côté
 * (§48). Y rattacher une réunion ou une décision nouvelle produirait un travail
 * que plus aucun écran de suivi ne montre.
 */
create or replace function public.fn_planning_project_coherence()
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

comment on function public.fn_planning_project_coherence is
  'Refuse de rattacher une réunion ou une décision à un projet archivé (§48).';


-- --- Déclencheurs -----------------------------------------------------------

create trigger meetings_updated_at
  before update on public.project_meetings
  for each row execute function public.fn_set_updated_at();

create trigger meetings_transition
  before update on public.project_meetings
  for each row execute function public.fn_planning_status_transition();

create trigger meetings_write_guard
  before update on public.project_meetings
  for each row execute function public.fn_meeting_write_guard();

create trigger meetings_project_coherence
  before insert or update on public.project_meetings
  for each row execute function public.fn_planning_project_coherence();

create trigger meetings_audit
  after insert or update on public.project_meetings
  for each row execute function public.fn_audit_row('projects');

create trigger meetings_no_delete
  before delete on public.project_meetings
  for each row execute function public.fn_forbid_delete();


-- Les participations reçoivent l'audit y compris en suppression : retirer
-- quelqu'un d'une réunion est un fait. Même traitement que `project_members`.
create trigger meeting_participants_audit
  after insert or update or delete on public.project_meeting_participants
  for each row execute function public.fn_audit_row('projects');


create trigger appointments_updated_at
  before update on public.project_appointments
  for each row execute function public.fn_set_updated_at();

create trigger appointments_transition
  before update on public.project_appointments
  for each row execute function public.fn_planning_status_transition();

create trigger appointments_audit
  after insert or update on public.project_appointments
  for each row execute function public.fn_audit_row('projects');

create trigger appointments_no_delete
  before delete on public.project_appointments
  for each row execute function public.fn_forbid_delete();

create trigger appointment_participants_audit
  after insert or update or delete on public.project_appointment_participants
  for each row execute function public.fn_audit_row('projects');


create trigger decisions_updated_at
  before update on public.project_decisions
  for each row execute function public.fn_set_updated_at();

create trigger decisions_project_coherence
  before insert or update on public.project_decisions
  for each row execute function public.fn_planning_project_coherence();

create trigger decisions_audit
  after insert or update on public.project_decisions
  for each row execute function public.fn_audit_row('projects');

create trigger decisions_no_delete
  before delete on public.project_decisions
  for each row execute function public.fn_forbid_delete();


create trigger actions_updated_at
  before update on public.project_actions
  for each row execute function public.fn_set_updated_at();

create trigger actions_transition
  before update on public.project_actions
  for each row execute function public.fn_action_status_transition();

create trigger actions_write_guard
  before update on public.project_actions
  for each row execute function public.fn_action_write_guard();

create trigger actions_audit
  after insert or update on public.project_actions
  for each row execute function public.fn_audit_row('projects');

create trigger actions_no_delete
  before delete on public.project_actions
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- 8. LE CALENDRIER — §19, §20
--
-- « Le calendrier peut afficher : tâches, échéances, réunions, rendez-vous,
-- événements liés aux projets. Les éléments doivent être filtrables selon leur
-- type. »
--
-- UNE SEULE LECTURE POUR TOUTES LES COUCHES.
--
-- Interroger trois tables depuis l'application ferait trois allers-retours et
-- trois définitions du « jour ». Ici, le jour civil se calcule UNE fois, sur
-- `Indian/Comoro` (DEC-025 §e).
--
-- CHAQUE COUCHE EXIGE SA LECTURE, ET SE TAIT SINON.
--
-- Le dispositif est celui de `notifications_watch()` : `holds_capabilities` ne
-- LÈVE pas, elle omet. Un calendrier n'est pas une synthèse chiffrée — l'absence
-- d'une couche ne rend aucune autre fausse. C'est l'écran qui NOMME les couches
-- fermées (DEC-017), afin que personne ne croie sa semaine vide.
--
-- AUCUNE CAPACITÉ DE CALENDRIER N'EST CRÉÉE : cette fonction ne montre rien que
-- `projects.tasks.view`, `projects.meetings.view` ou
-- `projects.appointments.view` n'ouvrent déjà (DEC-036 §d).
-- =============================================================================

create or replace function public.planning_calendar(
  p_from date,
  p_to   date
)
returns table (
  kind        text,   -- 'TASK' | 'MEETING' | 'APPOINTMENT'
  id          uuid,
  title       text,
  subtitle    text,
  day         date,   -- jour civil des Comores
  starts_at   timestamptz,   -- NULL pour une tâche : une échéance est un JOUR
  ends_at     timestamptz,
  status      text,
  is_late     boolean
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Indian/Comoro')::date;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Période de calendrier invalide.' using errcode = 'check_violation';
  end if;

  -- Un calendrier se consulte par jour, par semaine ou par mois (§20). Une
  -- fenêtre démesurée n'afficherait rien de lisible et balaierait les tables
  -- entières (§50 — « éviter de charger inutilement »).
  if p_to - p_from > 366 then
    raise exception 'Période de calendrier trop large : un an au plus.'
      using errcode = 'check_violation';
  end if;

  /* ----------------------------------------------------------------------- */
  /*  ÉCHÉANCES DE TÂCHES — §19                                              */
  /*                                                                         */
  /*  Les tâches ANNULÉES n'y figurent pas : elles n'occupent plus aucune     */
  /*  journée. Les tâches TERMINÉES, si — le calendrier dit ce qui était      */
  /*  prévu, pas seulement ce qui reste.                                     */
  /*                                                                         */
  /*  Celles d'un projet ARCHIVÉ restent visibles, comme dans la liste :      */
  /*  ranger un projet, c'est cesser de le RAPPELER, jamais l'effacer (§48).  */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(array['projects.tasks.view']) then
    return query
    select
      'TASK'::text,
      t.id,
      t.title,
      nullif(concat_ws(' · ', p.name, btrim(u.first_name || ' ' || u.last_name)), ''),
      t.due_on,
      null::timestamptz,
      null::timestamptz,
      t.status::text,
      (t.status not in ('DONE', 'CANCELLED') and t.due_on < v_today)
    from public.project_tasks t
    left join public.projects  p on p.id = t.project_id
    left join public.app_users u on u.id = t.assignee_id
    where t.due_on is not null
      and t.due_on between p_from and p_to
      and t.status <> 'CANCELLED';
  end if;

  /* ----------------------------------------------------------------------- */
  /*  RÉUNIONS — §19, §21                                                    */
  /*                                                                         */
  /*  Une réunion ANNULÉE n'occupe plus la journée : elle reste consultable   */
  /*  depuis sa fiche, mais le calendrier montre ce qui est PRÉVU.           */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(array['projects.meetings.view']) then
    return query
    select
      'MEETING'::text,
      m.id,
      m.title,
      nullif(concat_ws(' · ', m.location, p.name, btrim(u.first_name || ' ' || u.last_name)), ''),
      (m.starts_at at time zone 'Indian/Comoro')::date,
      m.starts_at,
      m.starts_at + make_interval(mins => m.duration_minutes),
      m.status::text,
      false
    from public.project_meetings m
    left join public.projects  p on p.id = m.project_id
    left join public.app_users u on u.id = m.owner_id
    where m.status <> 'CANCELLED'
      and (m.starts_at at time zone 'Indian/Comoro')::date between p_from and p_to;
  end if;

  /* ----------------------------------------------------------------------- */
  /*  RENDEZ-VOUS — §19, §26                                                 */
  /*                                                                         */
  /*  Le nom du tiers arrive par jointure EXTERNE : sans `parties.*.view`,    */
  /*  RLS masque la ligne et le rendez-vous s'affiche SANS lui. Son heure     */
  /*  reste vraie — c'est une absence, pas un mensonge.                      */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(array['projects.appointments.view']) then
    return query
    select
      'APPOINTMENT'::text,
      a.id,
      a.subject,
      nullif(
        concat_ws(
          ' · ',
          a.location,
          coalesce(c.legal_name, s.legal_name, pa.legal_name),
          a.external_contact
        ),
        ''
      ),
      (a.starts_at at time zone 'Indian/Comoro')::date,
      a.starts_at,
      a.starts_at + make_interval(mins => a.duration_minutes),
      a.status::text,
      false
    from public.project_appointments a
    left join public.clients   c  on c.id  = a.client_id
    left join public.suppliers s  on s.id  = a.supplier_id
    left join public.partners  pa on pa.id = a.partner_id
    where a.status <> 'CANCELLED'
      and (a.starts_at at time zone 'Indian/Comoro')::date between p_from and p_to;
  end if;
end;
$$;

comment on function public.planning_calendar(date, date) is
  'Les éléments planifiés d''une période (§19) : échéances de tâches, réunions, rendez-vous. Chaque couche exige SA lecture et se tait sinon ; aucune capacité de calendrier n''existe, l''écran ne montrant rien de plus que les listes.';


-- =============================================================================
-- 9. LA VEILLE APPREND DEUX SITUATIONS DE PLUS — Module 03 §38, Module 02 §4
--
-- §38 : « réunion à venir ; rendez-vous à venir ». Ce sont des SITUATIONS, donc
-- dérivables — contrairement à « décision enregistrée », qui est un ÉVÉNEMENT de
-- création et relève de l'arbitrage ouvert par DEC-033 §h.
--
-- NIVEAUX — pris dans le Module 02, jamais choisis.
--
--   réunion à venir     → Rappel (§4.2, comme « départ prévu demain »)
--   rendez-vous à venir → Rappel (§4.2)
--
-- Aujourd'hui ou demain, en jours CIVILS : la même fenêtre que les échéances de
-- tâches (migration 058) et que les départs de réservation (migration 056). Le
-- système n'a pas deux définitions de « bientôt ».
--
-- AUDIENCE — la capacité de lecture, comme les quatorze autres familles. Une
-- diffusion nominative aux seuls participants (§23 du Module 02) reste
-- l'arbitrage ouvert de DEC-033 §h.
--
-- CE QUI EST ANNULÉ NE RAPPELLE RIEN, ET CE QUI EST TENU NON PLUS.
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

  /* ----------------------------------------------------------------------- */
  /*  Module 03 §38 — RÉUNION À VENIR · Rappel                               */
  /*                                                                         */
  /*  Aujourd'hui ou demain, en jours CIVILS — la même fenêtre que les        */
  /*  départs et les échéances. Une réunion ANNULÉE ne rappelle rien, une     */
  /*  réunion TENUE non plus : la veille annonce ce qui vient.               */
  /*                                                                         */
  /*  Le projet et le responsable arrivent par jointure EXTERNE : sans        */
  /*  `projects.view` ni `users.users.view`, la réunion reste annoncée sans   */
  /*  eux, avec son heure et son lieu. C'est une absence, pas un mensonge.    */
  /*                                                                         */
  /*  Les réunions d'un projet ARCHIVÉ se taisent, comme ses tâches (§48).    */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(array['projects.meetings.view']) then
    return query
    select
      'meeting.soon:' || m.id::text,
      'MEETING_SOON'::text,
      'REMINDER'::text,
      'projects'::text,
      m.title,
      nullif(
        concat_ws(' · ', m.location, p.name, btrim(u.first_name || ' ' || u.last_name)),
        ''
      ),
      'meeting'::text,
      m.id,
      m.starts_at,
      (m.starts_at at time zone 'Indian/Comoro')::date,
      null::bigint
    from public.project_meetings m
    left join public.projects  p on p.id = m.project_id
    left join public.app_users u on u.id = m.owner_id
    where m.status = 'PLANNED'
      and (m.starts_at at time zone 'Indian/Comoro')::date between v_today and v_tomorrow
      and not exists (
        select 1 from public.projects a
        where a.id = m.project_id and a.is_archived
      );
  end if;

  /* ----------------------------------------------------------------------- */
  /*  Module 03 §38 — RENDEZ-VOUS À VENIR · Rappel                           */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(array['projects.appointments.view']) then
    return query
    select
      'appointment.soon:' || a.id::text,
      'APPOINTMENT_SOON'::text,
      'REMINDER'::text,
      'projects'::text,
      a.subject,
      nullif(
        concat_ws(
          ' · ',
          a.location,
          coalesce(c.legal_name, s.legal_name, pa.legal_name),
          a.external_contact
        ),
        ''
      ),
      'appointment'::text,
      a.id,
      a.starts_at,
      (a.starts_at at time zone 'Indian/Comoro')::date,
      null::bigint
    from public.project_appointments a
    left join public.clients   c  on c.id  = a.client_id
    left join public.suppliers s  on s.id  = a.supplier_id
    left join public.partners  pa on pa.id = a.partner_id
    where a.status = 'PLANNED'
      and (a.starts_at at time zone 'Indian/Comoro')::date between v_today and v_tomorrow;
  end if;
end;
$$;

comment on function public.notifications_watch() is
  'La veille : les situations réelles du système qui appellent une information ou un geste (Module 02 §4 à §13, Module 03 §38). Aucune notification n''est stockée ; chaque famille exige ses lectures et se tait sinon (§22).';


-- =============================================================================
-- 10. SÉCURITÉ AU NIVEAU DES DONNÉES — deuxième barrière de DEC-011
--
-- La visibilité suit la CAPACITÉ, non la participation : c'est le modèle de tout
-- le SaaS, et §51 s'y lit sans ambiguïté dès lors qu'aucune confidentialité par
-- élément n'est documentée. Une réunion confidentielle serait une règle métier
-- nouvelle : elle est signalée, non inventée (DEC-035 §c, reconduit).
-- =============================================================================

revoke all on public.project_meetings                 from anon;
revoke all on public.project_meeting_participants     from anon;
revoke all on public.project_appointments             from anon;
revoke all on public.project_appointment_participants from anon;
revoke all on public.project_decisions                from anon;
revoke all on public.project_actions                  from anon;

revoke delete on public.project_meetings     from authenticated;
revoke delete on public.project_appointments from authenticated;
revoke delete on public.project_decisions    from authenticated;
revoke delete on public.project_actions      from authenticated;

alter table public.project_meetings                 enable row level security;
alter table public.project_meeting_participants     enable row level security;
alter table public.project_appointments             enable row level security;
alter table public.project_appointment_participants enable row level security;
alter table public.project_decisions                enable row level security;
alter table public.project_actions                  enable row level security;

-- --- Réunions
--
-- L'écriture s'ouvre à `.update` OU `.report` ; le déclencheur de la §7 exige
-- ensuite celle de l'acte réellement demandé.
create policy meetings_select on public.project_meetings
  for select to authenticated
  using (public.has_permission('projects.meetings.view'));

create policy meetings_insert on public.project_meetings
  for insert to authenticated
  with check (public.has_permission('projects.meetings.create'));

create policy meetings_update on public.project_meetings
  for update to authenticated
  using (
    public.has_permission('projects.meetings.update')
    or public.has_permission('projects.meetings.report')
  )
  with check (
    public.has_permission('projects.meetings.update')
    or public.has_permission('projects.meetings.report')
  );

-- --- Participants d'une réunion
--
-- Convoquer, c'est modifier la réunion. `.create` y est jointe pour l'insertion,
-- afin que l'organisateur désigne les participants au moment même de la création.
create policy meeting_participants_select on public.project_meeting_participants
  for select to authenticated
  using (public.has_permission('projects.meetings.view'));

create policy meeting_participants_insert on public.project_meeting_participants
  for insert to authenticated
  with check (
    public.has_permission('projects.meetings.update')
    or public.has_permission('projects.meetings.create')
  );

create policy meeting_participants_delete on public.project_meeting_participants
  for delete to authenticated
  using (public.has_permission('projects.meetings.update'));

-- --- Rendez-vous
create policy appointments_select on public.project_appointments
  for select to authenticated
  using (public.has_permission('projects.appointments.view'));

create policy appointments_insert on public.project_appointments
  for insert to authenticated
  with check (public.has_permission('projects.appointments.create'));

create policy appointments_update on public.project_appointments
  for update to authenticated
  using (public.has_permission('projects.appointments.update'))
  with check (public.has_permission('projects.appointments.update'));

create policy appointment_participants_select on public.project_appointment_participants
  for select to authenticated
  using (public.has_permission('projects.appointments.view'));

create policy appointment_participants_insert on public.project_appointment_participants
  for insert to authenticated
  with check (
    public.has_permission('projects.appointments.update')
    or public.has_permission('projects.appointments.create')
  );

create policy appointment_participants_delete on public.project_appointment_participants
  for delete to authenticated
  using (public.has_permission('projects.appointments.update'));

-- --- Décisions
create policy decisions_select on public.project_decisions
  for select to authenticated
  using (public.has_permission('projects.decisions.view'));

create policy decisions_insert on public.project_decisions
  for insert to authenticated
  with check (public.has_permission('projects.decisions.create'));

create policy decisions_update on public.project_decisions
  for update to authenticated
  using (public.has_permission('projects.decisions.update'))
  with check (public.has_permission('projects.decisions.update'));

-- --- Actions
create policy actions_select on public.project_actions
  for select to authenticated
  using (public.has_permission('projects.actions.view'));

create policy actions_insert on public.project_actions
  for insert to authenticated
  with check (public.has_permission('projects.actions.create'));

create policy actions_update on public.project_actions
  for update to authenticated
  using (public.has_permission('projects.actions.update'))
  with check (public.has_permission('projects.actions.update'));


-- --- Exécution : rien pour PUBLIC (DEC-022) ---------------------------------

revoke execute on function public.planning_calendar(date, date) from public;
grant  execute on function public.planning_calendar(date, date) to authenticated, service_role;

revoke execute on function public.transform_action_to_task(uuid) from public;
grant  execute on function public.transform_action_to_task(uuid) to authenticated, service_role;

revoke execute on function public.fn_planning_status_transition() from public;
revoke execute on function public.fn_action_status_transition()   from public;
revoke execute on function public.fn_meeting_write_guard()        from public;
revoke execute on function public.fn_action_write_guard()         from public;
revoke execute on function public.fn_planning_project_coherence() from public;


-- =============================================================================
-- 11. LE CATALOGUE — treize capacités
--
-- §42 les nomme par leur verbe : « gérer les réunions ; gérer les rendez-vous ;
-- enregistrer des décisions ». « Gérer » se décompose comme partout ailleurs
-- dans le SaaS — consulter, créer, modifier — et cette décomposition n'est pas
-- une invention : c'est la convention du catalogue depuis la migration 007.
--
-- LA QUATORZIÈME QUI N'EXISTE PAS, ET POURQUOI
--
--   · `projects.calendar.view` — le calendrier ne montre RIEN qu'une autre
--     capacité n'ouvre déjà. Une permission qui ne ferait que masquer un écran
--     donnerait l'illusion d'un contrôle sans rien contrôler.
--
-- CE QUI N'EST PAS CRÉÉ NON PLUS (DEC-024 — ne pas surcharger le catalogue)
--
--   · `projects.actions.close` — clôturer une action, c'est la modifier. §42
--     nomme « clôturer une TÂCHE » et rien pour les actions : une action ne fait
--     avancer aucun pourcentage et ne fait taire aucune veille. La déduire par
--     analogie serait exactement le « modèle général » que DEC-024 écarte.
--   · `projects.meetings.cancel` — annuler une réunion, c'est la modifier.
--   · `projects.decisions.archive` — une décision ne se range pas : elle est
--     conservée pour être retrouvée (§24, §48).
--   · `.export`, `.download`, `.print` — aucun état, aucun document n'est
--     produit par ce lot. Le compte rendu vit dans la fiche, il n'en sort pas.
--
-- Catalogue : 157 → 170.
-- =============================================================================

-- La liste de colonnes commence par `(code, module_code` : c'est la forme que le
-- contrôle de parité TS/SQL (`permissions.test.ts`) reconnaît pour rejouer le
-- catalogue sans interpréter du SQL.
with nouvelles (code, module_code, menu_code, menu_label, action, label, menu_rang, rang) as (values
  ('projects.meetings.view',       'projects', 'meetings',     'Réunions',    'VIEW',     'Consulter les réunions',      2, 1),
  ('projects.meetings.create',     'projects', 'meetings',     'Réunions',    'CREATE',   'Créer une réunion',           2, 2),
  ('projects.meetings.update',     'projects', 'meetings',     'Réunions',    'UPDATE',   'Modifier une réunion',        2, 3),
  ('projects.meetings.report',     'projects', 'meetings',     'Réunions',    'VALIDATE', 'Enregistrer un compte rendu', 2, 4),

  ('projects.appointments.view',   'projects', 'appointments', 'Rendez-vous', 'VIEW',     'Consulter les rendez-vous',   3, 1),
  ('projects.appointments.create', 'projects', 'appointments', 'Rendez-vous', 'CREATE',   'Créer un rendez-vous',        3, 2),
  ('projects.appointments.update', 'projects', 'appointments', 'Rendez-vous', 'UPDATE',   'Modifier un rendez-vous',     3, 3),

  ('projects.actions.view',        'projects', 'actions',      'Actions',     'VIEW',     'Consulter les actions',       4, 1),
  ('projects.actions.create',      'projects', 'actions',      'Actions',     'CREATE',   'Créer une action',            4, 2),
  ('projects.actions.update',      'projects', 'actions',      'Actions',     'UPDATE',   'Modifier une action',         4, 3),

  ('projects.decisions.view',      'projects', 'decisions',    'Décisions',   'VIEW',     'Consulter les décisions',     5, 1),
  ('projects.decisions.create',    'projects', 'decisions',    'Décisions',   'CREATE',   'Enregistrer une décision',    5, 2),
  ('projects.decisions.update',    'projects', 'decisions',    'Décisions',   'UPDATE',   'Modifier une décision',       5, 3)
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
  -- Ni montant, ni donnée bancaire, ni tarif : rien de ce que §28 et §71 des
  -- règles de permissions qualifient de sensible.
  false,
  ref.module_order,
  -- L'ordre des menus reprend celui du §4 : Tâches (1), Réunions, Rendez-vous,
  -- Actions, Décisions. Le calendrier n'y figure pas — il n'a pas de capacité.
  n.menu_rang,
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
  v_total    int;
  v_projects int;
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 170 then
    raise exception 'Catalogue attendu à 170 permissions, obtenu %.', v_total;
  end if;

  select count(*) into v_projects
  from public.permissions
  where code like 'projects.%';

  if v_projects <> 21 then
    raise exception 'Vingt et une capacités attendues pour le module Projets, obtenu %.', v_projects;
  end if;

  -- Aucune capacité de calendrier : elle ne débloquerait rien (DEC-036 §d).
  if exists (select 1 from public.permissions where code like 'projects.calendar%') then
    raise exception 'Une capacité de calendrier a été créée : elle ne contrôlerait rien.';
  end if;
end $$;
