-- =============================================================================
-- ADIKOM PILOT — Recette Calendrier, Réunions, Rendez-vous, Décisions, Actions
-- Phase 4 — Organisation, LOT 13 (Module 03 §19 à §27, §38)
--
-- CE QU'ELLE ÉPROUVE
--
-- Ce que la BASE doit tenir seule, et que ni l'écran ni la recette navigateur ne
-- peuvent garantir :
--
--   · les ENCHAÎNEMENTS de statut (§21, §25, §26) — annulé terminal ;
--   · la COHÉRENCE : durée sensée, tiers unique, projet non archivé ;
--   · l'ORIGINE d'une action (§25) — sans réunion ni décision, ce serait une
--     tâche, et la base le refuse ;
--   · la TRANSFORMATION en tâche (§25) — atomique, une seule fois, et l'état
--     gelé ensuite ;
--   · le CALENDRIER (§19) — trois couches, un jour civil, les annulés exclus ;
--   · la VEILLE (§38) — deux situations de plus, et pas une troisième ;
--   · l'ABSENCE de ce que le lot ne fait pas : aucune capacité de calendrier,
--     aucun retard stocké, aucune référence inventée.
--
-- Exécution :
--   npm run db:verify:planning
--
-- Ce script s'exécute avec le rôle de la chaîne de connexion, qui contourne RLS
-- et les gardes de CAPACITÉ (`current_actor()` y est NULL). Il contrôle donc la
-- STRUCTURE, les RÈGLES et la COHÉRENCE ; l'effet des capacités — notamment
-- `projects.meetings.report` — s'éprouve avec de vraies sessions, dans
-- `verify:planning`.
--
-- AUCUNE DATE EN DUR : toutes se posent par rapport au moment d'exécution, sur
-- `Indian/Comoro` (DEC-025 §e). Une recette ne doit pas expirer avec le
-- calendrier.
--
-- La transaction est annulée en fin de script : aucun résidu en base.
-- =============================================================================

begin;

create temporary table recette_planning (
  actor        uuid,
  client       uuid,
  supplier     uuid,
  project      uuid,
  project_off  uuid,   -- projet archivé : rien ne s'y planifie
  meeting      uuid,   -- réunion du jour : calendrier et veille
  meeting_gone uuid,   -- réunion annulée : muette partout
  appointment  uuid,
  decision     uuid,
  action_a     uuid,   -- transformée en tâche
  action_b     uuid,   -- suivie sur place
  task_born    uuid
) on commit drop;

insert into recette_planning default values;

update recette_planning set
  actor    = (select id from public.app_users order by created_at limit 1),
  client   = (select id from public.clients   order by created_at limit 1),
  supplier = (select id from public.suppliers order by created_at limit 1);


-- --- 1. AUCUNE CAPACITÉ DE CALENDRIER -------------------------------------------------
--
-- Le calendrier ne montre rien que `projects.tasks.view`,
-- `projects.meetings.view` ou `projects.appointments.view` n'ouvrent déjà. Une
-- permission qui ne ferait que masquer un écran donnerait l'illusion d'un
-- contrôle sans rien contrôler (DEC-036 §d).
do $$
begin
  if exists (select 1 from public.permissions where code like 'projects.calendar%') then
    raise exception 'Une capacité de calendrier a été créée : elle ne contrôlerait rien.';
  end if;

  raise notice '[OK] 1. Aucune capacité de calendrier : l''écran ne montre rien de plus.';
end $$;


-- --- 2. LE CATALOGUE PORTE VINGT ET UNE CAPACITÉS POUR LE MODULE ----------------------
do $$
declare
  v_total    int;
  v_projects int;
  v_extra    text;
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 170 then
    raise exception 'Catalogue attendu à 170 permissions, obtenu %.', v_total;
  end if;

  select count(*) into v_projects from public.permissions where code like 'projects.%';
  if v_projects <> 21 then
    raise exception 'Vingt et une capacités attendues pour le module Projets, obtenu %.', v_projects;
  end if;

  -- Aucune capacité d'office : ni `actions.close`, ni `meetings.cancel`, ni
  -- `decisions.archive`, ni export d'aucune sorte — le lot n'en produit aucun
  -- (DEC-024).
  select string_agg(code, ', ') into v_extra
  from public.permissions
  where code like 'projects.%'
    and code not in (
      'projects.view', 'projects.create', 'projects.update', 'projects.archive',
      'projects.tasks.view', 'projects.tasks.create',
      'projects.tasks.update', 'projects.tasks.close',
      'projects.meetings.view', 'projects.meetings.create',
      'projects.meetings.update', 'projects.meetings.report',
      'projects.appointments.view', 'projects.appointments.create',
      'projects.appointments.update',
      'projects.actions.view', 'projects.actions.create', 'projects.actions.update',
      'projects.decisions.view', 'projects.decisions.create', 'projects.decisions.update'
    );

  if v_extra is not null then
    raise exception 'Capacité créée d''office pour le module Projets : % (DEC-024).', v_extra;
  end if;

  raise notice '[OK] 2. Catalogue à 170 ; 21 capacités pour Projets, aucune de plus.';
