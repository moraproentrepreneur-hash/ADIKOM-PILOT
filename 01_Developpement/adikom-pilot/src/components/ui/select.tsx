'use client'

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Champ déroulant ADIKOM PILOT.
 *
 * POURQUOI CE COMPOSANT EXISTE — ajustement du 08/09/2026 (DEC-042 §f)
 *
 * Un `<select>` natif ne se dessine pas : c'est le SYSTÈME qui décide de sa
 * liste. Sur Android, une pression ouvre une fenêtre modale plein écran, options
 * précédées de pastilles à cocher ; sur iOS, une roue crantée en bas de l'écran.
 * Le même champ, sur ordinateur, ouvre une liste sobre sous le champ.
 *
 * ADIKOM a demandé l'inverse de cette dispersion : « sur téléphone comme sur
 * ordinateur, un champ déroulant reste un champ déroulant ». La liste est donc
 * dessinée par l'application, et elle est la même partout.
 *
 * CE QUI RESTE NATIF, ET POURQUOI C'EST ESSENTIEL
 *
 * Le `<select>` n'est pas remplacé : il est CONSERVÉ dans le document, et il
 * demeure la seule source de vérité de la valeur.
 *
 *   · les formulaires continuent d'envoyer le champ — aucun `input` caché,
 *     aucune resynchronisation à écrire, aucune divergence possible ;
 *   · `onChange` reçoit un vrai événement du `<select>`, `event.target.value`
 *     garde exactement le sens qu'il avait ;
 *   · un champ piloté (`value` + `onChange`) reste piloté par son parent ;
 *   · une valeur posée de l'extérieur — recette automatisée, gestionnaire de
 *     mots de passe, restauration de formulaire — met la liste à jour, puisque
 *     l'affichage LIT le `<select>` et ne le double jamais.
 *
 * Le `<select>` est simplement rendu invisible et hors d'atteinte du pointeur :
 * c'est ce qui empêche la fenêtre du système de s'ouvrir. Ce qu'on touche est le
 * bouton, et le bouton ouvre la liste de l'application.
 *
 * RESPONSIVE — ce que la liste garantit
 *
 *   · elle est rendue en PORTAIL : aucune carte à `overflow-hidden` ne la
 *     rogne, aucun tableau à défilement ne l'emprisonne ;
 *   · elle est positionnée à partir du champ, puis RAMENÉE dans l'écran :
 *     jamais de liste qui déborde à droite ou sous le pli ;
 *   · elle s'ouvre vers le haut lorsque le bas manque de place ;
 *   · le texte d'une option REVIENT À LA LIGNE : aucune valeur tronquée,
 *     aucune option illisible, si long soit son libellé ;
 *   · sa hauteur est bornée et elle défile ; le reste de la page ne défile pas
 *     derrière elle (`overscroll-contain`).
 *
 * CE QUE CE COMPOSANT NE FAIT PAS
 *
 * Il ne gère PAS la sélection multiple, et c'est volontaire : le SaaS n'expose
 * aucun `<select multiple>`. Les vraies listes à choix multiples — départements,
 * groupes d'un utilisateur, dommages d'un incident — sont des cases à cocher
 * (`CheckboxOption`), et elles le restent : ce sont de véritables choix
 * multiples, pas des champs déroulants déguisés.
 */

const CONTROL =
  'flex w-full items-center justify-between gap-2 rounded-control border border-line bg-white px-3.5 py-2.5 text-left text-sm text-ink outline-none transition-colors hover:border-adikom-300 focus-visible:border-adikom-500 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted'

const CONTROL_INVALID = 'border-danger focus-visible:border-danger'

/** Hauteur maximale de la liste : au-delà, on défile plutôt qu'on s'étale. */
const MAX_LIST_HEIGHT = 320

/** Marge conservée entre la liste et les bords de l'écran. */
const VIEWPORT_MARGIN = 8

/** En dessous, mieux vaut ouvrir vers le haut que se coller au bord. */
const MIN_LIST_HEIGHT = 168

