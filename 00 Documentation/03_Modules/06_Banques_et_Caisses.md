\# ADIKOM PILOT

\## Module 06 — Banques \& Caisses



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence fonctionnelle  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\# 1. Objet du module



Le module Banques \& Caisses permet à ADIKOM de centraliser et suivre ses comptes financiers internes ainsi que les mouvements de trésorerie.



Il constitue le référentiel des comptes utilisés pour enregistrer les encaissements, décaissements, transferts et autres mouvements financiers.



Le module doit permettre de savoir à tout moment :



\- quels comptes existent ;

\- quel est le solde de chaque compte ;

\- quels mouvements ont été enregistrés ;

\- d’où provient un mouvement ;

\- vers quel compte un montant a été transféré ;

\- quel utilisateur a effectué l’opération ;

\- quand l’opération a été réalisée.



Le module doit fonctionner en complément de \*\*Facturation \& Paiement\*\*.



Il ne doit pas devenir un deuxième système de facturation.



\---



\# 2. Objectifs



Le module doit permettre de :



1\. créer les comptes financiers d’ADIKOM ;

2\. gérer les comptes bancaires ;

3\. gérer les caisses ;

4\. consulter les soldes ;

5\. consulter les mouvements ;

6\. enregistrer les écritures ;

7\. effectuer des virements internes ;

8\. rechercher les opérations ;

9\. filtrer les mouvements ;

10\. assurer la traçabilité des opérations ;

11\. alimenter les informations financières du tableau de bord ;

12\. respecter les permissions des utilisateurs ;

13\. empêcher les incohérences financières ;

14\. conserver l’historique des opérations.



\---



\# 3. Structure générale



Le module est organisé comme suit :



Banques \& Caisses

│

├── Nouveau compte

├── Liste

├── Liste des écritures

└── Virement interne



Cette structure constitue la base fonctionnelle du MVP.



\---



\# 4. Principe général



Le module doit distinguer :



\*\*Compte\*\*



et



\*\*Écriture / mouvement\*\*



Un compte représente un emplacement financier.



Une écriture représente un mouvement enregistré sur ce compte.



Exemple :



Compte :

Caisse principale



Écriture :

Encaissement de 100 000 KMF



Le système doit conserver les deux informations séparément.



\---



\# 5. Types de comptes



Le système doit pouvoir gérer au minimum :



\- comptes bancaires ;

\- caisses.



Une évolution future pourra permettre d’ajouter d’autres types de comptes si ADIKOM en a besoin.



\---



\# 6. Création d’un compte



Le menu \*\*Nouveau compte\*\* doit permettre de créer un compte financier.



Les informations peuvent notamment comprendre :



\- nom du compte ;

\- type ;

\- établissement ;

\- numéro ou référence ;

\- devise ;

\- solde initial ;

\- date d’ouverture ;

\- statut ;

\- description ;

\- informations complémentaires.



Les champs obligatoires seront définis lors de l’implémentation.



\---



\# 7. Compte bancaire



Un compte bancaire peut notamment contenir :



\- nom de la banque ;

\- nom du compte ;

\- numéro de compte ;

\- référence interne ;

\- devise ;

\- solde initial ;

\- date d’ouverture ;

\- statut ;

\- informations complémentaires.



Les informations sensibles doivent être protégées selon les permissions.



\---



\# 8. Caisse



Une caisse représente une trésorerie physique ou un emplacement de fonds géré par ADIKOM.



Exemples :



\- Caisse principale ;

\- Caisse secondaire ;

\- autre caisse définie par ADIKOM.



Une caisse peut notamment contenir :



\- nom ;

\- responsable éventuel ;

\- devise ;

\- solde initial ;

\- statut ;

\- description.



\---



\# 9. Identifiant du compte



Chaque compte doit disposer d’un identifiant interne unique.



Exemple :



COMP-000001



Le format exact pourra être défini lors de l’implémentation.



L’identifiant doit permettre de retrouver facilement le compte dans les différentes opérations.



\---



\# 10. Statut du compte



Un compte peut disposer de plusieurs statuts.



Exemples :



\- Actif ;

\- Inactif ;

\- Archivé.



Un compte inactif ou archivé ne doit normalement plus être proposé pour de nouvelles opérations.



Son historique doit cependant rester consultable selon les permissions.



\---



\# 11. Devise



Chaque compte doit être associé à une devise.



Pour ADIKOM, la devise principale du système peut être le \*\*KMF\*\*.



Le système doit néanmoins être conçu de manière suffisamment flexible pour permettre l'ajout d'autres devises ultérieurement si nécessaire.



\---



\# 12. Solde initial



