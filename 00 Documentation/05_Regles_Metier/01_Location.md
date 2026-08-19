\# ADIKOM PILOT

\## Règles métier 01 — Gestion de la location



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence métier  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\# 1. Objet



Ce document définit les règles métier applicables à la gestion de location de véhicules dans ADIKOM PILOT.



Il constitue la référence métier pour toutes les fonctionnalités liées :



\- aux véhicules proposés à la location ;

\- aux clients ;

\- aux réservations ;

\- aux locations ;

\- aux départs ;

\- aux retours ;

\- aux disponibilités ;

\- aux tarifs ;

\- aux tarifs préférentiels ;

\- aux prolongations ;

\- aux incidents ;

\- aux maintenances ;

\- à la facturation issue des locations.



Ces règles doivent être respectées lors de la conception et du développement du SaaS.



\---



\# 2. Principe général



Une location suit le cycle :



\*\*Véhicule disponible → Réservation éventuelle → Départ → Location en cours → Retour → Contrôle → Facturation → Clôture\*\*



Une réservation n'est pas une location.



Une location ne devient active qu'au moment où le véhicule est effectivement remis au client selon les règles d'ADIKOM.



\---



\# 3. Client obligatoire



Toute location doit être associée à un client enregistré dans ADIKOM PILOT.



Le système ne doit pas créer une location sans client identifié.



Le client doit être sélectionné depuis le module :



\*\*Tiers → Clients\*\*



\---



\# 4. Fiche client



La fiche client doit contenir les informations nécessaires à la relation commerciale.



Elle peut notamment contenir :



\- identité ;

\- coordonnées ;

\- adresse ;

\- informations de contact ;

\- documents nécessaires ;

\- historique des locations ;

\- historique des factures ;

\- historique des paiements ;

\- observations ;

\- statut ;

\- tarifs préférentiels éventuels.



\---



\# 5. Tarif préférentiel client



ADIKOM doit pouvoir définir un tarif préférentiel pour un client.



Exemple :



Tarif standard :

500 000 KMF



Tarif préférentiel du client :

450 000 KMF



Lorsque les conditions du tarif préférentiel sont remplies, le système doit pouvoir proposer ou appliquer ce tarif selon la configuration retenue.



\---



\# 6. Conservation du tarif appliqué



Lorsqu'une location est créée avec un tarif déterminé, le tarif appliqué à cette opération doit être conservé.



Une modification ultérieure du tarif standard du véhicule ne doit pas modifier rétroactivement une location existante.



Exemple :



Location créée :

450 000 KMF



Nouveau tarif standard :

500 000 KMF



La location existante reste basée sur le tarif qui lui avait été appliqué.



\---



\# 7. Véhicule obligatoire



Toute location doit obligatoirement être associée à un véhicule.



Le véhicule doit provenir du parc automobile enregistré dans ADIKOM PILOT.



\---



\# 8. Disponibilité du véhicule



Un véhicule ne peut être proposé comme disponible que lorsqu'il est réellement disponible selon son état et son calendrier.



Un véhicule doit être considéré comme indisponible lorsqu'il est notamment :



\- déjà loué ;

\- réservé pour une période incompatible ;

\- en maintenance ;

\- immobilisé ;

\- retiré temporairement du parc ;

\- dans tout autre état empêchant sa location.



\---



\# 9. Double réservation



Le système ne doit pas permettre de confirmer deux opérations incompatibles concernant le même véhicule et la même période.



Exemple :



Toyota T5 :



Location A :

20/08 → 25/08



Une seconde location du même véhicule sur une période qui chevauche la première ne doit pas pouvoir être confirmée.



\---



\# 10. Réservation



Une réservation permet de prévoir l'utilisation future d'un véhicule.



Elle doit notamment contenir :



\- client ;

\- véhicule ou catégorie lorsque cette fonctionnalité est retenue ;

\- date et heure de début ;

\- date et heure de fin ;

\- tarif ;

\- statut ;

\- observations ;

\- informations nécessaires à la préparation de la location.



\---



\# 11. Réservation ≠ location



Une réservation ne doit pas automatiquement être considérée comme une location active.



La location commence uniquement lorsque le départ du véhicule est effectivement enregistré.