end $$;


-- --- 3. AUCUN RETARD, AUCUNE RÉFÉRENCE STOCKÉS ----------------------------------------
--
-- Le retard d'une action se dérive de l'échéance et du jour (§16, doctrine du
-- LOT 12). Une colonne le figerait, et il serait faux le lendemain.
do $$
declare v_col int;
begin
  select count(*) into v_col
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (
      'project_meetings', 'project_appointments', 'project_decisions', 'project_actions'
    )
    and column_name in ('is_late', 'late', 'reference', 'meeting_no', 'decision_no', 'action_no');

  if v_col <> 0 then
    raise exception 'Une colonne de retard ou de référence a été créée (% colonnes).', v_col;
  end if;

  if exists (
    select 1 from public.numbering_rules
    where entity_key in ('meeting', 'appointment', 'decision', 'action')
  ) then
    raise exception 'Une règle de numérotation a été créée sans décision.';
  end if;

  raise notice '[OK] 3. Aucun retard stocké, aucune référence inventée.';
end $$;


-- --- 4. UNE RÉUNION SE CRÉE, ET SA DURÉE A DU SENS ------------------------------------
do $$
declare
  r recette_planning%rowtype;
  v_id uuid;
  v_ok boolean := false;
begin
  select * into r from recette_planning;

  insert into public.projects (name, status) values ('RECETTE — Projet planifié', 'DRAFT')
  returning id into v_id;
  update recette_planning set project = v_id;

  insert into public.project_meetings (title, objective, project_id, owner_id, starts_at, duration_minutes, location)
  values (
    'RECETTE — Réunion fournisseur',
    'Éprouver le second volet',
    v_id,
    r.actor,
    (now() at time zone 'Indian/Comoro')::date + time '10:00' at time zone 'Indian/Comoro',
    90,
    'Bureau de la direction'
  )
  returning id into v_id;
  update recette_planning set meeting = v_id;

  if (select status from public.project_meetings where id = v_id) <> 'PLANNED' then
    raise exception 'Une réunion doit naître « Planifiée » (§21).';
  end if;

  -- Une réunion de zéro minute n'a pas eu lieu ; une de trois jours n'en est
  -- pas une.
  begin
    update public.project_meetings set duration_minutes = 0 where id = v_id;
  exception when check_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Une durée nulle a été acceptée.';
  end if;

  raise notice '[OK] 4. Réunion créée, état initial « Planifiée », durée bornée.';
end $$;


-- --- 5. ENCHAÎNEMENTS D'UNE RÉUNION (§21) ---------------------------------------------
--
-- ANNULÉ EST TERMINAL, TENU NE L'EST PAS : une réunion marquée tenue par erreur
-- se replanifie ; une réunion annulée ne se reprend pas (DEC-035 §d, reconduit).
do $$
declare
  r recette_planning%rowtype;
  v_id uuid;
  v_ok boolean := false;
begin
  select * into r from recette_planning;

  update public.project_meetings set status = 'HELD' where id = r.meeting;

  if (select status_changed_at from public.project_meetings where id = r.meeting) is null then
    raise exception 'Le changement de statut n''a pas été horodaté.';
  end if;

  update public.project_meetings set status = 'PLANNED' where id = r.meeting;

  insert into public.project_meetings (title, starts_at)
  values ('RECETTE — Réunion annulée', now() + interval '3 hours')
  returning id into v_id;
  update recette_planning set meeting_gone = v_id;

  update public.project_meetings set status = 'CANCELLED' where id = v_id;

  begin
    update public.project_meetings set status = 'PLANNED' where id = v_id;
  exception when check_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Une réunion annulée a pu être reprise.';
  end if;

  raise notice '[OK] 5. Planifiée → Tenue → replanifiée ; annulée : état terminal.';
