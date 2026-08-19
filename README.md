# ADIKOM PILOT

> SaaS interne de gestion et de pilotage d'ADIKOM Technology & Travel

---

## 1. Présentation

**ADIKOM PILOT** est une plateforme SaaS interne développée pour accompagner la gestion opérationnelle, administrative, financière et stratégique de **ADIKOM Technology & Travel**.

Le projet est développé progressivement selon une approche modulaire.

L'objectif n'est pas de construire immédiatement un ERP gigantesque, mais de commencer par le cœur opérationnel de l'activité actuelle :

# Gestion de location de véhicules

Une fois ce premier périmètre pleinement opérationnel, stable et validé par ADIKOM, les autres fonctionnalités seront développées progressivement.

---

## 2. Vision

ADIKOM PILOT doit devenir à terme le système central permettant à ADIKOM de :

- piloter ses activités ;
- gérer son parc automobile ;
- gérer les locations ;
- gérer ses clients ;
- gérer ses fournisseurs ;
- gérer ses partenariats ;
- suivre ses maintenances ;
- gérer ses factures ;
- suivre ses paiements ;
- gérer ses banques et caisses ;
- organiser ses projets ;
- gérer ses collaborateurs ;
- contrôler les permissions ;
- suivre les opérations ;
- disposer d'une traçabilité complète ;
- prendre des décisions à partir de données fiables.

Le SaaS doit être conçu dès le départ pour pouvoir évoluer progressivement sans devoir être entièrement reconstruit.

---

## 3. Nature du SaaS

ADIKOM PILOT est un **outil 100 % interne**.

Il ne s'agit pas d'une plateforme destinée au public.

Les clients, fournisseurs ou partenaires d'ADIKOM ne disposent pas de comptes utilisateurs dans le SaaS dans le périmètre actuel.

Les utilisateurs sont exclusivement des collaborateurs ou administrateurs autorisés d'ADIKOM.

---

## 4. Organisation ADIKOM

L'organigramme officiel validé constitue une référence importante pour la conception des rôles et des accès.

L'organisation comprend notamment :

- Gérant ;
- Assistant(e) de direction ;
- Administration & Finance ;
- Tourisme & Mobilité ;
- Support & Logistique ;
- Informatique & Services Technique ;
- Commercial & Développement.

Le système de permissions doit pouvoir accompagner cette organisation sans confondre automatiquement hiérarchie et droits d'accès.

---

## 5. Périmètre fonctionnel

Le SaaS est structuré autour des modules suivants :

1. Tableau de bord
2. Centre de notifications
3. Projets & Planification
4. Tiers
5. Gestion de location
6. Banques & Caisses
7. Facturation & Paiement
8. Utilisateurs & Groupes
9. Paramètres

Le développement doit respecter cette architecture fonctionnelle.

---

## 6. Module — Tableau de bord

Le Tableau de bord constitue le point de pilotage principal.

Il doit permettre d'afficher progressivement les indicateurs importants d'ADIKOM.

Il pourra notamment présenter :

- activité de location ;
- véhicules disponibles ;
- véhicules en location ;
- véhicules en maintenance ;
- réservations ;
- revenus ;
- factures ;
- paiements ;
- alertes ;
- échéances ;
- indicateurs financiers ;
- indicateurs opérationnels.

Le contenu du tableau de bord doit pouvoir être adapté au profil de l'utilisateur.

---

## 7. Module — Centre de notifications

Le Centre de notifications doit centraliser les événements nécessitant l'attention des utilisateurs.

Exemples :

- nouvelle réservation ;
- retour de véhicule ;
- maintenance ;
- véhicule indisponible ;
- facture à traiter ;
- paiement ;
- échéance ;
- document arrivant à expiration ;
- projet à suivre ;
- alerte importante.

Les notifications doivent respecter les permissions de l'utilisateur.

---

## 8. Module — Projets & Planification

Ce module est particulièrement important pour l'Assistant(e) de direction.

