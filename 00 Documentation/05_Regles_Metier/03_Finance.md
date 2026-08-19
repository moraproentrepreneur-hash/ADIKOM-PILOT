\# ADIKOM PILOT

\## Règles métier 03 — Gestion financière



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence métier  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\# 1. Objet



Ce document définit les règles métier relatives à la gestion financière dans ADIKOM PILOT.



Il précise les principes applicables à :



\- la facturation client ;

\- la facturation fournisseur ;

\- les règlements ;

\- les banques ;

\- les caisses ;

\- les virements internes ;

\- les créances ;

\- les dettes ;

\- les imputations de maintenance ;

\- les avances ;

\- les soldes ;

\- les statistiques financières ;

\- les rapports ;

\- la traçabilité des opérations.



L'objectif est de garantir une vision financière cohérente de l'activité d'ADIKOM.



\---



\# 2. Principe fondamental



ADIKOM PILOT doit distinguer clairement les éléments suivants :



\*\*Prestation / opération\*\*



→ ce qui s'est réellement passé.



\*\*Facture\*\*



→ ce qui est dû.



\*\*Imputation\*\*



→ une réduction ou compensation appliquée à une dette fournisseur selon une règle métier.



\*\*Paiement\*\*



→ ce qui a réellement été réglé.



\*\*Solde\*\*



→ ce qui reste à régler.



Ces éléments ne doivent pas être confondus.



\---



\# 3. Chaîne financière client



Pour un client, la chaîne principale est :



\*\*Location / Prestation\*\*



↓



\*\*Facture client\*\*



↓



\*\*Règlement\*\*



↓



\*\*Compte bancaire / caisse\*\*



↓



\*\*Solde\*\*



↓



\*\*Statut\*\*



\---



\# 4. Chaîne financière fournisseur



Pour un fournisseur, la chaîne principale est :



\*\*Fourniture / prestation\*\*



↓



\*\*Facture fournisseur\*\*



↓



\*\*Imputation éventuelle\*\*



↓



\*\*Net à payer\*\*



↓



\*\*Règlement\*\*



↓



\*\*Banque / caisse\*\*



↓



\*\*Solde\*\*



\---



\# 5. Devise



La devise principale utilisée par ADIKOM PILOT doit pouvoir être configurée selon les besoins d'ADIKOM.



Dans le contexte actuel du projet, les montants de référence sont exprimés en :



\*\*KMF — Franc comorien\*\*



Le système doit toutefois être conçu de manière suffisamment propre pour permettre une évolution ultérieure si ADIKOM doit gérer d'autres devises.



\---



\# 6. Montants



Les montants financiers doivent être calculés par le système.



Ils ne doivent pas être saisis manuellement lorsqu'ils peuvent être déduits des données métier.



Exemple :



\*\*Quantité × Prix unitaire = Total de ligne\*\*



Puis :



\*\*Total des lignes − Réductions + Frais applicables = Total\*\*



Les règles fiscales éventuelles devront être configurées selon les besoins réels d'ADIKOM.



\---



\# 7. Facture client



Une facture client représente une somme due à ADIKOM.



Elle doit être associée à :



\- un client ;

\- une ou plusieurs lignes ;

\- une date ;

\- un montant ;

\- un statut ;

\- une référence unique.



Lorsqu'elle provient d'une location, elle doit également pouvoir être reliée à la location concernée.



\---



\# 8. Facture fournisseur



Une facture fournisseur représente une somme due par ADIKOM à un fournisseur.



Elle doit être associée à :



\- un fournisseur ;

\- une ou plusieurs lignes ;

\- une date ;

\- un montant ;

\- un statut ;

\- une référence.



Elle peut également être associée à des imputations de maintenance lorsqu'elles sont applicables.



\---



\# 9. Numéro unique



Chaque facture doit disposer d'une référence unique.



Exemples :



\*\*FAC-C-2026-000001\*\*



\*\*FAC-F-2026-000001\*\*



Les formats définitifs pourront être définis lors de l'implémentation.



Une référence déjà utilisée ne doit pas être réattribuée.



\---



\# 10. Brouillon



Une facture en brouillon peut être préparée et modifiée par un utilisateur autorisé.



Elle ne doit pas être considérée comme définitivement émise.



Elle ne doit pas produire les mêmes effets métier qu'une facture validée.



\---



\# 11. Facture émise



Lorsqu'une facture est émise :



