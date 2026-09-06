# Rapport final — ADIKOM PILOT

**Système interne de gestion et de pilotage — ADIKOM TECHNOLOGIE & TRAVEL**

| | |
| --- | --- |
| **Période de développement** | 19 août 2026 → 6 septembre 2026 |
| **Lots livrés** | 18 |
| **Modules ouverts** | 9 sur 9 |
| **État** | En production — https://adikom-pilot.vercel.app |
| **Dernier commit déployé** | `7ec80bd` |

> Ce rapport retrace le projet depuis son lancement. Il est destiné à être lu
> par la direction d'ADIKOM sans connaissance technique, tout en restant assez
> précis pour servir de document de référence à qui reprendra le développement.

---

## 1. Présentation du projet

ADIKOM PILOT est le **système central de gestion et de pilotage d'ADIKOM
TECHNOLOGIE & TRAVEL**. Il remplace une gestion dispersée — feuilles de calcul,
carnets, échanges — par un environnement unique où chaque opération est
enregistrée une fois, reliée à son contexte, et retrouvable.

C'est un **SaaS strictement interne**. Ses utilisateurs sont les collaborateurs
autorisés d'ADIKOM. Les clients, fournisseurs et partenaires y sont des
**données métier**, jamais des utilisateurs : aucun d'eux n'a de compte, et
aucun espace de connexion externe n'existe.

La priorité arrêtée dès le départ était la **gestion de location de véhicules**.
Elle constitue le cœur opérationnel du système ; les autres modules l'entourent
et s'appuient sur les mêmes données.

---

## 2. Objectifs initiaux

Quatre objectifs, énoncés au lancement et tenus.

**1. Un cœur de location réellement opérationnel.** Pas une maquette : un cycle
complet, de la réservation à la clôture, avec des états qui reflètent la réalité
du parc à chaque instant.

**2. Des montants toujours explicables.** Une facture, une imputation, un
règlement doivent pouvoir être reliés à leur origine — véhicule, maintenance,
location, contrat. La règle la plus structurante du projet en découle : **une
imputation de maintenance n'est jamais un paiement**.

**3. Des droits attribués un par un.** Consulter, créer, modifier, valider,
annuler, archiver, exporter, imprimer : autant de capacités distinctes, jamais
déduites les unes des autres.

**4. Une traçabilité qui ne se réécrit pas.** Qui a fait quoi, quand, sur quelle
donnée — y compris le Super Admin, et sans possibilité d'effacer la trace.

---

## 3. Architecture générale

Le projet est organisé en deux ensembles, volontairement séparés.

```
ADIKOM-PILOT/
├── 00 Documentation/     ← la source de vérité fonctionnelle
│   ├── 01_Vision_et_Objectifs/
│   ├── 02_Architecture_Fonctionnelle/
│   ├── 03_Modules/
│   ├── 04_Workflows/
│   ├── 05_Regles_Metier/
│   ├── 06_Design/
│   ├── 07_References/
│   └── 08_Decisions/     ← le journal des 41 décisions
├── 01_Developpement/
│   └── adikom-pilot/     ← l'application
├── RAPPORTS/             ← 9 rapports de lot
├── CLAUDE.md             ← les règles de développement
└── README.md             ← le cahier des charges fonctionnel
```

**La documentation précède le code, et le code ne la contredit pas.** Lorsqu'une
implémentation a révélé une ambiguïté, elle a été signalée et tranchée par une
décision datée — jamais résolue en silence.

### Les trois couches de sécurité

C'est le principe d'architecture le plus important du projet.

| Couche | Rôle |
| --- | --- |
| **Interface** | Confort de lecture. Un bouton masqué **n'est pas** une protection. |
| **Application (serveur)** | Chaque action vérifie la capacité de son auteur avant d'agir. |
| **Base de données** | Policies RLS et déclencheurs. La barrière décisive, y compris pour un appel direct à l'API qui ne passerait par aucun écran. |

Aucune de ces couches ne suffit seule, et aucune ne fait confiance à celle qui
la précède. C'est ce qui permet d'affirmer qu'un utilisateur ne peut pas
contourner ses droits en fabriquant une requête.

---

## 4. Stack technique

| Élément | Choix | Rôle |
| --- | --- | --- |
| **Interface et serveur** | Next.js 16 · React 19 · TypeScript | Application web, rendu serveur, actions serveur |
| **Base de données** | PostgreSQL via Supabase | Données, règles métier, sécurité au niveau des lignes |
| **Authentification** | Supabase Auth | Connexion par identifiant interne |
| **Stockage** | Supabase Storage | Documents, photos, logo |
| **Documents PDF** | @react-pdf/renderer | Contrats, bons de départ, procès-verbaux |
| **Exports** | ExcelJS | Classeurs des listes |
| **Style** | Tailwind CSS 4 | Design System ADIKOM |
| **Tests** | Vitest · Playwright | Tests unitaires et recettes de production |
| **Versionnement** | GitHub — `moraproentrepreneur-hash/ADIKOM-PILOT` | |
| **Déploiement** | Vercel | Production automatique à chaque `push` sur `main` |

**Les secrets ne figurent nulle part dans le dépôt.** Clés Supabase, chaîne de
connexion et jetons vivent dans les variables d'environnement — locales pour le
développement, configurées dans Vercel pour la production.

---

## 5. Organisation des modules

