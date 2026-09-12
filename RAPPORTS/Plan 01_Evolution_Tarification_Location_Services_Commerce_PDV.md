# Plan 01 — Évolution ADIKOM PILOT

## Tarification · Location · Produits & Services · Commerce · Point de vente

**Nature du document** : plan d'implémentation. Ce n'est pas un rapport de lot.
Aucune ligne de code, aucune migration, aucune permission, aucune donnée n'a été
modifiée pour le produire.

**Convention de nommage** : le dossier `RAPPORTS/` ne contenait jusqu'ici que des
rapports de lot (`Rapport NN_Titre.md`). Un plan n'est pas un rapport : il précède
le travail au lieu d'en rendre compte. Le préfixe `Plan NN_` reprend donc la forme
du dossier — préfixe, numéro, titre — sans se faire passer pour un compte rendu.

| | |
| --- | --- |
| Date | 10 septembre 2026 |
| Demandeur | Direction — ADIKOM Technology & Travel |
| Périmètre | 5 axes, 9 lots proposés |
| État du SaaS analysé | 78 migrations · 56 tables · 178 capacités · 85 écrans · 296 fichiers source |
| Production | https://adikom-pilot.vercel.app |
| Dernier commit analysé | `8d22a7c` |

---

# 1. Résumé exécutif

## 1.1 Ce que la Direction demande

Cinq axes, dont trois créent des modules qui n'existent pas :

| Axe | Nature | Documentation fonctionnelle existante |
| --- | --- | --- |
| 1 — Tarification fournisseur et marges | Extension d'un modèle existant | **Partielle** — la notion de coût fournisseur est nommée, jamais modélisée |
| 2 — Location : changement de véhicule, longue durée, résumé de fin | Évolution du cœur métier | **Partielle** — le changement de véhicule est documenté *avant le départ* seulement ; la longue durée n'existe nulle part |
| 3 — Produits & Services | **Module nouveau** | **Aucune** |
| 4 — Commerce (devis, commandes) | **Module nouveau** | **Aucune** |
| 5 — PDV / caisse | **Module nouveau** | **Aucune** |

## 1.2 Le constat central

Le SaaS livré n'est pas un assemblage de modules indépendants : c'est un système
gouverné par **une quinzaine de doctrines techniques** qui se tiennent
mutuellement (§2.3). Aucun montant financier n'est stocké, aucun statut dérivable
n'est écrit, toute écriture de trésorerie est la *conséquence* d'un acte et jamais
un acte libre, aucune fonction n'est `SECURITY DEFINER`, et chaque capacité est
attribuable indépendamment.

**Les cinq axes se branchent tous sur le même point : la chaîne
`Tiers → Facture → Règlement → Trésorerie`.** Les brancher ailleurs — un second
système de facturation pour le Commerce, une seconde caisse pour le PDV —
produirait deux vérités financières concurrentes. Le plan interdit donc cette
option, partout.

## 1.3 Ce que le plan propose

**Neuf lots**, dans un ordre commandé par les dépendances de données et par le
risque :

```
LOT 19  Socle Produits & Services (partie SERVICES)          additif pur
LOT 20  Tarification fournisseur et marge de location        additif pur
LOT 21  Segments de location — changement de véhicule        MODIFIE LE CŒUR
LOT 22  Location longue durée et facturation périodique      MODIFIE LA FACTURATION
LOT 23  Résumé de fin de location (PDF)                      additif
LOT 24  Commerce — côté client (devis, commandes, facture)   additif + extension facture
LOT 25  Commerce — côté fournisseur                          additif + extension facture
LOT 26  PDV — caisses et sessions de caisse                  additif
LOT 27  PDV — vente, encaissement, monnaie, reçu             additif + 5ᵉ origine de trésorerie
```

## 1.4 Ce que la Direction doit trancher avant le premier lot

Quatorze décisions sont classées **A — indispensables avant développement**
(§24). Quatre commandent l'architecture elle-même et ne peuvent pas être
contournées par un choix technique :

1. **Ce qu'est un « tarif fournisseur »** — un coût journalier de mise à
   disposition, un loyer périodique, ou une part par location ? *(rouvre DEC-007,
   ouvert depuis le 19 août 2026)*
2. **Le coût de référence de la marge** — le coût *verrouillé* au moment de
   l'engagement, ou le coût *réellement facturé* par le fournisseur ?
3. **Comment se facture une location longue durée** — la règle actuelle interdit
   plus d'une facture par location, par index unique en base.
4. **Ce qu'une vente PDV produit** — un simple reçu, ou une facture client émise
   et son règlement ?

Sans (1) et (2), le LOT 20 ne peut pas commencer. Sans (3), le LOT 22 ne peut pas
commencer. Sans (4), le LOT 27 ne peut pas commencer.

## 1.5 Ce que le plan refuse de faire

- **Créer un second système de facturation** pour les services (§15.5).
- **Créer un second système de trésorerie** pour le PDV (§16.4).
- **Modifier `pricing_rules`** pour y loger les tarifs fournisseurs (§9.2).
- **Développer la partie PRODUITS** (§14.7) — la Direction l'a explicitement
  écartée ; seule la place architecturale est réservée.
- **Inventer un barème** — durée facturable, monnaie rendue sur chèque, écart de
  caisse toléré : chaque règle absente est signalée, jamais devinée
  *(CLAUDE.md §55, DEC-008)*.

---

# 2. État actuel du SaaS analysé

## 2.1 Architecture technique

```
Next.js 16 (App Router, Server Components, Server Actions)
React 19 · TypeScript 5 · Tailwind 4
@react-pdf/renderer (documents)  ·  exceljs (exports)
        ↓
Supabase — PostgreSQL, Auth, Storage (buckets privés)
        ↓
GitHub (main) → Vercel (déploiement automatique)
```

**Contrôle d'accès à trois couches**, jamais deux :

| Couche | Où | Fonction |
| --- | --- | --- |
| Interface | `src/lib/navigation.ts`, `filterNavigation` | Confort de lecture. **Jamais une protection.** |
| Serveur | `src/lib/auth/dal.ts` — `requirePermission`, `requirePermissionOrRedirect`, `can`, `canAny` | Refus avant tout travail |
| Données | Policies RLS + `public.require_capability()` dans chaque fonction et chaque déclencheur de transition | Vaut même pour un appel PostgREST direct |

## 2.2 Le modèle de données existant, par chaîne métier

**Référentiel**

```
clients · suppliers · partners · supplier_payment_details
vehicle_categories · vehicles · vehicle_supplier_history · vehicle_documents
pricing_rules
```

**Cycle d'exploitation**

```
reservations ──convert──▶ rentals ──▶ rental_inspections ──▶ rental_inspection_photos
     │                       │
     └───▶ vehicle_occupations ◀── vehicle_maintenances
                                       │
        vehicle_incidents ─▶ incident_damages · incident_photos
                                       │
                     maintenance_costs · maintenance_cost_lines
                     maintenance_quotes · maintenance_documents
```

**Chaîne financière**

```
supplier_invoices ─▶ supplier_invoice_lines          (ligne rattachable à un véhicule)
        ▲                    ▲
        │              imputations ─▶ imputation_documents
        │                    ▲
        │            vehicle_maintenances
        │
supplier_payments ──produit──▶ treasury_entries ◀──produit── customer_payments
                                     ▲   ▲                        ▲
                     internal_transfers   misc_payments    customer_invoices
                                                                  │
                                                          customer_invoice_lines
                                     │
                            financial_accounts (BANK · CASH)
```

## 2.3 Les quinze doctrines à respecter impérativement

Ces règles ne sont pas des préférences de style : elles sont vérifiées par les
recettes, et les contredire casse le système ailleurs qu'à l'endroit modifié.

| # | Doctrine | Où elle est incarnée |
| --- | --- | --- |
| **D1** | **Aucun montant financier n'est stocké.** Sous-total, remise, total, brut, imputé, réglé, solde, solde de compte : tout est une fonction SQL qui somme des lignes. | `customer_invoice_subtotal/discount/total`, `supplier_invoice_gross/imputed/paid`, `customer_invoice_paid`, `financial_account_balance` |
| **D2** | **Un statut dérivable ne s'écrit jamais.** `OVERDUE`, `LATE`, `EXPIRED`, `PAID`, `PARTIALLY_PAID` sont calculés à l'affichage ; les transitions qui y mènent lèvent une exception. | `fn_customer_invoice_transition`, `fn_supplier_invoice_transition`, contrainte `customer_invoices_overdue_is_derived` |
| **D3** | **Cinq couches de contrôle par objet financier** : (1) la fonction exige sa capacité, (2) la donnée se fige, (3) la transition exige la capacité qui la légitime — ce qui couvre le `PATCH` direct, (4) RLS, (5) l'état de départ est imposé par un déclencheur `BEFORE INSERT`. | migrations 041 → 078 |
| **D4** | **Aucune fonction métier n'est `SECURITY DEFINER`.** Exceptions assumées : le moteur de permissions, `next_number`, les agrégats du tableau de bord. | DEC-022, DEC-026 §f |
| **D5** | **Un droit d'exécution se retire à chaque source** : `revoke execute … from public, anon` puis `grant … to authenticated, service_role`. | DEC-022 |
| **D6** | **Rien ne se supprime.** `fn_forbid_delete`, `is_archived`, statuts d'annulation datés. | CLAUDE.md §22 |
| **D7** | **DEC-024 — attribution indépendante des capacités.** `view` n'implique ni `export`, ni `download`, ni `print`. Quand RLS est *row-level* et que la donnée sensible est une colonne, **la donnée est déplacée dans une table séparée** (`maintenance_costs`). | migration 062, CLAUDE.md §19 bis |
| **D8** | **DEC-010 — montants en `bigint`, en KMF entiers.** Aucun flottant, à aucun niveau. Le SENS porte le signe, jamais le montant. | partout |
| **D9** | **Une écriture de trésorerie est une CONSÉQUENCE.** Origine unique (`treasury_entries_single_origin`), sens imposé par l'origine (`fn_treasury_entry_source`), immuable (`fn_treasury_entry_immutable`). | migrations 049, 053, 072, 077 |
| **D10** | **Chaque migration contrôle le catalogue** : `count(*) = N`, et la présence nominative des codes employés. | toutes |
| **D11** | **Aucune règle métier inventée.** Une règle absente produit un refus explicite avec son motif, et une question consignée. | DEC-008, DEC-031 §b |
| **D12** | **Un seul résolveur tarifaire.** `resolve_pricing_rule` est l'unique implémentation de DEC-002. Aucun écran ne reformule la règle. | migration 017 |
| **D13** | **Un tarif appliqué est une COPIE, pas une référence.** `locked_amount`, `locked_unit`, `locked_source`, `locked_at`. | `reservations`, `rentals` |
| **D14** | **Un seul registre documentaire.** `src/lib/documents/registry.ts`, route `/api/documents/[type]/[id]`, double exigence : `viewPermission` **et** (`download` ou `print`). | migration 026, DEC-042 §c |
| **D15** | **Un seul registre d'export.** `src/lib/exports/registry.ts`, route `/api/exports/[module]`, même double exigence. | DEC-024 |

## 2.4 Les surfaces de régression transversales

Cinq fichiers ou fonctions doivent être révisés **à chaque lot**, faute de quoi
une fonctionnalité correcte casse ailleurs :

| Surface | Fichier / fonction | Conséquence d'un oubli |
| --- | --- | --- |
| **Périmètre de sauvegarde** | `public.backup_scope()` — migration 074 | Une table absente n'est ni exportée, ni réinitialisée, ni restaurée. Après restauration, elle référence des lignes disparues. **44 tables aujourd'hui.** |
| **Catalogue de capacités** | `src/lib/auth/permissions.ts` ↔ `permissions.test.ts` ↔ migration | Le test de parité TS/SQL échoue |
| **Total attendu du catalogue** | **34 fichiers** (`scripts/verify-*.mjs` + `supabase/tests/*.sql`) portent le nombre `178` en dur | Toutes les recettes du projet tombent |
| **Navigation** | `src/lib/navigation.ts` + `src/components/layout/sidebar.tsx` | Module invisible |
| **Registres** | `documents/registry.ts`, `exports/registry.ts` | Bouton mort, ou export sans contrôle |

> **Proposition technique (décision C, §24.3)** — les 34 fichiers qui répètent le
> total attendu vont devoir être modifiés **six fois** au cours de ce plan, soit
> plus de 200 éditions dont chacune est une occasion de casser une recette. Le
> remède : ne conserver l'assertion du total qu'à **un seul endroit** — la
> dernière migration du lot — et faire porter aux recettes la **présence
> nominative** des codes qu'elles éprouvent, ce qu'elles font déjà par ailleurs.
> À traiter au LOT 19, avant que le catalogue ne bouge.

## 2.5 Les arbitrages déjà ouverts qui recoupent cette demande

| Réf. | Question ouverte | Axe concerné |
| --- | --- | --- |
| **DEC-007** | Nature du montant dû au fournisseur — forfait, loyer, part par location ? | **1.b — bloquant** |
| **DEC-008** | Arrondi de durée, jour entamé, barèmes carburant / km / dommages | **2.b, 2.c** |
| **DEC-014** | Régime de taxes | **3, 4, 5** |
| **DEC-023 §4** | Convention définitive des références de factures, à valider par le comptable | **4** |
| **DEC-029 §b** | Découvert autorisé d'un compte financier | **5** |
| **DEC-031 §b** | Traitement du trop-perçu client | **5 — recoupe la monnaie rendue** |

---

# 3. Besoins de la Direction — reformulés et qualifiés

