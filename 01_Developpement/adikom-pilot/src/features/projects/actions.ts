'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { PERMISSIONS } from '@/lib/auth/permissions'
import { requirePermission } from '@/lib/auth/dal'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guarded, orNull, readText, toFieldErrors, type FormState } from '@/lib/server-action'
import { MEMBER_ROLES, PRIORITIES, PROJECT_STATUSES, TASK_STATUSES } from './constants'

/**
 * Actions de Projets & Planification — Phase 4, LOT 12.
 *
 * DEUX BARRIÈRES, JAMAIS UNE SEULE.
 *
 * `requirePermission` exige la capacité de l'acte demandé ; RLS refuse de toute
 * façon l'écriture ; et les déclencheurs de la migration 058 exigent
 * `projects.archive` pour archiver et `projects.tasks.close` pour clôturer, y
 * compris lorsque l'appel ne passe par aucun écran (DEC-011, DEC-024).
 *
 * CE MODULE NE DÉCLENCHE RIEN AILLEURS.
 *
 * Aucune réservation, aucune facture, aucune maintenance n'est créée ni modifiée
 * depuis ici : le module est une couche d'ORGANISATION (§3, §45). Il référence,
 * il ne pilote pas.
 *
 * AUCUNE SUPPRESSION DE PROJET NI DE TÂCHE.
 *
 * Un projet terminé se range (§48) ; une tâche abandonnée s'annule (§12). La
 * base refuse d'ailleurs tout DELETE à un utilisateur authentifié (migration
 * 021). Seul le retrait d'un participant en est un — une association se défait,
 * et le journal d'audit en conserve la trace.
 */

export type ProjectFormState = FormState

const ERROR_PATTERNS: readonly [RegExp, string][] = [
  [
    /Transition de projet refusée/i,
    'Ce changement d’état n’est pas possible depuis l’état actuel.',
  ],
  [
    /Transition de tâche refusée/i,
    'Ce changement d’état n’est pas possible depuis l’état actuel.',
  ],
  [/ce projet est archivé/i, 'Ce projet est archivé : il n’accepte plus de tâche.'],
  [
    /projects_dates_coherent|tasks_dates_coherent/i,
    'L’échéance ne peut pas précéder la date de début.',
  ],
  [
    /projects_single_party/i,
    'Un projet se rattache à un seul tiers : client, fournisseur ou partenaire.',
  ],
  [
    /clôturer une tâche/i,
    'Vous ne disposez pas du droit de clôturer une tâche.',
  ],
  [
    /archiver un projet|restaurer un projet/i,
    'Vous ne disposez pas du droit d’archiver un projet.',
  ],
  [
    /project_members_pkey/i,
    'Cette personne fait déjà partie du projet.',
  ],
]

/* -------------------------------------------------------------------------- */
/*  Projets                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Une date de formulaire, ou rien.
 *
 * Un projet se date en JOURS civils : aucune conversion de fuseau n'a lieu ici,
 * contrairement aux instants du cycle d'exploitation (`fromLocalInput`). Une
 * échéance au 30 est le 30, quelle que soit l'heure à laquelle on la saisit.
 */
const dayOrEmpty = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: 'Cette date n’est pas valide.',
  })
  .optional()

const projectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Le nom du projet est obligatoire.')
    .max(160, 'Ce nom est trop long.'),
  description: z.string().trim().max(4000, 'La description est trop longue.').optional(),
  objective: z.string().trim().max(2000, 'L’objectif est trop long.').optional(),
  priority: z.enum(PRIORITIES, { message: 'Choisissez une priorité.' }),
  startsOn: dayOrEmpty,
  dueOn: dayOrEmpty,
})

/**
 * Le tiers rattaché — un seul, et son type dit lequel (§28).
 *
 * Le couple (type, identifiant) arrive du formulaire ; il est traduit en trois
 * colonnes nullables dont la base garantit l'exclusivité. Un type inconnu ne
 * rattache rien : il ne provoque pas d'erreur, il ne laisse pas non plus passer
 * une valeur arbitraire.
 */
function readParty(formData: FormData) {
  const type = readText(formData, 'partyType')
  const id = orNull(readText(formData, 'partyId'))

  return {
    client_id: type === 'CLIENT' ? id : null,
    supplier_id: type === 'SUPPLIER' ? id : null,
    partner_id: type === 'PARTNER' ? id : null,
  }
}

function readProjectForm(formData: FormData) {
  return {
    name: readText(formData, 'name'),
    description: readText(formData, 'description'),
    objective: readText(formData, 'objective'),
    priority: readText(formData, 'priority') || 'NORMAL',
    startsOn: readText(formData, 'startsOn'),
    dueOn: readText(formData, 'dueOn'),
  }
}

function toProjectRow(input: z.infer<typeof projectSchema>, formData: FormData) {
  return {
    name: input.name,
    description: orNull(input.description),
    objective: orNull(input.objective),
    priority: input.priority,
    starts_on: orNull(input.startsOn),
    due_on: orNull(input.dueOn),
    owner_id: orNull(readText(formData, 'ownerId')),
    ...readParty(formData),
  }
}

