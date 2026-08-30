-- =============================================================================
-- ADIKOM PILOT — 047 · Facture fournisseur
-- Étape 2.5 (DEC-021), LOT 5
--
-- CE QUE CETTE MIGRATION POSE
--
-- Le maillon que le LOT 4 a laissé ouvert : la facture reçue d'un fournisseur,
-- et le RATTACHEMENT des imputations validées à cette facture — c'est-à-dire
-- le seul acte qui, selon DEC-013, réduit un montant dû.
--
--   Module 07 §28 : « Le menu Nouvelle facture permet d'ENREGISTRER une facture
--   REÇUE d'un fournisseur. » DEC-007 : « La facture fournisseur est saisie
--   manuellement, avec son montant brut, sa date, son échéance et sa référence
--   externe. » Aucun montant n'est généré, aucune périodicité n'est supposée.
--
-- LES QUATRE MONTANTS, ET LEUR SOURCE UNIQUE
--
--   Montant brut     Σ des lignes actives de la facture.
--   Montant imputé   Σ des imputations « Imputée » rattachées à la facture.
--   Net à payer      Brut − Imputé  (Module 07 §57, Règles fournisseurs §12).
--   Montant payé     N'EXISTE PAS ENCORE — les règlements fournisseurs
--                    relèvent du lot suivant. Aucun zéro n'est affiché à sa
--                    place : l'écran DIT qu'aucun paiement n'est géré.
--
-- AUCUN DE CES MONTANTS N'EST STOCKÉ. Chacun est une somme refaite à la
-- lecture, comme le reste imputable du LOT 4. Une colonne `gross_amount` ferait
-- une seconde source capable de contredire ses lignes.
--
-- CE QUE CE LOT NE FAIT PAS
--
--   · AUCUN PAIEMENT, AUCUN RÈGLEMENT, AUCUN SOLDE, AUCUN COMPTE FINANCIER.
--     `Solde = Net à payer − Σ paiements validés` (Module 07 §57) suppose des
--     paiements : la formule est respectée en n'en affichant aucun.
--   · AUCUNE FACTURE CLIENT, aucune facturation de location. `TO_INVOICE →
--     INVOICED` et `INVOICED → CLOSED` restent sans capacité désignée, comme
--     la migration 041 l'a signalé.
--   · AUCUNE CONTREPASSATION (Workflow 06 §41). Le document la renvoie à
--     « l'implémentation financière » ; elle suppose des écritures qui
--     n'existent pas. Le DÉTACHEMENT d'une imputation la remplace : il rend
--     l'imputation à son état antérieur, sans écriture inverse à inventer.
--   · AUCUNE TAXE (DEC-014 : régime non défini). Les lignes portent un montant,
--     pas une base et un taux.
--   · AUCUN CHANGEMENT DE FORMAT DE NUMÉROTATION. `supplier_invoice` →
--     `FAC-F`, année, six chiffres, remise à zéro annuelle, enregistrée depuis
--     la migration 005. DEC-023 §4 réserve la convention définitive des
--     documents à valeur comptable à la validation du responsable comptable
--     d'ADIKOM : figer un format aujourd'hui serait précisément ce que cette
--     réserve interdit. Le format reste paramétrable, sans redéploiement.
--   · AUCUNE PERMISSION NOUVELLE. `billing.supplier_invoices.view · create ·
--     update · validate · cancel · export` existent depuis la migration 007.
--     Catalogue : 153, inchangé.
--
-- LES QUATRE COUCHES DE L'AUDIT 041–042, RECONDUITES
--
--   1. FONCTION   — chaque acte vérifie SA capacité par `require_capability`.
--   2. DONNÉE     — une facture validée fige son en-tête et ses lignes.
--   3. TRANSITION — chaque changement de statut exige la capacité qui le
--                   légitime, ce qui couvre le `PATCH` direct hors fonction.
--   4. RLS        — lecture, création, modification, validation, annulation.
--
-- Aucune fonction n'est `SECURITY DEFINER`.
--
-- ET UNE CINQUIÈME, AJOUTÉE ICI : L'ÉTAT DE DÉPART
--
-- Un déclencheur de transition ne s'exécute qu'à l'UPDATE. Un `INSERT` direct
-- portant `status = 'VALIDATED'` ne le rencontrerait jamais — et une facture
-- naîtrait validée sans que `validate` ait été exigée. Une facture, comme une
-- imputation, naît donc EN BROUILLON, et la base le vérifie. Le contrôle est
-- posé ici pour les deux tables : le LOT 4 laissait ce chemin ouvert.
-- =============================================================================


-- --- Type ------------------------------------------------------------------------
--
-- Module 07 §31 — les sept statuts documentés, dans leur ordre, et rien de plus.
--
-- Trois ne sont pas atteignables aujourd'hui, et le disent :
--
--   `OVERDUE`  DÉRIVÉ, jamais écrit. Le projet ne dispose d'aucun ordonnanceur
--              (DEC-025 §a) : un statut « En retard » stocké dépendrait d'une
--              tâche qui ne s'exécute pas. Il se calcule de l'échéance et de la
--              date du jour, sur `Indian/Comoro` (DEC-025 §e).
--   `PARTIALLY_PAID`, `PAID`  supposent des RÈGLEMENTS, qui n'existent pas.
--              Les transitions qui y mènent sont refusées, avec leur motif.

do $$ begin
  create type public.supplier_invoice_status as enum (
    'DRAFT',           -- Brouillon          — saisie en cours, librement modifiable
    'PENDING',         -- En attente         — saisie complète, attend le contrôle
    'VALIDATED',       -- Validée            — dette reconnue ; imputable (§32)
    'PARTIALLY_PAID',  -- Partiellement payée — exige des règlements : LOT SUIVANT
    'PAID',            -- Payée              — exige des règlements : LOT SUIVANT
    'OVERDUE',         -- En retard          — dérivé, jamais écrit (DEC-025 §a)
    'CANCELLED'        -- Annulée            — historisée, jamais supprimée
  );
exception when duplicate_object then null; end $$;


-- =============================================================================
-- LES FACTURES FOURNISSEURS
-- =============================================================================

