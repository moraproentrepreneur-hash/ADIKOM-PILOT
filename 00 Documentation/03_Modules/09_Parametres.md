\# ADIKOM PILOT

\## Module 09 — Paramètres



\*\*Version :\*\* 1.0  

\*\*Statut :\*\* Document de référence fonctionnelle  

\*\*Entreprise :\*\* ADIKOM Technology \& Travel  

\*\*Projet :\*\* ADIKOM PILOT  

\*\*Périmètre :\*\* MVP



\---



\# 1. Objet du module



Le module Paramètres constitue l’espace d’administration de la configuration générale d’ADIKOM PILOT.



Il permet de définir les informations et règles générales nécessaires au fonctionnement du SaaS.



Le module doit rester distinct du module \*\*Utilisateurs \& Groupes\*\*.



La gestion des utilisateurs et des permissions relève de \*\*Utilisateurs \& Groupes\*\*.



La gestion des paramètres généraux de l’entreprise relève de \*\*Paramètres\*\*.



\---



\# 2. Objectifs



Le module doit permettre de :



1\. centraliser les informations générales d’ADIKOM ;

2\. configurer l’identité de l’entreprise ;

3\. gérer les coordonnées officielles ;

4\. gérer les informations utilisées dans les documents ;

5\. configurer les préférences générales du SaaS ;

6\. préparer les paramètres nécessaires aux autres modules ;

7\. éviter de coder en dur les informations susceptibles d’évoluer ;

8\. assurer une configuration cohérente dans toute l’application ;

9\. protéger les paramètres sensibles ;

10\. conserver une architecture évolutive.



\---



\# 3. Structure générale



Le module est organisé autour du menu :



Paramètres

│

└── Entreprise



Cette structure constitue la base du MVP.



Le module pourra accueillir ultérieurement d’autres menus de configuration si les besoins d’ADIKOM évoluent.



\---



\# 4. Menu Entreprise



Le menu \*\*Entreprise\*\* constitue la fiche de configuration générale d’ADIKOM.



Il doit permettre de renseigner les informations utilisées dans l’ensemble du SaaS.



Exemples :



\- identité ;

\- coordonnées ;

\- informations administratives ;

\- informations commerciales ;

\- informations de facturation ;

\- identité visuelle ;

\- paramètres documentaires.



\---



\# 5. Identité de l’entreprise



La section Identité doit permettre de renseigner notamment :



\- nom officiel ;

\- nom commercial ;

\- sigle ;

\- description ;

\- activité ;

\- slogan lorsque nécessaire ;

\- identifiant interne.



Les informations doivent être centralisées afin d’éviter leur duplication dans les différents modules.



\---



\# 6. Logo de l’entreprise



Le système doit permettre d'enregistrer le logo officiel d'ADIKOM.



Le logo doit pouvoir être utilisé dans les documents générés par le SaaS lorsque cette fonctionnalité sera développée.



Exemples :



\- factures ;

\- rapports ;

\- documents administratifs ;

\- exports ;

\- documents de location.



Le système ne doit pas déformer le logo.



Le ratio original doit être conservé.



\---



\# 7. Identité visuelle



La configuration peut prévoir les éléments nécessaires à l'identité visuelle d'ADIKOM PILOT.



Exemples :



\- logo ;

\- couleur principale ;

\- couleur secondaire ;

\- couleur d’accent ;

\- autres éléments nécessaires aux documents.



Les paramètres visuels doivent être utilisés de manière cohérente dans les documents générés par le système.



\---



\# 8. Coordonnées



La section Coordonnées doit permettre de renseigner :



\- adresse ;

\- ville ;

\- pays ;

\- téléphone ;

\- email ;

\- site internet ;

\- autres coordonnées professionnelles.



Ces informations peuvent être réutilisées automatiquement dans les documents.



\---



\# 9. Informations administratives



La fiche entreprise doit pouvoir contenir les informations administratives nécessaires à ADIKOM.



Selon les besoins réels de l'entreprise, cela peut comprendre :



