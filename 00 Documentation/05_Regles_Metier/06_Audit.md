\# ADIKOM PILOT

\## Règles métier 06 — Audit et traçabilité



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence métier  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\# 1. Objet



Ce document définit les règles métier relatives à l'audit, à la traçabilité et à l'historisation des opérations réalisées dans ADIKOM PILOT.



L'objectif est de permettre à ADIKOM de comprendre, après chaque opération importante :



\- qui a effectué l'action ;

\- quelle action a été effectuée ;

\- sur quelle donnée ;

\- quand l'action a été effectuée ;

\- quelle était la situation avant l'action lorsque nécessaire ;

\- quelle est la situation après l'action lorsque nécessaire ;

\- pourquoi l'action a été effectuée lorsque le contexte l'exige.



L'audit constitue un mécanisme essentiel de contrôle interne, de sécurité et de fiabilité des données.



\---



\# 2. Principe général



Toute opération importante ayant une incidence sur les données métier, financières, administratives ou les permissions doit pouvoir être retracée.



Le principe est :



\*\*Utilisateur → Action → Donnée concernée → Date/Heure → Résultat\*\*



Exemple :



\*\*Utilisateur A\*\*



→ Modification d'une facture



→ FAC-C-2026-0015



→ 20/08/2026 à 14:32



→ Montant modifié



\---



\# 3. Objectifs de l'audit



L'audit doit permettre à ADIKOM de :



\- comprendre les modifications effectuées ;

\- détecter les erreurs ;

\- identifier les responsables d'une action ;

\- vérifier les opérations sensibles ;

\- contrôler les opérations financières ;

\- suivre les changements de permissions ;

\- reconstituer l'historique d'une opération ;

\- faciliter les contrôles internes ;

\- renforcer la sécurité du système.



\---



\# 4. Événements à tracer



Les événements importants pouvant nécessiter une journalisation comprennent notamment :



\- connexion ;

\- déconnexion ;

\- création ;

\- modification ;

\- validation ;

\- annulation ;

\- archivage ;

\- suppression logique ;

\- paiement ;

\- imputation ;

\- changement de permission ;

\- changement de statut ;

\- changement de fournisseur ;

\- changement de tarif ;

\- opération bancaire ;

\- opération de caisse.



La liste peut évoluer avec les besoins d'ADIKOM.



\---



\# 5. Utilisateur responsable



Toute action authentifiée doit pouvoir être associée à l'utilisateur qui l'a effectuée.



Exemple :



\*\*Utilisateur : Mohamed\*\*



\*\*Action : Création d'une location\*\*



\*\*Référence : LOC-2026-000015\*\*



\---



\# 6. Date et heure



L'événement doit conserver sa date et son heure.



Exemple :



\*\*20/08/2026 — 14:32\*\*



Ces informations permettent de reconstituer l'ordre chronologique des opérations.



\---



\# 7. Référence de l'objet



L'événement d'audit doit pouvoir identifier l'objet concerné.



Exemples :



\- utilisateur ;

\- client ;

\- fournisseur ;

\- véhicule ;

\- location ;

\- facture ;

\- paiement ;

\- maintenance ;

\- imputation ;

\- compte bancaire ;

\- caisse.



\---



\# 8. Type d'action



L'audit doit pouvoir distinguer les différentes actions.



Exemples :



\- CREATE ;

\- UPDATE ;

\- VALIDATE ;

\- CANCEL ;

\- ARCHIVE ;

\- DELETE ;

\- LOGIN ;

\- LOGOUT ;

\- PAYMENT ;

\- TRANSFER ;

\- PERMISSION\_CHANGE.



Les libellés techniques définitifs seront définis lors de l'implémentation.



\---



\# 9. Ancienne valeur



Lorsqu'une modification importante intervient, le système doit pouvoir conserver la valeur précédente lorsque cela est nécessaire à la traçabilité.



Exemple :



Tarif avant :

500 000 KMF



Tarif après :

450 000 KMF



L'audit doit pouvoir indiquer :



\*\*500 000 → 450 000 KMF\*\*



\---



\# 10. Nouvelle valeur



