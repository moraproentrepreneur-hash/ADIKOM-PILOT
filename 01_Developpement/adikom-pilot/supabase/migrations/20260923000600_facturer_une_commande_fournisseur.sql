-- =============================================================================
-- ADIKOM PILOT — 102 · Facturer une commande fournisseur
-- LOT 26 — Plan 02 §9.2, §18.2 · Plan 01 §15.5 (« Côté fournisseur »)
--
-- CE QUE CETTE MIGRATION POSE
--
-- Le raccordement de la commande fournisseur à la facturation DÉJÀ EN PLACE.
-- Rien n'est réécrit : `create_supplier_invoice`, `add_supplier_invoice_line`,
-- `submit_supplier_invoice`, `validate_supplier_invoice`,
-- `record_supplier_payment`, `attach_imputation_to_invoice` et toute la chaîne
-- de trésorerie restent celles des LOTS 4, 5 et 6.
--
--     COMMANDE FOURNISSEUR PASSÉE
--            │  create_invoice_from_purchase_order(commande, date, échéance, réf.)
--            ▼
--     create_supplier_invoice(...)            ← EXISTANTE, non dupliquée
--            └─▶ add_supplier_invoice_line(...) par ligne active
--                    label · quantity · unit_price   ← COPIÉS de la commande
--                    service · variante              ← traçabilité
--                    amount = quantity × unit_price  ← CALCULÉ, jamais fourni
--            ▼
--     submit_supplier_invoice(...)            ← EXISTANTE, acte distinct
--     validate_supplier_invoice(...)          ← EXISTANTE, acte distinct
--            ▼
--     record_supplier_payment(...)            ← EXISTANTE, règlements partiels inclus
--            ▼
--     treasury_entries (OUT)                  ← conséquence, jamais un acte
--
-- 🟥 AUCUNE TABLE DE FACTURE FOURNISSEUR PARALLÈLE. Une facture née d'une
-- commande est une `supplier_invoices` ORDINAIRE : elle apparaît dans le module
-- Factures fournisseurs, se soumet, se valide, s'impute, se règle, entre dans la
-- trésorerie et dans le pilotage exactement comme les autres.
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 🟥 UNE FACTURE REÇUE CONSTATE — ELLE N'EXÉCUTE PAS LA COMMANDE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- C'est l'asymétrie de fond entre les deux côtés du commerce, et elle gouverne
-- ce que cette migration N'IMPOSE PAS :
--
--   CÔTÉ CLIENT      la facture EXPRIME l'engagement d'ADIKOM. Son montant est
--                    celui de la commande, et ADIKOM le décide.
--   CÔTÉ FOURNISSEUR la facture CONSTATE ce que le fournisseur réclame. Son
--                    montant est celui du document reçu — Module 07 §28, §54 :
--                    « le montant brut d'une facture fournisseur doit être
--                    conservé », et il est la somme de SES lignes.
--
-- Conséquence assumée : rien n'oblige le total de la facture à égaler celui de
-- la commande. Un fournisseur peut facturer un extra, une remise de dernière
-- minute, une quantité réellement livrée différente. Le système les rend
-- COMPARABLES — l'écran affiche les deux totaux et leur écart — il ne les force
-- pas à coïncider. Les forcer reviendrait à réécrire un document reçu.
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 🟦 UNE COMMANDE, AU PLUS UNE FACTURE NON ANNULÉE — LA RÈGLE, ET SA LIMITE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- 🟥 CE POINT N'EST PAS TRANCHÉ PAR SYMÉTRIE AVEC DEC-050, qui porte
-- EXPRESSÉMENT sur la commande CLIENT. Il est déduit de l'architecture, le
-- raisonnement est écrit, et la question résiduelle est POSÉE À LA DIRECTION
-- plutôt que subie — exactement comme le LOT 25 l'avait fait avant DEC-050.
--
-- CE QUE LA DOCUMENTATION DIT :
--
--   · Plan 02 §9.2 ajoute `supplier_invoices.purchase_order_id` — UNE colonne,
--     sur la facture, au singulier. Rien n'évoque une tranche de commande.
--   · `order_status` (Plan 02 §9.5) porte `INVOICED` et AUCUN état partiel. Il
--     est PARTAGÉ avec le commerce client : c'est un statut de la commande
--     ENTIÈRE, des deux côtés.
--   · Plan 01 §2091 nomme `create_invoice_from_purchase_order(commande, …)` : sa
--     signature ne sait exprimer ni sélection de lignes, ni quantité à facturer.
--   · Là où le Plan a VOULU plusieurs factures — la longue durée, A-6 —, il a
--     créé l'objet qui les porte, `rental_billing_periods`, et deux index
--     disjoints (Plan 02 §19.3). Ici, rien de tel n'existe.
--   · Aucune règle documentaire ne parle d'acompte fournisseur : Module 07,
--     Règles finance §8, Règles fournisseurs §2 et Workflow 08 ont été relus.
--     Règles fournisseurs §2 dit qu'un fournisseur porte « plusieurs factures » —
--     c'est vrai, et cela reste vrai : la règle ci-dessous ne limite pas le
--     fournisseur, elle limite le LIEN d'une facture à UNE commande.
--
-- CE QUE L'ARCHITECTURE IMPOSE : si deux factures pouvaient se rattacher à une
-- même commande, `INVOICED` deviendrait ambigu — facturée pour quel montant ? —
-- et l'annulation de l'une des deux ne saurait pas si la commande redevient
-- « passée ». Avec une seule, le retour est univoque.
--
-- 🟥 CE QUI N'EST PAS EMPÊCHÉ POUR AUTANT. Un fournisseur qui facture une même
-- commande en deux fois n'est PAS bloqué : la seconde facture s'enregistre comme
-- toute facture fournisseur reçue — c'est la chaîne du LOT 5, inchangée — et
-- mentionne la commande dans ses observations. Seul le LIEN STRUCTUREL est
-- unique. Aucune dette ne disparaît, aucun paiement n'est empêché.
--
-- 🟥 QUESTION OUVERTE, POSÉE À LA DIRECTION (voir le Rapport 18) : ADIKOM
-- reçoit-elle, en pratique, plusieurs factures pour une même commande
-- fournisseur — acompte puis solde ? Si oui, l'extension est connue et additive,
-- et rien ici ne l'empêche. AUCUNE OPTION N'EST CHOISIE D'OFFICE : la règle
-- appliquée est celle que l'architecture documentée impose aujourd'hui.
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- TROIS FONCTIONS EXISTANTES SONT ÉTENDUES, AUCUNE N'EST REMPLACÉE
--
-- Chacune est reprise de SA DERNIÈRE VERSION ACTIVE — et non de celle de la
-- migration qui l'a créée. La leçon du LOT 22 : « une policy réécrite se reprend
-- à sa dernière version ». `fn_supplier_invoice_transition` a été révisée par la
-- migration 052 (banques et règlements) : c'est CETTE version qui est reprise,
-- refus de `PAID`/`PARTIALLY_PAID` compris.
--
-- 🟥 AUCUNE ÉCRITURE DE TRÉSORERIE. Créer un devis, retenir une offre, passer
-- une commande, préparer une facture : aucun de ces actes ne meut un compte. La
-- trésorerie ne bouge qu'au RÈGLEMENT, par `record_supplier_payment`, inchangée.
-- Et une IMPUTATION n'est toujours pas un paiement (CLAUDE.md §57).
--
-- AUCUNE CAPACITÉ NOUVELLE. Enregistrer la facture d'une commande relève de
-- `billing.supplier_invoices.create`, qui existe depuis la migration 007. En
-- créer une seconde serait deux vérités sur le même acte (CLAUDE.md §19 bis).
-- Catalogue : 229, inchangé.
-- =============================================================================


