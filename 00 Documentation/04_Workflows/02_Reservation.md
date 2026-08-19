\# ADIKOM PILOT

\## Workflow 02 — Réservation d'un véhicule



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence fonctionnelle  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\# 1. Objet du workflow



Ce document décrit le processus complet de création, de vérification, de validation, de modification et d'annulation d'une réservation de véhicule dans ADIKOM PILOT.



La réservation constitue le point de départ opérationnel d'une location.



Elle doit permettre à ADIKOM de savoir :



\- qui souhaite louer ;

\- quel véhicule ou quelle catégorie est demandée ;

\- pour quelle période ;

\- à quel tarif ;

\- selon quelles conditions ;

\- si le véhicule est disponible ;

\- qui a créé la réservation ;

\- qui l'a validée ;

\- dans quel état se trouve la réservation.



Le workflow doit empêcher les doubles réservations et garantir la cohérence entre réservation, disponibilité, tarif et future location.



\---



\# 2. Principe général



Le processus de réservation suit le schéma :



\*\*Demande → Identification du client → Sélection du véhicule → Vérification disponibilité → Tarification → Validation → Confirmation → Préparation de la location\*\*



La réservation ne constitue pas encore une location.



La location commence uniquement lorsque le véhicule est effectivement remis au client et que l'opération de départ est enregistrée.



\---



\# 3. Acteurs concernés



Selon les permissions attribuées, la réservation peut être créée ou gérée par :



\- Gérant ;

\- Assistant(e) de direction ;

\- Responsable Tourisme \& Mobilité ;

\- Responsable Commercial \& Développement ;

\- utilisateur habilité à gérer les réservations.



Une même personne peut exercer plusieurs de ces responsabilités.



Toutes les actions doivent être associées à l'utilisateur réellement connecté.



\---



\# 4. Création d'une réservation



Une réservation peut être créée lorsqu'un client souhaite réserver un véhicule pour une période déterminée.



L'utilisateur doit accéder au module :



\*\*Gestion de location → Réservations → Nouvelle réservation\*\*



Le formulaire doit être clair et rapide à utiliser.



\---



\# 5. Identification du client



La première étape consiste à identifier le client.



L'utilisateur doit pouvoir :



\- rechercher un client existant ;

\- sélectionner sa fiche ;

\- consulter les informations essentielles ;

\- créer un nouveau client si nécessaire et si ses permissions l'autorisent.



Le client doit provenir du module \*\*Tiers\*\*.



Il ne faut pas créer une nouvelle fiche client directement dans la réservation.



\---



\# 6. Client existant



Lorsqu'un client existe déjà, le système doit récupérer ses informations utiles.



Exemples :



\- nom ;

\- coordonnées ;

\- type de client ;

\- tarif préférentiel ;

\- conditions particulières ;

\- informations nécessaires à la location.



L'objectif est d'éviter les saisies répétitives.



\---



\# 7. Tarif préférentiel du client



La fiche client peut contenir un tarif préférentiel.



Exemple :



Tarif standard :

500 000 KMF



Tarif préférentiel :

450 000 KMF



Lors de la création de la réservation, le système doit pouvoir identifier cette règle et proposer le tarif correspondant.



\---



\# 8. Validation du tarif préférentiel



Le système doit clairement indiquer lorsqu'un tarif préférentiel est appliqué.



Exemple :



\*\*Tarif standard : 500 000 KMF\*\*



\*\*Tarif préférentiel client : 450 000 KMF\*\*



\*\*Tarif proposé : 450 000 KMF\*\*



L'utilisateur autorisé doit pouvoir vérifier le montant avant de confirmer la réservation.



\---



\# 9. Historisation du tarif



Le tarif finalement retenu pour la réservation doit être enregistré dans le contexte de la réservation.



Une modification ultérieure du tarif préférentiel du client ne doit pas modifier automatiquement une réservation déjà validée.



Exemple :



Réservation A :

450 000 KMF



Le tarif du client passe ensuite à :

470 000 KMF



La réservation A reste à :

450 000 KMF



sauf modification volontaire et autorisée de la réservation.



\---



\# 10. Sélection du véhicule