export async function createProjectAction(
  prevState: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  return guarded(
    'projets:création',
    async () => {
      const actor = await requirePermission(PERMISSIONS.PROJECTS_CREATE)

      const parsed = projectSchema.safeParse(readProjectForm(formData))
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()

      const { data, error } = await supabase
        .from('projects')
        .insert({
          ...toProjectRow(parsed.data, formData),
          created_by: actor.id,
          updated_by: actor.id,
        })
        .select('id')
        .single()

      if (error) throw new Error(error.message)

      revalidatePath('/projets')
      redirect(`/projets/${data.id}?cree=1`)
    },
    ERROR_PATTERNS
  )
}

export async function updateProjectAction(
  prevState: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  return guarded(
    'projets:modification',
    async () => {
      await requirePermission(PERMISSIONS.PROJECTS_UPDATE)

      const projectId = readText(formData, 'projectId')
      if (!projectId) return { error: 'Projet introuvable.' }

      const parsed = projectSchema.safeParse(readProjectForm(formData))
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('projects')
        .update(toProjectRow(parsed.data, formData))
        .eq('id', projectId)

      if (error) throw new Error(error.message)

      revalidatePath('/projets')
      revalidatePath(`/projets/${projectId}`)
      redirect(`/projets/${projectId}?enregistre=1`)
    },
    ERROR_PATTERNS
  )
}

/**
 * Changement d'état d'un projet (§7).
 *
 * `projects.update` suffit : le catalogue ne porte aucune capacité de clôture
 * de projet, et §42 n'en nomme pas. L'ENCHAÎNEMENT, lui, n'est pas affaire de
 * droit : le déclencheur refuse de reprendre un projet annulé, quelle que soit
 * la capacité détenue.
 */
