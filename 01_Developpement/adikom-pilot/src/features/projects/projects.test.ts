import { describe, expect, it } from 'vitest'

import {
  MEMBER_ROLES,
  MEMBER_ROLE_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  PRIORITY_TONES,
  PROJECT_NEXT_STATUSES,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONES,
  TASK_BOARD_COLUMNS,
  TASK_NEXT_STATUSES,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
  isLate,
  isPriority,
  isProjectStatus,
  isTaskStatus,
} from './constants'
import { moduleTabs } from './tabs'

/**
 * Le vocabulaire et les règles dérivées de Projets & Planification — Module 03.
 *
 * CE QUI EST ÉPROUVÉ ICI SONT DES DÉFAUTS RÉELS.
 *
 * Le retard n'est stocké nulle part : il se dérive à chaque lecture. Une erreur
 * d'un jour dans cette dérivation ferait apparaître en retard une tâche due
 * aujourd'hui — ou, pire, tairait une tâche réellement dépassée. Les cas limites
 * sont donc éprouvés un par un.
 *
 * Les tables de transition sont le MIROIR des déclencheurs de la migration 058.
 * Elles ne protègent rien, mais un miroir faux propose un choix que la base
 * refusera : l'utilisateur lirait une règle métier comme une panne.
 */

describe('retard d’une tâche (§16)', () => {
  const TODAY = '2026-09-04'

  it('une échéance dépassée sur une tâche non terminée est un retard', () => {
    expect(isLate('2026-09-03', 'TODO', TODAY)).toBe(true)
    expect(isLate('2026-09-03', 'IN_PROGRESS', TODAY)).toBe(true)
    expect(isLate('2026-09-03', 'WAITING', TODAY)).toBe(true)
  })

  it('une échéance AUJOURD’HUI n’est pas dépassée', () => {
    // Le piège du lot : une échéance au 4 n'est pas en retard le 4. Une
    // comparaison `<=` ferait basculer en retard toutes les tâches du jour dès
    // leur matin (DEC-025 §e).
    expect(isLate(TODAY, 'TODO', TODAY)).toBe(false)
  })

  it('une échéance à venir n’est jamais un retard', () => {
    expect(isLate('2026-09-05', 'TODO', TODAY)).toBe(false)
  })

  it('une tâche terminée ou annulée n’est jamais en retard', () => {
    // §16 : le retard suppose que la tâche « n'est pas terminée ». Une tâche
    // close hier resterait éternellement « en retard » sans cette règle.
    expect(isLate('2026-08-01', 'DONE', TODAY)).toBe(false)
    expect(isLate('2026-08-01', 'CANCELLED', TODAY)).toBe(false)
  })

  it('une tâche sans échéance n’est jamais en retard (§14)', () => {
    expect(isLate(null, 'TODO', TODAY)).toBe(false)
  })
})

describe('statuts de projet (§7)', () => {
  it('les six statuts documentés portent un libellé et un ton', () => {
    expect(PROJECT_STATUSES).toHaveLength(6)
    for (const status of PROJECT_STATUSES) {
      expect(PROJECT_STATUS_LABELS[status]).toBeTruthy()
      expect(PROJECT_STATUS_TONES[status]).toBeTruthy()
    }
  })

  it('annulé est terminal, terminé peut être repris', () => {
    expect(PROJECT_NEXT_STATUSES.CANCELLED).toEqual([])
    expect(PROJECT_NEXT_STATUSES.DONE).toContain('ACTIVE')
  })

  it('aucune transition ne mène à un statut inconnu de la base', () => {
    for (const status of PROJECT_STATUSES) {
      for (const target of PROJECT_NEXT_STATUSES[status]) {
        expect(PROJECT_STATUSES).toContain(target)
        // Une transition vers soi-même n'est pas un changement d'état : la
        // proposer offrirait un geste sans effet.
        expect(target).not.toBe(status)
      }
    }
  })

  it('refuse un statut bricolé dans l’URL', () => {
    expect(isProjectStatus('ACTIVE')).toBe(true)
    expect(isProjectStatus('TERMINE')).toBe(false)
    expect(isProjectStatus("'; drop table")).toBe(false)
    expect(isProjectStatus(undefined)).toBe(false)
  })
})

