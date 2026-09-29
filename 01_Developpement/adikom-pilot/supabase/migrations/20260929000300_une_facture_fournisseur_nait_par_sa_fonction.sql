-- =============================================================================
-- UNE FACTURE FOURNISSEUR NAÎT PAR SA FONCTION — dette du Rapport 19 §13.2
-- =============================================================================
--
-- LE DÉFAUT CONSTATÉ
--
-- Un utilisateur porteur de `billing.supplier_invoices.create` pouvait insérer
-- directement une ligne dans `supplier_invoices` par PostgREST, et contourner
-- ainsi `create_supplier_invoice` — donc le NUMÉROTEUR, les contrôles métier et
-- la cohérence que cette fonction porte. Il pouvait écrire lui-même
-- `invoice_no`, avec la valeur de son choix.
--
-- LA CAUSE
--
-- La policy d'INSERT dit `has_permission('billing.supplier_invoices.create')`
-- et rien de plus. Elle répond à « CET UTILISATEUR a-t-il le droit de créer ? »
-- — jamais à « cette ligne naît-elle PAR LE CHEMIN PRÉVU ? ». Les deux
-- questions sont distinctes, et la seconde n'était posée nulle part.
--
-- La faiblesse est ANTÉRIEURE au LOT 26. Elle était masquée par l'index
-- d'unicité facture/commande, que DEC-053 a retiré : la recette a alors vu
-- passer une insertion directe qu'elle croyait refusée depuis toujours.
--
-- LA CORRECTION — le mécanisme DÉJÀ VALIDÉ du projet
--
-- Aucune invention. On reprend exactement le motif de la numérotation
-- (migration 013, §16) : un drapeau LOCAL À LA TRANSACTION, posé par la
-- fonction de confiance juste avant son écriture, et relu par un déclencheur.
--
--   · `set_config` vit dans `pg_catalog` : PostgREST ne l'expose pas, et aucun
--     appel d'API ne peut donc poser ce drapeau ;
--   · il est local à la transaction, et remis à « off » IMMÉDIATEMENT après
--     l'insertion — un contexte qui lève une garde ne doit pas survivre à
--     l'acte qui l'a ouvert ;
--   · la restauration de sauvegarde garde son passage, par `is_restoring()`,
--     qui exige À LA FOIS l'absence de session applicative ET le contexte de
--     reprise. Un utilisateur connecté, fût-il Super Admin, ne le satisfait
--     jamais.
--
-- 🟥 AUCUNE FONCTION MÉTIER NE DEVIENT `SECURITY DEFINER`.
--
-- `create_supplier_invoice` reste `SECURITY INVOKER`, et le déclencheur aussi :
-- il ne lit que `current_setting` et `is_restoring()`, cette dernière étant
-- accordée à `authenticated`. La doctrine D4 n'est pas entamée, et aucune
-- évolution d'architecture n'a été nécessaire — le projet portait déjà le
-- mécanisme qu'il fallait.
--
-- CE QUI NE CHANGE PAS
--
--   · aucune table, aucune colonne, aucune policy RLS ;
--   · aucune capacité — le catalogue reste à 229 ;
--   · `backup_scope` reste à 62 tables, `backup_columns` est intact ;
--   · le cycle, les lignes, les règlements, les imputations, l'audit ;
--   · DEC-053 : une commande porte toujours plusieurs factures ;
--   · le commerce client, les factures clients, les commandes.
-- =============================================================================


-- =============================================================================
-- 1. LE DÉCLENCHEUR — il demande par où la ligne est passée
-- =============================================================================

create or replace function public.fn_supplier_invoice_born_by_function()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- La remise en place n'est pas une création. Elle exige l'absence de session
  -- applicative EN PLUS du contexte de reprise : poser le contexte ne suffirait
  -- pas, il faudrait encore n'être personne.
  if public.is_restoring() then return new; end if;

  if coalesce(current_setting('adikom.supplier_invoice', true), 'off') <> 'on' then
    raise exception
      'Opération refusée : une facture fournisseur s''enregistre par la fonction prévue, jamais par écriture directe. Sans elle, la facture porterait un numéro choisi à la main.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.fn_supplier_invoice_born_by_function() is
  'Une facture fournisseur naît par `create_supplier_invoice`, ou par une restauration. Jamais par un INSERT direct : le numéroteur ne se contourne pas.';


