\# ADIKOM PILOT

\## Rôles, groupes et permissions



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT



\---



\## 1. Objet du document



Ce document définit le système de gestion des rôles, groupes et permissions d’ADIKOM PILOT.



L’objectif est de garantir que chaque utilisateur dispose des accès nécessaires à ses responsabilités, sans accéder inutilement aux fonctions qui ne relèvent pas de son rôle.



Le système doit être suffisamment souple pour refléter l’organisation réelle d’ADIKOM, notamment le fait qu’une même personne peut être responsable de plusieurs départements.



\---



\## 2. Principe général



ADIKOM PILOT doit fonctionner selon le principe :



\*\*Utilisateur → Groupe(s) → Permissions → Modules → Menus → Sous-menus → Actions\*\*



Les permissions déterminent ce qu’un utilisateur peut consulter ou effectuer.



Le système ne doit pas considérer uniquement le poste occupé par une personne pour déterminer ses accès.



Les permissions doivent également tenir compte de ses responsabilités réelles dans l’entreprise.



\---



\## 3. Utilisateurs internes uniquement



ADIKOM PILOT est un SaaS interne.



Les comptes utilisateurs sont destinés exclusivement au personnel autorisé d’ADIKOM.



Le système ne doit pas prévoir, dans le périmètre actuel :



\- compte client ;

\- compte fournisseur ;

\- compte partenaire ;

\- espace public ;

\- portail externe ;

\- connexion de personnes extérieures à l’entreprise.



Les clients, fournisseurs et partenaires sont enregistrés dans le système comme des tiers, mais ne disposent pas d’un compte de connexion.



\---



\## 4. Super Admin



Le Super Admin constitue le niveau d’administration principal du système.



Il est créé lors de la mise en place initiale du SaaS.



Le Super Admin est le seul utilisateur disposant par défaut de l’accès complet à l’ensemble des modules et fonctions du système.



Il doit notamment pouvoir :



\- créer les utilisateurs ;

\- modifier les utilisateurs ;

\- désactiver les utilisateurs ;

\- créer les groupes ;

\- modifier les groupes ;

\- attribuer les groupes ;

\- gérer les permissions ;

\- accéder à tous les modules ;

\- accéder aux paramètres sensibles ;

\- administrer le système ;

\- consulter les informations nécessaires au contrôle global.



Le Super Admin doit également pouvoir créer les autres utilisateurs du système.



\---



\## 5. Protection du Super Admin



Le compte Super Admin doit bénéficier d’un niveau de protection supérieur.



Un utilisateur standard ne doit jamais pouvoir :



\- modifier les permissions du Super Admin ;

\- retirer ses privilèges ;

\- supprimer le Super Admin ;

\- s’attribuer les privilèges du Super Admin ;

\- créer un autre compte avec des privilèges équivalents sans autorisation appropriée.



Les actions sensibles liées à l’administration doivent être protégées.



\---



\## 6. Gestion des utilisateurs



Chaque utilisateur représente une personne réelle travaillant avec ADIKOM PILOT.



La fiche utilisateur doit pouvoir contenir notamment :



\- nom ;

\- prénom ;

\- coordonnées ;

\- adresse email ;

\- téléphone ;

\- poste ;

\- département(s) ;

\- responsable hiérarchique ;

\- groupe(s) ;

\- statut ;

\- informations nécessaires à l’authentification ;

\- date de création ;

\- dernière activité lorsque disponible.



Le système doit permettre de distinguer les informations personnelles, professionnelles et les informations liées aux accès.



\---



\## 7. Un utilisateur peut avoir plusieurs responsabilités



ADIKOM étant une structure dont l’effectif est actuellement limité, une même personne peut prendre en charge plusieurs départements.



Le système ne doit donc pas imposer :



\*\*1 utilisateur = 1 département\*\*



Une personne peut par exemple être responsable de :



\- Administration \& Finance ;

\- Support \& Logistique.



Ou de toute autre combinaison définie par ADIKOM.



