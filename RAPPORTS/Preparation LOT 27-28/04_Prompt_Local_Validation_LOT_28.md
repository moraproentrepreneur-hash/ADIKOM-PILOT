# Prompt — LOT 28 · Reprise et validation locale

> À coller dans Claude Code **local**, une fois la branche Cloud du LOT 28 poussée **et**
> l'analyse C-2 validée. Remplacer `<branche>`.

---

Méthode du projet : **Cloud → GitHub → Local → Supabase → GitHub → Vercel**. Le Cloud a
développé et poussé sa branche ; **toi seul** sauvegardes, appliques les migrations, recettes,
corriges, fusionnes sur `main`, pousses et vérifies Vercel.

Tu reprends le **LOT 28 — Point de vente** livré par Claude Code Cloud sur `<branche>`. Aucune
ligne n'a été exécutée contre une base. Ce lot touche **trésorerie, paiements, facturation
commune, numérotation, capacités et sauvegarde** : la non-régression **étendue** est due
(`CLAUDE.md` §47 bis), en commençant toujours par le ciblé.

> **Organisation révisée le 8 octobre 2026** : Cloud LOT 27 → Cloud LOT 28 → Local LOT 27 →
> **Local LOT 28** → GitHub → Vercel. La branche LOT 28 a été développée sur le LOT 27
> **provisoire** (`09d9ab6`), **avant** sa validation Supabase.

## 0. Garde d'entrée

- `git status` propre ; `main` = `origin/main` ; **`main` contient le LOT 27 validé et déployé**
  (Rapport 21 définitif présent). Sinon : **arrêt**.
- `git merge-base --is-ancestor 09d9ab6 <branche>` : la branche LOT 28 part bien du LOT 27
  provisoire. Sinon : arrêt.
- Lis la section « **Impact sur le LOT 28** » du Rapport 21 définitif.

## 0 bis. Adapter la branche au LOT 27 validé — avant toute relecture

1. Comparer : `git log 09d9ab6..main` — ce que la validation locale a ajouté au LOT 27
   (corrections, migrations `20261008000500`–`009900`, rapport définitif).
2. **Intégrer `main` dans la branche par une fusion** (`git merge main`), **sans réécrire**
   l'historique déjà publié. Un rebase suivi d'un `push --force` n'est fait **que** sur
   autorisation explicite.
3. Recaler ce que les corrections du LOT 27 ont pu changer : assertions de total (catalogue,
   `backup_scope`), noms et signatures des fonctions `pos_*`, `pos_session_expected`, recettes.
   Chaque recalage est un **commit distinct**, justifié au Rapport 22.
4. Vérifier l'ordre : toutes les migrations du LOT 28 sont **postérieures** à la dernière
   migration de `main`. Sinon : arrêt et signalement — jamais de renommage d'une migration déjà
   appliquée.

## 1. Relecture — en priorité

- **Secrets** sur le diff ; aucun `.env*` ; aucun `vercel.json` / `vercel.ts` ; le push de la
  branche n'a produit sur Vercel qu'un déploiement `CANCELED`, jamais `READY`.
- Extensions d'enum **seules** dans leur migration, appliquées avant leur premier usage.
- Les fonctions et policies de trésorerie sont reprises depuis **leur dernière version**
  (aucun élargissement d'un lot antérieur perdu) ; la contrainte d'origine compte **5**
  colonnes.
- Le schéma applique **exactement** l'analyse C-2 validée : une seule origine par encaissement.
- **L'écriture porte Σ encaissé, jamais Σ donné**, garanti par la base, pas par l'écran.
- Aucune fonction de facturation réécrite ; aucun coût ni marge dans le reçu ou la facture.
- Garde « née par sa fonction » sur `pos_sales`, `pos_payments` (et toute table numérotée).
- Conformité aux décisions C-2, T-2, D-3, P-4, D-1, D-2, B-10, B-11, C-28, S-1
  (`06_Decisions_LOT_28_Propositions.md`, puis DEC-055) : en particulier, **aucune** écriture
  `CUSTOMER_PAYMENT` sur un règlement adossé, et le paiement non-espèces n'entre **jamais** sur le
  compte de la caisse.

## 2. Contrôles hors base

`npm ci` · `lint` · `typecheck` · `test` · `build`.

## 3. Base

`npm run backup:snapshot -- avant-lot-28` (consigné) → `npm run db:status` (seulement les
migrations du lot) → `npm run db:push`. Migration partiellement appliquée : jamais réécrite.

## 4. Recettes — escalade par niveaux

1. **Lot** : `supabase/tests/pos_sales.sql`, puis `pos_sessions.sql` (le montant théorique a
   changé). Si S-1 a été livrée en tête de branche : ses recettes négatives d'`INSERT` direct
   sur `customer_invoices` et `customer_payments` d'abord. Le **test de référence de la Direction** doit passer : net 60 000, donné 100 000 →
   encaissé 60 000, monnaie 40 000, **trésorerie 60 000** ; facture sur demande → **solde du
   compte inchangé**.
2. **Dépendances touchées** : `db:verify:treasury`, `db:verify:transfers`,
   `db:verify:customer-payments`, `db:verify:customer-invoices`, `db:verify:supplier-invoices`
   (enum de paiement), `db:verify:commerce`, `db:verify:catalog`, `verify:capabilities`.
3. **Sauvegarde** : `backup_scope` change → cycle **SAUVEGARDE → RESET → RESTAURATION**
   (`verify:backup`).
4. **Production, après déploiement** : `verify:treasury`, `verify:customer-payments`, recette
   Playwright du PDV (clavier, monnaie à la frappe, 390 / 768 / 1440).

Une régression : remonte **d'un seul niveau** à la fois. Échec réseau : rejouable. Échec
fonctionnel : jamais masqué.

## 5. Corrections · 6. Livraison

Comme au LOT 27 : corrections sur la branche ; fusion `--ff-only` si possible ; **chaque push
sur autorisation** ; Vercel `READY` sur le sha fusionné ; recette production ciblée ; résidus
balayés ; **Rapport 22** définitif ; **DEC-055** ; `CLAUDE.md` à jour ; mémoire ; suppression
de la branche distante **proposée**, non exécutée.

Termine par : **« LOT 28 — VALIDÉ ET DÉPLOYÉ À `<sha>`. »** ou la liste précise de ce qui bloque.
