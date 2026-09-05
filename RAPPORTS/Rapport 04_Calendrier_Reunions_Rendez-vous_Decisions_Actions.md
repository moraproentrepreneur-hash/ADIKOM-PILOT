# Rapport 04 — Calendrier, Réunions, Rendez-vous, Décisions, Actions

**Projet :** ADIKOM PILOT — SaaS interne de gestion et de pilotage
**Entreprise :** ADIKOM Technology & Travel
**Lot :** LOT 13 — second volet du Module 03 (Phase 4 — Organisation)
**Décision de référence :** DEC-036
**Date :** 5 septembre 2026
**Commit de référence :** `8f2b604` (déployé et éprouvé en production)
**État :** livré, déployé, recette de production passée

---

## 1. Travail réalisé

DEC-035 avait coupé le `Module 03` en deux sur une frontière réelle. Le LOT 12
livrait ce qui **fait travailler** — projets, tâches, responsables, échéances.
Celui-ci livre ce qui se **planifie dans le temps** et ce qui en **découle**.

Les vingt critères d'acceptation du §53 se répartissaient sans reste : 1 à 8,
14 à 18 et 20 relevaient du LOT 12 ; **9 à 13 relèvent de celui-ci**. Le
Module 03 est désormais complet.

### Ce qui est livré

| Livrable | Contenu |
| --- | --- |
| **Calendrier** | quatre vues du §20 — jour, semaine, mois, agenda ; trois couches filtrables (§19) ; grille sur écran large, liste sur mobile |
| **Liste des réunions** | filtres période, état, projet (§41) ; le compteur des réunions **sans compte rendu** |
| **Fiche réunion** | situation, ordre du jour, **compte rendu**, participants, décisions prises, actions à effectuer, changement d'état |
| **Liste des rendez-vous** | filtres période, état, responsable (§41) ; le tiers concerné en colonne |
| **Fiche rendez-vous** | situation, tiers **lié à sa fiche** (§27), personne rencontrée, notes, participants |
| **Liste des décisions** | recherche sur le titre, le contexte **et l'énoncé** ; de la plus récente à la plus ancienne |
| **Fiche décision** | l'énoncé, le contexte, l'origine, et les **actions résultantes** |
| **Liste des actions** | filtres « en attente » (§37) et « en retard » ; l'état de la tâche lorsqu'elle en porte une |
| **Fiche action** | suivi, correction, et la **transformation en tâche** (§25) |
| **Vue personnelle** | « Mes réunions », « Mes rendez-vous », « Mes actions » s'ajoutent aux tâches et projets (§36) |
| **Fiche projet** | elle cite désormais ses **réunions** et ses **décisions** (§6) |
| **Veille** | réunion à venir · rendez-vous à venir, dans le centre de notifications (§38) |

### Le premier choix : le calendrier n'a pas de permission

Il aurait été facile d'en créer une. `projects.calendar.view` aurait eu l'air
sérieux dans un catalogue.

Mais le calendrier ne montre **rien** que `projects.tasks.view`,
`projects.meetings.view` ou `projects.appointments.view` n'ouvrent déjà. La
retirer n'aurait rien fermé — les mêmes éléments restent lisibles dans leurs
listes. C'eût été **l'illusion d'un contrôle**, et une permission qui ne fait
que masquer un écran n'en est pas une.

Deux conséquences, que la recette éprouve :

- **la page s'ouvre à qui détient au moins une des trois lectures**, et
  n'affiche que les couches correspondantes ;
- **les couches fermées sont NOMMÉES.** Un calendrier vide et un calendrier
  amputé ne sont pas la même chose ; les confondre ferait manquer une réunion
  qu'on croirait inexistante (DEC-017).

### Le second choix : consigner n'est pas organiser

Le point de sécurité du lot, et il a le même précédent que le précédent : la
migration 041 avait découvert que `rental.maintenance.close` était
**implicitement accordée** par `.update`, faute de garde sur le chemin d'un
appel direct.

