-- =============================================================================
-- ADIKOM PILOT — 018 · RLS du référentiel d'exploitation
-- Étape 2.2 (DEC-021)
--
-- Deuxième barrière de DEC-011. La première est la garde serveur
-- (`requirePermission`), la troisième est le masquage d'interface — qui n'est
-- jamais une protection (05_Regles_Metier/05_Permissions.md §50 et §85).
--
-- Principe de confiance minimale (§87) : sans policy applicable, l'accès est
-- refusé. Le rôle `anon` n'a accès à aucune donnée métier.
--
-- Aucune policy DELETE n'est écrite : les données métier s'archivent
-- (CLAUDE.md §22). Les triggers `*_no_delete` constituent la barrière jumelle.
-- =============================================================================

-- --- Aucun accès pour les visiteurs non authentifiés ------------------------

revoke all on public.clients                   from anon;
revoke all on public.suppliers                 from anon;
revoke all on public.supplier_bank_details     from anon;
revoke all on public.vehicle_categories        from anon;
revoke all on public.vehicles                  from anon;
revoke all on public.vehicle_supplier_history  from anon;
revoke all on public.vehicle_documents         from anon;
revoke all on public.pricing_rules             from anon;
revoke all on public.vehicle_occupations       from anon;

-- Les données métier ne se suppriment pas, y compris pour un compte authentifié.
revoke delete on public.clients                  from authenticated;
revoke delete on public.suppliers                from authenticated;
revoke delete on public.vehicles                 from authenticated;
revoke delete on public.pricing_rules            from authenticated;
revoke delete on public.vehicle_occupations      from authenticated;


-- --- Activation de RLS ------------------------------------------------------

alter table public.clients                  enable row level security;
alter table public.suppliers                enable row level security;
alter table public.supplier_bank_details    enable row level security;
alter table public.vehicle_categories       enable row level security;
alter table public.vehicles                 enable row level security;
alter table public.vehicle_supplier_history enable row level security;
alter table public.vehicle_documents        enable row level security;
alter table public.pricing_rules            enable row level security;
alter table public.vehicle_occupations      enable row level security;


-- --- Clients ----------------------------------------------------------------

create policy clients_select on public.clients
  for select to authenticated
  using (public.has_permission('parties.clients.view'));

create policy clients_insert on public.clients
  for insert to authenticated
  with check (public.has_permission('parties.clients.create'));

-- L'archivage est une modification de statut : RLS autorise l'écriture, la
-- distinction entre « modifier » et « archiver » est faite par la garde serveur,
-- qui exige la permission correspondant à l'action réellement demandée.
create policy clients_update on public.clients
  for update to authenticated
  using (
    public.has_permission('parties.clients.update')
    or public.has_permission('parties.clients.archive')
  )
  with check (
    public.has_permission('parties.clients.update')
    or public.has_permission('parties.clients.archive')
  );


-- --- Fournisseurs -----------------------------------------------------------

create policy suppliers_select on public.suppliers
  for select to authenticated
  using (public.has_permission('parties.suppliers.view'));

create policy suppliers_insert on public.suppliers
  for insert to authenticated
  with check (public.has_permission('parties.suppliers.create'));

create policy suppliers_update on public.suppliers
  for update to authenticated
  using (
    public.has_permission('parties.suppliers.update')
    or public.has_permission('parties.suppliers.archive')
  )
  with check (
    public.has_permission('parties.suppliers.update')
    or public.has_permission('parties.suppliers.archive')
  );


-- --- Coordonnées bancaires --------------------------------------------------
-- Donnée sensible : la permission de voir un fournisseur ne donne PAS accès à
-- ses coordonnées bancaires (05_Regles_Metier/04_Fournisseurs.md §44 et §46).
-- La restriction est appliquée au niveau des données, pas de l'affichage.

create policy supplier_bank_details_select on public.supplier_bank_details
  for select to authenticated
  using (public.has_permission('parties.suppliers.bank.view'));

create policy supplier_bank_details_write on public.supplier_bank_details
  for all to authenticated
  using (public.has_permission('parties.suppliers.bank.update'))
  with check (public.has_permission('parties.suppliers.bank.update'));


-- --- Catégories -------------------------------------------------------------
-- Lisibles par qui consulte le parc ou la tarification : la catégorie d'un
-- véhicule est une information de lecture courante, sans caractère sensible.

create policy vehicle_categories_select on public.vehicle_categories
  for select to authenticated
  using (
    public.has_permission('rental.categories.view')
    or public.has_permission('rental.fleet.view')
    or public.has_permission('rental.pricing.view')
  );

create policy vehicle_categories_insert on public.vehicle_categories
  for insert to authenticated
  with check (public.has_permission('rental.categories.create'));

