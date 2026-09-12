# Plan 02 — Consolidation après décisions de la Direction

## Tarification · Location · Produits & Services · Commerce · Point de vente

> # PLAN — AUCUN CODE EXÉCUTÉ
>
> Aucune ligne de code, aucune migration, aucune permission, aucune donnée,
> aucun déploiement. Ce document révise et remplace le **Plan 01** à la lumière
> du document de validation signé par la Direction le 11 septembre 2026.

| | |
| --- | --- |
| Date | 12 septembre 2026 |
| Nature | Plan d'implémentation révisé — **remplace le Plan 01** |
| Source métier | `Remplis Validation_Direction_ADIKOM_PILOT_14_decisions.pdf` — signé ADINANE MCHANGAMA, Gérant |
| Plan précédent | `RAPPORTS/Plan 01_Evolution_Tarification_Location_Services_Commerce_PDV.md` |
| État du SaaS analysé | 78 migrations · 44 tables sauvegardées · **178 capacités** · dernier commit `8d22a7c` |
| Production | https://adikom-pilot.vercel.app |
| Périmètre | 5 axes · **10 lots** (19 → 28) |
| Décisions validées | **13 sur 14**, plus 2 principes complémentaires |
| Décisions bloquantes | **1 non tranchée (A-7)** + **6 points nouveaux** ouverts par les décisions elles-mêmes |

**Convention de lecture.** Trois marques, jamais confondues :

| Marque | Sens |
| --- | --- |
| 🟩 **DÉCISION** | Écrite ou cochée par la Direction. Elle s'impose. |
| 🟦 **RECOMMANDATION** | Proposition technique de ce plan. Elle n'engage personne tant qu'elle n'est pas validée. |
| 🟥 **À VALIDER** | Question ouverte. **Ne pas développer avant réponse** lorsqu'elle est marquée *bloquante*. |

---

# 0. Ce qui a changé depuis le Plan 01

Le Plan 01 posait quatorze questions. La Direction en a tranché treize. Mais
plusieurs réponses vont **à l'inverse** de ce que le Plan 01 recommandait, et
trois exigences nouvelles sont apparues. Le plan ne se contente donc pas de
cocher des cases : il reprend l'architecture là où les décisions la déplacent.

| # | Ce que le Plan 01 proposait | Ce que la Direction a décidé | Conséquence |
| :-: | --- | --- | --- |
| 1 | *« Historique des prix : **aucune table dédiée**. L'audit suffit »* (§14.6) | **Historisation temporelle réelle** des prix, transversale | **Renversement complet.** Nouvelle doctrine D16, nouvelles tables de versions, nouveaux résolveurs. §5 |
| 2 | *« Bloquer un paiement inférieur au total »* (A-10) | **Paiement partiel autorisé**, remise possible | Une créance PDV doit exister et être suivie. §3.4, §7.5 |
| 3 | *« Reçu seul »* (A-11) | **Reçu immédiat + facture sur demande** | Le PDV dépend désormais des lignes de service en facture → **l'ordre des lots est verrouillé** |
| 4 | *« Véhicule ADIKOM : marge non calculée »* (A-3) | **ADIKOM est un fournisseur comme un autre** | Conflit avec `vehicles_origin_supplier_coherent`. §3.2 |
| 5 | *« Une location = une facture, sauf période »* | **Facture mensuelle + facture globale à la demande** | Risque de double facturation si la globale est une facture. §3.3 |
| 6 | Rien sur les mots de passe | **Réinitialisation par un administrateur** | Lot nouveau, indépendant, prioritaire. §4.2 |

**Ce qui ne change pas** : les quinze doctrines du §2.3 du Plan 01, les cinq
surfaces de régression du §2.4, la chaîne `Tiers → Facture → Règlement →
Trésorerie` comme unique vérité financière, et le refus de tout second système
de facturation ou de trésorerie.

---

# 1. État actuel

## 1.1 Ce qui est en production

```
Next.js 16 · React 19 · TypeScript 5 · Tailwind 4 · @react-pdf/renderer · exceljs
        ↓
Supabase — PostgreSQL, Auth, Storage (buckets privés)
        ↓
GitHub (main) → Vercel
```

- **78 migrations**, de `20260819000100_foundations` à `20260908000300_capacites_documentaires_des_fiches`.
- **178 capacités** au catalogue (`permissions.ts` lignes 12–290 ↔ migration 007 ↔ 35 fichiers de recette).
- **44 tables** dans `backup_scope()` — ni comptes, ni permissions, ni journal d'audit.
- **9 modules** : dashboard, notifications, projects, parties, rental, treasury, billing, users, settings.
- **21 recettes SQL** + une trentaine de recettes Playwright/Node (`scripts/verify-*.mjs`).

## 1.2 Les mécanismes que ce plan va réutiliser — et ne réécrira pas

| Mécanisme | Où | Ce qu'il garantit déjà |
| --- | --- | --- |
| `resolve_pricing_rule(client, véhicule, date)` | migration 017 | **Résolution tarifaire à une date donnée** — le paramètre `p_on` existe et est appliqué (lignes 208–209) |
| `pricing_rules.valid_from` / `valid_to` | migration 017 | Le versionnement daté **existe déjà** pour le tarif client |
| Verrouillage `locked_amount / unit / rule_id / source / at` | `reservations`, `rentals` | Le prix appliqué est une **copie**, jamais une référence (D13) |
| `create_customer_invoice` → `add_customer_invoice_line` → `issue_customer_invoice` → `record_customer_payment` | migrations 051, 052 | Toute la chaîne de facturation client, avec ses cinq couches |
| `fn_treasury_entry_source` · `treasury_entries_single_origin` | migrations 049, 072, 077 | Une écriture de trésorerie est une **conséquence**, jamais un acte |
| `financial_account_balance()` | migration 048 | **Unique** vérité du solde d'un compte |
| `must_change_password` + `fn_prevent_self_promotion` + `requireUser()` | migration 011, `dal.ts:121` | Le mot de passe temporaire et son changement obligatoire |
| `generateTemporaryPassword()` | `src/lib/auth/password.ts` | Génération **dans le navigateur** de l'administrateur, jamais côté serveur |
| `next_number` + `numbering_rules` | migration 005 | Numérotation unique de toutes les pièces |
| `backup_scope()` / `backup_columns()` | migration 075 | Périmètre de sauvegarde, réinitialisation, restauration |
| `fn_forbid_delete` | migration 021 | Rien ne se supprime |

## 1.3 Les quatre obstacles techniques déjà identifiés, et vérifiés

| Obstacle | Vérification faite sur le code | Portée |
| --- | --- | --- |
| **`customer_invoices_one_per_rental_idx`** | Confirmé — migration 051 ligne 226. Index unique partiel sur `rental_id` où `status <> 'CANCELLED'` | **Interdit** la facturation périodique d'une longue durée |
| **`vehicles_origin_supplier_coherent`** | Confirmé — migration 015 lignes 105–107. Un véhicule `OWNED` **ne peut pas** porter de fournisseur | **Interdit** le modèle fournisseur sur les véhicules ADIKOM (décision A-3) |
| **Le total `178` en dur** | **35 fichiers**, pas 34 (`scripts/verify-*.mjs`, `supabase/tests/*.sql`) | Chaque ajout de capacité fait tomber 35 recettes |
| **`vehicle_occupations` filtré par `rental_id`** | Cinq fonctions : `convert_reservation_to_rental`, `extend_rental`, `return_rental`, `cancel_rental`, `start_rental` | `extend_rental` toucherait **toutes** les occupations d'une location segmentée |

## 1.4 Une capacité dormante, qui trouve enfin son emploi

```sql
-- migration 20260819000700_permissions_catalog.sql, ligne 141
('rental.pricing.override', 'rental', 'pricing', null, null, 'ADMIN',
 'Forcer un tarif manuellement', true, 4)
```

Ce code est **au catalogue depuis le premier jour**, exporté en TypeScript
(`PERMISSIONS.PRICING_OVERRIDE`), et **utilisé nulle part** : aucune action
serveur, aucune policy, aucun déclencheur ne l'exige. C'est aujourd'hui une
permission attribuable qui ne débloque rien — exactement ce que `CLAUDE.md`
§19 bis proscrit.

🟦 **RECOMMANDATION.** La décision **A-5** (« décision au cas par cas » lors d'un
remplacement de véhicule) lui donne sa raison d'être : forcer, sur un segment de
location, un tarif différent de celui que le résolveur propose. **Aucune
capacité nouvelle n'est donc créée pour A-5.** Le catalogue se corrige au lieu
de s'allonger.

---

# 2. Décisions de la Direction — validées

## 2.1 Tableau de synthèse

| Réf. | Case cochée | Texte de la Direction | Statut |
| :-: | --- | --- | :-: |
| **A-1** | Coût journalier ✓ · Forfait par location ✓ | Contrat à tarif journalier précis + conditions hors tarif ordinaire négociables | 🟩 **VALIDÉE** |
| **A-2** | *(aucune)* | « TARIF FOURNISSEUR + COMMISSION + SERVICES » · tarif fournisseur confidentiel · plusieurs tarifs selon type de client et destination | 🟩 **VALIDÉE** (texte) — 2 points résiduels §3.6 |
| **A-3** | *(aucune)* | « Même modèle de tarification que chez les fournisseurs car on considère qu'ADIKOM est un fournisseur » | 🟩 **VALIDÉE** (texte) — conflit technique §3.2 |
| **A-4** | Oui ✓ | « On garde le même contrat et on rajoute des avenants » | 🟩 **VALIDÉE** |
| **A-5** | Le client paie le nouveau tarif ✓ · Décision au cas par cas ✓ | « Généralement le client paie le nouveau tarif, toutefois… on gère selon le contexte » | 🟩 **VALIDÉE** |
| **A-6** | Mensuelle ✓ · Par période définie au contrat ✓ | « Chaque fin du mois on établit une facture, toutefois le client peut exiger une facture globale de toute la période avec les détails et les historiques de paiement » | 🟩 **VALIDÉE** — conflit §3.3 |
| **A-7** | ❌ **AUCUNE** | Changement de tarif possible si changement de mode (court→long) ou non-respect des termes, pénalités de 20 à 100 % | 🟥 **NON TRANCHÉE** §3.1 |
| **A-8** | **Oui ✓** *(rendu visuel)* | *(aucun texte)* | 🟩 **VALIDÉE** — réserve de lecture §2.2 |
| **A-9** | Valider : Espèces, Chèque, Mvola, Holo, Wakati ✓ | — | 🟩 **VALIDÉE** |
| **A-10** | Autoriser un paiement partiel ✓ | « Une remise peut être faite ou un paiement plus tard » | 🟩 **VALIDÉE** — conflit §3.4 |
| **A-11** | Reçu immédiat + facture sur demande ✓ | — | 🟩 **VALIDÉE** — conflit §3.5 |
| **A-12** | Client facultatif ✓ | — | 🟩 **VALIDÉE** |
| **A-13** | Oui ✓ | — | 🟩 **VALIDÉE** |
| **A-14** | Valider le principe de permissions indépendantes par action ✓ | — | 🟩 **VALIDÉE** |
| **Monnaie** | *(règle déjà précisée)* | Net 60 000 · donné 100 000 · **encaissé 60 000** · monnaie 40 000 | 🟩 **VALIDÉE** |
| **Sessions de caisse** | Valider le principe ✓ | — | 🟩 **VALIDÉE** |

**Décompte : 13 décisions A validées sur 14, plus 2 principes complémentaires. 1 non tranchée.**

## 2.2 Réserve de lecture sur A-8 — à signaler à la Direction

**Fait constaté, et rien de plus.** Sur la page 3 du document rendu, la case
**« Oui » de A-8 porte une croix** (`X☐ Oui`). Cette croix **n'apparaît pas dans
la couche texte du PDF**, contrairement à celles de A-9 et des autres points :
elle a probablement été ajoutée par annotation plutôt que saisie. La consigne de
travail transmise à cette session indiquait A-8 comme non renseignée ; le rendu
visuel dit le contraire.

🟦 **RECOMMANDATION.** Traiter A-8 comme **validée — Oui**, ce qui est aussi ce
que le rendu montre, **et faire confirmer d'un mot** par la Direction avant la
migration du LOT 20. Le coût de l'erreur est asymétrique :

- si A-8 = Oui et qu'on ne le fait pas → le module Services est à refaire ;
- si A-8 = Non et qu'on le fait → on aura construit une table de coûts que
  personne ne remplit, sans dégât sur le reste.

**Ce que A-8 ne dit pas**, et qui reste ouvert quoi qu'il arrive (§3.6, points
P-5 et P-6) : un service a-t-il **un** prix d'achat, ou un prix d'achat **par
fournisseur** ? Et qui, nommément, a le droit de le voir ?

## 2.3 Ce que A-1 impose exactement

🟩 **DÉCISION.** Un contrat fournisseur porte **un tarif journalier précis**
(`DAY`), et le **forfait par location** (`FLAT`) est également coché. Le tarif
mensuel **n'est pas coché** — il n'est donc **pas créé**.

🟩 **DÉCISION.** Des **conditions hors tarif ordinaire** existent : personne
distinguée, agence de location demandant un ajustement, contrat longue durée
spécial, négociation particulière.

