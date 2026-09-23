-- =============================================================================
-- ADIKOM PILOT — 104 · Un motif ne franchit pas la frontière d'un menu
-- LOT 26 — correction d'une fuite découverte par la recette de production
--
-- CE QUI A ÉTÉ TROUVÉ
--
-- La recette du LOT 26 éprouve l'étanchéité des menus (A-14) sur un profil qui
-- détient `commerce.purchase_quotes.view` et RIEN de plus. La fiche de l'offre
-- convertie lui DIT, comme prévu, que la commande existe et que « sa référence
-- ne vous est pas communiquée » (DEC-017).
--
-- 🟥 ET, TROIS LIGNES PLUS BAS, LA MÊME FICHE AFFICHAIT SA RÉFÉRENCE.
--
-- Non par le bloc dédié — celui-là est gardé —, mais par le champ « Motif du
-- dernier changement ». `convert_purchase_quote_to_order` y écrivait
-- « Commande CDE-F-2026-000002 », et `status_reason` appartient au DEVIS : il
-- s'ouvre donc par `commerce.purchase_quotes.view`, seule.
--
-- L'écran disait vrai et faux dans la même page. Faille étroite — un numéro
-- d'ordre, pas un montant — mais c'est exactement le genre d'écart qui rend une
-- règle invérifiable : une documentation qui promet le contraire de ce que le
-- système fait ne protège plus rien.
--
-- LE PRINCIPE, ÉCRIT UNE FOIS POUR TOUTES
--
--   Un `status_reason`, un `notes` ou tout autre texte écrit PAR LE SYSTÈME sur
--   un document du menu A ne doit pas porter la RÉFÉRENCE d'un document du
--   menu B. Le FAIT se dit ; la référence se demande à la capacité qui la garde.
--
-- Ce que l'utilisateur SAISIT lui-même reste ce qu'il a saisi : cette règle ne
-- vise que les textes que les fonctions écrivent d'office.
--
-- QUATRE ÉCRITURES CORRIGÉES, TOUTES DANS CE LOT
--
--   1. `convert_purchase_quote_to_order`  → motif du DEVIS
--      « Commande CDE-F-… »          devient  « Convertie en commande »
--   2. `set_purchase_order_status`        → motif du DEVIS, à l'annulation
--      « Commande CDE-F-… annulée »  devient  « Commande annulée »
--   3. `cancel_supplier_invoice`          → motif de la COMMANDE
--      « Facture FAC-F-… annulée »   devient  « Facture annulée »
--   4. `create_invoice_from_purchase_order` → observations de la FACTURE
--      « Commande CDE-F-… »          devient  « Facture issue d'une commande fournisseur »
--
-- Dans les quatre cas, le LIEN STRUCTUREL demeure — `purchase_quote_id`,
-- `purchase_order_id` — et c'est lui qui porte la traçabilité, sous la capacité
-- qui le garde. Aucune information n'est perdue pour qui a le droit de la lire.
--
-- 🟦 LE MÊME ÉCART EXISTE DANS LE COMMERCE CLIENT (LOT 25), à l'identique :
-- `convert_sales_quote_to_order`, `set_sales_order_status` et
-- `cancel_customer_invoice` écrivent « Commande CDE-C-… » et
-- « Facture FAC-C-… ». **Il n'est PAS corrigé ici** : le cadrage du LOT 26
-- interdit de modifier les devis et commandes clients, et une correction de
-- symétrie n'est pas une urgence. Il est nommé au Rapport 18 comme dette, pour
-- le lot qui touchera ce module.
--
-- LES QUATRE FONCTIONS SONT REPRISES DE LEUR DERNIÈRE VERSION ACTIVE. Rien
-- d'autre ne change : ni transition, ni capacité, ni contrôle.
--
-- Aucune table, aucune colonne, aucune capacité. Catalogue : 229, inchangé.
-- =============================================================================

