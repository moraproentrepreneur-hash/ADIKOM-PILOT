\# ADIKOM PILOT

\## Règles métier 04 — Gestion des fournisseurs



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence métier  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\# 1. Objet



Ce document définit les règles métier relatives à la gestion des fournisseurs dans ADIKOM PILOT.



Le module Fournisseurs doit permettre à ADIKOM de gérer et suivre les entreprises, professionnels ou partenaires auprès desquels ADIKOM obtient notamment :



\- des véhicules ;

\- des prestations ;

\- des services ;

\- des fournitures ;

\- des interventions techniques ;

\- des services de maintenance ;

\- d'autres éléments nécessaires à son activité.



Le module doit également permettre de suivre les relations entre les fournisseurs, les véhicules, les maintenances, les factures et les paiements.



\---



\# 2. Principe général



Un fournisseur constitue une fiche unique dans ADIKOM PILOT.



Il ne doit pas être recréé dans chaque module.



Les autres modules doivent utiliser la fiche fournisseur existante.



Exemple :



\*\*Fournisseur A\*\*



peut être lié à :



\- plusieurs véhicules ;

\- plusieurs factures ;

\- plusieurs maintenances ;

\- plusieurs imputations ;

\- plusieurs paiements ;

\- plusieurs documents ;

\- plusieurs opérations historiques.



\---



\# 3. Identifiant unique



Chaque fournisseur doit disposer d'un identifiant interne unique.



Exemple :



\*\*FOU-2026-000001\*\*



Le format définitif sera défini lors de l'implémentation.



L'identifiant interne ne doit pas être confondu avec :



\- nom commercial ;

\- raison sociale ;

\- numéro de téléphone ;

\- référence externe ;

\- numéro fiscal ou administratif.



\---



\# 4. Informations principales



La fiche fournisseur doit pouvoir contenir notamment :



\- raison sociale ou nom ;

\- type de fournisseur ;

\- personne de contact ;

\- téléphone ;

\- email ;

\- adresse ;

\- informations administratives ;

\- informations bancaires lorsque nécessaires ;

\- statut ;

\- observations ;

\- documents ;

\- historique des opérations.



Les champs obligatoires seront définis lors de l'implémentation selon les besoins d'ADIKOM.



\---



\# 5. Type de fournisseur



ADIKOM doit pouvoir distinguer les différents types de fournisseurs.



Exemples :



\- fournisseur de véhicules ;

\- prestataire de maintenance ;

\- fournisseur de pièces ;

\- prestataire de services ;

\- autre fournisseur.



La liste définitive pourra être adaptée aux activités réelles d'ADIKOM.



\---



\# 6. Statut du fournisseur



Les statuts recommandés sont :



\- Actif ;

\- Inactif ;

\- Suspendu ;

\- Archivé.



Un fournisseur inactif ou suspendu ne doit pas être utilisé pour de nouvelles opérations nécessitant un fournisseur actif, selon les permissions et règles définies.



\---



\# 7. Fournisseur actif



Un fournisseur actif peut être utilisé dans les opérations courantes.



Il peut notamment :



\- être associé à un véhicule ;

\- recevoir une facture ;

\- être associé à une maintenance ;

\- recevoir un paiement ;

\- être sélectionné dans les opérations autorisées.



\---



\# 8. Fournisseur inactif



Un fournisseur peut être rendu inactif lorsqu'ADIKOM ne travaille temporairement ou définitivement plus avec lui.



Son historique doit rester disponible.



Le passage en inactif ne doit pas supprimer :



\- ses anciennes factures ;

\- ses anciens paiements ;

\- ses anciens véhicules ;

\- ses anciennes maintenances ;

\- ses anciennes imputations.



\---



\# 9. Fournisseur suspendu



Un fournisseur peut être suspendu lorsqu'une décision interne impose de ne plus effectuer de nouvelles opérations avec celui-ci.



La suspension doit être identifiable et, lorsque nécessaire, accompagnée d'un motif.



\---



\# 10. Archivage



Un fournisseur qui n'est plus utilisé ne doit pas être supprimé physiquement s'il possède un historique.



Il doit être archivé ou désactivé.



L'historique doit rester accessible aux utilisateurs autorisés.



\---



\# 11. Recherche des fournisseurs



