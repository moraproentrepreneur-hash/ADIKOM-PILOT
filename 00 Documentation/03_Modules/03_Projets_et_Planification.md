\# ADIKOM PILOT

\## Module 03 — Projets \& Planification



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence fonctionnelle  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\## 1. Objet du module



Le module Projets \& Planification est conçu pour organiser, planifier et suivre les activités internes d’ADIKOM.



Il répond particulièrement aux besoins de l’Assistant(e) de direction et de la Direction, tout en pouvant être utilisé par les autres responsables selon leurs permissions.



Le module doit permettre de transformer une intention, une demande ou une activité à réaliser en un ensemble structuré de :



\- projets ;

\- tâches ;

\- responsabilités ;

\- échéances ;

\- réunions ;

\- rendez-vous ;

\- actions ;

\- décisions ;

\- suivis.



L’objectif est de donner à ADIKOM un espace centralisé permettant de savoir :



\*\*Quoi faire → Qui doit le faire → Pour quand → Où en est-on → Que reste-t-il à faire ?\*\*



\---



\## 2. Objectifs



Le module doit permettre de :



1\. centraliser les projets internes ;

2\. planifier les activités ;

3\. attribuer des responsabilités ;

4\. suivre les échéances ;

5\. organiser les tâches ;

6\. suivre l’avancement ;

7\. gérer les réunions et rendez-vous ;

8\. conserver les décisions importantes ;

9\. faciliter le suivi de la Direction ;

10\. éviter que les actions importantes restent uniquement dans des conversations ou des notes dispersées ;

11\. générer des rappels et notifications ;

12\. fournir une vision claire des activités en cours.



\---



\## 3. Positionnement du module



Le module Projets \& Planification n’est pas destiné à remplacer la gestion opérationnelle des autres modules.



Il sert de couche d’organisation interne.



Exemple :



Une réservation de véhicule doit être gérée dans le module Gestion de location.



Une tâche consistant à préparer les documents nécessaires à cette réservation peut être suivie dans Projets \& Planification.



Le module doit donc pouvoir fonctionner de manière autonome tout en pouvant référencer certains éléments des autres modules lorsque cela apporte une réelle valeur.



\---



\## 4. Structure générale



La structure fonctionnelle du module peut être organisée autour de :



Projets \& Planification

│

├── Projets

├── Tâches

├── Calendrier

├── Réunions

├── Rendez-vous

├── Actions

└── Décisions



Cette organisation constitue une base fonctionnelle.



L’organisation visuelle pourra être adaptée lors de la conception UX/UI.



\---



\## 5. Projets



Un projet représente un ensemble organisé d’actions ayant un objectif commun.



Exemples :



\- lancement d’une nouvelle activité ;

\- préparation d’un partenariat ;

\- mise en place d’un nouveau service ;

\- projet interne ;

\- organisation d’un événement ;

\- déploiement d’un outil ;

\- projet administratif ;

\- projet commercial.



Chaque projet doit disposer d’une fiche dédiée.



\---



\## 6. Fiche projet



La fiche projet doit centraliser les informations principales.



Elle peut notamment contenir :



\- nom du projet ;

\- description ;

\- objectif ;

\- responsable ;

\- participants ;

\- statut ;

\- priorité ;

\- date de début ;

\- date prévue de fin ;

\- tâches ;

\- échéances ;

\- réunions ;

\- documents ;

\- commentaires ;

\- décisions ;

\- historique.



La fiche doit permettre de comprendre rapidement la situation du projet.



\---



\## 7. Statuts des projets



Le système doit pouvoir gérer plusieurs statuts.



Une base fonctionnelle peut être :



\- Brouillon ;

\- À venir ;

\- En cours ;

\- En pause ;

\- Terminé ;

\- Annulé.



Les statuts peuvent évoluer selon les besoins d’ADIKOM.



Le changement de statut doit être enregistré dans l’historique lorsque cela est pertinent.



\---



\## 8. Priorité des projets



Les projets peuvent être associés à un niveau de priorité.



Exemple :



\- Faible ;

\- Normale ;

\- Importante ;

\- Urgente.



La priorité doit permettre à l’utilisateur de distinguer les projets nécessitant une attention particulière.



