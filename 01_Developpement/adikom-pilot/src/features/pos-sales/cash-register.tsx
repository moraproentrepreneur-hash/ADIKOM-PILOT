'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Keyboard, Minus, Plus, Search, Trash2, Wallet, X } from 'lucide-react'

import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Notice } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'
import { formatAmount, parseAmount } from '@/lib/money'
import { recordSaleAction } from './actions'
import {
  COUNTER_METHODS,
  COUNTER_METHOD_LABELS,
  SHORTCUTS,
  hasDiscount,
  needsAccount,
  previewSale,
  searchSellable,
  type CartLine,
  type CartPayment,
  type CounterMethod,
  type SellableItem,
} from './constants'

type Option = { id: string; label: string; description?: string }

/**
 * L'écran de caisse — Module 12 §22.1, Plan 02 §7.5, Plan 01 §16.15.
 *
 * DESKTOP D'ABORD, CLAVIER/SOURIS, JAMAIS TACTILE : `Ctrl+K` recherche, `↑ ↓`
 * choisissent, `Entrée` ajoute, `F2` valide, `Échap` annule la saisie en cours.
 * Les raccourcis sont ANNONCÉS à l'écran. Liste dense, aucune vignette.
 *
 * LE TOTAL EST TOUJOURS VISIBLE. Sous 900 px, le panier passe SOUS la saisie et
 * le total devient une barre collante : on réorganise, on ne rétrécit pas
 * (CLAUDE.md §35).
 *
 * 🟥 La monnaie se recalcule à la frappe, mais la VÉRITÉ est calculée par la
 * base à la validation : l'écran n'envoie que des quantités, des remises, des
 * modes et des montants DONNÉS.
 */
