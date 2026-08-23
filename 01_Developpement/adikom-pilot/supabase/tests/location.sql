-- =============================================================================
-- ADIKOM PILOT — Recette du référentiel d'exploitation (Étape 2.2, DEC-021)
--
-- Vérifie que les garanties structurelles du référentiel sont réellement en
-- place : contraintes, non-collision, résolveur tarifaire, interdiction de
-- suppression, rédaction du journal d'audit.
--
-- Exécution :
--   npm run db:verify:location
--
-- Ce script s'exécute avec le rôle de la chaîne de connexion, qui contourne
-- RLS. Il contrôle donc les garanties portées par le SCHÉMA. Les policies RLS
-- sont éprouvées séparément, avec de vraies sessions utilisateur, par
-- `npm run verify:referential`.
--
-- La transaction est annulée en fin de script : aucun résidu en base.
-- =============================================================================

begin;

-- --- 1. Tables du référentiel ------------------------------------------------
do $$
declare
  expected text[] := array[
    'clients', 'suppliers', 'supplier_payment_details', 'partners',
    'vehicle_categories', 'vehicles', 'vehicle_supplier_history',
    'vehicle_documents', 'pricing_rules', 'vehicle_occupations'
  ];
  missing text[];
begin
  select array_agg(t) into missing
  from unnest(expected) t
  where not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = t
  );

  if missing is not null then
    raise exception 'Tables manquantes : %', missing;
  end if;

  raise notice '[OK] 1. Les 10 tables du référentiel sont présentes.';
end $$;


-- --- 2. RLS activée et aucune policy DELETE ----------------------------------
-- CLAUDE.md §22 : les données métier s'archivent, elles ne se suppriment pas.
do $$
declare
  tables text[] := array[
    'clients', 'suppliers', 'supplier_payment_details', 'partners',
    'vehicle_categories', 'vehicles', 'vehicle_supplier_history',
    'vehicle_documents', 'pricing_rules', 'vehicle_occupations'
  ];
  unprotected text[];
  deletable   text[];
begin
  select array_agg(c.relname) into unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = any(tables) and not c.relrowsecurity;

  if unprotected is not null then
    raise exception 'RLS absente sur : %', unprotected;
  end if;

  -- `polcmd` vaut 'd' pour une policy DELETE et '*' pour une policy FOR ALL —
  -- laquelle COUVRE la suppression. Ne chercher que 'd' laissait passer
  -- `supplier_bank_details`, dont la policy `for all` autorisait un utilisateur
  -- porteur de `bank.update` à effacer la ligne. Les deux sont désormais
  -- refusées.
  select array_agg(distinct c.relname) into deletable
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  where c.relname = any(tables) and p.polcmd in ('d', '*');

  if deletable is not null then
    raise exception 'Policy autorisant la suppression sur : %', deletable;
  end if;

  -- Une policy ne protège rien si le DROIT est accordé : les deux se vérifient.
  select array_agg(t) into deletable
  from unnest(tables) t
  where has_table_privilege('authenticated', 'public.' || t, 'DELETE');

  if deletable is not null then
    raise exception 'Droit DELETE accordé à « authenticated » sur : %', deletable;
  end if;

  raise notice '[OK] 2. RLS activée, aucune suppression possible sur le référentiel.';
end $$;


-- --- 3. Numérotation atomique côté serveur -----------------------------------
-- DEC-005 / DEC-021 : CLI-000001 · FOU-000001 · VEH-000001, sans année.
do $$
declare
  v_client   text := public.next_number('client');
  v_supplier text := public.next_number('supplier');
  v_vehicle  text := public.next_number('vehicle');
begin
  if v_client !~ '^CLI-[0-9]{6}$' then
    raise exception 'Format client inattendu : %', v_client;
  end if;
  if v_supplier !~ '^FOU-[0-9]{6}$' then
    raise exception 'Format fournisseur inattendu : %', v_supplier;
  end if;
  if v_vehicle !~ '^VEH-[0-9]{6}$' then
    raise exception 'Format véhicule inattendu : %', v_vehicle;
  end if;
  if public.next_number('client') = v_client then
    raise exception 'Le compteur client n''a pas progressé : doublon possible.';
  end if;

  raise notice '[OK] 3. Numérotation conforme et strictement croissante.';
