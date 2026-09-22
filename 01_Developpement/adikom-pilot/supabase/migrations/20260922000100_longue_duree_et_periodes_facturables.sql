-- =============================================================================
-- ADIKOM PILOT — 094 · Longue durée, cadence de facturation, périodes facturables
-- LOT 23 — DEC-047 · Plan 02 §7.3, §9.2, §13.2, §19.3, §19.4
--
-- LA DÉCISION QUI COMMANDE LE LOT — A-6, Direction du 11/09/2026 :
--
--   « Chaque fin du mois, on établit une facture, toutefois le client peut
--     exiger une facture globale de toute la période de location avec les
--     détails et les historiques de payement. »
--
-- Deux cadences sont cochées : MENSUELLE et PAR PÉRIODE DÉFINIE AU CONTRAT. Le
-- LOT 23 livre donc les deux, et RIEN de plus : la « facture globale » n'est
-- PAS une facture (§C ci-dessous).
--
-- CE QUE CETTE MIGRATION LIVRE — LE SCHÉMA, ET LUI SEUL
--
--   · `rental_type`              FIXED_TERM | LONG_TERM   (Plan 02 §9.2)
--   · `rental_billing_cadence`   MONTHLY | CONTRACT_TERM  (A-6)
--   · `rental_billing_origin`    MONTHLY | CONTRACT_TERM  — d'où vient LA période
--   · `rental_billing_period_status`  PLANNED | CANCELLED
--   · `rentals.rental_type` + `rentals.billing_cadence`, cohérents entre eux
--   · la table `rental_billing_periods`
--   · `customer_invoices.billing_period_id`
--   · LE REMPLACEMENT DE `customer_invoices_one_per_rental_idx`, dans l'ordre
--     EXACT du Plan 02 §19.3 — créer, puis seulement ensuite supprimer
--   · les gardes, les policies, la capacité, le journal.
--
-- Les ACTES — régime, prolongation par avenant, facture de période — vivent
-- dans la migration 095. Schéma et comportement séparés : on peut rejouer l'un
-- sans l'autre (consigne §17).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- §A. CE QU'EST UNE PÉRIODE FACTURABLE, ET CE QU'ELLE N'EST PAS
--
-- Consigne §6 : « Ne confonds pas rental_segments = chronologie opérationnelle
-- du contrat ; rental_billing_periods = découpage destiné à la facturation. »
--
--   SEGMENT           un véhicule, une période, UN TARIF VERROUILLÉ.
--                     Il se coupe quand le véhicule change ou que le tarif
--                     change. C'est L'HISTOIRE DE L'EXPLOITATION.
--
--   PÉRIODE           un intervalle qu'UNE facture couvre, et une seule.
--   FACTURABLE        Elle se coupe à la FIN DU MOIS, ou aux bornes du contrat.
--                     C'est LE DÉCOUPAGE DE LA CRÉANCE.
--
-- Les deux se croisent sans coïncider. Une période facturable d'octobre peut
-- traverser deux segments — véhicule A jusqu'au 12, véhicule B ensuite — et sa
-- facture portera DEUX lignes, une par portion tarifaire (consigne §11). Les
-- segments restent LA SOURCE HISTORIQUE ; la période ne les réécrit jamais.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- §B. AUCUNE RÈGLE DE DURÉE N'EST INVENTÉE — DEC-008, consigne §8
--
-- Consigne §8 : « Ne choisis pas arbitrairement une règle d'arrondi ou de calcul
-- journalier si elle n'est pas déjà définie. »
--
-- Elle ne l'est pas : DEC-008 laisse « arrondi de durée, jour entamé, heure de
-- retour » NON DÉFINIS, et rien n'a été tranché depuis. La recherche a été
-- faite : `Règles location` §35, `Workflow 07` §9 et §12 (« les règles de
-- calcul ne doivent pas être inventées par le système »), DEC-025 §i.
--
-- CE LOT N'A PAS BESOIN DE CETTE RÈGLE, et c'est pourquoi il n'est pas bloqué :
--
--   · une BORNE DE PÉRIODE est un FAIT DE CALENDRIER — le 1er novembre à Moroni
--     est le 1er novembre. Découper « chaque fin du mois » ne suppose aucun
--     arrondi : c'est la transcription littérale de A-6 ;
--   · une QUANTITÉ FACTURÉE, elle, supposerait cette règle. Elle reste donc
--     SAISIE, exactement comme aujourd'hui : `add_customer_invoice_line` reçoit
--     la quantité de l'utilisateur, l'écran pré-remplit le PRIX UNITAIRE
--     verrouillé et laisse la quantité VIDE en disant pourquoi.
--
-- AUCUN MONTANT N'EST DONC CALCULÉ PAR CE LOT. Aucune colonne de montant
-- n'existe sur `rental_billing_periods` : un total y serait une seconde vérité
-- que les lignes de facture démentiraient (doctrine D1).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- §C. LA « FACTURE GLOBALE » N'EST PAS UNE FACTURE — A-6, Plan 02 §3.3
--
-- Si elle en était une, le client devrait DEUX FOIS la même période : une fois
-- par ses factures mensuelles, une fois par la globale. `customer_invoice_total`
-- compterait les deux, et le solde client serait faux.
--
-- Le texte de la Direction le dit lui-même : « avec les détails et LES
-- HISTORIQUES DE PAYEMENT ». Une facture ne porte jamais l'historique de ses
-- propres règlements — un RELEVÉ, si. Le Plan 02 §3.3 et §15.1 rangent ce
-- document au LOT 24, et la consigne §10 confirme : « le LOT 23 doit préparer
-- les données nécessaires, sans absorber le LOT 24 ».
--
-- CE LOT PRÉPARE DONC LA DONNÉE — périodes, factures rattachées, règlements
-- déjà atteignables — ET NE PRODUIT AUCUN DOCUMENT DE SYNTHÈSE.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- §D. AUCUN BARÈME DE PÉNALITÉ — A-7, consigne §3
--
-- Ni base, ni taux, ni qualification comptable ne sont arrêtés. Aucune colonne
-- de pourcentage, aucune capacité `penalty`, aucun calcul. Le changement de
-- tarif à la prolongation réemploie `rental.pricing.override` — l'architecture
-- du LOT 22 — avec montant SAISI et raison écrite.
--
-- Catalogue : 196 → 197.
-- Périmètre de sauvegarde : 53 → 54 (migration 096).
-- =============================================================================


