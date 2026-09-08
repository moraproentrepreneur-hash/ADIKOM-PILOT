import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { todayISO } from '@/lib/dates'
import { listOperableAccounts } from '@/features/treasury/data'
import { CreateMiscPaymentPanel } from '@/features/misc-payments/panels'

export const metadata: Metadata = { title: 'Nouveau paiement divers' }

/**
 * Saisie d'un paiement divers — Module 07 §43, §44.
 *
 * LA SAISIE NE DÉPLACE AUCUN FONDS.
 *
 * §46 pose trois états, et le catalogue une capacité de validation distincte :
 * saisir et engager l'argent sont deux gestes, qui peuvent relever de deux
 * personnes (DEC-040).
 *
 * ET ELLE NE PRÉSUME PAS DU SENS (DEC-042 §b).
 *
 * Depuis l'ajustement du 08/09/2026, un paiement divers va dans les deux sens.
 * Le titre et le bandeau ne parlent donc plus de « décaissement » ni de « fonds
 * qui sortent » : le formulaire, lui, annonce l'effet exact une fois le sens
 * choisi.
 */
export default async function NewMiscPaymentPage() {
  await requirePermissionOrRedirect(PERMISSIONS.MISC_PAYMENTS_CREATE)

  // Module 06 §10 : seuls les comptes actifs reçoivent une nouvelle opération.
  // Sans `treasury.accounts.view`, la liste n'est pas vide : elle est illisible,
  // et le formulaire le dit (DEC-017).
  const canSeeAccounts = await can(PERMISSIONS.ACCOUNTS_VIEW)
  const accounts = canSeeAccounts ? await listOperableAccounts() : null

  return (
    <>
      <Link
        href="/facturation/paiements-divers"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour aux paiements divers
      </Link>

      <PageHeader
        title="Nouveau paiement divers"
        description="Un encaissement ou un décaissement qui ne se rattache à aucune facture client ou fournisseur."
      />

      <Notice tone="info" className="mb-5">
        Le paiement sera enregistré en <strong>brouillon</strong> : aucun fonds ne bouge tant
        qu’il n’est pas <strong>validé</strong>. Un paiement erroné ne se corrige pas — il
        s’annule, et un paiement correct est saisi.
      </Notice>

      <Card className="max-w-3xl">
        <CreateMiscPaymentPanel
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
