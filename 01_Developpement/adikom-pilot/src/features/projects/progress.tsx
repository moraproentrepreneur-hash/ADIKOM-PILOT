import { Denied, LoadError } from '@/components/ui/figure'
import type { Figure } from '@/lib/pilotage/figure'
import type { TaskCounts } from './data'

/**
 * L'avancement d'un projet — §32, §33.
 *
 * QUATRE RÉPONSES POSSIBLES, ET ELLES NE SE RESSEMBLENT PAS.
 *
 *   60 %             des tâches réelles, comptées en base ;
 *   « Aucune tâche » le projet n'en porte pas encore — ce n'est pas 0 % ;
 *   refus nommé      `projects.tasks.view` manque, et l'écran le DIT ;
 *   échec dit        la lecture a échoué, et l'écran le dit aussi.
 *
 * « 0 % » à la place d'un refus signifierait « rien n'est fait », alors que le
 * système n'a rien compté du tout (DEC-017, DEC-034 §c). C'est exactement le
 * piège que `Figure` existe pour fermer.
 *
 * LES TÂCHES ANNULÉES NE COMPTENT PAS.
 *
 * Ni au numérateur, ni au dénominateur : les compter ferait plafonner
 * l'avancement d'un projet dont plus rien n'est à faire — le « pourcentage
 * trompeur » que le §33 met en garde de produire.
 */
export function Progress({
  figure,
  label = 'Avancement',
}: {
  figure: Figure<TaskCounts | undefined>
  label?: string
}) {
  if (figure.state === 'denied') return <Denied missing={figure.missing} />
  if (figure.state === 'error') return <LoadError what={label} />

  const counts = figure.value

  if (!counts || counts.total === 0) {
    return <p className="text-sm text-muted">Aucune tâche — l’avancement ne se calcule pas.</p>
  }

  const percent = counts.percent ?? 0

  return (
    <div data-avancement={percent} className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-lg font-semibold text-ink tabular">{percent} %</p>
        <p className="text-xs text-muted tabular">
          {counts.done} / {counts.total} tâche{counts.total > 1 ? 's' : ''} terminée
          {counts.done > 1 ? 's' : ''}
          {counts.late > 0 && (
            <span className="text-danger">
              {' · '}
              {counts.late} en retard
            </span>
          )}
        </p>
      </div>

      {/* La barre double le chiffre, elle ne le remplace pas : la valeur reste
          lisible sans percevoir les couleurs (Design System, Module 01 §20). */}
      <div
        className="h-2 w-full overflow-hidden rounded-badge bg-canvas"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={counts.late > 0 ? 'h-full bg-warning' : 'h-full bg-adikom-500'}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
