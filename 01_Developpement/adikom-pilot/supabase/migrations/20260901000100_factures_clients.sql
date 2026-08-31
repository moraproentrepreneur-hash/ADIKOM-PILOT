-- =============================================================================
-- ADIKOM PILOT — 052 · Facture client, et la clôture de la location
-- Étape 2.5 (DEC-021), LOT 7
--
-- CE QUE CETTE MIGRATION POSE
--
-- Le dernier maillon du cycle d'exploitation. La migration 042 avait laissé
-- deux transitions SANS capacité rattachée, et l'avait écrit :
--
--   « `INVOICED` et `CLOSED` appartiennent à l'Étape 2.5 : aucune capacité ne
--   leur correspond, et en désigner une serait inventer une règle. Elles
--   restent protégées par la seule policy — point ouvert, signalé. »
--
-- Le point se referme ici : la facture client existe, et c'est son ÉMISSION qui
-- rend une location « Facturée ». La clôture, elle, reste l'acte d'exploitation
-- que `rental.rentals.close` porte déjà.
--
-- LES TROIS MONTANTS, ET LEUR SOURCE UNIQUE
--
--   Sous-total    Σ des lignes actives qui AJOUTENT (location, service, frais).
--   Réductions    Σ des lignes actives de type « réduction » (§23, §24).
--   Total         Sous-total − réductions (§23).
--   Montant réglé N'EXISTE PAS ENCORE — les règlements CLIENTS relèvent du lot
--                 suivant. Aucun zéro n'est affiché à sa place : l'écran DIT
--                 qu'aucun encaissement n'est géré.
--
-- AUCUN DE CES MONTANTS N'EST STOCKÉ. Chacun est une somme refaite à la
-- lecture, comme le montant brut d'une facture fournisseur au LOT 5.
--
-- LA VALORISATION NE S'INVENTE PAS
--
--   Workflow 07 §9  : « Les règles de calcul doivent être définies
--                     explicitement et ne doivent pas être inventées par le
--                     système. »
--   §12             : « Le système ne doit pas inventer automatiquement un
--                     montant sans règle tarifaire définie. »
--
-- Le TARIF est repris de la location — il y est verrouillé depuis sa création
-- (§7, §8). La QUANTITÉ, elle, est saisie : la durée facturable dépend d'une
-- règle d'arrondi qui n'est pas arrêtée (DEC-008 — jour entamé, heure de retour,
-- franchise, tous « non définis »). Proposer un nombre de jours reviendrait à
-- trancher cette règle en silence.
--
-- CE QUE CE LOT NE FAIT PAS
--
--   · AUCUN RÈGLEMENT CLIENT, aucun encaissement, aucun solde client.
--     `PARTIALLY_PAID` et `PAID` figurent à l'énumération par fidélité à
--     Workflow 07 §27, et les transitions qui y mènent sont REFUSÉES, avec leur
--     motif — même traitement qu'« Imputée » au LOT 4 et que « Payée » au LOT 5.
--   · AUCUN AVOIR (§44), aucune contrepassation (§43). Le document renvoie la
--     méthode exacte aux « règles de gestion retenues par ADIKOM » : les
--     inventer serait précisément ce que CLAUDE.md §55 interdit. L'ANNULATION
--     est livrée, elle est documentée (§43, §46), et elle est réversible pour
--     la location — sans quoi une facture émise par erreur enfermerait le
--     contrat dans « Facturée » pour toujours.
--   · AUCUNE TAXE (DEC-014 : régime non défini). Les lignes portent une
--     quantité et un prix unitaire, pas une base et un taux.
--   · AUCUN DOCUMENT. `billing.customer_invoices.print` existe au catalogue,
--     mais PAS `.download`. DEC-024 interdit de déduire l'une de l'autre :
--     produire le PDF d'une facture client suppose une permission qui n'existe
--     pas, et la créer d'office est proscrit. Point signalé, non tranché.
--   · AUCUN CHANGEMENT DE FORMAT DE NUMÉROTATION. `customer_invoice` →
--     `FAC-C`, année, six chiffres, remise à zéro annuelle, enregistrée depuis
--     la migration 005 et jamais consommée. DEC-023 §4 réserve la convention
--     définitive à la validation du responsable comptable d'ADIKOM.
--   · AUCUNE PERMISSION NOUVELLE. Les sept codes `billing.customer_invoices.*`
--     existent depuis la migration 007. Catalogue : 153, inchangé.
--
-- LES CINQ COUCHES DE L'AUDIT 041–042, RECONDUITES
--
--   1. FONCTION   — chaque acte vérifie SA capacité par `require_capability`.
--   2. DONNÉE     — une facture émise fige son en-tête et ses lignes.
--   3. TRANSITION — chaque changement de statut exige la capacité qui le
--                   légitime, ce qui couvre le `PATCH` direct hors fonction.
--   4. RLS        — lecture, création, modification, émission, annulation.
--   5. ÉTAT DE DÉPART — une facture naît en brouillon, y compris par `INSERT`
--                   direct, que le déclencheur de transition ne verrait pas.
--
-- Aucune fonction n'est `SECURITY DEFINER` (DEC-022, DEC-026 §f).
-- =============================================================================


-- --- Types ------------------------------------------------------------------------
--
-- Workflow 07 §27 — les six statuts recommandés, dans leur ordre, et rien de plus.
--
-- Trois ne sont pas atteignables aujourd'hui, et le disent :
--
--   `OVERDUE`  DÉRIVÉ, jamais écrit. Le projet ne dispose d'aucun ordonnanceur
--              (DEC-025 §a). Il se calcule de l'échéance, du reste dû et de la
--              date du jour, sur `Indian/Comoro` (DEC-025 §e).
--   `PARTIALLY_PAID`, `PAID`  supposent des RÈGLEMENTS CLIENTS, qui n'existent
--              pas. §61 : « Le statut doit être calculé à partir des règlements
--              réellement enregistrés. » Les transitions sont refusées.

do $$ begin
  create type public.customer_invoice_status as enum (
    'DRAFT',           -- Brouillon           — §25, librement modifiable
    'ISSUED',          -- Émise               — §26, créance reconnue et figée
    'PARTIALLY_PAID',  -- Partiellement payée — exige des règlements : LOT SUIVANT
    'PAID',            -- Payée               — exige des règlements : LOT SUIVANT
    'OVERDUE',         -- En retard           — dérivé, jamais écrit (DEC-025 §a)
    'CANCELLED'        -- Annulée             — historisée, jamais supprimée
  );
exception when duplicate_object then null; end $$;