/*
 * 🟥 IL SE DÉCLENCHE EN DERNIER, ET C'EST DÉLIBÉRÉ.
 *
 * PostgreSQL exécute les déclencheurs BEFORE ROW dans l'ordre de leur NOM. Le
 * préfixe `zzz_` place celui-ci après tous les autres — `starts_draft`,
 * `purchase_coherence`, `reference_unique`.
 *
 * S'il passait en premier, il masquerait leurs refus : une insertion directe
 * née « validée » serait refusée pour la MAUVAISE raison, et les recettes qui
 * éprouvent ces gardes depuis le LOT 5 recevraient `42501` là où elles
 * attendent `check_violation`. Elles cesseraient d'éprouver ce qu'elles
 * nomment, sans qu'aucune ne devienne rouge.
 *
 * En dernier, il ne prend la parole que lorsque tout le reste est satisfait —
 * c'est-à-dire exactement dans le cas qu'il est seul à savoir refuser : une
 * ligne parfaitement formée, mais qui n'est pas passée par la fonction.
 */
drop trigger if exists supplier_invoices_zzz_born_by_function on public.supplier_invoices;

create trigger supplier_invoices_zzz_born_by_function
  before insert on public.supplier_invoices
  for each row execute function public.fn_supplier_invoice_born_by_function();


-- =============================================================================
-- 2. `create_supplier_invoice` — elle annonce son passage
--
-- Reprise de sa DERNIÈRE VERSION ACTIVE : migration 105
-- (`20260929000100_plusieurs_factures_pour_une_commande_fournisseur.sql`), qui
-- avait retiré le refus de la seconde facture au titre de DEC-053.
--
-- SEULES DEUX LIGNES S'AJOUTENT, autour de l'insertion. Les six contrôles de
-- capacité, les quatre contrôles de cohérence, la naissance en brouillon
-- (DEC-007) et l'ouverture DEC-053 sont rendus À L'IDENTIQUE.
-- =============================================================================

