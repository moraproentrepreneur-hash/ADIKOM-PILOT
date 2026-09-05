# Rapport 07 — Paramètres

**LOT 16** · Phase 4 — Organisation
**Module 09 — Paramètres** (intégral)
**Date :** 5 septembre 2026
**Décision associée :** DEC-039
**Commits :** `f4057c1` — *ce qui se configure une fois, et qui a le droit d'en changer quoi*
`6b5dd4d` — *un onglet fermé se nomme, il ne se remplace pas en silence*
**Production :** https://adikom-pilot.vercel.app — `READY` sur `6b5dd4d`

---

## 1. Objectif du lot

Livrer le **dernier module annoncé comme « à venir »** dans la barre latérale :

```
Paramètres
│
├── Entreprise      ← LOT 16  (8 sections, §31)
└── Numérotation    ← LOT 16  (14 règles, §15)
```

Critères d'acceptation du `Module 09` §58 couverts : **1 à 15, 18, 19, 20**.
Les critères 16 et 17 — non-rétroactivité des documents émis — sont **signalés
et portés aux arbitrages ouverts** : ils supposent une décision comptable
(voir §8).

---

## 2. Analyse préalable

### 2.1 Ce qui existait déjà

Le module n'avait **rien à créer** en base. Ce qui manquait, c'étaient les
écrans — et les frontières que ces écrans ont révélées.

| Élément | Origine | État avant le lot |
| --- | --- | --- |
| `company_settings` (44 colonnes, singleton) | migration 005 | Peuplée, jamais éditable depuis l'interface |
| `numbering_rules` (14 règles) | migrations 005 et suivantes | Alimentées, jamais éditables |
| `next_number()` | migration 005 | En service — avec un défaut de fuseau, §7.3 |
| Vue `company_profile` | migrations 006, 027 | Sous-ensemble non sensible, lue par les documents |
| Neuf capacités `settings.*` | migration 007 | Au catalogue, **inutilisables faute d'écran** |
| Déclencheurs d'audit | migration 005 | `company_settings` et `numbering_rules` (format seul) |

### 2.2 Documents consultés

`README.md` · `CLAUDE.md` (§19, §19 bis, §22, §25, §29, §33, §34, §37, §38, §43, §44, §58, §60)
`00 Documentation/03_Modules/09_Parametres.md` — **intégral**
`00 Documentation/05_Regles_Metier/03_Finance.md` · `06_Audit.md` (§43)
`00 Documentation/08_Decisions/01_Journal_des_Decisions.md` — DEC-005, DEC-008,
DEC-010, DEC-014, DEC-021, DEC-023, DEC-024, DEC-025 §e, DEC-035 §b, DEC-038
`RAPPORTS/Rapport 06_...md`
Migrations 005, 006, 007, 019, 027, 060, 061, 064.

---

## 3. Arbitrages — aucun n'était bloquant

Quatre questions se posaient avant de coder. Les quatre se tranchaient **par les
documents existants**.

### 3.1 Faut-il créer des permissions ?

**Non.** Les neuf existent mot pour mot depuis la migration 007 :

| Acte livré | Capacité |
| --- | --- |
| Consulter la fiche Entreprise | `settings.company.view` |
| Modifier identité, coordonnées, commercial, facturation, préférences | `settings.company.update` |
| Voir / modifier le registre et les identifiants fiscaux | `settings.company.administrative.view` · `.update` |
| Voir / modifier les coordonnées bancaires | `settings.company.bank.view` · `.update` |
| Remplacer le logo et les couleurs | `settings.branding.update` |
| Consulter / modifier les formats de référence | `settings.numbering.view` · `.update` |

**Catalogue : 170 → 170.**

### 3.2 Le logo doit-il apparaître sur les documents émis ?

**Non — le document le dit lui-même.** §6 : le logo « doit pouvoir être utilisé
dans les documents générés par le SaaS **lorsque cette fonctionnalité sera
développée** ». Le périmètre de §39 — import, remplacement, aperçu, retrait —
est donc livré entier ; l'emploi documentaire reste ouvert (arbitrage n° 27).

### 3.3 Le compteur d'une numérotation est-il modifiable ?