| Réf. | Besoin | Existant réutilisable | Nouveau |
| --- | --- | --- | --- |
| **1.a** | Préserver la tarification client | `pricing_rules`, `resolve_pricing_rule`, verrouillage | — |
| **1.b** | Tarifs / coûts fournisseurs | `suppliers`, `vehicles.current_supplier_id`, `vehicle_supplier_history` | Table de tarifs fournisseurs + résolveur |
| **1.c** | Suivi des marges | Onglet « Rentabilité » du véhicule (marge d'exploitation) | Marge **commerciale** de location, par segment |
| **2.a** | Changement de véhicule en cours de location | `vehicle_occupations`, contrainte d'exclusion, verrouillage tarifaire | **Segments de location** |
| **2.b** | Location longue durée + facturation progressive | `extend_rental`, `customer_invoices` | Type de location, prolongations historisées, facturation périodique |
| **2.c** | Résumé complet de fin de location | Registre documentaire, contrat / bon de départ / PV de retour | Un 4ᵉ document de synthèse |
| **3** | Module Produits & Services (SERVICES seulement) | — | Module `catalog` |
| **4** | Module Commerce | `customer_invoices`, `supplier_invoices` | Module `commerce` |
| **5** | Module PDV | `financial_accounts` (CASH), `treasury_entries` | Module `pos` |

---

# 4. Analyse des dépendances

## 4.1 Graphe

```
                    ┌─────────────────────────┐
                    │ LOT 19 · SERVICES       │  additif pur
                    │ catalog.*               │
                    └───────┬─────────────────┘
                            │ fournit les lignes vendables/achetables
              ┌─────────────┴──────────────┐
              ▼                            ▼
   ┌─────────────────────┐      ┌──────────────────────┐
   │ LOT 24/25 COMMERCE  │      │ LOT 26/27  PDV       │
   └──────────┬──────────┘      └───────────┬──────────┘
              │ lignes de service            │ 5ᵉ origine d'écriture
              ▼                              ▼
        customer_invoices              treasury_entries
        supplier_invoices              financial_accounts (CASH)


   ┌──────────────────────────┐
   │ LOT 20 · COÛT FOURNISSEUR│  additif pur
   │ supplier_vehicle_rates   │
   └───────────┬──────────────┘
               │ le segment doit porter son coût dès sa création
               ▼
   ┌──────────────────────────┐
   │ LOT 21 · SEGMENTS        │  MODIFIE LE CŒUR
   └───────────┬──────────────┘
               │ une prolongation est un segment de plus
               ▼
   ┌──────────────────────────┐
   │ LOT 22 · LONGUE DURÉE    │  MODIFIE LA FACTURATION
   └───────────┬──────────────┘
               │ le résumé doit pouvoir montrer N segments et N factures
               ▼
   ┌──────────────────────────┐
   │ LOT 23 · RÉSUMÉ DE FIN   │
   └──────────────────────────┘
```

## 4.2 Les six dépendances dures, et leur raison

| # | Dépendance | Pourquoi elle ne se contourne pas |
| --- | --- | --- |
| **1** | **LOT 20 avant LOT 21** | Un segment porte son coût fournisseur *verrouillé*, comme il porte son prix verrouillé. Livrer les segments d'abord obligerait à une seconde migration de données pour rétro-remplir le coût de segments déjà créés — sur des dossiers réels. |
| **2** | **LOT 21 avant LOT 22** | Une prolongation de longue durée peut s'accompagner d'un changement de véhicule *et* d'un changement de tarif. Sans segments, la prolongation ne peut porter ni l'un ni l'autre, et `extend_rental` continue d'écraser `expected_return_at` sans historique structuré (DEC-025 §d). |
| **3** | **LOT 22 avant LOT 23** | Le résumé de fin doit présenter **N** périodes et **N** factures. Le figer sur une facture unique obligerait à le refaire. |
| **4** | **LOT 19 avant LOT 24** | Une ligne de devis désigne un service et une variante. |
| **5** | **LOT 19 avant LOT 27** | Le panier de la caisse ne vend que ce que le catalogue contient. |
| **6** | **LOT 24 avant LOT 27** *(conditionnelle)* | Elle ne s'impose **que si** la Direction décide qu'une vente PDV produit une facture client (décision A-11, §24.1) : la ligne de facture devrait alors porter un service, ce que le LOT 24 livre. **Si la Direction décide que la vente PDV produit un simple reçu, le PDV peut être avancé avant Commerce.** |

## 4.3 Ce qui est indépendant

- **LOT 19** ne dépend d'aucun autre et ne modifie aucune table existante. C'est
  le seul lot totalement additif du plan : il vaut donc comme lot d'étalonnage du
  nouveau module `catalog`.
- **LOT 20** ne dépend de rien et ne touche pas `pricing_rules`.
- **La branche « Location » (20 → 23)** et **la branche « Commerce / PDV »
  (19 → 24/25 → 26/27)** ne se croisent qu'en un point : la facture client. Elles
  peuvent donc être menées **en parallèle par deux personnes**, à condition que
  les migrations touchant `customer_invoice_lines` (LOT 22 et LOT 24) soient
  ordonnées entre elles.

---

# 5. Architecture cible

## 5.1 Modules du SaaS après ce plan

```
 1. Tableau de bord           dashboard      (existant)
 2. Centre de notifications   notifications  (existant)
 3. Projets & Planification   projects       (existant)
 4. Tiers                     parties        (existant)
 5. Gestion de location       rental         (étendu : coût fournisseur, segments, longue durée)
 6. Banques & Caisses         treasury       (étendu : 5ᵉ origine d'écriture)
 7. Facturation & Paiement    billing        (étendu : lignes de service, facturation périodique)
 8. Utilisateurs & Groupes    users          (inchangé)
 9. Paramètres                settings       (étendu : numérotation des nouveaux documents)
10. Produits & Services       catalog        ★ NOUVEAU
11. Commerce                  commerce       ★ NOUVEAU
12. Point de vente            pos            ★ NOUVEAU
```

> **Point de gouvernance.** `CLAUDE.md` §10 énumère neuf modules et interdit d'en
> créer un dixième « sans justification fonctionnelle ». La demande de la
> Direction *est* cette justification. **`CLAUDE.md` §10 devra être mis à jour**
> au LOT 19, en même temps que la documentation fonctionnelle des trois nouveaux
> modules. Ce n'est pas un détail : le fichier est la règle du projet, et le
> laisser contredire le produit rendrait toutes ses autres règles discutables.

## 5.2 Documentation fonctionnelle à produire — préalable au code

`CLAUDE.md` §2 et §5 imposent : **Lire → Comprendre → … → Développer**. Les
modules 10, 11 et 12 n'ont aucune documentation. **Écrire cette documentation
fait partie du travail des lots, avant le premier `create table`.**

| À créer | Contenu minimal |
| --- | --- |
| `00 Documentation/03_Modules/10_Produits_et_Services.md` | périmètre, sous-menus, fiche service, variantes, destination, prix, statuts |
| `00 Documentation/03_Modules/11_Commerce.md` | devis, commandes, transformations, lien facture |
| `00 Documentation/03_Modules/12_Point_de_Vente.md` | caisse, panier, encaissement, session, reçu |
| `00 Documentation/04_Workflows/09_Vente_de_Service.md` | devis → commande → facture → règlement |
| `00 Documentation/04_Workflows/10_Achat_de_Service.md` | devis fournisseur → commande → réception → facture → règlement |
| `00 Documentation/04_Workflows/11_Encaissement_au_Comptoir.md` | ouverture de session → ventes → clôture |
| `00 Documentation/05_Regles_Metier/07_Services_et_Marges.md` | définition exacte de la marge, cas particuliers |
| `00 Documentation/05_Regles_Metier/08_Caisse.md` | donné / encaissé / monnaie, écarts, sessions |
| Compléments à `05_Regles_Metier/01_Location.md` | segments, longue durée, prolongation |
| Compléments à `05_Regles_Metier/04_Fournisseurs.md` | tarif fournisseur |

Chaque décision de la Direction (§24) doit être consignée dans
`00 Documentation/08_Decisions/01_Journal_des_Decisions.md` sous les références
**DEC-043** et suivantes, avant le lot qui l'applique.

## 5.3 Principes d'intégration — non négociables

| Règle | Formulation |
| --- | --- |
| **Une seule facturation** | Un devis, une commande, une vente PDV n'ont pas de « total facturé » propre. Ils **produisent** une facture client ou fournisseur, ou ils n'en produisent pas — jamais une facture parallèle. |
| **Une seule trésorerie** | Toute entrée ou sortie d'argent est une ligne de `treasury_entries`, reliée à son origine par une colonne dédiée, avec un sens imposé par cette origine. Le PDV n'a pas de caisse à lui : il **utilise** un `financial_accounts` de type `CASH`. |
| **Un seul tiers** | Un client de devis, de commande ou de caisse est une ligne de `clients`. Aucun « client de passage » saisi à la volée sans fiche. *(À arbitrer — décision A-12.)* |
| **Une seule tarification client** | `resolve_pricing_rule` reste l'unique implémentation de DEC-002 pour la **location**. Les services ont leur propre prix, porté par la variante ; ils n'entrent pas dans `pricing_rules`. |
| **Un seul catalogue de capacités** | Aucune capacité n'est déduite d'une autre. |
| **Un seul périmètre de sauvegarde** | Toute nouvelle table métier entre dans `backup_scope()`, à sa place dans l'ordre parents → enfants. |

---

# 6. Modèle fonctionnel cible

## 6.1 La chaîne « achat → vente → marge », rendue lisible

```
        ACHAT                                        VENTE
 ┌────────────────────┐                    ┌────────────────────────┐
 │ Tarif fournisseur  │                    │ Tarif client           │
 │ (véhicule/jour)    │                    │ pricing_rules · DEC-002│
 └─────────┬──────────┘                    └───────────┬────────────┘
           │ verrouillé sur le segment                 │ verrouillé sur le segment
           ▼                                           ▼
        ┌────────────────────────────────────────────────────┐
        │             SEGMENT DE LOCATION                    │
        │  véhicule · période · coût verrouillé · prix verr. │
        └────────────────────────┬───────────────────────────┘
                                 │
              MARGE COMMERCIALE  =  Σ prix − Σ coût
                                 │
                                 ▼
                    Facture client  ──▶ Règlement ──▶ Trésorerie
                    Facture fourn.  ──▶ Règlement ──▶ Trésorerie
                          ▲
                    Imputation de maintenance (réduit le net à payer)


 ┌────────────────────┐                    ┌────────────────────────┐
 │ Prix d'achat       │                    │ Prix de vente          │
 │ service / variante │                    │ service / variante     │
 └─────────┬──────────┘                    └───────────┬────────────┘
           └──────────────┬─────────────────────────────┘
                          ▼
              MARGE SERVICE = vente − achat
                          │
        ┌─────────────────┴─────────────────┐
        ▼                                   ▼
   Devis/Commande client              Vente au comptoir (PDV)
        ▼                                   ▼
   Facture client ─▶ Règlement ─▶ Trésorerie ◀─ Encaissement PDV
```

## 6.2 Les trois marges — nommées, distinctes, jamais confondues

| Marge | Formule | Portée | Existant |
| --- | --- | --- | --- |
| **Marge d'exploitation d'un véhicule** | Revenus facturés − (coût d'entretien réel − imputé) | Véhicule, toute sa vie | **Livrée** — onglet « Rentabilité » |
| **Marge commerciale d'une location** | Σ prix verrouillé des segments − Σ coût verrouillé des segments | Un contrat | **À livrer** — LOT 20/21 |
| **Marge d'un service** | Prix de vente − prix d'achat | Une variante, ou une ligne vendue | **À livrer** — LOT 19 |

Elles ne s'additionnent pas et ne se substituent pas. Chaque écran doit **nommer**
celle qu'il affiche et **énumérer ce qu'elle ne couvre pas** — la doctrine déjà
appliquée à l'onglet « Rentabilité », en réponse à `05_Regles_Metier/02` §43 :

> « Le système ne doit pas présenter un indicateur comme une rentabilité
> **complète** si toutes les charges ne sont pas prises en compte. »

---

# 7. Modèle de données cible

## 7.1 Tables nouvelles — vue d'ensemble

| Lot | Table | Rôle |
| --- | --- | --- |
| 19 | `service_categories` | Catégories de services |
| 19 | `services` | Service : nom, catégorie, destination, statut |
| 19 | `service_variants` | Variante : libellé, prix d'achat, prix de vente |
| 20 | `supplier_vehicle_rates` | Coût fournisseur d'un véhicule, daté |
| 21 | `rental_segments` | Véhicule + période + prix verrouillé + coût verrouillé |
| 22 | `rental_extensions` | Historique explicite des prolongations |
| 22 | `rental_billing_periods` | Période facturable d'une longue durée |
| 24 | `sales_quotes` / `sales_quote_lines` | Devis clients |
| 24 | `sales_orders` / `sales_order_lines` | Commandes clients |
| 25 | `purchase_quotes` / `purchase_quote_lines` | Devis fournisseurs |
| 25 | `purchase_orders` / `purchase_order_lines` | Commandes fournisseurs |
| 26 | `pos_registers` | Caisse physique, adossée à un compte `CASH` |
| 26 | `pos_sessions` | Ouverture / fermeture, caissier, montants |
| 27 | `pos_sales` / `pos_sale_lines` | Vente au comptoir |
| 27 | `pos_payments` | Un mode de paiement : donné, encaissé |

**19 tables nouvelles**, dont 17 entrent dans `backup_scope()`
(`pos_registers` et `service_categories` compris ; les deux tables de référence
sont des données métier, pas de la configuration).

## 7.2 Colonnes ajoutées à des tables existantes

| Table | Colonne | Lot | Raison |
| --- | --- | --- | --- |
| `rentals` | `rental_type` (`FIXED_TERM` \| `LONG_TERM`) | 22 | Distinguer les deux régimes |
| `rentals` | `current_segment_id` | 21 | Segment ouvert, pour éviter une sous-requête à chaque lecture |
| `vehicle_occupations` | `rental_segment_id` | 21 | Rattacher une occupation à **son** segment (§11.4) |
| `customer_invoices` | `rental_segment_id` (nullable) | 22 | Facture d'une période précise |
| `customer_invoices` | `billing_period_id` (nullable) | 22 | Remplace l'unicité « une facture par location » |
| `customer_invoices` | `sales_order_id` (nullable) | 24 | Facture née d'une commande |
| `customer_invoice_lines` | `service_id`, `service_variant_id` (nullables) | 24 | Ligne de service |
| `customer_invoice_lines` | `unit_cost` (nullable) | 24 | Coût **copié** — base de la marge |
| `supplier_invoice_lines` | `service_id`, `service_variant_id`, `quantity`, `unit_price` (nullables) | 25 | Ligne de service achetée |
| `supplier_invoices` | `purchase_order_id` (nullable) | 25 | Facture née d'une commande |
| `treasury_entries` | `pos_sale_id` (nullable) | 27 | **5ᵉ origine** |
| `misc_payments` | — | — | inchangé |

## 7.3 Types (enums) nouveaux ou étendus

| Type | Action | Valeurs |
| --- | --- | --- |
| `service_purpose` | **créer** | `PURCHASE` · `SALE` · `BOTH` |
| `service_status` | **créer** | `ACTIVE` · `INACTIVE` · `ARCHIVED` |
| `supplier_rate_unit` | **créer** | `DAY` · `FLAT` · `MONTH` *(à confirmer — décision A-1)* |
| `rental_type` | **créer** | `FIXED_TERM` · `LONG_TERM` |
| `rental_segment_status` | **créer** | `ACTIVE` · `ENDED` · `CANCELLED` |
| `commercial_document_status` | **créer** | `DRAFT` · `SENT` · `ACCEPTED` · `REFUSED` · `CONVERTED` · `CANCELLED` |
| `order_status` | **créer** | `DRAFT` · `CONFIRMED` · `DELIVERED` · `INVOICED` · `CANCELLED` |
| `pos_session_status` | **créer** | `OPEN` · `CLOSED` |
| `pos_sale_status` | **créer** | `VALIDATED` · `CANCELLED` |
| `payment_method` | **étendre** | `+ MVOLA` `+ HOLO` `+ WAKATI` |
| `treasury_entry_kind` | **étendre** | `+ POS_SALE` |
| `customer_invoice_line_kind` | inchangé | `SERVICE` couvre déjà le besoin |

> **Point technique (C)** — `alter type … add value` ne peut pas être suivi, dans
> la **même transaction**, d'une utilisation de la valeur ajoutée. Les extensions
> d'enum vont donc dans une **migration dédiée**, sans autre contenu, appliquée
> avant celle qui les consomme. C'est la seule façon fiable de les livrer.

---

# 8. Tarification clients — ce qui est préservé

## 8.1 Le modèle actuel, exactement

`public.pricing_rules` — une table, six niveaux de portée :

```
client_id + vehicle_id   → specificity 6   CLIENT_VEHICLE
client_id + category_id  → specificity 5   CLIENT_CATEGORY
client_id                → specificity 4   CLIENT
vehicle_id               → specificity 2   VEHICLE
category_id              → specificity 1   CATEGORY
(aucun)                  → specificity 0   STANDARD
```

- `specificity` est une colonne **générée** (`generated always as … stored`) —
  elle ne s'écrit pas, et `backup_columns()` l'écarte déjà.
- Un tarif est **un montant OU une remise**, jamais les deux
  (`pricing_rules_amount_xor_discount`).
- Une **remise exige un client** (`pricing_rules_discount_needs_client`) : c'est
  ce qui fait de cette table une table de tarification **client**.
- Un montant exige une unité (`DAY` ou `FLAT`) — DEC-001.
- `resolve_pricing_rule(client, véhicule, date)` départage : spécificité, puis
  date de création, puis `id`. **Aucune ligne** si aucun tarif ne s'applique : le
  système refuse plutôt que d'inventer un zéro (DEC-008).
- Un tarif ne se supprime jamais (`pricing_rules_no_delete`) ; il se désactive ou
  expire.
- Chaque écriture produit un événement d'audit **`PRICE_CHANGE`**.
- Le tarif retenu est **copié** dans `reservations.locked_*` puis dans
  `rentals.locked_*`. Une modification ultérieure de la grille ne l'atteint plus.

## 8.2 Ce que le plan garantit

| Garantie | Comment elle est tenue |
| --- | --- |
| Aucune colonne de `pricing_rules` n'est ajoutée, modifiée ou supprimée | Le coût fournisseur vit dans une **table sœur** (§9.2) |
| `resolve_pricing_rule` n'est pas modifiée | Un **second** résolveur est créé, de signature différente |
| Les contraintes d'exclusivité et de remise sont intactes | Aucune migration ne les touche |
| Les tarifs déjà verrouillés sont inatteignables | Aucune migration ne réécrit `locked_*` |
| L'écran « Tarification » et l'onglet « Tarifs préférentiels » du client fonctionnent à l'identique | Le tarif fournisseur ouvre un **onglet distinct** de l'écran Tarification, sous sa propre capacité |

## 8.3 Test de non-régression obligatoire à chaque lot 20 → 23

`supabase/tests/location.sql` contient déjà l'épreuve du résolveur sur les six
niveaux. **Elle doit être rejouée sans modification** — si elle doit être
adaptée, c'est que la tarification client a bougé, et le lot est à revoir.

---

# 9. Tarification fournisseurs

## 9.1 Le vide constaté

Aujourd'hui, ADIKOM ne connaît le coût d'un véhicule fournisseur que par
**une facture reçue et saisie à la main** :

- `supplier_invoice_lines.amount`, rattachable à un véhicule (DEC-027 §c) ;
- `maintenance_costs.actual_cost`, pour l'entretien.

Il n'existe **aucune notion de tarif fournisseur récurrent**. C'est exactement ce
que DEC-007 laissait ouvert depuis le 19 août 2026 :

> « Le système doit-il, à terme, **générer** le montant dû au fournisseur
> (contrat de mise à disposition, loyer périodique, part par location) ou la
> saisie manuelle de la facture reçue reste-t-elle la règle ? »

**La demande de la Direction rouvre cette question et exige d'y répondre**
(décision A-1, §24.1).

## 9.2 Pourquoi une table sœur, et non une extension de `pricing_rules`

| Option | Effet | Verdict |
| --- | --- | --- |
| Ajouter `supplier_id` et un `kind` à `pricing_rules` | Casse `specificity` (colonne générée, il faudrait la recalculer), casse `pricing_rules_discount_needs_client`, oblige à réécrire `resolve_pricing_rule`, mélange dans une même table des lignes que l'audit `PRICE_CHANGE` ne distinguerait plus, et fait porter aux tarifs **clients déjà verrouillés** le risque d'une migration de schéma. | **Refusée** |
| Table sœur `supplier_vehicle_rates` + résolveur propre | Aucun risque sur l'existant. Deux vocabulaires séparés, impossibles à confondre à la lecture comme dans les policies. Le coût est une donnée **sensible** : le séparer permet à RLS — qui est *row-level* — de le protéger réellement (doctrine D7, déjà appliquée à `maintenance_costs`). | **Retenue** |

## 9.3 Structure proposée

```sql
-- Coût de mise à disposition d'un véhicule par son fournisseur.
-- NOM DÉLIBÉRÉMENT DIFFÉRENT de pricing_rules : ce n'est pas un tarif de vente.
supplier_vehicle_rates (
  id                uuid pk,
  supplier_id       uuid not null → suppliers,
  vehicle_id        uuid not null → vehicles,     -- jamais une catégorie :
                                                  -- un fournisseur facture UN véhicule
  amount            bigint not null check (amount > 0),   -- KMF, DEC-010
  unit              supplier_rate_unit not null,          -- DAY · FLAT · MONTH
  valid_from        date not null,
  valid_to          date,
  is_active         boolean not null default true,
  conditions        text,
  currency_code     text not null default 'KMF',
  created_at/by, updated_at/by,

  constraint rate_period check (valid_to is null or valid_to >= valid_from),
  -- Le fournisseur doit être celui du véhicule à la date d'effet :
  -- contrôlé par déclencheur contre vehicle_supplier_history
)
```

**Index unique partiel** : un seul tarif actif par (véhicule, unité) à une date
donnée — implémenté par une contrainte d'exclusion `gist` sur
`(vehicle_id with =, daterange(valid_from, valid_to) with &&) where is_active`,
même mécanisme éprouvé que `vehicle_occupations`.

**Résolveur** :

```sql
resolve_supplier_rate(p_vehicle_id uuid, p_on date)
  returns table (rate_id uuid, supplier_id uuid, amount bigint,
                 unit supplier_rate_unit, source text)
```

- `stable`, **`SECURITY INVOKER`** (D4) — un appelant sans
  `rental.pricing.supplier.view` ne lit rien, et **aucune ligne n'est renvoyée**.
- **Aucune ligne** si aucun tarif n'est configuré. Un coût absent n'est jamais un
  coût nul (DEC-008, DEC-017).

**Audit** : type d'événement `PRICE_CHANGE`, module `rental` — le même que pour
la tarification client, puisque c'est le même genre de fait sensible.

## 9.4 Ce que le tarif fournisseur ne fait pas

- Il **ne génère aucune facture fournisseur.** DEC-007 reste ouverte sur ce
  point ; la facture reste saisie à réception. Le tarif sert à **valoriser un
  segment** et à **comparer** au montant réellement facturé.
- Il **n'entre pas** dans `resolve_pricing_rule`, et ne peut jamais devenir un
  prix de vente par accident.
- Il **ne s'applique pas** aux véhicules `OWNED` : la contrainte
  `vehicles_origin_supplier_coherent` garantit qu'un véhicule ADIKOM n'a pas de
  fournisseur ; le déclencheur refuse un tarif sur un tel véhicule, avec son
  motif.

---

# 10. Suivi des marges

## 10.1 Définitions à valider — le préalable absolu

La Direction écrit : « Ne crée pas de formule arbitraire. » Le plan s'y tient :
il **propose** une définition et demande sa validation.

### Marge commerciale d'une location — proposition

```
Produit de la location   Σ des lignes de facture de nature RENTAL, factures
                         ÉMISES portant cette location (brouillons et annulées
                         exclues), réductions comprises
Coût de la location      Σ, pour chaque segment, du coût verrouillé × durée
                         facturable du segment (unité DAY) ou du coût forfaitaire
                         (unité FLAT)
Marge commerciale        Produit − Coût
Marge journalière        Marge ÷ nombre de jours facturés   ← informatif seulement
```

### Ce qui est **inclus**

- Les lignes `RENTAL` de la facture client.
- Les réductions `DISCOUNT` — elles diminuent le produit réel, donc la marge.
- Le coût verrouillé de **chaque** segment, y compris le véhicule de remplacement.

### Ce qui est **exclu**, et pourquoi

| Exclu | Raison |
| --- | --- |
| Lignes `SERVICE` et `FEE` de la facture | Ce sont des prestations annexes, pas la location. Elles ont leur propre marge (§14.6) — *à confirmer, décision B-3* |
| Coûts de maintenance | Ils relèvent de la marge d'**exploitation** du véhicule, déjà livrée. Les compter ici les compterait deux fois |
| Imputations fournisseurs | Idem — elles réduisent une charge d'entretien, pas un coût de location |
| Amortissement, assurance, carburant, charges générales | **Aucune de ces dépenses n'est enregistrée par véhicule.** Les supposer nulles donnerait un résultat flatteur et faux |

### Traitement des cas particuliers

| Cas | Traitement proposé |
| --- | --- |
| **Véhicule ADIKOM (`OWNED`)** | Aucun coût fournisseur. La marge n'est **pas calculée** ; l'écran affiche « véhicule ADIKOM — pas de coût d'acquisition de service ». Un coût de 0 ferait passer une marge pour 100 % du prix. *(décision A-3)* |
| **Aucun tarif fournisseur configuré** | La marge n'est **pas calculée**, et l'écran le dit. Jamais un zéro |
| **Changement de véhicule** | Chaque segment porte son couple (prix, coût). La marge est la somme des segments |
| **Période partielle** | La durée facturable d'un segment suit la **même règle d'arrondi** que la facturation — laquelle **n'est pas arrêtée** (DEC-008). **Tant qu'elle ne l'est pas, la marge journalière n'est pas affichée**, seule la marge totale l'est, calculée sur la quantité **saisie** sur la facture |
| **Remise** | Déduite du produit |
| **Coût additionnel** (dépannage, convoyage) | Hors périmètre. Aucun objet ne les porte aujourd'hui. *Signalé, non inventé* |
| **Écart entre coût verrouillé et coût facturé** | Affiché **à côté** de la marge, jamais fondu dedans. Nommé « écart fournisseur » |
| **Imputation** | N'entre **pas** dans la marge commerciale. `CLAUDE.md` §57 : une imputation n'est jamais un paiement, et ici elle n'est pas non plus un produit |

## 10.2 Le coût de référence — la décision qui commande tout

**Question A-2** : la marge se calcule-t-elle sur le coût **verrouillé** au
moment de l'engagement, ou sur le coût **réellement facturé** par le fournisseur ?

| Option | Avantage | Inconvénient |
| --- | --- | --- |
| **Verrouillé** *(recommandé)* | Disponible **immédiatement**, dès la création du segment. Symétrique du prix de vente (D13). Insensible à un retard de facturation | Peut différer de la réalité |
| Réellement facturé | Exact | **Indisponible** tant que la facture n'est pas reçue et saisie. Une location close resterait sans marge pendant des semaines. Une facture couvrant plusieurs véhicules oblige à une clé de répartition que personne n'a définie |

**Recommandation** : **verrouillé**, avec l'**écart fournisseur** affiché dès
qu'une facture fournisseur rattachée au véhicule couvre la période. C'est la
seule option qui donne un chiffre le jour même sans en inventer un.

## 10.3 Où la marge se présente

| Écran | Marge affichée | Capacités requises |
| --- | --- | --- |
| Fiche location, onglet « Marge » | Commerciale, par segment et totale | `rental.rentals.financial.view` **+** `rental.pricing.supplier.view` |
| Fiche véhicule, onglet « Rentabilité » | Exploitation *(existant)* **+** un bloc « marge commerciale cumulée » | idem, en plus des trois capacités actuelles |
| Fiche fournisseur, onglet « Marge » | Somme des marges des locations de ses véhicules | idem **+** `parties.suppliers.view` |
| Fiche client, onglet « Marge » | Somme des marges des locations du client | idem **+** `parties.clients.view` |
| Fiche service | Marge unitaire de chaque variante | `catalog.services.view` **+** `catalog.services.cost.view` |

## 10.4 Pourquoi **aucune** capacité « marge » n'est créée

C'est un point de doctrine, et il est délibéré.

Une marge est une **différence entre deux grandeurs déjà gouvernées** : le prix
(`rental.rentals.financial.view`) et le coût (`rental.pricing.supplier.view`).
Qui détient les deux peut faire la soustraction ; une capacité `margin.view`
supplémentaire ne masquerait donc **rien** — elle ne ferait que cacher une carte.

C'est exactement le raisonnement retenu pour l'onglet « Rentabilité » (DEC-042 §d)
et pour le calendrier (DEC-036 §d) : *une permission qui ne débloque rien ne doit
pas être attribuable* (`CLAUDE.md` §19 bis).

**Conséquence opérationnelle** : pour ouvrir la marge à quelqu'un, on lui accorde
les deux lectures. Pour la lui fermer, on lui retire l'une des deux — et il perd
alors aussi la grandeur correspondante, ce qui est cohérent.

---

# 11. Évolution des locations — segments et changement de véhicule

## 11.1 Ce que dit la documentation, et ce qu'elle ne dit pas

| Source | Ce qui est écrit | Portée |
| --- | --- | --- |
| `05_Regles_Metier/01_Location.md` §26 | Un changement de véhicule « doit être enregistré comme une opération identifiable » et conserver ancien véhicule, nouveau véhicule, date, heure, motif, utilisateur | Générale |
| `04_Workflows/03_Depart_du_Vehicule.md` §35 | Vérifier la disponibilité, la compatibilité, **recalculer le tarif**, conserver l'historique, faire valider par un utilisateur autorisé | **Avant le départ** |
| `04_Workflows/03_Depart_du_Vehicule.md` §36 | Si le nouveau véhicule a un tarif différent, « le système doit clairement afficher la différence » et le nouveau montant « doit être validé avant la remise » | **Avant le départ** |

**Le cas demandé par la Direction — panne *pendant* la location — n'est couvert
par aucun texte.** §26 impose l'historisation ; §35 et §36 décrivent un
remplacement qui précède le départ. La demande est donc une **extension
documentée à écrire** (décision A-4), pas une simple implémentation.

## 11.2 Pourquoi les segments, et pas une simple substitution

Aujourd'hui, `rentals` porte **un** `vehicle_id`, **un** `locked_amount`, **une**
`planned_period`. Changer le véhicule reviendrait à écraser ces trois valeurs :
la période au tarif du véhicule A disparaîtrait, et la facture ne pourrait plus
être justifiée.

Le journal d'audit conserverait l'avant/après — mais l'audit est une **trace**,
pas une **structure de calcul** : on ne facture pas depuis un journal, et on n'en
tire pas une marge.

**Un segment est donc nécessaire.** C'est la même leçon que `vehicle_occupations`
(DEC-012) et que `vehicle_supplier_history` (§59–§62 des règles parc) : quand une
relation change dans le temps, elle devient une **ligne datée**, pas une colonne
réécrite.

## 11.3 Structure proposée

```sql
rental_segments (
  id                  uuid pk,
  rental_id           uuid not null → rentals on delete cascade,
  sequence_no         int  not null,                 -- 1, 2, 3…
  vehicle_id          uuid not null → vehicles,
  period              tstzrange not null,            -- borne haute ouverte pour
                                                     -- le segment en cours

  -- VENTE — copie, jamais référence (D13)
  locked_amount       bigint not null check (>= 0),
  locked_unit         pricing_unit not null,
  locked_rule_id      uuid → pricing_rules,
  locked_source       text,
  locked_at           timestamptz not null,

  -- ACHAT — même doctrine, table sœur
  locked_cost_amount  bigint check (>= 0),           -- NULL = véhicule ADIKOM,
  locked_cost_unit    supplier_rate_unit,            --        ou tarif non configuré
  locked_cost_rate_id uuid → supplier_vehicle_rates,
  locked_cost_supplier_id uuid → suppliers,
  locked_cost_at      timestamptz,

  status              rental_segment_status not null default 'ACTIVE',
  reason              text,                          -- motif du changement (§26)
  ended_at            timestamptz,
  created_at/by, updated_at/by,

  constraint segments_unique_sequence unique (rental_id, sequence_no),
  constraint segments_cost_coherent check (
    (locked_cost_amount is null and locked_cost_unit is null and locked_cost_at is null)
 or (locked_cost_amount is not null and locked_cost_unit is not null and locked_cost_at is not null)
  )
)
```

**Un seul segment ouvert par location** :
`create unique index … on rental_segments (rental_id) where status = 'ACTIVE'`.

**Les périodes d'une même location ne se chevauchent pas** : contrainte
d'exclusion `gist` sur `(rental_id with =, period with &&)`.

## 11.4 Le point délicat — le calendrier

C'est **le** risque technique du LOT 21, et il doit être traité les yeux ouverts.

Aujourd'hui, cinq fonctions manipulent `vehicle_occupations` en filtrant
`source = 'RENTAL' and source_id = <rental_id>` :

| Fonction | Ce qu'elle fait | Effet du changement |
| --- | --- | --- |
| `convert_reservation_to_rental` | Change l'origine `RESERVATION` → `RENTAL` | Doit aussi rattacher au segment 1 |
| `extend_rental` | `update … set period = tstzrange(lower(period), p_new_end)` | **Toucherait TOUTES les occupations de la location**, y compris celles des segments clos. Défaut réel |
| `return_rental` | Libère l'occupation | Ne doit libérer que le segment ouvert |
| `cancel_rental` | Libère l'occupation | Doit libérer tous les segments actifs |
| `start_rental` | Vérifie / pose | Doit viser le segment 1 |

**Solution retenue** : ajouter une colonne `rental_segment_id` à
`vehicle_occupations`, **sans toucher à l'énumération `occupation_source`**.

Pourquoi pas une valeur d'enum `RENTAL_SEGMENT` ? Parce qu'elle invaliderait
d'un coup toutes les occupations historiques et les cinq fonctions ci-dessus.
Une colonne nullable, elle :

- laisse l'historique existant strictement valide (`source_id` reste le
  `rental_id`) ;
- permet de cibler **le segment** dans les nouvelles requêtes ;
- se remplit, pour les locations existantes, par la migration de données qui crée
  leur segment 1 ;
- ne change rien pour les occupations de maintenance et d'immobilisation.

**Migration de données** — pour chaque location existante :

```
1 segment (sequence_no = 1), reprenant vehicle_id, planned_period,
locked_amount / locked_unit / locked_rule_id / locked_source / locked_at,
status = 'ACTIVE' si la location est en cours, 'ENDED' sinon,
locked_cost_* = NULL  ← aucun coût rétroactif n'est inventé (DEC-008),
puis vehicle_occupations.rental_segment_id renseigné pour les occupations
d'origine 'RENTAL'.
```

## 11.5 L'acte « changer le véhicule »

```sql
swap_rental_vehicle(
  p_rental_id   uuid,
  p_new_vehicle uuid,
  p_effective_at timestamptz,     -- l'instant de la bascule
  p_reason      text              -- OBLIGATOIRE — §26
) returns uuid                    -- le nouveau segment
```

**Ce que la fonction fait, dans une seule transaction** :

1. `require_capability(['rental.rentals.swap'], 'changer le véhicule d''une location en cours')`.
2. `require_capability(['rental.rentals.view'], …)` — elle lit le contrat.
3. Refuse si la location n'est pas `IN_PROGRESS` ou `EXTENDED`.
4. Refuse si `p_effective_at` précède le début du segment ouvert, ou dépasse
   `expected_return_at`.
5. Vérifie `is_vehicle_available(p_new_vehicle, [p_effective_at, expected_return_at))`
   — **la contrainte d'exclusion reste le juge** ; la vérification préalable ne
   sert qu'à produire un message lisible (doctrine de `confirm_reservation`).
6. **Clôt** le segment ouvert : `period` bornée à `p_effective_at`,
   `status = 'ENDED'`, `ended_at`, `reason`.
7. **Réduit** l'occupation du véhicule A à la même borne.
8. **Résout et verrouille** le nouveau prix (`resolve_pricing_rule`) et le nouveau
   coût (`resolve_supplier_rate`). **Sans tarif client applicable, la fonction
   échoue** — jamais un prix nul (doctrine de `confirm_reservation`).
9. Crée le segment `sequence_no + 1` et son occupation, rattachée au segment.
10. Met à jour `rentals.vehicle_id` et `rentals.current_segment_id`.

**Ce que la fonction ne fait pas** : elle **ne change pas le statut** de la
location. Un changement de véhicule n'est pas une étape du cycle de DEC-006 ; en
faire un état inventerait une transition que la documentation ne décrit pas.

## 11.6 Impacts sur le reste du cycle

| Objet | Impact | Traitement |
| --- | --- | --- |
| **Réservation** | Aucun. Une réservation reste mono-véhicule | — |
| **Contrat / location** | `vehicle_id` devient le véhicule **courant** ; la vérité est dans les segments | Toutes les lectures financières passent par les segments |
| **Facturation** | Une location à N segments peut produire **N lignes `RENTAL`**, une par véhicule et période | L'écran de facturation propose les segments ; la **quantité reste saisie** (DEC-030 §b) |
| **Tarification** | Chaque segment porte sa propre source de tarif | Le résumé nomme les deux sources |
| **Marge** | Somme des segments | §10.1 |
| **Incidents** | `vehicle_incidents` porte déjà `vehicle_id` **et** `rental_id` | À vérifier au LOT 21 : le rattachement doit désigner le bon segment |
| **Maintenance** | Le véhicule A part en maintenance : son occupation de maintenance ne doit pas heurter l'occupation de location déjà réduite | Étape 7 de `swap_rental_vehicle` : la réduction **précède** toute pose |
| **Départ / retour** | `rental_inspections` a `unique (rental_id, kind)` — **un seul départ, un seul retour** | **Question B-4** : faut-il un état des lieux par segment ? Recommandation : **oui**, la contrainte devient `unique (rental_segment_id, kind)`, sans quoi la restitution du véhicule A n'est constatée nulle part |
| **Clôture** | Inchangée : `close_rental` exige `INVOICED` | — |

---

# 12. Locations longue durée

## 12.1 Ce qui existe

`extend_rental(p_rental_id, p_new_end, p_reason)` :

- exige `IN_PROGRESS` ou `EXTENDED` ;
- refuse une date antérieure à `expected_return_at` ;
- **étend l'occupation** — la contrainte d'exclusion refuse si la période est
  déjà engagée ;
- déplace `expected_return_at`, passe le statut à `EXTENDED` ;
- **ne conserve l'avant/après que dans le journal d'audit** (DEC-025 §d) ;
- **ne retarife pas.** Le tarif verrouillé initial court sur toute la durée.

## 12.2 Les trois obstacles à lever

### Obstacle 1 — « une location, une facture », en base

```sql
create unique index customer_invoices_one_per_rental_idx
  on public.customer_invoices (rental_id)
  where rental_id is not null and status <> 'CANCELLED';
```

Cet index **interdit** la facturation périodique. Il n'est pas décoratif : il
ferme la course entre deux saisies simultanées, ce qu'aucun déclencheur ne peut
voir (leçon de DEC-028).

**Remplacement proposé** :

```sql
-- Une location à durée fixée : toujours une seule facture.
create unique index customer_invoices_one_per_fixed_rental_idx
  on public.customer_invoices (rental_id)
  where rental_id is not null and billing_period_id is null and status <> 'CANCELLED';

-- Une longue durée : une facture par PÉRIODE facturable, jamais deux.
create unique index customer_invoices_one_per_period_idx
  on public.customer_invoices (billing_period_id)
  where billing_period_id is not null and status <> 'CANCELLED';
```

Et un déclencheur : `billing_period_id` non nul **exige** que la location soit de
type `LONG_TERM` et que la période lui appartienne.

### Obstacle 2 — « seule une location À FACTURER se facture »

`fn_customer_invoice_coherence` refuse toute facture dont la location n'est pas
`TO_INVOICE`. Une longue durée facturée **en cours de route** est
`IN_PROGRESS` ou `EXTENDED`.

**Assouplissement proposé, strictement borné** :

```
rental_type = 'FIXED_TERM'  →  la location doit être TO_INVOICE   (inchangé)
rental_type = 'LONG_TERM'   →  la location doit être IN_PROGRESS, EXTENDED
                               ou TO_INVOICE, ET la facture doit désigner
                               une période facturable ACHEVÉE
```

« Achevée » : `upper(période) <= now()`. **On ne facture pas d'avance** — une
facturation par anticipation supposerait une règle d'acompte que la documentation
n'a jamais posée (`04_Workflows/02_Reservation.md` §58 : « **si** ADIKOM décide de
gérer un acompte »). *Décision A-6.*

