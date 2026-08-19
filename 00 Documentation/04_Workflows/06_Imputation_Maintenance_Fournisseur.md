\# ADIKOM PILOT

\## Workflow 06 — Imputation d'une maintenance au fournisseur



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence fonctionnelle  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\# 1. Objet du workflow



Ce document décrit le processus permettant à ADIKOM d'imputer au fournisseur tout ou partie du coût d'une maintenance réalisée sur un véhicule fourni par ce dernier.



Ce workflow répond à un cas métier spécifique d'ADIKOM :



Un fournisseur met un véhicule à la disposition d'ADIKOM.



Le véhicule est exploité dans le cadre de locations.



Lorsqu'une panne ou un problème nécessite une réparation, ADIKOM peut avancer ou engager le coût de la réparation.



Lorsque les conditions convenues avec le fournisseur prévoient que cette dépense doit être supportée par celui-ci, ADIKOM déduit le montant correspondant de la somme qu'elle doit au fournisseur.



Exemple de référence :



\*\*Montant dû au fournisseur : 500 000 KMF\*\*



\*\*Coût de maintenance : 300 000 KMF\*\*



\*\*Montant imputé : 300 000 KMF\*\*



\*\*Solde fournisseur : 200 000 KMF\*\*



\---



\# 2. Principe fondamental



Une maintenance et une imputation sont deux opérations différentes.



\### Maintenance



Elle répond à :



\*\*Quel problème a été constaté et combien coûte sa résolution ?\*\*



\### Imputation



Elle répond à :



\*\*Quelle partie de cette dépense doit être déduite du montant dû au fournisseur ?\*\*



Il ne faut donc jamais considérer qu'une maintenance crée automatiquement une imputation.



La chaîne correcte est :



\*\*Véhicule → Maintenance → Dépense → Validation → Imputation éventuelle → Facture fournisseur → Paiement\*\*



\---



\# 3. Conditions préalables



Une imputation fournisseur ne peut être créée que si :



\- le véhicule est identifié ;

\- le fournisseur est identifié ;

\- une maintenance existe ;

\- le coût de la maintenance est connu ou suffisamment documenté ;

\- la maintenance est validée lorsque cela est nécessaire ;

\- la dépense est identifiable ;

\- la dépense est effectivement imputable au fournisseur selon les conditions applicables ;

\- l'utilisateur possède les permissions nécessaires.



\---



\# 4. Véhicule concerné



Le véhicule doit être associé à un fournisseur dans le référentiel des véhicules.



Exemple :



\*\*Véhicule : Toyota T5\*\*



\*\*Fournisseur : Fournisseur A\*\*



Cette relation permet au système de déterminer à quel fournisseur l'imputation peut être rattachée.



\---



\# 5. Maintenance concernée



L'imputation doit obligatoirement être liée à une maintenance existante.



Exemple :



\*\*Maintenance : MNT-2026-0005\*\*



\*\*Véhicule : Toyota T5\*\*



\*\*Motif : Panne mécanique\*\*



\*\*Coût réel : 300 000 KMF\*\*



L'utilisateur ne doit pas pouvoir créer une imputation indépendante sans justification métier.



\---



\# 6. Dépense de maintenance



Avant toute imputation, le montant de la dépense doit être clairement identifié.



Exemple :



Pièces :

200 000 KMF



Main-d'œuvre :

100 000 KMF



\*\*Coût total : 300 000 KMF\*\*



Ce montant constitue la base potentielle de l'imputation.



\---



\# 7. Montant imputable



Le coût total de maintenance n'est pas nécessairement égal au montant imputable.



Exemple :



Coût total :

300 000 KMF



Montant imputable :

200 000 KMF



Montant non imputable :

100 000 KMF



Le système doit pouvoir distinguer ces trois informations.



\---



\# 8. Imputation totale



Lorsque la totalité du coût est imputable au fournisseur :



Coût maintenance :

300 000 KMF



Montant imputable :

300 000 KMF



Montant restant non imputé :

0 KMF