/*
 * LA NATURE D'UNE LIGNE — Workflow 07 §14, §15, §22, §24.
 *
 * §24 : « Une réduction accordée au client doit être identifiable. Elle ne doit
 * pas simplement apparaître comme une modification inexplicable du prix. »
 *
 * Une réduction n'est donc PAS un prix qu'on baisse en silence : c'est une
 * ligne, de nature distincte, qui se soustrait. Le montant y reste POSITIF —
 * le SENS est porté par la nature, jamais par le signe, exactement comme une
 * écriture de trésorerie porte son sens et non un montant négatif (Module 06
 * §19).
 */
do $$ begin
  create type public.customer_invoice_line_kind as enum (
    'RENTAL',    -- la location elle-même (§18, §22)
    'SERVICE',   -- service supplémentaire (§14)
    'FEE',       -- frais validé : retard, carburant, dommage, équipement (§15)
    'DISCOUNT'   -- réduction identifiable (§24) — se SOUSTRAIT
  );
exception when duplicate_object then null; end $$;


-- =============================================================================
-- LES FACTURES CLIENTS
-- =============================================================================

create table public.customer_invoices (
  id uuid primary key default gen_random_uuid(),

  -- §19 : « Chaque facture doit disposer d'un numéro unique. » FAC-C-2026-000001,
  -- règle `customer_invoice` de `numbering_rules`, migration 005.
  invoice_no text not null unique,

  -- §6 : « La facture doit être liée au client enregistré dans le module Tiers.
  -- Il ne faut pas recréer manuellement le client dans chaque facture. »
  client_id uuid not null references public.clients (id) on delete restrict,

  /*
   * §49 : « Une facture issue d'une location doit permettre de retrouver la
   * location. » Le lien est FACULTATIF : §4 prévoit qu'une facture client
   * puisse naître de services ou de prestations sans location — « Dans le cadre
   * du MVP, la location constitue la principale source », pas la seule.
   */
  rental_id uuid references public.rentals (id) on delete restrict,

  -- §20 : la date d'émission, conservée. §21 : l'échéance, facultative.
  -- `date` et non `timestamptz` : une échéance est un jour du calendrier.
  invoice_date date not null,
  due_date     date,

  currency_code text not null default 'KMF',

  notes text,

  status public.customer_invoice_status not null default 'DRAFT',

  issued_at    timestamptz,
  issued_by    uuid references public.app_users (id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.app_users (id) on delete set null,

  status_reason     text,
  status_changed_at timestamptz,
  status_changed_by uuid references public.app_users (id) on delete set null,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  -- Une échéance antérieure à la facture est une erreur de saisie, jamais une
  -- règle métier (§21).
  constraint customer_invoices_due_after_date check (
    due_date is null or due_date >= invoice_date
  ),

  -- DEC-025 §a : « En retard » se calcule, ne se stocke pas. La contrainte rend
  -- la règle infalsifiable, y compris par `PATCH` direct.
  constraint customer_invoices_overdue_is_derived check (status <> 'OVERDUE'),

  -- §26 : une facture émise « reçoit son numéro définitif, sa date est
  -- enregistrée ». Un état atteint sans date d'effet est un acte que personne
  -- ne peut situer.
  constraint customer_invoices_issuance_dated check (
    status not in ('ISSUED', 'PARTIALLY_PAID', 'PAID') or issued_at is not null
  ),
  constraint customer_invoices_cancellation_dated check (
    status <> 'CANCELLED' or cancelled_at is not null
  )
);

comment on table public.customer_invoices is
  'Créance d''ADIKOM sur un client (Workflow 07 §3). Sous-total, réductions et total sont des sommes recalculées, jamais des colonnes.';
comment on column public.customer_invoices.invoice_no is
  'Numéro unique (§19). Format paramétrable : DEC-023 §4 réserve la convention définitive à la validation comptable.';
comment on column public.customer_invoices.rental_id is
  'Location facturée (§49). Facultatif : §4 admet une facture de services sans location. Son émission rend la location « Facturée ».';
comment on column public.customer_invoices.status is
  'Workflow 07 §27. « En retard » est dérivé (DEC-025 §a) ; « Payée » et « Partiellement payée » supposent des règlements clients, non gérés.';

create index customer_invoices_client_idx on public.customer_invoices (client_id, invoice_date desc);
create index customer_invoices_status_idx on public.customer_invoices (status);
create index customer_invoices_due_idx    on public.customer_invoices (due_date)
  where due_date is not null;

/*
 * UNE LOCATION NE SE FACTURE PAS DEUX FOIS.
 *
 * Le cycle de DEC-006 ne prévoit qu'un seul passage « À facturer → Facturée » :
 * une seconde facture sur le même contrat facturerait deux fois la même
 * prestation. L'index l'interdit sans dépendre d'un droit de lecture, et ferme
 * la course entre deux saisies simultanées — qu'aucun déclencheur ne peut voir
 * (leçon de DEC-028).
 *
 * Les factures ANNULÉES en sont exclues : corriger une facture émise par erreur
 * passe par son annulation puis une nouvelle saisie. Les y inclure interdirait
 * exactement la correction que la règle rend nécessaire (DEC-028).
 */
create unique index customer_invoices_one_per_rental_idx
  on public.customer_invoices (rental_id)
  where rental_id is not null and status <> 'CANCELLED';


-- =============================================================================
-- LES LIGNES — LA SEULE SOURCE DES MONTANTS
--
-- Workflow 07 §22 : « Chaque facture doit être composée de lignes clairement
-- identifiables », avec désignation, quantité, prix et total. §60 : « Le montant
-- final doit être calculé par le système. »
--
-- Le total est donc leur SOMME. Il n'est stocké nulle part : une colonne
-- `total_amount` et des lignes seraient deux sources du même chiffre, capables
-- de diverger — exactement ce que le LOT 5 a refusé pour le montant brut.
--
-- §8 : « Une facture déjà émise ne doit pas être recalculée automatiquement si
-- le tarif du client est modifié ultérieurement. » Elle ne l'est pas : après
-- émission, les lignes sont FIGÉES, sans chemin de déverrouillage. Le tarif
-- appliqué est celui qui a été saisi, et il ne bouge plus (§72).
-- =============================================================================

create table public.customer_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  customer_invoice_id uuid not null
    references public.customer_invoices (id) on delete cascade,

  kind public.customer_invoice_line_kind not null default 'SERVICE',

  label text not null,

  /*
   * §22 : « Désignation | Quantité | Prix | Total ».
   *
   * La quantité est un ENTIER : trois jours, un forfait, deux pleins. Un
   * fractionnement supposerait une règle d'arrondi de durée qui n'existe pas
   * (DEC-008), et un flottant sur un montant est proscrit (DEC-010).
   */
  quantity   integer not null default 1 check (quantity > 0),
  unit_price bigint  not null check (unit_price > 0),

  /*
   * §15 : « Le système doit conserver la justification lorsque nécessaire. »
   * Un frais de retard ou de carburant s'explique ; une ligne de location n'en
   * a pas besoin. Facultatif, donc, et jamais inventé.
   */
  justification text,

  -- Une ligne saisie par erreur se retire de la facture sans être effacée
  -- (CLAUDE.md §22), et sort alors des sommes. Même traitement qu'au LOT 5.
  is_archived boolean not null default false,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  constraint customer_invoice_lines_label_not_blank check (btrim(label) <> '')
);