\- numéro d’identification ;

\- informations fiscales ;

\- registre ;

\- informations légales ;

\- autres références administratives.



Les champs exacts devront être adaptés aux documents et obligations réellement utilisés par ADIKOM.



\---



\# 10. Informations commerciales



La section commerciale peut contenir :



\- activité principale ;

\- activités secondaires ;

\- description commerciale ;

\- coordonnées commerciales ;

\- informations utiles aux documents commerciaux.



Ces informations peuvent être utilisées dans les documents générés par le SaaS.



\---



\# 11. Informations de facturation



La fiche entreprise doit permettre de définir les informations nécessaires à la facturation.



Exemples :



\- nom à afficher sur les factures ;

\- adresse de facturation ;

\- coordonnées ;

\- informations fiscales ;

\- mentions obligatoires lorsque nécessaires.



Ces informations doivent être utilisées automatiquement lors de la génération des factures.



\---



\# 12. Informations bancaires



Lorsque nécessaire, les informations bancaires officielles d’ADIKOM peuvent être configurées.



Ces informations peuvent notamment comprendre :



\- nom de la banque ;

\- titulaire ;

\- coordonnées bancaires ;

\- références utiles aux documents.



Les données sensibles doivent être protégées et leur affichage doit dépendre des permissions.



\---



\# 13. Coordonnées par défaut



Le système doit permettre de définir les coordonnées par défaut utilisées dans les documents.



Exemple :



Adresse officielle ADIKOM

→ utilisée automatiquement sur une facture.



Cela évite de saisir les mêmes informations manuellement à chaque création de document.



\---



\# 14. Paramètres documentaires



Le module doit pouvoir centraliser les paramètres nécessaires à la génération des documents.



Exemples :



\- format des numéros ;

\- informations d’en-tête ;

\- informations de pied de page ;

\- mentions générales ;

\- identité de l’entreprise ;

\- coordonnées.



Les paramètres doivent être utilisés de manière cohérente dans les documents générés.



\---



\# 15. Numérotation



Le système doit pouvoir prévoir des règles de numérotation pour les documents lorsque cela est nécessaire.



Exemples :



Factures clients :



FAC-2026-000001



Factures fournisseurs internes :



FF-2026-000001



Clients :



CLI-000001



Fournisseurs :



FOU-000001



Véhicules :



VEH-000001



Le format définitif de chaque identifiant sera déterminé lors de l'implémentation.



\---



\# 16. Principe de numérotation



Les numéros générés automatiquement doivent être uniques.



Le système doit empêcher :



\- doublons ;

\- collisions ;

\- réutilisation accidentelle d'un numéro ;

\- génération incohérente entre plusieurs utilisateurs simultanés.



La génération doit être réalisée côté serveur.



\---



\# 17. Année et numérotation



Lorsque la numérotation dépend de l’année, le système doit pouvoir gérer automatiquement le changement d’exercice ou d’année selon les règles définies.



Exemple :



FAC-2026-000125



Puis :



FAC-2027-000001



La règle exacte devra être définie avant l’implémentation.



\---



\# 18. Devise par défaut



Le système doit permettre de définir la devise principale utilisée par ADIKOM.



Pour le projet actuel :



\*\*KMF — Franc comorien\*\*



Cette devise peut être utilisée comme devise par défaut dans les modules financiers.



Le système doit cependant rester suffisamment flexible pour permettre l’utilisation d’autres devises ultérieurement.



\---



\# 19. Format des montants



Le système doit centraliser la manière dont les montants sont affichés.



Exemple :



500 000 KMF



La présentation doit être cohérente dans :



\- tableaux ;

\- fiches ;

\- factures ;

\- rapports ;

\- tableaux de bord.



Le stockage interne des montants doit rester indépendant de leur format d’affichage.



\---



\# 20. Format des dates



Le système doit utiliser un format de date cohérent dans toute l’application.



Les dates doivent être affichées de manière compréhensible pour les utilisateurs d’ADIKOM.



Le format exact sera défini lors de l’implémentation.



