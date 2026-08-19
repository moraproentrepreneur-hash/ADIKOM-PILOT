\# ADIKOM PILOT

\## Module 05 — Gestion de location



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence fonctionnelle  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP — Module central



\---



\# 1. Objet du module



Le module Gestion de location constitue le \*\*cœur opérationnel du MVP d’ADIKOM PILOT\*\*.



Il doit permettre à ADIKOM de gérer l’intégralité du cycle de location de véhicules, depuis la disponibilité du véhicule jusqu’à son retour, en passant par la réservation, le contrat, le départ, le suivi de la location, les éventuels incidents, la maintenance et la facturation.



Le module doit également tenir compte du modèle particulier d’ADIKOM dans lequel certains véhicules peuvent appartenir à des fournisseurs externes.



Le système doit donc être capable de relier :



\*\*Client → Réservation → Véhicule → Fournisseur → Contrat → Départ → Location → Retour → Maintenance → Facturation → Paiement\*\*



L’objectif n’est pas seulement de gérer des réservations.



Le module doit permettre à ADIKOM de \*\*piloter son parc de véhicules, ses locations, ses revenus, ses coûts et les relations opérationnelles avec les fournisseurs.\*\*



\---



\# 2. Objectifs



Le module doit permettre de :



1\. gérer le parc de véhicules destiné à la location ;

2\. enregistrer les véhicules et leurs informations ;

3\. identifier le fournisseur propriétaire ou associé au véhicule ;

4\. gérer les catégories de véhicules ;

5\. gérer les disponibilités ;

6\. gérer les tarifs ;

7\. gérer les tarifs préférentiels des clients ;

8\. créer et suivre les réservations ;

9\. éviter les doubles réservations ;

10\. préparer les départs ;

11\. gérer les contrats de location ;

12\. enregistrer les états du véhicule au départ ;

13\. enregistrer les retours ;

14\. gérer les dommages ;

15\. gérer les maintenances ;

16\. suivre les coûts liés aux véhicules ;

17\. gérer les immobilisations ;

18\. relier les opérations de location à la facturation ;

19\. relier les dépenses imputables aux fournisseurs ;

20\. conserver un historique complet ;

21\. fournir des données fiables au tableau de bord ;

22\. permettre une utilisation simple et rapide par les équipes d’ADIKOM.



\---



\# 3. Principe général du cycle de location



Le cycle principal doit suivre une logique structurée :



Client

&#x20;  ↓

Réservation

&#x20;  ↓

Vérification disponibilité

&#x20;  ↓

Affectation véhicule

&#x20;  ↓

Tarification

&#x20;  ↓

Contrat

&#x20;  ↓

Préparation

&#x20;  ↓

Départ

&#x20;  ↓

Location en cours

&#x20;  ↓

Retour

&#x20;  ↓

Contrôle

&#x20;  ↓

Dommages / frais éventuels

&#x20;  ↓

Clôture

&#x20;  ↓

Facturation

&#x20;  ↓

Paiement



Certains événements peuvent interrompre ou modifier ce cycle.



Exemple :



Location en cours

&#x20;  ↓

Panne

&#x20;  ↓

Maintenance

&#x20;  ↓

Véhicule immobilisé

&#x20;  ↓

Traitement de l'incident

&#x20;  ↓

Reprise de la location ou remplacement du véhicule



\---



\# 4. Structure générale du module



Le module doit être organisé autour des éléments suivants :



Gestion de location

│

├── Tableau de location

├── Réservations

├── Locations

├── Parc automobile

├── Véhicules

├── Catégories

├── Tarification

├── Départs

├── Retours

├── Maintenance

├── Dommages \& Incidents

└── Documents



L’organisation exacte des menus et sous-menus pourra être adaptée lors de la conception UX/UI.



Le principe fonctionnel doit toutefois rester intact.



\---



\# 5. Tableau de location



Le Tableau de location constitue le centre opérationnel du module.



Il doit permettre de visualiser rapidement :



\- réservations ;

\- locations en cours ;

\- départs ;

\- retours ;

\- véhicules disponibles ;

\- véhicules réservés ;

\- véhicules en maintenance ;

\- véhicules immobilisés ;

\- opérations nécessitant une action.



Il doit donner une vision immédiate de l’activité de location.



\---



\# 6. Vue calendrier



Une vue calendrier doit permettre de visualiser l’utilisation des véhicules dans le temps.



Elle peut afficher :



\- réservation ;

