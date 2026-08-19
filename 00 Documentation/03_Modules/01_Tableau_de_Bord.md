\# ADIKOM PILOT

\## Module 01 — Tableau de bord



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence fonctionnelle  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\## 1. Objet du module



Le Tableau de bord constitue l’espace principal de pilotage d’ADIKOM PILOT.



Il doit permettre à chaque utilisateur autorisé d’obtenir rapidement une vision synthétique des informations qui concernent son activité et ses responsabilités.



Le tableau de bord ne doit pas être une simple page contenant des statistiques.



Il doit fonctionner comme un véritable centre de pilotage permettant de :



\- comprendre la situation actuelle ;

\- identifier les opérations importantes ;

\- détecter les urgences ;

\- suivre les performances ;

\- accéder rapidement aux actions nécessaires ;

\- surveiller les échéances ;

\- passer directement d’un indicateur à l’opération concernée.



Le contenu affiché doit être adapté au profil et aux permissions de l’utilisateur.



\---



\## 2. Objectifs



Le module doit permettre de :



1\. donner une vision immédiate de l’activité ;

2\. centraliser les informations prioritaires ;

3\. faciliter la prise de décision ;

4\. identifier rapidement les anomalies ou situations nécessitant une intervention ;

5\. suivre l’activité de location ;

6\. suivre les principaux flux financiers ;

7\. suivre l’état du parc automobile ;

8\. suivre les échéances importantes ;

9\. faciliter l’accès aux opérations récentes ;

10\. fournir à la Direction une vision globale de l’entreprise.



\---



\## 3. Principe de personnalisation



Tous les utilisateurs ne doivent pas nécessairement voir le même tableau de bord.



Le contenu doit être déterminé selon :



\- le rôle ;

\- les groupes ;

\- les permissions ;

\- les responsabilités ;

\- les modules accessibles.



Exemple :



Le Gérant peut avoir une vision globale de l’entreprise.



L’Assistant(e) de direction peut disposer d’une vision davantage orientée vers :



\- tâches ;

\- projets ;

\- rendez-vous ;

\- échéances ;

\- actions à effectuer.



Un responsable de la location peut disposer d’une vision davantage orientée vers :



\- réservations ;

\- véhicules ;

\- départs ;

\- retours ;

\- locations en cours ;

\- maintenance.



Un utilisateur financier peut disposer d’une vision davantage orientée vers :



\- factures ;

\- règlements ;

\- créances ;

\- paiements ;

\- banques ;

\- caisses.



Le tableau de bord doit donc être construit à partir des données auxquelles l’utilisateur est réellement autorisé à accéder.



\---



\## 4. Structure générale



Le tableau de bord peut être organisé en plusieurs zones :



Tableau de bord

│

├── En-tête de pilotage

│

├── Indicateurs clés

│

├── Activité de location

│

├── État du parc

│

├── Finance

│

├── Alertes \& échéances

│

├── Activité récente

│

└── Actions rapides



L’ordre exact des sections peut évoluer lors de la conception UX/UI.



L’organisation doit toutefois conserver une hiérarchie claire entre :



\- information ;

\- alerte ;

\- action ;

\- analyse.



\---



\## 5. En-tête de pilotage



L’en-tête du tableau de bord doit permettre à l’utilisateur de comprendre immédiatement :



\- qu’il se trouve sur le tableau de bord ;

\- la période analysée lorsque cela est pertinent ;

\- son contexte de travail ;

\- les actions rapides disponibles.



Selon les besoins, l’en-tête peut proposer :



\- filtre de période ;

\- actualisation ;

\- recherche ;

\- accès aux notifications ;

\- actions rapides.



\---



\## 6. Indicateurs clés



Le tableau de bord doit présenter des indicateurs synthétiques.



Les indicateurs disponibles dépendent des permissions.



Pour le MVP, les indicateurs peuvent notamment inclure :



\### Location



\- locations en cours ;

\- réservations à venir ;

\- départs du jour ;

\- retours du jour ;

\- véhicules disponibles ;

\- véhicules loués ;

\- véhicules en maintenance.



\### Finance



\- chiffre d’affaires lié aux locations ;

\- montants encaissés ;

\- montants restant à encaisser ;

\- factures impayées ;

\- paiements récents.



\### Parc



\- nombre total de véhicules ;

\- véhicules disponibles ;

\- véhicules en location ;

\- véhicules réservés ;

\- véhicules en maintenance ;

\- véhicules immobilisés.



\### Activité



\- nouvelles réservations ;

