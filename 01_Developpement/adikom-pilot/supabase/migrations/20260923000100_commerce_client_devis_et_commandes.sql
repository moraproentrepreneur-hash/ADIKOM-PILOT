-- =============================================================================
-- ADIKOM PILOT — 097 · Commerce client : devis et commandes
-- LOT 25 — DEC-049 · Plan 02 §7.1, §9.1, §9.5, §10.2 · Plan 01 §15.1, §15.2
--
-- CE QUE CETTE MIGRATION POSE
--
-- La couche COMMERCIALE, entre le catalogue de services (LOT 20) et la
-- facturation client (LOT 7). Elle n'en remplace aucune :
--
--     SERVICE DU CATALOGUE → DEVIS → COMMANDE → FACTURE CLIENT EXISTANTE
--                                                 → RÈGLEMENT EXISTANT
--                                                 → TRÉSORERIE EXISTANTE
--
-- L'articulation avec `customer_invoices` relève de la migration SUIVANTE : ici,
-- aucune table de facturation n'est touchée. Deux migrations plutôt qu'une parce
-- qu'elles répondent à deux questions distinctes — « qu'est-ce qu'un devis ? »
-- et « comment une commande alimente-t-elle la facturation déjà en place ? » —
-- et qu'une reprise de l'une ne doit pas entraîner l'autre.
--
-- DEUX ENTITÉS, DEUX JEUX DE STATUTS — DEC-006, reconduite
--
-- Un devis n'est pas une commande à un statut près. Il se REFUSE, il a une durée
-- de validité ; une commande ne se refuse pas, elle a une date de livraison
-- attendue. Les fondre obligerait à porter des colonnes vides la moitié du temps.
-- La conversion CRÉE un acte nouveau et laisse l'ancien intact :
--
--     DEV-C-2026-000001  ──accepté──▶ converti        (il reste DEV-C, lisible)
--                                        │
--                                        ▼
--                                   CDE-C-2026-000001  (acte nouveau, lié)
--
-- LE PRIX EST FIGÉ SUR LA LIGNE — D13, D16(b)
--
-- Une ligne de catalogue RÉSOUT le prix de vente à la date du document, puis en
-- garde la COPIE. Le libellé aussi. Un service renommé, un prix modifié le mois
-- suivant : le devis d'hier dit toujours ce qu'il disait hier. C'est la même
-- mécanique que `rentals.locked_amount` et que `rental_segments`.
--
-- AUCUN COÛT, AUCUNE MARGE — Plan 02 §9.3 et §13.2
--
-- Le Plan 01 §15.1 plaçait `unit_cost` sur la ligne. Le Plan 02 §9.3 le lui
-- retire : « si le prix d'achat sort de la variante pour des raisons de
-- confidentialité, le coût copié doit sortir de la ligne pour la même raison —
-- sinon la confidentialité est contournable par la facture. » Il le renvoie à une
-- table `commercial_line_costs`, que le §13.2 assigne au LOT 28.
--
-- CE LOT NE LA CRÉE DONC PAS, et ses lignes ne portent AUCUN coût. Conséquence
-- assumée : `sales_quote_margin()` du Plan 01 n'existe pas. Une marge sans coût
-- serait un mensonge ; une table de coûts anticipée serait une surconstruction.
--
-- AUCUNE REMISE
--
-- Le Plan 01 §15.1 esquissait `discount_amount` par ligne. Le Plan 02 ne le
-- reprend pas, et sa liste de capacités du LOT 25 (§10.2) ne porte AUCUNE
-- capacité de remise — alors qu'il en crée une, nommément, pour le PDV
-- (`pos.sales.discount`, §10.2 LOT 28 : « consentir un rabais engage ADIKOM »).
-- Bâtir un moteur de remises que rien ne garderait contredirait A-14 / DEC-024.
-- Une ligne libre à prix choisi (A-13) n'est pas une remise : c'est une
-- prestation hors catalogue, et le document ne prétend pas le contraire.
--
-- AUCUN TOTAL STOCKÉ — D1
--
-- `sales_quote_total()` et `sales_order_total()` somment à la lecture. Aucune
-- colonne ne recopie un montant qu'une ligne archivée rendrait faux.
--
-- CINQ COUCHES, COMME AUX LOTS 7 ET 22
--
--   1. FONCTION       chaque acte vérifie SA capacité par `require_capability`.
--   2. DONNÉE         un devis envoyé fige son en-tête et ses lignes.
--   3. TRANSITION     chaque changement de statut exige sa capacité — ce qui
--                     couvre le `PATCH` direct, hors de toute fonction.
--   4. RLS            lecture, création, modification, cycle, annulation.
--   5. ÉTAT DE DÉPART un devis naît en brouillon, y compris par `INSERT` direct.
--
-- Aucune fonction métier n'est `SECURITY DEFINER` (doctrine D4).
-- =============================================================================


-- =============================================================================
-- 1. LES DEUX ÉNUMÉRATIONS — Plan 02 §9.5
--
-- Elles sont CRÉÉES ici, non étendues : l'avertissement du Plan 02 sur
-- `alter type … add value` (interdit d'employer la valeur dans la même
-- transaction) ne concerne donc pas cette migration.
--
-- 🟥 AUCUN STATUT `EXPIRED`. Décision B-7 du Plan 01 : « Un devis expiré
-- change-t-il de statut tout seul ? Non — aucun ordonnanceur. DÉRIVÉ de
-- `valid_until`, comme `OVERDUE` (D2). » Un statut écrit supposerait une tâche
-- planifiée que le projet n'a pas, et mentirait entre deux passages.
-- =============================================================================

