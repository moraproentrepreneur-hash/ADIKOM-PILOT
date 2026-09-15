-- =============================================================================
-- ADIKOM PILOT — 086 · Résolution du tarif client standard par lot
-- LOT 21 — DEC-044
--
-- POURQUOI CETTE FONCTION, SYMÉTRIQUE DE LA 085
--
-- L'écran « Tarifs fournisseurs » met deux montants côte à côte : ce qu'ADIKOM
-- PAIE, et ce qu'ADIKOM FACTURE au barème. Le premier est résolu par lot depuis
-- la migration 085. Le second l'était véhicule par véhicule — un aller-retour
-- par ligne, la faute que la 085 venait précisément de corriger.
--
-- CE QU'ELLE NE FAIT PAS, ET C'EST L'ESSENTIEL
--
--   · Elle NE MODIFIE PAS `resolve_pricing_rule` : celle-ci reste intacte, et
--     `supabase/tests/location.sql` se rejoue sans modification (Plan 02 §20.1,
--     garantie n° 1). Cette fonction l'APPELLE en jointure latérale.
--   · Elle NE FUSIONNE PAS les deux domaines. Le coût fournisseur et le tarif
--     client restent résolus par deux fonctions distinctes, gardées par deux
--     capacités distinctes. Une fonction unique qui rendrait les deux ferait
--     dépendre la confidentialité du coût de la policy des tarifs clients —
--     exactement ce que la table séparée sert à éviter (Plan 02 §6.3).
--
-- `p_client_id = null` : c'est le tarif du BARÈME, celui qui vaut à défaut de
-- condition particulière. Une condition consentie à un client donné ne se lit
-- pas sur un écran qui ne parle d'aucun client — et `resolve_pricing_rule`
-- n'en retient aucune lorsque le client est nul.
--
-- `SECURITY INVOKER` (défaut) : sans droit de lecture des tarifs, la fonction
-- appelée ne rend rien, et la colonne reste vide. Aucune commission n'est alors
-- calculée, et l'écran dit pourquoi.
-- =============================================================================

create or replace function public.resolve_standard_prices(
  p_on date default (now() at time zone 'Indian/Comoro')::date
)
returns table (
  vehicle_id uuid,
  rule_id    uuid,
  amount     bigint,
  unit       public.pricing_unit,
  source     text
)
language sql
stable
set search_path = public, pg_temp
as $$
  select v.id, p.rule_id, p.amount, p.unit, p.source
  from public.vehicles v
  left join lateral public.resolve_pricing_rule(null::uuid, v.id, p_on) p on true;
$$;

comment on function public.resolve_standard_prices(date) is
  'Tarif client STANDARD applicable à une date, pour chaque véhicule lisible. Appelle `resolve_pricing_rule` sans client : DEC-002 n''est écrite qu''une fois. Un véhicule sans tarif reste dans la liste, colonnes nulles.';

revoke execute on function public.resolve_standard_prices(date) from public, anon;
grant  execute on function public.resolve_standard_prices(date) to authenticated, service_role;


-- =============================================================================
-- CONTRÔLES
-- =============================================================================

do $$
begin
  if exists (
    select 1 from pg_proc
    where oid = 'public.resolve_standard_prices(date)'::regprocedure and prosecdef
  ) then
    raise exception 'resolve_standard_prices est SECURITY DEFINER (doctrine D4).';
  end if;

  if has_function_privilege('anon', 'public.resolve_standard_prices(date)', 'execute') then
    raise exception 'anon peut exécuter resolve_standard_prices.';
  end if;

  -- Elle DÉLÈGUE : si elle cessait d'appeler le résolveur, DEC-002 serait
  -- recopiée quelque part, et la divergence commencerait là.
  if not exists (
    select 1 from pg_proc
    where oid = 'public.resolve_standard_prices(date)'::regprocedure
      and prosrc like '%resolve_pricing_rule(%'
  ) then
    raise exception
      'resolve_standard_prices n''appelle plus resolve_pricing_rule : DEC-002 serait dupliquée.';
  end if;

  -- Le résolveur d'origine est INTACT — aucune signature nouvelle, aucune
  -- réécriture (Plan 02 §20.1, garantie n° 1).
  if (select count(*) from pg_proc where proname = 'resolve_pricing_rule') <> 1 then
    raise exception
      '`resolve_pricing_rule` n''existe plus en un seul exemplaire : le LOT 21 ne doit pas y toucher.';
  end if;

  raise notice '[OK] 086. Tarif standard résolu par lot, sans duplication de DEC-002.';
end $$;
