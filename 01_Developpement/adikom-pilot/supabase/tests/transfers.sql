-- =============================================================================
-- ADIKOM PILOT — Recette Virement interne et Paiements divers (LOT 17)
--
-- Vérifie ce que la BASE doit porter seule : les deux tables, leurs états, la
-- double écriture indissociable du virement, le contrôle de solde de §30, et
-- l'impossibilité de produire une moitié de virement.
--
-- Exécution :
--   npm run db:verify:transfers
--
-- Ce script s'exécute avec le rôle de la chaîne de connexion, qui contourne
-- RLS et les gardes de capacité (`current_actor()` y est NULL). Il contrôle
-- donc le SCHÉMA et les RÈGLES ; les capacités sont éprouvées avec de vraies
-- sessions par `verify:transfers` et `verify:capabilities`.
--
-- LES CONTRÔLES DIFFÉRÉS SONT FORCÉS À S'EXÉCUTER
--
-- Les gardes de cohérence sont `deferrable initially deferred` : elles ne
-- s'exécutent qu'à la validation de la transaction, que ce script ne fait
-- jamais. `set constraints all immediate` les déclenche donc explicitement,
-- à l'intérieur d'un sous-bloc dont l'échec est attendu.
--
-- La transaction est annulée en fin de script : aucun résidu en base.
-- =============================================================================

begin;

create temporary table recette_vir (
  src      uuid,
  dst      uuid,
  autre    uuid,
  transfer uuid,
  misc     uuid
) on commit drop;

insert into recette_vir values (null, null, null, null, null);


-- --- 1. Structure ------------------------------------------------------------------
do $$
declare missing text[];
begin
  select array_agg(t) into missing
  from unnest(array['internal_transfers', 'misc_payments']) t
  where not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t);
  if missing is not null then
    raise exception 'Tables manquantes : %', missing;
  end if;

  select array_agg(t) into missing
  from unnest(array[
    'internal_transfer_status', 'misc_payment_status', 'misc_payment_category'
  ]) t
  where not exists (select 1 from pg_type where typname = t);
  if missing is not null then
    raise exception 'Types manquants : %', missing;
  end if;

  -- Module 07 §46, mot pour mot : Brouillon ; Validé ; Annulé.
  if (select array_agg(e.enumlabel::text order by e.enumsortorder)
      from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'misc_payment_status') <> array['DRAFT', 'VALIDATED', 'CANCELLED']::text[]
  then
    raise exception 'États de paiement divers inattendus.';
  end if;

  if (select array_agg(e.enumlabel::text order by e.enumsortorder)
      from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'internal_transfer_status') <> array['DRAFT', 'VALIDATED', 'CANCELLED']::text[]
  then
    raise exception 'États de virement inattendus.';
  end if;

  -- Module 07 §43 : les quatre cas cités, ni plus ni moins.
  if (select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'misc_payment_category') <> 4
  then
    raise exception 'Catégories de paiement divers inattendues.';
  end if;

  -- DEC-010 : entiers, jamais de flottant.
  select array_agg(table_name || '.' || column_name) into missing
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('internal_transfers', 'misc_payments')
    and data_type in ('numeric', 'money', 'real', 'double precision');
  if missing is not null then
    raise exception 'Montants en flottant : %', missing;
  end if;

  -- §17 : aucun solde stocké, ici non plus.
  select array_agg(table_name || '.' || column_name) into missing
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('internal_transfers', 'misc_payments')
    and column_name in ('balance', 'solde', 'account_balance');
  if missing is not null then
    raise exception 'Solde stocké : %', missing;
  end if;

  raise notice '[OK] 1. Deux tables, trois types, aucun montant flottant, aucun solde stocké.';
end $$;


-- --- 2. Le catalogue porte les onze capacités du lot -------------------------------
do $$
declare
  v_total   int;
  v_missing text[];
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 178 then
    raise exception 'Le catalogue compte % capacités, 178 attendues.', v_total;
  end if;

  select array_agg(c) into v_missing
  from unnest(array[
    'treasury.transfers.view', 'treasury.transfers.create',
    'treasury.transfers.validate', 'treasury.transfers.cancel',
    'billing.misc_payments.view', 'billing.misc_payments.create',
    'billing.misc_payments.validate', 'billing.misc_payments.cancel'
  ]) c
  where not exists (select 1 from public.permissions p where p.code = c);
  if v_missing is not null then
    raise exception 'Capacités absentes : %', v_missing;
  end if;

  -- DEC-024 : aucune capacité de modification n'est créée pour ces menus.
  if exists (
    select 1 from public.permissions
    where code in ('treasury.transfers.update', 'billing.misc_payments.update',
                   'treasury.transfers.export', 'billing.misc_payments.export')
  ) then
    raise exception 'Capacité non prévue créée : le catalogue a été surchargé.';
  end if;

  raise notice '[OK] 2. Catalogue à 178 : la lecture des virements est créée, rien d''autre.';
end $$;


-- --- 3. Deux comptes, et un troisième dans une autre devise ------------------------
do $$
declare
  v_src   uuid;
  v_dst   uuid;
  v_autre uuid;
