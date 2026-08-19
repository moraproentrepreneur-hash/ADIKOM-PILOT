\# ADIKOM PILOT

\## Workflow 05 — Maintenance d'un véhicule



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence fonctionnelle  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\# 1. Objet du workflow



Ce document décrit le processus de gestion d'une maintenance de véhicule dans ADIKOM PILOT.



La maintenance peut être déclenchée notamment :



\- après le retour d'un véhicule ;

\- à la suite d'une panne ;

\- à la suite d'un incident ;

\- lors d'un contrôle préventif ;

\- à la suite d'une anomalie constatée pendant l'exploitation ;

\- lorsqu'une intervention planifiée arrive à échéance.



Le workflow doit permettre à ADIKOM de suivre une intervention depuis l'identification du problème jusqu'à sa résolution, tout en conservant :



\- le véhicule concerné ;

\- le fournisseur du véhicule lorsque applicable ;

\- l'origine de la maintenance ;

\- le problème constaté ;

\- l'intervention réalisée ;

\- le prestataire ;

\- le coût ;

\- les justificatifs ;

\- le statut ;

\- l'impact sur la disponibilité du véhicule ;

\- l'éventuelle imputation du coût au fournisseur.



\---



\# 2. Principe général



Le workflow suit le schéma :



\*\*Problème identifié → Maintenance créée → Diagnostic → Intervention → Dépense → Validation → Véhicule disponible\*\*



Lorsque le véhicule appartient ou est fourni par un fournisseur et que les conditions le permettent :



\*\*Maintenance → Dépense → Imputation fournisseur → Solde fournisseur\*\*



La maintenance et l'imputation doivent rester deux opérations distinctes.



\---



\# 3. Origines possibles d'une maintenance



Une maintenance peut avoir plusieurs origines.



\### 3.1 Retour d'une location



Un problème est constaté lors du contrôle du véhicule.



\*\*Retour → Incident → Maintenance\*\*



\### 3.2 Panne



Une panne est constatée pendant ou en dehors d'une location.



\### 3.3 Contrôle



Une anomalie est découverte lors d'une inspection.



\### 3.4 Maintenance préventive



Une intervention doit être réalisée selon un calendrier ou une échéance.



\### 3.5 Autre signalement



Un utilisateur autorisé peut signaler une anomalie nécessitant une intervention.



\---



\# 4. Conditions de création



Une maintenance peut être créée lorsqu'un utilisateur autorisé identifie qu'une intervention est nécessaire.



Le système doit permettre de créer la maintenance depuis :



\- le dossier du véhicule ;

\- le dossier d'une location ;

\- le dossier d'un incident ;

\- le module Gestion de location.



\---



\# 5. Informations principales



Une fiche de maintenance doit pouvoir contenir au minimum :



\- référence de maintenance ;

\- véhicule ;

\- fournisseur du véhicule lorsque applicable ;

\- location liée lorsque applicable ;

\- incident lié lorsque applicable ;

\- origine ;

\- date de création ;

\- date prévue ;

\- motif ;

\- description ;

\- niveau de priorité ;

\- statut ;

\- prestataire ;

\- coût estimé ;

\- coût réel ;

\- justificatifs ;

\- observations ;

\- utilisateur ayant créé la maintenance.



\---



\# 6. Référence de maintenance



Chaque maintenance doit disposer d'un identifiant unique.



Exemple :



\*\*MNT-2026-000001\*\*



Le format définitif sera défini lors de l'implémentation.



La référence doit permettre de retrouver rapidement l'intervention.



\---



\# 7. Véhicule concerné



Chaque maintenance doit obligatoirement être associée à un véhicule.



Exemple :



\*\*Toyota T5\*\*



Les informations principales du véhicule doivent être accessibles depuis la maintenance.



\---



\# 8. Fournisseur du véhicule



Lorsque le véhicule est fourni par un fournisseur, la maintenance doit conserver cette relation.



