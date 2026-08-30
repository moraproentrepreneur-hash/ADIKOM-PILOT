-- =============================================================================
-- ADIKOM PILOT — Recette de l'imputation fournisseur (Étape 2.4, LOT 4)
--
-- Vérifie ce que la BASE doit porter seule : structure, cohérence du dossier,
-- plafond, transitions, verrou, et surtout LA FRONTIÈRE — aucune facture,
-- aucun paiement, aucun solde, et « Imputée » hors d'atteinte tant que
-- l'Étape 2.5 n'existe pas (DEC-013).
--
-- Exécution :
--   npm run db:verify:imputations
--
-- Ce script s'exécute avec le rôle de la chaîne de connexion, qui contourne
-- RLS et les gardes de capacité (`current_actor()` y est NULL). Il contrôle
-- donc le SCHÉMA et les RÈGLES ; les capacités sont éprouvées avec de vraies
-- sessions par `verify:imputations` et `verify:capabilities`.
--
-- La transaction est annulée en fin de script : aucun résidu en base.
-- =============================================================================

begin;

create temporary table recette_imp (
  category_id uuid,
  supplier_a  uuid,
  supplier_b  uuid,
  supplier_c  uuid,
  vehicle_sup uuid,
  vehicle_own uuid,
  mnt_main    uuid,
  mnt_free    uuid,
  mnt_zero    uuid,
  mnt_cancel  uuid,
  imp_main    uuid
) on commit drop;

insert into recette_imp values (null, null, null, null, null, null, null, null, null, null, null);


-- --- 1. Structure ------------------------------------------------------------------
do $$
declare
  missing text[];
begin
  select array_agg(t) into missing
  from unnest(array['imputations', 'imputation_documents']) t
  where not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t);
  if missing is not null then
    raise exception 'Tables manquantes : %', missing;
  end if;

  if not exists (select 1 from pg_type where typname = 'imputation_status') then
    raise exception 'Type imputation_status manquant.';
  end if;

  -- Workflow 06 §13 : les cinq statuts documentés, et RIEN DE PLUS.
  if (select array_agg(e.enumlabel::text order by e.enumsortorder)
      from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'imputation_status')
     <> array['DRAFT', 'TO_VALIDATE', 'VALIDATED', 'IMPUTED', 'CANCELLED']::text[]
  then
    raise exception 'Statuts d''imputation inattendus.';
  end if;

  -- DEC-010 : entiers, jamais de flottant.
  select array_agg(table_name || '.' || column_name) into missing
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('imputations', 'imputation_documents')
    and data_type in ('numeric', 'money', 'real', 'double precision');
  if missing is not null then
    raise exception 'Type non entier pour un montant : % (DEC-010).', missing;
  end if;

  raise notice '[OK] 1. Table, type et cinq statuts conformes à Workflow 06 §13.';
end $$;


-- --- 2. AUCUNE SOURCE CONCURRENTE DES MONTANTS -----------------------------------------
--
-- Le LOT 3 porte l'estimation, le réel et l'imputable. Les recopier ici
-- créerait des valeurs capables de contredire celles dont elles découlent.
do $$
declare v_bad text[];
begin
  select array_agg(column_name) into v_bad
  from information_schema.columns
  where table_schema = 'public' and table_name = 'imputations'
    and column_name in (
      'estimated_cost', 'actual_cost', 'imputable_amount',
      'net_amount', 'balance', 'paid_amount', 'gross_amount'
    );

  if v_bad is not null then
    raise exception 'Colonne concurrente ou financière interdite sur imputations : %', v_bad;
  end if;

  raise notice '[OK] 2. Aucun coût recopié, aucun solde, aucun net à payer.';
end $$;


