\# ADIKOM PILOT

\## Workflow 08 — Paiement



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence fonctionnelle  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\# 1. Objet du workflow



Ce document décrit le processus de gestion des paiements dans ADIKOM PILOT.



Le paiement constitue l'étape financière qui permet d'enregistrer le règlement effectif d'une facture ou d'une dette.



Le système doit permettre de distinguer clairement :



\- la facture ;

\- le montant dû ;

\- les éventuelles imputations ;

\- le paiement ;

\- le montant déjà réglé ;

\- le solde restant ;

\- le compte bancaire ou la caisse utilisé(e) ;

\- le mode de paiement ;

\- la date ;

\- la référence du paiement ;

\- l'utilisateur ayant enregistré l'opération.



Le principe fondamental est :



\*\*Facture → Règlement → Solde → Statut\*\*



\---



\# 2. Principe général



Un paiement ne doit jamais être confondu avec une facture.



\### Facture



Elle représente :



\*\*Ce qui est dû.\*\*



\### Paiement



Il représente :



\*\*Ce qui a effectivement été réglé.\*\*



\### Solde



Il représente :



\*\*Ce qui reste à payer.\*\*



Exemple :



Facture :

450 000 KMF



Paiement :

200 000 KMF



Solde :

250 000 KMF



\---



\# 3. Types de paiements



ADIKOM PILOT doit distinguer au minimum :



\### Paiements clients



Argent reçu par ADIKOM d'un client.



\### Paiements fournisseurs



Argent versé par ADIKOM à un fournisseur.



Les deux doivent rester liés à leurs factures respectives.



\---



\# 4. Conditions préalables



Avant d'enregistrer un paiement, le système doit disposer de :



\- facture concernée ;

\- montant restant ;

\- date ;

\- montant du règlement ;

\- mode de paiement ;

\- compte bancaire ou caisse concerné ;

\- utilisateur autorisé.



Lorsque nécessaire, une référence ou un justificatif doit également être enregistré.



\---



\# 5. Paiement d'une facture client



Un paiement client doit être lié à une facture client.



Exemple :



Client :

Société ABC



Facture :

FAC-C-2026-0001



Montant :

450 000 KMF



Paiement :

200 000 KMF



Solde :

250 000 KMF



\---



\# 6. Paiement d'une facture fournisseur



Un paiement fournisseur doit être lié à une facture fournisseur.



Exemple :



Fournisseur :

Fournisseur A



Facture :

500 000 KMF



Imputation :

300 000 KMF



Net à payer :

200 000 KMF



Paiement :

200 000 KMF



Solde :

0 KMF



\---



\# 7. Imputation avant paiement



Dans le cas d'une facture fournisseur, le paiement doit tenir compte des imputations validées.



Exemple :



Montant brut :

500 000 KMF



Imputation maintenance :

300 000 KMF



Montant net :

200 000 KMF



Le paiement porte sur :



\*\*200 000 KMF\*\*



et non sur les 500 000 KMF initiaux.



\---



\# 8. Imputation et paiement restent distincts



Une imputation n'est pas un paiement.



Exemple :



Facture :

500 000 KMF



Imputation :

300 000 KMF



Paiement :

200 000 KMF



Le système doit conserver séparément :



\- montant facturé ;

\- montant imputé ;

\- montant payé ;

\- solde.



\---



\# 9. Référence du paiement



Chaque paiement doit disposer d'un identifiant unique.



Exemple :



\*\*PAY-2026-000001\*\*



Le format définitif sera défini lors de l'implémentation.



\---



\# 10. Informations d'un paiement



Une fiche de paiement doit pouvoir contenir :



\- référence du paiement ;

\- facture ;

\- client ou fournisseur ;

\- montant ;

\- date ;

\- mode de paiement ;

\- banque ou caisse ;

\- référence externe ;

\- justificatif ;

\- observations ;

\- utilisateur ;

