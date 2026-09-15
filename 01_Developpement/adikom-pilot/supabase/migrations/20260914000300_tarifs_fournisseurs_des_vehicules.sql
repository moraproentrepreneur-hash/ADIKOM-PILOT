-- =============================================================================
-- ADIKOM PILOT — 083 · Tarifs fournisseurs des véhicules
-- LOT 21 — DEC-044 · Plan 02 §3.2, §5.4, §6, §10.2
--
-- CE QUE CETTE MIGRATION LIVRE
--
--   · `supplier_vehicle_rates` — les VERSIONS DATÉES du COÛT D'ACQUISITION
--     d'un véhicule mis à disposition par un fournisseur ;
--   · un RÉSOLVEUR, `resolve_supplier_rate(véhicule, DATE)`, qui répond à
--     « quel coût fournisseur s'appliquait à cette date ? » ;
--   · deux ACTES — ouvrir une version, en retirer une ;
--   · quatre capacités, et pas une de plus.
--
-- CE QU'ELLE NE LIVRE PAS
--
--   · AUCUNE table de fournisseur, AUCUNE table de véhicule : le référentiel
--     existant est réemployé tel quel (consigne §7 et §8) ;
--   · AUCUN coût de référence interne pour un véhicule ADIKOM — voir P-2
--     ci-dessous, la décision manque et rien n'est inventé ;
--   · AUCUN segment de location, AUCUN avenant, AUCUN `locked_cost_*` : ils
--     appartiennent au LOT 22 ;
--   · AUCUNE marge stockée. Une différence se recalcule (doctrine D1) ;
--   · AUCUNE facture, AUCUN paiement, AUCUNE imputation : le coût sert ici au
--     SUIVI, et « imputation ≠ paiement » reste entier (CLAUDE.md §16, §57).
--
-- LA DOCTRINE — D16, DEC-043, réemployée telle quelle
--
--   « Un prix est une ligne datée ; une opération en garde la copie. »
--
-- Le LOT 20 l'a posée sur les services. Elle n'est pas réinventée ici : cette
-- migration l'applique au coût d'acquisition d'un véhicule. Changer un tarif
-- fournisseur, c'est CLORE la version courante et en OUVRIR une nouvelle —
-- jamais réécrire un montant. Un coût se lit TOUJOURS par un résolveur prenant
-- une DATE D'EFFET. Aucune version applicable ⇒ AUCUNE ligne renvoyée : un coût
-- absent n'est jamais un coût nul (DEC-008, DEC-017).
--
-- POURQUOI LE COÛT VIT DANS SA PROPRE TABLE
--
-- RLS filtre des LIGNES, pas des COLONNES (Plan 02 §6.3, barrière n° 1). Un
-- coût d'acquisition rangé sur `vehicles` serait rendu par un `select *` à
-- quiconque consulte le parc, et `rental.pricing.supplier.view` ne servirait
-- qu'à masquer un écran. Précédents : `maintenance_costs` (044) et
-- `service_variant_costs` (081).
--
-- 🟥 P-2 — LE COÛT INTERNE D'UN VÉHICULE ADIKOM N'EST PAS TRANCHÉ
--
-- La décision A-3 dit « ADIKOM est un fournisseur ». Le Plan 02 §3.2 pose la
-- question que cette phrase laisse ouverte, et la marque BLOQUANTE :
--
--   « Le coût interne d'un véhicule ADIKOM est-il (a) un tarif de référence
--     fixé par la Direction, ou (b) un coût de revient calculé — amortissement,
--     assurance, entretien ? »
--
-- (b) est aujourd'hui IMPOSSIBLE : aucune de ces charges n'est enregistrée par
-- véhicule. (a) supposerait de décider qu'ADIKOM se loue à elle-même. Ni l'une
-- ni l'autre n'est écrite.
--
-- CETTE MIGRATION NE TRANCHE DONC PAS. Elle n'enregistre un coût que pour un
-- véhicule `SUPPLIED`, et le déclencheur NOMME la décision manquante lorsqu'un
-- véhicule ADIKOM est présenté. La marge d'un véhicule ADIKOM reste NON
-- CALCULÉE plutôt que fausse — c'est exactement ce que le Plan 02 §3.2 exige.
--
-- L'ÉVOLUTION EST ADDITIVE, le jour où la Direction répondra : `supplier_id`
-- devient nullable, un indicateur `is_internal` s'ajoute, la contrainte
-- d'exclusion est déjà posée sur le seul véhicule. Aucune reprise de données.
-- Même forme que l'ouverture laissée à P-5 par le LOT 20.
--
-- AUCUNE CONTRAINTE EXISTANTE N'EST TOUCHÉE : un véhicule ADIKOM ne devient pas
-- `SUPPLIED`, et aucune fiche fournisseur « ADIKOM » n'est créée (Plan 02 §3.2,
-- voie (a) refusée).
--
-- ⚠ PRÉCISION SUR LE PLAN 02 §3.2 — LA CONTRAINTE CITÉE A CHANGÉ DE NOM
--
-- Le plan nomme `vehicles_origin_supplier_coherent` (migration 015) et la donne
-- pour en production. Elle n'y est plus : la migration 025 (Partenariats) l'a
-- REMPLACÉE par `vehicles_origin_attachment_coherent`, qui couvre trois cas au
-- lieu de deux —
--
--   SUPPLIED    → un fournisseur, pas de partenaire
--   PARTNERSHIP → un partenaire, pas de fournisseur
--   OWNED/OTHER → ni l'un ni l'autre
--
-- La substance du constat du plan tient : un véhicule ADIKOM ne peut toujours
-- pas porter de fournisseur. Mais le nom est périmé, et le contrôle final de
-- cette migration porte sur la contrainte RÉELLE.
--
-- UN TROISIÈME CAS, QUE LE PLAN N'AVAIT PAS VU : LE VÉHICULE DE PARTENARIAT
--
-- Deux véhicules du parc sont `PARTNERSHIP`. Ils ne sont ni à ADIKOM, ni fournis
-- par un fournisseur : leur coût d'acquisition relève des conditions du
-- partenariat, et le module Partenariats n'en gère aujourd'hui aucune. AUCUNE
-- décision n'existe sur ce point — il est signalé, non comblé.
--
-- Catalogue : 191 → 195.
-- =============================================================================