**Non.** §16 interdit « la réutilisation accidentelle d'un numéro ». Rien à
arbitrer : le ramener en arrière ferait rééditer des références déjà portées par
des factures.

### 3.4 Une modification doit-elle réécrire les documents passés ?

**Non**, et §46 le dit. Mais §47 assortit sa règle d'une réserve — « lorsque
cette information fait partie du document ou de son historique » — qui est
précisément ce qui reste à trancher. **Signalé, non implémenté** : voir §8.

---

## 4. Le défaut central du lot

### 4.1 Une seule ligne, huit sections, quatre capacités

`company_settings` est un **singleton** : toute la configuration d'ADIKOM tient
sur une ligne. Or RLS est ROW-level.

```
AVANT
  policy SELECT : settings.company.view      → rendait la LIGNE ENTIÈRE
  policy UPDATE : settings.company.update    → réécrivait la LIGNE ENTIÈRE

  ⇒ registre de commerce (§34) et coordonnées bancaires (§37) ouverts
    à qui ne détenait que la capacité générale.
```

`Module 09` §42 l'interdit mot pour mot : « Un utilisateur ne disposant pas des
permissions nécessaires ne doit pas pouvoir les **consulter ou les modifier**. »

### 4.2 Le même piège, pour la troisième fois

| Lot | Objet | Résolution |
| --- | --- | --- |
| Migration 041 | Coût d'une maintenance inclus dans sa consultation | Tables séparées |
| Migration 060 | `is_active` d'un groupe inclus dans `.update` | Déclencheur |
| **Migration 068** | Sections sensibles d'un singleton | **Droits de colonne + déclencheur** |

Les colonnes ne pouvant pas déménager, la réponse est celle du journal
d'activité (DEC-038) : **droits de colonne** en lecture, **déclencheur** en
écriture.

### 4.3 La répartition retenue

```
La POLICY dit qui peut écrire dans la table.
Le DÉCLENCHEUR dit qui peut accomplir CET acte-là.
```

La policy d'`UPDATE` admet désormais **les quatre capacités** ; le déclencheur
`fn_company_settings_write_guard` compare **colonne par colonne** et exige celle
qui correspond.

Sans cet élargissement, un compte doté de la seule capacité bancaire se serait
vu refuser l'écriture **avant** d'atteindre le déclencheur — le défaut exact que
la migration 061 avait corrigé pour les groupes (DEC-035 §b).

> La comparaison est écrite **colonne par colonne**, et non par soustraction
> d'un `to_jsonb`. Une soustraction aurait laissé passer toute colonne ajoutée
> plus tard sans que personne ne s'en aperçoive.

### 4.4 En lecture — `company_settings_sensitive()`

Les sept colonnes sensibles sont retirées des droits de `authenticated` et
rendues par une fonction `SECURITY DEFINER` qui exige `settings.company.view`,
puis la capacité de chaque section, et rend **deux drapeaux** :
`may_read_administrative`, `may_read_bank`.

L'écran s'en sert pour **dire** « Section non consultable avec vos droits » et
nommer la capacité manquante — plutôt que d'afficher des champs vides, qui se
liraient « non renseigné » (DEC-017).

> `company_profile` — le sous-ensemble non sensible lu par l'en-tête des
> documents — **n'est pas touchée** : elle s'exécute sous son propriétaire et ne
> porte aucune colonne sensible. La recette SQL le vérifie explicitement : ce
> serait rouvrir par la fenêtre ce que la porte vient de fermer.

---

## 5. Le compteur d'une numérotation (§16)

`numbering_rules.current_value` porte le **dernier numéro émis**.

Un compte doté de `settings.numbering.update` pouvait le ramener en arrière, et
la facture suivante aurait repris un numéro déjà utilisé — **sans qu'aucune
erreur ne le signale**.

Le compteur n'appartient désormais qu'à `next_number`, qui lève un drapeau
**local à sa transaction** avant d'écrire. Le drapeau n'est posable par aucune
requête de l'application : `set_config` n'est pas exposé par l'API.

La règle ne connaît **aucune exception** — ni pour un détenteur de la capacité,
ni pour le rôle de service. Un numéro réémis l'est pour tout le monde.

