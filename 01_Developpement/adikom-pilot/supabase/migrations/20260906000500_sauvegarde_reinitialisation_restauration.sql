-- =============================================================================
-- ADIKOM PILOT — 075 · Sauvegarde, réinitialisation, restauration
-- Module 09 · Paramètres — LOT 18
--
-- CE QUE CETTE MIGRATION LIVRE
--
--   · EXPORTER   — une sauvegarde JSON complète des données métier ;
--   · RÉINITIALISER — la suppression de ces mêmes données, et d'elles seules ;
--   · RESTAURER  — la réécriture d'une sauvegarde, en une seule transaction.
--
-- LES TROIS ACTES SONT RÉSERVÉS AU SUPER ADMIN, ET LE SONT DEUX FOIS
--
-- 1. `EXECUTE` est retiré à `public`, `anon` et `authenticated`. Aucune session
--    applicative — donc aucun appel direct à l'API, aucun `curl`, aucun jeton
--    d'utilisateur — ne peut atteindre ces fonctions. Seule la clé de service
--    le peut, et elle ne quitte jamais le serveur (CLAUDE.md §25).
--
-- 2. Chaque fonction REVÉRIFIE que l'auteur qu'on lui déclare est bien un
--    Super Admin ACTIF (`assert_backup_operator`). La couche applicative l'a
--    déjà contrôlé ; la base ne lui fait pas confiance pour autant (§19).
--
-- CE QUI N'EST JAMAIS TOUCHÉ — LA RÈGLE ABSOLUE DU LOT
--
-- `app_users` n'appartient à AUCUN des trois périmètres. Ni l'export, ni la
-- réinitialisation, ni la restauration ne lisent, ne suppriment ni n'écrivent
-- un compte. Le Super Admin — comme tout autre utilisateur — traverse les trois
-- opérations sans être vu. Sa capacité à se connecter ne dépend donc d'aucune
-- d'elles, et aucun fichier JSON ne peut la lui retirer.
--
-- Sont également hors périmètre : le catalogue des permissions, les groupes,
-- les rattachements, les départements et le journal d'audit.
--
-- CE QU'UNE RESTAURATION EST, ET CE QU'ELLE N'EST PAS
--
-- Une restauration n'est pas un acte métier : elle ne crée pas une facture,
-- elle REMET une facture qui a existé. Les gardes qui interdisent à une facture
-- de « naître émise » disent une vérité du cycle de vie — elles ne disent rien
-- d'une reprise après sinistre. Elles sont donc levées, et elles seules, dans
-- un contexte nommé (`is_restoring()`) qu'aucune session applicative ne peut
-- ouvrir : il exige à la fois l'absence d'utilisateur authentifié ET un réglage
-- que seule la clé de service peut poser.
--
-- LES GARDES DE COHÉRENCE, ELLES, RESTENT ENTIÈRES
--
-- C'est ce qui protège la base d'un fichier JSON fabriqué :
--
--   · une écriture doit porter le compte, le montant et le sens de l'opération
--     dont elle se réclame (`fn_treasury_entry_source`) ;
--   · un virement validé porte exactement ses deux écritures
--     (`assert_transfer_entries`, contrôle différé au COMMIT) ;
--   · une imputation ne dépasse pas le coût imputable (`fn_imputation_ceiling`) ;
--   · toute clé étrangère, toute contrainte de domaine, tout `check` s'applique.
--
-- Un fichier incohérent ne passe donc pas : il échoue, et la transaction
-- entière est annulée. La base ne reste jamais à moitié restaurée.
-- =============================================================================


-- =============================================================================
-- 1. LE CONTEXTE DE RESTAURATION
--
-- Deux conditions, et il en faut DEUX.
--
--   · `current_actor() is null` — aucune session applicative. Un utilisateur
--     connecté, fût-il Super Admin, ne satisfait jamais cette condition.
--   · le réglage `adikom.restore` vaut « on » — posé localement à la
--     transaction par `admin_restore_backup`, et par elle seule.
--
-- `set_config` n'est pas exposé par PostgREST : aucun appel d'API ne peut poser
-- ce réglage. Et le poser ne suffirait pas — il faudrait encore n'être personne.
-- =============================================================================

create or replace function public.is_restoring()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.current_actor() is null
     and coalesce(current_setting('adikom.restore', true), 'off') = 'on';
$$;

comment on function public.is_restoring() is
  'Vrai pendant une restauration de sauvegarde, et alors seulement. Lève les gardes de CYCLE DE VIE, jamais les gardes de cohérence.';

revoke execute on function public.is_restoring() from public;
grant  execute on function public.is_restoring() to authenticated, service_role;


-- =============================================================================
-- 2. LES GARDES DE CYCLE DE VIE ACCEPTENT LA REPRISE
--
-- Chacune de ces fonctions dit la même chose : « cet objet ne naît pas dans cet
-- état ». C'est vrai d'une création ; c'est faux d'une remise en place. Aucune
-- ne porte de règle de cohérence : lever leur seule règle ne relâche rien
-- d'autre.
-- =============================================================================

create or replace function public.fn_customer_invoice_starts_draft()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_restoring() then return new; end if;

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