Exemple :



\*\*Fournisseur : Fournisseur A\*\*



\*\*Véhicule : Toyota T5\*\*



Cette relation est essentielle lorsqu'une dépense de maintenance doit éventuellement être imputée au fournisseur.



\---



\# 9. Location liée



Lorsque la maintenance provient d'un problème constaté pendant ou après une location, elle doit pouvoir être liée à cette location.



Relation :



\*\*Client → Location → Véhicule → Incident → Maintenance\*\*



Cela permet de conserver l'origine du problème.



\---



\# 10. Incident lié



Lorsque la maintenance résulte d'un incident, elle doit pouvoir être liée à celui-ci.



Exemple :



Incident :

Panne mécanique



Maintenance :

Réparation du système concerné



Le système doit éviter de perdre le lien entre le problème constaté et l'intervention réalisée.



\---



\# 11. Origine affichée



La fiche de maintenance doit permettre d'identifier son origine.



Exemples :



\- Retour de location ;

\- Panne ;

\- Incident ;

\- Contrôle ;

\- Maintenance préventive ;

\- Autre.



\---



\# 12. Motif



Le motif doit expliquer pourquoi l'intervention est nécessaire.



Exemples :



\- panne moteur ;

\- problème de freinage ;

\- remplacement d'un pneu ;

\- vidange ;

\- entretien périodique ;

\- problème électrique ;

\- climatisation défectueuse.



\---



\# 13. Description du problème



La description doit permettre de comprendre précisément la situation.



Exemple :



> Lors du retour du véhicule, un bruit inhabituel a été constaté au niveau du moteur. Une vérification mécanique est nécessaire avant toute nouvelle location.



Cette information doit rester accessible dans l'historique.



\---



\# 14. Priorité



La maintenance peut être classée selon son niveau de priorité.



Exemple :



\- Faible ;

\- Normale ;

\- Haute ;

\- Urgente.



La priorité peut influencer la planification et les notifications.



\---



\# 15. Maintenance urgente



Une maintenance urgente correspond à une situation nécessitant une intervention rapide.



Exemples :



\- panne empêchant l'utilisation ;

\- problème de freinage ;

\- problème mécanique critique ;

\- accident.



Le véhicule doit être considéré comme indisponible lorsque sa sécurité ou son fonctionnement est compromis.



\---



\# 16. Statut du véhicule



Lorsqu'une maintenance nécessite l'immobilisation du véhicule, son statut doit être mis à jour.



Exemple :



\*\*En location\*\*



↓



\*\*Retour\*\*



↓



\*\*Maintenance\*\*



Le véhicule ne doit plus être proposé comme disponible pendant son immobilisation.



\---



\# 17. Statuts de maintenance



Les statuts recommandés sont :



\- Brouillon ;

\- Planifiée ;

\- À diagnostiquer ;

\- En cours ;

\- En attente ;

\- Terminée ;

\- Annulée.



Les statuts définitifs pourront être adaptés lors de l'implémentation.



\---



\# 18. Brouillon



Une maintenance en brouillon est en cours de préparation.



Elle peut être complétée avant d'être officiellement planifiée.



\---



\# 19. Planifiée



La maintenance est confirmée et une intervention est prévue.



Le système peut enregistrer :



\- date prévue ;

\- prestataire ;

\- intervention prévue.



\---



\# 20. À diagnostiquer



Le véhicule doit être examiné afin de déterminer précisément le problème et l'intervention nécessaire.



\---



\# 21. En cours



L'intervention a commencé.



Le véhicule reste indisponible lorsque l'intervention l'exige.



\---



\# 22. En attente



La maintenance peut être mise en attente pour différentes raisons.



Exemples :



\- pièce indisponible ;

\- validation nécessaire ;

\- prestataire indisponible ;

\- attente d'un devis ;

\- autre contrainte.



Le motif d'attente doit pouvoir être enregistré.



\---



\# 23. Terminée