-- =============================================================================
-- 1. LES COLONNES — Plan 02 §9.2, toutes NULLABLES
--
-- Aucune donnée existante n'est modifiée : les factures fournisseurs déjà en
-- base reçoivent `NULL` partout et se comportent exactement comme avant.
--
-- 🟥 QUATRE COLONNES SUR LA LIGNE, ET PAS UNE CINQUIÈME. Le Plan 02 §9.2 énumère
-- pour `supplier_invoice_lines` : `service_id`, `service_variant_id`,
-- `quantity`, `unit_price`. Il ne prévoit PAS de `source_order_line_id`, là où il
-- en prévoit un pour `customer_invoice_lines`. Ce n'est pas repris par
-- ressemblance : l'origine d'une facture fournisseur est portée par son en-tête
-- (`purchase_order_id`), et une facture reçue peut légitimement porter des
-- lignes que la commande n'avait pas — un lien ligne à ligne y serait vrai pour
-- certaines et faux pour d'autres. La limite est nommée au Rapport 18.
-- =============================================================================

alter table public.supplier_invoices
  add column if not exists purchase_order_id uuid
    references public.purchase_orders (id) on delete restrict;

comment on column public.supplier_invoices.purchase_order_id is
  'Commande fournisseur dont cette facture est née (LOT 26). NULL pour une facture reçue sans commande enregistrée.';

create index if not exists supplier_invoices_purchase_order_idx
  on public.supplier_invoices (purchase_order_id)
  where purchase_order_id is not null;


alter table public.supplier_invoice_lines
  add column if not exists service_id uuid
    references public.services (id) on delete restrict;

alter table public.supplier_invoice_lines
  add column if not exists service_variant_id uuid
    references public.service_variants (id) on delete restrict;

alter table public.supplier_invoice_lines
  add column if not exists quantity integer;

alter table public.supplier_invoice_lines
  add column if not exists unit_price bigint;

comment on column public.supplier_invoice_lines.service_id is
  'Service du catalogue porté par la ligne (LOT 26). NULL pour une ligne de véhicule, de frais ou libre.';
comment on column public.supplier_invoice_lines.quantity is
  'Décomposition facultative du montant. `amount` reste l''unique source du brut : la base vérifie leur cohérence.';
comment on column public.supplier_invoice_lines.unit_price is
  'Prix unitaire facturé par le fournisseur. Facultatif : une facture reçue sans décomposition reste une facture.';

/*
 * 🟥 `amount` RESTE L'UNIQUE SOURCE DU MONTANT BRUT — D1, Plan 01 §15.5.
 *
 * « Ajouter `quantity` et `unit_price` créerait DEUX SOURCES DU MÊME CHIFFRE —
 * exactement ce que D1 refuse. Solution : `quantity` et `unit_price` nullables,
 * plus une contrainte. »
 *
 * `supplier_invoice_gross` n'est pas touchée : elle somme toujours `amount`, et
 * elle seule. La décomposition, QUAND ELLE EXISTE, est vérifiée par la base —
 * c'est la garantie que le Plan 02 §18.2 exige nommément du LOT 26 :
 * « `amount = quantity × unit_price` GARANTI PAR LA BASE ».
 *
 * `quantity::bigint` : sans cette conversion, `integer * bigint` déborderait
 * d'abord en `integer` sur certains chemins de planification.
 */
