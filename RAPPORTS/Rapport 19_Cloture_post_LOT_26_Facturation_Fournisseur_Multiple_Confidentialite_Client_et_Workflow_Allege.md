# Rapport 19 — Clôture post-LOT 26

**Facturation fournisseur multiple · Confidentialité du commerce client · Workflow allégé**

| | |
| --- | --- |
| Date | 29 septembre 2026 |
| Décision | **DEC-053** |
| Nature | Une boucle de clôture, volontairement **courte et ciblée**. Pas un lot |
| Point de départ | `da3a47b` · 104 migrations · 229 capacités · 62 tables sauvegardées |

---

# 1. Ce que la Direction a tranché

La question laissée ouverte par DEC-052 et le **Rapport 18 §12** a reçu sa
réponse :

> **UNE COMMANDE FOURNISSEUR PEUT ÊTRE RATTACHÉE À PLUSIEURS FACTURES
> FOURNISSEURS.**

```
Commande fournisseur            1 000 000 KMF
  ├─ facture 1 — acompte          300 000 KMF
  └─ facture 2 — solde            700 000 KMF
```

La règle appliquée au LOT 26 — « une commande, au plus une facture non
annulée » — **n'était pas une décision métier**. Le Rapport 18 l'avait écrit
noir sur blanc : elle était déduite de cinq faits d'architecture, et la question
avait été **posée plutôt que tranchée**, avec deux options et aucune choisie.
C'est cette question qui se referme ici.

**DEC-053** est consignée au Journal des décisions. Le numéro a été **vérifié
libre dans tout le dépôt** avant attribution : DEC-052 était le dernier utilisé,
partout.

---

# 2. Architecture retenue — une contrainte retirée, pas une structure ajoutée

Le lien **existait déjà** : `supplier_invoices.purchase_order_id`. Seule son
**unicité** était contrainte.

| | |
| --- | --- |
| Index unique partiel `supplier_invoices_one_per_purchase_order_idx` | **Supprimé** |
| Index de lecture `supplier_invoices_purchase_order_idx` | Conservé |
| Déclencheur de cohérence facture ↔ commande ↔ fournisseur | **Conservé** |
| 🟥 Table de tranches, façon `rental_billing_periods` | **Non créée** |
| 🟥 Valeur ajoutée à `order_status` | **Aucune** |
| 🟥 Capacité nouvelle | **Aucune** — catalogue inchangé à **229** |
| 🟥 Table, colonne, `backup_scope`, `backup_columns` | **Aucun changement** — **62** tables |

**Pourquoi aucun objet « tranche de commande ».** La décision est « plusieurs
factures peuvent appartenir à une commande ». Elle n'impose pas à elle seule un
objet intermédiaire : chaque facture porte déjà ses lignes, son montant, son
échéance et son cycle. Un tel objet devra naître le jour où une contrainte
réelle l'exigera — un échéancier contractuel opposable, par exemple — et **pas
avant**.

**Ce qui garde, maintenant.** Ce n'était pas le nombre de factures : c'est le
**déclencheur de cohérence**, qui exige que la facture et sa commande partagent
le fournisseur et que la commande soit dans un état facturable. Il n'a pas été
touché, et la recette l'éprouve désormais directement (§6).

---

# 3. Le comportement multi-factures

```
COMMANDE ─▶ une ou plusieurs FACTURES ─▶ un ou plusieurs RÈGLEMENTS ─▶ TRÉSORERIE
```

🟥 **Facturation partielle ≠ paiement partiel.** La trésorerie ne bouge **qu'au
règlement**, par la chaîne du LOT 6, inchangée. **Aucun système de paiement
parallèle n'a été créé.**

🟥 **Aucune règle « total factures = montant commande ».** Le Rapport 18 §10.2
avait établi qu'une facture fournisseur est un **document REÇU** : elle constate
ce que le fournisseur **réclame**. La migration **vérifie explicitement**
qu'aucune contrainte ne lie le montant d'une facture au total de sa commande, et
**le contenu d'une facture reçue n'est jamais modifié** pour la faire
correspondre.