\- date de création.



\---



\# 11. Date du paiement



La date réelle du règlement doit être enregistrée.



Elle ne doit pas être confondue avec la date de facture.



Exemple :



Facture :

23/08/2026



Paiement :

25/08/2026



Les deux dates doivent rester distinctes.



\---



\# 12. Modes de paiement



Le système doit permettre de définir les modes de paiement utilisés par ADIKOM.



Exemples :



\- espèces ;

\- virement bancaire ;

\- dépôt bancaire ;

\- chèque ;

\- autre mode validé.



La liste définitive doit être configurable selon les pratiques d'ADIKOM.



\---



\# 13. Banque ou caisse



Chaque paiement doit être associé au compte financier utilisé.



Exemple :



Paiement client :

200 000 KMF



Mode :

Virement



Compte :

Banque A



Le système doit pouvoir relier le paiement au compte correspondant dans :



\*\*Banques \& Caisses\*\*



\---



\# 14. Paiement en espèces



Lorsqu'un paiement est effectué en espèces :



\- la caisse concernée doit être sélectionnée ;

\- le montant doit être enregistré ;

\- le mouvement de caisse doit être créé ou associé ;

\- le solde de caisse doit être mis à jour selon les règles du module financier.



\---



\# 15. Paiement bancaire



Lorsqu'un paiement est effectué par banque :



\- le compte bancaire doit être sélectionné ;

\- le montant doit être enregistré ;

\- la référence bancaire peut être ajoutée ;

\- le mouvement bancaire doit être associé au paiement.



\---



\# 16. Référence externe



Pour un virement ou une autre opération disposant d'une référence externe, le système doit permettre de l'enregistrer.



Exemple :



Référence bancaire :

VIR-874521



Cette information facilite le rapprochement.



\---



\# 17. Justificatif



Un justificatif peut être associé au paiement.



Exemples :



\- reçu ;

\- bordereau ;

\- capture ;

\- preuve de virement ;

\- document bancaire ;

\- autre justificatif.



Le document doit rester accessible selon les permissions.



\---



\# 18. Paiement intégral



Exemple :



Facture :

450 000 KMF



Paiement :

450 000 KMF



Solde :

0 KMF



Résultat :



\*\*Facture payée\*\*



\---



\# 19. Paiement partiel



Exemple :



Facture :

450 000 KMF



Paiement :

200 000 KMF



Solde :

250 000 KMF



Résultat :



\*\*Facture partiellement payée\*\*



\---



\# 20. Plusieurs paiements



Une facture peut recevoir plusieurs règlements.



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



\# 21. Calcul automatique du solde



Le système doit calculer automatiquement :



\*\*Solde = Montant dû − Total des paiements validés\*\*



Exemple :



450 000 − 200 000 = 250 000 KMF



Le solde ne doit pas être saisi manuellement.



\---



\# 22. Paiement supérieur au solde



Le système doit empêcher ou contrôler un paiement supérieur au montant restant dû.



Exemple :



Solde :

100 000 KMF



Paiement :

150 000 KMF



Le système doit signaler l'anomalie.



Il ne doit pas créer automatiquement un solde négatif sans règle métier explicitement définie.



\---



\# 23. Paiement sur facture déjà payée



Une facture dont le solde est nul ne doit normalement plus accepter de nouveau paiement.



Exemple :



Facture :

450 000 KMF



Total payé :

450 000 KMF



Solde :

0 KMF



Nouveau paiement :

50 000 KMF



Le système doit bloquer ou demander une procédure spécifique.



\---



\# 24. Statuts de paiement



Les statuts recommandés sont :



\- Brouillon ;

\- En attente ;

\- Validé ;

\- Annulé.



Le statut définitif dépendra des règles d'implémentation.



\---



\# 25. Paiement en brouillon



Un paiement en brouillon est en cours de préparation.



Il ne doit pas encore modifier définitivement le solde de la facture.



