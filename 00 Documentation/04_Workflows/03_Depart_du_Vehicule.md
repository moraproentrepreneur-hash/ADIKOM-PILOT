\# ADIKOM PILOT

\## Workflow 03 — Départ du véhicule



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence fonctionnelle  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\# 1. Objet du workflow



Ce document décrit le processus de départ d'un véhicule après confirmation d'une réservation.



Le départ constitue le moment où le véhicule est effectivement remis au client.



Il marque la transition entre :



\*\*Réservation confirmée\*\*



et



\*\*Location en cours\*\*



Cette étape est essentielle car elle permet de créer un état de référence du véhicule avant son utilisation par le client.



Le système doit notamment enregistrer :



\- le client ;

\- le véhicule ;

\- la réservation ;

\- la date et l'heure réelles de départ ;

\- le kilométrage initial ;

\- le niveau de carburant initial lorsque celui-ci est suivi ;

\- l'état général du véhicule ;

\- les dommages déjà présents ;

\- les documents ou justificatifs nécessaires ;

\- l'utilisateur ayant effectué le départ.



\---



\# 2. Principe général



Le workflow suit le schéma :



\*\*Réservation confirmée → Préparation → Vérification → État initial → Validation → Remise du véhicule → Location en cours\*\*



Le départ ne doit pas être enregistré comme une simple modification du statut de la réservation.



Il doit constituer une opération métier complète et traçable.



\---



\# 3. Conditions préalables



Avant d'effectuer le départ, le système doit vérifier que :



\- la réservation existe ;

\- la réservation est confirmée ;

\- le client est identifié ;

\- le véhicule est identifié ;

\- le véhicule est disponible ;

\- le véhicule n'est pas en maintenance ;

\- le véhicule n'est pas déclaré indisponible ;

\- la période de location est cohérente ;

\- l'utilisateur possède les permissions nécessaires.



Si une condition essentielle n'est pas remplie, le départ doit être bloqué ou nécessiter une action corrective.



\---



\# 4. Accès au départ



L'utilisateur autorisé doit pouvoir accéder au départ depuis la réservation.



Exemple :



\*\*Gestion de location → Réservations → Réservation → Préparer le départ\*\*



ou depuis la vue opérationnelle des locations à venir.



L'interface doit permettre de retrouver rapidement toutes les informations nécessaires.



\---



\# 5. Récapitulatif avant départ



Avant de commencer le contrôle, le système doit afficher un résumé.



Exemple :



\*\*Client\*\*

Société ABC



\*\*Véhicule\*\*

Toyota T5



\*\*Immatriculation\*\*

XXX-000



\*\*Départ prévu\*\*

20/08/2026 — 08:00



\*\*Retour prévu\*\*

23/08/2026 — 18:00



\*\*Tarif appliqué\*\*

450 000 KMF



\*\*Réservation\*\*

RES-2026-000001



L'utilisateur doit pouvoir vérifier que le bon véhicule est remis au bon client.



\---



\# 6. Vérification du véhicule



Avant la remise, le véhicule doit être contrôlé.



Le contrôle peut porter sur :



\- carrosserie ;

\- pare-brise ;

\- rétroviseurs ;

\- pneus ;

\- éclairage ;

\- intérieur ;

\- sièges ;

\- équipements ;

\- accessoires ;

\- documents ;

\- niveau de carburant ;

\- kilométrage ;

\- état mécanique apparent.



Les éléments réellement suivis par ADIKOM doivent être configurables ou adaptés au fonctionnement opérationnel.



\---



\# 7. État initial du véhicule



Le système doit permettre d'enregistrer l'état du véhicule au moment du départ.



Cet état constitue la référence utilisée lors du retour.



Le principe est :



\*\*État au départ = état de référence\*\*



\*\*État au retour = état à comparer\*\*



\---



\# 8. Dommages préexistants



Tout dommage présent avant la remise du véhicule doit être identifié.



Exemples :



\- rayure ;

\- bosse ;

\- impact ;

\- pare-chocs endommagé ;

\- élément intérieur détérioré.



Le système doit permettre de distinguer ces dommages des dommages pouvant survenir pendant la location.



\---



\# 9. Photos de départ



Lorsque cette fonctionnalité est activée, l'utilisateur doit pouvoir associer des photos à l'état initial du véhicule.