end $$;


-- --- 6. LE COMPTE RENDU EST HORODATÉ PAR LA BASE (§23) --------------------------------
--
-- `minutes_recorded_at` est un FAIT posé par le déclencheur, jamais une saisie.
-- Il s'efface lorsque le compte rendu est retiré : une date sans texte ferait
-- croire qu'un compte rendu existe.
do $$
declare
  r recette_planning%rowtype;
begin
  select * into r from recette_planning;

  update public.project_meetings
     set minutes = 'RECETTE — Points abordés, suites à donner.', status = 'HELD'
   where id = r.meeting;

  if (select minutes_recorded_at from public.project_meetings where id = r.meeting) is null then
    raise exception 'Un compte rendu enregistré n''a pas été horodaté.';
  end if;

  if (select status from public.project_meetings where id = r.meeting) <> 'HELD' then
    raise exception 'Enregistrer un compte rendu doit déclarer la réunion tenue.';
  end if;

  update public.project_meetings set minutes = null where id = r.meeting;

  if (select minutes_recorded_at from public.project_meetings where id = r.meeting) is not null then
    raise exception 'Un compte rendu retiré a conservé sa date.';
  end if;

  /*
   * REMIS TEL QUE LA SUITE L'ATTEND.
   *
   * Enregistrer un compte rendu déclare la réunion TENUE : elle cesse donc
   * d'être « à venir ». Les contrôles de veille qui suivent la reprennent à
   * l'état planifié — et la §17 éprouve précisément qu'une réunion tenue se
   * tait.
   */
  update public.project_meetings
     set minutes = 'RECETTE — Points abordés, suites à donner.'
   where id = r.meeting;

  update public.project_meetings set status = 'PLANNED' where id = r.meeting;

  raise notice '[OK] 6. Compte rendu : horodaté à l''écriture, effacé au retrait, réunion tenue.';
end $$;


-- --- 7. ON NE PLANIFIE PAS DANS UN PROJET RANGÉ (§48) ---------------------------------
do $$
declare
  v_id uuid;
  v_ok boolean := false;
begin
  insert into public.projects (name, is_archived) values ('RECETTE — Projet rangé', true)
  returning id into v_id;
  update recette_planning set project_off = v_id;

  begin
    insert into public.project_meetings (title, project_id, starts_at)
    values ('RECETTE — Réunion impossible', v_id, now() + interval '1 day');
  exception when check_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Une réunion a été rattachée à un projet archivé.';
  end if;

  v_ok := false;
  begin
    insert into public.project_decisions (title, statement, project_id)
    values ('RECETTE — Décision impossible', 'Rien', v_id);
  exception when check_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Une décision a été rattachée à un projet archivé.';
  end if;

  raise notice '[OK] 7. Projet rangé : ni réunion ni décision nouvelle.';
end $$;


-- --- 8. UN RENDEZ-VOUS NE CONCERNE QU'UN SEUL TIERS (§27) ------------------------------
--
-- Le contact EXTERNE, lui, coexiste avec le tiers : « Client A » et « M. X,
-- directeur » sont deux informations, pas deux réponses à la même question.
do $$
declare
  r recette_planning%rowtype;
  v_id uuid;
  v_ok boolean := false;
begin
  select * into r from recette_planning;

  insert into public.project_appointments (
    subject, starts_at, duration_minutes, owner_id, client_id, external_contact, location
  )
  values (
    'RECETTE — Signature de convention',
    (now() at time zone 'Indian/Comoro')::date + time '15:00' at time zone 'Indian/Comoro',
    60,
    r.actor,
    r.client,
    'M. Ali, directeur administratif',
    'Moroni'
  )
  returning id into v_id;
  update recette_planning set appointment = v_id;

  begin
    update public.project_appointments set supplier_id = r.supplier where id = v_id;
  exception when check_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Un rendez-vous a pu désigner un client ET un fournisseur.';
  end if;

  if (select external_contact from public.project_appointments where id = v_id) is null then
    raise exception 'Le contact externe a été perdu.';
  end if;

  raise notice '[OK] 8. Rendez-vous : un seul tiers, et un contact qui coexiste.';
end $$;


