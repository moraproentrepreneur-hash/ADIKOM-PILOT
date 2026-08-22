\# CLAUDE.md — ADIKOM PILOT



\## 1. Rôle de ce fichier



Tu es \*\*Claude Code\*\*, l'agent principal chargé du développement de \*\*ADIKOM PILOT\*\*.



Ce fichier contient les règles générales que tu dois respecter pendant toute la durée du développement.



ADIKOM PILOT est un projet réel destiné à \*\*ADIKOM Technology \& Travel\*\*.



Tu dois considérer la documentation présente dans `00 Documentation/` comme la référence fonctionnelle du projet.



\---



\# 2. Règle fondamentale



Avant de développer une fonctionnalité importante :



\*\*Lire → Comprendre → Vérifier → Concevoir → Développer → Tester → Vérifier → Documenter → Versionner\*\*



Ne commence jamais par coder sans avoir compris le besoin fonctionnel concerné.



\---



\# 3. Architecture générale du projet



Le projet est organisé volontairement autour de deux grands dossiers :



&#x20;   ADIKOM-PILOT/

&#x20;   │

&#x20;   ├── 00 Documentation/

&#x20;   │

&#x20;   ├── 01\_Developpement/

&#x20;   │

&#x20;   ├── CLAUDE.md

&#x20;   │

&#x20;   └── README.md



\---



\# 4. Documentation



Le dossier `00 Documentation/` est la source de vérité fonctionnelle du projet.



Il contient notamment :



&#x20;   00 Documentation/

&#x20;   │

&#x20;   ├── 01\_Vision\_et\_Objectifs/

&#x20;   ├── 02\_Architecture\_Fonctionnelle/

&#x20;   ├── 03\_Modules/

&#x20;   ├── 04\_Workflows/

&#x20;   ├── 05\_Règles\_Métier/

&#x20;   ├── 06\_Design/

&#x20;   └── 07\_References/



Avant de développer une fonctionnalité, consulte les documents correspondant à son périmètre.



\---



\# 5. Priorité des sources



Lorsque tu dois comprendre une fonctionnalité, consulte dans cet ordre :



1\. Le fichier concerné dans `01\_Vision\_et\_Objectifs/`

2\. Le fichier concerné dans `02\_Architecture\_Fonctionnelle/`

3\. Le module concerné dans `03\_Modules/`

4\. Le workflow concerné dans `04\_Workflows/`

5\. Les règles métier concernées dans `05\_Règles\_Métier/`

6\. Le Design System dans `06\_Design/`

7\. Les références complémentaires dans `07\_References/`



La documentation spécifique au sujet traité est prioritaire sur les suppositions générales.



\---



\# 6. Gestion des contradictions



Si deux documents semblent contradictoires :



\- ne choisis pas silencieusement une solution ;

\- n'invente pas une règle ;

\- identifie précisément la contradiction ;

\- vérifie si une règle plus récente ou plus spécifique existe ;

\- si nécessaire, demande une décision avant d'implémenter ;

\- une fois la décision prise, documente-la.



\---



\# 7. Nature du SaaS



ADIKOM PILOT est un :



\*\*SaaS 100 % interne.\*\*



Les utilisateurs du système sont des collaborateurs et administrateurs autorisés d'ADIKOM.



Les clients, fournisseurs et partenaires ne sont pas des utilisateurs du SaaS dans le périmètre actuel.



Ils sont enregistrés comme données métier internes.



Ne crée aucun espace de connexion client, fournisseur ou partenaire sans décision fonctionnelle explicite.



\---



\# 8. Vision



ADIKOM PILOT doit progressivement devenir le système central de gestion et de pilotage d'ADIKOM.



Il doit permettre notamment de gérer :



\- l'activité de location ;

\- le parc automobile ;

\- les clients ;

\- les fournisseurs ;

\- les partenariats ;

\- les maintenances ;

\- les factures ;

\- les paiements ;

\- les banques et caisses ;

\- les projets ;

\- la planification ;

\- les utilisateurs ;

\- les groupes ;

\- les permissions ;

\- les paramètres ;

\- les notifications ;

\- l'audit ;

\- les indicateurs de pilotage.



\---



\# 9. Priorité actuelle : Gestion de location



La première priorité du projet est :



