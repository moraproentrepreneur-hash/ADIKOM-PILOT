\# ADIKOM PILOT

\## Workflow 01 — Cycle complet d'une location



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence fonctionnelle  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\# 1. Objet du workflow



Ce document décrit le cycle complet d'une location de véhicule dans ADIKOM PILOT.



Il constitue le workflow de référence reliant les principales étapes opérationnelles et administratives d'une location :



\*\*Demande → Réservation → Préparation → Départ → Location → Retour → Contrôle → Maintenance éventuelle → Facturation → Paiement → Clôture\*\*



Le workflow doit permettre à ADIKOM de suivre une location depuis sa création jusqu'à sa clôture complète, tout en conservant l'historique des opérations réalisées.



\---



\# 2. Objectif



Le système doit permettre de suivre une location de manière structurée et traçable.



À tout moment, un utilisateur autorisé doit pouvoir déterminer :



\- quel client a loué le véhicule ;

\- quel véhicule a été loué ;

\- qui est le fournisseur du véhicule lorsque celui-ci appartient ou est fourni par un fournisseur ;

\- quelle était la période prévue ;

\- quelle était la période réelle ;

\- quel tarif a été appliqué ;

\- quel tarif préférentiel éventuel a été utilisé ;

\- qui a enregistré la réservation ;

\- qui a effectué le départ ;

\- qui a effectué le retour ;

\- dans quel état le véhicule est revenu ;

\- s'il existe un dommage ou un incident ;

\- si une maintenance est nécessaire ;

\- si une dépense de maintenance a été engagée ;

\- si cette dépense est imputable au fournisseur ;

\- quelle facture client a été générée ;

\- quels paiements ont été effectués ;

\- quel est le solde restant.



\---



\# 3. Vue globale



Le cycle complet est organisé comme suit :



1\. Création de la réservation

2\. Vérification du client

3\. Sélection du véhicule

4\. Vérification de la disponibilité

5\. Détermination du tarif

6\. Validation de la réservation

7\. Préparation du départ

8\. État initial du véhicule

9\. Départ du véhicule

10\. Période de location

11\. Suivi éventuel

12\. Retour du véhicule

13\. Contrôle du véhicule

14\. Identification éventuelle d'un incident ou dommage

15\. Détermination éventuelle d'une maintenance

16\. Maintenance éventuelle

17\. Imputation éventuelle au fournisseur

18\. Calcul final de la location

19\. Facturation

20\. Règlement

21\. Clôture

22\. Conservation de l'historique



\---



\# 4. Acteurs concernés



Selon les permissions qui lui sont attribuées, plusieurs utilisateurs internes peuvent intervenir dans le cycle.



Les principaux acteurs sont :



\- Gérant ;

\- Assistant(e) de direction ;

\- Responsable Tourisme \& Mobilité ;

\- Responsable Support \& Logistique ;

\- Responsable Administration \& Finance ;

\- Responsable Commercial \& Développement ;

\- utilisateur habilité à gérer les locations ;

\- utilisateur habilité à gérer la maintenance ;

\- utilisateur habilité à gérer la facturation ;

\- utilisateur habilité à gérer les paiements.



Une même personne peut exercer plusieurs responsabilités lorsque l'organisation d'ADIKOM le nécessite.



Le système doit donc associer les actions à l'utilisateur réel ayant effectué l'opération.



\---



\# 5. Étape 1 — Création de la réservation



Le cycle commence lorsqu'ADIKOM reçoit une demande de location.



Une réservation peut être créée à partir d'une demande client ou directement par un utilisateur autorisé.



La réservation doit contenir au minimum les informations nécessaires à son traitement :



\- client ;

\- véhicule ou catégorie souhaitée ;

\- date de départ ;

\- date de retour prévue ;

\- besoins particuliers ;

\- tarif applicable lorsque celui-ci est déterminé ;

\- informations complémentaires.



\---



\# 6. Vérification du client