-- =============================================================================
-- 1. LES TYPES
--
-- `create type` peut être suivi, dans la MÊME migration, d'une utilisation de
-- la valeur créée : c'est `alter type … add value` qui ne le peut pas
-- (Plan 02 §9.5). Aucune valeur n'est ajoutée à un type existant ici.
-- =============================================================================

/*
 * LE RÉGIME DU CONTRAT — Plan 02 §9.2.
 *
 * `FIXED_TERM` par défaut : toutes les locations existantes restent exactement
 * ce qu'elles sont, et le régime de facturation ne change pour AUCUNE
 * (Plan 02 §19.4).
 */
do $$ begin
  create type public.rental_type as enum (
    'FIXED_TERM',  -- durée fixée : UNE facture, à la fin, comme aujourd'hui
    'LONG_TERM'    -- longue durée : facturation PAR PÉRIODE (A-6)
  );
exception when duplicate_object then null; end $$;

/*
 * LA CADENCE — 🟩 A-6, les DEUX cases cochées par la Direction.
 *
 *   MONTHLY        « chaque fin du mois, on établit une facture »
 *   CONTRACT_TERM  « facturation par période définie au contrat »
 *
 * AUCUNE TROISIÈME VALEUR. Ni hebdomadaire, ni trimestrielle, ni « à la
 * demande » : la Direction n'en a coché aucune, et une valeur d'énumération
 * qu'aucun métier ne réclame finirait par être employée faute de mieux.
 */
do $$ begin
  create type public.rental_billing_cadence as enum (
    'MONTHLY',
    'CONTRACT_TERM'
  );
exception when duplicate_object then null; end $$;

/*
 * L'ORIGINE D'UNE PÉRIODE — consigne §6 : « si elle provient d'une échéance
 * mensuelle, d'une période contractuelle ou d'un autre mécanisme explicitement
 * autorisé ».
 *
 * POURQUOI UN TYPE DISTINCT DE LA CADENCE, alors que les valeurs coïncident.
 *
 * La cadence est celle du contrat AUJOURD'HUI ; l'origine est celle de la
 * période LE JOUR OÙ ELLE A ÉTÉ OUVERTE. Un contrat qui passerait de mensuel à
 * contractuel garderait ses périodes mensuelles déjà ouvertes, et elles
 * doivent continuer à dire d'où elles viennent. Partager le type ferait
 * dépendre l'histoire du présent.
 */
do $$ begin
  create type public.rental_billing_origin as enum (
    'MONTHLY',
    'CONTRACT_TERM'
  );
exception when duplicate_object then null; end $$;

/*
 * L'ÉTAT D'UNE PÉRIODE — DEUX VALEURS, ET PAS UNE DE PLUS.
 *
 * Consigne §21 : « N'invente pas de statut inutile. »
 *
 * « À venir », « Facturable » et « Facturée » NE SONT PAS des états stockés :
 * ce sont des LECTURES, qui se déduisent de la période et de la facture qui la
 * couvre. Les stocker créerait une seconde vérité qu'un `PATCH` direct, une
 * annulation de facture ou le simple passage du temps ferait diverger —
 * exactement le défaut que `customer_invoices_overdue_is_derived` interdit
 * depuis le LOT 5 (DEC-025 §a).
 *
 * Ce qui ne se déduit de rien, en revanche, c'est L'ANNULATION : une période
 * ouverte puis abandonnée — retour anticipé, contrat annulé, régime corrigé —
 * n'est pas « à venir », et rien dans les dates ne le dirait.
 */
do $$ begin
  create type public.rental_billing_period_status as enum (
    'PLANNED',    -- ouverte ; facturable une fois échue
    'CANCELLED'   -- abandonnée : elle ne sera jamais facturée
  );
exception when duplicate_object then null; end $$;


-- =============================================================================
-- 2. LE RÉGIME SUR LE CONTRAT
--
-- DEUX COLONNES, COHÉRENTES ENTRE ELLES PAR CONTRAINTE.
--
-- La forme est celle de `vehicles_origin_supplier_coherent` (migration 015) :
-- une colonne qui n'a de sens que dans un régime est `null` dans l'autre, et la
-- base l'impose. Sans la contrainte, une location à durée fixée pourrait porter
-- une cadence mensuelle qui ne gouvernerait rien — une donnée qui ment.
-- =============================================================================

alter table public.rentals
  add column if not exists rental_type public.rental_type not null default 'FIXED_TERM';

alter table public.rentals
  add column if not exists billing_cadence public.rental_billing_cadence;

do $$ begin
  alter table public.rentals
    add constraint rentals_billing_cadence_coherent check (
      (rental_type = 'FIXED_TERM'  and billing_cadence is null)
      or
      (rental_type = 'LONG_TERM'   and billing_cadence is not null)
    );
exception when duplicate_object then null; end $$;

comment on column public.rentals.rental_type is
  'Régime de facturation du contrat (LOT 23). FIXED_TERM : une facture à la fin. LONG_TERM : une facture par période facturable (A-6).';
comment on column public.rentals.billing_cadence is
  'Cadence des périodes facturables d''une longue durée (A-6). NULL pour une durée fixée — la contrainte rentals_billing_cadence_coherent l''impose.';

create index if not exists rentals_long_term_idx
  on public.rentals (rental_type)
  where rental_type = 'LONG_TERM';


-- =============================================================================
-- 3. LA PÉRIODE FACTURABLE
--
-- CE QU'ELLE PORTE — consigne §6, point par point :
--
--   à quel contrat elle appartient        `rental_id`
--   quelle période elle couvre            `period`, semi-ouverte [début, fin)
--   son statut                            `status` (§1)
--   si elle est déjà facturée             LA FACTURE LE DIT — voir §4
--   quelle facture lui correspond         idem
--   quelle partie de la location          `period` et `sequence_no`
--   d'où elle provient                    `origin`
--
-- CE QU'ELLE NE PORTE PAS, ET POURQUOI
--
--   · AUCUN MONTANT — §B. Les lignes de facture sont la seule source d'un
--     total (Workflow 07 §22, §60), et un montant ici les démentirait ;
--   · AUCUN `invoice_id` — §4 : le lien vit sur la facture, et là seulement.
--     Deux colonnes se désignant l'une l'autre divergent à la première
--     annulation ;
--   · AUCUN VÉHICULE, AUCUN TARIF — ils vivent dans les SEGMENTS, qui restent
--     la source historique (§A, consigne §11, §12).
--
-- LA CONVENTION TEMPORELLE EST CELLE DU LOT 22 : `[début, fin)`. L'instant de
-- bascule appartient à la période SUIVANTE, et à elle seule. Aucun jour compté
-- deux fois, aucun manquant.
-- =============================================================================

