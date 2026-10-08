-- =============================================================================
-- ADIKOM PILOT — 114 · Modes de paiement : Mvola, Holo, Wakati
-- LOT 28 — A-9 (Plan 02 §2.1) · décision D-2 (DEC-055, 8 octobre 2026)
--
-- MIGRATION ISOLÉE, SANS AUTRE CONTENU (Plan 02 §9.5) : une valeur ajoutée par
-- `alter type … add value` ne s'emploie pas dans la transaction qui l'ajoute.
-- La migration suivante, qui la consomme, s'applique dans une autre.
--
-- D-2 — `payment_method` est UNE SEULE énumération, partagée par les règlements
-- clients, les règlements fournisseurs et les paiements du point de vente. Les
-- trois modes deviennent donc disponibles PARTOUT : une seconde énumération, ou
-- une liste filtrée, n'aurait répondu à aucun besoin exprimé.
-- =============================================================================

alter type public.payment_method add value if not exists 'MVOLA';
alter type public.payment_method add value if not exists 'HOLO';
alter type public.payment_method add value if not exists 'WAKATI';