\---



\# 26. Paiement en attente



Un paiement peut être placé en attente lorsque sa validation est nécessaire.



Exemples :



\- justificatif manquant ;

\- contrôle nécessaire ;

\- rapprochement bancaire en attente.



\---



\# 27. Paiement validé



Un paiement validé est pris en compte dans le calcul du solde.



Exemple :



Facture :

450 000 KMF



Paiement validé :

200 000 KMF



Solde :

250 000 KMF



\---



\# 28. Paiement annulé



Un paiement peut être annulé lorsque cela est justifié.



L'annulation doit être historisée.



Un paiement annulé ne doit plus être comptabilisé dans le total des paiements valides.



\---



\# 29. Annulation d'un paiement



Exemple :



Facture :

450 000 KMF



Paiement :

200 000 KMF



Solde :

250 000 KMF



Le paiement est annulé.



Nouveau solde :



\*\*450 000 KMF\*\*



L'historique doit conserver :



Paiement initial :

200 000 KMF



Annulation :

200 000 KMF



\---



\# 30. Correction d'un paiement



Une erreur de saisie doit être corrigée selon une procédure contrôlée.



Exemple :



Montant enregistré :

250 000 KMF



Montant correct :

200 000 KMF



Le système doit conserver l'historique de la correction lorsque nécessaire.



\---



\# 31. Suppression d'un paiement



Un paiement ayant une valeur financière ne doit pas être supprimé physiquement sans procédure appropriée.



Il faut privilégier :



\- annulation ;

\- contrepassation ;

\- correction contrôlée.



\---



\# 32. Paiement et facture client



La relation doit être :



\*\*Client → Facture → Paiement\*\*



La fiche client doit permettre de retrouver ses règlements.



\---



\# 33. Paiement et facture fournisseur



La relation doit être :



\*\*Fournisseur → Facture → Imputation → Paiement\*\*



Le paiement doit tenir compte du montant net réellement dû après imputation.



\---



\# 34. Paiement fournisseur après maintenance



Exemple :



Fournisseur A



Facture :

500 000 KMF



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



\---



\# 35. Paiement fournisseur partiel après imputation



Exemple :



Facture :

500 000 KMF



Imputation :

300 000 KMF



Net :

200 000 KMF



Paiement :

100 000 KMF



Solde :

100 000 KMF



Statut :

\*\*Partiellement payé\*\*



\---



\# 36. Plusieurs paiements fournisseur



Exemple :



Net à payer :

200 000 KMF



Paiement 1 :

100 000 KMF



Paiement 2 :

100 000 KMF



Solde :

0 KMF



Facture :

\*\*Payée\*\*



\---



\# 37. Paiement client avec plusieurs factures



Lorsqu'un client règle plusieurs factures en une seule opération, le système doit pouvoir permettre une répartition du paiement lorsque cette fonctionnalité est retenue.



Exemple :



Paiement reçu :

500 000 KMF



Facture 1 :

300 000 KMF



Facture 2 :

200 000 KMF



Répartition :



300 000 + 200 000 = 500 000 KMF



Chaque facture doit recevoir la part correspondante.



\---



\# 38. Paiement non affecté



Lorsqu'un paiement est reçu mais ne peut pas encore être associé à une facture précise, il peut être enregistré comme paiement à affecter selon les règles d'ADIKOM.



Exemple :



Virement reçu :

300 000 KMF



Client :

Société ABC



Facture :

Non identifiée



Le montant doit être conservé comme :



\*\*Paiement non affecté\*\*



jusqu'à son rapprochement.



Cette fonctionnalité doit être contrôlée afin d'éviter les erreurs.



\---



\# 39. Affectation ultérieure



Une fois la facture identifiée :



Paiement non affecté :

300 000 KMF



Facture :

FAC-C-2026-0010



Affectation :

300 000 KMF



Le système doit conserver l'historique de l'affectation.



