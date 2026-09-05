-- =============================================================================
-- ADIKOM PILOT — Recette Projets & Tâches (Phase 4 — Organisation, LOT 12)
--
-- CE QU'ELLE ÉPROUVE
--
-- Ce que la BASE doit tenir seule, et que ni l'écran ni la recette navigateur ne
-- peuvent garantir :
--
--   · les ENCHAÎNEMENTS de statut (§7, §12) — annulé terminal, terminé repris ;
--   · la COHÉRENCE des dates et du tiers unique (§6, §28) ;
--   · l'AVANCEMENT, refait sur les tâches réelles, tâches annulées exclues (§33) ;
--   · le RETARD, dérivé du jour civil des Comores et jamais stocké (§16) ;
--   · la VEILLE, qui apprend deux situations sans en inventer une troisième (§38) ;
--   · l'ABSENCE de tout ce que le lot ne fait pas : aucun avancement stocké,
--     aucune référence `PRJ-…`, aucune capacité de plus que les quatre du §42.
--
-- L'exemple chiffré est celui du §33 :
--
--   10 tâches, 6 terminées   → 60 %
--   une tâche annulée        → 6 / 9 = 67 %   (l'annulée sort des DEUX côtés)
--
-- Exécution :
--   npm run db:verify:projects
--
-- Ce script s'exécute avec le rôle de la chaîne de connexion, qui contourne RLS
-- et les gardes de capacité (`current_actor()` y est NULL). Il contrôle donc la
-- STRUCTURE, les RÈGLES et l'ARITHMÉTIQUE ; l'effet des capacités — notamment
-- `projects.tasks.close` et `projects.archive` — s'éprouve avec de vraies
-- sessions, dans `verify:projects`.
--
-- AUCUNE DATE EN DUR : toutes se posent par rapport au jour d'exécution, sur
-- `Indian/Comoro` (DEC-025 §e). Une recette ne doit pas expirer avec le
-- calendrier.
--
-- La transaction est annulée en fin de script : aucun résidu en base.
-- =============================================================================

begin;

create temporary table recette_projets (
  project_a   uuid,   -- projet suivi : avancement, tâches, retard
  project_b   uuid,   -- projet archivé : ses tâches se taisent
  project_c   uuid,   -- projet sans tâche : « aucune tâche », jamais 0 %
  actor       uuid,   -- un utilisateur existant, pour responsable et membre
  client      uuid,
  supplier    uuid,
  task_late   uuid,
  task_today  uuid,
  task_soon   uuid,
  task_done   uuid,
  task_cancel uuid
) on commit drop;

insert into recette_projets default values;

update recette_projets set
  actor    = (select id from public.app_users order by created_at limit 1),
  client   = (select id from public.clients   order by created_at limit 1),
  supplier = (select id from public.suppliers order by created_at limit 1);


-- --- 1. AUCUN AVANCEMENT N'EST STOCKÉ -------------------------------------------------
--
-- §33 : l'avancement se calcule. La garantie la plus forte est structurelle : il
-- n'existe aucune colonne où l'écrire. Une colonne `progress` finirait par
-- diverger des tâches, et un pourcentage faux fait autorité plus longtemps qu'un
-- pourcentage absent (DEC-034 §a).
do $$
declare v_col int;
begin
  select count(*) into v_col
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('projects', 'project_tasks')
    and column_name in ('progress', 'percent', 'completion', 'avancement', 'is_late', 'late');

  if v_col <> 0 then
    raise exception 'Une colonne d''avancement ou de retard a été stockée (% colonnes).', v_col;
  end if;

  raise notice '[OK] 1. Aucun avancement, aucun retard stocké : tout est dérivé.';
end $$;


-- --- 2. AUCUNE RÉFÉRENCE DE PROJET ----------------------------------------------------
--
-- Le module ne demande aucune référence : un projet est une coordination
-- interne, pas une pièce remise à un tiers (DEC-035 §e). Aucune règle de
-- numérotation ne doit donc avoir été créée.
do $$
begin
  if exists (select 1 from public.numbering_rules where entity_key in ('project', 'task')) then
    raise exception 'Une règle de numérotation a été créée pour les projets ou les tâches.';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('projects', 'project_tasks')
      and column_name in ('project_no', 'task_no', 'reference')
  ) then
    raise exception 'Une colonne de référence a été ajoutée sans décision.';
  end if;

  raise notice '[OK] 2. Aucune référence, aucune numérotation inventée.';