L'utilisateur doit pouvoir sélectionner :



\- un véhicule précis ;

\- ou une catégorie de véhicule lorsque le fonctionnement métier le permet.



Lorsque le véhicule est sélectionné, le système doit afficher les informations essentielles.



Exemples :



\- marque ;

\- modèle ;

\- immatriculation ;

\- catégorie ;

\- statut ;

\- fournisseur ;

\- caractéristiques utiles.



\---



\# 11. Véhicule appartenant ou étant fourni par un fournisseur



Un véhicule peut être associé à un fournisseur.



Exemple :



\*\*Fournisseur A\*\*



→ Toyota T5



→ Exploitée par ADIKOM



→ Disponible à la location



Cette relation doit être conservée.



Elle sera notamment nécessaire si le véhicule nécessite ultérieurement une maintenance imputable au fournisseur.



\---



\# 12. Date et heure de départ



La réservation doit obligatoirement définir la période souhaitée.



Le formulaire doit permettre de renseigner :



\- date de départ ;

\- heure de départ lorsque nécessaire.



Exemple :



20/08/2026

08:00



\---



\# 13. Date et heure de retour



La réservation doit également définir :



\- date de retour prévue ;

\- heure de retour prévue lorsque nécessaire.



Exemple :



23/08/2026

18:00



\---



\# 14. Contrôle de cohérence des dates



Le système doit vérifier que :



\- la date de retour n'est pas antérieure au départ ;

\- les heures sont cohérentes ;

\- la durée est positive ;

\- les informations obligatoires sont renseignées.



Une réservation incohérente ne doit pas pouvoir être validée.



\---



\# 15. Vérification de disponibilité



Après sélection du véhicule et de la période, le système doit vérifier la disponibilité.



La disponibilité doit prendre en compte :



\- locations existantes ;

\- réservations confirmées ;

\- maintenance ;

\- indisponibilité ;

\- autres périodes bloquées.



\---



\# 16. Conflit de réservation



Le système doit empêcher la création d'une réservation confirmée lorsqu'un conflit existe.



Exemple :



Véhicule :

Toyota T5



Réservation existante :

20/08 → 25/08



Nouvelle demande :

23/08 → 27/08



Résultat :



\*\*Véhicule indisponible sur la période demandée.\*\*



L'utilisateur doit être invité à choisir :



\- un autre véhicule ;

\- une autre période ;

\- une autre catégorie lorsque disponible.



\---



\# 17. Disponibilité future



La disponibilité doit être vérifiée sur toute la période de réservation.



Un véhicule actuellement disponible mais déjà réservé pour une partie de la période ne doit pas être présenté comme entièrement disponible.



Exemple :



Aujourd'hui :

Véhicule disponible



Période demandée :

20/08 → 30/08



Réservation existante :

25/08 → 28/08



Le système doit détecter le conflit.



\---



\# 18. Véhicule en maintenance



Un véhicule en maintenance ne doit pas être proposé comme disponible pour une réservation couvrant sa période d'indisponibilité.



Exemple :



Maintenance :

20/08 → 24/08



Demande :

21/08 → 23/08



Résultat :



\*\*Indisponible.\*\*



\---



\# 19. Véhicule indisponible



D'autres situations peuvent rendre un véhicule indisponible.



Exemples :



\- accident ;

\- panne ;

\- immobilisation administrative ;

\- contrôle ;

\- problème documentaire.



Le système doit respecter le statut réel du véhicule.



\---



\# 20. Catégorie de véhicule



Lorsque la demande porte sur une catégorie plutôt qu'un véhicule précis, le système peut afficher les véhicules disponibles appartenant à cette catégorie.



Exemple :



Catégorie :

SUV



Véhicules disponibles :



\- Toyota T5 ;

\- véhicule B ;

\- véhicule C.



L'utilisateur peut alors sélectionner le véhicule approprié selon les règles d'ADIKOM.



\---



\# 21. Calcul du tarif



Le système doit déterminer le tarif applicable à la réservation.



Le calcul peut dépendre notamment de :



\- véhicule ;

\- catégorie ;

\- durée ;

\- tarif standard ;

