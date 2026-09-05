import type { BadgeTone } from '@/components/ui/primitives'
import { PERMISSIONS, type PermissionCode } from '@/lib/auth/permissions'

/**
 * Le vocabulaire du Centre de notifications — Module 02.
 *
 * LA BASE DIT CE QUI SE PASSE, L'ÉCRAN DIT COMMENT ON LE LIT.
 *
 * `notifications_watch()` (migration 056) rend des faits : une nature (`kind`),
 * un niveau, un objet, une échéance, parfois un montant. Aucune phrase française
 * n'est écrite en SQL — les libellés vivent ici, où ils se relisent et se
 * corrigent sans migration.
 *
 * Réciproquement, AUCUN NIVEAU N'EST DÉCIDÉ ICI : il vient de la veille, qui le
 * tient des exemples du §4. L'écran ne fait que l'écrire (§20 du Module 01 :
 * « la présentation doit permettre de distinguer les niveaux sans dépendre
 * uniquement de la couleur » — chaque niveau porte donc un MOT).
 */

/* -------------------------------------------------------------------------- */
/*  Niveaux — §4, §25                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Les quatre niveaux réellement produits.
 *
 * `INFORMATION` (§4.1) n'y figure pas : les notifications de création —
 * « nouveau client », « véhicule ajouté » — sont des événements, non des
 * situations, et relèvent de l'activité récente dont l'écran est en Phase 4
 * (DEC-032 §h, reconduit par DEC-033). Déclarer un niveau que rien ne produit
 * offrirait un filtre toujours vide.
 */
export const LEVELS = ['URGENT', 'IMPORTANT', 'ATTENTION', 'REMINDER'] as const

export type NotificationLevel = (typeof LEVELS)[number]

/**
 * §4.3 nomme ce niveau « Attention », §25 « À surveiller ». C'est le même, et
 * c'est le second mot qui est retenu : le tableau de bord l'emploie déjà
 * (LOT 9), et deux écrans du même produit ne doivent pas nommer différemment la
 * même chose.
 */
export const LEVEL_LABELS: Record<NotificationLevel, string> = {
  URGENT: 'Urgent',
  IMPORTANT: 'Important',
  ATTENTION: 'À surveiller',
  REMINDER: 'Rappel',
}

export const LEVEL_TONES: Record<NotificationLevel, BadgeTone> = {
  URGENT: 'danger',
  IMPORTANT: 'warning',
  ATTENTION: 'neutral',
  REMINDER: 'info',
}

/** Le rang du §25, miroir de `notification_level_rank` en base. */
export const LEVEL_RANK: Record<NotificationLevel, number> = {
  URGENT: 1,
  IMPORTANT: 2,
  ATTENTION: 3,
  REMINDER: 4,
}

export function isLevel(value: string | undefined): value is NotificationLevel {
  return LEVELS.includes(value as NotificationLevel)
}

/* -------------------------------------------------------------------------- */
/*  Modules d'origine — §5, §18                                                */
/* -------------------------------------------------------------------------- */

/**
 * Trois modules produisent des notifications, et seulement trois : c'est ce que
 * le filtre propose. En annoncer d'autres promettrait des sources qui n'existent
 * pas encore (§38 : l'évolutivité n'est pas une promesse d'écran).
 *
 * `projects` est arrivé avec le LOT 12 : le Module 03 §38 demande que les
 * échéances et les retards de tâche alimentent le centre. Les autres événements
 * qu'il cite — « tâche attribuée », « modification importante » — sont des
 * ÉVÉNEMENTS de création et relèvent de l'arbitrage ouvert par DEC-033 §h.
 */
export const SOURCES = ['rental', 'billing', 'projects'] as const

export type NotificationSource = (typeof SOURCES)[number]

export const SOURCE_LABELS: Record<NotificationSource, string> = {
  rental: 'Gestion de location',
  billing: 'Facturation & Paiement',
  projects: 'Projets & Planification',
}

export function isSource(value: string | undefined): value is NotificationSource {
  return SOURCES.includes(value as NotificationSource)
}

/* -------------------------------------------------------------------------- */
/*  États de lecture — §18, §19                                                */
/* -------------------------------------------------------------------------- */

export const STATES = ['unread', 'read'] as const

export type NotificationState = (typeof STATES)[number]

export const STATE_LABELS: Record<NotificationState, string> = {
  unread: 'Non lues',
  read: 'Lues',
}

