-- =============================================================================
-- ADIKOM PILOT — 048 · Une facture fournisseur ne s'enregistre pas deux fois
-- Étape 2.5 (DEC-021), complément du LOT 5
--
-- CE QUE CETTE MIGRATION POSE
--
-- L'arbitrage rendu par ADIKOM sur DEC-027 §i : la référence portée par le
-- document du fournisseur est UNIQUE POUR CE FOURNISSEUR.
--
--   · Deux fournisseurs différents peuvent porter la même référence — leurs
--     numérotations sont indépendantes, et rien ne les coordonne.
--   · Une seconde facture du MÊME fournisseur portant la MÊME référence est
--     refusée par la base, avec un message qui dit laquelle existe déjà.
--
-- POURQUOI DEUX COUCHES, ET NON UNE
--
--   1. Un DÉCLENCHEUR, qui refuse en NOMMANT la facture existante. C'est ce
--      qu'un utilisateur doit lire : « FAC-F-2026-000012 porte déjà cette
--      référence », et non un code d'erreur PostgreSQL.
--   2. Un INDEX UNIQUE, qui rend la règle infalsifiable. Le déclencheur LIT
--      `supplier_invoices` : un appelant sans `billing.supplier_invoices.view`
--      ne verrait rien et passerait. Ici — contrairement au plafond du LOT 4 —
--      une vérification aveugle est sans danger : l'index, lui, ne dépend
--      d'aucun droit de lecture et arrête l'écriture de toute façon.
--      Il ferme aussi la course entre deux saisies simultanées, qu'aucun
--      déclencheur ne peut voir.
--
-- LA PORTÉE EXCLUT LES FACTURES ANNULÉES — ET POURQUOI
--
-- La règle existe pour empêcher d'enregistrer DEUX FOIS la même dette, donc de
-- la payer deux fois. Une facture annulée n'est plus une dette : elle ne reçoit
-- plus d'imputation, et ne sera jamais réglée.
--
-- L'y inclure créerait une impasse : rien ne se supprime dans ce système
-- (CLAUDE.md §22), et corriger une saisie erronée passe par l'annulation puis
-- une nouvelle saisie — qui porte forcément la MÊME référence, celle imprimée
-- sur le document reçu. La règle interdirait exactement la correction qu'elle
-- rend nécessaire.
--
-- C'est le traitement déjà retenu pour les imputations annulées, qui sortent du
-- plafond de Workflow 06 §40 : ce qui est annulé cesse de compter.
--
-- LA COMPARAISON IGNORE LA CASSE ET LES ESPACES DE BORDURE
--
-- « FRN-2026-77 » et « frn-2026-77 » sont la même référence sur le document
-- reçu. Une règle sensible à la casse laisserait passer précisément le doublon
-- qu'elle prétend interdire.
--
-- La valeur STOCKÉE reste celle qui a été saisie : seule la COMPARAISON est
-- normalisée. Le système n'écrit jamais autre chose que ce qu'il a lu.
-- =============================================================================


-- --- L'index : la garantie qui ne dépend d'aucun droit ----------------------------

create unique index supplier_invoices_external_ref_unique
  on public.supplier_invoices (supplier_id, upper(btrim(external_ref)))
  where external_ref is not null and status <> 'CANCELLED';

comment on index public.supplier_invoices_external_ref_unique is
  'Une référence fournisseur ne se répète pas chez le même fournisseur (DEC-028). Les factures annulées en sont exclues : elles ne sont plus des dettes.';


-- --- Le déclencheur : le refus qui s'explique --------------------------------------

create or replace function public.fn_supplier_invoice_reference_unique()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_existing text;
  v_changed  boolean;
begin
  -- Aucune référence : rien à comparer. §30 la rend facultative — une facture
  -- reçue sans référence lisible reste une facture à payer.
  if new.external_ref is null then
    return new;
  end if;

  -- Une facture annulée sort de la règle, dans un sens comme dans l'autre.
  if new.status = 'CANCELLED' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_changed := true;
  else
    v_changed := upper(btrim(new.external_ref)) is distinct from upper(btrim(coalesce(old.external_ref, '')))
                 or new.supplier_id is distinct from old.supplier_id
                 or (old.status = 'CANCELLED' and new.status <> 'CANCELLED');
  end if;

  if not v_changed then
    return new;
  end if;

  select f.invoice_no into v_existing
  from public.supplier_invoices f
  where f.supplier_id = new.supplier_id
    and f.id <> new.id
    and f.status <> 'CANCELLED'
    and f.external_ref is not null
    and upper(btrim(f.external_ref)) = upper(btrim(new.external_ref))
  limit 1;

  if v_existing is not null then
    raise exception
      'Opération refusée : la facture % de ce fournisseur porte déjà la référence « % ». Une même facture ne s''enregistre pas deux fois.',
      v_existing, btrim(new.external_ref)
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_supplier_invoice_reference_unique is
  'Refuse un doublon de référence chez un même fournisseur en NOMMANT la facture existante (DEC-028). L''index unique fait la garantie ; ceci fait le message.';

/*
 * Le déclencheur porte un nom qui le place APRÈS `supplier_invoices_starts_draft`
 * et `supplier_invoices_transition` dans l'ordre alphabétique d'exécution : un
 * état de départ ou une transition invalide se signale d'abord, la référence
 * ensuite. Une facture refusée pour deux raisons doit nommer la plus
 * structurante.
 */
create trigger supplier_invoices_zz_reference_unique
  before insert or update on public.supplier_invoices
  for each row execute function public.fn_supplier_invoice_reference_unique();


-- =============================================================================
-- CONTRÔLE DE NON-RÉGRESSION
--
-- Aucune permission n'est créée : une règle d'intégrité n'est pas une capacité.
-- =============================================================================

do $$
declare
  v_total int;
begin
  select count(*) into v_total from public.permissions;

  if v_total <> 153 then
    raise exception 'Catalogue attendu à 153 permissions, obtenu %.', v_total;
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'supplier_invoices_external_ref_unique'
  ) then
    raise exception 'L''index d''unicité de la référence fournisseur est absent.';
  end if;
end $$;