\- location ;

\- départ ;

\- retour ;

\- indisponibilité ;

\- maintenance.



La représentation doit permettre d’identifier rapidement les conflits.



Exemple :



Toyota T5

20/08 → 23/08 : Location A



Si une autre réservation tente d’utiliser le même véhicule sur une période incompatible, le système doit détecter le conflit.



\---



\# 7. Disponibilité des véhicules



La disponibilité constitue une donnée centrale du module.



Pour chaque véhicule, le système doit pouvoir déterminer son état à un instant donné.



Les principaux états sont :



\- Disponible ;

\- Réservé ;

\- En préparation ;

\- En location ;

\- En retour ;

\- En maintenance ;

\- Immobilisé ;

\- Indisponible.



Le statut doit être cohérent avec les opérations enregistrées.



\---



\# 8. Règle de disponibilité



Un véhicule ne doit pas pouvoir être attribué à deux locations incompatibles dans le temps.



Le système doit vérifier :



\- période de réservation ;

\- période de location ;

\- maintenance ;

\- indisponibilité ;

\- immobilisation.



Une réservation incompatible doit être bloquée ou signalée avant sa validation.



\---



\# 9. Parc automobile



Le parc automobile constitue le référentiel des véhicules exploités par ADIKOM dans le cadre de la location.



Le parc peut comprendre :



\- véhicules appartenant à ADIKOM ;

\- véhicules appartenant à des fournisseurs ;

\- véhicules temporairement mis à disposition ;

\- véhicules retirés du parc.



Le système doit distinguer les informations de propriété ou de mise à disposition lorsque cela est nécessaire.



\---



\# 10. Catégories de véhicules



Les véhicules doivent pouvoir être regroupés par catégorie.



Exemples :



\- citadine ;

\- berline ;

\- SUV ;

\- utilitaire ;

\- minibus ;

\- véhicule de tourisme ;

\- autre catégorie définie par ADIKOM.



Une catégorie peut notamment définir des caractéristiques tarifaires.



\---



\# 11. Fiche véhicule



Chaque véhicule doit disposer d’une fiche complète.



Elle peut contenir :



\- immatriculation ;

\- marque ;

\- modèle ;

\- année ;

\- catégorie ;

\- couleur ;

\- carburant ;

\- transmission ;

\- nombre de places ;

\- kilométrage ;

\- statut ;

\- fournisseur ;

\- date d’intégration ;

\- informations administratives ;

\- assurance ;

\- documents ;

\- notes.



\---



\# 12. Identifiant du véhicule



Chaque véhicule doit disposer d’un identifiant interne unique.



Exemple :



VEH-000001



L’immatriculation doit également être unique selon les règles applicables.



Le système doit éviter qu’un même véhicule soit enregistré plusieurs fois par erreur.



\---



\# 13. Véhicule et fournisseur



Un véhicule peut être associé à un fournisseur.



Exemple :



Fournisseur A

&#x20;  ↓

Toyota T5

&#x20;  ↓

Disponible à la location



La fiche véhicule doit permettre de retrouver le fournisseur associé.



La fiche fournisseur doit également permettre de retrouver les véhicules qui lui sont associés.



\---



\# 14. Historique du fournisseur du véhicule



Lorsque le fournisseur associé à un véhicule change, le système doit pouvoir conserver l’historique lorsque cela est nécessaire.



L’objectif est de pouvoir comprendre :



\- quel fournisseur était associé ;

\- pendant quelle période ;

\- quelles opérations ont eu lieu ;

\- quelles dépenses ou imputations concernent cette relation.



\---



\# 15. Documents du véhicule



La fiche véhicule doit pouvoir centraliser les documents associés.



Exemples :



\- carte grise ;

\- assurance ;

\- visite technique ;

\- documents administratifs ;

\- contrats ;

\- justificatifs ;

\- documents de maintenance.



Les documents doivent pouvoir disposer d’une date d’expiration lorsque cela est pertinent.



\---



\# 16. Alertes documentaires



Le système doit pouvoir détecter les documents arrivant à échéance.



Exemple :



Assurance

Expiration : 30/09/2026



Le système peut générer des rappels :



\- 30 jours avant ;

\- 15 jours avant ;

\- 7 jours avant ;

\- à l’expiration.



Les délais exacts pourront être configurables.



\---



\# 17. Tarification



La tarification constitue une partie importante de la gestion de location.



Le système doit permettre de définir les tarifs applicables aux véhicules ou catégories.