Avant de finaliser la réservation, l'utilisateur doit pouvoir sélectionner un client existant dans le module \*\*Tiers\*\*.



Si le client n'existe pas, un utilisateur disposant de la permission nécessaire peut créer sa fiche.



Le système ne doit pas créer plusieurs fiches pour un même client sans raison.



\---



\# 7. Tarif préférentiel client



Lorsqu'un client dispose d'un tarif préférentiel enregistré dans sa fiche, le système doit pouvoir l'identifier.



Exemple :



Tarif standard :

500 000 KMF



Tarif préférentiel du client :

450 000 KMF



Le système doit afficher clairement le tarif applicable.



L'utilisateur doit pouvoir comprendre pourquoi le tarif proposé diffère du tarif standard.



\---



\# 8. Validation du tarif



Le tarif finalement appliqué à la réservation doit être enregistré.



Une fois la réservation validée, le montant applicable doit être conservé dans le contexte de cette réservation.



Une modification ultérieure de la grille tarifaire ne doit pas modifier automatiquement une réservation déjà validée.



\---



\# 9. Vérification de la disponibilité



Avant de confirmer la réservation, le système doit vérifier que le véhicule est disponible pour la période demandée.



La disponibilité doit notamment tenir compte :



\- des autres réservations ;

\- des locations en cours ;

\- des périodes de maintenance ;

\- des indisponibilités ;

\- des autres événements empêchant l'utilisation du véhicule.



\---



\# 10. Prévention des conflits



Un même véhicule ne doit pas pouvoir être attribué à deux locations incompatibles.



Exemple :



Location A :

01/09 → 05/09



Location B :

03/09 → 07/09



Le système doit détecter le conflit et empêcher une réservation incohérente.



\---



\# 11. Véhicule fourni par un fournisseur



Un véhicule peut être associé à un fournisseur.



Exemple :



Fournisseur A

→ Toyota T5

→ Véhicule exploité par ADIKOM

→ Location client



Cette relation doit être conservée pendant toute la durée du cycle.



Elle devient particulièrement importante lorsqu'une maintenance doit être imputée au fournisseur.



\---



\# 12. Validation de la réservation



Lorsque les informations sont correctes, la réservation peut être validée par un utilisateur autorisé.



La réservation passe alors dans l'état correspondant à la logique définie dans le module Gestion de location.



Le système doit enregistrer :



\- utilisateur ayant validé ;

\- date ;

\- heure ;

\- informations essentielles de la réservation.



\---



\# 13. Modification d'une réservation



Une réservation peut être modifiée uniquement par un utilisateur disposant de la permission nécessaire.



Toute modification importante doit être contrôlée.



Exemples :



\- changement de véhicule ;

\- changement de période ;

\- changement de client ;

\- changement de tarif ;

\- modification importante des conditions.



Les modifications sensibles doivent être historisées.



\---



\# 14. Préparation du départ



Avant le départ, ADIKOM doit préparer le véhicule.



La préparation peut comprendre :



\- vérification du véhicule ;

\- vérification de sa disponibilité ;

\- vérification des documents nécessaires ;

\- préparation des clés ;

\- contrôle de l'état général ;

\- préparation du dossier de location.



\---



\# 15. État initial du véhicule



Avant le départ, l'état du véhicule doit être enregistré.



Le contrôle peut notamment porter sur :



\- carrosserie ;

\- intérieur ;

\- pneus ;

\- carburant ;

\- kilométrage ;

\- équipements ;

\- accessoires ;

\- dommages existants.



Les dommages déjà présents doivent être distingués des dommages pouvant apparaître pendant la location.



\---



\# 16. Preuves de l'état initial



Lorsque le système le permet, des photos ou documents peuvent être associés au départ.



L'objectif est de disposer d'un état de référence.



Cela permet notamment de comparer :



\*\*État au départ\*\*



avec



\*\*État au retour\*\*



\---



\# 17. Départ du véhicule



Lorsque le véhicule est remis au client, l'opération de départ est enregistrée.



