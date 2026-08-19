\# ADIKOM PILOT

\## Règles métier 02 — Gestion du parc automobile



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence métier  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\# 1. Objet



Ce document définit les règles métier relatives à la gestion du parc automobile dans ADIKOM PILOT.



Le parc automobile constitue le référentiel central de tous les véhicules exploités par ADIKOM, qu'ils soient :



\- détenus par ADIKOM ;

\- fournis par un fournisseur ;

\- temporairement mis à disposition ;

\- disponibles à la location ;

\- en location ;

\- en maintenance ;

\- immobilisés ;

\- retirés temporairement ou définitivement de l'exploitation.



Le module doit permettre de connaître à tout moment :



\- quels véhicules sont exploités ;

\- dans quel état ils se trouvent ;

\- à qui ils sont rattachés ;

\- quel fournisseur les a fournis lorsqu'il y en a un ;

\- leur disponibilité ;

\- leur historique de location ;

\- leur historique de maintenance ;

\- leurs coûts ;

\- leur situation opérationnelle.



\---



\# 2. Principe général



Chaque véhicule doit constituer une fiche unique dans ADIKOM PILOT.



Le véhicule ne doit pas être recréé dans chaque module.



Les autres modules doivent faire référence au véhicule existant.



Exemple :



\*\*Véhicule Toyota T5\*\*



peut être lié à :



\- une réservation ;

\- une location ;

\- un client ;

\- un fournisseur ;

\- une maintenance ;

\- une facture ;

\- une imputation fournisseur ;

\- des événements ;

\- des historiques.



\---



\# 3. Identifiant unique



Chaque véhicule doit disposer d'un identifiant interne unique.



Exemple :



\*\*VEH-2026-000001\*\*



Le format définitif sera défini lors de l'implémentation.



L'identifiant interne ne doit pas être confondu avec :



\- l'immatriculation ;

\- le numéro de châssis ;

\- le numéro de série ;

\- la référence fournisseur.



\---



\# 4. Immatriculation



Chaque véhicule doit pouvoir disposer d'une immatriculation.



L'immatriculation doit être enregistrée dans la fiche du véhicule lorsqu'elle est applicable.



Elle doit permettre d'identifier rapidement le véhicule.



Le système doit éviter les doublons d'immatriculation lorsque la réglementation et les données d'ADIKOM le permettent.



\---



\# 5. Informations principales du véhicule



La fiche véhicule doit pouvoir contenir notamment :



\- référence interne ;

\- immatriculation ;

\- marque ;

\- modèle ;

\- catégorie ;

\- année ;

\- couleur ;

\- type de carburant ;

\- boîte de vitesse ;

\- nombre de places ;

\- kilométrage ;

\- fournisseur éventuel ;

\- statut ;

\- date d'entrée dans le parc ;

\- observations.



Les champs réellement obligatoires seront définis lors de l'implémentation selon les besoins d'ADIKOM.



\---



\# 6. Marque et modèle



Le véhicule doit être identifiable par sa marque et son modèle.



Exemple :



\*\*Marque : Toyota\*\*



\*\*Modèle : T5\*\*



Ces informations doivent être réutilisables dans les locations, maintenances et rapports.



\---



\# 7. Catégorie de véhicule



ADIKOM doit pouvoir classer les véhicules par catégorie.



Les catégories définitives seront définies selon le parc réel.



Exemples :



\- Berline ;

\- SUV ;

\- Utilitaire ;

\- Minibus ;

\- Véhicule de tourisme ;

\- Autre.



Une catégorie peut notamment être utilisée pour la recherche et l'analyse du parc.



\---



\# 8. Caractéristiques techniques



Lorsque nécessaires, la fiche véhicule peut contenir :



\- carburant ;

\- transmission ;

\- puissance ;

\- cylindrée ;

\- nombre de places ;

\- nombre de portes ;

\- kilométrage ;

\- capacité ;

\- autres caractéristiques utiles.