\*\*Gestion de location de véhicules.\*\*



Ne développe pas immédiatement tous les modules de manière approfondie.



Le système doit d'abord permettre de construire un cœur de gestion de location réellement opérationnel, stable, sécurisé et cohérent.



Les autres modules doivent progressivement accompagner ce cœur.



\---



\# 10. Modules du SaaS



Les modules définis sont :



1\. Tableau de bord

2\. Centre de notifications

3\. Projets \& Planification

4\. Tiers

5\. Gestion de location

6\. Banques \& Caisses

7\. Facturation \& Paiement

8\. Utilisateurs \& Groupes

9\. Paramètres



Respecte cette architecture.



Ne crée pas de module supplémentaire sans justification fonctionnelle.



\---



\# 11. Gestion de location



La gestion de location constitue le premier cœur opérationnel.



Le cycle doit pouvoir couvrir :



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



Lorsqu'un incident survient :



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



Les relations entre ces éléments doivent être conservées dans les données.



\---



\# 12. Relation Client / Location



Une location doit pouvoir être liée à :



\- un client ;

\- un véhicule ;

\- une réservation ;

\- une période ;

\- un tarif ;

\- des conditions particulières ;

\- une facture ;

\- un paiement.



\---



\# 13. Tarifs préférentiels clients



Chaque client peut bénéficier de tarifs préférentiels.



Cette possibilité doit être prévue dès la création du client et rester accessible depuis sa fiche.



Prévoir notamment :



\- tarif standard ;

\- tarif préférentiel ;

\- conditions particulières ;

\- période d'application lorsque nécessaire.



Les tarifs préférentiels doivent pouvoir être utilisés correctement lors de la création d'une location.



Toute modification sensible doit respecter les permissions.



\---



\# 14. Relation Fournisseur / Véhicule



Un fournisseur peut mettre un ou plusieurs véhicules à disposition d'ADIKOM.



La relation principale est :



\*\*Fournisseur → Véhicule\*\*



Le véhicule doit pouvoir être identifié par rapport à son fournisseur.



L'historique des changements importants doit être conservé.



\---



\# 15. Maintenance fournisseur



Une règle métier fondamentale concerne les maintenances des véhicules appartenant ou étant fournis par des fournisseurs.



Exemple :



Fournisseur A



Véhicule Toyota T5



Montant fournisseur :



500 000 KMF



Le véhicule tombe en panne pendant son exploitation.



ADIKOM réalise une réparation :



300 000 KMF



ADIKOM peut alors imputer ces 300 000 KMF sur la facture du fournisseur selon les conditions applicables.



Résultat :



Montant brut :



500 000 KMF



Imputation maintenance :



300 000 KMF



Net à payer :



200 000 KMF



\---



\# 16. Règle critique : imputation ≠ paiement



Une imputation de maintenance ne constitue pas un paiement.



Le système doit conserver séparément :



\- montant brut de la facture ;

\- montant total imputé ;

\- détail de chaque imputation ;

\- montant net à payer ;

\- paiements réellement effectués ;

\- solde restant.



Une facture peut recevoir plusieurs imputations.



Exemple :



Facture fournisseur :



1 000 000 KMF



Maintenance 1 :



300 000 KMF



Maintenance 2 :



200 000 KMF



Total imputé :



500 000 KMF



Net à payer :



500 000 KMF



Chaque imputation doit rester identifiable et traçable.



\---



\# 17. Utilisateurs et permissions



Le système doit disposer d'une gestion des utilisateurs internes.



Structure :



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



Les actions peuvent inclure :



\- Voir ;

\- Créer ;

\- Modifier ;

\- Valider ;

\- Annuler ;

\- Archiver ;

\- Exporter ;

\- Imprimer.



\---



\# 18. Super Admin



Le \*\*Super Admin\*\* dispose de l'accès complet au système.



Il peut notamment :



\- accéder à tous les modules ;

\- créer les utilisateurs ;

\- gérer les groupes ;

\- gérer les permissions ;

\- accéder aux paramètres sensibles ;

\- consulter les données globales ;

\- consulter les éléments d'audit.



Dans le périmètre initial :



\*\*Seul le Super Admin crée les autres utilisateurs.\*\*



Un utilisateur ne doit jamais pouvoir s'attribuer lui-même des permissions supplémentaires.



