\# ADIKOM PILOT

\## Règles métier 05 — Gestion des permissions



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence métier  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\# 1. Objet



Ce document définit les règles métier relatives à la gestion des utilisateurs, groupes et permissions dans ADIKOM PILOT.



Le système doit permettre à ADIKOM de contrôler précisément les accès aux :



\- modules ;

\- menus ;

\- sous-menus ;

\- pages ;

\- fonctionnalités ;

\- données ;

\- actions sensibles.



L'objectif est que chaque utilisateur puisse accéder uniquement aux fonctionnalités nécessaires à ses responsabilités.



\---



\# 2. Principe général



ADIKOM PILOT doit utiliser une logique de permissions structurée autour de :



\*\*Utilisateur → Groupe → Permissions\*\*



Un utilisateur peut être associé à un ou plusieurs groupes selon les règles retenues par ADIKOM.



Les permissions doivent déterminer précisément ce que l'utilisateur peut :



\- voir ;

\- créer ;

\- consulter ;

\- modifier ;

\- supprimer ou annuler ;

\- valider ;

\- exporter ;

\- administrer.



\---



\# 3. Super Admin



Le \*\*Super Admin\*\* constitue le niveau d'administration maximal du système.



Il possède l'accès complet aux modules et fonctionnalités d'ADIKOM PILOT.



Le Super Admin est notamment autorisé à :



\- créer les utilisateurs ;

\- modifier les utilisateurs ;

\- désactiver les utilisateurs ;

\- créer les groupes ;

\- modifier les groupes ;

\- attribuer les permissions ;

\- gérer les accès ;

\- accéder à l'ensemble des modules ;

\- administrer les paramètres ;

\- consulter les journaux d'activité ;

\- gérer les paramètres sensibles.



Le Super Admin ne doit pas pouvoir être limité par les permissions ordinaires d'un groupe.



\---



\# 4. Création des utilisateurs



Les autres utilisateurs d'ADIKOM PILOT doivent être créés par un utilisateur disposant de la permission appropriée.



Dans la configuration initiale du projet :



\*\*Seul le Super Admin crée les autres utilisateurs.\*\*



Cette règle doit être considérée comme fondamentale pour le MVP.



\---



\# 5. Utilisateur



Un utilisateur représente une personne autorisée à accéder à ADIKOM PILOT.



La fiche utilisateur doit pouvoir contenir notamment :



\- nom ;

\- prénom ;

\- email ou identifiant ;

\- téléphone lorsque nécessaire ;

\- fonction ;

\- groupe(s) ;

\- statut ;

\- informations professionnelles utiles ;

\- date de création ;

\- dernière connexion lorsque disponible.



\---



\# 6. Statut utilisateur



Les statuts recommandés sont :



\- Actif ;

\- Inactif ;

\- Suspendu.



Un utilisateur inactif ou suspendu ne doit plus pouvoir se connecter normalement au système.



Son historique doit toutefois rester conservé.



\---



\# 7. Désactivation d'un utilisateur



Lorsqu'un collaborateur quitte ADIKOM ou ne doit plus accéder au système, son compte doit être désactivé plutôt que supprimé lorsque celui-ci possède un historique.



La désactivation doit empêcher l'accès au système.



Les opérations historiques effectuées par cet utilisateur doivent rester identifiables.



\---



\# 8. Suppression d'un utilisateur



Un utilisateur ayant effectué des actions dans ADIKOM PILOT ne doit pas être supprimé physiquement si cela détruirait la traçabilité historique.



Il doit être désactivé ou archivé.



L'historique doit continuer à afficher l'utilisateur concerné.



\---



\# 9. Groupes



Un groupe permet de regrouper des utilisateurs partageant des responsabilités ou des besoins d'accès similaires.



Exemples possibles :



\- Direction ;

\- Assistant(e) de direction ;

\- Administration \& Finance ;

\- Tourisme \& Mobilité ;

\- Support \& Logistique ;

\- Informatique \& Services Technique ;

\- Commercial \& Développement.



La liste définitive des groupes sera définie selon l'organisation d'ADIKOM.



\---



