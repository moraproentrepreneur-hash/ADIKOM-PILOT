\# ADIKOM PILOT

\## Architecture de navigation



\*\*Version :\*\* 1.0

\*\*Statut :\*\* Document de référence

\*\*Entreprise :\*\* ADIKOM Technology \& Travel

\*\*Projet :\*\* ADIKOM PILOT



\---



\## 1. Objet du document



Ce document définit l’organisation fonctionnelle de la navigation dans ADIKOM PILOT.



Il précise :



\- la structure de la barre latérale ;

\- les modules principaux ;

\- les menus ;

\- les sous-menus ;

\- les principes de navigation ;

\- les règles d’affichage selon les permissions ;

\- les principes de navigation entre les différentes fiches et opérations.



L’objectif est de permettre une navigation claire, cohérente et rapide pour les utilisateurs internes d’ADIKOM.



\---



\## 2. Principe général de navigation



ADIKOM PILOT doit proposer une navigation simple, structurée et cohérente.



L’utilisateur doit pouvoir accéder rapidement aux fonctions dont il a besoin sans être confronté à une interface inutilement complexe.



La navigation principale repose sur une barre latérale.



Cette barre latérale doit être :



\- persistante sur ordinateur ;

\- rétractable ;

\- adaptée aux écrans plus petits ;

\- organisée par modules ;

\- filtrée selon les permissions de l’utilisateur.



\---



\## 3. Structure principale



La navigation principale de référence est la suivante :



ADIKOM PILOT

│

├── Tableau de bord

│

├── Centre de notifications

│

├── Projets \& Planification

│

├── Tiers

│   ├── Clients

│   │   ├── Nouveau client

│   │   └── Liste des clients

│   │

│   ├── Fournisseurs

│   │   ├── Nouveau fournisseur

│   │   └── Liste des fournisseurs

│   │

│   └── Partenariat

│       ├── Nouveau partenariat

│       └── Liste des partenariats

│

├── Gestion de location

│

├── Banques \& Caisses

│   ├── Nouveau compte

│   ├── Liste

│   ├── Liste des écritures

│   └── Virement interne

│

├── Facturation \& Paiement

│   ├── Factures clients

│   │   ├── Nouvelle facture

│   │   ├── Liste

│   │   ├── Règlements

│   │   ├── Statistiques

│   │   └── Rapports

│   │

│   ├── Factures fournisseurs

│   │   ├── Nouvelle facture

│   │   ├── Liste

│   │   ├── Règlements

│   │   ├── Statistiques

│   │   └── Rapports

│   │

│   └── Paiements divers

│

├── Utilisateurs \& Groupes

│   ├── Utilisateurs

│   │   ├── Nouvel utilisateur

│   │   ├── Liste des utilisateurs

│   │   └── Vue hiérarchique

│   │

│   └── Groupes

│       ├── Nouveau groupe

│       └── Liste des groupes

│

└── Paramètres

&#x20;   └── Entreprise



Cette structure constitue la base fonctionnelle de la navigation.



L’interface graphique peut être améliorée ou réorganisée visuellement sans modifier les fonctionnalités prévues.



\---



\## 4. Tableau de bord



Le Tableau de bord constitue la page principale du système après la connexion.



Il doit fournir une vision synthétique adaptée au rôle de l’utilisateur.



Selon les permissions, il peut présenter :



\- indicateurs d’activité ;

\- locations en cours ;

\- réservations ;

\- départs ;

\- retours ;

\- véhicules disponibles ;

\- véhicules en maintenance ;

\- factures ;

\- paiements ;

\- alertes ;

\- notifications ;

\- tâches importantes ;

\- échéances.



Le contenu du tableau de bord doit être contextuel.



Un utilisateur opérationnel ne doit pas nécessairement voir les mêmes informations qu’un Gérant.



\---



\## 5. Centre de notifications



Le Centre de notifications doit être accessible rapidement depuis l’interface principale.



Il doit permettre de consulter :



\- notifications non lues ;

\- notifications lues ;

\- alertes importantes ;

\- échéances ;

\- événements nécessitant une action.



Une notification liée à un élément du système doit pouvoir permettre à l’utilisateur d’accéder directement à cet élément lorsque cela est pertinent.



Exemple :



Notification

&#x20;   ↓

Retour de véhicule prévu aujourd’hui

&#x20;   ↓

Cliquer

&#x20;   ↓

Fiche de la location concernée



\---



\## 6. Projets \& Planification



Le module Projets \& Planification est principalement destiné à l’organisation interne.