create or replace function public.create_supplier_invoice(
  p_supplier_id       uuid,
  p_invoice_date      date,
  p_due_date          date default null,
  p_external_ref      text default null,
  p_notes             text default null,
  p_purchase_order_id uuid default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_no text;
begin
  perform public.require_capability(
    array['billing.supplier_invoices.create'], 'enregistrer une facture fournisseur'
  );
  perform public.require_capability(
    array['billing.supplier_invoices.view'], 'consulter la facture enregistrée'
  );
  -- On n'enregistre pas la dette d'un fournisseur qu'on n'a pas le droit de
  -- consulter : le rattachement serait posé à l'aveugle.
  perform public.require_capability(
    array['parties.suppliers.view'], 'consulter le fournisseur de la facture'
  );

  if p_supplier_id is null then
    raise exception 'Une facture fournisseur se rattache obligatoirement à un fournisseur.'
      using errcode = 'check_violation';
  end if;

  if p_invoice_date is null then
    raise exception 'La date de la facture est obligatoire (Module 07 §29).'
      using errcode = 'check_violation';
  end if;

  if p_due_date is not null and p_due_date < p_invoice_date then
    raise exception 'L''échéance ne peut pas précéder la date de la facture.'
      using errcode = 'check_violation';
  end if;

  -- LOT 26 : nommer une commande suppose le droit de la consulter.
  if p_purchase_order_id is not null then
    perform public.require_capability(
      array['commerce.purchase_orders.view'], 'consulter la commande facturée'
    );
  end if;

  /*
   * Le fournisseur n'est PAS exigé actif.
   *
   * Une facture reçue d'un fournisseur devenu inactif reste une dette réelle.
   * Refuser de l'enregistrer empêcherait de la payer — et ferait disparaître du
   * système une obligation qui existe hors de lui.
   */
  if not exists (select 1 from public.suppliers s where s.id = p_supplier_id) then
    raise exception
      'Le fournisseur désigné est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  /*
   * DEC-053 — aucun refus de la seconde facture ici : un acompte puis un solde
   * sont deux factures légitimes de la même commande. Le déclencheur de
   * cohérence, lui, demeure.
   */

  v_no := public.next_number('supplier_invoice');

  /*
   * 🟥 LE DRAPEAU S'OUVRE ICI, ET SE REFERME DEUX LIGNES PLUS BAS.
   *
   * Il est local à la transaction, non à la fonction : le laisser ouvert le
   * ferait survivre au `return`, et une écriture ultérieure de la MÊME
   * transaction en profiterait. On l'ouvre au plus près de l'acte, et on le
   * referme immédiatement — y compris lorsque l'insertion échoue, puisque la
   * transaction est alors perdue de toute façon.
   */
  perform set_config('adikom.supplier_invoice', 'on', true);

  insert into public.supplier_invoices
    (invoice_no, supplier_id, invoice_date, due_date, external_ref, notes,
     purchase_order_id, created_by, updated_by)
  values
    (v_no, p_supplier_id, p_invoice_date, p_due_date,
     nullif(btrim(coalesce(p_external_ref, '')), ''),
     nullif(btrim(coalesce(p_notes, '')), ''),
     p_purchase_order_id,
     public.current_actor(), public.current_actor())
  returning id into v_id;

  perform set_config('adikom.supplier_invoice', 'off', true);

  return v_id;
end;
$$;

comment on function public.create_supplier_invoice(uuid, date, date, text, text, uuid) is
  'Enregistre une facture REÇUE, en brouillon (DEC-007). Seul chemin de création : le numéroteur ne se contourne pas. DEC-053 : une commande peut en porter plusieurs.';

revoke execute on function public.create_supplier_invoice(uuid, date, date, text, text, uuid) from public, anon;
grant  execute on function public.create_supplier_invoice(uuid, date, date, text, text, uuid) to authenticated, service_role;


-- =============================================================================
-- 3. CONTRÔLES
-- =============================================================================

do $$
declare
  v_def text;
  v_n   int;
begin
  -- ---------------------------------------------------------------- ce qui change
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.supplier_invoices'::regclass
      and tgname = 'supplier_invoices_zzz_born_by_function'
      and not tgisinternal
  ) then
    raise exception 'Le déclencheur d''intégrité de création n''est pas posé.';
  end if;

  -- Il doit passer APRÈS les autres gardes d'insertion, sinon il masque leurs
  -- refus et les recettes du LOT 5 cessent d'éprouver ce qu'elles nomment.
  select count(*) into v_n
  from pg_trigger
  where tgrelid = 'public.supplier_invoices'::regclass
    and not tgisinternal
    and tgname > 'supplier_invoices_zzz_born_by_function';
  if v_n > 0 then
    raise exception
      '% déclencheur(s) passent APRÈS la garde d''intégrité : elle doit être la dernière.', v_n;
  end if;

  v_def := pg_get_functiondef('public.create_supplier_invoice(uuid, date, date, text, text, uuid)'::regprocedure);
  if v_def not like '%adikom.supplier_invoice%on%' then
    raise exception
      '`create_supplier_invoice` ne pose pas le drapeau : elle serait refusée par sa propre garde.';
  end if;
  if v_def not like '%adikom.supplier_invoice%off%' then
    raise exception
      '`create_supplier_invoice` ne referme pas le drapeau : le contexte survivrait à l''acte.';
  end if;

  -- La garde connaît la restauration, sans quoi aucune sauvegarde ne se
  -- remettrait en place.
  v_def := pg_get_functiondef('public.fn_supplier_invoice_born_by_function()'::regprocedure);
  if v_def not like '%is_restoring%' then
    raise exception
      'La garde ignore la restauration : une sauvegarde ne pourrait plus être restaurée.';
  end if;

  -- ------------------------------------------------- 🟥 AUCUN `SECURITY DEFINER`
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.proname in ('create_supplier_invoice', 'fn_supplier_invoice_born_by_function');
  if v_n > 0 then
    raise exception
      '% fonction(s) sont `SECURITY DEFINER` : la doctrine D4 l''interdit, et la correction ne l''exige pas.', v_n;
  end if;

  -- ------------------------------------------------- ce qui ne doit PAS changer
  --
  -- Les gardes du LOT 5 et du LOT 26 sont toutes en place.
  foreach v_def in array array[
    'supplier_invoices_starts_draft',
    'supplier_invoices_purchase_coherence',
    'supplier_invoices_transition',
    'supplier_invoices_no_delete',
    'supplier_invoices_audit',
    'supplier_invoices_zz_no_cancel_when_paid',
    'supplier_invoices_zz_reference_unique'
  ] loop
    if not exists (
      select 1 from pg_trigger
      where tgrelid = 'public.supplier_invoices'::regclass
        and tgname = v_def and not tgisinternal
    ) then
      raise exception 'Le déclencheur « % » a disparu.', v_def;
    end if;
  end loop;

  -- DEC-053 tient : l'index d'unicité ne revient pas.
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'supplier_invoices_one_per_purchase_order_idx'
  ) then
    raise exception 'L''index d''unicité facture/commande est revenu : DEC-053 l''a retiré.';
  end if;

  -- Ni capacité, ni périmètre de sauvegarde.
  select count(*) into v_n from public.permissions;
  if v_n <> 229 then
    raise exception 'Le catalogue porte % capacités au lieu de 229.', v_n;
  end if;

  v_n := array_length(public.backup_scope(), 1);
  if v_n <> 62 then
    raise exception '`backup_scope` porte % tables au lieu de 62.', v_n;
  end if;

  -- La policy d'INSERT n'est PAS touchée : elle répond toujours à « qui », et
  -- c'est le déclencheur qui répond à « par où ».
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'supplier_invoices'
      and policyname = 'supplier_invoices_insert'
  ) then
    raise exception 'La policy d''insertion a été remplacée : la correction ne devait pas y toucher.';
  end if;
end $$;
