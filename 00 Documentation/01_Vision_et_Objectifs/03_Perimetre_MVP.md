\# ADIKOM PILOT

\## Périmètre du MVP



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT



\---



\## 1. Objet du document



Ce document définit le périmètre fonctionnel de la première version opérationnelle d'ADIKOM PILOT.



L'objectif est de distinguer clairement :



\- ce qui doit être développé dans le MVP ;

\- ce qui constitue le socle nécessaire au fonctionnement du MVP ;

\- ce qui est prévu pour les évolutions futures ;

\- ce qui n'entre pas dans le périmètre actuel.



Le MVP doit rester suffisamment ciblé pour être développé, testé et utilisé réellement par ADIKOM.



Il ne doit cependant pas être conçu comme un prototype jetable.



Le socle technique et fonctionnel doit permettre son évolution progressive vers un système complet de gestion et de pilotage.



\---



\# 2. Principe de périmètre



Le développement commence par la \*\*gestion de location de véhicules\*\*, qui constitue le premier besoin opérationnel prioritaire d'ADIKOM.



Cependant, cette fonctionnalité doit être construite sur un socle permettant notamment :



\- l'authentification ;

\- la gestion des utilisateurs ;

\- la gestion des groupes ;

\- les permissions ;

\- les notifications ;

\- les tiers ;

\- la facturation ;

\- les paiements ;

\- les données financières nécessaires ;

\- la traçabilité ;

\- les paramètres de l'entreprise.



Le MVP doit donc couvrir le cycle réel d'une location sans chercher à développer immédiatement tous les modules futurs de l'entreprise.



\---



\# 3. Périmètre global du MVP



Le MVP comprend les éléments suivants :



1\. Authentification et accès

2\. Tableau de bord

3\. Centre de notifications

4\. Tiers

5\. Gestion de location

6\. Facturation et paiements liés à la location

7\. Utilisateurs et groupes

8\. Permissions

9\. Paramètres essentiels de l'entreprise

10\. Journalisation et traçabilité des opérations importantes



Les modules Banque \& Caisse et Projets \& Planification sont prévus dans l'architecture globale du SaaS, mais leur niveau d'implémentation doit être déterminé en fonction des besoins du MVP et des dépendances fonctionnelles.



\---



\# 4. Authentification et accès



Le MVP doit permettre aux utilisateurs internes autorisés d'accéder au système de manière sécurisée.



Le système doit prévoir :



\- connexion ;

\- déconnexion ;

\- gestion de session ;

\- contrôle d'accès ;

\- protection des routes ;

\- gestion du Super Admin ;

\- gestion des utilisateurs internes.



ADIKOM PILOT ne doit pas permettre de connexion publique de clients, fournisseurs ou partenaires.



\---



\# 5. Super Admin



Le MVP doit disposer d'un compte Super Admin.



Le Super Admin doit pouvoir :



\- créer des utilisateurs ;

\- modifier les utilisateurs ;

\- désactiver un utilisateur ;

\- créer des groupes ;

\- modifier les groupes ;

\- attribuer les groupes ;

\- gérer les permissions ;

\- accéder aux fonctions d'administration ;

\- accéder à l'ensemble des modules autorisés par le système.



Le Super Admin constitue le niveau d'administration principal du SaaS.



Les mécanismes de sécurité doivent empêcher un utilisateur standard de s'attribuer des privilèges administratifs.



\---



\# 6. Utilisateurs, groupes et permissions



Le MVP doit intégrer une gestion détaillée des accès.



\## Utilisateurs



Le système doit permettre de gérer notamment :



\- identité ;

\- coordonnées ;

\- poste/fonction ;

\- département ;

\- responsable hiérarchique ;

\- statut ;

\- groupe ;

\- informations nécessaires à l'accès au système.



\## Groupes



Le système doit permettre de créer des groupes correspondant aux besoins d'ADIKOM.



\## Permissions



Les permissions doivent pouvoir être définies à différents niveaux :



\- module ;

\- menu ;

\- sous-menu ;

\- action.



Les actions peuvent notamment être :



\- consulter ;

\- créer ;

\- modifier ;

\- supprimer ;

\- valider ;

\- exporter ;

\- imprimer ;

\- administrer.



\---



\# 7. Tableau de bord



Le MVP doit fournir un tableau de bord permettant d'avoir une vision rapide de l'activité.



Le tableau de bord doit notamment pouvoir présenter :



\- locations en cours ;

\- départs prévus ;

\- retours prévus ;

\- véhicules disponibles ;

\- véhicules loués ;

\- véhicules en maintenance ;

\- réservations ;

\- encaissements ;

\- impayés ;

\- alertes ;

