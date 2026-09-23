# Rapport 16 — Synthèse et relevé global de location

## LOT 24 · Module 05 « Gestion de location » — Un document qui explique la situation, et ne la modifie pas

| | |
| --- | --- |
| Date | **22 septembre 2026** |
| Lot | **LOT 24** du `Plan 02` — 6ᵉ des dix lots |
| Décision | **DEC-048** — consignée au journal |
| Sources métier | Direction, 11/09/2026 — **A-6** · `Plan 02` §3.3, §6.4, §10.3, §16.6 |
| Commits | **`7f19a62`** · **`f998a6c`** · **`41c8f41`** |
| SHA **éprouvé et déployé** | **`41c8f41`** — déploiement Vercel `READY` |
| Production | https://adikom-pilot.vercel.app |
| Catalogue | **197 → 197 capacités** *(aucune créée)* |
| Sauvegarde | **54 → 54 tables** *(aucune table créée)* |
| Migrations | 96 → **96** *(aucune migration)* |

---

# 1. Objectif

Le LOT 23 a donné à ADIKOM PILOT la facturation périodique : un contrat de
longue durée reçoit une facture par période, et jamais deux sur la même.

Il a laissé un besoin ouvert, celui que la Direction avait écrit dans la même
phrase :

> **A-6 — « Chaque fin du mois, on établit une facture, toutefois le client peut
> exiger une facture globale de toute la période de location avec les détails et
> les historiques de payement. »**

Le LOT 23 a établi qu'après émission de factures périodiques, produire une
nouvelle facture couvrant à nouveau toute la période **provoquerait une double
créance**. La décision d'architecture était donc acquise avant ce lot :

> **CE DOCUMENT EST UN RELEVÉ RÉCAPITULATIF. CE N'EST PAS UNE FACTURE.**

Le LOT 24 le produit.

Il doit permettre de comprendre, **sur un seul document**, l'histoire complète et
financière d'une location : quel véhicule, sur quelle période, à quel tarif, par
quel avenant, facturé comment, réglé quand, et ce qui reste dû.

---

# 2. Décisions appliquées

| Réf. | Ce qui était décidé | Ce que le lot en fait |
| :-: | --- | --- |
| 🟩 **A-6** | « … le client peut exiger une facture globale de toute la période de location **avec les détails et les historiques de payement** » | Le **relevé** est produit, avec le détail des lignes de chaque facture et l'historique des règlements |
| 🟩 **Plan 02 §3.3** | La « facture globale » est un **relevé récapitulatif**, sans créance nouvelle | Appliqué **sans le rediscuter** — DEC-047 §c l'avait déjà consigné |
| 🟩 **Plan 02 §10.3** | `rental.rentals.summary.*` **n'est pas créée** — la synthèse est le 4ᵉ document du cycle | **Aucune capacité** créée ; catalogue inchangé à 197 |
| 🟩 **Plan 02 §16.6** | LOT 24 — **aucune migration** | **Aucune migration** ; dernière migration toujours 096 |
| 🟩 **Plan 02 §6.4** | Aucun document remis à un tiers ne porte coût, commission ni marge — **ni la synthèse** | Le modèle **ne reçoit pas** le coût ; la « seconde composition » 🟦 envisagée est **écartée** (§12.2) |
| 🟩 **A-14 / DEC-024** | Consulter, télécharger, imprimer sont des capacités distinctes | Les trois modes exigent chacun la leur, **en plus** de `rental.rentals.view` |
| 🟩 **DEC-017** | Un refus de lecture se **nomme**, il ne s'affiche pas en zéro | Chaque section fermée est nommée ; `paid` et `balance` valent `null`, jamais 0 |
| 🟩 **DEC-010** | Les montants sont des **entiers** en KMF | `totals()` somme des entiers, aucun flottant |
| 🟥 **A-7** | Non tranchée | **Aucun barème**, aucune ligne automatique |
| 🟥 **DEC-008** | Non tranchée | **Aucun montant recalculé** (§9) |

---

# 3. Nature fonctionnelle du relevé dans le SaaS

C'est le point qui commande tout le reste du lot.

| | Facture client | **Relevé de location** |
| --- | --- | --- |
| Crée une créance | **Oui** | **Non** |
| Porte un numéro propre | Oui — `FAC-C-…` | **Non** — la référence est celle du **contrat** |
| Entre dans le solde client | Oui | **Non** |
| Porte l'historique de ses règlements | **Jamais** | **Oui — c'est sa raison d'être** |
| Est persistée | Oui | **Non** — projection calculée |
| A un statut, un workflow | Oui | **Non** |
| S'émet, s'annule | Oui | **Non** — se produit à la demande |

Le texte de la Direction porte d'ailleurs sa propre réponse : **« avec les
détails et les historiques de payement »**. Une facture ne porte **jamais**
l'historique de ses propres règlements. Ce qui est décrit est un récapitulatif.

Le relevé **explique** la situation. Il ne la modifie pas.

---

# 4. Périmètre

## 4.1 Ce que le lot livre

- **Le relevé de location**, cinquième pièce documentaire du contrat, après le
  contrat, les avenants, le bon de départ et le procès-verbal de retour.
- **Sept chapitres** : client · contrat · chronologie · avenants · périodes
  facturables · factures et le détail de leurs lignes · règlements · synthèse
  financière.
- **Aperçu, téléchargement, impression**, sous les capacités documentaires
  existantes.
- **Les deux régimes** : durée fixée et longue durée.
- **Le relevé intermédiaire** : il n'attend pas la clôture du contrat.
- **La garantie d'absence d'effet financier**, éprouvée par photographie.
- **Un règlement de démonstration** sur le contrat de longue durée, sans lequel
  le chapitre le plus important du document restait vide.

## 4.2 Ce que le lot ne livre pas

- **Aucune table.** Aucune migration. Aucune séquence. Aucun statut.
- **Aucune capacité** — `Plan 02` §10.3 l'avait explicitement écarté.
- **Aucun barème de pénalité** (A-7, non tranchée).
- **Aucune règle de durée facturable** (DEC-008, non tranchée).
- **Aucun export tabulaire** : le relevé est un document, non un classeur.
- **Aucune entrée de navigation nouvelle.**

---

# 5. Architecture

## 5.1 Une projection, pas un enregistrement

Le relevé se reconstruit **à la demande** à partir de données déjà historisées
et déjà auditées :

```
  rentals                 ── le contrat, son régime, ses dates
  rental_segments         ── la chronologie : véhicule, période, tarif verrouillé
  rental_amendments       ── les actes qui ont modifié le contrat
  rental_billing_periods  ── le découpage de la créance
  customer_invoices       ── les créances reconnues
  customer_invoice_lines  ── « avec les détails »
  customer_payments       ── « et les historiques de payement »
  clients                 ── l'identité du preneur
                    │
                    ▼
          buildRentalStatement(rentalId)
                    │
                    ▼
            RentalStatement          ← projection typée, sans aucun coût
                    │
                    ▼
          RentalStatementDocument    ← modèle PDF
```

**Aucune source financière nouvelle n'a été inventée.** Le relevé ne lit rien
que les écrans existants ne lisent déjà.

## 5.2 Pourquoi aucune table

`CLAUDE.md` §29 et la consigne §17 posent la même exigence : une table ne se
crée pas parce qu'un document existe.