### Obstacle 3 — « Facturée » comme conséquence de l'émission

`issue_customer_invoice` fait passer la location de `TO_INVOICE` à `INVOICED`.
Pour une longue durée facturée en cours, cet effet est **faux** : le contrat
continue.

**Correction** : la bascule `TO_INVOICE → INVOICED` ne s'applique qu'aux
locations dont **toutes** les périodes facturables sont couvertes par une facture
émise, et qui sont déjà `TO_INVOICE`. Une facture intermédiaire ne change pas le
statut de la location.

## 12.3 Structures proposées

```sql
rental_extensions (
  id             uuid pk,
  rental_id      uuid not null → rentals on delete cascade,
  sequence_no    int  not null,
  previous_end   timestamptz not null,
  new_end        timestamptz not null,
  reason         text,
  -- retarification éventuelle — décision A-7
  locked_amount  bigint, locked_unit pricing_unit,
  locked_rule_id uuid, locked_source text, locked_at timestamptz,
  created_at/by,
  constraint extensions_forward check (new_end > previous_end),
  constraint extensions_unique unique (rental_id, sequence_no)
)

rental_billing_periods (
  id             uuid pk,
  rental_id      uuid not null → rentals on delete cascade,
  sequence_no    int  not null,
  period         tstzrange not null,
  status         text not null default 'OPEN',   -- OPEN · INVOICED · CANCELLED
  created_at/by,
  constraint periods_unique unique (rental_id, sequence_no),
  constraint periods_no_overlap exclude using gist
    (rental_id with =, period with &&)
)
```

`rentals.rental_type` : `FIXED_TERM` par défaut — **toutes les locations
existantes restent exactement ce qu'elles sont.**

## 12.4 Le cycle d'une longue durée

```
Création (rental_type = LONG_TERM, période initiale)
        │
        ├─▶ période facturable 1 créée automatiquement
        ▼
   Départ  →  IN_PROGRESS
        │
        ├─ fin de la période 1 ─▶ Facture 1 (émise) ─▶ Règlement ─▶ Trésorerie
        │                          la location reste IN_PROGRESS
        ▼
   Prolongation (extend_rental)
        │  · rental_extensions : ligne N
        │  · rental_billing_periods : période N+1
        │  · si le tarif change : nouveau segment (LOT 21)
        ▼
        ├─ fin de la période 2 ─▶ Facture 2 ─▶ Règlement
        ▼
   Retour  →  RETURNED → TO_CONTROL → TO_INVOICE
        │
        ├─▶ Facture finale (dernière période + frais éventuels)
        ▼
   INVOICED  →  CLOSED
```

## 12.5 Ce que le plan refuse

- **Pas d'abonnement.** Aucune reconduction tacite, aucune génération automatique
  de période future, aucun ordonnanceur. Le projet n'en a aucun (DEC-025 §a), et
  un statut qui dépendrait d'une tâche non exécutée mentirait.