-- =============================================================================
-- 1. LA TABLE
--
-- Forme commune des tables de versions (Plan 02 §5.5), déjà éprouvée par
-- `service_variant_prices` et `service_variant_costs` :
--
--   1. `bigint` en KMF ENTIERS — DEC-010, jamais de flottant.
--   2. CONTRAINTE D'EXCLUSION, et non un déclencheur : elle ferme la COURSE
--      entre deux saisies simultanées, qu'aucun déclencheur ne voit (DEC-028).
--   3. UNE DATE DE DÉBUT FUTURE EST AUTORISÉE : « 40 000 jusqu'au 30/09,
--      45 000 à partir du 01/10 » se saisit AVANT le 1er octobre.
--   4. UN TROU entre deux versions est PERMIS, et signifie « aucun coût connu
--      à cette date ». Le résolveur ne rend rien, l'écran le dit, aucune marge
--      n'est calculée. Refus explicite, pas zéro silencieux.
--   5. AUCUNE SUPPRESSION. Une version se clôt, ou se retire.
--
-- L'EXCLUSION PORTE SUR LE SEUL VÉHICULE, ET C'EST LE POINT DE MODÉLISATION
--
-- Le résolveur du Plan 02 §5.4 s'écrit `resolve_supplier_rate(véhicule, date)` :
-- à une date donnée, un véhicule a UN coût d'acquisition, et un seul. Deux
-- versions actives qui se recouvriraient — fût-ce pour deux fournisseurs
-- différents — rendraient la question sans réponse. Le changement de
-- fournisseur reste possible : l'ancienne version se clôt, la nouvelle s'ouvre,
-- et chacune garde SON fournisseur.
--
-- A-1 : le contrat fournisseur porte un TARIF JOURNALIER (`DAY`) ou un FORFAIT
-- PAR LOCATION (`FLAT`). Le tarif mensuel n'est pas coché — il n'est pas créé.
-- =============================================================================

create table public.supplier_vehicle_rates (
  id            uuid primary key default gen_random_uuid(),

  -- Le référentiel existant, réemployé. Aucune table parallèle (consigne §7, §8).
  vehicle_id    uuid not null references public.vehicles  (id) on delete restrict,
  supplier_id   uuid not null references public.suppliers (id) on delete restrict,

  amount        bigint not null check (amount > 0),
  unit          public.pricing_unit not null,
  currency_code text   not null default 'KMF',

  valid_from    date not null,
  valid_to      date,

  is_active     boolean not null default true,

  /*
   * CONDITIONS HORS TARIF ORDINAIRE — A-1, Plan 02 §2.3.
   *
   * « Personne distinguée, agence demandant un ajustement, contrat longue durée
   *   spécial, négociation particulière. »
   *
   * Ce ne sont pas une seconde nature de tarif : ce sont des VERSIONS
   * SUPPLÉMENTAIRES ET DATÉES sur le même véhicule, et ce champ porte le motif
   * écrit. Aucune table « conditions négociées » n'est créée.
   */
  conditions    text,

  -- Motif du CHANGEMENT de tarif. Distinct du motif du retrait : un motif ne se
  -- réécrit pas après coup (migration 069).
  reason        text,

  deactivated_at      timestamptz,
  deactivated_by      uuid references public.app_users (id) on delete set null,
  deactivation_reason text,

  created_at    timestamptz not null default now(),
  created_by    uuid references public.app_users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.app_users (id) on delete set null,

  constraint supplier_vehicle_rates_period check (
    valid_to is null or valid_to >= valid_from
  ),

  constraint supplier_vehicle_rates_no_overlap exclude using gist (
    vehicle_id extensions.gist_uuid_ops with =,
    daterange(valid_from, coalesce(valid_to, 'infinity'::date), '[]') with &&
  ) where (is_active)
);

comment on table public.supplier_vehicle_rates is
  'Versions datées du COÛT D''ACQUISITION d''un véhicule fourni (D16, DEC-044). Donnée interne : sa lecture exige `rental.pricing.supplier.view`, et elle ne figure sur aucun document client.';
