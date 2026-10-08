-- =============================================================================
-- ADIKOM PILOT — 122 · Valoriser plus tard les coûts manquants d'une vente
-- LOT 28 — décision Q-13 de la Direction (8 octobre 2026), DEC-055
--
-- Le caissier ne lit jamais les coûts : `record_pos_sale` ne copie le coût que
-- si le vendeur peut le lire (migration 118). Sans autre voie, presque toutes
-- les ventes auraient une marge « inconnue » pour toujours.
--
-- Q-13 : un utilisateur qui détient `catalog.services.cost.view` ET
-- `catalog.services.cost.update` valorise APRÈS COUP les lignes sans coût :
--
--   value_pos_sale_costs(vente?)  → nombre de lignes valorisées
--
--   · le coût est celui EN VIGUEUR AU JOUR DE LA VENTE (D16, `resolve_service_cost`),
--     jamais celui d'aujourd'hui ;
--   · seules les lignes SANS coût sont valorisées : un coût copié ne se réécrit
--     pas (garde de la migration 116), il n'est jamais remplacé ;
--   · une ligne sans version de coût en vigueur ce jour-là RESTE sans coût : sa
--     marge reste « inconnue », jamais fictive ;
--   · le prix de vente, les remises, les paiements : rien ne bouge ;
--   · chaque coût porte son auteur et sa date (`created_by`, `created_at`) et
--     entre au journal (`commercial_line_costs_audit`, détail gardé par
--     `catalog.services.cost.view`).
--
-- Aucune capacité nouvelle : valoriser un coût relève de qui saisit les prix
-- d'achat (`catalog.services.cost.update`) et les lit (`.cost.view`). Catalogue
-- 246, sauvegarde 69 : inchangés.
--
-- 🟥 AUCUNE FONCTION `SECURITY DEFINER` : la fonction lit et écrit sous les
-- droits de l'appelant, qui doit précisément pouvoir lire les coûts.
-- =============================================================================


-- =============================================================================
-- 1. L'ÉCRITURE DU COÛT — reprise de sa dernière version (migration 116)
--
-- Le vendeur qui lit les coûts les copie à la vente (`pos.sales.create`) ; le
-- gestionnaire des coûts les valorise après coup (`catalog.services.cost.update`).
-- Dans les deux cas, la lecture des coûts est exigée.
-- =============================================================================

drop policy if exists commercial_line_costs_insert on public.commercial_line_costs;

create policy commercial_line_costs_insert on public.commercial_line_costs
  for insert to authenticated
  with check (
    (select public.has_permission('catalog.services.cost.view'))
    and (
      (select public.has_permission('pos.sales.create'))
      or (select public.has_permission('catalog.services.cost.update'))
    )
  );


-- =============================================================================
-- 2. VALORISER
-- =============================================================================

create or replace function public.value_pos_sale_costs(p_sale_id uuid default null)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  l         record;
  v_status  public.pos_sale_status;
  v_cost_id uuid;
  v_cost    bigint;
  v_n       integer := 0;
  v_rows    integer;
begin
  perform public.require_capability(array['catalog.services.cost.update'], 'valoriser le coût des ventes');
  -- Une garde qui compte doit compter la vérité : sans cette lecture, « aucun
  -- coût copié » serait un mensonge, et la ligne serait valorisée deux fois.
  perform public.require_capability(array['catalog.services.cost.view'], 'lire les coûts déjà copiés');
  perform public.require_capability(array['pos.sales.view'], 'consulter les ventes à valoriser');

  if p_sale_id is not null then
    select s.status into v_status from public.pos_sales s where s.id = p_sale_id;
    if v_status is null then
      raise exception 'Vente introuvable ou non lisible avec vos droits.' using errcode = 'no_data_found';
    end if;
    if v_status <> 'VALIDATED' then
      raise exception 'Opération refusée : une vente annulée ne se valorise pas.' using errcode = 'check_violation';
    end if;
  end if;

  for l in
    select pl.id, pl.service_variant_id, s.sale_date
    from public.pos_sale_lines pl
    join public.pos_sales s on s.id = pl.pos_sale_id
    where (p_sale_id is null or s.id = p_sale_id)
      and s.status = 'VALIDATED'
      and not exists (
        select 1 from public.commercial_line_costs c where c.pos_sale_line_id = pl.id
      )
    order by s.sold_at, pl.line_no
  loop
    v_cost_id := null;
    v_cost    := null;

    -- Le coût EN VIGUEUR LE JOUR DE LA VENTE — jamais celui d'aujourd'hui.
    select c.cost_id, c.amount into v_cost_id, v_cost
    from public.resolve_service_cost(l.service_variant_id, l.sale_date) c;

    if v_cost_id is not null and v_cost > 0 then
      perform set_config('adikom.pos_sale', 'on', true);

      insert into public.commercial_line_costs (pos_sale_line_id, service_cost_id, unit_cost, created_by)
      values (l.id, v_cost_id, v_cost, public.current_actor())
      on conflict (pos_sale_line_id) do nothing;

      get diagnostics v_rows = row_count;

      perform set_config('adikom.pos_sale', 'off', true);

      v_n := v_n + v_rows;
    end if;
  end loop;

  return v_n;
end;
$$;

comment on function public.value_pos_sale_costs(uuid) is
  'Q-13 : valorise après coup les lignes vendues SANS coût copié, au coût en vigueur le jour de la vente. Ne remplace jamais un coût copié ; une ligne sans coût en vigueur reste « inconnue ». Exige catalog.services.cost.update et .cost.view.';

revoke execute on function public.value_pos_sale_costs(uuid) from public, anon;
grant  execute on function public.value_pos_sale_costs(uuid) to authenticated, service_role;


-- =============================================================================
-- 3. CONTRÔLES
-- =============================================================================

do $$
declare
  v_def text;
begin
  if (select prosecdef from pg_proc where oid = 'public.value_pos_sale_costs(uuid)'::regprocedure) then
    raise exception 'value_pos_sale_costs est SECURITY DEFINER (D4).';
  end if;

  v_def := pg_get_functiondef('public.value_pos_sale_costs(uuid)'::regprocedure);
  if v_def not like '%catalog.services.cost.update%'
     or v_def not like '%catalog.services.cost.view%'
     or v_def not like '%adikom.pos_sale'', ''off''%'
     or v_def not like '%l.sale_date%' then
    raise exception 'value_pos_sale_costs a perdu une capacité, son drapeau refermé ou la date de la vente.';
  end if;

  if has_function_privilege('anon', 'public.value_pos_sale_costs(uuid)', 'EXECUTE') then
    raise exception 'anon peut valoriser des coûts.';
  end if;

  -- La lecture des coûts reste réservée à `catalog.services.cost.view`.
  select pg_get_expr(polqual, polrelid) into v_def
  from pg_policy where polname = 'commercial_line_costs_select';
  if v_def not like '%catalog.services.cost.view%' or v_def like '%pos.sales%' then
    raise exception 'La lecture des coûts copiés ne relève plus de catalog.services.cost.view seule : %', v_def;
  end if;

  if (select count(*) from public.permissions) <> 246 then
    raise exception 'Catalogue attendu à 246 permissions.';
  end if;

  raise notice '[OK] 122. Q-13 : valorisation au jour de la vente, sans remplacement ni SECURITY DEFINER ; lecture des coûts inchangée.';
end $$;