Lorsqu'une donnée est modifiée, la nouvelle valeur doit pouvoir être identifiée lorsque cela est nécessaire.



Exemple :



Statut avant :

Disponible



Statut après :

En maintenance



\---



\# 11. Motif



Certaines opérations peuvent nécessiter un motif.



Exemples :



\- annulation ;

\- immobilisation ;

\- retrait du véhicule ;

\- désactivation d'un utilisateur ;

\- changement de fournisseur ;

\- correction financière ;

\- annulation d'un paiement.



Le système doit pouvoir demander un motif lorsque la règle métier l'exige.



\---



\# 12. Commentaire



Certaines actions peuvent nécessiter une observation complémentaire.



Exemple :



\*\*Annulation de location\*\*



Motif :

Client indisponible



Observation :

Nouvelle réservation prévue la semaine suivante.



\---



\# 13. Historique d'une location



Une location doit pouvoir être reconstituée dans le temps.



Exemple :



10:00 — Création



10:15 — Confirmation



12:00 — Départ



13:00 — Prolongation



18:00 — Retour



18:30 — Incident enregistré



19:00 — Maintenance créée



L'ensemble des événements importants doit rester identifiable.



\---



\# 14. Historique d'un véhicule



La fiche véhicule doit permettre de retrouver les événements importants.



Exemple :



01/01 :

Entrée dans le parc



05/01 :

Première location



10/01 :

Retour



15/02 :

Maintenance



20/02 :

Nouvelle location



01/03 :

Changement de fournisseur



\---



\# 15. Historique d'un client



La fiche client doit pouvoir permettre de retrouver les événements importants.



Exemples :



\- création ;

\- modification ;

\- tarif préférentiel ;

\- locations ;

\- factures ;

\- paiements ;

\- changements importants.



\---



\# 16. Historique d'un fournisseur



La fiche fournisseur doit pouvoir permettre de retrouver :



\- création ;

\- modification ;

\- véhicules associés ;

\- factures ;

\- paiements ;

\- maintenances liées ;

\- imputations ;

\- changements de statut ;

\- changements importants.



\---



\# 17. Historique d'une facture



Une facture doit conserver son cycle de vie.



Exemple :



\*\*Création\*\*



↓



\*\*Modification\*\*



↓



\*\*Émission\*\*



↓



\*\*Paiement partiel\*\*



↓



\*\*Paiement\*\*



↓



\*\*Payée\*\*



\---



\# 18. Historique d'un paiement



Un paiement doit pouvoir être retracé.



Exemple :



Création :

20/08 à 10:00



Validation :

20/08 à 10:15



Rapprochement :

21/08 à 09:30



\---



\# 19. Historique d'une imputation



Une imputation fournisseur doit pouvoir être retracée.



Exemple :



Maintenance :

MNT-2026-0010



Coût :

300 000 KMF



Imputation créée :

300 000 KMF



Créateur :

Utilisateur A



Validation :

Utilisateur B



Date :

20/08/2026



\---



\# 20. Historique d'un compte bancaire



Les opérations importantes d'un compte bancaire doivent pouvoir être retrouvées.



Exemples :



\- création du compte ;

\- modification ;

\- encaissement ;

\- paiement ;

\- virement ;

\- rapprochement ;

\- correction.



\---



\# 21. Historique d'une caisse



Les mouvements importants de caisse doivent également être traçables.



Exemples :



\- entrée ;

\- sortie ;

\- correction ;

\- clôture ;

\- rapprochement.



\---



\# 22. Historique des utilisateurs



Le système doit conserver les événements importants concernant les utilisateurs.



Exemples :



\- création ;

\- activation ;

\- désactivation ;

\- réactivation ;

\- changement de groupe ;

\- changement de fonction ;

\- changement de permissions.



\---



\# 23. Historique des permissions



Les changements de permissions constituent des événements sensibles.



Le système doit pouvoir enregistrer :



\- utilisateur concerné ;

\- permission ajoutée ;

\- permission retirée ;

\- groupe concerné ;

\- administrateur ayant effectué l'action ;

\- date ;

\- heure.



\---



