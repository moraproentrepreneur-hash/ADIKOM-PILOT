import Link from 'next/link'

import { cn } from '@/lib/utils'

/**
 * Onglets d'une fiche.
 *
 * Les onglets non livrés restent visibles mais inertes, avec la mention « à
 * venir » : l'utilisateur voit ce que la fiche contiendra sans jamais croire
 * qu'un écran vide est un écran cassé. C'est la convention déjà retenue pour la
 * barre latérale, conservée ici pour ne pas inventer un second vocabulaire.
 */

export type TabItem = {
  key: string
  label: string
  href?: string
  /** Onglet prévu par la documentation mais relevant d'une étape ultérieure. */
  planned?: boolean
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
          item.planned || !item.href ? (
            <span
              key={item.key}
              aria-disabled
              title="Fonctionnalité prévue par une étape ultérieure"
              className="flex shrink-0 cursor-not-allowed items-center gap-1.5 border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-muted/60"
            >
              {item.label}
              <span className="rounded-badge bg-canvas px-1.5 py-0.5 text-[0.625rem] font-medium text-muted">
                à venir
              </span>
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