\# 10. Groupe et fonction



Un groupe peut correspondre à une fonction organisationnelle, mais les deux notions ne doivent pas être considérées comme strictement identiques.



Exemple :



Deux employés peuvent exercer des fonctions proches tout en ayant des niveaux de permissions différents.



Les permissions doivent donc rester configurables.



\---



\# 11. Création d'un groupe



La création d'un groupe doit être réservée aux utilisateurs disposant de la permission correspondante.



Dans la configuration initiale :



\*\*Super Admin → Gestion des groupes\*\*



\---



\# 12. Permissions d'un groupe



Un groupe peut recevoir un ensemble de permissions.



Exemple :



\*\*Groupe : Administration \& Finance\*\*



Accès possible :



\- Banques \& Caisses ;

\- Facturation \& Paiement ;

\- Tiers ;

\- certaines statistiques ;

\- certaines fonctions du Tableau de bord.



Les accès réellement attribués doivent être décidés par ADIKOM.



\---



\# 13. Permission individuelle



Le système doit permettre de déterminer précisément les permissions d'un utilisateur.



Lorsqu'un utilisateur est sélectionné depuis la liste des utilisateurs, sa fiche doit comporter deux onglets principaux :



\*\*Utilisateur\*\*



et



\*\*Permissions\*\*



\---



\# 14. Onglet « Utilisateur »



L'onglet \*\*Utilisateur\*\* doit présenter les informations relatives à l'employé.



Il peut notamment afficher :



\- identité ;

\- coordonnées ;

\- fonction ;

\- groupe ;

\- statut ;

\- informations professionnelles ;

\- historique utile.



\---



\# 15. Onglet « Permissions »



L'onglet \*\*Permissions\*\* doit présenter l'ensemble de l'arborescence fonctionnelle d'ADIKOM PILOT.



Il doit permettre de visualiser et gérer :



\- modules ;

\- menus ;

\- sous-menus ;

\- actions.



\---



\# 16. Arborescence des permissions



La structure doit suivre l'organisation réelle du SaaS.



Exemple :



\*\*Module\*\*



→ Menu



→ Sous-menu



→ Action



Cette structure doit permettre un contrôle suffisamment précis.



\---



\# 17. Exemple de permission



Exemple :



\*\*Module : Tiers\*\*



→ \*\*Clients\*\*



→ Liste des clients



→ Voir



→ Créer



→ Modifier



\---



\# 18. Permissions d'action



Le système doit pouvoir distinguer plusieurs actions.



Les actions recommandées sont :



\- Voir ;

\- Créer ;

\- Modifier ;

\- Supprimer lorsque cette opération est autorisée ;

\- Annuler ;

\- Valider ;

\- Exporter ;

\- Imprimer.



La liste exacte des actions peut être adaptée au besoin de chaque module.



\---



\# 19. Principe du moindre privilège



Un utilisateur doit disposer uniquement des permissions nécessaires à sa fonction.



Exemple :



Un utilisateur chargé de consulter les locations peut avoir :



\*\*Voir les locations\*\*



sans nécessairement avoir :



\*\*Modifier les locations\*\*



ou :



\*\*Annuler une location\*\*



\---



\# 20. Permission de consultation



La permission \*\*Voir\*\* permet d'accéder aux données concernées.



Elle ne doit pas automatiquement donner le droit de :



\- modifier ;

\- supprimer ;

\- valider ;

\- annuler.



\---



\# 21. Permission de création



La permission \*\*Créer\*\* permet de créer une nouvelle donnée dans le périmètre autorisé.



Exemple :



Créer un client.



Créer une réservation.



Créer une facture.



Créer un utilisateur.



La création ne donne pas automatiquement les autres permissions.



\---



\# 22. Permission de modification



La permission \*\*Modifier\*\* permet de modifier les données existantes selon les règles du module.



Les données financières et sensibles peuvent nécessiter des restrictions supplémentaires.



\---



\# 23. Permission d'annulation



L'annulation constitue une action distincte de la modification.



Exemple :



Un utilisateur peut modifier une réservation avant confirmation.



