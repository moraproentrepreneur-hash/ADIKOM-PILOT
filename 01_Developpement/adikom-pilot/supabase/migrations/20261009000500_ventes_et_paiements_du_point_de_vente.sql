-- =============================================================================
-- ADIKOM PILOT — 116 · Point de vente : ventes, lignes, paiements
-- LOT 28 — Plan 02 §3.4, §3.5, §7.5, §9.1–9.5, §11, §12 · Plan 01 §16.2–16.8
-- Module 12 §12 à §22 · décisions de la Direction du 8 octobre 2026 (DEC-055) :
-- C-2, T-2, D-3, P-4, D-1, B-10.
--
-- CE QUE CETTE MIGRATION POSE
--
--   · l'énumération `pos_sale_status` (VALIDATED · CANCELLED) — NOUVELLE ;
--   · quatre tables : `pos_sales`, `pos_sale_lines`, `pos_payments`,
--     `commercial_line_costs` (DEC-049 §e, renvoyée au LOT 28) ;
--   · deux colonnes de lien, et leurs gardes :
--       `customer_invoices.pos_sale_id`     — la facture reprend CETTE vente ;
--       `customer_payments.pos_payment_id`  — le RÈGLEMENT ADOSSÉ, sans écriture ;
--   · contraintes, gardes de cohérence, gardes « nées par leur fonction »,
--     contrôle différé de la vente, journal, RLS.
--
-- La 5ᵉ origine de trésorerie (`treasury_entries.pos_payment_id`) relève de la
-- migration SUIVANTE ; les actes de la 118 ; les capacités et la numérotation
-- de la 119 ; la sauvegarde de la 120.
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 🟥 AUCUN TOTAL STOCKÉ (D1)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Brut, remises, net, encaissé, donné, monnaie : tout se CALCULE (migration 118).
-- Ne sont stockés que les FAITS : la quantité, le prix résolu, la remise
-- consentie, le montant donné, le montant encaissé.
--
-- 🟥 AUCUNE FONCTION `SECURITY DEFINER` (doctrine D4).
-- =============================================================================


-- =============================================================================
-- 1. L'ÉNUMÉRATION — Plan 02 §9.5
-- =============================================================================

do $$ begin
  create type public.pos_sale_status as enum ('VALIDATED', 'CANCELLED');
exception when duplicate_object then null; end $$;

comment on type public.pos_sale_status is
  'VALIDATED : vente encaissée (ou non soldée, facturée). CANCELLED : annulée, état terminal — rien n''est effacé. Sert aussi à l''état d''un paiement, qui suit sa vente.';


-- =============================================================================
-- 2. LA VENTE
-- =============================================================================

