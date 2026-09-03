import { describe, expect, it } from 'vitest'

import { civilToday, describePeriod, resolvePeriod } from './period'

/**
 * Les bornes de la période analysée — Module 01 §8.
 *
 * CE QUI EST ÉPROUVÉ ICI EST UN PIÈGE RÉEL, PAS UNE FORMALITÉ.
 *
 * L'application s'exécute en UTC sur Vercel, et les Comores sont à UTC+3. Le
 * 1er du mois à 01:00 aux Comores, il est encore le 31 du mois précédent pour
 * le serveur. Un tableau de bord calculé sur l'horloge du serveur afficherait
 * donc le mois écoulé pendant les trois premières heures de chaque mois — et
 * l'année écoulée pendant les trois premières heures de chaque année.
 *
 * Les fins de mois sont éprouvées sans jamais écrire « 30 » ou « 31 » dans le
 * code : le dernier jour se déduit du premier jour du mois suivant.
 */

const at = (iso: string) => new Date(iso)

describe('civilToday', () => {
  it('lit le jour des Comores, pas celui du serveur', () => {
    // 22:00 UTC le 31 août = 01:00 le 1er septembre aux Comores.
    expect(civilToday(at('2026-08-31T22:00:00Z'))).toBe('2026-09-01')
  })

  it('ne bascule pas trop tôt', () => {
    // 20:59 UTC le 31 août = 23:59 le 31 août aux Comores.
    expect(civilToday(at('2026-08-31T20:59:00Z'))).toBe('2026-08-31')
  })
})

describe('resolvePeriod', () => {
  // Mercredi 2 septembre 2026, 15:00 aux Comores.
  const now = at('2026-09-02T12:00:00Z')

  it('« aujourd’hui » tient sur un seul jour', () => {
    expect(resolvePeriod('jour', now)).toMatchObject({
      key: 'jour',
      from: '2026-09-02',
      to: '2026-09-02',
    })
  })

  it('la semaine commence le lundi (ISO 8601)', () => {
    expect(resolvePeriod('semaine', now)).toMatchObject({
      from: '2026-08-31',
      to: '2026-09-06',
    })
  })

  it('le mois est le mois civil, pas les trente derniers jours', () => {
    expect(resolvePeriod('mois', now)).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-30',
    })
  })

  it('le trimestre en cours va du 1er juillet au 30 septembre', () => {
    expect(resolvePeriod('trimestre', now)).toMatchObject({
      from: '2026-07-01',
      to: '2026-09-30',
    })
  })

  it('l’année en cours couvre les douze mois', () => {
    expect(resolvePeriod('annee', now)).toMatchObject({
      from: '2026-01-01',
      to: '2026-12-31',
    })
  })

  it('un mois de 31 jours ne perd pas son dernier jour', () => {
    expect(resolvePeriod('mois', at('2026-01-15T09:00:00Z')).to).toBe('2026-01-31')
  })

  it('février compte 28 jours, et 29 en année bissextile', () => {
    expect(resolvePeriod('mois', at('2026-02-15T09:00:00Z')).to).toBe('2026-02-28')
    expect(resolvePeriod('mois', at('2028-02-15T09:00:00Z')).to).toBe('2028-02-29')
  })

  it('bascule de mois sur le fuseau des Comores, jamais sur celui du serveur', () => {
    // 22:00 UTC le 31 août : le serveur est encore en août, ADIKOM est en
    // septembre. C'est septembre qui doit s'afficher.
    const period = resolvePeriod('mois', at('2026-08-31T22:00:00Z'))
    expect(period.from).toBe('2026-09-01')
    expect(period.to).toBe('2026-09-30')
  })

  it('bascule d’année sur le même principe', () => {
    const period = resolvePeriod('annee', at('2026-12-31T22:00:00Z'))
    expect(period.from).toBe('2027-01-01')
    expect(period.to).toBe('2027-12-31')
  })

  it('le premier trimestre commence bien au 1er janvier', () => {
    expect(resolvePeriod('trimestre', at('2026-03-31T09:00:00Z'))).toMatchObject({
      from: '2026-01-01',
      to: '2026-03-31',
    })
  })

  it('le dernier trimestre se termine au 31 décembre', () => {
    expect(resolvePeriod('trimestre', at('2026-11-05T09:00:00Z'))).toMatchObject({
      from: '2026-10-01',
      to: '2026-12-31',
    })
  })

  it('une période inconnue retombe sur le mois, sans erreur', () => {
    // Paramètre d'URL bricolé : le tableau de bord affiche une période valide
    // plutôt qu'une page en erreur.
    expect(resolvePeriod('; drop table', now).key).toBe('mois')
    expect(resolvePeriod(undefined, now).key).toBe('mois')
  })
})

describe('describePeriod', () => {
  it('nomme un jour unique sans intervalle', () => {
    const period = resolvePeriod('jour', at('2026-09-02T12:00:00Z'))
    expect(describePeriod(period)).toBe('le 02/09/2026')
  })

  it('nomme un intervalle en jours civils, sans conversion', () => {
    const period = resolvePeriod('mois', at('2026-09-02T12:00:00Z'))
    expect(describePeriod(period)).toBe('du 01/09/2026 au 30/09/2026')
  })
})