La maintenance est terminée lorsque l'intervention a été réalisée et que le véhicule peut être considéré comme traité.



Le véhicule ne doit cependant redevenir disponible qu'après validation de son état.



\---



\# 24. Annulée



Une maintenance peut être annulée selon les permissions.



L'annulation doit être historisée.



La suppression physique de la maintenance doit être évitée lorsqu'elle possède déjà un historique métier.



\---



\# 25. Diagnostic



Avant ou pendant l'intervention, un diagnostic peut être enregistré.



Le diagnostic peut préciser :



\- problème identifié ;

\- cause probable ;

\- pièces nécessaires ;

\- intervention recommandée ;

\- estimation du coût.



\---



\# 26. Devis



Lorsqu'un prestataire fournit un devis, celui-ci peut être associé à la maintenance.



Le devis doit pouvoir contenir :



\- montant ;

\- date ;

\- prestataire ;

\- description ;

\- document justificatif.



\---



\# 27. Validation du devis



Si une validation interne est nécessaire, l'utilisateur autorisé doit pouvoir accepter ou refuser le devis.



L'action doit être historisée.



\---



\# 28. Prestataire



La maintenance peut être réalisée par :



\- un garage ;

\- un mécanicien ;

\- un prestataire externe ;

\- un fournisseur lorsque celui-ci réalise directement l'intervention.



Le prestataire doit pouvoir être identifié.



\---



\# 29. Fournisseur comme prestataire



Le fournisseur du véhicule peut éventuellement être lui-même le prestataire de maintenance.



Le système doit distinguer :



\*\*Fournisseur du véhicule\*\*



et



\*\*Prestataire de maintenance\*\*



même lorsque les deux correspondent à la même entité.



\---



\# 30. Intervention



La maintenance doit permettre de décrire l'intervention réalisée.



Exemples :



\- remplacement d'une pièce ;

\- réparation ;

\- vidange ;

\- changement de pneus ;

\- entretien ;

\- diagnostic ;

\- réparation électrique.



\---



\# 31. Pièces



Lorsque nécessaire, les pièces utilisées peuvent être enregistrées.



Exemple :



\- pièce ;

\- quantité ;

\- prix ;

\- montant total.



La gestion détaillée des stocks peut être ajoutée ultérieurement si ADIKOM active un module Stock.



\---



\# 32. Main-d'œuvre



Le coût de main-d'œuvre peut être enregistré séparément lorsque nécessaire.



Exemple :



Pièces :

200 000 KMF



Main-d'œuvre :

100 000 KMF



Total :

300 000 KMF



Cette séparation facilite la compréhension du coût de maintenance.



\---



\# 33. Coût estimé



Avant l'intervention, le système peut enregistrer un coût estimé.



Exemple :



\*\*Coût estimé : 250 000 KMF\*\*



\---



\# 34. Coût réel



Après intervention, le coût réel doit être enregistré.



Exemple :



Coût estimé :

250 000 KMF



Coût réel :

300 000 KMF



Le système doit conserver les deux valeurs.



\---



\# 35. Écart entre estimation et coût réel



Le système peut calculer automatiquement :



\*\*300 000 − 250 000 = 50 000 KMF\*\*



Écart :

\*\*+50 000 KMF\*\*



Cet indicateur peut être utile au pilotage.



\---



\# 36. Dépense de maintenance



Lorsque ADIKOM engage une dépense pour réparer le véhicule, celle-ci doit être enregistrée.



Exemple :



Réparation :

300 000 KMF



La dépense doit être associée à la maintenance correspondante.



\---



\# 37. Justificatif



Lorsque disponible, le système doit permettre d'associer un justificatif.



Exemples :



\- facture du garage ;

\- reçu ;

\- devis ;

\- bon de réparation ;

\- document justificatif.



Les documents doivent être accessibles selon les permissions.



\---



\# 38. Paiement du prestataire



