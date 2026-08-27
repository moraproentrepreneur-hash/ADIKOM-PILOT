-- =============================================================================
-- ADIKOM PILOT — 042 · Harmonisation des gardes de maintenance
--
-- CE QUE L'AUDIT A TROUVÉ
--
-- La migration 040 avait posé les trois premières gardes en appelant
-- `has_permission` directement. Correct pour un utilisateur, faux pour tout le
-- reste : `auth.uid()` est NULL hors session applicative — migration, script
-- d'environnement, recette SQL — et la garde refusait alors des opérations
-- parfaitement légitimes.
--
-- La recette `db:verify:maintenance` l'a montré immédiatement : elle échouait
-- sur `immobilize_maintenance`, non par défaut de sécurité mais par excès. Une
-- barrière qui bloque aussi les usages légitimes n'est pas une barrière, c'est
-- une panne — et elle finit par être contournée.
--
-- LA CORRECTION
--
-- Les trois fonctions passent par `require_capability` (migration 041), qui
-- porte la même exigence ET l'exemption hors session applicative, exactement
-- comme `fn_forbid_delete` depuis la migration 021. Une seule garde dans tout
-- le projet, un seul comportement, une seule chose à relire.
--
-- Les corps sont repris de leur définition RÉELLE en base, non réécrits : seule
-- la ligne de garde change.
--
-- Aucune règle métier ne change. Aucune permission n'est créée : 152.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.immobilize_maintenance(p_maintenance_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  m        public.vehicle_maintenances%rowtype;
  v_period tstzrange;
begin
  perform public.require_capability(array['rental.maintenance.update'], 'immobiliser un véhicule pour maintenance');

  select * into m from public.vehicle_maintenances where id = p_maintenance_id for update;

  if not found then
    raise exception 'Maintenance introuvable.' using errcode = 'no_data_found';
  end if;

  if m.status in ('COMPLETED', 'CANCELLED') then
    raise exception
      'Opération refusée : une maintenance terminée ou annulée ne s''immobilise plus.'
      using errcode = 'check_violation';
  end if;

  if m.immobilization_period is not null then
    raise exception
      'Opération refusée : cette maintenance immobilise déjà le véhicule.'
      using errcode = 'check_violation';
  end if;

  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Une immobilisation exige une période valide.'
      using errcode = 'check_violation';
  end if;

  v_period := tstzrange(p_from, p_to, '[)');

  update public.vehicle_maintenances
     set immobilization_period = v_period,
         updated_by            = public.current_actor()
   where id = m.id;

  perform public.fn_apply_maintenance_block(m.id, m.vehicle_id, v_period, m.maintenance_no);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_maintenance(p_maintenance_id uuid, p_completed_at timestamp with time zone DEFAULT now(), p_intervention text DEFAULT NULL::text, p_observations text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  m public.vehicle_maintenances%rowtype;
begin
  -- `close` ne s'obtient pas par `update` : c'est l'acte qui atteste du
  -- contrôle après intervention et rend le véhicule au parc.
  perform public.require_capability(array['rental.maintenance.close'], 'terminer une maintenance');

  select * into m from public.vehicle_maintenances where id = p_maintenance_id for update;

  if not found then
    raise exception 'Maintenance introuvable.' using errcode = 'no_data_found';
  end if;

  if m.status <> 'IN_PROGRESS' then
    raise exception
      'Opération refusée : seule une maintenance en cours peut être terminée après contrôle.'
      using errcode = 'check_violation';
  end if;

  update public.vehicle_maintenances
     set status            = 'COMPLETED',
         completed_at      = coalesce(p_completed_at, now()),
         intervention      = nullif(btrim(coalesce(p_intervention, '')), ''),
         observations      = nullif(btrim(coalesce(p_observations, '')), ''),
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = m.id;

  perform public.fn_release_maintenance_block(m.id, m.vehicle_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_maintenance(p_maintenance_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  m public.vehicle_maintenances%rowtype;
begin
  perform public.require_capability(array['rental.maintenance.update'], 'annuler une maintenance');

  select * into m from public.vehicle_maintenances where id = p_maintenance_id for update;

  if not found then
    raise exception 'Maintenance introuvable.' using errcode = 'no_data_found';
  end if;

  if m.status in ('COMPLETED', 'CANCELLED') then
    raise exception
      'Opération refusée : cette maintenance ne peut plus être annulée.'
      using errcode = 'check_violation';
  end if;

  update public.vehicle_maintenances
     set status            = 'CANCELLED',
         status_reason     = p_reason,
         status_changed_at = now(),
         status_changed_by = public.current_actor(),
         updated_by        = public.current_actor()
   where id = m.id;

  perform public.fn_release_maintenance_block(m.id, m.vehicle_id);
end;
$function$
;