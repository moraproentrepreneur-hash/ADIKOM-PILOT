-- =============================================================================
-- ADIKOM PILOT — 076 · La lecture agrégée du tableau de bord
-- Ajustement fonctionnel du 08/09/2026 — DEC-042 §a
--
-- CE QUE CETTE MIGRATION CHANGE, ET LA RAISON MÉTIER
--
-- Jusqu'ici, chaque indicateur du tableau de bord exigeait la capacité du
-- MODULE qu'il résume : compter les retours en retard supposait
-- `rental.rentals.view`, compter les nouveaux clients supposait
-- `parties.clients.view`. Un collaborateur sans ces droits lisait donc, à la
-- place de chaque chiffre, « Non accessible — permission rental.rentals.view ».
--
-- ADIKOM a tranché (DEC-042) : le tableau de bord est une vue de PILOTAGE
-- GÉNÉRAL. Un collaborateur qui n'a pas le droit d'ouvrir le module Locations
-- peut légitimement avoir besoin de savoir qu'il existe trois retours en retard,
-- pour en informer la personne qui en répond.
--
-- LA DISTINCTION QUI REND CELA SÛR
--
--   VOIR UN NOMBRE AGRÉGÉ        ≠        ACCÉDER AUX DONNÉES DU MODULE
--
-- Ces fonctions ne rendent que des NOMBRES : des comptages et des sommes. Aucune
-- ne rend une ligne, un nom, une immatriculation, un montant rattaché à un
-- tiers. Rien de ce qu'elles renvoient ne permet d'identifier un client, un
-- véhicule ou une facture.
--
-- Tout le reste ne bouge pas :
--
--   · les LISTES du tableau de bord — retards nominatifs, échéances de
--     documents, comptes financiers — restent gouvernées par la capacité de
--     leur module, et l'écran continue de le dire ;
--   · les LIENS « Voir le détail » mènent à des écrans qui vérifient leur
--     propre capacité, inchangés ;
--   · AUCUNE policy RLS n'est modifiée, AUCUNE permission n'est créée,
--     AUCUNE capacité de module n'est accordée implicitement.
--
-- POURQUOI `SECURITY DEFINER` ICI, ALORS QUE LE PROJET L'ÉVITE
--
-- DEC-022 a fermé les droits d'exécution parce qu'une fonction `SECURITY
-- DEFINER` ouverte à `anon` laissait écrire dans le journal d'audit. La leçon
-- n'était pas « jamais de SECURITY DEFINER » : elle était « une fonction qui
-- s'exécute avec les droits de son propriétaire doit être hors de portée de qui
-- n'a rien à y faire, et ne doit rendre que ce qu'elle a le droit de rendre ».
--
-- Les deux conditions sont tenues ici :
--
--   1. l'exécution est retirée à PUBLIC et accordée nommément à `authenticated`
--      et `service_role` — jamais à `anon` (§45 : SaaS strictement interne) ;
--   2. chaque fonction commence par EXIGER `dashboard.view`, et les sections
--      financières et parc exigent en plus leur propre capacité. Une session
--      qui ne les détient pas est refusée avant toute lecture.
--
-- Sans `security definer`, RLS répondrait « 0 » à qui n'a pas le droit de lire
-- la table — et « 0 retour en retard » se lirait comme une bonne nouvelle alors
-- que rien n'aurait été compté. C'est exactement le mensonge que DEC-017
-- interdit. Le refus était donc la seule réponse honnête tant que la lecture
-- restait celle de l'appelant ; il cesse de l'être dès lors que la lecture est
-- celle du pilotage.
--
-- `set search_path = public, pg_temp` sur chacune : sans cela, un schéma
-- temporaire pourrait détourner un appel de fonction interne.
--
-- LES TROIS CAPACITÉS DU TABLEAU DE BORD REPRENNENT LEUR RÔLE ENTIER
--
--   `dashboard.view`            ouvre l'écran ET ses indicateurs d'exploitation
--   `dashboard.fleet.view`      ouvre la synthèse du parc
--   `dashboard.financial.view`  ouvre les synthèses financières
--
-- Elles ne composent plus avec les capacités des modules : elles se suffisent.
-- C'est ce qui les rend attribuables indépendamment (DEC-024) — un profil de
-- pilotage se donne désormais en trois capacités, sans ouvrir onze modules.
--
-- LE CATALOGUE NE BOUGE PAS : 171 permissions, aucune créée, aucune retirée.
-- =============================================================================


