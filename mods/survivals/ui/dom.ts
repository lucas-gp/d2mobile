/**
 * Small DOM helpers of the mod (the mod imports nothing from the game's interface: ESLint rule `d2m/mod-boundary`) and its style sheet,
 * added once to the page. Displayed texts are written in French and translated by the game's DOM translation layer with the mod's
 * dictionary (i18n/en.json).
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: { cls?: string; text?: string; title?: string; data?: Record<string, string>; style?: Partial<CSSStyleDeclaration> } = {},
  ...children: (Node | string | null | false | undefined)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (attrs.cls) e.className = attrs.cls;
  if (attrs.text !== undefined) e.textContent = attrs.text;
  if (attrs.title) e.title = attrs.title;
  if (attrs.data) for (const [k, v] of Object.entries(attrs.data)) e.dataset[k] = v;
  if (attrs.style) Object.assign(e.style, attrs.style);
  for (const c of children) if (c !== null && c !== false && c !== undefined) e.append(c);
  return e;
}

/** A button: `run` on click (pointer or keyboard) */
export function button(label: string, run: () => void, cls = ''): HTMLButtonElement {
  const b = h('button', { cls: `sv-btn ${cls}`.trim(), text: label });
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!b.disabled) run();
  });
  return b;
}

const CSS = `
.sv-screen { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.78);
  color: #d8c8a0; font-family: inherit; z-index: 60; padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom)); box-sizing: border-box; }
.sv-box { background: #120e0a; border: 2px solid #6a5434; box-shadow: 0 0 0 1px #000, 0 6px 30px #000; max-width: min(96vw, 820px);
  max-height: 100%; overflow: auto; padding: 14px; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; }
.sv-title { color: #e8b04a; font-size: 20px; text-align: center; margin: 0; }
.sv-sub { color: #a89878; font-size: 14px; text-align: center; margin: 0; }
.sv-btn { min-height: 44px; min-width: 44px; padding: 8px 14px; background: #2a2116; color: #e8d8b0; border: 1px solid #7a6440; font: inherit;
  font-size: 15px; cursor: pointer; touch-action: manipulation; }
.sv-btn:disabled { opacity: .45; cursor: default; }
.sv-btn.primary { background: #4a2a10; border-color: #c08a40; color: #ffd890; }
.sv-diff > summary { color: #e8b04a; font-size: 16px; min-height: 32px; cursor: pointer; text-align: left; }
.sv-row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
/* lot 313: minmax(0, 1fr), min-width 0: a card's one-line link (nowrap) no longer widens the column past the screen (390 px: 397 px cards) */
.sv-cards { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); }
.sv-card { min-width: 0; }
/* lot 285: larger cards, the skill's icon on the left (on top in landscape), a tap anywhere on the card */
.sv-card { display: flex; flex-direction: row; align-items: center; gap: 14px; min-height: 104px; text-align: left; padding: 12px 14px;
  background: #1d160e; border: 2px solid #6a5434; color: #e8d8b0; font: inherit; cursor: pointer; touch-action: manipulation;
  -webkit-tap-highlight-color: transparent; }
.sv-card:not(:disabled):hover, .sv-card:focus-visible, .sv-card:active { border-color: #e8b04a; background: #2a1f12; }
.sv-card.picked { border-color: #ffd890; background: #3a2810; }
.sv-card:disabled { cursor: default; }
.sv-card .sv-art { flex: none; font-size: 64px; line-height: 0; color: #e8b04a; }
.sv-card .sv-art .icon { border: 1px solid #8a6a3a; box-shadow: 0 0 0 1px #000; }
.sv-card .sv-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.sv-card .sv-name { color: #ffd890; font-size: 20px; }
.sv-card .sv-tag { color: #8fc0ff; font-size: 13px; }
.sv-card .sv-lvl { color: #c8b890; font-size: 15px; }
.sv-card .sv-desc { color: #b8a888; font-size: 14px; line-height: 1.3; }
/* lot 287: the card's figures (current → next level) and its number (key 1 to 3) */
.sv-card { position: relative; }
.sv-card .sv-key { position: absolute; top: 4px; left: 6px; color: #8a7450; font-size: 12px; line-height: 1; }
.sv-card .sv-figs { display: flex; flex-direction: column; gap: 2px; font-size: 13px; color: #c8b890; }
.sv-card .sv-fig { display: flex; gap: 6px; flex-wrap: wrap; }
.sv-card .sv-fig b { color: #9fe07a; font-weight: normal; }
/* lot 288: what the skill strengthens and opens; banishing a card */
.sv-card .sv-link { font-size: 12px; line-height: 1.25; display: flex; flex-wrap: wrap; gap: .3em; }
.sv-card .sv-boosts { color: #8fd07a; }
.sv-card .sv-opens { color: #d8b060; }
.sv-banishing .sv-card { border-color: #a03a2a; }
.sv-btn.on { border-color: #e06a4a; color: #ffb090; }
.sv-locked .sv-card { opacity: .55; }
.sv-cards-box { width: min(96vw, 900px); }
.sv-count { color: #e8b04a; font-size: 15px; }
@media (orientation: landscape) {
  .sv-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sv-cards.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .sv-card { flex-direction: column; align-items: center; text-align: center; max-height: 300px; overflow: hidden; }
  .sv-card .sv-text { align-items: center; }
}
@media (orientation: landscape) and (max-height: 420px) {
  .sv-box { padding: 8px; gap: 6px; }
  .sv-title { font-size: 17px; }
  .sv-card { flex-direction: row; text-align: left; padding: 8px 10px; gap: 10px; }
  .sv-card .sv-text { align-items: flex-start; }
  .sv-card .sv-art { font-size: 48px; }
  .sv-card .sv-name { font-size: 17px; }
  .sv-card .sv-desc { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 13px; }
  .sv-card .sv-fig + .sv-fig, .sv-card .sv-link { display: none; }
}
/*
 * Lot 305 (owner: "in portrait there is a scroll bar to choose the skills"): compact cards held upright, the three and the buttons
 * without a scroll down to about 412 × 700 (the tag in the card's corner, the text smaller, the description on two lines, two figures,
 * each link on one line, the three buttons on one row)
 */
@media (orientation: portrait) {
  .sv-screen { background: rgba(0,0,0,.9); }
  .sv-cards-box { padding: 8px; gap: 6px; }
  .sv-cards-box .sv-title { font-size: 16px; }
  .sv-cards-box .sv-count { font-size: 13px; }
  .sv-cards { gap: 6px; }
  .sv-card { min-height: 0; padding: 7px 8px 7px 12px; gap: 10px; align-items: flex-start; }
  .sv-card .sv-art { font-size: 46px; margin-top: 3px; }
  .sv-card .sv-text { gap: 1px; }
  .sv-card .sv-tag { position: absolute; top: 6px; right: 8px; font-size: 11px; }
  .sv-card .sv-name { font-size: 16px; padding-right: 52px; }
  .sv-card .sv-lvl { font-size: 12.5px; }
  .sv-card .sv-desc { font-size: 12.5px; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .sv-card .sv-figs { font-size: 12px; flex-direction: row; flex-wrap: wrap; gap: 0 12px; }
  .sv-card .sv-fig:nth-child(n+3) { display: none; }
  .sv-card .sv-link { font-size: 11px; flex-wrap: nowrap; white-space: nowrap; overflow: hidden; max-width: 100%; }
  .sv-cards-box > .sv-row { gap: 6px; flex-wrap: nowrap; }
  .sv-cards-box > .sv-row .sv-btn { min-height: 44px; padding: 4px 6px; font-size: 13px; flex: 1 1 0; min-width: 0; }
  /* lot 308: the opening hand's four cards, a little tighter (no link line) */
  .sv-cards.four .sv-card .sv-link { display: none; }
}
.sv-root { position: absolute; inset: 0; pointer-events: none !important; }
.sv-root > * { pointer-events: none; }
.sv-hub { position: absolute; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; pointer-events: auto !important;
  background: radial-gradient(ellipse at center, rgba(10,8,6,.55), rgba(0,0,0,.85)); color: #d8c8a0;
  padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom)); box-sizing: border-box; }
.sv-hub-box { width: min(94vw, 560px); align-items: stretch; }
.sv-hub .sv-play { min-height: 64px; font-size: 19px; }
.sv-boss-imm { display: block; font-size: 11px; color: #ff9a6a; text-align: center; text-shadow: 0 1px 2px #000; }
/* lot 288: the round just lost, named killer (in the round for 3 s, then on the hub) */
.sv-death { position: absolute; left: 50%; top: 38%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 14px 18px; background: rgba(20, 4, 2, .78); border: 1px solid #8a2a1a; color: #e8c8b0; text-align: center; font-size: 16px; max-width: 90vw; }
.sv-death b { color: #ff6a4a; font-size: 26px; font-weight: normal; }
.sv-death small { color: #b8a080; font-size: 13px; }
/* lot 300: the countdown after a zone's mini-boss (a tap goes on at once) */
.sv-root > .sv-wait { pointer-events: auto; position: absolute; left: 50%; bottom: calc(16% + 40px); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center;
  gap: 2px; min-height: 44px; padding: 8px 18px; background: rgba(12, 8, 2, .72); border: 1px solid #a08040; color: #e8d8b0; font: inherit; font-size: 14px;
  text-align: center; cursor: pointer; max-width: 90vw; }
.sv-wait-n { color: #f0c860; font-size: 34px; font-weight: normal; line-height: 1; }
.sv-wait small { color: #b8a080; font-size: 12px; }
.sv-lost { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; border: 1px solid #6a2a20; background: rgba(60, 14, 10, .55); color: #e0c8b0; font-size: 15px; }
.sv-lost b { color: #f08a6a; font-weight: normal; font-size: 17px; }
.sv-lost .sv-killer, .sv-death .sv-killer, [data-sv-screen="run-end"] .sv-killer { color: #ffb090; display: flex; flex-wrap: wrap; gap: .3em; justify-content: center; }
.sv-hub-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
@media (orientation: landscape) { .sv-hub-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } .sv-hub-box { width: min(94vw, 760px); } }
@media (orientation: landscape) and (max-height: 420px) { .sv-hub .sv-play { min-height: 48px; } .sv-hub-box { gap: 6px; padding: 8px; } }
/* lot 290: the skills taken, a preview with no button (ui/skillstrip.ts): never a touch target */
.sv-skills { position: absolute; left: 50%; transform: translateX(-50%); bottom: max(6px, env(safe-area-inset-bottom)); display: flex;
  gap: 6px; pointer-events: none; z-index: 14; }
/* lot 305 (owner: "I see only 6 learned skills though I have more"): every active skill, 8 a row at most, the rows growing upwards */
.sv-skills { flex-wrap: wrap-reverse; justify-content: center; width: max-content; max-width: min(94vw, 330px); }
.sv-sk { position: relative; width: 36px; height: 36px; font-size: 36px; line-height: 0; border: 1px solid #8a6a3a; box-shadow: 0 0 0 1px #000;
  background: rgba(10,8,6,.7); overflow: hidden; color: #e8b04a; }
.sv-sk .icon { width: 100%; height: 100%; }
.sv-sk-cd { position: absolute; inset: 0; background: conic-gradient(transparent var(--sv-cd, 360deg), rgba(0,0,0,.72) 0); }
.sv-sk.cooling { border-color: #5a4630; }
.sv-sk:not(.cooling) { border-color: #c08a40; }
.sv-sk.nomana .icon { filter: grayscale(1) brightness(.6); }
/*
 * Lot 301 (owner: "useful, but a long list in the middle of the screen"): the run's HUD in the screen's corners, as Diablo II's, small
 * and without boxes. Top right, above the base's minimap (moved down under it): the zone's name, its act and zone n / N. Top centre, one
 * line: the clock, the next event, the pause (its touch area 44 px); the named monsters' bars under it. Top left under the life gauge:
 * the level, the kills, the gold, the live monsters (placed by hud.ts under the gauge wherever the layout put it). Nothing on the field.
 */
.sv-hud { position: absolute; inset: 0; pointer-events: none; z-index: 15; color: #e8d8b0; font-size: 12px; text-shadow: 0 1px 2px #000, 0 0 3px #000; }
.sv-zonebox { position: absolute; top: max(2px, env(safe-area-inset-top)); right: calc(env(safe-area-inset-right, 0px) + 8px); display: flex;
  align-items: flex-start; gap: 8px; max-width: 64vw; }
.sv-ztitle { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.15; min-width: 0; padding-top: 2px; }
.sv-zname { font-family: 'Cinzel', serif; font-weight: normal; font-size: 14px; color: #e8c878; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; max-width: 100%; }
.sv-zsub { display: flex; gap: .5em; font-size: 11px; color: #c8b890; white-space: nowrap; }
.sv-zsub .sv-diff-chip { color: #e06a6a; }
html[data-sv-runhud] #hud .topright { top: calc(var(--sat, 0px) + 48px); }
/*
 * Lot 307 (owner: "the map at the top right is not great, maybe just the outline; the same at the centre: take Diablo II's"): the base's
 * minimap hidden in a round, the mode's automap in its place (ui/automap.ts): outlines only, no panel nor backdrop; the centred map over
 * the field (Diablo II's Tab map), taking no touch
 */
html[data-sv-runhud] #hud .minimap, html[data-sv-runhud] #hud .minimap-big { display: none !important; }
.sv-root > .sv-automap { pointer-events: auto; position: absolute; top: calc(var(--sat, 0px) + 46px); right: calc(env(safe-area-inset-right, 0px) + 6px);
  width: 124px; height: 124px; background: transparent; border: 0; cursor: pointer; z-index: 15; }
.sv-root > .sv-automap-big { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 14; }
/* lot 307: the darkness beyond the arena's edge (ui/bounds.ts), under the HUD's other parts */
.sv-root > .sv-bounds { position: absolute; inset: 0; overflow: hidden; pointer-events: none !important; z-index: -1; }
.sv-edge { position: absolute; left: 0; top: 0; width: 6000px; height: 6000px; transform-origin: 0 0; will-change: transform; }
.sv-topc { position: absolute; top: max(2px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); display: flex;
  flex-direction: column; align-items: center; gap: 3px; }
.sv-topline { display: flex; align-items: center; gap: 10px; padding: 1px 10px; background: rgba(8,6,4,.45); border-bottom: 1px solid
  rgba(140,110,60,.45); white-space: nowrap; }
.sv-time { font-size: 14px; color: #f0e0b8; font-variant-numeric: tabular-nums; }
.sv-next { color: #e8b04a; max-width: 42vw; overflow: hidden; text-overflow: ellipsis; }
.sv-next.soon { color: #ff7040; animation: sv-pulse .5s ease-in-out infinite alternate; }
.sv-hud .sv-pause { pointer-events: auto; min-width: 44px; min-height: 44px; padding: 0; font-size: 13px; letter-spacing: -2px;
  background: rgba(30,24,16,.4); border: 1px solid rgba(140,110,60,.6); color: #e8d49a; }
html[data-d2ui] .sv-hud .sv-pause { padding: 0; }
.sv-stats { position: absolute; display: flex; flex-direction: column; gap: 1px; font-size: 12px; line-height: 1.2; color: #d8c8a0; }
.sv-stats .sv-lvl { font-family: 'Cinzel', serif; color: #e8c878; }
.sv-stats .sv-goldchip { color: #e8c060; }
.sv-stats .sv-pop { color: #b8a888; }
.sv-stats .sv-pop::before { content: '☠ '; color: #a08060; }
.sv-stats .sv-load { color: #e8b04a; }
.sv-stats.beside { flex-direction: row; flex-wrap: wrap; gap: 1px .8em; max-width: min(30vw, 260px); }
@keyframes sv-pulse { from { opacity: 1; } to { opacity: .55; } }
.sv-bosses { display: flex; flex-direction: column; gap: 3px; align-items: center; flex-basis: 100%; }
.sv-boss { position: relative; width: min(56vw, 300px); height: 15px; }
.sv-boss-bar { position: absolute; inset: 0; background: rgba(10,8,6,.75); border: 1px solid #6a3020; overflow: hidden; }
.sv-boss-fill { position: absolute; inset: 0; background: linear-gradient(#a03a20, #6a1a10); transform-origin: left; }
.sv-boss.main .sv-boss-bar { border-color: #c08a40; }
.sv-boss.main .sv-boss-fill { background: linear-gradient(#c02a18, #801008); }
.sv-boss-name { position: absolute; inset: 0; text-align: center; font-size: 11px; line-height: 15px; color: #ffd890; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; padding: 0 6px; }
.sv-list { display: flex; flex-direction: column; gap: 6px; }
.sv-round { display: flex; align-items: center; gap: 8px; justify-content: space-between; padding: 6px 8px; border: 1px solid #3a2e20; background: #18120c; }
.sv-round.done .sv-state { color: #6c6; }
.sv-round.locked { opacity: .55; }
.sv-recap { display: grid; grid-template-columns: auto auto; gap: 2px 14px; font-size: 14px; }
.sv-recap b { color: #ffd890; font-weight: normal; text-align: right; }
.sv-loot { display: flex; flex-direction: column; gap: 4px; max-height: 40vh; overflow: auto; }
.sv-loot .sv-btn { text-align: left; }
.sv-seg { display: flex; gap: 6px; flex-wrap: wrap; }
.sv-seg .sv-btn.on { border-color: #e8b04a; color: #ffd890; background: #3a2810; }
.sv-help { font-size: 14px; line-height: 1.45; color: #c8b890; max-width: 640px; }
/* lot 292: the hub's shop (ui/shop.ts) and the run-end screen's gold */
.sv-shop { width: min(96vw, 620px); height: 100%; }
.sv-shop-head { display: flex; align-items: center; gap: 10px; }
.sv-shop-head .sv-title { flex: 1; text-align: left; }
.sv-purse { color: #ffd060; font-size: 18px; font-weight: normal; white-space: nowrap; }
.sv-tabs .sv-btn { flex: 1 1 0; padding: 8px 6px; font-size: 14px; }
.sv-hint { font-size: 12px; }
.sv-note { color: #e8d070; }
.sv-items { display: flex; flex-direction: column; gap: 6px; overflow: auto; min-height: 0; flex: 1; }
.sv-item { display: flex; flex-direction: column; gap: 3px; padding: 8px 10px; border: 1px solid #3a2e20; background: #18120c; touch-action: manipulation;
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; cursor: pointer; }
.sv-item.best { border-color: #6fc04a; }
.sv-item.open { border-color: #c08a40; }
.sv-iline { display: flex; align-items: baseline; gap: 8px; }
.sv-iname { font-weight: normal; font-size: 16px; }
.sv-badge { margin-left: auto; color: #8fe060; font-size: 12px; border: 1px solid #4a7a30; padding: 1px 6px; white-space: nowrap; }
.sv-isub { color: #9a8a6a; font-size: 12px; }
.sv-deltas { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 13px; }
.sv-up { color: #6f6; }
.sv-down { color: #f66; }
.sv-same { color: #9a8a6a; }
.sv-iacts { justify-content: flex-end; }
.sv-iacts .sv-btn { min-height: 40px; padding: 6px 12px; font-size: 14px; }
.sv-itip .tip { position: static; max-width: none; }
.sv-gold { display: flex; justify-content: center; gap: 14px; align-items: baseline; font-size: 18px; color: #ffd060; }
.sv-gold b { font-weight: normal; font-size: 24px; }
.sv-gold .sv-plus { color: #8fe060; }
.sv-bestbuy { color: #8fe060; text-align: center; font-size: 14px; margin: 0; }
.sv-records b { color: #ffd060; }
/* lot 299: the run-end screen: the title, the body (compact, scrolling on its own), the actions' bar always at the panel's foot */
.sv-box.sv-end { width: min(96vw, 640px); max-height: 100%; overflow: hidden; gap: 8px; }
.sv-end-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; overscroll-behavior: contain; }
.sv-end-recap { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 2px 16px; }
.sv-end-recap .sv-kv { display: flex; justify-content: space-between; gap: 8px; white-space: nowrap; }
.sv-end-note { font-size: 12.5px; line-height: 1.3; }
.sv-end-acts { flex: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; padding-top: 8px; border-top: 1px solid #4a3c28; }
.sv-end-acts .sv-btn { min-height: 48px; padding: 4px 6px; font-size: 15px; line-height: 1.15; }
/* lot 305: the next act over the whole row, its note small under it */
.sv-end-acts .sv-end-next { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.sv-end-acts .sv-btn small, .svh-run small { display: block; font-size: 11px; line-height: 1.2; color: #b09a70; text-transform: none; }
.svh-run.locked { opacity: .5; filter: grayscale(.9); cursor: default; }
@media (max-height: 520px) {
  .sv-screen { padding-top: max(6px, env(safe-area-inset-top)); padding-bottom: max(6px, env(safe-area-inset-bottom)); }
  .sv-box.sv-end { padding: 8px 10px; gap: 5px; }
  .sv-end .sv-title { font-size: 17px; }
  .sv-end-body { gap: 4px; }
  .sv-end .sv-gold { font-size: 15px; }
  .sv-end .sv-gold b { font-size: 19px; }
  .sv-end-recap { font-size: 13px; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
  .sv-end-note { font-size: 12px; }
  .sv-end-acts { padding-top: 5px; }
  .sv-end-acts .sv-btn { min-height: 44px; font-size: 14px; }
}
.sv-blocked { color: #f0a070; }
/*
 * Lot 292 (owner: "in Diablo II's style, as the rest of the game"): with the Diablo II interface loaded (\`html[data-d2ui]\`, the base's
 * images as CSS variables \`--u-*\`, src/ui/d2ui.ts), every screen of the mode takes the base's own look: stone panels under a dark veil
 * framed in gold (the base's dialogs), carved stone buttons (the base's panels and main menu: the caps kept, the stone repeated), the
 * pressed stone for the tab or button chosen, gold small capitals. Without it, the plain look above.
 */
html[data-d2ui] .sv-box, html[data-d2ui] .sv-card, html[data-d2ui] .sv-death {
  background: linear-gradient(rgba(6, 5, 4, .8), rgba(6, 5, 4, .8)), var(--u-panel-blank) center / cover no-repeat, #120e0a;
  border: 1px solid #8a7040; box-shadow: 0 0 0 2px #1a1409, 0 0 0 3px #6c5a3a, 0 6px 30px #000; }
html[data-d2ui] .sv-title { color: #e8d49a; font-variant: small-caps; letter-spacing: 1px; text-shadow: 0 1px 2px #000, 0 0 8px rgba(255, 150, 40, .25); }
html[data-d2ui] .sv-sub { color: #b09a6a; text-shadow: 0 1px 2px #000; }
html[data-d2ui] .sv-btn { background: none; border-style: solid; border-width: 0 16px; border-image: var(--u-btn-medium) 0 22 0 22 fill / 0 16px / 0 round stretch;
  border-radius: 0; color: #efe2b8; font-variant: small-caps; letter-spacing: .5px; text-shadow: 0 1px 2px #000; padding: 4px 6px; }
html[data-d2ui] .sv-btn:not(:disabled):active, html[data-d2ui] .sv-tabs .sv-btn.primary { border-image-source: var(--u-btn-medium-down); color: #ffd98a; }
html[data-d2ui] .sv-btn.primary { color: #ffd98a; }
html[data-d2ui] .sv-btn:disabled { opacity: .5; filter: grayscale(1); }
html[data-d2ui] .sv-btn:not(:disabled):hover { filter: brightness(1.15); }
/* the main actions (play, play again, visit the shop): the main menu's wide stone */
html[data-d2ui] .sv-play, html[data-d2ui] [data-sv="again"], html[data-d2ui] [data-sv="visit-shop"] {
  border-width: 0 20px; border-image: var(--u-btn-wide) 0 30 0 30 fill / 0 20px / 0 round stretch; color: #ffd98a; }
html[data-d2ui] .sv-play:not(:disabled):active, html[data-d2ui] [data-sv="again"]:active, html[data-d2ui] [data-sv="visit-shop"]:active {
  border-image-source: var(--u-btn-wide-down); }
html[data-d2ui] .sv-hub .sv-play { font-size: 20px; min-height: 52px; }
html[data-d2ui] .sv-tabs .sv-btn { font-size: 13px; line-height: 1.1; }
html[data-d2ui] .sv-tabs .sv-btn.primary { filter: brightness(1.25); text-shadow: 0 0 6px rgba(255, 170, 60, .6), 0 1px 2px #000; }
/* the level-up cards: framed in gold like the base's dialogs; the chosen one lit */
html[data-d2ui] .sv-card { border-color: #6c5a3a; }
html[data-d2ui] .sv-card:not(:disabled):hover, html[data-d2ui] .sv-card:focus-visible, html[data-d2ui] .sv-card:active, html[data-d2ui] .sv-card.picked {
  border-color: #e8c070; box-shadow: 0 0 0 2px #1a1409, 0 0 0 3px #c09a50, 0 0 14px rgba(255, 170, 60, .35); }
html[data-d2ui] .sv-card .sv-name { color: #e8d49a; font-variant: small-caps; text-shadow: 0 1px 2px #000; }
html[data-d2ui] .sv-card .sv-art .icon { border: 2px solid #8a7040; box-shadow: 0 0 0 1px #000, inset 0 0 6px #000; }
/* rows of the shop, the waypoint, the recap: dark stone under a veil, thin gold rule */
html[data-d2ui] .sv-item, html[data-d2ui] .sv-round, html[data-d2ui] .sv-lost {
  background: linear-gradient(rgba(10, 8, 6, .82), rgba(10, 8, 6, .82)), var(--u-panel-blank) center / cover no-repeat; border: 1px solid #5a4a30; }
html[data-d2ui] .sv-item.best { border-color: #6fc04a; }
html[data-d2ui] .sv-item.open { border-color: #c09a50; }
html[data-d2ui] .sv-badge { border-color: #4a7a30; background: rgba(0, 0, 0, .5); }
/* the round's bar of chips and its pause button */
/*
 * Lot 295 (the owner's note: "a main menu in this style"): the Run's hub in six tabs and three framed panels (ui/hub6.ts). Opaque over
 * the town; the panels side by side on a wide screen (landscape, an unfolded Fold), stacked and scrolling on a phone held upright, the
 * tabs and the run's button under the thumb. Cells of the bag, the stash, the charms and the Cube: Diablo II's pitch, one cell a square
 * sized to the panel (container queries), the items by their size with their inventory images.
 */
.sv-hub.sv-hub6 { padding: 0; align-items: stretch; justify-content: stretch; background: #0a0806; }
.svh { position: relative; flex: 1; min-width: 0; display: grid; grid-template-areas: "body" "bar" "tabs"; grid-template-rows: minmax(0, 1fr) auto auto;
  grid-template-columns: minmax(0, 1fr); padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  box-sizing: border-box; color: #d8c8a0; }
.svh-body { grid-area: body; display: flex; flex-direction: column; gap: 10px; padding: 8px; overflow-y: auto; min-height: 0; }
.svh-panel { display: flex; flex-direction: column; min-width: 0; background: #120e0a; border: 1px solid #8a7040;
  box-shadow: 0 0 0 2px #1a1409, 0 0 0 3px #6c5a3a; margin: 3px; }
.svh-ph { text-align: center; color: #e8d49a; font-variant: small-caps; letter-spacing: 2px; font-size: 14px; padding: 5px 6px;
  background: linear-gradient(#2a2016, #120d08); border-bottom: 1px solid #6c5a3a; text-shadow: 0 1px 2px #000; }
.svh-pc { container-type: inline-size; padding: 8px; min-height: 0; }
.svh-col { display: flex; flex-direction: column; gap: 6px; }
.svh-line { font-size: 12.5px; color: #b09a6a; margin: 0; text-align: center; line-height: 1.3; }
.svh-warn { color: #f0a070; }
.svh-sub { color: #e8d49a; font-variant: small-caps; font-size: 13px; letter-spacing: 1px; border-bottom: 1px solid #4a3c28; padding-bottom: 2px; margin-top: 2px; }
.svh-grid { --c: min(calc(var(--cmax, 38px) * var(--svh-k, 1)), calc((100cqw - 4px) / var(--n))); display: grid; grid-template-columns: repeat(var(--n), var(--c));
  grid-template-rows: repeat(var(--rows), var(--c)); width: max-content; margin: 0 auto; background-color: #0b0907;
  background-image: linear-gradient(to right, rgba(120, 100, 70, .3) 1px, transparent 1px), linear-gradient(to bottom, rgba(120, 100, 70, .3) 1px, transparent 1px);
  background-size: var(--c) var(--c); border: 1px solid #5a4a30; box-shadow: inset 0 0 8px #000; }
.svh-grid.svh-eq { background: none; border: none; box-shadow: none; }
.svh-slot { margin: 2px; border: 1px solid #6c5a3a; background: rgba(0, 0, 0, .6); box-shadow: inset 0 0 8px #000; }
.svh-slot.empty { display: flex; align-items: center; justify-content: center; text-align: center; color: #6a5d46; font-size: 10px; font-variant: small-caps; overflow: hidden; }
.svh-it { position: relative; padding: 0; border: 0; background: transparent; display: flex; align-items: center; justify-content: center; cursor: pointer;
  min-width: 0; min-height: 0; touch-action: manipulation; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; color: #e8d8b0; font: inherit; }
.svh-it .icon { width: 92%; height: 92%; }
.svh-it.q-magic { background: rgba(70, 80, 220, .24); }
.svh-it.q-rare { background: rgba(220, 210, 60, .16); }
.svh-it.q-set { background: rgba(40, 200, 40, .18); }
.svh-it.q-unique { background: rgba(200, 150, 70, .22); }
.svh-it.q-crafted { background: rgba(230, 130, 40, .2); }
.svh-slot.svh-it { background-blend-mode: normal; }
.svh-it.sel { outline: 2px solid #ffe0a0; outline-offset: -2px; }
.svh-it.dim { opacity: .3; }
.svh-it.fits { box-shadow: inset 0 0 0 2px #6fc04a; }
.svh-qty { position: absolute; right: 2px; bottom: 0; font-size: 10px; color: #fff; text-shadow: 0 0 2px #000, 0 0 2px #000; }
.svh-tabs { grid-area: tabs; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 3px; padding: 4px; background: #0d0a07;
  border-top: 1px solid #6c5a3a; }
.svh-tab { min-height: 54px; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 4px 2px;
  background: linear-gradient(#2a2118, #15100b); border: 1px solid #4a3c28; color: #c8b890; font: inherit; font-size: 11px; font-variant: small-caps;
  letter-spacing: .5px; cursor: pointer; touch-action: manipulation; overflow: hidden; -webkit-tap-highlight-color: transparent; }
.svh-tab span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.svh-tab .icon { width: 24px; height: 24px; font-size: 24px; color: #e8b04a; flex: none; }
.svh-tab.on { background: linear-gradient(#7a1a10, #3a0a06); border-color: #e8c070; color: #ffe0a0; box-shadow: 0 0 8px rgba(255, 120, 40, .35); }
.svh-bar { grid-area: bar; display: flex; gap: 6px; padding: 6px 8px; align-items: stretch; background: #0d0a07; border-top: 1px solid #6c5a3a; }
.svh-bar .sv-btn { min-height: 48px; font-size: 13px; line-height: 1.15; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.svh-bar .sv-btn small { display: block; font-size: 11px; color: #c8b890; letter-spacing: 0; }
@media (orientation: landscape), (min-width: 760px) { .svh-bar .sv-btn { flex-direction: row; gap: .6em; } .svh-bar .sv-btn small { font-size: inherit; color: inherit; } }
.sv-hub .svh-bar .sv-play { flex: 1 1 auto; min-width: 0; min-height: 48px; font-size: 15px; }
.svh-bar .sv-shop-btn, .svh-bar .svh-gear { flex: 0 1 auto; max-width: 30%; }
.svh-bar .svh-nav { flex: 0 1 auto; max-width: 30%; display: flex; flex-direction: column; gap: 3px; }
.svh-bar .svh-nav .sv-btn { min-height: 24px; flex: 1 1 0; font-size: 11px; padding: 2px 8px; white-space: nowrap; }
.sv-nav { margin-top: 10px; padding-top: 8px; border-top: 1px solid #4a3c26; }
.sv-nav .sv-btn { font-size: 13px; }
.svh-note { position: absolute; left: 50%; top: calc(8px + env(safe-area-inset-top)); transform: translateX(-50%); z-index: 4; max-width: 90%; pointer-events: none;
  padding: 6px 12px; background: rgba(10, 8, 6, .92); border: 1px solid #6fa040; color: #b8f090; font-size: 13px; text-align: center; }
.svh-note.bad { border-color: #a04030; color: #ffb090; }
.svh-detail { grid-area: body; align-self: end; z-index: 3; margin: 8px; max-height: 60%; overflow: auto; display: flex; flex-direction: column; gap: 6px;
  padding: 8px; background: rgba(12, 9, 6, .97); border: 1px solid #c09a50; box-shadow: 0 0 0 2px #1a1409, 0 -4px 24px #000; }
.svh-dhead { display: flex; align-items: center; gap: 8px; }
.svh-dhead b { flex: 1; font-weight: normal; font-size: 16px; }
.svh-tip .tip { position: static; max-width: none; }
.svh-acts { display: flex; flex-wrap: wrap; gap: 6px; }
.svh-acts .sv-btn { flex: 1 1 auto; min-height: 44px; font-size: 14px; }
.svh-seg { display: flex; gap: 4px; flex-wrap: wrap; }
.svh-seg .sv-btn { flex: 1 1 auto; min-height: 44px; padding: 4px 8px; font-size: 13px; }
.svh-seg .sv-btn.on { color: #ffd98a; border-color: #e8c070; background: #3a2810; }
.svh-pager { display: flex; align-items: center; gap: 6px; }
.svh-pager span { flex: 1; text-align: center; font-size: 13px; color: #e8d49a; }
.svh-pager .sv-btn { min-width: 56px; font-size: 20px; }
.svh-gold { display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border: 1px solid #4a3c28; background: rgba(0, 0, 0, .5); color: #ffd060; font-size: 14px; }
.svh-gold b { font-weight: normal; }
.svh-runs { display: flex; flex-direction: column; gap: 6px; }
.svh-run.on { color: #ffd98a; border-color: #e8c070; background: #3a2810; }
.svh-recs { display: flex; flex-direction: column; gap: 2px; font-size: 13px; color: #d8c8a0; text-align: center; }
.svh-table { display: grid; grid-template-columns: 1fr auto auto; gap: 3px 10px; align-items: center; font-size: 13px; }
.svh-table.two { grid-template-columns: 1fr auto; }
.svh-table b { color: #ffd890; font-weight: normal; text-align: right; }
.svh-table .sv-btn { min-height: 44px; min-width: 44px; padding: 0 6px; }
.svh-tree { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(6, auto); gap: 8px 12px; justify-items: center;
  padding: 8px 6px; background: rgba(0, 0, 0, .35); border: 1px solid #4a3c28; }
.svh-sk { position: relative; width: 48px; height: 48px; font-size: 48px; line-height: 0; padding: 0; border: 1px solid #5a4a30; background: #0b0907; cursor: pointer; color: #e8b04a; }
.svh-sk .icon { width: 100%; height: 100%; }
.svh-sk:not(.learned) .icon { filter: grayscale(.6) brightness(.7); }
.svh-sk.sel { outline: 2px solid #ffe0a0; outline-offset: 1px; }
.svh-sklv { position: absolute; right: 1px; bottom: 1px; font-size: 11px; line-height: 1.1; color: #ffd890; background: rgba(0, 0, 0, .7); padding: 0 3px; }
.svh-skinfo { display: flex; flex-direction: column; gap: 3px; font-size: 13px; color: #c8b890; padding: 6px; border: 1px solid #4a3c28; background: rgba(0, 0, 0, .45); }
.svh-skinfo b { color: #ffd890; font-weight: normal; }
.svh-recipes { display: flex; flex-direction: column; gap: 4px; }
.svh-recipe { text-align: left; font-size: 13px; min-height: 44px; }
.svh-recipe.on { color: #ffd98a; }
.svh-recipe-box { display: flex; flex-direction: column; gap: 5px; padding: 6px; border: 1px solid #6c5a3a; background: rgba(0, 0, 0, .45); }
.svh-cost { display: flex; flex-wrap: wrap; gap: 3px 10px; font-size: 12.5px; justify-content: center; }
.svh-cost .ok { color: #8fe060; }
.svh-cost .miss { color: #f08070; }
.svh-cube { display: flex; justify-content: center; padding: 6px; }
.svh-mats { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; }
.svh-mat { position: relative; width: 40px; height: 40px; font-size: 40px; line-height: 0; padding: 0; border: 1px solid #4a3c28; background: #0b0907; cursor: pointer; color: #e8b04a; }
.svh-mat .icon { width: 90%; height: 90%; }
.svh-pages { display: flex; flex-direction: column; gap: 4px; }
.svh-prow { display: flex; align-items: center; gap: 8px; padding: 4px; border: 1px solid #3a2e20; background: rgba(0, 0, 0, .45); cursor: pointer; min-height: 44px; }
.svh-prow .svh-it { width: 40px; height: 40px; flex: none; }
.svh-prow.sel { border-color: #c09a50; }
.svh-pname { font-size: 14px; }
/* lot 308: the training's ranks (ui/hub6.ts forgePart): a row an upgrade, its picture, name and ranks, the effect now → next, the price */
.svh-forge { display: flex; flex-direction: column; gap: 4px; }
.svh-frow { display: flex; align-items: center; gap: 8px; padding: 3px 4px; border: 1px solid #3a2e20; background: rgba(0, 0, 0, .45); min-height: 44px; }
.svh-frow.max { border-color: #6c5a3a; }
.svh-fic { width: 34px; height: 34px; font-size: 34px; line-height: 0; flex: none; color: #e8b04a; display: flex; align-items: center; justify-content: center; }
.svh-fic .icon { width: 100%; height: 100%; }
.svh-ftext { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.svh-fname { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.svh-fname b { color: #ffd890; font-weight: normal; font-size: 13.5px; }
.svh-pips { display: inline-flex; gap: 3px; }
.svh-pips i { width: 7px; height: 7px; transform: rotate(45deg); border: 1px solid #8a7040; background: #1a140c; }
.svh-pips i.on { background: #e8b04a; border-color: #ffd890; box-shadow: 0 0 4px rgba(255, 180, 60, .6); }
.svh-ffx { font-size: 12px; color: #b8a880; line-height: 1.25; }
.svh-fnext { color: #8fd060; }
.svh-frow .sv-btn { flex: none; min-height: 44px; min-width: 76px; padding: 0 8px; font-size: 13px; white-space: nowrap; }
.svh-frow.poor .sv-btn { opacity: .55; filter: grayscale(.7); }
.svh-frow.poor .svh-fic { filter: grayscale(.6) brightness(.75); }
.svh-freset { min-height: 44px; font-size: 13px; }
/* wide screens: the three panels side by side, the tabs on top as in the owner's picture, each panel scrolling on its own */
@media (orientation: landscape), (min-width: 760px) {
  .svh { grid-template-areas: "tabs" "body" "bar"; grid-template-rows: auto minmax(0, 1fr) auto; }
  .svh-tabs { border-top: none; border-bottom: 1px solid #6c5a3a; }
  .svh-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1fr); gap: 6px; overflow: hidden; }
  .svh-panel { min-height: 0; overflow: hidden; }
  .svh-pc { flex: 1; overflow-y: auto; }
  .svh-detail { justify-self: end; width: min(380px, 46%); max-height: calc(100% - 16px); }
}
/* a large screen (the unfolded Fold, a tablet): larger cells, as far as the panel's width allows */
@media (min-width: 760px) and (min-height: 760px) { .svh { --svh-k: 1.4; } .svh-sk { width: 56px; height: 56px; } }
@media (orientation: landscape) and (max-height: 500px) {
  .svh-tab { min-height: 44px; flex-direction: row; gap: 6px; font-size: 12px; }
  .svh-tab .icon { width: 20px; height: 20px; }
  .svh-bar { padding: 3px 8px; }
  .svh-bar .sv-btn, .sv-hub .svh-bar .sv-play { min-height: 44px; }
  .svh-ph { padding: 2px 6px; font-size: 12px; }
  .svh-pc { padding: 5px; }
  .svh-body { padding: 4px 6px; }
}
/*
 * Lot 299 (the owner's screenshots of the hub in landscape: "zoom out a little, smaller buttons, no scrollbars"): a smaller scale, the
 * buttons drawn smaller with their touch area kept (a transparent ::before over the gap: 44 px where the button is 34-36), the grids'
 * cells sized to the panel's height too (container queries: the bag with its gold, the stash, the equipment and the charms whole), the
 * Craft tab one category at a time in a compact grid, thin scrollbars where a long panel still scrolls (last resort).
 */
.svh-pc, .svh-body, .svh-detail, .svh-recipes { scrollbar-width: thin; scrollbar-color: #6c5a3a transparent; }
.svh-pc::-webkit-scrollbar, .svh-body::-webkit-scrollbar, .svh-detail::-webkit-scrollbar { width: 4px; height: 4px; }
.svh-pc::-webkit-scrollbar-thumb, .svh-body::-webkit-scrollbar-thumb, .svh-detail::-webkit-scrollbar-thumb { background: #6c5a3a; }
.svh-tab, .svh-bar .sv-btn, .svh-seg .sv-btn, .svh-pager .sv-btn, .svh-recipe { position: relative; }
.svh-tab { min-height: 46px; font-size: 10.5px; }
.svh-tab .icon { width: 20px; height: 20px; font-size: 20px; }
.svh-bar { padding: 4px 6px; gap: 5px; }
.svh-bar .sv-btn, .sv-hub .svh-bar .sv-play { min-height: 44px; font-size: 12.5px; }
.sv-hub .svh-bar .sv-play { font-size: 14px; }
.svh-bar .svh-nav { flex-direction: row; gap: 5px; }
.svh-bar .svh-nav .sv-btn { min-height: 44px; font-size: 11px; white-space: normal; flex: 1 1 0; }
/* a phone held upright: the two ways back on a row of their own under the bar's three buttons, drawn smaller (36 px, touch 44) */
@media (orientation: portrait) and (max-width: 759px) {
  .svh-bar { flex-wrap: wrap; }
  .svh-bar .svh-nav { flex: 1 1 100%; max-width: none; order: 5; }
  .svh-bar .svh-nav .sv-btn { min-height: 36px; white-space: nowrap; }
  .svh-bar .svh-nav .sv-btn::before { content: ''; position: absolute; left: 0; right: 0; top: -4px; bottom: -4px; }
}
/* lot 305: the acts' list over the hub (held upright only: in landscape it is the Character tab's third panel, in view) */
@media (orientation: landscape), (min-width: 760px) { .svh-bar .svh-actpick { display: none; } }
.svh-ph { font-size: 12.5px; letter-spacing: 1.5px; padding: 3px 6px; }
.svh-line { font-size: 11.5px; }
.svh-sub { font-size: 12px; }
.svh-seg .sv-btn, .svh-pager .sv-btn { min-height: 36px; font-size: 12px; padding: 2px 6px; }
.svh-seg .sv-btn::before, .svh-pager .sv-btn::before { content: ''; position: absolute; left: 0; right: 0; top: -4px; bottom: -4px; }
.svh-pager .sv-btn { min-width: 44px; font-size: 18px; }
.svh-table { font-size: 12px; gap: 1px 8px; }
.svh-table .sv-btn { min-height: 30px; min-width: 36px; }
.svh-tree { gap: 5px 10px; padding: 6px 4px; }
.svh-sk { width: var(--svh-sk, 44px); height: var(--svh-sk, 44px); font-size: var(--svh-sk, 44px); }
.svh-recipes { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr)); gap: 4px; }
.svh-recipe { min-height: 34px; font-size: 12px; line-height: 1.15; padding: 3px 8px; }
.svh-recipe::before { content: ''; position: absolute; left: 0; right: 0; top: -5px; bottom: -5px; }
html[data-d2ui] .svh-recipe { padding: 3px 8px; }
.svh-cats .sv-btn { flex: 1 1 0; font-size: 11.5px; }
.svh-acts .sv-btn { min-height: 40px; font-size: 13px; }
.svh-gold { font-size: 13px; padding: 2px 8px; }
/* the cells sized to the panel's height as well as its width (wide screens: the three panels side by side, each its own height) */
@media (orientation: landscape), (min-width: 760px) {
  .svh-pc { container-type: size; }
  .svh-pc .svh-grid { --c: min(calc(var(--cmax, 38px) * var(--svh-k, 1)), calc((100cqw - 4px) / var(--n)), calc((100cqh - var(--rest, 0px)) / var(--fit, var(--rows)))); }
  .svh-panel[data-part="bag"] .svh-pc { --rest: 40px; }
  .svh-panel[data-part="bag"] .svh-pc:has(.svh-seg) { --rest: 92px; }
  .svh-panel[data-part="stash"] .svh-pc { --rest: 92px; }
  .svh-panel[data-part="equipment"] .svh-pc { --rest: 40px; }
  /* the equipment (7 rows) and the charms (4 rows of smaller cells, 24 against 34 px) in one panel */
  .svh-panel[data-part="equipment"] .svh-pc:has([data-grid="charms"]) { --rest: 70px; }
  .svh-panel[data-part="equipment"] .svh-pc:has([data-grid="charms"]) [data-grid="equipment"] { --fit: 9.9; }
  .svh-panel[data-part="equipment"] .svh-pc:has([data-grid="charms"]) [data-grid="charms"] { --fit: 14; }
  .svh-panel[data-part="merc"] .svh-pc { --rest: 110px; }
  .svh-panel[data-part="cube"] .svh-pc { --rest: 150px; }
  .svh-panel[data-part="trees"] .svh-pc { --svh-sk: clamp(30px, calc((100cqh - 120px) / 6 - 5px), 48px); }
}
@media (orientation: landscape) and (max-height: 500px) {
  .svh-tab { min-height: 34px; font-size: 11px; }
  .svh-tab::before { content: ''; position: absolute; left: 0; right: 0; top: -4px; bottom: -6px; }
  .svh-tab .icon { width: 18px; height: 18px; font-size: 18px; }
  .svh-tabs { padding: 3px 4px; }
  .svh-bar { padding: 3px 6px; }
  .svh-bar .sv-btn, .sv-hub .svh-bar .sv-play { min-height: 34px; font-size: 12px; }
  .sv-hub .svh-bar .sv-play { font-size: 13px; }
  .svh-bar .sv-btn::before { content: ''; position: absolute; left: 0; right: 0; top: -4px; bottom: -6px; }
  .svh-bar .svh-nav { flex-direction: row; max-width: 36%; }
  .svh-bar .svh-nav .sv-btn { min-height: 34px; white-space: normal; font-size: 10.5px; line-height: 1.1; }
  .svh-bar .svh-nav .sv-btn:first-child::before, .svh-bar .svh-nav .sv-btn:last-child::before { top: -4px; bottom: -6px; }
  .svh-body { padding: 3px 5px; gap: 4px; }
  .svh-panel { margin: 2px; }
  .svh-ph { padding: 1px 6px; font-size: 11px; }
  .svh-pc { padding: 4px; }
  .svh-col { gap: 4px; }
  .svh-line { font-size: 10.5px; line-height: 1.2; }
  .svh-sub { font-size: 11px; }
  .svh-table { font-size: 10.5px; line-height: 1.15; }
  .svh-table .sv-btn { min-height: 22px; min-width: 30px; padding: 0 4px; }
  .svh-seg .sv-btn, .svh-pager .sv-btn { min-height: 30px; font-size: 11px; }
  .svh-seg .sv-btn::before, .svh-pager .sv-btn::before { top: -7px; bottom: -7px; }
  .svh-recipe { min-height: 32px; font-size: 11px; }
  .svh-recipe::before { top: -6px; bottom: -6px; }
  .svh-cats .sv-btn { font-size: 10px; padding: 2px 3px; letter-spacing: 0; }
  .svh-recipe-box { padding: 4px; gap: 3px; }
  .svh-recipe-box .svh-line { font-size: 10px; }
  .svh-bar .sv-btn, .sv-hub .svh-bar .sv-play { white-space: nowrap; }
  /* the stats on two columns, the attributes on two rows: the whole sheet in the panel */
  .svh-table[data-sv="attributes"] { grid-template-columns: 1fr auto auto 1fr auto auto; }
  .svh-table.two { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto; gap: 1px 6px; }
  .svh-table.two span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .svh-panel[data-part="trees"] .svh-line { display: none; }
  .svh-tree { gap: 3px 8px; padding: 4px; }
  .svh-recipes { grid-template-columns: repeat(auto-fill, minmax(min(120px, 100%), 1fr)); gap: 3px; }
  .svh-runs { gap: 3px; }
  .svh-runs .sv-btn { min-height: 34px; font-size: 12px; }
  .svh-recs { font-size: 11px; }
  .svh-gold { font-size: 12px; padding: 1px 6px; }
  .svh-panel[data-part="bag"] .svh-pc { --rest: 30px; }
  .svh-panel[data-part="stash"] .svh-pc { --rest: 66px; }
  .svh-panel[data-part="equipment"] .svh-pc { --rest: 30px; }
  .svh-panel[data-part="equipment"] .svh-pc:has([data-grid="charms"]) { --rest: 52px; }
  .svh-panel[data-part="trees"] .svh-pc { --svh-sk: clamp(26px, calc((100cqh - 96px) / 6 - 5px), 44px); }
  .svh-detail { max-height: calc(100% - 8px); margin: 4px; padding: 6px; gap: 4px; }
  .svh-detail .tip { font-size: 11px; line-height: 1.2; }
  .svh-dhead b { font-size: 14px; }
  .svh-acts .sv-btn { min-height: 34px; font-size: 12px; }
}
html[data-d2ui] .svh-panel { background: linear-gradient(rgba(6, 5, 4, .8), rgba(6, 5, 4, .8)), var(--u-panel-blank) center / cover no-repeat, #120e0a; }
html[data-d2ui] .svh-tab { background: linear-gradient(rgba(12, 9, 6, .55), rgba(12, 9, 6, .7)), var(--u-panel-blank) center / cover no-repeat; border-color: #6c5a3a; color: #e8d49a; }
html[data-d2ui] .svh-tab.on { background: linear-gradient(rgba(140, 24, 12, .62), rgba(60, 8, 4, .75)), var(--u-panel-blank) center / cover no-repeat; border-color: #e8c070; color: #ffe8b0; }
html[data-d2ui] .svh-ph { background: linear-gradient(rgba(30, 22, 14, .5), rgba(8, 6, 4, .85)), var(--u-panel-blank) center / cover no-repeat; }
html[data-d2ui] .svh-detail { background: linear-gradient(rgba(6, 5, 4, .9), rgba(6, 5, 4, .9)), var(--u-panel-blank) center / cover no-repeat; }
html[data-d2ui] .svh-seg .sv-btn.on, html[data-d2ui] .svh-run.on { background: none; border-image-source: var(--u-btn-medium-down); filter: brightness(1.2); }
html[data-d2ui] .svh-bar, html[data-d2ui] .svh-tabs { background: linear-gradient(rgba(6, 5, 4, .7), rgba(6, 5, 4, .7)), var(--u-panel-blank) center / cover no-repeat; }
html[data-d2ui] .svh-recipe { text-align: left; border: 1px solid #5a4a30; border-image: none; padding: 6px 10px;
  background: linear-gradient(rgba(10, 8, 6, .82), rgba(10, 8, 6, .82)), var(--u-panel-blank) center / cover no-repeat; }
html[data-d2ui] .svh-recipe.on { border-color: #e8c070; }

/*
 * Lot 306: the act screen (ui/acts.ts), a waypoint of the acts. Held upright one column, the act looked at unfolded in its place; wide,
 * the acts on the left and the act looked at on the right (its grid area spans every row and a last flexible one, so that the rows on
 * the left keep their height). The button at the foot always in sight. Text 11 px at least.
 */
.sva { width: min(96vw, 1000px); max-height: min(100%, 760px); padding: 8px 10px; gap: 6px; overflow: hidden; }
.sva-head { display: flex; align-items: center; justify-content: center; }
.sva-head .sv-title { font-family: 'Cinzel', serif; font-size: 20px; }
.sva-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; display: grid; grid-template-columns: minmax(0, 1fr);
  gap: 5px; align-content: start; overscroll-behavior: contain; }
.sva-row { display: flex; align-items: baseline; gap: 8px; min-height: 44px; padding: 4px 10px; box-sizing: border-box; text-align: left;
  border: 1px solid #5a4a30; background: rgba(10, 8, 6, .82); color: #d8c8a0; font: inherit; cursor: pointer; touch-action: manipulation;
  -webkit-tap-highlight-color: transparent; align-items: center; min-width: 0; }
.sva-row .sva-name { font-family: 'Cinzel', serif; font-weight: normal; font-size: 16px; color: #e8d49a; white-space: nowrap; }
.sva-row .sva-diff { font-size: 12px; color: #b09a6a; white-space: nowrap; }
.sva-row .sva-state { margin-left: auto; font-size: 12px; color: #c8b890; text-align: right; display: flex; flex-wrap: wrap; gap: 0 5px;
  justify-content: flex-end; min-width: 0; }
.sva-row .sva-state .ok { color: #7ad050; }
.sva-row .sva-state .num { color: #ffd98a; }
.sva-row .sva-state .lock { color: #a08a68; }
.sva-row.locked { opacity: .6; }
.sva-row.locked .sva-name { color: #a8987a; }
.sva-row.on { border-color: #e8c070; box-shadow: inset 0 0 10px rgba(232, 192, 112, .25); }
.sva-row:not(.on):hover { border-color: #8a7040; }
.sva-row.on { display: none; }
.sva-detail { display: flex; flex-direction: column; gap: 5px; padding: 8px 10px; min-width: 0; border: 1px solid #e8c070;
  box-shadow: 0 0 0 1px #000, 0 0 0 2px #6c5a3a, 0 0 14px rgba(232, 192, 112, .2);
  background: radial-gradient(120% 90% at 85% 0%, var(--sva-tint, rgba(60, 70, 30, .45)), transparent 70%), rgba(10, 8, 6, .9); }
.sva-detail.a2 { --sva-tint: rgba(120, 90, 40, .45); }
.sva-detail.a3 { --sva-tint: rgba(30, 80, 50, .45); }
.sva-detail.a4 { --sva-tint: rgba(120, 30, 16, .5); }
.sva-detail.a5 { --sva-tint: rgba(60, 90, 120, .45); }
.sva-detail.locked { border-color: #8a7040; filter: saturate(.6); }
.sva-detail p { margin: 0; }
.sva-dhead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sva-dhead h3 { margin: 0; font-family: 'Cinzel', serif; font-weight: normal; font-size: 22px; color: #f0d890; text-shadow: 0 1px 2px #000, 0 0 10px rgba(255, 160, 50, .3); }
.sva-dchip { font-size: 12px; color: #c8b890; border: 1px solid #6c5a3a; padding: 0 6px; }
.sva-dchip.lock { color: #e0a070; border-color: #8a5030; }
.sva-event { color: #e8603c; font-size: 14px; font-variant: small-caps; letter-spacing: .3px; }
.sva-flavour { color: #d8c8a0; font-size: 13px; line-height: 1.3; }
.sva-why { color: #f0a070; font-size: 13px; }
.sva-note { color: #b09a70; font-size: 12px; font-style: italic; }
.sva-sub { color: #a89878; font-size: 11px; text-transform: uppercase; letter-spacing: .6px; }
.sva-zones, .sva-time { display: flex; flex-wrap: wrap; gap: 4px; }
.sva-zone { display: inline-flex; align-items: baseline; gap: 4px; font-size: 12px; color: #d8c8a0; border: 1px solid #5a4a30; padding: 2px 6px;
  background: rgba(0, 0, 0, .45); }
.sva-zone i { font-style: normal; color: #a08a68; }
.sva-zone b { font-weight: normal; }
.sva-zone em { font-style: normal; color: #7ad050; }
.sva-zone.done { border-color: #4a7a30; }
.sva-tchip { display: inline-flex; align-items: baseline; gap: 4px; font-size: 12px; color: #e8d8b0; border: 1px solid #7a3a20; border-radius: 11px;
  padding: 2px 8px; background: rgba(70, 14, 6, .55); }
.sva-tchip b { color: #f0b070; font-weight: normal; }
.sva-tchip em { font-style: normal; }
.sva-tchip.final { border-color: #e8c070; color: #ffd98a; box-shadow: 0 0 6px rgba(232, 192, 112, .35); }
.sva-roster { color: #988c76; font-size: 11.5px; line-height: 1.35; }
.sva-roster b { color: #b0a080; font-weight: normal; margin-right: 4px; }
.sva-roster span + span::before { content: ' · '; color: #6a604e; }
.sva-facts { display: flex; flex-direction: column; gap: 1px; font-size: 12px; color: #c8b890; }
.sva-facts p span + span { margin-left: 5px; }
.sva-facts p span:nth-child(2n) { color: #ffd98a; }
.sva-foot { display: flex; gap: 8px; align-items: stretch; }
.sva-foot .sva-back { flex: 0 0 auto; }
.sva-foot .sva-enter { flex: 1 1 auto; min-height: 54px; font-size: 18px; line-height: 1.15; }
.sva-enter small { display: block; font-size: 12px; color: #d8c090; font-variant: normal; letter-spacing: 0; }
.sva-enter small span + span { margin-left: 4px; }
.svh-actmore { min-height: 38px; font-size: 13px; }
@media (orientation: landscape) and (min-width: 600px) {
  .sva-list { grid-template-columns: minmax(0, .8fr) minmax(0, 1.3fr); grid-template-rows: repeat(var(--rows, 7), min-content) 1fr; }
  .sva-row { grid-column: 1; min-height: 40px; }
  .sva-row.on { display: flex; }
  .sva-detail { grid-column: 2; grid-row: 1 / -1; align-self: start; }
}
@media (orientation: landscape) and (max-height: 500px) {
  .sva { padding: 5px 8px; gap: 4px; }
  .sva-head .sv-title { font-size: 16px; }
  .sva-row { min-height: 36px; padding: 2px 8px; }
  .sva-row .sva-name { font-size: 14px; }
  .sva-detail { gap: 3px; padding: 6px 8px; }
  .sva-dhead h3 { font-size: 18px; }
  .sva-event { font-size: 13px; }
  .sva-flavour { font-size: 12px; }
  .sva-foot .sva-enter { min-height: 46px; font-size: 16px; }
  .sva-foot .sva-back { min-height: 46px; }
}
html[data-d2ui] .sva-row { background: linear-gradient(rgba(10, 8, 6, .84), rgba(10, 8, 6, .84)), var(--u-panel-blank) center / cover no-repeat; }
html[data-d2ui] .sva-detail { background: radial-gradient(120% 90% at 85% 0%, var(--sva-tint, rgba(60, 70, 30, .45)), transparent 70%),
  linear-gradient(rgba(8, 6, 4, .78), rgba(8, 6, 4, .88)), var(--u-panel-blank) center / cover no-repeat; }

`;

/** Adds the mod's style sheet to the page (once) */
export function ensureStyle(): void {
  if (document.getElementById('survivals-style')) return;
  const s = document.createElement('style');
  s.id = 'survivals-style';
  s.textContent = CSS;
  document.head.append(s);
}
