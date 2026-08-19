\# ADIKOM PILOT

\## Workflow 04 — Retour du véhicule



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence fonctionnelle  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\# 1. Objet du workflow



Ce document décrit le processus complet de retour d'un véhicule après une période de location.



Le retour constitue une étape majeure du cycle de location puisqu'il permet de comparer l'état réel du véhicule à son état enregistré au départ.



Le workflow doit permettre à ADIKOM de déterminer :



\- quand le véhicule a réellement été restitué ;

\- par quel client ;

\- dans quel état ;

\- avec quel kilométrage ;

\- avec quel niveau de carburant lorsque celui-ci est suivi ;

\- si des dommages sont apparus ;

\- si un incident doit être déclaré ;

\- si une maintenance est nécessaire ;

\- si le véhicule peut redevenir disponible ;

\- si une facturation complémentaire est nécessaire ;

\- si la location peut être clôturée opérationnellement.



La chaîne principale est :



\*\*Location en cours → Retour → Contrôle → Comparaison → Incident éventuel → Maintenance éventuelle → Validation du retour\*\*



\---



\# 2. Principe général



Le retour doit être considéré comme une opération métier complète.



Il ne suffit pas de modifier le statut du véhicule.



Le système doit conserver un état détaillé du véhicule au moment de sa restitution.



Le principe est :



\*\*État au départ = référence\*\*



\*\*État au retour = état constaté\*\*



\*\*Comparaison = identification des différences\*\*



\---



\# 3. Conditions préalables



Avant d'enregistrer un retour, le système doit vérifier que :



\- une location existe ;

\- la location est active ;

\- le client est identifié ;

\- le véhicule est identifié ;

\- le départ a été enregistré ;

\- les informations initiales sont disponibles ;

\- l'utilisateur possède les permissions nécessaires.



\---



\# 4. Accès au retour



L'utilisateur autorisé doit pouvoir accéder au retour depuis :



\*\*Gestion de location → Locations → Location en cours → Retour\*\*



Le système doit présenter toutes les informations enregistrées au départ.



\---



\# 5. Récapitulatif de la location



Avant le contrôle, l'utilisateur doit pouvoir consulter :



\*\*Client\*\*



\*\*Véhicule\*\*



\*\*Fournisseur du véhicule lorsque applicable\*\*



\*\*Réservation\*\*



\*\*Date et heure prévues du retour\*\*



\*\*Date et heure réelles du départ\*\*



\*\*Kilométrage initial\*\*



\*\*Carburant initial lorsque suivi\*\*



\*\*État initial\*\*



\*\*Dommages préexistants\*\*



\*\*Tarif appliqué\*\*



\---



\# 6. Date et heure prévues



Le système doit conserver la date et l'heure prévues de retour.



Exemple :



\*\*Retour prévu : 23/08/2026 — 18:00\*\*



Cette information doit être conservée même lorsque le retour réel intervient à une autre heure.



\---



\# 7. Date et heure réelles



Au moment de la restitution, l'utilisateur doit enregistrer :



\- date réelle ;

\- heure réelle.



Exemple :



Retour prévu :

23/08/2026 — 18:00



Retour réel :

23/08/2026 — 17:40



Le système doit conserver les deux valeurs.



\---



\# 8. Retour anticipé



Lorsque le véhicule est rendu avant la date prévue, le système doit identifier le retour anticipé.



Exemple :



Retour prévu :

25/08/2026



Retour réel :

23/08/2026



Le système ne doit pas modifier rétroactivement la date prévue.



Les éventuelles conséquences tarifaires doivent être déterminées selon les règles commerciales d'ADIKOM.



\---



\# 9. Retour à l'heure



Lorsque le véhicule est restitué dans la période prévue, le système enregistre simplement la date et l'heure réelles.



Exemple :



Retour prévu :

18:00



Retour réel :

17:55



La location peut poursuivre normalement son processus de clôture.



\---



\# 10. Retour tardif



Lorsque le véhicule est restitué après l'échéance prévue, le système doit détecter le retard.



Exemple :



Retour prévu :

23/08 — 18:00



