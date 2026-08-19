\# ADIKOM PILOT

\## Module 08 — Utilisateurs \& Groupes



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence fonctionnelle  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\# 1. Objet du module



Le module Utilisateurs \& Groupes constitue le centre de gestion des accès internes à ADIKOM PILOT.



Il permet au Super Admin de créer et gérer les comptes utilisateurs internes, de les organiser en groupes et de définir précisément les permissions auxquelles chaque utilisateur peut accéder.



ADIKOM PILOT est un SaaS strictement interne.



Les clients, fournisseurs, partenaires ou autres personnes externes ne disposent pas de compte de connexion à l’application dans le périmètre actuel du projet.



Le module doit donc répondre à une logique simple :



\*\*Un employé ADIKOM → un compte interne → un groupe éventuel → des permissions → un accès contrôlé aux modules.\*\*



\---



\# 2. Objectifs



Le module doit permettre de :



1\. créer les utilisateurs internes ;

2\. consulter la liste des utilisateurs ;

3\. consulter la vue hiérarchique ;

4\. créer des groupes ;

5\. consulter la liste des groupes ;

6\. attribuer des utilisateurs à des groupes ;

7\. gérer les permissions ;

8\. contrôler l’accès aux modules ;

9\. contrôler l’accès aux menus ;

10\. contrôler l’accès aux sous-menus ;

11\. différencier les droits de consultation et d’action ;

12\. protéger les données sensibles ;

13\. conserver une trace des modifications importantes ;

14\. permettre au Super Admin de garder le contrôle global du système.



\---



\# 3. Structure générale



Le module est organisé comme suit :



Utilisateurs \& Groupes

│

├── Utilisateurs

│   ├── Nouvel utilisateur

│   ├── Liste des utilisateurs

│   └── Vue hiérarchique

│

└── Groupes

&#x20;   ├── Nouveau groupe

&#x20;   └── Liste des groupes



Cette structure constitue la base fonctionnelle du MVP.



\---



\# 4. Principe fondamental des accès



Le système doit fonctionner selon le principe :



\*\*Pas de permission = pas d'accès.\*\*



Un utilisateur ne doit pas pouvoir accéder à une fonctionnalité simplement parce qu'il connaît son URL.



Les permissions doivent être contrôlées :



\- dans l'interface ;

\- dans les routes ;

\- dans les actions ;

\- côté serveur ;

\- au niveau des données lorsque nécessaire.



Masquer un bouton ne constitue pas une mesure de sécurité suffisante.



\---



\# 5. Super Admin



Le \*\*Super Admin\*\* constitue le niveau d'administration le plus élevé d'ADIKOM PILOT.



Il dispose d'un accès à l'ensemble des modules et fonctionnalités du système.



Il est notamment responsable de :



\- créer les utilisateurs ;

\- gérer les groupes ;

\- gérer les permissions ;

\- gérer les accès ;

\- consulter la structure des utilisateurs ;

\- administrer les paramètres liés aux accès.



Le Super Admin est le seul utilisateur disposant par défaut de l'accès global à l'ensemble des modules.



\---



\# 6. Création des autres utilisateurs



Les autres comptes utilisateurs internes sont créés par le Super Admin.



Un utilisateur ne doit pas pouvoir s'auto-inscrire librement.



Il ne doit pas exister de création publique de compte dans l'application.



Le SaaS étant strictement interne, l'accès doit être contrôlé par l'administration d'ADIKOM.



\---



\# 7. Nouvel utilisateur



Le menu \*\*Nouvel utilisateur\*\* doit permettre au Super Admin de créer un compte interne.



Les informations peuvent notamment comprendre :



\- prénom ;

\- nom ;

\- nom d'utilisateur ou identifiant ;

\- email professionnel ;

\- téléphone professionnel ;

\- fonction ;

\- département ;

\- groupe ;

\- statut ;

\- photo ou avatar ;

\- informations complémentaires.



Les champs obligatoires seront définis lors de l'implémentation.



\---