Le modèle de données et le système de permissions doivent donc permettre plusieurs responsabilités pour un même utilisateur.



\---



\## 8. Département et permission



Le département d’un utilisateur ne doit pas automatiquement lui donner accès à toutes les fonctions du département.



Le département représente une information organisationnelle.



La permission représente une autorisation réelle dans le système.



Il faut donc distinguer :



\*\*Département ≠ Permission\*\*



Exemple :



Un utilisateur peut appartenir au département Administration \& Finance tout en n’ayant accès qu’à certaines fonctions financières.



\---



\## 9. Groupes



Les groupes permettent de regrouper des permissions.



Un groupe peut correspondre à un rôle fonctionnel ou à un ensemble de responsabilités.



Exemples possibles :



\- Direction ;

\- Assistant(e) de direction ;

\- Administration \& Finance ;

\- Tourisme \& Mobilité ;

\- Support \& Logistique ;

\- Informatique \& Services Technique ;

\- Commercial \& Développement.



Ces groupes sont des exemples de structuration.



Le Super Admin doit pouvoir créer, modifier et gérer les groupes selon l’organisation réelle d’ADIKOM.



\---



\## 10. Attribution des groupes



Un utilisateur peut être associé à un ou plusieurs groupes lorsque cela est nécessaire.



Exemple :



Utilisateur A

│

├── Groupe Administration \& Finance

└── Groupe Support \& Logistique



Les permissions résultant de plusieurs groupes doivent être déterminées de manière cohérente.



Le système doit éviter les incohérences lorsqu’un utilisateur possède plusieurs groupes.



\---



\## 11. Structure des permissions



Les permissions doivent être organisées de manière hiérarchique.



La structure de référence est :



\*\*Module → Menu → Sous-menu → Action\*\*



Exemple :



Gestion de location

→ Réservations

→ Liste des réservations

→ Consulter



Ou :



Facturation \& Paiement

→ Factures clients

→ Liste

→ Consulter



Cette organisation doit permettre au Super Admin de gérer les droits avec précision.



\---



\## 12. Types d’actions



Les permissions doivent pouvoir distinguer plusieurs types d’actions.



Les actions principales sont :



\- consulter ;

\- créer ;

\- modifier ;

\- supprimer ;

\- valider ;

\- annuler ;

\- enregistrer ;

\- exporter ;

\- imprimer ;

\- administrer.



Toutes les actions ne sont pas nécessairement disponibles pour tous les modules.



Les actions réellement nécessaires doivent être définies dans chaque module.



\---



\## 13. Permission de consultation



La permission de consultation permet à l’utilisateur d’accéder à une information sans nécessairement pouvoir la modifier.



Exemple :



Un utilisateur peut consulter :



\- une fiche client ;

\- une fiche véhicule ;

\- une réservation ;

\- une facture.



Mais ne pas pouvoir :



\- modifier ;

\- supprimer ;

\- valider.



\---



\## 14. Permission de création



La permission de création autorise l’utilisateur à créer une nouvelle donnée ou opération.



Exemples :



\- créer un client ;

\- créer une réservation ;

\- créer un véhicule ;

\- créer une facture ;

\- créer un paiement.



La création doit respecter les autres règles métier du module.



\---



\## 15. Permission de modification



La permission de modification autorise l’utilisateur à modifier une donnée existante.



Certaines informations sensibles peuvent nécessiter des permissions supplémentaires.



Exemples :



\- modification d’un tarif ;

\- modification d’une réservation ;

\- modification d’un paiement ;

\- modification d’une facture ;

\- modification d’une permission.



\---



\## 16. Permission de suppression



La suppression doit être considérée comme une action sensible.



Elle ne doit être disponible que pour les utilisateurs explicitement autorisés.



Lorsque cela est possible, le système doit privilégier :



\- archivage ;

\- désactivation ;

\- annulation ;

\- suppression logique ;



plutôt que la suppression définitive d’informations nécessaires à l’historique.