- **Pas de facturation d'avance** — sauf décision explicite (A-6).
- **Pas de retarification automatique** à la prolongation. Le tarif initial court,
  sauf si l'utilisateur autorisé le change explicitement — *décision A-7*.

---

# 13. Résumé de fin de location

## 13.1 Ce que le système sait déjà produire

| Document | Registre | Capacités |
| --- | --- | --- |
| Contrat de location | `contrats` | `rental.rentals.view` + `download` / `print` |
| Bon de départ | `departs` | idem |
| PV de retour | `retours` | idem |
| Confirmation de réservation | `reservations` | `rental.reservations.*` |
| Facture client | `factures-clients` | `billing.customer_invoices.*` |

Tous passent par `src/lib/documents/registry.ts`, un seul contrôle d'accès, un
seul rendu (`@react-pdf/renderer`), servi tel quel pour l'aperçu, le
téléchargement et l'impression.

## 13.2 Contenu proposé du résumé — disponible vs à construire

| Bloc | Source | Disponible ? |
| --- | --- | --- |
| Identité ADIKOM, logo | `getDocumentIdentity()` | ✅ |
| Client | `clients` | ✅ *(sous `parties.clients.view`)* |
| Contrat : n°, type, statut, dates prévues / réelles | `rentals` | ✅ |
| **Véhicules et périodes** | `rental_segments` | **LOT 21** |
| **Tarifs appliqués et leur source** | `rental_segments.locked_*` | **LOT 21** |
| Durée : prévue, réelle, écart | `rentals` | ✅ *(calcul)* |
| **Prolongations** | `rental_extensions` | **LOT 22** |
| État des lieux départ / retour, comparaison | `rental_inspections` | ✅ |
| Photos | `rental_inspection_photos` | ✅ *(vignettes — à évaluer, poids du PDF)* |
| Incidents et dommages constatés | `vehicle_incidents`, `incident_damages` | ✅ *(sous `rental.incidents.view`)* |
| **Factures émises** (une ou plusieurs) | `customer_invoices` | ✅ / étendu LOT 22 |
| Total, réductions, encaissé, solde | fonctions SQL existantes | ✅ |
| Règlements : date, mode, montant | `customer_payments` | ✅ |
| Frais supplémentaires | lignes `FEE` | ✅ |
| Observations | `rentals.notes`, `conditions`, `status_reason` | ✅ |
| Historique du cycle | `audit_log` | ✅ *(sous `users.audit.view`)* |
| **Marge commerciale** | segments | **LOT 20/21** |

## 13.3 Aucune capacité documentaire nouvelle

Le résumé est un **quatrième document du cycle de location** : il rejoint
`contrats`, `departs` et `retours` sous `rental.rentals.download` et
`rental.rentals.print`, exactement comme eux.

**Pourquoi c'est correct au regard de DEC-024** : la fonction `rentalDocument()`
partage déjà ces deux capacités entre trois documents, et **chaque bloc du PDF
est conditionné à la capacité de sa donnée** — le client à `parties.clients.view`,
les montants à `rental.rentals.financial.view`, le coût et la marge à
`rental.pricing.supplier.view`, les incidents à `rental.incidents.view`,
l'historique à `users.audit.view`. Un document n'expose donc jamais plus que
l'écran, et **il nomme ce qu'il ne peut pas montrer** plutôt que de le taire
(DEC-017 — le bloc `OmissionNote` existe déjà).

Créer `rental.rentals.summary.download` ajouterait un code qui ne fermerait rien
que les capacités de bloc ne ferment déjà.

## 13.4 Conditions d'accès au résumé

| Question | Réponse proposée |
| --- | --- |
| À partir de quel statut ? | À partir de `RETURNED`. Avant le retour, le résumé n'aurait ni relevé de retour, ni écart, ni frais — il annoncerait un état des lieux qui n'existe pas |
| Une location annulée ? | Oui, avec la mention explicite de l'annulation et de son motif |
| Consulter ≠ télécharger ≠ imprimer | Oui, comme partout (DEC-024) |

---

# 14. Module Produits & Services

## 14.1 Services

```sql
services (
  id             uuid pk,
  service_no     text not null unique,             -- SRV-000001, next_number
  code           text unique,                      -- code interne facultatif
  label          text not null,
  category_id    uuid not null → service_categories,
  description    text,
  purpose        service_purpose not null,         -- PURCHASE · SALE · BOTH
  status         service_status not null default 'ACTIVE',
  unit_label     text,                             -- « prestation », « heure », « jour »
  notes          text,
  created_at/by, updated_at/by,
  constraint services_label_not_blank check (btrim(label) <> '')
)
```

- `unique index on lower(label)` — même garde que `vehicle_categories`.
- **Aucun prix sur cette table.** Les prix vivent sur la variante (§14.3), y
  compris pour un service sans variante déclarée : il en reçoit une, dite
  « standard ». C'est ce qui évite deux endroits où lire un prix.
- `fn_forbid_delete` (D6) — un service se désactive ou s'archive.
- Audit `fn_audit_row('catalog')`.

**Sous-menus proposés pour la fiche service** :

| Onglet | Contenu | Capacité |
| --- | --- | --- |
| **Service** | Nom, code, catégorie, description, destination, unité, statut | `catalog.services.view` |
| **Variantes & prix** | Variantes, prix de vente, prix d'achat, **marge** | `catalog.services.view` ; le prix d'achat sous `catalog.services.cost.view` |
| **Achat** | Fournisseur habituel, référence fournisseur, délai *(à confirmer — B-5)* | `catalog.services.cost.view` |
| **Vente** | Libellé commercial, mentions de facture | `catalog.services.view` |
| **Utilisation** | Devis, commandes, ventes PDV, factures portant ce service | capacités des modules concernés |
| **Historique** | Journal d'activité de la fiche | `users.audit.view` |

L'onglet « Utilisation » n'apparaît qu'à partir des LOT 24 / 27 — avant, il
n'aurait rien à montrer, et un onglet vide est une promesse non tenue
(leçon de DEC-042 §c).

## 14.2 Catégories

```sql
service_categories (
  id            uuid pk,
  code          text not null unique,
  label         text not null,
  description   text,
  is_active     boolean not null default true,
  display_order int not null default 0,
  created_at/by, updated_at/by
)
```

**Modèle repris à l'identique de `vehicle_categories`** — même forme, même
`unique index on lower(label)`, même audit, même absence de suppression. Ce n'est
pas de la paresse : deux référentiels de même nature qui divergeraient dans leur
forme divergeraient ensuite dans leur comportement.

| Acte | Capacité |
| --- | --- |
| Consulter | `catalog.categories.view` |
| Créer | `catalog.categories.create` |
| Modifier | `catalog.categories.update` |
| Activer / désactiver | `catalog.categories.archive` |

> **Écart assumé avec l'exemple de la Direction.** L'énoncé suggérait
> `services.categories.manage`. Le plan propose quatre codes plutôt qu'un, pour
> s'aligner sur `rental.categories.*` qui en compte cinq. Une catégorie
> désactivée cesse d'être proposée mais reste attachée aux services existants :
> désactiver n'est donc pas modifier, et les confondre donnerait à qui corrige un
> libellé le pouvoir de retirer une catégorie de la circulation.

Une catégorie **ne se supprime pas** dès qu'un service la porte
(`on delete restrict`).

## 14.3 Variantes

```sql
service_variants (
  id            uuid pk,
  service_id    uuid not null → services on delete cascade,
  label         text not null,                  -- « Standard », « Express », « Groupe »
  sku           text unique,                    -- référence facultative
  purchase_price bigint check (purchase_price > 0),   -- NULL si non acheté
  sale_price     bigint check (sale_price > 0),       -- NULL si non vendu
  currency_code  text not null default 'KMF',
  is_default     boolean not null default false,
  is_active      boolean not null default true,
  display_order  int not null default 0,
  created_at/by, updated_at/by,

  constraint variants_unique_label unique (service_id, lower(label)),
  -- une variante doit porter au moins un prix : sans aucun, elle ne sert à rien
  constraint variants_has_a_price check (purchase_price is not null
                                      or sale_price is not null)
)
```

- `create unique index … on service_variants (service_id) where is_default` —
  une seule variante par défaut.
- Un service **sans variante déclarée** reçoit à sa création une variante
  « Standard » marquée par défaut. **Il n'existe donc jamais de service sans
  variante** : c'est ce qui garantit qu'une ligne de vente désigne toujours un
  prix précis, sans cas particulier à traiter dans quatre modules.

**Cohérence prix / destination**, imposée par déclencheur :

| `purpose` | Contrainte |
| --- | --- |
| `SALE` | Au moins une variante active avec `sale_price`. `purchase_price` **interdit** |
| `PURCHASE` | Au moins une variante active avec `purchase_price`. `sale_price` **interdit** |
| `BOTH` | Les deux prix **admis**, aucun obligatoire — mais la marge n'est calculée que si les deux existent |

## 14.4 Prix d'achat — donnée sensible

`purchase_price` est le **coût** d'ADIKOM. Sa protection appelle exactement le
raisonnement de `maintenance_costs` (D7) : RLS est *row-level*, elle ne sait pas
masquer une colonne.

**Deux options, et le choix à faire (décision A-8)** :

| Option | Mécanisme | Coût | Garantie |
| --- | --- | --- | --- |
| **A — table séparée** `service_variant_costs` | Le prix d'achat sort de `service_variants` | Une jointure de plus partout | **Réelle**, y compris pour un appel PostgREST direct |
| **B — colonne + filtrage serveur** | La colonne reste ; les lectures ne la sélectionnent que si `catalog.services.cost.view` | Simple | **Nulle contre un appel direct** : `select *` sur `service_variants` renverrait le coût à qui a `catalog.services.view` |

**Recommandation : option A.** C'est le seul choix cohérent avec le précédent de
la maintenance, et le seul qui tienne face à la troisième couche. Le surcoût est
une jointure ; le bénéfice est que le prix d'achat n'est jamais lisible par
accident.

## 14.5 Prix de vente

Sur la variante, sous `catalog.services.view` pour la lecture,
`catalog.services.price.update` pour la modification.

**Pourquoi une capacité distincte de `catalog.services.update`** : le précédent
existe déjà — `parties.clients.pricing.manage` est distincte de
`parties.clients.update`. Corriger une description et changer un prix ne sont pas
le même geste, et le second est un acte commercial.

Toute écriture de prix produit un événement d'audit **`PRICE_CHANGE`**, comme
`pricing_rules`.

## 14.6 Marge d'un service

```
Marge unitaire     = prix de vente − prix d'achat
Taux de marge      = marge ÷ prix de vente        ← affiché seulement si vente > 0
Marge d'une ligne  = (prix unitaire vendu − coût unitaire copié) × quantité
```

| Cas | Traitement |
| --- | --- |
| Service **sans prix d'achat** | Marge **non calculée**. L'écran écrit « pas de prix d'achat renseigné ». Un coût nul ferait passer la marge pour 100 % du prix |
| Service **sans prix de vente** | Marge non calculée |
| **Achat uniquement** | Aucune marge — un service acheté et consommé n'en produit pas |
| **Vente uniquement** | Aucune marge — sauf si ADIKOM veut y voir 100 %, ce qui serait faux |
| **Variantes à prix différents** | La marge est **par variante**. Aucune moyenne n'est affichée : elle mélangerait des volumes inconnus |
| **Évolution des prix** | La ligne vendue porte le prix **et** le coût **copiés** (D13). Une hausse ultérieure ne modifie donc jamais la marge d'une vente passée |
| **Historique des prix** | **Aucune table dédiée.** L'audit `PRICE_CHANGE` conserve l'avant/après ; les lignes conservent la copie. Deux sources diraient la même chose et finiraient par diverger |
| Lecteur sans `cost.view` | Ni le coût **ni la marge** ne sont affichés, et l'écran le **dit** (DEC-017) |

## 14.7 Partie Produits — réservée, non développée

La Direction l'écarte explicitement. **Aucune table produit n'est créée.**

Ce que le LOT 19 réserve, et rien de plus :

1. **Le nom du module** est « Produits & Services », son code `catalog` — et non
   `services`. Renommer un `module_code` après attribution des capacités serait
   coûteux ; le choisir large aujourd'hui ne coûte rien.
2. **La navigation** prévoit deux entrées sous le module ; celle des produits
   n'est **pas affichée** tant qu'elle n'existe pas. Le projet a supprimé toutes
   ses entrées « à venir » (DEC-042) et n'en réintroduira pas.
3. **Aucune capacité `catalog.products.*`** n'est créée — une permission qui ne
   débloque rien ne s'attribue pas (`CLAUDE.md` §19 bis).
4. **Aucun champ d'entrepôt, de stock ou de mouvement** n'est ajouté nulle part —
   ni sur les services, ni sur les lignes de vente, ni sur le PDV.

Ce que la partie Produits demandera le jour venu, et qu'il faut savoir dès
maintenant : entrepôts, stocks par entrepôt, mouvements, valorisation (PMP ou
FIFO), inventaire, et un coût de revient qui n'est plus un simple prix d'achat.
**C'est un chantier au moins aussi lourd que les cinq axes de ce plan.**

---

# 15. Module Commerce

## 15.1 Devis clients

```sql
sales_quotes (
  id            uuid pk,
  quote_no      text not null unique,          -- DEV-C-2026-000001
  client_id     uuid not null → clients,
  quote_date    date not null,
  valid_until   date,                          -- durée de validité
  currency_code text not null default 'KMF',
  status        commercial_document_status not null default 'DRAFT',
  notes         text, terms text,
  sent_at/by, accepted_at/by, refused_at/by, cancelled_at/by,
  status_reason text, status_changed_at/by,
  created_at/by, updated_at/by,
  constraint quotes_validity check (valid_until is null or valid_until >= quote_date)
)

sales_quote_lines (
  id                 uuid pk,
  sales_quote_id     uuid not null → sales_quotes on delete cascade,
  service_id         uuid → services,
  service_variant_id uuid → service_variants,
  label              text not null,            -- copié, modifiable
  quantity           integer not null check (quantity > 0),
  unit_price         bigint  not null check (unit_price > 0),
  unit_cost          bigint  check (unit_cost > 0),   -- COPIÉ, pour la marge
  discount_amount    bigint  not null default 0 check (>= 0),
  is_archived        boolean not null default false,
  created_at/by, updated_at/by
)
```

**Doctrine appliquée** :

- **Aucun total stocké** (D1). `sales_quote_subtotal()`, `sales_quote_discount()`,
  `sales_quote_total()`, `sales_quote_margin()` — quatre fonctions `stable`,
  `SECURITY INVOKER`.
- Une ligne saisie par erreur **s'archive**, elle ne s'efface pas (D6).
- Un devis **naît en brouillon** (déclencheur `BEFORE INSERT`, couche 5 de D3).
- **Les lignes se figent** dès que le devis quitte `DRAFT` — un devis envoyé au
  client ne se réécrit pas dans son dos (même règle que `customer_invoice_lines`).
- `sales_quote_margin()` exige `catalog.services.cost.view` : sans elle, elle
  renvoie **NULL**, jamais 0.

## 15.2 Commandes clients

```sql
sales_orders (
  id             uuid pk,
  order_no       text not null unique,         -- CDE-C-2026-000001
  client_id      uuid not null → clients,
  sales_quote_id uuid → sales_quotes,          -- origine facultative
  order_date     date not null,
  expected_date  date,
  status         order_status not null default 'DRAFT',
  …
)
sales_order_lines ( … même forme, + source_quote_line_id )
```

**Pourquoi une table distincte du devis, et non un statut de plus** :
c'est la doctrine de DEC-006 — « une réservation n'est pas une location. Deux
entités, deux jeux de statuts, reliés par une référence, jamais une valeur
partagée ». Un devis peut être refusé ; une commande, non. Un devis a une durée
de validité ; une commande, une date de livraison attendue. Les fondre
obligerait à porter des colonnes vides la moitié du temps et à écrire des
statuts qui n'ont de sens que dans un cas.

## 15.3 Devis fournisseurs · 15.4 Commandes fournisseurs

Même structure, symétrique : `purchase_quotes`, `purchase_quote_lines`,
`purchase_orders`, `purchase_order_lines`, avec `supplier_id` au lieu de
`client_id`, `unit_price` = **prix d'achat**, et **aucune notion de marge** — on
n'a pas de marge sur un achat.

## 15.5 Intégration à la facturation existante

### Côté client

```
Commande client CONFIRMED
        │
        │  create_invoice_from_sales_order(p_order_id, p_invoice_date, p_due_date)
        ▼
create_customer_invoice(...)              ← fonction EXISTANTE, non dupliquée
        │
        └─▶ add_customer_invoice_line(...) pour chaque ligne active
                kind = 'SERVICE'
                label, quantity, unit_price   ← copiés de la commande
                service_id, service_variant_id, unit_cost  ← nouvelles colonnes
        ▼
issue_customer_invoice(...)               ← fonction EXISTANTE
        ▼
record_customer_payment(...)              ← fonction EXISTANTE
        ▼
treasury_entries (IN)                     ← conséquence, jamais un acte
```

**Aucune fonction de facturation n'est réécrite.** La nouvelle fonction
`create_invoice_from_sales_order` est un **orchestrateur** : elle appelle les
fonctions existantes, qui portent déjà leurs cinq couches de contrôle.

**Capacités exigées** : `commerce.sales_orders.view` (elle lit la commande)
**+** `billing.customer_invoices.create` **+** `billing.customer_invoices.view`
**+** `parties.clients.view`. Elle n'exige **pas** `issue` : émettre reste un
acte distinct.

### Colonnes ajoutées à `customer_invoice_lines`

| Colonne | Type | Rôle |
| --- | --- | --- |
| `service_id` | uuid null → `services` | Traçabilité de l'origine |
| `service_variant_id` | uuid null → `service_variants` | idem |
| `unit_cost` | bigint null | **Coût copié** — seule base de la marge d'une facture |
| `source_order_line_id` | uuid null | Lien vers la ligne de commande |

Toutes **nullables** : les lignes de location et de frais existantes n'en portent
aucune, et **aucune donnée existante n'est modifiée**.

`unit_cost` est **sensible**. Il n'est jamais sélectionné sans
`catalog.services.cost.view`. *(Le même arbitrage qu'au §14.4 s'applique ; si
l'option A y est retenue, `unit_cost` doit lui aussi vivre dans une table
séparée `customer_invoice_line_costs` — cohérence à trancher en même temps.)*

### Côté fournisseur

`supplier_invoice_lines` porte aujourd'hui `label`, `amount`, `vehicle_id`, et
`amount` est **l'unique source du montant brut** (`supplier_invoice_gross`).

Ajouter `quantity` et `unit_price` créerait **deux sources du même chiffre** —
exactement ce que D1 refuse.

**Solution** : `quantity` et `unit_price` **nullables**, plus une contrainte :

```sql
constraint supplier_invoice_lines_amount_consistent check (
  (quantity is null and unit_price is null)
  or amount = quantity::bigint * unit_price
)
```

`amount` reste la seule source lue ; la décomposition, quand elle existe, est
**vérifiée par la base**. La fonction d'ajout de ligne calcule `amount` et ne
laisse pas le choix.

### Ce qui n'est pas fait

