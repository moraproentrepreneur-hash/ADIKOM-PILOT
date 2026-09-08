# Rapport 10 — Ajustements fonctionnels et UX du SaaS

**Projet :** ADIKOM PILOT — SaaS interne de gestion et de pilotage
**Date :** 8 septembre 2026
**Décision de référence :** DEC-042
**Migrations :** 076, 077, 078
**Statut :** livré, déployé, éprouvé en production

---

## 1. Objectif de la mission

Le SaaS était complet et déployé. ADIKOM l'a parcouru écran par écran et a relevé
**sept points**, appuyés sur dix-huit captures d'écran. Aucun ne relève du
confort : chacun corrige un endroit où le système **dit ou fait autre chose que
ce qu'ADIKOM attend de lui**.

| # | Ajustement demandé |
|---|---|
| 1 | Le tableau de bord doit toujours afficher les valeurs de ses indicateurs |
| 2 | Retirer les références « §XX » des bandeaux explicatifs |
| 3 | Rendre opérationnels les onglets « à venir » des fiches |
| 4 | Uniformiser les barres d'actions des fiches |
| 5 | Un paiement divers peut être un encaissement **ou** un décaissement |
| 6 | Les champs déroulants doivent rester des champs déroulants sur téléphone |
| 7 | Réorganiser l'ajout d'une personne à un projet |

Les sept sont livrés. Ce rapport dit, pour chacun, **ce qui a été décidé, ce qui
a été modifié, et ce qui a été éprouvé**.

---

## 2. Ajustement 1 — Le tableau de bord affiche ses chiffres

### Ce qui posait problème

Chaque indicateur exigeait la capacité du **module** qu'il résume. Un
collaborateur sans `rental.rentals.view` lisait, à la place du chiffre :

> 🔒 Non accessible — permission `rental.rentals.view`.

Ce n'était pas un défaut d'origine. Sous RLS, un comptage sur des lignes
illisibles vaut **zéro**, et « 0 retour en retard » se lit comme une bonne
nouvelle alors que rien n'a été compté (DEC-017). Le refus était la seule réponse
honnête **tant que la lecture restait celle de l'appelant**.

### La décision (DEC-042 §a)

> **Voir un nombre agrégé n'est pas accéder aux données du module.**

Un collaborateur qui n'ouvre pas le module Locations peut avoir besoin de savoir
qu'il existe trois retours en retard, pour en informer la personne qui en répond.

### Ce qui a été modifié

**Migration 076** — dix fonctions de pilotage, toutes `SECURITY DEFINER` :

| Fonction | Capacité exigée |
|---|---|
| `dashboard_operations` | `dashboard.view` |
| `dashboard_reservations` | `dashboard.view` |
| `dashboard_activity` *(nouvelle)* | `dashboard.view` |
| `dashboard_maintenance_open` *(nouvelle)* | `dashboard.view` |
| `dashboard_fleet` | + `dashboard.fleet.view` |
| `dashboard_customer_invoiced` | + `dashboard.financial.view` |
| `dashboard_customer_collected` | + `dashboard.financial.view` |
| `dashboard_customer_receivables` | + `dashboard.financial.view` |
| `dashboard_supplier_payables` | + `dashboard.financial.view` |
| `dashboard_treasury_total` *(nouvelle)* | + `dashboard.financial.view` |

Elles **ne rendent que des nombres** — jamais une ligne, jamais un nom, jamais
une immatriculation.

**Une seule arithmétique du solde.** `account_balance_formula` est extraite et
partagée par `financial_account_balance` et `dashboard_treasury_total` : le total
du tableau de bord et le solde d'une fiche **ne peuvent pas diverger**. Elle
n'est exécutable ni par `anon` ni par `authenticated` — sans quoi un appelant
obtiendrait un solde sans `treasury.balances.view`.

### Ce qui reste protégé

Tout ce qui **nomme** :

- la liste nominative des retards → `rental.rentals.view` ;
- les échéances de documents de véhicule → `rental.documents.view` ou `rental.fleet.view` ;
- le détail compte par compte → `treasury.accounts.view` + `balances.view` + `entries.view`.

Et chaque lien « Voir le détail » mène à un écran qui vérifie de nouveau sa
capacité. **Aucune policy RLS n'a été modifiée.**

### Sécurité — pourquoi `SECURITY DEFINER` est admissible ici

DEC-022 avait fermé les droits d'exécution parce qu'une fonction `SECURITY
DEFINER` ouverte à `anon` laissait écrire dans le journal d'audit. La leçon
n'était pas « jamais de `SECURITY DEFINER` », mais qu'une telle fonction doit
être **hors de portée** et **ne rendre que ce qu'elle a le droit de rendre**.
Les deux conditions sont tenues, et la recette SQL les vérifie :

