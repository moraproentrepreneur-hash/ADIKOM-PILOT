\# ADIKOM PILOT

\## Workflow 07 — Facturation



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence fonctionnelle  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\# 1. Objet du workflow



Ce document décrit le processus de facturation dans ADIKOM PILOT, avec une attention particulière portée aux factures issues de la gestion de location de véhicules.



La facturation doit permettre à ADIKOM de transformer une opération commerciale réalisée en une créance clairement identifiée, traçable et liée aux éléments métier qui l'ont générée.



Le workflow doit notamment permettre de gérer :



\- factures clients ;

\- factures fournisseurs ;

\- lignes de facturation ;

\- tarifs appliqués ;

\- tarifs préférentiels ;

\- services supplémentaires ;

\- frais éventuels ;

\- avoirs ou corrections selon les règles définies ;

\- règlements ;

\- soldes ;

\- imputations fournisseur ;

\- rapports et statistiques.



\---



\# 2. Principe général



La facturation doit être directement reliée aux opérations métier.



Pour une location client :



\*\*Client → Réservation → Location → Retour → Calcul final → Facture → Règlement\*\*



Pour un fournisseur :



\*\*Fournisseur → Facture fournisseur → Imputation éventuelle → Règlement\*\*



La facture ne doit pas être considérée comme une simple page contenant des montants saisis manuellement.



Elle doit être reliée aux données ayant généré ces montants.



\---



\# 3. Types de factures



ADIKOM PILOT doit distinguer au minimum :



\## Factures clients



Montants dus à ADIKOM par les clients.



\## Factures fournisseurs



Montants dus par ADIKOM aux fournisseurs.



Ces deux types de factures doivent être gérés séparément tout en partageant les principes communs de traçabilité.



\---



\# 4. Facturation client



Une facture client peut notamment être générée à partir :



\- d'une location ;

\- de services supplémentaires ;

\- de frais applicables ;

\- d'autres prestations commerciales gérées par ADIKOM.



Dans le cadre du MVP, la location de véhicules constitue la principale source de facturation client.



\---



\# 5. Conditions préalables à la facturation d'une location



Avant de générer la facture issue d'une location, le système doit disposer des informations nécessaires :



\- client ;

\- location ;

\- véhicule ;

\- période ;

\- tarif applicable ;

\- tarif réellement appliqué ;

\- retour lorsque celui-ci est requis ;

\- éventuels services supplémentaires ;

\- éventuels frais validés ;

\- montant final.



\---



\# 6. Client



La facture doit être liée au client enregistré dans le module \*\*Tiers\*\*.



Les informations du client doivent être récupérées depuis sa fiche.



Il ne faut pas recréer manuellement le client dans chaque facture.



\---



\# 7. Tarif préférentiel



Lorsqu'un client bénéficie d'un tarif préférentiel, le tarif réellement appliqué doit être repris dans la facturation.



Exemple :



Tarif standard :

500 000 KMF



Tarif préférentiel :

450 000 KMF



Montant facturé :

450 000 KMF



La facture doit refléter le montant effectivement validé.



\---



\# 8. Conservation du tarif appliqué



Une facture déjà émise ne doit pas être recalculée automatiquement si le tarif standard ou le tarif préférentiel du client est modifié ultérieurement.



Exemple :



Facture :

450 000 KMF



Nouveau tarif du client :

470 000 KMF



La facture existante reste :



450 000 KMF



Toute correction doit être effectuée par une opération autorisée et traçable.



\---



\# 9. Calcul final de la location



Après le retour du véhicule, le système doit pouvoir déterminer le montant final de la location.



Le calcul peut prendre en compte :



\- tarif ;

\- durée ;

\- prolongation ;

\- services supplémentaires ;

\- frais validés ;

\- autres éléments commerciaux applicables.



Les règles de calcul doivent être définies explicitement et ne doivent pas être inventées par le système.



\---



\# 10. Durée de location



La facture doit pouvoir utiliser :



\- date et heure prévues ;

\- date et heure réelles ;

\- durée prévue ;

\- durée réelle ;

\- prolongation éventuelle.



Le système doit distinguer une prolongation validée d'un simple retard.



\---



\# 11. Retour anticipé



Si le client restitue le véhicule avant la date prévue, la facture doit utiliser le montant final déterminé selon les règles commerciales d'ADIKOM.



