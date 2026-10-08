# O-1 — Sécurisation des déploiements Vercel avant le LOT 27

| | |
| --- | --- |
| Date | 8 octobre 2026 |
| Nature | Analyse (§1–§5), puis **application autorisée** des mesures A et B (§6) |
| Statut | ✅ **A et B appliquées et vérifiées le 8 octobre 2026** · C non demandée · Supabase non touchée |
| Plan Vercel | Hobby |

---

# 1. Configuration constatée (API REST Vercel, lecture seule)

Aucune valeur secrète n'a été lue ni affichée : l'API ne restitue pas les valeurs `sensitive`.

| Élément | Valeur | Conséquence |
| --- | --- | --- |
| Projet | `adikom-pilot` · Next.js · Node 24.x · racine `01_Developpement/adikom-pilot` | — |
| Dépôt lié | `moraproentrepreneur-hash/ADIKOM-PILOT` (**public**) · branche de production `main` | — |
| Déploiements Git | `createDeployments: enabled` | **chaque branche poussée** crée un déploiement |
| Ignored Build Step | **aucun** | toute branche construit |
| `vercel.json` / `vercel.ts` dans le dépôt | **aucun** | aucune surcharge actuelle |
| Variables système exposées | `autoExposeSystemEnvs: true` | `VERCEL_ENV` et `VERCEL_GIT_COMMIT_REF` disponibles au build |
| Protection des Preview (Vercel Authentication) | **`ssoProtection: null`** | une URL Preview est **publique** |
| Deploy hooks | 0 | aucun autre déclencheur |
| Protection des forks | activée | — |
| Déploiements existants | **40, tous Production, tous `main`, tous READY** · **0 Preview** | rien d'existant à nettoyer |
| Branches GitHub | `main` seule | — |

**Variables d'environnement**

| Variable | Type | Cibles |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | encrypted | production · preview · development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | encrypted | production · preview · development |
| `NEXT_PUBLIC_SITE_URL` | encrypted | production · preview · development |
| **`SUPABASE_SERVICE_ROLE_KEY`** | **sensitive** | **production · preview** |

**Une seule entrée** porte la clé de service pour les deux cibles : la modification consiste à
retirer `preview` de ses cibles, pas à créer ou supprimer une variable.

**Dépendance de l'application** : `SUPABASE_SERVICE_ROLE_KEY` n'est lue qu'**à l'exécution**, par
`src/lib/supabase/admin.ts` (16 appelants serveur : comptes, sauvegarde, documents, photos…), qui
lève une erreur explicite si elle manque. **Aucune lecture au build** : son absence en Preview ne
peut faire échouer aucun build. Aucun code ne lit `VERCEL_ENV` ni `VERCEL_GIT_*`.

---

# 2. Ce que la documentation Vercel dit exactement — vérifié, non supposé

- **Ignored Build Step** (Project settings) : la commande s'exécute dans la **Root Directory**,
  au passage en `BUILDING`. *« If the command exits with code `1`, the build continues as normal.
  If the command exits with code `0`, the build is immediately aborted, and the deployment state
  is set to `CANCELED`. »* Un build annulé **compte** dans les quotas de déploiements.
- Préréglage officiel « **Only build production** » : *« When the `VERCEL_ENV` is production, a
  new build will be issued »*. Exemple du guide Vercel :
  `if [ "$VERCEL_ENV" == "production" ]; then exit 1; else exit 0; fi`.
- `VERCEL_ENV` et `VERCEL_GIT_COMMIT_REF` : **disponibles au build** (System Environment Variables).
- 🟥 **`vercel.json` → `ignoreCommand`** : *« This value overrides the Ignored Build Step in
  Project Settings »*. Une branche qui ajoute ce fichier **réactive ses propres builds**.
- `git.deploymentEnabled` (alternative écartée) : vit dans `vercel.json`, donc **modifiable par
  une branche** ; exige un commit ; et le motif `*` (minimatch) **ne couvre pas** un nom contenant
  `/` (`claude/lot-27`) — piège silencieux.