\- actions urgentes.



Les informations affichées doivent dépendre des permissions et du rôle de l'utilisateur.



Le tableau de bord du Gérant doit offrir une vision plus large que celui d'un utilisateur opérationnel.



\---



\# 8. Centre de notifications



Le MVP doit intégrer un centre de notifications.



Les notifications peuvent notamment concerner :



\- départ de véhicule ;

\- retour prévu ;

\- nouvelle réservation ;

\- maintenance ;

\- assurance arrivant à échéance ;

\- document arrivant à expiration ;

\- facture impayée ;

\- tâche ou action en retard ;

\- événement nécessitant l'attention d'un utilisateur.



Les notifications importantes doivent pouvoir renvoyer directement vers l'élément concerné.



\---



\# 9. Module Tiers



Le module Tiers fait partie du périmètre fonctionnel du MVP.



\## Clients



Le système doit permettre :



\- nouveau client ;

\- liste des clients ;

\- fiche client ;

\- historique du client ;

\- documents associés ;

\- informations de contact.



\### Tarification préférentielle



La fiche client doit prévoir la gestion de tarifs préférentiels.



Un client peut bénéficier de conditions différentes du tarif standard.



Le système doit pouvoir enregistrer notamment :



\- tarif standard ;

\- tarif préférentiel ;

\- remise ;

\- valeur ;

\- véhicule ou catégorie concernée ;

\- période de validité ;

\- conditions ;

\- statut.



Le tarif effectivement appliqué doit être conservé dans chaque réservation.



Une modification ultérieure des conditions tarifaires ne doit pas modifier les anciennes réservations.



\---



\## Fournisseurs



Le système doit permettre :



\- nouveau fournisseur ;

\- liste des fournisseurs ;

\- fiche fournisseur ;

\- historique ;

\- documents ;

\- factures ;

\- opérations financières liées.



Un fournisseur peut notamment être associé à un ou plusieurs véhicules exploités par ADIKOM.



\---



\## Partenariats



Le système doit prévoir la possibilité de gérer :



\- nouveau partenariat ;

\- liste des partenariats ;

\- informations du partenaire ;

\- conditions ;

\- documents ;

\- statut ;

\- historique.



Le niveau de profondeur fonctionnelle du partenariat pourra évoluer après le MVP.



\---



\# 10. Gestion de location — Cœur du MVP



La gestion de location constitue le cœur du premier produit opérationnel.



Elle doit couvrir le cycle complet :



\*\*Parc → Disponibilité → Réservation → Contrat → Départ → Location → Retour → Contrôle → Facturation → Paiement → Clôture\*\*



\---



\## 10.1. Parc automobile



Le système doit permettre de gérer :



\- véhicules ;

\- catégories ;

\- statuts ;

\- disponibilité ;

\- historique.



Les statuts doivent notamment permettre de distinguer :



\- disponible ;

\- réservé ;

\- loué ;

\- maintenance ;

\- immobilisé.



\---



\## 10.2. Fiche véhicule



Chaque véhicule doit disposer d'une fiche centralisant ses informations.



Elle doit pouvoir contenir notamment :



\- identification ;

\- marque ;

\- modèle ;

\- immatriculation ;

\- catégorie ;

\- année ;

\- kilométrage ;

\- fournisseur associé ;

\- statut ;

\- tarif applicable ;

\- documents ;

\- assurances ;

\- maintenance ;

\- dépenses ;

\- historique des locations.



\---



\## 10.3. Disponibilité



Le système doit permettre de connaître la disponibilité d'un véhicule sur une période donnée.



Une réservation ne doit pas pouvoir créer un conflit avec une location ou une réservation existante incompatible.



Le système doit détecter les chevauchements de périodes et avertir l'utilisateur.



\---



\## 10.4. Tarification



Le système doit permettre de gérer les tarifs de location.



Selon les besoins d'ADIKOM, les tarifs pourront prendre en compte :



\- véhicule ;

\- catégorie ;

\- durée ;

\- période ;

\- kilométrage ;

\- options ;

\- assurance ;

\- remise ;

\- conditions particulières ;

\- tarif préférentiel client.



Le prix appliqué à une réservation doit être enregistré avec cette réservation.



\---



\## 10.5. Réservations



Le système doit permettre :



\- nouvelle réservation ;

\- liste des réservations ;

\- consultation ;

\- modification selon permissions ;

\- annulation selon permissions ;

\- suivi du statut.



Une réservation doit pouvoir être associée notamment à :



\- un client ;

\- un véhicule ;

\- une période ;

\- un tarif ;

\- des options ;

\- une caution ;

\- un acompte ;

\- un montant total ;

\- un solde.



\---



