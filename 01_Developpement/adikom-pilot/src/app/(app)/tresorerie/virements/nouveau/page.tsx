import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { todayISO } from '@/lib/dates'
import { listOperableAccounts } from '@/features/treasury/data'
import { CreateTransferPanel } from '@/features/treasury/panels'

export const metadata: Metadata = { title: 'Nouveau virement interne' }

/**
 * Saisie d'un virement — Module 06 §29.
 *
 * LA SAISIE NE DÉPLACE RIEN.
 *
 * Le virement naît en brouillon : le contrôle de solde (§30) et les deux
 * écritures (§31) appartiennent à la VALIDATION. Cet écran ne demande donc
 * jamais le droit de consulter les soldes — saisir n'est pas lire la trésorerie
 * (DEC-024).
 */
export default async function NewTransferPage() {
  await requirePermissionOrRedirect(PERMISSIONS.TRANSFERS_CREATE)

  // Module 06 §10 : seuls les comptes actifs reçoivent une nouvelle opération.
  // Sans `treasury.accounts.view`, la liste n'est pas VIDE : elle est illisible,
  // et le formulaire le dit plutôt que d'afficher un choix vide (DEC-017).
  const canSeeAccounts = await can(PERMISSIONS.ACCOUNTS_VIEW)
  const accounts = canSeeAccounts ? await listOperableAccounts() : null

  return (
    <>
      <Link
        href="/tresorerie/virements"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour aux virements
      </Link>

      <PageHeader
        title="Nouveau virement interne"
        description="Un transfert entre deux comptes d’ADIKOM. Ni recette ni dépense."
      />

      <Notice tone="info" className="mb-5">
        Le virement sera enregistré en <strong>brouillon</strong>. C’est sa{' '}
        <strong>validation</strong> qui contrôlera le solde du compte source, puis produira la
        sortie et l’entrée correspondantes — <em>jamais l’une sans l’autre</em>.
      </Notice>

      <Card className="max-w-3xl">
        <CreateTransferPanel
          accounts={
            accounts?.map((account) => ({
              id: account.id,
              label: `${account.label} (${account.accountNo})`,
            })) ?? null
          }
          today={todayISO()}
        />
      </Card>
    </>
  )
}