create table public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),

  /*
   * NUMÉRO INTERNE — Module 07 §30.
   *
   * « Chaque facture fournisseur doit disposer d'un identifiant interne
   * unique », et le système doit distinguer le numéro ADIKOM du numéro porté
   * par le document du fournisseur. Ce sont deux colonnes, jamais une.
   */
  invoice_no text not null unique,

  -- §30 : « Le numéro de facture fourni par le fournisseur peut également être
  -- enregistré comme référence externe. » Facultatif : une facture reçue sans
  -- référence lisible reste une facture à payer.
  external_ref text,

  supplier_id uuid not null references public.suppliers (id) on delete restrict,

  -- §29 : date et échéance. `date` et non `timestamptz` : une échéance est un
  -- jour du calendrier, pas un instant.
  invoice_date date not null,
  due_date     date,

  currency_code text not null default 'KMF',

  notes text,

  status public.supplier_invoice_status not null default 'DRAFT',

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

  -- Une échéance antérieure à la facture est une erreur de saisie, jamais une
  -- règle métier.
  constraint supplier_invoices_due_after_date check (
    due_date is null or due_date >= invoice_date
  ),

  -- Une référence externe vide n'est pas une référence : elle est absente.
  constraint supplier_invoices_external_ref_not_blank check (
    external_ref is null or btrim(external_ref) <> ''
  ),

  -- DEC-025 §a : « En retard » se calcule, ne se stocke pas. La contrainte rend
  -- la règle infalsifiable, y compris par `PATCH` direct.
  constraint supplier_invoices_overdue_is_derived check (status <> 'OVERDUE'),

  -- §48 (Workflow 06) : un état atteint sans date d'effet est un acte que
  -- personne ne peut situer.
  constraint supplier_invoices_validation_dated check (
    status not in ('VALIDATED', 'PARTIALLY_PAID', 'PAID') or validated_at is not null
  ),
  constraint supplier_invoices_cancellation_dated check (
    status <> 'CANCELLED' or cancelled_at is not null
  )
);

comment on table public.supplier_invoices is
  'Facture REÇUE d''un fournisseur (Module 07 §28). Montant brut, imputé et net à payer sont des sommes recalculées, jamais des colonnes.';
comment on column public.supplier_invoices.invoice_no is
  'Numéro interne ADIKOM (FAC-F-2026-000001). Format paramétrable : DEC-023 §4 réserve la convention définitive à la validation comptable.';
comment on column public.supplier_invoices.external_ref is
  'Numéro porté par le document du fournisseur (§30). Distinct du numéro interne, jamais confondu avec lui.';
comment on column public.supplier_invoices.status is
  'Module 07 §31. « En retard » est dérivé (DEC-025 §a) ; « Partiellement payée » et « Payée » supposent des règlements, non gérés.';

create index supplier_invoices_supplier_idx on public.supplier_invoices (supplier_id, invoice_date desc);
create index supplier_invoices_status_idx   on public.supplier_invoices (status);
create index supplier_invoices_due_idx      on public.supplier_invoices (due_date)
  where due_date is not null;


-- =============================================================================
-- LES LIGNES — LA SEULE SOURCE DU MONTANT BRUT
--
-- Règles finance §8 : une facture fournisseur est associée à « une ou plusieurs
-- lignes ». Module 07 §29 les cite parmi ce qu'elle contient.
--
-- Le montant brut est leur SOMME. Il n'est stocké nulle part : une colonne
-- `gross_amount` et des lignes seraient deux sources du même chiffre, capables
-- de diverger — exactement ce que le LOT 4 a refusé pour le montant imputable.
--
-- §54 (Règles fournisseurs §11) : « Le montant brut d'une facture fournisseur
-- doit être conservé. » Il l'est : après validation, les lignes sont figées.
-- =============================================================================

create table public.supplier_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  supplier_invoice_id uuid not null
    references public.supplier_invoices (id) on delete cascade,

  label text not null,

  -- DEC-010 : entiers, en KMF. Aucun flottant, à aucun niveau.
  amount bigint not null check (amount > 0),

  /*
   * §28 : une facture fournisseur peut être liée à un véhicule.
   *
   * Le lien est porté par la LIGNE, non par la facture : Workflow 06 §21 montre
   * un même fournisseur facturant plusieurs véhicules. Le poser sur l'en-tête
   * imposerait un choix que le document ne fait pas.
   *
   * La MAINTENANCE, elle, n'est pas rattachée ici : le lien facture ↔
   * maintenance existe déjà, et par l'imputation (§24 — Fournisseur → Facture →
   * Imputation → Maintenance → Véhicule). Le doubler créerait deux chemins vers
   * la même réponse, capables de se contredire.
   */
  vehicle_id uuid references public.vehicles (id) on delete restrict,

  -- Une ligne saisie par erreur se retire de la facture sans être effacée
  -- (CLAUDE.md §22), et sort alors de la somme. Même traitement que les
  -- justificatifs du LOT 4.
  is_archived boolean not null default false,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  constraint supplier_invoice_lines_label_not_blank check (btrim(label) <> '')
);

comment on table public.supplier_invoice_lines is
  'Lignes d''une facture fournisseur (Règles finance §8). Leur somme EST le montant brut : aucune colonne ne le recopie.';
comment on column public.supplier_invoice_lines.vehicle_id is
  'Véhicule concerné par la ligne (§28). Sur la ligne et non l''en-tête : une facture peut couvrir plusieurs véhicules (Workflow 06 §21).';
comment on column public.supplier_invoice_lines.is_archived is
  'Ligne retirée de la facture avant validation. Exclue de la somme, jamais effacée.';

create index supplier_invoice_lines_invoice_idx
  on public.supplier_invoice_lines (supplier_invoice_id)
  where not is_archived;

create index supplier_invoice_lines_vehicle_idx
  on public.supplier_invoice_lines (vehicle_id)
  where vehicle_id is not null and not is_archived;


-- =============================================================================
-- LE MONTANT BRUT — UNE FONCTION, PAS UNE COLONNE
--
-- `SECURITY INVOKER` par défaut : la somme est calculée sous les droits de
-- l'appelant, RLS comprise. Un appelant sans `billing.supplier_invoices.view`
-- ne lit aucune ligne et obtient 0 — raison pour laquelle chaque contrôle qui
-- s'appuie sur elle EXIGE nommément cette capacité avant de l'appeler. Un
-- montant invisible n'est pas un montant nul.
-- =============================================================================

create or replace function public.supplier_invoice_gross(p_invoice_id uuid)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(l.amount), 0)::bigint
  from public.supplier_invoice_lines l
  where l.supplier_invoice_id = p_invoice_id
    and not l.is_archived;
$$;

comment on function public.supplier_invoice_gross(uuid) is
  'Montant brut = Σ des lignes actives. Calculé sous les droits de l''appelant : une facture illisible renvoie 0, jamais une autorisation tacite.';


/**
 * Total effectivement imputé sur une facture — DEC-013.
 *
 * Seules les imputations au statut « Imputée » comptent : c'est la définition
 * même de ce statut. Une imputation validée sans facture, une imputation
 * annulée, une imputation en préparation ne réduisent rien.
 */