-- --- 3. L'ÉTAPE 2.5 N'EXISTE PAS -------------------------------------------------------
do $$
declare v_bad text[];
begin
  select array_agg(tablename) into v_bad
  from pg_tables
  where schemaname = 'public'
    and tablename in (
      'supplier_invoices', 'supplier_payments', 'customer_invoices',
      'payments', 'invoice_lines', 'supplier_balances'
    );

  if v_bad is not null then
    raise exception 'Le LOT 4 a créé des objets de l''Étape 2.5 : %', v_bad;
  end if;

  -- Le point d'accroche existe, sans clé étrangère : la cible n'existe pas.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'imputations'
      and column_name = 'supplier_invoice_id'
  ) then
    raise exception 'Le point d''accroche supplier_invoice_id est absent.';
  end if;

  raise notice '[OK] 3. Aucune facture, aucun paiement, aucun solde. Le point d''accroche seul.';
end $$;


-- --- 4. RLS, aucune suppression, lecture sous `imputations.view` -----------------------
do $$
declare
  tables text[] := array['imputations', 'imputation_documents'];
  faulty text[];
begin
  select array_agg(c.relname) into faulty
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = any(tables) and not c.relrowsecurity;
  if faulty is not null then raise exception 'RLS absente sur : %', faulty; end if;

  select array_agg(t) into faulty
  from unnest(tables) t
  where has_table_privilege('authenticated', 'public.' || t, 'DELETE');
  if faulty is not null then raise exception 'DELETE accordé sur : %', faulty; end if;

  select array_agg(t) into faulty
  from unnest(tables) t
  where has_table_privilege('anon', 'public.' || t, 'SELECT');
  if faulty is not null then raise exception 'SELECT accordé au rôle anon sur : %', faulty; end if;

  select array_agg(distinct p.tablename) into faulty
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = any(tables) and p.cmd in ('DELETE', 'ALL');
  if faulty is not null then raise exception 'Policy de suppression sur : %', faulty; end if;

  select array_agg(t) into faulty
  from unnest(tables) t
  where not exists (
    select 1 from pg_trigger
    where tgrelid = ('public.' || t)::regclass and not tgisinternal and tgname like '%no_delete%'
  );
  if faulty is not null then raise exception 'Anti-suppression absent sur : %', faulty; end if;

  select array_agg(p.tablename) into faulty
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = any(tables) and p.cmd = 'SELECT'
    and p.qual::text not like '%billing.imputations.view%';
  if faulty is not null then
    raise exception 'Lecture non protégée par imputations.view sur : %', faulty;
  end if;

  -- La création exige `imputations.create`, jamais une capacité de maintenance.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'imputations' and cmd = 'INSERT'
      and with_check::text not like '%billing.imputations.create%'
  ) then
    raise exception 'La création d''imputation n''exige pas `billing.imputations.create`.';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'imputations'
      and (qual::text like '%rental.maintenance%' or with_check::text like '%rental.maintenance%')
  ) then
    raise exception 'Une capacité de maintenance ouvre l''écriture des imputations.';
  end if;

  raise notice '[OK] 4. RLS active, anon muet, aucune suppression, aucune capacité voisine.';
end $$;


-- --- 5. AUCUNE FONCTION `SECURITY DEFINER` --------------------------------------------
do $$
declare v_bad text[];
begin
  select array_agg(p.proname) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and p.proname in (
      'create_imputation', 'update_imputation', 'submit_imputation',
      'validate_imputation', 'cancel_imputation',
      'fn_imputation_coherence', 'fn_imputation_ceiling',
      'fn_imputation_transition', 'fn_imputable_floor',
      'fn_imputation_documents_locked'
    );

  if v_bad is not null then
    raise exception 'Fonction SECURITY DEFINER interdite : %', v_bad;
  end if;

  -- DEC-022 : PUBLIC ne doit pas détenir l'exécution.
  select array_agg(p.proname) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'create_imputation', 'update_imputation', 'submit_imputation',
      'validate_imputation', 'cancel_imputation'
    )
    and has_function_privilege('public', p.oid, 'EXECUTE');

  if v_bad is not null then
    raise exception 'EXECUTE encore accordé à PUBLIC sur : % (DEC-022).', v_bad;
  end if;

  raise notice '[OK] 5. Aucune SECURITY DEFINER, aucune exécution ouverte à PUBLIC.';
end $$;


