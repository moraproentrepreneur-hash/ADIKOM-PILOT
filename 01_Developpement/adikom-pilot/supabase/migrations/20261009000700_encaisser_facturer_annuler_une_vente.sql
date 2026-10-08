-- =============================================================================
-- ADIKOM PILOT — 118 · Encaisser, facturer, annuler une vente au comptoir
-- LOT 28 — Plan 02 §3.4, §3.5, §7.5 · Plan 01 §16.5–16.8, §16.14 · Module 12
-- §13 à §19 · DEC-055 (C-2, T-2, D-3, P-4, D-1, B-10)
--
-- LES DÉRIVÉS — D1 : RIEN N'EST STOCKÉ
--
--   pos_sale_subtotal(vente)   Σ (quantité × prix − remise de ligne)
--   pos_sale_total(vente)      NET À PAYER = sous-total − remise globale
--   pos_sale_paid(vente)       Σ ENCAISSÉ des paiements validés
--   pos_sale_tendered(vente)   Σ DONNÉ des paiements validés
--   pos_sale_change(vente)     MONNAIE = donné − encaissé
--   pos_session_expected       étendu : fond + espèces encaissées
--
-- LES ACTES
--
--   record_pos_sale(session, lignes, paiements, client?, remise globale?,
--                   observation?, non soldée?, échéance?)        → uuid
--   invoice_pos_sale(vente, échéance?)                           → uuid
--   cancel_pos_sale(vente, motif)
--
-- RÈGLES INVARIABLES (Plan 02 §8.3) : `security invoker`, `require_capability`
-- en tête, `revoke`/`grant` explicites, la cohérence AVANT l'acteur, et « une
-- garde qui compte doit compter la vérité » : chaque acte qui LIT pour décider
-- exige la capacité de lire ce qu'il lit.
--
-- 🟥 AUCUNE FONCTION `SECURITY DEFINER`. AUCUNE FONCTION DE FACTURATION
-- RÉÉCRITE : `invoice_pos_sale` ORCHESTRE `create_customer_invoice`,
-- `add_customer_invoice_line` et `issue_customer_invoice`, telles qu'elles sont.
-- =============================================================================


-- =============================================================================
-- 1. LES DÉRIVÉS
--
-- `SECURITY INVOKER` : sous les droits de l'appelant. Un appelant sans
-- `pos.sales.view` ne lit aucune ligne et obtient 0 — raison pour laquelle
-- chaque acte qui s'y fie EXIGE nommément cette capacité (doctrine du LOT 4).
-- =============================================================================

create or replace function public.pos_sale_subtotal(p_sale_id uuid)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(l.quantity::bigint * l.unit_price - l.line_discount), 0)::bigint
  from public.pos_sale_lines l
  where l.pos_sale_id = p_sale_id;
$$;

create or replace function public.pos_sale_total(p_sale_id uuid)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $$
  select public.pos_sale_subtotal(p_sale_id) - coalesce(
    (select s.global_discount from public.pos_sales s where s.id = p_sale_id), 0);
$$;

create or replace function public.pos_sale_paid(p_sale_id uuid)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(p.applied_amount), 0)::bigint
  from public.pos_payments p
  where p.pos_sale_id = p_sale_id and p.status = 'VALIDATED';
$$;

create or replace function public.pos_sale_tendered(p_sale_id uuid)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(p.tendered_amount), 0)::bigint
  from public.pos_payments p
  where p.pos_sale_id = p_sale_id and p.status = 'VALIDATED';
$$;

create or replace function public.pos_sale_change(p_sale_id uuid)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $$
  select public.pos_sale_tendered(p_sale_id) - public.pos_sale_paid(p_sale_id);
$$;

comment on function public.pos_sale_subtotal(uuid) is
  'Sous-total = Σ (quantité × prix − remise de ligne) — DEC-051 §c. Calculé sous les droits de l''appelant.';
comment on function public.pos_sale_total(uuid) is
  'NET À PAYER = sous-total − remise globale. Aucun total n''est stocké (D1).';
comment on function public.pos_sale_paid(uuid) is
  'Σ ENCAISSÉ des paiements validés — ce que la trésorerie enregistre. Jamais le donné.';
comment on function public.pos_sale_tendered(uuid) is
  'Σ DONNÉ des paiements validés.';
comment on function public.pos_sale_change(uuid) is
  'MONNAIE rendue = donné − encaissé (Plan 02 §7.5). Jamais une écriture.';

do $$
declare v_fn text;
begin
  foreach v_fn in array array['pos_sale_subtotal', 'pos_sale_total', 'pos_sale_paid',
                              'pos_sale_tendered', 'pos_sale_change'] loop
    execute format('revoke execute on function public.%I(uuid) from public, anon', v_fn);
    execute format('grant execute on function public.%I(uuid) to authenticated, service_role', v_fn);
  end loop;
end $$;


