'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, Eye, Printer, X } from 'lucide-react'

import { Notice } from '@/components/ui/feedback'
import { BUTTON_BASE, BUTTON_TONES } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

/**
 * Aperçu, téléchargement et impression d'un document.
 *
 * Les trois actions pointent le même document, produit par le serveur : ce qui
 * s'affiche dans l'aperçu est exactement ce qui se télécharge et ce qui
 * s'imprime. Aucun rendu intermédiaire n'existe, donc aucune divergence n'est
 * possible.
 *
 * Les boutons suivent les permissions, mais ne protègent rien : la route refuse
 * d'elle-même un mode non autorisé, y compris appelée directement
 * (05_Regles_Metier/05_Permissions.md §85, DEC-024).
 */
export function DocumentToolbar({
  type,
  id,
  label = 'le document',
  canDownload,
  canPrint,
}: {
  /** Type au pluriel, tel qu'enregistré au registre : `clients`, `vehicules`… */
  type: string
  id: string
  label?: string
  canDownload: boolean
  canPrint: boolean
}) {
  const [open, setOpen] = useState(false)
  const [printOnLoad, setPrintOnLoad] = useState(false)
  const [frameMode, setFrameMode] = useState<'preview' | 'print'>('preview')
  const [failed, setFailed] = useState(false)
  const frameRef = useRef<HTMLIFrameElement>(null)

  const base = `/api/documents/${type}/${id}`

  // Ni aperçu ni impression ni téléchargement : la barre n'a pas lieu d'être.
  if (!canDownload && !canPrint) return null

  function openPreview(thenPrint: boolean) {
    setFailed(false)
    setPrintOnLoad(thenPrint)
    // Le mode « print » est refusé par le serveur sans la permission
    // correspondante : c'est là que la distinction devient réelle.
    setFrameMode(thenPrint && canPrint ? 'print' : 'preview')
    setOpen(true)
  }

  /**
   * L'impression porte sur le document affiché, pas sur la page : le visualiseur
   * PDF du navigateur imprime exactement le fichier reçu.
   */
  function handleFrameLoad() {
    if (!printOnLoad) return
    setPrintOnLoad(false)
    printFrame()
  }

  /** Imprime le document affiché, sans nouvelle requête. */
  function printFrame() {
    try {
      frameRef.current?.contentWindow?.focus()
      frameRef.current?.contentWindow?.print()
    } catch {
      // Certains navigateurs refusent l'impression programmée d'un cadre.
      // L'utilisateur garde le document sous les yeux et peut l'imprimer
      // depuis le visualiseur : mieux vaut le lui dire que d'échouer en
      // silence.
      setFailed(true)
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openPreview(false)}
          className={cn(BUTTON_BASE, BUTTON_TONES.secondary)}
        >
          <Eye className="size-4 shrink-0" aria-hidden />
          Aperçu
        </button>

        {canDownload && (
          <a
            href={`${base}?mode=download`}
            className={cn(BUTTON_BASE, BUTTON_TONES.secondary)}
          >
            <Download className="size-4 shrink-0" aria-hidden />
            Télécharger PDF
          </a>
        )}

        {canPrint && (
          <button
            type="button"
            onClick={() => openPreview(true)}
            className={cn(BUTTON_BASE, BUTTON_TONES.secondary)}
          >
            <Printer className="size-4 shrink-0" aria-hidden />
            Imprimer
          </button>
        )}
      </div>

      {open && (
        <PreviewOverlay
          title={`Aperçu — ${label}`}
          onClose={() => setOpen(false)}
          footer={
            <div className="flex flex-wrap items-center gap-2">
              {canDownload && (
                <a
                  href={`${base}?mode=download`}
                  className={cn(BUTTON_BASE, BUTTON_TONES.primary)}
                >
                  <Download className="size-4 shrink-0" aria-hidden />
                  Télécharger
                </a>
              )}
              {canPrint && (
                <button
                  type="button"
                  onClick={printFrame}
                  className={cn(BUTTON_BASE, BUTTON_TONES.secondary)}
                >
                  <Printer className="size-4 shrink-0" aria-hidden />
                  Imprimer
                </button>
              )}
            </div>
          }
        >
          {failed && (
            <Notice tone="warning" className="mb-3">
              L’impression automatique a été refusée par le navigateur. Utilisez la commande
              d’impression du visualiseur ci-dessous.
            </Notice>
          )}

          <iframe
            ref={frameRef}
            src={`${base}?mode=${frameMode}`}
            title={`Aperçu — ${label}`}
            onLoad={handleFrameLoad}
            className="h-[70vh] w-full rounded-control border border-line bg-canvas"
          />
        </PreviewOverlay>
      )}
    </>
  )
}

function PreviewOverlay({
  title,
  onClose,
  footer,
  children,
}: {
  title: string
  onClose: () => void
  footer: React.ReactNode
  children: React.ReactNode
}) {
  // La touche Échap ferme l'aperçu : un panneau qui couvre l'écran doit pouvoir
  // se refermer sans chercher le bouton.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-card bg-white sm:max-h-[calc(100dvh-2rem)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-display text-sm font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer l’aperçu"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            <X className="size-4 shrink-0" aria-hidden />
          </button>
        </div>

        <div className="overflow-auto px-5 py-4">{children}</div>

        <div className="shrink-0 border-t border-line px-5 py-3">{footer}</div>
      </div>
    </div>
  )
}
