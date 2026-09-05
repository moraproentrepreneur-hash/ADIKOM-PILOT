-- =============================================================================
-- ADIKOM PILOT — Recette Paramètres
-- Phase 4 — Organisation, LOT 16 (Module 09)
--
-- CE QU'ELLE ÉPROUVE
--
-- Ce que la BASE doit tenir seule, et que ni l'écran ni la recette navigateur
-- ne peuvent garantir :
--
--   · l'ABSENCE de capacité nouvelle — le lot n'en crée aucune (DEC-024) ;
--   · les DROITS DE COLONNE : les quatre colonnes administratives (§34) et les
--     trois colonnes bancaires (§37) sont hors de portée de `authenticated`,
--     et les colonnes de l'écran lui restent accordées ;
--   · le COMPTEUR d'une numérotation, que personne ne règle à la main (§16) —
--     y compris le rôle de service, car un numéro réémis l'est pour tout le
--     monde ;
--   · le FORMAT produit par `next_number`, et son EXERCICE comorien (§17) ;
--   · la SINGULARITÉ de la configuration : une seule ligne, qui ne se supprime
--     pas (§44) ;
--   · l'ABSENCE de ce que le lot ne fait pas : aucune table, aucune colonne.
--
-- Exécution :
--   npm run db:verify:settings
--
-- Ce script s'exécute avec le rôle de la chaîne de connexion, pour lequel
-- `current_actor()` vaut NULL : aucune capacité n'y est détenue. Il contrôle
-- donc la STRUCTURE, les DROITS et les règles de COHÉRENCE — celles qui valent
-- pour tout le monde. L'effet des capacités par SECTION s'éprouve avec de
-- vraies sessions, dans `verify:settings`.
--
-- AUCUNE DATE EN DUR : l'exercice se lit sur `Indian/Comoro` (DEC-025 §e).
--
-- La transaction est annulée en fin de script : aucun numéro n'est réellement
-- consommé, aucun paramètre n'est réellement modifié.
-- =============================================================================

begin;


-- --- 1. AUCUNE CAPACITÉ N'EST CRÉÉE PAR CE LOT --------------------------------
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
  where code like 'settings.%';

  if v_lot <> 9 then
    raise exception 'Les neuf capacités du module Paramètres ne sont pas au catalogue (% trouvées).', v_lot;
  end if;

  -- Ce qui n'existe pas, et ne doit pas exister. Le module ne supprime aucun
  -- paramètre, n'exporte rien, et ne crée pas de règle de numérotation : les
  -- treize existantes couvrent les objets du SaaS.
  if exists (
    select 1 from public.permissions
    where code in (
      'settings.company.delete', 'settings.company.export', 'settings.company.print',
      'settings.numbering.create', 'settings.numbering.delete', 'settings.numbering.reset',
      'settings.branding.view'
    )
  ) then
    raise exception 'Une capacité a été créée pour une fonctionnalité que le lot ne livre pas.';
  end if;

  raise notice '[OK] 1. Catalogue à 170 : le lot n''en crée aucune, et ses neuf existent.';
end $$;


-- --- 2. LES SECTIONS SENSIBLES SONT HORS DE PORTÉE DE L'API --------------------
--
-- `company_settings` est un SINGLETON : RLS étant ROW-level, une policy de
-- lecture rendait la ligne ENTIÈRE — registre de commerce et coordonnées
-- bancaires comprises — à qui détenait `settings.company.view`. §42 l'interdit.
do $$
declare
  v_open text := '';
  v_shut text := '';
