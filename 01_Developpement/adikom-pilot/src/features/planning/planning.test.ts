import { describe, expect, it } from 'vitest'

import {
  ACTION_NEXT_STATUSES,
  ACTION_STATUSES,
  ACTION_STATUS_LABELS,
  APPOINTMENT_STATUS_LABELS,
  CALENDAR_KINDS,
  CALENDAR_KIND_HREF,
  CALENDAR_KIND_LABELS,
  CALENDAR_VIEWS,
  MEETING_STATUS_LABELS,
  PLANNING_NEXT_STATUSES,
  PLANNING_STATUSES,
  calendarRange,
  calendarTitle,
  dayLabel,
  formatDuration,
  gridDays,
  hasEnded,
  isActionStatus,
  isCalendarKind,
  isCalendarView,
  isPlanningStatus,
  isWeekend,
  nextSlot,
  shiftAnchor,
} from './constants'

/**
 * Ce que ces tests protègent.
 *
 * L'arithmétique du calendrier est la seule partie du LOT 13 qui produise un
 * résultat sans passer par la base : des bornes fausses afficheraient une
 * semaine décalée, et personne ne s'en apercevrait avant de manquer une
 * réunion. Elle se teste donc ici, sans navigateur et sans horloge — chaque
 * fonction reçoit son jour d'ancrage.
 */

describe('vocabulaire du second volet', () => {
  it('un seul jeu d’états, deux accords (§21, §26)', () => {
    // La base ne connaît qu'un type : une réunion et un rendez-vous vivent le
    // même cycle. Seuls les MOTS diffèrent (CLAUDE.md §59).
    expect(PLANNING_STATUSES).toEqual(['PLANNED', 'HELD', 'CANCELLED'])

    for (const status of PLANNING_STATUSES) {
      expect(MEETING_STATUS_LABELS[status]).toBeTruthy()
      expect(APPOINTMENT_STATUS_LABELS[status]).toBeTruthy()
    }

    expect(MEETING_STATUS_LABELS.HELD).toBe('Tenue')
    expect(APPOINTMENT_STATUS_LABELS.HELD).toBe('Honoré')
  })

  it('annulé est terminal, tenu se replanifie (DEC-035 §d)', () => {
    expect(PLANNING_NEXT_STATUSES.CANCELLED).toEqual([])
    expect(PLANNING_NEXT_STATUSES.HELD).toContain('PLANNED')
    expect(PLANNING_NEXT_STATUSES.PLANNED).toEqual(['HELD', 'CANCELLED'])
  })

  it('une action n’a que trois états, et ce sont les mots des tâches (§25)', () => {
    // Ni « En cours » ni « En attente » : ce degré de suivi est précisément ce
    // qui la fait devenir une TÂCHE.
    expect(ACTION_STATUSES).toEqual(['TODO', 'DONE', 'CANCELLED'])
    expect(ACTION_STATUS_LABELS.TODO).toBe('À faire')
    expect(ACTION_STATUS_LABELS.DONE).toBe('Terminée')

    expect(ACTION_NEXT_STATUSES.CANCELLED).toEqual([])
    expect(ACTION_NEXT_STATUSES.DONE).toEqual(['TODO'])
  })

  it('refuse un état bricolé dans l’URL', () => {
    expect(isPlanningStatus('HELD')).toBe(true)
    expect(isPlanningStatus('TENUE')).toBe(false)
    expect(isActionStatus('DONE')).toBe(true)
    expect(isActionStatus('IN_PROGRESS')).toBe(false)
    expect(isCalendarView('mois')).toBe(true)
    expect(isCalendarView('trimestre')).toBe(false)
    expect(isCalendarKind('MEETING')).toBe(true)
    expect(isCalendarKind('DECISION')).toBe(false)
  })

  it('les trois couches du calendrier mènent chacune à sa fiche (§19)', () => {
    expect(CALENDAR_KINDS).toEqual(['TASK', 'MEETING', 'APPOINTMENT'])
    for (const kind of CALENDAR_KINDS) {
      expect(CALENDAR_KIND_LABELS[kind]).toBeTruthy()
      expect(CALENDAR_KIND_HREF[kind]('abc')).toContain('abc')
    }
    // Les décisions et les actions n'y figurent pas : elles n'ont pas de place
    // dans le temps, elles découlent de ce qui en a.
    expect(CALENDAR_KINDS).not.toContain('DECISION')
  })
})

describe('durées (§21, §26)', () => {
  it('se lisent en heures, jamais en minutes cumulées', () => {
    expect(formatDuration(30)).toBe('30 min')
    expect(formatDuration(60)).toBe('1 h')
    expect(formatDuration(90)).toBe('1 h 30')
    expect(formatDuration(125)).toBe('2 h 05')
    expect(formatDuration(480)).toBe('8 h')
  })

  it('une durée absente ne s’invente pas', () => {
    expect(formatDuration(null)).toBeNull()
    expect(formatDuration(0)).toBeNull()
    expect(formatDuration(undefined)).toBeNull()
  })
})