\- tarif préférentiel ;

\- conditions particulières.



Le montant final proposé doit être visible avant validation.



\---



\# 22. Tarif manuel



Si une modification manuelle du tarif est autorisée, elle doit être contrôlée par les permissions.



L'utilisateur ne doit pas pouvoir modifier librement un tarif sans disposer de la permission nécessaire.



Lorsqu'un tarif est modifié manuellement, le système doit conserver une trace de cette modification lorsque cela est nécessaire.



\---



\# 23. Motif d'une modification tarifaire



Lorsqu'un utilisateur autorisé modifie exceptionnellement le tarif, le système peut demander un motif.



Exemple :



Tarif standard :

500 000 KMF



Tarif appliqué :

450 000 KMF



Motif :

Condition commerciale validée par la direction.



Cette information peut être conservée dans l'historique de la réservation.



\---



\# 24. Services supplémentaires



Une réservation peut éventuellement prévoir des services supplémentaires.



Exemples :



\- équipement ;

\- service complémentaire ;

\- prestation spécifique.



Ces éléments doivent pouvoir être enregistrés séparément du tarif principal lorsqu'ils sont nécessaires.



\---



\# 25. Conditions particulières



La réservation doit pouvoir contenir des observations ou conditions particulières.



Exemples :



\- heure particulière ;

\- lieu de remise ;

\- besoin spécifique ;

\- demande particulière du client.



Les notes doivent rester liées à la réservation.



\---



\# 26. Informations de remise



Lorsque nécessaire, la réservation peut préciser le lieu prévu pour la remise du véhicule.



Exemples :



\- agence ADIKOM ;

\- aéroport ;

\- hôtel ;

\- autre lieu autorisé.



Cette information doit être visible lors de la préparation du départ.



\---



\# 27. Informations de restitution



La réservation peut également prévoir le lieu de restitution.



Il peut être :



\- identique au lieu de départ ;

\- différent.



Cette information doit être connue avant le départ lorsque cela est nécessaire à l'organisation.



\---



\# 28. Statut de la réservation



Le système doit gérer des statuts permettant de suivre l'avancement.



Les statuts de base recommandés sont :



\- Brouillon ;

\- En attente ;

\- Confirmée ;

\- Annulée ;

\- Convertie en location.



Les statuts exacts doivent rester cohérents avec le reste du module Gestion de location.



\---



\# 29. Brouillon



Une réservation en brouillon est en cours de préparation.



Elle peut être modifiée.



Elle ne doit pas nécessairement bloquer définitivement le véhicule selon les règles de réservation retenues.



Cette distinction doit être claire afin d'éviter de bloquer inutilement le parc automobile.



\---



\# 30. En attente



Une réservation peut être placée en attente lorsqu'une validation ou une information supplémentaire est nécessaire.



Exemples :



\- validation commerciale ;

\- confirmation client ;

\- disponibilité à confirmer ;

\- information manquante.



\---



\# 31. Confirmation



Lorsqu'une réservation est confirmée :



\- le véhicule est considéré comme réservé pour la période ;

\- le statut est mis à jour ;

\- les informations sont figées selon les règles applicables ;

\- l'opération peut passer à la phase de préparation.



\---



\# 32. Blocage du véhicule



Une réservation confirmée doit bloquer la disponibilité du véhicule sur la période concernée.



Cette règle est essentielle pour éviter les doubles réservations.



\---



\# 33. Annulation



Une réservation peut être annulée selon les permissions et règles d'ADIKOM.



L'annulation doit :



\- modifier le statut ;

\- libérer le véhicule pour la période ;

\- conserver l'historique ;

\- enregistrer qui a effectué l'annulation ;

\- enregistrer la date et l'heure.



Une réservation annulée ne doit pas être simplement supprimée.



\---



\# 34. Motif d'annulation



Le système peut demander un motif d'annulation.



Exemples :



\- client a annulé ;

\- véhicule indisponible ;

\- changement de dates ;

\- autre motif.



Le motif peut être conservé dans l'historique.



\---



\# 35. Modification de la période



Une réservation confirmée peut nécessiter un changement de période.



Exemple :



20/08 → 23/08