Elle doit notamment confirmer :



\- client ;

\- véhicule ;

\- réservation ;

\- date et heure réelles ;

\- kilométrage initial ;

\- carburant initial lorsque suivi ;

\- état initial ;

\- utilisateur ayant effectué le départ.



\---



\# 18. Passage de réservation à location



Une réservation validée devient une location lorsque le véhicule est effectivement remis au client.



Le système doit conserver le lien :



\*\*Réservation → Location\*\*



La réservation ne doit pas disparaître après le départ.



Elle doit rester accessible dans l'historique.



\---



\# 19. Période de location



Pendant la location, le véhicule est considéré comme affecté au client selon les conditions enregistrées.



Le système doit pouvoir connaître :



\- client actuel ;

\- véhicule ;

\- date de début ;

\- date de retour prévue ;

\- statut de la location.



\---



\# 20. Prolongation



Lorsque le client demande une prolongation, l'utilisateur autorisé doit pouvoir modifier la période de location.



Avant validation de la prolongation, le système doit vérifier la disponibilité future du véhicule.



La nouvelle date de retour doit être enregistrée.



Le tarif supplémentaire éventuel doit être calculé ou enregistré selon les règles de tarification.



\---



\# 21. Retour prévu



À l'approche de la date de retour prévue, le système peut générer une notification interne.



Cette notification peut être adressée aux utilisateurs concernés selon leurs permissions.



Le Centre de notifications peut notamment signaler :



\- retour proche ;

\- retour prévu aujourd'hui ;

\- retour dépassé.



\---



\# 22. Retour du véhicule



Lorsque le client restitue le véhicule, l'opération de retour est enregistrée.



Le système doit notamment enregistrer :



\- date et heure réelles ;

\- kilométrage final ;

\- carburant final lorsque suivi ;

\- état du véhicule ;

\- dommages éventuels ;

\- observations ;

\- utilisateur ayant effectué le retour.



\---



\# 23. Comparaison départ / retour



Le système doit permettre de comparer les informations du départ et du retour.



Exemples :



Kilométrage initial :

50 000 km



Kilométrage final :

50 450 km



Distance parcourue :

450 km



Carburant initial :

3/4



Carburant final :

1/2



État initial :

Bon



État final :

Dommage identifié sur la carrosserie



\---



\# 24. Contrôle du véhicule au retour



Le véhicule doit être inspecté au retour.



Le contrôle peut porter sur :



\- carrosserie ;

\- intérieur ;

\- pneus ;

\- moteur ;

\- équipements ;

\- accessoires ;

\- kilométrage ;

\- carburant ;

\- dommages ;

\- anomalies mécaniques.



\---



\# 25. Aucun problème détecté



Si aucun problème n'est détecté :



La location peut poursuivre son processus normal de clôture.



Le véhicule peut redevenir disponible après validation du retour, sous réserve des règles de disponibilité définies par ADIKOM.



\---



\# 26. Incident ou dommage détecté



Si un incident ou un dommage est détecté, le système doit permettre de l'enregistrer.



L'incident doit pouvoir être relié à :



\- location ;

\- client ;

\- véhicule ;

\- date ;

\- description ;

\- utilisateur ;

\- photos ou justificatifs lorsque disponibles.



\---



\# 27. Véhicule nécessitant une maintenance



Si le contrôle du retour révèle une panne ou un problème mécanique, le véhicule peut être placé en maintenance.



Le statut du véhicule doit refléter son indisponibilité.



Il ne doit pas être proposé à une nouvelle location tant que son indisponibilité n'est pas levée.



\---



\# 28. Création d'une maintenance



La maintenance doit être créée à partir du problème identifié lorsque cela est pertinent.



Elle doit pouvoir contenir :



\- véhicule ;

\- fournisseur ou prestataire de maintenance ;

\- motif ;

\- description ;

\- date ;

\- statut ;

\- coût estimé ;

\- coût réel ;

\- documents ;

\- observations.



\---



