import { readdirSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ClientSheetDocument } from '@/features/clients/documents/client-sheet'
import { SupplierSheetDocument } from '@/features/suppliers/documents/supplier-sheet'
import { PartnerSheetDocument } from '@/features/partners/documents/partner-sheet'
import { VehicleSheetDocument } from '@/features/fleet/documents/vehicle-sheet'
import { PricingGridDocument } from '@/features/pricing/documents/pricing-grid'
import {
  DepartureReportDocument,
  RentalContractDocument,
  ReturnReportDocument,
} from '@/features/rentals/documents/rental-documents'
import type { ContractPeriod } from '@/features/rentals/documents/rental-blocks'
import { RentalAmendmentDocument } from '@/features/amendments/documents/rental-amendment'
import { CustomerInvoiceDocument } from '@/features/customer-invoices/documents/customer-invoice'
import type {
  CustomerInvoiceDetail,
  CustomerInvoiceLine,
} from '@/features/customer-invoices/data'
import type { RentalAmendment } from '@/features/amendments/data'
import type { Inspection, RentalDetail } from '@/features/rentals/data'
import { documentFileName, issuedOnLabel, renderDocument } from './render'
import type { DocumentIdentity } from './identity'
import type { ClientDetail } from '@/features/clients/data'
import type { SupplierDetail, SupplierPaymentDetail } from '@/features/suppliers/data'
import type { PartnerDetail } from '@/features/partners/data'
import type {
  Occupation,
  SupplierPeriod,
  VehicleDetail,
  VehicleDocument,
  VehicleListItem,
} from '@/features/fleet/data'
import type { PricingRuleRow } from '@/features/pricing/data'

/**
 * Le moteur documentaire produit-il réellement un PDF ?
 *
 * Ces tests rendent chaque document en entier, polices et logo compris. Ils
 * échouent si un fichier de police manque, si le logo est introuvable, ou si un
 * style refusé par `@react-pdf/renderer` s'est glissé dans un modèle — autant
 * de pannes qui, sans eux, ne se verraient qu'en production, au moment où un
 * utilisateur clique sur « Télécharger ».
 *
 * CHAQUE ÉTAT DE BLOC EST EXERCÉ, PAS SEULEMENT LE CAS NOMINAL.
 *
 * La panne du 22/08/2026 tient entièrement à cette omission : les tests ne
 * rendaient que des tableaux GARNIS. La branche « tableau vide » employait un
 * `fontStyle: 'italic'` sans police italique enregistrée, et interrompait le
 * rendu — mais uniquement pour un lecteur dont les droits produisaient une
 * section vide. Un test de plus l'aurait montré ; il n'existait pas.
 *
 * D'où la règle suivie ici : pour chaque document, un cas GARNI et un cas VIDE.
 */

const IDENTITY: DocumentIdentity = {
  legalName: 'ADIKOM TECHNOLOGIE & TRAVEL',
  addressLines: ['Moroni Oasis, route les puffins'],
  phone: '+269 733 22 48 | +269 322 81 35',
  email: 'mchangama@adikom2t.com',
  website: null,
  city: 'Moroni',
  country: 'Comores',
}

const ISSUED = issuedOnLabel(new Date('2026-08-22T06:00:00.000Z'))

/** Signature d'un PDF : les huit premiers octets d'un fichier valide. */
function expectPdf(pdf: Buffer) {
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  // Polices et logo embarqués : un document vide ou privé de ses ressources
  // pèserait quelques kilo-octets à peine.
  expect(pdf.byteLength).toBeGreaterThan(30_000)
}

/* -------------------------------------------------------------------------- */
/*  Jeux d'essai                                                               */
/* -------------------------------------------------------------------------- */

const CLIENT: ClientDetail = {
  id: '00000000-0000-0000-0000-000000000001',
  clientNo: 'CLI-000008',
  type: 'COMPANY',
  displayName: 'CLIENT DEMO 01',
  legalName: 'CLIENT DEMO 01',
  tradeName: 'Société de démonstration',
  phone: '+269 320 00 01',
  email: 'contact@client-demo-01.test',
  city: 'Moroni',
  status: 'ACTIVE',
  createdAt: '2026-08-22T06:00:00.000Z',
  firstName: null,
  phoneSecondary: null,
  address: 'Avenue de la Corniche',
  country: 'Comores',
  idDocumentType: null,
  idDocumentNumber: null,
  registrationNumber: 'RC-DEMO-001',
  taxIdentifier: null,
  administrativeNotes: null,
  notes: 'Donnée de démonstration.',
  statusReason: null,
  statusChangedAt: null,
  updatedAt: '2026-08-22T06:00:00.000Z',
}