create or replace function public.supplier_invoice_imputed(p_invoice_id uuid)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(i.amount), 0)::bigint
  from public.imputations i
  where i.supplier_invoice_id = p_invoice_id
    and i.status = 'IMPUTED';
$$;

comment on function public.supplier_invoice_imputed(uuid) is
  'Σ des imputations « Imputée » rattachées à la facture (DEC-013). Lue sous `billing.imputations.view` : sans ce droit, elle vaut 0 et l''acte doit être refusé.';


-- =============================================================================
-- COUCHE 5 · L'ÉTAT DE DÉPART
--
-- Un déclencheur de transition ne voit pas un `INSERT`. Sans ce contrôle, un
-- `POST` direct portant `status = 'VALIDATED'` créerait une facture validée
-- sans que `billing.supplier_invoices.validate` ait jamais été exigée — la
-- policy d'insertion ne demandant que `create`.
--
-- Le même chemin était ouvert sur `imputations` depuis le LOT 4 : il est fermé
-- ici pour les deux tables.
-- =============================================================================

create or replace function public.fn_supplier_invoice_starts_draft()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'DRAFT' then
    raise exception
      'Opération refusée : une facture fournisseur est enregistrée en brouillon. Son contrôle et sa validation sont des actes distincts, soumis à leurs propres capacités.'
      using errcode = 'check_violation';
  end if;

  if new.validated_at is not null or new.cancelled_at is not null then
    raise exception
      'Opération refusée : une facture fournisseur ne naît ni validée ni annulée.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_supplier_invoice_starts_draft is
  'Une facture naît en brouillon. Ferme le contournement du déclencheur de transition par INSERT direct.';


create or replace function public.fn_imputation_starts_draft()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'DRAFT' then
    raise exception
      'Opération refusée : une imputation est préparée en brouillon. Sa soumission, sa validation et son rattachement sont des actes distincts, soumis à leurs propres capacités.'
      using errcode = 'check_violation';
  end if;

  if new.supplier_invoice_id is not null then
    raise exception
      'Opération refusée : une imputation ne naît pas rattachée à une facture. Le rattachement suit la validation (Workflow 06 §24).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_imputation_starts_draft is
  'Une imputation naît en brouillon, sans facture. Ferme le contournement du déclencheur de transition par INSERT direct (complément de l''audit 041).';

create trigger imputations_starts_draft
  before insert on public.imputations
  for each row execute function public.fn_imputation_starts_draft();


-- =============================================================================
-- COUCHE 2 · LA COHÉRENCE DES LIGNES, ET LEUR VERROU
--
-- Module 07 §29 et Workflow 06 §25 : « La facture doit conserver les montants
-- nécessaires à la traçabilité. » Une ligne modifiée après validation
-- changerait le montant brut sur lequel la validation a porté — et, s'il
-- baissait, ferait passer rétroactivement le total imputé au-dessus du brut.
-- =============================================================================

create or replace function public.fn_supplier_invoice_line_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status public.supplier_invoice_status;
  v_seen   boolean := false;
begin
  select true, i.status into v_seen, v_status
  from public.supplier_invoices i
  where i.id = new.supplier_invoice_id;

  -- Introuvable, ou invisible faute de `billing.supplier_invoices.view` : même
  -- réponse, afin de ne rien apprendre à qui n'a pas le droit de savoir
  -- (DEC-017).
  if not v_seen then
    raise exception
      'La facture visée est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if v_status not in ('DRAFT', 'PENDING') then
    raise exception
      'Opération refusée : les lignes d''une facture validée ou annulée sont figées. Le montant brut ne se corrige plus après validation.'
      using errcode = 'check_violation';
  end if;

  /*
   * Rattacher une ligne à un véhicule qu'on ne peut pas lire reviendrait à
   * désigner à l'aveugle. Le contrôle ne s'applique QUE si un véhicule est
   * désigné : une facture sans véhicule n'exige rien de `rental.fleet.view`.
   */
  if new.vehicle_id is not null
     and (tg_op = 'INSERT' or new.vehicle_id is distinct from old.vehicle_id) then
    if not exists (select 1 from public.vehicles v where v.id = new.vehicle_id) then
      raise exception
        'Le véhicule désigné est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.fn_supplier_invoice_line_guard is
  'Fige les lignes dès que la facture quitte la saisie, et refuse un véhicule illisible. Aucun déverrouillage n''existe.';


-- =============================================================================
-- COUCHE 3 · LES TRANSITIONS DE LA FACTURE
--
-- « Une permission dit qui peut agir, une transition dit ce qui a un sens »
-- (DEC-025 §k). Chaque changement de statut exige ici la capacité qui le
-- légitime : c'est ce qui protège le `PATCH` direct, lequel ne rencontre aucune
-- garde serveur (leçon de la migration 041).
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

    /*
     * LES RÈGLEMENTS N'EXISTENT PAS — ET LE SYSTÈME LE DIT.
     *
     * « Partiellement payée » et « Payée » sont des CONSÉQUENCES de paiements
     * enregistrés (Module 07 §55, §57), jamais une déclaration. Les écrire
     * aujourd'hui affirmerait qu'une somme a été versée alors qu'aucun
     * règlement n'est géré. Même traitement que « Imputée » au LOT 4 :
     * présentes à l'énumération, non atteignables, signalées.
     */
    if new.status in ('PARTIALLY_PAID', 'PAID') then
      raise exception
        'Opération refusée : l''état de règlement d''une facture découle des paiements enregistrés, et les règlements fournisseurs ne sont pas encore gérés.'
        using errcode = 'check_violation';
    end if;

    -- DEC-025 §a : « En retard » se calcule de l'échéance, il ne se déclare pas.
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

        /*
         * Règles finance §8 : une facture est associée à une ou plusieurs
         * lignes. Valider une facture sans ligne reconnaîtrait une dette de
         * zéro — et rendrait imputable une facture sur laquelle rien ne peut
         * l'être (Workflow 06 §20).
         *
         * La somme est lue sous les droits de l'appelant : illisible, elle vaut
         * 0, et la validation est REFUSÉE. C'est le seul comportement
         * acceptable.
         */
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

        /*
         * ANNULER UNE FACTURE NE DOIT PAS ORPHELINER SES DÉDUCTIONS.
         *
         * Une imputation « Imputée » tire son effet de la facture qui la porte
         * (DEC-013). Annuler celle-ci sans rien dire laisserait une déduction
         * pesant sur un document annulé — un montant déduit de rien.
         *
         * Le détachement existe pour cela, et il est capacité par capacité. La
         * lecture des imputations est donc EXIGÉE : sans elle, la somme serait
         * muette et l'annulation passerait à l'aveugle.
         */
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

  /*
   * COUCHE 2 — LE VERROU.
   *
   * Une facture validée ou annulée fige ce qui fonde la dette : son
   * fournisseur, sa date, son échéance et sa référence externe. Les LIGNES le
   * sont par leur propre déclencheur.
   */
  if old.status in ('VALIDATED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')
     and (new.supplier_id  is distinct from old.supplier_id
       or new.invoice_date is distinct from old.invoice_date
       or new.due_date     is distinct from old.due_date
       or new.external_ref is distinct from old.external_ref
       or new.invoice_no   is distinct from old.invoice_no) then
    raise exception
      'Opération refusée : une facture fournisseur validée ou annulée ne se modifie plus. Son annulation, elle, conserve l''historique.'
      using errcode = 'check_violation';
  end if;

  -- Modifier une facture encore en saisie relève de `update`.
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
  'Chaque transition exige SA capacité, y compris par PATCH direct. « Payée » suppose des règlements, « En retard » se calcule : ni l''une ni l''autre ne s''écrit.';


