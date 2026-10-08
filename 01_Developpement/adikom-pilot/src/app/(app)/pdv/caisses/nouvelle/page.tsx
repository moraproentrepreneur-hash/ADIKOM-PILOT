import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Card, PageHeader } from '@/components/ui/primitives'
import { Notice } from '@/components/ui/feedback'
import { Denied } from '@/components/ui/figure'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { listCashAccountOptions } from '@/features/pos/data'
import { RegisterForm } from '@/features/pos/panels'

export const metadata: Metadata = { title: 'Déclarer une caisse' }

/**
 * Déclaration d'une caisse — Module 12 §3.2.
 *
 * La base exige, en plus de `pos.registers.create`, la lecture des caisses et
 * celle des comptes : on n'adosse pas une caisse à un compte qu'on ne peut pas
 * consulter. L'écran le DIT avant la saisie, au lieu de laisser échouer l'envoi.
 */
export default async function NewRegisterPage() {
  await requirePermissionOrRedirect(PERMISSIONS.POS_REGISTERS_CREATE)

  const [canSeeAccounts, canSeeRegisters] = await Promise.all([
    can(PERMISSIONS.ACCOUNTS_VIEW),
    can(PERMISSIONS.POS_REGISTERS_VIEW),
  ])

  const missing = [
    ...(canSeeRegisters ? [] : [PERMISSIONS.POS_REGISTERS_VIEW]),
    ...(canSeeAccounts ? [] : [PERMISSIONS.ACCOUNTS_VIEW]),
  ]

  const accounts = missing.length === 0 ? await listCashAccountOptions() : []

  return (
    <>
      <Link
        href="/pdv/caisses"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-adikom-500"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour aux caisses
      </Link>

      <PageHeader
        title="Déclarer une caisse"
        description="Une caisse s’adosse à un compte de type Caisse, actif. Elle ne porte aucun solde."
      />

      <Card className="max-w-3xl">
        {missing.length > 0 ? (
          <div className="space-y-3">
            <Notice tone="warning">
              Déclarer une caisse suppose aussi de pouvoir la consulter et de consulter le compte
              qui la porte.
            </Notice>
            <Denied missing={missing} />
          </div>
        ) : (
          <RegisterForm accounts={accounts} />
        )}
      </Card>
    </>
  )
}