Mais seul un utilisateur autorisé peut annuler une opération déjà confirmée.



\---



\# 24. Permission de validation



La validation doit être distincte de la création lorsque le processus métier le nécessite.



Exemple :



Utilisateur A :

crée une facture.



Utilisateur B :

valide la facture.



Cette séparation permet un meilleur contrôle interne.



\---



\# 25. Permission de paiement



L'enregistrement ou la validation d'un paiement constitue une opération sensible.



Cette permission doit être attribuée uniquement aux utilisateurs autorisés.



\---



\# 26. Permission d'exportation



L'export de données peut contenir des informations sensibles.



La permission \*\*Exporter\*\* doit donc être attribuée séparément.



Exemple :



Un utilisateur peut consulter la liste des clients sans être autorisé à exporter l'intégralité de la base.



\---



\# 27. Permission d'impression



L'impression peut également être contrôlée lorsque les documents contiennent des informations sensibles.



Exemples :



\- factures ;

\- rapports financiers ;

\- listes de clients ;

\- documents fournisseurs.



\---



\# 28. Permissions financières



Les modules financiers doivent faire l'objet d'un contrôle renforcé.



Cela concerne notamment :



\- Banques \& Caisses ;

\- Facturation \& Paiement ;

\- paiements ;

\- factures fournisseurs ;

\- imputations ;

\- rapports financiers.



Tous les utilisateurs ne doivent pas disposer d'un accès financier complet.



\---



\# 29. Permissions sur les clients



Le système doit pouvoir contrôler les droits sur :



\- création client ;

\- consultation ;

\- modification ;

\- historique ;

\- tarifs préférentiels ;

\- factures ;

\- paiements ;

\- export.



\---



\# 30. Tarifs préférentiels



La gestion des tarifs préférentiels clients constitue une fonctionnalité sensible.



Selon les règles d'ADIKOM, il peut être nécessaire de distinguer :



\*\*Voir le tarif\*\*



et :



\*\*Modifier le tarif\*\*



Un utilisateur ne doit pas pouvoir modifier librement les conditions commerciales d'un client sans autorisation.



\---



\# 31. Permissions sur les fournisseurs



Le système doit pouvoir contrôler :



\- création ;

\- consultation ;

\- modification ;

\- désactivation ;

\- documents ;

\- coordonnées bancaires ;

\- factures ;

\- paiements ;

\- imputations.



\---



\# 32. Coordonnées bancaires fournisseurs



Les coordonnées bancaires d'un fournisseur sont des informations sensibles.



L'accès à leur consultation ou modification doit être limité aux utilisateurs autorisés.



Une modification peut nécessiter une traçabilité renforcée.



\---



\# 33. Permissions sur les véhicules



Le système doit pouvoir contrôler :



\- création ;

\- consultation ;

\- modification ;

\- changement de statut ;

\- mise en maintenance ;

\- immobilisation ;

\- retrait ;

\- changement de fournisseur.



\---



\# 34. Permissions sur les locations



Le système doit pouvoir contrôler :



\- création ;

\- consultation ;

\- modification ;

\- réservation ;

\- confirmation ;

\- départ ;

\- prolongation ;

\- retour ;

\- annulation ;

\- clôture.



\---



\# 35. Permissions sur les maintenances



Le système doit pouvoir contrôler :



\- création ;

\- consultation ;

\- modification ;

\- validation ;

\- clôture ;

\- coût ;

\- imputation fournisseur.



\---



\# 36. Permissions sur les imputations



Une imputation fournisseur constitue une opération financière sensible.



Le système doit pouvoir distinguer :



\*\*Créer une imputation\*\*



\*\*Modifier une imputation\*\*



\*\*Valider une imputation\*\*



\*\*Annuler une imputation\*\*



Un utilisateur ne doit pas automatiquement disposer de toutes ces permissions.



\---



\# 37. Permissions sur les factures



Le système doit pouvoir contrôler séparément :



\- créer une facture ;

\- consulter ;

\- modifier une facture brouillon ;

\- émettre ;

\- annuler ;

\- créer un avoir ;

\- consulter les règlements ;