do $$ begin
  alter table public.supplier_invoice_lines
    add constraint supplier_invoice_lines_amount_consistent check (
      (quantity is null and unit_price is null)
      or (quantity is not null and unit_price is not null
          and quantity > 0 and unit_price > 0
          and amount = quantity::bigint * unit_price)
    );
exception when duplicate_object then null; end $$;

-- Même garantie qu'au §3 de la 097 : la variante appartient bien à son service,
-- et c'est la BASE qui le dit — pas un déclencheur qui lirait à travers RLS.
do $$ begin
  alter table public.supplier_invoice_lines
    add constraint supplier_invoice_lines_variant_belongs
      foreign key (service_variant_id, service_id)
      references public.service_variants (id, service_id) on delete restrict;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.supplier_invoice_lines
    add constraint supplier_invoice_lines_catalog_pair check (
      (service_id is null and service_variant_id is null)
      or (service_id is not null and service_variant_id is not null)
    );
exception when duplicate_object then null; end $$;


-- =============================================================================
-- 2. UNE COMMANDE FOURNISSEUR NE PORTE PAS DEUX FACTURES VIVANTES
--
-- La même forme que `customer_invoices_one_per_order_idx` : un index UNIQUE
-- PARTIEL, qui laisse l'annulation libérer la place.
--
-- Il fait autorité pour deux clics simultanés comme pour un `POST` direct : le
-- contrôle anticipé de `create_supplier_invoice` n'est là que pour rendre le
-- message compréhensible (CLAUDE.md §43).
-- =============================================================================

create unique index if not exists supplier_invoices_one_per_purchase_order_idx
  on public.supplier_invoices (purchase_order_id)
  where purchase_order_id is not null and status <> 'CANCELLED';


-- =============================================================================
-- 3. COHÉRENCE — la facture, sa commande, et leur fournisseur
--
-- 🟥 UN DÉCLENCHEUR NOUVEAU, ET NON UNE RÉÉCRITURE.
--
-- `supplier_invoices` ne portait aucun déclencheur de cohérence : en écrire un
-- NEUF évite d'avoir à reprendre une fonction existante, et donc le risque d'en
-- perdre une capacité au passage (LOT 22). Il ne regarde que `purchase_order_id`
-- et ne s'exécute que lorsque cette colonne est renseignée.
--
-- CE QU'IL EXIGE :
--   · la commande est PASSÉE, RÉCEPTIONNÉE ou déjà FACTURÉE — on n'enregistre
--     pas la facture d'un brouillon, ni d'une commande annulée ;
--   · le fournisseur de la facture est celui de la commande. La chaîne
--     Facture → Commande → Devis → Fournisseur ne se rompt pas.
--
-- Le dossier ne se revérifie que s'il CHANGE : rejouer ce contrôle à chaque
-- changement de statut imposerait `commerce.purchase_orders.view` à celui qui
-- valide ou annule la facture (DEC-024).
-- =============================================================================

create or replace function public.fn_supplier_invoice_purchase_coherence()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  o public.purchase_orders%rowtype;
begin
  if new.purchase_order_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.purchase_order_id is not distinct from old.purchase_order_id then
    return new;
  end if;

  select * into o from public.purchase_orders where id = new.purchase_order_id;

  -- Introuvable ou invisible : même réponse (DEC-017).
  if not found then
    raise exception
      'La commande fournisseur visée est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if not public.is_restoring() then
    if o.status not in ('CONFIRMED', 'DELIVERED', 'INVOICED') then
      raise exception
        'Opération refusée : la commande % est « % ». Seule une commande passée ou réceptionnée porte une facture.',
        o.order_no, o.status
        using errcode = 'check_violation';
    end if;
  end if;

  if o.supplier_id is distinct from new.supplier_id then
    raise exception
      'Opération refusée : cette commande n''est pas celle du fournisseur facturé. La chaîne Facture → Commande → Fournisseur ne se rompt pas.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_supplier_invoice_purchase_coherence() is
  'Une facture née d''une commande fournisseur nomme une commande passée ou réceptionnée, du MÊME fournisseur.';

revoke execute on function public.fn_supplier_invoice_purchase_coherence() from public, anon;

drop trigger if exists supplier_invoices_purchase_coherence on public.supplier_invoices;

create trigger supplier_invoices_purchase_coherence
  before insert or update on public.supplier_invoices
  for each row execute function public.fn_supplier_invoice_purchase_coherence();


-- =============================================================================
-- 4. `fn_supplier_invoice_transition` — L'ORIGINE COMMERCIALE REJOINT LE GEL
--
-- 🟥 REPRISE DE SA DERNIÈRE VERSION ACTIVE (migration 052, « banques, caisses et
-- règlements »), et NON de celle qui l'a créée (migration 048). Le refus de
-- `PAID` et `PARTIALLY_PAID` au motif qu'ils se CALCULENT — acquis du LOT 6 — y
-- est repris mot pour mot. Le contrôle final le vérifie plutôt que de l'espérer.
--
-- CE QUI CHANGE, ET RIEN D'AUTRE : `purchase_order_id` rejoint les colonnes
-- gelées après validation. Sans cela, une facture validée pourrait être
-- rattachée après coup à une autre commande — ou détachée de la sienne, laissant
-- la commande « Facturée » sans facture.
-- =============================================================================