\---



\# 19. Permissions côté serveur



Les permissions ne doivent jamais être uniquement gérées par l'interface.



Masquer un bouton ne constitue pas une protection.



Les opérations sensibles doivent être vérifiées côté serveur.



Exemples :



\- modification d'un tarif ;

\- modification d'une permission ;

\- paiement ;

\- imputation ;

\- validation d'une facture ;

\- modification d'un compte bancaire ;

\- opérations sensibles.



\---



\# 19 bis. Attribution indépendante des capacités



\*\*Règle permanente (DEC-024).\*\*



> Aucune fonctionnalité contrôlable par utilisateur ne doit être implicitement autorisée par une autre permission lorsqu'elle peut raisonnablement faire l'objet d'une attribution indépendante.



Consulter, exporter, télécharger et imprimer sont des capacités distinctes.



Un utilisateur peut légitimement recevoir le droit de consulter une liste et de l'exporter, sans celui d'en produire un document PDF ni de l'imprimer.



Ne considère donc jamais qu'une capacité transversale est incluse dans « voir ».



\## Avant toute nouvelle fonctionnalité



Pose la question :



\*\*« Cette fonctionnalité doit-elle pouvoir être attribuée séparément à un utilisateur ? »\*\*



Si oui, applique les six étapes :



1\. identifier la permission existante qui couvre l'action ;

2\. si aucune ne la couvre, proposer une nouvelle permission — sans la créer d'office ;

3\. l'ajouter au catalogue après validation ;

4\. l'utiliser côté interface ;

5\. la contrôler côté serveur — action serveur ET route/API ;

6\. ajouter les tests de sécurité, positifs et négatifs.



\## Ne pas surcharger le catalogue



Une permission ne se crée que si la fonctionnalité correspondante existe réellement ou est explicitement prévue.



Le catalogue représente les capacités réelles du SaaS, pas celles qu'un modèle général rendrait imaginables.



Ne crée donc pas `.delete`, `.approve`, `.send` ou `.generate` pour un module qui ne les propose pas.



\## Convention



\*\*domaine.ressource.action\*\*, avec un niveau supplémentaire lorsqu'un sous-menu existe :



`parties.clients.view` · `parties.clients.export` · `parties.clients.download` · `parties.clients.print`



`parties.clients.pricing.manage`



Ne modifie jamais un code existant : il peut être attribué à des utilisateurs.



\---



\# 20. Fiche utilisateur



Lorsqu'un utilisateur est sélectionné dans la liste, sa page doit comporter deux onglets :



\### Utilisateur



Informations relatives à l'employé.



\### Permissions



Arborescence complète :



\- modules ;

\- menus ;

\- sous-menus ;

\- actions.



Cette structure doit être respectée.



\---



\# 21. Audit



Les opérations importantes doivent être traçables.



Le système doit permettre de répondre à :



\*\*Qui ?\*\*



\*\*Quoi ?\*\*



\*\*Quand ?\*\*



\*\*Sur quelle donnée ?\*\*



\*\*Avant ?\*\*



\*\*Après ?\*\*



Lorsque cela est pertinent.



Les actions sensibles doivent être journalisées.



\---



\# 22. Données historiques



Ne détruis pas inutilement les données historiques.



Lorsqu'une donnée métier importante doit être supprimée fonctionnellement, privilégier lorsque nécessaire :



\- désactivation ;

\- archivage ;

\- statut ;

\- soft delete.



La suppression définitive doit être réservée aux cas où elle est réellement justifiée.



\---



\# 23. Architecture technique



La méthode de développement prévue est :



\*\*Claude Code → Supabase → GitHub → Vercel\*\*



Antigravity est l'environnement de travail dans lequel le plugin Claude Code est utilisé.



Antigravity n'est pas considéré comme le moteur de développement principal.



Claude Code est l'agent principal chargé du développement.



\---



\# 24. Supabase



Supabase constitue l'infrastructure backend et données du projet.



Il peut notamment être utilisé pour :



\- base de données ;

\- authentification ;

\- gestion des utilisateurs ;

\- données métier ;

\- stockage ;

\- services backend nécessaires.



Ne jamais exposer de secrets Supabase dans le code.



\---



\# 25. Secrets et variables d'environnement



Les secrets ne doivent jamais être écrits directement dans :