Le paiement d'une maintenance est une opération financière distincte.



La maintenance enregistre :



\*\*Coût de l'intervention\*\*



Le paiement enregistre :



\*\*Mouvement financier réel\*\*



La liaison entre les deux doit être possible sans les confondre.



\---



\# 39. Maintenance et fournisseur



Lorsque le véhicule est fourni par un fournisseur, ADIKOM peut devoir supporter temporairement ou directement le coût de réparation.



Si les conditions prévoient que cette dépense doit être déduite du montant dû au fournisseur, une imputation peut être créée.



\---



\# 40. Exemple d'imputation



Fournisseur A :



Montant dû :

\*\*500 000 KMF\*\*



Maintenance Toyota T5 :



\*\*300 000 KMF\*\*



Montant imputé :

\*\*300 000 KMF\*\*



Solde fournisseur :



\*\*200 000 KMF\*\*



Le système doit conserver le lien :



\*\*Véhicule → Maintenance → Dépense → Imputation → Fournisseur\*\*



\---



\# 41. Maintenance sans imputation



Toutes les maintenances ne doivent pas être imputées au fournisseur.



Exemple :



Véhicule appartenant à ADIKOM.



Maintenance :

300 000 KMF



Aucune imputation fournisseur.



La dépense reste une charge d'ADIKOM selon son traitement comptable et financier.



\---



\# 42. Imputation partielle



Une maintenance peut être imputée partiellement au fournisseur.



Exemple :



Coût de maintenance :

300 000 KMF



Montant imputable :

200 000 KMF



Montant non imputé :

100 000 KMF



Le système doit permettre de distinguer ces montants.



\---



\# 43. Imputation totale



Lorsque l'intégralité du coût est imputable :



Maintenance :

300 000 KMF



Imputation :

300 000 KMF



Solde non imputé :

0 KMF



Le workflow d'imputation détaillé est défini dans :



\*\*Workflow 06 — Imputation Maintenance Fournisseur\*\*



\---



\# 44. Validation de l'imputation



La création d'une maintenance ne doit pas automatiquement créer une imputation.



L'imputation doit être une opération distincte et autorisée.



Elle peut nécessiter :



\- validation ;

\- justificatif ;

\- décision de la direction ;

\- contrôle du montant.



\---



\# 45. Véhicule immobilisé



Lorsqu'une maintenance nécessite une immobilisation, le véhicule doit rester indisponible.



Exemple :



Maintenance :

20/08 → 23/08



Le calendrier de disponibilité doit bloquer cette période.



\---



\# 46. Fin de maintenance



Lorsque l'intervention est terminée, l'utilisateur autorisé doit enregistrer :



\- date de fin ;

\- intervention réalisée ;

\- coût réel ;

\- résultat ;

\- observations ;

\- documents.



\---



\# 47. Contrôle après réparation



Avant de rendre le véhicule disponible, un contrôle doit être effectué.



Le contrôle peut confirmer :



\- réparation terminée ;

\- problème résolu ;

\- véhicule fonctionnel ;

\- équipements présents ;

\- absence de nouvelle anomalie.



\---



\# 48. Retour à la disponibilité



Si le contrôle est satisfaisant :



\*\*Maintenance\*\*



↓



\*\*Terminée\*\*



↓



\*\*Véhicule disponible\*\*



Le changement doit être enregistré.



\---



\# 49. Maintenance non résolue



Si le problème persiste :



\*\*Maintenance terminée\*\* ne doit pas être utilisé.



La maintenance peut rester :



\*\*En cours\*\*



ou



\*\*En attente\*\*



selon la situation.



Une nouvelle intervention peut être planifiée.



\---



\# 50. Nouvelle maintenance



Si une nouvelle intervention distincte est nécessaire, le système peut créer une nouvelle fiche.



La nouvelle maintenance doit pouvoir être reliée à la précédente lorsque cela est pertinent.



Cela permet de conserver l'historique des interventions.



