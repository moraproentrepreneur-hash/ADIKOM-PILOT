-- =============================================================================
-- DEC-053 — UNE COMMANDE FOURNISSEUR PEUT PORTER PLUSIEURS FACTURES
--
-- La Direction tranche la question laissée ouverte au Rapport 18 §12.
--
-- Le LOT 26 avait retenu « une commande, au plus une facture non annulée ».
-- Cette règle n'était pas une règle MÉTIER : elle était imposée par
-- l'architecture d'alors, et le Rapport 18 le disait en posant la question
-- plutôt qu'en tranchant. La réponse est venue :
--
--   Commande        1 000 000
--     · facture 1     300 000   (acompte)
--     · facture 2     700 000   (solde)
--
-- CE QUE CETTE MIGRATION CHANGE — ET RIEN D'AUTRE
--
--   1. l'index unique partiel disparaît ;
--   2. `create_supplier_invoice` ne refuse plus une seconde facture ;
--   3. `create_invoice_from_purchase_order` accepte une commande déjà entrée
--      en facturation ;
--   4. `cancel_supplier_invoice` ne rend la commande à « passée » QUE s'il ne
--      reste plus aucune facture active.
--
-- CE QU'ELLE NE CHANGE PAS
--
--   · l'enum `order_status` — aucune valeur ajoutée (brief §5) ;
--   · les factures fournisseurs existantes, leurs lignes, leurs règlements,
--     leur cycle, leur audit, leur trésorerie ;
--   · leur caractère de DOCUMENT REÇU ;
--   · `backup_scope` et `backup_columns` — aucune table, aucune colonne ;
--   · le catalogue des capacités — aucune capacité ajoutée ;
--   · le commerce CLIENT, qui relève de la migration suivante.
--
-- 🟥 AUCUN OBJET « TRANCHE DE COMMANDE » N'EST CRÉÉ.
--
-- Le brief §4 le demande explicitement : la décision métier est « plusieurs
-- factures peuvent appartenir à une commande », et elle n'impose pas à elle
-- seule une table de tranches. Le passage du lien en 1→N suffit, parce que le
-- lien EXISTE DÉJÀ — `supplier_invoices.purchase_order_id` — et que seule son
-- unicité était contrainte. On retire une contrainte ; on n'ajoute pas une
-- structure.
--
-- 🟥 AUCUNE RÈGLE « TOTAL FACTURES = MONTANT COMMANDE » N'EST ÉCRITE.
--
-- Le brief §3 l'interdit, et le Rapport 18 §10.2 avait déjà établi pourquoi :
-- une facture fournisseur est un document REÇU, qui constate ce que le
-- fournisseur RÉCLAME. Son montant n'a pas à correspondre au montant théorique
-- de la commande. Le système doit pouvoir CONSTATER l'écart, jamais le refuser
-- ni le corriger. Aucune fonction de cette migration ne compare un cumul à un
-- total pour en tirer un refus.
--
-- 🟥 FACTURATION PARTIELLE ≠ PAIEMENT PARTIEL (brief §2).
--
--   COMMANDE → une ou plusieurs FACTURES → chacune reçoit un ou plusieurs
--   RÈGLEMENTS → la trésorerie ne bouge qu'au règlement.
--
-- Aucun mécanisme de paiement n'est créé, modifié, ni contourné ici.
-- =============================================================================


-- =============================================================================
-- 1. L'INDEX D'UNICITÉ DISPARAÎT
--
-- Il faisait autorité pour deux clics simultanés comme pour un `POST` direct.
-- C'est lui, et non le contrôle applicatif, qu'il faut retirer en premier : tant
-- qu'il vit, aucune seconde facture n'est possible, quel que soit le code.
--
-- L'index NON unique `supplier_invoices_purchase_order_idx` reste : il sert la
-- lecture des factures d'une commande, qui devient précisément plus fréquente.
-- =============================================================================