🟦 **RECOMMANDATION.** Ces conditions ne sont pas une seconde nature de tarif :
ce sont **des versions tarifaires supplémentaires, plus spécifiques et datées**,
sur le même véhicule et le même fournisseur — exactement la forme que
`pricing_rules` donne déjà aux conditions préférentielles client. On ne crée
donc **pas** une table « conditions négociées » ; on ajoute un **niveau de
spécificité** à la table de tarifs fournisseurs, et le champ `conditions` porte
le motif écrit. §5.4.

🟥 **À VALIDER (P-1, non bloquant).** Une condition négociée auprès du
fournisseur dépend-elle du **client final** (« personne distinguée ») ? Si oui,
le tarif fournisseur devient une fonction de `(véhicule, date, client)` — ce qui
est modélisable, mais change la clé du résolveur. Voir §3.6.

---

# 3. Décisions manquantes et conflits ouverts par les décisions

Sept points empêchent aujourd'hui un développement propre. Un seul vient d'une
case non cochée ; **les six autres naissent des décisions elles-mêmes**, parce
qu'elles rencontrent des règles déjà en production.

## 3.1 🟥 A-7 — BLOQUANT · LOT 23

**Ce qui est écrit** : « Un changement de tarif peut survenir si le client change
le mode de location (court à long) ou si le client n'a pas respecté les termes du
contrat, en rajoutant des pénalités de 20 à 100 % ».

**Ce qui manque, et pourquoi c'est bloquant** :

| Question | Pourquoi elle bloque |
| --- | --- |
| Une **pénalité** est-elle une majoration du tarif, ou une **ligne de facture distincte** ? | Ce sont deux objets différents. Une majoration modifie le prix d'une période entière et se retrouve dans la marge. Une ligne de pénalité est un produit accessoire, identifiable et contestable séparément. Le système ne peut pas deviner |
| **20 à 100 % de quoi ?** Du tarif journalier, du total de la période, du montant restant dû ? | Trois bases, trois montants très différents |
| **Qui fixe le taux** dans la fourchette, et sur quel critère ? | Sans critère, le taux est arbitraire — et `CLAUDE.md` §55 interdit d'inventer un barème |
| Le passage **court → long** retarife-t-il **toute** la location, ou seulement à partir du changement ? | Rétroactif ou non : c'est une différence de facture, pas de présentation |
| Une pénalité se **remise**-t-elle ? S'annule-t-elle ? | Elle porte un montant : il lui faut un cycle de vie |

🟦 **RECOMMANDATION technique, à ne pas confondre avec une décision.** Modéliser
la pénalité comme une **ligne de facture de nature `FEE`**, rattachée à la
période concernée, portant son motif et son taux, **et non** comme une
majoration du tarif verrouillé. Motifs : le tarif verrouillé est la trace de
l'engagement et ne doit pas absorber une sanction ; une ligne `FEE` existe déjà,
se remise, s'annule, et n'altère ni la marge commerciale ni l'historique
tarifaire.

**Question précise à poser à la Direction** :

> « Lorsqu'un client ne respecte pas les termes du contrat, la pénalité de 20 à
> 100 % s'applique-t-elle **(a)** en majorant le tarif journalier de la période
> concernée, ou **(b)** en ajoutant une ligne de pénalité distincte sur la
> facture ? Sur quelle base le pourcentage se calcule-t-il (tarif journalier,
> total de la période, solde dû) ? Et qui décide du taux à l'intérieur de la
> fourchette ? »

**Tant que cette réponse manque** : le LOT 23 se développe **sans pénalités**,
et le changement de tarif à la prolongation est traité comme un changement
**explicite et manuel**, sous `rental.pricing.override`. Aucune capacité de
pénalité n'est créée : on ne crée pas une permission pour une fonctionnalité qui
n'existe pas (`CLAUDE.md` §19 bis).

## 3.2 🟥 A-3 rencontre une contrainte en production — BLOQUANT · LOT 21

**La décision** : « ADIKOM est un fournisseur ».
**La contrainte, migration 015 :**

```sql
constraint vehicles_origin_supplier_coherent check (
  (origin = 'SUPPLIED' and current_supplier_id is not null)
  or (origin <> 'SUPPLIED' and current_supplier_id is null)
)
```

Un véhicule `OWNED` **ne peut pas** porter de fournisseur. Trois voies, aucune
neutre :

| Voie | Effet | Verdict |
| --- | --- | --- |
| **(a)** Créer une fiche fournisseur « ADIKOM » et basculer les véhicules ADIKOM en `SUPPLIED` | Détruit la distinction `OWNED`/`SUPPLIED`, sur laquelle reposent **l'imputation de maintenance** (DEC-026) et le traitement des dépenses (Règles Parc §10-§11). Des factures fournisseurs ADIKOM → ADIKOM deviendraient possibles | **Refusée** |
| **(b)** Rendre `supplier_id` **nullable** dans la table de tarifs, avec un indicateur `is_internal` | Le véhicule reste `OWNED`. Le tarif interne est un **coût de référence ADIKOM**, pas une dette envers un tiers. Aucune contrainte existante n'est touchée | 🟦 **RECOMMANDÉE** |
| **(c)** Une table séparée `internal_vehicle_rates` | Deux vocabulaires, deux résolveurs, deux écrans pour la même notion | Refusée — divergence assurée |

🟦 **RECOMMANDATION (b)**, avec une conséquence à assumer et à écrire :

> Le coût d'un véhicule ADIKOM est un **coût de référence interne**. Il entre
> dans la marge commerciale, il **ne produit aucune facture fournisseur**, il ne
> crée aucune dette, et il n'apparaît sur **aucun** document client.

🟥 **À VALIDER (bloquant P-2).** Le coût interne d'un véhicule ADIKOM est-il :

> « **(a)** un tarif de référence fixé par la Direction, comme si ADIKOM se
> louait à elle-même, ou **(b)** un coût de revient calculé (amortissement,
> assurance, entretien) ? »

Ce plan ne peut pas trancher : **(b) est aujourd'hui impossible**, aucune de ces
dépenses n'étant enregistrée par véhicule. Si la Direction veut (b), c'est un
chantier à part entière, et la marge des véhicules ADIKOM doit rester **non
calculée** jusque-là plutôt que fausse.

## 3.3 🟥 A-6 — « facture globale » : BLOQUANT · LOT 23

**Ce qui est écrit** : facture mensuelle, « toutefois le client peut exiger une
facture globale de toute la période de location avec les détails et les
historiques de paiement ».

**Le piège** : si la « facture globale » est une **facture**, elle crée une
seconde créance sur des périodes déjà facturées. Le client devrait alors
1 000 000 KMF en douze factures mensuelles **et** 1 000 000 KMF en facture
globale. `customer_invoice_total()` compterait les deux ; le solde client serait
faux ; le tableau de bord aussi.

| Lecture | Conséquence |
| --- | --- |
| **Facture** couvrant toute la période | **Double facturation**. Il faudrait annuler les douze mensuelles — ce que le client vient précisément de payer |
| **Relevé récapitulatif** — un document qui reprend les factures émises, leurs lignes, les règlements et le solde | **Aucune créance nouvelle.** Exactement le besoin exprimé : « avec les détails et les historiques de paiement » |

🟦 **RECOMMANDATION : le relevé.** Le mot « détails et historiques de paiement »
décrit un récapitulatif, pas un titre de créance — une facture ne porte jamais
l'historique de ses propres règlements. Ce document est le **LOT 24** (synthèse
de location), étendu aux longues durées.

🟥 **Question à la Direction** :

> « Lorsqu'un client demande une facture globale de toute la période, attend-il
> **(a)** un document récapitulatif reprenant les factures déjà émises, leurs
> lignes, les règlements et le solde restant — sans nouvelle créance, ou
> **(b)** une facture unique remplaçant les factures mensuelles, lesquelles
> seraient alors annulées ? »

## 3.4 🟥 A-10 × A-12 — une créance sans débiteur : BLOQUANT · LOT 28

Deux décisions valides séparément, contradictoires ensemble :

```
A-10 : le paiement partiel est autorisé   →  il reste un solde à recouvrer
A-12 : le client est facultatif           →  on peut ne pas savoir de qui
```

Une vente au comptoir, anonyme, partiellement payée, produit **une créance dont
le débiteur est inconnu**. Rien dans le système ne sait la suivre, la relancer ou
la solder — le Plan 01 l'avait annoncé, et c'est cette combinaison précise qui le
confirme.

**Le texte de la Direction distingue d'ailleurs deux choses très différentes** :

| « Une remise peut être faite » | « ou un paiement plus tard » |
| --- | --- |
| Le **net à payer baisse**. Le client règle la totalité du nouveau net. **Il ne reste rien à recouvrer** | Le net reste dû. **Une créance naît**, et il faut un débiteur |

🟦 **RECOMMANDATION — deux règles qui honorent les deux décisions sans en
affaiblir aucune** :

1. **La remise est toujours possible**, avec ou sans client, sous une capacité
   dédiée (`pos.sales.discount`). Elle réduit le net à payer, et la vente reste
   **soldée**. C'est le cas le plus fréquent au comptoir.
2. **Le paiement différé n'est possible que si un client est identifié.** La
   vente produit alors une **facture client** par la chaîne existante, et le
   solde vit là où le système sait déjà le suivre. Une vente anonyme se règle
   intégralement — et l'écran **dit pourquoi** plutôt que de griser un bouton.

Ce n'est pas un refus de A-10 : c'est A-10 rendue exécutable. La Direction
garde le paiement différé ; elle accepte seulement qu'un crédit suppose de savoir
à qui on le fait.

🟥 **Question à la Direction** :

> « Un paiement différé au comptoir suppose-t-il l'identification du client
> (nom au minimum), afin que le solde puisse être suivi et recouvré ? Ou ADIKOM
> accepte-t-elle des créances anonymes, qu'aucun état ne pourra rattacher à une
> personne ? »

## 3.5 🟦 A-11 — « facture sur demande » : un piège de trésorerie, et une conséquence d'ordonnancement

**Le piège.** Une vente PDV encaissée produit une écriture de trésorerie
(entrée). Si, une semaine plus tard, le client demande une facture et que
celle-ci suit le circuit normal — facture, puis **règlement client** —, le
règlement produit **une seconde écriture** pour le même argent. La caisse
afficherait le double.

🟦 **RECOMMANDATION.** La facture émise sur demande d'une vente déjà encaissée
est **adossée à l'encaissement existant** : elle est créée, émise, puis
**soldée par le paiement PDV déjà enregistré**, sans nouvelle écriture de
trésorerie. Techniquement : une colonne `pos_sale_id` sur `customer_payments`,
ou un `customer_invoice_id` sur `pos_sales` — l'un des deux, jamais les deux,
et `fn_treasury_entry_source` révisée pour refuser une écriture en double sur la
même origine.

**La conséquence d'ordonnancement, elle, n'est pas négociable** : une facture de
vente PDV porte des **lignes de service**. Ces colonnes arrivent au LOT 25
(Commerce client). **Le PDV ne peut donc pas être livré avant le Commerce.**
Le Plan 01 avait prévu ce basculement (§23.2) ; la décision A-11 le déclenche.

## 3.6 🟥 A-2 — deux axes tarifaires qui n'existent pas : BLOQUANT · LOT 21

**Ce qui est écrit** : « plusieurs tarifs peuvent être appliqués selon **le type
de client** et **la destination** ».

**Ce qui existe, vérifié dans le schéma** :

| Axe | Dans le modèle ? | Détail |
| --- | :-: | --- |
| Client nommé | ✅ | `pricing_rules.client_id` |
| Véhicule | ✅ | `pricing_rules.vehicle_id` |
| Catégorie de véhicule | ✅ | `pricing_rules.category_id` |
| **Type de client** | ⚠️ **partiellement** | `clients.type` (`client_type`) **existe**, mais `pricing_rules` **n'a aucune portée par type** |
| **Destination** | ❌ **absent** | Le mot n'apparaît nulle part dans le domaine location. Ni table, ni colonne, ni énumération |

Ajouter ces deux axes n'est pas anodin : `pricing_rules.specificity` est une
**colonne générée** qui encode l'ordre de priorité de **DEC-002**
(client+véhicule 6 → standard 0). Deux axes de plus, ce sont **quatre niveaux
supplémentaires** à insérer dans un ordre total qui gouverne aujourd'hui toutes
les locations en production.

🟦 **RECOMMANDATION — ne pas traiter les deux ensemble.**

- **Type de client** : extension naturelle, la donnée existe. Elle s'insère
  entre « client nommé » et « véhicule » dans l'ordre de spécificité. Coût
  maîtrisé, mais **DEC-002 doit être formellement rouverte et réécrite**.
- **Destination** : c'est un **référentiel nouveau** (une liste de destinations,
  puis une portée tarifaire, puis un champ sur la location, puis un écran de
  saisie). **Hors périmètre de ce plan.** L'ajouter en passant, sans savoir ce
  qu'ADIKOM appelle une destination — une île ? un trajet ? une zone ? —
  produirait un axe inutilisable.

🟥 **Questions à la Direction** :

> « 1. Un tarif doit-il pouvoir être défini pour **un type de client**
> (particulier, entreprise, administration…) et non seulement pour un client
> nommé ?
> 2. Qu'appelle-t-on une **destination** — une île, une ville, un trajet, une
> zone tarifaire ? Un tarif "selon la destination" s'applique-t-il à la location
> d'un véhicule, ou à une prestation de transport qui serait alors un
> **service** du catalogue ? »

La seconde question a une réponse possiblement simple et peu coûteuse : si la
destination concerne un **transfert** ou une **excursion**, elle relève du
module **Services** (LOT 20) — « Transfert aéroport », « Excursion Itsandra » —
et **aucune modification de `pricing_rules` n'est nécessaire**.