do $$ begin
  create type public.commercial_document_status as enum (
    'DRAFT',      -- Brouillon  — librement modifiable
    'SENT',       -- Émis       — remis au client, en-tête et lignes figés
    'ACCEPTED',   -- Accepté    — réponse du client, favorable
    'REFUSED',    -- Refusé     — réponse du client, défavorable
    'CONVERTED',  -- Converti   — une commande en est née ; jamais écrit à la main
    'CANCELLED'   -- Annulé     — retiré par ADIKOM ; historisé, jamais supprimé
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum (
    'DRAFT',      -- Brouillon
    'CONFIRMED',  -- Confirmée  — engagement pris, lignes figées
    'DELIVERED',  -- Livrée     — prestation constatée (B-6 : un statut, pas un document)
    'INVOICED',   -- Facturée   — écrit par la facturation, jamais à la main
    'CANCELLED'   -- Annulée
  );
exception when duplicate_object then null; end $$;


-- =============================================================================
-- 2. NUMÉROTATION — aucun second numéroteur
--
-- Plan 01 §15.5 : « Aucun second numéroteur. Deux règles ajoutées à
-- `numbering_rules` : `sales_quote` (DEV-C), `sales_order` (CDE-C). Format
-- PROVISOIRE, comme `FAC-C`. »
--
-- DEC-023 §3 réserve la convention définitive (séries `BIS-DVCL-A0001`) à une
-- extension de `next_number` explicitement reportée, et son §5 exige que chaque
-- code de type soit confirmé avant première émission. On reprend donc EXACTEMENT
-- la forme de `customer_invoice` — préfixe, année, six chiffres, remise à zéro
-- annuelle — et rien n'est figé qui ne le soit déjà.
--
-- `next_number` verrouille sa règle par `for update` : deux saisies simultanées
-- ne produisent pas le même numéro.
-- =============================================================================

insert into public.numbering_rules
  (entity_key, label, prefix, include_year, padding, separator, reset_yearly, current_value)
values
  ('sales_quote', 'Devis client',    'DEV-C', true, 6, '-', true, 0),
  ('sales_order', 'Commande client', 'CDE-C', true, 6, '-', true, 0)
on conflict (entity_key) do nothing;


-- =============================================================================
-- 3. UNE VARIANTE APPARTIENT À SON SERVICE — et la base le garantit
--
-- Une ligne de catalogue nomme un service ET sa variante. Rien n'empêcherait,
-- par appel direct, d'associer la variante d'un service à un autre.
--
-- 🟥 UN DÉCLENCHEUR NE SUFFIRAIT PAS ICI. Il lirait `service_variants` À TRAVERS
-- RLS : sans `catalog.services.view`, il ne verrait AUCUNE ligne et conclurait
-- « introuvable » — ou, pire, laisserait passer s'il était écrit à l'envers.
-- « Une garde qui compte doit compter la vérité » (Plan 02 §8.3 n° 5).
--
-- Une clé étrangère COMPOSITE, elle, s'évalue sous le propriétaire de la table :
-- elle ne dépend d'aucune capacité, ne coûte rien par ligne, et ne peut pas être
-- écrite à l'envers. L'index unique qui la porte est purement additif.
-- =============================================================================

create unique index if not exists service_variants_id_service_idx
  on public.service_variants (id, service_id);


-- =============================================================================
-- 4. LES DEVIS CLIENTS
-- =============================================================================

create table public.sales_quotes (
  id uuid primary key default gen_random_uuid(),

  -- DEV-C-2026-000001, règle `sales_quote` posée au §2.
  quote_no text not null unique,

  -- Le client du module Tiers, JAMAIS recopié : aucune table « customer »
  -- parallèle. `restrict` : un client cité par un acte commercial ne
  -- disparaît pas.
  client_id uuid not null references public.clients (id) on delete restrict,

  quote_date date not null,

  /*
   * DURÉE DE VALIDITÉ — facultative, jamais inventée.
   *
   * Plan 01 §15.1 : `valid_until date` — une DATE, pas une durée. Aucune
   * politique commerciale « 30 jours » n'est écrite nulle part chez ADIKOM, et
   * en déduire une serait précisément ce que CLAUDE.md §55 interdit. Le champ
   * reste donc libre, et vide tant que personne ne le renseigne.
   *
   * L'EXPIRATION EST DÉRIVÉE (B-7) : elle se lit de cette date et du jour
   * comorien, elle ne s'écrit pas dans `status`.
   */
  valid_until date,

  currency_code text not null default 'KMF',

  status public.commercial_document_status not null default 'DRAFT',

  notes text,
  terms text,

  -- Chaque acte du cycle laisse sa trace : qui, quand.
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

  constraint sales_quotes_validity check (valid_until is null or valid_until >= quote_date)
);

comment on table public.sales_quotes is
  'Devis client — acte commercial antérieur à la commande. Le prix de ses lignes est figé à sa date ; une conversion ne le réécrit pas.';

create index sales_quotes_client_idx on public.sales_quotes (client_id, quote_date desc);
create index sales_quotes_status_idx on public.sales_quotes (status, quote_date desc);

create trigger sales_quotes_set_updated_at
  before update on public.sales_quotes
  for each row execute function public.fn_set_updated_at();

create trigger sales_quotes_audit
  after insert or update on public.sales_quotes
  for each row execute function public.fn_audit_row('commerce');

create trigger sales_quotes_no_delete
  before delete on public.sales_quotes
  for each row execute function public.fn_forbid_delete();


-- --- Lignes de devis ----------------------------------------------------------
--
-- 🟩 A-13 — LES LIGNES LIBRES SONT AUTORISÉES.
--
--   TYPE A · ligne catalogue : service + variante + prix résolu à la date.
--   TYPE B · ligne libre     : désignation saisie, prix saisi, AUCUN service.
--
-- `service_id` et `service_variant_id` sont donc NULLABLES — et vont ensemble
-- ou pas du tout. Aucun service « Divers » fictif n'est créé pour contourner le
-- modèle.
--
-- EXTENSIBLE AUX PRODUITS, SANS LES PRÉTENDRE.
--
-- Une ligne commerciale porte une désignation, une quantité et un prix unitaire ;
-- son rattachement au catalogue est un couple de colonnes nullables. Le jour où
-- les produits existeront, ils s'y rattacheront par le même mécanisme. AUCUNE
-- table de produit, AUCUN stock, AUCUN entrepôt, AUCUN SKU fictif n'est créé ici.

create table public.sales_quote_lines (
  id uuid primary key default gen_random_uuid(),

  -- `cascade` : les lignes suivent leur devis. La suppression du devis est de
  -- toute façon refusée à toute session applicative (`fn_forbid_delete`) ; la
  -- cascade sert la réinitialisation et le nettoyage des recettes.
  sales_quote_id uuid not null
    references public.sales_quotes (id) on delete cascade,

  service_id         uuid references public.services (id) on delete restrict,
  service_variant_id uuid references public.service_variants (id) on delete restrict,

  -- COPIÉ du catalogue au moment de l'ajout, puis autonome. Un service renommé
  -- ne réécrit pas les devis passés.
  label text not null check (length(btrim(label)) > 0),

  -- B-14 : la quantité reste ENTIÈRE, comme sur les lignes de facture. Un
  -- décimal appellerait une règle d'arrondi monétaire que personne n'a arrêtée.
  quantity integer not null check (quantity > 0),

  -- DEC-010 : entier, en KMF. Jamais un flottant.
  unit_price bigint not null check (unit_price > 0),

  -- D6 : une ligne saisie par erreur s'archive, elle ne s'efface pas.
  is_archived boolean not null default false,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  -- Les deux colonnes de catalogue vont ensemble : une variante sans service
  -- n'identifierait rien, un service sans variante ne désignerait aucun prix.
  constraint sales_quote_lines_catalog_pair check (
    (service_id is null and service_variant_id is null)
    or (service_id is not null and service_variant_id is not null)
  ),

  -- §3 : la variante appartient bien à ce service. Garantie par la base.
  constraint sales_quote_lines_variant_belongs
    foreign key (service_variant_id, service_id)
    references public.service_variants (id, service_id) on delete restrict
);

comment on table public.sales_quote_lines is
  'Lignes d''un devis client. Prix et désignation FIGÉS à l''ajout. `service_id` nul = ligne libre (A-13). Aucun coût, aucune marge (Plan 02 §9.3).';

create index sales_quote_lines_quote_idx
  on public.sales_quote_lines (sales_quote_id, created_at);

create trigger sales_quote_lines_set_updated_at
  before update on public.sales_quote_lines
  for each row execute function public.fn_set_updated_at();

create trigger sales_quote_lines_audit
  after insert or update on public.sales_quote_lines
  for each row execute function public.fn_audit_row('commerce');

create trigger sales_quote_lines_no_delete
  before delete on public.sales_quote_lines
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- 5. LES COMMANDES CLIENTS
-- =============================================================================

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),

  order_no text not null unique,               -- CDE-C-2026-000001

  client_id uuid not null references public.clients (id) on delete restrict,

  /*
   * L'ORIGINE — FACULTATIVE (Plan 01 §15.2 : « origine facultative »).
   *
   * CAS A : née d'un devis accepté. Le lien est explicite et permanent.
   * CAS B : créée directement. Le Plan l'autorise en rendant la colonne
   *         nullable ; et une vente de comptoir (LOT 28) n'aura pas davantage
   *         à détourner cette table pour exister.
   */
  sales_quote_id uuid references public.sales_quotes (id) on delete restrict,

  order_date    date not null,
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

  constraint sales_orders_expected check (expected_date is null or expected_date >= order_date)
);

comment on table public.sales_orders is
  'Commande client. Peut naître d''un devis accepté ou directement. Alimente la facturation client EXISTANTE ; aucune facture parallèle.';

create index sales_orders_client_idx on public.sales_orders (client_id, order_date desc);
create index sales_orders_status_idx on public.sales_orders (status, order_date desc);

/*
 * 🟥 UN DEVIS NE PRODUIT PAS DEUX COMMANDES — Plan 01 §23, critère du LOT 25.
 *
 * L'index partiel fait autorité, y compris pour deux clics simultanés et pour
 * un `POST` direct. Une commande ANNULÉE libère la place : le devis, ramené à
 * « accepté » par `cancel_sales_order`, peut être converti de nouveau. Sans
 * cette échappée, une commande annulée par erreur enfermerait le devis pour
 * toujours — le même raisonnement qu'à l'annulation d'une facture (LOT 7).
 */
create unique index sales_orders_one_per_quote_idx
  on public.sales_orders (sales_quote_id)
  where sales_quote_id is not null and status <> 'CANCELLED';

create trigger sales_orders_set_updated_at
  before update on public.sales_orders
  for each row execute function public.fn_set_updated_at();

create trigger sales_orders_audit
  after insert or update on public.sales_orders
  for each row execute function public.fn_audit_row('commerce');

create trigger sales_orders_no_delete
  before delete on public.sales_orders
  for each row execute function public.fn_forbid_delete();


-- --- Lignes de commande -------------------------------------------------------
--
-- Même forme que la ligne de devis, plus `source_quote_line_id` : la traçabilité
-- ligne à ligne de la conversion. Le prix N'EST PAS relu du catalogue à la
-- conversion — il est REPRIS de la ligne de devis.

create table public.sales_order_lines (
  id uuid primary key default gen_random_uuid(),

  sales_order_id uuid not null
    references public.sales_orders (id) on delete cascade,

  service_id         uuid references public.services (id) on delete restrict,
  service_variant_id uuid references public.service_variants (id) on delete restrict,

  -- La ligne de devis dont celle-ci est née. `set null` : la commande reste
  -- exacte même si l'historique du devis venait à disparaître d'une
  -- réinitialisation ; son montant, lui, est déjà chez elle.
  source_quote_line_id uuid
    references public.sales_quote_lines (id) on delete set null,

  label      text    not null check (length(btrim(label)) > 0),
  quantity   integer not null check (quantity > 0),
  unit_price bigint  not null check (unit_price > 0),

  is_archived boolean not null default false,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  constraint sales_order_lines_catalog_pair check (
    (service_id is null and service_variant_id is null)
    or (service_id is not null and service_variant_id is not null)
  ),

  constraint sales_order_lines_variant_belongs
    foreign key (service_variant_id, service_id)
    references public.service_variants (id, service_id) on delete restrict
);

comment on table public.sales_order_lines is
  'Lignes d''une commande client. Reprises du devis ou saisies. Prix figé ; aucun coût, aucune marge.';

create index sales_order_lines_order_idx
  on public.sales_order_lines (sales_order_id, created_at);

create index sales_order_lines_source_idx
  on public.sales_order_lines (source_quote_line_id)
  where source_quote_line_id is not null;

create trigger sales_order_lines_set_updated_at
  before update on public.sales_order_lines
  for each row execute function public.fn_set_updated_at();

create trigger sales_order_lines_audit
  after insert or update on public.sales_order_lines
  for each row execute function public.fn_audit_row('commerce');