\# 8. Informations professionnelles



Le compte utilisateur doit pouvoir contenir les informations permettant d'identifier la fonction de la personne dans l'organisation.



Exemples :



\*\*Nom :\*\*  

Mohamed Ali



\*\*Fonction :\*\*  

Assistant(e) de direction



\*\*Département :\*\*  

Administration \& Finance



Ces informations servent notamment à la coordination interne et à la vue hiérarchique.



\---



\# 9. Responsabilités multiples



ADIKOM étant une entreprise de taille limitée, une même personne peut être responsable de plusieurs départements.



Le système doit donc permettre qu'un même utilisateur puisse être associé à plusieurs responsabilités.



Exemple :



Utilisateur :

Responsable A



Responsabilités :



\- Tourisme \& Mobilité ;

\- Commercial \& Développement.



Le système ne doit pas imposer une relation rigide :



\*\*1 utilisateur = 1 département.\*\*



Cette flexibilité est essentielle au fonctionnement actuel d'ADIKOM.



\---



\# 10. Départements



Les départements peuvent notamment correspondre à :



\- Administration \& Finance ;

\- Tourisme \& Mobilité ;

\- Support \& Logistique ;

\- Informatique \& Services Technique ;

\- Commercial \& Développement.



Le Gérant et l'Assistant(e) de direction disposent de responsabilités transversales selon l'organisation validée par ADIKOM.



La structure peut évoluer lorsque l'entreprise recrute davantage de personnel.



\---



\# 11. Statut utilisateur



Un utilisateur peut disposer de plusieurs statuts.



Exemples :



\- Actif ;

\- Inactif ;

\- Suspendu ;

\- Archivé.



Un utilisateur inactif ou suspendu ne doit plus pouvoir se connecter à l'application.



Son historique doit néanmoins rester conservé.



\---



\# 12. Compte actif



Un compte actif peut se connecter à ADIKOM PILOT selon ses permissions.



Le système doit vérifier :



\- que le compte existe ;

\- qu'il est actif ;

\- que l'authentification est valide ;

\- que l'accès demandé est autorisé.



\---



\# 13. Désactivation d'un utilisateur



Lorsqu'un employé quitte l'entreprise ou ne doit plus accéder au SaaS, son compte doit pouvoir être désactivé.



La désactivation doit :



\- empêcher la connexion ;

\- conserver les données historiques ;

\- conserver les actions réalisées ;

\- conserver les tâches attribuées ;

\- conserver les projets associés.



Il ne faut pas supprimer automatiquement l'utilisateur de l'historique métier.



\---



\# 14. Liste des utilisateurs



Le menu \*\*Liste des utilisateurs\*\* doit permettre de consulter les utilisateurs internes.



La liste peut afficher :



\- nom ;

\- fonction ;

\- département ;

\- groupe ;

\- statut ;

\- dernière connexion ;

\- date de création.



Les informations sensibles doivent respecter les permissions.



\---



\# 15. Recherche des utilisateurs



La recherche doit permettre de retrouver un utilisateur par :



\- nom ;

\- prénom ;

\- email ;

\- fonction ;

\- identifiant.



La recherche doit être rapide.



\---



\# 16. Filtres des utilisateurs



Les filtres peuvent inclure :



\- statut ;

\- département ;

\- groupe ;

\- fonction.



Cette fonction doit permettre au Super Admin de retrouver rapidement les utilisateurs concernés.



\---



\# 17. Fiche utilisateur



Lorsqu'on clique sur un utilisateur dans la liste, le système doit ouvrir une \*\*fiche utilisateur dédiée\*\*.



Cette fiche doit comporter exactement deux onglets principaux :



\*\*Utilisateur\*\*



et



\*\*Permissions\*\*



Cette structure constitue une exigence fonctionnelle importante du module.



\---



\# 18. Onglet « Utilisateur »



L'onglet \*\*Utilisateur\*\* contient les informations relatives à l'employé.



Il peut notamment présenter :



\- identité ;

\- coordonnées professionnelles ;

