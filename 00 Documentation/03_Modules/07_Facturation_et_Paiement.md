\# ADIKOM PILOT

\## Module 07 — Facturation \& Paiement



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence fonctionnelle  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\# 1. Objet du module



Le module Facturation \& Paiement constitue le centre de gestion des factures et des règlements d’ADIKOM.



Il permet de gérer :



\- les factures clients ;

\- les règlements clients ;

\- les factures fournisseurs ;

\- les règlements fournisseurs ;

\- les paiements divers ;

\- les statistiques ;

\- les rapports ;

\- les relations entre facturation, tiers, locations et trésorerie.



Le module doit permettre de conserver une vision claire du cycle :



\*\*Opération → Facture → Règlement → Compte financier → Écriture\*\*



Il doit également gérer le cas particulier des dépenses de maintenance pouvant être imputées sur les montants dus aux fournisseurs.



\---



\# 2. Objectifs



Le module doit permettre de :



1\. créer les factures clients ;

2\. gérer les factures clients ;

3\. enregistrer les règlements clients ;

4\. suivre les créances ;

5\. créer les factures fournisseurs ;

6\. gérer les factures fournisseurs ;

7\. enregistrer les règlements fournisseurs ;

8\. gérer les paiements divers ;

9\. gérer les factures impayées ou en retard ;

10\. gérer les imputations fournisseurs ;

11\. relier les factures aux tiers ;

12\. relier les factures aux locations lorsque nécessaire ;

13\. alimenter Banques \& Caisses lors des règlements ;

14\. produire des statistiques ;

15\. produire des rapports ;

16\. assurer une traçabilité complète ;

17\. respecter les permissions des utilisateurs.



\---



\# 3. Structure générale



Le module est organisé comme suit :



Facturation \& Paiement

│

├── Factures clients

│   ├── Nouvelle facture

│   ├── Liste

│   ├── Règlements

│   ├── Statistiques

│   └── Rapports

│

├── Factures fournisseurs

│   ├── Nouvelle facture

│   ├── Liste

│   ├── Règlements

│   ├── Statistiques

│   └── Rapports

│

└── Paiements divers



Cette structure constitue la base fonctionnelle du MVP.



\---



\# 4. Principe général



Une facture représente une créance ou une dette enregistrée.



Un règlement représente le paiement réel ou enregistré concernant cette facture.



Le système doit distinguer clairement :



\*\*Facture\*\*



et



\*\*Règlement\*\*



Exemple :



Facture client :

500 000 KMF



Règlement :

300 000 KMF



Solde :

200 000 KMF



La facture ne doit pas être considérée comme entièrement payée tant que son solde n’est pas nul, sauf règle métier particulière.



\---



\# 5. Factures clients



\## 5.1. Nouvelle facture



Le menu Nouvelle facture doit permettre de créer une facture client.



La facture peut être créée :



\- directement ;

\- à partir d’une location ;

\- à partir d’une autre opération autorisée.



Lorsqu’une facture provient d’une location, les informations pertinentes doivent être récupérées automatiquement afin d’éviter une ressaisie inutile.



\---



\# 6. Informations d’une facture client



Une facture client peut contenir :



\- numéro ;

\- client ;

\- date d’émission ;

\- date d’échéance ;

\- statut ;

\- lignes de facturation ;

\- sous-total ;

\- remise ;

\- taxes lorsque applicables ;

\- total ;

\- montant payé ;

\- solde ;

\- conditions de paiement ;

\- référence de l’opération d’origine ;

\- notes ;

\- documents associés.



\---



\# 7. Numéro de facture



Chaque facture doit disposer d’un numéro unique.



Exemple :



FAC-2026-000001



Le format exact pourra être défini lors de l’implémentation.



Le système doit empêcher deux factures d’utiliser le même numéro.



\---



\# 8. Statuts des factures clients



Les statuts peuvent notamment être :



\- Brouillon ;

\- Émise ;

\- Partiellement payée ;

\- Payée ;

\- En retard ;

\- Annulée.



Le système doit utiliser des transitions cohérentes.



\---



\# 9. Brouillon