\# 24. Exemple de changement de permission



Avant :



Utilisateur A



Permission :

Voir les factures



Après :



Utilisateur A



Permissions :

Voir les factures

Créer les factures

Modifier les factures



L'audit doit permettre d'identifier l'ajout des nouvelles permissions.



\---



\# 25. Connexion



Le système peut journaliser les connexions importantes.



Exemple :



Utilisateur :

A



Connexion :

20/08/2026 — 08:15



Résultat :

Réussie



\---



\# 26. Échec de connexion



Les tentatives de connexion échouées peuvent être journalisées afin de renforcer la sécurité.



Exemple :



Utilisateur :

A



Tentative :

20/08/2026 — 08:16



Résultat :

Échec



\---



\# 27. Déconnexion



La déconnexion peut également être enregistrée lorsque cette information est utile au suivi de sécurité.



\---



\# 28. Actions sensibles



Les actions suivantes doivent faire l'objet d'une attention particulière :



\- création d'utilisateur ;

\- modification de permissions ;

\- désactivation d'utilisateur ;

\- modification de tarif préférentiel ;

\- modification de coordonnées bancaires ;

\- validation d'une facture ;

\- validation d'un paiement ;

\- création d'une imputation ;

\- validation d'une imputation ;

\- annulation d'une opération financière ;

\- virement interne ;

\- modification d'un compte bancaire.



\---



\# 29. Audit des tarifs préférentiels



La modification d'un tarif préférentiel client doit être traçable.



Exemple :



Client :

Société ABC



Ancien tarif :

450 000 KMF



Nouveau tarif :

425 000 KMF



Utilisateur :

Responsable commercial



Date :

20/08/2026



\---



\# 30. Audit des coordonnées bancaires



Toute modification importante des coordonnées bancaires d'un fournisseur doit pouvoir être historisée.



Exemple :



Ancien compte :

Compte A



Nouveau compte :

Compte B



Utilisateur :

Utilisateur autorisé



Date :

20/08/2026



\---



\# 31. Audit des factures



Les événements importants d'une facture doivent être conservés.



Exemples :



\- création ;

\- modification ;

\- émission ;

\- avoir ;

\- annulation ;

\- règlement ;

\- correction.



\---



\# 32. Audit des paiements



Les événements importants d'un paiement doivent être conservés.



Exemples :



\- création ;

\- validation ;

\- rapprochement ;

\- annulation ;

\- correction.



\---



\# 33. Audit des maintenances



Les maintenances doivent pouvoir être retracées.



Exemple :



Création :

Panne Toyota T5



Coût :

300 000 KMF



Validation :

Utilisateur A



Imputation :

300 000 KMF



Clôture :

Utilisateur B



\---



\# 34. Audit des changements de statut



Les changements importants de statut doivent être traçables.



Exemple :



Toyota T5



Avant :

Disponible



Après :

En location



Puis :



Avant :

En location



Après :

En maintenance



Puis :



Avant :

En maintenance



Après :

Disponible



\---



\# 35. Audit des changements de fournisseur



Lorsqu'un véhicule change de fournisseur :



Avant :

Fournisseur A



Après :

Fournisseur B



Le système doit conserver :



\- ancien fournisseur ;

\- nouveau fournisseur ;

\- utilisateur ;

\- date ;

\- motif lorsque nécessaire.



\---



\# 36. Audit des annulations



Une annulation ne doit pas simplement faire disparaître une opération.



L'audit doit permettre de savoir :



\- quelle opération a été annulée ;

\- qui l'a annulée ;

\- quand ;

\- pourquoi lorsque nécessaire.



\---



\# 37. Audit des corrections



Une correction importante doit conserver la trace du changement.



Exemple :



Montant initial :

500 000 KMF



Montant corrigé :

450 000 KMF



Motif :

Erreur de saisie



Utilisateur :

Utilisateur A



\---



\# 38. Suppression logique



Lorsqu'une donnée doit être retirée de l'utilisation courante mais conserver son historique, le système doit privilégier une suppression logique ou un archivage.



Exemples :



\- utilisateur ;

\- fournisseur ;

\- véhicule ;