\- son numéro définitif est attribué ;

\- sa date est conservée ;

\- ses montants sont figés selon les règles du système ;

\- elle devient disponible pour le règlement ;

\- son historique est conservé.



\---



\# 12. Non-rétroactivité



Une modification ultérieure d'un tarif, d'un client, d'un fournisseur ou d'un paramètre financier ne doit pas modifier silencieusement une facture déjà émise.



Exemple :



Tarif initial :

450 000 KMF



Nouveau tarif :

500 000 KMF



Une facture déjà émise à :



450 000 KMF



reste à :



450 000 KMF



Toute correction doit être effectuée selon une procédure contrôlée.



\---



\# 13. Facturation d'une location



Lorsqu'une location doit être facturée, le montant doit être calculé à partir des données validées.



Le système peut notamment prendre en compte :



\- durée ;

\- tarif ;

\- tarif préférentiel ;

\- prolongation ;

\- frais ;

\- services supplémentaires ;

\- autres éléments commerciaux validés.



\---



\# 14. Tarif préférentiel client



ADIKOM peut attribuer à un client un tarif préférentiel.



Exemple :



Tarif standard :

500 000 KMF



Tarif préférentiel :

450 000 KMF



Montant facturé :

450 000 KMF



Le tarif réellement appliqué doit être conservé dans l'opération.



\---



\# 15. Modification du tarif préférentiel



Une modification du tarif préférentiel d'un client ne doit pas modifier rétroactivement les locations ou factures existantes.



Le nouveau tarif ne s'applique qu'aux opérations concernées selon les conditions définies.



\---



\# 16. Réductions



Une réduction doit être identifiable.



Exemple :



Prix :

500 000 KMF



Réduction :

50 000 KMF



Net :

450 000 KMF



Le système doit pouvoir expliquer l'origine de la réduction.



\---



\# 17. Frais supplémentaires



Les frais supplémentaires doivent être liés à une règle métier ou à une opération validée.



Exemples :



\- retard ;

\- carburant ;

\- dommage ;

\- équipement manquant ;

\- service complémentaire.



Le système ne doit pas ajouter automatiquement un frais sans règle correspondante.



\---



\# 18. Créance client



Une facture client non entièrement réglée constitue une créance pour ADIKOM.



Exemple :



Facture :

500 000 KMF



Paiement :

300 000 KMF



Créance restante :

200 000 KMF



\---



\# 19. Solde client



Le solde dû par un client doit être calculé automatiquement.



Formule métier :



\*\*Solde = Total facturé − Total des règlements validés\*\*



Les éventuelles avances ou avoirs doivent être traités selon les règles correspondantes.



\---



\# 20. Statuts financiers d'une facture client



Les statuts recommandés sont :



\- Brouillon ;

\- Émise ;

\- Partiellement payée ;

\- Payée ;

\- En retard ;

\- Annulée.



\---



\# 21. Facture payée



Une facture est considérée comme payée lorsque :



\*\*Solde = 0\*\*



Exemple :



Facture :

450 000 KMF



Paiements :

200 000 + 250 000 KMF



Total payé :

450 000 KMF



Solde :

0 KMF



Statut :

\*\*Payée\*\*



\---



\# 22. Facture partiellement payée



Une facture est partiellement payée lorsque :



\*\*0 < Solde < Total dû\*\*



Exemple :



Facture :

450 000 KMF



Paiement :

200 000 KMF



Solde :

250 000 KMF



Statut :

\*\*Partiellement payée\*\*



\---



\# 23. Facture en retard



Une facture peut être considérée comme en retard lorsque :



\- une échéance existe ;

\- cette échéance est dépassée ;

\- le solde est supérieur à zéro.



Le système doit pouvoir l'identifier automatiquement.



\---



\# 24. Dette fournisseur



Une facture fournisseur non entièrement réglée constitue une dette pour ADIKOM.



Exemple :



Facture fournisseur :

500 000 KMF



Imputation :

300 000 KMF



Paiement :

100 000 KMF



Solde :

100 000 KMF



\---



\# 25. Imputation fournisseur



Une imputation fournisseur permet de réduire le montant réellement dû au fournisseur lorsqu'une dépense, notamment une maintenance, doit être supportée ou déduite selon les règles établies avec celui-ci.



Exemple :



Facture fournisseur :

500 000 KMF



Maintenance :

300 000 KMF



Imputation :

300 000 KMF



Net à payer :

200 000 KMF



