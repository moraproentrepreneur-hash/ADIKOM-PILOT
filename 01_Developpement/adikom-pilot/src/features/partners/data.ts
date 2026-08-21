import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reportQueryFailure } from '@/lib/server-action'

/**
 * Accès aux données des partenaires.
 *
 * Réduit à ce dont le Parc automobile a besoin : proposer un partenaire au
 * rattachement d'un véhicule, et le relire ensuite. Aucune création, aucune
 * modification — il n'existe pas d'écran de gestion des partenariats, et cette
 * étape n'en crée pas.
 */

export { STATUS_LABELS, STATUS_TONES } from './constants'
export type { PartnerStatus } from './constants'

export type PartnerOption = { id: string; label: string }

/**
 * Partenaires sélectionnables.
 * Seul un partenaire actif peut recevoir un véhicule — la base l'impose
 * également, dans `set_vehicle_attachment`.
 */
export async function listPartnerOptions(): Promise<PartnerOption[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('partners')
    .select('id, partner_no, legal_name')
    .eq('status', 'ACTIVE')
    .order('legal_name')
    .limit(500)

  if (error) {
    reportQueryFailure('partenaires', error, 'La liste des partenaires n’a pas pu être chargée.')
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    label: `${row.legal_name} · ${row.partner_no}`,
  }))
}
