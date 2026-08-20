import { SearchX } from 'lucide-react'

import { ButtonLink, Card, EmptyState } from '@/components/ui/primitives'

/**
 * Page introuvable à l'intérieur du SaaS (CLAUDE.md §38).
 *
 * Le message ne distingue pas « n'existe pas » de « inaccessible » : cette
 * indication renseignerait un utilisateur non autorisé sur l'existence d'une
 * donnée qu'il n'a pas le droit de consulter.
 */
export default function AppNotFound() {
  return (
    <Card>
      <EmptyState
        icon={SearchX}
        title="Élément introuvable"
        description="La page demandée n’existe pas ou n’est pas accessible avec vos droits actuels."
        action={
          <ButtonLink href="/tableau-de-bord" tone="secondary">
            Retour au tableau de bord
          </ButtonLink>
        }
      />
    </Card>
  )
}
