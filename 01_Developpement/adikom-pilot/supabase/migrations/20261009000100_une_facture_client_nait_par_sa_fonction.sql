-- =============================================================================
-- ADIKOM PILOT — 112 · Une facture client naît par sa fonction
-- LOT 28 — décision S-1 (DEC-055, 8 octobre 2026) · motif du Rapport 20 §3
--
-- LE DÉFAUT — constaté par l'audit statique de la préparation LOT 27-28 (§7)
--
-- La policy d'INSERT de `customer_invoices` dit `has_permission('billing.
-- customer_invoices.create')` et rien de plus. Elle répond à « QUI peut
-- créer ? », jamais à « cette ligne naît-elle PAR LE CHEMIN PRÉVU ? ». Un porteur
-- de la capacité pouvait donc insérer une facture directement par PostgREST, et
-- contourner `create_customer_invoice` :
--
--   · le NUMÉROTEUR — `invoice_no` choisi à la main. Un numéro FUTUR ferait
--     échouer, le jour où la séquence l'atteindrait, une création légitime ;
--   · `parties.clients.view` et `billing.customer_invoices.view`, que la
--     fonction exige pour ne pas facturer à l'aveugle.
--
-- POURQUOI MAINTENANT (S-1) — le LOT 28 rattache des factures à des ventes au
-- comptoir (`customer_invoices.pos_sale_id`). Poser la garde AVANT cette
-- intégration évite de l'écrire deux fois, et garantit qu'une facture de vente
-- ne peut naître que par la chaîne de facturation existante.
--
-- LA CORRECTION — le mécanisme DÉJÀ VALIDÉ du projet, rien d'inventé
--
-- Exactement celui de la migration 107 (`supplier_invoices`) : un drapeau LOCAL
-- À LA TRANSACTION, posé par la fonction de confiance juste avant son insertion
-- et refermé juste après, relu par un déclencheur `zzz_…` DERNIER de sa table.
--
--   · `set_config` vit dans `pg_catalog` : PostgREST ne l'expose pas ;
--   · la restauration garde son passage par `is_restoring()`, qui exige À LA
--     FOIS l'absence de session applicative ET le contexte de reprise.
--
-- 🟥 AUCUNE FONCTION NE DEVIENT `SECURITY DEFINER` (doctrine D4).
--
-- CE QUI CHANGE — `create_customer_invoice` est reprise de SA DERNIÈRE VERSION
-- ACTIVE (migration 098, `20260923000200_facturer_une_commande_client.sql`), et
-- SEULES DEUX INSTRUCTIONS s'ajoutent, autour de l'insertion. Ses sept
-- paramètres, ses capacités, ses contrôles anticipés d'unicité et ses messages
-- sont rendus à l'identique.
--
-- CE QUI NE CHANGE PAS — aucune table, aucune colonne, aucune policy, aucune
-- capacité (catalogue 238, provisoire), `backup_scope` (65, provisoire).
-- `create_invoice_from_sales_order` et la facturation de location appellent
-- `create_customer_invoice` : elles passent donc d'elles-mêmes.
-- =============================================================================


-- =============================================================================
-- 1. LE DÉCLENCHEUR — il demande par où la ligne est passée
-- =============================================================================

create or replace function public.fn_customer_invoice_born_by_function()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_restoring() then return new; end if;

  if coalesce(current_setting('adikom.customer_invoice', true), 'off') <> 'on' then
    raise exception
      'Opération refusée : une facture client se prépare par la fonction prévue, jamais par écriture directe. Sans elle, la facture porterait un numéro choisi à la main.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.fn_customer_invoice_born_by_function() is
  'Une facture client naît par `create_customer_invoice`, ou par une restauration. Jamais par un INSERT direct : le numéroteur ne se contourne pas (S-1).';

revoke execute on function public.fn_customer_invoice_born_by_function() from public, anon;

/*
 * 🟥 EN DERNIER, ET C'EST DÉLIBÉRÉ (Rapport 20 §3.3) : après `coherence`,
 * `starts_draft`, `transition`. En premier, il masquerait leurs refus — une
 * facture née « émise » serait refusée pour la mauvaise raison, et les recettes
 * du LOT 7 cesseraient d'éprouver ce qu'elles nomment.
 */
drop trigger if exists customer_invoices_zzz_born_by_function on public.customer_invoices;