Les informations techniques doivent rester distinctes des informations commerciales.



\---



\# 9. Fournisseur du véhicule



Un véhicule peut être associé à un fournisseur.



Exemple :



\*\*Toyota T5\*\*



\*\*Fournisseur : Fournisseur A\*\*



Cette relation est essentielle pour les opérations de :



\- maintenance ;

\- imputation ;

\- facturation fournisseur ;

\- suivi des coûts.



\---



\# 10. Véhicule appartenant à ADIKOM



Tous les véhicules ne sont pas nécessairement fournis par un partenaire.



Le système doit pouvoir distinguer :



\*\*Véhicule ADIKOM\*\*



et



\*\*Véhicule fourni par un fournisseur\*\*



Cette information permet notamment de déterminer le traitement de certaines dépenses.



\---



\# 11. Origine du véhicule



Le système doit pouvoir identifier l'origine ou le mode de mise à disposition du véhicule.



Exemples :



\- propriété ADIKOM ;

\- fournisseur ;

\- partenariat ;

\- autre mode validé.



La liste définitive sera définie selon les pratiques d'ADIKOM.



\---



\# 12. Statut du véhicule



Le statut doit refléter la situation opérationnelle du véhicule.



Les statuts recommandés sont :



\- Disponible ;

\- Réservé ;

\- En location ;

\- En maintenance ;

\- Immobilisé ;

\- Indisponible ;

\- Retiré.



Les statuts définitifs seront confirmés lors de l'implémentation.



\---



\# 13. Statut « Disponible »



Un véhicule est disponible lorsqu'il peut effectivement être proposé à la location.



Cela signifie notamment :



\- il n'est pas déjà loué ;

\- il n'est pas immobilisé ;

\- il n'est pas en maintenance bloquante ;

\- aucune autre contrainte ne l'empêche d'être affecté.



\---



\# 14. Statut « Réservé »



Un véhicule est réservé lorsqu'une réservation confirmée lui est associée pour une période future.



Une réservation ne signifie pas que le véhicule est actuellement en location.



\---



\# 15. Statut « En location »



Le véhicule passe à l'état « En location » lorsque son départ est effectivement enregistré.



Tant que la location n'est pas terminée, le véhicule ne doit pas être proposé à une autre location incompatible.



\---



\# 16. Statut « En maintenance »



Un véhicule passe en maintenance lorsqu'une intervention nécessite son immobilisation.



Un véhicule en maintenance ne doit pas être disponible à la location.



\---



\# 17. Statut « Immobilisé »



Un véhicule peut être immobilisé pour différentes raisons :



\- accident ;

\- panne ;

\- contrôle ;

\- problème administratif ;

\- décision de la direction ;

\- autre raison opérationnelle.



Le motif d'immobilisation doit pouvoir être enregistré.



\---



\# 18. Statut « Indisponible »



Le statut « Indisponible » peut être utilisé lorsqu'un véhicule ne peut pas être exploité mais que la situation ne correspond pas précisément aux autres statuts.



Le motif doit être identifiable.



\---



\# 19. Statut « Retiré »



Un véhicule retiré ne doit plus être proposé à la location.



Le retrait peut être :



\- temporaire ;

\- définitif.



Le système doit conserver son historique.



\---



\# 20. Disponibilité et calendrier



La disponibilité d'un véhicule doit être déterminée à partir de sa situation réelle et de son calendrier.



Le système doit prendre en compte notamment :



\- réservations ;

\- locations ;

\- maintenances ;

\- immobilisations ;

\- indisponibilités.



\---



\# 21. Règle de non-chevauchement



Un même véhicule ne doit pas pouvoir être affecté à deux opérations incompatibles sur une même période.



Exemple :



Toyota T5 :



Location A :

20/08 → 25/08



Une autre location du même véhicule ne peut pas être confirmée sur une période qui chevauche cette location.



\---



\# 22. Maintenance et disponibilité