create table public.pos_sales (
  id uuid primary key default gen_random_uuid(),

  -- VTE-2026-000001 — règle `pos_sale` (migration 119), avec année.
  sale_no text not null unique,

  /*
   * LA SESSION ET SON CAISSIER — la paire est désignée par la clé composite du
   * LOT 27 (`pos_sessions (id, cashier_id)`) : le caissier recopié ne peut pas
   * mentir, et les lectures « par caissier » ne relisent pas la session.
   */
  session_id uuid not null,
  cashier_id uuid not null references public.app_users (id) on delete restrict,

  -- A-12 : facultatif. P-4 : obligatoire si la vente n'est pas soldée (§9).
  client_id uuid references public.clients (id) on delete restrict,

  -- Horodatée par la base. Le JOUR est comorien, fixé à la naissance (D16 :
  -- c'est lui qui résout le prix, et il ne doit pas glisser à minuit UTC).
  sold_at   timestamptz not null default now(),
  sale_date date not null,

  -- D-1 / DEC-051 : remise globale, montant fixe en KMF.
  global_discount bigint not null default 0,

  observation text,

  status public.pos_sale_status not null default 'VALIDATED',

  cancelled_at  timestamptz,
  cancelled_by  uuid references public.app_users (id) on delete set null,
  cancel_reason text,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  constraint pos_sales_session_fk
    foreign key (session_id, cashier_id)
    references public.pos_sessions (id, cashier_id)
    on delete restrict,

  -- Rend la paire désignable par le paiement.
  constraint pos_sales_id_session_key unique (id, session_id),

  constraint pos_sales_global_discount_positive check (global_discount >= 0),
  constraint pos_sales_observation_not_blank check (observation is null or btrim(observation) <> ''),

  -- 🟥 B-10 : une annulation est DATÉE et MOTIVÉE.
  constraint pos_sales_cancellation_reasoned check (
    (status = 'VALIDATED' and cancelled_at is null and cancelled_by is null and cancel_reason is null)
    or (status = 'CANCELLED' and cancelled_at is not null
        and cancel_reason is not null and btrim(cancel_reason) <> '')
  )
);

comment on table public.pos_sales is
  'Vente au comptoir (Module 12 §14), sous une session ouverte. AUCUN total stocké (D1) : net, encaissé et monnaie se calculent.';
comment on column public.pos_sales.sale_date is
  'Jour comorien de la vente, fixé à sa naissance : il résout le prix (D16) et date l''écriture de trésorerie.';
comment on column public.pos_sales.global_discount is
  'Remise globale fixe en KMF (D-1, DEC-051), après les remises de ligne. Exige pos.sales.discount.';

create index pos_sales_session_idx on public.pos_sales (session_id, sold_at desc);
create index pos_sales_cashier_idx on public.pos_sales (cashier_id, sold_at desc);
create index pos_sales_client_idx  on public.pos_sales (client_id) where client_id is not null;
create index pos_sales_date_idx    on public.pos_sales (sale_date desc, sold_at desc);
create index pos_sales_status_idx  on public.pos_sales (status);


-- =============================================================================
-- 3. LES LIGNES — un service vendable, au prix de la date
-- =============================================================================

create table public.pos_sale_lines (
  id uuid primary key default gen_random_uuid(),

  pos_sale_id uuid not null references public.pos_sales (id) on delete restrict,
  line_no     int  not null,

  service_id         uuid not null references public.services (id) on delete restrict,
  service_variant_id uuid not null,

  -- D16 : la VERSION de prix appliquée est tracée, jamais seulement son montant.
  service_price_id uuid not null references public.service_variant_prices (id) on delete restrict,

  label      text   not null,
  quantity   int    not null,
  unit_price bigint not null,

  -- D-1 / DEC-051 : remise de ligne, montant fixe en KMF.
  line_discount bigint not null default 0,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,

  constraint pos_sale_lines_order_key unique (pos_sale_id, line_no),

  -- La variante appartient au service — c'est la BASE qui le dit (motif 097 §3).
  constraint pos_sale_lines_variant_belongs
    foreign key (service_variant_id, service_id)
    references public.service_variants (id, service_id)
    on delete restrict,

  constraint pos_sale_lines_label_not_blank check (btrim(label) <> ''),
  constraint pos_sale_lines_quantity_positive check (quantity > 0),
  constraint pos_sale_lines_price_positive check (unit_price > 0),

  -- 🟥 DEC-051 §d : 0 ≤ remise de ligne ≤ brut de ligne — le net n'est jamais négatif.
  constraint pos_sale_lines_discount_bounded check (
    line_discount >= 0 and line_discount <= quantity::bigint * unit_price
  )
);

comment on table public.pos_sale_lines is
  'Ligne de vente : service SALE/BOTH actif, variante active, prix RÉSOLU à la date de la vente (D16), remise fixe ≤ brut. Figée dès sa naissance.';

create index pos_sale_lines_sale_idx    on public.pos_sale_lines (pos_sale_id, line_no);
create index pos_sale_lines_service_idx on public.pos_sale_lines (service_id);
create index pos_sale_lines_variant_idx on public.pos_sale_lines (service_variant_id);


-- =============================================================================
-- 4. LES PAIEMENTS — mode, donné, encaissé, compte (D-3)
-- =============================================================================

create table public.pos_payments (
  id uuid primary key default gen_random_uuid(),

  pos_sale_id uuid not null,
  line_no     int  not null,

  /*
   * La session et le caissier, recopiés et garantis par deux clés composites.
   * Ils portent la lecture par ligne (§10, Q-12) et le montant théorique de la
   * session (LOT 27, `pos_session_expected`), sans relire la vente sous RLS.
   */
  session_id uuid not null,
  cashier_id uuid not null references public.app_users (id) on delete restrict,

  method public.payment_method not null,

  -- Plan 02 §7.5 : DONNÉ par le client, ENCAISSÉ par ADIKOM.
  tendered_amount bigint not null,
  applied_amount  bigint not null,

  -- D-3 : le compte mouvementé — celui de la caisse en espèces, un compte
  -- bancaire actif sinon. Vérifié par la garde (§7.3).
  account_id uuid not null references public.financial_accounts (id) on delete restrict,

  external_ref text,

  status public.pos_sale_status not null default 'VALIDATED',
  cancelled_at timestamptz,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  constraint pos_payments_order_key unique (pos_sale_id, line_no),

  constraint pos_payments_sale_fk
    foreign key (pos_sale_id, session_id)
    references public.pos_sales (id, session_id)
    on delete restrict,

  constraint pos_payments_session_fk
    foreign key (session_id, cashier_id)
    references public.pos_sessions (id, cashier_id)
    on delete restrict,

  -- A-9 : les cinq modes du comptoir, et eux seuls.
  constraint pos_payments_counter_method check (
    method in ('CASH', 'CHEQUE', 'MVOLA', 'HOLO', 'WAKATI')
  ),

  constraint pos_payments_tendered_positive check (tendered_amount > 0),
  constraint pos_payments_applied_positive  check (applied_amount > 0),

  -- 🟥 Plan 02 §9.4 — on n'encaisse pas plus qu'on ne reçoit.
  constraint pos_payments_applied_le_tendered check (applied_amount <= tendered_amount),

  -- 🟥 Plan 02 §9.4 — pas de monnaie rendue sur un chèque ou un transfert mobile.
  constraint pos_payments_change_only_in_cash check (method = 'CASH' or applied_amount = tendered_amount),

  constraint pos_payments_external_ref_not_blank check (external_ref is null or btrim(external_ref) <> ''),

  constraint pos_payments_cancellation_dated check (
    (status = 'VALIDATED' and cancelled_at is null) or (status = 'CANCELLED' and cancelled_at is not null)
  )
);

comment on table public.pos_payments is
  'Paiement d''une vente (Module 12 §15) : mode, montant DONNÉ, montant ENCAISSÉ (≤ donné ; égal hors espèces), compte (D-3). Produit UNE écriture POS_SALE de l''encaissé (T-2).';
comment on column public.pos_payments.applied_amount is
  'Montant ENCAISSÉ, calculé par la base. C''est lui — jamais le donné — que porte l''écriture de trésorerie.';

-- Q-8 : une seule remise d'espèces par vente — la monnaie se calcule sur elle.
create unique index pos_payments_one_cash_per_sale_idx
  on public.pos_payments (pos_sale_id) where method = 'CASH';

create index pos_payments_sale_idx    on public.pos_payments (pos_sale_id, line_no);
create index pos_payments_session_idx on public.pos_payments (session_id) where method = 'CASH';
create index pos_payments_cashier_idx on public.pos_payments (cashier_id);
create index pos_payments_account_idx on public.pos_payments (account_id);


-- =============================================================================
-- 5. LE COÛT COPIÉ — DEC-049 §e, Plan 02 §9.3
--
-- Le prix d'achat d'une ligne vendue ne vit PAS sur la ligne : il serait lu par
-- quiconque lit la vente — et par le reçu. Il vit ici, lu par
-- `catalog.services.cost.view` SEULE.
--
-- UNE TABLE UNIQUE, mais PAS POLYMORPHE : une colonne de clé étrangère par
-- document commercial. Le LOT 28 n'en pose qu'une — la ligne de vente PDV. Un
-- autre document y entrera par sa propre colonne, avec une contrainte d'origine
-- unique sur le modèle de `treasury_entries_single_origin`.
-- =============================================================================

create table public.commercial_line_costs (
  id uuid primary key default gen_random_uuid(),

  pos_sale_line_id uuid not null unique
    references public.pos_sale_lines (id) on delete restrict,

  -- La version de coût appliquée (D16), et son montant copié.
  service_cost_id uuid references public.service_variant_costs (id) on delete restrict,
  unit_cost       bigint not null,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,

  constraint commercial_line_costs_positive check (unit_cost > 0)
);

comment on table public.commercial_line_costs is
  'Coût d''achat copié d''une ligne commerciale (DEC-049 §e). Lecture : catalog.services.cost.view SEULE. Absent si le vendeur ne pouvait pas lire le coût (Module 12 Q-13) : la marge est alors inconnue, jamais nulle.';


-- =============================================================================
-- 6. LES DEUX LIENS VERS LA FACTURATION — C-2
-- =============================================================================

alter table public.customer_invoices
  add column if not exists pos_sale_id uuid
    references public.pos_sales (id) on delete restrict;

comment on column public.customer_invoices.pos_sale_id is
  'Vente au comptoir que cette facture reprend (A-11, C-2). Lien DOCUMENTAIRE : l''argent est déjà en trésorerie par les paiements PDV. Posé par `invoice_pos_sale` seule.';

-- 🟥 Une vente, une facture non annulée (C-2).
create unique index if not exists customer_invoices_one_per_pos_sale_idx
  on public.customer_invoices (pos_sale_id)
  where pos_sale_id is not null and status <> 'CANCELLED';


alter table public.customer_payments
  add column if not exists pos_payment_id uuid
    references public.pos_payments (id) on delete restrict;

comment on column public.customer_payments.pos_payment_id is
  'RÈGLEMENT ADOSSÉ (C-2) : ce règlement solde la facture avec un paiement déjà reçu au comptoir. Il ne produit JAMAIS d''écriture de trésorerie.';

-- 🟥 Un paiement PDV, un seul règlement adossé — un règlement adossé ne
-- s'annule pas (§8), l'unicité vaut donc sans exception.
create unique index if not exists customer_payments_one_per_pos_payment_idx
  on public.customer_payments (pos_payment_id)
  where pos_payment_id is not null;


-- =============================================================================
-- 7. LES GARDES DE COHÉRENCE ET DE CYCLE DE VIE
--
-- Elles passent AVANT les gardes « nées par leur fonction » (`zzz_`). La
-- restauration lève les règles de cycle de vie (`is_restoring()`), jamais les
-- règles de cohérence que portent les contraintes.
--
-- Elles LISENT sous les droits de l'appelant, et l'échec est FERMÉ : ce qui
-- n'est pas lisible n'est jamais présumé conforme.
-- =============================================================================

-- --- 7.1 La vente ---------------------------------------------------------------

create or replace function public.fn_pos_sale_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status  public.pos_session_status;
  v_seen    boolean := false;
  v_invoice text;
begin
  if public.is_restoring() then return new; end if;

  if tg_op = 'INSERT' then
    if new.status <> 'VALIDATED' then
      raise exception 'Opération refusée : une vente naît validée. Elle s''annule ensuite, avec son motif.'
        using errcode = 'check_violation';
    end if;

    -- Le jour est celui d'ADIKOM, jamais celui du serveur.
    if new.sale_date is distinct from (new.sold_at at time zone 'Indian/Comoro')::date then
      raise exception 'Opération refusée : le jour d''une vente est le jour comorien de son horodatage.'
        using errcode = 'check_violation';
    end if;

    -- 🟥 UNE VENTE EXIGE UNE SESSION OUVERTE — celle de son caissier.
    select true, s.status into v_seen, v_status
    from public.pos_sessions s where s.id = new.session_id;

    if not coalesce(v_seen, false) then
      raise exception 'La session de caisse est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;
    if v_status <> 'OPEN' then
      raise exception 'Opération refusée : cette session de caisse est close. Une vente exige une session ouverte.'
        using errcode = 'check_violation';
    end if;

    if public.current_actor() is not null and new.cashier_id <> public.current_actor() then
      raise exception 'Opération refusée : on ne vend que sur sa propre session de caisse.'
        using errcode = 'check_violation';
    end if;

    return new;
  end if;

  -- UPDATE ------------------------------------------------------------------
  if new.sale_no          is distinct from old.sale_no
     or new.session_id      is distinct from old.session_id
     or new.cashier_id      is distinct from old.cashier_id
     or new.client_id       is distinct from old.client_id
     or new.sold_at         is distinct from old.sold_at
     or new.sale_date       is distinct from old.sale_date
     or new.global_discount is distinct from old.global_discount
     or new.observation     is distinct from old.observation
     or new.created_at      is distinct from old.created_at
     or new.created_by      is distinct from old.created_by then
    raise exception 'Opération refusée : une vente ne se modifie pas. Une vente erronée s''annule (B-10).'
      using errcode = 'check_violation';
  end if;

  if old.status = 'CANCELLED' then
    if new.status <> 'CANCELLED'
       or new.cancelled_at  is distinct from old.cancelled_at
       or new.cancelled_by  is distinct from old.cancelled_by
       or new.cancel_reason is distinct from old.cancel_reason then
      raise exception 'Opération refusée : une vente annulée est figée — elle ne revient pas.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.status = 'CANCELLED' then
    /*
     * 🟥 B-10 — UNE VENTE FACTURÉE NE S'ANNULE PAS, tant que les avoirs ne sont
     * pas gérés. La facture a été remise au client.
     *
     * La lecture se fait sous les droits de l'appelant : sans le droit de voir
     * les factures, « aucune facture » serait un mensonge. Le droit est donc
     * EXIGÉ, et le refus le nomme (motif de la migration 053).
     */
    if public.current_actor() is not null
       and not public.has_permission('billing.customer_invoices.view') then
      raise exception 'Opération refusée : annuler une vente exige de pouvoir consulter les factures qui la reprennent.'
        using errcode = 'insufficient_privilege';
    end if;

    select i.invoice_no into v_invoice
    from public.customer_invoices i
    where i.pos_sale_id = new.id and i.status <> 'CANCELLED'
    limit 1;

    if v_invoice is not null then
      raise exception 'Opération refusée : cette vente est reprise par la facture %. Une vente facturée ne s''annule pas tant que les avoirs ne sont pas gérés (B-10).', v_invoice
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.fn_pos_sale_guard() is
  'Garde d''une vente : naît validée, sur la session OUVERTE de son caissier, au jour comorien ; ne se modifie pas ; ne s''annule pas facturée (B-10) ; CANCELLED est terminal.';

revoke execute on function public.fn_pos_sale_guard() from public, anon;

create trigger pos_sales_guard
  before insert or update on public.pos_sales
  for each row execute function public.fn_pos_sale_guard();


-- --- 7.2 Les lignes ---------------------------------------------------------------

create or replace function public.fn_pos_sale_line_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_sale    public.pos_sale_status;
  v_purpose public.service_purpose;
  v_sstatus public.service_status;
  v_active  boolean;
  v_pvar    uuid;
  v_pamount bigint;
  v_pactive boolean;
  v_from    date;
  v_to      date;
  v_date    date;
begin
  if public.is_restoring() then return new; end if;

  if tg_op = 'UPDATE' then
    raise exception 'Opération refusée : une ligne de vente est figée dès sa naissance. Une vente erronée s''annule.'
      using errcode = 'check_violation';
  end if;

  select s.status, s.sale_date into v_sale, v_date from public.pos_sales s where s.id = new.pos_sale_id;
  if v_sale is null then
    raise exception 'La vente est introuvable ou n''est pas lisible avec vos droits.' using errcode = 'no_data_found';
  end if;
  if v_sale <> 'VALIDATED' then
    raise exception 'Opération refusée : une vente annulée ne reçoit plus de ligne.' using errcode = 'check_violation';
  end if;

  /*
   * 🟥 UNE VENTE NE VEND QUE CE QUI EST VENDABLE (Plan 01 §16.2) : service de
   * vente (SALE ou BOTH), actif ; variante active. Lu sous RLS : échec fermé.
   */
  select sv.purpose, sv.status, v.is_active
    into v_purpose, v_sstatus, v_active
  from public.service_variants v
  join public.services sv on sv.id = v.service_id
  where v.id = new.service_variant_id and v.service_id = new.service_id;

  if v_purpose is null then
    raise exception 'La prestation vendue est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;
  if v_purpose not in ('SALE', 'BOTH') then
    raise exception 'Opération refusée : « % » n''est pas un service de vente.', new.label
      using errcode = 'check_violation';
  end if;
  if v_sstatus <> 'ACTIVE' or not v_active then
    raise exception 'Opération refusée : « % » n''est pas actif au catalogue.', new.label
      using errcode = 'check_violation';
  end if;

  -- 🟥 D16 — LE PRIX EST CELUI DE LA VERSION APPLICABLE AU JOUR DE LA VENTE.
  select p.variant_id, p.amount, p.is_active, p.valid_from, p.valid_to
    into v_pvar, v_pamount, v_pactive, v_from, v_to
  from public.service_variant_prices p where p.id = new.service_price_id;

  if v_pvar is null
     or v_pvar <> new.service_variant_id
     or not v_pactive
     or v_from > v_date
     or (v_to is not null and v_to < v_date)
     or v_pamount <> new.unit_price then
    raise exception 'Opération refusée : le prix d''une ligne est celui du catalogue au jour de la vente — jamais un montant saisi (D16).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_pos_sale_line_guard() is
  'Garde d''une ligne : service SALE/BOTH actif, variante active, prix = version applicable au jour de la vente (D16), vente validée. Figée dès sa naissance.';

revoke execute on function public.fn_pos_sale_line_guard() from public, anon;

create trigger pos_sale_lines_guard
  before insert or update on public.pos_sale_lines
  for each row execute function public.fn_pos_sale_line_guard();


-- --- 7.3 Les paiements — 🟥 D-3 ---------------------------------------------------

create or replace function public.fn_pos_payment_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_sale     public.pos_sale_status;
  v_register uuid;
  v_seen     boolean := false;
  v_kind     public.financial_account_kind;
  v_status   public.financial_account_status;
  v_currency text;
  v_label    text;
begin
  if public.is_restoring() then return new; end if;

  select s.status into v_sale from public.pos_sales s where s.id = new.pos_sale_id;
  if v_sale is null then
    raise exception 'La vente est introuvable ou n''est pas lisible avec vos droits.' using errcode = 'no_data_found';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'VALIDATED' then
      raise exception 'Opération refusée : un paiement naît validé.' using errcode = 'check_violation';
    end if;
    if v_sale <> 'VALIDATED' then
      raise exception 'Opération refusée : une vente annulée ne reçoit plus de paiement.' using errcode = 'check_violation';
    end if;

    -- Le compte, lu sous les droits de l'appelant ; invisible = refus.
    select true, a.kind, a.status, a.currency_code, a.label
      into v_seen, v_kind, v_status, v_currency, v_label
    from public.financial_accounts a where a.id = new.account_id;

    if not coalesce(v_seen, false) then
      raise exception 'Le compte du paiement est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;
    if v_status <> 'ACTIVE' then
      raise exception 'Opération refusée : le compte « % » n''est pas actif (Module 06 §10).', v_label
        using errcode = 'check_violation';
    end if;
    if v_currency is distinct from 'KMF' then
      raise exception 'Opération refusée : une vente au comptoir s''encaisse en KMF ; le compte « % » est en %.', v_label, v_currency
        using errcode = 'check_violation';
    end if;

    if new.method = 'CASH' then
      /*
       * 🟥 D-3 — LES ESPÈCES ENTRENT DANS LE COMPTE DE LA CAISSE, ET LUI SEUL.
       *
       * La caisse ne change pas de compte pendant une session ouverte (LOT 27,
       * Q-3), et une vente exige une session ouverte : le compte lu ici est
       * donc celui de toute la session.
       */
      select r.id into v_register
      from public.pos_sessions s
      join public.pos_registers r on r.id = s.register_id
      where s.id = new.session_id;

      if v_register is null then
        raise exception 'La caisse de la session est introuvable ou n''est pas lisible avec vos droits.'
          using errcode = 'no_data_found';
      end if;

      if not exists (
        select 1 from public.pos_sessions s
        join public.pos_registers r on r.id = s.register_id
        where s.id = new.session_id and r.account_id = new.account_id
      ) then
        raise exception 'Opération refusée : les espèces entrent dans le compte de la caisse, et dans aucun autre (D-3).'
          using errcode = 'check_violation';
      end if;
    else
      /*
       * 🟥 D-3 — CHÈQUE, MVOLA, HOLO, WAKATI : un compte BANCAIRE actif (Q-7).
       * Un compte de caisse ferait mentir l'écart de la session.
       */
      if v_kind <> 'BANK' then
        raise exception 'Opération refusée : un paiement hors espèces entre sur un compte bancaire déclaré (Mvola, Holo, Wakati, banque), jamais dans une caisse (D-3).'
          using errcode = 'check_violation';
      end if;
    end if;

    return new;
  end if;

  -- UPDATE : seul l'état change, et seulement pour suivre l'annulation de la vente.
  if new.pos_sale_id     is distinct from old.pos_sale_id
     or new.line_no         is distinct from old.line_no
     or new.session_id      is distinct from old.session_id
     or new.cashier_id      is distinct from old.cashier_id
     or new.method          is distinct from old.method
     or new.tendered_amount is distinct from old.tendered_amount
     or new.applied_amount  is distinct from old.applied_amount
     or new.account_id      is distinct from old.account_id
     or new.external_ref    is distinct from old.external_ref
     or new.created_at      is distinct from old.created_at
     or new.created_by      is distinct from old.created_by then
    raise exception 'Opération refusée : un paiement ne se modifie pas. Une vente erronée s''annule.'
      using errcode = 'check_violation';
  end if;

  if old.status = 'CANCELLED' and new.status <> 'CANCELLED' then
    raise exception 'Opération refusée : un paiement annulé ne revient pas.' using errcode = 'check_violation';
  end if;

  if old.status = 'VALIDATED' and new.status = 'CANCELLED' and v_sale <> 'CANCELLED' then
    raise exception 'Opération refusée : un paiement s''annule avec sa vente, jamais seul.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_pos_payment_guard() is
  'Garde d''un paiement (D-3) : espèces → compte de la caisse de la session ; autres modes → compte BANK ; compte actif, en KMF ; immuable ; ne s''annule qu''avec sa vente.';

revoke execute on function public.fn_pos_payment_guard() from public, anon;

create trigger pos_payments_guard
  before insert or update on public.pos_payments
  for each row execute function public.fn_pos_payment_guard();


-- --- 7.4 Le coût copié ---------------------------------------------------------

create or replace function public.fn_commercial_line_cost_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_restoring() then return new; end if;

  if tg_op = 'UPDATE' then
    raise exception 'Opération refusée : un coût copié est figé — c''est le coût du jour de la vente.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_commercial_line_cost_guard() from public, anon;

create trigger commercial_line_costs_guard
  before insert or update on public.commercial_line_costs
  for each row execute function public.fn_commercial_line_cost_guard();


-- --- 7.5 🟥 La facture d'une vente — le lien documentaire ---------------------

create or replace function public.fn_customer_invoice_pos_sale_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status public.pos_sale_status;
  v_client uuid;
begin
  if public.is_restoring() then return new; end if;

  if tg_op = 'INSERT' then
    -- `create_customer_invoice` ne connaît pas ce lien : il se pose ENSUITE,
    -- par `invoice_pos_sale`, et par elle seule.
    if new.pos_sale_id is not null then
      raise exception 'Opération refusée : une facture se rattache à une vente par la fonction de facturation du point de vente, jamais à sa création directe.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.pos_sale_id is distinct from old.pos_sale_id then
    if old.pos_sale_id is not null then
      raise exception 'Opération refusée : la vente d''une facture ne change pas.' using errcode = 'check_violation';
    end if;

    if coalesce(current_setting('adikom.pos_invoice_link', true), 'off') <> 'on' then
      raise exception 'Opération refusée : une facture se rattache à une vente par la fonction prévue, jamais par écriture directe.'
        using errcode = '42501';
    end if;

    if old.status <> 'DRAFT' then
      raise exception 'Opération refusée : seule une facture en brouillon se rattache à une vente.' using errcode = 'check_violation';
    end if;

    -- Une seule origine : ni location, ni période, ni commande.
    if new.rental_id is not null or new.billing_period_id is not null or new.sales_order_id is not null then
      raise exception 'Opération refusée : une facture de vente au comptoir ne facture ni location ni commande. Le montant serait compté deux fois.'
        using errcode = 'check_violation';
    end if;

    select s.status, s.client_id into v_status, v_client from public.pos_sales s where s.id = new.pos_sale_id;
    if v_status is null then
      raise exception 'La vente est introuvable ou n''est pas lisible avec vos droits.' using errcode = 'no_data_found';
    end if;
    if v_status <> 'VALIDATED' then
      raise exception 'Opération refusée : une vente annulée ne se facture pas.' using errcode = 'check_violation';
    end if;
    if v_client is distinct from new.client_id then
      raise exception 'Opération refusée : le client de la facture est celui de la vente. La chaîne Facture → Vente → Client ne se rompt pas.'
        using errcode = 'check_violation';
    end if;
  end if;

  /*
   * 🟥 Q-11 — LA FACTURE D'UNE VENTE NE S'ANNULE PAS, tant que les avoirs ne
   * sont pas gérés : symétrique de B-10. L'annuler rouvrirait une vente
   * facturée — annulable, refacturable — alors que le document a été remis.
   */
  if old.pos_sale_id is not null and new.status = 'CANCELLED' and old.status <> 'CANCELLED' then
    raise exception 'Opération refusée : cette facture reprend une vente au comptoir. Elle ne s''annule pas tant que les avoirs ne sont pas gérés (B-10).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_customer_invoice_pos_sale_guard() is
  'Lien facture → vente (C-2) : posé par invoice_pos_sale seule, sur un brouillon, pour une vente validée du même client, sans autre origine ; immuable ; la facture d''une vente ne s''annule pas (Q-11).';

revoke execute on function public.fn_customer_invoice_pos_sale_guard() from public, anon;

create trigger customer_invoices_pos_sale_guard
  before insert or update on public.customer_invoices
  for each row execute function public.fn_customer_invoice_pos_sale_guard();


-- --- 7.6 🟥 Le règlement adossé — C-2 -------------------------------------------
--
-- Il protège contre les trois risques nommés par la Direction :
--   · PAIEMENT FICTIF — il ne naît que pour un paiement PDV réel, validé, d'une
--     vente validée, du MÊME montant, compte et mode ;
--   · DOUBLE RATTACHEMENT — un paiement, un règlement (index) ; facture et
--     paiement de la MÊME vente ;
--   · INCOHÉRENCE D'ANNULATION — il ne s'annule pas seul.

create or replace function public.fn_customer_payment_pos_backed_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  pp        public.pos_payments%rowtype;
  v_sale    public.pos_sale_status;
  v_date    date;
  v_inv_sale uuid;
  v_inv_st  public.customer_invoice_status;
begin
  if public.is_restoring() then return new; end if;

  if tg_op = 'UPDATE' then
    if new.pos_payment_id is distinct from old.pos_payment_id then
      raise exception 'Opération refusée : le paiement PDV d''un règlement ne change pas.' using errcode = 'check_violation';
    end if;

    if old.pos_payment_id is not null and new.status = 'CANCELLED' and old.status <> 'CANCELLED' then
      raise exception 'Opération refusée : ce règlement est adossé à un paiement reçu au comptoir. Il n''a pas d''écriture propre et ne s''annule pas seul — l''annuler rouvrirait une dette déjà payée (C-2).'
        using errcode = 'check_violation';
    end if;

    return new;
  end if;

  -- INSERT ------------------------------------------------------------------
  if new.pos_payment_id is null then
    return new;
  end if;

  if coalesce(current_setting('adikom.pos_backed_payment', true), 'off') <> 'on' then
    raise exception 'Opération refusée : un règlement adossé naît par la fonction de facturation du point de vente, jamais par écriture directe.'
      using errcode = '42501';
  end if;

  select * into pp from public.pos_payments where id = new.pos_payment_id;
  if not found then
    raise exception 'Le paiement PDV est introuvable ou n''est pas lisible avec vos droits.' using errcode = 'no_data_found';
  end if;

  select s.status, s.sale_date into v_sale, v_date from public.pos_sales s where s.id = pp.pos_sale_id;
  if v_sale is null then
    raise exception 'La vente du paiement est introuvable ou n''est pas lisible avec vos droits.' using errcode = 'no_data_found';
  end if;

  -- 🟥 PAIEMENT FICTIF.
  if pp.status <> 'VALIDATED' or v_sale <> 'VALIDATED' then
    raise exception 'Opération refusée : un règlement adossé exige un paiement et une vente validés.' using errcode = 'check_violation';
  end if;

  if new.amount is distinct from pp.applied_amount
     or new.account_id is distinct from pp.account_id
     or new.method is distinct from pp.method
     or new.received_on is distinct from v_date then
    raise exception 'Opération refusée : un règlement adossé reprend le montant ENCAISSÉ, le compte, le mode et le jour du paiement PDV — rien d''autre (C-2).'
      using errcode = 'check_violation';
  end if;

  -- 🟥 DOUBLE RATTACHEMENT — la facture reprend la vente de CE paiement.
  select i.pos_sale_id, i.status into v_inv_sale, v_inv_st
  from public.customer_invoices i where i.id = new.customer_invoice_id;

  if v_inv_st is null then
    raise exception 'La facture est introuvable ou n''est pas lisible avec vos droits.' using errcode = 'no_data_found';
  end if;
  if v_inv_sale is distinct from pp.pos_sale_id then
    raise exception 'Opération refusée : la facture et le paiement adossé appartiennent à la même vente, ou le rattachement est refusé (C-2).'
      using errcode = 'check_violation';
  end if;
  if v_inv_st <> 'ISSUED' then
    raise exception 'Opération refusée : seule une facture émise reçoit un règlement.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_customer_payment_pos_backed_guard() is
  'Règlement adossé (C-2) : né par sa fonction, pour un paiement PDV et une vente validés, du même montant encaissé, compte, mode et jour, sur la facture de la même vente ; immuable ; ne s''annule pas seul.';

revoke execute on function public.fn_customer_payment_pos_backed_guard() from public, anon;

create trigger customer_payments_pos_backed_guard
  before insert or update on public.customer_payments
  for each row execute function public.fn_customer_payment_pos_backed_guard();


-- =============================================================================
-- 8. NÉES — ET MODIFIÉES — PAR LEURS FONCTIONS (Rapport 20 §3)
--
-- Un drapeau, `adikom.pos_sale`, posé par `record_pos_sale` autour de ses
-- insertions et par `cancel_pos_sale` autour de ses annulations ; refermé
-- aussitôt. 🟥 EN DERNIER (`zzz_`) sur chaque table.
-- =============================================================================

create or replace function public.fn_pos_sale_born_by_function()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_restoring() then return new; end if;

  if coalesce(current_setting('adikom.pos_sale', true), 'off') <> 'on' then
    raise exception 'Opération refusée : une vente, ses lignes et ses paiements s''enregistrent et s''annulent par les fonctions prévues, jamais par écriture directe. Sans elles, le prix, la monnaie et l''écriture de trésorerie seraient contournés.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.fn_pos_sale_born_by_function() is
  'Une vente, ses lignes, ses paiements et ses coûts copiés naissent par record_pos_sale et s''annulent par cancel_pos_sale — ou par une restauration. Jamais par écriture directe.';

revoke execute on function public.fn_pos_sale_born_by_function() from public, anon;

create trigger pos_sales_zzz_born_by_function
  before insert or update on public.pos_sales
  for each row execute function public.fn_pos_sale_born_by_function();
create trigger pos_sale_lines_zzz_born_by_function
  before insert or update on public.pos_sale_lines
  for each row execute function public.fn_pos_sale_born_by_function();
create trigger pos_payments_zzz_born_by_function
  before insert or update on public.pos_payments
  for each row execute function public.fn_pos_sale_born_by_function();
create trigger commercial_line_costs_zzz_born_by_function
  before insert or update on public.commercial_line_costs
  for each row execute function public.fn_pos_sale_born_by_function();


-- =============================================================================
-- 9. 🟥 LA VENTE EST COHÉRENTE QUAND TOUT EST ÉCRIT — contrôle différé
--
-- Vérifié à la fin de la transaction (motif des migrations 063 et 108) :
--   · une vente validée porte AU MOINS une ligne ;
--   · DEC-051 §d : 0 ≤ remise globale ≤ sous-total — le net n'est jamais négatif ;
--   · Σ encaissé ≤ net : on n'encaisse jamais au-delà du dû ;
--   · 🟥 P-4 : Σ encaissé < net ⇒ un client ET une facture non annulée, qui
--     suit le solde. Une créance sans débiteur n'existe pas.
--
-- Lit sous les droits de l'appelant ; les actes exigent `pos.sales.view`, et la
-- vente non soldée les capacités de facturation. Invisible = refus.
-- =============================================================================

create or replace function public.fn_pos_sale_consistent()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  s          public.pos_sales%rowtype;
  v_lines    int;
  v_subtotal bigint;
  v_paid     bigint;
  v_net      bigint;
begin
  if public.is_restoring() then return null; end if;

  select * into s from public.pos_sales where id = new.id;
  if not found then
    raise exception 'Opération refusée : la vente n''est pas lisible, et sa cohérence ne peut donc pas être vérifiée.'
      using errcode = 'insufficient_privilege';
  end if;

  if s.status <> 'VALIDATED' then
    return null;
  end if;

  select count(*), coalesce(sum(l.quantity::bigint * l.unit_price - l.line_discount), 0)
    into v_lines, v_subtotal
  from public.pos_sale_lines l where l.pos_sale_id = s.id;

  if v_lines = 0 then
    raise exception 'Opération refusée : une vente porte au moins une ligne.' using errcode = 'check_violation';
  end if;

  if s.global_discount > v_subtotal then
    raise exception 'Opération refusée : la remise globale (% KMF) dépasse le sous-total après remises de ligne (% KMF). Le total ne devient jamais négatif (DEC-051 §d).',
      s.global_discount, v_subtotal
      using errcode = 'check_violation';
  end if;

  v_net := v_subtotal - s.global_discount;

  select coalesce(sum(p.applied_amount), 0) into v_paid
  from public.pos_payments p where p.pos_sale_id = s.id and p.status = 'VALIDATED';

  if v_paid > v_net then
    raise exception 'Opération refusée : l''encaissé (% KMF) dépasse le net à payer (% KMF). La trésorerie enregistre l''encaissé, jamais le donné.',
      v_paid, v_net
      using errcode = 'check_violation';
  end if;

  if v_paid < v_net then
    if s.client_id is null then
      raise exception 'Opération refusée : une vente non soldée exige un client enregistré (P-4). Une créance sans débiteur ne se suit pas.'
        using errcode = 'check_violation';
    end if;

    if not exists (
      select 1 from public.customer_invoices i
      where i.pos_sale_id = s.id and i.status = 'ISSUED'
    ) then
      raise exception 'Opération refusée : une vente non soldée porte sa facture émise, qui suit le solde (P-4).'
        using errcode = 'check_violation';
    end if;
  end if;

  return null;
end;
$$;

comment on function public.fn_pos_sale_consistent() is
  'Contrôle différé d''une vente validée : au moins une ligne ; remise globale ≤ sous-total ; encaissé ≤ net ; non soldée ⇒ client ET facture émise (P-4).';

revoke execute on function public.fn_pos_sale_consistent() from public, anon;

create constraint trigger pos_sales_consistent
  after insert on public.pos_sales
  deferrable initially deferred
  for each row execute function public.fn_pos_sale_consistent();


-- =============================================================================
-- 10. HORODATAGE, SUPPRESSION, JOURNAL
-- =============================================================================

create trigger pos_sales_set_updated_at
  before update on public.pos_sales
  for each row execute function public.fn_set_updated_at();
create trigger pos_payments_set_updated_at
  before update on public.pos_payments
  for each row execute function public.fn_set_updated_at();

-- D6 : une vente s'annule — rien ne s'efface.
create trigger pos_sales_no_delete
  before delete on public.pos_sales
  for each row execute function public.fn_forbid_delete();
create trigger pos_sale_lines_no_delete
  before delete on public.pos_sale_lines
  for each row execute function public.fn_forbid_delete();
create trigger pos_payments_no_delete
  before delete on public.pos_payments
  for each row execute function public.fn_forbid_delete();
create trigger commercial_line_costs_no_delete
  before delete on public.commercial_line_costs
  for each row execute function public.fn_forbid_delete();

/*
 * LE JOURNAL — Plan 02 §12 : vente `CREATE`, annulation `CANCEL`.
 *
 * `fn_audit_row` qualifierait l'annulation de `STATUS_CHANGE`. Le Plan 02 la
 * nomme `CANCEL`. Le paiement porte dans son avant/après le MODE et le COMPTE
 * (D-3 : « visibles dans le journal »).
 */
create or replace function public.fn_audit_pos_sale_row()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_action public.audit_action;
  v_before jsonb;
  v_after  jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := 'CREATE';
    v_after  := to_jsonb(new);
  else
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);

    if (v_before - 'updated_at' - 'updated_by') = (v_after - 'updated_at' - 'updated_by') then
      return new;
    end if;

    if (v_before ->> 'status') = 'VALIDATED' and (v_after ->> 'status') = 'CANCELLED' then
      v_action := 'CANCEL';
    else
      v_action := 'UPDATE';
    end if;
  end if;

  perform public.log_audit(
    p_action      => v_action,
    p_entity_type => tg_table_name,
    p_entity_id   => v_after ->> 'id',
    p_module_code => 'pos',
    p_before      => v_before,
    p_after       => v_after
  );

  return new;
