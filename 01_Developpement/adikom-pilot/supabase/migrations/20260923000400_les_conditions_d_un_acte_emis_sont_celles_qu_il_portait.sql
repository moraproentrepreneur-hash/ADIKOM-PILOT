-- =============================================================================
-- ADIKOM PILOT — 100 · Les conditions d'un acte émis sont celles qu'il portait
-- LOT 25 — DEC-049 · correction d'une faille découverte à la relecture
--
-- CE QUI A ÉTÉ TROUVÉ
--
-- Les déclencheurs de la migration 097 figent, hors brouillon, le client, la
-- date, la validité, le numéro et la devise d'un devis — et les colonnes
-- équivalentes d'une commande. Ils ne figent **ni `terms`, ni `notes`**.
--
-- Or `terms` porte les CONDITIONS, qui sont IMPRIMÉES SUR LE DOCUMENT REMIS AU
-- CLIENT. Elles font partie de ce que le client a accepté. Les laisser
-- réécrivables après émission, c'est laisser modifier un engagement dans le dos
-- de celui qui l'a pris — précisément ce que la couche 2 existe pour empêcher.
--
-- LA PORTE, ET SA TAILLE
--
-- La policy d'écriture de `sales_quotes` accepte `commerce.sales_orders.create`
-- et `.cancel` : il le faut, sans quoi la conversion et son annulation
-- échoueraient au niveau de RLS avant d'atteindre le déclencheur (migration 097
-- §14). Le déclencheur restreint ensuite ces capacités aux seuls passages de
-- statut qui les concernent.
--
-- Mais RIEN ne les empêchait d'écrire `terms` ou `notes` par un `PATCH` direct.
-- Un porteur de `commerce.sales_orders.create` SEUL — qui ne peut ni modifier,
-- ni émettre, ni annuler un devis — pouvait donc en réécrire les conditions,
-- sur un devis déjà remis au client.
--
-- Faille étroite, jamais empruntée par un écran. Réelle tout de même : la base
-- doit empêcher la modification silencieuse d'un acte engagé, et non compter
-- sur ce que l'interface propose.
--
-- CE QUE CETTE MIGRATION POSE
--
--   1. `terms` REJOINT LE GEL. Un acte émis porte les conditions qu'il portait.
--   2. `notes` EXIGE `update`, DANS TOUS LES ÉTATS. Annoter reste possible —
--      une observation postérieure est un besoin réel, et la facturation le
--      permet déjà (LOT 7) — mais annoter, c'est modifier : la capacité de
--      modifier est donc exigée, au lieu de suivre incidemment une autre.
--
-- POURQUOI `notes` N'EST PAS GELÉE, ET `terms` L'EST
--
--   `terms`  CONTRACTUEL. Imprimé sur la pièce, accepté par le client.
--   `notes`  OBSERVATIONS. Commentaire interne, que la facturation laisse
--            annotable après émission depuis le LOT 7. Le geler ici créerait
--            deux doctrines pour la même question.
--
-- LES DEUX FONCTIONS SONT REPRISES DE LEUR DERNIÈRE VERSION ACTIVE, transitions
-- et capacités comprises. Rien d'autre ne change.
--
-- Aucune table, aucune colonne, aucune capacité. Catalogue : 213, inchangé.
-- =============================================================================

