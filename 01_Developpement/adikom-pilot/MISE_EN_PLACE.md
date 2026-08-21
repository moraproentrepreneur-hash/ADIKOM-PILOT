# ADIKOM PILOT — Mise en place

Procédure d'installation et de déploiement.

## Architecture de développement

```
Code  →  Supabase Cloud  →  Tests  →  GitHub  →  Vercel  →  Recette en ligne
```

| Élément | Rôle |
|---|---|
| **Next.js** | Application (interface et logique serveur) |
| **Supabase Cloud** | Base de données PostgreSQL, authentification, stockage |
| **GitHub** | Versionnement |
| **Vercel** | Déploiement |

> **Docker n'est pas requis** (DEC-015). La pile Supabase locale reste possible
> pour qui le souhaite, mais elle ne fait pas partie de l'architecture du projet
> et aucune étape ne l'exige.

ADIKOM PILOT est une application **hébergée en ligne**, dont l'usage est
**strictement réservé aux collaborateurs autorisés d'ADIKOM**. Aucun compte
client, fournisseur ou partenaire. Aucune inscription publique. Seule la landing
page est publique, et elle ne présente que le produit.

---

## 1. Créer le projet Supabase

1. <https://supabase.com> → **New project**
2. Nom : `adikom-pilot`
3. Région : la plus proche des Comores (`eu-central-1` ou `ap-south-1`)
4. **Conserver le mot de passe de la base** dans un gestionnaire de mots de
   passe : il est nécessaire pour appliquer les migrations et n'est affiché
   qu'une seule fois.

---

## 2. Renseigner `.env.local`

```bash
cp .env.example .env.local
```

Valeurs à récupérer dans le tableau de bord Supabase
(**Project Settings → API**, puis **Database**) :

| Variable | Où la trouver | Nature |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL | publique |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → clé `anon` / publishable | publique |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → clé `service_role` | **secret** |
| `SUPABASE_DB_URL` | Settings → Database → Connection string (URI) | **secret** |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` en développement | publique |

### Deux pièges sur `SUPABASE_DB_URL`

La chaîne affichée dans le tableau de bord ne fonctionne pas telle quelle.

**1. Le mot de passe doit être encodé.**
Les caractères `@`, `:`, `/`, `?`, `#` ont une signification dans une URL. Un
mot de passe commençant par `@` serait interprété comme un séparateur d'hôte, et
la connexion échouerait sur un nom de domaine incohérent.

| Caractère | À écrire |
|---|---|
| `@` | `%40` |
| `:` | `%3A` |
| `/` | `%2F` |
| `#` | `%23` |
| `?` | `%3F` |

**2. La connexion directe est en IPv6 uniquement.**
`db.<ref>.supabase.co` ne publie plus d'adresse IPv4. Sur un réseau sans IPv6,
la résolution échoue avec `getaddrinfo ENOTFOUND`.

Utiliser le **pooler**, joignable en IPv4 :

```
postgresql://postgres.<REF>:<MOT_DE_PASSE_ENCODE>@aws-0-<REGION>.pooler.supabase.com:5432/postgres
```

- l'identifiant devient `postgres.<REF>` et non `postgres` ;
- le **port 5432** correspond au mode session, requis pour les migrations
  (le port 6543, en mode transaction, ne convient pas au DDL) ;
- la région figure dans *Project Settings → Database → Connection pooling*.

> `.env.local` est ignoré par Git et ne doit **jamais** être commité.
> La clé `service_role` contourne RLS : usage strictement serveur.

---

## 3. Appliquer le schéma

```bash
npm run db:push
```

Applique les migrations de `supabase/migrations/` sur le projet cloud, dans
l'ordre, en ne rejouant que celles qui manquent.

Pour vérifier ce qui serait appliqué sans rien modifier :

```bash
npm run db:status
```

> Le schéma se modifie **uniquement** par migration versionnée, jamais à la main
> dans l'interface Supabase. Une modification manuelle serait perdue au
> déploiement suivant et romprait la reproductibilité.

---

## 4. Créer le Super Admin

Seul compte créé hors de l'application : il n'existe aucune inscription
publique, et c'est lui qui crée ensuite tous les autres utilisateurs.

Les identifiants passent par des variables d'environnement, **jamais** en
argument de ligne de commande — ils resteraient dans l'historique du terminal.