Les photos peuvent documenter :



\- avant ;

\- arrière ;

\- côtés ;

\- intérieur ;

\- tableau de bord ;

\- dommages existants.



L'objectif est de disposer d'une preuve visuelle de l'état du véhicule au départ.



\---



\# 10. Kilométrage initial



Le kilométrage du véhicule doit être enregistré au moment du départ.



Exemple :



\*\*Kilométrage initial : 50 000 km\*\*



Cette donnée servira notamment lors du retour.



Le système doit empêcher les valeurs incohérentes lorsque cela est possible.



\---



\# 11. Carburant initial



Lorsque ADIKOM suit le niveau de carburant, celui-ci doit être enregistré au départ.



Exemple :



\*\*Carburant initial : 3/4\*\*



Le système doit pouvoir comparer cette information avec le niveau au retour.



\---



\# 12. Documents du véhicule



Avant le départ, l'utilisateur peut vérifier la présence des documents nécessaires au véhicule.



Exemples :



\- documents administratifs ;

\- assurance ;

\- documents d'exploitation ;

\- autres documents nécessaires.



Le système peut permettre de signaler les documents manquants.



\---



\# 13. Équipements et accessoires



Les équipements remis avec le véhicule peuvent être contrôlés.



Exemples :



\- roue de secours ;

\- cric ;

\- trousse ;

\- équipements de sécurité ;

\- accessoires spécifiques.



Lorsque ces éléments sont suivis par ADIKOM, leur état peut être enregistré.



\---



\# 14. Validation du contrôle



Après vérification, l'utilisateur doit pouvoir confirmer que le véhicule est prêt à être remis.



Le système doit vérifier que les informations obligatoires sont renseignées.



Exemples :



\- kilométrage ;

\- état initial ;

\- utilisateur ;

\- date et heure.



\---



\# 15. Date et heure réelles de départ



Le système doit enregistrer la date et l'heure réelles du départ.



Il faut distinguer :



\*\*Départ prévu\*\*



et



\*\*Départ réel\*\*



Exemple :



Départ prévu :

20/08/2026 — 08:00



Départ réel :

20/08/2026 — 08:25



Cette différence doit être conservée.



\---



\# 16. Départ anticipé



Si le client récupère le véhicule avant l'heure prévue, le système doit enregistrer l'heure réelle.



Exemple :



Départ prévu :

08:00



Départ réel :

07:30



Le système ne doit pas écraser l'heure prévue.



\---



\# 17. Départ retardé



Si le départ intervient après l'heure prévue, le système doit enregistrer l'écart.



Exemple :



Départ prévu :

08:00



Départ réel :

10:00



Le système conserve :



\- heure prévue ;

\- heure réelle.



Les éventuelles conséquences commerciales doivent être gérées selon les règles d'ADIKOM.



\---



\# 18. Vérification finale avant remise



Avant de confirmer la remise, l'utilisateur doit vérifier :



\- identité du client ;

\- véhicule ;

\- réservation ;

\- période ;

\- état du véhicule ;

\- kilométrage ;

\- carburant ;

\- documents ;

\- équipements ;

\- conditions particulières.



\---



\# 19. Remise du véhicule



Une fois le contrôle terminé, le véhicule est remis au client.



Le système doit enregistrer la remise.



L'opération doit être associée à l'utilisateur qui l'a effectuée.



\---



\# 20. Passage en location active



Après validation du départ :



\*\*Réservation confirmée\*\*



devient :



\*\*Location en cours\*\*



Le véhicule passe au statut :



\*\*En location\*\*



Le système doit mettre à jour ces états de manière cohérente.



\---



\# 21. Blocage du véhicule



Tant que la location est en cours, le véhicule ne doit pas apparaître comme disponible pour une nouvelle location.



La disponibilité doit être bloquée côté serveur.



\---



\# 22. Création du dossier de location



Le départ doit créer ou activer le dossier opérationnel de la location.



Le dossier doit être lié à :



\- réservation ;

\- client ;

\- véhicule ;

\- fournisseur lorsque applicable ;

\- période ;

\- tarif ;

\- état initial ;

\- utilisateur.



\---



\# 23. Relation réservation / location



La réservation et la location sont deux éléments différents.



\### Réservation



Elle représente :



\*\*L'engagement prévu de louer le véhicule.\*\*



