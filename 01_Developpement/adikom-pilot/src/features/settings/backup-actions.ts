'use server'

import { revalidatePath } from 'next/cache'

import { requireUser, type SessionUser } from '@/lib/auth/dal'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { friendlyError, guarded, readText, type FormState } from '@/lib/server-action'

/**
 * Sauvegarde, réinitialisation, restauration — Module 09, LOT 18.
 *
 * TROIS ACTES ADMINISTRATIFS, RÉSERVÉS AU SUPER ADMIN
 *
 * Aucune permission du catalogue ne les gouverne, et c'est délibéré (DEC-041) :
 * une capacité n'existe que si elle peut être ATTRIBUÉE (CLAUDE.md §19 bis).
 * Celles-ci ne le seront jamais — la réinitialisation efface l'activité entière
 * d'ADIKOM, la restauration la réécrit. Elles suivent donc le statut, non une
 * permission déléguable.
 *
 * TROIS BARRIÈRES, ET AUCUNE NE SUFFIT SEULE
 *
 *   1. L'ÉCRAN n'affiche l'onglet qu'au Super Admin — confort de lecture.
 *   2. CETTE COUCHE revérifie le statut à chaque appel. Un formulaire rejoué,
 *      un appel direct à l'action : même refus.
 *   3. LA BASE revérifie à son tour (`assert_backup_operator`), et l'`EXECUTE`
 *      des trois fonctions est retiré à `authenticated` — aucun jeton
 *      d'utilisateur ne les atteint, quelle que soit la requête forgée.
 *
 * LE COMPTE SUPER ADMIN N'EST DANS AUCUN PÉRIMÈTRE
 *
 * `app_users` ne figure ni dans l'export, ni dans la réinitialisation, ni dans
 * la restauration (`backup_scope`, migration 075). Aucune de ces opérations ne
 * peut donc supprimer, modifier ni remplacer un compte — la connexion du Super
 * Admin survit à toutes les trois, par construction et non par précaution.
 */

/*
 * UN MODULE `'use server'` N'EXPORTE QUE DES FONCTIONS ASYNCHRONES.
 *
 * Exporter une constante depuis ce fichier ferait disparaître TOUS ses exports
 * à la compilation — le build échoue alors sur les actions elles-mêmes, sans
 * rapport apparent avec la cause. Les mots de confirmation sont donc déclarés
 * ici sans être exportés, et redéclarés par l'écran qui les affiche : ils ne
 * voyagent pas, ils se correspondent.
 */

const SETTINGS_PATH = '/parametres'

/** Mot exigé avant la réinitialisation. Repris tel quel par la base. */
const RESET_CONFIRMATION = 'REINITIALISER'

/** Mot exigé avant la restauration. */
const RESTORE_CONFIRMATION = 'RESTAURER'

/** Un fichier de sauvegarde plus lourd n'est pas refusé par prudence : il est
 *  refusé parce qu'aucune sauvegarde légitime de ce SaaS ne l'est. */
const BACKUP_MAX_BYTES = 25 * 1024 * 1024

/**
 * Exige le Super Admin.
 *
 * Le message ne nomme aucune permission : il n'y en a pas. Il dit le statut
 * requis, ce qui est la seule information utile et la seule vraie.
 */
async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser()

  if (!user.isSuperAdmin) {
    throw new Error(
      'Opération refusée : la sauvegarde, la réinitialisation et la restauration sont réservées au Super Admin.'
    )
  }

  return user
}

const PATTERNS: readonly [RegExp, string][] = [
  [
    /réservées au Super Admin/i,
    'Opération refusée : ces opérations sont réservées au Super Admin.',
  ],
  [
    /ne fait pas partie du périmètre/i,
    'Fichier refusé : il contient des données hors du périmètre de sauvegarde. Les comptes, les permissions et le journal d’activité ne se restaurent pas.',
  ],
  [/n'est pas une sauvegarde ADIKOM PILOT|n’est pas une sauvegarde/i,
    'Fichier refusé : ce n’est pas une sauvegarde ADIKOM PILOT.'],
  [/sauvegarde en version/i,
    'Fichier refusé : cette sauvegarde a été produite par une version plus récente de l’application.'],
]

/* -------------------------------------------------------------------------- */
/*  Réinitialiser                                                              */
/* -------------------------------------------------------------------------- */

export async function resetSaasAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  return guarded('sauvegarde:réinitialisation', () => resetInner(formData), PATTERNS)
}