Chaque facture reste une facture fournisseur **ordinaire** : `FAC-F`, référence
externe du fournisseur, cycle, règlements et audit existants. **Aucune facture
« acompte », aucune série `FAC-A`, aucun moteur documentaire parallèle.**

---

# 4. L'état dérivé — et pourquoi `INVOICED` survit

`INVOICED` **reste écrit**, sans valeur ajoutée à l'énumération, mais son
libellé change :

| | Avant | Après |
| --- | --- | --- |
| Libellé | « Facturée » | **« En facturation »** |
| Sens | la facture est enregistrée | **au moins une facture existe ; d'autres peuvent suivre** |

**Pourquoi ne pas l'avoir dérivé entièrement.** `INVOICED` **porte une garde** :
une commande `INVOICED` ne s'annule pas. Faire reposer cette protection sur un
comptage de factures lu **à travers RLS** l'exposerait à conclure « aucune
facture » et à laisser passer. Un marqueur porté par la commande elle-même,
lisible avec `commerce.purchase_orders.view`, est une garde plus sûre qu'une
somme.

La **situation de facturation** est, elle, **entièrement dérivée** — persistée
nulle part, donc incapable de se désynchroniser :

| Situation | Dérivée de |
| --- | --- |
| Non facturée | aucune facture active |
| Partiellement facturée | cumul des factures actives **<** total de la commande |
| Facturée | cumul **≥** total de la commande |
| **Non lisible** | un montant nécessaire n'est pas lisible avec les droits du lecteur |

Le dernier cas n'est pas un état métier : c'est le **refus de conclure**
(DEC-017). Affirmer « non facturée » sur un total qu'on n'a pas pu lire serait
énoncer un fait faux à partir d'une absence de droit. `purchaseInvoicedTotal`
rend `null` dès qu'une facture active porte un montant illisible — mais **ignore**
le montant illisible d'une facture **annulée**, qui ne compte pour rien.

---

# 5. L'annulation

```
commande 1 000 000 — acompte 300 000 + solde 700 000  → facturée
   annulation du solde                                 → partiellement facturée
   annulation de l'acompte aussi                       → non facturée, « passée »
```

`cancel_supplier_invoice` ne rend la commande à « passée » **que s'il ne reste
aucune facture active**. Une facture annulée **ne contribue à aucun montant**, et
**aucune facture historique n'est supprimée** (doctrine D6).

Le sens de l'erreur du comptage a été choisi et documenté dans la migration : la
fonction **exige** `billing.supplier_invoices.view` dès sa première ligne — celui
qui annule une facture lit les factures, par construction — et la branche
prudente, celle qui ne touche à rien, est celle qui s'exécute quand quelque chose
est vu. La commande reste alors `INVOICED`, donc **protégée**.

---

# 6. 🟥 La dette du Rapport 18 §13.2 est soldée

Le LOT 26 avait trouvé, côté **fournisseur**, qu'une fonction écrivait la
référence d'un document du menu B dans le `status_reason` d'un document du
menu A. La migration 104 l'avait corrigé et en avait tiré une doctrine. Le même
écart subsistait **côté client** : le LOT 26 avait interdiction d'y toucher, et
l'avait donc inscrit en dette.

> **Un texte écrit PAR LE SYSTÈME sur un document du menu A ne porte pas la
> RÉFÉRENCE d'un document du menu B. Le fait se dit ; la référence se demande à
> la capacité qui la garde.**

**Cinq écritures**, dans quatre fonctions :

| Fonction | Écrivait sur | Portait | Porte désormais |
| --- | --- | --- | --- |
| `convert_sales_quote_to_order` | `sales_quotes` | `'Commande ' \|\| v_no` | **Convertie en commande** |
| `set_sales_order_status` | `sales_quotes` | `'Commande ' \|\| o.order_no \|\| ' annulée'` | **Commande annulée** |
| `cancel_customer_invoice` | `rentals` | `'Facture ' \|\| f.invoice_no \|\| ' annulée'` | **Facture annulée** |
| `cancel_customer_invoice` | `sales_orders` | *idem* | **Facture annulée** |
| `create_invoice_from_sales_order` | `customer_invoices.notes` | `'Commande ' \|\| o.order_no` | **Facture issue d'une commande client** |

