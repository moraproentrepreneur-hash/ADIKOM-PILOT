-- =============================================================================
-- ADIKOM PILOT — Recette Point de vente : caisses et sessions de caisse
-- LOT 27 (Module 12) — migrations 108 à 111
--
-- CE QU'ELLE ÉPROUVE
--
--   · les NEUF capacités, leur sensibilité, et aucune d'inventée (C-27) ;
--   · les TROIS tables : RLS, ni suppression ni TRUNCATE, gardes « nées par leur
--     fonction » en DERNIER, aucune fonction `SECURITY DEFINER` ;
--   · une caisse s'adosse à un compte CASH ACTIF — et le reste (clé composite) ;
--   · 🟥 B-8 — une session ouverte par caisse ET par utilisateur, EN BASE ;
--   · 🟥 B-13 — le caissier A voit SES montants, pas ceux du caissier B ;
--     `pos.sessions.view` seul ne voit AUCUN montant ; `amounts.view` voit tout ;
--   · 🟥 B-9 — la clôture exige un montant compté, constate l'écart sans
--     bloquer, le journalise, et ne touche PAS la trésorerie ;
--   · une session close ne se rouvre pas ; le fond de caisse ne se réécrit pas ;
--   · « QUI ÉTAIT EN CAISSE LE J ENTRE 10H00 ET 11H30 ? », bornes comprises ;
--   · 🟥 INSERTION ET MODIFICATION DIRECTES REFUSÉES, même au porteur de la
--     capacité ;
--   · le profil MINIMAL n'obtient rien ;
--   · le périmètre de SAUVEGARDE porte les trois tables, dans l'ordre.
--
-- 🟥 LA RLS EST ÉPROUVÉE POUR DE BON.
--
-- Contrairement aux recettes antérieures, les blocs qui éprouvent une LECTURE
-- s'exécutent sous `set local role authenticated`, avec l'identité d'un compte
-- de recette posée comme PostgREST la pose. Le rôle de la chaîne de connexion
-- contourne RLS : sans ce changement de rôle, « le caissier A ne voit pas les
-- montants de B » serait vrai par construction, et ne prouverait rien.
--
-- ANTI-VACUITÉ : chaque « ne voit rien » est précédé d'un « voit quelque chose »
-- portant sur les MÊMES lignes. Un refus mesuré sur une table vide n'éprouve
-- rien.
--
-- Exécution : npm run db:verify:pos-sessions
--
-- AUCUNE DATE EN DUR : tout se situe par rapport au JOUR COMORIEN. La
-- transaction est annulée en fin de script — aucun résidu.
-- =============================================================================

begin;

-- Garde d'entrée : un résidu d'un passage interrompu fausserait la recette.
do $$
begin
  if exists (select 1 from public.app_users where email like 'recette.pos.%@adikom.test') then
    raise exception 'Résidu d''une recette précédente (comptes recette.pos.*) : nettoyez avant de rejouer.';
  end if;
end $$;


-- --- 1. LES NEUF CAPACITÉS, ET PAS UNE DE PLUS (C-27) ------------------------
do $$
declare
  v_attendu text[] := array[
    'pos.registers.view', 'pos.registers.create', 'pos.registers.update', 'pos.registers.archive',
    'pos.sessions.view', 'pos.sessions.amounts.view', 'pos.sessions.open',
    'pos.sessions.close', 'pos.sessions.export'
  ];
  v_manquantes text[];
  v_inconnues  text[];
begin
  select array_agg(c) into v_manquantes
  from unnest(v_attendu) c
  where not exists (select 1 from public.permissions p where p.code = c);
  if v_manquantes is not null then
    raise exception 'Capacités du LOT 27 absentes : %', v_manquantes;
  end if;

  -- LOT 28 : le menu `sales` a ses propres capacités, éprouvées par
  -- `pos_sales.sql`. Ici, les menus caisses et sessions seulement.
  select array_agg(p.code) into v_inconnues
  from public.permissions p
  where p.module_code = 'pos' and p.menu_code in ('registers', 'sessions')
    and not (p.code = any (v_attendu));
  if v_inconnues is not null then
    raise exception 'Capacité créée sans fonctionnalité correspondante : %', v_inconnues;
  end if;

  -- Plan 02 §10.3 : ni écart, ni document, ni vente.
  if exists (select 1 from public.permissions
             where code in ('pos.sessions.variance.view', 'pos.sessions.download',
                            'pos.sessions.print')) then
    raise exception 'Une capacité exclue par le Plan 02 §10.3 a été créée.';
  end if;

  if exists (select 1 from public.permissions
             where module_code = 'pos' and menu_code in ('registers', 'sessions')
               and is_sensitive is distinct from (code in ('pos.sessions.amounts.view', 'pos.sessions.export'))) then
    raise exception 'Sensibilité incorrecte : seules amounts.view et export sont sensibles.';
  end if;

  if exists (select 1 from public.permissions
             where module_code = 'pos' and (module_order <> 12 or module_label <> 'Point de vente')) then
    raise exception 'Le module pos n''est pas « Point de vente », ordre 12.';
  end if;

  if (select action from public.permissions where code = 'pos.sessions.close') <> 'VALIDATE'
     or (select action from public.permissions where code = 'pos.sessions.open') <> 'CREATE'
     or (select submenu_code from public.permissions where code = 'pos.sessions.amounts.view') <> 'amounts' then
    raise exception 'Action ou sous-menu d''une capacité du point de vente non conforme au Plan 02 §10.2.';
  end if;

  raise notice '[OK] 1. Neuf capacités pos, deux sensibles, aucune inventée.';
end $$;


-- --- 2. LES TROIS TABLES, REFERMÉES ------------------------------------------
do $$
declare
  v_table text;
  v_n     int;
