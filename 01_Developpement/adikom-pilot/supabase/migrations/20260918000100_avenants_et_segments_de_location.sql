-- =============================================================================
-- ADIKOM PILOT — 087 · Avenants, segments de location et remplacement de véhicule
-- LOT 22 — DEC-045 · Plan 02 §7.3, §9.1, §9.4, §10.2, §19.2
--
-- LA DÉCISION QUI COMMANDE TOUT LE LOT — A-4, Direction du 11/09/2026 :
--
--   « On garde le même contrat et on rajoute des avenants. »
--
-- Un remplacement de véhicule NE CRÉE DONC PAS un nouveau contrat. Le contrat
-- reste le contrat ; ce qui change est consigné par un AVENANT, et ce qui en
-- résulte vit dans des SEGMENTS.
--
--   rental_amendments        L'ACTE   — n°, type, date d'effet, motif, auteur
--         │
--         └──▶ rental_segments        LA CONSÉQUENCE — véhicule, période,
--                     │                tarif client verrouillé
--                     │
--                     └──▶ rental_segment_costs   LE COÛT GELÉ — confidentiel
--
-- CE QUE CETTE MIGRATION LIVRE
--
--   · `rental_amendments` — l'avenant, acte métier numéroté et motivé ;
--   · `rental_segments`   — véhicule + période + TARIF CLIENT VERROUILLÉ ;
--   · `rental_segment_costs` — le COÛT D'ACQUISITION GELÉ à l'engagement du
--     segment, dans SA PROPRE TABLE parce que RLS filtre des lignes, pas des
--     colonnes (leçon centrale du LOT 21) ;
--   · `vehicle_occupations.rental_segment_id` — une occupation par segment ;
--   · deux ACTES : remplacer le véhicule, forcer le tarif ;
--   · UNE capacité nouvelle, `rental.rentals.swap`, et pas une de plus.
--
-- CE QU'ELLE NE LIVRE PAS
--
--   · AUCUNE facturation périodique, AUCUNE période facturable : LOT 23 ;
--   · AUCUNE pénalité — A-7 n'est pas tranchée (Plan 02 §3.1). Un changement de
--     tarif est ici un acte EXPLICITE et MOTIVÉ, jamais un barème appliqué ;
--   · AUCUNE synthèse de location : LOT 24 ;
--   · AUCUNE modification de `pricing_rules` : DEC-002 reste en vigueur, et le
--     Plan 02 §5.7 reste écarté (Rapport 13 §5) ;
--   · AUCUNE touche à `service_variant_costs` : P-5 reste ouverte ;
--   · AUCUN coût inventé pour un véhicule ADIKOM ou de partenariat.
--
-- 🟩 A-3 — « ADIKOM EST UN FOURNISSEUR », ET CE QUE LE LOT 22 EN FAIT
--
-- La Direction a répondu : « même modèle de tarification que chez les
-- fournisseurs car on considère que ADIKOM est un fournisseur ». Le LOT 22
-- applique cette décision LÀ OÙ ELLE PORTE : le coût d'un segment se résout et
-- se gèle PAR LE MÊME MÉCANISME pour tous les véhicules — un seul résolveur,
-- une seule table de versions, une seule table de coût gelé. Aucun second
-- système n'est créé pour les véhicules ADIKOM.
--
-- Ce que la décision NE DIT TOUJOURS PAS, et que ce lot n'invente pas : ce
-- qu'EST ce coût interne — tarif de référence fixé, ou coût de revient calculé
-- (P-2, Plan 02 §3.2). Tant que la Direction ne l'a pas écrit, aucun montant ne
-- s'enregistre sur un véhicule ADIKOM ; le résolveur ne rend rien, le coût gelé
-- est ABSENT, et la commission reste NON CALCULÉE plutôt que fausse.
-- AUCUNE FICHE FOURNISSEUR « ADIKOM » N'EST CRÉÉE, aucune origine de véhicule
-- n'est déplacée, `vehicles_origin_attachment_coherent` est intacte.
--
-- 🟥 VÉHICULE DE PARTENARIAT — aucune décision n'existe. Même traitement, et le
-- point reste ouvert, nommé, non comblé.
--
-- LA CONVENTION TEMPORELLE — `[)`, ET CE N'EST PAS UN DÉTAIL
--
-- `vehicle_occupations.period` et `rentals.planned_period` sont des `tstzrange`
-- SEMI-OUVERTS : borne basse INCLUSE, borne haute EXCLUE. Les segments adoptent
-- la même convention, et la bascule cesse d'être ambiguë :
--
--   Véhicule A   [ 01/09 00:00 , 05/09 08:00 )   ← 05/09 08:00 n'en fait PAS partie
--   Véhicule B   [ 05/09 08:00 , 10/09 00:00 )   ← 05/09 08:00 lui appartient
--
-- L'instant de bascule appartient au NOUVEAU segment, et à lui seul. Aucun
-- recouvrement, aucun trou : la base l'impose par une contrainte d'exclusion ET
-- par un contrôle de contiguïté.
--
-- Catalogue : 195 → 196.
-- =============================================================================


-- =============================================================================
-- 1. LES TYPES
--
-- `create type` peut être suivi, dans la MÊME migration, d'une utilisation de
-- la valeur créée : c'est `alter type … add value` qui ne le peut pas
-- (Plan 02 §9.5). Rien n'est donc scindé ici.
-- =============================================================================

-- Un segment ANNULÉ n'a jamais été exécuté — véhicule remplacé avant même le
-- départ, ou contrat annulé. Il ne se confond pas avec un segment TERMINÉ, qui
-- a couru. Les deux restent lisibles ; aucun ne se supprime.
do $$ begin
  create type public.rental_segment_status as enum (
    'ACTIVE',     -- segment en cours — un seul par location
    'ENDED',      -- segment clos : il a couru, puis un autre a pris le relais
    'CANCELLED'   -- segment jamais exécuté
  );
exception when duplicate_object then null; end $$;

/*
 * LES TROIS NATURES D'AVENANT du Plan 02 §7.3.
 *
 * `EXTENSION` figure dans le vocabulaire parce que la Direction parle d'UN SEUL
 * objet — l'avenant — et que la prolongation en est une forme. Mais LE LOT 22
 * NE LA PRODUIT PAS : la prolongation relève du LOT 23, où elle rencontrera les
 * périodes facturables. La garde REFUSE cette valeur et nomme le lot, plutôt
 * que de laisser croire qu'un avenant de prolongation existe déjà.
 */
do $$ begin
  create type public.rental_amendment_type as enum (
    'VEHICLE_CHANGE',  -- changement de véhicule (A-4)
    'EXTENSION',       -- prolongation — LOT 23, refusée ici
    'RATE_CHANGE'      -- changement de tarif sur le contrat (A-5, A-7)
  );
exception when duplicate_object then null; end $$;


-- =============================================================================
-- 2. NUMÉROTATION — DEC-005
--
-- `AVN-2026-000001`. Un avenant est une PIÈCE CONTRACTUELLE datée : il porte
-- l'année et se remet à zéro chaque exercice, comme la réservation (RES), la
-- location (LOC) et la facture. Le format reste paramétrable depuis Paramètres :
-- aucun format n'est codé en dur.
-- =============================================================================

insert into public.numbering_rules
  (entity_key, label, prefix, include_year, padding, reset_yearly)
values
  ('rental_amendment', 'Avenant de location', 'AVN', true, 6, true)
on conflict (entity_key) do nothing;


-- =============================================================================
-- 3. L'AVENANT — L'ACTE
--
-- CE QU'IL PORTE, ET RIEN DE PLUS.
--
-- Le Plan 02 §6 met en garde : « Ne stocke pas inutilement des duplications si
-- les données peuvent être résolues depuis les segments. » L'ancien véhicule,
-- le nouveau, l'ancienne période, l'ancien tarif : tout cela SE LIT dans les
-- segments, par `amendment_id` et par `sequence_no`. Les recopier ici créerait
-- deux vérités qui divergeraient à la première correction.
--
-- Ce qui N'EST PAS résoluble depuis les segments, et qui vit donc ici :
--
--   · la NATURE de l'acte ;
--   · sa DATE D'EFFET — l'instant de bascule voulu, distinct de l'instant où
--     l'avenant a été saisi ;
--   · son MOTIF, obligatoire (Plan 02 §12) ;
--   · L'EXCEPTION TARIFAIRE et sa raison — A-5. Une décision n'est pas un état :
--     le segment dit QUEL prix s'applique, l'avenant dit QUI a décidé de
--     s'écarter du barème et POURQUOI ;
--   · l'auteur et l'horodatage.
--
-- UN AVENANT NE SE RÉÉCRIT PAS. Ni policy `update`, ni droit `UPDATE` : c'est
-- un acte, pas une fiche. Une erreur se corrige par un avenant suivant.
-- =============================================================================

create table public.rental_amendments (
  id            uuid primary key default gen_random_uuid(),

  -- AVN-2026-000001
  amendment_no  text not null unique,

  rental_id     uuid not null references public.rentals (id) on delete restrict,

  -- « Avenant n° 2 au contrat LOC-2026-000352 » : le rang dans SON contrat.
  sequence_no   int  not null check (sequence_no >= 1),

  kind          public.rental_amendment_type not null,

  -- L'instant de bascule. Distinct de `created_at` : un remplacement survenu
  -- hier se consigne aujourd'hui, et c'est HIER qui fait foi pour l'historique.
  effective_at  timestamptz not null,

  -- Plan 02 §12 : « Avenant … `UPDATE` … ✅ + motif ». Obligatoire, jamais vide.
  reason        text not null check (length(btrim(reason)) > 0),
  notes         text,

  /*
   * 🟩 A-5 — « Généralement le client paie le nouveau tarif, toutefois des
   * situations peuvent se présenter autrement et on les gère selon le
   * contexte. »
   *
   * Le cas ordinaire : le tarif du nouveau véhicule est RÉSOLU par
   * `resolve_pricing_rule`, et le client le paie. Le cas d'exception : ADIKOM
   * applique un autre montant — l'ancien tarif, ou toute autre condition.
   *
   * L'EXCEPTION N'EST JAMAIS SILENCIEUSE. Elle exige `rental.pricing.override`,
   * elle porte SA propre raison écrite, elle est journalisée sous
   * `PRICE_CHANGE`, et l'écran la montre. « Généralement » ne devient pas une
   * règle absolue, et une dérogation ne devient pas un réglage muet.
   */
  rate_override        boolean not null default false,
  rate_override_reason text,

  created_at    timestamptz not null default now(),
  created_by    uuid references public.app_users (id) on delete set null,

  constraint rental_amendments_sequence_unique unique (rental_id, sequence_no),

  -- Une exception tarifaire sans raison écrite serait exactement la
  -- modification silencieuse que la consigne interdit (§8).
  constraint rental_amendments_override_motivated check (
    not rate_override
    or (rate_override_reason is not null and length(btrim(rate_override_reason)) > 0)
  )
);