async function resetInner(formData: FormData): Promise<FormState> {
  const user = await requireSuperAdmin()

  /*
   * LA CONFIRMATION EST VÉRIFIÉE ICI, PUIS EN BASE.
   *
   * Un bouton ne protège de rien : la double saisie n'est une garde que parce
   * que le serveur l'exige, et que la base l'exige à nouveau. Un appel qui
   * l'omettrait serait refusé par `admin_reset_business_data`.
   */
  if (readText(formData, 'confirmation').trim() !== RESET_CONFIRMATION) {
    return {
      fieldErrors: {
        confirmation: `Saisissez exactement « ${RESET_CONFIRMATION} » pour confirmer.`,
      },
    }
  }

  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.rpc('admin_reset_business_data', {
    p_actor_id: user.id,
    p_confirmation: RESET_CONFIRMATION,
  })

  /*
   * UN REFUS DE LA BASE SE JOURNALISE, MÊME QUAND IL NE SE MONTRE PAS.
   *
   * L'utilisateur reçoit un message fonctionnel — jamais le détail technique
   * (CLAUDE.md §43). Mais un échec renvoyé sans trace côté serveur est un
   * défaut MUET : c'est exactement ce qui a masqué, un temps, le refus
   * « DELETE requires a WHERE clause » opposé par PostgREST.
   */
  if (error) {
    console.error(`[sauvegarde:réinitialisation] ${error.code ?? ''} ${error.message}`)
    return { error: friendlyError(error.message, PATTERNS) }
  }

  const total = Number((data as { total_supprime?: number } | null)?.total_supprime ?? 0)

  revalidatePath(SETTINGS_PATH)

  return {
    success:
      total === 0
        ? 'Aucune donnée métier à supprimer : le SaaS était déjà vierge. Les comptes, les permissions et la configuration sont intacts.'
        : `${total} ligne(s) de données métier supprimée(s). Les comptes — Super Admin compris —, les permissions, la configuration et le journal d’activité sont conservés.`,
  }
}

/* -------------------------------------------------------------------------- */
/*  Restaurer                                                                  */
/* -------------------------------------------------------------------------- */

export async function restoreBackupAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  return guarded('sauvegarde:restauration', () => restoreInner(formData), PATTERNS)
}

async function restoreInner(formData: FormData): Promise<FormState> {
  const user = await requireSuperAdmin()

  if (readText(formData, 'confirmation').trim() !== RESTORE_CONFIRMATION) {
    return {
      fieldErrors: {
        confirmation: `Saisissez exactement « ${RESTORE_CONFIRMATION} » pour confirmer.`,
      },
    }
  }

  const file = formData.get('fichier')

  if (!(file instanceof File) || file.size === 0) {
    return { fieldErrors: { fichier: 'Choisissez un fichier de sauvegarde JSON.' } }
  }

  if (file.size > BACKUP_MAX_BYTES) {
    return {
      fieldErrors: {
        fichier: `Fichier trop volumineux (maximum ${Math.round(BACKUP_MAX_BYTES / 1024 / 1024)} Mo).`,
      },
    }
  }

  /*
   * LE FICHIER N'EST PAS CRU SUR PAROLE, ET CE N'EST QUE LA PREMIÈRE LECTURE.
   *
   * Ici, on vérifie seulement que c'est un JSON et que l'enveloppe a la forme
   * attendue — assez pour refuser vite, avec un message clair. Le contrôle qui
   * COMPTE est celui de `admin_restore_backup` : format, version, périmètre
   * table par table, puis toutes les contraintes de la base.
   */
  let payload: unknown

  try {
    payload = JSON.parse(await file.text())
  } catch {
    return {
      fieldErrors: { fichier: 'Ce fichier n’est pas un JSON lisible.' },
    }
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { fieldErrors: { fichier: 'Ce fichier ne contient pas une sauvegarde ADIKOM PILOT.' } }
  }

  const envelope = payload as Record<string, unknown>

  if (envelope.format !== 'adikom-pilot.sauvegarde') {
    return { fieldErrors: { fichier: 'Ce fichier n’est pas une sauvegarde ADIKOM PILOT.' } }
  }

  if (!envelope.donnees || typeof envelope.donnees !== 'object' || Array.isArray(envelope.donnees)) {
    return {
      fieldErrors: { fichier: 'Sauvegarde incomplète : la section « donnees » est absente.' },
    }
  }

  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.rpc('admin_restore_backup', {
    p_actor_id: user.id,
    p_payload: payload,
  })

  if (error) {
    console.error(`[sauvegarde:restauration] ${error.code ?? ''} ${error.message}`)
    return { error: friendlyError(error.message, PATTERNS) }
  }

  const result = (data ?? {}) as {
    total_restaure?: number
    lignes_ecartees?: number
    signatures_perdues?: number
  }

  revalidatePath(SETTINGS_PATH)

  const parts = [`${Number(result.total_restaure ?? 0)} ligne(s) restaurée(s).`]

  if (Number(result.lignes_ecartees ?? 0) > 0) {
    parts.push(
      `${result.lignes_ecartees} ligne(s) écartée(s) : elles désignaient un compte qui n’existe plus.`
    )
  }

  if (Number(result.signatures_perdues ?? 0) > 0) {
    parts.push(
      `${result.signatures_perdues} référence(s) d’auteur non retrouvée(s) : la donnée est conservée, sa signature est vide.`
    )
  }

  parts.push('Les comptes et les permissions n’ont pas été touchés.')

  return { success: parts.join(' ') }
}
