import { Card, Skeleton, TableSkeleton } from '@/components/ui/primitives'

/**
 * État de chargement des ventes au comptoir (CLAUDE.md §38) : un squelette à la
 * forme de l'écran, plutôt qu'une page blanche ou figée.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Chargement…">
      <Skeleton className="mb-2 h-7 w-56" />
      <Skeleton className="mb-6 h-4 w-80 max-w-full" />
      <Card className="mb-5">
        <Skeleton className="h-10 w-full" />
      </Card>
      <Card>
        <TableSkeleton rows={6} columns={5} />
      </Card>
    </div>
  )
}
