# Rapport 03 — Projets & Tâches

**Projet :** ADIKOM PILOT — SaaS interne de gestion et de pilotage
**Entreprise :** ADIKOM Technology & Travel
**Lot :** LOT 12 — Projets & Tâches (Phase 4 — Organisation, Module 03)
**Décision de référence :** DEC-035
**Date :** 4 septembre 2026
**Commit de référence :** `80937e0` (déployé et éprouvé en production)
**État :** livré, déployé, recette de production passée

---

## 1. Travail réalisé

La **Phase 4 — Organisation** s'ouvre. `README` §73 et `CLAUDE.md` §61 la donnent
en cinq temps : **Projets & Planification**, utilisateurs, groupes, permissions,
paramètres. Le LOT 12 livre le premier, et seulement sa moitié — celle qui tient
le module debout.

### Pourquoi le module est coupé en deux

Le `Module 03` est le plus vaste du SaaS : projets, tâches, calendrier, réunions,
rendez-vous, actions, décisions. Le livrer d'un bloc reviendrait à construire sept
écrans avant d'en éprouver un seul, ce que `CLAUDE.md` §28 écarte.

La coupure suit une frontière réelle, pas un volume :

| Lot | Périmètre | Ce qui le tient ensemble |
| --- | --- | --- |
| **LOT 12** | Projets · Tâches · Équipe · Avancement · Retard | §54 : *une idée → un projet → des tâches → un responsable → une échéance → un suivi* |
| **LOT 13** | Calendrier · Réunions · Rendez-vous · Décisions · Actions | ce qui se **planifie dans le temps**, et ce qui en **découle** |

Les vingt critères d'acceptation du §53 se répartissent sans reste : **1 à 8,
14 à 18 et 20** relèvent du LOT 12 ; **9 à 13** du LOT 13.

### Ce qui est livré

| Livrable | Contenu |
| --- | --- |
| **Liste des projets** | tableau de suivi du §32 — projet, responsable, état, priorité, **avancement**, échéance ; filtres nom, état, priorité, archivés |
| **Fiche projet** | situation, tiers concerné, période, avancement, description, **équipe**, tâches, changement d'état, archivage |
| **Liste des tâches** | vue liste (§35) et vue **tableau** (§34) ; filtres état, priorité, projet, **retard**, sans échéance |
| **Fiche tâche** | état, projet, responsable, période, date de clôture, changement d'état |
| **Vue personnelle** | « Mes tâches » et « Mes projets » (§36), avec en cours / échéance du jour / en retard |
| **Création et modification** | projet et tâche, par formulaire, avec validation au champ |
| **Veille** | échéance de tâche proche · tâche en retard, dans le centre de notifications (§38) |

### Le choix structurant : ce qui se calcule ne se stocke pas

`Module 03` §33 donne l'exemple — « 10 tâches, 6 terminées → 60 % » — puis met en
garde contre « un pourcentage trompeur ».

Aucune colonne ne porte l'avancement. `projects_task_counts()` le **refait à
chaque lecture** sur les tâches réelles. Un pourcentage tenu par déclencheur
devrait être mis à jour à chaque création, chaque clôture, chaque annulation, et
le premier oubli produirait un chiffre faux — **et un total faux fait autorité
plus longtemps qu'un total absent** (doctrine de DEC-032 §a et DEC-034 §a).

Deux conséquences que la recette éprouve :

- **les tâches annulées sortent des deux côtés** — ni numérateur, ni
  dénominateur. Dix tâches dont six faites valent 60 % ; l'une annulée, les mêmes
  six sur neuf valent 67 %. Les compter ferait plafonner un projet dont plus rien
  n'est à faire ;
- **le retard n'est pas un statut** — il se dérive de l'échéance et du jour civil
  des Comores (DEC-025 §e). Une échéance au 4 n'est pas dépassée le 4, et une
  tâche close hier ne reste pas « en retard » pour l'éternité.

### Le second choix : clôturer n'est pas modifier

Le point de sécurité du lot, et il a un précédent. La migration 041 avait
découvert que `rental.maintenance.close` était **implicitement accordée** par
`.update`, faute de garde sur le chemin d'un appel direct.