La liste des fournisseurs doit permettre une recherche par :



\- nom ;

\- raison sociale ;

\- référence ;

\- téléphone ;

\- email ;

\- type ;

\- statut.



\---



\# 12. Filtres



La liste doit pouvoir être filtrée notamment par :



\- Actif ;

\- Inactif ;

\- Suspendu ;

\- Archivé ;

\- type de fournisseur.



\---



\# 13. Fiche fournisseur



La fiche fournisseur doit constituer le point central de consultation de la relation entre ADIKOM et le fournisseur.



Elle doit permettre de retrouver, selon les permissions :



\- informations générales ;

\- véhicules associés ;

\- factures ;

\- paiements ;

\- maintenances ;

\- imputations ;

\- documents ;

\- historique ;

\- observations.



\---



\# 14. Fournisseur de véhicules



Un fournisseur peut mettre plusieurs véhicules à disposition d'ADIKOM.



Exemple :



\*\*Fournisseur A\*\*



\- Toyota T5 ;

\- Toyota T6 ;

\- Hyundai H1.



Chaque véhicule doit rester une fiche indépendante dans le module \*\*Parc Automobile\*\*.



\---



\# 15. Relation fournisseur — véhicule



La relation doit être :



\*\*Fournisseur → Véhicule\*\*



Le véhicule doit pouvoir retrouver son fournisseur lorsque celui-ci existe.



La fiche fournisseur doit également pouvoir retrouver les véhicules associés.



\---



\# 16. Plusieurs véhicules



Un fournisseur peut être associé à plusieurs véhicules.



Le système doit pouvoir afficher le nombre et la liste des véhicules associés.



Exemple :



\*\*Fournisseur A\*\*



Véhicules :

5



\---



\# 17. Changement de fournisseur d'un véhicule



Un véhicule peut changer de fournisseur.



Lorsqu'un tel changement intervient, le système doit conserver :



\- ancien fournisseur ;

\- nouveau fournisseur ;

\- date du changement ;

\- motif lorsque nécessaire.



\---



\# 18. Non-rétroactivité du changement de fournisseur



Un changement de fournisseur ne doit pas modifier rétroactivement les opérations historiques.



Exemple :



Toyota T5



Fournisseur jusqu'au 30/06 :

Fournisseur A



Fournisseur à partir du 01/07 :

Fournisseur B



Une maintenance réalisée en juin doit conserver le contexte du fournisseur applicable à cette période.



\---



\# 19. Fournisseur et location



Un fournisseur n'est pas le client de la location.



La relation est distincte :



\*\*Fournisseur → Véhicule ← Location → Client\*\*



Un véhicule peut donc être fourni par un fournisseur et loué à un client sans que les deux relations soient confondues.



\---



\# 20. Fournisseur et maintenance



Une maintenance doit pouvoir être liée :



\- au véhicule ;

\- au fournisseur de maintenance lorsqu'il s'agit du prestataire ;

\- au fournisseur propriétaire ou mettant à disposition le véhicule lorsque pertinent.



Ces deux notions doivent pouvoir être distinguées.



\---



\# 21. Distinction des fournisseurs



Exemple :



Toyota T5 est fourni à ADIKOM par :



\*\*Fournisseur A\*\*



La réparation est réalisée par :



\*\*Garage B\*\*



Le système doit pouvoir distinguer :



\*\*Fournisseur du véhicule : Fournisseur A\*\*



et :



\*\*Prestataire de maintenance : Garage B\*\*



Ils peuvent être identiques, mais ils ne doivent pas être considérés comme identiques automatiquement.



\---



\# 22. Maintenance fournisseur



Lorsqu'une maintenance est effectuée sur un véhicule, le coût doit pouvoir être associé au véhicule concerné.



Exemple :



Toyota T5



Maintenance :

Réparation mécanique



Coût :

300 000 KMF



Le système doit ensuite permettre de déterminer si ce coût est :



\- supporté par ADIKOM ;

\- imputable au fournisseur du véhicule ;

\- facturable au client ;

\- partiellement réparti.



\---



\# 23. Imputation au fournisseur



Lorsqu'une maintenance doit être déduite d'une facture fournisseur, une imputation doit être créée.



Exemple :



Fournisseur A



Facture :

500 000 KMF



