import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Vue hiérarchique — Module 08 §35, §36, §37.
 *
 * L'organigramme est SERVI PAR LA BASE, et refait à chaque lecture : rien n'est
 * stocké, ni profondeur, ni effectif. Un organigramme tenu par déclencheur
 * serait faux au premier oubli, et un total faux fait autorité plus longtemps
 * qu'un total absent (DEC-035 §f, DEC-034 §a).
 *
 * `organisation_chart()` exige `users.hierarchy.view` et RIEN D'AUTRE. Ce n'est
 * pas un assouplissement : la migration 008 accorde cette capacité aux groupes
 * « Direction » et « Assistant(e) de direction » SANS leur donner
 * `users.users.view`. Si le dessin dépendait de la liste des utilisateurs, ces
 * deux groupes verraient un organigramme vide.
 *
 * La fonction ne rend que la STRUCTURE — identité d'affichage, fonction,
 * responsable, départements. Ni email, ni téléphone, ni dernière connexion :
 * ceux-là relèvent de la fiche, et la fiche a sa propre capacité (DEC-024).
 */

export type ChartNode = {
  id: string
  fullName: string
  jobTitle: string | null
  depth: number
  isSuperAdmin: boolean
  /** Son responsable déclaré n'est plus actif : le rattachement est à revoir. */
  isDetached: boolean
  departments: string[]
  /** Départements dont la personne est RESPONSABLE (§36). */
  managed: string[]
  children: ChartNode[]
}

export type OrganisationChart = {
  /** `false` : la capacité manque ; l'écran le dit au lieu d'afficher un vide. */
  readable: boolean
  roots: ChartNode[]
  /** Nombre de collaborateurs figurant au dessin. */
  total: number
  /** Comptes non actifs, donc absents : une absence se dit (DEC-017). */
  excluded: number
  /** Combien de nœuds sont rattachés à la racine faute de responsable actif. */
  detached: number
}

type RawNode = {
  id: string
  full_name: string
  job_title: string | null
  manager_id: string | null
  declared_manager_id: string | null
  depth: number
  sort_path: string
  is_super_admin: boolean
  is_detached: boolean
  departments: string[] | null
  managed: string[] | null
}

export async function getOrganisationChart(): Promise<OrganisationChart> {
  const supabase = await createSupabaseServerClient()

  const [chartResult, excludedResult] = await Promise.all([
    supabase.rpc('organisation_chart'),
    supabase.rpc('organisation_chart_excluded'),
  ])

  const empty: OrganisationChart = {
    readable: false,
    roots: [],
    total: 0,
    excluded: 0,
    detached: 0,
  }

  // Un refus est un cas fonctionnel attendu : la capacité manque.
  if (chartResult.error) return empty

  const rows = (chartResult.data ?? []) as RawNode[]

  /*
   * La base rend les lignes DÉJÀ ORDONNÉES par `sort_path` : un enfant suit
   * toujours son parent. L'arbre se reconstitue donc en une passe, sans tri
   * ni récursion côté application.
   */
  const byId = new Map<string, ChartNode>()
  const roots: ChartNode[] = []
  let detached = 0

  for (const row of rows) {
    const node: ChartNode = {
      id: row.id,
      fullName: row.full_name,
      jobTitle: row.job_title,
      depth: row.depth,
      isSuperAdmin: row.is_super_admin,
      isDetached: row.is_detached,
      departments: row.departments ?? [],
      managed: row.managed ?? [],
      children: [],
    }
    byId.set(node.id, node)
    if (node.isDetached) detached += 1
  }

  for (const row of rows) {
    const node = byId.get(row.id)
    if (!node) continue

    const parent = row.manager_id ? byId.get(row.manager_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  return {
    readable: true,
    roots,
    total: rows.length,
    excluded: excludedResult.error ? 0 : ((excludedResult.data as number) ?? 0),
    detached,
  }
}