\- code source ;

\- README.md ;

\- CLAUDE.md ;

\- documentation ;

\- commits Git ;

\- dépôt GitHub.



Utiliser des variables d'environnement.



Exemples de variables :



`SUPABASE\_URL`



`SUPABASE\_ANON\_KEY`



`SUPABASE\_SERVICE\_ROLE\_KEY`



`GITHUB\_TOKEN`



Les valeurs réelles doivent rester secrètes.



Si un secret apparaît accidentellement dans le code ou la documentation, il doit être immédiatement signalé et retiré.



\---



\# 26. GitHub



Le dépôt du projet est :



\*\*ADIKOM-PILOT\*\*



Le code doit être versionné proprement.



Avant un push :



\- vérifier les fichiers modifiés ;

\- vérifier les secrets ;

\- vérifier le build ;

\- vérifier les erreurs ;

\- vérifier que les fichiers sensibles ne sont pas inclus.



Ne jamais pousser de secrets.



\---



\# 27. Vercel



Vercel constitue la cible de déploiement.



Flux :



Claude Code



↓



Code source



↓



GitHub



↓



Vercel



↓



ADIKOM PILOT



Les variables d'environnement doivent être configurées dans les environnements appropriés.



\---



\# 28. Développement progressif



Ne cherche pas à tout construire immédiatement.



Privilégie :



\*\*fonctionnement réel > stabilité > sécurité > cohérence métier > qualité du code > esthétique\*\*



Chaque fonctionnalité doit être réellement fonctionnelle avant de considérer son développement terminé.



\---



\# 29. Non-surconstruction



N'ajoute pas une fonctionnalité simplement parce qu'elle est techniquement intéressante.



Chaque fonctionnalité doit répondre à au moins un besoin réel :



\- métier ;

\- opérationnel ;

\- administratif ;

\- financier ;

\- décisionnel ;

\- sécurité ;

\- audit.



\---



\# 30. Architecture de données



Les relations métier doivent être représentées correctement.



Exemples :



\*\*Client → Location → Véhicule\*\*



\*\*Fournisseur → Véhicule\*\*



\*\*Location → Incident → Maintenance\*\*



\*\*Maintenance → Imputation\*\*



\*\*Fournisseur → Facture → Imputation → Paiement\*\*



\*\*Utilisateur → Groupe → Permissions\*\*



Ne contourne pas les relations métier pour simplifier artificiellement l'implémentation.



\---



\# 31. Intégrité des données



Les données doivent rester cohérentes entre les modules.



Exemple :



Une location ne doit pas simplement afficher un montant indépendant.



Elle doit pouvoir être reliée aux données pertinentes :



\- client ;

\- véhicule ;

\- tarif ;

\- période ;

\- facture ;

\- règlement.



De même, une maintenance imputée à un fournisseur doit pouvoir être reliée à :



\- véhicule ;

\- maintenance ;

\- fournisseur ;

\- facture fournisseur ;

\- imputation ;

\- montant ;

\- historique.



\---



\# 32. Design System



Le Design System officiel se trouve dans :



`00 Documentation/06\_Design/Design\_System.md`



Il doit être consulté avant toute conception d'interface importante.



L'interface doit rester :



\- professionnelle ;

\- moderne ;

\- claire ;

\- cohérente ;

\- sobre ;

\- responsive.



\---



\# 33. Logo ADIKOM — RÈGLE ABSOLUE



Le logo officiel ADIKOM est fourni dans le dossier Design.



Il est strictement interdit de :



\- recréer le logo ;

\- redessiner le logo ;

\- modifier ses proportions ;

\- modifier ses couleurs ;

\- changer sa forme ;

\- changer sa typographie ;

\- l'étirer ;

\- l'écraser ;

\- le recolorer ;

\- lui ajouter des effets ;

\- le générer avec une IA ;

\- créer une approximation.



\*\*Utilise toujours le fichier officiel fourni.\*\*



Le logo doit rester exactement conforme à la source.



\---



\# 34. Lisibilité du logo



Le logo doit toujours être parfaitement visible.



Lorsqu'il est placé sur :



\- un fond bleu ;

\- un fond coloré ;

\- une image ;

\- une section sombre ;



prévoir une zone blanche ou suffisamment claire derrière le logo.