Le stockage en base doit utiliser un format standard permettant d’éviter les ambiguïtés.



\---



\# 21. Fuseau horaire



Le système doit disposer d’un fuseau horaire de référence.



Le fuseau horaire doit être cohérent pour :



\- dates ;

\- heures ;

\- notifications ;

\- réservations ;

\- locations ;

\- paiements ;

\- journaux d’activité.



Le fuseau horaire utilisé par ADIKOM devra être défini dans la configuration du projet.



\---



\# 22. Langue



Le système doit prévoir une langue principale pour l'interface.



Pour le projet actuel, le français constitue la langue de référence.



L'architecture doit néanmoins permettre une évolution future vers d'autres langues sans reconstruire entièrement l'application.



\---



\# 23. Préférences générales



Une section de préférences générales peut permettre de configurer certains comportements globaux du SaaS.



Exemples :



\- langue ;

\- devise par défaut ;

\- format des dates ;

\- fuseau horaire ;

\- format des nombres ;

\- préférences documentaires.



Les paramètres réellement nécessaires doivent être privilégiés.



\---



\# 24. Paramètres de location



Certains paramètres généraux nécessaires à la Gestion de location pourront être centralisés dans Paramètres lorsque leur portée est globale.



Exemples :



\- règles générales de numérotation ;

\- paramètres documentaires ;

\- règles générales d'affichage.



Les tarifs des véhicules et les règles métier détaillées de location doivent rester dans le module \*\*Gestion de location\*\*.



Le module Paramètres ne doit pas devenir une duplication de ses fonctionnalités.



\---



\# 25. Paramètres de facturation



Certains paramètres généraux peuvent être utilisés par Facturation \& Paiement.



Exemples :



\- format de numérotation ;

\- informations de l’entreprise ;

\- mentions par défaut ;

\- coordonnées ;

\- devise par défaut.



Les factures elles-mêmes et leurs opérations restent gérées dans Facturation \& Paiement.



\---



\# 26. Paramètres financiers



Les paramètres globaux nécessaires aux modules financiers peuvent être définis ici lorsqu’ils sont réellement transversaux.



Exemples :



\- devise principale ;

\- formats d’affichage ;

\- paramètres documentaires.



Les comptes bancaires et caisses restent gérés dans \*\*Banques \& Caisses\*\*.



Les factures et règlements restent gérés dans \*\*Facturation \& Paiement\*\*.



\---



\# 27. Paramètres de notifications



Une évolution du module peut permettre de définir certains paramètres généraux des notifications.



Exemples :



\- activation ou désactivation de certaines alertes ;

\- seuils généraux ;

\- préférences de notification.



Cependant, les règles spécifiques à chaque module doivent rester définies dans le module concerné lorsque cela est nécessaire.



\---



\# 28. Centre de notification et Paramètres



Le Centre de notification reste responsable de la présentation et du suivi des notifications.



Paramètres peut uniquement fournir certaines règles générales de configuration.



La séparation doit être :



\*\*Paramètres → configuration\*\*



\*\*Centre de notifications → gestion et présentation des notifications\*\*



\---



\# 29. Paramètres et utilisateurs



Les paramètres généraux de l’entreprise ne doivent pas remplacer le module Utilisateurs \& Groupes.



La séparation doit rester claire :



\*\*Utilisateurs \& Groupes\*\*

→ qui peut accéder à quoi.



\*\*Paramètres\*\*

→ comment l’entreprise et le système sont configurés.



\---



\# 30. Paramètres et permissions



L'accès au module Paramètres doit être fortement restreint.



Le Super Admin dispose par défaut de l'accès complet.



D'autres utilisateurs peuvent recevoir certains accès uniquement si cela est explicitement nécessaire.



Exemple :



Un utilisateur peut avoir le droit de consulter certaines informations de l'entreprise sans pouvoir modifier les paramètres.



\---



\# 31. Organisation de la fiche Entreprise



La page Entreprise peut être organisée en sections ou onglets.



Exemple :