-- --- 6. Jeu de recette ------------------------------------------------------------------
do $$
declare
  v_cat  uuid; v_sa uuid; v_sb uuid; v_sc uuid;
  v_vs   uuid; v_vo uuid;
  v_main uuid; v_free uuid; v_zero uuid; v_cancel uuid;
begin
  insert into public.vehicle_categories (code, label)
  values ('RIMP-TEST', 'Recette imputations') returning id into v_cat;

  insert into public.suppliers (supplier_no, type, legal_name, phone, status)
  values (public.next_number('supplier'), 'VEHICLE_SUPPLIER', 'RECETTE IMP — Fournisseur A',
          '+269 000', 'ACTIVE')
  returning id into v_sa;

  insert into public.suppliers (supplier_no, type, legal_name, phone, status)
  values (public.next_number('supplier'), 'VEHICLE_SUPPLIER', 'RECETTE IMP — Fournisseur B',
          '+269 001', 'ACTIVE')
  returning id into v_sb;

  insert into public.suppliers (supplier_no, type, legal_name, phone, status)
  values (public.next_number('supplier'), 'MAINTENANCE_PROVIDER', 'RECETTE IMP — Garage C',
          '+269 002', 'ACTIVE')
  returning id into v_sc;

  -- Un véhicule FOURNI (origine SUPPLIED) et un véhicule ADIKOM.
  insert into public.vehicles
    (vehicle_no, category_id, brand, model, plate, origin, current_supplier_id, status)
  values (public.next_number('vehicle'), v_cat, 'RECETTE', 'IMP-SUP', 'RI-0001',
          'SUPPLIED', v_sa, 'AVAILABLE')
  returning id into v_vs;

  insert into public.vehicles (vehicle_no, category_id, brand, model, plate, origin, status)
  values (public.next_number('vehicle'), v_cat, 'RECETTE', 'IMP-OWN', 'RI-0002',
          'OWNED', 'AVAILABLE')
  returning id into v_vo;

  -- Le fournisseur B a fourni ce véhicule par le passé : §33 « ou qu'une autre
  -- relation justifie l'imputation ».
  insert into public.vehicle_supplier_history (vehicle_id, supplier_id, started_on, ended_on)
  values (v_vs, v_sb, current_date - 400, current_date - 200);

  v_main := public.create_maintenance(
    p_vehicle_id => v_vs, p_origin => 'BREAKDOWN', p_reason => 'Panne mécanique imputable',
    p_provider_supplier_id => v_sc);

  v_free := public.create_maintenance(
    p_vehicle_id => v_vo, p_origin => 'BREAKDOWN', p_reason => 'Véhicule ADIKOM');

  v_zero := public.create_maintenance(
    p_vehicle_id => v_vs, p_origin => 'INSPECTION', p_reason => 'Charge ADIKOM');

  v_cancel := public.create_maintenance(
    p_vehicle_id => v_vs, p_origin => 'OTHER', p_reason => 'Intervention abandonnée');

  -- Workflow 06 §51 : coût réel 300 000, imputable 300 000.
  perform public.record_maintenance_costs(v_main, 250000, 300000, 300000);
  perform public.record_maintenance_costs(v_free, null, 300000, 300000);
  -- §10 : montant imputable nul — charge supportée par ADIKOM.
  perform public.record_maintenance_costs(v_zero, null, 120000, 0);
  perform public.record_maintenance_costs(v_cancel, null, 90000, 90000);
  perform public.cancel_maintenance(v_cancel, 'Recette');

  update recette_imp set
    category_id = v_cat, supplier_a = v_sa, supplier_b = v_sb, supplier_c = v_sc,
    vehicle_sup = v_vs, vehicle_own = v_vo,
    mnt_main = v_main, mnt_free = v_free, mnt_zero = v_zero, mnt_cancel = v_cancel;

  raise notice '[OK] 6. Jeu de recette : 3 fournisseurs, 2 véhicules, 4 maintenances chiffrées.';
end $$;


-- --- 7. Numérotation IMP-2026-000001 ------------------------------------------------------
do $$
declare
  r      public.numbering_rules%rowtype;
  v_id   uuid;
  v_no   text;