Deux protections l'accompagnent :

- la **clé** d'une règle ne se renomme pas : elle identifie la règle dans tout
  le code applicatif ;
- le **préfixe** ne peut pas être vide : les références deviendraient
  inexploitables.

L'écran, lui, affiche le compteur, ne propose aucun champ pour le saisir, et
dit pourquoi.

### Une incohérence refusée à la source

Une **remise à zéro annuelle sans année dans la référence** produirait deux
documents portant le même numéro à un an d'intervalle. L'action serveur la
refuse, et l'écran l'annonce dès la saisie.

---

## 6. L'exercice d'un numéro (§17)

`next_number` lisait l'année sur **UTC**.

Les Comores étant à UTC+3, le 1er janvier commence à Moroni **trois heures
avant** qu'UTC ne change d'année :

```
1er janvier 2027, 01 h 00 aux Comores  =  31 décembre 2026, 22 h 00 UTC

AVANT : FAC-C-2026-000112   ← année précédente, compteur non remis à zéro
APRÈS : FAC-C-2027-000001
```

Sur une facture, ce n'est pas un détail d'affichage : c'est un numéro rattaché
au mauvais exercice. L'année se lit désormais sur `Indian/Comoro`
(DEC-025 §e), et le contrôle SQL vérifie que `'UTC'` n'y figure plus.

---

## 7. Ce que l'écran livre

### 7.1 Onglet Entreprise — §31 à §38

Les huit sections documentées, chacune sous sa capacité, chacune avec ses
**trois états** (CLAUDE.md §38) :

- **modifiable** — la capacité d'écriture est détenue ;
- **lecture seule** — les champs sont inertes, et l'écran le dit ;
- **non consultable** — la section est fermée, et **nommée** comme telle.

S'y ajoutent :

| Élément | § |
| --- | --- |
| **Indicateur de configuration** — ce qui est renseigné, ce qui manque | §49 |
| **Avertissement de changement de devise**, avec confirmation | §45, §57 |
| **Logo** — aperçu, remplacement, retrait | §39 |
| **Couleurs** — validation hexadécimale | §38, §40 |
| Rappel de non-rétroactivité | §46, §47 |
| Date de dernière modification, renvoyant au Journal d'activité | §43 |

L'indicateur ne devine rien : une section qu'on n'a pas le droit de lire y est
annoncée comme telle plutôt que comptée « incomplète » — ce qui reviendrait à
révéler qu'elle est vide, ou à l'affirmer à tort.

### 7.2 La devise se confirme, côté serveur (§45, §57)

L'avertissement n'apparaît **que** lorsque la valeur change réellement : le
montrer en permanence l'aurait rendu invisible à force d'être là.

Et il ne suffit pas de l'afficher. **L'action serveur exige la confirmation** :
un formulaire renvoyé sans elle — par un appel direct, ou par un navigateur qui
n'aurait pas rendu la case — passerait outre.

### 7.3 Onglet Numérotation — §15 à §17

Les 14 règles, chacune avec son **aperçu du prochain numéro**, recalculé à la
saisie. Un format de référence se juge sur ce qu'il produit, pas sur la valeur
de ses réglages.

> L'aperçu est écrit **deux fois** — en SQL pour produire les numéros, en
> TypeScript pour les montrer. C'est un compromis assumé : une divergence ne
> fausserait aucune référence émise, mais rendrait l'aperçu menteur. Sept tests
> unitaires rejouent la règle SQL sur les mêmes entrées, et la recette de
> production compare l'aperçu affiché au format réellement enregistré.

### 7.4 Le logo — §39, CLAUDE.md §33 et §34

Bucket **privé**, sans aucune policy : le navigateur ne peut pas lire un objet
même en connaissant son chemin. L'aperçu passe par une route serveur qui délivre
une URL signée de **60 secondes**.

**Le fichier est stocké tel quel** — ni redimensionné, ni recadré, ni recomposé.
L'aperçu le présente sur fond blanc, à ses proportions, dans un conteneur qui
s'adapte à lui (`object-contain`, jamais `object-cover`).

Les documents générés continuent d'employer le **fichier officiel embarqué**, et
l'écran le dit explicitement.

