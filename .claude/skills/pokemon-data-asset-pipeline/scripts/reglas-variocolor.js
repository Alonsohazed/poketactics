// Deriva, por forma, las reglas de recolor «h0-h1/s0/toH/val/sat» comparando píxel a píxel el sprite normal con el variocolor
// (los sprites de GO son la misma imagen recoloreada). Agrupa los píxeles del normal por tono (12 cubos) y saturación, y para cada
// grupo que cambia de verdad calcula el tono destino (mediana), el cociente de brillo y el de saturación. Salida: reglas.json {dex: 'rc:…' | ''}.
const fs = require('fs'), path = require('path'); const sharp = require('sharp');
const D = __dirname, GO = path.join(D, 'go');
const forms = JSON.parse(fs.readFileSync(path.join(D, 'formas.json'), 'utf8'));
const hsv = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d > 1e-4) { if (mx === r) h = ((g - b) / d + 6) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h /= 6; } return [h, mx > 0 ? d / mx : 0, mx]; };
const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const circMean = hs => { let x = 0, y = 0; for (const h of hs) { x += Math.cos(h * 2 * Math.PI); y += Math.sin(h * 2 * Math.PI); } let h = Math.atan2(y, x) / (2 * Math.PI); return (h + 1) % 1; };
(async () => {
  const out = {}, resumen = [];
  for (const f of forms) {
    const a = path.join(GO, f.dex + '.png'), b = path.join(GO, f.dex + '-s.png'); if (!fs.existsSync(a) || !fs.existsSync(b)) { out[f.dex] = null; continue; }
    const A = await sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), B = await sharp(b).resize(A.info.width, A.info.height).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const groups = new Map(); // clave: cubo de tono (12) + saturado/pastel
    for (let i = 0; i < A.data.length; i += 4) {
      if (A.data[i + 3] < 200 || B.data[i + 3] < 200) continue;
      const [h, s, v] = hsv(A.data[i], A.data[i + 1], A.data[i + 2]); if (v < .12) continue; // negros y contornos no se tocan
      const [h2, s2, v2] = hsv(B.data[i], B.data[i + 1], B.data[i + 2]);
      const k = (s < .25 ? 'p' : 's') + Math.floor(h * 12); let g = groups.get(k); if (!g) groups.set(k, g = { n: 0, dh: [], vr: [], sr: [], hs: [], ss: [], ch: 0 });
      g.n++; g.hs.push(h); g.ss.push(s); let dh = Math.abs(h2 - h); dh = Math.min(dh, 1 - dh);
      const changed = (s > .2 && dh > .04) || Math.abs(v2 - v) > .12 || Math.abs(s2 - s) > .18; if (changed) g.ch++;
      g.dh.push(h2); g.vr.push(v2 / Math.max(.05, v)); g.sr.push(s > .15 ? s2 / s : (s2 > .3 ? 2 : 1));
    }
    const total = [...groups.values()].reduce((a, g) => a + g.n, 0);
    const rules = [];
    for (const [k, g] of groups) {
      if (g.n < total * .025 || g.ch < g.n * .5) continue; // grupos pequeños o que apenas cambian
      const h0 = Math.floor(parseInt(k.slice(1)) * 100 / 12) / 100, h1 = Math.ceil((parseInt(k.slice(1)) + 1) * 100 / 12) / 100;
      const toH = circMean(g.dh), val = med(g.vr), sat = Math.min(2.5, med(g.sr));
      const sameHue = (() => { let d = Math.abs(toH - circMean(g.hs)); d = Math.min(d, 1 - d); return d < .03; })();
      rules.push({ h0, h1, s0: k[0] === 'p' ? 0 : .2, toH: sameHue ? -1 : +toH.toFixed(3), val: +Math.min(2, Math.max(.08, val)).toFixed(2), sat: +Math.max(.1, sat).toFixed(2), n: g.n });
    }
    rules.sort((x, y) => y.n - x.n); const R = rules.slice(0, 4);
    // cubos pastel y saturados del mismo tono con el mismo destino se dejan tal cual: cada uno es una regla (s0 distinto)
    out[f.dex] = R.length ? 'rc:' + R.map(r => `${r.h0}-${r.h1}/${r.s0}/${r.toH}/${r.val}/${r.sat}`).join(',') : '';
    resumen.push(`${f.dex} ${f.name}: ${R.length ? R.map(r => `${r.h0}-${r.h1}${r.s0 ? '' : 'p'}→${r.toH < 0 ? '=' : r.toH} v${r.val} s${r.sat}`).join(' | ') : 'sin cambios'}`);
  }
  fs.writeFileSync(path.join(D, 'reglas.json'), JSON.stringify(out, null, 1)); fs.writeFileSync(path.join(D, 'reglas.txt'), resumen.join('\n'));
  console.log('formas con reglas', Object.values(out).filter(Boolean).length, '| sin cambios', Object.values(out).filter(v => v === '').length, '| sin sprites', Object.values(out).filter(v => v === null).length);
})();