comment on table public.customer_invoice_lines is
  'Lignes d''une facture client (Workflow 07 §22). Leur somme EST le total : aucune colonne ne le recopie.';
comment on column public.customer_invoice_lines.kind is
  'Nature de la ligne. « DISCOUNT » se SOUSTRAIT (§24) : le montant reste positif, c''est la nature qui porte le sens.';
comment on column public.customer_invoice_lines.is_archived is
  'Ligne retirée de la facture avant émission. Exclue des sommes, jamais effacée.';

create index customer_invoice_lines_invoice_idx
  on public.customer_invoice_lines (customer_invoice_id)
  where not is_archived;


-- =============================================================================
-- LES TROIS MONTANTS — DES FONCTIONS, PAS DES COLONNES
--
-- `SECURITY INVOKER` par défaut : les sommes sont calculées sous les droits de
-- l'appelant, RLS comprise. Un appelant sans `billing.customer_invoices.view`
-- ne lit aucune ligne et obtient 0 — raison pour laquelle chaque contrôle qui
-- s'appuie sur elles EXIGE nommément cette capacité avant de les appeler. Un
-- montant invisible n'est pas un montant nul (doctrine du LOT 4).
-- =============================================================================

create or replace function public.customer_invoice_subtotal(p_invoice_id uuid)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(l.quantity::bigint * l.unit_price), 0)::bigint
  from public.customer_invoice_lines l
  where l.customer_invoice_id = p_invoice_id
    and not l.is_archived
    and l.kind <> 'DISCOUNT';
$$;

comment on function public.customer_invoice_subtotal(uuid) is
  'Sous-total = Σ (quantité × prix) des lignes actives qui ajoutent (§23). Calculé sous les droits de l''appelant.';


create or replace function public.customer_invoice_discount(p_invoice_id uuid)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(l.quantity::bigint * l.unit_price), 0)::bigint
  from public.customer_invoice_lines l
  where l.customer_invoice_id = p_invoice_id
    and not l.is_archived
    and l.kind = 'DISCOUNT';
$$;

comment on function public.customer_invoice_discount(uuid) is
  'Σ des réductions accordées (§24). Identifiables ligne à ligne : une réduction n''est jamais un prix modifié en silence.';


create or replace function public.customer_invoice_total(p_invoice_id uuid)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $$
  select public.customer_invoice_subtotal(p_invoice_id)
       - public.customer_invoice_discount(p_invoice_id);
$$;

comment on function public.customer_invoice_total(uuid) is
  'Total = sous-total − réductions (§23). Aucun montant n''est stocké : la somme est refaite à chaque lecture.';


-- =============================================================================
-- COUCHE 5 · L'ÉTAT DE DÉPART
--
-- Un déclencheur de transition ne voit pas un `INSERT`. Sans ce contrôle, un
-- `POST` direct portant `status = 'ISSUED'` créerait une facture émise sans que
-- `billing.customer_invoices.issue` ait jamais été exigée — la policy
-- d'insertion ne demandant que `create`. Le chemin était ouvert sur
-- `imputations` jusqu'au LOT 5 ; il ne le sera pas ici.
-- =============================================================================

create or replace function public.fn_customer_invoice_starts_draft()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'DRAFT' then
    raise exception
      'Opération refusée : une facture client est préparée en brouillon (§25). Son émission est un acte distinct, soumis à sa propre capacité.'
      using errcode = 'check_violation';
  end if;

  if new.issued_at is not null or new.cancelled_at is not null then
    raise exception
      'Opération refusée : une facture client ne naît ni émise ni annulée.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_customer_invoice_starts_draft is
  'Une facture client naît en brouillon. Ferme le contournement du déclencheur de transition par INSERT direct.';


-- =============================================================================
-- COUCHE 2 · LA COHÉRENCE DE LA FACTURE ET DE SA LOCATION
--
--   §5   La facturation d'une location suppose le retour et le contrôle : c'est
--        exactement l'état « À facturer » du cycle (DEC-006).
--   §49  Facture → Location → Véhicule → Client. La chaîne relie UN client :
--        facturer à un tiers la location d'un autre la romprait.
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
begin
  if new.rental_id is null then
    return new;
  end if;

  -- Le dossier ne se revérifie que s'il change : rejouer ce contrôle à chaque
  -- changement de statut imposerait `rental.rentals.view` à celui qui annule,
  -- c'est-à-dire ferait dépendre un acte d'une capacité qui ne le concerne pas
  -- (DEC-024). L'émission et l'annulation l'exigent, elles, nommément.
  if tg_op = 'UPDATE' and new.rental_id is not distinct from old.rental_id then
    return new;
  end if;

  select r.status, r.client_id, r.rental_no
    into v_status, v_client, v_no
  from public.rentals r
  where r.id = new.rental_id;

  -- Introuvable ou invisible : même réponse, afin de ne rien apprendre à qui
  -- n'a pas le droit de savoir (DEC-017).
  if v_status is null then
    raise exception
      'La location visée est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if v_status <> 'TO_INVOICE' then
    raise exception
      'Opération refusée : seule une location « À facturer » se facture. La location % est « % » (Workflow 07 §5).',
      v_no, v_status
      using errcode = 'check_violation';
  end if;

  if v_client is distinct from new.client_id then
    raise exception
      'Opération refusée : cette location n''est pas celle du client facturé. La chaîne Facture → Location → Client ne se rompt pas (§49).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_customer_invoice_coherence is
  'Une facture de location vise une location « À facturer » du MÊME client (§5, §49). Le contrôle ne rejoue qu''au changement de rattachement.';


-- =============================================================================
-- COUCHE 2 · LE VERROU DES LIGNES
--
-- §8 et §72 : une facture émise ne se recalcule pas, et les changements
-- ultérieurs de tarifs « ne doivent pas modifier automatiquement les factures
-- existantes ». Une ligne modifiée après émission changerait le total sur lequel
-- la créance a été reconnue.
-- =============================================================================