\---



\# 26. Imputation ≠ paiement



L'imputation ne constitue pas un paiement.



Exemple :



Montant brut :

500 000 KMF



Imputation :

300 000 KMF



Paiement :

200 000 KMF



Le système doit conserver :



\*\*500 000 KMF — Facturé\*\*



\*\*300 000 KMF — Imputé\*\*



\*\*200 000 KMF — Payé\*\*



\*\*0 KMF — Solde\*\*



\---



\# 27. Plusieurs imputations



Une même facture fournisseur peut recevoir plusieurs imputations validées.



Exemple :



Facture :

1 000 000 KMF



Maintenance 1 :

300 000 KMF



Maintenance 2 :

150 000 KMF



Total imputé :

450 000 KMF



Net à payer :

550 000 KMF



Chaque imputation doit rester identifiable.



\---



\# 28. Imputation partielle



Une maintenance peut ne pas être entièrement imputée.



Exemple :



Coût maintenance :

300 000 KMF



Montant imputé :

200 000 KMF



Reste :

100 000 KMF



Le système doit conserver le coût total et le montant imputé séparément.



\---



\# 29. Net à payer fournisseur



Le montant net à payer doit être calculé selon :



\*\*Montant brut − Total des imputations validées = Net à payer\*\*



Exemple :



500 000 − 300 000 = 200 000 KMF



\---



\# 30. Paiement fournisseur



Le paiement fournisseur doit être calculé sur le montant réellement dû après prise en compte des imputations.



Exemple :



Facture :

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



\# 31. Paiement partiel fournisseur



Exemple :



Net à payer :

200 000 KMF



Paiement :

100 000 KMF



Solde :

100 000 KMF



Statut :

\*\*Partiellement payé\*\*



\---



\# 32. Paiement intégral fournisseur



Exemple :



Net :

200 000 KMF



Paiement :

200 000 KMF



Solde :

0 KMF



Statut :

\*\*Payé\*\*



\---



\# 33. Paiements multiples



Une même facture peut recevoir plusieurs paiements.



Exemple :



Facture :

500 000 KMF



Paiement 1 :

100 000 KMF



Paiement 2 :

150 000 KMF



Paiement 3 :

250 000 KMF



Total :

500 000 KMF



Solde :

0 KMF



\---



\# 34. Paiement supérieur au solde



Le système doit contrôler tout paiement supérieur au montant restant dû.



Exemple :



Solde :

100 000 KMF



Paiement :

150 000 KMF



Le système doit signaler l'anomalie ou appliquer une règle métier explicitement définie.



Il ne doit pas créer silencieusement un solde incohérent.



\---



\# 35. Paiement non affecté



Lorsqu'un paiement est reçu mais qu'aucune facture ne peut encore lui être associée, il peut être enregistré comme paiement non affecté lorsque cette fonctionnalité est activée.



Exemple :



Virement :

300 000 KMF



Client :

Société ABC



Facture :

non identifiée



Le montant est conservé jusqu'à son affectation.



\---



\# 36. Avance client



ADIKOM peut recevoir une avance avant l'émission d'une facture.



Exemple :



Avance :

200 000 KMF



Cette avance doit être distinguée d'une facture.



Lorsqu'une facture est ensuite créée, l'avance peut être affectée selon les règles d'ADIKOM.



\---



\# 37. Affectation d'une avance



Exemple :



Avance :

200 000 KMF



Facture :

450 000 KMF



Avance affectée :

200 000 KMF



Solde :

250 000 KMF



L'opération d'affectation doit rester traçable.



\---



\# 38. Avoir



Un avoir peut être utilisé pour corriger ou réduire une facture déjà émise.



Exemple :



Facture :

500 000 KMF



Avoir :

50 000 KMF



Net :

450 000 KMF



L'avoir doit rester lié à la facture d'origine.



\---



\# 39. Annulation



Une facture ayant une valeur financière ne doit pas être supprimée physiquement.



Lorsqu'elle doit être invalidée, une procédure d'annulation ou une autre opération appropriée doit être utilisée.



L'historique doit rester disponible.



\---



\# 40. Paiement annulé



Un paiement ayant déjà été enregistré ne doit pas être supprimé silencieusement.



Il doit être annulé ou contrepassé selon la procédure retenue.



Le paiement annulé ne doit plus être comptabilisé dans le total des paiements valides.



\---



\# 41. Banque



