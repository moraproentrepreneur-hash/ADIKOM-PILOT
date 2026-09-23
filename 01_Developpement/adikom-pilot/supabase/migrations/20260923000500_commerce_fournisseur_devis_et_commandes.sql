-- =============================================================================
-- ADIKOM PILOT — 101 · Commerce fournisseur : devis et commandes
-- LOT 26 — Plan 02 §9.1, §9.2, §9.5, §10.2, §13.2 · Plan 01 §15.3, §15.4, §15.5
--
-- CE QUE CETTE MIGRATION POSE
--
-- La couche commerciale du côté ACHAT, entre le catalogue de services (LOT 20)
-- et la facturation fournisseur (LOT 5). Elle n'en remplace aucune :
--
--     FOURNISSEUR → DEVIS FOURNISSEUR → COMMANDE FOURNISSEUR
--                                            → FACTURE FOURNISSEUR EXISTANTE
--                                            → PAIEMENT FOURNISSEUR EXISTANT
--                                            → TRÉSORERIE EXISTANTE
--
-- L'articulation avec `supplier_invoices` relève de la migration SUIVANTE : ici,
-- aucune table de facturation n'est touchée. Deux migrations plutôt qu'une parce
-- qu'elles répondent à deux questions distinctes — « qu'est-ce qu'un devis
-- fournisseur ? » et « comment une commande alimente-t-elle la facturation déjà
-- en place ? » — et qu'une reprise de l'une ne doit pas entraîner l'autre.
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 🟥 CE QU'EST UN « DEVIS FOURNISSEUR », ET CE QU'IL N'EST PAS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Le vocabulaire du commerce client ne se recopie PAS. ADIKOM n'émet aucun devis
-- à destination d'un fournisseur : elle ENREGISTRE l'offre qu'un fournisseur lui
-- a remise. Le document est REÇU, comme une facture fournisseur l'est.
--
-- Trois conséquences, et elles gouvernent tout le reste :
--
--   1. LE STATUT `SENT` SE LIT « REÇU ». L'acte n'est pas « remettre au
--      fournisseur » mais « enregistrer l'offre reçue, telle qu'elle a été
--      remise ». Le code de l'énumération est partagé avec le commerce client
--      (Plan 02 §9.5 n'en crée qu'une) ; le LIBELLÉ, lui, dit l'achat.
--   2. UNE RÉFÉRENCE EXTERNE EXISTE. Le fournisseur numérote son offre.
--      Module 07 §30 pose déjà la règle pour la facture reçue : « le numéro
--      fourni par le fournisseur peut également être enregistré comme référence
--      externe », DISTINCT du numéro interne. La même règle vaut ici, et c'est
--      la même colonne, du même nom, avec la même contrainte.
--   3. 🟥 LE PRIX EST SAISI, JAMAIS RÉSOLU. Voir ci-dessous.
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 🟥 LE PRIX D'UNE LIGNE D'ACHAT EST CELUI DE L'OFFRE — ET P-5 RESTE OUVERT
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Côté client, `add_sales_quote_line` RÉSOUT le prix du catalogue à la date du
-- document et REFUSE un prix saisi sur une ligne de catalogue : accepter un
-- montant libre y serait une remise déguisée, que rien ne garderait.
--
-- 🟥 LA RÈGLE S'INVERSE ICI, ET CE N'EST PAS UNE FACILITÉ.
--
-- `service_variant_costs` porte un coût de RÉFÉRENCE : une seule valeur par
-- variante et par date, sans dimension fournisseur. C'est précisément le point
-- P-5, RESTÉ OUVERT (Plan 02 §15, §18.1) : « un service a-t-il un prix d'achat
-- unique, ou un prix par fournisseur ? »
--
-- Résoudre ce coût et l'imposer à la ligne ferait passer une valeur interne pour
-- le prix négocié avec CE fournisseur — le devis ne dirait plus ce que le
-- fournisseur a proposé, et P-5 serait tranché en silence, par un défaut
-- d'implémentation. C'est exactement ce que CLAUDE.md §55 interdit.
--
-- Le prix d'une ligne d'achat est donc TOUJOURS SAISI, ligne de catalogue
-- comprise. Le service et la variante y restent nommés pour la TRAÇABILITÉ —
-- « qu'a-t-on acheté » — jamais pour la valorisation.
--
--     COÛT DE RÉFÉRENCE DU CATALOGUE   ≠   PRIX FOURNISSEUR FIGÉ SUR L'ACTE
--     service_variant_costs                purchase_*_lines.unit_price
--     une valeur, une date                 une offre, un fournisseur, une date
--     catalog.services.cost.update         commerce.purchase_quotes.create
--
-- 🟥 `service_variant_costs` N'EST NI MODIFIÉE, NI ÉTENDUE, NI ALIMENTÉE par ce
-- lot. Aucune colonne `supplier_id` ne lui est ajoutée. P-5 sort de ce lot
-- exactement comme il y est entré — et le commerce fournisseur fonctionne sans
-- avoir eu besoin de le trancher.
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 🟩 A-13 S'APPLIQUE — ET C'EST LA DOCUMENTATION QUI LE DIT, NON L'ANALOGIE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- La question A-13, telle que le Plan 01 §23 l'a posée à la Direction, ne parle
-- ni du client ni du fournisseur : « UN DEVIS / UNE COMMANDE peut-il porter une
-- ligne libre, sans service au catalogue ? » — réponse : « Oui, `service_id`
-- nullable ». Et le Plan 01 §15.3–15.4 décrit les quatre tables de ce lot comme
-- « MÊME STRUCTURE, SYMÉTRIQUE », avec `supplier_id` au lieu de `client_id`.
-- `service_id` nullable fait partie de cette structure.
--
-- A-13 n'est donc pas ÉTENDUE par ressemblance : elle était générale, et ces
-- tables sont celles qu'elle visait. Aucun service « Divers » n'est créé pour
-- faire entrer une ligne libre dans le modèle du catalogue.
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- AUCUNE MARGE, AUCUNE REMISE, AUCUN PRODUIT
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
--   · Plan 01 §15.3 : « aucune notion de marge — on n'a pas de marge sur un
--     achat ». Aucune fonction de marge n'est écrite.
--   · DEC-051 porte sur les remises CLIENTS, et son implémentation est différée.
--     Rien n'est décidé sur les rabais consentis par un fournisseur : aucun
--     moteur de remise n'est construit ici. Le prix d'une ligne est le prix NET
--     convenu, et le document ne prétend pas autre chose.
--   · Aucune table de produit, aucun stock, aucun entrepôt, aucune réception de
--     marchandise, aucun SKU. La réception d'une prestation se constate par le
--     passage de la commande à `DELIVERED` — UN STATUT, PAS UN DOCUMENT
--     (décision B-6, Plan 01 §15.5).
--   · Aucune taxe (DEC-014). Montants entiers, en KMF (DEC-010).
--
-- CINQ COUCHES, COMME AUX LOTS 5, 7, 22 ET 25
--
--   1. FONCTION       chaque acte vérifie SA capacité par `require_capability`.
--   2. DONNÉE         un acte engagé fige son en-tête, ses conditions, ses lignes.
--   3. TRANSITION     chaque changement de statut exige sa capacité — ce qui
--                     couvre le `PATCH` direct, hors de toute fonction.
--   4. RLS            lecture, création, modification, cycle, annulation.
--   5. ÉTAT DE DÉPART un acte naît en brouillon, y compris par `INSERT` direct.
--
-- Aucune fonction métier n'est `SECURITY DEFINER` (doctrine D4).
--
-- Catalogue : 213 → 229.
-- =============================================================================