begin
  foreach v_table in array array['pos_registers', 'pos_sessions', 'pos_session_amounts'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_table)::regclass) then
      raise exception 'RLS non activée sur %.', v_table;
    end if;
    if has_table_privilege('anon', 'public.' || v_table, 'SELECT') then
      raise exception '% lisible par anon.', v_table;
    end if;
    if has_table_privilege('authenticated', 'public.' || v_table, 'DELETE')
       or has_table_privilege('authenticated', 'public.' || v_table, 'TRUNCATE') then
      raise exception 'DELETE ou TRUNCATE accordé à authenticated sur %.', v_table;
    end if;

    select count(*) into v_n from pg_trigger
    where tgrelid = ('public.' || v_table)::regclass and not tgisinternal
      and tgname > v_table || '_zzz_born_by_function';
    if v_n > 0 then
      raise exception 'La garde « née par sa fonction » de % n''est pas la dernière.', v_table;
    end if;
  end loop;

  -- D4 — aucune fonction SECURITY DEFINER dans tout le point de vente.
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and (p.proname like '%pos_%' or p.proname like 'pos%');
  if v_n > 0 then
    raise exception '% fonction(s) du point de vente sont SECURITY DEFINER.', v_n;
  end if;

  -- T-1 : la session ne porte aucun montant.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'pos_sessions'
               and (column_name like '%amount%' or column_name like '%float%')) then
    raise exception 'Un montant figure sur pos_sessions.';
  end if;

  raise notice '[OK] 2. Trois tables, RLS active, gardes de naissance en dernier, aucun SECURITY DEFINER.';
end $$;


-- --- 3. LES POLICIES DISENT CE QU'ELLES DOIVENT ------------------------------
do $$
declare
  v_qual text;
begin
  select qual into v_qual from pg_policies
  where tablename = 'pos_session_amounts' and policyname = 'pos_session_amounts_select';
  if v_qual is null or v_qual not like '%pos.sessions.amounts.view%'
     or v_qual not like '%current_actor%' or v_qual not like '%SELECT has_permission%' then
    raise exception 'La policy par ligne des montants n''a pas la forme attendue : %', v_qual;
  end if;

  select qual into v_qual from pg_policies
  where tablename = 'pos_sessions' and policyname = 'pos_sessions_select';
  if v_qual not like '%pos.sessions.view%' or v_qual like '%amounts%' then
    raise exception 'La lecture des sessions doit relever de pos.sessions.view, et d''elle seule.';
  end if;

  select with_check into v_qual from pg_policies
  where tablename = 'pos_sessions' and policyname = 'pos_sessions_insert';
  if v_qual not like '%current_actor%' then
    raise exception 'Une session pourrait être insérée au nom d''un autre.';
  end if;

  raise notice '[OK] 3. Policies : montants par ligne (amounts.view OU caissier), session sans montant.';
end $$;


-- =============================================================================
-- SUJETS DE RECETTE
-- =============================================================================

create temporary table recette_pos (cle text primary key, id uuid not null) on commit drop;
grant select, insert on recette_pos to authenticated;

do $$
declare
  v_cles text[] := array['caissier_a', 'caissier_b', 'planning', 'responsable', 'gestionnaire', 'minimal'];
  v_cle  text;
  v_id   uuid;
begin
  foreach v_cle in array v_cles loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'recette.pos.' || v_cle || '@adikom.test', now(), now());
    insert into public.app_users (id, first_name, last_name, username, email, status, is_super_admin)
    values (v_id, 'Recette', 'Pos ' || v_cle, 'recette.pos.' || v_cle,
            'recette.pos.' || v_cle || '@adikom.test', 'ACTIVE', false);
    insert into recette_pos values (v_cle, v_id);
  end loop;

  -- LES DEUX CAISSIERS — identiques : ouvrir, clôturer, voir les sessions, et
  -- lire la caisse et son compte (Q-1). PAS `amounts.view`.
  insert into public.user_permissions (user_id, permission_id, effect)
  select r.id, p.id, 'ALLOW'
  from recette_pos r cross join public.permissions p
  where r.cle in ('caissier_a', 'caissier_b')
    and p.code in ('pos.sessions.view', 'pos.sessions.open', 'pos.sessions.close',
                   'pos.registers.view', 'treasury.accounts.view');

  -- LE PLANNING — « qui était en caisse », et rien d'autre (Plan 02 §10.2).
  insert into public.user_permissions (user_id, permission_id, effect)
  select r.id, p.id, 'ALLOW'
  from recette_pos r cross join public.permissions p
  where r.cle = 'planning' and p.code in ('pos.sessions.view');

  -- LE RESPONSABLE — voit tous les montants, clôture la session d'un autre.
  insert into public.user_permissions (user_id, permission_id, effect)
  select r.id, p.id, 'ALLOW'
  from recette_pos r cross join public.permissions p
  where r.cle = 'responsable'
    and p.code in ('pos.sessions.view', 'pos.sessions.amounts.view', 'pos.sessions.close',
                   'pos.registers.view');

  -- LE GESTIONNAIRE DES CAISSES — déclare, modifie, (dés)active.
  insert into public.user_permissions (user_id, permission_id, effect)
  select r.id, p.id, 'ALLOW'
  from recette_pos r cross join public.permissions p
  where r.cle = 'gestionnaire'
    and p.code in ('pos.registers.view', 'pos.registers.create', 'pos.registers.update',
                   'pos.registers.archive', 'pos.sessions.view', 'treasury.accounts.view');

  -- LE PROFIL MINIMAL — authentifié, actif, aucune capacité du point de vente.
  insert into public.user_permissions (user_id, permission_id, effect)
  select r.id, p.id, 'ALLOW'
  from recette_pos r cross join public.permissions p
  where r.cle = 'minimal' and p.code in ('dashboard.view');

  raise notice '[OK] 4. Six profils : deux caissiers, planning, responsable, gestionnaire, minimal.';
end $$;

create or replace function pg_temp.agir_comme(p_cle text)
returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from recette_pos where cle = p_cle;
  if v_id is null then raise exception 'Compte de recette « % » introuvable.', p_cle; end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id::text, 'role', 'authenticated')::text, true);
end $$;

create or replace function pg_temp.redevenir_service()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
end $$;

create or replace function pg_temp.id_de(p_cle text)
returns uuid language sql stable as $$ select id from recette_pos where cle = p_cle $$;