\- fonction ;

\- département ;

\- responsabilités ;

\- groupe ;

\- statut ;

\- informations de connexion ;

\- date de création ;

\- dernière connexion ;

\- informations complémentaires.



\---



\# 19. Onglet « Permissions »



L'onglet \*\*Permissions\*\* constitue le centre de contrôle des accès de l'utilisateur.



Il doit présenter l'ensemble des modules, menus et sous-menus disponibles dans ADIKOM PILOT.



Le Super Admin doit pouvoir visualiser clairement ce à quoi l'utilisateur a accès.



\---



\# 20. Arborescence des permissions



Les permissions doivent respecter la structure réelle de l'application.



Exemple :



\### Gestion de location



\- Tableau de location

\- Réservations

\- Locations

\- Parc automobile

\- Véhicules

\- Catégories

\- Tarification

\- Départs

\- Retours

\- Maintenance

\- Dommages \& Incidents

\- Documents



\### Tiers



\- Nouveau client

\- Liste des clients

\- Nouveau fournisseur

\- Liste des fournisseurs

\- Nouveau partenariat

\- Liste des partenariats



\### Facturation \& Paiement



\- Factures clients

\- Nouvelle facture

\- Liste

\- Règlements

\- Statistiques

\- Rapports

\- Factures fournisseurs

\- Nouvelle facture

\- Liste

\- Règlements

\- Statistiques

\- Rapports

\- Paiements divers



La liste exacte doit rester synchronisée avec les modules réellement développés.



\---



\# 21. Niveau de permission



Le système doit pouvoir distinguer plusieurs niveaux d'accès.



Une base fonctionnelle peut être :



\- Voir ;

\- Créer ;

\- Modifier ;

\- Supprimer/Archiver ;

\- Valider ;

\- Administrer.



Les niveaux exacts peuvent être adaptés selon le module.



\---



\# 22. Exemple de permissions



Pour une réservation :



\*\*Voir\*\*

→ peut consulter les réservations.



\*\*Créer\*\*

→ peut créer une réservation.



\*\*Modifier\*\*

→ peut modifier une réservation.



\*\*Annuler\*\*

→ peut annuler une réservation.



\*\*Administrer\*\*

→ peut gérer les paramètres ou règles associées lorsque cette permission existe.



Cette granularité permet d'éviter de donner systématiquement des droits excessifs.



\---



\# 23. Permissions par module



Le système doit permettre d'autoriser ou de refuser l'accès à un module.



Exemple :



Utilisateur A :



Gestion de location :

✓



Facturation \& Paiement :

✓



Banques \& Caisses :

✗



Paramètres :

✗



L'utilisateur ne doit pas voir les modules auxquels il n'a pas accès.



\---



\# 24. Permissions par menu



L'accès peut être limité à certains menus.



Exemple :



Gestion de location :

✓



Réservations :

✓



Locations :

✓



Maintenance :

✓



Tarification :

✗



L'utilisateur peut donc gérer les locations sans pouvoir modifier les tarifs.



\---



\# 25. Permissions par sous-menu



Le système doit également pouvoir gérer les sous-menus.



Exemple :



Factures clients :

✓



Nouvelle facture :

✗



Liste :

✓



Règlements :

✓



Statistiques :

✓



Rapports :

✗



L'utilisateur peut consulter les factures et leurs règlements sans pouvoir créer une nouvelle facture ou consulter certains rapports.



\---



\# 26. Héritage des permissions



Lorsque cela est pertinent, les permissions peuvent être organisées de manière hiérarchique.



Exemple :



Module :

Gestion de location



Si l'accès au module est refusé, les menus et sous-menus doivent également être inaccessibles.



Si un menu est refusé, ses sous-menus doivent être inaccessibles.



Le système doit cependant permettre une granularité suffisante lorsque l'organisation des permissions l'exige.



\---



\# 27. Groupes



Un groupe représente un ensemble d'utilisateurs partageant une logique commune de permissions.



Exemples :



\- Direction ;