create or replace function public.fn_supplier_invoice_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_gross   bigint;
  v_imputed bigint;
begin
  if new.status is distinct from old.status then

    if new.status in ('PARTIALLY_PAID', 'PAID') then
      raise exception
        'Opération refusée : l''état de règlement d''une facture se CALCULE des règlements enregistrés (Module 07 §55). Il ne se déclare pas — un statut écrit pourrait contredire la somme qui le dit.'
        using errcode = 'check_violation';
    end if;

    if new.status = 'OVERDUE' then
      raise exception
        'Opération refusée : « En retard » se déduit de l''échéance et de la date du jour. Ce statut ne s''écrit pas.'
        using errcode = 'check_violation';
    end if;

    case
      when old.status = 'DRAFT' and new.status = 'PENDING' then
        perform public.require_capability(
          array['billing.supplier_invoices.update'], 'soumettre une facture fournisseur au contrôle'
        );

      when old.status = 'PENDING' and new.status = 'DRAFT' then
        perform public.require_capability(
          array['billing.supplier_invoices.update'], 'remettre une facture fournisseur en saisie'
        );

      when old.status = 'PENDING' and new.status = 'VALIDATED' then
        perform public.require_capability(
          array['billing.supplier_invoices.validate'], 'valider une facture fournisseur'
        );

        v_gross := public.supplier_invoice_gross(new.id);

        if v_gross <= 0 then
          raise exception
            'Opération refusée : cette facture ne porte aucune ligne, ou ses lignes ne sont pas lisibles avec vos droits. Un montant brut est nécessaire à la validation.'
            using errcode = 'check_violation';
        end if;

      when old.status in ('DRAFT', 'PENDING', 'VALIDATED')
           and new.status = 'CANCELLED' then
        perform public.require_capability(
          array['billing.supplier_invoices.cancel'], 'annuler une facture fournisseur'
        );

        if public.current_actor() is not null
           and not public.has_permission('billing.imputations.view') then
          raise exception
            'Opération refusée : annuler une facture exige de pouvoir consulter les imputations qui la réduisent.'
            using errcode = 'insufficient_privilege';
        end if;

        v_imputed := public.supplier_invoice_imputed(new.id);

        if v_imputed > 0 then
          raise exception
            'Opération refusée : % KMF sont imputés sur cette facture. Chaque imputation doit d''abord en être détachée.', v_imputed
            using errcode = 'check_violation';
        end if;

      else
        raise exception
          'Transition de facture fournisseur refusée : % ne peut pas devenir %.', old.status, new.status
          using errcode = 'check_violation';
    end case;
  end if;

  -- COUCHE 2 — le verrou. `purchase_order_id` REJOINT LES COLONNES GELÉES :
  -- l'origine commerciale d'une dette reconnue ne se réécrit pas.
  if old.status in ('VALIDATED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')
     and (new.supplier_id       is distinct from old.supplier_id
       or new.invoice_date      is distinct from old.invoice_date
       or new.due_date          is distinct from old.due_date
       or new.external_ref      is distinct from old.external_ref
       or new.invoice_no        is distinct from old.invoice_no
       or new.purchase_order_id is distinct from old.purchase_order_id)
     and not public.is_restoring() then
    raise exception
      'Opération refusée : une facture fournisseur validée ou annulée ne se modifie plus. Son annulation, elle, conserve l''historique.'
      using errcode = 'check_violation';
  end if;

  if old.status in ('DRAFT', 'PENDING')
     and (new.supplier_id  is distinct from old.supplier_id
       or new.invoice_date is distinct from old.invoice_date
       or new.due_date     is distinct from old.due_date
       or new.external_ref is distinct from old.external_ref
       or new.notes        is distinct from old.notes) then
    perform public.require_capability(
      array['billing.supplier_invoices.update'], 'modifier une facture fournisseur'
    );
  end if;

  return new;
end;
$$;

comment on function public.fn_supplier_invoice_transition is
  'Chaque transition exige SA capacité. « Payée », « Partiellement payée » et « En retard » se calculent : aucune ne s''écrit. L''origine commerciale est gelée avec la dette.';


-- =============================================================================
-- 5. `create_supplier_invoice` — un paramètre de plus, en dernier
--
-- REPRISE DE SA DERNIÈRE VERSION ACTIVE (migration 048). Aucun contrôle n'est
-- retiré : la capacité `parties.suppliers.view`, l'acceptation d'un fournisseur
-- inactif (DEC-027 §i), la naissance en brouillon — tout y est, à l'identique.
--
-- ⚠ LE PARAMÈTRE DE PLUS CRÉE UNE SURCHARGE, PAS UN REMPLACEMENT.
--
-- `create or replace` ne remplace que la fonction de MÊME signature. Laisser les
-- deux versions coexister rendrait tout appel par paramètres nommés AMBIGU —
-- PostgreSQL refuserait alors chaque facture avec « function is not unique ».
-- L'ancienne est donc retirée, exactement comme au LOT 25 (migration 098).
-- =============================================================================