Le **lien structurel** — `sales_orders.sales_quote_id`,
`customer_invoices.sales_order_id`, `customer_invoices.rental_id` — demeure
intact, et la migration le vérifie. L'utilisateur autorisé retrouve la référence
par lui, sous la capacité qui la garde. **Rien n'est perdu ; seule la fuite est
fermée.**

**Chaque fonction a été reprise de sa DERNIÈRE VERSION ACTIVE** — non d'une
version d'archive. La migration lit la définition vivante et n'y remplace que la
chaîne fautive, ce qui garantit qu'aucun autre comportement ne bouge. Elle
**refuse de s'appliquer** si la chaîne attendue n'est pas trouvée, plutôt que de
corriger en aveugle.

**Les contrôles cherchent la CONCATÉNATION, jamais le mot** : « Convertie en
commande » est un littéral parfaitement légitime, et c'est même celui qu'on
attend. Un contrôle qui chercherait « commande » accuserait la correction
elle-même.

## 6.1 Portée respectée

🟥 **DEC-051 n'est pas implémentée. Aucune remise n'est modifiée. Le modèle des
devis clients, les commandes clients et leur numérotation sont intacts.** La
migration vérifie que l'index d'unicité du commerce CLIENT — que DEC-053 ne
concerne pas — est toujours en place.

---

# 7. Fichiers et migrations

| Migration | Contenu |
| :-: | --- |
| **105** | `…_plusieurs_factures_pour_une_commande_fournisseur.sql` — index retiré, 3 fonctions assouplies, 12 contrôles |
| **106** | `…_un_motif_ne_franchit_pas_la_frontiere_d_un_menu_cote_client.sql` — 4 fonctions, 5 écritures, contrôles de concaténation |

| Code | Changement |
| --- | --- |
| `src/features/purchasing/constants.ts` | Libellé `INVOICED`, `purchaseOrderIsInvoiceable` accepte `INVOICED`, **`purchaseInvoicingState`** et **`purchaseInvoicedTotal`** — dérivation pure |
| `…/commandes-fournisseurs/[id]/page.tsx` | Cumul sur les factures **actives**, badge de situation, écart au pluriel |
| `constants.test.ts` · `purchasing.sql` · `commerce.sql` · `verify-purchasing.mjs` · `verify-commerce.mjs` | Recettes retournées — voir §8 |

| Documentation | Changement |
| --- | --- |
| `08_Decisions/01_Journal_des_Decisions.md` | **DEC-053**, entrée complète §a–§h |
| `03_Modules/11_Commerce.md` | §22.3 marquée remplacée, **§22.3 bis** (règle en vigueur), doctrine du motif |
| `RAPPORTS/Rapport 18` | Renvois en §12 et §18 — **le corps n'est pas réécrit** |
| `CLAUDE.md` | **§47 bis — workflow allégé** · §10 complété |

---

# 8. 🟥 Les recettes ont été RETOURNÉES, jamais supprimées

Trois d'entre elles affirmaient l'ancienne règle. La Direction l'a changée : les
tests devaient donc changer d'affirmation, **pas disparaître**.

| Recette | Avant | Après |
| --- | --- | --- |
| `purchasing.sql` §19 | « une commande ne porte pas deux factures » | **l'acompte, le solde et le complément sur la MÊME commande**, et les gardes qui subsistent |
| `purchasing.sql` §21 | annuler la facture rend la commande à « passée » | **annuler une facture sur trois ne change rien** ; la **dernière** la fait redescendre |
| `purchasing.sql` §26 | l'index d'unicité doit survivre | son **absence est exigée** |
| `verify-purchasing.mjs` | la seconde facture est refusée | **elle réussit**, les deux sont rattachées et vivantes |
| `verify-commerce.mjs` | — | **nouveau contrôle négatif de confidentialité** |
| `commerce.sql` | — | **§28 — la concaténation, jamais le mot** |