- `PATCH /v9/projects/{id}/env/{envId}` : `value` est **facultatif** dans le corps ; on peut
  changer `target` sans ressaisir le secret.
- `PATCH /v9/projects/{id}` : `commandForIgnoringBuildStep`, chaîne de **256 caractères au plus**,
  `null` pour revenir au comportement automatique.

---

# 3. Modification recommandée — deux mesures cumulées

## Mesure A — Ignored Build Step du projet

```sh
if [ "$VERCEL_ENV" = "production" ]; then exit 1; else exit 0; fi
```

- `=` plutôt que `==` : syntaxe POSIX, valide quel que soit le shell.
- **`VERCEL_ENV` plutôt que le nom de branche** : c'est le préréglage officiel, et la seule
  production possible ici est `main`. Le critère porte sur **ce qu'on veut protéger** — rien
  d'autre que la production ne construit — et non sur une liste de branches.
- **Échec sûr** : si la variable manquait, la commande renverrait `0` — la production serait
  **annulée**, jamais une branche construite. Le défaut serait visible immédiatement et sans
  danger pour les données.
- 66 caractères — sous la limite de 256.

**Application** : `PATCH /v9/projects/<id du projet>` avec
`{"commandForIgnoringBuildStep": "<commande>"}` — ou, à l'identique, dans le tableau de bord :
*Settings → Build and Deployment → Ignored Build Step → Only build production*.

## Mesure B — `SUPABASE_SERVICE_ROLE_KEY` retirée de Preview

`PATCH /v9/projects/<id du projet>/env/<id de la variable>` avec
`{"target": ["production"]}` — **sans** `value`, **sans** `type`.

Elle tient même si la mesure A est contournée par un `vercel.json` de branche : un Preview
n'aurait plus que la clé **publique**, sous RLS.

## Mesure C — recommandée, non demandée (décision séparée)

**Vercel Authentication sur les Preview** (`ssoProtection: {"deploymentType": "preview"}`) :
toute URL Preview exigerait une connexion à l'équipe Vercel. La production
(`adikom-pilot.vercel.app`) n'est **pas** concernée par ce type. Elle ferme le dernier cas : un
Preview construit malgré tout serait invisible du public. **Non incluse dans l'autorisation
demandée** ; à décider à part.

---

# 4. Conséquences évaluées

| Point | Effet |
| --- | --- |
| Push d'une branche Cloud | un déploiement est **créé puis `CANCELED`** ; aucune installation, aucun build, aucune URL servant l'application. Statut « Canceled » affiché sur le commit GitHub — cosmétique |
| Production sur `main` | `VERCEL_ENV = production` → `exit 1` → build normal. **Inchangée** |
| Production actuelle (`4efff48`) | **Aucun effet** : un déploiement existant garde l'environnement de son build ; rien n'est redéployé |
| Secret de production | **valeur intacte**, cible Production conservée ; seule la cible Preview est retirée |
| Supabase | **aucun appel**, aucune modification |
| Preview existants | **aucun** — rien à invalider |
| Développement local | **aucun effet** — `.env.local` n'est pas concerné |
| Quotas | chaque push de branche consomme un déploiement annulé |
| Redéploiement manuel | « Redeploy » avec la case *Use project's Ignore Build Step* **décochée** construirait quand même une branche : geste volontaire, à proscrire pendant les LOT 27–28 |
| Variables publiques en Preview | conservées (URL et clé publique) : sans danger tant que rien ne construit, et protégées par RLS sinon |

**Risques résiduels**

1. **Surcharge par `vercel.json`** — couverte par la mesure B, par la règle du prompt Cloud, et
   par la relecture locale (prompts 02 et 04).
2. **Échec de l'écriture de la cible** sur une variable `sensitive` — improbable (`value`
   facultative), mais vérifié par relecture immédiate : la variable doit toujours exister, avec
   `target = ["production"]`, même `id`, même type.
3. **Réversibilité** : `commandForIgnoringBuildStep: null` et `target: ["production","preview"]`
   rétablissent exactement l'état actuel. La valeur du secret n'étant jamais réécrite, rien
   d'irréversible n'est fait.