---

## 8. Défauts découverts et corrigés

### 8.1 Un onglet fermé était remplacé en silence — produit

**Découvert par la recette de production.** Un compte doté de la seule lecture
de la numérotation, demandant `?onglet=entreprise`, obtenait l'onglet
**Numérotation**.

La sécurité tenait — aucun champ de la fiche Entreprise n'était rendu — mais
l'écran **mentait** : rien ne disait qu'une autre section existait et qu'elle
était fermée (DEC-017).

L'onglet demandé est désormais conservé, et le refus nommé. La barre d'onglets
n'annonce plus que ce qu'elle peut ouvrir, suivant la même convention que la
barre latérale (`Module 08` §23).

### 8.2 La recette écrivait la valeur déjà en place — recette

Le contrôle « le compteur ne se remet pas en arrière » écrivait **zéro** sur une
règle dont le compteur valait déjà zéro. Le déclencheur compare
`new.current_value is distinct from old.current_value` : rien ne changeait, rien
ne se déclenchait, et le contrôle concluait « autorisé à tort » sur une écriture
qui n'écrivait rien.

Il écrit désormais une valeur **différente**, et relit ensuite la donnée : un
refus qui laisserait la donnée modifiée n'est pas un refus.

### 8.3 `TRUNCATE` contournait la protection de suppression — migration 068

`TRUNCATE` ne déclenche **aucun trigger de ligne** : le garde-fou
`company_settings_no_delete` de la migration 005 ne l'aurait pas vu passer. Le
droit était un accord par défaut de Supabase, sans usage.

Retiré sur `company_settings` et `numbering_rules` (§44).

> **Le point vaut pour toutes les tables du SaaS**, et il est porté aux
> arbitrages ouverts (n° 29). Il n'est atteignable par aucun chemin applicatif —
> PostgREST n'expose pas `TRUNCATE` — et n'est donc pas une faille ouverte, mais
> une défense en profondeur qui manque.

### 8.4 Un résidu qui a survécu à un passage vert — recette

**Incident réel, signalé ici parce qu'il ne doit pas rester hors trace.**

Un passage de `verify:settings` a été interrompu : sa sortie était redirigée
vers `head`, qui referme le tuyau et tue le processus **avant son `finally`**.
Sept comptes de recette et une valeur marquée — `tagline = « RECETTE PARAM
330365 — slogan »` — sont restés dans la configuration réelle d'ADIKOM.

Le passage **suivant** en a pris l'empreinte, l'a fidèlement restituée, et a
conclu *« Configuration restituée à l'identique »*. **La recette avait raison sur
elle-même et tort sur la réalité** : elle restaure ce qu'elle a trouvé, et ne
sait pas qu'elle a trouvé un dégât.

Trois corrections :

1. **Les résidus ont été retirés à la main** — sept comptes supprimés, et
   `tagline` remis à sa valeur d'origine (`null`), retrouvée dans le
   **`before_data`** de la première écriture marquée. Le journal d'activité a
   servi exactement à ce pour quoi il existe.
2. **La recette refuse désormais de démarrer** sur une configuration portant
   déjà sa marque, en nommant la colonne fautive. Un `finally` ne protège que le
   passage qui l'exécute.
3. **Un balayage complet** a confirmé qu'aucun autre résidu ne subsiste — ni
   compte, ni groupe, ni tiers, ni projet, ni compte financier.

> **La cause première est une erreur de conduite, pas de code :** rediriger la
> sortie d'une recette vers `head` la tue avant son nettoyage. C'est une règle
> connue du projet, et elle a été enfreinte ici.

---

## 9. Migrations

| Fichier | Contenu |
| --- | --- |
| `20260905000900_parametres_entreprise_et_numerotation.sql` | **068** — droits de colonne sur `company_settings` ; `company_settings_sensitive()` ; policy élargie ; `fn_company_settings_write_guard` ; `fn_numbering_rules_write_guard` ; `next_number` sur l'exercice comorien ; retrait d'`INSERT`, `DELETE`, `TRUNCATE`. Aucune table, aucune capacité. |
| `20260905001000_stockage_identite_visuelle.sql` | **069** — bucket privé `branding`, 2 Mio, images uniquement. |