devient :



21/08 → 25/08



Le système doit refaire une vérification de disponibilité avant d'accepter la modification.



\---



\# 36. Modification du véhicule



Un utilisateur autorisé peut remplacer le véhicule réservé.



Avant validation :



\- vérifier le nouveau véhicule ;

\- vérifier sa disponibilité ;

\- vérifier la catégorie ;

\- vérifier le tarif ;

\- conserver l'historique de la modification.



\---



\# 37. Modification du client



Le changement de client sur une réservation existante doit être fortement contrôlé.



Une telle modification peut avoir des conséquences sur :



\- tarif ;

\- conditions ;

\- facturation ;

\- historique.



Elle doit donc être réservée aux utilisateurs disposant des permissions appropriées.



\---



\# 38. Modification du tarif



Une modification du tarif doit être contrôlée.



Le système doit conserver autant que nécessaire :



\- ancien montant ;

\- nouveau montant ;

\- utilisateur ;

\- date ;

\- motif.



L'objectif est de conserver la traçabilité commerciale.



\---



\# 39. Confirmation de la réservation



Lorsque toutes les conditions sont remplies, l'utilisateur valide la réservation.



Le système doit vérifier avant validation :



\- client ;

\- véhicule ;

\- période ;

\- disponibilité ;

\- tarif ;

\- conditions essentielles.



Si une donnée obligatoire manque, la validation doit être refusée.



\---



\# 40. Résumé avant validation



Avant la confirmation, l'interface doit présenter un résumé clair.



Exemple :



\*\*Client\*\*

Société ABC



\*\*Véhicule\*\*

Toyota T5



\*\*Départ\*\*

20/08/2026 — 08:00



\*\*Retour\*\*

23/08/2026 — 18:00



\*\*Tarif standard\*\*

500 000 KMF



\*\*Tarif préférentiel\*\*

450 000 KMF



\*\*Total prévu\*\*

450 000 KMF



L'utilisateur doit pouvoir vérifier les informations avant de confirmer.



\---



\# 41. Création de la réservation



Après validation, le système génère un identifiant unique.



Exemple :



RES-2026-000001



Le format définitif sera défini lors de l'implémentation.



L'identifiant doit être unique.



\---



\# 42. Historique de la réservation



Le système doit conserver les événements importants.



Exemple :



20/08 — Création  

20/08 — Tarif préférentiel appliqué  

20/08 — Réservation confirmée  

21/08 — Véhicule modifié  

22/08 — Date de retour prolongée



L'historique doit identifier l'utilisateur ayant effectué chaque action.



\---



\# 43. Notification interne



Lorsqu'une réservation est confirmée, le Centre de notifications peut informer les utilisateurs concernés.



Exemples :



\- équipe location ;

\- Assistant(e) de direction ;

\- responsable concerné.



La notification doit respecter les permissions.



\---



\# 44. Préparation du départ



Une réservation confirmée doit alimenter la préparation du départ.



Les utilisateurs autorisés doivent pouvoir retrouver :



\- client ;

\- véhicule ;

\- date ;

\- heure ;

\- lieu ;

\- tarif ;

\- conditions ;

\- informations particulières.



\---



\# 45. Conversion en location



Une réservation confirmée devient une location lorsque le véhicule est effectivement remis au client.



Le système doit créer ou activer le dossier de location associé.



Relation :



\*\*Réservation → Location\*\*



La réservation reste consultable dans l'historique.



\---



\# 46. Annulation après préparation



Si une réservation est annulée après que certaines opérations de préparation ont été réalisées, l'historique doit rester intact.



Le système doit conserver les informations déjà enregistrées.



\---



\# 47. Réservation sans véhicule définitif



Lorsque le fonctionnement métier le permet, une réservation peut être créée pour une catégorie sans sélectionner immédiatement un véhicule précis.



Exemple :



Client :

Société ABC



Catégorie :

SUV



Période :

20/08 → 23/08



Le véhicule précis peut être attribué ultérieurement.



Cette fonctionnalité doit toutefois respecter les règles de disponibilité.



\---



\# 48. Attribution ultérieure