\- client ;

\- groupe.



\---



\# 39. Suppression physique



La suppression physique d'une donnée ayant une valeur historique ou financière doit être fortement limitée.



Elle ne doit pas être utilisée comme moyen normal de correction.



\---



\# 40. Protection du journal d'audit



Les utilisateurs ordinaires ne doivent pas pouvoir modifier ou supprimer librement les journaux d'audit.



Le journal doit être protégé contre :



\- modification ;

\- suppression ;

\- falsification.



L'accès doit être réservé aux utilisateurs autorisés.



\---



\# 41. Accès au journal d'audit



Le Super Admin doit pouvoir consulter le journal d'audit.



Selon les permissions définies par ADIKOM, certains responsables peuvent également disposer d'un accès limité.



\---



\# 42. Recherche dans l'audit



Le journal doit pouvoir être recherché et filtré.



Filtres possibles :



\- utilisateur ;

\- action ;

\- module ;

\- date ;

\- objet ;

\- référence ;

\- résultat.



\---



\# 43. Filtre par utilisateur



Exemple :



\*\*Utilisateur : A\*\*



Le système affiche les actions réalisées par cet utilisateur.



\---



\# 44. Filtre par module



Exemple :



\*\*Module : Facturation \& Paiement\*\*



Le système affiche les événements financiers correspondants.



\---



\# 45. Filtre par période



Le journal doit pouvoir être filtré par :



\- aujourd'hui ;

\- semaine ;

\- mois ;

\- période personnalisée.



\---



\# 46. Filtre par action



Le système peut permettre de rechercher :



\- créations ;

\- modifications ;

\- validations ;

\- annulations ;

\- paiements ;

\- virements ;

\- changements de permissions.



\---



\# 47. Filtre par objet



Exemple :



\*\*Objet : Toyota T5\*\*



Le système peut afficher les événements importants liés à ce véhicule.



\---



\# 48. Filtre par référence



Exemple :



\*\*Référence : FAC-C-2026-00015\*\*



Le système doit pouvoir retrouver les événements liés à cette facture.



\---



\# 49. Journal d'audit et notifications



Certains événements d'audit peuvent également déclencher des notifications.



Exemple :



Modification d'une permission sensible.



Le Super Admin peut recevoir une notification.



Les règles exactes de notification seront définies selon les besoins d'ADIKOM.



\---



\# 50. Audit et sécurité



Le journal d'audit contribue à détecter :



\- actions inhabituelles ;

\- modifications non autorisées ;

\- changements sensibles ;

\- tentatives répétées ;

\- erreurs ;

\- comportements anormaux.



Il constitue un outil de contrôle et non un mécanisme de permission.



\---



\# 51. Audit et permissions



Le système de permissions détermine :



\*\*Ce que l'utilisateur peut faire.\*\*



L'audit détermine :



\*\*Ce que l'utilisateur a fait.\*\*



Ces deux mécanismes doivent rester distincts mais complémentaires.



\---



\# 52. Audit et données financières



Les opérations financières doivent disposer d'une traçabilité renforcée.



Cela concerne notamment :



\- factures ;

\- paiements ;

\- imputations ;

\- virements ;

\- comptes ;

\- caisses ;

\- corrections.



\---



\# 53. Audit et séparation des responsabilités



L'audit doit permettre de vérifier une séparation des responsabilités.



Exemple :



Utilisateur A :

création d'une facture



Utilisateur B :

validation



Utilisateur C :

paiement



Le système doit permettre de retrouver ces trois actions séparément.



\---



\# 54. Audit d'une facture complète



Exemple :



\*\*FAC-C-2026-0010\*\*



10:00 :

Créée par Utilisateur A



10:15 :

Modifiée par Utilisateur A



10:30 :

Validée par Utilisateur B



15:00 :

Paiement de 200 000 KMF enregistré par Utilisateur C



16:00 :

Paiement de 250 000 KMF enregistré par Utilisateur C



16:05 :

Facture marquée comme payée



La chronologie doit rester accessible.



\---



\# 55. Audit d'une location complète



Exemple :



\*\*LOC-2026-0010\*\*



