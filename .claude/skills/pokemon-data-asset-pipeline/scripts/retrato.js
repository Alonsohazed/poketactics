// Retrato estilo TFT a partir de un sprite (los de Pokémon GO de pokemondb.net): el Pokémon a la derecha, un aura de sus colores detrás
// y el lado izquierdo oscuro para sinergias y nombre.
// Uso: node retrato.js <sprite.png> <salida.webp> 828 512 carta 621 384   (retrato de la carta, public/art/<clave>.webp)
//      node retrato.js <sprite.png> <salida.webp> 552 342 centro 224 139   (miniatura centrada para cabezas redondas, public/art/t/<clave>.webp)
// Necesita sharp (fuera del proyecto, no es dependencia del juego): npm i sharp
// Encuadre a mano para los muy anchos (la cara a la derecha y arriba; el cuerpo se sale): alto=<fracción del alto> foco=<x>,<y> (la cara en el sprite) destino=<x>,<y> [suave=<sigma>]
//   Kyogre:   alto=.62 foco=.47,.6 destino=.7,.46 suave=.9
//   Giratina: alto=1.3 foco=.22,.55 destino=.76,.42
const sharp = require('sharp');
const opt = (k) => { const a = process.argv.find(v => v.startsWith(k + '=')); return a ? a.split('=')[1].split(',').map(Number) : null; };
const ALTO = opt('alto'), FOCO = opt('foco'), DEST = opt('destino') || [.72, .45];
const [inp, out, W = 828, H = 512, MODE = 'carta'] = process.argv.slice(2).map((v, i) => i > 1 && i < 4 ? +v : v);
// modo 'carta': Pokémon a la derecha y fundido a oscuro a la izquierda (sinergias y nombre); 'centro': centrado y sin fundido (cabezas redondas)
const CENTER = MODE === 'centro';

// colores dominantes del sprite (k-medias sobre los píxeles opacos, pesando los saturados)
function palette(data, ch, k = 3) {
  const px = []; for (let i = 0; i < data.length; i += ch) if (data[i + 3] > 200) px.push([data[i], data[i + 1], data[i + 2]]);
  const sat = p => { const mx = Math.max(...p), mn = Math.min(...p); return mx ? (mx - mn) / mx : 0; };
  let c = [0, .33, .66].map(f => px[Math.floor(f * px.length)]);
  for (let it = 0; it < 12; it++) {
    const acc = c.map(() => [0, 0, 0, 0]);
    for (const p of px) { let b = 0, bd = 1e9; c.forEach((q, j) => { const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (d < bd) { bd = d; b = j; } }); const w = .3 + sat(p); acc[b][0] += p[0] * w; acc[b][1] += p[1] * w; acc[b][2] += p[2] * w; acc[b][3] += w; }
    c = acc.map((a, j) => a[3] ? [a[0] / a[3], a[1] / a[3], a[2] / a[3], a[3]] : c[j]);
  }
  // más saturado y luminoso primero (el que manda en el aura)
  return c.map(q => { const mx = Math.max(q[0], q[1], q[2]), mn = Math.min(q[0], q[1], q[2]); return { rgb: q.slice(0, 3).map(Math.round), w: q[3], s: mx ? (mx - mn) / mx : 0, l: mx }; })
    .sort((a, b) => (b.s * .7 + b.l / 255 * .3) * Math.sqrt(b.w) - (a.s * .7 + a.l / 255 * .3) * Math.sqrt(a.w));
}
function accents(data, ch) {
  const bins = Array.from({ length: 36 }, () => ({ w: 0, r: 0, g: 0, b: 0, n: 0 })); let tot = 0;
  for (let i = 0; i < data.length; i += ch) { if (data[i + 3] < 200) continue; tot++; const r = data[i], g = data[i + 1], b = data[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx < 40) continue;
    const s = (mx - mn) / mx; if (s < .25) continue; let h = mx === mn ? 0 : mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4; h = (h * 60 + 360) % 360;
    const w = s * (mx / 255); const B = bins[Math.floor(h / 10)]; B.w += w; B.n++; B.r += r * w; B.g += g * w; B.b += b * w; }
  // los ojos o un detalle diminuto no deben teñir todo el aura: cada tono necesita al menos un 3 % de la figura
  const sm = bins.map((B, i) => ({ i, n: B.n + bins[(i + 35) % 36].n + bins[(i + 1) % 36].n, w: B.w + .5 * (bins[(i + 35) % 36].w + bins[(i + 1) % 36].w), c: B.w ? [B.r / B.w, B.g / B.w, B.b / B.w].map(Math.round) : null })).filter(B => B.c && B.n >= .03 * tot).sort((a, b) => b.w - a.w);
  if (!sm.length) return [];
  const out = [sm[0]]; for (const B of sm) { if (out.length >= 2) break; if (Math.min(Math.abs(B.i - out[0].i), 36 - Math.abs(B.i - out[0].i)) >= 4 && B.w > sm[0].w * .12) out.push(B); }
  return out.map(B => B.c);
}
const vivid = (rgb, f = 1.25) => { const m = (rgb[0] + rgb[1] + rgb[2]) / 3; return rgb.map(v => Math.max(0, Math.min(255, Math.round(m + (v - m) * f)))); };
const css = (rgb, a = 1) => `rgba(${rgb.join(',')},${a})`;