PowerShell :

```powershell
$env:ADIKOM_ADMIN_EMAIL="prenom.nom@adikom.km"
$env:ADIKOM_ADMIN_USERNAME="identifiant"
$env:ADIKOM_ADMIN_PASSWORD="<mot de passe>"
$env:ADIKOM_ADMIN_FIRSTNAME="Prénom"
$env:ADIKOM_ADMIN_LASTNAME="Nom"
npm run bootstrap:admin
```

Le script est idempotent : relancé, il met à jour le profil sans dupliquer le
compte.

---

## 5. Vérifier le schéma déployé

```bash
npm run db:verify
```

Exécute `supabase/tests/socle.sql` : tables, RLS, journal d'audit en écriture
seule, catalogue des permissions, moteur d'autorisation, protection du Super
Admin, numérotation, organisation de départ, paramètres.

La recette s'exécute dans une transaction annulée : elle ne laisse aucune donnée
en base et peut être rejouée à volonté.

---

## 6. Lancer l'application

```bash
npm run dev
```

<http://localhost:3000> — la landing publique, puis la connexion.

L'application locale travaille sur la base Supabase Cloud.

---

## 7. Déployer sur Vercel

1. Importer le dépôt GitHub `ADIKOM-PILOT`
2. **Root Directory** : `01_Developpement/adikom-pilot` ← indispensable

   > Ce chemin ne doit contenir **aucun espace** : Vercel en dérive le nom de
   > ses fonctions serverless, et ces noms n'en admettent pas. Le build
   > réussirait, mais le déploiement échouerait sur `invalid_function_name`
   > (DEC-016).
3. Variables d'environnement du projet Vercel :

| Variable | Portée | Remarque |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | toutes | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | toutes | |
| `SUPABASE_SERVICE_ROLE_KEY` | toutes | **secret** — jamais préfixé `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | toutes | URL de déploiement |

`SUPABASE_DB_URL` n'est **pas** nécessaire sur Vercel : les migrations sont
appliquées depuis le poste de développement, pas par l'application.

---

## Recette

```bash
npm run verify                # lint + typecheck + tests + build
npm run db:verify             # recette SQL du socle
npm run db:verify:location    # recette SQL du référentiel (Étape 2.2)
npm run verify:users          # sécurité — module Utilisateurs
npm run verify:referential    # sécurité — référentiel d'exploitation
```

Les deux recettes de sécurité ouvrent de vraies sessions et éprouvent ce que
chaque profil atteint réellement, par appel direct. Elles créent puis
suppriment leurs comptes et leurs jeux d'essai.

Puis, dans l'application déployée :

| Contrôle | Résultat attendu |
|---|---|
| Landing publique | Accessible sans session, aucune donnée métier |
| Connexion du Super Admin | Accès au tableau de bord |
| Barre latérale | Tous les modules visibles (accès complet) |
| Réduction de la barre latérale | État conservé après rechargement |
| `/tableau-de-bord` sans session | Redirection vers la connexion |
| Table `permissions` | 135 lignes |
| Table `audit_log` | Une entrée `LOGIN` après connexion |
| `update audit_log …` dans le SQL Editor | **Refusé** — table en écriture seule |
| Création d'un client | Identifiant `CLI-000001` attribué par le serveur |
| Doublon de nom ou de téléphone | Avertissement, création possible après confirmation |
| Deux immobilisations qui se chevauchent | **Refusée** par la base (DEC-012) |
| Tarif sans unité | **Refusé** — message au niveau du champ (DEC-001) |
| Simulation tarifaire | Montant **et** source du tarif retenu (DEC-002) |
| Coordonnées bancaires sans la permission | Onglet absent **et** données illisibles |
| Document de véhicule | Ouverture par lien signé d'une minute |

---

## Rappels de sécurité

- Aucun secret dans le code, la documentation ou un message de commit.
- `SUPABASE_SERVICE_ROLE_KEY` et `SUPABASE_DB_URL` contournent RLS.
- Le schéma se modifie uniquement par migration versionnée.
- Vérifier `git status` avant chaque commit.
- L'application étant accessible depuis Internet, le contrôle serveur des
  permissions n'est pas une précaution : c'est la seule protection réelle.