-- =============================================================================
-- 2. LE MONTANT THÉORIQUE DE LA SESSION — fond + ESPÈCES encaissées
--
-- Reprise de la DERNIÈRE VERSION (migration 109) : même signature, même
-- capacité, même retour NULL si les montants ne sont pas lisibles (DEC-017).
-- S'ajoutent les espèces ENCAISSÉES des paiements VALIDÉS de la session.
--
-- 🟥 SEULES LES ESPÈCES : un paiement Mvola ou un chèque n'entre pas dans la
-- caisse physique (D-3). Une vente annulée — même après la clôture (B-10) —
-- sort du théorique : l'écart d'une session close change, il est dérivé.
--
-- Les paiements sont lus sous la policy Q-12 (migration 116) : quiconque lit
-- les montants de la session lit aussi les espèces qui les composent.
-- =============================================================================

create or replace function public.pos_session_expected(p_session_id uuid)
returns bigint
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_float bigint;
  v_cash  bigint;
begin
  perform public.require_capability(array['pos.sessions.view'], 'consulter une session de caisse');

  select a.opening_float into v_float
  from public.pos_session_amounts a
  where a.session_id = p_session_id;

  if v_float is null then
    return null;  -- montants non lisibles : « non visible », jamais 0
  end if;

  select coalesce(sum(p.applied_amount), 0) into v_cash
  from public.pos_payments p
  where p.session_id = p_session_id
    and p.method = 'CASH'
    and p.status = 'VALIDATED';

  return v_float + v_cash;
end;
$$;

comment on function public.pos_session_expected(uuid) is
  'Montant théorique de clôture = fond de caisse + espèces ENCAISSÉES des paiements validés (LOT 28). Dérivé, jamais stocké (D1). NULL si les montants ne sont pas lisibles.';

revoke execute on function public.pos_session_expected(uuid) from public, anon;
grant  execute on function public.pos_session_expected(uuid) to authenticated, service_role;


-- =============================================================================
-- 3. 🟥 FACTURER UNE VENTE — l'orchestrateur du règlement adossé (C-2)
--
-- Elle N'ÉCRIT RIEN dans la facture elle-même : elle appelle les fonctions de
-- facturation EXISTANTES, qui portent leurs propres contrôles et EXIGENT leurs
-- propres capacités (DEC-024). Rien n'est contourné : un caissier sans droit de
-- facturer ne facture pas.
--
--   create_customer_invoice        la facture, au client de la vente
--   lien pos_sale_id               posé ICI, sous drapeau (migration 116)
--   add_customer_invoice_line      une ligne SERVICE par ligne vendue
--                                  une ligne DISCOUNT par remise (D-1)
--   issue_customer_invoice         émise
--   RÈGLEMENT ADOSSÉ               un par paiement PDV validé — SANS écriture
--
-- Le règlement adossé est inséré ICI, et non par `record_customer_payment` :
-- celle-ci produit TOUJOURS une écriture `CUSTOMER_PAYMENT`, et l'argent est
-- déjà en trésorerie. C'est la seule voie de naissance d'un règlement adossé :
-- deux drapeaux (S-1 et adossement), les gardes de la migration 116 vérifiant
-- montant, compte, mode, jour et vente.
-- =============================================================================