create trigger sales_order_lines_no_delete
  before delete on public.sales_order_lines
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- 6. LES TOTAUX — CALCULÉS, JAMAIS STOCKÉS (D1)
--
-- Une seule fonction par document. Le Plan 01 §15.1 en prévoyait quatre
-- (`subtotal`, `discount`, `total`, `margin`) : sans remise et sans coût dans ce
-- lot, trois d'entre elles rendraient soit le même nombre sous un autre nom,
-- soit `NULL` à perpétuité. Une fonction qui ne distingue rien ne s'écrit pas.
--
-- `security invoker` : la somme ne voit que les lignes que RLS laisse voir. Sans
-- `commerce.sales_quotes.view`, elle rend 0 — et l'écran DIT qu'il ne sait pas
-- plutôt que d'afficher ce zéro (DEC-017). La couche applicative ne l'appelle
-- d'ailleurs jamais sans avoir vérifié la capacité.
-- =============================================================================

create or replace function public.sales_quote_total(p_quote_id uuid)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(l.quantity::bigint * l.unit_price), 0)::bigint
  from public.sales_quote_lines l
  where l.sales_quote_id = p_quote_id
    and l.is_archived = false;
$$;

comment on function public.sales_quote_total(uuid) is
  'Total d''un devis : Σ quantité × prix unitaire des lignes actives. Aucun montant n''est stocké (D1).';

revoke execute on function public.sales_quote_total(uuid) from public, anon;
grant  execute on function public.sales_quote_total(uuid) to authenticated, service_role;


create or replace function public.sales_order_total(p_order_id uuid)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(l.quantity::bigint * l.unit_price), 0)::bigint
  from public.sales_order_lines l
  where l.sales_order_id = p_order_id
    and l.is_archived = false;
$$;

comment on function public.sales_order_total(uuid) is
  'Total d''une commande : Σ quantité × prix unitaire des lignes actives. Aucun montant n''est stocké (D1).';

revoke execute on function public.sales_order_total(uuid) from public, anon;
grant  execute on function public.sales_order_total(uuid) to authenticated, service_role;


-- =============================================================================
-- 7. COUCHE 5 — UN ACTE COMMERCIAL NAÎT EN BROUILLON
--
-- Y compris par `INSERT` direct, que le déclencheur de transition ne verrait
-- pas : il ne se déclenche qu'à l'`UPDATE`.
-- =============================================================================

create or replace function public.fn_commercial_document_starts_draft()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_restoring() then return new; end if;

  if (to_jsonb(new) ->> 'status') <> 'DRAFT' then
    raise exception
      'Opération refusée : un acte commercial est préparé en brouillon. Son émission, sa confirmation et sa facturation sont des actes distincts, soumis chacun à sa capacité.'
      using errcode = 'check_violation';
  end if;

  -- Aucun acte du cycle n'a encore eu lieu : ces horodatages sont ceux
  -- d'actes que personne n'a posés.
  if (to_jsonb(new) ->> 'cancelled_at') is not null
     or (to_jsonb(new) ->> 'sent_at') is not null
     or (to_jsonb(new) ->> 'confirmed_at') is not null then
    raise exception
      'Opération refusée : un acte commercial ne naît ni émis, ni confirmé, ni annulé.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_commercial_document_starts_draft() is
  'Couche 5 : un devis ou une commande naît en brouillon, y compris par INSERT direct.';

revoke execute on function public.fn_commercial_document_starts_draft() from public, anon;

create trigger sales_quotes_starts_draft
  before insert on public.sales_quotes
  for each row execute function public.fn_commercial_document_starts_draft();

create trigger sales_orders_starts_draft
  before insert on public.sales_orders
  for each row execute function public.fn_commercial_document_starts_draft();


-- =============================================================================
-- 8. COUCHE 3 — LES TRANSITIONS DU DEVIS
--
--        ┌──────────┐  envoyer   ┌────────┐  accepter  ┌───────────┐ convertir
--        │ BROUILLON├───────────▶│  ÉMIS  ├───────────▶│  ACCEPTÉ  ├──────────▶ CONVERTI
--        └────┬─────┘            └───┬────┘            └─────┬─────┘
--             │                      │ refuser               │
--             │                      ▼                       │
--             │                  ┌────────┐                  │
--             │                  │ REFUSÉ │                  │
--             │                  └────────┘                  │
--             └──────────────────────┴──────────────────────┴────────────▶ ANNULÉ
--
-- QUELLE CAPACITÉ POUR QUEL ACTE — le Plan 02 §10.2 en donne huit, et huit
-- seulement : `view` `create` `update` `validate` `cancel` `export` `download`
-- `print`. Les actes du cycle se répartissent donc entre `validate` et `cancel`.
--
--   `validate` — FAIRE AVANCER LE DEVIS : l'envoyer, puis enregistrer la
--                réponse du client, qu'elle soit favorable ou non. Accepter et
--                refuser sont le MÊME geste, par la même personne, sur le même
--                écran : la réponse du client, consignée. Les séparer créerait
--                une capacité que le Plan n'a pas prévue.
--   `cancel`   — RETIRER LE DEVIS. C'est un acte d'ADIKOM, pas une réponse du
--                client. Un devis refusé n'est pas un devis annulé.
--
-- `CONVERTED` n'est atteint que par `convert_sales_quote_to_order`, qui exige
-- `commerce.sales_orders.create` : c'est la création de la commande qui est
-- l'acte, et la conversion du devis en est la CONSÉQUENCE — exactement comme
-- l'émission d'une facture fait passer la location à « Facturée » (LOT 7).
-- =============================================================================

create or replace function public.fn_sales_quote_transition()
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
      -- Un devis accepté mais non converti peut encore être retiré : l'affaire
      -- peut tomber avant que la commande n'existe.
      when 'ACCEPTED'  then array['CONVERTED','CANCELLED']::public.commercial_document_status[]
      -- Converti : la commande existe. Le devis est un acte du passé.
      -- Son retour à « accepté » n'est possible que par l'annulation de cette
      -- commande, seul chemin qui libère aussi l'index d'unicité.
      when 'CONVERTED' then array['ACCEPTED']::public.commercial_document_status[]
      else array[]::public.commercial_document_status[]
    end;

    if not (new.status = any (v_allowed)) then
      raise exception
        'Transition de devis refusée : « % » ne peut pas devenir « % ».', old.status, new.status
        using errcode = 'check_violation';
    end if;

    case new.status
      when 'SENT' then
        perform public.require_capability(
          array['commerce.sales_quotes.validate'], 'émettre un devis client');

        -- Un devis sans ligne facturable n'est pas un devis : on ne remet pas
        -- au client un document dont le total serait nul.
        if public.sales_quote_total(new.id) <= 0 then
          raise exception
            'Opération refusée : ce devis ne porte aucune ligne. Un total est nécessaire à son émission.'
            using errcode = 'check_violation';
        end if;

      when 'ACCEPTED' then
        if old.status = 'CONVERTED' then
          -- Retour d'une conversion annulée : c'est l'annulation de la commande
          -- qui l'autorise, et elle seule.
          perform public.require_capability(
            array['commerce.sales_orders.cancel'],
            'ramener un devis à « accepté » après annulation de sa commande');
        else
          perform public.require_capability(
            array['commerce.sales_quotes.validate'],
            'enregistrer l''acceptation d''un devis');
        end if;

      when 'REFUSED' then
        perform public.require_capability(
          array['commerce.sales_quotes.validate'], 'enregistrer le refus d''un devis');

      when 'CONVERTED' then
        perform public.require_capability(
          array['commerce.sales_orders.create'], 'convertir un devis en commande');

      when 'CANCELLED' then
        perform public.require_capability(
          array['commerce.sales_quotes.cancel'], 'annuler un devis client');

      else
        null;
    end case;
  end if;

  /*
   * COUCHE 2 — LE VERROU.
   *
   * Un devis qui a quitté le brouillon fige ce qui l'engage : son client, sa
   * date, sa validité, son numéro et sa devise. Les LIGNES le sont par leur
   * propre déclencheur.
   */
  if old.status <> 'DRAFT'
     and (new.client_id     is distinct from old.client_id
       or new.quote_date    is distinct from old.quote_date
       or new.valid_until   is distinct from old.valid_until
       or new.quote_no      is distinct from old.quote_no
       or new.currency_code is distinct from old.currency_code)
     and not public.is_restoring() then
    raise exception
      'Opération refusée : un devis émis ne se réécrit plus. Son client, sa date et sa validité sont ceux qui ont été remis au client.'
      using errcode = 'check_violation';
  end if;

  -- Modifier un devis encore en brouillon relève de `update`.
  if old.status = 'DRAFT'
     and (new.client_id   is distinct from old.client_id
       or new.quote_date  is distinct from old.quote_date
       or new.valid_until is distinct from old.valid_until
       or new.notes       is distinct from old.notes
       or new.terms       is distinct from old.terms) then
    perform public.require_capability(
      array['commerce.sales_quotes.update'], 'modifier un devis client');
  end if;

  return new;
end;
$$;

comment on function public.fn_sales_quote_transition() is
  'Couches 2 et 3 du devis : transitions autorisées, capacité de chacune, et gel de l''en-tête hors brouillon.';

revoke execute on function public.fn_sales_quote_transition() from public, anon;

create trigger sales_quotes_transition
  before update on public.sales_quotes
  for each row execute function public.fn_sales_quote_transition();