Toutes appliquées sur Supabase Cloud (`npm run db:push`).

---

## 10. Fichiers créés et modifiés

### Créés

```
supabase/migrations/20260905000900_parametres_entreprise_et_numerotation.sql
supabase/migrations/20260905001000_stockage_identite_visuelle.sql
supabase/tests/settings.sql
scripts/verify-settings.mjs

src/features/settings/constants.ts
src/features/settings/data.ts
src/features/settings/actions.ts
src/features/settings/section-form.tsx
src/features/settings/numbering-form.tsx
src/features/settings/logo-panel.tsx
src/features/settings/settings.test.ts

src/app/(app)/parametres/page.tsx
src/app/api/branding/logo/route.ts
```

### Modifiés

```
src/lib/navigation.ts   ← Paramètres : ready, avec sa lecture alternative
package.json            ← db:verify:settings, verify:settings
00 Documentation/08_Decisions/01_Journal_des_Decisions.md  ← DEC-039
```

### Un composant, huit sections (CLAUDE.md §37)

Les huit sections partagent **un seul composant** et **une seule action
serveur**, qui valide et écrit les colonnes de la section demandée — et rien
d'autre. En écrire huit variantes aurait garanti qu'elles divergent à la
première correction.

---

## 11. Tests

### 11.1 Tests SQL — `npm run db:verify:settings`

**15 contrôles, tous verts.**

| # | Contrôle |
| --- | --- |
| 1 | Catalogue à 170 ; les neuf capacités existent ; aucune inventée |
| 2 | Administratif et Banque hors de portée de l'API ; l'écran reste servi |
| 3 | **La vue publique ne porte aucune colonne sensible** |
| 4 | La policy ouvre, le déclencheur arbitre |
| 5 | Une seule configuration : ni supprimable, ni « truncatable », clé figée |
| 6 | **Le compteur ne se règle pas à la main — même pour le rôle de service** |
| 7 | Le format reste modifiable sans redéploiement (DEC-005) |
| 8 | Ni préfixe vide, ni clé renommée |
| 9 | `next_number` produit le format attendu, incrémente, et **referme son drapeau** |
| 10 | L'exercice d'un numéro est celui d'ADIKOM, pas celui du serveur |
| 11 | Sans `settings.company.view`, les sections sensibles se refusent |
| 12 | Aucune table, aucune colonne : 44 colonnes, 14 règles |
| 13 | Les paramètres sont journalisés, et leur détail cartographié (DEC-038) |
| 14 | Le stockage du logo est privé et borné |
| 15 | Location, facturation, trésorerie, tiers et catalogue : intacts |

Transaction annulée : **aucun numéro n'a été réellement consommé**, aucun format
réellement modifié.

### 11.2 Recette de production — `npm run verify:settings`

**80 contrôles, tous verts**, exécutés contre `https://adikom-pilot.vercel.app`
avec **sept profils réels**, dont aucun ne cumule deux sections sensibles.

| Section | Contrôles | Ce qu'elle éprouve |
| --- | --- | --- |
| 1 | 15 | L'accès est restreint (§30) ; la numérotation **n'ouvre pas** l'Entreprise |
| 2 | 19 | Chaque section sensible suit SA capacité — à l'écran ET par appel direct |
| 3 | 12 | **Écrire une section exige SA capacité**, par `PATCH` direct |
| 4 | 5 | La devise se confirme, et ne bouge pas sans confirmation |
| 5 | 10 | Le format se règle, le compteur jamais |
| 6 | 6 | Le logo suit l'identité visuelle ; le stockage reste privé |
| 7 | 2 | Les modifications sont journalisées (§43) |
| 8 | 4 | Non-régression — la vue publique reste lisible par tout compte |
| 9 | 7 | **Responsive** — mobile 390 px, tablette 820 px, desktop 1440 px |

#### Ce que la section 3 a prouvé par appel direct