Lorsqu'une maintenance est créée et nécessite une immobilisation :



\*\*Véhicule → En maintenance → Indisponible\*\*



Le système doit empêcher une nouvelle location incompatible.



\---



\# 23. Fin de maintenance



Lorsqu'une maintenance est terminée, le véhicule ne doit pas automatiquement redevenir disponible sans vérifier son état.



Un contrôle après intervention doit permettre de confirmer qu'il peut être remis en exploitation.



\---



\# 24. Retour de location



Lorsqu'un véhicule revient d'une location, son statut doit être déterminé selon son état.



\### Aucun problème



\*\*Retour → Disponible\*\*



\### Problème nécessitant une intervention



\*\*Retour → Maintenance\*\*



\### Autre problème



\*\*Retour → Indisponible / Immobilisé\*\*



\---



\# 25. Kilométrage



Le kilométrage du véhicule doit pouvoir être suivi.



Les principales valeurs peuvent être :



\- kilométrage initial ;

\- kilométrage au départ d'une location ;

\- kilométrage au retour ;

\- kilométrage après maintenance ;

\- kilométrage actuel.



Le système doit conserver l'historique des relevés importants.



\---



\# 26. Cohérence du kilométrage



Le système doit éviter qu'un nouveau relevé de kilométrage soit inférieur à un relevé antérieur sans justification.



Exemple :



Dernier kilométrage :

50 000 km



Nouveau relevé :

48 000 km



Le système doit signaler l'anomalie ou demander une justification.



\---



\# 27. Carburant



Lorsque ADIKOM suit le carburant, le niveau peut être enregistré :



\- au départ ;

\- au retour ;

\- lors d'une opération de maintenance ;

\- lors d'un contrôle.



Les niveaux doivent rester associés à l'événement concerné.



\---



\# 28. État du véhicule



L'état du véhicule peut être évalué lors :



\- de l'entrée dans le parc ;

\- d'un départ ;

\- d'un retour ;

\- d'une maintenance ;

\- d'un contrôle.



Le système doit pouvoir conserver les observations importantes.



\---



\# 29. Contrôle visuel



Le système peut permettre de documenter l'état extérieur du véhicule.



Exemples :



\- carrosserie ;

\- pare-chocs ;

\- vitres ;

\- rétroviseurs ;

\- pneus ;

\- éclairage.



La liste exacte des points de contrôle peut évoluer selon les besoins d'ADIKOM.



\---



\# 30. État intérieur



Le contrôle peut également concerner :



\- sièges ;

\- tableau de bord ;

\- équipements ;

\- propreté ;

\- accessoires ;

\- autres éléments.



\---



\# 31. Dommages



Un dommage constaté doit pouvoir être enregistré sans modifier directement les données générales du véhicule.



Le dommage constitue un événement ou un élément historique.



Exemple :



\*\*Toyota T5\*\*



Dommage :

Pare-chocs avant



Date :

23/08/2026



Origine :

Retour de location



\---



\# 32. Incident



Un incident lié au véhicule doit être conservé dans son historique.



Exemples :



\- accident ;

\- panne ;

\- dommage ;

\- problème mécanique ;

\- problème électrique.



\---



\# 33. Maintenance



Une maintenance doit être associée au véhicule concerné.



Relation :



\*\*Véhicule → Maintenance\*\*



La maintenance doit permettre de retrouver :



\- problème ;

\- diagnostic ;

\- intervention ;

\- prestataire ;

\- coût ;

\- date ;

\- statut ;

\- justificatifs.



\---



\# 34. Historique de maintenance



La fiche véhicule doit permettre de consulter les maintenances passées.



Exemple :



\*\*Toyota T5\*\*



\- Vidange — 80 000 KMF

\- Pneus — 120 000 KMF

\- Réparation mécanique — 300 000 KMF



\---



\# 35. Coût de maintenance



Le système doit pouvoir calculer le coût cumulé des maintenances d'un véhicule.



