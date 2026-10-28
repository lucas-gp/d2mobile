/**
 * Budgets de temps des tests de performance (temps réel) : multipliés par `PERF_SLACK` (défaut 1), que la CI règle plus haut, ses
 * machines partagées étant plus lentes et irrégulières qu'un poste de développement. Un budget dépassé en local reste une régression.
 */
export const PERF_SLACK = Math.max(1, Number(process.env.PERF_SLACK) || 1);

/** Budget en millisecondes, marge de la machine comprise */
export const perfMs = (ms: number): number => ms * PERF_SLACK;