La priorité ne doit pas être utilisée pour transformer artificiellement tous les projets en projets urgents.



\---



\## 9. Responsable du projet



Chaque projet peut avoir un responsable principal.



Le responsable est la personne chargée de suivre l’avancement général du projet.



Il peut également y avoir plusieurs participants.



Le système doit distinguer :



\- responsable ;

\- participant ;

\- observateur lorsque cela est nécessaire.



\---



\## 10. Gestion des tâches



Une tâche représente une action concrète à effectuer.



Une tâche peut être :



\- indépendante ;

\- liée à un projet ;

\- attribuée à un utilisateur ;

\- associée à une échéance ;

\- associée à une priorité.



Exemple :



Projet :

\*\*Mise en place du nouveau partenariat\*\*



Tâches :



\- préparer le dossier ;

\- contacter le partenaire ;

\- organiser la réunion ;

\- préparer la convention ;

\- obtenir la validation ;

\- archiver les documents.



\---



\## 11. Fiche tâche



Une tâche doit pouvoir contenir :



\- titre ;

\- description ;

\- projet associé ;

\- responsable ;

\- participants ;

\- statut ;

\- priorité ;

\- date de début ;

\- échéance ;

\- commentaires ;

\- pièces jointes lorsque nécessaire ;

\- historique.



\---



\## 12. Statuts des tâches



Les tâches peuvent utiliser les statuts suivants :



\- À faire ;

\- En cours ;

\- En attente ;

\- Terminée ;

\- Annulée.



Le système doit permettre de suivre clairement l’avancement.



\---



\## 13. Attribution des tâches



Une tâche peut être attribuée à un utilisateur autorisé.



Le responsable de la tâche doit pouvoir être identifié clairement.



Lorsqu’une tâche est attribuée à un utilisateur, une notification peut être générée.



Exemple :



Nouvelle tâche attribuée



\*\*Préparer le dossier fournisseur\*\*



Responsable :

\*\*Assistant(e) de direction\*\*



Échéance :

\*\*25/08/2026\*\*



\---



\## 14. Échéances



Chaque tâche peut disposer d’une échéance.



Le système doit permettre de distinguer :



\- tâches sans échéance ;

\- tâches à venir ;

\- tâches arrivant à échéance ;

\- tâches en retard ;

\- tâches terminées.



Les tâches en retard doivent être facilement identifiables.



\---



\## 15. Rappels



Le système doit pouvoir générer des rappels pour les échéances.



Exemple :



Tâche :

\*\*Préparer la réunion fournisseur\*\*



Échéance :

\*\*Demain\*\*



Notification :



\*\*Cette tâche arrive à échéance demain.\*\*



Les règles précises de rappel pourront être configurables.



\---



\## 16. Tâches en retard



Lorsqu’une échéance est dépassée et que la tâche n’est pas terminée, le système doit pouvoir la considérer comme en retard.



Exemple :



Tâche :

Préparer le dossier



Échéance :

20/08/2026



Statut :

À faire



Résultat :



\*\*Tâche en retard\*\*



Une notification peut être générée selon les règles du Centre de notifications.



\---



\## 17. Sous-tâches



Le système peut permettre de décomposer une tâche importante en sous-tâches.



Exemple :



Tâche principale :

\*\*Préparer le lancement du service\*\*



Sous-tâches :



\- finaliser les documents ;

\- préparer la communication ;

\- vérifier les tarifs ;

\- préparer les supports ;

\- valider le lancement.



Les sous-tâches doivent contribuer à la compréhension de l’avancement global.



\---



\## 18. Dépendances entre tâches



Lorsque cela est nécessaire, une tâche peut dépendre d’une autre.



Exemple :



Tâche A :

\*\*Valider le contrat\*\*



↓



Tâche B :

\*\*Envoyer le contrat\*\*



La tâche B ne doit pas être considérée comme pleinement réalisable tant que la tâche A n’est pas terminée lorsque cette dépendance est définie comme bloquante.



Cette fonctionnalité peut être développée progressivement selon les besoins du MVP.



\---



\## 19. Calendrier



Le module doit proposer une vue calendrier permettant de visualiser les éléments planifiés.



Le calendrier peut afficher :



\- tâches ;

\- échéances ;

\- réunions ;

\- rendez-vous ;