`Module 03` §23 exige « l'utilisateur autorisé » pour enregistrer un compte
rendu, et §43 liste « préparer les comptes rendus » **à côté de** « organiser
les réunions ». Deux signaux textuels indépendants, pour deux actes réellement
distincts. Or une policy d'`UPDATE` ne sait pas les distinguer.

| Acte | Capacité exigée |
| --- | --- |
| Écrire un compte rendu **ou** déclarer la réunion tenue | `projects.meetings.report` |
| Tout autre changement d'une réunion | `projects.meetings.update` |

**Les deux gestes du compte rendu forment un seul acte.** Les séparer aurait
obligé à détenir aussi `.update` pour poser l'état — et rendu
`projects.meetings.report` inutilisable seule.

La barrière est au **déclencheur**, et non dans une fonction : ces tables se
modifient directement par PostgREST, et une garde placée ailleurs ne se trouve
pas sur ce chemin-là. La recette de production éprouve les deux frontières par
`PATCH` direct, sans passer par aucun écran.

### Le troisième choix : une action n'est pas une tâche, et peut le devenir

§25 dit deux choses. Qu'une action se réalise « **à la suite** d'une réunion,
d'une décision ou d'un événement ». Et qu'elle « peut être **transformée en
tâche** lorsqu'un suivi détaillé est nécessaire ».

La seconde phrase n'aurait aucun sens si les deux objets étaient le même.

| Règle | Ce qu'elle empêche |
| --- | --- |
| Une action **sans origine** est refusée par la base | qu'une action devienne une tâche déguisée, sans lien avec le moment qui l'a produite |
| Transformer exige `projects.tasks.create` | qu'on crée des tâches sans en avoir le droit, par un chemin détourné |
| Les deux écritures vivent dans **une seule transaction** | qu'un échec laisse une tâche orpheline, que la base refuse ensuite de supprimer (§48) |
| L'état de l'action est **gelé** ensuite | que deux états décrivent le même travail, et que l'un finisse par mentir |

Le gel est une règle de **cohérence**, pas de droit : contrairement aux gardes
de capacité, il ne s'efface ni pour une migration ni pour la clé de service. La
base ne doit pas accepter d'un script ce qu'elle refuse à un humain — et la
recette SQL le vérifie précisément sous ce rôle-là.

---

## 2. Migration

**`20260904000400_calendrier_reunions_et_decisions.sql` — migration 059.**

### Six tables

| Table | Rôle |
| --- | --- |
| `project_meetings` | la réunion (§21) et son compte rendu (§23) |
| `project_meeting_participants` | qui y prend part — le responsable est `owner_id` |
| `project_appointments` | le rendez-vous (§26) et son tiers (§27) |
| `project_appointment_participants` | qui s'y rend |
| `project_decisions` | ce qui a été décidé (§24) |
| `project_actions` | ce qui en découle (§25) |

Deux types seulement : `planning_status` (prévu · tenu · annulé) et
`project_action_status` (à faire · terminée · annulée).

Une réunion et un rendez-vous vivent le même cycle : la base n'en connaît donc
qu'un. Les **mots** diffèrent — « Tenue » pour une réunion, « Honoré » pour un
rendez-vous — mais pas les états (`CLAUDE.md` §59). Les trois états d'une action
sont ceux des tâches, à l'identique : ni « En cours » ni « En attente », car ce
degré de suivi est précisément ce qui la fait **devenir** une tâche.

### Ce que la base impose elle-même

| Règle | Où |
| --- | --- |
| Enchaînements de réunion et de rendez-vous | `fn_planning_status_transition` |
| Enchaînements d'action, et `completed_at` | `fn_action_status_transition` |
| `meetings.report` ≠ `meetings.update` | `fn_meeting_write_guard` |
| Transformation unique, état gelé, `tasks.create` exigée | `fn_action_write_guard` |
| Ni réunion ni décision dans un projet archivé | `fn_planning_project_coherence` |
| Une action sans origine · un seul tiers · durée sensée · énoncé non vide | contraintes `CHECK` |