create trigger supplier_invoices_starts_draft
  before insert on public.supplier_invoices
  for each row execute function public.fn_supplier_invoice_starts_draft();

create trigger supplier_invoices_transition
  before update on public.supplier_invoices
  for each row execute function public.fn_supplier_invoice_transition();

create trigger supplier_invoices_updated_at
  before update on public.supplier_invoices
  for each row execute function public.fn_set_updated_at();

create trigger supplier_invoices_audit
  after insert or update on public.supplier_invoices
  for each row execute function public.fn_audit_row('billing');

create trigger supplier_invoices_no_delete
  before delete on public.supplier_invoices
  for each row execute function public.fn_forbid_delete();

create trigger supplier_invoice_lines_guard
  before insert or update on public.supplier_invoice_lines
  for each row execute function public.fn_supplier_invoice_line_guard();

create trigger supplier_invoice_lines_updated_at
  before update on public.supplier_invoice_lines
  for each row execute function public.fn_set_updated_at();

create trigger supplier_invoice_lines_audit
  after insert or update on public.supplier_invoice_lines
  for each row execute function public.fn_audit_row('billing');

create trigger supplier_invoice_lines_no_delete
  before delete on public.supplier_invoice_lines
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- LE POINT D'ACCROCHE DEVIENT UNE RELATION
--
-- Le LOT 4 a posé `imputations.supplier_invoice_id` sans clé étrangère : sa
-- cible n'existait pas. Elle existe. La contrainte référentielle est posée, et
-- `restrict` interdit qu'une facture disparaisse sous une imputation — de toute
-- façon, rien ne se supprime ici.
-- =============================================================================

alter table public.imputations
  add constraint imputations_supplier_invoice_fkey
  foreign key (supplier_invoice_id)
  references public.supplier_invoices (id) on delete restrict;

comment on column public.imputations.supplier_invoice_id is
  'Facture fournisseur qui porte l''imputation. Renseignée, elle fait passer l''imputation à « Imputée » — le seul statut qui réduise un montant dû (DEC-013).';


-- =============================================================================
-- COUCHE 2 · LA COHÉRENCE DE L'IMPUTATION — RÉÉCRITE
--
-- Le LOT 4 refusait tout rattachement, faute de facture. Le refus est remplacé
-- par les contrôles que Workflow 06 exige réellement :
--
--   §24  Fournisseur → Facture → Imputation → Maintenance → Véhicule.
--        La facture et l'imputation visent donc LE MÊME fournisseur.
--   §32  « Lorsque la facture fournisseur EXISTE DÉJÀ, l'imputation peut être
--        directement rattachée à celle-ci. » Une facture en brouillon n'est pas
--        encore une dette reconnue : le rattachement exige une facture VALIDÉE.
--   §20  « Le système ne doit pas accepter automatiquement une imputation
--        supérieure au montant disponible sur la facture. » Refus, sans
--        crédit ni report inventé.
--
-- Le reste du contrôle — fournisseur du véhicule, maintenance non annulée —
-- est celui du LOT 4, inchangé.
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
  v_inv_status      public.supplier_invoice_status;
  v_inv_supplier    uuid;
  v_gross           bigint;
  v_others          bigint;