create or replace function public.fn_supplier_invoice_starts_draft()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_restoring() then return new; end if;

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


create or replace function public.fn_imputation_starts_draft()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_restoring() then return new; end if;

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


create or replace function public.fn_internal_transfer_starts_draft()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_restoring() then return new; end if;

  if new.status <> 'DRAFT' then
    raise exception
      'Opération refusée : un virement interne se saisit en brouillon, puis se valide. Les fonds ne bougent qu''à la validation (Module 06 §30, §31).'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;


create or replace function public.fn_misc_payment_starts_draft()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_restoring() then return new; end if;

  if new.status <> 'DRAFT' then
    raise exception
      'Opération refusée : un paiement divers se saisit en brouillon, puis se valide (Module 07 §46).'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;


create or replace function public.fn_customer_payment_starts_validated()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_restoring() then return new; end if;

  if new.status <> 'VALIDATED' then
    raise exception
      'Opération refusée : un règlement constate un encaissement effectué. Il naît validé, et s''annule ensuite si nécessaire.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;


create or replace function public.fn_supplier_payment_starts_validated()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_restoring() then return new; end if;

  if new.status <> 'VALIDATED' then
    raise exception
      'Opération refusée : un règlement constate un décaissement effectué. Il naît validé, et s''annule ensuite si nécessaire.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;


-- --- Les verrous d'étape ------------------------------------------------------
--
-- « Les lignes d'une facture émise sont figées », « les données financières
-- d'une maintenance terminée sont verrouillées » : ces règles protègent le
-- passé contre une RÉÉCRITURE. Elles n'ont rien à dire d'une remise en place à
-- l'identique. Le contrôle d'EXISTENCE du parent, lui, demeure dans tous les
-- cas — c'est une cohérence, pas une étape.

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

  if v_status <> 'DRAFT' and not public.is_restoring() then
    raise exception
      'Opération refusée : les lignes d''une facture émise ou annulée sont figées. Une facture émise ne se recalcule pas (Workflow 07 §8, §72).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;


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

  if v_status not in ('DRAFT', 'PENDING') and not public.is_restoring() then
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

  if v_status <> 'DRAFT' and v_status <> 'TO_VALIDATE' and not public.is_restoring() then
    raise exception
      'Opération refusée : les justificatifs d''une imputation validée, imputée ou annulée sont figés (Workflow 06 §39).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;


create or replace function public.fn_maintenance_financials_locked()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status public.maintenance_status;
begin
  select status into v_status
  from public.vehicle_maintenances
  where id = coalesce(new.maintenance_id, old.maintenance_id);

  if v_status in ('COMPLETED', 'CANCELLED') and not public.is_restoring() then
    raise exception
      'Opération refusée : les données financières d''une maintenance terminée ou annulée sont verrouillées.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;


-- --- Les rattachements qui supposent une étape --------------------------------
--
-- « Seule une location À FACTURER se facture » ; « seule une facture VALIDÉE
-- reçoit une imputation ». Ces deux règles gouvernent l'ACTE. Une fois l'acte
-- accompli, la location se clôture et la facture se règle : la sauvegarde
-- rapporte donc des rattachements parfaitement légitimes dont l'objet a, depuis,
-- changé d'état. Les rejouer dans l'ordre du cycle est impossible — le cycle
-- est terminé.
--
-- L'IDENTITÉ, ELLE, RESTE EXIGÉE : la facture doit rester celle du client de la
-- location, et l'imputation celle du fournisseur de la facture. C'est la chaîne
-- que §49 et Workflow 06 §24 protègent, et elle ne se lève jamais.

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

  if v_status <> 'TO_INVOICE' and not public.is_restoring() then
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


-- L'imputation : SEUL l'état de la facture est levé. Le fournisseur, le
-- plafond, le rattachement du véhicule et l'interdiction d'imputer une
-- maintenance annulée demeurent — ce sont eux qui rendent l'imputation
-- explicable (CLAUDE.md §16, Workflow 06 §20, §24, §33).

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

    -- §32 : la facture doit exister en tant que dette reconnue. En restauration,
    -- elle a pu être réglée depuis : l'étape est levée, l'identité ne l'est pas.
    if v_inv_status <> 'VALIDATED' and not public.is_restoring() then
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
   * annule et à celui qui rattache — exactement ce que DEC-024 proscrit.
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


-- --- L'écriture de trésorerie -------------------------------------------------
--
-- SEUL l'état de l'opération d'origine est levé. Le compte, le montant, le sens
-- et le genre restent exigés : c'est cette partie-là qui ferme la fabrication
-- d'écritures par un fichier fabriqué (Module 06 §20, §31, Workflow 08 §47).

create or replace function public.fn_treasury_entry_source()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  sp public.supplier_payments%rowtype;
  cp public.customer_payments%rowtype;
  tr public.internal_transfers%rowtype;
  mp public.misc_payments%rowtype;