### Deux fonctions

**`planning_calendar(du, au)`** rassemble les trois couches en une lecture, et
calcule le jour civil **une seule fois** sur `Indian/Comoro`. Trois requêtes
applicatives auraient produit trois définitions du « jour », et l'une aurait fini
par diverger. Elle ne lève pas quand une capacité manque : elle **omet** la
couche, comme `notifications_watch()` — un calendrier n'est pas une synthèse
chiffrée, l'absence d'une couche ne rend aucune autre fausse. Elle refuse en
revanche une période inversée ou de plus d'un an, et le refus se dit.

**`transform_action_to_task(action)`** fait naître la tâche et rattache l'action
dans la même transaction. La tâche hérite du **projet de l'origine** — celui de
la décision, à défaut celui de la réunion — afin de compter dans le bon
avancement (§33).

### La veille apprend deux situations

`notifications_watch()` passe de **treize à quinze familles** :

| Situation | Niveau | Fenêtre |
| --- | --- | --- |
| Réunion aujourd'hui ou demain (§38) | **Rappel** — `Module 02` §4.2 | jours civils des Comores |
| Rendez-vous aujourd'hui ou demain (§38) | **Rappel** — `Module 02` §4.2 | jours civils des Comores |

La fenêtre est celle des départs de réservation et des échéances de tâche : le
système n'a pas deux définitions de « bientôt ». Aucun niveau n'est une
appréciation — les deux viennent des exemples littéraux du `Module 02` §4.

« **Décision enregistrée** », que le §38 cite aussi, reste hors de la veille :
c'est un **événement de création**, et il relève de l'arbitrage ouvert par
DEC-033 §h, avec l'activité récente.

**Ce qui est annulé ou tenu ne rappelle plus rien**, et les réunions d'un projet
archivé se taisent — comme ses tâches (§48).

### Catalogue : 157 → 170

| Menu | Capacités |
| --- | --- |
| Réunions | `.view` · `.create` · `.update` · **`.report`** |
| Rendez-vous | `.view` · `.create` · `.update` |
| Actions | `.view` · `.create` · `.update` |
| Décisions | `.view` · `.create` · `.update` |

Ce qui n'est **pas** créé, et pourquoi : `projects.calendar.view` (il ne
contrôlerait rien) ; `actions.close` (clôturer une action, c'est la modifier —
§42 nomme « clôturer une **tâche** » et rien pour les actions) ;
`meetings.cancel` (annuler, c'est modifier) ; `decisions.archive` (une décision
se conserve, §24) ; `.export`, `.download`, `.print` (aucun document produit).

La migration vérifie elle-même le total et l'inventaire avant de se terminer.

---

## 3. Fichiers

### Créés — 23

| Fichier | Rôle |
| --- | --- |
| `supabase/migrations/20260904000400_calendrier_reunions_et_decisions.sql` | migration 059 |
| `supabase/tests/planning.sql` | recette des règles — 23 contrôles |
| `scripts/verify-planning.mjs` | recette fonctionnelle — 100 contrôles |
| `src/features/planning/constants.ts` | états, durées, et toute l'arithmétique du calendrier |
| `src/features/planning/data.ts` | lectures, libellés « non lisible », calendrier, vue personnelle |
| `src/features/planning/actions.ts` | seize actions serveur, chacune avec sa capacité |
| `src/features/planning/forms.tsx` | fiches réunion, rendez-vous et décision |
| `src/features/planning/panels.tsx` | états, compte rendu, participants, actions, transformation |
| `src/features/planning/calendar.tsx` | la grille et la liste — deux formes, quatre vues |
| `src/features/planning/planning.test.ts` | tests unitaires — 20 cas |
| `src/features/projects/access.ts` | les six lectures du module, en une fois |
| `src/app/(app)/projets/calendrier/page.tsx` | le calendrier |
| `src/app/(app)/projets/reunions/` — 3 pages | liste, création, fiche |
| `src/app/(app)/projets/rendez-vous/` — 3 pages | liste, création, fiche |
| `src/app/(app)/projets/decisions/` — 3 pages | liste, création, fiche |
| `src/app/(app)/projets/actions/` — 2 pages | liste et fiche |