begin
  select * into r from public.numbering_rules where entity_key = 'imputation';

  if not found then raise exception 'Règle de numérotation « imputation » absente.'; end if;
  if r.prefix <> 'IMP' or not r.include_year or r.padding <> 6 or not r.reset_yearly then
    raise exception 'Règle IMP altérée : % / % / % / %',
      r.prefix, r.include_year, r.padding, r.reset_yearly;
  end if;

  v_id := public.create_imputation(
    (select mnt_main from recette_imp),
    (select supplier_a from recette_imp),
    200000,
    'Panne mécanique imputable au fournisseur selon les conditions de mise à disposition.');

  select imputation_no into v_no from public.imputations where id = v_id;

  if v_no !~ '^IMP-\d{4}-\d{6}$' then
    raise exception 'Numéro inattendu : %', v_no;
  end if;

  update recette_imp set imp_main = v_id;

  raise notice '[OK] 7. Règle IMP intacte, numéro produit : %.', v_no;
end $$;


-- --- 8. L'imputation naît en BROUILLON, sans effet ---------------------------------------
do $$
declare i public.imputations%rowtype;
begin
  select * into i from public.imputations where id = (select imp_main from recette_imp);

  if i.status <> 'DRAFT' then raise exception 'Statut initial inattendu : %', i.status; end if;
  if i.supplier_invoice_id is not null then raise exception 'Une facture est rattachée.'; end if;
  if i.validated_at is not null or i.imputed_at is not null then
    raise exception 'Une imputation neuve porte une date de validation ou d''imputation.';
  end if;

  -- Le LOT 3 n'a pas bougé : le plafond reste ce qu'il était.
  if (select imputable_amount from public.maintenance_costs
      where maintenance_id = i.maintenance_id) <> 300000 then
    raise exception 'Créer une imputation a modifié le montant imputable.';
  end if;

  raise notice '[OK] 8. Brouillon, sans facture, sans effet sur le LOT 3.';
end $$;


-- --- 9. LE PLAFOND — Module 07 §40 et §41 -------------------------------------------------
do $$
declare
  v_mnt uuid := (select mnt_main from recette_imp);
  v_sup uuid := (select supplier_a from recette_imp);
  v_ok  boolean;
begin
  -- 200 000 déjà imputés sur un plafond de 300 000 : 100 001 dépasserait.
  begin
    perform public.create_imputation(v_mnt, v_sup, 100001, 'Dépassement volontaire');
    raise exception 'ÉCHEC : le plafond a laissé passer un dépassement.';
  exception when check_violation then null;
  end;

  -- 100 000 : le solde exact du plafond. Une imputation partielle est permise
  -- (§9, §52), et plusieurs imputations coexistent (Module 07 §40).
  perform public.create_imputation(v_mnt, v_sup, 100000, 'Solde du montant imputable');

  if (select coalesce(sum(amount), 0) from public.imputations
      where maintenance_id = v_mnt and status <> 'CANCELLED') <> 300000 then
    raise exception 'Total imputé inattendu.';
  end if;

  -- Le plafond est atteint : plus rien ne passe, fût-ce 1 KMF (Module 05 §46).
  begin
    perform public.create_imputation(v_mnt, v_sup, 1, 'Une dépense imputée deux fois');
    raise exception 'ÉCHEC : une dépense a pu être imputée au-delà du plafond.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 9. Plafond respecté au KMF près ; imputation partielle et multiple permises.';
end $$;


-- --- 10. Plafond absent, plafond nul --------------------------------------------------------
do $$
declare
  v_zero uuid := (select mnt_zero from recette_imp);
  v_sup  uuid := (select supplier_a from recette_imp);
  v_veh  uuid := (select vehicle_sup from recette_imp);
  v_new  uuid;
