-- =============================================================================
-- ADIKOM PILOT — 056 · Centre de notifications
-- Phase 3 — Pilotage · LOT 10 (Module 02 — Centre de notifications)
--
-- CE QUE CETTE MIGRATION AJOUTE, ET CE QU'ELLE N'AJOUTE PAS
--
-- Elle ajoute UNE table : `notification_reads` — qui a lu quoi, et quand. Elle
-- n'ajoute AUCUNE table de notifications, AUCUN déclencheur de diffusion,
-- AUCUNE permission.
--
-- POURQUOI AUCUNE NOTIFICATION N'EST STOCKÉE
--
-- Module 02 §3 : « une notification doit toujours être liée à un événement réel
-- du système ; le système ne doit jamais générer artificiellement des
-- notifications ». La façon la plus sûre de tenir cette règle est de ne pas
-- recopier l'événement : chaque notification est REFAITE À LA LECTURE, sur les
-- données du module qui la produit.
--
-- Une notification stockée devrait être tenue à jour, et une notification
-- périmée est une notification FAUSSE — « le véhicule doit rentrer aujourd'hui »
-- reste affiché alors qu'il est rentré. C'est la doctrine du Tableau de location
-- (LOT 1) et du Tableau de bord (DEC-032 §a), appliquée à la veille.
--
-- Trois exigences du module en découlent SANS code :
--
--   §26  pas de surcharge      une situation résolue cesse d'elle-même de dire
--   §27  déduplication         une situation = une clé = une seule ligne
--   §32  rien à supprimer      aucune donnée métier n'est touchée
--
-- CE QUE LA VEILLE NE COUVRE PAS, ET POURQUOI
--
-- Les notifications d'INFORMATION du §4.1 — « nouvelle réservation », « nouveau
-- client », « véhicule ajouté » — sont des ÉVÉNEMENTS de création, non des
-- situations. Les dériver supposerait une fenêtre (« créé depuis N jours ») que
-- rien ne documente, et elles recouvrent l'« activité récente » du §21, dont
-- l'écran — le journal d'audit — relève de la Phase 4 (DEC-032 §h). Elles ne
-- sont donc pas livrées, et rien n'est inventé à leur place.
--
-- SÉCURITÉ — CHAQUE SOURCE EXIGE SES LECTURES, SINON ELLE SE TAIT
--
-- Module 02 §22 : « Permission suffisante ? Oui → Notification. Non → Aucune
-- notification. » Chaque famille est donc conditionnée aux capacités dont sa
-- lecture dépend, et le silence est complet : ni titre, ni objet, ni montant.
--
-- Et là où une omission produirait un MENSONGE plutôt qu'un silence, la famille
-- exige TOUTES ses lectures (DEC-032 §d) : sans `customer_payments.view`, une
-- facture soldée paraîtrait impayée ; sans `imputations.view`, une dette déjà
-- réduite paraîtrait entière — et une imputation n'est pas un paiement
-- (CLAUDE.md §57).
--
-- Aucune fonction n'est `SECURITY DEFINER` (DEC-022) : RLS reste en vigueur.
--
-- HORS SESSION APPLICATIVE
--
-- `current_actor()` vaut NULL pour une migration, un script d'environnement ou
-- la clé de service : les gardes s'effacent alors, comme partout ailleurs
-- (convention de la migration 021). Les capacités s'éprouvent avec de vraies
-- sessions — `verify:capabilities` et `verify:notifications`.
--
-- FUSEAU
--
-- « Aujourd'hui », « demain » et « en retard » se lisent sur `Indian/Comoro`
-- (DEC-025 §e). Une échéance au 30 n'est pas dépassée le 30, et un départ prévu
-- le 1er à 01:00 aux Comores n'est pas un départ du 31.
-- =============================================================================


-- =============================================================================
-- 1. OUTILS DE CAPACITÉ — la forme qui RÉPOND, à côté de celle qui REFUSE
--
-- `require_capability` exige AU MOINS UNE capacité et LÈVE une exception : c'est
-- ce qu'il faut pour un acte. Une veille, elle, doit pouvoir constater qu'une
-- source ne lui est pas ouverte et passer à la suivante — sans faire échouer
-- tout l'écran.
--
-- Sémantique inverse, donc, et assumée : TOUTES les capacités citées sont
-- exigées, et le résultat est un booléen. La composition reste explicite
-- (DEC-024) : aucune capacité n'en implique une autre.
-- =============================================================================

create or replace function public.holds_capabilities(p_codes text[])
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  -- Migration, script d'environnement, clé de service : pas de session
  -- applicative, donc pas de capacité à vérifier (convention de la 021).
  if public.current_actor() is null then
    return true;
  end if;

  foreach v_code in array coalesce(p_codes, array[]::text[]) loop
    if not public.has_permission(v_code) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

comment on function public.holds_capabilities(text[]) is
  'Vraie lorsque TOUTES les capacités citées sont détenues. Contrairement à `require_capability`, ne lève rien : une source de veille non ouverte se tait, elle ne fait pas échouer l''écran (Module 02 §22).';