drop function if exists public.create_supplier_invoice(uuid, date, date, text, text);

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
   * Contrôle anticipé, pour un message compréhensible (CLAUDE.md §43). L'index
   * unique partiel fait autorité, y compris pour un appel qui ne passerait pas
   * par ici et pour deux saisies simultanées.
   */
  if p_purchase_order_id is not null then
    select i.invoice_no into v_no
    from public.supplier_invoices i
    where i.purchase_order_id = p_purchase_order_id and i.status <> 'CANCELLED'
    limit 1;

    if v_no is not null then
      raise exception
        'Opération refusée : cette commande est déjà couverte par la facture %. Une facture reçue pour un complément s''enregistre sans commande d''origine.',
        v_no
        using errcode = 'unique_violation';
    end if;
  end if;

  v_no := public.next_number('supplier_invoice');

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

  return v_id;
end;
$$;

comment on function public.create_supplier_invoice(uuid, date, date, text, text, uuid) is
  'Enregistre une facture REÇUE, en brouillon (DEC-007). Ne génère aucun montant et ne crée ni imputation ni paiement.';

revoke execute on function public.create_supplier_invoice(uuid, date, date, text, text, uuid) from public, anon;
grant  execute on function public.create_supplier_invoice(uuid, date, date, text, text, uuid) to authenticated, service_role;


-- =============================================================================
-- 6. `add_supplier_invoice_line` — la décomposition, et la traçabilité
--
-- REPRISE DE SA DERNIÈRE VERSION ACTIVE (migration 048). Aucun contrôle n'est
-- retiré.
--
-- 🟥 LE MONTANT EST CALCULÉ, JAMAIS FOURNI DEUX FOIS — Plan 01 §15.5 : « La
-- fonction d'ajout de ligne calcule `amount` et ne laisse pas le choix. »
--
--   · décomposition donnée  → `amount := quantity × unit_price`, et `p_amount`
--     est REFUSÉ. Deux sources du même chiffre pourraient diverger (D1) ;
--   · décomposition absente → `p_amount` est obligatoire, comme avant. Une
--     facture reçue « forfait aménagement : 350 000 » n'a pas de quantité.
--
-- ⚠ Même précaution qu'au §5 : l'ancienne signature est retirée, sans quoi les
-- deux versions rendraient tout appel par paramètres nommés ambigu.
-- =============================================================================

drop function if exists public.add_supplier_invoice_line(uuid, text, bigint, uuid);