-- --- 5. LE DÉCOR : trois comptes — caisse active, banque, caisse inactive ----
do $$
begin
  insert into recette_pos values ('cash', public.create_financial_account(
    'CASH', 'RECETTE POS — Caisse comptoir', 'Recette', null, 100000, null, null));
  insert into recette_pos values ('cash2', public.create_financial_account(
    'CASH', 'RECETTE POS — Caisse annexe', 'Recette', null, 0, null, null));
  insert into recette_pos values ('bank', public.create_financial_account(
    'BANK', 'RECETTE POS — Banque', 'Banque de recette', null, 0, null, null));
  insert into recette_pos values ('cash_off', public.create_financial_account(
    'CASH', 'RECETTE POS — Caisse fermée', 'Recette', null, 0, null, null));
  perform public.set_financial_account_status(pg_temp.id_de('cash_off'), 'INACTIVE', 'Recette');

  raise notice '[OK] 5. Décor : deux caisses actives, une banque, une caisse inactive.';
end $$;


-- =============================================================================
-- LES ACTES ET LA RLS — SOUS LE RÔLE `authenticated`
-- =============================================================================

set local role authenticated;


-- --- 6. DÉCLARER UNE CAISSE — positifs ----------------------------------------
do $$
declare
  v_r1 uuid;
  v_r2 uuid;
  v_no text;
begin
  perform pg_temp.agir_comme('gestionnaire');

  v_r1 := public.create_pos_register('Comptoir Moroni (recette)', pg_temp.id_de('cash'), 'Moroni');
  v_r2 := public.create_pos_register('Comptoir aéroport (recette)', pg_temp.id_de('cash'), null);
  insert into recette_pos values ('caisse1', v_r1), ('caisse2', v_r2);

  select register_no into v_no from public.pos_registers where id = v_r1;
  if v_no !~ '^CAI-\d{6}$' then
    raise exception 'Numéro de caisse inattendu : %', v_no;
  end if;

  if (select account_kind from public.pos_registers where id = v_r1) <> 'CASH'
     or not (select is_active from public.pos_registers where id = v_r1) then
    raise exception 'La caisse ne naît pas active, adossée à un compte CASH.';
  end if;

  -- Deux caisses sur le même compte : aucune règle ne l'interdit (DEC-008).
  perform public.update_pos_register(v_r2, 'Comptoir aéroport (recette)', pg_temp.id_de('cash2'), 'Hahaya');
  if (select account_id from public.pos_registers where id = v_r2) <> pg_temp.id_de('cash2') then
    raise exception 'Le changement de compte d''une caisse sans session ouverte a échoué.';
  end if;

  raise notice '[OK] 6. Deux caisses déclarées (%), compte changé hors session.', v_no;
end $$;


-- --- 7. DÉCLARER UNE CAISSE — négatifs ----------------------------------------
do $$
declare
  v_ok boolean;
  v_state text;
begin
  perform pg_temp.agir_comme('gestionnaire');

  -- Un compte bancaire est refusé.
  begin
    perform public.create_pos_register('Caisse sur banque', pg_temp.id_de('bank'), null);
    raise exception 'ÉCHEC : une caisse a été adossée à un compte bancaire.';
  exception when check_violation then null;
  end;

  -- Un compte inactif est refusé.
  begin
    perform public.create_pos_register('Caisse sur compte fermé', pg_temp.id_de('cash_off'), null);
    raise exception 'ÉCHEC : une caisse a été adossée à un compte inactif.';
  exception when check_violation then null;
  end;

  -- Un libellé vide est refusé.
  begin
    perform public.create_pos_register('   ', pg_temp.id_de('cash'), null);
    raise exception 'ÉCHEC : une caisse sans nom a été déclarée.';
  exception when check_violation then null;
  end;

  -- 🟥 INSERTION DIRECTE — refusée MÊME au porteur de pos.registers.create.
  begin
    insert into public.pos_registers (register_no, label, account_id)
    values ('CAI-999999', 'Caisse forgée', pg_temp.id_de('cash'));
    raise exception 'ÉCHEC : une caisse est née par écriture directe.';
  exception when insufficient_privilege then
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  -- 🟥 MODIFICATION DIRECTE — refusée aussi.
  begin
    update public.pos_registers set label = 'Renommée en direct'
    where id = pg_temp.id_de('caisse1');
    raise exception 'ÉCHEC : une caisse a été modifiée par écriture directe.';
  exception when insufficient_privilege then null;
  end;

  -- Le caissier ne déclare pas de caisse.
  perform pg_temp.agir_comme('caissier_a');
  begin
    perform public.create_pos_register('Caisse du caissier', pg_temp.id_de('cash'), null);
    raise exception 'ÉCHEC : un caissier a déclaré une caisse.';
  exception when insufficient_privilege then null;
  end;

  -- Profil minimal : rien.
  perform pg_temp.agir_comme('minimal');
  begin
    perform public.create_pos_register('Caisse minimale', pg_temp.id_de('cash'), null);
    raise exception 'ÉCHEC : le profil minimal a déclaré une caisse.';
  exception when insufficient_privilege then null;
  end;

  if exists (select 1 from public.pos_registers) then
    raise exception 'ÉCHEC : le profil minimal lit les caisses.';
  end if;

  raise notice '[OK] 7. Banque, compte inactif, nom vide, écriture directe (%), caissier et profil minimal : refusés.', v_state;
end $$;


-- --- 8. OUVRIR — positifs, et B-8 tenue par la fonction -----------------------
do $$
declare
  v_a  uuid;
  v_b  uuid;
  v_no text;
