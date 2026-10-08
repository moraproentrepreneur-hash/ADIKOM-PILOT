# Prompt — LOT 27 · Reprise et validation locale

> À coller dans Claude Code **local** (Antigravity), une fois la branche Cloud du LOT 27 poussée.
> Remplacer `<branche>` par le nom donné dans le rapport provisoire.

---

Méthode du projet : **Cloud → GitHub → Local → Supabase → GitHub → Vercel**. Le Cloud a
développé et poussé sa branche ; **toi seul** sauvegardes, appliques les migrations, recettes,
corriges, fusionnes sur `main`, pousses et vérifies Vercel.

Tu reprends le **LOT 27 — Caisses et sessions de caisse** livré par Claude Code Cloud sur la
branche `<branche>`. Le Cloud n'a eu **aucun accès** à Supabase : aucune migration n'a été
exécutée, aucune recette SQL ni RLS n'a tourné. Tu es la première exécution réelle.

## 0. Garde d'entrée

- `git status` : aucune modification locale. Sinon, **arrête-toi** et signale-la ; n'écrase rien.
- `git fetch origin` ; `main` local = `origin/main`. `main` n'a reçu **aucune migration** depuis
  le départ de la branche ; sinon, signale-le avant tout rebase.
- `git switch --track origin/<branche>` ; `git merge-base --is-ancestor origin/main HEAD`.

## 1. Relecture

- `git log origin/main..HEAD` · `git diff --stat origin/main...HEAD`.
- **Secrets** sur le diff : aucun `.env*`, aucune clé, aucun JWT, aucune URL `postgres://`.
- **Aucun `vercel.json` / `vercel.ts`** créé ou modifié (il surchargerait l'Ignored Build Step).
- Sur Vercel, le push de la branche a produit au plus un déploiement **`CANCELED`**, jamais
  `READY` (API REST, filtrer sur `meta.githubCommitRef`).
- Migrations : horodatage après `20260929000300` ; D4 (aucune `SECURITY DEFINER`) ;
  `require_capability` en tête ; `revoke/grant` ; sous-select ; garde « née par sa fonction »
  en dernier ; montants dérivés, jamais stockés ; lecture des montants `amounts.view` **ou**
  caissier de la ligne, **sans** que `view` seul les livre ; `backup_scope` ordonné et assertion
  de total ; aucune migration ancienne modifiée.
- Conformité aux décisions du 8 octobre 2026 : **B-8** (jamais deux sessions ouvertes par
  utilisateur, en base) · **B-9** (aucun seuil, aucune écriture d'ajustement) · **B-13** (le
  caissier voit les siens seulement) · **C-27** (9 capacités, 238) · **T-1** (table sœur des
  montants, 65) ; et au Plan 02 §18.2 LOT 27.
- Note tes constats **avant** de corriger.

## 2. Contrôles hors base

`npm ci` · `lint` · `typecheck` · `test` · `build`.

## 3. Base — dans cet ordre, rien d'autre

1. `npm run backup:snapshot -- avant-lot-27` : consigne fichier, tables, lignes.
2. `npm run db:status` : **exactement** les migrations du lot, rien d'autre.
3. `npm run db:push`.
4. Si une migration échoue : **ne la réécris pas si elle a été partiellement appliquée** —
   analyse l'état réel, corrige par une migration nouvelle, documente.

## 4. Recettes ciblées (§47 bis)

Périmètre : module `pos` (nouveau) · catalogue de capacités · `backup_scope` · numérotation ·
lecture de `financial_accounts`.

- `supabase/tests/pos_sessions.sql` (écrite par le Cloud ; complète-la si un cas du Plan 02
  §18.2 manque) ;
- `db:verify:catalog` et `verify:capabilities` ;
- **`backup_scope` change** → cycle **SAUVEGARDE → RESET → RESTAURATION obligatoire**
  (`verify:backup`), après la sauvegarde du §3 ;
- `db:verify:treasury` **seulement** si une garde touche `financial_accounts` ;
- recette Playwright du lot sur la production après déploiement ; responsive 390 / 768 / 1440.

Discipline : jamais de tube vers `head`, jamais deux recettes en parallèle, profil minimal,
nettoyage vérifié, un échec fonctionnel ne se rejoue pas.

## 5. Corrections

Sur la branche du lot, commits distincts, chaque correction justifiée dans le rapport.

## 6. Livraison — chaque push sur autorisation explicite

1. `git switch main` · `git merge --ff-only <branche>` (sinon `--no-ff`, expliqué).
2. Push `main` → Vercel `READY` sur **le sha fusionné** (API REST).
3. Recette de production ciblée ; résidus balayés par marqueur.
4. **Rapport 21** définitif (remplace le provisoire) : écarts Cloud → local, corrections,
   tests réellement exécutés et non rejoués, compteurs (migrations, 238, 65), sha déployé.
5. **DEC-054** définitive ; `CLAUDE.md` §10 ; mémoire si une leçon nouvelle est apparue.
6. Proposer — sans l'exécuter — la suppression de la branche distante.

Termine par : **« LOT 27 — VALIDÉ ET DÉPLOYÉ À `<sha>`. LE LOT 28 PEUT PARTIR DE CE `main`. »**
ou, sinon, par la liste précise de ce qui bloque.