-- =============================================================================
-- 1. LE SOLDE D'UN COMPTE — UNE SEULE ARITHMÉTIQUE, DEUX APPELANTS
--
-- `financial_account_balance` exige `treasury.balances.view` ET
-- `treasury.entries.view` (migration 050) : le tableau de bord ne peut donc pas
-- l'appeler pour qui ne les détient pas.
--
-- Recopier la formule dans le tableau de bord créerait une SECONDE VÉRITÉ sur le
-- solde d'un compte — précisément ce que la migration 050 a écarté. La formule
-- est donc EXTRAITE dans une fonction privée, que les deux appellent :
--
--   `account_balance_formula`   l'arithmétique, sans garde, hors de portée ;
--   `financial_account_balance` les gardes, puis la formule — inchangée pour
--                               tous ses appelants ;
--   `dashboard_treasury_total`  la garde du pilotage, puis la même formule.
--
-- `account_balance_formula` n'est exécutable NI par `authenticated` NI par
-- `anon` : seules les fonctions `security definer` de ce fichier — qui
-- s'exécutent avec les droits de leur propriétaire — peuvent l'atteindre.
-- =============================================================================

create or replace function public.account_balance_formula(p_account_id uuid)
returns bigint
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_opening bigint;
  v_in      bigint;
  v_out     bigint;
begin
  select a.opening_balance into v_opening
  from public.financial_accounts a where a.id = p_account_id;

  -- Compte introuvable, ou invisible pour l'appelant : on n'invente pas un zéro.
  if v_opening is null then
    return null;
  end if;

  select
    coalesce(sum(e.amount) filter (where e.direction = 'IN'), 0),
    coalesce(sum(e.amount) filter (where e.direction = 'OUT'), 0)
  into v_in, v_out
  from public.treasury_entries e
  where e.account_id = p_account_id
    and e.status = 'VALIDATED';

  return v_opening + v_in - v_out;
end;
$$;

comment on function public.account_balance_formula(uuid) is
  'Solde initial + entrées − sorties, écritures validées (Module 06 §17). SANS garde de capacité : réservée aux appelants qui ont posé la leur. Non exécutable par `authenticated`.';

revoke execute on function public.account_balance_formula(uuid) from public;
revoke execute on function public.account_balance_formula(uuid) from anon;
revoke execute on function public.account_balance_formula(uuid) from authenticated;
grant  execute on function public.account_balance_formula(uuid) to service_role;


/*
 * Le solde d'un compte, tel que tout le reste du SaaS le connaît.
 *
 * Les deux gardes de la migration 050 sont conservées mot pour mot ; seule
 * l'arithmétique a déménagé.
 *
 * POURQUOI ELLE DEVIENT `SECURITY DEFINER`
 *
 * `account_balance_formula` n'est pas exécutable par `authenticated` — c'est ce
 * qui l'empêche d'être appelée directement pour obtenir un solde sans
 * `treasury.balances.view`. Une fonction `SECURITY INVOKER` ne pourrait donc pas
 * l'appeler : elle s'exécuterait avec les droits de l'appelant, qui ne les a
 * pas. C'est le propriétaire qui l'atteint, et lui seul.
 *
 * CE QUE `SECURITY DEFINER` LÈVE, ET QU'IL FAUT REPOSER À LA MAIN
 *
 * RLS. Jusqu'ici, un appelant sans `treasury.accounts.view` ne VOYAIT pas la
 * ligne du compte : `opening_balance` revenait NULL, et la fonction rendait NULL
 * — « compte introuvable, ou invisible : on n'invente pas un zéro ». Sans
 * reposer cette règle, la fonction rendrait désormais le solde d'un compte que
 * l'appelant n'a pas le droit de voir.
 *
 * Elle est donc réécrite EXPLICITEMENT, à l'identique de la policy
 * `financial_accounts_select` — qui n'est qu'un contrôle de capacité — et, comme
 * elle, ne s'applique qu'à une session applicative (convention de la migration
 * 021). Le comportement observable ne change pour personne.
 */