comment on table public.rental_amendments is
  'Avenant à un contrat de location (A-4). Le contrat ne change pas d''identité : l''avenant consigne l''acte, les segments en portent les effets.';
comment on column public.rental_amendments.effective_at is
  'Instant de bascule voulu. Distinct de created_at : un remplacement survenu hier se consigne aujourd''hui, et c''est hier qui fait foi.';
comment on column public.rental_amendments.rate_override is
  'Vrai lorsque le tarif appliqué s''écarte de celui que le résolveur propose (A-5). Exige `rental.pricing.override` et une raison écrite.';

create index rental_amendments_rental_idx on public.rental_amendments (rental_id, sequence_no);
create index rental_amendments_effective_idx on public.rental_amendments (effective_at desc);

create trigger rental_amendments_audit
  after insert or update on public.rental_amendments
  for each row execute function public.fn_audit_row('rental');

/*
 * Un avenant qui FORCE un tarif écrit en plus un `PRICE_CHANGE` — Plan 02 §12 :
 * « Tarif forcé sur un segment (`rental.pricing.override`) | PRICE_CHANGE |
 * rental | ✅ avec motif obligatoire ».
 *
 * La fonction du LOT 20 est RÉEMPLOYÉE telle quelle : aucune fonction d'audit
 * nouvelle n'est créée. La clause `when` évite qu'un avenant ordinaire, qui ne
 * touche à aucun prix, se range parmi les changements de tarif.
 */
create trigger rental_amendments_price_audit
  after insert on public.rental_amendments
  for each row when (new.rate_override)
  execute function public.fn_audit_price_row('rental');

create trigger rental_amendments_no_delete
  before delete on public.rental_amendments
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- 4. LE SEGMENT — VÉHICULE, PÉRIODE, TARIF CLIENT VERROUILLÉ
--
-- POURQUOI LE TARIF EST UNE COPIE, ET NON UNE RÉFÉRENCE — D13.
--
-- `reservations` et `rentals` verrouillent déjà `locked_amount / unit / rule_id
-- / source / at` depuis la migration 031. Le segment reprend EXACTEMENT la même
-- forme, pour la même raison : une révision du barème ne doit pas retarifer un
-- engagement pris. Aucun nom n'est inventé, aucune colonne n'est renommée.
--
-- POURQUOI LE COÛT N'EST PAS ICI.
--
-- Il serait rendu par un `select *` à quiconque consulte une location. RLS
-- filtre des LIGNES, pas des COLONNES — c'est la leçon centrale du LOT 21, et
-- elle vaut ici mot pour mot. Le coût gelé vit donc dans `rental_segment_costs`
-- (§5), gardée par `rental.pricing.supplier.view` et par elle seule.
--
-- CE QUI EST LISIBLE AVEC QUOI
--
--   `rental.rentals.view`            → le segment : véhicule, période, rang
--   `rental.rentals.financial.view`  → son tarif client (filtrage d'écran,
--                                      exactement comme sur `rentals`)
--   `rental.pricing.supplier.view`   → son coût gelé, et rien d'autre ne l'ouvre
-- =============================================================================

create table public.rental_segments (
  id            uuid primary key default gen_random_uuid(),

  rental_id     uuid not null references public.rentals (id)  on delete restrict,
  vehicle_id    uuid not null references public.vehicles (id) on delete restrict,

  -- 1 pour le segment initial, puis 2, 3 … Le rang ORDONNE la chronologie sans
  -- dépendre des dates : deux segments contigus partagent un instant de bascule.
  sequence_no   int  not null check (sequence_no >= 1),

  -- L'avenant qui a OUVERT ce segment. `null` = segment initial du contrat.
  amendment_id  uuid references public.rental_amendments (id) on delete restrict,

  period        tstzrange not null,

  status        public.rental_segment_status not null default 'ACTIVE',

  -- --- Tarif client verrouillé — même forme que `rentals` (D13) -------------
  locked_amount  bigint not null check (locked_amount >= 0),
  locked_unit    public.pricing_unit not null,
  locked_rule_id uuid references public.pricing_rules (id) on delete set null,
  -- `STANDARD`, `CATEGORY`, `CLIENT_VEHICLE`… tels que `resolve_pricing_rule`
  -- les nomme, ou `OVERRIDE` lorsqu'un tarif a été forcé (A-5).
  locked_source  text,
  locked_at      timestamptz not null default now(),

  created_at    timestamptz not null default now(),
  created_by    uuid references public.app_users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.app_users (id) on delete set null,

  constraint rental_segments_sequence_unique unique (rental_id, sequence_no),

  constraint rental_segments_period_bounded check (
    not isempty(period) and lower(period) is not null and upper(period) is not null
  ),

  /*
   * DEUX SEGMENTS D'UN MÊME CONTRAT NE SE RECOUVRENT PAS — Plan 02 §9.4.
   *
   * Une CONTRAINTE D'EXCLUSION, et non un déclencheur : elle ferme la course
   * entre deux saisies simultanées, qu'aucun déclencheur ne verrait (DEC-028).
   * Les segments ANNULÉS en sortent : un segment jamais exécuté ne réserve rien,
   * et le segment qui l'a remplacé reprend sa période entière.
   */
  constraint rental_segments_no_overlap exclude using gist (
    rental_id extensions.gist_uuid_ops with =,
    period with &&
  ) where (status <> 'CANCELLED')
);

comment on table public.rental_segments is
  'Période d''un contrat de location pendant laquelle UN véhicule est affecté, au tarif client verrouillé. Le contrat ne change pas : ce sont ses segments qui se succèdent (A-4).';
comment on column public.rental_segments.period is
  'Période SEMI-OUVERTE [début, fin) : l''instant de bascule appartient au segment SUIVANT. Même convention que vehicle_occupations et rentals.planned_period.';
comment on column public.rental_segments.locked_amount is
  'Copie du tarif client au moment où le segment est ouvert. Une révision du barème ne l''atteint plus (D13). Le COÛT, lui, vit dans rental_segment_costs.';
comment on column public.rental_segments.locked_source is
  'Origine du tarif telle que resolve_pricing_rule la nomme, ou OVERRIDE lorsqu''un tarif a été forcé sous rental.pricing.override (A-5).';

create index rental_segments_rental_idx  on public.rental_segments (rental_id, sequence_no);
create index rental_segments_vehicle_idx on public.rental_segments (vehicle_id);
create index rental_segments_period_idx  on public.rental_segments using gist (period);

-- UN SEUL SEGMENT OUVERT PAR CONTRAT — Plan 02 §9.4. C'est lui qui dit quel
-- véhicule est affecté aujourd'hui ; deux le rendraient indécidable.
create unique index rental_segments_one_active_idx
  on public.rental_segments (rental_id)
  where status = 'ACTIVE';

create trigger rental_segments_set_updated_at
  before update on public.rental_segments
  for each row execute function public.fn_set_updated_at();

create trigger rental_segments_audit
  after insert or update on public.rental_segments
  for each row execute function public.fn_audit_row('rental');

create trigger rental_segments_no_delete
  before delete on public.rental_segments
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- 5. LE COÛT GELÉ — `locked_cost_*`, ET POURQUOI IL A SA PROPRE TABLE
--
-- L'ÉCART QUE LE LOT 21 AVAIT NOMMÉ (Rapport 13 §12.3, §23) :
--
--   « La commission se RECALCULE à la date du contrat. Une saisie rétroactive
--     délibérée la déplace ; `locked_cost_*` fermera l'écart au LOT 22. »
--
-- C'est fait ici. À l'ouverture d'un segment — donc à L'ENGAGEMENT, et jamais
-- avant —, le coût d'acquisition applicable À LA DATE MÉTIER DU SEGMENT est
-- résolu une fois, puis GELÉ. Une version de tarif fournisseur ouverte plus tard
-- à une date d'effet passée ne le déplace plus.
--
-- CE QUI RESTE CORRIGIBLE, ET CE QUI NE L'EST PLUS
--
--   · le coût GELÉ d'un segment          → JAMAIS. Ni update, ni delete.
--   · les VERSIONS de tarif fournisseur  → oui, comme au LOT 21 : elles se
--     closent, s'ouvrent et se retirent. Elles gouvernent les segments À VENIR,
--     plus ceux qui sont déjà engagés.
--   · un segment ouvert par erreur       → il ne se corrige pas : un avenant
--     suivant ouvre le segment juste, et l'histoire garde les deux.
--
-- POURQUOI UNE TABLE SÉPARÉE, ET NON DES COLONNES SUR LE SEGMENT
--
-- Parce que RLS filtre des LIGNES. `rental_segments` s'ouvre par
-- `rental.rentals.view` — un exploitant doit voir quel véhicule a servi et
-- quand. Si le coût y figurait, ce même `select` le lui rendrait. Précédents :
-- `maintenance_costs` (044), `service_variant_costs` (081),
-- `supplier_vehicle_rates` (083).
-- =============================================================================

create table public.rental_segment_costs (
  -- `id` en clé primaire, et `segment_id` UNIQUE : la forme de toutes les tables
  -- du projet. Les fonctions génériques d'audit désignent la ligne par `id` —
  -- une table qui n'en porterait pas ferait échouer sa propre journalisation.
  id            uuid primary key default gen_random_uuid(),

  segment_id    uuid not null unique references public.rental_segments (id) on delete restrict,

  -- Redondant avec le segment, et utile : il permet d'agréger les coûts d'un
  -- contrat sans joindre une table dont la policy est plus ouverte.
  rental_id     uuid not null references public.rentals (id) on delete restrict,

  amount        bigint not null check (amount > 0),
  unit          public.pricing_unit not null,
  currency_code text   not null default 'KMF',

  supplier_id   uuid references public.suppliers (id) on delete restrict,
  -- La version de tarif d'où vient ce montant. Elle peut être retirée plus
  -- tard : le montant gelé, lui, ne bouge pas.
  rate_id       uuid references public.supplier_vehicle_rates (id) on delete set null,

  -- LA DATE MÉTIER de la résolution — le premier jour du segment, jour
  -- comorien. C'est elle qui rend le gel vérifiable : on peut rejouer la
  -- question et constater qu'elle avait cette réponse-là.
  resolved_on   date        not null,
  locked_at     timestamptz not null default now()
);

comment on table public.rental_segment_costs is
  'Coût d''acquisition GELÉ à l''ouverture d''un segment (LOT 22). Donnée interne : sa lecture exige `rental.pricing.supplier.view`, et elle ne figure sur aucun document client. Ne se modifie jamais.';