Entreprise

│

├── Identité

├── Coordonnées

├── Administratif

├── Commercial

├── Facturation

├── Banque

├── Identité visuelle

└── Préférences



L'organisation graphique pourra être adaptée lors de la conception UX/UI.



\---



\# 32. Section Identité



Cette section contient :



\- nom ;

\- nom commercial ;

\- sigle ;

\- description ;

\- activité ;

\- slogan ;

\- identifiant interne.



Les informations doivent pouvoir être modifiées uniquement par les utilisateurs autorisés.



\---



\# 33. Section Coordonnées



Cette section contient :



\- adresse ;

\- ville ;

\- pays ;

\- téléphone ;

\- email ;

\- site web.



Les coordonnées peuvent être réutilisées dans les documents.



\---



\# 34. Section Administratif



Cette section contient les informations administratives nécessaires.



Elle doit être accessible uniquement aux utilisateurs disposant des permissions appropriées.



\---



\# 35. Section Commercial



Cette section contient les informations commerciales générales de l'entreprise.



Elle peut notamment servir aux documents et présentations générés par ADIKOM PILOT.



\---



\# 36. Section Facturation



Cette section contient les informations utilisées pour la facturation.



Exemples :



\- nom à afficher ;

\- adresse ;

\- coordonnées ;

\- mentions ;

\- informations administratives nécessaires.



\---



\# 37. Section Banque



Cette section peut contenir les informations bancaires officielles d'ADIKOM destinées à certains documents.



Les informations sensibles doivent être protégées.



Les comptes réellement utilisés pour les mouvements financiers restent gérés dans Banques \& Caisses.



\---



\# 38. Section Identité visuelle



Cette section peut permettre de configurer :



\- logo principal ;

\- logo secondaire lorsque nécessaire ;

\- couleur principale ;

\- couleur secondaire ;

\- couleur d'accent.



Les couleurs doivent être enregistrées dans un format exploitable par l'application.



\---



\# 39. Gestion du logo



Le système doit permettre :



\- import du logo ;

\- remplacement du logo ;

\- aperçu ;

\- suppression ou désactivation lorsque nécessaire.



Le fichier original doit être conservé sans déformation.



Le système doit respecter les proportions du logo lors de son affichage.



\---



\# 40. Validation des données



Avant l'enregistrement d'un paramètre, le système doit vérifier les données lorsque cela est nécessaire.



Exemples :



\- email valide ;

\- format de numéro ;

\- couleur valide ;

\- fichier image compatible ;

\- information obligatoire renseignée.



Les erreurs doivent être présentées clairement à l'utilisateur.



\---



\# 41. Historique des paramètres



Les modifications importantes des paramètres doivent être traçables.



Exemple :



Ancienne adresse :

Adresse A



Nouvelle adresse :

Adresse B



Modifié par :

Super Admin



Date :

20/08/2026



Cette traçabilité est particulièrement importante pour les informations utilisées dans les documents officiels.



\---



\# 42. Protection des paramètres sensibles



Les paramètres sensibles doivent être protégés.



Exemples :



\- informations bancaires ;

\- informations administratives sensibles ;

\- paramètres techniques.



Un utilisateur ne disposant pas des permissions nécessaires ne doit pas pouvoir les consulter ou les modifier.



\---



\# 43. Journalisation



Les actions importantes doivent être enregistrées.



Exemples :



\- modification de l'identité ;

\- modification des coordonnées ;

\- changement de logo ;

\- modification des informations bancaires ;

\- modification de la devise ;

\- modification des paramètres documentaires.



Le journal doit conserver :



\- utilisateur ;

\- action ;

\- date ;

\- heure ;

\- élément modifié.



\---



\# 44. Sécurité



Le module Paramètres doit être particulièrement protégé.



Le système doit empêcher :



\- accès non autorisé ;

\- modification non autorisée ;

\- modification des paramètres sensibles ;

\- suppression accidentelle de paramètres essentiels ;

\- contournement des permissions.



Les contrôles doivent être appliqués côté serveur.