create or replace function public.fn_customer_invoice_line_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status public.customer_invoice_status;
  v_seen   boolean := false;
begin
  select true, i.status into v_seen, v_status
  from public.customer_invoices i
  where i.id = new.customer_invoice_id;

  if not v_seen then
    raise exception
      'La facture visée est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if v_status <> 'DRAFT' then
    raise exception
      'Opération refusée : les lignes d''une facture émise ou annulée sont figées. Une facture émise ne se recalcule pas (Workflow 07 §8, §72).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_customer_invoice_line_guard is
  'Fige les lignes dès l''émission. Aucun déverrouillage n''existe : une correction passe par l''annulation, jamais par la réécriture.';


-- =============================================================================
-- COUCHE 3 · LES TRANSITIONS DE LA FACTURE CLIENT
--
-- « Une permission dit qui peut agir, une transition dit ce qui a un sens »
-- (DEC-025 §k). Chaque changement de statut exige ici la capacité qui le
-- légitime : c'est ce qui protège le `PATCH` direct, lequel ne rencontre aucune
-- garde serveur (leçon de la migration 041).
-- =============================================================================

create or replace function public.fn_customer_invoice_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_subtotal bigint;
  v_discount bigint;
begin
  if new.status is distinct from old.status then

    /*
     * LES RÈGLEMENTS CLIENTS N'EXISTENT PAS — ET LE SYSTÈME LE DIT.
     *
     * §61 : « Le statut doit être calculé à partir des règlements réellement
     * enregistrés. » Les écrire aujourd'hui affirmerait qu'une somme a été
     * encaissée alors qu'aucun encaissement n'est géré. Même traitement
     * qu'« Imputée » au LOT 4 et que « Payée » au LOT 5.
     */
    if new.status in ('PARTIALLY_PAID', 'PAID') then
      raise exception
        'Opération refusée : l''état de règlement d''une facture se CALCULE des encaissements enregistrés (§61), et les règlements clients ne sont pas encore gérés.'
        using errcode = 'check_violation';
    end if;

    -- DEC-025 §a : « En retard » se calcule de l'échéance, il ne se déclare pas.
    if new.status = 'OVERDUE' then
      raise exception
        'Opération refusée : « En retard » se déduit de l''échéance et du solde (§30). Ce statut ne s''écrit pas.'
        using errcode = 'check_violation';
    end if;

    case
      when old.status = 'DRAFT' and new.status = 'ISSUED' then
        perform public.require_capability(
          array['billing.customer_invoices.issue'], 'émettre une facture client'
        );

        /*
         * §22 et §60 : une facture est composée de lignes, et le montant final
         * est calculé par le système. Émettre une facture sans ligne
         * reconnaîtrait une créance de zéro.
         *
         * Les sommes sont lues sous les droits de l'appelant : illisibles,
         * elles valent 0, et l'émission est REFUSÉE. C'est le seul comportement
         * acceptable.
         */
        v_subtotal := public.customer_invoice_subtotal(new.id);
        v_discount := public.customer_invoice_discount(new.id);

        if v_subtotal <= 0 then
          raise exception
            'Opération refusée : cette facture ne porte aucune ligne facturable, ou ses lignes ne sont pas lisibles avec vos droits. Un total est nécessaire à l''émission (§22, §60).'
            using errcode = 'check_violation';
        end if;

        /*
         * §24 : une réduction ramène un tarif à un net. Une réduction qui
         * dépasserait le sous-total produirait une facture NÉGATIVE — c'est-à-
         * dire un avoir, que ce lot ne livre pas (§44) et qu'il ne fabriquera
         * pas par accident.
         */
        if v_discount > v_subtotal then
          raise exception
            'Opération refusée : les réductions (% KMF) dépassent le sous-total (% KMF). Une facture ne devient pas un avoir : celui-ci relève de règles qu''ADIKOM n''a pas arrêtées (§44).',
            v_discount, v_subtotal
            using errcode = 'check_violation';
        end if;

        if v_subtotal - v_discount <= 0 then
          raise exception
            'Opération refusée : le total de cette facture serait nul. Une créance de zéro n''est pas une créance.'
            using errcode = 'check_violation';
        end if;

      when old.status in ('DRAFT', 'ISSUED') and new.status = 'CANCELLED' then
        perform public.require_capability(
          array['billing.customer_invoices.cancel'], 'annuler une facture client'
        );

      else
        raise exception
          'Transition de facture client refusée : % ne peut pas devenir %.', old.status, new.status
          using errcode = 'check_violation';
    end case;
  end if;

  /*
   * COUCHE 2 — LE VERROU.
   *
   * §45 : « Une facture déjà émise ne doit pas être modifiée silencieusement. »
   * Une facture émise ou annulée fige ce qui fonde la créance : son client, sa
   * location, sa date, son échéance et son numéro. Les LIGNES le sont par leur
   * propre déclencheur.
   */
  if old.status in ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')
     and (new.client_id    is distinct from old.client_id
       or new.rental_id    is distinct from old.rental_id
       or new.invoice_date is distinct from old.invoice_date
       or new.due_date     is distinct from old.due_date
       or new.invoice_no   is distinct from old.invoice_no) then
    raise exception
      'Opération refusée : une facture client émise ou annulée ne se modifie plus (§45). Son annulation, elle, conserve l''historique.'
      using errcode = 'check_violation';
  end if;

  -- Modifier une facture encore en brouillon relève de `update` (§25).
  if old.status = 'DRAFT'
     and (new.client_id    is distinct from old.client_id
       or new.rental_id    is distinct from old.rental_id
       or new.invoice_date is distinct from old.invoice_date
       or new.due_date     is distinct from old.due_date
       or new.notes        is distinct from old.notes) then
    perform public.require_capability(
      array['billing.customer_invoices.update'], 'modifier une facture client'
    );
  end if;

  return new;
end;
$$;

comment on function public.fn_customer_invoice_transition is
  'Chaque transition exige SA capacité, y compris par PATCH direct. « Payée », « Partiellement payée » et « En retard » se calculent : aucune ne s''écrit.';


create trigger customer_invoices_starts_draft
  before insert on public.customer_invoices
  for each row execute function public.fn_customer_invoice_starts_draft();

create trigger customer_invoices_coherence
  before insert or update on public.customer_invoices
  for each row execute function public.fn_customer_invoice_coherence();

create trigger customer_invoices_transition
  before update on public.customer_invoices
  for each row execute function public.fn_customer_invoice_transition();

create trigger customer_invoices_updated_at
  before update on public.customer_invoices
  for each row execute function public.fn_set_updated_at();