\- exporter ;

\- imprimer.



\---



\# 38. Permissions sur les paiements



Le système doit pouvoir contrôler :



\- créer un paiement ;

\- consulter ;

\- valider ;

\- annuler ;

\- rapprocher ;

\- exporter.



\---



\# 39. Permissions sur les banques et caisses



Le système doit pouvoir contrôler :



\- créer un compte ;

\- consulter ;

\- modifier ;

\- consulter les écritures ;

\- créer un virement interne ;

\- valider un virement ;

\- exporter les mouvements.



\---



\# 40. Permissions sur les utilisateurs



La gestion des utilisateurs doit être particulièrement protégée.



Elle doit permettre de contrôler :



\- créer un utilisateur ;

\- consulter ;

\- modifier ;

\- désactiver ;

\- réactiver ;

\- modifier les groupes ;

\- modifier les permissions.



Dans le MVP :



\*\*Seul le Super Admin doit pouvoir créer les autres utilisateurs.\*\*



\---



\# 41. Permissions sur les groupes



Le système doit pouvoir contrôler :



\- créer un groupe ;

\- consulter ;

\- modifier ;

\- supprimer ou archiver ;

\- gérer les permissions du groupe.



\---



\# 42. Protection contre l'escalade de privilèges



Un utilisateur ne doit pas pouvoir s'attribuer lui-même des permissions supplémentaires.



Il ne doit pas non plus pouvoir modifier les permissions d'un autre utilisateur sans autorisation.



Cette règle est fondamentale pour la sécurité du système.



\---



\# 43. Modification des permissions



Toute modification importante des permissions doit être traçable.



Le système doit pouvoir conserver :



\- utilisateur concerné ;

\- ancienne permission ;

\- nouvelle permission ;

\- utilisateur ayant effectué la modification ;

\- date ;

\- heure.



\---



\# 44. Retrait d'une permission



Lorsqu'une permission est retirée, l'utilisateur ne doit plus pouvoir effectuer l'action concernée lors de sa prochaine vérification d'autorisation.



Le système ne doit pas conserver un accès fonctionnel uniquement parce que l'utilisateur avait précédemment obtenu la permission.



\---



\# 45. Permission héritée d'un groupe



Lorsqu'un utilisateur reçoit une permission via un groupe, le système doit pouvoir identifier l'origine de cette permission.



Exemple :



Utilisateur :

Jean



Groupe :

Administration \& Finance



Permission :

Voir les factures fournisseurs



La permission provient du groupe.



\---



\# 46. Permission individuelle



Lorsque le système permet des permissions individuelles, celles-ci doivent pouvoir être distinguées des permissions héritées du groupe.



Exemple :



Groupe :

Commercial



Permission groupe :

Voir les clients



Permission individuelle :

Exporter les clients



La source de chaque permission doit être identifiable.



\---



\# 47. Conflit de permissions



Lorsqu'un utilisateur possède plusieurs groupes ou permissions contradictoires, le système doit appliquer une règle claire.



La logique définitive devra être fixée avant l'implémentation de plusieurs groupes par utilisateur.



Le système ne doit pas produire un comportement ambigu.



\---



\# 48. Permissions et statut utilisateur



Un utilisateur désactivé ou suspendu ne doit pas pouvoir utiliser ses permissions normales pour accéder au système.



La désactivation du compte doit primer sur les permissions.



\---



\# 49. Permissions et Super Admin



Le Super Admin doit rester indépendant des restrictions des groupes ordinaires.



Les permissions du Super Admin doivent être traitées comme un niveau d'administration supérieur.



\---



\# 50. Permissions et API



Les permissions ne doivent pas être appliquées uniquement à l'interface.



Une action interdite à un utilisateur doit également être interdite côté serveur.



Le fait de masquer un bouton dans l'interface ne constitue pas une protection suffisante.



\---



\# 51. Permissions et données



Le contrôle doit porter sur l'action mais également, lorsque nécessaire, sur les données accessibles.



Exemple :



Un utilisateur peut être autorisé à consulter les locations mais ne pas être autorisé à consulter certaines informations financières sensibles.



