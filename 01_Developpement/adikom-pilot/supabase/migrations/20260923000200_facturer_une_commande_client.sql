-- =============================================================================
-- ADIKOM PILOT — 098 · Facturer une commande client
-- LOT 25 — DEC-049 · Plan 02 §9.2 · Plan 01 §15.5
--
-- CE QUE CETTE MIGRATION POSE
--
-- Le raccordement de la commande client à la facturation DÉJÀ EN PLACE. Rien
-- n'est réécrit : `create_customer_invoice`, `add_customer_invoice_line`,
-- `issue_customer_invoice`, `record_customer_payment` et toute la chaîne de
-- trésorerie restent celles des LOTS 7 et 8.
--
--     COMMANDE CONFIRMÉE
--            │  create_invoice_from_sales_order(commande, date, échéance)
--            ▼
--     create_customer_invoice(...)            ← EXISTANTE, non dupliquée
--            └─▶ add_customer_invoice_line(...) par ligne active
--                    kind = 'SERVICE'
--                    label · quantity · unit_price   ← COPIÉS de la commande
--                    service_id · service_variant_id · source_order_line_id
--            ▼
--     issue_customer_invoice(...)             ← EXISTANTE, acte distinct
--            ▼
--     record_customer_payment(...)            ← EXISTANTE, paiement partiel inclus
--            ▼
--     treasury_entries (IN)                   ← conséquence, jamais un acte
--
-- 🟥 AUCUNE TABLE DE FACTURE PARALLÈLE. Une facture née d'une commande est une
-- `customer_invoices` ordinaire : elle apparaît dans le module Factures clients,
-- s'émet, se règle, entre dans la trésorerie et dans le pilotage exactement
-- comme les autres. C'est la condition posée par la consigne §17.
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- UNE COMMANDE, UNE FACTURE — la règle, et d'où elle vient
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- La consigne §19 interdit de trancher ce point EN SILENCE. Il n'est pas
-- tranché en silence : il est DÉDUIT de l'architecture documentée, et le
-- raisonnement est écrit ici.
--
--   1. `order_status` (Plan 02 §9.5) porte `INVOICED`, et AUCUN état partiel —
--      pas de `PARTIALLY_INVOICED`. C'est un statut de la commande ENTIÈRE.
--   2. `create_invoice_from_sales_order(p_order_id, p_invoice_date, p_due_date)`
--      (Plan 01 §15.5) ne prend NI sélection de lignes, NI quantité à facturer.
--      Sa signature ne sait pas exprimer une facturation partielle.
--   3. Là où le Plan A VOULU plusieurs factures — la longue durée, A-6 — il a
--      créé l'objet qui les porte : `rental_billing_periods`, et DEUX index
--      disjoints (Plan 02 §19.3). Ici, rien de tel n'existe.
--
-- La règle appliquée est donc : UNE COMMANDE PRODUIT AU PLUS UNE FACTURE NON
-- ANNULÉE. Elle est portée par un index partiel de MÊME FORME que celui de la
-- location, et non par un effet de bord d'une contrainte technique.
--
-- 🟦 SI LA DIRECTION VEUT LA FACTURATION PARTIELLE, l'extension est connue et
-- elle est additive : un objet « tranche de commande » entre la commande et la
-- facture, sur le modèle exact de `rental_billing_periods`. Le Rapport 17 le
-- signale comme point ouvert. Rien ici ne l'empêche.
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- TROIS FONCTIONS EXISTANTES SONT ÉTENDUES, AUCUNE N'EST REMPLACÉE
--
-- Chacune est reprise de SA DERNIÈRE VERSION ACTIVE — celle qu'`information_schema`
-- rend aujourd'hui, et non celle de la migration qui l'a créée. La leçon du
-- LOT 22 : « une policy réécrite se reprend à sa dernière version ».
--
--   `create_customer_invoice`  reçoit `p_sales_order_id` en DERNIER paramètre,
--        avec `default null` — exactement comme `p_billing_period_id` au LOT 23.
--        Tout appel existant continue de fonctionner à l'identique.
--   `add_customer_invoice_line` reçoit trois paramètres de traçabilité, tous
--        `default null`.
--   `cancel_customer_invoice`  ramène la commande à « Confirmée », comme elle
--        ramène déjà la location à « À facturer ».
--
-- AUCUNE COLONNE DE COÛT n'est ajoutée à `customer_invoice_lines`. Le Plan 01
-- §15.5 y plaçait `unit_cost` ; le Plan 02 §9.3 l'en retire au profit de
-- `commercial_line_costs`, assignée au LOT 28 (§13.2). Le §9.2 du Plan 02, qui
-- fait foi, n'énumère pour le LOT 25 que `service_id`, `service_variant_id` et
-- `source_order_line_id`.
--
-- AUCUNE CAPACITÉ NOUVELLE. Facturer une commande relève de
-- `billing.customer_invoices.create`, qui existe depuis la migration 007. En
-- créer une seconde serait deux vérités sur le même acte (CLAUDE.md §19 bis).
-- Catalogue : 213, inchangé.
-- =============================================================================