Le système doit conserver :



\- période prévue ;

\- période réelle ;

\- montant final appliqué.



\---



\# 12. Retour tardif



Si le client restitue le véhicule après la date prévue, le système doit identifier le retard.



Si une règle de facturation prévoit un supplément, celui-ci peut être ajouté à la facture.



Le système ne doit pas inventer automatiquement un montant sans règle tarifaire définie.



\---



\# 13. Prolongation



Lorsqu'une prolongation a été validée, elle doit être intégrée au calcul final.



Exemple :



Période initiale :

20/08 → 23/08



Prolongation :

→ 25/08



La facture doit refléter la période finalement validée.



\---



\# 14. Services supplémentaires



Une facture peut contenir des services supplémentaires liés à la location.



Chaque élément doit pouvoir apparaître comme une ligne distincte.



Exemple :



Location :

450 000 KMF



Service complémentaire :

50 000 KMF



Total :

500 000 KMF



\---



\# 15. Frais supplémentaires



Lorsqu'un frais doit être facturé au client, il doit être identifiable.



Exemples :



\- retard ;

\- carburant ;

\- dommage ;

\- équipement manquant ;

\- autre frais validé.



Le système doit conserver la justification lorsque nécessaire.



\---



\# 16. Dommages et facturation



Un dommage constaté au retour ne doit pas automatiquement générer une facture.



Le système doit d'abord permettre de :



\- constater le dommage ;

\- enregistrer l'incident ;

\- déterminer son traitement ;

\- déterminer la responsabilité ;

\- valider une éventuelle facturation.



Une facturation complémentaire ne doit intervenir que lorsqu'elle est justifiée et autorisée.



\---



\# 17. Maintenance et facturation client



Une maintenance réalisée sur un véhicule ne doit pas automatiquement être facturée au client.



Il faut distinguer :



\*\*Maintenance\*\*



→ Intervention sur le véhicule.



\*\*Facturation client\*\*



→ Montant que le client doit éventuellement supporter.



Selon la situation, une maintenance peut :



\- ne rien générer pour le client ;

\- générer des frais client ;

\- être imputée au fournisseur ;

\- être partiellement répartie selon les règles validées.



\---



\# 18. Création de la facture



Une facture peut être créée depuis la location lorsque celle-ci est prête à être facturée.



Le système doit reprendre automatiquement les informations disponibles.



Exemple :



\*\*Client\*\*

Société ABC



\*\*Location\*\*

LOC-2026-0012



\*\*Véhicule\*\*

Toyota T5



\*\*Période\*\*

20/08 → 23/08



\*\*Tarif\*\*

450 000 KMF



\---



\# 19. Numéro de facture



Chaque facture doit disposer d'un numéro unique.



Exemple :



\*\*FAC-C-2026-000001\*\*



Le format définitif sera défini lors de l'implémentation.



Une facture émise ne doit pas partager le même numéro qu'une autre facture.



\---



\# 20. Date de facture



La facture doit conserver sa date d'émission.



Cette date ne doit pas être modifiée silencieusement après émission.



Toute correction doit être historisée.



\---



\# 21. Échéance



La facture peut comporter une date d'échéance.



Exemple :



Date d'émission :

23/08/2026



Échéance :

30/08/2026



Le système peut utiliser cette donnée pour générer des notifications de suivi.



\---



\# 22. Lignes de facture



Chaque facture doit être composée de lignes clairement identifiables.



Exemple :



| Désignation | Quantité | Prix | Total |

|---|---:|---:|---:|

| Location Toyota T5 | 1 | 450 000 | 450 000 |

| Service complémentaire | 1 | 50 000 | 50 000 |



Total :

500 000 KMF



Les lignes doivent rester liées à leur origine lorsque cela est possible.



\---



\# 23. Montants



La facture doit distinguer lorsque nécessaire :



\- sous-total ;

\- réductions ;

\- frais ;

\- taxes lorsqu'elles sont applicables ;

\- total ;

\- montant déjà réglé ;

\- solde.



Les règles fiscales exactes doivent être définies selon les exigences applicables à ADIKOM.



\---



\# 24. Réduction



Une réduction accordée au client doit être identifiable.



Elle ne doit pas simplement apparaître comme une modification inexplicable du prix.



Exemple :



Tarif :

500 000 KMF



