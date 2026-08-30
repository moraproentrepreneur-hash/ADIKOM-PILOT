-- =============================================================================
-- ADIKOM PILOT — 044 · Coûts de maintenance : devis, estimation, réel, imputable
-- Étape 2.4, LOT 3 — arbitrages ADIKOM du 28 août 2026
--
-- POURQUOI UNE TABLE SÉPARÉE POUR LES MONTANTS
--
-- L'arbitrage L1 crée `rental.maintenance.cost.view` : voir une intervention et
-- voir son prix deviennent deux droits. Or RLS est ROW-level, pas
-- column-level : des montants rangés dans `vehicle_maintenances` seraient lus
-- par quiconque a le droit de lire la ligne, `SELECT` PostgREST à l'appui, et
-- la nouvelle capacité ne servirait qu'à masquer un écran.
--
-- `maintenance_costs` est donc une table à part, en 1:1, dont la policy de
-- lecture exige `cost.view`. C'est la seule construction qui rende la décision
-- applicable au niveau de la donnée.
--
-- CE QUE LA DOCUMENTATION FIXE — ET CE QU'ELLE NE FIXE PAS
--
--   §33 coût estimé avant · §34 coût réel après, « le système doit conserver
--   les deux valeurs » · Workflow 06 §7 « le coût total n'est pas
--   nécessairement égal au montant imputable », trois informations à
--   distinguer · §31 pièces (pièce, quantité, prix, montant total) · §32
--   main-d'œuvre séparée · §26 devis (montant, date, prestataire, description)
--   · §27 accepter ou refuser, action historisée · §37 justificatifs.
--
-- AUCUNE RÈGLE ne relie ces valeurs entre elles. L'écart (§35) et le montant
-- non imputable (§7) sont donc CALCULÉS À LA LECTURE, jamais stockés : deux
-- colonnes qui peuvent diverger de leur source valent moins qu'une soustraction
-- refaite à chaque affichage. Et la somme des lignes de coût ne REMPLACE pas le
-- coût réel : elle le documente. Si les deux divergent, l'écran le dit — il ne
-- choisit pas à la place de l'utilisateur (DEC-008).
--
-- CE QUE CE LOT NE FAIT PAS
--
--   · AUCUNE IMPUTATION. `imputable_amount` est un PLAFOND constaté : il ne
--     crée rien, ne réduit aucun solde, ne touche aucune facture fournisseur
--     (DEC-013). Le LOT 4 créera les imputations et consommera ce plafond.
--   · AUCUNE FACTURE, AUCUN PAIEMENT — Étape 2.5. §38 est formel : la
--     maintenance enregistre un coût, le paiement un mouvement ; les deux ne se
--     confondent pas.
--   · AUCUNE VALORISATION D'UN DOMMAGE. `incident_damages` ne reçoit aucun
--     montant, aucune franchise, aucune refacturation (arbitrage L5).
--   · AUCUN EFFET SUR LE CALENDRIER NI SUR LE PARC. Saisir un coût ne pose ni
--     ne lève une occupation, et ne change aucun statut de véhicule.
--
-- LES QUATRE COUCHES DE L'AUDIT 041–042
--
--   1. FONCTION   — chaque acte vérifie sa capacité par `require_capability`.
--   2. DONNÉE     — le verrou de l'arbitrage L6 : une donnée financière figée
--                   ne se modifie plus, quel que soit le droit détenu.
--   3. TRANSITION — décider d'un devis exige `maintenance.validate`, et les
--                   états décidés sont terminaux.
--   4. RLS        — lecture sous `cost.view`, écriture sous `cost.update`.
--
-- Aucune fonction n'est `SECURITY DEFINER`.
-- =============================================================================


-- --- Types -----------------------------------------------------------------------

-- §27 : accepter ou refuser. Rien d'autre n'est documenté, rien d'autre n'existe.
do $$ begin
  create type public.quote_status as enum (
    'PROPOSED',  -- Proposé
    'ACCEPTED',  -- Accepté
    'REFUSED'    -- Refusé
  );
exception when duplicate_object then null; end $$;

