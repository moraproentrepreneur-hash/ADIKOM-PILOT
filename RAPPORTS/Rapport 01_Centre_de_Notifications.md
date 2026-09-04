# Rapport 01 — Centre de notifications

**Projet :** ADIKOM PILOT — SaaS interne de gestion et de pilotage
**Entreprise :** ADIKOM Technology & Travel
**Lot :** LOT 10 — Centre de notifications (Phase 3 — Pilotage, Module 02)
**Décision de référence :** DEC-033
**Date :** 4 septembre 2026
**Commit :** `0b3ae60`
**État :** livré, déployé, recette de production passée

---

## 1. Travail réalisé

Le module 2 — **Centre de notifications** — est ouvert. L'entrée « Notifications »
de la navigation était marquée « à venir » depuis l'Étape 1, et la capacité
`notifications.view` existait au catalogue depuis la migration 007 **sans aucun
contrôle serveur**.

Le Centre répond à la question du `Module 02` §40 :

> « Y a-t-il quelque chose que je dois savoir ou faire maintenant ? »

Ce qui est livré :

| Livrable | Contenu |
| --- | --- |
| **La veille** | 12 familles de situations réelles, dérivées des données des modules |
| **L'écran** `/notifications` | liste priorisée, compteurs, trois filtres, marquage de lecture |
| **L'état de lecture** | par utilisateur, conservé, jamais réécrit |
| **Le compteur** | pastille de navigation sur toutes les pages, calculé côté serveur |
| **L'intégration** | le tableau de bord annonce le nombre de non lues (§33) |

### Le choix structurant : aucune notification n'est stockée

`Module 02` §3 : « une notification doit toujours être liée à un événement réel
du système ; le système ne doit jamais générer artificiellement des
notifications. »

Chaque notification est **refaite à la lecture**, sur les données du module qui
la produit. Une notification stockée devrait être tenue à jour, et **une
notification périmée est une notification fausse** : « le véhicule doit rentrer
aujourd'hui » ne doit pas survivre à son retour.

Trois exigences du module en découlent **sans une ligne de code** :

| Exigence | Comment elle est tenue |
| --- | --- |
| §26 — éviter la surcharge | une situation résolue cesse d'elle-même de dire |
| §27 — déduplication | une situation = une clé = une seule ligne |
| §32 — ne rien supprimer d'important | aucune donnée métier n'est touchée : il n'y a rien à supprimer |

La seule chose stockée est **l'état de lecture** (§19, §24).

---

## 2. Migration

**`20260904000100_centre_de_notifications.sql`** — migration **056**.

### Une table

`public.notification_reads` — `user_id`, `notification_key`, `read_at`.
Clé primaire composée ; aucune autre colonne.

### Huit fonctions, toutes `SECURITY INVOKER`

| Fonction | Rôle |
| --- | --- |
| `notifications_watch()` | la veille : les 12 familles, gardées par leurs capacités |
| `notifications_feed(state, level, source, limit)` | la veille + l'état de lecture, filtrée et ordonnée |
| `notifications_summary()` | total, non lues, et compte par niveau — sans pagination |
| `notification_mark_read(keys[])` | marque les notifications citées, parmi celles que l'appelant voit |
| `notification_mark_all_read()` | « tout marquer comme lu » (§20) |
| `holds_capabilities(codes[])` | vrai si TOUTES les capacités sont détenues — la forme qui répond, à côté de `require_capability` qui refuse |
| `notification_level_rank(level)` | l'ordre de priorité du §25 |
| `notification_vehicle_label(brand, model, plate)` | libellé d'un véhicule joint en LEFT JOIN, `NULL` s'il n'est pas lisible |

### Ce que la migration n'ajoute pas

Aucune table de notifications, **aucun déclencheur de diffusion**, aucun travail
planifié, **aucune permission**. Le catalogue reste à **153**, et la migration le
vérifie elle-même avant de se terminer.

---

## 3. Fichiers