Maintenance :

300 000 KMF



Imputation :

300 000 KMF



Net à payer :

200 000 KMF



\---



\# 24. Principe d'imputation



Une imputation fournisseur ne constitue pas une suppression de la facture.



La facture conserve son montant brut.



Exemple :



\*\*Montant brut : 500 000 KMF\*\*



\*\*Montant imputé : 300 000 KMF\*\*



\*\*Net à payer : 200 000 KMF\*\*



\---



\# 25. Imputation ≠ paiement



L'imputation et le paiement doivent rester deux opérations distinctes.



Exemple :



Facture :

500 000 KMF



Imputation :

300 000 KMF



Paiement :

200 000 KMF



Le système doit conserver les trois informations.



\---



\# 26. Plusieurs imputations



Une même facture fournisseur peut recevoir plusieurs imputations.



Exemple :



Facture :

1 000 000 KMF



Imputation 1 :

300 000 KMF



Imputation 2 :

150 000 KMF



Total imputé :

450 000 KMF



Net :

550 000 KMF



Chaque imputation doit rester identifiable.



\---



\# 27. Imputation partielle



Une maintenance peut être imputée partiellement.



Exemple :



Coût :

300 000 KMF



Montant imputé :

200 000 KMF



Reste :

100 000 KMF



Le système doit conserver le montant total de la maintenance et le montant réellement imputé.



\---



\# 28. Justification de l'imputation



Toute imputation doit pouvoir être reliée à son origine.



Exemple :



\*\*Facture fournisseur\*\*



→ \*\*Imputation\*\*



→ \*\*Maintenance\*\*



→ \*\*Véhicule\*\*



→ \*\*Incident éventuel\*\*



Cette chaîne permet de justifier la déduction.



\---



\# 29. Validation de l'imputation



Une imputation ne doit pas être considérée comme définitive simplement parce qu'elle a été saisie.



Selon les permissions, elle peut nécessiter une validation.



La validation doit être traçable.



\---



\# 30. Coût supérieur au montant de la facture



Le système doit contrôler une situation dans laquelle le total des imputations dépasse le montant de la facture.



Exemple :



Facture :

500 000 KMF



Imputations :

600 000 KMF



Cette situation doit être bloquée ou soumise à une procédure spécifique.



Le système ne doit pas générer automatiquement un montant net incohérent.



\---



\# 31. Net à payer



Le montant net à payer doit être calculé automatiquement :



\*\*Montant brut − Imputations validées = Net à payer\*\*



Exemple :



500 000 − 300 000 = 200 000 KMF



\---



\# 32. Facturation fournisseur



Le module fournisseur doit permettre de consulter les factures liées au fournisseur.



La facture fournisseur doit pouvoir contenir :



\- référence ;

\- date ;

\- échéance ;

\- montant ;

\- imputations ;

\- montant net ;

\- paiements ;

\- solde ;

\- statut.



\---



\# 33. Historique des factures



La fiche fournisseur doit permettre de retrouver les factures passées.



Exemple :



\*\*Fournisseur A\*\*



\- FOU-FAC-001 — 500 000 KMF — Payée ;

\- FOU-FAC-002 — 800 000 KMF — Partiellement payée ;

\- FOU-FAC-003 — 300 000 KMF — En attente.



\---



\# 34. Dette fournisseur



Le système doit permettre de déterminer le montant restant dû à un fournisseur.



Formule métier :



\*\*Dette = Factures dues − Imputations applicables − Paiements validés\*\*



Les règles précises de calcul doivent rester cohérentes avec le module financier.



\---



\# 35. Exemple de dette fournisseur



Factures :

1 000 000 KMF



Imputations :

300 000 KMF



Paiements :

500 000 KMF



Solde :

200 000 KMF



Le fournisseur présente une dette restante de :



\*\*200 000 KMF\*\*



\---



\# 36. Paiements fournisseur



Les paiements effectués à un fournisseur doivent être liés aux factures correspondantes lorsque cela est possible.



La fiche fournisseur doit permettre de retrouver les règlements.



\---



\# 37. Paiement partiel



Une facture fournisseur peut être réglée partiellement.



Exemple :



Net à payer :

500 000 KMF



Paiement :

300 000 KMF



Solde :

200 000 KMF