Exemple :



Maintenance 1 :

100 000 KMF



Maintenance 2 :

150 000 KMF



Maintenance 3 :

300 000 KMF



Total :

550 000 KMF



\---



\# 36. Coût de maintenance imputé



Lorsque le véhicule est fourni par un fournisseur, le système doit pouvoir distinguer :



\- coût total de maintenance ;

\- montant imputé au fournisseur ;

\- montant restant non imputé.



Exemple :



Coût :

300 000 KMF



Imputation :

300 000 KMF



Reste :

0 KMF



\---



\# 37. Maintenance partiellement imputée



Exemple :



Coût :

300 000 KMF



Imputation :

200 000 KMF



Reste :

100 000 KMF



Le système doit conserver les deux montants séparément.



\---



\# 38. Fournisseur et imputation



Lorsqu'un véhicule est fourni par un partenaire et qu'une maintenance doit être imputée au fournisseur, la relation doit être conservée :



\*\*Véhicule → Fournisseur → Maintenance → Imputation\*\*



L'imputation détaillée est définie dans :



\*\*04\_Workflows/06\_Imputation\_Maintenance\_Fournisseur.md\*\*



\---



\# 39. Facturation fournisseur



Les coûts imputables peuvent être pris en compte dans le traitement des factures fournisseurs.



Exemple :



Facture fournisseur :

500 000 KMF



Imputation :

300 000 KMF



Net :

200 000 KMF



Le véhicule doit permettre de retrouver cette opération dans son historique.



\---



\# 40. Location



Un véhicule du parc peut être associé à plusieurs locations successives.



Chaque location doit rester identifiable.



Exemple :



Toyota T5 :



\- LOC-001 — Client A

\- LOC-004 — Client B

\- LOC-009 — Client C



\---



\# 41. Historique des locations



La fiche véhicule doit permettre de consulter :



\- nombre de locations ;

\- périodes ;

\- clients ;

\- revenus générés lorsque disponibles ;

\- incidents ;

\- maintenances ;

\- immobilisations.



\---



\# 42. Revenus liés au véhicule



Lorsque les données sont disponibles, ADIKOM peut analyser le chiffre d'affaires généré par un véhicule.



Exemple :



Toyota T5



Locations :

5



CA généré :

2 500 000 KMF



Coûts de maintenance :

550 000 KMF



Ces indicateurs peuvent alimenter le pilotage.



\---



\# 43. Rentabilité



Le système peut fournir des indicateurs de rentabilité du véhicule.



Exemple simplifié :



Revenus :

2 500 000 KMF



Coûts de maintenance :

550 000 KMF



La rentabilité réelle devra toutefois prendre en compte les autres coûts pertinents lorsqu'ils seront disponibles.



Le système ne doit pas présenter un indicateur comme une rentabilité complète si toutes les charges ne sont pas prises en compte.



\---



\# 44. Date d'entrée dans le parc



Chaque véhicule doit pouvoir disposer d'une date d'entrée dans le parc.



Cette information permet notamment de suivre :



\- ancienneté ;

\- durée d'exploitation ;

\- historique ;

\- renouvellement.



\---



\# 45. Date de sortie



Lorsqu'un véhicule quitte définitivement le parc, la date de sortie doit être enregistrée.



Le véhicule ne doit pas être supprimé.



Il doit passer dans un état historique approprié.



\---



\# 46. Motif de sortie



Le système peut enregistrer le motif de sortie.



Exemples :



\- vente ;

\- fin de partenariat ;

\- retrait ;

\- véhicule devenu inutilisable ;

\- autre.



\---



\# 47. Suppression d'un véhicule



Un véhicule ayant déjà été utilisé dans ADIKOM PILOT ne doit pas être supprimé physiquement simplement parce qu'il n'est plus exploité.



Il doit être archivé ou retiré.



Cette règle permet de conserver :



\- locations historiques ;

\- maintenances ;

\- factures ;