Les neuf modules prévus sont ouverts. **Plus aucune entrée de navigation ne
porte la mention « à venir ».**

| # | Module | Menus livrés |
| --- | --- | --- |
| 01 | **Tableau de bord** | Indicateurs d'exploitation, parc, créances, dettes |
| 02 | **Centre de notifications** | Veille par famille et par niveau |
| 03 | **Projets & Planification** | Projets · Tâches · Calendrier · Réunions · Rendez-vous · Actions · Décisions |
| 04 | **Tiers** | Clients · Fournisseurs · Partenaires |
| 05 | **Gestion de location** | Tableau de location · Réservations · Locations · Parc · Tarification · Dommages & Incidents · Maintenance |
| 06 | **Banques & Caisses** | Comptes · Écritures · Virement interne |
| 07 | **Facturation & Paiement** | Factures clients · Factures fournisseurs · Imputations · Paiements divers |
| 08 | **Utilisateurs & Groupes** | Utilisateurs · Groupes · Vue hiérarchique · Journal d'activité |
| 09 | **Paramètres** | Entreprise · Numérotation · **Sauvegarde** |

---

## 6. Fonctionnalités livrées, module par module

### 01 — Tableau de bord

Indicateurs recalculés à chaque lecture, **jamais stockés** : une valeur figée
finirait par mentir. Le contenu suit les droits de qui regarde — un utilisateur
sans droits financiers n'y voit aucun montant.

Exploitation (locations en cours, retours attendus, retards), parc (disponible,
loué, en maintenance), créances clients et dettes fournisseurs, avec la part
échue distinguée.

### 02 — Centre de notifications

Une veille construite sur l'**état réel** des données, non sur des messages
stockés : quand la situation se résout, la notification disparaît d'elle-même.
Quatre niveaux — information, rappel, avertissement, urgence — et un compteur de
non-lues porté par toutes les pages.

Chaque famille dépend de la capacité de lecture correspondante : on n'est jamais
alerté sur ce qu'on n'a pas le droit de voir.

### 03 — Projets & Planification

Projets avec responsable, membres, échéances et avancement calculé sur les
tâches. Tâches rattachées à un projet **ou indépendantes**. Calendrier
superposant échéances, réunions et rendez-vous. Réunions avec ordre du jour,
participants et compte rendu. Rendez-vous rattachables à un client, un
fournisseur ou un partenaire. Décisions consignées. Actions issues d'une réunion
ou d'une décision, transformables en tâche lorsqu'un suivi détaillé s'impose.

### 04 — Tiers

Répertoire unique des clients, fournisseurs et partenaires : fiches complètes,
recherche, filtres, export, archivage, historique.

**Tarifs préférentiels clients** — prévus dès la création de la fiche et
accessibles depuis elle : tarif standard par catégorie, tarif négocié par
client, remise, conditions particulières, période de validité. La règle la plus
spécifique s'applique automatiquement au moment de la réservation.

**Coordonnées de règlement fournisseurs** — plusieurs par fournisseur, dont une
principale. Donnée sensible : lecture et écriture soumises à leurs propres
capacités.

### 05 — Gestion de location

Le cœur du système.

```
Réservation → Préparation → Départ → Location en cours → Retour → Contrôle → Clôture
```

Chaque flèche est un **acte distinct**, soumis à sa propre capacité et refusé
par la base si l'état précédent n'est pas atteint. Une location ne peut pas
« sauter » une étape, même par appel direct.

- **Réservations** — création, confirmation avec verrouillage du tarif,
  annulation. Le tarif est figé à la confirmation : il ne bouge plus ensuite.
- **Locations** — départ avec état des lieux et photos, suivi, prolongation,
  retour avec contrôle, clôture après facturation.
- **Parc automobile** — véhicules par origine (propriété ADIKOM, mis à
  disposition par un fournisseur, partenariat), documents, disponibilité,
  historique des rattachements fournisseurs.
- **Disponibilité** — garantie par la base elle-même : deux engagements ne
  peuvent pas se chevaucher sur le même véhicule, quelle que soit la
  simultanéité des saisies.
- **Dommages & Incidents** — constat structuré, gravité, responsabilité, photos.
- **Maintenance** — origine, priorité, devis, décision, coûts, immobilisation,
  clôture.

### 06 — Banques & Caisses

Comptes bancaires et caisses, solde calculé sur les écritures, écritures
rattachées à l'opération qui les a produites, virements internes entre comptes.

**Un virement produit deux écritures liées** — une sortie sur la source, une
entrée sur la destination — et jamais l'une sans l'autre. La base le vérifie au
moment de valider la transaction : un virement à moitié écrit n'existe pas.

### 07 — Facturation & Paiement

- **Factures clients** — préparation en brouillon, lignes (location, service,
  frais, remise), émission, règlements, solde.
- **Factures fournisseurs** — enregistrement, contrôle, validation, règlements.
- **Imputations** — le mécanisme le plus spécifique à ADIKOM (voir §9).
- **Paiements divers** — décaissements sans facture, saisis puis validés.
- **Statistiques et rapports** — par période et par grain, avec la chaîne
  complète brut → imputé → payé → reste dû.

### 08 — Utilisateurs & Groupes

Comptes internes créés **par le seul Super Admin**, mot de passe temporaire à
remplacer à la première connexion, groupes porteurs de capacités, permissions
individuelles, organigramme, et **journal d'activité** consultable.