Les règles détaillées de visibilité des données devront être définies selon les besoins réels d'ADIKOM.



\---



\# 52. Permissions par module



La structure générale peut être organisée autour des modules suivants :



1\. Tableau de bord ;

2\. Centre de notifications ;

3\. Projets \& Planification ;

4\. Tiers ;

5\. Gestion de location ;

6\. Banques \& Caisses ;

7\. Facturation \& Paiement ;

8\. Utilisateurs \& Groupes ;

9\. Paramètres.



Les permissions doivent suivre cette structure.



\---



\# 53. Tableau de bord



L'accès au Tableau de bord peut être contrôlé.



Selon le profil, un utilisateur peut avoir accès :



\- aux indicateurs généraux ;

\- aux indicateurs de son domaine ;

\- aux données financières ;

\- aux données opérationnelles.



Les informations sensibles ne doivent pas être visibles à tous les utilisateurs.



\---



\# 54. Centre de notifications



Un utilisateur doit pouvoir consulter les notifications qui le concernent selon ses permissions.



Certaines notifications peuvent être réservées à des fonctions particulières.



Exemple :



Une alerte financière peut être réservée aux utilisateurs autorisés à accéder aux données financières.



\---



\# 55. Projets \& Planification



Les permissions peuvent contrôler :



\- consultation des projets ;

\- création ;

\- modification ;

\- planification ;

\- affectation ;

\- clôture.



Ce module étant particulièrement destiné à l'assistant(e) de direction, les permissions devront pouvoir être configurées en conséquence.



\---



\# 56. Tiers



Le module Tiers peut être divisé en :



\### Clients



\- nouveau client ;

\- liste ;

\- consultation ;

\- modification ;

\- tarifs préférentiels ;

\- historique.



\### Fournisseurs



\- nouveau fournisseur ;

\- liste ;

\- consultation ;

\- modification ;

\- informations sensibles ;

\- historique.



\### Partenariats



\- nouveau partenariat ;

\- liste ;

\- consultation ;

\- modification ;

\- archivage.



\---



\# 57. Gestion de location



Les permissions doivent couvrir les différentes étapes du cycle :



\*\*Réservation → Départ → Location → Retour → Clôture\*\*



Les actions sensibles doivent pouvoir être séparées.



\---



\# 58. Banques \& Caisses



Les permissions doivent contrôler :



\- comptes ;

\- écritures ;

\- virements ;

\- consultation des soldes ;

\- opérations sensibles.



\---



\# 59. Facturation \& Paiement



Les permissions doivent contrôler séparément :



\- factures clients ;

\- factures fournisseurs ;

\- règlements ;

\- statistiques ;

\- rapports ;

\- paiements divers.



\---



\# 60. Utilisateurs \& Groupes



Ce module doit être accessible uniquement aux profils disposant des permissions d'administration nécessaires.



Le Super Admin possède l'accès complet.



\---



\# 61. Paramètres



Le module Paramètres peut contenir des informations sensibles de configuration.



L'accès doit être limité aux utilisateurs autorisés.



\---



\# 62. Principe de séparation des responsabilités



ADIKOM PILOT doit permettre de séparer certaines responsabilités.



Exemple :



\*\*Utilisateur A\*\*



Crée une facture.



↓



\*\*Utilisateur B\*\*



La valide.



↓



\*\*Utilisateur C\*\*



Enregistre le paiement.



Cette organisation peut être utilisée pour renforcer le contrôle interne.



\---



\# 63. Exemple — Assistant(e) de direction



Un profil Assistant(e) de direction peut disposer de permissions sur :



\- Tableau de bord ;

\- Centre de notifications ;

\- Projets \& Planification ;

\- consultation Tiers ;

\- consultation de certaines locations.



En revanche, l'accès aux paiements ou aux paramètres sensibles peut être limité.



Les permissions exactes seront définies par ADIKOM.



\---



\# 64. Exemple — Administration \& Finance



Un profil Administration \& Finance peut disposer de permissions sur :



\- Tiers ;

\- Banques \& Caisses ;

\- Facturation \& Paiement ;