export function isState(value: string | undefined): value is NotificationState {
  return STATES.includes(value as NotificationState)
}

/* -------------------------------------------------------------------------- */
/*  Natures — §6 à §13                                                         */
/* -------------------------------------------------------------------------- */

export const KINDS = [
  'RESERVATION_DEPARTURE',
  'RENTAL_RETURN_DUE',
  'RENTAL_RETURN_LATE',
  'RENTAL_TO_CONTROL',
  'RENTAL_VEHICLE_IMMOBILIZED',
  'VEHICLE_IMMOBILIZED',
  'MAINTENANCE_PLANNED',
  'MAINTENANCE_LATE',
  'INCIDENT_ON_RENTAL',
  'VEHICLE_DOCUMENT_EXPIRING',
  'VEHICLE_DOCUMENT_EXPIRED',
  'CUSTOMER_INVOICE_OVERDUE',
  'SUPPLIER_INVOICE_OVERDUE',
  'TASK_DUE',
  'TASK_LATE',
  'MEETING_SOON',
  'APPOINTMENT_SOON',
] as const

export type NotificationKind = (typeof KINDS)[number]

type KindMeta = {
  /** Le titre : ce qui se passe, en quelques mots (§5). */
  title: string
  /** L'origine, telle qu'elle se lit dans la navigation (§5, §18). */
  origin: string
  /**
   * La précision de l'instant.
   *
   * `minute` pour un départ, un retour, un constat — l'heure fait partie de
   * l'information. `day` pour une échéance : une facture est due LE 5, pas à
   * 00:00 le 5. Afficher « 00:00 » derrière une échéance inventerait une
   * précision que la donnée n'a pas.
   */
  precision: 'day' | 'minute'
  /** La phrase qui situe la notification dans le temps. */
  moment: (formatted: string) => string
}

/**
 * Un titre par nature — jamais de phrase construite au hasard.
 *
 * Le §5 demande qu'une notification « contienne suffisamment d'informations pour
 * être comprise rapidement » : le titre dit LA SITUATION, le sujet dit SUR QUOI,
 * et la phrase de temps dit QUAND. Les trois viennent de sources différentes et
 * ne se mélangent pas.
 */
