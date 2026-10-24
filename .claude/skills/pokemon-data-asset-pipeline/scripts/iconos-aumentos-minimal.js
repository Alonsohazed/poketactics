// Iconos de los aumentos en 2D minimalista, según las fichas del Excel (iconos-aumentos-ideas.js) y su «Guía de estilo».
// Piezas comunes en iconos-min-lib.js; dibujos por rareza en iconos-min-prismaticos.js, iconos-min-oro.js e iconos-min-plata.js.
// Uso: NODE_PATH=<node_modules con sharp> node iconos-aumentos-minimal.js <carpeta_salida> [ids separados por comas | desde-hasta (n.º del Excel)] [hoja.png]
// Deja <id>.svg, <id>.png (512 px) y <id>.webp (256 px) y, si se indica, una hoja de revisión con nombre y rareza en el orden del Excel.
const sharp=require('sharp'), fs=require('fs'), path=require('path'), vm=require('vm');
const {I}=require('./iconos-aumentos-ideas.js');
const [OUT,SEL,HOJA]=process.argv.slice(2); fs.mkdirSync(OUT,{recursive:true});
const ICONOS={}; for(const m of ['prismaticos','oro','plata']){ const p=path.join(__dirname,`iconos-min-${m}.js`); if(fs.existsSync(p)) Object.assign(ICONOS,require(p)); }
// orden del Excel: rareza (Prismático, Oro, Plata) y nombre
const RAIZ=path.resolve(__dirname,'../../../..'), src=['augments.js','game.js'].map(f=>fs.readFileSync(path.join(RAIZ,'public',f),'utf8')).join('\n');
const ctx={__SERVER__:true,HEADLESS:true,console,setTimeout,clearTimeout,setInterval,clearInterval,module:{exports:{}},require,performance:{now:()=>Date.now()}}; ctx.globalThis=ctx; ctx.self=ctx;
vm.runInNewContext(src+'\n;globalThis.__A=AUGS;',ctx,{filename:'motor.js'});
const ORD={P:0,G:1,S:2}, RZ={P:'Prismático',G:'Oro',S:'Plata'}, RC={P:'#C8A8FF',G:'#E9CF95',S:'#D6DBE2'};
const augs=[...ctx.__A].sort((a,b)=>ORD[a.tier]-ORD[b.tier]||a.name.localeCompare(b.name,'es'));
let lista=augs;
if(SEL&&/^\d+-\d+$/.test(SEL)){ const [a,b]=SEL.split('-').map(Number); lista=augs.slice(a-1,b); } else if(SEL&&SEL!=='todos') lista=augs.filter(a=>SEL.split(',').includes(a.id));
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
(async()=>{
 const hechos=[], faltan=[];
 for(const a of lista){
  if(!ICONOS[a.id]){ faltan.push(a.id); continue; }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${ICONOS[a.id]()}</svg>`;
  fs.writeFileSync(path.join(OUT,a.id+'.svg'),svg);
  const png=await sharp(Buffer.from(svg)).png().toBuffer();
  await sharp(png).toFile(path.join(OUT,a.id+'.png')); await sharp(png).resize(256,256).webp({quality:90}).toFile(path.join(OUT,a.id+'.webp')); hechos.push(a);
 }
 if(HOJA&&hechos.length){
  const Cc=210, Tt=48, Pp=14, COLS=Math.min(hechos.length>100?12:8,hechos.length), filas=Math.ceil(hechos.length/COLS), comp=[];
  for(let i=0;i<hechos.length;i++){ const a=hechos[i], x=Pp+(i%COLS)*Cc, y=Pp+Math.floor(i/COLS)*(Cc+Tt), n=augs.indexOf(a)+1;
   comp.push({input:await sharp(path.join(OUT,a.id+'.png')).resize(Cc-14,Cc-14).png().toBuffer(),left:x+7,top:y});
   const fs_=a.name.length>24?12.5:a.name.length>18?14:15.5;
   comp.push({input:Buffer.from(`<svg width="${Cc}" height="${Tt}"><text x="${Cc/2}" y="18" font-family="Segoe UI" font-weight="600" font-size="${fs_}" fill="#f2f2f2" text-anchor="middle">${esc(a.name)}</text><text x="${Cc/2}" y="37" font-family="Segoe UI" font-size="12" fill="${RC[a.tier]}" text-anchor="middle">${n} · ${RZ[a.tier]}</text></svg>`),left:x,top:y+Cc-8}); }
  await sharp({create:{width:Pp*2+COLS*Cc,height:Pp*2+filas*(Cc+Tt),channels:4,background:'#0b0a09'}}).composite(comp).png().toFile(HOJA);
 }
 console.log('OK',hechos.length,'iconos',faltan.length?'· sin dibujo: '+faltan.join(' '):'');
})();