-- =============================================================================
-- 9. COUCHE 3 — LES TRANSITIONS DE LA COMMANDE
--
--   BROUILLON ──confirmer──▶ CONFIRMÉE ──livrer──▶ LIVRÉE
--                                │                    │
--                                └────facturer────────┴──▶ FACTURÉE
--                                                            │
--   (annulation de la facture)  ◀────────────────────────────┘
--
--   BROUILLON · CONFIRMÉE · LIVRÉE ────annuler────▶ ANNULÉE
--
-- 🟥 LA LIVRAISON N'EST PAS UN PASSAGE OBLIGÉ. Plan 01 §15.5 facture depuis
-- « Commande client CONFIRMED ». B-6 refuse d'ailleurs tout document de
-- livraison : `DELIVERED` est un CONSTAT, pas une étape imposée.
--
-- `INVOICED` n'est écrit que par `create_invoice_from_sales_order`
-- (migration 098), et le retour à `CONFIRMED` que par l'annulation de la
-- facture — même mécanique qu'au retour d'une location à « À facturer ».
-- =============================================================================

create or replace function public.fn_sales_order_transition()
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
      -- Le retour à « Confirmée » n'est pas une marche arrière de complaisance :
      -- c'est le seul état cohérent d'une commande dont la facture a été annulée.
      when 'INVOICED'  then array['CONFIRMED']::public.order_status[]
      else array[]::public.order_status[]
    end;

    if not (new.status = any (v_allowed)) then
      raise exception
        'Transition de commande refusée : « % » ne peut pas devenir « % ».', old.status, new.status
        using errcode = 'check_violation';
    end if;

    case new.status
      when 'CONFIRMED' then
        if old.status = 'INVOICED' then
          perform public.require_capability(
            array['billing.customer_invoices.cancel'],
            'ramener une commande à « confirmée » après annulation de sa facture');
        else
          perform public.require_capability(
            array['commerce.sales_orders.validate'], 'confirmer une commande client');

          if public.sales_order_total(new.id) <= 0 then
            raise exception
              'Opération refusée : cette commande ne porte aucune ligne. Un total est nécessaire à sa confirmation.'
              using errcode = 'check_violation';
          end if;
        end if;

      when 'DELIVERED' then
        perform public.require_capability(
          array['commerce.sales_orders.validate'], 'constater la livraison d''une commande');

      when 'INVOICED' then
        perform public.require_capability(
          array['billing.customer_invoices.create'], 'facturer une commande client');

      when 'CANCELLED' then
        perform public.require_capability(
          array['commerce.sales_orders.cancel'], 'annuler une commande client');

      else
        null;
    end case;
  end if;

  -- COUCHE 2 — une commande qui a quitté le brouillon fige ce qui l'engage.
  if old.status <> 'DRAFT'
     and (new.client_id      is distinct from old.client_id
       or new.sales_quote_id is distinct from old.sales_quote_id
       or new.order_date     is distinct from old.order_date
       or new.order_no       is distinct from old.order_no
       or new.currency_code  is distinct from old.currency_code)
     and not public.is_restoring() then
    raise exception
      'Opération refusée : une commande confirmée ne se réécrit plus. Son client, son origine et sa date sont ceux de l''engagement pris.'
      using errcode = 'check_violation';
  end if;

  if old.status = 'DRAFT'
     and (new.client_id     is distinct from old.client_id
       or new.order_date    is distinct from old.order_date
       or new.expected_date is distinct from old.expected_date
       or new.notes         is distinct from old.notes
       or new.terms         is distinct from old.terms) then
    perform public.require_capability(
      array['commerce.sales_orders.update'], 'modifier une commande client');
  end if;

  return new;
end;
$$;

comment on function public.fn_sales_order_transition() is
  'Couches 2 et 3 de la commande : transitions autorisées, capacité de chacune, et gel de l''en-tête hors brouillon.';

revoke execute on function public.fn_sales_order_transition() from public, anon;

create trigger sales_orders_transition
  before update on public.sales_orders
  for each row execute function public.fn_sales_order_transition();


-- =============================================================================
-- 10. COUCHE 2 — LES LIGNES SE FIGENT DÈS QUE LE DOCUMENT QUITTE LE BROUILLON
--
-- « Un devis envoyé au client ne se réécrit pas dans son dos » (Plan 01 §15.1).
-- Même règle que `customer_invoice_lines`, et pour la même raison : le prix
-- historique d'un acte engagé ne se modifie pas en silence.
--
-- 🟥 L'ARCHIVAGE EST INCLUS DANS LE GEL. Retirer une ligne d'un devis émis
-- changerait son total aussi sûrement qu'en modifier le prix.
-- =============================================================================

create or replace function public.fn_sales_quote_line_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status public.commercial_document_status;
  v_seen   boolean := false;
begin
  select true, q.status into v_seen, v_status
  from public.sales_quotes q
  where q.id = new.sales_quote_id;

  if not v_seen then
    raise exception
      'Le devis visé est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if v_status <> 'DRAFT' and not public.is_restoring() then
    raise exception
      'Opération refusée : les lignes d''un devis émis sont figées. Le prix remis au client ne se réécrit pas.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_sales_quote_line_guard() from public, anon;

create trigger sales_quote_lines_guard
  before insert or update on public.sales_quote_lines
  for each row execute function public.fn_sales_quote_line_guard();


create or replace function public.fn_sales_order_line_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status public.order_status;
  v_seen   boolean := false;
begin
  select true, o.status into v_seen, v_status
  from public.sales_orders o
  where o.id = new.sales_order_id;

  if not v_seen then
    raise exception
      'La commande visée est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if v_status <> 'DRAFT' and not public.is_restoring() then
    raise exception
      'Opération refusée : les lignes d''une commande confirmée sont figées. L''engagement pris ne se réécrit pas.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_sales_order_line_guard() is
  'Couche 2 : les lignes d''une commande confirmée, livrée, facturée ou annulée sont figées.';

revoke execute on function public.fn_sales_order_line_guard() from public, anon;

create trigger sales_order_lines_guard
  before insert or update on public.sales_order_lines
  for each row execute function public.fn_sales_order_line_guard();


-- =============================================================================
-- 11. COUCHE 1 — LES ACTES DU DEVIS
--
-- Chaque fonction vérifie SA capacité en première instruction (Plan 02 §8.3),
-- et la cohérence métier AVANT tout test sur l'acteur : sans quoi la clé de
-- service contournerait les règles (§8.3 n° 4).
-- =============================================================================