\---



\# 45. Validation avant modification critique



Pour certaines modifications critiques, le système peut demander une confirmation explicite.



Exemple :



\*\*Modifier la devise principale ?\*\*



Cette modification peut avoir des conséquences importantes sur les nouveaux documents et opérations.



Le système doit avertir clairement l'utilisateur avant validation.



\---



\# 46. Principe de non-rétroactivité



Une modification d'un paramètre général ne doit pas automatiquement modifier les anciennes données métier lorsque cela compromet leur cohérence.



Exemple :



ADIKOM change son adresse.



Les nouvelles factures peuvent utiliser la nouvelle adresse.



Les anciennes factures doivent conserver les informations qui leur étaient associées au moment de leur émission lorsque cela est nécessaire à la traçabilité.



Même principe pour :



\- tarifs ;

\- informations documentaires ;

\- identité ;

\- conditions.



\---



\# 47. Paramètres et données historiques



Les données historiques doivent conserver leur contexte.



Le système doit éviter de reconstruire rétroactivement une ancienne opération avec les paramètres actuels.



Exemple :



Facture créée avec :



Adresse A



L'adresse de l'entreprise devient ensuite :



Adresse B



La facture historique doit conserver l'adresse applicable au moment de son émission lorsque cette information fait partie du document ou de son historique.



\---



\# 48. Configuration initiale



Lors de la première installation d'ADIKOM PILOT, le système doit prévoir une phase de configuration initiale.



Elle peut permettre de renseigner :



\- identité ;

\- coordonnées ;

\- devise ;

\- logo ;

\- paramètres essentiels ;

\- informations nécessaires aux documents.



Cette configuration doit être accessible au Super Admin.



\---



\# 49. Vérification de configuration



Le système peut afficher un indicateur de configuration.



Exemple :



Configuration de l'entreprise :



✓ Identité

✓ Coordonnées

✓ Logo

✓ Devise

⚠ Informations administratives incomplètes



Cela permet d'identifier les éléments manquants avant l'utilisation complète du SaaS.



\---



\# 50. Paramètres obligatoires



Le système doit distinguer :



\- paramètres obligatoires ;

\- paramètres facultatifs.



L'application ne doit pas demander inutilement des informations qui ne sont pas nécessaires au fonctionnement.



\---



\# 51. Responsive design



Le module doit être entièrement responsive.



\### Desktop



Les sections de configuration peuvent être affichées dans une navigation latérale ou sous forme d'onglets.



\### Tablette



Les sections doivent s'adapter automatiquement.



\### Mobile



Les paramètres doivent être présentés sous forme de sections verticales clairement séparées.



Les formulaires doivent rester faciles à remplir.



\---



\# 52. Performance



Les paramètres généraux sont relativement peu nombreux.



Ils doivent cependant être chargés efficacement afin d'éviter des requêtes inutiles sur chaque page.



Les paramètres fréquemment utilisés peuvent être mis en cache selon l'architecture technique retenue.



Toute modification doit invalider ou actualiser correctement les données mises en cache.



\---



\# 53. Évolutivité



Le module doit pouvoir accueillir progressivement de nouvelles configurations.



Fonctionnalités futures possibles :



\- paramètres des notifications ;

\- paramètres avancés de location ;

\- paramètres de facturation ;

\- modèles de documents ;

\- préférences d'impression ;

\- paramètres de sécurité ;

\- paramètres d'intégration ;

\- paramètres d'export ;

\- paramètres multi-devises ;

\- paramètres multi-sites lorsque l'entreprise évoluera.



Ces fonctionnalités ne sont pas obligatoires pour le MVP.



\---



\# 54. Relations avec les autres modules



Paramètres doit servir de couche de configuration transversale.



Paramètres

│

├── Gestion de location

│   └── Paramètres globaux nécessaires

│

├── Tiers

│   └── Formats / configuration générale

│

├── Banques \& Caisses

│   └── Devise / formats

│

├── Facturation \& Paiement

│   ├── Identité entreprise