\### Location



Elle représente :



\*\*L'utilisation réelle du véhicule par le client.\*\*



La relation doit être :



\*\*Réservation → Location\*\*



La réservation doit rester accessible après le départ.



\---



\# 24. Tarif au moment du départ



Le tarif appliqué doit être conservé dans la location.



Si le client bénéficie d'un tarif préférentiel, le montant effectivement validé doit être utilisé.



Exemple :



Tarif standard :

500 000 KMF



Tarif préférentiel :

450 000 KMF



Tarif appliqué :

450 000 KMF



Une modification ultérieure de la grille tarifaire ne doit pas modifier cette location.



\---



\# 25. Conditions particulières



Les conditions particulières enregistrées dans la réservation doivent être visibles au moment du départ.



Exemples :



\- lieu de remise ;

\- lieu de restitution ;

\- besoin particulier ;

\- service complémentaire ;

\- condition commerciale.



L'utilisateur doit pouvoir les vérifier avant la remise.



\---



\# 26. Confirmation du départ



Une confirmation explicite doit être demandée avant la validation finale.



Exemple :



\*\*Confirmer le départ du véhicule ?\*\*



Après confirmation :



\- la location devient active ;

\- le véhicule passe en location ;

\- la date et l'heure réelles sont enregistrées ;

\- les données initiales sont conservées.



\---



\# 27. Traçabilité



Le départ doit être entièrement traçable.



Le système doit enregistrer :



\- utilisateur ;

\- date ;

\- heure ;

\- véhicule ;

\- client ;

\- réservation ;

\- kilométrage ;

\- carburant ;

\- état ;

\- observations.



\---



\# 28. Modification après départ



Une fois le départ confirmé, les informations essentielles ne doivent pas être modifiées librement.



Exemples :



\- kilométrage initial ;

\- état initial ;

\- heure réelle ;

\- dommages initiaux.



Toute correction doit être réservée aux utilisateurs autorisés et être historisée.



\---



\# 29. Correction du kilométrage



Si une erreur est constatée après le départ :



Ancien :

50 000 km



Correct :

50 050 km



La modification doit :



\- être autorisée ;

\- être enregistrée ;

\- conserver l'ancienne valeur lorsque nécessaire ;

\- identifier l'utilisateur ;

\- enregistrer la date et l'heure.



\---



\# 30. Correction de l'état initial



Même principe pour une erreur dans l'état du véhicule.



Le système ne doit pas permettre de modifier silencieusement une donnée utilisée comme preuve de l'état initial.



\---



\# 31. Départ sans réservation



Dans des circonstances particulières, ADIKOM peut décider d'autoriser un départ sans réservation préalable.



Si cette possibilité existe, elle doit être strictement contrôlée.



Le système doit alors créer ou régulariser l'opération nécessaire avant de considérer la location comme active.



Pour le fonctionnement standard du MVP, le processus recommandé reste :



\*\*Réservation → Départ → Location\*\*



\---



\# 32. Client non identifié



Le départ ne doit pas pouvoir être validé sans client identifié.



Si le client n'existe pas dans Tiers, l'utilisateur autorisé doit d'abord créer sa fiche.



\---



\# 33. Véhicule non disponible



Le départ doit être bloqué si le véhicule est :



\- déjà en location ;

\- en maintenance ;

\- indisponible ;

\- réservé pour une autre opération incompatible.



\---



\# 34. Véhicule nécessitant une maintenance



Si le véhicule présente un problème avant le départ, l'utilisateur doit pouvoir signaler le problème.



Le véhicule peut alors être placé en maintenance ou en indisponibilité selon la gravité.



Un véhicule non apte à la location ne doit pas être remis au client.



\---



\# 35. Remplacement du véhicule



Si le véhicule initialement réservé n'est plus disponible avant le départ, ADIKOM peut éventuellement proposer un autre véhicule.



Cette modification doit :



\- vérifier la disponibilité du nouveau véhicule ;

\- vérifier sa compatibilité ;

\- recalculer le tarif lorsque nécessaire ;

\- conserver l'historique ;

\- être validée par un utilisateur autorisé.



\---



\# 36. Changement de véhicule et tarif



Si le nouveau véhicule possède un tarif différent, le système doit clairement afficher la différence.



Exemple :



Véhicule initial :

450 000 KMF