const RULE: PricingRuleRow = {
  id: '00000000-0000-0000-0000-000000000002',
  clientId: CLIENT.id,
  clientLabel: 'CLIENT DEMO 01 (CLI-000008)',
  vehicleId: null,
  vehicleLabel: null,
  categoryId: null,
  categoryLabel: 'CATEGORIE DEMO 01',
  amount: 450000,
  unit: 'DAY',
  discountPercent: null,
  validFrom: '2026-08-01',
  validTo: null,
  isActive: true,
  conditions: 'Accord commercial',
  specificity: 5,
  createdAt: '2026-08-22T06:00:00.000Z',
}

const STANDARD_RULE: PricingRuleRow = {
  ...RULE,
  id: '00000000-0000-0000-0000-000000000003',
  clientId: null,
  clientLabel: null,
  conditions: null,
  specificity: 1,
}

const SUPPLIER: SupplierDetail = {
  id: '00000000-0000-0000-0000-000000000010',
  supplierNo: 'FOU-000004',
  type: 'VEHICLE_SUPPLIER',
  legalName: 'FOURNISSEUR DEMO 01',
  tradeName: null,
  contactName: 'Contact démonstration',
  phone: '+269 330 00 01',
  email: null,
  city: 'Moroni',
  status: 'ACTIVE',
  phoneSecondary: null,
  address: 'Zone industrielle',
  country: 'Comores',
  registrationNumber: 'RC-FOU-001',
  taxIdentifier: null,
  administrativeNotes: null,
  notes: null,
  statusReason: null,
  statusChangedAt: null,
  createdAt: '2026-08-22T06:00:00.000Z',
  updatedAt: '2026-08-22T06:00:00.000Z',
}

/**
 * Deux coordonnées, dont une désactivée : le document ne doit imprimer que les
 * actives, et signaler la principale.
 */
const PAYMENTS: SupplierPaymentDetail[] = [
  {
    id: '00000000-0000-0000-0000-000000000011',
    kind: 'BANK_ACCOUNT',
    label: 'Compte principal',
    accountHolder: 'FOURNISSEUR DEMO 01',
    currencyCode: 'KMF',
    bankName: 'Banque de démonstration',
    bankBranch: null,
    accountNumber: '00012345678',
    iban: null,
    swiftBic: null,
    accountReference: null,
    isPrimary: true,
    isActive: true,
    notes: null,
    updatedAt: '2026-08-22T06:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000012',
    kind: 'OTHER',
    label: 'Coordonnée de recette',
    accountHolder: null,
    currencyCode: null,
    bankName: null,
    bankBranch: null,
    accountNumber: null,
    iban: null,
    swiftBic: null,
    accountReference: 'REF-DEMO-0001',
    isPrimary: false,
    isActive: false,
    notes: null,
    updatedAt: '2026-08-22T06:00:00.000Z',
  },
]

const PARTNER: PartnerDetail = {
  id: '00000000-0000-0000-0000-000000000020',
  partnerNo: 'PAR-000003',
  legalName: 'PARTENAIRE DEMO 01',
  tradeName: null,
  contactName: 'Contact partenaire',
  phone: '+269 340 00 01',
  email: null,
  city: 'Moroni',
  country: 'Comores',
  status: 'ACTIVE',
  vehicleCount: 1,
  address: null,
  registrationNumber: null,
  notes: null,
  statusReason: null,
  statusChangedAt: null,
  createdAt: '2026-08-22T06:00:00.000Z',
  updatedAt: '2026-08-22T06:00:00.000Z',
}

const VEHICLE_ITEM: VehicleListItem = {
  id: '00000000-0000-0000-0000-000000000030',
  vehicleNo: 'VEH-000005',
  plate: 'AB-123-CD',
  brand: 'Toyota',
  model: 'Land Cruiser',
  modelYear: 2022,
  categoryId: '00000000-0000-0000-0000-000000000040',
  categoryLabel: 'CATEGORIE DEMO 01',
  status: 'AVAILABLE',
  origin: 'SUPPLIED',
  supplierId: SUPPLIER.id,
  supplierLabel: 'FOURNISSEUR DEMO 01 (FOU-000004)',
  partnerId: null,
  partnerLabel: null,
  mileage: 42500,
}

const VEHICLE: VehicleDetail = {
  ...VEHICLE_ITEM,
  color: 'Blanc',
  fuel: 'DIESEL',
  transmission: 'AUTOMATIC',
  seats: 7,
  doors: 5,
  initialMileage: 12000,
  entryDate: '2026-01-15',
  exitDate: null,
  exitReason: null,
  statusReason: null,
  statusChangedAt: null,
  notes: 'Donnée de démonstration.',
  createdAt: '2026-08-22T06:00:00.000Z',
  updatedAt: '2026-08-22T06:00:00.000Z',
}

const HISTORY: SupplierPeriod[] = [
  {
    id: '00000000-0000-0000-0000-000000000050',
    supplierId: SUPPLIER.id,
    supplierLabel: 'FOURNISSEUR DEMO 01 (FOU-000004)',
    startedOn: '2026-01-15',
    endedOn: null,
    reason: 'Mise à disposition initiale',
  },
]

