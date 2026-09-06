import Image from 'next/image'

import { cn } from '@/lib/utils'

/**
 * Logo officiel ADIKOM.
 *
 * RÈGLE ABSOLUE (Design System §82, CLAUDE.md §33) :
 * le logo officiel ne doit JAMAIS être recréé, redessiné, recoloré, déformé,
 * étiré, pivoté, ni généré. Seul le fichier fourni est utilisé.
 *
 * Ce composant est le SEUL point d'entrée du logo dans l'application. Il
 * garantit par construction :
 *   · un rendu strictement carré — le ratio d'origine est préservé (§4) ;
 *   · un espace de respiration autour du logo (§5) ;
 *   · un fond clair derrière le logo (§7, §58, §76).
 *
 * Pourquoi le fond clair est obligatoire, et pas seulement recommandé :
 * les fichiers officiels sont OPAQUES — le PNG est en RVB sans canal alpha et
 * le SVG encapsule une image matricielle. Le logo transporte donc son propre
 * fond blanc. Le cadre ci-dessous transforme cette contrainte en élément de
 * design assumé, au lieu d'un carré blanc accidentel sur fond bleu.
 *
 * Choix du format : le WebP officiel (11 Ko) est retenu pour l'interface. Le
 * SVG fourni n'est pas un vrai vectoriel — il pèse 90 Ko et exigerait
 * d'assouplir la politique de sécurité des images. Le Design System §74 prévoit
 * explicitement le WebP « pour la performance et le web ».
 */

type AdikomLogoProps = {
  /** Côté du logo en pixels. Le rendu reste toujours carré. */
  size?: number
  /** Classes de positionnement uniquement — aucune transformation visuelle. */
  className?: string
  /** Cadre blanc avec espace de respiration. Obligatoire sur fond coloré. */
  framed?: boolean
  /** Chargement prioritaire (écran de connexion, en-tête). */
  priority?: boolean
}

export function AdikomLogo({
  size = 40,
  className,
  framed = true,
  priority = false,
}: AdikomLogoProps) {
  const image = (
    <Image
      src="/brand/adikom-logo.webp"
      alt="ADIKOM TECHNOLOGIE &amp; TRAVEL"
      width={size}
      height={size}
      priority={priority}
      // Dimensions explicites et identiques : aucune déformation possible.
      style={{ width: size, height: size }}
      className="block select-none"
    />
  )

  /*
   * `shrink-0` N'EST PAS UN DÉTAIL DE MISE EN PAGE : C'EST LA RÈGLE ABSOLUE.
   *
   * Placé dans une rangée flexible étroite — l'en-tête de la page publique à
   * 360 px —, le conteneur du logo se laissait comprimer : la recette
   * responsive l'a mesuré à 37 × 40 au lieu de 40 × 40. Le logo était donc
   * ÉCRASÉ, ce que CLAUDE.md §33 interdit sans exception.
   *
   * Le conteneur s'adapte au logo, jamais l'inverse (§34).
   */
  if (!framed) {
    return <span className={cn('inline-flex shrink-0', className)}>{image}</span>
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-white',
        'shadow-[0_1px_3px_rgba(31,41,55,0.12)]',
        className
      )}
      // Espace de respiration proportionnel à la taille du logo (§5).
      style={{ padding: Math.max(4, Math.round(size * 0.1)) }}
    >
      {image}
    </span>
  )
}