Les règles exactes dépendront de la nature de la donnée.



\---



\## 17. Permission de validation



Certaines opérations peuvent nécessiter une validation.



La permission de validation doit permettre de distinguer :



\*\*Créer une opération\*\*



et



\*\*Valider une opération\*\*



Cette séparation peut être utilisée notamment pour les opérations sensibles ou financières.



\---



\## 18. Permissions financières



Les fonctions financières doivent être particulièrement protégées.



Les accès peuvent notamment concerner :



\- factures clients ;

\- factures fournisseurs ;

\- règlements ;

\- paiements ;

\- banques ;

\- caisses ;

\- écritures ;

\- virements internes ;

\- déductions fournisseurs ;

\- rapports financiers.



Un utilisateur ne doit accéder qu’aux fonctions financières nécessaires à ses responsabilités.



\---



\## 19. Permissions liées à la gestion de location



Les permissions de gestion de location peuvent être organisées autour de :



\- véhicules ;

\- parc automobile ;

\- réservations ;

\- contrats ;

\- départs ;

\- retours ;

\- états des lieux ;

\- dommages ;

\- maintenance ;

\- documents ;

\- assurances ;

\- dépenses ;

\- tarifs.



Il doit être possible de donner à un utilisateur un accès opérationnel sans nécessairement lui donner accès à toutes les fonctions administratives ou financières du module.



\---



\## 20. Permissions liées aux tarifs



La gestion des tarifs est une fonction sensible.



Le système doit permettre de distinguer au minimum :



\- consulter un tarif ;

\- créer un tarif ;

\- modifier un tarif ;

\- gérer un tarif préférentiel ;

\- appliquer un tarif selon les règles prévues.



Les modifications importantes de tarifs doivent être traçables.



\---



\## 21. Permissions liées aux tarifs préférentiels clients



Les tarifs préférentiels doivent être gérés depuis la fiche client ou les fonctions tarifaires prévues.



Le système doit permettre de contrôler qui peut :



\- consulter les tarifs préférentiels ;

\- créer un tarif préférentiel ;

\- modifier un tarif préférentiel ;

\- désactiver un tarif préférentiel.



Lorsqu’un tarif préférentiel est appliqué à une réservation, le tarif réellement appliqué doit rester conservé dans l’historique de la réservation.



\---



\## 22. Permissions liées aux fournisseurs et aux imputations



Les opérations concernant les fournisseurs peuvent inclure des informations financières sensibles.



Le système doit donc pouvoir contrôler l’accès à :



\- factures fournisseurs ;

\- paiements fournisseurs ;

\- véhicules fournisseurs ;

\- dépenses de maintenance ;

\- imputations ;

\- déductions ;

\- soldes fournisseurs.



Une imputation de maintenance doit être traçable et accessible uniquement aux utilisateurs autorisés.



\---



\## 23. Permissions liées aux utilisateurs



La gestion des utilisateurs doit être réservée aux personnes autorisées.



Les actions sensibles comprennent :



\- créer un utilisateur ;

\- modifier un utilisateur ;

\- désactiver un utilisateur ;

\- modifier son groupe ;

\- modifier ses permissions ;

\- consulter ses permissions ;

\- gérer son accès.



Ces permissions doivent être particulièrement protégées.



\---



\## 24. Permissions liées aux groupes



La gestion des groupes comprend :



\- créer un groupe ;

\- modifier un groupe ;

\- désactiver un groupe lorsque nécessaire ;

\- consulter les groupes ;

\- modifier les permissions d’un groupe.



La modification d’un groupe peut avoir un impact sur plusieurs utilisateurs.



Elle doit donc être considérée comme une action sensible.



\---



\## 25. Page « Utilisateur »



Lorsqu’un utilisateur est sélectionné depuis la liste des utilisateurs, le système doit ouvrir une page dédiée.



Cette page doit comporter au minimum deux onglets :



\### Onglet 1 : Utilisateur