- exécution retirée à `PUBLIC` **et** à `anon`, accordée nommément à
  `authenticated` et `service_role` ;
- `dashboard.view` exigée dans le corps de chacune ;
- `search_path` figé sur les dix ;
- **aucune capacité de module ne peut y revenir** — la recette refuse le lot si
  l'une des treize capacités de module réapparaît dans le corps d'une fonction.

### Une conséquence favorable

Les sommes sont désormais **toujours complètes**. Auparavant, une créance
calculée sans `billing.customer_payments.view` aurait valu le total facturé ; il
fallait la refuser. La chaîne étant entière, deux profils différents lisent
maintenant le **même** net — et une imputation n'est jamais oubliée pour l'un
d'eux (CLAUDE.md §16, §57). La recette des capacités le vérifie en comparant les
valeurs obtenues par deux profils distincts.

---

## 3. Ajustement 2 — Aucune référence de documentation dans une page

### Ce qui a été retiré

Toute référence à la documentation de développement, dans les textes **visibles** :

```
(§25)   (Workflow 07 §23)   (Module 06 §30)   (Règles finance §8)
(DEC-017)   (CLAUDE.md §57)   (03_Modules/04_Tiers.md §8.4)
```

**Avant** — « Une action se crée depuis la fiche de la réunion ou de la décision
dont elle découle **(§25)**. Sans origine, ce serait une tâche. »

**Après** — « Une action se crée depuis la fiche de la réunion ou de la décision
dont elle découle. Sans origine, ce serait une tâche. »

Le contenu pédagogique est **intégralement conservé** : c'est lui qu'ADIKOM
valide.

### Portée

41 fichiers, une passe globale suivie d'une relecture du différentiel. Quatre
phrases coupées en deux par la suppression ont été réécrites à la main, et deux
tournures qui citaient un paragraphe **hors parenthèses** ont été reformulées :

- « Le contrôle du §30 sera néanmoins appliqué » → « Le contrôle des fonds
  disponibles sera néanmoins appliqué » ;
- « `Module 09` §6 prévoit explicitement cet usage » → « son emploi dans les
  documents est prévu pour une étape ultérieure ».

### Ce qui n'a pas été touché

**Les commentaires du code.** Ils portent la traçabilité vers la documentation,
que CLAUDE.md §53 demande de conserver. Une première passe les avait emportés
dans onze commentaires JSX ; ils ont été rétablis.

**Les intitulés de tests.** Ce ne sont pas une interface.

### Un cas signalé, hors périmètre

La capture 11 montre une fiche de maintenance intitulée « Donnée de démonstration
— DEMO. Ne pas supprimer sans décision. **[M1]** ». Ce n'est pas un texte de
l'application : c'est le **marqueur d'un enregistrement de démonstration**, écrit
par `demo:seed` et relu par `demo:clean` pour retrouver exactement ce qu'il a
créé. Le retirer laisserait des données que le nettoyage ne saurait plus viser.
Il disparaît avec le jeu de démonstration (`npm run demo:clean`).

---

## 4. Ajustement 3 — Les onglets « à venir » sont opérationnels

### Ce qui a été ouvert

| Fiche | Onglet | Sur quelles données |
|---|---|---|
| Client | **Réservations** | `listReservations({ clientId })`, statut dérivé compris |
| Client | **Locations** | `listRentals({ clientId })`, retard dérivé compris |
| Client | **Documents** | sa fiche PDF + contrat, bon de départ et PV de retour de chacun de ses contrats |
| Client | **Historique** | le journal d'activité de la fiche |
| Fournisseur | **Documents** | sa fiche PDF + chacune de ses factures |
| Partenaire | **Projets** | `listProjects({ partnerId })` — rattachement `partner_id` |
| Partenaire | **Documents** | sa fiche PDF |
| Partenaire | **Historique** | le journal d'activité de la fiche |
| Location | **Historique** | le cycle réellement parcouru par le contrat |
| Véhicule | **Locations** | `listRentals({ vehicleId })` |
| Véhicule | **Rentabilité** | voir §4.2 |
| Tarification | **Tarifs préférentiels** | voir §4.3 |

Les onglets « Factures » et « Paiements » de la fiche client, jusqu'ici affichés
« à venir » lorsque la capacité manquait, **disparaissent** désormais dans ce
cas — comme sur la fiche fournisseur depuis le LOT 4.

### Un onglet retiré, et pourquoi

**« Conditions » sur la fiche partenaire.** Aucune table, aucune colonne, aucune
capacité ne décrit les conditions d'un partenariat : le modèle n'existe pas.
L'inventer aurait été fabriquer une fonctionnalité vide, ce que la demande
interdit expressément. La carte « Périmètre actuel » le dit déjà en toutes
lettres.