\# 29. Dépense de maintenance



Lorsqu'ADIKOM paie ou engage une dépense pour réparer le véhicule, cette dépense doit être enregistrée.



Exemple :



Réparation Toyota T5 :

300 000 KMF



Le système doit conserver le montant et son justificatif lorsque disponible.



\---



\# 30. Maintenance imputable au fournisseur



Lorsque le véhicule est fourni par un fournisseur et que la dépense de maintenance doit être déduite du montant dû à ce fournisseur, l'opération doit être enregistrée comme une \*\*imputation fournisseur\*\*.



Exemple :



Fournisseur A :

500 000 KMF dus



Maintenance :

300 000 KMF



Imputation :

300 000 KMF



Solde fournisseur :

200 000 KMF



Cette opération doit être traçable.



\---



\# 31. Séparation entre maintenance et imputation



La maintenance et l'imputation sont deux opérations différentes.



\*\*Maintenance :\*\*



Le véhicule a nécessité une intervention.



\*\*Imputation :\*\*



ADIKOM déduit tout ou partie du coût de cette intervention du montant dû au fournisseur.



Une maintenance peut donc exister sans imputation.



\---



\# 32. Retour à la disponibilité



Une fois la maintenance terminée, le véhicule peut redevenir disponible.



Le système doit vérifier :



\- maintenance terminée ;

\- véhicule contrôlé ;

\- éventuels documents disponibles ;

\- éventuelles réparations complémentaires ;

\- absence d'autre indisponibilité.



Le changement de statut doit être enregistré.



\---



\# 33. Calcul final de la location



Après le retour, le système doit déterminer le montant final de la location.



Le calcul peut prendre en compte :



\- tarif appliqué ;

\- durée réelle ;

\- prolongation ;

\- services supplémentaires ;

\- frais applicables ;

\- éventuelles autres lignes de facturation autorisées.



Le montant final doit être validé avant facturation lorsque nécessaire.



\---



\# 34. Tarif réellement appliqué



Le montant final doit respecter le tarif qui avait été validé pour le client.



Si le client bénéficie d'un tarif préférentiel, le système doit conserver le tarif réellement appliqué.



Exemple :



Tarif standard :

500 000 KMF



Tarif préférentiel :

450 000 KMF



Tarif appliqué :

450 000 KMF



La facture doit reprendre :



450 000 KMF



\---



\# 35. Facturation



Une fois la location prête à être facturée, une facture client peut être créée.



La facture doit être liée à la location.



Relation :



\*\*Client → Location → Facture\*\*



La facture doit reprendre les informations nécessaires sans obliger l'utilisateur à les saisir à nouveau.



\---



\# 36. Facture issue de la location



La facture peut notamment contenir :



\- client ;

\- référence de la location ;

\- véhicule ;

\- période ;

\- tarif ;

\- services supplémentaires ;

\- montant total ;

\- échéance ;

\- conditions de paiement.



Le numéro de facture est généré selon les règles de Facturation \& Paiement.



\---



\# 37. Paiement



Lorsque le client règle la facture, le règlement est enregistré dans Facturation \& Paiement.



Le règlement doit être lié à :



\- client ;

\- facture ;

\- montant ;

\- date ;

\- mode de paiement ;

\- compte bancaire ou caisse lorsque applicable.



\---



\# 38. Paiement partiel



Le client peut régler une partie de la facture.



Exemple :



Facture :

450 000 KMF



Premier paiement :

200 000 KMF



Solde :

250 000 KMF



Le système doit conserver le règlement partiel et maintenir la facture dans le statut approprié.



\---



\# 39. Paiement complet



Lorsque le total des règlements atteint le montant dû :



Facture :

450 000 KMF



Règlements :

200 000 + 250 000 KMF



Solde :

0 KMF



La facture peut passer au statut :



\*\*Payée\*\*



\---



\# 40. Liaison avec Banques \& Caisses



Lorsqu'un paiement est enregistré, il doit pouvoir être relié au compte financier utilisé.



