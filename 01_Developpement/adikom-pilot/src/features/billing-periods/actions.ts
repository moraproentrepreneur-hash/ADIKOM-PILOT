'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guarded, readText, toFieldErrors, type FormState } from '@/lib/server-action'
import { billingPlanSchema, cancelPeriodSchema, periodInvoiceSchema } from './schema'

/**
 * Actions de la facturation périodique — LOT 23, DEC-047.
 *
 * CHAQUE ACTION COMMENCE PAR SA CAPACITÉ, et par la sienne seule :
 *
 *   · définir le régime, annuler une période → `rental.rentals.billing.plan`
 *   · préparer la facture d'une période      → `billing.customer_invoices.create`
 *
 * Aucune n'ouvre l'autre (DEC-024, A-14). Décider qu'un contrat se facture par
 * mois et préparer une facture sont deux métiers : le premier engage la façon
 * dont ADIKOM réclame son argent, le second exécute.
 *
 * La vérification côté serveur n'est pas la seule — la base oppose les mêmes
 * refus à un appel direct : policies, `fn_rental_billing_period_guard`,
 * `fn_customer_invoice_coherence`, `require_capability`, et les deux index
 * uniques partiels. Masquer un bouton ne protège rien (CLAUDE.md §19).
 *
 * RIEN N'EST ÉCRIT D'ICI PAR UN `insert`. Définir un régime touche le contrat ET
 * ouvre N périodes contiguës ; les enchaîner depuis l'application laisserait, à
 * la moindre interruption, un contrat annoncé « longue durée » sans période, ou
 * un découpage à trou. Les fonctions atomiques sont le seul chemin.
 *
 * ET AUCUNE FACTURE N'EST CRÉÉE ICI PAR UN SECOND MÉCANISME (consigne §7) :
 * `create_customer_invoice` — celle du LOT 5 — reçoit simplement la période.
 */

export type BillingPeriodFormState = FormState

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /n'est pas en longue durée/i,
    'Ce contrat n’est pas en longue durée : définissez d’abord son régime de facturation.',
  ],
  [
    /la facture .* existe déjà sur ce contrat/i,
    'Une facture existe déjà sur ce contrat : son régime de facturation ne se change plus. Le modifier permettrait de facturer une seconde fois un temps déjà facturé.',
  ],
  [
    /ce régime est déjà celui du contrat/i,
    'Ce régime est déjà celui du contrat : un acte consigne un changement, pas une confirmation.',
  ],
  [
    /cette période est déjà couverte par la facture/i,
    'Cette période est déjà couverte par une facture. Une période ne se facture pas deux fois.',
  ],
  [
    /cette période court jusqu'au/i,
    'Cette période n’est pas encore échue : elle se facturera à son terme. On ne facture pas un temps qui n’a pas couru.',
  ],
  [
    /cette période facturable est annulée/i,
    'Cette période est annulée : elle ne sera jamais facturée.',
  ],
  [
    /seule la dernière période facturable s'annule/i,
    'Seule la dernière période s’annule : en retirer une du milieu laisserait un intervalle que personne ne facturerait.',
  ],
  [
    /la période est couverte par la facture/i,
    'Cette période est couverte par une facture : annulez d’abord la facture.',
  ],
  [
    /aucune période d'exploitation/i,
    'Ce contrat n’a aucune période d’exploitation : une facturation par période suppose une chronologie.',
  ],
  [
    /ne reçoit plus de période facturable|ne se change plus/i,
    'Le contrat n’est plus dans un état qui permet cet acte.',
  ],
  [
    /une fois le véhicule remis au client/i,
    'Une période ne se facture qu’une fois le véhicule remis au client, et tant que le dossier n’est ni annulé ni clôturé.',
  ],
  [
    /rental_billing_periods_no_overlap/i,
    'Cette période en recouvrirait une autre. Deux périodes d’un même contrat ne se chevauchent jamais — c’est ce qui interdit de facturer deux fois le même temps.',
  ],
  [
    /n'est pas lisible avec vos droits/i,
    'Certaines informations nécessaires à cette opération ne sont pas accessibles avec vos droits.',
  ],
  [
    /Droit insuffisant/i,
    'Votre compte ne détient pas la capacité requise pour cet acte.',
  ],
]

/** Les écrans que ce lot alimente. */
function revalidateBillingSurfaces(rentalId: string) {
  revalidatePath('/location/locations')
  revalidatePath(`/location/locations/${rentalId}`)
  revalidatePath('/facturation/clients')
}

/* -------------------------------------------------------------------------- */
/*  Régime de facturation — 🟩 A-6                                             */
/* -------------------------------------------------------------------------- */

/**
 * Définit le régime de facturation d'un contrat, et ouvre ses périodes.
 *
 * 🟩 A-6 : « Chaque fin du mois, on établit une facture » ET « par période
 * définie au contrat ». Les deux cadences sont validées : le système n'en
 * choisit aucune à la place de l'utilisateur.
 *
 * LES PÉRIODES SONT UNE CONSÉQUENCE, PAS UN SECOND ACTE. Poser le régime sans
 * ouvrir le découpage laisserait un contrat annoncé « mensuel » qui ne
 * proposerait jamais rien.
 */