Les tarifs peuvent dépendre notamment de :



\- catégorie ;

\- véhicule ;

\- durée ;

\- période ;

\- conditions commerciales ;

\- client ;

\- tarif préférentiel.



\---



\# 18. Tarif standard



Le tarif standard constitue le tarif de référence.



Exemple :



Toyota T5

Tarif standard :

500 000 KMF



Lorsqu’aucune règle tarifaire particulière n’est applicable, le système utilise le tarif standard.



\---



\# 19. Tarifs préférentiels clients



Un client peut disposer d’un tarif préférentiel.



Exemple :



Tarif standard :

500 000 KMF



Client A :

450 000 KMF



Le tarif préférentiel doit pouvoir être associé au client depuis sa fiche dans le module Tiers.



Le module Gestion de location doit être capable d’utiliser cette condition lors de la création d’une réservation.



\---



\# 20. Application du tarif préférentiel



Lorsqu’une réservation est créée, le système doit déterminer automatiquement le tarif applicable selon les règles définies.



La logique peut être :



Tarif spécifique véhicule

&#x20;  ↓

Tarif spécifique catégorie

&#x20;  ↓

Tarif préférentiel client

&#x20;  ↓

Tarif standard



La règle définitive doit être centralisée et ne doit pas être réinventée différemment dans chaque écran.



> \*\*Décision arbitrée — DEC-002\*\*
>
> Cet ordre contredisait `05\_Regles\_Metier/01\_Location.md` §40, qui plaçait le tarif préférentiel client en premier.
>
> Ordre retenu : \*\*le tarif le plus spécifique gagne\*\* —
> client+véhicule → client+catégorie → client → véhicule → catégorie → standard.
>
> Voir `08\_Decisions/01\_Journal\_des\_Decisions.md`.



\---



\# 21. Verrouillage du tarif appliqué



Lorsqu’une réservation ou une location est confirmée, le tarif réellement appliqué doit être conservé.



Une modification ultérieure de la grille tarifaire ne doit pas modifier automatiquement les anciennes opérations.



Exemple :



Réservation :

20/08/2026



Tarif appliqué :

450 000 KMF



Le tarif client est ensuite modifié.



La réservation existante doit conserver son tarif de 450 000 KMF.



Toute modification manuelle doit être explicite et traçable.



\---



\# 22. Réservations



Une réservation représente une demande planifiée de location.



Elle doit permettre de préparer la future location avant le départ.



Une réservation peut contenir :



\- client ;

\- véhicule ou catégorie demandée ;

\- date de début ;

\- date de fin ;

\- heure de départ ;

\- heure de retour ;

\- tarif ;

\- conditions ;

\- statut ;

\- notes ;

\- documents.



\---



\# 23. Statuts des réservations



Les statuts peuvent notamment être :



\- Brouillon ;

\- En attente ;

\- Confirmée ;

\- Préparation ;

\- En cours ;

\- Terminée ;

\- Annulée ;

\- Expirée.



Les statuts doivent refléter le cycle réel.



\---



\# 24. Création d’une réservation



Lors de la création d’une réservation, le système doit permettre de sélectionner :



1\. client ;

2\. période ;

3\. catégorie ou véhicule ;

4\. tarif applicable ;

5\. conditions ;

6\. informations complémentaires.



Le système doit vérifier la disponibilité avant la confirmation.



\---



\# 25. Recherche de disponibilité



La recherche doit permettre de trouver les véhicules disponibles pour une période donnée.



Exemple :



Du 20/08/2026 au 23/08/2026



Résultat :



Toyota T5 — Disponible

Toyota Hiace — Disponible

Nissan X-Trail — Indisponible



Les résultats doivent prendre en compte les réservations, locations et indisponibilités existantes.



\---



\# 26. Affectation du véhicule



Une réservation peut être créée à partir d’une catégorie puis recevoir un véhicule précis ultérieurement.



Exemple :



Demande :

SUV



Après vérification :



Véhicule affecté :

Toyota T5



L’affectation doit être enregistrée.



\---



\# 27. Modification d’une réservation



Un utilisateur autorisé peut modifier une réservation selon ses permissions.



Les modifications importantes peuvent concerner :



\- client ;

\- véhicule ;

\- période ;

\- tarif ;

\- conditions ;

\- statut.



Toute modification pouvant avoir un impact financier ou opérationnel doit être traçable.



\---



\# 28. Annulation d’une réservation



