import 'server-only'

import ExcelJS from 'exceljs'

import { DISPLAY_TIMEZONE } from '@/lib/dates'

/**
 * Moteur d'export Excel — ADIKOM PILOT.
 *
 * Une seule fabrique produit tous les classeurs : en-tête aux couleurs ADIKOM,
 * ligne figée, filtres, largeurs adaptées, formats de date et de montant. Un
 * module n'a plus qu'à décrire ses colonnes.
 *
 * Les données lui parviennent déjà filtrées par RLS : le moteur ne lit rien
 * lui-même et ne peut donc pas élargir ce que l'utilisateur a le droit de voir.
 */

export type ColumnFormat = 'text' | 'date' | 'datetime' | 'amount' | 'number'

export type ExportColumn<Row> = {
  header: string
  /** Largeur en caractères. Une colonne trop étroite affiche « ##### ». */
  width: number
  format?: ColumnFormat
  value: (row: Row) => string | number | Date | null
}

/** Bleu ADIKOM sans dièse : ExcelJS attend une couleur ARGB. */
const ADIKOM_BLUE = 'FF1E5AA8'
const ADIKOM_TINT = 'FFF2F6FB'

const NUMBER_FORMATS: Partial<Record<ColumnFormat, string>> = {
  date: 'dd/mm/yyyy',
  datetime: 'dd/mm/yyyy hh:mm',
  // Le franc comorien n'a pas de sous-unité (DEC-010) : aucune décimale.
  amount: '#,##0 "KMF"',
  number: '#,##0',
}

export type WorkbookOptions = {
  /** Nom du module, repris en titre de feuille et dans le fichier. */
  title: string
  /** Précision affichée sous le titre : filtres appliqués, périmètre… */
  subtitle?: string
}

export async function buildWorkbook<Row>(
  rows: Row[],
  columns: ExportColumn<Row>[],
  options: WorkbookOptions
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ADIKOM PILOT'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(options.title.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  // --- Bandeau : de quoi parle ce fichier, et de quand date-t-il ------------
  sheet.mergeCells(1, 1, 1, columns.length)
  const titleCell = sheet.getCell(1, 1)
  titleCell.value = options.title
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: ADIKOM_BLUE } }
  titleCell.alignment = { vertical: 'middle' }
  sheet.getRow(1).height = 22

  sheet.mergeCells(2, 1, 2, columns.length)
  const subtitleCell = sheet.getCell(2, 1)
  subtitleCell.value = [options.subtitle, `Export du ${exportStamp()}`].filter(Boolean).join(' — ')
  subtitleCell.font = { name: 'Calibri', size: 9, color: { argb: 'FF6B7280' } }

  // --- En-tête de colonnes ---------------------------------------------------
  const headerRow = sheet.getRow(3)
  columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1)
    cell.value = column.header
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ADIKOM_BLUE } }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    cell.border = { bottom: { style: 'thin', color: { argb: ADIKOM_BLUE } } }
  })
  headerRow.height = 18

  // --- Données ---------------------------------------------------------------
  rows.forEach((row, rowIndex) => {
    const sheetRow = sheet.getRow(4 + rowIndex)

    columns.forEach((column, index) => {
      const cell = sheetRow.getCell(index + 1)
      const value = column.value(row)

      cell.value = value
      cell.font = { name: 'Calibri', size: 10 }

      const numberFormat = column.format ? NUMBER_FORMATS[column.format] : undefined
      if (numberFormat) cell.numFmt = numberFormat
      if (column.format === 'amount' || column.format === 'number') {
        cell.alignment = { horizontal: 'right' }
      }
    })

    // Alternance discrète : un tableau long se lit mieux ligne à ligne.
    if (rowIndex % 2 === 1) {
      sheetRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ADIKOM_TINT } }
      })
    }
  })

  // --- Filtres et largeurs ---------------------------------------------------
  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3 + rows.length, column: columns.length },
  }

  columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

/**
 * Lignes et colonnes, liées.
 *
 * Un export est un COUPLE : des lignes d'un certain type, et les colonnes qui
 * savent les lire. Les transporter séparément jusqu'à la route obligerait à
 * effacer leur type — et rien n'empêcherait alors de servir les colonnes des
 * clients à des lignes de véhicules.
 *
 * `dataset` referme les deux dans une même closure : le type de ligne reste
 * vérifié au point où il est connu, et la route ne manipule plus qu'un objet
 * opaque qu'elle ne peut pas dépareiller.
 */
export type ExportDataset = {
  rowCount: number
  subtitle?: string
  toWorkbook: (options: WorkbookOptions) => Promise<Buffer>
}

export function dataset<Row>(
  rows: Row[],
  columns: ExportColumn<Row>[],
  subtitle?: string
): ExportDataset {
  return {
    rowCount: rows.length,
    subtitle,
    toWorkbook: (options) => buildWorkbook(rows, columns, options),
  }
}

/** Horodatage lisible du bandeau, sur le fuseau d'affichage (DEC-014). */
function exportStamp(): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: DISPLAY_TIMEZONE,
  }).format(new Date())
}

/** `ADIKOM_Clients_20260822.xlsx` — reconnaissable sans être ouvert. */
export function exportFileName(module: string): string {
  const stamp = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: DISPLAY_TIMEZONE,
  })
    .format(new Date())
    .replaceAll('-', '')

  const safe = module.replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  return `ADIKOM_${safe}_${stamp}.xlsx`
}

export function exportHeaders(fileName: string): HeadersInit {
  return {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Cache-Control': 'private, no-store, max-age=0',
  }
}

/** Date exploitable par Excel, ou `null` si la valeur est absente. */
export function toExcelDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