\- imputations ;

\- statistiques.



\---



\# 48. Archivage



Un véhicule retiré du parc doit rester consultable selon les permissions.



L'utilisateur doit pouvoir distinguer :



\*\*Véhicule actif\*\*



et



\*\*Véhicule archivé\*\*



\---



\# 49. Documents du véhicule



La fiche véhicule peut permettre d'associer des documents.



Exemples :



\- documents administratifs ;

\- documents techniques ;

\- contrat fournisseur ;

\- assurance ;

\- contrôle ;

\- justificatifs ;

\- autres documents.



La gestion détaillée des documents dépendra du périmètre retenu pour le MVP.



\---



\# 50. Échéances



Le système peut permettre de suivre certaines échéances liées au véhicule.



Exemples :



\- assurance ;

\- contrôle ;

\- entretien ;

\- document ;

\- autre échéance.



Lorsque cette fonctionnalité est activée, une notification peut être générée avant l'échéance.



\---



\# 51. Notifications véhicule



Le Centre de notifications peut signaler :



\- véhicule en maintenance ;

\- maintenance terminée ;

\- maintenance en retard ;

\- échéance prochaine ;

\- document arrivant à expiration ;

\- véhicule immobilisé ;

\- location en cours ;

\- retour attendu.



\---



\# 52. Recherche du parc



La liste du parc doit permettre de rechercher un véhicule par :



\- référence ;

\- immatriculation ;

\- marque ;

\- modèle ;

\- catégorie ;

\- fournisseur ;

\- statut.



\---



\# 53. Filtres du parc



Les filtres peuvent inclure :



\- disponible ;

\- réservé ;

\- en location ;

\- en maintenance ;

\- immobilisé ;

\- indisponible ;

\- retiré ;

\- fournisseur ;

\- catégorie.



\---



\# 54. Vue globale du parc



ADIKOM doit pouvoir disposer d'une vue synthétique du parc.



Exemple :



\*\*Total véhicules : 20\*\*



\*\*Disponibles : 8\*\*



\*\*En location : 6\*\*



\*\*En maintenance : 3\*\*



\*\*Immobilisés : 2\*\*



\*\*Retirés : 1\*\*



Les chiffres doivent être calculés à partir des données réelles.



\---



\# 55. Tableau de bord du parc



Le Tableau de bord général peut afficher :



\- taille du parc ;

\- véhicules disponibles ;

\- véhicules en location ;

\- véhicules en maintenance ;

\- véhicules immobilisés ;

\- coût des maintenances ;

\- taux d'utilisation lorsque calculable ;

\- revenus générés lorsque disponibles.



\---



\# 56. Taux d'utilisation



Le taux d'utilisation peut être calculé lorsque les données nécessaires sont suffisamment fiables.



Le système doit définir clairement la période et la méthode utilisée.



Il ne faut pas présenter un taux sans préciser son mode de calcul.



\---



\# 57. Véhicule fourni par un fournisseur



Lorsqu'un véhicule est fourni par un partenaire, sa fiche doit conserver :



\- fournisseur ;

\- conditions utiles lorsque gérées dans ADIKOM ;

\- historique des locations ;

\- historique des maintenances ;

\- coûts ;

\- imputations.



\---



\# 58. Plusieurs véhicules pour un même fournisseur



Un fournisseur peut fournir plusieurs véhicules.



Exemple :



\*\*Fournisseur A\*\*



\- Toyota T5

\- Toyota T6

\- Hyundai H1



La fiche fournisseur doit permettre de retrouver les véhicules associés.



\---



\# 59. Un véhicule, un fournisseur actif



Un véhicule ne doit pas être rattaché simultanément à plusieurs fournisseurs actifs sans règle métier spécifique.



Lorsqu'un changement de fournisseur intervient, l'historique de l'ancien rattachement doit être conservé.



\---



\# 60. Changement de fournisseur



Si le fournisseur d'un véhicule change, le système doit conserver :