end;
$$;

comment on function public.fn_audit_pos_sale_row() is
  'Journal des ventes et paiements : naissance CREATE, annulation CANCEL (Plan 02 §12). Le paiement y porte son mode et son compte (D-3).';

revoke execute on function public.fn_audit_pos_sale_row() from public, anon;

create trigger pos_sales_audit
  after insert or update on public.pos_sales
  for each row execute function public.fn_audit_pos_sale_row();
create trigger pos_payments_audit
  after insert or update on public.pos_payments
  for each row execute function public.fn_audit_pos_sale_row();
create trigger pos_sale_lines_audit
  after insert on public.pos_sale_lines
  for each row execute function public.fn_audit_row('pos');
create trigger commercial_line_costs_audit
  after insert on public.commercial_line_costs
  for each row execute function public.fn_audit_row('pos');


-- =============================================================================
-- 11. RLS — patron du Plan 02 §8.2, `has_permission` en SOUS-SELECT
-- =============================================================================

revoke all on public.pos_sales             from anon;
revoke all on public.pos_sale_lines        from anon;
revoke all on public.pos_payments          from anon;
revoke all on public.commercial_line_costs from anon;

revoke delete, truncate on public.pos_sales             from authenticated;
revoke delete, truncate on public.pos_sale_lines        from authenticated;
revoke delete, truncate on public.pos_payments          from authenticated;
revoke delete, truncate on public.commercial_line_costs from authenticated;