drop index if exists public.supplier_invoices_one_per_purchase_order_idx;


-- =============================================================================
-- 2. `create_supplier_invoice` — LE REFUS ANTICIPÉ TOMBE
--
-- Reprise de sa DERNIÈRE VERSION ACTIVE — migration 102
-- (`20260923000600_facturer_une_commande_fournisseur.sql`). Le LOT 26 a montré
-- ce que coûte une réécriture reprise d'une version trop ancienne : on y perd
-- sans erreur les élargissements des lots suivants.
--
-- SEUL le bloc de refus « cette commande est déjà couverte par la facture % »
-- disparaît. Les six contrôles de capacité, les quatre contrôles de cohérence
-- et la naissance en brouillon (DEC-007) sont rendus À L'IDENTIQUE.
-- =============================================================================

create or replace function public.create_supplier_invoice(
  p_supplier_id       uuid,
  p_invoice_date      date,
  p_due_date          date default null,
  p_external_ref      text default null,
  p_notes             text default null,
  p_purchase_order_id uuid default null
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

  -- LOT 26 : nommer une commande suppose le droit de la consulter.
  if p_purchase_order_id is not null then
    perform public.require_capability(
      array['commerce.purchase_orders.view'], 'consulter la commande facturée'
    );
  end if;

  /*
   * Le fournisseur n'est PAS exigé actif.
   *
   * Une facture reçue d'un fournisseur devenu inactif reste une dette réelle.
   * Refuser de l'enregistrer empêcherait de la payer — et ferait disparaître du
   * système une obligation qui existe hors de lui.
   */
  if not exists (select 1 from public.suppliers s where s.id = p_supplier_id) then
    raise exception
      'Le fournisseur désigné est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  /*
   * 🟥 DEC-053 — ICI SE TROUVAIT LE REFUS DE LA SECONDE FACTURE.
   *
   * Il interrogeait `supplier_invoices` pour la commande visée et levait une
   * `unique_violation` dès qu'une facture non annulée existait. Il disparaît :
   * un acompte puis un solde sont désormais deux factures légitimes de la même
   * commande.
   *
   * Le déclencheur `fn_supplier_invoice_purchase_coherence` demeure, lui, et
   * continue d'exiger que la facture et sa commande partagent le FOURNISSEUR et
   * que la commande soit dans un état facturable. Ce n'est pas le nombre de
   * factures qui était le garde-fou utile : c'est leur cohérence.
   */

  v_no := public.next_number('supplier_invoice');

  insert into public.supplier_invoices
    (invoice_no, supplier_id, invoice_date, due_date, external_ref, notes,
     purchase_order_id, created_by, updated_by)
  values
    (v_no, p_supplier_id, p_invoice_date, p_due_date,
     nullif(btrim(coalesce(p_external_ref, '')), ''),
     nullif(btrim(coalesce(p_notes, '')), ''),
     p_purchase_order_id,
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.create_supplier_invoice(uuid, date, date, text, text, uuid) is
  'Enregistre une facture REÇUE, en brouillon (DEC-007). Ne génère aucun montant et ne crée ni imputation ni paiement. DEC-053 : une commande peut en porter plusieurs.';

revoke execute on function public.create_supplier_invoice(uuid, date, date, text, text, uuid) from public, anon;
grant  execute on function public.create_supplier_invoice(uuid, date, date, text, text, uuid) to authenticated, service_role;


-- =============================================================================
-- 3. `create_invoice_from_purchase_order` — UNE COMMANDE DÉJÀ FACTURÉE SE
--    FACTURE ENCORE
--
-- Reprise de sa DERNIÈRE VERSION ACTIVE — migration 104
-- (`20260923000800_un_motif_ne_franchit_pas_la_frontiere_d_un_menu.sql`), qui
-- avait corrigé ses observations. La correction de confidentialité est donc
-- RENDUE TELLE QUELLE : `p_notes` dit toujours le fait, jamais la référence.
--
-- DEUX CHANGEMENTS, PAS UN DE PLUS :
--
--   · le refus « cette commande porte déjà une facture » disparaît ;
--   · `INVOICED` rejoint les états de départ acceptés.
--
-- 🟦 `INVOICED` RESTE ÉCRIT, ET C'EST VOULU.
--
-- Il ne signifie plus « entièrement facturée » — il signifie « cette commande
-- est entrée en facturation ». C'est ce que le libellé de l'écran dit désormais.
-- On le conserve parce qu'il PORTE UNE GARDE : tant qu'une commande est
-- `INVOICED`, `set_purchase_order_status` refuse de l'annuler. Le retirer
-- rendrait cette protection dépendante d'un comptage de factures lu à travers
-- RLS — c'est-à-dire d'un comptage qui peut conclure « aucune » et laisser
-- passer. Un marqueur porté par la commande elle-même, lisible avec
-- `commerce.purchase_orders.view`, est une garde plus sûre qu'une somme.
--
-- La situation de facturation — non facturée, partiellement facturée,
-- totalement facturée, et l'écart — est DÉRIVÉE à l'affichage à partir des
-- factures de la commande (brief §5). Elle n'est persistée nulle part, donc
-- elle ne peut pas se désynchroniser.
-- =============================================================================

create or replace function public.create_invoice_from_purchase_order(
  p_order_id     uuid,
  p_invoice_date date default null,
  p_due_date     date default null,
  p_external_ref text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  o       public.purchase_orders%rowtype;
  l       record;
  v_id    uuid;
  v_date  date;
  v_count int := 0;
begin
  perform public.require_capability(
    array['commerce.purchase_orders.view'], 'consulter la commande à facturer');
  perform public.require_capability(
    array['billing.supplier_invoices.create'], 'enregistrer la facture de la commande');
  perform public.require_capability(
    array['billing.supplier_invoices.view'], 'consulter la facture enregistrée');
  perform public.require_capability(
    array['parties.suppliers.view'], 'consulter le fournisseur facturant');

  select * into o from public.purchase_orders where id = p_order_id for update;

  if not found then
    raise exception 'Commande fournisseur introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  /*
   * 🟥 DEC-053 — `INVOICED` EST UN ÉTAT DE DÉPART ACCEPTÉ.
   *
   * C'est ici que se tenait le refus opposé à une seconde facture. Une commande
   * passée, réceptionnée OU déjà entrée en facturation peut en recevoir une de
   * plus : l'acompte n'interdit pas le solde.
   *
   * (Le refus retiré est cherché par le contrôle final. Son libellé n'est donc
   * pas recopié ici : un commentaire qui cite la phrase surveillée déclenche le
   * contrôle qu'il prétend documenter.)
   *
   * Les autres états restent refusés — on ne facture pas un brouillon ni une
   * commande annulée.
   */
  if o.status not in ('CONFIRMED', 'DELIVERED', 'INVOICED') then
    raise exception
      'Opération refusée : seule une commande passée, réceptionnée ou déjà en facturation se facture. Celle-ci est « % ».', o.status
      using errcode = 'check_violation';
  end if;

  -- Le jour est celui d'ADIKOM (UTC+3), jamais celui du serveur.
  v_date := coalesce(p_invoice_date, (now() at time zone 'Indian/Comoro')::date);

  if p_due_date is not null and p_due_date < v_date then
    raise exception 'L''échéance ne peut pas précéder la date de la facture.'
      using errcode = 'check_violation';
  end if;

  v_id := public.create_supplier_invoice(
    p_supplier_id       => o.supplier_id,
    p_invoice_date      => v_date,
    p_due_date          => p_due_date,
    -- La référence du fournisseur sur SA facture — distincte de celle de son
    -- devis, et distincte du numéro interne d'ADIKOM (Module 07 §30).
    p_external_ref      => p_external_ref,
    -- 🟥 Le fait, pas la référence : le lien vit dans `purchase_order_id`, et
    -- c'est `commerce.purchase_orders.view` qui l'ouvre.
    p_notes             => 'Facture issue d''une commande fournisseur',
    p_purchase_order_id => o.id
  );

  for l in
    select id, label, quantity, unit_price, service_id, service_variant_id
    from public.purchase_order_lines
    where purchase_order_id = o.id and is_archived = false
    order by created_at
  loop
    perform public.add_supplier_invoice_line(
      p_invoice_id => v_id,
      p_label      => l.label,
      -- `p_amount` reste NUL : la décomposition le calcule (migration 102 §6).
      p_amount     => null,
      p_vehicle_id => null,
      p_quantity   => l.quantity,
      p_unit_price => l.unit_price,
      p_service_id => l.service_id,
      p_variant_id => l.service_variant_id
    );
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception
      'Opération refusée : cette commande ne porte aucune ligne active, ou ses lignes ne sont pas lisibles avec vos droits. La facture serait vide.'
      using errcode = 'check_violation';
  end if;

  /*
   * `invoiced_at` garde son sens : la PREMIÈRE entrée en facturation.
   *
   * Une seconde facture ne réécrit donc pas la date de la première. `coalesce`
   * dit cela en un mot, et évite d'avoir à distinguer les deux cas.
   */
  update public.purchase_orders
     set status            = 'INVOICED',
         invoiced_at       = coalesce(o.invoiced_at, now()),
         invoiced_by       = coalesce(o.invoiced_by, public.current_actor()),
         status_reason     = 'Facture enregistrée',
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = o.id;

  return v_id;
end;
$$;

comment on function public.create_invoice_from_purchase_order(uuid, date, date, text) is
  'Prépare une facture fournisseur À PARTIR des fonctions existantes. Elle naît en brouillon ; ses observations ne portent aucune référence du menu voisin. DEC-053 : une commande peut en recevoir plusieurs.';

revoke execute on function public.create_invoice_from_purchase_order(uuid, date, date, text) from public, anon;
grant  execute on function public.create_invoice_from_purchase_order(uuid, date, date, text) to authenticated, service_role;


-- =============================================================================
-- 4. `cancel_supplier_invoice` — LA COMMANDE NE REDESCEND QUE SI ELLE SE VIDE
--
-- Reprise de sa DERNIÈRE VERSION ACTIVE — migration 104.
--
-- Avant DEC-053, annuler LA facture rendait forcément la commande à « passée » :
-- il n'y en avait qu'une. Avec plusieurs, annuler l'acompte ne doit rien changer
-- tant que le solde vit.
--
-- 🟦 LE SENS DE L'ERREUR EST CHOISI.
--
-- Le comptage des factures restantes s'exécute sous RLS. S'il voyait MOINS que
-- la vérité, il conclurait « plus aucune facture » et rendrait la commande à
-- « passée » — c'est-à-dire qu'il OUVRIRAIT l'annulation d'une commande encore
-- facturée. Deux raisons font que ce risque ne se matérialise pas ici :
--
--   · la fonction EXIGE `billing.supplier_invoices.view` dès sa première ligne :
--     celui qui annule une facture lit les factures, par construction ;
--   · le test porte sur `exists`, et la branche prudente — ne rien faire — est
--     celle qui s'exécute quand quelque chose est vu. La commande reste alors
--     `INVOICED`, donc protégée.
--
-- Voir la leçon « une garde qui compte doit compter la vérité ».
-- =============================================================================

create or replace function public.cancel_supplier_invoice(
  p_invoice_id uuid,
  p_reason     text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  f         public.supplier_invoices%rowtype;
  v_ostatus public.order_status;
  v_reste   boolean;
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

  if f.purchase_order_id is not null then
    perform public.require_capability(
      array['commerce.purchase_orders.view'], 'consulter la commande que cette facture engage'
    );

    select o.status into v_ostatus
    from public.purchase_orders o where o.id = f.purchase_order_id;

    if v_ostatus is null then
      raise exception
        'La commande de cette facture est introuvable ou n''est pas lisible avec vos droits.'
        using errcode = 'no_data_found';
    end if;
  end if;

  update public.supplier_invoices
     set status            = 'CANCELLED',
         cancelled_at      = now(),
         cancelled_by      = public.current_actor(),
         status_reason     = nullif(btrim(coalesce(p_reason, '')), ''),
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = f.id;

  /*
   * 🟥 DEC-053 — la commande ne redevient « passée » que si plus AUCUNE facture
   * active ne la couvre. L'annulation de l'acompte laisse le solde en place, et
   * la commande reste en facturation.
   *
   * Son motif dit le FAIT, pas le numéro de la facture : `status_reason`
   * appartient à la COMMANDE, et s'ouvre par `commerce.purchase_orders.view`
   * seule (migration 104).
   */
  if f.purchase_order_id is not null and v_ostatus = 'INVOICED' then
    select exists (
      select 1 from public.supplier_invoices i
      where i.purchase_order_id = f.purchase_order_id
        and i.id <> f.id
        and i.status <> 'CANCELLED'
    ) into v_reste;

    if not v_reste then
      update public.purchase_orders
         set status            = 'CONFIRMED',
             invoiced_at       = null,
             invoiced_by       = null,
             status_reason     = 'Facture annulée',
             status_changed_at = now(),
             status_changed_by = public.current_actor(),
             updated_by        = public.current_actor()
       where id = f.purchase_order_id
         and status = 'INVOICED';
    end if;
  end if;
end;
$$;

comment on function public.cancel_supplier_invoice(uuid, text) is
  'Annule une facture sans l''effacer. Refusée tant qu''une imputation ou un règlement la touche. DEC-053 : ne rend sa commande à « passée » que si plus aucune facture active ne la couvre.';

revoke execute on function public.cancel_supplier_invoice(uuid, text) from public, anon;
grant  execute on function public.cancel_supplier_invoice(uuid, text) to authenticated, service_role;


-- =============================================================================
-- 5. CONTRÔLES — CE QUI DOIT AVOIR CHANGÉ, ET CE QUI NE DOIT PAS
-- =============================================================================

do $$
declare
  v_def text;
  v_n   int;
begin
  -- ---------------------------------------------------------------- ce qui change
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'supplier_invoices_one_per_purchase_order_idx'
  ) then
    raise exception
      'L''index d''unicité survit : une seconde facture resterait impossible malgré DEC-053.';
  end if;

  v_def := pg_get_functiondef('public.create_supplier_invoice(uuid, date, date, text, text, uuid)'::regprocedure);
  if v_def like '%deja couverte par la facture%' or v_def like '%déjà couverte par la facture%' then
    raise exception
      '`create_supplier_invoice` refuse encore la seconde facture d''une commande.';
  end if;

  v_def := pg_get_functiondef('public.create_invoice_from_purchase_order(uuid, date, date, text)'::regprocedure);
  if v_def like '%porte deja une facture%' or v_def like '%porte déjà une facture%' then
    raise exception
      '`create_invoice_from_purchase_order` refuse encore une commande déjà facturée.';
  end if;
  if v_def not like '%''CONFIRMED'', ''DELIVERED'', ''INVOICED''%' then
    raise exception
      '`create_invoice_from_purchase_order` n''accepte pas `INVOICED` comme état de départ : le solde serait refusé après l''acompte.';
  end if;

  v_def := pg_get_functiondef('public.cancel_supplier_invoice(uuid, text)'::regprocedure);
  if v_def not like '%i.id <> f.id%' then
    raise exception
      '`cancel_supplier_invoice` rend la commande à « passée » sans regarder les autres factures.';
  end if;

  -- ------------------------------------------------- ce qui ne doit PAS changer
  --
  -- L'index NON unique reste : il porte la lecture des factures d'une commande.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'supplier_invoices_purchase_order_idx'
  ) then
    raise exception
      'L''index de lecture `supplier_invoices_purchase_order_idx` a disparu avec l''index d''unicité.';
  end if;

  -- Le déclencheur de cohérence est le garde-fou qui reste. Il n'est PAS réécrit
  -- par cette migration : on vérifie seulement qu'il est toujours en place.
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.supplier_invoices'::regclass
      and tgname = 'supplier_invoices_purchase_coherence'
      and not tgisinternal
  ) then
    raise exception
      'Le déclencheur de cohérence facture/commande a disparu : le nombre de factures n''était pas le garde-fou, lui l''est.';
  end if;

  -- 🟥 AUCUNE VALEUR AJOUTÉE À L'ENUM (brief §5).
  select count(*) into v_n
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'order_status'
    and e.enumlabel in ('PARTIALLY_INVOICED', 'PARTIALLY_BILLED');
  if v_n > 0 then
    raise exception
      'Un état partiel a été ajouté à `order_status` : la situation de facturation se DÉRIVE, elle ne se persiste pas.';
  end if;

  -- 🟥 AUCUN OBJET « TRANCHE DE COMMANDE » (brief §4).
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name in ('purchase_order_slices', 'purchase_order_periods',
                         'purchase_order_instalments', 'purchase_billing_periods')
  ) then
    raise exception
      'Une table de tranches a été créée : DEC-053 ne l''impose pas, et le brief §4 l''interdit sans nécessité réelle.';
  end if;

  -- 🟥 AUCUNE RÈGLE « TOTAL FACTURES = MONTANT COMMANDE » (brief §3).
  --
  -- On cherche une contrainte qui REFUSERAIT un écart. La facture reçue
  -- constate ce que le fournisseur réclame : l'écart se montre, il ne se refuse
  -- jamais.
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.supplier_invoices'::regclass
      and conname like '%order_total%'
  ) then
    raise exception
      'Une contrainte lie le montant d''une facture reçue au total de sa commande : le Rapport 18 §10.2 l''interdit.';
  end if;

  -- Le périmètre de sauvegarde ne bouge pas : aucune table, aucune colonne.
  -- `backup_scope()` rend un `text[]` : on compte ses éléments, pas ses lignes.
  v_n := array_length(public.backup_scope(), 1);
  if v_n <> 62 then
    raise exception
      '`backup_scope` porte % tables au lieu de 62 : cette migration ne devait en ajouter aucune.', v_n;
  end if;

  -- Le catalogue ne bouge pas : DEC-053 n'ouvre aucune capacité nouvelle.
  select count(*) into v_n from public.permissions;
  if v_n <> 229 then
    raise exception
      'Le catalogue porte % capacités au lieu de 229 : cette migration ne devait en ajouter aucune.', v_n;
  end if;

  -- Doctrine D4 : aucun acte métier en `SECURITY DEFINER`.
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.proname in ('create_supplier_invoice', 'create_invoice_from_purchase_order',
                      'cancel_supplier_invoice');
  if v_n > 0 then
    raise exception
      '% fonction(s) de cette migration sont `SECURITY DEFINER` : la doctrine D4 l''interdit pour un acte métier.', v_n;
  end if;

  -- 🟥 LE COMMERCE CLIENT N'EST PAS TOUCHÉ PAR CETTE MIGRATION.
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'customer_invoices_one_per_order_idx'
  ) then
    null;  -- attendu : il vit toujours, DEC-053 ne porte que sur le fournisseur
  else
    raise exception
      'L''index d''unicité du commerce CLIENT a disparu : DEC-053 ne concerne que le fournisseur.';
  end if;
end $$;