export const KIND_META: Record<NotificationKind, KindMeta> = {
  RESERVATION_DEPARTURE: {
    title: 'Départ prévu',
    origin: 'Location · Réservations',
    precision: 'minute',
    moment: (at) => `Départ prévu le ${at}`,
  },
  RENTAL_RETURN_DUE: {
    title: 'Retour prévu',
    origin: 'Location · Locations',
    precision: 'minute',
    moment: (at) => `Retour attendu le ${at}`,
  },
  RENTAL_RETURN_LATE: {
    title: 'Retour non enregistré',
    origin: 'Location · Locations',
    precision: 'minute',
    moment: (at) => `Retour attendu le ${at}, non enregistré`,
  },
  RENTAL_TO_CONTROL: {
    title: 'Contrôle de retour à effectuer',
    origin: 'Location · Locations',
    precision: 'minute',
    moment: (at) => `Véhicule rentré le ${at}`,
  },
  RENTAL_VEHICLE_IMMOBILIZED: {
    title: 'Véhicule immobilisé pendant une location',
    origin: 'Location · Locations',
    precision: 'minute',
    moment: (at) => `Immobilisé depuis le ${at}`,
  },
  VEHICLE_IMMOBILIZED: {
    title: 'Véhicule immobilisé',
    origin: 'Location · Parc automobile',
    precision: 'minute',
    moment: (at) => `Immobilisé depuis le ${at}`,
  },
  MAINTENANCE_PLANNED: {
    title: 'Maintenance prévue',
    origin: 'Location · Maintenance',
    precision: 'minute',
    moment: (at) => `Intervention prévue le ${at}`,
  },
  MAINTENANCE_LATE: {
    title: 'Maintenance en retard',
    origin: 'Location · Maintenance',
    precision: 'minute',
    moment: (at) => `Prévue le ${at}, non engagée`,
  },
  INCIDENT_ON_RENTAL: {
    title: 'Incident sur un véhicule en location',
    origin: 'Location · Dommages & Incidents',
    precision: 'minute',
    moment: (at) => `Survenu le ${at}`,
  },
  VEHICLE_DOCUMENT_EXPIRING: {
    title: 'Document proche de l’expiration',
    origin: 'Location · Parc automobile',
    precision: 'day',
    moment: (at) => `Expire le ${at}`,
  },
  VEHICLE_DOCUMENT_EXPIRED: {
    title: 'Document expiré',
    origin: 'Location · Parc automobile',
    precision: 'day',
    moment: (at) => `Expiré depuis le ${at}`,
  },
  CUSTOMER_INVOICE_OVERDUE: {
    title: 'Facture client échue',
    origin: 'Facturation · Factures clients',
    precision: 'day',
    moment: (at) => `Échéance dépassée depuis le ${at}`,
  },
  SUPPLIER_INVOICE_OVERDUE: {
    title: 'Facture fournisseur échue',
    origin: 'Facturation · Factures fournisseurs',
    precision: 'day',
    moment: (at) => `Échéance dépassée depuis le ${at}`,
  },
  // Module 03 §15 : « cette tâche arrive à échéance demain ». Une échéance est
  // un JOUR, jamais un instant : afficher « 00:00 » inventerait une précision.
  TASK_DUE: {
    title: 'Échéance de tâche proche',
    origin: 'Projets · Tâches',
    precision: 'day',
    moment: (at) => `À faire pour le ${at}`,
  },
  TASK_LATE: {
    title: 'Tâche en retard',
    origin: 'Projets · Tâches',
    precision: 'day',
    moment: (at) => `Échéance dépassée depuis le ${at}`,
  },
  /*
   * Module 03 §38 : « réunion à venir ; rendez-vous à venir ».
   *
   * `minute`, contrairement aux échéances de tâche : une réunion a une HEURE, et
   * c'est précisément l'information utile — savoir qu'elle est « demain » sans
   * savoir à quelle heure n'aide personne à s'organiser (§21, §26).
   */
  MEETING_SOON: {
    title: 'Réunion à venir',
    origin: 'Projets · Réunions',
    precision: 'minute',
    moment: (at) => `Prévue le ${at}`,
  },
  APPOINTMENT_SOON: {
    title: 'Rendez-vous à venir',
    origin: 'Projets · Rendez-vous',
    precision: 'minute',
    moment: (at) => `Prévu le ${at}`,
  },
}

/** Le libellé du montant, lorsqu'il y en a un — jamais « montant » tout court. */
export const AMOUNT_LABELS: Partial<Record<NotificationKind, string>> = {
  CUSTOMER_INVOICE_OVERDUE: 'Reste à encaisser',
  // « Brut − imputé − payé » (CLAUDE.md §16) : le libellé le DIT, sans quoi le
  // lecteur pourrait croire qu'il s'agit du montant facturé.
  SUPPLIER_INVOICE_OVERDUE: 'Reste à payer, imputations déduites',
}

/* -------------------------------------------------------------------------- */
/*  Accès à l'objet concerné — §21, §34                                        */
/* -------------------------------------------------------------------------- */

export const OBJECT_TYPES = [
  'reservation',
  'rental',
  'vehicle',
  'maintenance',
  'incident',
  'customer_invoice',
  'supplier_invoice',
  'task',
  'meeting',
  'appointment',
] as const

export type NotificationObject = (typeof OBJECT_TYPES)[number]

/**
 * « Notification → Réservation → Fiche réservation » (§21).
 *
 * CE LIEN N'EST PAS UN CONTOURNEMENT. §21 l'exige : « si l'utilisateur n'a plus
 * accès à l'objet, la notification ne doit pas permettre de contourner les
 * restrictions ». Chaque écran de destination vérifie de nouveau sa capacité, et
 * la notification n'existe de toute façon que pour qui détient la lecture dont
 * elle dépend (migration 056).
 */
export const OBJECT_HREF: Record<NotificationObject, (id: string) => string> = {
  reservation: (id) => `/location/reservations/${id}`,
  rental: (id) => `/location/locations/${id}`,
  vehicle: (id) => `/location/parc/${id}?onglet=documents`,
  maintenance: (id) => `/location/maintenance/${id}`,
  incident: (id) => `/location/incidents/${id}`,
  customer_invoice: (id) => `/facturation/clients/${id}`,
  supplier_invoice: (id) => `/facturation/fournisseurs/${id}`,
  task: (id) => `/projets/taches/${id}`,
  meeting: (id) => `/projets/reunions/${id}`,
  appointment: (id) => `/projets/rendez-vous/${id}`,
}