begin
  if (case when new.supplier_payment_id  is not null then 1 else 0 end)
   + (case when new.customer_payment_id  is not null then 1 else 0 end)
   + (case when new.internal_transfer_id is not null then 1 else 0 end)
   + (case when new.misc_payment_id      is not null then 1 else 0 end) > 1 then
    raise exception
      'Opération refusée : une écriture ne provient que d''une seule opération (Module 06 §20).'
      using errcode = 'check_violation';
  end if;

  if new.supplier_payment_id is null
     and new.customer_payment_id is null
     and new.internal_transfer_id is null
     and new.misc_payment_id is null then
    if new.kind in ('SUPPLIER_PAYMENT', 'CUSTOMER_PAYMENT', 'MISC_PAYMENT', 'TRANSFER') then
      raise exception
        'Opération refusée : une écriture de règlement, de paiement divers ou de virement doit désigner l''opération dont elle provient (Module 06 §20).'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.supplier_payment_id is not null then
    select * into sp from public.supplier_payments where id = new.supplier_payment_id;

    if not found then
      raise exception
        'Le règlement dont se réclame cette écriture est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;

    if new.kind <> 'SUPPLIER_PAYMENT'
       or new.direction <> 'OUT'
       or new.amount is distinct from sp.amount
       or new.account_id is distinct from sp.account_id then
      raise exception
        'Opération refusée : cette écriture ne correspond pas au règlement dont elle se réclame. Un règlement fournisseur est une SORTIE, du montant réglé, sur le compte mouvementé (Workflow 08 §47).'
        using errcode = 'check_violation';
    end if;

    return new;
  end if;

  if new.customer_payment_id is not null then
    select * into cp from public.customer_payments where id = new.customer_payment_id;

    if not found then
      raise exception
        'Le règlement dont se réclame cette écriture est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;

    if new.kind <> 'CUSTOMER_PAYMENT'
       or new.direction <> 'IN'
       or new.amount is distinct from cp.amount
       or new.account_id is distinct from cp.account_id then
      raise exception
        'Opération refusée : cette écriture ne correspond pas au règlement dont elle se réclame. Un encaissement client est une ENTRÉE, du montant reçu, sur le compte mouvementé (Workflow 08 §47).'
        using errcode = 'check_violation';
    end if;

    return new;
  end if;

  if new.misc_payment_id is not null then
    select * into mp from public.misc_payments where id = new.misc_payment_id;

    if not found then
      raise exception
        'Le paiement divers dont se réclame cette écriture est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;

    -- À la CRÉATION seulement : une écriture ne devance pas la validation.
    -- Sur `UPDATE`, l'écriture ne fait que suivre l'annulation du paiement.
    -- Une restauration, elle, remet un état déjà advenu.
    if tg_op = 'INSERT' and mp.status <> 'VALIDATED' and not public.is_restoring() then
      raise exception
        'Opération refusée : un paiement divers ne produit son écriture qu''à sa VALIDATION. Un brouillon ne déplace aucun fonds (Module 07 §45, §46).'
        using errcode = 'check_violation';
    end if;

    if new.kind <> 'MISC_PAYMENT'
       or new.direction <> 'OUT'
       or new.amount is distinct from mp.amount
       or new.account_id is distinct from mp.account_id then
      raise exception
        'Opération refusée : cette écriture ne correspond pas au paiement divers dont elle se réclame. Un paiement divers est une SORTIE, du montant payé, sur le compte source (Module 07 §45).'
        using errcode = 'check_violation';
    end if;

    return new;
  end if;

  -- --- Virement interne ------------------------------------------------------
  select * into tr from public.internal_transfers where id = new.internal_transfer_id;

  if not found then
    raise exception
      'Le virement dont se réclame cette écriture est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if tg_op = 'INSERT' and tr.status <> 'VALIDATED' and not public.is_restoring() then
    raise exception
      'Opération refusée : un virement ne produit ses écritures qu''à sa VALIDATION. Un brouillon ne déplace aucun fonds (Module 06 §31).'
      using errcode = 'check_violation';
  end if;

  if new.kind <> 'TRANSFER' or new.amount is distinct from tr.amount then
    raise exception
      'Opération refusée : cette écriture ne correspond pas au virement dont elle se réclame. Les deux moitiés portent le montant transféré (Module 06 §31).'
      using errcode = 'check_violation';
  end if;

  if not (
       (new.account_id = tr.source_account_id      and new.direction = 'OUT')
    or (new.account_id = tr.destination_account_id and new.direction = 'IN')
  ) then
    raise exception
      'Opération refusée : un virement sort du compte source et entre sur le compte destination (Module 06 §31). Aucun autre mouvement ne s''y rattache.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_treasury_entry_source is
  'Une écriture issue d''une opération en reprend le compte, le montant et le sens (§20, §31, §47). L''état de l''origine n''est exigé qu''à la création, hors restauration.';


