-- =============================================================================
-- ADIKOM PILOT — 113 · Un règlement client naît par sa fonction
-- LOT 28 — décision S-1 (DEC-055, 8 octobre 2026) · motif du Rapport 20 §3
--
-- LE DÉFAUT — signalé par la préparation LOT 27-28 (§7, « hors des quatre »)
--
-- `customer_payments` porte la même forme que `supplier_invoices` avant la
-- migration 107 : une policy d'INSERT qui répond à « qui » (`billing.
-- customer_payments.create`), jamais à « par où ». Un `INSERT` direct créait un
-- règlement VALIDÉ :
--
--   · SANS son écriture de trésorerie — la facture paraissait réglée, le solde
--     du compte ne bougeait pas (CLAUDE.md §57) ;
--   · sans le plafond du reste dû (Workflow 08 §40), sans facture émise exigée,
--     sans compte actif, sans le numéroteur.
--
-- POURQUOI MAINTENANT (S-1) — C-2 crée le RÈGLEMENT ADOSSÉ, qui solde la facture
-- d'une vente déjà encaissée SANS seconde écriture. Ce règlement-là doit naître
-- UNIQUEMENT par sa fonction : la garde de cette table en est le socle, posée
-- AVANT l'orchestrateur de facturation du point de vente.
--
-- LA CORRECTION — le mécanisme de la migration 107, à l'identique : drapeau
-- local à la transaction (`adikom.customer_payment`) posé par
-- `record_customer_payment` juste avant son insertion et refermé juste après,
-- relu par un déclencheur `zzz_…` DERNIER de la table. La restauration passe par
-- `is_restoring()`.
--
-- `record_customer_payment` est reprise de SA DERNIÈRE VERSION ACTIVE (migration
-- 053, `20260902000100_reglements_clients.sql` — aucune migration ultérieure ne
-- l'a redéfinie). SEULES DEUX INSTRUCTIONS s'ajoutent.
--
-- 🟥 AUCUNE FONCTION NE DEVIENT `SECURITY DEFINER`. Aucune table, colonne,
-- policy ni capacité ne change.
-- =============================================================================


-- =============================================================================
-- 1. LE DÉCLENCHEUR
-- =============================================================================

create or replace function public.fn_customer_payment_born_by_function()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_restoring() then return new; end if;

  if coalesce(current_setting('adikom.customer_payment', true), 'off') <> 'on' then
    raise exception
      'Opération refusée : un règlement client s''enregistre par la fonction prévue, jamais par écriture directe. Sans elle, le règlement solderait la facture sans aucune écriture de trésorerie.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.fn_customer_payment_born_by_function() is
  'Un règlement client naît par `record_customer_payment` (ou, au LOT 28, par l''adossement d''une vente encaissée), ou par une restauration. Jamais par un INSERT direct (S-1).';

revoke execute on function public.fn_customer_payment_born_by_function() from public, anon;

-- 🟥 EN DERNIER : après `starts_validated`, qui doit garder SON refus.
drop trigger if exists customer_payments_zzz_born_by_function on public.customer_payments;

create trigger customer_payments_zzz_born_by_function
  before insert on public.customer_payments
  for each row execute function public.fn_customer_payment_born_by_function();


-- =============================================================================
-- 2. `record_customer_payment` — reprise de la migration 053, deux lignes
-- =============================================================================

create or replace function public.record_customer_payment(
  p_invoice_id   uuid,
  p_account_id   uuid,
  p_amount       bigint,
  p_received_on  date,
  p_method       public.payment_method,
  p_external_ref text default null,
  p_notes        text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_no    text;
  f       public.customer_invoices%rowtype;
  v_acc   public.financial_accounts%rowtype;
  v_total bigint;
  v_paid  bigint;
  v_due   bigint;
begin
  perform public.require_capability(
    array['billing.customer_payments.create'], 'enregistrer un règlement client'
  );
  perform public.require_capability(
    array['billing.customer_payments.view'], 'consulter les règlements de cette facture'
  );
  perform public.require_capability(
    array['billing.customer_invoices.view'], 'consulter la facture à encaisser'
  );
  perform public.require_capability(
    array['treasury.accounts.view'], 'consulter le compte à mouvementer'
  );

  if p_amount is null or p_amount <= 0 then
    raise exception 'Le montant du règlement doit être un entier positif, en KMF.'
      using errcode = 'check_violation';
  end if;

  if p_received_on is null then
    raise exception 'La date réelle du règlement est obligatoire (Workflow 08 §11).'
      using errcode = 'check_violation';
  end if;

  /*
   * SÉRIALISER SANS RÉCLAMER UN DROIT D'ÉCRITURE (migration 051).
   *
   * Deux encaissements simultanés sur la même facture doivent se suivre, sans
   * quoi chacun verrait le même reste dû et le plafond de §40 laisserait passer
   * les deux. Un `select … for update` appliquerait, sous RLS, la policy
   * d'ÉCRITURE de `customer_invoices` — trois capacités qu'un encaisseur n'a
   * aucune raison de détenir. Le verrou consultatif fait le même travail sans
   * rien réclamer, et tombe avec la transaction.
   */
  perform pg_advisory_xact_lock(hashtext(p_invoice_id::text)::bigint);

  select * into f from public.customer_invoices where id = p_invoice_id;

  if not found then
    raise exception
      'La facture à encaisser est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  /*
   * §26 : une facture ÉMISE reconnaît la créance. Un brouillon n'en est pas
   * une, une facture annulée n'en est plus une — encaisser l'un ou l'autre
   * enregistrerait de l'argent reçu sur une créance qui n'existe pas.
   */
  if f.status <> 'ISSUED' then
    raise exception
      'Opération refusée : seule une facture client émise peut être encaissée. Celle-ci est « % ».', f.status
      using errcode = 'check_violation';
  end if;

  select * into v_acc from public.financial_accounts where id = p_account_id;

  if not found then
    raise exception
      'Le compte financier est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  -- Module 06 §10 : « un compte inactif ou archivé ne doit normalement plus
  -- être proposé pour de nouvelles opérations. »
  if v_acc.status <> 'ACTIVE' then
    raise exception
      'Opération refusée : le compte « % » n''est pas actif. Un compte inactif ou archivé ne reçoit plus de nouvelle opération (Module 06 §10).',
      v_acc.label
      using errcode = 'check_violation';
  end if;

  if v_acc.currency_code is distinct from f.currency_code then
    raise exception
      'Opération refusée : la devise du compte (%) diffère de celle de la facture (%). Aucune conversion n''est définie.',
      v_acc.currency_code, f.currency_code
      using errcode = 'check_violation';
  end if;

  -- §21 : Solde = Montant dû − Σ règlements validés. Le montant dû d'une
  -- facture client est son TOTAL : sous-total − réductions (Workflow 07 §23).
  v_total := public.customer_invoice_total(p_invoice_id);
  v_paid  := public.customer_invoice_paid(p_invoice_id);
  v_due   := v_total - v_paid;

  -- §23 : « Une facture dont le solde est nul ne doit normalement plus accepter
  -- de nouveau paiement. »
  if v_due <= 0 then
    raise exception
      'Opération refusée : cette facture est déjà soldée. Aucun règlement supplémentaire n''est accepté (Workflow 08 §23).'
      using errcode = 'check_violation';
  end if;

  /*
   * §40 : « Si un client verse un montant supérieur à une facture, le système
   * doit appliquer une règle définie par ADIKOM. […] Le système ne doit pas
   * décider automatiquement sans règle métier. »
   *
   * Aucune règle n'est définie : ni affectation à une autre facture (§37), ni
   * avance (§41). Le dépassement est donc REFUSÉ, avec son motif — le système
   * ne fabrique ni avoir ni avance par accident.
   */
  if p_amount > v_due then
    raise exception
      'Opération refusée : le règlement (% KMF) dépasse le reste dû sur cette facture (% KMF). Le traitement d''un trop-perçu relève de règles qu''ADIKOM n''a pas arrêtées (Workflow 08 §40).',
      p_amount, v_due
      using errcode = 'check_violation';
  end if;

  v_no := public.next_number('payment');

  -- 🟥 S-1 — ouvert au plus près de l'insertion, refermé juste après.
  perform set_config('adikom.customer_payment', 'on', true);

  insert into public.customer_payments
    (payment_no, customer_invoice_id, account_id, amount, received_on, method,
     external_ref, notes, validated_by, created_by, updated_by)
  values
    (v_no, p_invoice_id, p_account_id, p_amount, p_received_on, p_method,
     nullif(btrim(coalesce(p_external_ref, '')), ''),
     nullif(btrim(coalesce(p_notes, '')), ''),
     public.current_actor(), public.current_actor(), public.current_actor())
  returning id into v_id;

  perform set_config('adikom.customer_payment', 'off', true);

  -- §47 : un encaissement client AUGMENTE le compte. L'écriture est la
  -- conséquence du règlement, jamais un acte séparé.
  insert into public.treasury_entries
    (account_id, entry_date, direction, kind, amount, description, reference,
     customer_payment_id, created_by, updated_by)
  values
    (p_account_id, p_received_on, 'IN', 'CUSTOMER_PAYMENT', p_amount,
     'Encaissement ' || v_no || ' — facture ' || f.invoice_no,
     nullif(btrim(coalesce(p_external_ref, '')), ''),
     v_id, public.current_actor(), public.current_actor());

  return v_id;
end;
$$;

comment on function public.record_customer_payment is
  'Constate un encaissement et produit son écriture d''entrée (§13, §47). Refuse au-delà du reste dû (§40) et sur une facture soldée (§23). Seul chemin de création d''un règlement ordinaire (S-1).';

revoke execute on function public.record_customer_payment(
  uuid, uuid, bigint, date, public.payment_method, text, text) from public, anon;
grant  execute on function public.record_customer_payment(
  uuid, uuid, bigint, date, public.payment_method, text, text)
  to authenticated, service_role;


-- =============================================================================
-- 3. CONTRÔLES
-- =============================================================================

do $$
declare
  v_def text;
  v_n   int;
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.customer_payments'::regclass
      and tgname = 'customer_payments_zzz_born_by_function' and not tgisinternal
  ) then
    raise exception 'Le déclencheur d''intégrité de création n''est pas posé.';
  end if;

  select count(*) into v_n
  from pg_trigger
  where tgrelid = 'public.customer_payments'::regclass
    and not tgisinternal
    and tgname > 'customer_payments_zzz_born_by_function';
  if v_n > 0 then
    raise exception '% déclencheur(s) passent APRÈS la garde d''intégrité.', v_n;
  end if;

  v_def := pg_get_functiondef(
    'public.record_customer_payment(uuid, uuid, bigint, date, public.payment_method, text, text)'::regprocedure);
  if v_def not like '%adikom.customer_payment'', ''on''%'
     or v_def not like '%adikom.customer_payment'', ''off''%' then
    raise exception '`record_customer_payment` n''ouvre pas, ou ne referme pas, son drapeau.';
  end if;

  -- L'écriture de trésorerie et les plafonds de la dernière version demeurent.
  if v_def not like '%insert into public.treasury_entries%'
     or v_def not like '%CUSTOMER_PAYMENT%'
     or v_def not like '%pg_advisory_xact_lock%'
     or v_def not like '%dépasse le reste dû%' then
    raise exception '`record_customer_payment` a perdu un élément de sa dernière version.';
  end if;

  -- Le drapeau se referme AVANT l'écriture de trésorerie : il ne couvre que
  -- l'insertion du règlement.
  if position('adikom.customer_payment'', ''off''' in v_def)
     > position('insert into public.treasury_entries' in v_def) then
    raise exception 'Le drapeau reste ouvert pendant l''écriture de trésorerie.';
  end if;

  if pg_get_functiondef('public.fn_customer_payment_born_by_function()'::regprocedure) not like '%is_restoring%' then
    raise exception 'La garde ignore la restauration.';
  end if;

  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and p.proname in ('record_customer_payment', 'fn_customer_payment_born_by_function');
  if v_n > 0 then
    raise exception 'Une fonction de la correction est SECURITY DEFINER (D4).';
  end if;

  foreach v_def in array array[
    'customer_payments_starts_validated', 'customer_payments_transition',
    'customer_payments_no_delete', 'customer_payments_audit'
  ] loop
    if not exists (select 1 from pg_trigger
                   where tgrelid = 'public.customer_payments'::regclass
                     and tgname = v_def and not tgisinternal) then
      raise exception 'Le déclencheur « % » a disparu.', v_def;
    end if;
  end loop;

  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'customer_payments'
                   and policyname = 'customer_payments_insert') then
    raise exception 'La policy d''insertion a été remplacée.';
  end if;

  raise notice '[OK] 113. S-1 : un règlement client naît par sa fonction.';
end $$;