Il doit permettre de gérer :

- projets ;
- tâches ;
- échéances ;
- responsables ;
- priorités ;
- statuts ;
- calendrier ;
- planification ;
- suivi d'avancement ;
- rappels ;
- événements importants.

Le module doit permettre à la direction et à l'assistant(e) de direction d'avoir une vision claire des activités planifiées.

---

## 9. Module — Tiers

Le module Tiers comprend :

### Clients

- Nouveau client
- Liste des clients

### Fournisseurs

- Nouveau fournisseur
- Liste des fournisseurs

### Partenariats

- Nouveau partenariat
- Liste des partenariats

---

## 10. Gestion des tarifs préférentiels clients

Chaque client peut bénéficier de tarifs préférentiels.

Cette possibilité doit être prévue dès la création de la fiche client.

La fiche client doit donc pouvoir contenir des informations relatives aux conditions tarifaires qui lui sont applicables.

Le système doit permettre de distinguer :

- tarif standard ;
- tarif préférentiel ;
- conditions particulières ;
- période éventuelle d'application.

La modification de ces informations doit être contrôlée par permissions.

---

## 11. Module — Gestion de location

La Gestion de location constitue le **premier cœur fonctionnel du projet**.

Elle doit gérer le cycle complet d'une location.

Le système doit être conçu autour d'une logique permettant notamment :

Réservation

↓

Préparation du véhicule

↓

Départ

↓

Location en cours

↓

Retour

↓

Contrôle

↓

Clôture

Lorsqu'un incident est constaté, le processus doit pouvoir intégrer :

Incident

↓

Maintenance

↓

Coût

↓

Imputation éventuelle

↓

Facturation

↓

Paiement

---

## 12. Relation client — location

Une location doit pouvoir être reliée à :

- un client ;
- un véhicule ;
- une réservation ;
- une période ;
- un tarif ;
- des conditions particulières ;
- une facture ;
- un paiement.

Le système doit conserver les relations entre ces éléments.

---

## 13. Relation fournisseur — véhicule

Un fournisseur peut mettre un ou plusieurs véhicules à disposition d'ADIKOM.

La relation doit être :

Fournisseur → Véhicule

Un véhicule peut donc être identifié par rapport à son fournisseur.

Le système doit conserver l'historique lorsqu'un véhicule change de fournisseur.

---

## 14. Maintenance et imputation fournisseur

Une règle métier fondamentale d'ADIKOM concerne les maintenances des véhicules.

Exemple :

Un fournisseur A met une Toyota T5 à disposition d'ADIKOM pour :

**500 000 KMF**

La Toyota T5 est ensuite louée à un client.

Le véhicule tombe en panne.

ADIKOM réalise une réparation d'un coût de :

**300 000 KMF**

Selon les conditions applicables, ADIKOM peut déduire ces :

**300 000 KMF**

du montant dû au fournisseur.

La facture fournisseur devient alors :

**Montant brut : 500 000 KMF**

**Imputation maintenance : 300 000 KMF**

**Net à payer : 200 000 KMF**

---

## 15. Règle importante : imputation ≠ paiement

Une imputation fournisseur ne doit jamais être considérée comme un paiement.

Le système doit conserver séparément :

- montant brut de la facture ;
- montant des imputations ;
- montant net à payer ;
- paiements effectués ;
- solde restant.

Exemple :

Facture : 500 000 KMF

Imputation : 300 000 KMF

Paiement : 200 000 KMF

Solde : 0 KMF

---

## 16. Plusieurs imputations

Une facture fournisseur peut recevoir plusieurs imputations.

Exemple :

Facture : 1 000 000 KMF

Maintenance 1 : 300 000 KMF

Maintenance 2 : 200 000 KMF

Total imputé : 500 000 KMF

Net à payer : 500 000 KMF

Chaque imputation doit rester identifiable et traçable.

---

## 17. Module — Banques & Caisses

Le module comprend :

### Banques & Caisses

