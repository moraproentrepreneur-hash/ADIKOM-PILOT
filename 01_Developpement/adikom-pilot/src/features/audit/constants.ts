/**
 * Journal d'activité — vocabulaire d'affichage.
 *
 * Le journal stocke des noms techniques : `app_users`, `PERMISSION_CHANGE`,
 * `billing`. Les rendre tels quels ferait un écran juste et illisible —
 * `06_Audit.md` §83 attend qu'ADIKOM puisse répondre « qui a fait quoi », pas
 * déchiffrer un schéma.
 *
 * CE FICHIER NE DÉCIDE D'AUCUN ACCÈS. La correspondance entre un type d'objet
 * et la capacité qui en ouvre le détail vit EN BASE
 * (`audit_detail_permission`, migration 064) : une règle de sécurité écrite en
 * TypeScript ne protégerait rien d'un appel direct à l'API. Ici, seulement des
 * libellés.
 */

/** Miroir de `public.audit_action`. */
export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'ARCHIVE'
  | 'RESTORE'
  | 'VALIDATE'
  | 'CANCEL'
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PAYMENT'
  | 'TRANSFER'
  | 'IMPUTATION'
  | 'PERMISSION_CHANGE'
  | 'STATUS_CHANGE'
  | 'PRICE_CHANGE'
  | 'SUPPLIER_CHANGE'
  | 'EXPORT'
  | 'ACCESS_DENIED'

/** Miroir de `public.audit_result`. */
export type AuditResult = 'SUCCESS' | 'FAILURE' | 'DENIED'

export const ACTION_LABELS: Record<AuditAction, string> = {
  CREATE: 'Création',
  UPDATE: 'Modification',
  DELETE: 'Suppression',
  ARCHIVE: 'Archivage',
  RESTORE: 'Restauration',
  VALIDATE: 'Validation',
  CANCEL: 'Annulation',
  LOGIN: 'Connexion',
  LOGIN_FAILED: 'Échec de connexion',
  LOGOUT: 'Déconnexion',
  PAYMENT: 'Paiement',
  TRANSFER: 'Virement',
  IMPUTATION: 'Imputation',
  PERMISSION_CHANGE: 'Changement de permission',
  STATUS_CHANGE: 'Changement de statut',
  PRICE_CHANGE: 'Changement de tarif',
  SUPPLIER_CHANGE: 'Changement de fournisseur',
  EXPORT: 'Export',
  ACCESS_DENIED: 'Accès refusé',
}

/**
 * Ordre des actions dans le filtre : les plus fréquentes d'abord, puis les
 * événements financiers, puis ceux de sécurité — l'ordre dans lequel on les
 * cherche, et non l'ordre alphabétique.
 */
export const ACTION_ORDER: readonly AuditAction[] = [
  'CREATE',
  'UPDATE',
  'STATUS_CHANGE',
  'VALIDATE',
  'CANCEL',
  'ARCHIVE',
  'RESTORE',
  'DELETE',
  'PAYMENT',
  'IMPUTATION',
  'TRANSFER',
  'PRICE_CHANGE',
  'SUPPLIER_CHANGE',
  'PERMISSION_CHANGE',
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'EXPORT',
  'ACCESS_DENIED',
]

export const RESULT_LABELS: Record<AuditResult, string> = {
  SUCCESS: 'Réussie',
  FAILURE: 'Échec',
  DENIED: 'Refusée',
}

/**
 * Le ton dit d'un coup d'œil ce qui mérite un regard.
 *
 * `06_Audit.md` §60 exige de distinguer réussite, échec et refus ; §50 fait du
 * journal un outil de détection. Un refus en gris se perdrait dans la liste.
 */
export const RESULT_TONES: Record<AuditResult, 'success' | 'warning' | 'danger'> = {
  SUCCESS: 'success',
  FAILURE: 'warning',
  DENIED: 'danger',
}

/** Modules d'origine — miroir des codes passés à `fn_audit_row`. */
export const MODULE_LABELS: Record<string, string> = {
  users: 'Utilisateurs & Groupes',
  parties: 'Tiers',
  rental: 'Gestion de location',
  billing: 'Facturation & Paiement',
  treasury: 'Banques & Caisses',
  projects: 'Projets & Planification',
  settings: 'Paramètres',
}

export const MODULE_ORDER: readonly string[] = [
  'users',
  'parties',
  'rental',
  'billing',
  'treasury',
  'projects',
  'settings',
]