end $$;


-- --- 4. Jeu de données de recette --------------------------------------------
-- Reprend l'exemple de référence du projet : Fournisseur A / Toyota T5.
do $$
declare
  v_cat uuid;
  v_sup uuid;
  v_veh uuid;
  v_cli uuid;
begin
  insert into public.vehicle_categories (code, label)
  values ('RECETTE-SUV', 'Recette — SUV')
  returning id into v_cat;

  insert into public.suppliers (supplier_no, legal_name, phone)
  values (public.next_number('supplier'), 'Recette — Fournisseur A', '+269 000 00 01')
  returning id into v_sup;

  insert into public.clients (client_no, type, legal_name, phone)
  values (public.next_number('client'), 'COMPANY', 'Recette — Client A', '+269 000 00 02')
  returning id into v_cli;

  insert into public.vehicles (
    vehicle_no, plate, brand, model, category_id, origin, current_supplier_id, entry_date
  )
  values (
    public.next_number('vehicle'), 'AB 123 CD', 'Toyota', 'T5', v_cat,
    'SUPPLIED', v_sup, current_date - 30
  )
  returning id into v_veh;

  insert into public.vehicle_supplier_history (vehicle_id, supplier_id, started_on)
  values (v_veh, v_sup, current_date - 30);

  -- Rendu disponible aux contrôles suivants via une table temporaire.
  create temporary table recette_ids on commit drop as
  select v_cat as category_id, v_sup as supplier_id, v_veh as vehicle_id, v_cli as client_id;

  raise notice '[OK] 4. Jeu de recette créé : catégorie, fournisseur, client, véhicule.';
end $$;


-- --- 5. Unicité de l'immatriculation -----------------------------------------
-- Règles parc §4 : éviter qu'un même véhicule soit enregistré deux fois.
do $$
declare
  v_cat uuid;
begin
  select category_id into v_cat from recette_ids;

  begin
    insert into public.vehicles (vehicle_no, plate, brand, model, category_id)
    values (public.next_number('vehicle'), 'ab123cd', 'Toyota', 'T5 bis', v_cat);

    raise exception 'Une immatriculation dupliquée a été acceptée.';
  exception when unique_violation then
    raise notice '[OK] 5. Immatriculation unique, insensible à la casse et aux espaces.';
  end;
end $$;


-- --- 6. Cohérence origine / fournisseur --------------------------------------
-- Règles parc §10 : un véhicule fourni désigne son fournisseur ; un véhicule
-- ADIKOM n'en a pas.
do $$
declare
  v_cat uuid;
  v_sup uuid;
  v_ok  int := 0;
begin
  select category_id, supplier_id into v_cat, v_sup from recette_ids;

  begin
    insert into public.vehicles (vehicle_no, brand, model, category_id, origin)
    values (public.next_number('vehicle'), 'Nissan', 'X-Trail', v_cat, 'SUPPLIED');
    raise exception 'Un véhicule SUPPLIED sans fournisseur a été accepté.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  begin
    insert into public.vehicles (vehicle_no, brand, model, category_id, origin, current_supplier_id)
    values (public.next_number('vehicle'), 'Nissan', 'Juke', v_cat, 'OWNED', v_sup);
    raise exception 'Un véhicule ADIKOM avec fournisseur a été accepté.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  begin
    insert into public.vehicles (vehicle_no, brand, model, category_id, origin)
    values (public.next_number('vehicle'), 'Nissan', 'Micra', v_cat, 'PARTNERSHIP');
    raise exception 'Un véhicule PARTNERSHIP sans partenaire a été accepté.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  if v_ok <> 3 then
    raise exception 'Cohérence des trois origines non garantie.';
  end if;

  raise notice '[OK] 6. Les trois origines exigent le rattachement correspondant.';
end $$;


-- --- 7. Sortie du parc --------------------------------------------------------
-- Règles parc §45 et §47 : un véhicule sort du parc, il ne disparaît pas.
do $$
declare
  v_cat uuid;
  v_ok  int := 0;
