// Halo dorado de energía del Eevee del gacha (menú): un anillo elíptico inclinado con resplandor, vetas claras, arcos, rayos y destellos
// (como el anillo azul de los «chibis» de TFT, en dorado). Dos capas: halo-oro.webp (detrás del sprite) y halo-oro-frente.webp (solo la parte baja,
// por delante del sprite, para que Eevee quede «dentro» del anillo; sin resplandor difuso, que dejaría ver el corte). node halo-oro.js <carpeta de salida>   (sharp fuera del proyecto: NODE_PATH)
const sharp = require('sharp');
const out = process.argv[2] || '.';
const S = 560, CX = 280, CY = 290, RX = 200, RY = 150;
const star = (x, y, r, o = 1) => `<path d="M${x} ${y - r}C${x + r * .18} ${y - r * .18} ${x + r * .18} ${y - r * .18} ${x + r} ${y}C${x + r * .18} ${y + r * .18} ${x + r * .18} ${y + r * .18} ${x} ${y + r}C${x - r * .18} ${y + r * .18} ${x - r * .18} ${y + r * .18} ${x - r} ${y}C${x - r * .18} ${y - r * .18} ${x - r * .18} ${y - r * .18} ${x} ${y - r}Z" fill="#fff8d6" opacity="${o}"/>`;
const bolt = pts => `<polyline points="${pts}" fill="none" stroke="#fffbe8" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round" opacity=".95"/>`;
const E = (rx, ry, extra) => `<ellipse cx="${CX}" cy="${CY}" rx="${rx}" ry="${ry}" fill="none" ${extra}/>`;
const defs = `<defs>
 <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff4b8"/><stop offset=".45" stop-color="#ffc63a"/><stop offset="1" stop-color="#ff8a12"/></linearGradient>
 <radialGradient id="in" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffb347" stop-opacity=".5"/><stop offset=".72" stop-color="#ff8a12" stop-opacity=".28"/><stop offset="1" stop-color="#ff8a12" stop-opacity="0"/></radialGradient>
 <filter id="b16" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter>
 <filter id="b2"><feGaussianBlur stdDeviation="1.6"/></filter>
 <filter id="b5" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>
 <clipPath id="low"><rect x="0" y="${CY + 70}" width="${S}" height="${S}"/></clipPath>
</defs>`;
const ring = (front) => `<g transform="rotate(-18 ${CX} ${CY})" ${front ? 'clip-path="url(#low)"' : ''}>
 ${front ? '' : `<ellipse cx="${CX}" cy="${CY}" rx="${RX}" ry="${RY}" fill="url(#in)"/>`}
 ${front ? '' : E(RX, RY, 'stroke="#ff9a1a" stroke-width="90" opacity=".42" filter="url(#b16)"')}
 ${E(RX, RY, 'stroke="url(#g)" stroke-width="46" opacity=".96"')}
 ${front ? '' : E(RX, RY, 'stroke="#ffe9a0" stroke-width="14" opacity=".55" filter="url(#b5)"')}
 ${E(RX + 4, RY + 3, 'stroke="#fff8d0" stroke-width="7" stroke-dasharray="210 70 120 50 300 60" opacity=".9" filter="url(#b2)"')}
 ${E(RX - 10, RY - 8, 'stroke="#fff3b0" stroke-width="4" stroke-dasharray="150 260 70 190 40 120" opacity=".75"')}
 ${E(RX + 30, RY + 24, 'stroke="#fff3b0" stroke-width="4" stroke-dasharray="90 240 60 300 30 160" opacity=".75"')}
 ${E(RX + 52, RY + 42, 'stroke="#ffd56a" stroke-width="2.5" stroke-dasharray="60 320 40 260" opacity=".6"')}
 ${bolt('470,205 486,222 472,232 492,252')}${bolt('112,352 96,372 112,382 94,404')}${bolt('300,440 318,448 306,462 326,470')}${bolt('160,160 176,150 170,170 190,166')}
</g>`;
const sparks = `${star(476, 150, 14)}${star(98, 318, 11)}${star(372, 452, 12)}${star(150, 190, 8, .9)}${star(455, 300, 7, .85)}${star(236, 128, 9, .9)}${star(330, 118, 6, .8)}${star(130, 430, 7, .85)}`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${defs}${body}</svg>`;
(async () => {
  await sharp(Buffer.from(svg(ring(false) + sparks))).webp({ quality: 92, alphaQuality: 100 }).toFile(`${out}/halo-oro.webp`);
  await sharp(Buffer.from(svg(ring(true)))).webp({ quality: 92, alphaQuality: 100 }).toFile(`${out}/halo-oro-frente.webp`);
  console.log('ok: halo-oro.webp y halo-oro-frente.webp en', out);
})().catch(e => { console.error(e); process.exit(1); });