### 09 — Paramètres

Fiche entreprise (identité, coordonnées, administratif, banque, facturation,
identité visuelle, préférences), règles de numérotation modifiables sans
redéploiement, et **sauvegarde / réinitialisation / restauration** (voir §17).

---

## 7. Utilisateurs, groupes et permissions

### La structure

```
Utilisateur → Groupe → Module → Menu → Sous-menu → Action
```

Un utilisateur reçoit des capacités par ses **groupes**, et peut en recevoir
individuellement. Le catalogue compte aujourd'hui **171 capacités**.

### La règle qui gouverne le catalogue — DEC-024

C'est la décision la plus structurante du projet, et elle est **permanente** :

> Aucune fonctionnalité contrôlable par utilisateur n'est implicitement
> autorisée par une autre permission lorsqu'elle peut raisonnablement faire
> l'objet d'une attribution indépendante.

Concrètement : **consulter, exporter, télécharger et imprimer sont quatre droits
distincts**. Un collaborateur peut légitimement consulter la liste des clients
et l'exporter en tableur, sans pouvoir en produire un PDF ni l'imprimer.

Son corollaire est tout aussi important : **une permission ne se crée que si la
fonctionnalité existe réellement**. Le catalogue décrit ce que le SaaS fait, pas
ce qu'un modèle général rendrait imaginable. Deux capacités déclarées sans objet
ont d'ailleurs été **retirées** en cours de projet, et une garde empêche
désormais leur réapparition.

### Le Super Admin

Accès complet, seul habilité à créer des comptes, et **ses actions sont
journalisées comme celles de tout le monde**. Un utilisateur ne peut jamais
s'attribuer de droits supplémentaires : la base refuse toute modification de ses
propres permissions ou de celles du groupe dont il fait partie.

---

## 8. Sécurité et RLS

### Ce qui est en place

| Mesure | Portée |
| --- | --- |
| **RLS activée** | Sur **toutes** les tables, sans exception |
| **Capacité vérifiée deux fois** | Par l'action serveur, puis par un déclencheur en base |
| **Aucune fonction `SECURITY DEFINER`** pour le métier | Une fonction métier s'exécute avec les droits de son appelant : elle ne peut rien lui accorder de plus |
| **`EXECUTE` retiré à `PUBLIC`** | Sur toutes les fonctions ; accordé nommément aux seuls rôles concernés |
| **Suppression interdite** | Les données métier s'archivent ; seules les opérations d'environnement suppriment |
| **Journal inviolable** | `audit_log` refuse toute modification et toute suppression, quel que soit le rôle |
| **`TRUNCATE` retiré** | Sur les 44 tables du périmètre de sauvegarde (LOT 18) |
| **Secrets hors du dépôt** | Variables d'environnement uniquement |

### Le principe éprouvé, et non supposé

Chaque lot s'est accompagné d'une **recette de production** qui ouvre de vraies
sessions, avec de vrais profils dotés de droits précis, et **tente les gestes
interdits par appel direct à l'API — sans passer par aucun bouton**. C'est la
seule façon de prouver que la protection n'est pas dans l'écran.

`verify:capabilities` — **206 contrôles** — rejoue à elle seule l'ensemble des
frontières de capacités du SaaS.

---

## 9. Gestion financière

### La règle centrale : imputation ≠ paiement

C'est le mécanisme le plus spécifique à ADIKOM, et celui qui a le plus
structuré la conception.

Un fournisseur met un véhicule à disposition. Le véhicule tombe en panne pendant
son exploitation. ADIKOM répare. Le coût de la réparation peut être **imputé**
sur la facture du fournisseur.

```
Facture fournisseur (brut)      1 000 000 KMF
  − Imputation maintenance 1      300 000 KMF   ← n'est PAS un paiement
  − Imputation maintenance 2      200 000 KMF   ← n'est PAS un paiement
  = Net à payer                   500 000 KMF
  − Règlements effectués          200 000 KMF   ← un paiement
  = Solde restant                 300 000 KMF
```

Le système conserve ces cinq grandeurs **séparément**. Chaque imputation reste
identifiable, rattachée à sa maintenance, à son véhicule et à son fournisseur.
Un tableau de bord qui confondrait imputation et paiement annoncerait une dette
de 500 000 là où ADIKOM en doit 300 000 : c'est précisément ce que la recette
vérifie.

### Les montants

**Aucun calcul flottant.** Tous les montants sont des entiers de francs
comoriens. Un arrondi silencieux sur une facture est une erreur comptable, pas
une approximation d'affichage.

### Les chaînes préservées

```
Client → Location → Véhicule
Fournisseur → Véhicule
Location → Incident → Maintenance → Coût
Maintenance → Imputation → Facture fournisseur
Facture → Règlement → Écriture de trésorerie
```

Une écriture de trésorerie ne peut pas exister sans l'opération qui l'a
produite, et elle en reprend obligatoirement le compte, le montant et le sens.
La base le refuse autrement.

---

## 10. Gestion de location

Le cycle est décrit au §6. Trois garanties méritent d'être soulignées.

**1. La disponibilité ne se déclare pas, elle se constate.** Un véhicule est
disponible parce qu'aucun engagement ne le retient sur la période demandée. La
base impose cette exclusion : deux réservations simultanées sur le même véhicule
et la même fenêtre ne peuvent pas aboutir toutes les deux.