\---



\# 12. Statuts de réservation



Les statuts recommandés sont :



\- Brouillon ;

\- En attente ;

\- Confirmée ;

\- En cours de préparation ;

\- Convertie en location ;

\- Annulée ;

\- Expirée.



Les statuts définitifs peuvent être adaptés lors de l'implémentation.



\---



\# 13. Annulation d'une réservation



Une réservation peut être annulée selon les règles d'ADIKOM.



L'annulation doit conserver :



\- le statut ;

\- la date ;

\- l'utilisateur ayant effectué l'action ;

\- le motif lorsque nécessaire.



Une réservation annulée ne doit plus bloquer la disponibilité du véhicule.



\---



\# 14. Conversion réservation → location



Lorsqu'un client récupère effectivement le véhicule, la réservation peut être convertie en location.



Les informations utiles de la réservation doivent être reprises afin d'éviter une double saisie inutile.



\---



\# 15. Location sans réservation



ADIKOM peut effectuer une location sans réservation préalable si les conditions opérationnelles le permettent.



Dans ce cas :



\*\*Client → Vérification disponibilité → Création location → Départ\*\*



Le système doit permettre cette situation.



\---



\# 16. Départ du véhicule



Le départ constitue le moment où le véhicule est effectivement remis au client.



Le départ doit enregistrer notamment :



\- date ;

\- heure ;

\- véhicule ;

\- client ;

\- état du véhicule ;

\- kilométrage ;

\- niveau de carburant lorsque suivi ;

\- documents ou observations nécessaires ;

\- utilisateur ayant enregistré le départ.



\---



\# 17. État du véhicule au départ



L'état du véhicule doit pouvoir être enregistré avant sa remise au client.



Le système doit permettre de documenter les éléments pertinents afin de disposer d'un état de référence.



Cela peut inclure :



\- carrosserie ;

\- pneus ;

\- intérieur ;

\- équipements ;

\- carburant ;

\- kilométrage ;

\- anomalies déjà présentes.



\---



\# 18. Kilométrage au départ



Lorsque le kilométrage est suivi, le kilométrage de départ doit être enregistré.



Il servira notamment à comparer la situation du véhicule au retour.



\---



\# 19. Carburant au départ



Lorsque ADIKOM utilise le suivi du carburant, le niveau de départ doit être enregistré.



Exemple :



Départ :

3/4



Retour :

1/2



La différence peut ensuite être traitée selon les règles commerciales d'ADIKOM.



\---



\# 20. Location en cours



Une location est considérée comme en cours après validation du départ et avant l'enregistrement du retour.



Pendant cette période :



\- le véhicule est indisponible ;

\- la location reste active ;

\- le véhicule ne peut pas être attribué à une autre location incompatible.



\---



\# 21. Véhicule indisponible pendant la location



Un véhicule en location ne doit pas apparaître comme disponible pour une nouvelle location pendant la période active.



\---



\# 22. Prolongation



Une location peut être prolongée lorsque le client demande à conserver le véhicule au-delà de la période initialement prévue et que la prolongation est acceptée.



La prolongation doit être enregistrée.



\---



\# 23. Vérification de la disponibilité lors d'une prolongation



Une prolongation ne doit pas être acceptée automatiquement.



Le système doit vérifier que le véhicule peut rester affecté au client pendant la nouvelle période.



Il faut notamment vérifier qu'aucune autre réservation ou location confirmée ne rend la prolongation impossible.



\---



\# 24. Tarif de prolongation



Le tarif appliqué à une prolongation doit respecter les règles tarifaires d'ADIKOM.



Le système ne doit pas inventer automatiquement une tarification.



Le montant doit être calculé à partir des règles et tarifs configurés.



\---



\# 25. Modification d'une location



Une location active ne doit pas pouvoir être modifiée librement sur ses éléments sensibles.



Les modifications importantes doivent être contrôlées et historisées.



Exemples :



\- véhicule ;

\- client ;

\- période ;

\- tarif ;

\- montant ;

\- statut.



\---



\# 26. Changement de véhicule



Un changement de véhicule pendant une location doit être enregistré comme une opération identifiable.



Le système doit conserver :



\- ancien véhicule ;

\- nouveau véhicule ;

