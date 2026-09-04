'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, LogOut, Menu, X } from 'lucide-react'

import { AdikomLogo } from '@/components/brand/adikom-logo'
import { filterNavigation, isSection, NAVIGATION } from '@/lib/navigation'
import type { NavItem } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import { signOutAction } from '@/features/auth/actions'

/**
 * Barre latérale rétractable (Design System §20 et §21, CLAUDE.md §36).
 *
 * États : développé (icônes + libellés) et rétracté (icônes seules).
 * Le logo officiel reste identifiable, centré et non déformé dans les deux cas
 * (§9) : le composant AdikomLogo garantit à lui seul le ratio et le fond clair.
 *
 * Sur mobile, la barre devient un panneau superposé plutôt qu'une réduction de
 * l'interface desktop (§53).
 *
 * La navigation est filtrée côté client pour le confort de lecture ; la
 * protection réelle est assurée par le serveur à chaque page et action.
 */

const SIDEBAR_COOKIE = 'adikom-sidebar'

type SidebarProps = {
  grantedCodes: string[]
  isSuperAdmin: boolean
  initiallyCollapsed: boolean
  user: { fullName: string; jobTitle: string | null; email: string }
  /**
   * Compteurs affichés sur une entrée, par destination.
   *
   * Module 02 §17 : « un compteur de notifications non lues ». Il est calculé
   * côté serveur, sur l'état réel — l'interface ne fait que l'écrire.
   */
  badges?: Record<string, number>
}