begin
  select category_id into v_cat from recette_ids;

  begin
    insert into public.vehicles (vehicle_no, brand, model, category_id, exit_date)
    values (public.next_number('vehicle'), 'Kia', 'Picanto', v_cat, current_date);
    raise exception 'Une date de sortie sans statut RETIRED a été acceptée.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  begin
    insert into public.vehicles (vehicle_no, brand, model, category_id, status)
    values (public.next_number('vehicle'), 'Kia', 'Rio', v_cat, 'RETIRED');
    raise exception 'Un statut RETIRED sans date de sortie a été accepté.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  if v_ok <> 2 then
    raise exception 'Cohérence de la sortie du parc non garantie.';
  end if;

  raise notice '[OK] 7. Retrait du parc : statut et date de sortie indissociables.';
end $$;


-- --- 8. Aucune suppression physique par l'application -------------------------
--
-- Le contrôle se place dans les conditions réelles de l'application : une
-- session utilisateur. `current_actor()` lit `auth.uid()`, qui dérive de la
-- revendication `sub` du jeton — simulée ici. Sans cela, le script s'exécuterait
-- comme une opération d'environnement, pour laquelle la suppression reste
-- volontairement permise (migration 021, DEC-020).
do $$
declare
  v_cli uuid;
  v_sup uuid;
  v_veh uuid;
  v_ok  int := 0;
begin
  select client_id, supplier_id, vehicle_id into v_cli, v_sup, v_veh from recette_ids;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', gen_random_uuid()::text)::text,
    true
  );

  begin
    delete from public.clients where id = v_cli;
    raise exception 'La suppression d''un client a été acceptée.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  begin
    delete from public.suppliers where id = v_sup;
    raise exception 'La suppression d''un fournisseur a été acceptée.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  begin
    delete from public.vehicles where id = v_veh;
    raise exception 'La suppression d''un véhicule a été acceptée.';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  if v_ok <> 3 then
    raise exception 'Une donnée métier a pu être supprimée physiquement.';
  end if;

  -- L'auteur simulé est retiré : les contrôles suivants écrivent dans le
  -- journal d'audit, dont la référence à l'auteur doit rester valide.
  perform set_config('request.jwt.claims', '', true);

  raise notice '[OK] 8. Clients, fournisseurs et véhicules ne peuvent pas être supprimés.';
end $$;


-- --- 9. Changement de fournisseur ---------------------------------------------
-- Règles parc §59 et §60 : un seul rattachement ouvert, historique conservé.
do $$
declare
  v_veh   uuid;
  v_sup   uuid;
  v_sup_b uuid;
  v_open  int;
  v_closed int;
begin
  select vehicle_id, supplier_id into v_veh, v_sup from recette_ids;

  insert into public.suppliers (supplier_no, legal_name, phone)
  values (public.next_number('supplier'), 'Recette — Fournisseur B', '+269 000 00 03')
  returning id into v_sup_b;

  perform public.set_vehicle_attachment(v_veh, 'SUPPLIED', v_sup_b, null, current_date, 'Recette');

  select count(*) into v_open
  from public.vehicle_supplier_history
  where vehicle_id = v_veh and ended_on is null;

  select count(*) into v_closed
  from public.vehicle_supplier_history
  where vehicle_id = v_veh and ended_on is not null;

  if v_open <> 1 or v_closed <> 1 then
    raise exception 'Historique fournisseur incohérent : % ouvert(s), % clôturé(s).', v_open, v_closed;
  end if;

  if (select current_supplier_id from public.vehicles where id = v_veh) <> v_sup_b then
    raise exception 'La fiche véhicule ne reflète pas le nouveau fournisseur.';
  end if;

  if not exists (
    select 1 from public.vehicle_supplier_history
    where vehicle_id = v_veh and supplier_id = v_sup and ended_on is not null
  ) then
    raise exception 'L''ancien rattachement n''a pas été conservé.';
  end if;

  raise notice '[OK] 9. Changement de fournisseur historisé, un seul rattachement ouvert.';
end $$;


-- --- 10. Fournisseur non actif ------------------------------------------------
-- Règles fournisseurs §6 et §7 : seul un fournisseur actif porte une nouvelle
-- opération.
do $$
declare
  v_veh uuid;
  v_sup uuid;