Statut :

\*\*Partiellement payé\*\*



\---



\# 38. Paiement intégral



Exemple :



Net :

500 000 KMF



Paiement :

500 000 KMF



Solde :

0 KMF



Statut :

\*\*Payé\*\*



\---



\# 39. Plusieurs paiements



Une facture fournisseur peut recevoir plusieurs paiements.



Exemple :



Net :

500 000 KMF



Paiement 1 :

200 000 KMF



Paiement 2 :

300 000 KMF



Total :

500 000 KMF



Solde :

0 KMF



\---



\# 40. Historique financier du fournisseur



La fiche fournisseur doit pouvoir présenter, selon les permissions :



\- total facturé ;

\- total imputé ;

\- total payé ;

\- total restant dû ;

\- nombre de factures ;

\- nombre de factures en retard ;

\- nombre de véhicules associés ;

\- coût des maintenances liées lorsque disponible.



\---



\# 41. Fournisseur et documents



La fiche fournisseur doit pouvoir recevoir des documents.



Exemples :



\- contrats ;

\- conventions ;

\- documents administratifs ;

\- coordonnées bancaires ;

\- factures ;

\- justificatifs ;

\- autres documents.



Les documents doivent être accessibles selon les permissions.



\---



\# 42. Contrat fournisseur



Lorsqu'un contrat existe entre ADIKOM et le fournisseur, le système peut permettre de l'associer à la fiche fournisseur.



Le contrat peut notamment concerner :



\- mise à disposition de véhicules ;

\- prestations ;

\- maintenance ;

\- services ;

\- partenariat.



Les conditions détaillées du contrat ne doivent pas être inventées par le système.



\---



\# 43. Échéances contractuelles



Lorsqu'une échéance contractuelle est suivie dans ADIKOM PILOT, elle doit pouvoir être enregistrée.



Exemples :



\- date de début ;

\- date de fin ;

\- renouvellement ;

\- échéance de document.



Le Centre de notifications peut signaler les échéances importantes.



\---



\# 44. Coordonnées bancaires



Les coordonnées bancaires du fournisseur peuvent être enregistrées lorsque nécessaires aux paiements.



Ces informations doivent être protégées.



Elles ne doivent être accessibles qu'aux utilisateurs autorisés.



\---



\# 45. Modification des coordonnées bancaires



Une modification des coordonnées bancaires d'un fournisseur constitue une opération sensible.



Elle doit être contrôlée et, lorsque nécessaire, historisée.



\---



\# 46. Sécurité des paiements fournisseur



Le système doit éviter qu'un utilisateur non autorisé puisse modifier librement les informations nécessaires au paiement d'un fournisseur.



Les permissions doivent pouvoir séparer :



\- consultation ;

\- modification ;

\- validation ;

\- paiement.



\---



\# 47. Fournisseur inactif et historique



Un fournisseur rendu inactif peut conserver :



\- anciennes factures ;

\- anciens paiements ;

\- anciennes maintenances ;

\- anciennes imputations ;

\- anciens véhicules ;

\- anciens documents.



L'inactivation ne doit pas détruire l'historique.



\---



\# 48. Suppression d'un fournisseur



Un fournisseur possédant un historique métier ou financier ne doit pas être supprimé physiquement.



Il doit être :



\- désactivé ;

\- archivé ;

\- suspendu ;



selon la situation.



\---



\# 49. Réactivation



Un fournisseur inactif ou suspendu peut éventuellement être réactivé par un utilisateur autorisé.



La réactivation doit être historisée lorsque nécessaire.



\---



\# 50. Doublons fournisseurs



ADIKOM doit éviter la création de plusieurs fiches représentant le même fournisseur.



Avant la création d'un fournisseur, le système peut rechercher les correspondances sur :



\- nom ;

\- raison sociale ;

\- téléphone ;

\- email ;

\- informations administratives.



Le système doit signaler les doublons potentiels.



\---



\# 51. Fusion de fournisseurs



La fusion de deux fiches fournisseurs ne doit pas être réalisée automatiquement.



Une telle opération peut avoir des conséquences sur :



\- factures ;

\- paiements ;

\- véhicules ;

\- maintenances ;

\- imputations ;

\- historique.



Elle doit donc être contrôlée et réservée aux utilisateurs autorisés si cette fonctionnalité est développée.