\*\*Le conteneur doit s'adapter au logo.\*\*



\*\*Le logo ne doit jamais être modifié pour s'adapter au conteneur.\*\*



Le logo doit également disposer d'un espace de respiration suffisant.



\---



\# 35. Responsive



ADIKOM PILOT doit être 100 % responsive.



Les interfaces doivent fonctionner sur :



\- desktop ;

\- tablette ;

\- mobile.



Ne réduis pas simplement l'interface desktop pour obtenir une version mobile.



Réorganise les composants lorsque nécessaire.



\---



\# 36. Sidebar



La barre latérale doit être rétractable.



\### Mode développé



Afficher :



\- icônes ;

\- noms des modules ;

\- menus ;

\- sous-menus.



\### Mode rétracté



Afficher principalement :



\- icônes ;

\- éléments essentiels.



Le comportement doit être fluide.



Le logo doit rester correctement affiché dans les deux états sans être déformé.



\---



\# 37. Composants réutilisables



Privilégie une architecture de composants réutilisables.



Exemples :



\- boutons ;

\- champs ;

\- tableaux ;

\- cartes ;

\- badges ;

\- modales ;

\- onglets ;

\- filtres ;

\- notifications ;

\- recherches ;

\- layouts ;

\- navigation.



Ne recrée pas plusieurs composants presque identiques lorsqu'un composant générique peut être utilisé.



\---



\# 38. États UI obligatoires



Les interfaces importantes doivent prévoir :



\- état normal ;

\- chargement ;

\- succès ;

\- erreur ;

\- état vide ;

\- état désactivé ;

\- état de permission insuffisante lorsque pertinent.



Ne considère pas une page comme terminée si seul le scénario idéal fonctionne.



\---



\# 39. Formulaires



Les formulaires doivent être :



\- structurés ;

\- lisibles ;

\- organisés par sections ;

\- adaptés au responsive ;

\- correctement validés.



Les erreurs doivent être compréhensibles et affichées au niveau du champ concerné lorsque possible.



\---



\# 40. Tableaux



Les tableaux doivent être :



\- lisibles ;

\- structurés ;

\- filtrables lorsque nécessaire ;

\- recherchables lorsque nécessaire ;

\- responsifs ;

\- cohérents avec le Design System.



Les actions doivent être clairement identifiables.



\---



\# 41. Dashboard



Le dashboard doit être utile à la décision.



Ne crée pas de graphiques décoratifs sans valeur.



Privilégie :



\- KPI ;

\- alertes ;

\- tendances ;

\- activité ;

\- échéances ;

\- indicateurs opérationnels ;

\- indicateurs financiers.



\---



\# 42. Notifications



Le Centre de notifications doit distinguer notamment :



\- information ;

\- rappel ;

\- avertissement ;

\- urgence.



Les notifications doivent respecter les permissions de l'utilisateur.



\---



\# 43. Gestion des erreurs



Les erreurs affichées à l'utilisateur doivent être :



\- compréhensibles ;

\- utiles ;

\- non techniques lorsque possible ;

\- sécurisées.



Ne révèle jamais inutilement :



\- secrets ;

\- clés ;

\- stack traces ;

\- informations internes ;

\- détails sensibles de la base de données.



\---



\# 44. Sécurité



La sécurité doit être considérée dès la conception.



Ne jamais faire confiance uniquement aux contrôles du frontend.



Vérifier les permissions côté serveur.



Protéger :



\- authentification ;

\- autorisations ;

\- données sensibles ;

\- opérations financières ;

\- permissions ;

\- secrets ;

\- données personnelles.



\---



\# 45. Authentification



Les utilisateurs internes doivent être authentifiés avant d'accéder au SaaS.



Les accès doivent être contrôlés en fonction de leur rôle et de leurs permissions.



Ne crée pas de système d'authentification public pour les clients ou fournisseurs sans décision explicite.



\---



\# 46. Audit des actions sensibles



Les actions sensibles doivent pouvoir être auditées.



Exemples :



\- création d'utilisateur ;

\- modification de permission ;

\- modification d'un tarif ;

\- imputation d'une maintenance ;

\- validation d'une facture ;

\- paiement ;

\- modification d'un compte bancaire ;

\- suppression ou archivage d'une donnée importante.