begin
  v_src := public.create_financial_account(
    'CASH', 'RECETTE VIR — Caisse source', 'Responsable', null, 1000000, current_date, null
  );
  v_dst := public.create_financial_account(
    'BANK', 'RECETTE VIR — Banque destination', 'Banque', null, 200000, current_date, null
  );
  v_autre := public.create_financial_account(
    'BANK', 'RECETTE VIR — Compte en devise', 'Banque', null, 0, current_date, null
  );

  update public.financial_accounts set currency_code = 'EUR' where id = v_autre;

  update recette_vir set src = v_src, dst = v_dst, autre = v_autre;

  raise notice '[OK] 3. Source à 1 000 000 KMF, destination à 200 000 KMF, un compte en EUR.';
end $$;


-- --- 4. Ce qu'un virement refuse à la saisie --------------------------------------
do $$
declare
  r recette_vir%rowtype;
  ok int := 0;
begin
  select * into r from recette_vir;

  -- §29 : source et destination distinctes.
  begin
    perform public.create_internal_transfer(r.src, r.src, 50000, current_date);
    raise exception 'Un virement d''un compte vers lui-même a été accepté.';
  exception when check_violation then ok := ok + 1;
  end;

  -- DEC-010 : montant entier positif.
  begin
    perform public.create_internal_transfer(r.src, r.dst, 0, current_date);
    raise exception 'Un virement de montant nul a été accepté.';
  exception when check_violation then ok := ok + 1;
  end;

  begin
    perform public.create_internal_transfer(r.src, r.dst, -50000, current_date);
    raise exception 'Un virement de montant négatif a été accepté.';
  exception when check_violation then ok := ok + 1;
  end;

  -- §29 : la date est obligatoire.
  begin
    perform public.create_internal_transfer(r.src, r.dst, 50000, null);
    raise exception 'Un virement sans date a été accepté.';
  exception when check_violation then ok := ok + 1;
  end;

  -- Devises différentes : aucune conversion n'est définie.
  begin
    perform public.create_internal_transfer(r.src, r.autre, 50000, current_date);
    raise exception 'Un virement entre deux devises a été accepté.';
  exception when check_violation then ok := ok + 1;
  end;

  -- §10 : un compte archivé ne reçoit plus d'opération, des deux côtés.
  perform public.set_financial_account_status(r.autre, 'ARCHIVED', 'Recette');
  update public.financial_accounts set currency_code = 'KMF' where id = r.autre;

  begin
    perform public.create_internal_transfer(r.autre, r.dst, 50000, current_date);
    raise exception 'Un virement DEPUIS un compte archivé a été accepté.';
  exception when check_violation then ok := ok + 1;
  end;

  begin
    perform public.create_internal_transfer(r.src, r.autre, 50000, current_date);
    raise exception 'Un virement VERS un compte archivé a été accepté.';
  exception when check_violation then ok := ok + 1;
  end;

  if ok <> 7 then
    raise exception 'Sept refus attendus à la saisie, % obtenus.', ok;
  end if;

  raise notice '[OK] 4. Comptes identiques, montant invalide, date absente, devises et comptes archivés : sept refus.';
end $$;


-- --- 5. Un virement naît en brouillon, sans écriture -------------------------------
do $$
declare
  r      recette_vir%rowtype;
  v_id   uuid;
  t      public.internal_transfers%rowtype;
  v_cnt  int;
begin
  select * into r from recette_vir;

  v_id := public.create_internal_transfer(
    r.src, r.dst, 300000, current_date, 'Approvisionnement de la banque', 'REC-VIR', 'Recette'
  );
  update recette_vir set transfer = v_id;

  select * into t from public.internal_transfers where id = v_id;

  if t.status <> 'DRAFT' then
    raise exception 'Un virement devrait naître en brouillon, obtenu %.', t.status;
  end if;

  if t.transfer_no not like 'VIR-%' then
    raise exception 'Numérotation inattendue : % (règle « transfer », DEC-005).', t.transfer_no;
  end if;

  if t.currency_code <> 'KMF' then
    raise exception 'La devise devrait être reprise des comptes, obtenu %.', t.currency_code;
  end if;

  select count(*) into v_cnt
  from public.treasury_entries where internal_transfer_id = v_id;

  if v_cnt <> 0 then
    raise exception 'Un brouillon ne produit aucune écriture, % trouvée(s).', v_cnt;
  end if;

  raise notice '[OK] 5. Brouillon numéroté VIR, devise reprise des comptes, aucune écriture.';
end $$;


-- --- 6. Ce que le brouillon refuse encore ------------------------------------------
do $$
declare
  r  recette_vir%rowtype;
  ok int := 0;