Une banque constitue un compte financier utilisé par ADIKOM pour ses opérations.



Le système doit permettre de gérer plusieurs comptes bancaires lorsque nécessaire.



Chaque compte doit être identifiable.



\---



\# 42. Informations d'un compte bancaire



Un compte peut contenir :



\- nom du compte ;

\- banque ;

\- référence ou numéro lorsque nécessaire ;

\- devise ;

\- solde ;

\- statut ;

\- observations.



Les informations sensibles doivent être protégées selon les permissions.



\---



\# 43. Caisse



Une caisse représente un fonds physique ou une caisse opérationnelle utilisée par ADIKOM.



Exemples :



\- caisse principale ;

\- caisse opérationnelle ;

\- autre caisse définie par ADIKOM.



Chaque caisse doit pouvoir être suivie séparément.



\---



\# 44. Solde bancaire



Le solde d'un compte bancaire doit être calculé à partir des mouvements enregistrés selon les règles du module financier.



Il ne doit pas être modifié arbitrairement par un utilisateur sans opération justificative.



\---



\# 45. Solde de caisse



Le même principe s'applique aux caisses.



Chaque entrée et sortie doit être identifiable.



Exemple :



Solde initial :

500 000 KMF



Entrée :

200 000 KMF



Sortie :

100 000 KMF



Solde :

600 000 KMF



\---



\# 46. Encaissement client



Lorsqu'ADIKOM reçoit un paiement client :



\*\*Compte bancaire / caisse augmente\*\*



Le règlement doit être associé à la facture correspondante lorsque celle-ci est connue.



\---



\# 47. Décaissement fournisseur



Lorsqu'ADIKOM règle un fournisseur :



\*\*Compte bancaire / caisse diminue\*\*



Le règlement doit être associé à la facture fournisseur correspondante.



\---



\# 48. Virement interne



Un virement interne représente un transfert entre deux comptes appartenant à ADIKOM.



Exemple :



Caisse :

−100 000 KMF



Banque :

+100 000 KMF



Le système doit considérer l'opération comme un transfert interne et non comme :



\- un revenu ;

\- une dépense ;

\- un paiement client ;

\- un paiement fournisseur.



\---



\# 49. Équilibre d'un virement interne



Pour un virement interne :



\*\*Montant débité = Montant crédité\*\*



Exemple :



Compte A :

−500 000 KMF



Compte B :

+500 000 KMF



Le transfert est équilibré.



\---



\# 50. Référence du mouvement financier



Chaque mouvement financier important doit disposer d'une référence ou d'un identifiant unique permettant sa traçabilité.



Exemples :



\- paiement ;

\- virement ;

\- encaissement ;

\- décaissement.



\---



\# 51. Date du mouvement



La date du mouvement financier doit être enregistrée séparément de la date de facture lorsque celles-ci sont différentes.



Exemple :



Facture :

20/08



Paiement :

25/08



Mouvement bancaire :

25/08



\---



\# 52. Rapprochement bancaire



Les règlements bancaires doivent pouvoir être rapprochés avec les mouvements correspondants lorsque cette fonctionnalité est activée.



Le rapprochement doit permettre de confirmer la cohérence entre :



\*\*Paiement enregistré\*\*



et



\*\*Mouvement bancaire\*\*



\---



\# 53. Rapprochement de caisse



Le même principe s'applique aux opérations de caisse.



Le montant enregistré dans ADIKOM PILOT doit être cohérent avec les mouvements de caisse.



\---



\# 54. Écart financier



Lorsqu'un rapprochement révèle un écart, le système doit permettre de l'identifier.



Exemple :



Paiement enregistré :

200 000 KMF



Mouvement bancaire :

195 000 KMF



Écart :

5 000 KMF



L'écart ne doit pas être masqué.



Il doit être traité selon une procédure définie.



\---



\# 55. Statistiques financières



Le système doit pouvoir produire des indicateurs tels que :



\- chiffre d'affaires facturé ;

\- encaissements ;

\- créances ;

\- dettes fournisseurs ;

\- paiements fournisseurs ;

\- montant des imputations ;

\- dépenses ;

\- solde bancaire ;

\- solde de caisse.



\---



\# 56. Chiffre d'affaires



Le chiffre d'affaires doit être calculé à partir des opérations de vente ou prestations facturées selon la définition financière retenue par ADIKOM.



Le système ne doit pas confondre :



\*\*CA facturé\*\*



avec