create trigger customer_invoices_zzz_born_by_function
  before insert on public.customer_invoices
  for each row execute function public.fn_customer_invoice_born_by_function();


-- =============================================================================
-- 2. `create_customer_invoice` — elle annonce son passage
--
-- Reprise de sa DERNIÈRE VERSION ACTIVE (migration 098). Seules les deux
-- instructions `set_config` sont nouvelles.
-- =============================================================================

create or replace function public.create_customer_invoice(
  p_client_id         uuid,
  p_invoice_date      date,
  p_due_date          date default null,
  p_rental_id         uuid default null,
  p_notes             text default null,
  p_billing_period_id uuid default null,
  p_sales_order_id    uuid default null
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
    array['billing.customer_invoices.create'], 'préparer une facture client'
  );
  perform public.require_capability(
    array['billing.customer_invoices.view'], 'consulter la facture préparée'
  );
  -- §6 : la facture est LIÉE au client enregistré. On ne facture pas un tiers
  -- qu'on n'a pas le droit de consulter.
  perform public.require_capability(
    array['parties.clients.view'], 'consulter le client facturé'
  );

  if p_client_id is null then
    raise exception 'Une facture client se rattache obligatoirement à un client (§6).'
      using errcode = 'check_violation';
  end if;

  if p_invoice_date is null then
    raise exception 'La date de la facture est obligatoire (§20).'
      using errcode = 'check_violation';
  end if;

  if p_due_date is not null and p_due_date < p_invoice_date then
    raise exception 'L''échéance ne peut pas précéder la date de la facture (§21).'
      using errcode = 'check_violation';
  end if;

  -- Une facture de période nomme toujours sa location : sans elle, la chaîne
  -- Facture → Location → Client ne s'établirait pas.
  if p_billing_period_id is not null and p_rental_id is null then
    raise exception
      'Opération refusée : une facture de période désigne toujours la location qu''elle facture.'
      using errcode = 'check_violation';
  end if;

  -- LOT 25 : les deux origines sont étanches. Le déclencheur de cohérence le
  -- refait ; ce contrôle-ci n'est là que pour le message.
  if p_sales_order_id is not null and p_rental_id is not null then
    raise exception
      'Opération refusée : une facture naît d''une commande OU d''une location, jamais des deux.'
      using errcode = 'check_violation';
  end if;

  if p_rental_id is not null then
    perform public.require_capability(
      array['rental.rentals.view'], 'consulter la location facturée'
    );
  end if;

  if p_sales_order_id is not null then
    perform public.require_capability(
      array['commerce.sales_orders.view'], 'consulter la commande facturée'
    );
  end if;

  /*
   * Le client n'est PAS exigé actif.
   *
   * Une prestation réalisée pour un client devenu inactif reste une créance
   * réelle. Refuser de la facturer ferait disparaître du système une somme due
   * qui existe hors de lui — même raisonnement que pour le fournisseur inactif
   * (DEC-027 §i).
   */
  if not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception
      'Le client désigné est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  /*
   * Contrôles anticipés, pour des messages compréhensibles (CLAUDE.md §43). Les
   * index uniques partiels font autorité, y compris pour un appel qui ne
   * passerait pas par ici et pour deux saisies simultanées.
   */
  if p_sales_order_id is not null then
    select i.invoice_no into v_no
    from public.customer_invoices i
    where i.sales_order_id = p_sales_order_id and i.status <> 'CANCELLED'
    limit 1;

    if v_no is not null then
      raise exception
        'Opération refusée : cette commande est déjà couverte par la facture %. Une commande ne se facture pas deux fois.',
        v_no
        using errcode = 'unique_violation';
    end if;
  end if;

  if p_billing_period_id is null then
    if p_rental_id is not null and exists (
      select 1 from public.customer_invoices i
      where i.rental_id = p_rental_id
        and i.billing_period_id is null
        and i.status <> 'CANCELLED'
    ) then
      raise exception
        'Opération refusée : cette location porte déjà une facture. Une prestation ne se facture pas deux fois.'
        using errcode = 'unique_violation';
    end if;
  else
    select i.invoice_no into v_no
    from public.customer_invoices i
    where i.billing_period_id = p_billing_period_id and i.status <> 'CANCELLED'
    limit 1;

    if v_no is not null then
      raise exception
        'Opération refusée : cette période est déjà couverte par la facture %. Une période ne se facture pas deux fois.',
        v_no
        using errcode = 'unique_violation';
    end if;
  end if;

  v_no := public.next_number('customer_invoice');

  /*
   * 🟥 S-1 — LE DRAPEAU S'OUVRE ICI, ET SE REFERME JUSTE APRÈS L'INSERTION.
   * Local à la transaction : le laisser ouvert le ferait survivre au `return`.
   */
  perform set_config('adikom.customer_invoice', 'on', true);

  insert into public.customer_invoices
    (invoice_no, client_id, rental_id, billing_period_id, sales_order_id,
     invoice_date, due_date, notes, created_by, updated_by)
  values
    (v_no, p_client_id, p_rental_id, p_billing_period_id, p_sales_order_id,
     p_invoice_date, p_due_date,
     nullif(btrim(coalesce(p_notes, '')), ''),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  perform set_config('adikom.customer_invoice', 'off', true);

  return v_id;
end;
$$;

comment on function public.create_customer_invoice(uuid, date, date, uuid, text, uuid, uuid) is
  'Prépare une facture client en brouillon. Seul chemin de création : le numéroteur ne se contourne pas (S-1).';

revoke execute on function
  public.create_customer_invoice(uuid, date, date, uuid, text, uuid, uuid) from public, anon;
grant  execute on function
  public.create_customer_invoice(uuid, date, date, uuid, text, uuid, uuid) to authenticated, service_role;


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
    where tgrelid = 'public.customer_invoices'::regclass
      and tgname = 'customer_invoices_zzz_born_by_function' and not tgisinternal
  ) then
    raise exception 'Le déclencheur d''intégrité de création n''est pas posé.';
  end if;

  select count(*) into v_n
  from pg_trigger
  where tgrelid = 'public.customer_invoices'::regclass
    and not tgisinternal
    and tgname > 'customer_invoices_zzz_born_by_function';
  if v_n > 0 then
    raise exception '% déclencheur(s) passent APRÈS la garde d''intégrité : elle doit être la dernière.', v_n;
  end if;

  v_def := pg_get_functiondef('public.create_customer_invoice(uuid, date, date, uuid, text, uuid, uuid)'::regprocedure);
  if v_def not like '%adikom.customer_invoice'', ''on''%'
     or v_def not like '%adikom.customer_invoice'', ''off''%' then
    raise exception '`create_customer_invoice` n''ouvre pas, ou ne referme pas, son drapeau.';
  end if;

  -- Les acquis de la dernière version sont toujours là.
  if v_def not like '%parties.clients.view%'
     or v_def not like '%commerce.sales_orders.view%'
     or v_def not like '%next_number(''customer_invoice'')%'
     or v_def not like '%Une période ne se facture pas deux fois%' then
    raise exception '`create_customer_invoice` a perdu un contrôle de sa dernière version.';
  end if;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_customer_invoice') <> 1 then
    raise exception 'Plusieurs versions de `create_customer_invoice` coexistent.';
  end if;

  if pg_get_functiondef('public.fn_customer_invoice_born_by_function()'::regprocedure) not like '%is_restoring%' then
    raise exception 'La garde ignore la restauration.';
  end if;

  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and p.proname in ('create_customer_invoice', 'fn_customer_invoice_born_by_function');
  if v_n > 0 then
    raise exception 'Une fonction de la correction est SECURITY DEFINER (D4).';
  end if;

  -- Les gardes existantes demeurent.
  foreach v_def in array array[
    'customer_invoices_starts_draft', 'customer_invoices_coherence',
    'customer_invoices_transition', 'customer_invoices_no_delete',
    'customer_invoices_audit', 'customer_invoices_zz_no_cancel_when_paid'
  ] loop
    if not exists (select 1 from pg_trigger
                   where tgrelid = 'public.customer_invoices'::regclass
                     and tgname = v_def and not tgisinternal) then
      raise exception 'Le déclencheur « % » a disparu.', v_def;
    end if;
  end loop;

  -- La policy répond toujours à « qui » ; le déclencheur répond à « par où ».
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'customer_invoices'
                   and policyname = 'customer_invoices_insert') then
    raise exception 'La policy d''insertion a été remplacée : la correction ne devait pas y toucher.';
  end if;

  raise notice '[OK] 112. S-1 : une facture client naît par sa fonction.';
end $$;