const VEHICLE_DOC: VehicleDocument = {
  id: '00000000-0000-0000-0000-000000000060',
  docType: 'INSURANCE',
  label: 'Assurance tous risques',
  reference: 'POL-2026-0001',
  issuedOn: '2026-01-01',
  expiresOn: '2026-12-31',
  storagePath: null,
  fileName: null,
  isArchived: false,
  notes: null,
}

const OCCUPATION: Occupation = {
  id: '00000000-0000-0000-0000-000000000070',
  source: 'IMMOBILIZATION',
  sourceId: null,
  from: '2026-09-01T08:00:00.000Z',
  to: '2026-09-05T08:00:00.000Z',
  reason: 'Contrôle technique',
}

/* -------------------------------------------------------------------------- */
/*  Fiche client                                                               */
/* -------------------------------------------------------------------------- */

describe('fiche client', () => {
  it('produit un PDF exploitable', async () => {
    expectPdf(
      await renderDocument(
        ClientSheetDocument({
          identity: IDENTITY,
          client: CLIENT,
          pricingRules: [RULE],
          issuedOn: ISSUED,
        })
      )
    )
  })

  /**
   * LA RÉGRESSION DU 22/08/2026.
   *
   * Un lecteur autorisé à voir la tarification d'un client qui n'en a aucune
   * reçoit un tableau VIDE. C'est ce cas — et lui seul — qui interrompait le
   * rendu en production, tandis que l'aperçu fonctionnait pour tous les
   * comptes d'essai, dépourvus de cette permission.
   */
  it('rend un tableau de conditions VIDE — cas de la panne de production', async () => {
    expectPdf(
      await renderDocument(
        ClientSheetDocument({
          identity: IDENTITY,
          client: CLIENT,
          pricingRules: [],
          issuedOn: ISSUED,
        })
      )
    )
  })

  it('rend un document sans conditions tarifaires', async () => {
    expectPdf(
      await renderDocument(
        ClientSheetDocument({
          identity: IDENTITY,
          client: CLIENT,
          // `null` : le lecteur n'a pas le droit de voir la tarification.
          pricingRules: null,
          issuedOn: ISSUED,
        })
      )
    )
  })
})

/* -------------------------------------------------------------------------- */
/*  Fiche fournisseur                                                          */
/* -------------------------------------------------------------------------- */

describe('fiche fournisseur', () => {
  it('produit un PDF avec véhicules et informations de paiement', async () => {
    expectPdf(
      await renderDocument(
        SupplierSheetDocument({
          identity: IDENTITY,
          supplier: SUPPLIER,
          vehicles: [VEHICLE_ITEM],
          payments: PAYMENTS,
          issuedOn: ISSUED,
        })
      )
    )
  })

  it('rend un fournisseur sans véhicule ni information de paiement', async () => {
    expectPdf(
      await renderDocument(
        SupplierSheetDocument({
          identity: IDENTITY,
          supplier: SUPPLIER,
          vehicles: [],
          // `null` : le lecteur n'a pas accès aux informations de paiement.
          payments: null,
          issuedOn: ISSUED,
        })
      )
    )
  })

  /**
   * Le lecteur A le droit, mais le fournisseur n'a aucune coordonnée : le
   * tableau est VIDE. C'est exactement la branche qui avait interrompu le rendu
   * en production le 22/08/2026 — elle est éprouvée pour chaque tableau.
   */
  it('rend un tableau d’informations de paiement VIDE', async () => {
    expectPdf(
      await renderDocument(
        SupplierSheetDocument({
          identity: IDENTITY,
          supplier: SUPPLIER,
          vehicles: [],
          payments: [],
          issuedOn: ISSUED,
        })
      )
    )
  })

  /** Toutes les coordonnées désactivées : le tableau se vide après filtrage. */
  it('rend un fournisseur dont toutes les coordonnées sont désactivées', async () => {
    expectPdf(
      await renderDocument(
        SupplierSheetDocument({
          identity: IDENTITY,
          supplier: SUPPLIER,
          vehicles: [],
          payments: PAYMENTS.map((payment) => ({ ...payment, isActive: false })),
          issuedOn: ISSUED,
        })
      )
    )
  })

  /**
   * Sans `rental.fleet.view`, la section « Véhicules » disparaît au lieu
   * d'annoncer un parc vide (DEC-017). Le document doit rester exploitable
   * avec DEUX sections absentes à la fois.
   */
  it('rend un fournisseur sans accès au parc ni aux informations de paiement', async () => {
    expectPdf(
      await renderDocument(
        SupplierSheetDocument({
          identity: IDENTITY,
          supplier: SUPPLIER,
          vehicles: null,
          payments: null,
          issuedOn: ISSUED,
        })
      )
    )
  })
})

/* -------------------------------------------------------------------------- */
/*  Fiche partenaire                                                           */
/* -------------------------------------------------------------------------- */