begin
  select * into r from recette_vir;

  -- Une écriture ne peut pas se réclamer d'un virement non validé.
  begin
    insert into public.treasury_entries
      (account_id, entry_date, direction, kind, amount, internal_transfer_id)
    values (r.src, current_date, 'OUT', 'TRANSFER', 300000, r.transfer);
    raise exception 'Une écriture adossée à un brouillon a été acceptée.';
  exception when check_violation then ok := ok + 1;
  end;

  -- Une écriture de genre « virement » sans virement d'origine.
  begin
    insert into public.treasury_entries
      (account_id, entry_date, direction, kind, amount)
    values (r.src, current_date, 'OUT', 'TRANSFER', 300000);
    raise exception 'Une écriture de virement sans origine a été acceptée.';
  exception when check_violation then ok := ok + 1;
  end;

  -- Le montant, les comptes et la date se figent dès la saisie.
  begin
    update public.internal_transfers set amount = 400000 where id = r.transfer;
    raise exception 'Le montant d''un virement a pu être modifié.';
  exception when check_violation then ok := ok + 1;
  end;

  begin
    update public.internal_transfers set source_account_id = r.dst,
                                         destination_account_id = r.src
     where id = r.transfer;
    raise exception 'Les comptes d''un virement ont pu être échangés.';
  exception when check_violation then ok := ok + 1;
  end;

  -- Migration 074 : ce qui EXPLIQUE le virement se fige comme le virement (§32).
  begin
    update public.internal_transfers set purpose = 'Motif réécrit' where id = r.transfer;
    raise exception 'Le motif d''un virement a pu être réécrit.';
  exception when check_violation then ok := ok + 1;
  end;

  -- Un virement ne naît jamais validé, même par INSERT direct.
  begin
    insert into public.internal_transfers
      (transfer_no, source_account_id, destination_account_id, amount, transfer_date,
       status, validated_at)
    values ('VIR-RECETTE-1', r.src, r.dst, 1000, current_date, 'VALIDATED', now());
    raise exception 'Un virement a pu naître validé par INSERT direct.';
  exception when check_violation then ok := ok + 1;
  end;

  if ok <> 6 then
    raise exception 'Six refus attendus sur le brouillon, % obtenus.', ok;
  end if;

  /*
   * La suppression n'est pas éprouvée par un `delete` ici : `fn_forbid_delete`
   * laisse passer la clé de service (migration 044), et ce script en est une.
   * Ce sont donc le retrait du droit et la présence du déclencheur qui sont
   * vérifiés — c'est eux qui protègent la session applicative.
   */
  if has_table_privilege('authenticated', 'public.internal_transfers', 'DELETE') then
    raise exception 'Le rôle applicatif peut supprimer un virement.';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.internal_transfers'::regclass
      and tgname = 'internal_transfers_no_delete'
  ) then
    raise exception 'Le déclencheur d''interdiction de suppression est absent.';
  end if;

  raise notice '[OK] 6. Écriture anticipée, écriture orpheline, montant, comptes, motif, INSERT validé : six refus, et la suppression est fermée.';
end $$;


-- --- 7. Le contrôle de solde de §30 -------------------------------------------------
do $$
declare
  r    recette_vir%rowtype;
  v_id uuid;
begin
  select * into r from recette_vir;

  -- Le compte source porte 1 000 000 KMF : un virement de 1 000 001 est refusé.
  v_id := public.create_internal_transfer(r.src, r.dst, 1000001, current_date, 'Trop gros');

  begin
    perform public.validate_internal_transfer(v_id);
    raise exception 'Un virement supérieur au solde disponible a été validé (Module 06 §30).';
  exception when check_violation then null;
  end;

  -- Il reste en brouillon : un refus n'avance pas l'état.
  if (select status from public.internal_transfers where id = v_id) <> 'DRAFT' then
    raise exception 'Un virement refusé ne doit pas changer d''état.';
  end if;

  perform public.cancel_internal_transfer(v_id, 'Recette — solde insuffisant');

  raise notice '[OK] 7. §30 — les fonds insuffisants bloquent le virement, qui reste en brouillon.';
end $$;


-- --- 8. La validation produit DEUX écritures, et déplace les deux soldes -----------
do $$
declare
  r        recette_vir%rowtype;
  v_src    bigint;
  v_dst    bigint;
  v_out    int;
  v_in     int;
  v_total  int;
begin
  select * into r from recette_vir;

  perform public.validate_internal_transfer(r.transfer);

  if (select status from public.internal_transfers where id = r.transfer) <> 'VALIDATED' then
    raise exception 'Le virement devrait être validé.';
  end if;

  if (select validated_at from public.internal_transfers where id = r.transfer) is null then
    raise exception 'Un virement validé porte la date de sa validation (§32).';
  end if;

  select count(*),
         count(*) filter (where direction = 'OUT' and account_id = r.src),
         count(*) filter (where direction = 'IN'  and account_id = r.dst)
    into v_total, v_out, v_in
  from public.treasury_entries
  where internal_transfer_id = r.transfer and status = 'VALIDATED';

  if v_total <> 2 or v_out <> 1 or v_in <> 1 then
    raise exception
      'Un virement validé porte une sortie sur la source et une entrée sur la destination (§31). Obtenu : % écritures (% sortie, % entrée).',
      v_total, v_out, v_in;
  end if;

  -- §31 : 1 000 000 − 300 000 = 700 000 ; 200 000 + 300 000 = 500 000.
  v_src := public.financial_account_balance(r.src);
  v_dst := public.financial_account_balance(r.dst);

  if v_src <> 700000 then
    raise exception 'Solde source attendu 700 000, obtenu %.', v_src;
  end if;
  if v_dst <> 500000 then
    raise exception 'Solde destination attendu 500 000, obtenu %.', v_dst;
  end if;

  -- §28 : le virement ne crée ni ne détruit de valeur.
  if (v_src + v_dst) <> 1200000 then
    raise exception 'Un virement ne change pas le total : attendu 1 200 000, obtenu %.', v_src + v_dst;
  end if;

  raise notice '[OK] 8. §31 — deux écritures liées, 700 000 / 500 000, total inchangé.';