### 4.1 — Aucun historique parallèle

Les trois onglets « Historique » **lisent le journal d'activité**, qui consigne
déjà qui a fait quoi, quand, et ce qui a changé. Tenir une seconde trace en
aurait fait deux, dont l'une aurait fini par diverger.

Ils relèvent donc de `users.audit.view`. Chaque ligne mène à la fiche de
l'événement, où l'avant/après se consulte sous la capacité qui lui est propre
(DEC-038) : le panneau n'affiche jamais lui-même le contenu d'un champ.

### 4.2 — Rentabilité d'un véhicule : la règle existe, elle est tenue telle quelle

`05_Regles_Metier/02_Parc_Automobile.md` §43 la pose, exemple à l'appui :
« Revenus : 2 500 000 KMF. Coûts de maintenance : 550 000 KMF. »

Le **même §43** pose un interdit, et c'est lui qui commande l'écran :

> « Le système ne doit pas présenter un indicateur comme une rentabilité
> **complète** si toutes les charges ne sont pas prises en compte. »

L'onglet parle donc de **marge d'exploitation** :

```
Revenus facturés              factures émises portant une location du véhicule
− Coût d'entretien réel       coûts RÉELS arrêtés, jamais une estimation
+ Imputé aux fournisseurs     ce qu'ADIKOM a déduit de leurs factures
= Coût net supporté
Marge = Revenus facturés − Coût net supporté
```

et il **énumère en toutes lettres** ce qu'elle ne couvre pas — amortissement,
assurance, carburant, charges générales : aucune de ces dépenses n'est
enregistrée par véhicule, et les présenter comme nulles donnerait un résultat
flatteur et faux. Il annonce également combien d'interventions ne sont pas encore
chiffrées.

Une imputation **n'est pas un paiement** (CLAUDE.md §57), mais elle réduit bien
la charge qu'ADIKOM supporte : les deux montants restent affichés séparément.
Chacune des trois composantes relève d'une capacité distincte ; **il en manque
une, la marge n'est pas calculée** — un zéro y passerait pour une charge nulle.

### 4.3 — Tarifs préférentiels : la question inverse de la fiche client

La fiche client répond à « quelles conditions ce client a-t-il ? ». L'onglet
répond à « à qui avons-nous consenti des conditions, et lesquelles ? ».

Il réutilise le panneau de la fiche client — portée, véhicule, catégorie, mode,
montant ou remise, unité, validité, priorité de la règle la plus spécifique. Rien
n'est réécrit : le résolveur en base reste l'unique implémentation de DEC-002.

À la saisie, le **client est obligatoire** : sans lui, la même saisie créerait un
tarif standard applicable à tous. L'onglet suit `parties.clients.pricing.view` ;
la modification exige `parties.clients.pricing.manage`, vérifiée de nouveau par
l'action serveur. **Un tarif déjà verrouillé sur une réservation n'est atteint
par aucune modification faite ici.**

---

## 5. Ajustement 4 — Les barres d'actions, et les documents qui vont avec

### Quatre documents créés

| Fiche | Document | Ce qu'il porte |
|---|---|---|
| Réservation | **Confirmation de réservation** | client, période, véhicule ou catégorie, tarif verrouillé |
| Facture client | **Facture client** | lignes, sous-total, réductions, total, encaissé, solde |
| Facture fournisseur | **Facture fournisseur** | brut, **détail des imputations**, net à payer, réglé, reste dû |
| Paiement divers | **Reçu** d'encaissement ou de décaissement | sens, tiers, montant, compte, motif |

Chacun est produit par le **registre documentaire** existant : un seul contrôle
d'accès, un seul rendu, un seul fichier — servi tel quel pour l'aperçu, le
téléchargement et l'impression. **Aucun bouton mort** : la recette télécharge les
quatre documents et vérifie qu'ils commencent par `%PDF`.

### Sept capacités créées (catalogue 171 → 178)

```
rental.reservations.download        rental.reservations.print
billing.customer_invoices.download  (.print existait déjà)
billing.supplier_invoices.download  billing.supplier_invoices.print
billing.misc_payments.download      billing.misc_payments.print
```

Toutes **sensibles** : ces pièces sortent du système en portant l'identité d'un
tiers et des montants.

La route documentaire exige la capacité de **consulter** la ressource EN PLUS de
la capacité documentaire : `download` n'est jamais une porte dérobée sur une
fiche qu'on n'a pas le droit de voir. Et l'inverse reste vrai : `view`
n'autorise ni à télécharger ni à imprimer (DEC-024).