-- =============================================================================
-- 3. LE PÉRIMÈTRE — UNE SEULE LISTE, ORDONNÉE DES PARENTS VERS LES ENFANTS
--
-- Cette liste est l'unique source de vérité des trois opérations : ce qui est
-- exporté est exactement ce qui est supprimé, et exactement ce qui peut être
-- restauré. Aucune des trois ne peut donc porter sur une table que les deux
-- autres ignorent.
--
-- L'ORDRE COMPTE. L'export et la restauration la parcourent à l'endroit, la
-- réinitialisation à l'envers : une table n'est jamais vidée avant celles qui
-- la référencent, ni remplie avant celles qu'elle référence.
--
-- CE QUI N'Y FIGURE PAS, ET POURQUOI
--
--   `app_users`, `user_groups`, `user_permissions`, `user_departments`
--       Les comptes et leurs droits. LE SUPER ADMIN EST ICI, ET NULLE PART
--       AILLEURS : aucune des trois opérations ne l'atteint.
--   `permissions`, `groups`, `group_permissions`, `departments`
--       Le catalogue des capacités et l'organisation. Ils sont posés par les
--       migrations et par l'administration des utilisateurs, pas par l'activité.
--   `company_settings`, `numbering_rules`
--       Configuration. Exportée et restaurable, mais jamais supprimée : un SaaS
--       réinitialisé reste configuré (§4 ci-dessous).
--   `audit_log`
--       Inviolable par construction (`fn_forbid_mutation`, Audit §40, §77). Le
--       journal survit à la réinitialisation : c'est lui qui en garde la trace.
-- =============================================================================

create or replace function public.backup_scope()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array[
    -- Référentiel
    'vehicle_categories',
    'clients',
    'suppliers',
    'partners',
    'supplier_payment_details',
    'vehicles',
    'vehicle_supplier_history',
    'vehicle_documents',
    'pricing_rules',
    'financial_accounts',
    -- Cycle d'exploitation
    'reservations',
    'rentals',
    'rental_inspections',
    'rental_inspection_photos',
    'vehicle_occupations',
    'vehicle_incidents',
    'incident_damages',
    'incident_photos',
    'vehicle_maintenances',
    'maintenance_quotes',
    'maintenance_costs',
    'maintenance_cost_lines',
    'maintenance_documents',
    -- Facturation et imputation
    'supplier_invoices',
    'supplier_invoice_lines',
    'imputations',
    'imputation_documents',
    'customer_invoices',
    'customer_invoice_lines',
    -- Trésorerie
    'supplier_payments',
    'customer_payments',
    'internal_transfers',
    'misc_payments',
    'treasury_entries',
    -- Projets et planification
    'projects',
    'project_members',
    'project_tasks',
    'project_meetings',
    'project_meeting_participants',
    'project_appointments',
    'project_appointment_participants',
    'project_decisions',
    'project_actions',
    -- Lecture des notifications
    'notification_reads'
  ]::text[];
$$;

comment on function public.backup_scope() is
  'Tables métier de la sauvegarde, ordonnées des parents vers les enfants. Ni les comptes, ni les permissions, ni le journal d''audit n''y figurent.';

revoke execute on function public.backup_scope() from public, anon, authenticated;
grant  execute on function public.backup_scope() to service_role;


-- --- Les colonnes réellement écrivables d'une table --------------------------
--
-- `pricing_rules.specificity` est CALCULÉE : elle classe une règle tarifaire de
-- la plus précise à la plus générale, et la base refuse — à juste titre — qu'on
-- lui impose une valeur. Une restauration qui écrirait « toutes les colonnes »
-- échouerait donc sur cette seule table.
--
-- La liste est lue dans le schéma plutôt que recopiée : une colonne calculée
-- ajoutée demain sera écartée sans qu'on ait à y penser.

