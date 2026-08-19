# ADIKOM PILOT — Mise en place

Procédure d'installation de l'environnement de développement et de l'environnement cloud.

Configuration retenue :

| Environnement | Rôle | Outil |
|---|---|---|
| **Local** | Développement et tests. Base rejouable à volonté. | Docker + Supabase CLI |
| **Cloud** | Recette et production. | Projet Supabase + Vercel |

Les migrations de `supabase/migrations/` font foi des deux côtés : le schéma
n'est **jamais** modifié à la main dans une interface d'administration.

---

## Partie 1 — Environnement local

### 1.1 Installer Docker Desktop

<https://www.docker.com/products/docker-desktop/>

Après installation, **démarrer Docker Desktop** et attendre que l'icône passe au
vert. Vérification :

```bash
docker info
```

### 1.2 Démarrer la pile Supabase locale

Depuis `01 Développement/adikom-pilot` :

```bash
npm run db:start
```

Le premier lancement télécharge plusieurs images : comptez quelques minutes.

La commande affiche à la fin les informations de connexion locales :

```
API URL: http://127.0.0.1:54321
Studio URL: http://127.0.0.1:54323
anon key: eyJhb...
service_role key: eyJhb...
```

### 1.3 Renseigner `.env.local`

```bash
cp .env.example .env.local
```

Reporter dans `.env.local` les valeurs affichées à l'étape précédente :

| Variable | Valeur locale |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | l'`API URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | l'`anon key` |
| `SUPABASE_SERVICE_ROLE_KEY` | la `service_role key` |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` |

> `.env.local` est ignoré par Git et ne doit jamais être commité.

### 1.4 Appliquer le schéma

```bash
npm run db:reset
```

Repart d'une base vierge et rejoue les 8 migrations, y compris le catalogue des
permissions et l'organisation de départ. Cette commande est **rejouable autant
de fois que nécessaire** — c'est l'intérêt principal de l'environnement local.

### 1.5 Créer le Super Admin

Les identifiants passent par des variables d'environnement, jamais en argument
de ligne de commande : ils resteraient dans l'historique du terminal.

PowerShell :

```powershell
$env:ADIKOM_ADMIN_EMAIL="prenom.nom@adikom.km"
$env:ADIKOM_ADMIN_PASSWORD="<mot de passe d'au moins 12 caractères>"
$env:ADIKOM_ADMIN_FIRSTNAME="Prénom"
$env:ADIKOM_ADMIN_LASTNAME="Nom"
npm run bootstrap:admin
```

### 1.6 Lancer l'application

```bash
npm run dev
```

<http://localhost:3000> — la landing publique, puis la connexion.

---

## Partie 2 — Environnement cloud

### 2.1 Créer le projet Supabase

1. <https://supabase.com> → **New project**
2. Nom : `adikom-pilot`
3. Région : la plus proche des Comores (`eu-central-1` ou `ap-south-1`)
4. Conserver le mot de passe de la base dans un gestionnaire de mots de passe

### 2.2 Lier et déployer le schéma

La référence du projet figure dans son URL :
`https://supabase.com/dashboard/project/<REFERENCE>`

```bash
npx supabase link --project-ref <REFERENCE>
npm run db:push
```

`db:push` applique les migrations non encore déployées. Il ne réinitialise
jamais la base : `db:reset` reste réservé au local.

### 2.3 Créer le Super Admin de production

Même procédure qu'en 1.5, avec un `.env.local` pointant sur le projet cloud, ou
en surchargeant ponctuellement `NEXT_PUBLIC_SUPABASE_URL` et
`SUPABASE_SERVICE_ROLE_KEY`.

> Utiliser un mot de passe **différent** de celui de l'environnement local.

### 2.4 Déployer sur Vercel

1. Importer le dépôt GitHub `ADIKOM-PILOT`
2. **Root Directory** : `01 Développement/adikom-pilot` ← indispensable
3. Variables d'environnement du projet Vercel :

| Variable | Portée |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | toutes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | toutes |
| `SUPABASE_SERVICE_ROLE_KEY` | **serveur uniquement** — jamais préfixée `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | l'URL de déploiement |

---

## Vérification

Une fois la base en place, ces contrôles doivent tous passer :

```bash
npm run verify        # lint + typecheck + tests + build
```

Puis, dans l'application :

| Contrôle | Résultat attendu |
|---|---|
| Connexion avec le Super Admin | Accès au tableau de bord |
| Barre latérale | Tous les modules visibles (accès complet) |
| Réduction de la barre latérale | État conservé après rechargement |
| Accès direct à `/acces-refuse` | Page lisible, sans détail technique |
| Table `permissions` dans Studio | 130 lignes |
| Table `audit_log` | Une entrée `LOGIN` après connexion |
| `update audit_log set ...` dans Studio | **Refusé** — table en écriture seule |

---

## Rappels de sécurité

- Aucun secret dans le code, la documentation ou un message de commit.
- `SUPABASE_SERVICE_ROLE_KEY` contourne RLS : usage strictement serveur.
- Le schéma se modifie **uniquement** par migration versionnée.
- Vérifier `git status` avant chaque commit.