### Modifiés — 34

| Fichier | Changement |
| --- | --- |
| `src/lib/auth/permissions.ts` | treize capacités |
| `src/lib/auth/dal.ts` | `requireAnyPermissionOrRedirect` — pour un écran qui superpose des couches |
| `src/lib/navigation.ts` | la section reprend les sept entrées du §4 ; `alternatives` pour le calendrier |
| `src/features/projects/tabs.ts` | huit onglets, dans l'ordre du §4 |
| `src/features/notifications/constants.ts` | deux natures, deux objets, deux sources de veille |
| `src/app/(app)/projets/[id]/page.tsx` | la fiche projet cite ses réunions et ses décisions (§6) |
| `src/app/(app)/projets/mes-elements/page.tsx` | réunions, rendez-vous et actions (§36) |
| `src/app/(app)/projets/page.tsx` · `taches/page.tsx` | onglets du module |
| `scripts/lib/env.mjs` | `instantOffset`, `localInput` — pour éprouver le fuseau |
| `scripts/verify-notifications.mjs` | le veilleur complet reçoit les deux nouvelles lectures |
| `supabase/tests/analytics.sql` | **défaut corrigé** — voir §11 |
| `package.json` | `db:verify:planning`, `verify:planning` |
| 12 recettes SQL · 9 recettes fonctionnelles | catalogue attendu : 157 → **170** |

---

## 4. Règles métier appliquées

| Règle | §  | Application |
| --- | --- | --- |
| Une réunion a date, heure, durée, lieu | §21 | `starts_at` est un **instant**, `duration_minutes` une durée bornée |
| Le compte rendu s'enregistre après | §23 | capacité distincte, horodatée par la base, effacée si le texte est retiré |
| La préparation se suit en tâches | §22 | aucune sous-structure inventée : ce sont des tâches du LOT 12 |
| Une décision a un énoncé | §24 | `statement` obligatoire — un titre seul ne conserve rien |
| Une décision n'a pas de statut | §24 | ce n'est pas un travail en cours ; « en attente » signifierait qu'elle n'est pas prise |
| Une action découle d'un moment | §25 | contrainte `actions_has_origin` |
| Une action se transforme en tâche | §25 | une transaction, une seule fois, état gelé ensuite |
| Un rendez-vous concerne un tiers | §27 | client **ou** fournisseur **ou** partenaire, exclusivité imposée par la base |
| …et une personne, enregistrée ou non | §26 | `external_contact` **coexiste** avec le tiers : deux informations, pas deux réponses |
| Le calendrier filtre par type | §19 | trois couches, chacune gouvernée par sa capacité |
| Quatre niveaux de visualisation | §20 | jour · semaine · mois · agenda |
| Les vues se réorganisent sur mobile | §49 | la grille devient une liste — jamais une grille réduite |
| Réunion et rendez-vous à venir notifiés | §38 | deux familles dérivées, en rappel |
| Rien ne se supprime | §24, §48 | annulation, jamais suppression ; seule une convocation se retire |
| Historique des changements | §31 | journal d'audit, `STATUS_CHANGE` qualifié |
| Le module ne pilote pas les autres | §45 | une seule écriture hors du module : la tâche née d'une action, que §25 demande |
| Le fuseau des Comores | DEC-025 §e | saisie convertie, jour civil calculé une seule fois |

---

## 5. Permissions et sécurité

### Le catalogue

