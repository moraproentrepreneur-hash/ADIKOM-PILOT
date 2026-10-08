-- =============================================================================
-- ADIKOM PILOT — 121 · Facturer une vente anonyme en lui rattachant un client
-- LOT 28 — décision Q-10 de la Direction (8 octobre 2026), DEC-055
--
-- Une vente encaissée sans client peut être facturée plus tard : le client
-- enregistré se rattache AU MOMENT de la facture, une seule fois, contrôlé et
-- journalisé ; la facture passe par la chaîne existante ; aucun montant ne
-- bouge ; aucune écriture de trésorerie n'est produite (C-2 inchangé).
--
--   fn_pos_sale_guard   reprise ENTIÈRE de sa dernière version (migration 116) :
--                       client_id sort des colonnes immuables au profit d'une
--                       règle propre — NULL → client, une fois, sous drapeau
--   invoice_pos_sale    reprise de sa dernière version (118), + p_client_id
--   pos_sales_update    reprise de sa dernière version (116), + la facturation
--                       d'une vente encore anonyme (la garde ferme le reste)
--
-- Aucune table, aucune colonne, aucune capacité : catalogue 246, sauvegarde 69.
-- 🟥 AUCUNE FONCTION `SECURITY DEFINER`.
-- =============================================================================

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
  /*
   * Q-10 (Direction, 8 octobre 2026) — UNE VENTE ANONYME REÇOIT SON CLIENT À SA
   * FACTURATION, UNE SEULE FOIS : de NULL vers un client, jamais d'un client à
   * un autre, jamais retiré, sur une vente VALIDÉE, et par `invoice_pos_sale`
   * seule (drapeau `adikom.pos_client_attach`). Rien d'autre ne bouge : les
   * colonnes ci-dessous restent immuables, les montants ne sont pas stockés.
   */
  if new.client_id is distinct from old.client_id then
    if old.client_id is not null or new.client_id is null
       or coalesce(current_setting('adikom.pos_client_attach', true), 'off') <> 'on' then
      raise exception 'Opération refusée : le client d''une vente ne se change pas. Une vente anonyme reçoit son client une seule fois, lors de sa facturation.'
        using errcode = 'check_violation';
    end if;
    if old.status <> 'VALIDATED' or new.status <> 'VALIDATED' then
      raise exception 'Opération refusée : une vente annulée ne reçoit pas de client.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.sale_no          is distinct from old.sale_no
     or new.session_id      is distinct from old.session_id
     or new.cashier_id      is distinct from old.cashier_id
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
  'Garde d''une vente : naît validée, sur la session OUVERTE de son caissier, au jour comorien ; ne se modifie pas, sauf le rattachement unique d''un client à une vente anonyme par invoice_pos_sale (Q-10) ; ne s''annule pas facturée (B-10) ; CANCELLED est terminal.';

revoke execute on function public.fn_pos_sale_guard() from public, anon;


-- La signature change : l'ancienne disparaît, PostgREST ne doit pas hésiter.
drop function if exists public.invoice_pos_sale(uuid, date);