Il contient :



\- informations personnelles ;

\- informations professionnelles ;

\- poste ;

\- département(s) ;

\- responsable ;

\- groupe(s) ;

\- statut ;

\- informations nécessaires au compte.



\### Onglet 2 : Permissions



Il contient l’ensemble des permissions associées à l’utilisateur.



Les permissions doivent être présentées de manière structurée et compréhensible.



\---



\## 26. Page « Permissions »



L’onglet Permissions doit permettre au Super Admin de visualiser clairement les accès de l’utilisateur.



La structure peut être présentée sous la forme :



Module

│

├── Menu

│   ├── Sous-menu

│   │   ├── Consulter

│   │   ├── Créer

│   │   ├── Modifier

│   │   └── Supprimer

│   │

│   └── Sous-menu

│

└── Menu



L’interface doit permettre de comprendre rapidement :



\- ce qui est accessible ;

\- ce qui est interdit ;

\- les actions autorisées ;

\- les permissions provenant d’un groupe.



\---



\## 27. Permissions héritées d’un groupe



Lorsqu’un utilisateur appartient à un groupe, il peut recevoir les permissions associées à ce groupe.



Le système doit clairement distinguer :



\- permission héritée du groupe ;

\- permission attribuée directement à l’utilisateur.



Cette distinction est importante pour faciliter l’administration et comprendre l’origine d’un accès.



\---



\## 28. Principe de moindre privilège



ADIKOM PILOT doit appliquer le principe de moindre privilège.



Chaque utilisateur doit disposer uniquement des accès nécessaires à l’accomplissement de ses responsabilités.



L’objectif est de réduire :



\- les erreurs ;

\- les accès inutiles ;

\- les risques de modification non autorisée ;

\- les risques liés aux informations sensibles.



\---



\## 29. Refus d’accès



Lorsqu’un utilisateur tente d’accéder à une fonction pour laquelle il ne possède pas la permission nécessaire, le système doit refuser l’action.



Le refus doit être propre et compréhensible.



Le système ne doit pas exposer d’informations sensibles à travers un message d’erreur.



Selon le contexte, l’utilisateur peut être :



\- redirigé ;

\- informé qu’il ne dispose pas des droits nécessaires ;

\- invité à contacter un responsable.



\---



\## 30. Contrôle côté interface et côté serveur



Le contrôle des permissions doit exister à plusieurs niveaux.



\### Interface



Les modules, menus, boutons et actions non autorisés doivent être masqués ou désactivés lorsque cela améliore l’expérience utilisateur.



\### Serveur



Le serveur doit vérifier les permissions avant d’exécuter toute opération protégée.



Le masquage d’un bouton ne constitue jamais une mesure de sécurité suffisante.



Un utilisateur ne doit pas pouvoir contourner les permissions simplement en appelant directement une URL ou une fonction.



\---



\## 31. Traçabilité des actions sensibles



Les actions sensibles doivent pouvoir être enregistrées dans le journal d’activité.



Cela concerne notamment :



\- création d’utilisateur ;

\- modification d’utilisateur ;

\- modification de permissions ;

\- création ou modification de groupe ;

\- modification de tarif ;

\- création ou modification d’une opération financière ;

\- suppression ou désactivation ;

\- imputation fournisseur ;

\- opérations administratives importantes.



Le journal doit permettre de connaître au minimum :



\- qui a effectué l’action ;

\- quelle action a été effectuée ;

\- sur quel élément ;

\- quand l’action a été effectuée.



\---



\## 32. Exemple de matrice de permissions



La matrice suivante constitue une base fonctionnelle et non une attribution définitive.



| Domaine | Consultation | Création | Modification | Suppression | Validation |

|---|---:|---:|---:|---:|---:|

| Clients | Oui | Oui | Oui | Selon rôle | Selon rôle |

| Fournisseurs | Oui | Oui | Oui | Selon rôle | Selon rôle |