\- Administration ;

\- Location ;

\- Finance ;

\- Commercial ;

\- Support ;

\- Super Admin.



Les noms exacts pourront être adaptés à l'organisation d'ADIKOM.



\---



\# 28. Nouveau groupe



Le menu \*\*Nouveau groupe\*\* doit permettre de créer un groupe.



Un groupe peut contenir :



\- nom ;

\- description ;

\- utilisateurs ;

\- permissions ;

\- statut.



\---



\# 29. Liste des groupes



La liste doit permettre de consulter :



\- nom du groupe ;

\- description ;

\- nombre d'utilisateurs ;

\- statut ;

\- date de création.



Chaque groupe doit pouvoir être ouvert afin de consulter ou modifier sa configuration selon les permissions.



\---



\# 30. Attribution d'un utilisateur à un groupe



Un utilisateur peut être associé à un groupe.



Exemple :



Utilisateur :

Assistant(e) de direction



Groupe :

Direction / Administration



Les permissions du groupe peuvent alors être appliquées à l'utilisateur selon les règles définies.



\---



\# 31. Permissions individuelles



Le système doit pouvoir permettre des permissions individuelles en complément des permissions de groupe lorsque cela est nécessaire.



Exemple :



Groupe :

Location



Permission supplémentaire accordée à un utilisateur :

Consulter les statistiques.



Cela permet de gérer les cas particuliers sans créer inutilement de nombreux groupes.



\---



\# 32. Priorité des permissions



Le système doit définir une règle claire lorsqu'un utilisateur possède à la fois :



\- des permissions provenant d'un groupe ;

\- des permissions individuelles.



La règle doit être documentée et appliquée de manière cohérente.



Une approche recommandée pour le MVP est :



\*\*Permission explicitement refusée → accès refusé\*\*



\*\*Permission accordée → accès autorisé\*\*



\*\*Aucune permission → accès refusé\*\*



La logique finale devra être centralisée dans le système d'autorisation.



\---



\# 33. Super Admin et permissions



Le Super Admin doit conserver l'accès complet aux modules.



Ses permissions ne doivent pas dépendre d'un groupe métier ordinaire.



Le système doit prévoir un rôle système spécifique pour le Super Admin.



\---



\# 34. Protection du Super Admin



Le système doit empêcher qu'un utilisateur non autorisé puisse :



\- devenir Super Admin ;

\- modifier les permissions du Super Admin ;

\- supprimer le dernier Super Admin ;

\- désactiver accidentellement le seul compte administrateur global.



Ces opérations doivent être particulièrement protégées.



\---



\# 35. Vue hiérarchique



Le menu \*\*Vue hiérarchique\*\* doit permettre de représenter la structure interne d'ADIKOM.



La vue doit refléter l'organigramme validé.



Elle peut notamment présenter :



\*\*Gérant\*\*



↓



\*\*Assistant(e) de direction\*\*



↓



Responsables / fonctions



\- Administration \& Finance ;

\- Tourisme \& Mobilité ;

\- Support \& Logistique ;

\- Informatique \& Services Technique ;

\- Commercial \& Développement.



Comme une même personne peut prendre plusieurs départements, la représentation doit pouvoir gérer ce cas.



\---



\# 36. Responsabilités multiples dans la vue hiérarchique



Exemple :



Utilisateur A



Responsable :



\- Tourisme \& Mobilité ;

\- Commercial \& Développement.



Le système doit pouvoir représenter cette situation sans créer deux comptes pour la même personne.



Une personne doit conserver un seul compte utilisateur.



\---



\# 37. Évolution de l'organigramme



L'organisation actuelle d'ADIKOM est adaptée à une entreprise de taille limitée.



Le système doit toutefois être conçu pour permettre une évolution future.



Lorsque l'effectif augmente, ADIKOM pourra :



\- créer de nouveaux utilisateurs ;

\- créer de nouveaux groupes ;

\- répartir les responsabilités ;

\- modifier les permissions ;

\- adapter la hiérarchie.



