import type { PermissionChoice } from '@/features/users/constants'

/**
 * Constantes partagées du module Groupes.
 *
 * Séparées de `data.ts`, marqué `server-only` : les composants clients ont
 * besoin de ces libellés, et les importer depuis la couche de données
 * entraînerait le client Supabase serveur dans le bundle navigateur.
 */

/**
 * Libellés du sélecteur, côté GROUPE.
 *
 * Le mécanisme est celui de la fiche utilisateur — trois positions, une règle
 * ou aucune —, mais le sens du troisième état diffère : un groupe n'hérite de
 * rien. « Non défini » ne renvoie donc à aucune décision d'ailleurs ; il dit
 * simplement que le groupe ne se prononce pas, et laisse la règle individuelle
 * ou l'absence de droit s'appliquer.
 */
export const GROUP_CHOICE_LABELS: Record<PermissionChoice, string> = {
  INHERIT: 'Non défini',
  ALLOW: 'Accorder',
  DENY: 'Refuser',
}

/** Ce que le groupe décide pour une permission, en toutes lettres. */
export const GROUP_EFFECT_LABELS: Record<PermissionChoice, string> = {
  INHERIT: 'Le groupe ne se prononce pas',
  ALLOW: 'Accordée par ce groupe',
  DENY: 'Refusée par ce groupe',
}