create trigger customer_invoices_audit
  after insert or update on public.customer_invoices
  for each row execute function public.fn_audit_row('billing');

create trigger customer_invoices_no_delete
  before delete on public.customer_invoices
  for each row execute function public.fn_forbid_delete();

create trigger customer_invoice_lines_guard
  before insert or update on public.customer_invoice_lines
  for each row execute function public.fn_customer_invoice_line_guard();

create trigger customer_invoice_lines_updated_at
  before update on public.customer_invoice_lines
  for each row execute function public.fn_set_updated_at();

create trigger customer_invoice_lines_audit
  after insert or update on public.customer_invoice_lines
  for each row execute function public.fn_audit_row('billing');

create trigger customer_invoice_lines_no_delete
  before delete on public.customer_invoice_lines
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- LE POINT OUVERT DE LA MIGRATION 042 SE REFERME
--
-- « `INVOICED` et `CLOSED` appartiennent à l'Étape 2.5 : aucune capacité ne leur
-- correspond, et en désigner une serait inventer une règle. »
--
-- Elles en ont une, maintenant que l'objet dont elles dépendent existe :
--
--   `TO_INVOICE → INVOICED`   `billing.customer_invoices.issue`
--       La location devient « Facturée » PARCE QUE sa facture est émise. Ce
--       n'est pas un second acte : c'est la CONSÉQUENCE du premier — même
--       doctrine que l'écriture produite par un règlement (DEC-029 §f) ou que
--       l'occupation de calendrier posée par une maintenance.
--
--   `INVOICED → CLOSED`       `rental.rentals.close`
--       « Clôturer une location », dit le catalogue depuis la migration 007.
--       C'est l'acte d'exploitation que Workflow 01 §41 décrit, et il ne
--       suppose AUCUN paiement : §42 — « Une location peut être clôturée
--       opérationnellement même si la facture n'est pas encore entièrement
--       payée. Le système doit conserver les deux informations séparément. »
--
--   `INVOICED → TO_INVOICE`   `billing.customer_invoices.cancel`
--       Le retour en arrière qu'exige l'annulation. Sans lui, une facture émise
--       par erreur enfermerait le contrat dans « Facturée » sans facture — une
--       impasse. « Une impasse n'est pas une garantie » (DEC-027 §e).
-- =============================================================================

create or replace function public.fn_rental_status_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_allowed public.rental_status[];
begin
  if new.status = old.status then
    return new;
  end if;

  v_allowed := case old.status
    when 'PREPARING'   then array['CONFIRMED','CANCELLED']::public.rental_status[]
    when 'CONFIRMED'   then array['IN_PROGRESS','CANCELLED']::public.rental_status[]
    when 'IN_PROGRESS' then array['EXTENDED','RETURNED']::public.rental_status[]
    when 'EXTENDED'    then array['EXTENDED','RETURNED']::public.rental_status[]
    when 'RETURNED'    then array['TO_CONTROL']::public.rental_status[]
    when 'TO_CONTROL'  then array['TO_INVOICE']::public.rental_status[]
    when 'TO_INVOICE'  then array['INVOICED']::public.rental_status[]
    -- Le retour à « À facturer » n'est pas une marche arrière de complaisance :
    -- c'est le seul état cohérent d'un contrat dont la facture a été annulée.
    when 'INVOICED'    then array['CLOSED','TO_INVOICE']::public.rental_status[]
    else array[]::public.rental_status[]
  end;

  if not (new.status = any(v_allowed)) then
    raise exception
      'Transition de location refusée : % ne peut pas devenir %.', old.status, new.status
      using errcode = 'check_violation';
  end if;

  /*
   * `RETURNED` et `TO_CONTROL` relèvent du même acte : `return_rental` les
   * enchaîne dans la même transaction. Les séparer exigerait deux capacités
   * pour une seule opération.
   */
  case new.status
    when 'CONFIRMED'   then
      perform public.require_capability(
        array['rental.rentals.update'], 'confirmer un contrat de location');
    when 'IN_PROGRESS' then
      perform public.require_capability(
        array['rental.rentals.checkout'], 'enregistrer le départ d''une location');
    when 'EXTENDED'    then
      perform public.require_capability(
        array['rental.rentals.extend'], 'prolonger une location');
    when 'RETURNED'    then
      perform public.require_capability(
        array['rental.rentals.return'], 'enregistrer le retour d''une location');
    when 'TO_CONTROL'  then
      perform public.require_capability(
        array['rental.rentals.return'], 'enregistrer le retour d''une location');
    when 'TO_INVOICE'  then
      /*
       * DEUX CHEMINS MÈNENT À « À FACTURER », ET CHACUN A SA CAPACITÉ.
       *
       *   depuis « À contrôler » — la validation du contrôle (DEC-025 §b) ;
       *   depuis « Facturée »    — l'annulation de la facture émise.
       *
       * Les confondre donnerait à l'un le pouvoir de l'autre.
       */
      if old.status = 'INVOICED' then
        perform public.require_capability(
          array['billing.customer_invoices.cancel'],
          'ramener une location à « À facturer » après annulation de sa facture');
      else
        perform public.require_capability(
          array['rental.rentals.close'], 'valider le contrôle de retour');
      end if;
    when 'INVOICED'    then
      perform public.require_capability(
        array['billing.customer_invoices.issue'], 'facturer une location');
    when 'CLOSED'      then
      perform public.require_capability(
        array['rental.rentals.close'], 'clôturer une location');
    when 'CANCELLED'   then
      perform public.require_capability(
        array['rental.rentals.cancel'], 'annuler une location');
    else
      null;
  end case;

  return new;
end;
$$;

comment on function public.fn_rental_status_transition is
  'Impose les transitions de DEC-006 ET la capacité qui légitime chacune. « Facturée » suit l''émission de la facture ; « Clôturée » relève de `rentals.close`.';


/*
 * LA POLICY S'OUVRE AUX DEUX CAPACITÉS DE FACTURATION.
 *
 * PostgreSQL n'accepte qu'une policy d'UPDATE par table : elle reste donc large,
 * et c'est le DÉCLENCHEUR ci-dessus qui exige, lui, la capacité correspondant à
 * l'acte réellement demandé (migration 041 : « une policy large n'est pas une
 * permission d'acte »).
 *
 * Sans cette ouverture, émettre une facture exigerait une capacité de location
 * que la facturation ne suppose pas — exactement le défaut que la migration 051
 * a corrigé pour le règlement fournisseur.
 */
drop policy if exists rentals_update on public.rentals;

