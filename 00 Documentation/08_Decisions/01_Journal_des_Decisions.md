# ADIKOM PILOT

## Journal des décisions

**Version :** 1.0
**Statut :** Document de référence — décisions arbitrées
**Entreprise :** ADIKOM Technology & Travel
**Projet :** ADIKOM PILOT

---

# 1. Objet du document

Ce document consigne les décisions prises lorsque la documentation fonctionnelle présentait :

- une contradiction entre deux documents ;
- une ambiguïté ;
- une information manquante ;
- une décision technique structurante non définie.

Il applique la procédure prévue par le projet :

**Identifier → Signaler → Proposer → Faire valider → Documenter**

*(README §48 · CLAUDE.md §6 et §52)*

Chaque décision porte une référence stable (`DEC-xxx`) utilisable dans le code, les commits et les revues.

**Règle d'usage :** en cas de divergence entre un document fonctionnel et une décision consignée ici, la décision consignée ici prévaut, car elle est postérieure et plus spécifique. Les documents d'origine ne sont pas réécrits : ils reçoivent une note de renvoi vers la décision concernée.

---

# 2. Index des décisions

| Réf. | Sujet | Nature | Statut | Date |
|---|---|---|---|---|
| DEC-001 | Unité du tarif de location | Contradiction documentaire | Validée | 2026-08-19 |
| DEC-002 | Ordre de priorité tarifaire | Contradiction documentaire | Validée | 2026-08-19 |
| DEC-003 | Landing page publique | Contradiction documentaire | Validée | 2026-08-19 |
| DEC-004 | Emplacement du code source | Décision technique | Validée | 2026-08-19 |
| DEC-005 | Formats de numérotation | Contradiction documentaire | Traitement neutre | 2026-08-19 |
| DEC-006 | Statuts réservation / location | Incohérence documentaire | Traitement neutre | 2026-08-19 |
| DEC-007 | Nature du montant dû au fournisseur | Information manquante | En attente ADIKOM | 2026-08-19 |
| DEC-008 | Règles de calcul de la durée et des frais | Information manquante | En attente ADIKOM | 2026-08-19 |
| DEC-009 | Résolution des permissions multi-groupes | Décision à confirmer | Appliquée par défaut | 2026-08-19 |
| DEC-010 | Stockage et arithmétique des montants | Décision technique | Validée | 2026-08-19 |
| DEC-011 | Application des permissions côté serveur | Décision technique | Validée | 2026-08-19 |
| DEC-012 | Garantie de non-collision des véhicules | Décision technique | Validée | 2026-08-19 |
| DEC-013 | Effet comptable d'une imputation | Décision technique | Validée | 2026-08-19 |
| DEC-014 | Fuseau horaire et taxes | Information manquante | En attente ADIKOM | 2026-08-19 |
| DEC-015 | Portée de « SaaS 100 % interne » | Clarification ADIKOM | Validée | 2026-08-20 |
| DEC-016 | Nom du dossier de développement | Contrainte technique | Validée — **révise DEC-004** | 2026-08-20 |
| DEC-017 | Erreur de lecture ≠ absence de donnée | Décision technique | Appliquée | 2026-08-20 |
| DEC-018 | Jointures ambiguës explicitées | Décision technique | Appliquée | 2026-08-20 |
| DEC-019 | Mot de passe temporaire | Fonctionnelle et technique | Appliquée | 2026-08-21 |
| DEC-020 | Anonymisation de l'auteur dans l'audit | Contradiction interne | Appliquée | 2026-08-21 |
| DEC-021 | Numérotation et découpage des étapes | Clarification ADIKOM | Validée | 2026-08-21 |
| DEC-022 | Droits d'exécution des fonctions | Défaut de sécurité corrigé | Appliquée | 2026-08-21 |
| DEC-023 | Convention des références de documents | Décision ADIKOM | Validée — **implémentation reportée** | 2026-08-21 |
| DEC-024 | Attribution indépendante des capacités | Règle d'architecture | Validée — **permanente** | 2026-08-22 |
| DEC-025 | Cadrage de l'Étape 2.3 — cycle d'exploitation | Arbitrages ADIKOM | Validée — **clôt DEC-014** | 2026-08-24 |
| DEC-026 | Imputation fournisseur — LOT 4 de l'Étape 2.4 | Arbitrages et contradiction | Appliquée — **tranche une contradiction** | 2026-08-29 |
| DEC-027 | Facture fournisseur — LOT 5 de l'Étape 2.5 | Arbitrages | Appliquée — **ouvre DEC-013** | 2026-08-30 |
| DEC-028 | Unicité de la référence fournisseur | Arbitrage ADIKOM | Appliquée — **clôt DEC-027 §i** | 2026-08-31 |
| DEC-029 | Banques & Caisses et règlements — LOT 6 | Arbitrages ADIKOM | Appliquée — **ouvre le module 6** | 2026-08-31 |
| DEC-030 | Facture client et clôture — LOT 7 | Arbitrages | Appliquée — **clôt le cycle de location** | 2026-09-01 |
| DEC-031 | Règlements clients et solde des créances — LOT 8 | Arbitrages | Appliquée — **achève l'Étape 2.5** | 2026-09-02 |
| DEC-032 | Tableau de bord de pilotage — LOT 9 | Arbitrages et sécurité | Appliquée — **ouvre la Phase 3** | 2026-09-02 |
| DEC-033 | Centre de notifications — LOT 10 | Arbitrages et sécurité | Appliquée — **ouvre le module 2** | 2026-09-04 |
| DEC-034 | Statistiques et rapports de facturation — LOT 11 | Arbitrages et sécurité | Appliquée — **achève la Phase 3** | 2026-09-04 |

---

# DEC-001 — Unité du tarif de location

## Contradiction constatée

Deux lectures incompatibles du tarif coexistent dans la documentation :

**Lecture « forfait »**

`03_Modules/05_Gestion_de_Location.md` §69 et `04_Workflows/02_Reservation.md` §61 :
une réservation du 20/08/2026 au 23/08/2026 avec un tarif appliqué de **450 000 KMF** est facturée **450 000 KMF**.
La durée n'a aucun effet sur le montant.

**Lecture « tarif journalier »**

`03_Modules/07_Facturation_et_Paiement.md` §11 :
ligne de facture « Location Toyota T5 · 3 jours · **300 000 KMF** ».
Le montant dépend de la durée.

Un moteur de calcul ne peut pas appliquer les deux règles simultanément.

## Décision

**Chaque tarif porte sa propre unité.**

```
tarif = { montant, unité }
unité ∈ { JOUR, FORFAIT }

unité = JOUR     → montant à payer = montant × durée facturable
unité = FORFAIT  → montant à payer = montant (durée sans effet)
```

## Justification

Les deux passages de la documentation deviennent valides sans en contredire aucun. ADIKOM peut pratiquer un tarif journalier sur certains véhicules et un forfait sur d'autres, ce qui correspond à une activité mêlant location courante et prestations de mobilité.

## Conséquences

- Les tables de tarifs (standard véhicule, standard catégorie, préférentiel client) portent les colonnes `amount` **et** `unit`.
- La réservation, la location et la facture conservent en snapshot : le montant unitaire, **l'unité**, la source du tarif et le montant calculé.
- La règle de calcul de la durée facturable reste à définir → voir **DEC-008**.

---

# DEC-002 — Ordre de priorité tarifaire

## Contradiction constatée

**Ordre A — le véhicule d'abord**

`03_Modules/05_Gestion_de_Location.md` §20 et `03_Modules/04_Tiers.md` §6.6 :

```
Tarif spécifique véhicule → Tarif spécifique catégorie → Tarif préférentiel client → Tarif standard
```

Le tarif préférentiel du client passe **après** un tarif posé sur un véhicule.

**Ordre B — le client d'abord**

`05_Regles_Metier/01_Location.md` §40 :

```
1. Tarif applicable spécifiquement au client
2. Tarif standard
3. Autre règle tarifaire explicitement configurée
```

Le tarif préférentiel du client passe **en premier**.

Les deux ordres produisent des montants différents dès qu'un client privilégié loue un véhicule porteur d'un tarif spécifique.

## Décision

**Le tarif le plus spécifique gagne.**

```
1. Tarif client + véhicule précis
2. Tarif client + catégorie
3. Tarif client (général)
4. Tarif standard du véhicule
5. Tarif standard de la catégorie
6. Tarif standard global
```

À égalité de spécificité, le tarif **le plus récemment créé** s'applique.

## Justification

Cet ordre est déterministe, ne contredit ni l'ordre A ni l'ordre B dans leur intention respective (la précision commande, et un accord client reste un accord client), et se lit comme une règle unique plutôt que comme un arbitrage entre deux documents.

## Conséquences

- Un **résolveur de tarif unique et centralisé** implémente cette règle. Elle ne doit jamais être réécrite écran par écran *(CLAUDE.md — la règle tarifaire doit être centralisée)*.
- Le système n'applique **jamais** deux tarifs simultanément.
- Un tarif préférentiel expiré n'est plus candidat.
- Le résolveur renvoie toujours la **source** du tarif retenu, affichée à l'utilisateur avant validation *(Workflow 02 §8)*.

---

# DEC-003 — Landing page publique

## Contradiction constatée

`06_Design/Design_System.md` §56 exige une **landing page professionnelle** présentant ADIKOM PILOT, sa mission et ses fonctionnalités.

`README.md` §65 et `01_Vision_et_Objectifs/01_Vision_ADIKOM_PILOT.md` §4 imposent un SaaS **strictement interne**, sans connexion publique ni espace externe.

## Décision

**Landing page publique institutionnelle + page de connexion.**

- `/` : page publique de présentation (mission, bénéfices, modules, identité ADIKOM).
- `/connexion` : authentification des utilisateurs internes.
- Toute route applicative reste protégée par session et permissions.

## Justification

Une page de présentation n'est pas un espace client. Elle ne crée aucun compte externe et n'expose aucune donnée métier, ce qui préserve la règle « SaaS 100 % interne ».

## Conséquences

- La landing ne contient **aucune donnée métier** : ni chiffre réel, ni nom de client, fournisseur, véhicule ou utilisateur.
- Aucun formulaire d'inscription. Aucune création de compte publique *(Module 08 §6)*.
- Le logo officiel y est utilisé sans transformation, sur fond clair *(Design System §82)*.

---

# DEC-004 — Emplacement du code source

## Question

`README.md` §26 et §36 placent le code dans `01 Développement/`. Ce chemin contient un espace et un caractère accentué, ce qui peut compliquer l'outillage et la configuration de déploiement.

## Décision initiale

Le code source est placé dans `01 Développement/adikom-pilot/`, ce qui respecte
l'architecture documentée sans modifier le README.

> ⚠ **Cette décision a été révisée par DEC-016.** Le chemin retenu s'est révélé
> incompatible avec le déploiement Vercel. Voir DEC-016 pour le chemin en
> vigueur.

---

# DEC-005 — Formats de numérotation

## Contradiction constatée

| Objet | Formats trouvés | Sources |
|---|---|---|
| Facture client | `FAC-2026-000001` / `FAC-C-2026-000001` | Module 07 §7 · Règles finance §9 |
| Facture fournisseur | `FF-2026-000001` / `FAC-F-2026-000001` / `FOU-FAC-001` | Module 07 §30 · Règles finance §9 · Règles fournisseurs §33 |
| Véhicule | `VEH-000001` / `VEH-2026-000001` | Module 05 §12 · Règles parc §3 |
| Fournisseur | `FOU-000001` / `FOU-2026-000001` | Module 04 §9.3 · Règles fournisseurs §3 |
| Client | `CLI-000001` | Module 04 §5.5 |
| Compte financier | `COMP-000001` | Module 06 §9 |

## Décision — traitement neutre

Aucun format n'est codé en dur. Une table `numbering_rules` **paramétrable** définit par type d'objet : préfixe, présence de l'année, longueur du compteur, périodicité de remise à zéro.

Valeurs par défaut retenues (formats les plus explicites, issus des règles métier finance) :

```
Client                → CLI-000001
Fournisseur           → FOU-000001
Véhicule              → VEH-000001
Réservation           → RES-2026-000001
Location              → LOC-2026-000001
Maintenance           → MNT-2026-000001
Imputation            → IMP-2026-000001
Facture client        → FAC-C-2026-000001
Facture fournisseur   → FAC-F-2026-000001
Compte financier      → COMP-000001
```

## Conséquences

- Les formats sont modifiables dans **Paramètres** sans redéploiement *(Module 09 §15)*.
- La génération est **atomique et côté serveur** : aucun doublon, aucune collision, aucune réutilisation *(Module 09 §16)*.
- La règle de remise à zéro annuelle reste à confirmer *(Module 09 §17)* — par défaut : remise à zéro au changement d'année civile pour les objets datés.

---

# DEC-006 — Statuts réservation / location

## Incohérence constatée

`03_Modules/05_Gestion_de_Location.md` §23 (statuts de réservation) et §52 (statuts de location) partagent des valeurs (`En cours`, `Terminée`), alors que `05_Regles_Metier/01_Location.md` §11 et §80.4 imposent : **une réservation n'est pas une location**.

## Décision — traitement neutre

Deux entités distinctes, deux jeux de statuts séparés, reliées par une référence.

```
Réservation : Brouillon · En attente · Confirmée · En préparation
              · Convertie en location · Annulée · Expirée

Location    : En préparation · Confirmée · En cours · Prolongée
              · En retard · Retournée · À contrôler · À facturer
              · Facturée · Clôturée · Annulée
```

Une réservation se termine sur `Convertie en location` et ne porte jamais l'état d'exécution de la location.

## Conséquences

- Le statut **opérationnel** de la location reste distinct de son statut **financier** *(Règles location §67)*.
- Une réservation annulée ne bloque plus la disponibilité du véhicule *(Règles location §13)*.

---

# DEC-007 — Nature du montant dû au fournisseur

## Information manquante

L'exemple de référence du projet mentionne un « montant fournisseur » de **500 000 KMF** pour une Toyota T5 mise à disposition, sans jamais préciser sa nature :

- forfait de mise à disposition du véhicule ?
- loyer périodique (mensuel) ?
- montant dû par location réalisée ?
- valeur contractuelle du véhicule ?

Aucun document ne tranche.

## Traitement retenu, sans invention de règle

La **facture fournisseur est saisie manuellement**, avec son montant brut, sa date, son échéance et sa référence externe. Elle peut être rattachée à un véhicule et à des maintenances.

Ce modèle fonctionne quelle que soit la nature réelle du montant, et ne présuppose aucune périodicité ni aucun calcul automatique.

## Question ouverte pour ADIKOM

Le système doit-il, à terme, **générer** le montant dû au fournisseur (contrat de mise à disposition, loyer périodique, part par location) ou la saisie manuelle de la facture reçue reste-t-elle la règle ?

Aucun automatisme ne sera développé avant réponse.

---

# DEC-008 — Règles de calcul de la durée et des frais

## Informations manquantes

Explicitement renvoyées à ADIKOM par la documentation :

| Sujet | Source | État |
|---|---|---|
| Arrondi de durée, jour entamé, heure de retour | Règles location §35 | Non défini |
| Franchise et traitement du retard | Règles location §62 | Non défini |
| Barème carburant manquant | Règles location §41–42 | Non défini |
| Barème kilométrage supplémentaire | Périmètre MVP §10.13 | Non défini |
| Valorisation des dommages | Module 05 §37 | Non défini |
| Caution et acompte | Périmètre MVP §10.5 | Champs cités, aucune règle |
| Période de préparation entre deux locations | Règles location §60 | Durée non définie |
| Seuils de validation des imputations | Workflow 06 §47 | Montants non fixés |

## Traitement retenu

- **Durée facturable** : calculée à partir des dates et heures réelles ; la règle d'arrondi est un **paramètre** (par défaut : jour entamé = jour dû), modifiable sans redéploiement.
- **Frais supplémentaires** : saisis manuellement, obligatoirement **justifiés et rattachés** à l'événement constaté au retour. Aucun frais n'est ajouté automatiquement *(Règles finance §17)*.
- **Caution / acompte** : champs prévus dans le modèle, aucun workflow automatisé.
- **Période de préparation** : paramétrable, **désactivée par défaut**.
- **Seuils d'imputation** : le workflow de validation est implémenté ; les seuils sont configurables, aucun seuil n'est codé en dur *(Workflow 06 §47 : « ne doivent être automatisés qu'après validation par ADIKOM »)*.

Le système signale ces valeurs comme non configurées plutôt que d'appliquer un barème inventé.

---

# DEC-009 — Résolution des permissions multi-groupes

## Point à confirmer

`03_Modules/08_Utilisateurs_et_Groupes.md` §32 recommande une règle pour le MVP.
`05_Regles_Metier/05_Permissions.md` §47 exige qu'une règle claire soit **fixée avant** l'implémentation du multi-groupes, sans la fixer.

## Décision appliquée par défaut

```
Refus explicite       → accès refusé   (prioritaire sur tout)
Autorisation accordée → accès autorisé
Aucune permission     → accès refusé
```

Un utilisateur peut appartenir à plusieurs groupes ; ses permissions sont l'union des autorisations de ses groupes et de ses permissions individuelles, **moins** tout refus explicite.

## Justification

C'est la règle recommandée par le Module 08 §32, et la seule compatible avec le principe de confiance minimale *(Règles permissions §87 : l'absence de permission entraîne un refus)* et le principe de moindre privilège.