Une facture en brouillon n’est pas encore considérée comme définitivement émise.



Elle peut être modifiée selon les permissions.



Elle ne doit pas être considérée comme une créance définitive tant qu’elle n’est pas validée ou émise selon le processus retenu.



\---



\# 10. Émission



Lorsqu’une facture est émise :



\- elle reçoit son statut approprié ;

\- elle devient exploitable dans le suivi des créances ;

\- son historique est conservé ;

\- les informations importantes doivent être protégées contre les modifications non autorisées.



\---



\# 11. Lignes de facture



> \*\*Décision arbitrée — DEC-001\*\*
>
> L'exemple ci-dessous (« 3 jours · 300 000 KMF ») suppose un \*\*tarif journalier\*\*,
> alors que `03\_Modules/05\_Gestion\_de\_Location.md` §69 et `04\_Workflows/02\_Reservation.md` §61
> décrivent un \*\*forfait\*\* (3 jours facturés 450 000 KMF).
>
> Règle retenue : \*\*chaque tarif porte son unité\*\* — `JOUR` (montant × durée) ou `FORFAIT` (montant fixe).
> Les deux lectures deviennent valides.
>
> Voir `08\_Decisions/01\_Journal\_des\_Decisions.md`.



Une facture doit être composée de lignes détaillées.



Exemple :



Location Toyota T5

3 jours

300 000 KMF



Service supplémentaire

1

50 000 KMF



Total :

350 000 KMF



Chaque ligne peut contenir :



\- description ;

\- quantité ;

\- unité ;

\- prix unitaire ;

\- remise ;

\- montant ;

\- référence éventuelle.



\---



\# 12. Facturation d’une location



Lorsqu’une location génère une facture, le module doit récupérer les informations nécessaires depuis Gestion de location.



Exemple :



Location :

Toyota T5



Client :

Société ABC



Période :

20/08/2026 → 23/08/2026



Tarif appliqué :

450 000 KMF



La facture doit pouvoir reprendre ces informations sans que l’utilisateur ait à les ressaisir manuellement.



\---



\# 13. Tarif préférentiel



Lorsqu’un client bénéficie d’un tarif préférentiel, le tarif réellement appliqué à la location doit être utilisé pour la facturation.



Exemple :



Tarif standard :

500 000 KMF



Tarif préférentiel client :

450 000 KMF



Tarif de la location :

450 000 KMF



Facture :

450 000 KMF



Le module de facturation ne doit pas recalculer arbitrairement le tarif.



Il doit utiliser le montant validé par l’opération source.



\---



\# 14. Conservation du montant facturé



Une fois la facture émise, le montant facturé doit rester associé à cette facture.



Une modification ultérieure de la grille tarifaire ne doit pas modifier automatiquement une facture existante.



Toute correction doit être explicite, autorisée et traçable.



\---



\# 15. Liste des factures clients



Le menu Liste doit permettre de consulter les factures clients.



La liste peut afficher :



\- numéro ;

\- client ;

\- date ;

\- échéance ;

\- montant ;

\- montant payé ;

\- solde ;

\- statut.



\---



\# 16. Recherche des factures clients



La recherche peut être effectuée par :



\- numéro de facture ;

\- client ;

\- référence ;

\- période.



Elle doit être suffisamment rapide pour une utilisation quotidienne.



\---



\# 17. Filtres des factures clients



Les filtres peuvent inclure :



\- statut ;

\- période ;

\- client ;

\- montant ;

\- factures en retard ;

\- factures impayées ;

\- factures partiellement payées.



\---



\# 18. Fiche facture client



La fiche facture doit présenter :



\- informations générales ;

\- client ;

\- lignes ;

\- montants ;

\- paiements ;

\- solde ;

\- documents ;

\- historique.



Elle doit permettre de comprendre rapidement la situation financière de la facture.



\---



\# 19. Règlements clients



Le menu Règlements permet de consulter et gérer les paiements reçus des clients.



Un règlement peut contenir :



\- client ;

\- facture ;

\- date ;

\- montant ;

\- mode de paiement ;