end $$;


-- --- 3. CRÉATION D'UN PROJET ----------------------------------------------------------
do $$
declare
  r recette_projets%rowtype;
  v_id uuid;
begin
  select * into r from recette_projets;

  insert into public.projects (name, objective, owner_id, priority, starts_on, due_on, client_id)
  values (
    'RECETTE — Partenariat Société X',
    'Éprouver le socle Projets & Tâches',
    r.actor,
    'HIGH',
    (now() at time zone 'Indian/Comoro')::date - 10,
    (now() at time zone 'Indian/Comoro')::date + 20,
    r.client
  )
  returning id into v_id;

  update recette_projets set project_a = v_id;

  if (select status from public.projects where id = v_id) <> 'DRAFT' then
    raise exception 'Un projet doit naître « Brouillon » (§7).';
  end if;

  raise notice '[OK] 3. Projet créé, statut initial « Brouillon ».';
end $$;


-- --- 4. UN PROJET NE SE RATTACHE QU'À UN SEUL TIERS (§28) ------------------------------
do $$
declare
  r recette_projets%rowtype;
  v_ok boolean := false;
begin
  select * into r from recette_projets;

  begin
    update public.projects set supplier_id = r.supplier where id = r.project_a;
  exception when check_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Un projet a pu désigner à la fois un client et un fournisseur.';
  end if;

  raise notice '[OK] 4. Client + fournisseur simultanés : refusé par la base.';
end $$;


-- --- 5. UNE ÉCHÉANCE NE PRÉCÈDE PAS UN DÉBUT ------------------------------------------
do $$
declare
  r recette_projets%rowtype;
  v_ok boolean := false;
begin
  select * into r from recette_projets;

  begin
    update public.projects
       set due_on = (now() at time zone 'Indian/Comoro')::date - 30
     where id = r.project_a;
  exception when check_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Une date de fin antérieure au début a été acceptée.';
  end if;

  raise notice '[OK] 5. Fin avant début : refusée.';
end $$;


-- --- 6. ENCHAÎNEMENTS DE STATUT D'UN PROJET (§7) ---------------------------------------
do $$
declare
  r recette_projets%rowtype;
  v_ok boolean := false;
begin
  select * into r from recette_projets;

  -- Brouillon → En cours : autorisé.
  update public.projects set status = 'ACTIVE' where id = r.project_a;

  if (select status_changed_at from public.projects where id = r.project_a) is null then
    raise exception 'Le changement de statut n''a pas été horodaté.';
  end if;

  -- En cours → Terminé → En cours : la reprise est possible, et tracée.
  update public.projects set status = 'DONE'   where id = r.project_a;
  update public.projects set status = 'ACTIVE' where id = r.project_a;

  -- En cours → Brouillon : aucun retour en arrière vers l'état initial.
  begin
    update public.projects set status = 'DRAFT' where id = r.project_a;
  exception when check_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Un projet en cours a pu redevenir un brouillon.';
  end if;

  raise notice '[OK] 6. Brouillon → En cours → Terminé → repris ; retour au brouillon refusé.';
end $$;


-- --- 7. ANNULÉ EST TERMINAL ------------------------------------------------------------
do $$
declare
  v_id uuid;
  v_ok boolean := false;
begin
  insert into public.projects (name, status) values ('RECETTE — Projet abandonné', 'DRAFT')
  returning id into v_id;

  update public.projects set status = 'CANCELLED' where id = v_id;

  begin
    update public.projects set status = 'ACTIVE' where id = v_id;
  exception when check_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Un projet annulé a pu être repris.';
  end if;

  raise notice '[OK] 7. Projet annulé : état terminal.';
end $$;


-- --- 8. DIX TÂCHES, SIX TERMINÉES → 60 % (§33) ----------------------------------------
do $$
declare
  r recette_projets%rowtype;
  v_today date := (now() at time zone 'Indian/Comoro')::date;
  v_id uuid;
  v_counts record;