export function Sidebar({
  grantedCodes,
  isSuperAdmin,
  initiallyCollapsed,
  user,
  badges,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  const granted = new Set(grantedCodes)
  const entries = filterNavigation(NAVIGATION, granted, isSuperAdmin)

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    // Persisté en cookie afin que le serveur rende le bon état dès le premier
    // affichage : aucun clignotement au chargement.
    document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`
  }

  const showLabels = !collapsed

  return (
    <>
      {/* --- Barre supérieure mobile ------------------------------------- */}
      <div className="flex items-center gap-3 border-b border-line bg-white px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Ouvrir la navigation"
          className="inline-flex size-9 items-center justify-center rounded-control text-muted transition-colors hover:bg-adikom-50 hover:text-adikom-500"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <AdikomLogo size={32} />
        <span className="font-display text-sm font-semibold text-adikom-500">
          ADIKOM PILOT
        </span>
      </div>

      {/* --- Voile mobile ------------------------------------------------- */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* --- Panneau ------------------------------------------------------ */}
      <aside
        className={cn(
          'z-50 flex shrink-0 flex-col border-r border-line bg-white transition-[width] duration-200',
          // `lg:h-full` : la barre latérale épouse la hauteur de la fenêtre,
          // jamais celle du contenu principal. Sans cela, une page longue
          // l'étirerait et le défilement redeviendrait commun aux deux zones.
          'fixed inset-y-0 left-0 lg:static lg:h-full',
          mobileOpen ? 'flex' : 'hidden lg:flex',
          collapsed ? 'w-[76px]' : 'w-[264px]'
        )}
      >
        {/* En-tête : logo + bascule */}
        <div
          className={cn(
            'flex shrink-0 items-center gap-2.5 border-b border-line px-4 py-4',
            collapsed && 'justify-center px-2'
          )}
        >
          <AdikomLogo size={collapsed ? 36 : 38} priority />

          {showLabels && (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate font-display text-sm font-semibold text-adikom-500">
                ADIKOM PILOT
              </p>
              <p className="truncate text-[11px] text-muted">Technology &amp; Travel</p>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fermer la navigation"
            className="inline-flex size-8 items-center justify-center rounded-control text-muted hover:bg-adikom-50 lg:hidden"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Navigation */}
        {/* `min-h-0` est indispensable : sans lui, un enfant de colonne flex
            refuse de rétrécir sous sa hauteur de contenu et ne défile pas. */}
        <nav
          className="min-h-0 flex-1 overflow-y-auto px-2.5 py-4"
          aria-label="Navigation principale"
        >
          <ul className="space-y-0.5">
            {entries.map((entry) =>
              isSection(entry) ? (
                <li key={entry.label} className="pt-3 first:pt-0">
                  {showLabels ? (
                    <p className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wide text-adikom-500 uppercase">
                      {entry.label}
                    </p>
                  ) : (
                    <div className="mx-2 my-2 border-t border-line" aria-hidden />
                  )}
                  <ul className="space-y-0.5">
                    {entry.items.map((item) => (
                      <SidebarLink
                        key={item.href}
                        item={item}
                        level="submenu"
                        collapsed={collapsed}
                        active={pathname === item.href}
                        badge={badges?.[item.href]}
                        onNavigate={() => setMobileOpen(false)}
                      />
                    ))}
                  </ul>
                </li>
              ) : (
                <SidebarLink
                  key={entry.href}
                  item={entry}
                  level="menu"
                  collapsed={collapsed}
                  active={pathname === entry.href}
                  badge={badges?.[entry.href]}
                  onNavigate={() => setMobileOpen(false)}
                />
              )
            )}
          </ul>
        </nav>

        {/* Pied : utilisateur, bascule, déconnexion.
            `shrink-0` garantit que « Se déconnecter » reste toujours atteignable,
            même lorsque la navigation dépasse la hauteur de l'écran. */}
        <div className="shrink-0 border-t border-line px-2.5 py-3">
          {showLabels && (
            <div className="mb-2 px-2.5">
              <p className="truncate text-sm font-medium text-ink">{user.fullName}</p>
              <p className="truncate text-xs text-muted">
                {user.jobTitle ?? user.email}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? 'Développer la barre latérale' : 'Réduire la barre latérale'}
            className={cn(
              'hidden w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-sm text-muted transition-colors hover:bg-adikom-50 hover:text-adikom-500 lg:flex',
              collapsed && 'justify-center'
            )}
          >
            <ChevronLeft
              className={cn('size-4 transition-transform', collapsed && 'rotate-180')}
              aria-hidden
            />
            {showLabels && <span>Réduire</span>}
          </button>

          <form action={signOutAction}>
            <button
              type="submit"
              title="Se déconnecter"
              className={cn(
                'flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-sm text-muted transition-colors hover:bg-danger-soft hover:text-danger',
                collapsed && 'justify-center'
              )}
            >
              <LogOut className="size-4" aria-hidden />
              {showLabels && <span>Se déconnecter</span>}
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}

/**
 * Trois niveaux de lecture, obtenus avec les seules couleurs du Design System :
 *
 *   menu accessible     → bleu ADIKOM, poids moyen
 *   sous-menu accessible→ encre (texte foncé), poids moyen
 *   entrée inaccessible → gris atténué, curseur interdit, badge « à venir »
 *
 * L'entrée sélectionnée ajoute à cela un fond bleu très clair et un repère
 * vertical, visible aussi bien en mode développé qu'en mode rétracté.
 */
function SidebarLink({
  item,
  level,
  collapsed,
  active,
  badge,
  onNavigate,
}: {
  item: NavItem
  level: 'menu' | 'submenu'
  collapsed: boolean
  active: boolean
  badge?: number
  onNavigate: () => void
}) {
  const Icon = item.icon
  // Un compteur à zéro ne s'affiche pas : « 0 » n'appelle aucune attention, et
  // le pastillage permanent finirait par ne plus rien signaler (Module 02 §26).
  const count = badge && badge > 0 ? badge : null

  // Une fonctionnalité non livrée n'est jamais présentée comme disponible
  // (02_Architecture_Fonctionnelle/02_Navigation.md §19).
  if (item.status === 'planned') {
    return (
      <li>
        <span
          title={`${item.label} — module à venir`}
          aria-disabled="true"
          className={cn(
            'flex cursor-not-allowed items-center gap-2.5 rounded-control px-2.5 py-2 text-sm text-muted/60',
            collapsed && 'justify-center'
          )}
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          {!collapsed && (
            <>
              <span className="flex-1 truncate">{item.label}</span>
              <span className="rounded-badge bg-canvas px-1.5 py-0.5 text-[10px] text-muted">
                à venir
              </span>
            </>
          )}
        </span>
      </li>
    )
  }

  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? item.label : undefined}
        className={cn(
          'relative flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm font-medium transition-colors',
          collapsed && 'justify-center',
          // Le repère vertical est posé en surcouche : il signale l'entrée
          // sélectionnée sans décaler le libellé.
          active &&
            'bg-adikom-50 text-adikom-500 before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-full before:bg-adikom-500',
          !active && level === 'menu' && 'text-adikom-500 hover:bg-adikom-50',
          !active && level === 'submenu' && 'text-ink hover:bg-adikom-50 hover:text-adikom-500'
        )}
      >
        <span className="relative shrink-0">
          <Icon className="size-4" aria-hidden />
          {/* Rétractée, la barre n'a pas la place d'un nombre : le point suffit
              à dire « il y a quelque chose », et le libellé du lien le nomme. */}
          {count !== null && collapsed && (
            <span
              className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-danger"
              aria-hidden
            />
          )}
        </span>

        {!collapsed && (
          <>
            <span className="truncate">{item.label}</span>
            {count !== null && (
              <span
                data-badge={item.href}
                className="ml-auto inline-flex min-w-5 items-center justify-center rounded-badge bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-white tabular"
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
          </>
        )}

        {count !== null && (
          <span className="sr-only">
            {count} notification{count > 1 ? 's' : ''} non lue{count > 1 ? 's' : ''}
          </span>
        )}
      </Link>
    </li>
  )
}