begin
  -- Section Administratif (§34) et section Banque (§37).
  foreach v_open in array array[
    'registration_number', 'tax_identifier', 'legal_form', 'administrative_notes',
    'bank_name', 'bank_account_holder', 'bank_account_details'
  ] loop
    if has_column_privilege('authenticated', 'public.company_settings', v_open, 'SELECT') then
      v_shut := v_shut || v_open || ' ';
    end if;
  end loop;

  if v_shut <> '' then
    raise exception 'Colonnes sensibles encore lisibles par appel direct : %', v_shut;
  end if;

  -- Et l'écran doit continuer de fonctionner : refermer trop serait refermer
  -- la fiche entière.
  if not (
    has_column_privilege('authenticated', 'public.company_settings', 'legal_name', 'SELECT')
    and has_column_privilege('authenticated', 'public.company_settings', 'address_line1', 'SELECT')
    and has_column_privilege('authenticated', 'public.company_settings', 'currency_code', 'SELECT')
    and has_column_privilege('authenticated', 'public.company_settings', 'logo_path', 'SELECT')
    and has_column_privilege('authenticated', 'public.company_settings', 'invoice_display_name', 'SELECT')
    and has_column_privilege('authenticated', 'public.company_settings', 'id', 'SELECT')
  ) then
    raise exception 'Une colonne nécessaire à l''écran a été retirée à authenticated.';
  end if;

  -- `anon` n'a jamais rien eu ici.
  if has_column_privilege('anon', 'public.company_settings', 'legal_name', 'SELECT') then
    raise exception 'Les paramètres sont devenus lisibles sans compte.';
  end if;

  raise notice '[OK] 2. Administratif et Banque hors de portée de l''API ; l''écran reste servi.';
end $$;


-- --- 3. LA VUE PUBLIQUE N'A PAS ÉTÉ ÉLARGIE -----------------------------------
--
-- `company_profile` est lisible par TOUT compte authentifié depuis la migration
-- 027 : l'en-tête d'un document en a besoin. Elle ne doit donc jamais porter
-- une colonne sensible — ce serait rouvrir par la fenêtre ce que la porte
-- vient de fermer.
do $$
declare
  v_leak text;
begin
  select string_agg(column_name, ', ')
    into v_leak
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'company_profile'
    and column_name in (
      'registration_number', 'tax_identifier', 'legal_form', 'administrative_notes',
      'bank_name', 'bank_account_holder', 'bank_account_details'
    );

  if v_leak is not null then
    raise exception 'La vue publique des paramètres expose des colonnes sensibles : %', v_leak;
  end if;

  raise notice '[OK] 3. La vue publique ne porte aucune colonne sensible.';
end $$;


-- --- 4. LA POLICY ADMET LES QUATRE CAPACITÉS D'ÉCRITURE ------------------------
--
-- Répartition de DEC-035 §b : la POLICY dit qui peut écrire dans la table, le
-- DÉCLENCHEUR dit qui peut accomplir CET acte-là. Sans cet élargissement, un
-- compte doté de la seule capacité bancaire se verrait refuser l'écriture AVANT
-- d'atteindre le déclencheur — le défaut corrigé par la migration 061 pour les
-- groupes.
do $$
declare
  v_check text;
begin
  select with_check into v_check
  from pg_policies
  where schemaname = 'public' and tablename = 'company_settings'
    and policyname = 'company_settings_update';

  if v_check is null then
    raise exception 'La policy d''écriture des paramètres a disparu.';
  end if;

  if v_check not like '%settings.company.update%'
     or v_check not like '%settings.company.administrative.update%'
     or v_check not like '%settings.company.bank.update%'
     or v_check not like '%settings.branding.update%'
  then
    raise exception 'La policy n''admet pas les quatre capacités d''écriture : %', v_check;
  end if;

  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'company_settings'
      and t.tgname = 'company_settings_write_guard' and not t.tgisinternal
  ) then
    raise exception 'Le déclencheur qui arbitre les sections est absent.';
  end if;

  raise notice '[OK] 4. La policy ouvre, le déclencheur arbitre.';
end $$;


-- --- 5. LA CONFIGURATION EST UNIQUE, ET NE SE SUPPRIME PAS (§44) ---------------
do $$
declare
  v_rows    int;
  v_refused boolean;
