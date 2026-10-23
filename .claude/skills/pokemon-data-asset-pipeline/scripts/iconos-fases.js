// Iconos de la barra de fases (public/img/ui/*.webp, 160×160), todos con el mismo estilo: figura en escala de grises → teñida por luminosidad
// (relieve conservado) con un borde negro fino. Tintes: neutra (ronda por jugar), oro (ronda actual), gana y pierde (resultado del combate).
//  - espadas-*: de la imagen de espadas cruzadas que aportó el autor (fondo blanco: se quita con un relleno desde los bordes, así no se agujerean los brillos).
//  - cartas-*: dos cartas (una vertical y otra encima ladeada a la derecha) dibujadas aquí en SVG, para las rondas con elección de aumento.
//  - carrusel-*: el icono del carrusel (mismo trazado que ROUND_SVG.carousel en game.js), solo neutra y oro.
// Uso: node iconos-fases.js <espadas.png> <carpeta de salida>   (necesita sharp fuera del proyecto, p. ej. NODE_PATH=<carpeta con sharp>)
const sharp = require('sharp');
const [inp, out] = process.argv.slice(2);
const S = 160, PAD = 6, R = 2.5; // lienzo, margen y grosor del borde negro
const TINTS = { neutra: [[34, 58, 78], [176, 204, 224]], oro: [[128, 82, 10], [255, 236, 150]], gana: [[18, 92, 44], [150, 240, 160]], pierde: [[120, 18, 18], [255, 150, 140]] };