begin
  perform pg_temp.agir_comme('caissier_a');
  v_a := public.open_pos_session(pg_temp.id_de('caisse1'), 50000);
  insert into recette_pos values ('session_a', v_a);

  select session_no into v_no from public.pos_sessions where id = v_a;
  if v_no !~ ('^SES-' || extract(year from (now() at time zone 'Indian/Comoro'))::int || '-\d{6}$') then
    raise exception 'Numéro de session inattendu : %', v_no;
  end if;

  if (select cashier_id from public.pos_sessions where id = v_a) <> pg_temp.id_de('caissier_a')
     or (select status from public.pos_sessions where id = v_a) <> 'OPEN' then
    raise exception 'La session ne naît pas ouverte, au nom de son caissier.';
  end if;

  -- B-8 : A ne tient qu'une session, même s'il existe une autre caisse.
  begin
    perform public.open_pos_session(pg_temp.id_de('caisse2'), 0);
    raise exception 'ÉCHEC : un utilisateur a ouvert deux sessions (B-8).';
  exception when check_violation then null;
  end;

  -- B-8 : la caisse 1 n'a qu'une session ouverte.
  perform pg_temp.agir_comme('caissier_b');
  begin
    perform public.open_pos_session(pg_temp.id_de('caisse1'), 10000);
    raise exception 'ÉCHEC : deux sessions ouvertes sur la même caisse (B-8).';
  exception when check_violation then null;
  end;

  -- Fond négatif ou absent : refusé.
  begin
    perform public.open_pos_session(pg_temp.id_de('caisse2'), -1);
    raise exception 'ÉCHEC : un fond de caisse négatif a été accepté.';
  exception when check_violation then null;
  end;
  begin
    perform public.open_pos_session(pg_temp.id_de('caisse2'), null);
    raise exception 'ÉCHEC : une session sans fond de caisse a été ouverte.';
  exception when check_violation then null;
  end;

  v_b := public.open_pos_session(pg_temp.id_de('caisse2'), 30000);
  insert into recette_pos values ('session_b', v_b);

  -- Le planning n'ouvre pas ; le profil minimal non plus.
  perform pg_temp.agir_comme('planning');
  begin
    perform public.open_pos_session(pg_temp.id_de('caisse2'), 0);
    raise exception 'ÉCHEC : pos.sessions.view a ouvert une session.';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.agir_comme('minimal');
  begin
    perform public.open_pos_session(pg_temp.id_de('caisse2'), 0);
    raise exception 'ÉCHEC : le profil minimal a ouvert une session.';
  exception when insufficient_privilege then null;
  end;

  raise notice '[OK] 8. Deux sessions ouvertes (%) ; seconde session par caisse et par utilisateur refusées.', v_no;
end $$;


-- --- 9. 🟥 ÉCRITURES DIRECTES SUR LES SESSIONS — refusées ---------------------
do $$
begin
  perform pg_temp.agir_comme('caissier_a');

  begin
    insert into public.pos_sessions (session_no, register_id, cashier_id)
    values ('SES-FORGEE', pg_temp.id_de('caisse2'), pg_temp.id_de('caissier_a'));
    raise exception 'ÉCHEC : une session est née par écriture directe.';
  exception when insufficient_privilege or unique_violation then null;
  end;

  -- Clôturer par PATCH, sans montant compté : refusé.
  begin
    update public.pos_sessions set status = 'CLOSED', closed_at = now()
    where id = pg_temp.id_de('session_a');
    raise exception 'ÉCHEC : une session a été close par écriture directe.';
  exception when insufficient_privilege then null;
  end;

  -- Réécrire le fond de caisse : refusé.
  begin
    update public.pos_session_amounts set opening_float = 0
    where session_id = pg_temp.id_de('session_a');
    raise exception 'ÉCHEC : le fond de caisse a été réécrit.';
  exception when insufficient_privilege or check_violation then null;
  end;

  -- Poser des montants à une autre session : refusé.
  begin
    insert into public.pos_session_amounts (session_id, cashier_id, opening_float)
    values (pg_temp.id_de('session_b'), pg_temp.id_de('caissier_a'), 1);
    raise exception 'ÉCHEC : des montants ont été posés par écriture directe.';
  exception when insufficient_privilege or foreign_key_violation or unique_violation then null;
  end;

  if (select status from public.pos_sessions where id = pg_temp.id_de('session_a')) <> 'OPEN'
     or (select opening_float from public.pos_session_amounts where session_id = pg_temp.id_de('session_a')) <> 50000 then
    raise exception 'ÉCHEC : une écriture directe a laissé une trace.';
  end if;

  raise notice '[OK] 9. Insertion, clôture par PATCH, fond réécrit, montants forgés : refusés par la base.';
end $$;


-- --- 10. 🟥 B-13 — QUI VOIT QUELS MONTANTS ------------------------------------
do $$
declare
  v_n   int;
  v_exp bigint;
begin
  -- LE CAISSIER A — voit les DEUX sessions (anti-vacuité), SES montants seulement.
  perform pg_temp.agir_comme('caissier_a');
  select count(*) into v_n from public.pos_sessions
  where id in (pg_temp.id_de('session_a'), pg_temp.id_de('session_b'));
  if v_n <> 2 then
    raise exception 'Anti-vacuité : le caissier A devrait voir les deux sessions (%).', v_n;
  end if;

  if not exists (select 1 from public.pos_session_amounts where session_id = pg_temp.id_de('session_a')) then
    raise exception 'ÉCHEC B-13 : le caissier A ne voit pas SES montants.';
  end if;
  if exists (select 1 from public.pos_session_amounts where session_id = pg_temp.id_de('session_b')) then
    raise exception 'ÉCHEC B-13 : le caissier A voit les montants du caissier B.';
  end if;
  if public.pos_session_expected(pg_temp.id_de('session_a')) <> 50000 then
    raise exception 'Le théorique de A devrait valoir son fond de caisse.';
  end if;
  if public.pos_session_expected(pg_temp.id_de('session_b')) is not null then
    raise exception 'ÉCHEC B-13 : la fonction dérivée ouvre au caissier A le théorique de B.';
  end if;

  -- LE CAISSIER B — symétrique.
  perform pg_temp.agir_comme('caissier_b');
  if exists (select 1 from public.pos_session_amounts where session_id = pg_temp.id_de('session_a'))
     or not exists (select 1 from public.pos_session_amounts where session_id = pg_temp.id_de('session_b')) then
    raise exception 'ÉCHEC B-13 : le caissier B ne voit pas exactement ses montants.';
  end if;

  -- LE PLANNING — voit les sessions (anti-vacuité), AUCUN montant.
  perform pg_temp.agir_comme('planning');
  select count(*) into v_n from public.pos_sessions
  where id in (pg_temp.id_de('session_a'), pg_temp.id_de('session_b'));
  if v_n <> 2 then
    raise exception 'Anti-vacuité : le planning devrait voir les deux sessions (%).', v_n;
  end if;
  if exists (select 1 from public.pos_session_amounts) then
    raise exception 'ÉCHEC : pos.sessions.view ouvre des montants.';
  end if;
  v_exp := public.pos_session_expected(pg_temp.id_de('session_a'));
  if v_exp is not null then
    raise exception 'ÉCHEC : le planning obtient un théorique (%), au lieu de NULL.', v_exp;
  end if;
  if exists (select 1 from public.pos_registers) then
    raise exception 'ÉCHEC : pos.sessions.view ouvre les caisses.';
  end if;

  -- LE RESPONSABLE — voit tous les montants.
  perform pg_temp.agir_comme('responsable');
  select count(*) into v_n from public.pos_session_amounts
  where session_id in (pg_temp.id_de('session_a'), pg_temp.id_de('session_b'));
  if v_n <> 2 then
    raise exception 'ÉCHEC : pos.sessions.amounts.view ne voit pas tous les montants (%).', v_n;
  end if;

  -- LE PROFIL MINIMAL — rien.
  perform pg_temp.agir_comme('minimal');
  if exists (select 1 from public.pos_sessions) or exists (select 1 from public.pos_session_amounts) then
    raise exception 'ÉCHEC : le profil minimal lit des sessions ou des montants.';
  end if;
  begin
    perform public.pos_session_expected(pg_temp.id_de('session_a'));
    raise exception 'ÉCHEC : le profil minimal interroge le théorique.';
  exception when insufficient_privilege then null;
  end;

  raise notice '[OK] 10. B-13 : A voit les siens et pas ceux de B, et réciproquement ; view seul : aucun montant ; amounts.view : tous.';