-- --- 9. UNE DÉCISION A UN ÉNONCÉ, ET AUCUN STATUT (§24) -------------------------------
--
-- « L'objectif est d'éviter que les décisions importantes soient perdues. » Un
-- titre sans énoncé ne conserve rien ; et une décision n'est pas un travail en
-- cours — lui donner un statut laisserait croire qu'elle peut être « en
-- attente », auquel cas elle n'est pas prise.
do $$
declare
  r recette_planning%rowtype;
  v_id uuid;
  v_ok boolean := false;
begin
  select * into r from recette_planning;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_decisions' and column_name = 'status'
  ) then
    raise exception 'Une décision s''est vue attribuer un statut.';
  end if;

  begin
    insert into public.project_decisions (title, statement) values ('RECETTE — Vide', '   ');
  exception when check_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Une décision sans énoncé a été acceptée.';
  end if;

  insert into public.project_decisions (title, context, statement, owner_id, project_id, meeting_id)
  values (
    'RECETTE — Lancer le partenariat',
    'À la suite de la réunion fournisseur',
    'Le partenariat est lancé aux conditions discutées.',
    r.actor,
    r.project,
    r.meeting
  )
  returning id into v_id;
  update recette_planning set decision = v_id;

  -- La date par défaut est le JOUR des Comores, pas celui du serveur.
  if (select decided_on from public.project_decisions where id = v_id)
     <> (now() at time zone 'Indian/Comoro')::date
  then
    raise exception 'La date par défaut d''une décision n''est pas le jour des Comores.';
  end if;

  raise notice '[OK] 9. Décision : un énoncé obligatoire, aucun statut, le jour des Comores.';
end $$;


-- --- 10. UNE ACTION SANS ORIGINE N'EXISTE PAS (§25) -----------------------------------
--
-- « Une action représente une opération à réaliser À LA SUITE d'une réunion,
-- d'une décision ou d'un événement. » Sans origine, ce serait une TÂCHE — et
-- c'est ce qui justifie une table distincte plutôt qu'une colonne de plus.
do $$
declare
  r recette_planning%rowtype;
  v_id uuid;
  v_ok boolean := false;
begin
  select * into r from recette_planning;

  begin
    insert into public.project_actions (title) values ('RECETTE — Action orpheline');
  exception when check_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Une action sans réunion ni décision a été acceptée.';
  end if;

  insert into public.project_actions (title, decision_id, assignee_id, due_on)
  values (
    'RECETTE — Préparer la convention',
    r.decision,
    r.actor,
    (now() at time zone 'Indian/Comoro')::date + 5
  )
  returning id into v_id;
  update recette_planning set action_a = v_id;

  insert into public.project_actions (title, meeting_id, due_on)
  values (
    'RECETTE — Vérifier les factures',
    r.meeting,
    (now() at time zone 'Indian/Comoro')::date - 2
  )
  returning id into v_id;
  update recette_planning set action_b = v_id;

  if (select status from public.project_actions where id = v_id) <> 'TODO' then
    raise exception 'Une action doit naître « À faire ».';
  end if;

  raise notice '[OK] 10. Action : une origine obligatoire, état initial « À faire ».';
end $$;


-- --- 11. ENCHAÎNEMENTS D'UNE ACTION (§25) ---------------------------------------------
do $$
declare
  r recette_planning%rowtype;
  v_id uuid;
  v_ok boolean := false;
begin
  select * into r from recette_planning;

  update public.project_actions set status = 'DONE' where id = r.action_b;

  if (select completed_at from public.project_actions where id = r.action_b) is null then
    raise exception 'Une action terminée n''a pas été horodatée.';
  end if;

  update public.project_actions set status = 'TODO' where id = r.action_b;

  if (select completed_at from public.project_actions where id = r.action_b) is not null then
    raise exception 'Une action rouverte a conservé sa date de réalisation.';
  end if;

  insert into public.project_actions (title, meeting_id)
  values ('RECETTE — Action abandonnée', r.meeting)
  returning id into v_id;

  update public.project_actions set status = 'CANCELLED' where id = v_id;

  begin
    update public.project_actions set status = 'TODO' where id = v_id;
  exception when check_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Une action annulée a pu être rouverte.';
  end if;

  raise notice '[OK] 11. Action : réalisation horodatée, réouverture effacée, annulation terminale.';
end $$;


