\# ADIKOM PILOT

\## Module 02 — Centre de notifications



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence fonctionnelle  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\## 1. Objet du module



Le Centre de notifications constitue le système d’alerte et d’information interne d’ADIKOM PILOT.



Il doit permettre aux utilisateurs autorisés d’être informés des événements, échéances, anomalies ou actions nécessitant leur attention.



Le module ne doit pas être conçu comme une simple liste de messages.



Il doit fonctionner comme un véritable système de surveillance opérationnelle permettant de transformer les événements du SaaS en informations exploitables.



Le Centre de notifications doit notamment permettre de :



\- signaler une action à effectuer ;

\- prévenir d’une échéance ;

\- signaler une anomalie ;

\- informer d’un changement important ;

\- rappeler une opération ;

\- orienter directement l’utilisateur vers l’élément concerné.



\---



\## 2. Objectifs



Le module doit permettre de :



1\. centraliser les notifications internes ;

2\. éviter qu’une information importante soit oubliée ;

3\. signaler les échéances ;

4\. détecter les situations nécessitant une intervention ;

5\. informer les utilisateurs des événements importants ;

6\. permettre un accès direct à l’objet concerné ;

7\. différencier les niveaux d’importance ;

8\. respecter les permissions de chaque utilisateur ;

9\. conserver un historique des notifications ;

10\. préparer progressivement un système d’alertes intelligent.



\---



\## 3. Principe général



Une notification doit toujours être liée à un événement réel du système.



Le système ne doit jamais générer artificiellement des notifications pour remplir l’interface.



Le principe est :



Événement

&#x20;  ↓

Analyse des règles

&#x20;  ↓

Vérification des permissions

&#x20;  ↓

Création de la notification

&#x20;  ↓

Utilisateur concerné

&#x20;  ↓

Action éventuelle



Exemple :



Retour de véhicule prévu demain

&#x20;  ↓

Règle de notification

&#x20;  ↓

Utilisateur responsable

&#x20;  ↓

Notification

&#x20;  ↓

Accès à la location concernée



\---



\## 4. Types de notifications



Le système doit pouvoir distinguer plusieurs catégories.



\### 4.1. Information



Notification destinée à informer l’utilisateur d’un événement normal.



Exemples :



\- nouvelle réservation ;

\- nouveau client ;

\- paiement enregistré ;

\- nouvelle facture ;

\- véhicule ajouté.



\### 4.2. Rappel



Notification destinée à rappeler une échéance ou une action future.



Exemples :



\- départ prévu demain ;

\- retour prévu demain ;

\- maintenance prévue ;

\- réunion prévue ;

\- échéance documentaire.



\### 4.3. Attention



Notification indiquant qu’une situation mérite une vérification.



Exemples :



\- paiement en attente ;

\- réservation incomplète ;

\- document proche de l’expiration ;

\- maintenance non clôturée.



\### 4.4. Important



Notification concernant une situation ayant un impact significatif.



Exemples :



\- véhicule immobilisé ;

\- facture importante en retard ;

\- retour non enregistré ;

\- opération financière nécessitant une validation.



\### 4.5. Urgent



Notification nécessitant une intervention rapide.



Exemples :



\- incident important sur un véhicule en location ;

\- véhicule immobilisé pendant une location ;

\- situation financière nécessitant une intervention immédiate ;

\- problème critique identifié par le système.



\---



\## 5. Structure d’une notification



Chaque notification doit contenir suffisamment d’informations pour être comprise rapidement.



Elle peut notamment contenir :



\- titre ;

\- message ;

\- type ;

\- niveau d’importance ;

\- date ;

\- heure ;

\- utilisateur concerné ;

\- module d’origine ;

\- objet concerné ;

\- statut lu/non lu ;

\- lien vers l’élément ;

\- éventuelle action requise.



Exemple :



Titre :

\*\*Retour de véhicule prévu aujourd’hui\*\*



Message :

\*\*La Toyota T5 louée par Société ABC doit être retournée aujourd’hui à 16:00.\*\*



Origine :

