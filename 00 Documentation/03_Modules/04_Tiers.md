\# ADIKOM PILOT

\## Module 04 — Tiers



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence fonctionnelle  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\## 1. Objet du module



Le module Tiers constitue le référentiel central des relations externes d’ADIKOM.



Il permet de gérer les personnes et organisations avec lesquelles ADIKOM entretient une relation professionnelle ou commerciale.



Le module comprend trois grandes catégories :



\- Clients ;

\- Fournisseurs ;

\- Partenaires.



Les tiers sont enregistrés et gérés exclusivement par les utilisateurs internes autorisés.



Dans le périmètre actuel du SaaS, les clients, fournisseurs et partenaires ne disposent pas de compte de connexion à ADIKOM PILOT.



Le module doit permettre de disposer d’une information fiable, centralisée et réutilisable dans les autres modules.



\---



\## 2. Objectifs



Le module doit permettre de :



1\. centraliser les informations des tiers ;

2\. éviter les doublons ;

3\. rechercher rapidement un tiers ;

4\. consulter son historique ;

5\. relier les tiers aux opérations concernées ;

6\. gérer les conditions commerciales ;

7\. gérer les tarifs préférentiels clients ;

8\. suivre les relations avec les fournisseurs ;

9\. suivre les partenariats ;

10\. permettre aux autres modules d’utiliser les informations des tiers ;

11\. conserver un historique cohérent ;

12\. assurer la traçabilité des informations importantes.



\---



\## 3. Structure générale



Le module est organisé comme suit :



Tiers

│

├── Clients

│   ├── Nouveau client

│   └── Liste des clients

│

├── Fournisseurs

│   ├── Nouveau fournisseur

│   └── Liste des fournisseurs

│

└── Partenariat

&#x20;   ├── Nouveau partenariat

&#x20;   └── Liste des partenariats



Cette structure constitue la base fonctionnelle du module.



\---



\## 4. Principe de référentiel central



Le module Tiers doit constituer la source de référence pour les informations relatives aux clients, fournisseurs et partenaires.



Exemple :



Un client créé dans le module Tiers doit pouvoir être utilisé dans :



\- Gestion de location ;

\- Facturation \& Paiement ;

\- Projets \& Planification ;

\- statistiques ;

\- rapports.



Les informations principales du client ne doivent pas être recréées dans chaque module.



Le même principe s’applique aux fournisseurs et aux partenaires.



\---



\# 5. CLIENTS



\## 5.1. Création d’un client



Le menu Nouveau client doit permettre de créer une fiche client.



La création doit être simple, structurée et suffisamment complète pour permettre l’utilisation immédiate du client dans les autres modules.



Les informations peuvent être organisées par sections.



\---



\## 5.2. Informations générales du client



La fiche client peut notamment contenir :



\- type de client ;

\- raison sociale ou nom complet ;

\- nom commercial ;

\- prénom ;

\- identifiant interne ;

\- numéro de téléphone ;

\- adresse email ;

\- adresse ;

\- ville ;

\- pays ;

\- informations complémentaires.



Le système doit pouvoir gérer aussi bien des clients particuliers que des entreprises lorsque cela est nécessaire.



\---



\## 5.3. Identification du client



Le système doit permettre d’enregistrer les informations d’identification nécessaires à la gestion du client.



Selon le type de client, cela peut comprendre :



\- pièce d’identité ;

\- numéro d’identification ;

\- informations administratives ;

\- informations fiscales lorsque nécessaires ;

\- documents justificatifs.



Les champs obligatoires doivent être déterminés selon les besoins réels d’ADIKOM.



\---



\## 5.4. Statut du client



Un client doit disposer d’un statut.



Exemples :



\- Actif ;

\- Inactif ;

\- Prospect ;

\- Archivé.



Le statut doit permettre de distinguer les clients actuellement utilisables des fiches qui ne doivent plus être utilisées pour de nouvelles opérations.



La suppression définitive d’un client ayant un historique métier doit être évitée lorsque cela compromet la traçabilité.



\---



\## 5.5. Identification interne



Chaque client doit pouvoir disposer d’un identifiant interne unique.



Exemple :



CLI-000001



Le format exact pourra être défini lors de l’implémentation.



L’identifiant doit permettre de retrouver rapidement un client et d’éviter les confusions entre deux tiers portant des noms similaires.



\---