end $$;


-- --- 9. Le contrôle différé attrape ce qu'aucun autre ne voit ----------------------
--
-- `set constraints all immediate` force la garde à s'exécuter dans le sous-bloc.
do $$
declare
  r     recette_vir%rowtype;
  v_id  uuid;
  ok    int := 0;
begin
  select * into r from recette_vir;

  -- Un virement passé « validé » par PATCH direct, sans écriture.
  begin
    v_id := public.create_internal_transfer(r.src, r.dst, 10000, current_date, 'PATCH direct');
    update public.internal_transfers
       set status = 'VALIDATED', validated_at = now()
     where id = v_id;
    set constraints all immediate;
    raise exception 'Un virement validé sans écriture a été accepté.';
  exception
    when check_violation then ok := ok + 1;
    when insufficient_privilege then ok := ok + 1;
  end;
  set constraints all deferred;

  -- Une TROISIÈME écriture ajoutée à un virement déjà validé.
  begin
    insert into public.treasury_entries
      (account_id, entry_date, direction, kind, amount, internal_transfer_id)
    values (r.dst, current_date, 'IN', 'TRANSFER', 300000, r.transfer);
    set constraints all immediate;
    raise exception 'Une troisième écriture a été rattachée à un virement.';
  exception
    when check_violation then ok := ok + 1;
    when insufficient_privilege then ok := ok + 1;
  end;
  set constraints all deferred;

  -- Une écriture de virement dans le mauvais sens : refusée immédiatement.
  begin
    insert into public.treasury_entries
      (account_id, entry_date, direction, kind, amount, internal_transfer_id)
    values (r.src, current_date, 'IN', 'TRANSFER', 300000, r.transfer);
    raise exception 'Une entrée sur le compte source a été acceptée.';
  exception when check_violation then ok := ok + 1;
  end;

  -- Une écriture de virement sur un compte tiers.
  begin
    insert into public.treasury_entries
      (account_id, entry_date, direction, kind, amount, internal_transfer_id)
    values (r.autre, current_date, 'IN', 'TRANSFER', 300000, r.transfer);
    raise exception 'Une écriture de virement sur un compte étranger a été acceptée.';
  exception when check_violation then ok := ok + 1;
  end;

  -- Une écriture de virement d'un autre montant.
  begin
    insert into public.treasury_entries
      (account_id, entry_date, direction, kind, amount, internal_transfer_id)
    values (r.dst, current_date, 'IN', 'TRANSFER', 999, r.transfer);
    raise exception 'Une écriture de virement d''un autre montant a été acceptée.';
  exception when check_violation then ok := ok + 1;
  end;

  if ok <> 5 then
    raise exception 'Cinq refus attendus sur la cohérence, % obtenus.', ok;
  end if;

  raise notice '[OK] 9. Demi-virement, écriture surnuméraire, sens, compte et montant : cinq refus.';
end $$;


-- --- 10. Une écriture de virement reste immuable ------------------------------------
do $$
declare
  r      recette_vir%rowtype;
  v_e    uuid;
  ok     int := 0;
begin
  select * into r from recette_vir;

  select id into v_e from public.treasury_entries
  where internal_transfer_id = r.transfer and direction = 'OUT' limit 1;

  begin
    update public.treasury_entries set amount = 1 where id = v_e;
    raise exception 'Le montant d''une écriture a pu être modifié.';
  exception when check_violation then ok := ok + 1;
  end;

  begin
    update public.treasury_entries set internal_transfer_id = null where id = v_e;
    raise exception 'L''origine d''une écriture a pu être détachée.';
  exception when check_violation then ok := ok + 1;
  end;

  -- Migration 074 : un montant juste sous une cause fausse n'est pas traçable.
  begin
    update public.treasury_entries set description = 'Libellé réécrit' where id = v_e;
    raise exception 'Le libellé d''une écriture a pu être réécrit.';
  exception when check_violation then ok := ok + 1;
  end;

  if ok <> 3 then
    raise exception 'Trois refus attendus sur l''écriture, % obtenus.', ok;
  end if;

  if has_table_privilege('authenticated', 'public.treasury_entries', 'DELETE') then
    raise exception 'Le rôle applicatif peut supprimer une écriture.';
  end if;

  raise notice '[OK] 10. Montant, origine et libellé d''une écriture : trois refus, la suppression reste fermée.';
end $$;


-- --- 11. L'annulation défait les deux écritures ------------------------------------
do $$
declare
  r     recette_vir%rowtype;
  v_src bigint;
  v_dst bigint;
  v_cnt int;