Le SaaS ne doit donc pas être conçu autour d'un organigramme figé.



\---



\# 38. Utilisateur et activités métier



Un utilisateur peut être responsable de nombreuses opérations.



Exemples :



\- projet ;

\- tâche ;

\- réservation ;

\- maintenance ;

\- facture ;

\- paiement ;

\- modification ;

\- validation.



Les opérations doivent être liées à l'identifiant interne de l'utilisateur.



Cela permet de savoir qui a effectué chaque action.



\---



\# 39. Historique utilisateur



La fiche utilisateur doit permettre de retrouver certaines informations historiques pertinentes.



Exemples :



\- création du compte ;

\- modification des informations ;

\- changement de groupe ;

\- changement de permissions ;

\- activation ;

\- désactivation ;

\- dernière connexion.



Les données métier historiques doivent continuer à référencer l'utilisateur même après sa désactivation.



\---



\# 40. Journal des permissions



Les changements de permissions doivent être particulièrement traçables.



Exemple :



Utilisateur :

Jean Dupont



Avant :

Gestion de location → Voir



Après :

Gestion de location → Voir + Créer + Modifier



Modifié par :

Super Admin



Date :

20/08/2026



Le système doit conserver cet événement dans le journal.



\---



\# 41. Authentification



L'authentification doit être assurée par le système d'authentification retenu pour ADIKOM PILOT.



Dans l'architecture du projet, Supabase est utilisé comme infrastructure backend.



Le système doit exploiter une authentification sécurisée et ne doit jamais stocker les mots de passe en clair dans les tables métier de l'application.



\---



\# 42. Accès interne uniquement



ADIKOM PILOT ne doit pas proposer de portail public de connexion pour les clients ou fournisseurs.



L'accès est réservé aux utilisateurs internes autorisés.



Les formulaires de connexion doivent être conçus pour l'usage interne de l'entreprise.



\---



\# 43. Session utilisateur



Le système doit gérer correctement les sessions.



Il doit pouvoir :



\- maintenir une session valide ;

\- déconnecter l'utilisateur ;

\- invalider une session lorsque le compte est désactivé ;

\- protéger les routes privées.



\---



\# 44. Dernière connexion



Le système peut enregistrer :



\- date ;

\- heure ;

\- éventuellement les informations techniques nécessaires à la sécurité.



Cette information peut être visible par les utilisateurs autorisés.



Elle permet notamment au Super Admin de détecter les comptes inactifs ou inhabituels.



\---



\# 45. Sécurité des routes



Toutes les pages internes doivent être protégées.



Un utilisateur non authentifié ne doit pas pouvoir accéder aux pages internes.



Un utilisateur authentifié mais sans permission ne doit pas pouvoir accéder à une fonctionnalité protégée.



Cette protection doit être appliquée côté serveur.



\---



\# 46. Contrôle des données



Les permissions doivent également être appliquées aux données.



Exemple :



Un utilisateur disposant uniquement d'un accès aux réservations ne doit pas pouvoir récupérer les données financières d'une facture simplement en modifiant une URL ou une requête.



Le contrôle doit être réalisé au niveau des données accessibles.



\---



\# 47. Interface de gestion des permissions



L'interface de l'onglet \*\*Permissions\*\* doit être claire.



Elle peut utiliser :



\- arborescence ;

\- groupes de permissions ;

\- cases à cocher ;

\- interrupteurs ;

\- niveaux d'accès.



Exemple :



Gestion de location

☑ Voir

☑ Créer

☑ Modifier

☐ Annuler

☐ Administrer



Cette interface doit permettre au Super Admin de comprendre rapidement les accès accordés.



\---



\# 48. État des permissions



L'interface doit permettre de distinguer :



\- permission accordée ;

\- permission refusée ;

\- permission héritée ;

\- permission non définie.



La présentation doit éviter toute ambiguïté.



\---



\# 49. Modification des permissions



Lorsqu'une permission est modifiée, le système doit :



1\. vérifier que l'utilisateur connecté dispose de l'autorisation ;