## Conséquences

- Le système distingue et affiche l'**origine** de chaque permission : héritée d'un groupe, individuelle, ou refus explicite *(Règles permissions §45–46, Module 08 §48)*.
- Le Super Admin n'est pas soumis à cette résolution : son accès est un **rôle système** *(Module 08 §33)*.
- Un compte désactivé ou suspendu perd tout accès, **quelles que soient** ses permissions *(Règles permissions §48)*.

---

# DEC-010 — Stockage et arithmétique des montants

## Décision

Tous les montants monétaires sont stockés en **entiers** (`BIGINT`), exprimés en **KMF**, devise sans sous-unité en usage.

Aucun type flottant n'est utilisé pour un montant, à aucun niveau (base, API, interface).

## Justification

`CLAUDE.md` §58 : « Évite les approximations ou calculs flottants inadaptés aux montants monétaires. »

## Conséquences

- Les calculs de solde, d'imputation et de remise sont exacts, sans erreur d'arrondi cumulée.
- Le formatage d'affichage (`500 000 KMF`) est séparé du stockage *(Module 09 §19)*.
- L'architecture reste ouverte à une devise à sous-unité : le montant serait alors exprimé en unités mineures.

---

# DEC-011 — Application des permissions côté serveur

## Décision

Double barrière, systématique :

1. **Garde applicative serveur** — chaque action sensible vérifie la permission requise avant exécution.
2. **RLS Postgres** — chaque table porte des policies s'appuyant sur les fonctions `has_permission(uid, code)` et `is_super_admin(uid)`.

L'interface masque ou désactive les éléments non autorisés, mais **jamais comme mesure de sécurité**.

## Justification

`CLAUDE.md` §19 et §44 · `README.md` §56 · Règles permissions §50, §85, §86 · Module 08 §4 et §46 : masquer un bouton ne constitue pas une protection ; un utilisateur ne doit pas contourner une restriction par une URL ou un appel direct.

## Conséquences

- La clé de service Supabase est utilisée **exclusivement côté serveur** et n'est jamais exposée au navigateur *(CLAUDE.md §25)*.
- Le retrait d'une permission prend effet à la vérification suivante *(Règles permissions §44)*.
- Une action refusée ne modifie aucune donnée et peut être journalisée comme refus *(Règles permissions §84, Règles audit §60–61)*.

---

# DEC-012 — Garantie de non-collision des véhicules

## Décision

Toute période durant laquelle un véhicule est indisponible — réservation confirmée, location en cours, maintenance immobilisante, immobilisation — est enregistrée dans une table unique d'**occupations**, protégée par une contrainte d'exclusion sur `(véhicule, période)`.

La non-collision est donc garantie **par la base de données**, pas par du code applicatif.

## Justification

`05_Regles_Metier/01_Location.md` §57 et §80.1 : « Un véhicule ne doit jamais être attribué simultanément à deux locations incompatibles. Cette règle constitue une contrainte fondamentale. »
`CLAUDE.md` §31 et README §55 : les règles importantes doivent être protégées au niveau des données.

## Conséquences

- Un conflit est impossible, même en cas de saisies simultanées par deux utilisateurs.
- La recherche de disponibilité, la confirmation de réservation, la création de location, la prolongation et le changement de véhicule interrogent la même source *(Règles location §56, Règles parc §67 et §70)*.
- Le statut affiché d'un véhicule ne suffit jamais à conclure à sa disponibilité *(Règles parc §67 et §69)*.

---

# DEC-013 — Effet comptable d'une imputation

## Ambiguïté constatée

`04_Workflows/06_Imputation_Maintenance_Fournisseur.md` distingue les statuts `Validée` (§16) et `Imputée` (§17), et prévoit une **imputation en attente de facture** (§31), sans préciser à quel moment le montant dû au fournisseur est réellement réduit.

## Décision

Le montant dû est réduit **uniquement** lorsque l'imputation est au statut `Imputée`, c'est-à-dire **validée et rattachée à une facture fournisseur**.

Une imputation en `Brouillon`, `À valider`, `Validée` sans facture rattachée, ou `Annulée` **n'affecte aucun solde**.

## Justification

Workflow 06 §12 : « Une imputation non validée ne doit pas être considérée comme définitivement déduite du montant fournisseur. »
Workflow 06 §31 : une imputation en attente de facture « ne doit pas être considérée comme un paiement ».

## Conséquences

- `Net à payer = Montant brut − Σ imputations imputées`.
- `Solde = Net à payer − Σ paiements validés` *(Module 07 §57)*.
- L'annulation d'une imputation réintègre le montant et conserve l'historique *(Workflow 06 §40)*.
- Les quatre montants — **brut, imputé, payé, solde** — sont conservés et affichés séparément *(règle non négociable du projet)*.

---

# DEC-014 — Fuseau horaire et taxes

## Informations manquantes

- **Fuseau horaire** : `Module 09` §21 exige un fuseau de référence cohérent, sans le nommer.
- **Taxes** : la documentation mentionne systématiquement « taxes **lorsqu'elles sont applicables** » sans définir ni taux ni règle.

## Traitement retenu

- **Dates** : stockage en `timestamptz` (UTC), affichage sur le fuseau des Comores (`Indian/Comoro`, UTC+3). **À confirmer par ADIKOM.**
- **Taxes** : non implémentées dans le MVP. La structure des factures prévoit l'emplacement nécessaire, mais aucun taux n'est appliqué tant qu'ADIKOM n'a pas défini le régime applicable.

## Question ouverte pour ADIKOM

ADIKOM applique-t-elle une taxe sur ses prestations de location ? Si oui, laquelle, à quel taux, et sur quelles lignes ?

---

# DEC-015 — Portée de « SaaS 100 % interne »

## Ambiguïté constatée

L'expression « SaaS 100 % interne » (`README.md` §48 et §65,
`01_Vision_et_Objectifs/01_Vision_ADIKOM_PILOT.md` §4) a été comprise à tort
comme impliquant un fonctionnement en local.

Cette lecture avait conduit à faire de Docker et de la pile Supabase locale un
prérequis de développement.

## Clarification apportée par ADIKOM

« 100 % interne » qualifie **les utilisateurs**, pas l'hébergement.

Cela signifie :

- seuls les collaborateurs autorisés d'ADIKOM utilisent le SaaS ;
- aucun client, fournisseur, partenaire ou tiers ne possède de compte d'accès ;
- l'accès est contrôlé par authentification et permissions.

Cela **ne signifie pas** que l'application doit fonctionner en local.

**ADIKOM PILOT est une application hébergée en ligne.**

## Décision

Le flux de développement officiel devient :

```
Code → Supabase Cloud → Tests → GitHub → Vercel → Recette de l'application déployée
```

Docker et la pile Supabase locale deviennent **optionnels et non bloquants**.
Ils ne font plus partie de l'architecture de développement du projet.

## Conséquences

- Les migrations sont appliquées sur le **projet Supabase Cloud**
  (`supabase db push`), et non plus rejouées localement (`supabase db reset`).
- La procédure de mise en place est réécrite autour du cloud.
- Aucune règle métier n'est modifiée. Le schéma, le système de permissions, la
  logique Super Admin, l'imputation fournisseur, les tarifs préférentiels et le
  Design System restent inchangés.
- La règle d'accès reste entière : aucun portail client, fournisseur ou
  partenaire, aucune inscription publique, aucun accès externe aux données
  métier. Seule la landing page est publique, et elle ne présente que le
  produit (voir **DEC-003**).

## Portée sur la sécurité

Le passage à un hébergement en ligne **renforce** l'exigence de contrôle serveur
plutôt qu'il ne l'assouplit : l'application devient accessible depuis Internet.
Les garanties déjà en place restent la référence — permissions vérifiées côté
serveur, RLS sur toutes les tables, aucun accès pour le rôle `anon`, journal
d'audit infalsifiable (**DEC-011**, **DEC-012**).

---

# DEC-016 — Nom du dossier de développement

*Révise DEC-004.*

## Contrainte constatée

Le premier déploiement Vercel a échoué après un build pourtant réussi :

```
A Serverless Function has an invalid name:
  "'01 Développement/adikom-pilot/___next_launcher.cjs'"
They must be less than 128 characters long and must not contain any space.
```

Vercel dérive le nom de ses fonctions serverless du chemin du *Root Directory*.
Ces noms n'admettent pas d'espace. Le build se terminait normalement en 20
secondes, puis le déploiement échouait à l'étape de création des fonctions.

Aucun contournement n'existe : ni `vercel.json`, ni configuration monorepo ne
modifient cette dérivation. **Le chemin menant à l'application ne peut pas
contenir d'espace.**

Ce n'est pas l'accent qui posait problème, mais bien l'espace.

## Décision

Le dossier de développement est renommé :

```
01 Développement/   →   01_Developpement/
```

Le code source réside donc dans `01_Developpement/adikom-pilot/`.

`00 Documentation/` **reste inchangé** : ce dossier n'est jamais un répertoire
de build, l'espace n'y pose aucune difficulté, et le conserver limite l'écart
avec la structure documentée.

## Conséquences

- Vercel : *Root Directory* = `01_Developpement/adikom-pilot`.
- `README.md` §26 et §36 mis à jour pour refléter le nouveau nom.
- Le renommage a été effectué avec `git mv` : l'historique des 56 fichiers
  concernés est préservé.
- Effet secondaire favorable : les chemins deviennent purement ASCII, ce qui
  supprime les échappements `01 D\303\251veloppement` dans les sorties Git et
  la nécessité de guillemets dans les commandes.

## Enseignement

Le risque avait été identifié et signalé lors de DEC-004, mais considéré comme
acceptable. Il s'est avéré bloquant. Pour les décisions d'infrastructure, une
contrainte de plateforme signalée mérite d'être vérifiée avant d'être acceptée,
plutôt qu'après le premier déploiement.

---

## DEC-017 — Une erreur de lecture n'est jamais présentée comme une absence de donnée

**Date :** 20 août 2026
**Portée :** technique
**Statut :** appliquée

### Contexte

Les requêtes du module Utilisateurs traitaient de la même manière une erreur de
base de données et un résultat vide : la liste renvoyait un tableau vide, la
fiche renvoyait « introuvable ». Un défaut réel de jointure a ainsi été affiché
pendant plusieurs heures comme une page 404 parfaitement crédible.

### Décision

Une erreur de requête est distinguée d'un résultat vide :

- le détail technique est journalisé **côté serveur uniquement** ;
- l'utilisateur reçoit un message fonctionnel, sans trace ni détail de schéma ;
- l'absence de ligne reste un cas fonctionnel légitime (404).

Deux états d'interface obligatoires sont ajoutés au groupe applicatif :
`error.tsx` (erreur, avec réessai) et `not-found.tsx` (introuvable). Ce dernier
ne distingue pas « n'existe pas » de « inaccessible », afin de ne pas renseigner
un utilisateur non autorisé sur l'existence d'une donnée.

### Justification

CLAUDE.md §38 impose des états d'interface distincts, §43 interdit d'exposer le
détail technique. Confondre erreur et vide viole les deux à la fois : le
diagnostic est perdu et l'utilisateur est induit en erreur.

---

## DEC-018 — Les jointures ambiguës sont explicitées

**Date :** 20 août 2026
**Portée :** technique
**Statut :** appliquée

### Contexte

`user_departments` et `user_groups` référencent `app_users` deux fois : le
titulaire (`user_id`) et l'auteur de l'affectation (`assigned_by`). PostgREST
refuse alors la jointure implicite (PGRST201) et la requête entière échoue.

### Décision

Toute jointure vers une table possédant plusieurs clés étrangères vers la même
cible désigne explicitement la colonne : `user_departments!user_id ( … )`.

La colonne est préférée au nom de contrainte, car ce dernier est généré
automatiquement et changerait si la contrainte était recréée.

### Portée future

La règle s'appliquera aux mêmes situations dans les modules à venir,
notamment `vehicles` (fournisseur courant / auteur de la modification) et les
tables financières portant à la fois un émetteur et un valideur.

---

## DEC-019 — Mot de passe temporaire et changement obligatoire

**Date :** 21 août 2026
**Portée :** fonctionnelle et technique
**Statut :** appliquée

### Contexte

Le Super Admin saisissait lui-même le mot de passe initial d'un collaborateur.
Il en avait donc connaissance de façon durable, sans que rien n'oblige le
titulaire à le remplacer.

### Décision

Le mot de passe initial est **généré**, jamais saisi. Il est produit dans le
navigateur de l'administrateur — il n'existe donc à aucun moment côté serveur
autrement qu'en transit vers Supabase Auth, et n'apparaît ni dans un résultat
d'action, ni dans un journal.

Il est **temporaire** : `app_users.must_change_password` est levé à la création
et bloque l'accès à toute fonctionnalité métier tant que le titulaire n'a pas
défini le sien.

### Points de contrôle

- Le détournement est placé dans `requireUser()`, la garde traversée par toutes
  les pages et toutes les actions : aucune route ne peut l'oublier, et l'accès
  direct par URL aboutit au même détournement.
- L'indicateur n'est levé qu'après un changement accepté par Supabase Auth, et
  seulement par le client d'administration. Aucune policy ne permet à
  l'utilisateur de le lever, et `fn_prevent_self_promotion` le refuse en base.
- Le changement est journalisé par le trigger d'audit d'`app_users`
  (avant / après). Aucune colonne applicative ne contient de mot de passe.

---

## DEC-020 — Anonymisation de l'auteur dans le journal d'audit

**Date :** 21 août 2026
**Portée :** technique
**Statut :** appliquée

### Contradiction constatée

Deux règles du socle s'annulaient :

- `audit_log.actor_id` est déclarée `references app_users (id) **on delete set
  null**` : le schéma prévoit explicitement la suppression d'un compte et la
  mise à NULL de la référence ;
- le trigger `audit_log_no_update` interdisait **tout** UPDATE, y compris cette
  cascade.

Conséquence : la clause était inopérante, et aucun compte ayant agi ne pouvait
être supprimé — pas même par le rôle de service.

### Décision

Une seule modification est tolérée sur le journal : passer `actor_id` de sa
valeur à NULL, sans qu'aucune autre colonne ne change. C'est exactement ce que
la clé étrangère déclare, et rien de plus.

Le journal reste lisible : `actor_label` fige le nom de l'auteur au moment de
l'action, précisément pour que l'historique survive à la disparition du compte.

Toute autre écriture — action, motif, valeurs avant/après, horodatage — reste
refusée, ainsi que **toute** suppression.

### Portée

Cette décision ne change pas la règle métier : un utilisateur se **désactive**,
il ne se supprime pas (CLAUDE.md §22). La suppression reste réservée aux
opérations d'environnement, hors interface.

### Précision du 21 août 2026 — portée appliquée aux données métier

Le référentiel de l'Étape 2.2 (clients, fournisseurs, véhicules, tarifs,
occupations) applique littéralement cette portée : `fn_forbid_delete` refuse
toute suppression dès lors qu'un **utilisateur est authentifié** — donc pour
toute action de l'application, qui s'exécute toujours avec la session de son
auteur — et la laisse possible lorsqu'aucun ne l'est : migration, script
d'environnement, correction par le rôle de service (migration 021).

Sans cette distinction, une fiche créée par erreur restait définitivement en
base, et les recettes automatisées ne pouvaient pas retirer leurs jeux d'essai.

Le **journal d'audit fait exception** et reste protégé sans réserve par
`fn_forbid_mutation` : aucune suppression, quel que soit le rôle.

---

## DEC-021 — Numérotation et découpage des étapes de développement

**Date :** 21 août 2026
**Portée :** méthode de développement
**Statut :** validée par ADIKOM

### Ambiguïté constatée

La numérotation « Étape 2.1 » n'existait que dans un message de commit
(`da0e702` — « Etape 2.1 de la Phase 2 — Gouvernance »). Elle ne figurait dans
aucun document du projet, et contredisait l'ordre documenté par `README.md` §73
et `CLAUDE.md` §61, où la **Phase 2 est la Gestion de location** et où les
utilisateurs, groupes et permissions relèvent de la **Phase 4**.

Une décision structurante ne peut pas rester consignée dans un historique Git
(`CLAUDE.md` §53 — toute décision importante doit pouvoir être retrouvée).

### Décision

La numérotation de référence du projet est fixée comme suit :

```
Étape 1     Socle technique · authentification · permissions · navigation      livré
Étape 2.1   Gestion des utilisateurs internes                                  livré
Étape 2.2   Gestion de location — Référentiel d'exploitation                   en cours
Étape 2.3   Réservation → Contrat → Départ → Location en cours → Retour → Contrôle
Étape 2.4   Dommages → Incidents → Maintenance → Imputation fournisseur
Étape 2.5   Facturation → Paiements → Soldes → Clôture
```

L'Étape 2.1 a traité les utilisateurs **avant** l'ordre documenté parce que le
système de permissions conditionne toutes les fonctionnalités ultérieures :
développer un module métier avant de pouvoir en restreindre l'accès aurait
imposé de le reprendre ensuite. Cette avance ne modifie pas les phases
documentées, elle en réordonne l'exécution.

### Périmètre de l'Étape 2.2

**Inclus :** clients · tarification client (conditions préférentielles) ·
fournisseurs · catégories de véhicules · véhicules · tarifs standard ·
socle de disponibilité (occupations, DEC-012) · documents de véhicule.