\- compte bancaire ou caisse ;

\- référence ;

\- commentaire ;

\- utilisateur.



\---



\# 20. Paiement partiel



Le système doit permettre les paiements partiels.



Exemple :



Facture :

500 000 KMF



Premier règlement :

200 000 KMF



Solde :

300 000 KMF



Deuxième règlement :

300 000 KMF



Solde :

0 KMF



Statut :

Payée



Chaque règlement doit rester identifiable.



\---



\# 21. Paiement supérieur au solde



Le système doit contrôler les paiements supérieurs au montant restant.



Exemple :



Solde :

300 000 KMF



Règlement :

400 000 KMF



Le système doit empêcher l’opération ou demander une gestion explicite d’un éventuel excédent selon les règles métier définies.



Pour le MVP, une validation stricte est préférable afin d’éviter les incohérences.



\---



\# 22. Modes de paiement



Le système doit pouvoir gérer plusieurs modes de paiement.



Exemples :



\- espèces ;

\- virement bancaire ;

\- autre moyen de paiement utilisé par ADIKOM.



Les moyens réellement utilisés doivent être configurables.



\---



\# 23. Lien avec Banques \& Caisses



Lorsqu’un règlement est enregistré, il doit pouvoir être associé au compte financier concerné.



Exemple :



Facture :

FAC-2026-000001



Règlement :

450 000 KMF



Mode :

Espèces



Compte :

Caisse principale



Une écriture financière doit être créée ou référencée selon l’architecture retenue.



La relation doit être :



Facture

→ Règlement

→ Compte

→ Écriture



\---



\# 24. Factures en retard



Une facture doit pouvoir être identifiée comme en retard lorsque :



\- son échéance est dépassée ;

\- son solde reste supérieur à zéro ;

\- elle n’est pas annulée.



Le système peut alors générer une notification selon les règles du Centre de notifications.



\---



\# 25. Relances



Une évolution du module peut permettre de gérer les relances clients.



Exemples :



\- rappel avant échéance ;

\- rappel à échéance ;

\- relance après échéance.



Cette fonctionnalité pourra être développée progressivement.



\---



\# 26. Statistiques clients



Le menu Statistiques doit permettre d’obtenir une vision synthétique des factures clients.



Indicateurs possibles :



\- total facturé ;

\- total encaissé ;

\- total restant ;

\- factures payées ;

\- factures impayées ;

\- factures en retard ;

\- paiements par période.



Les indicateurs doivent être calculés à partir des données réelles.



\---



\# 27. Rapports clients



Le menu Rapports peut permettre de produire des rapports sur :



\- chiffre d’affaires facturé ;

\- encaissements ;

\- créances ;

\- impayés ;

\- factures par période ;

\- factures par client.



Les rapports doivent respecter les permissions.



\---



\# 28. Factures fournisseurs



Le menu Nouvelle facture permet d’enregistrer une facture reçue d’un fournisseur.



Une facture fournisseur peut notamment être liée à :



\- un fournisseur ;

\- un véhicule ;

\- une maintenance ;

\- une dépense ;

\- une autre opération.



\---



\# 29. Informations d’une facture fournisseur



Une facture fournisseur peut contenir :



\- numéro ;

\- fournisseur ;

\- date ;

\- échéance ;

\- statut ;

\- lignes ;

\- montant ;

\- montant imputé ;

\- montant payé ;

\- solde ;

\- documents ;

\- notes ;

\- référence.



\---



\# 30. Numéro de facture fournisseur



Chaque facture fournisseur doit disposer d’un identifiant interne unique.



Exemple :



FF-2026-000001



Le numéro de facture fourni par le fournisseur peut également être enregistré comme référence externe.



Le système doit pouvoir distinguer :



\*\*Numéro interne ADIKOM\*\*



et



\*\*Numéro de facture du fournisseur\*\*



\---



\# 31. Statuts des factures fournisseurs



Les statuts peuvent notamment être :



\- Brouillon ;

\- En attente ;

\- Validée ;

\- Partiellement payée ;

\- Payée ;

\- En retard ;

\- Annulée.



\---