Il doit permettre notamment de gérer :



\- projets ;

\- tâches ;

\- échéances ;

\- actions ;

\- réunions ;

\- rendez-vous ;

\- décisions ;

\- suivi.



Ce module doit être particulièrement utile à l’Assistant(e) de direction et à la Direction.



La navigation doit permettre de passer rapidement :



Projet

&#x20;  ↓

Tâches

&#x20;  ↓

Responsables

&#x20;  ↓

Échéances

&#x20;  ↓

Suivi



\---



\## 7. Module Tiers



Le module Tiers centralise les informations concernant les clients, fournisseurs et partenaires.



\### 7.1. Clients



Le menu Clients comprend :



Clients

├── Nouveau client

└── Liste des clients



\#### Nouveau client



La création d’un client doit permettre d’enregistrer les informations nécessaires à son identification et à sa gestion.



Elle doit également prévoir les informations relatives à la tarification.



Un client peut bénéficier de tarifs préférentiels.



La fiche client doit donc permettre de gérer notamment :



\- tarif standard ;

\- tarif préférentiel ;

\- remise éventuelle ;

\- véhicule ou catégorie concernée ;

\- période de validité ;

\- conditions particulières ;

\- statut.



Les conditions tarifaires doivent être accessibles depuis la fiche du client.



\#### Liste des clients



La liste doit permettre de :



\- rechercher un client ;

\- filtrer ;

\- consulter sa fiche ;

\- accéder à son historique ;

\- accéder à ses réservations ;

\- accéder à ses factures ;

\- consulter ses paiements ;

\- consulter ses conditions tarifaires.



La fiche client constitue le point central de toutes les informations relatives au client.



\### 7.2. Fournisseurs



Le menu Fournisseurs comprend :



Fournisseurs

├── Nouveau fournisseur

└── Liste des fournisseurs



La fiche fournisseur doit notamment permettre de retrouver :



\- informations générales ;

\- coordonnées ;

\- véhicules associés ;

\- factures ;

\- paiements ;

\- opérations liées ;

\- éventuelles imputations de maintenance ;

\- historique.



\### 7.3. Partenariat



Le menu Partenariat comprend :



Partenariat

├── Nouveau partenariat

└── Liste des partenariats



La fiche partenariat doit permettre de centraliser les informations relatives à la relation avec le partenaire.



\---



\## 8. Module Gestion de location



La Gestion de location constitue le cœur du MVP.



Elle doit permettre de gérer l’ensemble du cycle de location.



La navigation détaillée du module sera définie dans la documentation spécifique du module de gestion de location.



Le module devra notamment couvrir :



\- parc automobile ;

\- véhicules ;

\- catégories ;

\- disponibilité ;

\- tarification ;

\- réservations ;

\- contrats ;

\- départs ;

\- retours ;

\- états des lieux ;

\- dommages ;

\- maintenance ;

\- assurances ;

\- documents ;

\- kilométrage ;

\- carburant ;

\- dépenses ;

\- rentabilité.



Le module doit être pensé autour du parcours opérationnel :



Client

&#x20;  ↓

Réservation

&#x20;  ↓

Véhicule

&#x20;  ↓

Contrat

&#x20;  ↓

Départ

&#x20;  ↓

Location

&#x20;  ↓

Retour

&#x20;  ↓

Contrôle

&#x20;  ↓

Facturation

&#x20;  ↓

Paiement



\---



\## 9. Module Banques \& Caisses



Le module Banques \& Caisses comprend :



Banques \& Caisses

├── Nouveau compte

├── Liste

├── Liste des écritures

└── Virement interne



Il doit permettre de gérer les comptes financiers utilisés par ADIKOM.



La navigation doit permettre d’accéder rapidement :



\- aux comptes ;

\- aux soldes ;

\- aux écritures ;

\- aux mouvements ;

\- aux virements internes.



Les opérations financières doivent respecter les permissions de l’utilisateur.



\---



\## 10. Module Facturation \& Paiement



Le module est organisé autour de trois grandes sections :



Facturation \& Paiement

│

├── Factures clients

├── Factures fournisseurs

└── Paiements divers



\### 10.1. Factures clients



Factures clients

├── Nouvelle facture

├── Liste

├── Règlements

├── Statistiques

└── Rapports



\#### Nouvelle facture



Permet de créer une facture client.



Une facture peut notamment être liée à une location.



\#### Liste



Permet de rechercher et consulter les factures.



\#### Règlements



Permet de consulter et enregistrer les règlements associés aux factures.