\# 6. TARIFICATION CLIENT



\## 6.1. Principe



ADIKOM doit pouvoir appliquer des conditions tarifaires différentes selon le client.



Un client peut bénéficier d’un tarif préférentiel.



Le système doit donc prévoir la gestion des tarifs personnalisés directement dans sa fiche.



\---



\## 6.2. Tarif standard



Le tarif standard constitue la référence générale applicable lorsqu’aucune condition particulière n’est définie.



Exemple :



Catégorie :

Toyota T5



Tarif standard :

500 000 KMF



Lorsqu’aucun tarif préférentiel n’est défini pour le client, le système applique le tarif standard selon les règles de tarification du module Gestion de location.



\---



\## 6.3. Tarif préférentiel



Un client peut bénéficier d’un tarif différent du tarif standard.



Exemple :



Tarif standard :

500 000 KMF



Tarif préférentiel du client :

450 000 KMF



Le tarif préférentiel doit pouvoir être défini selon les règles métier de la gestion de location.



\---



\## 6.4. Informations d’un tarif préférentiel



Une condition tarifaire personnalisée peut notamment contenir :



\- client concerné ;

\- catégorie de véhicule ;

\- véhicule spécifique lorsque nécessaire ;

\- tarif ;

\- remise ;

\- unité de calcul ;

\- période de validité ;

\- conditions particulières ;

\- statut ;

\- date de création ;

\- utilisateur ayant créé la condition.



\---



\## 6.5. Période de validité



Un tarif préférentiel peut être permanent ou limité dans le temps.



Le système doit pouvoir gérer :



\- date de début ;

\- date de fin ;

\- absence de date de fin lorsque la condition est permanente.



Une condition expirée ne doit plus être automatiquement appliquée à une nouvelle réservation.



\---



\## 6.6. Priorité des tarifs



Lorsqu’un client dispose de plusieurs conditions tarifaires, le système doit appliquer une logique claire.



Une logique possible est :



Tarif spécifique au véhicule

↓

Tarif spécifique à la catégorie

↓

Tarif préférentiel client

↓

Tarif standard



La règle exacte devra être confirmée lors de la conception détaillée du module Gestion de location.



> \*\*Décision arbitrée — DEC-002\*\*
>
> Règle retenue : \*\*le tarif le plus spécifique gagne\*\* —
> client+véhicule → client+catégorie → client → véhicule → catégorie → standard.
> À égalité de spécificité, le tarif le plus récent s'applique.
>
> Voir `08\_Decisions/01\_Journal\_des\_Decisions.md`.



Le système ne doit jamais appliquer plusieurs tarifs simultanément de manière ambiguë.



\---



\## 6.7. Conservation du tarif appliqué



Lorsqu’un tarif est appliqué à une réservation ou à une location, le système doit conserver le tarif réellement appliqué.



Il ne doit pas recalculer rétroactivement une ancienne location lorsque le tarif du client est modifié ultérieurement.



Exemple :



Réservation du 20/08/2026 :

Tarif appliqué : 450 000 KMF



Le tarif préférentiel est ensuite modifié à 470 000 KMF.



La réservation existante doit conserver son tarif de 450 000 KMF, sauf modification volontaire et autorisée de la réservation.



\---



\# 7. LISTE DES CLIENTS



\## 7.1. Objectif



La Liste des clients doit permettre de retrouver rapidement les clients enregistrés.



Elle doit fournir une vue synthétique des informations principales.



\---



\## 7.2. Informations de la liste



La liste peut notamment afficher :



\- identifiant ;

\- nom ou raison sociale ;

\- type ;

\- téléphone ;

\- email ;

\- statut ;

\- nombre de réservations ;

\- dernière activité ;

\- tarif préférentiel lorsqu’une information synthétique est pertinente.



La liste ne doit pas être surchargée.



\---



\## 7.3. Recherche



La recherche doit permettre de retrouver un client par exemple à partir de :



\- nom ;

\- raison sociale ;

\- identifiant ;

\- téléphone ;

\- email.



La recherche doit être suffisamment rapide pour être utilisée quotidiennement.



\---



\## 7.4. Filtres



Les filtres peuvent inclure :



\- type de client ;

\- statut ;

\- période d’activité ;

\- présence d’un tarif préférentiel.



D’autres filtres pourront être ajoutés selon les besoins.



\---