Réduction :

50 000 KMF



Net :

450 000 KMF



Lorsque la réduction correspond à un tarif préférentiel, le système doit pouvoir l'identifier comme tel.



\---



\# 25. Facture brouillon



Une facture en brouillon peut être préparée avant son émission définitive.



Elle peut être modifiée par un utilisateur autorisé.



Une facture brouillon ne doit pas être considérée comme une facture définitivement émise.



\---



\# 26. Facture émise



Lorsqu'une facture est validée et émise :



\- elle reçoit son numéro définitif ;

\- sa date est enregistrée ;

\- ses montants sont figés selon les règles du système ;

\- elle devient disponible pour le règlement ;

\- son historique est conservé.



\---



\# 27. Statuts des factures clients



Les statuts recommandés sont :



\- Brouillon ;

\- Émise ;

\- Partiellement payée ;

\- Payée ;

\- En retard ;

\- Annulée.



Les statuts exacts pourront être adaptés lors de l'implémentation.



\---



\# 28. Facture partiellement payée



Exemple :



Facture :

450 000 KMF



Règlement :

200 000 KMF



Solde :

250 000 KMF



Statut :



\*\*Partiellement payée\*\*



Le système doit calculer automatiquement le solde.



\---



\# 29. Facture payée



Exemple :



Facture :

450 000 KMF



Règlements :

200 000 + 250 000 KMF



Total réglé :

450 000 KMF



Solde :

0 KMF



Statut :



\*\*Payée\*\*



\---



\# 30. Facture en retard



Une facture peut être considérée comme en retard lorsque :



\- elle possède une échéance ;

\- l'échéance est dépassée ;

\- le solde est supérieur à zéro.



Exemple :



Facture :

450 000 KMF



Échéance :

30/08



Date actuelle :

05/09



Solde :

250 000 KMF



Statut :



\*\*En retard\*\*



\---



\# 31. Notifications de facturation



Le Centre de notifications peut générer :



\- facture créée ;

\- facture émise ;

\- échéance proche ;

\- facture en retard ;

\- paiement reçu ;

\- facture entièrement payée.



Les notifications doivent être adressées aux utilisateurs concernés.



\---



\# 32. Règlements clients



Le règlement d'une facture doit être enregistré dans le module \*\*Facturation \& Paiement\*\*.



Il doit pouvoir contenir :



\- facture ;

\- client ;

\- montant ;

\- date ;

\- mode de paiement ;

\- compte ou caisse ;

\- référence ;

\- justificatif lorsque nécessaire.



Le workflow détaillé du paiement est défini dans :



\*\*Workflow 08 — Paiement\*\*



\---



\# 33. Paiement partiel



Un même client peut effectuer plusieurs règlements pour une facture.



Exemple :



Facture :

450 000 KMF



Paiement 1 :

100 000 KMF



Paiement 2 :

150 000 KMF



Paiement 3 :

200 000 KMF



Total :

450 000 KMF



Solde :

0 KMF



\---



\# 34. Paiement supérieur au solde



Le système doit empêcher ou traiter explicitement un paiement supérieur au montant restant dû.



Exemple :



Solde :

100 000 KMF



Paiement saisi :

150 000 KMF



Le système doit signaler l'anomalie ou appliquer une règle spécifique validée par ADIKOM.



Il ne doit pas créer silencieusement un solde incohérent.



\---



\# 35. Facturation fournisseur



Le module doit également permettre de gérer les factures fournisseurs.



Une facture fournisseur représente une somme due par ADIKOM à un fournisseur.



Exemple :



Fournisseur A



Facture :

500 000 KMF



\---



\# 36. Création d'une facture fournisseur



Une facture fournisseur doit contenir notamment :



\- fournisseur ;

\- numéro de facture fournisseur ;

\- date ;

\- échéance ;

\- lignes ;

\- montant ;

\- justificatif ;

\- statut.



\---



\# 37. Imputation de maintenance



Une facture fournisseur peut être réduite par une imputation de maintenance validée.



Exemple :



Facture fournisseur :

500 000 KMF



Imputation maintenance :

300 000 KMF



Net à payer :

200 000 KMF



L'imputation doit être visible dans la facture.



\---



\# 38. Montant brut fournisseur



La facture fournisseur doit conserver son montant brut.



Exemple :



\*\*Montant brut : 500 000 KMF\*\*



