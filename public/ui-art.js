/* =====================================================================
   POKÉ TACTICS · Arte de interfaz (solo navegador)
   - PX: iconos pixel art propios (16×16), dibujados por código con la misma paleta,
     el mismo contorno de 1 píxel y la misma escala. Se pintan como SVG nítido (crispEdges).
   - MenuScene: escenario pixel art del menú y del acceso (arena-tablero al atardecer,
     braseros, estandartes y dos equipos de Pokémon con sus sprites animados de 5.ª gen).
   No toca la lógica del juego; game.js solo llama a PX.hydrate() y MenuScene.ensure().
   ===================================================================== */
(() => {
  /* ---------- paleta común de la interfaz ---------- */
  const PAL = { k: '#0b0d18', w: '#f4f1e8', s: '#a9a4bd', S: '#6f6a88', r: '#e0412f', d: '#8f1f1a', R: '#ff8a6a', y: '#ffd23f', g: '#c98a17',
    G: '#5cc55e', D: '#2b7c36', b: '#3f7fe0', B: '#9cd3ff', n: '#a8693a', N: '#5c3a1f', p: '#8a5cd8', P: '#cdb0ff', e: '#4a5470', E: '#262c42', o: '#ff9a2a' };
  const len = (x, y) => Math.hypot(x, y);
  const seg = (x, y, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))); return len(x - ax - dx * t, y - ay - dy * t); };
  const inPoly = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const box = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  /* ---------- iconos: cada uno es una función (x,y) → color de la paleta ---------- */
  const ICONS = {
    // Jugar: Poké Ball
    ball: (x, y) => { const d = len(x - 8, y - 8); if (d > 6.6) return; if (d < 1.4) return 'w'; if (d < 2.4) return 'k'; if (Math.abs(y - 8) < 1) return 'k';
      if (y < 8) return len(x - 5.6, y - 4.8) < 1.3 ? 'w' : d > 5.6 && x > 8 ? 'd' : 'r'; return d > 5.6 && y > 10 ? 's' : 'w'; },
    // Multijugador: dos entrenadores
    people: (x, y) => { const L = len(x - 5.2, y - 5) < 2.5 ? 'B' : (y > 8.6 && len((x - 5.2) / 4.2, (y - 13.4) / 4.6) < 1 ? 'b' : null);
      const R = len(x - 10.8, y - 5.6) < 2.5 ? 'R' : (y > 9.2 && len((x - 10.8) / 4.2, (y - 14) / 4.6) < 1 ? 'r' : null); return R && x > 8.2 ? R : L || R; },
    // Pokédex
    dex: (x, y) => { if (!box(x, y, 3, 1.5, 13, 14.5)) return; if (len(x - 6, y - 5) < 1.6) return 'B'; if (len(x - 6, y - 5) < 2.4) return 'w';
      if (len(x - 9.7, y - 3.6) < .9) return 'y'; if (len(x - 11.4, y - 3.6) < .9) return 'G'; if (Math.abs(y - 8) < .6) return 'd';
      if (box(x, y, 5, 10, 11, 12.6)) return 'E'; return x > 11.4 ? 'd' : 'r'; },
    // Objetos: mochila
    bag: (x, y) => { const d = len(x - 8, y - 5.4); if (y < 5.6 && d > 2.2 && d < 3.4) return 'N'; if (!box(x, y, 2.6, 5.6, 13.4, 14.4)) return;
      if (box(x, y, 7, 8.6, 9, 10.6)) return 'y'; if (y < 8.8) return 'N'; return x > 11.8 || y > 13.2 ? 'N' : 'n'; },
    // Guía: libro abierto
    book: (x, y) => { const L = inPoly(x, y, [[1.6, 3.4], [7.6, 4.6], [7.6, 13], [1.6, 11.8]]), Rr = inPoly(x, y, [[8.4, 4.6], [14.4, 3.4], [14.4, 11.8], [8.4, 13]]);
      if (Math.abs(x - 8) < .5 && y > 4.2 && y < 13.4) return 'N'; if (!L && !Rr) return box(x, y, 1.6, 12, 14.4, 13.8) ? 'd' : null;
      const line = Math.floor(y) % 2 === 0 && y > 5.5 && y < 11 && (L ? x > 2.6 && x < 6.8 : x > 9.2 && x < 13.4); return line ? 'S' : L ? 'w' : 's'; },
    // Opciones: engranaje
    gear: (x, y) => { const dx = x - 8, dy = y - 8, d = len(dx, dy), a = Math.atan2(dy, dx), r = Math.cos(a * 8) > .25 ? 6.6 : 5; if (d > r || d < 1.9) return; return d < 3 ? 's' : dx + dy < -2 ? 's' : 'e'; },
    // Audio
    sound: (x, y) => { if (box(x, y, 1.6, 6, 4.6, 10)) return 'e'; if (inPoly(x, y, [[4.6, 6], [8.6, 2.4], [8.6, 13.6], [4.6, 10]])) return 's';
      const d = len(x - 8, y - 8); if (x > 10 && ((d > 3.2 && d < 4.2) || (d > 5.4 && d < 6.4))) return 'B'; },
    mute: (x, y) => { if (box(x, y, 1.6, 6, 4.6, 10)) return 'e'; if (inPoly(x, y, [[4.6, 6], [8.6, 2.4], [8.6, 13.6], [4.6, 10]])) return 's';
      if (x > 9.6 && (seg(x, y, 10.6, 5.4, 14.4, 10.6) < .8 || seg(x, y, 10.6, 10.6, 14.4, 5.4) < .8)) return 'r'; },
    // Cerrar y volver
    close: (x, y) => (seg(x, y, 3.6, 3.6, 12.4, 12.4) < 1.3 || seg(x, y, 12.4, 3.6, 3.6, 12.4) < 1.3) ? 'w' : null,
    check: (x, y) => (seg(x, y, 2.6, 8.4, 6.4, 12.2) < 1.3 || seg(x, y, 6.4, 12.2, 13.6, 4) < 1.3) ? 'G' : null,
    // Añadir amigo: silueta con un «+»
    addfriend: (x, y) => { if ((Math.abs(x - 12.6) < .9 && y > 2 && y < 9) || (Math.abs(y - 5.5) < .9 && x > 9.1 && x < 16)) return 'G'; if (len(x - 6, y - 5.4) < 2.8) return 'w'; if (y > 9.2 && y < 14.6 && len(x - 6, y - 15.4) < 5.6) return 'w'; },
    back: (x, y) => inPoly(x, y, [[2, 8], [7.6, 2.6], [7.6, 5.8], [14, 5.8], [14, 10.2], [7.6, 10.2], [7.6, 13.4]]) ? 'w' : null,
    // Economía: moneda
    coin: (x, y) => { const d = len(x - 8, y - 8); if (d > 6.2) return; if (d > 5) return 'g'; if (Math.abs(x - 8) < .9 && y > 4.4 && y < 11.6) return 'g'; return len(x - 6, y - 5.6) < 1.2 ? 'w' : 'y'; },
    // Combate: espadas cruzadas
    swords: (x, y) => { if (seg(x, y, 3.2, 3.2, 10.4, 10.4) < 1 || seg(x, y, 12.8, 3.2, 5.6, 10.4) < 1) return 's';
      if (seg(x, y, 8.6, 12.2, 12.2, 8.6) < .9 || seg(x, y, 3.8, 8.6, 7.4, 12.2) < .9) return 'y'; if (len(x - 12.3, y - 12.3) < 1.3 || len(x - 3.7, y - 12.3) < 1.3) return 'n'; },
    // Sinergias: hexágono con nodos
    hex: (x, y) => { const H = [[8, 1.8], [13.4, 4.9], [13.4, 11.1], [8, 14.2], [2.6, 11.1], [2.6, 4.9]]; if (!inPoly(x, y, H)) return;
      if (len(x - 8, y - 8) < 1.6 || len(x - 8, y - 4.4) < 1.1 || len(x - 11, y - 10) < 1.1 || len(x - 5, y - 10) < 1.1) return 'w';
      if (seg(x, y, 8, 8, 8, 4.4) < .5 || seg(x, y, 8, 8, 11, 10) < .5 || seg(x, y, 8, 8, 5, 10) < .5) return 'P'; return 'p'; },
    // Aumentos: cristal
    crystal: (x, y) => { if (!inPoly(x, y, [[8, 1.4], [13.2, 6.2], [8, 14.6], [2.8, 6.2]])) return; if (y < 6.2) return x < 8 ? 'w' : 'B'; return x < 8 ? 'b' : 'B'; },
    // Tienda: puesto con toldo
    shop: (x, y) => { if (box(x, y, 1.8, 2.6, 14.2, 6.4)) return Math.floor((x - 1.8) / 2.5) % 2 ? 'w' : 'r'; if (box(x, y, 3, 6.4, 13, 14)) return box(x, y, 5, 8.4, 8, 14) ? 'N' : box(x, y, 9, 8.4, 11.6, 11) ? 'B' : 'n'; },
    // Estadísticas de la ficha: victorias, top 4 y mejor puesto
    trophy: (x, y) => { if (box(x, y, 4.6, 12.4, 11.4, 14.4)) return 'g'; if (box(x, y, 7, 9.6, 9, 12.4)) return 'g';
      const cup = inPoly(x, y, [[3.6, 2], [12.4, 2], [11.4, 7.4], [8, 10], [4.6, 7.4]]); if (cup) return x < 6.4 ? 'w' : x > 10 ? 'g' : 'y';
      const d1 = len(x - 3.4, y - 5), d2 = len(x - 12.6, y - 5); if ((d1 > 1.4 && d1 < 2.4 && x < 4) || (d2 > 1.4 && d2 < 2.4 && x > 12)) return 'g'; },
    medal: (x, y) => { if (inPoly(x, y, [[4, 1.4], [7, 1.4], [8.8, 7], [6.6, 7]])) return 'r'; if (inPoly(x, y, [[12, 1.4], [9, 1.4], [7.2, 7], [9.4, 7]])) return 'b';
      const d = len(x - 8, y - 10.4); if (d < 4.2) return d > 3.2 ? 'g' : len(x - 6.8, y - 9.2) < 1 ? 'w' : 'y'; },
    star: (x, y) => { const P = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.9 : 6.8; P.push([8 + Math.cos(a) * r, 8.4 + Math.sin(a) * r]); } if (!inPoly(x, y, P)) return; return x < 7 && y < 8 ? 'w' : 'y'; },
    // Caramelos (la moneda gratuita): caramelo envuelto
    candy: (x, y) => { const d = len((x - 8) / 3.6, (y - 8) / 3); if (d < 1) return len(x - 7, y - 6.8) < 1 ? 'w' : (x + y) % 4 < 2 ? 'B' : 'b';
      if (inPoly(x, y, [[4.6, 8], [1.2, 4.6], [1.2, 11.4]]) || inPoly(x, y, [[11.4, 8], [14.8, 4.6], [14.8, 11.4]])) return 'P'; },
    // Historial: reloj de arena
    hourglass: (x, y) => { if (box(x, y, 3, 1.6, 13, 3.2) || box(x, y, 3, 12.8, 13, 14.4)) return 'n'; const w = Math.abs(y - 8) * .62 + .6; if (Math.abs(x - 8) > w || y < 3.2 || y > 12.8) return;
      if (y > 9.4 && Math.abs(x - 8) < w - .2) return 'y'; if (y < 6 && y > 4 && Math.abs(x - 8) < w - .6) return 'y'; return 'B'; },
    // Clasificatoria: escudo con espadas
    ranked: (x, y) => { if (!inPoly(x, y, [[2.6, 2.4], [13.4, 2.4], [13.4, 8], [8, 14.4], [2.6, 8]])) return; if (seg(x, y, 5, 5, 11, 11) < .8 || seg(x, y, 11, 5, 5, 11) < .8) return 'w'; return x < 8 ? 'p' : 'P'; },
    swap: (x, y) => { if (seg(x, y, 3, 5.4, 11.6, 5.4) < .9 || inPoly(x, y, [[11, 2.4], [14.4, 5.4], [11, 8.4]])) return 'B'; if (seg(x, y, 4.4, 10.6, 13, 10.6) < .9 || inPoly(x, y, [[5, 7.6], [1.6, 10.6], [5, 13.6]])) return 'R'; },
  };
  const grids = {};
  function grid(name) {
    if (grids[name]) return grids[name]; const f = ICONS[name]; if (!f) return null;
    const g = []; for (let y = 0; y < 16; y++) { g.push([]); for (let x = 0; x < 16; x++) g[y].push(f(x + .5, y + .5) || null); }
    // contorno exterior de 1 píxel, igual en todos los iconos
    const o = g.map(r => r.slice());
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (!g[y][x]) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = g[y + dy] && g[y + dy][x + dx]; if (c && c !== 'k') { o[y][x] = 'k'; break; } }
    return grids[name] = o;
  }
  const svgCache = {};
  function icon(name, size = 32, cls = '') {
    const k = name + '|' + size + '|' + cls; if (svgCache[k]) return svgCache[k]; const g = grid(name); if (!g) return '';
    let r = ''; for (let y = 0; y < 16; y++) { let x = 0; while (x < 16) { const c = g[y][x]; let e = x + 1; while (e < 16 && g[y][e] === c) e++; if (c) r += `<rect x="${x}" y="${y}" width="${e - x}" height="1" fill="${PAL[c]}"/>`; x = e; } }
    return svgCache[k] = `<svg class="pxi ${cls}" width="${size}" height="${size}" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${r}</svg>`;
  }
  // Sustituye cada <i data-i="nombre" data-s="tamaño"> por su icono
  function hydrate(root = document) { root.querySelectorAll('i[data-i]').forEach(el => { if (el.dataset.done === el.dataset.i) return; el.innerHTML = icon(el.dataset.i, +(el.dataset.s || 32)); el.dataset.done = el.dataset.i; el.classList.add('pxw'); }); }
  /* ---------- insignias de rango: copas ilustradas en public/img/rank/<liga>.webp (256×256, fondo transparente) ----------
     Todas en el mismo lienzo y centradas; las ligas altas ocupan un poco más (de 80 % en Hierro a 100 % en Retador).
     Sin rango: la de Hierro apagada (none.webp). */
  // Colores de cada liga (los usa la interfaz para acentos); [sombra, metal, metal claro, brillo, gema]
  const LEAGUE_PAL = { iron: ['#2b2624', '#5d534f', '#8f847e', '#c4bab4', '#7a6e68'], bronze: ['#45210f', '#8c4a27', '#c97f4f', '#f2b88a', '#7a3d23'],
    silver: ['#323d4b', '#76869b', '#b8c5d6', '#f2f6fb', '#5d8ccf'], gold: ['#4b2e08', '#a06c14', '#e2b54a', '#fff0b0', '#2fb07a'],
    platinum: ['#0c3c43', '#23838e', '#69cfd6', '#dcffff', '#1fa69a'], emerald: ['#0a3a21', '#178046', '#4ecb85', '#d4ffe6', '#14c27a'],
    diamond: ['#18215f', '#3a58c4', '#8ea7ff', '#f2f5ff', '#5fd2ff'], master: ['#2c0f4d', '#7432bd', '#c18bff', '#f6e6ff', '#d14cff'],
    grandmaster: ['#4a0d0d', '#ae2a24', '#f07258', '#ffe0cc', '#ff3a3a'], challenger: ['#47360c', '#b98a22', '#f2cf6a', '#fff6cf', '#3fb8ff'],
    none: ['#262b40', '#4a5270', '#7f88aa', '#c3c9e2', '#7f88aa'] };
  function badge(key, size = 48) {
    const lg = LEAGUE_PAL[key] ? key : 'none';
    return `<img class="pxBadge" src="${window.ASSET_BASE||""}img/rank/${lg}.webp" width="${size}" height="${size}" alt="" aria-hidden="true" draggable="false" decoding="async">`;
  }
  window.PX = { icon, hydrate, badge, LEAGUE_PAL, names: Object.keys(ICONS), PAL };

  /* =====================================================================
     Escenario del menú: arena-tablero al atardecer (pixel art a baja resolución, sin suavizado)
     ===================================================================== */
  // Los 6 sprites animados del menú están en nuestro servidor (public/menu, 312 KB en total): antes se pedían a raw.githubusercontent, que no deja cachear más de 5 minutos y competía con la carga del juego
  const SPR = d => `menu/${d}.gif`;
  const SPR_B = d => `menu/back-${d}.gif`;
  // Equipo rival (de frente, al fondo) y el tuyo (de espaldas, delante), en las columnas laterales del tablero 7×8
  const TEAM_FOE = [[94, 0, 2], [149, 6, 0], [130, 6, 3]], TEAM_ME = [[6, 0, 5], [25, 1, 6], [448, 6, 5]];
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const S = { cv: null, g: null, img: null, s: 1, lw: 0, lh: 0, on: false, raf: 0, t0: 0, last: 0, units: [], motes: [], stars: [], base: null };
  function visible() { const m = document.getElementById('menu'), a = document.getElementById('auth'); return (m && !m.classList.contains('hidden')) || (a && !a.classList.contains('hidden')); }
  function setup() {
    const root = document.getElementById('menuScene'); if (!root) return false;
    S.cv = root.querySelector('canvas'); S.g = S.cv.getContext('2d'); S.layer = root.querySelector('.mnUnits');
    addEventListener('resize', () => { if (S.on) resize(); });
    return true;
  }
  // Escala entera: cada píxel del escenario ocupa s×s píxeles de pantalla
  function resize() {
    const W = innerWidth, H = innerHeight; S.s = Math.max(2, Math.ceil(Math.max(W / 360, H / 210)));
    S.lw = Math.ceil(W / S.s); S.lh = Math.ceil(H / S.s); S.cv.width = S.lw; S.cv.height = S.lh;
    S.cv.style.width = S.lw * S.s + 'px'; S.cv.style.height = S.lh * S.s + 'px';
    S.img = S.g.createImageData(S.lw, S.lh); paintBase(); placeUnits();
  }
  // Geometría del tablero en perspectiva (en píxeles del escenario)
  function geo() { const H0 = Math.round(S.lh * .54), B = S.lh + 4, cx = S.lw / 2, top = S.lw * .78, bot = S.lw * 1.1; return { H0, B, cx, top, bot }; }
  // Fila r (0..8 bordes) → y y semiancho; perspectiva con filas más altas cerca de la cámara
  function rowY(G, r) { const t = r / 8, k = (Math.pow(1.6, t) - 1) / .6; return G.H0 + 4 + (G.B - G.H0 - 4) * k; }
  function rowHalf(G, y) { const t = (y - G.H0) / (G.B - G.H0); return (G.top + (G.bot - G.top) * t) / 2; }
  function cellCenter(c, r) { const G = geo(), y0 = rowY(G, r), y1 = rowY(G, r + 1), y = (y0 + y1) / 2, h = rowHalf(G, y); return [G.cx - h + (c + .5) * (2 * h / 7), y1 - (y1 - y0) * .2, y1 - y0]; }
  function put(d, x, y, c) { if (x < 0 || y < 0 || x >= S.lw || y >= S.lh) return; const i = (y * S.lw + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
  // Mezcla dos colores con trama de Bayer (degradados sin suavizado, a lo GBA)
  function dith(x, y, a, b, k) { return (BAYER[(y & 3) * 4 + (x & 3)] + .5) / 16 < k ? b : a; }
  function rng(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function paintBase() {
    const d = S.img.data, W = S.lw, H = S.lh, G = geo(), R = rng(7);
    const sky = ['#0b1030', '#141a44', '#1f2457', '#2e2c66', '#47336f', '#6a3d6e'].map(hex);
    // cielo al atardecer por bandas tramadas
    for (let y = 0; y < G.H0; y++) { const t = y / G.H0 * (sky.length - 1), i = Math.min(sky.length - 2, Math.floor(t)), f = t - i; for (let x = 0; x < W; x++) put(d, x, y, dith(x, y, sky[i], sky[i + 1], f)); }
    // estrellas fijas
    S.stars = []; for (let i = 0; i < W * G.H0 / 260; i++) S.stars.push([Math.floor(R() * W), Math.floor(R() * G.H0 * .7), R()]);
    // montañas lejanas (dos capas)
    for (const [col, amp, base, f] of [['#1b1c46', 16, .82, .021], ['#221f4d', 10, .9, .037]]) { const c = hex(col);
      for (let x = 0; x < W; x++) { const h = Math.round(G.H0 * base - amp * (Math.sin(x * f + base * 9) * .6 + Math.sin(x * f * 2.3 + 1) * .4 + .6)); for (let y = h; y < G.H0; y++) put(d, x, y, c); } }
    // muro del estadio con almenas y estandartes (rojo, oro y azul: los colores del juego)
    const wall = hex('#2a2440'), wallHi = hex('#3a3358'), wallLo = hex('#191528'), wy = G.H0 - 12;
    for (let x = 0; x < W; x++) { for (let y = wy; y < G.H0 + 2; y++) put(d, x, y, y === wy ? wallHi : (y - wy) % 5 === 0 || (x + (Math.floor((y - wy) / 5) % 2) * 4) % 8 === 0 ? wallLo : wall);
      if (Math.floor(x / 4) % 2 === 0) for (let y = wy - 3; y < wy; y++) put(d, x, y, y === wy - 3 ? wallHi : wall); }
    const BAN = [['#c8342a', '#ff6a50'], ['#c99417', '#ffd23f'], ['#2f5fb8', '#7fb2ff']].map(p => p.map(hex));
    for (let i = 0, bx = Math.round(W / 2 % 34) + 6; bx < W - 6; bx += 34, i++) { if (Math.abs(bx + 4 - W / 2) < W * .3) continue; const [c0, c1] = BAN[i % 3];
      for (let y = wy - 1; y < wy + 11; y++) for (let x = bx; x < bx + 9; x++) { const tip = y > wy + 7 && Math.abs(x - bx - 4) > (wy + 11 - y); if (!tip) put(d, x, y, x === bx || x === bx + 8 ? c0 : (y === wy + 2 ? c1 : c0)); }
      for (let y = wy + 3; y < wy + 6; y++) for (let x = bx + 3; x < bx + 6; x++) put(d, x, y, c1); }
    // tablero 7×8: mitad rival rojiza, mitad tuya azulada, línea central dorada y borde oscuro
    const dark = [hex('#3a2b44'), hex('#47354f')], light = [hex('#2a3658'), hex('#334169')], edge = hex('#120f1e'), mid = hex('#d6a32a');
    for (let y = G.H0 + 1; y < H; y++) { const half = rowHalf(G, y); let r = 0; while (r < 8 && rowY(G, r + 1) <= y) r++;
      for (let x = 0; x < W; x++) { const u = (x - (G.cx - half)) / (2 * half); if (u < -.035 || u > 1.035) { put(d, x, y, dith(x, y, hex('#141024'), hex('#1c1630'), (y - G.H0) / (H - G.H0))); continue; }
        if (u < 0 || u > 1) { put(d, x, y, edge); continue; } const c = Math.min(6, Math.floor(u * 7)), pal = r < 4 ? dark : light; let col = pal[(c + r) % 2];
        if (r === 4 && y - rowY(G, 4) < 1.2) col = mid; put(d, x, y, col); } }
    // viñeta tramada en los bordes: guía la mirada al centro
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = Math.max(Math.abs(x / W - .5) * 2, 0) ** 4 * .45; if (v > 0 && (BAYER[(y & 3) * 4 + (x & 3)] + .5) / 16 < v) { const i = (y * W + x) * 4; d[i] = d[i] * .55; d[i + 1] = d[i + 1] * .55; d[i + 2] = d[i + 2] * .6; } }
    S.base = new Uint8ClampedArray(d);
    // brasas que suben de los braseros (pocas)
    S.motes = []; for (let i = 0; i < 26; i++) S.motes.push(newMote(R, true));
  }
  function pillars() { const G = geo(), y = rowY(G, 0) + 2, h = rowHalf(G, y); return [Math.max(3, Math.round(G.cx - h - 6)), Math.min(S.lw - 12, Math.round(G.cx + h - 3))].map(x => [x, Math.round(y)]); }
  function newMote(R, any) { const P = pillars(), p = P[Math.floor(R() * 2)]; return { x: p[0] + 4 + (R() - .5) * 6, y: any ? p[1] - 30 - R() * 60 : p[1] - 30, v: 6 + R() * 10, ph: R() * 6, gold: R() < .7 }; }
  // Fotograma: copia el fondo y añade lo animado (estrellas, braseros, brasas y luz del título)
  const FLAME = ['#fff3b0', '#ffd23f', '#ff9a2a', '#e0412f'].map(hex), STONE = [hex('#4a4466'), hex('#5d5680'), hex('#332e4a')];
  function frame(now) {
    if (!S.on) return; if (!visible()) { stop(); return; }
    S.raf = requestAnimationFrame(frame);
    // 15 fotogramas por segundo: suficiente para el ambiente y casi sin coste
    if (now - S.last < 66) return; const dt = Math.min(.2, (now - (S.last || now)) / 1000); S.last = now; const t = now / 1000;
    const d = S.img.data; d.set(S.base); const W = S.lw, G = geo(), R = Math.random;
    for (const [x, y, k] of S.stars) if (Math.sin(t * (1 + k * 2) + k * 30) > -.4) put(d, x, y, k > .85 ? [255, 246, 214] : [170, 180, 230]);
    // resplandor cálido en el horizonte, detrás del centro de la arena (late despacio)
    const pul = .16 + .05 * Math.sin(t * 1.3);
    for (let y = G.H0 - 40; y < G.H0 - 12; y++) for (let x = 0; x < W; x++) { const k = pul * (1 - Math.abs(x - W / 2) / (W * .38)) * ((y - G.H0 + 40) / 28); if (k > 0 && (BAYER[(y & 3) * 4 + (x & 3)] + .5) / 16 < k) { const i = (y * W + x) * 4; d[i] = Math.min(255, d[i] + 70); d[i + 1] = Math.min(255, d[i + 1] + 38); d[i + 2] = Math.min(255, d[i + 2] + 10); } }
    // columnas con brasero y su resplandor en el suelo
    for (const [px, py] of pillars()) {
      for (let y = py - 30; y < py + 2; y++) for (let x = px; x < px + 9; x++) put(d, x, y, x === px ? STONE[2] : x === px + 8 ? STONE[2] : (y - py) % 6 === 0 ? STONE[2] : x < px + 3 ? STONE[1] : STONE[0]);
      for (let x = px - 2; x < px + 11; x++) { put(d, x, py - 31, STONE[1]); put(d, x, py - 32, STONE[2]); }
      for (let i = 0; i < 26; i++) { const fx = px + 1 + Math.floor(R() * 7), h = 3 + Math.floor((Math.sin(t * 9 + i) * .5 + .5) * 6 + R() * 2), fy = py - 33 - Math.floor(R() * h); put(d, fx, fy, FLAME[Math.min(3, Math.floor((py - 33 - fy) / h * 4))]); }
      for (let y = py - 6; y < py + 10; y++) for (let x = px - 16; x < px + 25; x++) { const k = .16 * (1 - len((x - px - 4) / 20, (y - py - 2) / 7)); if (k > 0 && (BAYER[(y & 3) * 4 + (x & 3)] + .5) / 16 < k) { const i = (y * W + x) * 4; d[i] = Math.min(255, d[i] + 60); d[i + 1] = Math.min(255, d[i + 1] + 34); } }
    }
    for (const m of S.motes) { m.y -= m.v * dt; m.x += Math.sin(t * 2 + m.ph) * .25; if (m.y < G.H0 - 70) Object.assign(m, newMote(R, false)); put(d, Math.round(m.x), Math.round(m.y), m.gold ? [255, 210, 63] : [255, 138, 106]); }
    S.g.putImageData(S.img, 0, 0);
  }
  // Sprites animados de 5.ª gen sobre el tablero (escala entera, sin suavizado)
  function placeUnits() {
    if (!S.layer) return; if (!S.units.length) {
      for (const [dex, c, r] of TEAM_FOE) S.units.push({ dex, c, r, back: false }); for (const [dex, c, r] of TEAM_ME) S.units.push({ dex, c, r, back: true });
      for (const u of S.units) { const im = new Image(); im.alt = ''; im.decoding = 'async'; im.src = u.back ? SPR_B(u.dex) : SPR(u.dex); im.className = 'mnUnit' + (u.back ? ' me' : ' foe'); im.onload = () => size(u); im.onerror = () => im.remove(); u.im = im; S.layer.appendChild(im); }
    }
    for (const u of S.units) size(u);
  }
  function size(u) { const im = u.im; if (!im || !im.naturalWidth) return; const [x, y, rh] = cellCenter(u.c, u.r), z = Math.max(1, Math.round(S.s * (u.back ? .4 : .34)));
    im.style.width = im.naturalWidth * z + 'px'; im.style.height = im.naturalHeight * z + 'px'; im.style.left = Math.round(x * S.s - im.naturalWidth * z / 2) + 'px'; im.style.top = Math.round(y * S.s - im.naturalHeight * z * .86) + 'px'; im.style.zIndex = 10 + u.r; }
  function start() { if (S.on) return; if (!S.cv && !setup()) return; S.on = true; resize(); S.last = 0; S.raf = requestAnimationFrame(frame); }
  function stop() { S.on = false; cancelAnimationFrame(S.raf); }
  // Se arranca al mostrar el menú o el acceso y se para sola al salir de ellos
  window.MenuScene = { ensure: () => { if (visible()) start(); }, stop, get on() { return S.on; } };
})();