| Capacité | Ce qu'elle ouvre |
| --- | --- |
| `projects.meetings.view` | la liste et les fiches de réunion · la couche du calendrier · la veille |
| `projects.meetings.create` | convoquer une réunion |
| `projects.meetings.update` | la déplacer, la modifier, l'annuler, composer ses participants |
| `projects.meetings.report` | **enregistrer le compte rendu, et déclarer la réunion tenue** |
| `projects.appointments.view` | la liste et les fiches de rendez-vous · la couche du calendrier · la veille |
| `projects.appointments.create` | fixer un rendez-vous |
| `projects.appointments.update` | le modifier, l'annuler, composer ses participants |
| `projects.actions.view` | la liste et les fiches d'action |
| `projects.actions.create` | créer une action depuis sa réunion ou sa décision |
| `projects.actions.update` | la suivre, la corriger, la transformer (avec `tasks.create`) |
| `projects.decisions.view` | la liste et les fiches de décision |
| `projects.decisions.create` | enregistrer une décision |
| `projects.decisions.update` | la corriger — le changement est journalisé |

### Aucune capacité n'en implique une autre

| Frontière | Éprouvée par |
| --- | --- |
| Consigner ≠ organiser | `PATCH minutes` et `status=HELD` refusés à l'`organisateur` |
| Organiser ≠ consigner | `PATCH location` refusé au `rapporteur` |
| Lire les réunions ≠ lire les rendez-vous | `/projets/rendez-vous` refusé au `lecteur_reunions` |
| Lire les réunions ≠ lire les décisions | `/projets/decisions` refusé au même |
| Suivre une action ≠ créer une tâche | RPC **et** `PATCH task_id` refusés au `suiveur` |
| Voir ≠ créer | insertions refusées au `decideur` |
| Le calendrier n'ouvre rien de plus | couches fermées absentes **et** nommées |

### Trois barrières, comme partout

1. **La couche d'accès** — `requirePermissionOrRedirect` sur chaque page,
   `requirePermission` sur chaque action ;
2. **RLS** — une policy par table et par opération ;
3. **Les déclencheurs** — la seule barrière capable de distinguer *consigner* de
   *modifier*, et la seule qui tienne le gel d'un état.

L'interface, elle, ne protège rien : elle **dit**. Un onglet qu'on ne peut pas
ouvrir n'est pas proposé, « Tenue » n'est pas offerte sans `meetings.report`, le
bouton « Transformer en tâche » n'apparaît pas sans `tasks.create` — et l'écran
**nomme** la permission qui manque plutôt que d'afficher un vide.

---

## 6. Tests SQL — `npm run db:verify:planning`

**23 contrôles, tous réussis.** Exécutée avec le rôle de service, elle contrôle
ce que la base tient seule :

| # | Contrôle |
| --- | --- |
| 1 | aucune capacité de calendrier : l'écran ne montre rien de plus |
| 2 | catalogue à 170 ; 21 capacités pour Projets, aucune de plus |
| 3 | aucun retard stocké, aucune référence inventée |
| 4 | réunion créée, état initial « Planifiée », durée bornée |
| 5 | Planifiée → Tenue → replanifiée ; annulée : état terminal |
| 6 | compte rendu horodaté à l'écriture, effacé au retrait |
| 7 | projet rangé : ni réunion ni décision nouvelle |
| 8 | rendez-vous : un seul tiers, et un contact qui coexiste |
| 9 | décision : énoncé obligatoire, aucun statut, jour des Comores |
| 10 | action : une origine obligatoire, état initial « À faire » |
| 11 | action : réalisation horodatée, réouverture effacée, annulation terminale |
| 12 | **transformation atomique, unique, et l'état passe à la tâche** |
| 13 | action transformée : l'échéance reste lisible, le suivi change de main |
| 14 | calendrier : trois couches, jour civil des Comores, annulés exclus |
| 15 | période inversée ou démesurée : refusée, et le refus se dit |
| 16 | veille : réunion et rendez-vous = rappels, et rien d'autre |
| 17 | réunion annulée ou tenue : la veille se tait |
| 18 | projet rangé : la réunion cesse de rappeler, sans disparaître |
| 19 | participants : une personne, une seule ligne |
| 20 | suppression retirée à l'utilisateur ; seule la convocation se défait |
| 21 | réunions, décisions, actions et changements d'état : journalisés |
| 22 | calendrier et veille : deux lectures, aucune écriture |
| 23 | location, facturation et trésorerie : intactes |