Lorsqu'un véhicule est finalement attribué à une réservation sans véhicule précis, le système doit :



\- vérifier sa disponibilité ;

\- enregistrer l'attribution ;

\- mettre à jour la réservation ;

\- conserver l'historique.



\---



\# 49. Double réservation



Le système doit empêcher toute double réservation incompatible.



Ce contrôle doit être réalisé côté serveur.



Il ne doit pas dépendre uniquement de l'affichage du calendrier.



Même si deux utilisateurs tentent simultanément de réserver le même véhicule, la base de données et la logique serveur doivent empêcher une incohérence.



\---



\# 50. Contrôle des permissions



Les actions disponibles dépendent des permissions de l'utilisateur.



Exemple :



Utilisateur A :

✓ Voir les réservations



Utilisateur B :

✓ Voir

✓ Créer



Utilisateur C :

✓ Voir

✓ Créer

✓ Modifier

✓ Annuler



Le système doit contrôler les permissions côté serveur.



\---



\# 51. Recherche des réservations



La liste des réservations doit permettre une recherche par :



\- numéro ;

\- client ;

\- véhicule ;

\- période ;

\- statut.



\---



\# 52. Filtres



Les filtres peuvent inclure :



\- aujourd'hui ;

\- demain ;

\- cette semaine ;

\- période personnalisée ;

\- statut ;

\- véhicule ;

\- client ;

\- catégorie.



\---



\# 53. Vue calendrier



La Gestion de location doit idéalement proposer une vue calendrier des réservations.



Cette vue permet de visualiser :



\- périodes réservées ;

\- périodes libres ;

\- locations en cours ;

\- maintenances ;

\- indisponibilités.



Elle doit faciliter la détection visuelle des conflits.



\---



\# 54. Vue par véhicule



Le système peut permettre de consulter le planning d'un véhicule.



Exemple :



\*\*Toyota T5\*\*



20/08 → 23/08

Société ABC



24/08 → 25/08

Disponible



26/08 → 30/08

Client XYZ



Cette vue facilite la planification du parc automobile.



\---



\# 55. Vue par client



Le système peut permettre de consulter l'historique des réservations d'un client.



Exemple :



Client :

Société ABC



Réservations :



\- RES-001 — Toyota T5 — Confirmée ;

\- RES-004 — SUV — Annulée ;

\- RES-008 — Toyota T5 — Convertie en location.



\---



\# 56. Disponibilité en temps réel



Lorsque l'utilisateur consulte les véhicules disponibles, le système doit utiliser les données actuelles.



La disponibilité doit prendre en compte les dernières réservations, locations et maintenances enregistrées.



\---



\# 57. Conflit détecté lors de la validation



Si un autre utilisateur a réservé le véhicule entre l'ouverture du formulaire et sa validation, le système doit refaire la vérification.



Exemple :



Utilisateur A ouvre le formulaire.



Toyota T5 :

Disponible.



Utilisateur B confirme une réservation entre-temps.



Utilisateur A clique sur confirmer.



Le système doit détecter que Toyota T5 n'est plus disponible.



La réservation d'A doit être refusée ou nécessiter une nouvelle sélection.



\---



\# 58. Paiement ou acompte



Si ADIKOM décide de gérer un acompte à la réservation, cette opération doit être intégrée avec Facturation \& Paiement.



Elle ne doit pas être enregistrée comme une simple information textuelle.



Le système doit distinguer :



\- réservation ;

\- facture ;

\- règlement.



Cette fonctionnalité peut être activée selon les règles commerciales définies par ADIKOM.



\---



\# 59. Documents



La réservation peut être associée à des documents lorsque nécessaire.



Exemples :



\- demande client ;

\- justificatif ;

\- document administratif ;

\- confirmation.



Les documents doivent être accessibles uniquement aux utilisateurs autorisés.



\---



\# 60. Traçabilité



Chaque opération importante doit enregistrer :



\- utilisateur ;

\- date ;

\- heure ;

\- action.



Exemples :



Création :

Utilisateur A



Confirmation :

Utilisateur B



Modification :

Utilisateur C



Annulation :

Utilisateur D



\---



\# 61. Exemple complet