\*\*argent effectivement encaissé\*\*



\---



\# 57. Encaissements



Les encaissements représentent les sommes effectivement reçues par ADIKOM.



Exemple :



Factures :

1 000 000 KMF



Encaissements :

700 000 KMF



Créances :

300 000 KMF



\---



\# 58. Créances



Les créances représentent les montants restant dus par les clients.



Elles doivent pouvoir être analysées :



\- par client ;

\- par facture ;

\- par période ;

\- par ancienneté ;

\- par statut.



\---



\# 59. Dettes fournisseurs



Les dettes représentent les montants restant dus aux fournisseurs après prise en compte des imputations applicables.



Elles doivent pouvoir être analysées :



\- par fournisseur ;

\- par facture ;

\- par période ;

\- par ancienneté ;

\- par statut.



\---



\# 60. Analyse par fournisseur



Le système doit pouvoir fournir une vision du montant dû à chaque fournisseur.



Exemple :



\*\*Fournisseur A\*\*



Factures :

1 500 000 KMF



Imputations :

500 000 KMF



Paiements :

700 000 KMF



Solde :

300 000 KMF



\---



\# 61. Analyse par client



Le système doit pouvoir fournir une vision du montant dû par chaque client.



Exemple :



\*\*Client A\*\*



Factures :

2 000 000 KMF



Paiements :

1 500 000 KMF



Solde :

500 000 KMF



\---



\# 62. Ancienneté des créances



Les créances peuvent être classées selon leur ancienneté.



Exemples :



\- non échues ;

\- 1–30 jours ;

\- 31–60 jours ;

\- 61–90 jours ;

\- plus de 90 jours.



Les intervalles définitifs pourront être configurés selon les besoins d'ADIKOM.



\---



\# 63. Ancienneté des dettes



Le même principe peut être appliqué aux dettes fournisseurs.



Cela permet à ADIKOM de connaître les factures qui restent dues depuis longtemps.



\---



\# 64. Tableau de bord financier



Le Tableau de bord peut afficher notamment :



\*\*CA facturé\*\*



\*\*Encaissements\*\*



\*\*Créances clients\*\*



\*\*Dettes fournisseurs\*\*



\*\*Paiements fournisseurs\*\*



\*\*Imputations\*\*



\*\*Solde bancaire\*\*



\*\*Solde de caisse\*\*



\*\*Factures en retard\*\*



Les indicateurs doivent être calculés à partir des données réelles.



\---



\# 65. Périodes financières



Les statistiques doivent pouvoir être filtrées par période.



Exemples :



\- aujourd'hui ;

\- cette semaine ;

\- ce mois ;

\- trimestre ;

\- année ;

\- période personnalisée.



\---



\# 66. Historique financier



Toutes les opérations financières importantes doivent rester historisées.



Le système doit pouvoir reconstituer :



\- facture ;

\- règlement ;

\- imputation ;

\- mouvement bancaire ;

\- mouvement de caisse ;

\- annulation ;

\- correction.



\---



\# 67. Traçabilité



Chaque opération sensible doit permettre d'identifier :



\- utilisateur ;

\- date ;

\- heure ;

\- opération ;

\- montant ;

\- compte concerné ;

\- référence ;

\- modification éventuelle.



\---



\# 68. Séparation des responsabilités



Selon les permissions, ADIKOM peut séparer :



\*\*Création\*\*



↓



\*\*Validation\*\*



↓



\*\*Paiement\*\*



↓



\*\*Rapprochement\*\*



Un même utilisateur peut éventuellement cumuler plusieurs responsabilités uniquement si ADIKOM l'autorise.



\---



\# 69. Permissions financières



Les utilisateurs ne doivent pas tous avoir accès aux mêmes opérations financières.



Les permissions doivent pouvoir contrôler :



\- consultation ;

\- création ;

\- modification ;

\- validation ;

\- annulation ;

\- paiement ;

\- rapprochement ;

\- rapports.



\---



\# 70. Principe du moindre privilège



Un utilisateur doit disposer uniquement des permissions nécessaires à ses fonctions.



Le système doit éviter d'accorder automatiquement des accès financiers complets.



\---



\# 71. Super Admin



Le Super Admin possède l'accès complet au système selon les règles globales d'ADIKOM PILOT.



Il doit notamment pouvoir gérer les utilisateurs et leurs permissions.



Les accès des autres utilisateurs doivent être configurables.



\---