Retour réel :

24/08 — 10:00



Le système doit conserver :



\- date prévue ;

\- date réelle ;

\- durée du retard.



\---



\# 11. Prolongation validée versus retour tardif



Le système doit distinguer :



\*\*Prolongation validée\*\*



et



\*\*Retour tardif non prévu\*\*



Exemple :



Location initiale :

20/08 → 23/08



Le client demande le 22/08 :

prolongation jusqu'au 25/08



Si la prolongation est validée :



Nouvelle période :

20/08 → 25/08



Un retour le 25/08 n'est pas considéré comme un retard.



\---



\# 12. Contrôle du véhicule



Après restitution, l'utilisateur doit effectuer le contrôle du véhicule.



Le contrôle peut porter sur :



\- carrosserie ;

\- pare-brise ;

\- rétroviseurs ;

\- pneus ;

\- éclairage ;

\- intérieur ;

\- sièges ;

\- tableau de bord ;

\- équipements ;

\- accessoires ;

\- état mécanique apparent ;

\- carburant ;

\- kilométrage.



\---



\# 13. Kilométrage final



Le kilométrage doit être enregistré au retour.



Exemple :



Kilométrage initial :

50 000 km



Kilométrage final :

50 450 km



Distance parcourue :

450 km



Le système doit pouvoir calculer automatiquement la distance parcourue.



\---



\# 14. Contrôle de cohérence du kilométrage



Le kilométrage final ne doit normalement pas être inférieur au kilométrage initial.



Exemple :



Initial :

50 000 km



Final :

49 800 km



Le système doit signaler cette incohérence et demander une vérification.



Une correction exceptionnelle doit être réservée aux utilisateurs autorisés et être historisée.



\---



\# 15. Carburant final



Lorsque le carburant est suivi, le niveau au retour doit être enregistré.



Exemple :



Départ :

3/4



Retour :

1/2



Le système doit conserver les deux valeurs.



La différence peut être utilisée pour déterminer les éventuels frais applicables selon les règles d'ADIKOM.



\---



\# 16. Comparaison du carburant



Le système doit pouvoir comparer :



\*\*Carburant initial\*\*



avec



\*\*Carburant final\*\*



Exemple :



Initial :

3/4



Final :

1/2



Différence :

1/4



Cette différence ne doit pas automatiquement générer une facture sans qu'une règle commerciale correspondante soit définie.



\---



\# 17. État extérieur



Le contrôle extérieur doit rechercher notamment :



\- rayures ;

\- bosses ;

\- impacts ;

\- fissures ;

\- dommages de carrosserie ;

\- rétroviseurs endommagés ;

\- feux endommagés.



Les dommages déjà présents au départ doivent être comparés à l'état constaté au retour.



\---



\# 18. État intérieur



Le contrôle intérieur peut porter sur :



\- sièges ;

\- tableau de bord ;

\- tapis ;

\- garnitures ;

\- vitres ;

\- équipements ;

\- propreté ;

\- accessoires.



Tout nouveau dommage doit être identifié.



\---



\# 19. État mécanique apparent



L'utilisateur doit pouvoir signaler toute anomalie constatée.



Exemples :



\- bruit inhabituel ;

\- voyant ;

\- problème moteur ;

\- problème de freinage ;

\- problème de direction ;

\- problème de climatisation ;

\- panne.



Lorsque l'anomalie nécessite une intervention, une maintenance doit pouvoir être créée.



\---



\# 20. Équipements et accessoires



Les équipements remis au départ doivent pouvoir être contrôlés au retour.



Exemples :



\- roue de secours ;

\- cric ;

\- trousse ;

\- accessoires ;

\- équipements de sécurité.



Le système doit permettre d'identifier un équipement manquant ou endommagé.



\---



\# 21. Comparaison départ / retour



Le système doit faciliter la comparaison entre les deux états.



Exemple :



\### Départ



Kilométrage :

50 000 km



Carburant :

3/4



Dommage :

Rayure porte arrière gauche



\### Retour



Kilométrage :

50 450 km



Carburant :

1/2



Dommage :