\- événements liés aux projets.



Les éléments doivent être filtrables selon leur type.



\---



\## 20. Vues calendrier



Le système peut proposer plusieurs niveaux de visualisation :



\- journée ;

\- semaine ;

\- mois ;

\- agenda.



La vue par défaut pourra être déterminée selon l’usage principal de l’utilisateur.



\---



\## 21. Réunions



Le module doit permettre d’enregistrer les réunions internes ou professionnelles.



Une réunion peut contenir :



\- titre ;

\- objectif ;

\- date ;

\- heure ;

\- durée ;

\- lieu ;

\- participants ;

\- responsable ;

\- ordre du jour ;

\- notes ;

\- décisions ;

\- actions à effectuer.



\---



\## 22. Préparation d’une réunion



Une réunion peut être associée à des éléments préparatoires.



Exemple :



Réunion :

\*\*Réunion avec fournisseur A\*\*



Préparation :



\- récupérer l’historique du véhicule ;

\- vérifier les factures ;

\- préparer les éléments financiers ;

\- préparer les documents ;

\- définir les points à discuter.



Ces éléments peuvent être gérés sous forme de tâches.



\---



\## 23. Compte rendu de réunion



Après une réunion, l’utilisateur autorisé doit pouvoir enregistrer un compte rendu.



Le compte rendu peut contenir :



\- date ;

\- participants ;

\- sujets abordés ;

\- informations importantes ;

\- décisions ;

\- actions ;

\- responsables ;

\- échéances.



Les informations importantes doivent pouvoir rester accessibles depuis la fiche de la réunion.



\---



\## 24. Décisions



Le module doit pouvoir conserver les décisions importantes prises dans le cadre des projets ou réunions.



Une décision peut contenir :



\- titre ;

\- contexte ;

\- décision prise ;

\- date ;

\- responsable ;

\- participants concernés ;

\- projet associé ;

\- réunion associée ;

\- actions résultantes.



L’objectif est d’éviter que les décisions importantes soient perdues dans des échanges informels.



\---



\## 25. Actions



Une action représente une opération à réaliser à la suite d’une réunion, d’une décision ou d’un événement.



Exemple :



Décision :

\*\*Lancer le partenariat avec le fournisseur A\*\*



Action :

\*\*Préparer la convention\*\*



Responsable :

\*\*Assistant(e) de direction\*\*



Échéance :

\*\*30/08/2026\*\*



Une action peut être transformée en tâche lorsqu’un suivi détaillé est nécessaire.



\---



\## 26. Rendez-vous



Le système doit permettre de gérer les rendez-vous professionnels.



Une fiche rendez-vous peut contenir :



\- objet ;

\- date ;

\- heure ;

\- durée ;

\- lieu ;

\- personne ou organisation concernée ;

\- responsable ;

\- participants ;

\- notes ;

\- documents ;

\- statut.



\---



\## 27. Rendez-vous et tiers



Lorsque le rendez-vous concerne un client, fournisseur ou partenaire enregistré dans ADIKOM PILOT, le rendez-vous doit pouvoir être lié au tiers concerné.



Exemple :



Rendez-vous

→ Fournisseur A

→ Fiche fournisseur



Cela permet de conserver une continuité dans l’historique des relations.



\---



\## 28. Projets et tiers



Un projet peut être associé à un client, fournisseur ou partenaire lorsque cela est pertinent.



Exemple :



Projet :

\*\*Nouveau partenariat touristique\*\*



Partenaire :

\*\*Partenaire A\*\*



Le système doit permettre de retrouver cette relation depuis les fiches concernées lorsque les permissions le permettent.



\---



\## 29. Projets et documents



Un projet peut disposer de documents associés.



Exemples :



\- contrat ;

\- proposition ;

\- présentation ;

\- compte rendu ;

\- devis ;

\- convention ;

\- document administratif.



Les documents doivent être accessibles uniquement aux utilisateurs autorisés.



\---



\## 30. Commentaires



Les projets et tâches peuvent permettre aux utilisateurs autorisés d'ajouter des commentaires.



Les commentaires doivent être liés à l’élément concerné.



Exemple :



Projet

→ Commentaire

→ Utilisateur

→ Date et heure



Le système doit conserver l’auteur et la date du commentaire.



\---



