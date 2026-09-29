-- =============================================================================
-- LA DETTE DU RAPPORT 18 §13.2 EST SOLDÉE — CÔTÉ CLIENT
--
-- Le LOT 26 a trouvé, côté FOURNISSEUR, qu'une fonction écrivait la référence
-- d'un document du menu B dans le `status_reason` d'un document du menu A. La
-- migration 104 l'a corrigé et en a tiré une doctrine :
--
--   « Un texte écrit PAR LE SYSTÈME sur un document du menu A ne porte pas la
--     RÉFÉRENCE d'un document du menu B. Le fait se dit ; la référence se
--     demande à la capacité qui la garde. »
--
-- Le Rapport 18 §13.2 et §18 point 4 ont inscrit en dette que l'écart IDENTIQUE
-- subsistait dans le commerce CLIENT — non corrigé alors, parce que le LOT 26
-- avait interdiction de toucher aux devis et commandes clients.
--
-- Cette migration solde cette dette, et RIEN D'AUTRE.
--
-- CE QU'ELLE NE FAIT PAS (brief §10)
--
--   · DEC-051 n'est pas implémentée ;
--   · aucune remise n'est modifiée ;
--   · le modèle des devis clients est intact ;
--   · les commandes clients sont intactes ;
--   · leur numérotation est intacte ;
--   · aucune table, aucune colonne, aucune capacité, aucune policy RLS.
--
-- Seules QUATRE fonctions sont réécrites, et chacune depuis sa DERNIÈRE VERSION
-- ACTIVE. Cinq écritures changent : un littéral remplace une concaténation.
-- =============================================================================
--
-- LES CINQ FUITES
--
-- | Fonction                        | Écrit sur      | Portait                  |
-- | ------------------------------- | -------------- | ------------------------ |
-- | convert_sales_quote_to_order    | sales_quotes   | 'Commande ' || v_no      |
-- | set_sales_order_status          | sales_quotes   | 'Commande ' || order_no  |
-- | cancel_customer_invoice         | rentals        | 'Facture '  || invoice_no|
-- | cancel_customer_invoice         | sales_orders   | 'Facture '  || invoice_no|
-- | create_invoice_from_sales_order | customer_inv.  | 'Commande ' || order_no  |
--
-- Chaque ligne du tableau est la même faute : le porteur du texte s'ouvre par
-- UNE capacité, et le texte livre une référence qu'une AUTRE capacité garde.
--
-- Exemple, le premier cas. `sales_quotes.status_reason` se lit avec
-- `commerce.sales_quotes.view`, seule. Un utilisateur qui n'a pas
-- `commerce.sales_orders.view` y lisait pourtant « Commande CDE-C-2026-000123 »
-- — pendant que le bloc dédié de la fiche, lui correctement gardé, affirmait
-- que la référence ne lui était pas communiquée. L'écran disait vrai et faux
-- dans la même page.
--
-- La relation structurelle — `sales_quotes.sales_order_id`,
-- `customer_invoices.sales_order_id`, `customer_invoices.rental_id` — demeure
-- intacte. L'utilisateur autorisé retrouve la référence par cette relation, et
-- sous la capacité qui la garde. Rien n'est perdu ; seule la fuite est fermée.
-- =============================================================================


-- =============================================================================
-- 1. `convert_sales_quote_to_order` — « Convertie en commande »
--
-- Dernière version active : migration 097
-- (`20260923000100_commerce_client_devis_et_commandes.sql`).
--
-- Plutôt que de recopier ici un corps de cent trente lignes — et risquer d'y
-- perdre une capacité au passage, ce que le LOT 22 a déjà coûté — la migration
-- REPREND la définition vivante et n'y remplace que la chaîne fautive.
--
-- C'est la seule technique qui garantit qu'aucun autre comportement ne bouge :
-- le texte de départ n'est pas une version d'archive, c'est ce que la base
-- exécute à l'instant où la migration s'applique.
-- =============================================================================

do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef(
    'public.convert_sales_quote_to_order(uuid, date, date)'::regprocedure
  );

  if v_def not like '%status_reason     = ''Commande '' || v_no,%' then
    raise exception
      '`convert_sales_quote_to_order` n''écrit pas la concaténation attendue : la dette a changé de forme, corriger à la main plutôt qu''en aveugle.';
  end if;

  v_new := replace(
    v_def,
    'status_reason     = ''Commande '' || v_no,',
    'status_reason     = ''Convertie en commande'','
  );

  execute v_new;
