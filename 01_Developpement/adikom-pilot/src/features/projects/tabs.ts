import type { TabItem } from '@/components/ui/tabs'

/**
 * Les trois vues du module, et la façon d'y circuler.
 *
 * §35 et §36 : une vue liste pour la coordination, une vue personnelle pour
 * chacun. Les tâches ne sont pas une sous-page des projets — elles peuvent être
 * indépendantes (§10) —, mais les trois écrans se répondent : on passe de l'un à
 * l'autre par des onglets, comme les listes de factures (LOT 11).
 *
 * UN ONGLET QU'ON NE PEUT PAS OUVRIR N'EST PAS PROPOSÉ.
 *
 * Ce n'est pas une protection : chaque page exige de nouveau sa capacité, et la
 * recette éprouve l'URL tapée à la main. C'est une politesse — proposer une
 * porte que la page suivante refermerait n'aide personne.
 */
export function moduleTabs(
  current: 'projets' | 'taches' | 'mes-elements',
  access: { projects: boolean; tasks: boolean }
): TabItem[] {
  const items: TabItem[] = []

  if (access.projects) {
    items.push({ key: 'projets', label: 'Projets', href: '/projets' })
  }
  if (access.tasks) {
    items.push({ key: 'taches', label: 'Tâches', href: '/projets/taches' })
  }
  if (access.projects || access.tasks) {
    items.push({ key: 'mes-elements', label: 'Mes éléments', href: '/projets/mes-elements' })
  }

  return items.length > 1 || items[0]?.key !== current ? items : []
}