\- nouvelles locations ;

\- nouveaux clients ;

\- nouvelles factures.



Les indicateurs doivent être calculés à partir des données réelles du système.



Aucune donnée fictive ne doit être affichée dans un environnement de production.



\---



\## 7. Cartes KPI



Les indicateurs principaux doivent être présentés sous forme de cartes KPI ou d’un composant équivalent.



Chaque carte doit permettre de comprendre rapidement :



\- le nom de l’indicateur ;

\- sa valeur actuelle ;

\- la période concernée ;

\- une éventuelle évolution ;

\- son niveau d’importance ;

\- l’accès à la donnée détaillée lorsque cela est pertinent.



Exemple :



Locations en cours

12



Une carte KPI peut être cliquable lorsqu’elle mène vers la liste correspondante.



Exemple :



Locations en cours

→ Cliquer

→ Liste des locations en cours



\---



\## 8. Filtrage par période



Les indicateurs temporels doivent pouvoir être associés à une période.



Les périodes courantes peuvent comprendre :



\- aujourd’hui ;

\- cette semaine ;

\- ce mois ;

\- ce trimestre ;

\- cette année ;

\- période personnalisée.



Tous les indicateurs ne nécessitent pas obligatoirement un filtre de période.



Le filtre doit être utilisé uniquement lorsqu’il apporte une valeur réelle à l’analyse.



\---



\## 9. Activité de location



La section Activité de location constitue une partie importante du tableau de bord du MVP.



Elle doit permettre de visualiser rapidement :



\- locations en cours ;

\- départs du jour ;

\- retours du jour ;

\- prochaines réservations ;

\- réservations en attente ;

\- locations nécessitant une action.



Les informations importantes doivent être directement accessibles.



Exemple :



Départ prévu aujourd’hui

Client : Société ABC

Véhicule : Toyota T5

Heure : 09:00

Statut : À préparer



L’utilisateur doit pouvoir cliquer sur l’élément pour accéder à la réservation ou à la location concernée.



\---



\## 10. Suivi des départs



Le tableau de bord doit pouvoir présenter les départs prévus.



Informations possibles :



\- client ;

\- véhicule ;

\- date ;

\- heure ;

\- statut ;

\- responsable ;

\- préparation ;

\- contrat ;

\- paiement.



Les départs nécessitant une intervention doivent être identifiables.



\---



\## 11. Suivi des retours



Le tableau de bord doit également permettre de suivre les retours prévus.



Informations possibles :



\- client ;

\- véhicule ;

\- date ;

\- heure ;

\- kilométrage attendu ;

\- état ;

\- statut du retour.



Un retour dépassant l’échéance prévue doit pouvoir générer une alerte ou une notification selon les règles du système.



\---



\## 12. État du parc automobile



Le tableau de bord doit fournir une vision rapide de l’état du parc.



Les catégories principales sont :



\- Disponible ;

\- Réservé ;

\- En location ;

\- En maintenance ;

\- Immobilisé.



Une représentation graphique peut être utilisée si elle améliore la compréhension.



L’utilisateur doit pouvoir accéder à la liste correspondant à chaque statut.



Exemple :



Véhicules en maintenance

→ Cliquer

→ Liste des véhicules concernés



\---



\## 13. Suivi de la maintenance



Le tableau de bord doit permettre d’identifier les véhicules nécessitant une attention particulière.



Il peut notamment afficher :



\- maintenances en cours ;

\- maintenances en retard ;

\- prochaines maintenances ;

\- véhicules immobilisés ;

\- coûts récents de maintenance.



Les informations doivent être filtrées selon les permissions de l’utilisateur.



\---



\## 14. Suivi des documents et échéances



Les véhicules peuvent disposer de documents soumis à des échéances.



Le tableau de bord peut signaler :



\- assurance arrivant à expiration ;

\- visite technique ;

\- document administratif ;

\- échéance de maintenance ;

\- autre document nécessitant un renouvellement.



Les alertes doivent être basées sur les dates réellement enregistrées.



\---



\## 15. Finance



La section Finance doit fournir une vision synthétique des informations financières accessibles à l’utilisateur.



Selon les permissions, elle peut afficher :



\- chiffre d’affaires ;

\- factures clients ;

\- règlements ;

\- créances ;

\- factures fournisseurs ;

\- paiements fournisseurs ;

\- dépenses ;

\- solde bancaire ;

\- solde caisse.



Les informations financières sensibles ne doivent être affichées qu’aux utilisateurs autorisés.



\---



\## 16. Factures clients