### Un retrait levé, et pourquoi ce n'est pas une régression

La migration 037 avait **supprimé** `rental.reservations.download` et `.print`
avec ce motif : aucun document de réservation n'existait, et une permission qui
ne débloque rien ne doit pas être attribuable (CLAUDE.md §19 bis). Deux recettes
veillaient à ce qu'elles ne reviennent pas.

ADIKOM demande aujourd'hui cette pièce. **Le motif du retrait tombe avec le fait
qui le fondait.** Les codes reviennent à l'identique : ils n'ont jamais changé de
sens.

**Les recettes qui les interdisaient changent d'objet plutôt que de disparaître.**
Ce qu'elles gardaient n'était pas « ces deux codes sont absents » mais « aucune
capacité documentaire n'est attribuable sans document ». C'est cela qu'elles
vérifient désormais, **pour toutes** : chaque `.download` et chaque `.print` du
catalogue doit correspondre à une entrée du registre documentaire.

### « Modifier » sur les factures

Les champs modifiables d'une facture vivent dans sa fiche, tant qu'elle n'est pas
émise ou validée. Le bouton de la barre y conduit ; ouvrir une page séparée qui
afficherait la même chose n'aurait servi que la symétrie.

---

## 6. Ajustement 5 — Le sens d'un paiement divers

### La règle

| Sens | Effet à la validation |
|---|---|
| **Encaissement** | une écriture d'ENTRÉE : le solde du compte **augmente** |
| **Décaissement** | une écriture de SORTIE : le solde du compte **diminue** |

### Migration 077 — cinq garanties

1. **Une colonne `direction`**, du type des écritures — `treasury_direction` : le
   sens s'exprime dans un seul vocabulaire, jamais deux.
2. **Le sens est obligatoire à la saisie.** Le déduire d'un défaut reviendrait à
   décider en silence qu'un paiement est une sortie ; l'ancienne signature de
   `create_misc_payment` a été **supprimée** pour que ce chemin n'existe plus.
3. **Le sens est figé** ensuite, au même titre que le montant, le compte, la date
   et la documentation : l'inverser après validation retournerait un mouvement de
   trésorerie sans qu'aucune écriture ne l'explique.
4. **L'écriture reprend le sens du paiement**, et le déclencheur d'origine refuse
   toute autre combinaison — y compris par appel direct à l'API.
5. **Le contrôle différé** compte l'écriture attendue **dans le bon sens** : un
   paiement validé porte exactement une écriture, du montant, dans son sens, sur
   son compte.

Le cycle **Brouillon → Validé → Annulé** est inchangé. Un brouillon ne déplace
rien ; l'annulation défait l'écriture et rend le solde ; rien n'est effacé.

### Les données existantes

`default 'OUT'` : les trois paiements divers déjà enregistrés restent des
**décaissements**. Aucun solde n'a changé, aucune écriture n'a été réécrite — la
migration le vérifie elle-même avant de se déclarer appliquée. Un quatrième
paiement de démonstration, **encaissé**, a été ajouté au jeu DEMO pour que la
nouveauté se voie à l'écran.

### Aucune permission créée

Saisir un encaissement divers et saisir un décaissement divers sont le **même
acte**, sur le même objet, dans le même menu : `billing.misc_payments.create` les
couvre tous deux (CLAUDE.md §19 bis).

### Ce que l'écran dit, et qu'il ne disait pas

Le sens est le **premier champ** du formulaire, et le reste s'y accorde : le
bénéficiaire devient un **payeur**, l'effet annoncé change de signe
(« créditera » / « débitera »), le bandeau d'état, la fiche et le reçu suivent.
Un écran qui parlerait de « compte débité » sur un encaissement dirait le
contraire de ce qui s'est passé.

---

## 7. Ajustement 6 — Les champs déroulants sur téléphone

### Le constat

Un `<select>` natif ne se dessine pas : c'est le **système** qui décide de sa
liste. Sur Android, une pression ouvre une fenêtre modale plein écran, options
précédées de pastilles ; sur iOS, une roue crantée. Le même champ, sur
ordinateur, ouvre une liste sobre sous le champ.

### La décision

**La liste est dessinée par l'application, et elle est la même partout.**

Un composant unique — `src/components/ui/select.tsx` — remplace le rendu du
champ. Les **147 usages** du SaaS en héritent sans qu'aucun appel change : le
composant est réexporté sous le même nom.

### Ce qui reste natif, et pourquoi c'est essentiel

Le `<select>` **n'est pas remplacé** : il est conservé dans le document, et
demeure la seule source de vérité de la valeur.

- les formulaires continuent de l'envoyer — aucun champ caché, aucune
  resynchronisation à écrire, aucune divergence possible ;
