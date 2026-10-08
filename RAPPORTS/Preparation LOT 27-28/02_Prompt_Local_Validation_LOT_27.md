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

> **Organisation révisée le 8 octobre 2026** : Cloud LOT 27 → Cloud LOT 28 → **Local LOT 27** →
> Local LOT 28 → GitHub → Vercel. Quand tu reprends ce prompt, le LOT 28 a **déjà** été développé
> dans le Cloud sur `lot-28-point-de-vente`, à partir du LOT 27 **provisoire** (`09d9ab6`).
>
> Le push Cloud du LOT 27 a échoué (403). La branche a été **récupérée d'un bundle Git** vérifié,
> sous le nom **`lot-27-caisses-sessions`** (sha `09d9ab6`, 6 commits sur `32d0fcb`). `<branche>`
> vaut donc `lot-27-caisses-sessions`.

## 0. Garde d'entrée

- `git status` : aucune modification locale. Sinon, **arrête-toi** et signale-la ; n'écrase rien.
- `git fetch origin` ; `main` local = `origin/main`. `main` n'a reçu **aucune migration** depuis
  le départ de la branche ; sinon, signale-le avant tout rebase.
- `git switch --track origin/<branche>` ; `git merge-base --is-ancestor origin/main HEAD`.
- **Ne touche pas** `lot-28-point-de-vente` pendant cette validation. Note seulement, pour le
  LOT 28, chaque correction qui pourrait l'affecter.

## 0 bis. Corrections du LOT 27 et branche LOT 28

- Une correction de schéma est une **nouvelle** migration, horodatée dans le bloc **réservé**
  `20261008000500` à `20261008009900` (le LOT 28 commence à `20261009000100`). L'ordre
  d'application reste ainsi LOT 27 → corrections LOT 27 → LOT 28.
- Si une correction change un **compteur** (238 capacités, 65 tables), un **nom** ou une
  **signature** de fonction du LOT 27, consigne-le au Rapport 21 dans une section
  « **Impact sur le LOT 28** » : le prompt 04 s'en servira pour adapter la branche LOT 28.
- Le LOT 28 ne sera **jamais** rebasé en silence : son adaptation se fait au prompt 04.

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
- `db:verify:treasury` et `db:verify:transfers` : **dus** — le LOT 27 ajoute l'index unique
  `financial_accounts (id, kind)` et une clé étrangère composite vers ce compte ;
- `db:verify:audit`, `db:verify:settings`, `db:verify:purchasing`, `db:verify:commerce` : liste
  du Rapport 21 provisoire §12 (fonctions partagées relues ou réécrites par le lot) ;
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

Termine par : **« LOT 27 — VALIDÉ ET DÉPLOYÉ À `<sha>`. LA BRANCHE LOT 28 PEUT ÊTRE ADAPTÉE À CE `main`. »**
ou, sinon, par la liste précise de ce qui bloque.