\## 10.6. Contrats



Une réservation confirmée doit pouvoir être transformée en contrat de location.



Le contrat doit conserver les informations nécessaires à l'exécution de la location.



\---



\## 10.7. Départ du véhicule



Le système doit permettre d'enregistrer les informations du départ :



\- date ;

\- heure ;

\- kilométrage ;

\- carburant ;

\- état du véhicule ;

\- dommages constatés ;

\- photos ou documents si prévus ;

\- observations ;

\- éléments remis ;

\- validation.



\---



\## 10.8. Retour du véhicule



Le retour doit permettre de renseigner :



\- date ;

\- heure ;

\- kilométrage ;

\- carburant ;

\- état du véhicule ;

\- dommages ;

\- observations ;

\- frais éventuels.



Le système doit pouvoir comparer les informations de départ et de retour.



\---



\## 10.9. Dommages



Le MVP doit permettre de déclarer les dommages constatés sur un véhicule.



Un dommage doit pouvoir être associé à :



\- véhicule ;

\- location ;

\- date ;

\- description ;

\- emplacement ;

\- gravité ;

\- photographie ou justificatif si disponible ;

\- coût estimé ou réel ;

\- responsabilité ;

\- statut.



\---



\## 10.10. Maintenance



Le MVP doit permettre de suivre les opérations de maintenance :



\- panne ;

\- maintenance préventive ;

\- maintenance corrective ;

\- réparation ;

\- coût ;

\- date ;

\- fournisseur/intervenant ;

\- justificatif ;

\- prochaine échéance.



Chaque opération doit être rattachée au véhicule concerné.



\---



\## 10.11. Imputation des frais de maintenance au fournisseur



Le MVP doit gérer le cas où les frais de réparation d'un véhicule fourni par un fournisseur sont imputables à ce fournisseur.



Exemple :



\*\*Montant fournisseur : 500 000 KMF\*\*



\*\*Frais de réparation : 300 000 KMF\*\*



\*\*Montant net après imputation : 200 000 KMF\*\*



L'opération doit conserver la traçabilité entre :



\*\*Fournisseur → Véhicule → Incident → Maintenance → Dépense → Imputation → Facture fournisseur → Solde\*\*



La dépense de maintenance ne doit pas être supprimée ou masquée.



La déduction doit constituer une opération distincte et traçable.



\---



\## 10.12. Documents et assurances



Le MVP doit permettre d'associer des documents importants aux véhicules.



Selon les besoins :



\- assurance ;

\- carte grise ;

\- visite technique ;

\- justificatifs de maintenance ;

\- autres documents.



Le système doit pouvoir signaler les documents proches de leur expiration lorsque les dates sont renseignées.



\---



\## 10.13. Kilométrage et carburant



Le système doit permettre de conserver les informations de kilométrage et de carburant liées à l'exploitation du véhicule.



Ces données doivent pouvoir être utilisées pour :



\- suivi ;

\- contrôle ;

\- maintenance ;

\- analyse des coûts.



\---



\# 11. Facturation et paiements liés à la location



Le MVP doit permettre de relier la location à la facturation.



Le cycle doit pouvoir être :



\*\*Location → Facture → Paiement → Solde\*\*



Une facture doit conserver les informations nécessaires à son suivi.



Le système doit pouvoir distinguer notamment :



\- montant total ;

\- acompte ;

\- paiements reçus ;

\- reste à payer ;

\- statut.



\---



\# 12. Facturation fournisseur liée à la location



Le système doit également permettre de suivre les factures fournisseurs lorsque celles-ci sont liées à l'exploitation des véhicules.



Lorsqu'une dépense de maintenance est imputée à un fournisseur, cette opération doit pouvoir être rattachée à la créance ou à la facture concernée.



Le système doit afficher de manière transparente :



\*\*Montant brut\*\*



\*\*Déductions justifiées\*\*



\*\*Montant net à payer\*\*



\---



\# 13. Banques et caisses



Le module Banques \& Caisses fait partie de l'architecture fonctionnelle du SaaS.



Pour le MVP, seules les fonctionnalités nécessaires aux flux financiers de la location doivent être développées en priorité.



Le système doit notamment pouvoir prendre en compte :



\- comptes ;

\- caisses ;

\- paiements ;

\- encaissements ;

\- sorties ;

\- virements internes ;

\- écritures ;

\- soldes.



Les fonctionnalités financières plus avancées pourront être développées progressivement.



\---



\# 14. Projets \& Planification



Le module est prévu dans l'architecture globale.



Il est particulièrement destiné aux besoins d'organisation de l'Assistant(e) de direction.



Le MVP peut intégrer les fonctionnalités essentielles nécessaires au suivi :