\# 8. FICHE CLIENT



\## 8.1. Principe



La fiche client constitue le point central de toutes les informations relatives à un client.



Elle doit permettre de comprendre rapidement :



\- qui est le client ;

\- quelles sont ses conditions commerciales ;

\- quelles opérations lui sont associées ;

\- quel est son historique.



\---



\## 8.2. Organisation de la fiche



La fiche peut être organisée autour de plusieurs sections ou onglets.



Exemple :



Fiche client

│

├── Informations

├── Tarification

├── Réservations

├── Locations

├── Factures

├── Paiements

├── Documents

└── Historique



L’organisation graphique pourra évoluer lors de la conception UX/UI.



\---



\## 8.3. Onglet Informations



L’onglet Informations contient les données générales du client.



Il doit permettre aux utilisateurs autorisés de consulter et, selon leurs permissions, de modifier les informations.



\---



\## 8.4. Onglet Tarification



Cet onglet permet de consulter et gérer les conditions tarifaires du client.



Il doit notamment permettre de retrouver :



\- tarif standard applicable ;

\- tarifs préférentiels ;

\- remises ;

\- périodes de validité ;

\- conditions particulières ;

\- historique des modifications.



L’accès à la modification des tarifs doit être protégé par des permissions spécifiques lorsque nécessaire.



\---



\## 8.5. Onglet Réservations



Cet onglet doit présenter les réservations associées au client.



Il peut afficher :



\- date ;

\- véhicule ;

\- période ;

\- statut ;

\- montant ;

\- tarif appliqué.



Chaque réservation doit pouvoir être ouverte directement si l’utilisateur dispose des permissions nécessaires.



\---



\## 8.6. Onglet Locations



Cet onglet doit présenter l’historique des locations du client.



Il doit notamment permettre de retrouver :



\- véhicule ;

\- période ;

\- contrat ;

\- montant ;

\- statut ;

\- retour ;

\- éventuels dommages ;

\- facturation associée.



\---



\## 8.7. Onglet Factures



L’onglet Factures permet de consulter les factures associées au client.



Il peut notamment afficher :



\- numéro ;

\- date ;

\- montant ;

\- montant payé ;

\- solde ;

\- statut.



\---



\## 8.8. Onglet Paiements



Cet onglet permet de consulter les paiements associés au client.



Il peut notamment afficher :



\- date ;

\- montant ;

\- mode de paiement ;

\- facture associée ;

\- compte ou caisse concerné ;

\- référence.



\---



\## 8.9. Onglet Documents



Les documents liés au client peuvent être regroupés dans cet onglet.



Exemples :



\- pièce d’identité ;

\- documents administratifs ;

\- contrats ;

\- justificatifs ;

\- autres documents autorisés.



Les documents doivent respecter les permissions et les règles de sécurité.



\---



\## 8.10. Onglet Historique



L’historique doit permettre de retrouver les événements importants concernant le client.



Exemples :



\- création ;

\- modification ;

\- réservation ;

\- location ;

\- facturation ;

\- paiement ;

\- changement de tarif préférentiel ;

\- archivage.



\---



\# 9. FOURNISSEURS



\## 9.1. Principe



Le fournisseur représente une personne ou une organisation mettant notamment des véhicules à disposition d’ADIKOM ou fournissant des biens ou services.



Dans le cadre du MVP, la relation entre fournisseur et véhicule constitue une fonction particulièrement importante.



\---



\## 9.2. Création d’un fournisseur



Le menu Nouveau fournisseur permet de créer une fiche fournisseur.



Les informations peuvent notamment comprendre :



\- raison sociale ;

\- nom ;

\- contact ;

\- téléphone ;

\- email ;

\- adresse ;

\- pays ;

\- informations administratives ;

\- coordonnées bancaires lorsque nécessaires ;

\- statut ;

\- notes.



\---



\## 9.3. Identifiant fournisseur



Chaque fournisseur doit pouvoir disposer d’un identifiant interne unique.



Exemple :



FOU-000001



Le format exact sera défini lors de l’implémentation.



\---



\## 9.4. Statut fournisseur



Le fournisseur peut disposer de plusieurs statuts.



Exemples :



\- Actif ;

\- Inactif ;

\- Suspendu ;

\- Archivé.



Le statut doit être pris en compte lors des nouvelles opérations.



\---



\# 10. FOURNISSEUR ET VÉHICULES



