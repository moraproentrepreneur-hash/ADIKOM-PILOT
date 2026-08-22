import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Identité documentaire d'ADIKOM.
 *
 * Lue depuis `company_profile` — sous-ensemble non sensible des paramètres,
 * accessible à tout compte authentifié. Aucun modèle documentaire ne recopie
 * ces informations : les corriger un jour se fera dans les Paramètres, en un
 * seul endroit, sans redéploiement (migration 027).
 */

export type DocumentIdentity = {
  legalName: string
  addressLines: string[]
  phone: string | null
  email: string | null
  website: string | null
  city: string | null
  country: string | null
}

/**
 * Valeur de repli si la configuration devenait illisible.
 *
 * Un document sans en-tête vaut mieux qu'un document portant une identité
 * inventée : les champs restent vides plutôt que devinés, et seule la raison
 * sociale — qui ne change pas — est conservée.
 */
const FALLBACK: DocumentIdentity = {
  legalName: 'ADIKOM TECHNOLOGIE & TRAVEL',
  addressLines: [],
  phone: null,
  email: null,
  website: null,
  city: null,
  country: null,
}

export async function getDocumentIdentity(): Promise<DocumentIdentity> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('company_profile')
    .select('legal_name, address_line1, address_line2, city, country, phone, email, website')
    .maybeSingle()

  if (error || !data) {
    console.error(`[documents] identité : ${error?.message ?? 'configuration introuvable'}`)
    return FALLBACK
  }

  return {
    legalName: data.legal_name || FALLBACK.legalName,
    addressLines: [data.address_line1, data.address_line2].filter(
      (line): line is string => Boolean(line)
    ),
    phone: data.phone,
    email: data.email,
    website: data.website,
    city: data.city,
    country: data.country,
  }
}