Même après imputation, le montant original doit rester accessible.



\---



\# 39. Montant imputé fournisseur



Le système doit calculer le total des imputations validées liées à la facture.



Exemple :



Montant brut :

500 000 KMF



Imputation :

300 000 KMF



Total imputé :

300 000 KMF



\---



\# 40. Net à payer fournisseur



Le montant net doit être calculé :



\*\*Montant brut − Imputations = Net à payer\*\*



Exemple :



500 000 − 300 000 = 200 000 KMF



\---



\# 41. Paiement fournisseur



Le paiement fournisseur doit porter sur le montant réellement dû après imputation.



Exemple :



Montant brut :

500 000 KMF



Imputation :

300 000 KMF



Net :

200 000 KMF



Paiement :

200 000 KMF



Solde :

0 KMF



\---



\# 42. Distinction facture / imputation / paiement



Ces trois éléments doivent rester distincts.



\### Facture



Montant initial dû.



\### Imputation



Réduction du montant dû.



\### Paiement



Montant réellement transféré au fournisseur.



Cette séparation est obligatoire pour la cohérence financière.



\---



\# 43. Annulation d'une facture



Une facture émise ne doit pas être simplement supprimée.



Selon la situation, le système doit utiliser une opération appropriée :



\- annulation ;

\- avoir ;

\- correction ;

\- contrepassation.



La méthode exacte dépendra des règles de gestion retenues par ADIKOM.



\---



\# 44. Avoir



Un avoir peut être utilisé lorsqu'une facture doit être corrigée après émission.



Exemple :



Facture initiale :

500 000 KMF



Erreur :

50 000 KMF



Avoir :

50 000 KMF



Net :

450 000 KMF



Les factures et avoirs doivent rester liés.



\---



\# 45. Correction de facture



Une facture déjà émise ne doit pas être modifiée silencieusement.



Toute correction doit être traçable.



Le système doit conserver lorsque nécessaire :



\- valeur initiale ;

\- correction ;

\- utilisateur ;

\- date ;

\- motif.



\---



\# 46. Suppression



Les factures ayant une valeur métier ou financière ne doivent pas être supprimées physiquement sans procédure appropriée.



Il faut privilégier :



\- annulation ;

\- avoir ;

\- archivage ;

\- contrepassation.



\---



\# 47. Historique de la facture



Chaque facture doit conserver son historique.



Exemple :



23/08 :

Facture créée



23/08 :

Facture émise



24/08 :

Paiement 200 000 KMF



28/08 :

Paiement 250 000 KMF



28/08 :

Facture payée



\---



\# 48. Traçabilité



Les opérations importantes doivent être associées à un utilisateur.



Exemple :



Facture créée par :

Utilisateur A



Facture validée par :

Utilisateur B



Paiement enregistré par :

Utilisateur C



Correction effectuée par :

Utilisateur D



\---



\# 49. Liaison avec la location



Une facture issue d'une location doit permettre de retrouver la location.



Relation :



\*\*Facture → Location → Véhicule → Client\*\*



L'utilisateur doit pouvoir accéder à la location depuis la facture.



\---



\# 50. Liaison avec le client



La fiche client doit permettre de consulter les factures associées.



Exemple :



\*\*Société ABC\*\*



\- FAC-C-001 — Payée

\- FAC-C-005 — Partiellement payée

\- FAC-C-009 — En retard



\---



\# 51. Historique financier du client



La fiche client peut afficher :



\- total facturé ;

\- total payé ;

\- total restant ;

\- factures en retard ;

\- nombre de factures.



Ces données doivent être calculées à partir des factures et règlements enregistrés.



\---



\# 52. Historique financier du fournisseur



La fiche fournisseur peut afficher :



\- total facturé ;

\- total imputé ;

\- total payé ;

\- solde ;

\- factures en attente ;

\- imputations liées aux maintenances.



\---



\# 53. Recherche des factures



La liste des factures doit permettre une recherche par :



\- numéro ;

\- client ;

\- fournisseur ;

\- date ;

\- statut ;

\- montant ;

\- référence de location.



\---



\# 54. Filtres



Les filtres peuvent inclure :



\- aujourd'hui ;

\- cette semaine ;

\- ce mois ;

\- période personnalisée ;

\- payées ;

\- partiellement payées ;

\- impayées ;