Tout ce que le relevé montre est **reconstructible fidèlement** : les segments
portent un tarif **verrouillé**, les factures des lignes **figées à l'émission**,
les règlements des montants **constatés**. Rien de ce que le document affirme ne
peut changer de sens après coup sans qu'un acte tracé l'ait décidé.

Une table de relevés aurait figé **une seconde fois** ce que ces tables savent
déjà — et créé une **seconde vérité** qu'une annulation de facture ferait
diverger. C'est exactement ce que `customer_invoices_overdue_is_derived` interdit
depuis le LOT 5, et ce que DEC-047 §e a redit des périodes.

**Le périmètre de sauvegarde reste donc à 54 tables**, et il n'est pas gonflé
d'une table qui n'existe pas.

## 5.3 Pourquoi aucun numéro

La référence portée en en-tête est celle du **contrat**, `LOC-2026-000444`.

Ce n'est pas une économie, c'est la conséquence de §5.2. Une séquence aurait
laissé croire à une pièce comptable de plus ; et deux éditions du même
récapitulatif à deux jours d'intervalle auraient porté deux numéros pour une
seule et même chose. Ce qui distingue deux éditions est leur **date d'édition**,
qui figure en en-tête de **chaque page**.

## 5.4 Où le code vit

| Fichier | Rôle |
| --- | --- |
| `src/features/rentals/documents/statement-data.ts` | Types de projection · assemblage · `totals()` |
| `src/features/rentals/documents/rental-statement.tsx` | Le modèle PDF, sept sections |
| `src/lib/documents/registry.ts` | L'entrée `releves` — permissions et construction |
| `src/features/customer-payments/data.ts` | `listRentalPayments()` — les règlements d'un contrat |
| `src/app/(app)/location/locations/[id]/page.tsx` | La barre documentaire, et ce qu'elle annonce |

🟥 **`statement-data.ts` vit dans `documents/` à dessein.** C'est le dossier que
balaye le contrôle structurel de confidentialité. L'assembleur est précisément
l'endroit où un coût pourrait entrer ; il devait donc tomber sous la même règle
que les modèles.

---

# 6. 🟥 Le relevé ne crée aucune créance

## 6.1 La règle

Générer, télécharger ou imprimer un relevé ne doit :

- créer aucune `customer_invoice` ;
- créer aucune ligne de facture ;
- créer aucun règlement ;
- créer aucun mouvement de trésorerie ;
- modifier aucun solde, aucun statut financier ;
- modifier aucune période facturable, aucun segment, aucun avenant, aucun tarif,
  aucun coût gelé, aucun contrat.

## 6.2 Comment elle est tenue

Par construction : `buildRentalStatement` **ne fait que lire**. Aucune écriture,
aucune action serveur, aucune transaction, aucun appel de fonction mutante.

## 6.3 Comment elle est éprouvée

La recette ne se contente pas de l'affirmer. Elle **photographie** l'état
financier complet du contrat, produit le document par les trois modes, reprend
la photographie, et compare.

La photographie porte trois niveaux, et c'est volontaire :

| Niveau | Ce qu'il attrape |
| --- | --- |
| **Décomptes** — factures, lignes, règlements, écritures, périodes, segments, avenants | Une création, une suppression |
| **Sommes** — facturé, réglé, trésorerie | Un montant modifié **sur place**, qu'aucun décompte ne verrait |
| **État exact** de chaque objet, sérialisé | Un statut, une date, une borne — une écriture qui en **remplace** une autre |

Elle est prise avec la **clé de service**, non avec la session : un relevé qui
créerait une ligne invisible à son auteur resterait une ligne créée.

**Résultat en production** — voir §15 :

```
  Photographie AVANT : 6 factures · 6 lignes · 3 règlements · 3 écritures
  → aperçu depuis l'écran · téléchargement · impression
  Photographie APRÈS : identique, terme à terme
  Trésorerie : 550 000 → 550 000 KMF
  Facturé 3 400 000 · Réglé 500 000 — inchangés
```

⚠ **Les 3 400 000 de la photographie ne sont pas le total facturé du relevé.**
La photographie somme **toutes** les lignes des deux contrats de recette,
annulée et brouillon comprises : c'est un **témoin d'immobilité**, pas une
grandeur métier. Le total facturé, lui, vaut **1 200 000** (§8.1 et §15.2 §5).
Confondre les deux serait exactement l'erreur que ce lot écarte.

## 6.4 Le contrôle qui ferme la porte

La recette vérifie en outre qu'**aucune facture sans période** n'existe sur le
contrat de longue durée. Si le relevé avait fabriqué une « facture globale »,
elle porterait le total du contrat et se trouverait là. Elle n'y est pas.

---

# 7. Contenu du relevé

## 7.1 Les sept chapitres

| # | Chapitre | Contenu | Disparaît si… |
| :-: | --- | --- | --- |
| 1 | **Client** | Identité, coordonnées | *jamais* — sans droit, la section est **nommée** |
| 2 | **Contrat** | N°, réservation, régime, cadence, dates prévues et réelles, état | *jamais* |
| 3 | **Chronologie** | Véhicules, périodes, tarifs verrouillés, état de chaque segment | aucun segment |
| 4 | **Avenants** | N°, nature, date d'effet, motif | aucun avenant |
| 5 | **Périodes facturables** | N°, bornes, origine, état, facture qui la couvre | régime « durée fixée » |
| 6 | **Factures** + **détail des lignes** | N°, période, dates, état, montant · puis désignation, quantité, prix unitaire, montant | *jamais* — sans droit, la section est **nommée** |
| 7 | **Règlements** | Date, référence, mode, facture, pièce, montant | *jamais* — sans droit, la section est **nommée** |
| 8 | **Synthèse financière** | Total facturé · total réglé · solde restant | factures illisibles |

**Une section sans donnée disparaît ; une section fermée par un défaut de droit
est nommée.** Les deux ne se confondent jamais : « aucun avenant » et « vous
n'avez pas le droit de voir les avenants » ne disent pas la même chose (DEC-017).

## 7.2 La chronologie reste affichée même pour un seul segment

Le **contrat de location** masque son tableau de périodes quand il n'y en a
qu'une : le véhicule et la période figurent déjà plus haut.

Le **relevé** ne le masque pas. C'est ici le chapitre qui répond à « quel
véhicule, du … au …, à quel tarif ». Le masquer priverait de sa chronologie le
contrat le plus simple — celui qui n'a jamais changé de véhicule.

## 7.3 Les deux découpages restent séparés

Une période facturable peut traverser **plusieurs segments** ; un segment peut
traverser **plusieurs périodes**. Les deux tableaux se croisent sans coïncider,
et le relevé les présente **séparément** plutôt que de les fondre — ce qui aurait
fabriqué une troisième lecture que la base ne connaît pas.

La recette éprouve ce cas : elle vérifie qu'au moins une période facturable du
contrat de recette traverse effectivement plus d'un segment.

## 7.4 Le mot qui empêche la méprise

Le document dit ce qu'il est **deux fois** : sous le titre, avant tout contenu,
et en clôture.

> « Ce relevé récapitule les factures et les règlements existants de cette
> location. Il ne constitue pas une facture et ne crée aucune créance nouvelle. »

En tête, et non en pied de page : un relevé qui ressemble à une facture sera lu
comme une facture par qui ne lit que la première page.

