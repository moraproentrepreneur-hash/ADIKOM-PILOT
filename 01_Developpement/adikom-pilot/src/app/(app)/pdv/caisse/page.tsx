import type { Metadata } from 'next'
import { LockOpen } from 'lucide-react'

import { ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Denied } from '@/components/ui/figure'
import { can, requirePermissionOrRedirect } from '@/lib/auth/dal'
import { PERMISSIONS } from '@/lib/auth/permissions'
import { listClientOptions } from '@/features/clients/data'
import { getMyOpenSession } from '@/features/pos/data'
import { OpenSessionBanner } from '@/features/pos/open-session-banner'
import { CashRegister } from '@/features/pos-sales/cash-register'
import { listCounterAccounts, listSellableItems } from '@/features/pos-sales/data'

export const metadata: Metadata = { title: 'Caisse' }

/**
 * La caisse — LOT 28, Module 12 §22.1.
 *
 * 🟥 UNE VENTE EXIGE UNE SESSION OUVERTE — LA SIENNE. Sans session, l'écran ne
 * dit pas seulement « non » : il mène à l'ouverture (Plan 01 §16.15, état
 * « aucune session ouverte »). La base refuse de toute façon une vente sans
 * session, ou sur la session d'un autre.
 *
 * Les lectures dont l'encaissement a besoin pour décider — la session, la
 * caisse, les comptes, le catalogue — sont EXIGÉES par la base : sans l'une
 * d'elles, l'écran nomme celles qui manquent plutôt que de laisser échouer la
 * validation.
 */
export default async function CashRegisterPage() {
  const user = await requirePermissionOrRedirect(PERMISSIONS.POS_SALES_CREATE)

  const [
    canViewSales,
    canViewSessions,
    canViewRegisters,
    canViewAccounts,
    canViewServices,
    canViewClients,
    canDiscount,
    canCredit,
    canOpen,
    billing,
  ] = await Promise.all([
    can(PERMISSIONS.POS_SALES_VIEW),
    can(PERMISSIONS.POS_SESSIONS_VIEW),
    can(PERMISSIONS.POS_REGISTERS_VIEW),
    can(PERMISSIONS.ACCOUNTS_VIEW),
    can(PERMISSIONS.SERVICES_VIEW),
    can(PERMISSIONS.CLIENTS_VIEW),
    can(PERMISSIONS.POS_SALES_DISCOUNT),
    can(PERMISSIONS.POS_SALES_CREDIT),
    can(PERMISSIONS.POS_SESSIONS_OPEN),
    Promise.all([
      can(PERMISSIONS.CUSTOMER_INVOICES_CREATE),
      can(PERMISSIONS.CUSTOMER_INVOICES_VIEW),
      can(PERMISSIONS.CUSTOMER_INVOICES_ISSUE),
      can(PERMISSIONS.CUSTOMER_PAYMENTS_CREATE),
      can(PERMISSIONS.CUSTOMER_PAYMENTS_VIEW),
    ]),
  ])

  const missing = [
    ...(canViewSales ? [] : [PERMISSIONS.POS_SALES_VIEW]),
    ...(canViewSessions ? [] : [PERMISSIONS.POS_SESSIONS_VIEW]),
    ...(canViewRegisters ? [] : [PERMISSIONS.POS_REGISTERS_VIEW]),
    ...(canViewAccounts ? [] : [PERMISSIONS.ACCOUNTS_VIEW]),
    ...(canViewServices ? [] : [PERMISSIONS.SERVICES_VIEW]),
  ]

  const header = (
    <PageHeader
      title="Caisse"
      description="Encaisser une vente de services. La trésorerie enregistre l’encaissé, jamais le montant donné."
    />
  )

  if (missing.length > 0) {
    return (
      <>
        {header}
        <Card title="Encaissement impossible avec vos droits actuels">
          <p className="mb-3 text-sm text-muted">
            Encaisser suppose de consulter la vente, la session et la caisse, de vérifier les comptes
            mouvementés et de lire le catalogue : la base l’exige pour décider.
          </p>
          <Denied missing={missing} />
        </Card>
      </>
    )
  }

  const session = await getMyOpenSession(user.id)

  if (!session) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon={LockOpen}
            title="Aucune session de caisse ouverte"
            description="Une vente s’encaisse sous VOTRE session ouverte. Ouvrez une session — sa caisse, son fond — puis revenez à la caisse."
            action={
              canOpen ? (
                <ButtonLink href="/pdv/sessions" icon={LockOpen}>
                  Ouvrir une session
                </ButtonLink>
              ) : (
                <Denied missing={[PERMISSIONS.POS_SESSIONS_OPEN]} />
              )
            }
          />
        </Card>
      </>
    )
  }

  const [items, accounts, clients] = await Promise.all([
    listSellableItems(),
    listCounterAccounts(),
    canViewClients ? listClientOptions() : Promise.resolve(null),
  ])

  return (
    <>
      <OpenSessionBanner />
      {header}
      <CashRegister
        session={{ id: session.id, sessionNo: session.sessionNo, registerLabel: session.registerLabel }}
        items={items}
        accounts={accounts}
        clients={clients}
        canDiscount={canDiscount || user.isSuperAdmin}
        canCredit={canCredit || user.isSuperAdmin}
        canInvoice={billing.every(Boolean) || user.isSuperAdmin}
      />
    </>
  )
}
