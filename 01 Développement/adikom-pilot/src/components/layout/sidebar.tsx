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
}

export function Sidebar({
  grantedCodes,
  isSuperAdmin,
  initiallyCollapsed,
  user,
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
          'fixed inset-y-0 left-0 lg:static',
          mobileOpen ? 'flex' : 'hidden lg:flex',
          collapsed ? 'w-[76px]' : 'w-[264px]'
        )}
      >
        {/* En-tête : logo + bascule */}
        <div
          className={cn(
            'flex items-center gap-2.5 border-b border-line px-4 py-4',
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
        <nav className="flex-1 overflow-y-auto px-2.5 py-4" aria-label="Navigation principale">
          <ul className="space-y-0.5">
            {entries.map((entry) =>
              isSection(entry) ? (
                <li key={entry.label} className="pt-3 first:pt-0">
                  {showLabels ? (
                    <p className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
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
                        collapsed={collapsed}
                        active={pathname === item.href}
                        onNavigate={() => setMobileOpen(false)}
                      />
                    ))}
                  </ul>
                </li>
              ) : (
                <SidebarLink
                  key={entry.href}
                  item={entry}
                  collapsed={collapsed}
                  active={pathname === entry.href}
                  onNavigate={() => setMobileOpen(false)}
                />
              )
            )}
          </ul>
        </nav>

        {/* Pied : utilisateur, bascule, déconnexion */}
        <div className="border-t border-line px-2.5 py-3">
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

function SidebarLink({
  item,
  collapsed,
  active,
  onNavigate,
}: {
  item: NavItem
  collapsed: boolean
  active: boolean
  onNavigate: () => void
}) {
  const Icon = item.icon

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
          'flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm transition-colors',
          collapsed && 'justify-center',
          active
            ? 'bg-adikom-50 font-medium text-adikom-500'
            : 'text-ink hover:bg-adikom-50 hover:text-adikom-500'
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    </li>
  )
}