\---



\# 40. Paiement supérieur à une facture



Si un client verse un montant supérieur à une facture, le système doit appliquer une règle définie par ADIKOM.



Exemple :



Facture :

300 000 KMF



Paiement :

500 000 KMF



Différence :

200 000 KMF



Cette différence peut éventuellement être :



\- affectée à une autre facture ;

\- conservée comme avance ;

\- traitée selon une autre règle validée.



Le système ne doit pas décider automatiquement sans règle métier.



\---



\# 41. Avance client



ADIKOM peut éventuellement recevoir un paiement avant l'émission d'une facture.



Exemple :



Client :

Société ABC



Avance :

200 000 KMF



Le système peut enregistrer cette somme comme avance lorsque cette fonctionnalité est retenue.



L'avance doit rester distincte d'une facture jusqu'à son affectation.



\---



\# 42. Affectation d'une avance



Lorsqu'une facture est créée :



Facture :

450 000 KMF



Avance :

200 000 KMF



Reste :

250 000 KMF



Le système doit pouvoir rattacher l'avance à la facture selon les règles définies.



\---



\# 43. Rapprochement bancaire



Les paiements bancaires doivent pouvoir être rapprochés des mouvements bancaires.



Exemple :



Paiement :

200 000 KMF



Référence :

VIR-874521



Mouvement bancaire :

+200 000 KMF



Le rapprochement permet de confirmer que le paiement correspond réellement au mouvement financier.



\---



\# 44. Rapprochement de caisse



Même principe pour les paiements en espèces.



Exemple :



Paiement client :

100 000 KMF



Caisse :

Caisse principale



Le mouvement de caisse doit correspondre au règlement enregistré.



\---



\# 45. Cohérence financière



Le système doit éviter les situations où :



\- un paiement existe sans compte financier associé lorsque celui-ci est obligatoire ;

\- un paiement validé n'affecte pas le solde ;

\- un paiement annulé continue d'être comptabilisé ;

\- une facture payée affiche encore un solde ;

\- un mouvement bancaire existe sans justification lorsque celle-ci est requise.



\---



\# 46. Paiement et Banques \& Caisses



Le module \*\*Banques \& Caisses\*\* doit centraliser les comptes financiers.



Le paiement utilise l'un de ces comptes.



Exemple :



\### Banque



Compte bancaire ADIKOM



\### Caisse



Caisse principale



Le paiement doit pouvoir être relié au compte concerné.



\---



\# 47. Impact sur le solde bancaire ou de caisse



Lorsqu'un paiement client est encaissé :



\*\*Banque/Caisse augmente\*\*



Lorsqu'un paiement fournisseur est effectué :



\*\*Banque/Caisse diminue\*\*



Le mouvement financier doit être cohérent avec le sens du paiement.



\---



\# 48. Paiement client — exemple bancaire



Facture client :

450 000 KMF



Paiement :

200 000 KMF



Compte :

Banque A



Impact :



\*\*+200 000 KMF\*\*



Solde facture :

250 000 KMF



\---



\# 49. Paiement fournisseur — exemple bancaire



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



Impact :



\*\*−200 000 KMF\*\*



Solde fournisseur :

0 KMF



\---



\# 50. Notifications de paiement



Le Centre de notifications peut signaler :



\- paiement reçu ;

\- paiement validé ;

\- paiement en attente ;

\- paiement annulé ;

\- facture entièrement réglée ;

\- facture toujours partiellement payée ;

\- paiement fournisseur à effectuer ;

\- échéance dépassée.



\---



\# 51. Historique des paiements



Chaque client doit pouvoir disposer d'un historique de ses paiements.



Exemple :



\*\*Société ABC\*\*



\- 20/08 — 200 000 KMF

\- 25/08 — 250 000 KMF

\- 30/08 — 150 000 KMF



\---



\# 52. Historique fournisseur



