-- =============================================================================
-- ADIKOM PILOT — 088 · Reprise des locations existantes en segments
-- LOT 22 — DEC-045 · Plan 02 §19.1 et §19.2
--
-- « La seule migration de données réellement risquée du plan. » (Plan 02 §16.2)
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE
--
-- Pour CHAQUE location existante, créer EXACTEMENT UN segment, puis rattacher
-- ses occupations à ce segment. Après quoi toute location du système — ancienne
-- ou nouvelle — répond à la même question de la même façon : « quel véhicule,
-- sur quelle période, à quel tarif ? »
--
-- MIGRATION DE SCHÉMA ET MIGRATION DE DONNÉES SÉPARÉES — Plan 02 §19.2,
-- garantie n° 1. La 087 pose les tables ; celle-ci remplit. On peut rejouer
-- l'une sans l'autre, et celle-ci est IDEMPOTENTE : elle ne touche que les
-- locations qui n'ont pas encore de segment.
--
-- 🟥 AUCUNE VALEUR N'EST RECALCULÉE — Plan 02 §19.1 et §19.2, garantie n° 4.
--
--   `locked_amount`, `locked_unit`, `locked_rule_id`, `locked_source`,
--   `locked_at` sont COPIÉS depuis `rentals`, tels quels. Une location dont le
--   tarif verrouillé paraît étrange le reste : la migration copie, elle
--   n'arbitre pas.
--
-- D'OÙ VIENT LA PÉRIODE DU SEGMENT
--
-- De l'OCCUPATION de la location, lorsqu'elle existe — c'est-à-dire de
-- l'engagement RÉELLEMENT tenu par le calendrier, celui que `convert`,
-- `start`, `extend` et `return` ont déjà déplacé au fil du cycle. À défaut, de
-- la période prévue, étendue au retour attendu lorsqu'une prolongation l'a
-- dépassée.
--
-- Ce choix n'est pas une interprétation : il fait du segment le reflet exact de
-- ce que la base tenait déjà pour l'engagement de ce contrat. Et il garantit la
-- cohérence du rattachement qui suit — une occupation et son segment portent la
-- même période.
--
-- ⚠ CE QUE CETTE MIGRATION FAIT DE PLUS QUE LE PLAN 02 §19.2, ET POURQUOI
--
-- Le plan écrivait `locked_cost_* = NULL`, « aucun coût n'existait alors ». Ce
-- n'est plus vrai : le LOT 21 a livré des coûts DATÉS, et le déclencheur de gel
-- interroge le résolveur À LA DATE DU SEGMENT — non à celle d'aujourd'hui.
--
-- Le coût gelé d'une location d'août est donc CELUI D'AOÛT : exactement le
-- montant que la carte « Commission de location » affiche déjà sur cette fiche.
-- Rien n'est réinterprété ; ce qui était affiché est désormais PROTÉGÉ d'une
-- saisie rétroactive ultérieure. Pour les véhicules ADIKOM et de partenariat,
-- aucun coût n'existe : aucune ligne n'est écrite, et la commission reste non
-- calculée (P-2, et la question du partenariat, toujours ouvertes).
--
-- RÉVERSIBILITÉ — Plan 02 §19.2, garantie n° 5
--
--   `delete from public.rental_segment_costs;`
--   `update public.vehicle_occupations set rental_segment_id = null;`
--   `delete from public.rental_segments;`
--
-- exécutés avec la CLÉ DE SERVICE (une session applicative se heurterait à
-- `fn_forbid_delete`), rendent la base à son état antérieur. CE QUE CETTE
-- INVERSE NE SAIT PAS DÉFAIRE : rien — aucune donnée existante n'est modifiée
-- par cette migration, hormis `vehicle_occupations.rental_segment_id`, dont la
-- remise à `null` est complète. Les avenants créés APRÈS le lot, eux, ne se
-- défont pas : leur inverse est un avenant.
--
-- SAUVEGARDE PRÉALABLE — Plan 02 §19.2, garantie n° 2. Le mécanisme existe
-- (LOT 18, migration 075) et la procédure du lot l'exécute avant application.
-- =============================================================================

do $$
declare
  r          record;
  v_period   tstzrange;
  v_status   public.rental_segment_status;
  v_segment  uuid;
  v_crees    int := 0;
  v_liees    int := 0;
  v_touchees int;