\# 72. Cohérence entre modules



La gestion financière doit rester cohérente avec :



\### Gestion de Location



Pour les revenus issus des locations.



\### Tiers



Pour les clients et fournisseurs.



\### Parc Automobile



Pour les véhicules et leurs coûts.



\### Maintenance



Pour les dépenses et imputations.



\### Facturation \& Paiement



Pour les factures et règlements.



\### Banques \& Caisses



Pour les mouvements financiers.



\### Tableau de bord



Pour le pilotage.



\---



\# 73. Exemple complet — Location



Client :

Société ABC



Tarif standard :

500 000 KMF



Tarif préférentiel :

450 000 KMF



Facture :

450 000 KMF



Paiement :

300 000 KMF



Solde :

150 000 KMF



Situation :



\*\*Location terminée\*\*



\*\*Facture partiellement payée\*\*



\*\*Créance : 150 000 KMF\*\*



Les statuts opérationnel et financier restent distincts.



\---



\# 74. Exemple complet — Fournisseur et maintenance



Fournisseur A :



Facture :

500 000 KMF



Véhicule :

Toyota T5



Maintenance :

300 000 KMF



Imputation :

300 000 KMF



Net :

200 000 KMF



Paiement :

200 000 KMF



Solde :

0 KMF



Résultat :



\*\*Dette fournisseur réglée\*\*



\*\*Maintenance enregistrée\*\*



\*\*Imputation enregistrée\*\*



Les trois opérations restent liées mais distinctes.



\---



\# 75. Exemple — Maintenance partiellement imputée



Maintenance :

300 000 KMF



Imputation fournisseur :

200 000 KMF



Reste :

100 000 KMF



Le système doit pouvoir identifier :



\- coût total ;

\- montant imputé ;

\- montant restant.



Il ne doit pas présenter 200 000 KMF comme le coût total de la maintenance.



\---



\# 76. Exemple — Plusieurs imputations



Facture fournisseur :

1 000 000 KMF



Maintenance A :

300 000 KMF



Maintenance B :

150 000 KMF



Total imputé :

450 000 KMF



Net à payer :

550 000 KMF



Le système doit conserver le détail des deux maintenances.



\---



\# 77. Exemple — Plusieurs comptes



ADIKOM dispose :



\*\*Banque A\*\*



Solde :

2 000 000 KMF



\*\*Caisse principale\*\*



Solde :

500 000 KMF



Un virement interne de :



300 000 KMF



de la banque vers la caisse donne :



Banque A :

1 700 000 KMF



Caisse :

800 000 KMF



Le patrimoine financier global reste inchangé.



\---



\# 78. Exemple — Encaissement



Facture client :

500 000 KMF



Paiement :

500 000 KMF



Compte :

Banque A



Résultat :



Créance :

0 KMF



Banque :

+500 000 KMF



Facture :

Payée



\---



\# 79. Exemple — Décaissement



Facture fournisseur :

500 000 KMF



Imputation :

300 000 KMF



Net :

200 000 KMF



Paiement :

200 000 KMF



Compte :

Banque A



Résultat :



Dette :

0 KMF



Banque :

−200 000 KMF



Facture :

Payée



\---



\# 80. Règle de cohérence globale



Une opération financière ne doit jamais créer de contradiction entre les modules.



Exemple :



Si une facture est indiquée comme payée :



\- son solde doit être nul ;

\- les paiements validés doivent correspondre au montant dû ;

\- le mouvement financier doit être cohérent ;

\- l'historique doit être disponible.



\---



\# 81. Règle de non-suppression



Les opérations financières importantes ne doivent pas être supprimées physiquement après leur validation.



Cela concerne notamment :



\- factures ;

\- paiements ;

\- virements ;

\- imputations ;

\- mouvements financiers.



Les corrections doivent privilégier des mécanismes traçables.



\---



\# 82. Règle de non-rétroactivité financière



Les opérations historiques doivent conserver leur contexte.



Une modification actuelle ne doit pas modifier silencieusement :



\- les anciennes factures ;

\- les anciens paiements ;

\- les anciennes imputations ;

\- les anciens mouvements.



\---



\# 83. Audit financier



ADIKOM doit pouvoir répondre à tout moment à :



\*\*Combien avons-nous facturé ?\*\*



\*\*Combien avons-nous encaissé ?\*\*



\*\*Combien les clients nous doivent-ils ?\*\*



