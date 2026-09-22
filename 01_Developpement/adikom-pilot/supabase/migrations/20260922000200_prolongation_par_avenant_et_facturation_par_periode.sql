-- =============================================================================
-- ADIKOM PILOT — 095 · Prolongation par avenant, et facturation par période
-- LOT 23 — DEC-047 · Plan 02 §7.3, §18.2, §20.1 · consigne §4, §5, §7, §8, §11
--
-- LA MIGRATION 094 A POSÉ LE SCHÉMA. CELLE-CI POSE LES ACTES.
--
--   · `open_rental_billing_periods`  — le découpage, écrit une fois
--   · `set_rental_billing_plan`      — définir le régime, ouvrir les périodes
--   · `cancel_rental_billing_period` — abandonner la dernière période
--   · `extend_rental`                — LA PROLONGATION DEVIENT UN AVENANT
--   · `return_rental`, `cancel_rental` — les périodes suivent le cycle
--   · `create_customer_invoice`, `issue_…`, `cancel_…` — la facture connaît sa
--     période, ET AUCUN SECOND SYSTÈME DE FACTURATION N'EST CRÉÉ
--
-- ─────────────────────────────────────────────────────────────────────────────
-- §A. 🟩 A-4 — LA PROLONGATION NE CRÉE PAS UN CONTRAT, ELLE CRÉE UN AVENANT
--
-- « On garde le même contrat et on rajoute des avenants. »
--
-- Le LOT 22 avait REFUSÉ l'avenant de prolongation et nommé le LOT 23
-- (migration 087, `fn_rental_amendment_guard`). Le refus est levé ici, et
-- `extend_rental` — qui déplaçait jusqu'à présent une date sans rien consigner —
-- devient un ACTE CONTRACTUEL : numéroté `AVN-…`, motivé, daté, attribué.
--
-- CE QUE LA PROLONGATION NE FAIT PAS, ET C'EST L'ESSENTIEL (consigne §4) :
--
--   · elle ne crée AUCUN contrat            — le n° `LOC-…` ne bouge pas ;
--   · elle ne réécrit AUCUNE période passée — ni segment clos, ni coût gelé,
--     ni période déjà facturée ;
--   · elle ne touche AUCUN tarif historique — l'ancien reste attaché à la
--     période qu'il a couverte ;
--   · elle n'ÉTEND que ce qui doit l'être   — le segment OUVERT, son occupation,
--     et le temps facturable qui n'existait pas encore.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- §B. 🟩 A-5 / A-7 — LE TARIF À LA PROLONGATION : DEUX CAS, ET RIEN ENTRE EUX
--
--   CAS 1 — LE TARIF EST CONSERVÉ.  C'est le défaut, et c'est le comportement
--   d'aujourd'hui : le segment ouvert s'allonge, `locked_amount` ne bouge pas.
--   `Module 05` §34 évoque un « nouveau montant » sans en définir le calcul, et
--   `Règles location` §24 est formelle : « Le système ne doit pas inventer
--   automatiquement une tarification. » Rien n'est donc résolu de nouveau.
--
--   CAS 2 — UN NOUVEAU TARIF S'APPLIQUE À LA PROLONGATION.  Le segment ouvert
--   est CLOS à la date de fin initiale, et un segment neuf part de là avec le
--   nouveau montant. L'ancien tarif reste sur l'ancienne période ; le nouveau ne
--   vaut que pour le temps ajouté (consigne §5).
--
--   Ce cas exige `rental.pricing.override` — la capacité qui gouverne la
--   dérogation depuis le LOT 22 — ET une raison écrite. AUCUNE CAPACITÉ
--   CONCURRENTE N'EST CRÉÉE (consigne §5 : « Ne crée pas une permission
--   concurrente si la capacité existante couvre déjà correctement l'acte »).
--
--   🟥 ET AUCUN BARÈME DE PÉNALITÉ — A-7 n'est pas tranchée. Le montant est
--   SAISI, jamais calculé : ni « +20 % », ni pourcentage, ni majoration
--   automatique. Le jour où la Direction dira DE QUOI ces 20 à 100 % sont le
--   pourcentage, il n'y aura qu'à calculer le montant qu'on saisit aujourd'hui.
--
--   🟥 `rental.rentals.extend` N'OUVRE PAS `rental.pricing.override`, et
--   réciproquement (A-14). Une prolongation AVEC changement de tarif exige LES
--   DEUX. La recette l'éprouve dans les deux sens.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- §C. 🟩 A-6 — LA FACTURE DE PÉRIODE EST UNE FACTURE CLIENT, ET RIEN D'AUTRE
--
-- Consigne §7 : « Il est interdit de créer un deuxième système de factures
-- clients, une deuxième numérotation, une deuxième logique de règlement, une
-- deuxième trésorerie. »
--
-- AUCUNE FONCTION DE FACTURATION N'EST RÉÉCRITE DEPUIS ZÉRO. `create_…`,
-- `issue_…` et `cancel_customer_invoice` sont REPRISES — à leur dernière
-- version — et reçoivent la connaissance de la période. La numérotation reste
-- `next_number('customer_invoice')`, les lignes restent
-- `customer_invoice_lines`, le règlement reste `record_customer_payment`, la
-- trésorerie reste `fn_treasury_entry_source`. Rien n'est doublé.
--
-- CE QUI CHANGE, ET SEULEMENT CELA :
--
--   · une facture peut désigner une PÉRIODE ; l'unicité porte alors sur elle ;
--   · une facture de période n'exige pas que la location soit « À facturer » —
--     on facture EN COURS DE CONTRAT, c'est tout l'objet du lot ;
--   · une facture de période NE CLÔT PAS la location (Plan 02 §18.2). Le
--     contrat ne devient « Facturée » que lorsqu'il est « À facturer » ET
--     qu'AUCUNE période ne reste à facturer.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- §D. AUCUNE DURÉE N'EST CALCULÉE — DEC-008, consigne §8
--
-- Aucune de ces fonctions ne produit un montant, une quantité ou un nombre de
-- jours. `create_customer_invoice` crée un BROUILLON SANS LIGNE, exactement
-- comme aujourd'hui ; les lignes se saisissent ensuite, prix unitaire repris du
-- segment, QUANTITÉ VIDE. La règle d'arrondi de durée n'est pas arrêtée, et ce
-- lot ne l'invente pas.
-- =============================================================================


-- =============================================================================
-- 1. LA GARDE DES AVENANTS — REPRISE DEPUIS SA DERNIÈRE VERSION (087)
--
-- ⚠ LA LEÇON DE LA MIGRATION 093 : une fonction réécrite se reprend à sa
-- DERNIÈRE version. Celle-ci est celle de la 087, et aucune migration
-- ultérieure ne l'a redéfinie — vérifié avant réécriture.
--
-- TOUT EST REPRIS MOT POUR MOT. Une seule chose change : le refus de
-- `EXTENSION` devient une EXIGENCE DE CAPACITÉ, celle de la prolongation.
-- =============================================================================

create or replace function public.fn_rental_amendment_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.rental_status;
  v_max    int;
begin
  -- Une restauration REMET ce qui a existé : elle n'a pas à rejouer une règle
  -- de cycle de vie (migration 075).
  if public.is_restoring() then return new; end if;

  /* --- 1. UN AVENANT NE SE RÉÉCRIT PAS ----------------------------------- */
  if tg_op = 'UPDATE' then
    raise exception
      'Opération refusée : un avenant est un acte, non une fiche. Il ne se modifie pas. Une erreur se corrige par un avenant suivant, qui dira ce qu''il corrige et pourquoi.'
      using errcode = 'check_violation';
  end if;

  /* --- 2. COHÉRENCE, pour tout acteur ------------------------------------ */
  select r.status into v_status from public.rentals r where r.id = new.rental_id;

  if not found then
    raise exception 'Location introuvable.' using errcode = 'no_data_found';
  end if;

  if v_status in ('CANCELLED', 'CLOSED') then
    raise exception
      'Opération refusée : cette location est % — un contrat clos ou annulé ne reçoit plus d''avenant.',
      case v_status when 'CANCELLED' then 'annulée' else 'clôturée' end
      using errcode = 'check_violation';
  end if;

  -- Le rang suit la chronologie du contrat : 1, puis 2, puis 3.
  select coalesce(max(sequence_no), 0) into v_max
  from public.rental_amendments where rental_id = new.rental_id;

  if new.sequence_no <> v_max + 1 then
    raise exception
      'Opération refusée : l''avenant suivant de ce contrat porte le n° %, et non le n° %.',
      v_max + 1, new.sequence_no
      using errcode = 'check_violation';
  end if;

  /* --- 3. CAPACITÉS — DEC-024, A-14 -------------------------------------- */
  /*
   * TROIS ACTES, TROIS CAPACITÉS, ET AUCUNE N'OUVRE LES AUTRES :
   *
   *   · remplacer le véhicule       → `rental.rentals.swap`
   *   · PROLONGER LE CONTRAT        → `rental.rentals.extend`     🆕 LOT 23
   *   · forcer un tarif             → `rental.pricing.override`
   *
   * 🟥 LE REFUS DU LOT 22 EST LEVÉ ICI, et remplacé par l'exigence qui lui
   * correspond. Le vocabulaire de l'avenant (Plan 02 §7.3) est désormais
   * complet, et chacune de ses natures a SA capacité.
   *
   * Un avenant QUI FORCE AUSSI LE TARIF exige en plus `rental.pricing.override` :
   * ni substituer un véhicule ni prolonger un contrat n'a jamais supposé le
   * droit de s'écarter du barème (A-5, A-14).
   */
  case new.kind
    when 'VEHICLE_CHANGE' then
      perform public.require_capability(
        array['rental.rentals.swap'], 'remplacer le véhicule d''une location'
      );
    when 'EXTENSION' then
      perform public.require_capability(
        array['rental.rentals.extend'], 'prolonger une location par avenant'
      );
    else
      perform public.require_capability(
        array['rental.pricing.override'], 'forcer le tarif d''une location'
      );
  end case;

  if new.rate_override then
    perform public.require_capability(
      array['rental.pricing.override'], 'appliquer un tarif dérogatoire sur un avenant'
    );
  end if;

  return new;