create or replace function public.financial_account_balance(p_account_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_capability(
    array['treasury.balances.view'], 'consulter le solde d''un compte financier'
  );
  perform public.require_capability(
    array['treasury.entries.view'], 'lire les écritures dont le solde est la somme'
  );

  -- La visibilité du compte, que RLS gouvernait, reposée telle quelle.
  if public.current_actor() is not null
     and not public.has_permission('treasury.accounts.view') then
    return null;
  end if;

  return public.account_balance_formula(p_account_id);
end;
$$;

comment on function public.financial_account_balance(uuid) is
  'Solde initial + entrées − sorties, écritures validées seulement (Module 06 §17). Exige `balances.view` ET `entries.view` : une somme sur des écritures illisibles serait fausse.';


-- =============================================================================
-- 2. EXPLOITATION — les six files du quotidien
--
-- `rental.rentals.view` n'est plus exigée : un nombre de locations en cours ne
-- désigne aucune location. La lecture porte sur TOUTES les locations, celles que
-- l'appelant peut ouvrir comme celles qu'il ne peut pas — c'est ce qui fait du
-- chiffre un indicateur de pilotage plutôt qu'un reflet des droits du lecteur.
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
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Indian/Comoro')::date;
begin
  perform public.require_capability(
    array['dashboard.view'], 'consulter le tableau de bord'
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
  'Les six files du quotidien (Module 01 §9). Lecture AGRÉGÉE du pilotage : `dashboard.view` suffit, et rien d''identifiant n''en sort (DEC-042 §a).';


-- =============================================================================
-- 3. RÉSERVATIONS À VENIR
-- =============================================================================

create or replace function public.dashboard_reservations(p_days integer)
returns table (
  upcoming       integer,
  starting_today integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Indian/Comoro')::date;
  v_days  integer := least(greatest(coalesce(p_days, 7), 1), 90);
begin
  perform public.require_capability(
    array['dashboard.view'], 'consulter le tableau de bord'
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
  'Réservations confirmées ou en préparation dont le départ tombe dans la fenêtre (Module 01 §9). Lecture agrégée du pilotage (DEC-042 §a).';


-- =============================================================================
-- 4. ÉTAT DU PARC
--
-- `dashboard.fleet.view` reste exigée — c'est la capacité qui ouvre CETTE
-- synthèse, et elle s'attribue seule. `rental.fleet.view` ne l'est plus : un
-- décompte par statut ne désigne aucun véhicule.
-- =============================================================================

create or replace function public.dashboard_fleet()
returns table (
  status        text,
  vehicle_count integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_capability(
    array['dashboard.view'], 'consulter le tableau de bord'
  );
  perform public.require_capability(
    array['dashboard.fleet.view'], 'consulter l''état du parc sur le tableau de bord'
  );

  return query
  select v.status::text, count(*)::integer
  from public.vehicles v
  group by v.status
  order by v.status::text;
end;
$$;

comment on function public.dashboard_fleet() is
  'Répartition du parc par statut (Module 01 §12). Exige `dashboard.fleet.view` seule : la synthèse s''attribue sans ouvrir le parc (DEC-042 §a).';


-- =============================================================================
-- 5. FACTURÉ SUR LA PÉRIODE
--
-- `dashboard.financial.view` reste exigée. Les capacités de facturation ne le
-- sont plus : une somme facturée sur une période ne désigne aucune facture.
-- =============================================================================

create or replace function public.dashboard_customer_invoiced(p_from date, p_to date)
returns bigint
language plpgsql
stable
security definer
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
-- 6. ENCAISSÉ SUR LA PÉRIODE
-- =============================================================================

create or replace function public.dashboard_customer_collected(p_from date, p_to date)
returns bigint
language plpgsql
stable
security definer
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
-- 7. RESTE À ENCAISSER
--
-- La somme reste exacte : elle lit désormais TOUTES les factures et TOUS les
-- règlements. C'est même plus juste qu'avant — un lecteur qui n'avait qu'une
-- partie des règlements obtenait une créance surestimée.
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
security definer
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
-- 8. RESTE À PAYER AUX FOURNISSEURS
--
-- Brut − imputé − payé, sur l'ensemble des factures validées. Les trois lectures
-- sont désormais celles du propriétaire : la chaîne est donc TOUJOURS complète,
-- et une imputation n'est jamais oubliée (CLAUDE.md §57).
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
security definer
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
  'Dettes fournisseurs restant dues — brut − imputé − payé (Module 01 §17, §18). La chaîne est toujours complète : aucune imputation ne peut être ignorée.';


-- =============================================================================
-- 9. ACTIVITÉ DE LA PÉRIODE — Module 01 §6
--
-- Quatre comptages de CRÉATIONS. Ils étaient faits côté application, table par
-- table, sous RLS et sous la capacité de chaque module. Ils passent ici pour la
-- même raison que les autres : un nombre de nouveaux clients ne nomme aucun
-- client.
--
-- Les bornes sont des JOURS CIVILS COMORIENS. La borne haute est portée au
-- lendemain, exclu, pour englober la journée entière quel que soit le fuseau de
-- l'horodatage (DEC-025 §e).
-- =============================================================================

create or replace function public.dashboard_activity(p_from date, p_to date)
returns table (
  clients      integer,
  reservations integer,
  rentals      integer,
  invoices     integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_from timestamptz;
  v_to   timestamptz;
begin
  perform public.require_capability(
    array['dashboard.view'], 'consulter le tableau de bord'
  );

  if p_from is null or p_to is null then
    raise exception 'La période de l''activité est obligatoire.'
      using errcode = 'check_violation';
  end if;

  v_from := (p_from::text || ' 00:00:00')::timestamp at time zone 'Indian/Comoro';
  v_to   := ((p_to + 1)::text || ' 00:00:00')::timestamp at time zone 'Indian/Comoro';

  return query
  select
    (select count(*) from public.clients c
      where c.created_at >= v_from and c.created_at < v_to)::integer,
    (select count(*) from public.reservations r
      where r.created_at >= v_from and r.created_at < v_to)::integer,
    (select count(*) from public.rentals l
      where l.created_at >= v_from and l.created_at < v_to)::integer,
    (select count(*) from public.customer_invoices i
      where i.created_at >= v_from and i.created_at < v_to)::integer;
end;
$$;

comment on function public.dashboard_activity(date, date) is
  'Créations de la période — clients, réservations, locations, factures (Module 01 §6). Un flux, jamais un stock. Jours civils comoriens (DEC-025 §e).';


-- =============================================================================
-- 10. MAINTENANCES OUVERTES
--
-- Planifiées, à diagnostiquer, en cours ou en attente : ce qui n'est pas fini.
-- Le comptage était fait côté application sous `rental.maintenance.view`.
-- =============================================================================

create or replace function public.dashboard_maintenance_open()
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  perform public.require_capability(
    array['dashboard.view'], 'consulter le tableau de bord'
  );

  select count(*)::integer into v_count
  from public.vehicle_maintenances m
  where m.status in ('PLANNED', 'TO_DIAGNOSE', 'IN_PROGRESS', 'ON_HOLD');

  return v_count;
end;
$$;

comment on function public.dashboard_maintenance_open() is
  'Maintenances non terminées (Module 01 §19). Un nombre, jamais une liste : les fiches restent sous `rental.maintenance.view`.';


-- =============================================================================
-- 11. TRÉSORERIE — LE TOTAL, ET RIEN QUE LE TOTAL
--
-- Σ des soldes des comptes ACTIFS. Le DÉTAIL par compte — libellé, banque,
-- solde individuel — reste gouverné par `treasury.accounts.view`,
-- `treasury.balances.view` et `treasury.entries.view` : c'est une liste, et une
-- liste nomme.
--
-- Le total, lui, ne nomme rien.
-- =============================================================================

create or replace function public.dashboard_treasury_total()
returns bigint
language plpgsql
stable
security definer
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

  select coalesce(sum(public.account_balance_formula(a.id)), 0)::bigint
  into v_total
  from public.financial_accounts a
  where a.status = 'ACTIVE';

  return v_total;
end;
$$;

comment on function public.dashboard_treasury_total() is
  'Σ des soldes des comptes actifs (Module 01 §15). Le total seul : le détail par compte reste sous les capacités de Banques & Caisses (DEC-042 §a).';


-- =============================================================================
-- 12. DROITS D'EXÉCUTION — DEC-022
--
-- Rien n'est exécutable par PUBLIC ni par `anon`. Ces fonctions s'exécutent avec
-- les droits de leur propriétaire : leur mise hors de portée est la moitié de la
-- sécurité, l'autre moitié étant la garde `dashboard.view` qu'elles portent.
-- =============================================================================

revoke execute on function public.dashboard_operations() from public;
revoke execute on function public.dashboard_operations() from anon;
grant  execute on function public.dashboard_operations() to authenticated, service_role;

revoke execute on function public.dashboard_reservations(integer) from public;
revoke execute on function public.dashboard_reservations(integer) from anon;
grant  execute on function public.dashboard_reservations(integer) to authenticated, service_role;

revoke execute on function public.dashboard_fleet() from public;
revoke execute on function public.dashboard_fleet() from anon;
grant  execute on function public.dashboard_fleet() to authenticated, service_role;

revoke execute on function public.dashboard_customer_invoiced(date, date) from public;
revoke execute on function public.dashboard_customer_invoiced(date, date) from anon;
grant  execute on function public.dashboard_customer_invoiced(date, date)
  to authenticated, service_role;

revoke execute on function public.dashboard_customer_collected(date, date) from public;
revoke execute on function public.dashboard_customer_collected(date, date) from anon;
grant  execute on function public.dashboard_customer_collected(date, date)
  to authenticated, service_role;

revoke execute on function public.dashboard_customer_receivables() from public;
revoke execute on function public.dashboard_customer_receivables() from anon;
grant  execute on function public.dashboard_customer_receivables() to authenticated, service_role;

revoke execute on function public.dashboard_supplier_payables() from public;
revoke execute on function public.dashboard_supplier_payables() from anon;
grant  execute on function public.dashboard_supplier_payables() to authenticated, service_role;

revoke execute on function public.dashboard_activity(date, date) from public;
revoke execute on function public.dashboard_activity(date, date) from anon;
grant  execute on function public.dashboard_activity(date, date) to authenticated, service_role;

revoke execute on function public.dashboard_maintenance_open() from public;
revoke execute on function public.dashboard_maintenance_open() from anon;
grant  execute on function public.dashboard_maintenance_open() to authenticated, service_role;

revoke execute on function public.dashboard_treasury_total() from public;
revoke execute on function public.dashboard_treasury_total() from anon;
grant  execute on function public.dashboard_treasury_total() to authenticated, service_role;


-- =============================================================================
-- 13. CONTRÔLES DE NON-RÉGRESSION
-- =============================================================================

do $$
declare
  v_total   int;
  v_missing text[];
  v_leaky   text[];
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 171 then
    raise exception 'Catalogue attendu à 171 permissions, obtenu %.', v_total;
  end if;

  select array_agg(code) into v_missing
  from unnest(array['dashboard.view', 'dashboard.financial.view', 'dashboard.fleet.view'])
    as code
  where not exists (select 1 from public.permissions p where p.code = code);

  if v_missing is not null then
    raise exception 'Capacités du tableau de bord absentes du catalogue : %.',
      array_to_string(v_missing, ', ');
  end if;

  -- Les dix fonctions du pilotage doivent être `security definer` : sans cela,
  -- RLS rendrait « 0 » et l'indicateur mentirait au lieu de refuser.
  select array_agg(p.proname::text) into v_missing
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'dashboard_operations', 'dashboard_reservations', 'dashboard_fleet',
      'dashboard_customer_invoiced', 'dashboard_customer_collected',
      'dashboard_customer_receivables', 'dashboard_supplier_payables',
      'dashboard_activity', 'dashboard_maintenance_open', 'dashboard_treasury_total'
    )
    and not p.prosecdef;

  if v_missing is not null then
    raise exception 'Fonctions du pilotage non `security definer` : %.',
      array_to_string(v_missing, ', ');
  end if;

  -- L'arithmétique sans garde ne doit être atteignable ni par `anon` ni par
  -- une session applicative : elle contournerait `treasury.balances.view`.
  select array_agg(r) into v_leaky
  from unnest(array['anon', 'authenticated']) r
  where has_function_privilege(r, 'public.account_balance_formula(uuid)', 'EXECUTE');

  if v_leaky is not null then
    raise exception
      '`account_balance_formula` reste exécutable par : %. Elle contournerait les gardes du solde.',
      array_to_string(v_leaky, ', ');
  end if;
end $$;