end $$;


-- --- 11. LA CAISSE NE BOUGE PAS PENDANT UNE SESSION OUVERTE -------------------
do $$
begin
  perform pg_temp.agir_comme('gestionnaire');

  begin
    perform public.set_pos_register_active(pg_temp.id_de('caisse1'), false, 'Recette');
    raise exception 'ÉCHEC : une caisse a été désactivée pendant une session ouverte.';
  exception when check_violation then null;
  end;

  begin
    perform public.update_pos_register(pg_temp.id_de('caisse1'), 'Comptoir Moroni (recette)',
                                       pg_temp.id_de('cash2'), 'Moroni');
    raise exception 'ÉCHEC : le compte d''une caisse a changé pendant une session ouverte.';
  exception when check_violation then null;
  end;

  -- Le libellé, lui, se modifie librement.
  perform public.update_pos_register(pg_temp.id_de('caisse1'), 'Comptoir Moroni — rénové',
                                     pg_temp.id_de('cash'), 'Moroni');
  if (select label from public.pos_registers where id = pg_temp.id_de('caisse1')) <> 'Comptoir Moroni — rénové' then
    raise exception 'Le libellé d''une caisse ne s''est pas modifié.';
  end if;

  raise notice '[OK] 11. Désactivation et changement de compte refusés pendant la session ; libellé modifiable.';
end $$;


-- --- 12. CLÔTURER — B-9 -------------------------------------------------------
create temporary table recette_tresorerie (n bigint) on commit drop;
grant select, insert on recette_tresorerie to authenticated;
reset role;
insert into recette_tresorerie select count(*) from public.treasury_entries;
set local role authenticated;

do $$
declare
  v_var bigint;
begin
  -- Le planning ne clôture pas.
  perform pg_temp.agir_comme('planning');
  begin
    perform public.close_pos_session(pg_temp.id_de('session_a'), 50000, null);
    raise exception 'ÉCHEC : pos.sessions.view a clôturé une session.';
  exception when insufficient_privilege then null;
  end;

  perform pg_temp.agir_comme('caissier_a');

  -- Montant compté obligatoire.
  begin
    perform public.close_pos_session(pg_temp.id_de('session_a'), null, null);
    raise exception 'ÉCHEC : une session a été close sans montant compté.';
  exception when check_violation then null;
  end;
  begin
    perform public.close_pos_session(pg_temp.id_de('session_a'), -5, null);
    raise exception 'ÉCHEC : un montant compté négatif a été accepté.';
  exception when check_violation then null;
  end;

  -- Q-2 : A ne clôt pas la session de B sans voir ses montants.
  begin
    perform public.close_pos_session(pg_temp.id_de('session_b'), 30000, null);
    raise exception 'ÉCHEC : un caissier a clôturé la session d''un autre sans amounts.view.';
  exception when insufficient_privilege then null;
  end;

  -- 🟥 B-9 : un manque de 2 000 ne bloque PAS la clôture.
  perform public.close_pos_session(pg_temp.id_de('session_a'), 48000, '  Manque constaté au comptage  ');

  if (select status from public.pos_sessions where id = pg_temp.id_de('session_a')) <> 'CLOSED'
     or (select closed_by from public.pos_sessions where id = pg_temp.id_de('session_a')) <> pg_temp.id_de('caissier_a')
     or (select closing_note from public.pos_sessions where id = pg_temp.id_de('session_a')) <> 'Manque constaté au comptage' then
    raise exception 'La clôture n''a pas produit l''état attendu.';
  end if;

  v_var := public.pos_session_variance(pg_temp.id_de('session_a'));
  if v_var is distinct from -2000::bigint then
    raise exception 'Écart attendu : -2000, obtenu %.', v_var;
  end if;

  -- Une session close ne se rouvre pas, ne se reclôt pas.
  begin
    perform public.close_pos_session(pg_temp.id_de('session_a'), 50000, null);
    raise exception 'ÉCHEC : une session close a été reclose.';
  exception when check_violation then null;
  end;

  -- Ouverte, la session de B n'a pas d'écart : NULL, jamais 0.
  perform pg_temp.agir_comme('responsable');
  if public.pos_session_variance(pg_temp.id_de('session_b')) is not null then
    raise exception 'Une session ouverte porte un écart.';
  end if;

  -- Q-2 : le responsable clôt la session de B — un excédent de 5 000.
  perform public.close_pos_session(pg_temp.id_de('session_b'), 35000, null);
  if public.pos_session_variance(pg_temp.id_de('session_b')) <> 5000
     or (select closed_by from public.pos_sessions where id = pg_temp.id_de('session_b')) <> pg_temp.id_de('responsable') then
    raise exception 'La clôture par le responsable n''a pas produit l''écart ou l''auteur attendu.';
  end if;

  -- Le caissier A voit son écart, pas celui de B.
  perform pg_temp.agir_comme('caissier_a');
  if public.pos_session_variance(pg_temp.id_de('session_a')) <> -2000
     or public.pos_session_variance(pg_temp.id_de('session_b')) is not null then
    raise exception 'ÉCHEC B-13 : les écarts ne suivent pas la lecture des montants.';
  end if;

  raise notice '[OK] 12. B-9 : compté obligatoire, manque de 2 000 et excédent de 5 000 constatés sans blocage ; aucune réouverture.';
