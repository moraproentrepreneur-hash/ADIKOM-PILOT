-- =============================================================================
-- ADIKOM PILOT — 057 · Statistiques et rapports de facturation
-- Phase 3 — Pilotage · LOT 11 (Module 07 §26, §27, §58, §59, §60)
--
-- CE QUE CETTE MIGRATION AJOUTE, ET CE QU'ELLE N'AJOUTE PAS
--
-- Aucune table, aucune colonne, aucun statut, AUCUNE permission. Une
-- statistique ne se stocke pas : elle se refait à la lecture, sur les mêmes
-- fonctions que les fiches, les listes et le tableau de bord —
-- `customer_invoice_total`, `customer_invoice_paid`, `supplier_invoice_gross`,
-- `supplier_invoice_imputed`, `supplier_invoice_paid`. Aucune arithmétique
-- n'est réécrite ici (Module 07 §26 : « calculés à partir des données
-- réelles »).
--
-- Un chiffre d'affaires recopié dans une table devrait être tenu à jour par un
-- déclencheur sur chaque ligne de facture, chaque réduction, chaque règlement
-- et chaque annulation. Le premier oubli produirait un total faux — et un total
-- faux fait autorité plus longtemps qu'un total absent.
--
-- QUATRE CAPACITÉS DU CATALOGUE TROUVENT ICI LEUR CONTRÔLE SERVEUR
--
--   `billing.customer.stats.view`     statistiques des factures clients
--   `billing.customer.reports.view`   rapports clients
--   `billing.supplier.stats.view`     statistiques des factures fournisseurs
--   `billing.supplier.reports.view`   rapports fournisseurs
--
-- Elles existent au catalogue depuis la migration 007 et n'étaient contrôlées
-- nulle part. Elles COMPOSENT, elles n'ouvrent rien (DEC-024) : consulter les
-- statistiques des factures clients n'autorise pas à lire les factures. La
-- capacité source reste exigée EN PLUS, nommément.
--
-- ET UNE SYNTHÈSE SANS TOUTES SES LECTURES SE TAIT (DEC-032 §d, DEC-033 §c)
--
-- Chaque fonction exige TOUTES les lectures dont sa somme dépend, et REFUSE
-- plutôt que de répondre à côté :
--
--   sans `billing.customer_payments.view`  l'encaissé vaudrait 0 et le solde le
--                                          total : toute facture se lirait
--                                          impayée ;
--   sans `billing.imputations.view`        le net vaudrait le brut : ADIKOM
--                                          devrait 1 000 000 là où elle doit
--                                          700 000 (CLAUDE.md §16, §57).
--
-- Un zéro n'est pas une absence de dette. Il faut donc refuser, et l'écran
-- nomme la capacité manquante (DEC-017).
--
-- FLUX ET STOCK NE SE MÉLANGENT PAS (DEC-032 §e)
--
-- Un FLUX est daté de son propre acte : une facture au jour de son émission, un
-- encaissement au jour où il est reçu (Workflow 08 §11 — « elle ne doit pas
-- être confondue avec la date de facture »), une imputation au jour où elle est
-- portée sur la facture, un règlement au jour où il est payé.
--
-- Un STOCK ne se borne à aucune période : ce qu'un client doit encore, il le
-- doit quelle que soit la fenêtre affichée. Les créances et les dettes ignorent
-- donc volontairement les dates de l'en-tête, et l'écran le dit.
--
-- Conséquence à retenir : sur une période, `facturé − encaissé` N'EST PAS un
-- solde. Ce sont deux flux distincts, et leur différence ne désigne rien.
--
-- SÉCURITÉ
--
-- Aucune fonction n'est `SECURITY DEFINER` (DEC-022) : toutes s'exécutent avec
-- les droits de l'appelant, RLS comprise. `EXECUTE` est retiré à PUBLIC et
-- accordé aux seules sessions authentifiées et au rôle de service.
--
-- HORS SESSION APPLICATIVE
--
-- `current_actor()` vaut NULL pour une migration, un script d'environnement ou
-- la clé de service : `require_capability` s'efface alors, comme partout
-- ailleurs (convention de la migration 021). Les capacités s'éprouvent avec de
-- vraies sessions — `verify:capabilities` et `verify:analytics`.
--
-- FUSEAU
--
-- « Aujourd'hui » et « en retard » se lisent sur `Indian/Comoro` (DEC-025 §e).
-- Une échéance au 30 n'est pas dépassée le 30.
-- =============================================================================


