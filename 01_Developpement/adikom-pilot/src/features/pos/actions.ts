'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { parseAmount } from '@/lib/money'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guarded, orNull, readText, toFieldErrors } from '@/lib/server-action'
import type { FormState } from '@/lib/form-state'

/**
 * Actions du point de vente — LOT 27 (Module 12).
 *
 * TROIS BARRIÈRES, COMME PARTOUT DANS LE SAAS
 *
 *   1. ici, `requirePermission` — un refus net, avant toute écriture ;
 *   2. la FONCTION en base, qui exige SES capacités (`require_capability`) et
 *      celles des lectures dont elle a besoin pour décider ;
 *   3. RLS et les gardes : une caisse et une session naissent et se modifient
 *      PAR LEURS FONCTIONS, jamais par écriture directe (Rapport 20 §3).
 *
 * Aucune de ces actions ne calcule un montant qui serait cru : l'écart est
 * dérivé en base (D1), et la clôture ne touche jamais la trésorerie (B-9).
 */

export type PosFormState = FormState

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /compte bancaire|compte de type Caisse|compte de caisse actif/i,
    'Une caisse s’adosse obligatoirement à un compte de type Caisse, actif.',
  ],
  [
    /compte adossé n'est pas actif|n'est pas actif/i,
    'Le compte adossé n’est pas actif : un compte inactif ou archivé ne reçoit plus de nouvelle opération.',
  ],
  [
    /compte adossé à la caisse est introuvable/i,
    'Le compte adossé n’est pas lisible avec vos droits : la consultation des comptes financiers est nécessaire.',
  ],
  [
    /session est ouverte sur cette caisse/i,
    'Une session est ouverte sur cette caisse : clôturez-la avant de changer son compte ou de la désactiver.',
  ],
  [
    /déjà ouverte sur la caisse|one_open_per_register/i,
    'Une session est déjà ouverte sur cette caisse. Une caisse n’a qu’une session ouverte à la fois.',
  ],
  [
    /tenez déjà une session ouverte|one_open_per_cashier/i,
    'Vous tenez déjà une session ouverte. Clôturez-la avant d’en ouvrir une autre.',
  ],
  [/caisse .* est inactive/i, 'Cette caisse est inactive : elle n’accepte aucune nouvelle session.'],
  [/déjà close|ne se rouvre pas/i, 'Cette session est déjà close. Une session close ne se rouvre pas.'],
  [
    /clôturer la session d'un autre caissier/i,
    'Clôturer la session d’un autre caissier suppose de pouvoir en voir les montants.',
  ],
  [/montant compté est obligatoire/i, 'Le montant compté est obligatoire pour clôturer.'],
  [/Caisse introuvable/i, 'Cette caisse est introuvable ou n’est pas accessible avec vos droits.'],
  [/Session introuvable/i, 'Cette session est introuvable ou n’est pas accessible avec vos droits.'],
  [/doit être nommée/i, 'Donnez un nom à cette caisse.'],
  [
    /Droit insuffisant pour cette opération/i,
    'Vous ne disposez pas de toutes les capacités requises pour cette opération.',
  ],
]

const labelSchema = z.string().trim().min(2, 'Donnez un nom à cette caisse.').max(120, 'Nom trop long.')
const locationSchema = z.string().trim().max(120, 'Lieu trop long.')

function readAmount(formData: FormData, name: string): number | null {
  const value = parseAmount(readText(formData, name))
  return value !== null && value >= 0 ? value : null
}

/* -------------------------------------------------------------------------- */
/*  Caisses                                                                    */
/* -------------------------------------------------------------------------- */

export async function createRegisterAction(
  prevState: PosFormState,
  formData: FormData
): Promise<PosFormState> {
  return guarded(
    'pdv:caisse:création',
    async () => {
      await requirePermission(PERMISSIONS.POS_REGISTERS_CREATE)

      const parsed = z
        .object({ label: labelSchema, location: locationSchema })
        .safeParse({ label: readText(formData, 'label'), location: readText(formData, 'location') })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const accountId = readText(formData, 'accountId')
      if (!accountId) return { fieldErrors: { accountId: 'Choisissez le compte de caisse adossé.' } }

      const supabase = await createSupabaseServerClient()
      const { data, error } = await supabase.rpc('create_pos_register', {
        p_label: parsed.data.label,
        p_account_id: accountId,
        p_location: orNull(parsed.data.location),
      })
      if (error) throw new Error(error.message)

      revalidatePath('/pdv/caisses')
      redirect(`/pdv/caisses/${data as string}?cree=1`)
    },
    ERROR_PATTERNS
  )
}