- `onChange` reçoit un vrai événement ; `event.target.value` garde son sens ;
- un champ piloté reste piloté par son parent ;
- une valeur posée de l'extérieur — recette automatisée, gestionnaire de mots de
  passe — met la liste à jour, puisque l'affichage **lit** le `<select>`.

Il est simplement rendu invisible et **hors d'atteinte du pointeur** : c'est ce
qui empêche la fenêtre du système de s'ouvrir.

### Ce que la liste garantit — mesuré sur un écran de 390 px, tactile

| Garantie | Mesure |
|---|---|
| Rendue en portail | aucune carte à `overflow-hidden` ne la rogne |
| Ramenée dans l'écran | `x = 41 px`, largeur `308 px` sur 390 |
| Jamais sous le pli | ouverture vers le haut si le bas manque de place |
| Texte non coupé | aucune option dont `scrollWidth > clientWidth` |
| Cible tactile | `44 px` de haut par option |
| Aucun débordement de page | `0 px` de défilement horizontal |
| Clavier | flèches, Origine/Fin, Entrée, Échap, frappe au clavier |

### Les vraies listes à choix multiples ne sont pas touchées

Départements, groupes d'un utilisateur, dommages d'un incident restent des cases
à cocher : ce sont de véritables choix multiples. Le SaaS n'expose aucun
`<select multiple>`.

---

## 8. Ajustement 7 — Ajouter une personne à un projet

**Avant.** Les deux champs et le bouton tenaient sur une seule ligne
(`2fr 1fr auto`) : le rôle s'y retrouvait deux fois plus étroit que la personne,
son explication tombait sur quatre lignes, et le bouton était comprimé contre le
bord.

**Après.** Les deux champs partagent la largeur à parts égales ; le bouton prend
sa propre ligne. Sur téléphone, tout s'empile : une colonne, des champs pleine
largeur, un bouton pleine largeur de 44 px de haut. Le premier champ est intitulé
**« Personne »**, et non plus « Ajouter » : c'est ce qu'il désigne.

Mesuré sur 390 px : les deux champs alignés à `x = 58`, le rôle **sous** la
personne, largeur `274 px`, bouton `274 × 44 px`.

---

## 9. Migrations

| N° | Fichier | Objet |
|---|---|---|
| **076** | `20260908000100_lecture_agregee_du_tableau_de_bord.sql` | dix fonctions de pilotage agrégées ; arithmétique du solde extraite et partagée |
| **077** | `20260908000200_sens_du_paiement_divers.sql` | colonne `direction`, sens figé, écriture au bon sens, contrôle différé |
| **078** | `20260908000300_capacites_documentaires_des_fiches.sql` | sept capacités documentaires ; catalogue 171 → 178 |

**Aucune policy RLS n'est modifiée. Aucune table n'est supprimée. Aucune donnée
existante n'est réécrite.**

Les trois migrations ont été éprouvées dans une transaction annulée avant d'être
appliquées, puis appliquées à la base Supabase de production.

### Deux corrections faites pendant la mission, et ce qu'elles enseignent

**a. La migration 077 avait été écrite à partir de la version d'origine de deux
déclencheurs**, perdant en silence deux corrections postérieures : l'état de
l'opération d'origine n'est exigé qu'à l'`INSERT` (migration 072), et
`is_restoring()` le lève pendant une restauration (migration 075). La recette
`db:verify:transfers` l'a immédiatement montré — l'annulation d'un virement
devenait impossible. Les deux fonctions ont été rebasées sur leur **dernière**
version, et le fichier corrigé ré-appliqué.

> **Enseignement.** Un `create or replace` reprend une fonction là où on l'a
> lue. La lire dans la migration qui l'a créée, plutôt que dans celle qui l'a
> corrigée en dernier, efface les corrections sans que rien ne le signale.