\---



\# 47. Tests



Chaque fonctionnalité importante doit être testée.



Tester notamment :



\- scénario normal ;

\- données invalides ;

\- permissions ;

\- erreurs ;

\- cas limites ;

\- responsive ;

\- sécurité ;

\- cohérence des données.



Une fonctionnalité n'est pas terminée simplement parce que le code compile.



\---



\# 48. Validation avant livraison



Avant de considérer une fonctionnalité comme terminée, vérifie :



\- fonctionnement ;

\- règles métier ;

\- permissions ;

\- sécurité ;

\- données ;

\- responsive ;

\- Design System ;

\- états UI ;

\- erreurs ;

\- audit si nécessaire ;

\- build.



\---



\# 49. Git et commits



Les commits doivent être clairs et compréhensibles.



Évite les commits du type :



\- `fix`

\- `update`

\- `test`

\- `changes`



Privilégie des messages décrivant réellement le changement.



Exemple :



`feat: add vehicle reservation workflow`



ou :



`fix: prevent double booking for unavailable vehicle`



\---



\# 50. Avant chaque commit



Vérifier :



\- les fichiers modifiés ;

\- les fichiers ajoutés ;

\- les fichiers supprimés ;

\- les secrets ;

\- les erreurs ;

\- le build ;

\- les tests pertinents.



Ne committe jamais un fichier contenant un secret.



\---



\# 51. Avant chaque push



Vérifier :



\- état Git ;

\- secrets ;

\- build ;

\- tests ;

\- fichiers inutiles ;

\- changements inattendus.



Le push doit être volontaire.



\---



\# 52. Ne pas modifier la documentation sans raison



La documentation fonctionnelle ne doit pas être modifiée simplement pour justifier une implémentation.



Si l'implémentation révèle une incohérence :



1\. signale-la ;

2\. propose une solution ;

3\. demande validation si nécessaire ;

4\. puis mets à jour la documentation.



\---



\# 53. Principe de traçabilité



Toute décision métier importante doit pouvoir être retrouvée.



Évite les décisions importantes uniquement présentes dans le code.



Lorsque nécessaire, documente la règle dans le dossier approprié.



\---



\# 54. Organisation des développements



Travaille par étapes.



Pour une fonctionnalité :



\### Étape 1

Comprendre le besoin.



\### Étape 2

Lire la documentation.



\### Étape 3

Analyser les données nécessaires.



\### Étape 4

Analyser les permissions.



\### Étape 5

Concevoir l'interface.



\### Étape 6

Implémenter.



\### Étape 7

Tester.



\### Étape 8

Corriger.



\### Étape 9

Vérifier la sécurité.



\### Étape 10

Versionner.



\---



\# 55. Ne pas improviser le métier



Tu peux proposer des améliorations techniques ou UX.



Cependant, ne transforme jamais une supposition en règle métier.



Lorsque tu proposes une amélioration non documentée, indique clairement qu'il s'agit d'une proposition.



\---



\# 56. Priorité à l'expérience réelle



ADIKOM PILOT est destiné à être utilisé quotidiennement.



Les interfaces doivent donc privilégier :



\- rapidité ;

\- clarté ;

\- réduction des clics inutiles ;

\- informations pertinentes ;

\- actions évidentes ;

\- recherche rapide ;

\- filtres efficaces ;

\- feedback immédiat.



\---



\# 57. Règle concernant les données financières



Les données financières doivent être particulièrement rigoureuses.



Ne mélange jamais :



\- facture ;

\- règlement ;

\- imputation ;

\- paiement ;

\- solde.



Une imputation de maintenance fournisseur ne doit pas être enregistrée comme un paiement.



\---



\# 58. Règle concernant les montants



Les calculs financiers doivent être réalisés de manière fiable.



Évite les approximations ou calculs flottants inadaptés aux montants monétaires.



Les montants doivent être cohérents entre :



\- factures ;

\- locations ;

\- imputations ;

\- règlements ;

\- paiements ;

\- soldes.



\---



\# 59. Gestion des statuts



Les statuts doivent être explicites.



Exemples possibles :



\- actif ;

\- inactif ;

\- disponible ;

\- réservé ;

\- en location ;

\- en maintenance ;

\- terminé ;

\- annulé ;

\- en attente ;

