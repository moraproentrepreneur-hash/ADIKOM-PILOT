import { describe, expect, it } from 'vitest'

import { ClientSheetDocument } from '@/features/clients/documents/client-sheet'
import { documentFileName, issuedOnLabel, renderDocument } from './render'
import type { DocumentIdentity } from './identity'
import type { ClientDetail } from '@/features/clients/data'
import type { PricingRuleRow } from '@/features/pricing/data'

/**
 * Le moteur documentaire produit-il réellement un PDF ?
 *
 * Ce test rend un document complet, polices et logo compris. Il échoue si un
 * fichier de police manque, si le logo est introuvable, ou si un style refusé
 * par `@react-pdf/renderer` s'est glissé dans un modèle — autant de pannes qui,
 * sans lui, ne se verraient qu'en production, au moment où un utilisateur
 * clique sur « Télécharger ».
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

describe('moteur documentaire', () => {
  it('produit un PDF exploitable', async () => {
    const pdf = await renderDocument(
      ClientSheetDocument({
        identity: IDENTITY,
        client: CLIENT,
        pricingRules: [RULE],
        issuedOn: issuedOnLabel(new Date('2026-08-22T06:00:00.000Z')),
      })
    )

    // Un PDF commence toujours par sa signature.
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')

    // Polices et logo embarqués : un document vide ou sans ressource pèserait
    // quelques kilo-octets à peine.
    expect(pdf.byteLength).toBeGreaterThan(30_000)
  })

  it('rend un document sans conditions tarifaires', async () => {
    const pdf = await renderDocument(
      ClientSheetDocument({
        identity: IDENTITY,
        client: CLIENT,
        // `null` : le lecteur n'a pas le droit de voir la tarification.
        pricingRules: null,
        issuedOn: issuedOnLabel(),
      })
    )

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

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