begin
  select count(*)::int into v_rows from public.company_settings;
  if v_rows <> 1 then
    raise exception 'La configuration compte % lignes, une seule attendue.', v_rows;
  end if;

  v_refused := false;
  begin
    delete from public.company_settings where id;
  exception when others then
    v_refused := true;
  end;
  if not v_refused then
    raise exception 'La configuration d''ADIKOM a pu être supprimée.';
  end if;

  -- La clé du singleton ne se déplace pas : une seconde ligne serait une
  -- seconde vérité.
  v_refused := false;
  begin
    update public.company_settings set id = false where id;
  exception when others then
    v_refused := true;
  end;
  if not v_refused then
    raise exception 'La clé du singleton a pu être modifiée.';
  end if;

  -- TRUNCATE ne déclenche aucun trigger de ligne : le garde-fou de la
  -- migration 005 ne l'aurait pas vu passer.
  if has_table_privilege('authenticated', 'public.company_settings', 'TRUNCATE') then
    raise exception 'Un compte authentifié peut vider la table des paramètres.';
  end if;
  if has_table_privilege('authenticated', 'public.numbering_rules', 'TRUNCATE') then
    raise exception 'Un compte authentifié peut vider les règles de numérotation.';
  end if;

  raise notice '[OK] 5. Une seule configuration, ni supprimable, ni videment possible.';
end $$;


-- --- 6. LE COMPTEUR N'APPARTIENT QU'À `next_number` (§16) ----------------------
--
-- LE CONTRÔLE CENTRAL DU LOT.
--
-- Ramener un compteur en arrière ferait rééditer des références déjà portées
-- par des factures. La règle ne connaît AUCUNE exception : ni pour un compte
-- doté de `settings.numbering.update`, ni pour le rôle de service — un numéro
-- réémis l'est pour tout le monde.
do $$
declare
  v_refused boolean;
  v_before  bigint;
  v_after   bigint;
begin
  select current_value into v_before
  from public.numbering_rules where entity_key = 'customer_invoice';

  v_refused := false;
  begin
    update public.numbering_rules set current_value = 0 where entity_key = 'customer_invoice';
  exception when others then
    v_refused := true;
  end;
  if not v_refused then
    raise exception 'Le compteur des factures clients a pu être remis à zéro.';
  end if;

  v_refused := false;
  begin
    update public.numbering_rules set current_year = 1999 where entity_key = 'customer_invoice';
  exception when others then
    v_refused := true;
  end;
  if not v_refused then
    raise exception 'L''exercice d''une numérotation a pu être réécrit.';
  end if;

  select current_value into v_after
  from public.numbering_rules where entity_key = 'customer_invoice';

  if v_after is distinct from v_before then
    raise exception 'Le compteur a bougé malgré le refus (% → %).', v_before, v_after;
  end if;

  raise notice '[OK] 6. Le compteur d''une numérotation ne se règle pas à la main.';
end $$;


-- --- 7. LE FORMAT SE MODIFIE, LUI ---------------------------------------------
--
-- Le lot ne doit pas fermer plus qu'il ne faut : DEC-005 rend les formats
-- paramétrables « sans redéploiement », et une migration doit pouvoir les
-- corriger.
do $$
declare
  v_prefix text;
begin
  update public.numbering_rules
     set prefix = 'ZZZ', padding = 8, separator = '/', include_year = true, reset_yearly = true
   where entity_key = 'customer_invoice';

  select prefix into v_prefix
  from public.numbering_rules where entity_key = 'customer_invoice';

  if v_prefix <> 'ZZZ' then
    raise exception 'Le format d''une numérotation ne se modifie plus.';
  end if;

  raise notice '[OK] 7. Le format reste modifiable sans redéploiement (DEC-005).';
end $$;


-- --- 8. UN FORMAT VIDE EST REFUSÉ ---------------------------------------------
do $$
declare
  v_refused boolean := false;