/** « Action : Voir la location » (§34) — adaptée au contexte, jamais générique. */
export const OBJECT_ACTION: Record<NotificationObject, string> = {
  reservation: 'Voir la réservation',
  rental: 'Voir la location',
  vehicle: 'Voir le véhicule',
  maintenance: 'Voir la maintenance',
  incident: 'Voir l’incident',
  customer_invoice: 'Voir la facture',
  supplier_invoice: 'Voir la facture',
  task: 'Voir la tâche',
  meeting: 'Voir la réunion',
  appointment: 'Voir le rendez-vous',
}

export function isObjectType(value: string): value is NotificationObject {
  return OBJECT_TYPES.includes(value as NotificationObject)
}

/* -------------------------------------------------------------------------- */
/*  Les sources de la veille, et ce qu'elles exigent — §22, §37                */
/* -------------------------------------------------------------------------- */

/**
 * Miroir applicatif des familles de la migration 056.
 *
 * Il ne sert PAS à protéger — la base refuse ou se tait d'elle-même. Il sert à
 * DIRE au lecteur quelles sources ne lui sont pas ouvertes, plutôt que de lui
 * laisser croire que rien ne se passe. C'est la leçon de DEC-017, appliquée à
 * une absence de notification.
 *
 * `any` : la source s'ouvre avec l'une OU l'autre des capacités — c'est le cas
 * des documents de véhicule, dont la policy accepte les deux (migration 008).
 */
export type WatchSource = {
  label: string
  requires: PermissionCode[]
  mode?: 'all' | 'any'
}

export const WATCH_SOURCES: WatchSource[] = [
  {
    label: 'Départs de réservation',
    requires: [PERMISSIONS.RESERVATIONS_VIEW],
  },
  {
    label: 'Retours, retards et contrôles de location',
    requires: [PERMISSIONS.RENTALS_VIEW],
  },
  {
    label: 'Véhicules immobilisés',
    requires: [PERMISSIONS.FLEET_VIEW],
  },
  {
    label: 'Maintenances prévues et en retard',
    requires: [PERMISSIONS.MAINTENANCE_VIEW],
  },
  {
    label: 'Incidents survenus pendant une location',
    requires: [PERMISSIONS.INCIDENTS_VIEW, PERMISSIONS.RENTALS_VIEW],
    mode: 'all',
  },
  {
    label: 'Échéances de documents de véhicule',
    requires: [PERMISSIONS.VEHICLE_DOCUMENTS_VIEW, PERMISSIONS.FLEET_VIEW],
    mode: 'any',
  },
  {
    label: 'Factures clients échues',
    requires: [PERMISSIONS.CUSTOMER_INVOICES_VIEW, PERMISSIONS.CUSTOMER_PAYMENTS_VIEW],
    mode: 'all',
  },
  {
    label: 'Factures fournisseurs échues',
    requires: [
      PERMISSIONS.SUPPLIER_INVOICES_VIEW,
      PERMISSIONS.IMPUTATIONS_VIEW,
      PERMISSIONS.SUPPLIER_PAYMENTS_VIEW,
    ],
    mode: 'all',
  },
  /*
   * Une seule lecture suffit, et c'est voulu : `projects.view` n'est PAS exigée.
   *
   * Sans elle, le nom du projet manque — la notification le dit alors sans lui,
   * et son échéance reste vraie. C'est une ABSENCE, pas un mensonge : la règle
   * du refus (DEC-034 §c) ne vise que ce qui rendrait le contenu FAUX.
   */
  {
    label: 'Échéances et retards de tâches',
    requires: [PERMISSIONS.TASKS_VIEW],
  },
  /*
   * LOT 13 — `Module 03` §38 : « réunion à venir ; rendez-vous à venir ».
   *
   * Chacune sa capacité, et aucune n'en implique une autre : consulter les
   * réunions n'ouvre pas les rendez-vous. Le nom du projet, celui du
   * responsable et celui du tiers arrivent par jointure externe — leur absence
   * retire un détail, jamais l'annonce elle-même.
   */
  {
    label: 'Réunions à venir',
    requires: [PERMISSIONS.MEETINGS_VIEW],
  },
  {
    label: 'Rendez-vous à venir',
    requires: [PERMISSIONS.APPOINTMENTS_VIEW],
  },
]