**Exclus, et rattachés aux étapes suivantes :** réservations, contrats, départs,
retours, dommages, incidents, maintenances, imputations, factures et paiements.

**Partenariats :** reportés hors de l'Étape 2.2. Ils ne conditionnent aucune
location, et le `Périmètre MVP` §9 prévoit lui-même que leur profondeur évolue
après le MVP.

### Points confirmés par ADIKOM à cette occasion

1. **Formats de numérotation** (confirme les valeurs par défaut de **DEC-005**
   pour ces trois objets) : `CLI-000001`, `FOU-000001`, `VEH-000001`. Aucun
   format n'est codé en dur ; la génération reste atomique et côté serveur.
   La divergence documentaire est ainsi tranchée : `05_Regles_Metier/02` §3 et
   `04` §3 proposaient une année (`VEH-2026-000001`, `FOU-2026-000001`), les
   modules 04 §5.5 / 05 §12 n'en proposaient pas. **L'année n'est pas retenue**
   pour les référentiels permanents ; elle le reste pour les objets datés
   (réservation, location, facture).
2. **Documents des véhicules** : stockage des fichiers activé dès l'Étape 2.2,
   dans un bucket Supabase **privé**, accès par URL signée de courte durée,
   policies dédiées. Aucun fichier n'est accessible publiquement.
3. **Disponibilité** : la table d'occupations de **DEC-012** est créée dès
   l'Étape 2.2, alimentée d'abord par les immobilisations. Les réservations,
   locations et maintenances y écriront aux étapes 2.3 et 2.4 sans modification
   du schéma.
4. **Champs obligatoires d'un client** — renvoyés à ADIKOM par `Module 04` §5.3 :
   type, nom ou raison sociale, téléphone, statut. Le reste est facultatif.
5. **Statuts du véhicule** — « à confirmer lors de l'implémentation »
   (`Règles parc` §12) : les sept statuts documentés sont retenus tels quels —
   `Disponible · Réservé · En location · En maintenance · Immobilisé ·
   Indisponible · Retiré` — avec le principe de `Règles parc` §69 : **le statut
   décrit une situation, la disponibilité se calcule depuis le calendrier**.
6. **Catégories de véhicules** : sous-page du Parc automobile, sans entrée de
   menu supplémentaire. `Module 05` §4 les cite comme composant du module et
   autorise l'adaptation de l'organisation des menus.

### Conséquences

- Les commits de l'Étape 2.2 référencent `DEC-021` plutôt qu'une numérotation
  implicite.
- Aucune règle métier n'est modifiée par la présente décision : elle ne porte
  que sur l'ordre et le découpage des travaux.

---

## DEC-022 — Droits d'exécution des fonctions

**Date :** 21 août 2026
**Portée :** sécurité
**Statut :** appliquée

### Défaut constaté

La recette de sécurité écrite pour l'Étape 2.2 a établi qu'avec la **seule clé
publique**, sans aucun compte, il était possible d'appeler directement plusieurs
fonctions du socle :

| Fonction | Conséquence |
|---|---|
| `log_audit(...)` | **écrire dans le journal d'audit** — donc le falsifier |
| `next_number(...)` | consommer des numéros de client, véhicule ou facture |
| `has_permission(...)` | éprouver les droits d'un compte donné |
| `is_super_admin(...)` | identifier les comptes d'administration |

Le cas le plus grave est le premier. Le journal d'audit est délibérément
inaltérable (`06_Audit.md` §40 et §77) : une entrée injectée ne peut plus jamais
en être retirée. L'inaltérabilité, qui protège l'historique, joue alors contre
lui.

Ces fonctions sont `SECURITY DEFINER` — elles s'exécutent avec les droits de
leur propriétaire. RLS ne les protège donc pas : **seul le droit d'exécution les
met hors de portée.**

### Cause

Deux sources de droits, qu'il fallait fermer toutes les deux :

1. PostgreSQL accorde `EXECUTE` à **PUBLIC** sur toute fonction créée ;
2. Supabase accorde `EXECUTE` **directement au rôle `anon`** via les privilèges
   par défaut du schéma `public`.

Une première correction ne révoquant qu'à `anon` (migration 020) fut donc sans
effet sur les fonctions dont PUBLIC détenait le droit ; une seconde ne révoquant
qu'à PUBLIC (migration 022) laissa intactes celles que Supabase avait accordées
nommément à `anon`. **Un droit ne se retire pas « en général » : il se retire à
chaque source qui l'accorde.**

### Décision

L'exécution est retirée à PUBLIC **et** à `anon`, puis accordée explicitement à
`authenticated` et `service_role`, fonction par fonction (migrations 022 et
023). Les privilèges par défaut du schéma `public` cessent d'accorder
l'exécution à `anon`, faute de quoi la correction serait à refaire à chaque
nouvelle fonction.

### Enseignement retenu

Un contrôle qui ne mesure que l'intention — la présence d'un `REVOKE` dans une
migration — ne prouve rien. Seul l'essai réel, mené avec la clé publique contre
la base déployée, fait foi. La recette `npm run verify:referential` exécute
désormais cet essai à chaque passage, et le contrôle sur `log_audit` a une
propriété utile : s'il échoue un jour, il laissera lui-même une trace
indélébile.

---

## DEC-023 — Convention des références de documents commerciaux

**Date :** 21 août 2026
**Portée :** métier et technique
**Statut :** convention **validée** · implémentation **reportée à l'Étape 2.5**

### 1. Convention générale

Les références des documents commerciaux suivent la forme :

```
[PRÉFIXE]-[TYPE]-[SÉRIE][NUMÉRO]
```

La série est alphabétique, le numéro tient sur quatre chiffres, et la série
s'incrémente lorsque le numéro est épuisé :

```
A0001 → A9999
B0001 → B9999
   …
Z0001 → Z9999
AA0001 → AB0001 → …
```

Modèle de référence retenu (convention BISWARA) :

```
BIS-DVCL-A0001      BIS-CMCL-A0001      BIS-BLCL-A0001
BIS-FACL-A0001      BIS-AVCL-A0001      BIS-ACCL-A0001
```

Capacité avant la première bascule à deux lettres : 26 × 9 999 ≈ **260 000
documents** par type.

### 2. Portée — ce que la convention ne couvre pas

**Elle ne s'applique pas aux référentiels.** Les identifiants internes des
clients, fournisseurs et véhicules restent ceux confirmés par **DEC-021 §1** :

```
CLI-000001      FOU-000001      VEH-000001
```

Décision **définitive pour l'Étape 2.2**. Aucun préfixe d'entreprise
(`ADK-CLI`…) n'est introduit.

La distinction est structurelle, pas cosmétique : une série existe pour
segmenter un flux d'émission et borner la longueur d'une référence imprimée.
Un client possède un identifiant unique, à vie, qui ne figure sur aucun
document contractuel.

### 3. Implémentation — reportée à l'Étape 2.5

Le moteur actuel (`next_number` / `numbering_rules`) **ne sait pas produire
cette forme** : il ignore le segment de type, ignore la série, et ne bascule
pas. Au-delà de 9 999, `lpad` n'écrête pas — le format se romprait
silencieusement en `…-A10000`, sans erreur ni alerte.

L'extension nécessaire est **additive** : trois colonnes nullables
(`type_code`, `series`, `series_capacity`) et une branche dans `next_number`.
Toute règle sans série continuerait de produire exactement ce qu'elle produit
aujourd'hui.

**Elle n'est pas développée maintenant** (CLAUDE.md §29 et §60) : aucun
document commercial n'existe avant l'Étape 2.5, et figer les codes de type
supposerait de décider quels documents ADIKOM émet réellement — décision non
mûre. L'implémentation aura lieu au développement des premiers documents.

Une contrainte à poser alors : **une règle utilise l'année ou la série, jamais
les deux.** Ce sont deux mécanismes de segmentation concurrents.

### 4. Factures — validation comptable obligatoire

La convention **supprime l'année** de la référence : `FAC-C-2026-000001`
devient `ADK-FACL-A0001`.

Pour une facture, ce n'est pas une question de forme mais de conformité :
selon le régime applicable, une numérotation peut devoir être séquentielle,
sans interruption, et rattachable à un exercice.

> **La convention définitive des références de factures — `FACL`, `FAFR` et
> tout document à valeur comptable — doit être validée par le responsable
> comptable et fiscal d'ADIKOM avant toute première émission.**

Aucune règle fiscale ou comptable n'est déduite, supposée ou inventée par le
système. Tant que cette validation n'a pas eu lieu, aucun format de facture
n'est figé. Les documents sans portée comptable (devis, commandes, bons de
livraison) ne sont pas concernés par cette réserve.

### 5. Codes de type — non figés

Les codes ci-dessous sont conservés comme **exemples de travail**, non comme
liste arrêtée :

| Document | Code de travail |
|---|---|
| Facture client | `FACL` |
| Facture fournisseur | `FAFR` |
| Avoir client | `AVCL` |
| Acompte client | `ACCL` |
| Règlement | `REGL` |

**Chaque nouveau type de document sera confirmé lors de son développement et
avant sa première émission.** Aucune liste exhaustive n'est arrêtée
aujourd'hui.

Le code de type est une **étiquette opaque**. Le système ne doit jamais tenter
de le décomposer, même lorsqu'il paraît structuré (`DV` + `CL`) : le jour où un
code déroge à la logique apparente, un analyseur mentirait.

### 6. Conséquence technique à retenir dès maintenant

**L'ordre alphabétique cesse de suivre l'ordre d'émission après `Z`.** En tri
texte, `AA0001` précède `B0001`, alors qu'il est émis bien après.

En conséquence : **aucune liste, aucun export, aucun état comptable ne doit
être trié sur la référence du document.** Le tri se fait sur la date
d'émission ou sur l'identifiant interne. La règle est posée maintenant afin de
ne pas être découverte le jour de la première bascule.

### 7. Effet sur DEC-005

Les formats par défaut de DEC-005 pour les objets datés — `FAC-C-2026-000001`,
`FAC-F-2026-000001`, `REG-2026-000001` — sont **provisoires** et seront revus
à l'Étape 2.5 selon la présente convention et la validation comptable du §4.
Les formats des référentiels (`CLI`, `FOU`, `VEH`) restent confirmés.

---

## DEC-024 — Attribution indépendante des capacités

**Date :** 22 août 2026
**Portée :** architecture — **règle permanente**
**Statut :** validée par ADIKOM

### Règle

> **Aucune fonctionnalité contrôlable par utilisateur ne doit être implicitement
> autorisée par une autre permission lorsqu'elle peut raisonnablement faire
> l'objet d'une attribution indépendante.**

Elle s'applique aux fonctionnalités actuelles **et à toutes les suivantes**.

### Ce qu'elle corrige

Les capacités transversales — exporter, télécharger, imprimer — étaient
implicitement incluses dans le droit de consulter. Un utilisateur autorisé à
voir une liste pouvait, de fait, en produire un fichier et l'emporter.

Ces trois actes ne sont pas la consultation : ils font sortir la donnée du
système. ADIKOM doit pouvoir accorder l'un sans les autres — par exemple
consulter et exporter une liste, sans pouvoir produire de document PDF.

### Application immédiate

L'action `DOWNLOAD` est ajoutée à `public.permission_action`, qui ne connaissait
que `EXPORT` et `PRINT` (migration 025).

**Treize permissions** sont créées (migration 026), portant le catalogue de
**135 à 148** :

| Menu | Ajouts |
|---|---|
| Clients | `download` · `print` |
| Fournisseurs | `download` · `print` |
| Partenariats | `export` · `download` · `print` |
| Parc automobile | `download` · `print` |
| Catégories | `export` |
| Tarification | `export` · `download` · `print` |

Aucune permission n'est créée pour une capacité qui n'existe pas : pas de fiche
PDF pour les catégories, rien pour la disponibilité — onglet de la fiche
véhicule — et rien pour les tarifs préférentiels, dont les capacités sont déjà
couvertes par `rental.pricing.*` et `parties.clients.pricing.*`.

### Sensibilité — un alignement décidé après inspection

`rental.fleet.export` était la seule permission d'export non sensible.
L'inspection du contenu réel de l'export a tranché : la liste du parc porte,
véhicule par véhicule, **le fournisseur ou le partenaire** qui le met à
disposition. Le fichier expose donc la cartographie des relations commerciales
d'ADIKOM — exactement ce qui rend l'export des fournisseurs sensible. Le laisser
non sensible aurait permis d'obtenir par le parc ce que l'on refuse par les
tiers.

Elle est alignée sur `true`. C'est la seule ligne existante modifiée.

Les nouvelles permissions sont sensibles pour les tiers et la tarification —
ces documents sortent avec des données personnelles ou commerciales — et non
sensibles pour le parc et les catégories. Total : **88 permissions sensibles**.

### Une limite énoncée, non masquée

**`print` sans `download` n'est pas une barrière technique.** Pour imprimer un
document, le navigateur doit l'avoir reçu, et ce qui est reçu peut être
enregistré. La distinction reste utile — bouton, route, journal d'audit — mais
elle ne résiste pas à un utilisateur déterminé.

En revanche, refuser **à la fois** `download` et `print` est une barrière
réelle : aucune route documentaire ne répond alors à cet utilisateur.

### Conséquences durables

- Toute nouvelle fonctionnalité passe par les six étapes consignées dans
  `CLAUDE.md` §19 bis.
- Le catalogue reste le miroir des capacités réelles : une permission ne se crée
  pas « au cas où ».
- Le contrôle de cohérence entre le catalogue SQL et les constantes TypeScript
  parcourt désormais **toutes** les migrations, et non un fichier nommé en dur —
  sans quoi il passerait à côté de chaque permission ajoutée après coup.

---

## DEC-025 — Cadrage de l'Étape 2.3 — cycle d'exploitation

**Date :** 24 août 2026
**Portée :** métier, technique et sécurité
**Statut :** validée par ADIKOM · **clôt DEC-014 pour le fuseau horaire**

### Contexte

L'Étape 2.2 — référentiel d'exploitation — est livrée. DEC-021 désigne l'Étape
2.3 : *Réservation → Contrat → Départ → Location en cours → Retour → Contrôle*.
Onze points restaient ouverts avant de pouvoir la construire sans inventer de
règle. Ils sont tranchés ici.

### a. Statuts « Expirée » et « En retard » — dérivés, jamais écrits

Le projet ne dispose d'aucun ordonnanceur : ni tâche planifiée Supabase, ni
cron. Un statut stocké qui dépendrait d'un travail non exécuté afficherait une
information fausse.

Les deux valeurs sont donc **calculées à l'affichage et au filtrage**, à partir
des dates et de l'heure courante. Elles figurent dans les énumérations par
fidélité à DEC-006, et resteront disponibles le jour où une tâche planifiée
existera. **Aucune infrastructure d'ordonnancement n'est créée pour elles.**

### b. Validation du contrôle — `rental.rentals.close`

La transition **À contrôler → À facturer** emploie `rental.rentals.close`.
Aucune permission `rental.rentals.control` n'est créée : le catalogue décrit ce
que le SaaS sait faire, et la clôture d'exploitation est bien l'acte demandé.

`Facturée` et `Clôturée` restent hors de l'Étape 2.3 : elles relèvent de
l'Étape 2.5.

### c. Le statut du véhicule ne pilote pas la disponibilité

Confirmation de `05_Regles_Metier/02_Parc_Automobile.md` §67 et de DEC-021 §5 :
**le statut décrit une situation, la disponibilité se calcule depuis le
calendrier.**

- une réservation, même confirmée, **ne change pas** le statut du véhicule ;
- le **départ** le porte à `En location` ;
- le **retour** le ramène à `Disponible`, sauf immobilisation ou autre état
  métier légitime.

Une réservation agit sur le calendrier, jamais sur le statut courant. La valeur
`RESERVED` de l'énumération n'est pas employée par le cycle.

### d. Historique des prolongations — journal d'audit seul

Aucune table dédiée. Le déclencheur d'audit de `rentals` conserve l'avant et
l'après de chaque prolongation, son auteur et son horodatage ; le motif est
porté par `status_reason`. Une table ne fournirait rien que le journal ne
contienne déjà (CLAUDE.md §29).

Une structure dédiée sera créée si, et seulement si, un historique consultable
**depuis la fiche location** devient nécessaire.

### e. Fuseau horaire — `Indian/Comoro`

**DEC-014 est close sur ce point.** Les horodatages sont stockés en UTC
(`timestamptz`) et interprétés sur `Indian/Comoro` (UTC+3) pour l'affichage,
les durées, les retards et le calendrier.

L'implémentation existe déjà en un seul point — `DISPLAY_TIMEZONE` dans
`src/lib/dates.ts` — et alimente le moteur documentaire et le moteur d'export.
**Aucune seconde implémentation n'est introduite.**

`company_settings.timezone` conserve la même valeur mais **n'est pas la source
active** : c'est un point d'extension, non câblé tant qu'aucun besoin ne
l'exige.

*Le régime de taxes reste ouvert dans DEC-014 : il n'est pas tranché ici.*

### f. Photos d'état des lieux — bucket existant, préfixe dédié

Aucun nouveau bucket. Les photos rejoignent `vehicle-documents`, **privé et
sans policy**, sous le préfixe :

