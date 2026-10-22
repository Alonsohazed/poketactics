// Imágenes de los efectos de colocación de sinergias (dibujadas aquí, sin arte de terceros):
//  public/img/fx/escudo.webp  Guardián: escudo de cristal translúcido (se ve la ficha a través), filo plateado y un brillo verde dentro
//  public/img/fx/burbuja.webp Coloso: campo de fuerza esférico, casi transparente en el centro y más visible en el borde
// Uso: node efectos-sinergia.js <carpeta de salida>   (necesita sharp, fuera del proyecto: npm i sharp)
const sharp = require('sharp'); const path = require('path'), fs = require('fs');
const OUT = process.argv[2] || 'public/img/fx';
fs.mkdirSync(OUT, { recursive: true });

// contorno del escudo heráldico en una caja de 200×232, i píxeles hacia dentro
const shield = i => `M${14 + i} ${32 + i} Q56 ${28 + i} 100 ${10 + i} Q144 ${28 + i} ${186 - i} ${32 + i} L${186 - i} 106 Q${182 - i} ${176 - i * .4} 100 ${222 - i} Q${18 + i} ${176 - i * .4} ${14 + i} 106 Z`;
const escudo = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="232" viewBox="0 0 200 232"><defs>
  <linearGradient id="filo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#d8eef4"/><stop offset="1" stop-color="#8fb3c4"/></linearGradient>
  <linearGradient id="cristal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2fdff" stop-opacity=".5"/><stop offset=".55" stop-color="#bfeaf2" stop-opacity=".24"/><stop offset="1" stop-color="#8fcfdc" stop-opacity=".38"/></linearGradient>
  <radialGradient id="nucleo" cx=".5" cy=".42" r=".42"><stop offset="0" stop-color="#d9ffb0" stop-opacity=".7"/><stop offset=".35" stop-color="#7ee08a" stop-opacity=".3"/><stop offset="1" stop-color="#3fbf8a" stop-opacity="0"/></radialGradient>
  <linearGradient id="reflejo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".5"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
  <filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>
  <filter id="b2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
  <path d="${shield(0)} ${shield(9)}" fill="#bfe9f2" fill-rule="evenodd" opacity=".45" filter="url(#b2)"/>
  <path d="${shield(9)}" fill="url(#cristal)"/>
  <path d="${shield(9)}" fill="url(#nucleo)"/>
  <path d="${shield(0)} ${shield(9)}" fill="url(#filo)" fill-rule="evenodd"/>
  <path d="${shield(21)}" fill="none" stroke="#ffffff" stroke-opacity=".5" stroke-width="2.5"/>
  <path d="M100 60 L106 96 L100 104 L94 96 Z" fill="#f4ffd6" opacity=".9" filter="url(#b)"/>
  <circle cx="100" cy="98" r="9" fill="#ffffff" opacity=".8" filter="url(#b)"/>
  <path d="M28 42 Q68 32 94 20 L58 122 L28 112 Z" fill="url(#reflejo)" opacity=".6"/>
</svg>`;
// burbuja: borde con brillo (como el reflejo en una esfera), centro casi transparente, un reflejo arriba a la izquierda y facetas muy tenues
const N = 256, C = N / 2;
const facetas = [[.32, .28, .58, .36, .44, .58], [.6, .3, .78, .5, .58, .52], [.28, .62, .46, .78, .2, .74], [.62, .64, .8, .58, .7, .8]]
  .map(p => `<polygon points="${[0, 2, 4].map(i => (p[i] * N).toFixed(1) + ',' + (p[i + 1] * N).toFixed(1)).join(' ')}" fill="#e6fff2" opacity=".08"/>`).join('');
const burbuja = `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}"><defs>
  <radialGradient id="esf" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff" stop-opacity=".03"/><stop offset=".72" stop-color="#e9fff4" stop-opacity=".07"/><stop offset=".9" stop-color="#f2fff8" stop-opacity=".28"/><stop offset=".97" stop-color="#ffffff" stop-opacity=".6"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  <radialGradient id="ref" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  <filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.2"/></filter>
</defs><circle cx="${C}" cy="${C}" r="${C - 2}" fill="url(#esf)"/>${facetas}<ellipse cx="${N * .36}" cy="${N * .27}" rx="${N * .16}" ry="${N * .09}" transform="rotate(-28 ${N * .36} ${N * .27})" fill="url(#ref)" filter="url(#b)"/></svg>`;
(async () => {
  await sharp(Buffer.from(escudo)).webp({ quality: 88, alphaQuality: 90, effort: 6 }).toFile(path.join(OUT, 'escudo.webp'));
  await sharp(Buffer.from(burbuja)).webp({ quality: 88, alphaQuality: 90, effort: 6 }).toFile(path.join(OUT, 'burbuja.webp'));
  for (const f of ['escudo.webp', 'burbuja.webp']) console.log(f, fs.statSync(path.join(OUT, f)).size, 'bytes');
})();