## 3.7 Récapitulatif des points ouverts

| Réf. | Point | Bloque | Nature |
| :-: | --- | :-: | --- |
| **P-0** | **A-7** — pénalités et retarification | **LOT 23** | Décision métier absente |
| **P-1** | Le tarif fournisseur dépend-il du client final ? | LOT 21 *(non bloquant)* | Précision |
| **P-2** | Coût interne d'un véhicule ADIKOM : tarif de référence ou coût de revient ? | **LOT 21** | Décision métier |
| **P-3** | « Facture globale » = relevé ou facture ? | **LOT 23** | Décision métier |
| **P-4** | Paiement différé au PDV sans client identifié ? | **LOT 28** | Décision métier |
| **P-5** | Un service a-t-il un prix d'achat unique, ou par fournisseur ? | **LOT 20** | Précision A-8 |
| **P-6** | Tarif par **type de client** ? Qu'est-ce qu'une **destination** ? | **LOT 21** | Décision métier |
| **P-7** | Confirmation de lecture de A-8 | LOT 20 | Vérification |

**Les LOT 19 et 20 peuvent démarrer avec P-5 et P-7 seuls.**

---

# 4. Nouvelles exigences

## 4.1 N-1 — Historisation des prix *(transversale — §5)*

Exigence nouvelle, **contraire à ce que le Plan 01 avait tranché** (§14.6 :
« aucune table dédiée »). Elle commande l'architecture des prix dans quatre
domaines. Traitée intégralement au §5.

## 4.2 N-2 — Réinitialisation du mot de passe utilisateur

### Ce qui existe, et qui ne bouge pas

🟩 **DÉCISION du demandeur : le mécanisme actuel est validé et ne doit être ni
remplacé, ni simplifié, ni supprimé.** Il fonctionne ainsi, vérifié dans le
code :

```
1.  Le Super Admin ouvre « Nouvel utilisateur »
2.  generateTemporaryPassword()          ← src/lib/auth/password.ts
    exécuté DANS LE NAVIGATEUR de l'administrateur : 16 caractères,
    crypto.getRandomValues, sans les caractères ambigus (I, l, 1, O, 0)
3.  Affichage œil/copier, champ caché dans le formulaire
4.  createUserAction → admin.auth.admin.createUser({ password })
    puis app_users.must_change_password = true
5.  À la connexion, requireUser() détourne vers /changer-mot-de-passe
    (dal.ts ligne 121) — AUCUNE fonctionnalité métier n'est accessible avant
6.  changePasswordAction : supabase.auth.updateUser({ password })
    puis levée de l'indicateur par le client d'administration, jamais par
    l'utilisateur (trigger fn_prevent_self_promotion)
```

Le mot de passe **n'est jamais produit côté serveur, jamais renvoyé par une
action, jamais journalisé, jamais stocké** — ni en clair ni sous forme
d'empreinte. Cette doctrine est le socle de tout ce qui suit.

### Ce qui est demandé

Une action **« Réinitialiser le mot de passe »**, déclenchée par un
administrateur autorisé, qui **réemploie** le mécanisme existant.

### 🟦 Emplacement — analyse UX

| Emplacement | Pour | Contre |
| --- | --- | --- |
| **Liste des utilisateurs** (action de ligne) | Rapide lors d'un appel téléphonique | **Risque d'erreur de ligne.** Réinitialiser le mauvais compte verrouille une personne qui n'avait rien demandé. La confirmation devrait de toute façon rappeler l'identité — c'est-à-dire refaire ce que la fiche montre déjà |
| **Fiche utilisateur** | L'identité est **sous les yeux** : nom, identifiant, fonction, statut. C'est déjà là que vivent les actes sensibles (statut, permissions). Un clic de plus, une erreur de moins | Deux clics depuis la liste |

🟦 **RECOMMANDATION** :

- **L'acte a lieu sur la fiche**, onglet « Utilisateur », dans un encart
  « Accès & sécurité » voisin du statut — jamais dans l'onglet « Permissions »,
  qui traite de droits et non d'authentification.
- **La liste porte une information, pas l'acte** : un badge
  « mot de passe temporaire en attente » dérivé de `must_change_password`, qui
  permet de voir d'un coup d'œil qui n'a pas encore défini le sien. La colonne
  est déjà lue par le DAL ; il suffit de la sélectionner dans la requête de
  liste.

### 🟦 Déroulé proposé

```
1.  L'administrateur ouvre la fiche, clique « Réinitialiser le mot de passe »
2.  Confirmation NOMMANT la personne : « Réinitialiser le mot de passe de
    Ali MOHAMED (a.mohamed) ? Son mot de passe actuel cessera d'être valable. »
3.  generateTemporaryPassword()   ← LE MÊME, dans le navigateur. Aucun doublon
4.  Action serveur resetUserPasswordAction :
       a. requirePermission('users.users.password.reset')
       b. rpc require_password_reset(p_user_id)
              → require_capability(...)  → must_change_password = true
              → audit UPDATE / app_users / module users
       c. admin.auth.admin.updateUserById(userId, { password })
5.  Succès : le navigateur affiche LE mot de passe QU'IL A LUI-MÊME GÉNÉRÉ,
    avec œil + « Copier » — le serveur ne le renvoie jamais
6.  L'utilisateur se connecte → requireUser() le détourne vers
    /changer-mot-de-passe → il choisit son mot de passe définitif
7.  L'administrateur ne connaît JAMAIS le mot de passe définitif
```

**Pourquoi l'ordre 4.b avant 4.c**, et pas l'inverse :

| Ordre | Si la seconde étape échoue |
| --- | --- |
| **Indicateur puis Auth** 🟦 | L'utilisateur garde son ancien mot de passe **mais devra le changer** à la prochaine connexion. Dégradé, sûr, **réessayable** |
| Auth puis indicateur | L'utilisateur a un mot de passe temporaire **sans obligation de le changer**. Le temporaire devient définitif, connu de l'administrateur. **Inacceptable** |

### 🟥 Trois gardes de sécurité à poser explicitement

| Garde | Pourquoi |
| --- | --- |
| **Un utilisateur ne réinitialise pas son propre mot de passe par cette voie** | Elle n'apporte rien (l'écran de changement existe) et brouillerait le journal. Précédent : `setUserStatusInner` refuse déjà l'auto-modification de statut |
| **Un non-Super-Admin ne réinitialise jamais le mot de passe d'un Super Admin** | **Sinon la capacité devient un chemin de prise de contrôle** : qui peut réinitialiser le mot de passe du Super Admin peut se connecter à sa place et s'attribuer tout le reste. À imposer **côté serveur ET en base** |
| **Un compte `ARCHIVED` ne se réinitialise pas** | On réactive d'abord. Réinitialiser un compte archivé rendrait un accès à quelqu'un qui n'en a plus |

### 🟦 Le point technique délicat — quelle couche garde l'écriture

L'écriture du mot de passe dans Supabase Auth **exige la clé de service** : elle
ne peut pas, par nature, être gardée par RLS. La garde en base doit donc porter
sur **l'indicateur et le journal**. Or `app_users_update` (migration 006) ouvre
l'écriture à `users.users.update` — s'en contenter rendrait la réinitialisation
**implicitement incluse dans « modifier un utilisateur »**, ce que **DEC-024**
interdit.

| Option | Mécanisme | Verdict |
| --- | --- | --- |
| **A** 🟦 | RPC `security invoker` + policy dédiée `app_users_password_reset` gardée par la nouvelle capacité, **plus un déclencheur** qui, par cette voie, refuse toute écriture portant sur une autre colonne que `must_change_password` | **Recommandée** — tient les trois couches, et reprend la forme de `fn_prevent_self_promotion`, qui restreint déjà des colonnes par déclencheur |
| B | Fonction `security definer` | Rompt la doctrine D4 pour une seule fonction |
| C | Écriture par le client d'administration après `requirePermission` | Deux couches seulement. Un appel PostgREST direct ne serait arrêté par rien |

**Note rassurante sur les sessions ouvertes** : l'utilisateur dont on
réinitialise le mot de passe **perd immédiatement l'accès aux fonctionnalités
métier**, même si sa session reste techniquement valide — `requireUser()` le
détourne vers l'écran de changement dès la requête suivante. La révocation des
jetons n'est donc pas indispensable à la sécurité ; à évaluer pendant le lot
selon ce que permet l'API d'administration.

### 🟦 Capacité proposée

| Code | Module | Menu | Sous-menu | Action | Sensible | Libellé |
| --- | --- | --- | --- | --- | :-: | --- |
| `users.users.password.reset` | `users` | `users` | `password` | `ADMIN` | ✓ | Réinitialiser le mot de passe |

**Pourquoi `ADMIN` et non `UPDATE`** : le précédent est `rental.pricing.override`
(« Forcer un tarif manuellement », action `ADMIN`). Réinitialiser n'est pas
modifier une donnée de la fiche : c'est un acte d'administration sur un compte.

**Pourquoi pas `users.users.update`** : DEC-024 et A-14. Corriger un numéro de
téléphone et rendre un accès ne sont pas le même geste.

**Catalogue : 178 → 179.**

## 4.3 N-3 — Confidentialité du tarif fournisseur *(§6)*

🟩 **DÉCISION (A-1, A-2).** « Le tarif fournisseur est confidentiel, seul le
tarif facturé au client et les services liés apparaissent dans les documents. »
Traitée au §6.

## 4.4 N-4 — Produits & Services : Services seulement

🟩 **DÉCISION.** Le module prévoit Produits **et** Services ; **seuls les
Services sont développés**. Position inchangée depuis le Plan 01 §14.7 :

1. Le module s'appelle **« Produits & Services »**, code `catalog` — choisir le
   nom large maintenant évite de renommer un `module_code` après attribution des
   capacités.
2. **Aucune table produit**, aucune capacité `catalog.products.*`, **aucune
   entrée de navigation** « à venir » : le projet les a toutes supprimées
   (DEC-042) et n'en réintroduira pas.
3. **Aucun champ de stock, d'entrepôt ou de mouvement** nulle part.

---

# 5. Doctrine d'historisation des prix — **DEC-043 (proposée)**

## 5.1 L'exigence, telle que la Direction la pose

```
SERVICE X
01/01/2026 → 30/06/2026     100 KMF
01/07/2026 → 30/09/2026     200 KMF
01/10/2026 → …              250 KMF

Opération du 15/06/2026  →  100 KMF
Opération du 15/07/2026  →  200 KMF
Opération du 15/10/2026  →  250 KMF
```

Et : « Il ne suffit pas de conserver uniquement le prix actuel dans la fiche du
service. »

## 5.2 Pourquoi le Plan 01 avait tort

Le Plan 01 §14.6 écrivait : *« Historique des prix : aucune table dédiée.
L'audit `PRICE_CHANGE` conserve l'avant/après ; les lignes conservent la copie.
Deux sources diraient la même chose et finiraient par diverger. »*

Ce raisonnement protège bien **une opération déjà enregistrée** — sa ligne porte
le prix copié, et aucune hausse ultérieure ne l'atteint. Mais il **ne répond
pas** à ce que la Direction demande, sur trois points :

| Ce que la copie seule ne sait pas faire | Conséquence concrète |
| --- | --- |
| **Saisir un prix futur.** « À partir du 1ᵉʳ juillet, ce sera 200 » ne peut pas s'enregistrer : la fiche ne porte qu'un prix, celui d'aujourd'hui | Il faudrait se souvenir de le changer le 1ᵉʳ juillet au matin. Un oubli facture au mauvais prix |
| **Tarifer une opération saisie après coup.** Une prestation rendue le 15/06 et saisie le 20/07 prendrait le prix du 20/07 | 200 au lieu de 100. Erreur de facturation, invisible |
| **Dire pourquoi.** Le journal d'audit sait qu'un prix est passé de 100 à 200 le 28/06, mais il n'est **pas une structure de calcul** : on ne résout pas un tarif depuis un journal | « Sur quelle version ce montant repose-t-il ? » reste sans réponse exploitable |

**Le Plan 01 opposait deux mécanismes qui ne sont pas concurrents mais
complémentaires.** Et le SaaS le prouve déjà : `pricing_rules` porte
`valid_from` / `valid_to`, `resolve_pricing_rule(client, véhicule, **date**)`
les applique (migration 017, lignes 208–209) — **et** le tarif retenu est
recopié dans `rentals.locked_*`. Les deux, ensemble, depuis le premier jour.

**Ce que la Direction demande pour les services, c'est donc ce que le SaaS fait
déjà pour les locations.** Il ne s'agit pas d'inventer un mécanisme : il s'agit
de **généraliser celui qui est éprouvé**.

## 5.3 La doctrine — **D16**

> **D16 — Un prix est une ligne datée ; une opération en garde la copie.**
>
> **(a) Versionnement.** Tout prix vit dans une ligne portant `valid_from` et
> `valid_to`. **Changer un prix, c'est clore la version courante et en ouvrir
> une nouvelle** — jamais réécrire une colonne.
>
> **(b) Copie.** Toute opération commerciale ou contractuelle **copie** dans
> ses propres colonnes le prix résolu, son unité, l'identifiant de la version
> appliquée et l'horodatage de la résolution.
>
> **(c) Résolution.** Un prix se lit **toujours** par un résolveur prenant une
> **date d'effet**, jamais par une lecture directe de « la » ligne de prix.
>
> **(d) Absence.** Aucune version applicable à une date ⇒ **aucune ligne
> renvoyée**. Un prix absent n'est jamais un prix nul (DEC-008, DEC-017).
>
> **(e) Irréversibilité.** Corriger une version passée **ne modifie jamais** une
> opération déjà enregistrée : celle-ci porte sa copie.

