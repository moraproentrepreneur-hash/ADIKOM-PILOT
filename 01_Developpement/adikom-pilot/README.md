# ADIKOM PILOT — Application

Code source du SaaS interne d'ADIKOM Technology & Travel.

> La documentation fonctionnelle est la **source de vérité** du projet :
> `../../00 Documentation/`. Les décisions d'arbitrage sont consignées dans
> `../../00 Documentation/08_Decisions/01_Journal_des_Decisions.md`.

---

## Pile technique

| Domaine | Choix |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) · React 19.2 · TypeScript |
| Styles | Tailwind CSS v4, tokens issus de la charte ADIKOM |
| Données | Supabase **Cloud** — PostgreSQL, Auth, Storage |
| Tests | Vitest |
| Déploiement | Vercel (*Root Directory* : `01_Developpement/adikom-pilot`) |

Flux de développement (DEC-015) :

```
Code  →  Supabase Cloud  →  Tests  →  GitHub  →  Vercel  →  Recette en ligne
```

Docker n'est **pas** requis.

---

## Démarrage

```bash
# 1. Dépendances
npm install

# 2. Variables d'environnement
cp .env.example .env.local     # puis renseigner les valeurs du projet Supabase

# 3. Schéma de base de données
npm run db:push                # applique les migrations sur Supabase Cloud
npm run db:verify              # recette du schéma

# 4. Développement
npm run dev
```

Procédure détaillée : [MISE_EN_PLACE.md](./MISE_EN_PLACE.md)

`.env.local` n'est **jamais** commité. Aucun secret ne doit apparaître dans le
code, la documentation ou un message de commit.

---

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm run lint` | ESLint |
| `npm run typecheck` | Vérification TypeScript |
| `npm run test` | Tests unitaires |
| `npm run verify` | lint + typecheck + tests + build — **à passer avant chaque commit** |
| `npm run db:push` | Applique les migrations manquantes sur Supabase Cloud |
| `npm run db:status` | Liste les migrations à appliquer, sans rien modifier |
| `npm run db:verify` | Recette du schéma — socle (transaction annulée) |
| `npm run db:verify:location` | Recette du schéma — référentiel d'exploitation |
| `npm run db:verify:dashboard` | Recette des **sommes du pilotage** — tableau de bord |
| `npm run verify:pilotage` | Recette fonctionnelle — tableau de bord, dans un navigateur |
| `npm run verify:capabilities` | Audit des capacités — appels directs, refus et autorisations |
| `npm run verify:users` | Recette sécurité — module Utilisateurs |
| `npm run verify:referential` | Recette sécurité — clients, fournisseurs, parc, tarifs |
| `npm run verify:referential:ui` | Recette fonctionnelle — référentiel, dans un navigateur |
| `npm run db:inspect` | État des lieux du schéma : tables, RLS, policies, triggers |
| `npm run bootstrap:admin` | Crée ou met à jour le Super Admin |

---

## Organisation du code

```
src/
├── app/                    routes — (app) regroupe les pages authentifiées
├── components/brand/       logo officiel (point d'entrée unique)
├── components/layout/      barre latérale, structure applicative
├── features/<domaine>/     actions serveur et composants par domaine métier
├── lib/auth/               couche d'accès aux données, permissions
├── lib/supabase/           clients serveur / navigateur / administration
├── lib/money.ts            arithmétique monétaire entière en KMF
├── lib/navigation.ts       navigation de référence
└── proxy.ts                rafraîchissement de session, filtrage des routes

supabase/migrations/        schéma versionné — jamais modifié à la main en base
```

---

## Quatre règles à ne jamais contourner

**1. Les permissions se vérifient côté serveur.**
Toute action sensible commence par `requirePermission()`. Masquer un bouton
n'est pas une protection. Les policies RLS constituent la seconde barrière.

**1 bis. Une fonction `SECURITY DEFINER` n'est protégée que par son droit
d'exécution.**
RLS ne s'applique pas à elle : elle s'exécute avec les droits de son
propriétaire. Toute nouvelle fonction de ce type doit donc révoquer `EXECUTE`
à `public` **et** à `anon`, puis l'accorder explicitement (DEC-022). Les deux
sources accordent séparément ; fermer l'une ne ferme pas l'autre.

**2. Les montants sont des entiers.**
Tout passe par `src/lib/money.ts`. Aucun flottant dans un calcul financier.
Une imputation n'est pas un paiement : montant brut, imputé, payé et solde
restent conservés séparément.

**2 bis. Une somme illisible se REFUSE, elle ne s'approche pas.**
Une fonction `SECURITY INVOKER` qui somme des lignes soumises à RLS doit exiger
nommément le droit de les lire. Sans lui, elle renverrait un total silencieux et
faux : un solde réduit à son ouverture (migration 050), une dette fournisseur
égale à son brut parce que les imputations sont invisibles (migration 055). Un
zéro ne dit jamais « je n'ai pas le droit de compter ».

**3. Le logo officiel ne se transforme jamais.**
Le composant `AdikomLogo` est le seul point d'entrée. Il garantit le ratio,
l'espace de respiration et le fond clair. Les fichiers sources sont opaques :
un fond clair derrière le logo n'est pas une option de style.
