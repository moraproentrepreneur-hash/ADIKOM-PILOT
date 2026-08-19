-- =============================================================================
-- ADIKOM PILOT — 008 · Organisation de départ
--
-- Départements réels d'ADIKOM (03_Modules/08_Utilisateurs_et_Groupes.md §10)
-- et groupes de départ inspirés des exemples documentés
-- (05_Regles_Metier/05_Permissions.md §63 à §68).
--
-- IMPORTANT — ces groupes et leurs permissions sont des POINTS DE DÉPART
-- modifiables, pas une attribution définitive. La documentation le précise
-- explicitement : « Les permissions exactes seront définies par ADIKOM »
-- (§63) et « les permissions finales devront être définies en fonction des
-- responsabilités réellement attribuées » (02_Architecture_Fonctionnelle/03 §32).
--
-- Aucune permission de gestion des utilisateurs n'est attribuée : elles restent
-- réservées au Super Admin dans le périmètre MVP (§40 et §64).
-- =============================================================================

-- --- Départements -----------------------------------------------------------
-- Le Gérant et l'Assistant(e) de direction ont des responsabilités
-- transversales et ne constituent pas des départements (§10).

insert into public.departments (code, name, description, sort_order) values
  ('ADMIN_FINANCE', 'Administration & Finance',
   'Gestion administrative, comptable et financière.', 1),
  ('TOURISME_MOBILITE', 'Tourisme & Mobilité',
   'Activité de location de véhicules et prestations de mobilité.', 2),
  ('SUPPORT_LOGISTIQUE', 'Support & Logistique',
   'Parc automobile, maintenance, opérations logistiques.', 3),
  ('INFORMATIQUE', 'Informatique & Services Technique',
   'Systèmes d''information et services techniques.', 4),
  ('COMMERCIAL', 'Commercial & Développement',
   'Développement commercial, clients et partenariats.', 5)
on conflict (code) do nothing;


-- --- Groupes de départ ------------------------------------------------------

insert into public.groups (code, name, description, sort_order) values
  ('DIRECTION', 'Direction',
   'Vision globale de l''activité. Périmètre à ajuster par le Super Admin.', 1),
  ('ASSISTANAT_DIRECTION', 'Assistant(e) de direction',
   'Organisation interne, projets, échéances et suivi des activités.', 2),
  ('ADMIN_FINANCE', 'Administration & Finance',
   'Facturation, règlements, trésorerie et suivi des tiers.', 3),
  ('EXPLOITATION_LOCATION', 'Exploitation location',
   'Réservations, départs, retours et suivi opérationnel des locations.', 4),
  ('SUPPORT_LOGISTIQUE', 'Support & Logistique',
   'Parc automobile, maintenance, incidents et immobilisations.', 5),
  ('COMMERCIAL', 'Commercial & Développement',
   'Clients, partenariats et conditions commerciales.', 6)
on conflict (code) do nothing;


-- --- Permissions de départ par groupe ---------------------------------------
-- Attribution par motif de code, afin de rester lisible et vérifiable.

-- Direction — vision large en consultation, sans administration des accès (§63).
insert into public.group_permissions (group_id, permission_id, effect)
select g.id, p.id, 'ALLOW'
from public.groups g
join public.permissions p on
  p.code in ('dashboard.view', 'dashboard.financial.view', 'dashboard.fleet.view',
             'notifications.view', 'users.hierarchy.view')
  or p.action = 'VIEW' and p.module_code in ('parties', 'rental', 'billing', 'treasury', 'projects')
where g.code = 'DIRECTION'
on conflict do nothing;

-- Assistant(e) de direction — organisation interne, consultation des tiers
-- et de certaines locations ; pas d'accès aux paiements ni aux paramètres (§63).
insert into public.group_permissions (group_id, permission_id, effect)
select g.id, p.id, 'ALLOW'
from public.groups g
join public.permissions p on
  p.code in ('dashboard.view', 'notifications.view',
             'projects.view', 'projects.create', 'projects.update',
             'parties.clients.view', 'parties.clients.create', 'parties.clients.update',
             'parties.suppliers.view', 'parties.partners.view',
             'rental.board.view', 'rental.reservations.view', 'rental.rentals.view',
             'users.hierarchy.view')