Exemple :



Client

→ Facture

→ Règlement

→ Caisse principale



ou :



Client

→ Facture

→ Règlement

→ Compte bancaire



Cette relation permet d'assurer la continuité entre l'activité de location et la trésorerie.



\---



\# 41. Clôture de la location



Une location peut être considérée comme clôturée lorsque les opérations nécessaires ont été traitées.



Selon le cas, cela peut comprendre :



\- retour enregistré ;

\- contrôle effectué ;

\- incident traité ;

\- maintenance traitée lorsque nécessaire ;

\- montant final déterminé ;

\- facture créée ;

\- paiement traité ou solde identifié.



La clôture ne doit pas supprimer l'historique.



\---



\# 42. Location clôturée mais facture impayée



Une location peut être clôturée opérationnellement même si la facture n'est pas encore entièrement payée.



Dans ce cas :



Location :

Clôturée



Facture :

Impayée / Partiellement payée



Solde :

250 000 KMF



Le système doit conserver les deux informations séparément.



\---



\# 43. Historique complet



Une fois la location clôturée, l'ensemble de son historique doit rester accessible selon les permissions.



Le dossier de location doit permettre de retrouver notamment :



\- réservation ;

\- départ ;

\- retour ;

\- état du véhicule ;

\- incidents ;

\- maintenance ;

\- imputation éventuelle ;

\- facturation ;

\- paiements.



\---



\# 44. Traçabilité



Chaque étape importante doit être associée à un utilisateur.



Exemple :



Réservation créée par :

Utilisateur A



Départ effectué par :

Utilisateur B



Retour effectué par :

Utilisateur C



Maintenance enregistrée par :

Utilisateur D



Facture créée par :

Utilisateur E



Paiement enregistré par :

Utilisateur F



Cette traçabilité permet de comprendre le déroulement réel d'une location.



\---



\# 45. Gestion des statuts



Le cycle doit utiliser des statuts cohérents.



Exemple conceptuel :



\*\*Réservation\*\*



\- Brouillon

\- Confirmée

\- Annulée



\*\*Location\*\*



\- À venir

\- En cours

\- Retour en attente

\- Retournée

\- Clôturée

\- Annulée



\*\*Véhicule\*\*



\- Disponible

\- Réservé

\- En location

\- Maintenance

\- Indisponible



Les statuts définitifs seront alignés avec les workflows détaillés des fichiers suivants.



\---



\# 46. Règle de disponibilité



Le système doit toujours prendre en compte le statut réel du véhicule.



Un véhicule :



\- en location ;

\- en maintenance ;

\- indisponible



ne doit pas être proposé comme disponible pour une nouvelle location lorsque les périodes se chevauchent.



\---



\# 47. Règle d'intégrité



Une location ne doit pas pouvoir être considérée comme correctement clôturée si des informations essentielles manquent.



Exemples :



\- véhicule absent ;

\- client absent ;

\- date de départ absente ;

\- retour incohérent ;

\- montant impossible à déterminer.



Le système doit signaler les éléments manquants.



\---



\# 48. Cas d'annulation



Une réservation peut être annulée avant le départ selon les permissions et règles d'ADIKOM.



L'annulation doit être tracée.



Une location déjà commencée ne doit pas être simplement supprimée.



Elle doit être traitée selon le processus métier approprié.



\---



\# 49. Cas de retour anticipé



Si le client retourne le véhicule avant la date prévue, le système doit enregistrer la date réelle de retour.



Le montant final doit être déterminé selon les règles tarifaires applicables.



La modification ne doit pas être effectuée manuellement sans conserver l'information de la période initialement prévue.



\---



\# 50. Cas de retour tardif



Si le véhicule est retourné après la date prévue, le système doit identifier l'écart.



Exemple :



Retour prévu :

25/08 à 10h00



Retour réel :

26/08 à 14h00



Le système doit permettre d'identifier le retard et d'appliquer, lorsque les règles métier le prévoient, les frais correspondants.