\---



\# 9. Imputation partielle



Lorsque seule une partie du coût est imputable :



Coût maintenance :

300 000 KMF



Montant imputable :

200 000 KMF



Montant non imputé :

100 000 KMF



Le système doit conserver la totalité de la dépense tout en enregistrant uniquement la partie réellement imputée.



\---



\# 10. Aucune imputation



Une maintenance peut ne donner lieu à aucune imputation.



Exemple :



Véhicule :

Toyota T5



Coût maintenance :

300 000 KMF



Montant imputable :

0 KMF



Motif :

Charge supportée par ADIKOM.



La maintenance reste enregistrée.



Aucune imputation fournisseur n'est créée.



\---



\# 11. Justification de l'imputation



Lorsqu'une imputation est créée, le système doit permettre d'enregistrer sa justification.



Exemple :



\*\*Motif :\*\*



> Coût de réparation d'une panne mécanique imputable au fournisseur selon les conditions de mise à disposition du véhicule.



La justification permet de comprendre pourquoi le montant a été déduit.



\---



\# 12. Validation de l'imputation



La création d'une imputation peut nécessiter une validation selon les permissions définies par ADIKOM.



Le système doit distinguer :



\*\*Imputation préparée\*\*



et



\*\*Imputation validée\*\*



Une imputation non validée ne doit pas être considérée comme définitivement déduite du montant fournisseur.



\---



\# 13. Statuts de l'imputation



Les statuts recommandés sont :



\- Brouillon ;

\- À valider ;

\- Validée ;

\- Imputée ;

\- Annulée.



Les statuts définitifs pourront être adaptés lors de l'implémentation.



\---



\# 14. Brouillon



Une imputation en brouillon est en cours de préparation.



Elle peut être modifiée.



Elle n'a pas encore d'effet définitif sur le solde fournisseur.



\---



\# 15. À valider



L'imputation est prête mais nécessite une validation.



Les informations doivent être complètes :



\- fournisseur ;

\- véhicule ;

\- maintenance ;

\- montant ;

\- justification ;

\- document lorsque nécessaire.



\---



\# 16. Validée



L'imputation a été contrôlée et approuvée.



Elle peut alors être rattachée au processus de facturation fournisseur selon les règles du système.



\---



\# 17. Imputée



L'imputation est considérée comme effectivement prise en compte dans le montant dû au fournisseur.



Exemple :



Facture fournisseur :

500 000 KMF



Imputation :

300 000 KMF



Montant restant dû :

200 000 KMF



\---



\# 18. Annulée



Une imputation peut être annulée lorsqu'une erreur est constatée ou lorsque la décision d'imputer est abandonnée.



L'annulation doit être historisée.



Elle ne doit pas supprimer l'historique de l'opération.



\---



\# 19. Calcul du montant restant



Le système doit calculer le montant restant dû après imputation.



Formule :



\*\*Montant restant dû = Montant dû − Montant imputé\*\*



Exemple :



500 000 − 300 000 = 200 000 KMF



Le résultat doit être calculé par le système afin d'éviter les erreurs de saisie.



\---



\# 20. Cas d'une imputation supérieure au montant dû



Le système ne doit pas accepter automatiquement une imputation supérieure au montant disponible sur la facture ou le montant concerné.



Exemple :



Montant dû :

500 000 KMF



Imputation demandée :

600 000 KMF



Le système doit signaler l'incohérence.



Une gestion particulière peut être définie ultérieurement pour les crédits ou reports éventuels, mais elle ne doit pas être inventée automatiquement.



\---



\# 21. Plusieurs maintenances



Un même fournisseur peut avoir plusieurs véhicules concernés par plusieurs maintenances.



Exemple :



Toyota T5 :

300 000 KMF



Toyota T6 :

100 000 KMF



Total imputable :

400 000 KMF



Le système doit pouvoir conserver chaque maintenance séparément tout en permettant de connaître le total imputé au fournisseur.



\---



\# 22. Plusieurs imputations