where g.code = 'ASSISTANAT_DIRECTION'
on conflict do nothing;

-- Administration & Finance — tiers, facturation, trésorerie (§64).
-- La gestion des utilisateurs reste réservée au Super Admin.
insert into public.group_permissions (group_id, permission_id, effect)
select g.id, p.id, 'ALLOW'
from public.groups g
join public.permissions p on
  p.code in ('dashboard.view', 'dashboard.financial.view', 'notifications.view')
  or p.module_code = 'billing'
  or p.module_code = 'treasury'
  or p.code in ('parties.clients.view', 'parties.clients.create', 'parties.clients.update',
                'parties.suppliers.view', 'parties.suppliers.create', 'parties.suppliers.update',
                'parties.suppliers.financial.view',
                'rental.rentals.view', 'rental.rentals.financial.view')
where g.code = 'ADMIN_FINANCE'
on conflict do nothing;

-- Exploitation location — cycle opérationnel complet, sans accès financier
-- sensible ni gestion des tarifs (§65).
insert into public.group_permissions (group_id, permission_id, effect)
select g.id, p.id, 'ALLOW'
from public.groups g
join public.permissions p on
  p.code in ('dashboard.view', 'dashboard.fleet.view', 'notifications.view',
             'rental.board.view',
             'rental.reservations.view', 'rental.reservations.create',
             'rental.reservations.update', 'rental.reservations.confirm',
             'rental.reservations.cancel',
             'rental.rentals.view', 'rental.rentals.create', 'rental.rentals.update',
             'rental.rentals.checkout', 'rental.rentals.extend', 'rental.rentals.return',
             'rental.rentals.close',
             'rental.fleet.view', 'rental.categories.view',
             'rental.incidents.view', 'rental.incidents.create',
             'rental.documents.view',
             'rental.pricing.view',
             'parties.clients.view', 'parties.clients.create')
where g.code = 'EXPLOITATION_LOCATION'
on conflict do nothing;

-- Support & Logistique — véhicules, maintenance, incidents (§66).
insert into public.group_permissions (group_id, permission_id, effect)
select g.id, p.id, 'ALLOW'
from public.groups g
join public.permissions p on
  p.code in ('dashboard.view', 'dashboard.fleet.view', 'notifications.view',
             'rental.board.view',
             'rental.fleet.view', 'rental.fleet.create', 'rental.fleet.update',
             'rental.fleet.status.update',
             'rental.categories.view', 'rental.categories.create', 'rental.categories.update',
             'rental.maintenance.view', 'rental.maintenance.create', 'rental.maintenance.update',
             'rental.maintenance.close',
             'rental.incidents.view', 'rental.incidents.create', 'rental.incidents.update',
             'rental.documents.view', 'rental.documents.create',
             'rental.reservations.view', 'rental.rentals.view',
             'parties.suppliers.view')
where g.code = 'SUPPORT_LOGISTIQUE'
on conflict do nothing;

-- Commercial & Développement — clients, partenariats, consultation des tarifs.
-- La modification des tarifs préférentiels exige une permission spécifique (§68).
insert into public.group_permissions (group_id, permission_id, effect)
select g.id, p.id, 'ALLOW'
from public.groups g
join public.permissions p on
  p.code in ('dashboard.view', 'notifications.view',
             'parties.clients.view', 'parties.clients.create', 'parties.clients.update',
             'parties.clients.pricing.view',
             'parties.partners.view', 'parties.partners.create', 'parties.partners.update',
             'rental.reservations.view', 'rental.rentals.view',
             'rental.pricing.view',
             'projects.view')
where g.code = 'COMMERCIAL'
on conflict do nothing;
