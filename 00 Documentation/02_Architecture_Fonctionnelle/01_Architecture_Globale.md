\# ADIKOM PILOT

\## Architecture fonctionnelle globale



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT



\---



\## 1. Objet du document



Ce document décrit l’architecture fonctionnelle globale d’ADIKOM PILOT.



Il définit la manière dont les différents domaines fonctionnels du SaaS sont organisés et interconnectés.



L’objectif est de fournir une vision globale du système avant son implémentation technique.



Cette architecture doit permettre à ADIKOM PILOT de fonctionner comme un système cohérent plutôt que comme une succession de modules indépendants.



\---



\## 2. Principe général de l’architecture



ADIKOM PILOT est conçu comme une plateforme interne modulaire.



Chaque module répond à un domaine fonctionnel précis, mais les données doivent pouvoir circuler entre les modules lorsque cela est nécessaire.



L’architecture fonctionnelle repose sur le principe suivant :



\*\*Données → Processus → Actions → Suivi → Pilotage\*\*



Les informations saisies dans un module doivent pouvoir être réutilisées par les autres modules concernés afin d’éviter les doubles saisies et les incohérences.



\---



\## 3. Vue globale du système



L’architecture fonctionnelle peut être représentée de la manière suivante :



&#x20;                        ADIKOM PILOT

&#x20;                             │

&#x20;         ┌───────────────────┼───────────────────┐

&#x20;         │                   │                   │

&#x20;      PILOTAGE           ORGANISATION         OPÉRATIONS

&#x20;         │                   │                   │

&#x20;         ▼                   ▼                   ▼

&#x20;Tableau de bord       Utilisateurs          Gestion de

&#x20;Notifications         Groupes               location

&#x20;                      Permissions

&#x20;         │                                       │

&#x20;         │                                       ▼

&#x20;         │                                  Véhicules

&#x20;         │                                  Réservations

&#x20;         │                                  Contrats

&#x20;         │                                  Départs

&#x20;         │                                  Retours

&#x20;         │                                  Maintenance

&#x20;         │                                  Documents

&#x20;         │                                  Dépenses

&#x20;         │

&#x20;         └───────────────┬───────────────────────┘

&#x20;                         │

&#x20;                         ▼

&#x20;                   FLUX FINANCIERS

&#x20;                         │

&#x20;            ┌────────────┼────────────┐

&#x20;            ▼            ▼            ▼

&#x20;        Facturation   Paiements   Banques \&

&#x20;                                     Caisses

&#x20;            │

&#x20;            ▼

&#x20;       SUIVI \& ANALYSE

&#x20;            │

&#x20;            ▼

&#x20;         Direction



Cette représentation est fonctionnelle et pourra être adaptée lors de la conception technique.



\---



\## 4. Les grands domaines fonctionnels



ADIKOM PILOT est organisé autour de plusieurs grands domaines.



\### 4.1. Pilotage



Ce domaine permet à la Direction et aux utilisateurs autorisés de disposer d’une vision synthétique de l’activité.



Il comprend notamment :



\- Tableau de bord ;

\- Centre de notifications ;

\- indicateurs ;

\- alertes ;

\- informations prioritaires.



\### 4.2. Organisation interne



Ce domaine permet de gérer les utilisateurs du système et leurs droits.



Il comprend :



\- Utilisateurs ;

\- Groupes ;

\- Permissions ;

\- Vue hiérarchique ;

\- responsabilités ;

\- contrôle des accès.



\### 4.3. Tiers



Ce domaine centralise les relations externes gérées par ADIKOM.



Il comprend :



\- Clients ;

\- Fournisseurs ;

\- Partenaires.



Les tiers sont gérés exclusivement par les utilisateurs internes.



Ils ne disposent pas eux-mêmes d’un accès au SaaS dans le périmètre actuel.



\### 4.4. Gestion de location



La gestion de location constitue le premier domaine opérationnel prioritaire.



Elle comprend notamment :



\- Parc automobile ;

\- Véhicules ;

\- Catégories ;

\- Disponibilités ;

\- Tarification ;

\- Tarifs préférentiels ;

\- Réservations ;

\- Contrats ;

\- Départs ;

\- Retours ;

\- États des lieux ;

\- Dommages ;