\- en retard ;

\- annulées.



\---



\# 55. Statistiques de facturation



Le module doit pouvoir fournir des indicateurs tels que :



\- chiffre facturé ;

\- montant encaissé ;

\- montant restant ;

\- factures en retard ;

\- factures payées ;

\- factures partiellement payées.



Ces indicateurs peuvent être filtrés par période.



\---



\# 56. Rapports



Le système doit pouvoir produire des rapports sur :



\- facturation clients ;

\- facturation fournisseurs ;

\- règlements ;

\- impayés ;

\- retards ;

\- imputations fournisseur ;

\- évolution de la facturation.



Les rapports doivent utiliser les données réellement enregistrées.



\---



\# 57. Facturation et Tableau de bord



Les données de facturation peuvent alimenter le Tableau de bord.



Exemples :



\*\*CA facturé\*\*



\*\*Encaissements\*\*



\*\*Créances clients\*\*



\*\*Dettes fournisseurs\*\*



\*\*Factures en retard\*\*



\*\*Montant des imputations fournisseur\*\*



\---



\# 58. Sécurité et permissions



Les opérations de facturation doivent être contrôlées selon les permissions.



Exemples :



Un utilisateur peut :



\- consulter les factures ;



Un autre peut :



\- créer une facture ;



Un autre peut :



\- valider ;



Un autre peut :



\- enregistrer les règlements.



Les permissions doivent être appliquées côté serveur.



\---



\# 59. Séparation des responsabilités



Le système doit permettre de séparer les responsabilités lorsque nécessaire.



Exemple :



\*\*Création de facture\*\*



→ Responsable autorisé



\*\*Validation\*\*



→ Responsable autorisé



\*\*Paiement\*\*



→ Utilisateur financier autorisé



Cette séparation peut évoluer selon l'organisation d'ADIKOM.



\---



\# 60. Contrôle des montants



Le système doit vérifier les montants avant émission.



Exemples :



\- total des lignes ;

\- réductions ;

\- frais ;

\- taxes lorsqu'elles sont applicables ;

\- total final.



Le montant final doit être calculé par le système.



\---



\# 61. Intégrité financière



Une facture ne doit pas pouvoir être marquée comme payée si :



\*\*Total réglé < montant restant\*\*



Le statut doit être calculé à partir des règlements réellement enregistrés.



\---



\# 62. Exemple complet — Facture client



\## Location



Client :

Société ABC



Véhicule :

Toyota T5



Tarif préférentiel :

450 000 KMF



\---



\## Facture



FAC-C-2026-0001



Location :

450 000 KMF



Total :

450 000 KMF



\---



\## Paiement 1



200 000 KMF



Solde :

250 000 KMF



Statut :

Partiellement payée



\---



\## Paiement 2



250 000 KMF



Solde :

0 KMF



Statut :

Payée



\---



\# 63. Exemple complet — Facture fournisseur avec maintenance



\## Fournisseur



Fournisseur A



\## Facture



Montant brut :

500 000 KMF



\## Maintenance



Toyota T5



Coût :

300 000 KMF



\## Imputation



300 000 KMF



\## Net



500 000 − 300 000 = 200 000 KMF



\## Paiement



200 000 KMF



\## Résultat



Facture :

Payée



Imputation :

300 000 KMF



Paiement :

200 000 KMF



\---



\# 64. Cas de facture fournisseur avec plusieurs imputations



Facture :

1 000 000 KMF



Maintenance 1 :

300 000 KMF



Maintenance 2 :

150 000 KMF



Total imputé :

450 000 KMF



Net :

550 000 KMF



Le système doit conserver les deux imputations séparément.



\---



\# 65. Cas de facture client avec frais supplémentaires



Location :

450 000 KMF



Frais validé :

50 000 KMF



Total :

500 000 KMF



Chaque élément doit apparaître distinctement.



\---



\# 66. Cas de facture client avec tarif préférentiel



Tarif standard :

500 000 KMF



Tarif préférentiel :

450 000 KMF



Facture :

450 000 KMF



La réduction doit pouvoir être expliquée par le tarif préférentiel enregistré pour le client.



\---



\# 67. Cas de facture en retard



Facture :

450 000 KMF



Montant payé :

200 000 KMF



Solde :

250 000 KMF



Échéance :

30/08



Date actuelle :

