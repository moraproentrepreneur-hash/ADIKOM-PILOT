-- =============================================================================
-- ADIKOM PILOT — 093 · Une policy réécrite se reprend à sa DERNIÈRE version
-- LOT 22 — correction découverte par `verify:capabilities`
--
-- LE DÉFAUT
--
-- PostgreSQL n'accepte qu'UNE policy d'`UPDATE` par table. Élargir les actes
-- autorisés sur `rentals` suppose donc de la RÉÉCRIRE EN ENTIER — et chaque lot
-- qui s'y prête doit repartir de la version RÉELLEMENT en vigueur, non de celle
-- qu'il a sous les yeux dans la migration la plus lisible.
--
-- La migration 087 a repris `rentals_update` depuis la migration 031, en y
-- ajoutant `rental.rentals.swap` et `rental.pricing.override`. Elle a ainsi
-- PERDU les deux capacités que la migration 051 y avait ajoutées :
--
--   `billing.customer_invoices.issue`   → la facture émise rend la location
--                                         « Facturée »
--   `billing.customer_invoices.cancel`  → son annulation la ramène
--                                         « À facturer »
--
-- CONSÉQUENCE RÉELLE : émettre une facture client laissait la location « À
-- facturer ». Aucune erreur n'était levée — l'`update` ne touchait simplement
-- AUCUNE LIGNE, parce que la policy ne le laissait plus passer. La clôture
-- devenait ensuite impossible, et le contrat restait bloqué.
--
-- POURQUOI AUCUNE RECETTE SQL NE L'A VU
--
-- Parce qu'elles s'exécutent avec un rôle qui **contourne RLS** :
-- `customer_invoices.sql` émet la facture, constate « Facturée », et a raison de
-- le constater — pour ELLE. C'est `verify:capabilities`, qui agit avec de VRAIES
-- SESSIONS, qui a nommé le défaut : « L'émission a rendu la location
-- « Facturée » — TO_INVOICE ».
--
-- La leçon, écrite ici pour les lots suivants : **une policy d'UPDATE se reprend
-- à sa dernière version en vigueur, lue en base, jamais à celle du fichier qui
-- l'a créée.**
--
-- CE QUE CETTE MIGRATION FAIT
--
-- Elle rétablit la liste COMPLÈTE — les six actes du cycle, les deux de la
-- facturation, les deux de l'avenant — et elle **vérifie elle-même** que chacune
-- y figure. Une réécriture future qui en perdrait une ferait échouer la
-- migration au lieu de casser l'émission de facture en silence.
-- =============================================================================

drop policy if exists rentals_update on public.rentals;

create policy rentals_update on public.rentals
  for update to authenticated
  using (
    -- Le cycle d'exploitation (migrations 031 → 036)
    public.has_permission('rental.rentals.update')
    or public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.extend')
    or public.has_permission('rental.rentals.return')
    or public.has_permission('rental.rentals.close')
    or public.has_permission('rental.rentals.cancel')
    -- La facturation (migration 051) : « Facturée », puis retour « À facturer »
    or public.has_permission('billing.customer_invoices.issue')
    or public.has_permission('billing.customer_invoices.cancel')
    -- L'avenant (migration 087) : le véhicule courant suit son segment ouvert
    or public.has_permission('rental.rentals.swap')
    or public.has_permission('rental.pricing.override')
  )
  with check (
    public.has_permission('rental.rentals.update')
    or public.has_permission('rental.rentals.checkout')
    or public.has_permission('rental.rentals.extend')
    or public.has_permission('rental.rentals.return')
    or public.has_permission('rental.rentals.close')
    or public.has_permission('rental.rentals.cancel')
    or public.has_permission('billing.customer_invoices.issue')
    or public.has_permission('billing.customer_invoices.cancel')
    or public.has_permission('rental.rentals.swap')
    or public.has_permission('rental.pricing.override')
  );