/**
 * Types d'objet journalisés — `06_Audit.md` §7 et §47.
 *
 * La liste reprend les tables réellement porteuses d'un déclencheur d'audit.
 * Elle sert au filtre « objet » et au libellé de chaque ligne.
 *
 * Un type absent d'ici n'est pas masqué : il s'affiche sous son nom technique
 * (voir `entityLabel`). Taire un événement parce qu'on n'a pas su le nommer
 * serait le pire des deux comportements possibles.
 */
export const ENTITY_LABELS: Record<string, string> = {
  // Utilisateurs & Groupes
  app_users: 'Utilisateur',
  user_departments: 'Rattachement à un département',
  user_groups: 'Appartenance à un groupe',
  groups: 'Groupe',
  group_permissions: 'Permissions d’un groupe',
  user_permissions: 'Permissions d’un utilisateur',

  // Tiers
  clients: 'Client',
  suppliers: 'Fournisseur',
  partners: 'Partenaire',
  supplier_bank_details: 'Coordonnées bancaires fournisseur',
  supplier_payment_details: 'Coordonnées de règlement fournisseur',

  // Gestion de location
  vehicles: 'Véhicule',
  vehicle_supplier_history: 'Changement de fournisseur d’un véhicule',
  vehicle_occupations: 'Occupation de véhicule',
  vehicle_categories: 'Catégorie de véhicule',
  vehicle_documents: 'Document de véhicule',
  pricing_rules: 'Règle tarifaire',
  reservations: 'Réservation',
  rentals: 'Location',
  rental_inspections: 'État des lieux',
  rental_inspection_photos: 'Photo d’état des lieux',
  vehicle_incidents: 'Incident',
  incident_damages: 'Dommage constaté',
  incident_photos: 'Photo d’incident',
  vehicle_maintenances: 'Maintenance',
  maintenance_documents: 'Document de maintenance',
  maintenance_quotes: 'Devis de maintenance',
  maintenance_costs: 'Coût de maintenance',
  maintenance_cost_lines: 'Ligne de coût de maintenance',

  // Facturation & Paiement
  customer_invoices: 'Facture client',
  customer_invoice_lines: 'Ligne de facture client',
  customer_payments: 'Règlement client',
  supplier_invoices: 'Facture fournisseur',
  supplier_invoice_lines: 'Ligne de facture fournisseur',
  supplier_payments: 'Règlement fournisseur',
  imputations: 'Imputation',
  imputation_documents: 'Justificatif d’imputation',

  // Banques & Caisses
  financial_accounts: 'Compte financier',
  treasury_entries: 'Écriture',

  // Projets & Planification
  projects: 'Projet',
  project_members: 'Membre de projet',
  project_tasks: 'Tâche',
  project_meetings: 'Réunion',
  project_meeting_participants: 'Participant à une réunion',
  project_appointments: 'Rendez-vous',
  project_appointment_participants: 'Participant à un rendez-vous',
  project_decisions: 'Décision',
  project_actions: 'Action',

  // Paramètres
  company_settings: 'Paramètres entreprise',
  numbering_rules: 'Règle de numérotation',
}

/** Types d'objet proposés au filtre, regroupés par module (§44 et §47). */
export const ENTITIES_BY_MODULE: Record<string, readonly string[]> = {
  users: [
    'app_users',
    'groups',
    'user_groups',
    'user_departments',
    'user_permissions',
    'group_permissions',
  ],
  parties: [
    'clients',
    'suppliers',
    'partners',
    'supplier_payment_details',
    'supplier_bank_details',
  ],
  rental: [
    'vehicles',
    'vehicle_categories',
    'vehicle_documents',
    'vehicle_supplier_history',
    'vehicle_occupations',
    'pricing_rules',
    'reservations',
    'rentals',
    'rental_inspections',
    'rental_inspection_photos',
    'vehicle_incidents',
    'incident_damages',
    'incident_photos',
    'vehicle_maintenances',
    'maintenance_quotes',
    'maintenance_documents',
    'maintenance_costs',
    'maintenance_cost_lines',
  ],
  billing: [
    'customer_invoices',
    'customer_invoice_lines',
    'customer_payments',
    'supplier_invoices',
    'supplier_invoice_lines',
    'supplier_payments',
    'imputations',
    'imputation_documents',
  ],
  treasury: ['financial_accounts', 'treasury_entries'],
  projects: [
    'projects',
    'project_members',
    'project_tasks',
    'project_meetings',
    'project_meeting_participants',
    'project_appointments',
    'project_appointment_participants',
    'project_decisions',
    'project_actions',
  ],
  settings: ['company_settings', 'numbering_rules'],
}