| Partenariats | Oui | Oui | Oui | Selon rôle | Selon rôle |

| Véhicules | Oui | Oui | Oui | Selon rôle | Selon rôle |

| Réservations | Oui | Oui | Oui | Selon rôle | Selon rôle |

| Contrats | Oui | Oui | Oui | Selon rôle | Selon rôle |

| Maintenance | Oui | Oui | Oui | Selon rôle | Selon rôle |

| Factures clients | Oui | Oui | Selon rôle | Non par défaut | Selon rôle |

| Factures fournisseurs | Oui | Oui | Selon rôle | Non par défaut | Selon rôle |

| Paiements | Oui | Oui | Selon rôle | Non par défaut | Selon rôle |

| Banques \& Caisses | Oui | Selon rôle | Selon rôle | Non par défaut | Selon rôle |

| Utilisateurs | Selon rôle | Selon rôle | Selon rôle | Selon rôle | Non applicable |

| Groupes | Selon rôle | Selon rôle | Selon rôle | Selon rôle | Non applicable |

| Permissions | Selon rôle | Selon rôle | Selon rôle | Selon rôle | Non applicable |

| Paramètres | Selon rôle | Selon rôle | Selon rôle | Selon rôle | Non applicable |



Cette matrice constitue une base de réflexion.



Les permissions finales devront être définies en fonction des responsabilités réellement attribuées aux utilisateurs d’ADIKOM.



\---



\## 33. Exemple de séparation des responsabilités



Une même personne peut gérer plusieurs départements.



Par exemple :



Utilisateur A

│

├── Administration \& Finance

└── Support \& Logistique



Elle peut alors recevoir des permissions provenant de plusieurs groupes.



Exemple :



Administration \& Finance

\- consulter les factures ;

\- créer les factures ;

\- enregistrer les paiements ;

\- consulter les comptes ;

\- gérer certaines écritures.



Support \& Logistique

\- consulter les véhicules ;

\- gérer la maintenance ;

\- consulter les réservations ;

\- gérer certaines opérations logistiques.



Le système doit permettre cette combinaison sans créer un compte utilisateur supplémentaire.



\---



\## 34. Évolution des permissions



L’organisation d’ADIKOM peut évoluer avec l’augmentation de l’effectif.



Le système doit donc permettre de modifier les groupes et permissions sans devoir modifier le code de l’application.



Une nouvelle personne peut ainsi être ajoutée avec un ensemble de permissions adapté à son poste.



De même, lorsqu’ADIKOM augmente ses effectifs, les responsabilités peuvent être progressivement séparées entre plusieurs utilisateurs.



\---



\## 35. Principe de sécurité



Les permissions ne doivent jamais être considérées uniquement comme une fonctionnalité d’interface.



Elles constituent un mécanisme de sécurité central du système.



Toute opération sensible doit vérifier les droits de l’utilisateur avant son exécution.



Le système doit notamment empêcher :



\- l’escalade de privilèges ;

\- l’accès à des données non autorisées ;

\- la modification d’informations sensibles ;

\- l’exécution d’actions administratives non autorisées.



\---



\## 36. Principe directeur



Le système de permissions d’ADIKOM PILOT doit permettre de répondre à une question simple :



\*\*« Qui peut faire quoi, où et dans quelles conditions ? »\*\*



La réponse doit être déterminée par :



\*\*Utilisateur → Groupe(s) → Permission(s) → Module → Menu → Sous-menu → Action\*\*



Le système doit rester suffisamment précis pour protéger les données et suffisamment flexible pour accompagner l’organisation réelle d’ADIKOM.



Le Super Admin conserve la maîtrise globale des utilisateurs, groupes et permissions.



Les autres utilisateurs ne doivent accéder qu’aux fonctions nécessaires à leurs responsabilités.



\*\*Principe final :\*\*



> Un utilisateur ne doit jamais avoir plus de droits que nécessaire, mais il doit disposer de tous les droits nécessaires pour accomplir correctement sa mission.