-- =============================================================================
-- 1. OUTILS DE PÉRIODE
--
-- Deux gardes, et rien d'autre. Elles ne lisent aucune donnée : elles évitent
-- qu'un paramètre bricolé produise un résultat qui aurait l'air d'une réponse.
-- =============================================================================

/**
 * Une période s'ouvre avant de se fermer.
 *
 * Une borne absente donnerait un `between` toujours faux — donc un chiffre
 * d'affaires nul présenté comme un fait. Une période inversée aussi. Les deux
 * sont refusées, avec leur motif.
 */
create or replace function public.billing_require_period(p_from date, p_to date)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p_from is null or p_to is null then
    raise exception
      'Période incomplète : une statistique se calcule entre deux dates.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_from > p_to then
    raise exception
      'Période inversée : le premier jour (%) suit le dernier (%).', p_from, p_to
      using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

comment on function public.billing_require_period(date, date) is
  'Refuse une période incomplète ou inversée. Un « between » toujours faux rendrait 0, et ce 0 se lirait comme une absence d''activité.';


/**
 * Le premier jour du regroupement auquel appartient une date — Module 07 §59.
 *
 * « Les périodes peuvent être : jour, semaine, mois, trimestre, année. » Le
 * grain n'est pas un choix d'affichage : il décide de ce que chaque point
 * agrège. Un grain inconnu est refusé plutôt que ramené silencieusement au
 * mois — une série muette sur son propre pas ne se compare à rien.
 */
create or replace function public.billing_period_bucket(p_day date, p_grain text)
returns date
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  case p_grain
    when 'day'     then return p_day;
    when 'week'    then return date_trunc('week',    p_day::timestamp)::date;
    when 'month'   then return date_trunc('month',   p_day::timestamp)::date;
    when 'quarter' then return date_trunc('quarter', p_day::timestamp)::date;
    when 'year'    then return date_trunc('year',    p_day::timestamp)::date;
    else
      raise exception
        'Grain de période inconnu : %. Attendu : day, week, month, quarter ou year.',
        coalesce(p_grain, '(absent)')
        using errcode = 'invalid_parameter_value';
  end case;
end;
$$;

comment on function public.billing_period_bucket(date, text) is
  'Premier jour du regroupement (jour, semaine, mois, trimestre, année) — Module 07 §59. La semaine commence le lundi (ISO 8601).';


-- =============================================================================
-- 2. STATISTIQUES CLIENTS — Module 07 §26, §58
--
-- « Total facturé, total encaissé, total restant, factures payées, impayées, en
-- retard, paiements par période. »
--
-- LES QUATRE PREMIERS CHIFFRES SONT DES FLUX, LES QUATRE DERNIERS UN STOCK.
--
-- Facturé et encaissé se datent de leur propre acte, et ne se retranchent pas
-- l'un de l'autre : un encaissement de septembre peut solder une facture de
-- juillet. Les créances, elles, sont ce qui reste dû aujourd'hui, toutes
-- périodes confondues.
--
-- Seules les factures ÉMISES comptent. Un brouillon ne reconnaît aucune créance
-- (Workflow 07 §25) et une facture annulée n'a jamais produit de chiffre
-- d'affaires. « Payée » et « Partiellement payée » ne s'écrivent jamais : elles
-- se calculent (DEC-030), et une facture soldée sort d'elle-même par son reste.
-- =============================================================================