**2. Le tarif se verrouille à la confirmation.** La réservation confirmée porte
le montant, l'unité et la règle qui l'a produit. Une modification ultérieure du
barème ne réécrit pas un contrat déjà conclu.

**3. Les documents disent l'état réel.** Contrat de location, bon de départ et
procès-verbal de retour sont produits par le serveur à partir des données du
dossier. Ce qui s'affiche à l'aperçu est exactement ce qui se télécharge et ce
qui s'imprime — aucun rendu intermédiaire, donc aucune divergence possible.

---

## 11. Facturation et paiements

| Objet | Cycle | Nombre de gestes |
| --- | --- | --- |
| Facture client | Brouillon → Émise → (Partiellement payée) → Payée · Annulée | Préparation puis émission |
| Facture fournisseur | Brouillon → En contrôle → Validée → (Partiellement payée) → Payée · Annulée | Enregistrement, contrôle, validation |
| Règlement client | Validé dès sa saisie, annulable | **Un** — il constate un encaissement survenu |
| Règlement fournisseur | Validé dès sa saisie, annulable | **Un** — même raison |
| Virement interne | Brouillon → Validé · Annulé | **Deux** — les fonds ne bougent qu'à la validation |
| Paiement divers | Brouillon → Validé · Annulé | **Deux** — même raison |

Cette distinction n'a pas été inventée : elle a été **lue dans le catalogue des
permissions**. Les opérations qui portent une capacité `validate` se valident en
deux temps ; celles qui n'en portent pas constatent un fait déjà survenu.

**Une facture émise ne se recalcule pas.** Ses lignes sont figées. Une erreur
s'annule et se refait — elle ne se réécrit pas.

---

## 12. Projets et planification

Le module couvre la vie interne d'ADIKOM plutôt que son activité commerciale :
projets, tâches, réunions, rendez-vous, décisions et actions.

Deux principes le gouvernent.

**Une action sans origine n'est pas une action : c'est une tâche.** Une action
prolonge une réunion ou une décision, et en garde le lien. La base l'impose.

**Une action transformée en tâche gèle son propre état.** À partir de la
transformation, la tâche porte le suivi et l'action conserve la trace de ce qui
a été décidé : deux états pour un même travail finiraient par diverger.

---

## 13. Notifications

Le centre de notifications ne stocke rien. Il **lit la situation** et signale ce
qui appelle une attention : retours attendus, retards, échéances de factures,
maintenances ouvertes, réunions à venir.

Conséquence directe : une notification cesse d'exister quand sa cause disparaît.
Ce qui est conservé, c'est **l'état de lecture** — qui a lu quoi, et quand.

L'audience est la **capacité de lecture** dont la notification dépend. On n'est
jamais alerté sur une donnée qu'on n'a pas le droit de consulter.

---

## 14. Journal d'activité

Le journal répond à six questions : **qui, quoi, quand, sur quelle donnée, avant,
après**. Il enregistre les créations, modifications, validations, annulations,
archivages, changements de permissions, paiements, imputations, connexions —
**et les refus**.

Deux propriétés le rendent digne de confiance.

**Il ne se réécrit pas.** Aucune modification, aucune suppression, quel que soit
le rôle — y compris le rôle de service. Une réinitialisation complète du SaaS le
laisse intact : c'est lui qui en garde la trace.

**Le lire n'ouvre pas le SaaS.** La capacité `users.audit.view` donne accès à
l'**événement** — qui, quoi, quand, avec quel résultat. Elle ne donne pas accès
à la **donnée métier** : la situation avant/après reste derrière la capacité de
lecture de l'objet concerné. Sans cette distinction, une seule permission aurait
rendu lisible l'intégralité du système.

---

## 15. Paramètres

La configuration générale d'ADIKOM, définie une fois et reprise partout :
identité, coordonnées, informations administratives, coordonnées bancaires,
mentions de facturation, identité visuelle, devise, fuseau horaire, format de
date.

**Trois sections ont leur propre capacité** — administratif, banque, identité
visuelle. Un collaborateur chargé de mettre à jour l'adresse d'ADIKOM n'a aucune
raison de lire ses coordonnées bancaires. La base l'impose **colonne par
colonne** ; l'écran ne fait que le refléter, et le **dit** lorsqu'une section
reste fermée.

Les **règles de numérotation** sont modifiables sans redéploiement. Le
**compteur**, lui, ne l'est pas : un numéro déjà émis ne se réutilise jamais.

---

## 16. Données de démonstration (LOT 18)

Un jeu de données cohérent couvrant les neuf modules, destiné à présenter le
SaaS en fonctionnement plutôt qu'à le montrer vide.

### Ce qu'il contient