\## 10.1. Relation



Un fournisseur peut être associé à plusieurs véhicules.



Exemple :



Fournisseur A

│

├── Toyota T5

├── Toyota Hiace

└── Nissan X-Trail



La fiche fournisseur doit permettre d’accéder à la liste des véhicules qui lui sont associés.



\---



\## 10.2. Historique des véhicules



Lorsqu’un véhicule est associé à un fournisseur, le système doit conserver cette relation.



Si le véhicule change de fournisseur, l’historique doit pouvoir être conservé lorsque cela est nécessaire à la traçabilité.



\---



\## 10.3. Informations financières du fournisseur



La fiche fournisseur doit permettre de suivre les informations financières nécessaires.



Exemples :



\- factures ;

\- règlements ;

\- solde ;

\- dépenses imputables ;

\- déductions ;

\- historique.



\---



\# 11. MAINTENANCE ET IMPUTATION FOURNISSEUR



\## 11.1. Principe métier



ADIKOM peut louer un véhicule appartenant à un fournisseur.



Lorsqu’un véhicule nécessite une maintenance ou une réparation, ADIKOM peut prendre en charge la dépense.



Lorsque cette dépense doit être imputée au fournisseur, son montant doit être déduit de la somme due au fournisseur.



Exemple :



Fournisseur A fournit une Toyota T5.



Montant fournisseur :

500 000 KMF



La Toyota T5 tombe en panne.



Coût de réparation pris en charge par ADIKOM :

300 000 KMF



Montant imputé au fournisseur :

300 000 KMF



Montant restant dû au fournisseur :

200 000 KMF



\---



\## 11.2. Traçabilité de l’imputation



La déduction ne doit jamais être enregistrée comme une simple modification manuelle du montant de la facture.



Le système doit conserver la chaîne :



Fournisseur

&#x20;  ↓

Véhicule

&#x20;  ↓

Incident / panne

&#x20;  ↓

Maintenance

&#x20;  ↓

Dépense

&#x20;  ↓

Imputation fournisseur

&#x20;  ↓

Facture fournisseur

&#x20;  ↓

Montant déduit

&#x20;  ↓

Solde restant



Cette traçabilité est essentielle.



\---



\## 11.3. Dépense de maintenance



La dépense doit conserver au minimum :



\- véhicule ;

\- fournisseur ;

\- date ;

\- motif ;

\- montant ;

\- prestataire de maintenance lorsque pertinent ;

\- document justificatif ;

\- utilisateur ayant enregistré la dépense ;

\- statut ;

\- éventuelle imputation.



\---



\## 11.4. Imputation



L’imputation doit constituer une opération identifiable.



Elle doit pouvoir contenir :



\- fournisseur ;

\- dépense concernée ;

\- montant imputé ;

\- facture fournisseur concernée ;

\- date ;

\- justification ;

\- utilisateur ;

\- statut.



Le système doit éviter qu’une même dépense soit imputée plusieurs fois.



\---



\## 11.5. Contrôle du montant



Le montant imputé ne doit pas dépasser le montant réellement imputable.



Le système doit empêcher les incohérences telles que :



Dépense :

300 000 KMF



Montant imputé :

500 000 KMF



Une validation doit empêcher cette opération ou demander une autorisation spécifique lorsque le métier le justifie.



\---



\## 11.6. Imputation partielle



Le système doit pouvoir gérer une imputation partielle lorsque cela est nécessaire.



Exemple :



Dépense :

300 000 KMF



Imputation actuelle :

200 000 KMF



Reste à imputer :

100 000 KMF



Le système doit conserver l’historique des montants déjà imputés.



\---



\# 12. LISTE DES FOURNISSEURS



La liste doit permettre de :



\- rechercher un fournisseur ;

\- filtrer ;

\- consulter sa fiche ;

\- voir les véhicules associés ;

\- consulter les factures ;

\- consulter les paiements ;

\- consulter les imputations ;

\- consulter le solde.



Les informations doivent être présentées de manière synthétique.



\---



\# 13. FICHE FOURNISSEUR



La fiche fournisseur peut être organisée comme suit :



Fiche fournisseur

│

├── Informations

├── Véhicules

├── Factures

├── Paiements

├── Imputations

├── Documents

└── Historique



La structure exacte pourra évoluer selon la conception UX/UI.



\---