---

## 7. Tests fonctionnels — `npm run verify:planning`

**100 contrôles, tous réussis** sur `https://adikom-pilot.vercel.app`, avec huit
profils réels et des appels directs à l'API :

| Section | Contrôles |
| --- | --- |
| 1 — chaque écran exige sa capacité (§51) | 10 |
| 2 — enregistrer une réunion, par l'écran (§53.9) | 7 |
| 3 — enregistrer un rendez-vous et son tiers (§53.10, §27) | 5 |
| 4 — conserver une décision, depuis sa réunion (§53.11, §46) | 5 |
| 5 — **consigner n'est pas organiser** (§23, §43) | 10 |
| 6 — **suivre une action, et la transformer** (§53.12, §25) | 12 |
| 7 — une action découle toujours d'un moment (§25) | 3 |
| 8 — le calendrier n'a pas de permission (§19) | 12 |
| 9 — ce qui manque se nomme (DEC-017) | 11 |
| 10 — la veille apprend deux situations (§38, §53.13) | 7 |
| 11 — la vue personnelle s'étend (§36) | 5 |
| 12 — rien ne se supprime (§24, §48) | 3 |
| 13 — le journal, et aucun effet de bord | 8 |

Un contrôle mérite d'être signalé : la recette **saisit l'heure des Comores**
dans le formulaire et vérifie l'instant stocké. Une recette qui saisirait l'heure
UTC passerait aussi bien avec une conversion correcte qu'avec aucune conversion —
elle n'éprouverait rien (DEC-025 §e).

### Tests unitaires, lint, types, build

| Contrôle | Résultat |
| --- | --- |
| `npm run test` | **179 tests, 10 fichiers** — dont 20 nouveaux sur l'arithmétique du calendrier |
| `npm run lint` | aucun avertissement |
| `npm run typecheck` | aucune erreur |
| `npm run build` | réussi — **neuf routes nouvelles** sous `/projets` |

---

## 8. Non-régressions

| Recette | Résultat |
| --- | --- |
| `db:verify` · `db:verify:location` · `db:verify:cycle` | inchangées |
| `db:verify:incidents` · `maintenance` · `maintenance-costs` · `imputations` | passées |
| `db:verify:supplier-invoices` · `treasury` · `customer-invoices` · `customer-payments` | passées |
| `db:verify:dashboard` · `db:verify:notifications` | passées |
| `db:verify:analytics` | **corrigée** — voir §11 |
| `db:verify:projects` | passée, section 20 recentrée sur les tâches |
| `verify:capabilities` | **206 contrôles**, tous réussis |
| `verify:pilotage` (production) | **55 contrôles**, tous réussis |
| `verify:notifications` (production) | **85 contrôles**, tous réussis |
| `verify:analytics` (production) | **82 contrôles**, tous réussis |
| `verify:projects` (production) | **76 contrôles**, tous réussis |

La veille ayant été modifiée, les recettes du Centre de notifications ont été
rejouées en priorité — en base **et** en production.

---

## 9. GitHub

| Élément | Valeur |
| --- | --- |
| Dépôt | `moraproentrepreneur-hash/ADIKOM-PILOT` |
| Branche | `main` |
| Commit | `8f2b604` — *feat: ce qui se planifie, ce qui s'en décide, et ce qui en découle* |
| Fichiers | 57 modifiés ou créés — 11 900 lignes ajoutées |
| Secrets | aucun — recherche par motif avant indexation ; `.env.local` reste ignoré |
| État | `main` et `origin/main` synchronisés |

