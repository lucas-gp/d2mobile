/**
 * Avant chaque fichier de test : le jeu de règles par défaut (`pd2` si le mod est présent, la base seule `d2` avec `MODS=`) est activé et
 * les registres gelés (tables comprises), comme au démarrage du jeu (src/main.ts). Une écriture dans une table après l'activation échoue
 * donc aussi dans les tests.
 */
import { activateRuleset, defaultRuleset } from '../src/mods/activate';

await activateRuleset(defaultRuleset(), { freezeTables: true });
