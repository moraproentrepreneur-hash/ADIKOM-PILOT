import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import { buildWorkbook, exportFileName, toExcelDate, type ExportColumn } from './workbook'

/**
 * Le moteur d'export produit-il un classeur réellement lisible ?
 *
 * Ces tests ne se contentent pas de vérifier qu'un tampon d'octets sort de la
 * fabrique : ils le RELISENT avec ExcelJS et contrôlent la feuille, l'en-tête,
 * les valeurs et les formats — c'est-à-dire ce qu'un tableur affichera.
 *
 * Un fichier de 4 ko qui s'ouvre sur une feuille vide passerait n'importe quel
 * contrôle de taille ; il ne passe pas ceux-ci.
 */

type Row = { name: string; amount: number; date: Date | null }

const COLUMNS: ExportColumn<Row>[] = [
  { header: 'Client', width: 30, value: (r) => r.name },
  { header: 'Montant', width: 16, format: 'amount', value: (r) => r.amount },
  { header: 'Créé le', width: 14, format: 'date', value: (r) => r.date },
]

const ROWS: Row[] = [
  { name: 'CLIENT DEMO 01', amount: 450000, date: toExcelDate('2026-08-22T06:00:00.000Z') },
  { name: 'CLIENT DEMO 02', amount: 125000, date: null },
]

async function reopen(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  // `load` échoue si l'archive XLSX est malformée : c'est le contrôle qui
  // remplace « le fichier s'ouvre-t-il dans Excel ? ».
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  return workbook
}

describe('moteur d’export Excel', () => {
  it('produit un classeur relisible, avec ses données', async () => {
    const buffer = await buildWorkbook(ROWS, COLUMNS, { title: 'Clients' })

    // Signature d'une archive ZIP — tout XLSX en est une.
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK')

    const sheet = (await reopen(buffer)).getWorksheet('Clients')
    expect(sheet).toBeDefined()

    // Ligne 1 : titre. Ligne 2 : horodatage. Ligne 3 : en-tête. Puis les données.
    expect(sheet!.getCell(1, 1).value).toBe('Clients')
    expect(String(sheet!.getCell(2, 1).value)).toContain('Export du')
    expect(sheet!.getCell(3, 1).value).toBe('Client')
    expect(sheet!.getCell(3, 2).value).toBe('Montant')

    expect(sheet!.getCell(4, 1).value).toBe('CLIENT DEMO 01')
    expect(sheet!.getCell(4, 2).value).toBe(450000)
    expect(sheet!.getCell(5, 1).value).toBe('CLIENT DEMO 02')

    // Une date absente reste vide : surtout pas remplacée par une date d'aujourd'hui.
    expect(sheet!.getCell(5, 3).value).toBeNull()
  })

  it('applique les formats monétaires et de date', async () => {
    const sheet = (await reopen(await buildWorkbook(ROWS, COLUMNS, { title: 'Clients' }))).getWorksheet(
      'Clients'
    )

    // DEC-010 : le franc comorien n'a pas de sous-unité.
    expect(sheet!.getCell(4, 2).numFmt).toBe('#,##0 "KMF"')
    expect(sheet!.getCell(4, 3).numFmt).toBe('dd/mm/yyyy')
  })

  it('fige l’en-tête et pose les filtres', async () => {
    const sheet = (await reopen(await buildWorkbook(ROWS, COLUMNS, { title: 'Clients' }))).getWorksheet(
      'Clients'
    )

    // Le titre et l'en-tête restent visibles au défilement.
    expect(sheet!.views[0]).toMatchObject({ state: 'frozen', ySplit: 3 })

    // À la relecture, ExcelJS rend la plage sous sa forme A1 : le filtre porte
    // bien de l'en-tête (ligne 3) à la dernière ligne de données.
    expect(sheet!.autoFilter).toBe('A3:C5')
    expect(sheet!.getColumn(1).width).toBe(30)
  })

  it('produit un classeur valide même sans aucune ligne', async () => {
    const buffer = await buildWorkbook([], COLUMNS, {
      title: 'Clients',
      subtitle: 'Aucun résultat',
    })

    const sheet = (await reopen(buffer)).getWorksheet('Clients')

    // L'en-tête subsiste : un export vide doit dire de quoi il est vide.
    expect(sheet!.getCell(3, 1).value).toBe('Client')
    expect(String(sheet!.getCell(2, 1).value)).toContain('Aucun résultat')
  })

  it('tronque le nom de feuille au-delà de la limite Excel', async () => {
    // Excel refuse un nom de feuille de plus de 31 caractères.
    const long = 'Catégories de véhicules du parc automobile ADIKOM'
    const workbook = await reopen(await buildWorkbook(ROWS, COLUMNS, { title: long }))

    expect(workbook.worksheets[0].name).toBe(long.slice(0, 31))
  })

  it('nomme le fichier de façon reconnaissable', () => {
    expect(exportFileName('Parc automobile')).toMatch(/^ADIKOM_Parc-automobile_\d{8}\.xlsx$/)
  })
})