- Nouveau compte
- Liste
- Liste écritures
- Virement interne

Les opérations financières doivent être sécurisées et soumises aux permissions appropriées.

---

## 18. Module — Facturation & Paiement

### Factures clients

- Nouvelle facture
- Liste
- Règlements
- Statistiques
- Rapports

### Factures fournisseurs

- Nouvelle facture
- Liste
- Règlements
- Statistiques
- Rapports

### Paiements divers

Les données financières doivent rester cohérentes avec les modules :

- Tiers ;
- Gestion de location ;
- Maintenance ;
- Banques & Caisses.

---

## 19. Module — Utilisateurs & Groupes

Le module permet de gérer les utilisateurs internes d'ADIKOM.

### Utilisateurs

- Nouvel utilisateur
- Liste des utilisateurs
- Vue hiérarchique

### Groupes

- Nouveau groupe
- Liste des groupes

---

## 20. Fiche utilisateur

Lorsqu'un utilisateur est sélectionné dans la liste, sa page doit comporter deux onglets principaux :

### Utilisateur

Contient les informations relatives à l'employé :

- identité ;
- coordonnées ;
- fonction ;
- groupe ;
- statut ;
- informations professionnelles ;
- autres informations nécessaires.

### Permissions

Contient l'arborescence complète :

- modules ;
- menus ;
- sous-menus ;
- actions.

Cette structure est obligatoire dans la conception du module.

---

## 21. Super Admin

Le **Super Admin** est le niveau d'administration maximal.

Le Super Admin :

- possède l'accès complet au système ;
- crée les autres utilisateurs ;
- gère les groupes ;
- gère les permissions ;
- peut accéder aux paramètres sensibles ;
- peut consulter les données nécessaires au pilotage global ;
- peut consulter l'audit.

Dans le périmètre initial :

**Seul le Super Admin crée les autres utilisateurs.**

Un utilisateur ordinaire ne doit jamais pouvoir s'attribuer lui-même des permissions supplémentaires.

---

## 22. Permissions

Les permissions doivent suivre une structure :

Utilisateur

↓

Groupe

↓

Module

↓

Menu

↓

Sous-menu

↓

Action

Les actions peuvent notamment être :

- Voir ;
- Créer ;
- Modifier ;
- Valider ;
- Annuler ;
- Archiver ;
- Exporter ;
- Imprimer.

Les permissions doivent être vérifiées côté serveur.

Masquer un bouton dans l'interface ne constitue pas une protection suffisante.

---

## 23. Module — Paramètres

Le module Paramètres constitue la zone de configuration du SaaS.

Il comprendra notamment :

### Entreprise

Cette section doit permettre de gérer les informations générales nécessaires au fonctionnement d'ADIKOM PILOT.

Elle devra être conçue pour pouvoir évoluer avec les besoins futurs du SaaS.

Les paramètres sensibles doivent être protégés par permissions.

---

## 24. Audit et traçabilité

ADIKOM PILOT doit disposer d'une véritable logique d'audit.

Les opérations importantes doivent pouvoir répondre à :

**Qui a fait quoi ?**

**Quand ?**

**Sur quelle donnée ?**

**Quelle était la situation avant ?**

**Quelle est la situation après ?**

**Pourquoi, lorsque cela est nécessaire ?**

Les événements importants doivent être historisés.

---

## 25. Éléments à auditer

Selon leur importance :

- création ;
- modification ;
- validation ;
- annulation ;
- archivage ;
- paiement ;
- imputation ;
- changement de fournisseur ;
- changement de tarif ;
- changement de permission ;
- changement de statut ;
- opérations bancaires ;
- opérations sensibles.

Les actions du Super Admin doivent également être traçables.

---

## 26. Architecture documentaire du projet

Le projet est volontairement organisé simplement autour de deux grands dossiers.

ADIKOM-PILOT/

├── 00 Documentation/

├── 01 Développement/

├── CLAUDE.md

└── README.md

---

