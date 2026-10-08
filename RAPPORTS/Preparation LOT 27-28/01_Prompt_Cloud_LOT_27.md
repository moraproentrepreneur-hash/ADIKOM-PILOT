# Prompt — LOT 27 · Caisses et sessions de caisse · Claude Code Cloud

> Prêt à l'emploi. Préalables remplis le 8 octobre 2026 : décisions du LOT 27 validées et
> intégrées ci-dessous · O-1 appliquée (une branche autre que `main` ne construit plus sur
> Vercel). **Dernière condition** : ce dossier doit être présent sur `main` avant envoi.

---

Tu développes le **LOT 27 — Caisses et sessions de caisse** d'ADIKOM PILOT (dépôt
`moraproentrepreneur-hash/ADIKOM-PILOT`), dans un environnement Cloud **sans accès à Supabase**.

## Ton rôle — développement uniquement

Méthode du projet : **Cloud → GitHub → Local → Supabase → GitHub → Vercel**. Tu es la première
étape. Tu développes, tu écris les migrations, les recettes et les tests, tu exécutes ce qui
peut l'être sans Supabase, tu pousses **ta branche**, tu rédiges un rapport provisoire honnête,
et tu **t'arrêtes**. Un agent local relira, sauvegardera, appliquera les migrations, recettera,
corrigera, fusionnera et livrera.

**Tu ne fais jamais** : fusion ou push sur `main` · application d'une migration · accès ou
manipulation de données de production · déclenchement volontaire d'un déploiement Vercel.

## Décisions rendues — validées par la Direction le 8 octobre 2026

- **B-8** — un utilisateur ne tient **qu'une seule session ouverte**, même s'il existe plusieurs
  caisses ; et une caisse n'a qu'une session ouverte. Les deux garanties sont **en base**
  (index uniques partiels), pas seulement à l'écran.
- **B-9** — **aucun seuil d'écart**, **aucune écriture d'ajustement** : la clôture constate
  l'écart, l'affiche et l'audite ; elle ne bloque pas et ne mouvemente pas la trésorerie.
- **B-13** — un caissier voit **les montants de ses propres sessions**, jamais ceux d'un autre
  sans `pos.sessions.amounts.view`.
- **C-27** — les **9 capacités** du Plan 02 §10.2, telles quelles : catalogue **229 → 238**.
- **T-1** — les montants de session (fond de caisse, montant compté) vivent dans une **table
  sœur 1:1**, lecture gardée par `pos.sessions.amounts.view` **ou** caissier de la ligne :
  `backup_scope` **62 → 65**.

Toute question non tranchée ci-dessus : **tu ne l'inventes pas**, tu la signales et tu choisis
l'option la plus restrictive, nommée comme telle dans le rapport.

## À lire d'abord

1. `CLAUDE.md` (racine) — en entier ; §10, §19 bis, §47 bis surtout.
2. `RAPPORTS/Preparation LOT 27-28/00_Preparation_Cloud_Local_LOT_27_28.md` — §2, §3, §6, §7.
3. Plan 02 : §7.5, §8, §9.1, §9.4, §10.2–10.3, §11.4, §12, §13, §18.2 (LOT 27).
   Plan 01 : §16.1, §16.9–16.13, §16.14 (écrans des caisses et sessions).
4. Rapport 20 §3 — le motif « née par sa fonction ».
5. `01_Developpement/adikom-pilot/AGENTS.md` — Next.js 16 diffère de tes connaissances : lis
   `node_modules/next/dist/docs/` avant d'écrire du code applicatif.
6. Les migrations récentes comme modèles de forme : `20260923000500_…`, `20260923000700_…`,
   `20260929000300_…`.

## Périmètre

- `00 Documentation/03_Modules/12_Point_de_Vente.md` (partie caisses et sessions) **avant** toute
  migration ; `CLAUDE.md` §10 : module 12 `pos`.
- Migrations, horodatées **après** `20260929000300` : types et tables (`pos_registers`,
  `pos_sessions`, table sœur des montants), contraintes, index (une session ouverte par caisse,
  une session ouverte par utilisateur, GiST sur la période), RLS, déclencheurs (compte `CASH` actif, garde « née par sa fonction »
  en dernier), audit `pos` ; fonctions d'ouverture et de clôture ; montant théorique et écart
  **dérivés** (D1) ; capacités (**229 → 238**) et numérotation CAI / SES ;
  `backup_scope` avec son assertion.
- TypeScript : `permissions.ts` (parité), navigation et sidebar, écrans `/pdv/caisses` et
  `/pdv/sessions`, export des sessions, sept états UI, responsive.
- Tests Vitest ; **recette SQL écrite** `supabase/tests/pos_sessions.sql` (positifs, négatifs,
  profil minimal, caissier A ≠ caissier B, `view` sans montants, « qui était en caisse
  entre 10h00 et 11h30 », insertion directe refusée, anti-vacuité) ; script npm associé.

**Hors périmètre** : ventes, paiements, reçus, trésorerie, `payment_method`, toute fonction de
facturation, toute correction de dette existante.

## Règles

- Aucune fonction `SECURITY DEFINER`. `require_capability` en tête. `revoke … from public, anon`
  puis `grant … to authenticated, service_role`. `has_permission` en sous-select.
- Ne modifie **aucune** migration existante ni aucun code de capacité existant.
- Aucun secret, aucune `.env*`, aucune donnée réelle : le dépôt est **public**. Si `next build`
  exige les variables publiques, utilise des valeurs **factices** en ligne de commande, jamais
  commitées.
- Tu ne crées ni ne modifies **jamais** `vercel.json`, `vercel.ts` ni aucune configuration de
  déploiement : un tel fichier sur ta branche pourrait réactiver un déploiement Preview.
- Les commandes `npm` s'exécutent dans `01_Developpement/adikom-pilot/`.
- Tu ne lances **ni** `db:push`, **ni** `db:verify:*`, **ni** `verify:*`, **ni** `demo:*`,
  **ni** `backup:*`.

## Livraison

1. Branche **`lot-27-caisses-sessions`** depuis `main` (nomme la branche réelle si la plateforme
   en impose une autre). Jamais de push sur `main`, jamais de fusion.
2. Commits **réguliers**, clairs et atomiques (doc, migrations, application, tests), poussés au
   fil de l'eau sur la branche — un travail non poussé est perdu si la session s'interrompt.
3. `npm ci` · `npm run lint` · `npm run typecheck` · `npm run test` · `npm run build` — verts.
4. Rapport provisoire `RAPPORTS/Rapport 21_LOT_27_Caisses_et_Sessions_PROVISOIRE.md` :
   fichiers, migrations dans l'ordre, capacités, `backup_scope`, **ce qui n'a pas pu être
   exécuté**, risques, questions ouvertes, liste exacte des recettes que le local doit lancer.
5. Brouillon de **DEC-054** dans le journal, marqué **« provisoire — à valider en local »**.
6. Push de la branche, puis arrêt.

Termine par : **« LOT 27 CLOUD — BRANCHE `<nom>` POUSSÉE À `<sha>`. EN ATTENTE DE VALIDATION LOCALE. »**