\# 14. PARTENARIATS



\## 14.1. Principe



Le module Partenariat permet de centraliser les relations de partenariat d’ADIKOM.



Un partenaire peut être une organisation, une entreprise ou une autre structure avec laquelle ADIKOM entretient une relation professionnelle particulière.



\---



\## 14.2. Création d’un partenariat



Le menu Nouveau partenariat permet d’enregistrer une relation de partenariat.



Les informations peuvent notamment comprendre :



\- nom du partenaire ;

\- organisation ;

\- contact ;

\- type de partenariat ;

\- responsable interne ;

\- date de début ;

\- date de fin ;

\- statut ;

\- description ;

\- conditions ;

\- documents ;

\- notes.



\---



\## 14.3. Statut du partenariat



Les statuts peuvent notamment être :



\- Prospect ;

\- En négociation ;

\- Actif ;

\- Suspendu ;

\- Terminé ;

\- Archivé.



\---



\## 14.4. Responsable interne



Chaque partenariat peut avoir un responsable interne.



Le système doit permettre d’attribuer le partenariat à un utilisateur autorisé.



Comme pour les autres fonctions d’ADIKOM, un utilisateur peut gérer plusieurs responsabilités.



\---



\# 15. LISTE DES PARTENARIATS



La liste doit permettre de :



\- rechercher un partenariat ;

\- filtrer ;

\- consulter la fiche ;

\- voir le responsable ;

\- voir le statut ;

\- voir les dates ;

\- consulter l’historique.



\---



\# 16. FICHE PARTENARIAT



La fiche partenariat peut être organisée comme suit :



Fiche partenariat

│

├── Informations

├── Contacts

├── Conditions

├── Projets

├── Documents

└── Historique



Elle doit permettre d’avoir une vision claire de la relation avec le partenaire.



\---



\# 17. Recherche globale



Le module Tiers doit être compatible avec la recherche globale du SaaS lorsque celle-ci est disponible.



La recherche peut permettre de retrouver :



\- client ;

\- fournisseur ;

\- partenaire.



Les résultats doivent respecter les permissions.



\---



\# 18. Détection des doublons



Le système doit limiter la création de doublons.



Lors de la création d’un tiers, il peut vérifier certains éléments :



\- nom ;

\- raison sociale ;

\- téléphone ;

\- email ;

\- identifiant.



Si une correspondance potentielle est détectée, le système doit avertir l’utilisateur.



Exemple :



\*\*Un client similaire existe déjà.\*\*



L’utilisateur peut alors consulter la fiche existante avant de créer un nouveau tiers.



\---



\# 19. Archivage



Lorsqu’un tiers n’est plus actif, il doit être possible de l’archiver ou de le désactiver plutôt que de supprimer son historique.



L’archivage ne doit pas supprimer :



\- réservations ;

\- locations ;

\- factures ;

\- paiements ;

\- opérations ;

\- historique.



Un tiers archivé ne doit normalement plus être proposé pour les nouvelles opérations lorsque cela n’est pas pertinent.



\---



\# 20. Relations avec les autres modules



Le module Tiers doit être connecté aux principaux modules du SaaS.



Tiers

│

├── Gestion de location

│   ├── Clients → Réservations / Locations

│   └── Fournisseurs → Véhicules / Maintenance

│

├── Facturation \& Paiement

│   ├── Clients → Factures / Paiements

│   └── Fournisseurs → Factures / Règlements

│

├── Projets \& Planification

│   └── Clients / Fournisseurs / Partenaires → Projets

│

└── Centre de notifications

&#x20;   └── Événements liés aux tiers



\---



\# 21. Permissions



Le module doit respecter le système général de permissions.



Les permissions peuvent notamment distinguer :



\- consulter les clients ;

\- créer un client ;

\- modifier un client ;

\- archiver un client ;

\- gérer les tarifs préférentiels ;

\- consulter les fournisseurs ;

\- créer un fournisseur ;

\- modifier un fournisseur ;

\- gérer les relations fournisseur-véhicule ;

\- consulter les imputations ;

\- créer une imputation ;

\- consulter les partenariats ;

\- créer un partenariat ;

\- modifier un partenariat ;

\- archiver un partenariat.



Les permissions exactes seront définies dans le système global de rôles et permissions.



\---



\# 22. Sécurité



Les informations sensibles des tiers doivent être protégées.