\# 32. Liste des factures fournisseurs



La liste doit afficher notamment :



\- numéro ;

\- fournisseur ;

\- date ;

\- échéance ;

\- montant ;

\- montant imputé ;

\- montant payé ;

\- solde ;

\- statut.



\---



\# 33. Recherche des factures fournisseurs



La recherche peut prendre en compte :



\- numéro interne ;

\- numéro fournisseur ;

\- fournisseur ;

\- période ;

\- référence ;

\- véhicule lorsque la facture y est liée.



\---



\# 34. Filtres des factures fournisseurs



Les filtres peuvent inclure :



\- fournisseur ;

\- statut ;

\- période ;

\- factures en retard ;

\- factures impayées ;

\- présence d’une imputation ;

\- véhicule.



\---



\# 35. Règlements fournisseurs



Le menu Règlements permet de gérer les paiements effectués aux fournisseurs.



Un règlement peut contenir :



\- fournisseur ;

\- facture ;

\- date ;

\- montant ;

\- compte bancaire ou caisse ;

\- mode de paiement ;

\- référence ;

\- utilisateur ;

\- commentaire.



\---



\# 36. Paiement partiel fournisseur



Le système doit permettre un paiement partiel.



Exemple :



Facture fournisseur :

500 000 KMF



Imputation :

300 000 KMF



Solde après imputation :

200 000 KMF



Paiement :

100 000 KMF



Reste :

100 000 KMF



La facture reste partiellement payée.



\---



\# 37. Imputation de maintenance



Le module doit gérer le cas particulier d’ADIKOM concernant les dépenses de maintenance imputables aux fournisseurs.



Exemple :



Fournisseur A :

500 000 KMF



Maintenance Toyota T5 :

300 000 KMF



Montant imputé :

300 000 KMF



Montant restant dû :

200 000 KMF



L’imputation doit être enregistrée comme une opération distincte du paiement.



\---



\# 38. Principe de l’imputation



L’imputation diminue le montant restant dû au fournisseur.



Elle ne constitue pas un paiement bancaire ou caisse.



Ainsi :



Montant facture fournisseur

− Imputations

− Paiements

=

Solde restant



Exemple :



500 000

− 300 000

− 100 000

=

100 000 KMF



Le système doit utiliser cette logique pour calculer le solde.



\---



\# 39. Traçabilité de l’imputation



Chaque imputation doit pouvoir être reliée à :



\- fournisseur ;

\- facture fournisseur ;

\- véhicule ;

\- maintenance ;

\- dépense ;

\- montant ;

\- utilisateur ;

\- date ;

\- justification.



L’objectif est de pouvoir répondre :



\*\*Pourquoi 300 000 KMF ont-ils été déduits de cette facture fournisseur ?\*\*



La réponse doit être retrouvable directement dans le système.



\---



\# 40. Imputation partielle



Une dépense peut être imputée partiellement.



Exemple :



Dépense :

300 000 KMF



Imputation 1 :

100 000 KMF



Imputation 2 :

150 000 KMF



Reste :

50 000 KMF



Le système doit empêcher que le montant total des imputations dépasse le montant imputable.



\---



\# 41. Double imputation



Le système doit empêcher une même dépense d’être imputée plusieurs fois au-delà du montant autorisé.



Le contrôle doit être effectué côté serveur.



Une dépense de 300 000 KMF ne doit jamais permettre une imputation totale de 500 000 KMF sans règle métier explicitement prévue.



\---



\# 42. Relation avec Gestion de location



La chaîne fonctionnelle peut être :



Location

→ Véhicule

→ Fournisseur

→ Incident

→ Maintenance

→ Dépense

→ Imputation

→ Facture fournisseur

→ Règlement

→ Banques \& Caisses



Chaque module conserve sa propre responsabilité.



\---



\# 43. Paiements divers



Le menu Paiements divers permet d’enregistrer des paiements qui ne sont pas directement rattachés à une facture client ou fournisseur.



Exemples :



\- frais administratifs ;

\- petite dépense ;

\- prestation ponctuelle ;

\- autre paiement autorisé.