begin
  select * into r from recette_projets;

  -- Six tâches terminées.
  for i in 1..6 loop
    insert into public.project_tasks (project_id, title, status, due_on)
    values (r.project_a, 'RECETTE — Tâche terminée ' || i, 'TODO', v_today - 5)
    returning id into v_id;

    update public.project_tasks set status = 'DONE' where id = v_id;
    if i = 1 then update recette_projets set task_done = v_id; end if;
  end loop;

  -- Une tâche en retard : échéance HIER, non terminée.
  insert into public.project_tasks (project_id, title, due_on, assignee_id)
  values (r.project_a, 'RECETTE — Tâche en retard', v_today - 1, r.actor)
  returning id into v_id;
  update recette_projets set task_late = v_id;

  -- Une tâche dont l'échéance est AUJOURD'HUI : elle n'est pas en retard.
  insert into public.project_tasks (project_id, title, due_on)
  values (r.project_a, 'RECETTE — Tâche du jour', v_today)
  returning id into v_id;
  update recette_projets set task_today = v_id;

  -- Une tâche pour demain, et une sans échéance.
  insert into public.project_tasks (project_id, title, due_on)
  values (r.project_a, 'RECETTE — Tâche de demain', v_today + 1)
  returning id into v_id;
  update recette_projets set task_soon = v_id;

  insert into public.project_tasks (project_id, title)
  values (r.project_a, 'RECETTE — Tâche sans échéance');

  select * into v_counts from public.projects_task_counts(r.project_a);

  if v_counts.total <> 10 then
    raise exception 'Dix tâches attendues, obtenu %.', v_counts.total;
  end if;
  if v_counts.done <> 6 then
    raise exception 'Six tâches terminées attendues, obtenu %.', v_counts.done;
  end if;
  if v_counts.percent <> 60 then
    raise exception 'Avancement attendu à 60 %%, obtenu % %%.', v_counts.percent;
  end if;
  if v_counts.late <> 1 then
    raise exception 'Un seul retard attendu, obtenu %.', v_counts.late;
  end if;

  raise notice '[OK] 8. 10 tâches, 6 terminées → 60 %%. Un seul retard : celui d''hier.';
end $$;


-- --- 9. UNE TÂCHE ANNULÉE SORT DES DEUX CÔTÉS -----------------------------------------
--
-- §33 met en garde contre « un pourcentage trompeur ». Compter une tâche annulée
-- au dénominateur ferait plafonner l'avancement d'un projet dont plus rien n'est
-- à faire.
do $$
declare
  r recette_projets%rowtype;
  v_counts record;
begin
  select * into r from recette_projets;

  update public.project_tasks set status = 'CANCELLED' where id = r.task_soon;
  update recette_projets set task_cancel = r.task_soon;

  select * into v_counts from public.projects_task_counts(r.project_a);

  if v_counts.total <> 9 then
    raise exception 'Neuf tâches comptées attendues, obtenu %.', v_counts.total;
  end if;
  if v_counts.done <> 6 then
    raise exception 'Six tâches terminées attendues, obtenu %.', v_counts.done;
  end if;
  if v_counts.percent <> 67 then
    raise exception 'Avancement attendu à 67 %%, obtenu % %%.', v_counts.percent;
  end if;

  raise notice '[OK] 9. Tâche annulée : hors du numérateur ET du dénominateur → 67 %%.';
end $$;


-- --- 10. UN PROJET SANS TÂCHE N'A PAS D'AVANCEMENT ------------------------------------
--
-- « Aucune tâche » n'est pas « 0 % ». La fonction ne rend aucune ligne, et
-- l'écran DIT qu'il n'y a rien à compter (DEC-017).
do $$
declare v_id uuid;
begin
  insert into public.projects (name) values ('RECETTE — Projet sans tâche')
  returning id into v_id;
  update recette_projets set project_c = v_id;

  if exists (select 1 from public.projects_task_counts(v_id)) then
    raise exception 'Un projet sans tâche a produit un avancement.';
  end if;

  raise notice '[OK] 10. Projet sans tâche : aucun pourcentage, jamais 0 %%.';
