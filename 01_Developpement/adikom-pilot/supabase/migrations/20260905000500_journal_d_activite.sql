-- =============================================================================
-- ADIKOM PILOT — 064 · Journal d'activité
-- Phase 4 — Organisation, LOT 15 (Module 08 §54 · Règles métier 06 — Audit)
--
-- CE QUE CETTE MIGRATION FAIT, ET CE QU'ELLE NE FAIT PAS
--
-- Elle ne crée AUCUNE table et AUCUNE capacité.
--
-- `audit_log` existe et est alimentée depuis la migration 004 ; `users.audit.view`
-- et `users.audit.export` sont au catalogue depuis la migration 007. Le catalogue
-- reste à 170 (DEC-024 : une permission ne se crée que si aucune existante ne
-- couvre l'acte).
--
-- Ce qu'elle livre, c'est la FRONTIÈRE que l'écran suppose et que la base ne
-- tenait pas encore.
--
-- LE DÉFAUT QU'ELLE FERME
--
-- `audit_log.before_data` et `after_data` contiennent la LIGNE ENTIÈRE de la
-- table auditée : l'email et le téléphone d'un collaborateur, le montant d'une
-- facture, la coordonnée de règlement d'un fournisseur, le compte rendu d'une
-- réunion. Quarante-huit types d'objet y écrivent aujourd'hui.
--
-- Tant que `users.audit.view` ouvrait la table entière, elle ouvrait donc AUSSI,
-- d'un seul geste, la donnée métier de tous les modules — à un compte qui n'a
-- le droit d'en lire aucun. Le journal devenait une porte dérobée autour des
-- permissions, ce que trois règles interdisent :
--
--   · `06_Audit.md` §62 — « les utilisateurs ne doivent pas pouvoir consulter
--     librement les informations d'audit qui dépassent leurs responsabilités » ;
--   · `06_Audit.md` §51 — l'audit dit CE QUI A ÉTÉ FAIT ; il ne décide jamais
--     de ce qu'on a le droit de voir ;
--   · `Module 08` §46 — « un utilisateur disposant uniquement d'un accès aux
--     réservations ne doit pas pouvoir récupérer les données financières d'une
--     facture simplement en modifiant une URL ou une requête ».
--
-- LA RÈGLE POSÉE (DEC-038)
--
--   `users.audit.view`  ouvre L'ÉVÉNEMENT : qui, quoi, quand, sur quel objet,
--                       avec quel résultat, pour quel motif, et QUELS CHAMPS
--                       ont changé.
--
--   Le DÉTAIL avant/après — la donnée métier elle-même — n'est rendu qu'à qui
--   détient EN PLUS la lecture de l'objet concerné, ou au Super Admin (§41).
--
-- Le journal reste donc complet pour le contrôle interne (§53 — vérifier la
-- séparation des responsabilités n'exige pas de lire les montants), et cesse
-- d'être un contournement.
--
-- COMMENT ELLE EST TENUE — deux barrières, comme partout (DEC-011)
--
--   1. DROITS DE COLONNE. `authenticated` perd le SELECT de table et le
--      reçoit colonne par colonne, `before_data` et `after_data` exclues.
--      Un appel direct à l'API ne peut donc PAS les demander, quelle que soit
--      la requête écrite — la policy RLS, elle, ne filtre que des LIGNES.
--   2. UNE FONCTION QUI ARBITRE. `audit_entry_detail()` est le seul chemin
--      vers ces deux colonnes. Elle exige `users.audit.view`, puis la lecture
--      de l'objet, et DIT laquelle manque plutôt que de rendre un détail vide
--      (DEC-017).
--
-- Références : 05_Regles_Metier/06_Audit.md §41, §42 à §48, §51, §53, §62,
--              §64, §80, §81.14, §81.19 ; 03_Modules/08_Utilisateurs_et_Groupes.md
--              §46, §54 ; CLAUDE.md §19, §19 bis, §21, §43, §44 ;
--              DEC-011, DEC-017, DEC-022, DEC-024, DEC-038.
-- =============================================================================


-- =============================================================================
-- 1. QUELLE LECTURE OUVRE LE DÉTAIL D'UN OBJET
-- =============================================================================
--
-- La correspondance vit EN BASE, et non dans l'application : c'est elle qui
-- décide d'une divulgation, et une règle de sécurité écrite en TypeScript ne
-- protège rien d'un appel direct.
--
-- ELLE N'INVENTE AUCUNE CAPACITÉ. Chaque ligne cite une capacité déjà au
-- catalogue — celle qui ouvre déjà l'écran de l'objet concerné. Lire l'histoire
-- d'une facture dans le journal ne donne donc ni plus ni moins que lire la
-- facture elle-même.
--
-- CE QUI N'EST PAS NOMMÉ EST FERMÉ. Un type d'objet inconnu — une table auditée
-- demain, dont personne n'aurait pensé à ajouter la ligne — renvoie NULL, et
-- NULL vaut « Super Admin uniquement ». Un oubli referme donc l'accès au lieu
-- de l'ouvrir (Règles permissions §87 — l'absence de permission entraîne un
-- refus).

create or replace function public.audit_detail_permission(p_entity_type text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_entity_type

    -- --- Utilisateurs & Groupes ---------------------------------------------
    when 'app_users'                      then 'users.users.view'
    when 'user_departments'               then 'users.users.view'
    when 'user_groups'                    then 'users.users.view'
    when 'groups'                         then 'users.groups.view'
    when 'group_permissions'              then 'users.groups.view'
    -- Les droits d'une personne se lisent derrière LEUR capacité, pas derrière
    -- celle qui ouvre sa fiche (Module 08 §19, catalogue migration 007).
    when 'user_permissions'               then 'users.users.permissions.view'

    -- --- Tiers ---------------------------------------------------------------
    when 'clients'                        then 'parties.clients.view'
    when 'suppliers'                      then 'parties.suppliers.view'
    when 'partners'                       then 'parties.partners.view'
    -- Une coordonnée de règlement est la donnée la plus sensible du module :
    -- elle garde sa propre capacité jusque dans le journal (Fournisseurs §44).
    when 'supplier_bank_details'          then 'parties.suppliers.bank.view'
    when 'supplier_payment_details'       then 'parties.suppliers.bank.view'

    -- --- Gestion de location -------------------------------------------------
    when 'vehicles'                       then 'rental.fleet.view'
    when 'vehicle_supplier_history'       then 'rental.fleet.view'
    when 'vehicle_occupations'            then 'rental.fleet.view'
    when 'vehicle_categories'             then 'rental.categories.view'
    when 'vehicle_documents'              then 'rental.documents.view'
    when 'pricing_rules'                  then 'rental.pricing.view'
    when 'reservations'                   then 'rental.reservations.view'
    when 'rentals'                        then 'rental.rentals.view'
    when 'rental_inspections'             then 'rental.rentals.view'
    when 'rental_inspection_photos'       then 'rental.rentals.view'
    when 'vehicle_incidents'              then 'rental.incidents.view'
    when 'incident_damages'               then 'rental.incidents.view'
    when 'incident_photos'                then 'rental.incidents.view'
    when 'vehicle_maintenances'           then 'rental.maintenance.view'
    when 'maintenance_documents'          then 'rental.maintenance.view'
    when 'maintenance_quotes'             then 'rental.maintenance.view'
    -- Un coût de maintenance a sa propre lecture depuis la migration 041 :
    -- consulter une intervention n'a jamais ouvert son montant (DEC-024).
    when 'maintenance_costs'              then 'rental.maintenance.cost.view'
    when 'maintenance_cost_lines'         then 'rental.maintenance.cost.view'

    -- --- Facturation & Paiement ----------------------------------------------
    when 'customer_invoices'              then 'billing.customer_invoices.view'
    when 'customer_invoice_lines'         then 'billing.customer_invoices.view'
    when 'customer_payments'              then 'billing.customer_payments.view'
    when 'supplier_invoices'              then 'billing.supplier_invoices.view'
    when 'supplier_invoice_lines'         then 'billing.supplier_invoices.view'
    when 'supplier_payments'              then 'billing.supplier_payments.view'
    when 'imputations'                    then 'billing.imputations.view'
    when 'imputation_documents'           then 'billing.imputations.view'

    -- --- Banques & Caisses ---------------------------------------------------
    when 'financial_accounts'             then 'treasury.accounts.view'
    when 'treasury_entries'               then 'treasury.entries.view'

    -- --- Projets & Planification ---------------------------------------------
    when 'projects'                       then 'projects.view'
    when 'project_members'                then 'projects.view'
    when 'project_tasks'                  then 'projects.tasks.view'
    when 'project_meetings'               then 'projects.meetings.view'
    when 'project_meeting_participants'   then 'projects.meetings.view'
    when 'project_appointments'           then 'projects.appointments.view'
    when 'project_appointment_participants' then 'projects.appointments.view'
    when 'project_decisions'              then 'projects.decisions.view'
    when 'project_actions'                then 'projects.actions.view'

    -- --- Paramètres ----------------------------------------------------------
    when 'company_settings'               then 'settings.company.view'
    when 'numbering_rules'                then 'settings.numbering.view'

    else null
  end;
$$;

comment on function public.audit_detail_permission(text) is
  'Capacité exigée pour lire le détail avant/après d''un événement (DEC-038). NULL = Super Admin uniquement.';


-- =============================================================================
-- 2. PREMIÈRE BARRIÈRE — LE DÉTAIL SORT DE PORTÉE DE L'API
-- =============================================================================
--
-- RLS filtre des LIGNES ; elle ne sait pas retirer une COLONNE. Tant que
-- `authenticated` détient le SELECT de table, `select=before_data` reste une
-- requête valide pour qui franchit la policy.
--
-- Le SELECT est donc retiré à la table et rendu colonne par colonne. Les deux
-- colonnes de charge utile n'y figurent pas : elles ne sont plus atteignables
-- que par `audit_entry_detail()`, qui arbitre.
--
-- `service_role` n'est pas concerné : les migrations, les scripts
-- d'environnement et les recettes continuent de tout lire — c'est précisément
-- leur rôle, et il ne passe par aucune session d'utilisateur.

revoke select on public.audit_log from authenticated;

grant select (
  id, occurred_at,
  actor_id, actor_label,
  action, result,
  module_code, entity_type, entity_id, entity_label,
  changed_fields,
  reason, comment,
  ip_address, user_agent
) on public.audit_log to authenticated;

comment on column public.audit_log.before_data is
  'Situation avant. Hors de portée de l''API : lisible seulement par audit_entry_detail() (DEC-038).';
comment on column public.audit_log.after_data is
  'Situation après. Hors de portée de l''API : lisible seulement par audit_entry_detail() (DEC-038).';


-- =============================================================================
-- 3. SECONDE BARRIÈRE — LA FONCTION QUI ARBITRE LE DÉTAIL
-- =============================================================================
--
-- Elle rend TOUJOURS une ligne, jamais un vide : un détail absent doit se
-- distinguer d'un détail refusé, et un refus doit NOMMER ce qui manque
-- (DEC-017, CLAUDE.md §38 — l'état « permission insuffisante » est un état
-- d'interface à part entière).

create or replace function public.audit_entry_detail(p_id bigint)
returns table (
  id                  bigint,
  may_read            boolean,
  required_permission text,
  before_data         jsonb,
  after_data          jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_entity   text;
  v_required text;
  v_allowed  boolean;
begin
  -- La lecture du journal commande l'accès à la fonction, avant toute autre
  -- considération : sans elle, l'existence même de l'événement reste fermée.
  if not (public.is_super_admin() or public.has_permission('users.audit.view')) then
    raise exception 'Consultation du journal d''activité non autorisée.'
      using errcode = '42501';
  end if;

  select a.entity_type into v_entity
  from public.audit_log a
  where a.id = p_id;

  -- Aucun événement de ce numéro : ce n'est pas un refus, c'est une absence.
  if v_entity is null then
    return;
  end if;

  v_required := public.audit_detail_permission(v_entity);

  v_allowed := public.is_super_admin()
    or (v_required is not null and public.has_permission(v_required));

  return query
  select
    a.id,
    v_allowed,
    v_required,
    case when v_allowed then a.before_data end,
    case when v_allowed then a.after_data  end
  from public.audit_log a
  where a.id = p_id;
end;
$$;

comment on function public.audit_entry_detail(bigint) is
  'Détail avant/après d''un événement. Exige users.audit.view, puis la lecture de l''objet concerné (DEC-038).';


-- =============================================================================
-- 4. LES AUTEURS PRÉSENTS AU JOURNAL — filtre §43
-- =============================================================================
--
-- `06_Audit.md` §43 demande de pouvoir n'afficher que les actions d'un auteur.
-- Le choix se peuple depuis le journal LUI-MÊME, et non depuis la liste des
-- utilisateurs : `users.audit.view` n'ouvre pas `users.users.view` (DEC-024),
-- et un filtre qui exigerait la seconde rendrait le premier écran inutilisable
-- pour le profil auquel il est destiné.
--
-- SECURITY INVOKER, délibérément : la fonction s'exécute avec les droits de
-- l'appelant, donc sous la policy `audit_log_select`. Elle n'ouvre rien de plus
-- que ce que la table rend déjà à ce compte — et `actor_label` fige le nom au
-- moment de l'action (migration 004), de sorte qu'un compte supprimé reste
-- nommé sans que la fiche soit lue.

create or replace function public.audit_actors()
returns table (actor_id uuid, actor_label text)
language sql
stable
set search_path = public, pg_temp
as $$
  select distinct a.actor_id, a.actor_label
  from public.audit_log a
  where a.actor_id is not null
    and a.actor_label is not null
  order by a.actor_label;
$$;

comment on function public.audit_actors() is
  'Auteurs présents au journal d''activité, pour le filtre §43. S''exécute sous les droits de l''appelant.';


-- =============================================================================
-- 5. DROITS D'EXÉCUTION — DEC-022
-- =============================================================================
--
-- Un droit ne se retire pas « en général » : il se retire à chaque source qui
-- l'accorde. PostgreSQL accorde EXECUTE à PUBLIC sur toute fonction créée ; le
-- retirer à `anon` seul, ou à PUBLIC seul, laisse l'autre porte ouverte.
--
-- `audit_detail_permission` est une simple table de correspondance sans donnée,
-- mais elle décrit la cartographie de sécurité du journal : elle est fermée
-- comme les autres.

revoke execute on function public.audit_detail_permission(text) from public;
revoke execute on function public.audit_entry_detail(bigint)    from public;
revoke execute on function public.audit_actors()                from public;

revoke execute on function public.audit_detail_permission(text) from anon;
revoke execute on function public.audit_entry_detail(bigint)    from anon;
revoke execute on function public.audit_actors()                from anon;

grant execute on function public.audit_detail_permission(text) to authenticated, service_role;
grant execute on function public.audit_entry_detail(bigint)    to authenticated, service_role;
grant execute on function public.audit_actors()                to authenticated, service_role;


-- =============================================================================
-- 6. LIRE LE JOURNAL RESTE RAPIDE QUAND ON LE FILTRE PAR RÉSULTAT
-- =============================================================================
--
-- `06_Audit.md` §42 range le RÉSULTAT parmi les filtres attendus, et §60 en
-- fait la distinction la plus utile au contrôle : retrouver les refus. Les cinq
-- index de la migration 004 couvrent la date, l'auteur, l'objet, le module et
-- l'action ; aucun ne couvre le résultat.
--
-- Index PARTIEL : les événements réussis sont l'écrasante majorité et n'ont
-- aucun besoin d'être indexés par leur résultat. Seuls les échecs et les refus
-- le sont — ceux, précisément, qu'on cherche.
create index if not exists audit_log_result_idx
  on public.audit_log (result, occurred_at desc)
  where result <> 'SUCCESS';