Le système doit notamment empêcher un utilisateur non autorisé de consulter :



\- informations financières ;

\- coordonnées bancaires ;

\- documents sensibles ;

\- informations administratives ;

\- données liées aux imputations.



Les contrôles doivent être appliqués côté serveur.



Le masquage d’une information dans l’interface ne constitue pas une mesure de sécurité suffisante.



\---



\# 23. Journalisation



Les actions importantes concernant les tiers doivent pouvoir être tracées.



Exemples :



\- création ;

\- modification ;

\- archivage ;

\- création d’un tarif préférentiel ;

\- modification d’un tarif ;

\- création d’une imputation ;

\- modification d’une relation fournisseur-véhicule.



Le journal doit pouvoir identifier :



\- utilisateur ;

\- action ;

\- élément concerné ;

\- date ;

\- heure.



\---



\# 24. Responsive design



Le module Tiers doit être entièrement responsive.



\### Desktop



Les listes et fiches peuvent exploiter pleinement la largeur disponible.



\### Tablette



Les tableaux et informations doivent être réorganisés lorsque nécessaire.



\### Mobile



Les fiches doivent être présentées sous forme de sections ou d’onglets adaptés aux petits écrans.



Les actions principales doivent rester facilement accessibles.



\---



\# 25. Performance



Les listes de tiers doivent pouvoir gérer une augmentation progressive du nombre de clients, fournisseurs et partenaires.



Le système doit prévoir :



\- recherche ;

\- filtrage ;

\- pagination ;

\- tri ;

\- chargement progressif lorsque nécessaire.



Les fiches détaillées doivent charger les informations complémentaires lorsque cela est nécessaire.



\---



\# 26. Évolutivité



Le module doit pouvoir évoluer avec ADIKOM.



Des fonctionnalités futures peuvent notamment inclure :



\- segmentation avancée des clients ;

\- scoring client ;

\- historique commercial avancé ;

\- statistiques de rentabilité par client ;

\- conditions commerciales avancées ;

\- gestion de contrats fournisseurs ;

\- gestion avancée des partenariats ;

\- automatisation des relances ;

\- modèles de conditions tarifaires.



Ces fonctionnalités ne sont pas obligatoires pour le MVP.



\---



\# 27. Critères d’acceptation du module



Le module Tiers sera considéré comme fonctionnel lorsque :



1\. un utilisateur autorisé peut créer un client ;

2\. un utilisateur autorisé peut créer un fournisseur ;

3\. un utilisateur autorisé peut créer un partenariat ;

4\. les listes correspondantes sont disponibles ;

5\. les tiers peuvent être recherchés ;

6\. les tiers peuvent être filtrés ;

7\. chaque tiers possède une fiche détaillée ;

8\. les clients peuvent disposer de tarifs préférentiels ;

9\. les tarifs préférentiels possèdent des règles de validité ;

10\. le tarif réellement appliqué à une opération est conservé ;

11\. les fournisseurs peuvent être associés aux véhicules ;

12\. les dépenses de maintenance peuvent être liées aux véhicules ;

13\. les dépenses imputables peuvent être reliées aux fournisseurs ;

14\. les imputations fournisseurs sont traçables ;

15\. les clients sont réutilisables dans les réservations et factures ;

16\. les fournisseurs sont réutilisables dans les opérations financières ;

17\. les doublons potentiels peuvent être détectés ;

18\. l’archivage ne détruit pas l’historique ;

19\. les permissions sont respectées ;

20\. les informations sensibles sont protégées ;

21\. le module est responsive ;

22\. les actions importantes sont traçables.



\---



\# 28. Principe directeur



Le module Tiers doit devenir le référentiel relationnel central d’ADIKOM PILOT.



Il doit permettre de passer naturellement :



\*\*Client → Réservation → Location → Facture → Paiement\*\*



\*\*Fournisseur → Véhicule → Maintenance → Dépense → Imputation → Facture fournisseur\*\*



\*\*Partenaire → Projet → Actions → Suivi\*\*



Le principe fondamental est :



\*\*Une relation enregistrée une fois → une information réutilisable partout où elle est nécessaire.\*\*



Le module doit garantir que les informations des clients, fournisseurs et partenaires restent cohérentes, accessibles aux bons utilisateurs et suffisamment structurées pour alimenter l’ensemble du système ADIKOM PILOT.