begin
  if tg_op = 'INSERT' then
    v_invoice_changed := new.supplier_invoice_id is not null;
  else
    v_invoice_changed := new.supplier_invoice_id is not null
                         and new.supplier_invoice_id is distinct from old.supplier_invoice_id;
  end if;

  if v_invoice_changed then
    /*
     * LE PLAFOND DE LA FACTURE NE SE DEVINE PAS.
     *
     * Le brut vit dans `supplier_invoice_lines`, le déjà-imputé dans
     * `imputations` : lus sous les droits de l'appelant, l'un et l'autre valent
     * 0 sans la capacité correspondante. Un plafond invisible n'est pas un
     * plafond infini — les deux lectures sont donc EXIGÉES, nommément.
     *
     * Ce ne sont pas des capacités impliquées par une autre (DEC-024) : elles
     * s'attribuent séparément, et le rattachement les exige toutes.
     */
    if public.current_actor() is not null then
      if not public.has_permission('billing.supplier_invoices.view') then
        raise exception
          'Opération refusée : rattacher une imputation à une facture exige de pouvoir consulter cette facture.'
          using errcode = 'insufficient_privilege';
      end if;

      if not public.has_permission('billing.imputations.view') then
        raise exception
          'Opération refusée : rattacher une imputation exige de pouvoir consulter les imputations déjà portées par cette facture.'
          using errcode = 'insufficient_privilege';
      end if;
    end if;

    select i.status, i.supplier_id into v_inv_status, v_inv_supplier
    from public.supplier_invoices i
    where i.id = new.supplier_invoice_id;

    if v_inv_status is null then
      raise exception
        'La facture fournisseur visée est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;

    -- §32 : la facture doit exister en tant que dette reconnue.
    if v_inv_status <> 'VALIDATED' then
      raise exception
        'Opération refusée : seule une facture fournisseur validée peut recevoir une imputation (Workflow 06 §32).'
        using errcode = 'check_violation';
    end if;

    -- §24 : la chaîne relie UN fournisseur. Imputer la dépense d'un
    -- fournisseur sur la facture d'un autre serait précisément l'incohérence
    -- que §33 interdit.
    if v_inv_supplier is distinct from new.supplier_id then
      raise exception
        'Opération refusée : cette facture n''est pas celle du fournisseur auquel la dépense est imputée (Workflow 06 §24).'
        using errcode = 'check_violation';
    end if;

    -- §20 : le total imputé ne dépasse jamais le montant de la facture.
    v_gross := public.supplier_invoice_gross(new.supplier_invoice_id);

    select coalesce(sum(i.amount), 0) into v_others
    from public.imputations i
    where i.supplier_invoice_id = new.supplier_invoice_id
      and i.status = 'IMPUTED'
      and i.id <> new.id;

    if v_others + new.amount > v_gross then
      raise exception
        'Opération refusée : le total imputé (% KMF) dépasserait le montant de la facture (% KMF). Aucun crédit ni report n''est créé automatiquement (Workflow 06 §20).',
        v_others + new.amount, v_gross
        using errcode = 'check_violation';
    end if;
  end if;

  /*
   * LE DOSSIER NE SE REVÉRIFIE QUE S'IL CHANGE.
   *
   * Ce contrôle LIT la maintenance et le véhicule, dont la lecture exige
   * `rental.maintenance.view` et `rental.fleet.view`. Le rejouer à chaque
   * changement de STATUT imposerait ces deux droits au valideur, à celui qui
   * annule et à celui qui rattache — c'est-à-dire ferait dépendre un acte de
   * capacités qui ne le concernent pas, exactement ce que DEC-024 proscrit.
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

  if v_vehicle is null then
    raise exception
      'La maintenance visée est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

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
  'Vérifie le fournisseur du véhicule (§33), la maintenance, et — au rattachement — que la facture est validée, du même fournisseur, et que le total imputé ne la dépasse pas (§20, §24, §32).';


-- =============================================================================
-- COUCHE 3 · LES TRANSITIONS D'IMPUTATION — LA FRONTIÈRE S'OUVRE
--
-- Le LOT 4 refusait `VALIDATED → IMPUTED` : la facture n'existait pas, et
-- aucune capacité ne portait l'acte. Elle existe, et l'acte est rattaché à sa
-- capacité — ce que DEC-026 §b annonçait pour l'Étape 2.5.
--
-- QUELLE CAPACITÉ, ET POURQUOI PAS UNE AUTRE
--
-- Rattacher, c'est achever la vie de l'imputation : `billing.imputations.update`
-- porte déjà la soumission à validation, dernier geste de la préparation
-- (DEC-026 §e). Aucune capacité nouvelle n'est créée — le catalogue décrit ce
-- que le SaaS sait faire (DEC-024).
--
-- `billing.supplier_invoices.update` n'est PAS exigée : rien n'est écrit dans
-- la facture. Son net à payer est une soustraction refaite à la lecture, pas
-- une colonne que le rattachement modifierait. Exiger une capacité d'écriture
-- pour une écriture qui n'a pas lieu inventerait une règle.
--
-- LE DÉTACHEMENT — §39 ET §41
--
-- §39 : « Une correction doit suivre une procédure contrôlée. » §41 renvoie la
-- CONTREPASSATION à l'implémentation financière, qui suppose des écritures
-- inexistantes. Le détachement est la procédure contrôlée qui reste : il rend
-- l'imputation à « Validée, en attente de facture », son état antérieur exact.
-- Il exige sa capacité, il est daté, il est audité. Aucun montant n'est effacé,
-- aucune écriture inverse n'est inventée.
-- =============================================================================

create or replace function public.fn_imputation_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then

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

      -- DEC-013 : le seul passage qui produise un effet financier.
      when old.status = 'VALIDATED' and new.status = 'IMPUTED' then
        perform public.require_capability(
          array['billing.imputations.update'], 'rattacher une imputation à une facture fournisseur'
        );

        -- La contrainte `imputations_imputed_requires_invoice` l'exige déjà ;
        -- le dire ici donne son motif plutôt qu'un code d'erreur.
        if new.supplier_invoice_id is null then
          raise exception
            'Opération refusée : « Imputée » suppose une facture fournisseur rattachée (DEC-013).'
            using errcode = 'check_violation';
        end if;

      -- Détachement : retour à « en attente de facture » (§31).
      when old.status = 'IMPUTED' and new.status = 'VALIDATED' then
        perform public.require_capability(
          array['billing.imputations.update'], 'détacher une imputation de sa facture fournisseur'
        );

        if new.supplier_invoice_id is not null then
          raise exception
            'Opération refusée : détacher une imputation retire la facture qui la porte. L''une ne va pas sans l''autre.'
            using errcode = 'check_violation';
        end if;

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
   * ce sur quoi la validation a porté — et, une fois la facture rattachée, le
   * net à payer qu'elle a produit.
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

  -- Une imputation rattachée ne change pas de facture sans passer par le
  -- détachement : sinon un net à payer changerait sur deux factures à la fois.
  if old.status = 'IMPUTED'
     and new.status = 'IMPUTED'
     and new.supplier_invoice_id is distinct from old.supplier_invoice_id then
    raise exception
      'Opération refusée : une imputation ne change pas de facture. Elle se détache de l''une, puis se rattache à l''autre.'
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
  'Chaque transition exige SA capacité, y compris par PATCH direct. « Imputée » s''atteint par rattachement à une facture validée, et se quitte par détachement.';


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
-- Chacune LIT la facture avant d'agir — pour la verrouiller, pour contrôler son
-- état, ou simplement pour rendre l'identifiant créé. Sous RLS, un appelant sans
-- `billing.supplier_invoices.view` ne lit rien : l'acte échouerait sur un
-- « introuvable » qui n'expliquerait pas la vraie raison.
--
-- La capacité est donc exigée NOMMÉMENT, et refusée avec son motif. Ce n'est pas
-- une capacité impliquée par une autre (DEC-024) : `view` et `create` restent
-- attribuables séparément — la fonction exige simplement les deux, et le dit.
-- C'est la doctrine du LOT 4 : on n'agit pas sur ce qu'on n'a pas le droit de
-- voir.
-- =============================================================================

/**
 * Enregistre une facture reçue — Module 07 §28, DEC-007.
 *
 * Aucun montant n'est généré. Le brut viendra des lignes, saisies ensuite : une
 * facture sans ligne reste en brouillon et ne peut pas être validée.
 */