describe('fin d’une réunion (§23)', () => {
  const start = '2026-09-04T10:00:00.000Z'

  it('c’est la FIN qui compte, pas le début', () => {
    // Une réunion de 90 minutes commencée il y a une heure n'est pas terminée :
    // son compte rendu ne se réclame pas encore.
    const uneHeureApres = Date.parse('2026-09-04T11:00:00.000Z')
    expect(hasEnded(start, 90, uneHeureApres)).toBe(false)

    const deuxHeuresApres = Date.parse('2026-09-04T12:00:00.000Z')
    expect(hasEnded(start, 90, deuxHeuresApres)).toBe(true)
  })

  it('une réunion à venir n’est jamais terminée', () => {
    expect(hasEnded(start, 60, Date.parse('2026-09-04T09:00:00.000Z'))).toBe(false)
  })
})

describe('créneau proposé par défaut', () => {
  it('propose demain, jamais une heure déjà passée', () => {
    expect(nextSlot('2026-09-04')).toBe('2026-09-05T09:00')
    expect(nextSlot('2026-09-30')).toBe('2026-10-01T09:00')
    // Fin d'année : le passage se fait sans arithmétique locale.
    expect(nextSlot('2026-12-31')).toBe('2027-01-01T09:00')
  })
})

describe('bornes des vues du calendrier (§20)', () => {
  it('la journée ne dure qu’un jour', () => {
    expect(calendarRange('jour', '2026-09-04')).toEqual({
      from: '2026-09-04',
      to: '2026-09-04',
    })
  })

  it('la semaine commence un LUNDI', () => {
    // Le 4 septembre 2026 est un vendredi : la semaine va du 31 août au 6.
    expect(calendarRange('semaine', '2026-09-04')).toEqual({
      from: '2026-08-31',
      to: '2026-09-06',
    })

    // Un dimanche appartient à la semaine qui l'a commencé, pas à la suivante.
    expect(calendarRange('semaine', '2026-09-06')).toEqual({
      from: '2026-08-31',
      to: '2026-09-06',
    })

    // Et un lundi ouvre la sienne.
    expect(calendarRange('semaine', '2026-09-07')).toEqual({
      from: '2026-09-07',
      to: '2026-09-13',
    })
  })

  it('le mois va du premier au dernier jour, février compris', () => {
    expect(calendarRange('mois', '2026-09-04')).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    })
    expect(calendarRange('mois', '2026-02-15')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    })
    // 2028 est bissextile : le calcul ne suppose pas 28 jours.
    expect(calendarRange('mois', '2028-02-15')).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    })
  })

  it('l’agenda regarde plus loin : c’est une liste, pas une grille', () => {
    const { from, to } = calendarRange('agenda', '2026-09-04')
    expect(from).toBe('2026-08-31')
    expect(to).toBe('2026-09-27')
  })

  it('chaque vue produit un titre lisible', () => {
    for (const view of CALENDAR_VIEWS) {
      const { from, to } = calendarRange(view, '2026-09-04')
      expect(calendarTitle(view, from, to)).toBeTruthy()
    }

    expect(calendarTitle('mois', '2026-09-01', '2026-09-30')).toBe('septembre 2026')
    expect(calendarTitle('jour', '2026-09-04', '2026-09-04')).toBe('vendredi 4 septembre 2026')
  })
})

describe('navigation d’une période à l’autre', () => {
  it('le mois avance de mois en mois, et passe l’année', () => {
    expect(shiftAnchor('mois', '2026-09-15', 1)).toBe('2026-10-01')
    expect(shiftAnchor('mois', '2026-12-15', 1)).toBe('2027-01-01')
    expect(shiftAnchor('mois', '2026-01-15', -1)).toBe('2025-12-01')
  })

  it('la semaine avance de sept jours, le jour d’un seul', () => {
    expect(shiftAnchor('semaine', '2026-09-04', 1)).toBe('2026-09-11')
    expect(shiftAnchor('semaine', '2026-09-04', -1)).toBe('2026-08-28')
    expect(shiftAnchor('jour', '2026-09-04', 1)).toBe('2026-09-05')
    expect(shiftAnchor('jour', '2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('grille du calendrier', () => {
  it('se lit par semaines ENTIÈRES, du lundi au dimanche', () => {
    const days = gridDays('2026-09-01', '2026-09-30')

    // Septembre 2026 commence un mardi : la grille remonte au lundi 31 août.
    expect(days[0]).toBe('2026-08-31')
    // Elle se termine un dimanche.
    expect(days.length % 7).toBe(0)
    expect(dayLabel(days[days.length - 1])).toContain('dimanche')

    // Tous les jours du mois y sont, et une seule fois.
    expect(days).toContain('2026-09-01')
    expect(days).toContain('2026-09-30')
    expect(new Set(days).size).toBe(days.length)
  })

  it('une semaine complète fait exactement sept cases', () => {
    expect(gridDays('2026-08-31', '2026-09-06')).toHaveLength(7)
  })

  it('reconnaît le samedi et le dimanche', () => {
    expect(isWeekend('2026-09-05')).toBe(true) // samedi
    expect(isWeekend('2026-09-06')).toBe(true) // dimanche
    expect(isWeekend('2026-09-07')).toBe(false) // lundi
    expect(isWeekend('2026-09-04')).toBe(false) // vendredi
  })
})