```
inspections/{inspectionId}/{uuid}-{nom}
```

distinct de `{vehicleId}/…` employé par les documents du véhicule. Le préfixe
`inspections` ne peut entrer en collision avec un identifiant de véhicule,
lequel est un UUID.

Les photos sont rattachées à **l'état des lieux**, jamais au véhicule : une
photo de départ et une photo de retour ne disent pas la même chose. L'accès
reste indirect — action serveur, vérification de permission, URL signée de
courte durée. **Aucune URL permanente n'est stockée.**

### g. Tableau de location — inclus dans l'Étape 2.3

Version minimale et réellement exploitable : départs du jour, retours du jour,
locations en cours, locations en retard. Ni indicateurs, ni statistiques
avancées à ce stade. `/location` cesse d'être annoncé « à venir ».

### h. Signature électronique — hors système

Le système génère, prévisualise, télécharge et imprime le contrat. **La
signature s'effectue hors système.** Aucune table, aucun workflow, aucune
permission et aucune interface de signature ne sont créés.

### i. Contrôle de retour — constater, ne pas valoriser

Le contrôle compare le kilométrage, la distance parcourue, le carburant, les
états intérieur et extérieur, les dommages préexistants et les dommages
nouveaux, et signale les anomalies.

**Aucun montant n'est calculé.** Carburant manquant, kilométrage
supplémentaire, retard, franchise et dommages n'ont aucun barème défini
(DEC-008, toujours ouvert). L'écran distingue explicitement le **constat** de la
**valorisation**, celle-ci étant annoncée comme non configurée plutôt
qu'inventée. La valorisation sera traitée avant l'Étape 2.5.

### j. Capacités documentaires — six permissions

Réservations et locations n'avaient reçu aucune capacité documentaire lors de
la migration 026, faute d'existence fonctionnelle. L'Étape 2.3 produit des
documents contractuels et des listes exportables :

```
rental.reservations.export · .download · .print
rental.rentals.export      · .download · .print
```

Catalogue : **148 → 154**. DEC-024 s'applique intégralement — `view` reste exigé
**en plus**, les trois capacités sont indépendantes, aucune n'est impliquée par
une autre, et le contrôle est appliqué côté serveur comme sur les routes
directes. Toutes sont marquées sensibles : ces sorties portent l'identité du
client, la période et le montant verrouillé.

Trois documents seulement : **contrat de location**, **bon de départ**,
**procès-verbal de retour**. Aucun document de réservation — une réservation
n'est pas un engagement remis au client.

### k. Transitions imposées par la base

« Ne crée pas de raccourci qui permettrait de contourner les transitions
métier. » Les enchaînements de DEC-006 sont portés par des déclencheurs
`before update`, en plus des gardes serveur.

La distinction est nette et les deux barrières sont nécessaires : **une
permission dit qui peut agir, une transition dit ce qui a un sens.** Un appel
direct à l'API, muni de la bonne permission, ne peut pas pour autant faire
passer une location de « En préparation » à « À facturer ».

### Conséquences

- Migration **031** : types, quatre tables, contraintes, index, RLS, audit,
  interdiction de suppression, déclencheurs de transition et quatre opérations
  atomiques.
- Migration **032** : les six permissions.
- Aucun mécanisme existant n'est reconstruit : `vehicle_occupations`,
  `is_vehicle_available`, `vehicle_calendar`, `resolve_pricing_rule`,
  `next_number`, moteur documentaire et moteur d'export sont réemployés tels
  quels.

---

## DEC-026 — Imputation fournisseur (LOT 4 de l'Étape 2.4)

**Date :** 29 août 2026
**Portée :** métier, technique et sécurité
**Statut :** appliquée · **tranche une contradiction entre règles métier et DEC-013**

### Contexte

DEC-021 désigne l'Étape 2.4 : *Dommages → Incidents → Maintenance → Imputation
fournisseur*. Les LOTs 1 à 3 sont livrés. Le LOT 4 construit le dernier
maillon, sur un point de friction connu : **la facture fournisseur, dont
`Imputée` dépend, appartient à l'Étape 2.5 et n'existe pas.**

### a. Contradiction tranchée — quel statut réduit le montant dû

`05_Regles_Metier/04_Fournisseurs.md` §31 et `05_Regles_Metier/03_Finance.md`
§29 posent : « Montant brut − imputations **validées** = Net à payer ».

**DEC-013** pose : le montant dû est réduit **uniquement** au statut `Imputée`,
c'est-à-dire validée **et** rattachée à une facture fournisseur.

Les deux ne peuvent pas coexister : une imputation `Validée` sans facture
réduirait un solde selon les règles métier, et ne le réduirait pas selon
DEC-013.

**DEC-013 prévaut** (§1 du présent journal : une décision consignée ici est
postérieure et plus spécifique). Elle s'appuie elle-même sur `Workflow 06` §12
et §31, plus précis que les deux règles citées.

**Conséquence : le LOT 4 ne réduit aucun solde. Nulle part.**

### b. Le LOT 4 s'arrête à `Validée`

`Workflow 06` §31 nomme « **imputation en attente de facture** » ce que DEC-013
décrit comme validée sans facture rattachée. Ce n'est **pas un sixième
statut** : c'est la lecture de `VALIDATED` + `supplier_invoice_id IS NULL`.
L'état est **dérivé, jamais stocké** — un statut qui doublerait une donnée
existante pourrait la contredire.

`IMPUTED` figure dans l'énumération par fidélité à `Workflow 06` §13, et la
transition qui y mène est **refusée par la base, avec son motif**. Même
traitement que les statuts dérivés de **DEC-025 §a** : présents, non
atteignables, signalés. L'Étape 2.5 remplacera le déclencheur et rattachera
l'acte à sa capacité — comme elle devra le faire pour `TO_INVOICE → INVOICED`
et `INVOICED → CLOSED`, restées sans capacité depuis la migration 041.

### c. Le montant imputable est un plafond, jamais une copie

`Workflow 06` §37 distingue « montant autorisé à imputer » et « montant
effectivement imputé ». `Module 07` §40 et §41 imposent que la somme des
imputations ne dépasse pas le premier, **et que le contrôle soit fait côté
serveur**.

`maintenance_costs.imputable_amount` est donc **lu**, jamais recopié. La somme
exclut les imputations annulées : §40 pose que l'annulation réintègre le
montant, et §54 le montre chiffré.

Trois cas non documentés sont tranchés, sans barème inventé (**DEC-008**) :

| Cas | Décision |
|---|---|
| Montant imputable **non arrêté** | **Refus**, message explicite. Un plafond invisible n'est pas un plafond infini. |
| Montant imputable **nul** | **Refus** — `Workflow 06` §10 : « charge supportée par ADIKOM ». |
| **Abaisser** le plafond sous le déjà-imputé | **Refus** — sinon §40 serait violé sans qu'aucune imputation ne bouge. Le relèvement reste permis. |

### d. Quel fournisseur — §4 et §33

`Workflow 06` §4 désigne le fournisseur du véhicule ; §33 admet « **ou** qu'une
autre relation justifie l'imputation », sans la nommer.

Retenu : le fournisseur **actuel** du véhicule, **ou** l'un de ceux qui l'ont
fourni, que `vehicle_supplier_history` conserve précisément pour cela (`Règles
fournisseurs` §60 et §62). Un fournisseur sans aucune relation, présente ou
passée, avec le véhicule est exactement l'incohérence que §33 interdit : il est
refusé.

Le **prestataire** de la maintenance (`provider_supplier_id`) n'entre pas dans
ce calcul : `Workflow 05` §29 exige de le distinguer du fournisseur du
véhicule, **même quand c'est la même entité**.

### e. Aucune permission créée — catalogue à 153

`billing.imputations.view · create · update · validate · cancel` existent
depuis la migration 007, sous le commentaire « opération financière la plus
sensible du système ». Elles couvrent exactement ce que `Règles permissions`
§36 exige de distinguer.

**Soumettre à validation** relève de `billing.imputations.update` : c'est le
dernier geste de la préparation, que §38 range sous la modification. Aucune
capacité n'est créée pour lui — le catalogue décrit ce que le SaaS sait faire
(**DEC-024**, précédent **DEC-025 §b**).

Aucune capacité documentaire (`export`, `download`, `print`) n'est créée : le
LOT 4 ne produit ni export ni document. Une permission ne se crée pas « au cas
où ».

### f. La conséquence, assumée, du refus de `SECURITY DEFINER`

Les déclencheurs s'exécutent avec les droits de l'appelant, RLS comprise. Le
plafond vit dans `maintenance_costs` (lecture sous
`rental.maintenance.cost.view`), le rattachement fournisseur dans `vehicles`
(lecture sous `rental.fleet.view`). **Un appelant qui ne détient pas ces droits
ne lit rien — et le contrôle refuse, au lieu de passer sur une somme muette.**

`create_imputation` exige donc, nommément, `billing.imputations.create` **et**
`rental.maintenance.view` **et** `rental.maintenance.cost.view`. Ce n'est pas
une capacité impliquée par une autre : les trois sont attribuables séparément,
et la fonction les exige toutes les trois. **On n'impute pas une dépense qu'on
n'a pas le droit de voir.**

L'inverse est vrai aussi : `billing.imputations.view` **ne donne aucun accès**
aux coûts de maintenance. Les deux domaines restent des périmètres
d'attribution distincts.

### g. Verrouillage — §38 et §39

Une imputation `VALIDATED`, `IMPUTED` ou `CANCELLED` fige son montant, son
fournisseur, sa maintenance et sa justification. Ses **justificatifs** aussi :
§39 exige qu'une correction suive une procédure contrôlée, et une pièce ajoutée
après coup changerait ce sur quoi la validation a porté. Il n'existe **aucun
chemin de déverrouillage**. Reste l'annulation (§40), qui conserve
l'historique.

La **contrepassation** (§41) n'est pas implémentée : le document lui-même la
renvoie à « l'implémentation financière ». Elle relève de l'Étape 2.5.

### h. Ce que le LOT 4 ne fait pas

Aucune facture fournisseur, aucun paiement, aucun solde, aucun net à payer,
aucune clôture financière. Aucune valorisation d'un dommage. Aucun effet sur le
calendrier, le parc, la maintenance, la réservation ou la location.
`Workflow 05` §44 est respecté intégralement : **une opération ne déclenche
jamais automatiquement une autre opération métier.**

L'onglet **Imputations** de la fiche fournisseur affiche les totaux réellement
enregistrés — en attente de facture, en préparation — et **dit** que le montant
brut, le net à payer et le solde supposent des factures, qui viendront avec
l'Étape 2.5. Il n'affiche pas de zéro qui se lirait « rien à payer ».

### Conséquences

- Migration **046** : un type, deux tables, contraintes, index, quatre
  déclencheurs de contrôle, cinq fonctions atomiques `SECURITY INVOKER`, RLS,
  audit, interdiction de suppression, révocation d'`EXECUTE` à PUBLIC
  (**DEC-022**).
- Un déclencheur est ajouté à `maintenance_costs` (LOT 3) : le plafond ne
  descend plus sous le déjà-imputé.
- Aucune règle de numérotation créée : `imputation → IMP`, année, six chiffres,
  remise à zéro annuelle, enregistrée depuis la migration 005 et jamais
  consommée jusqu'ici.
- Recettes : `db:verify:imputations` (21 contrôles), `verify:imputations`
  (46 contrôles), et `verify:capabilities` porté de 40 à 67 contrôles.
- La recette du LOT 3 cesse d'exiger l'absence de la table `imputations` — le
  LOT 4 l'a livrée — et vérifie désormais que **saisir un coût n'en crée
  aucune**, ce qui est la garantie réellement en jeu (§44).

---

## DEC-027 — Facture fournisseur (LOT 5 de l'Étape 2.5)

**Date :** 30 août 2026
**Portée :** métier, technique et sécurité
**Statut :** appliquée · **ouvre l'effet financier réservé par DEC-013**

### Contexte

DEC-021 désigne l'Étape 2.5 : *Facturation → Paiements → Soldes → Clôture*. Le
LOT 4 s'est arrêté à `Validée` faute de facture fournisseur (DEC-026 §b). Le
LOT 5 livre cette facture, et **le rattachement** — c'est-à-dire le seul acte du
système qui réduise un montant dû.

### a. Le LOT 5 s'arrête avant le paiement

Le lot livre : la facture reçue, ses lignes, son cycle, le rattachement d'une
imputation, le détachement, le net à payer.

Il ne livre **ni règlement, ni compte financier, ni solde, ni clôture, ni
facture client, ni taxe** (DEC-014 : régime non défini). `Module 07 §57` pose
`Solde = Net à payer − Σ paiements validés` : la formule est respectée en
n'affichant **aucun** solde, plutôt qu'un zéro qui se lirait « rien à payer ».