\*\*Gestion de location\*\*



Action :

\*\*Voir la location\*\*



\---



\## 6. Notifications liées à la gestion de location



La gestion de location constitue l’une des principales sources de notifications du MVP.



Le système doit pouvoir générer des notifications concernant :



\- nouvelles réservations ;

\- modifications de réservation ;

\- annulations ;

\- départs imminents ;

\- retours imminents ;

\- retours en retard ;

\- contrat incomplet ;

\- paiement manquant ;

\- véhicule indisponible ;

\- véhicule immobilisé ;

\- dommage déclaré ;

\- maintenance nécessaire ;

\- maintenance en retard ;

\- assurance proche de l’expiration ;

\- document arrivant à expiration.



\---



\## 7. Notifications de réservation



Lorsqu’une nouvelle réservation est créée, une notification peut être générée pour les utilisateurs concernés.



Exemple :



\*\*Nouvelle réservation\*\*



Une nouvelle réservation a été créée pour :



Client : Société ABC  

Véhicule : Toyota T5  

Début : 20/08/2026  

Fin : 23/08/2026



Action :



\*\*Voir la réservation\*\*



La notification ne doit être envoyée qu’aux utilisateurs concernés par la gestion de cette opération.



\---



\## 8. Notifications de départ



Le système doit pouvoir prévenir les utilisateurs concernés lorsqu’un départ approche.



Exemples :



\- départ dans 24 heures ;

\- départ dans quelques heures ;

\- préparation incomplète ;

\- contrat non finalisé ;

\- paiement non enregistré ;

\- véhicule non disponible.



Une notification de départ doit permettre d’accéder directement à la réservation ou à la location concernée.



\---



\## 9. Notifications de retour



Le système doit pouvoir prévenir les utilisateurs concernant les retours.



Exemples :



\- retour prévu aujourd’hui ;

\- retour prévu dans 24 heures ;

\- retour dépassé ;

\- retour non enregistré ;

\- contrôle de retour à effectuer.



Un retour dépassant l’heure ou la date prévue peut générer une notification d’attention ou d’urgence selon les règles définies.



\---



\## 10. Notifications liées aux véhicules



Le Centre de notifications doit pouvoir signaler les événements importants concernant les véhicules.



Exemples :



\- véhicule passé en maintenance ;

\- véhicule immobilisé ;

\- maintenance terminée ;

\- assurance proche de l’expiration ;

\- document expirant prochainement ;

\- véhicule devenu disponible ;

\- véhicule réservé ;

\- véhicule affecté à une location.



\---



\## 11. Notifications de maintenance



Les maintenances doivent pouvoir générer plusieurs types de notifications.



Exemples :



Maintenance prévue

&#x20;  ↓

Rappel avant échéance



Maintenance en retard

&#x20;  ↓

Notification d’attention



Panne signalée

&#x20;  ↓

Notification importante



Véhicule immobilisé

&#x20;  ↓

Notification urgente



Maintenance terminée

&#x20;  ↓

Notification d’information



Les utilisateurs recevant ces notifications doivent être déterminés selon leurs responsabilités et permissions.



\---



\## 12. Notifications financières



Le Centre de notifications peut également recevoir des événements provenant de la facturation et des paiements.



Exemples :



\- nouvelle facture ;

\- facture en retard ;

\- paiement reçu ;

\- paiement partiel ;

\- paiement manquant ;

\- échéance fournisseur ;

\- nouvelle facture fournisseur ;

\- opération financière nécessitant une validation.



Les notifications financières doivent respecter les permissions.



Un utilisateur sans accès aux informations financières ne doit pas recevoir de notification contenant des informations financières confidentielles.



\---



\## 13. Notifications fournisseurs



Les fournisseurs peuvent être concernés par plusieurs événements.



Exemples :



\- nouvelle facture fournisseur ;

\- facture fournisseur en attente ;

\- paiement fournisseur ;

\- maintenance imputable au fournisseur ;

\- déduction à effectuer ;

\- solde fournisseur modifié.