**Les deux moitiés sont nécessaires.** (a) seule laisserait une correction
d'ancienne version changer rétroactivement ce qu'une facture aurait dû porter.
(b) seule ne sait ni programmer un prix futur, ni tarifer une saisie rétroactive.

## 5.4 Portée — les quatre domaines

| Domaine | Table de versions | Résolveur | Copie dans l'opération | État |
| --- | --- | --- | --- | :-: |
| **Tarif client — location** | `pricing_rules` | `resolve_pricing_rule(client, véhicule, **date**)` | `reservations.locked_*`, `rentals.locked_*`, `rental_segments.locked_*` | ✅ **Existe** — rien à construire |
| **Coût fournisseur — véhicule** | `supplier_vehicle_rates` | `resolve_supplier_rate(véhicule, **date**)` | `rental_segments.locked_cost_*` | 🆕 LOT 21 |
| **Prix de vente — service** | `service_variant_prices` | `resolve_service_price(variante, **date**)` | lignes de devis, commande, facture, vente PDV | 🆕 LOT 20 |
| **Prix d'achat — service** | `service_variant_costs` | `resolve_service_cost(variante, **date**)` | `unit_cost` copié | 🆕 LOT 20 |

**Conséquence sur la structure du Plan 01** : `service_variants.purchase_price`
et `service_variants.sale_price` — deux colonnes de prix sur la variante —
**disparaissent**. La variante devient une **identité** (libellé, SKU, actif,
défaut) ; ses prix sont des **lignes datées** dans deux tables filles.

**Bénéfice inattendu** : la table séparée que A-8 réclamait pour la
confidentialité (§6) et la table de versions que N-1 réclame pour
l'historisation sont **la même table**. Une seule structure répond aux deux
exigences.

## 5.5 Forme commune des tables de versions

```sql
<domaine>_prices (
  id              uuid pk,
  <cible>_id      uuid not null → <cible>,
  amount          bigint not null check (amount > 0),   -- KMF entiers (D8/DEC-010)
  currency_code   text not null default 'KMF',
  valid_from      date not null,
  valid_to        date,                                  -- NULL = en vigueur
  is_active       boolean not null default true,
  reason          text,                                  -- motif du changement
  created_at/by, updated_at/by,

  constraint <t>_period check (valid_to is null or valid_to >= valid_from),

  -- AUCUN CHEVAUCHEMENT entre deux versions actives de la même cible
  constraint <t>_no_overlap exclude using gist (
    <cible>_id with =,
    daterange(valid_from, coalesce(valid_to, 'infinity'::date), '[]') with &&
  ) where (is_active)
)
```

**Cinq points, chacun pour une raison** :

1. **`bigint` en KMF entiers** — D8, jamais de flottant.
2. **Contrainte d'exclusion `gist`**, pas un déclencheur : elle ferme la
   **course entre deux saisies simultanées**, qu'aucun déclencheur ne voit
   (leçon de DEC-028, déjà apprise sur `vehicle_occupations` et sur l'unicité
   des références fournisseur).
3. **`valid_from` dans le futur est autorisé** — c'est précisément ce que la
   Direction demande : préparer le 200 KMF avant le 1ᵉʳ juillet.
4. **Un trou entre deux versions est permis**, et il signifie « pas de prix à
   cette date ». Le résolveur ne renvoie rien, l'écran le dit, et rien ne se
   facture. C'est un refus explicite, pas un zéro silencieux.
5. **Aucune suppression** (D6). Une version se clôt ou se désactive.

## 5.6 La date d'effet — le détail qui décide de tout

🟦 **RECOMMANDATION, à appliquer partout sans exception.** Le paramètre `p_on`
d'un résolveur est **la date métier de l'opération**, jamais « aujourd'hui » :

| Opération | Date d'effet |
| --- | --- |
| Ligne de devis | `quote_date` |
| Ligne de commande | `order_date` |
| Ligne de facture | `invoice_date` |
| Vente PDV | date de la vente |
| Segment de location | date de début du segment |
| Prolongation | date de début de la nouvelle période |

**Et le jour est comorien, pas UTC.** `current_date` s'évalue en UTC : entre
21 h et minuit UTC, il désigne **la veille** à Moroni. Toute date d'effet par
défaut s'écrit :

```sql
(now() at time zone 'Indian/Comoro')::date
```

Ce n'est pas une précaution théorique : l'écart n'apparaît qu'en soirée, il est
donc invisible en recette de journée, et il ferait facturer une vente du soir au
prix de la veille le jour d'un changement de tarif.

## 5.7 🟥 Le cas `pricing_rules` — à traiter avec précaution

`pricing_rules` est déjà datée, mais **n'a pas de contrainte anti-chevauchement**.
Deux règles de même portée et de périodes qui se recouvrent sont aujourd'hui
départagées par `created_at desc` : le résultat est **déterministe**, mais il ne
dit pas laquelle des deux ADIKOM voulait.

La Direction demande d'« empêcher les chevauchements incohérents ». Or :

- un chevauchement **entre portées différentes est légitime et voulu** — une
  règle client recouvre par construction la règle standard ; c'est DEC-002 ;
- seul un chevauchement **à portée identique** est incohérent.

🟦 **RECOMMANDATION, en trois temps** :

1. **Recenser d'abord.** Une recette de lecture seule compte les règles actives
   de portée identique dont les périodes se recouvrent, en production.
2. **Si le compte est nul** : ajouter la contrainte d'exclusion sur le triplet
   `(client_id, vehicle_id, category_id)` + `daterange`, dans une migration
   isolée du LOT 21.
3. **S'il ne l'est pas** : présenter la liste à la Direction. Une contrainte
   d'exclusion **ne peut pas être ajoutée `NOT VALID`** : elle échouerait à la
   migration, et un déploiement bloqué en production est un incident, pas un
   correctif.

**Aucune colonne de `pricing_rules` n'est ajoutée, modifiée ou supprimée** —
la garantie du Plan 01 §8.2 tient. Seule une contrainte d'intégrité s'ajoute,
et seulement si la production est déjà saine.

## 5.8 Ce que l'historisation ne fait pas

- **Elle ne rejoue pas le passé.** Aucune facture, aucune location, aucune ligne
  existante n'est retarifée. Les `locked_*` sont inatteignables.
- **Elle ne remplace pas l'audit.** `PRICE_CHANGE` continue de journaliser qui a
  changé quoi et quand. La table de versions dit **quel prix s'applique** ;
  l'audit dit **qui l'a décidé**. Deux questions, deux réponses, aucun doublon.
- **Elle n'automatise rien.** Aucun ordonnanceur ne « bascule » un prix à
  minuit : le résolveur calcule à la lecture, ce qui est juste à la seconde près
  et ne dépend d'aucune tâche qui pourrait ne pas s'exécuter.

---

# 6. Doctrine de confidentialité des tarifs fournisseur — **DEC-044 (proposée)**

## 6.1 Ce que la Direction impose

🟩 **DÉCISION (A-2).** « Le tarif fournisseur est confidentiel ; seul le tarif
facturé au client et les services liés apparaissent dans les documents. »

🟩 **DÉCISION (A-2).** La formule de construction du prix :

```
PRIX CLIENT  =  TARIF FOURNISSEUR  +  COMMISSION  +  SERVICES
                └── confidentiel ──┘  └────── visible du client ──────┘
```

## 6.2 Le vocabulaire — quatre notions, quatre noms, jamais confondus

Le Plan 01 identifiait déjà le risque de mélange. La formule A-2 le rend
impératif :

| Nom retenu | Définition | Visible par |
| --- | --- | --- |
| **Coût d'acquisition** | Ce qu'ADIKOM paie au fournisseur, ou son coût de référence interne pour un véhicule ADIKOM | `rental.pricing.supplier.view` |
| **Prix client** | Ce qui est facturé au client — l'unique montant des documents client | `rental.rentals.financial.view` |
| **Commission** | `Prix client − Coût d'acquisition`, sur la seule mise à disposition du véhicule | Les **deux** capacités ci-dessus |
| **Marge commerciale** | Commission + marge des services | Les deux capacités, plus `catalog.services.cost.view` pour la part services |

**Distincte de la marge d'exploitation**, déjà livrée sur l'onglet
« Rentabilité » du véhicule (maintenances, imputations). Les deux ne se
mélangent jamais, et chaque écran **nomme** la sienne et **énumère ce qu'elle ne
couvre pas**.

## 6.3 Trois barrières, parce qu'une seule ne suffit pas

| # | Barrière | Mécanisme | Ce qu'elle arrête |
| :-: | --- | --- | --- |
| **1** | **La donnée est dans une table à part** | `supplier_vehicle_rates`, `service_variant_costs` — jamais une colonne d'une table largement lisible | RLS est *row-level* : elle **ne sait pas masquer une colonne**. Un `select *` sur une table mixte livrerait le coût. Précédent : `maintenance_costs`, migration 062 (D7) |
| **2** | **La lecture exige sa capacité** | Policy `select` gardée par `rental.pricing.supplier.view` / `catalog.services.cost.view`, `has_permission` **enveloppé dans un sous-select** | Un appel PostgREST direct, autant qu'un écran |
| **3** | **Les documents client ne composent jamais le coût** | Les générateurs PDF destinés aux tiers ne reçoivent **pas** les colonnes de coût | Une fuite par un document, qui sort du système et circule |

## 6.4 Règle absolue sur les documents

> **Aucun document destiné à un tiers ne porte un coût d'acquisition, une
> commission ou une marge.** Ni facture client, ni devis client, ni commande
> client, ni contrat de location, ni bon de départ, ni PV de retour, ni reçu
> PDV, ni synthèse de location remise au client.

**Cas particulier à trancher** — la **synthèse de location** (LOT 24) est un
document interne **et** potentiellement remis au client.

🟦 **RECOMMANDATION.** Un seul document, **deux compositions** : la marge et le
coût n'apparaissent que si le demandeur détient les deux capacités, et le bloc
absent est **nommé** plutôt que tu — le composant `OmissionNote` existe déjà
(DEC-017). C'est déjà ainsi que fonctionnent les documents du cycle de location.

## 6.5 Où le coût **doit** rester visible

La confidentialité n'est pas l'effacement. Sous `rental.pricing.supplier.view`,
le coût reste lisible : fiche véhicule, fiche fournisseur, segment de location,
onglet marge, et **facture fournisseur** — laquelle est une pièce **reçue**, pas
émise, et n'est jamais remise à un client.

---

# 7. Architecture fonctionnelle cible

## 7.1 Modules après les dix lots

| # | Module | Code | État |
| :-: | --- | --- | --- |
| 1–9 | *(les neuf actuels)* | | inchangés, sauf extensions nommées |
| **10** | **Produits & Services** | `catalog` | 🆕 LOT 20 — **Services seulement** |
| **11** | **Commerce** | `commerce` | 🆕 LOT 25 · 26 |
| **12** | **Point de vente** | `pos` | 🆕 LOT 27 · 28 |

⚠️ `CLAUDE.md` §10 énumère **9 modules**. Il devra être mis à jour au LOT 20 —
la documentation ne se modifie pas pour justifier une implémentation
(`CLAUDE.md` §52), mais elle se met à jour quand une décision de la Direction
l'étend, et celle-ci est écrite.

## 7.2 La chaîne achat → vente, rendue lisible

```
        CE QU'ADIKOM PAIE                    CE QU'ADIKOM FACTURE
        ── confidentiel ──                   ──── visible client ────

  supplier_vehicle_rates  (daté)        pricing_rules  (daté)
  service_variant_costs   (daté)        service_variant_prices  (daté)
            │                                     │
            │  resolve_supplier_rate(v, date)     │  resolve_pricing_rule(c, v, date)
            │  resolve_service_cost(var, date)    │  resolve_service_price(var, date)
            ▼                                     ▼
       ╔═══════════════════════════════════════════════════╗
       ║   COPIE dans l'opération  —  D13 + D16(b)          ║
       ║   locked_cost_*          │   locked_amount, unit   ║
       ║   unit_cost              │   unit_price            ║
       ╚═══════════════════════════════════════════════════╝
            │                                     │
            └──────────────► COMMISSION / MARGE ◄─┘
                     (différence, jamais stockée — D1)
```

## 7.3 Location — le cycle étendu

```
Réservation ──▶ LOCATION ────────────────────────────────────▶ Clôture
                   │
                   ├── rental_type : FIXED_TERM | LONG_TERM        (LOT 23)
                   │
                   ├── AVENANTS  (rental_amendments)               (LOT 22)
                   │     ├── VEHICLE_CHANGE ──▶ nouveau segment
                   │     ├── EXTENSION      ──▶ nouvelle période facturable
                   │     └── RATE_CHANGE    ──▶ nouveau segment, tarif forcé
                   │
                   ├── SEGMENTS  (rental_segments)                 (LOT 22)
                   │     véhicule + période + prix verrouillé + coût verrouillé
                   │
                   ├── PÉRIODES FACTURABLES (rental_billing_periods) (LOT 23)
                   │     une facture par période, jamais deux
                   │
                   └── SYNTHÈSE (document)                          (LOT 24)
                         véhicules, périodes, tarifs, avenants,
                         factures, règlements, solde
```

### 🟦 L'avenant — une consolidation par rapport au Plan 01