Chaque paiement doit toutefois être suffisamment documenté.



\---



\# 44. Informations d’un paiement divers



Un paiement divers peut contenir :



\- date ;

\- montant ;

\- bénéficiaire ;

\- catégorie ;

\- compte source ;

\- motif ;

\- référence ;

\- justificatif ;

\- utilisateur ;

\- commentaire.



\---



\# 45. Relation avec Banques \& Caisses



Lorsqu’un paiement divers est validé, il doit être associé au compte financier utilisé.



Exemple :



Paiement divers :

50 000 KMF



Compte :

Caisse principale



Le système doit générer ou référencer l’écriture financière correspondante.



\---



\# 46. Statuts des paiements divers



Les paiements divers peuvent être :



\- Brouillon ;

\- Validé ;

\- Annulé.



Les statuts exacts pourront être adaptés selon les règles d’ADIKOM.



\---



\# 47. Annulation



Une facture ou un règlement ne doit pas être supprimé arbitrairement.



Lorsqu’une opération doit être annulée, le système doit conserver sa trace.



Exemple :



Règlement enregistré

→ Annulation autorisée

→ Historique conservé



Les règles exactes de contrepassation seront définies lors de l’implémentation financière.



\---



\# 48. Documents justificatifs



Les factures et paiements peuvent être associés à des documents justificatifs.



Exemples :



\- facture PDF ;

\- reçu ;

\- justificatif de paiement ;

\- document fournisseur ;

\- pièce complémentaire.



Les documents doivent être protégés selon les permissions.



\---



\# 49. Historique



Chaque facture doit disposer d’un historique.



Il doit permettre de retrouver notamment :



\- création ;

\- modification ;

\- émission ;

\- règlement ;

\- imputation ;

\- annulation ;

\- modification importante.



L’historique doit identifier :



\- utilisateur ;

\- date ;

\- heure ;

\- action.



\---



\# 50. Recherche globale



Les factures et paiements doivent pouvoir être retrouvés depuis la recherche globale du SaaS lorsque celle-ci est disponible.



La recherche doit respecter les permissions.



\---



\# 51. Notifications



Le module peut générer des notifications concernant :



\- facture créée ;

\- facture à valider ;

\- facture proche de l’échéance ;

\- facture en retard ;

\- paiement reçu ;

\- paiement fournisseur à effectuer ;

\- imputation à traiter ;

\- opération financière nécessitant une validation.



Les notifications doivent respecter les permissions.



\---



\# 52. Permissions



Les permissions peuvent notamment distinguer :



\### Factures clients



\- consulter ;

\- créer ;

\- modifier ;

\- émettre ;

\- annuler ;

\- consulter les règlements ;

\- enregistrer un règlement ;

\- consulter les statistiques ;

\- consulter les rapports.



\### Factures fournisseurs



\- consulter ;

\- créer ;

\- modifier ;

\- valider ;

\- annuler ;

\- enregistrer une imputation ;

\- consulter les règlements ;

\- enregistrer un règlement ;

\- consulter les statistiques ;

\- consulter les rapports.



\### Paiements divers



\- consulter ;

\- créer ;

\- modifier ;

\- valider ;

\- annuler.



Les permissions exactes seront définies dans le système global de rôles et permissions.



\---



\# 53. Sécurité



Les informations financières doivent être protégées.



Le système doit empêcher :



\- accès non autorisé ;

\- modification non autorisée ;

\- suppression arbitraire ;

\- création de faux règlements ;

\- modification d’un montant après validation sans permission ;

\- contournement des permissions.



Les contrôles doivent être effectués côté serveur.



\---



\# 54. Journalisation



Les opérations sensibles doivent être journalisées.



Exemples :



\- création d’une facture ;

\- émission ;

\- modification ;

\- règlement ;

\- imputation ;

\- annulation ;

\- paiement divers ;

\- correction.



Le journal doit conserver :



\- utilisateur ;

\- action ;

\- date ;

\- heure ;

\- élément concerné.



\---



\# 55. Cohérence financière



Le système doit maintenir une cohérence entre :



\*\*Factures\*\*