Une notification liée à une imputation fournisseur doit permettre de retrouver l’opération d’origine.



Exemple :



Véhicule : Toyota T5  

Fournisseur : Fournisseur A  

Coût de maintenance : 300 000 KMF  

Montant à imputer : 300 000 KMF



Action :



\*\*Voir l’opération\*\*



\---



\## 14. Notifications liées aux tarifs préférentiels



Lorsqu’un client dispose d’un tarif préférentiel, certaines actions peuvent nécessiter une notification.



Exemples :



\- création d’un tarif préférentiel ;

\- modification d’un tarif préférentiel ;

\- expiration prochaine d’un tarif ;

\- tarif préférentiel appliqué à une réservation.



Les notifications doivent permettre de retrouver la fiche client ou la réservation concernée.



\---



\## 15. Notifications liées aux projets



Le module Projets \& Planification peut générer des notifications concernant :



\- nouvelle tâche ;

\- tâche attribuée ;

\- échéance proche ;

\- tâche en retard ;

\- modification d’un projet ;

\- réunion prévue ;

\- rendez-vous prévu ;

\- action à effectuer ;

\- décision enregistrée.



Exemple :



\*\*Tâche arrivant à échéance\*\*



La tâche « Préparer le dossier fournisseur » arrive à échéance demain.



Action :



\*\*Voir la tâche\*\*



\---



\## 16. Notifications liées aux utilisateurs



Les événements administratifs peuvent également générer des notifications.



Exemples :



\- création d’un utilisateur ;

\- désactivation d’un utilisateur ;

\- modification importante des permissions ;

\- ajout d’un utilisateur à un groupe ;

\- changement de groupe.



Ces notifications doivent être limitées aux utilisateurs autorisés à consulter les informations administratives.



\---



\## 17. Centre de notifications dans l’interface



Le Centre de notifications doit être accessible depuis la navigation principale.



L’interface peut proposer :



\- une icône de notification ;

\- un compteur de notifications non lues ;

\- une liste rapide ;

\- un accès au centre complet.



Exemple :



Notifications

\[5]



Le compteur doit être mis à jour selon l’état réel des notifications.



\---



\## 18. Liste des notifications



La page complète du Centre de notifications doit permettre de consulter les notifications.



Elle peut proposer des filtres par :



\- toutes ;

\- non lues ;

\- lues ;

\- importantes ;

\- urgentes ;

\- catégorie ;

\- module ;

\- période.



Les filtres doivent rester simples et ne pas surcharger l’interface.



\---



\## 19. Notification lue et non lue



Chaque notification doit posséder un état.



États minimum :



\- non lue ;

\- lue.



Lorsqu’une notification est ouverte, elle peut être automatiquement marquée comme lue selon le comportement UX retenu.



L’utilisateur doit également pouvoir marquer manuellement une notification comme lue.



Une notification importante ne doit pas disparaître simplement parce qu’elle a été lue.



Elle doit rester disponible dans l’historique tant que les règles de conservation le permettent.



\---



\## 20. Marquer toutes les notifications comme lues



Le système peut proposer une action :



\*\*Tout marquer comme lu\*\*



Cette action doit uniquement modifier l’état de lecture.



Elle ne doit pas supprimer les notifications.



\---



\## 21. Accès direct à l’objet concerné



Lorsqu’une notification provient d’un objet précis du système, elle doit pouvoir contenir un lien direct.



Exemple :



Notification

→ Réservation

→ Fiche réservation



Ou :



Notification

→ Facture

→ Fiche facture



Ou :



Notification

→ Véhicule

→ Fiche véhicule



L’accès doit évidemment être vérifié par les permissions.



Si l’utilisateur n’a plus accès à l’objet, la notification ne doit pas permettre de contourner les restrictions.



\---



\## 22. Notification et permissions



Le système doit vérifier les permissions avant de créer ou d’afficher une notification.



Le principe est :



Événement

&#x20;  ↓

Utilisateur concerné ?

&#x20;  ↓

Permission suffisante ?

&#x20;  ↓

Oui → Notification