create or replace function public.invoice_pos_sale(
  p_sale_id  uuid,
  p_due_date  date default null,
  p_client_id uuid default null
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

  /*
   * Q-10 (Direction, 8 octobre 2026) — LE CLIENT D'UNE VENTE ANONYME se
   * rattache ICI, au moment de la facture, une seule fois, dans la MÊME
   * transaction : si la facture échoue, le rattachement disparaît avec elle.
   * Aucun montant ne bouge, aucune écriture n'est produite. Le journal des
   * ventes garde l'avant (aucun client) et l'après (le client).
   */
  if s.client_id is null then
    if p_client_id is null then
      raise exception 'Opération refusée : la vente % n''a pas de client. Choisissez le client enregistré à qui la facturer.', s.sale_no
        using errcode = 'check_violation';
    end if;

    if not exists (select 1 from public.clients c where c.id = p_client_id) then
      raise exception 'Client introuvable ou non lisible avec vos droits.' using errcode = 'no_data_found';
    end if;

    perform set_config('adikom.pos_sale', 'on', true);
    perform set_config('adikom.pos_client_attach', 'on', true);

    update public.pos_sales
       set client_id = p_client_id
     where id = s.id and client_id is null;

    if not found then
      raise exception 'Le client n''a pas pu être rattaché à la vente avec vos droits.'
        using errcode = 'insufficient_privilege';
    end if;

    perform set_config('adikom.pos_client_attach', 'off', true);
    perform set_config('adikom.pos_sale', 'off', true);

    s.client_id := p_client_id;
  elsif p_client_id is not null and p_client_id <> s.client_id then
    raise exception 'Opération refusée : la vente % a déjà son client. Un client rattaché ne se remplace pas.', s.sale_no
      using errcode = 'check_violation';
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

comment on function public.invoice_pos_sale(uuid, date, uuid) is
  'Facture une vente au comptoir par les fonctions de facturation EXISTANTES, puis la solde par un règlement ADOSSÉ par paiement — sans aucune écriture de trésorerie (C-2, A-11). Une vente anonyme reçoit ici, une seule fois, son client (Q-10).';

revoke execute on function public.invoice_pos_sale(uuid, date, uuid) from public, anon;
grant  execute on function public.invoice_pos_sale(uuid, date, uuid) to authenticated, service_role;


-- Le rattachement est une écriture sur la vente, faite par qui FACTURE : la
-- policy l'admet pour une vente encore anonyme. Elle n'ouvre rien d'autre — la
-- garde refuse toute autre colonne, la garde « née par sa fonction » toute
-- écriture directe.
drop policy if exists pos_sales_update on public.pos_sales;

create policy pos_sales_update on public.pos_sales
  for update to authenticated
  using (
    (select public.has_permission('pos.sales.cancel'))
    or (client_id is null and (select public.has_permission('billing.customer_invoices.create')))
  )
  with check (
    (select public.has_permission('pos.sales.cancel'))
    or (select public.has_permission('billing.customer_invoices.create'))
  );


-- =============================================================================
-- CONTRÔLES
-- =============================================================================

do $$
declare
  v_def text;
begin
  if exists (select 1 from pg_proc where oid in (
       'public.fn_pos_sale_guard()'::regprocedure,
       'public.invoice_pos_sale(uuid, date, uuid)'::regprocedure) and prosecdef) then
    raise exception 'Une fonction du point de vente est SECURITY DEFINER (D4).';
  end if;

  if to_regprocedure('public.invoice_pos_sale(uuid, date)') is not null then
    raise exception 'L''ancienne signature de invoice_pos_sale subsiste.';
  end if;

  v_def := pg_get_functiondef('public.fn_pos_sale_guard()'::regprocedure);
  if v_def not like '%adikom.pos_client_attach%' or v_def not like '%B-10%' then
    raise exception 'La garde de la vente a perdu une règle.';
  end if;

  v_def := pg_get_functiondef('public.invoice_pos_sale(uuid, date, uuid)'::regprocedure);
  if v_def not like '%adikom.pos_client_attach'', ''off''%'
     or v_def not like '%adikom.pos_backed_payment%'
     or v_def not like '%create_customer_invoice%' then
    raise exception 'invoice_pos_sale a perdu son rattachement refermé ou sa chaîne de facturation.';
  end if;

  if has_function_privilege('anon', 'public.invoice_pos_sale(uuid, date, uuid)', 'EXECUTE') then
    raise exception 'anon peut facturer une vente.';
  end if;

  if (select count(*) from public.permissions) <> 246 then
    raise exception 'Catalogue attendu à 246 permissions.';
  end if;

  raise notice '[OK] 121. Q-10 : rattachement unique sous drapeau, facture par la chaîne existante, aucun SECURITY DEFINER.';
end $$;
