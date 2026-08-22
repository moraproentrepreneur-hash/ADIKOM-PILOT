import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Le moteur documentaire lit ses polices et son logo depuis le système de
   * fichiers, au moment de produire un PDF. Ces fichiers ne sont importés par
   * aucun module : l'analyse de dépendances de Next ne peut donc pas les
   * découvrir, et la fonction serverless partirait sans eux — le PDF sortirait
   * en Helvetica, sans logo.
   *
   * Ils sont donc déclarés explicitement pour être embarqués avec la route.
   */
  outputFileTracingIncludes: {
    "/api/documents/**": [
      "./src/lib/documents/fonts/*.ttf",
      "./src/lib/documents/assets/*.png",
    ],
  },
};

export default nextConfig;