## 7.5 Le document PDF lui-même

Le relevé réemploie **intégralement** l'enveloppe documentaire d'ADIKOM
(`DocumentShell`) : aucune refonte du Design System, aucun en-tête redessiné.

| | |
| --- | --- |
| Format | **A4**, marges de page uniformes |
| En-tête | **Répété sur chaque page** (`fixed`) — logo sur **zone claire** (charte §34), identité légale, adresse, contact |
| Référence | « Édité le … » puis « Référence : `LOC-…` » — celle du **contrat** |
| Titre | **« Relevé de location »**, avec le sous-titre « Récapitulatif des factures et des règlements — ne constitue pas une facture » |
| Pied de page | Identité et lieu · **« Page n / N »** |
| Pagination | **Le document s'étend librement** — il n'est pas forcé sur une page |
| Sections | `wrap={false}` : une section **ne se coupe pas** au milieu d'une page |
| En-têtes de tableau | `fixed` : ils se **répètent** si un tableau franchit une page |
| Polices | Inter, **embarquée** — jamais d'italique, qui interromprait le rendu |

**Le logo n'est jamais transformé** : il est servi depuis le fichier officiel,
en `objectFit: 'contain'`, sur un fond clair (`CLAUDE.md` §33, §34).

**Le PDF n'est pas une capture de l'écran responsive** : il garde sa propre mise
en page documentaire, quelle que soit la largeur du navigateur qui l'a demandé.

Un relevé garni du contrat de recette — chronologie à trois segments, deux
avenants, cinq périodes, quatre factures détaillées, trois règlements —
pèse **66 Ko**, polices et logo embarqués, et s'étend sur plusieurs pages.

---

# 8. 🟥 La synthèse financière

## 8.1 Ce qui compte, et ce qui ne compte pas

Les règles **ne sont pas réinventées**. Ce sont celles du pilotage
(migration 052), appliquées au périmètre d'un contrat plutôt qu'à une fenêtre de
dates.

| Grandeur | Définition | Exclusions |
| --- | --- | --- |
| **Total facturé** | Σ des totaux des factures dont l'état **stocké** est `ISSUED` | **Brouillons** · **annulées** |
| **Total réglé** | Σ des règlements **validés** sur ces mêmes factures | **Règlements annulés** |
| **Solde restant** | Facturé − Réglé | — jamais une colonne |

## 8.2 L'état stocké, et l'état affiché

« Payée », « Partiellement payée » et « En retard » **ne s'écrivent jamais en
base** : ils se calculent (DEC-025 §a). Une facture intégralement encaissée
reste `ISSUED`.

Le relevé **affiche** l'état calculé, et **compte** sur l'état stocké. Confondre
les deux aurait fait disparaître du total facturé toute facture déjà réglée.

## 8.3 Le brouillon est montré, annoncé, et non compté

`CUSTOMER_INVOICE_STATUS_EFFECT.DRAFT` le dit depuis le LOT 7 : « En préparation.
Aucune créance n'est encore reconnue. »

Le relevé l'énumère dans le tableau des factures — le taire aurait rendu le
tableau des périodes incohérent, une période paraissant non facturée alors qu'un
brouillon existe — et **annonce son montant sous la synthèse** :

> « Une facture en préparation, de 700 000 KMF, n'est pas comprise dans ce
> total : un brouillon ne reconnaît aucune créance tant qu'il n'est pas émis. »

Un total silencieusement amputé se lirait comme une erreur de calcul par qui a vu
la facture à l'écran.

## 8.4 La facture annulée est écartée à la source

`listInvoicesForRental` (LOT 23) écarte déjà les annulées : elles ne portent plus
de créance, et leur période est redevenue facturable du seul fait de leur
annulation. Le relevé ne les voit donc pas.

## 8.5 Le règlement annulé est montré, et non compté

Il figure au tableau, **marqué comme tel** — « 50 000 KMF (annulé) » — et une
mention explique qu'il n'entre pas dans le total.

Le taire aurait fait disparaître du récapitulatif un mouvement que le client a pu
voir passer sur son **propre relevé bancaire**, et qu'il chercherait ensuite à
faire valoir.

## 8.6 L'encaissé se lit sur la facture, non sur le journal

`paidAmount` est **déjà** la Σ des règlements validés d'une facture, calculée par
la couche de données du LOT 8. Le relevé réemploie cette valeur plutôt que de
resommer la liste des règlements.

Resommer aurait créé une **seconde règle d'encaissement**, qui aurait fini par
diverger de celle qui gouverne la facture et le tableau de bord. Le tableau des
règlements reste, lui, l'**historique** demandé par A-6.

## 8.7 Sans le droit de lire les règlements, on ne conclut rien

`paid` et `balance` valent `null`, et **le document le dit** :

> « Le total réglé et le solde ne figurent pas sur ce document : la consultation
> des règlements n'est pas autorisée pour le compte qui l'a produit. Aucun
> montant n'est affiché à leur place. »

Afficher zéro ferait passer un contrat intégralement réglé pour entièrement
impayé — et c'est **ce relevé-là** qui serait remis au client.

---

# 9. 🟥 Aucun montant n'est recalculé — DEC-008

**La facture émise reste la vérité financière.**

Le relevé additionne des totaux de factures. Il ne reconstitue **aucun** montant
en multipliant une durée par un tarif : la règle d'arrondi — jour entamé, heure
de retour, franchise — n'est toujours pas arrêtée, et l'inventer ici aurait fait
du relevé une source concurrente de la facture.

La chronologie porte les tarifs **verrouillés** des segments, qui sont des faits
enregistrés, jamais un décompte — et le document le dit :

> « Ces tarifs ne constituent pas un décompte : les montants facturés figurent
> au chapitre « Factures ». »

**A-7 — aucune pénalité n'est calculée.** Si une facture porte déjà une ligne
libre saisie à ce titre dans le cadre des fonctionnalités actuelles, le relevé la
reprend **telle qu'elle existe**, comme toute autre ligne. Il n'en établit jamais
le barème.

---

# 10. Location en cours et location terminée

Le document **n'attend pas la clôture**.

Aucune règle du `Plan 02` ne l'exige, et le besoin exprimé — « le client peut
exiger » — ne l'attend pas : un client de longue durée réclame son récapitulatif
**en cours** de location. C'est même le seul moment où il en a besoin.

**Un seul document sert les deux cas.** Il n'y a pas de « relevé intermédiaire »
et de « relevé final » : il y a un relevé, qui reflète l'état du contrat à sa
date d'édition. Deux documents distincts auraient divergé à la première
correction.

Lorsque la location n'est pas rendue, il le **dit** :

> « Cette location n'est pas terminée : le présent relevé décrit sa situation à
> la date d'édition figurant en en-tête. Des factures et des règlements peuvent
> s'y ajouter. »

---

# 11. Permissions — 197 → 197

## 11.1 Aucune capacité créée

`Plan 02` §10.1 : **LOT 24 → +0**.
`Plan 02` §10.3 : « `rental.rentals.summary.*` — la synthèse est le 4ᵉ document
du cycle, sous `rental.rentals.download` / `.print` ».

Le relevé est gouverné exactement comme les quatre autres pièces du contrat :