Une réservation peut être annulée selon les permissions.



L’annulation doit conserver l’historique.



Elle ne doit pas supprimer la réservation de manière définitive.



Le système doit pouvoir enregistrer :



\- motif ;

\- utilisateur ;

\- date ;

\- heure.



\---



\# 29. Contrat de location



La réservation peut donner lieu à un contrat de location.



Le contrat doit regrouper les informations nécessaires à la location.



Il peut notamment contenir :



\- client ;

\- véhicule ;

\- période ;

\- tarif ;

\- conditions ;

\- kilométrage initial ;

\- carburant initial ;

\- état du véhicule ;

\- informations contractuelles ;

\- signature lorsque prévue.



\---



\# 30. Départ



Le départ représente le moment où le véhicule est effectivement remis au client.



Avant le départ, le système doit pouvoir vérifier :



\- véhicule disponible ;

\- contrat préparé ;

\- documents nécessaires ;

\- paiement ou condition financière lorsque requis ;

\- état du véhicule ;

\- kilométrage ;

\- carburant.



\---



\# 31. État des lieux de départ



L’état du véhicule au départ doit pouvoir être enregistré.



Il peut contenir :



\- kilométrage ;

\- niveau de carburant ;

\- état extérieur ;

\- état intérieur ;

\- dommages existants ;

\- photos ;

\- observations.



Les dommages déjà présents doivent être distingués des dommages éventuellement constatés au retour.



\---



\# 32. Photos de départ



Lorsque cela est nécessaire, des photos peuvent être associées à l’état des lieux.



Les photos peuvent documenter :



\- carrosserie ;

\- pare-chocs ;

\- pneus ;

\- intérieur ;

\- tableau de bord ;

\- autres éléments.



Les fichiers doivent être liés à l’opération concernée.



\---



\# 33. Location en cours



Une fois le départ validé, la réservation devient une location active.



La location doit pouvoir être suivie pendant toute sa durée.



Informations principales :



\- client ;

\- véhicule ;

\- date de départ ;

\- retour prévu ;

\- kilométrage initial ;

\- carburant initial ;

\- tarif ;

\- montant ;

\- statut.



\---



\# 34. Prolongation de location



Une location peut être prolongée lorsque cela est nécessaire.



Avant de valider la prolongation, le système doit vérifier :



\- disponibilité du véhicule ;

\- absence de réservation incompatible ;

\- nouvelle date de retour ;

\- nouveau montant ;

\- conditions applicables.



La prolongation doit être enregistrée dans l’historique.



\---



\# 35. Retour



Le retour constitue une étape essentielle.



Lors du retour, le système doit permettre d’enregistrer :



\- date ;

\- heure ;

\- kilométrage final ;

\- carburant final ;

\- état du véhicule ;

\- dommages ;

\- observations ;

\- photos ;

\- éventuels frais supplémentaires.



\---



\# 36. Contrôle de retour



Le système doit comparer les informations de départ et de retour.



Exemples :



Kilométrage initial :

50 000 km



Kilométrage final :

50 800 km



Distance :

800 km



Carburant initial :

3/4



Carburant final :

1/2



Ces informations peuvent servir au calcul d’éventuels frais selon les règles commerciales d’ADIKOM.



\---



\# 37. Dommages



Les dommages constatés au retour doivent pouvoir être enregistrés.



Chaque dommage peut contenir :



\- description ;

\- localisation ;

\- gravité ;

\- photos ;

\- date ;

\- responsable de la saisie ;

\- coût estimé ;

\- coût réel lorsque disponible ;

\- statut.



\---



\# 38. Différence entre dommage et maintenance



Le système doit distinguer :



\*\*Dommage\*\*



et



\*\*Maintenance\*\*



Un dommage correspond à un problème constaté sur le véhicule.



Une maintenance correspond à l’intervention nécessaire pour réparer, entretenir ou remettre le véhicule en état.



Exemple :



Dommage :

Pare-chocs avant endommagé.



Maintenance :

Remplacement du pare-chocs.



\---



\# 39. Incidents



Les incidents peuvent être enregistrés lorsqu’un événement particulier survient pendant une location.



Exemples :



\- panne ;

\- accident ;

\- crevaison ;

\- problème mécanique ;

\- problème électrique ;

\- perte d’un document ;

\- autre incident.



Un incident peut être associé à une maintenance.



\---



\# 40. Maintenance



