import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { CreateAccountPanel } from '@/features/treasury/panels'

export const metadata: Metadata = { title: 'Nouveau compte financier' }

/** Ouverture d'un compte bancaire ou d'une caisse — Module 06 §6, §7, §8. */
export default async function NewAccountPage() {
  await requirePermissionOrRedirect(PERMISSIONS.ACCOUNTS_CREATE)

  return (
    <>
      <Link
        href="/tresorerie/comptes"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour aux comptes
      </Link>

      <PageHeader
        title="Ouvrir un compte financier"
        description="Un compte bancaire ou une caisse, que les règlements viendront mouvementer."
      />

      <Card className="max-w-3xl">
        <CreateAccountPanel />
      </Card>
    </>
  )
}