\*\*Combien devons-nous aux fournisseurs ?\*\*



\*\*Combien avons-nous payé ?\*\*



\*\*Combien avons-nous imputé aux fournisseurs ?\*\*



\*\*Quels sont nos soldes bancaires ?\*\*



\*\*Quels sont nos soldes de caisse ?\*\*



Les réponses doivent être basées sur les données enregistrées dans ADIKOM PILOT.



\---



\# 84. Critères d'acceptation



La gestion financière sera considérée comme conforme lorsque :



1\. les factures clients sont gérées ;

2\. les factures fournisseurs sont gérées ;

3\. les factures possèdent des références uniques ;

4\. les factures peuvent être liées à leurs opérations d'origine ;

5\. les tarifs préférentiels clients sont pris en compte ;

6\. les montants sont calculés automatiquement ;

7\. les réductions sont identifiables ;

8\. les frais sont contrôlés ;

9\. les créances clients sont calculées ;

10\. les dettes fournisseurs sont calculées ;

11\. les imputations fournisseurs sont gérées ;

12\. plusieurs imputations peuvent être associées à une facture ;

13\. les paiements clients sont gérés ;

14\. les paiements fournisseurs sont gérés ;

15\. les paiements partiels sont gérés ;

16\. plusieurs paiements peuvent être associés à une facture ;

17\. les soldes sont calculés automatiquement ;

18\. les paiements supérieurs aux soldes sont contrôlés ;

19\. les avances peuvent être gérées lorsque cette fonctionnalité est activée ;

20\. les paiements non affectés peuvent être gérés lorsque nécessaire ;

21\. les banques peuvent être gérées ;

22\. les caisses peuvent être gérées ;

23\. les virements internes sont gérés ;

24\. les mouvements financiers sont traçables ;

25\. les rapprochements peuvent être effectués ;

26\. les statistiques financières peuvent être calculées ;

27\. les créances et dettes peuvent être analysées ;

28\. les données alimentent le Tableau de bord ;

29\. les permissions financières sont respectées ;

30\. les actions sensibles sont historisées ;

31\. les opérations financières ne sont pas supprimées silencieusement ;

32\. les données restent cohérentes entre Facturation, Paiement, Banques \& Caisses, Location, Parc Automobile et Fournisseurs.



\---



\# 85. Principes non négociables



Les règles suivantes sont fondamentales :



1\. Une facture représente une dette ou une créance.

2\. Un paiement représente un règlement réel.

3\. Une imputation n'est pas un paiement.

4\. Un virement interne n'est ni un revenu ni une dépense.

5\. Le solde doit être calculé automatiquement.

6\. Les factures payées doivent avoir un solde nul.

7\. Les paiements annulés ne doivent plus être comptabilisés comme paiements valides.

8\. Les imputations doivent rester distinctes des coûts de maintenance.

9\. Les montants historiques ne doivent pas être modifiés silencieusement.

10\. Les opérations financières importantes doivent être traçables.

11\. Les opérations financières validées ne doivent pas être supprimées physiquement sans procédure appropriée.

12\. Les permissions financières doivent être contrôlées.

13\. Les données financières doivent rester cohérentes entre tous les modules.

14\. Les indicateurs du Tableau de bord doivent provenir des données réelles.

15\. Le système doit toujours permettre d'expliquer l'origine d'un montant.



\---



\# 86. Principe directeur



La gestion financière d'ADIKOM PILOT doit permettre de passer d'une activité opérationnelle à une vision financière fiable.



La logique centrale est :



\*\*Opération\*\*



↓



\*\*Facture\*\*



↓



\*\*Imputation éventuelle\*\*



↓



\*\*Paiement\*\*



↓



\*\*Banque / Caisse\*\*



↓



\*\*Solde\*\*



↓



\*\*Pilotage\*\*



ADIKOM doit pouvoir suivre chaque montant depuis son origine jusqu'à son règlement.



Le système doit notamment permettre de relier :



\*\*Client → Location → Facture → Paiement\*\*



et :



\*\*Fournisseur → Véhicule → Maintenance → Imputation → Facture fournisseur → Paiement\*\*



Le principe fondamental est :



\*\*Tout montant doit pouvoir être expliqué, justifié, retrouvé et relié à son origine.\*\*



ADIKOM PILOT doit ainsi fournir une gestion financière simple à utiliser au quotidien, mais suffisamment structurée pour permettre à la direction de piloter l'activité avec des données fiables.