La maintenance doit permettre de suivre les interventions réalisées ou prévues sur les véhicules.



Elle peut contenir :



\- véhicule ;

\- fournisseur ;

\- type d’intervention ;

\- motif ;

\- date ;

\- kilométrage ;

\- prestataire ;

\- coût ;

\- documents ;

\- statut ;

\- imputation éventuelle.



\---



\# 41. Types de maintenance



Le système peut distinguer :



\- entretien préventif ;

\- entretien périodique ;

\- réparation ;

\- maintenance corrective ;

\- maintenance urgente.



Les catégories exactes peuvent évoluer.



\---



\# 42. Statuts de maintenance



Les statuts peuvent notamment être :



\- Planifiée ;

\- En attente ;

\- En cours ;

\- Terminée ;

\- Annulée.



Une maintenance en cours doit pouvoir entraîner l’indisponibilité du véhicule.



\---



\# 43. Immobilisation du véhicule



Lorsqu’un véhicule est immobilisé pour maintenance, son statut doit empêcher son affectation à une nouvelle location incompatible.



Exemple :



Toyota T5

Statut :

En maintenance



Le véhicule ne doit pas apparaître comme disponible pour une nouvelle réservation.



\---



\# 44. Maintenance et fournisseur



Lorsqu’un véhicule appartient ou est associé à un fournisseur, une maintenance peut être imputable à ce fournisseur selon les conditions convenues.



Le système doit pouvoir relier :



Véhicule

→ Fournisseur

→ Maintenance

→ Dépense

→ Imputation



\---



\# 45. Exemple d’imputation fournisseur



Situation :



Fournisseur A

Véhicule :

Toyota T5



Montant fournisseur :

500 000 KMF



Panne :

Toyota T5



Réparation :

300 000 KMF



ADIKOM prend en charge la réparation.



La dépense est déclarée imputable au fournisseur.



Le système enregistre :



Dépense :

300 000 KMF



Imputation fournisseur :

300 000 KMF



Facture fournisseur :

500 000 KMF



Solde fournisseur :

200 000 KMF



Cette relation doit être traçable de bout en bout.



\---



\# 46. Contrôle des imputations



Une dépense ne doit pas être imputée deux fois.



Le système doit empêcher les incohérences.



Exemple :



Dépense :

300 000 KMF



Déjà imputé :

300 000 KMF



Nouvelle tentative :

100 000 KMF



Résultat :



Opération refusée car le montant total imputé dépasserait le montant disponible.



\---



\# 47. Imputation partielle



Le système doit permettre une imputation partielle lorsque nécessaire.



Exemple :



Dépense :

300 000 KMF



Première imputation :

150 000 KMF



Reste :

150 000 KMF



Deuxième imputation :

100 000 KMF



Reste :

50 000 KMF



Chaque opération doit rester historisée.



\---



\# 48. Facturation client



Une location peut générer une facture client.



La facture doit pouvoir reprendre les éléments nécessaires :



\- client ;

\- location ;

\- période ;

\- véhicule ;

\- tarif ;

\- quantité ou durée ;

\- montant ;

\- éventuelles prestations supplémentaires ;

\- taxes lorsque applicables ;

\- total.



La facturation détaillée relève du module Facturation \& Paiement, mais la Gestion de location doit fournir les données nécessaires.



\---



\# 49. Paiement client



Les paiements sont gérés dans le module Facturation \& Paiement.



La location doit néanmoins pouvoir afficher le statut financier pertinent.



Exemples :



\- Non payé ;

\- Partiellement payé ;

\- Payé.



La location ne doit pas dupliquer le système de paiement.



Elle doit référencer les données financières nécessaires.



\---



\# 50. Frais supplémentaires



Selon les règles commerciales d’ADIKOM, une location peut entraîner des frais supplémentaires.



Exemples :



\- prolongation ;

\- carburant ;

\- kilométrage supplémentaire ;

\- dommage ;

\- prestation supplémentaire ;

\- retard ;

\- autre frais autorisé.



Ces frais doivent être clairement identifiés avant d’être intégrés à la facturation.



\---



\# 51. Historique de la location



Chaque location doit disposer d’un historique.



Il doit permettre de retrouver les principales étapes :



\- réservation ;

\- confirmation ;

\- affectation du véhicule ;

\- contrat ;

\- départ ;

\- modification ;

\- prolongation ;

\- incident ;

\- maintenance ;

\- retour ;

\- facturation ;

\- paiement ;

\- clôture.



