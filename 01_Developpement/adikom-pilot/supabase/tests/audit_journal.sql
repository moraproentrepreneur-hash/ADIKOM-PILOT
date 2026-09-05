-- =============================================================================
-- ADIKOM PILOT — Recette Journal d'activité
-- Phase 4 — Organisation, LOT 15 (Module 08 §54 · Règles métier 06 — Audit)
--
-- CE QU'ELLE ÉPROUVE
--
-- Ce que la BASE doit tenir seule, et que ni l'écran ni la recette navigateur
-- ne peuvent garantir :
--
--   · l'ABSENCE de capacité nouvelle — le lot n'en crée aucune (DEC-024) ;
--   · la COMPLÉTUDE de la cartographie des lectures : toute table portant un
--     déclencheur d'audit doit être nommée par `audit_detail_permission`, faute
--     de quoi son détail se refermerait SILENCIEUSEMENT sur le seul Super Admin ;
--   · la SINCÉRITÉ de cette cartographie : chaque capacité citée existe, et
--     aucune n'est `users.audit.*` — sinon la lecture du journal s'ouvrirait
--     elle-même le détail, et le contrôle ne contrôlerait rien ;
--   · les DROITS DE COLONNE : `before_data` et `after_data` sont hors de portée
--     de `authenticated`, et les colonnes de l'écran lui restent accordées ;
--   · l'ÉCRITURE SEULE du journal (§40, §77) — toujours vraie après le lot,
--     y compris pour le rôle de service ;
--   · les DROITS D'EXÉCUTION des trois fonctions (DEC-022) ;
--   · l'ABSENCE de ce que le lot ne fait pas : aucune table, aucune policy
--     d'écriture sur `audit_log`, aucune colonne ajoutée.
--
-- Exécution :
--   npm run db:verify:audit
--
-- Ce script s'exécute avec le rôle de la chaîne de connexion, qui contourne RLS
-- et pour lequel `current_actor()` vaut NULL : aucune capacité n'y est détenue.
-- Il contrôle donc la STRUCTURE, les DROITS et la COHÉRENCE ; l'effet des
-- capacités s'éprouve avec de vraies sessions, dans `verify:audit`.
--
-- AUCUNE DATE EN DUR : les bornes de période se posent sur `Indian/Comoro`
-- (DEC-025 §e).
--
-- AUCUNE ÉCRITURE DANS LE JOURNAL. La transaction est annulée en fin de script,
-- et c'est ici plus qu'ailleurs une nécessité : une entrée d'audit validée ne
-- peut PLUS JAMAIS être retirée (DEC-020, DEC-022).
-- =============================================================================

begin;


-- --- 1. AUCUNE CAPACITÉ N'EST CRÉÉE PAR CE LOT --------------------------------
--
-- `users.audit.view` et `users.audit.export` existent depuis la migration 007.
-- Le lot les emploie ; il n'en invente pas une troisième.
do $$
declare
  v_total int;
  v_lot   int;
begin
  select count(*)::int into v_total from public.permissions;

  if v_total <> 170 then
    raise exception 'Le catalogue compte % capacités, 170 attendues.', v_total;
  end if;

  select count(*)::int into v_lot
  from public.permissions
  where code in ('users.audit.view', 'users.audit.export');

  if v_lot <> 2 then
    raise exception 'Les deux capacités du journal ne sont pas au catalogue (% trouvée(s)).', v_lot;
  end if;

  -- Ce qui n'existe pas, et ne doit pas exister. Le journal ne produit aucun
  -- document imprimable, et le détail avant/après n'a PAS sa propre capacité :
  -- il emprunte celle de l'objet concerné (DEC-038). En créer une ici serait
  -- créer un droit d'office, et surtout un droit transversal sur toutes les
  -- données du SaaS.
  if exists (
    select 1 from public.permissions
    where code in (
      'users.audit.download', 'users.audit.print', 'users.audit.detail.view',
      'users.audit.archive', 'users.audit.delete', 'users.audit.purge'
    )
  ) then
    raise exception 'Une capacité a été créée pour une fonctionnalité que le lot ne livre pas.';
  end if;

  raise notice '[OK] 1. Catalogue à 170 : le lot n''en crée aucune, et ses deux existent.';
end $$;