Lors de la création d’un compte, un solde initial peut être enregistré.



Le solde initial doit être traité comme une information comptable ou financière identifiable.



Le système doit éviter qu’un utilisateur puisse modifier librement le solde initial après le démarrage du compte sans autorisation.



Toute correction importante doit être traçable.



\---



\# 13. Liste des comptes



Le menu \*\*Liste\*\* doit permettre de consulter l’ensemble des comptes accessibles à l’utilisateur.



La liste peut afficher :



\- identifiant ;

\- nom ;

\- type ;

\- établissement ;

\- devise ;

\- solde ;

\- statut.



Les informations financières doivent respecter les permissions.



\---



\# 14. Recherche des comptes



La liste doit permettre de rechercher un compte par :



\- nom ;

\- identifiant ;

\- établissement ;

\- numéro ou référence lorsque cette donnée est autorisée.



La recherche doit être rapide.



\---



\# 15. Filtrage des comptes



Les filtres peuvent inclure :



\- type ;

\- statut ;

\- devise ;

\- établissement.



Le système doit permettre de retrouver facilement un compte spécifique.



\---



\# 16. Fiche compte



Chaque compte doit disposer d’une fiche détaillée.



Elle peut être organisée comme suit :



Fiche compte

│

├── Informations

├── Solde

├── Écritures

├── Virements

└── Historique



L’organisation graphique pourra être adaptée lors de la conception UX/UI.



\---



\# 17. Solde du compte



Le solde doit être calculé à partir des opérations enregistrées selon les règles financières définies.



Le système doit éviter que le solde soit simplement modifié manuellement sans écriture correspondante.



Principe :



Solde initial

\+

Entrées

\-

Sorties

=

Solde actuel



Le calcul exact doit tenir compte du type d’opération et de la nature des écritures.



\---



\# 18. Écritures



Une écriture représente un mouvement financier enregistré.



Elle doit notamment contenir :



\- compte ;

\- date ;

\- montant ;

\- sens ;

\- type d’opération ;

\- description ;

\- référence ;

\- utilisateur ;

\- date de création ;

\- objet associé lorsque nécessaire.



\---



\# 19. Sens de l’écriture



Le système doit distinguer au minimum :



\- entrée ;

\- sortie.



Exemple :



Entrée :

+100 000 KMF



Sortie :

\-50 000 KMF



Le sens doit être clairement visible dans les listes et fiches.



\---



\# 20. Types d’opérations



Les écritures peuvent provenir de plusieurs sources.



Exemples :



\- règlement client ;

\- paiement fournisseur ;

\- paiement divers ;

\- dépôt ;

\- retrait ;

\- virement interne ;

\- correction autorisée ;

\- autre opération financière définie par ADIKOM.



Lorsqu’une écriture provient d’un autre module, elle doit pouvoir être reliée à son origine.



\---



\# 21. Relation avec Facturation \& Paiement



Le module Banques \& Caisses doit être connecté au module Facturation \& Paiement.



Exemple :



Facture client

&#x20;  ↓

Règlement client

&#x20;  ↓

Compte bancaire ou caisse

&#x20;  ↓

Écriture financière



Le règlement doit pouvoir générer ou référencer l’écriture financière correspondante selon l’architecture retenue.



\---



\# 22. Relation avec les factures fournisseurs



Même logique pour les fournisseurs :



Facture fournisseur

&#x20;  ↓

Règlement fournisseur

&#x20;  ↓

Compte bancaire ou caisse

&#x20;  ↓

Écriture financière



Le mouvement doit rester traçable jusqu’à la facture d’origine.



\---



\# 23. Paiements divers



Les paiements divers peuvent également générer des écritures.



Exemple :



Paiement :

100 000 KMF



Compte :

Caisse principale



Nature :

Paiement divers



Le système doit permettre de conserver la description et la référence nécessaires.



\---



\# 24. Liste des écritures



Le menu \*\*Liste des écritures\*\* doit permettre de consulter les mouvements financiers.



La liste peut afficher :



\- date ;

\- compte ;

\- type ;

\- sens ;

\- montant ;

\- référence ;

\- description ;

\- utilisateur ;

\- origine.



\---



\# 25. Recherche des écritures



La recherche doit pouvoir prendre en compte :



\- référence ;

\- description ;

\- compte ;

\- utilisateur ;

\- origine.



Les résultats doivent respecter les permissions.



\---



\# 26. Filtres des écritures



Les filtres peuvent inclure :



\- période ;

\- compte ;

\- type d’opération ;

\- entrée ;

\- sortie ;

\- montant ;

\- utilisateur.



Le filtre de période doit être particulièrement utile pour les contrôles financiers.