2\. enregistrer la modification ;

3\. mettre à jour les droits ;

4\. enregistrer l'événement dans le journal ;

5\. appliquer les nouveaux droits lors des prochaines vérifications.



\---



\# 50. Prise en compte immédiate



Lorsqu'un accès est retiré, le système doit éviter qu'un utilisateur puisse continuer à utiliser une fonctionnalité protégée indéfiniment.



La stratégie exacte de rafraîchissement des permissions sera définie lors de l'implémentation.



\---



\# 51. Suppression d'un utilisateur



La suppression physique d'un utilisateur ayant réalisé des opérations métier doit être évitée.



Il est préférable de désactiver ou archiver le compte.



Ainsi, l'historique peut continuer à afficher :



\*\*Action réalisée par : Mohamed Ali\*\*



même si son compte n'est plus actif.



\---



\# 52. Suppression d'un groupe



Un groupe utilisé par des utilisateurs ne doit pas être supprimé sans contrôle.



Le système doit vérifier :



\- nombre d'utilisateurs associés ;

\- permissions associées ;

\- dépendances éventuelles.



Une suppression ou désactivation doit être tracée.



\---



\# 53. Notifications



Le module peut générer des notifications concernant :



\- nouvel utilisateur créé ;

\- compte désactivé ;

\- changement de permissions ;

\- changement de groupe ;

\- événement de sécurité important.



Les notifications doivent respecter les permissions.



\---



\# 54. Journal d'activité



Les actions sensibles doivent être journalisées.



Exemples :



\- création utilisateur ;

\- modification utilisateur ;

\- activation ;

\- désactivation ;

\- création groupe ;

\- modification groupe ;

\- changement permission ;

\- changement de rôle ;

\- changement de responsabilité.



Le journal doit identifier :



\- utilisateur ayant effectué l'action ;

\- action ;

\- élément concerné ;

\- date ;

\- heure.



\---



\# 55. Responsive design



Le module doit être entièrement responsive.



\### Desktop



L'interface de permissions peut exploiter une largeur importante afin de présenter l'arborescence des modules.



\### Tablette



Les panneaux peuvent être réorganisés.



\### Mobile



Les permissions doivent être présentées de manière progressive et lisible.



La gestion complexe des permissions doit rester utilisable sans nécessiter un écran desktop.



\---



\# 56. Performance



Le système doit pouvoir gérer progressivement davantage d'utilisateurs et de groupes.



Les listes doivent prévoir :



\- pagination ;

\- recherche ;

\- filtrage ;

\- chargement progressif.



Les permissions doivent être chargées de manière efficace.



\---



\# 57. Évolutivité



Le système doit pouvoir évoluer avec ADIKOM.



Fonctionnalités futures possibles :



\- authentification à deux facteurs ;

\- connexion avec fournisseur d'identité professionnel ;

\- historique avancé des sessions ;

\- gestion des appareils autorisés ;

\- politiques de sécurité ;

\- expiration des sessions ;

\- permissions conditionnelles ;

\- accès temporaire ;

\- approbation de certaines permissions ;

\- matrice avancée des responsabilités.



Ces fonctionnalités ne sont pas obligatoires pour le MVP.



\---



\# 58. Relations avec les autres modules



Utilisateurs \& Groupes doit être connecté à l'ensemble du SaaS.



Utilisateurs \& Groupes

│

├── Tableau de bord

│   └── Données selon permissions

│

├── Projets \& Planification

│   └── Responsables / Participants

│

├── Tiers

│   └── Utilisateurs responsables

│

├── Gestion de location

│   └── Utilisateurs opérationnels

│

├── Banques \& Caisses

│   └── Utilisateurs autorisés

│

├── Facturation \& Paiement

│   └── Utilisateurs autorisés

│

└── Paramètres

&#x20;   └── Administration système



\---



\# 59. Exemple de configuration d'un utilisateur



\### Utilisateur



Assistant(e) de direction



\### Groupe



Direction / Administration