**§26 mérite une note.** Retirer l'index de la liste des acquis sans rien mettre
à la place aurait rendu la recette **muette** sur un retour en arrière
silencieux. Une règle abandonnée se surveille **dans l'autre sens** : la recette
exige désormais que l'index ne revienne pas.

## 8.1 Deux défauts trouvés en chemin

| # | Défaut | Nature |
| :-: | --- | --- |
| 1 | 🟥 **Un contrôle de recette devenu faux** | `verify-purchasing.mjs` affirmait « l'index partiel fait autorité » pour un appel direct. L'index retiré, l'insertion **réussissait** — le contrôle passait dans le mauvais sens, laissait une **troisième facture vivante**, et faisait échouer **quatre contrôles en cascade**. Il éprouve maintenant ce qui garde réellement : le déclencheur de cohérence, par une facture rattachée à la commande d'un **autre fournisseur** |
| 2 | 🟥 **Un contrôle vide** | Le contrôle de confidentialité client, d'abord placé en section 3, s'exécutait sur un devis encore **en brouillon** : son motif était vide, et « aucune référence » était vrai **sans rien prouver**. Déplacé après la conversion, avec une assertion d'anti-vacuité exigeant que le devis lu soit réellement `CONVERTED` |

Le second est exactement le piège que le LOT 26 avait nommé : **aucun test ne
doit « réussir » parce que sa question était vide.** Il a été trouvé en lisant le
détail affiché — `motif lu : «  »` — et non en regardant le compteur de succès.

---

# 9. Tests réellement exécutés — et ce qui ne l'a PAS été

## 9.1 Périmètre déterminé avant de tester

| Question | Réponse |
| --- | --- |
| Modules modifiés | Commerce (fournisseur **et** client), Facturation fournisseur |
| Fonctions partagées modifiées | `create_supplier_invoice`, `cancel_supplier_invoice`, `create_invoice_from_purchase_order`, `cancel_customer_invoice`, `create_invoice_from_sales_order`, `convert_sales_quote_to_order`, `set_sales_order_status` |
| Tables, policies, RLS | **Aucune** — un index retiré, aucune policy touchée |
| Dépendances pouvant régresser | Factures clients (`cancel_customer_invoice` est partagée avec la **location**) |

## 9.2 Exécuté

| | Résultat |
| --- | :-: |
| `npm run lint` | ✅ |
| `npm run typecheck` | ✅ |
| `npm run test` | ✅ **401 tests**, 19 fichiers (+9) |
| `npm run build` | ✅ |
| `db:verify:purchasing` | ✅ 28 sections |
| `db:verify:commerce` | ✅ **28 sections** (+1) |
| `db:verify:supplier-invoices` | ✅ |
| `db:verify:customer-invoices` | ✅ |
| `verify:purchasing` | ✅ **161 contrôles** (+4) |
| `verify:commerce` | ✅ **137 contrôles** (+4) |
| **Total contrôles de production** | **298** |

`customer-invoices` et `supplier-invoices` ne sont pas là par précaution : la
fonction `cancel_customer_invoice` est **partagée avec la location**, et la
réécrire imposait de vérifier que la facturation client n'a pas bougé.

## 9.3 🟥 Volontairement NON rejoué

Les **20 recettes de production** et les **28 recettes SQL** du LOT 26 n'ont
**pas** été rejouées. C'est précisément ce que la nouvelle gouvernance supprime.

| Non rejoué | Pourquoi |
| --- | --- |
| **Cycle destructif de sauvegarde** | `backup_scope`, `backup_columns`, le format et le moteur reset/restore sont **inchangés**. Une **sauvegarde préalable** a néanmoins été prise et vérifiée : **221 lignes / 221**, 62 tables |
| Permissions, groupes, audit, authentification | Aucune capacité, aucune policy, aucune RLS touchée. Le catalogue reste à **229** |
| Locations, avenants, périodes, relevé global | Aucune fonction de location modifiée — hors `cancel_customer_invoice`, dont l'effet sur la location **est** couvert par `db:verify:customer-invoices` |
| Tarifs fournisseurs véhicules, maintenance, imputations | Hors périmètre |
| Trésorerie, paiements, virements | La trésorerie n'est pas touchée : DEC-053 agit **avant** le règlement |
| Responsive, mots de passe, utilisateurs, pilotage | Aucun écran nouveau, aucune route nouvelle |