\- date ;

\- heure ;

\- motif ;

\- utilisateur.



\---



\# 27. Retour du véhicule



Le retour constitue la fin opérationnelle de la location.



Il doit permettre d'enregistrer notamment :



\- date ;

\- heure ;

\- kilométrage ;

\- carburant ;

\- état du véhicule ;

\- dommages éventuels ;

\- incidents ;

\- observations ;

\- utilisateur ayant enregistré le retour.



\---



\# 28. Contrôle au retour



Le véhicule doit être contrôlé au retour.



L'état constaté doit pouvoir être comparé aux informations enregistrées au départ.



\---



\# 29. Dommage constaté au retour



Un dommage constaté au retour doit être enregistré comme un élément distinct lorsque cela est nécessaire.



Il ne doit pas automatiquement être facturé au client.



Une analyse doit permettre de déterminer son traitement.



\---



\# 30. Incident



Un incident peut être lié à une location.



Exemples :



\- panne ;

\- accident ;

\- dommage ;

\- problème mécanique ;

\- problème administratif ;

\- autre événement.



L'incident doit être conservé dans l'historique de la location et du véhicule.



\---



\# 31. Maintenance après location



Lorsqu'un problème constaté au retour nécessite une réparation, une maintenance doit pouvoir être créée.



Relation :



\*\*Location → Incident → Maintenance → Dépense\*\*



Le véhicule peut alors devenir indisponible jusqu'à la fin de l'intervention.



\---



\# 32. Véhicule en maintenance



Un véhicule en maintenance ne doit pas être proposé comme disponible.



La disponibilité doit être automatiquement cohérente avec son état opérationnel.



\---



\# 33. Retour sans anomalie



Si aucun problème n'est constaté :



\*\*Retour → Contrôle → Véhicule disponible\*\*



Le véhicule peut être proposé pour une nouvelle location sous réserve des autres contraintes de disponibilité.



\---



\# 34. Retour avec anomalie



Si une anomalie est constatée :



\*\*Retour → Incident → Maintenance éventuelle\*\*



Le véhicule doit rester indisponible lorsque l'anomalie empêche son exploitation.



\---



\# 35. Calcul de la durée



La durée de location doit être calculée à partir des dates et heures enregistrées.



Le système doit distinguer :



\- durée prévue ;

\- durée réelle ;

\- prolongation ;

\- éventuel retard.



Les règles d'arrondi ou de facturation doivent être définies par ADIKOM.



\---



\# 36. Facturation de la location



Une location terminée peut être envoyée vers le processus de facturation.



La facture doit reprendre les éléments réellement applicables.



Relation :



\*\*Location → Calcul final → Facture\*\*



\---



\# 37. Facturation basée sur les données réelles



Le système ne doit pas facturer uniquement sur la base de la réservation si les données réelles de la location ont changé.



Le montant final doit prendre en compte les éléments validés lors du retour.



\---



\# 38. Tarif standard



Chaque véhicule ou catégorie concernée par la location peut disposer d'un tarif standard selon la configuration retenue.



Le tarif standard constitue la référence commerciale lorsqu'aucun tarif préférentiel ou autre règle spécifique ne s'applique.



\---



\# 39. Tarif préférentiel



Lorsqu'un client possède un tarif préférentiel, celui-ci peut être utilisé conformément aux conditions définies.



Exemple :



Tarif standard :

500 000 KMF



Tarif client :

450 000 KMF



Montant appliqué :

450 000 KMF



\---



\# 40. Priorité du tarif



La logique de sélection du tarif doit être déterministe.



Le système doit notamment pouvoir distinguer :



1\. tarif applicable spécifiquement au client ;

2\. tarif standard ;

3\. autre règle tarifaire explicitement configurée.



L'ordre définitif de priorité devra être validé par ADIKOM avant l'implémentation finale.



> \*\*Décision arbitrée — DEC-002\*\*
>
> Cet ordre contredisait `03\_Modules/05\_Gestion\_de\_Location.md` §20 et `03\_Modules/04\_Tiers.md` §6.6,
> qui plaçaient le tarif véhicule avant le tarif préférentiel client.
>
> Ordre retenu : \*\*le tarif le plus spécifique gagne\*\* —
> client+véhicule → client+catégorie → client → véhicule → catégorie → standard.
>
> Voir `08\_Decisions/01\_Journal\_des\_Decisions.md`.