\---



\# 27. Tri des écritures



La liste doit pouvoir être triée notamment par :



\- date ;

\- montant ;

\- compte ;

\- type.



Le tri doit rester cohérent avec la pagination.



\---



\# 28. Virement interne



Le menu \*\*Virement interne\*\* permet de transférer un montant entre deux comptes appartenant à ADIKOM.



Exemple :



Caisse principale

&#x20;  ↓

100 000 KMF

&#x20;  ↓

Compte bancaire ADIKOM



Le virement ne constitue pas un revenu ou une dépense de l’entreprise.



Il s’agit d’un transfert interne.



\---



\# 29. Création d’un virement interne



La création doit permettre de renseigner :



\- compte source ;

\- compte destination ;

\- montant ;

\- devise ;

\- date ;

\- motif ;

\- référence ;

\- commentaire.



Le compte source et le compte destination doivent être distincts.



\---



\# 30. Contrôle du solde avant virement



Le système doit vérifier que le compte source dispose du montant nécessaire selon les règles définies.



Exemple :



Solde compte source :

200 000 KMF



Virement :

100 000 KMF



Opération :

Autorisée



Si le solde disponible est insuffisant, le système doit empêcher l’opération ou demander une autorisation particulière si une règle métier future le prévoit.



Pour le MVP, l’option la plus sûre est de bloquer le virement lorsque les fonds disponibles sont insuffisants.



\---



\# 31. Double écriture du virement



Un virement interne doit produire deux mouvements liés :



Compte source

→ Sortie



Compte destination

→ Entrée



Exemple :



Caisse principale

\-100 000 KMF



Compte bancaire

+100 000 KMF



Les deux écritures doivent être liées au même identifiant de virement.



\---



\# 32. Traçabilité du virement



Le système doit conserver :



\- auteur ;

\- date ;

\- heure ;

\- compte source ;

\- compte destination ;

\- montant ;

\- motif ;

\- référence ;

\- statut.



Il doit être possible de retrouver les deux écritures à partir du virement.



\---



\# 33. Annulation d’un virement



Un virement déjà enregistré ne doit pas être simplement supprimé.



Une opération d’annulation ou de contrepassation doit être privilégiée selon les règles financières retenues.



L’historique du virement initial doit rester disponible.



Toute annulation doit être :



\- autorisée ;

\- justifiée ;

\- tracée.



\---



\# 34. Corrections financières



Les écritures financières importantes ne doivent pas être modifiées arbitrairement.



Lorsqu’une erreur doit être corrigée, le système devrait privilégier une opération de correction ou de contrepassation plutôt qu’une modification silencieuse de l’historique.



Exemple :



Écriture incorrecte

&#x20;  ↓

Correction autorisée

&#x20;  ↓

Nouvelle écriture de régularisation

&#x20;  ↓

Historique conservé



\---



\# 35. Suppression des écritures



La suppression définitive d’une écriture financière doit être fortement limitée.



Une écriture déjà intégrée dans le solde d’un compte ou liée à une opération métier ne doit pas être supprimée librement.



L’objectif est de préserver la traçabilité financière.



\---



\# 36. Statut des écritures



Selon les besoins, une écriture peut disposer d’un statut.



Exemples :



\- Brouillon ;

\- Validée ;

\- Annulée ;

\- Régularisée.



Pour le MVP, le système doit rester simple et ne proposer que les états réellement nécessaires.



\---



\# 37. Relation avec les clients



Lorsqu’un client effectue un règlement, l’écriture financière doit pouvoir être reliée au client concerné.



Exemple :



Client :

Société ABC



Facture :

FAC-000125



Règlement :

300 000 KMF



Compte :

Caisse principale



Cette relation doit permettre de retrouver l’opération depuis la fiche client ou la facture.



\---



\# 38. Relation avec les fournisseurs



Lorsqu’un paiement fournisseur est effectué, l’écriture doit pouvoir être liée au fournisseur.



Exemple :



Fournisseur :

Fournisseur A



Facture :

FF-000025



Paiement :

200 000 KMF



Compte :

Compte bancaire



Cette relation doit permettre une traçabilité complète.



\---



\# 39. Relation avec les imputations fournisseurs



Les imputations de maintenance ne doivent pas être considérées comme un simple mouvement bancaire.



Elles représentent une réduction du montant dû au fournisseur.



Exemple :



Facture fournisseur :

500 000 KMF



Imputation maintenance :

300 000 KMF



Net à payer :

200 000 KMF



Le système doit conserver cette relation dans Facturation \& Paiement et dans le référentiel fournisseur.