\- certains indicateurs du Tableau de bord.



Les permissions de gestion des utilisateurs peuvent rester réservées au Super Admin.



\---



\# 65. Exemple — Tourisme \& Mobilité



Un profil Tourisme \& Mobilité peut disposer de permissions sur :



\- Gestion de location ;

\- consultation des véhicules ;

\- clients nécessaires aux opérations ;

\- planning opérationnel.



Il ne doit pas automatiquement accéder aux données financières sensibles.



\---



\# 66. Exemple — Support \& Logistique



Un profil Support \& Logistique peut disposer de permissions sur :



\- véhicules ;

\- maintenance ;

\- incidents ;

\- opérations logistiques ;

\- informations nécessaires aux locations.



\---



\# 67. Exemple — Informatique \& Services Technique



Ce profil peut disposer de permissions techniques adaptées à ses responsabilités.



L'accès aux données financières ou commerciales ne doit pas être accordé automatiquement.



\---



\# 68. Exemple — Commercial \& Développement



Ce profil peut disposer de permissions sur :



\- clients ;

\- prospects lorsqu'ils seront gérés ;

\- partenariats ;

\- certaines locations ;

\- informations commerciales ;

\- tarifs selon les règles définies.



La modification des tarifs préférentiels peut nécessiter une permission spécifique.



\---



\# 69. Vue hiérarchique



Le module Utilisateurs doit comporter une vue hiérarchique des utilisateurs.



Cette vue permet de représenter la structure organisationnelle d'ADIKOM.



Elle ne doit pas nécessairement déterminer automatiquement les permissions.



La hiérarchie organisationnelle et les permissions restent deux notions distinctes.



\---



\# 70. Groupe et hiérarchie



Un responsable hiérarchique peut superviser des collaborateurs sans disposer automatiquement de toutes leurs permissions.



Exemple :



Un responsable peut être supérieur hiérarchiquement à un collaborateur sans pouvoir accéder à ses données financières.



Les permissions restent déterminées par le système d'autorisation.



\---



\# 71. Accès aux données sensibles



Les données suivantes doivent faire l'objet d'une attention particulière :



\- informations financières ;

\- coordonnées bancaires ;

\- paiements ;

\- tarifs préférentiels ;

\- documents contractuels ;

\- informations administratives ;

\- données utilisateurs.



\---



\# 72. Journalisation des accès sensibles



Les actions sensibles doivent pouvoir être enregistrées dans le journal d'activité.



Exemples :



\- modification d'une permission ;

\- création d'un utilisateur ;

\- modification d'un tarif préférentiel ;

\- validation d'une facture ;

\- validation d'un paiement ;

\- création d'une imputation ;

\- modification d'un compte bancaire.



\---



\# 73. Expiration de session



Les règles de sécurité de session doivent être configurées lors de l'implémentation.



Un utilisateur ne doit pas conserver indéfiniment une session ouverte sans contrôle.



\---



\# 74. Déconnexion



L'utilisateur doit pouvoir se déconnecter de manière explicite.



Une session déconnectée ne doit plus permettre l'accès aux fonctions protégées.



\---



\# 75. Mot de passe



Les informations d'authentification ne doivent jamais être accessibles en clair par les utilisateurs ou les administrateurs.



Le système d'authentification doit respecter les bonnes pratiques de sécurité applicables.



\---



\# 76. Changement de mot de passe



Lorsqu'un utilisateur doit modifier son mot de passe, l'opération doit respecter les règles de sécurité définies pour l'authentification.



Un administrateur ne doit pas pouvoir consulter le mot de passe actuel d'un utilisateur.



\---



\# 77. Compte suspendu



Un compte suspendu ne doit plus pouvoir accéder au système.



La suspension ne doit pas supprimer :



\- historique ;

\- permissions enregistrées ;

\- opérations effectuées.



\---



\# 78. Réactivation



La réactivation d'un compte doit être réservée à un utilisateur autorisé.



Elle doit pouvoir être historisée.



\---



\# 79. Création d'un nouvel utilisateur



Le processus recommandé est :



\*\*Super Admin\*\*



↓