\---



\# 41. Frais supplémentaires



Des frais supplémentaires peuvent être appliqués lorsqu'une règle métier les prévoit.



Exemples :



\- retard ;

\- carburant ;

\- dommage ;

\- équipement manquant ;

\- autre prestation.



Un frais ne doit pas être ajouté arbitrairement.



\---



\# 42. Validation des frais



Lorsqu'un frais supplémentaire est lié à un événement constaté au retour, il doit pouvoir être justifié.



Exemple :



Carburant manquant :

50 000 KMF



La justification doit pouvoir être retrouvée dans le dossier de la location.



\---



\# 43. Maintenance et responsabilité



Une panne ou une maintenance ne signifie pas automatiquement que le client doit payer.



Il faut distinguer :



\- panne mécanique ;

\- usure ;

\- dommage ;

\- mauvaise utilisation ;

\- accident ;

\- autre cause.



La décision de facturer le client doit respecter les règles commerciales d'ADIKOM.



\---



\# 44. Maintenance fournisseur



Lorsqu'un véhicule est fourni par un fournisseur et qu'une maintenance doit être imputée à celui-ci, le coût peut être traité dans le workflow d'imputation fournisseur.



Relation :



\*\*Location → Véhicule → Maintenance → Imputation fournisseur\*\*



Le coût de maintenance ne doit pas être confondu avec la facture client.



\---



\# 45. Facture client et maintenance



Une maintenance ne doit pas automatiquement devenir une ligne de facture client.



Une éventuelle facturation au client doit être décidée séparément selon les règles applicables.



\---



\# 46. Disponibilité après retour



Après le retour :



\### Aucun problème



\*\*Véhicule disponible\*\*



\### Problème nécessitant une intervention



\*\*Véhicule en maintenance\*\*



\### Problème nécessitant une immobilisation temporaire



\*\*Véhicule indisponible\*\*



Le statut doit refléter la réalité opérationnelle.



\---



\# 47. Clôture de la location



Une location peut être considérée comme clôturée lorsque :



\- le retour est enregistré ;

\- les informations de retour sont complètes ;

\- les éventuels incidents sont enregistrés ;

\- les éventuels frais sont déterminés ;

\- le montant final est déterminé ;

\- la facturation peut être préparée ou réalisée.



La définition exacte du statut « clôturée » sera confirmée lors de l'implémentation.



\---



\# 48. Historique



Toutes les locations doivent rester accessibles dans l'historique.



L'historique doit permettre de retrouver :



\- client ;

\- véhicule ;

\- période ;

\- tarif ;

\- départ ;

\- retour ;

\- incidents ;

\- maintenance liée ;

\- facture ;

\- paiements.



\---



\# 49. Historique du client



La fiche client doit permettre de retrouver les locations passées.



Exemple :



\*\*Client : Société ABC\*\*



\- LOC-001 — Toyota T5 — Terminée

\- LOC-004 — Toyota T6 — Terminée

\- LOC-008 — Toyota T5 — En cours



\---



\# 50. Historique du véhicule



La fiche véhicule doit permettre de retrouver :



\- locations ;

\- clients ;

\- périodes ;

\- incidents ;

\- maintenances ;

\- coûts de maintenance ;

\- indisponibilités.



\---



\# 51. Statuts de location



Les statuts recommandés sont :



\- Brouillon ;

\- Réservée ;

\- En préparation ;

\- En cours ;

\- En retard ;

\- Retournée ;

\- À contrôler ;

\- À facturer ;

\- Facturée ;

\- Clôturée ;

\- Annulée.



Les statuts définitifs seront confirmés lors de l'implémentation.



\---



\# 52. Annulation d'une location



Une location peut être annulée selon les règles d'ADIKOM.



Une location déjà commencée ne doit pas être simplement supprimée.



Elle doit conserver son historique et recevoir le traitement approprié.



\---



\# 53. Location annulée



Une location annulée doit :



\- conserver sa référence ;

\- conserver son historique ;

\- ne plus bloquer le véhicule ;