\#### Statistiques



Permet d’obtenir une vision synthétique des factures clients.



\#### Rapports



Permet de produire des rapports liés à la facturation client selon les permissions disponibles.



\### 10.2. Factures fournisseurs



Factures fournisseurs

├── Nouvelle facture

├── Liste

├── Règlements

├── Statistiques

└── Rapports



Les factures fournisseurs doivent notamment pouvoir être associées aux fournisseurs concernés.



Lorsqu’une maintenance doit être imputée à un fournisseur, le système doit permettre de relier la déduction à la facture ou à la créance concernée.



\### 10.3. Paiements divers



Cette section permet d’enregistrer les paiements qui ne sont pas directement rattachés à une facture standard lorsque cela est nécessaire.



Les règles précises seront définies dans la documentation financière.



\---



\## 11. Module Utilisateurs \& Groupes



Ce module est destiné à la gestion des accès au système.



Il comprend :



Utilisateurs \& Groupes

│

├── Utilisateurs

│   ├── Nouvel utilisateur

│   ├── Liste des utilisateurs

│   └── Vue hiérarchique

│

└── Groupes

&#x20;   ├── Nouveau groupe

&#x20;   └── Liste des groupes



\### 11.1. Nouvel utilisateur



Permet au Super Admin ou à un utilisateur autorisé de créer un utilisateur interne.



Les informations peuvent notamment comprendre :



\- identité ;

\- coordonnées ;

\- poste ;

\- département ;

\- responsable ;

\- groupe ;

\- statut ;

\- informations nécessaires à l’accès.



\### 11.2. Liste des utilisateurs



La liste doit permettre de rechercher et consulter les utilisateurs.



Lorsqu’un utilisateur est sélectionné, le système doit ouvrir une page dédiée comprenant au minimum deux onglets :



\#### Onglet « Utilisateur »



Cet onglet contient les informations relatives à l’utilisateur et à son profil interne.



\#### Onglet « Permissions »



Cet onglet présente les permissions dont dispose l’utilisateur.



Les permissions doivent être organisées de manière structurée autour de :



\- modules ;

\- menus ;

\- sous-menus ;

\- actions.



L’objectif est de permettre au Super Admin de comprendre clairement ce que l’utilisateur peut faire dans le système.



\### 11.3. Vue hiérarchique



La vue hiérarchique doit représenter l’organisation interne d’ADIKOM.



Elle doit tenir compte du fait qu’une même personne peut être responsable de plusieurs départements.



Le système ne doit donc pas imposer une relation rigide entre un utilisateur et un seul département.



\### 11.4. Groupes



Les groupes permettent de faciliter l’attribution des permissions.



Ils comprennent :



Groupes

├── Nouveau groupe

└── Liste des groupes



Un groupe peut regrouper un ensemble de permissions adaptées à une fonction ou à un rôle.



\---



\## 12. Module Paramètres



Le module Paramètres comprend au minimum :



Paramètres

└── Entreprise



La section Entreprise doit permettre de gérer les informations générales nécessaires au fonctionnement du SaaS.



Elle pourra notamment contenir :



\- nom de l’entreprise ;

\- logo ;

\- coordonnées ;

\- adresse ;

\- téléphone ;

\- email ;

\- informations administratives ;

\- devise ;

\- paramètres généraux ;

\- informations utilisées dans les documents générés.



Les paramètres sensibles doivent être protégés par les permissions appropriées.



\---



\## 13. Navigation contextuelle



La navigation ne doit pas se limiter à la barre latérale.



Lorsqu’un utilisateur consulte une fiche, le système doit lui permettre d’accéder aux informations associées.



Exemple pour un client :



Fiche client

│

├── Informations

├── Tarification

├── Réservations

├── Locations

├── Factures

├── Paiements

├── Documents

└── Historique



Exemple pour un véhicule :



Fiche véhicule

│

├── Informations

├── Disponibilité

├── Locations

├── Réservations

├── Maintenance

├── Dommages

├── Documents

├── Assurance

├── Dépenses

└── Historique



Les onglets ou sections exacts pourront évoluer selon la conception UX/UI.



\---



\## 14. Navigation croisée



Lorsqu’une donnée est liée à une autre, l’utilisateur doit pouvoir naviguer directement vers l’information associée lorsque ses permissions le permettent.



Exemples :



Réservation

&#x20;   ↓

Cliquer sur le client

&#x20;   ↓

Fiche client



Réservation

&#x20;   ↓

Cliquer sur le véhicule