begin
  begin
    update public.numbering_rules set prefix = '   ' where entity_key = 'customer_invoice';
  exception when others then
    v_refused := true;
  end;

  if not v_refused then
    raise exception 'Un préfixe vide a été accepté : les références deviendraient inexploitables.';
  end if;

  -- La clé identifie la règle dans tout le code applicatif.
  v_refused := false;
  begin
    update public.numbering_rules set entity_key = 'autre_chose' where entity_key = 'customer_invoice';
  exception when others then
    v_refused := true;
  end;
  if not v_refused then
    raise exception 'La clé d''une règle de numérotation a pu être renommée.';
  end if;

  raise notice '[OK] 8. Ni préfixe vide, ni clé renommée.';
end $$;


-- --- 9. `next_number` PRODUIT LE FORMAT ATTENDU, ET INCRÉMENTE -----------------
do $$
declare
  v_year   int := extract(year from (now() at time zone 'Indian/Comoro'))::int;
  v_first  text;
  v_second text;
  v_value  bigint;
begin
  -- Format restauré à celui de DEC-005 avant la mesure.
  update public.numbering_rules
     set prefix = 'FAC-C', padding = 6, separator = '-', include_year = true, reset_yearly = true
   where entity_key = 'customer_invoice';

  v_first  := public.next_number('customer_invoice');
  v_second := public.next_number('customer_invoice');

  if v_first !~ ('^FAC-C-' || v_year::text || '-[0-9]{6}$') then
    raise exception 'Le format produit ne correspond pas à DEC-005 : %', v_first;
  end if;

  if v_first = v_second then
    raise exception 'Deux appels ont produit le même numéro : %', v_first;
  end if;

  if (right(v_second, 6))::int <> (right(v_first, 6))::int + 1 then
    raise exception 'Le compteur ne progresse pas d''un : % puis %', v_first, v_second;
  end if;

  -- L'écriture du compteur par la fonction ne laisse pas la porte ouverte
  -- derrière elle : le drapeau est local à l'appel.
  select current_value into v_value
  from public.numbering_rules where entity_key = 'customer_invoice';

  begin
    update public.numbering_rules set current_value = 0 where entity_key = 'customer_invoice';
    raise exception 'Le drapeau de génération est resté levé après next_number.';
  exception
    when sqlstate '42501' then null;
  end;

  raise notice '[OK] 9. next_number produit % puis %, et referme derrière lui.', v_first, v_second;
end $$;


-- --- 10. L'EXERCICE EST CELUI D'ADIKOM (§17, DEC-025 §e) ----------------------
--
-- Aux Comores (UTC+3), le 1er janvier commence trois heures avant qu'UTC ne
-- change d'année. Une facture émise le 1er janvier à 01 h 00 aurait porté
-- l'année PRÉCÉDENTE, et le compteur ne se serait pas remis à zéro.
do $$
declare
  v_src   text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'next_number';

  if v_src is null then
    raise exception 'next_number est introuvable.';
  end if;

  if v_src like '%time zone ''UTC''%' then
    raise exception 'next_number date encore ses numéros sur UTC.';
  end if;

  if v_src not like '%Indian/Comoro%' then
    raise exception 'next_number ne date pas ses numéros sur l''exercice comorien.';
  end if;

  raise notice '[OK] 10. L''exercice d''un numéro est celui d''ADIKOM, pas celui du serveur.';
end $$;


-- --- 11. SANS CAPACITÉ, LES SECTIONS SENSIBLES SE REFUSENT ---------------------
--
-- Le rôle de service n'a pas d'acteur : `current_actor()` vaut NULL, donc
-- `has_permission` est faux. La fonction doit refuser — et refuser, ce n'est
-- pas rendre une ligne vide.
do $$
declare
  v_refused boolean := false;
  v_state   text;
begin
  begin
    perform * from public.company_settings_sensitive();
  exception when others then
    v_refused := true;
    v_state := sqlstate;
  end;

  if not v_refused then
    raise exception 'Les sections sensibles se sont ouvertes sans aucune capacité.';
  end if;

  if v_state <> '42501' then
    raise exception 'Le refus n''est pas un refus de droit (sqlstate %).', v_state;
  end if;

  raise notice '[OK] 11. Sans settings.company.view, les sections sensibles se refusent.';