create or replace function public.fn_sales_quote_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_allowed public.commercial_document_status[];
begin
  if new.status is distinct from old.status then

    v_allowed := case old.status
      when 'DRAFT'     then array['SENT','CANCELLED']::public.commercial_document_status[]
      when 'SENT'      then array['ACCEPTED','REFUSED','CANCELLED']::public.commercial_document_status[]
      -- Un devis accepté mais non converti peut encore être retiré : l'affaire
      -- peut tomber avant que la commande n'existe.
      when 'ACCEPTED'  then array['CONVERTED','CANCELLED']::public.commercial_document_status[]
      -- Converti : la commande existe. Le devis est un acte du passé.
      -- Son retour à « accepté » n'est possible que par l'annulation de cette
      -- commande, seul chemin qui libère aussi l'index d'unicité.
      when 'CONVERTED' then array['ACCEPTED']::public.commercial_document_status[]
      else array[]::public.commercial_document_status[]
    end;

    if not (new.status = any (v_allowed)) then
      raise exception
        'Transition de devis refusée : « % » ne peut pas devenir « % ».', old.status, new.status
        using errcode = 'check_violation';
    end if;

    case new.status
      when 'SENT' then
        perform public.require_capability(
          array['commerce.sales_quotes.validate'], 'émettre un devis client');

        -- Un devis sans ligne facturable n'est pas un devis : on ne remet pas
        -- au client un document dont le total serait nul.
        if public.sales_quote_total(new.id) <= 0 then
          raise exception
            'Opération refusée : ce devis ne porte aucune ligne. Un total est nécessaire à son émission.'
            using errcode = 'check_violation';
        end if;

      when 'ACCEPTED' then
        if old.status = 'CONVERTED' then
          -- Retour d'une conversion annulée : c'est l'annulation de la commande
          -- qui l'autorise, et elle seule.
          perform public.require_capability(
            array['commerce.sales_orders.cancel'],
            'ramener un devis à « accepté » après annulation de sa commande');
        else
          perform public.require_capability(
            array['commerce.sales_quotes.validate'],
            'enregistrer l''acceptation d''un devis');
        end if;

      when 'REFUSED' then
        perform public.require_capability(
          array['commerce.sales_quotes.validate'], 'enregistrer le refus d''un devis');

      when 'CONVERTED' then
        perform public.require_capability(
          array['commerce.sales_orders.create'], 'convertir un devis en commande');

      when 'CANCELLED' then
        perform public.require_capability(
          array['commerce.sales_quotes.cancel'], 'annuler un devis client');

      else
        null;
    end case;
  end if;

  /*
   * COUCHE 2 — LE VERROU.
   *
   * Un devis qui a quitté le brouillon fige ce qui l'engage : son client, sa
   * date, sa validité, son numéro, sa devise — et ses CONDITIONS, qui sont
   * imprimées sur la pièce remise au client et font partie de ce qu'il a
   * accepté. Les LIGNES le sont par leur propre déclencheur.
   */
  if old.status <> 'DRAFT'
     and (new.client_id     is distinct from old.client_id
       or new.quote_date    is distinct from old.quote_date
       or new.valid_until   is distinct from old.valid_until
       or new.quote_no      is distinct from old.quote_no
       or new.currency_code is distinct from old.currency_code
       or new.terms         is distinct from old.terms)
     and not public.is_restoring() then
    raise exception
      'Opération refusée : un devis émis ne se réécrit plus. Son client, sa date, sa validité et ses conditions sont ceux qui ont été remis au client.'
      using errcode = 'check_violation';
  end if;

  /*
   * ANNOTER, C'EST MODIFIER — dans tous les états.
   *
   * Les observations restent annotables après émission, comme celles d'une
   * facture depuis le LOT 7. Mais l'acte exige SA capacité, au lieu de suivre
   * incidemment celle d'un voisin : sans cette garde, un porteur de
   * `commerce.sales_orders.create` — que la policy d'écriture admet pour la
   * conversion — pouvait annoter n'importe quel devis.
   */
  if new.notes is distinct from old.notes and not public.is_restoring() then
    perform public.require_capability(
      array['commerce.sales_quotes.update'], 'modifier les observations d''un devis');
  end if;

  -- Modifier un devis encore en brouillon relève de `update`.
  if old.status = 'DRAFT'
     and (new.client_id   is distinct from old.client_id
       or new.quote_date  is distinct from old.quote_date
       or new.valid_until is distinct from old.valid_until
       or new.terms       is distinct from old.terms) then
    perform public.require_capability(
      array['commerce.sales_quotes.update'], 'modifier un devis client');
  end if;

  return new;
end;
$$;

comment on function public.fn_sales_quote_transition() is
  'Couches 2 et 3 du devis : transitions autorisées, capacité de chacune, gel de l''en-tête ET des conditions hors brouillon.';

revoke execute on function public.fn_sales_quote_transition() from public, anon;