| Profil | Peut écrire | Ne peut pas écrire |
| --- | --- | --- |
| `settings.company.update` | identité, coordonnées, commercial, facturation, préférences | registre · banque · couleurs |
| `…administrative.update` | registre, identifiants fiscaux | **tout le reste** |
| `…bank.update` | coordonnées bancaires | registre · identité |
| `settings.branding.update` | couleurs, logo | coordonnées |
| lecture seule | rien | tout |

Et nul ne crée une seconde configuration.

#### Prudence particulière

Il n'existe **qu'une ligne** de paramètres, et c'est celle d'ADIKOM. La recette
en prend une **empreinte complète** au départ, la restitue colonne par colonne à
la fin, et **relit** le résultat pour vérifier qu'aucune colonne ne diverge.
Elle ne consomme **aucun numéro** : un numéro émis ne se reprend pas.

> Sortie de la recette : *« Configuration d'ADIKOM restituée à l'identique. »*

### 11.3 Tests unitaires et build

```
npm run lint       ✔
npm run typecheck  ✔
npm test           ✔  12 fichiers, 219 tests (+20)
npm run build      ✔
```

Les 20 tests ajoutés éprouvent l'**aperçu de numérotation** — sept scénarios,
dont le changement d'exercice et le compteur qui dépasse sa longueur —, le
**fuseau de l'exercice**, et la **cohérence entre les sections déclarées et les
capacités du catalogue**.

---

## 12. Non-régressions vérifiées

Toutes exécutées **contre la production**, après déploiement.

| Recette | Résultat |
| --- | --- |
| 19 recettes SQL (`db:verify` et `db:verify:*`) | ✔ **332 contrôles** |
| `verify:capabilities` | ✔ **206 contrôles** |
| `verify:planning` | ✔ 100 contrôles |
| `verify:notifications` | ✔ 85 contrôles |
| `verify:audit` | ✔ 81 contrôles |
| `verify:projects` | ✔ 76 contrôles |
| `verify:groups` | ✔ 73 contrôles |
| `verify:pilotage` | ✔ 55 contrôles |
| `verify:imputations` | ✔ 47 contrôles |
| `verify:users` | ✔ 14 contrôles |

L'engagement le plus lourd portait sur `next_number` : **tous** les objets du
SaaS en dépendent — client, fournisseur, véhicule, réservation, location,
maintenance, imputation, facture, règlement, compte. Les 19 recettes SQL en
créent et en numérotent à chaque passage.

> **Deux recettes n'ont pas pu être exécutées** — `verify:users:ui` et
> `verify:permissions` exigent `ADIKOM_ADMIN_USERNAME` et
> `ADIKOM_ADMIN_PASSWORD`, absentes de `.env.local`. Constat identique aux
> LOTs 14 et 15.

---

## 13. GitHub et Vercel

| | |
| --- | --- |
| Dépôt | `moraproentrepreneur-hash/ADIKOM-PILOT`, branche `main` |
| Commits | `f4057c1` (livraison) · `6b5dd4d` (corrections) |
| Secrets | Diff vérifié — **aucune valeur secrète** |
| Vercel | Déploiement `READY` sur `6b5dd4d` |

---

## 14. État de la base après le lot

| | |
| --- | --- |
| Migrations appliquées | jusqu'à **069** |
| Catalogue de permissions | **170** — inchangé |
| Tables | inchangées (aucune créée, aucune supprimée) |
| Buckets | `vehicle-documents`, **`branding`** — les deux privés |
| `company_settings` | 1 ligne, 44 colonnes, restituée à l'identique |
| `numbering_rules` | 14 règles, compteurs intacts |
| Données DEMO | **3 clients · 3 véhicules · 3 fournisseurs** — intactes |
| Résidus de recette | **aucun** — après le retrait manuel décrit au §8.4 |

Balayage final, à la fermeture du lot :

```
Catalogue                       170 capacités
Clients · Véhicules · Fournisseurs   3 · 3 · 3
Règles de numérotation           14, compteurs intacts
Comptes de recette                0
Groupes de recette                0
Tiers, projets, comptes financiers de recette   0
Configuration                    tagline null, devise KMF, couleurs d'origine
```

---

## 15. Ce qui n'a volontairement pas été implémenté