Une même facture fournisseur peut recevoir plusieurs imputations.



Exemple :



Facture fournisseur :

1 000 000 KMF



Imputation 1 :

300 000 KMF



Imputation 2 :

150 000 KMF



Total imputé :

450 000 KMF



Solde :

550 000 KMF



Chaque imputation doit rester identifiable.



\---



\# 23. Historique des imputations



Le système doit permettre de consulter l'historique des imputations associées à un fournisseur.



Exemple :



\*\*Fournisseur A\*\*



\- MNT-001 → 300 000 KMF

\- MNT-004 → 150 000 KMF

\- MNT-008 → 100 000 KMF



Total :

550 000 KMF



\---



\# 24. Imputation liée à une facture fournisseur



Lorsque la dépense est déduite d'une facture fournisseur précise, l'imputation doit être reliée à cette facture.



Relation :



\*\*Fournisseur → Facture → Imputation → Maintenance → Véhicule\*\*



Cela permet de comprendre exactement pourquoi le montant final de la facture a été réduit.



\---



\# 25. Facture fournisseur



Exemple :



Fournisseur A



Facture :

FAC-F-2026-0010



Montant brut :

500 000 KMF



Imputation maintenance :

300 000 KMF



Net à payer :

200 000 KMF



La facture doit conserver les montants nécessaires à la traçabilité.



\---



\# 26. Distinction entre montant brut et montant net



Le système doit distinguer :



\*\*Montant brut\*\*



du



\*\*Montant imputé\*\*



et du



\*\*Montant net à payer\*\*



Exemple :



Montant brut :

500 000 KMF



Imputation :

300 000 KMF



Net à payer :

200 000 KMF



\---



\# 27. Imputation et paiement



L'imputation ne constitue pas un paiement.



Exemple :



Montant brut :

500 000 KMF



Imputation :

300 000 KMF



Paiement :

200 000 KMF



L'argent réellement transféré au fournisseur est :



\*\*200 000 KMF\*\*



L'imputation représente une réduction du montant dû.



\---



\# 28. Liaison avec Banques \& Caisses



Lorsque le montant net est payé :



Facture fournisseur :

500 000 KMF



Imputation :

300 000 KMF



Montant à payer :

200 000 KMF



Paiement bancaire :

200 000 KMF



Le paiement doit être enregistré dans :



\*\*Facturation \& Paiement\*\*



et relié au mouvement financier correspondant dans :



\*\*Banques \& Caisses\*\*



\---



\# 29. Paiement partiel après imputation



Le fournisseur peut être payé partiellement après imputation.



Exemple :



Facture :

500 000 KMF



Imputation :

300 000 KMF



Net à payer :

200 000 KMF



Paiement :

100 000 KMF



Solde :

100 000 KMF



Le système doit conserver séparément :



\- montant facturé ;

\- montant imputé ;

\- montant payé ;

\- solde.



\---



\# 30. Plusieurs paiements après imputation



Exemple :



Facture :

500 000 KMF



Imputation :

300 000 KMF



Net :

200 000 KMF



Paiement 1 :

100 000 KMF



Paiement 2 :

100 000 KMF



Solde :

0 KMF



La facture peut alors être considérée comme réglée.



\---



\# 31. Imputation avant facture



Dans certains cas, une maintenance peut être validée avant que la facture fournisseur correspondante ne soit enregistrée.



Le système peut permettre de préparer l'imputation en attente de rattachement à une facture.



Cette opération doit rester identifiable comme :



\*\*Imputation en attente de facture\*\*



Elle ne doit pas être considérée comme un paiement.



\---



\# 32. Imputation après facture



Lorsque la facture fournisseur existe déjà, l'imputation peut être directement rattachée à celle-ci.



Exemple :



Facture :

500 000 KMF



Maintenance :

300 000 KMF



Imputation :

300 000 KMF



Net :

200 000 KMF



\---



\# 33. Vérification du fournisseur



Avant validation, le système doit vérifier que :



\- le fournisseur de la maintenance correspond au fournisseur du véhicule ;