type OptionItem = {
  value: string
  label: string
  disabled: boolean
  /** Libellé de l'`<optgroup>` qui la contient, s'il y en a un. */
  group: string | null
}

/** Où est le champ, et de quelle place l'écran dispose autour de lui. */
type Anchor = {
  top: number
  bottom: number
  left: number
  width: number
  viewportWidth: number
  viewportHeight: number
}

function sameAnchor(a: Anchor, b: Anchor): boolean {
  return (
    a.top === b.top &&
    a.bottom === b.bottom &&
    a.left === b.left &&
    a.width === b.width &&
    a.viewportWidth === b.viewportWidth &&
    a.viewportHeight === b.viewportHeight
  )
}

/* -------------------------------------------------------------------------- */
/*  Lire les options telles qu'elles sont écrites                              */
/* -------------------------------------------------------------------------- */

/**
 * Le texte d'un nœud React, aussi profond soit-il.
 *
 * Les options du SaaS s'écrivent `<option>{libellé}</option>`, parfois
 * `<option>{a} · {b}</option>` : le libellé est donc une chaîne, ou un tableau
 * de chaînes. Tout le reste est ignoré plutôt que rendu approximativement.
 */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

function collectOptions(children: ReactNode, group: string | null = null): OptionItem[] {
  const items: OptionItem[] = []

  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue

    if (child.type === 'optgroup') {
      const props = child.props as { label?: string; children?: ReactNode }
      items.push(...collectOptions(props.children, props.label ?? null))
      continue
    }

    if (child.type === 'option') {
      const props = child.props as {
        value?: string | number | readonly string[]
        disabled?: boolean
        children?: ReactNode
      }
      const label = textOf(props.children)
      // `<option>Texte</option>` sans attribut : la valeur EST le texte, comme
      // le veut la spécification HTML.
      const value = props.value === undefined ? label : String(props.value)
      items.push({ value, label: label || value, disabled: props.disabled === true, group })
    }
  }

  return items
}

/* -------------------------------------------------------------------------- */
/*  Le champ                                                                   */
/* -------------------------------------------------------------------------- */