end $$;

reset role;

do $$
declare
  v_avant bigint := (select n from recette_tresorerie);
begin
  -- 🟥 B-9 : AUCUNE écriture d'ajustement.
  if (select count(*) from public.treasury_entries) <> v_avant then
    raise exception 'ÉCHEC B-9 : la clôture a mouvementé la trésorerie.';
  end if;

  -- Le journal : ouverture CREATE, clôture VALIDATE, écart constaté.
  if not exists (
    select 1 from public.audit_log
    where entity_type = 'pos_sessions' and entity_id = pg_temp.id_de('session_a')::text
      and action = 'CREATE' and module_code = 'pos'
  ) or not exists (
    select 1 from public.audit_log
    where entity_type = 'pos_sessions' and entity_id = pg_temp.id_de('session_a')::text
      and action = 'VALIDATE'
  ) then
    raise exception 'Le journal ne porte pas l''ouverture (CREATE) et la clôture (VALIDATE) de la session.';
  end if;

  if not exists (
    select 1 from public.audit_log
    where entity_type = 'pos_session_amounts' and entity_id = pg_temp.id_de('session_a')::text
      and action = 'VALIDATE'
      and (after_data ->> 'counted_amount')::bigint = 48000
      and (after_data ->> 'expected_amount')::bigint = 50000
      and (after_data ->> 'variance')::bigint = -2000
  ) then
    raise exception 'ÉCHEC B-9 : l''écart constaté n''est pas journalisé avec la clôture.';
  end if;

  -- Le journal de la SESSION ne porte aucun montant.
  if exists (
    select 1 from public.audit_log
    where entity_type = 'pos_sessions'
      and (after_data ? 'opening_float' or after_data ? 'counted_amount' or after_data ? 'variance')
  ) then
    raise exception 'Un événement de session porte un montant : le journal l''ouvrirait à pos.sessions.view.';
  end if;

  raise notice '[OK] 13. Aucune écriture de trésorerie ; journal CREATE/VALIDATE, écart -2 000 constaté sur les montants seulement.';
end $$;


-- Le contrôle différé de la migration 108 ne s'exécute qu'à la validation — que
-- cette recette, annulée, n'atteint jamais. On le force ICI : les ouvertures et
-- clôtures LÉGITIMES des blocs 8 à 12 doivent le satisfaire (anti-vacuité du
-- refus éprouvé au bloc 15).
set constraints public.pos_sessions_amounts_consistent immediate;
set constraints public.pos_sessions_amounts_consistent deferred;
do $$ begin raise notice '[OK] 13 bis. Les ouvertures et clôtures légitimes satisfont le contrôle différé.'; end $$;


-- --- 14. UNE SESSION CLOSE EST FIGÉE — même par le chemin des fonctions ------
do $$
begin
  -- Sans identité : la clé de service, qui contourne RLS mais pas les gardes.
  perform pg_temp.redevenir_service();

  -- On pose le drapeau comme le ferait une fonction : seules les gardes restent.
  perform set_config('adikom.pos_session', 'on', true);

  begin
    update public.pos_sessions set status = 'OPEN', closed_at = null, closed_by = null, closing_note = null
    where id = pg_temp.id_de('session_a');
    raise exception 'ÉCHEC : une session close a été rouverte.';
  exception when check_violation then null;
  end;

  begin
    update public.pos_session_amounts set counted_amount = 50000
    where session_id = pg_temp.id_de('session_a');
    raise exception 'ÉCHEC : le montant compté a été réécrit.';
  exception when check_violation then null;
  end;

  begin
    update public.pos_sessions set closing_note = 'Réécrite'
    where id = pg_temp.id_de('session_a');
    raise exception 'ÉCHEC : l''observation d''une session close a été réécrite.';
  exception when check_violation then null;
  end;

  -- 🟥 B-8 EN BASE : même en contournant la fonction, l'index refuse.
  perform public.open_pos_session(pg_temp.id_de('caisse1'), 0);  -- service : refusé, sans caissier
  raise exception 'ÉCHEC : une session a été ouverte sans utilisateur authentifié.';
exception when check_violation then
  perform set_config('adikom.pos_session', 'off', true);
  raise notice '[OK] 14. Réouverture, compté et observation réécrits : refusés ; aucune session sans caissier.';
end $$;

do $$
declare
  v_s1 uuid := gen_random_uuid();
  v_s2 uuid := gen_random_uuid();