\- indiquer son motif lorsque nécessaire.



\---



\# 54. Référence de location



Chaque location doit disposer d'un identifiant unique.



Exemple :



\*\*LOC-2026-000001\*\*



Le format définitif sera défini lors de l'implémentation.



\---



\# 55. Réservation et disponibilité



Une réservation confirmée doit pouvoir bloquer la disponibilité future du véhicule lorsque la période est incompatible avec une autre opération.



Une réservation annulée ne doit plus bloquer cette disponibilité.



\---



\# 56. Conflit de disponibilité



Le système doit contrôler les conflits avant :



\- confirmation d'une réservation ;

\- création d'une location ;

\- prolongation ;

\- changement de véhicule.



\---



\# 57. Règle de sécurité opérationnelle



Un véhicule ne doit jamais être attribué simultanément à deux locations incompatibles.



Cette règle constitue une contrainte fondamentale du module.



\---



\# 58. Client avec plusieurs locations



Un client peut avoir plusieurs locations.



Le système doit pouvoir gérer plusieurs locations simultanées uniquement lorsque les véhicules concernés sont différents et que les règles commerciales d'ADIKOM le permettent.



\---



\# 59. Véhicule avec plusieurs locations successives



Un même véhicule peut être utilisé pour plusieurs locations successives.



Exemple :



Location 1 :

01/09 → 03/09



Location 2 :

04/09 → 07/09



La seconde location est possible si le véhicule est effectivement disponible entre les deux opérations.



\---



\# 60. Période de préparation



ADIKOM peut avoir besoin d'un délai entre deux locations pour :



\- nettoyage ;

\- contrôle ;

\- entretien ;

\- préparation.



Si cette règle est activée, le système doit intégrer cette période dans le calcul de disponibilité.



La durée exacte doit être définie par ADIKOM.



\---



\# 61. Immobilisation



Lorsqu'un véhicule est immobilisé pour une raison opérationnelle, il ne doit pas pouvoir être loué.



Exemples :



\- maintenance ;

\- accident ;

\- contrôle ;

\- panne ;

\- autre immobilisation validée.



\---



\# 62. Location en retard



Une location est considérée comme en retard lorsque l'heure ou la date de retour prévue est dépassée sans retour enregistré.



Le système doit pouvoir :



\- identifier le retard ;

\- notifier les utilisateurs concernés ;

\- calculer la durée supplémentaire ;

\- préparer l'éventuel traitement commercial.



\---



\# 63. Notification de retard



Le Centre de notifications peut signaler :



\*\*Location en retard\*\*



avec :



\- client ;

\- véhicule ;

\- date prévue de retour ;

\- durée du retard ;

\- location concernée.



\---



\# 64. Prolongation après retard



Une demande de prolongation après dépassement de la période initiale doit être traitée comme une modification contrôlée de la location.



Le système doit conserver l'historique.



\---



\# 65. Location et paiement anticipé



Selon les règles commerciales d'ADIKOM, une location peut nécessiter un paiement avant ou au moment du départ.



Le système doit pouvoir enregistrer le paiement sans confondre :



\- réservation ;

\- location ;

\- facture ;

\- paiement.



\---



\# 66. Location avec paiement partiel



Une location peut être associée à une facture partiellement réglée lorsque les conditions commerciales le permettent.



Exemple :



Facture :

500 000 KMF



Paiement :

300 000 KMF



Solde :

200 000 KMF



Le statut financier doit être distinct du statut opérationnel de la location.



\---



\# 67. Séparation opérationnelle / financière



Une location peut être :



\*\*Terminée\*\*



mais :



\*\*Facture partiellement payée\*\*



Ces deux informations ne doivent pas être fusionnées.



La location décrit l'opération.



La facturation et le paiement décrivent la situation financière.



\---



\# 68. Données obligatoires



Avant de considérer une location comme correctement enregistrée, les informations essentielles doivent être présentes :



\- client ;

\- véhicule ;

\- période ;

\- tarif ;

\- statut ;

\- informations de départ lorsque la location est active ;

\- informations de retour lorsque la location est terminée.



\---



\# 69. Contrôle avant départ



Avant de valider le départ, le système doit vérifier les éléments obligatoires définis par ADIKOM.