begin
  select vehicle_id into v_veh from recette_ids;

  insert into public.suppliers (supplier_no, legal_name, phone, status, status_changed_at)
  values (public.next_number('supplier'), 'Recette — Fournisseur suspendu', '+269 000 00 04',
          'SUSPENDED', now())
  returning id into v_sup;

  begin
    perform public.set_vehicle_attachment(v_veh, 'SUPPLIED', v_sup, null, current_date, 'Recette');
    raise exception 'Un fournisseur suspendu a pu recevoir un véhicule.';
  exception when check_violation then
    raise notice '[OK] 10. Un fournisseur non actif ne peut pas recevoir de véhicule.';
  end;
end $$;


-- --- 11. Non-collision des véhicules ------------------------------------------
-- DEC-012 · Règles location §57 et §80.1 : contrainte fondamentale du module.
do $$
declare
  v_veh uuid;
  v_occ uuid;
begin
  select vehicle_id into v_veh from recette_ids;

  insert into public.vehicle_occupations (vehicle_id, source, period, reason)
  values (v_veh, 'IMMOBILIZATION',
          tstzrange(now() + interval '1 day', now() + interval '5 days', '[)'),
          'Recette — immobilisation')
  returning id into v_occ;

  -- Chevauchement partiel : refusé.
  begin
    insert into public.vehicle_occupations (vehicle_id, source, period)
    values (v_veh, 'IMMOBILIZATION',
            tstzrange(now() + interval '3 days', now() + interval '7 days', '[)'));
    raise exception 'Deux occupations actives se chevauchent : la non-collision n''est pas garantie.';
  exception when exclusion_violation then
    null;
  end;

  -- Période adjacente, sans chevauchement : acceptée (§59 — locations successives).
  insert into public.vehicle_occupations (vehicle_id, source, period)
  values (v_veh, 'IMMOBILIZATION',
          tstzrange(now() + interval '5 days', now() + interval '8 days', '[)'));

  -- Occupation libérée : cesse de bloquer (Règles location §55).
  update public.vehicle_occupations
     set is_active = false, released_at = now()
   where id = v_occ;

  insert into public.vehicle_occupations (vehicle_id, source, period)
  values (v_veh, 'IMMOBILIZATION',
          tstzrange(now() + interval '2 days', now() + interval '4 days', '[)'));

  raise notice '[OK] 11. Chevauchement refusé, période adjacente acceptée, libération effective.';
end $$;


-- --- 12. Disponibilité réelle -------------------------------------------------
-- Règles parc §67 et §69 : le statut ne suffit jamais à conclure.
do $$
declare
  v_veh uuid;
begin
  select vehicle_id into v_veh from recette_ids;

  if public.is_vehicle_available(
       v_veh, tstzrange(now() + interval '2 days', now() + interval '3 days', '[)')
     ) then
    raise exception 'Un véhicule occupé est annoncé disponible.';
  end if;

  if not public.is_vehicle_available(
       v_veh, tstzrange(now() + interval '30 days', now() + interval '31 days', '[)')
     ) then
    raise exception 'Un véhicule libre est annoncé indisponible.';
  end if;

  -- Le statut AVAILABLE ne rend pas disponible un véhicule dont le calendrier
  -- est occupé : les deux notions restent distinctes.
  update public.vehicles set status = 'AVAILABLE' where id = v_veh;

  if public.is_vehicle_available(
       v_veh, tstzrange(now() + interval '2 days', now() + interval '3 days', '[)')
     ) then
    raise exception 'Le statut a primé sur le calendrier.';
  end if;

  -- Un véhicule retiré n'est jamais disponible (§79.6).
  update public.vehicles
     set status = 'RETIRED', exit_date = current_date, exit_reason = 'Recette'
   where id = v_veh;

  if public.is_vehicle_available(
       v_veh, tstzrange(now() + interval '30 days', now() + interval '31 days', '[)')
     ) then
    raise exception 'Un véhicule retiré est annoncé disponible.';
  end if;

  update public.vehicles
     set status = 'AVAILABLE', exit_date = null, exit_reason = null
   where id = v_veh;

  raise notice '[OK] 12. Disponibilité = statut ET calendrier, jamais l''un des deux seul.';