create or replace function public.invoice_pos_sale(
  p_sale_id  uuid,
  p_due_date date default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  s        public.pos_sales%rowtype;
  l        record;
  p        record;
  v_inv    uuid;
  v_no     text;
  v_date   date := (now() at time zone 'Indian/Comoro')::date;
  v_net    bigint;
  v_total  bigint;
  v_backed bigint := 0;
begin
  perform public.require_capability(array['pos.sales.view'], 'consulter la vente à facturer');
  perform public.require_capability(array['billing.customer_invoices.create'], 'préparer la facture de la vente');
  perform public.require_capability(array['billing.customer_invoices.view'], 'consulter la facture préparée');
  perform public.require_capability(array['billing.customer_invoices.issue'], 'émettre la facture de la vente');
  perform public.require_capability(array['billing.customer_payments.create'], 'solder la facture par les paiements reçus au comptoir');
  perform public.require_capability(array['billing.customer_payments.view'], 'consulter les règlements de la facture');
  perform public.require_capability(array['parties.clients.view'], 'consulter le client facturé');
  perform public.require_capability(array['catalog.services.view'], 'consulter les services facturés');

  -- Deux demandes simultanées pour la même vente se suivent. L'index unique
  -- partiel fait autorité ; le verrou rend le message compréhensible.
  perform pg_advisory_xact_lock(hashtext('pos_sale:' || p_sale_id::text)::bigint);

  select * into s from public.pos_sales where id = p_sale_id;

  if not found then
    raise exception 'Vente introuvable ou non lisible avec vos droits.' using errcode = 'no_data_found';
  end if;

  if s.status <> 'VALIDATED' then
    raise exception 'Opération refusée : la vente % est annulée. Une vente annulée ne se facture pas.', s.sale_no
      using errcode = 'check_violation';
  end if;

  -- Q-10 : une facture est liée au client ENREGISTRÉ (Module 07 §6).
  if s.client_id is null then
    raise exception 'Opération refusée : la vente % n''a pas de client. Une facture se rattache à un client enregistré ; une vente anonyme ne se facture pas.', s.sale_no
      using errcode = 'check_violation';
  end if;

  select i.invoice_no into v_no
  from public.customer_invoices i
  where i.pos_sale_id = s.id and i.status <> 'CANCELLED'
  limit 1;

  if v_no is not null then
    raise exception 'Opération refusée : la vente % est déjà reprise par la facture %. Une vente ne se facture qu''une fois.', s.sale_no, v_no
      using errcode = 'unique_violation';
  end if;

  v_net := public.pos_sale_total(s.id);
  if v_net <= 0 then
    raise exception 'Opération refusée : le net de la vente % est nul. Une créance de zéro n''est pas une créance.', s.sale_no
      using errcode = 'check_violation';
  end if;

  if p_due_date is not null and p_due_date < v_date then
    raise exception 'L''échéance ne peut pas précéder la date de la facture.' using errcode = 'check_violation';
  end if;

  -- --- La facture, par la chaîne existante -----------------------------------
  v_inv := public.create_customer_invoice(
    p_client_id         => s.client_id,
    p_invoice_date      => v_date,
    p_due_date          => p_due_date,
    p_rental_id         => null,
    p_notes             => 'Vente au comptoir ' || s.sale_no,
    p_billing_period_id => null,
    p_sales_order_id    => null
  );

  perform set_config('adikom.pos_invoice_link', 'on', true);

  update public.customer_invoices
     set pos_sale_id = s.id
   where id = v_inv;

  if not found then
    raise exception 'La facture préparée n''a pas pu être rattachée à la vente avec vos droits.'
      using errcode = 'insufficient_privilege';
  end if;

  perform set_config('adikom.pos_invoice_link', 'off', true);

  for l in
    select pl.label, pl.quantity, pl.unit_price, pl.line_discount, pl.service_id, pl.service_variant_id
    from public.pos_sale_lines pl
    where pl.pos_sale_id = s.id
    order by pl.line_no
  loop
    perform public.add_customer_invoice_line(
      p_invoice_id    => v_inv,
      p_kind          => 'SERVICE'::public.customer_invoice_line_kind,
      p_label         => l.label,
      p_quantity      => l.quantity,
      p_unit_price    => l.unit_price,
      p_justification => null,
      p_service_id    => l.service_id,
      p_variant_id    => l.service_variant_id,
      p_order_line_id => null
    );

    -- D-1 : chaque remise est une ligne DISCOUNT, IDENTIFIABLE (Workflow 07 §24).
    if l.line_discount > 0 then
      perform public.add_customer_invoice_line(
        p_invoice_id    => v_inv,
        p_kind          => 'DISCOUNT'::public.customer_invoice_line_kind,
        p_label         => 'Remise sur ' || l.label,
        p_quantity      => 1,
        p_unit_price    => l.line_discount,
        p_justification => 'Remise consentie au comptoir — vente ' || s.sale_no
      );
    end if;
  end loop;

  if s.global_discount > 0 then
    perform public.add_customer_invoice_line(
      p_invoice_id    => v_inv,
      p_kind          => 'DISCOUNT'::public.customer_invoice_line_kind,
      p_label         => 'Remise globale',
      p_quantity      => 1,
      p_unit_price    => s.global_discount,
      p_justification => 'Remise consentie au comptoir — vente ' || s.sale_no
    );
  end if;

  -- 🟥 La facture dit EXACTEMENT ce que dit la vente.
  v_total := public.customer_invoice_total(v_inv);
  if v_total is distinct from v_net then
    raise exception 'Opération refusée : la facture préparée (% KMF) ne reprend pas le net de la vente (% KMF).', v_total, v_net
      using errcode = 'check_violation';
  end if;

  perform public.issue_customer_invoice(v_inv, 'Vente au comptoir ' || s.sale_no);

  -- --- 🟥 Les règlements adossés — SANS écriture de trésorerie --------------
  perform pg_advisory_xact_lock(hashtext(v_inv::text)::bigint);

  for p in
    select pp.id, pp.applied_amount, pp.account_id, pp.method, pp.external_ref, pp.line_no
    from public.pos_payments pp
    where pp.pos_sale_id = s.id and pp.status = 'VALIDATED'
    order by pp.line_no
  loop
    v_no := public.next_number('payment');

    perform set_config('adikom.customer_payment', 'on', true);
    perform set_config('adikom.pos_backed_payment', 'on', true);

    insert into public.customer_payments
      (payment_no, customer_invoice_id, account_id, amount, received_on, method,
       external_ref, notes, pos_payment_id, validated_by, created_by, updated_by)
    values
      (v_no, v_inv, p.account_id, p.applied_amount, s.sale_date, p.method,
       p.external_ref,
       'Règlement adossé — encaissé au comptoir, vente ' || s.sale_no,
       p.id, public.current_actor(), public.current_actor(), public.current_actor());

    perform set_config('adikom.pos_backed_payment', 'off', true);
    perform set_config('adikom.customer_payment', 'off', true);

    v_backed := v_backed + p.applied_amount;
  end loop;

  if v_backed <> public.pos_sale_paid(s.id) or v_backed > v_net then
    raise exception 'Opération refusée : les règlements adossés (% KMF) ne reprennent pas exactement l''encaissé de la vente.', v_backed
      using errcode = 'check_violation';
  end if;

  return v_inv;
end;
$$;

comment on function public.invoice_pos_sale(uuid, date) is
  'Facture une vente au comptoir par les fonctions de facturation EXISTANTES, puis la solde par un règlement ADOSSÉ par paiement — sans aucune écriture de trésorerie (C-2, A-11).';

revoke execute on function public.invoice_pos_sale(uuid, date) from public, anon;
grant  execute on function public.invoice_pos_sale(uuid, date) to authenticated, service_role;


-- =============================================================================
-- 4. 🟥 ENCAISSER UNE VENTE
--
-- L'ÉCRAN ENVOIE :
--   p_lines    [{ "variant_id": uuid, "quantity": int, "discount": int? }]
--   p_payments [{ "method": text, "tendered": int, "account_id": uuid?,
--                 "external_ref": text? }]
--
-- LA BASE DÉCIDE (Module 12 §15.2) :
--   · le PRIX de chaque ligne — résolu à la date de la vente (D16), jamais reçu ;
--   · l'ENCAISSÉ de chaque paiement — hors espèces, le donné ; en espèces, le
--     reste à payer ; la MONNAIE est la différence (Q-9) ;
--   · le COMPTE des espèces — celui de la caisse (D-3) ;
--   · une ÉCRITURE `POS_SALE` par paiement, de l'encaissé (T-2).
--
-- Non soldée (P-4) : seulement sur demande expresse (`p_credit`), avec un client
-- et `pos.sales.credit` ; la facture naît et s'émet DANS LA MÊME TRANSACTION.
-- =============================================================================

create or replace function public.record_pos_sale(
  p_session_id      uuid,
  p_lines           jsonb,
  p_payments        jsonb default '[]'::jsonb,
  p_client_id       uuid default null,
  p_global_discount bigint default 0,
  p_observation     text default null,
  p_credit          boolean default false,
  p_due_date        date default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := public.current_actor();
  v_status   public.pos_session_status;
  v_cashier  uuid;
  v_account  uuid;
  v_seen     boolean := false;
  v_id       uuid;
  v_no       text;
  v_now      timestamptz := now();
  v_date     date := (now() at time zone 'Indian/Comoro')::date;
  v_line     jsonb;
  v_pay      jsonb;
  v_n        int := 0;
  v_variant  uuid;
  v_qty      bigint;
  v_disc     bigint;
  v_service  uuid;
  v_slabel   text;
  v_vlabel   text;
  v_purpose  public.service_purpose;
  v_sstatus  public.service_status;
  v_vactive  boolean;
  v_price_id uuid;
  v_price    bigint;
  v_line_id  uuid;
  v_cost_id  uuid;
  v_cost     bigint;
  v_discount boolean := coalesce(p_global_discount, 0) > 0;
  v_net      bigint;
  v_method   text;
  v_tendered bigint;
  v_acc      uuid;
  v_ref      text;
  v_cash_tendered bigint := null;
  v_cash_ref text;
  v_noncash  bigint := 0;
  v_cash_applied bigint := 0;
  v_paid     bigint;
  v_pay_id   uuid;
  v_pay_no   int := 0;
  v_label    text;
begin
  perform public.require_capability(array['pos.sales.create'], 'encaisser une vente');
  perform public.require_capability(array['pos.sales.view'], 'consulter la vente encaissée');
  perform public.require_capability(array['pos.sessions.view'], 'consulter la session de caisse');
  perform public.require_capability(array['pos.registers.view'], 'consulter la caisse de la session');
  perform public.require_capability(array['treasury.accounts.view'], 'consulter les comptes mouvementés');
  perform public.require_capability(array['catalog.services.view'], 'consulter les services vendus');

  -- --- Cohérence des données reçues, pour TOUT acteur ------------------------
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Une vente porte au moins une ligne.' using errcode = 'check_violation';
  end if;
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'Les paiements se transmettent sous forme de liste.' using errcode = 'check_violation';
  end if;
  if coalesce(p_global_discount, 0) < 0 then
    raise exception 'La remise globale ne peut pas être négative (DEC-051 §d).' using errcode = 'check_violation';
  end if;

  -- --- La session : OUVERTE, et celle de l'acteur ---------------------------
  if v_actor is null then
    raise exception 'Une vente s''encaisse au nom d''un utilisateur authentifié : elle n''a pas de caissier hors session applicative.'
      using errcode = 'check_violation';
  end if;

  select true, s.status, s.cashier_id, r.account_id
    into v_seen, v_status, v_cashier, v_account
  from public.pos_sessions s
  join public.pos_registers r on r.id = s.register_id
  where s.id = p_session_id;

  if not coalesce(v_seen, false) then
    raise exception 'Session de caisse introuvable ou non lisible avec vos droits. Une vente exige une session ouverte.'
      using errcode = 'no_data_found';
  end if;
  if v_status <> 'OPEN' then
    raise exception 'Opération refusée : cette session de caisse est close. Ouvrez une session pour encaisser.'
      using errcode = 'check_violation';
  end if;
  if v_cashier <> v_actor then
    raise exception 'Opération refusée : on n''encaisse que sur sa propre session de caisse.'
      using errcode = 'check_violation';
  end if;

  -- --- Le client --------------------------------------------------------------
  if p_client_id is not null then
    perform public.require_capability(array['parties.clients.view'], 'consulter le client de la vente');
    if not exists (select 1 from public.clients c where c.id = p_client_id) then
      raise exception 'Le client désigné est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;
  end if;

  -- --- D-1 : toute remise non nulle exige sa capacité ------------------------
  for v_line in select * from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_line) <> 'object' then
      raise exception 'Une ligne de vente est mal formée.' using errcode = 'check_violation';
    end if;
    if coalesce((v_line ->> 'discount')::bigint, 0) > 0 then
      v_discount := true;
    end if;
  end loop;

  if v_discount then
    perform public.require_capability(array['pos.sales.discount'], 'accorder une remise');
  end if;

  -- --- La vente ---------------------------------------------------------------
  v_no := public.next_number('pos_sale');

  perform set_config('adikom.pos_sale', 'on', true);

  insert into public.pos_sales
    (sale_no, session_id, cashier_id, client_id, sold_at, sale_date, global_discount,
     observation, created_by, updated_by)
  values
    (v_no, p_session_id, v_actor, p_client_id, v_now, v_date, coalesce(p_global_discount, 0),
     nullif(btrim(coalesce(p_observation, '')), ''), v_actor, v_actor)
  returning id into v_id;

  -- --- Les lignes : le prix VIENT DU CATALOGUE, à la date (D16) ---------------
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    v_variant := nullif(v_line ->> 'variant_id', '')::uuid;
    v_qty     := (v_line ->> 'quantity')::bigint;
    v_disc    := coalesce((v_line ->> 'discount')::bigint, 0);

    if v_variant is null then
      raise exception 'La ligne % ne désigne aucune prestation.', v_n using errcode = 'check_violation';
    end if;
    if v_qty is null or v_qty <= 0 or v_qty > 2147483647 then
      raise exception 'La quantité de la ligne % doit être un entier positif.', v_n using errcode = 'check_violation';
    end if;
    if v_disc < 0 then
      raise exception 'La remise de la ligne % ne peut pas être négative (DEC-051 §d).', v_n using errcode = 'check_violation';
    end if;

    v_service := null;
    select v.service_id, s.label, v.label, s.purpose, s.status, v.is_active
      into v_service, v_slabel, v_vlabel, v_purpose, v_sstatus, v_vactive
    from public.service_variants v
    join public.services s on s.id = v.service_id
    where v.id = v_variant;

    if v_service is null then
      raise exception 'La prestation de la ligne % est introuvable ou n''est pas lisible avec vos droits.', v_n
        using errcode = 'no_data_found';
    end if;

    v_label := v_slabel || ' — ' || v_vlabel;

    if v_purpose not in ('SALE', 'BOTH') then
      raise exception 'Opération refusée : « % » n''est pas un service de vente.', v_label using errcode = 'check_violation';
    end if;
    if v_sstatus <> 'ACTIVE' or not v_vactive then
      raise exception 'Opération refusée : « % » n''est pas actif au catalogue.', v_label using errcode = 'check_violation';
    end if;

    v_price_id := null;
    select r.price_id, r.amount into v_price_id, v_price
    from public.resolve_service_price(v_variant, v_date) r;

    if v_price_id is null then
      raise exception 'Opération refusée : aucun prix de vente n''est en vigueur le % pour « % ». Une vente ne devine pas un montant.',
        to_char(v_date, 'DD/MM/YYYY'), v_label
        using errcode = 'no_data_found';
    end if;

    if v_disc > v_qty * v_price then
      raise exception 'Opération refusée : la remise de « % » (% KMF) dépasse le montant de la ligne (% KMF). Un net de ligne n''est jamais négatif (DEC-051 §d).',
        v_label, v_disc, v_qty * v_price
        using errcode = 'check_violation';
    end if;

    insert into public.pos_sale_lines
      (pos_sale_id, line_no, service_id, service_variant_id, service_price_id, label,
       quantity, unit_price, line_discount, created_by)
    values
      (v_id, v_n, v_service, v_variant, v_price_id, v_label, v_qty::int, v_price, v_disc, v_actor)
    returning id into v_line_id;

    /*
     * LE COÛT COPIÉ (DEC-049 §e) — seulement si le vendeur peut le LIRE.
     * Sans `SECURITY DEFINER`, on ne copie pas ce qu'on ne voit pas : la marge
     * de la ligne sera alors « inconnue », jamais nulle (Module 12 Q-13).
     */
    if public.has_permission('catalog.services.cost.view') then
      v_cost_id := null;
      select c.cost_id, c.amount into v_cost_id, v_cost
      from public.resolve_service_cost(v_variant, v_date) c;

      if v_cost_id is not null then
        insert into public.commercial_line_costs (pos_sale_line_id, service_cost_id, unit_cost, created_by)
        values (v_line_id, v_cost_id, v_cost, v_actor);
      end if;
    end if;
  end loop;

  v_net := public.pos_sale_total(v_id);

  if v_net < 0 then
    raise exception 'Opération refusée : la remise globale (% KMF) dépasse le sous-total après remises de ligne (% KMF). Le total ne devient jamais négatif (DEC-051 §d).',
      p_global_discount, public.pos_sale_subtotal(v_id)
      using errcode = 'check_violation';
  end if;

  -- --- Les paiements : lecture, puis la règle de la monnaie -------------------
  for v_pay in select * from jsonb_array_elements(p_payments) loop
    if jsonb_typeof(v_pay) <> 'object' then
      raise exception 'Un paiement est mal formé.' using errcode = 'check_violation';
    end if;

    v_method   := upper(btrim(coalesce(v_pay ->> 'method', '')));
    v_tendered := (v_pay ->> 'tendered')::bigint;

    if v_method not in ('CASH', 'CHEQUE', 'MVOLA', 'HOLO', 'WAKATI') then
      raise exception 'Mode de paiement non admis au comptoir : « % ». Modes admis : espèces, chèque, Mvola, Holo, Wakati.', v_method
        using errcode = 'check_violation';
    end if;
    if v_tendered is null or v_tendered <= 0 then
      raise exception 'Le montant donné doit être un entier positif, en KMF.' using errcode = 'check_violation';
    end if;

    if v_method = 'CASH' then
      if v_cash_tendered is not null then
        raise exception 'Une vente reçoit au plus une remise d''espèces : la monnaie se calcule sur elle.'
          using errcode = 'check_violation';
      end if;
      v_cash_tendered := v_tendered;
      v_cash_ref := nullif(btrim(coalesce(v_pay ->> 'external_ref', '')), '');
    else
      v_noncash := v_noncash + v_tendered;
    end if;
  end loop;

  -- 🟥 Pas de monnaie sur un chèque ni sur un transfert mobile.
  if v_noncash > v_net then
    raise exception 'Opération refusée : les paiements hors espèces (% KMF) dépassent le net à payer (% KMF). Aucune monnaie ne se rend sur un chèque ni sur un transfert mobile.',
      v_noncash, v_net
      using errcode = 'check_violation';
  end if;

  if v_cash_tendered is not null then
    -- 🟥 L'ENCAISSÉ EN ESPÈCES EST LE RESTE À PAYER, PAS LE DONNÉ.
    v_cash_applied := least(v_cash_tendered, v_net - v_noncash);

    if v_cash_applied <= 0 then
      raise exception 'Opération refusée : la vente est déjà réglée sans espèces. Aucun montant en espèces n''est à encaisser.'
        using errcode = 'check_violation';
    end if;
  end if;

  v_paid := v_noncash + v_cash_applied;

  -- Paiements hors espèces d'abord : ils s'imputent pour leur montant.
  for v_pay in select * from jsonb_array_elements(p_payments) loop
    v_method := upper(btrim(v_pay ->> 'method'));
    continue when v_method = 'CASH';

    v_tendered := (v_pay ->> 'tendered')::bigint;
    v_acc      := nullif(v_pay ->> 'account_id', '')::uuid;
    v_ref      := nullif(btrim(coalesce(v_pay ->> 'external_ref', '')), '');

    if v_acc is null then
      raise exception 'Un paiement % désigne le compte sur lequel il entre (D-3).', v_method
        using errcode = 'check_violation';
    end if;

    v_pay_no := v_pay_no + 1;

    insert into public.pos_payments
      (pos_sale_id, line_no, session_id, cashier_id, method, tendered_amount, applied_amount,
       account_id, external_ref, created_by, updated_by)
    values
      (v_id, v_pay_no, p_session_id, v_actor, v_method::public.payment_method, v_tendered, v_tendered,
       v_acc, v_ref, v_actor, v_actor)
    returning id into v_pay_id;

    -- T-2 : UNE écriture par paiement, de l'ENCAISSÉ.
    insert into public.treasury_entries
      (account_id, entry_date, direction, kind, amount, description, reference,
       pos_payment_id, created_by, updated_by)
    values
      (v_acc, v_date, 'IN', 'POS_SALE', v_tendered,
       'Vente ' || v_no || ' — ' || case v_method
         when 'CHEQUE' then 'Chèque' when 'MVOLA' then 'Mvola'
         when 'HOLO' then 'Holo' when 'WAKATI' then 'Wakati' else v_method end,
       v_ref, v_pay_id, v_actor, v_actor);
  end loop;

  if v_cash_tendered is not null then
    v_pay_no := v_pay_no + 1;

    -- D-3 : les espèces entrent dans le compte de LA CAISSE, imposé.
    insert into public.pos_payments
      (pos_sale_id, line_no, session_id, cashier_id, method, tendered_amount, applied_amount,
       account_id, external_ref, created_by, updated_by)
    values
      (v_id, v_pay_no, p_session_id, v_actor, 'CASH', v_cash_tendered, v_cash_applied,
       v_account, v_cash_ref, v_actor, v_actor)
    returning id into v_pay_id;

    -- 🟥 LA TRÉSORERIE ENREGISTRE L'ENCAISSÉ — JAMAIS LE DONNÉ (Plan 02 §7.5).
    insert into public.treasury_entries
      (account_id, entry_date, direction, kind, amount, description, reference,
       pos_payment_id, created_by, updated_by)
    values
      (v_account, v_date, 'IN', 'POS_SALE', v_cash_applied,
       'Vente ' || v_no || ' — Espèces', v_cash_ref, v_pay_id, v_actor, v_actor);
  end if;

  perform set_config('adikom.pos_sale', 'off', true);

  -- --- Soldée, ou non soldée (P-4) --------------------------------------------
  if v_paid < v_net then
    if not coalesce(p_credit, false) then
      raise exception 'Opération refusée : il manque % KMF pour solder la vente (net % KMF, encaissé % KMF). Complétez le paiement, ou validez une vente non soldée.',
        v_net - v_paid, v_net, v_paid
        using errcode = 'check_violation';
    end if;

    perform public.require_capability(array['pos.sales.credit'], 'valider une vente non soldée');

    if p_client_id is null then
      raise exception 'Opération refusée : une vente non soldée exige un client enregistré (P-4). Une vente anonyme se règle intégralement : le solde d''un inconnu ne se suit pas.'
        using errcode = 'check_violation';
    end if;

    -- La facture naît et s'émet DANS CETTE TRANSACTION : le solde vit là où le
    -- système sait déjà le suivre (Plan 02 §3.4).
    perform public.invoice_pos_sale(v_id, p_due_date);
  elsif p_due_date is not null then
    raise exception 'Une échéance ne concerne qu''une vente non soldée.' using errcode = 'check_violation';
  end if;

  return v_id;
end;
$$;

comment on function public.record_pos_sale(uuid, jsonb, jsonb, uuid, bigint, text, boolean, date) is
  'Encaisse une vente sous la session OUVERTE de l''appelant : prix résolus à la date (D16), remises gardées (D-1), encaissé calculé par la base, espèces sur le compte de la caisse (D-3), une écriture POS_SALE de l''encaissé par paiement (T-2). Non soldée : client + pos.sales.credit, facture émise dans la transaction (P-4).';

revoke execute on function public.record_pos_sale(uuid, jsonb, jsonb, uuid, bigint, text, boolean, date) from public, anon;
grant  execute on function public.record_pos_sale(uuid, jsonb, jsonb, uuid, bigint, text, boolean, date) to authenticated, service_role;


-- =============================================================================
-- 5. ANNULER UNE VENTE — B-10
--
-- Motif OBLIGATOIRE. Refusée si la vente est facturée (la garde de la
-- migration 116 fait autorité, y compris hors de cette fonction). Possible
-- après la clôture de la session : l'écart de celle-ci change, il est dérivé.
-- La vente, SES paiements et LEURS écritures passent `CANCELLED` — jamais
-- celles d'une autre vente. Rien n'est effacé.
-- =============================================================================

create or replace function public.cancel_pos_sale(
  p_sale_id uuid,
  p_reason  text
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  s       public.pos_sales%rowtype;
  v_actor uuid := public.current_actor();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_left  int;
  v_no    text;
begin
  perform public.require_capability(array['pos.sales.cancel'], 'annuler une vente');
  perform public.require_capability(array['pos.sales.view'], 'consulter la vente à annuler');
  -- On ne défait pas une écriture qu'on ne peut pas lire (migration 054).
  perform public.require_capability(array['treasury.entries.view'], 'annuler les écritures de la vente');
  -- On ne conclut pas « non facturée » sans pouvoir lire les factures (B-10).
  perform public.require_capability(array['billing.customer_invoices.view'], 'vérifier que la vente n''est pas facturée');

  if v_reason is null then
    raise exception 'Le motif d''annulation est obligatoire (B-10).' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('pos_sale:' || p_sale_id::text)::bigint);

  select * into s from public.pos_sales where id = p_sale_id;

  if not found then
    raise exception 'Vente introuvable ou non lisible avec vos droits.' using errcode = 'no_data_found';
  end if;

  if s.status = 'CANCELLED' then
    raise exception 'Opération refusée : la vente % est déjà annulée.', s.sale_no using errcode = 'check_violation';
  end if;

  select i.invoice_no into v_no
  from public.customer_invoices i
  where i.pos_sale_id = s.id and i.status <> 'CANCELLED'
  limit 1;

  if v_no is not null then
    raise exception 'Opération refusée : la vente % est reprise par la facture %. Une vente facturée ne s''annule pas tant que les avoirs ne sont pas gérés (B-10).', s.sale_no, v_no
      using errcode = 'check_violation';
  end if;

  perform set_config('adikom.pos_sale', 'on', true);

  update public.pos_sales
     set status        = 'CANCELLED',
         cancelled_at  = now(),
         cancelled_by  = v_actor,
         cancel_reason = v_reason,
         updated_by    = v_actor
   where id = s.id;

  update public.pos_payments
     set status       = 'CANCELLED',
         cancelled_at = now(),
         updated_by   = v_actor
   where pos_sale_id = s.id
     and status = 'VALIDATED';

  perform set_config('adikom.pos_sale', 'off', true);

  -- LEURS écritures, et elles seules.
  update public.treasury_entries e
     set status     = 'CANCELLED',
         updated_by = v_actor
   where e.status = 'VALIDATED'
     and e.pos_payment_id in (select p.id from public.pos_payments p where p.pos_sale_id = s.id);

  select count(*) into v_left
  from public.treasury_entries e
  join public.pos_payments p on p.id = e.pos_payment_id
  where p.pos_sale_id = s.id and e.status = 'VALIDATED';

  if v_left > 0 then
    raise exception 'Opération refusée : une écriture de cette vente n''a pas pu être annulée. Le compte porterait un encaissement sans cause.'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

comment on function public.cancel_pos_sale(uuid, text) is
  'Annule une vente non facturée (B-10), avec motif obligatoire, même après la clôture de sa session : la vente, ses paiements et leurs écritures passent CANCELLED. Rien n''est effacé ; aucun remboursement (B-11).';

revoke execute on function public.cancel_pos_sale(uuid, text) from public, anon;
grant  execute on function public.cancel_pos_sale(uuid, text) to authenticated, service_role;


-- =============================================================================
-- 6. CONTRÔLES
-- =============================================================================

do $$
declare
  v_def text;
  v_fn  text;
begin
  -- D4.
  if exists (
    select 1 from pg_proc
    where oid in (
      'public.record_pos_sale(uuid, jsonb, jsonb, uuid, bigint, text, boolean, date)'::regprocedure,
      'public.invoice_pos_sale(uuid, date)'::regprocedure,
      'public.cancel_pos_sale(uuid, text)'::regprocedure,
      'public.pos_session_expected(uuid)'::regprocedure,
      'public.pos_sale_total(uuid)'::regprocedure,
      'public.pos_sale_paid(uuid)'::regprocedure
    ) and prosecdef
  ) then
    raise exception 'Une fonction du point de vente est SECURITY DEFINER (D4).';
  end if;

  -- Chaque acte ouvre ET referme ses drapeaux, et vérifie ses capacités.
  foreach v_fn in array array[
    'public.record_pos_sale(uuid, jsonb, jsonb, uuid, bigint, text, boolean, date)|adikom.pos_sale',
    'public.cancel_pos_sale(uuid, text)|adikom.pos_sale',
    'public.invoice_pos_sale(uuid, date)|adikom.pos_invoice_link',
    'public.invoice_pos_sale(uuid, date)|adikom.customer_payment',
    'public.invoice_pos_sale(uuid, date)|adikom.pos_backed_payment'
  ] loop
    v_def := pg_get_functiondef(split_part(v_fn, '|', 1)::regprocedure);
    if v_def not like '%' || split_part(v_fn, '|', 2) || ''', ''on''%'
       or v_def not like '%' || split_part(v_fn, '|', 2) || ''', ''off''%' then
      raise exception '% n''ouvre pas, ou ne referme pas, le drapeau %.', split_part(v_fn, '|', 1), split_part(v_fn, '|', 2);
    end if;
    if v_def not like '%require_capability%' then
      raise exception '% ne vérifie aucune capacité.', split_part(v_fn, '|', 1);
    end if;
  end loop;

  -- 🟥 C-2 — la facture sur demande N'ÉCRIT RIEN en trésorerie, et ne passe
  -- pas par `record_customer_payment`, qui en écrirait une.
  v_def := pg_get_functiondef('public.invoice_pos_sale(uuid, date)'::regprocedure);
  if v_def ilike '%insert into public.treasury_entries%' or v_def ilike '%record_customer_payment(%' then
    raise exception 'invoice_pos_sale produit une écriture de trésorerie : C-2 l''interdit.';
  end if;
  -- Elle orchestre les fonctions EXISTANTES.
  if v_def not like '%create_customer_invoice(%' or v_def not like '%add_customer_invoice_line(%'
     or v_def not like '%issue_customer_invoice(%' then
    raise exception 'invoice_pos_sale contourne la chaîne de facturation existante.';
  end if;

  -- 🟥 La vente écrit l'ENCAISSÉ, jamais le DONNÉ.
  v_def := pg_get_functiondef('public.record_pos_sale(uuid, jsonb, jsonb, uuid, bigint, text, boolean, date)'::regprocedure);
  if v_def not like '%''POS_SALE'', v_cash_applied%' then
    raise exception 'record_pos_sale n''écrit pas l''encaissé en espèces.';
  end if;

  -- `anon` n'exécute rien.
  if has_function_privilege('anon', 'public.record_pos_sale(uuid, jsonb, jsonb, uuid, bigint, text, boolean, date)', 'EXECUTE')
     or has_function_privilege('anon', 'public.invoice_pos_sale(uuid, date)', 'EXECUTE')
     or has_function_privilege('anon', 'public.cancel_pos_sale(uuid, text)', 'EXECUTE') then
    raise exception 'anon peut exécuter un acte du point de vente.';
  end if;

  -- Le théorique compte les ESPÈCES seulement.
  v_def := pg_get_functiondef('public.pos_session_expected(uuid)'::regprocedure);
  if v_def not like '%method = ''CASH''%' or v_def not like '%opening_float%' then
    raise exception 'pos_session_expected ne compte pas fond + espèces.';
  end if;

  raise notice '[OK] 118. Encaisser, facturer (règlement adossé, sans écriture), annuler (B-10) ; théorique = fond + espèces.';
end $$;