Exemples :



\- client identifié ;

\- véhicule disponible ;

\- période valide ;

\- tarif défini ;

\- documents nécessaires disponibles lorsque requis.



\---



\# 70. Contrôle avant retour



Lors du retour, le système doit permettre de vérifier :



\- véhicule ;

\- location ;

\- kilométrage ;

\- carburant lorsque suivi ;

\- état ;

\- dommages ;

\- incidents ;

\- observations.



\---



\# 71. Données sensibles



Les données relatives aux clients et aux locations doivent être accessibles uniquement aux utilisateurs autorisés.



Les permissions doivent déterminer ce qu'un utilisateur peut :



\- consulter ;

\- créer ;

\- modifier ;

\- annuler ;

\- clôturer.



\---



\# 72. Traçabilité



Les actions importantes sur une location doivent être historisées.



Exemples :



\- création ;

\- modification ;

\- confirmation ;

\- départ ;

\- prolongation ;

\- retour ;

\- annulation ;

\- clôture.



Le système doit pouvoir identifier l'utilisateur ayant effectué chaque action.



\---



\# 73. Cohérence avec le parc automobile



La location doit toujours utiliser les informations actuelles du parc automobile sans modifier directement le référentiel du véhicule de manière incohérente.



Le véhicule reste une entité du module \*\*Parc Automobile\*\*.



La location constitue une opération qui lui est associée.



\---



\# 74. Cohérence avec les fournisseurs



Lorsqu'un véhicule appartient ou est fourni par un fournisseur, cette relation doit rester accessible depuis la location.



Exemple :



Location :

LOC-2026-0005



Véhicule :

Toyota T5



Fournisseur :

Fournisseur A



Cette relation permet notamment de gérer les maintenances et éventuelles imputations.



\---



\# 75. Cohérence avec la facturation



La facture issue d'une location doit pouvoir retrouver :



\*\*Client → Location → Véhicule\*\*



Le montant facturé doit être cohérent avec le montant final validé de la location.



\---



\# 76. Cohérence avec les paiements



Les paiements doivent être liés à la facture et non directement à la location lorsqu'il s'agit d'un règlement financier.



La chaîne correcte est :



\*\*Location → Facture → Paiement\*\*



\---



\# 77. Règle de non-duplication



Le système doit éviter de créer plusieurs locations représentant la même opération.



Une location possède une référence unique.



Une réservation convertie en location doit être reliée à la location créée.



\---



\# 78. Règle de traçabilité complète



À partir d'une location, ADIKOM doit pouvoir retrouver :



\*\*Client\*\*



↓



\*\*Véhicule\*\*



↓



\*\*Fournisseur éventuel\*\*



↓



\*\*Réservation éventuelle\*\*



↓



\*\*Départ\*\*



↓



\*\*Location\*\*



↓



\*\*Retour\*\*



↓



\*\*Incident éventuel\*\*



↓



\*\*Maintenance éventuelle\*\*



↓



\*\*Facture\*\*



↓



\*\*Paiement\*\*



Cette chaîne constitue l'historique complet de l'opération.



\---



\# 79. Exemple métier complet



\## Étape 1 — Client



Le client Société ABC demande une Toyota T5.



\---



\## Étape 2 — Vérification



Le véhicule est disponible.



\---



\## Étape 3 — Tarif



Tarif standard :

500 000 KMF



Tarif préférentiel client :

450 000 KMF



Tarif appliqué :

450 000 KMF



\---



\## Étape 4 — Réservation



Une réservation est créée pour la période prévue.



\---



\## Étape 5 — Départ



Le véhicule est remis au client.



La location passe :



\*\*En cours\*\*



\---



\## Étape 6 — Utilisation



Le client utilise le véhicule.



\---



\## Étape 7 — Retour



Le client retourne la Toyota T5.



Le contrôle révèle une panne.



\---



\## Étape 8 — Incident



L'incident est enregistré.



\---



\## Étape 9 — Maintenance



Une maintenance de :



\*\*300 000 KMF\*\*



est créée.



Le véhicule devient indisponible.



\---



\## Étape 10 — Traitement fournisseur



Si les conditions le prévoient, les :



\*\*300 000 KMF\*\*