begin
  -- §10 : montant imputable nul → aucune imputation.
  begin
    perform public.create_imputation(v_zero, v_sup, 50000, 'Tentative sur charge ADIKOM');
    raise exception 'ÉCHEC : une imputation a été créée sur un imputable nul.';
  exception when check_violation then null;
  end;

  -- Plafond non arrêté → refus (DEC-008 : signaler plutôt qu'inventer).
  v_new := public.create_maintenance(
    p_vehicle_id => v_veh, p_origin => 'OTHER', p_reason => 'Sans montant imputable');

  begin
    perform public.create_imputation(v_new, v_sup, 10000, 'Tentative sans plafond');
    raise exception 'ÉCHEC : une imputation a été créée sans montant imputable arrêté.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 10. Imputable nul ou non arrêté : refus, jamais un plafond implicite.';
end $$;


-- --- 11. COHÉRENCE VÉHICULE / FOURNISSEUR — §33 ---------------------------------------------
do $$
declare
  v_main uuid := (select mnt_main from recette_imp);
  v_free uuid := (select mnt_free from recette_imp);
  v_sb   uuid := (select supplier_b from recette_imp);
  v_sc   uuid := (select supplier_c from recette_imp);
  v_can  uuid := (select mnt_cancel from recette_imp);
  v_sa   uuid := (select supplier_a from recette_imp);
begin
  -- Un fournisseur sans aucune relation avec le véhicule : refusé.
  begin
    perform public.create_imputation(v_main, v_sc, 1000, 'Fournisseur étranger au véhicule');
    raise exception 'ÉCHEC : imputation à un fournisseur étranger au véhicule.';
  exception when check_violation then null;
  end;

  -- Un véhicule ADIKOM : aucune imputation fournisseur possible (§4).
  begin
    perform public.create_imputation(v_free, v_sa, 1000, 'Véhicule ADIKOM');
    raise exception 'ÉCHEC : imputation sur un véhicule non fourni.';
  exception when check_violation then null;
  end;

  -- Une maintenance annulée ne produit aucune dépense imputable.
  begin
    perform public.create_imputation(v_can, v_sa, 1000, 'Maintenance annulée');
    raise exception 'ÉCHEC : imputation sur une maintenance annulée.';
  exception when check_violation then null;
  end;

  -- §33 « ou qu'une autre relation justifie l'imputation » : un ancien
  -- fournisseur du véhicule reste recevable. Le plafond de `mnt_main` est
  -- épuisé : on éprouve la cohérence sur une maintenance neuve.
  declare
    v_veh uuid := (select vehicle_sup from recette_imp);
    v_new uuid;
  begin
    v_new := public.create_maintenance(
      p_vehicle_id => v_veh, p_origin => 'BREAKDOWN', p_reason => 'Ancien fournisseur');
    perform public.record_maintenance_costs(v_new, null, 80000, 80000);
    perform public.create_imputation(v_new, v_sb, 80000, 'Panne survenue sous l''ancien contrat');
  end;

  raise notice '[OK] 11. Fournisseur étranger, véhicule ADIKOM et maintenance annulée refusés.';
end $$;


-- --- 12. TRANSITIONS — Workflow 06 §13 -------------------------------------------------------
do $$
declare
  v_id uuid := (select imp_main from recette_imp);
  i    public.imputations%rowtype;
begin
  -- On ne valide pas un brouillon : §12 distingue préparation et validation.
  begin
    perform public.validate_imputation(v_id);
    raise exception 'ÉCHEC : un brouillon a été validé directement.';
  exception when check_violation then null;
  end;

  perform public.submit_imputation(v_id);
  select * into i from public.imputations where id = v_id;
  if i.status <> 'TO_VALIDATE' then raise exception 'Soumission sans effet : %', i.status; end if;

  perform public.validate_imputation(v_id, 'Conforme aux conditions de mise à disposition');
  select * into i from public.imputations where id = v_id;
  if i.status <> 'VALIDATED' then raise exception 'Validation sans effet : %', i.status; end if;
  if i.validated_at is null then raise exception 'Validation non datée (§48).'; end if;

  -- Une décision ne se reprend pas : la resoumettre est refusée.
  begin
    perform public.submit_imputation(v_id);
    raise exception 'ÉCHEC : une imputation validée a été resoumise.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 12. Brouillon → À valider → Validée. Validation datée, non reprise.';
end $$;


-- --- 13. LA FRONTIÈRE DE L'ÉTAPE 2.5 — DEC-013 ------------------------------------------------
--
-- LE CONTRÔLE LE PLUS IMPORTANT DU LOT.
do $$
declare
  v_id uuid := (select imp_main from recette_imp);
  i    public.imputations%rowtype;
begin
  -- Passer à « Imputée » suppose une facture : refusé, avec son motif.
  begin
    update public.imputations set status = 'IMPUTED' where id = v_id;
    raise exception 'ÉCHEC : une imputation est passée à « Imputée » sans facture.';
  exception when check_violation then null;
  end;

  -- Rattacher une facture forgée : refusé.
  begin
    update public.imputations set supplier_invoice_id = gen_random_uuid() where id = v_id;
    raise exception 'ÉCHEC : une facture forgée a été rattachée.';
  exception when check_violation then null;
  end;

  -- Et les deux ensemble, ce que la contrainte seule ne suffirait pas à voir.
  begin
    update public.imputations
       set status = 'IMPUTED', supplier_invoice_id = gen_random_uuid(), imputed_at = now()
     where id = v_id;
    raise exception 'ÉCHEC : « Imputée » atteinte avec une facture forgée.';
  exception when check_violation then null;
  end;

  select * into i from public.imputations where id = v_id;
  if i.status <> 'VALIDATED' or i.supplier_invoice_id is not null then
    raise exception 'L''imputation a bougé : % / %', i.status, i.supplier_invoice_id;
  end if;

  raise notice '[OK] 13. « Imputée » hors d''atteinte, facture forgée refusée (DEC-013).';
end $$;


-- --- 14. VERROU APRÈS VALIDATION — §39 ----------------------------------------------------------
do $$
declare
  v_id uuid := (select imp_main from recette_imp);
begin
  begin
    perform public.update_imputation(v_id, 150000, 'Correction après coup');
    raise exception 'ÉCHEC : une imputation validée a été modifiée.';
  exception when check_violation then null;
  end;

  -- Et par PATCH direct, hors de toute fonction.
  begin
    update public.imputations set amount = 150000 where id = v_id;
    raise exception 'ÉCHEC : PATCH direct du montant d''une imputation validée.';
  exception when check_violation then null;
  end;

  begin
    update public.imputations set justification = 'Autre motif' where id = v_id;
    raise exception 'ÉCHEC : PATCH direct de la justification d''une imputation validée.';
  exception when check_violation then null;
  end;

  if (select amount from public.imputations where id = v_id) <> 200000 then
    raise exception 'Le montant a bougé.';
  end if;

  raise notice '[OK] 14. Montant, fournisseur et justification figés après validation.';
end $$;


-- --- 15. ANNULATION — §40 et §54 -------------------------------------------------------------
do $$
declare
  v_id  uuid := (select imp_main from recette_imp);
  v_mnt uuid := (select mnt_main from recette_imp);
  v_sup uuid := (select supplier_a from recette_imp);
  i     public.imputations%rowtype;
begin
  perform public.cancel_imputation(v_id, 'Erreur constatée');

  select * into i from public.imputations where id = v_id;
  if i.status <> 'CANCELLED' then raise exception 'Annulation sans effet : %', i.status; end if;
  if i.cancelled_at is null then raise exception 'Annulation non datée.'; end if;

  -- L'historique reste : la ligne existe toujours, avec son montant.
  if i.amount <> 200000 then raise exception 'L''annulation a effacé le montant.'; end if;

  -- §40 : « le montant précédemment déduit est réintégré ». Le plafond
  -- redevient disponible à hauteur de ce que l'imputation consommait.
  perform public.create_imputation(v_mnt, v_sup, 200000, 'Reprise après annulation');

  if (select coalesce(sum(amount), 0) from public.imputations
      where maintenance_id = v_mnt and status <> 'CANCELLED') <> 300000 then
    raise exception 'Le plafond n''a pas été rendu par l''annulation.';
  end if;

  -- Une imputation annulée ne se ranime pas.
  begin
    update public.imputations set status = 'DRAFT' where id = v_id;
    raise exception 'ÉCHEC : une imputation annulée a été ranimée.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 15. Annulation historisée, plafond rendu, état terminal.';
end $$;


-- --- 16. AUCUNE SUPPRESSION — CLAUDE.md §22 ---------------------------------------------------
--
-- `fn_forbid_delete` laisse passer hors session applicative (migration 021) :
-- on éprouve donc le déclencheur lui-même en simulant un acteur.
do $$
declare
  v_id    uuid := (select imp_main from recette_imp);
  v_actor uuid := (select id from public.app_users order by created_at limit 1);
begin
  if v_actor is null then
    raise notice '[--] 16. Aucun utilisateur en base : contrôle de suppression non joué.';
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_actor)::text, true);

  begin
    delete from public.imputations where id = v_id;
    raise exception 'ÉCHEC : une imputation a été supprimée.';
  exception when insufficient_privilege or check_violation or raise_exception then null;
  end;

  perform set_config('request.jwt.claims', '', true);

  if not exists (select 1 from public.imputations where id = v_id) then
    raise exception 'L''imputation a disparu.';
  end if;

  raise notice '[OK] 16. Aucune suppression physique possible sous session applicative.';