-- §31, §32, plus « autres frais » (arbitrage L4). Trois natures, pas davantage :
-- la ventilation détaillée des pièces relèvera du module Stock, que §31 annonce.
do $$ begin
  create type public.cost_line_kind as enum (
    'PARTS',   -- Pièces
    'LABOUR',  -- Main-d'œuvre
    'OTHER'    -- Autres frais
  );
exception when duplicate_object then null; end $$;

-- §37 et §66 : les pièces citées par la documentation, et une issue générique.
do $$ begin
  create type public.maintenance_document_type as enum (
    'QUOTE',         -- Devis
    'INVOICE',       -- Facture du prestataire
    'RECEIPT',       -- Reçu
    'REPAIR_ORDER',  -- Bon de réparation
    'REPORT',        -- Rapport d'intervention
    'OTHER'
  );
exception when duplicate_object then null; end $$;


-- =============================================================================
-- COUCHE 2 — LE VERROU
--
-- Arbitrage L6, qui reprend Workflow 05 §65 : « les informations importantes ne
-- doivent pas pouvoir être modifiées sans contrôle après validation ».
--
-- Une maintenance terminée ou annulée a produit ses chiffres ; un devis décidé
-- a fondé une décision. Les rouvrir silencieusement rendrait tout historique
-- financier indéfendable. Le verrou est donc porté par la BASE, et il n'existe
-- aucun chemin de déverrouillage — ni fonction, ni écran, ni permission. Une
-- correction devenue nécessaire relèvera d'une décision, pas d'un clic.
--
-- Le journal d'audit conserve de toute façon l'avant, l'après et l'auteur de
-- chaque écriture acceptée.
-- =============================================================================

create or replace function public.fn_maintenance_financials_locked()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status public.maintenance_status;
begin
  select status into v_status
  from public.vehicle_maintenances
  where id = coalesce(new.maintenance_id, old.maintenance_id);

  if v_status in ('COMPLETED', 'CANCELLED') then
    raise exception
      'Opération refusée : les données financières d''une maintenance terminée ou annulée sont verrouillées.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.fn_maintenance_financials_locked is
  'Fige les montants dès que la maintenance est terminée ou annulée (Workflow 05 §65, arbitrage L6). Aucun déverrouillage n''existe.';


-- =============================================================================
-- LES MONTANTS
-- =============================================================================

create table public.maintenance_costs (
  -- 1:1 : une maintenance a un jeu de montants, ou n'en a pas encore.
  maintenance_id uuid primary key
                 references public.vehicle_maintenances (id) on delete cascade,

  -- DEC-010 : entiers, en KMF. Aucun flottant, à aucun niveau.
  estimated_cost   bigint check (estimated_cost   is null or estimated_cost   >= 0),
  actual_cost      bigint check (actual_cost      is null or actual_cost      >= 0),
  imputable_amount bigint check (imputable_amount is null or imputable_amount >= 0),

  currency_code text not null default 'KMF',

  notes text,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  /*
   * Workflow 06 §7 pose « montant non imputable = coût total − montant
   * imputable » (300 000 − 200 000 = 100 000). Cette soustraction n'a de sens
   * que si l'imputable ne dépasse pas le coût : la contrainte ne fait que
   * rendre indisponible un état que l'arithmétique du §7 exclut déjà.
   *
   * Elle ne s'applique QUE si le coût réel est connu : avant l'intervention,
   * un imputable peut être arrêté sur la foi d'un devis.
   */
  constraint maintenance_costs_imputable_within check (
    imputable_amount is null
    or actual_cost is null
    or imputable_amount <= actual_cost
  )
);

comment on table public.maintenance_costs is
  'Montants d''une maintenance. Table séparée : RLS étant ROW-level, c''est la seule façon de faire respecter `rental.maintenance.cost.view` en lecture.';
comment on column public.maintenance_costs.imputable_amount is
  'PLAFOND imputable à un fournisseur (Workflow 06 §7). Ne crée aucune imputation et ne réduit aucun solde (DEC-013) : le LOT 4 le consommera.';