\- Maintenance ;

\- Assurances ;

\- Documents ;

\- Kilométrage ;

\- Carburant ;

\- Dépenses ;

\- Rentabilité.



\### 4.5. Gestion financière



Ce domaine permet de suivre les flux financiers liés à l’activité.



Il comprend :



\- Facturation ;

\- Paiements ;

\- Banques ;

\- Caisses ;

\- Écritures ;

\- Virements internes ;

\- Suivi des soldes ;

\- Créances ;

\- Dettes.



\### 4.6. Organisation et planification



Ce domaine permet d’organiser le travail interne.



Il comprend notamment :



\- Projets ;

\- Tâches ;

\- Échéances ;

\- Réunions ;

\- Rendez-vous ;

\- Actions ;

\- Décisions ;

\- Suivi.



Il répond particulièrement aux besoins de l’Assistant(e) de direction et de la Direction.



\### 4.7. Paramètres



Ce domaine permet de configurer le système selon les besoins d’ADIKOM.



Il comprend notamment :



\- informations de l’entreprise ;

\- identité visuelle ;

\- paramètres généraux ;

\- paramètres de location ;

\- paramètres de facturation ;

\- paramètres des notifications ;

\- paramètres nécessaires au fonctionnement du système.



\---



\## 5. Structure fonctionnelle des modules



La navigation principale du SaaS doit s’organiser autour des modules suivants :



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

│   ├── Fournisseurs

│   └── Partenariats

│

├── Gestion de location

│

├── Banques \& Caisses

│

├── Facturation \& Paiement

│

├── Utilisateurs \& Groupes

│

└── Paramètres



Cette structure constitue la navigation fonctionnelle de référence.



L’organisation graphique pourra évoluer pendant la conception UX/UI sans modifier la logique fonctionnelle.



\---



\## 6. Relations entre les modules



Les modules ne doivent pas fonctionner comme des silos.



Ils doivent partager les informations nécessaires à leurs opérations respectives.



\### 6.1. Tiers ↔ Gestion de location



Un client enregistré dans le module Tiers doit pouvoir être utilisé dans une réservation.



Le processus est :



Client

&#x20;  ↓

Réservation

&#x20;  ↓

Contrat

&#x20;  ↓

Location



Les informations du client ne doivent pas être saisies une seconde fois lors de la création de la réservation.



\### 6.2. Tiers ↔ Tarification



Les conditions tarifaires d’un client sont définies dans sa fiche.



Lorsqu’une réservation est créée, le système doit pouvoir déterminer le tarif applicable au client.



Le processus peut être :



Client

&#x20;  ↓

Conditions tarifaires

&#x20;  ↓

Réservation

&#x20;  ↓

Tarif appliqué



Le tarif finalement appliqué doit être conservé dans la réservation.



\### 6.3. Tiers ↔ Fournisseurs ↔ Véhicules



Un fournisseur peut mettre un ou plusieurs véhicules à disposition d’ADIKOM.



Le système doit donc permettre la relation :



Fournisseur

&#x20;    │

&#x20;    ├── Véhicule A

&#x20;    ├── Véhicule B

&#x20;    └── Véhicule C



La fiche du véhicule doit permettre d’identifier le fournisseur associé lorsque cette information existe.



\---



\## 7. Relation entre location et finances



La gestion de location doit être connectée aux flux financiers.



Le processus principal est :



Réservation

&#x20;    ↓

Contrat

&#x20;    ↓

Location

&#x20;    ↓

Facturation

&#x20;    ↓

Paiement

&#x20;    ↓

Solde



Les données financières doivent être liées à l’opération à laquelle elles correspondent.



\---



\## 8. Relation entre véhicule et maintenance



Chaque opération de maintenance doit être rattachée au véhicule concerné.



Le système doit conserver l’historique.



Véhicule

&#x20;  │

&#x20;  ├── Location 01

&#x20;  ├── Location 02

&#x20;  ├── Maintenance 01

&#x20;  ├── Maintenance 02

&#x20;  └── Maintenance 03



L’objectif est de pouvoir consulter l’historique complet d’un véhicule.



\---



\## 9. Relation maintenance ↔ fournisseur