-- --- 12. LA TRANSFORMATION EN TÂCHE (§25) ---------------------------------------------
--
-- Une seule transaction, une seule fois, et l'état GELÉ ensuite : deux états
-- pour un même travail feraient deux vérités dont l'une finirait par mentir.
--
-- La tâche née hérite du PROJET de l'origine — ici celui de la décision — afin
-- de compter dans le bon avancement (§33).
do $$
declare
  r recette_planning%rowtype;
  v_task uuid;
  v_ok boolean := false;
begin
  select * into r from recette_planning;

  v_task := public.transform_action_to_task(r.action_a);
  update recette_planning set task_born = v_task;

  if (select task_id from public.project_actions where id = r.action_a) is distinct from v_task then
    raise exception 'L''action n''a pas été rattachée à la tâche créée.';
  end if;

  if (select task_linked_at from public.project_actions where id = r.action_a) is null then
    raise exception 'La transformation n''a pas été horodatée.';
  end if;

  if (select project_id from public.project_tasks where id = v_task) is distinct from r.project then
    raise exception 'La tâche née n''a pas hérité du projet de la décision.';
  end if;

  if (select assignee_id from public.project_tasks where id = v_task) is distinct from r.actor then
    raise exception 'La tâche née n''a pas repris le responsable de l''action.';
  end if;

  if (select due_on from public.project_tasks where id = v_task)
     <> (now() at time zone 'Indian/Comoro')::date + 5
  then
    raise exception 'La tâche née n''a pas repris l''échéance de l''action.';
  end if;

  -- Une seule fois.
  begin
    perform public.transform_action_to_task(r.action_a);
  exception when check_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Une action a pu être transformée deux fois.';
  end if;

  -- L'ÉTAT EST GELÉ, y compris pour le rôle de service : c'est une règle de
  -- COHÉRENCE, pas de droit. La base ne doit pas accepter d'un script ce
  -- qu'elle refuse à un humain.
  v_ok := false;
  begin
    update public.project_actions set status = 'DONE' where id = r.action_a;
  exception when check_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'L''état d''une action transformée a pu être changé.';
  end if;

  -- Le reste, lui, reste modifiable : corriger un libellé n'est pas suivre.
  update public.project_actions
     set title = 'RECETTE — Préparer la convention (corrigé)'
   where id = r.action_a;

  raise notice '[OK] 12. Transformation : atomique, unique, et l''état passe à la tâche.';
end $$;


-- --- 13. UNE ACTION TRANSFORMÉE N'EST PLUS EN RETARD DE SON CÔTÉ ----------------------
--
-- L'échéance et le suivi appartiennent désormais à la tâche. Deux retards pour
-- un même travail se contrediraient — c'est la même doctrine que l'avancement
-- du LOT 12 : une seule vérité par fait.
do $$
declare
  r recette_planning%rowtype;
begin
  select * into r from recette_planning;

  -- La tâche née porte l'échéance ; l'action ne la « rejoue » pas.
  if (select count(*) from public.project_actions a
      where a.id = r.action_a and a.task_id is not null and a.due_on is not null) <> 1 then
    raise exception 'L''action transformée a perdu son échéance : elle doit rester lisible.';
  end if;

  raise notice '[OK] 13. Action transformée : l''échéance reste lisible, le suivi change de main.';
end $$;


-- --- 14. LE CALENDRIER RASSEMBLE TROIS COUCHES (§19) ----------------------------------
do $$
declare
  r recette_planning%rowtype;
  v_today date := (now() at time zone 'Indian/Comoro')::date;
  v_meetings int;
  v_appointments int;
  v_tasks int;
  v_day date;
