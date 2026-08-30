-- =============================================================================
-- ADIKOM PILOT — 046 · Imputation fournisseur
-- Étape 2.4 (DEC-021), LOT 4
--
-- CE QUE CETTE MIGRATION POSE
--
-- Le dernier maillon de la chaîne « Dommages → Incidents → Maintenance →
-- Imputation fournisseur » : la décision, distincte de la dépense, de déduire
-- tout ou partie d'un coût de maintenance du montant dû à un fournisseur.
--
--   Workflow 06 §2 : « Il ne faut jamais considérer qu'une maintenance crée
--   automatiquement une imputation. » La maintenance CONSTATE et CHIFFRE ;
--   l'imputation DÉCIDE de la part déduite. Deux actes, deux tables, deux jeux
--   de capacités.
--
-- OÙ S'ARRÊTE LE LOT 4 — ET POURQUOI IL S'Y ARRÊTE
--
-- DEC-013 : « Le montant dû est réduit UNIQUEMENT lorsque l'imputation est au
-- statut `Imputée`, c'est-à-dire validée ET rattachée à une facture
-- fournisseur. » La facture fournisseur relève de l'Étape 2.5 et n'existe pas.
--
-- Le LOT 4 va donc jusqu'à `Validée` — ce que Workflow 06 §31 nomme une
-- « imputation en attente de facture » — et pas un pas au-delà. `IMPUTED`
-- figure dans l'énumération par fidélité à Workflow 06 §13, et la transition
-- qui y mène est REFUSÉE, explicitement, avec son motif. Même traitement que
-- les statuts dérivés de DEC-025 §a : présents, non atteignables, signalés.
--
-- CE QUE CE LOT NE FAIT PAS
--
--   · AUCUNE FACTURE FOURNISSEUR, AUCUN PAIEMENT, AUCUN SOLDE, AUCUN NET À
--     PAYER, AUCUNE CLÔTURE FINANCIÈRE. Aucune table, aucune colonne, aucun
--     calcul. Une imputation validée ne réduit rien (DEC-013).
--   · AUCUNE SECONDE SOURCE DES MONTANTS. Ni coût estimé, ni coût réel, ni
--     montant imputable ne sont recopiés ici : le LOT 3 les porte, ce lot les
--     LIT. Le reste imputable est une soustraction refaite à chaque lecture.
--   · AUCUNE VALORISATION D'UN DOMMAGE, aucune écriture dans `vehicle_incidents`
--     ni `incident_damages` (arbitrage du 26/08/2026 : constat seul).
--   · AUCUN EFFET SUR LE CALENDRIER NI SUR LE PARC. Imputer ne pose ni ne lève
--     une occupation, et ne change aucun statut de véhicule ni de maintenance.
--   · AUCUNE PERMISSION NOUVELLE. `billing.imputations.view · create · update ·
--     validate · cancel` existent depuis la migration 007, sous le commentaire
--     « opération financière la plus sensible du système (§36) ». Catalogue :
--     153, inchangé.
--   · AUCUNE RÈGLE DE NUMÉROTATION NOUVELLE. `imputation` → `IMP`, avec année,
--     six chiffres et remise à zéro annuelle, est enregistrée depuis la
--     migration 005 et n'a jamais été consommée.
--
-- LES QUATRE COUCHES DE L'AUDIT 041–042
--
--   1. FONCTION   — chaque acte vérifie SA capacité par `require_capability`.
--   2. DONNÉE     — une imputation validée fige son montant, son fournisseur,
--                   sa maintenance et sa justification (Workflow 06 §39).
--   3. TRANSITION — chaque changement de statut exige la capacité qui le
--                   légitime, ce qui couvre le `PATCH` direct hors fonction.
--   4. RLS        — lecture, création, modification, validation, annulation.
--
-- Aucune fonction n'est `SECURITY DEFINER`.
--
-- LA CONSÉQUENCE, ASSUMÉE, DE CE REFUS
--
-- Les déclencheurs s'exécutent avec les droits de l'appelant, RLS comprise. Le
-- plafond vit dans `maintenance_costs`, dont la lecture exige
-- `rental.maintenance.cost.view` ; le rattachement fournisseur vit dans
-- `vehicles`, dont la lecture exige `rental.fleet.view`. Un appelant qui ne
-- détient pas ces droits ne LIT RIEN — et le contrôle refuse, au lieu de
-- passer sur une somme muette. L'échec est donc sûr par construction : une
-- donnée invisible vaut refus, jamais autorisation tacite.
-- =============================================================================


-- --- Type ------------------------------------------------------------------------
--
-- Workflow 06 §13 — les cinq statuts documentés, et RIEN DE PLUS.
--
-- « Imputation en attente de facture » (§31) n'en est PAS un sixième : c'est la
-- lecture de `VALIDATED` + aucune facture rattachée, exactement ce que DEC-013
-- énumère. Un statut stocké ferait double emploi avec une donnée qui le dit
-- déjà, et pourrait la contredire.

do $$ begin
  create type public.imputation_status as enum (
    'DRAFT',        -- Brouillon  (§14) — préparation, librement modifiable
    'TO_VALIDATE',  -- À valider  (§15) — informations complètes
    'VALIDATED',    -- Validée    (§16) — contrôlée ; EN ATTENTE DE FACTURE (§31)
    'IMPUTED',      -- Imputée    (§17) — exige une facture : ÉTAPE 2.5
    'CANCELLED'     -- Annulée    (§18) — historisée, jamais supprimée
  );