Rayure porte arrière gauche + panne mécanique



Le système doit permettre d'identifier que la rayure existait déjà alors que la panne est nouvelle.



\---



\# 22. Photos au retour



Lorsque la fonctionnalité est disponible, des photos doivent pouvoir être associées au retour.



Elles peuvent documenter :



\- état général ;

\- nouveau dommage ;

\- panne ;

\- équipement ;

\- intérieur ;

\- extérieur.



Les photos du retour doivent pouvoir être comparées aux photos du départ lorsque cette fonctionnalité est utilisée.



\---



\# 23. Aucun nouveau dommage



Si aucun nouveau dommage n'est constaté :



\- le retour peut être validé ;

\- le véhicule peut être remis dans le circuit opérationnel selon son état ;

\- la location peut poursuivre son processus de clôture.



\---



\# 24. Nouveau dommage



Lorsqu'un nouveau dommage est constaté, l'utilisateur doit pouvoir créer un incident.



L'incident doit être lié à :



\- location ;

\- client ;

\- véhicule ;

\- date ;

\- utilisateur ;

\- description ;

\- preuves disponibles.



\---



\# 25. Gravité de l'incident



Le système peut permettre de qualifier l'incident.



Exemple :



\- faible ;

\- moyen ;

\- important ;

\- critique.



Cette classification peut aider à déterminer si le véhicule doit être immobilisé.



\---



\# 26. Véhicule toujours utilisable



Un incident léger peut ne pas empêcher immédiatement l'utilisation du véhicule.



Dans ce cas, le véhicule peut rester disponible selon la décision de l'utilisateur autorisé.



L'incident doit néanmoins être conservé dans l'historique.



\---



\# 27. Véhicule à immobiliser



Si l'état du véhicule ne permet pas une nouvelle location, son statut doit passer à :



\*\*Maintenance\*\*



ou



\*\*Indisponible\*\*



selon la situation.



Le système doit empêcher une nouvelle réservation incompatible.



\---



\# 28. Création d'une maintenance



Lorsque le retour révèle un problème nécessitant une réparation, l'utilisateur doit pouvoir créer une maintenance directement depuis le dossier de location.



La maintenance doit conserver le lien avec :



\*\*Location → Véhicule → Incident\*\*



\---



\# 29. Informations de maintenance



La maintenance peut contenir :



\- motif ;

\- description ;

\- date ;

\- prestataire ;

\- coût estimé ;

\- coût réel ;

\- statut ;

\- documents ;

\- observations.



Le workflow détaillé de maintenance est décrit dans :



\*\*Workflow 05 — Maintenance\*\*



\---



\# 30. Véhicule fourni par un fournisseur



Lorsque le véhicule est associé à un fournisseur, cette relation doit rester visible lors du retour.



Exemple :



Véhicule :

Toyota T5



Fournisseur :

Fournisseur A



Le système doit permettre d'identifier le fournisseur si une maintenance est nécessaire.



\---



\# 31. Maintenance imputable au fournisseur



Si la maintenance est à la charge du fournisseur selon les conditions applicables, le coût peut être traité ultérieurement par le workflow d'imputation.



Exemple :



Montant dû au fournisseur :

500 000 KMF



Maintenance :

300 000 KMF



Imputation :

300 000 KMF



Solde fournisseur :

200 000 KMF



Le retour lui-même ne doit pas créer automatiquement l'imputation.



La maintenance doit d'abord être enregistrée et validée.



\---



\# 32. Séparation entre incident, maintenance et imputation



Ces trois opérations doivent rester distinctes.



\*\*Incident\*\*



→ Problème constaté sur le véhicule.



\*\*Maintenance\*\*



→ Intervention nécessaire pour réparer ou entretenir le véhicule.



\*\*Imputation\*\*



→ Déduction du coût de la maintenance du montant dû au fournisseur.



Cette séparation garantit une meilleure traçabilité.



\---



\# 33. Contrôle du nettoyage



Si ADIKOM applique des frais spécifiques liés à l'état du véhicule au retour, ceux-ci doivent être gérés comme une donnée commerciale identifiable.