create table public.rental_billing_periods (
  id           uuid primary key default gen_random_uuid(),

  rental_id    uuid not null references public.rentals (id) on delete restrict,

  -- 1, puis 2, puis 3 : le rang ORDONNE la facturation sans dépendre des dates.
  sequence_no  int  not null check (sequence_no >= 1),

  period       tstzrange not null,

  origin       public.rental_billing_origin not null,

  status       public.rental_billing_period_status not null default 'PLANNED',

  /*
   * L'avenant qui a OUVERT cette période. `null` = période du contrat initial.
   *
   * Même forme que `rental_segments.amendment_id` : une prolongation ouvre des
   * périodes, et l'on doit pouvoir répondre « laquelle, et par quel acte ».
   */
  amendment_id uuid references public.rental_amendments (id) on delete restrict,

  created_at   timestamptz not null default now(),
  created_by   uuid references public.app_users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.app_users (id) on delete set null,

  constraint rental_billing_periods_sequence_unique unique (rental_id, sequence_no),

  constraint rental_billing_periods_bounded check (
    not isempty(period) and lower(period) is not null and upper(period) is not null
  ),

  /*
   * DEUX PÉRIODES D'UN MÊME CONTRAT NE SE RECOUVRENT JAMAIS — consigne §6 :
   * « Les périodes facturables ne doivent jamais se chevaucher de manière
   *   permettant une double facturation du même intervalle. »
   *
   * UNE CONTRAINTE D'EXCLUSION, et non un déclencheur : elle ferme la course
   * entre deux saisies simultanées, qu'aucun déclencheur ne verrait (DEC-028).
   * C'est LA garantie structurelle du lot : même un appel PostgREST direct, même
   * la clé de service, ne peuvent pas ouvrir deux périodes sur le même
   * intervalle — donc pas deux factures sur le même temps.
   *
   * Les périodes ANNULÉES en sortent : une période abandonnée ne réserve rien,
   * et celle qui la remplace doit pouvoir reprendre son intervalle.
   */
  constraint rental_billing_periods_no_overlap exclude using gist (
    rental_id extensions.gist_uuid_ops with =,
    period with &&
  ) where (status <> 'CANCELLED')
);

comment on table public.rental_billing_periods is
  'Intervalle d''un contrat de location couvert par UNE facture, et une seule (A-6, LOT 23). Distincte du segment, qui porte le véhicule et le tarif.';
comment on column public.rental_billing_periods.period is
  'Période SEMI-OUVERTE [début, fin) : l''instant de bascule appartient à la période SUIVANTE. Même convention que rental_segments et vehicle_occupations.';
comment on column public.rental_billing_periods.origin is
  'Échéance mensuelle ou période contractuelle (consigne §6). Fixée à l''ouverture : elle dit d''où vient CETTE période, non ce qu''est le contrat aujourd''hui.';
comment on column public.rental_billing_periods.status is
  'PLANNED ou CANCELLED, et rien d''autre. « À venir », « Facturable » et « Facturée » se DÉDUISENT de la période et de sa facture (doctrine D1).';

create index rental_billing_periods_rental_idx
  on public.rental_billing_periods (rental_id, sequence_no);
create index rental_billing_periods_period_idx
  on public.rental_billing_periods using gist (period);

create trigger rental_billing_periods_set_updated_at
  before update on public.rental_billing_periods
  for each row execute function public.fn_set_updated_at();

create trigger rental_billing_periods_audit
  after insert or update on public.rental_billing_periods
  for each row execute function public.fn_audit_row('rental');

create trigger rental_billing_periods_no_delete
  before delete on public.rental_billing_periods
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- 4. LA FACTURE DÉSIGNE SA PÉRIODE — ET LE LIEN N'EXISTE QUE LÀ
--
-- Plan 02 §9.2 : « `customer_invoices` | `billing_period_id` (nullable) | 23 |
-- Remplace “une facture par location” ».
--
-- POURQUOI LE LIEN VIT SUR LA FACTURE, ET NON SUR LA PÉRIODE
--
-- Parce que c'est la facture qui s'annule. Une colonne `invoice_id` sur la
-- période devrait être remise à `null` à chaque annulation, et un oubli
-- laisserait une période réputée facturée par une facture annulée — sans
-- qu'aucune erreur ne soit levée. Le sens unique rend l'oubli impossible :
-- l'index partiel ci-dessous ignore les factures annulées, et la période
-- redevient facturable du seul fait de l'annulation.
-- =============================================================================

alter table public.customer_invoices
  add column if not exists billing_period_id uuid
    references public.rental_billing_periods (id) on delete restrict;

comment on column public.customer_invoices.billing_period_id is
  'Période facturable couverte par cette facture (LOT 23, A-6). NULL pour une facture de location à durée fixée ou de services.';

/*
 * UNE FACTURE DE PÉRIODE NOMME TOUJOURS SA LOCATION.
 *
 * Sans cette contrainte, une facture pourrait désigner une période sans
 * désigner le contrat : la chaîne Facture → Location → Client (§49) serait
 * rompue par la bande, et le contrôle de cohérence, qui part de `rental_id`,
 * ne s'exécuterait même pas.
 */
do $$ begin
  alter table public.customer_invoices
    add constraint customer_invoices_period_names_rental check (
      billing_period_id is null or rental_id is not null
    );
exception when duplicate_object then null; end $$;


-- =============================================================================
-- 5. LE REMPLACEMENT DE L'INDEX D'UNICITÉ — Plan 02 §19.3
--
-- L'OBSTACLE, IDENTIFIÉ PAR LE PLAN 02 §1.3 ET VÉRIFIÉ :
--
--   customer_invoices_one_per_rental_idx  (migration 051, ligne 226)
--     unique (rental_id) where rental_id is not null and status <> 'CANCELLED'
--
-- Il INTERDIT la facturation périodique : une longue durée de douze mois ne
-- pourrait porter qu'UNE facture.
--
-- ⚠ L'ORDRE EST IMPÉRATIF, et toute autre séquence ouvre une fenêtre pendant
-- laquelle une double facturation est possible :
--
--   1. la colonne (§4), déjà posée — toutes les factures existantes : NULL
--   2. CRÉER les deux index de remplacement          ← ICI
--   3. SEULEMENT ENSUITE supprimer l'ancien          ← ICI
--
-- CE QUI NE CHANGE POUR AUCUNE FACTURE EXISTANTE
--
-- Elles portent toutes `billing_period_id = NULL`. Le premier index les couvre
-- donc EXACTEMENT comme l'ancien : une location à durée fixée refuse toujours
-- une seconde facture. Plan 02 §19.3 : « Aucune location existante ne devient
-- facturable deux fois. »
--
-- ET LES DEUX INDEX SONT DISJOINTS : le premier ne voit que
-- `billing_period_id is null`, le second que `is not null`. Une facture tombe
-- dans l'un ou dans l'autre, jamais dans les deux, jamais dans aucun.
-- =============================================================================