comment on column public.supplier_vehicle_rates.unit is
  'DAY — montant par jour. FLAT — forfait par location (A-1). Le tarif mensuel n''est pas coché par la Direction : il n''existe pas.';
comment on column public.supplier_vehicle_rates.valid_to is
  'NULL = en vigueur sans terme. Un TROU entre deux versions signifie « aucun coût connu à cette date » — le résolveur ne rend alors rien, et aucune marge n''est calculée.';
comment on column public.supplier_vehicle_rates.conditions is
  'Conditions hors tarif ordinaire, écrites (A-1). Le seul champ modifiable après coup : le montant, l''unité et la date d''effet d''une version ne se réécrivent jamais (D16).';
comment on column public.supplier_vehicle_rates.deactivation_reason is
  'Motif du retrait de la version. Distinct de `reason`, qui porte le motif du changement de tarif.';

create index supplier_vehicle_rates_lookup_idx
  on public.supplier_vehicle_rates (vehicle_id, valid_from desc)
  where is_active;

create index supplier_vehicle_rates_supplier_idx
  on public.supplier_vehicle_rates (supplier_id, valid_from desc);

create trigger supplier_vehicle_rates_set_updated_at
  before update on public.supplier_vehicle_rates
  for each row execute function public.fn_set_updated_at();

create trigger supplier_vehicle_rates_no_delete
  before delete on public.supplier_vehicle_rates
  for each row execute function public.fn_forbid_delete();

/*
 * `PRICE_CHANGE`, par la fonction du LOT 20 — module `rental`.
 *
 * Le type d'événement est réservé aux tarifs depuis la migration 017 ; un
 * troisième domaine écrit désormais des prix, et il écrit le même événement.
 * Aucune fonction d'audit nouvelle n'est créée.
 */
create trigger supplier_vehicle_rates_audit
  after insert or update on public.supplier_vehicle_rates
  for each row execute function public.fn_audit_price_row('rental');


-- =============================================================================
-- 2. LA GARDE
--
-- ET LA COHÉRENCE PASSE AVANT L'ACTEUR (migration 055) : les règles de
-- cohérence sont posées AVANT tout test de capacité, faute de quoi la clé de
-- service — donc un script — les contournerait.
--
-- `SECURITY DEFINER` : cette fonction ne RENVOIE aucune ligne. Elle refuse, ou
-- laisse passer. Elle lit `vehicles` et `suppliers` pour compter la vérité, et
-- non ce que l'appelant a le droit de voir (migration 062) — un porteur de
-- `pricing.supplier.create` dépourvu de `rental.fleet.view` ne verrait aucun
-- véhicule, et la garde conclurait « véhicule introuvable » à tort. Aucune
-- fonction MÉTIER n'est `SECURITY DEFINER` (doctrine D4) : celle-ci est une
-- GARDE, comme `fn_service_write_guard`.
-- =============================================================================

create or replace function public.fn_supplier_vehicle_rate_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_origin  public.vehicle_origin;
  v_status  public.vehicle_status;
  v_current uuid;
  v_label   text;
  v_sstatus public.supplier_status;
  v_sname   text;