export async function updateRegisterAction(
  prevState: PosFormState,
  formData: FormData
): Promise<PosFormState> {
  return guarded(
    'pdv:caisse:modification',
    async () => {
      await requirePermission(PERMISSIONS.POS_REGISTERS_UPDATE)

      const registerId = readText(formData, 'registerId')
      if (!registerId) return { error: 'Caisse introuvable.' }

      const parsed = z
        .object({ label: labelSchema, location: locationSchema })
        .safeParse({ label: readText(formData, 'label'), location: readText(formData, 'location') })
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const accountId = readText(formData, 'accountId')
      if (!accountId) return { fieldErrors: { accountId: 'Choisissez le compte de caisse adossé.' } }

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase.rpc('update_pos_register', {
        p_register_id: registerId,
        p_label: parsed.data.label,
        p_account_id: accountId,
        p_location: orNull(parsed.data.location),
      })
      if (error) throw new Error(error.message)

      revalidatePath('/pdv/caisses')
      revalidatePath(`/pdv/caisses/${registerId}`)
      return { success: 'Caisse modifiée.' }
    },
    ERROR_PATTERNS
  )
}

export async function setRegisterActiveAction(
  prevState: PosFormState,
  formData: FormData
): Promise<PosFormState> {
  return guarded(
    'pdv:caisse:activation',
    async () => {
      await requirePermission(PERMISSIONS.POS_REGISTERS_ARCHIVE)

      const registerId = readText(formData, 'registerId')
      const active = readText(formData, 'active')
      if (!registerId || (active !== 'true' && active !== 'false')) {
        return { error: 'Opération incomplète : rechargez la page.' }
      }

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase.rpc('set_pos_register_active', {
        p_register_id: registerId,
        p_active: active === 'true',
        p_reason: orNull(readText(formData, 'reason')),
      })
      if (error) throw new Error(error.message)

      revalidatePath('/pdv/caisses')
      revalidatePath(`/pdv/caisses/${registerId}`)
      return { success: active === 'true' ? 'Caisse réactivée.' : 'Caisse désactivée.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Sessions                                                                   */
/* -------------------------------------------------------------------------- */

export async function openSessionAction(
  prevState: PosFormState,
  formData: FormData
): Promise<PosFormState> {
  return guarded(
    'pdv:session:ouverture',
    async () => {
      await requirePermission(PERMISSIONS.POS_SESSIONS_OPEN)

      const registerId = readText(formData, 'registerId')
      if (!registerId) return { fieldErrors: { registerId: 'Choisissez la caisse.' } }

      const openingFloat = readAmount(formData, 'openingFloat')
      if (openingFloat === null) {
        return {
          fieldErrors: {
            openingFloat: 'Indiquez le fond de caisse en KMF, entier et positif (0 s’il n’y en a pas).',
          },
        }
      }

      const supabase = await createSupabaseServerClient()
      const { data, error } = await supabase.rpc('open_pos_session', {
        p_register_id: registerId,
        p_opening_float: openingFloat,
      })
      if (error) throw new Error(error.message)

      revalidatePath('/pdv/sessions')
      revalidatePath('/pdv/caisses')
      redirect(`/pdv/sessions/${data as string}?ouverte=1`)
    },
    ERROR_PATTERNS
  )
}

export async function closeSessionAction(
  prevState: PosFormState,
  formData: FormData
): Promise<PosFormState> {
  return guarded(
    'pdv:session:clôture',
    async () => {
      await requirePermission(PERMISSIONS.POS_SESSIONS_CLOSE)

      const sessionId = readText(formData, 'sessionId')
      if (!sessionId) return { error: 'Session introuvable.' }

      const counted = readAmount(formData, 'countedAmount')
      if (counted === null) {
        return {
          fieldErrors: {
            countedAmount: 'Le montant compté est obligatoire : un entier en KMF, sans décimale.',
          },
        }
      }

      const note = readText(formData, 'note')
      if (note.length > 500) return { fieldErrors: { note: 'Observation trop longue (500 caractères).' } }

      const supabase = await createSupabaseServerClient()
      const { error } = await supabase.rpc('close_pos_session', {
        p_session_id: sessionId,
        p_counted_amount: counted,
        p_note: orNull(note),
      })
      if (error) throw new Error(error.message)

      revalidatePath('/pdv/sessions')
      revalidatePath('/pdv/caisses')
      redirect(`/pdv/sessions/${sessionId}?close=1`)
    },
    ERROR_PATTERNS
  )
}