\- ancien fournisseur ;

\- nouveau fournisseur ;

\- date du changement ;

\- motif lorsque nécessaire.



Le changement ne doit pas modifier rétroactivement les anciennes opérations.



\---



\# 61. Changement de caractéristiques



Une modification de certaines caractéristiques du véhicule peut être autorisée.



Exemples :



\- couleur ;

\- informations techniques ;

\- catégorie.



Lorsque la modification a un impact historique important, l'ancienne valeur doit pouvoir être retrouvée selon les besoins de traçabilité.



\---



\# 62. Règle de non-rétroactivité



Une modification actuelle du véhicule ne doit pas modifier automatiquement l'historique des opérations passées.



Exemple :



Le véhicule était rattaché au fournisseur A lors d'une location en août.



Il est ensuite rattaché au fournisseur B.



La location d'août doit continuer à afficher le fournisseur applicable à cette période lorsque cette donnée était pertinente.



\---



\# 63. Identité du véhicule dans les opérations historiques



Lorsqu'une location ou une maintenance est créée, les données nécessaires à la compréhension de l'opération doivent être conservées.



Le système doit pouvoir retrouver le véhicule concerné même si certaines informations générales du véhicule évoluent par la suite.



\---



\# 64. Véhicule et client



Le véhicule n'appartient pas au client simplement parce qu'il est loué à celui-ci.



La location représente une relation temporaire :



\*\*Client ↔ Location ↔ Véhicule\*\*



\---



\# 65. Véhicule et fournisseur



Lorsqu'un véhicule est fourni par un fournisseur, le fournisseur constitue une relation de mise à disposition.



Cette relation doit être distincte de la relation de location avec le client.



Un même véhicule peut donc avoir :



\*\*Fournisseur A → Véhicule → Client B\*\*



\---



\# 66. Cycle de vie du véhicule



Le cycle de vie recommandé est :



\*\*Entrée dans le parc\*\*



↓



\*\*Disponible\*\*



↓



\*\*Réservé\*\*



↓



\*\*En location\*\*



↓



\*\*Retour\*\*



↓



\*\*Disponible\*\*



ou



↓



\*\*Maintenance\*\*



↓



\*\*Contrôle\*\*



↓



\*\*Disponible\*\*



ou



↓



\*\*Immobilisé\*\*



ou



↓



\*\*Retiré\*\*



\---



\# 67. Règle de disponibilité réelle



Le statut affiché ne doit jamais être utilisé seul pour déterminer la disponibilité si le calendrier révèle un conflit.



La disponibilité doit tenir compte :



\- du statut ;

\- des locations ;

\- des réservations ;

\- des maintenances ;

\- des immobilisations ;

\- des périodes bloquées.



\---



\# 68. Priorité des blocages



Lorsqu'un véhicule possède plusieurs événements, le système doit déterminer sa situation opérationnelle réelle.



Exemple :



Un véhicule peut être :



\- normalement disponible ;

\- mais réservé demain ;

\- puis en maintenance après-demain.



Le calendrier doit refléter ces différentes périodes plutôt que d'utiliser un seul statut permanent.



\---



\# 69. Séparation entre statut et disponibilité



Le statut du véhicule et sa disponibilité doivent être traités comme deux notions liées mais distinctes.



Exemple :



Un véhicule peut être :



\*\*Disponible aujourd'hui\*\*



mais



\*\*Réservé demain\*\*



Cela ne signifie pas qu'il est indisponible aujourd'hui.



\---



\# 70. Contrôle avant affectation



Avant d'affecter un véhicule à une réservation ou une location, le système doit vérifier :



\- statut ;

\- calendrier ;

\- chevauchement ;

\- maintenance ;

\- immobilisation ;

\- autres blocages.



\---



\# 71. Sécurité



Les opérations sensibles sur le parc doivent être contrôlées par les permissions.



Exemples :



\- créer un véhicule ;

\- modifier ;