create or replace function public.backup_columns(p_table text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = p_table
    and a.attnum > 0
    and not a.attisdropped
    and a.attgenerated = ''
    and a.attidentity <> 'a';
$$;

comment on function public.backup_columns(text) is
  'Colonnes écrivables d''une table du périmètre : les colonnes calculées et les identités imposées en sont exclues.';

revoke execute on function public.backup_columns(text) from public, anon, authenticated;
grant  execute on function public.backup_columns(text) to service_role;


-- =============================================================================
-- 4. L'AUTEUR — SUPER ADMIN ACTIF, VÉRIFIÉ EN BASE
--
-- L'application a déjà contrôlé la session. Ce second contrôle ne la double pas
-- par méfiance envers elle, mais parce qu'une garde qui ne tient que dans une
-- couche ne tient pas (§19, Règles permissions §85).
-- =============================================================================

create or replace function public.assert_backup_operator(p_actor_id uuid)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_label text;
begin
  select u.first_name || ' ' || u.last_name
    into v_label
  from public.app_users u
  where u.id = p_actor_id
    and u.is_super_admin
    and u.status = 'ACTIVE';

  if v_label is null then
    raise exception
      'Opération refusée : la sauvegarde, la réinitialisation et la restauration sont réservées au Super Admin.'
      using errcode = 'insufficient_privilege';
  end if;

  return v_label;
end;
$$;

comment on function public.assert_backup_operator(uuid) is
  'Exige un Super Admin ACTIF. Seconde barrière des opérations de sauvegarde, indépendante de la couche applicative.';

revoke execute on function public.assert_backup_operator(uuid) from public, anon, authenticated;
grant  execute on function public.assert_backup_operator(uuid) to service_role;


-- =============================================================================
-- 5. EXPORTER
--
-- Le format est VERSIONNÉ : un fichier plus récent que le système sera refusé
-- à la restauration plutôt que mal interprété.
--
-- Aucun mot de passe, aucun jeton, aucune clé : ces données n'existent dans
-- aucune des tables du périmètre. Le fichier contient en revanche des données
-- CONFIDENTIELLES — coordonnées de règlement des fournisseurs, montants,
-- références bancaires d'ADIKOM. L'interface le dit à qui le télécharge.
-- =============================================================================

create or replace function public.admin_backup_export(p_actor_id uuid)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_label   text;
  v_table   text;
  v_rows    jsonb;
  v_data    jsonb := '{}'::jsonb;
  v_counts  jsonb := '{}'::jsonb;
  v_total   bigint := 0;
begin
  v_label := public.assert_backup_operator(p_actor_id);

  foreach v_table in array public.backup_scope() loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t',
      v_table
    ) into v_rows;

    v_data   := v_data   || jsonb_build_object(v_table, v_rows);
    v_counts := v_counts || jsonb_build_object(v_table, jsonb_array_length(v_rows));
    v_total  := v_total + jsonb_array_length(v_rows);
  end loop;

  -- La configuration voyage à part : elle n'est ni supprimée par la
  -- réinitialisation, ni indispensable à la restauration des données.
  insert into public.audit_log (
    actor_id, actor_label, action, result, module_code,
    entity_type, entity_id, entity_label, after_data, reason
  )
  values (
    p_actor_id, v_label, 'EXPORT', 'SUCCESS', 'settings',
    'backup', null, 'Sauvegarde JSON',
    jsonb_build_object('lignes', v_total, 'tables', jsonb_array_length(to_jsonb(public.backup_scope()))),
    'Téléchargement d''une sauvegarde complète des données métier.'
  );

  return jsonb_build_object(
    'format',        'adikom-pilot.sauvegarde',
    'version',       1,
    'created_at',    now(),
    'created_by',    v_label,
    'total_lignes',  v_total,
    'compteurs',     v_counts,
    'configuration', jsonb_build_object(
      'company_settings',
        (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.company_settings t),
      'numbering_rules',
        (select coalesce(jsonb_agg(to_jsonb(t) order by t.entity_key), '[]'::jsonb)
         from public.numbering_rules t)
    ),
    'donnees',       v_data
  );
end;
$$;

comment on function public.admin_backup_export(uuid) is
  'Sauvegarde JSON versionnée des données métier. Réservée au Super Admin, journalisée. N''exporte aucun compte ni aucune permission.';

revoke execute on function public.admin_backup_export(uuid) from public, anon, authenticated;
grant  execute on function public.admin_backup_export(uuid) to service_role;


-- =============================================================================
-- 6. RÉINITIALISER
--
-- Une seule transaction : si une table refuse de se vider, RIEN n'est supprimé.
-- La base ne reste jamais à moitié réinitialisée.
--
-- `p_confirmation` doit valoir exactement le mot attendu. Ce n'est pas un
-- ornement d'interface : la garde est EN BASE, et un appel qui l'omettrait
-- serait refusé même avec la clé de service.
--
-- Les suppressions sont possibles parce que `current_actor()` vaut NULL sous la
-- clé de service : `fn_forbid_delete` réserve depuis toujours la suppression aux
-- opérations d'environnement (DEC-020, migration 021). La règle métier reste
-- entière pour toute session applicative — on archive, on ne supprime pas.
-- =============================================================================