Lorsqu’un véhicule est fourni par un fournisseur, une opération de maintenance peut éventuellement générer une imputation financière au fournisseur.



Le processus est :



Fournisseur

&#x20;     ↓

Véhicule

&#x20;     ↓

Incident / Panne

&#x20;     ↓

Maintenance

&#x20;     ↓

Dépense

&#x20;     ↓

Imputation fournisseur

&#x20;     ↓

Facture fournisseur

&#x20;     ↓

Solde fournisseur



La dépense de maintenance et la déduction fournisseur doivent rester deux opérations distinctes.



\---



\## 10. Relation facturation ↔ paiements



Une facture doit pouvoir être suivie jusqu’à son règlement.



Facture

&#x20;  │

&#x20;  ├── Paiement 01

&#x20;  ├── Paiement 02

&#x20;  └── Solde restant



Le système doit pouvoir gérer les paiements partiels lorsque cela est nécessaire.



Le statut de la facture doit être déterminé à partir de sa situation réelle.



\---



\## 11. Relation facturation ↔ banques \& caisses



Lorsqu’un paiement est enregistré, il peut être associé au compte bancaire ou à la caisse concernée.



Exemple :



Facture client

&#x20;     ↓

Paiement

&#x20;     ↓

Compte bancaire / Caisse

&#x20;     ↓

Écriture

&#x20;     ↓

Nouveau solde



Cette relation permettra progressivement de construire une vision fiable des flux financiers.



\---



\## 12. Relation utilisateurs ↔ permissions ↔ modules



L’accès aux modules dépend des permissions de l’utilisateur.



Le modèle fonctionnel est :



Utilisateur

&#x20;     ↓

Groupe

&#x20;     ↓

Permissions

&#x20;     ↓

Modules

&#x20;     ↓

Menus

&#x20;     ↓

Sous-menus

&#x20;     ↓

Actions



Un utilisateur peut être membre d’un groupe selon l’organisation d’ADIKOM.



Les permissions déterminent précisément ce qu’il peut consulter ou effectuer.



\---



\## 13. Cas particulier : une personne peut gérer plusieurs départements



L’organisation actuelle d’ADIKOM étant relativement réduite, une même personne peut être responsable de plusieurs départements.



Le système ne doit donc pas supposer :



\*\*1 utilisateur = 1 département\*\*



Une personne peut avoir plusieurs responsabilités.



Exemple :



Utilisateur A

│

├── Administration \& Finance

└── Support \& Logistique



Les permissions doivent pouvoir être adaptées à cette réalité.



Le système doit donc distinguer :



\- identité de l’utilisateur ;

\- poste ;

\- département(s) ;

\- groupe(s) ;

\- permissions.



\---



\## 14. Super Admin



Le Super Admin constitue le niveau d’administration complet.



Il doit pouvoir :



\- accéder à tous les modules ;

\- créer les utilisateurs ;

\- gérer les groupes ;

\- gérer les permissions ;

\- configurer les paramètres sensibles ;

\- administrer le système.



Le Super Admin est le seul niveau bénéficiant par défaut de l’accès complet à l’ensemble du système.



Les autres utilisateurs doivent disposer uniquement des accès qui leur sont attribués.



\---



\## 15. Architecture de navigation



La navigation doit permettre à l’utilisateur d’accéder rapidement aux fonctions auxquelles il est autorisé.



La structure cible est :



Barre latérale

│

├── Tableau de bord

├── Centre de notifications

├── Projets \& Planification

├── Tiers

│   ├── Clients

│   ├── Fournisseurs

│   └── Partenariats

├── Gestion de location

├── Banques \& Caisses

├── Facturation \& Paiement

├── Utilisateurs \& Groupes

└── Paramètres



Les éléments auxquels l’utilisateur n’a pas accès ne doivent pas être présentés comme des fonctionnalités disponibles.



\---



\## 16. Architecture des données fonctionnelles



Les principales données du système peuvent être regroupées en familles.



\### Organisation



\- Utilisateur ;

\- Groupe ;

\- Permission ;

\- Département ;

\- Poste.



\### Tiers



\- Client ;

\- Fournisseur ;

\- Partenaire.



\### Location



\- Véhicule ;

\- Catégorie ;

\- Réservation ;

\- Contrat ;

\- Départ ;