-- --- 2. LA CARTOGRAPHIE DES LECTURES EST COMPLÈTE ----------------------------
--
-- LE CONTRÔLE CENTRAL DU LOT.
--
-- Une table auditée dont personne n'aurait pensé à ajouter la ligne renvoie
-- NULL, donc « Super Admin uniquement ». Le défaut est SÛR — il referme au lieu
-- d'ouvrir — mais il est silencieux : un responsable habilité à lire les
-- factures verrait « détail non consultable » sans que rien ne l'explique.
--
-- La liste des tables auditées n'est pas recopiée : elle est LUE dans le
-- catalogue système, à partir des déclencheurs réellement posés. Une table
-- auditée demain fera donc échouer ce contrôle tant qu'elle n'aura pas sa
-- ligne — ce qui est exactement le rappel attendu.
do $$
declare
  v_missing text;
begin
  select string_agg(t.relname, ', ' order by t.relname)
    into v_missing
  from (
    select distinct c.relname
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = tg.tgfoid
    where not tg.tgisinternal
      and n.nspname = 'public'
      and p.proname in ('fn_audit_row', 'fn_audit_permission_change', 'fn_audit_price_change')
  ) t
  where public.audit_detail_permission(t.relname) is null;

  if v_missing is not null then
    raise exception 'Tables auditées absentes de la cartographie des lectures : %', v_missing;
  end if;

  raise notice '[OK] 2. Toute table auditée sait quelle capacité ouvre son détail.';
end $$;


-- --- 3. LA CARTOGRAPHIE NE CITE QUE DES CAPACITÉS RÉELLES --------------------
--
-- Une capacité mal orthographiée ne lève aucune erreur : `has_permission` la
-- refuse simplement toujours. Le détail se refermerait donc pour tout le monde
-- sauf le Super Admin, sans le moindre signal.
do $$
declare
  v_bad   text;
  v_self  text;
begin
  select string_agg(distinct m.code, ', ')
    into v_bad
  from (
    select distinct c.relname as entity
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = tg.tgfoid
    where not tg.tgisinternal
      and n.nspname = 'public'
      and p.proname in ('fn_audit_row', 'fn_audit_permission_change', 'fn_audit_price_change')
  ) t
  cross join lateral (select public.audit_detail_permission(t.entity) as code) m
  where m.code is not null
    and not exists (select 1 from public.permissions p where p.code = m.code);

  if v_bad is not null then
    raise exception 'La cartographie cite des capacités absentes du catalogue : %', v_bad;
  end if;

  -- Le détail ne doit JAMAIS s'ouvrir par la lecture du journal elle-même :
  -- ce serait rendre `users.audit.view` transversale à tout le SaaS.
  select string_agg(distinct m.code, ', ')
    into v_self
  from (
    select distinct c.relname as entity
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = tg.tgfoid
    where not tg.tgisinternal
      and n.nspname = 'public'
      and p.proname in ('fn_audit_row', 'fn_audit_permission_change', 'fn_audit_price_change')
  ) t
  cross join lateral (select public.audit_detail_permission(t.entity) as code) m
  where m.code like 'users.audit.%';

  if v_self is not null then
    raise exception 'La cartographie s''ouvre elle-même : %', v_self;
  end if;

  raise notice '[OK] 3. Chaque capacité citée existe, et aucune n''est celle du journal.';
end $$;


-- --- 4. LE DÉTAIL EST HORS DE PORTÉE DE L'API --------------------------------
--
-- RLS filtre des LIGNES, jamais des COLONNES. Tant que `authenticated` détient
-- le SELECT de table, `select=before_data` reste une requête valide pour qui
-- franchit la policy. Seul le droit de colonne referme cette porte.
do $$
begin
  if has_column_privilege('authenticated', 'public.audit_log', 'before_data', 'SELECT') then
    raise exception 'before_data reste lisible par appel direct à l''API.';
  end if;

  if has_column_privilege('authenticated', 'public.audit_log', 'after_data', 'SELECT') then
    raise exception 'after_data reste lisible par appel direct à l''API.';
  end if;

  -- Et l'écran doit continuer de fonctionner : refermer trop serait refermer
  -- le journal entier.
  if not (
    has_column_privilege('authenticated', 'public.audit_log', 'id', 'SELECT')
    and has_column_privilege('authenticated', 'public.audit_log', 'occurred_at', 'SELECT')
    and has_column_privilege('authenticated', 'public.audit_log', 'actor_id', 'SELECT')
    and has_column_privilege('authenticated', 'public.audit_log', 'actor_label', 'SELECT')
    and has_column_privilege('authenticated', 'public.audit_log', 'action', 'SELECT')
    and has_column_privilege('authenticated', 'public.audit_log', 'result', 'SELECT')
    and has_column_privilege('authenticated', 'public.audit_log', 'module_code', 'SELECT')
    and has_column_privilege('authenticated', 'public.audit_log', 'entity_type', 'SELECT')
    and has_column_privilege('authenticated', 'public.audit_log', 'entity_id', 'SELECT')
    and has_column_privilege('authenticated', 'public.audit_log', 'entity_label', 'SELECT')
    and has_column_privilege('authenticated', 'public.audit_log', 'changed_fields', 'SELECT')
    and has_column_privilege('authenticated', 'public.audit_log', 'reason', 'SELECT')
    and has_column_privilege('authenticated', 'public.audit_log', 'comment', 'SELECT')
  ) then
    raise exception 'Une colonne nécessaire à l''écran a été retirée à authenticated.';
  end if;

  -- `anon` n'a jamais rien eu, et n'a rien regagné au passage.
  if has_column_privilege('anon', 'public.audit_log', 'id', 'SELECT') then
    raise exception 'Le journal est devenu lisible sans compte.';
  end if;

  raise notice '[OK] 4. Le détail avant/après est hors de portée de l''API ; l''écran reste servi.';