\---



\# 52. Statistiques fournisseurs



ADIKOM doit pouvoir analyser ses fournisseurs.



Exemples :



\- nombre de fournisseurs actifs ;

\- montant facturé par fournisseur ;

\- montant payé ;

\- montant restant dû ;

\- montant imputé ;

\- nombre de véhicules fournis ;

\- coûts de maintenance associés.



\---



\# 53. Analyse des fournisseurs de véhicules



Le système peut permettre de comparer les fournisseurs de véhicules selon :



\- nombre de véhicules ;

\- revenus générés par ces véhicules ;

\- coûts de maintenance ;

\- montants imputés ;

\- montant facturé ;

\- disponibilité ;

\- autres indicateurs disponibles.



\---



\# 54. Coût fournisseur



Le système doit permettre de distinguer :



\*\*Facturation fournisseur\*\*



et :



\*\*Coût de maintenance du véhicule\*\*



et :



\*\*Montant imputé\*\*



Ces trois valeurs ne doivent pas être confondues.



\---



\# 55. Exemple de suivi fournisseur



Fournisseur A :



Véhicules :

5



Factures :

2 000 000 KMF



Maintenances :

600 000 KMF



Imputations :

400 000 KMF



Paiements :

1 300 000 KMF



Dette restante :

300 000 KMF



Ces chiffres doivent être calculés à partir des opérations enregistrées.



\---



\# 56. Relation avec le parc automobile



La fiche fournisseur doit permettre de retrouver les véhicules qui lui sont associés.



Relation :



\*\*Fournisseur → Parc Automobile\*\*



La fiche véhicule doit également permettre de retrouver son fournisseur.



\---



\# 57. Relation avec la maintenance



La fiche fournisseur peut permettre de retrouver les maintenances associées à ses véhicules lorsque le fournisseur est concerné.



Exemple :



Fournisseur A



Toyota T5



Maintenance :

300 000 KMF



\---



\# 58. Relation avec la facturation



La fiche fournisseur doit permettre d'accéder à ses factures.



Relation :



\*\*Fournisseur → Factures fournisseurs\*\*



\---



\# 59. Relation avec les paiements



La fiche fournisseur doit permettre de retrouver les règlements effectués.



Relation :



\*\*Fournisseur → Factures → Paiements\*\*



\---



\# 60. Relation avec les imputations



La fiche fournisseur doit permettre de retrouver les imputations qui lui sont associées.



Relation :



\*\*Fournisseur → Facture → Imputation → Maintenance\*\*



\---



\# 61. Notifications fournisseur



Le Centre de notifications peut signaler :



\- nouvelle facture fournisseur ;

\- facture à valider ;

\- échéance proche ;

\- facture en retard ;

\- paiement à effectuer ;

\- maintenance nécessitant une imputation ;

\- contrat arrivant à échéance ;

\- document arrivant à expiration.



\---



\# 62. Audit fournisseur



Le système doit permettre de reconstituer les opérations importantes liées à un fournisseur.



Exemple :



\*\*Fournisseur A\*\*



01/01 :

Création



05/01 :

Toyota T5 associé



20/08 :

Maintenance de 300 000 KMF



25/08 :

Imputation de 300 000 KMF



30/08 :

Facture fournisseur de 500 000 KMF



05/09 :

Paiement de 200 000 KMF



Cette chronologie doit rester exploitable.



\---



\# 63. Traçabilité



Les opérations importantes doivent conserver :



\- utilisateur ;

\- date ;

\- heure ;

\- action ;

\- ancienne valeur lorsque nécessaire ;

\- nouvelle valeur lorsque nécessaire ;

\- motif lorsque nécessaire.



\---



\# 64. Permissions



Les accès aux fournisseurs doivent être contrôlés par le module \*\*Utilisateurs \& Groupes\*\*.



Un utilisateur peut disposer de permissions différentes pour :



\- consulter ;

\- créer ;

\- modifier ;

\- désactiver ;

\- consulter les factures ;

\- consulter les paiements ;

\- gérer les imputations ;

\- consulter les informations sensibles.



\---



\# 65. Données sensibles



Certaines informations fournisseurs peuvent être sensibles, notamment :



\- coordonnées bancaires ;