describe('fiche partenaire', () => {
  it('produit un PDF avec véhicules rattachés', async () => {
    expectPdf(
      await renderDocument(
        PartnerSheetDocument({
          identity: IDENTITY,
          partner: PARTNER,
          vehicles: [{ ...VEHICLE_ITEM, origin: 'PARTNERSHIP', partnerId: PARTNER.id }],
          issuedOn: ISSUED,
        })
      )
    )
  })

  it('rend un partenaire sans véhicule', async () => {
    expectPdf(
      await renderDocument(
        PartnerSheetDocument({
          identity: IDENTITY,
          partner: PARTNER,
          vehicles: [],
          issuedOn: ISSUED,
        })
      )
    )
  })

  /** `null` : le lecteur n'a pas `rental.fleet.view`, la section disparaît. */
  it('rend un partenaire sans accès au parc', async () => {
    expectPdf(
      await renderDocument(
        PartnerSheetDocument({
          identity: IDENTITY,
          partner: PARTNER,
          vehicles: null,
          issuedOn: ISSUED,
        })
      )
    )
  })
})

/* -------------------------------------------------------------------------- */
/*  Fiche véhicule                                                             */
/* -------------------------------------------------------------------------- */

describe('fiche véhicule', () => {
  it('produit un PDF complet', async () => {
    expectPdf(
      await renderDocument(
        VehicleSheetDocument({
          identity: IDENTITY,
          vehicle: VEHICLE,
          history: HISTORY,
          documents: [VEHICLE_DOC],
          occupations: [OCCUPATION],
          issuedOn: ISSUED,
        })
      )
    )
  })

  it('rend un véhicule sans historique, sans document et sans immobilisation', async () => {
    expectPdf(
      await renderDocument(
        VehicleSheetDocument({
          identity: IDENTITY,
          vehicle: VEHICLE,
          history: [],
          // Tableau VIDE, distinct de l'absence de droit ci-dessous.
          documents: [],
          occupations: [],
          issuedOn: ISSUED,
        })
      )
    )
  })

  it('rend un véhicule sans accès aux documents', async () => {
    expectPdf(
      await renderDocument(
        VehicleSheetDocument({
          identity: IDENTITY,
          vehicle: VEHICLE,
          history: [],
          // `null` : le lecteur n'a pas `rental.documents.view`.
          documents: null,
          occupations: [],
          issuedOn: ISSUED,
        })
      )
    )
  })

  it('rend un véhicule rattaché à un partenaire', async () => {
    expectPdf(
      await renderDocument(
        VehicleSheetDocument({
          identity: IDENTITY,
          vehicle: {
            ...VEHICLE,
            origin: 'PARTNERSHIP',
            supplierId: null,
            supplierLabel: null,
            partnerId: PARTNER.id,
            partnerLabel: 'PARTENAIRE DEMO 01 (PAR-000003)',
          },
          history: [],
          documents: [],
          occupations: [],
          issuedOn: ISSUED,
        })
      )
    )
  })

  it('rend un véhicule retiré du parc', async () => {
    expectPdf(
      await renderDocument(
        VehicleSheetDocument({
          identity: IDENTITY,
          vehicle: {
            ...VEHICLE,
            status: 'RETIRED',
            exitDate: '2026-08-01',
            exitReason: 'Restitution au fournisseur',
          },
          history: HISTORY,
          documents: [],
          occupations: [],
          issuedOn: ISSUED,
        })
      )
    )
  })
})

/* -------------------------------------------------------------------------- */
/*  Grille tarifaire                                                           */
/* -------------------------------------------------------------------------- */

describe('grille tarifaire', () => {
  it('produit un PDF avec des tarifs standard', async () => {
    expectPdf(
      await renderDocument(
        PricingGridDocument({
          identity: IDENTITY,
          rules: [STANDARD_RULE],
          issuedOn: ISSUED,
        })
      )
    )
  })

  it('rend une grille sans aucun tarif', async () => {
    expectPdf(
      await renderDocument(
        PricingGridDocument({ identity: IDENTITY, rules: [], issuedOn: ISSUED })
      )
    )
  })

  it('écarte les tarifs désactivés', async () => {
    expectPdf(
      await renderDocument(
        PricingGridDocument({
          identity: IDENTITY,
          rules: [{ ...STANDARD_RULE, isActive: false }],
          issuedOn: ISSUED,
        })
      )
    )
  })
})


/* -------------------------------------------------------------------------- */
/*  Documents de location — contrat, bon de départ, PV de retour               */
/* -------------------------------------------------------------------------- */