Non → Aucune notification



Une notification ne doit jamais être utilisée pour révéler une information à laquelle l’utilisateur n’a pas accès.



\---



\## 23. Notifications personnelles



Certaines notifications peuvent être directement destinées à un utilisateur.



Exemples :



\- tâche attribuée ;

\- rendez-vous personnel ;

\- action demandée ;

\- validation demandée ;

\- rappel personnel.



Ces notifications doivent être visibles uniquement par les utilisateurs concernés, sauf si les règles métier prévoient un partage.



\---



\## 24. Notifications collectives



Certaines notifications peuvent concerner plusieurs utilisateurs.



Exemple :



Une panne importante d’un véhicule peut concerner :



\- responsable location ;

\- Support \& Logistique ;

\- Direction.



Le système peut créer une notification pour chacun des utilisateurs concernés selon leurs permissions et responsabilités.



Chaque utilisateur doit conserver son propre état de lecture.



\---



\## 25. Priorisation



Les notifications doivent pouvoir être classées selon leur importance.



Une logique possible est :



Urgent

↓

Important

↓

À surveiller

↓

Information



Les notifications urgentes doivent être particulièrement visibles.



Cependant, l’interface ne doit pas transformer chaque événement en urgence.



Le niveau doit être déterminé par la règle métier concernée.



\---



\## 26. Éviter la surcharge de notifications



Le système doit éviter de générer des notifications inutiles.



Une notification doit être créée uniquement lorsqu’elle apporte une information ou une action utile.



Il faut éviter notamment :



\- doublons ;

\- notifications répétitives sans changement ;

\- alertes sans action possible ;

\- notifications pour chaque petite modification sans importance.



Le système doit privilégier la pertinence à la quantité.



\---



\## 27. Déduplication



Une même situation ne doit pas générer une quantité excessive de notifications identiques.



Exemple :



Si une facture est en retard depuis plusieurs jours, le système ne doit pas créer inutilement une nouvelle notification identique à chaque consultation du tableau de bord.



Une logique de déduplication doit pouvoir être prévue.



\---



\## 28. Rappels automatiques



Certaines notifications doivent pouvoir être générées automatiquement à l’approche d’une échéance.



Exemples :



\- retour prévu demain ;

\- maintenance prévue dans 7 jours ;

\- assurance expirant dans 30 jours ;

\- facture arrivant à échéance ;

\- réunion prévue demain.



Les délais exacts pourront être configurables dans les paramètres du système.



\---



\## 29. Notifications générées par changement d’état



Un changement d’état important peut déclencher une notification.



Exemples :



Réservation

En attente

→ Confirmée



Véhicule

Disponible

→ En location



Véhicule

En location

→ En maintenance



Facture

En attente

→ Payée



Ces événements peuvent générer une notification lorsqu’ils sont pertinents pour un utilisateur.



\---



\## 30. Notifications liées aux anomalies



Le système doit pouvoir signaler certaines incohérences.



Exemples :



\- véhicule affecté à deux locations incompatibles ;

\- réservation sans véhicule ;

\- retour non enregistré ;

\- facture sans information obligatoire ;

\- paiement incohérent ;

\- opération nécessitant une validation.



Ces notifications doivent être clairement distinguées des simples informations.



\---



\## 31. Historique des notifications



Le système doit conserver un historique des notifications générées.



L’historique doit pouvoir permettre de retrouver :



\- date ;

\- heure ;

\- type ;

\- origine ;

\- utilisateur destinataire ;

\- objet concerné ;

\- statut ;

\- date de lecture.



L’historique constitue un outil de suivi et non nécessairement un journal d’audit complet.



Le journal d’audit des actions sensibles doit être traité séparément.



\---



\## 32. Suppression des notifications



La suppression d’une notification ne doit pas supprimer l’événement ou l’objet à l’origine de celle-ci.



Le système doit distinguer :



Notification

et

Donnée métier



Exemple :



Supprimer une notification de retour ne doit jamais supprimer la réservation ou la location.



Selon la conception retenue, la suppression peut être remplacée par :