Le module Banques \& Caisses ne doit enregistrer un mouvement financier que lorsqu’un paiement réel est effectué.



\---



\# 40. Contrôle de cohérence



Le système doit éviter les incohérences entre les modules.



Exemple :



Une facture fournisseur de 500 000 KMF

avec une imputation de 300 000 KMF

doit présenter un montant restant cohérent de 200 000 KMF.



Le paiement de 200 000 KMF doit ensuite être enregistré dans le compte financier concerné.



Les modules doivent partager les mêmes données de référence.



\---



\# 41. Historique du compte



La fiche d’un compte doit permettre de retrouver les opérations passées.



L’historique doit notamment permettre de comprendre :



\- quand le compte a été créé ;

\- quelles opérations ont été effectuées ;

\- quels virements ont été réalisés ;

\- quelles corrections ont été enregistrées ;

\- quelles opérations ont été annulées.



\---



\# 42. Rapprochement futur



Une évolution future pourra permettre de rapprocher les écritures du système avec les relevés bancaires.



Cette fonctionnalité peut notamment permettre :



\- import de relevés ;

\- correspondance automatique ;

\- rapprochement manuel ;

\- identification des écarts ;

\- validation.



Cette fonctionnalité n’est pas obligatoire pour le MVP initial.



\---



\# 43. Tableau de synthèse



Le module peut proposer une vue synthétique présentant :



\- total des comptes ;

\- solde total ;

\- solde par compte ;

\- entrées récentes ;

\- sorties récentes ;

\- virements récents.



Les informations doivent être calculées à partir des données réelles.



\---



\# 44. Tableau de bord financier



Une vue financière peut être utilisée dans le Tableau de bord général.



Elle peut afficher selon les permissions :



\- solde bancaire ;

\- solde caisse ;

\- encaissements ;

\- décaissements ;

\- mouvements récents.



Les données financières doivent être masquées pour les utilisateurs ne disposant pas des droits nécessaires.



\---



\# 45. Notifications



Le module peut générer des notifications pour certains événements.



Exemples :



\- virement effectué ;

\- opération nécessitant une validation ;

\- correction financière ;

\- solde insuffisant ;

\- anomalie détectée ;

\- compte arrivé à un seuil défini.



Les notifications doivent respecter les permissions.



\---



\# 46. Seuils d’alerte



Une évolution peut permettre de définir un seuil d’alerte pour certains comptes.



Exemple :



Caisse principale

Seuil :

100 000 KMF



Solde :

80 000 KMF



Le système peut générer une alerte :



\*\*Le solde de la Caisse principale est inférieur au seuil défini.\*\*



Cette fonctionnalité peut être développée lorsque les besoins d’ADIKOM le justifieront.



\---



\# 47. Permissions



Les permissions peuvent notamment distinguer :



\- consulter les comptes ;

\- créer un compte ;

\- modifier un compte ;

\- archiver un compte ;

\- consulter les écritures ;

\- créer une écriture ;

\- effectuer un virement ;

\- annuler un virement ;

\- effectuer une correction ;

\- consulter les soldes ;

\- exporter les données.



Les permissions exactes seront définies dans le système global de rôles et permissions.



\---



\# 48. Sécurité



Les données financières doivent être considérées comme sensibles.



Le système doit empêcher :



\- accès non autorisé aux soldes ;

\- accès non autorisé aux écritures ;

\- création de mouvements sans permission ;

\- modification frauduleuse ;

\- suppression arbitraire ;

\- contournement des permissions.



Les contrôles doivent être effectués côté serveur.



\---



\# 49. Journalisation



Les opérations importantes doivent être enregistrées dans le journal d’activité.



Exemples :



\- création de compte ;

\- modification d’un compte ;

\- création d’écriture ;

\- virement ;

\- annulation ;

\- correction ;

\- modification d’un paramètre financier.



Le journal doit conserver :



\- utilisateur ;

\- action ;

\- date ;

\- heure ;

\- objet concerné.



\---



\# 50. Responsive design



Le module doit être entièrement responsive.



\### Desktop



Les tableaux financiers peuvent exploiter une largeur importante.



\### Tablette



Les colonnes doivent pouvoir être réorganisées.



\### Mobile



Les écritures peuvent être présentées sous forme de cartes ou de lignes détaillées.



Les informations importantes doivent rester accessibles.



\---



\# 51. Performance



Le système doit pouvoir gérer un historique financier croissant.



Les listes doivent prévoir :



\- pagination ;

\- recherche ;

\- filtrage ;

\- tri ;

\- chargement progressif.



Le calcul des soldes doit être optimisé.



\---



\# 52. Évolutivité



Le module pourra évoluer avec les besoins d’ADIKOM.