\---



\# 51. Maintenance préventive



La maintenance ne concerne pas uniquement les pannes.



ADIKOM peut planifier des opérations préventives.



Exemples :



\- vidange ;

\- contrôle ;

\- remplacement périodique ;

\- entretien ;

\- contrôle des pneus.



Ces opérations peuvent être planifiées avant qu'une panne ne survienne.



\---



\# 52. Échéance de maintenance



Une maintenance préventive peut être liée à :



\- une date ;

\- un kilométrage ;

\- une fréquence ;

\- une échéance définie par ADIKOM.



Exemple :



Prochaine vidange :

55 000 km



Le système peut générer une notification lorsque l'échéance approche.



\---



\# 53. Notifications



Le Centre de notifications peut signaler :



\- maintenance à venir ;

\- maintenance urgente ;

\- maintenance en retard ;

\- maintenance en attente ;

\- maintenance terminée ;

\- véhicule toujours indisponible.



Les notifications doivent respecter les permissions.



\---



\# 54. Historique du véhicule



Toutes les maintenances doivent alimenter l'historique du véhicule.



Exemple :



\*\*Toyota T5\*\*



\- 10/01 — Vidange — 80 000 KMF

\- 15/03 — Pneu — 120 000 KMF

\- 23/08 — Réparation mécanique — 300 000 KMF



Cet historique permet de suivre le coût et l'état du véhicule dans le temps.



\---



\# 55. Indicateurs de maintenance



Le système peut calculer des indicateurs tels que :



\- nombre de maintenances ;

\- coût total ;

\- coût moyen ;

\- durée d'immobilisation ;

\- nombre de pannes ;

\- coût par véhicule ;

\- coût par fournisseur ;

\- maintenances préventives ;

\- maintenances correctives.



Ces données peuvent alimenter le Tableau de bord.



\---



\# 56. Coût total de maintenance d'un véhicule



Exemple :



Maintenance 1 :

100 000 KMF



Maintenance 2 :

150 000 KMF



Maintenance 3 :

300 000 KMF



Total :

550 000 KMF



Le système peut utiliser cet indicateur pour aider ADIKOM à évaluer le coût d'exploitation du véhicule.



\---



\# 57. Durée d'immobilisation



Le système peut calculer la durée pendant laquelle un véhicule est indisponible pour maintenance.



Exemple :



Début :

20/08 — 10:00



Fin :

22/08 — 15:00



Durée :

selon l'unité de mesure retenue.



Cet indicateur peut être utilisé dans le pilotage du parc.



\---



\# 58. Coût de maintenance par fournisseur



Lorsque les véhicules sont fournis par différents fournisseurs, ADIKOM peut analyser les coûts de maintenance associés.



Exemple :



Fournisseur A :

1 200 000 KMF



Fournisseur B :

500 000 KMF



Cela peut aider à analyser la rentabilité et les conditions de collaboration.



\---



\# 59. Maintenance et location



Une maintenance issue d'une location doit conserver le lien avec celle-ci.



Exemple :



Location :

LOC-2026-0012



Véhicule :

Toyota T5



Incident :

Panne



Maintenance :

MNT-2026-0005



Cette relation permet de retrouver l'origine de la dépense.



\---



\# 60. Maintenance et client



Le client ne doit pas automatiquement être considéré comme responsable d'une maintenance.



Le système doit distinguer :



\- problème mécanique ;

\- usure normale ;

\- dommage ;

\- mauvaise utilisation ;

\- incident ;

\- autre cause.



La responsabilité et la facturation éventuelle doivent être déterminées selon les règles commerciales et opérationnelles d'ADIKOM.



\---



\# 61. Maintenance et facturation client



Si une maintenance entraîne des frais facturables au client, cette facturation doit être enregistrée comme une ligne ou un élément identifiable de la facture.



Le système ne doit pas transformer automatiquement toute maintenance en frais client.



Une règle métier ou une validation doit être appliquée.