`Module 03` §42 nomme « clôturer une tâche » **à côté de** « modifier une
tâche ». Or une policy d'`UPDATE` ne sait pas distinguer deux actes portés par la
même colonne. Deux déclencheurs s'en chargent :

| Acte | Capacité exigée |
| --- | --- |
| Passer une tâche à « Terminée » | `projects.tasks.close` |
| Tout autre changement d'une tâche | `projects.tasks.update` |
| Archiver ou restaurer un projet | `projects.archive` |
| Tout autre changement d'un projet | `projects.update` |

La barrière est au **déclencheur**, et non dans une fonction : ces tables se
modifient directement par PostgREST, et une garde placée ailleurs ne se trouve
pas sur ce chemin-là. La recette de production éprouve les quatre frontières par
`PATCH` direct, sans passer par aucun écran.

---

## 2. Migration

**`20260904000300_projets_et_taches.sql` — migration 058.**

### Trois tables, et rien de superflu

| Table | Rôle |
| --- | --- |
| `projects` | le projet : nom, objectif, responsable, état, priorité, période, tiers concerné, archivage |
| `project_members` | participants et observateurs (§9) — le **responsable** est `projects.owner_id`, jamais un rôle de cette table |
| `project_tasks` | la tâche : titre, projet **facultatif** (§10), responsable, état, priorité, période, échéance **facultative** (§14) |

Quatre types : `project_status` (six valeurs du §7), `project_task_status` (cinq
du §12), `project_priority` (quatre du §8), `project_member_role`. Aucun n'est
inventé : ils reprennent les énumérations du module, à l'identique
(`CLAUDE.md` §59).

### Ce que la base impose elle-même

| Règle | Où |
| --- | --- |
| Enchaînements de statut d'un projet | `fn_project_status_transition` |
| Enchaînements de statut d'une tâche, et `completed_at` | `fn_task_status_transition` |
| `projects.archive` ≠ `projects.update` | `fn_project_write_guard` |
| `projects.tasks.close` ≠ `projects.tasks.update` | `fn_task_write_guard` |
| Aucune tâche dans un projet archivé | `fn_task_project_coherence` |
| Un seul tiers par projet · fin ≥ début · titre non vide | contraintes `CHECK` |

### Une fonction, et un refus

`projects_task_counts(project_id)` rend, par projet : tâches comptées, terminées,
en retard, pourcentage. Elle **exige** `projects.tasks.view` et refuse sinon —
sans cette lecture, RLS rendrait zéro tâche et l'avancement se lirait « 0 % »,
c'est-à-dire « rien n'est fait », là où la vérité est « je n'ai pas le droit de
compter » (DEC-034 §c).

Un seul appel sert toute une liste : interroger le décompte projet par projet
ferait autant d'allers-retours que de lignes.

### La veille apprend deux situations

`notifications_watch()` passe de **onze à treize familles** :

| Situation | Niveau | Source |
| --- | --- | --- |
| Échéance de tâche aujourd'hui ou demain (§15) | **Rappel** — `Module 02` §4.2 | `projects` |
| Tâche en retard (§16) | **À surveiller** — `Module 02` §4.3 | `projects` |

Aucun niveau n'est une appréciation : les deux viennent des exemples littéraux du
`Module 02` §4, comme les onze autres. Une seule lecture est exigée —
`projects.tasks.view` : sans `projects.view`, le nom du projet manque, la
notification le dit sans lui, et son échéance reste vraie. C'est une **absence**,
pas un mensonge.

### Catalogue : 153 → 157

Quatre capacités, celles que le §42 nomme une à une :
`projects.tasks.view`, `.create`, `.update`, `.close`.

Elles ne sont pas déduites d'un modèle général : elles sont **écrites dans le
module**, et la fonctionnalité correspondante existe. Les tâches n'étaient
couvertes par **aucune** capacité du catalogue depuis la migration 007.