comment on column public.rental_segment_costs.resolved_on is
  'Jour COMORIEN du début du segment. Le coût a été résolu à cette date, et y reste attaché quoi qu''il advienne ensuite des versions de tarif.';

create index rental_segment_costs_rental_idx on public.rental_segment_costs (rental_id);

create trigger rental_segment_costs_audit
  after insert on public.rental_segment_costs
  for each row execute function public.fn_audit_price_row('rental');

create trigger rental_segment_costs_no_delete
  before delete on public.rental_segment_costs
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- 6. UNE OCCUPATION PAR SEGMENT
--
-- L'OBSTACLE QUE LE PLAN 02 §1.3 AVAIT IDENTIFIÉ :
--
--   « `vehicle_occupations` filtré par `rental_id` — cinq fonctions.
--     `extend_rental` toucherait TOUTES les occupations d'une location
--     segmentée. »
--
-- Il est réel. Après un remplacement, `source = 'RENTAL' and source_id = <la
-- location>` désigne DEUX lignes, sur DEUX véhicules. Prolonger la location
-- allongerait alors aussi l'engagement du véhicule rendu — qui bloquerait un
-- créneau pour rien, et refuserait une autre location.
--
-- La colonne lève l'ambiguïté : chaque occupation nomme LE SEGMENT qu'elle sert.
-- Les cinq fonctions du cycle sont reprises en conséquence (migration 089).
--
-- NULLABLE, et elle le restera : une occupation de maintenance, de réservation
-- ou d'immobilisation n'a pas de segment.
-- =============================================================================

alter table public.vehicle_occupations
  add column if not exists rental_segment_id uuid
    references public.rental_segments (id) on delete restrict;

comment on column public.vehicle_occupations.rental_segment_id is
  'Segment de location servi par cette occupation (LOT 22). NULL pour une réservation, une maintenance ou une immobilisation.';

create index if not exists vehicle_occupations_segment_idx
  on public.vehicle_occupations (rental_segment_id)
  where rental_segment_id is not null;


-- =============================================================================
-- 7. LES GARDES
--
-- LA COHÉRENCE AVANT L'ACTEUR (migration 055) : les règles de cohérence sont
-- posées AVANT tout test de capacité, faute de quoi la clé de service — donc un
-- script — les contournerait.
--
-- `SECURITY DEFINER` : ces fonctions ne RENVOIENT aucune ligne. Elles refusent,
-- ou laissent passer. Elles lisent `rental_segments` et `rentals` EN BASE, et
-- non ce que l'appelant a le droit de voir (migration 062) — une garde qui
-- compte à travers RLS conclut « aucun » et laisse passer.
-- =============================================================================

create or replace function public.fn_rental_amendment_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.rental_status;
  v_max    int;
begin
  -- Une restauration REMET ce qui a existé : elle n'a pas à rejouer une règle
  -- de cycle de vie (migration 075).
  if public.is_restoring() then return new; end if;

  /* --- 1. UN AVENANT NE SE RÉÉCRIT PAS ----------------------------------- */
  if tg_op = 'UPDATE' then
    raise exception
      'Opération refusée : un avenant est un acte, non une fiche. Il ne se modifie pas. Une erreur se corrige par un avenant suivant, qui dira ce qu''il corrige et pourquoi.'
      using errcode = 'check_violation';
  end if;

  /* --- 2. COHÉRENCE, pour tout acteur ------------------------------------ */
  select r.status into v_status from public.rentals r where r.id = new.rental_id;

  if not found then
    raise exception 'Location introuvable.' using errcode = 'no_data_found';
  end if;

  if v_status in ('CANCELLED', 'CLOSED') then
    raise exception
      'Opération refusée : cette location est % — un contrat clos ou annulé ne reçoit plus d''avenant.',
      case v_status when 'CANCELLED' then 'annulée' else 'clôturée' end
      using errcode = 'check_violation';
  end if;

  /*
   * 🟥 A-7 N'EST PAS TRANCHÉE — la prolongation attend le LOT 23.
   *
   * Le vocabulaire de l'avenant est complet (Plan 02 §7.3), mais le LOT 22 ne
   * produit pas d'avenant de prolongation : `extend_rental` déplace la date de
   * retour sans créer de période facturable, et c'est au LOT 23 que les deux se
   * rencontrent. Refuser ici vaut mieux que laisser croire que l'acte existe.
   */
  if new.kind = 'EXTENSION' then
    raise exception
      'Opération refusée : l''avenant de prolongation n''est pas ouvert. Une prolongation se saisit aujourd''hui par « Prolonger », qui déplace la date de retour attendue ; sa facturation par période relève du LOT 23, et les pénalités de la décision A-7, non tranchée.'
      using errcode = 'feature_not_supported';
  end if;

  -- Le rang suit la chronologie du contrat : 1, puis 2, puis 3.
  select coalesce(max(sequence_no), 0) into v_max
  from public.rental_amendments where rental_id = new.rental_id;

  if new.sequence_no <> v_max + 1 then
    raise exception
      'Opération refusée : l''avenant suivant de ce contrat porte le n° %, et non le n° %.',
      v_max + 1, new.sequence_no
      using errcode = 'check_violation';
  end if;

  /* --- 3. CAPACITÉS — DEC-024 -------------------------------------------- */
  /*
   * Deux actes, deux capacités, et l'une n'ouvre pas l'autre :
   *
   *   · remplacer le véhicule       → `rental.rentals.swap`
   *   · forcer un tarif             → `rental.pricing.override`
   *
   * Un avenant de changement de véhicule QUI FORCE AUSSI LE TARIF exige LES
   * DEUX : substituer un véhicule n'a jamais supposé le droit de s'écarter du
   * barème (A-5, A-14).
   */
  if new.kind = 'VEHICLE_CHANGE' then
    perform public.require_capability(
      array['rental.rentals.swap'], 'remplacer le véhicule d''une location'
    );
  else
    perform public.require_capability(
      array['rental.pricing.override'], 'forcer le tarif d''une location'
    );
  end if;

  if new.rate_override then
    perform public.require_capability(
      array['rental.pricing.override'], 'appliquer un tarif dérogatoire sur un avenant'
    );
  end if;

  return new;
end;
$$;

comment on function public.fn_rental_amendment_guard() is
  'Un avenant ne se réécrit pas, suit le rang de son contrat, n''atteint ni un contrat clos ni un contrat annulé, et exige la capacité de SON acte (DEC-024). La prolongation est refusée : elle relève du LOT 23.';

revoke execute on function public.fn_rental_amendment_guard() from public;

create trigger rental_amendments_guard
  before insert or update on public.rental_amendments
  for each row execute function public.fn_rental_amendment_guard();


-- --- La garde des segments ----------------------------------------------------

create or replace function public.fn_rental_segment_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_max   int;
  v_prev  public.rental_segments%rowtype;
  v_veh   record;
