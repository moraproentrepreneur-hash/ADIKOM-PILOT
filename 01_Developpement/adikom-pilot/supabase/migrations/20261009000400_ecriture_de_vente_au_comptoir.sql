-- =============================================================================
-- ADIKOM PILOT — 115 · Genre d'écriture : vente au comptoir
-- LOT 28 — Plan 02 §9.5 · décisions C-2 et T-2 (DEC-055, 8 octobre 2026)
--
-- MIGRATION ISOLÉE, SANS AUTRE CONTENU : `POS_SALE` est employé par la
-- migration 117 (5ᵉ origine), dans une autre transaction.
--
-- `POS_SALE` nomme l'ENTRÉE produite par un paiement reçu au comptoir — une
-- écriture PAR PAIEMENT (T-2), du montant ENCAISSÉ, jamais du montant donné.
-- =============================================================================

alter type public.treasury_entry_kind add value if not exists 'POS_SALE';
