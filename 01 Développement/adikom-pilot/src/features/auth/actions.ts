'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Actions d'authentification.
 *
 * ADIKOM PILOT ne propose ni inscription publique ni création de compte en
 * libre-service : les comptes sont créés par le Super Admin
 * (03_Modules/08_Utilisateurs_et_Groupes.md §6).
 */

const credentialsSchema = z.object({
  email: z
    .string()
    .min(1, 'Veuillez saisir votre adresse email.')
    .email('Cette adresse email n’est pas valide.'),
  password: z.string().min(1, 'Veuillez saisir votre mot de passe.'),
})

export type SignInState = {
  error?: string
  fieldErrors?: { email?: string; password?: string }
}

/** Destination interne sûre : empêche une redirection ouverte via `suite`. */
function safeRedirectTarget(raw: FormDataEntryValue | null): string {
  const value = typeof raw === 'string' ? raw : ''
  if (value.startsWith('/') && !value.startsWith('//')) {
    return value
  }
  return '/tableau-de-bord'
}

export async function signInAction(
  _prevState: SignInState,
  formData: FormData
): Promise<SignInState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors
    return {
      fieldErrors: {
        email: flat.email?.[0],
        password: flat.password?.[0],
      },
    }
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error || !data.user) {
    // Message volontairement générique : ne jamais révéler si l'adresse existe
    // (CLAUDE.md §43 — ne pas exposer d'information interne par les erreurs).
    return { error: 'Identifiants incorrects. Veuillez réessayer.' }
  }

  // Le compte existe côté authentification, mais son profil interne peut être
  // désactivé ou suspendu : la désactivation prime sur tout
  // (05_Regles_Metier/05_Permissions.md §48).
  const { data: profile } = await supabase
    .from('app_users')
    .select('status, first_name, last_name')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!profile || profile.status !== 'ACTIVE') {
    await supabase.auth.signOut()
    return {
      error:
        "Votre compte n'est pas actif. Veuillez contacter l'administrateur d'ADIKOM PILOT.",
    }
  }

  // Traçabilité des connexions (05_Regles_Metier/06_Audit.md §25).
  await supabase.rpc('log_audit', {
    p_action: 'LOGIN',
    p_entity_type: 'app_users',
    p_entity_id: data.user.id,
    p_entity_label: `${profile.first_name} ${profile.last_name}`,
    p_module_code: 'users',
  })

  await supabase
    .from('app_users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', data.user.id)

  redirect(safeRedirectTarget(formData.get('suite')))
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    await supabase.rpc('log_audit', {
      p_action: 'LOGOUT',
      p_entity_type: 'app_users',
      p_entity_id: user.id,
      p_module_code: 'users',
    })
  }

  await supabase.auth.signOut()
  redirect('/connexion')
}