(async () => {
  const t = await sharp(inp).ensureAlpha().trim({ threshold: 1 }).raw().toBuffer({ resolveWithObject: true });
  const pal = palette(t.data, t.info.channels);
  const ac = accents(t.data, t.info.channels);
  const c1 = vivid(ac[0] || pal[0].rgb, 1.35), c2 = vivid(ac[1] || (pal[1] || pal[0]).rgb, 1.25), c3 = vivid(pal[0].rgb, 1.1);
  // sprite escalado (suave) hasta ~84 % del alto; los sprites pixelados primero se doblan sin suavizar y luego se suavizan
  // en la carta se recorta arriba y abajo (es más ancha que el retrato): margen de un 12 % arriba y un 9 % abajo
  const tall = Math.round(H * (ALTO ? ALTO[0] : CENTER ? .9 : .79)), maxW = ALTO ? 99999 : Math.round(W * (CENTER ? .9 : t.info.width / t.info.height > 1.6 ? .78 : .6)),   // los muy alargados (Kyogre) pueden ocupar más ancho
    small = (await sharp(inp).metadata()).width <= 128;   // pixel art (Bank: 128 px): escalado entero sin suavizar
  const spr = sharp(t.data, { raw: t.info });
  let sprBuf = small ? await spr.resize({ height: t.info.height * Math.max(1, Math.floor(Math.min(tall / t.info.height, maxW / t.info.width))), kernel: 'nearest' }).png().toBuffer() : await spr.resize({ height: tall, width: maxW, fit: 'inside', kernel: 'lanczos3' }).png().toBuffer();   // los muy anchos (Geodude, Kyogre) se limitan por el ancho
  // suave=<sigma>: un leve desenfoque para los sprites pequeños muy ampliados (si no, se ven los escalones de los píxeles)
  if (opt('suave')) sprBuf = await sharp(sprBuf).blur(opt('suave')[0]).png().toBuffer();
  const sm = await sharp(sprBuf).metadata(); let sw = sm.width, sh = sm.height;
  const cx = Math.round(W * (CENTER ? .5 : .68));
  let left = Math.round(CENTER ? Math.max(0, cx - sw / 2) : Math.min(W - sw - W * .03, Math.max(W * .42, cx - sw / 2))), top = H - sh - Math.round(H * (CENTER ? .04 : .09));
  let ax = left + sw / 2, ay = top + sh * .52, SHADOW = true;
  if (FOCO) {   // la cara en el destino; lo que se salga del retrato se recorta (y sin sombra en el suelo, que queda fuera)
    left = Math.round(DEST[0] * W - FOCO[0] * sw); top = Math.round(DEST[1] * H - FOCO[1] * sh); ax = DEST[0] * W; ay = DEST[1] * H; SHADOW = false;
    const x0 = Math.max(0, -left), y0 = Math.max(0, -top), x1 = Math.min(sw, W - left), y1 = Math.min(sh, H - top);
    sprBuf = await sharp(sprBuf).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).png().toBuffer();
    left += x0; top += y0; sw = x1 - x0; sh = y1 - y0;
  }
  // fondo: oscuro con el aura de sus colores detrás del Pokémon
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>
    <radialGradient id="a" cx="${ax / W}" cy="${ay / H}" r="${.62}" gradientUnits="objectBoundingBox" fx="${ax / W}" fy="${ay / H}">
      <stop offset="0" stop-color="${css(c1, 1)}"/><stop offset=".3" stop-color="${css(c1, .55)}"/><stop offset=".62" stop-color="${css(c2, .2)}"/><stop offset="1" stop-color="${css(c2, 0)}"/></radialGradient>
    <radialGradient id="b" cx="${(ax + sw * .3) / W}" cy="${(ay - sh * .35) / H}" r=".38"><stop offset="0" stop-color="${css(c2, .7)}"/><stop offset="1" stop-color="${css(c2, 0)}"/></radialGradient>
    <radialGradient id="c" cx="${(ax - sw * .35) / W}" cy="${(ay + sh * .3) / H}" r=".32"><stop offset="0" stop-color="${css(c3, .35)}"/><stop offset="1" stop-color="${css(c3, 0)}"/></radialGradient>
    <linearGradient id="v" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#070a12"/><stop offset=".22" stop-color="#070a12" stop-opacity=".92"/><stop offset=".5" stop-color="#070a12" stop-opacity=".25"/><stop offset=".7" stop-color="#070a12" stop-opacity="0"/></linearGradient>
    <linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>
  </defs><rect width="100%" height="100%" fill="#0b0f1c"/><rect width="100%" height="100%" fill="url(#a)"/><rect width="100%" height="100%" fill="url(#b)"/><rect width="100%" height="100%" fill="url(#c)"/></svg>`);
  // motas de luz suaves del color del aura (siempre las mismas para un mismo sprite)
  let seed = [...inp].reduce((a, ch) => a * 31 + ch.charCodeAt(0) >>> 0, 7); const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  const motes = Array.from({ length: 26 }, () => { const r = 1 + rnd() * 3.5, x = W * (.35 + rnd() * .65), y = H * rnd(), c = rnd() < .6 ? c1 : c2; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${css(vivid(c, 1.1).map(v => Math.min(255, v + 60)), (.25 + rnd() * .45).toFixed(2))}"/>`; }).join('');
  const motesSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="g"><feGaussianBlur stdDeviation="1.6"/></filter></defs><g filter="url(#g)">${motes}</g></svg>`);
  // halo: la silueta del Pokémon desenfocada y teñida con su color (le da el brillo de borde)
  const sil = await sharp(sprBuf).ensureAlpha().composite([{ input: { create: { width: sw, height: sh, channels: 4, background: { r: Math.min(255, c1[0] + 40), g: Math.min(255, c1[1] + 40), b: Math.min(255, c1[2] + 40), alpha: 1 } } }, blend: 'in' }]).png().toBuffer();
  const pad = 60;
  const halo = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: sil, left, top }]).blur(22).png().toBuffer();
  const haloDim = await sharp(halo).ensureAlpha().linear([1, 1, 1, 1], [0, 0, 0, 0]).png().toBuffer();
  // sombra de contacto bajo el Pokémon
  const shadow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="s"><feGaussianBlur stdDeviation="10"/></filter></defs><ellipse cx="${ax}" cy="${top + sh - 4}" rx="${sw * .42}" ry="${sh * .055}" fill="#000" opacity=".55" filter="url(#s)"/></svg>`);
  // luz cálida por encima, tono de color y fundido a oscuro a la izquierda y abajo
  const over = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>
    <linearGradient id="v" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#070a12"/><stop offset=".2" stop-color="#070a12" stop-opacity=".9"/><stop offset=".46" stop-color="#070a12" stop-opacity=".2"/><stop offset=".62" stop-color="#070a12" stop-opacity="0"/></linearGradient>
    <linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset=".68" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>
    <radialGradient id="r" cx="${ax / W}" cy="${(ay - sh * .2) / H}" r=".3"><stop offset="0" stop-color="${css(c1, .16)}"/><stop offset="1" stop-color="${css(c1, 0)}"/></radialGradient>
  </defs><rect width="100%" height="100%" fill="url(#r)"/>${CENTER ? "" : "<rect width=\"100%\" height=\"100%\" fill=\"url(#v)\"/>"}<rect width="100%" height="100%" fill="url(#d)"/></svg>`);
  const img = await sharp(bg).composite([
    { input: motesSvg, left: 0, top: 0 },
    { input: haloDim, left: 0, top: 0 },
    ...(SHADOW ? [{ input: shadow, left: 0, top: 0 }] : []),
    { input: sprBuf, left, top },
    { input: over, left: 0, top: 0 },
  ]).png().toBuffer();
  const fin = sharp(img); await (out.endsWith('.webp') ? fin.resize(+process.argv[7] || W, +process.argv[8] || H, { kernel: 'lanczos3' }).webp({ quality: 80, alphaQuality: 90, effort: 6 }) : fin.png()).toFile(out);
  console.log(out.split('/').pop(), 'paleta', pal.map(p => p.rgb.join(',')).join(' | '));
})();