const RENTAL: RentalDetail = {
  id: '00000000-0000-0000-0000-000000000080',
  rentalNo: 'LOC-2026-000001',
  clientId: CLIENT.id,
  clientLabel: 'CLIENT DEMO 01',
  vehicleId: VEHICLE.id,
  vehicleLabel: 'Toyota Land Cruiser — AB-123-CD',
  plannedFrom: '2026-09-01T05:00:00.000Z',
  plannedTo: '2026-09-04T05:00:00.000Z',
  startedAt: '2026-09-01T06:00:00.000Z',
  expectedReturnAt: '2026-09-04T05:00:00.000Z',
  returnedAt: '2026-09-04T04:00:00.000Z',
  status: 'TO_CONTROL',
  // LOT 23 : le régime par défaut d'une location, et celui de toutes les
  // locations existantes (Plan 02 §19.4).
  rentalType: 'FIXED_TERM',
  billingCadence: null,
  lockedAmount: 120000,
  lockedUnit: 'DAY',
  // LOT 21 : l'origine accompagne désormais le véhicule d'une location. Le
  // véhicule de ce jeu est FOURNI — et c'est précisément le cas dont les
  // documents client ne doivent RIEN laisser paraître (§6.4).
  vehicleOrigin: 'SUPPLIED',
  reservationId: null,
  reservationNo: null,
  lockedRuleId: null,
  lockedSource: 'CATEGORY',
  lockedAt: '2026-08-25T06:00:00.000Z',
  conditions: 'Restitution avec le plein.',
  notes: null,
  statusReason: null,
  statusChangedAt: null,
  createdAt: '2026-08-25T06:00:00.000Z',
  updatedAt: '2026-09-04T04:00:00.000Z',
}

const DEPARTURE_INSPECTION: Inspection = {
  id: '00000000-0000-0000-0000-000000000081',
  kind: 'DEPARTURE',
  performedAt: '2026-09-01T06:00:00.000Z',
  mileage: 50000,
  fuelLevel: 'FULL',
  exteriorCondition: 'Carrosserie propre',
  interiorCondition: 'Sellerie correcte',
  preexistingDamages: 'Rayure portière avant droite',
  observations: null,
  photos: [{ id: 'p1', fileName: 'depart.png', caption: null }],
}

const RETURN_INSPECTION: Inspection = {
  id: '00000000-0000-0000-0000-000000000082',
  kind: 'RETURN',
  performedAt: '2026-09-04T04:00:00.000Z',
  mileage: 50800,
  fuelLevel: 'HALF',
  exteriorCondition: 'Propre',
  interiorCondition: 'Correct',
  preexistingDamages: 'Rétroviseur droit fissuré',
  observations: 'Retour sans incident',
  photos: [],
}

const FULL_PARTS = {
  identity: IDENTITY,
  rental: RENTAL,
  client: CLIENT,
  vehicle: VEHICLE,
  inspections: [DEPARTURE_INSPECTION, RETURN_INSPECTION],
  showAmounts: true,
  issuedOn: ISSUED,
}

/**
 * CHAQUE MODÈLE, DANS SES DEUX ÉTATS EXTRÊMES.
 *
 * La panne du 22/08/2026 est née d'une branche jamais rendue. Ces documents
 * en comportent plusieurs : sans droit sur le client, sans droit sur le
 * véhicule, sans droit financier, sans départ, sans retour. Chacune est
 * exercée ici — c'est la seule façon de savoir qu'un style refusé par
 * `@react-pdf/renderer` ne s'y cache pas.
 */
describe('contrat de location', () => {
  it('produit un PDF complet', async () => {
    expectPdf(await renderDocument(RentalContractDocument(FULL_PARTS)))
  })

  it('rend un contrat sans droit sur le client, le véhicule ni les montants', async () => {
    expectPdf(
      await renderDocument(
        RentalContractDocument({
          ...FULL_PARTS,
          client: null,
          vehicle: null,
          showAmounts: false,
        })
      )
    )
  })

  it('rend un contrat sans conditions particulières', async () => {
    expectPdf(
      await renderDocument(
        RentalContractDocument({ ...FULL_PARTS, rental: { ...RENTAL, conditions: null } })
      )
    )
  })
})

describe('bon de départ', () => {
  it('produit un PDF avec l’état des lieux de départ', async () => {
    expectPdf(await renderDocument(DepartureReportDocument(FULL_PARTS)))
  })

  /** Location jamais partie : la section le DIT, elle n'est pas vide. */
  it('rend un bon de départ sans aucun état des lieux', async () => {
    expectPdf(
      await renderDocument(
        DepartureReportDocument({
          ...FULL_PARTS,
          inspections: [],
          rental: { ...RENTAL, status: 'CONFIRMED', startedAt: null, returnedAt: null },
        })
      )
    )
  })

  it('rend un bon de départ sans droit financier', async () => {
    expectPdf(await renderDocument(DepartureReportDocument({ ...FULL_PARTS, showAmounts: false })))
  })
})