\---



\# 51. Cas de prolongation validée



Si le client prolonge officiellement la location avant le retour :



Date initiale :

25/08



Nouvelle date :

28/08



Le système doit enregistrer la prolongation.



Il ne doit pas considérer cette situation comme un simple retard.



La différence entre :



\*\*prolongation validée\*\*



et



\*\*retour tardif non prévu\*\*



doit être conservée.



\---



\# 52. Cas de dommage sans maintenance immédiate



Un dommage peut être identifié sans nécessiter immédiatement une réparation.



Dans ce cas :



\- l'incident est enregistré ;

\- le véhicule peut rester disponible ou être placé en indisponibilité selon sa gravité ;

\- une maintenance peut être créée ultérieurement.



La décision doit être tracée.



\---



\# 53. Cas de dommage nécessitant une maintenance



Si le dommage nécessite une réparation :



Location

→ Retour

→ Incident

→ Maintenance



Le véhicule devient indisponible jusqu'à résolution du problème.



Si le véhicule est fourni par un fournisseur et que la dépense est imputable à celui-ci :



Maintenance

→ Dépense

→ Imputation fournisseur



\---



\# 54. Exemple complet



\## Réservation



Client :

Société ABC



Véhicule :

Toyota T5



Fournisseur :

Fournisseur A



Tarif standard :

500 000 KMF



Tarif préférentiel :

450 000 KMF



Période :

20/08/2026 → 23/08/2026



\---



\## Départ



Kilométrage :

50 000 km



Carburant :

3/4



État :

Bon



\---



\## Location



Le client utilise le véhicule pendant la période prévue.



\---



\## Retour



Kilométrage :

50 450 km



Carburant :

1/2



Dommage :

Panne mécanique



\---



\## Maintenance



Coût de réparation :

300 000 KMF



\---



\## Imputation fournisseur



Montant dû au fournisseur :

500 000 KMF



Imputation :

300 000 KMF



Solde :

200 000 KMF



\---



\## Facturation client



Tarif appliqué :

450 000 KMF



Facture :

450 000 KMF



\---



\## Paiement client



Premier paiement :

200 000 KMF



Solde :

250 000 KMF



Deuxième paiement :

250 000 KMF



Solde :

0 KMF



\---



\## Résultat final



Location :

Clôturée



Facture client :

Payée



Véhicule :

Maintenance terminée



Fournisseur :

200 000 KMF restant dû avant éventuel règlement



Toutes les opérations restent liées et traçables.



\---



\# 55. Vue synthétique du workflow



Le cycle complet peut être représenté ainsi :



\*\*CLIENT\*\*



↓



\*\*RÉSERVATION\*\*



↓



\*\*VÉRIFICATION DISPONIBILITÉ\*\*



↓



\*\*TARIFICATION\*\*



↓



\*\*CONFIRMATION\*\*



↓



\*\*PRÉPARATION\*\*



↓



\*\*DÉPART\*\*



↓



\*\*LOCATION EN COURS\*\*



↓



\*\*RETOUR\*\*



↓



\*\*CONTRÔLE\*\*



↓



\*\*Incident ?\*\*



→ Non → \*\*Calcul final\*\*



→ Oui → \*\*Maintenance / Traitement\*\*



↓



\*\*Maintenance imputable au fournisseur ?\*\*



→ Non → \*\*Suite normale\*\*



→ Oui → \*\*Imputation fournisseur\*\*



↓



\*\*FACTURATION\*\*



↓



\*\*PAIEMENT\*\*



↓



\*\*SOLDE ?\*\*



→ Oui → \*\*Suivi du solde\*\*



→ Non → \*\*Clôture financière\*\*



↓



\*\*CLÔTURE DE LA LOCATION\*\*



↓



\*\*HISTORIQUE CONSERVÉ\*\*



\---



\# 56. Relations entre les modules



Le cycle complet fait intervenir plusieurs modules.



\### Tiers



Fournit :



\- client ;