\*\*Créer utilisateur\*\*



↓



\*\*Renseigner informations\*\*



↓



\*\*Attribuer groupe\*\*



↓



\*\*Vérifier permissions\*\*



↓



\*\*Activer compte\*\*



↓



\*\*Utilisateur peut se connecter\*\*



\---



\# 80. Modification d'un utilisateur



Toute modification importante doit être contrôlée.



Exemples :



\- fonction ;

\- groupe ;

\- statut ;

\- permissions ;

\- informations professionnelles.



Les changements sensibles doivent être historisés.



\---



\# 81. Attribution d'un groupe



Lorsqu'un groupe est attribué à un utilisateur, ses permissions associées deviennent applicables selon les règles d'autorisation.



Le système doit pouvoir identifier le groupe responsable de ces permissions.



\---



\# 82. Retrait d'un groupe



Lorsqu'un groupe est retiré d'un utilisateur, les permissions provenant exclusivement de ce groupe doivent cesser de s'appliquer.



Les permissions provenant d'autres sources doivent être traitées selon la logique retenue.



\---



\# 83. Contrôle avant action



Avant toute action protégée, le système doit vérifier que l'utilisateur dispose de la permission nécessaire.



Exemple :



Utilisateur :

A



Action :

Annuler une facture



Le système vérifie :



\*\*Permission = Annuler facture\*\*



Si elle n'existe pas :



\*\*Action refusée\*\*



\---



\# 84. Refus d'accès



Lorsqu'une action est interdite, le système doit :



\- refuser l'action ;

\- ne pas modifier les données ;

\- ne pas contourner la permission ;

\- éventuellement enregistrer l'événement selon la politique d'audit.



\---



\# 85. Protection côté serveur



Les permissions doivent être vérifiées côté serveur pour toutes les opérations sensibles.



Une simple protection de l'interface utilisateur n'est pas suffisante.



\---



\# 86. Cohérence des permissions



Les permissions doivent rester cohérentes entre :



\- interface ;

\- API ;

\- base de données ;

\- actions métier.



Un utilisateur ne doit pas pouvoir contourner une restriction en appelant directement une fonction technique.



\---



\# 87. Principe de confiance minimale



Le système doit partir du principe qu'une permission doit être explicitement accordée.



L'absence de permission doit entraîner :



\*\*Accès refusé\*\*



et non :



\*\*Accès autorisé par défaut\*\*



sauf pour les éléments explicitement publics de l'application.



\---



\# 88. Audit des permissions



Le système doit pouvoir permettre au Super Admin de savoir :



\- qui possède quelle permission ;

\- d'où vient la permission ;

\- quand elle a été attribuée ;

\- qui l'a attribuée ;

\- quand elle a été retirée.



\---



\# 89. Exemple de matrice



Une matrice de permissions peut être représentée ainsi :



| Module | Voir | Créer | Modifier | Valider | Annuler | Exporter |

|---|---|---|---|---|---|---|

| Clients | ✓ | ✓ | ✓ | — | — | ✓ |

| Fournisseurs | ✓ | ✓ | ✓ | — | — | ✓ |

| Locations | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

| Factures | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

| Paiements | ✓ | ✓ | — | ✓ | ✓ | ✓ |

| Banques \& Caisses | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

| Utilisateurs | ✓ | ✓ | ✓ | — | — | — |



Cette matrice est un exemple de représentation et ne constitue pas l'attribution définitive des permissions.



\---



\# 90. Principes non négociables



Les règles suivantes sont fondamentales :



1\. Seul le Super Admin possède l'accès complet au système.

2\. Seul le Super Admin crée les autres utilisateurs dans le MVP.

3\. Un utilisateur ne peut pas s'attribuer lui-même des permissions.

4\. Un utilisateur ne peut pas modifier ses propres permissions sans autorisation appropriée.

5\. Les permissions doivent être contrôlées côté serveur.

6\. Masquer un bouton ne constitue pas une protection suffisante.

7\. Les données financières doivent être protégées.

8\. Les coordonnées bancaires doivent être protégées.

9\. Les tarifs préférentiels doivent pouvoir être protégés.

