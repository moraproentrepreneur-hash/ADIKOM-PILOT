import type { TabItem } from '@/components/ui/tabs'

/**
 * Les écrans du module, et la façon d'y circuler.
 *
 * L'ordre reprend celui du `Module 03` §4 — Projets, Tâches, Calendrier,
 * Réunions, Rendez-vous, Actions, Décisions — auquel s'ajoute la vue
 * personnelle du §36. C'est le même ordre que la barre latérale : deux
 * navigations du même produit ne doivent pas ranger les mêmes écrans
 * différemment.
 *
 * UN ONGLET QU'ON NE PEUT PAS OUVRIR N'EST PAS PROPOSÉ.
 *
 * Ce n'est pas une protection : chaque page exige de nouveau sa capacité, et la
 * recette éprouve l'URL tapée à la main. C'est une politesse — proposer une
 * porte que la page suivante refermerait n'aide personne.
 *
 * LE CALENDRIER S'OUVRE À TROIS LECTURES, ET N'EN EXIGE AUCUNE EN PROPRE.
 *
 * Il ne montre rien que les tâches, les réunions ou les rendez-vous n'ouvrent
 * déjà : lui donner sa propre capacité créerait un droit qui ne débloquerait
 * rien (DEC-036 §d).
 */

export type ModuleTab =
  | 'projets'
  | 'taches'
  | 'calendrier'
  | 'reunions'
  | 'rendez-vous'
  | 'actions'
  | 'decisions'
  | 'mes-elements'

export type ModuleAccess = {
  projects: boolean
  tasks: boolean
  meetings: boolean
  appointments: boolean
  actions: boolean
  decisions: boolean
}

export function moduleTabs(current: ModuleTab, access: ModuleAccess): TabItem[] {
  const items: TabItem[] = []

  if (access.projects) items.push({ key: 'projets', label: 'Projets', href: '/projets' })
  if (access.tasks) items.push({ key: 'taches', label: 'Tâches', href: '/projets/taches' })

  if (access.tasks || access.meetings || access.appointments) {
    items.push({ key: 'calendrier', label: 'Calendrier', href: '/projets/calendrier' })
  }

  if (access.meetings) items.push({ key: 'reunions', label: 'Réunions', href: '/projets/reunions' })
  if (access.appointments) {
    items.push({ key: 'rendez-vous', label: 'Rendez-vous', href: '/projets/rendez-vous' })
  }
  if (access.actions) items.push({ key: 'actions', label: 'Actions', href: '/projets/actions' })
  if (access.decisions) {
    items.push({ key: 'decisions', label: 'Décisions', href: '/projets/decisions' })
  }

  // La vue personnelle n'a de sens que si quelque chose peut y figurer.
  if (access.projects || access.tasks || access.meetings || access.appointments || access.actions) {
    items.push({ key: 'mes-elements', label: 'Mes éléments', href: '/projets/mes-elements' })
  }

  // Une barre d'onglets qui n'en contient qu'un, et c'est celui où l'on est
  // déjà, ne sert à rien : elle prendrait de la place sans rien offrir.
  return items.length > 1 || items[0]?.key !== current ? items : []
}