-- =============================================================================
-- 1. LES ÉNUMÉRATIONS — CELLES DU LOT 25, RÉEMPLOYÉES
--
-- Plan 02 §9.5 crée `commercial_document_status` et `order_status`, et n'en
-- prévoit AUCUNE autre pour les quatre tables du LOT 26. Elles portent d'ailleurs
-- des noms délibérément génériques — `commercial_`, `order_` — là où tout le
-- reste du LOT 25 s'appelle `sales_`.
--
-- 🟥 RÉEMPLOYER UN TYPE N'EST PAS PARTAGER UNE VALEUR MÉTIER.
--
-- DEC-006 refuse qu'une réservation et une location partagent un jeu de statuts
-- parce que ce sont deux ENTITÉS. Ici, il s'agit du même TYPE de données —
-- l'ensemble des états qu'un document commercial peut prendre — appliqué à deux
-- entités distinctes, dans deux tables distinctes, avec deux jeux de
-- déclencheurs distincts et deux jeux de capacités distincts. Créer
-- `purchase_document_status` avec exactement les six mêmes valeurs n'aurait
-- fermé aucune porte et aurait ajouté un type de plus à maintenir.
--
-- CE QUI DIFFÈRE, C'EST LE LIBELLÉ, ET IL VIT DANS L'APPLICATION :
--
--     Code        Devis CLIENT          Devis FOURNISSEUR
--     ---------   -------------------   ----------------------------------
--     DRAFT       Brouillon             Brouillon        (saisie de l'offre)
--     SENT        Émis                  🟥 Reçu          (offre enregistrée)
--     ACCEPTED    Accepté               Retenu           (ADIKOM la retient)
--     REFUSED     Refusé                Écarté           (ADIKOM l'écarte)
--     CONVERTED   Converti              Converti         (commande née)
--     CANCELLED   Annulé                Annulé
--
--     Code        Commande CLIENT       Commande FOURNISSEUR
--     ---------   -------------------   ----------------------------------
--     DRAFT       Brouillon             Brouillon
--     CONFIRMED   Confirmée             Passée           (commande transmise)
--     DELIVERED   Livrée                🟥 Réceptionnée  (B-6 : un statut)
--     INVOICED    Facturée              Facturée
--     CANCELLED   Annulée               Annulée
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'commercial_document_status') then
    raise exception
      'Le type `commercial_document_status` est absent : le LOT 26 réemploie celui du LOT 25 (Plan 02 §9.5).';
  end if;

  if not exists (select 1 from pg_type where typname = 'order_status') then
    raise exception
      'Le type `order_status` est absent : le LOT 26 réemploie celui du LOT 25 (Plan 02 §9.5).';
  end if;
end $$;


-- =============================================================================
-- 2. NUMÉROTATION — DEV-F ET CDE-F, AUCUN SECOND NUMÉROTEUR
--
-- Plan 01 §15.5, mot pour mot : « Quatre règles ajoutées à `numbering_rules` :
-- `sales_quote` (DEV-C), `sales_order` (CDE-C), `purchase_quote` (DEV-F),
-- `purchase_order` (CDE-F). Format provisoire, comme `FAC-C`. »
--
-- Le suffixe `-F` est celui que la facture fournisseur porte déjà (`FAC-F`) :
-- la lecture d'une référence dit immédiatement de quel côté on se trouve.
--
-- `next_number` verrouille sa règle par `for update` : deux saisies simultanées
-- ne produisent jamais le même numéro. C'est elle qui rend la concurrence sûre,
-- pas l'écran.
--
-- 🟥 LE NUMÉRO INTERNE NE REMPLACE PAS LA RÉFÉRENCE DU FOURNISSEUR. Les deux
-- coexistent, dans deux colonnes, et jamais l'une à la place de l'autre.
-- =============================================================================

insert into public.numbering_rules
  (entity_key, label, prefix, include_year, padding, separator, reset_yearly, current_value)
values
  ('purchase_quote', 'Devis fournisseur',    'DEV-F', true, 6, '-', true, 0),
  ('purchase_order', 'Commande fournisseur', 'CDE-F', true, 6, '-', true, 0)
on conflict (entity_key) do nothing;


-- =============================================================================
-- 3. LES DEVIS FOURNISSEURS
-- =============================================================================

create table public.purchase_quotes (
  id uuid primary key default gen_random_uuid(),

  -- DEV-F-2026-000001, règle `purchase_quote` posée au §2.
  quote_no text not null unique,

  /*
   * 🟥 LA RÉFÉRENCE DU FOURNISSEUR — distincte du numéro interne.
   *
   * Même colonne, même nom et même contrainte que `supplier_invoices.external_ref`
   * (Module 07 §30) : une offre reçue porte le plus souvent le numéro que le
   * fournisseur lui a donné, et c'est par lui qu'on la retrouvera dans SES
   * archives. Facultative : une offre remise sans référence lisible reste une
   * offre.
   */
  external_ref text,

  -- Le fournisseur du module Tiers, JAMAIS recopié : aucune table « supplier »
  -- parallèle. `restrict` : un fournisseur cité par un acte ne disparaît pas.
  supplier_id uuid not null references public.suppliers (id) on delete restrict,

  /*
   * LA DATE DE L'OFFRE.
   *
   * ⚠ Contrairement au devis client, elle NE DÉTERMINE AUCUN PRIX : les prix
   * d'une ligne d'achat sont saisis (voir l'en-tête). Elle situe l'acte, sert au
   * classement, et donne son point de comparaison au coût de référence que
   * l'écran affiche à titre indicatif.
   */
  quote_date date not null,

  /*
   * VALIDITÉ — facultative, et jamais inventée.
   *
   * Une offre fournisseur porte souvent sa propre durée de validité, et c'est LE
   * FOURNISSEUR qui la fixe : il n'y a donc, ici moins qu'ailleurs, aucune durée
   * par défaut à proposer.
   *
   * L'EXPIRATION EST DÉRIVÉE (B-7) : elle se lit de cette date et du jour
   * comorien, elle ne s'écrit pas dans `status`. Aucun ordonnanceur n'existe.
   */
  valid_until date,

  currency_code text not null default 'KMF',

  status public.commercial_document_status not null default 'DRAFT',

  notes text,
  terms text,

  -- Chaque acte du cycle laisse sa trace : qui, quand.
  -- `sent_*` se lit « reçu » de ce côté-ci : c'est l'enregistrement de l'offre.
  sent_at      timestamptz,
  sent_by      uuid references public.app_users (id) on delete set null,
  accepted_at  timestamptz,
  accepted_by  uuid references public.app_users (id) on delete set null,
  refused_at   timestamptz,
  refused_by   uuid references public.app_users (id) on delete set null,
  converted_at timestamptz,
  converted_by uuid references public.app_users (id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.app_users (id) on delete set null,

  status_reason     text,
  status_changed_at timestamptz,
  status_changed_by uuid references public.app_users (id) on delete set null,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  constraint purchase_quotes_validity check (valid_until is null or valid_until >= quote_date),

  -- Une référence externe vide n'est pas une référence : elle est absente.
  constraint purchase_quotes_external_ref_not_blank check (
    external_ref is null or btrim(external_ref) <> ''
  )
);

comment on table public.purchase_quotes is
  'Devis FOURNISSEUR — offre REÇUE d''un fournisseur et enregistrée par ADIKOM. Son prix est celui que le fournisseur a proposé, figé sur la ligne ; il n''est jamais relu du catalogue.';
comment on column public.purchase_quotes.quote_no is
  'Numéro interne ADIKOM (DEV-F-2026-000001). Distinct de la référence du fournisseur, jamais confondu avec elle.';
comment on column public.purchase_quotes.external_ref is
  'Référence portée par le document du fournisseur (Module 07 §30, même règle). Facultative.';
comment on column public.purchase_quotes.status is
  'DRAFT · SENT (lire « reçu ») · ACCEPTED · REFUSED · CONVERTED · CANCELLED. Aucun état « expiré » : la péremption est dérivée de `valid_until` (B-7).';

create index purchase_quotes_supplier_idx on public.purchase_quotes (supplier_id, quote_date desc);
create index purchase_quotes_status_idx   on public.purchase_quotes (status, quote_date desc);
create index purchase_quotes_external_idx on public.purchase_quotes (lower(external_ref))
  where external_ref is not null;

create trigger purchase_quotes_set_updated_at
  before update on public.purchase_quotes
  for each row execute function public.fn_set_updated_at();

create trigger purchase_quotes_audit
  after insert or update on public.purchase_quotes
  for each row execute function public.fn_audit_row('commerce');

create trigger purchase_quotes_no_delete
  before delete on public.purchase_quotes
  for each row execute function public.fn_forbid_delete();


-- --- Lignes de devis fournisseur ---------------------------------------------
--
-- 🟩 A-13 — DEUX NATURES, UN SEUL MODÈLE (voir l'en-tête).
--
--   TYPE A · ligne catalogue : service + variante nommés, prix SAISI.
--   TYPE B · ligne libre     : désignation saisie, prix saisi, aucun service.
--
-- La nature d'une ligne n'est PAS une colonne : elle se lit de la présence du
-- service. Une colonne de plus aurait pu contredire la donnée.
--
-- 🟥 `unit_price` EST LE PRIX DU FOURNISSEUR, PAS LE COÛT DU CATALOGUE. Aucune
-- colonne de cette table ne recopie `service_variant_costs`, et le contrôle final
-- refuse qu'une telle colonne apparaisse un jour.
--
-- EXTENSIBLE AUX PRODUITS, SANS LES PRÉTENDRE. Le jour où les produits
-- existeront, ils se rattacheront par le même couple de colonnes nullables.

create table public.purchase_quote_lines (
  id uuid primary key default gen_random_uuid(),

  purchase_quote_id uuid not null
    references public.purchase_quotes (id) on delete cascade,

  service_id         uuid references public.services (id) on delete restrict,
  service_variant_id uuid references public.service_variants (id) on delete restrict,

  -- COPIÉE du catalogue au moment de l'ajout, ou saisie. Un service renommé ne
  -- réécrit pas les offres passées.
  label text not null check (length(btrim(label)) > 0),

  -- B-14 : la quantité reste ENTIÈRE, comme sur les lignes de facture.
  quantity integer not null check (quantity > 0),

  -- DEC-010 : entier, en KMF. Le prix proposé par CE fournisseur, sur CET acte.
  unit_price bigint not null check (unit_price > 0),

  -- D6 : une ligne saisie par erreur s'archive, elle ne s'efface pas.
  is_archived boolean not null default false,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  constraint purchase_quote_lines_catalog_pair check (
    (service_id is null and service_variant_id is null)
    or (service_id is not null and service_variant_id is not null)
  ),

  /*
   * La variante appartient bien à CE service, et c'est la BASE qui le dit.
   *
   * 🟥 UN DÉCLENCHEUR NE SUFFIRAIT PAS : il lirait `service_variants` À TRAVERS
   * RLS et, sans `catalog.services.view`, conclurait « introuvable ». La clé
   * étrangère composite, elle, s'évalue sous le propriétaire de la table
   * (migration 097 §3, index `service_variants_id_service_idx`).
   */
  constraint purchase_quote_lines_variant_belongs
    foreign key (service_variant_id, service_id)
    references public.service_variants (id, service_id) on delete restrict
);

comment on table public.purchase_quote_lines is
  'Lignes d''un devis fournisseur. Prix SAISI — celui de l''offre —, figé à l''ajout. `service_id` nul = ligne libre (A-13). Aucun coût de catalogue n''y est recopié.';

create index purchase_quote_lines_quote_idx
  on public.purchase_quote_lines (purchase_quote_id, created_at);

create trigger purchase_quote_lines_set_updated_at
  before update on public.purchase_quote_lines
  for each row execute function public.fn_set_updated_at();

create trigger purchase_quote_lines_audit
  after insert or update on public.purchase_quote_lines
  for each row execute function public.fn_audit_row('commerce');

create trigger purchase_quote_lines_no_delete
  before delete on public.purchase_quote_lines
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- 4. LES COMMANDES FOURNISSEURS
-- =============================================================================

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),

  order_no text not null unique,               -- CDE-F-2026-000001

  supplier_id uuid not null references public.suppliers (id) on delete restrict,

  /*
   * L'ORIGINE — FACULTATIVE.
   *
   * Plan 01 §15.2 écrit, pour la commande client, `sales_quote_id uuid →
   * sales_quotes, -- origine facultative` ; §15.3–15.4 donnent aux tables
   * fournisseurs la « même structure, symétrique ». La colonne est donc nullable
   * PAR CONCEPTION, et non par facilité.
   *
   * CAS A : née d'un devis fournisseur retenu. Lien explicite et permanent.
   * CAS B : créée directement — ADIKOM commande sans avoir demandé d'offre.
   *         C'est le cas courant d'un achat de routine, et refuser la commande
   *         directe obligerait à saisir une offre fictive pour l'autoriser.
   */
  purchase_quote_id uuid references public.purchase_quotes (id) on delete restrict,

  order_date    date not null,

  -- Date de réception attendue. Facultative. Aucun bon de livraison n'existe :
  -- la réception se constate par le statut `DELIVERED` (B-6).
  expected_date date,

  currency_code text not null default 'KMF',

  status public.order_status not null default 'DRAFT',

  notes text,
  terms text,

  confirmed_at timestamptz,
  confirmed_by uuid references public.app_users (id) on delete set null,
  delivered_at timestamptz,
  delivered_by uuid references public.app_users (id) on delete set null,
  invoiced_at  timestamptz,
  invoiced_by  uuid references public.app_users (id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.app_users (id) on delete set null,

  status_reason     text,
  status_changed_at timestamptz,
  status_changed_by uuid references public.app_users (id) on delete set null,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  constraint purchase_orders_expected check (expected_date is null or expected_date >= order_date)
);

comment on table public.purchase_orders is
  'Commande FOURNISSEUR. Peut naître d''un devis fournisseur retenu ou directement. Alimente la facturation fournisseur EXISTANTE ; aucune facture parallèle.';

create index purchase_orders_supplier_idx on public.purchase_orders (supplier_id, order_date desc);
create index purchase_orders_status_idx   on public.purchase_orders (status, order_date desc);

/*
 * 🟥 UN DEVIS FOURNISSEUR NE PRODUIT PAS DEUX COMMANDES.
 *
 * L'index partiel fait autorité, y compris pour deux clics simultanés et pour un
 * `POST` direct. Une commande ANNULÉE libère la place : le devis, ramené à
 * « retenu » par `set_purchase_order_status`, se reconvertit. Sans cette
 * échappée, une commande annulée par erreur enfermerait le devis pour toujours.
 */
create unique index purchase_orders_one_per_quote_idx
  on public.purchase_orders (purchase_quote_id)
  where purchase_quote_id is not null and status <> 'CANCELLED';

create trigger purchase_orders_set_updated_at
  before update on public.purchase_orders
  for each row execute function public.fn_set_updated_at();

create trigger purchase_orders_audit
  after insert or update on public.purchase_orders
  for each row execute function public.fn_audit_row('commerce');

create trigger purchase_orders_no_delete
  before delete on public.purchase_orders
  for each row execute function public.fn_forbid_delete();


-- --- Lignes de commande fournisseur ------------------------------------------
--
-- Même forme que la ligne de devis, plus `source_quote_line_id` : la traçabilité
-- ligne à ligne de la conversion. Le prix n'est PAS ressaisi à la conversion —
-- il est REPRIS de la ligne de devis.

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),

  purchase_order_id uuid not null
    references public.purchase_orders (id) on delete cascade,

  service_id         uuid references public.services (id) on delete restrict,
  service_variant_id uuid references public.service_variants (id) on delete restrict,

  -- La ligne de devis dont celle-ci est née. `set null` : la commande reste
  -- exacte même si l'historique du devis venait à disparaître d'une
  -- réinitialisation ; son montant, lui, est déjà chez elle.
  source_quote_line_id uuid
    references public.purchase_quote_lines (id) on delete set null,

  label      text    not null check (length(btrim(label)) > 0),
  quantity   integer not null check (quantity > 0),
  unit_price bigint  not null check (unit_price > 0),

  is_archived boolean not null default false,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  constraint purchase_order_lines_catalog_pair check (
    (service_id is null and service_variant_id is null)
    or (service_id is not null and service_variant_id is not null)
  ),

  constraint purchase_order_lines_variant_belongs
    foreign key (service_variant_id, service_id)
    references public.service_variants (id, service_id) on delete restrict
);

comment on table public.purchase_order_lines is
  'Lignes d''une commande fournisseur. Reprises du devis ou saisies. Prix figé ; aucun coût de catalogue n''y est recopié.';

create index purchase_order_lines_order_idx
  on public.purchase_order_lines (purchase_order_id, created_at);

create index purchase_order_lines_source_idx
  on public.purchase_order_lines (source_quote_line_id)
  where source_quote_line_id is not null;

create trigger purchase_order_lines_set_updated_at
  before update on public.purchase_order_lines
  for each row execute function public.fn_set_updated_at();

create trigger purchase_order_lines_audit
  after insert or update on public.purchase_order_lines
  for each row execute function public.fn_audit_row('commerce');