begin
  -- Une restauration REMET ce qui a existé : elle n'a pas à rejouer une règle
  -- de cycle de vie, ni à revalider contre l'état d'aujourd'hui un tarif qui
  -- était valide au jour où il a été écrit (migration 075).
  if public.is_restoring() then return new; end if;

  /* --- 1. UNE VERSION NE SE RÉÉCRIT PAS — D16(a) ------------------------- */
  if tg_op = 'UPDATE' then
    if new.vehicle_id    is distinct from old.vehicle_id
    or new.supplier_id   is distinct from old.supplier_id
    or new.amount        is distinct from old.amount
    or new.unit          is distinct from old.unit
    or new.currency_code is distinct from old.currency_code
    or new.valid_from    is distinct from old.valid_from
    or new.reason        is distinct from old.reason
    then
      raise exception
        'Opération refusée : le montant, l''unité, la date d''effet, le motif, le véhicule et le fournisseur d''une version de tarif ne se réécrivent pas. Retirez cette version, ou ouvrez-en une nouvelle à la date voulue.'
        using errcode = 'check_violation';
    end if;
  end if;

  /* --- 2. COHÉRENCE, pour tout acteur ------------------------------------ */
  select v.origin, v.status, v.current_supplier_id, v.brand || ' ' || v.model
    into v_origin, v_status, v_current, v_label
  from public.vehicles v
  where v.id = new.vehicle_id;

  if not found then
    raise exception 'Véhicule introuvable.' using errcode = 'no_data_found';
  end if;

  /*
   * 🟥 P-2 — LA DÉCISION MANQUE, ET LE REFUS LA NOMME.
   *
   * Un véhicule ADIKOM n'est pas automatiquement « un fournisseur » : la
   * décision A-3 le dit en mots, mais elle ne dit pas ce qu'est le coût interne
   * — tarif de référence, ou coût de revient calculé (Plan 02 §3.2). Enregistrer
   * un montant ici trancherait la question à la place de la Direction.
   *
   * Et un véhicule de PARTENARIAT n'est ni l'un ni l'autre : son coût relève des
   * conditions du partenariat, qu'aucun module ne gère encore. Le refus distingue
   * les deux cas plutôt que de les confondre sous un message unique.
   */
  if v_origin = 'PARTNERSHIP' then
    raise exception
      'Opération refusée : « % » relève d''un partenariat, non d''un fournisseur. Les conditions financières d''un partenariat ne sont pas gérées par le SaaS : aucun coût d''acquisition ne lui est enregistré.',
      v_label
      using errcode = 'check_violation';
  end if;

  if v_origin <> 'SUPPLIED' then
    raise exception
      'Opération refusée : « % » n''est pas mis à disposition par un fournisseur. Le coût de référence interne d''un véhicule ADIKOM attend une décision de la Direction (Plan 02 §3.2, point P-2) : aucun tarif ne lui est enregistré, et sa marge reste non calculée plutôt que fausse.',
      v_label
      using errcode = 'check_violation';
  end if;

  -- Le fournisseur d'une version est celui qui met — ou a mis — ce véhicule à
  -- disposition. L'historique de rattachement (migration 015) rend l'entrée
  -- rétroactive possible sans ouvrir la porte à un fournisseur étranger.
  if new.supplier_id is distinct from v_current
     and not exists (
       select 1 from public.vehicle_supplier_history h
       where h.vehicle_id = new.vehicle_id and h.supplier_id = new.supplier_id
     )
  then
    raise exception
      'Opération refusée : ce fournisseur n''a jamais mis « % » à la disposition d''ADIKOM.',
      v_label
      using errcode = 'check_violation';
  end if;

  /* --- 3. CYCLE DE VIE — à l'ouverture d'une version seulement ------------ */
  if tg_op = 'INSERT' then
    if v_status = 'RETIRED' then
      raise exception
        'Opération refusée : « % » est retiré du parc. Son historique de coûts reste consultable ; aucun tarif nouveau ne s''y ouvre.',
        v_label
        using errcode = 'check_violation';
    end if;

    select s.status, s.legal_name into v_sstatus, v_sname
    from public.suppliers s
    where s.id = new.supplier_id;

    if not found then
      raise exception 'Fournisseur introuvable.' using errcode = 'no_data_found';
    end if;

    if v_sstatus = 'ARCHIVED' then
      raise exception
        'Opération refusée : le fournisseur « % » est archivé. Réactivez-le, ou désignez celui qui met le véhicule à disposition.',
        v_sname
        using errcode = 'check_violation';
    end if;
  end if;

  /* --- 4. CAPACITÉS — deux actes distincts, deux capacités (DEC-024) ------ */
  if tg_op = 'INSERT' then
    perform public.require_capability(
      array['rental.pricing.supplier.create'], 'enregistrer un tarif fournisseur'
    );
  else
    /*
     * CLORE une version est la conséquence MÉCANIQUE d'en ouvrir une autre
     * (D16(a)) : `create` y suffit. RETIRER une version, en revanche, change le
     * coût applicable sans qu'aucune autre ne le remplace — c'est un acte à
     * part, et c'est ce que `update` gouverne. Corriger les conditions écrites
     * relève du même geste.
     */
    if new.is_active is distinct from old.is_active then
      perform public.require_capability(
        array['rental.pricing.supplier.update'], 'retirer une version de tarif fournisseur'
      );
    elsif new.conditions is distinct from old.conditions then
      perform public.require_capability(
        array['rental.pricing.supplier.update'], 'corriger les conditions d''un tarif fournisseur'
      );
    else
      perform public.require_capability(
        array['rental.pricing.supplier.create', 'rental.pricing.supplier.update'],
        'clore une version de tarif fournisseur'
      );
    end if;
  end if;

  return new;
end;
$$;

comment on function public.fn_supplier_vehicle_rate_guard() is
  'Un tarif fournisseur porte sur un véhicule FOURNI et sur un fournisseur qui l''a mis à disposition ; une version ne se réécrit pas ; retirer n''est pas clore (DEC-024). Le refus sur un véhicule ADIKOM NOMME la décision manquante P-2.';

revoke execute on function public.fn_supplier_vehicle_rate_guard() from public;

create trigger supplier_vehicle_rates_guard
  before insert or update on public.supplier_vehicle_rates
  for each row execute function public.fn_supplier_vehicle_rate_guard();


-- =============================================================================
-- 3. LE RÉSOLVEUR — D16(c) et D16(d)
--
-- `SECURITY INVOKER` (défaut), et c'est l'essentiel : un appelant dépourvu de
-- `rental.pricing.supplier.view` ne lit RIEN, parce que RLS ne lui rend rien.
-- Le résolveur n'ouvre aucune porte que la policy fermerait (doctrine D4).
--
-- LE JOUR EST COMORIEN, PAS UTC. `current_date` s'évalue en UTC : entre 21 h et
-- minuit, il désigne LA VEILLE à Moroni (DEC-025 §e).
--
-- AUCUNE VERSION APPLICABLE ⇒ AUCUNE LIGNE. Un coût absent n'est jamais un coût
-- nul : c'est ce qui empêche une marge de passer pour 100 % du tarif client.
-- =============================================================================