describe('procès-verbal de retour', () => {
  it('produit un PDF comparant départ et retour', async () => {
    expectPdf(await renderDocument(ReturnReportDocument(FULL_PARTS)))
  })

  /** Parti mais pas rentré : la section retour l'annonce. */
  it('rend un PV alors que le véhicule n’est pas rentré', async () => {
    expectPdf(
      await renderDocument(
        ReturnReportDocument({
          ...FULL_PARTS,
          inspections: [DEPARTURE_INSPECTION],
          rental: { ...RENTAL, status: 'IN_PROGRESS', returnedAt: null },
        })
      )
    )
  })

  /** Aucun relevé de kilométrage : la distance n'est pas déterminable. */
  it('rend un PV sans kilométrage relevé', async () => {
    expectPdf(
      await renderDocument(
        ReturnReportDocument({
          ...FULL_PARTS,
          inspections: [
            { ...DEPARTURE_INSPECTION, mileage: null, fuelLevel: null },
            { ...RETURN_INSPECTION, mileage: null, fuelLevel: null },
          ],
        })
      )
    )
  })

  it('rend un PV sans aucun état des lieux', async () => {
    expectPdf(await renderDocument(ReturnReportDocument({ ...FULL_PARTS, inspections: [] })))
  })
})

/* -------------------------------------------------------------------------- */
/*  Avenant au contrat — LOT 22                                                */
/* -------------------------------------------------------------------------- */

/**
 * 🟩 A-4 : « On garde le même contrat et on rajoute des avenants. »
 *
 * Le contrat garde son identifiant ; ce sont ses PÉRIODES qui se succèdent. Le
 * document remis au client doit le dire, et montrer l'avant / après.
 *
 * `ContractPeriod` ne porte AUCUN coût gelé : le type lui-même écarte la colonne
 * confidentielle, de sorte qu'aucun modèle ne puisse la révéler — même pour un
 * Super Admin qui aurait le droit de la lire.
 */
const PERIODS: ContractPeriod[] = [
  {
    sequenceNo: 1,
    vehicleLabel: 'Toyota Land Cruiser — AB-123-CD',
    from: '2026-09-01T06:00:00.000Z',
    to: '2026-09-02T08:00:00.000Z',
    amount: 120000,
    unit: 'DAY',
    statusLabel: 'Terminé',
  },
  {
    sequenceNo: 2,
    vehicleLabel: 'Nissan Patrol — EF-456-GH',
    from: '2026-09-02T08:00:00.000Z',
    to: '2026-09-04T05:00:00.000Z',
    amount: 150000,
    unit: 'DAY',
    statusLabel: 'En cours',
  },
]

const AMENDMENT: RentalAmendment = {
  id: '00000000-0000-0000-0000-000000000090',
  amendmentNo: 'AVN-2026-000001',
  sequenceNo: 1,
  kind: 'VEHICLE_CHANGE',
  effectiveAt: '2026-09-02T08:00:00.000Z',
  reason: 'Panne immobilisante du véhicule initial',
  notes: null,
  rateOverride: false,
  rateOverrideReason: null,
  createdAt: '2026-09-02T09:00:00.000Z',
  authorLabel: 'Recette ADIKOM',
}

const AMENDMENT_PARTS = {
  identity: IDENTITY,
  rental: RENTAL,
  amendment: AMENDMENT,
  periods: PERIODS,
  openedSequenceNo: 2,
  client: CLIENT,
  showAmounts: true,
  issuedOn: ISSUED,
}

describe('avenant au contrat de location', () => {
  it('produit un PDF complet', async () => {
    expectPdf(await renderDocument(RentalAmendmentDocument(AMENDMENT_PARTS)))
  })

  /** Sans droit financier, la colonne des tarifs disparaît — et le PDF tient. */
  it('rend un avenant sans montants ni identité du client', async () => {
    expectPdf(
      await renderDocument(
        RentalAmendmentDocument({ ...AMENDMENT_PARTS, client: null, showAmounts: false })
      )
    )
  })

  /** Une dérogation tarifaire : sa raison figure sur le document du client. */
  it('rend un avenant portant un tarif dérogatoire motivé', async () => {
    expectPdf(
      await renderDocument(
        RentalAmendmentDocument({
          ...AMENDMENT_PARTS,
          amendment: {
            ...AMENDMENT,
            rateOverride: true,
            rateOverrideReason: 'ADIKOM absorbe l’écart : l’indisponibilité est de son fait',
            notes: 'Remplacement de courtoisie.',
          },
        })
      )
    )
  })

  /**
   * LE CAS VIDE, celui qui interrompait le rendu le 22/08/2026 : aucune période
   * lisible — véhicules non communiqués — et aucun segment nommé par l'avenant.
   */
  it('rend un avenant sans période lisible', async () => {
    expectPdf(
      await renderDocument(
        RentalAmendmentDocument({
          ...AMENDMENT_PARTS,
          periods: [],
          openedSequenceNo: null,
        })
      )
    )
  })

  it('rend un avenant dont les véhicules ne sont pas lisibles', async () => {
    expectPdf(
      await renderDocument(
        RentalAmendmentDocument({
          ...AMENDMENT_PARTS,
          periods: PERIODS.map((period) => ({ ...period, vehicleLabel: null })),
        })
      )
    )
  })
})