Le tableau de bord peut présenter :



\- factures du jour ;

\- factures du mois ;

\- factures impayées ;

\- factures en retard ;

\- montant restant à encaisser.



Un indicateur doit permettre d’accéder à la liste correspondante lorsque cela est pertinent.



\---



\## 17. Factures fournisseurs



Selon les permissions, le tableau de bord peut présenter :



\- factures fournisseurs en attente ;

\- montants à payer ;

\- paiements récents ;

\- échéances ;

\- déductions ou imputations en cours.



Les informations liées aux imputations de maintenance doivent rester traçables.



\---



\## 18. Suivi des imputations fournisseurs



Lorsqu’une dépense de maintenance est imputée à un fournisseur, le tableau de bord peut présenter les opérations nécessitant une attention particulière.



Exemple :



Véhicule : Toyota T5  

Fournisseur : Fournisseur A  

Coût maintenance : 300 000 KMF  

Montant fournisseur initial : 500 000 KMF  

Montant déduit : 300 000 KMF  

Montant net : 200 000 KMF  

Statut : À comptabiliser



Le tableau de bord ne doit jamais présenter uniquement le montant net sans permettre de retrouver l’opération d’origine.



\---



\## 19. Alertes



Les alertes doivent attirer l’attention sur les situations nécessitant une intervention.



Exemples :



\- retour en retard ;

\- véhicule immobilisé ;

\- maintenance urgente ;

\- assurance proche de l’expiration ;

\- document expiré ;

\- facture client en retard ;

\- échéance fournisseur ;

\- réservation nécessitant une action ;

\- opération incomplète.



Les alertes doivent être classées selon leur niveau d’importance.



\---



\## 20. Niveaux d’importance



Le système peut utiliser plusieurs niveaux :



\- Information ;

\- À surveiller ;

\- Important ;

\- Urgent.



La présentation visuelle doit permettre de distinguer les niveaux sans dépendre uniquement de la couleur.



Les informations importantes doivent également être accessibles aux utilisateurs utilisant des écrans de petite taille.



\---



\## 21. Activité récente



Le tableau de bord doit pouvoir présenter les dernières opérations importantes.



Exemples :



\- nouvelle réservation ;

\- nouveau client ;

\- nouveau véhicule ;

\- nouvelle facture ;

\- nouveau paiement ;

\- maintenance enregistrée ;

\- contrat créé ;

\- retour enregistré.



Chaque élément doit pouvoir afficher :



\- type d’action ;

\- utilisateur ;

\- élément concerné ;

\- date ;

\- heure ;

\- statut.



Lorsque cela est pertinent, l’élément doit être cliquable.



\---



\## 22. Actions rapides



Le tableau de bord doit proposer des actions rapides adaptées aux permissions de l’utilisateur.



Exemples :



\- Nouveau client ;

\- Nouvelle réservation ;

\- Nouveau véhicule ;

\- Nouvelle facture ;

\- Nouveau paiement ;

\- Nouvelle maintenance ;

\- Nouvel utilisateur.



Une action non autorisée ne doit pas être proposée.



\---



\## 23. Accès direct depuis les indicateurs



Les indicateurs du tableau de bord doivent servir de points d’entrée vers les données détaillées.



Exemple :



12 locations en cours

→ Liste des locations en cours



5 véhicules en maintenance

→ Liste des véhicules en maintenance



8 factures impayées

→ Liste des factures impayées



Cette logique doit être utilisée lorsque l’information détaillée apporte une réelle utilité.



\---



\## 24. Actualisation des données



Le tableau de bord doit afficher des informations fiables et suffisamment récentes.



Les données doivent être actualisées selon le fonctionnement de l’application.



Une actualisation manuelle peut être proposée lorsque cela est pertinent.



L’interface doit éviter de donner l’impression qu’une donnée est en temps réel si elle ne l’est pas réellement.



\---



\## 25. Gestion des données absentes



Lorsqu’aucune donnée n’existe pour un indicateur, le système doit présenter un état vide compréhensible.



Exemple :



Aucune maintenance prévue.



ou :



Aucun retour prévu aujourd’hui.



Il ne faut pas afficher artificiellement une valeur nulle sans expliquer le contexte lorsque cela pourrait prêter à confusion.



\---



\## 26. Gestion des erreurs



Si une donnée ne peut pas être chargée, le tableau de bord doit afficher un état d’erreur propre.



L’utilisateur doit comprendre :



\- qu’une donnée n’a pas pu être chargée ;

\- quelle section est concernée ;