### Créés

| Fichier | Rôle |
| --- | --- |
| `supabase/migrations/20260904000100_centre_de_notifications.sql` | migration 056 |
| `supabase/tests/notifications.sql` | recette de la veille — 15 contrôles |
| `scripts/verify-notifications.mjs` | recette fonctionnelle — 85 contrôles |
| `src/features/notifications/constants.ts` | niveaux, natures, libellés, liens, sources de veille |
| `src/features/notifications/data.ts` | lecture du centre, compteurs, sources fermées |
| `src/features/notifications/actions.ts` | marquer une notification, toutes les notifications |
| `src/features/notifications/read-controls.tsx` | les deux boutons de lecture |
| `src/features/notifications/notifications.test.ts` | tests unitaires du vocabulaire |
| `src/app/(app)/notifications/page.tsx` | l'écran du Centre |

### Modifiés

| Fichier | Modification |
| --- | --- |
| `src/lib/navigation.ts` | « Notifications » passe de `planned` à `ready` |
| `src/components/layout/sidebar.tsx` | pastille de compteur, point discret en mode rétracté |
| `src/app/(app)/layout.tsx` | calcul serveur du nombre de non lues |
| `src/features/dashboard/data.ts` | indicateur des non lues (§33) **et correction du LOT 9** |
| `src/app/(app)/tableau-de-bord/page.tsx` | ligne « N notifications non lues » dans les alertes |
| `supabase/tests/dashboard.sql` | le contrôle « aucune table `notifications` » garde son sens et le dit |
| `scripts/verify-pilotage.mjs` | +2 contrôles ; `notifications.view` ajoutée au profil pilote |
| `scripts/verify-capabilities.mjs` | +17 contrôles, 4 profils de notification, **balayage par marqueur** au nettoyage |
| `package.json` | `db:verify:notifications`, `verify:notifications` |
| `01_Developpement/adikom-pilot/README.md` | scripts, et règle **2 ter** — une veille sans toutes ses lectures se tait |
| `00 Documentation/08_Decisions/01_Journal_des_Decisions.md` | DEC-033 et trois arbitrages ouverts |

### Correction d'un défaut du LOT 9

Le compteur des maintenances ouvertes du tableau de bord lisait une table
`maintenances` — qui **n'existe pas** : elle s'appelle `vehicle_maintenances`.
L'indicateur affichait donc en permanence une erreur de chargement : honnête,
mais fausse, et aucune recette ne la voyait.

La recette du pilotage vérifie désormais qu'**aucun** indicateur n'est en erreur
de chargement pour un pilote complet — le défaut ne peut plus repasser.

### Durcissement du nettoyage des recettes

Un second défaut a été constaté **pendant** ce lot, et corrigé : un `delete`
refusé ne lève rien avec PostgREST — il rend une erreur que les boucles de
nettoyage ignoraient. Une seule suppression manquée retient alors toute une
chaîne : un règlement retient sa facture, la facture retient son fournisseur, et
son compte reste ouvert. Une coupure réseau au milieu de la création d'un profil
laissait de même un utilisateur orphelin, jamais nettoyé parce que jamais
enregistré.

Deux corrections, appliquées à `verify-capabilities` et `verify-notifications` :

1. un **balayage par marqueur** en fin de nettoyage, qui reprend la chaîne de
   dépendances puis **compte et annonce** ce qui subsiste ;
2. un compte de recette **inscrit au registre dès sa création**, avant même son
   profil et ses permissions.

Les résidus constatés ont été supprimés ; le balayage final ne trouve plus rien
(§12).

---

## 4. Règles métier

### 4.1. Les douze familles, et l'origine de leur niveau

Aucun niveau n'est une appréciation : `Module 02` §25 exige qu'il soit
« déterminé par la règle métier concernée ». Chaque famille reprend un **exemple
littéral du §4**.

