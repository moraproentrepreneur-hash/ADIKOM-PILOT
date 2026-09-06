# ADIKOM PILOT

## Présentation du système

**ADIKOM TECHNOLOGIE & TRAVEL**

| | |
| --- | --- |
| **Document** | Présentation générale du système |
| **Date** | 6 septembre 2026 |
| **Destinataires** | Direction d'ADIKOM TECHNOLOGIE & TRAVEL |
| **État du produit** | **En production** — https://adikom-pilot.vercel.app |
| **Période de développement** | 19 août 2026 → 6 septembre 2026 (**19 jours**) |

> Ce document répond à quatre questions : **qu'est-ce qu'ADIKOM PILOT**,
> **pourquoi a-t-il été créé**, **qu'est-ce qui a été réalisé**, et **quelle
> valeur cela apporte à ADIKOM**.
>
> Il ne demande aucune connaissance technique. Tous les chiffres qu'il avance
> sont **vérifiés** et proviennent du système lui-même ou des contrôles exécutés
> contre la production. Aucun n'est estimé.
>
> Un document distinct — le **Guide utilisateur** — explique *comment utiliser*
> le système au quotidien.

---

## Sommaire

| § | Titre |
| --- | --- |
| 1 | [Présentation générale](#1--présentation-générale) |
| 2 | [Contexte](#2--contexte) |
| 3 | [Objectifs](#3--objectifs) |
| 4 | [Vision](#4--vision) |
| 5 | [Architecture générale](#5--architecture-générale) |
| 6 | [Les neuf modules](#6--les-neuf-modules) |
| 7 | [Gestion de location](#7--gestion-de-location) |
| 8 | [Tiers](#8--tiers) |
| 9 | [Facturation](#9--facturation) |
| 10 | [Paiements](#10--paiements) |
| 11 | [Trésorerie](#11--trésorerie) |
| 12 | [Projets et planification](#12--projets-et-planification) |
| 13 | [Utilisateurs, groupes et permissions](#13--utilisateurs-groupes-et-permissions) |
| 14 | [Notifications](#14--notifications) |
| 15 | [Journal d'activité](#15--journal-dactivité) |
| 16 | [Paramètres](#16--paramètres) |
| 17 | [Sauvegarde et restauration](#17--sauvegarde-et-restauration) |
| 18 | [Données de démonstration](#18--données-de-démonstration) |
| 19 | [Sécurité](#19--sécurité) |
| 20 | [Traçabilité](#20--traçabilité) |
| 21 | [Expérience mobile](#21--expérience-mobile) |
| 22 | [Scénarios de démonstration](#22--scénarios-de-démonstration) |
| 23 | [Chiffres clés vérifiés](#23--chiffres-clés-vérifiés) |
| 24 | [Résultats obtenus](#24--résultats-obtenus) |
| 25 | [Fonctionnalités volontairement non développées](#25--fonctionnalités-volontairement-non-développées) |
| 26 | [Perspectives](#26--perspectives) |
| 27 | [Conclusion](#27--conclusion) |

---

# 1 — Présentation générale

**ADIKOM PILOT est le système central de gestion et de pilotage d'ADIKOM
TECHNOLOGIE & TRAVEL.**

Il remplace une gestion dispersée — feuilles de calcul, carnets, échanges — par
un environnement unique où **chaque opération est enregistrée une fois, reliée à
son contexte, et retrouvable**.

![Page d'accueil d'ADIKOM PILOT](CAPTURES/01_Landing_Page.png)

*La page d'accueil publique. Elle ne contient aucune donnée d'ADIKOM : elle
présente le système et donne accès à la connexion. Les trois chiffres affichés —
9 modules ouverts, 171 capacités attribuables, 1 référentiel partagé — sont
vérifiables.*

## Ce qu'il est

C'est un **système strictement interne**. Ses utilisateurs sont les
collaborateurs autorisés d'ADIKOM. Les clients, les fournisseurs et les
partenaires y sont des **données métier**, jamais des utilisateurs : aucun n'a
de compte, et **aucun espace de connexion externe n'existe**.

![Écran de connexion](CAPTURES/02_Connexion.png)

*Deux champs, aucune inscription. « Vous n'avez pas de compte ? Contactez
l'administrateur d'ADIKOM PILOT. »*

## Son état

Le système est **en production**, à l'adresse **https://adikom-pilot.vercel.app**.

Ses **neuf modules sont ouverts**. Plus aucune entrée de navigation ne porte la
mention « à venir ». Il est peuplé d'un jeu de démonstration cohérent,
sauvegardable, restaurable et réinitialisable.

**Il est prêt à être présenté, utilisé et repris.**

---

# 2 — Contexte

## Le point de départ

Avant ADIKOM PILOT, l'activité d'ADIKOM se gérait par des moyens dispersés.
Cette dispersion produit trois difficultés qui se renforcent :

**1. La même information vit à plusieurs endroits.** Un client figure dans un
carnet, dans une feuille de calcul et dans une conversation. Les trois versions
divergent, et personne ne sait laquelle fait foi.

**2. Les liens entre les données se perdent.** Une réparation payée à un
garagiste, un véhicule fourni par un partenaire et une facture reçue de ce même
partenaire existent séparément. Le lien entre eux — celui qui explique pourquoi
on doit tel montant — n'est nulle part.

**3. On ne peut pas répondre à « qui a fait quoi ».** Un tarif a changé, une
facture a été validée, un montant a été modifié : sans trace, la question reste
sans réponse.

## Le besoin

ADIKOM avait besoin d'un système où :

- une donnée est saisie **une fois** et sert partout ;
- une opération financière est **explicable ligne à ligne** ;
- les droits se donnent **précisément**, poste par poste ;
- l'activité laisse une **trace qui ne se réécrit pas**.

## La priorité arrêtée

La **gestion de location de véhicules** a été désignée dès le départ comme la
priorité. Elle constitue le cœur opérationnel d'ADIKOM ; les autres modules
l'entourent et s'appuient sur les mêmes données.

---

# 3 — Objectifs

Quatre objectifs ont été énoncés au lancement. **Les quatre sont tenus.**

## 1. Un cœur de location réellement opérationnel

Pas une maquette : un **cycle complet**, de la réservation à la clôture, avec
des états qui reflètent la réalité du parc à chaque instant.

## 2. Des montants toujours explicables

Une facture, une imputation, un règlement doivent pouvoir être reliés à leur
origine — véhicule, maintenance, location, contrat.

**La règle la plus structurante du projet en découle : une imputation de
maintenance n'est jamais un paiement.**

## 3. Des droits attribués un par un

Consulter, créer, modifier, valider, annuler, archiver, exporter, télécharger,
imprimer : autant de **capacités distinctes**, jamais déduites les unes des
autres.

## 4. Une traçabilité qui ne se réécrit pas

Qui a fait quoi, quand, sur quelle donnée — **y compris le Super Admin**, et
sans possibilité d'effacer la trace.

---

# 4 — Vision

ADIKOM PILOT est conçu pour devenir **progressivement** le système central de
gestion et de pilotage d'ADIKOM.

Trois principes ont gouverné sa construction du premier au dernier jour, et
expliquent l'essentiel de ce qui a été livré.

> **Une règle métier ne s'invente pas.**
> Elle se lit dans la documentation, ou elle se fait trancher — et la décision
> est datée. **41 décisions** ont été consignées ainsi.
>
> **Une protection qui n'existe que dans l'écran n'existe pas.**
> Chaque garde a été éprouvée par appel direct au système, sans passer par aucun
> bouton.
>
> **Une fonctionnalité n'est pas terminée parce que le code compile.**
> Elle l'est quand un contrôle l'a éprouvée sur la production.

Le corollaire de ces principes explique aussi ce qui **n'a pas** été construit :
lorsqu'une règle métier n'était pas arrêtée, le système **refuse plutôt que
d'inventer**. C'est ce qui garantit qu'aucun chiffre affiché n'est une
supposition.

---

# 5 — Architecture générale

## Le projet, vu de haut

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
├── GUIDE UTILISATEUR/    ← le guide destiné aux collaborateurs
└── CAPTURES/             ← les captures de l'interface réelle
```

**La documentation précède le code, et le code ne la contredit pas.** Lorsqu'une
implémentation a révélé une ambiguïté, elle a été signalée et tranchée par une
décision datée — jamais résolue en silence.

## Les trois couches de sécurité

C'est le principe d'architecture le plus important du système.

| Couche | Rôle |
| --- | --- |
| **Interface** | Confort de lecture. Un bouton masqué **n'est pas** une protection |
| **Serveur** | Chaque action vérifie la capacité de son auteur avant d'agir |
| **Base de données** | La barrière décisive, y compris pour un appel direct qui ne passerait par aucun écran |

**Aucune de ces couches ne suffit seule, et aucune ne fait confiance à celle qui
la précède.** C'est ce qui permet d'affirmer qu'un utilisateur ne peut pas
contourner ses droits en contournant l'interface.

## Les fondations techniques

| Élément | Choix |
| --- | --- |
| Interface et serveur | Next.js 16 · React 19 · TypeScript |
| Base de données | PostgreSQL via Supabase |
| Authentification | Supabase Auth — identifiant interne |
| Stockage | Supabase Storage — documents, photos, logo |
| Documents PDF | Contrats, bons de départ, procès-verbaux |
| Exports | Classeurs Excel des listes |
| Style | Design System ADIKOM |
| Versionnement | GitHub |
| Déploiement | Vercel — production automatique |

**Aucun secret ne figure dans le dépôt.** Clés, chaîne de connexion et jetons
vivent exclusivement dans des variables d'environnement.

---

# 6 — Les neuf modules

Les neuf modules prévus sont **ouverts et livrés**.

![Interface complète et navigation](CAPTURES/03_Tableau_de_Bord.png)

*La navigation complète, à gauche : les neuf modules et leurs menus. Elle
n'affiche à chaque collaborateur que ce qu'il a le droit de consulter.*

| # | Module | Menus livrés |
| --- | --- | --- |
| **01** | **Tableau de bord** | Indicateurs d'exploitation, parc, créances, dettes |
| **02** | **Centre de notifications** | Veille par famille et par niveau |
| **03** | **Projets & Planification** | Projets · Tâches · Calendrier · Réunions · Rendez-vous · Actions · Décisions |
| **04** | **Tiers** | Clients · Fournisseurs · Partenaires |
| **05** | **Gestion de location** | Tableau de location · Réservations · Locations · Parc · Tarification · Dommages & Incidents · Maintenance |
| **06** | **Banques & Caisses** | Comptes · Écritures · Virement interne |
| **07** | **Facturation & Paiement** | Factures clients · Factures fournisseurs · Imputations · Paiements divers |
| **08** | **Utilisateurs & Groupes** | Utilisateurs · Groupes · Vue hiérarchique · Journal d'activité |
| **09** | **Paramètres** | Entreprise · Numérotation · Sauvegarde |

---

# 7 — Gestion de location

**C'est le cœur du système**, et la priorité arrêtée dès le départ.

## Le cycle

```
Réservation → Préparation → Départ → Location en cours → Retour → Contrôle → Clôture
```

> **Chaque flèche est un acte distinct**, soumis à sa propre autorisation et
> **refusé par le système si l'état précédent n'est pas atteint**. Une location
> ne peut pas « sauter » une étape, même par un appel direct qui contournerait
> l'écran.

## L'écran de travail quotidien

![Tableau de location](CAPTURES/20_Tableau_de_Location.png)

*Ce qui part, ce qui rentre, ce qui est en retard, ce qui attend un contrôle —
en une page. Noter la mention « Aucun montant n'y est calculé » : cet écran sert
l'exploitation, pas la facturation.*

## Le parc automobile

![Parc automobile](CAPTURES/25_Parc_Automobile.png)

*Huit véhicules de démonstration, avec les trois origines réellement gérées :
**Propriété ADIKOM**, **Fourni par un fournisseur**, **Partenariat** — et pour
les deux dernières, le nom du tiers. Les statuts couvrent toute la vie d'un
véhicule : En location, Disponible, En maintenance, Indisponible, Retiré.*

## Trois garanties qui méritent d'être soulignées

### 1. La disponibilité ne se déclare pas, elle se constate

Un véhicule est disponible parce qu'**aucun engagement ne le retient** sur la
période demandée.

> **Deux engagements ne peuvent pas se chevaucher sur le même véhicule.** Cette
> garantie est portée par la base de données elle-même. Même si deux personnes
> confirment deux réservations **au même instant** sur le même véhicule et la
> même période, une seule aboutit.

### 2. Le tarif se verrouille à la confirmation

![Fiche d'une location](CAPTURES/24_Location_Fiche.png)

*Le bloc « Tarif verrouillé » : le montant (21 250 KMF / jour), **son origine**
(« Remise accordée au client ») et la date de verrouillage. La phrase le dit
exactement : « Repris de la réservation, jamais résolu de nouveau. »*

**Une modification ultérieure du barème ne réécrit pas un contrat déjà conclu.**
Si ADIKOM révise ses tarifs, les engagements déjà pris gardent le prix convenu.

### 3. Les documents disent l'état réel

Contrat de location, bon de départ et procès-verbal de retour sont produits par
le serveur **à partir des données du dossier**. Ce qui s'affiche à l'aperçu est
exactement ce qui se télécharge et ce qui s'imprime — aucun rendu intermédiaire,
donc aucune divergence possible.

## Incidents et maintenance

![Fiche d'une maintenance](CAPTURES/31_Maintenance_Fiche.png)

*Une maintenance porte son origine (Panne), sa priorité, son état, et **trois
onglets** : Intervention, Coûts, Imputations. L'avertissement jaune rappelle
qu'une intervention ne se termine que si le contrôle après réparation est
satisfaisant.*

Le module **Dommages & Incidents** constate : nature, gravité (*Léger*,
*Moyen*, *Important*), responsabilité (*Client*, *ADIKOM*, *Fournisseur*,
*Indéterminée*), photos.

> **Ce module constate, il ne chiffre pas.** La gravité et la responsabilité ne
> commandent ni coût, ni imputation, ni facturation — parce que les barèmes
> correspondants n'ont pas été arrêtés par ADIKOM. Le chiffrage se fait dans la
> maintenance, sur des coûts réels.

---

# 8 — Tiers

## Un répertoire unique

Clients, fournisseurs et partenaires vivent dans un **répertoire unique** :
fiches complètes, recherche, filtres, export, archivage, historique.

![Liste des clients](CAPTURES/14_Clients.png)

## Les tarifs préférentiels clients

C'est une attente explicite d'ADIKOM, prévue **dès la création de la fiche
client** et accessible depuis elle.

![Tarification d'un client](CAPTURES/16_Client_Tarification.png)

Une règle tarifaire se définit par sa **portée** (tous les véhicules, une
catégorie, un véhicule précis), son **mode** (montant ou remise en pourcentage),
son **unité** (par jour ou forfait) et sa **période de validité**.

**La règle la plus spécifique s'applique automatiquement**, dans cet ordre :

1. Tarif préférentiel du client **sur ce véhicule**
2. Tarif préférentiel du client **sur cette catégorie**
3. Tarif préférentiel du client
4. Tarif standard **du véhicule**
5. Tarif standard **de la catégorie**
6. Tarif standard général

> Au moment de créer une réservation, le système affiche **le montant retenu ET
> la raison qui l'a produit**. Le collaborateur sait toujours *pourquoi* ce prix
> s'applique — il ne le découvre pas sur la facture.

## Les coordonnées de règlement fournisseurs

![Fiche d'un fournisseur](CAPTURES/18_Fournisseur_Fiche.png)

Un fournisseur peut en porter **plusieurs**, dont une principale.

> **C'est une donnée sensible** : sa lecture et son écriture relèvent chacune
> d'une capacité distincte. Voir la fiche d'un fournisseur n'ouvre pas ses
> coordonnées bancaires. Toute modification est journalisée.

## Une règle qui vaut pour tout le module

> **Un tiers ne se supprime pas, il s'archive.** Il n'est plus proposé pour de
> nouvelles opérations, mais son historique reste consultable et les documents
> qui le citent restent justes.

---

# 9 — Facturation

## La règle centrale : imputation ≠ paiement

C'est **le mécanisme le plus spécifique à ADIKOM**, et celui qui a le plus
structuré la conception du système.

Un fournisseur met un véhicule à disposition. Le véhicule tombe en panne pendant
son exploitation. ADIKOM répare. **Le coût de la réparation peut être imputé sur
la facture du fournisseur.**

```
Facture fournisseur (montant brut)     500 000 KMF
  − Imputation de maintenance          300 000 KMF   ← n'est PAS un paiement
  = Net à payer                        200 000 KMF
  − Règlement effectué                 120 000 KMF   ← EST un paiement
  = Reste dû                            80 000 KMF
```

Le système conserve ces **cinq grandeurs séparément**, et chaque imputation
reste identifiable, rattachée à sa maintenance, à son véhicule et à son
fournisseur.

![Liste des factures fournisseurs](CAPTURES/40_Factures_Fournisseurs.png)

*Le bandeau pose la règle en toutes lettres. Les colonnes la mettent en œuvre :
**Montant brut**, **Imputé**, **Net à payer**, **Reste dû** — quatre grandeurs
distinctes, jamais confondues.*

![Fiche d'une facture fournisseur](CAPTURES/41_Facture_Fournisseur_Fiche.png)

*Et la fiche les décompose, chacune avec son explication. Plus bas, le bloc
« Imputations portées par cette facture » — sous-titré **« Pourquoi le montant
dû a été réduit »** — cite l'imputation, sa maintenance et son véhicule.*

> **L'enjeu, en une phrase :** un système qui confondrait imputation et paiement
> annoncerait une dette de **500 000 KMF** là où ADIKOM en doit **80 000**.

## Le mécanisme d'imputation

![Fiche d'une imputation](CAPTURES/43_Imputation_Fiche.png)

*« Cette imputation est rattachée à une facture fournisseur : elle réduit le net
à payer de cette facture. **Elle n'est pas un paiement** — aucun compte n'a été
mouvementé. » La **chaîne de traçabilité** relie l'imputation à sa maintenance,
à son véhicule et à son fournisseur. Le **montant imputable** affiche son
plafond et ce qu'il en reste.*

Cinq états gouvernent une imputation, et **seul le dernier réduit une dette** :

| État | Effet sur un montant dû |
| --- | --- |
| Brouillon | Aucun |
| À valider | Aucun |
| Validée | **Aucun** — en attente de facture fournisseur |
| **Imputée** | **Prise en compte dans le montant dû** |
| Annulée | Le montant imputable redevient disponible |

**Une imputation ne peut jamais dépasser le montant imputable de sa
maintenance.** Une réparation de 300 000 KMF ne produit pas 400 000 KMF
d'imputations, quel qu'en soit le nombre.

## Les factures

| Objet | Cycle |
| --- | --- |
| **Facture client** | Brouillon → Émise → *(Partiellement payée)* → Payée · Annulée |
| **Facture fournisseur** | Brouillon → En attente → Validée → *(Partiellement payée)* → Payée · Annulée |

> **Une facture émise ne se recalcule pas.** Ses lignes sont figées. Une erreur
> **s'annule et se refait** — elle ne se réécrit pas. C'est une exigence
> comptable, pas une limite technique.

Trois états ne sont **jamais saisis** : *Partiellement payée*, *Payée* et *En
retard*. Le système les calcule à partir des règlements réellement enregistrés
et de la date du jour. Un statut stocké pourrait contredire la somme qui le
dit — il suffirait d'un règlement annulé.

## Statistiques et rapports

![Statistiques de facturation](CAPTURES/39_Statistiques_Clients.png)

*Par période et par grain, avec la chaîne complète **brut → imputé → payé →
reste dû**.*

---

# 10 — Paiements

## Combien de gestes pour chaque opération ?

Cette distinction n'a pas été inventée : elle a été **lue dans le catalogue des
permissions**. Les opérations qui portent une capacité de validation se valident
en deux temps ; celles qui n'en portent pas **constatent un fait déjà survenu**.

| Opération | Gestes | Raison |
| --- | --- | --- |
| **Règlement client** | **Un** | Il constate un encaissement **déjà survenu** |
| **Règlement fournisseur** | **Un** | Même raison |
| **Virement interne** | **Deux** | Les fonds ne bougent qu'à la validation |
| **Paiement divers** | **Deux** | Même raison |

## Les paiements divers

![Paiements divers](CAPTURES/44_Paiements_Divers.png)

Des décaissements sans facture — frais administratifs, petite dépense,
prestation ponctuelle — saisis **puis** validés. Tant qu'ils sont en brouillon,
**aucun fonds n'est sorti**.

## Ce qu'un règlement produit

Tout règlement validé produit automatiquement une **écriture de trésorerie** sur
le compte concerné, qui en reprend le compte, le montant et le sens.

> **Un versement supérieur au solde d'une facture client est refusé, avec son
> motif.** La règle du trop-perçu n'a pas été arrêtée par ADIKOM : le système
> préfère refuser plutôt qu'inventer une avance qui n'a pas de statut.

---

# 11 — Trésorerie

## Comptes et écritures

![Liste des comptes](CAPTURES/32_Comptes.png)

Comptes bancaires et caisses, avec leur solde. **Le solde n'est jamais saisi :
il est calculé sur les écritures.**

![Écritures](CAPTURES/34_Ecritures.png)

*Chaque écriture porte sa date, son compte, son sens (Entrée / Sortie), son
montant signé, sa nature et **l'opération qui l'a produite**.*

> **Une écriture ne s'écrit jamais à la main.** Elle naît toujours d'une
> opération — un règlement, un virement, un paiement divers — et elle en reprend
> obligatoirement le compte, le montant et le sens. **Le système refuse
> autrement.**
>
> C'est ce qui garantit qu'un solde est toujours **explicable ligne à ligne**.

## Le virement interne

![Fiche d'un virement](CAPTURES/36_Virement_Fiche.png)

*« **Aucun fonds déplacé** : les écritures naissent à la validation. » Le bloc
« Écritures produites » est vide tant que le virement est en brouillon.*

À la validation, le système contrôle le solde puis produit **deux écritures
liées** — une sortie sur le compte source, une entrée sur le compte destination.

> **Jamais l'une sans l'autre.** La base vérifie cette parité au moment de
> valider la transaction : **un virement à moitié écrit n'existe pas**. Si l'une
> des deux échoue, aucune n'est enregistrée.

## Les montants

**Aucun calcul flottant.** Tous les montants sont des entiers de francs
comoriens. Un arrondi silencieux sur une facture est une erreur comptable, pas
une approximation d'affichage.

---

# 12 — Projets et planification

Le module couvre la **vie interne d'ADIKOM** plutôt que son activité
commerciale : projets, tâches, réunions, rendez-vous, décisions et actions.

![Liste des projets](CAPTURES/05_Projets.png)

## Ce qui est livré

| Objet | Ce qu'il porte |
| --- | --- |
| **Projets** | Responsable, membres, échéances, **avancement calculé sur les tâches** |
| **Tâches** | Rattachées à un projet **ou indépendantes** |
| **Calendrier** | Superpose échéances, réunions et rendez-vous — quatre vues |
| **Réunions** | Ordre du jour, participants, compte rendu |
| **Rendez-vous** | Rattachables à un client, un fournisseur ou un partenaire |
| **Décisions** | Les arbitrages consignés |
| **Actions** | Issues d'une réunion ou d'une décision |

![Calendrier](CAPTURES/08_Calendrier.png)

*Trois couches superposées, chacune gouvernée par sa propre autorisation. Une
couche fermée est **nommée** sur l'écran, plutôt que silencieuse — sans quoi une
semaine vide se confondrait avec une semaine sans droit de lecture.*

## Deux principes gouvernent le module

> **Une action sans origine n'est pas une action : c'est une tâche.**
> Une action prolonge une réunion ou une décision, et en garde le lien. Le
> système l'impose.
>
> **Une action transformée en tâche gèle son propre état.**
> À partir de la transformation, la tâche porte le suivi et l'action conserve la
> trace de ce qui a été décidé. Deux états pour un même travail finiraient par
> diverger.

---

# 13 — Utilisateurs, groupes et permissions

## La structure

```
Utilisateur → Groupe → Module → Menu → Sous-menu → Action
```

Un collaborateur reçoit des capacités par ses **groupes**, et peut en recevoir
individuellement. **Le catalogue compte 171 capacités.**

![Permissions d'un utilisateur](CAPTURES/48_Utilisateur_Permissions.png)

*L'arborescence complète, module par module. Pour chaque capacité : son libellé
en français, son action, son origine (**Hérité d'un groupe**, **Non défini**), et
trois choix — **Non défini** · **Accorder** · **Refuser**. Le compteur en haut
dit l'étendue réelle des droits : « 14 permissions accordées sur 171 ». Un badge
**Sensible** signale les capacités à fort enjeu.*

## La règle qui gouverne le catalogue

C'est la décision la plus structurante du projet, et elle est **permanente**.

> **Aucune fonctionnalité contrôlable par utilisateur n'est implicitement
> autorisée par une autre permission lorsqu'elle peut raisonnablement faire
> l'objet d'une attribution indépendante.**

Concrètement : **consulter, exporter, télécharger et imprimer sont quatre droits
distincts**. Un collaborateur peut légitimement consulter la liste des clients
et l'exporter en tableur, **sans pouvoir en produire un PDF ni l'imprimer**.

Son corollaire est tout aussi important : **une permission ne se crée que si la
fonctionnalité existe réellement**. Le catalogue décrit ce que le système fait,
pas ce qu'un modèle général rendrait imaginable. Deux capacités déclarées sans
objet ont d'ailleurs été **retirées** en cours de projet, et une garde empêche
leur réapparition.

## Le Super Admin

Accès complet, **seul habilité à créer des comptes**, et **ses actions sont
journalisées comme celles de tout le monde**.

> Un utilisateur ne peut **jamais** s'attribuer de droits supplémentaires : le
> système refuse toute modification de ses propres permissions, ou de celles du
> groupe dont il fait partie.

## L'organisation

![Vue hiérarchique](CAPTURES/51_Vue_Hierarchique.png)

*L'organigramme d'ADIKOM, tel que les fiches le décrivent. Le bouclier signale
un Super Admin. La précision en bas est importante : **un département n'accorde
aucun droit** — les permissions relèvent exclusivement des groupes et des règles
individuelles.*

> **Cette vue possède son propre droit**, indépendant de celui des utilisateurs.
> Une personne peut consulter l'organigramme sans avoir accès aux fiches
> individuelles.

---

# 14 — Notifications

![Centre de notifications](CAPTURES/04_Notifications.png)

Le centre de notifications **ne stocke rien**. Il **lit la situation** et
signale ce qui appelle une attention : retours attendus, retards, échéances de
factures, maintenances ouvertes, documents de véhicule qui expirent, réunions et
rendez-vous à venir.

**Onze familles** de situations sont surveillées, réparties sur trois modules :
Gestion de location, Facturation & Paiement, Projets & Planification.

## Quatre niveaux

**Urgent** · **Important** · **À surveiller** · **Rappel**

Chaque niveau porte **un mot**, pas seulement une couleur : la présentation ne
dépend jamais de la seule perception des teintes.

## Deux propriétés

> **Une notification cesse d'exister quand sa cause disparaît.** Enregistrez le
> retour d'un véhicule, et l'alerte s'efface d'elle-même. Rien à nettoyer.
>
> **On n'est jamais alerté sur ce qu'on n'a pas le droit de voir.** Chaque
> famille dépend de la capacité de lecture correspondante. Et une famille fermée
> est **nommée** sur l'écran : le collaborateur sait qu'une veille existe à
> laquelle il n'a pas accès, plutôt que de croire que rien ne se passe.

Un **compteur de non-lues** est porté par toutes les pages du système.

---

# 15 — Journal d'activité

![Journal d'activité](CAPTURES/52_Journal_d_Activite.png)

Le journal répond à **six questions** : qui, quoi, quand, sur quelle donnée,
avant, après.

Il enregistre **dix-neuf types d'action** : créations, modifications,
validations, annulations, archivages, changements de permissions, de statuts, de
tarifs, de fournisseurs, paiements, virements, imputations, connexions, échecs
de connexion, déconnexions, exports — **et les refus d'accès**.

![Détail d'un événement](CAPTURES/53_Journal_Detail.png)

*La situation avant et après, champ par champ, avec les noms en français.*

## Deux propriétés le rendent digne de confiance

> **1. Il ne se réécrit pas.** Aucune modification, aucune suppression, quel que
> soit le rôle. **Une réinitialisation complète du système le laisse intact** :
> c'est lui qui en garde la trace.
>
> **2. Le lire n'ouvre pas le système.** Le droit de consulter le journal donne
> accès à l'**événement** — qui, quoi, quand, avec quel résultat. Il ne donne
> **pas** accès à la **donnée métier** : la situation avant/après reste derrière
> le droit de lecture de l'objet concerné.
>
> Sans cette distinction, une seule permission aurait rendu lisible
> l'intégralité du système.

Un événement dont l'auteur n'existe plus reste lisible : le journal affiche
*« Compte supprimé »*, **et l'événement demeure**.

---

# 16 — Paramètres

![Paramètres — Entreprise](CAPTURES/54_Parametres_Entreprise.png)

La configuration générale d'ADIKOM, **définie une fois et reprise partout** :
identité, coordonnées, informations administratives, coordonnées bancaires,
mentions de facturation, identité visuelle, devise, fuseau horaire, format de
date.

## Trois sections ont leur propre capacité

**Administratif**, **Banque** et **Identité visuelle**.

> Un collaborateur chargé de mettre à jour l'adresse d'ADIKOM n'a aucune raison
> de lire ses coordonnées bancaires. **Le contrôle est appliqué colonne par
> colonne** dans la base ; l'écran ne fait que le refléter — et il **le dit**
> lorsqu'une section reste fermée.

## La numérotation

![Paramètres — Numérotation](CAPTURES/55_Parametres_Numerotation.png)

Les règles de numérotation — préfixe, année, séparateur, nombre de chiffres,
remise à zéro annuelle — sont **modifiables sans redéploiement**, avec un aperçu
du prochain numéro.

> **Le compteur, lui, ne l'est pas : un numéro déjà émis ne se réutilise
> jamais.**

---

# 17 — Sauvegarde et restauration

![Paramètres — Sauvegarde](CAPTURES/56_Parametres_Sauvegarde.png)

**Paramètres → Sauvegarde**, réservé au Super Admin.

## Les trois actes

**A. Télécharger une sauvegarde** — un fichier JSON versionné et daté, contenant
les données métier des neuf modules et la configuration de l'entreprise. Nom
explicite : `adikom-pilot-sauvegarde-AAAA-MM-JJ.json`.

**B. Réinitialiser le système** — la suppression des données métier, **en une
seule opération** : si une partie échoue, **rien** n'est supprimé. La base ne
reste jamais à moitié réinitialisée.

**C. Restaurer une sauvegarde** — la réécriture des données depuis un fichier,
également en une seule opération.

## La garantie centrale : le Super Admin n'est dans aucun périmètre

Ce n'est pas une précaution d'exécution, c'est une propriété de la **liste** des
données concernées.

**Les comptes n'y figurent pas.** Ni les groupes, ni les rattachements, ni les
permissions, ni le journal d'activité. **Aucune des trois opérations ne lit, ne
supprime ni n'écrit un compte.**

> **Aucun fichier ne peut retirer au Super Admin sa capacité à se connecter.**
> Un contrôle automatisé le vérifie plutôt que de le promettre : il échoue si
> les comptes entrent un jour dans ce périmètre.

## Ce qu'une réinitialisation efface, et ce qu'elle laisse

| Effacé | **Conservé** |
| --- | --- |
| Tiers, parc, tarifs | **Le compte Super Admin et sa connexion** |
| Réservations, locations, états des lieux | Tous les autres comptes et leurs droits |
| Incidents, maintenances, coûts | Groupes, départements, catalogue des permissions |
| Factures, imputations, règlements | Paramètres d'entreprise et numérotation |
| Comptes, écritures, virements, paiements | **Le journal d'activité** |
| Projets, tâches, réunions, décisions, actions | |

## Un fichier n'est jamais cru sur parole

Avant toute écriture, la restauration vérifie que le fichier est un JSON, que
son format est celui d'ADIKOM PILOT, que sa version est lisible, et que **chaque
section désigne une donnée du périmètre**. Un fichier contenant des comptes, des
permissions ou le journal est **refusé, avec son motif** — il n'est pas ignoré
en silence.

Ensuite, les contrôles de cohérence s'appliquent tous. **Un fichier incohérent
échoue, et rien n'est modifié.**

## Trois barrières

1. L'onglet n'est affiché qu'au Super Admin — confort de lecture.
2. Le serveur revérifie le statut à chaque appel.
3. La base revérifie encore, et **l'exécution de ces opérations est retirée à
   tous les rôles applicatifs** : aucun jeton d'utilisateur ne les atteint.

## Aucune permission n'a été créée

Réinitialiser efface l'activité entière d'ADIKOM ; restaurer la réécrit. **Aucun
de ces gestes ne se délègue à un poste.** Une capacité qui ne serait jamais
attribuée à personne n'en est pas une : le catalogue reste à **171**.

---

# 18 — Données de démonstration

Un jeu de données cohérent couvre les neuf modules, destiné à **présenter le
système en fonctionnement plutôt qu'à le montrer vide**.

## Ce qu'il contient

| Domaine | Contenu |
| --- | --- |
| **Tiers** | 6 clients (actif, prospect, inactif), 4 fournisseurs, 3 partenaires, coordonnées de règlement |
| **Parc** | 4 catégories, 8 véhicules — propriété, mis à disposition, partenariat ; disponibles, loués, indisponible, sorti du parc |
| **Tarification** | Tarifs standards par catégorie, tarif préférentiel client, tarif négocié |
| **Location** | 6 réservations (en attente, confirmée, convertie, annulée), 3 locations (en cours, en retard, clôturée), états des lieux |
| **Incidents & maintenance** | 2 incidents avec dommages, 2 maintenances dont une terminée, chiffrée et imputée |
| **Facturation** | 3 factures fournisseurs (brouillon, partiellement réglée, soldée), 4 factures clients (brouillon, émise, partiellement réglée, échue impayée) |
| **Trésorerie** | 3 comptes (2 banques, 1 caisse), 2 virements, 3 paiements divers, 8 écritures |
| **Projets** | 3 projets, 9 tâches, 2 réunions dont une tenue avec compte rendu, 2 rendez-vous, 2 décisions, 3 actions |
| **Utilisateurs** | 3 comptes de démonstration rattachés à leurs groupes et départements |

**Le scénario central d'ADIKOM y figure en entier** — voir §22.

## Comment il est construit

> **Par les fonctions de l'application, jamais par des insertions sauvages.**
>
> Chaque acte passe par la fonction prévue — confirmer une réservation,
> enregistrer un règlement, valider une imputation — et subit donc **toutes** les
> règles de cohérence. Un jeu de démonstration fabriqué en contournant les
> règles montrerait un système qui n'existe pas.

**Reproductible et réversible.** Le jeu peut être reposé sans produire de
doublon, et retiré exactement — reconnu par un marqueur, en respectant l'ordre
des dépendances. Il **refuse de détruire une donnée réelle** qui s'appuierait
dessus, en le signalant.

## Ce que les comptes de démonstration ne sont pas

Ils peuplent le module Utilisateurs, l'arborescence des permissions et
l'organigramme.

> **Ils n'ouvrent aucun accès** : leur mot de passe est aléatoire, n'est affiché
> nulle part, et le changement obligatoire est activé.

---

# 19 — Sécurité

## Ce qui est en place

| Mesure | Portée |
| --- | --- |
| **Sécurité au niveau des lignes** | Sur **toutes** les tables, sans exception |
| **Capacité vérifiée deux fois** | Par le serveur, puis par la base |
| **Aucune fonction privilégiée pour le métier** | Une fonction métier s'exécute avec les droits de son appelant : elle ne peut rien lui accorder de plus |
| **Droits d'exécution retirés par défaut** | Sur toutes les fonctions ; accordés nommément aux seuls rôles concernés |
| **Suppression interdite** | Les données métier s'archivent |
| **Journal inviolable** | Le journal refuse toute modification et toute suppression, quel que soit le rôle |
| **Effacement en masse retiré** | Sur les 44 tables du périmètre de sauvegarde |
| **Secrets hors du dépôt** | Variables d'environnement uniquement |

## Le principe éprouvé, et non supposé

Chaque étape du développement s'est accompagnée d'un **contrôle exécuté contre
la production**, qui ouvre de vraies sessions, avec de vrais profils dotés de
droits précis, et **tente les gestes interdits par appel direct — sans passer par
aucun bouton**.

**C'est la seule façon de prouver que la protection n'est pas dans l'écran.**

Un seul de ces contrôles — celui des frontières de capacités — rejoue à lui seul
**206 vérifications**.

## Les défauts trouvés avant livraison

Onze défauts de sécurité ont été trouvés **avant livraison**, par ces contrôles.
Les plus significatifs :

| Défaut | Ce qu'il aurait permis |
| --- | --- |
| Droits d'exécution accordés à tous | Appeler une opération sensible sans session |
| Suppression possible depuis l'application | Détruire une donnée porteuse d'historique |
| Autorisation d'écriture non liée à l'origine de la ligne | **Annuler l'écriture d'un domaine voisin** — un compte perdant un mouvement sans que rien ne l'explique |
| Motif et référence réécrivables après coup | Un montant juste sous une cause fausse |
| Effacement en masse accordé aux comptes connectés | Contourner l'interdiction de suppression sans déclencher aucune garde |

> Aucun de ces défauts n'aurait été visible à l'écran. Tous ont été trouvés
> parce qu'un contrôle a **tenté le geste interdit** au lieu de vérifier qu'un
> bouton était masqué.

---

# 20 — Traçabilité

La traçabilité d'ADIKOM PILOT ne repose pas seulement sur le journal
d'activité : elle est **inscrite dans la structure des données**.

## Les chaînes préservées

```
Client → Location → Véhicule
Fournisseur → Véhicule
Location → Incident → Maintenance → Coût
Maintenance → Imputation → Facture fournisseur
Facture → Règlement → Écriture de trésorerie
Utilisateur → Groupe → Permissions
```

**Aucune de ces relations n'est contournée pour simplifier l'implémentation.**

Concrètement : depuis une écriture de trésorerie, on remonte au règlement, puis
à la facture, puis à l'imputation, puis à la maintenance, puis au véhicule,
puis au fournisseur. **La chaîne est complète et parcourable dans l'interface.**

![Chaîne de traçabilité d'une imputation](CAPTURES/43_Imputation_Fiche.png)

*Le bloc « Chaîne de traçabilité » d'une imputation : Imputation → Maintenance →
Véhicule → Fournisseur, chaque maillon cliquable.*

## Ce qui garantit la cohérence

> Une écriture de trésorerie **ne peut pas exister sans l'opération qui l'a
> produite**, et elle en reprend obligatoirement le compte, le montant et le
> sens. Le système le refuse autrement.

---

# 21 — Expérience mobile

ADIKOM PILOT est **entièrement utilisable sur téléphone**. L'interface **se
réorganise** au lieu de se réduire.

![Tableau de bord sur téléphone](CAPTURES/58_Mobile_Tableau_de_Bord.png)
![Navigation sur téléphone](CAPTURES/59_Mobile_Navigation.png)

*À gauche : le tableau de bord, indicateurs empilés et entièrement lisibles. À
droite : la navigation complète, avec les mêmes modules que sur ordinateur.*

![Locations sur téléphone](CAPTURES/60_Mobile_Locations.png)

*Une liste devient une suite de cartes autonomes. Aucune information n'est
perdue.*

## Ce qui a été corrigé

Une passe a porté sur **l'ensemble** du système, corrigée **à la source** plutôt
que page par page :

| Correction | Portée |
| --- | --- |
| Habillage unique des boutons | La même définition était recopiée à cinq endroits ; une correction n'en atteignait qu'un |
| Cible tactile de 44 px sur mobile | Tous les boutons et liens d'action |
| Actions de liste agrandies | « Modifier », « Voir la facture », « Marquer comme lu » mesuraient 30 px |
| En-têtes empilés sur mobile | Deux actions et un titre ne tiennent pas sur une rangée étroite |
| Titres coupés aux mots | Une raison sociale d'un seul tenant poussait la page en défilement horizontal |
| Champs à 16 px sur mobile | En dessous, le téléphone zoome et ne revient pas |

## Le logo se laissait écraser

Un contrôle qui **mesure** au lieu de regarder a trouvé que, dans l'en-tête de la
page publique sur écran étroit, le conteneur du logo se comprimait à **37 × 40
pixels** au lieu de 40 × 40. **Le logo officiel était donc déformé**, ce qu'une
règle absolue du projet interdit sans exception.

> Le conteneur ne se comprime plus : **il s'adapte au logo, jamais l'inverse**.

## Ce que le contrôle mesure

1. **Aucun défilement horizontal** — sur 32 écrans et 3 largeurs.
2. **Le centrage réel du libellé** d'un bouton — le centre du contenu comparé au
   centre de la boîte, sur les deux axes, à 2 pixels près.
3. **La hauteur de cible tactile** — dans un contexte réellement tactile.

**329 vérifications, toutes vertes.**

---

# 22 — Scénarios de démonstration

Le système est peuplé de données qui permettent de le montrer **en
fonctionnement**. Voici les parcours à dérouler lors d'une démonstration.

## Scénario 1 — Le scénario central d'ADIKOM

**Véhicule fourni → panne → maintenance → coût → imputation → facture
fournisseur → paiement → trésorerie**

C'est celui qui démontre la règle la plus spécifique du système.

| Étape | Où le montrer | Ce qui se voit |
| --- | --- | --- |
| **1. Le véhicule** | Parc automobile | *DEMO VEHICULE DEMO 02*, origine **« Fourni par un fournisseur »**, rattaché à FOURNISSEUR DEMO 01 |
| **2. La panne** | Maintenance | Une intervention d'origine **Panne**, priorité **Urgente** |
| **3. Le coût** | Maintenance → onglet Coûts | Le chiffrage de la réparation |
| **4. L'imputation** | Imputations | **300 000 KMF**, état *Imputée*, et la chaîne de traçabilité complète |
| **5. La facture** | Factures fournisseurs | **500 000** brut · **300 000** imputés · **200 000** nets · **80 000** restant dus |
| **6. Le règlement** | Écritures | L'acompte de **120 000 KMF** et l'écriture de sortie qu'il a produite |

![Fiche d'une facture fournisseur](CAPTURES/41_Facture_Fournisseur_Fiche.png)

*L'écran qui résume tout le scénario. Cinq grandeurs, cinq explications.*

> **Le point à faire passer :** l'imputation de 300 000 KMF **n'a mouvementé
> aucun compte**. Elle a réduit ce qu'ADIKOM doit. Le règlement de 120 000 KMF,
> lui, a débité un compte et produit une écriture. **Deux natures d'opération,
> jamais confondues.**

## Scénario 2 — Le cycle complet d'une location

| Étape | Ce qui se voit |
| --- | --- |
| **Réservation** | Client, période, catégorie — *« Aucun tarif n'est encore verrouillé »* |
| **Confirmation** | Le véhicule est engagé **et le tarif est verrouillé** |
| **Départ** | État des lieux : kilométrage, carburant en crans, photos |
| **Suivi** | Le tableau de location montre ce qui est en retard |
| **Prolongation** | Nouvelle date, motif — **le tarif ne change pas** |
| **Retour** | État des lieux de retour |
| **Contrôle** | Départ et retour côte à côte |
| **Facturation** | Les lignes reprennent le tarif verrouillé |
| **Règlement** | Une écriture d'entrée est produite |
| **Clôture** | Le dossier est complet |

![Fiche d'une réservation](CAPTURES/22_Reservation_Fiche.png)
![Fiche d'une location](CAPTURES/24_Location_Fiche.png)

*À gauche : la réservation avant confirmation. À droite : la location, avec son
tarif verrouillé, son origine et le lien vers la réservation d'origine.*

## Scénario 3 — Le virement interne

![Fiche d'un virement](CAPTURES/36_Virement_Fiche.png)

Montrer un virement **en brouillon** : *« Aucun fonds déplacé »*, bloc
« Écritures produites » **vide**. Puis expliquer qu'à la validation, **deux
écritures liées** naissent ensemble — jamais l'une sans l'autre.

## Scénario 4 — Réunion → décision → action

![Fiche d'une réunion](CAPTURES/10_Reunion_Fiche.png)

Une réunion tenue, son compte rendu, les **décisions** qui en sont issues et les
**actions** qui en découlent — chacune gardant le lien vers son origine.

> **Le point à faire passer :** une action sans origine n'est pas une action,
> c'est une tâche. Le système l'impose.

## Scénario 5 — La gouvernance des droits

![Permissions d'un utilisateur](CAPTURES/48_Utilisateur_Permissions.png)

Ouvrir la fiche d'un collaborateur, onglet **Permissions**. Montrer :

- le compteur — **« 14 permissions accordées sur 171 »** ;
- les badges **Hérité** — ce que le groupe apporte ;
- les trois choix — **Non défini · Accorder · Refuser** ;
- le badge **Sensible** sur les capacités à fort enjeu ;
- et la règle : **« Refuser » prime sur toute autorisation héritée**.

> **Le point à faire passer :** consulter, exporter, télécharger et imprimer
> sont **quatre droits distincts**. Cette granularité est ce qui permet de
> confier une liste à quelqu'un sans lui confier le droit d'en sortir un
> document.

## Scénario 6 — Le journal d'activité

![Journal d'activité](CAPTURES/52_Journal_d_Activite.png)

Filtrer par auteur, par module, par action, par résultat. Ouvrir un événement
pour montrer la **situation avant et après**.

> **Le point à faire passer :** le journal est en **écriture seule**. Un
> événement ne se modifie ni ne s'efface, **y compris pour un administrateur**.
> Et il enregistre aussi les **refus**.

## Scénario 7 — La sauvegarde

![Paramètres — Sauvegarde](CAPTURES/56_Parametres_Sauvegarde.png)

Montrer les deux encadrés — **ce que le fichier contient** et **ce qu'il ne
contient pas** — et l'avertissement de confidentialité.

> **Le point à faire passer :** aucun compte, aucune permission, aucun mot de
> passe ne figure dans une sauvegarde. **Aucun fichier ne peut retirer au Super
> Admin sa capacité à se connecter.**

---

# 23 — Chiffres clés vérifiés

Tous les chiffres de cette section proviennent du système ou des contrôles
exécutés contre la production. **Aucun n'est estimé.**

## Le produit

| Indicateur | Valeur |
| --- | --- |
| Modules ouverts | **9 / 9** |
| Entrées de navigation « à venir » | **0** |
| Capacités au catalogue | **171** |
| Écrans | **85** |
| Routes construites | **96** |
| Fichiers source | **289** |
| Migrations de base de données | **75** |

## La méthode

| Indicateur | Valeur |
| --- | --- |
| Décisions métier consignées | **41** |
| Rapports de lot | **9** |
| Lots livrés | **18** |
| Durée de développement | **19 jours** (19 août → 6 septembre 2026) |

## Les contrôles

| Niveau | Couverture |
| --- | --- |
| **Unitaire** | **219 tests** — calculs monétaires, cohérence du catalogue, dates, cartographie de l'audit |
| **Base de données** | **21 séries — 366 vérifications** — schéma, contraintes, déclencheurs, arithmétique financière, droits d'exécution |
| **Production** | **38 séries** — de vraies sessions, de vrais profils, et les gestes interdits tentés par appel direct |
| **Qualité** | Aucune erreur, aucun avertissement |

## La passe finale, exécutée contre la production

Tous ces contrôles ont été rejoués **après le déploiement**, sur
`https://adikom-pilot.vercel.app` et la base réelle.

| Contrôle | Vérifications |
| --- | --- |
| 21 séries de base de données | **366** ✔ |
| Responsive — 32 écrans × 3 largeurs | **329** ✔ |
| Frontières de capacités | **206** ✔ |
| Documents de location | 58 ✔ |
| Maintenance | 54 ✔ |
| Virements · Factures clients | 52 · 52 ✔ |
| Retour de location | 51 ✔ |
| **Sauvegarde** — dont une réinitialisation et une restauration **réelles** | **50** ✔ |
| Imputations | 47 ✔ |
| Incidents | 39 ✔ |
| Factures fournisseurs | 37 ✔ |
| Départs · Règlements clients | 36 · 36 ✔ |
| Réservations · Locations en cours | 35 · 35 ✔ |
| Trésorerie · Locations | 34 · 34 ✔ |
| Tableau de bord | 30 ✔ |
| Coûts de maintenance | 29 ✔ |

### **Total : 1 610 vérifications, toutes vertes.**

Et après la passe, la base a été retrouvée **exactement** dans son état de
départ : **134 lignes métier**, **6 comptes** dont **1 Super Admin**,
**171 permissions**, **aucun résidu**.

---

# 24 — Résultats obtenus

## Ce qui a été livré

**En dix-neuf jours et dix-huit lots**, ADIKOM PILOT est passé d'un dossier de
documentation à un **système en production couvrant les neuf modules prévus**.

Ce qui a été livré n'est pas une maquette :

| Résultat | Preuve |
| --- | --- |
| **Le cycle de location est complet et opposable** | Sept étapes, chacune un acte distinct, refusé si l'étape précédente n'est pas atteinte |
| **Les montants sont explicables ligne à ligne** | Brut, imputé, net, réglé, reste dû — cinq grandeurs séparées, chacune avec son explication à l'écran |
| **Les droits s'attribuent un par un** | 171 capacités, vérifiées en trois endroits indépendants |
| **Le journal d'activité ne se réécrit pas** | Refus de toute modification et de toute suppression, quel que soit le rôle |
| **Le système est utilisable sur téléphone** | 329 vérifications sur 32 écrans et 3 largeurs |
| **Le système est sauvegardable et restaurable** | Réinitialisation et restauration réelles éprouvées sur la production |

## Ce que cela change pour ADIKOM

**1. Une information saisie une fois.** Un client, un véhicule, un fournisseur
n'existent qu'à un seul endroit. Les écrans qui les citent lisent la même
donnée.

**2. Une dette fournisseur toujours juste.** Le système distingue ce qu'ADIKOM
doit de ce qu'ADIKOM a payé, et de ce qu'ADIKOM a déduit. Sur le scénario de
démonstration, la différence entre les deux lectures est de **420 000 KMF** sur
une seule facture.

**3. Une disponibilité de parc opposable.** Deux engagements ne peuvent pas se
chevaucher. Le double engagement d'un véhicule est structurellement impossible.

**4. Des droits qui correspondent aux postes.** Un collaborateur reçoit
exactement ce que son travail exige — pas la catégorie la plus proche.

**5. Une réponse à « qui a fait quoi ».** Le journal répond, y compris pour les
tentatives refusées, et y compris pour le Super Admin.

**6. Un retour en arrière possible.** Une sauvegarde prend quelques secondes et
se restaure intégralement.

---

# 25 — Fonctionnalités volontairement non développées

**Rien de ce qui suit n'est un oubli.** Chaque point a été **écarté par
décision**, faute d'une règle métier arrêtée — parce que l'inventer aurait été
inventer une règle.

## Règles financières en attente d'un arbitrage d'ADIKOM

| Sujet | Situation actuelle |
| --- | --- |
| **Arrondi de la durée facturable** | Aucune durée facturable calculée automatiquement |
| **Traitement du retard** | Le retard est **constaté**, jamais chiffré. Aucune pénalité |
| **Barèmes carburant, kilométrage, dommages** | Aucun écart n'est valorisé |
| **Caution et acompte** | Non gérés comme objets propres |
| **Découvert autorisé** | Aucun contrôle : la règle n'est pas arrêtée |
| **Régime de taxes** | Non appliqué |
| **Trop-perçu client** | Tout versement supérieur au solde est **refusé**, avec son motif |
| **Seuil de validation des imputations** | Non défini |

## Fonctionnalités écartées

| Écarté | Pourquoi |
| --- | --- |
| **Espace client / fournisseur** | Le système est strictement interne |
| **Sauvegarde automatique** | Suppose d'arrêter une fréquence, une rétention et un lieu de stockage |
| **Restauration partielle** | Suppose de décider du sort des données qui référencent ce qui n'est pas restauré |
| **Chiffrement du fichier de sauvegarde** | Aucune règle ne l'exige ; l'écran avertit de sa confidentialité |
| **Écriture de trésorerie libre** (dépôt, retrait, correction) | Figurent au vocabulaire ; aucun acte ne les produit |
| **Rapprochement bancaire, seuils d'alerte** | Rangés « futurs » par la documentation elle-même |
| **Sous-tâches et dépendances entre tâches** | La règle d'avancement reste à arrêter |
| **Documents de projet, commentaires** | Supposent leurs propres capacités et une durée de conservation |
| **Projet confidentiel** | Suppose de décider qui le déclare et qui l'ouvre malgré tout |
| **Historique des notifications** | Suppose de décider quels événements méritent une ligne, pour qui, et pour combien de temps |
| **Export des comptes et permissions** | Ne se restaure pas proprement : un compte vit aussi dans l'authentification |

## Écrans annoncés mais non encore livrés

| Emplacement | Onglets « à venir » |
| --- | --- |
| Fiche client | Réservations · Locations · Documents · Historique |
| Fiche location | Historique |

Ces onglets sont affichés **inertes** : la fiche annonce ce qu'elle contiendra,
plutôt que de laisser croire à un écran défaillant.

## Gestion des partenariats

Le menu **Partenaires** livre le **répertoire**. La gestion du **partenariat**
lui-même — conditions, contrats, projets communs — reste à construire. Le menu
prendra le nom « Partenariats » lorsqu'il le fera.

---

# 26 — Perspectives

## Les arbitrages qui attendent une réponse d'ADIKOM

**Vingt-neuf points** attendent une décision. Aucun automatisme correspondant ne
sera développé sans validation. Les plus significatifs :

1. **Règles de tarification fines** — arrondi de la durée, traitement du retard,
   barèmes carburant / kilométrage / dommages, caution et acompte, période de
   préparation, seuil de validation des imputations.
2. **Découvert autorisé** d'un compte financier.
3. **Régime de taxes applicable.**
4. **Convention de référence des factures**, à valider par le responsable
   comptable et fiscal **avant toute première émission**.
5. **Trop-perçu client** — trancher suppose de décider si une avance devient un
   objet du système.
6. **Séparation saisie / validation des règlements** — décision d'organisation.
7. **Seuil au-delà duquel une facture en retard est « importante ».**
8. **Routage des notifications par responsabilité**, notifications personnelles,
   délais de rappel configurables.
9. **Export, téléchargement et impression des rapports**, de l'organigramme et
   des groupes.
10. **Gel de l'identité d'ADIKOM sur les documents émis** — décision comptable
    autant que technique.

## Six recommandations

**1. Faire trancher les arbitrages financiers en priorité.** Les points 1 à 5
conditionnent la facturation réelle. Tant qu'ils ne sont pas arrêtés, le système
**refuse plutôt que d'inventer** — ce qui est le bon comportement, mais limite
l'usage quotidien.

**2. Sauvegarder avant chaque opération sensible.** La fonction existe et prend
quelques secondes. C'est le seul moyen de revenir en arrière.

**3. Créer les comptes réels et retirer la démonstration.** Le jeu de
démonstration se retire sans toucher au reste, une fois l'environnement validé
par la direction.

**4. Conserver la discipline de la documentation.** Le projet doit une part de
sa solidité au fait qu'aucune règle métier n'a été inventée en silence. *Une
ambiguïté signalée coûte une question ; une ambiguïté résolue au jugé coûte une
donnée fausse qu'on découvre six mois plus tard.*

**5. Conserver la discipline des contrôles.** Deux défauts sérieux du dernier
lot n'ont été trouvés que parce qu'un contrôle empruntait **le chemin réel de
l'utilisateur**. Une fonctionnalité qui compile n'est pas une fonctionnalité qui
marche.

**6. Étendre le journal d'activité au tableau de bord** lorsque ADIKOM le
souhaitera — les données existent, seule la décision d'affichage manque.

## Deux constats techniques restant ouverts

- **Le jour de référence.** Dix contrôles bornent encore leurs périodes sur le
  jour universel plutôt que sur le jour comorien. Ils passent, mais la fragilité
  y dort. Le remède est connu et déjà appliqué ailleurs.
- **L'effacement en masse sur les tables de gouvernance.** Retiré sur les 44
  tables du périmètre de sauvegarde ; les tables de comptes, groupes et
  permissions restent à traiter.

---

# 27 — Conclusion

ADIKOM PILOT est passé, **en dix-neuf jours et dix-huit lots**, d'un dossier de
documentation à un **système en production couvrant les neuf modules prévus**.

Ce qui a été livré n'est pas une maquette :

- **le cycle de location est complet et opposable** ;
- **les montants sont explicables ligne à ligne** ;
- **les droits s'attribuent un par un et se vérifient en trois endroits
  indépendants** ;
- **le journal d'activité ne se réécrit pas**.

Trois principes ont tenu du premier au dernier jour, et expliquent l'essentiel
de ce qui a été construit :

> **Une règle métier ne s'invente pas.** Elle se lit dans la documentation, ou
> elle se fait trancher — et la décision est datée.
>
> **Une protection qui n'existe que dans l'écran n'existe pas.** Chaque garde a
> été éprouvée par appel direct, sans passer par aucun bouton.
>
> **Une fonctionnalité n'est pas terminée parce que le code compile.** Elle
> l'est quand un contrôle l'a éprouvée sur la production.

Ces principes expliquent aussi la liste du §25. Là où une règle manquait,
ADIKOM PILOT **refuse** plutôt que de deviner. C'est ce qui permet d'affirmer
qu'**aucun chiffre affiché par le système n'est une supposition**.

Le système est prêt à être présenté, utilisé et repris.

---

**ADIKOM PILOT**

*SaaS interne de gestion et de pilotage*

**ADIKOM TECHNOLOGIE & TRAVEL**

> Lire d'abord.
> Comprendre ensuite.
> Construire proprement.
> Tester réellement.
> Versionner avec rigueur.
