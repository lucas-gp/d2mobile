/**
 * Import de tête des outils en ligne de commande qui jouent ou auditent le jeu (bots, bancs, audits) : active le jeu de règles par défaut
 * (`pd2` si le mod est présent, sinon la base ; `MODS` et `RULESET` respectés) avant que le corps de l'outil ne lise les tables, comme au
 * démarrage du jeu. Sans lui, un outil verrait la base seule : ni le contenu ni les chiffres des mods (compétences, cartes…).
 *
 *   import '../mods/auto';   // premier import de l'outil
 */
import { activateForTools } from './node';

await activateForTools(process.env.RULESET || undefined);