Chaque fournisseur doit pouvoir disposer d'un historique des règlements.



Exemple :



\*\*Fournisseur A\*\*



Facture :

500 000 KMF



Imputation :

300 000 KMF



Paiement :

200 000 KMF



Solde :

0 KMF



\---



\# 53. Statistiques de paiement



Le système peut produire :



\- total encaissé ;

\- total payé aux fournisseurs ;

\- paiements clients ;

\- paiements fournisseurs ;

\- paiements par période ;

\- paiements par mode ;

\- paiements par banque ;

\- paiements par caisse ;

\- paiements en attente ;

\- paiements annulés.



\---



\# 54. Rapports



Les rapports peuvent permettre de consulter :



\- règlements clients ;

\- règlements fournisseurs ;

\- encaissements ;

\- décaissements ;

\- paiements par compte ;

\- paiements par période ;

\- paiements non affectés ;

\- avances ;

\- soldes.



\---



\# 55. Sécurité et permissions



Les opérations de paiement doivent être strictement contrôlées.



Selon les permissions, un utilisateur peut avoir le droit de :



\- consulter ;

\- créer ;

\- valider ;

\- annuler ;

\- corriger ;

\- rapprocher.



Les permissions doivent être contrôlées côté serveur.



\---



\# 56. Séparation des responsabilités



ADIKOM peut décider de séparer :



\*\*Saisie du paiement\*\*



et



\*\*Validation du paiement\*\*



Exemple :



Utilisateur A :

enregistre



Utilisateur B :

valide



Cette séparation est particulièrement importante pour les opérations financières sensibles.



\---



\# 57. Traçabilité



Chaque paiement doit conserver :



\- utilisateur créateur ;

\- date ;

\- heure ;

\- utilisateur validateur ;

\- date de validation ;

\- compte utilisé ;

\- montant ;

\- facture ;

\- référence ;

\- historique des corrections.



\---



\# 58. Journal d'activité



Exemple :



\*\*10:00\*\*

Utilisateur A crée PAY-2026-0010.



\*\*10:05\*\*

Utilisateur B valide le paiement.



\*\*10:06\*\*

Le solde de la facture est recalculé.



\*\*10:07\*\*

Le mouvement bancaire est enregistré.



Chaque étape doit être traçable.



\---



\# 59. Annulation après rapprochement



Si un paiement déjà rapproché doit être annulé, l'opération doit être contrôlée.



Le système doit éviter de supprimer simplement le paiement.



Il doit gérer une opération d'annulation ou de contrepassation cohérente avec le mouvement financier.



\---



\# 60. Paiement et audit



L'historique doit permettre de répondre à :



\- Qui a enregistré le paiement ?

\- Quand ?

\- Pour quelle facture ?

\- Quel montant ?

\- Quel mode ?

\- Quel compte ?

\- Quelle référence ?

\- Quel justificatif ?

\- Qui a validé ?

\- Le paiement a-t-il été rapproché ?

\- Le paiement a-t-il été annulé ?



\---



\# 61. Exemple complet — Client



\## Facture



Client :

Société ABC



Montant :

450 000 KMF



\---



\## Paiement 1



Montant :

200 000 KMF



Mode :

Virement



Compte :

Banque A



Solde :

250 000 KMF



Statut :

Partiellement payé



\---



\## Paiement 2



Montant :

250 000 KMF



Mode :

Virement



Compte :

Banque A



Solde :

0 KMF



Statut :

Payé



\---



\# 62. Exemple complet — Fournisseur avec imputation



\## Facture



Fournisseur :

Fournisseur A



Montant brut :

500 000 KMF



\---



\## Maintenance



Toyota T5



Coût :

300 000 KMF



\---



\## Imputation



Montant :

300 000 KMF



\---



\## Net



500 000 − 300 000 = 200 000 KMF



\---



\## Paiement



Montant :

200 000 KMF



Mode :