---

## 10. Vercel

| Élément | Valeur |
| --- | --- |
| Projet | `adikom-pilot` |
| Déploiement | `dpl_C4v5JYUWcYPWKsKcUF86qoPZY8Xv` |
| SHA déployé | `8f2b604` — **identique au commit poussé** |
| État | `READY` |
| Cible | production — `https://adikom-pilot.vercel.app` |

La recette de production a été exécutée **après** ce déploiement, contre cette
adresse : les 100 contrôles portent sur le code réellement en ligne.

---

## 11. Défauts trouvés et corrigés

### 1. La recette des statistiques lisait l'heure du serveur, pas celle d'ADIKOM

Découvert pendant les non-régressions, à 22 h UTC.

`db:verify:analytics` bornait ses périodes sur `current_date` — le jour **UTC**
de la session — alors que les fonctions qu'elle éprouve datent leurs flux sur
`Indian/Comoro` (DEC-025 §e) : `billing_supplier_stats` compte une imputation au
jour de `(imputed_at at time zone 'Indian/Comoro')`.

Entre 21 h et minuit UTC, les Comores sont **déjà le lendemain**. Une imputation
créée à cet instant tombait hors de la fenêtre, et la recette échouait —
trois heures par jour, sans qu'aucune régression n'ait eu lieu.

**Le code de production était juste ; c'est l'horloge de la recette qui ne
l'était pas.** Les 44 bornes ont été reposées sur le jour civil des Comores, et
l'en-tête du fichier explique désormais pourquoi.

C'est le défaut le plus instructif du lot : il ne s'est révélé que parce que le
travail s'est prolongé dans la fenêtre où il existe. Dix autres recettes portent
la même fragilité et passent aujourd'hui — elle est **signalée** aux arbitrages
ouverts plutôt que corrigée en aveugle.

### 2. Deux règles de cohérence s'effaçaient pour la clé de service

`fn_action_write_guard` et `fn_meeting_write_guard` plaçaient d'abord le test
`current_actor() is null`, selon la convention des gardes de capacité
(migration 021). Deux règles s'en trouvaient neutralisées hors session
applicative :

- le **gel** de l'état d'une action transformée ;
- l'**horodatage** du compte rendu.

Or ni l'un ni l'autre n'est une question de droit. Le premier dit qu'un travail
n'a qu'un état ; le second enregistre un fait. La base aurait accepté d'un script
ce qu'elle refuse à un humain — et la recette SQL, qui s'exécute précisément avec
ce rôle, n'aurait rien pu en éprouver.

**Corrigé** en séparant les deux temps : la cohérence d'abord, sans exception ;
le droit ensuite, quand il y a une session à interroger.

### 3. Une recette laissait un état que la suivante n'attendait pas

Le contrôle du compte rendu déclare la réunion **tenue** — c'est son objet. Les
contrôles de veille qui suivaient la reprenaient « à venir », et échouaient.

**Corrigé** en remettant l'état à « Planifiée » à la fin du contrôle, et en
disant pourquoi : la §17 éprouve ensuite qu'une réunion tenue se tait.

### 4. Un contrôle de suppression visait à côté

`fn_forbid_delete` laisse **délibérément** passer les opérations sans session
applicative (DEC-020, migration 021) : une recette doit pouvoir nettoyer ses jeux
d'essai. Tenter une suppression avec le rôle de service n'éprouvait donc rien —
elle réussissait, et c'est voulu.

**Corrigé** en portant le contrôle sur la barrière telle qu'elle se présente à un
utilisateur : le privilège `DELETE` retiré à `authenticated`, et le déclencheur
en place sur chacune des quatre tables. La recette navigateur, elle, tente la
suppression avec une vraie session.

---

## 12. État de la base et résidus

Contrôle après la recette de production :