\---



\# 52. Statuts d’une location



Une location peut utiliser les statuts suivants :



\- Préparation ;

\- Confirmée ;

\- En cours ;

\- Prolongée ;

\- Retour en attente ;

\- Retournée ;

\- À facturer ;

\- Facturée ;

\- Clôturée ;

\- Annulée.



Les statuts exacts peuvent être affinés pendant le développement.



\---



\# 53. Recherche des locations



La liste des locations doit permettre de rechercher par :



\- client ;

\- véhicule ;

\- fournisseur ;

\- période ;

\- statut ;

\- numéro de contrat ;

\- numéro de réservation.



\---



\# 54. Filtres des locations



Les filtres peuvent notamment inclure :



\- location en cours ;

\- départ aujourd’hui ;

\- retour aujourd’hui ;

\- retour en retard ;

\- véhicule ;

\- client ;

\- statut ;

\- période.



\---



\# 55. Fiche location



La fiche location doit constituer un point central.



Elle peut être organisée comme suit :



Fiche location

│

├── Résumé

├── Client

├── Véhicule

├── Contrat

├── Départ

├── Location

├── Retour

├── État des lieux

├── Dommages

├── Incidents

├── Facturation

├── Paiements

├── Documents

└── Historique



Les informations financières peuvent être masquées pour les utilisateurs ne disposant pas des permissions nécessaires.



\---



\# 56. Actions rapides sur une location



Selon les permissions et l’état de la location, les actions disponibles peuvent inclure :



\- modifier ;

\- confirmer ;

\- affecter un véhicule ;

\- générer le contrat ;

\- enregistrer le départ ;

\- prolonger ;

\- enregistrer un incident ;

\- enregistrer le retour ;

\- ajouter un dommage ;

\- générer les éléments de facturation ;

\- clôturer.



Les actions incompatibles avec l’état actuel doivent être masquées ou désactivées.



\---



\# 57. Règles de cohérence des états



Le système doit empêcher les transitions incohérentes.



Exemple :



Une location clôturée ne doit pas pouvoir être modifiée librement.



Une location déjà retournée ne doit pas pouvoir être repassée en cours sans action explicite et autorisée.



Un véhicule en maintenance ne doit pas pouvoir être affecté à une nouvelle location incompatible.



\---



\# 58. Tableau du parc



Le module doit proposer une vue synthétique du parc.



Exemple :



Véhicule | Catégorie | Fournisseur | Statut | Localisation | Kilométrage

Toyota T5 | SUV | Fournisseur A | Disponible | Moroni | 50 000 km

Toyota Hiace | Utilitaire | Fournisseur B | En location | Moroni | 72 000 km

Nissan X-Trail | SUV | ADIKOM | Maintenance | Atelier | 65 000 km



Les informations affichées doivent respecter les permissions.



\---



\# 59. Rentabilité et indicateurs



Le module doit préparer les données nécessaires aux indicateurs de performance.



Exemples futurs ou selon le périmètre MVP :



\- nombre de locations ;

\- taux d’utilisation ;

\- revenus par véhicule ;

\- revenus par catégorie ;

\- coût de maintenance ;

\- coût d’immobilisation ;

\- marge estimée ;

\- rentabilité par véhicule ;

\- rentabilité par période.



Les calculs financiers détaillés doivent être cohérents avec les données du module Facturation \& Paiement.



\---



\# 60. Tableau de bord du module



Le module peut disposer d’un tableau de bord spécialisé.



Il peut afficher :



\- locations en cours ;

\- réservations ;

\- départs ;

\- retours ;

\- retours en retard ;

\- véhicules disponibles ;

\- véhicules en maintenance ;

\- véhicules immobilisés ;

\- revenus de location ;

\- alertes importantes.



Ce tableau de bord doit alimenter le Tableau de bord général lorsqu’un indicateur est pertinent.



\---



\# 61. Notifications



Le module doit être connecté au Centre de notifications.



Les événements pouvant générer des notifications comprennent :



\- nouvelle réservation ;

\- départ imminent ;

\- retour imminent ;

\- retour en retard ;

\- maintenance prévue ;

\- maintenance urgente ;

\- véhicule immobilisé ;

\- document expirant ;

\- incident ;

\- dommage ;

\- changement important d’une location.



Les notifications doivent respecter les permissions.



\---



\# 62. Permissions



Les permissions doivent pouvoir être définies à plusieurs niveaux.



Exemples :