## 27. Dossier Documentation

Le dossier `00 Documentation` contient la documentation de référence du projet.

Structure actuelle :

00 Documentation/

├── 01_Vision_et_Objectifs/

├── 02_Architecture_Fonctionnelle/

├── 03_Modules/

├── 04_Workflows/

├── 05_Règles_Métier/

├── 06_Design/

└── 07_References/

---

## 28. Vision et objectifs

Le dossier :

`01_Vision_et_Objectifs/`

contient notamment :

- `01_Vision_ADIKOM_PILOT.md`
- `02_Objectifs.md`
- `03_Perimetre_MVP.md`

Ces fichiers définissent la vision générale et le périmètre initial du projet.

---

## 29. Architecture fonctionnelle

Le dossier :

`02_Architecture_Fonctionnelle/`

contient notamment :

- `01_Architecture_Globale.md`
- `02_Navigation.md`
- `03_Roles_et_Responsabilites.md`

Ces documents définissent l'organisation fonctionnelle générale du SaaS.

---

## 30. Modules

Le dossier :

`03_Modules/`

contient les spécifications détaillées des modules.

Modules actuellement définis :

- `01_Tableau_de_Bord.md`
- `02_Centre_de_Notifications.md`
- `03_Projets_et_Planification.md`
- `04_Tiers.md`
- `05_Gestion_de_Location.md`
- `06_Banques_et_Caisses.md`
- `07_Facturation_et_Paiement.md`
- `08_Utilisateurs_et_Groupes.md`
- `09_Parametres.md`

---

## 31. Workflows

Le dossier :

`04_Workflows/`

contient les workflows métier.

Il comprend notamment :

- `01_Cycle_Complet_d_une_Location.md`
- `02_Reservation.md`
- `03_Depart_du_Vehicule.md`
- `04_Retour_du_Vehicule.md`
- `05_Maintenance.md`
- `06_Imputation_Maintenance_Fournisseur.md`
- `07_Facturation.md`
- `08_Paiement.md`

Ces documents doivent être considérés comme des références pour l'implémentation des processus.

---

## 32. Règles métier

Le dossier :

`05_Règles_Métier/`

contient les règles métier détaillées.

Documents actuels :

- `01_Location.md`
- `02_Parc_Automobile.md`
- `03_Finance.md`
- `04_Fournisseurs.md`
- `05_Permissions.md`
- `06_Audit.md`

Ces documents sont prioritaires pour comprendre le comportement métier attendu.

---

## 33. Design

Le dossier :

`06_Design/`

contient les références visuelles officielles.

Il comprend notamment :

- `References_UI/`
- `Charte ADIKOM.png`
- `Design_System.md`
- `Logo OFFICIEL ADIKOM.png`
- `Logo OFFICIEL ADIKOM.svg`
- `Logo OFFICIEL ADIKOM.webp`

---

## 34. Règle absolue sur le logo

Le logo officiel ADIKOM est une ressource protégée du projet.

Il ne doit jamais être :

- recréé ;
- redessiné ;
- recoloré ;
- déformé ;
- étiré ;
- compressé ;
- modifié ;
- généré par IA ;
- remplacé par une approximation.

Le fichier officiel doit toujours être utilisé.

Lorsqu'il est placé sur un fond coloré, prévoir une zone blanche ou suffisamment claire derrière lui.

**Le conteneur s'adapte au logo. Le logo ne s'adapte jamais au conteneur.**

---

## 35. Références

Le dossier :

`07_References/`

contient les documents complémentaires permettant de comprendre le contexte du projet.

Il comprend notamment :

- `Fiches_de_Poste/`
- `References_Externes/`
- `ADIKOM_Organigramme_Organisationnel.pdf`

Les références externes peuvent servir d'inspiration ou de comparaison mais ne doivent pas remplacer les règles métier officielles d'ADIKOM.

---

## 36. Dossier Développement

Le dossier :

`01 Développement/`

est destiné au code source et aux éléments techniques du projet.

