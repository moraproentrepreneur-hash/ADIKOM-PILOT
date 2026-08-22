import { FileSpreadsheet } from 'lucide-react'

/**
 * Export Excel d'une liste.
 *
 * Placé dans la zone d'action de la page, à côté du bouton de création : une
 * capacité utilisée régulièrement ne se cache pas dans un menu secondaire.
 *
 * Les filtres affichés à l'écran sont transmis tels quels, afin que le fichier
 * corresponde à ce que l'utilisateur a sous les yeux.
 *
 * Le bouton suit la permission, mais ne protège rien : la route refuse d'
 * elle-même un export non autorisé, y compris appelée directement
 * (05_Regles_Metier/05_Permissions.md §85, DEC-024).
 */
export function ExportButton({
  module,
  filters,
  label = 'Exporter Excel',
}: {
  /** Clé du registre d'export : `clients`, `fournisseurs`, `parc`… */
  module: string
  /** Filtres actifs, repris dans l'URL de l'export. */
  filters?: Record<string, string>
  label?: string
}) {
  const query = new URLSearchParams(
    Object.entries(filters ?? {}).filter(([, value]) => Boolean(value))
  ).toString()

  return (
    <a
      href={`/api/exports/${module}${query ? `?${query}` : ''}`}
      className="inline-flex items-center justify-center gap-2 rounded-control border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-adikom-50 hover:text-adikom-500"
    >
      <FileSpreadsheet className="size-4" aria-hidden />
      {label}
    </a>
  )
}