end;
$$;

comment on function public.fn_rental_amendment_guard() is
  'Un avenant ne se réécrit pas, suit le rang de son contrat, n''atteint ni un contrat clos ni un contrat annulé, et exige la capacité de SON acte : swap, extend ou override (DEC-024).';

revoke execute on function public.fn_rental_amendment_guard() from public;


-- --- La policy d'insertion reconnaît la prolongation --------------------------
--
-- Reprise depuis sa dernière version (087), augmentée de la capacité de
-- prolongation. Sans elle, l'avenant de prolongation serait refusé par RLS —
-- silencieusement, comme tout refus de policy.

drop policy if exists rental_amendments_insert on public.rental_amendments;

create policy rental_amendments_insert on public.rental_amendments
  for insert to authenticated
  with check (
    (select public.has_permission('rental.rentals.swap'))
    or (select public.has_permission('rental.pricing.override'))
    or (select public.has_permission('rental.rentals.extend'))
  );


-- =============================================================================
-- 2. LE DÉCOUPAGE, ÉCRIT UNE SEULE FOIS
--
-- POURQUOI UNE FONCTION, ET NON DU CODE RÉPÉTÉ
--
-- Trois chemins ouvrent des périodes : définir le régime, prolonger, et
-- l'écran. Écrire la règle trois fois, c'est la voir diverger à la première
-- correction — et une divergence, ici, produirait un intervalle facturé deux
-- fois ou jamais.
--
-- `SECURITY INVOKER` (défaut) — doctrine D4 : la garde et les policies
-- s'appliquent à l'AUTEUR, pas au propriétaire de la fonction.
--
-- 🟩 A-6, TRANSCRITE SANS INTERPRÉTATION
--
--   MONTHLY        « chaque fin du mois, on établit une facture » : chaque
--                  période s'achève au premier instant du mois suivant, À
--                  MORONI — et la dernière s'achève avec le contrat ;
--   CONTRACT_TERM  « par période définie au contrat » : UNE période, du début
--                  à la fin de ce qui est demandé.
--
-- ⚠ LE MOIS EST COMORIEN, PAS UTC. `date_trunc('month', …)` sur un
-- `timestamptz` travaille en UTC : un contrat commencé le 30 septembre à 22 h
-- UTC est du 1ᵉʳ octobre à Moroni, et sa première facture porterait un jour
-- d'octobre. La conversion est donc explicite, dans les deux sens.
--
-- AUCUNE DURÉE N'EST COMPTÉE (§D). La fonction pose des BORNES ; elle ne
-- calcule ni jours, ni montants.
-- =============================================================================

create or replace function public.open_rental_billing_periods(
  p_rental_id    uuid,
  p_from         timestamptz,
  p_to           timestamptz,
  p_amendment_id uuid default null
)
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r        public.rentals%rowtype;
  v_cursor timestamptz := p_from;
  v_next   timestamptz;
  v_rank   int;
  v_opened int := 0;
begin
  select * into r from public.rentals where id = p_rental_id;

  if not found then
    raise exception 'Location introuvable.' using errcode = 'no_data_found';
  end if;

  -- Une location à durée fixée n'a pas de période facturable : la garde le
  -- refuserait de toute façon, mais un refus explicite vaut mieux qu'un refus
  -- structurel (CLAUDE.md §43).
  if r.rental_type <> 'LONG_TERM' then
    raise exception
      'Opération refusée : la location % n''est pas en longue durée. Définissez d''abord son régime de facturation.',
      r.rental_no
      using errcode = 'check_violation';
  end if;

  if p_from is null or p_to is null or p_to <= p_from then
    raise exception
      'Opération refusée : la fenêtre à découper est vide (% → %).',
      p_from, p_to
      using errcode = 'check_violation';
  end if;

  select coalesce(max(sequence_no), 0) into v_rank
  from public.rental_billing_periods where rental_id = p_rental_id;

  while v_cursor < p_to loop
    if r.billing_cadence = 'MONTHLY' then
      v_next := date_trunc(
        'month',
        (v_cursor at time zone 'Indian/Comoro') + interval '1 month'
      ) at time zone 'Indian/Comoro';

      -- La dernière période s'achève avec le contrat, jamais au-delà.
      if v_next > p_to then v_next := p_to; end if;
    else
      -- 🟩 A-6, « période définie au contrat » : une seule, entière.
      v_next := p_to;
    end if;

    v_rank   := v_rank + 1;
    v_opened := v_opened + 1;

    /*
     * GARDE-FOU. Une borne mal calculée ferait tourner cette boucle sans fin et
     * remplirait la table. Cent périodes, c'est huit ans de mensualités : bien
     * au-delà de tout contrat réel, et bien en deçà d'un dégât.
     */
    if v_opened > 100 then
      raise exception
        'Opération refusée : le découpage produirait plus de cent périodes facturables. Vérifiez les dates du contrat.'
        using errcode = 'program_limit_exceeded';
    end if;

    insert into public.rental_billing_periods (
      rental_id, sequence_no, period, origin, amendment_id, created_by, updated_by
    )
    values (
      p_rental_id, v_rank, tstzrange(v_cursor, v_next, '[)'),
      r.billing_cadence::text::public.rental_billing_origin,
      p_amendment_id, public.current_actor(), public.current_actor()
    );

    v_cursor := v_next;
  end loop;

  return v_opened;
end;
$$;

comment on function public.open_rental_billing_periods(uuid, timestamptz, timestamptz, uuid) is
  'Découpe une fenêtre du contrat en périodes facturables, selon la cadence (A-6). Mensuel : fin de mois COMORIENNE. Contractuel : une période. Ne calcule aucun montant.';