| Mode | Exigé |
| --- | --- |
| `?mode=download` | `rental.rentals.view` **et** `rental.rentals.download` |
| `?mode=print` | `rental.rentals.view` **et** `rental.rentals.print` |
| `?mode=preview` | `rental.rentals.view` **et** l'une des deux |

Une cinquième capacité documentaire ne fermerait rien que celles-ci n'aient déjà
fermé (`CLAUDE.md` §19 bis) — et le projet a déjà retiré les permissions qui ne
servaient qu'à masquer un bouton (DEC-042 §d).

## 11.2 🟥 Mais elle n'ouvre rien non plus

C'est le risque propre à ce lot : **le relevé agrège plusieurs domaines**. Il ne
devait jamais devenir la porte dérobée par laquelle un exploitant obtiendrait la
facturation que son profil lui refuse.

| Section | Capacité exigée | Sans elle |
| --- | --- | --- |
| Identité du client | `parties.clients.view` | Section **nommée** |
| Tarifs de la chronologie | `rental.rentals.financial.view` | Colonne retirée, et dite |
| Factures et lignes | `billing.customer_invoices.view` | Section **nommée** · **aucune synthèse** |
| Règlements | `billing.customer_payments.view` | Section **nommée** · réglé et solde **absents** |

**Ce qui n'est pas autorisé n'est pas LU.** La donnée n'entre donc pas dans le
modèle, et ne peut pas figurer dans le PDF. RLS constitue la seconde barrière :
même si le contrôle explicite était retiré, la lecture ne rendrait rien.

## 11.3 Éprouvé avec de vraies sessions

Un profil `exploitation` — qui voit la location, la conduit, produit ses
documents, mais n'a **ni** `billing.customer_invoices.view` **ni**
`billing.customer_payments.view` :

- **n'obtient aucune facture** par appel PostgREST direct ;
- **n'obtient aucun règlement** par appel PostgREST direct ;
- **obtient son relevé** — c'est une pièce du contrat — mais **amputé** ;
- son PDF est **plus court** que le relevé complet (58 Ko contre 66 Ko) ;
- **aucun montant de facture n'atteint la charge utile de sa page**.

---

# 12. 🟥 Confidentialité des coûts

## 12.1 La règle

`Plan 02` §6.4 : « Aucun document destiné à un tiers ne porte un coût
d'acquisition, une commission ou une marge. […] **ni synthèse de location remise
au client.** »

## 12.2 Une ouverture du Plan 02 n'a pas été retenue, et pourquoi

`Plan 02` §6.4 envisageait — au titre de **recommandation** 🟦, non de décision
🟩 — « un seul document, deux compositions », le coût n'apparaissant que pour qui
détient les deux capacités.

**Cette ouverture n'est pas retenue.** Le relevé est la pièce du cycle la plus
susceptible d'être **remise au client** : une composition conditionnelle n'aurait
tenu qu'à la vigilance de celui qui l'imprime, et un Super Admin imprime avec
toutes les capacités.

Le coût d'exploitation **reste lisible là où il l'était déjà** — fiche véhicule,
fiche fournisseur, segment de location, onglet marge, facture fournisseur
(`Plan 02` §6.5). Ce lot ne retire rien ; il refuse seulement de composer le coût
dans **ce** document.

C'est aussi la lecture de `Plan 02` §18 pour le LOT 24 : « **Aucun coût, aucune
commission, aucune marge** ».

## 12.3 La barrière est le TYPE, pas la vigilance

Le modèle **ne reçoit pas** le coût :

- `StatementTimelineEntry` réemploie **`ContractPeriod`** (DEC-045), qui ne porte
  pas la colonne du coût gelé ;
- aucun champ de `RentalStatement` ne relaie un coût, une commission ou une
  marge ;
- le balayage structurel de `document.test.ts` refuse **jusqu'au nom** de ces
  colonnes dans tout fichier de `documents/`.

C'est la seule barrière qui tienne quand le demandeur **détient** le droit de
lire le coût.

## 12.4 Le balayage a refusé ma propre rédaction

Une première version de `statement-data.ts` écrivait, en commentaire :

> « aucun champ ne relaie `rental_segment_costs`, ni commission, ni marge »

Le contrôle structurel l'a **refusée** : le terme y figurait, fût-ce pour dire
qu'il n'était pas employé.

C'est le comportement voulu, et le commentaire final le dit :

> « Un terme cité aujourd'hui pour dire qu'on ne l'emploie pas est un terme que
> la prochaine relecture prendra pour un emploi légitime. »

## 12.5 Éprouvé en production

| Contrôle | Résultat |
| --- | --- |
| Le producteur du relevé obtient un coût gelé par appel direct | **0 ligne, sans erreur** |
| Il obtient un tarif fournisseur | **0 ligne** |
| Un coût apparaît sur la fiche de location, ou dans sa charge utile | **non** |
| Une commission ou une marge y apparaît | **non** |
| 🟥 **Un profil qui PEUT lire le coût obtient un relevé différent** | **non — 0 octet d'écart sur 66 Ko** |

**Le dernier contrôle est le seul qui prouve quelque chose du DOCUMENT.** Les
quatre premiers prouvent que RLS fonctionne, ce qui était déjà acquis. Celui-ci
prouve que le relevé ne compose pas le coût **même pour qui a le droit de le
lire** — et il est gardé par une vérification préalable que ce profil lit bien
3 coûts gelés, sans quoi il comparerait deux aveugles (§21.2).

⚠ **Aucun balayage d'octets du PDF n'a été conservé.** Mesure faite,
`@react-pdf` comprime ses flux et sous-ensemble ses polices : un tel contrôle
**ne peut pas échouer** (§17.5). Il a été retiré plutôt que gardé pour la forme.
**La garantie est structurelle et typée** (§12.3), et la production l'éprouve par
différence.

---

# 13. Audit

Le relevé **n'introduit aucune architecture d'audit**. Il hérite de celle des
quatre autres pièces du cycle, sans rien y ajouter :

| Acte | Journalisé | Pourquoi |
| --- | :-: | --- |
| **Téléchargement** | **Oui** — `EXPORT` | Il produit un fichier qui **quitte** le système |
| Aperçu | Non | Montre ce que l'écran montre déjà (Règles audit §80) |
| Impression | Non | Idem |
| **Refus** | **Oui** — `ACCESS_DENIED` | Événement de sécurité, quel que soit le mode |

**Générer un relevé n'est pas transformé en acte financier.** La consigne §18 le
demandait ; c'était déjà la règle du système documentaire, et elle s'applique
telle quelle.

Éprouvé en production : 4 `EXPORT` et 3 `ACCESS_DENIED` tracés sur le contrat de
recette, sans détail technique.

---

# 14. Migrations, tables, sauvegarde

## 14.1 Aucune migration

La dernière migration reste la **096**. Aucune n'a été créée : le lot n'ajoute ni
table, ni colonne, ni fonction, ni policy, ni contrainte.

`Plan 02` §16.6 l'avait prévu : « **24 · Synthèse de location — Aucune
migration.** Respiration après deux lots lourds, et démonstration visible ».

**Aucune fonction ni policy existante n'a été réécrite**, ce qui écarte par
construction le défaut découvert au LOT 22 sur `rentals_update` — une policy
reprise depuis sa migration d'origine plutôt que depuis sa dernière version.

## 14.2 Aucune sauvegarde préalable n'était requise