exception when duplicate_object then null; end $$;


-- =============================================================================
-- LES IMPUTATIONS
-- =============================================================================

create table public.imputations (
  id uuid primary key default gen_random_uuid(),

  -- IMP-2026-000001 — règle `imputation` de `numbering_rules`, migration 005.
  imputation_no text not null unique,

  /*
   * §5 : « L'imputation doit obligatoirement être liée à une maintenance
   * existante. » C'est le seul rattachement structurant : le véhicule s'en
   * déduit, et le recopier ici créerait une valeur capable de contredire sa
   * source.
   */
  maintenance_id uuid not null references public.vehicle_maintenances (id) on delete restrict,

  -- §4 : le fournisseur auquel la dépense est imputée. Distinct du PRESTATAIRE
  -- de la maintenance (`provider_supplier_id`), même quand c'est la même
  -- entité (Workflow 05 §29). La cohérence est contrôlée par déclencheur (§33).
  supplier_id uuid not null references public.suppliers (id) on delete restrict,

  -- DEC-010 : entiers, en KMF. Aucun flottant, à aucun niveau.
  --
  -- §37 : c'est le « montant effectivement imputé », que la documentation
  -- distingue expressément du « montant autorisé à imputer ». Il n'en est pas
  -- la copie : il le consomme (Module 07 §40).
  amount        bigint not null check (amount > 0),
  currency_code text   not null default 'KMF',

  -- §11 et §15 : la justification permet de comprendre POURQUOI le montant a
  -- été déduit. Elle n'est pas facultative.
  justification text not null,

  status public.imputation_status not null default 'DRAFT',

  /*
   * ÉTAPE 2.5 — LE POINT D'ACCROCHE, ET RIEN DE PLUS.
   *
   * Aucune clé étrangère : `supplier_invoices` n'existe pas. Aucune valeur ne
   * peut y être écrite au LOT 4 — le déclencheur `imputations_coherence` le
   * refuse. L'Étape 2.5 posera la contrainte référentielle et ouvrira la
   * transition vers `IMPUTED`.
   */
  supplier_invoice_id uuid,
  imputed_at          timestamptz,
  imputed_by          uuid references public.app_users (id) on delete set null,

  -- §48 : distinguer qui a créé, qui a validé, qui a annulé.
  validated_at timestamptz,
  validated_by uuid references public.app_users (id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.app_users (id) on delete set null,

  status_reason     text,
  status_changed_at timestamptz,
  status_changed_by uuid references public.app_users (id) on delete set null,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  constraint imputations_justification_not_blank check (btrim(justification) <> ''),

  /*
   * DEC-013, RENDUE INFALSIFIABLE PAR LA BASE.
   *
   * « Imputée » signifie validée ET rattachée à une facture. Sans cette
   * contrainte, un `PATCH` direct pourrait déclarer une imputation « prise en
   * compte dans le montant dû » sans qu'aucune facture ne la porte — et le
   * jour où l'Étape 2.5 calculera le net à payer, elle le calculerait faux.
   */
  constraint imputations_imputed_requires_invoice check (
    status <> 'IMPUTED'
    or (supplier_invoice_id is not null and imputed_at is not null)
  ),

  -- Réciproque : une facture rattachée n'a de sens que sur une imputation
  -- effectivement imputée, ou sur celle qu'on a ensuite annulée.
  constraint imputations_invoice_requires_imputed check (
    supplier_invoice_id is null
    or status in ('IMPUTED', 'CANCELLED')
  ),

  -- §48 : un état atteint sans date d'effet est un acte que personne ne peut
  -- situer. Même exigence que `quotes_decision_dated` (LOT 3).
  constraint imputations_validation_dated check (
    status not in ('VALIDATED', 'IMPUTED') or validated_at is not null
  ),
  constraint imputations_cancellation_dated check (
    status <> 'CANCELLED' or cancelled_at is not null
  )
);

comment on table public.imputations is
  'Part d''un coût de maintenance déduite du montant dû à un fournisseur (Workflow 06). Ne réduit aucun solde tant qu''elle n''est pas « Imputée » (DEC-013).';
comment on column public.imputations.amount is
  'Montant EFFECTIVEMENT imputé (§37). Consomme le plafond `maintenance_costs.imputable_amount` ; n''en est jamais la copie.';
comment on column public.imputations.supplier_id is
  'Fournisseur auquel la dépense est imputée. Distinct du prestataire de la maintenance (Workflow 05 §29), même entité comprise.';
comment on column public.imputations.supplier_invoice_id is
  'Point d''accroche de l''Étape 2.5. Aucune FK, aucune écriture possible au LOT 4 : la facture fournisseur n''existe pas.';
comment on column public.imputations.status is
  'Workflow 06 §13. « VALIDATED » sans facture = « imputation en attente de facture » (§31) : aucun effet sur un solde.';

create index imputations_maintenance_idx on public.imputations (maintenance_id);
create index imputations_supplier_idx    on public.imputations (supplier_id, created_at desc);
create index imputations_status_idx      on public.imputations (status);
create index imputations_invoice_idx     on public.imputations (supplier_invoice_id)
  where supplier_invoice_id is not null;


-- =============================================================================
-- COUCHE 2 · LA COHÉRENCE DU DOSSIER
--
-- §33 : « Le système ne doit pas permettre une imputation incohérente entre un
-- véhicule et un fournisseur sans justification. » Le fournisseur retenu doit
-- donc être celui du véhicule — ou l'un de ceux qui l'ont fourni, ce que
-- `vehicle_supplier_history` sait dire (Règles fournisseurs §60, §62 : c'est
-- de cet historique daté que dépendent les imputations).
--
-- Un fournisseur sans aucune relation, présente ou passée, avec le véhicule est
-- exactement l'incohérence que §33 interdit.
-- =============================================================================

create or replace function public.fn_imputation_coherence()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_vehicle         uuid;
  v_mstatus         public.maintenance_status;
  v_current         uuid;
  v_seen            boolean := false;
  v_historic        boolean;
  v_invoice_changed boolean;
begin
  /*
   * L'ÉTAPE 2.5 NE S'ANTICIPE PAS.
   *
   * Rattacher une facture est un acte de l'Étape 2.5, et aucune capacité ne lui
   * correspond aujourd'hui — la désigner reviendrait à inventer une règle sur
   * un objet inexistant (même traitement que `TO_INVOICE → INVOICED`,
   * migration 041). L'écriture est donc refusée, et le motif est dit.
   */
  if tg_op = 'INSERT' then
    v_invoice_changed := new.supplier_invoice_id is not null;
  else
    v_invoice_changed := new.supplier_invoice_id is not null
                         and new.supplier_invoice_id is distinct from old.supplier_invoice_id;
  end if;

  if v_invoice_changed then
    raise exception
      'Opération refusée : le rattachement d''une imputation à une facture fournisseur relève de l''Étape 2.5. Aucune facture fournisseur n''existe encore.'
      using errcode = 'check_violation';
  end if;

  /*
   * LE DOSSIER NE SE REVÉRIFIE QUE S'IL CHANGE.
   *
   * Ce contrôle LIT la maintenance et le véhicule, dont la lecture exige
   * `rental.maintenance.view` et `rental.fleet.view`. Le rejouer à chaque
   * changement de STATUT imposerait ces deux droits au valideur et à celui qui
   * annule — c'est-à-dire ferait dépendre un acte de capacités qui ne le
   * concernent pas, exactement ce que DEC-024 proscrit. Le rattachement, lui,
   * ne peut plus bouger une fois l'imputation validée (§39).
   */
  if tg_op = 'UPDATE' then
    if new.maintenance_id is not distinct from old.maintenance_id
       and new.supplier_id is not distinct from old.supplier_id then
      return new;
    end if;
  end if;

  select m.vehicle_id, m.status
    into v_vehicle, v_mstatus
  from public.vehicle_maintenances m
  where m.id = new.maintenance_id;

  -- Introuvable, ou invisible faute de `rental.maintenance.view` : même
  -- réponse, afin de ne rien apprendre à qui n'a pas le droit de savoir
  -- (DEC-017).
  if v_vehicle is null then
    raise exception
      'La maintenance visée est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  -- §3 : la dépense doit être identifiable. Une intervention annulée n'en
  -- produit aucune.
  if v_mstatus = 'CANCELLED' then
    raise exception
      'Opération refusée : une maintenance annulée ne donne lieu à aucune imputation.'
      using errcode = 'check_violation';
  end if;

  select true, v.current_supplier_id
    into v_seen, v_current
  from public.vehicles v
  where v.id = v_vehicle;

  if not v_seen then
    raise exception
      'Le véhicule de cette maintenance n''est pas lisible avec vos droits : le rattachement fournisseur ne peut pas être vérifié.'
      using errcode = 'insufficient_privilege';
  end if;

  select exists (
    select 1 from public.vehicle_supplier_history h
    where h.vehicle_id = v_vehicle and h.supplier_id = new.supplier_id
  ) into v_historic;

  if v_current is null and not v_historic then
    raise exception
      'Opération refusée : ce véhicule n''est mis à disposition par aucun fournisseur. La dépense reste à la charge d''ADIKOM (Workflow 06 §4).'
      using errcode = 'check_violation';
  end if;

  if new.supplier_id is distinct from v_current and not v_historic then
    raise exception
      'Opération refusée : ce fournisseur n''a jamais mis ce véhicule à disposition. L''imputation serait incohérente (Workflow 06 §33).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_imputation_coherence is
  'Vérifie que le fournisseur imputé a, ou a eu, ce véhicule à disposition (§33), que la maintenance n''est pas annulée, et qu''aucune facture n''est rattachée avant l''Étape 2.5.';


-- =============================================================================
-- COUCHE 2 · LE PLAFOND
--
-- Module 07 §40 : « Le système doit empêcher que le montant total des
-- imputations dépasse le montant imputable. »
-- Module 07 §41 : « Le contrôle doit être effectué côté serveur. »
-- Module 05 §46 : « Une dépense ne doit pas être imputée deux fois. »
--
-- La somme EXCLUT les imputations annulées : §40 pose que l'annulation
-- réintègre le montant, et §54 le montre chiffré (« Montant final imputé :
-- 0 KMF »). Le plafond redevient donc disponible.
--
-- Le plafond est LU dans `maintenance_costs`, jamais recopié. Sa lecture exige
-- `rental.maintenance.cost.view` : sans ce droit, la requête ne renvoie rien et
-- l'opération est REFUSÉE. C'est le seul comportement acceptable — un plafond
-- invisible n'est pas un plafond infini.
-- =============================================================================

create or replace function public.fn_imputation_ceiling()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ceiling bigint;
  v_others  bigint;
begin
  -- Une imputation annulée ne consomme plus rien : elle sort du calcul, et
  -- rien ne s'oppose à son annulation.
  if new.status = 'CANCELLED' then
    return new;
  end if;

  /*
   * LE PLAFOND CONTRAINT UN MONTANT, PAS UN STATUT.
   *
   * Le rejouer à chaque changement d'état exigerait
   * `rental.maintenance.cost.view` du valideur, dont ce n'est pas la capacité.
   * Le montant, lui, ne peut plus changer une fois l'imputation validée (§39) :
   * ce qui a été contrôlé le reste.
   */
  if tg_op = 'UPDATE' then
    if new.amount is not distinct from old.amount
       and new.maintenance_id is not distinct from old.maintenance_id then
      return new;
    end if;
  end if;

  select c.imputable_amount into v_ceiling
  from public.maintenance_costs c
  where c.maintenance_id = new.maintenance_id;

  if v_ceiling is null then
    raise exception
      'Opération refusée : aucun montant imputable n''a été arrêté pour cette maintenance, ou il n''est pas lisible avec vos droits.'
      using errcode = 'check_violation';
  end if;

  -- Workflow 06 §10 : montant imputable nul = « charge supportée par ADIKOM ».
  -- Aucune imputation fournisseur n'est créée.
  if v_ceiling = 0 then
    raise exception
      'Opération refusée : le montant imputable de cette maintenance est nul. La dépense reste à la charge d''ADIKOM (Workflow 06 §10).'
      using errcode = 'check_violation';
  end if;

  select coalesce(sum(i.amount), 0) into v_others
  from public.imputations i
  where i.maintenance_id = new.maintenance_id
    and i.status <> 'CANCELLED'
    and i.id <> new.id;

  if v_others + new.amount > v_ceiling then
    raise exception
      'Opération refusée : le total imputé (% KMF) dépasserait le montant imputable de cette maintenance (% KMF).',
      v_others + new.amount, v_ceiling
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_imputation_ceiling is
  'Σ des imputations non annulées ≤ `maintenance_costs.imputable_amount` (Module 07 §40 et §41). Un plafond illisible ou non arrêté vaut refus.';


-- =============================================================================
-- COUCHE 3 · LES TRANSITIONS, ET LE VERROU DE §39
--
-- « Une permission dit qui peut agir, une transition dit ce qui a un sens »
-- (DEC-025 §k). Chaque changement de statut exige ici la capacité qui le
-- légitime : c'est ce qui protège le `PATCH` direct, lequel ne rencontre
-- aucune garde serveur (leçon de la migration 041).
--
-- §38 : tant qu'elle n'est pas validée, l'imputation se modifie.
-- §39 : « Une imputation validée ne doit pas pouvoir être modifiée librement. »
--       Le verrou est donc porté par la BASE, et il n'existe aucun chemin de
--       déverrouillage. Reste l'annulation (§40), qui conserve l'historique.
-- =============================================================================

create or replace function public.fn_imputation_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then

    /*
     * `VALIDATED → IMPUTED` : LA FRONTIÈRE DE L'ÉTAPE 2.5.
     *
     * DEC-013 fait de « Imputée » le seul statut qui réduise un montant dû, et
     * l'assortit d'une condition — une facture fournisseur rattachée — qu'aucun
     * objet du système ne peut aujourd'hui remplir. Aucune capacité ne porte
     * cet acte, et en désigner une reviendrait à inventer une règle.
     *
     * La transition est donc refusée, et son motif est dit. L'Étape 2.5
     * remplacera ce déclencheur et rattachera l'acte à sa capacité.
     */
    if old.status = 'VALIDATED' and new.status = 'IMPUTED' then
      raise exception
        'Opération refusée : passer une imputation à « Imputée » suppose une facture fournisseur, qui relève de l''Étape 2.5. L''imputation reste en attente de facture.'
        using errcode = 'check_violation';
    end if;

    case
      when old.status = 'DRAFT' and new.status = 'TO_VALIDATE' then
        perform public.require_capability(
          array['billing.imputations.update'], 'soumettre une imputation à validation'
        );

      when old.status = 'TO_VALIDATE' and new.status = 'DRAFT' then
        perform public.require_capability(
          array['billing.imputations.update'], 'remettre une imputation en préparation'
        );

      when old.status = 'TO_VALIDATE' and new.status = 'VALIDATED' then
        perform public.require_capability(
          array['billing.imputations.validate'], 'valider une imputation'
        );

      when old.status in ('DRAFT', 'TO_VALIDATE', 'VALIDATED')
           and new.status = 'CANCELLED' then
        perform public.require_capability(
          array['billing.imputations.cancel'], 'annuler une imputation'
        );

      else
        raise exception
          'Transition d''imputation refusée : % ne peut pas devenir %.', old.status, new.status
          using errcode = 'check_violation';
    end case;
  end if;

  /*
   * COUCHE 2 — §39 : une imputation validée, imputée ou annulée fige ce qui
   * fonde la déduction. En changer le montant après coup reviendrait à changer
   * ce sur quoi la validation a porté.
   */
  if old.status in ('VALIDATED', 'IMPUTED', 'CANCELLED')
     and (new.amount         is distinct from old.amount
       or new.supplier_id    is distinct from old.supplier_id
       or new.maintenance_id is distinct from old.maintenance_id
       or new.justification  is distinct from old.justification) then
    raise exception
      'Opération refusée : une imputation validée, imputée ou annulée ne se modifie plus. Son annulation, elle, reste possible et conserve l''historique.'
      using errcode = 'check_violation';
  end if;

  -- §38 : modifier une imputation encore en préparation relève de `update`.
  if old.status in ('DRAFT', 'TO_VALIDATE')
     and (new.amount        is distinct from old.amount
       or new.supplier_id   is distinct from old.supplier_id
       or new.justification is distinct from old.justification) then
    perform public.require_capability(
      array['billing.imputations.update'], 'modifier une imputation'
    );
  end if;

  return new;
end;
$$;

comment on function public.fn_imputation_transition is
  'Chaque transition exige SA capacité, y compris par PATCH direct (migration 041). « Imputée » reste hors d''atteinte : elle suppose une facture (Étape 2.5).';


create trigger imputations_coherence
  before insert or update on public.imputations
  for each row execute function public.fn_imputation_coherence();

create trigger imputations_ceiling
  before insert or update on public.imputations
  for each row execute function public.fn_imputation_ceiling();

create trigger imputations_transition
  before update on public.imputations
  for each row execute function public.fn_imputation_transition();

create trigger imputations_updated_at
  before update on public.imputations
  for each row execute function public.fn_set_updated_at();

create trigger imputations_audit
  after insert or update on public.imputations
  for each row execute function public.fn_audit_row('billing');

create trigger imputations_no_delete
  before delete on public.imputations
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- LE PLAFOND NE PEUT PLUS DESCENDRE SOUS CE QU'IL A DÉJÀ AUTORISÉ
--
-- Le LOT 3 laisse `imputable_amount` modifiable tant que la maintenance n'est
-- ni terminée ni annulée. Sans ce contrôle, l'abaisser après coup ferait passer
-- rétroactivement le total imputé au-dessus du plafond — c'est-à-dire violer
-- Module 07 §40 sans qu'aucune imputation n'ait bougé.
--
-- Le contrôle suppose de LIRE les imputations. Sans `billing.imputations.view`,
-- la somme serait muette et le plafond tomberait sans que rien ne s'y oppose :
-- l'abaissement est donc REFUSÉ, jamais accordé à l'aveugle.
-- =============================================================================

create or replace function public.fn_imputable_floor()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_used bigint;
begin
  -- Migration, script d'environnement, rôle de service : pas de session
  -- applicative (convention de la migration 021).
  if public.current_actor() is null then
    return new;
  end if;

  if new.imputable_amount is not distinct from old.imputable_amount then
    return new;
  end if;

  -- Seul un ABAISSEMENT — ou un effacement — peut invalider l'existant.
  if old.imputable_amount is not null
     and new.imputable_amount is not null
     and new.imputable_amount >= old.imputable_amount then
    return new;
  end if;

  if not public.has_permission('billing.imputations.view') then
    raise exception
      'Opération refusée : abaisser le montant imputable exige de pouvoir consulter les imputations déjà enregistrées.'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(sum(i.amount), 0) into v_used
  from public.imputations i
  where i.maintenance_id = new.maintenance_id
    and i.status <> 'CANCELLED';

  if v_used > 0 and (new.imputable_amount is null or new.imputable_amount < v_used) then
    raise exception
      'Opération refusée : % KMF sont déjà imputés sur cette maintenance. Le montant imputable ne peut pas descendre en dessous.', v_used
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_imputable_floor is
  'Interdit d''abaisser `imputable_amount` sous le total déjà imputé (Module 07 §40). Sans le droit de lire les imputations, l''abaissement est refusé.';

create trigger maintenance_costs_imputable_floor
  before update on public.maintenance_costs
  for each row execute function public.fn_imputable_floor();


-- =============================================================================
-- LES JUSTIFICATIFS — §35
--
-- Aucun second système de fichiers : le bucket PRIVÉ `vehicle-documents`, un
-- préfixe dédié `imputations/{imputationId}/`, une route qui vérifie la
-- capacité puis délivre une URL signée de courte durée. Aucune URL permanente
-- n'est stockée, et rien ne se supprime — `is_archived`, comme partout.
--
-- Le type de document est celui du LOT 3 : les pièces citées par §35 — facture
-- du garage, reçu, devis, bon de réparation, rapport d'intervention — y sont
-- toutes, et « document contractuel » relève d'`OTHER`, que §35 prévoit
-- lui-même sous « autre justificatif ». Créer un second type parallèle
-- diviserait la même information en deux vocabulaires.
-- =============================================================================

create table public.imputation_documents (
  id            uuid primary key default gen_random_uuid(),
  imputation_id uuid not null references public.imputations (id) on delete cascade,

  doc_type public.maintenance_document_type not null,
  label    text not null,

  storage_path text not null,
  file_name    text not null,
  file_size    bigint check (file_size is null or file_size >= 0),
  mime_type    text,

  is_archived boolean not null default false,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  constraint imputation_documents_label_not_blank check (btrim(label) <> '')
);

comment on table public.imputation_documents is
  'Justificatifs d''une imputation (§35). `storage_path` désigne un objet du bucket PRIVÉ ; aucune URL n''est conservée.';
comment on column public.imputation_documents.storage_path is
  'Chemin sous le préfixe imputations/{imputationId}/. Jamais exposé au navigateur (DEC-025 §f).';

create index imputation_documents_imputation_idx
  on public.imputation_documents (imputation_id)
  where not is_archived;

-- §38 et §39 : les documents accompagnent la PRÉPARATION. Une fois l'imputation
-- validée, la pièce qui la fonde ne change plus — sans quoi la validation
-- aurait porté sur autre chose que ce que le dossier montre.
create or replace function public.fn_imputation_documents_locked()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status public.imputation_status;
begin
  select i.status into v_status
  from public.imputations i
  where i.id = new.imputation_id;

  if v_status is null then
    raise exception
      'L''imputation visée est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if v_status <> 'DRAFT' and v_status <> 'TO_VALIDATE' then
    raise exception
      'Opération refusée : les justificatifs d''une imputation validée, imputée ou annulée sont figés (Workflow 06 §39).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_imputation_documents_locked is
  'Fige les justificatifs dès que l''imputation quitte la préparation (§38, §39). Aucun déverrouillage n''existe.';

create trigger imputation_documents_locked
  before insert or update on public.imputation_documents
  for each row execute function public.fn_imputation_documents_locked();

create trigger imputation_documents_updated_at
  before update on public.imputation_documents
  for each row execute function public.fn_set_updated_at();

create trigger imputation_documents_audit
  after insert or update on public.imputation_documents
  for each row execute function public.fn_audit_row('billing');

create trigger imputation_documents_no_delete
  before delete on public.imputation_documents
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- COUCHE 1 · LES FONCTIONS
--
-- Chacune vérifie la capacité qu'elle incarne AVANT d'engager le travail. Ce
-- n'est pas redondant avec RLS : la policy dit qui peut écrire dans la table,
-- ceci dit qui peut accomplir CET acte — la leçon de l'audit 041.
--
-- Aucune n'est `SECURITY DEFINER` : elles s'exécutent avec les droits de
-- l'appelant, RLS comprise.
-- =============================================================================

/**
 * Prépare une imputation — §11, §14.
 *
 * POURQUOI `rental.maintenance.cost.view` EST EXIGÉE EN PLUS.
 *
 * Le contrôle du plafond (Module 07 §41) LIT `maintenance_costs`, dont la
 * lecture est réservée à cette capacité. Un créateur qui ne l'aurait pas ne
 * verrait aucun plafond — et le contrôle refuserait, sans que rien n'explique
 * pourquoi. L'exiger ici rend la règle lisible plutôt que subie : on n'impute
 * pas une dépense qu'on n'a pas le droit de voir.
 *
 * Ce n'est PAS une capacité impliquée par une autre (DEC-024) : les deux sont
 * attribuées séparément, et la fonction exige les deux, nommément.
 */
create or replace function public.create_imputation(
  p_maintenance_id uuid,
  p_supplier_id    uuid,
  p_amount         bigint,
  p_justification  text
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id        uuid;
  v_no        text;
  v_ceiling   bigint;
  v_found     boolean := false;
  v_supplier  uuid := p_supplier_id;
  v_vehicle   uuid;
  v_mstatus   public.maintenance_status;
begin
  perform public.require_capability(
    array['billing.imputations.create'], 'créer une imputation fournisseur'
  );
  perform public.require_capability(
    array['rental.maintenance.view'], 'consulter la maintenance à imputer'
  );
  perform public.require_capability(
    array['rental.maintenance.cost.view'], 'consulter le montant imputable de la maintenance'
  );

  if p_maintenance_id is null then
    raise exception 'Une imputation se rattache obligatoirement à une maintenance (Workflow 06 §5).'
      using errcode = 'check_violation';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Le montant de l''imputation est obligatoire et doit être positif.'
      using errcode = 'check_violation';
  end if;

  if coalesce(btrim(p_justification), '') = '' then
    raise exception 'La justification de l''imputation est obligatoire (Workflow 06 §11).'
      using errcode = 'check_violation';
  end if;

  select m.vehicle_id, m.status into v_vehicle, v_mstatus
  from public.vehicle_maintenances m where m.id = p_maintenance_id;

  if v_vehicle is null then
    raise exception 'Maintenance introuvable.' using errcode = 'no_data_found';
  end if;

  if v_mstatus = 'CANCELLED' then
    raise exception
      'Opération refusée : une maintenance annulée ne donne lieu à aucune imputation.'
      using errcode = 'check_violation';
  end if;

  /*
   * Contrôles anticipés, pour un message compréhensible (CLAUDE.md §43). Les
   * déclencheurs les refont : ce sont eux qui font autorité, y compris pour un
   * appel qui ne passerait pas par ici.
   */
  select true, c.imputable_amount into v_found, v_ceiling
  from public.maintenance_costs c where c.maintenance_id = p_maintenance_id;

  if not v_found or v_ceiling is null then
    raise exception
      'Opération refusée : aucun montant imputable n''a été arrêté pour cette maintenance. Il doit l''être avant toute imputation.'
      using errcode = 'check_violation';
  end if;

  if v_ceiling = 0 then
    raise exception
      'Opération refusée : le montant imputable de cette maintenance est nul. La dépense reste à la charge d''ADIKOM (Workflow 06 §10).'
      using errcode = 'check_violation';
  end if;

  -- §4 : à défaut de désignation explicite, le fournisseur du véhicule.
  if v_supplier is null then
    select v.current_supplier_id into v_supplier
    from public.vehicles v where v.id = v_vehicle;

    if v_supplier is null then
      raise exception
        'Opération refusée : ce véhicule n''est mis à disposition par aucun fournisseur (Workflow 06 §4).'
        using errcode = 'check_violation';
    end if;
  end if;

  v_no := public.next_number('imputation');

  insert into public.imputations
    (imputation_no, maintenance_id, supplier_id, amount, justification,
     created_by, updated_by)
  values
    (v_no, p_maintenance_id, v_supplier, p_amount, btrim(p_justification),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.create_imputation is
  'Prépare une imputation fournisseur. Ne crée NI facture, NI paiement, et ne réduit AUCUN solde (DEC-013). Exige `imputations.create` ET la lecture du coût.';


/** Modifie une imputation encore en préparation — §38. */
create or replace function public.update_imputation(
  p_imputation_id uuid,
  p_amount        bigint,
  p_justification text,
  p_supplier_id   uuid default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  i public.imputations%rowtype;
begin
  perform public.require_capability(
    array['billing.imputations.update'], 'modifier une imputation'
  );

  select * into i from public.imputations where id = p_imputation_id for update;

  if not found then
    raise exception 'Imputation introuvable.' using errcode = 'no_data_found';
  end if;

  -- §38 : « Tant que l'imputation n'est pas validée… »
  if i.status not in ('DRAFT', 'TO_VALIDATE') then
    raise exception
      'Opération refusée : une imputation validée, imputée ou annulée ne se modifie plus (Workflow 06 §39).'
      using errcode = 'check_violation';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Le montant de l''imputation doit être positif.'
      using errcode = 'check_violation';
  end if;

  if coalesce(btrim(p_justification), '') = '' then
    raise exception 'La justification de l''imputation est obligatoire (Workflow 06 §11).'
      using errcode = 'check_violation';
  end if;

  update public.imputations
     set amount        = p_amount,
         justification = btrim(p_justification),
         supplier_id   = coalesce(p_supplier_id, i.supplier_id),
         updated_by    = public.current_actor()
   where id = i.id;
end;
$$;

comment on function public.update_imputation is
  'Modifie une imputation en préparation (§38). Le plafond et la cohérence fournisseur sont revérifiés par les déclencheurs.';


/** Soumet une imputation à validation — §15. */
create or replace function public.submit_imputation(
  p_imputation_id uuid
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  i public.imputations%rowtype;
begin
  /*
   * Arbitrage : soumettre n'est pas valider. C'est le dernier geste de la
   * PRÉPARATION, que §38 range sous la modification. Aucune capacité nouvelle
   * n'est créée pour lui — le catalogue décrit ce que le SaaS sait faire, et
   * `billing.imputations.update` le dit déjà (DEC-024, précédent DEC-025 §b).
   */
  perform public.require_capability(
    array['billing.imputations.update'], 'soumettre une imputation à validation'
  );

  select * into i from public.imputations where id = p_imputation_id for update;

  if not found then
    raise exception 'Imputation introuvable.' using errcode = 'no_data_found';
  end if;

  if i.status <> 'DRAFT' then
    raise exception
      'Opération refusée : seule une imputation en brouillon peut être soumise à validation.'
      using errcode = 'check_violation';
  end if;

  update public.imputations
     set status            = 'TO_VALIDATE',
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = i.id;
end;
$$;

comment on function public.submit_imputation is
  'Passe une imputation de « Brouillon » à « À valider » (§15). Dernier geste de la préparation : `imputations.update`, jamais `validate`.';


/**
 * Valide une imputation — §16.
 *
 * ELLE NE RÉDUIT ENCORE AUCUN MONTANT DÛ.
 *
 * DEC-013 : seule « Imputée » — validée ET rattachée à une facture — produit
 * un effet financier. Une imputation validée sans facture est ce que §31 nomme
 * une « imputation en attente de facture ». Elle n'est pas un paiement, et
 * n'affecte aucun solde.
 */
create or replace function public.validate_imputation(
  p_imputation_id uuid,
  p_reason        text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  i public.imputations%rowtype;
begin
  perform public.require_capability(
    array['billing.imputations.validate'], 'valider une imputation'
  );

  select * into i from public.imputations where id = p_imputation_id for update;

  if not found then
    raise exception 'Imputation introuvable.' using errcode = 'no_data_found';
  end if;

  -- §12 : le système distingue « imputation préparée » et « imputation
  -- validée ». On ne valide donc pas un brouillon : il se soumet d'abord.
  if i.status <> 'TO_VALIDATE' then
    raise exception
      'Opération refusée : seule une imputation soumise à validation peut être validée.'
      using errcode = 'check_violation';
  end if;

  update public.imputations
     set status            = 'VALIDATED',
         validated_at      = now(),
         validated_by      = public.current_actor(),
         status_reason     = nullif(btrim(coalesce(p_reason, '')), ''),
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = i.id;
end;
$$;

comment on function public.validate_imputation is
  'Valide une imputation (§16). Elle devient « en attente de facture » (§31) et ne réduit AUCUN montant dû (DEC-013).';


/**
 * Annule une imputation — §18, §40.
 *
 * « L'imputation passe à Annulée ; le montant précédemment déduit est réintégré
 * dans le solde concerné ; l'historique est conservé. » Au LOT 4, aucun solde
 * n'existe : ce qui est réintégré, c'est la part du PLAFOND que l'imputation
 * consommait. Rien n'est supprimé (CLAUDE.md §22).
 */
create or replace function public.cancel_imputation(
  p_imputation_id uuid,
  p_reason        text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  i public.imputations%rowtype;
begin
  perform public.require_capability(
    array['billing.imputations.cancel'], 'annuler une imputation'
  );

  select * into i from public.imputations where id = p_imputation_id for update;

  if not found then
    raise exception 'Imputation introuvable.' using errcode = 'no_data_found';
  end if;

  if i.status in ('IMPUTED', 'CANCELLED') then
    raise exception
      'Opération refusée : cette imputation ne peut plus être annulée.'
      using errcode = 'check_violation';
  end if;

  update public.imputations
     set status            = 'CANCELLED',
         cancelled_at      = now(),
         cancelled_by      = public.current_actor(),
         status_reason     = nullif(btrim(coalesce(p_reason, '')), ''),
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = i.id;
end;
$$;

comment on function public.cancel_imputation is
  'Annule une imputation sans l''effacer (§40). Le plafond qu''elle consommait redevient disponible ; l''historique reste.';


-- =============================================================================
-- DROITS D'EXÉCUTION — DEC-022
--
-- « Un droit ne se retire pas en général : il se retire à chaque source qui
-- l'accorde. » PostgreSQL accorde EXECUTE à PUBLIC sur toute fonction créée ;
-- les privilèges par défaut du schéma ne l'accordent plus à `anon` depuis la
-- migration 023. La révocation à PUBLIC reste donc nécessaire, fonction par
-- fonction.
-- =============================================================================

revoke execute on function public.create_imputation(uuid, uuid, bigint, text) from public;
grant  execute on function public.create_imputation(uuid, uuid, bigint, text)
  to authenticated, service_role;

revoke execute on function public.update_imputation(uuid, bigint, text, uuid) from public;
grant  execute on function public.update_imputation(uuid, bigint, text, uuid)
  to authenticated, service_role;

revoke execute on function public.submit_imputation(uuid) from public;
grant  execute on function public.submit_imputation(uuid) to authenticated, service_role;

revoke execute on function public.validate_imputation(uuid, text) from public;
grant  execute on function public.validate_imputation(uuid, text) to authenticated, service_role;

revoke execute on function public.cancel_imputation(uuid, text) from public;
grant  execute on function public.cancel_imputation(uuid, text) to authenticated, service_role;


-- =============================================================================
-- COUCHE 4 · RLS
--
-- Les policies d'écriture restent larges — une table sert plusieurs actes, et
-- PostgreSQL n'accepte qu'une policy d'UPDATE par table. C'est le déclencheur
-- de transition qui exige, lui, la capacité correspondant à l'acte réellement
-- demandé (migration 041 : « une policy large n'est pas une permission
-- d'acte »).
-- =============================================================================

revoke all    on public.imputations          from anon;
revoke all    on public.imputation_documents from anon;

revoke delete on public.imputations          from authenticated;
revoke delete on public.imputation_documents from authenticated;

alter table public.imputations          enable row level security;
alter table public.imputation_documents enable row level security;

create policy imputations_select on public.imputations
  for select to authenticated
  using (public.has_permission('billing.imputations.view'));

create policy imputations_insert on public.imputations
  for insert to authenticated
  with check (public.has_permission('billing.imputations.create'));

create policy imputations_update on public.imputations
  for update to authenticated
  using (
    public.has_permission('billing.imputations.update')
    or public.has_permission('billing.imputations.validate')
    or public.has_permission('billing.imputations.cancel')
  )
  with check (
    public.has_permission('billing.imputations.update')
    or public.has_permission('billing.imputations.validate')
    or public.has_permission('billing.imputations.cancel')
  );

-- Les justificatifs suivent l'imputation : les voir relève de `view`, les
-- joindre de la préparation, les retirer de la modification.
create policy imputation_documents_select on public.imputation_documents
  for select to authenticated
  using (public.has_permission('billing.imputations.view'));

create policy imputation_documents_insert on public.imputation_documents
  for insert to authenticated
  with check (
    public.has_permission('billing.imputations.create')
    or public.has_permission('billing.imputations.update')
  );

create policy imputation_documents_update on public.imputation_documents
  for update to authenticated
  using (public.has_permission('billing.imputations.update'))
  with check (public.has_permission('billing.imputations.update'));


-- =============================================================================
-- CONTRÔLE DE NON-RÉGRESSION DU CATALOGUE
--
-- Le LOT 4 n'ajoute aucune permission : les cinq codes `billing.imputations.*`
-- existent depuis la migration 007. Une migration qui laisserait le catalogue
-- dans un état inattendu doit échouer avant de le figer.
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
    'billing.imputations.view',
    'billing.imputations.create',
    'billing.imputations.update',
    'billing.imputations.validate',
    'billing.imputations.cancel'
  ]) c
  where not exists (select 1 from public.permissions p where p.code = c);

  if v_missing is not null then
    raise exception 'Capacités d''imputation absentes du catalogue : %', v_missing;
  end if;
end $$;
