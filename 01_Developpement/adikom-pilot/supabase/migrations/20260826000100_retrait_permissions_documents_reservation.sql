-- =============================================================================
-- ADIKOM PILOT — 037 · Retrait de deux capacités documentaires sans objet
-- Arbitrage ADIKOM du 26 août 2026
--
-- CE QUI EST RETIRÉ
--
--   rental.reservations.download
--   rental.reservations.print
--
-- POURQUOI
--
-- La migration 032 les avait créées en même temps que les quatre autres
-- capacités du cycle. Sa propre note écartait pourtant tout document de
-- réservation — « une réservation n'est pas un engagement remis au client » —
-- et le Lot 8 l'a confirmé : le registre documentaire ne connaît que le
-- contrat, le bon de départ et le procès-verbal, tous trois rattachés à une
-- LOCATION.
--
-- Ces deux codes étaient donc attribuables sans rien débloquer. C'est
-- exactement ce que CLAUDE.md §19 bis interdit :
--
--   « Une permission ne se crée que si la fonctionnalité correspondante existe
--     réellement ou est explicitement prévue. Le catalogue représente les
--     capacités réelles du SaaS. »
--
-- Un catalogue qui promet une capacité inexistante trompe celui qui attribue
-- les droits : il croit accorder quelque chose, et n'accorde rien.
--
-- Catalogue : 154 → 152.
--
-- CE QUI N'EST PAS TOUCHÉ
--
--   rental.reservations.export   — la liste des réservations s'exporte
--   rental.rentals.export        — la liste des locations s'exporte
--   rental.rentals.download      — les trois documents se téléchargent
--   rental.rentals.print         — les trois documents s'impriment
--
-- POURQUOI UNE SUPPRESSION, ET NON UNE DÉSACTIVATION
--
-- Le principe de conservation (CLAUDE.md §22) protège les DONNÉES MÉTIER —
-- un client, un véhicule, une location, dont l'historique doit rester lisible.
-- Une ligne de catalogue n'est pas une donnée métier : c'est la déclaration
-- d'une capacité du logiciel. Déclarer une capacité qui n'existe pas ne se
-- corrige pas en l'archivant, mais en cessant de la déclarer.
--
-- La suppression n'est cependant sûre que si PERSONNE ne la détient. Les deux
-- garde-fous ci-dessous le vérifient au moment de l'exécution, et non lors de
-- l'écriture : entre les deux, un droit a pu être attribué.
--
-- DÉCLARATION LUE PAR LES TESTS
--
-- Les lignes ci-dessous ne sont pas décoratives. `permissions.test.ts` rejoue
-- les migrations pour reconstituer le catalogue et le comparer aux constantes
-- TypeScript ; sans elles, il continuerait de voir ces deux codes déclarés par
-- la migration 032 et exigerait qu'ils restent exposés. Le retrait est donc
-- ANNONCÉ, plutôt que déduit d'un `delete` que le lecteur devrait interpréter.
--
-- CATALOGUE: RETRAIT rental.reservations.download
-- CATALOGUE: RETRAIT rental.reservations.print
-- =============================================================================

do $$
declare
  cibles text[] := array['rental.reservations.download', 'rental.reservations.print'];
  detenteurs int;
  total int;
begin
  -- --- Garde-fou 1 : aucun utilisateur ne détient ces droits ----------------
  --
  -- Les supprimer alors qu'ils sont attribués reviendrait à retirer
  -- silencieusement une capacité à quelqu'un. La cascade de la clé étrangère
  -- le ferait sans un mot ; la migration, elle, s'arrête.
  select count(*) into detenteurs
  from public.user_permissions up
  join public.permissions p on p.id = up.permission_id
  where p.code = any(cibles);

  if detenteurs > 0 then
    raise exception
      '% attribution(s) utilisateur portent encore sur ces permissions. '
      'Les retirer relève d''une décision, pas d''une migration.', detenteurs;
  end if;

  -- --- Garde-fou 2 : aucun groupe non plus ----------------------------------
  select count(*) into detenteurs
  from public.group_permissions gp
  join public.permissions p on p.id = gp.permission_id
  where p.code = any(cibles);

  if detenteurs > 0 then
    raise exception
      '% attribution(s) de groupe portent encore sur ces permissions.', detenteurs;
  end if;

  -- --- Retrait ---------------------------------------------------------------
  delete from public.permissions where code = any(cibles);

  -- --- Vérification ----------------------------------------------------------
  --
  -- Le compte est contrôlé ICI, dans la transaction : une migration qui laisse
  -- le catalogue dans un état inattendu doit échouer avant de le figer.
  select count(*) into total from public.permissions;

  if total <> 152 then
    raise exception 'Catalogue attendu à 152 permissions, obtenu %.', total;
  end if;

  -- Les quatre capacités réellement servies par le Lot 8 restent en place.
  if (select count(*) from public.permissions where code in (
        'rental.reservations.export',
        'rental.rentals.export',
        'rental.rentals.download',
        'rental.rentals.print')) <> 4 then
    raise exception 'Une capacité documentaire encore utilisée a disparu du catalogue.';
  end if;
end $$;