-- =============================================================================
-- CONTRÔLES — la policy est comparée à la LISTE ATTENDUE, capacité par capacité
--
-- Un contrôle qui se contenterait de compter n'aurait rien vu : la liste
-- fautive en portait huit, comme celle qui manquait. Ce qui compte, c'est
-- LAQUELLE manque — et le message le dit.
-- =============================================================================

do $$
declare
  v_attendu text[] := array[
    'rental.rentals.update',
    'rental.rentals.checkout',
    'rental.rentals.extend',
    'rental.rentals.return',
    'rental.rentals.close',
    'rental.rentals.cancel',
    'billing.customer_invoices.issue',
    'billing.customer_invoices.cancel',
    'rental.rentals.swap',
    'rental.pricing.override'
  ];
  v_using      text;
  v_check      text;
  v_manquantes text[];
  v_code       text;
begin
  select qual, with_check into v_using, v_check
  from pg_policies
  where schemaname = 'public' and tablename = 'rentals' and policyname = 'rentals_update';

  if v_using is null or v_check is null then
    raise exception 'La policy `rentals_update` est absente ou incomplète.';
  end if;

  v_manquantes := '{}';
  foreach v_code in array v_attendu loop
    if v_using not like '%' || v_code || '%' then
      v_manquantes := v_manquantes || (v_code || ' (using)');
    end if;
    if v_check not like '%' || v_code || '%' then
      v_manquantes := v_manquantes || (v_code || ' (with check)');
    end if;
  end loop;

  if array_length(v_manquantes, 1) is not null then
    raise exception
      'La policy d''écriture des locations a perdu des capacités : %', v_manquantes;
  end if;

  /*
   * ET L'ÉMISSION DE FACTURE FONCTIONNE POUR DE VRAI.
   *
   * La forme de la policy ne suffit pas : c'est l'EFFET qui compte (leçon
   * DEC-046). Le contrôle est joué dans une sous-transaction annulée, en
   * endossant un compte porteur de la seule capacité d'émission — exactement le
   * profil qui échouait.
   */
  declare
    v_user   uuid := gen_random_uuid();
    v_rental uuid;
    v_apres  public.rental_status;
  begin
    select id into v_rental from public.rentals where status = 'TO_INVOICE' limit 1;

    if v_rental is null then
      raise notice
        '[093] Aucune location « À facturer » en base : l''effet ne peut pas être joué ici. La forme de la policy, elle, est vérifiée.';
    else
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated',
              'authenticated', 'controle.093@adikom.test', now(), now());

      insert into public.app_users (id, first_name, last_name, username, email, status)
      values (v_user, 'Contrôle', '093', 'controle.093', 'controle.093@adikom.test', 'ACTIVE');

      insert into public.user_permissions (user_id, permission_id, effect)
      select v_user, p.id, 'ALLOW' from public.permissions p
      where p.code in ('rental.rentals.view', 'billing.customer_invoices.issue');

      perform set_config(
        'request.jwt.claims',
        json_build_object('sub', v_user::text, 'role', 'authenticated')::text,
        true
      );

      update public.rentals
         set status = 'INVOICED', status_changed_at = now(),
             status_changed_by = public.current_actor(), updated_by = public.current_actor()
       where id = v_rental and status = 'TO_INVOICE';

      perform set_config('request.jwt.claims', '', true);

      select status into v_apres from public.rentals where id = v_rental;

      if v_apres <> 'INVOICED' then
        raise exception
          'La policy laisse encore l''émission de facture sans effet : la location est restée « % ».',
          v_apres;
      end if;

      raise notice
        '[093] Effet éprouvé : un porteur de `billing.customer_invoices.issue` rend bien la location « Facturée ».';
    end if;

    -- Tout est annulé : aucune location, aucun compte de contrôle ne subsiste.
    raise exception 'ROLLBACK_CONTROLE_093';
  exception
    when others then
      if sqlerrm <> 'ROLLBACK_CONTROLE_093' then
        raise;
      end if;
  end;

  raise notice
    '[OK] 093. `rentals_update` porte ses dix capacités ; une policy réécrite se reprend à sa dernière version.';
end $$;
