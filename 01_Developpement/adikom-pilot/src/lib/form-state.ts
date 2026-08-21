/**
 * État partagé entre une action serveur et le formulaire qui l'appelle.
 *
 * Volontairement séparé de `server-action.ts`, marqué `server-only` : les
 * formulaires sont des composants clients et ont besoin du type et de la valeur
 * initiale. Les importer depuis la couche serveur ferait échouer le build.
 */
export type FormState = {
  error?: string
  success?: string
  fieldErrors?: Record<string, string | undefined>
}

export const EMPTY_FORM_STATE: FormState = {}