create or replace function public.billing_customer_stats(p_from date, p_to date)
returns table (
  issued_count               integer,
  invoiced_amount            bigint,
  collected_count            integer,
  collected_amount           bigint,
  settled_count              integer,
  unsettled_count            integer,
  period_overdue_count       integer,
  outstanding_count          integer,
  outstanding_amount         bigint,
  outstanding_overdue_count  integer,
  outstanding_overdue_amount bigint
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Indian/Comoro')::date;
begin
  perform public.billing_require_period(p_from, p_to);

  perform public.require_capability(
    array['billing.customer.stats.view'],
    'consulter les statistiques des factures clients'
  );
  perform public.require_capability(
    array['billing.customer_invoices.view'],
    'lire les factures clients dont les statistiques sont la synthèse'
  );
  perform public.require_capability(
    array['billing.customer_payments.view'],
    'lire les règlements clients sans lesquels toute facture se lirait impayée'
  );

  return query
  with periode as (
    select
      i.due_date                            as due_date,
      public.customer_invoice_total(i.id)   as total,
      public.customer_invoice_paid(i.id)    as paid
    from public.customer_invoices i
    where i.status = 'ISSUED'
      and i.invoice_date >= p_from
      and i.invoice_date <= p_to
  ),
  encaisse as (
    select
      count(*)::integer                  as lignes,
      coalesce(sum(p.amount), 0)::bigint as montant
    from public.customer_payments p
    where p.status = 'VALIDATED'
      and p.received_on >= p_from
      and p.received_on <= p_to
  ),
  creances as (
    select
      i.due_date as due_date,
      public.customer_invoice_total(i.id) - public.customer_invoice_paid(i.id) as reste
    from public.customer_invoices i
    where i.status = 'ISSUED'
  )
  select
    (select count(*) from periode pe)::integer,
    (select coalesce(sum(pe.total), 0) from periode pe)::bigint,
    (select e.lignes from encaisse e),
    (select e.montant from encaisse e),
    (select count(*) filter (where pe.total - pe.paid <= 0) from periode pe)::integer,
    (select count(*) filter (where pe.total - pe.paid > 0) from periode pe)::integer,
    (
      select count(*) filter (
        where pe.total - pe.paid > 0
          and pe.due_date is not null
          and pe.due_date < v_today
      )
      from periode pe
    )::integer,
    (select count(*) filter (where c.reste > 0) from creances c)::integer,
    (select coalesce(sum(c.reste) filter (where c.reste > 0), 0) from creances c)::bigint,
    (
      select count(*) filter (
        where c.reste > 0 and c.due_date is not null and c.due_date < v_today
      )
      from creances c
    )::integer,
    (
      select coalesce(
        sum(c.reste) filter (
          where c.reste > 0 and c.due_date is not null and c.due_date < v_today
        ),
        0
      )
      from creances c
    )::bigint;
end;
$$;

comment on function public.billing_customer_stats(date, date) is
  'Synthèse des factures clients — Module 07 §26. Facturé et encaissé sont des FLUX datés de leur propre acte ; créances et impayés un STOCK, hors période. Exige les deux lectures : sans les règlements, toute facture se lirait impayée.';


-- =============================================================================
-- 3. PAIEMENTS PAR PÉRIODE — Module 07 §26, §59
--
-- « Paiements par période », au grain choisi. Deux séries superposables :
-- ce qui a été facturé, ce qui a été encaissé. Aucun point n'est inventé — un
-- regroupement sans mouvement n'apparaît pas, et c'est à l'écran de savoir
-- qu'un trou vaut zéro.
--
-- La série ne remplace pas les totaux : elle les détaille. Les deux viennent
-- des mêmes lignes, jamais de deux calculs différents.
-- =============================================================================

create or replace function public.billing_customer_series(
  p_from  date,
  p_to    date,
  p_grain text
)
returns table (
  bucket           date,
  invoiced_amount  bigint,
  collected_amount bigint
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  perform public.billing_require_period(p_from, p_to);
  -- Éprouve le grain avant toute lecture : un grain inconnu doit refuser, pas
  -- rendre une série vide qui se lirait « aucune activité ».
  perform public.billing_period_bucket(p_from, p_grain);

  perform public.require_capability(
    array['billing.customer.stats.view'],
    'consulter les statistiques des factures clients'
  );
  perform public.require_capability(
    array['billing.customer_invoices.view'],
    'lire les factures clients dont la série est le détail'
  );
  perform public.require_capability(
    array['billing.customer_payments.view'],
    'lire les règlements clients dont la série est le détail'
  );

  return query
  with facture as (
    select
      public.billing_period_bucket(i.invoice_date, p_grain)  as pas,
      sum(public.customer_invoice_total(i.id))::bigint       as montant
    from public.customer_invoices i
    where i.status = 'ISSUED'
      and i.invoice_date >= p_from
      and i.invoice_date <= p_to
    group by 1
  ),
  encaisse as (
    select
      public.billing_period_bucket(p.received_on, p_grain) as pas,
      sum(p.amount)::bigint                                as montant
    from public.customer_payments p
    where p.status = 'VALIDATED'
      and p.received_on >= p_from
      and p.received_on <= p_to
    group by 1
  ),
  pas_connus as (
    select f.pas from facture f
    union
    select e.pas from encaisse e
  )
  select
    k.pas,
    coalesce(f.montant, 0)::bigint,
    coalesce(e.montant, 0)::bigint
  from pas_connus k
  left join facture  f on f.pas = k.pas
  left join encaisse e on e.pas = k.pas
  order by k.pas;
end;
$$;

comment on function public.billing_customer_series(date, date, text) is
  'Facturé et encaissé par pas de temps — Module 07 §26, §59. Un pas sans mouvement n''est pas rendu : il vaut zéro, il ne s''invente pas.';


-- =============================================================================
-- 4. RAPPORT CLIENTS — Module 07 §27
--
-- « Chiffre d'affaires facturé, encaissements, créances, impayés, factures par
-- période, factures par client. » Un seul état les porte tous : une ligne par
-- client, les colonnes répondant chacune à un de ces points.
--
-- AUCUNE LIMITE DE LIGNES, ET C'EST DÉLIBÉRÉ.
--
-- Ce sont des agrégats, bornés par le référentiel des clients — pas des lignes
-- de détail. Une liste tronquée produirait un état dont les lignes ne font pas
-- le total affiché à côté : c'est la leçon de DEC-032 §b, appliquée à un état
-- plutôt qu'à une somme.
--
-- UN CLIENT SANS ACTIVITÉ SUR LA PÉRIODE PEUT FIGURER
--
-- S'il doit encore quelque chose, il appartient à l'état des créances. L'omettre
-- ferait disparaître une dette parce qu'elle est ancienne.
--
-- LE NOM DU CLIENT PEUT MANQUER
--
-- La jointure est ouverte : sans `parties.clients.view`, RLS masque la ligne du
-- client et le nom vaut NULL. Le rapport reste juste — les montants ne
-- dépendent pas du répertoire —, et l'écran dit « non lisible » plutôt que
-- d'inventer un libellé. La composition du nom, elle, reste celle de
-- l'application : la base rend les parties, jamais une seconde vérité.
-- =============================================================================

create or replace function public.billing_customer_report(p_from date, p_to date)
returns table (
  client_id          uuid,
  client_no          text,
  client_type        text,
  legal_name         text,
  trade_name         text,
  first_name         text,
  invoice_count      integer,
  invoiced_amount    bigint,
  collected_amount   bigint,
  outstanding_amount bigint,
  overdue_amount     bigint
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Indian/Comoro')::date;
begin
  perform public.billing_require_period(p_from, p_to);

  perform public.require_capability(
    array['billing.customer.reports.view'],
    'consulter les rapports de facturation client'
  );
  perform public.require_capability(
    array['billing.customer_invoices.view'],
    'lire les factures clients dont le rapport est l''état'
  );
  perform public.require_capability(
    array['billing.customer_payments.view'],
    'lire les règlements clients sans lesquels aucune créance ne serait soldée'
  );

  return query
  with periode as (
    select
      i.client_id                                            as cid,
      count(*)::integer                                      as lignes,
      coalesce(sum(public.customer_invoice_total(i.id)), 0)::bigint as montant
    from public.customer_invoices i
    where i.status = 'ISSUED'
      and i.invoice_date >= p_from
      and i.invoice_date <= p_to
    group by i.client_id
  ),
  encaisse as (
    select
      i.client_id                        as cid,
      coalesce(sum(p.amount), 0)::bigint as montant
    from public.customer_payments p
    join public.customer_invoices i on i.id = p.customer_invoice_id
    where p.status = 'VALIDATED'
      and p.received_on >= p_from
      and p.received_on <= p_to
    group by i.client_id
  ),
  creances as (
    select
      s.cid,
      coalesce(sum(s.reste) filter (where s.reste > 0), 0)::bigint as montant,
      coalesce(
        sum(s.reste) filter (
          where s.reste > 0 and s.due_date is not null and s.due_date < v_today
        ),
        0
      )::bigint as echu
    from (
      select
        i.client_id as cid,
        i.due_date  as due_date,
        public.customer_invoice_total(i.id) - public.customer_invoice_paid(i.id) as reste
      from public.customer_invoices i
      where i.status = 'ISSUED'
    ) s
    group by s.cid
  ),
  tiers as (
    select pe.cid from periode  pe
    union
    select en.cid from encaisse en
    union
    select cr.cid from creances cr
  )
  select
    t.cid,
    c.client_no,
    c.type::text,
    c.legal_name,
    c.trade_name,
    c.first_name,
    coalesce(pe.lignes, 0),
    coalesce(pe.montant, 0)::bigint,
    coalesce(en.montant, 0)::bigint,
    coalesce(cr.montant, 0)::bigint,
    coalesce(cr.echu, 0)::bigint
  from tiers t
  left join public.clients c on c.id = t.cid
  left join periode  pe on pe.cid = t.cid
  left join encaisse en on en.cid = t.cid
  left join creances cr on cr.cid = t.cid
  order by
    coalesce(cr.echu, 0) desc,
    coalesce(cr.montant, 0) desc,
    coalesce(pe.montant, 0) desc,
    c.legal_name nulls last;
end;
$$;

comment on function public.billing_customer_report(date, date) is
  'État des factures et créances par client — Module 07 §27. Agrégat non tronqué : un état dont les lignes ne font pas le total serait faux. Le nom du client vaut NULL sans `parties.clients.view`, les montants restent justes.';


-- =============================================================================
-- 5. STATISTIQUES FOURNISSEURS — Module 07 §58, §59
--
-- « Total facturé, total imputé, total payé, dettes restantes, factures en
-- retard. »
--
-- TROIS FLUX, CHACUN DATÉ DE SON PROPRE ACTE
--
--   facturé  au jour de la facture ;
--   imputé   au jour où l'imputation est PORTÉE sur la facture (`imputed_at`) ;
--   payé     au jour du règlement (`paid_on`).
--
-- Leur différence sur une période n'est donc PAS une dette : une imputation
-- d'octobre peut réduire une facture de juillet. La dette est le stock, calculé
-- hors période — brut − imputé − payé, sur les factures validées (CLAUDE.md
-- §16, Workflow 06).
--
-- SEULES LES FACTURES VALIDÉES PORTENT UNE DETTE
--
-- Ni brouillon, ni en attente, ni annulée. `PAID` et `PARTIALLY_PAID` ne
-- s'écrivent jamais — ils se calculent (DEC-029).
--
-- LES TROIS LECTURES SONT EXIGÉES
--
-- Une imputation n'est pas un paiement (CLAUDE.md §57), et elle ne doit pas non
-- plus pouvoir être IGNORÉE : sans `billing.imputations.view`, le net vaudrait
-- le brut et l'écran réclamerait 1 000 000 KMF là où ADIKOM en doit 700 000.
-- =============================================================================

create or replace function public.billing_supplier_stats(p_from date, p_to date)
returns table (
  invoice_count           integer,
  gross_amount            bigint,
  imputation_count        integer,
  imputed_amount          bigint,
  payment_count           integer,
  paid_amount             bigint,
  payable_count           integer,
  payable_amount          bigint,
  payable_overdue_count   integer,
  payable_overdue_amount  bigint
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Indian/Comoro')::date;
begin
  perform public.billing_require_period(p_from, p_to);

  perform public.require_capability(
    array['billing.supplier.stats.view'],
    'consulter les statistiques des factures fournisseurs'
  );
  perform public.require_capability(
    array['billing.supplier_invoices.view'],
    'lire les factures fournisseurs dont les statistiques sont la synthèse'
  );
  perform public.require_capability(
    array['billing.imputations.view'],
    'lire les imputations sans lesquelles le net à payer vaudrait le montant brut'
  );
  perform public.require_capability(
    array['billing.supplier_payments.view'],
    'lire les règlements fournisseurs sans lesquels le reste dû vaudrait le net'
  );

  return query
  with facture as (
    select
      count(*)::integer as lignes,
      coalesce(sum(public.supplier_invoice_gross(f.id)), 0)::bigint as montant
    from public.supplier_invoices f
    where f.status = 'VALIDATED'
      and f.invoice_date >= p_from
      and f.invoice_date <= p_to
  ),
  impute as (
    select
      count(*)::integer                  as lignes,
      coalesce(sum(m.amount), 0)::bigint as montant
    from public.imputations m
    where m.status = 'IMPUTED'
      and m.imputed_at is not null
      and (m.imputed_at at time zone 'Indian/Comoro')::date >= p_from
      and (m.imputed_at at time zone 'Indian/Comoro')::date <= p_to
  ),
  regle as (
    select
      count(*)::integer                  as lignes,
      coalesce(sum(r.amount), 0)::bigint as montant
    from public.supplier_payments r
    where r.status = 'VALIDATED'
      and r.paid_on >= p_from
      and r.paid_on <= p_to
  ),
  dettes as (
    select
      f.due_date as due_date,
      public.supplier_invoice_gross(f.id)
        - public.supplier_invoice_imputed(f.id)
        - public.supplier_invoice_paid(f.id) as reste
    from public.supplier_invoices f
    where f.status = 'VALIDATED'
  )
  select
    (select fa.lignes  from facture fa),
    (select fa.montant from facture fa),
    (select im.lignes  from impute  im),
    (select im.montant from impute  im),
    (select rg.lignes  from regle   rg),
    (select rg.montant from regle   rg),
    (select count(*) filter (where d.reste > 0) from dettes d)::integer,
    (select coalesce(sum(d.reste) filter (where d.reste > 0), 0) from dettes d)::bigint,
    (
      select count(*) filter (
        where d.reste > 0 and d.due_date is not null and d.due_date < v_today
      )
      from dettes d
    )::integer,
    (
      select coalesce(
        sum(d.reste) filter (
          where d.reste > 0 and d.due_date is not null and d.due_date < v_today
        ),
        0
      )
      from dettes d
    )::bigint;
end;
$$;

comment on function public.billing_supplier_stats(date, date) is
  'Synthèse des factures fournisseurs — Module 07 §58. Facturé, imputé et payé sont trois FLUX datés de leur propre acte ; la dette est un STOCK, brut − imputé − payé, hors période. Exige les trois lectures : ignorer les imputations gonflerait la dette.';


-- =============================================================================
-- 6. SÉRIE FOURNISSEURS — Module 07 §59
-- =============================================================================

create or replace function public.billing_supplier_series(
  p_from  date,
  p_to    date,
  p_grain text
)
returns table (
  bucket         date,
  gross_amount   bigint,
  imputed_amount bigint,
  paid_amount    bigint
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  perform public.billing_require_period(p_from, p_to);
  perform public.billing_period_bucket(p_from, p_grain);

  perform public.require_capability(
    array['billing.supplier.stats.view'],
    'consulter les statistiques des factures fournisseurs'
  );
  perform public.require_capability(
    array['billing.supplier_invoices.view'],
    'lire les factures fournisseurs dont la série est le détail'
  );
  perform public.require_capability(
    array['billing.imputations.view'],
    'lire les imputations dont la série est le détail'
  );
  perform public.require_capability(
    array['billing.supplier_payments.view'],
    'lire les règlements fournisseurs dont la série est le détail'
  );

  return query
  with facture as (
    select
      public.billing_period_bucket(f.invoice_date, p_grain)      as pas,
      sum(public.supplier_invoice_gross(f.id))::bigint           as montant
    from public.supplier_invoices f
    where f.status = 'VALIDATED'
      and f.invoice_date >= p_from
      and f.invoice_date <= p_to
    group by 1
  ),
  impute as (
    select
      public.billing_period_bucket(
        (m.imputed_at at time zone 'Indian/Comoro')::date, p_grain
      )                                 as pas,
      sum(m.amount)::bigint             as montant
    from public.imputations m
    where m.status = 'IMPUTED'
      and m.imputed_at is not null
      and (m.imputed_at at time zone 'Indian/Comoro')::date >= p_from
      and (m.imputed_at at time zone 'Indian/Comoro')::date <= p_to
    group by 1
  ),
  regle as (
    select
      public.billing_period_bucket(r.paid_on, p_grain) as pas,
      sum(r.amount)::bigint                            as montant
    from public.supplier_payments r
    where r.status = 'VALIDATED'
      and r.paid_on >= p_from
      and r.paid_on <= p_to
    group by 1
  ),
  pas_connus as (
    select f.pas from facture f
    union
    select im.pas from impute im
    union
    select rg.pas from regle  rg
  )
  select
    k.pas,
    coalesce(f.montant,  0)::bigint,
    coalesce(im.montant, 0)::bigint,
    coalesce(rg.montant, 0)::bigint
  from pas_connus k
  left join facture f  on f.pas  = k.pas
  left join impute  im on im.pas = k.pas
  left join regle   rg on rg.pas = k.pas
  order by k.pas;
end;
$$;

comment on function public.billing_supplier_series(date, date, text) is
  'Facturé, imputé et payé par pas de temps — Module 07 §59. Trois flux distincts : leur différence sur un pas n''est pas une dette.';


-- =============================================================================
-- 7. RAPPORT FOURNISSEURS — Module 07 §60
--
-- « État des factures fournisseurs, état des dettes, état des règlements, état
-- des imputations. » Quatre états, une ligne par fournisseur : chacun y trouve
-- sa colonne, et la chaîne complète reste lisible d'un coup d'œil —
--
--   brut − imputé = net à payer      (CLAUDE.md §16)
--   net  − payé   = reste dû         (Workflow 08 §21)
--
-- L'état des PAIEMENTS DIVERS du §60 n'y figure pas : le module n'est pas
-- livré, sa navigation reste marquée « à venir ». Un état vide laisserait
-- croire qu'aucun paiement divers n'existe.
-- =============================================================================

create or replace function public.billing_supplier_report(p_from date, p_to date)
returns table (
  supplier_id      uuid,
  supplier_no      text,
  legal_name       text,
  trade_name       text,
  invoice_count    integer,
  gross_amount     bigint,
  imputed_amount   bigint,
  paid_amount      bigint,
  payable_amount   bigint,
  overdue_amount   bigint
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Indian/Comoro')::date;
begin
  perform public.billing_require_period(p_from, p_to);

  perform public.require_capability(
    array['billing.supplier.reports.view'],
    'consulter les rapports de facturation fournisseur'
  );
  perform public.require_capability(
    array['billing.supplier_invoices.view'],
    'lire les factures fournisseurs dont le rapport est l''état'
  );
  perform public.require_capability(
    array['billing.imputations.view'],
    'lire les imputations sans lesquelles le net à payer vaudrait le montant brut'
  );
  perform public.require_capability(
    array['billing.supplier_payments.view'],
    'lire les règlements fournisseurs sans lesquels le reste dû vaudrait le net'
  );

  return query
  with periode as (
    select
      f.supplier_id                                                 as sid,
      count(*)::integer                                             as lignes,
      coalesce(sum(public.supplier_invoice_gross(f.id)), 0)::bigint as brut
    from public.supplier_invoices f
    where f.status = 'VALIDATED'
      and f.invoice_date >= p_from
      and f.invoice_date <= p_to
    group by f.supplier_id
  ),
  impute as (
    select
      m.supplier_id                      as sid,
      coalesce(sum(m.amount), 0)::bigint as montant
    from public.imputations m
    where m.status = 'IMPUTED'
      and m.imputed_at is not null
      and (m.imputed_at at time zone 'Indian/Comoro')::date >= p_from
      and (m.imputed_at at time zone 'Indian/Comoro')::date <= p_to
    group by m.supplier_id
  ),
  regle as (
    select
      f.supplier_id                      as sid,
      coalesce(sum(r.amount), 0)::bigint as montant
    from public.supplier_payments r
    join public.supplier_invoices f on f.id = r.supplier_invoice_id
    where r.status = 'VALIDATED'
      and r.paid_on >= p_from
      and r.paid_on <= p_to
    group by f.supplier_id
  ),
  dettes as (
    select
      s.sid,
      coalesce(sum(s.reste) filter (where s.reste > 0), 0)::bigint as montant,
      coalesce(
        sum(s.reste) filter (
          where s.reste > 0 and s.due_date is not null and s.due_date < v_today
        ),
        0
      )::bigint as echu
    from (
      select
        f.supplier_id as sid,
        f.due_date    as due_date,
        public.supplier_invoice_gross(f.id)
          - public.supplier_invoice_imputed(f.id)
          - public.supplier_invoice_paid(f.id) as reste
      from public.supplier_invoices f
      where f.status = 'VALIDATED'
    ) s
    group by s.sid
  ),
  tiers as (
    select pe.sid from periode pe
    union
    select im.sid from impute  im
    union
    select rg.sid from regle   rg
    union
    select de.sid from dettes  de
  )
  select
    t.sid,
    s.supplier_no,
    s.legal_name,
    s.trade_name,
    coalesce(pe.lignes, 0),
    coalesce(pe.brut,    0)::bigint,
    coalesce(im.montant, 0)::bigint,
    coalesce(rg.montant, 0)::bigint,
    coalesce(de.montant, 0)::bigint,
    coalesce(de.echu,    0)::bigint
  from tiers t
  left join public.suppliers s on s.id = t.sid
  left join periode pe on pe.sid = t.sid
  left join impute  im on im.sid = t.sid
  left join regle   rg on rg.sid = t.sid
  left join dettes  de on de.sid = t.sid
  order by
    coalesce(de.echu, 0) desc,
    coalesce(de.montant, 0) desc,
    coalesce(pe.brut, 0) desc,
    s.legal_name nulls last;
end;
$$;

comment on function public.billing_supplier_report(date, date) is
  'État par fournisseur : factures, imputations, règlements et reste dû — Module 07 §60. Les paiements divers n''y figurent pas : le module n''est pas livré, et un état vide se lirait « aucun ».';


-- =============================================================================
-- 8. DROITS D'EXÉCUTION — DEC-022
--
-- Ces fonctions lisent des montants. Rien n'est exécutable par PUBLIC : elles
-- se donnent aux sessions authentifiées et au rôle de service, à personne
-- d'autre. `anon` n'a aucun accès au SaaS (CLAUDE.md §45 — SaaS strictement
-- interne).
-- =============================================================================

revoke execute on function public.billing_require_period(date, date) from public;
grant  execute on function public.billing_require_period(date, date)
  to authenticated, service_role;

revoke execute on function public.billing_period_bucket(date, text) from public;
grant  execute on function public.billing_period_bucket(date, text)
  to authenticated, service_role;

revoke execute on function public.billing_customer_stats(date, date) from public;
grant  execute on function public.billing_customer_stats(date, date)
  to authenticated, service_role;

revoke execute on function public.billing_customer_series(date, date, text) from public;
grant  execute on function public.billing_customer_series(date, date, text)
  to authenticated, service_role;

revoke execute on function public.billing_customer_report(date, date) from public;
grant  execute on function public.billing_customer_report(date, date)
  to authenticated, service_role;

revoke execute on function public.billing_supplier_stats(date, date) from public;
grant  execute on function public.billing_supplier_stats(date, date)
  to authenticated, service_role;

revoke execute on function public.billing_supplier_series(date, date, text) from public;
grant  execute on function public.billing_supplier_series(date, date, text)
  to authenticated, service_role;

revoke execute on function public.billing_supplier_report(date, date) from public;
grant  execute on function public.billing_supplier_report(date, date)
  to authenticated, service_role;


-- =============================================================================
-- 9. LE CATALOGUE NE BOUGE PAS
--
-- Les quatre capacités existent depuis la migration 007. Le LOT 11 ne fait que
-- leur donner enfin un contrôle serveur. En créer une de plus — `.export`,
-- `.download`, `.print` — serait interdit tant que la fonctionnalité
-- correspondante n'existe pas et n'a pas été validée (DEC-024 : « le catalogue
-- représente les capacités réelles du SaaS »).
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
  from unnest(array[
    'billing.customer.stats.view',
    'billing.customer.reports.view',
    'billing.supplier.stats.view',
    'billing.supplier.reports.view'
  ]) as code
  where not exists (select 1 from public.permissions p where p.code = code);

  if v_missing is not null then
    raise exception 'Capacités de statistiques ou de rapports absentes du catalogue : %.',
      array_to_string(v_missing, ', ');
  end if;
end $$;
