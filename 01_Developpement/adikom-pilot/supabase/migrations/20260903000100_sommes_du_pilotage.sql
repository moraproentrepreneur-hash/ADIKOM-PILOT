-- =============================================================================
-- ADIKOM PILOT — 055 · Les sommes du pilotage
-- Phase 3 — Pilotage · LOT 9 (Module 01 — Tableau de bord)
--
-- CE QUE CETTE MIGRATION AJOUTE, ET CE QU'ELLE N'AJOUTE PAS
--
-- Elle n'ajoute AUCUNE table, AUCUNE colonne, AUCUN statut, AUCUNE permission.
-- Le tableau de bord ne stocke rien : il n'existe pas d'indicateur en base, et
-- il ne s'en écrit jamais. Chaque chiffre est refait à la lecture, sur les
-- mêmes fonctions que les fiches et les listes — `customer_invoice_total`,
-- `customer_invoice_paid`, `supplier_invoice_gross`, `supplier_invoice_imputed`,
-- `supplier_invoice_paid`. Aucune règle métier n'est réécrite ici.
--
-- POURQUOI DES FONCTIONS PLUTÔT QU'UN COMPTAGE CÔTÉ APPLICATION
--
-- Une somme lue par pages est une somme qui ment dès que la page est pleine.
-- Les listes de l'application s'arrêtent à 200 lignes — parfait pour un écran,
-- faux pour un total. Le total se calcule donc là où il n'y a pas de page :
-- dans la base, sur l'ensemble des lignes VISIBLES par l'appelant.
--
-- C'est la leçon de la migration 050, appliquée au pilotage : « un solde ne se
-- calcule pas sur des écritures illisibles ». Une somme partielle présentée
-- comme un total est pire qu'un refus.
--
-- SÉCURITÉ — CHAQUE FONCTION VÉRIFIE SA PROPRE CAPACITÉ
--
-- Aucune n'est `SECURITY DEFINER` (DEC-022) : elles s'exécutent avec les droits
-- de l'appelant, RLS comprise. Et parce que RLS seule répondrait « 0 » à qui
-- n'a rien le droit de lire — un zéro qui se lirait « rien à encaisser » —
-- chacune exige NOMMÉMENT les capacités dont sa somme dépend, et REFUSE plutôt
-- que de répondre à côté (DEC-017, DEC-024).
--
-- Trois capacités du catalogue trouvent ici leur contrôle serveur :
--
--   `dashboard.view`             exigée par les sept fonctions ;
--   `dashboard.fleet.view`       exigée par l'état du parc ;
--   `dashboard.financial.view`   exigée par les quatre sommes financières.
--
-- Elles COMPOSENT, elles n'ouvrent rien : `dashboard.financial.view` ne donne
-- pas accès aux factures, elle autorise à en voir la synthèse. La capacité
-- source reste exigée en plus. Aucune ne rend l'autre superflue (DEC-024).
--
-- HORS SESSION APPLICATIVE
--
-- `current_actor()` vaut NULL pour une migration, un script d'environnement ou
-- la clé de service : `require_capability` s'efface alors, comme partout
-- ailleurs (convention de la migration 021). Les capacités s'éprouvent avec de
-- vraies sessions — `verify:capabilities` et `verify:pilotage`.
--
-- FUSEAU
--
-- « Aujourd'hui » et « en retard » se lisent sur `Indian/Comoro` (DEC-025 §e).
-- Une échéance au 30 n'est pas dépassée le 30.
-- =============================================================================


-- =============================================================================
-- 1. EXPLOITATION — Module 01 §9, §10, §11
--
-- Les six files du quotidien, comptées sur TOUTES les locations visibles.
--
-- `LATE` n'est pas un statut : il se dérive de `expected_return_at` et de
-- l'heure courante (DEC-025 §a). Une location dont le retour était attendu
-- aujourd'hui à 09:00 compte donc à la fois dans `returning_today` — c'est bien
-- un retour du jour — et dans `late`. L'écran le dit ainsi : « 3 retours
-- aujourd'hui, dont 1 en retard ». Les exclure l'un de l'autre ferait
-- disparaître de la journée le retour le plus urgent.
-- =============================================================================