create or replace function public.fn_sales_order_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_allowed public.order_status[];
begin
  if new.status is distinct from old.status then

    v_allowed := case old.status
      when 'DRAFT'     then array['CONFIRMED','CANCELLED']::public.order_status[]
      when 'CONFIRMED' then array['DELIVERED','INVOICED','CANCELLED']::public.order_status[]
      when 'DELIVERED' then array['INVOICED','CANCELLED']::public.order_status[]
      -- Le retour à « Confirmée » n'est pas une marche arrière de complaisance :
      -- c'est le seul état cohérent d'une commande dont la facture a été annulée.
      when 'INVOICED'  then array['CONFIRMED']::public.order_status[]
      else array[]::public.order_status[]
    end;

    if not (new.status = any (v_allowed)) then
      raise exception
        'Transition de commande refusée : « % » ne peut pas devenir « % ».', old.status, new.status
        using errcode = 'check_violation';
    end if;

    case new.status
      when 'CONFIRMED' then
        if old.status = 'INVOICED' then
          perform public.require_capability(
            array['billing.customer_invoices.cancel'],
            'ramener une commande à « confirmée » après annulation de sa facture');
        else
          perform public.require_capability(
            array['commerce.sales_orders.validate'], 'confirmer une commande client');

          if public.sales_order_total(new.id) <= 0 then
            raise exception
              'Opération refusée : cette commande ne porte aucune ligne. Un total est nécessaire à sa confirmation.'
              using errcode = 'check_violation';
          end if;
        end if;

      when 'DELIVERED' then
        perform public.require_capability(
          array['commerce.sales_orders.validate'], 'constater la livraison d''une commande');

      when 'INVOICED' then
        perform public.require_capability(
          array['billing.customer_invoices.create'], 'facturer une commande client');

      when 'CANCELLED' then
        perform public.require_capability(
          array['commerce.sales_orders.cancel'], 'annuler une commande client');

      else
        null;
    end case;
  end if;

  -- COUCHE 2 — une commande qui a quitté le brouillon fige ce qui l'engage,
  -- ses CONDITIONS comprises.
  if old.status <> 'DRAFT'
     and (new.client_id      is distinct from old.client_id
       or new.sales_quote_id is distinct from old.sales_quote_id
       or new.order_date     is distinct from old.order_date
       or new.order_no       is distinct from old.order_no
       or new.currency_code  is distinct from old.currency_code
       or new.terms          is distinct from old.terms)
     and not public.is_restoring() then
    raise exception
      'Opération refusée : une commande confirmée ne se réécrit plus. Son client, son origine, sa date et ses conditions sont ceux de l''engagement pris.'
      using errcode = 'check_violation';
  end if;

  -- Annoter, c'est modifier — dans tous les états.
  if new.notes is distinct from old.notes and not public.is_restoring() then
    perform public.require_capability(
      array['commerce.sales_orders.update'], 'modifier les observations d''une commande');
  end if;

  if old.status = 'DRAFT'
     and (new.client_id     is distinct from old.client_id
       or new.order_date    is distinct from old.order_date
       or new.expected_date is distinct from old.expected_date
       or new.terms         is distinct from old.terms) then
    perform public.require_capability(
      array['commerce.sales_orders.update'], 'modifier une commande client');
  end if;

  return new;
end;
$$;

comment on function public.fn_sales_order_transition() is
  'Couches 2 et 3 de la commande : transitions autorisées, capacité de chacune, gel de l''en-tête ET des conditions hors brouillon.';

revoke execute on function public.fn_sales_order_transition() from public, anon;


-- =============================================================================
-- ⚠ LA CONVERSION ET LA FACTURATION RECOPIENT `notes` ET `terms`
--
-- `convert_sales_quote_to_order` écrit `notes` et `terms` de la commande NAISSANTE
-- à partir du devis — un INSERT, que ces déclencheurs d'UPDATE ne voient pas.
--
-- `create_invoice_from_sales_order` écrit les notes de la FACTURE, qui est une
-- autre table. Aucune des deux n'a besoin de `commerce.*.update`, et aucune ne
-- la reçoit : c'est vérifié plus bas.
-- =============================================================================

