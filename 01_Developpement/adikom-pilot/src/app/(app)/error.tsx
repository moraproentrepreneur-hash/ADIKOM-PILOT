'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

import { Button, ButtonLink, Card, EmptyState } from '@/components/ui/primitives'

/**
 * État d'erreur des routes applicatives (CLAUDE.md §38 et §43).
 *
 * Le message reste fonctionnel : ni trace d'exécution, ni détail de base de
 * données, ni information technique exploitable. Le diagnostic reste côté
 * serveur, dans les journaux.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <Card>
      <EmptyState
        icon={AlertTriangle}
        title="Cette page n’a pas pu être affichée"
        description="Une erreur est survenue pendant le chargement des données. Vous pouvez réessayer ; si le problème persiste, signalez-le à l’administrateur."
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button icon={RotateCcw} onClick={reset}>
              Réessayer
            </Button>
            <ButtonLink href="/tableau-de-bord" tone="secondary">
              Retour au tableau de bord
            </ButtonLink>
          </div>
        }
      />
      {error.digest && (
        <p className="pb-6 text-center text-xs text-muted">Référence : {error.digest}</p>
      )}
    </Card>
  )
}