\- payé ;

\- partiellement payé.



Ne crée pas plusieurs statuts différents pour représenter le même état sans justification.



\---



\# 60. Évolution future



ADIKOM PILOT doit être conçu pour évoluer.



Cependant :



\*\*préparer l'architecture ≠ développer immédiatement toutes les fonctionnalités futures.\*\*



Prévois des fondations solides sans surcharger le MVP.



\---



\# 61. Ordre de développement recommandé



\### Phase 1 — Fondation



\- architecture technique ;

\- Supabase ;

\- authentification ;

\- permissions ;

\- layout ;

\- navigation ;

\- Design System.



\### Phase 2 — Gestion de location



\- clients ;

\- fournisseurs ;

\- véhicules ;

\- réservations ;

\- locations ;

\- départs ;

\- retours ;

\- maintenance ;

\- imputations ;

\- facturation ;

\- paiements.



\### Phase 3 — Pilotage



\- dashboard ;

\- notifications ;

\- statistiques ;

\- rapports.



\### Phase 4 — Organisation



\- projets ;

\- planification ;

\- utilisateurs ;

\- groupes ;

\- permissions ;

\- paramètres.



\### Phase 5 — Extensions



Développement progressif des fonctionnalités validées par ADIKOM.



\---



\# 62. Règles absolues



Les règles suivantes sont prioritaires :



1\. ADIKOM PILOT est un SaaS interne.

2\. Claude Code est l'outil principal de développement.

3\. Antigravity est l'environnement de travail avec le plugin Claude Code intégré.

4\. Supabase est utilisé pour les données et services backend prévus.

5\. GitHub est utilisé pour le versionnement.

6\. Vercel est utilisé pour le déploiement.

7\. Aucun secret ne doit être exposé ou commit.

8\. Le Super Admin dispose de l'accès complet.

9\. Seul le Super Admin crée les utilisateurs dans le périmètre initial.

10\. Les permissions doivent être vérifiées côté serveur.

11\. Le SaaS doit être responsive.

12\. La sidebar doit être rétractable.

13\. Le logo officiel ADIKOM ne doit jamais être transformé.

14\. Le logo doit toujours rester lisible.

15\. Une zone blanche ou claire doit être prévue derrière le logo si nécessaire.

16\. Les clients et fournisseurs ne sont pas des utilisateurs du SaaS.

17\. Les tarifs préférentiels clients doivent être prévus dans la fiche client.

18\. La gestion de location constitue la priorité du MVP.

19\. Une imputation fournisseur n'est jamais un paiement.

20\. Les imputations doivent être traçables.

21\. Les données financières doivent rester cohérentes.

22\. Les opérations sensibles doivent être auditables.

23\. Les règles métier documentées doivent être respectées.

24\. Ne pas inventer une règle métier en cas d'ambiguïté.

25\. Ne pas surconstruire le produit.

26\. Le code doit être maintenable.

27\. Le système doit être sécurisé.

28\. Toute fonctionnalité importante doit être testée.

29\. Une fonctionnalité n'est pas terminée uniquement parce que le code compile.

30\. Les secrets doivent toujours rester dans les variables d'environnement ou systèmes de secrets appropriés.



\---



\# 63. Règle finale pour Claude Code



Tu n'es pas simplement chargé de produire du code.



Tu dois contribuer à construire un \*\*véritable système de gestion professionnel pour ADIKOM\*\*.



Avant chaque décision importante, pose-toi les questions suivantes :



\*\*Est-ce conforme au besoin métier ?\*\*



\*\*Est-ce conforme à la documentation ?\*\*



\*\*Est-ce sécurisé ?\*\*



\*\*Est-ce cohérent avec les autres modules ?\*\*



\*\*Est-ce maintenable ?\*\*



\*\*Est-ce utile à l'utilisateur ?\*\*



\*\*Est-ce évolutif ?\*\*



Si la réponse est non ou incertaine, arrête-toi, analyse le problème et signale-le avant de créer une solution arbitraire.



\---



\# ADIKOM PILOT



\*\*SaaS interne de gestion et de pilotage\*\*



\*\*ADIKOM Technology \& Travel\*\*



> Lire d'abord.

> Comprendre ensuite.

> Construire proprement.

> Tester réellement.

> Versionner avec rigueur.