create trigger purchase_order_lines_no_delete
  before delete on public.purchase_order_lines
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- 5. LES TOTAUX — CALCULÉS, JAMAIS STOCKÉS (D1)
--
-- `security invoker` : la somme ne voit que les lignes que RLS laisse voir. Sans
-- `commerce.purchase_quotes.view`, elle rend 0 — et l'écran DIT qu'il ne sait pas
-- plutôt que d'afficher ce zéro (DEC-017). La couche applicative ne l'appelle
-- jamais sans avoir vérifié la capacité.
--
-- AUCUNE FONCTION DE MARGE : Plan 01 §15.3, « on n'a pas de marge sur un achat ».
-- =============================================================================

create or replace function public.purchase_quote_total(p_quote_id uuid)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(l.quantity::bigint * l.unit_price), 0)::bigint
  from public.purchase_quote_lines l
  where l.purchase_quote_id = p_quote_id
    and l.is_archived = false;
$$;

comment on function public.purchase_quote_total(uuid) is
  'Total d''un devis fournisseur : Σ quantité × prix unitaire des lignes actives. Aucun montant n''est stocké (D1).';

revoke execute on function public.purchase_quote_total(uuid) from public, anon;
grant  execute on function public.purchase_quote_total(uuid) to authenticated, service_role;


create or replace function public.purchase_order_total(p_order_id uuid)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(l.quantity::bigint * l.unit_price), 0)::bigint
  from public.purchase_order_lines l
  where l.purchase_order_id = p_order_id
    and l.is_archived = false;
$$;

comment on function public.purchase_order_total(uuid) is
  'Total d''une commande fournisseur : Σ quantité × prix unitaire des lignes actives. Aucun montant n''est stocké (D1).';

revoke execute on function public.purchase_order_total(uuid) from public, anon;
grant  execute on function public.purchase_order_total(uuid) to authenticated, service_role;


-- =============================================================================
-- 6. COUCHE 5 — UN ACTE D'ACHAT NAÎT EN BROUILLON
--
-- `fn_commercial_document_starts_draft` (migration 097 §7) lit `new` par
-- `to_jsonb` : elle ne nomme aucune colonne propre au commerce client et
-- s'applique donc telle quelle aux deux tables de ce lot. Elle n'est PAS
-- réécrite — elle est simplement branchée. Son nom générique montre qu'elle
-- avait été prévue pour cela.
-- =============================================================================

create trigger purchase_quotes_starts_draft
  before insert on public.purchase_quotes
  for each row execute function public.fn_commercial_document_starts_draft();

create trigger purchase_orders_starts_draft
  before insert on public.purchase_orders
  for each row execute function public.fn_commercial_document_starts_draft();


-- =============================================================================
-- 7. COUCHE 3 — LES TRANSITIONS DU DEVIS FOURNISSEUR
--
--   BROUILLON ──enregistrer──▶ REÇU ──retenir──▶ RETENU ──convertir──▶ CONVERTI
--       │                       │                  │
--       │                       │ écarter          │
--       │                       ▼                  │
--       │                   ┌────────┐             │
--       │                   │ ÉCARTÉ │             │
--       │                   └────────┘             │
--       └───────────────────────┴──────────────────┴────────────▶ ANNULÉ
--
-- QUELLE CAPACITÉ POUR QUEL ACTE — le Plan 02 §10.2 en donne huit, et huit
-- seulement. Les actes du cycle se répartissent donc entre `validate` et
-- `cancel`, exactement comme au LOT 25 :
--
--   `validate` — FAIRE AVANCER L'OFFRE : l'enregistrer telle qu'elle a été
--                reçue, puis la retenir ou l'écarter. Retenir et écarter sont le
--                MÊME geste — la décision d'ADIKOM sur cette offre — par la même
--                personne, sur le même écran.
--   `cancel`   — RETIRER L'ENREGISTREMENT. Une offre écartée n'est pas une offre
--                annulée : l'une a été jugée, l'autre n'aurait pas dû être là.
--
-- `CONVERTED` n'est atteint que par `convert_purchase_quote_to_order`, qui exige
-- `commerce.purchase_orders.create` : c'est la création de la commande qui est
-- l'acte, et la conversion du devis en est la CONSÉQUENCE.
-- =============================================================================

create or replace function public.fn_purchase_quote_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_allowed public.commercial_document_status[];
begin
  if new.status is distinct from old.status then

    v_allowed := case old.status
      when 'DRAFT'     then array['SENT','CANCELLED']::public.commercial_document_status[]
      when 'SENT'      then array['ACCEPTED','REFUSED','CANCELLED']::public.commercial_document_status[]
      -- Une offre retenue mais non commandée peut encore être retirée : le
      -- besoin peut tomber avant que la commande n'existe.
      when 'ACCEPTED'  then array['CONVERTED','CANCELLED']::public.commercial_document_status[]
      -- Convertie : la commande existe. Le devis est un acte du passé. Son
      -- retour à « retenu » n'est possible que par l'annulation de cette
      -- commande, seul chemin qui libère aussi l'index d'unicité.
      when 'CONVERTED' then array['ACCEPTED']::public.commercial_document_status[]
      else array[]::public.commercial_document_status[]
    end;

    if not (new.status = any (v_allowed)) then
      raise exception
        'Transition de devis fournisseur refusée : « % » ne peut pas devenir « % ».',
        old.status, new.status
        using errcode = 'check_violation';
    end if;

    case new.status
      when 'SENT' then
        perform public.require_capability(
          array['commerce.purchase_quotes.validate'],
          'enregistrer une offre fournisseur reçue');

        -- Une offre sans ligne n'est pas une offre : on n'enregistre pas un
        -- document dont le montant serait nul.
        if public.purchase_quote_total(new.id) <= 0 then
          raise exception
            'Opération refusée : ce devis fournisseur ne porte aucune ligne. Un montant est nécessaire à son enregistrement.'
            using errcode = 'check_violation';
        end if;

      when 'ACCEPTED' then
        if old.status = 'CONVERTED' then
          -- Retour d'une conversion annulée : c'est l'annulation de la commande
          -- qui l'autorise, et elle seule.
          perform public.require_capability(
            array['commerce.purchase_orders.cancel'],
            'ramener un devis fournisseur à « retenu » après annulation de sa commande');
        else
          perform public.require_capability(
            array['commerce.purchase_quotes.validate'],
            'retenir une offre fournisseur');
        end if;

      when 'REFUSED' then
        perform public.require_capability(
          array['commerce.purchase_quotes.validate'], 'écarter une offre fournisseur');

      when 'CONVERTED' then
        perform public.require_capability(
          array['commerce.purchase_orders.create'],
          'convertir un devis fournisseur en commande');

      when 'CANCELLED' then
        perform public.require_capability(
          array['commerce.purchase_quotes.cancel'], 'annuler un devis fournisseur');

      else
        null;
    end case;
  end if;

  /*
   * COUCHE 2 — LE VERROU.
   *
   * Un devis qui a quitté le brouillon fige ce qui le constitue : son
   * fournisseur, sa date, sa validité, son numéro, sa devise, SA RÉFÉRENCE
   * EXTERNE et SES CONDITIONS.
   *
   * 🟥 LA RÉFÉRENCE EXTERNE EST DANS LE GEL, et c'est la leçon de la
   * migration 100 appliquée d'emblée : elle identifie le document du
   * fournisseur. La laisser réécrivable permettrait de faire passer une offre
   * enregistrée pour une autre. `supplier_invoices` la gèle déjà après
   * validation, pour la même raison.
   *
   * Les LIGNES sont gelées par leur propre déclencheur.
   */
  if old.status <> 'DRAFT'
     and (new.supplier_id   is distinct from old.supplier_id
       or new.quote_date    is distinct from old.quote_date
       or new.valid_until   is distinct from old.valid_until
       or new.quote_no      is distinct from old.quote_no
       or new.external_ref  is distinct from old.external_ref
       or new.currency_code is distinct from old.currency_code
       or new.terms         is distinct from old.terms)
     and not public.is_restoring() then
    raise exception
      'Opération refusée : un devis fournisseur enregistré ne se réécrit plus. Son fournisseur, sa date, sa validité, sa référence et ses conditions sont ceux de l''offre reçue.'
      using errcode = 'check_violation';
  end if;

  /*
   * ANNOTER, C'EST MODIFIER — dans tous les états (migration 100).
   *
   * Les observations restent annotables après enregistrement, comme celles d'une
   * facture depuis le LOT 7. Mais l'acte exige SA capacité, au lieu de suivre
   * incidemment celle d'un voisin : sans cette garde, un porteur de
   * `commerce.purchase_orders.create` — que la policy d'écriture admet pour la
   * conversion — pourrait annoter n'importe quel devis fournisseur.
   */
  if new.notes is distinct from old.notes and not public.is_restoring() then
    perform public.require_capability(
      array['commerce.purchase_quotes.update'],
      'modifier les observations d''un devis fournisseur');
  end if;

  -- Modifier un devis encore en brouillon relève de `update`.
  if old.status = 'DRAFT'
     and (new.supplier_id  is distinct from old.supplier_id
       or new.quote_date   is distinct from old.quote_date
       or new.valid_until  is distinct from old.valid_until
       or new.external_ref is distinct from old.external_ref
       or new.terms        is distinct from old.terms) then
    perform public.require_capability(
      array['commerce.purchase_quotes.update'], 'modifier un devis fournisseur');
  end if;

  return new;
end;
$$;

comment on function public.fn_purchase_quote_transition() is
  'Couches 2 et 3 du devis fournisseur : transitions autorisées, capacité de chacune, gel de l''en-tête, de la référence externe et des conditions hors brouillon.';

revoke execute on function public.fn_purchase_quote_transition() from public, anon;

create trigger purchase_quotes_transition
  before update on public.purchase_quotes
  for each row execute function public.fn_purchase_quote_transition();


-- =============================================================================
-- 8. COUCHE 3 — LES TRANSITIONS DE LA COMMANDE FOURNISSEUR
--
--   BROUILLON ──passer──▶ PASSÉE ──réceptionner──▶ RÉCEPTIONNÉE
--                            │                          │
--                            └────────facturer──────────┴──▶ FACTURÉE
--                                                              │
--   (annulation de la facture)  ◀──────────────────────────────┘
--
--   BROUILLON · PASSÉE · RÉCEPTIONNÉE ────annuler────▶ ANNULÉE
--
-- 🟥 LA RÉCEPTION N'EST PAS UN PASSAGE OBLIGÉ, ET CE N'EST PAS UN DOCUMENT.
-- Plan 01 §15.5, décision B-6 : « Aucune livraison, aucun bon de livraison,
-- aucune réception. La réception d'une prestation est constatée par le passage
-- de la commande fournisseur à `DELIVERED` — un statut, pas un document. »
--
-- `INVOICED` n'est écrit que par `create_invoice_from_purchase_order`
-- (migration 102), et le retour à `CONFIRMED` que par l'annulation de la
-- facture.
-- =============================================================================