end $$;


-- --- 5. LE JOURNAL RESTE EN ÉCRITURE SEULE (§40, §77) ------------------------
--
-- NON-RÉGRESSION la plus lourde du lot : le journal n'a de valeur que s'il est
-- infalsifiable. Une seule modification reste tolérée — l'anonymisation de
-- l'auteur prévue par la clé étrangère (DEC-020) — et rien d'autre.
do $$
declare
  v_id      bigint;
  v_refused boolean;
begin
  select id into v_id from public.audit_log order by id desc limit 1;

  if v_id is null then
    raise exception 'Le journal est vide : la recette ne peut rien éprouver.';
  end if;

  v_refused := false;
  begin
    update public.audit_log set reason = 'falsification' where id = v_id;
  exception when others then
    v_refused := true;
  end;
  if not v_refused then
    raise exception 'Le motif d''un événement a pu être réécrit.';
  end if;

  v_refused := false;
  begin
    update public.audit_log set action = 'CREATE' where id = v_id;
  exception when others then
    v_refused := true;
  end;
  if not v_refused then
    raise exception 'L''action d''un événement a pu être réécrite.';
  end if;

  v_refused := false;
  begin
    delete from public.audit_log where id = v_id;
  exception when others then
    v_refused := true;
  end;
  if not v_refused then
    raise exception 'Un événement a pu être supprimé — y compris par le rôle de service.';
  end if;

  raise notice '[OK] 5. Le journal reste infalsifiable : ni réécriture, ni suppression.';
end $$;


-- --- 6. AUCUNE POLICY D'ÉCRITURE SUR LE JOURNAL ------------------------------
--
-- La lecture reste conditionnée à `users.audit.view` ; l'écriture n'a aucune
-- policy, et n'en a pas besoin : elle passe par `log_audit()`, en SECURITY
-- DEFINER.
do $$
declare
  v_write int;
  v_read  text;
begin
  select count(*)::int into v_write
  from pg_policies
  where schemaname = 'public' and tablename = 'audit_log' and cmd <> 'SELECT';

  if v_write <> 0 then
    raise exception 'Une policy d''écriture a été posée sur le journal (% trouvée(s)).', v_write;
  end if;

  select qual into v_read
  from pg_policies
  where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_log_select';

  if v_read is null or v_read not like '%users.audit.view%' then
    raise exception 'La lecture du journal n''exige plus users.audit.view.';
  end if;

  raise notice '[OK] 6. Lecture sous capacité, aucune policy d''écriture.';
end $$;


-- --- 7. LES TROIS FONCTIONS SONT CE QU'ELLES DOIVENT ÊTRE --------------------
--
-- `audit_entry_detail` DOIT être SECURITY DEFINER : elle lit deux colonnes que
-- l'appelant n'a plus le droit de lire, et vérifie elle-même l'autorisation.
--
-- `audit_actors` NE DOIT PAS l'être : elle n'ouvre rien de plus que la table,
-- et la passer en DEFINER lui ferait franchir la policy — le filtre par auteur
-- révélerait alors la liste des collaborateurs à qui n'a pas le journal.
do $$
declare
  v_detail  boolean;
  v_actors  boolean;
  v_map     boolean;