comment on column public.maintenance_costs.estimated_cost is
  'Coût estimé avant intervention (§33). Aucune règle ne le relie au coût réel.';

create trigger maintenance_costs_updated_at
  before update on public.maintenance_costs
  for each row execute function public.fn_set_updated_at();

create trigger maintenance_costs_locked
  before insert or update on public.maintenance_costs
  for each row execute function public.fn_maintenance_financials_locked();

create trigger maintenance_costs_audit
  after insert or update on public.maintenance_costs
  for each row execute function public.fn_audit_row('rental');

create trigger maintenance_costs_no_delete
  before delete on public.maintenance_costs
  for each row execute function public.fn_forbid_delete();


-- --- Lignes de coût (arbitrage L4) ------------------------------------------------
--
-- §31 et §32 : pièces et main-d'œuvre enregistrées séparément « lorsque
-- nécessaire ». Leur somme DOCUMENTE le coût réel, elle ne le remplace pas :
-- la ventilation étant facultative, un total calculé depuis elle serait faux
-- dès qu'une ligne manque. Aucun déclencheur ne recopie donc quoi que ce soit
-- dans `actual_cost`.

create table public.maintenance_cost_lines (
  id             uuid primary key default gen_random_uuid(),
  maintenance_id uuid not null references public.vehicle_maintenances (id) on delete cascade,

  kind   public.cost_line_kind not null,
  label  text not null,

  -- §31 : pièce, quantité, prix, montant total. Quantité et prix unitaire
  -- restent facultatifs — une main-d'œuvre forfaitaire n'en a pas.
  quantity    integer check (quantity is null or quantity > 0),
  unit_amount bigint  check (unit_amount is null or unit_amount >= 0),
  amount      bigint  not null check (amount >= 0),

  notes text,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  constraint cost_lines_label_not_blank check (btrim(label) <> '')
);

comment on table public.maintenance_cost_lines is
  'Ventilation facultative du coût (§31, §32). Sa somme documente le coût réel ; elle ne le calcule pas.';
comment on column public.maintenance_cost_lines.amount is
  'Montant de la ligne, SAISI. Non déduit de quantité × prix unitaire : aucune règle ne l''impose et les deux peuvent manquer.';

create index maintenance_cost_lines_maintenance_idx
  on public.maintenance_cost_lines (maintenance_id);

create trigger maintenance_cost_lines_updated_at
  before update on public.maintenance_cost_lines
  for each row execute function public.fn_set_updated_at();

create trigger maintenance_cost_lines_locked
  before insert or update on public.maintenance_cost_lines
  for each row execute function public.fn_maintenance_financials_locked();

create trigger maintenance_cost_lines_audit
  after insert or update on public.maintenance_cost_lines
  for each row execute function public.fn_audit_row('rental');

create trigger maintenance_cost_lines_no_delete
  before delete on public.maintenance_cost_lines
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- LES DEVIS
-- =============================================================================

create table public.maintenance_quotes (
  id             uuid primary key default gen_random_uuid(),
  maintenance_id uuid not null references public.vehicle_maintenances (id) on delete cascade,

  -- §26 : le devis vient d'un prestataire. Il peut différer de celui retenu sur
  -- la maintenance — on compare des offres avant de choisir.
  provider_supplier_id uuid references public.suppliers (id) on delete restrict,

  amount      bigint not null check (amount >= 0),
  quoted_on   date,
  description text,

  status          public.quote_status not null default 'PROPOSED',
  decided_at      timestamptz,
  decided_by      uuid references public.app_users (id) on delete set null,
  decision_reason text,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  -- §27 : la décision est historisée. Un état décidé sans date d'effet serait
  -- une décision que personne ne peut situer.
  constraint quotes_decision_dated check (
    status = 'PROPOSED' or decided_at is not null
  )
);

comment on table public.maintenance_quotes is
  'Devis reçus pour une intervention (§26). Accepter ou refuser relève de `rental.maintenance.validate` ; le montant, de `cost.update`.';

create index maintenance_quotes_maintenance_idx on public.maintenance_quotes (maintenance_id);