\- Retour ;

\- État des lieux ;

\- Dommage ;

\- Maintenance ;

\- Assurance ;

\- Document ;

\- Dépense.



\### Finance



\- Facture ;

\- Paiement ;

\- Compte bancaire ;

\- Caisse ;

\- Écriture ;

\- Virement ;

\- Déduction fournisseur.



\### Planification



\- Projet ;

\- Tâche ;

\- Réunion ;

\- Rendez-vous ;

\- Action ;

\- Échéance.



\### Pilotage



\- Notification ;

\- Alerte ;

\- Indicateur ;

\- Journal d’activité.



\---



\## 17. Principe de source unique de vérité



Chaque information principale doit avoir une source de référence dans le système.



Exemple :



Le nom et les coordonnées d’un client doivent être gérés dans la fiche client.



Une réservation doit utiliser cette information au lieu de créer une copie indépendante du client.



De même :



\- les informations du véhicule sont gérées dans sa fiche ;

\- les informations du fournisseur sont gérées dans sa fiche ;

\- les informations de l’utilisateur sont gérées dans sa fiche ;

\- les informations de l’entreprise sont gérées dans les paramètres.



Les modules doivent exploiter ces informations plutôt que les dupliquer inutilement.



\---



\## 18. Historique et traçabilité



Les relations entre les données doivent permettre de reconstituer l’historique d’une opération.



Exemple :



Pour une location donnée, ADIKOM doit pouvoir retrouver :



Client

&#x20;  ↓

Réservation

&#x20;  ↓

Tarif appliqué

&#x20;  ↓

Véhicule

&#x20;  ↓

Contrat

&#x20;  ↓

Départ

&#x20;  ↓

Retour

&#x20;  ↓

Dommages éventuels

&#x20;  ↓

Maintenance éventuelle

&#x20;  ↓

Dépenses éventuelles

&#x20;  ↓

Facture

&#x20;  ↓

Paiements

&#x20;  ↓

Solde



Cette continuité constitue un principe essentiel de l’architecture fonctionnelle.



\---



\## 19. Architecture évolutive



L’architecture fonctionnelle doit permettre l’ajout progressif de nouveaux domaines.



Les modules futurs pourront réutiliser les fondations existantes.



Par exemple :



&#x20;                   ADIKOM PILOT

&#x20;                        │

&#x20;       ┌────────────────┼────────────────┐

&#x20;       │                │                │

&#x20;     Tiers          Location          Finance

&#x20;       │                │                │

&#x20;       └────────────────┼────────────────┘

&#x20;                        │

&#x20;                  Données communes

&#x20;                        │

&#x20;       ┌────────────────┼────────────────┐

&#x20;       │                │                │

&#x20;   Projets          Commercial          RH

&#x20;   futurs            futur             futur



Les modules futurs ne doivent pas être développés dans le MVP uniquement parce qu’ils sont prévus dans la vision.



Ils doivent être ajoutés lorsque le besoin métier est confirmé.



\---



\## 20. Architecture fonctionnelle et architecture technique



Ce document décrit uniquement la logique fonctionnelle du système.



Il ne définit pas encore :



\- le framework frontend ;

\- l’architecture backend ;

\- la structure exacte de la base de données ;

\- les API ;

\- les bibliothèques ;

\- les composants techniques ;

\- le système de déploiement.



Ces décisions seront étudiées séparément avant leur implémentation.



L’architecture technique devra respecter les besoins fonctionnels définis dans cette documentation.



\---



\## 21. Principe directeur



L’architecture globale d’ADIKOM PILOT doit permettre de relier les opérations entre elles sans rendre le système inutilement complexe.



Le principe est :



\*\*Une donnée saisie une fois → réutilisée partout où elle est nécessaire.\*\*



\*\*Une opération réalisée → traçable.\*\*



\*\*Une responsabilité attribuée → contrôlable.\*\*



\*\*Une information importante → accessible au bon utilisateur.\*\*



\*\*Une opération financière → justifiable.\*\*



\*\*Un module ajouté → intégré au système existant.\*\*



ADIKOM PILOT doit ainsi fonctionner comme un système de gestion unifié et évolutif, dans lequel les différents modules travaillent ensemble autour d’une même logique métier.