create policy rentals_update on public.rentals
  for update to authenticated
  using (
    public.has_permission('rental.rentals.update')
    or public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.extend')
    or public.has_permission('rental.rentals.return')
    or public.has_permission('rental.rentals.close')
    or public.has_permission('rental.rentals.cancel')
    or public.has_permission('billing.customer_invoices.issue')
    or public.has_permission('billing.customer_invoices.cancel')
  )
  with check (
    public.has_permission('rental.rentals.update')
    or public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.extend')
    or public.has_permission('rental.rentals.return')
    or public.has_permission('rental.rentals.close')
    or public.has_permission('rental.rentals.cancel')
    or public.has_permission('billing.customer_invoices.issue')
    or public.has_permission('billing.customer_invoices.cancel')
  );


-- =============================================================================
-- COUCHE 1 · LES FONCTIONS
--
-- Chacune vérifie la capacité qu'elle incarne AVANT d'engager le travail. Ce
-- n'est pas redondant avec RLS : la policy dit qui peut écrire dans la table,
-- ceci dit qui peut accomplir CET acte — la leçon de l'audit 041.
--
-- Aucune n'est `SECURITY DEFINER` : elles s'exécutent avec les droits de
-- l'appelant, RLS comprise.
--
-- POURQUOI `view` EST EXIGÉE PAR PRESQUE TOUTES
--
-- Chacune LIT la facture avant d'agir. Sous RLS, un appelant sans
-- `billing.customer_invoices.view` ne lit rien : l'acte échouerait sur un
-- « introuvable » qui n'expliquerait pas la vraie raison. La capacité est donc
-- exigée NOMMÉMENT, et refusée avec son motif — sans être pour autant impliquée
-- par une autre (DEC-024).
-- =============================================================================

/**
 * Prépare une facture client — Workflow 07 §18, §25.
 *
 * Aucun montant n'est généré. Le total viendra des lignes, saisies ensuite :
 * une facture sans ligne reste en brouillon et ne peut pas être émise.
 *
 * `rental.rentals.view` n'est exigée QUE si une location est visée : une facture
 * de services n'a aucune raison de réclamer un droit sur les locations
 * (DEC-024).
 */