| Vérification | Résultat |
| --- | --- |
| Réunions, rendez-vous, décisions, actions portant la marque de recette | **0 · 0 · 0 · 0** |
| Projets et tâches portant la marque de recette | **0 · 0** |
| Comptes `recette.*` | **0** |
| Les neuf tables du Module 03 en base | **0 ligne** |
| Clients DEMO | **3** — intacts |
| Véhicules DEMO | **3** — intacts |
| Fournisseurs DEMO | **3** — intacts |
| Comptes actifs | **3** — les comptes réels d'ADIKOM |
| Catalogue | **170 permissions** |

La recette nettoie dans l'ordre des dépendances — actions, puis tâches, puis
décisions, puis réunions et rendez-vous, puis projets —, `project_actions` citant
les trois premières en `on delete restrict`. Puis elle **balaie par marqueur** :
un `delete` refusé ne lève rien avec PostgREST, et une recette silencieuse sur
ses résidus n'est pas une recette propre.

---

## 13. Arbitrages ouverts

| Réf. | Question |
| --- | --- |
| **DEC-036 §a** | Les **documents** d'un projet, d'une réunion ou d'un rendez-vous (§26, §29) doivent-ils être stockés ? Suppose d'arrêter les types, la capacité — consulter et téléverser sont deux capacités —, et la durée de conservation. |
| **DEC-036 §a** | Les **commentaires** (§30) doivent-ils être livrés ? Question déjà ouverte au LOT 12. |
| **DEC-036 §g** | Une réunion **passée mais jamais déclarée tenue** doit-elle être notifiée ? §38 ne nomme que « réunion à venir ». La fiche le signale ; la veille se tait, faute de seuil. |
| **DEC-036** | Dix recettes SQL bornent encore leurs périodes sur `current_date` (UTC). Elles passent, mais portent la fragilité du §11.1. Remède connu, à appliquer lot par lot. |
| **DEC-035 §c** | Un projet — et désormais une réunion — peut-il être **confidentiel**, visible des seuls participants ? |
| **DEC-035 §g** | Les **sous-tâches** et les **dépendances** (§17, §18) doivent-elles être livrées ? |
| **DEC-033 §h** | Les notifications d'**événement** — « tâche attribuée », « décision enregistrée » — restent hors de la veille, avec l'activité récente. |
| **DEC-033 §h** | Les notifications doivent-elles être **routées** aux participants plutôt qu'à la capacité de lecture ? |

### Ce que le lot ne fait pas, et pourquoi

| Non livré | Motif |
| --- | --- |
| Documents attachés (§26, §29) | supposent leur propre capacité et leur propre écran |
| Commentaires (§30) | même raison, reconduite du LOT 12 |
| Récurrence des réunions | §52 la cite comme évolution future |
| Participants propres aux décisions (§24) | ce sont ceux de leur réunion, plus le responsable — les recopier serait dupliquer (§53.20) |
| Glisser-déposer dans le calendrier | déplacer une réunion demande `meetings.update` : cela se fait depuis sa fiche, où la capacité est vérifiée |
| Export ou impression d'un ordre du jour | aucune capacité au catalogue, aucun document produit |
| Notification « décision enregistrée » | événement de création — DEC-033 §h |

---

## 14. Où en est la Phase 4

| Lot | Objet | État |
| --- | --- | --- |
| LOT 12 | Projets & Tâches — *qui fait quoi, pour quand, où cela en est* | livré |
| **LOT 13** | **Calendrier, réunions, rendez-vous, décisions, actions** | **livré — le Module 03 est complet** |
| LOT 14 | Groupes et vue hiérarchique | à venir |
| LOT 15 | Journal d'activité | à venir |
| LOT 16 | Paramètres | à venir |

---

**ADIKOM PILOT — Rapport 04**

> Une permission qui ne ferme rien n'est pas une permission.
> Consigner ce qui s'est dit n'est pas convoquer ceux qui vont le dire.
> Un travail n'a qu'un état : deux vérités, et l'une finit par mentir.