end $$;

comment on function public.convert_sales_quote_to_order(uuid, date, date) is
  'Convertit un devis client en commande. Le motif du devis dit le FAIT, jamais la référence de la commande : celle-ci se demande à `commerce.sales_orders.view`.';


-- =============================================================================
-- 2. `set_sales_order_status` — « Commande annulée »
--
-- Le devis rendu à « Retenu » quand sa commande est annulée. Le motif écrit sur
-- le DEVIS ne nomme plus la commande.
-- =============================================================================

do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef(
    'public.set_sales_order_status(uuid, order_status, text)'::regprocedure
  );

  if v_def not like '%status_reason     = ''Commande '' || o.order_no || '' annulée'',%' then
    raise exception
      '`set_sales_order_status` n''écrit pas la concaténation attendue : la dette a changé de forme.';
  end if;

  v_new := replace(
    v_def,
    'status_reason     = ''Commande '' || o.order_no || '' annulée'',',
    'status_reason     = ''Commande annulée'','
  );

  execute v_new;
end $$;

comment on function public.set_sales_order_status(uuid, order_status, text) is
  'Fait passer une commande client d''un état à l''autre. Le motif rendu au devis dit le FAIT, jamais la référence de la commande.';


-- =============================================================================
-- 3. `cancel_customer_invoice` — « Facture annulée », DEUX FOIS
--
-- Dernière version active : migration 098
-- (`20260923000200_facturer_une_commande_client.sql`).
--
-- Elle écrit sur DEUX porteurs différents, et les deux fuyaient :
--
--   · `rentals.status_reason`      — ouvert par `rental.rentals.view` ;
--   · `sales_orders.status_reason` — ouvert par `commerce.sales_orders.view`.
--
-- Dans les deux cas le texte livrait `FAC-C-…`, que garde
-- `billing.customer_invoices.view`. Le remplacement est global sur la
-- définition : les deux occurrences sont identiques, et les deux doivent
-- tomber. Un `replace` qui n'en corrigerait qu'une laisserait la moitié de la
-- fuite ouverte — le contrôle final le vérifie.
-- =============================================================================

do $$
declare
  v_def text;
  v_new text;
  v_n   int;
begin
  v_def := pg_get_functiondef(
    'public.cancel_customer_invoice(uuid, text)'::regprocedure
  );

  v_n := (length(v_def) - length(replace(v_def, 'status_reason     = ''Facture '' || f.invoice_no || '' annulée'',', '')))
         / length('status_reason     = ''Facture '' || f.invoice_no || '' annulée'',');

  if v_n <> 2 then
    raise exception
      '`cancel_customer_invoice` porte % occurrence(s) de la concaténation au lieu de 2 : la dette a changé de forme.', v_n;
  end if;

  v_new := replace(
    v_def,
    'status_reason     = ''Facture '' || f.invoice_no || '' annulée'',',
    'status_reason     = ''Facture annulée'','
  );

  execute v_new;
end $$;

comment on function public.cancel_customer_invoice(uuid, text) is
  'Annule une facture client sans l''effacer. Les motifs rendus à la location et à la commande disent le FAIT, jamais la référence de la facture.';


-- =============================================================================
-- 4. `create_invoice_from_sales_order` — les observations de la facture
--
-- Le pendant exact de ce que la migration 104 a corrigé côté fournisseur : la
-- facture naissait avec `notes = 'Commande ' || o.order_no`.
--
-- `customer_invoices.notes` s'ouvre par `billing.customer_invoices.view`. Un
-- comptable sans `commerce.sales_orders.view` y lisait la référence de la
-- commande. Le lien `customer_invoices.sales_order_id` la porte déjà, sous la
-- capacité qui la garde.
-- =============================================================================