09:00 :

Créée



09:15 :

Confirmée



10:00 :

Départ enregistré



18:00 :

Retour enregistré



18:10 :

Incident créé



18:30 :

Maintenance créée



19:00 :

Facture générée



La chaîne doit rester reconstituable.



\---



\# 56. Audit d'une maintenance fournisseur



Exemple :



Toyota T5



Maintenance :

300 000 KMF



Création :

Utilisateur A



Validation :

Utilisateur B



Imputation :

300 000 KMF



Validation de l'imputation :

Utilisateur C



Facture fournisseur :

500 000 KMF



Paiement :

200 000 KMF



L'ensemble de la chaîne doit pouvoir être retracé.



\---



\# 57. Audit d'un changement de permissions



Exemple :



Utilisateur :

A



Avant :

Voir les clients



Action :

Ajout de « Modifier les clients »



Après :

Voir + Modifier les clients



Administrateur :

Super Admin



Date :

20/08/2026



Cette modification doit être identifiable dans l'historique.



\---



\# 58. Audit du cycle de vie d'un utilisateur



Exemple :



Création



↓



Activation



↓



Ajout au groupe Commercial



↓



Ajout d'une permission



↓



Modification du groupe



↓



Suspension



↓



Réactivation



↓



Désactivation



Chaque étape importante doit pouvoir être retrouvée.



\---



\# 59. Audit et intégrité des données



Le journal d'audit ne doit pas devenir une source de données contradictoire.



Il doit refléter les actions réellement effectuées.



Une opération échouée ne doit pas être présentée comme une opération réussie.



\---



\# 60. Résultat de l'action



Lorsque cela est pertinent, l'audit peut distinguer :



\- réussite ;

\- échec ;

\- refus.



Exemple :



Utilisateur A



Action :

Annuler facture



Résultat :

Refusé — permission insuffisante



\---



\# 61. Tentative d'action non autorisée



Une tentative d'accès à une fonction protégée peut être journalisée lorsqu'elle est pertinente pour la sécurité.



Exemple :



Utilisateur :

A



Action :

Validation paiement



Résultat :

Refusé



\---



\# 62. Audit et confidentialité



Le journal d'audit peut contenir des informations sensibles.



Son accès doit donc être contrôlé.



Les utilisateurs ne doivent pas pouvoir consulter librement les informations d'audit qui dépassent leurs responsabilités.



\---



\# 63. Conservation de l'historique



Les règles de conservation des journaux devront être définies selon les besoins d'ADIKOM et les contraintes applicables.



Le système doit toutefois être conçu pour éviter de perdre prématurément les informations nécessaires à la traçabilité.



\---



\# 64. Export de l'audit



L'export du journal d'audit doit être réservé aux utilisateurs autorisés.



Cette permission doit être distincte de la simple consultation.



\---



\# 65. Impression de l'audit



L'impression d'un journal d'audit peut être contrôlée par permission.



Elle doit notamment respecter les restrictions d'accès aux données sensibles.



\---



\# 66. Audit et administration



Le Super Admin doit pouvoir utiliser l'audit pour contrôler :



\- les utilisateurs ;

\- les groupes ;

\- les permissions ;

\- les paramètres sensibles ;

\- les opérations importantes.



\---



\# 67. Audit et direction



La direction doit pouvoir utiliser les données d'audit pour vérifier certaines opérations importantes sans nécessairement avoir accès à toutes les fonctions administratives du système.



Les permissions détermineront cet accès.



\---



\# 68. Audit et erreur humaine



L'audit ne doit pas avoir pour seul objectif de sanctionner les erreurs.



Il doit également permettre de :



\- retrouver une erreur ;

\- comprendre son origine ;

\- la corriger ;

\- éviter sa répétition ;

\- améliorer les procédures.



\---



\# 69. Audit et contrôle interne



L'audit permet à ADIKOM de vérifier que les processus sont réellement suivis.



Exemple :



\*\*Création → Validation → Paiement\*\*



Le système peut permettre de vérifier que chaque étape a été réalisée par les personnes autorisées.



\---



\# 70. Audit et non-rétroactivité



