import Link from 'next/link'

import { cn } from '@/lib/utils'

/**
 * Onglets d'une fiche.
 *
 * PLUS AUCUN ONGLET « À VENIR » — DEC-042 §d.
 *
 * Ces onglets savaient s'afficher inertes, avec la mention « à venir » : la
 * fiche annonçait ainsi ce qu'elle contiendrait. C'était juste tant que des
 * pans du SaaS restaient à livrer ; ce ne l'est plus. ADIKOM a demandé que ces
 * onglets deviennent opérationnels, et ils le sont.
 *
 * La mention est donc RETIRÉE plutôt que laissée inutilisée : disponible, elle
 * reviendrait un jour dans une fiche, et l'utilisateur retrouverait la promesse
 * dont on vient de le débarrasser.
 *
 * UN ONGLET QUI N'EST PAS OUVERT N'EST PAS AFFICHÉ.
 *
 * C'est la règle que les fiches appliquent désormais : sans la capacité du
 * module concerné, l'onglet DISPARAÎT. L'afficher vide certifierait qu'il n'y a
 * rien à voir, alors qu'on ne fait que refuser la lecture (DEC-017).
 */

export type TabItem = {
  key: string
  label: string
  href?: string
}

export function Tabs({
  items,
  current,
  label = 'Sections de la fiche',
}: {
  items: readonly TabItem[]
  current: string
  label?: string
}) {
  return (
    <div className="mb-5 border-b border-line">
      <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label={label}>
        {items.map((item) =>
          !item.href ? (
            // Filet : un onglet sans destination ne mène nulle part, et le
            // rendre cliquable proposerait une porte qui n'existe pas.
            <span
              key={item.key}
              aria-disabled
              className="shrink-0 border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-muted/60"
            >
              {item.label}
            </span>
          ) : (
            <Link
              key={item.key}
              href={item.href}
              aria-current={current === item.key ? 'page' : undefined}
              className={cn(
                'shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                current === item.key
                  ? 'border-adikom-500 text-adikom-500'
                  : 'border-transparent text-muted hover:text-ink'
              )}
            >
              {item.label}
            </Link>
          )
        )}
      </nav>
    </div>
  )
}