end $$;


-- --- 13. Contraintes de la tarification ---------------------------------------
-- DEC-001 et Tiers §6.6 : jamais d'ambiguïté sur le montant appliqué.
do $$
declare
  v_cli uuid;
  v_veh uuid;
  v_cat uuid;
  v_ok  int := 0;
begin
  select client_id, vehicle_id, category_id into v_cli, v_veh, v_cat from recette_ids;

  begin  -- montant sans unité
    insert into public.pricing_rules (vehicle_id, amount) values (v_veh, 500000);
    raise exception 'Un montant sans unité a été accepté.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  begin  -- montant ET remise
    insert into public.pricing_rules (client_id, amount, unit, discount_percent)
    values (v_cli, 450000, 'DAY', 10);
    raise exception 'Un montant et une remise simultanés ont été acceptés.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  begin  -- remise sans client
    insert into public.pricing_rules (vehicle_id, discount_percent) values (v_veh, 10);
    raise exception 'Une remise sans client a été acceptée.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  begin  -- véhicule ET catégorie
    insert into public.pricing_rules (vehicle_id, category_id, amount, unit)
    values (v_veh, v_cat, 500000, 'DAY');
    raise exception 'Une règle visant à la fois un véhicule et une catégorie a été acceptée.';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  if v_ok <> 4 then
    raise exception 'Les garde-fous de la tarification ne sont pas tous actifs.';
  end if;

  raise notice '[OK] 13. Tarification : ni montant sans unité, ni double tarif, ni portée ambiguë.';
end $$;


-- --- 14. Résolveur tarifaire — les six niveaux de DEC-002 ---------------------
do $$
declare
  v_cli uuid;
  v_veh uuid;
  v_cat uuid;
  r     record;
begin
  select client_id, vehicle_id, category_id into v_cli, v_veh, v_cat from recette_ids;

  -- Aucun tarif configuré : aucune ligne, jamais un montant nul inventé.
  if exists (select 1 from public.resolve_pricing_rule(v_cli, v_veh)) then
    raise exception 'Un tarif a été proposé alors qu''aucun n''est configuré.';
  end if;

  -- Niveau 0 — standard global
  insert into public.pricing_rules (amount, unit) values (100000, 'DAY');
  select * into r from public.resolve_pricing_rule(v_cli, v_veh);
  if r.source <> 'STANDARD' or r.amount <> 100000 then
    raise exception 'Niveau standard non retenu : % / %', r.source, r.amount;
  end if;

  -- Niveau 1 — catégorie
  insert into public.pricing_rules (category_id, amount, unit) values (v_cat, 200000, 'DAY');
  select * into r from public.resolve_pricing_rule(v_cli, v_veh);
  if r.source <> 'CATEGORY' then raise exception 'Niveau catégorie non retenu : %', r.source; end if;

  -- Niveau 2 — véhicule
  insert into public.pricing_rules (vehicle_id, amount, unit) values (v_veh, 300000, 'DAY');
  select * into r from public.resolve_pricing_rule(v_cli, v_veh);
  if r.source <> 'VEHICLE' then raise exception 'Niveau véhicule non retenu : %', r.source; end if;

  -- Niveau 4 — client
  insert into public.pricing_rules (client_id, amount, unit) values (v_cli, 400000, 'DAY');
  select * into r from public.resolve_pricing_rule(v_cli, v_veh);
  if r.source <> 'CLIENT' then raise exception 'Niveau client non retenu : %', r.source; end if;

  -- Niveau 5 — client + catégorie
  insert into public.pricing_rules (client_id, category_id, amount, unit)
  values (v_cli, v_cat, 500000, 'DAY');
  select * into r from public.resolve_pricing_rule(v_cli, v_veh);
  if r.source <> 'CLIENT_CATEGORY' then
    raise exception 'Niveau client+catégorie non retenu : %', r.source;
  end if;

  -- Niveau 6 — client + véhicule : le plus spécifique gagne.
  insert into public.pricing_rules (client_id, vehicle_id, amount, unit)
  values (v_cli, v_veh, 450000, 'DAY');
  select * into r from public.resolve_pricing_rule(v_cli, v_veh);
  if r.source <> 'CLIENT_VEHICLE' or r.amount <> 450000 then
    raise exception 'Niveau client+véhicule non retenu : % / %', r.source, r.amount;
  end if;

  raise notice '[OK] 14. Les six niveaux de DEC-002 sont départagés dans le bon ordre.';