-- 2. LES DEUX INDEX DE REMPLACEMENT — CRÉÉS D'ABORD.

/*
 * Régime « durée fixée » : UNE facture par location, comme depuis le LOT 5.
 * C'est l'ancien index, restreint aux factures qui ne visent pas de période.
 */
create unique index if not exists customer_invoices_one_per_fixed_rental_idx
  on public.customer_invoices (rental_id)
  where rental_id is not null
    and billing_period_id is null
    and status <> 'CANCELLED';

/*
 * Régime « longue durée » : UNE facture par PÉRIODE.
 *
 * C'est l'invariant central du lot : plusieurs factures peuvent appartenir au
 * même contrat, jamais deux au même intervalle. La consigne §7 l'exige mot pour
 * mot — « sans permettre de facturer deux fois la même période ».
 */
create unique index if not exists customer_invoices_one_per_period_idx
  on public.customer_invoices (billing_period_id)
  where billing_period_id is not null
    and status <> 'CANCELLED';

-- 3. L'ANCIEN INDEX, SUPPRIMÉ SEULEMENT MAINTENANT.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'customer_invoices_one_per_fixed_rental_idx'
  ) or not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'customer_invoices_one_per_period_idx'
  ) then
    raise exception
      'Refus de supprimer l''ancien index : ses deux remplaçants ne sont pas tous deux en place. La double facturation deviendrait possible.';
  end if;
end $$;

drop index if exists public.customer_invoices_one_per_rental_idx;


-- =============================================================================
-- 6. LA GARDE DES PÉRIODES
--
-- LA COHÉRENCE AVANT L'ACTEUR (migration 055) : les règles de cohérence sont
-- posées AVANT tout test de capacité, faute de quoi la clé de service — donc un
-- script — les contournerait.
--
-- `SECURITY DEFINER` : la fonction ne RENVOIE aucune ligne. Elle lit `rentals`,
-- `rental_segments` et `customer_invoices` EN BASE, et non ce que l'appelant a
-- le droit de voir — une garde qui compte à travers RLS conclut « aucun » et
-- laisse passer (migration 062).
-- =============================================================================

create or replace function public.fn_rental_billing_period_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r         public.rentals%rowtype;
  v_prev    public.rental_billing_periods%rowtype;
  v_max     int;
  v_start   timestamptz;
  v_end     timestamptz;
  v_month   timestamptz;
  v_invoice text;