export function Select({
  name,
  error,
  children,
  className,
  placeholder,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  name: string
  error?: string
  /** Ce qu'affiche le champ quand aucune option ne correspond à sa valeur. */
  placeholder?: string
}) {
  const selectRef = useRef<HTMLSelectElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const listId = useId()
  const options = useMemo(() => collectOptions(children), [children])

  /*
   * La valeur AFFICHÉE est lue sur le `<select>` dès qu'il existe ; avant
   * l'hydratation, elle se déduit des mêmes règles que le navigateur applique —
   * `value`, puis `defaultValue`, puis la première option. Les deux rendus
   * coïncident donc, et rien ne clignote.
   */
  const initial =
    props.value !== undefined
      ? String(props.value)
      : props.defaultValue !== undefined
        ? String(props.defaultValue)
        : (options[0]?.value ?? '')

  const [value, setValue] = useState(initial)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  /*
   * Où se trouve le champ, et quelle place l'écran laisse autour de lui.
   *
   * Mesuré APRÈS le rendu, jamais pendant : la position d'un élément n'est
   * connue qu'une fois qu'il est posé. La liste n'apparaît donc qu'à la mesure
   * suivante — c'est aussi ce qui garantit qu'elle ne s'affiche jamais à une
   * position provisoire.
   */
  const [anchor, setAnchor] = useState<Anchor | null>(null)

  // Un champ piloté suit son parent, toujours.
  const shown = props.value !== undefined ? String(props.value) : value

  const selected = options.find((option) => option.value === shown) ?? null
  const disabled = props.disabled === true || options.length === 0

  /* --- Ouverture, fermeture ---------------------------------------------- */

  const close = useCallback(() => {
    setOpen(false)
    setActiveIndex(-1)
    // La position est oubliée avec la liste : à la réouverture, elle est
    // remesurée avant tout affichage, jamais reprise d'un état périmé.
    setAnchor(null)
  }, [])

  const openList = useCallback(() => {
    if (disabled) return
    const index = options.findIndex((option) => option.value === shown)
    setActiveIndex(index >= 0 ? index : options.findIndex((option) => !option.disabled))
    setOpen(true)
  }, [disabled, options, shown])

  /**
   * Retenir une option — en la posant sur le `<select>`, jamais à côté.
   *
   * La valeur passe par le mutateur natif de `HTMLSelectElement` : React suit
   * les valeurs des champs par un « tracker » interne, et une affectation
   * ordinaire le laisserait croire que rien n'a changé — l'événement serait
   * alors ignoré, et un champ piloté ne se mettrait jamais à jour.
   */
  const choose = useCallback((next: string) => {
    const element = selectRef.current
    if (!element) return

    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value'
    )?.set
    if (setter) setter.call(element, next)
    else element.value = next

    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }, [])

  /* --- Fermer sur clic extérieur, sur Échap, et suivre l'écran ------------ */

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target)) return
      if (listRef.current?.contains(target)) return
      close()
    }

    /*
     * La liste SUIT le champ : elle ne se fige pas au milieu de l'écran quand
     * la page défile. La mesure est comparée avant d'être posée — sans quoi
     * chaque événement de défilement provoquerait un rendu inutile.
     */
    const measure = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      const next: Anchor = {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }
      setAnchor((current) => (current && sameAnchor(current, next) ? current : next))
    }

    measure()

    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, close])

  /* --- Clavier ------------------------------------------------------------ */

  const typed = useRef({ text: '', at: 0 })

  const moveTo = useCallback(
    (from: number, step: number) => {
      if (options.length === 0) return
      let index = from
      for (let guard = 0; guard < options.length; guard += 1) {
        index = (index + step + options.length) % options.length
        if (!options[index].disabled) {
          setActiveIndex(index)
          return
        }
      }
    },
    [options]
  )

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return

    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        openList()
      }
      return
    }

    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        close()
        return
      case 'Tab':
        close()
        return
      case 'ArrowDown':
        event.preventDefault()
        moveTo(activeIndex, 1)
        return
      case 'ArrowUp':
        event.preventDefault()
        moveTo(activeIndex, -1)
        return
      case 'Home':
        event.preventDefault()
        moveTo(-1, 1)
        return
      case 'End':
        event.preventDefault()
        moveTo(0, -1)
        return
      case 'Enter':
      case ' ': {
        event.preventDefault()
        const option = options[activeIndex]
        if (option && !option.disabled) {
          choose(option.value)
          close()
        }
        return
      }
      default:
        break
    }

    // Frappe au clavier : « pe » atteint « Peugeot » sans faire défiler.
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = Date.now()
      typed.current.text = now - typed.current.at > 700 ? event.key : typed.current.text + event.key
      typed.current.at = now

      const needle = typed.current.text.toLowerCase()
      const found = options.findIndex(
        (option) => !option.disabled && option.label.toLowerCase().startsWith(needle)
      )
      if (found >= 0) setActiveIndex(found)
    }
  }

  /* --- Position de la liste ----------------------------------------------- */

  let listStyle: React.CSSProperties | null = null
  if (anchor) {
    const { viewportWidth, viewportHeight } = anchor

    const below = viewportHeight - anchor.bottom - VIEWPORT_MARGIN
    const above = anchor.top - VIEWPORT_MARGIN
    const upward = below < MIN_LIST_HEIGHT && above > below

    const height = Math.max(
      120,
      Math.min(MAX_LIST_HEIGHT, upward ? above : below)
    )

    const width = Math.min(
      Math.max(anchor.width, 200),
      viewportWidth - VIEWPORT_MARGIN * 2
    )

    // Ramenée dans l'écran : une liste plus large que son champ, près du bord
    // droit, sortirait sinon de la page sur un petit téléphone.
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, anchor.left),
      viewportWidth - width - VIEWPORT_MARGIN
    )

    listStyle = {
      position: 'fixed',
      left,
      width,
      maxHeight: height,
      ...(upward
        ? { bottom: viewportHeight - anchor.top + 4 }
        : { top: anchor.bottom + 4 }),
    }
  }

  /* --- Rendu -------------------------------------------------------------- */

  const label = selected?.label ?? placeholder ?? ''

  /*
   * `className` va sur l'ENVELOPPE, et non sur le bouton.
   *
   * Les six appels qui en passent une lui confient une place dans la grille ou
   * la rangée qui l'entoure — `flex-1`, `lg:col-span-2`. C'est l'enveloppe qui
   * est l'enfant de ce parent ; posée sur le bouton, la classe ne trouverait
   * rien à étirer et le champ s'affaisserait à la largeur de son texte.
   */
  return (
    <div className={cn('relative', className)}>
      {/*
        Le vrai contrôle. Invisible, hors d'atteinte du pointeur, retiré de
        l'ordre de tabulation — mais bien présent : c'est lui que le formulaire
        envoie, lui que `#identifiant` désigne, lui que `onChange` rapporte.
      */}
      <select
        {...props}
        ref={selectRef}
        id={name}
        name={name}
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          setValue(event.target.value)
          props.onChange?.(event)
        }}
        // Un clic sur le libellé du champ vise ce `<select>` : sans cela, le
        // navigateur ouvrirait sa propre fenêtre, celle-là même qu'on remplace.
        onFocus={(event) => {
          props.onFocus?.(event)
          if (!open) buttonRef.current?.focus()
        }}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => event.preventDefault()}
        className="pointer-events-none absolute size-px overflow-hidden opacity-0"
      >
        {children}
      </select>

      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        // Le champ que ce déclencheur ouvre, nommé pour les recettes : sans
        // cela, elles devraient le désigner par sa position dans la page, qui
        // change dès qu'un champ est ajouté au-dessus.
        data-select-for={name}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-labelledby={props['aria-label'] ? undefined : `${name}-label`}
        aria-label={props['aria-label']}
        aria-describedby={error ? `${name}-error` : props['aria-describedby']}
        aria-invalid={Boolean(error)}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className={cn(CONTROL, error && CONTROL_INVALID)}
      >
        {/*
          `min-w-0` + retour à la ligne : un libellé long s'affiche en entier
          plutôt que d'être coupé — l'utilisateur doit pouvoir LIRE ce qu'il a
          choisi (DEC-042 §f).
        */}
        <span className={cn('min-w-0 flex-1 break-words', !selected && 'text-muted')}>
          {label || '—'}
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted transition-transform',
            open && 'rotate-180'
          )}
          aria-hidden
        />
      </button>

      {open &&
        listStyle &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            data-select-list={name}
            aria-label={props['aria-label']}
            style={listStyle}
            className="z-[60] overflow-y-auto overscroll-contain rounded-card border border-line bg-white py-1 shadow-lg"
          >
            {options.map((option, index) => {
              const isSelected = option.value === shown
              const isActive = index === activeIndex
              const previous = index > 0 ? options[index - 1] : null
              const startsGroup = option.group !== null && option.group !== previous?.group

              return (
                <div key={`${option.value}-${index}`}>
                  {startsGroup && (
                    <p className="px-3 pt-2 pb-1 text-[0.6875rem] font-semibold tracking-wide text-muted uppercase">
                      {option.group}
                    </p>
                  )}
                  <div
                    id={`${listId}-${index}`}
                    role="option"
                    data-select-option
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    onPointerUp={() => {
                      if (option.disabled) return
                      choose(option.value)
                      close()
                      buttonRef.current?.focus()
                    }}
                    onPointerEnter={() => !option.disabled && setActiveIndex(index)}
                    className={cn(
                      'flex cursor-pointer items-start gap-2 px-3 py-2 text-sm break-words',
                      option.disabled && 'cursor-not-allowed text-muted/60',
                      !option.disabled && isActive && 'bg-adikom-50',
                      isSelected ? 'font-medium text-adikom-500' : 'text-ink'
                    )}
                  >
                    <span className="min-w-0 flex-1">{option.label}</span>
                    {isSelected && <Check className="mt-0.5 size-4 shrink-0" aria-hidden />}
                  </div>
                </div>
              )
            })}
          </div>,
          document.body
        )}
    </div>
  )
}