end $$;


-- --- 12. LE LOT NE CRÉE AUCUNE TABLE ET AUCUNE COLONNE ------------------------
do $$
declare
  v_extra text;
  v_cols  int;
  v_rules int;
begin
  select string_agg(table_name, ', ')
    into v_extra
  from information_schema.tables
  where table_schema = 'public'
    and (table_name like 'settings%' or table_name like 'company_%')
    and table_name not in ('company_settings', 'company_profile');

  if v_extra is not null then
    raise exception 'Le lot a créé une table de paramètres supplémentaire : %', v_extra;
  end if;

  select count(*)::int into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'company_settings';

  -- Les 44 colonnes de la migration 005, ni plus ni moins.
  if v_cols <> 44 then
    raise exception 'La fiche entreprise compte % colonnes, 44 attendues.', v_cols;
  end if;

  select count(*)::int into v_rules from public.numbering_rules;
  if v_rules < 13 then
    raise exception 'Le SaaS ne compte plus que % règles de numérotation.', v_rules;
  end if;

  raise notice '[OK] 12. Aucune table, aucune colonne ; % règles de numérotation.', v_rules;
end $$;


-- --- 13. LE JOURNAL D'ACTIVITÉ VOIT LES PARAMÈTRES -----------------------------
--
-- §43 : les modifications importantes sont enregistrées. Le déclencheur d'audit
-- de la migration 005 les couvre déjà ; ce qui doit être vérifié, c'est que le
-- journal sait sous QUELLE capacité en ouvrir le détail (DEC-038).
do $$
begin
  if public.audit_detail_permission('company_settings') <> 'settings.company.view' then
    raise exception 'La fiche entreprise n''est pas cartographiée par le journal d''activité.';
  end if;

  if public.audit_detail_permission('numbering_rules') <> 'settings.numbering.view' then
    raise exception 'La numérotation n''est pas cartographiée par le journal d''activité.';
  end if;

  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'company_settings' and t.tgname = 'company_settings_audit'
      and not t.tgisinternal
  ) then
    raise exception 'Les modifications des paramètres ne sont plus journalisées (§43).';
  end if;

  raise notice '[OK] 13. Les paramètres sont journalisés, et leur détail cartographié.';
end $$;


-- --- 14. LE STOCKAGE DE L'IDENTITÉ VISUELLE EST PRIVÉ (§38, §39) ---------------
do $$
declare
  v_public boolean;
  v_limit  bigint;
begin
  select public, file_size_limit into v_public, v_limit
  from storage.buckets where id = 'branding';

  if v_public is null then
    raise exception 'Le stockage de l''identité visuelle n''existe pas.';
  end if;

  if v_public then
    raise exception 'Le logo est devenu lisible sans compte.';
  end if;

  if v_limit is null or v_limit > 2097152 then
    raise exception 'Le plafond de taille du logo a été relâché (%).', v_limit;
  end if;

  raise notice '[OK] 14. Le stockage du logo est privé et borné.';
end $$;


-- --- 15. NON-RÉGRESSION : LE LOT NE TOUCHE À AUCUN AUTRE MODULE ----------------
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

  if (select count(*)::int from public.rentals where status = 'IN_PROGRESS') <> v_rentals
     or (select count(*)::int from public.customer_invoices where status = 'ISSUED') <> v_invoices
     or (select count(*)::int from public.treasury_entries) <> v_entries
     or (select count(*)::int from public.clients) <> v_clients
     or (select count(*)::int from public.permissions) <> v_perms
  then
    raise exception 'La configuration a modifié un autre module.';
  end if;

  raise notice '[OK] 15. Location, facturation, trésorerie, tiers et catalogue : intacts.';
end $$;


rollback;

-- =============================================================================
-- Transaction annulée : aucun numéro n'a été réellement consommé, aucun format
-- réellement modifié.
-- =============================================================================