**b. `financial_account_balance` a dû devenir `SECURITY DEFINER`.** L'arithmétique
extraite n'étant pas exécutable par `authenticated` — c'est ce qui l'empêche
d'être appelée directement pour obtenir un solde sans `treasury.balances.view` —,
une fonction `SECURITY INVOKER` ne pouvait pas l'atteindre. Ce que `SECURITY
DEFINER` lève, la fonction le **repose à la main** : la visibilité du compte,
jusqu'ici gouvernée par la policy `financial_accounts_select`, y est vérifiée
explicitement. Le comportement observable ne change pour personne, et la recette
de trésorerie vérifie désormais les trois gardes.

---

## 10. Sécurité et permissions

| Vérification | Résultat |
|---|---|
| Aucune capacité de module accordée implicitement | vérifié dans les deux sens : le chiffre s'affiche, RLS masque toujours les lignes |
| Aucune policy RLS modifiée | aucune des trois migrations n'en touche |
| Fonctions de pilotage fermées à `PUBLIC` et à `anon` | vérifié à chaque passage de `db:verify:dashboard` |
| `account_balance_formula` inatteignable par une session | vérifié dans `dashboard.sql` **et** `treasury.sql` |
| Capacités documentaires sensibles | les sept, vérifié par la migration elle-même |
| Aucune capacité documentaire sans document | nouveau contrôle, sur **tout** le catalogue |
| Le sens d'un paiement divers ne se réécrit pas | sept refus vérifiés sur le brouillon |
| Une écriture de sens contraire est refusée | vérifié dans les deux sens, encaissement et décaissement |
| Catalogue | **178** permissions, vérifié par 33 recettes |

---

## 11. Tests réalisés

### Contrôles automatiques

| Contrôle | Résultat |
|---|---|
| `npm run lint` | aucune erreur, aucun avertissement |
| `npm run typecheck` | aucune erreur |
| `npm run test` (Vitest) | **219 tests, 12 fichiers** — tous passés |
| `npm run build` | compilé sans erreur |

Le contrôle de parité TS/SQL du catalogue a **changé d'objet** : il vérifie
désormais que chaque capacité documentaire correspond à une entrée du registre.

### Recettes SQL — la base, avec la clé de service

| Recette | Résultat |
|---|---|
| `socle`, `location`, `rental_cycle` | passées |
| `incidents`, `maintenance`, `maintenance_costs`, `imputations` | passées |
| `supplier_invoices`, `customer_invoices`, `customer_payments` | passées |
| `treasury`, `transfers` | passées |
| `dashboard` | passée — dont **10 bis**, les trois lectures agrégées |
| `analytics`, `notifications`, `projects`, `planning` | passées |
| `groups`, `audit_journal`, `settings`, `backup` | passées |

### Recettes d'interface — de vraies sessions, dans un navigateur

| Recette | Résultat |
|---|---|
| **`verify:ajustements`** *(nouvelle)* | **95 contrôles, tous réussis** |
| `verify:pilotage` | 60 contrôles, tous réussis |
| `verify:capabilities` | 217 contrôles, tous réussis |
| `verify:transfers` | 52 contrôles, tous réussis |
| `verify:projects` | 76 contrôles, tous réussis |
| `verify:responsive` | 329 contrôles, 336 boutons mesurés |
| `verify:documents` | 42 contrôles, tous réussis |
| `verify:reservations` | 35 contrôles, tous réussis |
| `verify:referential` | 31 contrôles, tous réussis |
| `verify:partners` | 45 contrôles, tous réussis |
| `verify:supplier-payments` | 32 contrôles, tous réussis |
| `verify:rentals` · `verify:checkout` · `verify:rental-live` · `verify:rental-return` | 34 · 36 · 35 · 51, tous réussis |
| `verify:dashboard` (Tableau de location) · `verify:rental-documents` | 30 · 58, tous réussis |
| `verify:incidents` · `verify:maintenance` · `verify:maintenance-costs` · `verify:imputations` | 39 · 54 · 29 · 47, tous réussis |
| `verify:supplier-invoices` · `verify:treasury` | 37 · 34, tous réussis |
| `verify:customer-invoices` · `verify:customer-payments` | 52 · 36, tous réussis |
| `verify:analytics` · `verify:notifications` · `verify:planning` | 82 · 85 · 100, tous réussis |
| `verify:groups` · `verify:audit` · `verify:settings` · `verify:backup` | 73 · 81 · 80 · 50, tous réussis |
| **`verify:production`** *(nouvelle)* | **56 contrôles**, contre Vercel |

### La recette dédiée — `npm run verify:ajustements`

Elle éprouve les sept ajustements, en 95 contrôles :

1. **Tableau de bord** — un compte ne portant que les trois capacités de
   pilotage voit les **douze** indicateurs chiffrés, aucun « Non accessible »,
   et **aucune** référence de contrat ; RLS lui masque toujours les locations.
2. **Bandeaux** — **30 pages** parcourues, aucune référence de documentation.
3. **Onglets** — six fiches, aucun « à venir », et chaque onglet ouvre du
   contenu réel.
4. **Barres d'actions** — les quatre documents sont téléchargés et vérifiés
   `%PDF`.
5. **Paiement divers** — un encaissement saisi à l'écran : brouillon sans
   mouvement, validation qui **augmente** le solde de 75 000 KMF, une seule
   écriture d'ENTRÉE, reçu produit, annulation qui rend le solde.
6. **Champs déroulants** — sur 390 px tactile : le `<select>` ne reçoit pas le
   pointeur, la liste s'ouvre dans la page, tient dans l'écran, offre 44 px par
   option, ne coupe aucun texte, se referme sur Échap, et le choix atteint bien
   le `<select>`.
7. **Ajout d'une personne** — champs empilés, bouton pleine largeur, ajout et
   retrait effectifs.

Elle nettoie ses sujets et vérifie que **les données DEMO sont intactes**.

### Deux fragilités de recettes corrigées au passage

**a. L'empreinte du jeu de démonstration.** Un décompte en échec revenait `null`
et était ramené à `0` en silence ; la recette échouait alors **à la fin**, sous
un intitulé qui accusait la fonctionnalité éprouvée (« les clients DEMO sont
intacts — 6 / 0 au départ »). Le décompte est désormais **réessayé**, puis la
recette échoue immédiatement en nommant sa cause. Deux faux échecs observés
pendant la mission venaient de là.

**b. Deux recettes héritaient d’un nombre écrit en dur.**
`verify:supplier-payments` vérifiait « les TROIS fournisseurs DEMO » et « AUCUNE
coordonnée de règlement sur un fournisseur DEMO ». Ni l'un ni l'autre n'était la
règle — la règle est que la recette ne touche à rien qui ne lui appartienne — et
les deux nombres avaient cessé d'être vrais dès que la démonstration s'était
étoffée. Ils sont remplacés par une empreinte prise sur place, comme dans les
vingt-deux recettes corrigées le 06/09. Et `verify:rental-live` attendait trois
secondes fixes après une prolongation refusée : elle attend désormais le message,
non un délai.

**c. `supabase/tests/projects.sql` échouait par intermittence** depuis le LOT 13 :
écrite au LOT 12, elle n'admettait que deux familles de notification pour les
projets, et le calendrier en a ajouté deux — « réunion à venir » et « rendez-vous
à venir ». Elle échouait dès qu'une réunion de démonstration tombait dans la
fenêtre de veille. La liste est alignée sur celle de la recette du LOT 13.

---

## 12. Non-régression

Vérifié : authentification, permissions, Super Admin, tableau de bord, location,
réservations, véhicules, tiers, factures clients et fournisseurs, imputations,
paiements, trésorerie, projets, planification, notifications, journal
d'activité, paramètres, sauvegarde et restauration, données DEMO.

Le jeu de démonstration est **intact** : 6 clients, 8 véhicules, 4 fournisseurs,
3 factures fournisseurs, 1 imputation — mesuré avant et après chaque recette.

---

## 13. Déploiement

| Étape | Résultat |
|---|---|
| Migrations Supabase | 076, 077, 078 appliquées à la base de production |
| Commit | `5c9c1b7` — 141 fichiers, +8 335 / −878 |
| Secrets | aucun : `.env*` reste exclu, le différentiel a été relu ligne à ligne |
| Push GitHub | `main` → `b776523..5c9c1b7` |
| Build Vercel | **READY** — compilé en 9,3 s, 59 pages, aucun avertissement |
| Second commit | `9b14080` — recette de production et rapport ; déploiement **READY** |
| Troisième commit | `de3b2b3` — précisions du rapport ; déploiement **READY** |
| Production | <https://adikom-pilot.vercel.app> — la page publique annonce **178 capacités attribuables** |

### Recette de production — `npm run verify:production`

**56 contrôles, tous réussis**, contre <https://adikom-pilot.vercel.app>, avec de
vraies sessions et les données réelles :

| Section | Ce qui est vérifié |
|---|---|
| 1 | La session est reconnue ; un visiteur sans session est renvoyé à la connexion |
| 2 | Le tableau de bord d'un compte ne portant QUE les trois capacités de pilotage : **17 indicateurs chiffrés**, aucun « Non accessible », aucune référence de contrat |
| 3 | **15 pages** parcourues, aucune référence de documentation interne |
| 4 | Six fiches, aucun onglet « à venir » ; rentabilité calculée **avec** sa réserve ; tarifs préférentiels et historique ouverts |
| 5 | Les quatre barres d'actions, et les **quatre PDF réellement produits** (53 à 57 Ko) |
| 6 | Le sens du paiement divers : fiche, formulaire et liste |
| 7 | Le champ déroulant de l'application est servi, le `<select>` natif demeure et reste hors d'atteinte du pointeur |
| 8 | Catalogue à **178** capacités |

### Pourquoi cette recette lit le HTML plutôt que de piloter un navigateur

Les recettes d'interface ouvrent un navigateur et attendent le chargement
COMPLET d'une page — polices et scripts compris. Depuis le poste de recette, le
lien vers le réseau de diffusion de Vercel s'est dégradé au moment du
déploiement : une police de 35 Ko n'arrivait pas en trente secondes, un morceau
de script de 150 Ko jamais. Mesuré, répété, constaté à la fois par le navigateur
et par `curl` — et **sans effet sur le serveur**, qui répondait, lui, en 4 à
10 secondes.

Les écrans d'ADIKOM PILOT étant rendus par le SERVEUR, le texte, les onglets,
les chiffres et les refus sont dans le HTML avant qu'aucun script ne s'exécute.
La recette de production les lit donc directement, avec la session d'un vrai
compte : RLS et les capacités s'appliquent exactement comme pour un utilisateur.
Ce qu'elle ne couvre pas — l'ouverture d'une liste déroulante sous le doigt, la
disposition mesurée en pixels — a été éprouvé par `verify:ajustements` contre le
**même code**, compilé par la même commande, servi localement : 95 contrôles,
tous réussis.

La tentative a été **répétée** après que le lien se fut partiellement rétabli
(229 Ko en 25 s) : le navigateur atteint alors la page de connexion et clique,
mais la navigation qui suit n'aboutit toujours pas en soixante secondes.

C'est une limite du réseau du poste, pas du déploiement, et elle est écrite ici
plutôt que passée sous silence.

### Ce que le lien dégradé a coûté à la recette elle-même

La recette de production a été jouée **six fois** contre <https://adikom-pilot.vercel.app>.
Quatre passages ont donné **56 contrôles, tous réussis**. Deux ne l'ont pas
donné, et les deux méritent d'être nommés :

- un passage s'est **interrompu à la mise en place**, sur `fetch failed` en
  créant le compte de recette — la coupure a frappé Supabase, pas le SaaS. La
  recette s'est arrêtée là et a nettoyé ses comptes ;
- un passage a rendu **55 réussis sur 56**. Le contrôle en défaut portait un
  libellé, mais la recette ne DISAIT pas ce qui lui était arrivé.

C'est ce silence qui a été corrigé. Une lecture est déjà réessayée trois fois ;
si elle n'aboutit toujours pas, elle rend un corps **vide**, et les contrôles
qui y cherchent un libellé échouent alors comme si l'écran avait perdu son
contenu. On part chercher un défaut là où il n'y en a pas. La recette tient
désormais la liste des lectures abandonnées et la rappelle avant son total :

```
LIENS INTERROMPUS — 1 lecture(s) n'ont jamais abouti :
  /location/tarification?onglet=preferentiels — fetch failed