\*\*Règlements\*\*



\*\*Imputations\*\*



\*\*Paiements\*\*



\*\*Banques \& Caisses\*\*



Exemple facture fournisseur :



500 000 KMF



Imputation :

300 000 KMF



Paiement :

200 000 KMF



Solde :

0 KMF



Statut :

Payée



La logique doit être calculée automatiquement.



\---



\# 56. Règle de calcul du solde client



Pour une facture client :



\*\*Solde = Total facture − Total règlements\*\*



Exemple :



Facture :

500 000 KMF



Règlements :

200 000 + 300 000



Solde :

0 KMF



Statut :

Payée



\---



\# 57. Règle de calcul du solde fournisseur



Pour une facture fournisseur :



\*\*Solde = Total facture − Total imputations − Total paiements\*\*



Exemple :



Facture :

500 000 KMF



Imputation :

300 000 KMF



Paiement :

100 000 KMF



Solde :

100 000 KMF



Le système doit conserver séparément :



\- montant facturé ;

\- montant imputé ;

\- montant payé ;

\- montant restant.



\---



\# 58. Tableau de synthèse



Le module peut proposer une vue synthétique.



\### Clients



\- total facturé ;

\- total encaissé ;

\- créances ;

\- impayés ;

\- retards.



\### Fournisseurs



\- total facturé ;

\- total imputé ;

\- total payé ;

\- dettes restantes ;

\- factures en retard.



Les informations doivent respecter les permissions.



\---



\# 59. Statistiques



Les statistiques peuvent notamment présenter :



\- chiffre d’affaires ;

\- encaissements ;

\- créances ;

\- paiements fournisseurs ;

\- dettes fournisseurs ;

\- imputations ;

\- paiements divers.



Les périodes peuvent être :



\- jour ;

\- semaine ;

\- mois ;

\- trimestre ;

\- année ;

\- période personnalisée.



\---



\# 60. Rapports



Le module doit pouvoir produire des rapports adaptés aux permissions.



Exemples :



\- état des factures clients ;

\- état des créances ;

\- état des factures fournisseurs ;

\- état des dettes ;

\- état des règlements ;

\- état des imputations ;

\- état des paiements divers.



Les formats d’export pourront être définis lors de l’implémentation.



\---



\# 61. Responsive design



Le module doit être entièrement responsive.



\### Desktop



Les tableaux peuvent afficher plusieurs colonnes.



\### Tablette



Les colonnes doivent être réorganisées selon la largeur disponible.



\### Mobile



Les factures et paiements doivent pouvoir être présentés sous forme de cartes ou de fiches synthétiques.



Les montants et statuts doivent rester immédiatement visibles.



\---



\# 62. Performance



Le module doit pouvoir gérer un historique important de factures et règlements.



Les listes doivent utiliser lorsque nécessaire :



\- pagination ;

\- recherche ;

\- filtres ;

\- tri ;

\- chargement progressif.



Les statistiques lourdes doivent être optimisées.



\---



\# 63. Évolutivité



Le module pourra évoluer avec les besoins d’ADIKOM.



Fonctionnalités futures possibles :



\- relances automatiques ;

\- modèles de factures avancés ;

\- facturation récurrente ;

\- paiements en ligne ;

\- signature électronique ;

\- rapprochement automatique ;

\- multi-devises avancé ;

\- échéanciers ;

\- automatisation des relances ;

\- analyses financières avancées.



Ces fonctionnalités ne sont pas obligatoires pour le MVP.



\---



\# 64. Relations avec les autres modules



Facturation \& Paiement doit interagir avec :



Facturation \& Paiement

│

├── Tiers

│   ├── Clients

│   └── Fournisseurs

│

├── Gestion de location

│   └── Données de location

│

├── Banques \& Caisses

│   └── Écritures financières

│

├── Tableau de bord

│   └── KPI financiers

│

├── Centre de notifications

│   └── Alertes et échéances

│

└── Utilisateurs \& Groupes

&#x20;   └── Permissions



Chaque module doit conserver sa responsabilité fonctionnelle.



\---



\# 65. Exemple complet — facture client issue d’une location