-- =============================================================================
-- 1. LES COLONNES — Plan 02 §9.2, toutes NULLABLES
--
-- Aucune donnée existante n'est modifiée : les factures de location et de
-- services déjà en base reçoivent `NULL` partout, et se comportent exactement
-- comme avant.
-- =============================================================================

alter table public.customer_invoices
  add column if not exists sales_order_id uuid
    references public.sales_orders (id) on delete restrict;

comment on column public.customer_invoices.sales_order_id is
  'Commande client dont cette facture est née (LOT 25). NULL pour une facture de location ou de services saisie directement.';

create index if not exists customer_invoices_sales_order_idx
  on public.customer_invoices (sales_order_id)
  where sales_order_id is not null;


alter table public.customer_invoice_lines
  add column if not exists service_id uuid
    references public.services (id) on delete restrict;

alter table public.customer_invoice_lines
  add column if not exists service_variant_id uuid
    references public.service_variants (id) on delete restrict;

alter table public.customer_invoice_lines
  add column if not exists source_order_line_id uuid
    references public.sales_order_lines (id) on delete set null;

comment on column public.customer_invoice_lines.service_id is
  'Service du catalogue porté par la ligne (LOT 25). NULL pour une ligne de location, de frais ou libre.';
comment on column public.customer_invoice_lines.source_order_line_id is
  'Ligne de commande dont celle-ci est née. La traçabilité va de la facture jusqu''au devis.';

-- Même garantie qu'au §3 de la 097 : la variante appartient bien à son service,
-- et c'est la BASE qui le dit — pas un déclencheur qui lirait à travers RLS.
do $$ begin
  alter table public.customer_invoice_lines
    add constraint customer_invoice_lines_variant_belongs
      foreign key (service_variant_id, service_id)
      references public.service_variants (id, service_id) on delete restrict;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.customer_invoice_lines
    add constraint customer_invoice_lines_catalog_pair check (
      (service_id is null and service_variant_id is null)
      or (service_id is not null and service_variant_id is not null)
    );
exception when duplicate_object then null; end $$;

create index if not exists customer_invoice_lines_source_idx
  on public.customer_invoice_lines (source_order_line_id)
  where source_order_line_id is not null;


-- =============================================================================
-- 2. UNE COMMANDE NE SE FACTURE PAS DEUX FOIS
--
-- La même forme que `customer_invoices_one_per_period_idx` (migration 094) :
-- un index UNIQUE PARTIEL, qui laisse l'annulation libérer la place.
--
-- Il fait autorité pour deux clics simultanés comme pour un `POST` direct : le
-- contrôle anticipé de `create_customer_invoice` n'est là que pour rendre le
-- message compréhensible (CLAUDE.md §43).
-- =============================================================================

create unique index if not exists customer_invoices_one_per_order_idx
  on public.customer_invoices (sales_order_id)
  where sales_order_id is not null and status <> 'CANCELLED';