create or replace function public.fn_purchase_order_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_allowed public.order_status[];
begin
  if new.status is distinct from old.status then

    v_allowed := case old.status
      when 'DRAFT'     then array['CONFIRMED','CANCELLED']::public.order_status[]
      when 'CONFIRMED' then array['DELIVERED','INVOICED','CANCELLED']::public.order_status[]
      when 'DELIVERED' then array['INVOICED','CANCELLED']::public.order_status[]
      -- Le retour à « passée » n'est pas une marche arrière de complaisance :
      -- c'est le seul état cohérent d'une commande dont la facture a été annulée.
      when 'INVOICED'  then array['CONFIRMED']::public.order_status[]
      else array[]::public.order_status[]
    end;

    if not (new.status = any (v_allowed)) then
      raise exception
        'Transition de commande fournisseur refusée : « % » ne peut pas devenir « % ».',
        old.status, new.status
        using errcode = 'check_violation';
    end if;

    case new.status
      when 'CONFIRMED' then
        if old.status = 'INVOICED' then
          perform public.require_capability(
            array['billing.supplier_invoices.cancel'],
            'ramener une commande fournisseur à « passée » après annulation de sa facture');
        else
          perform public.require_capability(
            array['commerce.purchase_orders.validate'],
            'passer une commande fournisseur');

          if public.purchase_order_total(new.id) <= 0 then
            raise exception
              'Opération refusée : cette commande fournisseur ne porte aucune ligne. Un montant est nécessaire pour la passer.'
              using errcode = 'check_violation';
          end if;
        end if;

      when 'DELIVERED' then
        perform public.require_capability(
          array['commerce.purchase_orders.validate'],
          'constater la réception d''une commande fournisseur');

      when 'INVOICED' then
        perform public.require_capability(
          array['billing.supplier_invoices.create'],
          'enregistrer la facture d''une commande fournisseur');

      when 'CANCELLED' then
        perform public.require_capability(
          array['commerce.purchase_orders.cancel'], 'annuler une commande fournisseur');

      else
        null;
    end case;
  end if;

  -- COUCHE 2 — une commande qui a quitté le brouillon fige ce qui l'engage,
  -- ses CONDITIONS comprises (migration 100).
  if old.status <> 'DRAFT'
     and (new.supplier_id       is distinct from old.supplier_id
       or new.purchase_quote_id is distinct from old.purchase_quote_id
       or new.order_date        is distinct from old.order_date
       or new.order_no          is distinct from old.order_no
       or new.currency_code     is distinct from old.currency_code
       or new.terms             is distinct from old.terms)
     and not public.is_restoring() then
    raise exception
      'Opération refusée : une commande fournisseur passée ne se réécrit plus. Son fournisseur, son origine, sa date et ses conditions sont ceux de l''engagement pris.'
      using errcode = 'check_violation';
  end if;

  -- Annoter, c'est modifier — dans tous les états.
  if new.notes is distinct from old.notes and not public.is_restoring() then
    perform public.require_capability(
      array['commerce.purchase_orders.update'],
      'modifier les observations d''une commande fournisseur');
  end if;

  if old.status = 'DRAFT'
     and (new.supplier_id   is distinct from old.supplier_id
       or new.order_date    is distinct from old.order_date
       or new.expected_date is distinct from old.expected_date
       or new.terms         is distinct from old.terms) then
    perform public.require_capability(
      array['commerce.purchase_orders.update'], 'modifier une commande fournisseur');
  end if;

  return new;
end;
$$;

comment on function public.fn_purchase_order_transition() is
  'Couches 2 et 3 de la commande fournisseur : transitions autorisées, capacité de chacune, gel de l''en-tête et des conditions hors brouillon.';

revoke execute on function public.fn_purchase_order_transition() from public, anon;

create trigger purchase_orders_transition
  before update on public.purchase_orders
  for each row execute function public.fn_purchase_order_transition();


-- =============================================================================
-- 9. COUCHE 2 — LES LIGNES SE FIGENT DÈS QUE L'ACTE QUITTE LE BROUILLON
--
-- 🟥 L'ARCHIVAGE EST INCLUS DANS LE GEL. Retirer une ligne d'un devis enregistré
-- changerait son total aussi sûrement qu'en modifier le prix — et l'offre du
-- fournisseur ne se réécrit pas.
-- =============================================================================

create or replace function public.fn_purchase_quote_line_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status public.commercial_document_status;
  v_seen   boolean := false;
begin
  select true, q.status into v_seen, v_status
  from public.purchase_quotes q
  where q.id = new.purchase_quote_id;

  -- Introuvable, ou invisible faute de capacité : même réponse (DEC-017).
  if not v_seen then
    raise exception
      'Le devis fournisseur visé est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if v_status <> 'DRAFT' and not public.is_restoring() then
    raise exception
      'Opération refusée : les lignes d''un devis fournisseur enregistré sont figées. L''offre reçue ne se réécrit pas.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_purchase_quote_line_guard() is
  'Couche 2 : les lignes d''un devis fournisseur enregistré, retenu, écarté, converti ou annulé sont figées.';

revoke execute on function public.fn_purchase_quote_line_guard() from public, anon;

create trigger purchase_quote_lines_guard
  before insert or update on public.purchase_quote_lines
  for each row execute function public.fn_purchase_quote_line_guard();


create or replace function public.fn_purchase_order_line_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status public.order_status;
  v_seen   boolean := false;
begin
  select true, o.status into v_seen, v_status
  from public.purchase_orders o
  where o.id = new.purchase_order_id;

  if not v_seen then
    raise exception
      'La commande fournisseur visée est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if v_status <> 'DRAFT' and not public.is_restoring() then
    raise exception
      'Opération refusée : les lignes d''une commande fournisseur passée sont figées. L''engagement pris ne se réécrit pas.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_purchase_order_line_guard() is
  'Couche 2 : les lignes d''une commande fournisseur passée, réceptionnée, facturée ou annulée sont figées.';

revoke execute on function public.fn_purchase_order_line_guard() from public, anon;

create trigger purchase_order_lines_guard
  before insert or update on public.purchase_order_lines
  for each row execute function public.fn_purchase_order_line_guard();


-- =============================================================================
-- 10. COUCHE 1 — LES ACTES DU DEVIS FOURNISSEUR
--
-- Chaque fonction vérifie SA capacité en première instruction (Plan 02 §8.3), et
-- la cohérence métier AVANT tout test sur l'acteur : sans quoi la clé de service
-- contournerait les règles (§8.3 n° 4).
-- =============================================================================