begin
  select p.prosecdef into v_detail from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'audit_entry_detail';

  select p.prosecdef into v_actors from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'audit_actors';

  select p.prosecdef into v_map from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'audit_detail_permission';

  if v_detail is null or v_actors is null or v_map is null then
    raise exception 'Une des trois fonctions du lot est absente.';
  end if;

  if not v_detail then
    raise exception 'audit_entry_detail n''est pas SECURITY DEFINER : elle ne pourrait rien lire.';
  end if;

  if v_actors then
    raise exception 'audit_actors est SECURITY DEFINER : elle franchirait la policy du journal.';
  end if;

  raise notice '[OK] 7. audit_entry_detail arbitre en DEFINER ; audit_actors reste sous RLS.';
end $$;


-- --- 8. DROITS D'EXÉCUTION — DEC-022 -----------------------------------------
--
-- Un droit ne se retire pas « en général » : il se retire à chaque source qui
-- l'accorde. PostgreSQL accorde EXECUTE à PUBLIC, Supabase l'accorde à `anon`.
do $$
declare
  v_leak text := '';
begin
  if has_function_privilege('anon', 'public.audit_entry_detail(bigint)', 'EXECUTE')
  then v_leak := v_leak || 'audit_entry_detail(anon) '; end if;

  if has_function_privilege('anon', 'public.audit_actors()', 'EXECUTE')
  then v_leak := v_leak || 'audit_actors(anon) '; end if;

  if has_function_privilege('anon', 'public.audit_detail_permission(text)', 'EXECUTE')
  then v_leak := v_leak || 'audit_detail_permission(anon) '; end if;

  if v_leak <> '' then
    raise exception 'Fonctions exécutables sans compte : %', v_leak;
  end if;

  if not has_function_privilege('authenticated', 'public.audit_entry_detail(bigint)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.audit_actors()', 'EXECUTE')
  then
    raise exception 'Un compte authentifié ne peut plus lire le journal.';
  end if;

  raise notice '[OK] 8. Aucune des trois fonctions n''est atteignable sans compte.';
end $$;


-- --- 9. SANS CAPACITÉ, LE DÉTAIL SE REFUSE ------------------------------------
--
-- Le rôle de service n'a pas d'acteur : `current_actor()` vaut NULL, donc
-- `has_permission` est faux et `is_super_admin` aussi. La fonction doit refuser
-- — et refuser, ce n'est pas rendre une ligne vide.
do $$
declare
  v_id      bigint;
  v_refused boolean := false;
  v_state   text;
begin
  select id into v_id from public.audit_log order by id desc limit 1;

  begin
    perform * from public.audit_entry_detail(v_id);
  exception when others then
    v_refused := true;
    v_state := sqlstate;
  end;

  if not v_refused then
    raise exception 'Le détail s''est ouvert sans aucune capacité.';
  end if;

  if v_state <> '42501' then
    raise exception 'Le refus n''est pas un refus de droit (sqlstate %).', v_state;
  end if;

  raise notice '[OK] 9. Sans users.audit.view, le détail se refuse — et le dit.';
end $$;


-- --- 10. UN NUMÉRO INCONNU N'EST PAS UN REFUS --------------------------------
--
-- DEC-017 : une absence de donnée et une erreur ne se confondent pas. La
-- fonction ne rend aucune ligne pour un événement qui n'existe pas — mais elle
-- ne le fait qu'APRÈS avoir exigé la capacité, faute de quoi elle dirait à un
-- inconnu quels numéros existent.
do $$
declare
  v_max bigint;
begin
  select coalesce(max(id), 0) + 1000000 into v_max from public.audit_log;

  -- Sans capacité, même un numéro inexistant se refuse : l'ordre des contrôles
  -- dans la fonction est vérifié ici, pas seulement son résultat.
  begin
    perform * from public.audit_entry_detail(v_max);
    raise exception 'Un numéro inconnu a été traité sans exiger la capacité.';
  exception when sqlstate '42501' then
    null;
  end;

  raise notice '[OK] 10. La capacité est exigée avant même de chercher l''événement.';
end $$;


-- --- 11. LE FILTRE PAR RÉSULTAT EST INDEXÉ (§42, §60) ------------------------
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'audit_log' and indexname = 'audit_log_result_idx'
  ) then
    raise exception 'Le filtre par résultat n''est pas indexé.';
  end if;

  raise notice '[OK] 11. Les échecs et les refus se retrouvent par index.';
end $$;


-- --- 12. LE LOT NE CRÉE AUCUNE TABLE ET AUCUNE COLONNE ------------------------
--
-- Le journal existe depuis la migration 004. Le lot livre des écrans et des
-- gardes, pas un second stockage : deux sources de vérité de l'audit en
-- feraient une contradiction (§59).
do $$
declare
  v_extra text;
  v_cols  int;