end $$;


-- --- 11. CLÔTURE ET RÉOUVERTURE D'UNE TÂCHE (§12) -------------------------------------
--
-- `completed_at` est un FAIT posé par le déclencheur : il apparaît à la clôture
-- et disparaît à la réouverture. Le laisser en place ferait lire « terminée le… »
-- sur une tâche redevenue à faire.
do $$
declare
  r recette_projets%rowtype;
  v_ok boolean := false;
begin
  select * into r from recette_projets;

  if (select completed_at from public.project_tasks where id = r.task_done) is null then
    raise exception 'Une tâche terminée n''a pas été horodatée.';
  end if;

  update public.project_tasks set status = 'IN_PROGRESS' where id = r.task_done;

  if (select completed_at from public.project_tasks where id = r.task_done) is not null then
    raise exception 'Une tâche rouverte a conservé sa date de clôture.';
  end if;

  -- Annulée reste terminale.
  begin
    update public.project_tasks set status = 'TODO' where id = r.task_cancel;
  exception when check_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Une tâche annulée a pu être rouverte.';
  end if;

  -- L'état est remis tel que la suite de la recette l'attend.
  update public.project_tasks set status = 'DONE' where id = r.task_done;

  raise notice '[OK] 11. Clôture horodatée, réouverture effacée, annulation terminale.';
end $$;


-- --- 12. UN PROJET ARCHIVÉ N'ACCEPTE PLUS DE TÂCHE (§48) ------------------------------
do $$
declare
  r recette_projets%rowtype;
  v_id uuid;
  v_ok boolean := false;
begin
  select * into r from recette_projets;

  insert into public.projects (name, is_archived) values ('RECETTE — Projet rangé', true)
  returning id into v_id;
  update recette_projets set project_b = v_id;

  begin
    insert into public.project_tasks (project_id, title)
    values (v_id, 'RECETTE — Tâche impossible');
  exception when check_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Une tâche a été rattachée à un projet archivé.';
  end if;

  raise notice '[OK] 12. Projet archivé : aucune tâche nouvelle.';
end $$;


-- --- 13. LA VEILLE APPREND DEUX SITUATIONS, PAS TROIS ---------------------------------
--
-- Module 03 §38 : échéance proche, tâche en retard. « Tâche attribuée » est un
-- ÉVÉNEMENT de création et reste l'arbitrage ouvert de DEC-033 §h : la veille ne
-- doit pas l'avoir inventé.
do $$
declare
  r recette_projets%rowtype;
  v_due   int;
  v_late  int;
  v_level text;
begin
  select * into r from recette_projets;

  select count(*)::int into v_due
  from public.notifications_watch() w
  where w.key = 'task.due:' || r.task_today::text;

  if v_due <> 1 then
    raise exception 'La tâche du jour n''est pas annoncée comme échéance proche (% lignes).', v_due;
  end if;

  select count(*)::int into v_late
  from public.notifications_watch() w
  where w.key = 'task.late:' || r.task_late::text;

  if v_late <> 1 then
    raise exception 'La tâche en retard n''est pas annoncée (% lignes).', v_late;
  end if;

  -- Niveaux : le rappel pour l'échéance, « à surveiller » pour le retard. Aucun
  -- n'est une appréciation : ils viennent du Module 02 §4.2 et §4.3.
  select w.level into v_level
  from public.notifications_watch() w
  where w.key = 'task.due:' || r.task_today::text;
  if v_level <> 'REMINDER' then
    raise exception 'Une échéance proche devrait être un rappel, obtenu %.', v_level;
  end if;

  select w.level into v_level
  from public.notifications_watch() w
  where w.key = 'task.late:' || r.task_late::text;
  if v_level <> 'ATTENTION' then
    raise exception 'Un retard devrait être « à surveiller », obtenu %.', v_level;
  end if;

  -- Une tâche TERMINÉE dont l'échéance est passée ne dit rien.
  if exists (
    select 1 from public.notifications_watch() w
    where w.key = 'task.late:' || r.task_done::text
  ) then
    raise exception 'Une tâche terminée est annoncée en retard.';
  end if;

  -- Aucune famille de projet autre que ces deux-là.
  if exists (
    select 1 from public.notifications_watch() w
    where w.source = 'projects' and w.kind not in ('TASK_DUE', 'TASK_LATE')
  ) then
    raise exception 'Une famille de notification a été inventée pour les projets.';
  end if;

  raise notice '[OK] 13. Veille : échéance = rappel, retard = à surveiller, et rien d''autre.';