10\. Les actions sensibles doivent être traçables.

11\. Un utilisateur désactivé ne doit plus pouvoir se connecter.

12\. La désactivation d'un utilisateur ne doit pas supprimer son historique.

13\. Un utilisateur ne doit recevoir que les permissions nécessaires à sa fonction.

14\. Les permissions doivent être organisées par modules, menus et sous-menus.

15\. La hiérarchie organisationnelle ne doit pas automatiquement déterminer les permissions.

16\. Les changements de permissions doivent être historisés.

17\. Les permissions doivent rester cohérentes entre interface et serveur.

18\. Une absence de permission doit entraîner un refus d'accès.

19\. Les opérations financières sensibles doivent pouvoir être séparées entre plusieurs utilisateurs.

20\. Le Super Admin doit conserver le contrôle global de l'administration du système.



\---



\# 91. Critères d'acceptation



Le système de permissions sera considéré comme conforme lorsque :



1\. un Super Admin peut être identifié ;

2\. le Super Admin dispose de l'accès complet ;

3\. le Super Admin peut créer les utilisateurs ;

4\. un utilisateur peut être créé ;

5\. un utilisateur peut être activé ou désactivé ;

6\. un utilisateur peut être associé à un groupe ;

7\. un groupe peut être créé ;

8\. un groupe peut recevoir des permissions ;

9\. les permissions peuvent être organisées par module ;

10\. les permissions peuvent être organisées par menu ;

11\. les permissions peuvent être organisées par sous-menu ;

12\. les actions peuvent être contrôlées ;

13\. l'onglet « Utilisateur » est disponible ;

14\. l'onglet « Permissions » est disponible ;

15\. les permissions héritées peuvent être identifiées ;

16\. les permissions individuelles peuvent être distinguées lorsque cette fonctionnalité est activée ;

17\. les permissions de consultation peuvent être séparées des permissions de modification ;

18\. les permissions de création peuvent être séparées des permissions de validation ;

19\. les permissions d'annulation peuvent être séparées ;

20\. les permissions financières peuvent être limitées ;

21\. les permissions sur les tarifs préférentiels peuvent être contrôlées ;

22\. les permissions sur les coordonnées bancaires peuvent être contrôlées ;

23\. les permissions sur les paiements peuvent être contrôlées ;

24\. les permissions sur les imputations peuvent être contrôlées ;

25\. les permissions sur les utilisateurs sont protégées ;

26\. un utilisateur sans permission ne peut pas effectuer l'action ;

27\. le contrôle côté serveur est appliqué ;

28\. les comptes désactivés ne peuvent plus se connecter ;

29\. les modifications sensibles sont historisées ;

30\. les permissions peuvent être auditées ;

31\. les accès restent cohérents entre les différents modules.



\---



\# 92. Principe directeur



ADIKOM PILOT doit considérer les permissions comme un mécanisme central de gouvernance du système.



La logique de référence est :



\*\*Utilisateur\*\*



↓



\*\*Groupe\*\*



↓



\*\*Module\*\*



↓



\*\*Menu\*\*



↓



\*\*Sous-menu\*\*



↓



\*\*Action\*\*



↓



\*\*Autorisé / Refusé\*\*



Le principe fondamental est :



\*\*Chaque utilisateur doit avoir accès à ce dont il a besoin pour travailler, et à rien de plus que ce qui lui est autorisé.\*\*



Le Super Admin conserve la maîtrise globale du système.



Les autres utilisateurs travaillent dans un environnement adapté à leurs responsabilités.



Les permissions doivent être suffisamment précises pour permettre à ADIKOM de construire progressivement une véritable séparation des responsabilités entre :



\- Direction ;

\- Assistant(e) de direction ;

\- Administration \& Finance ;

\- Tourisme \& Mobilité ;

\- Support \& Logistique ;

\- Informatique \& Services Technique ;

\- Commercial \& Développement.



ADIKOM PILOT doit ainsi garantir un équilibre entre :



\*\*simplicité d'utilisation → contrôle interne → sécurité → traçabilité → évolutivité.\*\*

