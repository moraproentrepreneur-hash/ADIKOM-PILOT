-- =============================================================================
-- ADIKOM PILOT — 040 · Chaque acte de maintenance exige SA capacité
-- Étape 2.4, LOT 2 — correctif de sécurité
--
-- CE QUE LA RECETTE A TROUVÉ
--
-- Un compte doté de `rental.maintenance.update` mais PAS de
-- `rental.maintenance.close` pouvait terminer une maintenance en appelant
-- `complete_maintenance` directement, sans passer par l'écran.
--
-- L'écran, lui, était correct : il exige `close` et n'affiche rien sans elle.
-- Mais « masquer un bouton ne constitue pas une protection » (CLAUDE.md §19) —
-- et la fonction, appelée par PostgREST, ne rencontrait aucune barrière : la
-- policy d'UPDATE accepte `update` OU `validate` OU `close`, comme le veut la
-- convention de la migration 018, laquelle suppose qu'une garde serveur exige
-- ensuite la bonne. Or il n'y a pas de garde serveur sur le chemin direct.
--
-- Résultat : `close` était IMPLIQUÉE par `update`. C'est exactement ce que
-- DEC-024 interdit — « aucune fonctionnalité ne doit être implicitement
-- autorisée par une autre permission ».
--
-- LA CORRECTION
--
-- Chaque fonction atomique vérifie ELLE-MÊME la capacité qu'elle incarne. La
-- policy reste large — elle doit l'être, puisqu'une même table sert trois
-- actes — mais la fonction, elle, ne laisse plus passer que le sien.
--
-- Ce n'est pas une garde de confort ajoutée par-dessus RLS : c'est la seule
-- barrière qui distingue trois capacités que la table, seule, ne peut pas
-- distinguer.
--
-- CE QUI N'EST PAS FAIT
--
--   · `create_maintenance` n'a pas besoin de ce contrôle : elle INSÈRE, et la
--     policy d'insertion exige déjà `rental.maintenance.create`, sans
--     alternative. La barrière y est déjà exacte.
--   · Aucune fonction ne devient `security definer` : elles continuent de
--     s'exécuter avec les droits de l'appelant, RLS comprise.
--   · Aucune permission n'est créée. Catalogue : 152.
-- =============================================================================


create or replace function public.immobilize_maintenance(
  p_maintenance_id uuid,
  p_from           timestamptz,
  p_to             timestamptz
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  m        public.vehicle_maintenances%rowtype;
  v_period tstzrange;
begin
  if not public.has_permission('rental.maintenance.update') then
    raise exception 'Droit insuffisant : immobiliser un véhicule relève de la modification d''une maintenance.'
      using errcode = 'insufficient_privilege';
  end if;

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
$$;

comment on function public.immobilize_maintenance is
  'Pose l''immobilisation d''une maintenance déjà déclarée. Exige `rental.maintenance.update`, y compris en appel direct.';


create or replace function public.complete_maintenance(
  p_maintenance_id uuid,
  p_completed_at   timestamptz default now(),
  p_intervention   text        default null,
  p_observations   text        default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  m public.vehicle_maintenances%rowtype;
begin
  -- `close` ne s'obtient pas par `update` : c'est l'acte qui atteste du
  -- contrôle après intervention et rend le véhicule au parc.
  if not public.has_permission('rental.maintenance.close') then
    raise exception 'Droit insuffisant : terminer une maintenance exige la capacité de clôture.'
      using errcode = 'insufficient_privilege';
  end if;

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
$$;

comment on function public.complete_maintenance is
  'Termine une maintenance après contrôle satisfaisant. Exige `rental.maintenance.close`, y compris en appel direct (DEC-024).';


create or replace function public.cancel_maintenance(
  p_maintenance_id uuid,
  p_reason         text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  m public.vehicle_maintenances%rowtype;
begin
  if not public.has_permission('rental.maintenance.update') then
    raise exception 'Droit insuffisant : annuler une maintenance relève de sa modification.'
      using errcode = 'insufficient_privilege';
  end if;

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
$$;

comment on function public.cancel_maintenance is
  'Annule une maintenance et libère son immobilisation. Exige `rental.maintenance.update`, y compris en appel direct.';