\## 31. Historique



Les éléments importants du module doivent disposer d’un historique.



L’historique peut permettre de retrouver :



\- création ;

\- modification ;

\- changement de statut ;

\- changement de responsable ;

\- changement d’échéance ;

\- commentaire ;

\- décision ;

\- clôture.



L’historique doit être utilisé pour faciliter le suivi et la traçabilité.



\---



\## 32. Tableau de suivi des projets



Le module doit proposer une vue permettant de suivre les projets.



Informations possibles :



\- projet ;

\- responsable ;

\- statut ;

\- priorité ;

\- avancement ;

\- échéance ;

\- tâches restantes.



Exemple :



Projet | Responsable | Statut | Avancement | Échéance

Projet A | Assistant(e) | En cours | 65 % | 30/08/2026

Projet B | Gérant | À venir | 0 % | 15/09/2026

Projet C | Responsable X | En retard | 40 % | 18/08/2026



Le pourcentage d’avancement doit être calculé de manière cohérente selon les règles définies.



\---



\## 33. Calcul de l’avancement



Lorsque l’avancement est basé sur les tâches, le système peut calculer automatiquement un pourcentage.



Exemple :



10 tâches au total

6 tâches terminées



Avancement :

60 %



Cependant, le système doit éviter de présenter un pourcentage trompeur lorsque certaines tâches ont une importance très différente.



Une évolution future peut permettre une pondération des tâches.



Pour le MVP, une méthode simple et cohérente peut être privilégiée.



\---



\## 34. Vue Kanban



Une vue Kanban peut être proposée pour les tâches.



Exemple :



À faire

│

├── Tâche 1

└── Tâche 2



En cours

│

├── Tâche 3

└── Tâche 4



En attente

│

└── Tâche 5



Terminées

│

├── Tâche 6

└── Tâche 7



Le déplacement d’une tâche entre les colonnes doit respecter les permissions.



\---



\## 35. Vue liste



Une vue liste doit également être disponible.



Elle peut permettre de filtrer par :



\- projet ;

\- responsable ;

\- statut ;

\- priorité ;

\- échéance ;

\- retard.



La vue liste doit être particulièrement utile pour l’Assistant(e) de direction et la Direction.



\---



\## 36. Vue personnelle



Chaque utilisateur doit pouvoir accéder à une vue regroupant les éléments qui le concernent.



Exemple :



Mes tâches

Mes échéances

Mes réunions

Mes rendez-vous

Mes projets



Cette vue doit être construite selon les données réellement attribuées à l’utilisateur.



\---



\## 37. Vue Direction



Les utilisateurs disposant des permissions appropriées peuvent bénéficier d’une vision globale.



La Direction doit pouvoir identifier :



\- projets en cours ;

\- projets en retard ;

\- tâches importantes ;

\- échéances ;

\- responsables ;

\- décisions importantes ;

\- actions en attente.



Cette vue ne doit pas nécessairement exposer toutes les informations opérationnelles de chaque tâche.



Elle doit privilégier le pilotage.



\---



\## 38. Notifications



Le module doit être intégré au Centre de notifications.



Les événements pouvant générer des notifications comprennent notamment :



\- tâche attribuée ;

\- échéance proche ;

\- tâche en retard ;

\- réunion à venir ;

\- rendez-vous à venir ;

\- modification importante ;

\- décision enregistrée ;

\- projet nécessitant une attention.



Les notifications doivent respecter les permissions.



\---



\## 39. Actions rapides



Le module peut proposer des actions rapides :



\- Nouveau projet ;

\- Nouvelle tâche ;

\- Nouvelle réunion ;

\- Nouveau rendez-vous ;

\- Nouvelle action ;

\- Nouvelle décision.



Les actions disponibles doivent dépendre des permissions de l’utilisateur.



\---



\## 40. Recherche



Le module doit permettre de rechercher rapidement un projet, une tâche, une réunion, un rendez-vous ou une décision.



La recherche doit pouvoir prendre en compte les éléments pertinents selon le type de donnée.



Exemples :



\- nom du projet ;

\- titre de tâche ;

\- responsable ;

\- participant ;

\- tiers associé ;

\- période.



\---



\## 41. Filtres



Les filtres doivent être contextuels.



Pour les projets :