describe('statuts de tâche (§12)', () => {
  it('les cinq statuts documentés portent un libellé et un ton', () => {
    expect(TASK_STATUSES).toHaveLength(5)
    for (const status of TASK_STATUSES) {
      expect(TASK_STATUS_LABELS[status]).toBeTruthy()
      expect(TASK_STATUS_TONES[status]).toBeTruthy()
    }
  })

  it('annulée est terminale, terminée peut être rouverte', () => {
    expect(TASK_NEXT_STATUSES.CANCELLED).toEqual([])
    expect(TASK_NEXT_STATUSES.DONE).toEqual(['TODO', 'IN_PROGRESS'])
  })

  it('« Terminée » est atteignable depuis tous les états ouverts', () => {
    // C'est la transition que `projects.tasks.close` gouverne : si l'un des
    // états ouverts ne la proposait pas, la clôture deviendrait impossible
    // depuis cet état sans qu'aucune règle ne le justifie.
    for (const status of ['TODO', 'IN_PROGRESS', 'WAITING'] as const) {
      expect(TASK_NEXT_STATUSES[status]).toContain('DONE')
    }
  })

  it('aucune transition ne mène à un statut inconnu de la base', () => {
    for (const status of TASK_STATUSES) {
      for (const target of TASK_NEXT_STATUSES[status]) {
        expect(TASK_STATUSES).toContain(target)
        expect(target).not.toBe(status)
      }
    }
  })

  it('le tableau ne montre pas les abandons (§34)', () => {
    expect(TASK_BOARD_COLUMNS).not.toContain('CANCELLED')
    for (const column of TASK_BOARD_COLUMNS) {
      expect(TASK_STATUSES).toContain(column)
    }
  })

  it('refuse un statut bricolé dans l’URL', () => {
    expect(isTaskStatus('DONE')).toBe(true)
    expect(isTaskStatus('EN_RETARD')).toBe(false)
    expect(isTaskStatus(undefined)).toBe(false)
  })
})

describe('priorités (§8)', () => {
  it('les quatre niveaux documentés portent un libellé et un ton', () => {
    expect(PRIORITIES).toEqual(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
    for (const priority of PRIORITIES) {
      expect(PRIORITY_LABELS[priority]).toBeTruthy()
      expect(PRIORITY_TONES[priority]).toBeTruthy()
    }
  })

  it('le quotidien reste neutre : seule l’urgence colore', () => {
    // §8 : « la priorité ne doit pas être utilisée pour transformer
    // artificiellement tous les projets en projets urgents ».
    expect(PRIORITY_TONES.LOW).toBe('neutral')
    expect(PRIORITY_TONES.NORMAL).toBe('neutral')
    expect(PRIORITY_TONES.URGENT).toBe('danger')
  })

  it('refuse une priorité bricolée dans l’URL', () => {
    expect(isPriority('URGENT')).toBe(true)
    expect(isPriority('CRITIQUE')).toBe(false)
  })
})

describe('rôles dans un projet (§9)', () => {
  it('le responsable n’est pas un rôle de la table des membres', () => {
    // Il est porté par `projects.owner_id` : deux emplacements pour la même
    // personne feraient deux vérités, dont l'une finirait par mentir.
    expect(MEMBER_ROLES).toEqual(['PARTICIPANT', 'OBSERVER'])
    for (const role of MEMBER_ROLES) {
      expect(MEMBER_ROLE_LABELS[role]).toBeTruthy()
    }
  })
})

describe('onglets du module', () => {
  it('ne propose que ce que les capacités ouvrent', () => {
    const tasksOnly = moduleTabs('taches', { projects: false, tasks: true })
    expect(tasksOnly.map((tab) => tab.key)).toEqual(['taches', 'mes-elements'])

    const projectsOnly = moduleTabs('projets', { projects: true, tasks: false })
    expect(projectsOnly.map((tab) => tab.key)).toEqual(['projets', 'mes-elements'])
  })

  it('propose les trois vues à qui détient les deux lectures', () => {
    const all = moduleTabs('projets', { projects: true, tasks: true })
    expect(all.map((tab) => tab.key)).toEqual(['projets', 'taches', 'mes-elements'])
    for (const tab of all) expect(tab.href).toBeTruthy()
  })

  it('n’affiche aucun onglet lorsqu’il n’y a nulle part où aller', () => {
    expect(moduleTabs('projets', { projects: false, tasks: false })).toEqual([])
  })
})