La consigne §2 rend la sauvegarde **bloquante** si une migration de données ou
une transformation risquée est nécessaire. **Aucune ne l'était** : le lot ne
transforme aucune donnée existante.

L'outil `npm run backup:snapshot` reste disponible et inchangé.

## 14.3 Le périmètre reste à 54 tables

Aucune table persistante n'a été créée (§5.2), donc `backup_scope()` n'a pas
bougé. `npm run verify:backup` a été rejoué et le cycle complet — sauvegarde →
réinitialisation → restauration — reste valide.

---

# 15. Tests

## 15.1 Contrôles unitaires — `npm run test`

**334 contrôles**, 17 fichiers. Le lot en ajoute **15** au fichier
`src/lib/documents/document.test.ts` :

**Huit rendus PDF**, un par branche du modèle :

| Cas | Ce qu'il éprouve |
| --- | --- |
| Complet — longue durée | Les sept chapitres garnis |
| Durée fixée | Le chapitre « Périodes » **disparaît** |
| Contrat sans facture ni règlement | Le **cas vide**, chaque section le dit |
| Sans factures **ni** règlements lisibles | 🟥 Sections **fermées et nommées**, aucune synthèse |
| Sans droit sur les règlements | Total facturé affiché, réglé et solde **absents** |
| Sans montants ni identité du client | Deux blocs simultanément fermés |
| Véhicules non lisibles | « Non communiqué », jamais un tiret |
| Location terminée | La mention « relevé intermédiaire » **disparaît** |

🟥 **Pourquoi huit et pas deux.** La panne du 22/08/2026 est née d'une branche
jamais rendue : un `fontStyle: 'italic'` sans police italique interrompait le
rendu, mais **seulement** pour un lecteur dont les droits produisaient une
section vide. Ce document comporte plus d'états que toute autre pièce du cycle.

**Sept contrôles sur `totals()`**, module pur :

| Cas | Attendu |
| --- | --- |
| Factures émises + règlements validés | 1 500 000 · 500 000 · 1 000 000 |
| Brouillon | Écarté du total, **et annoncé** — 1 facture, 300 000 |
| **Trois factures de période** | 1 500 000 — jamais une quatrième créance |
| Facture soldée | Solde **nul**, jamais négatif |
| Contrat jamais facturé | Trois **zéros**, et non trois `null` |
| Règlements illisibles | `paid` et `balance` à **`null`** |
| Mélange émise / brouillon | Seule l'émise compte |

**Et le balayage structurel de confidentialité**, qui couvre désormais les deux
fichiers nouveaux.

## 15.2 Recette applicative — `npm run verify:statement`

**89 contrôles** contre la production, avec de vraies sessions — jeton Supabase,
cookie applicatif, appels PostgREST directs, PDF réels.

Le décor : trois véhicules fournis **portant un coût**, un contrat de longue
durée avec **avenant de remplacement**, **régime mensuel**, **avenant de
prolongation au tarif convenu**, **cinq périodes**, **trois segments**, **deux
véhicules**, **trois tarifs**, une période traversant **plusieurs segments** ;
cinq factures — trois émises, une annulée, une brouillon ; trois règlements dont
un annulé ; et un contrat à durée fixée, rendu, contrôlé, facturé.

| § | Ce qui est éprouvé |
| :-: | --- |
| 1 | Le décor, et que la chronologie porte bien **deux véhicules et plusieurs tarifs** |
| 2 | Cinq factures, trois règlements, deux régimes |
| 3 | 🟩 L'écran **dit** que le relevé récapitule et **ne crée aucune facture** |
| 4 | 🟥 **Le test central** — photographie avant / après, huit contrôles |
| 5 | Facturé 1 200 000 · réglé 500 000 · solde 700 000 · **aucune facture globale** |
| 6 | 🟥 Confidentialité — appel direct, page, charge utile, PDF |
| 7 | 🟥 **La porte dérobée**, fermée — et le PDF amputé est plus court |
| 8 | DEC-024 — les trois modes refusés, les refus et exports **tracés** |
| 9 | Le profil qui voit les factures mais pas les règlements |
| 10 | Durée fixée · location **en cours** · contrat inexistant → 404 |
| 11 | Responsive à 360, 768 et 1440 px |
| 12 | Catalogue **inchangé**, aucune capacité « relevé » créée, aucune erreur navigateur |

## 15.3 Tests négatifs

| Refus attendu | Obtenu |
| --- | --- |
| Lecteur sans `download` ni `print` → `?mode=download` | **403** |
| Idem → `?mode=print` | **403** |
| Idem → `?mode=preview` | **403** |
| Contrat inexistant | **404**, sans rien révéler |
| Exploitation → factures par PostgREST | **0 ligne** |
| Exploitation → règlements par PostgREST | **0 ligne** |
| Profil `sansReglement` → règlements | **0 ligne** |
| Producteur du relevé → coûts gelés | **0 ligne** |
| Producteur du relevé → tarifs fournisseurs | **0 ligne** |
| Une capacité `*statement*`, `*summary*`, `*releve*` au catalogue | **aucune** |
| Une facture « globale » sans période sur le contrat | **aucune** |

## 15.4 🟥 Le test d'absence d'effet financier

C'est la garantie centrale du lot, et elle est éprouvée séparément par huit
contrôles, détaillés en §6.3.

---

# 16. Non-régression

**Dix-sept recettes, 1 503 contrôles, aucun échec** — toutes contre
https://adikom-pilot.vercel.app.

| Recette | Lot | Contrôles | Échecs |
| --- | :-: | :-: | :-: |
| `verify:responsive` | — | **389** | 0 |
| `verify:capabilities` | — | **217** | 0 |
| `verify:ajustements` | — | **95** | 0 |
| **`verify:statement`** | **24** | **91** | **0** |
| `verify:audit` | — | **82** | 0 |
| `verify:billing` | 23 | **77** | 0 |
| `verify:amendments` | 22 | **74** | 0 |
| `verify:groups` | — | **73** | 0 |
| `verify:supplier-rates` | 21 | **61** | 0 |
| `verify:pilotage` | — | **60** | 0 |
| `verify:production` | — | **56** | 0 |
| `verify:customer-invoices` | — | **52** | 0 |
| `verify:catalog` | 20 | **49** | 0 |
| `verify:password-reset` | 19 | **43** | 0 |
| `verify:customer-payments` | — | **36** | 0 |
| `verify:rentals` | — | **34** | 0 |
| `verify:users` | — | **14** | 0 |

`verify:backup` a été rejouée séparément (§14.3) : **49 contrôles**, cycle
sauvegarde → réinitialisation → restauration réel, périmètre confirmé à
**54 tables**.

**Les LOTS 19 à 23 restent fonctionnels.** Aucune recette n'a été modifiée pour
faire accepter la nouvelle architecture : les deux seules recettes touchées
(`verify:billing`, `verify:backup`) l'ont été sur leur **attente**, jamais sur
leur **assertion** — et dans les deux cas parce qu'elles affirmaient le
contraire de ce qu'elles constataient par ailleurs (§17.3, §17.4).

## 16.1 🟥 Les recettes ne se lancent jamais en parallèle

Constaté pendant ce lot : deux passages simultanés créent chacun leurs comptes
`recette.*`, et le nettoyage du premier **supprime les sujets du second**, qui
échoue ensuite sur « Invalid login credentials » — en accusant
l'authentification, très loin de la cause.