\- statut ;

\- responsable ;

\- priorité ;

\- période.



Pour les tâches :



\- statut ;

\- responsable ;

\- projet ;

\- priorité ;

\- échéance.



Pour les réunions :



\- période ;

\- participant ;

\- projet.



Pour les rendez-vous :



\- période ;

\- tiers ;

\- responsable.



\---



\## 42. Permissions



Le module doit respecter le système général de permissions d’ADIKOM PILOT.



Les permissions peuvent notamment distinguer :



\- consulter les projets ;

\- créer un projet ;

\- modifier un projet ;

\- supprimer ou archiver un projet ;

\- consulter les tâches ;

\- créer une tâche ;

\- modifier une tâche ;

\- clôturer une tâche ;

\- gérer les réunions ;

\- gérer les rendez-vous ;

\- enregistrer des décisions ;

\- consulter les documents associés.



Les permissions exactes seront définies dans le système global de rôles et permissions.



\---



\## 43. Assistant(e) de direction



Le module doit être particulièrement adapté aux besoins de l’Assistant(e) de direction.



L’Assistant(e) de direction doit pouvoir, selon ses permissions :



\- organiser les projets ;

\- créer les tâches ;

\- attribuer les tâches ;

\- gérer les échéances ;

\- organiser les réunions ;

\- gérer les rendez-vous ;

\- préparer les comptes rendus ;

\- enregistrer les décisions ;

\- suivre les actions ;

\- relancer les responsables ;

\- consulter l’avancement.



Le module doit donc devenir un véritable outil de coordination interne.



\---



\## 44. Responsabilités multiples



Comme une même personne peut gérer plusieurs départements, le système doit permettre d’attribuer plusieurs responsabilités à un même utilisateur.



Une tâche peut ainsi être attribuée à une personne qui possède plusieurs fonctions.



La logique d’attribution doit rester basée sur l’utilisateur réel et ses permissions.



\---



\## 45. Relations avec les autres modules



Le module Projets \& Planification doit pouvoir interagir avec les autres modules lorsque cela est pertinent.



Relations principales :



Projets \& Planification

│

├── Tiers

│   └── Clients / Fournisseurs / Partenaires

│

├── Gestion de location

│   └── Véhicules / Réservations / Maintenance

│

├── Facturation \& Paiement

│   └── Factures / Paiements

│

├── Utilisateurs \& Groupes

│   └── Responsables / Participants

│

└── Centre de notifications

&#x20;   └── Rappels / Alertes



Ces relations ne doivent pas transformer le module en une copie des autres modules.



Il doit simplement pouvoir référencer les éléments nécessaires.



\---



\## 46. Exemple de scénario complet



\### Situation



ADIKOM souhaite mettre en place un nouveau partenariat.



\### Étape 1 — Création du projet



Projet :

\*\*Partenariat avec Société X\*\*



Responsable :

\*\*Assistant(e) de direction\*\*



Statut :

\*\*En cours\*\*



\### Étape 2 — Création des tâches



\- contacter le partenaire ;

\- organiser une réunion ;

\- préparer les documents ;

\- négocier les conditions ;

\- préparer la convention ;

\- obtenir la validation.



\### Étape 3 — Réunion



Une réunion est créée avec les participants concernés.



\### Étape 4 — Décision



Une décision est enregistrée à l’issue de la réunion.



\### Étape 5 — Actions



Les actions résultantes sont attribuées aux personnes concernées.



\### Étape 6 — Suivi



Les tâches sont suivies jusqu’à leur réalisation.



\### Étape 7 — Clôture



Lorsque toutes les actions sont terminées, le projet peut être marqué comme terminé.



\---



\## 47. Exemple de scénario avec un fournisseur



\### Situation



ADIKOM doit régler une situation concernant un véhicule fourni par un fournisseur.



Projet :

\*\*Régularisation du véhicule Toyota T5\*\*



Le projet peut contenir :



\- analyse de la panne ;

\- vérification de la facture de maintenance ;

\- calcul de l’imputation ;

\- vérification de la facture fournisseur ;

\- validation ;

\- clôture.



Le module Projets \& Planification permet de suivre le travail administratif.



Les opérations financières réelles restent gérées dans les modules correspondants.



\---



\## 48. Gestion des éléments terminés