begin
  perform set_config('adikom.pos_session', 'on', true);
  perform pg_temp.agir_comme('caissier_a');

  insert into public.pos_sessions (id, session_no, register_id, cashier_id)
  values (v_s1, 'SES-RECETTE-1', pg_temp.id_de('caisse1'), pg_temp.id_de('caissier_a'));

  -- Même caissier, autre caisse : l'index par utilisateur refuse.
  begin
    insert into public.pos_sessions (id, session_no, register_id, cashier_id)
    values (v_s2, 'SES-RECETTE-2', pg_temp.id_de('caisse2'), pg_temp.id_de('caissier_a'));
    raise exception 'ÉCHEC B-8 : l''index n''empêche pas deux sessions ouvertes par utilisateur.';
  exception when unique_violation then null;
  end;

  -- Même caisse, autre caissier : l'index par caisse refuse.
  perform pg_temp.agir_comme('caissier_b');
  begin
    insert into public.pos_sessions (id, session_no, register_id, cashier_id)
    values (v_s2, 'SES-RECETTE-2', pg_temp.id_de('caisse1'), pg_temp.id_de('caissier_b'));
    raise exception 'ÉCHEC B-8 : l''index n''empêche pas deux sessions ouvertes par caisse.';
  exception when unique_violation then null;
  end;

  -- Contrôle différé : une session sans fond de caisse est refusée à la validation.
  begin
    set constraints public.pos_sessions_amounts_consistent immediate;
    raise exception 'ÉCHEC : une session sans montants a passé le contrôle différé.';
  exception when check_violation then null;
  end;

  perform set_config('adikom.pos_session', 'off', true);

  -- La session forgée est retirée par le rôle de service, seul à le pouvoir
  -- (`fn_forbid_delete`) : elle occuperait sinon la caisse 1 et le caissier A.
  perform pg_temp.redevenir_service();
  delete from public.pos_sessions where id = v_s1;

  raise notice '[OK] 15. B-8 tenue par les index même hors fonction ; session sans fond de caisse refusée au contrôle différé.';
end $$;

set constraints all deferred;

-- Aucune session forgée ne survit au bloc précédent.
do $$
begin
  if exists (select 1 from public.pos_sessions where session_no like 'SES-RECETTE-%') then
    raise exception 'Une session forgée a survécu à son bloc.';
  end if;
end $$;


-- --- 16. « QUI ÉTAIT EN CAISSE LE J ENTRE 10H00 ET 11H30 ? » ----------------
--
-- Le décor est daté d'HIER : il est REMIS EN PLACE comme le ferait une
-- restauration (`is_restoring()`), seul chemin qui permette d'écrire une heure
-- d'ouverture passée. Quatre sessions, dont deux aux BORNES exactes.
do $$
declare
  v_j  date := (now() at time zone 'Indian/Comoro')::date - 1;
  v_at text := 'Indian/Comoro';
  v_ids uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
begin
  perform pg_temp.redevenir_service();
  perform set_config('adikom.restore', 'on', true);

  insert into public.pos_sessions (id, session_no, register_id, cashier_id, status, opened_at, closed_at)
  values
    -- 08h00 → 10h00 : close à 10h00 PILE — n'était plus en caisse.
    (v_ids[1], 'SES-HIST-1', pg_temp.id_de('caisse1'), pg_temp.id_de('caissier_a'), 'CLOSED',
     (v_j + time '08:00') at time zone v_at, (v_j + time '10:00') at time zone v_at),
    -- 10h05 → 11h00 : en plein dans la fenêtre.
    (v_ids[2], 'SES-HIST-2', pg_temp.id_de('caisse1'), pg_temp.id_de('caissier_b'), 'CLOSED',
     (v_j + time '10:05') at time zone v_at, (v_j + time '11:00') at time zone v_at),
    -- 09h00 → 12h00 : couvre toute la fenêtre, sur l'autre caisse.
    (v_ids[3], 'SES-HIST-3', pg_temp.id_de('caisse2'), pg_temp.id_de('caissier_a'), 'CLOSED',
     (v_j + time '09:00') at time zone v_at, (v_j + time '12:00') at time zone v_at),
    -- 11h30 → 13h00 : ouverte à 11h30 PILE — n'était pas encore en caisse.
    (v_ids[4], 'SES-HIST-4', pg_temp.id_de('caisse1'), pg_temp.id_de('caissier_a'), 'CLOSED',
     (v_j + time '11:30') at time zone v_at, (v_j + time '13:00') at time zone v_at);

  insert into public.pos_session_amounts (session_id, cashier_id, opening_float, counted_amount)
  select s.id, s.cashier_id, 0, 0 from public.pos_sessions s where s.id = any (v_ids);

  perform set_config('adikom.restore', 'off', true);

  insert into recette_pos values
    ('hist1', v_ids[1]), ('hist2', v_ids[2]), ('hist3', v_ids[3]), ('hist4', v_ids[4]);

  raise notice '[OK] 16. Décor daté d''hier : quatre sessions, dont deux aux bornes exactes de la fenêtre.';
end $$;

set local role authenticated;

do $$
declare
  v_j     date := (now() at time zone 'Indian/Comoro')::date - 1;
  v_from  timestamptz := (v_j + time '10:00') at time zone 'Indian/Comoro';
  v_to    timestamptz := (v_j + time '11:30') at time zone 'Indian/Comoro';
  v_found uuid[];
