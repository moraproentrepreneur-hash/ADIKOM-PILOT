/**
 * L'HISTOIRE D'UNE LOCATION, RETIRÉE AVANT ELLE — LOT 22, DEC-045.
 *
 * POURQUOI CE MODULE EXISTE
 *
 * Avant le LOT 22, une recette retirait une location de démonstration ainsi :
 *
 *     photos d'état des lieux → états des lieux → occupations → location
 *
 * Le LOT 22 a donné trois enfants de plus à `rentals`, tous en `on delete
 * restrict` : son AVENANT, ses PÉRIODES, et le COÛT GELÉ de chaque période. Une
 * recette qui les ignore ne supprime plus rien — et, comme PostgREST ne lève
 * qu'un `23503` que le script traite en « retenu par une donnée réelle », elle
 * annonce un nettoyage propre en laissant derrière elle son client, ses
 * véhicules et ses contrats.
 *
 * C'est arrivé : quatre recettes ont laissé des sujets en base le jour même du
 * lot. Le remède n'est pas de corriger quatorze nettoyages à l'identique, c'est
 * d'écrire une fois ce qu'il faut retirer — et de l'appeler.
 *
 * L'ORDRE IMPORTE, ET IL EST ÉCRIT ICI UNE SEULE FOIS :
 *
 *     coût gelé  →  occupations  →  périodes  →  avenants  →  (la location)
 *
 * Les occupations passent AVANT les périodes parce qu'elles les DÉSIGNENT ; les
 * périodes avant les avenants parce qu'elles nomment l'avenant qui les a
 * ouvertes.
 *
 * Opération d'environnement : elle s'exécute avec la clé de service, seule
 * habilitée à supprimer (DEC-020).
 */

/**
 * Retire tout ce qu'une location porte, sans retirer la location.
 *
 * Idempotente : rejouée, elle ne supprime rien de plus et ne lève rien. Un
 * identifiant nul ou absent est ignoré — `in ()` serait illégal.
 */
export async function purgeRentalHistory(admin, rentalIds) {
  const ids = (Array.isArray(rentalIds) ? rentalIds : [rentalIds]).filter(Boolean)
  if (ids.length === 0) return

  await admin.from('rental_segment_costs').delete().in('rental_id', ids)
  await admin.from('vehicle_occupations').delete().in('source_id', ids)
  await admin.from('rental_segments').delete().in('rental_id', ids)
  await admin.from('rental_amendments').delete().in('rental_id', ids)
}