| Non livré | Pourquoi |
| --- | --- |
| **Snapshot de l'identité sur les documents émis** (§46, §47) | Suppose une décision comptable : quels champs, sur quels documents, à quel moment. Arbitrage ouvert **n° 26**. |
| **Logo employé par les documents générés** (§6) | §6 le prévoit « lorsque cette fonctionnalité sera développée ». Arbitrage ouvert **n° 27**. |
| **Paramètres de notification** (§27) | §27 les range parmi les évolutions ; se rattache à l'arbitrage **n° 16**. Arbitrage ouvert **n° 28**. |
| **Séries de références** (DEC-023 §3) | Implémentation explicitement reportée ; aucun document commercial n'en dépend encore. |
| **Configuration initiale guidée** (§48) | La ligne existe et est renseignée depuis la migration 027 ; un assistant de première installation n'a pas d'usage sur une instance en service. |
| **Multi-devises, multi-sites, modèles de documents, paramètres d'intégration** (§53) | §53 les range explicitement hors MVP. |
| **Mise en cache des paramètres** (§52) | La fiche est lue une fois par affichage de l'écran ; les documents lisent `company_profile`. Aucune mesure ne montre de besoin (CLAUDE.md §29). |

---

## 16. Arbitrages restant ouverts

Le lot en ajoute **quatre** (n° 26 à 29) et n'en ferme aucun.

| N° | Question |
| --- | --- |
| **26** — DEC-039 §f | Les documents émis doivent-ils **figer l'identité d'ADIKOM** au moment de leur émission (§46, §47) ? Décision comptable : quels champs, sur quels documents, à quel moment. |
| **27** — DEC-039 §d | Les documents générés doivent-ils employer le **logo téléversé** plutôt que le fichier officiel embarqué (§6) ? |
| **28** — DEC-039 §f | Le module doit-il porter les **réglages de notification** (§27) ? Rejoint l'arbitrage n° 16. |
| **29** — DEC-039 §g | Le droit `TRUNCATE` doit être retiré à `authenticated` sur **toutes** les tables. Défense en profondeur, non atteignable par l'application. |

**DEC-005 avance.** La règle de remise à zéro annuelle est désormais
**paramétrable et visible** : ADIKOM peut la constater à l'écran, règle par
règle, avant de la confirmer. La confirmation formelle reste due.

---

## 17. Pour reprendre le projet

### Où en est la Phase 4

| Module | État |
| --- | --- |
| **Module 03 — Projets & Planification** | ✔ complet (LOTs 12 et 13) |
| **Module 08 — Utilisateurs & Groupes** | ✔ complet (Phase 1, LOTs 14 et 15) |
| **Module 09 — Paramètres** | ✔ **complet — LOT 16** |

**La Phase 4 — Organisation est achevée.**

### Ce qui reste annoncé comme « à venir » dans la barre latérale

| Entrée | Module |
| --- | --- |
| Virement interne | Banques & Caisses (§ à venir) |
| Paiements divers | Facturation & Paiement |

Ce sont les deux dernières entrées `planned` de la navigation.

### Commandes utiles

```bash
npm run db:push               # appliquer les migrations
npm run db:verify:settings    # recette SQL du LOT 16 (15 contrôles)
npm run verify:settings       # recette de production (80 contrôles)
npm run verify                # lint + typecheck + tests + build
```

> **Piège toujours d'actualité :** si `npm run typecheck` échoue sur des routes
> typées alors que `next build` passe, supprimer `.next/dev/types`.

---

## 18. Bilan

| | |
| --- | --- |
| Contrôles SQL | **15** — tous verts |
| Contrôles de production | **80** — tous verts |
| Contrôles de non-régression | **1 069** — tous verts |
| Tests unitaires | **219** — tous verts (+20) |
| Capacités ajoutées | **0** — catalogue à 170 |
| Tables ajoutées | **0** |
| Défauts découverts et corrigés | **4** (1 produit, 2 recette, 1 défense en profondeur) |
| Arbitrages ouverts ajoutés | **4** |
| Résidus de recette | **aucun** |
| Données DEMO | **intactes** |

---

**ADIKOM PILOT — LOT 16**

> Une information générale se configure une fois.
> Chaque section a son gardien.
> Et un numéro déjà émis ne se reprend jamais.