peuvent être imputés au fournisseur.



Cette opération suit le workflow d'imputation fournisseur.



\---



\## Étape 11 — Facturation client



La location est calculée et facturée selon les règles commerciales applicables.



\---



\## Étape 12 — Paiement



Le client règle sa facture.



Le paiement est enregistré séparément de la location.



\---



\# 80. Principes non négociables



Les règles suivantes doivent être considérées comme fondamentales :



1\. Un véhicule ne peut pas être loué simultanément à plusieurs clients sur des périodes incompatibles.

2\. Une location doit toujours être associée à un client.

3\. Une location doit toujours être associée à un véhicule.

4\. Une réservation n'est pas une location.

5\. Un départ valide le début opérationnel de la location.

6\. Un retour clôture la phase d'utilisation du véhicule.

7\. Un véhicule en maintenance ne doit pas être disponible à la location.

8\. Une maintenance ne doit pas être automatiquement facturée au client.

9\. Une maintenance ne doit pas être automatiquement imputée au fournisseur.

10\. Le tarif appliqué à une location doit être conservé.

11\. Une modification ultérieure des tarifs ne doit pas modifier rétroactivement une location.

12\. La location, la facture et le paiement sont trois éléments distincts.

13\. Les événements importants doivent être historisés.

14\. Une location ne doit pas être supprimée lorsqu'elle possède un historique métier significatif.

15\. La disponibilité du véhicule doit toujours refléter sa situation opérationnelle réelle.



\---



\# 81. Critères d'acceptation



La gestion de location sera considérée comme conforme lorsque :



1\. un client peut être sélectionné ;

2\. un véhicule peut être sélectionné ;

3\. la disponibilité est contrôlée ;

4\. une réservation peut être créée ;

5\. une réservation peut être annulée ;

6\. une réservation peut être convertie en location ;

7\. une location sans réservation peut être créée ;

8\. un tarif standard peut être appliqué ;

9\. un tarif préférentiel client peut être appliqué ;

10\. le tarif appliqué est conservé ;

11\. un départ peut être enregistré ;

12\. le kilométrage de départ peut être enregistré ;

13\. le niveau de carburant peut être enregistré lorsque suivi ;

14\. l'état du véhicule peut être enregistré ;

15\. une location active bloque le véhicule ;

16\. une prolongation peut être gérée ;

17\. les conflits de disponibilité sont contrôlés ;

18\. un retour peut être enregistré ;

19\. le kilométrage de retour peut être enregistré ;

20\. le carburant de retour peut être enregistré lorsque suivi ;

21\. les dommages peuvent être enregistrés ;

22\. les incidents peuvent être enregistrés ;

23\. une maintenance peut être créée depuis une anomalie ;

24\. un véhicule en maintenance devient indisponible ;

25\. le montant final de la location peut être déterminé ;

26\. une facture peut être liée à la location ;

27\. un paiement peut être lié à la facture ;

28\. l'historique du client est disponible ;

29\. l'historique du véhicule est disponible ;

30\. les actions importantes sont historisées ;

31\. les permissions sont respectées ;

32\. les relations avec les fournisseurs sont conservées ;

33\. les données restent cohérentes entre Location, Parc Automobile, Facturation \& Paiement et Maintenance.



\---



\# 82. Principe directeur



La gestion de location d'ADIKOM PILOT doit reproduire fidèlement la réalité opérationnelle.



Le système doit toujours pouvoir répondre à cinq questions :



\*\*Qui loue ?\*\*



\*\*Quel véhicule ?\*\*



\*\*Quand ?\*\*



\*\*À quel tarif ?\*\*



\*\*Dans quel état se trouve le véhicule avant, pendant et après la location ?\*\*



La logique de référence est :



\*\*Client → Réservation éventuelle → Départ → Location → Retour → Contrôle → Facturation → Paiement\*\*



Avec gestion des événements intermédiaires :



\*\*Incident → Maintenance → Disponibilité\*\*



Et, lorsque le véhicule est fourni par un partenaire :



\*\*Maintenance → Imputation éventuelle → Fournisseur\*\*



L'objectif est de disposer d'une gestion de location fiable, traçable et cohérente avec l'ensemble du système ADIKOM PILOT.