Le code doit être développé progressivement et proprement.

L'organisation technique peut évoluer selon les décisions d'architecture, mais elle doit rester cohérente avec la documentation du projet.

---

## 37. Méthode de développement

La méthode officielle de développement est :

**Claude Code → Supabase → GitHub → Vercel**

Le développement est réalisé avec **Claude Code**.

L'environnement **Antigravity** sert d'environnement de travail dans lequel le plugin Claude Code est intégré.

Il ne faut donc pas considérer Antigravity comme le moteur de développement principal.

La logique est :

**Antigravity**

→ environnement de travail

→ plugin Claude Code

→ développement avec Claude Code

→ Supabase

→ GitHub

→ Vercel

---

## 38. Claude Code

Claude Code est l'outil principal utilisé pour :

- analyser le projet ;
- lire la documentation ;
- concevoir ;
- coder ;
- modifier le code ;
- corriger les erreurs ;
- tester ;
- faire évoluer l'application.

Avant toute implémentation importante, Claude Code doit consulter les documents pertinents du dossier `00 Documentation`.

---

## 39. Rôle de CLAUDE.md

Le fichier :

`CLAUDE.md`

constitue une instruction globale destinée à Claude Code.

Il doit contenir les règles importantes concernant :

- architecture ;
- méthode de travail ;
- conventions ;
- sécurité ;
- documentation ;
- Git ;
- Supabase ;
- déploiement ;
- Design System ;
- règles à ne jamais enfreindre.

Le contenu de `CLAUDE.md` doit rester cohérent avec le présent README.

---

## 40. Supabase

Supabase constitue l'infrastructure de données et de services backend retenue pour le projet.

Il doit notamment être utilisé pour les besoins tels que :

- base de données ;
- authentification ;
- gestion des utilisateurs ;
- données métier ;
- stockage lorsque nécessaire ;
- services backend appropriés.

Les clés et secrets Supabase ne doivent jamais être inscrits dans :

- README.md ;
- CLAUDE.md ;
- code source ;
- documentation publique ;
- dépôt GitHub.

Ils doivent être stockés dans les variables d'environnement ou mécanismes secrets appropriés.

---

## 41. GitHub

Le projet est versionné sur GitHub.

### Dépôt

**ADIKOM-PILOT**

Le dépôt officiel du projet est celui défini par l'équipe de développement.

Le dépôt doit contenir le code source versionné et les fichiers nécessaires au projet.

Les secrets ne doivent jamais être commités.

---

## 42. Sécurité des secrets

Les informations suivantes sont considérées comme sensibles :

- tokens GitHub ;
- clés Supabase ;
- clés privées ;
- secrets d'authentification ;
- variables d'environnement sensibles ;
- credentials ;
- secrets de déploiement.

Ils ne doivent jamais être écrits directement dans le code.

Utiliser des variables d'environnement.

Exemple de noms de variables :

