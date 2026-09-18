-- =============================================================================
-- ADIKOM PILOT — 092 · Oublier la règle n'est pas réécrire l'engagement
-- LOT 22 — correction découverte par `demo:clean`
--
-- LE DÉFAUT, ET COMMENT IL S'EST RÉVÉLÉ
--
-- `rental_segments.locked_rule_id` désigne la règle tarifaire qui a produit le
-- montant du segment, avec `on delete set null` — exactement comme
-- `rentals.locked_rule_id` depuis la migration 031. Le montant, lui, est une
-- COPIE : il survit à la disparition de la règle (D13).
--
-- Or `fn_rental_segment_guard` refuse TOUTE modification de `locked_rule_id`.
-- Supprimer une règle tarifaire — ce que seule une opération d'environnement
-- peut faire — déclenchait donc la mise à NULL en cascade… que la garde
-- refusait. Le retrait du jeu de démonstration s'interrompait sur un message
-- parlant d'avenant, à propos d'un tarif.
--
-- Même défaut, même cause, sur `rental_segment_costs.rate_id` : il désigne la
-- version de tarif fournisseur d'où vient le coût gelé, avec `on delete set
-- null`, et `fn_rental_segment_cost_immutable` refuse toute écriture.
--
-- CE QUE LA CORRECTION AUTORISE, ET RIEN DE PLUS
--
--   `locked_rule_id`  non nul  →  NULL     ✔ la règle a disparu
--   `rate_id`         non nul  →  NULL     ✔ la version a disparu
--
-- TOUT LE RESTE DEMEURE REFUSÉ : le montant, l'unité, le véhicule, le rang,
-- l'avenant d'origine, l'horodatage du verrouillage, et la source du tarif. Une
-- valeur nulle ne peut pas non plus redevenir non nulle : on n'oublie qu'une
-- fois, et on ne se souvient pas après coup d'une règle supprimée.
--
-- POURQUOI CE N'EST PAS UN AFFAIBLISSEMENT
--
-- Le lien vers la règle n'est pas l'engagement : l'engagement est le MONTANT, et
-- il ne bouge pas. Perdre le lien fait perdre la traçabilité de l'origine du
-- tarif — ce qui est le prix, assumé, de la suppression d'une règle, et ce que
-- `rentals` accepte déjà depuis le premier jour. Le montant gelé, lui, reste
-- inatteignable : c'est lui qui protège l'historique financier.
-- =============================================================================

create or replace function public.fn_rental_segment_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_max   int;
  v_prev  public.rental_segments%rowtype;
  v_veh   record;
begin
  if public.is_restoring() then return new; end if;

  /* --- 1. UN SEGMENT NE SE RÉÉCRIT PAS — D13 ----------------------------- */
  --
  -- Se modifient : la BORNE HAUTE de la période — un segment se clôt, une
  -- prolongation l'allonge, un retour le ramène à la réalité — et le STATUT.
  -- Rien d'autre. Le tarif verrouillé, le véhicule, le rang et l'avenant
  -- d'origine sont la trace de l'engagement, et une trace ne se corrige pas.
  if tg_op = 'UPDATE' then
    if new.rental_id     is distinct from old.rental_id
    or new.vehicle_id    is distinct from old.vehicle_id
    or new.sequence_no   is distinct from old.sequence_no
    or new.amendment_id  is distinct from old.amendment_id
    or new.locked_amount is distinct from old.locked_amount
    or new.locked_unit   is distinct from old.locked_unit
    or new.locked_source is distinct from old.locked_source
    or new.locked_at     is distinct from old.locked_at
    then
      raise exception
        'Opération refusée : le véhicule, le rang, le tarif verrouillé et l''avenant d''origine d''un segment ne se réécrivent pas. Ouvrez un avenant : il dira ce qui change, à partir de quand et pourquoi.'
        using errcode = 'check_violation';
    end if;

    /*
     * `locked_rule_id` — OUBLIER LA RÈGLE, MAIS JAMAIS LA REMPLACER.
     *
     * La seule évolution admise est la mise à NULL, conséquence de
     * `on delete set null` lorsqu'une règle tarifaire est supprimée par une
     * opération d'environnement. Le MONTANT, lui, ne bouge pas : c'est une copie,
     * et c'est elle qui porte l'engagement (D13). Rattacher un segment à une
     * AUTRE règle, en revanche, réécrirait l'origine de son prix.
     */
    if new.locked_rule_id is distinct from old.locked_rule_id
       and not (new.locked_rule_id is null and old.locked_rule_id is not null)
    then
      raise exception
        'Opération refusée : un segment ne se rattache pas après coup à une autre règle tarifaire. Son montant est une copie, figée à l''ouverture de la période.'
        using errcode = 'check_violation';
    end if;

    /*
     * LE DÉBUT D'UN SEGMENT NE SE DÉPLACE PAS — sauf UN cas, et il est borné.
     *
     * Le DÉPART RÉEL peut précéder la période prévue : `start_rental` avance
     * alors la borne basse de l'occupation depuis la migration 035, faute de
     * quoi le calendrier laisserait libre un créneau pendant lequel le véhicule
     * est dehors. Le segment initial suit le même mouvement, et lui seul —
     * déplacer le début d'un segment issu d'un avenant romprait la contiguïté
     * avec celui qui le précède.
     */
    if lower(new.period) is distinct from lower(old.period) then
      if old.sequence_no <> 1 or lower(new.period) >= lower(old.period) then
        raise exception
          'Opération refusée : le début d''un segment ne se déplace pas. Il est l''instant où le véhicule a été engagé sur ce contrat.'
          using errcode = 'check_violation';
      end if;

      perform public.require_capability(
        array['rental.rentals.checkout'],
        'avancer le début d''un engagement au départ réel'
      );
    end if;
  end if;

  /* --- 2. COHÉRENCE, pour tout acteur ------------------------------------ */
  if tg_op = 'INSERT' then
    select v.status, v.brand || ' ' || v.model as label into v_veh
    from public.vehicles v where v.id = new.vehicle_id;

    if not found then
      raise exception 'Véhicule introuvable.' using errcode = 'no_data_found';
    end if;

    /*
     * UN VÉHICULE RETIRÉ NE S'ENGAGE PLUS — mais son PASSÉ reste inscriptible.
     *
     * Le refus porte sur un engagement OUVERT qui court encore. Un segment
     * historique désignant un véhicule retiré depuis est un FAIT : il a servi,
     * et la reprise des locations existantes (migration 088) doit pouvoir
     * l'écrire. Refuser sur le seul statut effacerait l'histoire des véhicules
     * sortis du parc — l'inverse de CLAUDE.md §22.
     */
    if v_veh.status = 'RETIRED'
       and new.status = 'ACTIVE'
       and upper(new.period) > now() then
      raise exception
        'Opération refusée : « % » est retiré du parc. Il ne peut plus être engagé sur une location en cours.',
        v_veh.label
        using errcode = 'check_violation';
    end if;

    -- Le rang suit la chronologie.
    select coalesce(max(sequence_no), 0) into v_max
    from public.rental_segments where rental_id = new.rental_id;

    if new.sequence_no <> v_max + 1 then
      raise exception
        'Opération refusée : le segment suivant de ce contrat porte le n° %, et non le n° %.',
        v_max + 1, new.sequence_no
        using errcode = 'check_violation';
    end if;

    /*
     * AUCUN TROU DANS LA COUVERTURE DU CONTRAT — consigne §7.
     *
     * Le segment suivant part EXACTEMENT là où le précédent s'arrête. La
     * contrainte d'exclusion interdit déjà le recouvrement ; ceci interdit
     * l'inverse — une période pendant laquelle le contrat n'aurait aucun
     * véhicule affecté.
     *
     * Les segments ANNULÉS sont écartés : ils n'ont jamais couru, et celui qui
     * les remplace reprend leur période entière, depuis son début.
     */
    if v_max > 0 then
      select * into v_prev
      from public.rental_segments
      where rental_id = new.rental_id and status <> 'CANCELLED'
      order by sequence_no desc
      limit 1;

      if found and lower(new.period) is distinct from upper(v_prev.period) then
        raise exception
          'Opération refusée : le segment n° % doit commencer exactement où le segment n° % s''achève (%). Un contrat ne reste jamais sans véhicule affecté.',
          new.sequence_no, v_prev.sequence_no,
          to_char(upper(v_prev.period) at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI')
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  /* --- 3. CAPACITÉS ------------------------------------------------------- */
  --
  -- Un segment naît d'un des trois actes qui l'ouvrent : la création du
  -- contrat, le remplacement de véhicule, le changement de tarif.
  if tg_op = 'INSERT' then
    perform public.require_capability(
      array['rental.rentals.create', 'rental.rentals.swap', 'rental.pricing.override'],
      'ouvrir un segment de location'
    );
  else
    /*
     * LA MISE À NULL EN CASCADE N'EST L'ACTE DE PERSONNE.
     *
     * Elle est déclenchée par la suppression d'une règle tarifaire, opération
     * d'environnement où `current_actor()` vaut NULL. `require_capability` y
     * passe déjà sans rien exiger ; l'écrire explicitement évite qu'une session
     * applicative porteuse d'une capacité de cycle soit tenue pour l'auteur d'un
     * oubli qu'elle n'a pas demandé.
     */
    if new.locked_rule_id is null and old.locked_rule_id is not null
       and new.period is not distinct from old.period
       and new.status is not distinct from old.status
    then
      return new;
    end if;

    -- Un segment se clôt, s'allonge ou change d'état au fil du cycle : départ,
    -- prolongation, retour, annulation, remplacement.
    perform public.require_capability(
      array[
        'rental.rentals.create', 'rental.rentals.swap', 'rental.pricing.override',
        'rental.rentals.checkout', 'rental.rentals.extend',
        'rental.rentals.return', 'rental.rentals.cancel'
      ],
      'modifier un segment de location'
    );
  end if;

  return new;
end;
$$;

comment on function public.fn_rental_segment_guard() is
  'Un segment ne réécrit ni son véhicule, ni son tarif verrouillé, ni son début ; il suit le rang du contrat et commence exactement où le précédent s''achève. Seule exception admise : oublier la règle tarifaire supprimée, jamais en changer.';

revoke execute on function public.fn_rental_segment_guard() from public;


-- =============================================================================
-- LE COÛT GELÉ PEUT OUBLIER SA VERSION, SANS CHANGER DE MONTANT
--
-- Même raisonnement, même cause : `rate_id` désigne la version de tarif
-- fournisseur d'où vient le montant, avec `on delete set null`. Retirer une
-- version — opération d'environnement — mettait ce lien à NULL, et
-- l'immuabilité totale le refusait.
--
-- LE MONTANT RESTE INATTEIGNABLE. C'est lui, et lui seul, qui empêche qu'une
-- saisie rétroactive de tarif fournisseur déplace l'historique financier d'une
-- location déjà engagée. Le lien vers la version n'est qu'une traçabilité.
-- =============================================================================

create or replace function public.fn_rental_segment_cost_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Oublier la version supprimée : le montant, l'unité, la devise, le segment,
  -- le fournisseur et la date de résolution restent identiques.
  if new.rate_id is null and old.rate_id is not null
     and new.id            is not distinct from old.id
     and new.segment_id    is not distinct from old.segment_id
     and new.rental_id     is not distinct from old.rental_id
     and new.amount        is not distinct from old.amount
     and new.unit          is not distinct from old.unit
     and new.currency_code is not distinct from old.currency_code
     and new.supplier_id   is not distinct from old.supplier_id
     and new.resolved_on   is not distinct from old.resolved_on
     and new.locked_at     is not distinct from old.locked_at
  then
    return new;
  end if;

  raise exception
    'Opération refusée : le coût gelé d''un segment ne se modifie pas. C''est ce gel qui empêche qu''une saisie rétroactive de tarif fournisseur déplace l''historique financier d''une location déjà engagée.'
    using errcode = 'check_violation';
end;
$$;

comment on function public.fn_rental_segment_cost_immutable() is
  'Refuse toute modification d''un coût gelé, hormis l''oubli de la version de tarif supprimée. Le MONTANT est inatteignable : c''est lui qui protège l''historique financier.';


-- =============================================================================
-- CONTRÔLES — sur la donnée, pas sur l'intention
-- =============================================================================

do $$
declare
  v_seg    uuid;
  v_rental uuid;
  v_rule   uuid;
  v_veh    uuid;
  v_cli    uuid;
  v_amount bigint;
begin
  /*
   * L'ÉPREUVE RÉELLE : supprimer une règle tarifaire à laquelle un segment est
   * rattaché ne doit plus échouer, et ne doit rien changer de son montant.
   *
   * Tout se fait dans une sous-transaction annulée : aucune donnée réelle n'est
   * touchée, et le contrôle éprouve néanmoins le vrai chemin.
   */
  begin
    select s.id, s.rental_id, s.locked_rule_id, s.locked_amount
      into v_seg, v_rental, v_rule, v_amount
    from public.rental_segments s
    where s.locked_rule_id is not null
    limit 1;

    if v_seg is null then
      raise notice
        '[092] Aucun segment rattaché à une règle tarifaire : le contrôle d''oubli ne peut pas être joué sur cette base.';
    else
      delete from public.pricing_rules where id = v_rule;

      if (select locked_rule_id from public.rental_segments where id = v_seg) is not null then
        raise exception 'La règle n''a pas été oubliée par le segment.';
      end if;

      if (select locked_amount from public.rental_segments where id = v_seg) <> v_amount then
        raise exception
          'Le montant verrouillé du segment a bougé alors que seule la règle disparaissait.';
      end if;

      raise notice
        '[092] Oubli éprouvé : règle supprimée, lien nul, montant intact (%).', v_amount;
    end if;

    -- Tout est annulé : la règle tarifaire réelle est intacte.
    raise exception 'ROLLBACK_CONTROLE_092';
  exception
    when others then
      if sqlerrm <> 'ROLLBACK_CONTROLE_092' then
        raise;
      end if;
  end;

  -- La garde refuse toujours ce qui compte : le MONTANT.
  if pg_get_functiondef('public.fn_rental_segment_guard()'::regprocedure)
     not like '%new.locked_amount is distinct from old.locked_amount%' then
    raise exception 'La garde ne protège plus le tarif verrouillé d''un segment.';
  end if;

  if pg_get_functiondef('public.fn_rental_segment_cost_immutable()'::regprocedure)
     not like '%new.amount        is not distinct from old.amount%' then
    raise exception 'Le coût gelé n''est plus protégé contre une modification de montant.';
  end if;

  raise notice
    '[OK] 092. Un segment peut oublier une règle supprimée ; son montant, lui, reste hors d''atteinte.';
end $$;