| Domaine | Contenu |
| --- | --- |
| Tiers | 6 clients (actif, prospect, inactif), 4 fournisseurs, 3 partenaires, coordonnées de règlement |
| Parc | 4 catégories, 8 véhicules — propriété, mis à disposition, partenariat ; disponibles, loués, indisponible, sorti du parc |
| Tarification | Tarifs standards par catégorie, tarif préférentiel client, tarif négocié |
| Location | 6 réservations (en attente, confirmée, convertie, annulée), 3 locations (en cours, en retard, clôturée), états des lieux |
| Incidents & maintenance | 2 incidents avec dommages, 2 maintenances dont une terminée, chiffrée et imputée |
| Facturation | 3 factures fournisseurs (brouillon, partiellement réglée, soldée), 4 factures clients (brouillon, émise, partiellement réglée, échue impayée) |
| Trésorerie | 3 comptes (2 banques, 1 caisse), 2 virements, 3 paiements divers, 8 écritures |
| Projets | 3 projets, 9 tâches, 2 réunions dont une tenue avec compte rendu, 2 rendez-vous, 2 décisions, 3 actions |
| Utilisateurs | 3 comptes de démonstration rattachés à leurs groupes et départements |

**Le scénario central d'ADIKOM y figure en entier** : un véhicule mis à
disposition pour 500 000 KMF, une panne, une réparation de 300 000 KMF imputée
sur la facture du fournisseur, un acompte de 120 000 KMF — et un net à payer que
le SaaS sait expliquer ligne à ligne.

### Comment il est construit

**Par les fonctions de l'application, jamais par des insertions sauvages.**
Chaque acte passe par la fonction prévue — confirmer une réservation, enregistrer
un règlement, valider une imputation — et subit donc **toutes** les règles de
cohérence. Un jeu de démonstration fabriqué en contournant les règles montrerait
un système qui n'existe pas.

**Reproductible et réversible.** `npm run demo:seed` est idempotent : relancé, il
n'ajoute aucun doublon. `npm run demo:clean` retire exactement ce qu'il a posé,
reconnu par un marqueur, en respectant l'ordre des dépendances — et **refuse de
détruire une donnée réelle** qui s'appuierait dessus, en le signalant.

### Ce que les comptes de démonstration ne sont pas

Ils peuplent le module Utilisateurs, l'arborescence des permissions et
l'organigramme. **Ils n'ouvrent aucun accès** : leur mot de passe est aléatoire,
n'est affiché nulle part, et le changement obligatoire est activé.

---

## 17. Sauvegarde et restauration (LOT 18)

**Paramètres → Sauvegarde**, réservé au Super Admin.

### Les trois actes

**A. Télécharger une sauvegarde** — un fichier JSON versionné et daté, contenant
les données métier des neuf modules et la configuration de l'entreprise.
Nom explicite : `adikom-pilot-sauvegarde-AAAA-MM-JJ.json`.

**B. Réinitialiser le SaaS** — la suppression des données métier, en **une seule
transaction** : si une partie échoue, rien n'est supprimé. La base ne reste
jamais à moitié réinitialisée.

**C. Restaurer une sauvegarde** — la réécriture des données depuis un fichier,
également en une seule transaction.

### La garantie centrale : le Super Admin n'est dans aucun périmètre

Ce n'est pas une précaution d'exécution, c'est une propriété de la **liste** des
tables concernées.

`app_users` n'y figure pas. Ni les groupes, ni les rattachements, ni les
permissions, ni le journal d'activité. **Aucune des trois opérations ne lit, ne
supprime ni n'écrit un compte.** La capacité du Super Admin à se connecter ne
dépend donc d'aucune d'elles — et aucun fichier JSON ne peut la lui retirer.

La recette le vérifie plutôt que de le promettre : elle échoue si `app_users`
entre un jour dans cette liste.

### Ce qu'une réinitialisation efface, et ce qu'elle laisse

| Effacé | Conservé |
| --- | --- |
| Tiers, parc, tarifs | **Le compte Super Admin et sa connexion** |
| Réservations, locations, états des lieux | Tous les autres comptes et leurs droits |
| Incidents, maintenances, coûts | Groupes, départements, catalogue des permissions |
| Factures, imputations, règlements | Paramètres d'entreprise et numérotation |
| Comptes, écritures, virements, paiements | **Le journal d'activité** |
| Projets, tâches, réunions, décisions, actions | |

Les **compteurs de numérotation ne reculent pas** : un numéro déjà émis ne se
réutilise jamais.

### Un fichier n'est jamais cru sur parole

Avant toute écriture, la restauration vérifie que le fichier est un JSON, que
son format est celui d'ADIKOM PILOT, que sa version est lisible par le système,
et que **chaque section désigne une table du périmètre**. Un fichier contenant
`app_users`, `permissions` ou le journal d'activité est **refusé, avec son
motif** — il n'est pas ignoré en silence.

Ensuite, la base reprend la main : clés étrangères, contraintes et **gardes de
cohérence** s'appliquent toutes. Une écriture doit porter le compte, le montant
et le sens de l'opération dont elle se réclame ; un virement validé porte
exactement ses deux écritures ; une imputation ne dépasse pas son plafond. Un
fichier incohérent échoue, et la transaction entière est annulée.

### Trois barrières

1. L'onglet n'est affiché qu'au Super Admin — confort de lecture.
2. L'action serveur revérifie le statut à chaque appel.
3. La base revérifie encore, et l'exécution des fonctions est **retirée à tous
   les rôles applicatifs** : aucun jeton d'utilisateur ne les atteint. Déclarer
   l'identifiant du Super Admin dans l'appel ne change rien — la recette
   l'éprouve.

### Aucune permission n'a été créée

Réinitialiser efface l'activité entière d'ADIKOM ; restaurer la réécrit. Aucun
de ces gestes ne se délègue à un poste. Une capacité qui ne serait jamais
attribuée à personne n'en est pas une : le catalogue reste à **171**
(décision DEC-041).