end $$;


-- --- 15. Égalité de spécificité, expiration et unité --------------------------
do $$
declare
  v_cli uuid;
  v_veh uuid;
  r     record;
begin
  select client_id, vehicle_id into v_cli, v_veh from recette_ids;

  -- À spécificité égale, la règle la plus récente s'applique (DEC-002).
  --
  -- `created_at` est renseigné explicitement : `now()` renvoie l'horodatage de
  -- la TRANSACTION, identique pour toutes les lignes insérées ici. En usage
  -- réel, chaque création est sa propre transaction et les horodatages diffèrent.
  insert into public.pricing_rules (client_id, vehicle_id, amount, unit, created_at)
  values (v_cli, v_veh, 470000, 'FLAT', now() + interval '1 minute');

  select * into r from public.resolve_pricing_rule(v_cli, v_veh);
  if r.amount <> 470000 or r.unit <> 'FLAT' then
    raise exception 'La règle la plus récente n''a pas prévalu : % / %', r.amount, r.unit;
  end if;

  -- Une condition expirée n'est plus candidate (Tiers §6.5).
  update public.pricing_rules
     set valid_to = current_date - 1
   where client_id = v_cli and vehicle_id = v_veh;

  select * into r from public.resolve_pricing_rule(v_cli, v_veh);
  if r.source <> 'CLIENT_CATEGORY' then
    raise exception 'Un tarif expiré a été appliqué (source retenue : %).', r.source;
  end if;

  raise notice '[OK] 15. Égalité résolue par la date, condition expirée écartée.';
end $$;


-- --- 16. Remise en pourcentage ------------------------------------------------
-- Tiers §6.4 — la remise s'applique au tarif de référence, jamais dans le vide.
do $$
declare
  v_cli uuid;
  v_veh uuid;
  r     record;
begin
  select client_id, vehicle_id into v_cli, v_veh from recette_ids;

  -- Les conditions client précédentes sont neutralisées pour isoler le contrôle.
  update public.pricing_rules set is_active = false where client_id = v_cli;

  -- Tarif véhicule de référence : 300 000 KMF. Remise client de 10 %.
  insert into public.pricing_rules (client_id, discount_percent) values (v_cli, 10);

  select * into r from public.resolve_pricing_rule(v_cli, v_veh);

  if r.source <> 'CLIENT_DISCOUNT' then
    raise exception 'La remise client n''a pas été retenue : %', r.source;
  end if;

  if r.base_amount <> 300000 or r.amount <> 270000 then
    raise exception 'Remise mal appliquée : base % → %', r.base_amount, r.amount;
  end if;

  if r.unit <> 'DAY' then
    raise exception 'La remise n''a pas hérité de l''unité du tarif de référence : %', r.unit;
  end if;

  raise notice '[OK] 16. Remise appliquée au tarif de référence, unité héritée, montant entier.';
end $$;


-- --- 17. Un tarif ne se supprime pas ------------------------------------------
do $$
declare
  v_id uuid;
begin
  select id into v_id from public.pricing_rules limit 1;

  -- Même condition que le contrôle 8 : une session utilisateur, pas une
  -- opération d'environnement.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', gen_random_uuid()::text)::text,
    true
  );

  begin
    delete from public.pricing_rules where id = v_id;
    perform set_config('request.jwt.claims', '', true);
    raise exception 'La suppression d''un tarif a été acceptée.';
  exception when insufficient_privilege then
    perform set_config('request.jwt.claims', '', true);
    raise notice '[OK] 17. Un tarif se désactive, il ne se supprime pas.';
  end;
end $$;


-- --- 18. Journal d'audit ------------------------------------------------------
do $$
declare
  v_sup   uuid;
  v_price int;
  v_leak  int;