\### Étape 1



Location :



Client :

Société ABC



Véhicule :

Toyota T5



Tarif appliqué :

450 000 KMF



\### Étape 2



La location est clôturée.



\### Étape 3



Le système génère les éléments de facturation.



\### Étape 4



Facture :



FAC-2026-000001



Total :

450 000 KMF



\### Étape 5



Le client règle :



200 000 KMF



\### Étape 6



Solde :



250 000 KMF



\### Étape 7



Le client règle :



250 000 KMF



\### Étape 8



Solde :



0 KMF



Statut :



Payée



\### Étape 9



Les deux règlements sont liés :



Client

→ Location

→ Facture

→ Règlement 1

→ Règlement 2

→ Banques \& Caisses



\---



\# 66. Exemple complet — facture fournisseur avec maintenance imputée



\### Situation



Fournisseur :

Fournisseur A



Véhicule :

Toyota T5



Facture fournisseur :

500 000 KMF



\### Maintenance



Coût :

300 000 KMF



La dépense est déclarée imputable au fournisseur.



\### Imputation



Montant imputé :

300 000 KMF



\### Solde fournisseur



500 000

− 300 000

=

200 000 KMF



\### Paiement



ADIKOM paie :



200 000 KMF



\### Résultat



Solde :

0 KMF



Statut :

Payée



La facture reste liée à :



Fournisseur

→ Véhicule

→ Maintenance

→ Dépense

→ Imputation

→ Facture

→ Paiement

→ Compte financier



\---



\# 67. Critères d’acceptation du module



Le module Facturation \& Paiement sera considéré comme fonctionnel lorsque :



1\. les factures clients peuvent être créées ;

2\. les factures clients peuvent être recherchées ;

3\. les factures clients peuvent être filtrées ;

4\. les règlements clients peuvent être enregistrés ;

5\. les paiements partiels sont gérés ;

6\. les soldes clients sont calculés correctement ;

7\. les factures fournisseurs peuvent être créées ;

8\. les factures fournisseurs peuvent être recherchées ;

9\. les factures fournisseurs peuvent être filtrées ;

10\. les règlements fournisseurs peuvent être enregistrés ;

11\. les imputations fournisseurs peuvent être enregistrées ;

12\. les imputations sont liées aux dépenses concernées ;

13\. les imputations ne peuvent pas dépasser les montants autorisés ;

14\. les paiements fournisseurs tiennent compte des imputations ;

15\. les paiements divers peuvent être enregistrés ;

16\. les règlements peuvent être reliés à Banques \& Caisses ;

17\. les factures peuvent être liées aux tiers ;

18\. les factures issues de locations peuvent récupérer les données nécessaires ;

19\. les tarifs réellement appliqués sont conservés ;

20\. les statistiques sont calculées à partir des données réelles ;

21\. les rapports respectent les permissions ;

22\. les opérations sensibles sont journalisées ;

23\. les informations financières sont protégées ;

24\. le module est responsive ;

25\. les historiques restent accessibles ;

26\. aucune opération financière ne peut contourner le système de permissions.



\---



\# 68. Principe directeur



Le module Facturation \& Paiement doit permettre à ADIKOM de suivre avec précision :



\*\*Ce qui est facturé\*\*



\*\*Ce qui est encaissé\*\*



\*\*Ce qui reste à encaisser\*\*



\*\*Ce qui est dû aux fournisseurs\*\*



\*\*Ce qui a été imputé\*\*



\*\*Ce qui a été payé\*\*



\*\*Ce qui reste à payer\*\*



Le principe fondamental est :



\*\*Facturer → Suivre → Régler → Enregistrer → Contrôler → Tracer\*\*



Pour les fournisseurs :



\*\*Facture → Imputation éventuelle → Paiement → Solde\*\*



Et pour les locations :



\*\*Location → Facturation → Règlement → Trésorerie\*\*



Le module doit garantir une continuité parfaite entre les opérations commerciales, la facturation et les mouvements financiers, tout en conservant une séparation claire des responsabilités entre les différents modules d’ADIKOM PILOT.

