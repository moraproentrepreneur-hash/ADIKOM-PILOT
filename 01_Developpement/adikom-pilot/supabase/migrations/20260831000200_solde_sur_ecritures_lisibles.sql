-- =============================================================================
-- ADIKOM PILOT — 050 · Un solde ne se calcule pas sur des écritures illisibles
-- Étape 2.5 (DEC-021), correction du LOT 6
--
-- LE DÉFAUT, ET COMMENT IL A ÉTÉ TROUVÉ
--
-- `financial_account_balance` somme `treasury_entries` sous les droits de
-- l'appelant. La migration 049 n'exigeait que `treasury.balances.view` : un
-- porteur de cette seule capacité ne voyait AUCUNE écriture, et la fonction lui
-- renvoyait le solde initial — un nombre faux, présenté comme un solde.
--
-- L'audit des capacités l'a révélé : un compte débité de 120 000 KMF affichait
-- encore 1 000 000. Le contrôle attendait 880 000 ; il a obtenu le solde
-- d'ouverture, sans la moindre erreur.
--
-- C'est exactement la « somme muette » que le projet refuse depuis le LOT 4 :
-- « un plafond invisible n'est pas un plafond infini » (DEC-026 §f). Ici,
-- des écritures invisibles ne valent pas un compte immobile.
--
-- LA CORRECTION
--
-- `treasury.entries.view` est exigée EN PLUS. Ce n'est pas du zèle : c'est la
-- conséquence assumée du refus de `SECURITY DEFINER` (DEC-022). Une fonction
-- qui s'exécute avec les droits de l'appelant ne peut pas prétendre lire ce
-- qu'il n'a pas le droit de lire — elle doit REFUSER, jamais répondre à côté.
--
-- Conséquence : `treasury.balances.view` ne se donne pas seule. Elle reste une
-- capacité distincte — elle interdit le solde à qui ne l'a pas — mais elle
-- suppose de pouvoir lire les écritures dont le solde est la somme.
-- =============================================================================

create or replace function public.financial_account_balance(p_account_id uuid)
returns bigint
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_opening bigint;
  v_in      bigint;
  v_out     bigint;
begin
  perform public.require_capability(
    array['treasury.balances.view'], 'consulter le solde d''un compte financier'
  );
  perform public.require_capability(
    array['treasury.entries.view'], 'lire les écritures dont le solde est la somme'
  );

  select a.opening_balance into v_opening
  from public.financial_accounts a where a.id = p_account_id;

  if v_opening is null then
    return null;   -- compte introuvable, ou invisible : on n'invente pas un zéro
  end if;

  select
    coalesce(sum(e.amount) filter (where e.direction = 'IN'), 0),
    coalesce(sum(e.amount) filter (where e.direction = 'OUT'), 0)
  into v_in, v_out
  from public.treasury_entries e
  where e.account_id = p_account_id
    and e.status = 'VALIDATED';

  return v_opening + v_in - v_out;
end;
$$;

comment on function public.financial_account_balance(uuid) is
  'Solde initial + entrées − sorties, écritures validées seulement (Module 06 §17). Exige `balances.view` ET `entries.view` : une somme sur des écritures illisibles serait fausse.';

do $$
declare v_total int;
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 153 then
    raise exception 'Catalogue attendu à 153 permissions, obtenu %.', v_total;
  end if;
end $$;