begin
  -- Une restauration REMET ce qui a existé : elle n'a pas à rejouer une règle
  -- de cycle de vie (migration 075).
  if public.is_restoring() then return new; end if;

  /* --- 1. CE QUI NE SE RÉÉCRIT JAMAIS ------------------------------------- */
  if tg_op = 'UPDATE' then
    if new.rental_id   is distinct from old.rental_id
    or new.sequence_no is distinct from old.sequence_no
    or new.origin      is distinct from old.origin
    or new.amendment_id is distinct from old.amendment_id
    or lower(new.period) is distinct from lower(old.period)
    then
      raise exception
        'Opération refusée : le contrat, le rang, l''origine et le début d''une période facturable ne se réécrivent pas. Ils disent ce qui a été engagé.'
        using errcode = 'check_violation';
    end if;

    /*
     * UNE PÉRIODE DÉJÀ FACTURÉE NE BOUGE PLUS — consigne §4 et §7.
     *
     * « Une prolongation ne doit pas modifier rétroactivement une période
     *   historique déjà engagée ou facturée. »
     *
     * La facture reconnaît une créance SUR CET INTERVALLE. Le raccourcir ou
     * l'annuler ferait mentir un document déjà remis au client.
     */
    if new.period is distinct from old.period or new.status is distinct from old.status then
      select i.invoice_no into v_invoice
      from public.customer_invoices i
      where i.billing_period_id = new.id and i.status <> 'CANCELLED'
      limit 1;

      if v_invoice is not null then
        raise exception
          'Opération refusée : la période est couverte par la facture %. Une période facturée ne se raccourcit ni ne s''annule — annulez d''abord la facture.',
          v_invoice
          using errcode = 'check_violation';
      end if;
    end if;

    -- Une période annulée ne se rouvre pas : elle a dit qu'elle ne serait
    -- jamais facturée. Une période nouvelle reprend son intervalle.
    if old.status = 'CANCELLED' and new.status <> 'CANCELLED' then
      raise exception
        'Opération refusée : une période facturable annulée ne se rouvre pas. Ouvrez-en une nouvelle : l''historique gardera les deux.'
        using errcode = 'check_violation';
    end if;
  end if;

  /* --- 2. COHÉRENCE À L'OUVERTURE, pour tout acteur ----------------------- */
  if tg_op = 'INSERT' then
    select * into r from public.rentals where id = new.rental_id;

    if not found then
      raise exception 'Location introuvable.' using errcode = 'no_data_found';
    end if;

    /*
     * SEULE UNE LONGUE DURÉE A DES PÉRIODES FACTURABLES.
     *
     * Sans cette règle, une location à durée fixée pourrait porter à la fois sa
     * facture unique (index `…one_per_fixed_rental_idx`) et des factures de
     * période (index `…one_per_period_idx`) : les deux index sont disjoints, et
     * la même prestation serait facturée deux fois. C'est LE chemin de double
     * facturation que ce lot devait fermer.
     */
    if r.rental_type <> 'LONG_TERM' then
      raise exception
        'Opération refusée : seule une location de longue durée porte des périodes facturables. Définissez d''abord son régime de facturation.'
        using errcode = 'check_violation';
    end if;

    if r.status in ('CANCELLED', 'CLOSED') then
      raise exception
        'Opération refusée : cette location est % — elle ne reçoit plus de période facturable.',
        case r.status when 'CANCELLED' then 'annulée' else 'clôturée' end
        using errcode = 'check_violation';
    end if;

    -- Le rang suit la chronologie du contrat : 1, puis 2, puis 3.
    select coalesce(max(sequence_no), 0) into v_max
    from public.rental_billing_periods where rental_id = new.rental_id;

    if new.sequence_no <> v_max + 1 then
      raise exception
        'Opération refusée : la période facturable suivante de ce contrat porte le n° %, et non le n° %.',
        v_max + 1, new.sequence_no
        using errcode = 'check_violation';
    end if;

    /*
     * AUCUN TROU DANS LA COUVERTURE — la contrepartie du non-recouvrement.
     *
     * La contrainte d'exclusion interdit de facturer deux fois le même temps ;
     * la contiguïté interdit l'inverse — un intervalle de contrat qu'aucune
     * période ne couvrirait, et que personne ne facturerait jamais.
     */
    if v_max > 0 then
      select * into v_prev
      from public.rental_billing_periods
      where rental_id = new.rental_id and status <> 'CANCELLED'
      order by sequence_no desc
      limit 1;

      if found and lower(new.period) is distinct from upper(v_prev.period) then
        raise exception
          'Opération refusée : la période facturable n° % doit commencer exactement où la n° % s''achève (%). Aucun intervalle du contrat ne reste hors facturation.',
          new.sequence_no, v_prev.sequence_no,
          to_char(upper(v_prev.period) at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI')
          using errcode = 'check_violation';
      end if;
    end if;

    /*
     * LA PÉRIODE VIT DANS LA CHRONOLOGIE DU CONTRAT.
     *
     * Les bornes sont celles des SEGMENTS — la durée réellement engagée, celle
     * que le LOT 22 tient à jour au fil du cycle. Facturer avant le premier
     * engagement ou au-delà du dernier facturerait du temps qui n'existe pas.
     */
    select min(lower(period)), max(upper(period)) into v_start, v_end
    from public.rental_segments
    where rental_id = new.rental_id and status <> 'CANCELLED';

    if v_start is null then
      raise exception
        'Opération refusée : cette location n''a aucune période d''exploitation. Une facturation par période suppose une chronologie.'
        using errcode = 'no_data_found';
    end if;

    if lower(new.period) < v_start or upper(new.period) > v_end then
      raise exception
        'Opération refusée : la période facturable (% → %) sort de la durée engagée du contrat (% → %).',
        to_char(lower(new.period) at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI'),
        to_char(upper(new.period) at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI'),
        to_char(v_start at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI'),
        to_char(v_end   at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI')
        using errcode = 'check_violation';
    end if;

    -- La toute première période part du début du contrat : rien ne précède.
    if v_max = 0 and lower(new.period) <> v_start then
      raise exception
        'Opération refusée : la première période facturable commence au début du contrat (%).',
        to_char(v_start at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI')
        using errcode = 'check_violation';
    end if;

    /*
     * 🟩 A-6, MENSUEL — LA BORNE EST UNE FIN DE MOIS COMORIENNE.
     *
     * « Chaque fin du mois, on établit une facture. » Une période mensuelle
     * s'achève donc au premier instant du mois suivant, À MORONI — sauf la
     * dernière, qui s'achève avec le contrat.
     *
     * ⚠ `current_date` et `date_trunc` sont UTC. Un contrat commencé le 30
     * septembre à 22 h UTC est du 1er octobre à Moroni : sans la conversion, la
     * facture de septembre couvrirait un jour d'octobre.
     *
     * CE CONTRÔLE N'EST PAS UN CALCUL DE DURÉE (§B) : il ne compte aucun jour,
     * il vérifie une BORNE DE CALENDRIER.
     */
    if new.origin = 'MONTHLY' and upper(new.period) < v_end then
      v_month := date_trunc(
        'month',
        (lower(new.period) at time zone 'Indian/Comoro') + interval '1 month'
      ) at time zone 'Indian/Comoro';

      if upper(new.period) <> v_month then
        raise exception
          'Opération refusée : une période mensuelle s''achève à la fin du mois comorien (%), ou avec le contrat. Fin proposée : %.',
          to_char(v_month at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI'),
          to_char(upper(new.period) at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI')
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  /* --- 3. CAPACITÉS — DEC-024, A-14 --------------------------------------- */
  /*
   * DEUX CHEMINS OUVRENT UNE PÉRIODE, ET DEUX SEULEMENT :
   *
   *   · définir le régime de facturation   `rental.rentals.billing.plan`
   *     C'EST L'ACTE. Il décide que ce contrat se facture par période, et
   *     ouvre les périodes correspondantes ;
   *
   *   · prolonger le contrat               `rental.rentals.extend`
   *     C'EST UNE CONSÉQUENCE, jamais un acte — même doctrine que le gel du
   *     coût (LOT 22 §6.2). Prolonger un contrat mensuel allonge forcément son
   *     temps facturable ; ne pas ouvrir les périodes correspondantes
   *     laisserait un intervalle que personne ne pourrait facturer.
   *
   * `rental.rentals.update` N'EN OUVRE AUCUNE : corriger une note n'a jamais
   * supposé de décider comment un contrat se facture (A-14).
   */
  if tg_op = 'INSERT' then
    perform public.require_capability(
      array['rental.rentals.billing.plan', 'rental.rentals.extend'],
      'ouvrir une période facturable'
    );
  else
    /*
     * Une période se raccourcit ou s'annule au fil du cycle : retour anticipé,
     * annulation du contrat, régime corrigé.
     */
    perform public.require_capability(
      array[
        'rental.rentals.billing.plan',
        'rental.rentals.extend',
        'rental.rentals.return',
        'rental.rentals.cancel'
      ],
      'modifier une période facturable'
    );
  end if;

  return new;
end;
$$;

comment on function public.fn_rental_billing_period_guard() is
  'Une période facturable suit le rang du contrat, commence où la précédente s''achève, vit dans la chronologie engagée, respecte la fin de mois comorienne, et ne bouge plus dès qu''une facture la couvre.';

revoke execute on function public.fn_rental_billing_period_guard() from public;

create trigger rental_billing_periods_guard
  before insert or update on public.rental_billing_periods
  for each row execute function public.fn_rental_billing_period_guard();


-- =============================================================================
-- 7. LA COHÉRENCE DE LA FACTURE — RÉÉCRITE DEPUIS SA DERNIÈRE VERSION
--
-- ⚠ LA LEÇON DE LA MIGRATION 087, INSCRITE PAR LA 093 :
--
--   « Une policy — ou une fonction — réécrite se reprend à sa DERNIÈRE
--     version. » La 087 avait repris `rentals_update` depuis la 031 et perdu
--     deux capacités ajoutées par la 051, cassant l'émission de facture EN
--     SILENCE.
--
-- La dernière version de `fn_customer_invoice_coherence` n'est PAS celle de la
-- migration 051 : c'est celle de la **075**, qui lève l'exigence d'état pendant
-- une restauration (`and not public.is_restoring()`). C'est d'elle que part
-- cette réécriture, et le contrôle final vérifie que la clause y est toujours.
--
-- CE QUI S'AJOUTE — LES DEUX RÉGIMES, ET LEUR ÉTANCHÉITÉ
--
--   RÉGIME « DURÉE FIXÉE »   `billing_period_id is null`
--     inchangé depuis le LOT 5 : la location doit être « À facturer ».
--     ET le contrat ne doit PAS être en longue durée — sans quoi une facture
--     globale s'ajouterait aux factures de période, et le client devrait deux
--     fois la même chose (§C).
--
--   RÉGIME « LONGUE DURÉE »  `billing_period_id is not null`
--     la location n'a PAS à être « À facturer » : on facture en cours de
--     contrat, c'est tout l'objet du lot. Exigences propres :
--       · la période appartient à CETTE location ;
--       · elle n'est pas annulée ;
--       · ELLE EST ÉCHUE — 🟩 A-6, « chaque FIN du mois ». On ne facture pas
--         un temps qui n'a pas encore couru ;
--       · le contrat est bien en longue durée ;
--       · il n'est ni annulé ni clôturé.
--
-- L'IDENTITÉ CLIENT, ELLE, RESTE EXIGÉE DANS LES DEUX RÉGIMES : la chaîne
-- Facture → Location → Client ne se rompt jamais (§49).
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
begin
  if new.rental_id is null then
    -- Une facture de services ne vise ni location ni période. La contrainte
    -- `customer_invoices_period_names_rental` garantit qu'elle n'en vise pas
    -- non plus une par la bande.
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

      if v_status in ('CANCELLED', 'CLOSED') then
        raise exception
          'Opération refusée : la location % est % — elle ne reçoit plus de facture.',
          v_no, case v_status when 'CANCELLED' then 'annulée' else 'clôturée' end
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

comment on function public.fn_customer_invoice_coherence is
  'Une facture de location vise une location « À facturer » du MÊME client (§5, §49) — ou, en longue durée, une PÉRIODE ÉCHUE de ce contrat (A-6). Les deux régimes sont étanches.';


-- =============================================================================
-- 8. RLS
--
-- `has_permission(...)` est ENVELOPPÉE DANS UN SOUS-SELECT : une garde de RLS
-- s'évalue PAR LIGNE, et l'appel coûterait sinon un aller-retour par ligne de
-- la liste (migration 065).
--
-- LA PÉRIODE FACTURABLE SE LIT AVEC LE CONTRAT — et voici pourquoi aucune
-- capacité de lecture nouvelle n'est créée (CLAUDE.md §19 bis) :
--
--   Une période facturable ne porte NI MONTANT, NI COÛT, NI TARIF. Elle dit
--   « du 1er au 31 octobre, ce contrat se facture ». C'est l'organisation du
--   contrat, au même titre que ses dates — et qui a le droit de consulter une
--   location a le droit de savoir comment elle se facture. Une capacité de plus
--   ne fermerait qu'un ONGLET, et une permission qui ne fait que masquer une
--   carte n'en est pas une (DEC-036 §d, DEC-042 §d).
--
--   Ce qui EST confidentiel — les MONTANTS — vit dans `customer_invoices`,
--   gardée par `billing.customer_invoices.view`, et dans `rental_segment_costs`,
--   gardée par `rental.pricing.supplier.view`. Ni l'une ni l'autre n'est
--   ouverte ici.
-- =============================================================================

revoke all on public.rental_billing_periods from anon;

-- Rien ne se supprime, et `TRUNCATE` ne déclenche AUCUN déclencheur de ligne :
-- il contournerait `fn_forbid_delete` et effacerait le découpage de la créance
-- sans laisser une entrée au journal (DEC-039 §g).
revoke delete, truncate on public.rental_billing_periods from authenticated;

alter table public.rental_billing_periods enable row level security;

create policy rental_billing_periods_select on public.rental_billing_periods
  for select to authenticated
  using ((select public.has_permission('rental.rentals.view')));

create policy rental_billing_periods_insert on public.rental_billing_periods
  for insert to authenticated
  with check (
    (select public.has_permission('rental.rentals.billing.plan'))
    or (select public.has_permission('rental.rentals.extend'))
  );

/*
 * La policy d'écriture reste large ; c'est LA GARDE qui exige la capacité
 * correspondant à l'acte réellement demandé (migration 041 : « une policy large
 * n'est pas une permission d'acte »).
 */
create policy rental_billing_periods_update on public.rental_billing_periods
  for update to authenticated
  using (
    (select public.has_permission('rental.rentals.billing.plan'))
    or (select public.has_permission('rental.rentals.extend'))
    or (select public.has_permission('rental.rentals.return'))
    or (select public.has_permission('rental.rentals.cancel'))
  )
  with check (
    (select public.has_permission('rental.rentals.billing.plan'))
    or (select public.has_permission('rental.rentals.extend'))
    or (select public.has_permission('rental.rentals.return'))
    or (select public.has_permission('rental.rentals.cancel'))
  );


-- =============================================================================
-- 9. `rentals_update` — RÉÉCRITE DEPUIS SA DERNIÈRE VERSION, LA 093
--
-- ⚠ C'EST EXACTEMENT LE PIÈGE DE LA MIGRATION 087. La dernière version porte
-- DIX capacités (093) ; en oublier une casserait une fonctionnalité sans
-- rapport, et sans lever la moindre erreur — un `UPDATE` sous RLS ne modifie
-- rien et ne dit rien.
--
-- Les dix sont reprises MOT POUR MOT, et une onzième s'ajoute :
-- `rental.rentals.billing.plan`, qui écrit `rental_type` et `billing_cadence`
-- sur le contrat.
--
-- Le contrôle final compare la policy à la LISTE ATTENDUE, capacité par
-- capacité — un contrôle qui compterait n'aurait rien vu.
-- =============================================================================

drop policy if exists rentals_update on public.rentals;

create policy rentals_update on public.rentals
  for update to authenticated
  using (
    -- Le cycle d'exploitation (migrations 031 → 036)
    public.has_permission('rental.rentals.update')
    or public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.extend')
    or public.has_permission('rental.rentals.return')
    or public.has_permission('rental.rentals.close')
    or public.has_permission('rental.rentals.cancel')
    -- La facturation (migration 051) : « Facturée », puis retour « À facturer »
    or public.has_permission('billing.customer_invoices.issue')
    or public.has_permission('billing.customer_invoices.cancel')
    -- L'avenant (migration 087) : le véhicule courant suit son segment ouvert
    or public.has_permission('rental.rentals.swap')
    or public.has_permission('rental.pricing.override')
    -- Le régime de facturation (migration 094, LOT 23)
    or public.has_permission('rental.rentals.billing.plan')
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
    or public.has_permission('rental.rentals.swap')
    or public.has_permission('rental.pricing.override')
    or public.has_permission('rental.rentals.billing.plan')
  );


-- =============================================================================
-- 10. LE JOURNAL N'OUVRE PAS CE QUE LA TABLE FERME — DEC-038
--
-- La fonction est réécrite EN ENTIER : une omission se lirait comme une
-- suppression silencieuse. Les acquis des LOTS 20, 21 et 22 sont donc repris
-- mot pour mot, et le contrôle final les revérifie NOMMÉMENT.
--
-- `rental_billing_periods` s'ouvre par `rental.rentals.view` — la même capacité
-- que la table (§8). Le journal ne rend ni plus ni moins que la table.
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
-- 11. LA CAPACITÉ — UNE SEULE, ET LA JUSTIFICATION DE CHACUNE DES ABSENCES
--
-- La liste de colonnes ouvre par `(code, module_code` : c'est la forme que le
-- contrôle de parité TS/SQL (`permissions.test.ts`) reconnaît.
--
-- CE QUI EST CRÉÉ
--
--   `rental.rentals.billing.plan` — DÉFINIR LE RÉGIME DE FACTURATION d'un
--   contrat, et ouvrir ses périodes facturables.
--
--   La question de CLAUDE.md §19 bis, posée : « cette fonctionnalité doit-elle
--   pouvoir être attribuée séparément ? » OUI. Décider qu'un contrat se facture
--   chaque fin de mois plutôt qu'en une fois engage la reconnaissance du chiffre
--   d'affaires d'ADIKOM et la trésorerie qu'elle en attend. Un exploitant qui
--   corrige une note de contrat (`rental.rentals.update`) ne décide pas cela ;
--   celui qui enregistre un départ (`checkout`) non plus. AUCUNE capacité
--   existante ne couvre l'acte : ni `update`, ni `extend`, ni
--   `billing.customer_invoices.create` — préparer une facture n'est pas décider
--   du découpage des créances d'un contrat.
--
--   SENSIBLE : elle porte sur la façon dont ADIKOM réclame son argent.
--
-- CE QUI N'EST PAS CRÉÉ, ET POURQUOI
--
--   · `rental.rentals.billing.periods.view` — une période ne porte NI montant,
--     NI coût, NI tarif (§8). Une capacité de plus ne fermerait qu'un onglet ;
--
--   · `rental.rentals.extend` — ELLE EXISTE depuis la migration 007. La
--     prolongation par avenant réemploie l'acte plutôt que d'en créer un
--     second. Un code attribué ne se double pas ;
--
--   · toute capacité de changement de tarif à la prolongation —
--     `rental.pricing.override` EXISTE et gouverne déjà la dérogation depuis le
--     LOT 22 (Plan 02 §1.4, §10.3, consigne §5 : « Ne crée pas une permission
--     concurrente si la capacité existante couvre déjà correctement l'acte ») ;
--
--   · toute capacité de facture de période — `billing.customer_invoices.create`,
--     `.issue`, `.cancel` et `.view` EXISTENT et gouvernent déjà toute facture
--     client. Une facture de période EST une facture client : aucun second
--     système, aucune seconde capacité (consigne §7) ;
--
--   · `rental.rentals.penalty.*` — 🟥 A-7 n'est pas tranchée : ni base, ni taux,
--     ni qualification comptable. La fonctionnalité n'existe pas ; on ne crée
--     pas une permission pour ce qui n'existe pas (§D) ;
--
--   · `rental.rentals.statement.*` — la synthèse / le relevé global relève du
--     LOT 24 (§C). Rien n'est livré, rien n'est gouverné.
--
-- Catalogue : 196 → 197.
-- =============================================================================

with nouvelles (
  code, module_code, menu_code, menu_label, submenu_code, submenu_label,
  action, label, sous_rang, rang
) as (values
  ('rental.rentals.billing.plan', 'rental', 'rentals', 'Locations',
   'billing', 'Régime de facturation', 'ADMIN',
   'Définir le régime de facturation d''une location et ouvrir ses périodes', 14, 4)
)
insert into public.permissions (
  code, module_code, module_label, menu_code, menu_label,
  submenu_code, submenu_label, action, label, is_sensitive,
  module_order, menu_order, submenu_order, action_order
)
select
  n.code, n.module_code, 'Gestion de location',
  n.menu_code, n.menu_label, n.submenu_code, n.submenu_label,
  n.action::public.permission_action, n.label,
  -- SENSIBLE : l'acte décide comment ADIKOM réclame son argent sur ce contrat.
  true,
  5, 3, n.sous_rang, n.rang
from nouvelles n
on conflict (code) do update set
  module_label  = excluded.module_label,
  menu_label    = excluded.menu_label,
  submenu_code  = excluded.submenu_code,
  submenu_label = excluded.submenu_label,
  label         = excluded.label,
  is_sensitive  = excluded.is_sensitive,
  module_order  = excluded.module_order,
  menu_order    = excluded.menu_order,
  submenu_order = excluded.submenu_order,
  action_order  = excluded.action_order;


-- =============================================================================
-- 12. CONTRÔLES
--
-- LE TOTAL DU CATALOGUE EST AFFIRMÉ ICI, ET NULLE PART AILLEURS (DEC-046). Une
-- migration énonce un fait DATÉ et n'a jamais à être rouverte ; les recettes,
-- elles, nomment les capacités qu'elles éprouvent.
-- =============================================================================

do $$
declare
  v_total       int;
  v_attendu     text[] := array[
    'rental.rentals.update',
    'rental.rentals.checkout',
    'rental.rentals.extend',
    'rental.rentals.return',
    'rental.rentals.close',
    'rental.rentals.cancel',
    'billing.customer_invoices.issue',
    'billing.customer_invoices.cancel',
    'rental.rentals.swap',
    'rental.pricing.override',
    'rental.rentals.billing.plan'
  ];
  v_using       text;
  v_check       text;
  v_manquantes  text[];
  v_code        text;
  v_def         text;
  v_interdites  text[];
begin
  /* --- 1. LA CAPACITÉ, ET AUCUNE DE PLUS -------------------------------- */
  if not exists (
    select 1 from public.permissions
    where code = 'rental.rentals.billing.plan' and is_sensitive
  ) then
    raise exception '`rental.rentals.billing.plan` absente, ou non marquée sensible.';
  end if;

  select array_agg(code) into v_interdites
  from public.permissions
  where code like 'rental.rentals.penalty%'
     or code like 'rental.rentals.statement%'
     or code like 'rental.rentals.period%'
     or code like 'rental.rentals.billing.periods%'
     or code like '%.globale%';

  if v_interdites is not null then
    raise exception
      'Capacités interdites au LOT 23 : %. A-7 n''est pas tranchée, et le relevé global relève du LOT 24.',
      v_interdites;
  end if;

  select count(*) into v_total from public.permissions;
  if v_total <> 197 then
    raise exception 'Catalogue attendu à 197 capacités, trouvé %.', v_total;
  end if;

  /* --- 2. `rentals_update` PORTE SES ONZE CAPACITÉS ---------------------- */
  select qual, with_check into v_using, v_check
  from pg_policies
  where schemaname = 'public' and tablename = 'rentals' and policyname = 'rentals_update';

  if v_using is null or v_check is null then
    raise exception 'La policy `rentals_update` est absente ou incomplète.';
  end if;

  v_manquantes := '{}';
  foreach v_code in array v_attendu loop
    if v_using not like '%' || v_code || '%' then
      v_manquantes := v_manquantes || (v_code || ' (using)');
    end if;
    if v_check not like '%' || v_code || '%' then
      v_manquantes := v_manquantes || (v_code || ' (with check)');
    end if;
  end loop;

  if array_length(v_manquantes, 1) > 0 then
    raise exception
      'La policy `rentals_update` a perdu des capacités : %. Une policy réécrite se reprend à sa DERNIÈRE version (migration 093).',
      v_manquantes;
  end if;

  /* --- 3. LES DEUX INDEX DISJOINTS, ET L'ANCIEN RETIRÉ ------------------- */
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'customer_invoices_one_per_rental_idx'
  ) then
    raise exception
      'L''ancien index `customer_invoices_one_per_rental_idx` est encore là : la facturation périodique resterait impossible.';
  end if;

  select indexdef into v_def from pg_indexes
  where schemaname = 'public' and indexname = 'customer_invoices_one_per_fixed_rental_idx';

  if v_def is null or v_def not like '%billing_period_id IS NULL%' then
    raise exception
      'L''index des locations à durée fixée ne se restreint pas aux factures sans période : les deux régimes ne seraient pas disjoints.';
  end if;

  select indexdef into v_def from pg_indexes
  where schemaname = 'public' and indexname = 'customer_invoices_one_per_period_idx';

  if v_def is null or v_def not like '%billing_period_id IS NOT NULL%' then
    raise exception
      'L''index d''unicité par période est absent ou mal restreint : la même période pourrait être facturée deux fois.';
  end if;

  /* --- 4. LA COHÉRENCE N'A PAS PERDU LA REPRISE (migration 075) ---------- */
  select pg_get_functiondef('public.fn_customer_invoice_coherence()'::regprocedure) into v_def;

  if v_def not like '%is_restoring%' then
    raise exception
      '`fn_customer_invoice_coherence` a perdu la levée d''état pendant une restauration (migration 075). Toute restauration échouerait.';
  end if;

  if v_def not like '%billing_period_id%' then
    raise exception '`fn_customer_invoice_coherence` ignore les périodes facturables.';
  end if;

  /* --- 5. LE JOURNAL N'A RIEN PERDU -------------------------------------- */
  foreach v_code in array array[
    'rental_segment_costs', 'supplier_vehicle_rates', 'service_variant_costs',
    'maintenance_costs', 'rental_amendments', 'rental_segments',
    'rental_billing_periods'
  ] loop
    if public.audit_detail_permission(v_code) is null then
      raise exception
        'Le journal a perdu la correspondance de « % » : son détail se refermerait sur le seul Super Admin, en silence.',
        v_code;
    end if;
  end loop;

  if public.audit_detail_permission('rental_segment_costs') <> 'rental.pricing.supplier.view' then
    raise exception 'Le journal ouvrirait le coût gelé à qui ne peut pas le lire (A-2).';
  end if;

  if public.audit_detail_permission('rental_billing_periods') <> 'rental.rentals.view' then
    raise exception 'La période facturable doit se lire avec le contrat, ni plus ni moins.';
  end if;

  /* --- 6. LES ACQUIS DES LOTS ANTÉRIEURS, INTACTS ------------------------ */
  if exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'pricing_rules' and c.contype = 'x'
  ) then
    raise exception
      'Une contrainte d''exclusion a été posée sur `pricing_rules` : le Plan 02 §5.7 reste écarté, DEC-002 départage par date de création.';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'vehicles_origin_attachment_coherent'
  ) then
    raise exception
      '`vehicles_origin_attachment_coherent` a disparu : P-2 n''est pas tranchée, aucune fiche fournisseur « ADIKOM » ne doit exister.';
  end if;

  /* --- 7. LE RÉGIME PAR DÉFAUT NE CHANGE AUCUNE LOCATION ----------------- */
  if exists (select 1 from public.rentals where rental_type <> 'FIXED_TERM') then
    raise exception
      'Une location existante a changé de régime : Plan 02 §19.4 exige FIXED_TERM par défaut, pour toutes.';
  end if;

  if exists (select 1 from public.customer_invoices where billing_period_id is not null) then
    raise exception 'Une facture existante s''est vue rattacher une période : aucune donnée n''est réinterprétée.';
  end if;

  raise notice
    '[OK] 094. Longue durée, cadence et périodes facturables : schéma posé, deux index disjoints, catalogue à % capacités.',
    v_total;
end $$;