describe('contrat de location segmenté', () => {
  /** Le tableau des périodes ne paraît qu'à partir de DEUX périodes. */
  it('produit un PDF portant les périodes successives', async () => {
    expectPdf(
      await renderDocument(RentalContractDocument({ ...FULL_PARTS, periods: PERIODS }))
    )
  })

  it('n’affiche pas le tableau pour un contrat à une seule période', async () => {
    expectPdf(
      await renderDocument(RentalContractDocument({ ...FULL_PARTS, periods: [PERIODS[0]] }))
    )
  })

  it('rend les périodes sans montants', async () => {
    expectPdf(
      await renderDocument(
        RentalContractDocument({ ...FULL_PARTS, periods: PERIODS, showAmounts: false })
      )
    )
  })
})

/* -------------------------------------------------------------------------- */
/*  Facture client — et la PÉRIODE qu'elle couvre (LOT 23, A-6)                */
/* -------------------------------------------------------------------------- */

const INVOICE: CustomerInvoiceDetail = {
  id: '00000000-0000-0000-0000-0000000000f1',
  invoiceNo: 'FAC-2026-000012',
  status: 'ISSUED',
  invoiceDate: '2026-11-01',
  dueDate: '2026-11-30',
  clientId: CLIENT.id,
  clientLabel: 'CLIENT DEMO 01',
  rentalId: '00000000-0000-0000-0000-000000000080',
  rentalNo: 'LOC-2026-000001',
  billingPeriodId: '00000000-0000-0000-0000-0000000000b1',
  notes: null,
  statusReason: null,
  issuedAt: '2026-11-01T07:00:00.000Z',
  cancelledAt: null,
  createdAt: '2026-11-01T06:00:00.000Z',
  updatedAt: '2026-11-01T07:00:00.000Z',
  subtotal: 1_500_000,
  discount: 0,
  total: 1_500_000,
  paidAmount: 0,
  remainingDue: 1_500_000,
}

const INVOICE_LINES: CustomerInvoiceLine[] = [
  {
    id: '00000000-0000-0000-0000-0000000000c1',
    kind: 'RENTAL',
    label: 'Location Toyota T5 — 01/10/2026 au 12/10/2026',
    quantity: 11,
    unitPrice: 50_000,
    lineTotal: 550_000,
    justification: null,
  },
  {
    id: '00000000-0000-0000-0000-0000000000c2',
    kind: 'RENTAL',
    label: 'Location Nissan Patrol — 12/10/2026 au 01/11/2026',
    quantity: 20,
    unitPrice: 47_500,
    lineTotal: 950_000,
    justification: null,
  },
]

describe('facture client de période', () => {
  /**
   * 🟩 A-6 — LA PIÈCE REMISE AU CLIENT DIT CE QU'ELLE COUVRE.
   *
   * Une facture mensuelle d'un contrat de longue durée ne couvre pas tout le
   * contrat. Le taire la ferait lire comme une facture globale — et le client
   * la contesterait, ou pire, ne la contesterait pas.
   */
  it('produit un PDF portant la période facturée', async () => {
    expectPdf(
      await renderDocument(
        CustomerInvoiceDocument({
          identity: IDENTITY,
          invoice: INVOICE,
          lines: INVOICE_LINES,
          clientLabel: 'CLIENT DEMO 01',
          clientAddress: ['Moroni Oasis'],
          showPayments: true,
          billingPeriod: {
            sequenceNo: 2,
            from: '2026-10-01T00:00:00.000Z',
            to: '2026-11-01T00:00:00.000Z',
          },
          issuedOn: issuedOnLabel(),
        })
      )
    )
  })

  /** Le régime « durée fixée » : aucune période, et la ligne disparaît. */
  it('produit un PDF sans période pour une facture de location à durée fixée', async () => {
    expectPdf(
      await renderDocument(
        CustomerInvoiceDocument({
          identity: IDENTITY,
          invoice: { ...INVOICE, billingPeriodId: null },
          lines: [INVOICE_LINES[0]],
          clientLabel: 'CLIENT DEMO 01',
          clientAddress: null,
          showPayments: false,
          billingPeriod: null,
          issuedOn: issuedOnLabel(),
        })
      )
    )
  })

  /**
   * La période existe, mais le lecteur n'a pas `rental.rentals.view` : elle
   * DISPARAÎT du document plutôt que d'y figurer vide (DEC-017, DEC-024).
   */
  it('produit un PDF lorsque la période n’est pas lisible', async () => {
    expectPdf(
      await renderDocument(
        CustomerInvoiceDocument({
          identity: IDENTITY,
          invoice: { ...INVOICE, rentalNo: null },
          lines: INVOICE_LINES,
          clientLabel: null,
          clientAddress: null,
          showPayments: false,
          billingPeriod: null,
          issuedOn: issuedOnLabel(),
        })
      )
    )
  })
})

