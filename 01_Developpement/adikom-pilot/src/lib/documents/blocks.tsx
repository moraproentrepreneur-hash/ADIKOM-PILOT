import 'server-only'

import { StyleSheet, Text, View } from '@react-pdf/renderer'

import { DOC_COLORS, DOC_FONTS, DOC_SIZES, DOC_SPACING } from './theme'

/**
 * Blocs documentaires réutilisables.
 *
 * Chaque module y puise plutôt que de redessiner ses tableaux : c'est ce qui
 * fait qu'une fiche client, une fiche véhicule et une grille tarifaire se
 * ressemblent sans qu'aucune règle de mise en page ne soit répétée.
 */

const styles = StyleSheet.create({
  section: { marginBottom: DOC_SPACING.block },
  sectionTitle: {
    fontFamily: DOC_FONTS.display,
    fontWeight: 600,
    fontSize: DOC_SIZES.section,
    color: DOC_COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    borderBottomWidth: 1,
    borderBottomColor: DOC_COLORS.line,
    paddingBottom: 3,
    marginBottom: DOC_SPACING.row + 1,
  },

  row: { flexDirection: 'row', marginBottom: DOC_SPACING.row },
  label: { width: '32%', color: DOC_COLORS.muted, fontSize: DOC_SIZES.small },
  value: { width: '68%', color: DOC_COLORS.ink },

  columns: { flexDirection: 'row', gap: DOC_SPACING.gutter * 2 },
  column: { flexGrow: 1, flexBasis: 0 },

  tableHead: {
    flexDirection: 'row',
    backgroundColor: DOC_COLORS.tint,
    borderBottomWidth: 1,
    borderBottomColor: DOC_COLORS.primaryLight,
    paddingVertical: 4,
    paddingHorizontal: 5,
  },
  tableHeadCell: {
    fontFamily: DOC_FONTS.display,
    fontWeight: 600,
    fontSize: DOC_SIZES.small,
    color: DOC_COLORS.primaryDark,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: DOC_COLORS.line,
    paddingVertical: 4,
    paddingHorizontal: 5,
  },
  tableCell: { fontSize: DOC_SIZES.small },

  empty: {
    fontSize: DOC_SIZES.small,
    color: DOC_COLORS.muted,
    fontStyle: 'italic',
    paddingVertical: 6,
  },

  chip: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 3,
    fontSize: DOC_SIZES.tiny,
    fontFamily: DOC_FONTS.display,
    fontWeight: 600,
  },

  note: {
    backgroundColor: DOC_COLORS.tint,
    padding: 8,
    fontSize: DOC_SIZES.small,
    color: DOC_COLORS.ink,
  },
})

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

/** Couple libellé / valeur. Une valeur absente s'affiche « — », jamais vide. */
export function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value?.trim() ? value : '—'}</Text>
    </View>
  )
}

/** Deux colonnes de champs, pour occuper la largeur d'une A4 sans l'étirer. */
export function FieldColumns({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <View style={styles.columns}>
      <View style={styles.column}>{left}</View>
      <View style={styles.column}>{right}</View>
    </View>
  )
}

export type TableColumn<Row> = {
  header: string
  /** Largeur en pourcentage : la somme doit valoir 100. */
  width: string
  align?: 'left' | 'right'
  cell: (row: Row) => string
}

export function DataTable<Row>({
  columns,
  rows,
  emptyLabel = 'Aucun élément.',
}: {
  columns: TableColumn<Row>[]
  rows: Row[]
  emptyLabel?: string
}) {
  if (rows.length === 0) {
    return <Text style={styles.empty}>{emptyLabel}</Text>
  }

  return (
    <View>
      <View style={styles.tableHead} fixed>
        {columns.map((column) => (
          <Text
            key={column.header}
            style={[
              styles.tableHeadCell,
              { width: column.width, textAlign: column.align ?? 'left' },
            ]}
          >
            {column.header}
          </Text>
        ))}
      </View>

      {rows.map((row, index) => (
        <View key={index} style={styles.tableRow} wrap={false}>
          {columns.map((column) => (
            <Text
              key={column.header}
              style={[styles.tableCell, { width: column.width, textAlign: column.align ?? 'left' }]}
            >
              {column.cell(row)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

export type ChipTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

const CHIP_TONES: Record<ChipTone, { background: string; color: string }> = {
  neutral: { background: '#f3f4f6', color: DOC_COLORS.muted },
  success: { background: '#dcfce7', color: DOC_COLORS.success },
  warning: { background: '#fef3c7', color: DOC_COLORS.warning },
  danger: { background: '#fee2e2', color: DOC_COLORS.danger },
  info: { background: '#e4edf7', color: DOC_COLORS.info },
}

export function StatusChip({ label, tone = 'neutral' }: { label: string; tone?: ChipTone }) {
  const palette = CHIP_TONES[tone]
  return (
    <Text style={[styles.chip, { backgroundColor: palette.background, color: palette.color }]}>
      {label}
    </Text>
  )
}

export function Note({ children }: { children: React.ReactNode }) {
  return <Text style={styles.note}>{children}</Text>
}