create or replace function public.resolve_supplier_rate(
  p_vehicle_id uuid,
  p_on         date default (now() at time zone 'Indian/Comoro')::date
)
returns table (
  rate_id       uuid,
  supplier_id   uuid,
  amount        bigint,
  unit          public.pricing_unit,
  currency_code text,
  valid_from    date,
  valid_to      date,
  conditions    text
)
language sql
stable
set search_path = public, pg_temp
as $$
  select r.id, r.supplier_id, r.amount, r.unit, r.currency_code,
         r.valid_from, r.valid_to, r.conditions
  from public.supplier_vehicle_rates r
  where r.vehicle_id = p_vehicle_id
    and r.is_active
    and r.valid_from <= p_on
    and (r.valid_to is null or r.valid_to >= p_on)
  -- La contrainte d'exclusion garantit l'unicité ; l'ordre départage une base
  -- où une version aurait été retirée puis rétablie à la même seconde.
  order by r.valid_from desc, r.created_at desc, r.id desc
  limit 1;
$$;

comment on function public.resolve_supplier_rate(uuid, date) is
  'Coût d''acquisition applicable à un véhicule à une date (D16). SECURITY INVOKER : sans `rental.pricing.supplier.view`, la policy ne rend AUCUNE ligne. Aucune version applicable ⇒ aucune ligne, jamais zéro.';

revoke execute on function public.resolve_supplier_rate(uuid, date) from public, anon;
grant  execute on function public.resolve_supplier_rate(uuid, date) to authenticated, service_role;


-- =============================================================================
-- 4. LES ACTES — ouvrir une version, en retirer une
--
-- CHANGER UN TARIF, C'EST CLORE ET OUVRIR — D16(a). Ces fonctions sont le seul
-- chemin applicatif : elles enchaînent la clôture et l'ouverture dans une même
-- transaction, ce qu'un écran ne saurait garantir.
--
-- POURQUOI `rental.pricing.supplier.view` EST EXIGÉE EN PLUS
--
-- Une écriture sous RLS LIT d'abord les lignes qu'elle vise, et un
-- `insert … returning` exige la policy de lecture. Sans elle, la clôture de la
-- version courante ne toucherait AUCUNE ligne, en silence, et deux versions se
-- retrouveraient ouvertes — ou la contrainte d'exclusion refuserait l'écriture
-- sans que personne comprenne pourquoi. La capacité est donc exigée nommément,
-- puis L'EFFET est vérifié plutôt que supposé (leçon DEC-046).
-- =============================================================================