\- ou qu'une autre relation justifie l'imputation.



Le système ne doit pas permettre une imputation incohérente entre un véhicule et un fournisseur sans justification.



\---



\# 34. Vérification de la maintenance



L'utilisateur doit pouvoir accéder directement à la maintenance depuis l'imputation.



Exemple :



\*\*Imputation IMP-2026-0003\*\*



→ Maintenance MNT-2026-0005



→ Toyota T5



→ Fournisseur A



→ Coût 300 000 KMF



\---



\# 35. Documents justificatifs



L'imputation doit pouvoir être accompagnée de documents justificatifs.



Exemples :



\- facture du garage ;

\- reçu ;

\- devis ;

\- bon de réparation ;

\- rapport d'intervention ;

\- document contractuel ;

\- autre justificatif.



\---



\# 36. Contrôle du montant



Le montant imputé doit respecter plusieurs règles :



\- ne pas dépasser le coût de la maintenance ;

\- ne pas dépasser le montant autorisé à imputer ;

\- ne pas créer un solde incohérent ;

\- respecter les éventuelles limites définies par ADIKOM.



\---



\# 37. Montant imputable autorisé



Le système doit distinguer :



\*\*Coût réel\*\*



\*\*Montant autorisé à imputer\*\*



\*\*Montant effectivement imputé\*\*



Exemple :



Coût réel :

300 000 KMF



Montant autorisé :

250 000 KMF



Montant effectivement imputé :

250 000 KMF



Reste non imputé :

50 000 KMF



\---



\# 38. Modification avant validation



Tant que l'imputation n'est pas validée, un utilisateur autorisé peut modifier :



\- montant ;

\- facture ;

\- justification ;

\- documents.



Les modifications doivent rester traçables lorsque nécessaire.



\---



\# 39. Modification après validation



Une imputation validée ne doit pas pouvoir être modifiée librement.



Toute correction doit suivre une procédure contrôlée.



Le système doit conserver :



\- ancienne valeur ;

\- nouvelle valeur ;

\- utilisateur ;

\- date ;

\- motif.



\---



\# 40. Annulation d'une imputation



Lorsqu'une imputation doit être annulée :



\- l'imputation passe à « Annulée » ;

\- le montant précédemment déduit est réintégré dans le solde concerné ;

\- l'historique est conservé.



Exemple :



Facture :

500 000 KMF



Imputation :

300 000 KMF



Net :

200 000 KMF



Après annulation :



Imputation :

0 KMF



Net :

500 000 KMF



\---



\# 41. Correction par contrepassation



Pour une opération déjà intégrée à une facture ou à un historique financier, une correction peut nécessiter une opération inverse plutôt qu'une suppression.



Exemple :



Imputation initiale :

300 000 KMF



Erreur détectée.



Contre-imputation :

+300 000 KMF



La trace de l'opération initiale reste conservée.



La méthode exacte sera définie dans l'implémentation financière.



\---



\# 42. Historique fournisseur



La fiche fournisseur doit pouvoir afficher les opérations liées aux imputations.



Exemple :



\*\*Fournisseur A\*\*



Montant brut :

5 000 000 KMF



Imputations :

\- 300 000 KMF

\- 200 000 KMF

\- 150 000 KMF



Total imputé :

650 000 KMF



Montant net :

4 350 000 KMF



Les montants affichés doivent être calculés à partir des opérations réellement enregistrées.



\---



\# 43. Historique du véhicule



La fiche du véhicule doit également permettre de retrouver les maintenances ayant généré des imputations.



Exemple :



\*\*Toyota T5\*\*



Maintenance :

300 000 KMF



Imputation fournisseur :

300 000 KMF



Fournisseur :

Fournisseur A



Cette information permet d'avoir une vision complète du coût d'exploitation du véhicule.



\---



\# 44. Analyse par fournisseur



Le système peut permettre d'obtenir :



\- nombre de maintenances ;

\- coût total ;

\- montant imputé ;

\- montant non imputé ;

\- montant payé ;