\---



\# 62. Maintenance et facture fournisseur



Lorsque la maintenance est imputable à un fournisseur, le coût doit pouvoir être relié au processus de facturation fournisseur.



Exemple :



Facture fournisseur initiale :

500 000 KMF



Imputation maintenance :

300 000 KMF



Montant restant :

200 000 KMF



La facture doit conserver l'historique de cette imputation.



\---



\# 63. Distinction entre imputation et paiement



Exemple :



Facture fournisseur :

500 000 KMF



Imputation :

300 000 KMF



Paiement bancaire :

200 000 KMF



L'imputation n'est pas un paiement.



L'imputation réduit le montant dû.



Le paiement représente le mouvement financier.



Cette distinction est obligatoire pour garantir la cohérence des données.



\---



\# 64. Annulation d'une maintenance



Une maintenance peut être annulée avant son exécution lorsque cela est justifié.



L'annulation doit :



\- changer le statut ;

\- enregistrer le motif ;

\- identifier l'utilisateur ;

\- libérer le véhicule lorsque l'annulation le permet.



Une maintenance déjà réalisée ne doit pas être simplement supprimée.



\---



\# 65. Correction d'une maintenance



Les informations importantes ne doivent pas pouvoir être modifiées sans contrôle après validation.



Exemples :



\- coût réel ;

\- prestataire ;

\- date ;

\- intervention ;

\- imputation.



Toute correction sensible doit être historisée.



\---



\# 66. Documents et justificatifs



Les documents associés à une maintenance doivent être centralisés dans son dossier.



Exemples :



\- devis ;

\- facture ;

\- reçu ;

\- bon de réparation ;

\- photos ;

\- rapport ;

\- justificatif d'imputation.



\---



\# 67. Exemple complet — Maintenance après retour



\## Retour



Toyota T5



Problème :

Panne mécanique



\---



\## Maintenance



Référence :

MNT-2026-0005



Origine :

Retour de location



Statut :

En cours



\---



\## Diagnostic



Problème :

Défaillance mécanique



Coût estimé :

250 000 KMF



\---



\## Intervention



Coût réel :

300 000 KMF



\---



\## Fournisseur



Fournisseur A



Montant dû :

500 000 KMF



\---



\## Imputation



Montant imputé :

300 000 KMF



Solde :

200 000 KMF



\---



\## Fin



Maintenance :

Terminée



Véhicule :

Disponible



Historique :

Conservé



\---



\# 68. Exemple — Maintenance préventive



Véhicule :

Toyota T5



Kilométrage actuel :

54 500 km



Prochaine vidange :

55 000 km



Le système peut générer une alerte lorsque l'échéance approche.



Après intervention :



Coût :

80 000 KMF



Statut :

Terminée



Véhicule :

Disponible



\---



\# 69. Exemple — Maintenance en attente



Problème :

Panne mécanique



Diagnostic :

Pièce nécessaire



Pièce :

Indisponible



Statut :

En attente



Véhicule :

Indisponible



Notification :

Maintenance en attente



Lorsque la pièce arrive :



Statut :

En cours



Puis :



Statut :

Terminée



\---



\# 70. Exemple — Maintenance partiellement imputée



Coût total :

300 000 KMF



Montant imputable au fournisseur :

200 000 KMF



Montant non imputé :

100 000 KMF



Le système doit conserver :



Coût maintenance :

300 000 KMF



Imputation :

200 000 KMF



Reste non imputé :

100 000 KMF



\---



\# 71. Sécurité et permissions



Seuls les utilisateurs autorisés peuvent :



\- créer une maintenance ;

\- modifier une maintenance ;

\- changer son statut ;

\- enregistrer un coût ;

\- valider une intervention ;

\- créer une imputation ;

\- modifier une imputation.



Les contrôles doivent être appliqués côté serveur.



\---



\# 72. Traçabilité



Le système doit enregistrer les actions importantes.