create or replace function public.set_supplier_vehicle_rate(
  p_vehicle_id  uuid,
  p_supplier_id uuid    default null,
  p_amount      bigint  default null,
  p_unit        public.pricing_unit default 'DAY',
  p_valid_from  date    default null,
  p_conditions  text    default null,
  p_reason      text    default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_on       date := coalesce(p_valid_from, (now() at time zone 'Indian/Comoro')::date);
  v_supplier uuid := p_supplier_id;
  v_next     date;
  v_id       uuid;
begin
  perform public.require_capability(
    array['rental.pricing.supplier.create'], 'enregistrer un tarif fournisseur'
  );
  -- Écrire une chronologie suppose de la lire : sans cette capacité, la clôture
  -- de la version courante ne modifierait rien et ne dirait rien.
  perform public.require_capability(
    array['rental.pricing.supplier.view'], 'lire la chronologie des tarifs fournisseurs'
  );

  if p_amount is null or p_amount <= 0 then
    raise exception 'Le montant d''un tarif fournisseur doit être strictement positif.'
      using errcode = 'check_violation';
  end if;

  if p_unit is null then
    raise exception 'Un tarif fournisseur porte toujours son unité : par jour, ou forfait.'
      using errcode = 'check_violation';
  end if;

  -- Le fournisseur par défaut est celui qui met le véhicule à disposition
  -- aujourd'hui. La garde vérifie ensuite qu'il est bien rattaché au véhicule.
  if v_supplier is null then
    select v.current_supplier_id into v_supplier
    from public.vehicles v where v.id = p_vehicle_id;
  end if;

  if v_supplier is null then
    raise exception
      'Opération refusée : aucun fournisseur n''est rattaché à ce véhicule. Un coût d''acquisition suppose de savoir à qui ADIKOM le paie.'
      using errcode = 'check_violation';
  end if;

  -- Une version qui DÉBUTE ce jour-là ne se clôt pas la veille : la période
  -- deviendrait négative. L'écran doit dire lequel des deux actes est demandé.
  if exists (
    select 1 from public.supplier_vehicle_rates
    where vehicle_id = p_vehicle_id and is_active and valid_from = v_on
  ) then
    raise exception
      'Opération refusée : une version de tarif débute déjà le %. Retirez-la, ou choisissez une autre date d''effet.',
      to_char(v_on, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;

  -- 1. Clore la version qui couvre la date d'effet — la veille.
  update public.supplier_vehicle_rates
     set valid_to = v_on - 1
   where vehicle_id = p_vehicle_id
     and is_active
     and valid_from < v_on
     and (valid_to is null or valid_to >= v_on);

  -- 2. Une version ULTÉRIEURE déjà saisie borne la nouvelle : préparer le tarif
  --    du 1er octobre ne doit pas effacer celui du 1er décembre.
  select min(valid_from) into v_next
  from public.supplier_vehicle_rates
  where vehicle_id = p_vehicle_id and is_active and valid_from > v_on;

  insert into public.supplier_vehicle_rates
    (vehicle_id, supplier_id, amount, unit, valid_from, valid_to,
     conditions, reason, created_by, updated_by)
  values
    (p_vehicle_id, v_supplier, p_amount, p_unit, v_on,
     case when v_next is null then null else v_next - 1 end,
     nullif(btrim(coalesce(p_conditions, '')), ''),
     nullif(btrim(coalesce(p_reason, '')), ''),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.set_supplier_vehicle_rate(uuid, uuid, bigint, public.pricing_unit, date, text, text) is
  'Ouvre une version de coût d''acquisition à une date d''effet, en closant la version courante. Ne réécrit jamais un montant (D16(a)). Une date future est acceptée.';

revoke execute on function public.set_supplier_vehicle_rate(uuid, uuid, bigint, public.pricing_unit, date, text, text) from public, anon;
grant  execute on function public.set_supplier_vehicle_rate(uuid, uuid, bigint, public.pricing_unit, date, text, text) to authenticated, service_role;


-- --- Retirer une version ------------------------------------------------------
--
-- D16 : « Aucune suppression. Une version se clôt ou se retire. » La version
-- reste lisible, avec son auteur, son motif et la raison de son retrait.

create or replace function public.deactivate_supplier_vehicle_rate(
  p_rate_id uuid,
  p_reason  text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_touched int;
begin
  perform public.require_capability(
    array['rental.pricing.supplier.update'], 'retirer une version de tarif fournisseur'
  );
  perform public.require_capability(
    array['rental.pricing.supplier.view'], 'lire la chronologie des tarifs fournisseurs'
  );

  update public.supplier_vehicle_rates
     set is_active           = false,
         deactivated_at      = now(),
         deactivated_by      = public.current_actor(),
         deactivation_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_by          = public.current_actor()
   where id = p_rate_id
     and is_active;

  get diagnostics v_touched = row_count;

  -- L'EFFET, pas l'intention : une policy manquante rendrait zéro ligne sans
  -- lever d'erreur, et l'appelant croirait l'opération faite (DEC-046).
  if v_touched = 0 then
    raise exception
      'Opération refusée : cette version de tarif est introuvable, déjà retirée, ou hors de portée.'
      using errcode = 'no_data_found';
  end if;
end;
$$;

comment on function public.deactivate_supplier_vehicle_rate(uuid, text) is
  'Retire une version de coût d''acquisition sans la supprimer. Le motif du retrait est distinct de celui du changement de tarif.';

revoke execute on function public.deactivate_supplier_vehicle_rate(uuid, text) from public, anon;
grant  execute on function public.deactivate_supplier_vehicle_rate(uuid, text) to authenticated, service_role;


-- =============================================================================
-- 5. RLS — LA GARANTIE CENTRALE DU LOT
--
-- `rental.fleet.view`, `rental.pricing.view`, `parties.suppliers.view` et
-- `rental.rentals.financial.view` N'APPARAISSENT PAS dans la policy de lecture,
-- et c'est tout l'objet de la table séparée : un exploitant qui gère le parc,
-- une grille tarifaire ou une location NE VOIT PAS ce qu'ADIKOM paie au
-- fournisseur (Plan 02 §6.3, consigne §15).
--
-- `has_permission(...)` est ENVELOPPÉE DANS UN SOUS-SELECT : une garde de RLS
-- s'évalue PAR LIGNE, et l'appel coûterait sinon un aller-retour par ligne de la
-- liste (migration 065).
-- =============================================================================

revoke all    on public.supplier_vehicle_rates from anon;
revoke delete on public.supplier_vehicle_rates from authenticated;

alter table public.supplier_vehicle_rates enable row level security;

create policy supplier_vehicle_rates_select on public.supplier_vehicle_rates
  for select to authenticated
  using ((select public.has_permission('rental.pricing.supplier.view')));

create policy supplier_vehicle_rates_insert on public.supplier_vehicle_rates
  for insert to authenticated
  with check ((select public.has_permission('rental.pricing.supplier.create')));

-- La policy dit qui peut écrire dans la table ; le déclencheur dit qui peut
-- accomplir CET acte — clore, retirer, corriger (DEC-024).
create policy supplier_vehicle_rates_update on public.supplier_vehicle_rates
  for update to authenticated
  using (
    (select public.has_permission('rental.pricing.supplier.create'))
    or (select public.has_permission('rental.pricing.supplier.update'))
  )
  with check (
    (select public.has_permission('rental.pricing.supplier.create'))
    or (select public.has_permission('rental.pricing.supplier.update'))
  );


-- =============================================================================
-- 6. LE JOURNAL N'OUVRE PAS CE QUE LA TABLE FERME — DEC-038
--
-- `users.audit.view` donne l'ÉVÉNEMENT. La donnée métier d'un événement reste
-- derrière la lecture de l'objet concerné. Un type d'objet absent de cette
-- correspondance se referme sur le seul Super Admin : le défaut serait sûr, mais
-- SILENCIEUX — et un coût fournisseur serait alors invisible même à qui a le
-- droit de le voir.
--
-- LE POINT QUI COMPTE : `supplier_vehicle_rates` s'ouvre par
-- `rental.pricing.supplier.view`, JAMAIS par `rental.pricing.view` ni par
-- `rental.fleet.view`. Sans cela, le journal rendrait par la bande ce que la
-- table refuse.
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
    -- Un coût d'acquisition garde SA lecture jusque dans le journal : consulter
    -- la grille tarifaire n'a jamais ouvert ce qu'ADIKOM paie (DEC-024, DEC-044).
    when 'supplier_vehicle_rates'         then 'rental.pricing.supplier.view'
    when 'reservations'                   then 'rental.reservations.view'
    when 'rentals'                        then 'rental.rentals.view'
    when 'rental_inspections'             then 'rental.rentals.view'
    when 'rental_inspection_photos'       then 'rental.rentals.view'
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
-- 7. LES QUATRE CAPACITÉS
--
-- La liste de colonnes ouvre par `(code, module_code` : c'est la forme que le
-- contrôle de parité TS/SQL (`permissions.test.ts`) reconnaît pour rejouer le
-- catalogue sans interpréter du SQL.
--
-- Sous-menu `supplier` du menu `pricing` existant. AUCUN code existant n'est
-- modifié : un code attribué ne se touche pas (Plan 02 §20.1, garantie n° 6).
--
-- CE QUI N'EST PAS CRÉÉ, ET POURQUOI
--
--   · `rental.pricing.supplier.margin.view` — une marge est la différence de
--     DEUX GRANDEURS DÉJÀ GOUVERNÉES (`.supplier.view` et
--     `rental.rentals.financial.view`). Une capacité de plus ne fermerait RIEN,
--     et une permission qui ne débloque rien ne s'attribue pas (CLAUDE.md
--     §19 bis, Plan 02 §10.3) ;
--   · `.download` / `.print` — aucun document n'est produit par ce lot, et un
--     coût d'acquisition ne figure sur AUCUN document remis à un tiers (§6.4) ;
--   · `.archive` / `.delete` — rien ne se supprime ; une version se retire sous
--     `.update` ;
--   · `.history.view` — l'historique vit dans une table DÉJÀ gardée par
--     `.supplier.view`. Rien de plus à fermer.
--
-- Catalogue : 191 → 195.
-- =============================================================================

with nouvelles (
  code, module_code, menu_code, menu_label, submenu_code, submenu_label,
  action, label, rang
) as (values
  ('rental.pricing.supplier.view',   'rental', 'pricing', 'Tarification',
   'supplier', 'Tarifs fournisseurs', 'VIEW',
   'Consulter les coûts d''acquisition fournisseurs', 1),
  ('rental.pricing.supplier.create', 'rental', 'pricing', 'Tarification',
   'supplier', 'Tarifs fournisseurs', 'CREATE',
   'Enregistrer un tarif fournisseur', 2),
  ('rental.pricing.supplier.update', 'rental', 'pricing', 'Tarification',
   'supplier', 'Tarifs fournisseurs', 'UPDATE',
   'Retirer ou corriger un tarif fournisseur', 3),
  ('rental.pricing.supplier.export', 'rental', 'pricing', 'Tarification',
   'supplier', 'Tarifs fournisseurs', 'EXPORT',
   'Exporter les tarifs fournisseurs', 7)
)
insert into public.permissions (
  code, module_code, module_label, menu_code, menu_label,
  submenu_code, submenu_label, action, label, is_sensitive,
  module_order, menu_order, submenu_order, action_order
)
select
  n.code,
  n.module_code,
  'Gestion de location',
  n.menu_code,
  n.menu_label,
  n.submenu_code,
  n.submenu_label,
  n.action::public.permission_action,
  n.label,
  -- LES QUATRE SONT SENSIBLES : le coût fournisseur est confidentiel (A-2).
  true,
  5,
  6,
  8,
  n.rang
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
-- 8. CONTRÔLES DE NON-RÉGRESSION
--
-- LE TOTAL DU CATALOGUE EST AFFIRMÉ ICI, ET NULLE PART AILLEURS (DEC-046).
-- Une migration énonce un fait DATÉ — le total au moment où elle s'applique — et
-- n'a jamais à être rouverte. Les recettes, elles, nomment les capacités
-- qu'elles éprouvent.
-- =============================================================================

do $$
declare
  v_total     int;
  v_attendu   text[] := array[
    'rental.pricing.supplier.view',
    'rental.pricing.supplier.create',
    'rental.pricing.supplier.update',
    'rental.pricing.supplier.export'
  ];
  v_manquantes text[];
  v_inconnues  text[];
  v_qual       text;
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 195 then
    raise exception 'Catalogue attendu à 195 permissions, obtenu %.', v_total;
  end if;

  select array_agg(c) into v_manquantes
  from unnest(v_attendu) c
  where not exists (select 1 from public.permissions p where p.code = c);

  if v_manquantes is not null then
    raise exception 'Capacités du LOT 21 absentes du catalogue : %', v_manquantes;
  end if;

  -- AUCUNE capacité inventée sous le sous-menu du lot : ni marge, ni document,
  -- ni suppression (CLAUDE.md §19 bis).
  select array_agg(p.code) into v_inconnues
  from public.permissions p
  where p.code like 'rental.pricing.supplier.%'
    and not (p.code = any (v_attendu));

  if v_inconnues is not null then
    raise exception
      'Capacité créée sans fonctionnalité correspondante : %', v_inconnues;
  end if;

  -- Les quatre sont sensibles : le coût fournisseur est confidentiel (A-2).
  if exists (
    select 1 from public.permissions
    where code = any (v_attendu) and is_sensitive is not true
  ) then
    raise exception 'Une capacité de tarif fournisseur n''est pas marquée sensible.';
  end if;

  -- La table existe, RLS active.
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'supplier_vehicle_rates'
  ) then
    raise exception 'Table supplier_vehicle_rates absente.';
  end if;

  if not (select relrowsecurity from pg_class
          where oid = 'public.supplier_vehicle_rates'::regclass) then
    raise exception 'RLS non activée sur supplier_vehicle_rates.';
  end if;

  /*
   * LA GARANTIE CENTRALE DU LOT : la lecture des coûts ne cite QUE sa capacité.
   *
   * Si `rental.pricing.view`, `rental.fleet.view`, `parties.suppliers.view` ou
   * `rental.rentals.financial.view` y figuraient, la table séparée ne servirait
   * plus à rien.
   */
  select qual into v_qual
  from pg_policies
  where schemaname = 'public' and tablename = 'supplier_vehicle_rates'
    and policyname = 'supplier_vehicle_rates_select';

  if v_qual is null or v_qual not like '%rental.pricing.supplier.view%' then
    raise exception
      'La lecture des tarifs fournisseurs doit dépendre de `rental.pricing.supplier.view`.';
  end if;

  if v_qual like '%''rental.pricing.view''%'
  or v_qual like '%rental.fleet.view%'
  or v_qual like '%parties.suppliers.view%'
  or v_qual like '%rental.rentals.financial.view%' then
    raise exception
      'La lecture des tarifs fournisseurs ne doit dépendre QUE de `rental.pricing.supplier.view` : %', v_qual;
  end if;

  -- La contrainte d'exclusion, sans laquelle deux saisies simultanées
  -- créeraient deux coûts valides au même moment (DEC-028).
  if not exists (
    select 1 from pg_constraint
    where conname = 'supplier_vehicle_rates_no_overlap' and contype = 'x'
  ) then
    raise exception 'La contrainte d''exclusion de chevauchement est absente.';
  end if;

  -- DOCTRINE D4 : aucun résolveur, aucun acte métier en SECURITY DEFINER.
  if exists (
    select 1 from pg_proc
    where oid in (
      'public.resolve_supplier_rate(uuid, date)'::regprocedure,
      'public.set_supplier_vehicle_rate(uuid, uuid, bigint, public.pricing_unit, date, text, text)'::regprocedure,
      'public.deactivate_supplier_vehicle_rate(uuid, text)'::regprocedure
    )
    and prosecdef
  ) then
    raise exception 'Une fonction métier du LOT 21 est SECURITY DEFINER (doctrine D4).';
  end if;

  -- Le journal n'ouvre pas ce que la table ferme.
  if public.audit_detail_permission('supplier_vehicle_rates')
     is distinct from 'rental.pricing.supplier.view' then
    raise exception
      'Le détail d''un tarif fournisseur au journal doit exiger `rental.pricing.supplier.view`.';
  end if;

  -- Les acquis du LOT 20 n'ont pas bougé en chemin.
  if public.audit_detail_permission('service_variant_costs')
     is distinct from 'catalog.services.cost.view' then
    raise exception 'La cartographie du journal du LOT 20 a été altérée.';
  end if;

  /*
   * La contrainte du parc N'A PAS été touchée : un véhicule ADIKOM ne devient
   * pas « fourni » (Plan 02 §3.2, voie (a) refusée).
   *
   * Le nom est celui de la migration 025, non celui que cite le Plan 02 : la
   * contrainte de la migration 015 a été REMPLACÉE lorsque les partenariats sont
   * arrivés. Vérifier un nom périmé n'aurait rien vérifié du tout.
   */
  if not exists (
    select 1 from pg_constraint
    where conname = 'vehicles_origin_attachment_coherent' and contype = 'c'
  ) then
    raise exception
      'La contrainte `vehicles_origin_attachment_coherent` a disparu : le LOT 21 ne doit pas y toucher.';
  end if;

  raise notice
    '[OK] 083. Catalogue à 195 ; tarifs fournisseurs datés, gardés par leur propre capacité, P-2 non tranchée.';
end $$;