export async function setProjectStatusAction(
  prevState: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  return guarded(
    'projets:statut',
    async () => {
      await requirePermission(PERMISSIONS.PROJECTS_UPDATE)

      const projectId = readText(formData, 'projectId')
      const status = readText(formData, 'status')

      if (!projectId || !PROJECT_STATUSES.includes(status as (typeof PROJECT_STATUSES)[number])) {
        return { error: 'Opération invalide.' }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('projects')
        .update({ status, status_reason: orNull(readText(formData, 'reason')) })
        .eq('id', projectId)

      if (error) throw new Error(error.message)

      revalidatePath('/projets')
      revalidatePath(`/projets/${projectId}`)

      return { success: 'L’état du projet a été mis à jour.' }
    },
    ERROR_PATTERNS
  )
}

/**
 * Ranger un projet, ou le ressortir (§48).
 *
 * Une capacité distincte, et non un cas particulier de la modification : c'est
 * `projects.archive` qui l'autorise, ici comme en base (DEC-024).
 */
export async function archiveProjectAction(
  prevState: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  return guarded(
    'projets:archivage',
    async () => {
      await requirePermission(PERMISSIONS.PROJECTS_ARCHIVE)

      const projectId = readText(formData, 'projectId')
      if (!projectId) return { error: 'Projet introuvable.' }

      const archive = readText(formData, 'archive') === '1'

      const supabase = await createSupabaseServerClient()

      // `archived_at` et `archived_by` sont posés par le déclencheur : les
      // écrire ici en ferait une seconde vérité, que rien ne tiendrait à jour
      // lors d'un archivage venu d'ailleurs.
      const { error } = await supabase
        .from('projects')
        .update({ is_archived: archive })
        .eq('id', projectId)

      if (error) throw new Error(error.message)

      revalidatePath('/projets')
      revalidatePath(`/projets/${projectId}`)

      return {
        success: archive
          ? 'Le projet a été archivé. Ses données restent consultables.'
          : 'Le projet a été restauré.',
      }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Participants — §9                                                          */
/* -------------------------------------------------------------------------- */

export async function addProjectMemberAction(
  prevState: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  return guarded(
    'projets:participant',
    async () => {
      const actor = await requirePermission(PERMISSIONS.PROJECTS_UPDATE)

      const projectId = readText(formData, 'projectId')
      const userId = readText(formData, 'userId')
      const role = readText(formData, 'role') || 'PARTICIPANT'

      if (!projectId || !userId) return { error: 'Désignez la personne à ajouter.' }
      if (!MEMBER_ROLES.includes(role as (typeof MEMBER_ROLES)[number])) {
        return { fieldErrors: { role: 'Choisissez un rôle.' } }
      }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('project_members')
        .insert({ project_id: projectId, user_id: userId, role, created_by: actor.id })

      if (error) throw new Error(error.message)

      revalidatePath(`/projets/${projectId}`)

      return { success: 'La personne a été ajoutée au projet.' }
    },
    ERROR_PATTERNS
  )
}

export async function removeProjectMemberAction(
  prevState: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  return guarded(
    'projets:participant',
    async () => {
      await requirePermission(PERMISSIONS.PROJECTS_UPDATE)

      const projectId = readText(formData, 'projectId')
      const userId = readText(formData, 'userId')
      if (!projectId || !userId) return { error: 'Opération invalide.' }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('project_members')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId)

      if (error) throw new Error(error.message)

      revalidatePath(`/projets/${projectId}`)

      return { success: 'La personne a été retirée du projet.' }
    },
    ERROR_PATTERNS
  )
}

/* -------------------------------------------------------------------------- */
/*  Tâches — §10 à §16                                                         */
/* -------------------------------------------------------------------------- */

const taskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Le titre de la tâche est obligatoire.')
    .max(200, 'Ce titre est trop long.'),
  description: z.string().trim().max(4000, 'La description est trop longue.').optional(),
  priority: z.enum(PRIORITIES, { message: 'Choisissez une priorité.' }),
  startsOn: dayOrEmpty,
  dueOn: dayOrEmpty,
})

function readTaskForm(formData: FormData) {
  return {
    title: readText(formData, 'title'),
    description: readText(formData, 'description'),
    priority: readText(formData, 'priority') || 'NORMAL',
    startsOn: readText(formData, 'startsOn'),
    dueOn: readText(formData, 'dueOn'),
  }
}

function toTaskRow(input: z.infer<typeof taskSchema>, formData: FormData) {
  return {
    title: input.title,
    description: orNull(input.description),
    priority: input.priority,
    starts_on: orNull(input.startsOn),
    due_on: orNull(input.dueOn),
    // §10 : une tâche peut être indépendante. Aucun projet n'est imposé.
    project_id: orNull(readText(formData, 'projectId')),
    assignee_id: orNull(readText(formData, 'assigneeId')),
  }
}

export async function createTaskAction(
  prevState: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  return guarded(
    'taches:création',
    async () => {
      const actor = await requirePermission(PERMISSIONS.TASKS_CREATE)

      const parsed = taskSchema.safeParse(readTaskForm(formData))
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()

      const { data, error } = await supabase
        .from('project_tasks')
        .insert({
          ...toTaskRow(parsed.data, formData),
          created_by: actor.id,
          updated_by: actor.id,
        })
        .select('id, project_id')
        .single()

      if (error) throw new Error(error.message)

      revalidatePath('/projets/taches')
      if (data.project_id) revalidatePath(`/projets/${data.project_id}`)

      // Le retour se fait là d'où l'on vient : depuis la fiche d'un projet, on y
      // revient ; depuis la liste des tâches, on va à la tâche créée.
      const back = readText(formData, 'retour')
      redirect(back ? `${back}?tache=1` : `/projets/taches/${data.id}?cree=1`)
    },
    ERROR_PATTERNS
  )
}

export async function updateTaskAction(
  prevState: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  return guarded(
    'taches:modification',
    async () => {
      await requirePermission(PERMISSIONS.TASKS_UPDATE)

      const taskId = readText(formData, 'taskId')
      if (!taskId) return { error: 'Tâche introuvable.' }

      const parsed = taskSchema.safeParse(readTaskForm(formData))
      if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) }

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('project_tasks')
        .update(toTaskRow(parsed.data, formData))
        .eq('id', taskId)

      if (error) throw new Error(error.message)

      revalidatePath('/projets/taches')
      revalidatePath(`/projets/taches/${taskId}`)
      redirect(`/projets/taches/${taskId}?enregistre=1`)
    },
    ERROR_PATTERNS
  )
}

/**
 * Changement d'état d'une tâche (§12) — et la frontière du lot.
 *
 * DÉCLARER UNE TÂCHE TERMINÉE N'EST PAS LA MODIFIER.
 *
 * §42 nomme « clôturer une tâche » à côté de « modifier une tâche » : la
 * capacité exigée dépend donc de l'état visé. Le contrôle est fait ici pour
 * pouvoir le DIRE, et refait par le déclencheur `fn_task_write_guard` pour qu'un
 * appel direct rencontre la même barrière (DEC-024, migration 040).
 */
export async function setTaskStatusAction(
  prevState: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  return guarded(
    'taches:état',
    async () => {
      const taskId = readText(formData, 'taskId')
      const status = readText(formData, 'status')

      if (!taskId || !TASK_STATUSES.includes(status as (typeof TASK_STATUSES)[number])) {
        return { error: 'Opération invalide.' }
      }

      await requirePermission(
        status === 'DONE' ? PERMISSIONS.TASKS_CLOSE : PERMISSIONS.TASKS_UPDATE
      )

      const supabase = await createSupabaseServerClient()

      const { error } = await supabase
        .from('project_tasks')
        .update({ status, status_reason: orNull(readText(formData, 'reason')) })
        .eq('id', taskId)

      if (error) throw new Error(error.message)

      revalidatePath('/projets/taches')
      revalidatePath(`/projets/taches/${taskId}`)
      revalidatePath('/projets')

      return { success: 'L’état de la tâche a été mis à jour.' }
    },
    ERROR_PATTERNS
  )
}