begin
  for r in
    select l.id, l.rental_no, l.vehicle_id, l.status, l.planned_period,
           l.started_at, l.returned_at, l.expected_return_at,
           l.locked_amount, l.locked_unit, l.locked_rule_id, l.locked_source,
           l.locked_at, l.created_by
    from public.rentals l
    where not exists (
      select 1 from public.rental_segments s where s.rental_id = l.id
    )
    order by l.created_at
  loop
    -- --- 1. LA PÉRIODE : l'engagement réellement tenu par le calendrier ------
    select o.period into v_period
    from public.vehicle_occupations o
    where o.source = 'RENTAL'
      and o.source_id = r.id
      and o.vehicle_id = r.vehicle_id
    order by o.is_active desc, o.created_at
    limit 1;

    if v_period is null or isempty(v_period) then
      v_period := tstzrange(
        lower(r.planned_period),
        greatest(upper(r.planned_period), r.expected_return_at),
        '[)'
      );
    end if;

    -- Une période vide serait refusée par la contrainte : le plancher d'une
    -- seconde reprend celui de `return_rental`.
    if isempty(v_period) then
      v_period := tstzrange(lower(v_period), lower(v_period) + interval '1 second', '[)');
    end if;

    -- --- 2. LE STATUT : ce que la location est, sans l'arbitrer --------------
    --
    -- Un contrat ANNULÉ n'a jamais exécuté son segment : il est ANNULÉ, et non
    -- « terminé ». Le Plan 02 §19.2 proposait ENDED pour tout ce qui n'est pas
    -- en cours ; distinguer les deux est plus fidèle, et c'est la distinction
    -- que le type porte.
    v_status := case
      when r.status = 'CANCELLED' then 'CANCELLED'
      when r.status in ('PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'EXTENDED') then 'ACTIVE'
      else 'ENDED'
    end::public.rental_segment_status;

    -- --- 3. LE SEGMENT : une COPIE, jamais un calcul --------------------------
    insert into public.rental_segments (
      rental_id, vehicle_id, sequence_no, amendment_id, period, status,
      locked_amount, locked_unit, locked_rule_id, locked_source, locked_at,
      created_by, updated_by
    )
    values (
      r.id, r.vehicle_id, 1, null, v_period, v_status,
      r.locked_amount, r.locked_unit, r.locked_rule_id, r.locked_source, r.locked_at,
      r.created_by, r.created_by
    )
    returning id into v_segment;

    v_crees := v_crees + 1;

    -- --- 4. LE RATTACHEMENT DES OCCUPATIONS ----------------------------------
    --
    -- `source = 'RENTAL'` seulement (Plan 02 §19.2) : une occupation de
    -- maintenance ou d'immobilisation ne sert aucun segment, et le rattacher
    -- ferait croire à un engagement de location.
    update public.vehicle_occupations
       set rental_segment_id = v_segment
     where source = 'RENTAL'
       and source_id = r.id
       and rental_segment_id is null;

    get diagnostics v_touchees = row_count;
    v_liees := v_liees + v_touchees;
  end loop;

  raise notice
    '[088] % segment(s) créé(s), % occupation(s) rattachée(s).', v_crees, v_liees;
end $$;


-- =============================================================================
-- RECETTE DE COMPTAGE — Plan 02 §19.2, garantie n° 3
--
-- La migration refuse de s'appliquer si elle a laissé le système incohérent.
-- Un contrôle qui ne s'exécuterait qu'ensuite laisserait la base en l'état.
-- =============================================================================

do $$
declare
  v_rentals   int;
  v_segments  int;
  v_orphelins text[];
  v_doublons  text[];
  v_decalees  text[];
  v_costs     int;
begin
  select count(*) into v_rentals  from public.rentals;
  select count(*) into v_segments from public.rental_segments;

  -- AUCUNE LOCATION SANS SEGMENT.
  select array_agg(l.rental_no) into v_orphelins
  from public.rentals l
  where not exists (select 1 from public.rental_segments s where s.rental_id = l.id);

  if v_orphelins is not null then
    raise exception 'Locations restées sans segment : %', v_orphelins;
  end if;

  -- EXACTEMENT UN SEGMENT PAR LOCATION à l'issue de la reprise : aucun avenant
  -- n'a encore été posé, et la fonction de remplacement n'a pas tourné.
  select array_agg(l.rental_no) into v_doublons
  from public.rentals l
  where (select count(*) from public.rental_segments s where s.rental_id = l.id) <> 1;

  if v_doublons is not null then
    raise exception
      'Locations portant un nombre de segments différent de 1 après reprise : %', v_doublons;
  end if;

  if v_segments <> v_rentals then
    raise exception
      'Le compte ne tombe pas : % locations pour % segments.', v_rentals, v_segments;
  end if;

  -- LE TARIF VERROUILLÉ EST UNE COPIE EXACTE — aucune valeur recalculée.
  select array_agg(l.rental_no) into v_decalees
  from public.rentals l
  join public.rental_segments s on s.rental_id = l.id and s.sequence_no = 1
  where s.locked_amount is distinct from l.locked_amount
     or s.locked_unit   is distinct from l.locked_unit
     or s.locked_rule_id is distinct from l.locked_rule_id
     or s.locked_source is distinct from l.locked_source
     or s.locked_at     is distinct from l.locked_at
     or s.vehicle_id    is distinct from l.vehicle_id;

  if v_decalees is not null then
    raise exception
      'Le segment initial ne reprend pas fidèlement le contrat pour : %', v_decalees;
  end if;

  -- TOUTE OCCUPATION DE LOCATION NOMME SON SEGMENT.
  select array_agg(distinct o.reason) into v_orphelins
  from public.vehicle_occupations o
  where o.source = 'RENTAL' and o.rental_segment_id is null;

  if v_orphelins is not null then
    raise exception 'Occupations de location restées sans segment : %', v_orphelins;
  end if;

  -- Et aucune occupation ne désigne un segment d'un AUTRE véhicule.
  if exists (
    select 1
    from public.vehicle_occupations o
    join public.rental_segments s on s.id = o.rental_segment_id
    where o.vehicle_id <> s.vehicle_id
  ) then
    raise exception
      'Une occupation désigne un segment portant un autre véhicule : le rattachement est faux.';
  end if;

  select count(*) into v_costs from public.rental_segment_costs;

  raise notice
    '[OK] 088. % locations, % segments, coût gelé sur % segment(s) — les autres véhicules n''ont aucun coût connu, et rien n''a été inventé.',
    v_rentals, v_segments, v_costs;
end $$;