create or replace function public.create_sales_quote(
  p_client_id   uuid,
  p_quote_date  date,
  p_valid_until date default null,
  p_notes       text default null,
  p_terms       text default null
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
    array['commerce.sales_quotes.create'], 'préparer un devis client');
  perform public.require_capability(
    array['commerce.sales_quotes.view'], 'consulter le devis préparé');
  -- On n'établit pas un devis pour un tiers qu'on n'a pas le droit de consulter.
  perform public.require_capability(
    array['parties.clients.view'], 'consulter le client du devis');

  if p_client_id is null then
    raise exception 'Un devis se rattache obligatoirement à un client.'
      using errcode = 'check_violation';
  end if;

  if p_quote_date is null then
    raise exception 'La date du devis est obligatoire.'
      using errcode = 'check_violation';
  end if;

  if p_valid_until is not null and p_valid_until < p_quote_date then
    raise exception 'La validité d''un devis ne peut pas précéder sa date.'
      using errcode = 'check_violation';
  end if;

  -- Introuvable ou invisible : même réponse (DEC-017).
  if not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception
      'Le client désigné est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  v_no := public.next_number('sales_quote');

  insert into public.sales_quotes
    (quote_no, client_id, quote_date, valid_until, notes, terms, created_by, updated_by)
  values
    (v_no, p_client_id, p_quote_date, p_valid_until,
     nullif(btrim(coalesce(p_notes, '')), ''),
     nullif(btrim(coalesce(p_terms, '')), ''),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_sales_quote(uuid, date, date, text, text) from public, anon;
grant  execute on function public.create_sales_quote(uuid, date, date, text, text) to authenticated, service_role;


create or replace function public.update_sales_quote(
  p_quote_id    uuid,
  p_quote_date  date,
  p_valid_until date default null,
  p_notes       text default null,
  p_terms       text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  q public.sales_quotes%rowtype;
begin
  perform public.require_capability(
    array['commerce.sales_quotes.update'], 'modifier un devis client');
  perform public.require_capability(
    array['commerce.sales_quotes.view'], 'consulter le devis à modifier');

  select * into q from public.sales_quotes where id = p_quote_id for update;

  if not found then
    raise exception 'Devis introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if q.status <> 'DRAFT' then
    raise exception
      'Opération refusée : seul un devis en brouillon se modifie. Celui-ci est « % ».', q.status
      using errcode = 'check_violation';
  end if;

  if p_quote_date is null then
    raise exception 'La date du devis est obligatoire.' using errcode = 'check_violation';
  end if;

  if p_valid_until is not null and p_valid_until < p_quote_date then
    raise exception 'La validité d''un devis ne peut pas précéder sa date.'
      using errcode = 'check_violation';
  end if;

  update public.sales_quotes
     set quote_date  = p_quote_date,
         valid_until = p_valid_until,
         notes       = nullif(btrim(coalesce(p_notes, '')), ''),
         terms       = nullif(btrim(coalesce(p_terms, '')), ''),
         updated_by  = public.current_actor()
   where id = q.id;
end;
$$;

revoke execute on function public.update_sales_quote(uuid, date, date, text, text) from public, anon;
grant  execute on function public.update_sales_quote(uuid, date, date, text, text) to authenticated, service_role;


/*
 * AJOUTER UNE LIGNE — LES DEUX TYPES DE A-13, PAR UNE SEULE FONCTION.
 *
 *   p_variant_id RENSEIGNÉ → LIGNE CATALOGUE. Le prix est RÉSOLU du catalogue
 *       À LA DATE DU DEVIS, jamais saisi. `p_unit_price` est alors refusé :
 *       accepter un prix libre sur une ligne de catalogue serait une remise
 *       déguisée, que rien ne garde (§ en-tête).
 *   p_variant_id ABSENT → LIGNE LIBRE (A-13). `p_unit_price` est obligatoire,
 *       et la ligne ne porte aucun service.
 *
 * 🟥 LE PRIX EST FIGÉ ICI, ET UNE FOIS POUR TOUTES. Le résolveur est interrogé
 * au moment de l'ajout ; sa réponse est COPIÉE dans `unit_price`. Une version
 * de prix ouverte le lendemain ne touche pas cette ligne.
 */
create or replace function public.add_sales_quote_line(
  p_quote_id   uuid,
  p_quantity   integer,
  p_variant_id uuid default null,
  p_label      text default null,
  p_unit_price bigint default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id      uuid;
  q         public.sales_quotes%rowtype;
  v_service uuid;
  v_vlabel  text;
  v_slabel  text;
  v_price   bigint;
  v_label   text;
begin
  perform public.require_capability(
    array['commerce.sales_quotes.create', 'commerce.sales_quotes.update'],
    'ajouter une ligne à un devis client');
  perform public.require_capability(
    array['commerce.sales_quotes.view'], 'consulter le devis à compléter');

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La quantité doit être un entier positif.'
      using errcode = 'check_violation';
  end if;

  select * into q from public.sales_quotes where id = p_quote_id;

  if not found then
    raise exception 'Devis introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if q.status <> 'DRAFT' then
    raise exception
      'Opération refusée : les lignes d''un devis émis sont figées.'
      using errcode = 'check_violation';
  end if;

  if p_variant_id is not null then
    /* ---------------- TYPE A — LIGNE CATALOGUE ---------------------------- */
    perform public.require_capability(
      array['catalog.services.view'], 'consulter le service porté par la ligne');

    if p_unit_price is not null then
      raise exception
        'Opération refusée : le prix d''une ligne de catalogue vient du catalogue, à la date du devis. Pour un montant choisi, ajoutez une ligne libre.'
        using errcode = 'check_violation';
    end if;

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

    -- 🟥 LE PRIX DE VENTE, À LA DATE DU DEVIS — D16, jamais « le prix courant ».
    select r.amount into v_price
    from public.resolve_service_price(p_variant_id, q.quote_date) r;

    if v_price is null then
      raise exception
        'Opération refusée : aucun prix de vente n''est en vigueur au % pour cette prestation. Un devis ne devine pas un montant (Workflow 07 §12).',
        to_char(q.quote_date, 'DD/MM/YYYY')
        using errcode = 'no_data_found';
    end if;

    -- La désignation est COPIÉE, et reste modifiable à la saisie.
    v_label := coalesce(
      nullif(btrim(coalesce(p_label, '')), ''),
      v_slabel || ' — ' || v_vlabel
    );

    insert into public.sales_quote_lines
      (sales_quote_id, service_id, service_variant_id, label, quantity, unit_price,
       created_by, updated_by)
    values
      (q.id, v_service, p_variant_id, v_label, p_quantity, v_price,
       public.current_actor(), public.current_actor())
    returning id into v_id;

  else
    /* ---------------- TYPE B — LIGNE LIBRE (A-13) ------------------------- */
    if btrim(coalesce(p_label, '')) = '' then
      raise exception 'Une ligne libre doit être désignée.'
        using errcode = 'check_violation';
    end if;

    if p_unit_price is null or p_unit_price <= 0 then
      raise exception
        'Le prix unitaire d''une ligne libre doit être un entier positif, en KMF (DEC-010).'
        using errcode = 'check_violation';
    end if;

    insert into public.sales_quote_lines
      (sales_quote_id, label, quantity, unit_price, created_by, updated_by)
    values
      (q.id, btrim(p_label), p_quantity, p_unit_price,
       public.current_actor(), public.current_actor())
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.add_sales_quote_line(uuid, integer, uuid, text, bigint) from public, anon;
grant  execute on function public.add_sales_quote_line(uuid, integer, uuid, text, bigint) to authenticated, service_role;


create or replace function public.archive_sales_quote_line(p_line_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_quote uuid;
begin
  perform public.require_capability(
    array['commerce.sales_quotes.update'], 'retirer une ligne d''un devis client');
  perform public.require_capability(
    array['commerce.sales_quotes.view'], 'consulter le devis concerné');

  select sales_quote_id into v_quote from public.sales_quote_lines where id = p_line_id;

  if v_quote is null then
    raise exception 'Ligne de devis introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  -- D6 : on archive, on n'efface pas. Le déclencheur de gel refuse d'ailleurs
  -- l'opération si le devis a quitté le brouillon.
  update public.sales_quote_lines
     set is_archived = true, updated_by = public.current_actor()
   where id = p_line_id;
end;
$$;

revoke execute on function public.archive_sales_quote_line(uuid) from public, anon;
grant  execute on function public.archive_sales_quote_line(uuid) to authenticated, service_role;


/*
 * LE CYCLE DU DEVIS — quatre actes, une seule fonction.
 *
 * Elle se contente de poser le statut : c'est le DÉCLENCHEUR qui vérifie la
 * transition et la capacité, et lui seul fait autorité — y compris pour un
 * `PATCH` direct qui ne passerait par aucune fonction.
 */
create or replace function public.set_sales_quote_status(
  p_quote_id uuid,
  p_status   public.commercial_document_status,
  p_reason   text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  q public.sales_quotes%rowtype;
begin
  perform public.require_capability(
    array['commerce.sales_quotes.view'], 'consulter le devis concerné');

  if p_status = 'CONVERTED' then
    raise exception
      'Opération refusée : « converti » n''est pas un statut qui se déclare. Il résulte de la création de la commande.'
      using errcode = 'check_violation';
  end if;

  select * into q from public.sales_quotes where id = p_quote_id for update;

  if not found then
    raise exception 'Devis introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if q.status = p_status then
    raise exception 'Ce devis est déjà « % ».', p_status
      using errcode = 'check_violation';
  end if;

  update public.sales_quotes
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

comment on function public.set_sales_quote_status(uuid, public.commercial_document_status, text) is
  'Émettre, accepter, refuser ou annuler un devis. Le déclencheur de transition vérifie la capacité de chaque passage.';

revoke execute on function public.set_sales_quote_status(uuid, public.commercial_document_status, text) from public, anon;
grant  execute on function public.set_sales_quote_status(uuid, public.commercial_document_status, text) to authenticated, service_role;


-- =============================================================================
-- 12. COUCHE 1 — LES ACTES DE LA COMMANDE
-- =============================================================================

create or replace function public.create_sales_order(
  p_client_id     uuid,
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
    array['commerce.sales_orders.create'], 'créer une commande client');
  perform public.require_capability(
    array['commerce.sales_orders.view'], 'consulter la commande créée');
  perform public.require_capability(
    array['parties.clients.view'], 'consulter le client de la commande');

  if p_client_id is null then
    raise exception 'Une commande se rattache obligatoirement à un client.'
      using errcode = 'check_violation';
  end if;

  if p_order_date is null then
    raise exception 'La date de la commande est obligatoire.'
      using errcode = 'check_violation';
  end if;

  if p_expected_date is not null and p_expected_date < p_order_date then
    raise exception 'La date attendue ne peut pas précéder la date de la commande.'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception
      'Le client désigné est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  v_no := public.next_number('sales_order');

  insert into public.sales_orders
    (order_no, client_id, order_date, expected_date, notes, terms, created_by, updated_by)
  values
    (v_no, p_client_id, p_order_date, p_expected_date,
     nullif(btrim(coalesce(p_notes, '')), ''),
     nullif(btrim(coalesce(p_terms, '')), ''),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_sales_order(uuid, date, date, text, text) from public, anon;
grant  execute on function public.create_sales_order(uuid, date, date, text, text) to authenticated, service_role;


create or replace function public.update_sales_order(
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
  o public.sales_orders%rowtype;
begin
  perform public.require_capability(
    array['commerce.sales_orders.update'], 'modifier une commande client');
  perform public.require_capability(
    array['commerce.sales_orders.view'], 'consulter la commande à modifier');

  select * into o from public.sales_orders where id = p_order_id for update;

  if not found then
    raise exception 'Commande introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if o.status <> 'DRAFT' then
    raise exception
      'Opération refusée : seule une commande en brouillon se modifie. Celle-ci est « % ».', o.status
      using errcode = 'check_violation';
  end if;

  if p_order_date is null then
    raise exception 'La date de la commande est obligatoire.' using errcode = 'check_violation';
  end if;

  if p_expected_date is not null and p_expected_date < p_order_date then
    raise exception 'La date attendue ne peut pas précéder la date de la commande.'
      using errcode = 'check_violation';
  end if;

  update public.sales_orders
     set order_date    = p_order_date,
         expected_date = p_expected_date,
         notes         = nullif(btrim(coalesce(p_notes, '')), ''),
         terms         = nullif(btrim(coalesce(p_terms, '')), ''),
         updated_by    = public.current_actor()
   where id = o.id;
end;
$$;

revoke execute on function public.update_sales_order(uuid, date, date, text, text) from public, anon;
grant  execute on function public.update_sales_order(uuid, date, date, text, text) to authenticated, service_role;


create or replace function public.add_sales_order_line(
  p_order_id   uuid,
  p_quantity   integer,
  p_variant_id uuid default null,
  p_label      text default null,
  p_unit_price bigint default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id      uuid;
  o         public.sales_orders%rowtype;
  v_service uuid;
  v_vlabel  text;
  v_slabel  text;
  v_price   bigint;
  v_label   text;
begin
  perform public.require_capability(
    array['commerce.sales_orders.create', 'commerce.sales_orders.update'],
    'ajouter une ligne à une commande client');
  perform public.require_capability(
    array['commerce.sales_orders.view'], 'consulter la commande à compléter');

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La quantité doit être un entier positif.'
      using errcode = 'check_violation';
  end if;

  select * into o from public.sales_orders where id = p_order_id;

  if not found then
    raise exception 'Commande introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if o.status <> 'DRAFT' then
    raise exception
      'Opération refusée : les lignes d''une commande confirmée sont figées.'
      using errcode = 'check_violation';
  end if;

  if p_variant_id is not null then
    perform public.require_capability(
      array['catalog.services.view'], 'consulter le service porté par la ligne');

    if p_unit_price is not null then
      raise exception
        'Opération refusée : le prix d''une ligne de catalogue vient du catalogue, à la date de la commande. Pour un montant choisi, ajoutez une ligne libre.'
        using errcode = 'check_violation';
    end if;

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

    select r.amount into v_price
    from public.resolve_service_price(p_variant_id, o.order_date) r;

    if v_price is null then
      raise exception
        'Opération refusée : aucun prix de vente n''est en vigueur au % pour cette prestation.',
        to_char(o.order_date, 'DD/MM/YYYY')
        using errcode = 'no_data_found';
    end if;

    v_label := coalesce(
      nullif(btrim(coalesce(p_label, '')), ''),
      v_slabel || ' — ' || v_vlabel
    );

    insert into public.sales_order_lines
      (sales_order_id, service_id, service_variant_id, label, quantity, unit_price,
       created_by, updated_by)
    values
      (o.id, v_service, p_variant_id, v_label, p_quantity, v_price,
       public.current_actor(), public.current_actor())
    returning id into v_id;

  else
    if btrim(coalesce(p_label, '')) = '' then
      raise exception 'Une ligne libre doit être désignée.'
        using errcode = 'check_violation';
    end if;

    if p_unit_price is null or p_unit_price <= 0 then
      raise exception
        'Le prix unitaire d''une ligne libre doit être un entier positif, en KMF (DEC-010).'
        using errcode = 'check_violation';
    end if;

    insert into public.sales_order_lines
      (sales_order_id, label, quantity, unit_price, created_by, updated_by)
    values
      (o.id, btrim(p_label), p_quantity, p_unit_price,
       public.current_actor(), public.current_actor())
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.add_sales_order_line(uuid, integer, uuid, text, bigint) from public, anon;
grant  execute on function public.add_sales_order_line(uuid, integer, uuid, text, bigint) to authenticated, service_role;


create or replace function public.archive_sales_order_line(p_line_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_order uuid;
begin
  perform public.require_capability(
    array['commerce.sales_orders.update'], 'retirer une ligne d''une commande client');
  perform public.require_capability(
    array['commerce.sales_orders.view'], 'consulter la commande concernée');

  select sales_order_id into v_order from public.sales_order_lines where id = p_line_id;

  if v_order is null then
    raise exception 'Ligne de commande introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  update public.sales_order_lines
     set is_archived = true, updated_by = public.current_actor()
   where id = p_line_id;
end;
$$;

revoke execute on function public.archive_sales_order_line(uuid) from public, anon;
grant  execute on function public.archive_sales_order_line(uuid) to authenticated, service_role;


create or replace function public.set_sales_order_status(
  p_order_id uuid,
  p_status   public.order_status,
  p_reason   text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  o public.sales_orders%rowtype;
begin
  perform public.require_capability(
    array['commerce.sales_orders.view'], 'consulter la commande concernée');

  if p_status = 'INVOICED' then
    raise exception
      'Opération refusée : « facturée » n''est pas un statut qui se déclare. Il résulte de la préparation d''une facture client.'
      using errcode = 'check_violation';
  end if;

  select * into o from public.sales_orders where id = p_order_id for update;

  if not found then
    raise exception 'Commande introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if o.status = p_status then
    raise exception 'Cette commande est déjà « % ».', p_status
      using errcode = 'check_violation';
  end if;

  update public.sales_orders
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
   * ANNULER UNE COMMANDE REND SON DEVIS À « ACCEPTÉ ».
   *
   * Sans ce retour, un devis converti par erreur resterait « converti » sans
   * commande vivante, tandis que l'index d'unicité, lui, se libérerait — et une
   * seconde commande naîtrait d'un devis que rien n'aurait rouvert. Les deux
   * doivent bouger ensemble. Même mécanique qu'au LOT 7, entre la facture
   * annulée et la location rendue à « À facturer ».
   */
  if p_status = 'CANCELLED' and o.sales_quote_id is not null then
    update public.sales_quotes
       set status            = 'ACCEPTED',
           converted_at      = null,
           converted_by      = null,
           status_reason     = 'Commande ' || o.order_no || ' annulée',
           status_changed_at = now(),
           status_changed_by = public.current_actor(),
           updated_by        = public.current_actor()
     where id = o.sales_quote_id
       and status = 'CONVERTED';
  end if;
end;
$$;

comment on function public.set_sales_order_status(uuid, public.order_status, text) is
  'Confirmer, livrer ou annuler une commande. L''annulation rend son devis d''origine à « accepté ».';

revoke execute on function public.set_sales_order_status(uuid, public.order_status, text) from public, anon;
grant  execute on function public.set_sales_order_status(uuid, public.order_status, text) to authenticated, service_role;


-- =============================================================================
-- 13. LA CONVERSION — UN ACTE NOUVEAU, L'ANCIEN INTACT
--
-- 🟥 LE DEVIS N'EST PAS TRANSFORMÉ. Aucun enregistrement ne change de nature :
-- une commande NAÎT, le devis passe à « converti » et reste consultable tel
-- qu'il a été remis au client. `DEV-C-…` reste `DEV-C-…`.
--
-- 🟥 LE CATALOGUE N'EST PAS RÉINTERROGÉ. Chaque ligne est RECOPIÉE du devis —
-- désignation, quantité, prix, service, variante — et porte
-- `source_quote_line_id`. Un prix modifié entre le devis et la conversion n'a
-- aucun effet : le client a accepté un montant, c'est celui-là qui l'engage.
--
-- CAPACITÉS EXIGÉES — la symétrie de `create_invoice_from_sales_order`
-- (Plan 01 §15.5) : lire le devis, créer et lire la commande, lire le client.
-- Elle n'exige PAS `commerce.sales_quotes.validate` : le passage du devis à
-- « converti » est la CONSÉQUENCE de la commande, pas un acte séparé — comme
-- l'émission d'une facture fait passer la location à « Facturée » sans exiger
-- `rental.rentals.update`.
-- =============================================================================

create or replace function public.convert_sales_quote_to_order(
  p_quote_id      uuid,
  p_order_date    date default null,
  p_expected_date date default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  q        public.sales_quotes%rowtype;
  v_id     uuid;
  v_no     text;
  v_date   date;
  v_lignes int;
begin
  perform public.require_capability(
    array['commerce.sales_orders.create'], 'convertir un devis en commande');
  perform public.require_capability(
    array['commerce.sales_orders.view'], 'consulter la commande créée');
  perform public.require_capability(
    array['commerce.sales_quotes.view'], 'consulter le devis converti');
  perform public.require_capability(
    array['parties.clients.view'], 'consulter le client de la commande');

  select * into q from public.sales_quotes where id = p_quote_id for update;

  if not found then
    raise exception 'Devis introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if q.status = 'CONVERTED' then
    raise exception
      'Opération refusée : ce devis est déjà converti. Un devis ne produit pas deux commandes.'
      using errcode = 'unique_violation';
  end if;

  if q.status <> 'ACCEPTED' then
    raise exception
      'Opération refusée : seul un devis accepté se convertit en commande. Celui-ci est « % ».', q.status
      using errcode = 'check_violation';
  end if;

  -- Le jour est celui d'ADIKOM, jamais celui du serveur : aux Comores (UTC+3),
  -- `current_date` change trois heures trop tard.
  v_date := coalesce(p_order_date, (now() at time zone 'Indian/Comoro')::date);

  if p_expected_date is not null and p_expected_date < v_date then
    raise exception 'La date attendue ne peut pas précéder la date de la commande.'
      using errcode = 'check_violation';
  end if;

  v_no := public.next_number('sales_order');

  insert into public.sales_orders
    (order_no, client_id, sales_quote_id, order_date, expected_date,
     currency_code, notes, terms, created_by, updated_by)
  values
    (v_no, q.client_id, q.id, v_date, p_expected_date,
     q.currency_code, q.notes, q.terms,
     public.current_actor(), public.current_actor())
  returning id into v_id;

  -- LES LIGNES SONT RECOPIÉES, PAS RÉSOLUES.
  insert into public.sales_order_lines
    (sales_order_id, service_id, service_variant_id, source_quote_line_id,
     label, quantity, unit_price, created_by, updated_by)
  select
    v_id, l.service_id, l.service_variant_id, l.id,
    l.label, l.quantity, l.unit_price,
    public.current_actor(), public.current_actor()
  from public.sales_quote_lines l
  where l.sales_quote_id = q.id
    and l.is_archived = false;

  get diagnostics v_lignes = row_count;

  if v_lignes = 0 then
    raise exception
      'Opération refusée : ce devis ne porte aucune ligne active, ou ses lignes ne sont pas lisibles avec vos droits. La commande serait vide.'
      using errcode = 'check_violation';
  end if;

  update public.sales_quotes
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

comment on function public.convert_sales_quote_to_order(uuid, date, date) is
  'Crée une commande à partir d''un devis accepté. Le devis est conservé et passe à « converti » ; les prix sont RECOPIÉS, jamais relus du catalogue.';

revoke execute on function public.convert_sales_quote_to_order(uuid, date, date) from public, anon;
grant  execute on function public.convert_sales_quote_to_order(uuid, date, date) to authenticated, service_role;


-- =============================================================================
-- 14. COUCHE 4 — RLS, selon le patron du Plan 02 §8.2
--
-- `has_permission(...)` est ENVELOPPÉE DANS UN SOUS-SELECT : une garde de RLS
-- s'évalue PAR LIGNE, et l'appel coûterait sinon un aller-retour par ligne de
-- la liste (migration 065).
--
-- AUCUN `DELETE` : un acte commercial s'annule, il ne s'efface pas (D6).
-- =============================================================================

revoke all on public.sales_quotes      from anon;
revoke all on public.sales_quote_lines from anon;
revoke all on public.sales_orders      from anon;
revoke all on public.sales_order_lines from anon;

revoke delete on public.sales_quotes      from authenticated;
revoke delete on public.sales_quote_lines from authenticated;
revoke delete on public.sales_orders      from authenticated;
revoke delete on public.sales_order_lines from authenticated;

-- `TRUNCATE` ne déclenche aucun déclencheur de ligne : il contournerait
-- `fn_forbid_delete` et effacerait des actes commerciaux sans laisser une
-- entrée au journal (DEC-039 §g).
revoke truncate on public.sales_quotes      from authenticated;
revoke truncate on public.sales_quote_lines from authenticated;
revoke truncate on public.sales_orders      from authenticated;
revoke truncate on public.sales_order_lines from authenticated;

alter table public.sales_quotes      enable row level security;
alter table public.sales_quote_lines enable row level security;
alter table public.sales_orders      enable row level security;
alter table public.sales_order_lines enable row level security;


-- --- Devis --------------------------------------------------------------------

create policy sales_quotes_select on public.sales_quotes
  for select to authenticated
  using ((select public.has_permission('commerce.sales_quotes.view')));

create policy sales_quotes_insert on public.sales_quotes
  for insert to authenticated
  with check ((select public.has_permission('commerce.sales_quotes.create')));

/*
 * L'ÉCRITURE COUVRE LES QUATRE CAPACITÉS QUI PEUVENT LÉGITIMEMENT MODIFIER UNE
 * LIGNE DE DEVIS — modifier, faire avancer le cycle, annuler, et CRÉER LA
 * COMMANDE qui le convertit.
 *
 * La policy ouvre la porte ; c'est le DÉCLENCHEUR de transition qui dit laquelle
 * de ces capacités autorise QUEL passage. Sans `commerce.sales_orders.create`
 * ici, la conversion échouerait au niveau de RLS avant même d'atteindre le
 * déclencheur — et l'échec accuserait la mauvaise cause.
 */
create policy sales_quotes_update on public.sales_quotes
  for update to authenticated
  using (
    (select public.has_permission('commerce.sales_quotes.update'))
    or (select public.has_permission('commerce.sales_quotes.validate'))
    or (select public.has_permission('commerce.sales_quotes.cancel'))
    or (select public.has_permission('commerce.sales_orders.create'))
    or (select public.has_permission('commerce.sales_orders.cancel'))
  )
  with check (
    (select public.has_permission('commerce.sales_quotes.update'))
    or (select public.has_permission('commerce.sales_quotes.validate'))
    or (select public.has_permission('commerce.sales_quotes.cancel'))
    or (select public.has_permission('commerce.sales_orders.create'))
    or (select public.has_permission('commerce.sales_orders.cancel'))
  );


-- --- Lignes de devis ----------------------------------------------------------
--
-- Elles se lisent avec le devis : elles ne montrent rien de plus que lui.

create policy sales_quote_lines_select on public.sales_quote_lines
  for select to authenticated
  using ((select public.has_permission('commerce.sales_quotes.view')));

create policy sales_quote_lines_insert on public.sales_quote_lines
  for insert to authenticated
  with check (
    (select public.has_permission('commerce.sales_quotes.create'))
    or (select public.has_permission('commerce.sales_quotes.update'))
  );

create policy sales_quote_lines_update on public.sales_quote_lines
  for update to authenticated
  using ((select public.has_permission('commerce.sales_quotes.update')))
  with check ((select public.has_permission('commerce.sales_quotes.update')));


-- --- Commandes ----------------------------------------------------------------

create policy sales_orders_select on public.sales_orders
  for select to authenticated
  using ((select public.has_permission('commerce.sales_orders.view')));

create policy sales_orders_insert on public.sales_orders
  for insert to authenticated
  with check ((select public.has_permission('commerce.sales_orders.create')));

/*
 * `billing.customer_invoices.create` et `.cancel` figurent ici parce que la
 * facturation fait passer la commande à « Facturée », et son annulation la
 * ramène à « Confirmée » (migration 098). Sans elles, facturer une commande
 * échouerait au niveau de RLS.
 *
 * 🟥 CE N'EST PAS UN ÉLARGISSEMENT DÉGUISÉ. Le déclencheur de transition
 * n'autorise à ces deux capacités QUE les passages `→ INVOICED` et
 * `INVOICED → CONFIRMED` : un porteur de `billing.customer_invoices.create`
 * ne peut ni confirmer, ni livrer, ni annuler une commande.
 */
create policy sales_orders_update on public.sales_orders
  for update to authenticated
  using (
    (select public.has_permission('commerce.sales_orders.update'))
    or (select public.has_permission('commerce.sales_orders.validate'))
    or (select public.has_permission('commerce.sales_orders.cancel'))
    or (select public.has_permission('billing.customer_invoices.create'))
    or (select public.has_permission('billing.customer_invoices.cancel'))
  )
  with check (
    (select public.has_permission('commerce.sales_orders.update'))
    or (select public.has_permission('commerce.sales_orders.validate'))
    or (select public.has_permission('commerce.sales_orders.cancel'))
    or (select public.has_permission('billing.customer_invoices.create'))
    or (select public.has_permission('billing.customer_invoices.cancel'))
  );


-- --- Lignes de commande -------------------------------------------------------

create policy sales_order_lines_select on public.sales_order_lines
  for select to authenticated
  using ((select public.has_permission('commerce.sales_orders.view')));

create policy sales_order_lines_insert on public.sales_order_lines
  for insert to authenticated
  with check (
    (select public.has_permission('commerce.sales_orders.create'))
    or (select public.has_permission('commerce.sales_orders.update'))
  );

create policy sales_order_lines_update on public.sales_order_lines
  for update to authenticated
  using ((select public.has_permission('commerce.sales_orders.update')))
  with check ((select public.has_permission('commerce.sales_orders.update')));


-- =============================================================================
-- 15. LE JOURNAL N'OUVRE PAS CE QUE LA TABLE FERME — DEC-038
--
-- Cette fonction est REPRISE DE SA DERNIÈRE VERSION ACTIVE (migration 094), et
-- non de celle d'origine : la leçon du LOT 22. Les correspondances des LOTS 20,
-- 21, 22 et 23 y figurent toutes, vérifiées au §17.
--
-- Les quatre tables du commerce client s'ouvrent par la capacité de lecture de
-- LEUR menu. Une commande ne se lit pas avec le devis, ni l'inverse : ce sont
-- deux menus, deux capacités (A-14).
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
-- 16. LES SEIZE CAPACITÉS — Plan 02 §10.2, LOT 25
--
-- La liste de colonnes ouvre par `(code, module_code` : c'est la forme que le
-- contrôle de parité TS/SQL (`permissions.test.ts`) reconnaît pour rejouer le
-- catalogue sans interpréter du SQL.
--
-- MODULE `commerce`, ordre 11. Deux menus : `sales_quotes` (1),
-- `sales_orders` (2). Huit actions chacun, EXACTEMENT celles du Plan 02 §10.2 :
--
--     view · create · update · validate · cancel · export✓ · download✓ · print✓
--
-- AUCUNE CAPACITÉ DE PLUS, et chacune est motivée :
--
--   `validate`  fait avancer le document — émettre un devis, enregistrer la
--               réponse du client, confirmer ou livrer une commande.
--   `cancel`    retire le document. Un devis refusé n'est pas un devis annulé.
--   `download`  et `print` sont DISTINCTES de `view` et l'une de l'autre
--               (DEC-024) : un collaborateur peut consulter un devis sans avoir
--               le droit d'en produire le PDF ni de l'imprimer.
--   `export`    la liste, au format tableur. Sensible : une liste de devis est
--               une photographie du portefeuille commercial.
--
-- AUCUNE capacité `commerce.purchase_*` : le commerce fournisseur est le LOT 26,
-- et une permission qui ne débloque rien ne s'attribue pas (CLAUDE.md §19 bis).
-- AUCUNE capacité de facturation : facturer une commande relève de
-- `billing.customer_invoices.create`, qui existe depuis la migration 007. En
-- créer une seconde serait une seconde vérité sur le même acte.
-- AUCUNE capacité de remise, de marge ni de coût — voir l'en-tête.
--
-- Catalogue : 197 → 213.
-- =============================================================================

with nouvelles (
  code, module_code, menu_code, menu_label, menu_order,
  submenu_code, submenu_label, action, label, sensitive, rang
) as (values
  ('commerce.sales_quotes.view',     'commerce', 'sales_quotes', 'Devis clients', 1,
   null, null, 'VIEW',     'Consulter les devis clients',            false, 1),
  ('commerce.sales_quotes.create',   'commerce', 'sales_quotes', 'Devis clients', 1,
   null, null, 'CREATE',   'Créer un devis client',                  false, 2),
  ('commerce.sales_quotes.update',   'commerce', 'sales_quotes', 'Devis clients', 1,
   null, null, 'UPDATE',   'Modifier un devis client',               false, 3),
  ('commerce.sales_quotes.validate', 'commerce', 'sales_quotes', 'Devis clients', 1,
   null, null, 'VALIDATE', 'Émettre un devis, enregistrer la réponse du client', false, 4),
  ('commerce.sales_quotes.cancel',   'commerce', 'sales_quotes', 'Devis clients', 1,
   null, null, 'CANCEL',   'Annuler un devis client',                false, 5),
  ('commerce.sales_quotes.export',   'commerce', 'sales_quotes', 'Devis clients', 1,
   null, null, 'EXPORT',   'Exporter la liste des devis clients',    true,  6),
  ('commerce.sales_quotes.download', 'commerce', 'sales_quotes', 'Devis clients', 1,
   null, null, 'DOWNLOAD', 'Télécharger le document d''un devis',    true,  7),
  ('commerce.sales_quotes.print',    'commerce', 'sales_quotes', 'Devis clients', 1,
   null, null, 'PRINT',    'Imprimer le document d''un devis',       true,  8),

  ('commerce.sales_orders.view',     'commerce', 'sales_orders', 'Commandes clients', 2,
   null, null, 'VIEW',     'Consulter les commandes clients',        false, 1),
  ('commerce.sales_orders.create',   'commerce', 'sales_orders', 'Commandes clients', 2,
   null, null, 'CREATE',   'Créer une commande, convertir un devis', false, 2),
  ('commerce.sales_orders.update',   'commerce', 'sales_orders', 'Commandes clients', 2,
   null, null, 'UPDATE',   'Modifier une commande client',           false, 3),
  ('commerce.sales_orders.validate', 'commerce', 'sales_orders', 'Commandes clients', 2,
   null, null, 'VALIDATE', 'Confirmer une commande, constater sa livraison', false, 4),
  ('commerce.sales_orders.cancel',   'commerce', 'sales_orders', 'Commandes clients', 2,
   null, null, 'CANCEL',   'Annuler une commande client',            false, 5),
  ('commerce.sales_orders.export',   'commerce', 'sales_orders', 'Commandes clients', 2,
   null, null, 'EXPORT',   'Exporter la liste des commandes clients', true, 6),
  ('commerce.sales_orders.download', 'commerce', 'sales_orders', 'Commandes clients', 2,
   null, null, 'DOWNLOAD', 'Télécharger le document d''une commande', true, 7),
  ('commerce.sales_orders.print',    'commerce', 'sales_orders', 'Commandes clients', 2,
   null, null, 'PRINT',    'Imprimer le document d''une commande',   true,  8)
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
-- 17. CONTRÔLES DE NON-RÉGRESSION
--
-- LE TOTAL DU CATALOGUE EST AFFIRMÉ ICI, ET NULLE PART AILLEURS (DEC-046).
-- Une migration énonce un fait DATÉ et n'a jamais à être rouverte. Les recettes
-- comparent les ENSEMBLES, code par code (`checkCatalogue`).
-- =============================================================================

do $$
declare
  v_total      int;
  v_attendu    text[] := array[
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
  if v_total <> 213 then
    raise exception 'Catalogue attendu à 213 permissions, obtenu %.', v_total;
  end if;

  select array_agg(c) into v_manquantes
  from unnest(v_attendu) c
  where not exists (select 1 from public.permissions p where p.code = c);

  if v_manquantes is not null then
    raise exception 'Capacités du LOT 25 absentes du catalogue : %', v_manquantes;
  end if;

  -- AUCUNE capacité inventée : ni remise, ni marge, ni facturation propre, ni
  -- commerce fournisseur (CLAUDE.md §19 bis).
  select array_agg(p.code) into v_inconnues
  from public.permissions p
  where p.module_code = 'commerce' and not (p.code = any (v_attendu));

  if v_inconnues is not null then
    raise exception
      'Capacité créée sans fonctionnalité correspondante : %', v_inconnues;
  end if;

  -- Les six capacités sensibles du lot : export, téléchargement, impression.
  if exists (
    select 1 from public.permissions
    where code in ('commerce.sales_quotes.export', 'commerce.sales_quotes.download',
                   'commerce.sales_quotes.print', 'commerce.sales_orders.export',
                   'commerce.sales_orders.download', 'commerce.sales_orders.print')
      and is_sensitive is not true
  ) then
    raise exception
      'Une capacité documentaire ou d''export du commerce client n''est pas marquée sensible.';
  end if;

  -- Les quatre tables, avec RLS activée.
  foreach v_table in array array[
    'sales_quotes', 'sales_quote_lines', 'sales_orders', 'sales_order_lines'
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
   * 🟥 AUCUNE COLONNE DE COÛT NI DE MARGE sur les lignes commerciales.
   *
   * Plan 02 §9.3 : le coût copié vit dans `commercial_line_costs`, au LOT 28.
   * Une colonne glissée ici rendrait la confidentialité contournable par le
   * document — et le contrôle serait découvert trop tard.
   */
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('sales_quote_lines', 'sales_order_lines')
      and (column_name like '%cost%' or column_name like '%margin%'
        or column_name like '%commission%')
  ) then
    raise exception
      'Une colonne de coût ou de marge figure sur une ligne commerciale : la confidentialité serait contournable (Plan 02 §9.3).';
  end if;

  -- `commercial_line_costs` relève du LOT 28. La créer ici serait anticiper.
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'commercial_line_costs'
  ) then
    raise exception
      '`commercial_line_costs` est créée alors que le Plan 02 §13.2 l''assigne au LOT 28.';
  end if;

  -- Les deux règles de numérotation, à la forme de `customer_invoice`.
  if not exists (
    select 1 from public.numbering_rules
    where entity_key = 'sales_quote' and prefix = 'DEV-C' and include_year and padding = 6
  ) or not exists (
    select 1 from public.numbering_rules
    where entity_key = 'sales_order' and prefix = 'CDE-C' and include_year and padding = 6
  ) then
    raise exception 'Une règle de numérotation du commerce client est absente ou mal formée.';
  end if;

  -- La clé étrangère composite : la variante appartient bien à son service.
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_quote_lines_variant_belongs' and contype = 'f'
  ) or not exists (
    select 1 from pg_constraint
    where conname = 'sales_order_lines_variant_belongs' and contype = 'f'
  ) then
    raise exception
      'La garantie « la variante appartient à son service » est absente : elle ne peut pas être laissée à un déclencheur qui lirait à travers RLS.';
  end if;

  -- Un devis ne produit pas deux commandes.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'sales_orders_one_per_quote_idx'
  ) then
    raise exception
      'L''index d''unicité « une commande par devis » est absent : deux clics simultanés produiraient deux commandes.';
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
    'service_variant_prices', 'customer_invoices', 'numbering_rules'
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
    raise exception 'Le commerce client n''est pas correctement rattaché au journal.';
  end if;

  -- DOCTRINE D4 : aucun acte métier en SECURITY DEFINER.
  if exists (
    select 1 from pg_proc
    where oid in (
      'public.create_sales_quote(uuid, date, date, text, text)'::regprocedure,
      'public.update_sales_quote(uuid, date, date, text, text)'::regprocedure,
      'public.add_sales_quote_line(uuid, integer, uuid, text, bigint)'::regprocedure,
      'public.archive_sales_quote_line(uuid)'::regprocedure,
      'public.set_sales_quote_status(uuid, public.commercial_document_status, text)'::regprocedure,
      'public.create_sales_order(uuid, date, date, text, text)'::regprocedure,
      'public.update_sales_order(uuid, date, date, text, text)'::regprocedure,
      'public.add_sales_order_line(uuid, integer, uuid, text, bigint)'::regprocedure,
      'public.archive_sales_order_line(uuid)'::regprocedure,
      'public.set_sales_order_status(uuid, public.order_status, text)'::regprocedure,
      'public.convert_sales_quote_to_order(uuid, date, date)'::regprocedure,
      'public.sales_quote_total(uuid)'::regprocedure,
      'public.sales_order_total(uuid)'::regprocedure
    )
    and prosecdef
  ) then
    raise exception 'Une fonction métier du commerce client est SECURITY DEFINER (doctrine D4).';
  end if;

  raise notice
    '[OK] 097. Commerce client : 4 tables, RLS active, 16 capacités, catalogue à 213. Aucun coût, aucune marge, aucune remise.';
end $$;