begin
  -- Le PLANNING pose la question — c'est sa raison d'être (Plan 02 §10.2).
  perform pg_temp.agir_comme('planning');

  select array_agg(s.id order by s.opened_at) into v_found
  from public.pos_sessions_in_window(v_from, v_to) s
  where s.id in (pg_temp.id_de('hist1'), pg_temp.id_de('hist2'), pg_temp.id_de('hist3'), pg_temp.id_de('hist4'));

  if v_found is distinct from array[pg_temp.id_de('hist3'), pg_temp.id_de('hist2')] then
    raise exception 'Réponse inattendue à « qui était en caisse entre 10h00 et 11h30 » : %', v_found;
  end if;

  -- Filtrée par caisse : seule la session 2 était à la caisse 1.
  select array_agg(s.id) into v_found
  from public.pos_sessions_in_window(v_from, v_to, pg_temp.id_de('caisse1')) s
  where s.id in (pg_temp.id_de('hist1'), pg_temp.id_de('hist2'), pg_temp.id_de('hist3'), pg_temp.id_de('hist4'));
  if v_found is distinct from array[pg_temp.id_de('hist2')] then
    raise exception 'Filtre par caisse inattendu : %', v_found;
  end if;

  -- Filtrée par caissier : A n'y était qu'à la caisse 2.
  select array_agg(s.id) into v_found
  from public.pos_sessions_in_window(v_from, v_to, null, pg_temp.id_de('caissier_a')) s
  where s.id in (pg_temp.id_de('hist1'), pg_temp.id_de('hist2'), pg_temp.id_de('hist3'), pg_temp.id_de('hist4'));
  if v_found is distinct from array[pg_temp.id_de('hist3')] then
    raise exception 'Filtre par caissier inattendu : %', v_found;
  end if;

  -- Une session ENCORE OUVERTE recouvre toute fenêtre postérieure à son ouverture.
  -- (aucune n'est ouverte ici : les deux du jour sont closes — on le vérifie)
  -- Sur les caisses de la recette seulement : une vraie session ouverte ailleurs
  -- dans la base n'est pas un échec de la recette.
  if exists (select 1 from public.pos_sessions_in_window(now(), now() + interval '1 hour') s
             where s.status = 'OPEN'
               and s.register_id in (pg_temp.id_de('caisse1'), pg_temp.id_de('caisse2'))) then
    raise exception 'Une session ouverte a survécu à la clôture.';
  end if;

  -- Une fenêtre inversée est refusée ; le profil minimal ne pose pas la question.
  begin
    perform public.pos_sessions_in_window(v_to, v_from);
    raise exception 'ÉCHEC : une fenêtre inversée a été acceptée.';
  exception when check_violation then null;
  end;

  perform pg_temp.agir_comme('minimal');
  begin
    perform public.pos_sessions_in_window(v_from, v_to);
    raise exception 'ÉCHEC : le profil minimal sait qui était en caisse.';
  exception when insufficient_privilege then null;
  end;

  raise notice '[OK] 17. Entre 10h00 et 11h30 : sessions 3 puis 2 ; bornes 10h00 et 11h30 exclues ; filtres caisse et caissier exacts.';
end $$;

reset role;

-- L'index GiST sert la question (planificateur contraint, anti-vacuité de l'index).
do $$
declare
  v_plan text := '';
  v_line text;
begin
  set local enable_seqscan = off;
  for v_line in execute
    'explain select * from public.pos_sessions s
      where tstzrange(s.opened_at, coalesce(s.closed_at, ''infinity''::timestamptz), ''[)'')
            && tstzrange(now() - interval ''1 day'', now(), ''[)'')'
  loop
    v_plan := v_plan || v_line || ' ';
  end loop;
  if v_plan not like '%pos_sessions_period_gist_idx%' then
    raise exception 'L''index GiST de période n''est pas employé : %', v_plan;
  end if;
  raise notice '[OK] 18. L''index GiST de période sert la question.';
end $$;


-- --- 19. LA CAISSE SE DÉSACTIVE UNE FOIS LA SESSION CLOSE ---------------------
set local role authenticated;

do $$
begin
  perform pg_temp.agir_comme('gestionnaire');
  perform public.set_pos_register_active(pg_temp.id_de('caisse1'), false, 'Fermeture du comptoir');

  perform pg_temp.agir_comme('caissier_a');
  begin
    perform public.open_pos_session(pg_temp.id_de('caisse1'), 0);
    raise exception 'ÉCHEC : une session a été ouverte sur une caisse inactive.';
  exception when check_violation then null;
  end;

  perform pg_temp.agir_comme('gestionnaire');
  perform public.set_pos_register_active(pg_temp.id_de('caisse1'), true, 'Réouverture');

  perform pg_temp.agir_comme('caissier_a');
  insert into recette_pos values ('session_a2', public.open_pos_session(pg_temp.id_de('caisse1'), 0));

  -- Le caissier ne désactive pas une caisse.
  begin
    perform public.set_pos_register_active(pg_temp.id_de('caisse2'), false, null);
    raise exception 'ÉCHEC : un caissier a désactivé une caisse.';
  exception when insufficient_privilege then null;
  end;

  raise notice '[OK] 19. Caisse désactivée après clôture, session refusée, réactivée, rouverte.';
end $$;

reset role;


-- --- 20. LE COMPTE ADOSSÉ RESTE UNE CAISSE ------------------------------------
do $$
begin
  perform pg_temp.redevenir_service();

  begin
    update public.financial_accounts set kind = 'BANK' where id = pg_temp.id_de('cash');
    raise exception 'ÉCHEC : le compte adossé à une caisse est devenu bancaire.';
  exception when foreign_key_violation then null;
  end;

  -- Un compte devenu inactif interdit d'ouvrir — la garde lit la vérité.
  perform public.set_financial_account_status(pg_temp.id_de('cash2'), 'INACTIVE', 'Recette');
  perform pg_temp.agir_comme('caissier_b');
  begin
    perform public.open_pos_session(pg_temp.id_de('caisse2'), 0);
    raise exception 'ÉCHEC : une session a été ouverte sur un compte inactif.';
  exception when check_violation then null;
  end;
  perform pg_temp.redevenir_service();

  raise notice '[OK] 20. Compte adossé : type CASH tenu par la clé, compte inactif refusé à l''ouverture.';
end $$;


-- --- 21. RIEN NE S'EFFACE -----------------------------------------------------
do $$
begin
  perform pg_temp.agir_comme('responsable');
  begin
    delete from public.pos_sessions where id = pg_temp.id_de('session_a');
    raise exception 'ÉCHEC : une session a été supprimée.';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.redevenir_service();

  raise notice '[OK] 21. Une session ne se supprime pas.';
end $$;


-- --- 22. SAUVEGARDE -----------------------------------------------------------
do $$
declare
  v_scope text[] := public.backup_scope();
begin
  if not ('pos_registers' = any (v_scope) and 'pos_sessions' = any (v_scope)
          and 'pos_session_amounts' = any (v_scope)) then
    raise exception 'Une table du point de vente manque au périmètre de sauvegarde.';
  end if;
  if not (array_position(v_scope, 'financial_accounts') < array_position(v_scope, 'pos_registers')
          and array_position(v_scope, 'pos_registers') < array_position(v_scope, 'pos_sessions')
          and array_position(v_scope, 'pos_sessions') < array_position(v_scope, 'pos_session_amounts')) then
    raise exception 'Ordre de sauvegarde invalide pour le point de vente.';
  end if;

  raise notice '[OK] 22. Sauvegarde : comptes → caisses → sessions → montants.';
end $$;


rollback;