create or replace function public.convert_purchase_quote_to_order(
  p_quote_id      uuid,
  p_order_date    date default null,
  p_expected_date date default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  q        public.purchase_quotes%rowtype;
  v_id     uuid;
  v_no     text;
  v_date   date;
  v_lignes int;
begin
  perform public.require_capability(
    array['commerce.purchase_orders.create'], 'convertir un devis fournisseur en commande');
  perform public.require_capability(
    array['commerce.purchase_orders.view'], 'consulter la commande fournisseur créée');
  perform public.require_capability(
    array['commerce.purchase_quotes.view'], 'consulter le devis fournisseur converti');
  perform public.require_capability(
    array['parties.suppliers.view'], 'consulter le fournisseur de la commande');

  select * into q from public.purchase_quotes where id = p_quote_id for update;

  if not found then
    raise exception 'Devis fournisseur introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if q.status = 'CONVERTED' then
    raise exception
      'Opération refusée : ce devis fournisseur est déjà converti. Un devis ne produit pas deux commandes.'
      using errcode = 'unique_violation';
  end if;

  if q.status <> 'ACCEPTED' then
    raise exception
      'Opération refusée : seule une offre RETENUE se convertit en commande. Celle-ci est « % ».', q.status
      using errcode = 'check_violation';
  end if;

  -- Le jour est celui d'ADIKOM, jamais celui du serveur : aux Comores (UTC+3),
  -- `current_date` change trois heures trop tard.
  v_date := coalesce(p_order_date, (now() at time zone 'Indian/Comoro')::date);

  if p_expected_date is not null and p_expected_date < v_date then
    raise exception 'La date de réception attendue ne peut pas précéder la date de la commande.'
      using errcode = 'check_violation';
  end if;

  v_no := public.next_number('purchase_order');

  insert into public.purchase_orders
    (order_no, supplier_id, purchase_quote_id, order_date, expected_date,
     currency_code, notes, terms, created_by, updated_by)
  values
    (v_no, q.supplier_id, q.id, v_date, p_expected_date,
     q.currency_code, q.notes, q.terms,
     public.current_actor(), public.current_actor())
  returning id into v_id;

  -- LES LIGNES SONT RECOPIÉES, PAS RESSAISIES.
  insert into public.purchase_order_lines
    (purchase_order_id, service_id, service_variant_id, source_quote_line_id,
     label, quantity, unit_price, created_by, updated_by)
  select
    v_id, l.service_id, l.service_variant_id, l.id,
    l.label, l.quantity, l.unit_price,
    public.current_actor(), public.current_actor()
  from public.purchase_quote_lines l
  where l.purchase_quote_id = q.id
    and l.is_archived = false;

  get diagnostics v_lignes = row_count;

  if v_lignes = 0 then
    raise exception
      'Opération refusée : ce devis fournisseur ne porte aucune ligne active, ou ses lignes ne sont pas lisibles avec vos droits. La commande serait vide.'
      using errcode = 'check_violation';
  end if;

  /*
   * 🟥 LE MOTIF DIT LE FAIT, PAS LA RÉFÉRENCE.
   *
   * `status_reason` appartient au DEVIS : il s'ouvre par
   * `commerce.purchase_quotes.view`, seule. Y écrire le numéro de la commande
   * communiquerait une référence du menu voisin à qui ne le lit pas — et la
   * fiche affirme, trois lignes plus bas, qu'elle ne la communique pas.
   *
   * Le lien, lui, reste : `purchase_orders.purchase_quote_id` le porte, et c'est
   * `commerce.purchase_orders.view` qui l'ouvre.
   */
  update public.purchase_quotes
     set status            = 'CONVERTED',
         converted_at      = now(),
         converted_by      = public.current_actor(),
         status_reason     = 'Convertie en commande',
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = q.id;

  return v_id;
end;
$$;

comment on function public.convert_purchase_quote_to_order(uuid, date, date) is
  'Crée une commande à partir d''un devis fournisseur retenu. Le devis est conservé et passe à « converti » ; les prix sont RECOPIÉS de l''offre. Son motif ne porte aucune référence du menu voisin.';

revoke execute on function public.convert_purchase_quote_to_order(uuid, date, date) from public, anon;
grant  execute on function public.convert_purchase_quote_to_order(uuid, date, date) to authenticated, service_role;


create or replace function public.set_purchase_order_status(
  p_order_id uuid,
  p_status   public.order_status,
  p_reason   text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  o public.purchase_orders%rowtype;
begin
  perform public.require_capability(
    array['commerce.purchase_orders.view'], 'consulter la commande fournisseur concernée');

  if p_status = 'INVOICED' then
    raise exception
      'Opération refusée : « facturée » n''est pas un statut qui se déclare. Il résulte de l''enregistrement de la facture fournisseur.'
      using errcode = 'check_violation';
  end if;

  select * into o from public.purchase_orders where id = p_order_id for update;

  if not found then
    raise exception 'Commande fournisseur introuvable ou non lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if o.status = p_status then
    raise exception 'Cette commande fournisseur est déjà « % ».', p_status
      using errcode = 'check_violation';
  end if;

  update public.purchase_orders
     set status            = p_status,
         confirmed_at      = case when p_status = 'CONFIRMED' then now() else confirmed_at end,
         confirmed_by      = case when p_status = 'CONFIRMED' then public.current_actor() else confirmed_by end,
         delivered_at      = case when p_status = 'DELIVERED' then now() else delivered_at end,
         delivered_by      = case when p_status = 'DELIVERED' then public.current_actor() else delivered_by end,
         cancelled_at      = case when p_status = 'CANCELLED' then now() else cancelled_at end,
         cancelled_by      = case when p_status = 'CANCELLED' then public.current_actor() else cancelled_by end,
         status_reason     = nullif(btrim(coalesce(p_reason, '')), ''),
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = o.id;

  /*
   * ANNULER UNE COMMANDE REND SON DEVIS À « RETENU ».
   *
   * Sans ce retour, un devis converti par erreur resterait « converti » sans
   * commande vivante, tandis que l'index d'unicité, lui, se libérerait — et une
   * seconde commande naîtrait d'un devis que rien n'aurait rouvert.
   *
   * 🟥 Le motif dit le FAIT, pas la référence de la commande (voir l'en-tête).
   */
  if p_status = 'CANCELLED' and o.purchase_quote_id is not null then
    update public.purchase_quotes
       set status            = 'ACCEPTED',
           converted_at      = null,
           converted_by      = null,
           status_reason     = 'Commande annulée',
           status_changed_at = now(),
           status_changed_by = public.current_actor(),
           updated_by        = public.current_actor()
     where id = o.purchase_quote_id
       and status = 'CONVERTED';
  end if;
end;
$$;

comment on function public.set_purchase_order_status(uuid, public.order_status, text) is
  'Passer, réceptionner ou annuler une commande fournisseur. L''annulation rend son devis d''origine à « retenu », sans lui communiquer de référence.';

revoke execute on function public.set_purchase_order_status(uuid, public.order_status, text) from public, anon;
grant  execute on function public.set_purchase_order_status(uuid, public.order_status, text) to authenticated, service_role;


-- =============================================================================
-- `cancel_supplier_invoice` — REPRISE DE SA DERNIÈRE VERSION ACTIVE (102)
--
-- Seul le motif écrit sur la COMMANDE change. Tous les contrôles — capacités,
-- lecture de la commande, déclencheurs d'imputation et de règlement — sont
-- repris à l'identique.
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

  -- LOT 26 : la commande redevient « Passée » et se facture de nouveau.
  -- 🟥 Son motif dit le FAIT, pas le numéro de la facture : `status_reason`
  -- appartient à la COMMANDE, et s'ouvre par `commerce.purchase_orders.view`.
  if f.purchase_order_id is not null and v_ostatus = 'INVOICED' then
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
end;
$$;

comment on function public.cancel_supplier_invoice(uuid, text) is
  'Annule une facture sans l''effacer. Refusée tant qu''une imputation ou un règlement la touche. Rend sa commande d''origine à « passée », sans lui communiquer de référence.';

revoke execute on function public.cancel_supplier_invoice(uuid, text) from public, anon;
grant  execute on function public.cancel_supplier_invoice(uuid, text) to authenticated, service_role;


-- =============================================================================
-- `create_invoice_from_purchase_order` — REPRISE DE SA DERNIÈRE VERSION ACTIVE
--
-- Seules les observations écrites d'office sur la facture changent. La fiche de
-- la facture porte déjà un bloc « Commande d'origine » gardé par
-- `commerce.purchase_orders.view` : y ajouter la référence en clair dans les
-- observations le contredisait.
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

  if o.status = 'INVOICED' then
    raise exception
      'Opération refusée : cette commande porte déjà une facture. Une facture reçue pour un complément s''enregistre sans commande d''origine.'
      using errcode = 'unique_violation';
  end if;

  if o.status not in ('CONFIRMED', 'DELIVERED') then
    raise exception
      'Opération refusée : seule une commande passée ou réceptionnée se facture. Celle-ci est « % ».', o.status
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

  update public.purchase_orders
     set status            = 'INVOICED',
         invoiced_at       = now(),
         invoiced_by       = public.current_actor(),
         status_reason     = 'Facture enregistrée',
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = o.id;

  return v_id;
end;
$$;

comment on function public.create_invoice_from_purchase_order(uuid, date, date, text) is
  'Prépare une facture fournisseur À PARTIR des fonctions existantes. Elle naît en brouillon ; ses observations ne portent aucune référence du menu voisin.';

revoke execute on function public.create_invoice_from_purchase_order(uuid, date, date, text) from public, anon;
grant  execute on function public.create_invoice_from_purchase_order(uuid, date, date, text) to authenticated, service_role;


-- =============================================================================
-- CONTRÔLES
-- =============================================================================

do $$
declare
  v_def text;
begin
  /*
   * AUCUNE DES QUATRE FONCTIONS NE COMPOSE PLUS UNE RÉFÉRENCE.
   *
   * Le motif cherché est la CONCATÉNATION — `|| v_no`, `|| o.order_no`,
   * `|| f.invoice_no` — parce que c'est elle qui fabriquait la fuite. Une
   * chaîne littérale mentionnant « commande » reste évidemment permise : c'est
   * le FAIT, et il doit se dire.
   *
   * ⚠ Les motifs évitent l'apostrophe : `pg_get_functiondef` rend le corps TEL
   * QU'IL EST ÉCRIT, avec ses apostrophes doublées (leçon de la migration 100).
   */
  select pg_get_functiondef('public.convert_purchase_quote_to_order(uuid, date, date)'::regprocedure)
    into v_def;
  if v_def like '%status_reason     = %||%' or v_def like '%Commande % || v_no%' then
    raise exception
      'Le motif du devis converti compose encore une référence de commande.';
  end if;
  if v_def not like '%Convertie en commande%' then
    raise exception 'Le motif du devis converti ne dit plus le fait.';
  end if;
  -- Les acquis de la 101 : capacités, recopie des lignes, refus de la double
  -- conversion.
  if v_def not like '%commerce.purchase_orders.create%'
     or v_def not like '%purchase_quote_lines%'
     or v_def not like '%deux commandes%'
     or v_def not like '%Indian/Comoro%' then
    raise exception 'Un contrôle de la conversion a disparu.';
  end if;

  select pg_get_functiondef('public.set_purchase_order_status(uuid, public.order_status, text)'::regprocedure)
    into v_def;
  if v_def like '%|| o.order_no ||%' then
    raise exception
      'Le motif rendu au devis compose encore la référence de la commande annulée.';
  end if;
  if v_def not like '%Commande annulée%' then
    raise exception 'Le motif rendu au devis ne dit plus le fait.';
  end if;
  if v_def not like '%converted_at      = null%' then
    raise exception 'Le retour du devis à « retenu » a perdu son effacement d''horodatage.';
  end if;

  select pg_get_functiondef('public.cancel_supplier_invoice(uuid, text)'::regprocedure)
    into v_def;
  if v_def like '%|| f.invoice_no ||%' then
    raise exception
      'Le motif rendu à la commande compose encore la référence de la facture annulée.';
  end if;
  if v_def not like '%Facture annulée%' then
    raise exception 'Le motif rendu à la commande ne dit plus le fait.';
  end if;
  if v_def not like '%commerce.purchase_orders.view%'
     or v_def not like '%billing.supplier_invoices.cancel%' then
    raise exception 'Une capacité de l''annulation de facture a disparu.';
  end if;

  select pg_get_functiondef('public.create_invoice_from_purchase_order(uuid, date, date, text)'::regprocedure)
    into v_def;
  if v_def like '%p_notes             => %||%' then
    raise exception
      'Les observations de la facture composent encore la référence de la commande.';
  end if;
  if v_def not like '%Facture issue d%une commande fournisseur%' then
    raise exception 'Les observations de la facture ne disent plus le fait.';
  end if;
  if v_def not like '%billing.supplier_invoices.create%'
     or v_def not like '%add_supplier_invoice_line%'
     or v_def not like '%deux factures%' and v_def not like '%porte déjà une facture%' then
    raise exception 'Un contrôle de la facturation a disparu.';
  end if;

  -- Aucune des quatre n'est devenue SECURITY DEFINER (doctrine D4).
  if exists (
    select 1 from pg_proc
    where oid in (
      'public.convert_purchase_quote_to_order(uuid, date, date)'::regprocedure,
      'public.set_purchase_order_status(uuid, public.order_status, text)'::regprocedure,
      'public.cancel_supplier_invoice(uuid, text)'::regprocedure,
      'public.create_invoice_from_purchase_order(uuid, date, date, text)'::regprocedure
    ) and prosecdef
  ) then
    raise exception 'Une fonction du commerce fournisseur est devenue SECURITY DEFINER.';
  end if;

  -- Une seule version de chaque fonction étendue (acquis de la 102).
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_supplier_invoice') <> 1
  or (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'add_supplier_invoice_line') <> 1 then
    raise exception 'Une fonction de facturation fournisseur existe en plusieurs versions.';
  end if;

  -- Aucune capacité n'est créée par cette migration.
  if (select count(*) from public.permissions) <> 229 then
    raise exception 'Le catalogue a bougé : cette migration ne crée aucune capacité.';
  end if;

  raise notice
    '[OK] 104. Un motif dit le fait, jamais la référence d''un document que le lecteur n''a pas le droit de voir.';
end $$;