\- consulter le parc ;

\- créer un véhicule ;

\- modifier un véhicule ;

\- archiver un véhicule ;

\- consulter les réservations ;

\- créer une réservation ;

\- modifier une réservation ;

\- annuler une réservation ;

\- gérer les contrats ;

\- enregistrer un départ ;

\- enregistrer un retour ;

\- gérer les dommages ;

\- gérer les incidents ;

\- gérer les maintenances ;

\- gérer les tarifs ;

\- gérer les tarifs préférentiels ;

\- consulter les informations financières ;

\- clôturer une location.



Les permissions exactes seront intégrées au système global de rôles et permissions.



\---



\# 63. Sécurité



Les informations du module doivent être protégées.



Le système doit notamment empêcher :



\- accès à une location non autorisée ;

\- modification non autorisée d’un tarif ;

\- modification non autorisée d’un contrat ;

\- modification d’un paiement depuis le mauvais module ;

\- suppression d’un historique ;

\- contournement des permissions.



Les contrôles doivent être effectués côté serveur.



\---



\# 64. Journal d’activité



Les actions importantes doivent être journalisées.



Exemples :



\- création de réservation ;

\- modification ;

\- annulation ;

\- affectation d’un véhicule ;

\- modification de tarif ;

\- départ ;

\- retour ;

\- dommage ;

\- maintenance ;

\- imputation ;

\- clôture.



Le journal doit identifier :



\- utilisateur ;

\- action ;

\- date ;

\- heure ;

\- élément concerné.



\---



\# 65. Responsive design



Le module doit être entièrement responsive.



\### Desktop



L’utilisateur peut bénéficier de :



\- tableaux larges ;

\- calendrier ;

\- vues multiples ;

\- informations détaillées.



\### Tablette



Les informations doivent être réorganisées.



\### Mobile



Les éléments essentiels doivent rester accessibles :



\- statut ;

\- client ;

\- véhicule ;

\- période ;

\- action principale.



Les tableaux complexes doivent pouvoir être transformés en cartes ou listes adaptées.



\---



\# 66. Performance



Le module doit pouvoir fonctionner avec un parc et un historique de locations croissants.



Les listes doivent utiliser lorsque nécessaire :



\- pagination ;

\- recherche ;

\- filtres ;

\- tri ;

\- chargement progressif.



Les données détaillées doivent être chargées uniquement lorsque nécessaire.



Les calculs lourds ne doivent pas ralentir inutilement l’affichage initial.



\---



\# 67. Évolutivité



Le module doit être conçu pour accueillir progressivement des fonctionnalités avancées.



Évolutions possibles :



\- réservation en ligne externe ;

\- portail client ;

\- signature électronique ;

\- paiement en ligne ;

\- géolocalisation ;

\- télématique ;

\- suivi GPS ;

\- gestion avancée du carburant ;

\- calcul avancé de rentabilité ;

\- scoring des véhicules ;

\- gestion des cautions ;

\- gestion avancée des assurances ;

\- automatisation des contrats ;

\- rappels intelligents ;

\- statistiques avancées.



Ces fonctions ne font pas partie du périmètre initial si elles ne sont pas nécessaires au MVP.



\---



\# 68. Principe de propriété des données



Les données métier doivent rester réparties entre les modules responsables.



Exemple :



Gestion de location

→ données de location



Tiers

→ données du client et du fournisseur



Facturation \& Paiement

→ données financières



Banques \& Caisses

→ mouvements financiers



Gestion de location ne doit pas devenir une duplication complète des autres modules.



Elle doit référencer les informations nécessaires.



\---



\# 69. Exemple complet — location d’un véhicule fournisseur



\### Étape 1 — Fournisseur



Fournisseur A fournit :



Toyota T5



Montant fournisseur :

500 000 KMF



\### Étape 2 — Mise à disposition



Le véhicule est enregistré dans le parc.



Statut :

Disponible



\### Étape 3 — Client



Client A est enregistré dans Tiers.



Le client bénéficie éventuellement d’un tarif préférentiel.



\### Étape 4 — Réservation



Client A réserve la Toyota T5.



Période :

20/08/2026 → 23/08/2026



Le système vérifie la disponibilité.



\### Étape 5 — Tarification



Tarif standard :

500 000 KMF



Tarif préférentiel client :

450 000 KMF



Tarif appliqué :

450 000 KMF



\### Étape 6 — Contrat



Le contrat est préparé.



\### Étape 7 — Départ