begin
  select string_agg(table_name, ', ')
    into v_extra
  from information_schema.tables
  where table_schema = 'public'
    and table_name like 'audit%'
    and table_name <> 'audit_log';

  if v_extra is not null then
    raise exception 'Le lot a créé une table d''audit supplémentaire : %', v_extra;
  end if;

  select count(*)::int into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'audit_log';

  -- Les 17 colonnes de la migration 004, ni plus ni moins.
  if v_cols <> 17 then
    raise exception 'Le journal compte % colonnes, 17 attendues.', v_cols;
  end if;

  raise notice '[OK] 12. Aucune table, aucune colonne : le journal reste unique.';
end $$;


-- --- 13. LES AUTEURS DU FILTRE SONT NOMMÉS ------------------------------------
--
-- §43 : filtrer par utilisateur. Un auteur sans nom n'est pas filtrable, et un
-- compte supprimé doit rester nommé — c'est la raison d'être d'`actor_label`
-- (migration 004).
do $$
declare
  v_anon int;
  v_all  int;
begin
  select count(*)::int into v_all from public.audit_actors();

  select count(*)::int into v_anon
  from public.audit_actors()
  where actor_id is null or actor_label is null or btrim(actor_label) = '';

  if v_anon <> 0 then
    raise exception '% auteur(s) du filtre sont sans identité.', v_anon;
  end if;

  if v_all = 0 then
    raise exception 'Le filtre par auteur ne propose personne.';
  end if;

  raise notice '[OK] 13. Le filtre par auteur ne propose que des auteurs nommés (%).', v_all;
end $$;


-- --- 14. LA PÉRIODE SE BORNE SUR LE JOUR COMORIEN -----------------------------
--
-- `current_date` est UTC. Entre 21 h et minuit UTC, il désigne la VEILLE aux
-- Comores : une recherche « aujourd'hui » y perdrait trois heures d'activité
-- (DEC-025 §e). Le contrôle éprouve la borne telle que l'écran la calcule.
do $$
declare
  v_jour date := (now() at time zone 'Indian/Comoro')::date;
  v_debut timestamptz := (v_jour::timestamp at time zone 'Indian/Comoro');
  v_fin   timestamptz := ((v_jour + 1)::timestamp at time zone 'Indian/Comoro');
  v_hors  int;
begin
  -- Aucun événement de la journée comorienne ne doit tomber hors de ses bornes.
  select count(*)::int into v_hors
  from public.audit_log
  where (occurred_at at time zone 'Indian/Comoro')::date = v_jour
    and (occurred_at < v_debut or occurred_at >= v_fin);

  if v_hors <> 0 then
    raise exception '% événement(s) du jour comorien tombent hors des bornes du filtre.', v_hors;
  end if;

  raise notice '[OK] 14. Les bornes de période suivent le jour comorien, pas le jour UTC.';
end $$;


-- --- 15. NON-RÉGRESSION : LE LOT NE TOUCHE À AUCUN AUTRE MODULE ---------------
do $$
declare
  v_rentals  int;
  v_invoices int;
  v_entries  int;
  v_clients  int;
  v_perms    int;
begin
  select count(*)::int into v_rentals  from public.rentals           where status = 'IN_PROGRESS';
  select count(*)::int into v_invoices from public.customer_invoices where status = 'ISSUED';
  select count(*)::int into v_entries  from public.treasury_entries;
  select count(*)::int into v_clients  from public.clients;
  select count(*)::int into v_perms    from public.permissions;

  perform count(*) from public.audit_actors();
  perform public.audit_detail_permission('clients');

  if (select count(*)::int from public.rentals where status = 'IN_PROGRESS') <> v_rentals
     or (select count(*)::int from public.customer_invoices where status = 'ISSUED') <> v_invoices
     or (select count(*)::int from public.treasury_entries) <> v_entries
     or (select count(*)::int from public.clients) <> v_clients
     or (select count(*)::int from public.permissions) <> v_perms
  then
    raise exception 'La lecture du journal a modifié un autre module.';
  end if;

  raise notice '[OK] 15. Location, facturation, trésorerie, tiers et catalogue : intacts.';
end $$;


rollback;

-- =============================================================================
-- Transaction annulée : aucune ligne de recette ne subsiste — et surtout aucune
-- entrée dans le journal, qui ne pourrait plus jamais en être retirée.
-- =============================================================================