\- archivage ;

\- masquage ;

\- conservation dans l’historique.



\---



\## 33. Notifications et tableau de bord



Le Centre de notifications doit être intégré au Tableau de bord.



Le Tableau de bord peut afficher :



\- nombre de notifications non lues ;

\- alertes importantes ;

\- alertes urgentes ;

\- prochaines échéances.



Le Centre de notifications reste cependant l’endroit principal pour consulter l’ensemble des notifications.



\---



\## 34. Notifications et actions



Lorsqu’une notification nécessite une intervention, elle doit pouvoir proposer une action.



Exemple :



\*\*Retour en retard\*\*



Action :

\*\*Ouvrir la location\*\*



Ou :



\*\*Facture fournisseur à traiter\*\*



Action :

\*\*Voir la facture\*\*



Ou :



\*\*Maintenance urgente\*\*



Action :

\*\*Voir le véhicule\*\*



L’action doit être adaptée au contexte.



\---



\## 35. Responsive design



Le Centre de notifications doit être entièrement responsive.



\### Desktop



La liste des notifications peut être affichée avec plusieurs informations sur une même ligne.



\### Tablette



Les informations doivent être réorganisées automatiquement.



\### Mobile



La notification doit privilégier :



\- titre ;

\- niveau d’importance ;

\- date ;

\- message ;

\- action.



La consultation doit rester simple avec une interaction adaptée aux écrans tactiles.



\---



\## 36. Performance



Le système doit éviter de charger inutilement l’intégralité de l’historique lors de l’ouverture du Centre de notifications.



La liste doit pouvoir être chargée progressivement lorsque cela est nécessaire.



Les notifications récentes doivent être accessibles rapidement.



\---



\## 37. Sécurité



Les notifications doivent respecter les mêmes exigences de sécurité que les données qu’elles représentent.



Le système doit empêcher :



\- consultation d’une notification appartenant à un autre utilisateur lorsque celle-ci est privée ;

\- accès à un objet non autorisé ;

\- fuite d’informations financières ;

\- fuite d’informations administratives ;

\- contournement des permissions.



Les contrôles doivent être appliqués côté serveur.



\---



\## 38. Évolutivité



Le Centre de notifications doit être conçu pour pouvoir évoluer.



Des sources supplémentaires pourront être ajoutées ultérieurement.



Exemples :



\- commercial ;

\- ressources humaines ;

\- reporting avancé ;

\- suivi des performances ;

\- intégrations externes ;

\- automatisations.



Ces évolutions ne doivent pas être nécessaires au fonctionnement initial du MVP.



\---



\## 39. Critères d’acceptation du module



Le Centre de notifications sera considéré comme fonctionnel lorsque :



1\. un utilisateur autorisé peut accéder à son Centre de notifications ;

2\. les notifications sont générées à partir d’événements réels ;

3\. les notifications respectent les permissions ;

4\. les notifications peuvent être lues ;

5\. les notifications non lues sont clairement identifiables ;

6\. le compteur de notifications fonctionne correctement ;

7\. les notifications importantes sont distinguables ;

8\. les notifications peuvent renvoyer vers l’objet concerné ;

9\. les notifications financières sont protégées ;

10\. les rappels peuvent être générés selon les règles définies ;

11\. les doublons inutiles sont évités ;

12\. l’historique des notifications est conservé ;

13\. le module est responsive ;

14\. aucune notification ne permet de contourner les permissions.



\---



\## 40. Principe directeur



Le Centre de notifications d’ADIKOM PILOT doit répondre à une question simple :



\*\*« Y a-t-il quelque chose que je dois savoir ou faire maintenant ? »\*\*



Il doit transformer les événements importants du système en informations claires, contextualisées et actionnables.



Le principe directeur est :



\*\*Détecter → Informer → Prioriser → Orienter → Agir\*\*



Le Centre de notifications doit ainsi devenir un véritable système nerveux opérationnel d’ADIKOM PILOT, sans transformer l’application en un flux permanent d’alertes inutiles.