create trigger maintenance_quotes_updated_at
  before update on public.maintenance_quotes
  for each row execute function public.fn_set_updated_at();

create trigger maintenance_quotes_audit
  after insert or update on public.maintenance_quotes
  for each row execute function public.fn_audit_row('rental');

create trigger maintenance_quotes_no_delete
  before delete on public.maintenance_quotes
  for each row execute function public.fn_forbid_delete();


-- --- COUCHE 3 — la transition d'un devis --------------------------------------------
--
-- Deux issues, toutes deux terminales (§27). Et deux capacités bien distinctes :
-- SAISIR un devis est un acte de coût, le DÉCIDER est un acte d'engagement
-- (arbitrage L2). Le second n'est pas impliqué par le premier.

create or replace function public.fn_quote_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    if old.status <> 'PROPOSED' then
      raise exception
        'Transition de devis refusée : une décision ne se reprend pas (% → %).',
        old.status, new.status
        using errcode = 'check_violation';
    end if;

    perform public.require_capability(
      array['rental.maintenance.validate'], 'accepter ou refuser un devis'
    );
  end if;

  /*
   * COUCHE 2 sur le devis : un devis décidé est figé (arbitrage L6). En
   * modifier le montant après coup reviendrait à changer ce sur quoi la
   * décision a porté.
   */
  if old.status <> 'PROPOSED'
     and (new.amount               is distinct from old.amount
       or new.provider_supplier_id is distinct from old.provider_supplier_id
       or new.quoted_on            is distinct from old.quoted_on
       or new.description          is distinct from old.description) then
    raise exception
      'Opération refusée : un devis accepté ou refusé ne se modifie plus.'
      using errcode = 'check_violation';
  end if;

  -- Modifier le contenu financier d'un devis encore ouvert relève du coût.
  if new.amount               is distinct from old.amount
     or new.provider_supplier_id is distinct from old.provider_supplier_id
     or new.quoted_on          is distinct from old.quoted_on
     or new.description        is distinct from old.description then
    perform public.require_capability(
      array['rental.maintenance.cost.update'], 'modifier un devis'
    );
  end if;

  return new;
end;
$$;

comment on function public.fn_quote_transition is
  'Décider d''un devis exige `maintenance.validate` ; le modifier, `cost.update`. Un devis décidé est terminal et figé.';

create trigger maintenance_quotes_transition
  before update on public.maintenance_quotes
  for each row execute function public.fn_quote_transition();


-- Une clé étrangère composée exige cette unicité : c'est elle qui rendra
-- impossible qu'un justificatif désigne le devis d'une AUTRE maintenance.
alter table public.maintenance_quotes
  add constraint maintenance_quotes_id_maintenance_key unique (id, maintenance_id);


-- =============================================================================
-- LES JUSTIFICATIFS
--
-- Aucun second système de fichiers (arbitrage L3) : le bucket PRIVÉ
-- `vehicle-documents`, un préfixe dédié, une route qui vérifie la capacité puis
-- délivre une URL signée de courte durée. Aucune URL permanente n'est stockée,
-- et rien ne se supprime — `is_archived`, comme partout.
-- =============================================================================

create table public.maintenance_documents (
  id             uuid primary key default gen_random_uuid(),
  maintenance_id uuid not null references public.vehicle_maintenances (id) on delete cascade,

  -- Un justificatif peut être CELUI d'un devis précis. La clé composée interdit
  -- qu'il désigne le devis d'une autre maintenance.
  quote_id uuid,

  doc_type public.maintenance_document_type not null,
  label    text not null,

  storage_path text not null,
  file_name    text not null,
  file_size    bigint check (file_size is null or file_size >= 0),
  mime_type    text,

  is_archived boolean not null default false,

  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null,

  constraint maintenance_documents_label_not_blank check (btrim(label) <> ''),
  constraint maintenance_documents_quote_fkey
    foreign key (quote_id, maintenance_id)
    references public.maintenance_quotes (id, maintenance_id) on delete cascade
);

comment on table public.maintenance_documents is
  'Justificatifs financiers d''une maintenance (§37). `storage_path` désigne un objet du bucket PRIVÉ ; aucune URL n''est conservée.';