begin
  select * into r from recette_vir;

  perform public.cancel_internal_transfer(r.transfer, 'Recette — annulation');

  select count(*) into v_cnt
  from public.treasury_entries
  where internal_transfer_id = r.transfer and status = 'VALIDATED';

  if v_cnt <> 0 then
    raise exception '% écriture(s) survivent à l''annulation du virement (§33).', v_cnt;
  end if;

  -- §33 : l'historique reste — les deux écritures existent, annulées.
  select count(*) into v_cnt
  from public.treasury_entries where internal_transfer_id = r.transfer;
  if v_cnt <> 2 then
    raise exception 'L''historique du virement doit rester : 2 écritures attendues, %.', v_cnt;
  end if;

  v_src := public.financial_account_balance(r.src);
  v_dst := public.financial_account_balance(r.dst);

  if v_src <> 1000000 or v_dst <> 200000 then
    raise exception 'Les soldes doivent revenir : obtenu % et %.', v_src, v_dst;
  end if;

  -- Un virement annulé ne se re-valide pas, ne se ré-annule pas.
  begin
    perform public.validate_internal_transfer(r.transfer);
    raise exception 'Un virement annulé a pu être validé.';
  exception when check_violation then null;
  end;

  begin
    perform public.cancel_internal_transfer(r.transfer);
    raise exception 'Un virement annulé a pu être annulé une seconde fois.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 11. §33 — les deux écritures annulées, les soldes revenus, l''historique conservé.';
end $$;


-- =============================================================================
-- PAIEMENTS DIVERS — Module 07 §43 à §47
-- =============================================================================

-- --- 12. Ce qu'un paiement divers refuse à la saisie -------------------------------
do $$
declare
  r  recette_vir%rowtype;
  ok int := 0;
begin
  select * into r from recette_vir;

  begin
    perform public.create_misc_payment(r.src, 0, current_date, 'OUT', 'ADMIN_FEE', 'Trésor public', 'Taxe');
    raise exception 'Un paiement de montant nul a été accepté.';
  exception when check_violation then ok := ok + 1;
  end;

  begin
    perform public.create_misc_payment(r.src, 5000, null, 'OUT', 'ADMIN_FEE', 'Trésor public', 'Taxe');
    raise exception 'Un paiement sans date a été accepté.';
  exception when check_violation then ok := ok + 1;
  end;

  -- §43 : « suffisamment documenté » — bénéficiaire et motif obligatoires.
  begin
    perform public.create_misc_payment(r.src, 5000, current_date, 'OUT', 'ADMIN_FEE', '   ', 'Taxe');
    raise exception 'Un paiement sans bénéficiaire a été accepté.';
  exception when check_violation then ok := ok + 1;
  end;

  begin
    perform public.create_misc_payment(r.src, 5000, current_date, 'OUT', 'ADMIN_FEE', 'Trésor public', '');
    raise exception 'Un paiement sans motif a été accepté.';
  exception when check_violation then ok := ok + 1;
  end;

  -- §10 : compte archivé.
  begin
    perform public.create_misc_payment(r.autre, 5000, current_date, 'OUT', 'ADMIN_FEE', 'Trésor public', 'Taxe');
    raise exception 'Un paiement depuis un compte archivé a été accepté.';
  exception when check_violation then ok := ok + 1;
  end;

  /*
   * DEC-042 §b : le SENS est obligatoire.
   *
   * Le déduire d'un défaut reviendrait à décider en silence qu'un paiement est
   * une sortie — et un encaissement saisi ainsi diminuerait le compte qu'il
   * devait augmenter.
   */
  begin
    perform public.create_misc_payment(r.src, 5000, current_date, null, 'ADMIN_FEE', 'Trésor public', 'Taxe');
    raise exception 'Un paiement sans sens a été accepté.';
  exception when check_violation then ok := ok + 1;
  end;

  -- Et l'ancienne signature, sans sens, ne doit plus exister.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_misc_payment'
      and pg_get_function_identity_arguments(p.oid) not like '%treasury_direction%'
  ) then
    raise exception 'L''ancienne signature de `create_misc_payment` subsiste : le sens serait devinable.';
  end if;

  if ok <> 6 then
    raise exception 'Six refus attendus à la saisie d''un paiement divers, % obtenus.', ok;
  end if;

  raise notice '[OK] 12. Montant, date, bénéficiaire, motif, compte archivé et SENS : six refus.';
end $$;


-- --- 13. Un paiement divers naît en brouillon, sans écriture -----------------------
do $$
declare
  r     recette_vir%rowtype;
  v_id  uuid;
  m     public.misc_payments%rowtype;
  v_cnt int;