create or replace function public.create_customer_invoice(
  p_client_id    uuid,
  p_invoice_date date,
  p_due_date     date default null,
  p_rental_id    uuid default null,
  p_notes        text default null
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

  if p_rental_id is not null then
    perform public.require_capability(
      array['rental.rentals.view'], 'consulter la location facturée'
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
   * Contrôle anticipé, pour un message compréhensible (CLAUDE.md §43). L'index
   * unique partiel fait autorité, y compris pour un appel qui ne passerait pas
   * par ici et pour deux saisies simultanées.
   */
  if p_rental_id is not null and exists (
    select 1 from public.customer_invoices i
    where i.rental_id = p_rental_id and i.status <> 'CANCELLED'
  ) then
    raise exception
      'Opération refusée : cette location porte déjà une facture. Une prestation ne se facture pas deux fois.'
      using errcode = 'unique_violation';
  end if;

  v_no := public.next_number('customer_invoice');

  insert into public.customer_invoices
    (invoice_no, client_id, rental_id, invoice_date, due_date, notes,
     created_by, updated_by)
  values
    (v_no, p_client_id, p_rental_id, p_invoice_date, p_due_date,
     nullif(btrim(coalesce(p_notes, '')), ''),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.create_customer_invoice is
  'Prépare une facture client en brouillon (§25). Ne génère aucun montant : le total viendra des lignes saisies.';


/** Modifie l'en-tête d'une facture encore en brouillon — §25. */
create or replace function public.update_customer_invoice(
  p_invoice_id   uuid,
  p_invoice_date date,
  p_due_date     date default null,
  p_notes        text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  f public.customer_invoices%rowtype;
begin
  perform public.require_capability(
    array['billing.customer_invoices.update'], 'modifier une facture client'
  );
  perform public.require_capability(
    array['billing.customer_invoices.view'], 'consulter la facture à modifier'
  );

  select * into f from public.customer_invoices where id = p_invoice_id for update;

  if not found then
    raise exception 'Facture client introuvable.' using errcode = 'no_data_found';
  end if;

  if f.status <> 'DRAFT' then
    raise exception
      'Opération refusée : une facture émise ou annulée ne se modifie plus (§45).'
      using errcode = 'check_violation';
  end if;

  if p_invoice_date is null then
    raise exception 'La date de la facture est obligatoire.' using errcode = 'check_violation';
  end if;

  if p_due_date is not null and p_due_date < p_invoice_date then
    raise exception 'L''échéance ne peut pas précéder la date de la facture.'
      using errcode = 'check_violation';
  end if;

  update public.customer_invoices
     set invoice_date = p_invoice_date,
         due_date     = p_due_date,
         notes        = nullif(btrim(coalesce(p_notes, '')), ''),
         updated_by   = public.current_actor()
   where id = f.id;
end;
$$;

comment on function public.update_customer_invoice is
  'Modifie une facture en brouillon. Ni le client ni la location n''y sont modifiables : la facture d''une autre prestation est une autre facture.';


/**
 * Ajoute une ligne — Workflow 07 §22.
 *
 * `create` OU `update` : ajouter une ligne appartient à la SAISIE de la facture,
 * que l'un ou l'autre porte selon qu'on la crée ou qu'on la complète. Même règle
 * qu'au LOT 5.
 */
create or replace function public.add_customer_invoice_line(
  p_invoice_id    uuid,
  p_kind          public.customer_invoice_line_kind,
  p_label         text,
  p_quantity      integer,
  p_unit_price    bigint,
  p_justification text default null
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

  insert into public.customer_invoice_lines
    (customer_invoice_id, kind, label, quantity, unit_price, justification,
     created_by, updated_by)
  values
    (p_invoice_id, coalesce(p_kind, 'SERVICE'), btrim(p_label), p_quantity, p_unit_price,
     nullif(btrim(coalesce(p_justification, '')), ''),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.add_customer_invoice_line is
  'Ajoute une ligne à une facture en brouillon. Une ligne « réduction » se soustrait du total (§24) sans jamais porter un montant négatif.';


/** Retire une ligne de la facture sans l'effacer — CLAUDE.md §22. */
create or replace function public.archive_customer_invoice_line(
  p_line_id uuid
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.require_capability(
    array['billing.customer_invoices.update'], 'retirer une ligne d''une facture client'
  );
  perform public.require_capability(
    array['billing.customer_invoices.view'], 'consulter la facture concernée'
  );

  update public.customer_invoice_lines
     set is_archived = true,
         updated_by  = public.current_actor()
   where id = p_line_id
     and not is_archived;

  if not found then
    raise exception
      'Ligne introuvable, déjà retirée, ou facture non modifiable.'
      using errcode = 'no_data_found';
  end if;
end;
$$;

comment on function public.archive_customer_invoice_line is
  'Retire une ligne des sommes sans l''effacer. Le déclencheur refuse l''opération si la facture n''est plus en brouillon.';


/**
 * Émet la facture — la créance est reconnue (§26).
 *
 * ET LA LOCATION DEVIENT « FACTURÉE ».
 *
 * Ce n'est pas un second acte : c'est la conséquence du premier. Le contrat ne
 * change pas d'état parce qu'on l'a décidé, mais parce que sa facture existe —
 * même doctrine que l'écriture produite par un règlement (DEC-029 §f).
 * `rental.rentals.update` n'est donc PAS exigée : réclamer une capacité
 * d'exploitation pour un acte de facturation inventerait une règle.
 *
 * `rental.rentals.view` l'est, en revanche, et nommément : la fonction LIT le
 * contrat pour vérifier son état, et sous RLS un appelant qui ne peut pas le
 * lire obtiendrait un « introuvable » qui n'expliquerait rien.
 */
create or replace function public.issue_customer_invoice(
  p_invoice_id uuid,
  p_reason     text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  f          public.customer_invoices%rowtype;
  v_subtotal bigint;
  v_discount bigint;
  v_rstatus  public.rental_status;
begin
  perform public.require_capability(
    array['billing.customer_invoices.issue'], 'émettre une facture client'
  );
  perform public.require_capability(
    array['billing.customer_invoices.view'], 'consulter la facture à émettre'
  );

  select * into f from public.customer_invoices where id = p_invoice_id for update;

  if not found then
    raise exception 'Facture client introuvable.' using errcode = 'no_data_found';
  end if;

  if f.status <> 'DRAFT' then
    raise exception
      'Opération refusée : seule une facture en brouillon peut être émise (§25, §26).'
      using errcode = 'check_violation';
  end if;

  -- Contrôles anticipés, pour des messages compréhensibles. Le déclencheur les
  -- refait : c'est lui qui fait autorité, y compris hors de cette fonction.
  v_subtotal := public.customer_invoice_subtotal(f.id);
  v_discount := public.customer_invoice_discount(f.id);

  if v_subtotal <= 0 then
    raise exception
      'Opération refusée : cette facture ne porte aucune ligne facturable. Un total est nécessaire à son émission (§22, §60).'
      using errcode = 'check_violation';
  end if;

  if v_discount > v_subtotal then
    raise exception
      'Opération refusée : les réductions (% KMF) dépassent le sous-total (% KMF). Un avoir relève de règles qu''ADIKOM n''a pas arrêtées (§44).',
      v_discount, v_subtotal
      using errcode = 'check_violation';
  end if;

  if f.rental_id is not null then
    perform public.require_capability(
      array['rental.rentals.view'], 'consulter la location que cette facture rend « Facturée »'
    );

    select r.status into v_rstatus from public.rentals r where r.id = f.rental_id;

    if v_rstatus is null then
      raise exception
        'La location de cette facture est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;

    if v_rstatus <> 'TO_INVOICE' then
      raise exception
        'Opération refusée : cette location n''est plus « À facturer » (elle est « % »).', v_rstatus
        using errcode = 'check_violation';
    end if;
  end if;

  update public.customer_invoices
     set status            = 'ISSUED',
         issued_at         = now(),
         issued_by         = public.current_actor(),
         status_reason     = nullif(btrim(coalesce(p_reason, '')), ''),
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = f.id;

  if f.rental_id is not null then
    update public.rentals
       set status            = 'INVOICED',
           status_reason     = 'Facture ' || f.invoice_no,
           status_changed_at = now(),
           status_changed_by = public.current_actor(),
           updated_by        = public.current_actor()
     where id = f.rental_id
       and status = 'TO_INVOICE';
  end if;
end;
$$;

comment on function public.issue_customer_invoice is
  'Émet la facture : la créance est reconnue, ses lignes sont figées (§26), et la location qu''elle facture devient « Facturée ».';


/**
 * Annule une facture sans l'effacer — §43, §46.
 *
 * ET REND LA LOCATION À « À FACTURER ».
 *
 * §46 : « Les factures ayant une valeur métier ou financière ne doivent pas être
 * supprimées physiquement. » Rien n'est donc effacé. Mais laisser la location
 * dans « Facturée » sans facture l'enfermerait pour toujours : elle ne pourrait
 * plus ni être refacturée ni être clôturée. C'est le raisonnement du détachement
 * du LOT 5 — « une impasse n'est pas une garantie » (DEC-027 §e).
 *
 * UNE LOCATION CLÔTURÉE, ELLE, NE SE ROUVRE PAS.
 *
 * La clôture est un acte d'exploitation qui a constaté que le dossier était
 * traité (Workflow 01 §41). Revenir dessus par l'annulation d'une facture ferait
 * décider d'un acte d'exploitation à qui ne détient qu'une capacité de
 * facturation. Le refus le dit, et nomme l'ordre à suivre.
 */
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

  update public.customer_invoices
     set status            = 'CANCELLED',
         cancelled_at      = now(),
         cancelled_by      = public.current_actor(),
         status_reason     = nullif(btrim(coalesce(p_reason, '')), ''),
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = f.id;

  -- La location retourne à « À facturer » : elle attend de nouveau sa facture.
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
end;
$$;

comment on function public.cancel_customer_invoice is
  'Annule une facture sans l''effacer (§46) et rend la location à « À facturer ». Refusée si la location est déjà clôturée.';


/**
 * Clôture une location — Workflow 01 §41.
 *
 * « Une location peut être considérée comme clôturée lorsque les opérations
 * nécessaires ont été traitées : retour enregistré, contrôle effectué, montant
 * final déterminé, facture créée, paiement traité OU SOLDE IDENTIFIÉ. »
 *
 * LA CLÔTURE N'EXIGE AUCUN PAIEMENT.
 *
 * §42 est explicite : « Une location peut être clôturée opérationnellement même
 * si la facture n'est pas encore entièrement payée. Le système doit conserver
 * les deux informations séparément. » Exiger le règlement inventerait une règle
 * que la documentation écarte nommément.
 *
 * §47 exige en revanche que rien d'essentiel ne manque. Rien ne manque : les
 * contraintes `rentals_started_when_running` et `rentals_returned_when_back`
 * garantissent le départ et le retour depuis la migration 031, le véhicule et le
 * client sont `not null`, et l'état « Facturée » prouve qu'une facture existe.
 */
create or replace function public.close_rental(
  p_rental_id uuid,
  p_reason    text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r public.rentals%rowtype;
begin
  perform public.require_capability(
    array['rental.rentals.close'], 'clôturer une location'
  );
  perform public.require_capability(
    array['rental.rentals.view'], 'consulter la location à clôturer'
  );

  select * into r from public.rentals where id = p_rental_id for update;

  if not found then
    raise exception 'Location introuvable.' using errcode = 'no_data_found';
  end if;

  if r.status <> 'INVOICED' then
    raise exception
      'Opération refusée : seule une location facturée se clôture. Celle-ci est « % ».', r.status
      using errcode = 'check_violation';
  end if;

  update public.rentals
     set status            = 'CLOSED',
         status_reason     = nullif(btrim(coalesce(p_reason, '')), ''),
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = r.id;
end;
$$;

comment on function public.close_rental is
  'Clôture une location facturée (Workflow 01 §41). N''exige aucun paiement : §42 admet la clôture d''un dossier dont la facture reste impayée.';


-- =============================================================================
-- DROITS D'EXÉCUTION — DEC-022
--
-- « Un droit ne se retire pas en général : il se retire à chaque source qui
-- l'accorde. » PostgreSQL accorde EXECUTE à PUBLIC sur toute fonction créée.
-- =============================================================================

revoke execute on function public.customer_invoice_subtotal(uuid) from public;
grant  execute on function public.customer_invoice_subtotal(uuid) to authenticated, service_role;

revoke execute on function public.customer_invoice_discount(uuid) from public;
grant  execute on function public.customer_invoice_discount(uuid) to authenticated, service_role;

revoke execute on function public.customer_invoice_total(uuid) from public;
grant  execute on function public.customer_invoice_total(uuid) to authenticated, service_role;

revoke execute on function public.create_customer_invoice(uuid, date, date, uuid, text) from public;
grant  execute on function public.create_customer_invoice(uuid, date, date, uuid, text)
  to authenticated, service_role;

revoke execute on function public.update_customer_invoice(uuid, date, date, text) from public;
grant  execute on function public.update_customer_invoice(uuid, date, date, text)
  to authenticated, service_role;

revoke execute on function public.add_customer_invoice_line(
  uuid, public.customer_invoice_line_kind, text, integer, bigint, text) from public;
grant  execute on function public.add_customer_invoice_line(
  uuid, public.customer_invoice_line_kind, text, integer, bigint, text)
  to authenticated, service_role;

revoke execute on function public.archive_customer_invoice_line(uuid) from public;
grant  execute on function public.archive_customer_invoice_line(uuid)
  to authenticated, service_role;

revoke execute on function public.issue_customer_invoice(uuid, text) from public;
grant  execute on function public.issue_customer_invoice(uuid, text) to authenticated, service_role;

revoke execute on function public.cancel_customer_invoice(uuid, text) from public;
grant  execute on function public.cancel_customer_invoice(uuid, text) to authenticated, service_role;

revoke execute on function public.close_rental(uuid, text) from public;
grant  execute on function public.close_rental(uuid, text) to authenticated, service_role;


-- =============================================================================
-- COUCHE 4 · RLS
--
-- Les policies d'écriture restent larges — une table sert plusieurs actes, et
-- PostgreSQL n'accepte qu'une policy d'UPDATE par table. Ce sont les
-- déclencheurs de transition qui exigent, eux, la capacité correspondant à
-- l'acte réellement demandé.
-- =============================================================================

revoke all    on public.customer_invoices      from anon;
revoke all    on public.customer_invoice_lines from anon;

revoke delete on public.customer_invoices      from authenticated;
revoke delete on public.customer_invoice_lines from authenticated;

alter table public.customer_invoices      enable row level security;
alter table public.customer_invoice_lines enable row level security;

create policy customer_invoices_select on public.customer_invoices
  for select to authenticated
  using (public.has_permission('billing.customer_invoices.view'));

create policy customer_invoices_insert on public.customer_invoices
  for insert to authenticated
  with check (public.has_permission('billing.customer_invoices.create'));

create policy customer_invoices_update on public.customer_invoices
  for update to authenticated
  using (
    public.has_permission('billing.customer_invoices.update')
    or public.has_permission('billing.customer_invoices.issue')
    or public.has_permission('billing.customer_invoices.cancel')
  )
  with check (
    public.has_permission('billing.customer_invoices.update')
    or public.has_permission('billing.customer_invoices.issue')
    or public.has_permission('billing.customer_invoices.cancel')
  );

-- Les lignes suivent la facture : les voir relève de `view`, les saisir de la
-- création ou de la modification, les retirer de la modification.
create policy customer_invoice_lines_select on public.customer_invoice_lines
  for select to authenticated
  using (public.has_permission('billing.customer_invoices.view'));

create policy customer_invoice_lines_insert on public.customer_invoice_lines
  for insert to authenticated
  with check (
    public.has_permission('billing.customer_invoices.create')
    or public.has_permission('billing.customer_invoices.update')
  );

create policy customer_invoice_lines_update on public.customer_invoice_lines
  for update to authenticated
  using (public.has_permission('billing.customer_invoices.update'))
  with check (public.has_permission('billing.customer_invoices.update'));


-- =============================================================================
-- CONTRÔLE DE NON-RÉGRESSION DU CATALOGUE
--
-- Le LOT 7 n'ajoute aucune permission : les sept codes
-- `billing.customer_invoices.*` existent depuis la migration 007, et
-- `rental.rentals.close` depuis la même. Une migration qui laisserait le
-- catalogue dans un état inattendu doit échouer avant de le figer.
-- =============================================================================

do $$
declare
  v_total   int;
  v_missing text[];
begin
  select count(*) into v_total from public.permissions;

  if v_total <> 153 then
    raise exception 'Catalogue attendu à 153 permissions, obtenu %.', v_total;
  end if;

  select array_agg(c) into v_missing
  from unnest(array[
    'billing.customer_invoices.view',
    'billing.customer_invoices.create',
    'billing.customer_invoices.update',
    'billing.customer_invoices.issue',
    'billing.customer_invoices.cancel',
    'billing.customer_invoices.export',
    'rental.rentals.close',
    'rental.rentals.view',
    'parties.clients.view'
  ]) c
  where not exists (select 1 from public.permissions p where p.code = c);

  if v_missing is not null then
    raise exception 'Capacités de facturation client absentes du catalogue : %', v_missing;
  end if;

  -- La règle de numérotation existe depuis la migration 005 et n'a jamais été
  -- consommée. Sa consommation commence ici.
  if not exists (
    select 1 from public.numbering_rules where entity_key = 'customer_invoice'
  ) then
    raise exception 'Règle de numérotation « customer_invoice » absente.';
  end if;
end $$;