create or replace function public.create_supplier_invoice(
  p_supplier_id  uuid,
  p_invoice_date date,
  p_due_date     date default null,
  p_external_ref text default null,
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

  /*
   * Le fournisseur n'est PAS exigé actif.
   *
   * Une facture reçue d'un fournisseur devenu inactif reste une dette réelle.
   * Refuser de l'enregistrer empêcherait de la payer — et ferait disparaître
   * du système une obligation qui existe hors de lui.
   */
  if not exists (select 1 from public.suppliers s where s.id = p_supplier_id) then
    raise exception
      'Le fournisseur désigné est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  v_no := public.next_number('supplier_invoice');

  insert into public.supplier_invoices
    (invoice_no, supplier_id, invoice_date, due_date, external_ref, notes,
     created_by, updated_by)
  values
    (v_no, p_supplier_id, p_invoice_date, p_due_date,
     nullif(btrim(coalesce(p_external_ref, '')), ''),
     nullif(btrim(coalesce(p_notes, '')), ''),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.create_supplier_invoice is
  'Enregistre une facture REÇUE, en brouillon (DEC-007). Ne génère aucun montant et ne crée ni imputation ni paiement.';


/** Modifie l'en-tête d'une facture encore en saisie. */
create or replace function public.update_supplier_invoice(
  p_invoice_id   uuid,
  p_invoice_date date,
  p_due_date     date default null,
  p_external_ref text default null,
  p_notes        text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  f public.supplier_invoices%rowtype;
begin
  perform public.require_capability(
    array['billing.supplier_invoices.update'], 'modifier une facture fournisseur'
  );
  perform public.require_capability(
    array['billing.supplier_invoices.view'], 'consulter la facture à modifier'
  );

  select * into f from public.supplier_invoices where id = p_invoice_id for update;

  if not found then
    raise exception 'Facture fournisseur introuvable.' using errcode = 'no_data_found';
  end if;

  if f.status not in ('DRAFT', 'PENDING') then
    raise exception
      'Opération refusée : une facture validée ou annulée ne se modifie plus.'
      using errcode = 'check_violation';
  end if;

  if p_invoice_date is null then
    raise exception 'La date de la facture est obligatoire.' using errcode = 'check_violation';
  end if;

  if p_due_date is not null and p_due_date < p_invoice_date then
    raise exception 'L''échéance ne peut pas précéder la date de la facture.'
      using errcode = 'check_violation';
  end if;

  update public.supplier_invoices
     set invoice_date = p_invoice_date,
         due_date     = p_due_date,
         external_ref = nullif(btrim(coalesce(p_external_ref, '')), ''),
         notes        = nullif(btrim(coalesce(p_notes, '')), ''),
         updated_by   = public.current_actor()
   where id = f.id;
end;
$$;

comment on function public.update_supplier_invoice is
  'Modifie une facture en saisie. Le fournisseur n''y est pas modifiable : une facture d''un autre fournisseur est une autre facture.';


/**
 * Ajoute une ligne — Règles finance §8.
 *
 * `create` OU `update` : ajouter une ligne appartient à la SAISIE de la
 * facture, que l'un ou l'autre porte selon qu'on la crée ou qu'on la complète.
 * Même règle que les justificatifs du LOT 4.
 */
create or replace function public.add_supplier_invoice_line(
  p_invoice_id uuid,
  p_label      text,
  p_amount     bigint,
  p_vehicle_id uuid default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_status public.supplier_invoice_status;
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

  if p_amount is null or p_amount <= 0 then
    raise exception 'Le montant d''une ligne doit être un entier positif, en KMF.'
      using errcode = 'check_violation';
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

  insert into public.supplier_invoice_lines
    (supplier_invoice_id, label, amount, vehicle_id, created_by, updated_by)
  values
    (p_invoice_id, btrim(p_label), p_amount, p_vehicle_id,
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.add_supplier_invoice_line is
  'Ajoute une ligne à une facture en saisie. La somme des lignes actives EST le montant brut : aucune colonne ne le recopie.';


/** Retire une ligne de la facture sans l'effacer — CLAUDE.md §22. */
create or replace function public.archive_supplier_invoice_line(
  p_line_id uuid
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.require_capability(
    array['billing.supplier_invoices.update'], 'retirer une ligne d''une facture fournisseur'
  );
  perform public.require_capability(
    array['billing.supplier_invoices.view'], 'consulter la facture concernée'
  );

  update public.supplier_invoice_lines
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

comment on function public.archive_supplier_invoice_line is
  'Retire une ligne de la somme sans l''effacer. Le déclencheur refuse l''opération si la facture n''est plus en saisie.';


/** Soumet une facture au contrôle — Module 07 §31 « En attente ». */
create or replace function public.submit_supplier_invoice(
  p_invoice_id uuid
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  f public.supplier_invoices%rowtype;
begin
  /*
   * Soumettre n'est pas valider : c'est le dernier geste de la SAISIE. Aucune
   * capacité nouvelle n'est créée pour lui — même arbitrage qu'au LOT 4 pour la
   * soumission d'une imputation (DEC-026 §e).
   */
  perform public.require_capability(
    array['billing.supplier_invoices.update'], 'soumettre une facture fournisseur au contrôle'
  );
  perform public.require_capability(
    array['billing.supplier_invoices.view'], 'consulter la facture à soumettre'
  );

  select * into f from public.supplier_invoices where id = p_invoice_id for update;

  if not found then
    raise exception 'Facture fournisseur introuvable.' using errcode = 'no_data_found';
  end if;

  if f.status <> 'DRAFT' then
    raise exception
      'Opération refusée : seule une facture en brouillon peut être soumise au contrôle.'
      using errcode = 'check_violation';
  end if;

  update public.supplier_invoices
     set status            = 'PENDING',
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = f.id;
end;
$$;

comment on function public.submit_supplier_invoice is
  'Passe une facture de « Brouillon » à « En attente ». Dernier geste de la saisie : `update`, jamais `validate`.';


/**
 * Valide une facture — la dette est reconnue.
 *
 * POURQUOI `view` EST EXIGÉE EN PLUS.
 *
 * La validation contrôle qu'un montant brut existe (Règles finance §8), et ce
 * montant est la somme des lignes, lues sous les droits de l'appelant. Sans
 * `view`, la somme vaudrait 0 et la validation serait refusée sans que rien ne
 * l'explique. L'exiger rend la règle lisible plutôt que subie : on ne valide
 * pas une facture qu'on n'a pas le droit de lire.
 *
 * Ce n'est PAS une capacité impliquée par une autre (DEC-024) : les deux sont
 * attribuées séparément, et la fonction exige les deux, nommément.
 */
create or replace function public.validate_supplier_invoice(
  p_invoice_id uuid,
  p_reason     text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  f       public.supplier_invoices%rowtype;
  v_gross bigint;
begin
  perform public.require_capability(
    array['billing.supplier_invoices.validate'], 'valider une facture fournisseur'
  );
  perform public.require_capability(
    array['billing.supplier_invoices.view'], 'consulter la facture à valider'
  );

  select * into f from public.supplier_invoices where id = p_invoice_id for update;

  if not found then
    raise exception 'Facture fournisseur introuvable.' using errcode = 'no_data_found';
  end if;

  if f.status <> 'PENDING' then
    raise exception
      'Opération refusée : seule une facture soumise au contrôle peut être validée.'
      using errcode = 'check_violation';
  end if;

  v_gross := public.supplier_invoice_gross(f.id);

  if v_gross <= 0 then
    raise exception
      'Opération refusée : cette facture ne porte aucune ligne. Un montant brut est nécessaire à sa validation (Règles finance §8).'
      using errcode = 'check_violation';
  end if;

  update public.supplier_invoices
     set status            = 'VALIDATED',
         validated_at      = now(),
         validated_by      = public.current_actor(),
         status_reason     = nullif(btrim(coalesce(p_reason, '')), ''),
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = f.id;
end;
$$;

comment on function public.validate_supplier_invoice is
  'Valide une facture reçue : la dette est reconnue et la facture devient imputable (§32). Ne déclenche aucun paiement.';


/** Annule une facture sans l'effacer — Module 07 §31. */
create or replace function public.cancel_supplier_invoice(
  p_invoice_id uuid,
  p_reason     text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  f public.supplier_invoices%rowtype;
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

  -- Le déclencheur refait le contrôle des imputations rattachées, et c'est lui
  -- qui fait autorité, y compris pour un appel qui ne passerait pas par ici.
  update public.supplier_invoices
     set status            = 'CANCELLED',
         cancelled_at      = now(),
         cancelled_by      = public.current_actor(),
         status_reason     = nullif(btrim(coalesce(p_reason, '')), ''),
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = f.id;
end;
$$;

comment on function public.cancel_supplier_invoice is
  'Annule une facture sans l''effacer. Refusée tant qu''une imputation la réduit : chaque déduction doit d''abord en être détachée.';


/**
 * Rattache une imputation validée à une facture — Workflow 06 §24, §32.
 *
 * C'EST LE SEUL ACTE DU SYSTÈME QUI RÉDUISE UN MONTANT DÛ (DEC-013).
 *
 * Il n'est pas un paiement, et ne le devient jamais : Module 07 §37 exige que
 * l'imputation soit « enregistrée comme une opération distincte du paiement ».
 * Aucune écriture financière n'est produite, aucun compte n'est mouvementé.
 *
 * TROIS CAPACITÉS, NOMMÉMENT.
 *
 *   `billing.imputations.update`        l'acte lui-même
 *   `billing.imputations.view`          le déjà-imputé de la facture (§20)
 *   `billing.supplier_invoices.view`    le montant de la facture (§20)
 *
 * Les deux dernières ne sont pas du décor : sans elles, les sommes seraient
 * muettes et le plafond de §20 s'appliquerait à zéro. Un plafond invisible
 * n'est pas un plafond infini.
 */
create or replace function public.attach_imputation_to_invoice(
  p_imputation_id uuid,
  p_invoice_id    uuid
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  i        public.imputations%rowtype;
  v_status public.supplier_invoice_status;
  v_supp   uuid;
  v_gross  bigint;
  v_others bigint;
begin
  perform public.require_capability(
    array['billing.imputations.update'], 'rattacher une imputation à une facture fournisseur'
  );
  perform public.require_capability(
    array['billing.imputations.view'], 'consulter les imputations déjà portées par la facture'
  );
  perform public.require_capability(
    array['billing.supplier_invoices.view'], 'consulter la facture fournisseur'
  );

  select * into i from public.imputations where id = p_imputation_id for update;

  if not found then
    raise exception 'Imputation introuvable.' using errcode = 'no_data_found';
  end if;

  -- §12 : une imputation non validée n'est pas déduite. On ne rattache donc
  -- qu'une imputation contrôlée.
  if i.status <> 'VALIDATED' then
    raise exception
      'Opération refusée : seule une imputation validée et en attente de facture peut être rattachée (Workflow 06 §31).'
      using errcode = 'check_violation';
  end if;

  if i.supplier_invoice_id is not null then
    raise exception
      'Opération refusée : cette imputation est déjà rattachée à une facture.'
      using errcode = 'check_violation';
  end if;

  select f.status, f.supplier_id into v_status, v_supp
  from public.supplier_invoices f where f.id = p_invoice_id;

  if v_status is null then
    raise exception
      'La facture fournisseur visée est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if v_status <> 'VALIDATED' then
    raise exception
      'Opération refusée : seule une facture fournisseur validée peut recevoir une imputation (Workflow 06 §32).'
      using errcode = 'check_violation';
  end if;

  if v_supp is distinct from i.supplier_id then
    raise exception
      'Opération refusée : cette facture n''est pas celle du fournisseur auquel la dépense est imputée (Workflow 06 §24).'
      using errcode = 'check_violation';
  end if;

  /*
   * Contrôle anticipé, pour un message compréhensible (CLAUDE.md §43). Le
   * déclencheur le refait : c'est lui qui fait autorité, y compris pour un
   * appel qui ne passerait pas par ici.
   */
  v_gross := public.supplier_invoice_gross(p_invoice_id);
  v_others := public.supplier_invoice_imputed(p_invoice_id);

  if v_others + i.amount > v_gross then
    raise exception
      'Opération refusée : le total imputé (% KMF) dépasserait le montant de la facture (% KMF). Aucun crédit ni report n''est créé automatiquement (Workflow 06 §20).',
      v_others + i.amount, v_gross
      using errcode = 'check_violation';
  end if;

  update public.imputations
     set status              = 'IMPUTED',
         supplier_invoice_id = p_invoice_id,
         imputed_at          = now(),
         imputed_by          = public.current_actor(),
         status_changed_at   = now(),
         status_changed_by   = public.current_actor(),
         updated_by          = public.current_actor()
   where id = i.id;
end;
$$;

comment on function public.attach_imputation_to_invoice is
  'Rattache une imputation validée à une facture validée du même fournisseur : le net à payer diminue (DEC-013). N''est jamais un paiement.';


/**
 * Détache une imputation de sa facture — la procédure contrôlée de §39.
 *
 * L'imputation retrouve exactement son état antérieur : validée, en attente de
 * facture (§31). Le net à payer de la facture remonte d'autant. Rien n'est
 * effacé — le journal d'audit conserve l'avant, l'après et l'auteur.
 *
 * Ce n'est PAS une contrepassation (§41), qui suppose une écriture inverse dans
 * une comptabilité que le système ne tient pas encore.
 */
create or replace function public.detach_imputation_from_invoice(
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
    array['billing.imputations.update'], 'détacher une imputation de sa facture fournisseur'
  );
  perform public.require_capability(
    array['billing.imputations.view'], 'consulter l''imputation à détacher'
  );

  select * into i from public.imputations where id = p_imputation_id for update;

  if not found then
    raise exception 'Imputation introuvable.' using errcode = 'no_data_found';
  end if;

  if i.status <> 'IMPUTED' then
    raise exception
      'Opération refusée : seule une imputation rattachée à une facture peut en être détachée.'
      using errcode = 'check_violation';
  end if;

  update public.imputations
     set status              = 'VALIDATED',
         supplier_invoice_id = null,
         imputed_at          = null,
         imputed_by          = null,
         status_reason       = nullif(btrim(coalesce(p_reason, '')), ''),
         status_changed_at   = now(),
         status_changed_by   = public.current_actor(),
         updated_by          = public.current_actor()
   where id = i.id;
end;
$$;

comment on function public.detach_imputation_from_invoice is
  'Rend une imputation à « en attente de facture » (§31) et restitue le net à payer. Procédure contrôlée de §39, à défaut de contrepassation (§41).';


-- =============================================================================
-- DROITS D'EXÉCUTION — DEC-022
--
-- « Un droit ne se retire pas en général : il se retire à chaque source qui
-- l'accorde. » PostgreSQL accorde EXECUTE à PUBLIC sur toute fonction créée.
-- =============================================================================

revoke execute on function public.supplier_invoice_gross(uuid) from public;
grant  execute on function public.supplier_invoice_gross(uuid) to authenticated, service_role;

revoke execute on function public.supplier_invoice_imputed(uuid) from public;
grant  execute on function public.supplier_invoice_imputed(uuid) to authenticated, service_role;

revoke execute on function public.create_supplier_invoice(uuid, date, date, text, text) from public;
grant  execute on function public.create_supplier_invoice(uuid, date, date, text, text)
  to authenticated, service_role;

revoke execute on function public.update_supplier_invoice(uuid, date, date, text, text) from public;
grant  execute on function public.update_supplier_invoice(uuid, date, date, text, text)
  to authenticated, service_role;

revoke execute on function public.add_supplier_invoice_line(uuid, text, bigint, uuid) from public;
grant  execute on function public.add_supplier_invoice_line(uuid, text, bigint, uuid)
  to authenticated, service_role;

revoke execute on function public.archive_supplier_invoice_line(uuid) from public;
grant  execute on function public.archive_supplier_invoice_line(uuid)
  to authenticated, service_role;

revoke execute on function public.submit_supplier_invoice(uuid) from public;
grant  execute on function public.submit_supplier_invoice(uuid) to authenticated, service_role;

revoke execute on function public.validate_supplier_invoice(uuid, text) from public;
grant  execute on function public.validate_supplier_invoice(uuid, text)
  to authenticated, service_role;

revoke execute on function public.cancel_supplier_invoice(uuid, text) from public;
grant  execute on function public.cancel_supplier_invoice(uuid, text)
  to authenticated, service_role;

revoke execute on function public.attach_imputation_to_invoice(uuid, uuid) from public;
grant  execute on function public.attach_imputation_to_invoice(uuid, uuid)
  to authenticated, service_role;

revoke execute on function public.detach_imputation_from_invoice(uuid, text) from public;
grant  execute on function public.detach_imputation_from_invoice(uuid, text)
  to authenticated, service_role;


-- =============================================================================
-- COUCHE 4 · RLS
--
-- Les policies d'écriture restent larges — une table sert plusieurs actes, et
-- PostgreSQL n'accepte qu'une policy d'UPDATE par table. Ce sont les
-- déclencheurs de transition qui exigent, eux, la capacité correspondant à
-- l'acte réellement demandé (migration 041 : « une policy large n'est pas une
-- permission d'acte »).
-- =============================================================================

revoke all    on public.supplier_invoices      from anon;
revoke all    on public.supplier_invoice_lines from anon;

revoke delete on public.supplier_invoices      from authenticated;
revoke delete on public.supplier_invoice_lines from authenticated;

alter table public.supplier_invoices      enable row level security;
alter table public.supplier_invoice_lines enable row level security;

create policy supplier_invoices_select on public.supplier_invoices
  for select to authenticated
  using (public.has_permission('billing.supplier_invoices.view'));

create policy supplier_invoices_insert on public.supplier_invoices
  for insert to authenticated
  with check (public.has_permission('billing.supplier_invoices.create'));

create policy supplier_invoices_update on public.supplier_invoices
  for update to authenticated
  using (
    public.has_permission('billing.supplier_invoices.update')
    or public.has_permission('billing.supplier_invoices.validate')
    or public.has_permission('billing.supplier_invoices.cancel')
  )
  with check (
    public.has_permission('billing.supplier_invoices.update')
    or public.has_permission('billing.supplier_invoices.validate')
    or public.has_permission('billing.supplier_invoices.cancel')
  );

-- Les lignes suivent la facture : les voir relève de `view`, les saisir de la
-- création ou de la modification, les retirer de la modification.
create policy supplier_invoice_lines_select on public.supplier_invoice_lines
  for select to authenticated
  using (public.has_permission('billing.supplier_invoices.view'));

create policy supplier_invoice_lines_insert on public.supplier_invoice_lines
  for insert to authenticated
  with check (
    public.has_permission('billing.supplier_invoices.create')
    or public.has_permission('billing.supplier_invoices.update')
  );

create policy supplier_invoice_lines_update on public.supplier_invoice_lines
  for update to authenticated
  using (public.has_permission('billing.supplier_invoices.update'))
  with check (public.has_permission('billing.supplier_invoices.update'));


-- =============================================================================
-- CONTRÔLE DE NON-RÉGRESSION DU CATALOGUE
--
-- Le LOT 5 n'ajoute aucune permission : les six codes
-- `billing.supplier_invoices.*` existent depuis la migration 007. Une migration
-- qui laisserait le catalogue dans un état inattendu doit échouer avant de le
-- figer.
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
    'billing.supplier_invoices.view',
    'billing.supplier_invoices.create',
    'billing.supplier_invoices.update',
    'billing.supplier_invoices.validate',
    'billing.supplier_invoices.cancel',
    'billing.supplier_invoices.export'
  ]) c
  where not exists (select 1 from public.permissions p where p.code = c);

  if v_missing is not null then
    raise exception 'Capacités de facturation fournisseur absentes du catalogue : %', v_missing;
  end if;

  -- La règle de numérotation existe depuis la migration 005 et n'a jamais été
  -- consommée. Sa consommation commence ici : son absence casserait la
  -- création dès le premier appel.
  if not exists (
    select 1 from public.numbering_rules where entity_key = 'supplier_invoice'
  ) then
    raise exception 'Règle de numérotation « supplier_invoice » absente.';
  end if;
end $$;
