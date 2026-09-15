-- =============================================================================
-- ADIKOM PILOT — 085 · Résolution des coûts fournisseurs par lot
-- LOT 21 — DEC-044
--
-- LE PROBLÈME
--
-- L'écran « Tarifs fournisseurs » présente le parc et, en regard de chaque
-- véhicule, le coût d'acquisition APPLICABLE à une date. Résolu véhicule par
-- véhicule, cela ferait un aller-retour par ligne — la même faute que
-- `has_permission` évaluée par ligne dans une policy (migration 065).
--
-- LA FAUSSE BONNE SOLUTION
--
-- Refaire le prédicat de résolution en TypeScript, dans la couche de données.
-- Ce serait une SECONDE IMPLÉMENTATION de D16(c) : deux écrans pourraient alors
-- répondre différemment à « quel coût s'appliquait le 15 septembre ? », et rien
-- n'empêcherait la divergence. `03_Modules/05` §20 l'interdit explicitement pour
-- le tarif client — « la règle définitive doit être centralisée et ne doit pas
-- être réinventée différemment dans chaque écran » —, et la raison vaut ici.
--
-- CE QUE CETTE FONCTION FAIT
--
-- Elle APPELLE `resolve_supplier_rate` en jointure latérale, une fois par
-- véhicule, dans une seule requête. Le prédicat reste écrit UNE FOIS, dans le
-- résolveur du Plan 02 §5.4. Cette fonction ne connaît pas la règle : elle la
-- pose sur une liste.
--
-- `left join lateral … on true` : un véhicule SANS coût applicable reste dans la
-- liste, avec des colonnes nulles. C'est précisément ce que l'écran doit
-- montrer — « aucun coût renseigné à cette date » est une information, pas une
-- ligne à masquer (DEC-008, DEC-017).
--
-- `SECURITY INVOKER` (défaut) : les deux policies s'appliquent à l'appelant.
-- Sans `rental.fleet.view`, aucun véhicule. Sans `rental.pricing.supplier.view`,
-- des véhicules SANS coût — jamais un coût qui aurait dû rester fermé.
-- =============================================================================

create or replace function public.resolve_supplier_rates(
  p_on date default (now() at time zone 'Indian/Comoro')::date
)
returns table (
  vehicle_id    uuid,
  rate_id       uuid,
  supplier_id   uuid,
  amount        bigint,
  unit          public.pricing_unit,
  currency_code text,
  valid_from    date,
  valid_to      date,
  conditions    text
)
language sql
stable
set search_path = public, pg_temp
as $$
  select v.id,
         r.rate_id, r.supplier_id, r.amount, r.unit, r.currency_code,
         r.valid_from, r.valid_to, r.conditions
  from public.vehicles v
  left join lateral public.resolve_supplier_rate(v.id, p_on) r on true;
$$;

comment on function public.resolve_supplier_rates(date) is
  'Coût d''acquisition applicable à une date, pour chaque véhicule lisible. Appelle `resolve_supplier_rate` : le prédicat de D16(c) n''est écrit qu''une fois. Un véhicule sans coût reste dans la liste, colonnes nulles.';

revoke execute on function public.resolve_supplier_rates(date) from public, anon;
grant  execute on function public.resolve_supplier_rates(date) to authenticated, service_role;


-- =============================================================================
-- CONTRÔLES
-- =============================================================================

do $$
begin
  if exists (
    select 1 from pg_proc
    where oid = 'public.resolve_supplier_rates(date)'::regprocedure and prosecdef
  ) then
    raise exception 'resolve_supplier_rates est SECURITY DEFINER (doctrine D4).';
  end if;

  if has_function_privilege('anon', 'public.resolve_supplier_rates(date)', 'execute') then
    raise exception 'anon peut exécuter resolve_supplier_rates.';
  end if;

  -- La fonction DÉLÈGUE : si elle cessait d'appeler le résolveur, le prédicat
  -- serait recopié quelque part, et la divergence commencerait là.
  if not exists (
    select 1 from pg_proc
    where oid = 'public.resolve_supplier_rates(date)'::regprocedure
      and prosrc like '%resolve_supplier_rate(%'
  ) then
    raise exception
      'resolve_supplier_rates n''appelle plus resolve_supplier_rate : le prédicat de résolution serait dupliqué.';
  end if;

  raise notice '[OK] 085. Résolution par lot, sans duplication du prédicat.';
end $$;