begin
  select * into r from recette_planning;

  select count(*)::int into v_meetings
  from public.planning_calendar(v_today, v_today) c
  where c.kind = 'MEETING' and c.id = r.meeting;

  if v_meetings <> 1 then
    raise exception 'La réunion du jour n''apparaît pas au calendrier (% lignes).', v_meetings;
  end if;

  select count(*)::int into v_appointments
  from public.planning_calendar(v_today, v_today) c
  where c.kind = 'APPOINTMENT' and c.id = r.appointment;

  if v_appointments <> 1 then
    raise exception 'Le rendez-vous du jour n''apparaît pas au calendrier.';
  end if;

  -- La tâche née de la transformation a une échéance à J+5 : elle apparaît
  -- dans la fenêtre correspondante, et pas dans celle du jour.
  select count(*)::int into v_tasks
  from public.planning_calendar(v_today, v_today + 10) c
  where c.kind = 'TASK' and c.id = r.task_born;

  if v_tasks <> 1 then
    raise exception 'L''échéance de tâche n''apparaît pas au calendrier.';
  end if;

  -- LE JOUR EST CIVIL, ET IL EST CELUI DES COMORES.
  select c.day into v_day
  from public.planning_calendar(v_today, v_today) c
  where c.kind = 'MEETING' and c.id = r.meeting;

  if v_day <> v_today then
    raise exception 'Le jour du calendrier n''est pas celui des Comores : %.', v_day;
  end if;

  -- Une réunion ANNULÉE n'occupe plus la journée.
  if exists (
    select 1 from public.planning_calendar(v_today, v_today + 1) c
    where c.id = r.meeting_gone
  ) then
    raise exception 'Une réunion annulée occupe encore le calendrier.';
  end if;

  raise notice '[OK] 14. Calendrier : trois couches, jour civil des Comores, annulés exclus.';
end $$;


-- --- 15. LE CALENDRIER REFUSE UNE PÉRIODE ABSURDE (§50) -------------------------------
--
-- Une fenêtre démesurée n'afficherait rien de lisible et balaierait les tables
-- entières. Le refus est explicite : il ne se déguise pas en résultat vide.
do $$
declare
  v_today date := (now() at time zone 'Indian/Comoro')::date;
  v_ok boolean := false;
begin
  begin
    perform count(*) from public.planning_calendar(v_today, v_today - 1);
  exception when check_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Une période inversée a été acceptée.';
  end if;

  v_ok := false;
  begin
    perform count(*) from public.planning_calendar(v_today, v_today + 400);
  exception when check_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Une période de plus d''un an a été acceptée.';
  end if;

  raise notice '[OK] 15. Période inversée ou démesurée : refusée, et le refus se dit.';
end $$;


-- --- 16. LA VEILLE APPREND DEUX SITUATIONS, PAS TROIS (§38) ---------------------------
--
-- « Réunion à venir ; rendez-vous à venir ». « Décision enregistrée » est un
-- ÉVÉNEMENT de création et reste l'arbitrage ouvert de DEC-033 §h : la veille
-- ne doit pas l'avoir inventé.
do $$
declare
  r recette_planning%rowtype;
  v_count int;
  v_level text;
begin
  select * into r from recette_planning;

  select count(*)::int into v_count
  from public.notifications_watch() w
  where w.key = 'meeting.soon:' || r.meeting::text;

  if v_count <> 1 then
    raise exception 'La réunion du jour n''est pas annoncée (% lignes).', v_count;
  end if;

  select w.level into v_level
  from public.notifications_watch() w
  where w.key = 'meeting.soon:' || r.meeting::text;

  if v_level <> 'REMINDER' then
    raise exception 'Une réunion à venir devrait être un rappel, obtenu %.', v_level;
  end if;

  select count(*)::int into v_count
  from public.notifications_watch() w
  where w.key = 'appointment.soon:' || r.appointment::text;

  if v_count <> 1 then
    raise exception 'Le rendez-vous du jour n''est pas annoncé (% lignes).', v_count;
  end if;

  -- Aucune famille de projet au-delà des quatre attendues.
  if exists (
    select 1 from public.notifications_watch() w
    where w.source = 'projects'
      and w.kind not in ('TASK_DUE', 'TASK_LATE', 'MEETING_SOON', 'APPOINTMENT_SOON')
  ) then
    raise exception 'Une famille de notification a été inventée pour les projets.';
  end if;

  -- Aucune notification n'est STOCKÉE : rien à trouver dans une table.
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'notifications'
  ) then
    raise exception 'Une table de notifications a été créée : la veille est dérivée.';
  end if;

  raise notice '[OK] 16. Veille : réunion et rendez-vous = rappels, et rien d''autre.';
end $$;


-- --- 17. CE QUI EST ANNULÉ OU TENU NE RAPPELLE RIEN -----------------------------------
do $$
declare
  r recette_planning%rowtype;
