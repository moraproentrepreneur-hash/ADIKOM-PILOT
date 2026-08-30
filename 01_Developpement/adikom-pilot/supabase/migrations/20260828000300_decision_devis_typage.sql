-- =============================================================================
-- ADIKOM PILOT — 045 · Typage de la décision sur un devis
--
-- CE QUE LA RECETTE A TROUVÉ
--
-- `case when p_accept then 'ACCEPTED' else 'REFUSED' end` produit du `text`,
-- que PostgreSQL refuse d'affecter à une colonne `quote_status`. La fonction
-- échouait donc à la première décision — panne franche, trouvée avant tout
-- déploiement par `db:verify:maintenance-costs`.
--
-- Le cast explicite règle le point. Aucune règle métier ne change : la fonction
-- exige toujours `rental.maintenance.validate`, refuse toujours de reprendre
-- une décision, et ne recopie toujours aucun montant.
-- =============================================================================

create or replace function public.decide_maintenance_quote(
  p_quote_id uuid,
  p_accept   boolean,
  p_reason   text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  q public.maintenance_quotes%rowtype;
begin
  -- Arbitrage L2 : décider d'un devis engage l'intervention. C'est
  -- `validate` qui le porte, jamais `cost.update`.
  perform public.require_capability(
    array['rental.maintenance.validate'], 'accepter ou refuser un devis'
  );

  select * into q from public.maintenance_quotes where id = p_quote_id for update;

  if not found then
    raise exception 'Devis introuvable.' using errcode = 'no_data_found';
  end if;

  if q.status <> 'PROPOSED' then
    raise exception 'Opération refusée : ce devis a déjà été décidé.'
      using errcode = 'check_violation';
  end if;

  if p_accept is null then
    raise exception 'Il faut accepter ou refuser.' using errcode = 'check_violation';
  end if;

  /*
   * ACCEPTER UN DEVIS NE RECOPIE AUCUN MONTANT.
   *
   * Rien dans la documentation ne dit qu'un devis accepté devient le coût
   * estimé, ni le coût réel. Le déduire serait inventer une règle (DEC-008) —
   * et écrire dans `maintenance_costs` sous une capacité de validation, ce que
   * l'audit 041 nous a appris à ne jamais faire.
   */
  update public.maintenance_quotes
     set status          = (case when p_accept then 'ACCEPTED' else 'REFUSED' end)::public.quote_status,
         decided_at      = now(),
         decided_by      = public.current_actor(),
         decision_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_by      = public.current_actor()
   where id = q.id;
end;
$$;

comment on function public.decide_maintenance_quote is
  'Accepte ou refuse un devis (§27). Exige `rental.maintenance.validate`. Ne recopie aucun montant : aucune règle ne le prévoit.';