\- projets ;

\- tâches ;

\- échéances ;

\- actions ;

\- réunions ;

\- rendez-vous ;

\- décisions.



Les fonctionnalités avancées de gestion de projet pourront être développées dans une phase ultérieure si elles ne sont pas nécessaires au fonctionnement initial.



\---



\# 15. Paramètres



Le MVP doit prévoir les paramètres essentiels au fonctionnement du système.



Cela comprend notamment :



\- identité de l'entreprise ;

\- logo ;

\- coordonnées ;

\- devise ;

\- paramètres de location nécessaires ;

\- paramètres de facturation nécessaires ;

\- paramètres des notifications ;

\- paramètres de sécurité nécessaires.



Les paramètres techniques sensibles doivent rester accessibles uniquement aux utilisateurs autorisés.



\---



\# 16. Journalisation et audit



Le MVP doit conserver la trace des opérations sensibles.



Les événements importants doivent pouvoir enregistrer :



\- utilisateur ;

\- action ;

\- date et heure ;

\- élément concerné ;

\- résultat de l'action.



Une attention particulière doit être portée aux :



\- opérations financières ;

\- modifications de tarifs ;

\- réservations ;

\- contrats ;

\- paiements ;

\- permissions ;

\- suppressions ;

\- imputations fournisseurs ;

\- opérations de maintenance.



\---



\# 17. Fonctionnalités hors périmètre du MVP



Les fonctionnalités suivantes ne doivent pas être développées prématurément si elles ne sont pas nécessaires au fonctionnement du MVP :



\- espace client externe ;

\- portail fournisseur externe ;

\- portail partenaire externe ;

\- réservation publique ;

\- application mobile native ;

\- fonctionnalités avancées de CRM ;

\- comptabilité complète ;

\- gestion RH complète ;

\- gestion avancée des stocks ;

\- automatisations complexes non nécessaires ;

\- intelligence artificielle métier avancée ;

\- modules secondaires sans besoin opérationnel immédiat.



Ces fonctionnalités pourront être étudiées dans des phases ultérieures.



\---



\# 18. Principe de développement progressif



Le fait qu'une fonctionnalité soit mentionnée dans la vision globale ne signifie pas qu'elle doit être développée immédiatement.



Chaque fonctionnalité doit être classée selon :



\- nécessaire au MVP ;

\- utile mais non prioritaire ;

\- prévue pour une phase ultérieure ;

\- hors périmètre.



Le MVP doit rester focalisé sur la valeur opérationnelle.



\---



\# 19. Critères de sortie du MVP



Le MVP pourra être considéré comme opérationnel lorsque ADIKOM pourra notamment :



1\. créer et gérer ses utilisateurs internes ;

2\. gérer les permissions ;

3\. créer des clients et leurs conditions tarifaires ;

4\. créer des fournisseurs ;

5\. enregistrer les véhicules ;

6\. connaître leur disponibilité ;

7\. créer une réservation ;

8\. appliquer le tarif correspondant au client ;

9\. établir le contrat ;

10\. enregistrer le départ ;

11\. enregistrer le retour ;

12\. constater un dommage ;

13\. enregistrer une maintenance ;

14\. enregistrer les coûts de maintenance ;

15\. imputer une dépense de maintenance à un fournisseur lorsque cela est applicable ;

16\. calculer le montant restant dû au fournisseur ;

17\. facturer la location ;

18\. enregistrer les paiements ;

19\. suivre les soldes ;

20\. consulter les informations essentielles depuis le tableau de bord ;

21\. recevoir les notifications importantes ;

22\. retrouver l'historique des opérations importantes.



\---



\# 20. Définition du succès



Le MVP est réussi s'il permet à ADIKOM de remplacer une partie significative de ses opérations manuelles par un processus numérique cohérent.



Le critère principal n'est pas le nombre de fonctionnalités développées.



Le critère principal est :



\*\*ADIKOM doit pouvoir utiliser réellement ADIKOM PILOT pour gérer son activité de location de véhicules au quotidien.\*\*



Le système doit être suffisamment fiable pour être utilisé dans les opérations réelles, tout en constituant une base solide pour les futurs modules.



\---



\## 21. Principe directeur du périmètre



> \*\*Commencer petit, mais construire correctement.\*\*



Le MVP doit être concentré sur la gestion de location de véhicules, tout en établissant les fondations nécessaires à la future plateforme de gestion et de pilotage d'ADIKOM.



Aucune fonctionnalité ne doit être ajoutée uniquement pour augmenter le périmètre.



Chaque développement doit répondre à un besoin identifié, être cohérent avec l'architecture globale et pouvoir être maintenu dans le temps.

