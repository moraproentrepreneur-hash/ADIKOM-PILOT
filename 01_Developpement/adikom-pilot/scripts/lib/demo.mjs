/**
 * Vocabulaire commun du jeu de démonstration — ADIKOM PILOT.
 *
 * Le SEUL point où se décide ce qui « est » une donnée de démonstration.
 * `seed-demo.mjs` l'écrit, `clean-demo.mjs` le relit : sans marqueur partagé,
 * le nettoyage devrait deviner, et une donnée réelle finirait par disparaître.
 */

/** Marqueur porté par toute fiche de démonstration dotée d'un champ libre. */
export const DEMO_NOTE = 'Donnée de démonstration — DEMO. Ne pas supprimer sans décision.'

/**
 * Marqueur d'un objet précis du scénario — `DEMO_NOTE [R1]`, `DEMO_NOTE [FC2]`.
 *
 * Une réservation n'a pas de clé naturelle : deux réservations du même client
 * sur la même période sont deux réservations légitimes. L'étiquette donne au
 * seed de quoi RETROUVER ce qu'il a déjà créé, et donc de ne pas le recréer.
 */
export function tag(code) {
  return `${DEMO_NOTE} [${code}]`
}

/** Préfixe des libellés visibles. Ce qui est de démonstration le dit. */
export const DEMO = 'DEMO'

/* -------------------------------------------------------------------------- */
/*  Empreinte du jeu de démonstration                                          */
/* -------------------------------------------------------------------------- */

/**
 * Ce que la base porte de DEMO, à l'instant où on le lui demande.
 *
 * POURQUOI UNE EMPREINTE, ET NON UN NOMBRE ÉCRIT EN DUR
 *
 * Vingt-deux recettes vérifiaient, en fin de parcours, que « les TROIS clients
 * DEMO sont intacts ». Le nombre n'était pas la règle : la règle est qu'une
 * recette ne touche à rien qui ne lui appartienne. Écrit en dur, il a cessé
 * d'être vrai le jour où la démonstration s'est étoffée — et vingt-deux
 * recettes ont échoué pour une raison qui n'était pas un défaut du SaaS.
 *
 * L'empreinte se prend AVANT toute écriture, et se compare à la fin. Elle dit
 * la même chose, et la dit quel que soit le jeu de données — donc encore
 * demain.
 */
/** Un décompte, réessayé : un aléa réseau ne vaut pas une empreinte fausse. */
async function countMarked(admin, table, column, scope) {
  let last = null

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .like(column, '%DEMO%')

    if (!result.error && typeof result.count === 'number') return result.count

    last = result
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
  }

  throw new Error(
    `L'empreinte du jeu de démonstration n'a pas pu être prise (${scope}) : ` +
      `${last?.error?.message || 'décompte absent'}, après trois essais. ` +
      'La recette ne démarre pas : elle ne saurait pas ce qu’elle a laissé.'
  )
}

export async function demoFootprint(admin) {
  const [clients, vehicles, suppliers, supplierInvoices, imputations] = await Promise.all([
    countMarked(admin, 'clients', 'legal_name', 'clients'),
    countMarked(admin, 'vehicles', 'model', 'véhicules'),
    countMarked(admin, 'suppliers', 'legal_name', 'fournisseurs'),
    countMarked(admin, 'supplier_invoices', 'notes', 'factures fournisseurs'),
    countMarked(admin, 'imputations', 'justification', 'imputations'),
  ])

  /*
   * UNE EMPREINTE QUI N'A PAS PU ÊTRE PRISE N'EST PAS UNE EMPREINTE DE ZÉRO.
   *
   * Un décompte peut échouer — un aléa réseau suffit —, et `count` revient
   * alors `null`. Ramené à 0 en silence, il faisait échouer la recette à la
   * comparaison FINALE, plusieurs minutes plus tard, sous un intitulé qui
   * accuse la fonctionnalité éprouvée : « les clients DEMO sont intacts —
   * 6 / 0 au départ ». Le défaut était ailleurs, et il était ici.
   *
   * `countMarked` réessaie, puis échoue TOUT DE SUITE en nommant sa cause.
   */
  return { clients, vehicles, suppliers, supplierInvoices, imputations }
}

/**
 * Le référentiel ENTIER, sans filtre — clients, véhicules, fournisseurs.
 *
 * Employée là où la recette vérifie qu'elle a bien tout nettoyé : le total doit
 * revenir à ce qu'il était, quelles qu'aient été les fiches créées entre-temps.
 */
export async function referentialFootprint(admin) {
  const [clients, vehicles, suppliers] = await Promise.all([
    admin.from('clients').select('id', { count: 'exact', head: true }),
    admin.from('vehicles').select('id', { count: 'exact', head: true }),
    admin.from('suppliers').select('id', { count: 'exact', head: true }),
  ])

  return {
    clients: clients.count ?? 0,
    vehicles: vehicles.count ?? 0,
    suppliers: suppliers.count ?? 0,
  }
}