revoke execute on function public.open_rental_billing_periods(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant  execute on function public.open_rental_billing_periods(uuid, timestamptz, timestamptz, uuid) to authenticated, service_role;


-- =============================================================================
-- 3. DÉFINIR LE RÉGIME DE FACTURATION D'UN CONTRAT
--
-- 🟩 A-6 : « facturation mensuelle » ET « par période définie au contrat ». Les
-- deux cases sont cochées ; c'est donc un CHOIX, et il doit être explicite.
--
-- POURQUOI L'ACTE FAIT LES DEUX — le régime ET les périodes
--
-- Décider qu'un contrat se facture chaque fin de mois SANS ouvrir les périodes
-- correspondantes laisserait un régime qui ne gouverne rien, et un écran qui
-- annoncerait une facturation mensuelle sans jamais rien proposer. La décision
-- et sa conséquence sont le même geste.
--
-- CE QUI LE REND IRRÉVERSIBLE, ET POURQUOI C'EST VOULU
--
-- Le régime ne se change plus dès qu'une facture existe sur le contrat. Passer
-- de « mensuel » à « durée fixée » après trois factures mensuelles rendrait le
-- contrat facturable UNE FOIS DE PLUS, pour toute sa durée : le client devrait
-- quatre fois ce qu'il doit une fois. C'est la double facturation que ce lot
-- doit fermer, et elle se ferme ici comme dans les index.
-- =============================================================================

create or replace function public.set_rental_billing_plan(
  p_rental_id uuid,
  p_type      public.rental_type,
  p_cadence   public.rental_billing_cadence default null
)
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare
  l        public.rentals%rowtype;
  v_start  timestamptz;
  v_end    timestamptz;
  v_no     text;
  v_opened int := 0;
begin
  perform public.require_capability(
    array['rental.rentals.billing.plan'],
    'définir le régime de facturation d''une location'
  );

  /*
   * `rental.rentals.view` est exigée NOMMÉMENT : la fonction LIT le contrat
   * avant d'agir, et sous RLS un appelant qui ne peut pas le lire obtiendrait
   * un « introuvable » qui n'expliquerait rien (DEC-024, leçon du LOT 19).
   */
  perform public.require_capability(
    array['rental.rentals.view'], 'consulter la location dont le régime change'
  );

  select * into l from public.rentals where id = p_rental_id for update;

  if not found then
    raise exception 'Location introuvable.' using errcode = 'no_data_found';
  end if;

  if l.status in ('CANCELLED', 'CLOSED', 'INVOICED') then
    raise exception
      'Opération refusée : le régime de facturation d''une location %s ne se change plus.',
      case l.status when 'CANCELLED' then 'annulée'
                    when 'CLOSED'    then 'clôturée'
                    else 'déjà facturée' end
      using errcode = 'check_violation';
  end if;

  -- Une facture existante fige le régime : voir l'en-tête de cette section.
  select i.invoice_no into v_no
  from public.customer_invoices i
  where i.rental_id = l.id and i.status <> 'CANCELLED'
  limit 1;

  if v_no is not null and p_type is distinct from l.rental_type then
    raise exception
      'Opération refusée : la facture % existe déjà sur ce contrat. Changer son régime de facturation permettrait de facturer une seconde fois le même temps.',
      v_no
      using errcode = 'check_violation';
  end if;

  if p_type = 'LONG_TERM' and p_cadence is null then
    raise exception
      'Opération refusée : une location de longue durée porte toujours sa cadence — chaque fin de mois, ou la période définie au contrat (A-6).'
      using errcode = 'check_violation';
  end if;

  if p_type = 'FIXED_TERM' and p_cadence is not null then
    raise exception
      'Opération refusée : une location à durée fixée n''a pas de cadence : elle se facture une fois, à la fin.'
      using errcode = 'check_violation';
  end if;

  if p_type = l.rental_type and p_cadence is not distinct from l.billing_cadence then
    raise exception
      'Opération refusée : ce régime est déjà celui du contrat. Un acte consigne un changement, pas une confirmation.'
      using errcode = 'check_violation';
  end if;

  /* --- Le régime est posé AVANT les périodes ------------------------------ */
  --
  -- La garde des périodes exige `rental_type = LONG_TERM` : l'ordre n'est pas
  -- de confort, il est nécessaire.
  update public.rentals
     set rental_type     = p_type,
         billing_cadence = p_cadence,
         updated_by      = public.current_actor()
   where id = l.id;

  if p_type = 'LONG_TERM' then
    /*
     * LES BORNES VIENNENT DES SEGMENTS, jamais de `planned_period`.
     *
     * Ce sont eux qui portent la durée RÉELLEMENT engagée, tenue à jour par le
     * LOT 22 au fil du cycle : départ avancé, remplacement de véhicule,
     * prolongation, retour. `planned_period` dit ce qui était prévu ; les
     * segments disent ce qui est engagé.
     */
    select min(lower(period)), max(upper(period)) into v_start, v_end
    from public.rental_segments
    where rental_id = l.id and status <> 'CANCELLED';

    if v_start is null then
      raise exception
        'Opération refusée : cette location n''a aucune période d''exploitation. Une facturation par période suppose une chronologie.'
        using errcode = 'no_data_found';
    end if;

    v_opened := public.open_rental_billing_periods(l.id, v_start, v_end, null);
  else
    /*
     * RETOUR À LA DURÉE FIXÉE. Les périodes ouvertes sont ANNULÉES, jamais
     * supprimées : elles ont existé, et l'histoire le garde (CLAUDE.md §22).
     * Une période facturée ferait échouer la garde — et c'est bien ce qu'on
     * veut : on ne défait pas un découpage sur lequel une créance a été
     * reconnue.
     */
    update public.rental_billing_periods
       set status     = 'CANCELLED',
           updated_by = public.current_actor()
     where rental_id = l.id and status = 'PLANNED';
  end if;

  return v_opened;
end;
$$;

comment on function public.set_rental_billing_plan(uuid, public.rental_type, public.rental_billing_cadence) is
  'Définit le régime de facturation d''un contrat (A-6) et ouvre ses périodes facturables. Refusé dès qu''une facture existe : changer de régime permettrait de facturer deux fois le même temps.';

revoke execute on function public.set_rental_billing_plan(uuid, public.rental_type, public.rental_billing_cadence) from public, anon;
grant  execute on function public.set_rental_billing_plan(uuid, public.rental_type, public.rental_billing_cadence) to authenticated, service_role;


-- =============================================================================
-- 4. ABANDONNER LA DERNIÈRE PÉRIODE
--
-- POURQUOI LA DERNIÈRE, ET ELLE SEULE
--
-- Annuler une période du milieu laisserait un TROU : un intervalle du contrat
-- que plus aucune période ne couvrirait, et que personne ne facturerait jamais.
-- La contiguïté qu'impose la garde à l'ouverture serait démentie par la sortie.
--
-- Cet acte existe pour un cas précis : une période ouverte par erreur, qu'aucune
-- facture ne couvre encore. Une période FACTURÉE ne s'annule pas — la garde le
-- refuse, et nomme la facture.
-- =============================================================================

create or replace function public.cancel_rental_billing_period(p_period_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  p      public.rental_billing_periods%rowtype;
  v_last int;
begin
  perform public.require_capability(
    array['rental.rentals.billing.plan'], 'annuler une période facturable'
  );
  perform public.require_capability(
    array['rental.rentals.view'], 'consulter la location concernée'
  );

  select * into p from public.rental_billing_periods where id = p_period_id for update;

  if not found then
    raise exception
      'Période facturable introuvable, ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if p.status = 'CANCELLED' then
    raise exception 'Opération refusée : cette période est déjà annulée.'
      using errcode = 'check_violation';
  end if;

  select max(sequence_no) into v_last
  from public.rental_billing_periods
  where rental_id = p.rental_id and status <> 'CANCELLED';

  if p.sequence_no <> v_last then
    raise exception
      'Opération refusée : seule la dernière période facturable s''annule. Annuler la n° % laisserait un intervalle du contrat que personne ne facturerait.',
      p.sequence_no
      using errcode = 'check_violation';
  end if;

  update public.rental_billing_periods
     set status = 'CANCELLED', updated_by = public.current_actor()
   where id = p.id;
end;
$$;

comment on function public.cancel_rental_billing_period(uuid) is
  'Annule la DERNIÈRE période facturable d''un contrat. Refusée sur une période facturée, et sur toute autre que la dernière — un trou ne se facture jamais.';

revoke execute on function public.cancel_rental_billing_period(uuid) from public, anon;
grant  execute on function public.cancel_rental_billing_period(uuid) to authenticated, service_role;


-- =============================================================================
-- 5. LA PROLONGATION — UN AVENANT, ET SES CONSÉQUENCES
--
-- ⚠ REPRISE DEPUIS SA DERNIÈRE VERSION : la migration **089**, et non la 032.
-- La 089 a fait suivre à `extend_rental` LE SEUL SEGMENT OUVERT — sans quoi
-- prolonger un contrat qui a changé de véhicule rallongerait aussi l'engagement
-- du véhicule rendu. Cet acquis est repris mot pour mot.
--
-- ⚠ LA SIGNATURE CHANGE — l'ancienne est SUPPRIMÉE, pas surchargée.
--
-- Une surcharge rendrait `extend_rental(uuid, timestamptz, text)` ambiguë : un
-- appel à trois arguments correspondrait aux deux fonctions, et PostgreSQL
-- refuserait de choisir. L'ancienne est donc retirée d'abord.
--
-- CE QUI DEVIENT OBLIGATOIRE : LE MOTIF.
--
-- Il était facultatif ; il ne l'est plus, parce que la prolongation est
-- désormais un AVENANT — et « un avenant porte toujours son motif » (LOT 22,
-- `rental_amendments.reason not null`). Ce n'est pas un durcissement gratuit :
-- c'est la conséquence de A-4, qui fait de la prolongation un acte contractuel.
-- =============================================================================

drop function if exists public.extend_rental(uuid, timestamptz, text);

create or replace function public.extend_rental(
  p_rental_id   uuid,
  p_new_end     timestamptz,
  p_reason      text,
  p_amount      bigint  default null,
  p_unit        public.pricing_unit default null,
  p_rate_reason text    default null,
  p_notes       text    default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  l          public.rentals%rowtype;
  s          public.rental_segments%rowtype;
  v_override boolean := p_amount is not null;
  v_from     timestamptz;
  v_no       text;
  v_rank     int;
  v_amend    uuid;
  v_segment  uuid;
  v_last     timestamptz;
begin
  perform public.require_capability(array['rental.rentals.extend'], 'prolonger une location');

  /*
   * 🟥 A-14 — LE CHANGEMENT DE TARIF EXIGE SA PROPRE CAPACITÉ.
   *
   * Prolonger n'a jamais supposé le droit de s'écarter du barème. La garde de
   * l'avenant le redemande ; ce refus-ci n'existe que pour arriver plus tôt et
   * plus clairement (§B).
   */
  if v_override then
    perform public.require_capability(
      array['rental.pricing.override'],
      'appliquer un nouveau tarif à partir de la prolongation'
    );

    if p_rate_reason is null or length(btrim(p_rate_reason)) = 0 then
      raise exception
        'Opération refusée : un nouveau tarif porte toujours sa raison. Pourquoi le client ne paie-t-il plus le tarif du contrat ?'
        using errcode = 'check_violation';
    end if;

    if p_amount < 0 then
      raise exception 'Un tarif ne peut pas être négatif.' using errcode = 'check_violation';
    end if;
  elsif p_rate_reason is not null and length(btrim(p_rate_reason)) > 0 then
    -- Une raison sans montant ne motiverait rien (leçon du LOT 22).
    raise exception
      'Opération refusée : une raison de changement de tarif suppose un montant. Sans montant, le tarif du contrat est conservé.'
      using errcode = 'check_violation';
  end if;

  -- 🟩 A-4 : un avenant porte toujours son motif.
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception
      'Opération refusée : une prolongation est un avenant au contrat, et un avenant porte toujours son motif. Pourquoi la location est-elle prolongée ?'
      using errcode = 'check_violation';
  end if;

  select * into l from public.rentals where id = p_rental_id for update;

  if not found then
    raise exception 'Location introuvable.' using errcode = 'no_data_found';
  end if;

  if l.status not in ('IN_PROGRESS', 'EXTENDED') then
    raise exception
      'Opération refusée : seule une location en cours peut être prolongée.'
      using errcode = 'check_violation';
  end if;

  if p_new_end is null or p_new_end <= l.expected_return_at then
    raise exception
      'Opération refusée : la nouvelle date de retour doit être postérieure à la date attendue.'
      using errcode = 'check_violation';
  end if;

  select * into s
  from public.rental_segments
  where rental_id = l.id and status = 'ACTIVE'
  for update;

  if not found then
    raise exception
      'Opération refusée : cette location n''a aucun segment ouvert. Son historique de véhicules est incomplet.'
      using errcode = 'no_data_found';
  end if;

  -- La prolongation part de la fin de l'engagement en cours, et c'est cette
  -- date qui sépare l'ancien tarif du nouveau (§B).
  v_from := upper(s.period);

  if p_new_end <= v_from then
    raise exception
      'Opération refusée : l''engagement en cours court jusqu''au %. La prolongation doit lui être postérieure.',
      to_char(v_from at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI')
      using errcode = 'check_violation';
  end if;

  if v_override and p_amount = s.locked_amount and coalesce(p_unit, s.locked_unit) = s.locked_unit then
    raise exception
      'Opération refusée : ce tarif est déjà celui du contrat. Prolongez sans changer le tarif — il est conservé de lui-même.'
      using errcode = 'check_violation';
  end if;

  /* --- 1. L'AVENANT — 🟩 A-4 ---------------------------------------------- */
  select coalesce(max(sequence_no), 0) + 1 into v_rank
  from public.rental_amendments where rental_id = l.id;

  v_no := public.next_number('rental_amendment');

  insert into public.rental_amendments (
    amendment_no, rental_id, sequence_no, kind, effective_at,
    reason, notes, rate_override, rate_override_reason, created_by
  )
  values (
    v_no, l.id, v_rank, 'EXTENSION', v_from,
    btrim(p_reason), nullif(btrim(coalesce(p_notes, '')), ''),
    v_override, nullif(btrim(coalesce(p_rate_reason, '')), ''),
    public.current_actor()
  )
  returning id into v_amend;

  if not v_override then
    /* --- CAS 1 — LE TARIF EST CONSERVÉ (§B) ------------------------------- */
    --
    -- Le segment ouvert et SON occupation s'allongent. C'est le comportement
    -- de la migration 089, inchangé : un chevauchement lève ici, pas plus tard,
    -- et la contrainte d'exclusion reste le juge.
    update public.vehicle_occupations
       set period = tstzrange(lower(period), p_new_end, '[)')
     where source = 'RENTAL'
       and source_id = l.id
       and rental_segment_id = s.id
       and is_active;

    update public.rental_segments
       set period     = tstzrange(lower(period), p_new_end, '[)'),
           updated_by = public.current_actor()
     where id = s.id;
  else
    /* --- CAS 2 — UN NOUVEAU TARIF POUR LE TEMPS AJOUTÉ (§B) --------------- */
    --
    -- L'ancien segment garde SA période et SON tarif : il est simplement CLOS.
    -- Rien n'est réécrit — consigne §5 : « Ne réécris jamais le tarif d'une
    -- période historique. »
    update public.rental_segments
       set status     = 'ENDED',
           updated_by = public.current_actor()
     where id = s.id;

    update public.vehicle_occupations
       set is_active   = false,
           released_at = now(),
           released_by = public.current_actor()
     where source = 'RENTAL'
       and source_id = l.id
       and rental_segment_id = s.id
       and is_active;

    insert into public.rental_segments (
      rental_id, vehicle_id, sequence_no, amendment_id, period, status,
      locked_amount, locked_unit, locked_rule_id, locked_source, locked_at,
      created_by, updated_by
    )
    values (
      l.id, s.vehicle_id, s.sequence_no + 1, v_amend,
      tstzrange(v_from, p_new_end, '[)'), 'ACTIVE',
      p_amount, coalesce(p_unit, s.locked_unit), null, 'OVERRIDE', now(),
      public.current_actor(), public.current_actor()
    )
    returning id into v_segment;

    insert into public.vehicle_occupations
      (vehicle_id, source, source_id, rental_segment_id, period, reason, created_by)
    values (
      s.vehicle_id, 'RENTAL', l.id, v_segment,
      tstzrange(v_from, p_new_end, '[)'),
      'Location ' || l.rental_no || ' — avenant ' || v_no,
      public.current_actor()
    );
  end if;

  /* --- 2. LE CONTRAT ------------------------------------------------------ */
  update public.rentals
     set expected_return_at = p_new_end,
         status             = 'EXTENDED',
         status_reason      = btrim(p_reason),
         status_changed_at  = now(),
         status_changed_by  = public.current_actor(),
         updated_by         = public.current_actor()
   where id = l.id;

  /* --- 3. LE TEMPS FACTURABLE AJOUTÉ — UNE CONSÉQUENCE, JAMAIS UN ACTE --- */
  /*
   * Même doctrine que le gel du coût au LOT 22 (§6.2) : celui qui prolonge n'a
   * pas à DEMANDER l'ouverture des périodes correspondantes. Ne pas les ouvrir
   * laisserait un intervalle du contrat que personne ne pourrait facturer —
   * un trou dans la créance.
   *
   * LES PÉRIODES DÉJÀ OUVERTES NE SONT PAS TOUCHÉES (consigne §4). Le découpage
   * REPREND là où il s'arrêtait : la première période ajoutée part de la fin de
   * la dernière, fût-elle au milieu d'un mois. Une prolongation ne remanie
   * jamais un découpage déjà posé — et encore moins un découpage déjà facturé.
   */
  if l.rental_type = 'LONG_TERM' then
    select max(upper(period)) into v_last
    from public.rental_billing_periods
    where rental_id = l.id and status <> 'CANCELLED';

    -- Aucune période encore ouverte : le découpage part du début de la
    -- chronologie, exactement comme `set_rental_billing_plan` l'aurait fait.
    if v_last is null then
      select min(lower(period)) into v_last
      from public.rental_segments
      where rental_id = l.id and status <> 'CANCELLED';
    end if;

    if v_last < p_new_end then
      perform public.open_rental_billing_periods(l.id, v_last, p_new_end, v_amend);
    end if;
  end if;

  return v_amend;
end;
$$;

comment on function public.extend_rental(uuid, timestamptz, text, bigint, public.pricing_unit, text, text) is
  'Prolonge une location PAR AVENANT (A-4) : même contrat, même numéro. Seuls le segment ouvert et son occupation s''allongent. Un nouveau tarif ouvre un segment neuf et n''atteint aucune période passée (A-5). Aucun barème de pénalité (A-7).';

revoke execute on function public.extend_rental(uuid, timestamptz, text, bigint, public.pricing_unit, text, text) from public, anon;
grant  execute on function public.extend_rental(uuid, timestamptz, text, bigint, public.pricing_unit, text, text) to authenticated, service_role;


-- =============================================================================
-- 6. LE RETOUR RAMÈNE LE TEMPS FACTURABLE À LA RÉALITÉ
--
-- ⚠ REPRISE DEPUIS SA DERNIÈRE VERSION : la migration **089**. Tout est repris
-- mot pour mot — l'état des lieux, le compteur qui ne recule pas, le segment
-- ouvert, l'occupation, les deux transitions d'état, le véhicule.
--
-- CE QUI S'AJOUTE : LES PÉRIODES FACTURABLES SUIVENT.
--
-- Le contrat devait courir jusqu'au 31 décembre ; le véhicule rentre le 15. Les
-- périodes ouvertes au-delà décriraient un temps qui n'a jamais couru — et
-- quelqu'un les facturerait.
--
--   · une période entièrement postérieure au retour est ANNULÉE ;
--   · la période qui CONTIENT le retour est ramenée à lui.
--
-- 🟥 ET UNE PÉRIODE DÉJÀ FACTURÉE N'EST PAS TOUCHÉE. La garde le refuserait ;
-- la fonction ne le tente même pas, et le `where` le dit. Une facture reconnaît
-- une créance : le retour du véhicule ne la réécrit pas. Le cas ne devrait pas
-- se présenter — on ne facture qu'une période ÉCHUE (migration 094 §7) — mais
-- une fonction du cycle ne s'appuie pas sur « ne devrait pas ».
-- =============================================================================

create or replace function public.return_rental(
  p_rental_id           uuid,
  p_returned_at         timestamptz,
  p_mileage             int     default null,
  p_fuel_level          public.fuel_level default null,
  p_exterior_condition  text    default null,
  p_interior_condition  text    default null,
  p_new_damages         text    default null,
  p_observations        text    default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  l            public.rentals%rowtype;
  v_return     timestamptz := coalesce(p_returned_at, now());
  v_departure  public.rental_inspections%rowtype;
  v_inspection uuid;
  v_segment    uuid;
begin
  perform public.require_capability(
    array['rental.rentals.return'], 'enregistrer le retour d''une location'
  );

  select * into l from public.rentals where id = p_rental_id for update;

  if not found then
    raise exception 'Location introuvable.' using errcode = 'no_data_found';
  end if;

  if l.status not in ('IN_PROGRESS', 'EXTENDED') then
    raise exception
      'Opération refusée : seule une location en cours peut être retournée. État actuel : %.',
      l.status
      using errcode = 'check_violation';
  end if;

  if l.started_at is null then
    raise exception 'Opération refusée : cette location n''est jamais partie.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.rental_inspections where rental_id = l.id and kind = 'RETURN'
  ) then
    raise exception 'Opération refusée : le retour de cette location est déjà enregistré.'
      using errcode = 'unique_violation';
  end if;

  if v_return < l.started_at then
    raise exception 'Opération refusée : le retour ne peut pas précéder le départ.'
      using errcode = 'check_violation';
  end if;

  -- --- Le compteur ne recule pas -------------------------------------------
  select * into v_departure
  from public.rental_inspections
  where rental_id = l.id and kind = 'DEPARTURE';

  if v_departure.mileage is not null
     and p_mileage is not null
     and p_mileage < v_departure.mileage
  then
    raise exception
      'Opération refusée : le kilométrage de retour (%) est inférieur à celui du départ (%).',
      p_mileage, v_departure.mileage
      using errcode = 'check_violation';
  end if;

  -- --- L'état des lieux de retour, d'abord ----------------------------------
  insert into public.rental_inspections (
    rental_id, kind, performed_at, mileage, fuel_level,
    exterior_condition, interior_condition, preexisting_damages, observations,
    created_by
  )
  values (
    l.id, 'RETURN', v_return, p_mileage, p_fuel_level,
    p_exterior_condition, p_interior_condition, p_new_damages, p_observations,
    public.current_actor()
  )
  returning id into v_inspection;

  -- --- Le segment ouvert, son calendrier, et rien d'autre --------------------
  select id into v_segment
  from public.rental_segments
  where rental_id = l.id and status = 'ACTIVE'
  for update;

  update public.vehicle_occupations
     set period      = tstzrange(lower(period),
                                 greatest(v_return, lower(period) + interval '1 second'), '[)'),
         is_active   = false,
         released_at = now(),
         released_by = public.current_actor()
   where source = 'RENTAL'
     and source_id = l.id
     and (rental_segment_id = v_segment or v_segment is null)
     and is_active;

  if v_segment is not null then
    update public.rental_segments
       set period     = tstzrange(lower(period),
                                  greatest(v_return, lower(period) + interval '1 second'), '[)'),
           status     = 'ENDED',
           updated_by = public.current_actor()
     where id = v_segment;
  end if;

  /* --- LE TEMPS FACTURABLE SUIT LE RETOUR — LOT 23 ----------------------- */
  if l.rental_type = 'LONG_TERM' then
    -- Entièrement après le retour : la période n'a jamais couru.
    update public.rental_billing_periods bp
       set status     = 'CANCELLED',
           updated_by = public.current_actor()
     where bp.rental_id = l.id
       and bp.status = 'PLANNED'
       and lower(bp.period) >= v_return
       and not exists (
         select 1 from public.customer_invoices i
         where i.billing_period_id = bp.id and i.status <> 'CANCELLED'
       );

    -- À cheval sur le retour : elle s'arrête là où le véhicule est rentré.
    update public.rental_billing_periods bp
       set period     = tstzrange(lower(bp.period), v_return, '[)'),
           updated_by = public.current_actor()
     where bp.rental_id = l.id
       and bp.status = 'PLANNED'
       and lower(bp.period) < v_return
       and upper(bp.period) > v_return
       and not exists (
         select 1 from public.customer_invoices i
         where i.billing_period_id = bp.id and i.status <> 'CANCELLED'
       );
  end if;

  -- --- La location est rentrée, et attend son contrôle -----------------------
  update public.rentals
     set returned_at       = v_return,
         status            = 'RETURNED',
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = l.id;

  update public.rentals
     set status            = 'TO_CONTROL',
         status_changed_at = now(),
         status_changed_by = public.current_actor()
   where id = l.id;

  -- --- Le véhicule quitte « En location » ------------------------------------
  update public.vehicles
     set status            = 'AVAILABLE',
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = l.vehicle_id
     and status = 'RENTED';

  return v_inspection;
end;
$$;

comment on function public.return_rental(uuid, timestamptz, int, public.fuel_level, text, text, text, text) is
  'Enregistre le retour : état des lieux, dates, calendrier, véhicule, clôture du segment ouvert ET ramène les périodes facturables non facturées à la date réelle (LOT 23). Ne valorise aucun écart (DEC-025 §i).';


-- =============================================================================
-- 7. L'ANNULATION ANNULE AUSSI LE TEMPS FACTURABLE
--
-- ⚠ REPRISE DEPUIS SA DERNIÈRE VERSION : la migration **089**.
--
-- Une location s'annule AVANT son départ. Ses périodes facturables n'ont donc
-- jamais couru : elles sont ANNULÉES, jamais supprimées (CLAUDE.md §22).
-- =============================================================================

create or replace function public.cancel_rental(
  p_rental_id uuid,
  p_reason    text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  l public.rentals%rowtype;
begin
  perform public.require_capability(array['rental.rentals.cancel'], 'annuler une location');

  select * into l from public.rentals where id = p_rental_id for update;

  if not found then
    raise exception 'Location introuvable.' using errcode = 'no_data_found';
  end if;

  if l.status not in ('PREPARING', 'CONFIRMED') then
    raise exception
      'Opération refusée : une location déjà partie ne s''annule pas, elle se termine par un retour.'
      using errcode = 'check_violation';
  end if;

  -- L'occupation est LIBÉRÉE, pas effacée : la trace de ce qui avait été engagé
  -- demeure (Règles location §55, CLAUDE.md §22). Toutes les occupations de la
  -- location sont visées — un contrat annulé n'engage plus aucun véhicule.
  update public.vehicle_occupations
     set is_active   = false,
         released_at = now(),
         released_by = public.current_actor()
   where source = 'RENTAL'
     and source_id = l.id
     and is_active;

  update public.rental_segments
     set status     = 'CANCELLED',
         updated_by = public.current_actor()
   where rental_id = l.id
     and status = 'ACTIVE';

  -- LOT 23 : le temps facturable d'un contrat annulé n'existe plus.
  update public.rental_billing_periods
     set status     = 'CANCELLED',
         updated_by = public.current_actor()
   where rental_id = l.id
     and status = 'PLANNED';

  update public.rentals
     set status            = 'CANCELLED',
         status_reason     = p_reason,
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = l.id;
end;
$$;

comment on function public.cancel_rental(uuid, text) is
  'Annule une location avant son départ, libère ses occupations, ANNULE son segment ouvert (LOT 22) et ses périodes facturables (LOT 23).';


-- =============================================================================
-- 8. LA COHÉRENCE DE LA FACTURE — LA CONDITION DE LIVRAISON
--
-- ⚠ REPRISE DEPUIS LA VERSION DE LA MIGRATION 094, dans ce même lot. Tout est
-- repris : la levée d'état pendant une restauration (acquis de la 075),
-- l'étanchéité des deux régimes, l'identité du client, l'exigence d'une période
-- échue.
--
-- CE QUI S'AJOUTE : ON NE FACTURE PAS UN CONTRAT QUI N'EST JAMAIS PARTI.
--
-- Le régime « durée fixée » l'exigeait déjà, indirectement : « À facturer » ne
-- s'atteint qu'après le départ, le retour et le contrôle. Le régime « longue
-- durée » facture EN COURS DE CONTRAT, et cette garantie-là disparaîtrait.
--
-- Ce n'est pas théorique : un contrat encore « En préparation » dont la date de
-- début est passée porterait des périodes échues, donc facturables. Il serait
-- alors impossible de l'annuler — `cancel_rental` buterait sur une période
-- couverte par une facture — et la garantie « une location non partie s'annule »
-- serait perdue. Une impasse n'est pas une garantie (DEC-027 §e).
--
-- Les six états retenus sont exactement ceux où `rentals_started_when_running`
-- garantit `started_at is not null` — et qui ne sont ni annulés ni clôturés.
-- =============================================================================

create or replace function public.fn_customer_invoice_coherence()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status public.rental_status;
  v_client uuid;
  v_no     text;
  v_type   public.rental_type;
  p        public.rental_billing_periods%rowtype;
begin
  if new.rental_id is null then
    -- Une facture de services ne vise ni location ni période. La contrainte
    -- `customer_invoices_period_names_rental` garantit qu'elle n'en vise pas
    -- non plus une par la bande.
    return new;
  end if;

  -- Le dossier ne se revérifie que s'il change : rejouer ce contrôle à chaque
  -- changement de statut imposerait `rental.rentals.view` à celui qui annule,
  -- c'est-à-dire ferait dépendre un acte d'une capacité qui ne le concerne pas
  -- (DEC-024). L'émission et l'annulation l'exigent, elles, nommément.
  if tg_op = 'UPDATE'
     and new.rental_id is not distinct from old.rental_id
     and new.billing_period_id is not distinct from old.billing_period_id then
    return new;
  end if;

  select r.status, r.client_id, r.rental_no, r.rental_type
    into v_status, v_client, v_no, v_type
  from public.rentals r
  where r.id = new.rental_id;

  -- Introuvable ou invisible : même réponse, afin de ne rien apprendre à qui
  -- n'a pas le droit de savoir (DEC-017).
  if v_status is null then
    raise exception
      'La location visée est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if new.billing_period_id is null then
    /* ---------- RÉGIME « DURÉE FIXÉE » — LE LOT 5, INCHANGÉ ---------------- */
    if v_type = 'LONG_TERM' and not public.is_restoring() then
      raise exception
        'Opération refusée : la location % est en longue durée — elle se facture PAR PÉRIODE. Une facture couvrant tout le contrat s''ajouterait à ses factures de période, et le client devrait deux fois la même chose.',
        v_no
        using errcode = 'check_violation';
    end if;

    if v_status <> 'TO_INVOICE' and not public.is_restoring() then
      raise exception
        'Opération refusée : seule une location « À facturer » se facture. La location % est « % » (Workflow 07 §5).',
        v_no, v_status
        using errcode = 'check_violation';
    end if;
  else
    /* ---------- RÉGIME « LONGUE DURÉE » — 🟩 A-6 --------------------------- */
    select * into p
    from public.rental_billing_periods
    where id = new.billing_period_id;

    if not found then
      raise exception
        'La période facturable visée est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;

    if p.rental_id is distinct from new.rental_id then
      raise exception
        'Opération refusée : cette période facturable appartient à un autre contrat. Une facture ne couvre pas le temps d''une autre location.'
        using errcode = 'check_violation';
    end if;

    if not public.is_restoring() then
      if v_type <> 'LONG_TERM' then
        raise exception
          'Opération refusée : la location % n''est pas en longue durée. Ses périodes facturables ne gouvernent rien.',
          v_no
          using errcode = 'check_violation';
      end if;

      if p.status = 'CANCELLED' then
        raise exception
          'Opération refusée : cette période facturable est annulée. Elle ne sera jamais facturée.'
          using errcode = 'check_violation';
      end if;

      /*
       * LA LOCATION EST PARTIE, ET ELLE N'EST NI ANNULÉE NI CLÔTURÉE.
       *
       * Les six états où le véhicule est sorti — `rentals_started_when_running`
       * l'y garantit — et où le dossier vit encore.
       */
      if v_status not in ('IN_PROGRESS', 'EXTENDED', 'RETURNED', 'TO_CONTROL', 'TO_INVOICE', 'INVOICED') then
        raise exception
          'Opération refusée : la location % est « % ». Une période ne se facture qu''une fois le véhicule remis au client, et tant que le dossier n''est ni annulé ni clôturé.',
          v_no, v_status
          using errcode = 'check_violation';
      end if;

      /*
       * 🟩 « CHAQUE FIN DU MOIS. » Une période encore en cours ne se facture
       * pas : on facturerait un temps qui n'a pas couru, et le retour anticipé
       * du véhicule rendrait la facture fausse sans qu'on puisse la corriger —
       * une facture émise ne se recalcule jamais (Workflow 07 §8).
       */
      if upper(p.period) > now() then
        raise exception
          'Opération refusée : cette période court jusqu''au %. Elle se facturera lorsqu''elle sera échue.',
          to_char(upper(p.period) at time zone 'Indian/Comoro', 'DD/MM/YYYY HH24:MI')
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if v_client is distinct from new.client_id then
    raise exception
      'Opération refusée : cette location n''est pas celle du client facturé. La chaîne Facture → Location → Client ne se rompt pas (§49).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_customer_invoice_coherence is
  'Une facture de location vise une location « À facturer » du MÊME client (§5, §49) — ou, en longue durée, une PÉRIODE ÉCHUE d''un contrat effectivement parti (A-6). Les deux régimes sont étanches.';


-- =============================================================================
-- 9. PRÉPARER UNE FACTURE — LA MÊME FONCTION, QUI CONNAÎT LA PÉRIODE
--
-- ⚠ REPRISE DEPUIS SA DERNIÈRE VERSION : la migration **051**, seule à l'avoir
-- définie. Les quatre exigences de capacité, le refus du client absent, la date
-- obligatoire, l'échéance cohérente, le client inactif accepté (DEC-027 §i) :
-- tout est repris mot pour mot.
--
-- ⚠ LA SIGNATURE CHANGE — l'ancienne est SUPPRIMÉE, pas surchargée, pour la
-- même raison qu'`extend_rental` (§5).
--
-- CE QUI CHANGE : LE CONTRÔLE ANTICIPÉ DE DOUBLON SUIT LES DEUX RÉGIMES.
--
-- Il portait sur `rental_id` seul — ce qui interdirait toute facturation
-- périodique dès la deuxième période. Il porte désormais sur le RÉGIME :
--
--   sans période  → une seule facture par location, comme depuis le LOT 5 ;
--   avec période  → une seule facture par PÉRIODE.
--
-- Les deux index partiels de la migration 094 restent l'autorité, y compris
-- pour deux saisies simultanées que ce contrôle ne verrait pas (DEC-028).
-- =============================================================================

drop function if exists public.create_customer_invoice(uuid, date, date, uuid, text);

create or replace function public.create_customer_invoice(
  p_client_id         uuid,
  p_invoice_date      date,
  p_due_date          date default null,
  p_rental_id         uuid default null,
  p_notes             text default null,
  p_billing_period_id uuid default null
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
    array['billing.customer_invoices.create'], 'préparer une facture client'
  );
  perform public.require_capability(
    array['billing.customer_invoices.view'], 'consulter la facture préparée'
  );
  -- §6 : la facture est LIÉE au client enregistré. On ne facture pas un tiers
  -- qu'on n'a pas le droit de consulter.
  perform public.require_capability(
    array['parties.clients.view'], 'consulter le client facturé'
  );

  if p_client_id is null then
    raise exception 'Une facture client se rattache obligatoirement à un client (§6).'
      using errcode = 'check_violation';
  end if;

  if p_invoice_date is null then
    raise exception 'La date de la facture est obligatoire (§20).'
      using errcode = 'check_violation';
  end if;

  if p_due_date is not null and p_due_date < p_invoice_date then
    raise exception 'L''échéance ne peut pas précéder la date de la facture (§21).'
      using errcode = 'check_violation';
  end if;

  -- Une facture de période nomme toujours sa location : sans elle, la chaîne
  -- Facture → Location → Client ne s'établirait pas.
  if p_billing_period_id is not null and p_rental_id is null then
    raise exception
      'Opération refusée : une facture de période désigne toujours la location qu''elle facture.'
      using errcode = 'check_violation';
  end if;

  if p_rental_id is not null then
    perform public.require_capability(
      array['rental.rentals.view'], 'consulter la location facturée'
    );
  end if;

  /*
   * Le client n'est PAS exigé actif.
   *
   * Une prestation réalisée pour un client devenu inactif reste une créance
   * réelle. Refuser de la facturer ferait disparaître du système une somme due
   * qui existe hors de lui — même raisonnement que pour le fournisseur inactif
   * (DEC-027 §i).
   */
  if not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception
      'Le client désigné est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  /*
   * Contrôles anticipés, pour des messages compréhensibles (CLAUDE.md §43). Les
   * index uniques partiels font autorité, y compris pour un appel qui ne
   * passerait pas par ici et pour deux saisies simultanées.
   */
  if p_billing_period_id is null then
    if p_rental_id is not null and exists (
      select 1 from public.customer_invoices i
      where i.rental_id = p_rental_id
        and i.billing_period_id is null
        and i.status <> 'CANCELLED'
    ) then
      raise exception
        'Opération refusée : cette location porte déjà une facture. Une prestation ne se facture pas deux fois.'
        using errcode = 'unique_violation';
    end if;
  else
    select i.invoice_no into v_no
    from public.customer_invoices i
    where i.billing_period_id = p_billing_period_id and i.status <> 'CANCELLED'
    limit 1;

    if v_no is not null then
      raise exception
        'Opération refusée : cette période est déjà couverte par la facture %. Une période ne se facture pas deux fois.',
        v_no
        using errcode = 'unique_violation';
    end if;
  end if;

  v_no := public.next_number('customer_invoice');

  insert into public.customer_invoices
    (invoice_no, client_id, rental_id, billing_period_id, invoice_date, due_date, notes,
     created_by, updated_by)
  values
    (v_no, p_client_id, p_rental_id, p_billing_period_id, p_invoice_date, p_due_date,
     nullif(btrim(coalesce(p_notes, '')), ''),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.create_customer_invoice is
  'Prépare une facture client en brouillon (§25) — d''une location à durée fixée, d''une PÉRIODE FACTURABLE (A-6), ou de services. Ne génère aucun montant : le total viendra des lignes saisies.';

revoke execute on function public.create_customer_invoice(uuid, date, date, uuid, text, uuid) from public, anon;
grant  execute on function public.create_customer_invoice(uuid, date, date, uuid, text, uuid)
  to authenticated, service_role;


-- =============================================================================
-- 10. ÉMETTRE — ET UNE FACTURE DE PÉRIODE NE CLÔT PAS LA LOCATION
--
-- ⚠ REPRISE DEPUIS SA DERNIÈRE VERSION : la migration **051**.
--
-- Plan 02 §18.2 : « Une facture de période NE CLÔT PAS la location. »
--
-- Le contrat ne devient « Facturée » que lorsque les deux conditions sont
-- réunies : il est « À facturer » — donc rendu et contrôlé — ET il ne reste
-- AUCUNE période non couverte. C'est la seule lecture vraie de « Facturée » :
-- tout ce qui devait être facturé l'a été.
--
-- Sans cela, une longue durée resterait « À facturer » pour toujours et ne
-- pourrait jamais être clôturée — `close_rental` exige « Facturée ». Une
-- impasse n'est pas une garantie (DEC-027 §e).
-- =============================================================================

create or replace function public.issue_customer_invoice(
  p_invoice_id uuid,
  p_reason     text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  f          public.customer_invoices%rowtype;
  v_subtotal bigint;
  v_discount bigint;
  v_rstatus  public.rental_status;
  v_restant  int;
begin
  perform public.require_capability(
    array['billing.customer_invoices.issue'], 'émettre une facture client'
  );
  perform public.require_capability(
    array['billing.customer_invoices.view'], 'consulter la facture à émettre'
  );

  select * into f from public.customer_invoices where id = p_invoice_id for update;

  if not found then
    raise exception 'Facture client introuvable.' using errcode = 'no_data_found';
  end if;

  if f.status <> 'DRAFT' then
    raise exception
      'Opération refusée : seule une facture en brouillon peut être émise (§25, §26).'
      using errcode = 'check_violation';
  end if;

  -- Contrôles anticipés, pour des messages compréhensibles. Le déclencheur les
  -- refait : c'est lui qui fait autorité, y compris hors de cette fonction.
  v_subtotal := public.customer_invoice_subtotal(f.id);
  v_discount := public.customer_invoice_discount(f.id);

  if v_subtotal <= 0 then
    raise exception
      'Opération refusée : cette facture ne porte aucune ligne facturable. Un total est nécessaire à son émission (§22, §60).'
      using errcode = 'check_violation';
  end if;

  if v_discount > v_subtotal then
    raise exception
      'Opération refusée : les réductions (% KMF) dépassent le sous-total (% KMF). Un avoir relève de règles qu''ADIKOM n''a pas arrêtées (§44).',
      v_discount, v_subtotal
      using errcode = 'check_violation';
  end if;

  if f.rental_id is not null then
    perform public.require_capability(
      array['rental.rentals.view'], 'consulter la location que cette facture engage'
    );

    select r.status into v_rstatus from public.rentals r where r.id = f.rental_id;

    if v_rstatus is null then
      raise exception
        'La location de cette facture est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;

    -- Régime « durée fixée » : inchangé depuis le LOT 5.
    if f.billing_period_id is null and v_rstatus <> 'TO_INVOICE' then
      raise exception
        'Opération refusée : cette location n''est plus « À facturer » (elle est « % »).', v_rstatus
        using errcode = 'check_violation';
    end if;
  end if;

  update public.customer_invoices
     set status            = 'ISSUED',
         issued_at         = now(),
         issued_by         = public.current_actor(),
         status_reason     = nullif(btrim(coalesce(p_reason, '')), ''),
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = f.id;

  if f.rental_id is not null then
    if f.billing_period_id is null then
      -- Régime « durée fixée » : la location devient « Facturée ».
      update public.rentals
         set status            = 'INVOICED',
             status_reason     = 'Facture ' || f.invoice_no,
             status_changed_at = now(),
             status_changed_by = public.current_actor(),
             updated_by        = public.current_actor()
       where id = f.rental_id
         and status = 'TO_INVOICE';
    else
      /*
       * 🟩 A-6 — RÉGIME « LONGUE DURÉE ».
       *
       * La facture de période NE CLÔT PAS le contrat. Elle ne le fait basculer
       * que s'il est déjà « À facturer » ET qu'aucune période ne reste
       * découverte : c'est alors, et alors seulement, que « Facturée » est vrai.
       */
      select count(*) into v_restant
      from public.rental_billing_periods bp
      where bp.rental_id = f.rental_id
        and bp.status <> 'CANCELLED'
        and not exists (
          select 1 from public.customer_invoices i
          where i.billing_period_id = bp.id and i.status <> 'CANCELLED'
        );

      if v_rstatus = 'TO_INVOICE' and v_restant = 0 then
        update public.rentals
           set status            = 'INVOICED',
               status_reason     = 'Toutes les périodes facturées — dernière : ' || f.invoice_no,
               status_changed_at = now(),
               status_changed_by = public.current_actor(),
               updated_by        = public.current_actor()
         where id = f.rental_id
           and status = 'TO_INVOICE';
      end if;
    end if;
  end if;
end;
$$;

comment on function public.issue_customer_invoice is
  'Émet la facture : la créance est reconnue, ses lignes sont figées (§26). Une facture de période ne clôt PAS la location : le contrat ne devient « Facturée » que lorsqu''aucune période ne reste découverte (Plan 02 §18.2).';


-- =============================================================================
-- 11. ANNULER — ET RENDRE LA PÉRIODE À NOUVEAU FACTURABLE
--
-- ⚠ REPRISE DEPUIS SA DERNIÈRE VERSION : la migration **051**.
--
-- La période redevient facturable du SEUL FAIT de l'annulation : l'index
-- `customer_invoices_one_per_period_idx` ignore les factures annulées, et aucune
-- colonne n'est à remettre à jour (migration 094 §4). C'est la raison pour
-- laquelle le lien vit sur la facture.
--
-- Ce qui doit, en revanche, être rendu : l'état du CONTRAT. S'il était
-- « Facturée » parce que toutes ses périodes l'étaient, il ne l'est plus.
-- =============================================================================

create or replace function public.cancel_customer_invoice(
  p_invoice_id uuid,
  p_reason     text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  f         public.customer_invoices%rowtype;
  v_rstatus public.rental_status;
begin
  perform public.require_capability(
    array['billing.customer_invoices.cancel'], 'annuler une facture client'
  );
  perform public.require_capability(
    array['billing.customer_invoices.view'], 'consulter la facture à annuler'
  );

  select * into f from public.customer_invoices where id = p_invoice_id for update;

  if not found then
    raise exception 'Facture client introuvable.' using errcode = 'no_data_found';
  end if;

  if f.status = 'CANCELLED' then
    raise exception
      'Opération refusée : cette facture est déjà annulée.'
      using errcode = 'check_violation';
  end if;

  if f.rental_id is not null then
    perform public.require_capability(
      array['rental.rentals.view'], 'consulter la location que cette facture engage'
    );

    select r.status into v_rstatus from public.rentals r where r.id = f.rental_id;

    if v_rstatus is null then
      raise exception
        'La location de cette facture est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;

    if v_rstatus = 'CLOSED' then
      raise exception
        'Opération refusée : la location de cette facture est clôturée. Une clôture d''exploitation ne se défait pas par l''annulation d''une facture.'
        using errcode = 'check_violation';
    end if;
  end if;

  update public.customer_invoices
     set status            = 'CANCELLED',
         cancelled_at      = now(),
         cancelled_by      = public.current_actor(),
         status_reason     = nullif(btrim(coalesce(p_reason, '')), ''),
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = f.id;

  -- La location retourne à « À facturer » : elle attend de nouveau sa facture,
  -- qu'elle fût unique (durée fixée) ou celle d'une période (longue durée).
  if f.rental_id is not null and v_rstatus = 'INVOICED' then
    update public.rentals
       set status            = 'TO_INVOICE',
           status_reason     = 'Facture ' || f.invoice_no || ' annulée',
           status_changed_at = now(),
           status_changed_by = public.current_actor(),
           updated_by        = public.current_actor()
     where id = f.rental_id
       and status = 'INVOICED';
  end if;
end;
$$;

comment on function public.cancel_customer_invoice is
  'Annule une facture sans l''effacer (§46) et rend la location à « À facturer ». La période redevient facturable du seul fait de l''annulation. Refusée si la location est clôturée.';


-- =============================================================================
-- 12. CONTRÔLES
-- =============================================================================

do $$
declare
  v_def   text;
  v_name  text;
begin
  /* --- 1. LES ACTES DU LOT SONT `SECURITY INVOKER` — doctrine D4 --------- */
  foreach v_name in array array[
    'public.open_rental_billing_periods(uuid, timestamptz, timestamptz, uuid)',
    'public.set_rental_billing_plan(uuid, public.rental_type, public.rental_billing_cadence)',
    'public.cancel_rental_billing_period(uuid)',
    'public.extend_rental(uuid, timestamptz, text, bigint, public.pricing_unit, text, text)',
    'public.create_customer_invoice(uuid, date, date, uuid, text, uuid)'
  ] loop
    if (select prosecdef from pg_proc where oid = v_name::regprocedure) then
      raise exception
        '« % » est SECURITY DEFINER : un acte métier s''exécute avec les droits de son auteur (doctrine D4).',
        v_name;
    end if;
  end loop;

  /* --- 2. L'ANCIENNE SIGNATURE D'`extend_rental` A DISPARU --------------- */
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'extend_rental'
      and pg_get_function_identity_arguments(p.oid) = 'uuid, timestamp with time zone, text'
  ) then
    raise exception
      'Deux `extend_rental` coexistent : un appel à trois arguments deviendrait ambigu.';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_customer_invoice'
      and pg_get_function_identity_arguments(p.oid) = 'uuid, date, date, uuid, text'
  ) then
    raise exception
      'Deux `create_customer_invoice` coexistent : un appel à cinq arguments deviendrait ambigu.';
  end if;

  /* --- 3. LA PROLONGATION EST UN AVENANT -------------------------------- */
  select pg_get_functiondef(
    'public.extend_rental(uuid, timestamptz, text, bigint, public.pricing_unit, text, text)'::regprocedure
  ) into v_def;

  if v_def not like '%rental_amendments%' or v_def not like '%EXTENSION%' then
    raise exception
      '`extend_rental` ne consigne pas d''avenant : A-4 exige que le contrat garde son identité ET que l''acte soit consigné.';
  end if;

  -- L'acquis de la migration 089 : SEUL le segment ouvert s'allonge.
  if v_def not like '%rental_segment_id = s.id%' then
    raise exception
      '`extend_rental` a perdu le filtrage par segment (migration 089) : prolonger un contrat qui a changé de véhicule rallongerait l''engagement du véhicule rendu.';
  end if;

  /* --- 4. LA GARDE DES AVENANTS N'A PERDU AUCUN ACTE -------------------- */
  select pg_get_functiondef('public.fn_rental_amendment_guard()'::regprocedure) into v_def;

  foreach v_name in array array[
    'rental.rentals.swap', 'rental.rentals.extend', 'rental.pricing.override'
  ] loop
    if v_def not like '%' || v_name || '%' then
      raise exception 'La garde des avenants a perdu « % ».', v_name;
    end if;
  end loop;

  if v_def not like '%is_restoring%' then
    raise exception 'La garde des avenants a perdu la reprise (migration 075).';
  end if;

  /* --- 5. LA POLICY D'INSERTION DES AVENANTS ---------------------------- */
  select with_check into v_def
  from pg_policies
  where schemaname = 'public' and tablename = 'rental_amendments'
    and policyname = 'rental_amendments_insert';

  if v_def is null or v_def not like '%rental.rentals.extend%'
     or v_def not like '%rental.rentals.swap%'
     or v_def not like '%rental.pricing.override%' then
    raise exception
      'La policy `rental_amendments_insert` ne porte pas les trois actes : l''un d''eux serait refusé en silence.';
  end if;

  /* --- 6. LE RETOUR ET L'ANNULATION SUIVENT LES PÉRIODES ---------------- */
  select pg_get_functiondef(
    'public.return_rental(uuid, timestamptz, int, public.fuel_level, text, text, text, text)'::regprocedure
  ) into v_def;

  if v_def not like '%rental_billing_periods%' then
    raise exception
      '`return_rental` ignore les périodes facturables : un retour anticipé laisserait facturable un temps qui n''a jamais couru.';
  end if;

  -- Les acquis de la 089, revérifiés : une fonction réécrite se reprend à sa
  -- dernière version.
  if v_def not like '%rental_inspections%' or v_def not like '%TO_CONTROL%' then
    raise exception '`return_rental` a perdu un acquis de la migration 089.';
  end if;

  select pg_get_functiondef('public.cancel_rental(uuid, text)'::regprocedure) into v_def;

  if v_def not like '%rental_billing_periods%' or v_def not like '%rental_segments%' then
    raise exception '`cancel_rental` a perdu un acquis : segments (089) ou périodes (LOT 23).';
  end if;

  /* --- 7. LA FACTURE DE PÉRIODE NE CLÔT PAS LA LOCATION ----------------- */
  select pg_get_functiondef('public.issue_customer_invoice(uuid, text)'::regprocedure) into v_def;

  if v_def not like '%billing_period_id%' then
    raise exception '`issue_customer_invoice` ignore les périodes facturables.';
  end if;

  if v_def not like '%v_restant%' then
    raise exception
      '`issue_customer_invoice` ne compte pas les périodes restantes : une longue durée deviendrait « Facturée » dès sa première facture de période.';
  end if;

  /* --- 8. AUCUN BARÈME DE PÉNALITÉ N'A ÉTÉ INTRODUIT — A-7 -------------- */
  select pg_get_functiondef(
    'public.extend_rental(uuid, timestamptz, text, bigint, public.pricing_unit, text, text)'::regprocedure
  ) into v_def;

  if v_def ~* '(penalt|pourcent|percent|\* 1\.[0-9]|/ 100)' then
    raise exception
      'Un barème de pénalité a été introduit dans `extend_rental` : A-7 n''est pas tranchée (CLAUDE.md §55).';
  end if;

  raise notice
    '[OK] 095. La prolongation est un avenant ; la facture connaît sa période ; aucune fonction de facturation n''a été doublée.';
end $$;
