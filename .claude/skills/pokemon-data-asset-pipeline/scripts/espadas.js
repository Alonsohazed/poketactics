// Espadas cruzadas de la barra de fases: quita el fondo blanco (relleno desde los bordes, así no se agujerean los brillos de la hoja),
// recorta, y genera 3 versiones teñidas conservando el relieve por la luminosidad, con un borde negro fino.
// node espadas.js <entrada.png> <carpeta de salida>
const sharp = require('sharp'); // sharp fuera del proyecto (como optimizar-modelo.mjs): NODE_PATH o una carpeta con sharp instalado
const [inp, out] = process.argv.slice(2);
(async () => {
  const { data, info } = await sharp(inp).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); const W = info.width, H = info.height;
  const px = i => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]], bg = new Uint8Array(W * H);
  const isBg = i => { const [r, g, b] = px(i), mx = Math.max(r, g, b), mn = Math.min(r, g, b); return (mn > 200 && mx - mn < 22) || ((i / W | 0) > H * .74 && mn > 150 && mx - mn < 30); }; // blanco o gris claro poco saturado (sombra del suelo)
  const q = []; for (let x = 0; x < W; x++) { q.push(x, (H - 1) * W + x); } for (let y = 0; y < H; y++) { q.push(y * W, y * W + W - 1); }
  while (q.length) { const i = q.pop(); if (bg[i] || !isBg(i)) continue; bg[i] = 1; const x = i % W, y = (i / W) | 0; if (x > 0) q.push(i - 1); if (x < W - 1) q.push(i + 1); if (y > 0) q.push(i - W); if (y < H - 1) q.push(i + W); }
  // caja de la figura
  let x0 = W, y0 = H, x1 = 0, y1 = 0; for (let i = 0; i < W * H; i++) if (!bg[i]) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const S = 160, pad = 6, side = Math.max(x1 - x0, y1 - y0) + 1, k = (S - 2 * pad) / side, ox = pad + ((S - 2 * pad) - (x1 - x0 + 1) * k) / 2, oy = pad + ((S - 2 * pad) - (y1 - y0 + 1) * k) / 2;
  // alfa y luminosidad reducidas (muestreo por área: bordes suaves)
  const A = new Float32Array(S * S), L = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let a = 0, l = 0, n = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) { const fx = x0 + (x + (sx + .5) / 4 - ox) / k, fy = y0 + (y + (sy + .5) / 4 - oy) / k; n++; if (fx < 0 || fy < 0 || fx >= W || fy >= H) continue; const i = (fy | 0) * W + (fx | 0); if (bg[i]) continue; const [r, g, b] = px(i); a++; l += (.3 * r + .59 * g + .11 * b) / 255; }
    A[y * S + x] = a / n; L[y * S + x] = a ? l / a : 0; }
  // contraste de la luminosidad (para que el relieve se lea en cualquier color)
  let lo = 1, hi = 0; for (let i = 0; i < S * S; i++) if (A[i] > .5) { lo = Math.min(lo, L[i]); hi = Math.max(hi, L[i]); }
  // borde: dilatación del alfa 2,5 px
  const R = 2.5, B = new Float32Array(S * S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let m = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const d = Math.hypot(dx, dy); if (d > R + .5) continue; const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue; m = Math.max(m, A[yy * S + xx] * Math.min(1, R + .5 - d)); } B[y * S + x] = m; }
  const tints = { neutra: [[34, 58, 78], [176, 204, 224]], gana: [[18, 92, 44], [150, 240, 160]], pierde: [[120, 18, 18], [255, 150, 140]] };
  for (const [name, [d, l]] of Object.entries(tints)) {
    const o = Buffer.alloc(S * S * 4);
    for (let i = 0; i < S * S; i++) { const t = Math.min(1, Math.max(0, (L[i] - lo) / (hi - lo || 1))), a = A[i], c = d.map((v, j) => v + (l[j] - v) * Math.pow(t, .85));
      // color sobre el borde negro
      const ab = B[i], aa = a + ab * (1 - a); for (let j = 0; j < 3; j++) o[i * 4 + j] = aa ? Math.round(c[j] * a / aa) : 0; o[i * 4 + 3] = Math.round(aa * 255); }
    await sharp(o, { raw: { width: S, height: S, channels: 4 } }).webp({ quality: 90, alphaQuality: 100 }).toFile(`${out}/espadas-${name}.webp`);
  }
  console.log('ok', W, H, 'caja', x0, y0, x1, y1);
})().catch(e => { console.error(e); process.exit(1); });