-- =============================================================================
-- 3. COHÉRENCE — la facture, sa commande, et leur client
--
-- `fn_customer_invoice_coherence` est REPRISE DE SA DERNIÈRE VERSION ACTIVE
-- (migration 094, régime longue durée compris) et ÉTENDUE. Sa partie location
-- n'est pas touchée d'une virgule.
--
-- CE QUI EST AJOUTÉ :
--
--   · une facture de commande ne vise PAS de location — les deux origines sont
--     étanches, comme le sont déjà la durée fixée et la période ;
--   · la commande est CONFIRMÉE ou LIVRÉE — on ne facture pas un brouillon, ni
--     une commande annulée ;
--   · le client de la facture est celui de la commande. La chaîne
--     Facture → Commande → Devis → Client ne se rompt pas.
-- =============================================================================

create or replace function public.fn_customer_invoice_coherence()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status public.rental_status;
  v_client uuid;
  v_no     text;
  v_type   public.rental_type;
  p        public.rental_billing_periods%rowtype;
  o        public.sales_orders%rowtype;
begin
  /* ---------- ORIGINE COMMERCIALE — LOT 25 -------------------------------- */
  if new.sales_order_id is not null then

    -- Les deux origines sont ÉTANCHES. Une facture née d'une commande ne
    -- facture pas en même temps une location : elle se compterait deux fois.
    if new.rental_id is not null then
      raise exception
        'Opération refusée : une facture naît d''une commande OU d''une location, jamais des deux. Le montant serait compté deux fois.'
        using errcode = 'check_violation';
    end if;

    -- Le dossier ne se revérifie que s'il change : rejouer ce contrôle à chaque
    -- changement de statut imposerait `commerce.sales_orders.view` à celui qui
    -- annule (DEC-024).
    if tg_op = 'UPDATE' and new.sales_order_id is not distinct from old.sales_order_id then
      return new;
    end if;

    select * into o from public.sales_orders where id = new.sales_order_id;

    if not found then
      raise exception
        'La commande visée est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;

    if not public.is_restoring() then
      if o.status not in ('CONFIRMED', 'DELIVERED', 'INVOICED') then
        raise exception
          'Opération refusée : la commande % est « % ». Seule une commande confirmée ou livrée se facture.',
          o.order_no, o.status
          using errcode = 'check_violation';
      end if;
    end if;

    if o.client_id is distinct from new.client_id then
      raise exception
        'Opération refusée : cette commande n''est pas celle du client facturé. La chaîne Facture → Commande → Client ne se rompt pas.'
        using errcode = 'check_violation';
    end if;

    return new;
  end if;

  /* ---------- ORIGINE LOCATION — LOTS 7 ET 23, INCHANGÉS ------------------- */
  if new.rental_id is null then
    -- Une facture de services ne vise ni location, ni période, ni commande.
    return new;
  end if;

  -- Le dossier ne se revérifie que s'il change : rejouer ce contrôle à chaque
  -- changement de statut imposerait `rental.rentals.view` à celui qui annule,
  -- c'est-à-dire ferait dépendre un acte d'une capacité qui ne le concerne pas
  -- (DEC-024). L'émission et l'annulation l'exigent, elles, nommément.
  if tg_op = 'UPDATE'
     and new.rental_id is not distinct from old.rental_id
     and new.billing_period_id is not distinct from old.billing_period_id then
    return new;
  end if;

  select r.status, r.client_id, r.rental_no, r.rental_type
    into v_status, v_client, v_no, v_type
  from public.rentals r
  where r.id = new.rental_id;

  -- Introuvable ou invisible : même réponse, afin de ne rien apprendre à qui
  -- n'a pas le droit de savoir (DEC-017).
  if v_status is null then
    raise exception
      'La location visée est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if new.billing_period_id is null then
    /* ---------- RÉGIME « DURÉE FIXÉE » — LE LOT 5, INCHANGÉ ---------------- */
    if v_type = 'LONG_TERM' and not public.is_restoring() then
      raise exception
        'Opération refusée : la location % est en longue durée — elle se facture PAR PÉRIODE. Une facture couvrant tout le contrat s''ajouterait à ses factures de période, et le client devrait deux fois la même chose.',
        v_no
        using errcode = 'check_violation';
    end if;

    if v_status <> 'TO_INVOICE' and not public.is_restoring() then
      raise exception
        'Opération refusée : seule une location « À facturer » se facture. La location % est « % » (Workflow 07 §5).',
        v_no, v_status
        using errcode = 'check_violation';
    end if;
  else
    /* ---------- RÉGIME « LONGUE DURÉE » — 🟩 A-6 --------------------------- */
    select * into p
    from public.rental_billing_periods
    where id = new.billing_period_id;

    if not found then
      raise exception
        'La période facturable visée est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;

    if p.rental_id is distinct from new.rental_id then
      raise exception
        'Opération refusée : cette période facturable appartient à un autre contrat. Une facture ne couvre pas le temps d''une autre location.'
        using errcode = 'check_violation';
    end if;

    if not public.is_restoring() then
      if v_type <> 'LONG_TERM' then
        raise exception
          'Opération refusée : la location % n''est pas en longue durée. Ses périodes facturables ne gouvernent rien.',
          v_no
          using errcode = 'check_violation';
      end if;

      if p.status = 'CANCELLED' then
        raise exception
          'Opération refusée : cette période facturable est annulée. Elle ne sera jamais facturée.'
          using errcode = 'check_violation';
      end if;

      /*
       * LA LOCATION EST PARTIE, ET ELLE N'EST NI ANNULÉE NI CLÔTURÉE.
       *
       * Les six états où le véhicule est sorti — `rentals_started_when_running`
       * l'y garantit — et où le dossier vit encore.
       */
      if v_status not in ('IN_PROGRESS', 'EXTENDED', 'RETURNED', 'TO_CONTROL', 'TO_INVOICE', 'INVOICED') then
        raise exception
          'Opération refusée : la location % est « % ». Une période ne se facture qu''une fois le véhicule remis au client, et tant que le dossier n''est ni annulé ni clôturé.',
          v_no, v_status
          using errcode = 'check_violation';
      end if;

      /*
       * 🟩 « CHAQUE FIN DU MOIS. » Une période encore en cours ne se facture
       * pas : on facturerait un temps qui n'a pas couru, et le retour anticipé
       * du véhicule rendrait la facture fausse sans qu'on puisse la corriger —
       * une facture émise ne se recalcule jamais (Workflow 07 §8).
       */
      if upper(p.period) > now() then
        raise exception
          'Opération refusée : cette période court jusqu''au %. Elle se facturera lorsqu''elle sera échue.',
          to_char(upper(p.period) at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI')
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if v_client is distinct from new.client_id then
    raise exception
      'Opération refusée : cette location n''est pas celle du client facturé. La chaîne Facture → Location → Client ne se rompt pas (§49).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;


-- =============================================================================
-- 4. `create_customer_invoice` — un paramètre de plus, en dernier
--
-- REPRISE DE SA DERNIÈRE VERSION ACTIVE (migration 094). Le régime longue durée,
-- les contrôles anticipés d'unicité, l'exigence de `parties.clients.view` : tout
-- y est, à l'identique.
--
-- ⚠ LE PARAMÈTRE DE PLUS CRÉE UNE SURCHARGE, PAS UN REMPLACEMENT.
--
-- `create or replace` ne remplace que la fonction de MÊME signature. Laisser les
-- deux versions coexister rendrait tout appel par paramètres nommés AMBIGU —
-- PostgreSQL refuserait alors chaque facture avec « function is not unique ».
-- L'ancienne est donc retirée, exactement comme le LOT 23 a retiré celle à cinq
-- paramètres qu'il remplaçait (migration 095).
-- =============================================================================

drop function if exists public.create_customer_invoice(uuid, date, date, uuid, text, uuid);

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

  insert into public.customer_invoices
    (invoice_no, client_id, rental_id, billing_period_id, sales_order_id,
     invoice_date, due_date, notes, created_by, updated_by)
  values
    (v_no, p_client_id, p_rental_id, p_billing_period_id, p_sales_order_id,
     p_invoice_date, p_due_date,
     nullif(btrim(coalesce(p_notes, '')), ''),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function
  public.create_customer_invoice(uuid, date, date, uuid, text, uuid, uuid) from public, anon;
grant  execute on function
  public.create_customer_invoice(uuid, date, date, uuid, text, uuid, uuid) to authenticated, service_role;


-- =============================================================================
-- 5. `add_customer_invoice_line` — la traçabilité, en trois paramètres
--
-- REPRISE DE SA DERNIÈRE VERSION ACTIVE. Aucun contrôle n'est retiré.
--
-- 🟥 LES TROIS PARAMÈTRES SONT DE TRAÇABILITÉ, PAS DE VALORISATION. Le prix
-- reste `p_unit_price`, reçu de l'appelant : cette fonction n'interroge JAMAIS
-- le catalogue. Le montant d'une facture née d'une commande est celui de la
-- commande, lui-même celui du devis. Aucun maillon ne relit un prix courant.
--
-- ⚠ Même précaution qu'au §4 : l'ancienne signature est retirée, sans quoi les
-- deux versions rendraient tout appel par paramètres nommés ambigu.
-- =============================================================================

drop function if exists public.add_customer_invoice_line(
  uuid, public.customer_invoice_line_kind, text, integer, bigint, text
);

create or replace function public.add_customer_invoice_line(
  p_invoice_id     uuid,
  p_kind           public.customer_invoice_line_kind,
  p_label          text,
  p_quantity       integer,
  p_unit_price     bigint,
  p_justification  text default null,
  p_service_id     uuid default null,
  p_variant_id     uuid default null,
  p_order_line_id  uuid default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_status public.customer_invoice_status;
begin
  perform public.require_capability(
    array['billing.customer_invoices.create', 'billing.customer_invoices.update'],
    'ajouter une ligne à une facture client'
  );
  perform public.require_capability(
    array['billing.customer_invoices.view'], 'consulter la facture à compléter'
  );

  if coalesce(btrim(p_label), '') = '' then
    raise exception 'Chaque ligne doit être désignée (§22).' using errcode = 'check_violation';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La quantité doit être un entier positif.'
      using errcode = 'check_violation';
  end if;

  if p_unit_price is null or p_unit_price <= 0 then
    raise exception 'Le prix unitaire doit être un entier positif, en KMF (DEC-010).'
      using errcode = 'check_violation';
  end if;

  select i.status into v_status from public.customer_invoices i where i.id = p_invoice_id;

  if v_status is null then
    raise exception
      'La facture visée est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if v_status <> 'DRAFT' then
    raise exception
      'Opération refusée : les lignes d''une facture émise ou annulée sont figées (§8, §72).'
      using errcode = 'check_violation';
  end if;

  -- Nommer un service suppose le droit de le consulter. La contrainte
  -- `customer_invoice_lines_variant_belongs` garantit, elle, que la variante
  -- appartient bien à ce service.
  if p_service_id is not null then
    perform public.require_capability(
      array['catalog.services.view'], 'consulter le service porté par la ligne'
    );
  end if;

  insert into public.customer_invoice_lines
    (customer_invoice_id, kind, label, quantity, unit_price, justification,
     service_id, service_variant_id, source_order_line_id,
     created_by, updated_by)
  values
    (p_invoice_id, coalesce(p_kind, 'SERVICE'), btrim(p_label), p_quantity, p_unit_price,
     nullif(btrim(coalesce(p_justification, '')), ''),
     p_service_id, p_variant_id, p_order_line_id,
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function
  public.add_customer_invoice_line(uuid, public.customer_invoice_line_kind, text, integer, bigint, text, uuid, uuid, uuid)
  from public, anon;
grant  execute on function
  public.add_customer_invoice_line(uuid, public.customer_invoice_line_kind, text, integer, bigint, text, uuid, uuid, uuid)
  to authenticated, service_role;


-- =============================================================================
-- 6. `cancel_customer_invoice` — la commande revient à « Confirmée »
--
-- REPRISE DE SA DERNIÈRE VERSION ACTIVE. La partie location est intacte.
--
-- Sans ce retour, une facture annulée par erreur laisserait la commande
-- « Facturée » pour toujours : l'index partiel, lui, se libère — et la commande
-- serait facturable sans jamais cesser d'être facturée. Les deux doivent bouger
-- ensemble, exactement comme la location revient à « À facturer ».
-- =============================================================================

create or replace function public.cancel_customer_invoice(
  p_invoice_id uuid,
  p_reason     text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  f         public.customer_invoices%rowtype;
  v_rstatus public.rental_status;
  v_ostatus public.order_status;
begin
  perform public.require_capability(
    array['billing.customer_invoices.cancel'], 'annuler une facture client'
  );
  perform public.require_capability(
    array['billing.customer_invoices.view'], 'consulter la facture à annuler'
  );

  select * into f from public.customer_invoices where id = p_invoice_id for update;

  if not found then
    raise exception 'Facture client introuvable.' using errcode = 'no_data_found';
  end if;

  if f.status = 'CANCELLED' then
    raise exception
      'Opération refusée : cette facture est déjà annulée.'
      using errcode = 'check_violation';
  end if;

  if f.rental_id is not null then
    perform public.require_capability(
      array['rental.rentals.view'], 'consulter la location que cette facture engage'
    );

    select r.status into v_rstatus from public.rentals r where r.id = f.rental_id;

    if v_rstatus is null then
      raise exception
        'La location de cette facture est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;

    if v_rstatus = 'CLOSED' then
      raise exception
        'Opération refusée : la location de cette facture est clôturée. Une clôture d''exploitation ne se défait pas par l''annulation d''une facture.'
        using errcode = 'check_violation';
    end if;
  end if;

  if f.sales_order_id is not null then
    perform public.require_capability(
      array['commerce.sales_orders.view'], 'consulter la commande que cette facture engage'
    );

    select o.status into v_ostatus from public.sales_orders o where o.id = f.sales_order_id;

    if v_ostatus is null then
      raise exception
        'La commande de cette facture est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;
  end if;

  update public.customer_invoices
     set status            = 'CANCELLED',
         cancelled_at      = now(),
         cancelled_by      = public.current_actor(),
         status_reason     = nullif(btrim(coalesce(p_reason, '')), ''),
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = f.id;

  -- La location retourne à « À facturer » : elle attend de nouveau sa facture,
  -- qu'elle fût unique (durée fixée) ou celle d'une période (longue durée).
  if f.rental_id is not null and v_rstatus = 'INVOICED' then
    update public.rentals
       set status            = 'TO_INVOICE',
           status_reason     = 'Facture ' || f.invoice_no || ' annulée',
           status_changed_at = now(),
           status_changed_by = public.current_actor(),
           updated_by        = public.current_actor()
     where id = f.rental_id
       and status = 'INVOICED';
  end if;

  -- LOT 25 : la commande redevient « Confirmée » et se facture de nouveau.
  if f.sales_order_id is not null and v_ostatus = 'INVOICED' then
    update public.sales_orders
       set status            = 'CONFIRMED',
           invoiced_at       = null,
           invoiced_by       = null,
           status_reason     = 'Facture ' || f.invoice_no || ' annulée',
           status_changed_at = now(),
           status_changed_by = public.current_actor(),
           updated_by        = public.current_actor()
     where id = f.sales_order_id
       and status = 'INVOICED';
  end if;
end;
$$;

revoke execute on function public.cancel_customer_invoice(uuid, text) from public, anon;
grant  execute on function public.cancel_customer_invoice(uuid, text) to authenticated, service_role;


-- =============================================================================
-- 7. L'ORCHESTRATEUR — `create_invoice_from_sales_order`
--
-- Elle N'ÉCRIT RIEN elle-même dans `customer_invoices` : elle appelle les deux
-- fonctions existantes, qui portent déjà leurs cinq couches de contrôle. C'est
-- ce qui garantit qu'une facture née d'une commande est en tous points une
-- facture ordinaire.
--
-- CAPACITÉS EXIGÉES — Plan 01 §15.5, mot pour mot :
--   `commerce.sales_orders.view`      elle lit la commande
--   `billing.customer_invoices.create` elle prépare la facture
--   `billing.customer_invoices.view`   elle la relit
--   `parties.clients.view`             elle facture un client
--
-- 🟥 ELLE N'EXIGE PAS `billing.customer_invoices.issue` : ÉMETTRE RESTE UN ACTE
-- DISTINCT. La facture naît en BROUILLON, se relit, se corrige, puis s'émet par
-- l'écran de facturation — exactement comme une facture de location.
--
-- 🟥 ELLE NE RELIT PAS LE CATALOGUE. Chaque ligne active est recopiée telle
-- quelle. Un prix de catalogue modifié entre la commande et la facturation n'a
-- aucun effet : le client a commandé un montant, c'est celui-là qu'il doit.
-- =============================================================================

create or replace function public.create_invoice_from_sales_order(
  p_order_id     uuid,
  p_invoice_date date default null,
  p_due_date     date default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  o       public.sales_orders%rowtype;
  l       record;
  v_id    uuid;
  v_date  date;
  v_count int := 0;
begin
  perform public.require_capability(
    array['commerce.sales_orders.view'], 'consulter la commande à facturer');
  perform public.require_capability(
    array['billing.customer_invoices.create'], 'préparer la facture de la commande');
  perform public.require_capability(
    array['billing.customer_invoices.view'], 'consulter la facture préparée');
  perform public.require_capability(
    array['parties.clients.view'], 'consulter le client facturé');

  select * into o from public.sales_orders where id = p_order_id for update;

  if not found then
    raise exception 'Commande introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if o.status = 'INVOICED' then
    raise exception
      'Opération refusée : cette commande est déjà facturée. Une commande ne se facture pas deux fois.'
      using errcode = 'unique_violation';
  end if;

  if o.status not in ('CONFIRMED', 'DELIVERED') then
    raise exception
      'Opération refusée : seule une commande confirmée ou livrée se facture. Celle-ci est « % ».', o.status
      using errcode = 'check_violation';
  end if;

  -- Le jour est celui d'ADIKOM (UTC+3), jamais celui du serveur.
  v_date := coalesce(p_invoice_date, (now() at time zone 'Indian/Comoro')::date);

  if p_due_date is not null and p_due_date < v_date then
    raise exception 'L''échéance ne peut pas précéder la date de la facture.'
      using errcode = 'check_violation';
  end if;

  v_id := public.create_customer_invoice(
    p_client_id         => o.client_id,
    p_invoice_date      => v_date,
    p_due_date          => p_due_date,
    p_rental_id         => null,
    p_notes             => 'Commande ' || o.order_no,
    p_billing_period_id => null,
    p_sales_order_id    => o.id
  );

  for l in
    select id, label, quantity, unit_price, service_id, service_variant_id
    from public.sales_order_lines
    where sales_order_id = o.id and is_archived = false
    order by created_at
  loop
    perform public.add_customer_invoice_line(
      p_invoice_id    => v_id,
      p_kind          => 'SERVICE'::public.customer_invoice_line_kind,
      p_label         => l.label,
      p_quantity      => l.quantity,
      p_unit_price    => l.unit_price,
      p_justification => null,
      p_service_id    => l.service_id,
      p_variant_id    => l.service_variant_id,
      p_order_line_id => l.id
    );
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception
      'Opération refusée : cette commande ne porte aucune ligne active, ou ses lignes ne sont pas lisibles avec vos droits. La facture serait vide.'
      using errcode = 'check_violation';
  end if;

  update public.sales_orders
     set status            = 'INVOICED',
         invoiced_at       = now(),
         invoiced_by       = public.current_actor(),
         status_reason     = 'Facture préparée',
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = o.id;

  return v_id;
end;
$$;

comment on function public.create_invoice_from_sales_order(uuid, date, date) is
  'Prépare une facture client À PARTIR des fonctions existantes de facturation. La facture naît en brouillon : l''émettre reste un acte distinct.';

revoke execute on function public.create_invoice_from_sales_order(uuid, date, date) from public, anon;
grant  execute on function public.create_invoice_from_sales_order(uuid, date, date) to authenticated, service_role;


-- =============================================================================
-- 8. CONTRÔLES
-- =============================================================================

do $$
declare
  v_col text;
begin
  -- Les quatre colonnes du Plan 02 §9.2, et pas une de plus.
  foreach v_col in array array[
    'customer_invoices.sales_order_id',
    'customer_invoice_lines.service_id',
    'customer_invoice_lines.service_variant_id',
    'customer_invoice_lines.source_order_line_id'
  ] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = split_part(v_col, '.', 1)
        and column_name = split_part(v_col, '.', 2)
    ) then
      raise exception 'Colonne % absente.', v_col;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = split_part(v_col, '.', 1)
        and column_name = split_part(v_col, '.', 2)
        and is_nullable = 'NO'
    ) then
      raise exception
        'La colonne % n''est pas nullable : des données existantes seraient invalidées.', v_col;
    end if;
  end loop;

  /*
   * 🟥 AUCUNE COLONNE DE COÛT SUR LA LIGNE DE FACTURE — Plan 02 §9.3.
   *
   * Le Plan 01 y plaçait `unit_cost`. L'ajouter ici rendrait la confidentialité
   * du prix d'achat contournable PAR LA FACTURE, et le PDF de facture est
   * précisément ce qui sort du système.
   */
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_invoice_lines'
      and (column_name like '%cost%' or column_name like '%margin%')
  ) then
    raise exception
      'Une colonne de coût figure sur `customer_invoice_lines` : la confidentialité serait contournable par la facture (Plan 02 §9.3).';
  end if;

  -- Une commande ne se facture pas deux fois.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'customer_invoices_one_per_order_idx'
  ) then
    raise exception 'L''index d''unicité « une facture par commande » est absent.';
  end if;

  /*
   * LES DEUX INDEX DE LA LOCATION SONT TOUJOURS LÀ — l'acquis du LOT 23.
   *
   * Cette migration touche `customer_invoices`. Une régression y serait une
   * double facturation, découverte par le client.
   */
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'customer_invoices_one_per_fixed_rental_idx'
  ) or not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'customer_invoices_one_per_period_idx'
  ) then
    raise exception
      'Un index d''unicité de la facturation de location a disparu : une location deviendrait facturable deux fois.';
  end if;

  -- `backup_columns` reprend les colonnes d'elle-même : vérifié, pas supposé.
  if public.backup_columns('customer_invoices') not like '%sales_order_id%' then
    raise exception
      '`backup_columns` ignore `customer_invoices.sales_order_id` : la facture reviendrait détachée de sa commande.';
  end if;

  if public.backup_columns('customer_invoice_lines') not like '%source_order_line_id%' then
    raise exception
      '`backup_columns` ignore `customer_invoice_lines.source_order_line_id`.';
  end if;

  -- DOCTRINE D4.
  if exists (
    select 1 from pg_proc
    where oid in (
      'public.create_invoice_from_sales_order(uuid, date, date)'::regprocedure,
      'public.create_customer_invoice(uuid, date, date, uuid, text, uuid, uuid)'::regprocedure,
      'public.cancel_customer_invoice(uuid, text)'::regprocedure
    )
    and prosecdef
  ) then
    raise exception 'Une fonction de facturation est SECURITY DEFINER (doctrine D4).';
  end if;

  /*
   * ⚠ UNE SEULE VERSION DE CHAQUE FONCTION ÉTENDUE.
   *
   * Deux surcharges coexistantes rendraient tout appel par paramètres nommés
   * ambigu, et PostgreSQL refuserait chaque facture avec « function is not
   * unique » — une panne totale de la facturation, découverte en production.
   */
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_customer_invoice') <> 1 then
    raise exception
      'Plusieurs versions de `create_customer_invoice` coexistent : les appels par paramètres nommés deviendraient ambigus.';
  end if;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'add_customer_invoice_line') <> 1 then
    raise exception
      'Plusieurs versions de `add_customer_invoice_line` coexistent : les appels par paramètres nommés deviendraient ambigus.';
  end if;

  -- AUCUNE CAPACITÉ NOUVELLE : facturer une commande réemploie celles du LOT 7.
  if (select count(*) from public.permissions) <> 213 then
    raise exception 'Le catalogue a bougé : cette migration ne crée aucune capacité.';
  end if;

  raise notice
    '[OK] 098. La commande alimente la facturation client EXISTANTE. Une commande, au plus une facture non annulée. Aucun coût sur la ligne.';
end $$;