&#x20;   ↓

Fiche véhicule



Facture fournisseur

&#x20;   ↓

Cliquer sur le fournisseur

&#x20;   ↓

Fiche fournisseur



Maintenance

&#x20;   ↓

Cliquer sur la facture fournisseur

&#x20;   ↓

Facture concernée



Cette navigation croisée doit faciliter le travail quotidien et éviter les recherches répétitives.



\---



\## 15. Fil d’Ariane



Les pages importantes doivent pouvoir utiliser un fil d’Ariane lorsque cela améliore la compréhension de la position actuelle.



Exemple :



Gestion de location

→ Réservations

→ RES-2026-00125



Ou :



Tiers

→ Clients

→ Société ABC



Le fil d’Ariane doit permettre de revenir rapidement aux niveaux précédents.



\---



\## 16. Actions principales



Les actions les plus importantes doivent être facilement identifiables.



Exemples :



\- Nouveau client ;

\- Nouvelle réservation ;

\- Nouveau véhicule ;

\- Nouvelle facture ;

\- Enregistrer un paiement ;

\- Créer un utilisateur ;

\- Créer un groupe.



Les actions dangereuses ou irréversibles, comme la suppression, doivent être clairement distinguées des actions courantes et protégées par les permissions appropriées.



\---



\## 17. Recherche et filtrage



Les listes importantes doivent proposer des fonctions de recherche et de filtrage adaptées à leur contenu.



Les utilisateurs doivent pouvoir retrouver rapidement :



\- un client ;

\- un fournisseur ;

\- un véhicule ;

\- une réservation ;

\- une facture ;

\- un paiement ;

\- un utilisateur ;

\- une opération.



Les filtres doivent être contextuels et ne pas surcharger inutilement l’interface.



\---



\## 18. Navigation responsive



ADIKOM PILOT doit être entièrement responsive.



\### Ordinateur



La barre latérale est visible et peut être rétractée.



\### Tablette



La navigation doit s’adapter à la largeur disponible.



\### Smartphone



La barre latérale doit se transformer en navigation adaptée aux petits écrans.



La navigation mobile doit conserver l’accès aux fonctions essentielles sans reproduire nécessairement à l’identique l’interface desktop.



\---



\## 19. Navigation selon les permissions



La navigation doit être dynamique.



Un utilisateur ne disposant pas des permissions nécessaires ne doit pas voir comme disponibles les modules ou fonctionnalités auxquels il n’a pas accès.



Cependant, la sécurité ne doit jamais dépendre uniquement du masquage visuel.



Les permissions doivent également être contrôlées côté serveur et au niveau des actions concernées.



Exemple :



Si un utilisateur n’a pas la permission de gérer les utilisateurs :



\- le module peut être absent de sa navigation ;

\- l’accès direct à l’URL doit également être refusé ;

\- les actions protégées doivent être bloquées.



\---



\## 20. Règles concernant le Super Admin



Le Super Admin doit disposer d’une navigation complète.



Il doit pouvoir accéder à l’ensemble des modules et fonctions administratives.



Il doit notamment pouvoir accéder à :



\- Utilisateurs ;

\- Groupes ;

\- Permissions ;

\- Paramètres ;

\- tous les modules opérationnels ;

\- fonctions d’administration.



Les permissions du Super Admin ne doivent pas être modifiables par un utilisateur standard.



\---



\## 21. Cohérence de navigation



Les mêmes principes doivent être utilisés dans l’ensemble du SaaS.



Par exemple :



\- les listes doivent utiliser des structures cohérentes ;

\- les fiches doivent utiliser une organisation similaire ;

\- les boutons d’action doivent être placés de manière prévisible ;

\- les états doivent être présentés de manière cohérente ;

\- les filtres doivent suivre des conventions communes ;

\- les messages de confirmation et d’erreur doivent être cohérents.



L’utilisateur doit pouvoir apprendre l’interface une seule fois et retrouver les mêmes logiques dans les différents modules.



\---



\## 22. Principe directeur



La navigation d’ADIKOM PILOT doit répondre à trois objectifs :



\*\*Trouver rapidement → Comprendre immédiatement → Agir efficacement\*\*



Elle doit rester simple malgré la richesse fonctionnelle du SaaS.



Le système ne doit pas exposer toute sa complexité à l’utilisateur en permanence.



Chaque utilisateur doit voir principalement les fonctions correspondant à ses responsabilités et à ses permissions.



La navigation doit ainsi accompagner l’organisation d’ADIKOM plutôt que la compliquer.