Un projet terminé ne doit pas être automatiquement supprimé.



Les données doivent rester accessibles selon les règles de conservation.



De même :



\- une tâche terminée reste consultable ;

\- une réunion passée reste consultable ;

\- une décision reste consultable ;

\- un projet terminé reste accessible.



L’historique est important pour la mémoire organisationnelle d’ADIKOM.



\---



\## 49. Responsive design



Le module doit être entièrement responsive.



\### Desktop



Les vues liste, Kanban et calendrier peuvent exploiter pleinement l’espace disponible.



\### Tablette



Les composants doivent se réorganiser automatiquement.



\### Mobile



Les informations doivent être présentées de manière verticale et lisible.



Les actions principales doivent rester facilement accessibles.



Le système ne doit pas simplement réduire l’interface desktop.



\---



\## 50. Performance



Le module doit éviter de charger inutilement toutes les tâches et tous les projets simultanément.



Les listes importantes doivent pouvoir utiliser :



\- pagination ;

\- chargement progressif ;

\- filtres ;

\- recherche ;

\- tri.



Les informations détaillées doivent être chargées lorsqu’elles sont nécessaires.



\---



\## 51. Sécurité



Les projets, tâches, réunions, documents et décisions doivent respecter les permissions de l’utilisateur.



Un utilisateur ne doit pas pouvoir :



\- consulter un projet auquel il n’a pas accès ;

\- modifier une tâche sans permission ;

\- consulter un document protégé ;

\- modifier une décision sans autorisation ;

\- accéder à des informations confidentielles par une URL directe.



Les contrôles doivent être appliqués côté serveur.



\---



\## 52. Évolutivité



Le module doit pouvoir évoluer ultérieurement.



Des fonctionnalités futures peuvent inclure :



\- dépendances avancées ;

\- diagramme de Gantt ;

\- charge de travail ;

\- gestion avancée des ressources ;

\- automatisations ;

\- modèles de projets ;

\- récurrence des tâches ;

\- statistiques avancées ;

\- gestion budgétaire des projets.



Ces fonctionnalités ne sont pas obligatoires pour le MVP.



Le MVP doit rester suffisamment simple pour être réellement utilisé par ADIKOM.



\---



\## 53. Critères d’acceptation du module



Le module Projets \& Planification sera considéré comme fonctionnel lorsque :



1\. un utilisateur autorisé peut créer un projet ;

2\. un projet peut être attribué à un responsable ;

3\. un projet peut contenir plusieurs tâches ;

4\. une tâche peut être attribuée à un utilisateur ;

5\. une tâche peut avoir une échéance ;

6\. les tâches en retard sont identifiables ;

7\. les projets disposent d’un statut ;

8\. les tâches disposent d’un statut ;

9\. les réunions peuvent être enregistrées ;

10\. les rendez-vous peuvent être enregistrés ;

11\. les décisions peuvent être conservées ;

12\. les actions peuvent être suivies ;

13\. les notifications peuvent être générées pour les événements pertinents ;

14\. les utilisateurs peuvent consulter leurs propres éléments ;

15\. les permissions sont respectées ;

16\. les données restent accessibles après clôture ;

17\. le module fonctionne sur ordinateur, tablette et mobile ;

18\. les éléments peuvent être recherchés et filtrés ;

19\. les relations avec les autres modules peuvent être exploitées lorsque nécessaire ;

20\. aucune donnée métier d’un autre module n’est inutilement dupliquée.



\---



\## 54. Principe directeur



Le module Projets \& Planification doit devenir le centre de coordination interne d’ADIKOM.



Il doit permettre de transformer :



\*\*Une idée → un projet\*\*



\*\*Un projet → des tâches\*\*



\*\*Une tâche → un responsable\*\*



\*\*Un responsable → une échéance\*\*



\*\*Une réunion → des décisions\*\*



\*\*Une décision → des actions\*\*



\*\*Une action → un suivi\*\*



L’objectif final est simple :



\*\*Rien d’important ne doit être oublié, perdu ou rester sans responsable.\*\*



Le module doit donner à la Direction et à l’Assistant(e) de direction une vision claire de ce qui doit être fait, de ce qui est en cours, de ce qui est en retard et de ce qui a été réalisé.