create or replace function public.add_supplier_invoice_line(
  p_invoice_id uuid,
  p_label      text,
  p_amount     bigint default null,
  p_vehicle_id uuid default null,
  p_quantity   integer default null,
  p_unit_price bigint default null,
  p_service_id uuid default null,
  p_variant_id uuid default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_status public.supplier_invoice_status;
  v_amount bigint;
begin
  perform public.require_capability(
    array['billing.supplier_invoices.create', 'billing.supplier_invoices.update'],
    'ajouter une ligne à une facture fournisseur'
  );
  perform public.require_capability(
    array['billing.supplier_invoices.view'], 'consulter la facture à compléter'
  );

  if coalesce(btrim(p_label), '') = '' then
    raise exception 'Chaque ligne doit être désignée.' using errcode = 'check_violation';
  end if;

  /* ---------- LE MONTANT : UNE SOURCE, ET UNE SEULE (D1) ------------------- */
  if p_quantity is not null or p_unit_price is not null then
    if p_quantity is null or p_quantity <= 0 then
      raise exception 'La quantité doit être un entier positif.'
        using errcode = 'check_violation';
    end if;

    if p_unit_price is null or p_unit_price <= 0 then
      raise exception 'Le prix unitaire doit être un entier positif, en KMF (DEC-010).'
        using errcode = 'check_violation';
    end if;

    if p_amount is not null then
      raise exception
        'Opération refusée : le montant d''une ligne décomposée est calculé, jamais fourni. Deux sources du même chiffre pourraient diverger (D1).'
        using errcode = 'check_violation';
    end if;

    v_amount := p_quantity::bigint * p_unit_price;
  else
    if p_amount is null or p_amount <= 0 then
      raise exception 'Le montant d''une ligne doit être un entier positif, en KMF.'
        using errcode = 'check_violation';
    end if;

    v_amount := p_amount;
  end if;

  select i.status into v_status from public.supplier_invoices i where i.id = p_invoice_id;

  if v_status is null then
    raise exception
      'La facture visée est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if v_status not in ('DRAFT', 'PENDING') then
    raise exception
      'Opération refusée : les lignes d''une facture validée ou annulée sont figées.'
      using errcode = 'check_violation';
  end if;

  -- Nommer un service suppose le droit de le consulter. La contrainte
  -- `supplier_invoice_lines_variant_belongs` garantit, elle, que la variante
  -- appartient bien à ce service.
  if p_service_id is not null then
    perform public.require_capability(
      array['catalog.services.view'], 'consulter le service porté par la ligne'
    );
  end if;

  insert into public.supplier_invoice_lines
    (supplier_invoice_id, label, amount, vehicle_id,
     quantity, unit_price, service_id, service_variant_id,
     created_by, updated_by)
  values
    (p_invoice_id, btrim(p_label), v_amount, p_vehicle_id,
     p_quantity, p_unit_price, p_service_id, p_variant_id,
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.add_supplier_invoice_line(uuid, text, bigint, uuid, integer, bigint, uuid, uuid) is
  'Ajoute une ligne à une facture en saisie. La somme des `amount` actifs EST le montant brut ; la décomposition, quand elle existe, est vérifiée par la base.';

revoke execute on function
  public.add_supplier_invoice_line(uuid, text, bigint, uuid, integer, bigint, uuid, uuid)
  from public, anon;
grant  execute on function
  public.add_supplier_invoice_line(uuid, text, bigint, uuid, integer, bigint, uuid, uuid)
  to authenticated, service_role;


-- =============================================================================
-- 7. `cancel_supplier_invoice` — la commande revient à « Passée »
--
-- REPRISE DE SA DERNIÈRE VERSION ACTIVE (migration 048).
--
-- Sans ce retour, une facture annulée par erreur laisserait la commande
-- « Facturée » pour toujours : l'index partiel, lui, se libère — et la commande
-- serait facturable sans jamais cesser d'être facturée. Les deux doivent bouger
-- ensemble, exactement comme au LOT 25.
-- =============================================================================

create or replace function public.cancel_supplier_invoice(
  p_invoice_id uuid,
  p_reason     text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  f         public.supplier_invoices%rowtype;
  v_ostatus public.order_status;
begin
  perform public.require_capability(
    array['billing.supplier_invoices.cancel'], 'annuler une facture fournisseur'
  );
  perform public.require_capability(
    array['billing.supplier_invoices.view'], 'consulter la facture à annuler'
  );

  select * into f from public.supplier_invoices where id = p_invoice_id for update;

  if not found then
    raise exception 'Facture fournisseur introuvable.' using errcode = 'no_data_found';
  end if;

  if f.status = 'CANCELLED' then
    raise exception
      'Opération refusée : cette facture est déjà annulée.'
      using errcode = 'check_violation';
  end if;

  if f.purchase_order_id is not null then
    perform public.require_capability(
      array['commerce.purchase_orders.view'], 'consulter la commande que cette facture engage'
    );

    select o.status into v_ostatus
    from public.purchase_orders o where o.id = f.purchase_order_id;

    if v_ostatus is null then
      raise exception
        'La commande de cette facture est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;
  end if;

  -- Les déclencheurs refont les contrôles des imputations et des règlements
  -- rattachés, et ce sont eux qui font autorité, y compris pour un appel qui ne
  -- passerait pas par ici.
  update public.supplier_invoices
     set status            = 'CANCELLED',
         cancelled_at      = now(),
         cancelled_by      = public.current_actor(),
         status_reason     = nullif(btrim(coalesce(p_reason, '')), ''),
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = f.id;

  -- LOT 26 : la commande redevient « Passée » et se facture de nouveau.
  if f.purchase_order_id is not null and v_ostatus = 'INVOICED' then
    update public.purchase_orders
       set status            = 'CONFIRMED',
           invoiced_at       = null,
           invoiced_by       = null,
           status_reason     = 'Facture ' || f.invoice_no || ' annulée',
           status_changed_at = now(),
           status_changed_by = public.current_actor(),
           updated_by        = public.current_actor()
     where id = f.purchase_order_id
       and status = 'INVOICED';
  end if;
end;
$$;

comment on function public.cancel_supplier_invoice(uuid, text) is
  'Annule une facture sans l''effacer. Refusée tant qu''une imputation ou un règlement la touche. Rend sa commande d''origine à « passée ».';

revoke execute on function public.cancel_supplier_invoice(uuid, text) from public, anon;
grant  execute on function public.cancel_supplier_invoice(uuid, text) to authenticated, service_role;


-- =============================================================================
-- 8. L'ORCHESTRATEUR — `create_invoice_from_purchase_order`
--
-- Elle N'ÉCRIT RIEN elle-même dans `supplier_invoices` : elle appelle les deux
-- fonctions existantes, qui portent déjà leurs cinq couches de contrôle. C'est ce
-- qui garantit qu'une facture née d'une commande est en tous points une facture
-- fournisseur ordinaire.
--
-- CAPACITÉS EXIGÉES — la symétrie de `create_invoice_from_sales_order` :
--   `commerce.purchase_orders.view`      elle lit la commande
--   `billing.supplier_invoices.create`   elle prépare la facture
--   `billing.supplier_invoices.view`     elle la relit
--   `parties.suppliers.view`             elle enregistre la dette d'un fournisseur
--
-- 🟥 ELLE N'EXIGE NI `submit` NI `validate` : RECONNAÎTRE LA DETTE RESTE UN ACTE
-- DISTINCT. La facture naît en BROUILLON, se relit, se corrige — le fournisseur
-- a pu facturer autre chose que ce qui était commandé —, puis se soumet et se
-- valide depuis l'écran de facturation fournisseur, sous
-- `billing.supplier_invoices.update` et `.validate`.
--
-- 🟥 ELLE NE RELIT PAS LE CATALOGUE. Chaque ligne active est recopiée telle
-- quelle depuis la commande. Le coût de référence du catalogue n'intervient à
-- aucun moment de la chaîne (P-5 reste ouvert).
--
-- 🟥 ELLE NE MEUT AUCUN COMPTE. Aucune écriture de trésorerie, aucune imputation.
-- La facture préparée est une DETTE À RECONNAÎTRE, pas un paiement (§57).
-- =============================================================================

create or replace function public.create_invoice_from_purchase_order(
  p_order_id     uuid,
  p_invoice_date date default null,
  p_due_date     date default null,
  p_external_ref text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  o       public.purchase_orders%rowtype;
  l       record;
  v_id    uuid;
  v_date  date;
  v_count int := 0;
begin
  perform public.require_capability(
    array['commerce.purchase_orders.view'], 'consulter la commande à facturer');
  perform public.require_capability(
    array['billing.supplier_invoices.create'], 'enregistrer la facture de la commande');
  perform public.require_capability(
    array['billing.supplier_invoices.view'], 'consulter la facture enregistrée');
  perform public.require_capability(
    array['parties.suppliers.view'], 'consulter le fournisseur facturant');

  select * into o from public.purchase_orders where id = p_order_id for update;

  if not found then
    raise exception 'Commande fournisseur introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if o.status = 'INVOICED' then
    raise exception
      'Opération refusée : cette commande porte déjà une facture. Une facture reçue pour un complément s''enregistre sans commande d''origine.'
      using errcode = 'unique_violation';
  end if;

  if o.status not in ('CONFIRMED', 'DELIVERED') then
    raise exception
      'Opération refusée : seule une commande passée ou réceptionnée se facture. Celle-ci est « % ».', o.status
      using errcode = 'check_violation';
  end if;

  -- Le jour est celui d'ADIKOM (UTC+3), jamais celui du serveur.
  v_date := coalesce(p_invoice_date, (now() at time zone 'Indian/Comoro')::date);

  if p_due_date is not null and p_due_date < v_date then
    raise exception 'L''échéance ne peut pas précéder la date de la facture.'
      using errcode = 'check_violation';
  end if;

  v_id := public.create_supplier_invoice(
    p_supplier_id       => o.supplier_id,
    p_invoice_date      => v_date,
    p_due_date          => p_due_date,
    -- La référence du fournisseur sur SA facture — distincte de celle de son
    -- devis, et distincte du numéro interne d'ADIKOM (Module 07 §30).
    p_external_ref      => p_external_ref,
    p_notes             => 'Commande ' || o.order_no,
    p_purchase_order_id => o.id
  );

  for l in
    select id, label, quantity, unit_price, service_id, service_variant_id
    from public.purchase_order_lines
    where purchase_order_id = o.id and is_archived = false
    order by created_at
  loop
    perform public.add_supplier_invoice_line(
      p_invoice_id => v_id,
      p_label      => l.label,
      -- `p_amount` reste NUL : la décomposition le calcule (§6).
      p_amount     => null,
      p_vehicle_id => null,
      p_quantity   => l.quantity,
      p_unit_price => l.unit_price,
      p_service_id => l.service_id,
      p_variant_id => l.service_variant_id
    );
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception
      'Opération refusée : cette commande ne porte aucune ligne active, ou ses lignes ne sont pas lisibles avec vos droits. La facture serait vide.'
      using errcode = 'check_violation';
  end if;

  update public.purchase_orders
     set status            = 'INVOICED',
         invoiced_at       = now(),
         invoiced_by       = public.current_actor(),
         status_reason     = 'Facture enregistrée',
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = o.id;

  return v_id;
end;
$$;

comment on function public.create_invoice_from_purchase_order(uuid, date, date, text) is
  'Prépare une facture fournisseur À PARTIR des fonctions existantes. Elle naît en brouillon : la soumettre et la valider restent des actes distincts.';

revoke execute on function public.create_invoice_from_purchase_order(uuid, date, date, text) from public, anon;
grant  execute on function public.create_invoice_from_purchase_order(uuid, date, date, text) to authenticated, service_role;


-- =============================================================================
-- 9. CONTRÔLES
-- =============================================================================

do $$
declare
  v_col text;
  v_def text;
begin
  -- Les cinq colonnes du Plan 02 §9.2, et pas une de plus.
  foreach v_col in array array[
    'supplier_invoices.purchase_order_id',
    'supplier_invoice_lines.service_id',
    'supplier_invoice_lines.service_variant_id',
    'supplier_invoice_lines.quantity',
    'supplier_invoice_lines.unit_price'
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
   * 🟥 AUCUNE COLONNE DE COÛT DE CATALOGUE NI DE MARGE sur la ligne de facture
   * fournisseur. `unit_price` est le prix FACTURÉ ; recopier
   * `service_variant_costs` ferait de la facture une seconde source du coût de
   * référence, et trancherait P-5 par un effet de bord.
   */
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'supplier_invoice_lines'
      and (column_name like '%cost%' or column_name like '%margin%')
  ) then
    raise exception
      'Une colonne de coût de catalogue ou de marge figure sur `supplier_invoice_lines`.';
  end if;

  -- 🟥 `amount = quantity × unit_price` GARANTI PAR LA BASE — Plan 02 §18.2.
  if not exists (
    select 1 from pg_constraint
    where conname = 'supplier_invoice_lines_amount_consistent' and contype = 'c'
  ) then
    raise exception
      'La cohérence « montant = quantité × prix unitaire » n''est pas garantie par la base (Plan 02 §18.2).';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'supplier_invoice_lines_variant_belongs' and contype = 'f'
  ) then
    raise exception
      'La garantie « la variante appartient à son service » est absente de `supplier_invoice_lines`.';
  end if;

  -- Une commande ne porte pas deux factures vivantes.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'supplier_invoices_one_per_purchase_order_idx'
  ) then
    raise exception
      'L''index d''unicité « une facture par commande fournisseur » est absent.';
  end if;

  /*
   * LES ACQUIS DU LOT 6 SONT TOUJOURS LÀ.
   *
   * `fn_supplier_invoice_transition` est RÉÉCRITE ENTIÈRE. Le refus de `PAID` et
   * `PARTIALLY_PAID` au motif qu'ils se CALCULENT est un acquis de la
   * migration 052 : le perdre rouvrirait la possibilité de DÉCLARER une facture
   * payée sans qu'aucun règlement n'existe.
   *
   * ⚠ Les motifs évitent l'apostrophe : `pg_get_functiondef` rend le corps TEL
   * QU'IL EST ÉCRIT, avec ses apostrophes doublées (leçon de la migration 100).
   */
  select pg_get_functiondef('public.fn_supplier_invoice_transition()'::regprocedure) into v_def;

  if v_def not like '%se CALCULE des règlements enregistrés%' then
    raise exception
      'Le refus de déclarer une facture payée a disparu : un acquis du LOT 6 serait perdu.';
  end if;

  if v_def not like '%En retard%se déduit de%'
     or v_def not like '%billing.supplier_invoices.validate%'
     or v_def not like '%billing.supplier_invoices.cancel%'
     or v_def not like '%billing.imputations.view%'
     or v_def not like '%supplier_invoice_imputed%'
     or v_def not like '%supplier_invoice_gross%' then
    raise exception
      'Une capacité ou un contrôle du cycle de la facture fournisseur a disparu.';
  end if;

  if v_def not like '%new.purchase_order_id%is distinct from old.purchase_order_id%' then
    raise exception
      'L''origine commerciale d''une facture validée n''est pas gelée : elle pourrait être rattachée après coup à une autre commande.';
  end if;

  -- Le déclencheur de non-annulation d'une facture réglée (LOT 6) est intact.
  if not exists (
    select 1 from pg_trigger
    where tgname = 'supplier_invoices_zz_no_cancel_when_paid' and not tgisinternal
  ) then
    raise exception
      'Le refus d''annuler une facture réglée a disparu : un acquis du LOT 6 serait perdu.';
  end if;

  -- Le déclencheur de cohérence commerciale est en place.
  if not exists (
    select 1 from pg_trigger
    where tgname = 'supplier_invoices_purchase_coherence' and not tgisinternal
  ) then
    raise exception 'Le déclencheur de cohérence de la commande fournisseur est absent.';
  end if;

  -- `backup_columns` reprend les colonnes d'elle-même : vérifié, pas supposé.
  if public.backup_columns('supplier_invoices') not like '%purchase_order_id%' then
    raise exception
      '`backup_columns` ignore `supplier_invoices.purchase_order_id` : la facture reviendrait détachée de sa commande.';
  end if;

  if public.backup_columns('supplier_invoice_lines') not like '%unit_price%' then
    raise exception
      '`backup_columns` ignore la décomposition des lignes de facture fournisseur.';
  end if;

  -- DOCTRINE D4.
  if exists (
    select 1 from pg_proc
    where oid in (
      'public.create_invoice_from_purchase_order(uuid, date, date, text)'::regprocedure,
      'public.create_supplier_invoice(uuid, date, date, text, text, uuid)'::regprocedure,
      'public.add_supplier_invoice_line(uuid, text, bigint, uuid, integer, bigint, uuid, uuid)'::regprocedure,
      'public.cancel_supplier_invoice(uuid, text)'::regprocedure,
      'public.fn_supplier_invoice_purchase_coherence()'::regprocedure
    )
    and prosecdef
  ) then
    raise exception 'Une fonction de facturation fournisseur est SECURITY DEFINER (doctrine D4).';
  end if;

  /*
   * ⚠ UNE SEULE VERSION DE CHAQUE FONCTION ÉTENDUE.
   *
   * Deux surcharges coexistantes rendraient tout appel par paramètres nommés
   * ambigu, et PostgreSQL refuserait chaque facture avec « function is not
   * unique » — une panne totale de la facturation fournisseur, découverte en
   * production.
   */
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_supplier_invoice') <> 1 then
    raise exception
      'Plusieurs versions de `create_supplier_invoice` coexistent : les appels par paramètres nommés deviendraient ambigus.';
  end if;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'add_supplier_invoice_line') <> 1 then
    raise exception
      'Plusieurs versions de `add_supplier_invoice_line` coexistent : les appels par paramètres nommés deviendraient ambigus.';
  end if;

  -- 🟥 AUCUNE ORIGINE DE TRÉSORERIE N'EST AJOUTÉE. Un devis, une commande ou une
  -- facture préparée ne meuvent aucun compte : la trésorerie ne connaît que les
  -- règlements, et ce lot n'y touche pas.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'treasury_entries'
      and column_name in ('purchase_order_id', 'purchase_quote_id')
  ) then
    raise exception
      'La trésorerie a reçu une origine commerciale d''achat : un devis ou une commande ne meut aucun compte (§57).';
  end if;

  -- AUCUNE CAPACITÉ NOUVELLE : facturer une commande réemploie celles du LOT 5.
  if (select count(*) from public.permissions) <> 229 then
    raise exception 'Le catalogue a bougé : cette migration ne crée aucune capacité.';
  end if;

  raise notice
    '[OK] 102. La commande fournisseur alimente la facturation EXISTANTE. Une commande, au plus une facture non annulée. Aucune écriture de trésorerie.';
end $$;
