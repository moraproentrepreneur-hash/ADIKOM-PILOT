import type { Metadata } from 'next'
import { Inter, Montserrat } from 'next/font/google'

import './globals.css'

/* Typographies de la charte ADIKOM (Design System §14) :
   titres en Montserrat, texte courant en Inter. */
const montserrat = Montserrat({
  variable: '--font-montserrat',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
})

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'ADIKOM PILOT',
    template: '%s · ADIKOM PILOT',
  },
  description:
    "Système interne de gestion et de pilotage d'ADIKOM TECHNOLOGIE & TRAVEL.",
  icons: { icon: '/brand/adikom-logo.png' },
  // Application interne : jamais indexée par les moteurs de recherche.
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="fr" className={`${montserrat.variable} ${inter.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  )
}