05/09



Résultat :



\*\*Facture en retard\*\*



Solde :

250 000 KMF



Une notification peut être générée.



\---



\# 68. Relation avec les paiements



La facturation constitue le point de départ du processus de règlement.



La chaîne est :



\*\*Facture → Règlement → Solde → Statut\*\*



Le workflow détaillé du paiement est :



\*\*08\_Paiement.md\*\*



\---



\# 69. Relation avec Banques \& Caisses



Lorsqu'un règlement est effectivement encaissé ou payé, le mouvement financier doit pouvoir être associé au compte concerné.



Exemple :



Facture client :

450 000 KMF



Paiement :

200 000 KMF



Compte :

Banque A



Le règlement et le mouvement bancaire doivent rester cohérents.



\---



\# 70. Notifications financières



Le système peut générer des notifications concernant :



\- facture à valider ;

\- facture émise ;

\- échéance proche ;

\- facture en retard ;

\- paiement reçu ;

\- paiement fournisseur à effectuer ;

\- imputation à valider.



\---



\# 71. Audit financier



Les factures doivent être suffisamment historisées pour permettre un contrôle ultérieur.



Il doit être possible de comprendre :



\- qui a créé ;

\- qui a validé ;

\- qui a modifié ;

\- qui a enregistré le règlement ;

\- qui a effectué une correction ;

\- quand chaque action a été effectuée.



\---



\# 72. Principe de non-rétroactivité



Une facture émise doit conserver son état historique.



Les changements ultérieurs des :



\- tarifs ;

\- clients ;

\- fournisseurs ;

\- paramètres



ne doivent pas modifier automatiquement les factures existantes.



\---



\# 73. Critères d'acceptation du workflow



Le workflow de facturation sera considéré comme correctement implémenté lorsque :



1\. une facture client peut être créée ;

2\. une facture fournisseur peut être créée ;

3\. une facture peut être liée à son origine métier ;

4\. une facture client peut être liée à une location ;

5\. les tarifs préférentiels sont pris en compte ;

6\. le tarif réellement appliqué est conservé ;

7\. les lignes de facture sont clairement identifiées ;

8\. le total est calculé automatiquement ;

9\. les réductions sont identifiables ;

10\. les frais validés peuvent être ajoutés ;

11\. les factures disposent d'un numéro unique ;

12\. les dates sont conservées ;

13\. une échéance peut être définie ;

14\. les factures peuvent être brouillons ;

15\. les factures peuvent être émises ;

16\. les factures peuvent être partiellement payées ;

17\. les factures peuvent être payées ;

18\. les factures en retard peuvent être identifiées ;

19\. les règlements sont séparés des factures ;

20\. les imputations fournisseur sont séparées des paiements ;

21\. les factures fournisseurs peuvent intégrer des imputations validées ;

22\. le montant net à payer fournisseur est calculé correctement ;

23\. les avoirs ou corrections peuvent être gérés selon les règles retenues ;

24\. les factures ne sont pas supprimées silencieusement ;

25\. l'historique est conservé ;

26\. les clients peuvent consulter leur historique ;

27\. les fournisseurs peuvent consulter leur historique ;

28\. les statistiques peuvent être calculées ;

29\. les rapports peuvent être générés ;

30\. les données peuvent alimenter le Tableau de bord ;

31\. les notifications peuvent être générées ;

32\. les permissions sont respectées ;

33\. les actions sensibles sont journalisées ;

34\. les données restent cohérentes avec Banques \& Caisses.



\---



\# 74. Principe directeur



La facturation doit transformer une opération métier en une obligation financière clairement définie.



Pour un client :



\*\*Location → Montant final → Facture → Règlement → Solde\*\*



Pour un fournisseur :



\*\*Facture → Imputation éventuelle → Net à payer → Règlement → Solde\*\*



Le principe fondamental est :



\*\*La facture doit toujours être explicable.\*\*



À partir d'une facture, ADIKOM doit pouvoir retrouver :



\- son client ou fournisseur ;

\- son origine ;

\- les opérations concernées ;

\- les montants appliqués ;

\- les éventuelles réductions ;

\- les imputations ;

\- les règlements ;

\- le solde ;

\- l'historique des actions.



La facturation doit ainsi constituer le lien fiable entre l'activité opérationnelle d'ADIKOM et sa gestion financière.