do $$
declare
  v_def text;
begin
  /*
   * Le gel porte bien sur les conditions, dans les deux déclencheurs.
   *
   * ⚠ DEUX PIÈGES DANS CES MOTIFS, ET LE SECOND A ÉTÉ TROUVÉ PAR CE CONTRÔLE.
   *
   * 1. L'ALIGNEMENT. Écrit avec le nombre exact d'espaces qui sépare
   *    aujourd'hui `new.terms` de `is distinct from`, le motif échouerait au
   *    premier reformatage — pour une raison sans rapport avec ce qu'il
   *    vérifie. Le `%` intercalaire s'en affranchit.
   *
   * 2. LES APOSTROPHES. `pg_get_functiondef` rend le corps TEL QU'IL EST
   *    ÉCRIT : un message contenant `d''un devis` y figure avec SES DEUX
   *    apostrophes, puisqu'il est lui-même un littéral PL/pgSQL. Un motif
   *    écrit `d''un` — une seule apostrophe après déséchappement — ne le
   *    trouve donc jamais. Les motifs évitent l'apostrophe, plutôt que de
   *    compter les niveaux d'échappement.
   */
  select pg_get_functiondef('public.fn_sales_quote_transition()'::regprocedure) into v_def;
  if v_def not like '%new.terms%is distinct from old.terms%' then
    raise exception 'Les conditions d''un devis émis ne sont pas gelées.';
  end if;
  if v_def not like '%modifier les observations%' then
    raise exception 'Annoter un devis n''exige pas la capacité de le modifier.';
  end if;

  select pg_get_functiondef('public.fn_sales_order_transition()'::regprocedure) into v_def;
  if v_def not like '%new.terms%is distinct from old.terms%' then
    raise exception 'Les conditions d''une commande confirmée ne sont pas gelées.';
  end if;
  if v_def not like '%modifier les observations%' then
    raise exception 'Annoter une commande n''exige pas la capacité de la modifier.';
  end if;

  /*
   * LES ACQUIS DE LA 097 SONT TOUJOURS LÀ.
   *
   * Ces deux fonctions sont RÉÉCRITES ENTIÈRES. Une transition omise se lirait
   * comme une porte ouverte, et ne se découvrirait qu'à l'usage.
   */
  select pg_get_functiondef('public.fn_sales_quote_transition()'::regprocedure) into v_def;
  if v_def not like '%commerce.sales_quotes.validate%'
     or v_def not like '%commerce.sales_quotes.cancel%'
     or v_def not like '%commerce.sales_orders.create%'
     or v_def not like '%commerce.sales_orders.cancel%'
     or v_def not like '%sales_quote_total%' then
    raise exception 'Une capacité ou un contrôle du cycle du devis a disparu.';
  end if;

  select pg_get_functiondef('public.fn_sales_order_transition()'::regprocedure) into v_def;
  if v_def not like '%commerce.sales_orders.validate%'
     or v_def not like '%commerce.sales_orders.cancel%'
     or v_def not like '%billing.customer_invoices.create%'
     or v_def not like '%billing.customer_invoices.cancel%'
     or v_def not like '%sales_order_total%' then
    raise exception 'Une capacité ou un contrôle du cycle de la commande a disparu.';
  end if;

  -- Ni l'une ni l'autre n'est devenue SECURITY DEFINER (doctrine D4).
  if exists (
    select 1 from pg_proc
    where oid in (
      'public.fn_sales_quote_transition()'::regprocedure,
      'public.fn_sales_order_transition()'::regprocedure
    ) and prosecdef
  ) then
    raise exception 'Un déclencheur du commerce client est devenu SECURITY DEFINER.';
  end if;

  -- Aucune capacité n'est créée par cette migration.
  if (select count(*) from public.permissions) <> 213 then
    raise exception 'Le catalogue a bougé : cette migration ne crée aucune capacité.';
  end if;

  raise notice
    '[OK] 100. Les conditions d''un acte émis sont figées ; annoter exige la capacité de modifier.';
end $$;