Le système ne doit pas créer arbitrairement un montant.



Toute facturation complémentaire doit être fondée sur une règle validée par ADIKOM.



\---



\# 34. Contrôle des équipements manquants



Si un équipement manque au retour :



\- le manque est enregistré ;

\- l'utilisateur peut ajouter une observation ;

\- un incident peut être créé ;

\- une éventuelle facturation doit être traitée selon les règles commerciales.



\---



\# 35. Contrôle des documents



Si des documents ou éléments remis au départ doivent être restitués, le retour peut permettre de confirmer leur récupération.



Le système doit conserver l'état de ces éléments lorsque cela est pertinent.



\---



\# 36. Calcul de la durée réelle



Le système doit pouvoir calculer la durée réelle entre :



\*\*Départ réel\*\*



et



\*\*Retour réel\*\*



Exemple :



Départ :

20/08 — 08:20



Retour :

23/08 — 17:40



Durée réelle :

selon l'unité tarifaire définie par ADIKOM.



Le calcul doit respecter les règles de tarification.



\---



\# 37. Comparaison durée prévue / durée réelle



Le système doit pouvoir identifier :



\- durée prévue ;

\- durée réelle ;

\- prolongation ;

\- retour anticipé ;

\- retour tardif.



Cette information peut être utilisée pour le calcul final de la facture.



\---



\# 38. Frais supplémentaires



Si le retour entraîne des frais supplémentaires, ceux-ci doivent être ajoutés au dossier de location avec une justification.



Exemples :



\- retard ;

\- carburant ;

\- dommage ;

\- équipement manquant ;

\- service supplémentaire.



Les règles exactes doivent être définies par ADIKOM avant leur automatisation.



\---



\# 39. Validation du retour



Avant validation finale, l'utilisateur doit vérifier :



\- date et heure ;

\- kilométrage ;

\- carburant ;

\- état extérieur ;

\- état intérieur ;

\- équipements ;

\- dommages ;

\- incidents ;

\- observations.



\---



\# 40. Confirmation du retour



Le système doit demander une confirmation explicite.



Exemple :



\*\*Confirmer le retour du véhicule ?\*\*



Après confirmation :



\- la location passe dans l'état approprié ;

\- le véhicule sort du statut « En location » ;

\- les informations de retour sont enregistrées.



\---



\# 41. Statut du véhicule après retour



Le statut du véhicule dépend de son état.



\### Aucun problème



\*\*Disponible\*\*



\### Maintenance nécessaire



\*\*Maintenance\*\*



\### Problème nécessitant une immobilisation



\*\*Indisponible\*\*



Le système ne doit pas considérer automatiquement tous les véhicules retournés comme disponibles.



\---



\# 42. Retour et disponibilité



Un véhicule peut redevenir disponible immédiatement uniquement lorsque les conditions nécessaires sont remplies.



Exemple :



Retour effectué :

17:40



Contrôle terminé :

17:55



Aucun problème.



Résultat :

\*\*Disponible\*\*



\---



\# 43. Retour avec maintenance



Exemple :



Retour :

17:40



Panne constatée :

18:00



Maintenance créée :

18:10



Statut véhicule :

\*\*Maintenance\*\*



Le véhicule ne doit pas apparaître dans les disponibilités pendant la période d'immobilisation.



\---



\# 44. Retour avec incident sans immobilisation



Exemple :



Rayure légère constatée.



Le véhicule reste techniquement utilisable.



Résultat possible :



Véhicule :

\*\*Disponible\*\*



Incident :

\*\*Ouvert\*\*



Le système conserve l'incident pour traitement ultérieur.



\---



\# 45. Passage vers la facturation



Une fois le retour validé, le système doit disposer des informations nécessaires au calcul final.



La location peut alors passer à l'étape :



\*\*Calcul final → Facturation\*\*



Le workflow de facturation est décrit dans :



\*\*Workflow 07 — Facturation\*\*



\---



\# 46. Paiement



Le retour ne signifie pas automatiquement que la facture est payée.



Après facturation :



\- facture impayée ;

\- facture partiellement payée ;