begin
  if public.is_restoring() then return new; end if;

  /* --- 1. UN SEGMENT NE SE RÉÉCRIT PAS — D13 ----------------------------- */
  --
  -- Se modifient : la BORNE HAUTE de la période — un segment se clôt, une
  -- prolongation l'allonge, un retour le ramène à la réalité — et le STATUT.
  -- Rien d'autre. Le tarif verrouillé, le véhicule, le rang et l'avenant
  -- d'origine sont la trace de l'engagement, et une trace ne se corrige pas.
  if tg_op = 'UPDATE' then
    if new.rental_id     is distinct from old.rental_id
    or new.vehicle_id    is distinct from old.vehicle_id
    or new.sequence_no   is distinct from old.sequence_no
    or new.amendment_id  is distinct from old.amendment_id
    or new.locked_amount is distinct from old.locked_amount
    or new.locked_unit   is distinct from old.locked_unit
    or new.locked_rule_id is distinct from old.locked_rule_id
    or new.locked_source is distinct from old.locked_source
    or new.locked_at     is distinct from old.locked_at
    then
      raise exception
        'Opération refusée : le véhicule, le rang, le tarif verrouillé et l''avenant d''origine d''un segment ne se réécrivent pas. Ouvrez un avenant : il dira ce qui change, à partir de quand et pourquoi.'
        using errcode = 'check_violation';
    end if;

    /*
     * LE DÉBUT D'UN SEGMENT NE SE DÉPLACE PAS — sauf UN cas, et il est borné.
     *
     * Le DÉPART RÉEL peut précéder la période prévue : `start_rental` avance
     * alors la borne basse de l'occupation depuis la migration 035, faute de
     * quoi le calendrier laisserait libre un créneau pendant lequel le véhicule
     * est dehors. Le segment initial suit le même mouvement, et lui seul —
     * déplacer le début d'un segment issu d'un avenant romprait la contiguïté
     * avec celui qui le précède.
     */
    if lower(new.period) is distinct from lower(old.period) then
      if old.sequence_no <> 1 or lower(new.period) >= lower(old.period) then
        raise exception
          'Opération refusée : le début d''un segment ne se déplace pas. Il est l''instant où le véhicule a été engagé sur ce contrat.'
          using errcode = 'check_violation';
      end if;

      perform public.require_capability(
        array['rental.rentals.checkout'],
        'avancer le début d''un engagement au départ réel'
      );
    end if;
  end if;

  /* --- 2. COHÉRENCE, pour tout acteur ------------------------------------ */
  if tg_op = 'INSERT' then
    select v.status, v.brand || ' ' || v.model as label into v_veh
    from public.vehicles v where v.id = new.vehicle_id;

    if not found then
      raise exception 'Véhicule introuvable.' using errcode = 'no_data_found';
    end if;

    /*
     * UN VÉHICULE RETIRÉ NE S'ENGAGE PLUS — mais son PASSÉ reste inscriptible.
     *
     * Le refus porte sur un engagement OUVERT qui court encore. Un segment
     * historique désignant un véhicule retiré depuis est un FAIT : il a servi,
     * et la reprise des locations existantes (migration 088) doit pouvoir
     * l'écrire. Refuser sur le seul statut effacerait l'histoire des véhicules
     * sortis du parc — l'inverse de CLAUDE.md §22.
     */
    if v_veh.status = 'RETIRED'
       and new.status = 'ACTIVE'
       and upper(new.period) > now() then
      raise exception
        'Opération refusée : « % » est retiré du parc. Il ne peut plus être engagé sur une location en cours.',
        v_veh.label
        using errcode = 'check_violation';
    end if;

    -- Le rang suit la chronologie.
    select coalesce(max(sequence_no), 0) into v_max
    from public.rental_segments where rental_id = new.rental_id;

    if new.sequence_no <> v_max + 1 then
      raise exception
        'Opération refusée : le segment suivant de ce contrat porte le n° %, et non le n° %.',
        v_max + 1, new.sequence_no
        using errcode = 'check_violation';
    end if;

    /*
     * AUCUN TROU DANS LA COUVERTURE DU CONTRAT — consigne §7.
     *
     * Le segment suivant part EXACTEMENT là où le précédent s'arrête. La
     * contrainte d'exclusion interdit déjà le recouvrement ; ceci interdit
     * l'inverse — une période pendant laquelle le contrat n'aurait aucun
     * véhicule affecté.
     *
     * Les segments ANNULÉS sont écartés : ils n'ont jamais couru, et celui qui
     * les remplace reprend leur période entière, depuis son début.
     */
    if v_max > 0 then
      select * into v_prev
      from public.rental_segments
      where rental_id = new.rental_id and status <> 'CANCELLED'
      order by sequence_no desc
      limit 1;

      if found and lower(new.period) is distinct from upper(v_prev.period) then
        raise exception
          'Opération refusée : le segment n° % doit commencer exactement où le segment n° % s''achève (%). Un contrat ne reste jamais sans véhicule affecté.',
          new.sequence_no, v_prev.sequence_no,
          to_char(upper(v_prev.period) at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI')
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  /* --- 3. CAPACITÉS ------------------------------------------------------- */
  --
  -- Un segment naît d'un des trois actes qui l'ouvrent : la création du
  -- contrat, le remplacement de véhicule, le changement de tarif.
  if tg_op = 'INSERT' then
    perform public.require_capability(
      array['rental.rentals.create', 'rental.rentals.swap', 'rental.pricing.override'],
      'ouvrir un segment de location'
    );
  else
    -- Un segment se clôt, s'allonge ou change d'état au fil du cycle : départ,
    -- prolongation, retour, annulation, remplacement.
    perform public.require_capability(
      array[
        'rental.rentals.create', 'rental.rentals.swap', 'rental.pricing.override',
        'rental.rentals.checkout', 'rental.rentals.extend',
        'rental.rentals.return', 'rental.rentals.cancel'
      ],
      'modifier un segment de location'
    );
  end if;

  return new;
end;
$$;

comment on function public.fn_rental_segment_guard() is
  'Un segment ne réécrit ni son véhicule, ni son tarif verrouillé, ni son début ; il suit le rang du contrat et commence exactement où le précédent s''achève. Aucun trou, aucun recouvrement.';

revoke execute on function public.fn_rental_segment_guard() from public;

create trigger rental_segments_guard
  before insert or update on public.rental_segments
  for each row execute function public.fn_rental_segment_guard();


-- --- Un coût gelé ne se dégèle pas ---------------------------------------------

create or replace function public.fn_rental_segment_cost_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception
    'Opération refusée : le coût gelé d''un segment ne se modifie pas. C''est ce gel qui empêche qu''une saisie rétroactive de tarif fournisseur déplace l''historique financier d''une location déjà engagée.'
    using errcode = 'check_violation';
end;
$$;

comment on function public.fn_rental_segment_cost_immutable() is
  'Refuse toute modification d''un coût gelé. Le gel est la garantie du LOT 22 : il n''a de valeur que s''il ne se reprend pas.';

create trigger rental_segment_costs_immutable
  before update on public.rental_segment_costs
  for each row execute function public.fn_rental_segment_cost_immutable();


-- =============================================================================
-- 8. LE GEL DU COÛT — UNE CONSÉQUENCE, JAMAIS UN ACTE
--
-- POURQUOI UN DÉCLENCHEUR, ET POURQUOI `SECURITY DEFINER`
--
-- L'exploitant qui remplace un véhicule N'A PAS — et ne doit pas avoir — la
-- capacité de lire le coût fournisseur (A-2, LOT 21). Si le gel dépendait de ce
-- qu'IL peut lire, le coût serait perdu chaque fois qu'un exploitant agit, et
-- un lecteur autorisé constaterait plus tard un trou qu'il prendrait pour une
-- absence de coût.
--
-- Le gel n'est donc pas un acte qu'on demande : c'est une CONSÉQUENCE de
-- l'ouverture d'un segment, écrite par la base, comme une écriture de trésorerie
-- est la conséquence d'un règlement (`fn_treasury_entry_source`). Le déclencheur
-- NE RENVOIE RIEN à l'appelant : la ligne qu'il écrit reste derrière
-- `rental.pricing.supplier.view`, et lui seul.
--
-- CE N'EST PAS UN CONTOURNEMENT DE DROIT MÉTIER. Personne n'obtient par là une
-- lecture qu'il n'avait pas. La doctrine D4 vise les fonctions MÉTIER : les deux
-- actes du lot sont `SECURITY INVOKER`, et le contrôle final le vérifie.
--
-- AUCUN COÛT ⇒ AUCUNE LIGNE. Un véhicule ADIKOM, un véhicule de partenariat, ou
-- un trou dans la chronologie ne produisent RIEN — jamais zéro. La commission
-- sera « non calculée », et l'écran dira laquelle de ces raisons s'applique
-- (DEC-008, DEC-017).
--
-- LA DATE EST CELLE DU SEGMENT, ET LE JOUR EST COMORIEN
--
-- `resolve_supplier_rate` est interrogée au premier jour DU SEGMENT, non au jour
-- de la saisie (Plan 02 §5.6). Un segment ouvert le 5 septembre relève du coût
-- du 5 septembre, même consigné le 12. Et `current_date` s'évalue en UTC :
-- entre 21 h et minuit, il désignerait la veille à Moroni (DEC-025 §e).
-- =============================================================================

create or replace function public.fn_lock_rental_segment_cost()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_on   date;
  v_rate record;
begin
  -- Une restauration REMET le coût gelé tel qu'il était : le recalculer
  -- aujourd'hui produirait une valeur différente de celle qui a été sauvegardée.
  if public.is_restoring() then return new; end if;

  v_on := (lower(new.period) at time zone 'Indian/Comoro')::date;

  select * into v_rate from public.resolve_supplier_rate(new.vehicle_id, v_on);

  -- Aucune version applicable : AUCUNE LIGNE. Un coût absent n'est pas nul.
  if v_rate.rate_id is null then
    return new;
  end if;

  insert into public.rental_segment_costs (
    segment_id, rental_id, amount, unit, currency_code,
    supplier_id, rate_id, resolved_on
  )
  values (
    new.id, new.rental_id, v_rate.amount, v_rate.unit, v_rate.currency_code,
    v_rate.supplier_id, v_rate.rate_id, v_on
  )
  -- Un segment n'a qu'un coût gelé, et il ne se regèle pas.
  on conflict (segment_id) do nothing;

  return new;
end;
$$;

comment on function public.fn_lock_rental_segment_cost() is
  'Gèle le coût d''acquisition applicable au PREMIER JOUR du segment (jour comorien). Conséquence de l''ouverture d''un segment, jamais un acte : l''auteur du segment n''a pas besoin de lire le coût, et n''en lit rien.';

revoke execute on function public.fn_lock_rental_segment_cost() from public;

create trigger rental_segments_lock_cost
  after insert on public.rental_segments
  for each row execute function public.fn_lock_rental_segment_cost();


-- =============================================================================
-- 9. LE VÉHICULE D'UNE LOCATION SUIT SON SEGMENT OUVERT
--
-- `rentals.vehicle_id` DÉSIGNE DÉSORMAIS LE VÉHICULE COURANT.
--
-- Après un remplacement, c'est le véhicule B qui est dehors : c'est lui que la
-- liste doit montrer, lui que le retour doit ramener au parc, lui que le
-- calendrier engage. L'ANCIEN VÉHICULE N'EST PAS EFFACÉ POUR AUTANT — il vit
-- dans son segment, dans son occupation libérée, dans l'avenant qui l'a
-- remplacé, et dans le journal d'audit qui garde l'avant / après.
--
-- CE DÉCLENCHEUR EMPÊCHE QU'ON LE CHANGE AUTREMENT.
--
-- Rien n'interdisait jusqu'ici un `update rentals set vehicle_id = …` par appel
-- direct muni de `rental.rentals.update`. C'était sans conséquence tant qu'une
-- location n'avait qu'un véhicule ; cela désynchroniserait maintenant segments,
-- occupations et calendrier.
--
-- La garde ne s'appuie sur AUCUN contexte de session — ni réglage, ni indicateur
-- qu'il faudrait penser à refermer (leçon de `admin_restore_backup`). Elle
-- s'appuie sur LA DONNÉE : le nouveau véhicule doit être celui du segment ouvert
-- du contrat. L'acte du lot insère le segment AVANT de déplacer le véhicule ;
-- une écriture directe, elle, n'a aucun segment à présenter.
-- =============================================================================

create or replace function public.fn_rental_vehicle_follows_segment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_restoring() then return new; end if;

  if new.vehicle_id is not distinct from old.vehicle_id then
    return new;
  end if;

  -- COHÉRENCE D'ABORD (migration 055) : la clé de service ne contourne pas la
  -- règle. Un script qui déplacerait le véhicule sans segment serait refusé.
  if not exists (
    select 1 from public.rental_segments s
    where s.rental_id = new.id
      and s.status = 'ACTIVE'
      and s.vehicle_id = new.vehicle_id
  ) then
    raise exception
      'Opération refusée : le véhicule d''une location ne se change pas directement. Un remplacement se fait par avenant — il ouvre un segment, déplace l''engagement du calendrier et conserve l''ancien véhicule dans l''historique (A-4).'
      using errcode = 'check_violation';
  end if;

  perform public.require_capability(
    array['rental.rentals.swap'], 'remplacer le véhicule d''une location'
  );

  return new;
end;
$$;

comment on function public.fn_rental_vehicle_follows_segment() is
  'Le véhicule d''une location ne change qu''en suivant son segment ouvert, et sous `rental.rentals.swap`. Aucun contexte de session n''est employé : la garde s''appuie sur la donnée.';

revoke execute on function public.fn_rental_vehicle_follows_segment() from public;

create trigger rentals_vehicle_follows_segment
  before update on public.rentals
  for each row execute function public.fn_rental_vehicle_follows_segment();


-- =============================================================================
-- 10. LES ACTES
--
-- POURQUOI DES FONCTIONS, ET NON UNE SUITE D'ÉCRITURES APPLICATIVES
--
-- Un remplacement touche SIX choses : l'avenant, le segment clos, son
-- occupation libérée, le segment ouvert, son occupation posée, le véhicule
-- courant du contrat — et les statuts des deux véhicules. Les enchaîner depuis
-- l'application laisserait, à la moindre interruption, un contrat sans véhicule
-- affecté, ou deux véhicules engagés en même temps. Même raisonnement que
-- `start_rental` et `return_rental`.
--
-- `SECURITY INVOKER` (défaut) — doctrine D4. Les policies et les gardes
-- s'appliquent à l'auteur, pas au propriétaire.
--
-- LA RÈGLE TEMPORELLE, ÉNONCÉE UNE FOIS
--
--   · l'instant de bascule tombe DANS la période du segment ouvert ;
--   · s'il tombe à son DÉBUT et que la location n'est pas partie, ce segment est
--     ANNULÉ — le véhicule n'a jamais été remis — et le nouveau reprend toute sa
--     période ;
--   · si la location EST partie, la bascule est strictement postérieure au
--     départ réel et NON POSTÉRIEURE À MAINTENANT : on CONSTATE un changement
--     survenu, on ne le programme pas sur un véhicule déjà dehors ;
--   · sinon le segment est clos à cet instant, et le suivant part de là.
-- =============================================================================

create or replace function public.replace_rental_vehicle(
  p_rental_id      uuid,
  p_new_vehicle_id uuid,
  p_effective_at   timestamptz,
  p_reason         text,
  p_amount         bigint  default null,
  p_unit           public.pricing_unit default null,
  p_rate_reason    text    default null,
  p_notes          text    default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  l          public.rentals%rowtype;
  s          public.rental_segments%rowtype;
  v_veh      record;
  v_price    record;
  v_amount   bigint;
  v_unit     public.pricing_unit;
  v_rule     uuid;
  v_source   text;
  v_override boolean := p_amount is not null;
  v_no       text;
  v_rank     int;
  v_amend    uuid;
  v_segment  uuid;
  v_cancel   boolean := false;
  v_on       date;
begin
  perform public.require_capability(
    array['rental.rentals.swap'], 'remplacer le véhicule d''une location'
  );

  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception
      'Opération refusée : un avenant porte toujours son motif. Pourquoi ce véhicule est-il remplacé ?'
      using errcode = 'check_violation';
  end if;

  select * into l from public.rentals where id = p_rental_id for update;

  if not found then
    raise exception 'Location introuvable.' using errcode = 'no_data_found';
  end if;

  if l.status not in ('PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'EXTENDED') then
    raise exception
      'Opération refusée : le véhicule d''une location % ne se remplace plus. État actuel : %.',
      case when l.status = 'CANCELLED' then 'annulée' else 'rendue ou clôturée' end, l.status
      using errcode = 'check_violation';
  end if;

  -- --- Le segment ouvert ----------------------------------------------------
  select * into s
  from public.rental_segments
  where rental_id = l.id and status = 'ACTIVE'
  for update;

  if not found then
    raise exception
      'Opération refusée : cette location n''a aucun segment ouvert. Son historique de véhicules est incomplet — signalez-le plutôt que de le compléter à la main.'
      using errcode = 'no_data_found';
  end if;

  if p_new_vehicle_id is null or p_new_vehicle_id = s.vehicle_id then
    raise exception
      'Opération refusée : le véhicule de remplacement doit être différent de celui actuellement affecté.'
      using errcode = 'check_violation';
  end if;

  -- --- La règle temporelle --------------------------------------------------
  if p_effective_at is null then
    raise exception
      'Opération refusée : la date de bascule est obligatoire. C''est elle qui sépare les deux véhicules dans l''historique.'
      using errcode = 'check_violation';
  end if;

  if p_effective_at >= upper(s.period) then
    raise exception
      'Opération refusée : la bascule (%) tombe à la fin de l''engagement en cours ou après. Il ne resterait aucune période au véhicule de remplacement.',
      to_char(p_effective_at at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI')
      using errcode = 'check_violation';
  end if;

  if p_effective_at < lower(s.period) then
    raise exception
      'Opération refusée : la bascule (%) précède le début de l''engagement en cours (%). Un avenant ne réécrit pas ce qui s''est passé avant lui.',
      to_char(p_effective_at at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI'),
      to_char(lower(s.period) at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI')
      using errcode = 'check_violation';
  end if;

  if l.status in ('IN_PROGRESS', 'EXTENDED') then
    -- Le véhicule est DEHORS : on constate, on ne programme pas.
    if l.started_at is not null and p_effective_at <= l.started_at then
      raise exception
        'Opération refusée : le véhicule est parti le %. La bascule doit lui être postérieure — ce qui a été remis au client ne se réécrit pas.',
        to_char(l.started_at at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI')
        using errcode = 'check_violation';
    end if;

    if p_effective_at > now() then
      raise exception
        'Opération refusée : la location est en cours et le véhicule est dehors. Un remplacement se CONSTATE au moment où il survient ; il ne se programme pas à l''avance.'
        using errcode = 'check_violation';
    end if;

    if p_effective_at = lower(s.period) then
      raise exception
        'Opération refusée : la bascule ne peut pas coïncider avec le début d''un engagement déjà exécuté.'
        using errcode = 'check_violation';
    end if;
  else
    -- Non partie : une bascule au tout début signifie que ce véhicule n'aura
    -- jamais servi. Son segment est ANNULÉ, et non clos sur une durée nulle.
    v_cancel := p_effective_at = lower(s.period);
  end if;

  -- --- Le véhicule de remplacement ------------------------------------------
  select v.status, v.brand || ' ' || v.model as label into v_veh
  from public.vehicles v where v.id = p_new_vehicle_id;

  if not found then
    raise exception 'Véhicule de remplacement introuvable.' using errcode = 'no_data_found';
  end if;

  /*
   * DISPONIBILITÉ : statut ET calendrier (Règles parc §67).
   *
   * La contrainte d'exclusion de `vehicle_occupations` reste le juge — deux
   * saisies simultanées ne peuvent pas se croiser. Ce contrôle préalable
   * n'existe que pour rendre un message lisible (CLAUDE.md §43).
   */
  if not public.is_vehicle_available(
       p_new_vehicle_id,
       tstzrange(p_effective_at, upper(s.period), '[)')
     ) then
    raise exception
      'Opération refusée : « % » n''est pas disponible du % au %. Un véhicule ne peut pas être affecté à deux engagements incompatibles.',
      v_veh.label,
      to_char(p_effective_at at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI'),
      to_char(upper(s.period) at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI')
      using errcode = 'exclusion_violation';
  end if;

  -- --- LE TARIF CLIENT — A-5 -------------------------------------------------
  v_on := (p_effective_at at time zone 'Indian/Comoro')::date;

  if v_override then
    /*
     * CAS D'EXCEPTION. « Des situations peuvent se présenter autrement et on les
     * gère selon le contexte » — le montant est imposé, la capacité d'exception
     * est exigée, et la raison est obligatoire.
     */
    perform public.require_capability(
      array['rental.pricing.override'],
      'appliquer au client un tarif différent de celui du barème'
    );

    if p_rate_reason is null or length(btrim(p_rate_reason)) = 0 then
      raise exception
        'Opération refusée : un tarif dérogatoire porte toujours sa raison. Pourquoi le client ne paie-t-il pas le tarif du nouveau véhicule ?'
        using errcode = 'check_violation';
    end if;

    if p_amount < 0 then
      raise exception 'Un tarif ne peut pas être négatif.' using errcode = 'check_violation';
    end if;

    v_amount := p_amount;
    v_unit   := coalesce(p_unit, s.locked_unit);
    v_rule   := null;
    v_source := 'OVERRIDE';
  else
    /*
     * CAS ORDINAIRE — « généralement le client paie le nouveau tarif ».
     *
     * Le tarif est RÉSOLU par `resolve_pricing_rule`, unique implémentation de
     * DEC-002 : la hiérarchie de spécificité et le départage par date de
     * création ne sont pas réécrits ici, ils sont APPELÉS.
     */
    select * into v_price
    from public.resolve_pricing_rule(l.client_id, p_new_vehicle_id, v_on);

    if v_price.amount is null then
      raise exception
        'Opération refusée : aucun tarif client n''est applicable à « % » au %. Aucun montant n''est supposé à la place d''un barème absent — renseignez le tarif, ou appliquez explicitement un tarif dérogatoire motivé.',
        v_veh.label, to_char(v_on, 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end if;

    v_amount := v_price.amount;
    v_unit   := v_price.unit;
    v_rule   := v_price.rule_id;
    v_source := v_price.source;
  end if;

  -- --- 1. L'AVENANT ----------------------------------------------------------
  select coalesce(max(sequence_no), 0) + 1 into v_rank
  from public.rental_amendments where rental_id = l.id;

  v_no := public.next_number('rental_amendment');

  insert into public.rental_amendments (
    amendment_no, rental_id, sequence_no, kind, effective_at,
    reason, notes, rate_override, rate_override_reason, created_by
  )
  values (
    v_no, l.id, v_rank, 'VEHICLE_CHANGE', p_effective_at,
    btrim(p_reason), nullif(btrim(coalesce(p_notes, '')), ''),
    v_override, nullif(btrim(coalesce(p_rate_reason, '')), ''),
    public.current_actor()
  )
  returning id into v_amend;

  -- --- 2. LE SEGMENT SORTANT — clos, ou annulé s'il n'a jamais servi ---------
  update public.rental_segments
     set period     = case when v_cancel then period
                           else tstzrange(lower(period), p_effective_at, '[)') end,
         status     = (case when v_cancel then 'CANCELLED' else 'ENDED' end)
                        ::public.rental_segment_status,
         updated_by = public.current_actor()
   where id = s.id;

  -- --- 3. SON OCCUPATION — ramenée à la réalité, puis libérée ----------------
  --
  -- La borne haute suit la bascule, dans la MÊME écriture qui libère la ligne :
  -- `is_active` devenant faux, la contrainte d'exclusion ne s'y applique plus.
  -- Le plancher d'une seconde reprend celui de `return_rental` : une période
  -- vide serait refusée par `vehicle_occupations_period_bounded`.
  update public.vehicle_occupations
     set period      = case
                         when v_cancel then period
                         else tstzrange(
                                lower(period),
                                greatest(p_effective_at, lower(period) + interval '1 second'),
                                '[)')
                       end,
         is_active   = false,
         released_at = now(),
         released_by = public.current_actor()
   where source = 'RENTAL'
     and source_id = l.id
     and rental_segment_id = s.id
     and is_active;

  -- --- 4. LE SEGMENT ENTRANT --------------------------------------------------
  insert into public.rental_segments (
    rental_id, vehicle_id, sequence_no, amendment_id, period, status,
    locked_amount, locked_unit, locked_rule_id, locked_source, locked_at,
    created_by, updated_by
  )
  values (
    l.id, p_new_vehicle_id, s.sequence_no + 1, v_amend,
    tstzrange(case when v_cancel then lower(s.period) else p_effective_at end,
              upper(s.period), '[)'),
    'ACTIVE',
    v_amount, v_unit, v_rule, v_source, now(),
    public.current_actor(), public.current_actor()
  )
  returning id into v_segment;

  -- --- 5. SON OCCUPATION ------------------------------------------------------
  insert into public.vehicle_occupations
    (vehicle_id, source, source_id, rental_segment_id, period, reason, created_by)
  values (
    p_new_vehicle_id, 'RENTAL', l.id, v_segment,
    tstzrange(case when v_cancel then lower(s.period) else p_effective_at end,
              upper(s.period), '[)'),
    'Location ' || l.rental_no || ' — avenant ' || v_no,
    public.current_actor()
  );

  -- --- 6. LE CONTRAT PORTE SON VÉHICULE COURANT -------------------------------
  update public.rentals
     set vehicle_id = p_new_vehicle_id,
         updated_by = public.current_actor()
   where id = l.id;

  -- --- 7. LES DEUX VÉHICULES, SI LA LOCATION EST PARTIE ------------------------
  --
  -- LE REMPLACEMENT N'IMMOBILISE PAS L'ANCIEN VÉHICULE. Une panne se DÉCLARE —
  -- incident, puis maintenance — et c'est un acte distinct, sous ses propres
  -- capacités (Workflow 05 §44). Rien n'est déclenché automatiquement ici.
  --
  -- `status = 'RENTED'` en condition : si l'ancien véhicule a déjà été mis en
  -- maintenance, ce n'est pas au remplacement de l'effacer.
  if l.status in ('IN_PROGRESS', 'EXTENDED') then
    update public.vehicles
       set status = 'AVAILABLE', status_changed_at = now(),
           status_changed_by = public.current_actor(), updated_by = public.current_actor()
     where id = s.vehicle_id and status = 'RENTED';

    update public.vehicles
       set status = 'RENTED', status_changed_at = now(),
           status_changed_by = public.current_actor(), updated_by = public.current_actor()
     where id = p_new_vehicle_id and status <> 'RETIRED';
  end if;

  return v_amend;
end;
$$;

comment on function public.replace_rental_vehicle(uuid, uuid, timestamptz, text, bigint, public.pricing_unit, text, text) is
  'Remplace le véhicule d''une location par avenant, SANS changer de contrat (A-4). Clôt le segment sortant, ouvre le segment entrant, déplace l''engagement du calendrier, et n''efface rien.';

revoke execute on function public.replace_rental_vehicle(uuid, uuid, timestamptz, text, bigint, public.pricing_unit, text, text) from public, anon;
grant  execute on function public.replace_rental_vehicle(uuid, uuid, timestamptz, text, bigint, public.pricing_unit, text, text) to authenticated, service_role;


-- --- Changer le tarif d'un contrat en cours ------------------------------------
--
-- 🟩 A-5 et A-7 — le changement de tarif, sans le barème qui n'existe pas.
--
-- « Un changement de tarif peut survenir si le client change le mode de location
--   (court à long) ou si le client n'a pas respecté les termes du contrat, en
--   rajoutant des pénalités de 20 à 100 %. »
--
-- A-7 N'EST PAS TRANCHÉE (Plan 02 §3.1) : ni la base du pourcentage, ni qui fixe
-- le taux, ni la nature de la pénalité — majoration ou ligne de facture — ne
-- sont écrites. AUCUN barème n'est donc implémenté, AUCUNE capacité de pénalité
-- n'est créée.
--
-- Ce que le LOT 22 livre, et qui est exactement ce que la consigne §15 demande :
-- LE MODÈLE. Un changement de tarif se REPRÉSENTE — un avenant, un nouveau
-- segment, une date d'effet, un montant, une raison écrite —, il s'historise et
-- il s'audite. Le jour où la Direction arrêtera un barème, il n'y aura qu'à
-- calculer le montant que quelqu'un saisit aujourd'hui.
--
-- C'EST ICI QUE `rental.pricing.override` TROUVE SON EMPLOI (Plan 02 §1.4).
-- Au catalogue depuis le premier jour, elle ne débloquait rien : une permission
-- attribuable qui n'ouvre aucune porte, exactement ce que CLAUDE.md §19 bis
-- proscrit. AUCUNE CAPACITÉ NOUVELLE n'est créée pour A-5 : le catalogue se
-- corrige au lieu de s'allonger.

create or replace function public.change_rental_rate(
  p_rental_id    uuid,
  p_effective_at timestamptz,
  p_amount       bigint,
  p_unit         public.pricing_unit,
  p_reason       text,
  p_notes        text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  l         public.rentals%rowtype;
  s         public.rental_segments%rowtype;
  v_no      text;
  v_rank    int;
  v_amend   uuid;
  v_segment uuid;
begin
  perform public.require_capability(
    array['rental.pricing.override'], 'forcer le tarif d''une location'
  );

  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception
      'Opération refusée : un changement de tarif porte toujours sa raison. Un prix ne se modifie jamais en silence.'
      using errcode = 'check_violation';
  end if;

  if p_amount is null or p_amount < 0 then
    raise exception 'Un tarif ne peut être ni absent ni négatif.' using errcode = 'check_violation';
  end if;

  if p_unit is null then
    raise exception
      'Opération refusée : un tarif porte toujours son unité — par jour, ou forfait.'
      using errcode = 'check_violation';
  end if;

  select * into l from public.rentals where id = p_rental_id for update;

  if not found then
    raise exception 'Location introuvable.' using errcode = 'no_data_found';
  end if;

  if l.status not in ('PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'EXTENDED') then
    raise exception
      'Opération refusée : le tarif d''une location rendue, clôturée ou annulée ne se change plus. État actuel : %.',
      l.status
      using errcode = 'check_violation';
  end if;

  select * into s
  from public.rental_segments
  where rental_id = l.id and status = 'ACTIVE'
  for update;

  if not found then
    raise exception 'Opération refusée : cette location n''a aucun segment ouvert.'
      using errcode = 'no_data_found';
  end if;

  if p_effective_at is null
     or p_effective_at <= lower(s.period)
     or p_effective_at >= upper(s.period) then
    raise exception
      'Opération refusée : la date d''effet doit tomber strictement à l''intérieur de la période en cours (% → %).',
      to_char(lower(s.period) at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI'),
      to_char(upper(s.period) at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI')
      using errcode = 'check_violation';
  end if;

  if p_amount = s.locked_amount and p_unit = s.locked_unit then
    raise exception
      'Opération refusée : ce tarif est déjà celui du contrat. Un avenant consigne un changement, pas une confirmation.'
      using errcode = 'check_violation';
  end if;

  select coalesce(max(sequence_no), 0) + 1 into v_rank
  from public.rental_amendments where rental_id = l.id;

  v_no := public.next_number('rental_amendment');

  insert into public.rental_amendments (
    amendment_no, rental_id, sequence_no, kind, effective_at,
    reason, notes, rate_override, rate_override_reason, created_by
  )
  values (
    v_no, l.id, v_rank, 'RATE_CHANGE', p_effective_at,
    btrim(p_reason), nullif(btrim(coalesce(p_notes, '')), ''),
    true, btrim(p_reason), public.current_actor()
  )
  returning id into v_amend;

  update public.rental_segments
     set period     = tstzrange(lower(period), p_effective_at, '[)'),
         status     = 'ENDED',
         updated_by = public.current_actor()
   where id = s.id;

  /*
   * L'OCCUPATION SUIT LE SEGMENT, MÊME QUAND LE VÉHICULE NE CHANGE PAS.
   *
   * Une occupation par segment est un invariant : c'est lui qui permet aux cinq
   * fonctions du cycle de désigner « l'occupation du segment courant » sans
   * jamais se demander combien il y en a. La première est libérée avant que la
   * seconde soit posée — elles portent le même véhicule, et deux occupations
   * actives contiguës ne se recouvrent pas, mais l'ordre évite de dépendre de
   * cette subtilité.
   */
  update public.vehicle_occupations
     set period      = tstzrange(
                         lower(period),
                         greatest(p_effective_at, lower(period) + interval '1 second'),
                         '[)'),
         is_active   = false,
         released_at = now(),
         released_by = public.current_actor()
   where source = 'RENTAL'
     and source_id = l.id
     and rental_segment_id = s.id
     and is_active;

  insert into public.rental_segments (
    rental_id, vehicle_id, sequence_no, amendment_id, period, status,
    locked_amount, locked_unit, locked_rule_id, locked_source, locked_at,
    created_by, updated_by
  )
  values (
    l.id, s.vehicle_id, s.sequence_no + 1, v_amend,
    tstzrange(p_effective_at, upper(s.period), '[)'), 'ACTIVE',
    p_amount, p_unit, null, 'OVERRIDE', now(),
    public.current_actor(), public.current_actor()
  )
  returning id into v_segment;

  insert into public.vehicle_occupations
    (vehicle_id, source, source_id, rental_segment_id, period, reason, created_by)
  values (
    s.vehicle_id, 'RENTAL', l.id, v_segment,
    tstzrange(p_effective_at, upper(s.period), '[)'),
    'Location ' || l.rental_no || ' — avenant ' || v_no,
    public.current_actor()
  );

  update public.rentals set updated_by = public.current_actor() where id = l.id;

  return v_amend;
end;
$$;

comment on function public.change_rental_rate(uuid, timestamptz, bigint, public.pricing_unit, text, text) is
  'Change le tarif client d''un contrat en cours, par avenant et à partir d''une date d''effet (A-5, A-7). Exige `rental.pricing.override` et une raison écrite. AUCUN barème de pénalité n''est appliqué : A-7 n''est pas tranchée.';

revoke execute on function public.change_rental_rate(uuid, timestamptz, bigint, public.pricing_unit, text, text) from public, anon;
grant  execute on function public.change_rental_rate(uuid, timestamptz, bigint, public.pricing_unit, text, text) to authenticated, service_role;


-- =============================================================================
-- 11. RLS
--
-- `has_permission(...)` est ENVELOPPÉE DANS UN SOUS-SELECT : une garde de RLS
-- s'évalue PAR LIGNE, et l'appel coûterait sinon un aller-retour par ligne de la
-- liste (migration 065).
--
-- LA GARANTIE CENTRALE DU LOT, comme au LOT 21 : `rental_segment_costs` ne
-- s'ouvre QUE par `rental.pricing.supplier.view`. Ni `rental.rentals.view`, ni
-- `rental.rentals.financial.view`, ni `rental.fleet.view` n'y figurent — sans
-- quoi la table séparée ne servirait à rien.
-- =============================================================================

revoke all    on public.rental_amendments     from anon;
revoke all    on public.rental_segments       from anon;
revoke all    on public.rental_segment_costs  from anon;

revoke delete, truncate on public.rental_amendments    from authenticated;
revoke delete, truncate on public.rental_segments      from authenticated;
-- Le coût gelé n'est écrit QUE par le déclencheur, qui s'exécute avec les droits
-- du propriétaire. Aucune session applicative ne peut ni l'insérer, ni le
-- modifier, ni l'effacer — c'est la forme la plus forte de l'immuabilité.
revoke insert, update, delete, truncate on public.rental_segment_costs from authenticated;
-- Un avenant ne se réécrit pas : le droit lui-même est retiré, pas seulement la
-- policy.
revoke update on public.rental_amendments from authenticated;

alter table public.rental_amendments    enable row level security;
alter table public.rental_segments      enable row level security;
alter table public.rental_segment_costs enable row level security;

-- --- Avenants
create policy rental_amendments_select on public.rental_amendments
  for select to authenticated
  using ((select public.has_permission('rental.rentals.view')));

create policy rental_amendments_insert on public.rental_amendments
  for insert to authenticated
  with check (
    (select public.has_permission('rental.rentals.swap'))
    or (select public.has_permission('rental.pricing.override'))
  );

-- --- Segments
create policy rental_segments_select on public.rental_segments
  for select to authenticated
  using ((select public.has_permission('rental.rentals.view')));

create policy rental_segments_insert on public.rental_segments
  for insert to authenticated
  with check (
    (select public.has_permission('rental.rentals.create'))
    or (select public.has_permission('rental.rentals.swap'))
    or (select public.has_permission('rental.pricing.override'))
  );

-- La policy dit qui peut écrire dans la table ; le déclencheur dit qui peut
-- accomplir CET acte — clore, allonger, annuler (DEC-024).
create policy rental_segments_update on public.rental_segments
  for update to authenticated
  using (
    (select public.has_permission('rental.rentals.create'))
    or (select public.has_permission('rental.rentals.swap'))
    or (select public.has_permission('rental.pricing.override'))
    or (select public.has_permission('rental.rentals.checkout'))
    or (select public.has_permission('rental.rentals.extend'))
    or (select public.has_permission('rental.rentals.return'))
    or (select public.has_permission('rental.rentals.cancel'))
  )
  with check (
    (select public.has_permission('rental.rentals.create'))
    or (select public.has_permission('rental.rentals.swap'))
    or (select public.has_permission('rental.pricing.override'))
    or (select public.has_permission('rental.rentals.checkout'))
    or (select public.has_permission('rental.rentals.extend'))
    or (select public.has_permission('rental.rentals.return'))
    or (select public.has_permission('rental.rentals.cancel'))
  );

-- --- Coût gelé — UNE SEULE POLICY, et elle est en lecture
create policy rental_segment_costs_select on public.rental_segment_costs
  for select to authenticated
  using ((select public.has_permission('rental.pricing.supplier.view')));


-- --- Le calendrier reconnaît le remplacement ----------------------------------
--
-- Suite des migrations 033, 034, 035, 036 et 057 : chaque capacité est ouverte
-- quand SA fonction existe, jamais avant. Les policies sont reprises À
-- L'IDENTIQUE, augmentées de `rental.rentals.swap` — qui POSE une occupation
-- (le nouveau véhicule) et en LIBÈRE une (l'ancien).

drop policy if exists vehicle_occupations_insert on public.vehicle_occupations;

create policy vehicle_occupations_insert on public.vehicle_occupations
  for insert to authenticated
  with check (
    public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.reservations.confirm')
    or public.has_permission('rental.maintenance.create')
    or public.has_permission('rental.maintenance.update')
    or public.has_permission('rental.rentals.swap')
    or public.has_permission('rental.pricing.override')
  );

drop policy if exists vehicle_occupations_update on public.vehicle_occupations;

create policy vehicle_occupations_update on public.vehicle_occupations
  for update to authenticated
  using (
    public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.reservations.cancel')
    or public.has_permission('rental.rentals.create')
    or public.has_permission('rental.rentals.extend')
    or public.has_permission('rental.rentals.cancel')
    or public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.return')
    or public.has_permission('rental.maintenance.close')
    or public.has_permission('rental.maintenance.update')
    or public.has_permission('rental.rentals.swap')
    or public.has_permission('rental.pricing.override')
  )
  with check (
    public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.reservations.cancel')
    or public.has_permission('rental.rentals.create')
    or public.has_permission('rental.rentals.extend')
    or public.has_permission('rental.rentals.cancel')
    or public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.return')
    or public.has_permission('rental.maintenance.close')
    or public.has_permission('rental.maintenance.update')
    or public.has_permission('rental.rentals.swap')
    or public.has_permission('rental.pricing.override')
  );

/*
 * ET LA GARDE DE CAPACITÉ DU CALENDRIER, QUI N'EST PAS UNE POLICY.
 *
 * `fn_occupation_capability` (migration 057) rattache chaque écriture du
 * calendrier À L'ORIGINE de l'occupation : une capacité de location ne lève pas
 * une immobilisation de maintenance. Elle est la SECONDE barrière, et elle
 * s'applique même à un appel direct muni de la bonne policy.
 *
 * Le remplacement de véhicule POSE une occupation de location et en LIBÈRE une.
 * Sans cette reprise, il faudrait détenir `rental.rentals.create` pour remplacer
 * un véhicule — c'est-à-dire le droit de CRÉER un contrat pour en modifier un.
 * Exactement l'inverse de A-14.
 *
 * La fonction est reprise À L'IDENTIQUE, augmentée de `rental.rentals.swap` et
 * de `rental.pricing.override` sur la seule branche `RENTAL`. Les trois autres
 * origines — réservation, maintenance, immobilisation — sont inchangées.
 */
create or replace function public.fn_occupation_capability()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_source public.occupation_source;
begin
  -- Sur une mise à jour, c'est l'origine D'AVANT qui décide : la conversion
  -- fait précisément passer une occupation de RESERVATION à RENTAL.
  v_source := case tg_op when 'INSERT' then new.source else old.source end;

  if tg_op = 'INSERT' then
    case v_source
      when 'RESERVATION' then
        perform public.require_capability(
          array['rental.reservations.confirm'], 'engager un véhicule sur une réservation');
      when 'RENTAL' then
        -- Créer un contrat, ou lui substituer un véhicule (LOT 22).
        perform public.require_capability(
          array['rental.rentals.create', 'rental.rentals.swap', 'rental.pricing.override'],
          'engager un véhicule sur une location');
      when 'MAINTENANCE' then
        perform public.require_capability(
          array['rental.maintenance.create', 'rental.maintenance.update'],
          'immobiliser un véhicule pour maintenance');
      when 'IMMOBILIZATION' then
        perform public.require_capability(
          array['rental.fleet.status.update'], 'immobiliser un véhicule');
    end case;
  else
    case v_source
      when 'RESERVATION' then
        -- Libérer (annulation) ou convertir en location.
        perform public.require_capability(
          array['rental.reservations.cancel', 'rental.rentals.create'],
          'modifier l''engagement d''une réservation');
      when 'RENTAL' then
        perform public.require_capability(
          array['rental.rentals.checkout', 'rental.rentals.extend',
                'rental.rentals.return', 'rental.rentals.cancel',
                -- LOT 22 : le remplacement RAMÈNE l'engagement du véhicule
                -- sortant à la bascule, puis le libère.
                'rental.rentals.swap', 'rental.pricing.override'],
          'modifier l''engagement d''une location');
      when 'MAINTENANCE' then
        perform public.require_capability(
          array['rental.maintenance.close', 'rental.maintenance.update'],
          'lever une immobilisation de maintenance');
      when 'IMMOBILIZATION' then
        perform public.require_capability(
          array['rental.fleet.status.update'], 'lever une immobilisation');
    end case;
  end if;

  return new;
end;
$$;

comment on function public.fn_occupation_capability is
  'Rattache chaque écriture du calendrier à l''origine de l''occupation : une capacité de location ne lève pas une immobilisation de maintenance. Le remplacement de véhicule (LOT 22) engage et libère une occupation de location.';


-- --- La location et le parc reconnaissent le remplacement ---------------------

/*
 * ⚠ LA POLICY EST REPRISE DEPUIS SA DERNIÈRE VERSION EN VIGUEUR, NON DEPUIS
 * CELLE DE LA MIGRATION 031.
 *
 * `rentals_update` a été élargie par la migration 051 (factures clients) :
 * l'émission d'une facture fait passer la location à « Facturée », et son
 * annulation la ramène à « À facturer ». Les deux capacités de facturation y
 * figurent donc, et les omettre en réécrivant la policy retirerait
 * silencieusement l'émission de facture — que la recette SQL, exécutée avec un
 * rôle qui CONTOURNE RLS, ne verrait pas.
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
    or public.has_permission('rental.rentals.swap')
    or public.has_permission('rental.pricing.override')
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
  );

do $$
declare v_using text;
begin
  select pg_get_expr(polqual, polrelid) into v_using
  from pg_policy p join pg_class c on c.oid = p.polrelid
  where c.relname = 'vehicles' and p.polname = 'vehicles_update';

  if v_using is null then
    raise exception 'Policy vehicles_update introuvable : migration à revoir.';
  end if;
end $$;

drop policy if exists vehicles_update on public.vehicles;

create policy vehicles_update on public.vehicles
  for update to authenticated
  using (
    public.has_permission('rental.fleet.update')
    or public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.fleet.supplier.update')
    or public.has_permission('rental.fleet.archive')
    or public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.return')
    or public.has_permission('rental.maintenance.create')
    or public.has_permission('rental.maintenance.update')
    or public.has_permission('rental.maintenance.close')
    or public.has_permission('rental.rentals.swap')
  )
  with check (
    public.has_permission('rental.fleet.update')
    or public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.fleet.supplier.update')
    or public.has_permission('rental.fleet.archive')
    or public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.return')
    or public.has_permission('rental.maintenance.create')
    or public.has_permission('rental.maintenance.update')
    or public.has_permission('rental.maintenance.close')
    or public.has_permission('rental.rentals.swap')
  );


-- =============================================================================
-- 12. LE JOURNAL N'OUVRE PAS CE QUE LA TABLE FERME — DEC-038
--
-- Un type d'objet absent de cette correspondance se referme sur le seul Super
-- Admin : le défaut serait sûr, mais SILENCIEUX.
--
-- LE POINT QUI COMPTE : `rental_segment_costs` s'ouvre par
-- `rental.pricing.supplier.view`, JAMAIS par `rental.rentals.view`. Sans cela,
-- le journal rendrait par la bande ce que la table refuse.
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
-- 13. LA CAPACITÉ — UNE SEULE, ET LA JUSTIFICATION DE CHACUNE DES ABSENCES
--
-- La liste de colonnes ouvre par `(code, module_code` : c'est la forme que le
-- contrôle de parité TS/SQL (`permissions.test.ts`) reconnaît.
--
-- CE QUI EST CRÉÉ
--
--   `rental.rentals.swap` — REMPLACER LE VÉHICULE d'une location. Acte sensible :
--   il déplace un engagement de calendrier, change ce qui est facturé au client,
--   et engage ADIKOM sur un autre véhicule. Il n'est inclus dans AUCUNE autre
--   capacité — ni `update`, ni `extend`, ni `checkout` (A-14, DEC-024).
--
-- CE QUI N'EST PAS CRÉÉ, ET POURQUOI — la question de CLAUDE.md §19 bis posée
-- une fois par candidat :
--
--   · `rental.rentals.amendments.view` — les avenants et les segments sont
--     L'HISTOIRE DU CONTRAT : quel véhicule, quand, à quel tarif. Qui a le droit
--     de consulter une location a le droit de savoir quel véhicule elle a
--     réellement mobilisé. Une capacité de plus ne fermerait qu'un ONGLET, et
--     une permission qui ne fait que masquer une carte n'en est pas une
--     (DEC-036 §d, DEC-042 §d). Ce qui EST confidentiel dans un segment — son
--     coût — a sa propre table et sa propre capacité ;
--
--   · `rental.rentals.amendments.create` — c'est `swap` (véhicule) ou
--     `pricing.override` (tarif). Une troisième ne recouvrirait rien de plus ;
--
--   · `rental.rentals.amendments.update` — un avenant NE SE MODIFIE PAS. Pas de
--     fonctionnalité, pas de permission ;
--
--   · `rental.rentals.amendments.export` — aucun export d'avenants n'est livré,
--     et `rental.rentals.export` porte déjà la liste des locations ;
--
--   · `.download` / `.print` propres à l'avenant — l'avenant est le QUATRIÈME
--     document du CYCLE DE LOCATION, après le contrat, le bon de départ et le
--     procès-verbal de retour. Les trois premiers vivent sous
--     `rental.rentals.download` et `rental.rentals.print` ; le quatrième aussi.
--     C'est exactement le raisonnement du Plan 02 §10.3 pour la synthèse ;
--
--   · `rental.rentals.rate.override` — `rental.pricing.override` EXISTE
--     (Plan 02 §1.4, §10.3). Un code attribué ne se double pas ;
--
--   · toute capacité de commission ou de marge — une commission est la
--     différence de DEUX grandeurs déjà gouvernées (`rental.pricing.supplier.view`
--     et `rental.rentals.financial.view`). Une capacité de plus ne fermerait
--     RIEN (Rapport 13 §10.2) ;
--
--   · `rental.rentals.penalty.*` — A-7 n'est pas tranchée, la fonctionnalité
--     n'existe pas. On ne crée pas une permission pour ce qui n'existe pas.
--
-- Catalogue : 195 → 196.
-- =============================================================================

with nouvelles (
  code, module_code, menu_code, menu_label, submenu_code, submenu_label,
  action, label, sous_rang, rang
) as (values
  ('rental.rentals.swap', 'rental', 'rentals', 'Locations',
   'swap', 'Remplacement de véhicule', 'UPDATE',
   'Remplacer le véhicule d''une location par avenant', 13, 3)
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
  -- SENSIBLE : l'acte déplace un engagement et peut changer ce qui est facturé.
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
-- 14. CONTRÔLES DE NON-RÉGRESSION
--
-- LE TOTAL DU CATALOGUE EST AFFIRMÉ ICI, ET NULLE PART AILLEURS (DEC-046). Une
-- migration énonce un fait DATÉ et n'a jamais à être rouverte ; les recettes,
-- elles, nomment les capacités qu'elles éprouvent.
-- =============================================================================

do $$
declare
  v_total int;
  v_qual  text;
  v_extra text[];
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 196 then
    raise exception 'Catalogue attendu à 196 permissions, obtenu %.', v_total;
  end if;

  if not exists (select 1 from public.permissions where code = 'rental.rentals.swap') then
    raise exception 'La capacité `rental.rentals.swap` est absente du catalogue.';
  end if;

  if not exists (
    select 1 from public.permissions
    where code = 'rental.rentals.swap' and is_sensitive and action = 'UPDATE'
  ) then
    raise exception 'La capacité de remplacement doit être sensible et de nature UPDATE.';
  end if;

  -- AUCUNE capacité inventée autour de l'avenant (CLAUDE.md §19 bis).
  select array_agg(p.code) into v_extra
  from public.permissions p
  where (p.code like 'rental.rentals.amendment%'
      or p.code like 'rental.rentals.segment%'
      or p.code like 'rental.rentals.penalty%'
      or p.code like 'rental.rentals.rate.%'
      or p.code like '%.commission.%');

  if v_extra is not null then
    raise exception 'Capacité créée sans fonctionnalité correspondante : %', v_extra;
  end if;

  -- La capacité dormante trouve son emploi, elle n'est pas remplacée.
  if not exists (select 1 from public.permissions where code = 'rental.pricing.override') then
    raise exception '`rental.pricing.override` a disparu : le LOT 22 la RÉEMPLOIE.';
  end if;

  -- Les trois tables, RLS active.
  foreach v_qual in array array['rental_amendments', 'rental_segments', 'rental_segment_costs'] loop
    if not exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = v_qual
    ) then
      raise exception 'Table % absente.', v_qual;
    end if;

    if not (select relrowsecurity from pg_class
            where oid = ('public.' || v_qual)::regclass) then
      raise exception 'RLS non activée sur %.', v_qual;
    end if;

    if has_table_privilege('authenticated', 'public.' || v_qual, 'DELETE')
    or has_table_privilege('authenticated', 'public.' || v_qual, 'TRUNCATE') then
      raise exception 'DELETE ou TRUNCATE encore accordé à authenticated sur %.', v_qual;
    end if;
  end loop;

  /*
   * LA GARANTIE CENTRALE : le coût gelé ne s'ouvre QUE par sa capacité.
   *
   * Si `rental.rentals.view` ou `rental.rentals.financial.view` y figuraient,
   * la table séparée ne servirait plus à rien — et la confidentialité du LOT 21
   * serait contournée par la location.
   */
  select qual into v_qual
  from pg_policies
  where schemaname = 'public' and tablename = 'rental_segment_costs'
    and policyname = 'rental_segment_costs_select';

  if v_qual is null or v_qual not like '%rental.pricing.supplier.view%' then
    raise exception
      'La lecture du coût gelé doit dépendre de `rental.pricing.supplier.view`.';
  end if;

  if v_qual like '%rental.rentals.view%'
  or v_qual like '%rental.rentals.financial.view%'
  or v_qual like '%rental.fleet.view%'
  or v_qual like '%''rental.pricing.view''%' then
    raise exception
      'Le coût gelé s''ouvre par une capacité étrangère : %', v_qual;
  end if;

  -- Aucune session applicative n'écrit dans le coût gelé.
  if has_table_privilege('authenticated', 'public.rental_segment_costs', 'INSERT')
  or has_table_privilege('authenticated', 'public.rental_segment_costs', 'UPDATE') then
    raise exception 'Le coût gelé est écrivable par une session applicative.';
  end if;

  -- Un avenant ne se réécrit pas, jusque dans les droits.
  if has_table_privilege('authenticated', 'public.rental_amendments', 'UPDATE') then
    raise exception 'Un avenant est modifiable par une session applicative.';
  end if;

  -- Les contraintes structurantes.
  if not exists (
    select 1 from pg_constraint
    where conname = 'rental_segments_no_overlap' and contype = 'x'
  ) then
    raise exception 'La contrainte d''exclusion des segments est absente.';
  end if;

  if not exists (
    select 1 from pg_class where relname = 'rental_segments_one_active_idx'
  ) then
    raise exception 'L''index d''unicité du segment ouvert est absent.';
  end if;

  -- DOCTRINE D4 : les deux ACTES sont SECURITY INVOKER.
  if exists (
    select 1 from pg_proc
    where oid in (
      'public.replace_rental_vehicle(uuid, uuid, timestamptz, text, bigint, public.pricing_unit, text, text)'::regprocedure,
      'public.change_rental_rate(uuid, timestamptz, bigint, public.pricing_unit, text, text)'::regprocedure
    ) and prosecdef
  ) then
    raise exception 'Un acte du LOT 22 est SECURITY DEFINER (doctrine D4).';
  end if;

  -- Le journal n'ouvre pas ce que la table ferme.
  if public.audit_detail_permission('rental_segment_costs')
     is distinct from 'rental.pricing.supplier.view' then
    raise exception
      'Le détail d''un coût gelé au journal doit exiger `rental.pricing.supplier.view`.';
  end if;

  -- Les acquis des LOTS 20 et 21 n'ont pas bougé en chemin : cette fonction est
  -- réécrite EN ENTIER, et une omission se lirait comme une suppression.
  if public.audit_detail_permission('supplier_vehicle_rates')
     is distinct from 'rental.pricing.supplier.view'
  or public.audit_detail_permission('service_variant_costs')
     is distinct from 'catalog.services.cost.view'
  or public.audit_detail_permission('maintenance_costs')
     is distinct from 'rental.maintenance.cost.view' then
    raise exception 'La cartographie du journal d''un lot antérieur a été altérée.';
  end if;

  /*
   * 🟥 DEC-002 RESTE EN VIGUEUR — Plan 02 §5.7 toujours écarté (Rapport 13 §5).
   *
   * « À égalité de spécificité, le tarif le plus récemment créé s'applique. »
   * Cette règle SUPPOSE que deux tarifs de portée identique coexistent. Une
   * contrainte d'exclusion sur `pricing_rules` la ferait échouer, et
   * `supabase/tests/location.sql` §15 avec elle.
   */
  if exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'pricing_rules' and c.contype = 'x'
  ) then
    raise exception
      'Une contrainte d''exclusion a été posée sur `pricing_rules` : elle contredit DEC-002.';
  end if;

  -- La contrainte du parc n'a pas été touchée : un véhicule ADIKOM ne devient
  -- pas « fourni » (Plan 02 §3.2, voie (a) refusée, A-3 comprise).
  if not exists (
    select 1 from pg_constraint
    where conname = 'vehicles_origin_attachment_coherent' and contype = 'c'
  ) then
    raise exception
      'La contrainte `vehicles_origin_attachment_coherent` a disparu : le LOT 22 ne doit pas y toucher.';
  end if;

  raise notice
    '[OK] 087. Catalogue à 196 ; avenants, segments et coût gelé en place, le coût gardé par sa seule capacité.';
end $$;