alter table public.pos_sales             enable row level security;
alter table public.pos_sale_lines        enable row level security;
alter table public.pos_payments          enable row level security;
alter table public.commercial_line_costs enable row level security;


-- --- Ventes --------------------------------------------------------------------

create policy pos_sales_select on public.pos_sales
  for select to authenticated
  using ((select public.has_permission('pos.sales.view')));

-- On ne vend qu'à son propre nom.
create policy pos_sales_insert on public.pos_sales
  for insert to authenticated
  with check (
    (select public.has_permission('pos.sales.create'))
    and cashier_id = (select public.current_actor())
  );

create policy pos_sales_update on public.pos_sales
  for update to authenticated
  using ((select public.has_permission('pos.sales.cancel')))
  with check ((select public.has_permission('pos.sales.cancel')));


-- --- Lignes — aucune modification : pas de policy d'UPDATE ----------------------

create policy pos_sale_lines_select on public.pos_sale_lines
  for select to authenticated
  using ((select public.has_permission('pos.sales.view')));

create policy pos_sale_lines_insert on public.pos_sale_lines
  for insert to authenticated
  with check ((select public.has_permission('pos.sales.create')));


-- --- 🟥 Paiements — Q-12 ----------------------------------------------------------
--
-- Qui lit les montants d'une session (LOT 27, B-13 : `pos.sessions.amounts.view`
-- OU caissier de la ligne) lit aussi les paiements qui les composent. Sans quoi
-- `pos_session_expected` compterait pour lui un théorique FAUX — le fond de
-- caisse sans les espèces encaissées — et l'écart mentirait en silence.