create or replace function public.create_purchase_quote(
  p_supplier_id  uuid,
  p_quote_date   date,
  p_valid_until  date default null,
  p_external_ref text default null,
  p_notes        text default null,
  p_terms        text default null
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
    array['commerce.purchase_quotes.create'], 'enregistrer un devis fournisseur');
  perform public.require_capability(
    array['commerce.purchase_quotes.view'], 'consulter le devis fournisseur enregistré');
  -- On n'enregistre pas l'offre d'un tiers qu'on n'a pas le droit de consulter :
  -- le rattachement serait posé à l'aveugle (même règle que la facture reçue).
  perform public.require_capability(
    array['parties.suppliers.view'], 'consulter le fournisseur de l''offre');

  if p_supplier_id is null then
    raise exception 'Un devis fournisseur se rattache obligatoirement à un fournisseur.'
      using errcode = 'check_violation';
  end if;

  if p_quote_date is null then
    raise exception 'La date de l''offre est obligatoire.'
      using errcode = 'check_violation';
  end if;

  if p_valid_until is not null and p_valid_until < p_quote_date then
    raise exception 'La validité d''une offre ne peut pas précéder sa date.'
      using errcode = 'check_violation';
  end if;

  /*
   * Le fournisseur n'est PAS exigé actif par la BASE.
   *
   * La doctrine du module Tiers — « le statut doit être pris en compte lors des
   * nouvelles opérations » (Module 04 §9) — est appliquée LÀ OÙ ELLE EST DÉJÀ
   * APPLIQUÉE : `listSupplierFilters` ne propose que les fournisseurs actifs,
   * exactement comme pour une facture fournisseur. L'imposer ici en plus
   * interdirait d'enregistrer, après coup, une offre reçue d'un fournisseur
   * devenu inactif entre-temps — un document qui existe hors du système et qu'on
   * ne ferait alors que perdre (même raisonnement que DEC-027 §i).
   *
   * Introuvable ou invisible : même réponse (DEC-017).
   */
  if not exists (select 1 from public.suppliers s where s.id = p_supplier_id) then
    raise exception
      'Le fournisseur désigné est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  v_no := public.next_number('purchase_quote');

  insert into public.purchase_quotes
    (quote_no, external_ref, supplier_id, quote_date, valid_until, notes, terms,
     created_by, updated_by)
  values
    (v_no, nullif(btrim(coalesce(p_external_ref, '')), ''),
     p_supplier_id, p_quote_date, p_valid_until,
     nullif(btrim(coalesce(p_notes, '')), ''),
     nullif(btrim(coalesce(p_terms, '')), ''),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.create_purchase_quote(uuid, date, date, text, text, text) is
  'Enregistre une offre REÇUE d''un fournisseur, en brouillon. Ne crée ni commande, ni facture, ni mouvement de trésorerie.';

revoke execute on function public.create_purchase_quote(uuid, date, date, text, text, text) from public, anon;
grant  execute on function public.create_purchase_quote(uuid, date, date, text, text, text) to authenticated, service_role;


create or replace function public.update_purchase_quote(
  p_quote_id     uuid,
  p_quote_date   date,
  p_valid_until  date default null,
  p_external_ref text default null,
  p_notes        text default null,
  p_terms        text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  q public.purchase_quotes%rowtype;
begin
  perform public.require_capability(
    array['commerce.purchase_quotes.update'], 'modifier un devis fournisseur');
  perform public.require_capability(
    array['commerce.purchase_quotes.view'], 'consulter le devis fournisseur à modifier');

  select * into q from public.purchase_quotes where id = p_quote_id for update;

  if not found then
    raise exception 'Devis fournisseur introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if q.status <> 'DRAFT' then
    raise exception
      'Opération refusée : seul un devis fournisseur en brouillon se modifie. Celui-ci est « % ».', q.status
      using errcode = 'check_violation';
  end if;

  if p_quote_date is null then
    raise exception 'La date de l''offre est obligatoire.' using errcode = 'check_violation';
  end if;

  if p_valid_until is not null and p_valid_until < p_quote_date then
    raise exception 'La validité d''une offre ne peut pas précéder sa date.'
      using errcode = 'check_violation';
  end if;

  update public.purchase_quotes
     set quote_date   = p_quote_date,
         valid_until  = p_valid_until,
         external_ref = nullif(btrim(coalesce(p_external_ref, '')), ''),
         notes        = nullif(btrim(coalesce(p_notes, '')), ''),
         terms        = nullif(btrim(coalesce(p_terms, '')), ''),
         updated_by   = public.current_actor()
   where id = q.id;
end;
$$;

comment on function public.update_purchase_quote(uuid, date, date, text, text, text) is
  'Modifie un devis fournisseur en brouillon. Le fournisseur n''y est pas modifiable : l''offre d''un autre fournisseur est une autre offre.';

revoke execute on function public.update_purchase_quote(uuid, date, date, text, text, text) from public, anon;
grant  execute on function public.update_purchase_quote(uuid, date, date, text, text, text) to authenticated, service_role;


/*
 * AJOUTER UNE LIGNE — LES DEUX TYPES DE A-13, PAR UNE SEULE FONCTION.
 *
 * 🟥 LE PRIX EST OBLIGATOIRE DANS LES DEUX CAS, ET C'EST LA DIFFÉRENCE CENTRALE
 * AVEC LE COMMERCE CLIENT.
 *
 *   p_variant_id RENSEIGNÉ → LIGNE CATALOGUE. Le service et la variante sont
 *       nommés pour la TRAÇABILITÉ ; le prix reste celui que le fournisseur a
 *       proposé. Le catalogue N'EST PAS interrogé : son coût de référence n'a
 *       pas de dimension fournisseur (P-5, ouvert), et l'appliquer ferait passer
 *       une valeur interne pour une offre reçue.
 *   p_variant_id ABSENT → LIGNE LIBRE (A-13). La ligne ne porte aucun service.
 *
 * 🟥 LE PRIX EST FIGÉ ICI, ET UNE FOIS POUR TOUTES. Aucune relecture ultérieure,
 * ni à la conversion, ni à la facturation.
 */
create or replace function public.add_purchase_quote_line(
  p_quote_id   uuid,
  p_quantity   integer,
  p_unit_price bigint,
  p_variant_id uuid default null,
  p_label      text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id      uuid;
  q         public.purchase_quotes%rowtype;
  v_service uuid;
  v_vlabel  text;
  v_slabel  text;
  v_label   text;
begin
  perform public.require_capability(
    array['commerce.purchase_quotes.create', 'commerce.purchase_quotes.update'],
    'ajouter une ligne à un devis fournisseur');
  perform public.require_capability(
    array['commerce.purchase_quotes.view'], 'consulter le devis fournisseur à compléter');

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La quantité doit être un entier positif.'
      using errcode = 'check_violation';
  end if;

  -- Le prix vient de l'OFFRE, et une offre sans prix n'est pas une offre.
  if p_unit_price is null or p_unit_price <= 0 then
    raise exception
      'Le prix unitaire proposé par le fournisseur est obligatoire : un entier positif, en KMF (DEC-010).'
      using errcode = 'check_violation';
  end if;

  select * into q from public.purchase_quotes where id = p_quote_id;

  if not found then
    raise exception 'Devis fournisseur introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if q.status <> 'DRAFT' then
    raise exception
      'Opération refusée : les lignes d''un devis fournisseur enregistré sont figées.'
      using errcode = 'check_violation';
  end if;

  if p_variant_id is not null then
    /* ---------------- TYPE A — LIGNE RATTACHÉE AU CATALOGUE --------------- */
    perform public.require_capability(
      array['catalog.services.view'], 'consulter le service porté par la ligne');

    select v.service_id, v.label, s.label
      into v_service, v_vlabel, v_slabel
    from public.service_variants v
    join public.services s on s.id = v.service_id
    where v.id = p_variant_id;

    if v_service is null then
      raise exception
        'La variante de service désignée est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;

    -- La désignation est COPIÉE, et reste ajustable à la saisie : un service
    -- renommé ne réécrit pas une offre d'hier.
    v_label := coalesce(
      nullif(btrim(coalesce(p_label, '')), ''),
      v_slabel || ' — ' || v_vlabel
    );

    insert into public.purchase_quote_lines
      (purchase_quote_id, service_id, service_variant_id, label, quantity, unit_price,
       created_by, updated_by)
    values
      (q.id, v_service, p_variant_id, v_label, p_quantity, p_unit_price,
       public.current_actor(), public.current_actor())
    returning id into v_id;

  else
    /* ---------------- TYPE B — LIGNE LIBRE (A-13) ------------------------- */
    if btrim(coalesce(p_label, '')) = '' then
      raise exception 'Une ligne libre doit être désignée.'
        using errcode = 'check_violation';
    end if;

    insert into public.purchase_quote_lines
      (purchase_quote_id, label, quantity, unit_price, created_by, updated_by)
    values
      (q.id, btrim(p_label), p_quantity, p_unit_price,
       public.current_actor(), public.current_actor())
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

comment on function public.add_purchase_quote_line(uuid, integer, bigint, uuid, text) is
  'Ajoute une ligne à un devis fournisseur en brouillon. Le prix est celui de l''offre — jamais résolu du catalogue (P-5 reste ouvert).';

revoke execute on function public.add_purchase_quote_line(uuid, integer, bigint, uuid, text) from public, anon;
grant  execute on function public.add_purchase_quote_line(uuid, integer, bigint, uuid, text) to authenticated, service_role;


create or replace function public.archive_purchase_quote_line(p_line_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_quote uuid;
begin
  perform public.require_capability(
    array['commerce.purchase_quotes.update'], 'retirer une ligne d''un devis fournisseur');
  perform public.require_capability(
    array['commerce.purchase_quotes.view'], 'consulter le devis fournisseur concerné');

  select purchase_quote_id into v_quote from public.purchase_quote_lines where id = p_line_id;

  if v_quote is null then
    raise exception 'Ligne de devis fournisseur introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  -- D6 : on archive, on n'efface pas. Le déclencheur de gel refuse d'ailleurs
  -- l'opération si le devis a quitté le brouillon.
  update public.purchase_quote_lines
     set is_archived = true, updated_by = public.current_actor()
   where id = p_line_id;
end;
$$;

revoke execute on function public.archive_purchase_quote_line(uuid) from public, anon;
grant  execute on function public.archive_purchase_quote_line(uuid) to authenticated, service_role;


/*
 * LE CYCLE DU DEVIS FOURNISSEUR — quatre actes, une seule fonction.
 *
 * Elle se contente de poser le statut : c'est le DÉCLENCHEUR qui vérifie la
 * transition et la capacité, et lui seul fait autorité — y compris pour un
 * `PATCH` direct qui ne passerait par aucune fonction.
 */
create or replace function public.set_purchase_quote_status(
  p_quote_id uuid,
  p_status   public.commercial_document_status,
  p_reason   text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  q public.purchase_quotes%rowtype;
begin
  perform public.require_capability(
    array['commerce.purchase_quotes.view'], 'consulter le devis fournisseur concerné');

  if p_status = 'CONVERTED' then
    raise exception
      'Opération refusée : « converti » n''est pas un statut qui se déclare. Il résulte de la création de la commande fournisseur.'
      using errcode = 'check_violation';
  end if;

  select * into q from public.purchase_quotes where id = p_quote_id for update;

  if not found then
    raise exception 'Devis fournisseur introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if q.status = p_status then
    raise exception 'Ce devis fournisseur est déjà « % ».', p_status
      using errcode = 'check_violation';
  end if;

  update public.purchase_quotes
     set status            = p_status,
         sent_at           = case when p_status = 'SENT'      then now() else sent_at end,
         sent_by           = case when p_status = 'SENT'      then public.current_actor() else sent_by end,
         accepted_at       = case when p_status = 'ACCEPTED'  then now() else accepted_at end,
         accepted_by       = case when p_status = 'ACCEPTED'  then public.current_actor() else accepted_by end,
         refused_at        = case when p_status = 'REFUSED'   then now() else refused_at end,
         refused_by        = case when p_status = 'REFUSED'   then public.current_actor() else refused_by end,
         cancelled_at      = case when p_status = 'CANCELLED' then now() else cancelled_at end,
         cancelled_by      = case when p_status = 'CANCELLED' then public.current_actor() else cancelled_by end,
         status_reason     = nullif(btrim(coalesce(p_reason, '')), ''),
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = q.id;
end;
$$;

comment on function public.set_purchase_quote_status(uuid, public.commercial_document_status, text) is
  'Enregistrer l''offre reçue, la retenir, l''écarter ou l''annuler. Le déclencheur de transition vérifie la capacité de chaque passage.';

revoke execute on function public.set_purchase_quote_status(uuid, public.commercial_document_status, text) from public, anon;
grant  execute on function public.set_purchase_quote_status(uuid, public.commercial_document_status, text) to authenticated, service_role;


-- =============================================================================
-- 11. COUCHE 1 — LES ACTES DE LA COMMANDE FOURNISSEUR
-- =============================================================================

create or replace function public.create_purchase_order(
  p_supplier_id   uuid,
  p_order_date    date,
  p_expected_date date default null,
  p_notes         text default null,
  p_terms         text default null
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
    array['commerce.purchase_orders.create'], 'créer une commande fournisseur');
  perform public.require_capability(
    array['commerce.purchase_orders.view'], 'consulter la commande fournisseur créée');
  perform public.require_capability(
    array['parties.suppliers.view'], 'consulter le fournisseur de la commande');

  if p_supplier_id is null then
    raise exception 'Une commande fournisseur se rattache obligatoirement à un fournisseur.'
      using errcode = 'check_violation';
  end if;

  if p_order_date is null then
    raise exception 'La date de la commande est obligatoire.'
      using errcode = 'check_violation';
  end if;

  if p_expected_date is not null and p_expected_date < p_order_date then
    raise exception 'La date de réception attendue ne peut pas précéder la date de la commande.'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.suppliers s where s.id = p_supplier_id) then
    raise exception
      'Le fournisseur désigné est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  v_no := public.next_number('purchase_order');

  insert into public.purchase_orders
    (order_no, supplier_id, order_date, expected_date, notes, terms, created_by, updated_by)
  values
    (v_no, p_supplier_id, p_order_date, p_expected_date,
     nullif(btrim(coalesce(p_notes, '')), ''),
     nullif(btrim(coalesce(p_terms, '')), ''),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_purchase_order(uuid, date, date, text, text) from public, anon;
grant  execute on function public.create_purchase_order(uuid, date, date, text, text) to authenticated, service_role;


create or replace function public.update_purchase_order(
  p_order_id      uuid,
  p_order_date    date,
  p_expected_date date default null,
  p_notes         text default null,
  p_terms         text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  o public.purchase_orders%rowtype;
begin
  perform public.require_capability(
    array['commerce.purchase_orders.update'], 'modifier une commande fournisseur');
  perform public.require_capability(
    array['commerce.purchase_orders.view'], 'consulter la commande fournisseur à modifier');

  select * into o from public.purchase_orders where id = p_order_id for update;

  if not found then
    raise exception 'Commande fournisseur introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if o.status <> 'DRAFT' then
    raise exception
      'Opération refusée : seule une commande fournisseur en brouillon se modifie. Celle-ci est « % ».', o.status
      using errcode = 'check_violation';
  end if;

  if p_order_date is null then
    raise exception 'La date de la commande est obligatoire.' using errcode = 'check_violation';
  end if;

  if p_expected_date is not null and p_expected_date < p_order_date then
    raise exception 'La date de réception attendue ne peut pas précéder la date de la commande.'
      using errcode = 'check_violation';
  end if;

  update public.purchase_orders
     set order_date    = p_order_date,
         expected_date = p_expected_date,
         notes         = nullif(btrim(coalesce(p_notes, '')), ''),
         terms         = nullif(btrim(coalesce(p_terms, '')), ''),
         updated_by    = public.current_actor()
   where id = o.id;
end;
$$;

revoke execute on function public.update_purchase_order(uuid, date, date, text, text) from public, anon;
grant  execute on function public.update_purchase_order(uuid, date, date, text, text) to authenticated, service_role;


create or replace function public.add_purchase_order_line(
  p_order_id   uuid,
  p_quantity   integer,
  p_unit_price bigint,
  p_variant_id uuid default null,
  p_label      text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id      uuid;
  o         public.purchase_orders%rowtype;
  v_service uuid;
  v_vlabel  text;
  v_slabel  text;
  v_label   text;
begin
  perform public.require_capability(
    array['commerce.purchase_orders.create', 'commerce.purchase_orders.update'],
    'ajouter une ligne à une commande fournisseur');
  perform public.require_capability(
    array['commerce.purchase_orders.view'], 'consulter la commande fournisseur à compléter');

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La quantité doit être un entier positif.'
      using errcode = 'check_violation';
  end if;

  if p_unit_price is null or p_unit_price <= 0 then
    raise exception
      'Le prix unitaire convenu avec le fournisseur est obligatoire : un entier positif, en KMF (DEC-010).'
      using errcode = 'check_violation';
  end if;

  select * into o from public.purchase_orders where id = p_order_id;

  if not found then
    raise exception 'Commande fournisseur introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if o.status <> 'DRAFT' then
    raise exception
      'Opération refusée : les lignes d''une commande fournisseur passée sont figées.'
      using errcode = 'check_violation';
  end if;

  if p_variant_id is not null then
    perform public.require_capability(
      array['catalog.services.view'], 'consulter le service porté par la ligne');

    select v.service_id, v.label, s.label
      into v_service, v_vlabel, v_slabel
    from public.service_variants v
    join public.services s on s.id = v.service_id
    where v.id = p_variant_id;

    if v_service is null then
      raise exception
        'La variante de service désignée est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;

    v_label := coalesce(
      nullif(btrim(coalesce(p_label, '')), ''),
      v_slabel || ' — ' || v_vlabel
    );

    insert into public.purchase_order_lines
      (purchase_order_id, service_id, service_variant_id, label, quantity, unit_price,
       created_by, updated_by)
    values
      (o.id, v_service, p_variant_id, v_label, p_quantity, p_unit_price,
       public.current_actor(), public.current_actor())
    returning id into v_id;

  else
    if btrim(coalesce(p_label, '')) = '' then
      raise exception 'Une ligne libre doit être désignée.'
        using errcode = 'check_violation';
    end if;

    insert into public.purchase_order_lines
      (purchase_order_id, label, quantity, unit_price, created_by, updated_by)
    values
      (o.id, btrim(p_label), p_quantity, p_unit_price,
       public.current_actor(), public.current_actor())
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

comment on function public.add_purchase_order_line(uuid, integer, bigint, uuid, text) is
  'Ajoute une ligne à une commande fournisseur en brouillon. Le prix est celui convenu — jamais résolu du catalogue.';

revoke execute on function public.add_purchase_order_line(uuid, integer, bigint, uuid, text) from public, anon;
grant  execute on function public.add_purchase_order_line(uuid, integer, bigint, uuid, text) to authenticated, service_role;


create or replace function public.archive_purchase_order_line(p_line_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_order uuid;
begin
  perform public.require_capability(
    array['commerce.purchase_orders.update'], 'retirer une ligne d''une commande fournisseur');
  perform public.require_capability(
    array['commerce.purchase_orders.view'], 'consulter la commande fournisseur concernée');

  select purchase_order_id into v_order from public.purchase_order_lines where id = p_line_id;

  if v_order is null then
    raise exception 'Ligne de commande fournisseur introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  update public.purchase_order_lines
     set is_archived = true, updated_by = public.current_actor()
   where id = p_line_id;
end;
$$;

revoke execute on function public.archive_purchase_order_line(uuid) from public, anon;
grant  execute on function public.archive_purchase_order_line(uuid) to authenticated, service_role;


create or replace function public.set_purchase_order_status(
  p_order_id uuid,
  p_status   public.order_status,
  p_reason   text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  o public.purchase_orders%rowtype;
begin
  perform public.require_capability(
    array['commerce.purchase_orders.view'], 'consulter la commande fournisseur concernée');

  if p_status = 'INVOICED' then
    raise exception
      'Opération refusée : « facturée » n''est pas un statut qui se déclare. Il résulte de l''enregistrement de la facture fournisseur.'
      using errcode = 'check_violation';
  end if;

  select * into o from public.purchase_orders where id = p_order_id for update;

  if not found then
    raise exception 'Commande fournisseur introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if o.status = p_status then
    raise exception 'Cette commande fournisseur est déjà « % ».', p_status
      using errcode = 'check_violation';
  end if;

  update public.purchase_orders
     set status            = p_status,
         confirmed_at      = case when p_status = 'CONFIRMED' then now() else confirmed_at end,
         confirmed_by      = case when p_status = 'CONFIRMED' then public.current_actor() else confirmed_by end,
         delivered_at      = case when p_status = 'DELIVERED' then now() else delivered_at end,
         delivered_by      = case when p_status = 'DELIVERED' then public.current_actor() else delivered_by end,
         cancelled_at      = case when p_status = 'CANCELLED' then now() else cancelled_at end,
         cancelled_by      = case when p_status = 'CANCELLED' then public.current_actor() else cancelled_by end,
         status_reason     = nullif(btrim(coalesce(p_reason, '')), ''),
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = o.id;

  /*
   * ANNULER UNE COMMANDE REND SON DEVIS À « RETENU ».
   *
   * Sans ce retour, un devis converti par erreur resterait « converti » sans
   * commande vivante, tandis que l'index d'unicité, lui, se libérerait — et une
   * seconde commande naîtrait d'un devis que rien n'aurait rouvert. Les deux
   * doivent bouger ensemble.
   */
  if p_status = 'CANCELLED' and o.purchase_quote_id is not null then
    update public.purchase_quotes
       set status            = 'ACCEPTED',
           converted_at      = null,
           converted_by      = null,
           status_reason     = 'Commande ' || o.order_no || ' annulée',
           status_changed_at = now(),
           status_changed_by = public.current_actor(),
           updated_by        = public.current_actor()
     where id = o.purchase_quote_id
       and status = 'CONVERTED';
  end if;
end;
$$;

comment on function public.set_purchase_order_status(uuid, public.order_status, text) is
  'Passer, réceptionner ou annuler une commande fournisseur. L''annulation rend son devis d''origine à « retenu ».';

revoke execute on function public.set_purchase_order_status(uuid, public.order_status, text) from public, anon;
grant  execute on function public.set_purchase_order_status(uuid, public.order_status, text) to authenticated, service_role;


-- =============================================================================
-- 12. LA CONVERSION — UN ACTE NOUVEAU, L'ANCIEN INTACT
--
-- 🟥 LE DEVIS N'EST PAS TRANSFORMÉ. Aucun enregistrement ne change de nature :
-- une commande NAÎT, le devis passe à « converti » et reste consultable tel que
-- le fournisseur l'a remis. `DEV-F-…` reste `DEV-F-…`, et SA RÉFÉRENCE EXTERNE
-- reste celle du fournisseur.
--
-- 🟥 LES PRIX SONT RECOPIÉS, PAS RESSAISIS. Chaque ligne est reprise du devis —
-- désignation, quantité, prix, service, variante — et porte
-- `source_quote_line_id`. Le catalogue n'est à aucun moment interrogé : le prix
-- de la commande est celui de l'offre retenue, c'est lui qui engage les deux
-- parties.
--
-- CAPACITÉS EXIGÉES — la même composition qu'au LOT 25 : lire le devis, créer et
-- lire la commande, lire le fournisseur. Elle n'exige PAS
-- `commerce.purchase_quotes.validate` : le passage du devis à « converti » est
-- la CONSÉQUENCE de la commande, pas un acte séparé.
-- =============================================================================

create or replace function public.convert_purchase_quote_to_order(
  p_quote_id      uuid,
  p_order_date    date default null,
  p_expected_date date default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  q        public.purchase_quotes%rowtype;
  v_id     uuid;
  v_no     text;
  v_date   date;
  v_lignes int;
begin
  perform public.require_capability(
    array['commerce.purchase_orders.create'], 'convertir un devis fournisseur en commande');
  perform public.require_capability(
    array['commerce.purchase_orders.view'], 'consulter la commande fournisseur créée');
  perform public.require_capability(
    array['commerce.purchase_quotes.view'], 'consulter le devis fournisseur converti');
  perform public.require_capability(
    array['parties.suppliers.view'], 'consulter le fournisseur de la commande');

  select * into q from public.purchase_quotes where id = p_quote_id for update;

  if not found then
    raise exception 'Devis fournisseur introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if q.status = 'CONVERTED' then
    raise exception
      'Opération refusée : ce devis fournisseur est déjà converti. Un devis ne produit pas deux commandes.'
      using errcode = 'unique_violation';
  end if;

  if q.status <> 'ACCEPTED' then
    raise exception
      'Opération refusée : seule une offre RETENUE se convertit en commande. Celle-ci est « % ».', q.status
      using errcode = 'check_violation';
  end if;

  -- Le jour est celui d'ADIKOM, jamais celui du serveur : aux Comores (UTC+3),
  -- `current_date` change trois heures trop tard.
  v_date := coalesce(p_order_date, (now() at time zone 'Indian/Comoro')::date);

  if p_expected_date is not null and p_expected_date < v_date then
    raise exception 'La date de réception attendue ne peut pas précéder la date de la commande.'
      using errcode = 'check_violation';
  end if;

  v_no := public.next_number('purchase_order');

  insert into public.purchase_orders
    (order_no, supplier_id, purchase_quote_id, order_date, expected_date,
     currency_code, notes, terms, created_by, updated_by)
  values
    (v_no, q.supplier_id, q.id, v_date, p_expected_date,
     q.currency_code, q.notes, q.terms,
     public.current_actor(), public.current_actor())
  returning id into v_id;

  -- LES LIGNES SONT RECOPIÉES, PAS RESSAISIES.
  insert into public.purchase_order_lines
    (purchase_order_id, service_id, service_variant_id, source_quote_line_id,
     label, quantity, unit_price, created_by, updated_by)
  select
    v_id, l.service_id, l.service_variant_id, l.id,
    l.label, l.quantity, l.unit_price,
    public.current_actor(), public.current_actor()
  from public.purchase_quote_lines l
  where l.purchase_quote_id = q.id
    and l.is_archived = false;

  get diagnostics v_lignes = row_count;

  if v_lignes = 0 then
    raise exception
      'Opération refusée : ce devis fournisseur ne porte aucune ligne active, ou ses lignes ne sont pas lisibles avec vos droits. La commande serait vide.'
      using errcode = 'check_violation';
  end if;

  update public.purchase_quotes
     set status            = 'CONVERTED',
         converted_at      = now(),
         converted_by      = public.current_actor(),
         status_reason     = 'Commande ' || v_no,
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = q.id;

  return v_id;
end;
$$;

comment on function public.convert_purchase_quote_to_order(uuid, date, date) is
  'Crée une commande à partir d''un devis fournisseur retenu. Le devis est conservé et passe à « converti » ; les prix sont RECOPIÉS de l''offre.';

revoke execute on function public.convert_purchase_quote_to_order(uuid, date, date) from public, anon;
grant  execute on function public.convert_purchase_quote_to_order(uuid, date, date) to authenticated, service_role;


-- =============================================================================
-- 13. COUCHE 4 — RLS, selon le patron du Plan 02 §8.2
--
-- `has_permission(...)` est ENVELOPPÉE DANS UN SOUS-SELECT : une garde de RLS
-- s'évalue PAR LIGNE, et l'appel coûterait sinon un aller-retour par ligne de la
-- liste (migration 065).
--
-- AUCUN `DELETE` : un acte commercial s'annule, il ne s'efface pas (D6).
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 🟥 ICI, `view` EST LA BARRIÈRE DE CONFIDENTIALITÉ
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Un devis fournisseur ne porte RIEN D'AUTRE que ce que le fournisseur demande.
-- Lui retirer ses montants ne laisserait qu'un nom et une date : la question
-- « quel devis fournisseur » n'a aucun sens sans eux.
--
-- C'est pourquoi le Plan 02 §10.2 ne prévoit, pour ces deux menus, AUCUNE
-- capacité de montants — contrairement aux sessions de caisse (§10.2 LOT 27), où
-- `pos.sessions.view` répond à « qui était en caisse » sans dire « combien il y
-- avait dedans ». Là, la séparation ouvre quelque chose ; ici, elle ne
-- laisserait rien.
--
-- `commerce.purchase_quotes.view` et `commerce.purchase_orders.view` sont donc
-- marquées SENSIBLES au catalogue (§15) : ce sont, au même titre que
-- `catalog.services.cost.view` et `rental.pricing.supplier.view`, des capacités
-- qui ouvrent un coût d'achat (Plan 02 §6, DEC-044).
-- =============================================================================

revoke all on public.purchase_quotes      from anon;
revoke all on public.purchase_quote_lines from anon;
revoke all on public.purchase_orders      from anon;
revoke all on public.purchase_order_lines from anon;

revoke delete on public.purchase_quotes      from authenticated;
revoke delete on public.purchase_quote_lines from authenticated;
revoke delete on public.purchase_orders      from authenticated;
revoke delete on public.purchase_order_lines from authenticated;

-- `TRUNCATE` ne déclenche aucun déclencheur de ligne : il contournerait
-- `fn_forbid_delete` et effacerait des actes sans laisser une entrée au journal
-- (DEC-039 §g).
revoke truncate on public.purchase_quotes      from authenticated;
revoke truncate on public.purchase_quote_lines from authenticated;
revoke truncate on public.purchase_orders      from authenticated;
revoke truncate on public.purchase_order_lines from authenticated;

alter table public.purchase_quotes      enable row level security;
alter table public.purchase_quote_lines enable row level security;
alter table public.purchase_orders      enable row level security;
alter table public.purchase_order_lines enable row level security;


-- --- Devis fournisseurs -------------------------------------------------------

create policy purchase_quotes_select on public.purchase_quotes
  for select to authenticated
  using ((select public.has_permission('commerce.purchase_quotes.view')));

create policy purchase_quotes_insert on public.purchase_quotes
  for insert to authenticated
  with check ((select public.has_permission('commerce.purchase_quotes.create')));

/*
 * L'ÉCRITURE COUVRE LES CAPACITÉS QUI PEUVENT LÉGITIMEMENT MODIFIER UNE LIGNE DE
 * DEVIS FOURNISSEUR — modifier, faire avancer le cycle, annuler, et CRÉER LA
 * COMMANDE qui le convertit (ou l'annuler, ce qui le rouvre).
 *
 * La policy ouvre la porte ; c'est le DÉCLENCHEUR de transition qui dit laquelle
 * de ces capacités autorise QUEL passage, et la migration 100 a montré ce qu'une
 * porte trop large laisse passer : `terms` et `notes` sont donc gardés
 * nommément par le déclencheur, dès cette migration.
 */
create policy purchase_quotes_update on public.purchase_quotes
  for update to authenticated
  using (
    (select public.has_permission('commerce.purchase_quotes.update'))
    or (select public.has_permission('commerce.purchase_quotes.validate'))
    or (select public.has_permission('commerce.purchase_quotes.cancel'))
    or (select public.has_permission('commerce.purchase_orders.create'))
    or (select public.has_permission('commerce.purchase_orders.cancel'))
  )
  with check (
    (select public.has_permission('commerce.purchase_quotes.update'))
    or (select public.has_permission('commerce.purchase_quotes.validate'))
    or (select public.has_permission('commerce.purchase_quotes.cancel'))
    or (select public.has_permission('commerce.purchase_orders.create'))
    or (select public.has_permission('commerce.purchase_orders.cancel'))
  );


-- --- Lignes de devis fournisseur ---------------------------------------------
--
-- Elles se lisent avec le devis : elles ne montrent rien de plus que lui.

create policy purchase_quote_lines_select on public.purchase_quote_lines
  for select to authenticated
  using ((select public.has_permission('commerce.purchase_quotes.view')));

create policy purchase_quote_lines_insert on public.purchase_quote_lines
  for insert to authenticated
  with check (
    (select public.has_permission('commerce.purchase_quotes.create'))
    or (select public.has_permission('commerce.purchase_quotes.update'))
  );

create policy purchase_quote_lines_update on public.purchase_quote_lines
  for update to authenticated
  using ((select public.has_permission('commerce.purchase_quotes.update')))
  with check ((select public.has_permission('commerce.purchase_quotes.update')));


-- --- Commandes fournisseurs ---------------------------------------------------

create policy purchase_orders_select on public.purchase_orders
  for select to authenticated
  using ((select public.has_permission('commerce.purchase_orders.view')));

create policy purchase_orders_insert on public.purchase_orders
  for insert to authenticated
  with check ((select public.has_permission('commerce.purchase_orders.create')));

/*
 * `billing.supplier_invoices.create` et `.cancel` figurent ici parce que
 * l'enregistrement de la facture fait passer la commande à « Facturée », et son
 * annulation la ramène à « Passée » (migration 102). Sans elles, facturer une
 * commande échouerait au niveau de RLS.
 *
 * 🟥 CE N'EST PAS UN ÉLARGISSEMENT DÉGUISÉ. Le déclencheur de transition
 * n'autorise à ces deux capacités QUE les passages `→ INVOICED` et
 * `INVOICED → CONFIRMED` : un porteur de `billing.supplier_invoices.create` ne
 * peut ni passer, ni réceptionner, ni annuler une commande — ni en réécrire les
 * conditions ou les observations, gardées nommément.
 */
create policy purchase_orders_update on public.purchase_orders
  for update to authenticated
  using (
    (select public.has_permission('commerce.purchase_orders.update'))
    or (select public.has_permission('commerce.purchase_orders.validate'))
    or (select public.has_permission('commerce.purchase_orders.cancel'))
    or (select public.has_permission('billing.supplier_invoices.create'))
    or (select public.has_permission('billing.supplier_invoices.cancel'))
  )
  with check (
    (select public.has_permission('commerce.purchase_orders.update'))
    or (select public.has_permission('commerce.purchase_orders.validate'))
    or (select public.has_permission('commerce.purchase_orders.cancel'))
    or (select public.has_permission('billing.supplier_invoices.create'))
    or (select public.has_permission('billing.supplier_invoices.cancel'))
  );


-- --- Lignes de commande fournisseur -------------------------------------------

create policy purchase_order_lines_select on public.purchase_order_lines
  for select to authenticated
  using ((select public.has_permission('commerce.purchase_orders.view')));

create policy purchase_order_lines_insert on public.purchase_order_lines
  for insert to authenticated
  with check (
    (select public.has_permission('commerce.purchase_orders.create'))
    or (select public.has_permission('commerce.purchase_orders.update'))
  );

create policy purchase_order_lines_update on public.purchase_order_lines
  for update to authenticated
  using ((select public.has_permission('commerce.purchase_orders.update')))
  with check ((select public.has_permission('commerce.purchase_orders.update')));


-- =============================================================================
-- 14. LE JOURNAL N'OUVRE PAS CE QUE LA TABLE FERME — DEC-038
--
-- Cette fonction est REPRISE DE SA DERNIÈRE VERSION ACTIVE (migration 097), et
-- non de celle d'origine : la leçon du LOT 22. Les correspondances des LOTS 20,
-- 21, 22, 23 et 25 y figurent toutes, vérifiées au §16.
--
-- 🟥 LE COÛT D'ACHAT GARDE SA LECTURE JUSQUE DANS LE JOURNAL. Un événement de
-- devis fournisseur porte, dans son avant/après, le prix proposé par le
-- fournisseur : l'ouvrir à qui ne peut pas consulter les devis fournisseurs
-- ferait du journal la fuite que la table refuse. Les quatre tables de ce lot
-- s'ouvrent donc par la capacité de lecture de LEUR menu.
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
    -- Deux menus, deux capacités : consulter les devis n'ouvre pas les
    -- commandes, et réciproquement (A-14).
    when 'sales_quotes'                   then 'commerce.sales_quotes.view'
    when 'sales_quote_lines'              then 'commerce.sales_quotes.view'
    when 'sales_orders'                   then 'commerce.sales_orders.view'
    when 'sales_order_lines'              then 'commerce.sales_orders.view'

    -- --- Commerce fournisseur — LOT 26 ---------------------------------------
    -- 🟥 Ces événements portent des PRIX D'ACHAT dans leur avant/après. Le
    -- journal ne les ouvre donc pas plus largement que la table (DEC-038).
    when 'purchase_quotes'                then 'commerce.purchase_quotes.view'
    when 'purchase_quote_lines'           then 'commerce.purchase_quotes.view'
    when 'purchase_orders'                then 'commerce.purchase_orders.view'
    when 'purchase_order_lines'           then 'commerce.purchase_orders.view'

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
-- 15. LES SEIZE CAPACITÉS — Plan 02 §10.2, LOT 26
--
-- La liste de colonnes ouvre par `(code, module_code` : c'est la forme que le
-- contrôle de parité TS/SQL (`permissions.test.ts`) reconnaît pour rejouer le
-- catalogue sans interpréter du SQL.
--
-- MODULE `commerce`, ordre 11 — LE MÊME QU'AU LOT 25. Deux menus de plus :
-- `purchase_quotes` (3), `purchase_orders` (4), selon Plan 01 §17.2 :
-- « Menus : `purchase_quotes` (3), `purchase_orders` (4). Mêmes huit actions. »
--
-- 🟥 AUCUN SECOND MENU « ACHATS ». Le Plan 02 §7.1 place les quatre menus sous
-- Commerce : les y séparer contredirait l'architecture et obligerait un
-- utilisateur à chercher au même endroit deux fois.
--
--     view · create · update · validate · cancel · export✓ · download✓ · print✓
--
-- CE QUI DIFFÈRE DU LOT 25, ET POURQUOI :
--
-- 🟥 `view` EST MARQUÉE SENSIBLE. Un devis fournisseur N'EST qu'un prix d'achat ;
-- le consulter, c'est lire ce qu'ADIKOM paie. Le Plan 02 §6 (DEC-044) marque
-- sensibles TOUTES les capacités qui ouvrent un coût d'acquisition —
-- `catalog.services.cost.view`, `rental.pricing.supplier.view`. Celles-ci en
-- sont, et il aurait été incohérent qu'elles seules ne le soient pas.
--
-- Ce n'est PAS une capacité de plus : c'est le drapeau que porte une capacité
-- déjà prévue, et il ne change aucun droit — il dit à l'écran d'attribution ce
-- que cette attribution engage.
--
-- AUCUNE CAPACITÉ DE PLUS, et chacune est motivée :
--
--   `validate`  fait avancer le document — enregistrer l'offre reçue, la retenir
--               ou l'écarter, passer la commande, constater sa réception.
--   `cancel`    retire le document. Une offre écartée n'est pas une offre annulée.
--   `download`  et `print` sont DISTINCTES de `view` et l'une de l'autre
--               (DEC-024).
--   `export`    la liste, au format tableur. Sensible : une liste de devis
--               fournisseurs est une photographie des coûts d'ADIKOM.
--
-- AUCUNE capacité de facturation : enregistrer la facture d'une commande relève
-- de `billing.supplier_invoices.create`, qui existe depuis la migration 007. En
-- créer une seconde serait une seconde vérité sur le même acte.
-- AUCUNE capacité de remise, de marge ni de coût de catalogue — voir l'en-tête.
--
-- Catalogue : 213 → 229.
-- =============================================================================

with nouvelles (
  code, module_code, menu_code, menu_label, menu_order,
  submenu_code, submenu_label, action, label, sensitive, rang
) as (values
  ('commerce.purchase_quotes.view',     'commerce', 'purchase_quotes', 'Devis fournisseurs', 3,
   null, null, 'VIEW',     'Consulter les devis fournisseurs et leurs prix d''achat', true,  1),
  ('commerce.purchase_quotes.create',   'commerce', 'purchase_quotes', 'Devis fournisseurs', 3,
   null, null, 'CREATE',   'Enregistrer un devis fournisseur',        false, 2),
  ('commerce.purchase_quotes.update',   'commerce', 'purchase_quotes', 'Devis fournisseurs', 3,
   null, null, 'UPDATE',   'Modifier un devis fournisseur',           false, 3),
  ('commerce.purchase_quotes.validate', 'commerce', 'purchase_quotes', 'Devis fournisseurs', 3,
   null, null, 'VALIDATE', 'Enregistrer l''offre reçue, la retenir ou l''écarter', false, 4),
  ('commerce.purchase_quotes.cancel',   'commerce', 'purchase_quotes', 'Devis fournisseurs', 3,
   null, null, 'CANCEL',   'Annuler un devis fournisseur',            false, 5),
  ('commerce.purchase_quotes.export',   'commerce', 'purchase_quotes', 'Devis fournisseurs', 3,
   null, null, 'EXPORT',   'Exporter la liste des devis fournisseurs', true,  6),
  ('commerce.purchase_quotes.download', 'commerce', 'purchase_quotes', 'Devis fournisseurs', 3,
   null, null, 'DOWNLOAD', 'Télécharger le document d''un devis fournisseur', true, 7),
  ('commerce.purchase_quotes.print',    'commerce', 'purchase_quotes', 'Devis fournisseurs', 3,
   null, null, 'PRINT',    'Imprimer le document d''un devis fournisseur', true,  8),

  ('commerce.purchase_orders.view',     'commerce', 'purchase_orders', 'Commandes fournisseurs', 4,
   null, null, 'VIEW',     'Consulter les commandes fournisseurs et leurs prix d''achat', true, 1),
  ('commerce.purchase_orders.create',   'commerce', 'purchase_orders', 'Commandes fournisseurs', 4,
   null, null, 'CREATE',   'Créer une commande fournisseur, convertir un devis', false, 2),
  ('commerce.purchase_orders.update',   'commerce', 'purchase_orders', 'Commandes fournisseurs', 4,
   null, null, 'UPDATE',   'Modifier une commande fournisseur',       false, 3),
  ('commerce.purchase_orders.validate', 'commerce', 'purchase_orders', 'Commandes fournisseurs', 4,
   null, null, 'VALIDATE', 'Passer une commande, constater sa réception', false, 4),
  ('commerce.purchase_orders.cancel',   'commerce', 'purchase_orders', 'Commandes fournisseurs', 4,
   null, null, 'CANCEL',   'Annuler une commande fournisseur',        false, 5),
  ('commerce.purchase_orders.export',   'commerce', 'purchase_orders', 'Commandes fournisseurs', 4,
   null, null, 'EXPORT',   'Exporter la liste des commandes fournisseurs', true, 6),
  ('commerce.purchase_orders.download', 'commerce', 'purchase_orders', 'Commandes fournisseurs', 4,
   null, null, 'DOWNLOAD', 'Télécharger le document d''une commande fournisseur', true, 7),
  ('commerce.purchase_orders.print',    'commerce', 'purchase_orders', 'Commandes fournisseurs', 4,
   null, null, 'PRINT',    'Imprimer le document d''une commande fournisseur', true,  8)
)
insert into public.permissions (
  code, module_code, module_label, menu_code, menu_label,
  submenu_code, submenu_label, action, label, is_sensitive,
  module_order, menu_order, submenu_order, action_order
)
select
  n.code,
  n.module_code,
  'Commerce',
  n.menu_code,
  n.menu_label,
  n.submenu_code,
  n.submenu_label,
  n.action::public.permission_action,
  n.label,
  n.sensitive,
  11,
  n.menu_order,
  n.rang,
  case n.action
    when 'VIEW'     then 1
    when 'CREATE'   then 2
    when 'UPDATE'   then 3
    when 'VALIDATE' then 4
    when 'CANCEL'   then 5
    when 'EXPORT'   then 7
    when 'DOWNLOAD' then 8
    when 'PRINT'    then 9
    else 99
  end
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
-- 16. CONTRÔLES DE NON-RÉGRESSION
--
-- LE TOTAL DU CATALOGUE EST AFFIRMÉ ICI, ET NULLE PART AILLEURS (DEC-046). Une
-- migration énonce un fait DATÉ et n'a jamais à être rouverte. Les recettes
-- comparent les ENSEMBLES, code par code (`checkCatalogue`).
-- =============================================================================

do $$
declare
  v_total      int;
  v_attendu    text[] := array[
    'commerce.purchase_quotes.view', 'commerce.purchase_quotes.create',
    'commerce.purchase_quotes.update', 'commerce.purchase_quotes.validate',
    'commerce.purchase_quotes.cancel', 'commerce.purchase_quotes.export',
    'commerce.purchase_quotes.download', 'commerce.purchase_quotes.print',
    'commerce.purchase_orders.view', 'commerce.purchase_orders.create',
    'commerce.purchase_orders.update', 'commerce.purchase_orders.validate',
    'commerce.purchase_orders.cancel', 'commerce.purchase_orders.export',
    'commerce.purchase_orders.download', 'commerce.purchase_orders.print'
  ];
  v_client     text[] := array[
    'commerce.sales_quotes.view', 'commerce.sales_quotes.create',
    'commerce.sales_quotes.update', 'commerce.sales_quotes.validate',
    'commerce.sales_quotes.cancel', 'commerce.sales_quotes.export',
    'commerce.sales_quotes.download', 'commerce.sales_quotes.print',
    'commerce.sales_orders.view', 'commerce.sales_orders.create',
    'commerce.sales_orders.update', 'commerce.sales_orders.validate',
    'commerce.sales_orders.cancel', 'commerce.sales_orders.export',
    'commerce.sales_orders.download', 'commerce.sales_orders.print'
  ];
  v_manquantes text[];
  v_inconnues  text[];
  v_table      text;
  v_fn         text;
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 229 then
    raise exception 'Catalogue attendu à 229 permissions, obtenu %.', v_total;
  end if;

  select array_agg(c) into v_manquantes
  from unnest(v_attendu) c
  where not exists (select 1 from public.permissions p where p.code = c);

  if v_manquantes is not null then
    raise exception 'Capacités du LOT 26 absentes du catalogue : %', v_manquantes;
  end if;

  -- LES SEIZE DU LOT 25 SONT TOUJOURS LÀ, INTACTES : ce lot n'en retire aucune.
  select array_agg(c) into v_manquantes
  from unnest(v_client) c
  where not exists (select 1 from public.permissions p where p.code = c);

  if v_manquantes is not null then
    raise exception
      'Une capacité du commerce client a disparu : %. Le LOT 26 n''en touche aucune.', v_manquantes;
  end if;

  -- AUCUNE capacité inventée sous `commerce` : ni remise, ni marge, ni coût, ni
  -- facturation propre (CLAUDE.md §19 bis).
  select array_agg(p.code) into v_inconnues
  from public.permissions p
  where p.module_code = 'commerce'
    and not (p.code = any (v_attendu))
    and not (p.code = any (v_client));

  if v_inconnues is not null then
    raise exception
      'Capacité créée sans fonctionnalité correspondante : %', v_inconnues;
  end if;

  -- Les six capacités documentaires et d'export du lot sont sensibles…
  if exists (
    select 1 from public.permissions
    where code in ('commerce.purchase_quotes.export', 'commerce.purchase_quotes.download',
                   'commerce.purchase_quotes.print', 'commerce.purchase_orders.export',
                   'commerce.purchase_orders.download', 'commerce.purchase_orders.print')
      and is_sensitive is not true
  ) then
    raise exception
      'Une capacité documentaire ou d''export du commerce fournisseur n''est pas marquée sensible.';
  end if;

  -- … et les DEUX capacités de lecture le sont aussi : elles ouvrent un coût
  -- d'achat (Plan 02 §6, DEC-044).
  if exists (
    select 1 from public.permissions
    where code in ('commerce.purchase_quotes.view', 'commerce.purchase_orders.view')
      and is_sensitive is not true
  ) then
    raise exception
      'La lecture d''un acte d''achat n''est pas marquée sensible : elle ouvre pourtant un coût d''acquisition.';
  end if;

  -- Le module reste le MÊME, à l'ordre 11 : aucun second module « Achats ».
  if exists (
    select 1 from public.permissions
    where code like 'commerce.purchase_%' and (module_code <> 'commerce' or module_order <> 11)
  ) then
    raise exception
      'Le commerce fournisseur a été rattaché ailleurs que sous le module `commerce` (Plan 02 §7.1).';
  end if;

  -- Les quatre tables, avec RLS activée.
  foreach v_table in array array[
    'purchase_quotes', 'purchase_quote_lines', 'purchase_orders', 'purchase_order_lines'
  ] loop
    if not exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = v_table
    ) then
      raise exception 'Table % absente.', v_table;
    end if;

    if not (select relrowsecurity from pg_class where oid = ('public.' || v_table)::regclass) then
      raise exception 'RLS non activée sur %.', v_table;
    end if;

    if has_table_privilege('authenticated', 'public.' || quote_ident(v_table), 'DELETE') then
      raise exception 'DELETE encore accordé à authenticated sur %.', v_table;
    end if;

    if has_table_privilege('authenticated', 'public.' || quote_ident(v_table), 'TRUNCATE') then
      raise exception 'TRUNCATE encore accordé à authenticated sur %.', v_table;
    end if;
  end loop;

  /*
   * 🟥 AUCUNE COLONNE DE COÛT DE CATALOGUE NI DE MARGE sur une ligne d'achat.
   *
   * `unit_price` est le prix de l'OFFRE, et il est nommé ainsi. Une colonne qui
   * recopierait `service_variant_costs` ferait de l'acte d'achat une seconde
   * source du coût de référence, et trancherait P-5 par un effet de bord.
   */
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('purchase_quote_lines', 'purchase_order_lines')
      and (column_name like '%cost%' or column_name like '%margin%'
        or column_name like '%commission%')
  ) then
    raise exception
      'Une colonne de coût de catalogue ou de marge figure sur une ligne d''achat : P-5 serait tranché par un effet de bord.';
  end if;

  -- 🟥 P-5 SORT DE CE LOT COMME IL Y EST ENTRÉ : `service_variant_costs` n'a
  -- reçu aucune dimension fournisseur.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'service_variant_costs'
      and column_name = 'supplier_id'
  ) then
    raise exception
      '`service_variant_costs` a reçu un `supplier_id` : P-5 aurait été tranché sans décision (Plan 02 §15).';
  end if;

  -- `commercial_line_costs` relève du LOT 28. La créer ici serait anticiper.
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'commercial_line_costs'
  ) then
    raise exception
      '`commercial_line_costs` est créée alors que le Plan 02 §13.2 l''assigne au LOT 28.';
  end if;

  -- AUCUNE table de produit, aucun stock (Direction : Services maintenant,
  -- Produits plus tard).
  if exists (
    select 1 from pg_tables
    where schemaname = 'public'
      and tablename in ('products', 'product_variants', 'stock_movements', 'warehouses')
  ) then
    raise exception
      'Une table de produit ou de stock a été créée : la partie Produits n''existe pas (DEC-043).';
  end if;

  -- Les deux règles de numérotation, à la forme de `supplier_invoice`.
  if not exists (
    select 1 from public.numbering_rules
    where entity_key = 'purchase_quote' and prefix = 'DEV-F' and include_year and padding = 6
  ) or not exists (
    select 1 from public.numbering_rules
    where entity_key = 'purchase_order' and prefix = 'CDE-F' and include_year and padding = 6
  ) then
    raise exception
      'Une règle de numérotation du commerce fournisseur est absente ou mal formée.';
  end if;

  -- Les règles du LOT 25 sont intactes : les quatre coexistent.
  if not exists (select 1 from public.numbering_rules where entity_key = 'sales_quote')
     or not exists (select 1 from public.numbering_rules where entity_key = 'sales_order') then
    raise exception 'Une règle de numérotation du commerce client a disparu.';
  end if;

  -- La clé étrangère composite : la variante appartient bien à son service.
  if not exists (
    select 1 from pg_constraint
    where conname = 'purchase_quote_lines_variant_belongs' and contype = 'f'
  ) or not exists (
    select 1 from pg_constraint
    where conname = 'purchase_order_lines_variant_belongs' and contype = 'f'
  ) then
    raise exception
      'La garantie « la variante appartient à son service » est absente : elle ne peut pas être laissée à un déclencheur qui lirait à travers RLS.';
  end if;

  -- Un devis fournisseur ne produit pas deux commandes.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'purchase_orders_one_per_quote_idx'
  ) then
    raise exception
      'L''index d''unicité « une commande par devis fournisseur » est absent : deux clics simultanés produiraient deux commandes.';
  end if;

  /*
   * LES ACQUIS DU JOURNAL SONT TOUJOURS LÀ.
   *
   * `audit_detail_permission` est RÉÉCRITE ENTIÈRE. Une correspondance omise se
   * lirait comme un refermement silencieux sur le seul Super Admin, et ne se
   * découvrirait qu'au jour où quelqu'un consulterait le journal.
   */
  foreach v_fn in array array[
    'supplier_vehicle_rates', 'rental_amendments', 'rental_segments',
    'rental_segment_costs', 'rental_billing_periods', 'service_variant_costs',
    'service_variant_prices', 'customer_invoices', 'numbering_rules',
    'sales_quotes', 'sales_quote_lines', 'sales_orders', 'sales_order_lines',
    'supplier_invoices', 'supplier_invoice_lines'
  ] loop
    if public.audit_detail_permission(v_fn) is null then
      raise exception
        'Le journal s''est refermé sur « % » : une correspondance d''un lot antérieur a disparu.', v_fn;
    end if;
  end loop;

  if public.audit_detail_permission('rental_segment_costs') <> 'rental.pricing.supplier.view' then
    raise exception 'Le coût gelé ne garde plus SA lecture dans le journal (A-2).';
  end if;

  if public.audit_detail_permission('service_variant_costs') <> 'catalog.services.cost.view' then
    raise exception 'Le prix d''achat ne garde plus SA lecture dans le journal (DEC-043 §e).';
  end if;

  if public.audit_detail_permission('sales_quotes') <> 'commerce.sales_quotes.view'
     or public.audit_detail_permission('sales_orders') <> 'commerce.sales_orders.view' then
    raise exception 'Le commerce client n''est plus correctement rattaché au journal.';
  end if;

  if public.audit_detail_permission('purchase_quotes') <> 'commerce.purchase_quotes.view'
     or public.audit_detail_permission('purchase_quote_lines') <> 'commerce.purchase_quotes.view'
     or public.audit_detail_permission('purchase_orders') <> 'commerce.purchase_orders.view'
     or public.audit_detail_permission('purchase_order_lines') <> 'commerce.purchase_orders.view' then
    raise exception
      'Le commerce fournisseur n''est pas correctement rattaché au journal : ses prix d''achat fuiraient par l''avant/après.';
  end if;

  -- DOCTRINE D4 : aucun acte métier en SECURITY DEFINER.
  if exists (
    select 1 from pg_proc
    where oid in (
      'public.create_purchase_quote(uuid, date, date, text, text, text)'::regprocedure,
      'public.update_purchase_quote(uuid, date, date, text, text, text)'::regprocedure,
      'public.add_purchase_quote_line(uuid, integer, bigint, uuid, text)'::regprocedure,
      'public.archive_purchase_quote_line(uuid)'::regprocedure,
      'public.set_purchase_quote_status(uuid, public.commercial_document_status, text)'::regprocedure,
      'public.create_purchase_order(uuid, date, date, text, text)'::regprocedure,
      'public.update_purchase_order(uuid, date, date, text, text)'::regprocedure,
      'public.add_purchase_order_line(uuid, integer, bigint, uuid, text)'::regprocedure,
      'public.archive_purchase_order_line(uuid)'::regprocedure,
      'public.set_purchase_order_status(uuid, public.order_status, text)'::regprocedure,
      'public.convert_purchase_quote_to_order(uuid, date, date)'::regprocedure,
      'public.purchase_quote_total(uuid)'::regprocedure,
      'public.purchase_order_total(uuid)'::regprocedure,
      'public.fn_purchase_quote_transition()'::regprocedure,
      'public.fn_purchase_order_transition()'::regprocedure,
      'public.fn_purchase_quote_line_guard()'::regprocedure,
      'public.fn_purchase_order_line_guard()'::regprocedure
    )
    and prosecdef
  ) then
    raise exception 'Une fonction du commerce fournisseur est SECURITY DEFINER (doctrine D4).';
  end if;

  -- AUCUNE fonction de marge : « on n'a pas de marge sur un achat » (Plan 01 §15.3).
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'purchase%margin%'
  ) then
    raise exception 'Une fonction de marge d''achat a été créée : un achat n''a pas de marge.';
  end if;

  raise notice
    '[OK] 101. Commerce fournisseur : 4 tables, RLS active, 16 capacités, catalogue à 229. Prix de l''offre figé, P-5 intact.';
end $$;