begin
  select * into r from recette_vir;

  v_id := public.create_misc_payment(
    r.src, 45000, current_date, 'OUT', 'SMALL_EXPENSE', 'Quincaillerie Moroni',
    'Fournitures d''atelier', 'BON-77', 'Recette'
  );
  update recette_vir set misc = v_id;

  select * into m from public.misc_payments where id = v_id;

  if m.status <> 'DRAFT' then
    raise exception 'Un paiement divers devrait naître en brouillon, obtenu %.', m.status;
  end if;

  if m.direction <> 'OUT' then
    raise exception 'Le sens saisi n''a pas été conservé : % au lieu de OUT.', m.direction;
  end if;

  if m.payment_no not like 'REG-%' then
    raise exception 'Numérotation inattendue : % (série « payment », DEC-031).', m.payment_no;
  end if;

  select count(*) into v_cnt from public.treasury_entries where misc_payment_id = v_id;
  if v_cnt <> 0 then
    raise exception 'Un brouillon ne produit aucune écriture, % trouvée(s).', v_cnt;
  end if;

  raise notice '[OK] 13. Brouillon numéroté REG, aucune écriture avant validation.';
end $$;


-- --- 14. Ce que le brouillon refuse ------------------------------------------------
do $$
declare
  r  recette_vir%rowtype;
  ok int := 0;
begin
  select * into r from recette_vir;

  -- Aucune modification : `billing.misc_payments.update` n'existe pas.
  begin
    update public.misc_payments set amount = 90000 where id = r.misc;
    raise exception 'Le montant d''un paiement divers a pu être modifié.';
  exception when check_violation then ok := ok + 1;
  end;

  begin
    update public.misc_payments set account_id = r.dst where id = r.misc;
    raise exception 'Le compte d''un paiement divers a pu être modifié.';
  exception when check_violation then ok := ok + 1;
  end;

  begin
    update public.misc_payments set beneficiary = 'Autre' where id = r.misc;
    raise exception 'Le bénéficiaire d''un paiement divers a pu être modifié.';
  exception when check_violation then ok := ok + 1;
  end;

  /*
   * DEC-042 §b : le sens est FIGÉ.
   *
   * L'inverser après validation retournerait un mouvement de trésorerie sans
   * qu'aucune écriture ne l'explique : le solde deviendrait faux de deux fois
   * le montant.
   */
  begin
    update public.misc_payments set direction = 'IN' where id = r.misc;
    raise exception 'Le sens d''un paiement divers a pu être inversé.';
  exception when check_violation then ok := ok + 1;
  end;

  -- Migration 074 : §43 — une documentation réécrivable ne documente rien.
  begin
    update public.misc_payments set external_ref = 'REF réécrite' where id = r.misc;
    raise exception 'La référence d''un paiement divers a pu être réécrite.';
  exception when check_violation then ok := ok + 1;
  end;

  -- Une écriture ne peut pas devancer la validation.
  begin
    insert into public.treasury_entries
      (account_id, entry_date, direction, kind, amount, misc_payment_id)
    values (r.src, current_date, 'OUT', 'MISC_PAYMENT', 45000, r.misc);
    raise exception 'Une écriture adossée à un brouillon a été acceptée.';
  exception when check_violation then ok := ok + 1;
  end;

  -- Un paiement ne naît jamais validé.
  begin
    insert into public.misc_payments
      (payment_no, account_id, amount, paid_on, category, beneficiary, purpose,
       status, validated_at)
    values ('REG-RECETTE-1', r.src, 1000, current_date, 'OTHER', 'X', 'Y', 'VALIDATED', now());
    raise exception 'Un paiement divers a pu naître validé.';
  exception when check_violation then ok := ok + 1;
  end;

  if ok <> 7 then
    raise exception 'Sept refus attendus sur le brouillon, % obtenus.', ok;
  end if;

  if has_table_privilege('authenticated', 'public.misc_payments', 'DELETE') then
    raise exception 'Le rôle applicatif peut supprimer un paiement divers.';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.misc_payments'::regclass
      and tgname = 'misc_payments_no_delete'
  ) then
    raise exception 'Le déclencheur d''interdiction de suppression est absent.';
  end if;

  raise notice '[OK] 14. Montant, compte, bénéficiaire, SENS, référence, écriture anticipée, INSERT validé : sept refus, et la suppression est fermée.';
end $$;


-- --- 15. La validation produit UNE écriture de sortie ------------------------------
do $$
declare
  r     recette_vir%rowtype;
  v_src bigint;
  v_cnt int;
  v_ok  int;
begin
  select * into r from recette_vir;

  perform public.validate_misc_payment(r.misc);

  select count(*),
         count(*) filter (where direction = 'OUT' and account_id = r.src and amount = 45000)
    into v_cnt, v_ok
  from public.treasury_entries
  where misc_payment_id = r.misc and status = 'VALIDATED';

  if v_cnt <> 1 or v_ok <> 1 then
    raise exception 'Un paiement divers validé porte UNE sortie du montant payé (§45). Obtenu % / %.', v_cnt, v_ok;
  end if;

  -- 1 000 000 − 45 000
  v_src := public.financial_account_balance(r.src);
  if v_src <> 955000 then
    raise exception 'Solde attendu 955 000, obtenu %.', v_src;
  end if;

  -- Un paiement validé ne se re-valide pas.
  begin
    perform public.validate_misc_payment(r.misc);
    raise exception 'Un paiement déjà validé a pu être validé une seconde fois.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 15. §45 — une sortie de 45 000 KMF, solde du compte à 955 000.';
end $$;


-- --- 16. Le contrôle différé, côté paiement divers ---------------------------------
do $$
declare
  r    recette_vir%rowtype;
  v_id uuid;
  ok   int := 0;