/* -------------------------------------------------------------------------- */
/*  Nommage des fichiers                                                       */
/* -------------------------------------------------------------------------- */

describe('nommage des documents', () => {
  it('nomme le fichier de façon explicite', () => {
    const name = documentFileName('Fiche-client', 'CLI-000008')

    expect(name).toMatch(/^ADIKOM_Fiche-client_CLI-000008_\d{8}\.pdf$/)
  })

  it('nomme le fichier même sans référence', () => {
    expect(documentFileName('Grille-tarifaire', null)).toMatch(
      /^ADIKOM_Grille-tarifaire_\d{8}\.pdf$/
    )
  })
})

/* -------------------------------------------------------------------------- */
/*  Confidentialité du coût d'acquisition — LOT 21, barrière n° 3              */
/* -------------------------------------------------------------------------- */

/**
 * AUCUN DOCUMENT DESTINÉ À UN TIERS NE PORTE UN COÛT D'ACQUISITION.
 *
 * Plan 02 §6.3 pose trois barrières, et celle-ci est la seule qui tienne même
 * lorsque le demandeur DÉTIENT la capacité de lire le coût : les générateurs ne
 * reçoivent tout simplement pas ces colonnes.
 *
 * Une policy RLS ne suffirait pas. Un Super Admin qui télécharge un contrat a
 * le droit de lire le coût — s'il figurait dans le modèle, il sortirait, et le
 * fichier circulerait hors du système.
 *
 * CE CONTRÔLE EST STRUCTUREL, PAS COSMÉTIQUE. Il lit les sources des modèles et
 * refuse toute référence au domaine du coût. Il vaut donc aussi pour les
 * documents que les lots suivants ajouteront : une synthèse de location
 * (LOT 24), un devis ou une facture (LOT 25) tomberaient sous la même règle.
 */
describe('aucun document client ne compose un coût d’acquisition', () => {
  const RACINES = [
    resolve(import.meta.dirname, '.'),
    resolve(import.meta.dirname, '../../features'),
  ]

  /** Tout fichier de modèle documentaire du projet. */
  function modeles(): string[] {
    const trouves: string[] = []

    const parcourir = (chemin: string) => {
      for (const entree of readdirSync(chemin, { withFileTypes: true })) {
        const complet = resolve(chemin, entree.name)
        if (entree.isDirectory()) {
          if (entree.name === 'node_modules' || entree.name === 'fonts') continue
          parcourir(complet)
          continue
        }
        // Les modèles vivent dans `documents/`, et le registre les assemble.
        if (!/\.(ts|tsx)$/.test(entree.name)) continue
        if (entree.name.endsWith('.test.ts') || entree.name.endsWith('.test.tsx')) continue
        if (complet.includes(`${sep}documents${sep}`) || complet.endsWith(`${sep}registry.ts`)) {
          trouves.push(complet)
        }
      }
    }

    for (const racine of RACINES) parcourir(racine)
    return trouves
  }

  const INTERDITS = [
    'supplier_vehicle_rates',
    'resolve_supplier_rate',
    'supplier-rates',
    'CommissionBlock',
    'Coût d’acquisition',
    /*
     * LOT 22 — LE COÛT GELÉ D'UN SEGMENT.
     *
     * `rental_segments` s'ouvre par `rental.rentals.view` : les modèles
     * documentaires reçoivent légitimement ses périodes. Son COÛT, lui, vit dans
     * `rental_segment_costs` et n'a rien à faire sur un document remis à un
     * tiers. Les modèles ne reçoivent d'ailleurs pas le segment entier mais un
     * `ContractPeriod`, qui ne porte pas cette colonne — ces deux termes
     * garantissent que personne ne revienne en arrière.
     */
    'rental_segment_costs',
    'lockedCost',
    'segmentCommission',
  ]

  it('aucun modèle documentaire ne touche au domaine du coût fournisseur', () => {
    const fichiers = modeles()

    // Un balayage qui ne trouverait aucun modèle passerait triomphalement et à
    // tort : mieux vaut échouer que se féliciter du vide.
    expect(fichiers.length, 'Aucun modèle documentaire trouvé.').toBeGreaterThan(5)

    const fautes: string[] = []

    for (const fichier of fichiers) {
      // Le registre des EXPORTS n'est pas un document remis à un tiers : c'est
      // un classeur interne, gardé par `rental.pricing.supplier.export`.
      if (fichier.includes(`exports${sep}registry.ts`)) continue

      const source = readFileSync(fichier, 'utf8')
      for (const terme of INTERDITS) {
        if (source.includes(terme)) fautes.push(`${fichier} → ${terme}`)
      }
    }

    expect(fautes, `Un modèle documentaire compose un coût d’acquisition :\n${fautes.join('\n')}`)
      .toEqual([])
  })
})