| Famille | Niveau | Ancrage documentaire |
| --- | --- | --- |
| Véhicule immobilisé pendant une location | **Urgent** | §4.5, mot pour mot |
| Incident avec dommage important sur un véhicule en location | **Urgent** | §4.5 |
| Retour non enregistré (échéance dépassée) | **Important** | §4.4 |
| Véhicule immobilisé (hors location) | **Important** | §4.4 |
| Document de véhicule expiré | **Important** | §4.3/§4.4, précédent du LOT 9 |
| Document proche de l'expiration (≤ 30 j) | **À surveiller** | §4.3, §28 |
| Maintenance en retard (prévue, non engagée) | **À surveiller** | §6, §11 — « notification d'attention » |
| Contrôle de retour à effectuer | **À surveiller** | §9, §4.3 |
| Facture client échue non soldée | **À surveiller** | §12 |
| Facture fournisseur échue non soldée | **À surveiller** | §12, §13 |
| Départ prévu (aujourd'hui ou demain) | **Rappel** | §4.2, §8 |
| Retour prévu (aujourd'hui ou demain) | **Rappel** | §4.2, §9 |
| Maintenance prévue (≤ 7 j) | **Rappel** | §4.2, §28 |

Deux précisions :

- **« Incident important »** (§4.5) se lit sur la gravité **constatée** du
  dommage — `MAJOR`, dont le libellé métier est précisément « Important »
  (migration 036). Un incident sans dommage important reste « à surveiller » :
  aucun incident ne devient urgent par défaut (§25 — « l'interface ne doit pas
  transformer chaque événement en urgence »).
- **« Facture importante en retard »** (§4.4) supposerait un **seuil de montant**
  qu'aucune règle ne fixe. Le niveau retenu est le plus bas des deux lectures
  possibles. Le seuil reste à arbitrer (§8 de ce rapport).

### 4.2. Les horizons ne sont pas choisis

**7 jours** pour une maintenance prévue et **30 jours** pour une échéance
documentaire sont ceux du §28 — le second étant déjà celui du tableau de bord
(`Module 01` §14).

### 4.3. Les bornes de temps sont civiles, sur le fuseau d'ADIKOM

« Aujourd'hui », « demain » et « en retard » se lisent sur `Indian/Comoro`
(DEC-025 §e). Une échéance au 30 n'est pas dépassée le 30, et un départ prévu le
1er à 01:00 aux Comores n'est pas un départ du 31.

Le retard reste **dérivé** de l'heure courante, jamais écrit (DEC-025 §a).

### 4.4. Aucune arithmétique propre

Le montant d'une notification financière vient des fonctions de la facture :

- créance client = `customer_invoice_total` − `customer_invoice_paid`
  (Workflow 08 §21) ;
- dette fournisseur = `supplier_invoice_gross` − `supplier_invoice_imputed` −
  `supplier_invoice_paid` (CLAUDE.md §16).

La veille ne recalcule rien : elle assemble ce que les modules savent dire.

### 4.5. La lecture est un acte explicite

§19 laisse le choix ; le comportement retenu est le marquage **explicite**, tenu
du même paragraphe : « une notification importante ne doit pas disparaître
simplement parce qu'elle a été lue ». Ouvrir la location en retard ne la fait
donc pas taire — c'est l'utilisateur qui déclare l'avoir traitée.

### 4.6. Trois filtres, et aucune période

**État**, **niveau**, **module**. La **période** n'en est pas : la veille ne
décrit que des situations **actuelles**, et « ce mois » n'y aurait aucun sens —
même distinction que DEC-032 §e entre un flux et une situation. La **catégorie**
se confond avec le niveau ; elle n'est pas dédoublée.

---

## 5. Permissions

### Le catalogue ne bouge pas : 153

`notifications.view` — « Consulter ses notifications » — existait depuis la
migration 007. Le LOT 10 lui donne enfin **un contrôle serveur** : cinq fonctions
l'exigent.

### Marquer comme lu n'est pas une capacité de plus

Tenir l'état de lecture **de ses propres** notifications est inhérent à leur
consultation : §19 l'exige de tout utilisateur qui les lit. En créer une seconde
— `notifications.manage`, `.delete` — serait en créer une d'office, ce que
**DEC-024 interdit** tant que la fonctionnalité correspondante n'existe pas.

### Les capacités qui commandent la veille

Aucune n'est créée ; toutes sont exigées **en plus** de `notifications.view` :

| Source | Capacités exigées | Mode |
| --- | --- | --- |
| Départs de réservation | `rental.reservations.view` | — |
| Retours, retards, contrôles | `rental.rentals.view` | — |
| Véhicules immobilisés | `rental.fleet.view` | — |
| Immobilisation pendant une location | `rental.fleet.view` + `rental.rentals.view` | toutes |
| Maintenances | `rental.maintenance.view` | — |
| Incidents en location | `rental.incidents.view` + `rental.rentals.view` | toutes |
| Échéances de documents | `rental.documents.view` **ou** `rental.fleet.view` | l'une |
| Factures clients échues | `billing.customer_invoices.view` + `billing.customer_payments.view` | toutes |
| Factures fournisseurs échues | `billing.supplier_invoices.view` + `billing.imputations.view` + `billing.supplier_payments.view` | toutes |

Le mode « l'une » des documents reprend la policy de la table (migration 008) :
l'écran ne peut pas être plus restrictif que la base sans mentir sur le motif.

---

## 6. Sécurité

### 6.1. Une source non autorisée se tait complètement

`Module 02` §22 : « Permission suffisante ? Oui → Notification. Non → Aucune
notification. » Ni titre, ni objet, ni montant ne franchissent la barrière.

### 6.2. Là où une omission mentirait, la famille exige tout

C'est le point le plus sensible du lot, et il concerne la règle fondatrice
d'ADIKOM (CLAUDE.md §16, §57) :

| Capacités détenues | Résultat |
| --- | --- |
| factures fournisseurs + règlements, **sans** imputations | **silence** — le net vaudrait le brut : 1 000 000 KMF réclamés là où ADIKOM ne doit que 700 000 |
| les trois | la notification annonce le **reste dû** |
| factures clients **sans** règlements | **silence** — une facture soldée se lirait « impayée » |

Une imputation n'est pas un paiement — **et elle ne doit pas non plus pouvoir
être ignorée.**

### 6.3. Mais l'écran dit ce qu'il ne surveille pas

« Aucune notification » et « aucune notification que vous ayez le droit de voir »
ne sont pas la même information (DEC-017). Le Centre nomme les **sources non
surveillées** et les permissions manquantes, sans rien révéler de leur contenu.

### 6.4. L'état de lecture n'est pas un espace d'écriture libre

| Garantie | Mise en œuvre |
| --- | --- |
| Une ligne ne concerne que son propriétaire | RLS en `SELECT` et en `INSERT` (§23, §37) |
| Une lecture ne se réécrit pas, ne s'efface pas | `UPDATE` et `DELETE` retirés au rôle applicatif |
| On ne marque que ce que l'on voit | les fonctions n'acceptent que les clés de la propre veille de l'appelant |
| La table n'est pas un espace de stockage libre | contrainte de forme et de longueur sur la clé |
| Hors session applicative, rien ne se marque | refus explicite : une notification se marque au nom d'un utilisateur |

### 6.5. Doctrine générale respectée

- **Aucun `SECURITY DEFINER`** : les huit fonctions s'exécutent avec les droits
  de l'appelant, RLS comprise (DEC-022).
- **`EXECUTE` retiré à PUBLIC** sur les huit, accordé à `authenticated` et
  `service_role` seulement ; `anon` n'a aucun accès (SaaS strictement interne).
- **`search_path` figé** sur les huit.
- **Aucune écriture** produite par une lecture : la recette compte les écritures
  de trésorerie et les entrées d'audit avant et après.
- **Aucun journal d'audit** sur le marquage de lecture : §31 distingue
  explicitement l'historique des notifications du journal des actions sensibles ;
  l'y inscrire le noierait.
- **Le lien vers l'objet n'est pas un contournement** (§21) : chaque écran de
  destination vérifie de nouveau sa capacité.

---

## 7. Tests

### 7.1. Recettes du lot

| Recette | Contrôles | Résultat |
| --- | --- | --- |
| `npm run db:verify:notifications` | 15 | ✅ tous réussis |
| `npm run verify:notifications` (production) | 85 | ✅ tous réussis |
| `npm run verify:capabilities` | **206** (189 → 206) | ✅ tous réussis |
| `npm run verify:pilotage` (production) | **55** (53 → 55) | ✅ tous réussis |

### 7.2. Ce que la recette SQL éprouve (15 contrôles)

Structure et sobriété des fonctions ; absence de toute table de notifications et
de tout déclencheur de diffusion ; forme contrainte de la clé de lecture ;
gardes lexicales des cinq fonctions et des onze lectures ; les douze familles sur
un jeu de situations réelles ; **la déduplication** (une location en retard n'est
pas aussi un rappel ; un véhicule immobilisé en location n'est pas compté deux
fois) ; les niveaux pris dans la donnée ; les échéances documentaires (proche,
dépassée, archivée, lointaine) ; **l'arithmétique financière** :

```
Facture client        450 000 → 250 000 après 200 000 encaissés
Facture fournisseur 1 000 000 → 700 000 après imputation → 500 000 après règlement
```

Puis l'ordre de priorité, l'exactitude des compteurs, l'application des filtres
en base, le refus de marquer hors session, et **la preuve que rien n'est
stocké** : le retour enregistré, la notification de retard disparaît ; la facture
soldée, la notification d'échéance disparaît ; le véhicule remis en service, son
immobilisation disparaît — sans qu'aucune tâche ne soit venue les fermer.

### 7.3. Ce que la recette fonctionnelle éprouve (85 contrôles)

Les quatorze critères d'acceptation du `Module 02` §39, sur **sept profils** :

| Profil | Ce qu'il éprouve |
| --- | --- |
| `veilleur` | l'écran complet, les montants nets, les liens, le marquage, les filtres |
| `veilleur2` | l'état de lecture est **propre à chaque utilisateur** (§24) |
| `exploitant` | aucune fuite financière, et les sources fermées nommées |
| `dette_aveugle` | sans `imputations.view`, la facture fournisseur est **muette** |
| `creance_aveugle` | sans `customer_payments.view`, la facture client est **muette** |
| `nu` | `notifications.view` seule : l'écran s'ouvre, et il est fermé |
| `sans_acces` | l'écran n'est pas atteignable, et le refus n'expose rien |

S'y ajoutent les contrôles de contournement par **appel direct** : les cinq RPC
refusent sans la capacité ; une clé inventée ne marque rien ; une clé
appartenant à autrui est refusée ; une clé malformée est refusée ; une marque de
lecture ne se réécrit ni ne s'efface ; aucune marque d'autrui n'est lisible.

Et le contrôle du §20 : après « tout marquer comme lu », **aucune notification
n'a disparu** — seul l'état de lecture a changé.

### 7.4. Qualité du code

| Contrôle | Résultat |
| --- | --- |
| `npm run lint` | ✅ 0 erreur, 0 avertissement |
| `npm run typecheck` (`tsc --noEmit`) | ✅ 0 erreur |
| `npm run test` (Vitest) | ✅ 118 tests, 7 fichiers |
| `npm run build` | ✅ succès, route `/notifications` produite |
| `npm run verify` (les quatre enchaînés) | ✅ succès |

---

## 8. Non-régressions

### Recettes de schéma (Supabase Cloud, transaction annulée)

`socle` · `location` · `rental_cycle` · `dashboard` · `customer_invoices` ·
`customer_payments` · `treasury` · `imputations` · `supplier_invoices` ·
`maintenance` · `incidents` · `maintenance_costs` — **toutes vertes, aucun
échec.**

### Recettes fonctionnelles (production)

| Recette | Contrôles | Résultat |
| --- | --- | --- |
| `verify:pilotage` | 55 | ✅ |
| `verify:customer-payments` | 36 | ✅ |
| `verify:customer-invoices` | 52 | ✅ |
| `verify:dashboard` (tableau de location) | 30 | ✅ |
| `verify:treasury` | 34 | ✅ (exécutée avant déploiement) |

### Recettes non exécutées, et pourquoi

`verify:corrections`, `verify:permissions:ui`, `verify:referential:ui`,
`verify:users:ui` et `verify:login` exigent les variables
`ADIKOM_ADMIN_USERNAME` et `ADIKOM_ADMIN_PASSWORD` — **absentes de
l'environnement de cette session**. Elles n'ont donc pas été relancées.

Le risque porté par ces quatre recettes concerne la **barre latérale**, modifiée
par ce lot. Leurs assertions ont été relues : elles s'appuient sur
`aside a[href=…]`, `aside [aria-disabled="true"]` (comptage **strictement
positif**, non exact) et la géométrie de défilement — trois formes que la
modification ne touche pas. La structure du lien, ses classes et son
`aria-current` sont inchangés ; seul un `<span>` enveloppe désormais l'icône.

Ces recettes restent à relancer par ADIKOM avec les identifiants du Super Admin.

---

## 9. GitHub

| Élément | Valeur |
| --- | --- |
| Dépôt | `moraproentrepreneur-hash/ADIKOM-PILOT` |
| Branche | `main` |
| Commit | `0b3ae60` — *feat: le centre de notifications dit ce qui presse, et ce qu il ne voit pas* |
| Poussé | ✅ `e4e7da2..0b3ae60` |
| Vérification | `git rev-parse HEAD` **==** `git rev-parse origin/main` |
| Secrets | ✅ aucun — diff balayée avant le commit |

---

## 10. Vercel

| Élément | Valeur |
| --- | --- |
| Projet | `adikom-pilot` |
| URL de production | https://adikom-pilot.vercel.app |
| État | **READY** |
| SHA déployé | `0b3ae60` — **identique au commit local** |
| Déclenchement | automatique au push sur `main` |

---

## 11. Recette de production

Exécutée **après** l'état `READY`, contre https://adikom-pilot.vercel.app.

| Recette | Contrôles | Résultat |
| --- | --- | --- |
| `verify:notifications` | 85 | ✅ tous réussis |
| `verify:pilotage` | 55 | ✅ tous réussis |
| `verify:customer-payments` | 36 | ✅ tous réussis |
| `verify:customer-invoices` | 52 | ✅ tous réussis |
| `verify:dashboard` | 30 | ✅ tous réussis |
| `verify:capabilities` | 206 | ✅ tous réussis |

**Total : 464 contrôles de production, aucun échec.**

---

## 12. État des données

### Données DEMO

| Contrôle | Attendu | Constaté |
| --- | --- | --- |
| Clients DEMO | 3 | **3** ✅ |
| Véhicules DEMO | 3 | **3** ✅ |
| Catalogue de permissions | 153 | **153** ✅ |

Aucune écriture n'a été produite par la veille : les statuts de location, de
véhicule, de facture client, de facture fournisseur et d'imputation sont
inchangés après consultation.

### Nettoyage des données de recette

Un incident a eu lieu et a été traité : l'exécution de `verify:capabilities`
avait laissé un règlement annulé, sa facture, son fournisseur et son compte
financier — une suppression refusée en avait retenu trois autres. Une coupure
réseau pendant une seconde exécution avait de même laissé un compte utilisateur
orphelin.

Les quatre premières lignes et le compte ont été supprimés, et les deux causes
corrigées dans les recettes (§3). Après correction et nouvelle exécution
complète, le balayage **par marqueur** — et non par identifiants suivis
seulement — ne trouve plus rien :

| Objet | Résidus |
| --- | --- |
| Clients de recette | **0** |
| Fournisseurs de recette | **0** |
| Véhicules de recette | **0** |
| Catégories de recette | **0** |
| Comptes utilisateurs de recette | **0** |
| Comptes financiers de recette | **0** |
| Factures clients de recette | **0** |
| Factures fournisseurs de recette | **0** |
| Marques de lecture (`notification_reads`) | **0** |

Les recettes annoncent désormais elles-mêmes leurs résidus éventuels : une
recette silencieuse sur ce qu'elle laisse n'est pas une recette propre.

---

## 13. Écarts et arbitrages restant ouverts

### Ouverts par ce lot

| Référence | Question |
| --- | --- |
| **DEC-033 §b** | À partir de quel **montant** une facture en retard est-elle « importante » (§4.4) ? Sans seuil, elle est notifiée « à surveiller ». |
| **DEC-033 §h** | Les notifications doivent-elles être **conservées après la disparition de leur cause** (§31, §32) ? Cela suppose de les stocker, donc d'arrêter **quels** événements méritent une ligne, **à qui** elle est nommément destinée, et **quelle durée de conservation** s'applique. |
| **DEC-033 §h** | Les notifications doivent-elles être **routées par responsabilité** (§11, §24) ? L'audience est aujourd'hui la capacité de lecture dont la notification dépend. S'y rattachent les **notifications personnelles** (§23) et les **délais de rappel configurables** (§28, module Paramètres). |

### Étendus par ce lot

| Référence | Question |
| --- | --- |
| **DEC-032 §h** | L'**activité récente** doit-elle figurer au tableau de bord ? La même question vaut désormais pour les notifications d'**information** du §4.1 — « nouvelle réservation », « nouveau client », « véhicule ajouté » — qui sont des événements de création et non des situations, et qui recouvrent le journal d'activité (Phase 4). |

### Inchangés, non touchés par ce lot

| Référence | Question |
| --- | --- |
| **DEC-031 §b** | Que devient un **trop-perçu client** ? Tout versement supérieur au solde reste refusé, avec son motif. |
| **DEC-032 §h** | Le tableau de bord doit-il proposer une **disposition différente selon le métier** ? |
| **DEC-029 §c** | Faut-il séparer la **saisie** et la **validation** d'un règlement ? |
| **DEC-008** | Barèmes, arrondis, seuils — dont le **découvert autorisé** d'un compte financier. |
| **DEC-023 §4** | Validation de la convention de référence des factures avant première émission. |
| **DEC-030 §i** | La facture client doit-elle être remise au client en PDF ? |

### Point d'attention technique

Le compteur de non lues est calculé **à chaque rendu de page** pour les
utilisateurs détenant `notifications.view` : la veille est relue en base. À
l'échelle d'ADIKOM — quelques dizaines de véhicules, quelques centaines de
factures — le coût est négligeable, et la liste est bornée à 200 lignes avec
filtrage en base (§36). Si le volume croissait fortement, la première mesure
serait d'indexer les colonnes de date et de statut interrogées par la veille,
sans changer l'architecture.

---

## 14. Conclusion

Le module 2 est ouvert et opérationnel. Le Centre de notifications ne stocke
aucune notification, ne diffuse rien, n'invente aucun destinataire et ne réclame
jamais un montant qu'une imputation a déjà réduit.

Il tient sa promesse du §40 — **Détecter → Informer → Prioriser → Orienter →
Agir** — pour les seules situations que les données du système permettent
d'établir sans qu'une règle métier soit inventée.

**Prochaine étape prévue par la documentation :** Phase 3 — statistiques et
rapports (`README` §73), dont le périmètre reste à cadrer.

---

**ADIKOM PILOT — Rapport de lot**

> Lire d'abord. Comprendre ensuite. Construire proprement.
> Tester réellement. Versionner avec rigueur.