begin
  select * into r from recette_vir;

  -- Validé par PATCH direct, sans écriture.
  begin
    v_id := public.create_misc_payment(
      r.src, 7000, current_date, 'OUT', 'OTHER', 'PATCH direct', 'Contournement'
    );
    update public.misc_payments
       set status = 'VALIDATED', validated_at = now()
     where id = v_id;
    set constraints all immediate;
    raise exception 'Un paiement validé sans écriture a été accepté.';
  exception
    when check_violation then ok := ok + 1;
    when insufficient_privilege then ok := ok + 1;
  end;
  set constraints all deferred;

  -- Une seconde écriture sur un paiement déjà validé.
  begin
    insert into public.treasury_entries
      (account_id, entry_date, direction, kind, amount, misc_payment_id)
    values (r.src, current_date, 'OUT', 'MISC_PAYMENT', 45000, r.misc);
    set constraints all immediate;
    raise exception 'Une seconde écriture a été rattachée à un paiement divers.';
  exception
    when check_violation then ok := ok + 1;
    when insufficient_privilege then ok := ok + 1;
  end;
  set constraints all deferred;

  /*
   * L'écriture reprend le SENS DU PAIEMENT — DEC-042 §b.
   *
   * Ce paiement-ci est un décaissement : une entrée qui s'en réclamerait
   * augmenterait le compte que l'opération devait diminuer. Le déclencheur
   * d'origine compare désormais au sens porté par le paiement, et non plus à
   * une constante.
   */
  begin
    insert into public.treasury_entries
      (account_id, entry_date, direction, kind, amount, misc_payment_id)
    values (r.src, current_date, 'IN', 'MISC_PAYMENT', 45000, r.misc);
    raise exception 'Une écriture de sens contraire au paiement a été acceptée.';
  exception when check_violation then ok := ok + 1;
  end;

  -- Une écriture ne se réclame que d'une seule opération.
  begin
    insert into public.treasury_entries
      (account_id, entry_date, direction, kind, amount, misc_payment_id, internal_transfer_id)
    values (r.src, current_date, 'OUT', 'MISC_PAYMENT', 45000, r.misc, r.transfer);
    raise exception 'Une écriture à double origine a été acceptée.';
  exception when check_violation then ok := ok + 1;
  end;

  if ok <> 4 then
    raise exception 'Quatre refus attendus sur la cohérence, % obtenus.', ok;
  end if;

  raise notice '[OK] 16. Paiement sans écriture, écriture surnuméraire, sens contraire, double origine : quatre refus.';
end $$;


-- --- 16 bis. UN PAIEMENT DIVERS PEUT ÊTRE UN ENCAISSEMENT — DEC-042 §b ------------
--
-- Le LOT 17 ne connaissait que le décaissement. ADIKOM a tranché : un paiement
-- divers va dans les deux sens.
--
-- Ce que cette section éprouve, de bout en bout :
--
--   · le sens est conservé à la saisie ;
--   · la validation produit UNE écriture d'ENTRÉE, du montant reçu ;
--   · le solde du compte AUGMENTE — c'est là que la différence se voit ;
--   · l'annulation le fait redescendre, et l'écriture reste, marquée annulée.
do $$
declare
  r        recette_vir%rowtype;
  v_id     uuid;
  m        public.misc_payments%rowtype;
  v_avant  bigint;
  v_apres  bigint;
  v_cnt    int;
  v_ok     int;
begin
  select * into r from recette_vir;

  v_avant := public.financial_account_balance(r.src);

  v_id := public.create_misc_payment(
    r.src, 30000, current_date, 'IN', 'OTHER', 'Assureur Comores',
    'Remboursement de franchise', 'AVIS-42', 'Recette encaissement'
  );

  select * into m from public.misc_payments where id = v_id;

  if m.direction <> 'IN' then
    raise exception 'Le sens ENTRÉE n''a pas été conservé : %.', m.direction;
  end if;

  -- Un brouillon ne déplace rien, quel que soit son sens.
  if public.financial_account_balance(r.src) <> v_avant then
    raise exception 'Un encaissement en brouillon a déjà mouvementé le compte.';
  end if;

  perform public.validate_misc_payment(v_id);

  select count(*),
         count(*) filter (where direction = 'IN' and account_id = r.src and amount = 30000)
    into v_cnt, v_ok
  from public.treasury_entries
  where misc_payment_id = v_id and status = 'VALIDATED';

  if v_cnt <> 1 or v_ok <> 1 then
    raise exception
      'Un encaissement divers validé porte UNE entrée du montant reçu. Obtenu % / %.', v_cnt, v_ok;
  end if;

  v_apres := public.financial_account_balance(r.src);
  if v_apres <> v_avant + 30000 then
    raise exception
      'Le solde devait augmenter de 30 000 : % avant, % après.', v_avant, v_apres;
  end if;

  -- Le sens contraire est refusé pour un encaissement aussi.
  begin
    insert into public.treasury_entries
      (account_id, entry_date, direction, kind, amount, misc_payment_id)
    values (r.src, current_date, 'OUT', 'MISC_PAYMENT', 30000, v_id);
    raise exception 'Une sortie adossée à un encaissement a été acceptée.';
  exception when check_violation then null;
  end;

  perform public.cancel_misc_payment(v_id, 'Recette — annulation d''un encaissement');

  if public.financial_account_balance(r.src) <> v_avant then
    raise exception
      'Le solde devait redescendre à % après annulation, obtenu %.',
      v_avant, public.financial_account_balance(r.src);
  end if;

  select count(*) into v_cnt from public.treasury_entries where misc_payment_id = v_id;
  if v_cnt <> 1 then
    raise exception 'L''historique doit rester : 1 écriture attendue, %.', v_cnt;
  end if;

  raise notice '[OK] 16 bis. Encaissement : entrée de 30 000, solde augmenté puis rendu, trace conservée.';