\- facture payée



sont des états financiers distincts.



Le paiement est traité dans :



\*\*Workflow 08 — Paiement\*\*



\---



\# 47. Location clôturée opérationnellement



Une location peut être considérée comme retournée même si la facture n'est pas encore réglée.



Exemple :



Location :

Retour effectué



Facture :

450 000 KMF



Paiement :

0 KMF



Solde :

450 000 KMF



La location et la facture doivent conserver leurs statuts respectifs.



\---



\# 48. Historique du retour



Le système doit conserver :



\- date prévue ;

\- date réelle ;

\- kilométrage initial ;

\- kilométrage final ;

\- carburant initial ;

\- carburant final ;

\- état initial ;

\- état final ;

\- dommages ;

\- incidents ;

\- maintenance ;

\- utilisateur ;

\- observations ;

\- documents ou photos lorsque disponibles.



\---



\# 49. Traçabilité



Toutes les opérations sensibles doivent être associées à un utilisateur.



Exemple :



Retour effectué par :

Utilisateur A



Incident enregistré par :

Utilisateur A



Maintenance créée par :

Utilisateur B



Validation de la maintenance :

Utilisateur C



Cette traçabilité doit être conservée.



\---



\# 50. Modification après validation



Une fois le retour validé, les informations importantes ne doivent pas pouvoir être modifiées librement.



Toute correction doit :



\- être autorisée ;

\- être historisée ;

\- identifier l'utilisateur ;

\- conserver l'information précédente lorsque nécessaire.



\---



\# 51. Exemple complet — Retour normal



\## Location



Client :

Société ABC



Véhicule :

Toyota T5



Départ :

20/08 — 08:20



Retour prévu :

23/08 — 18:00



\---



\## Retour



Retour réel :

23/08 — 17:40



Kilométrage initial :

50 000 km



Kilométrage final :

50 450 km



Carburant initial :

3/4



Carburant final :

3/4



État :

Bon



Aucun dommage.



\---



\## Résultat



Location :

Retournée



Véhicule :

Disponible



Incident :

Aucun



Maintenance :

Aucune



La location peut passer au processus de facturation.



\---



\# 52. Exemple complet — Retour avec panne



\## Départ



Toyota T5



Kilométrage :

50 000 km



\---



\## Retour



Kilométrage :

50 450 km



Problème :

Panne mécanique



\---



\## Action



Incident créé.



Maintenance créée.



Coût estimé :

300 000 KMF



Véhicule :

Maintenance



\---



\## Fournisseur



Fournisseur A



Montant dû :

500 000 KMF



\---



\## Suite



Maintenance validée :



300 000 KMF



Imputation éventuelle :



300 000 KMF



Solde fournisseur :



200 000 KMF



Le traitement détaillé de l'imputation relève du :



\*\*Workflow 06 — Imputation Maintenance Fournisseur\*\*



\---



\# 53. Exemple — Retour tardif



\## Prévu



23/08 — 18:00



\## Réel



24/08 — 10:00



Le système enregistre :



Retour tardif :

Oui



Durée du retard :

16 heures



La règle tarifaire applicable doit ensuite déterminer s'il existe un supplément.



Le système ne doit pas inventer automatiquement un montant sans règle commerciale définie.



\---



\# 54. Exemple — Retour anticipé



\## Prévu



25/08



\## Réel



23/08



Le système conserve :



Date prévue :

25/08



Date réelle :

23/08



Le calcul tarifaire dépend des règles validées par ADIKOM.



\---



\# 55. Exemple — Nouveau dommage



\### Départ



Rayure porte arrière gauche :

Existante



\### Retour



Rayure porte arrière gauche :

Existante



Nouveau dommage :

Pare-chocs avant endommagé



Le système doit distinguer :



\*\*Dommage préexistant\*\*



et



\*\*Nouveau dommage\*\*



\---



\# 56. Exemple — Équipement manquant



\### Départ



Roue de secours :

Présente



\### Retour



Roue de secours :

Absente



Le système crée ou signale un incident.



Une éventuelle facturation doit être décidée selon les règles commerciales d'ADIKOM.