\- solde fournisseur.



Exemple :



Fournisseur A



Coût maintenance :

1 000 000 KMF



Montant imputé :

800 000 KMF



Montant non imputé :

200 000 KMF



\---



\# 45. Analyse par véhicule



Le système peut également afficher :



Véhicule :

Toyota T5



Maintenances :

3



Coût total :

650 000 KMF



Montant imputé :

500 000 KMF



Montant non imputé :

150 000 KMF



\---



\# 46. Notifications



Une notification peut être générée lorsque :



\- une imputation doit être validée ;

\- une facture attend une imputation ;

\- une imputation dépasse un seuil ;

\- une imputation est annulée ;

\- une facture fournisseur reste à payer après imputation.



Les notifications doivent respecter les permissions.



\---



\# 47. Seuils de validation



ADIKOM peut décider d'utiliser des seuils de validation.



Exemple :



Imputation ≤ 100 000 KMF :

validation simple



Imputation > 100 000 KMF :

validation du responsable



Imputation importante :

validation de la direction



Les seuils définitifs ne doivent être automatisés qu'après validation par ADIKOM.



\---



\# 48. Responsabilité et contrôle



Le système doit permettre de distinguer :



\- utilisateur ayant créé l'imputation ;

\- utilisateur ayant validé ;

\- utilisateur ayant effectué une correction ;

\- utilisateur ayant annulé.



Cela permet d'éviter qu'une opération sensible soit impossible à retracer.



\---



\# 49. Sécurité



Seuls les utilisateurs autorisés peuvent :



\- créer une imputation ;

\- consulter les imputations sensibles ;

\- modifier une imputation ;

\- valider ;

\- annuler.



Les permissions doivent être contrôlées côté serveur.



\---



\# 50. Journal d'activité



Les événements importants doivent être enregistrés.



Exemple :



\*\*10:00\*\*

Utilisateur A crée l'imputation.



\*\*10:15\*\*

Utilisateur B valide.



\*\*11:00\*\*

Imputation rattachée à la facture.



\*\*15:00\*\*

Paiement de 200 000 KMF enregistré.



L'historique doit rester disponible.



\---



\# 51. Exemple complet — Cas ADIKOM



\## Situation



Fournisseur A fournit une Toyota T5 à ADIKOM.



Montant prévu :

500 000 KMF



Le véhicule est mis en location.



\---



\## Panne



Après une location, une panne est constatée.



Maintenance :



\*\*300 000 KMF\*\*



La maintenance est enregistrée :



MNT-2026-0005



\---



\## Validation



La dépense est validée.



ADIKOM détermine que le coût est imputable au fournisseur.



Montant imputable :



\*\*300 000 KMF\*\*



\---



\## Imputation



Création :



IMP-2026-0003



Fournisseur :

A



Véhicule :

Toyota T5



Maintenance :

MNT-2026-0005



Montant :

300 000 KMF



\---



\## Facture fournisseur



Montant brut :

500 000 KMF



Imputation :

300 000 KMF



Net à payer :

200 000 KMF



\---



\## Paiement



ADIKOM règle :



\*\*200 000 KMF\*\*



Le paiement est enregistré.



\---



\## Résultat



Maintenance :

300 000 KMF



Imputation :

300 000 KMF



Montant brut fournisseur :

500 000 KMF



Paiement :

200 000 KMF



Solde :

0 KMF



L'ensemble du processus reste traçable.



\---



\# 52. Exemple — Imputation partielle



Maintenance :



300 000 KMF



Montant imputable :



200 000 KMF



Facture fournisseur :



500 000 KMF



Calcul :



500 000 − 200 000 = 300 000 KMF



Net à payer :



\*\*300 000 KMF\*\*



Le montant non imputé de la maintenance :



\*\*100 000 KMF\*\*



reste identifié séparément.



\---



\# 53. Exemple — Deux maintenances



Facture fournisseur :



1 000 000 KMF



Maintenance 1 :

300 000 KMF



Maintenance 2 :

200 000 KMF