🟩 **DÉCISION (A-4)** : « On garde le même contrat et on rajoute des avenants ».

Le Plan 01 prévoyait deux tables sans lien : `rental_segments` (changement de
véhicule) et `rental_extensions` (prolongation). Or la Direction nomme **un
seul objet** : l'avenant. Et un même avenant peut très bien prolonger **et**
changer de véhicule **et** changer de tarif.

🟦 **RECOMMANDATION** : un **acte** unique, des **conséquences** structurelles
distinctes.

```
rental_amendments        L'ACTE : n°, type(s), date, motif, auteur
      │                  C'est ce que la Direction appelle « avenant »
      ├──▶ rental_segments          (si le véhicule ou le tarif change)
      └──▶ rental_billing_periods   (si la durée change)
```

| Comparaison | Deux tables sans lien (Plan 01) | Un acte + conséquences 🟦 |
| --- | --- | --- |
| Vocabulaire | « segment », « prolongation » — absents du langage de la Direction | **« avenant »**, le mot du contrat |
| Avenant mixte | Deux lignes indépendantes, rien ne dit qu'elles vont ensemble | Un avenant, ses deux effets |
| Document | Impossible d'imprimer « l'avenant n° 2 » | Naturel |
| Coût | — | Une table de plus |

**La table en plus se paie une fois ; l'incapacité à imprimer un avenant se
paierait à chaque contrat.**

## 7.4 Services — structure révisée par l'historisation

```
service_categories
        │
        ▼
    services            identité : n°, libellé, catégorie, destination
        │                          (PURCHASE | SALE | BOTH), statut, unité
        ▼
 service_variants       identité : libellé, SKU, défaut, actif
        │                          ← AUCUN PRIX SUR CETTE TABLE
        ├──▶ service_variant_prices   versions datées du PRIX DE VENTE
        └──▶ service_variant_costs    versions datées du PRIX D'ACHAT
                                      table séparée = confidentialité (§6.3)
```

**Tout service reçoit à sa création une variante « Standard » par défaut** — il
n'existe donc jamais de service sans variante, et aucun des quatre modules
consommateurs n'a de cas particulier à traiter.

**Cohérence destination / prix**, par déclencheur :

| `purpose` | Règle |
| --- | --- |
| `SALE` | Au moins une version de prix de vente en vigueur. **Aucun** prix d'achat |
| `PURCHASE` | Au moins une version de prix d'achat en vigueur. **Aucun** prix de vente |
| `BOTH` | Les deux admis, aucun obligatoire. Marge calculée **seulement si les deux** existent à la date considérée |

## 7.5 PDV — le circuit révisé par A-10 et A-11

```
Session ouverte ──▶ PANIER ──▶ remise éventuelle ──▶ NET À PAYER
                                                          │
                        ┌─────────────────────────────────┴──────────────┐
                        ▼                                                ▼
            Σ encaissé = net à payer                      Σ encaissé < net à payer
                   VENTE SOLDÉE                            (A-10 · exige un client)
                        │                                                │
                        ├──▶ trésorerie : Σ ENCAISSÉ                     ├──▶ trésorerie : Σ ENCAISSÉ
                        │    JAMAIS Σ donné                              │
                        ├──▶ REÇU immédiat                               ├──▶ REÇU immédiat
                        │                                                ├──▶ FACTURE CLIENT (chaîne existante)
                        └──▶ facture sur demande (A-11)                  └──▶ solde suivi par la facture
                             adossée à l'encaissement,                        règlements ultérieurs :
                             SANS nouvelle écriture                           record_customer_payment
```

**La règle de la monnaie, transcrite sans interprétation** :

```
Net à payer       =  pos_sale_total(vente)          (après remise)
Montant donné     =  Σ pos_payments.tendered_amount
Montant encaissé  =  Σ pos_payments.applied_amount
Monnaie à rendre  =  donné − encaissé

L'ÉCRITURE DE TRÉSORERIE PORTE Σ applied_amount.  JAMAIS Σ tendered_amount.
```

Garantie par `fn_treasury_entry_source`, qui compare l'écriture à sa vente et
refuse toute autre combinaison — exactement comme elle refuse déjà une écriture
de règlement qui ne reprendrait pas le compte, le montant et le sens du sien.

**UX** : desktop-first, clavier/souris, **jamais tactile**. `Ctrl+K` recherche,
`↑↓` naviguent, `Entrée` ajoute, `F2` valide, `Échap` annule. Raccourcis
**annoncés à l'écran**. Liste dense, aucune grille de vignettes. Sous 900 px, le
panier passe sous la saisie et le total devient une barre collante — on
réorganise, on ne rétrécit pas (`CLAUDE.md` §35). Reçu **A4**, pas ticket 80 mm.

---

# 8. Architecture technique cible

## 8.1 Les seize doctrines

Les quinze du Plan 01 §2.3 sont reconduites **sans exception**. **D16**
(§5.3) s'y ajoute. Deux méritent un rappel, parce que ce plan les met à
l'épreuve :

- **D1 — aucun montant stocké.** Total de vente, total de session, écart de
  caisse, commission, marge : **tout est une fonction SQL**. Un écart de caisse
  stocké mentirait dès qu'une vente serait annulée après la clôture.
- **D4 — aucune fonction métier `SECURITY DEFINER`.** Y compris les résolveurs
  de prix : un appelant sans la capacité de lecture du coût **ne lit rien**, et
  le résolveur ne renvoie **aucune ligne**.

## 8.2 Patron obligatoire par table nouvelle

```sql
revoke all    on public.<table> from anon;
revoke delete on public.<table> from authenticated;
alter table   public.<table> enable row level security;

create policy <table>_select on public.<table>
  for select to authenticated
  using ((select public.has_permission('<module>.<menu>.view')));
```

Le **sous-select** n'est pas un détail de style : sans lui, `has_permission` est
évaluée **une fois par ligne**. Sur une liste de services ou de ventes, c'est la
différence entre un écran et une attente.

## 8.3 Fonctions — règles invariables

1. `security invoker`, `set search_path = public, pg_temp`.
2. `require_capability('<code>')` **en première instruction**.
3. `revoke execute … from public, anon` puis `grant … to authenticated, service_role`.
4. **La cohérence avant l'acteur** : les contrôles de cohérence métier se placent
   **avant** tout test `current_actor() is null`, faute de quoi la clé de service
   contourne les règles.
5. **Une garde qui compte doit compter la vérité** : un déclencheur de protection
   qui lit à travers RLS conclut « aucun » et laisse passer.

---

# 9. Impact base de données

## 9.1 Tables nouvelles — 22

| Lot | Table | Rôle | `backup_scope` |
| :-: | --- | --- | :-: |
| 20 | `service_categories` | Catégories de services | ✅ |
| 20 | `services` | Identité du service | ✅ |
| 20 | `service_variants` | Identité de la variante — **sans prix** | ✅ |
| 20 | **`service_variant_prices`** | **Versions datées du prix de vente** | ✅ |
| 20 | **`service_variant_costs`** | **Versions datées du prix d'achat** — table séparée (§6.3) | ✅ |
| 21 | `supplier_vehicle_rates` | Versions datées du coût d'acquisition | ✅ |
| 22 | **`rental_amendments`** | **L'avenant — l'acte** (A-4) | ✅ |
| 22 | `rental_segments` | Véhicule + période + prix et coût verrouillés | ✅ |
| 23 | `rental_billing_periods` | Période facturable d'une longue durée | ✅ |
| 25 | `sales_quotes` · `sales_quote_lines` | Devis clients | ✅ |
| 25 | `sales_orders` · `sales_order_lines` | Commandes clients | ✅ |
| 26 | `purchase_quotes` · `purchase_quote_lines` | Devis fournisseurs | ✅ |
| 26 | `purchase_orders` · `purchase_order_lines` | Commandes fournisseurs | ✅ |
| 27 | `pos_registers` | Caisse, adossée à un compte `CASH` | ✅ |
| 27 | `pos_sessions` | Ouverture/fermeture, caissier, montants | ✅ |
| 28 | `pos_sales` · `pos_sale_lines` | Vente au comptoir | ✅ |
| 28 | `pos_payments` | Un mode : donné, encaissé | ✅ |

`rental_extensions` du Plan 01 **disparaît**, absorbée par `rental_amendments`.

## 9.2 Colonnes ajoutées à des tables existantes

| Table | Colonne | Lot | Raison |
| --- | --- | :-: | --- |
| `rentals` | `rental_type` (`FIXED_TERM` par défaut) | 23 | Distinguer les deux régimes |
| `rentals` | `current_segment_id` | 22 | Segment ouvert, sans sous-requête |
| `vehicle_occupations` | `rental_segment_id` (nullable) | 22 | Rattacher l'occupation à **son** segment |
| `customer_invoices` | `billing_period_id` (nullable) | 23 | Remplace « une facture par location » |
| `customer_invoices` | `sales_order_id` (nullable) | 25 | Facture née d'une commande |
| `customer_invoices` | `pos_sale_id` (nullable) | 28 | **A-11** — facture sur demande |
| `customer_invoice_lines` | `service_id`, `service_variant_id`, `source_order_line_id` | 25 | Ligne de service |
| `customer_payments` | `pos_sale_id` (nullable) | 28 | **A-11** — le règlement **est** l'encaissement PDV |
| `supplier_invoice_lines` | `service_id`, `service_variant_id`, `quantity`, `unit_price` | 26 | Ligne de service achetée |
| `supplier_invoices` | `purchase_order_id` (nullable) | 26 | Facture née d'une commande |
| `treasury_entries` | `pos_sale_id` (nullable) | 28 | **5ᵉ origine** |
| `app_users` | *(aucune)* | 19 | La réinitialisation **réemploie** `must_change_password` |

**Toutes nullables. Aucune donnée existante n'est modifiée.**

## 9.3 Le coût copié — cohérence avec le §6

Le Plan 01 plaçait `unit_cost` sur `customer_invoice_lines`. Si le prix d'achat
sort de la variante pour des raisons de confidentialité, **le coût copié doit
sortir de la ligne pour la même raison** — sinon la confidentialité est
contournable par la facture.

🟦 **RECOMMANDATION** : une table `commercial_line_costs` unique, portant le coût
copié de toute ligne commerciale (facture, devis, commande, vente PDV), gardée
par `catalog.services.cost.view`. **Une seule table, un seul patron RLS, un seul
raisonnement** — plutôt que quatre tables de coûts symétriques.