L'historique doit rester cohérent même lorsque les données actuelles évoluent.



Exemple :



Un véhicule change de fournisseur.



Les anciennes opérations doivent continuer à conserver leur contexte historique lorsque celui-ci est pertinent.



\---



\# 71. Audit et archivage



Lorsqu'une donnée est archivée, son historique doit rester accessible selon les permissions.



Exemple :



Véhicule retiré du parc.



Le véhicule n'est plus disponible pour une nouvelle location, mais son historique reste consultable.



\---



\# 72. Audit et suppression logique



Lorsqu'une donnée est désactivée plutôt que supprimée, l'événement de désactivation doit être historisé.



Exemple :



Fournisseur A



Statut :

Actif



→ Désactivation



Statut :

Inactif



Utilisateur :

Super Admin



\---



\# 73. Journal centralisé



ADIKOM PILOT doit disposer d'un mécanisme central permettant de retrouver les événements importants provenant des différents modules.



Le journal doit pouvoir regrouper les événements issus notamment de :



\- Utilisateurs \& Groupes ;

\- Tiers ;

\- Gestion de Location ;

\- Parc Automobile ;

\- Maintenance ;

\- Facturation \& Paiement ;

\- Banques \& Caisses ;

\- Paramètres.



\---



\# 74. Cohérence intermodules



L'audit doit permettre de suivre les relations entre modules.



Exemple :



\*\*Location\*\*



→ Incident



→ Maintenance



→ Imputation



→ Facture fournisseur



→ Paiement



La traçabilité doit permettre de relier ces événements.



\---



\# 75. Exemple de traçabilité complète



\## Client



Société ABC



↓



\## Location



LOC-2026-0010



↓



\## Véhicule



Toyota T5



↓



\## Retour



Incident constaté



↓



\## Maintenance



300 000 KMF



↓



\## Imputation fournisseur



300 000 KMF



↓



\## Facture fournisseur



500 000 KMF



↓



\## Paiement



200 000 KMF



Chaque étape doit pouvoir être retrouvée dans son propre module et reliée aux autres.



\---



\# 76. Principe de preuve



Pour toute opération sensible, ADIKOM doit pouvoir disposer d'informations suffisantes pour démontrer :



\- ce qui a été fait ;

\- par qui ;

\- quand ;

\- sur quelle donnée ;

\- avec quel résultat.



\---



\# 77. Protection contre la falsification



Le système doit empêcher les utilisateurs ordinaires de modifier les événements d'audit.



Le journal doit être considéré comme une donnée protégée.



\---



\# 78. Audit du Super Admin



Les actions du Super Admin doivent également être historisées.



Le statut de Super Admin ne doit pas signifier que ses actions deviennent invisibles.



Exemple :



Super Admin



→ Modification d'une permission



→ Journal d'audit



L'action doit rester identifiable.



\---



\# 79. Audit et confidentialité des mots de passe



Les mots de passe ne doivent jamais être enregistrés dans le journal d'audit.



L'audit peut indiquer qu'un changement de mot de passe a eu lieu sans enregistrer le mot de passe lui-même.



\---



\# 80. Audit et informations sensibles



Le journal ne doit pas enregistrer inutilement des informations sensibles en clair.



Il doit conserver uniquement les éléments nécessaires à la traçabilité.



\---



\# 81. Principes non négociables



Les règles suivantes sont fondamentales :



1\. Les opérations importantes doivent être traçables.

2\. Chaque action importante doit pouvoir être associée à un utilisateur.

3\. La date et l'heure doivent être conservées.

4\. L'objet concerné doit être identifiable.

5\. Les modifications sensibles doivent pouvoir conserver l'ancienne et la nouvelle valeur lorsque nécessaire.

6\. Les annulations doivent être traçables.

7\. Les corrections doivent être traçables.

8\. Les changements de permissions doivent être traçables.

9\. Les opérations financières doivent disposer d'une traçabilité renforcée.

10\. Les actions du Super Admin doivent également être journalisées.

11\. Les utilisateurs ordinaires ne doivent pas pouvoir modifier ou supprimer librement le journal.