`PARTIALLY_PAID` et `PAID` figurent à l'énumération par fidélité à `Module 07`
§31, et les transitions qui y mènent sont **refusées, avec leur motif** — même
traitement que `IMPUTED` au LOT 4. `OVERDUE` est **dérivé**, jamais écrit
(**DEC-025 §a** : aucun ordonnanceur n'existe), et une contrainte de base le
rend infalsifiable.

### b. Aucun montant n'est stocké — le brut est la somme des lignes

`Règles finance` §8 exige « une ou plusieurs lignes » ; `Module 07` §29 les cite
parmi ce que la facture contient. Une colonne `gross_amount` **et** des lignes
seraient deux sources du même chiffre, capables de diverger.

Le montant brut est donc **Σ des lignes actives**, le total imputé **Σ des
imputations « Imputée »**, le net à payer leur différence — trois soustractions
refaites à la lecture, comme le reste imputable du LOT 3.

`Règles fournisseurs` §11 — « le montant brut doit être conservé » — est
satisfait autrement qu'en le recopiant : **après validation, les lignes sont
figées**, sans chemin de déverrouillage.

Une ligne saisie par erreur **s'archive** et sort de la somme ; rien ne se
supprime (`CLAUDE.md` §22).

### c. Le véhicule est porté par la ligne, pas par l'en-tête

`Module 07` §28 relie une facture à un véhicule ; `Workflow 06` §21 montre un
même fournisseur facturant **plusieurs** véhicules. Le lien vit donc sur la
ligne : le poser sur l'en-tête imposerait un choix que le document ne fait pas.

La **maintenance** n'est pas rattachée à la ligne : `Workflow 06` §24 établit
déjà la chaîne *Fournisseur → Facture → Imputation → Maintenance → Véhicule*. La
doubler créerait deux chemins vers la même réponse, capables de se contredire.

### d. Quelle capacité porte le rattachement

Rattacher **n'écrit rien dans la facture** : son net à payer est une
soustraction, pas une colonne. L'acte modifie l'imputation seule, et porte donc
`billing.imputations.update` — la capacité qui porte déjà la soumission à
validation (**DEC-026 §e**). `billing.supplier_invoices.update` **n'est pas
exigée** : réclamer une capacité d'écriture pour une écriture qui n'a pas lieu
inventerait une règle.

En revanche, deux **lectures** sont exigées nommément —
`billing.supplier_invoices.view` et `billing.imputations.view` — parce que le
plafond de `Workflow 06` §20 se calcule sur elles. C'est la doctrine du LOT 4 :
**un plafond invisible n'est pas un plafond infini**.

Trois conditions de fond, toutes documentées :

| Règle | Source | Traitement |
|---|---|---|
| Facture **validée** seulement | §32 — « lorsque la facture existe déjà » | Refus sinon |
| **Même fournisseur** | §24 — la chaîne relie un fournisseur | Refus sinon |
| Σ imputé ≤ montant de la facture | §20 | Refus, **sans crédit ni report inventé** |

### e. Le détachement, à défaut de contrepassation

`Workflow 06` §41 renvoie la **contrepassation** à « l'implémentation
financière » : elle suppose des écritures que le système ne tient pas. §39 exige
pourtant qu'une correction suive une **procédure contrôlée**.

Le **détachement** est cette procédure : il rend l'imputation à « validée, en
attente de facture » — son état antérieur exact — et restitue le net à payer.
Il exige sa capacité, il est daté, il est audité, il n'efface rien.

Sans lui, une facture enregistrée par erreur deviendrait **définitivement
inannulable** et son imputation définitivement figée sur un document faux. Une
impasse n'est pas une garantie.

Conséquence symétrique : **une facture portant encore une imputation ne
s'annule pas.** L'annuler laisserait une déduction pesant sur un document
annulé — un montant déduit de rien. Le refus nomme le détachement comme issue.
Ce contrôle exige `billing.imputations.view` : on n'annule pas une facture dont
on ne peut pas voir les déductions.

### f. Une facture naît en brouillon — et une imputation aussi

Un déclencheur de transition ne s'exécute qu'à l'`UPDATE`. Un `INSERT` direct
portant `status = 'VALIDATED'` ne le rencontrerait **jamais** : la facture
naîtrait validée sans que `validate` ait été exigée, la policy d'insertion ne
demandant que `create`.

Ce chemin est fermé pour les deux tables. **Il était ouvert sur `imputations`
depuis le LOT 4** — angle mort de l'audit 041–042, qui n'avait éprouvé que les
transitions. Il est corrigé ici.

### g. Aucune permission créée — catalogue à 153

`billing.supplier_invoices.view · create · update · validate · cancel · export`
existent depuis la migration 007. **Soumettre au contrôle** relève d'`update`,
dernier geste de la saisie — même arbitrage qu'au LOT 4.

Aucune capacité documentaire (`download`, `print`) n'est créée : le LOT 5 ne
produit aucun document. L'export, lui, existait déjà et est implémenté.

### h. Numérotation — le format provisoire est conservé, délibérément

`DEC-023` §4 réserve la convention définitive des références de documents à
valeur comptable — `FACL`, **`FAFR`** et les autres — à la **validation du
responsable comptable et fiscal d'ADIKOM**, « avant toute première émission ».
Cette validation n'a pas eu lieu : elle reste le point 6 des décisions en
attente.

Le LOT 5 **n'implémente donc pas** le moteur de séries de DEC-023, et conserve
la règle `supplier_invoice` → `FAC-F`, année, six chiffres, remise à zéro
annuelle, enregistrée depuis la migration 005 et jamais consommée jusqu'ici.

Figer aujourd'hui le format d'un document comptable serait exactement ce que la
réserve interdit. Le format reste **paramétrable sans redéploiement** : la
convention définitive s'appliquera sans migration de code.

Un **numéro interne ADIKOM** et le **numéro porté par le document du
fournisseur** restent deux colonnes distinctes (`Module 07` §30).

### i. Ce qui n'a pas été décidé, et pourquoi

- **Unicité de la référence externe par fournisseur.** Enregistrer deux fois la
  même facture est un risque financier réel, mais aucune règle documentée ne
  l'interdit et une réémission légitime existe. Aucune contrainte n'est posée :
  **la signaler serait inventer une règle** (`CLAUDE.md` §55). Point à
  soumettre à ADIKOM.
- **Fournisseur inactif.** Une facture reçue d'un fournisseur devenu inactif
  reste une dette réelle : la refuser empêcherait de la payer. Le statut du
  fournisseur n'est donc pas contrôlé à l'enregistrement.
- **Génération du montant dû (DEC-007).** Toujours ouverte. Le LOT 5 applique le
  traitement déjà retenu par DEC-007 : **saisie manuelle**, sans périodicité ni
  calcul automatique. Aucun automatisme n'est développé.

### Conséquences

- Migration **047** : un type, deux tables, deux fonctions de calcul, contraintes,
  index, cinq déclencheurs de contrôle, neuf fonctions atomiques
  `SECURITY INVOKER`, RLS, audit, interdiction de suppression, révocation
  d'`EXECUTE` à PUBLIC (**DEC-022**).
- Les déclencheurs `fn_imputation_coherence` et `fn_imputation_transition` du
  LOT 4 sont **réécrits** : le refus de rattachement devient un contrôle.
- La clé étrangère `imputations.supplier_invoice_id → supplier_invoices` est
  posée : le point d'accroche devient une relation.
- Recettes : `db:verify:supplier-invoices` (20 contrôles),
  `verify:supplier-invoices`, et `verify:capabilities` porté de 67 à
  **94 contrôles**.
- Les recettes des LOTs 3 et 4 cessent d'exiger l'absence de
  `supplier_invoices` — le LOT 5 l'a livrée — et vérifient désormais ce qui
  reste en jeu : qu'aucun règlement n'existe, et que « Imputée » ne se déclare
  pas.

---

## DEC-028 — Unicité de la référence fournisseur

**Date :** 31 août 2026
**Portée :** métier et technique
**Statut :** appliquée · **clôt le point ouvert par DEC-027 §i**

### Décision d'ADIKOM

La référence portée par le document du fournisseur est **unique pour ce
fournisseur** :

- deux fournisseurs différents peuvent porter la même référence ;
- une seconde facture du **même** fournisseur portant la **même** référence est
  **refusée par la base**, avec un message explicite ;
- le refus et le cas positif sont l'un et l'autre éprouvés par les recettes.

### Deux couches, et ce que chacune garantit

| Couche | Garantit |
|---|---|
| **Déclencheur** | Le refus **nomme la facture existante** (`FAC-F-2026-000012`), ce qui permet de la retrouver. Un code d'erreur PostgreSQL ne l'aurait pas fait. |
| **Index unique partiel** | La règle tient **sans dépendre d'un droit de lecture**, et ferme la course entre deux saisies simultanées — qu'aucun déclencheur ne peut voir. |

Le déclencheur LIT `supplier_invoices` : un appelant sans
`billing.supplier_invoices.view` ne verrait rien et passerait. Contrairement au
plafond du LOT 4, cette cécité est ici **sans danger** — l'index arrête
l'écriture de toute façon. C'est pourquoi aucune capacité de lecture
supplémentaire n'est exigée pour enregistrer une facture.

### Portée — les factures annulées en sont exclues

La règle existe pour empêcher d'enregistrer **deux fois la même dette**, donc de
la payer deux fois. Une facture annulée n'est plus une dette : elle ne reçoit
plus d'imputation et ne sera jamais réglée.

L'y inclure créerait une **impasse** : rien ne se supprime dans ce système
(`CLAUDE.md` §22), et corriger une saisie erronée passe par l'annulation puis
une nouvelle saisie — qui porte forcément la **même** référence, celle imprimée
sur le document reçu. La règle interdirait exactement la correction qu'elle rend
nécessaire.

C'est le traitement déjà retenu pour les imputations annulées, qui sortent du
plafond de `Workflow 06` §40 : **ce qui est annulé cesse de compter.**

### Comparaison — casse et espaces de bordure ignorés

« FRN-2026-77 », « frn-2026-77 » et «  FRN-2026-77  » sont la même référence sur
le document reçu. Une règle sensible à la casse laisserait passer précisément le
doublon qu'elle prétend interdire.

La valeur **stockée** reste celle qui a été saisie : seule la **comparaison** est
normalisée. Le système n'écrit jamais autre chose que ce qu'il a lu.

### Ce que la règle ne fait pas

Elle ne rend pas la référence **obligatoire**. `Module 07` §30 la pose comme
facultative, et une facture reçue sans référence lisible reste une facture à
payer : plusieurs factures sans référence coexistent donc chez un même
fournisseur.

### Conséquences

- Migration **048** : un index unique partiel, un déclencheur, aucune permission
  créée — une règle d'intégrité n'est pas une capacité. Catalogue : 153.
- Le message de refus est rendu **au champ concerné** plutôt qu'en tête de
  formulaire (`CLAUDE.md` §39), en conservant le numéro de la facture existante.
- Recettes : `db:verify:supplier-invoices` porté de 20 à 21 contrôles (refus,
  variante de casse, second fournisseur accepté, référence libérée par
  l'annulation, `PATCH` direct refusé) ; `verify:supplier-invoices` porté de 33 à
  36 contrôles, dont le refus **vu à l'écran**.

---

## DEC-029 — Banques & Caisses et règlements fournisseurs (LOT 6)

**Date :** 31 août 2026
**Portée :** métier, technique et sécurité
**Statut :** appliquée · **ouvre le module 6, par nécessité**

### Contexte — une dépendance documentée, pas un élargissement

DEC-021 désigne l'Étape 2.5 : *Facturation → Paiements → Soldes → Clôture*. Le
LOT 5 a livré la facture. Le paiement, lui, ne peut pas exister seul :

> `Workflow 08` §13 — « Chaque paiement doit être associé au **compte financier**
> utilisé. »
> §46 — « Le module **Banques & Caisses** doit centraliser les comptes
> financiers. Le paiement utilise l'un de ces comptes. »
> §47 — un paiement fournisseur **diminue** le solde du compte.

Le socle du module 6 est donc livré **parce que le règlement ne peut pas s'en
passer**, et pas un objet de plus.

### a. Contradiction signalée, et tranchée par ADIKOM

§13 rend le compte obligatoire sans réserve. §45 range pourtant parmi les
incohérences « un paiement sans compte financier associé **lorsque celui-ci est
obligatoire** » — ce qui suppose des cas où il ne le serait pas.

**Arbitrage ADIKOM du 31/08/2026 :** le socle des comptes est livré avec les
règlements, dans un seul lot. §13 s'applique donc sans exception : **aucun
règlement n'existe sans compte mouvementé.**

### b. Aucun contrôle de découvert — arbitrage ADIKOM

Un règlement qui rendrait un compte négatif **n'est pas bloqué**. La
documentation ne définit ni découvert autorisé ni seuil, et `Module 06` §30 ne
pose ce contrôle que pour le **virement interne**.

Le solde est **affiché**, jamais opposé. Une règle de découvert sera ajoutée
quand ADIKOM l'aura définie (DEC-008). Un compte peut également **ouvrir à
découvert** : le solde initial accepte une valeur négative.

### c. Deux états de règlement, et le catalogue l'explique

`Workflow 08` §24 énumère Brouillon · En attente · Validé · Annulé, puis ajoute :
« Le statut définitif dépendra des règles d'implémentation. »

`billing.supplier_payments` n'expose que `view`, `create` et `cancel` : **aucune
capacité de validation**. Ce n'est pas un oubli — `billing.misc_payments` en
possède une. §56 pose d'ailleurs la séparation saisie/validation comme une
**faculté** : « ADIKOM **peut décider** de séparer… ».

Un règlement **constate un décaissement déjà effectué** (`Module 07` §35 : « les
paiements **effectués** aux fournisseurs »). Il naît validé et s'annule. Créer
une capacité de validation pour atteindre « Brouillon » et « En attente »
inventerait une organisation qu'ADIKOM n'a pas demandée (DEC-024).

*Si ADIKOM souhaite cette séparation, une capacité devra être créée : c'est une
décision d'organisation, pas un détail technique.*

### d. « Payée » et « Partiellement payée » restent DÉRIVÉES

`Module 07` §55 : « La logique doit être calculée automatiquement. »

Un statut stocké doublerait la somme qui le dit — les règlements validés — et
pourrait la contredire : il suffirait d'un règlement annulé pour qu'une facture
reste « Payée » sans l'être. Les deux états rejoignent donc « En retard »
(DEC-025 §a) : présents à l'énumération, **jamais écrits**, calculés à
l'affichage et au filtrage. Le refus de transition posé par le LOT 5 demeure ;
seul son motif change.

Conséquence : une facture **soldée** n'est jamais affichée « en retard », même
échéance dépassée. Le retard qualifie une dette qui court encore.

### e. Aucun montant financier n'est stocké — la règle tient

| Montant | Source |
|---|---|
| Solde d'un compte | solde initial + entrées − sorties (`Module 06` §17) |
| Total réglé d'une facture | Σ des règlements **validés** (`Workflow 08` §21) |
| Reste dû | net à payer − total réglé |

Un règlement **annulé** sort de la somme (§28), comme l'imputation annulée sort
du plafond (`Workflow 06` §40) et la ligne archivée du montant brut.

Le **solde initial** se fige dès la première écriture (`Module 06` §12) : le
corriger après coup déplacerait un solde sans qu'aucun mouvement ne l'explique,
ce que §17 proscrit.

### f. L'écriture est une conséquence, pas un second acte

Le règlement **produit** son écriture ; il ne l'écrit pas librement.
`treasury.entries.create` n'est donc pas exigée du payeur — même traitement que
l'occupation de calendrier posée par une maintenance, qui ne réclame aucune
capacité de calendrier.

La policy d'insertion des écritures le dit explicitement, et un déclencheur
vérifie que l'écriture **correspond** à son règlement : même compte, même
montant, sens SORTIE. Une écriture libre, elle, exige bien
`treasury.entries.create` — et aucun écran ne la produit.

### g. Cinq capacités pour régler, chacune nommée

`billing.supplier_payments.create` · `.view` · `billing.supplier_invoices.view` ·
`billing.imputations.view` · `treasury.accounts.view`.

Les quatre lectures ne sont pas du décor : §21 calcule le reste dû du **net**
après imputations, et §22 refuse ce qui le dépasse. Sans elles, le contrôle
porterait sur des sommes muettes et laisserait passer exactement ce qu'il doit
refuser.

### h. Un défaut trouvé par l'audit, corrigé avant livraison

La migration 049 n'exigeait que `treasury.balances.view` pour calculer un solde.
Or la somme porte sur `treasury_entries`, lues **sous RLS** : un porteur de cette
seule capacité ne voyait aucune écriture, et la fonction lui renvoyait le
**solde d'ouverture** — un nombre faux, présenté comme un solde.

`verify:capabilities` l'a révélé : un compte débité de 120 000 KMF affichait
encore 1 000 000, **sans la moindre erreur**.

La migration **050** exige `treasury.entries.view` en plus. C'est la conséquence
assumée du refus de `SECURITY DEFINER` (DEC-022, DEC-026 §f) : une fonction qui
s'exécute avec les droits de l'appelant doit **refuser**, jamais répondre à
côté. `treasury.balances.view` reste une capacité distincte — elle interdit le
solde à qui ne l'a pas — mais elle ne se donne plus seule.

### i. Ce que le LOT 6 ne fait pas

Aucun **virement interne** (`Module 06` §28 à §33), aucun **rapprochement**
bancaire ou de caisse (§42 : « rapprochement **futur** »), aucun tableau de bord
financier, aucun seuil d'alerte. Aucune **écriture libre** — dépôt et retrait
figurent au vocabulaire de §20, mais aucun écran ne les produit. Aucun
**règlement client**, aucun **paiement divers** : la facture client n'existe
pas. Aucun **justificatif** de règlement (`Workflow 08` §17, facultatif).

### Conséquences

- Migrations **049** et **050** : sept types, trois tables, deux fonctions de
  calcul, huit déclencheurs, sept fonctions atomiques `SECURITY INVOKER`, RLS,
  audit, interdiction de suppression, révocation d'`EXECUTE` à PUBLIC.
- **Aucune permission créée** — les dix codes employés existent depuis la
  migration 007. Catalogue : 153, inchangé.
- Menus **Comptes** et **Écritures** ouverts ; onglet **Règlements** de la fiche
  fournisseur livré ; export des écritures sous `treasury.entries.export`.
- Recettes : `db:verify:treasury` (19 contrôles), `verify:treasury`, et
  `verify:capabilities` porté de 94 à **118 contrôles**.
- Les recettes des LOTs 3, 4 et 5 cessent d'exiger l'absence de
  `supplier_payments` et `financial_accounts` — le LOT 6 les a livrés — et
  vérifient désormais que la **facturation client** reste hors périmètre, et
  qu'aucun solde n'est stocké.

---

## DEC-030 — Facture client et clôture de la location (LOT 7)

**Date :** 1er septembre 2026
**Portée :** métier, technique et sécurité
**Statut :** appliquée · **clôt le cycle d'exploitation de DEC-006**

### Contexte — un point ouvert depuis la migration 042

DEC-021 désigne l'Étape 2.5 : *Facturation → Paiements → Soldes → Clôture*. Les
LOTs 5 et 6 ont livré la facture fournisseur et son règlement. Restait le côté
client — et deux transitions que la migration 042 avait laissées **sans capacité
rattachée**, en le signalant :

> « `INVOICED` et `CLOSED` appartiennent à l'Étape 2.5 : aucune capacité ne leur
> correspond, et en désigner une serait inventer une règle. Elles restent
> protégées par la seule policy — **point ouvert, signalé**. »

Le LOT 7 referme ce point : la facture client existe, et c'est son **émission**
qui rend une location « Facturée ».

### a. La clôture n'attend pas le paiement — la documentation le dit

`Workflow 01` §42 est explicite :

> « Une location peut être clôturée **opérationnellement** même si la facture
> n'est pas encore entièrement payée. Le système doit conserver les deux
> informations séparément. »

La clôture entre donc dans ce lot, **avant** les encaissements clients, sans
inverser l'ordre de DEC-021 : elle ne dépend pas d'eux. Exiger un règlement
inventerait une règle que la documentation écarte nommément.

### b. La valorisation ne s'invente pas — le tarif est repris, la durée est saisie

`Workflow 07` §9 : « Les règles de calcul doivent être définies explicitement et
**ne doivent pas être inventées par le système**. » §12 le répète pour le retard.

Le **tarif** est repris de la location, où il est verrouillé depuis sa création
(§7, §8) : le reprendre n'invente rien, c'est le contraire — le recalculer
exposerait la facture à une modification de grille intervenue depuis.

La **quantité**, elle, reste saisie. La durée facturable dépend d'une règle
d'arrondi qui n'est pas arrêtée (DEC-008 : jour entamé, heure de retour,
franchise — tous « non définis »). L'écran affiche le prix unitaire pré-rempli et
la quantité **vide**, et dit pourquoi. C'est la doctrine de DEC-025 §i : le
constat est distingué de la valorisation, celle-ci étant annoncée comme non
configurée plutôt qu'inventée.

### c. Une réduction est une LIGNE, jamais un prix modifié

`Workflow 07` §24 : « Une réduction accordée au client doit être identifiable.
Elle ne doit pas simplement apparaître comme une **modification inexplicable du
prix**. » §23 la range parmi les composantes que la facture distingue.

Quatre natures de ligne sont donc posées — **location, service, frais,
réduction** — correspondant exactement à §18, §14, §15 et §24. Une réduction
porte un montant **positif** et se soustrait : le sens est porté par la nature,
jamais par le signe, comme une écriture de trésorerie porte son sens et non un
montant négatif (`Module 06` §19).

Une réduction supérieure au sous-total est **refusée** : elle produirait un
avoir, que §44 renvoie à des règles qu'ADIKOM n'a pas arrêtées. Le système ne le
fabriquera pas par accident.

### d. Aucun montant n'est stocké — la règle tient

| Montant | Source |
|---|---|
| Sous-total | Σ (quantité × prix) des lignes actives qui ajoutent |
| Réductions | Σ des lignes actives de type « réduction » (§24) |
| Total | Sous-total − réductions (§23) |
| Encaissé | **N'existe pas** — les règlements clients relèvent du LOT 8 |

Le **total de ligne** lui-même n'est pas une colonne : quantité × prix se refait
à la lecture. §8 et §72 — « une facture émise ne doit pas être recalculée
automatiquement » — sont satisfaits autrement qu'en recopiant : **après émission,
les lignes sont figées**, sans chemin de déverrouillage.

### e. « Payée », « Partiellement payée » et « En retard » restent DÉRIVÉES

`Workflow 07` §61 : « Le statut doit être calculé à partir des règlements
réellement enregistrés. » Les encaissements clients n'existant pas, les deux
premiers ne sont **jamais atteignables**, et les transitions qui y mènent sont
refusées avec leur motif — même traitement qu'« Imputée » au LOT 4 et que
« Payée » au LOT 5. `OVERDUE` rejoint DEC-025 §a : dérivé de l'échéance, jamais
écrit, et une contrainte le rend infalsifiable.

Conséquence assumée : **aucune facture client n'est aujourd'hui affichée
« payée »**, et le solde n'est pas calculé. L'écran le DIT, plutôt que d'afficher
un zéro qui se lirait « rien à encaisser » (DEC-017).

### f. « Facturée » est une CONSÉQUENCE, pas un second acte

Émettre la facture rend la location « Facturée ». `rental.rentals.update` n'est
donc **pas** exigée du facturier : le contrat ne change pas d'état parce qu'on
l'a décidé, mais parce que sa facture existe — même doctrine que l'écriture
produite par un règlement (DEC-029 §f) ou que l'occupation de calendrier posée
par une maintenance.

La policy d'UPDATE de `rentals` s'ouvre en conséquence aux deux capacités de
facturation ; c'est le **déclencheur de transition** qui exige, lui, la capacité
correspondant à l'acte réellement demandé (migration 041 : « une policy large
n'est pas une permission d'acte »).

`rental.rentals.view` est en revanche exigée **nommément** : la fonction lit le
contrat pour vérifier son état, et sous RLS un appelant qui ne peut pas le lire
obtiendrait un « introuvable » qui n'expliquerait rien.

**Trois capacités mènent désormais à ces états, et chacune est nommée :**

| Transition | Capacité | Pourquoi |
|---|---|---|
| `À facturer → Facturée` | `billing.customer_invoices.issue` | l'émission de la facture |
| `Facturée → Clôturée` | `rental.rentals.close` | acte d'exploitation, au catalogue depuis la migration 007 |
| `Facturée → À facturer` | `billing.customer_invoices.cancel` | l'annulation rend le contrat à son état antérieur |

### g. L'annulation est réversible pour la location, sauf après clôture

Sans retour en arrière, une facture émise par erreur enfermerait le contrat dans
« Facturée » **sans facture** : il ne pourrait plus ni être refacturé ni être
clôturé. « Une impasse n'est pas une garantie » (DEC-027 §e). L'annulation rend
donc la location à « À facturer », et une nouvelle facture peut être émise.

Une location **clôturée** ne se rouvre pas pour autant : la clôture a constaté
que le dossier était traité (`Workflow 01` §41). Permettre de la défaire ferait
décider d'un acte d'exploitation à qui ne détient qu'une capacité de
facturation. Le refus le dit, et nomme l'ordre à suivre.

Corollaire : **une location ne se facture pas deux fois**. Un index unique
partiel l'interdit sans dépendre d'un droit de lecture, et ferme la course entre
deux saisies simultanées. Les factures **annulées** en sont exclues — sans quoi
la règle interdirait exactement la correction qu'elle rend nécessaire (DEC-028).

### h. Ce que le LOT 7 ne fait pas

Aucun **règlement client**, aucun encaissement, aucun solde client — ils
relèvent du LOT 8. Aucun **avoir** ni **contrepassation** (§43, §44 : la méthode
exacte « dépendra des règles de gestion retenues par ADIKOM »). Aucune **taxe**
(DEC-014 : régime non défini). Aucune **statistique** ni **rapport** (§55, §56).
Aucun **document** : voir §i.

### i. Point signalé, non tranché — le document de la facture client

Le catalogue porte `billing.customer_invoices.print` mais **pas**
`.download`. DEC-024 interdit de déduire l'une de l'autre : télécharger et
imprimer sont deux capacités distinctes, et créer une permission d'office est
proscrit (`CLAUDE.md` §19 bis, étape 2).

Le LOT 7 **ne produit donc aucun document PDF**. Le jour où ADIKOM voudra
remettre sa facture au client, `billing.customer_invoices.download` devra être
créée — c'est une décision de capacité, pas un détail technique. Le point est
ajouté aux arbitrages en attente.

### Conséquences

- Migration **052** : deux types, deux tables, trois fonctions de calcul,
  contraintes, index dont un **unique partiel**, quatre déclencheurs de
  contrôle, sept fonctions atomiques `SECURITY INVOKER`, RLS, audit,
  interdiction de suppression, révocation d'`EXECUTE` à PUBLIC (DEC-022).
- `fn_rental_status_transition` est **réécrite** : les deux transitions
  orphelines de la migration 042 reçoivent leur capacité, et
  `INVOICED → TO_INVOICE` est ouverte pour l'annulation.
- La policy `rentals_update` s'ouvre à `customer_invoices.issue` et `.cancel`.
- **Aucune permission créée** — les sept codes `billing.customer_invoices.*` et
  `rental.rentals.close` existent depuis la migration 007. Catalogue : 153,
  inchangé.
- Menu **Factures clients** ouvert ; onglet **Factures** de la fiche client
  livré ; carte **Facturation** et acte de **clôture** sur la fiche de location ;
  export sous `billing.customer_invoices.export`.
- Recettes : `db:verify:customer-invoices` (20 contrôles),
  `verify:customer-invoices`, et `verify:capabilities` porté de 118 à
  **143 contrôles**.
- Les recettes des LOTs 3, 4 et 5 cessent d'exiger l'absence de
  `customer_invoices` — le LOT 7 l'a livrée — et vérifient désormais que
  l'**encaissement client** reste hors périmètre.
- La recette de l'Étape 2.2 (`db:verify:location`, §14) cessait de passer depuis
  que les données DEMO portent un tarif standard global : elle exigeait une
  grille **vide** là où elle doit exiger qu'**aucun tarif spécifique ne
  s'invente**. Défaut de recette antérieur au LOT 7, corrigé ici.

---

## DEC-031 — Règlements clients et solde des créances (LOT 8)

**Date :** 2 septembre 2026
**Portée :** métier, technique et sécurité
**Statut :** appliquée · **achève l'Étape 2.5 de DEC-021**

### Contexte — le dernier maillon financier

DEC-021 désigne l'Étape 2.5 : *Facturation → Paiements → Soldes → Clôture*. Les
LOTs 5 et 6 ont livré la facture fournisseur et son règlement, le LOT 7 la
facture client. Restait ce que le client verse — et sans quoi une créance
reconnue ne pouvait pas être dite soldée :

> DEC-030 §h : « Aucun **règlement client**, aucun encaissement, aucun solde
> client — ils relèvent du LOT 8. »

### a. Un encaissement est l'exact miroir d'un décaissement

`Workflow 08` §47 est explicite :

> « Lorsqu'un paiement client est encaissé : **Banque/Caisse augmente**. »

L'écriture produite est donc une **ENTRÉE**, là où le règlement fournisseur
produit une sortie. Le sens est porté par le sens, jamais par le signe du
montant (`Module 06` §19) — et un déclencheur vérifie que l'écriture correspond
bien au règlement dont elle se réclame, dans le bon sens.

Comme au LOT 6, l'écriture est une **conséquence**, pas un second acte :
`treasury.entries.create` n'est pas exigée du caissier. Une écriture **libre**,
elle, le reste — et la recette le prouve dans les deux sens.

### b. Le trop-perçu est REFUSÉ, parce qu'aucune règle ne le traite

`Workflow 08` §40 :

> « Si un client verse un montant supérieur à une facture, le système doit
> appliquer **une règle définie par ADIKOM**. […] Le système **ne doit pas
> décider automatiquement sans règle métier**. »

Les trois issues que §40 envisage — affectation à une autre facture, conservation
en avance, autre règle — dépendent toutes de décisions qui n'existent pas :
§37 (répartition sur plusieurs factures) et §41 (avance client) sont l'une
comme l'autre assorties de « **lorsque cette fonctionnalité est retenue** ».

Un versement supérieur au solde est donc **refusé**, et le refus DIT pourquoi.
Le système ne fabrique ni avoir ni avance par accident. Même traitement qu'au
LOT 6 pour le dépassement du reste dû fournisseur (§22).

### c. Seule une facture ÉMISE s'encaisse

Un brouillon ne reconnaît aucune créance (§25) ; une facture annulée n'en
reconnaît plus. Encaisser l'un ou l'autre enregistrerait de l'argent reçu sur
une créance qui n'existe pas. Symétrique du LOT 6, où seule une facture
**validée** se règle.

### d. « Payée » et « Partiellement payée » deviennent LISIBLES — et restent DÉRIVÉES

`Workflow 07` §61 : « Le statut doit être calculé à partir des règlements
réellement enregistrés. »

Le LOT 7 refusait ces deux transitions faute de règlements. Ils existent : le
refus **demeure**, et seul son motif change. Un statut stocké doublerait la
somme qui le dit et pourrait la contredire — il suffirait d'un règlement annulé
pour qu'une facture reste « Payée » sans l'être. Même doctrine qu'au LOT 6
(DEC-029 §d).

Conséquence : **aucune facture ne porte « Payée » en base**. L'écran l'affiche,
la base non — et une recette le vérifie explicitement.

| Montant | Source |
|---|---|
| Sous-total | Σ (quantité × prix) des lignes actives qui ajoutent |
| Réductions | Σ des lignes actives de type « réduction » (§24) |
| Total | Sous-total − réductions (§23) |
| **Encaissé** | **Σ des règlements VALIDÉS** (Workflow 08 §21, §28) |
| **Solde** | **Total − encaissé** |

Aucun de ces montants n'est stocké. Un encaissement **illisible** vaut `null`,
jamais 0 : l'écran DIT qu'il ne sait pas (DEC-017, DEC-024).

### e. Une facture encaissée ne s'annule pas

L'argent est **entré** sur un compte : l'annuler laisserait un encaissement
pesant sur un document annulé. Les règlements s'annulent d'abord, et le refus
nomme l'ordre à suivre — symétrique exact de la règle posée au LOT 6 pour la
facture fournisseur réglée.

Corollaire assumé : **annuler une facture client exige désormais
`billing.customer_payments.view`**. Sans ce droit, la somme encaissée vaudrait 0
sous RLS et l'annulation passerait sur une facture pourtant réglée. « Une somme
illisible n'est pas une somme nulle » (DEC-026 §f).

### f. La numérotation n'invente aucun format

La règle `payment` — « Règlement », `REG`, année, six chiffres, remise à zéro
annuelle — existe depuis la migration 005 et sert déjà les règlements
fournisseurs. Elle est **générique**. En créer une seconde inventerait un format
que DEC-005 n'a pas arrêté : la série reste unique, et demeure paramétrable si
ADIKOM veut l'en séparer.

### g. Un défaut trouvé par l'audit, corrigé avant livraison

L'audit des capacités a révélé un défaut **antérieur au LOT 8**, présent depuis
le LOT 6 : `cancel_supplier_payment` — et sa jumelle client — annulait le
règlement **sans annuler son écriture** lorsque l'appelant ne détenait pas
`treasury.entries.view`.

Sous RLS, un `UPDATE … WHERE` **lit** les lignes qu'il vise : la policy de
SELECT de `treasury_entries` s'applique en plus de celle d'UPDATE. Sans ce
droit, l'`UPDATE` ne trouvait aucune écriture — et n'en disait rien. Le
règlement passait « Annulé », le compte gardait son mouvement.

`Workflow 08` §45 nomme précisément cette incohérence : « un paiement annulé
continue d'être comptabilisé ».

**Migration 054** : les deux annulations exigent `treasury.entries.view`
nommément, et **vérifient** qu'aucune écriture validée ne subsiste — refusant
en bloc plutôt que de réussir à moitié. C'est la leçon de la migration 050,
sous une autre forme : une écriture invisible n'est pas une écriture
inexistante.

Le défaut n'avait jamais été vu parce que le profil qui l'éprouvait portait
`treasury.entries.view` par ailleurs. Un profil **complet** ne trouve pas ce
genre de défaut ; un profil **minimal**, oui.

### h. Ce que le LOT 8 ne fait pas

Aucune **avance client** (§41), aucune **affectation d'avance** (§42), aucune
**répartition** d'un versement sur plusieurs factures (§37) — les trois sont
assorties de « lorsque cette fonctionnalité est retenue ». Aucun **avoir**
(Workflow 07 §44). Aucun **rapprochement** bancaire ou de caisse (§43, §44 ;
`Module 06` §42 : « rapprochement futur »). Aucune **écriture libre** — dépôt,
retrait, virement interne restent hors périmètre. Aucune **taxe** (DEC-014).
Aucun **document** de reçu : `billing.customer_payments` n'expose ni `.download`
ni `.print`, et en créer une d'office est proscrit (DEC-024).

### Conséquences

- Migration **053** : un type, une table, une colonne d'origine sur les
  écritures avec sa contrainte d'unicité d'origine, une fonction de calcul,
  deux fonctions atomiques `SECURITY INVOKER`, cinq déclencheurs, RLS, audit,
  interdiction de suppression, révocation d'`EXECUTE` à PUBLIC (DEC-022).
- Migration **054** : correction du défaut §g, sur les **deux** annulations.
- `fn_treasury_entry_source` et `fn_treasury_entry_immutable` sont **réécrites** :
  elles connaissent les deux origines, et refusent qu'une écriture s'en réclame
  de deux.
- `fn_customer_invoice_transition` est **réécrite** : le refus de « Payée »
  change de motif, pas de nature.
- **Aucune permission créée** — les trois codes `billing.customer_payments.*`
  existent depuis la migration 007. Catalogue : 153, inchangé.
- Onglet **Paiements** de la fiche client ouvert (Workflow 08 §32) ; carte
  **Règlements** et acte d'encaissement sur la fiche de facture ; colonne
  **Solde** dans la liste ; colonnes **Encaissé** et **Solde** à l'export, sous
  `billing.customer_payments.view`.
- Le vocabulaire des **modes de paiement** rejoint `features/treasury` : il
  appartient au mouvement, non au sens dans lequel il va.
- Recettes : `db:verify:customer-payments` (18 contrôles),
  `verify:customer-payments`, et `verify:capabilities` porté de 143 à
  **164 contrôles**.
- Les recettes des LOTs 3, 4 et 5 cessent d'exiger l'absence de
  `customer_payments` — le LOT 8 l'a livrée — et vérifient désormais que
  l'**avance client** et la **répartition** restent hors périmètre. Celle du
  LOT 7 mesure l'absence d'encaissement **sur sa propre facture**, non sur
  toute la base.

---

## DEC-032 — Tableau de bord de pilotage (LOT 9)

**Date :** 2 septembre 2026
**Portée :** métier, technique et sécurité
**Statut :** appliquée · **ouvre la Phase 3 — Pilotage**

### Contexte — le premier écran, resté vide le plus longtemps

DEC-021 découpe la Phase 2 jusqu'à l'Étape 2.5, achevée par DEC-031. `README`
§73 et `CLAUDE.md` §61 désignent la suite : **Phase 3 — Pilotage**, dont le
tableau de bord est la porte d'entrée.

Il existait depuis l'Étape 1, mais n'affichait aucun chiffre — délibérément :

> « Aucune donnée fictive ne doit être affichée » (`Module 01` §6) ; « les
> indicateurs seront alimentés au fur et à mesure de la mise en service des
> modules ».

Les modules sont livrés. Le LOT 9 branche les indicateurs sur les données
réelles, et rien d'autre.

### a. Le tableau de bord ne stocke aucun indicateur

Aucune table, aucune colonne, aucun statut. Un indicateur stocké devrait être
tenu à jour, et un indicateur périmé est un indicateur **faux**. Chaque chiffre
est refait à la lecture, sur les mêmes fonctions que les fiches et les listes —
`customer_invoice_total`, `customer_invoice_paid`, `supplier_invoice_gross`,
`supplier_invoice_imputed`, `supplier_invoice_paid`, `financial_account_balance`.

**Le pilotage ne connaît donc aucune arithmétique qui lui soit propre.** Il
assemble ce que les modules savent déjà dire. C'est la doctrine du Tableau de
location (LOT 1), étendue à l'argent.

### b. Une somme lue par pages est une somme fausse

Les listes de l'application s'arrêtent à 200 lignes : parfait pour un écran,
**faux pour un total**. Compter côté application aurait produit un chiffre
d'affaires silencieusement tronqué dès la 201ᵉ facture.

**Migration 055** : sept fonctions `SECURITY INVOKER`, `stable`, qui somment sur
l'ensemble des lignes **visibles par l'appelant**, sans pagination.

C'est la leçon de la migration 050 — « un solde ne se calcule pas sur des
écritures illisibles » — appliquée au pilotage. Une somme partielle présentée
comme un total est pire qu'un refus.

### c. Les trois capacités du tableau de bord composent, elles n'ouvrent rien

`dashboard.view`, `dashboard.financial.view` et `dashboard.fleet.view` existent
au catalogue depuis la migration 007. **Elles n'avaient jusqu'ici aucun contrôle
serveur** — elles ne faisaient que masquer des cartes, et `Module 01` §28
l'interdit : « même si un indicateur est masqué dans l'interface, les données
correspondantes doivent rester protégées ».

Le LOT 9 leur donne ce contrôle. Les sept fonctions exigent `dashboard.view` ;
l'état du parc exige en plus `dashboard.fleet.view` ; les quatre sommes
financières `dashboard.financial.view`.

**Et la capacité source reste exigée en plus, dans les deux sens** (DEC-024) :

| Capacités détenues | Résultat |
| --- | --- |
| `dashboard.fleet.view` seule | **refus** — la synthèse ne donne pas accès aux véhicules |
| `rental.fleet.view` seule | **refus** — voir les véhicules n'autorise pas la synthèse |
| les deux | l'état du parc répond |

Aucune ne rend l'autre superflue. C'est exactement ce que DEC-024 demande :
« aucune fonctionnalité contrôlable par utilisateur ne doit être implicitement
autorisée par une autre permission ».

### d. Une somme muette est refusée, jamais approchée

Le point le plus sensible du lot, et il concerne la règle fondatrice d'ADIKOM.

La dette fournisseur vaut **brut − imputé − payé**. Un lecteur qui verrait les
factures et les règlements mais **pas les imputations** obtiendrait, sous la
seule RLS, un imputé de zéro : le tableau de bord annoncerait **1 000 000 KMF**
là où ADIKOM ne doit que **500 000**.

`CLAUDE.md` §57 : « une imputation de maintenance fournisseur ne doit pas être
enregistrée comme un paiement » — et elle ne doit pas non plus pouvoir être
**ignorée**.

`dashboard_supplier_payables` exige donc les trois lectures et **refuse** sinon.
Même règle côté client : sans `billing.customer_payments.view`, la créance
vaudrait le total facturé et se lirait « rien n'a été payé ».

### e. La période est un mois civil, sur le fuseau d'ADIKOM

`Module 01` §8 laisse le choix des périodes. Cinq sont retenues : aujourd'hui,
cette semaine, ce mois — **par défaut** —, ce trimestre, cette année.

Ce sont des périodes **civiles**, jamais des fenêtres glissantes : « ce mois »
ne veut pas dire « les trente derniers jours ». Un cumul qui recule d'un jour
chaque nuit ne se compare à rien et ne se rapproche d'aucun relevé.

Les bornes sont calculées sur `Indian/Comoro` (DEC-025 §e). L'application
s'exécute en UTC sur Vercel : le 1er du mois à 01:00 aux Comores, le serveur est
encore au 31 du mois précédent. Sans ce soin, le tableau de bord afficherait le
mois écoulé pendant les trois premières heures de chaque mois — et l'année
écoulée pendant les trois premières heures de chaque année.

**La période ne s'applique pas à tout.** Les files d'attente, l'état du parc et
les créances sont des **situations actuelles** : ce que le client doit, il le
doit quelle que soit la fenêtre affichée. `Module 01` §8 le dit : le filtre ne
doit servir que « lorsqu'il apporte une valeur réelle ». L'écran nomme cette
distinction plutôt que de la laisser deviner.

### f. Trois réponses, jamais deux

Chaque indicateur rend l'un de trois états : la **valeur**, un **refus de
droit** — qui nomme la capacité manquante —, ou une **erreur de chargement**.

Un zéro ne dit aucune des trois choses. « 0 facture en retard » est une bonne
nouvelle ; « je n'ai pas le droit de compter les factures » n'en est pas une
(DEC-017). Et `Module 01` §26 l'ajoute : le système « ne doit pas afficher de
données inventées pour masquer une erreur de chargement ».

Les erreurs sont donc capturées **indicateur par indicateur** : une section en
échec ne peut pas emporter la page — qui est l'écran d'atterrissage après
connexion.

Lorsque **rien** n'est ouvert, l'écran le dit en toutes lettres : *« il n'est
pas vide : il est fermé »*.

### g. Les actions rapides : deux règles, et aucune troisième

`Module 01` §22 : « une action non autorisée ne doit pas être proposée ». Le
LOT 9 y ajoute une seconde condition : **l'écran de destination doit exister**.

Deux gestes pourtant réels en sont donc absents : créer une **location** —
elle naît d'une réservation, et son geste vit sur la fiche de celle-ci — et
**encaisser un règlement**, qui appartient à la facture qu'il solde (LOT 8). Les
proposer obligerait à inventer un écran d'entrée que le cycle documenté ne
prévoit pas.

### h. Ce que le LOT 9 ne fait pas

**Aucune « activité récente »** (`Module 01` §21). Les dernières opérations
importantes existent — c'est le journal d'audit — mais son écran n'est pas
livré : `/utilisateurs/journal` relève de la **Phase 4**. Le §21 dit « doit
pouvoir présenter », et le §33 ne le compte pas parmi les critères
d'acceptation. Il attend donc son module.

**Aucune personnalisation par rôle** au-delà des permissions (§3). Le tableau de
bord se construit « à partir des données auxquelles l'utilisateur est réellement
autorisé à accéder » — ce qui est fait — mais aucune disposition différente
n'est livrée par métier. Y ajouter des dispositions supposerait de savoir
lesquelles : c'est une décision ADIKOM, pas une déduction.

**Aucun graphique** (§12 : « une représentation graphique **peut** être
utilisée »). Sept nombres cliquables disent l'état du parc plus vite qu'un
camembert, et `CLAUDE.md` §41 proscrit les graphiques décoratifs.

**Aucune notification** : le Centre de notifications est un module à part
(Module 02), et rien de ce lot ne l'anticipe.

**Aucun rapport, aucun export, aucune impression** du tableau de bord. Aucune
capacité `dashboard.export`, `.download` ou `.print` n'est créée : en créer une
d'office est proscrit (DEC-024). Le catalogue reste à **153**.

**Aucune actualisation automatique** (§24 : « éviter de donner l'impression
qu'une donnée est en temps réel si elle ne l'est pas »). La page est rendue à
chaque visite, jamais mise en cache ; l'actualisation manuelle est celle du
navigateur.

**Aucun trop-perçu, aucune avance** : DEC-031 §b reste ouvert, et le tableau de
bord n'en présume rien.

### Conséquences

- Migration **055** : sept fonctions `SECURITY INVOKER` et `stable`, `EXECUTE`
  retiré à PUBLIC (DEC-022). **Aucune table, aucune colonne, aucune permission.**
- `dashboard.view`, `dashboard.financial.view` et `dashboard.fleet.view` sont
  désormais **contrôlées côté serveur**, et plus seulement côté écran.
- `listExpiringVehicleDocuments` rejoint `features/fleet` : les échéances de
  documents (§14) se lisent sous `rental.documents.view` **ou**
  `rental.fleet.view`, comme la policy de la table.
- Le tableau de bord de l'Étape 1 — un texte, aucun chiffre — est remplacé.
- Recettes : `db:verify:dashboard` (13 contrôles), `verify:pilotage` (53
  contrôles), et `verify:capabilities` porté de 164 à **189 contrôles**.
- Le module **Tiers**, le **Parc**, la **Facturation** et la **Trésorerie** ne
  sont pas modifiés : le pilotage lit, il n'écrit pas. La recette le vérifie —
  sept lectures, aucun statut déplacé, aucune écriture produite.

---

## DEC-033 — Centre de notifications (LOT 10)

**Date :** 4 septembre 2026
**Portée :** métier, technique et sécurité
**Statut :** appliquée · **ouvre le module 2 — Centre de notifications**

### Contexte — le deuxième écran de la Phase 3

DEC-032 ouvre la Phase 3 par le tableau de bord. `README` §73 et `CLAUDE.md` §61
en désignent la suite : le **Centre de notifications** (Module 02), qui répond à
une question voisine mais distincte — le tableau de bord dit *où en est
l'entreprise*, le Centre dit *ce que je dois savoir ou faire maintenant*
(`Module 02` §40).

L'entrée « Notifications » existait dans la navigation depuis l'Étape 1, marquée
« à venir ». La capacité `notifications.view` existait au catalogue depuis la
migration 007, **sans aucun contrôle serveur**.

### a. Aucune notification n'est stockée

Le point structurant du lot, et il tranche une hésitation réelle.

`Module 02` §3 : « une notification doit toujours être liée à un événement réel
du système ; le système ne doit jamais générer artificiellement des
notifications ». La façon la plus sûre de tenir cette règle est de **ne pas
recopier l'événement** : chaque notification est refaite à la lecture, sur les
données du module qui la produit.

Une notification stockée devrait être tenue à jour, et **une notification
périmée est une notification fausse** — « le véhicule doit rentrer aujourd'hui »
resterait affiché alors qu'il est rentré. C'est la doctrine du Tableau de
location (LOT 1) et de DEC-032 §a, étendue à la veille.

Trois exigences du module en découlent **sans une ligne de code** :

| Exigence | Comment elle est tenue |
| --- | --- |
| §26 — pas de surcharge | une situation résolue cesse d'elle-même de dire |
| §27 — déduplication | une situation = une clé = une seule ligne |
| §32 — rien à supprimer | aucune donnée métier n'est touchée, il n'y a rien à supprimer |

**Migration 056** : une seule table, `notification_reads` — qui a lu quoi, et
quand (§19, §24). Aucune table de notifications, aucun déclencheur de diffusion,
aucun travail planifié.

### b. Le niveau n'est jamais une appréciation

`Module 02` §25 : « le niveau doit être déterminé par la règle métier
concernée ». Chaque famille reprend donc un **exemple littéral du §4** :

| Niveau | Familles livrées | Ancrage |
| --- | --- | --- |
| **Urgent** | véhicule immobilisé pendant une location ; incident avec dommage important sur un véhicule en location | §4.5, mot pour mot |
| **Important** | retour non enregistré ; véhicule immobilisé ; document expiré | §4.4 |
| **À surveiller** | document proche de l'expiration ; maintenance en retard ; contrôle de retour à effectuer ; facture client échue ; facture fournisseur échue | §4.3, §11 |
| **Rappel** | départ prévu ; retour prévu ; maintenance prévue | §4.2 |

Deux précisions valent d'être écrites :

- **« Incident important »** (§4.5) n'est pas une appréciation : il se lit sur la
  gravité **constatée** du dommage — `MAJOR`, dont le libellé métier est
  précisément « Important » (migration 036). Un incident sans dommage important
  reste « à surveiller ». Aucun incident ne devient urgent par défaut.
- **« Facture importante en retard »** (§4.4) suppose un **seuil de montant**
  qu'aucune règle ne fixe. Le niveau retenu est donc le plus bas des deux
  lectures possibles — « à surveiller » —, et le seuil reste à arbitrer.

Les horizons ne sont pas choisis non plus : **7 jours** pour une maintenance
prévue et **30 jours** pour une échéance documentaire sont ceux du §28 (le second
étant déjà celui du tableau de bord, `Module 01` §14).

### c. Une source non autorisée se tait complètement

`Module 02` §22 : « Permission suffisante ? Oui → Notification. Non → Aucune
notification. » Chaque famille est conditionnée aux capacités dont sa lecture
dépend : ni titre, ni objet, ni montant ne franchissent la barrière.

**Et là où une omission produirait un mensonge plutôt qu'un silence, la famille
exige TOUTES ses lectures** (DEC-032 §d) :

| Capacités détenues | Résultat |
| --- | --- |
| `supplier_invoices.view` + `supplier_payments.view`, **sans** `imputations.view` | **silence** — le net vaudrait le brut : 1 000 000 KMF réclamés là où ADIKOM ne doit que 700 000 |
| les trois | la notification annonce le **reste dû** |
| `customer_invoices.view` **sans** `customer_payments.view` | **silence** — une facture soldée se lirait « impayée » |

`CLAUDE.md` §57 : « une imputation de maintenance fournisseur ne doit pas être
enregistrée comme un paiement » — et elle ne doit pas non plus pouvoir être
**ignorée**.

### d. Mais l'écran DIT ce qu'il ne surveille pas

Le silence du §22 est la bonne règle ; appliqué seul, il produirait un écran vide
**indiscernable d'un écran calme**. « Aucune notification » et « aucune
notification que vous ayez le droit de voir » ne sont pas la même information
(DEC-017).

Le Centre nomme donc les **sources non surveillées** et les permissions qui leur
manquent, sans rien révéler de leur contenu. Lorsque `notifications.view` est la
seule capacité détenue, l'écran le dit en toutes lettres.

### e. Marquer comme lu n'est pas une capacité de plus

Le catalogue porte `notifications.view` — « Consulter ses notifications » — et
rien d'autre. Tenir l'état de lecture **de ses propres** notifications est
inhérent à leur consultation : §19 l'exige de tout utilisateur qui les lit. En
créer une seconde serait en créer une d'office, ce que **DEC-024 interdit**. Le
catalogue reste à **153**.

Trois garanties encadrent cette écriture :

1. une ligne de `notification_reads` ne concerne que **son propriétaire** — RLS
   l'impose en lecture comme en écriture (§23, §37) ;
2. ni `UPDATE` ni `DELETE` : une lecture est un fait daté, elle ne se réécrit pas
   et ne s'efface pas ;
3. les fonctions n'acceptent que les clés de la **propre veille de l'appelant** :
   une clé inventée, ou celle d'une notification qu'il n'a pas le droit de voir,
   ne produit aucune ligne. La forme de la clé est en outre contrainte par la
   base — sans quoi la table serait un espace d'écriture libre.

### f. La lecture est un acte explicite

§19 laisse le choix : une notification ouverte « **peut** être automatiquement
marquée comme lue selon le comportement UX retenu ». Le comportement retenu est
le marquage **explicite**, pour une raison tenue du même paragraphe : « une
notification importante ne doit pas disparaître simplement parce qu'elle a été
lue ». Ouvrir la location en retard ne la fait donc pas taire — c'est
l'utilisateur qui déclare l'avoir traitée.

« Tout marquer comme lu » (§20) ne modifie que l'état de lecture : la recette
vérifie qu'**aucune notification ne disparaît** après le geste.

### g. Trois filtres, et aucune période

§18 cite l'état, le niveau, la catégorie, le module et la période, puis ajoute :
« les filtres doivent rester simples et ne pas surcharger l'interface ».

Trois sont livrés — **état**, **niveau**, **module**. La **période** n'en est
pas : la veille ne décrit que des situations **actuelles**, et « ce mois » n'y
aurait aucun sens. C'est la distinction que DEC-032 §e pose déjà entre un flux et
une situation. La **catégorie** se confond avec le niveau : elle n'est pas
dédoublée.

Le filtre s'applique **en base**, avant la limite de 200 lignes : filtrer une
liste déjà tronquée rendrait un résultat silencieusement incomplet (leçon de
DEC-032 §b, appliquée à un filtre plutôt qu'à une somme). Le compteur, lui, se
compte sur l'ensemble de la veille.

### h. Ce que le LOT 10 ne fait pas

**Aucune notification d'INFORMATION** (§4.1). « Nouvelle réservation », « nouveau
client », « véhicule ajouté » sont des **événements de création**, non des
situations. Les dériver supposerait une fenêtre (« créé depuis N jours ») que
rien ne documente, et elles recouvrent l'« activité récente » du §21, dont
l'écran — le journal d'audit — relève de la Phase 4. Le point était déjà ouvert
par DEC-032 §h ; il le reste.

**Aucun historique de notifications au-delà de l'état de lecture** (§31). Ce qui
est conservé, c'est *qui a lu quoi et quand*, et l'événement lui-même dans son
module. Conserver la notification après la disparition de sa cause supposerait de
les stocker — donc de décider **quels** événements méritent une ligne, **à qui**
elle est destinée nommément, et **combien de temps** elle se conserve (§31, §32).
Ce sont trois décisions d'organisation, pas des déductions.

**Aucun rappel automatique poussé** (§28). Les échéances sont vues à la lecture,
non annoncées par un travail planifié ; les délais « configurables dans les
paramètres » supposent le module Paramètres, en Phase 4.

**Aucune notification personnelle nommée** (§23) et **aucun routage par
responsabilité** (§11, §24). L'audience d'une notification est **la capacité de
lecture** dont elle dépend, jamais une liste d'utilisateurs : c'est le seul
critère que la documentation fournit sans qu'il faille l'inventer. Une diffusion
« au responsable location et à la Direction » suppose de savoir qui c'est, et
selon quelle règle.

**Aucune notification hors de la location et de la facturation.** Les projets
(§15) et les utilisateurs (§16) n'ont pas de module livré.

**Aucun canal externe** : ni courriel, ni SMS, ni notification poussée. Le module
n'en demande aucun.

**Aucune capacité de plus** : ni `notifications.manage`, ni `.delete`, ni
`.export`. Le catalogue reste à **153** (DEC-024).

### Conséquences

- Migration **056** : une table (`notification_reads`), huit fonctions
  `SECURITY INVOKER`, `EXECUTE` retiré à PUBLIC (DEC-022). **Aucune permission.**
- `notifications.view` est désormais **contrôlée côté serveur** — cinq fonctions
  l'exigent —, et plus seulement côté navigation.
- L'entrée « Notifications » passe de « à venir » à **livrée**, et porte le
  compteur de non lues (§17), calculé côté serveur.
- Le tableau de bord annonce le **nombre de notifications non lues** (§33) sans
  en présenter aucune : le Centre reste l'endroit principal.
- **Correction du LOT 9** : le compteur des maintenances ouvertes lisait une
  table `maintenances` qui n'existe pas — la table est `vehicle_maintenances`.
  L'indicateur affichait donc en permanence une erreur de chargement, honnête
  mais fausse. La recette du pilotage vérifie désormais qu'**aucun** indicateur
  n'est en erreur pour un pilote complet.
- Recettes : `db:verify:notifications` (15 contrôles), `verify:notifications`
  (85 contrôles), `verify:capabilities` porté de 189 à **206 contrôles**, et
  `verify:pilotage` de 53 à **55**.
- Les modules **Tiers**, **Parc**, **Facturation** et **Trésorerie** ne sont pas
  modifiés : la veille lit, elle n'écrit pas. La recette le vérifie — aucun
  statut déplacé, aucune écriture produite, aucune entrée d'audit.

---

## DEC-034 — Statistiques et rapports de facturation (LOT 11)

**Date :** 4 septembre 2026
**Portée :** métier, technique et sécurité
**Statut :** appliquée · **achève la Phase 3 — Pilotage**

### Contexte — le dernier volet du pilotage

`README` §73 et `CLAUDE.md` §61 donnent la Phase 3 en quatre temps : tableau de
bord (DEC-032), centre de notifications (DEC-033), **statistiques**, **rapports**.
Le LOT 11 livre les deux derniers.

Ils sont documentés par le `Module 07` — §26 et §27 pour les clients, §58, §59 et
§60 pour l'ensemble — et par la `Navigation` §10.1 et §10.2, qui les place en
sous-menus de « Factures clients » et « Factures fournisseurs ».

Quatre capacités les attendaient au catalogue depuis la migration 007, **sans
aucun contrôle serveur** : `billing.customer.stats.view`,
`billing.customer.reports.view`, `billing.supplier.stats.view`,
`billing.supplier.reports.view`. Même situation que `notifications.view` avant le
LOT 10.

### a. Rien n'est stocké, tout est refait à la lecture

`Module 07` §26 : les indicateurs « doivent être calculés à partir des données
réelles ». La façon la plus sûre de tenir cette règle est de **ne recopier aucun
total**.

Un chiffre d'affaires écrit dans une table devrait être tenu à jour par un
déclencheur sur chaque ligne de facture, chaque réduction, chaque règlement et
chaque annulation. Le premier oubli produirait un total faux — et **un total
faux fait autorité plus longtemps qu'un total absent**.

**Migration 057** : huit fonctions, **aucune table, aucune colonne, aucune
permission**. Toutes appellent les fonctions des factures —
`customer_invoice_total`, `customer_invoice_paid`, `supplier_invoice_gross`,
`supplier_invoice_imputed`, `supplier_invoice_paid`. Aucune arithmétique n'est
réécrite : c'est la doctrine de DEC-032 §a, étendue à la synthèse.

### b. Un flux se date de son acte ; un stock ignore la période

Le point structurant du lot, et il évite un contresens.

| Nature | Ce qui est compté | Quand |
| --- | --- | --- |
| **Flux** | facturé | au jour de la facture |
| **Flux** | encaissé | au jour du règlement (`Workflow 08` §11) |
| **Flux** | imputé | au jour où l'imputation est **portée** sur la facture |
| **Flux** | payé | au jour du règlement fournisseur |
| **Stock** | créances, dettes | **hors période** — ce qui reste dû aujourd'hui |

Conséquence à écrire noir sur blanc : sur une période, **« facturé − encaissé »
n'est pas un solde**, et « facturé − imputé − payé » n'est pas une dette. Un
encaissement de septembre peut solder une facture de juillet ; une imputation
d'octobre peut réduire une facture de juillet. Les écrans le disent en toutes
lettres, et la recette l'éprouve : la facture datée de J−20 ne compte pas dans la
journée du règlement, et réciproquement.

C'est la distinction que DEC-032 §e pose déjà entre un flux et une situation,
appliquée ici aux deux côtés de la facturation.

### c. Une synthèse sans toutes ses lectures se tait

Chaque fonction exige **nommément** les capacités dont sa somme dépend, et
**refuse** plutôt que de répondre à côté :

| Capacités détenues | Résultat |
| --- | --- |
| `customer.stats.view` + `customer_invoices.view`, **sans** `customer_payments.view` | **refus** — l'encaissé vaudrait 0 et le solde le total : toute facture se lirait impayée |
| `supplier.stats.view` + `supplier_invoices.view` + `supplier_payments.view`, **sans** `imputations.view` | **refus** — le net vaudrait le brut : 1 000 000 KMF réclamés là où ADIKOM ne doit que 700 000 |

`CLAUDE.md` §57 : « une imputation de maintenance fournisseur ne doit pas être
enregistrée comme un paiement » — et elle ne doit pas non plus pouvoir être
**ignorée**. C'est la règle **2 ter** du LOT 10, appliquée à une somme plutôt
qu'à une veille.

L'écran, lui, **nomme la capacité manquante** (DEC-017) : il n'affiche jamais un
zéro à la place d'un refus.

Les capacités **composent** et n'ouvrent rien (DEC-024) : consulter les
statistiques des factures clients n'autorise pas à lire les factures. La capacité
source reste exigée en plus.

### d. Le nom d'un tiers peut manquer sans que le montant soit faux

Les rapports groupent par client et par fournisseur. Sans `parties.clients.view`
ou `parties.suppliers.view`, RLS masque la ligne du tiers : le rapport affiche
« Client non lisible », et **les montants restent justes** — ils ne dépendent pas
du répertoire.

Le refus de la §c ne s'applique donc pas ici, et c'est cohérent : une omission
qui produirait un **mensonge** fait taire la fonction ; une omission qui produit
une **absence** se dit. La base rend les **parties** du nom, jamais un libellé
composé : la composition reste celle de l'application, pour ne pas créer une
seconde vérité sur l'identité d'un tiers.

### e. Un état ne se tronque pas

`Module 07` §27 et §60 demandent des « états ». Les listes de l'application
s'arrêtent à 200 lignes — parfait pour un écran, faux pour un état : ses lignes
ne feraient plus son total.

Les rapports sont donc des **agrégats non tronqués**, bornés par le référentiel
des tiers et non par le nombre de factures. La recette vérifie le recoupement :
la somme des lignes de l'état vaut exactement le total de la statistique.

### f. Cinq périodes civiles, et la sixième qui manquait

`Module 07` §59 : « jour, semaine, mois, trimestre, année, période
personnalisée ». Les cinq premières sont **exactement** celles du tableau de bord
(DEC-032) — des périodes **civiles**, jamais des fenêtres glissantes — et ne sont
pas recalculées : `resolvePeriod` en reste la seule vérité.

La **période personnalisée** est l'ajout du lot. Deux dates mal saisies ne
produisent jamais un résultat qui ait l'air d'une réponse :

- deux dates **inversées** sont remises à l'endroit, et l'écran **l'annonce** ;
- une date **absente ou inexistante** fait retomber sur le mois, et l'écran
  **le dit** (DEC-017).

Le **grain** de la série se déduit de l'étendue — le jour, la semaine et le mois
se lisent par jour ; le trimestre par semaine ; l'année par mois. Ce n'est pas un
choix d'affichage : il décide de ce que chaque point agrège, et l'écran l'annonce.
Un grain inconnu est **refusé** par la base plutôt que ramené au mois en silence.

### g. Des sous-menus, pas des entrées de barre latérale

`Navigation` §10.1 et §10.2 placent « Statistiques » et « Rapports » sous
« Factures clients » et « Factures fournisseurs ». La barre latérale du SaaS
s'arrête au **menu** : ses troisièmes niveaux sont des pages — « Nouvelle
facture » l'est déjà, les catégories du parc aussi (**DEC-021 §6**, qui autorise
l'adaptation de l'organisation des menus).

Les quatre écrans sont donc atteints par des **onglets** — Liste · Statistiques ·
Rapports —, et la période choisie les suit d'un onglet à l'autre. Un onglet que
l'utilisateur ne peut pas ouvrir n'est pas proposé : ce n'est pas une protection
— chaque page exige de nouveau sa capacité, et la recette éprouve l'URL tapée à
la main — mais une politesse.

### h. Ce que le LOT 11 ne fait pas

**Aucun document produit.** Ni tableur, ni PDF, ni impression. `Module 07` §60
prévoit que « les formats d'export pourront être définis lors de
l'implémentation » — c'est-à-dire qu'ils ne le sont pas. Aucune capacité du
catalogue ne couvre l'export d'un **rapport** : `billing.customer_invoices.export`
porte sur la **liste des factures**, et DEC-024 interdit d'en déduire le droit
d'exporter un état. La capacité correspondante est **proposée, non créée** — elle
figure aux arbitrages ouverts.

**Aucun état des paiements divers** (§59, §60). Le module n'est pas livré et sa
navigation reste marquée « à venir ». Une colonne vide se lirait « aucun paiement
divers ».

**Aucune statistique de location, de parc ou de maintenance.** `Module 04` et
`Module 05` les citent comme évolutions ; la Phase 3 documentée porte sur le
pilotage financier. Les inventer supposerait d'en arrêter les indicateurs.

**Aucun régime de taxes.** Les totaux sont ceux des factures, tels que le système
les connaît — **DEC-014** reste ouverte.

**Aucune capacité de plus.** Le catalogue reste à **153** (DEC-024), et la
migration le vérifie elle-même avant de se terminer.

### Conséquences

- Migration **057** : huit fonctions `SECURITY INVOKER`, `EXECUTE` retiré à
  PUBLIC (DEC-022). **Aucune table, aucune permission.**
- Les quatre capacités de statistiques et de rapports sont désormais
  **contrôlées côté serveur**, et plus seulement côté navigation.
- Les listes de factures portent trois onglets ; « Statistiques » et « Rapports »
  passent de l'absence à **livrés**.
- Les outils du pilotage — `Figure`, `Kpi`, le refus nommé, l'échec dit — quittent
  `features/dashboard/` pour `lib/pilotage/figure.ts` et
  `components/ui/figure.tsx` : deux écrans qui posent la même question ne doivent
  pas y répondre de deux façons (`CLAUDE.md` §37). Le tableau de bord n'en est pas
  modifié — sa recette le vérifie.
- Recettes : `db:verify:analytics` (15 contrôles), `verify:analytics`
  (82 contrôles).
- Les modules **Tiers**, **Parc**, **Facturation** et **Trésorerie** ne sont pas
  modifiés : une statistique lit, elle n'écrit pas. La recette le vérifie —
  aucun statut déplacé, aucune entrée d'audit produite.

---

# 3. Décisions restant à arbitrer par ADIKOM

Récapitulatif des points nécessitant une réponse métier. Aucun automatisme correspondant ne sera développé sans validation.

1. **DEC-007** — Le montant dû au fournisseur doit-il être généré par le système (contrat, loyer, part par location) ou saisi manuellement à réception de la facture ?
2. **DEC-008** — Règles d'arrondi de la durée, traitement du retard, barèmes carburant / kilométrage / dommages, gestion de la caution et de l'acompte, période de préparation, seuils de validation des imputations. *S'y ajoute le **découvert autorisé** d'un compte financier : aucun contrôle n'est posé faute de règle (**DEC-029 §b**).*
3. **DEC-009** — Confirmation de la règle de résolution des permissions multi-groupes.
4. **DEC-014** — Régime de taxes applicable. *Le fuseau horaire est tranché : `Indian/Comoro`, confirmé par **DEC-025 §e**.*
5. **DEC-005** — Confirmation des formats restants et de la règle de remise à zéro annuelle. *Partiellement tranché : les formats client, fournisseur et véhicule sont confirmés par **DEC-021**. Les documents commerciaux relèvent désormais de **DEC-023**, dont l'implémentation est reportée à l'Étape 2.5. Restent à confirmer les objets datés non commerciaux — réservation, location, maintenance, imputation.*
6. **DEC-023 §4** — Validation par le responsable comptable et fiscal d'ADIKOM de la convention de référence des factures, avant toute première émission. *Le LOT 5 conserve pour cette raison le format provisoire `FAC-F-2026-000001`, paramétrable (**DEC-027 §h**).*
~~7. **DEC-027 §i** — Une même référence de facture peut-elle être enregistrée deux fois pour un même fournisseur ?~~ **Tranché par DEC-028** (31 août 2026) : unique par fournisseur, refus explicite par la base.
8. **DEC-029 §c** — ADIKOM souhaite-t-elle séparer la **saisie** et la **validation** d'un règlement (`Workflow 08` §56) ? Aujourd'hui, un règlement constate un mouvement effectué et naît validé ; le catalogue n'offre aucune capacité de validation. La séparation suppose d'en créer une : c'est une décision d'organisation. *La question vaut à l'identique pour les **règlements clients** depuis **DEC-031**.*
9. **DEC-031 §b** — Que devient un **trop-perçu client** ? `Workflow 08` §40 impose une règle définie par ADIKOM et interdit au système d'en décider seul. Les trois issues qu'il envisage supposent chacune une fonctionnalité non retenue : affectation à une autre facture (§37), conservation en **avance** (§41, §42), ou autre règle validée. En attendant, tout versement supérieur au solde est **refusé**, avec son motif. Trancher suppose d'arrêter la règle **et** de décider si l'avance devient un objet du système.
10. **DEC-030 §i** — La **facture client doit-elle être remise au client** sous forme de document ? Le catalogue porte `billing.customer_invoices.print` mais pas `.download`, et DEC-024 interdit de déduire l'une de l'autre. Produire le PDF suppose donc de créer `billing.customer_invoices.download` : c'est une décision de capacité, prise ici pour signalement et non appliquée. *Se rattache à **DEC-023 §4**, la convention de référence restant à valider avant toute première émission d'un document comptable.*
11. **DEC-032 §h** — Le tableau de bord doit-il proposer une **disposition différente selon le métier** (`Module 01` §3) ? Le contenu suit déjà les permissions : un utilisateur sans droits financiers ne voit aucun montant. Une disposition propre au Gérant, à l'assistante de direction ou au responsable de location supposerait de savoir **laquelle** — quels indicateurs, dans quel ordre, pour quel poste. C'est une décision d'organisation, et l'inventer reviendrait à créer une règle métier.
12. **DEC-032 §h** — L'**activité récente** (`Module 01` §21) doit-elle figurer au tableau de bord ? Les données existent — le journal d'audit —, mais son écran relève de la Phase 4 et `users.audit.view` en commande la lecture. La question est de savoir si le tableau de bord doit en présenter un extrait, et sous quelle capacité. *Étendu par **DEC-033 §h** : la même question vaut pour les notifications d'**information** du `Module 02` §4.1 — « nouvelle réservation », « nouveau client », « véhicule ajouté » —, qui sont des événements de création et non des situations.*
13. **DEC-033 §b** — À partir de quel **montant** une facture en retard est-elle « importante » (`Module 02` §4.4) ? Sans seuil, une facture échue est notifiée « à surveiller ». Le seuil est une règle de gestion, pas une déduction — et il vaudrait pour les factures clients comme fournisseurs.
14. **DEC-033 §h** — Les notifications doivent-elles être **conservées après la disparition de leur cause** (`Module 02` §31, §32) ? Aujourd'hui, une situation résolue cesse d'être notifiée, et ce qui est conservé est l'état de lecture — qui a lu quoi, et quand — plus l'événement lui-même dans son module. Un historique de notifications supposerait de les stocker, donc d'arrêter trois règles : **quels** événements méritent une ligne, **à qui** elle est nommément destinée, et **quelle durée de conservation** s'applique.
15. **DEC-034 §h** — Un **rapport doit-il pouvoir être exporté, téléchargé ou imprimé** (`Module 07` §60 — « les formats d'export pourront être définis lors de l'implémentation ») ? Le catalogue ne porte aucune capacité couvrant l'export d'un **état** : `billing.customer_invoices.export` porte sur la liste des factures, et **DEC-024** interdit d'en déduire le droit d'exporter un rapport. Produire un tableur ou un PDF suppose donc de créer `billing.customer.reports.export` et son équivalent fournisseur — décision de capacité, ici **proposée et non appliquée**. *Se rattache à **DEC-023 §4** dès lors qu'un état chiffré serait remis à un tiers.*
16. **DEC-033 §h** — Les notifications doivent-elles être **routées par responsabilité** (`Module 02` §11, §24) ? L'audience est aujourd'hui la **capacité de lecture** dont la notification dépend. Une diffusion « au responsable location, au Support & Logistique et à la Direction » suppose de désigner ces destinataires et la règle qui les choisit. *S'y rattachent les **notifications personnelles** du §23, et les **délais de rappel configurables** du §28, qui supposent le module Paramètres.*

---

**ADIKOM PILOT — Journal des décisions**

> Une décision prise doit être retrouvable.
> Une règle métier ne s'invente pas.
> Une ambiguïté se signale avant de se coder.