do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef(
    'public.create_invoice_from_sales_order(uuid, date, date)'::regprocedure
  );

  if v_def not like '%p_notes             => ''Commande '' || o.order_no,%' then
    raise exception
      '`create_invoice_from_sales_order` n''écrit pas la concaténation attendue : la dette a changé de forme.';
  end if;

  v_new := replace(
    v_def,
    'p_notes             => ''Commande '' || o.order_no,',
    'p_notes             => ''Facture issue d''''une commande client'','
  );

  execute v_new;
end $$;

comment on function public.create_invoice_from_sales_order(uuid, date, date) is
  'Prépare une facture client À PARTIR des fonctions existantes. Ses observations ne portent aucune référence du menu voisin.';


-- =============================================================================
-- 5. CONTRÔLES
--
-- Ils cherchent la CONCATÉNATION, pas le mot.
--
-- C'est la leçon de la migration 104 : une chaîne littérale qui mentionne
-- « commande » ou « facture » reste parfaitement légitime — « Convertie en
-- commande » en est une. Ce qui est interdit, c'est d'assembler une référence.
--
-- Et ils évitent l'apostrophe dans les motifs `like` — leçon de la migration
-- 100, où elle avait fait échouer un contrôle pourtant juste.
-- =============================================================================

do $$
declare
  v_def text;
  v_fn  text;
begin
  -- ------------------------------------------------- plus aucune concaténation
  foreach v_fn in array array[
    'public.convert_sales_quote_to_order(uuid, date, date)',
    'public.set_sales_order_status(uuid, order_status, text)',
    'public.cancel_customer_invoice(uuid, text)',
    'public.create_invoice_from_sales_order(uuid, date, date)'
  ] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);

    /*
     * Le motif cherché est la CONCATÉNATION ELLE-MÊME, littéralement : un
     * apostrophe fermant, un espace, `||`. Pas « un "Commande" quelque part,
     * puis un "||" quelque part » — les jokers de `like` s'étendent sur tout le
     * reste de la définition, et une telle formule accuserait n'importe quelle
     * fonction qui contient les deux à des endroits sans rapport.
     *
     * Un littéral qui MENTIONNE une commande reste légitime : « Convertie en
     * commande » en est un. Ce qui est interdit, c'est d'y coller une valeur.
     */
    if v_def like '%''Commande '' || %' then
      raise exception
        '% assemble encore une référence de commande.', v_fn;
    end if;

    if v_def like '%''Facture '' || %' then
      raise exception
        '% assemble encore une référence de facture.', v_fn;
    end if;
  end loop;

  -- ------------------------------------------------------- le fait est bien dit
  v_def := pg_get_functiondef('public.convert_sales_quote_to_order(uuid, date, date)'::regprocedure);
  if v_def not like '%Convertie en commande%' then
    raise exception
      'Le devis converti ne porte plus aucun motif : le fait doit être dit, c''est la référence qui ne doit pas l''être.';
  end if;

  v_def := pg_get_functiondef('public.set_sales_order_status(uuid, order_status, text)'::regprocedure);
  if v_def not like '%Commande annulée%' then
    raise exception
      'Le devis rendu à « Retenu » ne porte plus aucun motif.';
  end if;

  v_def := pg_get_functiondef('public.cancel_customer_invoice(uuid, text)'::regprocedure);
  if v_def not like '%Facture annulée%' then
    raise exception
      'La location ou la commande rendue ne porte plus aucun motif.';
  end if;

  v_def := pg_get_functiondef('public.create_invoice_from_sales_order(uuid, date, date)'::regprocedure);
  if v_def not like '%Facture issue d%une commande client%' then
    raise exception
      'La facture issue d''une commande client ne porte plus aucune observation.';
  end if;

  -- --------------------------------------- le LIEN STRUCTUREL n'a pas bougé
  --
  -- La correction ferme une fuite ; elle ne doit rien retirer. C'est par ces
  -- colonnes que l'utilisateur AUTORISÉ retrouve la référence.
  -- Le lien devis ↔ commande est porté par la COMMANDE (`sales_orders`), et non
  -- par le devis : c'est la commande qui naît d'un devis, pas l'inverse.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sales_orders'
      and column_name = 'sales_quote_id'
  ) then
    raise exception
      '`sales_orders.sales_quote_id` a disparu : la référence ne serait plus retrouvable, même avec la capacité.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_invoices'
      and column_name = 'sales_order_id'
  ) then
    raise exception
      '`customer_invoices.sales_order_id` a disparu.';
  end if;

  -- ------------------------------------- le commerce client n'a pas bougé AILLEURS
  --
  -- brief §10 : corriger UNIQUEMENT cette dette.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'customer_invoices_one_per_order_idx'
  ) then
    raise exception
      'L''index d''unicité du commerce CLIENT a disparu : DEC-053 ne porte que sur le fournisseur, et cette migration ne porte que sur la confidentialité.';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname like 'sales_orders_one_per_quote%'
  ) then
    raise exception
      'L''index d''unicité devis client → commande a disparu.';
  end if;
end $$;