Kilométrage initial :

50 000 km



Carburant :

3/4



État :

Bon



\### Étape 8 — Incident



Pendant la location, la Toyota T5 tombe en panne.



Un incident est enregistré.



\### Étape 9 — Maintenance



Réparation :

300 000 KMF



Le véhicule est placé en maintenance.



\### Étape 10 — Imputation



La dépense est identifiée comme imputable au fournisseur A.



Montant imputé :

300 000 KMF



\### Étape 11 — Facture fournisseur



Montant initial :

500 000 KMF



Déduction :

300 000 KMF



Montant restant :

200 000 KMF



\### Étape 12 — Retour



Le véhicule revient chez ADIKOM.



L’état des lieux est enregistré.



\### Étape 13 — Facturation client



La location génère les éléments nécessaires à la facture client.



\### Étape 14 — Clôture



Lorsque les opérations nécessaires sont terminées, la location peut être clôturée.



L’ensemble de l’historique reste conservé.



\---



\# 70. Critères d’acceptation du module



Le module Gestion de location sera considéré comme fonctionnel lorsque :



1\. les véhicules peuvent être enregistrés ;

2\. les véhicules peuvent être associés à un fournisseur ;

3\. les catégories peuvent être gérées ;

4\. les disponibilités peuvent être déterminées ;

5\. les conflits de réservation sont détectés ;

6\. les réservations peuvent être créées ;

7\. les réservations peuvent être modifiées selon les permissions ;

8\. les réservations peuvent être annulées sans perdre leur historique ;

9\. les tarifs standards peuvent être appliqués ;

10\. les tarifs préférentiels clients peuvent être appliqués ;

11\. le tarif réellement appliqué est conservé ;

12\. les contrats peuvent être associés aux locations ;

13\. les départs peuvent être enregistrés ;

14\. les états des lieux peuvent être enregistrés ;

15\. les retours peuvent être enregistrés ;

16\. les dommages peuvent être enregistrés ;

17\. les incidents peuvent être enregistrés ;

18\. les maintenances peuvent être suivies ;

19\. un véhicule en maintenance ne peut pas être affecté à une location incompatible ;

20\. les coûts de maintenance peuvent être enregistrés ;

21\. les dépenses imputables peuvent être associées au fournisseur ;

22\. les imputations fournisseurs sont contrôlées et traçables ;

23\. les factures clients peuvent être alimentées par les données de location ;

24\. les données financières restent gérées par le module financier ;

25\. les notifications pertinentes sont générées ;

26\. les permissions sont respectées ;

27\. les actions sensibles sont journalisées ;

28\. le module est responsive ;

29\. les données peuvent être recherchées et filtrées ;

30\. l’historique complet d’une location peut être consulté.



\---



\# 71. Principe directeur



La Gestion de location doit être le \*\*moteur opérationnel du MVP d’ADIKOM PILOT\*\*.



Elle doit permettre de maîtriser simultanément :



\*\*Le client\*\*



\*\*Le véhicule\*\*



\*\*La réservation\*\*



\*\*Le contrat\*\*



\*\*Le départ\*\*



\*\*La location\*\*



\*\*Le retour\*\*



\*\*Les incidents\*\*



\*\*La maintenance\*\*



\*\*Les coûts\*\*



\*\*La facturation\*\*



\*\*Le paiement\*\*



\*\*Le fournisseur\*\*



\*\*L’historique\*\*



Le système doit transformer le cycle de location en un processus structuré, traçable et pilotable.



Le principe fondamental est :



\*\*Réserver → Préparer → Louer → Suivre → Retourner → Contrôler → Facturer → Encaisser → Clôturer\*\*



Et lorsqu’un problème survient :



\*\*Détecter → Intervenir → Enregistrer → Imputer si nécessaire → Tracer → Régulariser\*\*



ADIKOM PILOT doit ainsi permettre à ADIKOM de savoir, à tout moment :



\*\*Quel véhicule est disponible ?\*\*



\*\*Quel véhicule est loué ?\*\*



\*\*À quel client ?\*\*



\*\*Jusqu’à quand ?\*\*



\*\*À quel tarif ?\*\*



\*\*Quel est son état ?\*\*



\*\*Quel est son coût ?\*\*



\*\*Quel fournisseur est concerné ?\*\*



\*\*Quelles opérations restent à effectuer ?\*\*



\*\*Et quelle est la rentabilité réelle de l’activité ?\*\*