- **Aucun second numéroteur.** Quatre règles ajoutées à `numbering_rules` :
  `sales_quote` (DEV-C), `sales_order` (CDE-C), `purchase_quote` (DEV-F),
  `purchase_order` (CDE-F). Format provisoire, comme `FAC-C` — **DEC-023 §4
  réserve la convention définitive à la validation du responsable comptable**.
- **Aucune livraison, aucun bon de livraison, aucune réception**. La Direction
  écrit « nous ne voulons pas développer des étapes inutiles ». La réception d'une
  prestation est constatée par le passage de la commande fournisseur à
  `DELIVERED` — un statut, pas un document. *Décision B-6.*
- **Aucune taxe** (DEC-014).

---

# 16. Module PDV — Point de vente

## 16.1 Caisse

**Une caisse PDV n'est pas un compte financier : elle en utilise un.**

```sql
pos_registers (
  id          uuid pk,
  register_no text not null unique,             -- CAI-000001
  label       text not null,                    -- « Comptoir Moroni »
  account_id  uuid not null → financial_accounts,  -- OBLIGATOIREMENT kind = 'CASH'
  location    text,
  is_active   boolean not null default true,
  created_at/by, updated_at/by
)
```

Un déclencheur refuse un `account_id` dont le `kind` n'est pas `CASH` ou dont le
`status` n'est pas `ACTIVE`. C'est **la** garantie qu'il n'existe pas deux
trésoreries : tout ce que la caisse encaisse atterrit dans un compte que le
module Banques & Caisses connaît, et `financial_account_balance()` continue d'être
la seule vérité du solde.

## 16.2 Panier

```sql
pos_sales (
  id           uuid pk,
  sale_no      text not null unique,            -- VTE-2026-000001
  session_id   uuid not null → pos_sessions,
  client_id    uuid → clients,                  -- nullable ? décision A-12
  sold_at      timestamptz not null default now(),
  observation  text,                            -- champ demandé par la Direction
  status       pos_sale_status not null default 'VALIDATED',
  cancelled_at/by, status_reason,
  created_at/by, updated_at/by
)

pos_sale_lines (
  id                 uuid pk,
  pos_sale_id        uuid not null → pos_sales on delete cascade,
  service_id         uuid not null → services,
  service_variant_id uuid not null → service_variants,
  label              text not null,             -- copié
  quantity           integer not null check (quantity > 0),
  unit_price         bigint  not null check (unit_price > 0),   -- copié
  unit_cost          bigint  check (unit_cost > 0),             -- copié, marge
  discount_amount    bigint  not null default 0 check (>= 0),
  created_at/by
)
```

**Aucun total stocké** (D1) : `pos_sale_total(p_sale_id)`,
`pos_sale_margin(p_sale_id)`.

**Une vente ne vend que ce qui est vendable** : déclencheur exigeant
`services.purpose in ('SALE','BOTH')`, `services.status = 'ACTIVE'`,
`service_variants.is_active`, et `sale_price is not null`.

## 16.3 Client

- Un client de vente est **une ligne de `clients`** — jamais un nom libre.
- **Décision A-12** : le client est-il **obligatoire** ? Une vente au comptoir
  peut être anonyme. Trois options : (i) obligatoire ; (ii) facultatif ;
  (iii) facultatif, avec un client générique « Client comptoir » créé une fois
  dans le référentiel.
  **Recommandation : (ii) facultatif.** L'option (iii) fabriquerait un faux tiers
  dont les statistiques par client deviendraient absurdes ; l'option (i)
  ralentirait la caisse, ce que la Direction refuse explicitement.
  Conséquence assumée : une vente sans client **ne peut pas** produire de facture.

## 16.4 Paiement

```sql
pos_payments (
  id              uuid pk,
  pos_sale_id     uuid not null → pos_sales on delete cascade,
  method          payment_method not null,      -- CASH · CHEQUE · MVOLA · HOLO · WAKATI · …
  tendered_amount bigint not null check (tendered_amount > 0),   -- MONTANT DONNÉ
  applied_amount  bigint not null check (applied_amount  > 0),   -- MONTANT ENCAISSÉ
  external_ref    text,                         -- n° de chèque, référence Mvola
  created_at/by,

  constraint pos_payments_applied_le_tendered
    check (applied_amount <= tendered_amount),

  -- On ne rend pas la monnaie sur un chèque ni sur un transfert mobile.
  constraint pos_payments_change_only_in_cash
    check (method = 'CASH' or applied_amount = tendered_amount)
)
```

**Extension de l'enum `payment_method`** : `MVOLA`, `HOLO`, `WAKATI`. Migration
dédiée, sans autre contenu (§7.3). Ces modes deviennent aussi disponibles pour
les règlements clients et fournisseurs — c'est cohérent : ADIKOM les reçoit et
les émet ailleurs qu'au comptoir.

## 16.5 – 16.7 Montant donné, montant encaissé, monnaie rendue

**La règle métier de la Direction, transcrite sans interprétation** :

```
Net à payer          =  pos_sale_total(vente)
Montant donné        =  Σ pos_payments.tendered_amount
Montant encaissé     =  Σ pos_payments.applied_amount
Monnaie à rendre     =  Montant donné − Montant encaissé
```

**Invariant imposé par la base**, contrôlé à la validation de la vente :

```
Σ applied_amount  =  pos_sale_total(vente)
```

C'est **exactement** l'exigence de la Direction : *« Montant encaissé = Net à
payer lorsque le client donne au moins le montant exact dû. »*

**L'écriture de trésorerie porte `Σ applied_amount`, jamais `Σ tendered_amount`.**
C'est la ligne la plus importante de tout le module. Elle est garantie par
`fn_treasury_entry_source`, qui compare l'écriture à sa vente et **refuse** toute
autre combinaison — au même titre qu'elle refuse déjà une écriture de règlement
qui ne reprendrait pas le compte, le montant et le sens de son règlement.

### Les trois cas

| Cas | Effet | Traitement |
| --- | --- | --- |
| **Donné = à payer** | Monnaie = 0 | Vente validée |
| **Donné > à payer** | Monnaie > 0, en espèces uniquement | Vente validée. La caisse ne reçoit **que** le net à payer |
| **Donné < à payer** | Vente non soldée | **Décision A-10** — voir ci-dessous |

### Le cas « donné < à payer » — décision A-10

| Option | Conséquence |
| --- | --- |
| **Bloquer** *(recommandé)* | Cohérent avec le refus du trop-perçu (DEC-031 §b) et avec « aucune règle inventée ». Une vente au comptoir est une vente comptant. Le refus **nomme** son motif |
| Autoriser un paiement partiel | Crée une **créance client sans facture** : un objet que le système ne sait ni suivre, ni relancer, ni solder. Suppose alors de trancher aussi comment cette créance se règle et de quoi elle dépend |

**Recommandation : bloquer**, et diriger vers le circuit facture pour toute
vente à crédit — circuit qui existe, qui sait suivre un solde, et qui est déjà
éprouvé.

## 16.8 Reçu

| Élément | Source |
| --- | --- |
| Identité ADIKOM, logo | `getDocumentIdentity()` |
| N° de vente, date et heure | `pos_sales` |
| Caissier et session | `pos_sessions` → `app_users` |
| Client, si renseigné | `clients` |
| Lignes : service, variante, quantité, PU, remise, total | `pos_sale_lines` |
| **Total à payer** | `pos_sale_total()` |
| Mode(s) de paiement | `pos_payments` |
| **Montant donné · Montant encaissé · Monnaie rendue** | `pos_payments` |
| Observation | `pos_sales.observation` |

- **Format** : le même que tous les autres documents — A4 PDF, registre
  `src/lib/documents/registry.ts`, entrée `ventes`. Aucun format ticket 80 mm :
  la Direction demande explicitement une caisse **clavier / souris / écran
  classique**, pas une caisse tactile de supermarché ; le format A4 est celui que
  l'imprimante de bureau attend.
- **Capacités** : `pos.sales.view` + `pos.sales.download` / `pos.sales.print`
  (D14, DEC-024).
- **Le coût et la marge ne figurent jamais sur le reçu** — c'est une pièce remise
  au client.

## 16.9 – 16.12 Sessions de caisse

```sql
pos_sessions (
  id               uuid pk,
  session_no       text not null unique,        -- SES-2026-000001
  register_id      uuid not null → pos_registers,
  cashier_id       uuid not null → app_users,
  opened_at        timestamptz not null default now(),
  opening_float    bigint not null default 0 check (opening_float >= 0),
  closed_at        timestamptz,
  counted_amount   bigint check (counted_amount >= 0),  -- constaté à la clôture
  closing_note     text,
  status           pos_session_status not null default 'OPEN',
  created_at/by, updated_at/by,

  constraint sessions_closed_is_dated
    check (status <> 'CLOSED' or (closed_at is not null and counted_amount is not null)),
  constraint sessions_closed_after_opened
    check (closed_at is null or closed_at >= opened_at)
)
```

**Une seule session ouverte par caisse** :

```sql
create unique index pos_sessions_one_open_per_register_idx
  on pos_sessions (register_id) where status = 'OPEN';
```

**Montants dérivés — jamais stockés** (D1, D2) :

```
Total encaissé de la session  =  Σ pos_sale_total(v) des ventes VALIDÉES
Montant théorique de clôture  =  opening_float + Σ des encaissements en ESPÈCES
Écart                         =  counted_amount − montant théorique
```

L'écart n'est stocké nulle part : le stocker créerait une seconde vérité, qu'une
vente annulée après clôture ferait mentir.

**Répondre à « qui était à la caisse le 9 septembre entre 10h00 et 11h30 ? »**

```sql
select * from pos_sessions
where register_id = :caisse
  and tstzrange(opened_at, coalesce(closed_at, 'infinity')) && tstzrange(:debut, :fin);
```

Un index GiST sur cette expression rend la question instantanée. C'est
exactement le besoin exprimé par la Direction, et il se règle par une ligne de
SQL parce que la session est un objet daté et non un attribut de la vente.

### Les actes

| Acte | Fonction | Contrôles |
| --- | --- | --- |
| **Ouvrir** | `open_pos_session(register, opening_float)` | `pos.sessions.open` ; caisse active ; compte `CASH` actif ; aucune session ouverte sur cette caisse ; *décision B-8 : un même utilisateur peut-il ouvrir deux caisses ?* |
| **Fermer** | `close_pos_session(session, counted_amount, note)` | `pos.sessions.close` ; session ouverte ; **`counted_amount` obligatoire** ; l'écart est **affiché**, jamais opposé |
| **Consulter** | lecture | `pos.sessions.view` |
| **Consulter les montants** | lecture | `pos.sessions.amounts.view` — **capacité distincte**, voir §17.5 |

**Un écart n'empêche pas la clôture.** Aucune règle ADIKOM ne définit un seuil
toléré ni ce qu'il faut faire au-delà. Le système **constate** et **journalise** ;
il n'arbitre pas. *Décision B-9 : faut-il un seuil, et que déclenche-t-il ?*

**Une vente exige une session ouverte** : `pos_sales.session_id` est `not null`,
et un déclencheur refuse une vente dont la session n'est pas `OPEN`. Sans cette
règle, la traçabilité du caissier — la demande centrale de la Direction —
n'existerait pas.

**Une session fermée ne se rouvre pas.** État terminal, comme tous les états
terminaux du système.

## 16.13 Traçabilité du caissier

Elle repose sur trois faits, et sur rien d'autre :

1. `pos_sessions.cashier_id` — **qui**, sur **quelle caisse**, de **quand** à
   **quand**.
2. `pos_sales.session_id` — chaque vente appartient à une session, donc à un
   caissier.
3. `audit_log` — chaque acte (ouverture, vente, annulation, clôture) est
   journalisé avec son auteur, via `fn_audit_row('pos')`.

**Aucun second historique n'est tenu** — la leçon de DEC-042 §4.1 : *deux traces
finissent par diverger, et on ne sait plus laquelle croire.*

## 16.14 Historique des ventes

| Écran | Contenu | Capacité |
| --- | --- | --- |
| `/pdv` | Caisse : recherche, panier, client, paiement, validation | `pos.sales.create` |
| `/pdv/ventes` | Liste filtrable (date, session, caissier, client, mode, statut) | `pos.sales.view` |
| `/pdv/ventes/[id]` | Détail, reçu, annulation | `pos.sales.view` |
| `/pdv/sessions` | Liste des sessions, filtrable par période et caissier | `pos.sessions.view` |
| `/pdv/sessions/[id]` | Détail, ventes, montants, écart | `pos.sessions.view` (+ `amounts.view` pour les montants) |
| `/pdv/caisses` | Caisses et leur compte adossé | `pos.registers.view` |

**Annulation d'une vente** — `cancel_pos_sale(sale, reason)` :

- exige `pos.sales.cancel` ;
- passe la vente à `CANCELLED`, **sans rien effacer** ;
- **annule l'écriture de trésorerie** qu'elle a produite — même mécanisme
  exactement que `cancel_customer_payment` ;
- le solde du compte redescend de lui-même, puisqu'il est calculé.

**Décision B-10** : une vente d'une session **déjà clôturée** peut-elle être
annulée ? Elle fausserait rétroactivement un écart constaté et signé.
**Recommandation : oui, mais l'écran doit dire que la session est close et que
son écart s'en trouve modifié.** L'interdire enfermerait une erreur pour toujours
— et « une impasse n'est pas une garantie » (DEC-027 §e).

**Remboursement** — *hors périmètre*. Aucune règle n'existe (avoir client,
contrepassation : DEC-030 §h les écarte déjà). Une vente erronée s'annule.
*Décision B-11.*

## 16.15 UX de la caisse

Contraintes posées par la Direction : rapide, simple, intuitive, desktop,
responsive, **jamais tactile**.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Session SES-2026-000012 · Comptoir Moroni · Ali M. · ouverte 08:02  │
├───────────────────────────────────┬──────────────────────────────────┤
│  Recherche service   [ Ctrl+K ]   │  PANIER                          │
│  ┌─────────────────────────────┐  │  ┌────────────────────────────┐  │
│  │ transf…                     │  │  │ Transfert aéroport  ×1     │  │
│  └─────────────────────────────┘  │  │ Standard      25 000 KMF   │  │
│                                   │  │ Excursion Itsandra  ×2     │  │
│  Transfert aéroport  · Standard   │  │ Groupe        60 000 KMF   │  │
│  Transfert aéroport  · Nuit       │  └────────────────────────────┘  │
│  Transfert ville     · Standard   │                                  │
│                                   │  Total à payer     85 000 KMF    │
│  ↑ ↓ pour choisir · Entrée ajoute │                                  │
├───────────────────────────────────┤  CLIENT   [ facultatif ]         │
│  PAIEMENT                         │  ┌────────────────────────────┐  │
│  Mode  ( ) Espèce  ( ) Chèque     │  │ Rechercher un client…      │  │
│        ( ) Mvola   ( ) Holo       │  └────────────────────────────┘  │
│        ( ) Wakati                 │                                  │
│  Montant donné  [ 100 000      ]  │  OBSERVATION                     │
│                                   │  ┌────────────────────────────┐  │
│  Montant encaissé     85 000 KMF  │  │                            │  │
│  Monnaie à rendre     15 000 KMF  │  └────────────────────────────┘  │
│                                   │                                  │
│         [ Valider la vente — F2 ]                                    │
└───────────────────────────────────┴──────────────────────────────────┘
```

**Principes** :

- **Le clavier suffit** : `Ctrl+K` recherche, `↑ ↓` naviguent, `Entrée` ajoute,
  `F2` valide, `Échap` annule la saisie en cours. Les raccourcis sont **annoncés
  à l'écran**, jamais devinés.
- **Le total est toujours visible**, sans défilement.
- **Monnaie à rendre calculée à la frappe** — mais la vérité reste calculée par
  le serveur à la validation (D1 et §19 de `CLAUDE.md` : masquer un bouton n'est
  pas une protection ; afficher un total n'est pas le calculer).
- **Aucune grande vignette tactile**, aucune grille d'icônes : une liste dense,
  lisible, filtrée à la frappe.
- **Responsive** : sous 900 px, le panier passe **sous** la zone de saisie et le
  total devient une barre collante en bas. Le fonctionnement ne change pas
  (`CLAUDE.md` §35 : réorganiser, pas rétrécir).
- **États obligatoires** (`CLAUDE.md` §38) : normal, chargement, succès, erreur,
  **vide** (panier vide, catalogue vide), désactivé, **et l'état « aucune session
  ouverte »** — qui doit proposer d'en ouvrir une plutôt que de dire non.

---

# 17. Permissions

## 17.1 Règles de nomenclature retenues

| Règle | Application |
| --- | --- |
| `module.menu.action` · `module.menu.sousmenu.action` | Convention `CLAUDE.md` §19 bis |
| Le suffixe est le **verbe métier** ; la colonne `action` prend la valeur d'enum la plus proche | `close` → `VALIDATE` (précédents : `rental.rentals.close`, `projects.tasks.close`) |
| `view` n'implique **jamais** `export`, `download`, `print` | DEC-024 |
| Une capacité n'est créée que si la fonctionnalité **existe** | `CLAUDE.md` §19 bis |
| Une capacité qui ne fermerait rien n'est **pas** créée | §10.4, §13.3 |
| **Un code existant ne se modifie jamais** | Il peut être attribué |
| Sensible = financier, tarifaire, bancaire, administratif, ou pièce sortant du système | Règles permissions §28, §71 |

## 17.2 Catalogue proposé, lot par lot

### LOT 19 — module `catalog` (module_order **10**)

Menus : `services` (1), `categories` (2).

| Code | Action | Sensible | Libellé |
| --- | --- | :-: | --- |
| `catalog.services.view` | VIEW | | Consulter les services |
| `catalog.services.create` | CREATE | | Créer un service |
| `catalog.services.update` | UPDATE | | Modifier un service |
| `catalog.services.archive` | ARCHIVE | | Archiver / désactiver un service |
| `catalog.services.export` | EXPORT | ✓ | Exporter la liste des services |
| `catalog.services.cost.view` | VIEW | ✓ | **Voir les prix d'achat** |
| `catalog.services.cost.update` | UPDATE | ✓ | **Saisir les prix d'achat** |
| `catalog.services.price.update` | UPDATE | ✓ | Modifier les prix de vente |
| `catalog.categories.view` | VIEW | | Consulter les catégories de services |
| `catalog.categories.create` | CREATE | | Créer une catégorie |
| `catalog.categories.update` | UPDATE | | Modifier une catégorie |
| `catalog.categories.archive` | ARCHIVE | | Activer / désactiver une catégorie |

**+12** — catalogue **178 → 190**

### LOT 20 — `rental.pricing.supplier.*`

| Code | Action | Sensible |
| --- | --- | :-: |
| `rental.pricing.supplier.view` | VIEW | ✓ |
| `rental.pricing.supplier.create` | CREATE | ✓ |
| `rental.pricing.supplier.update` | UPDATE | ✓ |
| `rental.pricing.supplier.export` | EXPORT | ✓ |

**+4** — **190 → 194**. *Aucune capacité de marge* (§10.4).

### LOT 21 — changement de véhicule

| Code | Action | Sensible |
| --- | --- | :-: |
| `rental.rentals.swap` | UPDATE | ✓ |

**+1** — **194 → 195**. Les segments se lisent sous `rental.rentals.view` : ils
ne montrent rien de plus que le contrat, **sauf le coût**, déjà gouverné par
`rental.pricing.supplier.view`.

### LOT 22 · LOT 23 — longue durée, résumé

**+0** — **195**. Déclarer une longue durée relève de `rental.rentals.create` /
`.update` ; prolonger, de `.extend` ; facturer une période, de
`billing.customer_invoices.create` / `.issue` ; le résumé, de `.download` /
`.print` (§13.3).

### LOT 24 — module `commerce` (module_order **11**), côté client

Menus : `sales_quotes` (1), `sales_orders` (2).

`view` · `create` · `update` · `validate` · `cancel` · `export`✓ ·
`download`✓ · `print`✓ — **pour chacun des deux menus**.

**+16** — **195 → 211**

### LOT 25 — `commerce`, côté fournisseur

Menus : `purchase_quotes` (3), `purchase_orders` (4). Mêmes huit actions.

**+16** — **211 → 227**

### LOT 26 — module `pos` (module_order **12**), caisses et sessions

Menus : `registers` (1), `sessions` (2), `sales` (3).

| Code | Action | Sensible | Libellé |
| --- | --- | :-: | --- |
| `pos.registers.view` | VIEW | | Consulter les caisses |
| `pos.registers.create` | CREATE | | Déclarer une caisse |
| `pos.registers.update` | UPDATE | | Modifier une caisse |
| `pos.registers.archive` | ARCHIVE | | Désactiver une caisse |
| `pos.sessions.view` | VIEW | | Consulter les sessions — **qui, quand, quelle caisse** |
| `pos.sessions.amounts.view` | VIEW | ✓ | **Voir les montants** : fond, théorique, compté, écart |
| `pos.sessions.open` | CREATE | | Ouvrir une session |
| `pos.sessions.close` | VALIDATE | | Clôturer une session |
| `pos.sessions.export` | EXPORT | ✓ | Exporter l'historique des sessions |

**+9** — **227 → 236**

### LOT 27 — `pos`, ventes

| Code | Action | Sensible | Libellé |
| --- | --- | :-: | --- |
| `pos.sales.view` | VIEW | | Consulter les ventes |
| `pos.sales.create` | CREATE | | **Encaisser une vente** |
| `pos.sales.cancel` | CANCEL | ✓ | Annuler une vente |
| `pos.sales.download` | DOWNLOAD | ✓ | Télécharger un reçu |
| `pos.sales.print` | PRINT | ✓ | Imprimer un reçu |
| `pos.sales.export` | EXPORT | ✓ | Exporter les ventes |

**+6** — **236 → 242**

### Total

**64 capacités nouvelles · catalogue 178 → 242.**
Ces chiffres sont une **proposition** ; le total exact est arrêté lot par lot,
après validation de chaque code par la Direction.

## 17.3 Justification des capacités sensibles

| Capacité | Ce qu'elle protège | Pourquoi elle est séparée |
| --- | --- | --- |
| `catalog.services.cost.view` | **Prix d'achat** | Un commercial vend sans avoir à connaître la marge d'ADIKOM |
| `rental.pricing.supplier.view` | **Coût fournisseur** | Idem, côté location. C'est ce qu'ADIKOM paie, pas ce qu'elle facture |
| `pos.sessions.amounts.view` | **Argent d'une session, et son écart** | Un responsable de planning doit savoir **qui** était en caisse sans voir **combien** il y avait dedans. **C'est cette séparation qui donne à `pos.sessions.view` sa raison d'être** |
| `pos.sales.cancel` | **Annulation** | Annuler défait une écriture de trésorerie |
| Toutes les `download` / `print` | **Pièces sortant du système** | Elles portent l'identité d'un tiers et des montants (DEC-042 §c) |

## 17.4 Ce qui n'est **pas** créé, et pourquoi

| Non créé | Raison |
| --- | --- |
| `*.margin.view` (location, service, fournisseur, client) | La marge est une différence entre deux grandeurs déjà gouvernées. Une capacité de plus ne fermerait rien (§10.4) |
| `rental.rentals.summary.*` | Le résumé est le 4ᵉ document du cycle, sous les mêmes capacités que les trois autres (§13.3) |
| `catalog.products.*` | La partie Produits n'existe pas |
| `commerce.*.invoice` | Facturer relève de `billing.customer_invoices.create` / `.issue` |
| `pos.sessions.variance.view` | L'écart est une soustraction entre deux montants qu'`amounts.view` ouvre déjà |
| Deux capacités pour l'encaissement et le décaissement PDV | Le PDV n'encaisse que |
| `catalog.services.download` / `.print` | **Aucun document de service n'est prévu.** À créer *le jour où* la fiche PDF existera |

## 17.5 Groupes système — proposition d'affectation

Les groupes existants (migration 008) devront recevoir les nouvelles capacités.
**Proposition à valider (décision B-12)** :

| Groupe | Capacités proposées |
| --- | --- |
| Direction | Toutes, y compris coûts, marges et montants de caisse |
| Responsable Administration & Finance | Toutes sauf `pos.sales.create` |
| Responsable Commercial & Développement | `catalog.*` sauf `cost.*` · `commerce.sales_*` complet · `pos.sales.view` |
| Responsable Tourisme & Mobilité | `catalog.services.view` · `commerce.sales_quotes.*` · `rental.rentals.swap` |
| Responsable Support & Logistique | `commerce.purchase_*` · `catalog.services.cost.view` |
| Assistant(e) de direction | `pos.*` complet sauf `amounts.view` · `catalog.services.view` |

---

# 18. Sécurité et RLS

## 18.1 Le patron obligatoire, par table nouvelle

```sql
revoke all    on public.<table> from anon;
revoke delete on public.<table> from authenticated;
alter table   public.<table> enable row level security;