// Alfa y luminosidad reducidas a S×S (muestreo 4×4 por píxel: bordes suaves) a partir de una imagen RGBA y su máscara de fondo
function reduce(data, W, H, bg) {
  let x0 = W, y0 = H, x1 = 0, y1 = 0; for (let i = 0; i < W * H; i++) if (!bg[i]) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const side = Math.max(x1 - x0, y1 - y0) + 1, k = (S - 2 * PAD) / side, ox = PAD + ((S - 2 * PAD) - (x1 - x0 + 1) * k) / 2, oy = PAD + ((S - 2 * PAD) - (y1 - y0 + 1) * k) / 2;
  const A = new Float32Array(S * S), L = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let a = 0, l = 0, n = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) { const fx = x0 + (x + (sx + .5) / 4 - ox) / k, fy = y0 + (y + (sy + .5) / 4 - oy) / k; n++; if (fx < 0 || fy < 0 || fx >= W || fy >= H) continue; const i = (fy | 0) * W + (fx | 0); if (bg[i]) continue; a++; l += (.3 * data[i * 4] + .59 * data[i * 4 + 1] + .11 * data[i * 4 + 2]) / 255; }
    A[y * S + x] = a / n; L[y * S + x] = a ? l / a : 0; }
  return { A, L };
}
// Teñido por luminosidad (contraste normalizado sobre la figura) y borde negro por dilatación del alfa
async function tinted({ A, L }, name, file) {
  let lo = 1, hi = 0; for (let i = 0; i < S * S; i++) if (A[i] > .5) { lo = Math.min(lo, L[i]); hi = Math.max(hi, L[i]); }
  const B = new Float32Array(S * S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let m = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const d = Math.hypot(dx, dy); if (d > R + .5) continue; const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue; m = Math.max(m, A[yy * S + xx] * Math.min(1, R + .5 - d)); } B[y * S + x] = m; }
  for (const [tn, [d, l]] of Object.entries(TINTS)) { if (name === 'carrusel' && tn !== 'neutra' && tn !== 'oro') continue;
    const o = Buffer.alloc(S * S * 4);
    for (let i = 0; i < S * S; i++) { const t = Math.min(1, Math.max(0, (L[i] - lo) / (hi - lo || 1))), a = A[i], c = d.map((v, j) => v + (l[j] - v) * Math.pow(t, .85));
      const ab = B[i], aa = a + ab * (1 - a); for (let j = 0; j < 3; j++) o[i * 4 + j] = aa ? Math.round(c[j] * a / aa) : 0; o[i * 4 + 3] = Math.round(aa * 255); }
    await sharp(o, { raw: { width: S, height: S, channels: 4 } }).webp({ quality: 90, alphaQuality: 100 }).toFile(`${file}/${name}-${tn}.webp`); }
}
// Fondo blanco (y la sombra gris del suelo en el cuarto inferior) rellenado desde los bordes
function whiteBg(data, W, H) {
  const bg = new Uint8Array(W * H), isBg = i => { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); return (mn > 200 && mx - mn < 22) || ((i / W | 0) > H * .74 && mn > 150 && mx - mn < 30); };
  const q = []; for (let x = 0; x < W; x++) q.push(x, (H - 1) * W + x); for (let y = 0; y < H; y++) q.push(y * W, y * W + W - 1);
  while (q.length) { const i = q.pop(); if (bg[i] || !isBg(i)) continue; bg[i] = 1; const x = i % W, y = (i / W) | 0; if (x > 0) q.push(i - 1); if (x < W - 1) q.push(i + 1); if (y > 0) q.push(i - W); if (y < H - 1) q.push(i + W); }
  return bg;
}
// Un SVG en escala de grises sobre fondo transparente → imagen RGBA con su máscara (alfa < 50 %)
async function fromSvg(svg) { const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); const bg = new Uint8Array(info.width * info.height); for (let i = 0; i < bg.length; i++) bg[i] = data[i * 4 + 3] < 128 ? 1 : 0; return reduce(data, info.width, info.height, bg); }
// Dos cartas: la de atrás vertical y más oscura; la de delante ladeada 14° a la derecha, más clara, con marco interior, brillo y un filo oscuro que la separa
const card = (x, y, w, h, face, frame, inner, extra) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${face}" ${extra || ''}/><rect x="${x + 14}" y="${y + 14}" width="${w - 28}" height="${h - 28}" rx="9" fill="${frame}"/><rect x="${x + 21}" y="${y + 21}" width="${w - 42}" height="${h - 42}" rx="6" fill="${inner}"/>`;
const CARDS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400"><defs>
 <linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b4b4b4"/><stop offset="1" stop-color="#6e6e6e"/></linearGradient>
 <linearGradient id="bi" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8c8c8c"/><stop offset="1" stop-color="#585858"/></linearGradient>
 <linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f4f4"/><stop offset="1" stop-color="#a6a6a6"/></linearGradient>
 <linearGradient id="fi" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d2d2d2"/><stop offset="1" stop-color="#8a8a8a"/></linearGradient></defs>
 ${card(92, 48, 156, 236, 'url(#b)', '#505050', 'url(#bi)')}
 <g transform="rotate(14 230 238)">${card(146, 110, 156, 236, 'url(#f)', '#6a6a6a', 'url(#fi)', 'stroke="#1c1c1c" stroke-width="9"')}<ellipse cx="190" cy="150" rx="26" ry="16" fill="#fff" opacity=".55" transform="rotate(-30 190 150)"/></g>
</svg>`;
const CAROUSEL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="400" height="400"><defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0f0f0"/><stop offset="1" stop-color="#8a8a8a"/></linearGradient></defs>
 <path transform="translate(2 2) scale(.84)" fill="url(#c)" d="M12 3a9 9 0 0 1 8.5 6h-3a6.2 6.2 0 0 0-11 0h-3A9 9 0 0 1 12 3zm0 18a9 9 0 0 1-8.5-6h3a6.2 6.2 0 0 0 11 0h3A9 9 0 0 1 12 21zm0-12a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/></svg>`;
(async () => {
  const { data, info } = await sharp(inp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  await tinted(reduce(data, info.width, info.height, whiteBg(data, info.width, info.height)), 'espadas', out);
  await tinted(await fromSvg(CARDS), 'cartas', out);
  await tinted(await fromSvg(CAROUSEL), 'carrusel', out);
  console.log('ok: espadas ×4, cartas ×4, carrusel ×2 en', out);
})().catch(e => { console.error(e); process.exit(1); });