-- Rang de priorité — Module 02 §25.
--
-- « Urgent ↓ Important ↓ À surveiller ↓ Information ». Le rappel n'est pas dans
-- cette échelle : il annonce une échéance qui n'est pas encore un problème, il
-- se lit donc après ce qui presse et avant ce qui informe.
create or replace function public.notification_level_rank(p_level text)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_level
    when 'URGENT'      then 1
    when 'IMPORTANT'   then 2
    when 'ATTENTION'   then 3
    when 'REMINDER'    then 4
    when 'INFORMATION' then 5
    else 9
  end;
$$;

comment on function public.notification_level_rank(text) is
  'Ordre de priorité des niveaux (Module 02 §25). Sert au tri du centre de notifications.';


-- Libellé d'un véhicule, construit sans lecture.
--
-- Les colonnes arrivent par jointure EXTERNE : sans `rental.fleet.view`, elles
-- valent NULL et la notification reste lisible sans sa monture (convention de
-- `listExpiringVehicleDocuments`). Aucune information ne fuit, aucune ligne ne
-- disparaît.
create or replace function public.notification_vehicle_label(
  p_brand text,
  p_model text,
  p_plate text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_brand is null and p_model is null then null
    else btrim(concat_ws(' ', p_brand, p_model)) || coalesce(' — ' || p_plate, '')
  end;
$$;

comment on function public.notification_vehicle_label(text, text, text) is
  'Libellé « Marque Modèle — Immatriculation » d''un véhicule joint en LEFT JOIN. NULL lorsque le véhicule n''est pas lisible.';


-- =============================================================================
-- 2. L'ÉTAT DE LECTURE — la seule chose qui se stocke
--
-- Module 02 §19 : chaque notification possède un état, non lue ou lue. §24 :
-- « chaque utilisateur doit conserver son propre état de lecture ». Une ligne
-- par utilisateur et par clé de notification suffit à porter les deux.
--
-- MARQUER LU N'EST PAS UNE CAPACITÉ SÉPARÉE.
--
-- Le catalogue porte `notifications.view` — « Consulter ses notifications » — et
-- rien d'autre. Gérer l'état de lecture DE SES PROPRES notifications est
-- inhérent à leur consultation : §19 l'exige de tout utilisateur qui les lit.
-- Créer une capacité de plus serait en créer une d'office, ce que DEC-024
-- interdit. Le catalogue reste donc à 153.
--
-- UNE LIGNE NE PARLE QUE DE SON PROPRIÉTAIRE.
--
-- Pas d'`UPDATE`, pas de `DELETE` : une lecture est un fait daté, elle ne se
-- réécrit pas. Rien ne permet donc de « dé-lire » une notification — le module
-- ne le demande pas (§19 ne prévoit que le marquage), et une notification
-- importante reste de toute façon présente après lecture.
--
-- La forme de la clé est CONTRAINTE : sans cela, la table serait un espace
-- d'écriture libre pour toute session authentifiée.
-- =============================================================================

create table public.notification_reads (
  user_id          uuid        not null references public.app_users (id) on delete cascade,
  notification_key text        not null,
  read_at          timestamptz not null default now(),

  primary key (user_id, notification_key),

  constraint notification_reads_key_shape check (
    length(notification_key) <= 120
    and notification_key ~ '^[a-z][a-z._]*:[0-9a-fA-F-]{36}$'
  )
);

comment on table public.notification_reads is
  'État de lecture des notifications, par utilisateur (Module 02 §19, §24). Ne contient AUCUNE notification : celles-ci sont dérivées à la lecture par `notifications_watch()`.';
comment on column public.notification_reads.notification_key is
  'Clé de la situation notifiée — `famille:identifiant`. Stable dans le temps : c''est ce qui rend la déduplication structurelle (§27).';

-- Aucun déclencheur d'audit : marquer une notification comme lue n'est pas une
-- opération sensible, et §31 distingue explicitement l'historique des
-- notifications du journal d'audit. L'inscrire au journal le noierait.


-- =============================================================================
-- 3. LA VEILLE — Module 02 §4, §6 à §13
--
-- Une famille par situation documentée. Chacune porte :
--
--   `key`          la situation, identifiée de façon stable (§27) ;
--   `kind`         sa nature, que l'écran traduit en une phrase ;
--   `level`        son niveau, PRIS DANS LES EXEMPLES DU §4 — jamais choisi ;
--   `source`       son module d'origine (§5, §18) ;
--   `subject`      la référence de l'objet — toujours lisible ;
--   `detail`       ce qui l'entoure : véhicule, client, fournisseur ;
--   `object_type`  et `object_id` : de quoi ouvrir l'objet concerné (§21) ;
--   `occurred_at`  l'instant qui compte — échéance, départ, retour, constat ;
--   `due_on`       le jour civil correspondant, lorsqu'il y en a un ;
--   `amount`       le montant en jeu, pour les seules familles financières.
--
-- LE NIVEAU N'EST JAMAIS UNE APPRÉCIATION.
--
-- §25 : « le niveau doit être déterminé par la règle métier concernée ». Chaque
-- famille reprend donc un exemple littéral du §4 :
--
--   §4.2 Rappel     « départ prévu demain », « retour prévu demain »,
--                   « maintenance prévue »
--   §4.3 Attention  « document proche de l'expiration », « paiement en attente »,
--                   « situation qui mérite une vérification »
--   §4.4 Important  « véhicule immobilisé », « retour non enregistré »
--   §4.5 Urgent     « véhicule immobilisé pendant une location »,
--                   « incident important sur un véhicule en location »
--
-- Là où le document nomme un seuil qu'aucune règle ne fixe — « facture
-- IMPORTANTE en retard » (§4.4) —, le niveau retenu est le plus BAS des deux
-- lectures possibles : une facture échue est « à surveiller ». Choisir
-- « important » supposerait un montant plancher, c'est-à-dire une règle métier
-- (point laissé ouvert par DEC-033).
-- =============================================================================

create or replace function public.notifications_watch()
returns table (
  key         text,
  kind        text,
  level       text,
  source      text,
  subject     text,
  detail      text,
  object_type text,
  object_id   uuid,
  occurred_at timestamptz,
  due_on      date,
  amount      bigint
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_now      timestamptz := now();
  v_today    date := (now() at time zone 'Indian/Comoro')::date;
  v_tomorrow date := (now() at time zone 'Indian/Comoro')::date + 1;
  -- §28 : « maintenance prévue dans 7 jours », « assurance expirant dans
  -- 30 jours ». Les deux horizons sont ceux du document, et le second est déjà
  -- celui du tableau de bord (Module 01 §14).
  v_maintenance_horizon date := (now() at time zone 'Indian/Comoro')::date + 7;
  v_document_horizon    date := (now() at time zone 'Indian/Comoro')::date + 30;
begin
  perform public.require_capability(
    array['notifications.view'], 'consulter ses notifications'
  );

  /* ----------------------------------------------------------------------- */
  /*  §8 — DÉPART PRÉVU · Rappel                                             */
  /*                                                                         */
  /*  Réservations confirmées ou en préparation dont le départ tombe          */
  /*  aujourd'hui ou demain. Jours CIVILS, jamais « dans 24 heures » : un     */
  /*  départ prévu ce soir et un départ prévu demain matin ne doivent pas     */
  /*  changer de catégorie selon l'heure à laquelle on consulte l'écran.      */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(array['rental.reservations.view']) then
    return query
    select
      'reservation.departure:' || r.id::text,
      'RESERVATION_DEPARTURE'::text,
      'REMINDER'::text,
      'rental'::text,
      r.reservation_no,
      nullif(
        concat_ws(
          ' · ',
          public.notification_vehicle_label(v.brand, v.model, v.plate),
          c.legal_name
        ),
        ''
      ),
      'reservation'::text,
      r.id,
      lower(r.period),
      (lower(r.period) at time zone 'Indian/Comoro')::date,
      null::bigint
    from public.reservations r
    left join public.vehicles v on v.id = r.vehicle_id
    left join public.clients  c on c.id = r.client_id
    where r.status in ('CONFIRMED', 'PREPARING')
      and (lower(r.period) at time zone 'Indian/Comoro')::date
          between v_today and v_tomorrow;
  end if;

  /* ----------------------------------------------------------------------- */
  /*  §9 — RETOUR PRÉVU · Rappel                                             */
  /*                                                                         */
  /*  Le retard a sa propre famille, plus haute : une location dont l'heure   */
  /*  de retour est PASSÉE n'est plus un rappel. Les deux sont donc           */
  /*  mutuellement exclusives — une situation, une notification (§27).        */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(array['rental.rentals.view']) then
    return query
    select
      'rental.return.due:' || l.id::text,
      'RENTAL_RETURN_DUE'::text,
      'REMINDER'::text,
      'rental'::text,
      l.rental_no,
      nullif(
        concat_ws(
          ' · ',
          public.notification_vehicle_label(v.brand, v.model, v.plate),
          c.legal_name
        ),
        ''
      ),
      'rental'::text,
      l.id,
      l.expected_return_at,
      (l.expected_return_at at time zone 'Indian/Comoro')::date,
      null::bigint
    from public.rentals l
    left join public.vehicles v on v.id = l.vehicle_id
    left join public.clients  c on c.id = l.client_id
    where l.status in ('IN_PROGRESS', 'EXTENDED')
      and l.expected_return_at >= v_now
      and (l.expected_return_at at time zone 'Indian/Comoro')::date
          between v_today and v_tomorrow;

    /* ------------------------------------------------------------------- */
    /*  §4.4 et §9 — RETOUR NON ENREGISTRÉ · Important                     */
    /*                                                                     */
    /*  « Retour dépassé » : dérivé de `expected_return_at` et de l'heure   */
    /*  courante (DEC-025 §a), jamais d'un statut écrit. `LATE` figure      */
    /*  néanmoins dans la liste : le jour où il serait écrit, la veille ne  */
    /*  devrait pas cesser de le voir.                                     */
    /* ------------------------------------------------------------------- */

    return query
    select
      'rental.return.late:' || l.id::text,
      'RENTAL_RETURN_LATE'::text,
      'IMPORTANT'::text,
      'rental'::text,
      l.rental_no,
      nullif(
        concat_ws(
          ' · ',
          public.notification_vehicle_label(v.brand, v.model, v.plate),
          c.legal_name
        ),
        ''
      ),
      'rental'::text,
      l.id,
      l.expected_return_at,
      (l.expected_return_at at time zone 'Indian/Comoro')::date,
      null::bigint
    from public.rentals l
    left join public.vehicles v on v.id = l.vehicle_id
    left join public.clients  c on c.id = l.client_id
    where l.status in ('IN_PROGRESS', 'EXTENDED', 'LATE')
      and l.expected_return_at < v_now;

    /* ------------------------------------------------------------------- */
    /*  §9 — CONTRÔLE DE RETOUR À EFFECTUER · Attention                    */
    /*                                                                     */
    /*  §4.3 définit l'attention comme « une situation qui mérite une       */
    /*  vérification » : un véhicule rentré dont l'état des lieux attend    */
    /*  sa validation en est la définition même.                           */
    /* ------------------------------------------------------------------- */

    return query
    select
      'rental.control:' || l.id::text,
      'RENTAL_TO_CONTROL'::text,
      'ATTENTION'::text,
      'rental'::text,
      l.rental_no,
      nullif(
        concat_ws(
          ' · ',
          public.notification_vehicle_label(v.brand, v.model, v.plate),
          c.legal_name
        ),
        ''
      ),
      'rental'::text,
      l.id,
      l.returned_at,
      (l.returned_at at time zone 'Indian/Comoro')::date,
      null::bigint
    from public.rentals l
    left join public.vehicles v on v.id = l.vehicle_id
    left join public.clients  c on c.id = l.client_id
    where l.status = 'TO_CONTROL';
  end if;

  /* ----------------------------------------------------------------------- */
  /*  §11 et §28 — MAINTENANCE PRÉVUE · Rappel                               */
  /*                                                                         */
  /*  « Maintenance prévue dans 7 jours » (§28) : l'horizon est celui du      */
  /*  document, pas un choix.                                                */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(array['rental.maintenance.view']) then
    return query
    select
      'maintenance.planned:' || m.id::text,
      'MAINTENANCE_PLANNED'::text,
      'REMINDER'::text,
      'rental'::text,
      m.maintenance_no,
      nullif(
        concat_ws(
          ' · ',
          public.notification_vehicle_label(v.brand, v.model, v.plate),
          m.reason
        ),
        ''
      ),
      'maintenance'::text,
      m.id,
      m.planned_at,
      (m.planned_at at time zone 'Indian/Comoro')::date,
      null::bigint
    from public.vehicle_maintenances m
    left join public.vehicles v on v.id = m.vehicle_id
    where m.status = 'PLANNED'
      and m.planned_at is not null
      and m.planned_at >= v_now
      and (m.planned_at at time zone 'Indian/Comoro')::date <= v_maintenance_horizon;

    /* ------------------------------------------------------------------- */
    /*  §6 et §11 — MAINTENANCE EN RETARD · Attention                      */
    /*                                                                     */
    /*  §11 le dit sans détour : « Maintenance en retard ↓ Notification     */
    /*  d'attention ». Est en retard une intervention PLANIFIÉE dont la     */
    /*  date est passée : une intervention engagée n'est pas en retard,     */
    /*  elle est en cours.                                                 */
    /* ------------------------------------------------------------------- */

    return query
    select
      'maintenance.late:' || m.id::text,
      'MAINTENANCE_LATE'::text,
      'ATTENTION'::text,
      'rental'::text,
      m.maintenance_no,
      nullif(
        concat_ws(
          ' · ',
          public.notification_vehicle_label(v.brand, v.model, v.plate),
          m.reason
        ),
        ''
      ),
      'maintenance'::text,
      m.id,
      m.planned_at,
      (m.planned_at at time zone 'Indian/Comoro')::date,
      null::bigint
    from public.vehicle_maintenances m
    left join public.vehicles v on v.id = m.vehicle_id
    where m.status = 'PLANNED'
      and m.planned_at is not null
      and m.planned_at < v_now;
  end if;

  /* ----------------------------------------------------------------------- */
  /*  §4.4 et §10 — VÉHICULE IMMOBILISÉ · Important                          */
  /*                                                                         */
  /*  Hors exploitation : il ne peut pas être loué. Les véhicules immobilisés */
  /*  PENDANT une location sortent d'ici : ils relèvent de l'urgence (§4.5),  */
  /*  et une situation ne se notifie qu'une fois (§27).                      */
  /*                                                                         */
  /*  Sans `rental.rentals.view`, aucune location n'est visible : le partage  */
  /*  ne peut pas se faire, et TOUS les véhicules immobilisés se lisent ici.  */
  /*  C'est une information vraie et complète dans le périmètre de ce lecteur */
  /*  — jamais un chiffre faux.                                             */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(array['rental.fleet.view']) then
    return query
    select
      'vehicle.immobilized:' || v.id::text,
      'VEHICLE_IMMOBILIZED'::text,
      'IMPORTANT'::text,
      'rental'::text,
      coalesce(public.notification_vehicle_label(v.brand, v.model, v.plate), v.vehicle_no),
      nullif(concat_ws(' · ', v.vehicle_no, v.status_reason), ''),
      'vehicle'::text,
      v.id,
      coalesce(v.status_changed_at, v.updated_at),
      null::date,
      null::bigint
    from public.vehicles v
    where v.status = 'IMMOBILIZED'
      and not exists (
        select 1
        from public.rentals l
        where l.vehicle_id = v.id
          and l.status in ('IN_PROGRESS', 'EXTENDED')
      );
  end if;

  /* ----------------------------------------------------------------------- */
  /*  §4.5 — VÉHICULE IMMOBILISÉ PENDANT UNE LOCATION · Urgent               */
  /*                                                                         */
  /*  Les deux lectures sont exigées : c'est le croisement qui fait           */
  /*  l'urgence. L'objet ouvert est la LOCATION — c'est elle qui est          */
  /*  compromise, et c'est là que le geste se fait.                          */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(array['rental.fleet.view', 'rental.rentals.view']) then
    return query
    select
      'rental.vehicle.immobilized:' || l.id::text,
      'RENTAL_VEHICLE_IMMOBILIZED'::text,
      'URGENT'::text,
      'rental'::text,
      l.rental_no,
      nullif(
        concat_ws(
          ' · ',
          public.notification_vehicle_label(v.brand, v.model, v.plate),
          c.legal_name,
          v.status_reason
        ),
        ''
      ),
      'rental'::text,
      l.id,
      coalesce(v.status_changed_at, l.started_at, l.created_at),
      null::date,
      null::bigint
    from public.rentals l
    join public.vehicles v on v.id = l.vehicle_id
    left join public.clients c on c.id = l.client_id
    where l.status in ('IN_PROGRESS', 'EXTENDED')
      and v.status = 'IMMOBILIZED';
  end if;

  /* ----------------------------------------------------------------------- */
  /*  §4.5 et §6 — INCIDENT SUR UN VÉHICULE EN LOCATION                      */
  /*                                                                         */
  /*  Urgent lorsqu'un dommage IMPORTANT est constaté — `MAJOR`, dont le      */
  /*  libellé métier est précisément « Important » (migration 036) —, à       */
  /*  surveiller sinon. Le niveau vient donc de la donnée, non d'une          */
  /*  appréciation : aucun incident ne devient urgent par défaut (§25 :       */
  /*  « l'interface ne doit pas transformer chaque événement en urgence »).   */
  /*                                                                         */
  /*  Les deux lectures sont exigées : sans les locations, rien ne dit que    */
  /*  l'incident touche un véhicule ENCORE en location.                      */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(array['rental.incidents.view', 'rental.rentals.view']) then
    return query
    select
      'incident.rental:' || i.id::text,
      'INCIDENT_ON_RENTAL'::text,
      case
        when exists (
          select 1
          from public.incident_damages d
          where d.incident_id = i.id
            and d.severity = 'MAJOR'
        ) then 'URGENT'
        else 'ATTENTION'
      end::text,
      'rental'::text,
      i.incident_no,
      nullif(
        concat_ws(
          ' · ',
          public.notification_vehicle_label(v.brand, v.model, v.plate),
          l.rental_no,
          i.description
        ),
        ''
      ),
      'incident'::text,
      i.id,
      i.occurred_at,
      null::date,
      null::bigint
    from public.vehicle_incidents i
    join public.rentals l on l.id = i.rental_id
    left join public.vehicles v on v.id = i.vehicle_id
    where i.status in ('OPEN', 'IN_PROGRESS')
      and l.status in ('IN_PROGRESS', 'EXTENDED');
  end if;

  /* ----------------------------------------------------------------------- */
  /*  §4.3, §10 et §28 — ÉCHÉANCE DOCUMENTAIRE                               */
  /*                                                                         */
  /*  Deux familles, comme sur le tableau de bord : proche de l'expiration —  */
  /*  « à surveiller », mot du §4.3 — et déjà expirée, plus haute, parce      */
  /*  qu'un véhicule dont l'assurance a expiré ne devrait plus rouler.        */
  /*                                                                         */
  /*  La policy de la table accepte `rental.documents.view` OU               */
  /*  `rental.fleet.view` (migration 008) : la veille ne peut pas être plus   */
  /*  restrictive que la base sans mentir sur le motif.                      */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(array['rental.documents.view'])
     or public.holds_capabilities(array['rental.fleet.view'])
  then
    return query
    select
      'vehicle.document.expiring:' || d.id::text,
      'VEHICLE_DOCUMENT_EXPIRING'::text,
      'ATTENTION'::text,
      'rental'::text,
      d.label,
      nullif(
        concat_ws(
          ' · ',
          public.notification_vehicle_label(v.brand, v.model, v.plate),
          d.reference
        ),
        ''
      ),
      'vehicle'::text,
      d.vehicle_id,
      (d.expires_on::timestamp at time zone 'Indian/Comoro'),
      d.expires_on,
      null::bigint
    from public.vehicle_documents d
    left join public.vehicles v on v.id = d.vehicle_id
    where d.is_archived = false
      and d.expires_on is not null
      and d.expires_on >= v_today
      and d.expires_on <= v_document_horizon;

    return query
    select
      'vehicle.document.expired:' || d.id::text,
      'VEHICLE_DOCUMENT_EXPIRED'::text,
      'IMPORTANT'::text,
      'rental'::text,
      d.label,
      nullif(
        concat_ws(
          ' · ',
          public.notification_vehicle_label(v.brand, v.model, v.plate),
          d.reference
        ),
        ''
      ),
      'vehicle'::text,
      d.vehicle_id,
      (d.expires_on::timestamp at time zone 'Indian/Comoro'),
      d.expires_on,
      null::bigint
    from public.vehicle_documents d
    left join public.vehicles v on v.id = d.vehicle_id
    where d.is_archived = false
      and d.expires_on is not null
      and d.expires_on < v_today;
  end if;

  /* ----------------------------------------------------------------------- */
  /*  §12 — FACTURE CLIENT ÉCHUE NON SOLDÉE · Attention                      */
  /*                                                                         */
  /*  LES DEUX LECTURES SONT EXIGÉES.                                        */
  /*                                                                         */
  /*  Sans `customer_payments.view`, `customer_invoice_paid` vaudrait zéro    */
  /*  sous la seule RLS : une facture intégralement réglée serait annoncée    */
  /*  impayée, avec son montant. C'est la leçon de la migration 050,          */
  /*  reprise par DEC-032 §d — une somme muette est refusée, jamais           */
  /*  approchée. Ici, la famille entière se TAIT.                            */
  /*                                                                         */
  /*  Le solde n'est pas recalculé : il vient des fonctions de la facture     */
  /*  (Workflow 08 §21). La veille n'a aucune arithmétique propre.            */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(
       array['billing.customer_invoices.view', 'billing.customer_payments.view']
     )
  then
    return query
    select
      'customer_invoice.overdue:' || f.id::text,
      'CUSTOMER_INVOICE_OVERDUE'::text,
      'ATTENTION'::text,
      'billing'::text,
      f.invoice_no,
      nullif(concat_ws(' · ', c.legal_name), ''),
      'customer_invoice'::text,
      f.id,
      (f.due_date::timestamp at time zone 'Indian/Comoro'),
      f.due_date,
      public.customer_invoice_total(f.id) - public.customer_invoice_paid(f.id)
    from public.customer_invoices f
    left join public.clients c on c.id = f.client_id
    where f.status = 'ISSUED'
      and f.due_date is not null
      and f.due_date < v_today
      and public.customer_invoice_total(f.id) - public.customer_invoice_paid(f.id) > 0;
  end if;

  /* ----------------------------------------------------------------------- */
  /*  §12 et §13 — FACTURE FOURNISSEUR ÉCHUE · Attention                     */
  /*                                                                         */
  /*  LES TROIS LECTURES SONT EXIGÉES, et la deuxième est la plus             */
  /*  importante du lot : sans `imputations.view`, le net vaudrait le brut    */
  /*  et la notification réclamerait 1 000 000 KMF là où ADIKOM ne doit que   */
  /*  500 000 (CLAUDE.md §16). Une imputation n'est pas un paiement           */
  /*  (CLAUDE.md §57) — et elle ne doit pas non plus pouvoir être ignorée.    */
  /* ----------------------------------------------------------------------- */

  if public.holds_capabilities(
       array[
         'billing.supplier_invoices.view',
         'billing.imputations.view',
         'billing.supplier_payments.view'
       ]
     )
  then
    return query
    select
      'supplier_invoice.overdue:' || f.id::text,
      'SUPPLIER_INVOICE_OVERDUE'::text,
      'ATTENTION'::text,
      'billing'::text,
      f.invoice_no,
      nullif(concat_ws(' · ', s.legal_name, f.external_ref), ''),
      'supplier_invoice'::text,
      f.id,
      (f.due_date::timestamp at time zone 'Indian/Comoro'),
      f.due_date,
      public.supplier_invoice_gross(f.id)
        - public.supplier_invoice_imputed(f.id)
        - public.supplier_invoice_paid(f.id)
    from public.supplier_invoices f
    left join public.suppliers s on s.id = f.supplier_id
    where f.status = 'VALIDATED'
      and f.due_date is not null
      and f.due_date < v_today
      and public.supplier_invoice_gross(f.id)
          - public.supplier_invoice_imputed(f.id)
          - public.supplier_invoice_paid(f.id) > 0;
  end if;
end;
$$;

comment on function public.notifications_watch() is
  'La veille : les situations réelles du système qui appellent une information ou un geste (Module 02 §4 à §13). Aucune notification n''est stockée ; chaque famille exige ses lectures et se tait sinon (§22).';


-- =============================================================================
-- 4. LE CENTRE — la veille, l'état de lecture, les filtres, l'ordre
--
-- Module 02 §18 : filtres par état, par niveau, par module. §25 : les urgentes
-- d'abord. §36 : ne pas charger inutilement tout l'historique.
--
-- LE FILTRE EST APPLIQUÉ EN BASE, PAS APRÈS LA LIMITE.
--
-- Filtrer côté application une liste déjà tronquée rendrait un résultat
-- silencieusement incomplet — la leçon de DEC-032 §b, ici appliquée à un
-- filtre plutôt qu'à une somme.
-- =============================================================================

create or replace function public.notifications_feed(
  p_state  text    default null,   -- 'unread' · 'read' · NULL = les deux
  p_level  text    default null,   -- URGENT · IMPORTANT · ATTENTION · REMINDER
  p_source text    default null,   -- 'rental' · 'billing'
  p_limit  integer default 200
)
returns table (
  key         text,
  kind        text,
  level       text,
  source      text,
  subject     text,
  detail      text,
  object_type text,
  object_id   uuid,
  occurred_at timestamptz,
  due_on      date,
  amount      bigint,
  read_at     timestamptz
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_actor uuid    := public.current_actor();
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  perform public.require_capability(
    array['notifications.view'], 'consulter ses notifications'
  );

  return query
  with veille as (
    select
      w.*,
      (
        select r.read_at
        from public.notification_reads r
        where r.user_id = v_actor
          and r.notification_key = w.key
      ) as read_at
    from public.notifications_watch() w
  )
  select
    f.key, f.kind, f.level, f.source, f.subject, f.detail,
    f.object_type, f.object_id, f.occurred_at, f.due_on, f.amount, f.read_at
  from veille f
  where (
      p_state is null
      or (p_state = 'unread' and f.read_at is null)
      or (p_state = 'read'   and f.read_at is not null)
    )
    and (p_level  is null or f.level  = p_level)
    and (p_source is null or f.source = p_source)
  -- Ce qui presse d'abord, puis ce qui presse le plus tôt : l'échéance la plus
  -- ancienne — ou la plus proche — passe devant.
  order by
    public.notification_level_rank(f.level),
    f.occurred_at asc nulls last,
    f.key
  limit v_limit;
end;
$$;

comment on function public.notifications_feed(text, text, text, integer) is
  'Le centre de notifications d''un utilisateur : la veille, son état de lecture, filtrée et ordonnée (Module 02 §18, §25, §36).';


-- Compteurs — Module 02 §17, §39.6.
--
-- « Le compteur doit être mis à jour selon l'état réel des notifications » : il
-- se compte donc en base, sur l'ENSEMBLE de la veille, sans pagination. Un
-- compteur calculé sur une page serait faux dès la page pleine (DEC-032 §b).
create or replace function public.notifications_summary()
returns table (
  total     integer,
  unread    integer,
  urgent    integer,
  important integer,
  attention integer,
  reminder  integer
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.current_actor();
begin
  perform public.require_capability(
    array['notifications.view'], 'consulter ses notifications'
  );

  return query
  with veille as (
    select
      w.key,
      w.level,
      exists (
        select 1
        from public.notification_reads r
        where r.user_id = v_actor
          and r.notification_key = w.key
      ) as est_lue
    from public.notifications_watch() w
  )
  select
    count(*)::integer,
    count(*) filter (where not f.est_lue)::integer,
    count(*) filter (where f.level = 'URGENT')::integer,
    count(*) filter (where f.level = 'IMPORTANT')::integer,
    count(*) filter (where f.level = 'ATTENTION')::integer,
    count(*) filter (where f.level = 'REMINDER')::integer
  from veille f;
end;
$$;

comment on function public.notifications_summary() is
  'Compteurs du centre de notifications : total, non lues, et par niveau (Module 02 §17). Les quatre colonnes de niveau comptent TOUTES les notifications du niveau, lues comprises — ce sont les repères des filtres ; `unread` est le compteur du badge.';


-- =============================================================================
-- 5. MARQUER COMME LU — Module 02 §19, §20
--
-- « Cette action doit uniquement modifier l'état de lecture. Elle ne doit pas
-- supprimer les notifications » (§20). Elle ne peut rien supprimer : il n'y a
-- rien à supprimer.
--
-- ON NE MARQUE QUE CE QUE L'ON VOIT.
--
-- Les clés acceptées sont celles de la PROPRE veille de l'appelant. Une clé
-- inventée, ou celle d'une notification qu'il n'a pas le droit de voir, ne
-- produit aucune ligne : la table n'est pas un espace d'écriture libre.
-- =============================================================================

create or replace function public.notification_mark_read(p_keys text[])
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.current_actor();
  v_count integer;
begin
  perform public.require_capability(
    array['notifications.view'], 'marquer une notification comme lue'
  );

  if v_actor is null then
    raise exception
      'Aucune session applicative : une notification se marque au nom d''un utilisateur.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_keys is null or array_length(p_keys, 1) is null then
    return 0;
  end if;

  with retenues as (
    select w.key
    from public.notifications_watch() w
    where w.key = any(p_keys)
  ),
  posees as (
    insert into public.notification_reads (user_id, notification_key)
    select v_actor, r.key from retenues r
    on conflict (user_id, notification_key) do nothing
    returning 1
  )
  select count(*)::integer into v_count from posees;

  return v_count;
end;
$$;

comment on function public.notification_mark_read(text[]) is
  'Marque comme lues les notifications citées, parmi celles que l''appelant voit réellement (Module 02 §19). Ne modifie aucune donnée métier.';


create or replace function public.notification_mark_all_read()
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.current_actor();
  v_count integer;
begin
  perform public.require_capability(
    array['notifications.view'], 'marquer toutes ses notifications comme lues'
  );

  if v_actor is null then
    raise exception
      'Aucune session applicative : une notification se marque au nom d''un utilisateur.'
      using errcode = 'insufficient_privilege';
  end if;

  with posees as (
    insert into public.notification_reads (user_id, notification_key)
    select v_actor, w.key from public.notifications_watch() w
    on conflict (user_id, notification_key) do nothing
    returning 1
  )
  select count(*)::integer into v_count from posees;

  return v_count;
end;
$$;

comment on function public.notification_mark_all_read() is
  '« Tout marquer comme lu » (Module 02 §20) : n''agit que sur l''état de lecture, et seulement sur les notifications que l''appelant voit.';


-- =============================================================================
-- 6. RLS ET DROITS
--
-- Une ligne de lecture ne concerne que son propriétaire (§23, §37) : la policy
-- l'impose en `SELECT` comme en `INSERT`. `notifications.view` est exigée en
-- plus — un compte qui n'a pas accès au centre n'a pas d'état de lecture à
-- tenir.
--
-- Ni `UPDATE` ni `DELETE` : la capacité est retirée au rôle applicatif, donc
-- aucune policy n'a à les couvrir.
-- =============================================================================

revoke all            on public.notification_reads from anon;
revoke update, delete on public.notification_reads from authenticated;

alter table public.notification_reads enable row level security;

create policy notification_reads_select on public.notification_reads
  for select to authenticated
  using (
    user_id = public.current_actor()
    and public.has_permission('notifications.view')
  );

create policy notification_reads_insert on public.notification_reads
  for insert to authenticated
  with check (
    user_id = public.current_actor()
    and public.has_permission('notifications.view')
  );


-- --- Exécution : rien pour PUBLIC (DEC-022) ---------------------------------

revoke execute on function public.holds_capabilities(text[]) from public;
grant  execute on function public.holds_capabilities(text[]) to authenticated, service_role;

revoke execute on function public.notification_level_rank(text) from public;
grant  execute on function public.notification_level_rank(text) to authenticated, service_role;

revoke execute on function public.notification_vehicle_label(text, text, text) from public;
grant  execute on function public.notification_vehicle_label(text, text, text)
  to authenticated, service_role;

revoke execute on function public.notifications_watch() from public;
grant  execute on function public.notifications_watch() to authenticated, service_role;

revoke execute on function public.notifications_feed(text, text, text, integer) from public;
grant  execute on function public.notifications_feed(text, text, text, integer)
  to authenticated, service_role;

revoke execute on function public.notifications_summary() from public;
grant  execute on function public.notifications_summary() to authenticated, service_role;

revoke execute on function public.notification_mark_read(text[]) from public;
grant  execute on function public.notification_mark_read(text[]) to authenticated, service_role;

revoke execute on function public.notification_mark_all_read() from public;
grant  execute on function public.notification_mark_all_read() to authenticated, service_role;


-- =============================================================================
-- 7. LE CATALOGUE NE BOUGE PAS
--
-- `notifications.view` existe depuis la migration 007. Le LOT 10 lui donne
-- enfin un contrôle serveur : cinq fonctions l'exigent. En créer une seconde —
-- `notifications.manage`, `notifications.delete` — serait en créer une d'office,
-- ce que DEC-024 interdit tant que la fonctionnalité correspondante n'existe pas.
-- =============================================================================

do $$
declare
  v_total int;
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 153 then
    raise exception 'Catalogue attendu à 153 permissions, obtenu %.', v_total;
  end if;

  if not exists (select 1 from public.permissions p where p.code = 'notifications.view') then
    raise exception 'Capacité `notifications.view` absente du catalogue.';
  end if;
end $$;