Les contrôles portant sur ces pages ont lu un corps vide : ils disent le
transport, pas le SaaS. Rejouer la recette avant de conclure.
```

Le nombre de contrôles est inchangé — **56** — et aucun ne change de sens : la
recette ne se donne pas le droit d'excuser un échec, elle donne de quoi le
qualifier.

---

## 14. Ce qui reste ouvert, et qui relève d'ADIKOM

1. **Les documents attachés à une fiche de tiers.** Aucun stockage de pièce
   jointe n'existe pour un client, un fournisseur ou un partenaire, et personne
   ne l'a demandé (arbitrage 19 de DEC-036, toujours ouvert). Les onglets
   « Documents » rassemblent ce que le système **produit**. En livrer davantage
   supposerait d'arrêter trois règles : quels types de document, quelle capacité
   les gouverne — consulter et téléverser sont deux capacités distinctes —, et
   quelle durée de conservation.

2. **Les conditions d'un partenariat.** L'onglet a été retiré faute de modèle.
   Le livrer suppose de décider ce qu'une condition contient, comment elle
   s'applique, et sous quelle capacité elle se gère.

3. **La rentabilité complète d'un véhicule.** La marge livrée rapproche deux
   grandeurs que le système connaît. Une rentabilité complète supposerait
   d'enregistrer, **par véhicule**, l'amortissement ou le loyer, l'assurance, le
   carburant et une clé de répartition des charges générales. C'est une décision
   comptable, à prendre avant toute implémentation.

4. **Le marqueur `[M1]` des données de démonstration** — voir §3. Il disparaît
   avec le jeu de démonstration.

5. **Quatre recettes d'interface exigent les identifiants du Super Admin**
   (`verify:referential:ui`, `verify:permissions`, `verify:users:ui`,
   `verify:corrections`). Elles n'ont pas été jouées dans cette mission : le mot
   de passe du Super Admin n'est pas dans l'environnement de développement, et
   il n'avait pas à y être. Leur périmètre — référentiel, arborescence des
   permissions, fiche utilisateur — est couvert par ailleurs : `verify:capabilities`
   (217 contrôles), `verify:groups`, `verify:audit` et la recette des ajustements
   traversent les mêmes écrans avec des comptes créés pour l'occasion.

---