---

## 18. Amélioration de la page d'accueil (LOT 18)

La page publique a été reprise **à palette inchangée** — bleu ADIKOM, encre,
gris moyen, blanc, celles de la charte et elles seules.

Ce qui a changé : un en-tête qui suit le défilement, une ouverture plus
affirmée avec trois faits vérifiables (9 modules, 171 capacités, 1 référentiel),
une représentation du **cycle d'une location** en sept étapes, six cartes de
modules réactives, trois principes, une section consacrée à la gouvernance des
droits, un appel final et un pied de page complet. Les animations d'entrée sont
courtes et disparaissent pour qui a demandé moins de mouvement.

**Elle ne promet que ce qui existe.** Chaque module cité est livré, chaque étape
du cycle est réellement franchie par le système, et les seuls chiffres affichés
sont vérifiables. Aucune capture d'écran fabriquée, aucun indicateur inventé.

---

## 19. Responsive mobile (LOT 18)

Une passe sur **l'ensemble** du SaaS, corrigée à la source plutôt que page par
page.

### Ce qui a été corrigé dans les composants partagés

| Correction | Portée |
| --- | --- |
| Habillage unique des boutons (`BUTTON_BASE`) | La même chaîne de classes était recopiée à cinq endroits ; une correction n'en atteignait qu'un |
| Cible tactile de 44 px sur mobile, densité inchangée sur bureau | Tous les boutons et liens d'action |
| Libellé centré sur les deux axes, même à la ligne | Idem |
| Action **compacte** partagée (`ACTION_BASE`) | Les actions de liste — « Modifier », « Voir la facture », « Marquer comme lu » — mesuraient 30 px |
| En-têtes de page et de carte empilés sur mobile | Deux actions et un titre ne tiennent pas sur une rangée à 360 px |
| Titres coupés aux mots | Une raison sociale d'un seul tenant poussait la page en défilement horizontal |
| Navigation mobile : ouverture et fermeture à 44 px | C'est le seul accès à la navigation sur mobile |
| Champs à 16 px sur mobile | En dessous, iOS zoome et ne revient pas |

### Le logo se laissait écraser

Trouvé par la recette, qui **mesure** au lieu de regarder : dans l'en-tête de la
page publique à 360 px, le conteneur du logo se comprimait à **37 × 40** au lieu
de 40 × 40. Le logo officiel était donc **déformé**, ce que la règle absolue
n° 13 interdit sans exception. Le conteneur ne se comprime plus : il s'adapte au
logo, jamais l'inverse.

### La recette mesure trois choses

1. **Aucun défilement horizontal** — sur 32 écrans et 3 largeurs.
2. **Le centrage réel du libellé** — le centre du contenu comparé au centre de
   la boîte, sur les deux axes, à 2 pixels près.
3. **La hauteur de cible tactile** — dans un contexte réellement tactile, sans
   quoi la règle du Design System ne s'appliquerait jamais.

**329 contrôles, tous verts.**

---

## 20. Principales décisions ADIKOM

Quarante et une décisions datées, consignées dans
`00 Documentation/08_Decisions/01_Journal_des_Decisions.md`. Les plus
structurantes :

| Décision | Ce qu'elle a tranché |
| --- | --- |
| **DEC-003** | Page publique institutionnelle, sans aucune donnée métier ni création de compte |
| **DEC-005 · DEC-021 · DEC-023** | Numérotation : formats, préfixes, remise à zéro annuelle |
| **DEC-006** | Les états d'une location et les transitions autorisées entre eux |
| **DEC-010** | Montants en entiers, jamais en flottants |
| **DEC-015** | Portée exacte du « SaaS 100 % interne » |
| **DEC-017** | Une erreur de lecture n'est pas une absence de donnée — elle se dit |
| **DEC-020** | Un utilisateur se désactive, il ne se supprime pas |
| **DEC-022** | Droits d'exécution des fonctions ; refus du `SECURITY DEFINER` pour le métier |
| **DEC-024** | **Attribution indépendante des capacités** — la règle permanente du catalogue |
| **DEC-025** | Fuseau horaire `Indian/Comoro` : le jour est celui d'ADIKOM |
| **DEC-026 · DEC-027 · DEC-028** | Imputation et facture fournisseur : plafond, unicité de référence |
| **DEC-029 · DEC-031** | Règlements : un règlement constate un mouvement effectué |
| **DEC-030** | La facture client ferme le cycle de la location |
| **DEC-038** | Lire le journal d'activité n'ouvre pas la donnée métier |
| **DEC-040** | Virement et paiement divers se saisissent **puis** se valident |
| **DEC-041** | Sauvegarde, réinitialisation et restauration réservées au statut de Super Admin, sans permission déléguable |

---

## 21. Principales corrections de sécurité

Toutes trouvées **avant livraison**, par les recettes.

