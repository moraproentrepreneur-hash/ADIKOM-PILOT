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

# 3. Décisions restant à arbitrer par ADIKOM

Récapitulatif des points nécessitant une réponse métier. Aucun automatisme correspondant ne sera développé sans validation.

1. **DEC-007** — Le montant dû au fournisseur doit-il être généré par le système (contrat, loyer, part par location) ou saisi manuellement à réception de la facture ?
2. **DEC-008** — Règles d'arrondi de la durée, traitement du retard, barèmes carburant / kilométrage / dommages, gestion de la caution et de l'acompte, période de préparation, seuils de validation des imputations.
3. **DEC-009** — Confirmation de la règle de résolution des permissions multi-groupes.
4. **DEC-014** — Régime de taxes applicable. *Le fuseau horaire est tranché : `Indian/Comoro`, confirmé par **DEC-025 §e**.*
5. **DEC-005** — Confirmation des formats restants et de la règle de remise à zéro annuelle. *Partiellement tranché : les formats client, fournisseur et véhicule sont confirmés par **DEC-021**. Les documents commerciaux relèvent désormais de **DEC-023**, dont l'implémentation est reportée à l'Étape 2.5. Restent à confirmer les objets datés non commerciaux — réservation, location, maintenance, imputation.*
6. **DEC-023 §4** — Validation par le responsable comptable et fiscal d'ADIKOM de la convention de référence des factures, avant toute première émission.

---

**ADIKOM PILOT — Journal des décisions**

> Une décision prise doit être retrouvable.
> Une règle métier ne s'invente pas.
> Une ambiguïté se signale avant de se coder.