\- retirer ;

\- changer de fournisseur ;

\- modifier le statut ;

\- enregistrer une immobilisation ;

\- clôturer une maintenance.



\---



\# 72. Traçabilité



Les actions importantes doivent être historisées.



Exemples :



\- création ;

\- modification ;

\- changement de statut ;

\- changement de fournisseur ;

\- mise en maintenance ;

\- sortie du parc ;

\- archivage.



Le système doit pouvoir identifier l'utilisateur et la date de l'action.



\---



\# 73. Audit du véhicule



La fiche véhicule doit permettre de reconstituer son historique.



Exemple :



\*\*Toyota T5\*\*



Entrée :

01/01/2026



Fournisseur :

A



Location :

LOC-001



Retour :

03/01



Maintenance :

MNT-001



Coût :

150 000 KMF



Location :

LOC-004



Maintenance :

MNT-004



Coût :

300 000 KMF



Imputation :

300 000 KMF



Cette vision doit rester disponible selon les permissions.



\---



\# 74. Relations avec les autres modules



\### Gestion de Location



Utilise :



\- véhicule ;

\- disponibilité ;

\- calendrier ;

\- statut.



\### Tiers



Fournit :



\- fournisseur ;

\- client.



\### Facturation \& Paiement



Utilise :



\- véhicule ;

\- locations ;

\- maintenances ;

\- imputations.



\### Banques \& Caisses



Reçoit :



\- mouvements financiers liés aux paiements.



\### Centre de Notifications



Signale :



\- maintenance ;

\- échéances ;

\- indisponibilités.



\### Tableau de bord



Exploite :



\- statistiques du parc ;

\- utilisation ;

\- coûts ;

\- disponibilité.



\### Utilisateurs \& Groupes



Contrôle :



\- accès ;

\- permissions ;

\- actions.



\---



\# 75. Exemple complet — Véhicule fourni par un fournisseur



\## Véhicule



Toyota T5



Fournisseur :

Fournisseur A



Statut :

Disponible



\---



\## Location



Client :

Société ABC



Période :

20/08 → 23/08



Statut :

En location



\---



\## Retour



Une panne est constatée.



Statut :

En maintenance



\---



\## Maintenance



Coût :

300 000 KMF



\---



\## Imputation



Montant imputé au fournisseur :

300 000 KMF



\---



\## Fin



Maintenance terminée.



Après contrôle :



Statut :

Disponible



L'historique du véhicule conserve l'ensemble des opérations.



\---



\# 76. Exemple — Véhicule indisponible



Toyota T5



Problème :

Panne mécanique



Maintenance :

En cours



Statut :

En maintenance



Une tentative de création d'une nouvelle location sur une période couvrant la maintenance doit être bloquée.



\---



\# 77. Exemple — Changement de fournisseur



Toyota T5



Ancien fournisseur :

Fournisseur A



Date :

01/01/2026 → 30/06/2026



Nouveau fournisseur :

Fournisseur B



Date :

01/07/2026 →



Les anciennes locations et maintenances doivent conserver leur contexte historique.



\---



\# 78. Exemple — Retrait du parc



Toyota T5



Statut :

Retiré



Motif :

Fin de partenariat



Le véhicule ne peut plus être proposé à la location.



Son historique reste consultable.



\---



\# 79. Principes non négociables



Les règles suivantes sont fondamentales :



1\. Chaque véhicule possède une fiche unique.

2\. Un véhicule doit pouvoir être identifié sans ambiguïté.

3\. Un véhicule en location ne peut pas être proposé sur une période incompatible.

4\. Un véhicule en maintenance ne peut pas être proposé comme disponible.

5\. Un véhicule immobilisé ne peut pas être loué.

6\. Un véhicule retiré ne peut plus être loué.

7\. L'historique d'un véhicule utilisé ne doit pas être supprimé.

8\. Les changements de fournisseur ne doivent pas modifier rétroactivement les anciennes opérations.