create policy pos_payments_select on public.pos_payments
  for select to authenticated
  using (
    (select public.has_permission('pos.sales.view'))
    or (select public.has_permission('pos.sessions.amounts.view'))
    or cashier_id = (select public.current_actor())
  );

create policy pos_payments_insert on public.pos_payments
  for insert to authenticated
  with check (
    (select public.has_permission('pos.sales.create'))
    and cashier_id = (select public.current_actor())
  );

create policy pos_payments_update on public.pos_payments
  for update to authenticated
  using ((select public.has_permission('pos.sales.cancel')))
  with check ((select public.has_permission('pos.sales.cancel')));


-- --- Coûts copiés — DEC-049 §e : leur PROPRE lecture ------------------------------

create policy commercial_line_costs_select on public.commercial_line_costs
  for select to authenticated
  using ((select public.has_permission('catalog.services.cost.view')));

create policy commercial_line_costs_insert on public.commercial_line_costs
  for insert to authenticated
  with check (
    (select public.has_permission('pos.sales.create'))
    and (select public.has_permission('catalog.services.cost.view'))
  );


-- =============================================================================
-- 12. LE JOURNAL N'OUVRE PAS CE QUE LA TABLE FERME — DEC-038
--
-- Reprise ENTIÈRE de la DERNIÈRE VERSION ACTIVE (migration 108,
-- `20261008000100_caisses_et_sessions_de_caisse.sql`), à laquelle s'ajoutent
-- les quatre tables du lot. 🟥 Le coût copié garde SA lecture jusque dans le
-- journal : `catalog.services.cost.view`, jamais `pos.sales.view`.
-- =============================================================================