/** Libellé d'un type d'objet, ou son nom technique si personne ne l'a nommé. */
export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType
}

/** Libellé d'un module, ou son code. `null` pour un événement sans module. */
export function moduleLabel(code: string | null): string | null {
  if (!code) return null
  return MODULE_LABELS[code] ?? code
}

/**
 * Noms techniques des colonnes, rendus lisibles dans le détail avant/après.
 *
 * La liste ne couvre pas les centaines de colonnes du schéma, et n'a pas à le
 * faire : les préfixes et suffixes communs suffisent à rendre la majorité
 * compréhensible, et une colonne non traduite reste affichée sous son nom
 * plutôt que masquée.
 */
const FIELD_LABELS: Record<string, string> = {
  id: 'Identifiant',
  status: 'Statut',
  is_active: 'Actif',
  label: 'Libellé',
  name: 'Nom',
  code: 'Code',
  description: 'Description',
  first_name: 'Prénom',
  last_name: 'Nom',
  email: 'Email',
  phone: 'Téléphone',
  username: 'Identifiant de connexion',
  job_title: 'Fonction',
  manager_id: 'Responsable',
  is_super_admin: 'Super Admin',
  must_change_password: 'Changement de mot de passe requis',
  last_login_at: 'Dernière connexion',
  effect: 'Effet',
  permission_id: 'Permission',
  group_id: 'Groupe',
  user_id: 'Utilisateur',
  amount: 'Montant',
  gross_amount: 'Montant brut',
  total: 'Total',
  subtotal: 'Sous-total',
  discount: 'Réduction',
  unit: 'Unité',
  currency_code: 'Devise',
  invoice_date: 'Date de facture',
  due_date: 'Échéance',
  entry_date: 'Date d’écriture',
  direction: 'Sens',
  reason: 'Motif',
  comment: 'Commentaire',
  notes: 'Notes',
  created_at: 'Créé le',
  created_by: 'Créé par',
  updated_at: 'Modifié le',
  updated_by: 'Modifié par',
  validated_at: 'Validé le',
  validated_by: 'Validé par',
  cancelled_at: 'Annulé le',
  cancelled_by: 'Annulé par',
  plate: 'Immatriculation',
  brand: 'Marque',
  model: 'Modèle',
  mileage: 'Kilométrage',
  supplier_id: 'Fournisseur',
  client_id: 'Client',
  vehicle_id: 'Véhicule',
  category_id: 'Catégorie',
  rental_id: 'Location',
  reservation_id: 'Réservation',
  invoice_id: 'Facture',
  account_id: 'Compte',
  project_id: 'Projet',
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field
}

/**
 * Champs que le détail n'affiche jamais.
 *
 * Ils changent à chaque écriture sans rien apprendre — les afficher noierait le
 * changement réel sous du bruit technique (§80 : ne conserver, et ne montrer,
 * que ce qui sert la traçabilité). L'horodatage de l'événement porte déjà le
 * « quand », et son auteur le « qui ».
 */
const TECHNICAL_FIELDS = new Set(['updated_at', 'updated_by', 'created_at'])

export type FieldChange = {
  field: string
  label: string
  before: string | null
  after: string | null
}

/** Rend une valeur JSON lisible sans jamais prétendre l'interpréter. */
export function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value === '' ? null : value
  return JSON.stringify(value)
}

/**
 * Différence lisible entre deux états — `06_Audit.md` §9, §10 et §24.
 *
 * Une CRÉATION n'a pas d'avant : toutes ses valeurs renseignées sont montrées.
 * Une SUPPRESSION n'a pas d'après : c'est l'état perdu qui compte.
 * Une MODIFICATION ne montre que ce qui a changé — le reste n'est pas
 * l'événement.
 */
export function diffFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): FieldChange[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])

  const changes: FieldChange[] = []

  for (const field of keys) {
    if (TECHNICAL_FIELDS.has(field)) continue

    const from = formatValue(before?.[field])
    const to = formatValue(after?.[field])

    if (before && after && from === to) continue
    if (from === null && to === null) continue

    changes.push({ field, label: fieldLabel(field), before: from, after: to })
  }

  return changes.sort((a, b) => a.label.localeCompare(b.label, 'fr'))
}