9\. Les maintenances doivent être liées au véhicule concerné.

10\. Les coûts de maintenance doivent pouvoir être suivis.

11\. Les imputations fournisseur doivent être distinctes des coûts de maintenance.

12\. La disponibilité doit refléter la réalité opérationnelle.

13\. Les actions sensibles doivent être historisées.

14\. Les permissions doivent être respectées.

15\. Le parc automobile constitue le référentiel central des véhicules.



\---



\# 80. Critères d'acceptation



La gestion du parc automobile sera considérée comme conforme lorsque :



1\. un véhicule peut être créé ;

2\. une référence unique est attribuée ;

3\. l'immatriculation peut être enregistrée ;

4\. la marque et le modèle peuvent être enregistrés ;

5\. une catégorie peut être définie ;

6\. les caractéristiques utiles peuvent être enregistrées ;

7\. un fournisseur peut être associé ;

8\. un véhicule ADIKOM peut être distingué d'un véhicule fournisseur ;

9\. un statut peut être attribué ;

10\. la disponibilité peut être déterminée ;

11\. les réservations sont prises en compte ;

12\. les locations sont prises en compte ;

13\. les maintenances sont prises en compte ;

14\. les immobilisations sont prises en compte ;

15\. les conflits de calendrier sont contrôlés ;

16\. le kilométrage peut être suivi ;

17\. le carburant peut être suivi lorsque cette fonctionnalité est activée ;

18\. l'état du véhicule peut être documenté ;

19\. les incidents peuvent être enregistrés ;

20\. les maintenances peuvent être consultées ;

21\. les coûts de maintenance peuvent être calculés ;

22\. les imputations fournisseur peuvent être retrouvées ;

23\. les locations historiques peuvent être consultées ;

24\. les revenus liés aux locations peuvent être exploités lorsque disponibles ;

25\. les échéances peuvent être suivies lorsque cette fonctionnalité est activée ;

26\. un véhicule retiré reste dans l'historique ;

27\. les changements de fournisseur sont historisés ;

28\. les informations historiques restent cohérentes ;

29\. la recherche et les filtres fonctionnent ;

30\. les statistiques du parc peuvent être calculées ;

31\. les notifications peuvent être générées ;

32\. les permissions sont respectées ;

33\. les actions importantes sont journalisées ;

34\. les relations avec Location, Maintenance, Fournisseurs, Facturation et Paiement restent cohérentes.



\---



\# 81. Principe directeur



Le parc automobile doit constituer la source de vérité concernant les véhicules exploités par ADIKOM.



La logique de référence est :



\*\*Véhicule\*\*



↓



\*\*Fournisseur éventuel\*\*



↓



\*\*Disponibilité\*\*



↓



\*\*Réservation\*\*



↓



\*\*Location\*\*



↓



\*\*Retour\*\*



↓



\*\*Maintenance éventuelle\*\*



↓



\*\*Coût\*\*



↓



\*\*Imputation éventuelle\*\*



↓



\*\*Historique\*\*



Le principe fondamental est :



\*\*Un véhicule doit toujours avoir un état identifiable, une disponibilité cohérente et un historique exploitable.\*\*



ADIKOM PILOT doit permettre de savoir à tout moment :



\*\*Quels sont nos véhicules ?\*\*



\*\*Où sont-ils ?\*\*



\*\*Sont-ils disponibles ?\*\*



\*\*Qui les utilise ?\*\*



\*\*Qui les fournit ?\*\*



\*\*Combien coûtent-ils ?\*\*



\*\*Combien rapportent-ils ?\*\*



\*\*Quelles maintenances ont été réalisées ?\*\*



\*\*Quels coûts ont éventuellement été imputés aux fournisseurs ?\*\*



Le module Parc Automobile doit ainsi constituer le référentiel opérationnel central sur lequel s'appuient la location, la maintenance, la facturation, les fournisseurs et le pilotage d'ADIKOM.