create or replace function public.audit_detail_permission(p_entity_type text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_entity_type
    -- --- Utilisateurs & Groupes ----------------------------------------------
    when 'app_users'                      then 'users.users.view'
    when 'user_groups'                    then 'users.users.view'
    when 'user_departments'               then 'users.users.view'
    when 'groups'                         then 'users.groups.view'
    when 'group_permissions'              then 'users.groups.view'
    when 'user_permissions'               then 'users.users.permissions.view'

    -- --- Tiers ---------------------------------------------------------------
    when 'clients'                        then 'parties.clients.view'
    when 'suppliers'                      then 'parties.suppliers.view'
    when 'partners'                       then 'parties.partners.view'
    when 'supplier_bank_details'          then 'parties.suppliers.bank.view'
    when 'supplier_payment_details'       then 'parties.suppliers.bank.view'

    -- --- Gestion de location -------------------------------------------------
    when 'vehicles'                       then 'rental.fleet.view'
    when 'vehicle_supplier_history'       then 'rental.fleet.view'
    when 'vehicle_occupations'            then 'rental.fleet.view'
    when 'vehicle_categories'             then 'rental.categories.view'
    when 'vehicle_documents'              then 'rental.documents.view'
    when 'pricing_rules'                  then 'rental.pricing.view'
    when 'supplier_vehicle_rates'         then 'rental.pricing.supplier.view'
    when 'reservations'                   then 'rental.reservations.view'
    when 'rentals'                        then 'rental.rentals.view'
    when 'rental_inspections'             then 'rental.rentals.view'
    when 'rental_inspection_photos'       then 'rental.rentals.view'
    -- LOT 22 : l'acte et ses effets se lisent avec le contrat…
    when 'rental_amendments'              then 'rental.rentals.view'
    when 'rental_segments'                then 'rental.rentals.view'
    -- … le COÛT GELÉ, lui, garde SA lecture jusque dans le journal (A-2).
    when 'rental_segment_costs'           then 'rental.pricing.supplier.view'
    -- LOT 23 : le découpage de la créance, sans aucun montant.
    when 'rental_billing_periods'         then 'rental.rentals.view'
    when 'vehicle_incidents'              then 'rental.incidents.view'
    when 'incident_damages'               then 'rental.incidents.view'
    when 'incident_photos'                then 'rental.incidents.view'
    when 'vehicle_maintenances'           then 'rental.maintenance.view'
    when 'maintenance_documents'          then 'rental.maintenance.view'
    when 'maintenance_quotes'             then 'rental.maintenance.view'
    when 'maintenance_costs'              then 'rental.maintenance.cost.view'
    when 'maintenance_cost_lines'         then 'rental.maintenance.cost.view'

    -- --- Produits & Services — LOT 20 ----------------------------------------
    when 'service_categories'             then 'catalog.categories.view'
    when 'services'                       then 'catalog.services.view'
    when 'service_variants'               then 'catalog.services.view'
    when 'service_variant_prices'         then 'catalog.services.view'
    when 'service_variant_costs'          then 'catalog.services.cost.view'

    -- --- Commerce client — LOT 25 --------------------------------------------
    when 'sales_quotes'                   then 'commerce.sales_quotes.view'
    when 'sales_quote_lines'              then 'commerce.sales_quotes.view'
    when 'sales_orders'                   then 'commerce.sales_orders.view'
    when 'sales_order_lines'              then 'commerce.sales_orders.view'

    -- --- Commerce fournisseur — LOT 26 ---------------------------------------
    when 'purchase_quotes'                then 'commerce.purchase_quotes.view'
    when 'purchase_quote_lines'           then 'commerce.purchase_quotes.view'
    when 'purchase_orders'                then 'commerce.purchase_orders.view'
    when 'purchase_order_lines'           then 'commerce.purchase_orders.view'

    -- --- Point de vente — LOT 27 ---------------------------------------------
    when 'pos_registers'                  then 'pos.registers.view'
    when 'pos_sessions'                   then 'pos.sessions.view'
    when 'pos_session_amounts'            then 'pos.sessions.amounts.view'

    -- --- Point de vente — LOT 28 ---------------------------------------------
    -- La vente, ses lignes et ses paiements se lisent avec la vente ; le COÛT
    -- COPIÉ garde SA lecture (DEC-049 §e).
    when 'pos_sales'                      then 'pos.sales.view'
    when 'pos_sale_lines'                 then 'pos.sales.view'
    when 'pos_payments'                   then 'pos.sales.view'
    when 'commercial_line_costs'          then 'catalog.services.cost.view'

    -- --- Facturation & Paiement ----------------------------------------------
    when 'customer_invoices'              then 'billing.customer_invoices.view'
    when 'customer_invoice_lines'         then 'billing.customer_invoices.view'
    when 'customer_payments'              then 'billing.customer_payments.view'
    when 'supplier_invoices'              then 'billing.supplier_invoices.view'
    when 'supplier_invoice_lines'         then 'billing.supplier_invoices.view'
    when 'supplier_payments'              then 'billing.supplier_payments.view'
    when 'imputations'                    then 'billing.imputations.view'
    when 'imputation_documents'           then 'billing.imputations.view'
    when 'misc_payments'                  then 'billing.misc_payments.view'

    -- --- Banques & Caisses ---------------------------------------------------
    when 'financial_accounts'             then 'treasury.accounts.view'
    when 'treasury_entries'               then 'treasury.entries.view'
    when 'internal_transfers'             then 'treasury.transfers.view'

    -- --- Projets & Planification ---------------------------------------------
    when 'projects'                       then 'projects.view'
    when 'project_members'                then 'projects.view'
    when 'project_tasks'                  then 'projects.tasks.view'
    when 'project_meetings'               then 'projects.meetings.view'
    when 'project_meeting_participants'   then 'projects.meetings.view'
    when 'project_appointments'           then 'projects.appointments.view'
    when 'project_appointment_participants' then 'projects.appointments.view'
    when 'project_decisions'              then 'projects.decisions.view'
    when 'project_actions'                then 'projects.actions.view'

    -- --- Paramètres ----------------------------------------------------------
    when 'company_settings'               then 'settings.company.view'
    when 'numbering_rules'                then 'settings.numbering.view'

    else null
  end;
$$;

comment on function public.audit_detail_permission(text) is
  'Capacité exigée pour lire le détail avant/après d''un événement (DEC-038). NULL = Super Admin uniquement.';


-- =============================================================================
-- 13. CONTRÔLES
-- =============================================================================

do $$
declare
  v_table text;
  v_n     int;
  v_fn    text;
begin
  foreach v_table in array array['pos_sales', 'pos_sale_lines', 'pos_payments', 'commercial_line_costs'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_table)::regclass) then
      raise exception 'RLS non activée sur %.', v_table;
    end if;
    if has_table_privilege('anon', 'public.' || v_table, 'SELECT') then
      raise exception 'La table % est lisible par anon.', v_table;
    end if;
    if has_table_privilege('authenticated', 'public.' || v_table, 'DELETE')
       or has_table_privilege('authenticated', 'public.' || v_table, 'TRUNCATE') then
      raise exception 'DELETE ou TRUNCATE encore accordé à authenticated sur %.', v_table;
    end if;

    select count(*) into v_n
    from pg_trigger
    where tgrelid = ('public.' || v_table)::regclass
      and not tgisinternal
      and tgname > (v_table || '_zzz_born_by_function');
    if v_n > 0 or not exists (
      select 1 from pg_trigger
      where tgrelid = ('public.' || v_table)::regclass
        and tgname = v_table || '_zzz_born_by_function'
    ) then
      raise exception 'La garde « née par sa fonction » de % est absente ou n''est pas la dernière.', v_table;
    end if;
  end loop;

  -- Les gardes « nées par leur fonction » des tables de facturation restent
  -- les DERNIÈRES (S-1) malgré les gardes ajoutées ici.
  foreach v_table in array array['customer_invoices', 'customer_payments'] loop
    select count(*) into v_n
    from pg_trigger
    where tgrelid = ('public.' || v_table)::regclass
      and not tgisinternal
      and tgname > (v_table || '_zzz_born_by_function');
    if v_n > 0 then
      raise exception 'La garde S-1 de % n''est plus la dernière.', v_table;
    end if;
  end loop;

  -- Plan 02 §9.4 — les deux contraintes de la monnaie.
  if not exists (select 1 from pg_constraint where conname = 'pos_payments_applied_le_tendered')
     or not exists (select 1 from pg_constraint where conname = 'pos_payments_change_only_in_cash') then
    raise exception 'Une contrainte de la règle de la monnaie est absente (Plan 02 §9.4).';
  end if;

  -- D1 : aucun total stocké.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name in ('pos_sales', 'pos_sale_lines', 'pos_payments')
      and (column_name like '%total%' or column_name like '%change%' or column_name like '%net%'
        or column_name like '%paid%' or column_name like '%cost%' or column_name like '%margin%')
  ) then
    raise exception 'Un total, une monnaie, un coût ou une marge est stocké sur une table de vente (D1, DEC-049 §e).';
  end if;

  -- DEC-055 §b : aucune `pos_sales.customer_invoice_id`.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'pos_sales' and column_name like '%invoice%') then
    raise exception 'Un lien vers la facture figure sur pos_sales : DEC-055 §b l''exclut.';
  end if;

  -- D4.
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and p.proname in ('fn_pos_sale_guard', 'fn_pos_sale_line_guard', 'fn_pos_payment_guard',
                      'fn_commercial_line_cost_guard', 'fn_customer_invoice_pos_sale_guard',
                      'fn_customer_payment_pos_backed_guard', 'fn_pos_sale_born_by_function',
                      'fn_pos_sale_consistent', 'fn_audit_pos_sale_row');
  if v_n > 0 then
    raise exception '% fonction(s) du lot sont SECURITY DEFINER (D4).', v_n;
  end if;

  -- Le journal : les acquis demeurent, les quatre tables s'y ajoutent.
  foreach v_fn in array array[
    'supplier_vehicle_rates', 'rental_segment_costs', 'service_variant_costs',
    'sales_quotes', 'purchase_order_lines', 'customer_invoices', 'maintenance_costs',
    'numbering_rules', 'pos_registers', 'pos_sessions', 'pos_session_amounts'
  ] loop
    if public.audit_detail_permission(v_fn) is null then
      raise exception 'Le journal s''est refermé sur « % ».', v_fn;
    end if;
  end loop;

  if public.audit_detail_permission('pos_sales') <> 'pos.sales.view'
     or public.audit_detail_permission('pos_payments') <> 'pos.sales.view'
     or public.audit_detail_permission('pos_sale_lines') <> 'pos.sales.view'
     or public.audit_detail_permission('commercial_line_costs') <> 'catalog.services.cost.view' then
    raise exception 'Les ventes ne sont pas correctement rattachées au journal.';
  end if;

  raise notice '[OK] 116. Ventes, lignes, paiements, coûts copiés ; liens facture et règlement adossé gardés ; nés par leurs fonctions.';
end $$;