\### Accès



Projets \& Planification :

✓ Voir

✓ Créer

✓ Modifier



Tiers :

✓ Voir

✓ Créer

✓ Modifier



Gestion de location :

✓ Voir

✓ Créer



Facturation \& Paiement :

✓ Voir



Banques \& Caisses :

✗



Paramètres :

✗



Cet exemple montre qu'un utilisateur peut disposer d'un accès large à certaines fonctions sans obtenir automatiquement l'accès à toutes les données sensibles.



\---



\# 60. Exemple d'un responsable ayant deux départements



\### Utilisateur



Responsable A



\### Responsabilités



\- Tourisme \& Mobilité ;

\- Commercial \& Développement.



\### Compte



Un seul compte utilisateur.



\### Permissions



Gestion de location :

✓ Voir

✓ Créer

✓ Modifier



Tiers :

✓ Voir

✓ Créer



Projets \& Planification :

✓ Voir

✓ Créer

✓ Modifier



Facturation :

Selon les responsabilités attribuées.



Le système doit donc gérer la polyvalence sans multiplier les comptes.



\---



\# 61. Critères d'acceptation du module



Le module Utilisateurs \& Groupes sera considéré comme fonctionnel lorsque :



1\. le Super Admin peut créer un utilisateur ;

2\. les utilisateurs internes peuvent être listés ;

3\. les utilisateurs peuvent être recherchés ;

4\. les utilisateurs peuvent être filtrés ;

5\. une fiche utilisateur peut être ouverte ;

6\. la fiche utilisateur possède les deux onglets « Utilisateur » et « Permissions » ;

7\. les informations professionnelles peuvent être enregistrées ;

8\. un utilisateur peut avoir plusieurs responsabilités ;

9\. les groupes peuvent être créés ;

10\. les groupes peuvent être listés ;

11\. les utilisateurs peuvent être associés à des groupes ;

12\. les permissions peuvent être gérées ;

13\. les modules peuvent être autorisés ou refusés ;

14\. les menus peuvent être autorisés ou refusés ;

15\. les sous-menus peuvent être autorisés ou refusés ;

16\. les niveaux de permission peuvent être gérés ;

17\. les permissions individuelles peuvent être gérées lorsque nécessaire ;

18\. le Super Admin dispose de l'accès global ;

19\. les utilisateurs externes ne peuvent pas créer de compte ;

20\. les utilisateurs désactivés ne peuvent plus se connecter ;

21\. l'historique des utilisateurs désactivés est conservé ;

22\. les changements de permissions sont journalisés ;

23\. les routes sont protégées ;

24\. les données sont protégées côté serveur ;

25\. la vue hiérarchique peut représenter l'organisation d'ADIKOM ;

26\. une personne peut être responsable de plusieurs départements ;

27\. le module est responsive ;

28\. les permissions sont cohérentes dans toute l'application.



\---



\# 62. Principe directeur



Le module Utilisateurs \& Groupes doit garantir que chaque personne dispose \*\*uniquement des accès nécessaires à sa fonction\*\*.



Le principe fondamental est :



\*\*Un utilisateur → une identité → des responsabilités → des permissions → des accès contrôlés.\*\*



Le système doit particulièrement respecter les principes suivants :



\*\*Le Super Admin contrôle les accès.\*\*



\*\*Les utilisateurs sont internes à ADIKOM.\*\*



\*\*Un utilisateur peut avoir plusieurs responsabilités.\*\*



\*\*Une personne ne doit pas avoir plusieurs comptes simplement parce qu'elle gère plusieurs départements.\*\*



\*\*Une permission doit être contrôlée côté serveur.\*\*



\*\*Une désactivation ne doit pas détruire l'historique.\*\*



\*\*Toute modification sensible doit être traçable.\*\*



ADIKOM PILOT doit ainsi fournir une gestion des accès suffisamment simple pour une petite structure tout en étant suffisamment robuste pour accompagner l'augmentation future de l'effectif et la complexification progressive de l'organisation.