Total imputé :



500 000 KMF



Net :



500 000 KMF



Le système doit conserver les deux imputations séparément.



\---



\# 54. Exemple — Imputation annulée



Facture :



500 000 KMF



Imputation :



300 000 KMF



Net :



200 000 KMF



Une erreur est détectée.



L'imputation est annulée.



Nouveau calcul :



500 000 KMF



L'historique doit montrer :



Imputation initiale :

300 000 KMF



Annulation :

300 000 KMF



Montant final imputé :

0 KMF



\---



\# 55. Relation avec la facturation fournisseur



Le workflow doit permettre la relation :



\*\*Maintenance\*\*



↓



\*\*Imputation\*\*



↓



\*\*Facture fournisseur\*\*



↓



\*\*Règlement\*\*



La facture fournisseur doit pouvoir présenter clairement les éventuelles déductions.



\---



\# 56. Relation avec Banques \& Caisses



La chaîne financière finale est :



\*\*Facture fournisseur\*\*



↓



\*\*Imputation\*\*



↓



\*\*Net à payer\*\*



↓



\*\*Règlement\*\*



↓



\*\*Banque ou caisse\*\*



Chaque étape doit rester identifiable.



\---



\# 57. Critères d'acceptation du workflow



Le workflow d'imputation sera considéré comme correctement implémenté lorsque :



1\. une maintenance peut être sélectionnée ;

2\. le véhicule est identifié ;

3\. le fournisseur est identifié ;

4\. la dépense de maintenance est connue ;

5\. le montant imputable peut être déterminé ;

6\. une imputation totale est possible ;

7\. une imputation partielle est possible ;

8\. aucune imputation peut être enregistrée ;

9\. une justification peut être ajoutée ;

10\. un justificatif peut être associé ;

11\. une imputation peut être créée ;

12\. l'imputation peut être soumise à validation ;

13\. les statuts sont suivis ;

14\. le montant imputé ne peut pas dépasser les limites autorisées ;

15\. plusieurs imputations peuvent être associées à un fournisseur ;

16\. plusieurs maintenances peuvent être imputées ;

17\. une imputation peut être liée à une facture fournisseur ;

18\. le montant net à payer est calculé correctement ;

19\. l'imputation reste distincte du paiement ;

20\. le paiement peut être enregistré séparément ;

21\. une imputation peut être annulée selon les permissions ;

22\. les corrections sont historisées ;

23\. l'historique du fournisseur est alimenté ;

24\. l'historique du véhicule est alimenté ;

25\. les utilisateurs concernés peuvent être notifiés ;

26\. les permissions sont respectées ;

27\. les actions sensibles sont journalisées ;

28\. les opérations restent traçables de la maintenance jusqu'au paiement.



\---



\# 58. Principe directeur



L'imputation fournisseur constitue un mécanisme essentiel permettant à ADIKOM de gérer les coûts de maintenance des véhicules fournis par des partenaires.



La logique de référence est :



\*\*Véhicule fournisseur\*\*



↓



\*\*Panne / problème\*\*



↓



\*\*Maintenance\*\*



↓



\*\*Coût réel\*\*



↓



\*\*Détermination du montant imputable\*\*



↓



\*\*Validation\*\*



↓



\*\*Imputation fournisseur\*\*



↓



\*\*Réduction du montant dû\*\*



↓



\*\*Paiement du solde\*\*



Le principe fondamental est :



\*\*La maintenance constate et chiffre la dépense.\*\*



\*\*L'imputation détermine la part déduite du fournisseur.\*\*



\*\*Le paiement règle uniquement le montant restant dû.\*\*



Exemple de référence ADIKOM :



\*\*500 000 KMF dus\*\*



\*\*− 300 000 KMF imputés\*\*



\*\*= 200 000 KMF à payer\*\*



Cette séparation doit être strictement respectée dans ADIKOM PILOT afin de garantir une gestion financière claire, une traçabilité complète et une lecture fiable des relations entre ADIKOM et ses fournisseurs.