create policy vehicle_categories_update on public.vehicle_categories
  for update to authenticated
  using (
    public.has_permission('rental.categories.update')
    or public.has_permission('rental.categories.archive')
  )
  with check (
    public.has_permission('rental.categories.update')
    or public.has_permission('rental.categories.archive')
  );


-- --- Véhicules --------------------------------------------------------------

create policy vehicles_select on public.vehicles
  for select to authenticated
  using (public.has_permission('rental.fleet.view'));

create policy vehicles_insert on public.vehicles
  for insert to authenticated
  with check (public.has_permission('rental.fleet.create'));

-- Modifier la fiche, changer le statut, changer de fournisseur et retirer du
-- parc sont quatre permissions distinctes (Règles parc §71). RLS ouvre
-- l'écriture à qui détient l'une d'elles ; la garde serveur exige la bonne.
create policy vehicles_update on public.vehicles
  for update to authenticated
  using (
    public.has_permission('rental.fleet.update')
    or public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.fleet.supplier.update')
    or public.has_permission('rental.fleet.archive')
  )
  with check (
    public.has_permission('rental.fleet.update')
    or public.has_permission('rental.fleet.status.update')
    or public.has_permission('rental.fleet.supplier.update')
    or public.has_permission('rental.fleet.archive')
  );


-- --- Historique fournisseur du véhicule -------------------------------------

create policy vehicle_supplier_history_select on public.vehicle_supplier_history
  for select to authenticated
  using (
    public.has_permission('rental.fleet.view')
    or public.has_permission('parties.suppliers.view')
  );

create policy vehicle_supplier_history_insert on public.vehicle_supplier_history
  for insert to authenticated
  with check (public.has_permission('rental.fleet.supplier.update'));

create policy vehicle_supplier_history_update on public.vehicle_supplier_history
  for update to authenticated
  using (public.has_permission('rental.fleet.supplier.update'))
  with check (public.has_permission('rental.fleet.supplier.update'));


-- --- Documents du véhicule --------------------------------------------------
--
-- Le catalogue des permissions ne comporte pas de code « documents.update » :
-- il distingue voir / créer / archiver. Plutôt que d'introduire un code hors
-- catalogue, la correction d'un document est rattachée au droit de l'ajouter.
-- Le catalogue reste ainsi le miroir exact des permissions réellement livrées.

create policy vehicle_documents_select on public.vehicle_documents
  for select to authenticated
  using (
    public.has_permission('rental.documents.view')
    or public.has_permission('rental.fleet.view')
  );

create policy vehicle_documents_insert on public.vehicle_documents
  for insert to authenticated
  with check (public.has_permission('rental.documents.create'));

create policy vehicle_documents_update on public.vehicle_documents
  for update to authenticated
  using (
    public.has_permission('rental.documents.create')
    or public.has_permission('rental.documents.archive')
  )
  with check (
    public.has_permission('rental.documents.create')
    or public.has_permission('rental.documents.archive')
  );


-- --- Tarification -----------------------------------------------------------
--
-- La lecture est ouverte à qui doit APPLIQUER un tarif, pas seulement à qui le
-- gère : sans cela, un opérateur autorisé à créer une réservation ne pourrait
-- pas obtenir le tarif applicable, et le résolveur central deviendrait
-- contournable par une saisie manuelle du montant.

create policy pricing_rules_select on public.pricing_rules
  for select to authenticated
  using (
    public.has_permission('rental.pricing.view')
    or public.has_permission('parties.clients.pricing.view')
    or public.has_permission('rental.reservations.view')
    or public.has_permission('rental.rentals.view')
  );

create policy pricing_rules_insert on public.pricing_rules
  for insert to authenticated
  with check (
    public.has_permission('rental.pricing.create')
    or public.has_permission('parties.clients.pricing.manage')
  );

create policy pricing_rules_update on public.pricing_rules
  for update to authenticated
  using (
    public.has_permission('rental.pricing.update')
    or public.has_permission('parties.clients.pricing.manage')
  )
  with check (
    public.has_permission('rental.pricing.update')
    or public.has_permission('parties.clients.pricing.manage')
  );


-- --- Occupations ------------------------------------------------------------
--
-- Étape 2.2 : seules les immobilisations sont écrites, sous la permission de
-- changement de statut du véhicule. Les étapes 2.3 et 2.4 étendront l'écriture
-- aux réservations, locations et maintenances.

create policy vehicle_occupations_select on public.vehicle_occupations
  for select to authenticated
  using (
    public.has_permission('rental.fleet.view')
    or public.has_permission('rental.reservations.view')
    or public.has_permission('rental.rentals.view')
  );

create policy vehicle_occupations_insert on public.vehicle_occupations
  for insert to authenticated
  with check (public.has_permission('rental.fleet.status.update'));

create policy vehicle_occupations_update on public.vehicle_occupations
  for update to authenticated
  using (public.has_permission('rental.fleet.status.update'))
  with check (public.has_permission('rental.fleet.status.update'));