│   ├── Coordonnées

│   └── Numérotation

│

├── Utilisateurs \& Groupes

│   └── Accès au module

│

├── Projets \& Planification

│   └── Préférences générales

│

└── Centre de notifications

&#x20;   └── Paramètres généraux



Chaque module doit conserver ses propres règles métier.



\---



\# 55. Exemple — changement d'adresse



\### Situation



ADIKOM déménage.



Ancienne adresse :

Adresse A



Nouvelle adresse :

Adresse B



\### Action



Le Super Admin modifie l'adresse dans Paramètres → Entreprise.



\### Conséquence



Les nouveaux documents utilisent :



Adresse B



Les documents historiques conservent leur contexte historique lorsqu'il est nécessaire.



Le changement est enregistré dans le journal.



\---



\# 56. Exemple — changement de logo



\### Situation



ADIKOM adopte une nouvelle version officielle de son logo.



\### Action



Le Super Admin remplace le logo dans :



Paramètres → Entreprise → Identité visuelle.



\### Résultat



Les nouveaux documents utilisent le nouveau logo.



Les anciens documents générés et archivés ne doivent pas être automatiquement modifiés.



\---



\# 57. Exemple — changement de devise



La devise principale constitue un paramètre critique.



Avant toute modification, le système doit avertir l'utilisateur.



Le changement ne doit pas modifier rétroactivement les anciennes opérations.



Les conséquences éventuelles sur les nouveaux documents doivent être clairement identifiées.



\---



\# 58. Critères d'acceptation du module



Le module Paramètres sera considéré comme fonctionnel lorsque :



1\. le Super Admin peut accéder aux paramètres de l'entreprise ;

2\. les informations générales d'ADIKOM peuvent être enregistrées ;

3\. les coordonnées peuvent être configurées ;

4\. les informations administratives peuvent être configurées ;

5\. les informations commerciales peuvent être configurées ;

6\. les informations de facturation peuvent être configurées ;

7\. les informations bancaires peuvent être configurées selon les permissions ;

8\. le logo peut être enregistré ;

9\. l'identité visuelle peut être configurée ;

10\. la devise principale peut être définie ;

11\. les paramètres documentaires peuvent être configurés ;

12\. les paramètres obligatoires peuvent être identifiés ;

13\. les données peuvent être validées ;

14\. les paramètres sensibles sont protégés ;

15\. les modifications importantes sont journalisées ;

16\. les anciennes données ne sont pas altérées rétroactivement ;

17\. les nouveaux documents peuvent exploiter les nouveaux paramètres ;

18\. les permissions sont respectées ;

19\. le module est responsive ;

20\. l'architecture permet d'ajouter de nouveaux paramètres ultérieurement.



\---



\# 59. Principe directeur



Le module Paramètres doit constituer la \*\*source de configuration générale d'ADIKOM PILOT\*\*.



Il doit permettre de définir :



\*\*Qui est ADIKOM ?\*\*



\*\*Où se trouve ADIKOM ?\*\*



\*\*Comment ADIKOM doit-il apparaître dans ses documents ?\*\*



\*\*Quelle devise utilise ADIKOM ?\*\*



\*\*Quelles informations officielles doivent être utilisées ?\*\*



\*\*Quels paramètres généraux doivent être appliqués au SaaS ?\*\*



Le principe fondamental est :



\*\*Une information générale configurée une fois → réutilisée de manière cohérente dans tout le système.\*\*



Le module doit rester simple, sécurisé et évolutif.



Il ne doit pas absorber les fonctionnalités métier des autres modules.



La séparation doit rester claire :



\*\*Paramètres = configuration\*\*



\*\*Utilisateurs \& Groupes = accès\*\*



\*\*Tiers = relations\*\*



\*\*Gestion de location = opérations de location\*\*



\*\*Banques \& Caisses = trésorerie\*\*



\*\*Facturation \& Paiement = factures et règlements\*\*



Cette séparation garantit une architecture ADIKOM PILOT claire, maintenable et évolutive.