\### Demande



Client :

Société ABC



Demande :

Toyota T5



Période :

20/08/2026 → 23/08/2026



\---



\### Vérification client



Le client existe dans Tiers.



Tarif préférentiel :

450 000 KMF



\---



\### Vérification véhicule



Toyota T5 :



Statut :

Disponible



Aucune réservation concurrente.



Aucune maintenance.



\---



\### Tarif



Tarif standard :

500 000 KMF



Tarif préférentiel :

450 000 KMF



Tarif retenu :

450 000 KMF



\---



\### Confirmation



Réservation :



RES-2026-000001



Statut :

Confirmée



Le véhicule est bloqué sur la période.



\---



\### Départ



Le 20/08/2026 :



Le véhicule est remis au client.



La réservation devient :



\*\*Location en cours\*\*



\---



\# 62. Cas d'annulation



\### Situation



Réservation :



RES-2026-000001



Statut :

Confirmée



Le client annule.



\### Action



Utilisateur autorisé :



→ Annule la réservation.



\### Résultat



Statut :

Annulée



Le véhicule :

Disponible



Historique :

Conservé



\---



\# 63. Cas de modification



\### Situation initiale



Toyota T5



20/08 → 23/08



\### Demande client



21/08 → 25/08



\### Contrôle



Le système vérifie la disponibilité du véhicule jusqu'au 25/08.



\### Résultat



Si disponible :



Modification validée.



Si indisponible :



Modification refusée ou proposition d'une autre solution.



\---



\# 64. Cas de prolongation



\### Situation



Location issue de la réservation :



20/08 → 23/08



Le client demande :



→ jusqu'au 25/08.



Le système vérifie la disponibilité du véhicule.



Si le véhicule est disponible :



→ prolongation validée.



Sinon :



→ demande refusée ou autre véhicule proposé selon les règles d'ADIKOM.



\---



\# 65. Critères d'acceptation du workflow



Le workflow de réservation sera considéré comme correctement implémenté lorsque :



1\. une réservation peut être créée ;

2\. un client existant peut être sélectionné ;

3\. un nouveau client peut être créé selon les permissions ;

4\. les informations du client sont récupérées ;

5\. les tarifs préférentiels sont détectés ;

6\. le tarif applicable est visible ;

7\. le tarif retenu est historisé ;

8\. un véhicule peut être sélectionné ;

9\. la catégorie peut être sélectionnée lorsque nécessaire ;

10\. la disponibilité est vérifiée ;

11\. les réservations concurrentes sont détectées ;

12\. les maintenances bloquent la disponibilité ;

13\. les périodes incohérentes sont refusées ;

14\. une réservation peut être enregistrée ;

15\. un numéro unique est généré ;

16\. une réservation peut être confirmée ;

17\. une réservation confirmée bloque la période ;

18\. une réservation peut être modifiée selon les permissions ;

19\. une réservation peut être annulée selon les permissions ;

20\. l'historique est conservé ;

21\. les utilisateurs concernés peuvent être notifiés ;

22\. une réservation peut être convertie en location ;

23\. les permissions sont respectées ;

24\. les contrôles critiques sont réalisés côté serveur ;

25\. les conflits simultanés sont empêchés ;

26\. le planning peut être consulté ;

27\. l'ensemble du processus est traçable.



\---



\# 66. Principe directeur



Le workflow de réservation doit garantir qu'une réservation est :



\*\*Identifiée\*\*



\*\*Vérifiée\*\*



\*\*Tarifée\*\*



\*\*Contrôlée\*\*



\*\*Confirmée\*\*



\*\*Traçable\*\*



et finalement :



\*\*Convertie en location\*\*



Le principe fondamental est :



\*\*Aucune réservation confirmée sans client identifié, période cohérente, véhicule ou catégorie déterminée, disponibilité vérifiée et tarif validé.\*\*



Une réservation doit constituer une base fiable pour toute la suite du cycle :



\*\*Réservation → Départ → Location → Retour → Facturation → Paiement\*\*



Le système doit empêcher les conflits, préserver l'historique et permettre à ADIKOM de connaître à tout moment l'état exact de chaque réservation.