create policy <table>_select on public.<table>
  for select to authenticated
  using ((select public.has_permission('<module>.<menu>.view')));

create policy <table>_insert on public.<table>
  for insert to authenticated
  with check ((select public.has_permission('<module>.<menu>.create')));

create policy <table>_update on public.<table>
  for update to authenticated
  using      ( … énumération des capacités d'écriture … )
  with check ( … la même … );

-- Aucune policy DELETE, jamais.
```

> **Point de performance, et il compte.** `has_permission(...)` posé nu dans un
> `using` est évalué **une fois par ligne**. L'envelopper dans un sous-select —
> `(select public.has_permission('…'))` — le ramène à **un seul appel par
> requête**. Sur une liste de ventes PDV ou de lignes de devis, la différence est
> celle entre une page instantanée et une page qui traîne. **À appliquer dès la
> première policy de chaque lot** ; ne pas attendre le constat.

## 18.2 Les cinq couches, appliquées aux nouveaux objets

| Couche | Application |
| --- | --- |
| **1 · Fonction** | Chaque acte (`create_service`, `swap_rental_vehicle`, `open_pos_session`, `record_pos_sale`…) appelle `require_capability` **avant tout travail**, et exige **nommément** les lectures dont il dépend |
| **2 · Donnée** | Prix figés dès l'engagement · lignes figées dès la sortie du brouillon · segment clos immuable · session close terminale · écriture de trésorerie immuable |
| **3 · Transition** | Chaque changement de statut exige la capacité qui le légitime — **y compris par `PATCH` PostgREST direct**, hors de toute fonction |
| **4 · RLS** | Patron ci-dessus |
| **5 · État de départ** | `BEFORE INSERT` : un devis naît `DRAFT`, une session naît `OPEN`, une vente naît `VALIDATED`, un segment naît `ACTIVE` |

## 18.3 Les pièges connus — à traiter préventivement

| Piège | Manifestation | Remède éprouvé dans ce projet |
| --- | --- | --- |
| **`FOR UPDATE` applique la policy d'ÉCRITURE** | Un caissier sans droit d'écrire sur la facture ne peut pas sérialiser une lecture | `pg_advisory_xact_lock(hashtext(id::text)::bigint)` — déjà employé par `record_customer_payment` |
| **`UPDATE` sous RLS lit d'abord les lignes visées** | Sans `select`, l'`UPDATE` ne modifie rien **et ne dit rien** | Exiger la lecture nommément, puis vérifier l'effet (`if not found then raise`) |
| **Une garde qui compte doit compter la vérité** | Un déclencheur qui somme à travers RLS conclut « aucun » et laisse passer | Exiger la capacité de lecture **avant** de faire la somme (patron de `fn_customer_invoice_no_cancel_when_paid`) |
| **`current_actor() is null` en tête d'un déclencheur** | Efface **toutes** les règles de cohérence pour la clé de service | Placer les règles de cohérence **avant** le test d'acteur |
| **`set_config(..., true)` est local à la transaction** | Un contexte qui lève des gardes survit au `return` | Ne jamais s'en servir pour contourner une capacité |
| **`current_date` est UTC ; le jour d'ADIKOM est comorien** | Écart visible entre 21 h et minuit UTC | `(now() at time zone 'Indian/Comoro')::date`, jamais `current_date`, pour toute borne métier — **et notamment pour une session de caisse, qui se clôt le soir** |
| **PostgREST refuse un `DELETE` sans `WHERE`** | La recette SQL passe, l'écran échoue | Aucun `DELETE` n'existe ; ne pas en introduire |
| **Une policy d'écriture doit se lier à l'origine de la ligne** | Un `or` de `has_permission` sans appariement autorise l'acte sur les lignes du domaine voisin | La policy d'insert de `treasury_entries` **apparie** chaque capacité à sa colonne d'origine — le patron à reprendre pour `pos_sale_id` |

## 18.4 Les points de sécurité propres à cette demande

| Donnée | Menace | Protection |
| --- | --- | --- |
| **Prix d'achat des services** | Lisible par `select *` sur `service_variants` | **Table séparée** (§14.4, décision A-8) |
| **Coût fournisseur** | Idem | Table `supplier_vehicle_rates`, policy propre |
| **`unit_cost` sur les lignes de facture et de vente** | Idem | Même arbitrage que §14.4 — à trancher **ensemble** |
| **Marges** | Composition de deux lectures | Le calcul renvoie **NULL** si une composante manque, jamais 0 |
| **Montants de caisse** | Un caissier voit les sessions des autres | `pos.sessions.amounts.view` distincte. *Décision B-13 : un caissier voit-il **ses** montants ?* |
| **Écarts de caisse** | Réécriture après coup | `counted_amount` figé à la clôture ; la session ne se rouvre pas |
| **Annulation de vente** | Défaire un encaissement | `pos.sales.cancel` ; l'écriture est annulée, jamais supprimée ; audit |
| **Encaissement** | Fabriquer une écriture par appel direct | `fn_treasury_entry_source` étendu : une écriture `POS_SALE` **doit** reprendre le compte, le montant `applied` et le sens `IN` de sa vente |

---

# 19. Migrations

## 19.1 Principes

- Numérotation continue à partir de **079** ; nommage
  `AAAAMMJJ0001NN_sujet_en_francais.sql`, comme les 78 existantes.
- **Chaque migration porte un contrôle de non-régression du catalogue** (D10).
- **Une extension d'enum est seule dans sa migration** (§7.3).
- **Une migration de données est distincte** de la migration de schéma qui la
  rend possible : si la seconde échoue, la première reste applicable.
- Toute migration créant une table métier **ajoute cette table à
  `backup_scope()`**, à sa place dans l'ordre parents → enfants.

## 19.2 Migrations par lot

### LOT 19 — Services

| # | Fichier | Contenu |
| --- | --- | --- |
| 079 | `…_catalogue_source_unique_du_total.sql` | *(dette, §2.4)* Retire le total attendu des 33 recettes qui le répètent ; ne le conserve qu'à un seul endroit |
| 080 | `…_types_du_catalogue_de_services.sql` | `service_purpose`, `service_status` |
| 081 | `…_services_et_categories.sql` | `service_categories`, `services`, `service_variants`, (`service_variant_costs` si option A) ; contraintes, index, déclencheurs, audit, RLS |
| 082 | `…_capacites_produits_et_services.sql` | 12 capacités · module `catalog` · **178 → 190** |
| 083 | `…_numerotation_des_services.sql` | Règle `service` → `SRV` |
| 084 | `…_perimetre_de_sauvegarde_du_catalogue.sql` | `backup_scope()` +3 (ou +4) tables |

### LOT 20 — Tarification fournisseur

| # | Fichier | Contenu |
| --- | --- | --- |
| 085 | `…_type_d_unite_de_cout_fournisseur.sql` | `supplier_rate_unit` |
| 086 | `…_tarifs_fournisseurs.sql` | `supplier_vehicle_rates`, exclusion `gist`, cohérence fournisseur ↔ véhicule, audit `PRICE_CHANGE`, RLS |
| 087 | `…_resolveur_de_cout_fournisseur.sql` | `resolve_supplier_rate` |
| 088 | `…_capacites_de_tarification_fournisseur.sql` | 4 capacités · **190 → 194** |
| 089 | `…_perimetre_de_sauvegarde_des_tarifs_fournisseurs.sql` | `backup_scope()` +1 |

### LOT 21 — Segments

| # | Fichier | Contenu |
| --- | --- | --- |
| 090 | `…_type_de_segment_de_location.sql` | `rental_segment_status` |
| 091 | `…_segments_de_location.sql` | `rental_segments` ; `rentals.current_segment_id` ; `vehicle_occupations.rental_segment_id` |
| 092 | `…_un_segment_pour_chaque_location_existante.sql` | **Migration de données** (§11.4) |
| 093 | `…_le_calendrier_suit_le_segment.sql` | Révision de `extend_rental`, `return_rental`, `cancel_rental`, `start_rental`, `convert_reservation_to_rental` |
| 094 | `…_changer_le_vehicule_d_une_location.sql` | `swap_rental_vehicle` |
| 095 | `…_marge_commerciale_d_une_location.sql` | `rental_segment_cost`, `rental_revenue`, `rental_margin` |
| 096 | `…_capacite_de_changement_de_vehicule.sql` | 1 capacité · **194 → 195** |
| 097 | `…_un_etat_des_lieux_par_segment.sql` | *(si décision B-4 = oui)* `rental_inspections.rental_segment_id`, nouvelle unicité |
| 098 | `…_perimetre_de_sauvegarde_des_segments.sql` | `backup_scope()` +1 |

### LOT 22 — Longue durée

| # | Fichier | Contenu |
| --- | --- | --- |
| 099 | `…_type_de_location.sql` | `rental_type` |
| 100 | `…_prolongations_et_periodes_facturables.sql` | `rental_extensions`, `rental_billing_periods`, `rentals.rental_type` |
| 101 | `…_prolonger_une_longue_duree.sql` | `extend_rental` révisée : historise, ouvre une période, retarife si demandé |
| 102 | `…_une_facture_par_periode.sql` | **Remplacement de l'index d'unicité** (§12.2) ; `customer_invoices.billing_period_id` ; `fn_customer_invoice_coherence` révisée ; `issue_customer_invoice` révisée |
| 103 | `…_perimetre_de_sauvegarde_des_longues_durees.sql` | `backup_scope()` +2 |

### LOT 23 — Résumé

| # | Fichier | Contenu |
| --- | --- | --- |
| — | **aucune migration** | Le lot est **entièrement applicatif** : un modèle PDF, une entrée dans le registre documentaire, une lecture composée |

### LOT 24 · LOT 25 — Commerce

| # | Fichier | Contenu |
| --- | --- | --- |
| 104 | `…_types_des_documents_commerciaux.sql` | `commercial_document_status`, `order_status` |
| 105 | `…_devis_et_commandes_clients.sql` | 4 tables, fonctions de somme, RLS, 5 couches |
| 106 | `…_lignes_de_service_sur_la_facture_client.sql` | `customer_invoice_lines` +3/+4 colonnes ; `customer_invoices.sales_order_id` |
| 107 | `…_facturer_une_commande_client.sql` | `create_invoice_from_sales_order` |
| 108 | `…_capacites_commerce_client.sql` | 16 capacités · module `commerce` · **195 → 211** |
| 109 | `…_numerotation_des_documents_commerciaux_clients.sql` | `sales_quote` → DEV-C, `sales_order` → CDE-C |
| 110 | `…_devis_et_commandes_fournisseurs.sql` | 4 tables |
| 111 | `…_lignes_de_service_sur_la_facture_fournisseur.sql` | `supplier_invoice_lines` +4 colonnes + contrainte de cohérence |
| 112 | `…_facturer_une_commande_fournisseur.sql` | `create_invoice_from_purchase_order` |
| 113 | `…_capacites_commerce_fournisseur.sql` | 16 capacités · **211 → 227** |
| 114 | `…_numerotation_des_documents_commerciaux_fournisseurs.sql` | DEV-F, CDE-F |
| 115 | `…_perimetre_de_sauvegarde_du_commerce.sql` | `backup_scope()` +8 |

### LOT 26 · LOT 27 — PDV

| # | Fichier | Contenu |
| --- | --- | --- |
| 116 | `…_modes_de_paiement_mobiles.sql` | **`payment_method` += MVOLA, HOLO, WAKATI** — *seule dans sa migration* |
| 117 | `…_types_du_point_de_vente.sql` | `pos_session_status`, `pos_sale_status` |
| 118 | `…_caisses_et_sessions.sql` | `pos_registers`, `pos_sessions`, une session ouverte par caisse, montants dérivés, RLS |
| 119 | `…_ouvrir_et_cloturer_une_session.sql` | `open_pos_session`, `close_pos_session`, `pos_session_expected`, `pos_session_variance` |
| 120 | `…_capacites_des_caisses_et_sessions.sql` | 9 capacités · module `pos` · **227 → 236** |
| 121 | `…_origine_de_tresorerie_du_point_de_vente.sql` | `treasury_entry_kind += POS_SALE` — *seule dans sa migration* |
| 122 | `…_ventes_au_comptoir.sql` | `pos_sales`, `pos_sale_lines`, `pos_payments`, invariants donné/encaissé, RLS |
| 123 | `…_l_ecriture_d_une_vente_dit_la_verite.sql` | `treasury_entries.pos_sale_id` ; contrainte d'origine unique **étendue à 5** ; `fn_treasury_entry_immutable` et `fn_treasury_entry_source` révisées ; policy d'insert appariée |
| 124 | `…_encaisser_et_annuler_une_vente.sql` | `record_pos_sale`, `cancel_pos_sale` |
| 125 | `…_capacites_des_ventes_au_comptoir.sql` | 6 capacités · **236 → 242** |
| 126 | `…_numerotation_des_ventes_et_sessions.sql` | `pos_sale` → VTE, `pos_session` → SES, `pos_register` → CAI |
| 127 | `…_perimetre_de_sauvegarde_du_point_de_vente.sql` | `backup_scope()` +5 |

**Total : 48 migrations** (079 → 127), dont 3 de données ou de dette et 4
d'extension d'enum isolées.

---

# 20. Données DEMO

`scripts/seed-demo.mjs` (67 Ko) et `scripts/clean-demo.mjs` sont **idempotents et
réversibles**. Chaque objet porte le marqueur `DEMO`. Toute évolution doit
conserver ces deux propriétés, et **passer par les fonctions métier**, jamais par
des `INSERT` qui contourneraient un contrôle.

| Lot | Ce que la démonstration doit montrer |
| --- | --- |
| **19** | 3 catégories · 8 services : 3 `SALE`, 2 `PURCHASE`, 3 `BOTH` · au moins un service à 3 variantes de prix différents · **un service sans prix d'achat**, pour que l'écran montre une marge non calculée plutôt qu'un zéro |
| **20** | Tarif fournisseur sur 2 véhicules `SUPPLIED` — dont l'exemple de la Direction : **40 000 KMF/jour** · **un véhicule `SUPPLIED` sans tarif**, pour montrer le refus explicite |
| **20** | Le tarif client correspondant : **50 000** et **60 000 KMF/jour** → marges de **10 000** et **20 000** |
| **21** | Une location **à 2 segments** : véhicule A à 50 000 pendant 3 jours, panne, véhicule B à 70 000 — l'exemple exact de la Direction · l'incident et la maintenance rattachés |
| **22** | Une longue durée **01/09 → 30/09**, prolongée **01/10 → 31/10** · **2 factures émises**, la première réglée, la seconde partiellement |
| **23** | Une location **clôturée complète** : 2 segments, incident, facture, règlements, écart de carburant — de quoi que le résumé ait tout à montrer |
| **24** | 2 devis clients (1 accepté → commande → facture émise ; 1 refusé) · 1 commande directe sans devis |
| **25** | 1 devis fournisseur → commande → facture fournisseur validée → règlement |
| **26** | **2 caisses** · **3 sessions** : une close sans écart, une close **avec un écart de −2 500 KMF**, une **ouverte** · deux caissiers différents sur la même caisse le même jour, pour éprouver la question « qui était là entre 10h et 11h30 ? » |
| **27** | 6 ventes : montant exact · **montant supérieur avec monnaie rendue** · une par mode (Chèque, Mvola, Holo, Wakati) · **1 vente annulée**, dont l'écriture est annulée |

**Contraintes** :

- **Aucune date en dur.** `dayOffset(n)` sur `Indian/Comoro`, comme partout
  ailleurs — une échéance figée finit par tomber dans le passé.
- `clean-demo.mjs` doit retirer les nouveaux objets **dans l'ordre inverse des
  dépendances**, et le balayage par marqueur doit précéder la conclusion : une
  recette interrompue laisse des résidus invisibles.
- **Ne rien exécuter maintenant.** Cette section décrit ce que les lots devront
  produire.

---

# 21. Tests

## 21.1 Les cinq niveaux du projet, reconduits

| Niveau | Outil | Ce qu'il éprouve |
| --- | --- | --- |
| **Unitaire** | `vitest` — 219 tests aujourd'hui | Calculs purs, schémas `zod`, parité catalogue TS ↔ SQL |
| **Recette SQL** | `supabase/tests/*.sql` via `run-sql.mjs` | Schéma, contraintes, déclencheurs, fonctions. **Rôle de service : RLS contournée, `current_actor()` NULL** — éprouve les règles, pas les capacités. Transaction annulée en fin de script |
| **Recette de capacités** | `scripts/verify-*.mjs` | **Vraies sessions Supabase**, comptes créés pour l'occasion, contrôles positifs **et** négatifs |
| **Recette d'interface** | Playwright dans `verify-*.mjs` | Chemin réel de l'utilisateur |
| **Recette de production** | `verify-production.mjs` | Le déploiement réellement en ligne |

## 21.2 Par lot

### LOT 19

- **Unitaire** : marge d'une variante (les 6 cas du §14.6) ; schémas de saisie ;
  parité catalogue **190**.
- **SQL** (`supabase/tests/services.sql`) : cohérence `purpose` ↔ prix ; variante
  par défaut unique ; unicité insensible à la casse ; refus de suppression ;
  audit `PRICE_CHANGE` ; **le prix d'achat n'est pas lisible sans sa capacité**.
- **Capacités** (`verify-services.mjs`) : 4 comptes — lecteur, lecteur+coût,
  gestionnaire, gestionnaire+prix. **Négatifs** : un lecteur seul ne voit ni coût
  ni marge ; il ne peut ni créer ni modifier un prix ; **un appel PostgREST direct
  sur `service_variant_costs` échoue**.
- **UI** : liste, filtres par catégorie et destination, fiche, onglets ; **états
  vide, chargement, erreur, permission insuffisante**.
- **Responsive** : 390 px, 768 px, 1440 px.
- **Non-régression** : `npm run verify` complet + les 21 recettes SQL.

### LOT 20

- **SQL** : exclusion sur périodes ; tarif refusé sur véhicule `OWNED` ; tarif
  refusé si le fournisseur n'est pas celui du véhicule à la date ;
  `resolve_supplier_rate` renvoie **zéro ligne** sans tarif.
- **Capacités** : sans `rental.pricing.supplier.view`, **aucune ligne** — et
  **jamais un zéro**.
- **Non-régression critique** : `supabase/tests/location.sql` — les six niveaux
  de DEC-002 — **doit passer sans modification**.

### LOT 21 — le lot le plus exposé

- **SQL** (`supabase/tests/rental_segments.sql`) :
  - un seul segment actif par location ;
  - les périodes d'une location ne se chevauchent pas ;
  - le changement échoue si le véhicule B n'est pas disponible ;
  - le changement échoue **sans tarif client applicable** ;
  - le coût reste NULL sans tarif fournisseur, et **la marge n'est pas calculée** ;
  - **la migration de données produit exactement un segment par location
    existante**, avec les mêmes valeurs verrouillées ;
  - `extend_rental` ne touche **que** l'occupation du segment ouvert ;
  - `return_rental` ne libère **que** le segment ouvert ;
  - `cancel_rental` libère **tous** les segments actifs.
- **Capacités** : `rental.rentals.swap` exigée ; `rental.rentals.update` **ne
  suffit pas** ; `checkout` non plus.
- **UI** : panneau « Changer le véhicule », comparaison des tarifs
  (`04_Workflows/03` §36 : *« le système doit clairement afficher la
  différence »*), motif obligatoire, confirmation.
- **Non-régression** : `rental_cycle.sql` + `verify:rentals` + `verify:checkout`
  + `verify:rental-live` + `verify:rental-return` + `verify:rental-documents`
  + `verify:dashboard` + `verify:backup`.

### LOT 22

- **SQL** : une location `FIXED_TERM` refuse une **seconde** facture ; une
  `LONG_TERM` accepte une facture **par période** et **refuse deux fois la même** ;
  une période **non achevée** ne se facture pas ; une facture intermédiaire **ne
  fait pas** passer la location à `INVOICED` ; la dernière **le fait** ;
  `rental_extensions` conserve l'avant/après.
- **Non-régression majeure** : `customer_invoices.sql`, `customer_payments.sql`,
  `verify:customer-invoices`, `verify:customer-payments`, `verify:analytics`,
  `verify:pilotage` — **l'index d'unicité change ; tout ce qui s'y fiait doit
  être rejoué**.

### LOT 23

- **Unitaire** : composition du résumé selon les capacités détenues.
- **UI** : le PDF **commence par `%PDF`** — le contrôle déjà employé par
  `verify:rental-documents`.
- **Capacités** : chaque bloc absent est **nommé** dans le document, jamais tu
  (DEC-017).

### LOT 24 · 25

- **SQL** : totaux et marges ; lignes figées hors brouillon ; transformation
  devis → commande → facture ; **cohérence `amount = quantity × unit_price`** sur
  la ligne fournisseur ; **un devis ne produit pas deux commandes**.
- **Capacités** : `commerce.sales_orders.view` seule ne facture pas ;
  `billing.customer_invoices.create` seule ne lit pas la commande ; la marge est
  **NULL** sans `catalog.services.cost.view`.
- **Non-régression** : `supplier_invoices.sql`, `customer_invoices.sql`,
  `imputations.sql` — les lignes de facture changent de forme.

### LOT 26 · 27 — le programme demandé par la Direction

| Test | Attendu |
| --- | --- |
| **Montant exact** | Encaissé = total, monnaie = 0, écriture = total |
| **Montant supérieur** | Encaissé = total, monnaie = donné − total, **écriture = total** |
| **Montant inférieur** | **Vente refusée**, motif nommé *(selon décision A-10)* |
| **Monnaie sur chèque / Mvola** | **Refusée** par contrainte |
| **Trésorerie** | Le solde du compte augmente **exactement** du total. `financial_account_balance` recalculé |
| **Écriture forgée** | Un `POST` direct sur `treasury_entries` avec un montant ≠ `applied` est **refusé** |
| **Session** | Vente sans session ouverte **refusée** ; deuxième session sur la même caisse **refusée** |
| **Utilisateur** | La vente porte la session, donc le caissier. `audit_log` contient l'auteur |
| **Clôture** | Théorique = fond + espèces encaissées ; écart = compté − théorique ; clôture **possible avec écart** |
| **Historique** | « Qui était en caisse le J entre 10h00 et 11h30 ? » renvoie la bonne session |
| **Annulation** | Vente `CANCELLED`, écriture `CANCELLED`, solde revenu, **rien d'effacé** |
| **Permissions** | `pos.sales.view` **ne permet pas** d'encaisser ; `pos.sessions.view` **n'ouvre pas** les montants ; `pos.sales.create` **ne permet pas** d'annuler |
| **UI** | Raccourcis clavier ; total visible sans défilement ; monnaie recalculée à la frappe ; les 7 états |
| **Responsive** | 390 px : le panier passe dessous, le total reste visible, **le fonctionnement ne change pas** |

## 21.3 Discipline des recettes — les six règles acquises

Elles ont coûté cher au projet ; les redécouvrir coûterait autant.

1. **Ne jamais piper vers `head`** — `SIGPIPE` tue le script avant son nettoyage
   et laisse des résidus dans Supabase Cloud.
2. **Ne jamais attendre `networkidle` ni un `button[type=submit]` générique** —
   attendre le **libellé de l'effet**.
3. **Aucune date en dur** — `dayOffset(n)` sur `Indian/Comoro`.
4. **Le nettoyage balaie par marqueur**, pas seulement les identifiants suivis :
   une recette interrompue laisse des résidus invisibles.
5. **La mise en place ne doit jamais échouer en silence** — un `rpc` de
   construction dont on ignore l'erreur produit des dizaines de faux échecs.
6. **Mesurer une variation, jamais un total absolu** — comparer un indicateur
   global à une valeur figée a déjà fait tomber 26 recettes le jour où la
   démonstration s'est étoffée.

Et : **une lecture abandonnée rend un corps vide**, qui se lit comme une panne
applicative. Nommer les lectures qui n'ont jamais abouti.

---

# 22. Non-régression

## 22.1 Le tableau des risques

| # | Risque | Lot | Gravité | Détection | Prévention |
| --- | --- | :-: | :-: | --- | --- |
| **R1** | **Le total du catalogue est écrit dans 34 fichiers** | tous | **Haute** | `npm run verify` + toutes les recettes | Migration 079 (§2.4) : une seule source |
| **R2** | Parité TS ↔ SQL du catalogue rompue | tous | Haute | `permissions.test.ts` | Modifier les deux dans le même commit |
| **R3** | **Table absente de `backup_scope()`** | tous | **Haute** | `backup.sql`, `verify:backup` | Une migration de périmètre **par lot** |
| **R4** | **`customer_invoices_one_per_rental_idx` remplacé** | 22 | **Critique** | `customer_invoices.sql` | Deux index partiels disjoints (§12.2) + recette de double facturation |
| **R5** | **Occupations de calendrier faussées par les segments** | 21 | **Critique** | `rental_cycle.sql`, `verify:rental-live` | Colonne `rental_segment_id` (§11.4) + révision des 5 fonctions |
| **R6** | **Contrainte d'origine unique des écritures** étendue à 5 | 27 | **Critique** | `treasury.sql`, `verify:treasury` | Réviser **ensemble** la contrainte, les 2 déclencheurs et la policy |
| **R7** | `pricing_rules` touchée par erreur | 20 | Critique | `location.sql` **inchangée** | Table sœur (§9.2) |
| **R8** | Tarifs déjà verrouillés modifiés | 20-22 | Critique | `rental_cycle.sql` | Aucune migration ne réécrit `locked_*` |
| **R9** | Prix d'achat exposé par `select *` | 19, 24 | Haute | Recette d'appel direct | Table séparée (§14.4) |
| **R10** | Une marge affiche **0** au lieu de « non calculable » | 20-24 | Moyenne | Recettes de capacités | Retour **NULL**, jamais 0 |
| **R11** | Enum étendu et consommé dans la même transaction | 27 | Moyenne | La migration échoue | Migration d'enum isolée |
| **R12** | `has_permission` évalué par ligne | tous | Moyenne | Lenteur des listes | `(select has_permission(...))` |
| **R13** | Nouveaux modules absents de la navigation | 19, 24, 26 | Faible | `verify:responsive` | `navigation.ts` + sidebar |
| **R14** | Un `.download` sans document → bouton mort | 23, 24, 27 | Moyenne | `verify:documents` (`%PDF`) | Registre + capacité livrés ensemble |
| **R15** | `seed-demo` cassé par un nouveau contrôle | tous | Moyenne | `npm run demo:seed` | Rejouer seed + clean à chaque lot |
| **R16** | `current_date` UTC sur une clôture de caisse du soir | 26 | Moyenne | Recette autour de 21 h UTC | `now() at time zone 'Indian/Comoro'` |
| **R17** | `rental_inspections` : un seul départ / retour par location | 21 | Moyenne | `rental_cycle.sql` | Décision B-4 tranchée avant la migration 091 |

## 22.2 Le rituel de fin de lot — non négociable

```
1.  npm run lint
2.  npm run typecheck
3.  npm run test                       (unitaires + parité catalogue)
4.  npm run build
5.  les 21 recettes SQL                (+ celles du lot)
6.  npm run demo:clean && npm run demo:seed      (les deux sens)
7.  npm run verify:backup              (sauvegarde → réinitialisation → restauration)
8.  npm run verify:capabilities        (la plus large — 217 contrôles)
9.  les recettes de capacités du lot
10. npm run verify:responsive
11. push → attente READY sur Vercel → comparaison du sha déployé
12. npm run verify:production
```

**L'étape 7 est celle qu'on oublie**, et c'est la plus coûteuse à découvrir plus
tard : une table hors du périmètre de sauvegarde ne se révèle qu'au moment où
quelqu'un restaure — c'est-à-dire au pire moment.

---

# 23. Ordre recommandé des lots

## 23.1 La séquence, et sa justification

| Ordre | Lot | Pourquoi ici | Risque | Charge |
| :-: | --- | --- | :-: | :-: |
| **1** | **19 · Services** | **Additif pur** — aucune table existante touchée. Débloque Commerce **et** PDV. Sert de lot d'étalonnage pour le module `catalog` : si la convention d'un nouveau module a un défaut, on le découvre sur le lot le moins dangereux. Porte aussi la dette du catalogue (079) **avant** que le total ne bouge | Faible | Moyenne |
| **2** | **20 · Coût fournisseur & marge** | **Additif pur.** Répond à DEC-007, ouvert depuis le premier jour du projet. Doit précéder les segments, qui verrouillent le coût dès leur création | Faible | Moyenne |
| **3** | **21 · Segments** | **Le lot le plus risqué du plan.** À placer **tôt**, quand l'équipe est fraîche et que les lots suivants peuvent encore absorber une correction — pas à la fin, où un défaut de calendrier se découvrirait en production | **Élevé** | **Forte** |
| **4** | **22 · Longue durée** | Dépend des segments. Modifie la facturation : à isoler d'un autre lot financier | **Élevé** | Forte |
| **5** | **23 · Résumé de fin** | Dépend de 21 et 22 pour être complet. **Aucune migration** — respiration bienvenue après deux lots lourds, et démonstration visible du travail accompli | Faible | Faible |
| **6** | **24 · Commerce client** | Dépend de 19. Introduit les lignes de service dans la facture client | Moyen | Forte |
| **7** | **25 · Commerce fournisseur** | Symétrique. Peut suivre immédiatement, la forme étant acquise | Moyen | Moyenne |
| **8** | **26 · Caisses & sessions** | Dépend de la trésorerie existante. **Livré avant les ventes** : une vente exige une session, et livrer la vente d'abord obligerait à inventer une session provisoire | Moyen | Moyenne |
| **9** | **27 · Ventes & encaissement** | Dépend de 19 et 26. **Le seul lot qui touche à la trésorerie** : à traiter seul, avec toute l'attention disponible | **Élevé** | Forte |

## 23.2 Pourquoi cet ordre plutôt qu'un autre

**Pourquoi Services d'abord, et non le coût fournisseur ?**
Les deux sont additifs. Services vient d'abord parce qu'il **crée un module** :
c'est là qu'on découvre ce qu'un module nouveau coûte réellement — navigation,
sidebar, registres, périmètre de sauvegarde, groupes système. Le faire sur le
sujet le plus simple évite de le découvrir sur le PDV.

**Pourquoi les segments avant la longue durée ?**
Une prolongation de longue durée peut changer de véhicule **et** de tarif.
L'inverse imposerait de livrer une prolongation qui ignore le véhicule, puis de
la reprendre.

**Pourquoi le PDV en dernier ?**
C'est le seul module qui **fait entrer de l'argent par un chemin nouveau**. Il
touche la contrainte d'origine unique des écritures, les deux déclencheurs qui la
gardent, et la policy d'insertion — trois objets dont dépendent déjà quatre
origines en production. Le faire en dernier, c'est le faire quand tout le reste
est stable.

**Pourquoi Commerce avant PDV ?**
**Uniquement** à cause de la décision A-11. Si la Direction décide qu'une vente
PDV produit une facture client, le PDV a besoin des lignes de service livrées par
le LOT 24. **Si elle décide que la vente PDV produit un simple reçu — ce que le
plan recommande —, les lots 26 et 27 peuvent être avancés avant 24 et 25**, ce
qui donnerait de la valeur quotidienne plus tôt.

## 23.3 Deux fils en parallèle, si la Direction le souhaite

```
Fil A — LOCATION        19 (partie tarif) → 20 → 21 → 22 → 23
Fil B — COMMERCE / PDV  19 (partie catalogue) → 24 → 25 → 26 → 27
```

Point de croisement unique : `customer_invoice_lines`, touchée par le LOT 22
(colonne `billing_period_id` sur l'en-tête) et par le LOT 24 (colonnes de
service sur les lignes). Ces deux migrations doivent être **ordonnées entre
elles**, jamais concurrentes. Tout le reste est disjoint.

---

# 24. Décisions métier à valider

## 24.1 Catégorie A — indispensables avant développement

| # | Décision | Lot bloqué | Recommandation |
| :-: | --- | :-: | --- |
| **A-1** | **Qu'est-ce qu'un tarif fournisseur ?** Coût journalier de mise à disposition · loyer mensuel · forfait par location · autre. *(Rouvre DEC-007)* | **20** | **Coût journalier `DAY` + forfait `FLAT`**, comme le tarif client. `MONTH` n'est ajouté que si ADIKOM loue réellement au mois |
| **A-2** | **Coût de référence de la marge** : verrouillé à l'engagement, ou réellement facturé ? | **20** | **Verrouillé**, avec l'écart fournisseur affiché à côté (§10.2) |
| **A-3** | **Véhicule ADIKOM (`OWNED`)** : quelle marge ? Coût nul, ou marge non calculée ? | **20** | **Non calculée**, avec la mention explicite. Un coût de 0 ferait passer la marge pour 100 % du prix |
| **A-4** | **Changement de véhicule en cours de location** : autorisé, sous quelle condition, et le client valide-t-il le nouveau tarif ? *(La documentation ne couvre que l'avant-départ)* | **21** | Autorisé sur `IN_PROGRESS`/`EXTENDED`, **motif obligatoire**, tarif du nouveau véhicule **résolu et verrouillé**, différence **affichée avant validation** (§36) |
| **A-5** | **Le client accepte-t-il un tarif plus élevé** lors d'un remplacement subi (panne d'ADIKOM) ? Ou ADIKOM absorbe-t-elle l'écart ? | **21** | **Question purement commerciale.** Techniquement : la fonction verrouille le tarif du véhicule B ; si ADIKOM absorbe, l'utilisateur saisit une **ligne de réduction** sur la facture — identifiable (Workflow 07 §24), jamais un prix modifié en silence |
| **A-6** | **Facturation d'une longue durée** : à quel rythme ? Mensuel · à chaque prolongation · à la demande ? Et **peut-on facturer d'avance** ? | **22** | **À la demande, sur une période achevée.** Aucun ordonnanceur n'existe. Pas de facturation d'avance sans règle d'acompte |
| **A-7** | **Le tarif peut-il changer à une prolongation ?** | **22** | **Oui, explicitement**, jamais automatiquement. Sinon le tarif initial court |
| **A-8** | **Le prix d'achat sort-il de `service_variants`** vers une table séparée ? *(Même question pour `unit_cost` sur les lignes)* | **19** | **Oui** — c'est le seul choix qui protège réellement (§14.4), et c'est le précédent de `maintenance_costs` |
| **A-9** | **Modes de paiement** : ajouter Mvola, Holo, Wakati à l'énumération **partagée** avec les règlements clients et fournisseurs ? | **27** | **Oui.** ADIKOM les reçoit aussi hors du comptoir |
| **A-10** | **Montant donné < total au PDV** : bloquer, ou paiement partiel ? | **27** | **Bloquer.** Un paiement partiel crée une créance sans facture, que rien ne sait suivre. Le circuit facture existe pour cela |
| **A-11** | **Une vente PDV produit-elle une facture client ?** Reçu seul · facture systématique · facture sur demande | **27** *(et l'ordre des lots)* | **Reçu seul.** Une vente comptant n'est pas une créance. La facture sur demande reste possible plus tard, une fois la règle du CA arrêtée |
| **A-12** | **Le client est-il obligatoire au PDV ?** | **27** | **Facultatif.** Un client générique fausserait les statistiques ; l'obligation ralentirait la caisse |
| **A-13** | **Un devis / une commande peut-il porter une ligne libre**, sans service au catalogue ? | **24** | **Oui**, `service_id` nullable — mais alors **aucun coût, donc aucune marge** sur cette ligne, et l'écran le dit |
| **A-14** | **Nomenclature des capacités** — le §17.2 est-il validé ? Les codes ne se modifient plus une fois attribués | **19** | Valider **avant** la migration 082 |

## 24.2 Catégorie B — recommandées, arbitrables pendant le lot

| # | Décision | Recommandation |
| :-: | --- | --- |
| **B-1** | Marge journalière : affichée, alors que l'arrondi de durée n'est pas arrêté (DEC-008) ? | **Non**, tant que DEC-008 est ouverte |
| **B-2** | Marge par période (mois, trimestre) : dans le tableau de bord ? | Plus tard — le tableau de bord a sa propre doctrine d'agrégation |
| **B-3** | Les lignes `SERVICE` et `FEE` d'une facture de location entrent-elles dans la marge commerciale ? | **Non** — elles ont leur propre marge |
| **B-4** | Un état des lieux **par segment** ? | **Oui.** Sinon la restitution du véhicule A n'est constatée nulle part |
| **B-5** | Onglet « Achat » d'un service : fournisseur habituel, référence, délai ? | Oui, purement informatif, sans automatisme |
| **B-6** | Une commande fournisseur exige-t-elle une **réception** documentée ? | **Non** — un statut `DELIVERED` suffit. La Direction refuse les étapes inutiles |
| **B-7** | Un devis expiré change-t-il de statut tout seul ? | **Non** — aucun ordonnanceur. **Dérivé** de `valid_until`, comme `OVERDUE` (D2) |
| **B-8** | Un utilisateur peut-il ouvrir **deux sessions** sur deux caisses ? | **Non.** Un caissier est à une caisse. Contrainte simple, traçabilité claire |
| **B-9** | **Seuil d'écart de caisse** : existe-t-il, et que déclenche-t-il ? | Aucun seuil. Le système **constate** et journalise |
| **B-10** | Annuler une vente d'une **session close** ? | **Oui**, avec avertissement explicite que l'écart de la session s'en trouve modifié |
| **B-11** | **Remboursement** au PDV ? | Hors périmètre. Une vente erronée s'annule |
| **B-12** | Affectation des nouvelles capacités aux **groupes système** (§17.5) | À valider par la Direction |
| **B-13** | Un caissier voit-il **ses propres** montants de session ? | **Oui** — il compte sa caisse. Mais pas ceux des autres : cela suppose une policy **par ligne**, à écrire explicitement |
| **B-14** | Quantité **décimale** sur une ligne de service (2,5 heures) ? | **Non** pour l'instant : `quantity` reste entier, comme sur les factures. Un décimal appellerait une règle d'arrondi monétaire |

## 24.3 Catégorie C — décisions techniques prises dans ce plan

| # | Décision | Justification |
| :-: | --- | --- |
| C-1 | Table sœur `supplier_vehicle_rates` plutôt qu'extension de `pricing_rules` | §9.2 |
| C-2 | Colonne `rental_segment_id` sur `vehicle_occupations` plutôt qu'une valeur d'enum | §11.4 |
| C-3 | Tables explicites par document commercial (8 tables) plutôt qu'un modèle polymorphe | DEC-006 · §15.2 |
| C-4 | `pos_registers.account_id` obligatoirement un compte `CASH` | §16.1 — c'est **la** garantie d'une trésorerie unique |
| C-5 | Aucun total stocké nulle part | D1 |
| C-6 | Extensions d'enum en migrations isolées | §7.3 |
| C-7 | **Une seule source pour le total attendu du catalogue** (migration 079) | §2.4 — 34 fichiers × 6 lots = plus de 200 éditions évitées |
| C-8 | Aucune capacité de marge | §10.4 |
| C-9 | Le résumé de fin réutilise les capacités documentaires de la location | §13.3 |
| C-10 | Tout service reçoit une variante « Standard » par défaut | §14.3 — supprime le cas particulier « service sans variante » dans quatre modules |
| C-11 | Reçu PDV au format A4, pas ticket 80 mm | §16.8 — la Direction exclut la caisse tactile |
| C-12 | `has_permission` enveloppé dans un sous-select dans toute policy | §18.1 |

---

# 25. Risques

## 25.1 Risques métier

| Risque | Probabilité | Impact | Atténuation |
| --- | :-: | :-: | --- |
| **Les décisions A ne sont pas rendues à temps** | Élevée | **Bloquant** | Ce document les isole et les motive. Les LOT 19 et 20 peuvent démarrer avec A-1, A-2, A-3, A-8 et A-14 seulement |
| **Une marge est prise pour une rentabilité** | Élevée | Élevé | Chaque écran **nomme** sa marge et **énumère** ce qu'elle ne couvre pas — doctrine déjà appliquée, déjà éprouvée |
| **La facturation de la longue durée se révèle plus complexe qu'attendu** | Moyenne | Élevé | Une facture par période, à la demande, sur période achevée : le modèle le plus simple qui réponde au besoin |
| **Le PDV réclame un tiroir-caisse, un scanner, une imprimante ticket** | Moyenne | Moyen | Hors périmètre, à signaler dès le LOT 26 |
| **Les Produits sont demandés en cours de route** | Moyenne | Élevé | §14.7 dit ce que cela suppose : entrepôts, stocks, mouvements, valorisation. C'est un plan à part entière |

## 25.2 Risques techniques

| Risque | Probabilité | Impact | Atténuation |
| --- | :-: | :-: | --- |
| **La migration de données des segments abîme des locations réelles** | Moyenne | **Critique** | Sauvegarde avant application · migration de schéma et de données séparées · recette qui compte 1 segment par location · réversibilité documentée |
| **Le remplacement de l'index d'unicité des factures ouvre la double facturation** | Moyenne | **Critique** | Deux index partiels **disjoints** · recette de double facturation dans les deux régimes |
| **La 5ᵉ origine d'écriture casse les quatre autres** | Faible | **Critique** | Contrainte, déclencheurs et policy révisés **ensemble** · `treasury.sql` et `transfers.sql` rejoués |
| **Le catalogue diverge entre TS, SQL et 34 recettes** | **Élevée** | Élevé | Migration 079 en tête du LOT 19 |
| **Une table oubliée dans `backup_scope()`** | **Élevée** | Élevé | Une migration de périmètre **par lot** · `verify:backup` à chaque fin de lot |
| **Lenteur des listes (has_permission par ligne)** | Moyenne | Moyen | Sous-select systématique |
| **`current_date` UTC sur une clôture de caisse du soir** | Moyenne | Moyen | `now() at time zone 'Indian/Comoro'` partout |
| **Le PDF du résumé devient lourd** (photos d'état des lieux) | Moyenne | Faible | Vignettes redimensionnées, ou photos en annexe optionnelle |

## 25.3 Risques de projet

| Risque | Atténuation |
| --- | --- |
| **48 migrations, 3 modules, 19 tables, 64 capacités : le périmètre est considérable** | Le découpage en 9 lots permet de s'arrêter après n'importe lequel avec un produit cohérent |
| **Deux fils en parallèle divergent** | Un seul point de croisement (§23.3), explicitement ordonné |
| **La documentation fonctionnelle est écrite après le code** | §5.2 : elle fait partie du lot, **avant** le premier `create table`. `CLAUDE.md` §2 en fait une règle |
| **`CLAUDE.md` contredit le produit** (9 modules vs 12) | Mise à jour au LOT 19, §5.1 |

---

# 26. Critères d'acceptation

## 26.1 Communs à tous les lots

- [ ] `lint`, `typecheck`, `test`, `build` — tous verts
- [ ] Les 21 recettes SQL existantes passent **sans modification**, sauf celles que le lot fait évoluer explicitement
- [ ] `verify:capabilities` passe
- [ ] `demo:seed` puis `demo:clean` passent **dans les deux sens**, sans résidu
- [ ] `verify:backup` passe — **la sauvegarde couvre les nouvelles tables**
- [ ] `verify:responsive` passe à 390, 768 et 1440 px
- [ ] Contrôles **positifs et négatifs** pour **chaque** capacité nouvelle
- [ ] Aucune fonction `SECURITY DEFINER` ajoutée sans justification écrite
- [ ] `revoke` / `grant` sur **chaque** fonction créée
- [ ] Aucun secret dans le code, la documentation ou les commits
- [ ] La documentation fonctionnelle du périmètre existe **avant** le code
- [ ] La décision correspondante est consignée au journal (DEC-043 et suivantes)
- [ ] `verify:production` passe après déploiement

## 26.2 Par lot

**LOT 19** — Un service se crée, se catégorise, reçoit des variantes et des prix.
Un lecteur sans `cost.view` ne voit **ni** le prix d'achat **ni** la marge, et
l'écran **le dit**. Un appel PostgREST direct sur les coûts **échoue**.
Un service `SALE` refuse un prix d'achat.

**LOT 20** — Un tarif fournisseur se crée sur un véhicule `SUPPLIED`, se date, se
désactive. Deux tarifs actifs ne se chevauchent pas. `resolve_supplier_rate`
renvoie **zéro ligne** sans tarif. **`supabase/tests/location.sql` passe sans
modification.**

**LOT 21** — L'exemple de la Direction se joue de bout en bout : véhicule A à
50 000 pendant 3 jours, panne, véhicule B à 70 000. Les deux périodes, les deux
tarifs et les deux coûts sont conservés. Le calendrier est exact pour les deux
véhicules. **Chaque location existante porte exactement un segment.**

**LOT 22** — Un contrat 01/09 → 30/09 se prolonge au 31/10. **Deux factures**
sont émises, une par période. Une troisième sur la même période est **refusée**.
Une location à durée fixée refuse toujours une seconde facture.

**LOT 23** — Le résumé se consulte, se télécharge, s'imprime. Il commence par
`%PDF`. Il présente les deux véhicules, les deux tarifs, les factures, les
règlements, le solde, les incidents et les deux états des lieux. **Chaque bloc
absent est nommé**, jamais tu.

**LOT 24** — Un devis se crée, s'envoie, s'accepte, devient commande, puis
facture — **sans qu'aucune fonction de facturation ne soit réécrite**. La marge
est **NULL** sans `cost.view`.

**LOT 25** — Symétrique. `amount = quantity × unit_price` est **garanti par la
base**.

**LOT 26** — Une session s'ouvre, se clôt avec un montant compté. L'écart
s'affiche sans bloquer. **« Qui était en caisse le J entre 10h00 et 11h30 ? »
trouve sa réponse.** `pos.sessions.view` **n'ouvre pas** les montants.

**LOT 27** — **Le test de référence de la Direction** : net à payer 60 000,
donné 100 000 → **encaissé 60 000**, **monnaie 40 000**, et **la trésorerie
enregistre 60 000, jamais 100 000**. Une écriture forgée par appel direct est
refusée. Une vente sans session ouverte est refusée. Une vente annulée annule son
écriture, et le solde revient de lui-même.

---

# 27. Proposition de roadmap

## 27.1 Séquence, jalons et livrables

| Phase | Lots | Jalon | Livrable |
| --- | --- | --- | --- |
| **Préalable** | — | **Décisions A rendues** · documentation fonctionnelle des modules 10-12 · `CLAUDE.md` §10 mis à jour · DEC-043 consignée | Le développement peut commencer |
| **Phase A — Fondations** | 19, 20 | Catalogue de services opérationnel · coût fournisseur connu | Deux lots **additifs purs**, aucun risque sur l'existant |
| **Phase B — Cœur location** | 21, 22, 23 | Changement de véhicule · longue durée · résumé | **La phase la plus risquée.** Sauvegarde avant chaque déploiement |
| **Phase C — Commerce** | 24, 25 | Devis et commandes, des deux côtés | Facturation étendue, **jamais dupliquée** |
| **Phase D — Point de vente** | 26, 27 | Caisse opérationnelle | Trésorerie unique, traçabilité du caissier |

## 27.2 Points de contrôle avec la Direction

| Après | Ce qui est démontré |
| --- | --- |
| **LOT 20** | La marge d'une location apparaît. **C'est le premier bénéfice visible du plan** — et le moment de vérifier que la définition retenue est la bonne, avant qu'elle n'irrigue tout le reste |
| **LOT 23** | Le cycle de location complet, avec changement de véhicule, longue durée et résumé imprimable |
| **LOT 25** | Le cycle commercial complet, des deux côtés |
| **LOT 27** | La caisse en fonctionnement réel |

## 27.3 Ce qui peut être livré indépendamment

Chacun des neuf lots laisse le SaaS **cohérent et déployable**. Le plan peut donc
s'arrêter après n'importe lequel :

- après le **LOT 20** : ADIKOM connaît ses marges de location ;
- après le **LOT 23** : le métier de la location est complet ;
- après le **LOT 25** : ADIKOM vend et achète des services ;
- après le **LOT 27** : la caisse fonctionne.

## 27.4 Après ce plan — ce qui restera ouvert

| Sujet | Pourquoi il reste ouvert |
| --- | --- |
| **Partie Produits** (stocks, entrepôts, valorisation) | Écartée par la Direction. Chantier au moins équivalent aux cinq axes |
| **DEC-008** — arrondi de durée, barèmes carburant / km / dommages | Toujours non arrêtés. Ils limitent la précision de la marge journalière |
| **DEC-014** — régime de taxes | Aucune ligne ne porte de TVA |
| **DEC-023 §4** — convention définitive des références | À valider par le responsable comptable avant la première émission réelle |
| **DEC-031 §b** — trop-perçu client | Toujours refusé, avec son motif |
| **Rentabilité complète d'un véhicule** | Suppose d'enregistrer amortissement, assurance, carburant et clé de répartition **par véhicule** |
| **Remboursement PDV, avoir client, contrepassation** | Aucune règle ADIKOM |
| **`TRUNCATE` sur les tables de gouvernance** | Dette signalée au Rapport 09 §26 |

---

# 28. Conclusion

## 28.1 Ce que ce plan établit

Les cinq axes demandés par la Direction sont **réalisables sans rien casser**, à
trois conditions :

1. **Les tarifs fournisseurs ne touchent pas `pricing_rules`.** Une table sœur,
   un résolveur propre, deux vocabulaires impossibles à confondre. La
   tarification client livrée reste strictement intacte.
2. **Le changement de véhicule passe par des segments datés**, pas par une
   colonne réécrite. C'est la même leçon que le calendrier de disponibilité et
   que l'historique fournisseur d'un véhicule : quand une relation change dans le
   temps, elle devient une ligne, jamais une valeur qu'on écrase.
3. **Commerce et PDV n'ont ni facturation ni trésorerie à eux.** Ils *produisent*
   des factures et des écritures par les fonctions qui existent, avec leurs cinq
   couches de contrôle déjà éprouvées.

## 28.2 Ce que le plan ne tranche pas

**Quatorze décisions appartiennent à la Direction** (§24.1), et quatre commandent
l'architecture : la nature d'un tarif fournisseur, le coût de référence de la
marge, le rythme de facturation d'une longue durée, et ce qu'une vente PDV
produit.

Chacune est accompagnée d'une **recommandation motivée**. Aucune n'est laissée
sans proposition — mais aucune n'est décidée à la place de la Direction. C'est la
règle du projet depuis le premier jour, et elle lui a évité, à plusieurs
reprises, une donnée fausse qu'on aurait découverte six mois plus tard.

## 28.3 Le premier lot peut commencer

Le **LOT 19** ne dépend que de trois réponses : **A-8** (le prix d'achat sort-il
de la table des variantes ?), **A-14** (la nomenclature des capacités est-elle
validée ?) et l'accord sur la création du module `catalog`.

Il ne modifie **aucune table existante**. Il n'ajoute **aucun risque** sur les
données de production. Et il débloque, seul, les quatre lots des modules Commerce
et PDV.

## 28.4 La discipline à conserver

Le SaaS livré doit sa solidité à des règles qui n'ont jamais été relâchées :
aucun montant stocké deux fois, aucun statut écrit quand il peut être calculé,
aucune règle métier inventée en silence, aucune capacité déduite d'une autre,
aucun acte financier qui ne soit vérifié dans les cinq couches.

**Ces règles ne se négocient pas lot par lot.** Chaque exception créerait un
endroit où la vérité peut diverger — et l'expérience du projet montre que ces
endroits se découvrent toujours plus tard qu'on ne voudrait, et toujours au pire
moment.

---

*Document de planification — aucun code, aucune migration, aucune permission,
aucune donnée n'a été modifié.*

**ADIKOM PILOT** · SaaS interne de gestion et de pilotage
**ADIKOM Technology & Travel**

> Lire d'abord.
> Comprendre ensuite.
> Décider avec la Direction.
> Puis construire proprement.