comment on column public.maintenance_documents.storage_path is
  'Chemin sous le préfixe maintenances/{maintenanceId}/. Jamais exposé au navigateur (DEC-025 §f).';

create index maintenance_documents_maintenance_idx
  on public.maintenance_documents (maintenance_id)
  where not is_archived;

create trigger maintenance_documents_updated_at
  before update on public.maintenance_documents
  for each row execute function public.fn_set_updated_at();

create trigger maintenance_documents_audit
  after insert or update on public.maintenance_documents
  for each row execute function public.fn_audit_row('rental');

create trigger maintenance_documents_no_delete
  before delete on public.maintenance_documents
  for each row execute function public.fn_forbid_delete();


-- =============================================================================
-- COUCHE 1 — LES FONCTIONS
--
-- Chacune vérifie la capacité qu'elle incarne AVANT d'engager le travail. Ce
-- n'est pas redondant avec RLS : la policy dit qui peut écrire dans la table,
-- ceci dit qui peut accomplir CET acte — la leçon de l'audit 041.
-- =============================================================================

create or replace function public.record_maintenance_costs(
  p_maintenance_id   uuid,
  p_estimated_cost   bigint default null,
  p_actual_cost      bigint default null,
  p_imputable_amount bigint default null,
  p_notes            text   default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status public.maintenance_status;
begin
  perform public.require_capability(
    array['rental.maintenance.cost.update'], 'saisir le coût d''une maintenance'
  );

  select status into v_status
  from public.vehicle_maintenances where id = p_maintenance_id;

  if not found then
    raise exception 'Maintenance introuvable.' using errcode = 'no_data_found';
  end if;

  -- Le verrou est aussi porté par le déclencheur ; ce contrôle-ci ne sert qu'à
  -- produire un message compréhensible (CLAUDE.md §43).
  if v_status in ('COMPLETED', 'CANCELLED') then
    raise exception
      'Opération refusée : les données financières d''une maintenance terminée ou annulée sont verrouillées.'
      using errcode = 'check_violation';
  end if;

  insert into public.maintenance_costs
    (maintenance_id, estimated_cost, actual_cost, imputable_amount, notes,
     created_by, updated_by)
  values
    (p_maintenance_id, p_estimated_cost, p_actual_cost, p_imputable_amount,
     nullif(btrim(coalesce(p_notes, '')), ''),
     public.current_actor(), public.current_actor())
  on conflict (maintenance_id) do update set
    estimated_cost   = excluded.estimated_cost,
    actual_cost      = excluded.actual_cost,
    imputable_amount = excluded.imputable_amount,
    notes            = excluded.notes,
    updated_by       = public.current_actor();
end;
$$;

comment on function public.record_maintenance_costs is
  'Enregistre les montants d''une maintenance. Ne crée NI imputation, NI facture, NI paiement, et ne touche ni le calendrier ni le parc.';


create or replace function public.add_maintenance_quote(
  p_maintenance_id       uuid,
  p_amount               bigint,
  p_provider_supplier_id uuid default null,
  p_quoted_on            date default null,
  p_description          text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status public.maintenance_status;
  v_id     uuid;
begin
  perform public.require_capability(
    array['rental.maintenance.cost.update'], 'enregistrer un devis'
  );

  select status into v_status
  from public.vehicle_maintenances where id = p_maintenance_id;

  if not found then
    raise exception 'Maintenance introuvable.' using errcode = 'no_data_found';
  end if;

  if v_status in ('COMPLETED', 'CANCELLED') then
    raise exception
      'Opération refusée : aucun devis ne s''ajoute à une maintenance terminée ou annulée.'
      using errcode = 'check_violation';
  end if;

  if p_amount is null or p_amount < 0 then
    raise exception 'Le montant du devis est obligatoire.' using errcode = 'check_violation';
  end if;

  insert into public.maintenance_quotes
    (maintenance_id, provider_supplier_id, amount, quoted_on, description,
     created_by, updated_by)
  values
    (p_maintenance_id, p_provider_supplier_id, p_amount, p_quoted_on,
     nullif(btrim(coalesce(p_description, '')), ''),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.add_maintenance_quote is
  'Enregistre un devis reçu (§26). Le saisir relève du coût ; le décider, de `maintenance.validate`.';


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
     set status          = case when p_accept then 'ACCEPTED' else 'REFUSED' end,
         decided_at      = now(),
         decided_by      = public.current_actor(),
         decision_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_by      = public.current_actor()
   where id = q.id;
end;
$$;

comment on function public.decide_maintenance_quote is
  'Accepte ou refuse un devis (§27). Exige `rental.maintenance.validate`. Ne recopie aucun montant : aucune règle ne le prévoit.';


-- =============================================================================
-- COUCHE 4 — RLS
--
-- Lecture sous `cost.view`, écriture sous `cost.update`. La table des devis
-- accepte en écriture `cost.update` OU `validate`, parce que deux actes
-- distincts y écrivent ; c'est le déclencheur de transition qui exige, lui, la
-- capacité correspondant à l'acte réellement demandé.
-- =============================================================================

revoke all    on public.maintenance_costs      from anon;
revoke all    on public.maintenance_cost_lines from anon;
revoke all    on public.maintenance_quotes     from anon;
revoke all    on public.maintenance_documents  from anon;

revoke delete on public.maintenance_costs      from authenticated;
revoke delete on public.maintenance_cost_lines from authenticated;
revoke delete on public.maintenance_quotes     from authenticated;
revoke delete on public.maintenance_documents  from authenticated;

alter table public.maintenance_costs      enable row level security;
alter table public.maintenance_cost_lines enable row level security;
alter table public.maintenance_quotes     enable row level security;
alter table public.maintenance_documents  enable row level security;

-- --- Montants
create policy maintenance_costs_select on public.maintenance_costs
  for select to authenticated
  using (public.has_permission('rental.maintenance.cost.view'));

create policy maintenance_costs_insert on public.maintenance_costs
  for insert to authenticated
  with check (public.has_permission('rental.maintenance.cost.update'));

create policy maintenance_costs_update on public.maintenance_costs
  for update to authenticated
  using (public.has_permission('rental.maintenance.cost.update'))
  with check (public.has_permission('rental.maintenance.cost.update'));

-- --- Lignes de coût
create policy maintenance_cost_lines_select on public.maintenance_cost_lines
  for select to authenticated
  using (public.has_permission('rental.maintenance.cost.view'));

create policy maintenance_cost_lines_insert on public.maintenance_cost_lines
  for insert to authenticated
  with check (public.has_permission('rental.maintenance.cost.update'));

create policy maintenance_cost_lines_update on public.maintenance_cost_lines
  for update to authenticated
  using (public.has_permission('rental.maintenance.cost.update'))
  with check (public.has_permission('rental.maintenance.cost.update'));

-- --- Devis
create policy maintenance_quotes_select on public.maintenance_quotes
  for select to authenticated
  using (public.has_permission('rental.maintenance.cost.view'));

create policy maintenance_quotes_insert on public.maintenance_quotes
  for insert to authenticated
  with check (public.has_permission('rental.maintenance.cost.update'));

create policy maintenance_quotes_update on public.maintenance_quotes
  for update to authenticated
  using (
    public.has_permission('rental.maintenance.cost.update')
    or public.has_permission('rental.maintenance.validate')
  )
  with check (
    public.has_permission('rental.maintenance.cost.update')
    or public.has_permission('rental.maintenance.validate')
  );

-- --- Justificatifs
create policy maintenance_documents_select on public.maintenance_documents
  for select to authenticated
  using (public.has_permission('rental.maintenance.cost.view'));

create policy maintenance_documents_insert on public.maintenance_documents
  for insert to authenticated
  with check (public.has_permission('rental.maintenance.cost.update'));

create policy maintenance_documents_update on public.maintenance_documents
  for update to authenticated
  using (public.has_permission('rental.maintenance.cost.update'))
  with check (public.has_permission('rental.maintenance.cost.update'));