Exemple :



Maintenance créée par :

Utilisateur A



Diagnostic enregistré par :

Utilisateur B



Coût modifié par :

Utilisateur C



Maintenance terminée par :

Utilisateur D



Imputation créée par :

Utilisateur E



Chaque opération doit être identifiable.



\---



\# 73. Relations avec les autres modules



\### Gestion de location



Fournit :



\- véhicule ;

\- location ;

\- incident ;

\- disponibilité.



\### Tiers



Fournit :



\- fournisseur ;

\- prestataire lorsque celui-ci est géré comme tiers.



\### Facturation \& Paiement



Gère :



\- facture fournisseur ;

\- éventuelles dépenses facturables au client ;

\- règlements.



\### Banques \& Caisses



Gère :



\- paiement réel ;

\- mouvements financiers.



\### Centre de notifications



Gère :



\- alertes ;

\- échéances ;

\- maintenance urgente.



\### Tableau de bord



Peut exploiter :



\- coûts ;

\- nombre d'interventions ;

\- immobilisations ;

\- indicateurs.



\### Utilisateurs \& Groupes



Gère :



\- permissions ;

\- identité ;

\- traçabilité.



\---



\# 74. Critères d'acceptation du workflow



Le workflow de maintenance sera considéré comme correctement implémenté lorsque :



1\. une maintenance peut être créée ;

2\. un véhicule est obligatoirement associé ;

3\. le fournisseur du véhicule peut être identifié ;

4\. la location à l'origine du problème peut être liée ;

5\. l'incident peut être lié ;

6\. l'origine de la maintenance est identifiable ;

7\. un motif peut être renseigné ;

8\. une description détaillée peut être enregistrée ;

9\. une priorité peut être définie ;

10\. un statut peut être suivi ;

11\. un diagnostic peut être enregistré ;

12\. un prestataire peut être associé ;

13\. un devis peut être associé lorsque nécessaire ;

14\. un coût estimé peut être enregistré ;

15\. un coût réel peut être enregistré ;

16\. les pièces peuvent être détaillées lorsque nécessaire ;

17\. la main-d'œuvre peut être détaillée lorsque nécessaire ;

18\. un justificatif peut être associé ;

19\. le véhicule peut être placé en maintenance ;

20\. le véhicule ne peut pas être loué pendant son immobilisation ;

21\. la maintenance peut être terminée ;

22\. un contrôle après intervention peut être effectué ;

23\. le véhicule peut redevenir disponible ;

24\. l'historique du véhicule est enrichi ;

25\. les coûts peuvent être analysés ;

26\. une maintenance peut être imputée au fournisseur lorsque les conditions le permettent ;

27\. l'imputation reste distincte du paiement ;

28\. les imputations partielles sont possibles ;

29\. les actions sensibles sont historisées ;

30\. les permissions sont respectées ;

31\. les notifications peuvent être générées ;

32\. les données restent reliées à la location et au véhicule.



\---



\# 75. Principe directeur



La maintenance doit permettre à ADIKOM de répondre à quatre questions :



\*\*Quel véhicule a un problème ?\*\*



\*\*Pourquoi doit-il être réparé ?\*\*



\*\*Combien coûte l'intervention ?\*\*



\*\*Qui doit finalement supporter ce coût ?\*\*



Le processus de référence est :



\*\*Problème → Diagnostic → Maintenance → Dépense → Validation → Disponibilité\*\*



Lorsque le véhicule est fourni par un fournisseur :



\*\*Maintenance → Coût → Imputation éventuelle → Facture fournisseur → Paiement\*\*



La règle fondamentale est :



\*\*Une maintenance doit toujours être traçable, son coût doit être identifiable et son impact sur la disponibilité du véhicule doit être connu.\*\*



L'imputation au fournisseur ne doit jamais être automatique simplement parce qu'une maintenance existe.



Elle doit être une opération distincte, contrôlée et justifiée.