Virement



Compte :

Banque A



\---



\## Résultat



Montant brut :

500 000 KMF



Imputation :

300 000 KMF



Paiement :

200 000 KMF



Solde :

0 KMF



\---



\# 63. Exemple — Paiement fournisseur partiel



Facture :

500 000 KMF



Imputation :

300 000 KMF



Net :

200 000 KMF



Paiement :

100 000 KMF



Solde :

100 000 KMF



Statut :



\*\*Partiellement payé\*\*



\---



\# 64. Exemple — Paiement non affecté



Virement reçu :

300 000 KMF



Client :

Société ABC



Facture :

non identifiée



Le système enregistre :



\*\*Paiement non affecté : 300 000 KMF\*\*



Une fois la facture retrouvée, le paiement peut être affecté.



\---



\# 65. Exemple — Avance



Client :

Société ABC



Avance :

200 000 KMF



Nouvelle facture :

450 000 KMF



Avance affectée :

200 000 KMF



Solde :

250 000 KMF



\---



\# 66. Critères d'acceptation du workflow



Le workflow de paiement sera considéré comme correctement implémenté lorsque :



1\. un paiement client peut être enregistré ;

2\. un paiement fournisseur peut être enregistré ;

3\. chaque paiement peut être lié à une facture ;

4\. un paiement possède une référence unique ;

5\. la date peut être enregistrée ;

6\. le montant est obligatoire ;

7\. le mode de paiement peut être sélectionné ;

8\. un compte bancaire ou une caisse peut être associé ;

9\. une référence externe peut être enregistrée ;

10\. un justificatif peut être associé ;

11\. un paiement intégral est possible ;

12\. un paiement partiel est possible ;

13\. plusieurs paiements peuvent être associés à une facture ;

14\. le solde est calculé automatiquement ;

15\. les paiements supérieurs au solde sont contrôlés ;

16\. une facture payée ne peut pas recevoir un paiement incohérent ;

17\. les paiements peuvent être annulés selon les permissions ;

18\. les corrections sont contrôlées ;

19\. les paiements fournisseur tiennent compte des imputations validées ;

20\. les paiements restent distincts des imputations ;

21\. les paiements peuvent être liés aux comptes bancaires et caisses ;

22\. les mouvements financiers restent cohérents ;

23\. les paiements non affectés peuvent être gérés lorsque nécessaire ;

24\. les avances peuvent être gérées lorsque cette fonctionnalité est activée ;

25\. les paiements peuvent être rapprochés ;

26\. les notifications peuvent être générées ;

27\. les statistiques peuvent être calculées ;

28\. les rapports peuvent être générés ;

29\. les permissions sont respectées ;

30\. les actions sensibles sont historisées ;

31\. les données restent cohérentes entre Facturation \& Paiement et Banques \& Caisses.



\---



\# 67. Principe directeur



Le paiement doit toujours représenter un mouvement financier réel et traçable.



La chaîne de référence est :



\*\*Facture\*\*



↓



\*\*Montant dû\*\*



↓



\*\*Paiement\*\*



↓



\*\*Compte bancaire ou caisse\*\*



↓



\*\*Solde\*\*



↓



\*\*Statut\*\*



Pour un fournisseur :



\*\*Facture brute\*\*



↓



\*\*Imputation éventuelle\*\*



↓



\*\*Net à payer\*\*



↓



\*\*Paiement\*\*



↓



\*\*Banque/Caisse\*\*



↓



\*\*Solde\*\*



Le principe fondamental est :



\*\*Une facture indique ce qui est dû.\*\*



\*\*Une imputation réduit ce qui est dû.\*\*



\*\*Un paiement indique ce qui a réellement été réglé.\*\*



\*\*Le solde représente ce qui reste à régler.\*\*



ADIKOM PILOT doit préserver cette séparation afin de garantir une gestion financière fiable, compréhensible et entièrement traçable.