begin
  select supplier_id into v_sup from recette_ids;

  select count(*) into v_price
  from public.audit_log
  where action = 'PRICE_CHANGE' and entity_type = 'pricing_rules';

  if v_price = 0 then
    raise exception 'Aucun changement de tarif n''a été journalisé.';
  end if;

  -- Les identifiants de règlement ne doivent jamais être recopiés dans le
  -- journal (05_Regles_Metier/06_Audit.md §79 et §80). Les DEUX formes sont
  -- éprouvées : bancaire et générique.
  insert into public.supplier_payment_details
    (supplier_id, kind, label, bank_name, account_number, iban)
  values
    (v_sup, 'BANK_ACCOUNT', 'Compte de recette', 'Recette Banque',
     '0001234567', 'KM0000000000000000');

  insert into public.supplier_payment_details
    (supplier_id, kind, label, account_reference)
  values
    (v_sup, 'OTHER', 'Coordonnée de recette', 'REF-RECETTE-0001');

  select count(*) into v_leak
  from public.audit_log
  where entity_type = 'supplier_payment_details'
    and (after_data ? 'account_number' or after_data ? 'iban'
         or after_data ? 'swift_bic' or after_data ? 'account_reference');

  if v_leak > 0 then
    raise exception 'Le journal d''audit contient des identifiants de règlement en clair.';
  end if;

  -- Le journal doit rester UTILE : il conserve ce qui identifie la coordonnée.
  if not exists (
    select 1 from public.audit_log
    where entity_type = 'supplier_payment_details' and after_data ? 'label'
  ) then
    raise exception 'Le journal ne permet plus de savoir quelle coordonnée a changé.';
  end if;

  -- Les coordonnées bancaires d'ADIKOM elle-même relèvent de la même règle.
  -- La colonne n'était couverte par aucune rédaction avant la migration 028.
  if public.fn_audit_redact('{"bank_account_details":"secret"}'::jsonb) ? 'bank_account_details'
  then
    raise exception 'Les coordonnées bancaires d''ADIKOM ne sont pas rédigées.';
  end if;

  -- Une seule coordonnée principale par fournisseur, imposée par la base.
  -- Les DEUX sont désignées principales d'un même mouvement : le déclencheur
  -- bascule l'ancienne, l'index unique garantit qu'aucune paire ne subsiste.
  update public.supplier_payment_details set is_primary = true where supplier_id = v_sup;

  select count(*) into v_leak
  from public.supplier_payment_details
  where supplier_id = v_sup and is_primary;

  if v_leak <> 1 then
    raise exception 'Coordonnées principales simultanées : % (une seule attendue).', v_leak;
  end if;

  -- Une coordonnée désactivée ne peut pas rester la coordonnée par défaut.
  update public.supplier_payment_details
     set is_active = false
   where supplier_id = v_sup and is_primary;

  if exists (
    select 1 from public.supplier_payment_details
    where supplier_id = v_sup and is_primary and not is_active
  ) then
    raise exception 'Une coordonnée désactivée est restée principale.';
  end if;

  raise notice '[OK] 18. Tarifs journalisés, identifiants de règlement rédigés, une seule coordonnée principale.';
end $$;


-- --- 19. Bucket de documents privé --------------------------------------------
do $$
declare
  v_public boolean;
begin
  select public into v_public from storage.buckets where id = 'vehicle-documents';

  if v_public is null then
    raise exception 'Le bucket « vehicle-documents » est absent.';
  end if;

  if v_public then
    raise exception 'Le bucket « vehicle-documents » est public : les documents seraient exposés.';
  end if;

  if exists (
    select 1 from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects'
      and coalesce(pg_get_expr(p.polqual, p.polrelid), '')
       || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%vehicle-documents%'
  ) then
    raise exception 'Une policy expose le bucket « vehicle-documents » : l''accès doit rester serveur.';
  end if;

  raise notice '[OK] 19. Bucket de documents privé, sans accès direct.';
end $$;


do $$ begin
  raise notice '';
  raise notice '[OK] Recette du référentiel d''exploitation complète — Étape 2.2.';
end $$;

rollback;