end $$;


-- --- 14. LES TÂCHES D'UN PROJET RANGÉ SE TAISENT --------------------------------------
do $$
declare
  r recette_projets%rowtype;
  v_id uuid;
  v_today date := (now() at time zone 'Indian/Comoro')::date;
begin
  select * into r from recette_projets;

  -- La tâche est créée AVANT l'archivage : ranger un projet n'efface pas son
  -- travail, il cesse seulement de le rappeler.
  insert into public.project_tasks (project_id, title, due_on)
  values (r.project_a, 'RECETTE — Tâche d''un projet à ranger', v_today - 2)
  returning id into v_id;

  if not exists (
    select 1 from public.notifications_watch() w where w.key = 'task.late:' || v_id::text
  ) then
    raise exception 'Une tâche en retard d''un projet actif ne dit rien.';
  end if;

  update public.projects set is_archived = true where id = r.project_a;

  if exists (
    select 1 from public.notifications_watch() w where w.key = 'task.late:' || v_id::text
  ) then
    raise exception 'Une tâche de projet archivé alimente encore la veille.';
  end if;

  update public.projects set is_archived = false where id = r.project_a;

  raise notice '[OK] 14. Projet rangé : ses échéances cessent de rappeler, sans rien perdre.';
end $$;


-- --- 15. UNE TÂCHE INDÉPENDANTE EXISTE (§10) ------------------------------------------
do $$
declare
  v_id uuid;
  v_today date := (now() at time zone 'Indian/Comoro')::date;
begin
  insert into public.project_tasks (title, due_on)
  values ('RECETTE — Tâche sans projet', v_today - 3)
  returning id into v_id;

  if (select project_id from public.project_tasks where id = v_id) is not null then
    raise exception 'Une tâche indépendante s''est vue attribuer un projet.';
  end if;

  -- Elle alimente la veille comme les autres : son absence de projet ne la rend
  -- pas moins en retard.
  if not exists (
    select 1 from public.notifications_watch() w where w.key = 'task.late:' || v_id::text
  ) then
    raise exception 'Une tâche indépendante en retard ne dit rien.';
  end if;

  -- Et elle ne compte dans l'avancement d'aucun projet.
  if exists (select 1 from public.projects_task_counts() c where c.project_id is null) then
    raise exception 'Une tâche sans projet a été comptée dans un avancement.';
  end if;

  raise notice '[OK] 15. Tâche indépendante : suivie, sans fausser aucun avancement.';
end $$;


-- --- 16. PARTICIPANTS (§9) ------------------------------------------------------------
do $$
declare
  r recette_projets%rowtype;
  v_ok boolean := false;
begin
  select * into r from recette_projets;

  insert into public.project_members (project_id, user_id, role)
  values (r.project_a, r.actor, 'PARTICIPANT');

  -- Une même personne ne figure qu'une fois dans un projet.
  begin
    insert into public.project_members (project_id, user_id, role)
    values (r.project_a, r.actor, 'OBSERVER');
  exception when unique_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception 'Une personne a pu être inscrite deux fois au même projet.';
  end if;

  raise notice '[OK] 16. Équipe : une personne, un rôle, une seule ligne.';
end $$;


-- --- 17. LES OPÉRATIONS SONT JOURNALISÉES (§31, CLAUDE.md §21) -------------------------
do $$
declare
  r recette_projets%rowtype;
  v_projects int;
  v_tasks    int;