12\. Une donnée historique importante ne doit pas être supprimée uniquement pour masquer une opération.

13\. Les utilisateurs désactivés doivent rester identifiables dans l'historique.

14\. Les informations sensibles ne doivent pas être exposées inutilement dans le journal.

15\. Le système doit permettre de reconstituer les chaînes métier importantes.

16\. L'audit doit rester cohérent avec les opérations réellement effectuées.

17\. Une action refusée ne doit jamais être enregistrée comme réussie.

18\. L'audit et les permissions doivent rester deux mécanismes distincts.

19\. L'accès au journal d'audit doit lui-même être protégé.

20\. Le journal d'audit constitue une composante essentielle de la gouvernance d'ADIKOM PILOT.



\---



\# 82. Critères d'acceptation



Le système d'audit sera considéré comme conforme lorsque :



1\. les actions importantes sont journalisées ;

2\. l'utilisateur responsable est identifiable ;

3\. la date est enregistrée ;

4\. l'heure est enregistrée ;

5\. l'objet concerné est identifiable ;

6\. le type d'action est identifiable ;

7\. les modifications importantes peuvent conserver l'ancienne valeur ;

8\. les modifications importantes peuvent conserver la nouvelle valeur ;

9\. les motifs peuvent être enregistrés ;

10\. les créations sont traçables ;

11\. les modifications sont traçables ;

12\. les validations sont traçables ;

13\. les annulations sont traçables ;

14\. les paiements sont traçables ;

15\. les imputations sont traçables ;

16\. les virements sont traçables ;

17\. les changements de permissions sont traçables ;

18\. les changements de statut sont traçables ;

19\. les changements de fournisseur sont traçables ;

20\. les opérations sensibles sont protégées ;

21\. le Super Admin peut consulter l'audit ;

22\. les utilisateurs ordinaires ne peuvent pas modifier librement l'audit ;

23\. les événements peuvent être recherchés ;

24\. les événements peuvent être filtrés ;

25\. les événements peuvent être consultés par utilisateur ;

26\. les événements peuvent être consultés par module ;

27\. les événements peuvent être consultés par période ;

28\. les événements peuvent être consultés par objet ;

29\. les événements peuvent être consultés par référence ;

30\. les données sensibles sont protégées ;

31\. les opérations refusées peuvent être distinguées des opérations réussies lorsque nécessaire ;

32\. les historiques intermodules peuvent être reconstitués ;

33\. les données archivées restent traçables ;

34\. les données financières restent auditables ;

35\. les actions du Super Admin sont également enregistrées.



\---



\# 83. Principe directeur



L'audit doit permettre à ADIKOM de transformer chaque opération importante en une action identifiable et vérifiable.



La logique de référence est :



\*\*Utilisateur\*\*



↓



\*\*Action\*\*



↓



\*\*Objet\*\*



↓



\*\*Date / Heure\*\*



↓



\*\*Ancienne valeur éventuelle\*\*



↓



\*\*Nouvelle valeur éventuelle\*\*



↓



\*\*Résultat\*\*



L'objectif n'est pas de surveiller inutilement les collaborateurs.



L'objectif est de garantir :



\*\*Responsabilité → Transparence → Sécurité → Contrôle → Fiabilité\*\*



ADIKOM PILOT doit permettre de reconstituer les chaînes métier importantes, notamment :



\*\*Client → Location → Véhicule → Retour → Maintenance → Imputation → Facture → Paiement\*\*



et :



\*\*Utilisateur → Permission → Action → Résultat\*\*



Le principe fondamental est :



\*\*Toute opération importante doit pouvoir être expliquée.\*\*



ADIKOM doit pouvoir répondre, à partir de son système :



\*\*Qui a fait quoi ?\*\*



\*\*Quand ?\*\*



\*\*Sur quelle donnée ?\*\*



\*\*Quelle était la situation avant ?\*\*



\*\*Quelle est la situation après ?\*\*



\*\*Pourquoi, lorsque le motif est nécessaire ?\*\*



Cette capacité de traçabilité doit constituer l'un des piliers de la fiabilité et de la gouvernance d'ADIKOM PILOT.