export async function setBillingPlanAction(
  prevState: BillingPeriodFormState,
  formData: FormData
): Promise<BillingPeriodFormState> {
  return guarded(
    'facturation:régime',
    async () => {
      await requirePermission(PERMISSIONS.RENTALS_BILLING_PLAN)

      const parsed = billingPlanSchema.safeParse({
        rentalId: readText(formData, 'rentalId'),
        rentalType: readText(formData, 'rentalType'),
        cadence: readText(formData, 'cadence'),
      })

      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()

      const { data, error } = await supabase.rpc('set_rental_billing_plan', {
        p_rental_id: parsed.data.rentalId,
        p_type: parsed.data.rentalType,
        p_cadence: parsed.data.cadence,
      })

      if (error) throw new Error(error.message)

      revalidateBillingSurfaces(parsed.data.rentalId)

      const opened = typeof data === 'number' ? data : 0

      return {
        success:
          parsed.data.rentalType === 'LONG_TERM'
            ? `Régime enregistré : ce contrat se facture par période. ${opened} période${opened > 1 ? 's facturables ont' : ' facturable a'} été ouverte${opened > 1 ? 's' : ''}, sans chevauchement possible.`
            : 'Régime enregistré : ce contrat se facture une seule fois, à la fin. Les périodes ouvertes ont été annulées — elles restent lisibles dans l’historique.',
      }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Annuler la dernière période                                                */
/* -------------------------------------------------------------------------- */

/**
 * Annule la DERNIÈRE période facturable d'un contrat.
 *
 * Elle n'est pas supprimée : elle a existé, et l'histoire la garde
 * (CLAUDE.md §22). Une période facturée est refusée par la base, qui nomme la
 * facture.
 */
export async function cancelBillingPeriodAction(
  prevState: BillingPeriodFormState,
  formData: FormData
): Promise<BillingPeriodFormState> {
  return guarded(
    'facturation:période:annulation',
    async () => {
      await requirePermission(PERMISSIONS.RENTALS_BILLING_PLAN)

      const parsed = cancelPeriodSchema.safeParse({
        periodId: readText(formData, 'periodId'),
        rentalId: readText(formData, 'rentalId'),
      })

      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase.rpc('cancel_rental_billing_period', {
        p_period_id: parsed.data.periodId,
      })

      if (error) throw new Error(error.message)

      revalidateBillingSurfaces(parsed.data.rentalId)

      return {
        success:
          'Période annulée. Elle ne sera jamais facturée, et reste lisible dans l’historique du contrat.',
      }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Préparer la facture d'une période                                          */
/* -------------------------------------------------------------------------- */

/**
 * Prépare la facture d'une période facturable.
 *
 * AUCUN SECOND SYSTÈME DE FACTURATION (consigne §7) : c'est
 * `create_customer_invoice` — celle du LOT 5 — qui crée la facture, avec la même
 * numérotation, les mêmes lignes, le même règlement et la même trésorerie. Elle
 * reçoit simplement la période qu'elle couvre.
 *
 * LA FACTURE NAÎT SANS LIGNE, et c'est voulu (DEC-008) : la durée facturable
 * dépend d'une règle d'arrondi qui n'est pas arrêtée. L'écran de la facture
 * proposera ensuite le prix unitaire de chaque portion tarifaire, quantité vide.
 */
export async function createPeriodInvoiceAction(
  prevState: BillingPeriodFormState,
  formData: FormData
): Promise<BillingPeriodFormState> {
  return guarded(
    'facturation:période:facture',
    async () => {
      await requirePermission(PERMISSIONS.CUSTOMER_INVOICES_CREATE)

      const parsed = periodInvoiceSchema.safeParse({
        periodId: readText(formData, 'periodId'),
        rentalId: readText(formData, 'rentalId'),
        invoiceDate: readText(formData, 'invoiceDate'),
        dueDate: readText(formData, 'dueDate'),
        notes: readText(formData, 'notes'),
      })

      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()

      /*
       * Le client de la facture est CELUI DU CONTRAT, lu en base et non transmis
       * par le formulaire : une valeur postée pourrait désigner un autre tiers.
       * Le déclencheur de cohérence le revérifierait, mais un refus tardif
       * n'explique rien.
       */
      const { data: rental, error: rentalError } = await supabase
        .from('rentals')
        .select('client_id')
        .eq('id', parsed.data.rentalId)
        .maybeSingle()

      if (rentalError) throw new Error(rentalError.message)
      if (!rental) {
        return {
          error:
            'Cette location est introuvable, ou n’est pas lisible avec vos droits. La facture n’a pas été préparée.',
        }
      }

      const { data, error } = await supabase.rpc('create_customer_invoice', {
        p_client_id: rental.client_id,
        p_invoice_date: parsed.data.invoiceDate,
        p_due_date: parsed.data.dueDate,
        p_rental_id: parsed.data.rentalId,
        p_notes: parsed.data.notes,
        p_billing_period_id: parsed.data.periodId,
      })

      if (error) throw new Error(error.message)

      revalidateBillingSurfaces(parsed.data.rentalId)

      redirect(`/facturation/clients/${data as string}?cree=1`)
    },
    ERROR_PATTERNS
  )
}