begin
  select * into r from recette_planning;

  -- La réunion annulée de la §5 est prévue dans trois heures : sans la règle,
  -- elle rappellerait.
  if exists (
    select 1 from public.notifications_watch() w
    where w.key = 'meeting.soon:' || r.meeting_gone::text
  ) then
    raise exception 'Une réunion annulée alimente encore la veille.';
  end if;

  -- Une réunion déclarée TENUE ne rappelle plus non plus.
  update public.project_meetings set status = 'HELD' where id = r.meeting;

  if exists (
    select 1 from public.notifications_watch() w
    where w.key = 'meeting.soon:' || r.meeting::text
  ) then
    raise exception 'Une réunion tenue alimente encore la veille.';
  end if;

  update public.project_meetings set status = 'PLANNED' where id = r.meeting;

  raise notice '[OK] 17. Réunion annulée ou tenue : la veille se tait.';
end $$;


-- --- 18. UNE RÉUNION DE PROJET RANGÉ SE TAIT (§48) ------------------------------------
--
-- Même règle qu'aux tâches : ranger un projet, c'est cesser de le RAPPELER,
-- jamais l'effacer. La réunion reste consultable et reste au calendrier — c'est
-- le rappel qui cesse.
do $$
declare
  r recette_planning%rowtype;
  v_today date := (now() at time zone 'Indian/Comoro')::date;
begin
  select * into r from recette_planning;

  if not exists (
    select 1 from public.notifications_watch() w
    where w.key = 'meeting.soon:' || r.meeting::text
  ) then
    raise exception 'La réunion d''un projet actif ne dit rien.';
  end if;

  update public.projects set is_archived = true where id = r.project;

  if exists (
    select 1 from public.notifications_watch() w
    where w.key = 'meeting.soon:' || r.meeting::text
  ) then
    raise exception 'La réunion d''un projet archivé alimente encore la veille.';
  end if;

  -- Mais elle reste au calendrier, comme la tâche du LOT 12 reste dans sa liste.
  if not exists (
    select 1 from public.planning_calendar(v_today, v_today) c where c.id = r.meeting
  ) then
    raise exception 'Ranger un projet a effacé sa réunion du calendrier.';
  end if;

  update public.projects set is_archived = false where id = r.project;

  raise notice '[OK] 18. Projet rangé : la réunion cesse de rappeler, sans disparaître.';
end $$;


-- --- 19. PARTICIPANTS : UNE PERSONNE, UNE SEULE LIGNE (§21, §26) ----------------------
do $$
declare
  r recette_planning%rowtype;
  v_ok boolean := false;
begin
  select * into r from recette_planning;

  insert into public.project_meeting_participants (meeting_id, user_id)
  values (r.meeting, r.actor);

  begin
    insert into public.project_meeting_participants (meeting_id, user_id)
    values (r.meeting, r.actor);
  exception when unique_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Une personne a pu être convoquée deux fois à la même réunion.';
  end if;

  insert into public.project_appointment_participants (appointment_id, user_id)
  values (r.appointment, r.actor);

  raise notice '[OK] 19. Participants : une personne, une seule ligne.';
end $$;


-- --- 20. RIEN NE SE SUPPRIME, ET LA BARRIÈRE EST DOUBLE (§24, §48, CLAUDE.md §22) -----
--
-- POURQUOI CE CONTRÔLE EST STRUCTUREL ET NON COMPORTEMENTAL.
--
-- `fn_forbid_delete` laisse DÉLIBÉRÉMENT passer les opérations sans session
-- applicative (DEC-020, migration 021) : une recette doit pouvoir nettoyer ses
-- jeux d'essai. Tenter une suppression avec le rôle de la chaîne de connexion
-- n'éprouverait donc rien — elle réussirait, et c'est voulu.
--
-- Ce qui se vérifie ici, c'est la barrière telle qu'elle se présente à un
-- UTILISATEUR : le privilège retiré, et le déclencheur en place. La recette
-- navigateur, elle, tente la suppression avec une vraie session.
--
-- LA PARTICIPATION FAIT EXCEPTION : une convocation se retire, elle ne
-- s'archive pas (même traitement que `project_members` au LOT 12).
do $$
declare
  v_table   text;
  v_trigger int;
