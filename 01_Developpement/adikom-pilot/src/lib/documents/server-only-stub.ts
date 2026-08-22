/**
 * Remplaçant de `server-only` pour les tests.
 *
 * Le paquet `server-only` lève une erreur dès qu'il est importé hors d'un
 * contexte serveur React. Les tests s'exécutent sous Node, où cette protection
 * n'a pas d'objet : la remplacer permet d'éprouver le moteur documentaire sans
 * affaiblir la garantie en production, où l'alias n'existe pas.
 */
export {}