La suite de non-régression de ce lot est donc **strictement séquentielle**, dans
un seul script de fond.

---

# 17. Corrections découvertes

## 17.1 🟥 Le seed de démonstration n'atteignait jamais les contrats existants

**Le défaut.** La boucle des réservations de `seed-demo.mjs` fait `continue` dès
que la réservation existe déjà. Tout ce qui la suivait — dont la mise en place du
régime de facturation et la facture de période du LOT 23 — ne s'exécutait donc
**qu'au premier passage, sur une base vierge**.

**Ce que cela coûtait.** Le règlement que le LOT 24 ajoute au contrat de longue
durée n'aurait **jamais** rejoint le jeu de démonstration en place. Le seed
annonçait « 0 élément créé » — et il avait raison, il n'avait rien fait. **Aucune
erreur n'était signalée.**

**La correction.** Le bloc est extrait en `seedLongTermBilling(admin, ids, item,
rentalId)`, appelée **des deux côtés** du `continue`. Chaque geste garde sa propre
garde d'idempotence : le découpage à la présence de périodes, la facture et le
règlement à leur marqueur. Rejouée, la fonction ne crée rien de plus.

C'est la même leçon que « la mise en place ne doit jamais échouer en silence »,
sous une autre forme : ici elle ne **s'exécutait** pas.

## 17.2 Un commentaire citait le nom d'une table confidentielle

Voir §12.4. Le balayage structurel a refusé la rédaction, et il avait raison.

## 17.3 `verify:backup` attendait un refus au chronomètre

**Le défaut.** Le contrôle « Une confirmation approximative ne réinitialise rien »
posait un `waitForTimeout(2000)` puis cherchait le message de refus. Sur une
fonction serverless froide, l'action serveur répond plus tard : le contrôle
échouait **en annonçant qu'une confirmation approximative réinitialise** —
l'exact contraire de ce qui se passait.

**Ce qui le prouve.** Le contrôle **suivant**, dans la même recette, constatait
qu'**aucune donnée n'avait été supprimée**. Les deux se contredisaient, et c'est
la recette qui avait tort.

**La correction.** Le refus s'attend désormais sur 45 secondes, comme l'acte
voisin — la réinitialisation réelle — attend déjà son effet sur 90. L'assertion
n'a pas changé ; seule la patience.

⚠ **Ce défaut préexistait au lot** : il a été constaté sur la production au SHA
`04ea1a5`, sur du code que le LOT 24 n'a pas touché.

## 17.4 🟥 Une requête en erreur n'est pas un refus de lecture

**Le défaut, et il est du même genre que §12.4 et §17.5.**

La colonne du coût gelé s'appelle `amount` ; la recette interrogeait
`locked_cost_amount`. PostgREST refusait la requête, `data` revenait `null`, et
**trois contrôles lisaient ce `null` comme « aucune ligne »** :

| Contrôle | Ce qu'il croyait prouver | Ce qu'il prouvait |
| --- | --- | --- |
| « Le producteur du relevé n'obtient AUCUN coût gelé » | Que RLS refuse | **Que la requête était malformée** |
| La photographie financière | Qu'aucun coût gelé n'a bougé | **Qu'elle comparait deux fois « rien »** |
| « Le profil privilégié lit RÉELLEMENT le coût » | — | **Il a échoué, et c'est lui qui a découvert les deux autres** |

**Ce qui l'a attrapé.** La garde d'anti-vacuité que ce lot venait d'ajouter —
exiger que le profil privilégié lise effectivement le coût avant de comparer les
deux documents. Sans elle, les trois contrôles auraient continué à passer
indéfiniment, et le rapport aurait affirmé une confidentialité que rien
n'éprouvait.

**La correction.** Les trois lectures **nomment l'erreur** : un `data` vide ne
vaut preuve que s'il vient **sans** erreur. Après correction, la garantie tient
et se lit — 3 coûts gelés lisibles par le profil privilégié, 0 octet d'écart
entre les deux relevés.

## 17.5 🟥 Un balayage d'octets dans un PDF ne peut pas échouer

**Le défaut, présent aussi dans les recettes des LOTS 21, 22 et 23.**

Elles cherchent le montant du coût fournisseur dans les octets du fichier
produit. **Mesure faite** : `@react-pdf` comprime ses flux (`FlateDecode`) et
**sous-ensemble ses polices** — le texte est encodé par index de glyphe. Ni le
coût, ni le titre, ni le numéro du contrat n'y sont retrouvables, **même après
décompression**.

Ce contrôle **ne peut donc pas échouer**. Il passerait sur un document qui
porterait le coût en gros titre. Ce n'est pas un contrôle, c'est un décor.

**La correction** est celle décrite en §21.2 : la comparaison différentielle,
gardée par l'anti-vacuité. Le balayage d'octets a été **retiré** de la recette
du LOT 24 plutôt que conservé pour la forme.

⚠ **Les recettes des LOTS 21 à 23 le portent encore.** Elles n'ont pas été
modifiées ici : leur confidentialité repose, comme celle du LOT 24, sur la
barrière **structurelle et typée** (§12.3), qui elle fonctionne. Le contrôle
d'octets y est inutile, non faux — mais il donne une impression de garantie qu'il
ne fournit pas. Le corriger dans les trois recettes est une dette nommée, hors
périmètre de ce lot.

## 17.6 Le nettoyage ne vérifiait pas son propre effet

**Le défaut.** `purgeStrays` ignore l'erreur de chaque suppression — à dessein :
un ordre partiellement inapplicable ne doit pas interrompre les suivants. Mais
une défaillance passagère laissait alors des résidus **sans que rien ne le
dise** : trois véhicules, deux contrats et quatre segments sont restés en
production après un passage dont **chaque ordre, rejoué à la main, s'exécutait
sans broncher**.

Le contrôle final l'a bien signalé — « 3 véhicule(s) » — mais après coup.

**La correction.** Le balayage se rejoue tant qu'il reste quelque chose, trois
passages au plus, et ce qui subsiste est nommé. Les résidus du passage fautif
ont été retirés, et la base vérifiée.

## 17.7 Deux recettes lancées en parallèle se détruisent

Constaté pendant la mise au point : deux passages simultanés créent chacun leurs
comptes `recette.*`, et le nettoyage du premier **supprime les sujets du
second** — qui échoue ensuite sur « Invalid login credentials », en accusant
l'authentification.

Ce n'est pas un défaut du SaaS, mais une règle d'exécution : **les recettes ne se
lancent jamais concurremment.** La suite de non-régression de ce lot est
séquentielle pour cette raison.

---

# 18. Données de démonstration

## 18.1 Ce qui existait déjà, et a été réemployé

Le contrat **`LOC-2026-000444`** — longue durée, cadence mensuelle, trois
périodes, la première facturée `FAC-C-2026-000248` pour 544 000 KMF, deux
périodes restant facturables. **Aucun contrat nouveau n'a été créé.**

## 18.2 Ce qui a été ajouté, et pourquoi

**Un règlement partiel de 200 000 KMF** sur cette facture.

Sans lui, le relevé de démonstration affichait un **historique de règlements
vide** — et c'est précisément le chapitre pour lequel la Direction a demandé ce
document. Le solde y valait le facturé, ce qui ne démontrait rien de la
soustraction.