end $$;


-- --- 17. L'annulation défait l'écriture --------------------------------------------
do $$
declare
  r     recette_vir%rowtype;
  v_src bigint;
  v_cnt int;
begin
  select * into r from recette_vir;

  perform public.cancel_misc_payment(r.misc, 'Recette — annulation');

  select count(*) into v_cnt
  from public.treasury_entries where misc_payment_id = r.misc and status = 'VALIDATED';
  if v_cnt <> 0 then
    raise exception 'L''écriture du paiement survit à son annulation (§47).';
  end if;

  select count(*) into v_cnt
  from public.treasury_entries where misc_payment_id = r.misc;
  if v_cnt <> 1 then
    raise exception 'L''historique doit rester : 1 écriture attendue, %.', v_cnt;
  end if;

  v_src := public.financial_account_balance(r.src);
  if v_src <> 1000000 then
    raise exception 'Le solde doit revenir à 1 000 000, obtenu %.', v_src;
  end if;

  begin
    perform public.cancel_misc_payment(r.misc);
    raise exception 'Un paiement annulé a pu être annulé une seconde fois.';
  exception when check_violation then null;
  end;

  raise notice '[OK] 17. §47 — écriture annulée, solde revenu, historique conservé.';
end $$;


-- --- 18. Le journal d'activité nomme les deux nouveaux objets ----------------------
do $$
begin
  if public.audit_detail_permission('internal_transfers') <> 'treasury.transfers.view' then
    raise exception 'Le détail d''un virement doit relever de `treasury.transfers.view` (DEC-038).';
  end if;

  if public.audit_detail_permission('misc_payments') <> 'billing.misc_payments.view' then
    raise exception 'Le détail d''un paiement divers doit relever de `billing.misc_payments.view`.';
  end if;

  -- §49 : les opérations sont journalisées.
  if not exists (
    select 1 from public.audit_log
    where entity_type = 'internal_transfers' and action = 'CREATE'
  ) then
    raise exception 'La création d''un virement n''est pas journalisée (Module 06 §49).';
  end if;

  if not exists (
    select 1 from public.audit_log
    where entity_type = 'misc_payments' and action = 'STATUS_CHANGE'
  ) then
    raise exception 'La validation d''un paiement divers n''est pas journalisée.';
  end if;

  raise notice '[OK] 18. Journal — les deux objets sont nommés, et leurs actes tracés.';
end $$;


-- --- 19. Aucune régression sur les origines existantes -----------------------------
do $$
declare v_cnt int;
begin
  -- La contrainte d'origine unique couvre les quatre colonnes.
  if not exists (
    select 1 from pg_constraint
    where conname = 'treasury_entries_single_origin'
      and pg_get_constraintdef(oid) like '%internal_transfer_id%'
      and pg_get_constraintdef(oid) like '%misc_payment_id%'
  ) then
    raise exception 'La contrainte d''origine unique ne couvre pas les nouvelles colonnes.';
  end if;

  -- Les policies des écritures acceptent les quatre origines.
  select count(*) into v_cnt from pg_policies
  where schemaname = 'public' and tablename = 'treasury_entries'
    and policyname = 'treasury_entries_insert'
    and qual is null
    and with_check like '%internal_transfer_id%'
    and with_check like '%misc_payment_id%';
  if v_cnt <> 1 then
    raise exception 'La policy d''insertion des écritures ignore les nouvelles origines.';
  end if;

  /*
   * Migration 073 — la policy d'UPDATE doit lier la capacité à l'ORIGINE de la
   * ligne. Une disjonction de capacités laisserait un porteur de
   * `supplier_payments.cancel` annuler l'écriture d'un virement.
   */
  select count(*) into v_cnt from pg_policies
  where schemaname = 'public' and tablename = 'treasury_entries'
    and policyname = 'treasury_entries_update'
    and qual like '%supplier_payment_id IS NOT NULL%'
    and qual like '%customer_payment_id IS NOT NULL%'
    and qual like '%internal_transfer_id IS NOT NULL%'
    and qual like '%misc_payment_id IS NOT NULL%';
  if v_cnt <> 1 then
    raise exception 'La policy d''annulation des écritures n''est pas liée à leur origine (migration 073).';
  end if;

  raise notice '[OK] 19. Origine unique, insertion étendue, et l''annulation liée à l''origine.';
end $$;


rollback;