\- qu’une nouvelle tentative est possible lorsque cela est approprié.



Le système ne doit pas afficher de données inventées pour masquer une erreur de chargement.



\---



\## 27. Permissions et visibilité



Chaque élément du tableau de bord doit respecter les permissions de l’utilisateur.



Exemple :



Un utilisateur sans accès aux données financières ne doit pas voir :



\- chiffre d’affaires ;

\- factures ;

\- paiements ;

\- soldes bancaires ;

\- données financières sensibles.



De même, un utilisateur sans accès à la gestion des utilisateurs ne doit pas voir les informations administratives correspondantes.



Le tableau de bord doit donc être construit dynamiquement à partir des droits de l’utilisateur.



\---



\## 28. Sécurité



Les restrictions du tableau de bord ne doivent pas constituer le seul mécanisme de sécurité.



Même si un indicateur est masqué dans l’interface, les données correspondantes doivent rester protégées au niveau des services et des requêtes.



Un utilisateur ne doit pas pouvoir récupérer une donnée simplement en manipulant l’URL ou les requêtes du navigateur.



\---



\## 29. Responsive design



Le tableau de bord doit être entièrement responsive.



\### Desktop



Le système peut présenter plusieurs cartes et sections sur une même ligne lorsque l’espace le permet.



\### Tablette



Les éléments doivent être réorganisés automatiquement.



\### Mobile



Les cartes et sections doivent s’empiler de manière lisible.



Les informations prioritaires doivent rester accessibles en premier.



Le tableau de bord mobile ne doit pas être une simple réduction du tableau de bord desktop.



\---



\## 30. Performance



Le tableau de bord doit être conçu pour ne pas charger inutilement des données lourdes.



Les requêtes doivent être adaptées aux besoins des indicateurs.



Les informations détaillées ne doivent pas être chargées si elles ne sont pas nécessaires à l’affichage initial.



L’objectif est de conserver un tableau de bord rapide même lorsque le volume de données augmente.



\---



\## 31. Évolutivité



Le tableau de bord doit être conçu de manière modulaire.



De nouveaux widgets ou indicateurs pourront être ajoutés ultérieurement.



Exemples de futures évolutions :



\- rentabilité par véhicule ;

\- taux d’utilisation du parc ;

\- chiffre d’affaires par véhicule ;

\- coût moyen de maintenance ;

\- performance commerciale ;

\- performance par période ;

\- indicateurs de trésorerie avancés ;

\- indicateurs de gestion des projets.



Ces fonctionnalités ne doivent pas être développées dans le MVP si elles ne sont pas nécessaires à son fonctionnement initial.



\---



\## 32. Principes UX



Le tableau de bord doit respecter les principes suivants :



\- hiérarchie visuelle claire ;

\- informations importantes visibles rapidement ;

\- nombre raisonnable de KPI ;

\- absence de surcharge ;

\- actions accessibles ;

\- données compréhensibles ;

\- navigation directe vers les détails ;

\- cohérence avec le reste du SaaS ;

\- responsive design ;

\- accessibilité.



Le tableau de bord doit privilégier la compréhension et l’action plutôt que la quantité d’informations affichées.



\---



\## 33. Critères d’acceptation du module



Le module Tableau de bord sera considéré comme fonctionnel lorsque :



1\. l’utilisateur autorisé peut accéder à son tableau de bord ;

2\. les informations affichées respectent ses permissions ;

3\. les indicateurs sont calculés à partir des données réelles ;

4\. les données de location principales sont visibles ;

5\. l’état du parc peut être consulté ;

6\. les alertes importantes sont visibles ;

7\. les informations financières sont protégées ;

8\. les actions rapides respectent les permissions ;

9\. les indicateurs peuvent mener vers les données détaillées lorsqu’un accès direct est pertinent ;

10\. le tableau de bord fonctionne sur ordinateur, tablette et mobile ;

11\. les erreurs de chargement sont gérées proprement ;

12\. aucune donnée fictive n’est utilisée en production.



\---



\## 34. Principe directeur



Le Tableau de bord d’ADIKOM PILOT doit répondre à une question simple :



\*\*« Que dois-je savoir et que dois-je faire maintenant ? »\*\*



Il doit transformer les données du système en une vision immédiatement exploitable.



Le tableau de bord doit donc privilégier :



\*\*Comprendre → Identifier → Décider → Agir\*\*



Il constitue la porte d’entrée du pilotage d’ADIKOM et doit évoluer avec les besoins de l’entreprise sans devenir inutilement complexe.