🟥 **À VALIDER (technique, tranchable pendant le LOT 20)** : une table unique
polymorphe, ou une table par document ? La table unique contredit légèrement
C-3 du Plan 01 (« tables explicites plutôt qu'un modèle polymorphe »), mais il
s'agit ici d'un **attribut technique homogène**, pas d'un objet métier.

## 9.4 Index et contraintes structurants

| Objet | Lot | Rôle |
| --- | :-: | --- |
| `exclude gist` sur chaque table de versions | 20, 21 | **Aucun chevauchement** de versions actives (§5.5) |
| `exclude gist (rental_id, period)` sur `rental_segments` | 22 | Les segments d'une location ne se recouvrent pas |
| `unique (rental_id) where status = 'ACTIVE'` | 22 | **Un seul segment ouvert** |
| **Remplacement** de `customer_invoices_one_per_rental_idx` | 23 | Deux index **disjoints** — §19.3 |
| `unique (register_id) where status = 'OPEN'` | 27 | Une seule session ouverte par caisse |
| `gist` sur `tstzrange(opened_at, closed_at)` | 27 | « Qui était en caisse le J à 10 h ? » — instantané |
| `check (applied_amount <= tendered_amount)` | 28 | On n'encaisse pas plus qu'on ne reçoit |
| `check (method = 'CASH' or applied = tendered)` | 28 | Pas de monnaie rendue sur un chèque ou un transfert mobile |

## 9.5 Énumérations

| Type | Action | Valeurs |
| --- | --- | --- |
| `service_purpose` | créer | `PURCHASE` · `SALE` · `BOTH` |
| `service_status` | créer | `ACTIVE` · `INACTIVE` · `ARCHIVED` |
| `supplier_rate_unit` | créer | `DAY` · `FLAT` — 🟩 **A-1 : pas de `MONTH`**, non coché |
| `rental_type` | créer | `FIXED_TERM` · `LONG_TERM` |
| `rental_segment_status` | créer | `ACTIVE` · `ENDED` · `CANCELLED` |
| `rental_amendment_type` | créer | `VEHICLE_CHANGE` · `EXTENSION` · `RATE_CHANGE` |
| `commercial_document_status` | créer | `DRAFT` · `SENT` · `ACCEPTED` · `REFUSED` · `CONVERTED` · `CANCELLED` |
| `order_status` | créer | `DRAFT` · `CONFIRMED` · `DELIVERED` · `INVOICED` · `CANCELLED` |
| `pos_session_status` | créer | `OPEN` · `CLOSED` |
| `pos_sale_status` | créer | `VALIDATED` · `CANCELLED` |
| `payment_method` | **étendre** | `+ MVOLA` `+ HOLO` `+ WAKATI` — 🟩 A-9 |
| `treasury_entry_kind` | **étendre** | `+ POS_SALE` |

> ⚠️ `alter type … add value` ne peut pas être suivi, **dans la même
> transaction**, d'une utilisation de la valeur ajoutée. Chaque extension part
> donc dans une **migration dédiée, sans autre contenu**, appliquée avant celle
> qui la consomme.

---

# 10. Impact permissions

🟩 **DÉCISION A-14 : permissions indépendantes par action.** Aucune capacité
transversale n'est implicitement incluse dans une autre.

## 10.1 Progression du catalogue

| Lot | Périmètre | + | Total |
| :-: | --- | :-: | :-: |
| — | **Existant** | | **178** |
| **19** | `users.users.password.reset` | **+1** | **179** |
| **20** | `catalog.*` — services et catégories | **+12** | **191** |
| **21** | `rental.pricing.supplier.*` | **+4** | **195** |
| **22** | `rental.rentals.swap` | **+1** | **196** |
| **23** | *(aucune — sauf décision A-7)* | +0 | 196 |
| **24** | *(aucune — la synthèse est le 4ᵉ document du cycle)* | +0 | 196 |
| **25** | `commerce.sales_quotes.*` · `commerce.sales_orders.*` | **+16** | **212** |
| **26** | `commerce.purchase_quotes.*` · `commerce.purchase_orders.*` | **+16** | **228** |
| **27** | `pos.registers.*` · `pos.sessions.*` | **+9** | **237** |
| **28** | `pos.sales.*` | **+8** | **245** |

**67 capacités nouvelles · 178 → 245.** Chiffres **proposés**, arrêtés lot par
lot après validation.

## 10.2 Détail des capacités nouvelles

### LOT 19 — Utilisateurs

| Code | Action | Sensible | Libellé |
| --- | --- | :-: | --- |
| `users.users.password.reset` | ADMIN | ✓ | Réinitialiser le mot de passe |

### LOT 20 — `catalog` *(module_order 10)* · menus `services`, `categories`

| Code | Action | Sensible | Libellé |
| --- | --- | :-: | --- |
| `catalog.services.view` | VIEW | | Consulter les services |
| `catalog.services.create` | CREATE | | Créer un service |
| `catalog.services.update` | UPDATE | | Modifier un service |
| `catalog.services.archive` | ARCHIVE | | Activer / désactiver / archiver |
| `catalog.services.export` | EXPORT | ✓ | Exporter la liste |
| `catalog.services.price.update` | UPDATE | ✓ | **Modifier les prix de vente** |
| `catalog.services.cost.view` | VIEW | ✓ | **Voir les prix d'achat** |
| `catalog.services.cost.update` | UPDATE | ✓ | **Saisir les prix d'achat** |
| `catalog.categories.view` | VIEW | | Consulter les catégories |
| `catalog.categories.create` | CREATE | | Créer une catégorie |
| `catalog.categories.update` | UPDATE | | Modifier une catégorie |
| `catalog.categories.archive` | ARCHIVE | | Activer / désactiver |

**Pourquoi aucune capacité « historique des prix »** : l'historique de vente ne
montre rien de plus que ce que `catalog.services.view` ouvre déjà ; l'historique
d'achat vit dans une table déjà gardée par `catalog.services.cost.view`. Une
capacité de plus **ne fermerait rien**.

### LOT 21 — Tarification fournisseur

`rental.pricing.supplier.view` ✓ · `.create` ✓ · `.update` ✓ · `.export` ✓
**— aucune capacité de marge** (§10.4).

### LOT 22 — Avenant et changement de véhicule

`rental.rentals.swap` (UPDATE, sensible ✓).
**`rental.pricing.override` est réemployée** pour forcer un tarif (A-5, §1.4).

### LOT 25 · 26 — Commerce

`view` · `create` · `update` · `validate` · `cancel` · `export`✓ · `download`✓ ·
`print`✓ — pour chacun des quatre menus.

### LOT 27 — PDV, caisses et sessions

`pos.registers.view` · `.create` · `.update` · `.archive` ·
`pos.sessions.view` · `pos.sessions.amounts.view` ✓ · `.open` · `.close` ·
`.export` ✓

**`pos.sessions.amounts.view` est la capacité la plus importante du lot** : un
responsable de planning doit savoir **qui** était en caisse sans voir
**combien** il y avait dedans. C'est elle qui donne à `pos.sessions.view` sa
raison d'être.

### LOT 28 — PDV, ventes

| Code | Action | Sensible | Libellé |
| --- | --- | :-: | --- |
| `pos.sales.view` | VIEW | | Consulter les ventes |
| `pos.sales.create` | CREATE | | Encaisser une vente |
| **`pos.sales.discount`** | ADMIN | ✓ | **Accorder une remise** — A-10 |
| **`pos.sales.credit`** | ADMIN | ✓ | **Valider une vente non soldée** — A-10 |
| `pos.sales.cancel` | CANCEL | ✓ | Annuler une vente |
| `pos.sales.download` | DOWNLOAD | ✓ | Télécharger un reçu |
| `pos.sales.print` | PRINT | ✓ | Imprimer un reçu |
| `pos.sales.export` | EXPORT | ✓ | Exporter les ventes |

**Pourquoi `discount` et `credit` séparées de `create`** : encaisser 60 000 sur
60 000 dus et accorder 10 000 de remise ne sont pas le même geste. Un caissier
encaisse ; consentir un rabais ou un crédit engage ADIKOM. C'est exactement
A-14.

## 10.3 Ce qui n'est **pas** créé

| Non créé | Raison |
| --- | --- |
| `*.margin.view` | Une marge est la différence de deux grandeurs **déjà gouvernées**. Une capacité de plus ne fermerait **rien** — et une permission qui ne débloque rien ne s'attribue pas (`CLAUDE.md` §19 bis, DEC-042 §d) |
| `rental.rentals.rate.override` | **`rental.pricing.override` existe déjà** (§1.4) |
| `catalog.*.price.history.view` | Rien à fermer (§10.2) |
| `rental.rentals.summary.*` | La synthèse est le 4ᵉ document du cycle, sous `rental.rentals.download` / `.print` |
| `catalog.products.*` | La partie Produits n'existe pas |
| `pos.sessions.variance.view` | L'écart est une soustraction de deux montants qu'`amounts.view` ouvre déjà |
| `rental.rentals.penalty.*` | **A-7 non tranchée.** On ne crée pas une permission pour une fonctionnalité qui n'existe pas |

## 10.4 Groupes système

🟥 **À VALIDER** — l'affectation des 67 capacités aux six groupes système. La
proposition du Plan 01 §17.5 reste valable, augmentée de :

| Groupe | Ajouts |
| --- | --- |
| Direction | Toutes, y compris `users.users.password.reset` |
| Resp. Administration & Finance | `users.users.password.reset` · `pos.sales.credit` · `pos.sales.discount` |
| Assistant(e) de direction | `pos.sales.*` **sauf** `credit`, `discount`, `cancel` |

**`users.users.password.reset` n'est attribuée qu'aux profils qui assurent
réellement le support des accès.**

---

# 11. Impact RLS

## 11.1 Par table nouvelle — le patron du §8.2, sans exception

## 11.2 Les tables sensibles — lecture gardée par **leur propre** capacité

| Table | `select` gardé par |
| --- | --- |
| `service_variant_costs` | `catalog.services.cost.view` |
| `supplier_vehicle_rates` | `rental.pricing.supplier.view` |
| `commercial_line_costs` | `catalog.services.cost.view` |
| `pos_sessions` *(colonnes de montants)* | **voir §11.4** |

## 11.3 Le cas `app_users` — la difficulté du LOT 19

Détaillée au §4.2. En résumé :

```sql
-- Policy dédiée : la réinitialisation n'est PAS incluse dans users.users.update
create policy app_users_password_reset on public.app_users
  for update to authenticated
  using      ((select public.has_permission('users.users.password.reset')))
  with check ((select public.has_permission('users.users.password.reset')));

-- ... et un déclencheur qui, par cette voie, refuse toute écriture portant sur
-- une autre colonne que must_change_password lorsque l'acteur ne détient pas
-- users.users.update. Même forme que fn_prevent_self_promotion.
```

⚠️ **Piège connu, à traiter les yeux ouverts** : une policy `for update` exige
aussi la **lecture** des lignes visées. Sans droit de `select` sur `app_users`,
l'`UPDATE` **ne modifie rien et ne dit rien**. `users.users.password.reset` doit
donc être **accompagnée** de `users.users.view` — et la recette doit le vérifier
**au profil minimal**, pas avec un Super Admin.

## 11.4 🟥 Sessions de caisse — une policy par ligne

Le Plan 01 posait la question (B-13) : un caissier voit-il **ses propres**
montants de session ? Il doit compter sa caisse — donc oui.

🟦 **RECOMMANDATION** : la policy de lecture des montants de session est
**par ligne** —

```
pos.sessions.amounts.view   OU   cashier_id = current_actor()
```

C'est le premier objet du SaaS dont la lecture dépend de **qui est sur la
ligne**. Cela doit être écrit explicitement, testé positivement **et**
négativement (le caissier A ne voit pas les montants de la session du caissier B),
et `has_permission` enveloppée dans un sous-select.

---

# 12. Impact audit

| Acte | Type | Module | Avant/après |
| --- | --- | --- | --- |
| **Réinitialisation d'un mot de passe** | `UPDATE` | `users` | `must_change_password` — **jamais le mot de passe** |
| Création / modification d'une version de prix de vente | **`PRICE_CHANGE`** | `catalog` | ✅ |
| Création / modification d'une version de prix d'achat | **`PRICE_CHANGE`** | `catalog` | ✅ |
| Création / modification d'un tarif fournisseur | **`PRICE_CHANGE`** | `rental` | ✅ |
| Tarif **forcé** sur un segment (`rental.pricing.override`) | **`PRICE_CHANGE`** | `rental` | ✅ **avec motif obligatoire** |
| Avenant (changement de véhicule, prolongation, retarification) | `UPDATE` | `rental` | ✅ + motif |
| Ouverture / clôture de session de caisse | `CREATE` / `VALIDATE` | `pos` | montants |
| Vente, remise, vente non soldée, annulation | `CREATE` / `CANCEL` | `pos` | ✅ |
| Facture émise sur demande d'une vente | `CREATE` | `billing` | ✅ |

**Deux règles de fond** :

1. **Aucun mot de passe, en clair ou en empreinte, n'entre jamais dans le
   journal.** Le journal enregistre *qu'une réinitialisation a eu lieu*, par qui,
   sur qui, quand.
2. **L'historisation des prix ne remplace pas l'audit.** La table de versions
   dit **quel prix s'applique** ; le journal dit **qui l'a décidé et pourquoi**.
   Deux questions différentes.

---

# 13. Impact sauvegarde / réinitialisation / restauration

## 13.1 La surface la plus facile à oublier

`public.backup_scope()` (migration 075) énumère **44 tables**, des parents vers
les enfants. **Une table absente n'est ni exportée, ni réinitialisée, ni
restaurée** — et après restauration, elle référence des lignes disparues.

## 13.2 Ce que chaque lot doit ajouter

| Lot | Tables à ajouter | Nouveau total |
| :-: | --- | :-: |
| 19 | **aucune** — `app_users` n'est pas dans le périmètre (les comptes en sont exclus par principe) | 44 |
| 20 | `service_categories`, `services`, `service_variants`, `service_variant_prices`, `service_variant_costs` | 49 |
| 21 | `supplier_vehicle_rates` | 50 |
| 22 | `rental_amendments`, `rental_segments` | 52 |
| 23 | `rental_billing_periods` | 53 |
| 25 | `sales_quotes`, `sales_quote_lines`, `sales_orders`, `sales_order_lines` | 57 |
| 26 | `purchase_quotes`, `purchase_quote_lines`, `purchase_orders`, `purchase_order_lines` | 61 |
| 27 | `pos_registers`, `pos_sessions` | 63 |
| 28 | `pos_sales`, `pos_sale_lines`, `pos_payments`, `commercial_line_costs` | 67 |

**L'ordre parents → enfants est impératif** : une restauration qui insère une
ligne de prix avant sa variante échoue.

## 13.3 Règle de lot

> **Chaque lot livre sa propre migration de périmètre de sauvegarde, et
> `verify:backup` passe avant la clôture du lot.** Le repousser « à la fin »
> garantit l'oubli.

**Point favorable pour le LOT 19** : la réinitialisation de mot de passe
**n'a aucun impact** sur la sauvegarde. `app_users` n'est pas dans le périmètre,
et aucune colonne n'est ajoutée.

---

# 14. Dépendances entre lots

## 14.1 Graphe

```
   LOT 19  Réinit. mot de passe + dette du catalogue
      │    INDÉPENDANT de tout le reste
      │    (mais la dette du catalogue doit précéder tout ajout de capacité)
      ▼
   LOT 20  SERVICES + socle d'historisation D16
      │         │
      │         └──────────────────────────┐
      ▼                                    ▼
   LOT 21  Tarif fournisseur & marge    LOT 25  Commerce client
      │    (réemploie D16)                  │   (lignes de service en facture)
      ▼                                     ▼
   LOT 22  Avenants & segments           LOT 26  Commerce fournisseur
      │                                     │
      ▼                                     ▼
   LOT 23  Longue durée & facturation    LOT 27  Caisses & sessions
      │    [BLOQUÉ par A-7 et P-3]          │
      ▼                                     ▼
   LOT 24  Synthèse de location          LOT 28  Ventes & encaissement
                                             [dépend de 25 — décision A-11]
                                             [BLOQUÉ par P-4]
```

## 14.2 Les huit dépendances dures

| # | Dépendance | Raison |
| :-: | --- | --- |
| 1 | **19 avant tout ajout de capacité** | La dette du total `178`, présente dans **35 fichiers**, doit être soldée avant que le catalogue ne bouge — sinon chaque lot casse 35 recettes |
| 2 | **20 avant 21** | Le socle d'historisation (D16) est posé sur les services, le plus simple, avant d'être réemployé sur les coûts fournisseurs |
| 3 | **21 avant 22** | Un segment **verrouille un coût dès sa création** : le coût doit exister |
| 4 | **22 avant 23** | Une prolongation peut changer de véhicule **et** de tarif. L'inverse imposerait de livrer une prolongation qui ignore le véhicule, puis de la reprendre |
| 5 | **22 et 23 avant 24** | La synthèse présente les segments, les avenants et les factures de période |
| 6 | **20 avant 25** | Un devis porte des lignes de service |
| 7 | **25 avant 28** 🆕 | **Décision A-11** : une vente PDV produit une facture sur demande, laquelle porte des lignes de service. Ces colonnes arrivent au LOT 25 |
| 8 | **27 avant 28** | Une vente exige une session ouverte. Livrer la vente d'abord obligerait à inventer une session provisoire |

**La dépendance n° 7 est nouvelle**, et elle est la conséquence directe d'une
décision de la Direction. Le Plan 01 l'avait anticipée (§23.2) en la
conditionnant à A-11 : la condition est réalisée.

## 14.3 Ce qui reste parallélisable

```
Fil A — LOCATION         20(historisation) → 21 → 22 → 23 → 24
Fil B — COMMERCE / PDV   20(catalogue)     → 25 → 26 → 27 → 28
```

**Point de croisement unique** : `customer_invoices` / `customer_invoice_lines`,
touchées par le LOT 23 (`billing_period_id` sur l'en-tête) et par le LOT 25
(colonnes de service sur les lignes). Ces deux migrations doivent être
**ordonnées entre elles**, jamais concurrentes.

Le **LOT 19 est hors des deux fils** et peut être livré immédiatement.

---

# 15. Ordre recommandé des lots

## 15.1 La séquence

| Ordre | Lot | Pourquoi ici | Risque | Charge |
| :-: | --- | --- | :-: | :-: |
| **1** | **19 · Mot de passe + dette du catalogue** | **Aucune dépendance, aucune décision en attente, valeur immédiate.** Solde la dette des 35 fichiers **avant** que le catalogue ne bouge, et éprouve la discipline sur **une seule capacité** plutôt que sur douze | Faible | **Faible** |
| **2** | **20 · Services + historisation** | Additif pur. **Pose D16** sur le domaine le plus simple. Débloque Commerce **et** PDV. Ne dépend que de P-5 et P-7 | Faible | Forte |
| **3** | **21 · Tarif fournisseur & marge** | Additif pur. Répond à **DEC-007**, ouverte depuis le 19 août 2026. Doit précéder les segments | Moyen | Moyenne |
| **4** | **22 · Avenants & segments** | **Le lot le plus risqué.** À placer **tôt**, quand les lots suivants peuvent encore absorber une correction — pas à la fin, où un défaut de calendrier se découvre en production | **Élevé** | **Forte** |
| **5** | **23 · Longue durée & facturation périodique** | Dépend des segments. **Bloqué par A-7 et P-3** | **Élevé** | Forte |
| **6** | **24 · Synthèse de location** | **Aucune migration.** Respiration après deux lots lourds, et démonstration visible | Faible | Faible |
| **7** | **25 · Commerce client** | Dépend de 20. Introduit les lignes de service dans la facture | Moyen | Forte |
| **8** | **26 · Commerce fournisseur** | Symétrique, la forme étant acquise | Moyen | Moyenne |
| **9** | **27 · Caisses & sessions** | **Livré avant les ventes** | Moyen | Moyenne |
| **10** | **28 · Ventes & encaissement** | **Le seul lot qui touche à la trésorerie.** Dépend de 20, 25 et 27. **Bloqué par P-4** | **Élevé** | Forte |

## 15.2 Correspondance avec le Plan 01

| Plan 02 | Plan 01 | Évolution |
| :-: | :-: | --- |
| **19** | — | 🆕 Réinitialisation du mot de passe + dette du catalogue |
| **20** | 19 | + **historisation des prix** (tables de versions, résolveurs) |
| **21** | 20 | + **coût interne des véhicules ADIKOM** (A-3) |
| **22** | 21 | + **`rental_amendments`** (A-4), réemploi de `rental.pricing.override` (A-5) |
| **23** | 22 | + pénalités **suspendues** (A-7), question du relevé global (A-6) |
| **24** | 23 | + **relevé de période** pour les longues durées (A-6) |
| **25** | 24 | inchangé |
| **26** | 25 | inchangé |
| **27** | 26 | inchangé |
| **28** | 27 | + **remise**, **vente non soldée** (A-10), **facture sur demande** (A-11) |

## 15.3 Pourquoi le LOT 19 en premier

Trois raisons, dont deux techniques :

1. **Aucune décision ne le bloque.** Tous les autres attendent au moins une
   réponse. Commencer par lui, c'est produire de la valeur pendant que la
   Direction délibère.
2. **Il solde la dette du catalogue au meilleur moment.** Le total `178` est
   écrit en dur dans **35 fichiers**. Sans correction, les six lots qui ajoutent
   des capacités imposeraient **plus de 200 éditions**, chacune une occasion de
   casser une recette. Le remède : **une seule assertion du total**, dans la
   dernière migration du lot, les recettes portant la **présence nominative** des
   codes qu'elles éprouvent — ce qu'elles font déjà par ailleurs.
3. **Il éprouve la discipline sur une seule capacité.** Si la nouvelle façon de
   compter a un défaut, on le découvre sur **une** permission, pas sur douze.

## 15.4 Ce que la Direction doit rendre, et quand

| À rendre avant | Points |
| --- | --- |
| **Rien** | **LOT 19** peut commencer immédiatement |
| **LOT 20** | **P-5** (prix d'achat unique ou par fournisseur) · **P-7** (confirmation A-8) |
| **LOT 21** | **P-2** (coût interne ADIKOM) · **P-6** (type de client, destination) · P-1 |
| **LOT 23** | **P-0 (A-7)** · **P-3** (facture globale) |
| **LOT 28** | **P-4** (crédit sans client) |

---

# 16. Risques

## 16.1 Risques métier

| Risque | Prob. | Impact | Atténuation |
| --- | :-: | :-: | --- |
| **A-7 n'est pas tranchée et le LOT 23 attend** | Élevée | **Bloquant** | §3.1 pose la question en une phrase. Le LOT 23 peut être livré **sans pénalités**, le changement de tarif restant manuel |
| **La « facture globale » est comprise comme une facture** | **Élevée** | **Critique** | §3.3. Une double facturation se découvre au relevé bancaire, des semaines plus tard |
| **Un crédit PDV anonyme devient irrécouvrable** | Moyenne | Élevé | §3.4 : pas de crédit sans client identifié |
| **Une marge est prise pour une rentabilité** | Élevée | Élevé | Chaque écran **nomme** sa marge et **énumère** ce qu'elle ne couvre pas |
| **Un tarif fournisseur apparaît sur un document client** | Moyenne | **Critique** | §6.3 — trois barrières, dont une structurelle. Recette dédiée : le PDF d'un profil commercial **ne contient pas** la chaîne de coût |
| **Les Produits sont demandés en cours de route** | Moyenne | Élevé | §4.4 : entrepôts, stocks, mouvements, valorisation. C'est un plan à part entière |

## 16.2 Risques techniques

| Risque | Prob. | Impact | Atténuation |
| --- | :-: | :-: | --- |
| **La migration des segments abîme des locations réelles** | Moyenne | **Critique** | Sauvegarde avant · schéma et données en migrations séparées · recette comptant **exactement 1 segment par location** · réversibilité documentée |
| **Le remplacement de l'index d'unicité ouvre la double facturation** | Moyenne | **Critique** | Deux index partiels **disjoints** · recette de double facturation dans **les deux** régimes |
| **La contrainte anti-chevauchement échoue sur des données existantes** | Moyenne | Élevé | §5.7 : **recenser avant**. Une contrainte d'exclusion ne s'ajoute pas `NOT VALID` |
| **La 5ᵉ origine de trésorerie casse les quatre autres** | Faible | **Critique** | Contrainte, déclencheurs et policy révisés **ensemble** · `treasury.sql` et `transfers.sql` rejoués |
| **Double comptage trésorerie sur une facture PDV** | **Élevée** | **Critique** | §3.5 : la facture est **adossée** à l'encaissement. Recette : vente 60 000 puis facture → **le solde du compte reste 60 000** |
| **Le catalogue diverge entre TS, SQL et 35 recettes** | Élevée | Élevé | **LOT 19 en tête** |
| **Une table oubliée dans `backup_scope()`** | Élevée | Élevé | §13.3 : une migration de périmètre **par lot** |
| **Lenteur des listes** (`has_permission` par ligne) | Moyenne | Moyen | Sous-select systématique |
| **`current_date` UTC sur une clôture de caisse du soir** | Moyenne | Moyen | §5.6 : `now() at time zone 'Indian/Comoro'` |
| **La policy de réinitialisation ouvre plus que prévu** | Moyenne | **Critique** | §11.3 : policy **+** déclencheur restreignant les colonnes. Recette négative : un porteur de `password.reset` **ne peut pas** modifier une autre colonne |
| **Escalade par réinitialisation du Super Admin** | Faible | **Critique** | §4.2 : refus côté serveur **et** en base |

## 16.3 Risques de projet

| Risque | Atténuation |
| --- | --- |
| **Périmètre considérable** : 10 lots, 22 tables, 67 capacités, 3 modules | Le découpage permet de **s'arrêter après n'importe quel lot** avec un produit cohérent |
| **Les deux fils divergent** | Un seul point de croisement (§14.3), explicitement ordonné |
| **La documentation fonctionnelle est écrite après le code** | Elle fait partie du lot, **avant** le premier `create table` (`CLAUDE.md` §2) |
| **`CLAUDE.md` §10 contredira le produit** (9 modules vs 12) | Mise à jour au LOT 20 |

---

# 17. Points bloquants — synthèse

| # | Point | Lot bloqué | Question à poser |
| :-: | --- | :-: | --- |
| **P-0** | **A-7 — pénalités** | **23** | Majoration du tarif ou ligne distincte ? Base du pourcentage ? Qui fixe le taux ? |
| **P-2** | Coût interne ADIKOM | **21** | Tarif de référence fixé, ou coût de revient calculé ? |
| **P-3** | Facture globale | **23** | Relevé récapitulatif, ou facture remplaçant les mensuelles ? |
| **P-4** | Crédit PDV | **28** | Un paiement différé suppose-t-il un client identifié ? |
| **P-5** | Prix d'achat des services | **20** | Un prix unique, ou un prix par fournisseur ? |
| **P-6** | Axes tarifaires | **21** | Tarif par type de client ? Qu'est-ce qu'une destination ? |
| **P-7** | Lecture de A-8 | **20** | Confirmer que A-8 = Oui |

**Aucun ne bloque le LOT 19.**

---

# 18. Critères de validation par lot

## 18.1 Communs à tous les lots

- [ ] `lint`, `typecheck`, `test`, `build` — verts
- [ ] Les **21 recettes SQL** passent **sans modification**, sauf celles que le lot fait évoluer explicitement
- [ ] `verify:capabilities` passe
- [ ] `demo:seed` puis `demo:clean` passent **dans les deux sens**, sans résidu
- [ ] `verify:backup` passe — **la sauvegarde couvre les tables nouvelles**
- [ ] `verify:responsive` passe à 390, 768 et 1440 px
- [ ] Contrôles **positifs et négatifs** pour **chaque** capacité nouvelle
- [ ] Aucune fonction `SECURITY DEFINER` ajoutée sans justification écrite
- [ ] `revoke` / `grant` sur **chaque** fonction créée
- [ ] Aucun secret dans le code, la documentation ou les commits
- [ ] Documentation fonctionnelle du périmètre écrite **avant** le code
- [ ] Décision consignée au journal (**DEC-043** et suivantes)
- [ ] `verify:production` passe après déploiement
- [ ] Rapport Markdown dans `RAPPORTS/`

## 18.2 Par lot

**LOT 19** — Un administrateur porteur de `users.users.password.reset` réinitialise
le mot de passe d'un collaborateur ; le temporaire est **affiché une fois** et
**copiable** ; l'utilisateur se connecte et est **détourné vers l'écran de
changement** ; il choisit son mot de passe ; l'administrateur ne le connaît
jamais. **Négatif** : un porteur de `users.users.update` **seul** ne peut pas
réinitialiser ; un porteur de `password.reset` **seul** ne peut modifier **aucune
autre colonne** d'`app_users` ; un non-Super-Admin ne peut pas réinitialiser le
mot de passe du Super Admin ; personne ne réinitialise le sien. **Aucun mot de
passe dans le journal d'audit.** Le catalogue n'a **plus qu'une seule** assertion
de total.

**LOT 20** — Un service se crée, se catégorise, reçoit des variantes. **Un prix
change : l'ancienne version se clôt, la nouvelle s'ouvre, aucune ne se réécrit.**
Le scénario de la Direction se joue : 100 KMF jusqu'au 30/06, 200 à partir du
01/07 — une opération datée du 15/06 prend **100**, une du 15/07 prend **200**,
et cela **sans attendre le 1ᵉʳ juillet pour saisir le second prix**. Deux versions
actives qui se chevauchent sont **refusées par la base**. Un lecteur sans
`cost.view` ne voit **ni** le prix d'achat **ni** la marge, et **l'écran le dit**.
Un appel PostgREST direct sur les coûts **échoue**.

**LOT 21** — Un tarif fournisseur se crée, se date, se désactive, et **ne se
chevauche pas**. `resolve_supplier_rate` renvoie **zéro ligne** sans tarif
configuré. Un véhicule ADIKOM porte un **coût interne** sans devenir `SUPPLIED`.
**`supabase/tests/location.sql` passe sans modification.** Aucun document client
ne porte de coût.

**LOT 22** — L'exemple de la Direction se joue de bout en bout : véhicule A à
50 000 du 01/09 au 10/09, panne, véhicule B à 60 000 du 11/09 au 20/09,
**même contrat, un avenant, deux périodes historiques**. Les deux tarifs et les
deux coûts sont conservés. Le calendrier est exact **pour les deux véhicules**.
Le cas « le client garde l'ancien tarif » se joue sous `rental.pricing.override`,
**avec motif obligatoire**. **Chaque location existante porte exactement un
segment.**

**LOT 23** — Un contrat 01/09 → 30/09 se prolonge au 31/10 : **deux factures**,
une par période. Une troisième sur la même période est **refusée**. Une location
à durée fixée refuse toujours une seconde facture. Une facture de période
**ne clôt pas** la location.

**LOT 24** — La synthèse se consulte, se télécharge, s'imprime, commence par
`%PDF`. Elle présente les véhicules, les tarifs, les avenants, **toutes** les
factures, les règlements et le solde. **Chaque bloc absent est nommé**, jamais tu.
**Aucun coût, aucune commission, aucune marge** pour un profil commercial.

**LOT 25** — Un devis se crée, s'envoie, s'accepte, devient commande, puis
facture — **sans qu'aucune fonction de facturation ne soit réécrite**. Une ligne
libre (A-13) est acceptée, **sans coût donc sans marge**, et l'écran le dit.

**LOT 26** — Symétrique. `amount = quantity × unit_price` **garanti par la base**.

**LOT 27** — Une session s'ouvre, se clôt avec un montant compté ; l'écart
s'affiche **sans bloquer**. « **Qui était en caisse le J entre 10h00 et 11h30 ?** »
trouve sa réponse. `pos.sessions.view` **n'ouvre pas** les montants. Un caissier
voit **les siens**, pas ceux d'un autre.

**LOT 28** — **Le test de référence de la Direction** : net 60 000, donné
100 000 → **encaissé 60 000**, **monnaie 40 000**, **la trésorerie enregistre
60 000, jamais 100 000**. Une remise ramène le net et la vente reste **soldée**.
Une vente non soldée **exige un client** et produit une facture dont le solde est
suivi. **Une facture émise sur demande d'une vente déjà encaissée ne crée aucune
seconde écriture** — le solde du compte ne bouge pas. Une écriture forgée par
appel direct est **refusée**. Une vente sans session ouverte est **refusée**.

---

# 19. Stratégie de migration des données existantes

## 19.1 Principe directeur

> **Aucune donnée existante n'est réinterprétée.** Une migration ajoute des
> lignes ou des colonnes nullables ; elle ne change jamais le sens de ce qui est
> déjà écrit. En particulier, **aucun `locked_*` n'est réécrit** : les tarifs
> déjà appliqués sont hors d'atteinte.

## 19.2 LOT 22 — segments : la seule migration de données réellement risquée

**Pour chaque location existante**, créer **exactement un** segment :

```
sequence_no      = 1
vehicle_id       = rentals.vehicle_id
period           = période réelle ou planifiée de la location
locked_amount    = rentals.locked_amount          ← COPIE, pas recalcul
locked_unit      = rentals.locked_unit
locked_rule_id   = rentals.locked_rule_id
locked_source    = rentals.locked_source
locked_at        = rentals.locked_at
locked_cost_*    = NULL                           ← aucun coût n'existait alors
status           = ACTIVE si la location est en cours, sinon ENDED
```

Puis rattacher les occupations : `vehicle_occupations.rental_segment_id` ← le
segment 1 de la location correspondante, **là où `source = 'RENTAL'`**.

**Cinq garanties exigées** :

1. **Migration de schéma et migration de données séparées** — on peut rejouer
   l'une sans l'autre.
2. **Sauvegarde complète avant application.** Le mécanisme existe (LOT 18).
3. **Recette de comptage** : `count(rental_segments) = count(rentals)`, et
   **aucune location sans segment**.
4. **Aucune valeur recalculée.** Une location dont le tarif verrouillé est
   « étrange » le reste : la migration copie, elle n'arbitre pas.
5. **Réversibilité documentée** : quelle migration inverse, et ce qu'elle ne sait
   pas défaire.

## 19.3 LOT 23 — l'index d'unicité des factures

**L'ordre est impératif**, et toute autre séquence ouvre une fenêtre pendant
laquelle une double facturation est possible :

```
1.  Ajouter customer_invoices.billing_period_id  (nullable)
        → toutes les factures existantes : NULL

2.  CRÉER les deux index de remplacement
        customer_invoices_one_per_fixed_rental_idx
            on (rental_id) where rental_id is not null
                            and billing_period_id is null
                            and status <> 'CANCELLED'
        customer_invoices_one_per_period_idx
            on (billing_period_id) where billing_period_id is not null
                                    and status <> 'CANCELLED'

3.  SEULEMENT ENSUITE, supprimer customer_invoices_one_per_rental_idx
```

**Les factures existantes ont `billing_period_id = NULL`** : elles restent donc
couvertes par le premier index, exactement comme avant. **Aucune location
existante ne devient facturable deux fois.**

## 19.4 LOT 23 — `rentals.rental_type`

`FIXED_TERM` **par défaut**. Toutes les locations existantes restent exactement
ce qu'elles sont, et le régime de facturation ne change pour aucune.

## 19.5 LOT 21 — `pricing_rules`

**Aucune migration de données.** Au plus une contrainte d'intégrité, et
seulement après le recensement du §5.7.

## 19.6 LOT 20 — services

**Aucune donnée existante** : le module est neuf. Les jeux DEMO devront
comporter des services à **plusieurs versions de prix**, dont une échue et une
future — sans quoi l'historisation ne serait jamais éprouvée en recette.

## 19.7 LOT 19 — mot de passe

**Aucune migration de données.** La colonne `must_change_password` existe déjà
(migration 011) et porte déjà la bonne valeur pour tous les comptes.

---

# 20. Stratégie de compatibilité avec l'existant

## 20.1 Les huit garanties de non-régression

| # | Garantie | Comment elle est tenue |
| :-: | --- | --- |
| 1 | **`resolve_pricing_rule` n'est pas modifiée** | Les résolveurs nouveaux ont des noms et des signatures différents. `supabase/tests/location.sql` est rejouée **sans modification** à chaque lot 21 → 24 |
| 2 | **Aucune colonne de `pricing_rules` n'est touchée** | Le coût fournisseur vit dans une table sœur |
| 3 | **Les tarifs déjà verrouillés sont inatteignables** | Aucune migration ne réécrit un `locked_*` |
| 4 | **Aucune fonction de facturation n'est réécrite** | Les fonctions nouvelles sont des **orchestrateurs** appelant `create_customer_invoice`, `add_customer_invoice_line`, `issue_customer_invoice`, `record_customer_payment` |
| 5 | **Une seule trésorerie** | `pos_registers.account_id` est **obligatoirement** un compte `CASH` actif. `financial_account_balance()` reste l'unique vérité du solde |
| 6 | **Aucun code de permission existant n'est modifié** | Un code attribué ne se touche pas. Les capacités nouvelles s'ajoutent ; `rental.pricing.override` est **réemployée**, pas redéfinie |
| 7 | **Aucune valeur d'énumération n'est retirée** | Seulement des ajouts, en migrations isolées |
| 8 | **Le mécanisme de mot de passe temporaire est intact** | `generateTemporaryPassword`, `must_change_password`, `requireUser`, `changePasswordAction`, `fn_prevent_self_promotion` : **aucun n'est modifié**. La réinitialisation les **réemploie** |

## 20.2 Les cinq surfaces à réviser à **chaque** lot

| Surface | Fichier / fonction | Conséquence d'un oubli |
| --- | --- | --- |
| **Périmètre de sauvegarde** | `public.backup_scope()` | Table ni exportée, ni réinitialisée, ni restaurée |
| **Catalogue de capacités** | `permissions.ts` ↔ `permissions.test.ts` ↔ migration | Le test de parité TS/SQL échoue |
| **Total du catalogue** | **une seule source après le LOT 19** | *(dette soldée)* |
| **Navigation** | `navigation.ts` + `sidebar.tsx` | Module invisible |
| **Registres** | `documents/registry.ts`, `exports/registry.ts` | Bouton mort, ou export sans contrôle |

## 20.3 Le rituel de fin de lot

```
lint · typecheck · test · build
        ↓
21 recettes SQL  +  recettes Node du périmètre
        ↓
verify:capabilities · verify:backup · verify:responsive
        ↓
demo:seed → demo:clean  (aucun résidu)
        ↓
GitHub → Vercel
        ↓
verify:production  (contre le sha réellement déployé)
        ↓
Rapport Markdown dans RAPPORTS/
```

## 20.4 Discipline de recette — les acquis à ne pas perdre

| Règle | Pourquoi |
| --- | --- |
| **Jamais de tube vers `head`** | `SIGPIPE` tue le script avant son nettoyage et laisse des résidus en base |
| **Aucune date en dur** | Une échéance figée finit par tomber dans le passé. `dayOffset(n)` sur `Indian/Comoro` |
| **Le nettoyage balaie par marqueur**, pas seulement par identifiants suivis | Une recette interrompue laisse des résidus invisibles |
| **La mise en place ne doit jamais échouer en silence** | Un `rpc` de construction dont on ignore l'erreur produit des dizaines de faux échecs |
| **Mesurer une variation, pas un total** | Comparer un indicateur global à une valeur absolue casse le jour où la démonstration s'étoffe |
| **Nommer les lectures qui n'ont jamais abouti** | Un lien coupé se lit sinon comme une panne applicative |
| **Attendre le libellé d'un effet**, pas `networkidle` | Sinon les recettes deviennent intermittentes |
| **Vérifier au profil minimal**, pas en Super Admin | Un verrou technique peut réclamer un droit que l'acte ne suppose pas |

---

# 21. Décisions à consigner au journal

Le journal (`00 Documentation/08_Decisions/01_Journal_des_Decisions.md`) s'arrête
à **DEC-042**. Ce plan en appelle quatre :

| Réf. | Objet |
| :-: | --- |
| **DEC-043** | **Doctrine D16 — historisation des prix.** Un prix est une ligne datée ; une opération en garde la copie (§5) |
| **DEC-044** | **Confidentialité des tarifs fournisseur** — trois barrières, et la règle absolue sur les documents (§6) |
| **DEC-045** | **L'avenant de location** — un acte, deux conséquences structurelles (§7.3) |
| **DEC-046** | **Réinitialisation du mot de passe** — capacité indépendante, garde en base, trois refus de sécurité (§4.2) |

Et **DEC-007** (nature du montant dû au fournisseur), ouverte depuis le 19 août
2026, est **close par A-1** : coût journalier contractuel, forfait possible,
conditions négociées comme versions plus spécifiques, **pas de tarif mensuel**.

---

# 22. Conclusion

## 22.1 Ce que ce plan établit

1. **Treize décisions sur quatorze sont rendues.** Le développement peut
   commencer.
2. **Six d'entre elles déplacent l'architecture du Plan 01**, dont deux
   renversements complets : l'historisation des prix, et le paiement partiel au
   comptoir.
3. **L'historisation n'est pas un mécanisme nouveau** : c'est la généralisation
   de ce que `pricing_rules` fait depuis le premier jour. Le Plan 01 avait tort
   de l'écarter, et ce plan dit pourquoi.
4. **La confidentialité du tarif fournisseur tient sur trois barrières**, dont
   une structurelle : la donnée sensible vit dans sa propre table, parce que RLS
   ne sait pas masquer une colonne.
5. **La réinitialisation du mot de passe réemploie l'existant** — pas une ligne
   du mécanisme validé n'est réécrite — et ferme trois chemins d'escalade.
6. **Le catalogue passe de 178 à 245 capacités**, aucune fourre-tout, aucune qui
   ne ferme rien. Une capacité dormante depuis le premier jour trouve enfin son
   emploi.

## 22.2 Ce que ce plan ne tranche pas

Sept points, tous nommés, tous accompagnés de la question exacte à poser.
**Aucune règle métier n'a été inventée pour les combler.** A-7 en particulier —
la fourchette de pénalités de 20 à 100 % — restera un refus explicite tant que
la Direction n'aura pas dit **de quoi** ce pourcentage est le pourcentage.

## 22.3 Le premier lot peut commencer

**Le LOT 19 n'attend rien.** Il solde une dette technique qui coûterait plus de
200 éditions sur les lots suivants, il livre une fonctionnalité attendue au
quotidien, et il éprouve la discipline du catalogue sur une seule capacité.

Les LOT 20 et 21 suivent dès que **P-5** et **P-7** sont confirmés — deux
questions d'une phrase chacune.

---

**PLAN — AUCUN CODE EXÉCUTÉ**

**CODE NON MODIFIÉ · BASE DE DONNÉES NON MODIFIÉE · PRODUCTION NON MODIFIÉE**

*ADIKOM PILOT — SaaS interne de gestion et de pilotage — ADIKOM Technology & Travel*