---

# 10. Le nouveau workflow, documenté

Le workflow de développement n'était **documenté nulle part dans
`00 Documentation/`** — il vit dans **`CLAUDE.md`**, qui en est la source
normative (§2, §47, §48, §54). Le workflow allégé y est donc inscrit, en
**§47 bis**, et **aucun document concurrent n'a été créé**.

Il y fixe : le workflow normal, les quatre questions qui déterminent le
périmètre, la liste des briques transversales qui imposent encore une
non-régression étendue, la **règle d'escalade en cinq niveaux**, le régime de la
sauvegarde, la conduite en cas de coupure réseau, et ce qu'un rapport doit
contenir.

Ce changement est une règle de **gouvernance du développement**, non une règle
**métier** : le Journal des décisions consigne les secondes. Il n'a donc **pas**
reçu de numéro DEC, conformément à la convention du projet. **DEC-053** y figure,
elle, parce qu'elle est métier.

---

# 11. Risques assumés

| Risque | Traitement |
| --- | --- |
| Le comptage des factures restantes lit sous RLS | Sens de l'erreur choisi et documenté : la branche prudente est celle qui protège (§5) |
| `INVOICED` change de sens pour les commandes existantes | Aucune donnée migrée. Les commandes déjà `INVOICED` deviennent **refacturables**, ce qui est l'effet voulu |
| La situation dérivée se recalcule à chaque affichage | C'est le but : rien à désynchroniser. Le coût est une somme sur les factures d'une commande |
| Un appel direct peut insérer une facture sans passer par les fonctions | **Pré-existant**, révélé par le retrait de l'index qui le masquait. Hors périmètre de cette boucle — **signalé en dette** (§13) |

---

# 12. Livraison

| | |
| --- | --- |
| Commits | `3151565` — DEC-053 et la dette client · `c6bdca5` — les recettes |
| **SHA applicatif éprouvé** | **`3151565`** — c'est le code que les recettes de production ont exercé |
| **SHA déployé et vérifié** | **`3151565`** · Vercel **READY**, relevé par l'API REST |
| `c6bdca5` | **Aucun déploiement Vercel n'a été créé pour lui.** Il ne touche que `scripts/verify-*.mjs`, qui ne font pas partie du bundle livré — la production ne change pas. Ce rapport le dit plutôt que d'annoncer un SHA déployé qu'il n'a pas relevé |
| GitHub | `main` = `origin/main` = `c6bdca5` |
| Production | `https://adikom-pilot.vercel.app` |
| Migrations | 104 → **106** |
| Catalogue | **229** → **229** |
| `backup_scope` | **62** → **62** |
| Résidus | **Aucun** — six familles balayées côté achat, cinq côté commerce, empreinte DEMO identique |

---

# 13. Dettes et points ouverts

| # | Point | Nature |
| :-: | --- | --- |
| 1 | **P-5** — prix d'achat par fournisseur au catalogue | 🟥 **Toujours ouvert et intact.** DEC-053 n'y touche pas |
| 2 | **Insertion directe dans `supplier_invoices`** | 🟦 Un profil disposant de `billing.supplier_invoices.create` peut insérer par PostgREST sans passer par les fonctions, donc **sans le numéroteur**. Pré-existant au LOT 5, masqué jusqu'ici par l'index d'unicité. **À trancher**, hors périmètre |
| 3 | **Échéancier contractuel fournisseur** | 🟦 Non modélisé. C'est lui qui justifierait un objet « tranche de commande » |
| 4 | **Traçabilité ligne à ligne facture ↔ commande** | 🟦 Inchangée, conforme au Plan 02 §9.2 |
| 5 | **Remises fournisseurs** · **DEC-051** | 🟦 Non modélisées / non implémentée |
| 6 | **A-7 · DEC-008 · P-2** | 🟥 Intouchés |

---

**ADIKOM PILOT — Rapport 19**
**DEC-053 · Facturation fournisseur multiple · Confidentialité du commerce client · Workflow allégé**