export function CashRegister({
  session,
  items,
  accounts,
  clients,
  canDiscount,
  canCredit,
  canInvoice,
}: {
  session: { id: string; sessionNo: string; registerLabel: string }
  items: SellableItem[]
  accounts: Option[]
  /** `null` : la liste des clients n'est pas lisible avec vos droits. */
  clients: Option[] | null
  canDiscount: boolean
  canCredit: boolean
  /** Une vente non soldée produit sa facture : les capacités de facturation sont exigées. */
  canInvoice: boolean
}) {
  const router = useRouter()
  const searchRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [cart, setCart] = useState<CartLine[]>([])
  const [globalDiscount, setGlobalDiscount] = useState('')
  const [clientId, setClientId] = useState('')
  const [observation, setObservation] = useState('')
  const [credit, setCredit] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const [payments, setPayments] = useState<
    { method: CounterMethod; tendered: string; accountId: string; externalRef: string }[]
  >([{ method: 'CASH', tendered: '', accountId: '', externalRef: '' }])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const results = useMemo(() => searchSellable(items, query).slice(0, 30), [items, query])

  const cartPayments: CartPayment[] = payments.map((payment) => ({
    method: payment.method,
    tendered: parseAmount(payment.tendered) ?? 0,
    accountId: payment.accountId || null,
    externalRef: payment.externalRef,
  }))
  const discountValue = parseAmount(globalDiscount) ?? 0
  const preview = previewSale(cart, discountValue, cartPayments)
  const discounted = hasDiscount(cart, discountValue)

  const blocking = [
    ...preview.problems,
    ...(discounted && !canDiscount ? ['Accorder une remise relève d’une capacité que vous n’avez pas.'] : []),
    ...(preview.remaining > 0 && !credit
      ? [`Il manque ${formatAmount(preview.remaining, { withCurrency: true })} pour solder la vente.`]
      : []),
    ...(preview.remaining > 0 && credit && !clientId
      ? ['Une vente non soldée exige un client enregistré.']
      : []),
  ]
  const canSubmit = !pending && cart.length > 0 && blocking.length === 0

  /* --- Le panier ------------------------------------------------------------ */

  const addItem = useCallback((item: SellableItem) => {
    setError(null)
    setCart((lines) => {
      const existing = lines.find((line) => line.variantId === item.variantId)
      if (existing) {
        return lines.map((line) =>
          line.variantId === item.variantId ? { ...line, quantity: line.quantity + 1 } : line
        )
      }
      return [
        ...lines,
        {
          variantId: item.variantId,
          label: `${item.serviceLabel} — ${item.variantLabel}`,
          unitPrice: item.price,
          quantity: 1,
          discount: 0,
        },
      ]
    })
  }, [])

  function setQuantity(variantId: string, quantity: number) {
    setCart((lines) =>
      quantity <= 0
        ? lines.filter((line) => line.variantId !== variantId)
        : lines.map((line) => (line.variantId === variantId ? { ...line, quantity } : line))
    )
  }

  function setLineDiscount(variantId: string, value: string) {
    const amount = parseAmount(value) ?? 0
    setCart((lines) => lines.map((line) => (line.variantId === variantId ? { ...line, discount: amount } : line)))
  }

  function updatePayment(index: number, patch: Partial<(typeof payments)[number]>) {
    setPayments((list) => list.map((payment, i) => (i === index ? { ...payment, ...patch } : payment)))
  }

  /* --- La validation -------------------------------------------------------- */

  const submit = useCallback(() => {
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      const result = await recordSaleAction({
        sessionId: session.id,
        clientId: clientId || null,
        globalDiscount: discountValue,
        observation,
        credit: credit && preview.remaining > 0,
        dueDate: credit && preview.remaining > 0 && dueDate ? dueDate : null,
        lines: cart.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          discount: line.discount,
        })),
        payments: cartPayments
          .filter((payment) => payment.tendered > 0)
          .map((payment) => ({
            method: payment.method,
            tendered: payment.tendered,
            accountId: needsAccount(payment.method) ? payment.accountId : null,
            externalRef: payment.externalRef.trim(),
          })),
      })
      if (result.error) {
        setError(result.error)
        return
      }
      router.push(`/pdv/ventes/${result.saleId}?encaissee=1`)
    })
  }, [canSubmit, session.id, clientId, discountValue, observation, credit, preview.remaining, dueDate, cart, cartPayments, router])

  /* --- Le clavier ----------------------------------------------------------- */

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      if (event.key === 'F2') {
        event.preventDefault()
        submit()
        return
      }
      if (event.key === 'Escape') {
        if (query) {
          setQuery('')
          setActive(0)
        } else {
          ;(document.activeElement as HTMLElement | null)?.blur()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [submit, query])

  function onSearchKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, Math.max(results.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = results[active]
      if (item) addItem(item)
    }
  }

  const noAccounts = accounts.length === 0

  /* --- Rendu ------------------------------------------------------------------ */

  return (
    <div className="pb-24 min-[900px]:pb-0">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Raccourcis clavier">
        <Keyboard className="size-4" aria-hidden />
        {SHORTCUTS.map((shortcut) => (
          <span key={shortcut.keys}>
            <kbd className="rounded border border-line bg-white px-1.5 py-0.5 font-mono text-[11px] text-ink">
              {shortcut.keys}
            </kbd>{' '}
            {shortcut.action}
          </span>
        ))}
      </div>

      <div className="grid gap-5 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        {/* ---------------------------------------------------- Saisie */}
        <div className="space-y-5">
          <section className="rounded-card border border-line bg-white p-4" aria-labelledby="pdv-recherche">
            <h2 id="pdv-recherche" className="mb-3 font-display text-sm font-semibold text-ink">
              Rechercher un service
            </h2>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              {/* Champ natif : il porte la référence que `Ctrl+K` focalise. */}
              <input
                ref={searchRef}
                id="recherche"
                name="recherche"
                autoFocus
                autoComplete="off"
                placeholder="Transfert, excursion, guide…  (Ctrl+K)"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActive(0)
                }}
                onKeyDown={onSearchKey}
                className="w-full rounded-control border border-line bg-white py-2.5 pl-9 pr-3.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-adikom-500"
                role="combobox"
                aria-expanded="true"
                aria-controls="pdv-resultats"
                aria-activedescendant={results[active] ? `pdv-item-${results[active].variantId}` : undefined}
                aria-label="Rechercher un service"
              />
            </div>

            {items.length === 0 ? (
              <Notice tone="warning" className="mt-3">
                Aucun service n’est vendable aujourd’hui : un service de vente actif, une variante active
                et un prix en vigueur sont nécessaires (catalogue).
              </Notice>
            ) : results.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Aucun service ne correspond à « {query} ».</p>
            ) : (
              <ul id="pdv-resultats" role="listbox" className="mt-3 max-h-80 divide-y divide-line overflow-y-auto rounded-control border border-line">
                {results.map((item, index) => (
                  <li
                    key={item.variantId}
                    id={`pdv-item-${item.variantId}`}
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => addItem(item)}
                    className={cn(
                      'flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm',
                      index === active ? 'bg-adikom-50' : 'hover:bg-adikom-50/60'
                    )}
                  >
                    <span className="min-w-0">
                      <span className="font-medium text-ink">{item.serviceLabel}</span>
                      <span className="text-muted"> · {item.variantLabel}</span>
                      {item.unitLabel && <span className="text-xs text-muted"> / {item.unitLabel}</span>}
                    </span>
                    <span className="shrink-0 tabular text-ink">{formatAmount(item.price, { withCurrency: true })}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---------------------------------------------------- Paiement */}
          <section className="rounded-card border border-line bg-white p-4" aria-labelledby="pdv-paiement">
            <h2 id="pdv-paiement" className="mb-3 font-display text-sm font-semibold text-ink">
              Paiement
            </h2>

            <div className="space-y-3">
              {payments.map((payment, index) => (
                <div key={index} className="grid gap-3 rounded-control border border-line p-3 sm:grid-cols-[150px_minmax(0,1fr)]">
                  <Field label="Mode" name={`mode-${index}`}>
                    <Select
                      name={`mode-${index}`}
                      value={payment.method}
                      onChange={(event) =>
                        updatePayment(index, { method: event.target.value as CounterMethod, accountId: '' })
                      }
                    >
                      {COUNTER_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {COUNTER_METHOD_LABELS[method]}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Montant donné (KMF)" name={`donne-${index}`}>
                    <Input
                      name={`donne-${index}`}
                      inputMode="numeric"
                      value={payment.tendered}
                      onChange={(event) => updatePayment(index, { tendered: event.target.value })}
                      placeholder={preview.net > 0 ? String(preview.net) : '0'}
                    />
                  </Field>

                  {needsAccount(payment.method) && (
                    <>
                      <Field
                        label="Compte"
                        name={`compte-${index}`}
                        hint="Le paiement entre sur ce compte, jamais dans la caisse."
                      >
                        {noAccounts ? (
                          <p className="text-sm text-danger">Aucun compte bancaire actif n’est déclaré.</p>
                        ) : (
                          <Select
                            name={`compte-${index}`}
                            value={payment.accountId}
                            onChange={(event) => updatePayment(index, { accountId: event.target.value })}
                          >
                            <option value="">Choisir le compte…</option>
                            {accounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.label}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                      <Field label="Référence" name={`ref-${index}`} hint="N° de chèque, référence Mvola…">
                        <Input
                          name={`ref-${index}`}
                          value={payment.externalRef}
                          onChange={(event) => updatePayment(index, { externalRef: event.target.value })}
                        />
                      </Field>
                    </>
                  )}

                  {payments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPayments((list) => list.filter((_, i) => i !== index))}
                      className="inline-flex items-center gap-1.5 justify-self-start text-xs text-muted hover:text-danger"
                    >
                      <X className="size-3.5" aria-hidden />
                      Retirer ce paiement
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setPayments((list) => [...list, { method: 'MVOLA', tendered: '', accountId: '', externalRef: '' }])
                }
                className="inline-flex items-center gap-1.5 text-sm font-medium text-adikom-500 hover:underline"
              >
                <Plus className="size-4" aria-hidden />
                Ajouter un paiement (paiement mixte)
              </button>
            </div>
          </section>

          {/* ---------------------------------------------------- Client */}
          <section className="rounded-card border border-line bg-white p-4" aria-labelledby="pdv-client">
            <h2 id="pdv-client" className="mb-3 font-display text-sm font-semibold text-ink">
              Client et observation
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Client"
                name="client"
                hint="Facultatif — obligatoire pour une vente non soldée ou une facture."
              >
                {clients === null ? (
                  <p className="text-sm text-muted">La liste des clients n’est pas lisible avec vos droits : vente sans client.</p>
                ) : (
                  <Select name="client" value={clientId} onChange={(event) => setClientId(event.target.value)}>
                    <option value="">Sans client</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Observation" name="observation" hint="Facultative.">
                <Textarea
                  name="observation"
                  value={observation}
                  onChange={(event) => setObservation(event.target.value)}
                  className="min-h-11"
                />
              </Field>
            </div>
          </section>
        </div>

        {/* ---------------------------------------------------- Panier */}
        <aside className="space-y-4 min-[900px]:sticky min-[900px]:top-4 min-[900px]:self-start" aria-labelledby="pdv-panier">
          <section className="rounded-card border border-line bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="pdv-panier" className="font-display text-sm font-semibold text-ink">
                Panier
              </h2>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="inline-flex items-center gap-1 text-xs text-muted hover:text-danger"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Vider
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                Le panier est vide. Recherchez un service et appuyez sur <kbd className="font-mono">Entrée</kbd>.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {cart.map((line) => (
                  <li key={line.variantId} className="space-y-2 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-ink">{line.label}</span>
                      <span className="shrink-0 tabular text-sm text-ink">
                        {formatAmount(line.quantity * line.unitPrice - line.discount)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <button
                        type="button"
                        aria-label={`Retirer une unité de ${line.label}`}
                        onClick={() => setQuantity(line.variantId, line.quantity - 1)}
                        className="rounded border border-line p-1 hover:bg-adikom-50"
                      >
                        <Minus className="size-3" aria-hidden />
                      </button>
                      <span className="tabular text-ink">{line.quantity}</span>
                      <button
                        type="button"
                        aria-label={`Ajouter une unité de ${line.label}`}
                        onClick={() => setQuantity(line.variantId, line.quantity + 1)}
                        className="rounded border border-line p-1 hover:bg-adikom-50"
                      >
                        <Plus className="size-3" aria-hidden />
                      </button>
                      <span>× {formatAmount(line.unitPrice)}</span>
                      {canDiscount && (
                        <label className="ml-auto inline-flex items-center gap-1.5">
                          Remise
                          <input
                            inputMode="numeric"
                            aria-label={`Remise sur ${line.label}, en KMF`}
                            defaultValue={line.discount ? String(line.discount) : ''}
                            onChange={(event) => setLineDiscount(line.variantId, event.target.value)}
                            className="w-24 rounded-control border border-line px-2 py-1 text-right tabular text-ink"
                          />
                        </label>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {canDiscount && cart.length > 0 && (
              <label className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3 text-sm text-ink">
                Remise globale (KMF)
                <input
                  inputMode="numeric"
                  value={globalDiscount}
                  onChange={(event) => setGlobalDiscount(event.target.value)}
                  className="w-28 rounded-control border border-line px-2 py-1.5 text-right tabular"
                />
              </label>
            )}
          </section>

          <section className="rounded-card border border-line bg-white p-4 text-sm" aria-live="polite">
            <dl className="space-y-1.5">
              {preview.lineDiscounts + discountValue > 0 && (
                <div className="flex justify-between text-muted">
                  <dt>Remises</dt>
                  <dd className="tabular">− {formatAmount(preview.lineDiscounts + discountValue)}</dd>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold text-ink">
                <dt>Total à payer</dt>
                <dd className="tabular">{formatAmount(preview.net, { withCurrency: true })}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Montant encaissé</dt>
                <dd className="tabular">{formatAmount(preview.paid, { withCurrency: true })}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Monnaie à rendre</dt>
                <dd className="tabular font-medium text-ink">{formatAmount(preview.change, { withCurrency: true })}</dd>
              </div>
              {preview.remaining > 0 && (
                <div className="flex justify-between text-warning">
                  <dt>Reste dû</dt>
                  <dd className="tabular">{formatAmount(preview.remaining, { withCurrency: true })}</dd>
                </div>
              )}
            </dl>

            {preview.remaining > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                {canCredit && canInvoice ? (
                  <div className="space-y-2">
                    <label className="flex items-start gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={credit}
                        onChange={(event) => setCredit(event.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        Valider une vente <strong>non soldée</strong> : une facture client est émise, et le reste dû y est suivi.
                      </span>
                    </label>
                    {credit && (
                      <Field label="Échéance de la facture" name="echeance" hint="Facultative.">
                        <Input name="echeance" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                      </Field>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted">
                    Une vente non soldée exige la capacité de vente à crédit et celles de la facturation client.
                    Complétez le paiement pour solder la vente.
                  </p>
                )}
              </div>
            )}

            {cart.length > 0 && blocking.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-danger">
                {blocking.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}

            {error && (
              <Notice tone="error" className="mt-3">
                {error}
              </Notice>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="mt-4 hidden w-full items-center justify-center gap-2 rounded-control bg-adikom-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-adikom-600 disabled:cursor-not-allowed disabled:opacity-50 min-[900px]:inline-flex"
            >
              <CheckCircle2 className="size-4" aria-hidden />
              {pending ? 'Encaissement…' : 'Valider la vente — F2'}
            </button>
          </section>

          <p className="text-xs text-muted">
            <Wallet className="mr-1 inline size-3.5" aria-hidden />
            Session {session.sessionNo} · {session.registerLabel}. Les espèces entrent dans le compte de
            la caisse ; la trésorerie enregistre l’encaissé, jamais le montant donné.
          </p>
        </aside>
      </div>

      {/* ---------------------------------------------- Barre collante < 900 px */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white px-4 py-3 shadow-lg min-[900px]:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">Total à payer</p>
            <p className="tabular text-lg font-semibold text-ink">{formatAmount(preview.net, { withCurrency: true })}</p>
            {preview.change > 0 && (
              <p className="text-xs text-muted">Monnaie : {formatAmount(preview.change, { withCurrency: true })}</p>
            )}
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-control bg-adikom-500 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="size-4" aria-hidden />
            {pending ? 'Encaissement…' : 'Valider'}
          </button>
        </div>
      </div>
    </div>
  )
}