Nouveau véhicule :

500 000 KMF



Le nouveau montant doit être validé avant la remise du véhicule.



\---



\# 37. Départ et documents



Les documents nécessaires peuvent être associés au dossier de location.



Exemples :



\- justificatifs client ;

\- document de location ;

\- état des lieux ;

\- photos ;

\- documents administratifs.



Les documents doivent rester accessibles selon les permissions.



\---



\# 38. Notification



Une fois le départ enregistré, le système peut générer les notifications nécessaires.



Exemples :



\- location démarrée ;

\- véhicule désormais en location ;

\- prochaine date de retour.



Les notifications doivent être destinées aux utilisateurs concernés.



\---



\# 39. Suivi pendant la location



Après le départ, la location entre dans la phase de suivi.



Le dossier doit permettre de retrouver :



\- client ;

\- véhicule ;

\- départ ;

\- retour prévu ;

\- tarif ;

\- statut.



Les workflows suivants prennent ensuite le relais.



\---



\# 40. Préparation du retour



À l'approche de la date prévue, le Centre de notifications peut signaler le retour.



Exemple :



\*\*Retour prévu demain à 18:00\*\*



Cela permet à l'équipe de préparer :



\- récupération du véhicule ;

\- contrôle ;

\- inspection ;

\- disponibilité future.



\---



\# 41. Cas de prolongation



Si le client souhaite prolonger la location pendant qu'elle est en cours, la demande doit passer par le workflow de prolongation.



Le système doit vérifier :



\- disponibilité future ;

\- nouvelle date ;

\- tarif ;

\- éventuelles conditions.



Une prolongation validée doit être distinguée d'un retour tardif.



\---



\# 42. Cas de retour anticipé



Si le client retourne le véhicule avant la date prévue, le système doit enregistrer la date réelle lors du workflow de retour.



Le départ initial reste inchangé.



\---



\# 43. Cas de départ avec dommage connu



Un véhicule peut présenter des dommages antérieurs.



Ces dommages doivent être enregistrés avant la remise.



Exemple :



Dommage préexistant :

Rayure porte arrière droite.



Le système doit conserver cette information afin qu'elle ne soit pas automatiquement considérée comme un dommage apparu pendant la location.



\---



\# 44. Cas de véhicule fourni par un fournisseur



Le dossier de location doit conserver le fournisseur associé au véhicule.



Exemple :



Client :

Société ABC



Véhicule :

Toyota T5



Fournisseur :

Fournisseur A



Cette relation sera notamment utilisée ultérieurement en cas de maintenance et d'imputation.



\---



\# 45. Sécurité et permissions



Seuls les utilisateurs disposant des permissions nécessaires peuvent :



\- préparer un départ ;

\- modifier les informations du départ ;

\- confirmer le départ ;

\- corriger une information ;

\- annuler ou régulariser une opération.



Les permissions doivent être contrôlées côté serveur.



\---



\# 46. Journal d'activité



Le système doit journaliser les actions sensibles.



Exemples :



\- départ préparé ;

\- départ confirmé ;

\- kilométrage modifié ;

\- état initial modifié ;

\- véhicule remplacé ;

\- départ annulé ou régularisé.



\---



\# 47. Exemple complet



\## Réservation



Client :

Société ABC



Véhicule :

Toyota T5



Période :

20/08/2026 → 23/08/2026



Tarif :

450 000 KMF



\---



\## Contrôle avant départ



Kilométrage :

50 000 km



Carburant :

3/4



État :

Bon



Dommage préexistant :

Petite rayure porte arrière gauche



Photos :

Enregistrées



\---



\## Départ réel



Prévu :

20/08/2026 — 08:00



Réel :

20/08/2026 — 08:20



Utilisateur :

Assistant(e) de direction



\---



\## Validation



Location :

En cours



Véhicule :

En location



Réservation :

Convertie en location



\---



\# 48. Exemple — véhicule remplacé



\### Réservation



Toyota T5



\### Avant départ



Le véhicule tombe en panne.



\### Action



Le responsable sélectionne :



Toyota T6



\### Contrôles



Disponibilité :

✓



Catégorie compatible :

✓



Tarif :

500 000 KMF



\### Résultat



Le changement est validé.



L'historique conserve :



Véhicule initial :

Toyota T5



Véhicule attribué :

