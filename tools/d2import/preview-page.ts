/** Page HTML de contrôle (statique ; les données viennent de data.js) */
export const PREVIEW_HTML = String.raw`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aperçu de l'import D2</title>
<style>
  :root { --bg:#14110f; --panel:#1f1a17; --line:#3a312b; --text:#e8dfd4; --dim:#9a8f83; --accent:#e8734a; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.4 system-ui, sans-serif; padding:16px; }
  h1 { font-size:20px; margin:0 0 4px; } h2 { font-size:16px; margin:0 0 10px; color:var(--accent); }
  p.note { color:var(--dim); margin:0 0 16px; }
  section { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px; margin-bottom:16px; }
  label { display:inline-flex; gap:6px; align-items:center; margin:0 12px 8px 0; color:var(--dim); }
  select, input[type=range], button { background:#2a231f; color:var(--text); border:1px solid var(--line); border-radius:6px; padding:4px 8px; font:inherit; }
  canvas { background:#0c0a09; border:1px solid var(--line); border-radius:6px; image-rendering:pixelated; max-width:100%; }
  #scene { width:100%; max-width:960px; }
  .grid { display:flex; flex-wrap:wrap; gap:10px; }
  .icon { background:#0c0a09; border:1px solid var(--line); border-radius:6px; padding:6px; text-align:center; cursor:pointer; width:110px; }
  .icon img { image-rendering:pixelated; display:block; margin:0 auto 4px; }
  .icon small { color:var(--dim); display:block; }
  .icon.sel { border-color:var(--accent); }
  #meta { color:var(--dim); font-size:12px; margin-top:6px; white-space:pre-wrap; }
  #variants { margin-top:10px; display:flex; flex-wrap:wrap; gap:6px; }
  #variants img { image-rendering:pixelated; background:#0c0a09; border:1px solid var(--line); border-radius:4px; }
</style>
</head>
<body>
<h1>Aperçu de l'import Diablo II</h1>
<p class="note">Contrôle local des assets générés à partir des archives du joueur. Rien de cette page ni de ses images ne doit quitter cette machine.</p>

<section>
  <h2>1. Lecteur d'animation</h2>
  <div>
    <label>Entité <select id="pEntity"></select></label>
    <label>Animation <select id="pAnim"></select></label>
    <label>Direction <select id="pDir"></select></label>
    <label>Vitesse <input id="pSpeed" type="range" min="0.1" max="3" step="0.1" value="1"> <span id="pSpeedV">×1,0</span></label>
    <label>Zoom <select id="pZoom"><option>1</option><option selected>2</option><option>3</option><option>4</option></select></label>
    <label><input id="pAnchor" type="checkbox" checked> ancre</label>
    <button id="pPlay">Pause</button>
  </div>
  <canvas id="player" width="400" height="300"></canvas>
  <div id="meta"></div>
</section>

<section>
  <h2>2. Scène de test isométrique (Acte 1)</h2>
  <div>
    <label>Animation du Paladin <select id="sAnim"></select></label>
    <label>Cadence <input id="sSpeed" type="range" min="0.1" max="2" step="0.1" value="1"></label>
  </div>
  <canvas id="scene" width="960" height="560"></canvas>
  <div class="note" id="sceneNote"></div>
</section>

<section>
  <h2>3. Icônes d'inventaire</h2>
  <div class="grid" id="icons"></div>
  <div id="variants"></div>
</section>

<script src="data.js"></script>
<script>
(function () {
  var D = window.D2DATA;
  var cache = {};
  function img(src) { if (!cache[src]) { var i = new Image(); i.src = src; cache[src] = i; } return cache[src]; }
  var $ = function (id) { return document.getElementById(id); };
  var ents = D.chars.concat(D.monsters);
  var pEntity = $('pEntity'), pAnim = $('pAnim'), pDir = $('pDir');

  function fill(sel, items, val, text) { sel.innerHTML = ''; items.forEach(function (it, i) { var o = document.createElement('option'); o.value = val(it, i); o.textContent = text(it, i); sel.appendChild(o); }); }
  fill(pEntity, ents, function (e, i) { return i; }, function (e) { return e.kind + ' / ' + e.name + (e.variant ? ' (' + e.variant + ')' : ''); });

  function curEnt() { return ents[+pEntity.value]; }
  function curAnim() { return curEnt().anims[+pAnim.value]; }
  function onEntity() {
    fill(pAnim, curEnt().anims, function (a, i) { return i; }, function (a) { return a.name; });
    onAnim();
  }
  function onAnim() {
    var a = curAnim();
    fill(pDir, a.dirLabels, function (l, i) { return i; }, function (l, i) { return i + ' — ' + l; });
    frame = 0; acc = 0;
    $('meta').textContent = a.png + '\n' + a.directions + ' directions × ' + a.frames + ' trames, cadre ' + a.frame.w + '×' + a.frame.h + ', ancre (' + a.anchor.x + ', ' + a.anchor.y + '), ' + a.fps.toFixed(2) + ' i/s' + (a.loop ? ', boucle' : ', une fois');
  }
  pEntity.onchange = onEntity; pAnim.onchange = onAnim;
  $('pSpeed').oninput = function () { $('pSpeedV').textContent = '×' + (+this.value).toFixed(1).replace('.', ','); };
  var playing = true;
  $('pPlay').onclick = function () { playing = !playing; this.textContent = playing ? 'Pause' : 'Lecture'; };

  var frame = 0, acc = 0, last = performance.now();
  function drawFrame(ctx, a, dir, f, x, y, z) {
    var im = img('../' + a.png);
    if (!im.complete || !im.naturalWidth) return;
    ctx.drawImage(im, f * a.frame.w, dir * a.frame.h, a.frame.w, a.frame.h, Math.round(x - a.anchor.x * z), Math.round(y - a.anchor.y * z), a.frame.w * z, a.frame.h * z);
  }
  var pc = $('player'), pctx = pc.getContext('2d');
  function tickPlayer(dt) {
    var a = curAnim(); if (!a) return;
    if (playing) { acc += dt * a.fps * (+$('pSpeed').value) / 1000; while (acc >= 1) { acc -= 1; frame = (frame + 1) % a.frames; } }
    var z = +$('pZoom').value;
    pc.width = Math.max(200, a.frame.w * z + 40); pc.height = a.frame.h * z + 40;
    pctx.imageSmoothingEnabled = false;
    var ox = 20 + a.anchor.x * z, oy = 20 + a.anchor.y * z;
    drawFrame(pctx, a, +pDir.value, frame, ox, oy, z);
    if ($('pAnchor').checked) { pctx.strokeStyle = '#e8734a'; pctx.beginPath(); pctx.moveTo(ox - 6, oy); pctx.lineTo(ox + 6, oy); pctx.moveTo(ox, oy - 6); pctx.lineTo(ox, oy + 6); pctx.stroke(); }
  }

  // ----- scène de test
  var set = D.tiles[0];
  var tileById = {};
  if (set) set.tiles.forEach(function (t) { tileById[t.id] = t; });
  var paladin = D.chars.filter(function (e) { return e.id === 'paladin'; })[0];
  var mons = ['fallen', 'zombie', 'quillrat'].map(function (id) { return D.monsters.filter(function (e) { return e.id === id; })[0]; }).filter(Boolean);
  var sAnim = $('sAnim');
  if (paladin) fill(sAnim, paladin.anims, function (a, i) { return i; }, function (a) { return a.name; });
  var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  var N = 6, grid = [];
  if (set) for (var i = 0; i < N * N; i++) grid.push(set.scene.grass[Math.floor(rnd() * set.scene.grass.length)]);
  var wallL = set ? set.scene.wallLeft : [], wallR = set ? set.scene.wallRight : [];
  var actors = [];
  if (paladin) actors.push({ ent: paladin, wx: 15, wy: 15, pal: true });
  var spots = [[21, 11], [11, 22], [23, 20]];
  mons.forEach(function (m, i) { actors.push({ ent: m, wx: spots[i][0], wy: spots[i][1], phase: i * 3 }); });
  var WALL_DY = 40;
  var sc = $('scene'), sctx = sc.getContext('2d'), CX = 480, CY = 70, sf = 0, sacc = 0;
  function proj(wx, wy) { return [CX + (wx - wy) * 16, CY + (wx + wy) * 8]; }
  function drawTile(t, tx, ty) {
    var o = [CX + (tx - ty) * 80 - 80, CY + (tx + ty) * 40 + (t.kind === 'wall' ? WALL_DY : 0)];
    var im = img('../' + set.dir + '/atlas-' + t.atlas.page + '.png');
    if (!im.complete || !im.naturalWidth) return;
    sctx.drawImage(im, t.atlas.x, t.atlas.y, t.w, t.h, o[0] + t.ox, o[1] + t.oy, t.w, t.h);
  }
  function tickScene(dt) {
    if (!set) { $('sceneNote').textContent = 'Aucun jeu de tuiles : lancer « tiles » puis « preview ».'; return; }
    var pa = paladin ? paladin.anims[+sAnim.value] : null;
    sacc += dt / 1000 * (+$('sSpeed').value);
    sctx.imageSmoothingEnabled = false;
    sctx.fillStyle = '#0c0a09'; sctx.fillRect(0, 0, sc.width, sc.height);
    for (var ty = 0; ty < N; ty++) for (var tx = 0; tx < N; tx++) drawTile(tileById[grid[ty * N + tx]], tx, ty);
    var items = [];
    for (var k = 0; k < 4 && wallL.length; k++) items.push({ key: k * 5 + 2.5, draw: (function (k) { return function () { drawTile(tileById[wallL[k % wallL.length]], 0, k); }; })(k) });
    for (var m = 1; m < 4 && wallR.length; m++) items.push({ key: m * 5 + 2.5, draw: (function (m) { return function () { drawTile(tileById[wallR[m % wallR.length]], m, 0); }; })(m) });
    var target = actors[0];
    actors.forEach(function (ac) {
      var a = ac.pal ? pa : ac.ent.anims.filter(function (x) { return x.name === 'idle'; })[0];
      if (!a) return;
      var p = proj(ac.wx, ac.wy), dir = 0;
      if (target && ac !== target) { var q = proj(target.wx, target.wy), dx = q[0] - p[0], dy = q[1] - p[1]; var ang = Math.atan2(-dx, dy) * 180 / Math.PI; if (ang < 0) ang += 360; dir = Math.round(ang / (360 / a.directions)) % a.directions; }
      var f = Math.floor(sacc * a.fps + (ac.phase || 0)) % a.frames;
      items.push({ key: ac.wx + ac.wy, draw: function () { drawFrame(sctx, a, dir, f, p[0], p[1], 1); } });
    });
    items.sort(function (a, b) { return a.key - b.key; }).forEach(function (it) { it.draw(); });
    $('sceneNote').textContent = 'Sol : ' + set.level + ' (' + set.scene.grass.length + ' variantes d’herbe), murs : ' + wallL.length + '+' + wallR.length + ' tuiles, ordre de profondeur = x+y au sol. Les monstres regardent le Paladin.';
  }

  // ----- icônes
  var ig = $('icons');
  D.icons.forEach(function (ic) {
    var d = document.createElement('div'); d.className = 'icon';
    var im = document.createElement('img'); im.src = '../' + ic.file; im.width = ic.size.w; im.height = ic.size.h;
    d.appendChild(im);
    var n = document.createElement('div'); n.textContent = ic.name; d.appendChild(n);
    var s = document.createElement('small'); s.textContent = ic.code + ' · ' + ic.cells.w + '×' + ic.cells.h + (ic.variants.length ? ' · ' + ic.variants.length + ' teintes' : ''); d.appendChild(s);
    d.onclick = function () {
      Array.prototype.forEach.call(ig.children, function (c) { c.classList.remove('sel'); }); d.classList.add('sel');
      var v = $('variants'); v.innerHTML = '';
      ic.variants.forEach(function (x) { var vi = document.createElement('img'); vi.src = '../' + x.file; vi.title = x.color; vi.width = ic.size.w; vi.height = ic.size.h; v.appendChild(vi); });
    };
    ig.appendChild(d);
  });

  onEntity();
  function loop(now) { var dt = Math.min(100, now - last); last = now; tickPlayer(dt); tickScene(dt); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
})();
</script>
</body>
</html>
`;
