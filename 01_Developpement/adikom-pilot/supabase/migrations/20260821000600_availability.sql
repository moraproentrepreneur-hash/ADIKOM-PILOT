-- =============================================================================
-- ADIKOM PILOT — 016 · Disponibilité des véhicules
-- Étape 2.2 (DEC-021) — mise en œuvre de DEC-012
--
-- « Un véhicule ne doit jamais être attribué simultanément à deux locations
--   incompatibles. Cette règle constitue une contrainte fondamentale. »
--   — 05_Regles_Metier/01_Location.md §57 et §80.1
--
-- La garantie est portée par la BASE, pas par du code applicatif : deux saisies
-- simultanées par deux utilisateurs ne peuvent pas produire de conflit.
--
-- Toutes les origines de blocage — réservation, location, maintenance,
-- immobilisation — partagent une table unique. L'Étape 2.2 n'écrit que des
-- immobilisations ; les étapes 2.3 et 2.4 alimenteront les autres sources sans
-- modification de schéma.
-- =============================================================================

create table public.vehicle_occupations (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid        not null references public.vehicles (id) on delete cascade,

  source       public.occupation_source not null,
  -- Objet à l'origine du blocage : réservation, location ou maintenance.
  -- Reste nul pour une immobilisation saisie manuellement.
  source_id    uuid,

  period       tstzrange   not null,
  reason       text,

  -- Une réservation annulée ne bloque plus la disponibilité
  -- (05_Regles_Metier/01_Location.md §55). La ligne n'est pas supprimée :
  -- elle est libérée, afin de conserver la trace de ce qui a été bloqué.
  is_active    boolean     not null default true,
  released_at  timestamptz,
  released_by  uuid references public.app_users (id) on delete set null,

  created_at   timestamptz not null default now(),
  created_by   uuid references public.app_users (id) on delete set null,

  constraint vehicle_occupations_period_bounded check (
    not isempty(period)
    and lower(period) is not null
    and upper(period) is not null
  ),

  constraint vehicle_occupations_release_coherent check (
    is_active or released_at is not null
  ),

  -- Cœur de DEC-012 : deux périodes actives ne peuvent pas se chevaucher pour
  -- un même véhicule. L'opérateur `=` sur uuid exige la classe d'opérateurs
  -- fournie par btree_gist, installée dans le schéma `extensions` (migration
  -- 001). Elle est nommée explicitement pour ne pas dépendre du search_path.
  constraint vehicle_occupations_no_overlap exclude using gist (
    vehicle_id extensions.gist_uuid_ops with =,
    period with &&
  ) where (is_active)
);

comment on table public.vehicle_occupations is
  'Périodes durant lesquelles un véhicule est indisponible. La non-collision est garantie par contrainte d''exclusion (DEC-012).';
comment on column public.vehicle_occupations.is_active is
  'Une occupation libérée (réservation annulée, immobilisation levée) cesse de bloquer sans disparaître de l''historique.';

create index vehicle_occupations_vehicle_idx on public.vehicle_occupations (vehicle_id, is_active);
create index vehicle_occupations_period_idx  on public.vehicle_occupations using gist (period);
create index vehicle_occupations_source_idx  on public.vehicle_occupations (source, source_id);

create trigger vehicle_occupations_audit
  after insert or update on public.vehicle_occupations
  for each row execute function public.fn_audit_row('rental');

-- Une occupation se libère, elle ne s'efface pas : l'historique des périodes
-- bloquées doit rester lisible (CLAUDE.md §22).
create trigger vehicle_occupations_no_delete
  before delete on public.vehicle_occupations
  for each row execute function public.fn_forbid_delete();


-- --- Disponibilité réelle ---------------------------------------------------
--
-- 05_Regles_Metier/02_Parc_Automobile.md §67 : « le statut affiché ne doit
-- jamais être utilisé seul pour déterminer la disponibilité si le calendrier
-- révèle un conflit ». La fonction interroge donc les deux, et c'est elle que
-- doivent appeler la recherche de disponibilité, la confirmation de réservation
-- et la création de location (§70, Règles location §56).

create or replace function public.is_vehicle_available(
  p_vehicle_id uuid,
  p_period     tstzrange
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
           select 1
           from public.vehicles v
           where v.id = p_vehicle_id
             and v.status <> 'RETIRED'      -- un véhicule retiré ne se loue plus (§79.6)
             and v.exit_date is null
         )
     and not exists (
           select 1
           from public.vehicle_occupations o
           where o.vehicle_id = p_vehicle_id
             and o.is_active
             and o.period && p_period
         );
$$;

comment on function public.is_vehicle_available(uuid, tstzrange) is
  'Disponibilité réelle d''un véhicule sur une période : statut ET calendrier (§67, §70).';


-- Occupations d'un véhicule sur une fenêtre donnée : alimente l'affichage du
-- calendrier, qui doit montrer les périodes plutôt qu'un statut permanent (§68).
create or replace function public.vehicle_calendar(
  p_vehicle_id uuid,
  p_period     tstzrange
)
returns table (
  id        uuid,
  source    public.occupation_source,
  source_id uuid,
  period    tstzrange,
  reason    text
)
language sql
stable
set search_path = public, pg_temp
as $$
  select o.id, o.source, o.source_id, o.period, o.reason
  from public.vehicle_occupations o
  where o.vehicle_id = p_vehicle_id
    and o.is_active
    and o.period && p_period
  order by lower(o.period);
$$;

comment on function public.vehicle_calendar(uuid, tstzrange) is
  'Périodes bloquées d''un véhicule sur une fenêtre, toutes origines confondues (§68).';