---

# 5. Procédure de vérification après modification

**Immédiate — API, lecture seule**

1. `GET /v9/projects/…` : `commandForIgnoringBuildStep` égal **au caractère près** à la commande ;
   `SUPABASE_SERVICE_ROLE_KEY` présente, **même `id`**, type `sensitive`, `target = ["production"]` ;
   les trois autres variables inchangées.
2. `GET /v6/deployments` : la production est toujours READY sur `4efff48`.
3. `https://adikom-pilot.vercel.app` répond **200**.

**Au premier push Cloud du LOT 27** — c'est la vraie épreuve de la mesure A

4. `GET /v6/deployments?projectId=…` : le déploiement de la branche est **`CANCELED`**, jamais
   `READY` ; ses journaux de build citent l'*Ignored Build Step* et ne contiennent **ni**
   `npm install` **ni** `next build`.

**Au prochain push sur `main`** (fusion du LOT 27 au plus tard) — épreuve du maintien de la production

5. Le déploiement Production est **READY** sur le sha poussé.
6. Une fonction qui exige la clé de service répond normalement en production (la recette ciblée
   du lot passe par la connexion et l'administration) : preuve que la cible Production a gardé
   sa valeur.

**Si l'étape 5 échoue** : rétablir `commandForIgnoringBuildStep: null`, redéployer `main`, analyser.
Aucun push de branche n'est fait tant que l'étape 4 n'a pas été constatée.

---

# 6. Application — 8 octobre 2026

**Autorisation de la Direction** : mesures **A** et **B** exclusivement. Vercel Authentication
(mesure C) **non demandée, non appliquée**. Aucun déploiement de test déclenché.

| Mesure | Opération réelle | Réponse | Relecture |
| --- | --- | :-: | --- |
| **A** | `PATCH /v9/projects/<id du projet>` — `commandForIgnoringBuildStep` seul | HTTP 200 | commande enregistrée **identique au caractère près** |
| **B** | `PATCH /v9/projects/<id du projet>/env/<id>` — corps `{"target":["production"]}`, **sans `value` ni `type`** ; garde préalable : une seule entrée, cibles exactement `production` + `preview` | HTTP 200 | `SUPABASE_SERVICE_ROLE_KEY` : **même identifiant**, type `sensitive`, cible **`production` seule** |

**Vérifications immédiates (§5, étapes 1 à 3)**

| Contrôle | Résultat |
| --- | :-: |
| Ignored Build Step = `if [ "$VERCEL_ENV" = "production" ]; then exit 1; else exit 0; fi` | ✅ |
| Seule la production construit (préréglage officiel, `VERCEL_ENV`) | ✅ par la règle — épreuve réelle au premier push (étapes 4 et 5) |
| Clé de service limitée à Production, valeur jamais lue ni réécrite | ✅ |
| Trois autres variables inchangées (cibles et horodatage de mise à jour identiques) | ✅ |
| Production toujours READY sur `4efff48` · aucun nouveau déploiement créé | ✅ |
| `https://adikom-pilot.vercel.app/` et `/connexion` | ✅ **200** |
| Supabase | ✅ **aucun appel** |
| `ssoProtection`, `createDeployments`, branche de production | inchangés (`null`, `enabled`, `main`) |

**Restent à constater** : l'étape 4 au premier push de la branche Cloud (déploiement
`CANCELED`), et l'étape 5 au prochain push sur `main` (Production READY, clé de service
fonctionnelle).

**Interdiction maintenue pendant les LOT 27 et 28** : aucun `vercel.json` ni `vercel.ts` — écrite
dans les prompts 01 et 03, contrôlée par les prompts 02 et 04.

**Retour arrière, si nécessaire** : `commandForIgnoringBuildStep: null` et
`target: ["production","preview"]` sur la même variable.

---

**A ET B APPLIQUÉES · VERCEL AUTHENTICATION NON ACTIVÉE · SUPABASE NON TOUCHÉE · RIEN COMMITÉ**