create or replace function public.dashboard_operations()
returns table (
  running         integer,
  starting_today  integer,
  returning_today integer,
  late            integer,
  to_control      integer,
  to_invoice      integer
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Indian/Comoro')::date;
begin
  perform public.require_capability(
    array['dashboard.view'], 'consulter le tableau de bord'
  );
  perform public.require_capability(
    array['rental.rentals.view'], 'compter les locations du pilotage'
  );

  return query
  select
    count(*) filter (where r.status in ('IN_PROGRESS', 'EXTENDED'))::integer,

    count(*) filter (
      where r.status = 'CONFIRMED'
        and (lower(r.planned_period) at time zone 'Indian/Comoro')::date = v_today
    )::integer,

    count(*) filter (
      where r.status in ('IN_PROGRESS', 'EXTENDED')
        and (r.expected_return_at at time zone 'Indian/Comoro')::date = v_today
    )::integer,

    count(*) filter (
      where r.status in ('IN_PROGRESS', 'EXTENDED')
        and r.expected_return_at < now()
    )::integer,

    count(*) filter (where r.status = 'TO_CONTROL')::integer,
    count(*) filter (where r.status = 'TO_INVOICE')::integer
  from public.rentals r;
end;
$$;

comment on function public.dashboard_operations() is
  'Les six files du quotidien (Module 01 §9). Exige `dashboard.view` ET `rental.rentals.view` : un comptage sur des locations illisibles vaudrait zéro, et zéro se lirait « rien à faire ».';


-- =============================================================================
-- 2. RÉSERVATIONS À VENIR — Module 01 §9
--
-- Même fenêtre que le Tableau de location : une réservation dont le départ est
-- DÉPASSÉ sans être parti reste « à venir » — c'est précisément celle qu'il
-- faut voir. La borne haute est bornée à 90 jours : au-delà, ce n'est plus du
-- pilotage, c'est du calendrier.
-- =============================================================================

create or replace function public.dashboard_reservations(p_days integer)
returns table (
  upcoming       integer,
  starting_today integer
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Indian/Comoro')::date;
  v_days  integer := least(greatest(coalesce(p_days, 7), 1), 90);
begin
  perform public.require_capability(
    array['dashboard.view'], 'consulter le tableau de bord'
  );
  perform public.require_capability(
    array['rental.reservations.view'], 'compter les réservations du pilotage'
  );

  return query
  select
    count(*) filter (
      where lower(v.period) <= now() + make_interval(days => v_days)
    )::integer,
    count(*) filter (
      where (lower(v.period) at time zone 'Indian/Comoro')::date = v_today
    )::integer
  from public.reservations v
  where v.status in ('CONFIRMED', 'PREPARING');
end;
$$;

comment on function public.dashboard_reservations(integer) is
  'Réservations confirmées ou en préparation dont le départ tombe dans la fenêtre (Module 01 §9). Fenêtre bornée à 90 jours.';


-- =============================================================================
-- 3. ÉTAT DU PARC — Module 01 §12
--
-- Un comptage par statut, et rien d'autre. Le statut DÉCRIT une situation ; il
-- ne remplace pas le calendrier (Règles parc §69, DEC-021 §5) : un véhicule
-- « Disponible » aujourd'hui peut être réservé demain. Cette fonction ne
-- calcule donc aucune disponibilité — elle compte des états.
--
-- Un statut sans véhicule ne remonte pas : c'est à l'écran de savoir que les
-- sept statuts existent, et d'afficher 0 pour ceux qu'il n'a pas reçus.
-- =============================================================================

create or replace function public.dashboard_fleet()
returns table (
  status        text,
  vehicle_count integer
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  perform public.require_capability(
    array['dashboard.view'], 'consulter le tableau de bord'
  );
  perform public.require_capability(
    array['dashboard.fleet.view'], 'consulter l''état du parc sur le tableau de bord'
  );
  perform public.require_capability(
    array['rental.fleet.view'], 'lire les véhicules dont l''état du parc est le décompte'
  );

  return query
  select v.status::text, count(*)::integer
  from public.vehicles v
  group by v.status
  order by v.status::text;
end;
$$;

comment on function public.dashboard_fleet() is
  'Répartition du parc par statut (Module 01 §12). Exige `dashboard.fleet.view` ET `rental.fleet.view` : la première autorise la synthèse, la seconde donne accès aux véhicules qu''elle résume.';


-- =============================================================================
-- 4. FACTURÉ SUR LA PÉRIODE — Module 01 §15, §16
--
-- Σ des totaux des factures clients ÉMISES dont la date tombe dans la période.
--
-- Les brouillons en sont exclus : « aucune créance n'est encore reconnue »
-- (Workflow 07 §25). Les annulées aussi : une facture annulée n'a jamais
-- produit de chiffre d'affaires.
--
-- Le total n'est pas une colonne : `customer_invoice_total` le refait, ligne à
-- ligne, réductions déduites (Workflow 07 §23, §24). Le pilotage ne connaît
-- donc aucune autre arithmétique que celle de la facture elle-même.
-- =============================================================================

create or replace function public.dashboard_customer_invoiced(p_from date, p_to date)
returns bigint
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_total bigint;
begin
  perform public.require_capability(
    array['dashboard.view'], 'consulter le tableau de bord'
  );
  perform public.require_capability(
    array['dashboard.financial.view'], 'consulter les indicateurs financiers du pilotage'
  );
  perform public.require_capability(
    array['billing.customer_invoices.view'], 'lire les factures clients dont le montant facturé est la somme'
  );

  select coalesce(sum(public.customer_invoice_total(i.id)), 0)::bigint
  into v_total
  from public.customer_invoices i
  where i.status = 'ISSUED'
    and i.invoice_date >= p_from
    and i.invoice_date <= p_to;

  return v_total;
end;
$$;

comment on function public.dashboard_customer_invoiced(date, date) is
  'Σ des totaux des factures clients émises sur la période (Module 01 §16). Brouillons et annulées exclus : ils ne reconnaissent aucune créance.';


-- =============================================================================
-- 5. ENCAISSÉ SUR LA PÉRIODE — Module 01 §15
--
-- Σ des règlements clients VALIDÉS reçus sur la période, à la date RÉELLE du
-- règlement (Workflow 08 §11) — jamais à la date de la facture : « elle ne doit
-- pas être confondue avec la date de facture ».
--
-- Un règlement annulé n'y figure pas : l'annulation retire aussi son écriture
-- (migration 054), et un encaissement annulé n'a rien encaissé.
-- =============================================================================

create or replace function public.dashboard_customer_collected(p_from date, p_to date)
returns bigint
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_total bigint;
begin
  perform public.require_capability(
    array['dashboard.view'], 'consulter le tableau de bord'
  );
  perform public.require_capability(
    array['dashboard.financial.view'], 'consulter les indicateurs financiers du pilotage'
  );
  perform public.require_capability(
    array['billing.customer_payments.view'], 'lire les règlements clients dont l''encaissé est la somme'
  );

  select coalesce(sum(p.amount), 0)::bigint
  into v_total
  from public.customer_payments p
  where p.status = 'VALIDATED'
    and p.received_on >= p_from
    and p.received_on <= p_to;

  return v_total;
end;
$$;

comment on function public.dashboard_customer_collected(date, date) is
  'Σ des règlements clients validés reçus sur la période (Workflow 08 §11). À la date réelle du règlement, jamais à celle de la facture.';


-- =============================================================================
-- 6. RESTE À ENCAISSER — Module 01 §16
--
-- Une créance n'est pas un flux : elle ne se borne PAS à la période choisie.
-- Ce que le client doit encore, il le doit quelle que soit la fenêtre affichée.
-- Cette fonction ignore donc volontairement les dates de l'en-tête.
--
-- Solde = total − encaissé (Workflow 08 §21). Les deux capacités sont exigées :
-- sans les règlements, la somme vaudrait le total facturé et se lirait « rien
-- n'a été payé ». C'est exactement le mensonge que la migration 050 a corrigé.
--
-- « En retard » se dérive de l'échéance et du jour courant (Workflow 07 §30,
-- DEC-025 §a) : une facture soldée n'est jamais en retard, même échéance
-- dépassée — le retard qualifie une créance qui court encore.
-- =============================================================================

create or replace function public.dashboard_customer_receivables()
returns table (
  invoice_count  integer,
  amount         bigint,
  overdue_count  integer,
  overdue_amount bigint
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Indian/Comoro')::date;
begin
  perform public.require_capability(
    array['dashboard.view'], 'consulter le tableau de bord'
  );
  perform public.require_capability(
    array['dashboard.financial.view'], 'consulter les indicateurs financiers du pilotage'
  );
  perform public.require_capability(
    array['billing.customer_invoices.view'], 'lire les factures clients dont la créance est le solde'
  );
  perform public.require_capability(
    array['billing.customer_payments.view'], 'lire les règlements sans lesquels le solde serait le total'
  );

  return query
  with soldes as (
    select
      i.due_date,
      public.customer_invoice_total(i.id) - public.customer_invoice_paid(i.id) as remaining
    from public.customer_invoices i
    where i.status = 'ISSUED'
  )
  select
    count(*) filter (where s.remaining > 0)::integer,
    coalesce(sum(s.remaining) filter (where s.remaining > 0), 0)::bigint,
    count(*) filter (
      where s.remaining > 0 and s.due_date is not null and s.due_date < v_today
    )::integer,
    coalesce(
      sum(s.remaining) filter (
        where s.remaining > 0 and s.due_date is not null and s.due_date < v_today
      ),
      0
    )::bigint
  from soldes s;
end;
$$;

comment on function public.dashboard_customer_receivables() is
  'Créances clients restant dues, et la part échue (Module 01 §16). Hors période : une créance se doit quelle que soit la fenêtre affichée.';


-- =============================================================================
-- 7. RESTE À PAYER AUX FOURNISSEURS — Module 01 §17
--
-- Symétrique exact du §6, avec la chaîne complète du fournisseur :
--
--   Brut − imputé = net à payer      (CLAUDE.md §16, Workflow 06)
--   Net  − payé   = reste dû         (Workflow 08 §21)
--
-- LES TROIS CAPACITÉS SONT EXIGÉES. Une imputation n'est PAS un paiement
-- (CLAUDE.md §57) : sans `imputations.view`, le net vaudrait le brut et le
-- tableau annoncerait une dette que les imputations ont déjà réduite. Sans
-- `supplier_payments.view`, il annoncerait comme dû ce qui est déjà réglé.
--
-- Seules les factures VALIDÉES portent une dette : ni brouillon, ni en attente,
-- ni annulée. `PAID` et `PARTIALLY_PAID` ne sont jamais écrits — ils se
-- calculent (DEC-029), et une facture soldée sort d'elle-même par `remaining`.
-- =============================================================================

create or replace function public.dashboard_supplier_payables()
returns table (
  invoice_count  integer,
  amount         bigint,
  overdue_count  integer,
  overdue_amount bigint
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Indian/Comoro')::date;
begin
  perform public.require_capability(
    array['dashboard.view'], 'consulter le tableau de bord'
  );
  perform public.require_capability(
    array['dashboard.financial.view'], 'consulter les indicateurs financiers du pilotage'
  );
  perform public.require_capability(
    array['billing.supplier_invoices.view'], 'lire les factures fournisseurs dont la dette est le solde'
  );
  perform public.require_capability(
    array['billing.imputations.view'], 'lire les imputations sans lesquelles le net vaudrait le brut'
  );
  perform public.require_capability(
    array['billing.supplier_payments.view'], 'lire les règlements sans lesquels le reste dû vaudrait le net'
  );

  return query
  with soldes as (
    select
      f.due_date,
      public.supplier_invoice_gross(f.id)
        - public.supplier_invoice_imputed(f.id)
        - public.supplier_invoice_paid(f.id) as remaining
    from public.supplier_invoices f
    where f.status = 'VALIDATED'
  )
  select
    count(*) filter (where s.remaining > 0)::integer,
    coalesce(sum(s.remaining) filter (where s.remaining > 0), 0)::bigint,
    count(*) filter (
      where s.remaining > 0 and s.due_date is not null and s.due_date < v_today
    )::integer,
    coalesce(
      sum(s.remaining) filter (
        where s.remaining > 0 and s.due_date is not null and s.due_date < v_today
      ),
      0
    )::bigint
  from soldes s;
end;
$$;

comment on function public.dashboard_supplier_payables() is
  'Dettes fournisseurs restant dues — brut − imputé − payé (Module 01 §17, §18). Exige les trois lectures : une imputation n''est pas un paiement, et l''ignorer fausserait la dette.';


-- =============================================================================
-- 8. DROITS D'EXÉCUTION — DEC-022
--
-- Rien n'est exécutable par PUBLIC. Ces fonctions lisent des montants ; elles
-- se donnent aux sessions authentifiées et au rôle de service, à personne
-- d'autre. `anon` n'a aucun accès au SaaS (§45 : SaaS strictement interne).
-- =============================================================================

revoke execute on function public.dashboard_operations() from public;
grant  execute on function public.dashboard_operations() to authenticated, service_role;

revoke execute on function public.dashboard_reservations(integer) from public;
grant  execute on function public.dashboard_reservations(integer) to authenticated, service_role;

revoke execute on function public.dashboard_fleet() from public;
grant  execute on function public.dashboard_fleet() to authenticated, service_role;

revoke execute on function public.dashboard_customer_invoiced(date, date) from public;
grant  execute on function public.dashboard_customer_invoiced(date, date)
  to authenticated, service_role;

revoke execute on function public.dashboard_customer_collected(date, date) from public;
grant  execute on function public.dashboard_customer_collected(date, date)
  to authenticated, service_role;

revoke execute on function public.dashboard_customer_receivables() from public;
grant  execute on function public.dashboard_customer_receivables() to authenticated, service_role;

revoke execute on function public.dashboard_supplier_payables() from public;
grant  execute on function public.dashboard_supplier_payables() to authenticated, service_role;


-- =============================================================================
-- 9. LE CATALOGUE NE BOUGE PAS
--
-- Les trois capacités du tableau de bord existent depuis la migration 007. Le
-- LOT 9 ne fait que leur donner enfin un contrôle serveur. En créer une de plus
-- serait interdit (DEC-024 : « le catalogue représente les capacités réelles »).
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

  select array_agg(code) into v_missing
  from unnest(array['dashboard.view', 'dashboard.financial.view', 'dashboard.fleet.view'])
    as code
  where not exists (select 1 from public.permissions p where p.code = code);

  if v_missing is not null then
    raise exception 'Capacités du tableau de bord absentes du catalogue : %.',
      array_to_string(v_missing, ', ');
  end if;
end $$;
