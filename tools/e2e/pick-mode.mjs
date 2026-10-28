/**
 * Lot 318: the home screen asks the kind of game first (Normal, Survivals: `[data-act="modetype"][data-type]`), then the game it is
 * played on (`[data-act="mode"][data-mode="<full ruleset id>"]`, the same ids as before), with Back (`[data-act="modeback"]`). Helpers
 * for the e2e scripts; they also work on a home screen in one step (a single kind) and on a kind played on one game only (picked at once).
 */

/** The home screen is shown (either step) */
export const HOME = '[data-act="modetype"], [data-act="mode"]';

/** Kind of a full ruleset id (`pd2+survivals` → `survivals`, `d2` → `normal`) */
export const kindOf = (id) => id.split('+').slice(1).join('+') || 'normal';

/** Go to the second step for this kind (no-op when the screen has one step or is already there) */
export async function openKind(page, kind) {
  const t = await page.$(`[data-act="modetype"][data-type="${kind}"]`);
  if (t) await t.click();
}

/** Back to the first step when the second one is shown */
export async function backToKinds(page) {
  const b = await page.$('[data-act="modeback"]');
  if (b) await b.click();
}

/**
 * Pick a mode by its full ruleset id from the home screen (either step). `opts` goes to the final click (e.g. `{ timeout }`); it throws
 * as `page.click` does when the mode is not offered.
 */
export async function pickMode(page, id, opts = {}) {
  const sel = `[data-act="mode"][data-mode="${id}"]`;
  if (!(await page.$(sel))) {
    await backToKinds(page);
    const t = await page.$(`[data-act="modetype"][data-type="${kindOf(id)}"]`);
    if (t) {
      await t.click();
      // a kind on one game only is picked at once (the screen is gone)
      if (!(await page.$('[data-act="modeback"]'))) return;
    }
  }
  await page.click(sel, opts);
}

/**
 * The first mode offered (the default content, Normal), as clicking the first mode button (`.d2b.main`) did before lot 318; on a home
 * screen without a choice of mode, "Single Player". `{ tap: true }`: taps instead of clicks (touch contexts).
 */
export async function pickFirstMode(page, { tap = false } = {}) {
  const press = async (sel) => {
    const e = await page.$(sel);
    if (!e) throw new Error(`pickFirstMode: no ${sel}`);
    await (tap ? e.tap() : e.click());
  };
  // as `page.click` did, wait for the home screen first
  await page.waitForSelector(`${HOME}, .d2b.main`);
  if (await page.$('[data-act="modetype"]')) {
    await press('[data-act="modetype"]');
    if (!(await page.$('[data-act="modeback"]'))) return;
  }
  if (await page.$('[data-act="mode"]')) return press('[data-act="mode"]');
  await press('.d2b.main');
}

/** The modes offered, `id:name` (the full name, kind included), visiting each kind; the screen is left on the first step */
export async function listModes(page) {
  const kinds = await page.$$eval('[data-act="modetype"]', (bs) => bs.map((b) => [b.dataset.type, b.querySelector('b')?.textContent ?? b.textContent]));
  if (!kinds.length) return page.$$eval('[data-act="mode"]', (bs) => bs.map((b) => `${b.dataset.mode}:${b.querySelector('b')?.textContent ?? b.textContent}`));
  const out = [];
  for (const [type, name] of kinds) {
    await page.click(`[data-act="modetype"][data-type="${type}"]`);
    if (!(await page.$('[data-act="modeback"]'))) throw new Error(`listModes: the kind ${type} picked its game at once`);
    const games = await page.$$eval('[data-act="mode"]', (bs) => bs.map((b) => [b.dataset.mode, b.querySelector('b')?.textContent ?? b.textContent]));
    for (const [id, g] of games) out.push(`${id}:${type === 'normal' ? g : `${g} — ${name}`}`);
    await page.click('[data-act="modeback"]');
  }
  return out;
}