Ce qui n'est **pas** créé, et pourquoi : `assign` (attribuer, c'est créer ou
modifier), `archive` sur une tâche (elle s'**annule**), `export` / `download` /
`print` (aucun document produit), `meetings.*` / `decisions.*` (LOT 13). Une
capacité sans fonctionnalité est une capacité d'office, que DEC-024 interdit. La
migration vérifie elle-même le total avant de se terminer.

---

## 3. Fichiers

### Créés

| Fichier | Rôle |
| --- | --- |
| `supabase/migrations/20260904000300_projets_et_taches.sql` | migration 058 |
| `supabase/tests/projects.sql` | recette des règles — 20 contrôles |
| `scripts/verify-projects.mjs` | recette fonctionnelle — 76 contrôles |
| `src/features/projects/constants.ts` | statuts, priorités, rôles, transitions, dérivation du retard |
| `src/features/projects/data.ts` | lectures, libellés « non lisible », avancement, vue personnelle |
| `src/features/projects/actions.ts` | neuf actions serveur, chacune avec sa capacité |
| `src/features/projects/project-form.tsx` | fiche projet — création et modification |
| `src/features/projects/task-form.tsx` | fiche tâche — création et modification |
| `src/features/projects/panels.tsx` | états, archivage, équipe |
| `src/features/projects/progress.tsx` | l'avancement : un chiffre, un refus nommé, ou un échec dit |
| `src/features/projects/tabs.ts` | Projets · Tâches · Mes éléments |
| `src/features/projects/projects.test.ts` | tests unitaires — 22 cas |
| `src/app/(app)/projets/page.tsx` | liste des projets |
| `src/app/(app)/projets/nouveau/page.tsx` | création d'un projet |
| `src/app/(app)/projets/[id]/page.tsx` | fiche projet |
| `src/app/(app)/projets/taches/page.tsx` | liste et tableau des tâches |
| `src/app/(app)/projets/taches/nouvelle/page.tsx` | création d'une tâche |
| `src/app/(app)/projets/taches/[id]/page.tsx` | fiche tâche |
| `src/app/(app)/projets/mes-elements/page.tsx` | vue personnelle |

### Modifiés

| Fichier | Changement |
| --- | --- |
| `src/lib/auth/permissions.ts` | quatre capacités de tâches |
| `src/lib/navigation.ts` | « Projets & Planification » devient une section : **Projets** et **Tâches**, toutes deux livrées |
| `src/features/notifications/constants.ts` | troisième source `projects`, deux natures, un objet `task`, une source de veille |
| `src/features/notifications/notifications.test.ts` | trois modules producteurs au lieu de deux |
| `package.json` | `db:verify:projects`, `verify:projects` |
| 11 recettes SQL · 8 recettes fonctionnelles | catalogue attendu : 153 → **157** |

---

## 4. Règles métier appliquées

| Règle | §  | Application |
| --- | --- | --- |
| Six statuts de projet | §7 | repris à l'identique ; **annulé terminal**, **terminé reprenable** |
| Cinq statuts de tâche | §12 | repris à l'identique ; réouverture possible, annulation terminale |
| La priorité ne rend pas tout urgent | §8 | défaut « Normale » ; faible et normale restent **neutres** à l'écran |
| Responsable ≠ participant ≠ observateur | §9 | le responsable est sur le projet ; les deux autres dans l'équipe |
| Une tâche peut être indépendante | §10 | `project_id` nullable, et le formulaire commence sur « Aucun projet » |
| Une tâche peut n'avoir aucune échéance | §14 | `due_on` nullable, filtre dédié, et **jamais en retard** |
| Une tâche dépassée non terminée est en retard | §16 | dérivé, jamais stocké |
| Avancement calculé, cohérent | §33 | tâches réelles, annulées exclues des deux côtés |
| Un projet peut concerner un tiers | §28 | client **ou** fournisseur **ou** partenaire, exclusivité imposée par la base |
| Le module ne pilote pas les autres | §45 | aucune écriture ailleurs — la recette le vérifie |
| Un projet terminé ne se supprime pas | §48 | archivage ; les données restent consultables |
| Historique des changements | §31 | journal d'audit, `STATUS_CHANGE` qualifié |
| Le fuseau des Comores | DEC-025 §e | « aujourd'hui », « demain », « en retard » |

### Deux arbitrages tranchés dans DEC-035

**Annulé est terminal, terminé ne l'est pas.** Les incidents (migration 038) ont
retenu deux états terminaux, au motif qu'un incident rouvert serait indiscernable
d'un incident jamais clos. Un projet n'est pas un incident : le rouvrir coûte
infiniment moins que de le recréer avec ses tâches, et le journal d'audit
enregistre les deux mouvements. Ce qui est **abandonné** ne reprend pas ; ce qui
est **terminé** peut l'être à tort.

**Aucune référence `PRJ-…`.** Clients, véhicules, réservations et factures en
portent une parce qu'ils sont cités **hors** du système. Un projet ne l'est pas :
c'est une coordination interne, identifiée par son nom. Aucune règle de
numérotation n'est créée, et la recette vérifie qu'aucune ne l'a été.

---

## 5. Permissions et sécurité

### Le catalogue

| Capacité | Ce qu'elle ouvre |
| --- | --- |
| `projects.view` | la liste et les fiches de projet |
| `projects.create` | créer un projet |
| `projects.update` | modifier un projet, changer son état, composer son équipe |
| `projects.archive` | ranger un projet, et le ressortir |
| `projects.tasks.view` | la liste, le tableau et les fiches de tâche · l'avancement · la veille |
| `projects.tasks.create` | créer une tâche |
| `projects.tasks.update` | modifier une tâche, changer son état sauf clôture |
| `projects.tasks.close` | **déclarer une tâche terminée** |

### Aucune capacité n'en implique une autre

| Frontière | Éprouvée par |
| --- | --- |
| Lire les projets ≠ lire les tâches | `/projets/taches` refusé au `lecteur` |
| Lire les tâches ≠ lire les projets | `/projets` refusé à `taches_seules` |
| Modifier une tâche ≠ la clôturer | `PATCH status=DONE` refusé au `coordinateur` |
| Modifier un projet ≠ l'archiver | `PATCH is_archived` refusé au `modificateur` |
| Archiver un projet ≠ le modifier | `PATCH name` refusé à l'`archiviste` |
| Voir ≠ créer | insertions refusées au `coordinateur` et au `lecteur` |

### Trois barrières, comme partout

1. **La couche d'accès** — `requirePermissionOrRedirect` sur chaque page,
   `requirePermission` sur chaque action ;
2. **RLS** — une policy par table et par opération ;
3. **Les déclencheurs** — la seule barrière capable de distinguer *archiver* de
   *modifier*, et *clôturer* de *modifier*.

L'interface, elle, ne protège rien : elle **dit**. Un onglet qu'on ne peut pas
ouvrir n'est pas proposé, « Terminée » n'est pas offerte sans `tasks.close`, et
l'écran **nomme** la permission qui manque plutôt que d'afficher un vide.

### Ce que la visibilité suit

`Module 03` §51 — « un utilisateur ne doit pas pouvoir consulter un projet auquel
il n'a pas accès » — est appliqué au sens du modèle du SaaS : **la capacité de
lecture**. Aucun module ne restreint une ligne à ses participants, et retenir ici
une confidentialité par projet créerait une règle métier que rien ne documente.
Elle est **signalée** aux arbitrages ouverts (DEC-035 §c), non inventée.

La vue personnelle (§36) est un **filtre**, jamais une porte dérobée : sans
`projects.tasks.view`, un utilisateur n'y voit pas même ses propres tâches.

---

## 6. Tests

### Recette SQL — `npm run db:verify:projects`

**20 contrôles, tous réussis.** Exécutée avec le rôle de service, elle contrôle ce
que la base tient seule :

| # | Contrôle |
| --- | --- |
| 1 | aucune colonne d'avancement ni de retard n'est stockée |
| 2 | aucune référence, aucune numérotation inventée |
| 3 | un projet naît « Brouillon » |
| 4 | client + fournisseur simultanés : refusé |
| 5 | fin avant début : refusée |
| 6 | Brouillon → En cours → Terminé → repris ; retour au brouillon refusé |
| 7 | projet annulé : état terminal |
| 8 | **10 tâches, 6 terminées → 60 %** ; un seul retard, celui d'hier |
| 9 | **une tâche annulée sort du numérateur ET du dénominateur → 67 %** |
| 10 | projet sans tâche : aucun pourcentage, jamais 0 % |
| 11 | clôture horodatée, réouverture effacée, annulation terminale |
| 12 | projet archivé : aucune tâche nouvelle |
| 13 | veille : échéance = rappel, retard = à surveiller, et **rien d'autre** |
| 14 | projet rangé : ses échéances cessent de rappeler, sans rien perdre |
| 15 | tâche indépendante : suivie, sans fausser aucun avancement |
| 16 | équipe : une personne, un rôle, une seule ligne |
| 17 | projets, tâches et changements d'état journalisés |
| 18 | avancement et veille : deux lectures, **aucune écriture** |
| 19 | location, facturation et trésorerie intactes |
| 20 | catalogue à 157 ; huit capacités pour Projets, aucune de plus |

### Recette de production — `npm run verify:projects`

**76 contrôles, tous réussis** sur `https://adikom-pilot.vercel.app`, avec sept
profils réels et des appels directs à l'API :

| Section | Contrôles |
| --- | --- |
| 1 — les deux écrans exigent leur capacité | 7 |
| 2 — créer un projet par l'écran (§53.1, §53.2) | 6 |
| 3 — créer une tâche attribuée avec échéance (§53.3 à §53.5) | 5 |
| 4 — avancement : le chiffre réel, ou un refus nommé | 6 |
| 5 — le retard se voit et se filtre (§53.6) | 6 |
| 6 — **clôturer n'est pas modifier** | 10 |
| 7 — **archiver n'est pas modifier** | 8 |
| 8 — ce qu'un projet rangé n'accepte plus | 1 |
| 9 — créer sans le droit de créer | 3 |
| 10 — ce qui manque se nomme | 4 |
| 11 — la vue personnelle (§36, §53.14) | 3 |
| 12 — la veille (§38) | 6 |
| 13 — l'équipe et le journal (§9, §31) | 6 |
| 14 — aucun effet de bord | 5 |

### Tests unitaires, lint, types, build

| Contrôle | Résultat |
| --- | --- |
| `npm run test` | **157 tests, 9 fichiers** — dont 22 nouveaux sur le retard, les transitions et les onglets |
| `npm run lint` | aucun avertissement |
| `npm run typecheck` | aucune erreur |
| `npm run build` | réussi — **sept routes nouvelles** sous `/projets` |

---

## 7. Non-régressions

| Recette | Résultat |
| --- | --- |
| `db:verify` · `db:verify:location` · `db:verify:cycle` | inchangées |
| `db:verify:incidents` · `maintenance` · `maintenance-costs` · `imputations` | passées |
| `db:verify:treasury` · `supplier-invoices` · `customer-invoices` · `customer-payments` | passées |
| `db:verify:dashboard` · `db:verify:notifications` · `db:verify:analytics` | passées |
| `verify:capabilities` | **206 contrôles**, tous réussis |
| `verify:pilotage` (production) | **55 contrôles**, tous réussis |
| `verify:notifications` (production) | **85 contrôles**, tous réussis |
| `verify:analytics` (production) | **82 contrôles**, tous réussis |

La veille ayant été modifiée, les recettes du Centre de notifications ont été
rejouées en priorité — en base **et** en production.

---

## 8. GitHub

| Élément | Valeur |
| --- | --- |
| Dépôt | `moraproentrepreneur-hash/ADIKOM-PILOT` |
| Branche | `main` |
| Commit | `80937e0` — *feat: un projet, ses taches, et qui a le droit de les clore* |
| Fichiers | 44 modifiés ou créés — 7 496 lignes ajoutées |
| Secrets | aucun — vérification par recherche avant indexation |
| État | `main` et `origin/main` synchronisés |

---

## 9. Vercel

| Élément | Valeur |
| --- | --- |
| Projet | `adikom-pilot` |
| Déploiement | `dpl_GVq2uuL9LKNGyTvYvjZFRfJ8jKJY` |
| SHA déployé | `80937e0` — **identique au commit poussé** |
| État | `READY` |
| Cible | production — `https://adikom-pilot.vercel.app` |

---

## 10. Données DEMO et résidus

Contrôle après la recette de production :

| Vérification | Résultat |
| --- | --- |
| Projets portant la marque de recette | **0** |
| Tâches portant la marque de recette | **0** |
| Comptes `recette.*` | **0** |
| `projects` · `project_tasks` · `project_members` en base | **0 · 0 · 0** |
| Clients DEMO | **3** — intacts |
| Véhicules DEMO | **3** — intacts |
| Catalogue | **157 permissions** |

La recette nettoie dans l'ordre des dépendances — les tâches avant les projets,
`project_tasks.project_id` étant `on delete restrict` — puis **balaie par
marqueur** : un `delete` refusé ne lève rien avec PostgREST, et une recette
silencieuse sur ses résidus n'est pas une recette propre.

---

## 11. Défauts trouvés et corrigés

### 1. Le catalogue rejoué ne voyait pas les nouvelles capacités

`permissions.test.ts` reconstitue le catalogue en relisant les migrations, à
partir du marqueur `(code, module_code`. La CTE de la migration 058 commençait
par `(code, action` : les quatre capacités étaient invisibles au contrôle de
parité, qui les signalait comme « refus silencieux ».

**Corrigé** en alignant la CTE sur la convention. Le défaut était dans le
contrôle, pas dans la base — et c'est exactement ce que ce test existe pour
attraper.

### 2. Le veilleur complet ne l'était plus

`verify:notifications` affirme qu'« aucune source n'est fermée » au profil
`veilleur`. L'ajout d'une treizième famille rendait cette affirmation fausse :
l'écran lui annonçait, à juste titre, une source non surveillée.

**Corrigé** en donnant `projects.tasks.view` aux deux veilleurs complets. Le
comportement de l'application était correct ; c'est la définition du profil qui
avait vieilli.

### 3. Une attente de recette prise en défaut par sa propre mise en place

Le contrôle « un seul retard » comptait sans tenir compte de la tâche du projet
archivé, qui reste **listée** tout en cessant d'être **rappelée**.

**Corrigé** en transformant l'attente en contrôle de la distinction elle-même :
la liste montre les deux retards, la veille n'en rappelle qu'un. Lister et
rappeler sont deux gestes différents ; les confondre ferait disparaître un
travail que personne n'a annulé.

---

## 12. Arbitrages ouverts

| Réf. | Question |
| --- | --- |
| **DEC-035 §c** | Un projet peut-il être **confidentiel**, visible des seuls membres ? Suppose de décider qui le déclare, qui l'ouvre malgré tout, et ce qu'il advient de ses tâches. |
| **DEC-035 §g** | Les **sous-tâches** et les **dépendances** (§17, §18) doivent-elles être livrées, et selon quelle règle d'avancement ? |
| **DEC-033 §h** | « Tâche attribuée » — les notifications d'**événement** (créations) restent hors de la veille, avec l'activité récente. |
| **DEC-033 §h** | Les notifications doivent-elles être **routées** au responsable de la tâche plutôt qu'à la capacité de lecture ? |

### Ce que le lot ne fait pas, et pourquoi

| Non livré | Motif |
| --- | --- |
| Réunions, rendez-vous, décisions, actions, calendrier | LOT 13 — avec leurs capacités, qui ne sont donc pas créées |
| Sous-tâches, dépendances | §18 les renvoie « selon les besoins du MVP » ; absentes du §53 |
| Commentaires, documents de projet | supposent leur propre capacité ; accompagneront le compte rendu de réunion |
| Pondération des tâches dans l'avancement | citée par le §33 comme une évolution future |
| Glisser-déposer dans le tableau | §34 exige que le déplacement respecte les permissions : l'état se change depuis la fiche, où la capacité exigée dépend de l'état visé |
| Export, impression d'un état de projets | aucune capacité au catalogue, aucun document produit |

---

## 13. Où en est la Phase 4

| Lot | Objet | État |
| --- | --- | --- |
| **LOT 12** | **Projets & Tâches — *qui fait quoi, pour quand, où cela en est*** | **livré** |
| LOT 13 | Calendrier, réunions, rendez-vous, décisions, actions | à venir |
| LOT 14 | Groupes et vue hiérarchique | à venir |
| LOT 15 | Journal d'activité | à venir |
| LOT 16 | Paramètres | à venir |

---

**ADIKOM PILOT — Rapport 03**

> Ce qui se calcule ne se stocke pas : un avancement recopié finit par mentir.
> Clôturer n'est pas modifier, et archiver non plus.
> Ranger un projet, c'est cesser de le rappeler — jamais l'effacer.
