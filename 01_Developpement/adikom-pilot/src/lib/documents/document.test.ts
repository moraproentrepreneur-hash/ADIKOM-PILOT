import { describe, expect, it } from 'vitest'

import { ClientSheetDocument } from '@/features/clients/documents/client-sheet'
import { SupplierSheetDocument } from '@/features/suppliers/documents/supplier-sheet'
import { PartnerSheetDocument } from '@/features/partners/documents/partner-sheet'
import { VehicleSheetDocument } from '@/features/fleet/documents/vehicle-sheet'
import { PricingGridDocument } from '@/features/pricing/documents/pricing-grid'
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