\- fournisseur.



\### Gestion de location



Gère :



\- réservation ;

\- véhicule ;

\- location ;

\- départ ;

\- retour ;

\- incident ;

\- maintenance.



\### Facturation \& Paiement



Gère :



\- facture ;

\- règlement ;

\- imputation fournisseur.



\### Banques \& Caisses



Gère :



\- mouvements financiers ;

\- comptes ;

\- caisses ;

\- écritures.



\### Centre de notifications



Gère :



\- alertes ;

\- échéances ;

\- événements importants.



\### Utilisateurs \& Groupes



Gère :



\- identité des utilisateurs ;

\- permissions ;

\- traçabilité des actions.



\---



\# 57. Principe de séparation des responsabilités



Chaque module doit conserver sa responsabilité.



Exemple :



\*\*Tiers\*\*

→ Qui est le client ?



\*\*Gestion de location\*\*

→ Quel véhicule est loué et dans quelles conditions ?



\*\*Maintenance\*\*

→ Que faut-il réparer ?



\*\*Imputation\*\*

→ Qui doit supporter financièrement la dépense ?



\*\*Facturation\*\*

→ Combien le client doit-il payer ?



\*\*Paiement\*\*

→ Combien a-t-il réellement payé ?



\*\*Banques \& Caisses\*\*

→ Où l'argent est-il entré ou sorti ?



Cette séparation doit être conservée dans l'architecture du SaaS.



\---



\# 58. Critères d'acceptation du workflow



Le cycle complet d'une location sera considéré comme correctement implémenté lorsque :



1\. une réservation peut être créée ;

2\. un client peut être associé à la réservation ;

3\. un véhicule peut être sélectionné ;

4\. la disponibilité peut être vérifiée ;

5\. les conflits de période sont empêchés ;

6\. le tarif applicable peut être déterminé ;

7\. les tarifs préférentiels sont pris en compte ;

8\. le tarif réellement appliqué est conservé ;

9\. la réservation peut être confirmée ;

10\. le départ peut être enregistré ;

11\. l'état initial du véhicule peut être enregistré ;

12\. la location peut être suivie ;

13\. une prolongation peut être gérée ;

14\. le retour peut être enregistré ;

15\. l'état final peut être comparé à l'état initial ;

16\. un incident peut être enregistré ;

17\. une maintenance peut être créée ;

18\. le véhicule peut être rendu indisponible pendant la maintenance ;

19\. une dépense de maintenance peut être enregistrée ;

20\. une dépense peut être imputée au fournisseur lorsque les règles le permettent ;

21\. l'imputation est distincte du paiement ;

22\. le montant final de la location peut être déterminé ;

23\. une facture peut être liée à la location ;

24\. les paiements peuvent être enregistrés ;

25\. les paiements partiels sont gérés ;

26\. le solde est calculé correctement ;

27\. les mouvements financiers peuvent être reliés à Banques \& Caisses ;

28\. la location peut être clôturée ;

29\. l'historique complet est conservé ;

30\. les actions importantes sont traçables ;

31\. les permissions sont respectées à chaque étape.



\---



\# 59. Principe directeur



Le cycle complet d'une location dans ADIKOM PILOT doit permettre de suivre une opération de bout en bout sans rupture d'information.



Le principe est :



\*\*Réserver → Préparer → Partir → Louer → Retourner → Contrôler → Réparer si nécessaire → Imputer si nécessaire → Facturer → Encaisser → Clôturer → Archiver\*\*



Chaque étape doit être reliée à la précédente et à la suivante lorsque cela est nécessaire.



Le système doit permettre à ADIKOM de répondre à tout moment à trois questions fondamentales :



\*\*Qu'est-il arrivé au véhicule ?\*\*



\*\*Qu'est-il arrivé à la location ?\*\*



\*\*Qu'est-il arrivé à l'argent ?\*\*



La réponse doit être disponible dans ADIKOM PILOT à travers les relations entre les modules, les opérations et l'historique.