\---



\# 57. Cas de retour sans contrôle complet



Le système ne doit pas permettre de considérer un retour comme définitivement validé si des informations obligatoires sont manquantes.



Exemple :



Kilométrage final absent.



Le système doit demander à l'utilisateur de compléter ou de justifier l'information.



\---



\# 58. Cas de retour exceptionnel



Dans certaines situations, le véhicule peut être récupéré dans des conditions particulières.



Exemples :



\- récupération par un tiers autorisé ;

\- accident ;

\- panne ;

\- retour hors agence.



Le système doit permettre de documenter la situation et d'enregistrer l'utilisateur ayant effectué la régularisation.



\---



\# 59. Notifications



Le retour peut générer des notifications internes.



Exemples :



\- véhicule retourné ;

\- dommage détecté ;

\- maintenance nécessaire ;

\- facture à préparer ;

\- incident à traiter.



Les notifications doivent être envoyées aux utilisateurs concernés selon leurs permissions.



\---



\# 60. Relations avec les autres modules



\### Gestion de location



Gère :



\- location ;

\- véhicule ;

\- retour ;

\- état du véhicule ;

\- incidents.



\### Tiers



Fournit :



\- client ;

\- fournisseur.



\### Centre de notifications



Gère :



\- alertes ;

\- retours ;

\- incidents.



\### Facturation \& Paiement



Gère :



\- montant final ;

\- facture ;

\- éventuels frais supplémentaires ;

\- règlements.



\### Banques \& Caisses



Gère les mouvements financiers lorsque le paiement est effectué.



\### Utilisateurs \& Groupes



Gère :



\- utilisateur ;

\- permissions ;

\- traçabilité.



\---



\# 61. Critères d'acceptation du workflow



Le workflow de retour sera considéré comme correctement implémenté lorsque :



1\. une location active peut être ouverte pour retour ;

2\. le client est identifié ;

3\. le véhicule est identifié ;

4\. la date prévue est visible ;

5\. la date réelle peut être enregistrée ;

6\. les retours anticipés sont détectables ;

7\. les retours tardifs sont détectables ;

8\. les prolongations sont distinguées des retards ;

9\. le kilométrage final peut être enregistré ;

10\. le kilométrage initial et final peuvent être comparés ;

11\. le carburant final peut être enregistré lorsque suivi ;

12\. l'état extérieur peut être contrôlé ;

13\. l'état intérieur peut être contrôlé ;

14\. les équipements peuvent être vérifiés ;

15\. les dommages préexistants peuvent être distingués des nouveaux dommages ;

16\. des photos peuvent être associées lorsque disponibles ;

17\. un incident peut être créé ;

18\. une maintenance peut être créée ;

19\. le véhicule peut être placé en maintenance ;

20\. le fournisseur peut être identifié ;

21\. une éventuelle imputation peut être préparée ;

22\. le retour peut être validé ;

23\. le statut du véhicule est mis à jour correctement ;

24\. la location peut passer vers la facturation ;

25\. les paiements restent séparés du retour ;

26\. les corrections sont contrôlées ;

27\. les actions sont historisées ;

28\. les permissions sont respectées ;

29\. les notifications pertinentes peuvent être générées ;

30\. l'ensemble du retour reste traçable.



\---



\# 62. Principe directeur



Le retour doit répondre à une question essentielle :



\*\*Dans quel état ADIKOM récupère-t-elle le véhicule après la location ?\*\*



Le système doit permettre de comparer objectivement :



\*\*Avant\*\*



avec



\*\*Après\*\*



afin de déterminer :



\- ce qui n'a pas changé ;

\- ce qui a changé ;

\- ce qui doit être facturé ;

\- ce qui nécessite une intervention ;

\- ce qui doit éventuellement être imputé au fournisseur.



La chaîne de référence est :



\*\*Location en cours → Retour → Contrôle → Comparaison → Incident éventuel → Maintenance éventuelle → Mise à jour du véhicule → Facturation\*\*



Le retour doit donc constituer une étape de contrôle, de traçabilité et de transition vers la clôture de la location.