end $$;


-- --- 17. LE PLAFOND NE DESCEND PAS SOUS LE DÉJÀ-IMPUTÉ ------------------------------------------
--
-- Le garde s'efface hors session applicative (convention de la migration 021) :
-- on simule donc un acteur, comme au contrôle 16.
do $$
declare
  v_mnt   uuid := (select mnt_main from recette_imp);
  v_actor uuid := (select id from public.app_users where is_super_admin order by created_at limit 1);
begin
  if v_actor is null then
    raise notice '[--] 17. Aucun Super Admin en base : contrôle du plancher non joué.';
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_actor)::text, true);

  -- 300 000 sont imputés (200 000 repris + 100 000). Descendre à 250 000
  -- rendrait le total supérieur au plafond sans qu'aucune imputation ne bouge.
  begin
    perform public.record_maintenance_costs(v_mnt, 250000, 300000, 250000);
    raise exception 'ÉCHEC : le montant imputable est descendu sous le déjà-imputé.';
  exception when check_violation then null;
  end;

  -- L'augmenter reste possible : rien n'est invalidé.
  perform public.record_maintenance_costs(v_mnt, 250000, 400000, 350000);

  if (select imputable_amount from public.maintenance_costs where maintenance_id = v_mnt) <> 350000
  then
    raise exception 'Le relèvement du plafond n''a pas été enregistré.';
  end if;

  perform set_config('request.jwt.claims', '', true);

  raise notice '[OK] 17. Plafond non abaissable sous le déjà-imputé ; relèvement permis.';