- `GITHUB_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Les valeurs réelles doivent rester hors du dépôt.

---

## 43. Vercel

Vercel constitue la cible de déploiement du SaaS.

Le déploiement doit être connecté au dépôt GitHub.

Flux prévu :

Claude Code

↓

Code source

↓

GitHub

↓

Vercel

↓

ADIKOM PILOT

---

## 44. Développement progressif

Le développement doit être réalisé par étapes.

Priorité :

**fonctionnement réel > stabilité > sécurité > qualité > esthétique secondaire**

Ne pas développer simultanément tous les modules.

---

## 45. Priorité MVP

La première priorité est :

# Gestion de location

Le premier MVP doit permettre de construire un cycle réellement opérationnel avant d'étendre massivement le système.

Les modules périphériques doivent être développés progressivement autour de ce cœur.

---

## 46. Principe de non-surconstruction

Ne pas ajouter automatiquement des fonctionnalités simplement parce qu'elles sont techniquement possibles.

Chaque fonctionnalité doit répondre à :

- un besoin métier ;
- une règle documentée ;
- un workflow ;
- une utilité réelle.

---

## 47. Documentation avant implémentation

Lorsqu'une fonctionnalité est développée, Claude Code doit consulter en priorité :

1. Vision et objectifs ;
2. Architecture fonctionnelle ;
3. Module concerné ;
4. Workflow concerné ;
5. Règles métier concernées ;
6. Design System.

La documentation est la source de vérité fonctionnelle.

---

## 48. Gestion des incohérences

Si Claude Code détecte une contradiction entre plusieurs documents, il ne doit pas inventer silencieusement une solution.

Il doit :

1. identifier la contradiction ;
2. rechercher la règle la plus récente ou la plus spécifique ;
3. signaler l'incohérence ;
4. demander une décision lorsque nécessaire ;
5. documenter la décision retenue.

---

## 49. Design avant code

Avant de créer une nouvelle interface importante, vérifier :

- module concerné ;
- workflow ;
- données nécessaires ;
- permissions ;
- Design System ;
- responsive ;
- états ;
- erreurs ;
- états vides ;
- chargement ;
- succès ;
- actions sensibles.

---

## 50. Responsive obligatoire

ADIKOM PILOT doit être responsive.

Chaque nouvelle interface doit être pensée pour :

- desktop ;
- tablette ;
- mobile.

Une interface ne doit pas être considérée comme terminée si elle fonctionne uniquement sur desktop.

---

## 51. Sidebar

La sidebar doit être rétractable.

Elle doit pouvoir fonctionner en :

### Mode développé

Icônes + textes.

### Mode rétracté

Icônes principalement.

Le comportement doit rester fluide et cohérent.

---

## 52. Architecture UI

Privilégier les composants réutilisables.

Exemples :

- boutons ;
- champs ;
- tableaux ;
- badges ;
- cartes ;
- modales ;
- onglets ;
- notifications ;
- filtres ;
- barres de recherche ;
- layouts ;
- navigation.

Éviter de recréer plusieurs versions presque identiques d'un même composant.

---

## 53. Qualité du code

Le code doit être :

- lisible ;
- maintenable ;
- modulaire ;
- sécurisé ;
- documenté lorsque nécessaire ;
- cohérent ;
- réutilisable.

Éviter les solutions temporaires qui deviennent ensuite la base définitive du système.

---

## 54. Base de données

Les données doivent être conçues autour des relations métier réelles.

Exemples :

**Client → Location → Véhicule**

**Fournisseur → Véhicule**

**Location → Incident → Maintenance**

**Maintenance → Imputation**

**Fournisseur → Facture → Paiement**

**Utilisateur → Groupe → Permissions**

Les relations doivent rester cohérentes entre les modules.

---

## 55. Intégrité des données

Ne jamais résoudre un problème d'interface en contournant les règles métier de la base de données.

Les règles importantes doivent être protégées côté backend et/ou base de données lorsque pertinent.

---

## 56. Permissions côté serveur

Toutes les actions sensibles doivent être contrôlées côté serveur.

Exemples :

- modification d'un tarif ;
- paiement ;
- imputation ;
- changement de permission ;
- modification d'un compte bancaire ;
- validation d'une facture.

---

## 57. Audit

Les opérations importantes doivent être journalisées.

Le système doit pouvoir déterminer :

**Qui ?**

**Quoi ?**

**Quand ?**

**Sur quelle donnée ?**

**Avant / après lorsque nécessaire ?**

---

## 58. Gestion des erreurs

Les erreurs doivent être :

- compréhensibles ;
- utiles ;
- sécurisées ;
- non techniques pour l'utilisateur final lorsque cela n'est pas nécessaire.

Les informations sensibles ou techniques ne doivent pas être exposées inutilement.

---

## 59. Tests

Chaque fonctionnalité importante doit être testée.

Tester notamment :

- fonctionnement normal ;
- données invalides ;
- permissions ;
- erreurs ;
- cas limites ;
- responsive ;
- sécurité ;
- cohérence des données.

---

## 60. Validation fonctionnelle

Une fonctionnalité n'est pas considérée comme terminée uniquement parce que le code compile.

Elle doit :

1. fonctionner ;
2. respecter le workflow ;
3. respecter les règles métier ;
4. respecter les permissions ;
5. respecter le Design System ;
6. fonctionner en responsive ;
7. gérer les erreurs ;
8. conserver la cohérence des données.

---

## 61. Git

Les modifications doivent être versionnées proprement.

Les commits doivent être compréhensibles.

Éviter les commits contenant des secrets ou des fichiers inutiles.

Avant un push :

- vérifier les fichiers modifiés ;
- vérifier les secrets ;
- vérifier le build ;
- vérifier les erreurs importantes.

---

## 62. Déploiement

Le flux de déploiement prévu est :

Développement local

↓

Tests

↓

Git

↓

GitHub

↓

Vercel

Les variables d'environnement nécessaires doivent être configurées dans l'environnement approprié.

---

## 63. Environnements

Le projet doit pouvoir distinguer au minimum :

- développement ;
- production.

Si un environnement de staging/test est ajouté, il devra être clairement identifié.

Les données de production ne doivent pas être manipulées directement pendant le développement sans procédure appropriée.

---

## 64. Données sensibles

ADIKOM PILOT manipule potentiellement :

- données clients ;
- données fournisseurs ;
- données financières ;
- données employés ;
- données bancaires ;
- informations contractuelles ;
- informations commerciales.

La sécurité et la confidentialité doivent donc être considérées comme des exigences fondamentales.

---

## 65. Règle concernant les données clients

Les clients ne sont pas des utilisateurs du SaaS dans le périmètre actuel.

Une fiche client est une donnée métier interne.

Ne pas créer de système de connexion client sans décision fonctionnelle explicite.

---

## 66. Règle concernant les fournisseurs

Les fournisseurs ne sont pas des utilisateurs du SaaS dans le périmètre actuel.

Ils sont gérés comme des tiers internes à travers leur fiche fournisseur.

---

## 67. Règle concernant les partenaires

Les partenaires sont gérés dans le module Tiers.

Ils ne disposent pas automatiquement d'un compte utilisateur.

---

## 68. Évolution future

ADIKOM PILOT pourra évoluer vers d'autres modules après validation du MVP de gestion de location.

Le système doit donc être conçu de manière extensible.

Cependant, ne pas implémenter prématurément les fonctionnalités futures sans validation.

---

## 69. Règle de développement

Avant toute nouvelle fonctionnalité :

**Lire → Comprendre → Vérifier les règles → Concevoir → Développer → Tester → Documenter → Versionner**

Ne pas :

**Coder → improviser → corriger les incohérences après coup.**

---

## 70. Checklist Claude Code

Avant chaque développement important :

- [ ] Lire les documents concernés.
- [ ] Identifier le module.
- [ ] Identifier le workflow.
- [ ] Identifier les règles métier.
- [ ] Identifier les permissions.
- [ ] Vérifier le Design System.
- [ ] Vérifier les relations de données.
- [ ] Prévoir les états d'erreur.
- [ ] Prévoir les états vides.
- [ ] Prévoir les états de chargement.
- [ ] Prévoir le responsive.
- [ ] Prévoir l'audit si nécessaire.
- [ ] Vérifier la sécurité.
- [ ] Tester.
- [ ] Vérifier le build.
- [ ] Versionner proprement.

---

## 71. Règles absolues

Les règles suivantes doivent toujours être respectées :

1. ADIKOM PILOT est un SaaS interne.
2. Le développement est réalisé avec Claude Code.
3. Antigravity est l'environnement de travail avec le plugin Claude Code intégré.
4. Supabase est utilisé pour l'infrastructure backend/données prévue.
5. GitHub est utilisé pour le versionnement.
6. Vercel est utilisé pour le déploiement.
7. Les secrets ne doivent jamais être commités.
8. Le Super Admin possède l'accès complet.
9. Seul le Super Admin crée les utilisateurs dans le MVP.
10. Les permissions doivent être contrôlées côté serveur.
11. Le SaaS doit être responsive.
12. La sidebar doit être rétractable.
13. Le logo officiel ADIKOM ne doit jamais être transformé.
14. Le logo doit toujours être lisible.
15. Une zone blanche ou claire doit être prévue derrière le logo lorsque le fond ne permet pas une bonne lisibilité.
16. Les règles métier documentées doivent être respectées.
17. Les opérations sensibles doivent être auditables.
18. Les données historiques importantes ne doivent pas être détruites.
19. Les clients et fournisseurs ne sont pas des utilisateurs du SaaS.
20. La gestion de location constitue la priorité du MVP.
21. Les fonctionnalités futures ne doivent pas être développées prématurément sans validation.
22. Toute contradiction documentaire doit être signalée plutôt que résolue silencieusement.
23. L'interface doit rester professionnelle, moderne, claire et cohérente avec ADIKOM.
24. Le code doit être maintenable et évolutif.

---

## 72. État du projet

### Phase actuelle

**Préparation / spécification complète du projet**

Les éléments suivants sont en cours de structuration :

- vision ;
- objectifs ;
- architecture fonctionnelle ;
- modules ;
- workflows ;
- règles métier ;
- Design System ;
- références ;
- architecture technique.

La prochaine phase consiste à transformer cette documentation en architecture technique puis en application fonctionnelle.

---

## 73. Ordre recommandé de développement

L'ordre général recommandé est :

### Phase 1 — Fondation technique

- architecture ;
- projet ;
- Supabase ;
- authentification ;
- système de permissions ;
- structure UI ;
- navigation ;
- Design System.

### Phase 2 — Gestion de location

- parc automobile ;
- clients ;
- fournisseurs ;
- réservations ;
- départ ;
- retour ;
- maintenance ;
- imputation ;
- facturation ;
- paiement.

### Phase 3 — Pilotage

- Tableau de bord ;
- Centre de notifications ;
- statistiques ;
- rapports.

### Phase 4 — Organisation

- Projets & Planification ;
- utilisateurs ;
- groupes ;
- permissions ;
- paramètres.

### Phase 5 — Extensions

Développement progressif des fonctionnalités supplémentaires validées par ADIKOM.

---

## 74. Objectif final

ADIKOM PILOT doit devenir un véritable outil de pilotage interne et non simplement une collection de pages CRUD.

Chaque module doit contribuer à une vision globale de l'entreprise.

La logique cible est :

ADIKOM PILOT

├── PILOTAGE
│   ├── Tableau de bord
│   ├── Notifications
│   ├── Projets
│   └── Planification
│
├── OPÉRATIONS
│   ├── Gestion de location
│   ├── Parc automobile
│   ├── Maintenance
│   └── Tiers
│
├── FINANCE
│   ├── Facturation
│   ├── Paiements
│   └── Banques & Caisses
│
└── GOUVERNANCE
    ├── Utilisateurs & Groupes
    ├── Permissions
    ├── Audit
    └── Paramètres

---

## 75. Principe directeur

ADIKOM PILOT doit permettre à ADIKOM de passer d'une gestion dispersée à une gestion centralisée, structurée et pilotable.

Le système doit permettre à la direction de comprendre rapidement :

**Ce qui se passe.**

**Ce qui doit être fait.**

**Qui doit le faire.**

**Ce qui coûte.**

**Ce qui rapporte.**

**Ce qui nécessite une décision.**

**Ce qui présente un risque.**

Et surtout :

# Chaque donnée doit servir une décision ou une opération.

---

## ADIKOM PILOT

**SaaS interne de gestion et de pilotage**

**ADIKOM Technology & Travel**

> Concevoir d'abord le bon système.
> Construire ensuite le bon logiciel.