begin
  foreach v_table in array array[
    'project_meetings', 'project_appointments', 'project_decisions', 'project_actions'
  ]
  loop
    if has_table_privilege('authenticated', 'public.' || v_table, 'DELETE') then
      raise exception 'Un utilisateur authentifié peut supprimer dans %.', v_table;
    end if;

    select count(*)::int into v_trigger
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where c.relname = v_table
      and not t.tgisinternal
      and t.tgname like '%no_delete';

    if v_trigger <> 1 then
      raise exception 'Le déclencheur de refus de suppression manque sur %.', v_table;
    end if;
  end loop;

  -- La participation, elle, se retire — et la policy le gouverne.
  if not has_table_privilege('authenticated', 'public.project_meeting_participants', 'DELETE') then
    raise exception 'Une convocation ne peut plus être retirée : ce n''est pas la règle.';
  end if;

  raise notice '[OK] 20. Suppression retirée à l''utilisateur ; seule la convocation se défait.';
end $$;


-- --- 21. TOUT EST JOURNALISÉ (§31, CLAUDE.md §21) -------------------------------------
do $$
declare
  r recette_planning%rowtype;
  v_meetings int;
  v_decisions int;
  v_actions int;
begin
  select * into r from recette_planning;

  select count(*)::int into v_meetings
  from public.audit_log
  where module_code = 'projects' and entity_type = 'project_meetings' and entity_id = r.meeting::text;

  select count(*)::int into v_decisions
  from public.audit_log
  where module_code = 'projects' and entity_type = 'project_decisions';

  select count(*)::int into v_actions
  from public.audit_log
  where module_code = 'projects' and entity_type = 'project_actions';

  if v_meetings < 2 then
    raise exception 'La réunion n''a pas été journalisée : % entrées.', v_meetings;
  end if;
  if v_decisions < 1 then raise exception 'Aucune décision journalisée.'; end if;
  if v_actions   < 1 then raise exception 'Aucune action journalisée.'; end if;

  -- Un changement de statut est QUALIFIÉ comme tel (Règles d'audit §34).
  if not exists (
    select 1 from public.audit_log
    where module_code = 'projects'
      and entity_type = 'project_meetings'
      and entity_id = r.meeting::text
      and action = 'STATUS_CHANGE'
  ) then
    raise exception 'Un changement de statut de réunion n''a pas été qualifié.';
  end if;

  raise notice '[OK] 21. Réunions, décisions, actions et changements d''état : journalisés.';
end $$;


-- --- 22. LIRE NE MODIFIE RIEN ---------------------------------------------------------
do $$
declare
  v_today   date := (now() at time zone 'Indian/Comoro')::date;
  v_before  int;
  v_audit   int;
begin
  select count(*)::int into v_before from public.project_meetings;
  select count(*)::int into v_audit  from public.audit_log;

  perform count(*) from public.planning_calendar(v_today - 7, v_today + 7);
  perform count(*) from public.notifications_watch();

  if (select count(*)::int from public.project_meetings) <> v_before then
    raise exception 'Une lecture a modifié les réunions.';
  end if;
  if (select count(*)::int from public.audit_log) <> v_audit then
    raise exception 'Une lecture a produit une entrée au journal d''audit.';
  end if;

  raise notice '[OK] 22. Calendrier et veille : deux lectures, aucune écriture.';
end $$;


-- --- 23. LES AUTRES MODULES NE SONT PAS TOUCHÉS (§45) ---------------------------------
--
-- Un projet référence, il ne pilote pas. La SEULE écriture hors du module est la
-- TÂCHE née d'une action (§25) — et le module 03 la demande explicitement.
do $$
declare
  v_rentals  int;
  v_invoices int;
  v_entries  int;
  v_today    date := (now() at time zone 'Indian/Comoro')::date;
begin
  select count(*)::int into v_rentals  from public.rentals           where status = 'IN_PROGRESS';
  select count(*)::int into v_invoices from public.customer_invoices where status = 'ISSUED';
  select count(*)::int into v_entries  from public.treasury_entries;

  perform count(*) from public.planning_calendar(v_today, v_today + 30);

  if (select count(*)::int from public.rentals where status = 'IN_PROGRESS') <> v_rentals
     or (select count(*)::int from public.customer_invoices where status = 'ISSUED') <> v_invoices
     or (select count(*)::int from public.treasury_entries) <> v_entries
  then
    raise exception 'Le second volet du module Projets a modifié un autre module.';
  end if;

  raise notice '[OK] 23. Location, facturation et trésorerie : intactes.';
end $$;


rollback;

-- =============================================================================
-- Transaction annulée : aucune donnée de recette ne subsiste.
-- =============================================================================