end $$;


-- --- 18. LE LOT 4 NE TOUCHE À RIEN D'AUTRE ---------------------------------------------------
do $$
declare
  v_mnt uuid := (select mnt_main from recette_imp);
  v_veh uuid := (select vehicle_sup from recette_imp);
begin
  -- Aucune occupation posée ou levée par une imputation.
  if exists (
    select 1 from public.vehicle_occupations
    where vehicle_id = v_veh and source = 'MAINTENANCE' and source_id = v_mnt
  ) then
    raise exception 'Une occupation est apparue : la maintenance n''immobilisait pas.';
  end if;

  -- Le véhicule et la maintenance n'ont pas changé d'état.
  if (select status from public.vehicles where id = v_veh) <> 'AVAILABLE' then
    raise exception 'Le statut du véhicule a changé.';
  end if;

  if (select status from public.vehicle_maintenances where id = v_mnt) <> 'DRAFT' then
    raise exception 'Le statut de la maintenance a changé.';
  end if;

  -- Aucun incident, aucun dommage n'a reçu de montant.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name in ('vehicle_incidents', 'incident_damages')
      and (column_name ~ 'amount|cost|montant' or data_type in ('numeric', 'money'))
  ) then
    raise exception 'Un montant est apparu sur les incidents ou les dommages.';
  end if;

  raise notice '[OK] 18. Ni calendrier, ni parc, ni maintenance, ni dommage touchés.';