Toyota T6



Motif :

Panne avant départ



\---



\# 49. Exemple — départ retardé



\### Prévu



08:00



\### Réel



10:15



Le système conserve :



Départ prévu :

08:00



Départ réel :

10:15



Retard :

2 h 15



Le système ne doit pas écraser la donnée prévue.



\---



\# 50. Exemple — erreur de kilométrage



\### Valeur initiale



50 000 km



\### Erreur détectée



La valeur correcte est :



50 050 km



Le système doit enregistrer :



Ancienne valeur :

50 000 km



Nouvelle valeur :

50 050 km



Modifié par :

Utilisateur autorisé



Date :

Date de correction



\---



\# 51. Résultat attendu



À la fin du workflow de départ, le système doit disposer d'un dossier de location complet contenant au minimum :



\*\*Client\*\*



\*\*Véhicule\*\*



\*\*Réservation\*\*



\*\*Date prévue de départ\*\*



\*\*Date réelle de départ\*\*



\*\*Date prévue de retour\*\*



\*\*Tarif appliqué\*\*



\*\*Kilométrage initial\*\*



\*\*Carburant initial lorsque suivi\*\*



\*\*État initial\*\*



\*\*Dommages préexistants\*\*



\*\*Utilisateur ayant effectué le départ\*\*



\*\*Historique\*\*



La location doit ensuite être considérée comme :



\*\*EN COURS\*\*



\---



\# 52. Passage au workflow suivant



Une fois le départ confirmé, le processus continue vers :



\*\*Workflow 04 — Retour du véhicule\*\*



Le retour doit utiliser les informations enregistrées au départ comme état de référence.



La relation est :



\*\*Départ → Location en cours → Retour\*\*



\---



\# 53. Relations avec les autres modules



Le workflow de départ utilise principalement :



\### Tiers



Pour :



\- client ;

\- informations client.



\### Gestion de location



Pour :



\- réservation ;

\- véhicule ;

\- location ;

\- disponibilité.



\### Utilisateurs \& Groupes



Pour :



\- identité de l'utilisateur ;

\- permissions ;

\- traçabilité.



\### Centre de notifications



Pour :



\- alertes ;

\- échéances.



\### Facturation \& Paiement



Pour les informations tarifaires nécessaires et la future facturation.



\---



\# 54. Critères d'acceptation du workflow



Le workflow de départ sera considéré comme correctement implémenté lorsque :



1\. une réservation confirmée peut être ouverte pour préparation ;

2\. le client est clairement identifié ;

3\. le véhicule est clairement identifié ;

4\. la disponibilité est vérifiée ;

5\. les véhicules en maintenance sont bloqués ;

6\. l'état initial peut être enregistré ;

7\. les dommages préexistants peuvent être enregistrés ;

8\. des photos peuvent être associées lorsque la fonctionnalité est disponible ;

9\. le kilométrage initial peut être enregistré ;

10\. le carburant initial peut être enregistré lorsque suivi ;

11\. les informations du départ prévu et réel sont séparées ;

12\. la date et l'heure réelles sont enregistrées ;

13\. le départ est associé à l'utilisateur ;

14\. la réservation devient une location ;

15\. le véhicule passe en statut « En location » ;

16\. le véhicule ne peut plus être attribué à une location incompatible ;

17\. le tarif réellement appliqué est conservé ;

18\. les modifications sensibles sont contrôlées ;

19\. les corrections sont historisées ;

20\. les permissions sont respectées ;

21\. les actions importantes sont journalisées ;

22\. le dossier de location est prêt pour le workflow de retour.



\---



\# 55. Principe directeur



Le départ constitue la création de l'état de référence de la location.



Le principe fondamental est :



\*\*Avant la remise : vérifier.\*\*



\*\*Au moment de la remise : enregistrer.\*\*



\*\*Après la remise : protéger l'historique.\*\*



Le système doit permettre à ADIKOM de connaître précisément l'état du véhicule au moment où il quitte l'entreprise pour être utilisé par le client.



La chaîne doit être :



\*\*Réservation confirmée → Contrôle → État initial → Départ réel → Location en cours\*\*



Cet état initial servira ensuite de référence pour le workflow :



\*\*Retour → Comparaison → Incident éventuel → Maintenance éventuelle → Facturation → Paiement → Clôture.\*\*