\- documents contractuels ;

\- informations administratives ;

\- informations financières.



Elles doivent être accessibles uniquement aux utilisateurs autorisés.



\---



\# 66. Principe du moindre privilège



Un utilisateur doit disposer uniquement des permissions nécessaires à sa fonction.



Un utilisateur chargé de consulter les fournisseurs ne doit pas nécessairement pouvoir :



\- modifier leurs coordonnées bancaires ;

\- valider une imputation ;

\- effectuer un paiement ;

\- archiver un fournisseur.



\---



\# 67. Super Admin



Le Super Admin possède l'accès complet au système selon les règles globales d'ADIKOM PILOT.



Il peut notamment gérer les utilisateurs et leurs permissions.



Les autres accès doivent être configurables.



\---



\# 68. Cohérence avec les autres modules



\### Tiers



Le fournisseur constitue une entité du module Tiers.



\### Parc Automobile



Les véhicules fournis sont associés au fournisseur.



\### Gestion de Location



Les véhicules du fournisseur peuvent être loués aux clients.



\### Maintenance



Les interventions sur les véhicules peuvent être liées au fournisseur concerné.



\### Facturation \& Paiement



Les factures et paiements fournisseurs sont liés à la fiche fournisseur.



\### Banques \& Caisses



Les paiements fournisseurs peuvent générer des sorties financières.



\### Tableau de bord



Les données fournisseurs peuvent alimenter les indicateurs de pilotage.



\---



\# 69. Exemple complet — Fournisseur de véhicule



\## Fournisseur



Fournisseur A



\---



\## Véhicule



Toyota T5



Valeur / tarif fournisseur :

500 000 KMF



\---



\## Location



Client :

Société ABC



Le véhicule est loué.



\---



\## Retour



Une panne est constatée.



\---



\## Maintenance



Coût :

300 000 KMF



\---



\## Imputation



Le montant de :



300 000 KMF



est imputé au fournisseur conformément aux conditions applicables.



\---



\## Facture fournisseur



Montant :

500 000 KMF



Imputation :

300 000 KMF



Net :

200 000 KMF



\---



\## Paiement



Paiement :

200 000 KMF



Solde :

0 KMF



\---



\# 70. Exemple — Fournisseur avec plusieurs véhicules



Fournisseur A :



\- Toyota T5 ;

\- Toyota T6 ;

\- Toyota T7.



Toyota T5 :

En location



Toyota T6 :

Disponible



Toyota T7 :

En maintenance



La fiche fournisseur doit permettre de voir la situation de chaque véhicule.



\---



\# 71. Exemple — Fournisseur avec plusieurs imputations



Facture :

1 000 000 KMF



Maintenance Toyota T5 :

300 000 KMF



Maintenance Toyota T6 :

200 000 KMF



Total imputé :

500 000 KMF



Net :

500 000 KMF



Les deux imputations doivent rester distinctes.



\---



\# 72. Exemple — Maintenance non imputée



Maintenance :

300 000 KMF



Fournisseur :

A



Montant imputé :

0 KMF



Dans ce cas, la maintenance reste enregistrée mais aucune déduction fournisseur ne doit être créée.



\---



\# 73. Exemple — Maintenance partiellement imputée



Maintenance :

300 000 KMF



Montant imputé :

150 000 KMF



Reste :

150 000 KMF



Le système doit afficher clairement cette situation.



\---



\# 74. Exemple — Fournisseur inactif



Fournisseur A



Statut :

Inactif



Il possède :



\- 5 anciennes factures ;

\- 3 anciens véhicules ;

\- 8 maintenances ;

\- 4 imputations ;

\- plusieurs paiements.



Toutes ces données restent accessibles selon les permissions.



Le fournisseur ne doit simplement plus être proposé dans les nouvelles opérations qui nécessitent un fournisseur actif.



\---



\# 75. Principes non négociables



Les règles suivantes sont fondamentales :



1\. Chaque fournisseur possède une fiche unique.

2\. Un fournisseur peut être associé à plusieurs véhicules.

3\. Un véhicule ne doit pas être rattaché simultanément à plusieurs fournisseurs actifs sans règle spécifique.

4\. Les changements de fournisseur doivent être historisés.

5\. Les anciennes opérations ne doivent pas être modifiées rétroactivement.