Fonctionnalités futures possibles :



\- rapprochement bancaire ;

\- import de relevés ;

\- export bancaire ;

\- multi-devises avancé ;

\- gestion de trésorerie prévisionnelle ;

\- budgets ;

\- prévisions de trésorerie ;

\- règles automatiques ;

\- alertes avancées ;

\- rapports financiers avancés.



Ces fonctionnalités ne sont pas nécessaires au MVP initial.



\---



\# 53. Relations avec les autres modules



Banques \& Caisses doit interagir avec :



Banques \& Caisses

│

├── Facturation \& Paiement

│   ├── Règlements clients

│   ├── Règlements fournisseurs

│   └── Paiements divers

│

├── Tiers

│   ├── Clients

│   └── Fournisseurs

│

├── Gestion de location

│   └── Données financières liées aux locations

│

├── Tableau de bord

│   └── Indicateurs financiers

│

└── Utilisateurs \& Groupes

&#x20;   └── Permissions



Chaque module doit conserver sa responsabilité fonctionnelle.



\---



\# 54. Exemple complet — règlement client



\### Étape 1



Une facture client est créée :



FAC-000125



Montant :

450 000 KMF



\### Étape 2



Le client effectue le règlement.



Montant :

450 000 KMF



\### Étape 3



Le règlement est enregistré dans Facturation \& Paiement.



\### Étape 4



Le compte financier est sélectionné :



Caisse principale



\### Étape 5



Une entrée financière est enregistrée :



+450 000 KMF



\### Étape 6



Le règlement est lié :



Client

→ Facture

→ Règlement

→ Compte

→ Écriture



\---



\# 55. Exemple complet — paiement fournisseur avec imputation



\### Situation



Facture fournisseur :



500 000 KMF



Maintenance imputable :



300 000 KMF



\### Étape 1



L’imputation est enregistrée :



300 000 KMF



\### Étape 2



Montant restant :



200 000 KMF



\### Étape 3



ADIKOM paie le fournisseur :



200 000 KMF



\### Étape 4



Le paiement est enregistré dans Facturation \& Paiement.



\### Étape 5



Le compte bancaire est sélectionné.



\### Étape 6



Une sortie financière est enregistrée :



\-200 000 KMF



La chaîne devient :



Véhicule

→ Maintenance

→ Dépense

→ Imputation

→ Facture fournisseur

→ Paiement

→ Compte bancaire

→ Écriture



Cette traçabilité doit être conservée.



\---



\# 56. Critères d’acceptation du module



Le module Banques \& Caisses sera considéré comme fonctionnel lorsque :



1\. les comptes peuvent être créés ;

2\. les comptes bancaires peuvent être gérés ;

3\. les caisses peuvent être gérées ;

4\. les soldes sont correctement calculés ;

5\. les écritures peuvent être enregistrées selon les permissions ;

6\. les entrées et sorties sont distinguées ;

7\. les écritures sont recherchables ;

8\. les écritures sont filtrables ;

9\. les virements internes peuvent être réalisés ;

10\. un virement produit une sortie sur le compte source et une entrée sur le compte destination ;

11\. les deux écritures restent liées ;

12\. les virements incohérents sont bloqués ;

13\. les paiements clients peuvent alimenter les comptes ;

14\. les paiements fournisseurs peuvent alimenter les comptes ;

15\. les paiements divers peuvent être enregistrés ;

16\. les écritures financières restent traçables ;

17\. les corrections ne détruisent pas l’historique ;

18\. les informations financières respectent les permissions ;

19\. les opérations sensibles sont journalisées ;

20\. le module est responsive ;

21\. le module peut alimenter le Tableau de bord ;

22\. les relations avec Facturation \& Paiement sont cohérentes.



\---



\# 57. Principe directeur



Le module Banques \& Caisses doit permettre à ADIKOM de garder une vision claire de sa trésorerie réelle.



Il doit répondre à des questions simples :



\*\*Combien avons-nous ?\*\*



\*\*Où se trouve l’argent ?\*\*



\*\*Quelles entrées ont été réalisées ?\*\*



\*\*Quelles sorties ont été réalisées ?\*\*



\*\*Pourquoi ?\*\*



\*\*Par qui ?\*\*



\*\*À quelle date ?\*\*



\*\*Quelle facture ou opération est concernée ?\*\*



Le principe fondamental est :



\*\*Un mouvement financier réel → une écriture identifiable → une origine traçable → un solde cohérent.\*\*



Le module doit garantir l’intégrité des mouvements financiers tout en restant suffisamment simple pour être utilisé quotidiennement par les équipes d’ADIKOM.