| Défaut | Ce qu'il permettait | Lot |
| --- | --- | --- |
| `EXECUTE` accordé à `PUBLIC` sur les fonctions | Appeler une opération sensible sans session | DEC-022 |
| Suppression possible depuis l'application | Détruire une donnée porteuse d'historique | DEC-020 |
| Un verrou technique exigeait un droit métier | Refuser un acte légitime au profil qui doit l'accomplir | LOT 6 |
| `UPDATE` sous RLS sans droit de lecture | Une modification qui ne modifiait rien, et ne le disait pas | LOT 7 |
| Une garde de protection lisait à travers RLS | Conclure « aucun » là où il y en avait, et laisser passer | LOT 14 |
| Policy d'écriture non liée à l'origine de la ligne | **Annuler l'écriture d'un domaine voisin** — un compte perdait un mouvement sans que rien ne l'explique | LOT 17 |
| Motif et référence réécrivables après coup | Un montant juste sous une cause fausse | LOT 17 |
| Contrôle de parité lisant un seul fichier | Passer à côté de l'oubli qu'il existe pour rendre bruyant | LOT 17 |
| `TRUNCATE` accordé à `authenticated` | Contourner l'interdiction de suppression sans déclencher aucune garde | LOT 18 |
| Le contexte de restauration restait ouvert | Les gardes de cycle de vie levées au-delà de l'opération | LOT 18 |
| Un refus de la base non journalisé côté serveur | Un défaut réel, invisible au développeur | LOT 18 |

---

## 22. Tests et validations

### Ce qui est éprouvé, et comment

| Niveau | Outil | Ce qu'il couvre |
| --- | --- | --- |
| **Unitaire** | Vitest — 219 tests | Calculs monétaires, parité du catalogue des permissions, dates, cartographie de l'audit |
| **Base** | 21 recettes SQL — **366 contrôles** | Schéma, contraintes, déclencheurs, arithmétique financière, droits d'exécution |
| **Production** | 38 recettes Playwright | De vraies sessions, de vrais profils, et les gestes interdits tentés **par appel direct** |
| **Qualité** | `lint` · `typecheck` · `build` | Aucune erreur, aucun avertissement |

### La leçon la plus utile du dernier lot

Le défaut « `DELETE requires a WHERE clause` » est passé **inaperçu de la recette
SQL et fatal à l'écran**. La raison : les sessions ouvertes par l'application
chargent une extension qui refuse un `DELETE` sans clause `WHERE`, là où une
connexion directe l'accepte.

> **Une recette qui n'emprunte pas le chemin de l'utilisateur ne prouve pas que
> l'utilisateur peut passer.**

### Une seconde leçon, du même lot

Vingt-deux recettes vérifiaient en fin de parcours que « les **trois** clients
DEMO sont intacts ». Le nombre n'était pas la règle : la règle est qu'une
recette ne touche à rien qui ne lui appartienne. Écrit en dur, il a cessé d'être
vrai le jour où la démonstration s'est étoffée.

Ces contrôles prennent désormais une **empreinte avant d'écrire** et comparent la
variation. Ils disent la même chose, et la disent quel que soit le contenu de la
base — donc encore demain. Quatre recettes SQL ont été corrigées de la même
façon, pour la même raison.

---

## 23. Déploiement

```
Développement → GitHub (main) → Vercel → Production
```

Le déploiement se déclenche **automatiquement** à chaque `push` sur `main`.
Aucune migration n'est appliquée par l'application : le schéma évolue uniquement
par migrations versionnées, appliquées explicitement.

| | |
| --- | --- |
| Dépôt | `moraproentrepreneur-hash/ADIKOM-PILOT` |
| Branche de production | `main` |
| URL de production | **https://adikom-pilot.vercel.app** |
| Migrations | **75**, appliquées dans l'ordre |
| Commits | **93** |

**Avant chaque `push`** : vérification des fichiers modifiés, absence de secret,
`lint`, `typecheck`, tests, `build`. **Après chaque `push`** : attente de l'état
`READY` sur Vercel, comparaison du commit déployé au commit local, puis recette
sur la production.

---

## 24. État final du produit

| Indicateur | Valeur |
| --- | --- |
| Modules ouverts | **9 / 9** |
| Entrées de navigation « à venir » | **0** |
| Capacités au catalogue | **171** |
| Migrations de base | **75** |
| Écrans (`page.tsx`) | **85** |
| Routes construites | **96** |
| Fichiers source TypeScript | **289** |
| Tests unitaires | **219** |
| Recettes SQL | **21** — 366 contrôles |
| Recettes de production | **38** |
| Décisions consignées | **41** |
| Rapports de lot | **9** |
| Durée de développement | **19 jours** (19 août → 6 septembre 2026) |

Le SaaS est **utilisable en production**, peuplé d'un jeu de démonstration
cohérent, sauvegardable, restaurable et réinitialisable.

---

## 25. Fonctionnalités volontairement non implémentées

Rien de ce qui suit n'est un oubli : chaque point a été **écarté par décision**,
faute d'une règle métier arrêtée ou parce que l'inventer aurait été inventer une
règle.

| Écarté | Pourquoi |
| --- | --- |
| **Espace client / fournisseur** | Le SaaS est strictement interne (DEC-015) |
| **Sauvegarde automatique** | Suppose d'arrêter une fréquence, une rétention et un lieu de stockage |
| **Restauration partielle** | Suppose de décider du sort des données qui référencent ce qui n'est pas restauré |
| **Chiffrement du fichier de sauvegarde** | Aucune règle ne l'exige ; l'écran avertit de sa confidentialité |
| **Écriture de trésorerie libre** (dépôt, retrait, correction) | Figurent au vocabulaire, aucun acte ne les produit |
| **Rapprochement bancaire, seuils d'alerte** | Rangés « futurs » par la documentation elle-même |
| **Sous-tâches et dépendances entre tâches** | La règle d'avancement reste à arrêter |
| **Documents de projet, commentaires** | Supposent leurs propres capacités et une durée de conservation |
| **Projet confidentiel** | Suppose de décider qui le déclare et qui l'ouvre malgré tout |
| **Historique des notifications** | Suppose de décider quels événements méritent une ligne, pour qui, et pour combien de temps |
| **Export des comptes et permissions** | Ne se restaure pas proprement : un compte vit aussi dans l'authentification |

