// Iconos de aumento al estilo de los de TFT (propios, no copiados): un solo glifo del color de la rareza con tres tonos,
// halo suave, detalles con huecos finos (sin contornos) y una pieza principal con estelas en arco, destellos, flechas o «?»
// que cuentan qué hace el aumento. Los aumentos de héroe no llevan icono propio (siguen con su Pokémon).
// Piezas en iconos-tft-lib.js; dibujos por rareza en iconos-tft-prismaticos.js, iconos-tft-oro.js e iconos-tft-plata.js
// (cada uno: id → función que devuelve [piezas en grises, cortes]). Este script los tiñe con la rareza del aumento
// (Plata, Oro o Prismático, este con un reflejo tornasolado) y monta una hoja de revisión en el orden del Excel.
// Uso: NODE_PATH=<node_modules con sharp> node iconos-aumentos-tft.js <carpeta_salida> [todos | ids,… | desde-hasta] [hoja.png] [cartas.png]
const sharp=require('sharp'), fs=require('fs'), path=require('path'), vm=require('vm');
const [OUT,SEL,HOJA,CARTAS]=process.argv.slice(2); fs.mkdirSync(OUT,{recursive:true});
const RAIZ=path.resolve(__dirname,'../../../..');
const DIB={}; for(const m of ['prismaticos','oro','plata']){ const p=path.join(__dirname,`iconos-tft-${m}.js`); if(fs.existsSync(p)) Object.assign(DIB,require(p)); }
const src=['augments.js','game.js'].map(f=>fs.readFileSync(path.join(RAIZ,'public',f),'utf8')).join('\n');
const ctx={__SERVER__:true,HEADLESS:true,console,setTimeout,clearTimeout,setInterval,clearInterval,module:{exports:{}},require,performance:{now:()=>Date.now()}}; ctx.globalThis=ctx; ctx.self=ctx;
vm.runInNewContext(src+'\n;globalThis.__A=AUGS;',ctx,{filename:'motor.js'});
const ORD={P:0,G:1,S:2};
const augs=[...ctx.__A].sort((a,b)=>ORD[a.tier]-ORD[b.tier]||a.name.localeCompare(b.name,'es'));
const RAREZA={
 S:{nombre:'Plata',mapa:['#2F4563','#93A9C6','#EEF4FF'],halo:'#9FB8DA'},
 G:{nombre:'Oro',mapa:['#7A4E08','#F0B42C','#FFF3B8'],halo:'#F5C33B'},
 P:{nombre:'Prismático',mapa:['#4E3A9E','#B99CF5','#FFFFFF'],halo:'#B38CFF',tornasol:true},
};
let N=0; const uid=p=>p+(N++);
function svgDe(a,lado=512){
 const R=RAREZA[a.tier], [piezas,cortes]=DIB[a.id](), m=uid('m'), fl=uid('f'), gr=uid('g'), mk=uid('k');
 const tabla=i=>R.mapa.map(h=>(parseInt(h.slice(1+2*i,3+2*i),16)/255).toFixed(3)).join(' ');
 const tornasol=R.tornasol?`<linearGradient id="${gr}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF8AD8"/><stop offset=".3" stop-color="#8AE8FF"/><stop offset=".55" stop-color="#FFF08A"/><stop offset=".8" stop-color="#C08AFF"/><stop offset="1" stop-color="#FF9AD0"/></linearGradient>`+
  `<mask id="${mk}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><g mask="url(#${m})">${piezas}</g></mask>`:'';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 512 512"><defs>
  <mask id="${m}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><rect width="512" height="512" fill="#fff"/>${cortes}</mask>
  <filter id="${fl}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
   <feComponentTransfer in="SourceGraphic" result="col"><feFuncR type="table" tableValues="${tabla(0)}"/><feFuncG type="table" tableValues="${tabla(1)}"/><feFuncB type="table" tableValues="${tabla(2)}"/></feComponentTransfer>
   <feGaussianBlur in="SourceAlpha" stdDeviation="12" result="b"/><feFlood flood-color="${R.halo}" flood-opacity=".5"/><feComposite in2="b" operator="in" result="halo"/>
   <feMerge><feMergeNode in="halo"/><feMergeNode in="col"/></feMerge></filter>${tornasol}</defs>
  <g filter="url(#${fl})"><g mask="url(#${m})">${piezas}</g></g>${R.tornasol?`<rect width="512" height="512" fill="url(#${gr})" mask="url(#${mk})" opacity=".55"/>`:''}</svg>`;
}
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
function partir(t,max){ const out=[]; let l=''; for(const w of t.split(' ')){ if((l+' '+w).trim().length>max){ out.push(l.trim()); l=w; } else l+=' '+w; } if(l.trim()) out.push(l.trim()); return out; }
(async()=>{
 let lista=augs.filter(a=>!a.hero);
 if(SEL&&/^\d+-\d+$/.test(SEL)){ const [x,y]=SEL.split('-').map(Number); lista=augs.slice(x-1,y).filter(a=>!a.hero); } else if(SEL&&SEL!=='todos') lista=lista.filter(a=>SEL.split(',').includes(a.id));
 const hechos=[], faltan=[];
 for(const a of lista){ if(!DIB[a.id]){ faltan.push(a.id); continue; } const svg=svgDe(a); fs.writeFileSync(path.join(OUT,a.id+'.svg'),svg); const png=await sharp(Buffer.from(svg)).png().toBuffer(); await sharp(png).toFile(path.join(OUT,a.id+'.png')); await sharp(png).resize(256,256).webp({quality:80,alphaQuality:80,effort:6}).toFile(path.join(OUT,a.id+'.webp')); hechos.push(a); }
 if(HOJA&&hechos.length){
  const Cc=200, Tt=46, Pp=14, COLS=Math.min(hechos.length>100?12:8,hechos.length), filas=Math.ceil(hechos.length/COLS), comp=[];
  for(let i=0;i<hechos.length;i++){ const a=hechos[i], x=Pp+(i%COLS)*Cc, y=Pp+Math.floor(i/COLS)*(Cc+Tt), n=augs.indexOf(a)+1;
   comp.push({input:await sharp(path.join(OUT,a.id+'.png')).resize(Cc-14,Cc-14).png().toBuffer(),left:x+7,top:y});
   const fs_=a.name.length>24?12:a.name.length>18?13.5:15;
   comp.push({input:Buffer.from(`<svg width="${Cc}" height="${Tt}"><text x="${Cc/2}" y="17" font-family="Segoe UI" font-weight="600" font-size="${fs_}" fill="#f2f2f2" text-anchor="middle">${esc(a.name)}</text><text x="${Cc/2}" y="36" font-family="Segoe UI" font-size="12" fill="${RAREZA[a.tier].halo}" text-anchor="middle">${n} · ${RAREZA[a.tier].nombre}</text></svg>`),left:x,top:y+Cc-8}); }
  await sharp({create:{width:Pp*2+COLS*Cc,height:Pp*2+filas*(Cc+Tt),channels:4,background:'#0b0a09'}}).composite(comp).png().toFile(HOJA);
 }
 if(CARTAS&&hechos.length){ // muestra dentro de la carta del juego (img/aug-carta-<rareza>.webp, con las medidas de .augCard3)
  const W=340, H=Math.round(W*1040/720), X=W*.485, cartas=[];
  for(const a of hechos.slice(0,10)){ const marco=await sharp(path.join(RAIZ,`public/img/aug-carta-${a.tier}.webp`)).resize(W,H).png().toBuffer();
   const s=Math.round(W*.3682), ico=await sharp(path.join(OUT,a.id+'.png')).resize(s,s).png().toBuffer(), lin=partir(a.desc,34).slice(0,8);
   const txt=Buffer.from(`<svg width="${W}" height="${H}"><text x="${X}" y="${H*.498+9}" font-family="Georgia" font-weight="bold" font-size="${a.name.length>18?21:25}" fill="#f6f0ff" text-anchor="middle">${esc(a.name)}</text>${lin.map((l,i)=>`<text x="${X}" y="${H*.575+15+i*19}" font-family="Segoe UI" font-weight="600" font-size="14" fill="#eee8fa" text-anchor="middle">${esc(l)}</text>`).join('')}</svg>`);
   cartas.push(await sharp(marco).composite([{input:ico,left:Math.round(W*.3086),top:Math.round(H*.1581)},{input:txt,left:0,top:0}]).png().toBuffer()); }
  const C=5, Pp=18, filas=Math.ceil(cartas.length/C);
  await sharp({create:{width:Pp+C*(W+Pp),height:Pp+filas*(H+Pp),channels:4,background:'#14161c'}}).composite(cartas.map((b,i)=>({input:b,left:Pp+(i%C)*(W+Pp),top:Pp+Math.floor(i/C)*(H+Pp)}))).png().toFile(CARTAS);
 }
 console.log('OK',hechos.length,'iconos estilo TFT',faltan.length?`· sin dibujo (${faltan.length}): `+faltan.join(' '):'');
})();