create or replace function public.admin_reset_business_data(
  p_actor_id     uuid,
  p_confirmation text
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_label   text;
  v_scope   text[] := public.backup_scope();
  v_table   text;
  v_deleted bigint;
  v_counts  jsonb := '{}'::jsonb;
  v_total   bigint := 0;
  i         int;
begin
  v_label := public.assert_backup_operator(p_actor_id);

  if p_confirmation is distinct from 'REINITIALISER' then
    raise exception
      'Opération refusée : la réinitialisation exige une confirmation explicite.'
      using errcode = 'check_violation';
  end if;

  /*
   * À l'envers de la liste : les enfants avant les parents.
   *
   * `where true` N'EST PAS UNE COQUETTERIE.
   *
   * Les sessions ouvertes par PostgREST chargent `safeupdate`, qui REFUSE tout
   * `DELETE` sans clause `WHERE` — « DELETE requires a WHERE clause ». Une
   * connexion directe, elle, l'accepte : la recette SQL passait donc pendant
   * que l'écran échouait. Le défaut a été trouvé en éprouvant le vrai chemin,
   * celui de l'application, et non le chemin commode.
   */
  for i in reverse array_length(v_scope, 1) .. 1 loop
    v_table := v_scope[i];
    execute format('delete from public.%I where true', v_table);
    get diagnostics v_deleted = row_count;

    if v_deleted > 0 then
      v_counts := v_counts || jsonb_build_object(v_table, v_deleted);
      v_total  := v_total + v_deleted;
    end if;
  end loop;

  insert into public.audit_log (
    actor_id, actor_label, action, result, module_code,
    entity_type, entity_id, entity_label, before_data, reason
  )
  values (
    p_actor_id, v_label, 'DELETE', 'SUCCESS', 'settings',
    'backup', null, 'Réinitialisation des données métier',
    jsonb_build_object('lignes', v_total, 'detail', v_counts),
    'Réinitialisation demandée depuis Paramètres → Sauvegarde. Comptes, permissions, configuration et journal conservés.'
  );

  return jsonb_build_object(
    'total_supprime', v_total,
    'compteurs',      v_counts,
    'preserve',       jsonb_build_array(
      'Comptes utilisateurs, Super Admin compris',
      'Groupes, rattachements et permissions',
      'Catalogue des permissions',
      'Paramètres de l''entreprise et règles de numérotation',
      'Journal d''activité'
    )
  );
end;
$$;

comment on function public.admin_reset_business_data(uuid, text) is
  'Vide les tables métier en une transaction. Ne touche NI aux comptes, NI aux permissions, NI à la configuration, NI au journal.';

revoke execute on function public.admin_reset_business_data(uuid, text) from public, anon, authenticated;
grant  execute on function public.admin_reset_business_data(uuid, text) to service_role;


-- =============================================================================
-- 7. RESTAURER
--
-- LE FICHIER N'EST JAMAIS CRU SUR PAROLE.
--
--   1. la charge est un objet ;
--   2. le format est celui d'ADIKOM PILOT ;
--   3. la version n'est pas postérieure à celle que ce système sait lire ;
--   4. `donnees` est un objet ;
--   5. CHAQUE clé désigne une table DU PÉRIMÈTRE — `app_users`, `permissions`
--      ou `audit_log` dans un fichier valent refus, et non silence ;
--   6. chaque valeur est un tableau.
--
-- Ensuite seulement, la base reprend la main : clés étrangères, contraintes,
-- gardes de cohérence et contrôles différés s'appliquent tous. Un fichier
-- incohérent échoue, et la transaction entière est annulée.
--
-- LES RÉFÉRENCES AUX COMPTES SONT RÉSOLUES, PAS IMPOSÉES.
--
-- Une sauvegarde cite des auteurs (`created_by`, `owner_id`, `assignee_id`…).
-- Restaurée sur une installation où l'un d'eux n'existe plus, elle échouerait
-- entièrement pour une signature manquante. Les références FACULTATIVES vers un
-- compte absent sont donc mises à NULL — la donnée métier est conservée, sa
-- signature est perdue, et le résultat le DIT. Les rares lignes dont l'existence
-- même suppose un compte (participation à une réunion, lecture d'une
-- notification) sont écartées, et comptées.
-- =============================================================================

create or replace function public.admin_restore_backup(
  p_actor_id uuid,
  p_payload  jsonb
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_label     text;
  v_scope     text[] := public.backup_scope();
  v_data      jsonb;
  v_table     text;
  v_key       text;
  v_rows      jsonb;
  v_row       jsonb;
  v_clean     jsonb;
  v_col       text;
  v_columns   text;
  v_optional  text[];
  v_required  text[];
  v_skip      boolean;
  v_inserted  bigint;
  v_counts    jsonb := '{}'::jsonb;
  v_total     bigint := 0;
  v_dropped   bigint := 0;
  v_detached  bigint := 0;
  v_version   int;
begin
  v_label := public.assert_backup_operator(p_actor_id);

  -- --- 1 à 3 : l'enveloppe ---------------------------------------------------
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception
      'Fichier invalide : la sauvegarde attendue est un objet JSON.'
      using errcode = 'check_violation';
  end if;

  if p_payload ->> 'format' is distinct from 'adikom-pilot.sauvegarde' then
    raise exception
      'Fichier invalide : ce fichier n''est pas une sauvegarde ADIKOM PILOT.'
      using errcode = 'check_violation';
  end if;

  begin
    v_version := (p_payload ->> 'version')::int;
  exception when others then
    v_version := null;
  end;

  if v_version is null then
    raise exception
      'Fichier invalide : la version du format de sauvegarde est absente ou illisible.'
      using errcode = 'check_violation';
  end if;

  if v_version > 1 then
    raise exception
      'Fichier refusé : sauvegarde en version %, alors que ce système lit la version 1 au maximum. Mettez l''application à jour avant de restaurer.',
      v_version
      using errcode = 'check_violation';
  end if;

  -- --- 4 à 6 : le contenu ----------------------------------------------------
  v_data := p_payload -> 'donnees';

  if v_data is null or jsonb_typeof(v_data) <> 'object' then
    raise exception
      'Fichier invalide : la section « donnees » est absente ou n''est pas un objet.'
      using errcode = 'check_violation';
  end if;

  for v_key in select jsonb_object_keys(v_data) loop
    if not (v_key = any (v_scope)) then
      raise exception
        'Fichier refusé : « % » ne fait pas partie du périmètre de sauvegarde. Les comptes, les permissions et le journal d''activité ne se restaurent pas.',
        v_key
        using errcode = 'check_violation';
    end if;

    if jsonb_typeof(v_data -> v_key) <> 'array' then
      raise exception
        'Fichier invalide : « % » devrait contenir un tableau de lignes.', v_key
        using errcode = 'check_violation';
    end if;
  end loop;

  -- --- Le contexte de reprise, local à cette transaction ---------------------
  perform set_config('adikom.restore', 'on', true);

  -- --- Table rase, puis réécriture, dans la même transaction -----------------
  perform public.admin_reset_business_data(p_actor_id, 'REINITIALISER');

  foreach v_table in array v_scope loop
    v_rows := v_data -> v_table;
    if v_rows is null or jsonb_array_length(v_rows) = 0 then
      continue;
    end if;

    -- Colonnes qui désignent un compte : facultatives d'un côté, exigées de
    -- l'autre. La distinction est lue dans le schéma, jamais recopiée à la main.
    select
      coalesce(array_agg(a.attname::text) filter (where not a.attnotnull), '{}'),
      coalesce(array_agg(a.attname::text) filter (where a.attnotnull), '{}')
      into v_optional, v_required
    from pg_constraint c
    join pg_class tc on tc.oid = c.conrelid
    join pg_class rc on rc.oid = c.confrelid
    join pg_namespace tn on tn.oid = tc.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and tn.nspname = 'public'
      and tc.relname = v_table
      and rc.relname = 'app_users'
      and array_length(c.conkey, 1) = 1;

    v_clean := '[]'::jsonb;

    for v_row in select value from jsonb_array_elements(v_rows) loop
      v_skip := false;

      foreach v_col in array v_required loop
        if not exists (
          select 1 from public.app_users u where u.id = (v_row ->> v_col)::uuid
        ) then
          v_skip := true;
        end if;
      end loop;

      if v_skip then
        v_dropped := v_dropped + 1;
        continue;
      end if;

      foreach v_col in array v_optional loop
        if v_row ->> v_col is not null and not exists (
          select 1 from public.app_users u where u.id = (v_row ->> v_col)::uuid
        ) then
          v_row := jsonb_set(v_row, array[v_col], 'null'::jsonb);
          v_detached := v_detached + 1;
        end if;
      end loop;

      v_clean := v_clean || jsonb_build_array(v_row);
    end loop;

    if jsonb_array_length(v_clean) = 0 then
      continue;
    end if;

    v_columns := public.backup_columns(v_table);

    execute format(
      'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)',
      v_table, v_columns, v_columns, v_table
    ) using v_clean;

    get diagnostics v_inserted = row_count;
    v_counts := v_counts || jsonb_build_object(v_table, v_inserted);
    v_total  := v_total + v_inserted;
  end loop;

  -- --- La configuration, si le fichier en porte une -------------------------
  perform public.restore_configuration(p_payload -> 'configuration');

  /*
   * LE CONTEXTE SE REFERME ICI, ET NON À LA FIN DE LA TRANSACTION.
   *
   * `set_config(..., true)` est LOCAL À LA TRANSACTION, pas à la fonction : le
   * réglage survivrait donc au retour de `admin_restore_backup` et lèverait les
   * gardes de cycle de vie pour tout ce qui suivrait dans la même transaction.
   * En production, PostgREST ouvre une transaction par appel et le défaut ne se
   * verrait jamais ; la recette, elle, enchaîne dans une seule — c'est elle qui
   * l'a trouvé.
   *
   * Les contrôles DIFFÉRÉS (`assert_transfer_entries`, `assert_misc_payment_entries`)
   * s'exécutent après ce point, au COMMIT. Ils ne consultent pas ce contexte :
   * ce sont des règles de cohérence, et elles s'appliquent toujours.
   */
  perform set_config('adikom.restore', 'off', true);

  insert into public.audit_log (
    actor_id, actor_label, action, result, module_code,
    entity_type, entity_id, entity_label, after_data, reason
  )
  values (
    p_actor_id, v_label, 'RESTORE', 'SUCCESS', 'settings',
    'backup', null, 'Restauration d''une sauvegarde',
    jsonb_build_object(
      'lignes', v_total, 'detail', v_counts,
      'lignes_ecartees', v_dropped, 'signatures_perdues', v_detached
    ),
    'Restauration demandée depuis Paramètres → Sauvegarde. Comptes et permissions inchangés.'
  );

  return jsonb_build_object(
    'total_restaure',     v_total,
    'compteurs',          v_counts,
    'lignes_ecartees',    v_dropped,
    'signatures_perdues', v_detached,
    'version',            v_version
  );
end;
$$;

comment on function public.admin_restore_backup(uuid, jsonb) is
  'Restaure une sauvegarde JSON en une transaction : validation, table rase, réécriture. N''écrit jamais un compte ni une permission.';

revoke execute on function public.admin_restore_backup(uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.admin_restore_backup(uuid, jsonb) to service_role;


-- --- La configuration, restaurée sans jamais reculer un compteur -------------
--
-- « Le compteur n'est pas modifiable — un numéro déjà émis ne se réutilise
-- jamais » (Module 09 §16). Une sauvegarde plus ancienne que la base porte des
-- compteurs plus bas : les appliquer tels quels rouvrirait une série déjà
-- consommée. Le plus grand des deux l'emporte donc, toujours.

create or replace function public.restore_configuration(p_configuration jsonb)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_settings jsonb;
begin
  if p_configuration is null or jsonb_typeof(p_configuration) <> 'object' then
    return;
  end if;

  v_settings := p_configuration -> 'company_settings';

  if v_settings is not null and jsonb_typeof(v_settings) = 'array'
     and jsonb_array_length(v_settings) = 1 then
    update public.company_settings c
       set legal_name             = s.legal_name,
           trade_name             = s.trade_name,
           acronym                = s.acronym,
           description            = s.description,
           activity               = s.activity,
           tagline                = s.tagline,
           internal_code          = s.internal_code,
           address_line1          = s.address_line1,
           address_line2          = s.address_line2,
           city                   = s.city,
           country                = s.country,
           phone                  = s.phone,
           email                  = s.email,
           website                = s.website,
           registration_number    = s.registration_number,
           tax_identifier         = s.tax_identifier,
           legal_form             = s.legal_form,
           administrative_notes   = s.administrative_notes,
           main_activity          = s.main_activity,
           secondary_activities   = s.secondary_activities,
           commercial_description = s.commercial_description,
           invoice_display_name   = s.invoice_display_name,
           invoice_address        = s.invoice_address,
           invoice_footer_notes   = s.invoice_footer_notes,
           invoice_legal_notes    = s.invoice_legal_notes,
           bank_name              = s.bank_name,
           bank_account_holder    = s.bank_account_holder,
           bank_account_details   = s.bank_account_details,
           color_primary          = s.color_primary,
           color_secondary        = s.color_secondary,
           color_accent           = s.color_accent,
           currency_code          = s.currency_code,
           currency_label         = s.currency_label,
           locale                 = s.locale,
           timezone               = s.timezone,
           date_format            = s.date_format
      from jsonb_populate_recordset(null::public.company_settings, v_settings) s
     where c.id;
  end if;

  if p_configuration -> 'numbering_rules' is not null
     and jsonb_typeof(p_configuration -> 'numbering_rules') = 'array' then
    update public.numbering_rules n
       set label         = r.label,
           prefix        = r.prefix,
           include_year  = r.include_year,
           padding       = r.padding,
           separator     = r.separator,
           reset_yearly  = r.reset_yearly,
           -- Le compteur ne recule jamais (§16).
           current_value = greatest(n.current_value, r.current_value),
           current_year  = greatest(coalesce(n.current_year, 0), coalesce(r.current_year, 0))
      from jsonb_populate_recordset(
             null::public.numbering_rules, p_configuration -> 'numbering_rules') r
     where n.entity_key = r.entity_key;
  end if;
end;
$$;

comment on function public.restore_configuration(jsonb) is
  'Réapplique la configuration d''une sauvegarde. Le compteur de numérotation ne recule jamais (Module 09 §16).';

revoke execute on function public.restore_configuration(jsonb) from public, anon, authenticated;
grant  execute on function public.restore_configuration(jsonb) to service_role;


-- =============================================================================
-- 8. `TRUNCATE` RETIRÉ SUR LE PÉRIMÈTRE — DEC-039 §g, appliqué
--
-- Le droit était accordé par défaut à `authenticated`. `TRUNCATE` ne déclenche
-- aucun déclencheur de ligne : il contournerait `fn_forbid_delete` sur toutes
-- les tables métier. Aucun chemin applicatif ne l'expose — PostgREST ne le
-- propose pas —, mais un droit sans usage se retire.
--
-- La passe n'est pas aveugle : elle porte exactement sur les tables du
-- périmètre de sauvegarde, celles dont ce lot se préoccupe. Les tables de
-- gouvernance restent à traiter, et le journal des décisions le dit.
-- =============================================================================

do $$
declare v_table text;
begin
  foreach v_table in array public.backup_scope() loop
    execute format('revoke truncate on public.%I from authenticated', v_table);
  end loop;
end $$;


-- =============================================================================
-- 9. CONTRÔLE DE NON-RÉGRESSION
--
-- AUCUNE PERMISSION N'EST CRÉÉE PAR CE LOT.
--
-- Réinitialiser et restaurer sont réservés au Super Admin par décision
-- (DEC-041). Une capacité n'a de sens que si elle peut être ATTRIBUÉE à
-- quelqu'un (CLAUDE.md §19 bis) ; celle-ci ne le serait jamais. Le catalogue
-- reste donc à 171.
-- =============================================================================

do $$
declare
  v_total int;
  v_scope text[] := public.backup_scope();
  v_table text;
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 171 then
    raise exception 'Catalogue attendu à 171 permissions, obtenu %.', v_total;
  end if;

  -- Toute table du périmètre doit exister : une faute de frappe rendrait la
  -- réinitialisation partielle et l'export incomplet, sans rien dire.
  foreach v_table in array v_scope loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_table and c.relkind = 'r'
    ) then
      raise exception 'Table « % » du périmètre de sauvegarde introuvable.', v_table;
    end if;
  end loop;

  -- Le compte du Super Admin n'appartient à aucun périmètre : c'est la garantie
  -- centrale du lot, et elle se vérifie plutôt qu'elle ne se promet.
  if 'app_users' = any (v_scope) then
    raise exception 'Le périmètre de sauvegarde ne doit jamais contenir « app_users ».';
  end if;

  if 'audit_log' = any (v_scope) or 'permissions' = any (v_scope) then
    raise exception 'Le périmètre de sauvegarde ne doit contenir ni le journal ni le catalogue.';
  end if;
end $$;