---

## 26. Arbitrages restant ouverts

Vingt-neuf points attendent une réponse d'ADIKOM. Aucun automatisme
correspondant ne sera développé sans validation. Les plus significatifs :

1. **Règles de tarification fines** — arrondi de la durée, traitement du retard,
   barèmes carburant / kilométrage / dommages, caution et acompte, période de
   préparation, seuil de validation des imputations. *(DEC-008)*
2. **Découvert autorisé** d'un compte financier — aucun contrôle n'est posé
   faute de règle. *(DEC-029 §b)*
3. **Régime de taxes applicable.** *(DEC-014)*
4. **Convention de référence des factures**, à valider par le responsable
   comptable et fiscal avant toute première émission. *(DEC-023 §4)*
5. **Trop-perçu client** — tout versement supérieur au solde est aujourd'hui
   **refusé**, avec son motif. Trancher suppose d'arrêter la règle et de décider
   si l'avance devient un objet du système. *(DEC-031 §b)*
6. **Séparation saisie / validation des règlements** — décision d'organisation.
   *(DEC-029 §c)*
7. **Seuil au-delà duquel une facture en retard est « importante ».**
   *(DEC-033 §b)*
8. **Routage des notifications par responsabilité**, notifications personnelles,
   délais de rappel configurables. *(DEC-033 §h)*
9. **Export, téléchargement et impression des rapports**, de l'organigramme et
   des groupes — supposent de créer les capacités correspondantes.
   *(DEC-034 §h, DEC-037 §a)*
10. **Gel de l'identité d'ADIKOM sur les documents émis** — décision comptable
    autant que technique. *(DEC-039 §f)*

Deux constats techniques restent également ouverts :

- **`current_date` est UTC, le jour d'ADIKOM est comorien.** Dix recettes
  bornent encore leurs périodes sur le jour UTC. Elles passent, mais la même
  fragilité y dort. Le remède est connu et déjà appliqué ailleurs.
- **`TRUNCATE` sur les tables de gouvernance.** Retiré sur les 44 tables du
  périmètre de sauvegarde ; les tables de comptes, groupes et permissions
  restent à traiter.

---

## 27. Recommandations pour la suite

**1. Faire trancher les arbitrages financiers en priorité.** Les points 1 à 5
du §26 conditionnent la facturation réelle. Tant qu'ils ne sont pas arrêtés, le
système refuse plutôt que d'inventer — ce qui est le bon comportement, mais
limite l'usage quotidien.

**2. Sauvegarder avant chaque opération sensible.** La fonction existe et prend
quelques secondes. C'est le seul moyen de revenir en arrière.

**3. Créer les comptes réels et retirer la démonstration.** `npm run demo:clean`
retire le jeu de démonstration sans toucher au reste. À faire une fois
l'environnement validé par la direction.

**4. Conserver la discipline de la documentation.** Le projet doit une part de sa
solidité au fait qu'aucune règle métier n'a été inventée en silence. Une
ambiguïté signalée coûte une question ; une ambiguïté résolue au jugé coûte une
donnée fausse qu'on découvre six mois plus tard.

**5. Conserver la discipline des recettes.** Deux défauts sérieux du dernier lot
n'ont été trouvés que parce qu'une recette empruntait le chemin réel de
l'utilisateur. Une fonctionnalité qui compile n'est pas une fonctionnalité qui
marche.

**6. Étendre le journal d'activité au tableau de bord** lorsque ADIKOM le
souhaitera — les données existent, seule la décision d'affichage manque.

---

## 28. Conclusion

ADIKOM PILOT est passé, en dix-neuf jours et dix-huit lots, d'un dossier de
documentation à un système en production couvrant les neuf modules prévus.

Ce qui a été livré n'est pas une maquette : le cycle de location est complet et
opposable, les montants sont explicables ligne à ligne, les droits s'attribuent
un par un et se vérifient en trois endroits indépendants, et le journal
d'activité ne se réécrit pas.

Trois principes ont tenu du premier au dernier lot, et expliquent l'essentiel de
ce qui a été construit :

> **Une règle métier ne s'invente pas.** Elle se lit dans la documentation, ou
> elle se fait trancher — et la décision est datée.
>
> **Une protection qui n'existe que dans l'écran n'existe pas.** Chaque garde a
> été éprouvée par appel direct, sans passer par aucun bouton.
>
> **Une fonctionnalité n'est pas terminée parce que le code compile.** Elle l'est
> quand une recette l'a éprouvée sur la production.

Le système est prêt à être présenté, utilisé et repris.

---

**ADIKOM PILOT**

*SaaS interne de gestion et de pilotage — ADIKOM TECHNOLOGIE & TRAVEL*

> Lire d'abord.
> Comprendre ensuite.
> Construire proprement.
> Tester réellement.
> Versionner avec rigueur.
