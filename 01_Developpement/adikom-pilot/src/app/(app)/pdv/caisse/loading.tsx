import { Card, Skeleton } from '@/components/ui/primitives'

/** État de chargement de la caisse (CLAUDE.md §38) : la forme de l'écran, jamais une page figée. */
export default function Loading() {
  return (
    <div role="status" aria-label="Chargement de la caisse…">
      <Skeleton className="mb-2 h-7 w-40" />
      <Skeleton className="mb-6 h-4 w-96 max-w-full" />
      <div className="grid gap-5 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        <Card>
          <Skeleton className="mb-3 h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </Card>
        <Card>
          <Skeleton className="mb-3 h-6 w-24" />
          <Skeleton className="h-40 w-full" />
        </Card>
      </div>
    </div>
  )
}