**Partiel à dessein** : facturé 544 000 · réglé 200 000 · solde 344 000. Les
trois montants de la synthèse se lisent distinctement. Une facture soldée les
aurait ramenés à deux.

## 18.3 Idempotence et nettoyage

Le règlement porte le marqueur `DEMO_NOTE [R8-REG1]`. Il se garde à **son propre
marqueur**, non à celui de la facture (§17.1). Rejoué, le seed annonce « 0 élément
créé ». `clean-demo.mjs` le balaye déjà : il filtre `customer_payments` sur
`notes LIKE DEMO_NOTE%`, sans modification.

---

# 19. Responsive et UX

## 19.1 Emplacement

Le relevé est la **cinquième pièce de la carte « Documents »** de la fiche de
location, séparée des quatre autres par un filet. **Aucune entrée de navigation
nouvelle** : le relevé porte sur un contrat, et se produit depuis ce contrat.

La description de la carte énumère ce qui est réellement disponible, et le relevé
y figure **toujours** — contrairement au bon de départ ou au PV de retour, il ne
dépend d'aucun événement du cycle.

## 19.2 Ce que l'écran dit avant qu'on clique

> « Récapitule les factures et les règlements existants de ce contrat. Il ne crée
> aucune facture ni aucune créance nouvelle. »

Sans cette phrase, un exploitant cliquerait en croyant établir la « facture
globale » que le client réclame, et s'étonnerait ensuite de ne pas la retrouver
dans la liste des factures.

La note de l'onglet « Facturation » posée par DEC-047 cesse d'annoncer un lot à
venir : elle **indique où produire le relevé**.

## 19.3 Trois largeurs

| Largeur | Débordement horizontal | Portée du relevé lisible |
| --- | :-: | :-: |
| 360 px | **aucun** | oui |
| 768 px | **aucun** | oui |
| 1440 px | **aucun** | oui |

**Le PDF n'est pas une capture de l'écran responsive.** Il garde sa mise en page
documentaire A4, ses en-têtes répétés à chaque page, sa pagination « Page n / N »,
et ses sections qui ne se coupent pas au milieu (`wrap={false}`).

---

# 20. Déploiement

| | |
| --- | --- |
| Branche | `main` |
| Poussé sur | `moraproentrepreneur-hash/ADIKOM-PILOT` |
| Déploiement Vercel | **`READY`** |
| **SHA réellement déployé** | **`41c8f41`** — vérifié par l'API REST Vercel |
| Production | https://adikom-pilot.vercel.app |

Trois déploiements se sont succédé, tous `READY` :

| SHA | Ce qu'il porte | État |
| --- | --- | :-: |
| `7f19a62` | Le relevé, ses tests, la documentation | `READY` |
| `f998a6c` | Le contrôle différentiel de confidentialité · deux recettes durcies | `READY` |
| **`41c8f41`** | La correction des trois lectures en erreur · le nettoyage qui se vérifie | **`READY`** |

**Le SHA déployé correspond exactement au SHA éprouvé** : la recette finale
(91 contrôles) a été passée contre `41c8f41`.

⚠ Les deux derniers commits ne touchent **aucun code applicatif** hors la
suppression d'une branche morte du modèle PDF : ce sont des corrections de
**recettes**. Le relevé livré est celui de `7f19a62`, éprouvé à nouveau sous
`41c8f41`.

---

# 21. Recette de production

`npm run verify:statement` contre https://adikom-pilot.vercel.app —
**91 contrôles, aucun échec.**

## 21.1 Les points exigés, un par un

| # | Exigé par la consigne §21 | Résultat |
| :-: | --- | --- |
| 1 | Relevé d'une location à **durée fixée** | ✅ PDF valide, chapitre « Périodes » absent |
| 2 | Relevé d'une **longue durée** | ✅ 5 périodes, 3 segments, 2 avenants |
| 3 | Plusieurs **périodes facturables** | ✅ 5 périodes ouvertes |
| 4 | Plusieurs **factures** sur le même contrat | ✅ 5 factures |
| 5 | Plusieurs **règlements** | ✅ 3 règlements |
| 6 | Facture **partiellement réglée** | ✅ F2 — solde 300 000 |
| 7 | Facture **totalement réglée** | ✅ F1 — solde nul |
| 8 | Facture **non réglée** | ✅ F3 — solde entier |
| 9 | Facture **annulée** non comptée | ✅ F5 écartée à la source |
| 10 | **Brouillon** traité selon les règles existantes | ✅ F4 montrée, annoncée, hors total |
| 11 | **Total facturé** correct | ✅ **1 200 000 KMF** |
| 12 | **Total réglé** correct | ✅ **500 000 KMF** |
| 13 | **Solde** correct | ✅ **700 000 KMF** |
| 14 | Absence de **double comptage** | ✅ aucune facture sans période |
| 15 | Chronologie à **un seul véhicule** | ✅ contrat à durée fixée |
| 16 | Chronologie avec **remplacement** | ✅ 2 véhicules distincts |
| 17 | Avenant de **remplacement** | ✅ `replace_rental_vehicle` |
| 18 | Avenant de **prolongation** | ✅ `extend_rental`, tarif convenu |
| 19 | **Changement de tarif** historique | ✅ 3 tarifs conservés |
| 20 | Plusieurs **segments dans une période** | ✅ période n° 2 |
| 21 | Relevé d'une location **en cours** | ✅ état `EXTENDED`, PDF produit |
| 22 | Relevé d'une location **terminée** | ✅ contrat rendu et contrôlé |
| 23 | **Confidentialité** des coûts fournisseurs | ✅ §21.2 |
| 24 | Absence de **commission / marge** | ✅ page et charge utile |
| 25 | Permission de **consultation** | ✅ `rental.rentals.view` exigée |
| 26 | Permission de **téléchargement** | ✅ 403 sans `.download` |
| 27 | Permission d'**impression** | ✅ 403 sans `.print` |
| 28 | Impossibilité de **contourner** les droits | ✅ §21.3 |
| 29 | **API directe** | ✅ PostgREST et route documentaire |
| 30 | **PDF valide** | ✅ `%PDF-`, 66 Ko, `application/pdf` |
| 31 | Aucune **facture créée** | ✅ 6 → 6 |
| 32 | Aucun **mouvement de trésorerie** | ✅ 550 000 → 550 000 |
| 33 | Aucun **solde modifié** | ✅ facturé et réglé identiques |
| 34 | **Responsive** | ✅ 360 / 768 / 1440 px |
| 35 | **Sauvegarde / restauration** | ✅ `verify:backup`, 54 tables |
| 36 | **Aucun résidu** | ✅ §21.4 |

## 21.2 🟥 La confidentialité, prouvée par différence

Le contrôle décisif n'est pas qu'un profil sans droit ne voie pas le coût —
RLS s'en charge, et le prouver ne dit rien du document. C'est qu'un profil
**qui a le droit de le lire** n'en obtienne rien par le relevé :

```
  Profil « avecCout » — rental.pricing.supplier.view
    lit RÉELLEMENT le coût gelé ............ 3 coût(s) lisible(s)
    son relevé ............................. 66 Ko
  Profil « releve » — sans cette capacité
    coûts lisibles ......................... 0 ligne, sans erreur
    son relevé ............................. 66 Ko
                                             ────────────────────
    écart .................................. 0 octet
```