6\. Une maintenance doit être liée au véhicule concerné.

7\. Le fournisseur du véhicule et le prestataire de maintenance doivent pouvoir être distingués.

8\. Une maintenance ne doit pas automatiquement être imputée au fournisseur.

9\. Une imputation doit être justifiée et traçable.

10\. Une imputation n'est pas un paiement.

11\. Le montant brut d'une facture fournisseur doit être conservé.

12\. Le net à payer doit être calculé automatiquement.

13\. Les paiements fournisseurs doivent être séparés des imputations.

14\. Un fournisseur ayant un historique ne doit pas être supprimé physiquement.

15\. Les informations sensibles doivent être protégées.

16\. Les actions importantes doivent être historisées.

17\. Les permissions doivent être respectées.

18\. Les données fournisseurs doivent rester cohérentes avec Parc Automobile, Maintenance, Facturation \& Paiement et Banques \& Caisses.



\---



\# 76. Critères d'acceptation



La gestion des fournisseurs sera considérée comme conforme lorsque :



1\. un fournisseur peut être créé ;

2\. une référence unique est attribuée ;

3\. les informations principales peuvent être enregistrées ;

4\. le type de fournisseur peut être défini ;

5\. le statut peut être défini ;

6\. les doublons potentiels peuvent être identifiés ;

7\. plusieurs véhicules peuvent être associés ;

8\. un véhicule peut être rattaché à un fournisseur ;

9\. un changement de fournisseur peut être historisé ;

10\. les factures fournisseurs peuvent être associées ;

11\. les paiements peuvent être associés ;

12\. les maintenances peuvent être retrouvées ;

13\. les prestataires de maintenance peuvent être distingués des fournisseurs de véhicules ;

14\. les imputations peuvent être créées ;

15\. plusieurs imputations peuvent être associées à une facture ;

16\. les imputations partielles peuvent être gérées ;

17\. le net à payer est calculé automatiquement ;

18\. les paiements partiels sont gérés ;

19\. les paiements multiples sont gérés ;

20\. les documents peuvent être associés ;

21\. les coordonnées sensibles sont protégées ;

22\. les statistiques fournisseurs peuvent être calculées ;

23\. les notifications peuvent être générées ;

24\. l'historique complet du fournisseur est consultable ;

25\. un fournisseur inactif reste accessible dans l'historique ;

26\. un fournisseur ayant un historique n'est pas supprimé physiquement ;

27\. les permissions sont respectées ;

28\. les actions importantes sont journalisées ;

29\. les relations avec les véhicules restent cohérentes ;

30\. les relations avec les maintenances restent cohérentes ;

31\. les relations avec les factures et paiements restent cohérentes ;

32\. les données fournisseurs restent cohérentes avec l'ensemble du système.



\---



\# 77. Principe directeur



Le fournisseur doit constituer le point central de suivi de la relation entre ADIKOM et ses partenaires d'approvisionnement ou de mise à disposition.



La logique de référence est :



\*\*Fournisseur\*\*



↓



\*\*Véhicule éventuel\*\*



↓



\*\*Location\*\*



↓



\*\*Incident éventuel\*\*



↓



\*\*Maintenance\*\*



↓



\*\*Imputation éventuelle\*\*



↓



\*\*Facture fournisseur\*\*



↓



\*\*Paiement\*\*



↓



\*\*Solde\*\*



Le système doit permettre à ADIKOM de comprendre à tout moment :



\*\*Avec qui travaillons-nous ?\*\*



\*\*Quels véhicules ce fournisseur nous met-il à disposition ?\*\*



\*\*Quelles factures avons-nous reçues ?\*\*



\*\*Combien lui devons-nous ?\*\*



\*\*Quels coûts de maintenance sont liés à ses véhicules ?\*\*



\*\*Quels montants avons-nous imputés ?\*\*



\*\*Quels paiements avons-nous effectués ?\*\*



Le principe fondamental est :



\*\*Chaque fournisseur doit disposer d'une relation complète, traçable et financièrement explicable avec ADIKOM.\*\*



ADIKOM PILOT doit ainsi transformer la gestion des fournisseurs en une véritable source de pilotage permettant à la direction de suivre les relations, les coûts, les véhicules, les engagements et les règlements.