end $$;


-- --- 19. JUSTIFICATIFS — §35, §38, §39 ---------------------------------------------------------
do $$
declare
  v_mnt uuid := (select mnt_main from recette_imp);
  v_sup uuid := (select supplier_a from recette_imp);
  v_new uuid;
  v_doc uuid;
begin
  -- Le plafond vient d'être relevé à 350 000 : 50 000 restent disponibles.
  v_new := public.create_imputation(v_mnt, v_sup, 50000, 'Imputation avec justificatif');

  insert into public.imputation_documents
    (imputation_id, doc_type, label, storage_path, file_name)
  values (v_new, 'INVOICE', 'Facture garage', 'imputations/' || v_new || '/facture.pdf',
          'facture.pdf')
  returning id into v_doc;

  -- Le préfixe est celui du LOT 4, dans le bucket existant.
  if (select storage_path from public.imputation_documents where id = v_doc)
     not like 'imputations/%' then
    raise exception 'Préfixe de stockage inattendu.';
  end if;

  perform public.submit_imputation(v_new);
  perform public.validate_imputation(v_new);

  -- §39 : une fois validée, la pièce qui la fonde ne change plus.
  begin
    insert into public.imputation_documents
      (imputation_id, doc_type, label, storage_path, file_name)
    values (v_new, 'RECEIPT', 'Ajout tardif', 'imputations/' || v_new || '/tard.pdf', 'tard.pdf');
    raise exception 'ÉCHEC : un justificatif a été ajouté après validation.';
  exception when check_violation then null;
  end;

  begin
    update public.imputation_documents set is_archived = true where id = v_doc;
    raise exception 'ÉCHEC : un justificatif a été archivé après validation.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 19. Justificatifs sous préfixe dédié, figés dès la validation.';
end $$;


-- --- 20. AUDIT — Règles audit §19 --------------------------------------------------------------
do $$
declare
  v_id    uuid := (select imp_main from recette_imp);
  v_count int;
begin
  select count(*) into v_count
  from public.audit_log
  where entity_type = 'imputations' and entity_id = v_id::text;

  -- Création, soumission, validation, annulation : au moins quatre traces.
  if v_count < 4 then
    raise exception 'Journal d''audit incomplet : % entrée(s) pour l''imputation.', v_count;
  end if;

  if not exists (
    select 1 from public.audit_log
    where entity_type = 'imputations' and entity_id = v_id::text
      and action = 'STATUS_CHANGE'
      and after_data ->> 'status' = 'VALIDATED'
  ) then
    raise exception 'La validation n''est pas journalisée avec son avant/après.';
  end if;

  if not exists (
    select 1 from public.audit_log
    where entity_type = 'imputations' and entity_id = v_id::text and module_code = 'billing'
  ) then
    raise exception 'Le module d''origine n''est pas « billing ».';
  end if;

  raise notice '[OK] 20. Chaque acte laisse sa trace : % entrées.', v_count;
end $$;


-- --- 21. Aucune donnée DEMO touchée --------------------------------------------------------------
do $$
declare v_demo int;
begin
  select count(*) into v_demo from public.vehicles where model like '%DEMO%';
  if v_demo <> 3 then
    raise exception 'Les véhicules DEMO ont bougé : % au lieu de 3.', v_demo;
  end if;

  select count(*) into v_demo
  from public.imputations i
  join public.vehicle_maintenances m on m.id = i.maintenance_id
  join public.vehicles v on v.id = m.vehicle_id
  where v.model like '%DEMO%';

  if v_demo <> 0 then
    raise exception 'Une imputation de recette porte sur un véhicule DEMO.';
  end if;

  raise notice '[OK] 21. Données DEMO intactes, aucune imputation de recette sur elles.';
end $$;


do $$ begin
  raise notice '';
  raise notice '[OK] Recette de l''imputation fournisseur complète — Étape 2.4, LOT 4.';
  raise notice '     Transaction annulée : aucun résidu en base.';
end $$;

rollback;