**Le relevé est identique pour les deux.** Le document ne compose donc jamais le
coût, quelle que soit l'habilitation de qui le produit.

## 21.3 🟥 La porte dérobée, fermée

| Profil `exploitation` — voit la location, pas sa facturation | Résultat |
| --- | --- |
| Factures par appel PostgREST direct | **0 ligne** |
| Règlements par appel PostgREST direct | **0 ligne** |
| Montants de facture dans la charge utile de sa page | **absents** |
| Son relevé | **remis** — c'est une pièce du contrat |
| Poids de son relevé | **58 Ko** contre 66 Ko : les sections sont fermées |

Le profil `sansReglement` complète la démonstration : il voit les 5 factures,
**aucun règlement**, et son relevé se produit sans total réglé ni solde.

## 21.4 Aucun résidu

```
  Aucun résidu de recette ................. 0 véhicule(s)
  Le jeu de démonstration est intact ...... empreinte identique
  Comptes « recette.* » en base ........... AUCUN
  Catalogue ............................... 197 capacités
  Périmètre de sauvegarde ................. 54 tables
```

Vérifié une seconde fois, après la recette, par lecture directe de la base.

---

# 22. Limites

- **Le détail des lignes est celui des factures.** Une facture sans ligne ne
  produit pas de bloc de détail.
- **Un règlement rattaché à une facture annulée n'est pas remonté** : sa facture
  ne porte plus de créance, et l'afficher aurait montré un encaissement sans la
  dette correspondante — donc un solde négatif.
- **Le relevé ne porte ni incidents ni maintenances.** Ce sont des faits
  d'exploitation ; ce qui en découle pour le client passe par une ligne de
  facture, et se lit donc au chapitre des factures.
- **Aucun export tabulaire.** `rental.rentals.export` continue de gouverner la
  liste des locations ; rien de ce lot ne l'a touchée.
- **Le relevé ne porte qu'un contrat.** Un récapitulatif *tous contrats* d'un
  client n'est pas demandé, et la fiche client porte déjà ses onglets Factures et
  Règlements.
- **Les recettes des LOTS 21, 22 et 23 portent encore un balayage d'octets du
  PDF** qui ne peut pas échouer (§17.5). Leur confidentialité tient à la
  barrière structurelle, qui elle fonctionne ; mais ce contrôle donne une
  impression de garantie qu'il ne fournit pas. **Dette nommée, hors périmètre de
  ce lot** — la corriger suppose de rejouer les trois recettes.
- **Le relevé n'est pas éprouvé sur un contrat sans aucun segment.** Le cas
  n'existe pas depuis le LOT 22, qui garantit qu'une location porte au moins un
  segment ; la section disparaîtrait proprement, et le test unitaire le couvre.

---

# 23. Points restés ouverts

| Réf. | Sujet | État |
| --- | --- | --- |
| 🟥 **A-7** | Barème des pénalités | **Non tranché.** Aucun barème, aucun pourcentage, aucune capacité, aucune ligne automatique |
| 🟥 **DEC-008** | Durée facturable | **Non tranché.** La quantité reste saisie ; le relevé ne recalcule rien |
| 🟥 **P-2** | Coût interne des véhicules ADIKOM | **Non tranché.** Sans effet sur un document client |
| 🟥 **Partenariat** | Conditions financières des véhicules partenaires | **Non tranché** |
| 🟥 **P-5** | Fournisseur des coûts de services | **Non tranché.** `service_variant_costs` non touchée |
| 🟥 **Plan 02 §5.7 / DEC-002** | — | **Inchangé** |

**Aucun de ces points n'a été bloquant** pour une fonctionnalité obligatoire du
LOT 24.

---

# 24. Commits

| SHA | Message |
| --- | --- |
| **`7f19a62`** | `feat: releve global de location, recapitulatif sans creance nouvelle` |
| **`f998a6c`** | `fix: un balayage d octets dans un PDF ne peut pas echouer — le prouver par la difference` |
| **`41c8f41`** | `fix: une requete en erreur n est pas un refus de lecture` |
| *(celui-ci)* | `docs: le rapport du LOT 24 — synthese et releve global de location` |

---

# 25. Conclusion

Le LOT 24 ne livre **aucune table, aucune migration, aucune capacité**. Il livre
un document — et la preuve qu'il ne fait rien d'autre que lire.

**La « facture globale » n'est pas une facture.** C'était le piège que le Plan 02
§3.3 avait nommé et que le LOT 23 avait laissé ouvert : une seconde créance sur
des périodes déjà facturées, découverte au relevé bancaire des semaines plus
tard. Le document existe désormais, il récapitule, et il le dit deux fois —
avant son contenu et après.

**Ce qu'il ne fait pas est éprouvé, pas affirmé.** Une photographie financière
complète, avant et après les trois modes de production, comparée en décomptes, en
sommes et en états : rien n'a bougé. Et aucune facture couvrant tout le contrat
n'existe, ce qui ferme la question à la source.

**Le relevé agrège sans ouvrir.** C'était le risque propre au lot : un document
qui rassemble cinq domaines pouvait devenir la porte par laquelle un exploitant
obtiendrait la facturation que son profil lui refuse. Chaque section est lue sous
sa propre capacité, ce qui n'est pas autorisé n'est pas lu, et le bloc absent est
nommé plutôt que tu.

**Et trois contrôles qui ne prouvaient rien ont été démasqués.** Le balayage
d'octets d'un PDF comprimé, qui ne peut pas échouer. Trois lectures dont l'erreur
de requête passait pour un refus de RLS. Un nettoyage qui laissait des résidus
sans le dire. Les deux premiers ont été découverts par la garde d'anti-vacuité
que ce lot venait d'ajouter — un contrôle dont la seule fonction est de refuser
qu'une comparaison compare deux fois « rien ».

**Aucune règle métier n'a été inventée.** A-7 n'a toujours pas de barème, et le
relevé ne calcule aucune pénalité. DEC-008 n'a toujours pas de règle d'arrondi,
et le relevé ne recalcule aucun montant : la facture émise reste la vérité
financière.

---

## LOT 24 — TERMINÉ

**CODE TESTÉ** — 334 contrôles unitaires, dont **15 nouveaux** ·
17 fichiers de test · lint, typecheck et build verts

**GITHUB À JOUR** — `41c8f41` sur `main`

**VERCEL À JOUR** — `41c8f41`, état `READY`

**PRODUCTION VALIDÉE** — 17 recettes, **1 503 contrôles** (389 + 217 + 95 + 91 +
82 + 77 + 74 + 73 + 61 + 60 + 56 + 52 + 49 + 43 + 36 + 34 + 14) contre
https://adikom-pilot.vercel.app, **aucun échec, aucun résidu**

**SAUVEGARDE ÉPROUVÉE** — `verify:backup`, 49 contrôles, cycle réel
sauvegarde → réinitialisation → restauration, périmètre **inchangé à 54 tables**

**CATALOGUE INCHANGÉ** — **197 capacités**, aucune créée

**AUCUNE MIGRATION** — dernière migration toujours **096**

**RAPPORT CRÉÉ** — le présent document

---

*ADIKOM PILOT — SaaS interne de gestion et de pilotage — ADIKOM Technology & Travel*