begin
  select * into r from recette_projets;

  select count(*)::int into v_projects
  from public.audit_log
  where module_code = 'projects' and entity_type = 'projects' and entity_id = r.project_a::text;

  select count(*)::int into v_tasks
  from public.audit_log
  where module_code = 'projects' and entity_type = 'project_tasks';

  if v_projects < 2 then
    raise exception 'Le projet n''a pas été journalisé (création et changements) : % entrées.', v_projects;
  end if;
  if v_tasks < 1 then
    raise exception 'Aucune tâche journalisée.';
  end if;

  if not exists (
    select 1 from public.audit_log
    where module_code = 'projects'
      and entity_type = 'projects'
      and entity_id = r.project_a::text
      and action = 'STATUS_CHANGE'
  ) then
    raise exception 'Un changement de statut n''a pas été qualifié comme tel (§34 audit).';
  end if;

  raise notice '[OK] 17. Projets, tâches et changements d''état : journalisés.';
end $$;


-- --- 18. LIRE NE MODIFIE RIEN ---------------------------------------------------------
do $$
declare
  v_before int;
  v_after  int;
  v_audit  int;
begin
  select count(*)::int into v_before from public.project_tasks;
  select count(*)::int into v_audit  from public.audit_log;

  perform count(*) from public.projects_task_counts();
  perform count(*) from public.notifications_watch();

  select count(*)::int into v_after from public.project_tasks;

  if v_after <> v_before then
    raise exception 'Une lecture a modifié les tâches.';
  end if;
  if (select count(*)::int from public.audit_log) <> v_audit then
    raise exception 'Une lecture a produit une entrée au journal d''audit.';
  end if;

  raise notice '[OK] 18. Avancement et veille : deux lectures, aucune écriture.';
end $$;


-- --- 19. LES AUTRES MODULES NE SONT PAS TOUCHÉS ---------------------------------------
--
-- Un projet référence, il ne pilote pas (§45) : aucune réservation, aucune
-- facture, aucun véhicule n'a changé d'état.
do $$
declare
  v_rentals   int;
  v_invoices  int;
  v_entries   int;
begin
  select count(*)::int into v_rentals  from public.rentals            where status = 'IN_PROGRESS';
  select count(*)::int into v_invoices from public.customer_invoices  where status = 'ISSUED';
  select count(*)::int into v_entries  from public.treasury_entries;

  perform count(*) from public.projects_task_counts();

  if (select count(*)::int from public.rentals where status = 'IN_PROGRESS') <> v_rentals
     or (select count(*)::int from public.customer_invoices where status = 'ISSUED') <> v_invoices
     or (select count(*)::int from public.treasury_entries) <> v_entries
  then
    raise exception 'Le module Projets a modifié un autre module.';
  end if;

  raise notice '[OK] 19. Location, facturation et trésorerie : intactes.';
end $$;


-- --- 20. LES QUATRE CAPACITÉS DE TÂCHES, ET RIEN QUI LES DÉBORDE ----------------------
--
-- Ce contrôle appartient au LOT 12 : il vérifie que les tâches portent
-- EXACTEMENT les quatre capacités du §42. Le total du catalogue et l'inventaire
-- complet du module Projets relèvent désormais de la recette du LOT 13
-- (`db:verify:planning`), qui les tient à jour avec les treize capacités
-- ajoutées par la migration 059.
do $$
declare
  v_total int;
  v_tasks int;
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 170 then
    raise exception 'Catalogue attendu à 170 permissions, obtenu %.', v_total;
  end if;

  select count(*) into v_tasks
  from public.permissions
  where code like 'projects.tasks.%';

  if v_tasks <> 4 then
    raise exception 'Quatre capacités de tâches attendues, obtenu %.', v_tasks;
  end if;

  -- Aucune capacité d'office sur les tâches : ni `assign`, ni `archive`, ni
  -- `export` — le module n'en propose aucune (DEC-024).
  if exists (
    select 1 from public.permissions
    where code like 'projects.tasks.%'
      and code not in (
        'projects.tasks.view', 'projects.tasks.create',
        'projects.tasks.update', 'projects.tasks.close'
      )
  ) then
    raise exception 'Une capacité a été créée d''office pour les tâches (DEC-024).';
  end if;

  raise notice '[OK] 20. Catalogue à 170 ; quatre capacités de tâches, aucune de plus.';
end $$;


rollback;

-- =============================================================================
-- Transaction annulée : aucune donnée de recette ne subsiste.
-- =============================================================================
