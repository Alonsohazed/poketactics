// Genera el Excel con la idea de icono de cada aumento (2D minimalista) a partir de iconos-aumentos-ideas.js.
// Hojas: «Guía de estilo» (reglas comunes), «Paletas» (colores por tema, con muestra) e «Iconos» (una fila por aumento).
// Uso: NODE_PATH=<node_modules con exceljs> node iconos-aumentos-excel.js <salida.xlsx>
// La descripción de cada aumento sale del propio juego (augments.js + game.js), así siempre coincide con lo implementado.
const ExcelJS=require('exceljs'), fs=require('fs'), path=require('path'), vm=require('vm');
const SAL=process.argv[2]||'iconos-aumentos-ideas.xlsx';
const DIR=__dirname, RAIZ=path.resolve(DIR,'../../../..');
const {TEMAS,I}=require('./iconos-aumentos-ideas.js');
const src=['augments.js','game.js'].map(f=>fs.readFileSync(path.join(RAIZ,'public',f),'utf8')).join('\n');
const ctx={__SERVER__:true,HEADLESS:true,console,setTimeout,clearTimeout,setInterval,clearInterval,module:{exports:{}},require,performance:{now:()=>Date.now()}};
ctx.globalThis=ctx; ctx.self=ctx; vm.runInNewContext(src+'\n;globalThis.__A=AUGS;',ctx,{filename:'motor.js'});
const RZ={P:'Prismático',G:'Oro',S:'Plata'}, ORDEN={P:0,G:1,S:2};
const augs=[...ctx.__A].sort((a,b)=>ORDEN[a.tier]-ORDEN[b.tier]||a.name.localeCompare(b.name,'es'));
const sin=augs.filter(a=>!I[a.id]).map(a=>a.id), sobra=Object.keys(I).filter(k=>!augs.some(a=>a.id===k));
if(sin.length||sobra.length) throw new Error('Sin idea: '+sin.join(' ')+' · Sobran: '+sobra.join(' '));

const EVITAR='Texto o letras (salvo los indicados), contornos negros gruesos, degradados (salvo el prismático), más de 3 colores + la luz, sombras proyectadas al suelo, fondos, marcos, fan art o Pokémon dibujados enteros.';
const GUIA=[
 ['Formato','Cuadrado 512×512 px en SVG (vectorial). Se exporta también a PNG de 512 px y WebP de 256 px.'],
 ['Fondo','Transparente. La carta del aumento ya pone el fondo negro y el marco dorado.'],
 ['Zona segura','El dibujo cabe en un cuadrado de 400×400 px centrado (margen de 56 px por lado). El elemento principal ocupa entre el 65 % y el 75 % de esa zona.'],
 ['Estilo','2D plano y minimalista: formas geométricas simples (círculos, rectángulos redondeados, polígonos, arcos), un único símbolo protagonista y como mucho dos elementos de apoyo.'],
 ['Color','Como máximo 3 colores de la paleta del tema (base, sombra y acento) más la luz. Rellenos planos, sin texturas. Solo el tema «Caos» usa degradado (prismático #FF6FD0 → #5FE0FF).'],
 ['Volumen','Sombra plana: la mitad derecha o inferior de cada forma en el tono de sombra (corte limpio, sin difuminar). Un reflejo plano en el tono de luz arriba a la izquierda (elipse pequeña o franja).'],
 ['Contorno','Sin contorno. Si una forma se pierde sobre el negro de la carta, se le da un borde de 6 px en el tono de luz, nunca negro.'],
 ['Trazos y esquinas','Trazos de líneas entre 8 y 30 px con extremos redondeados. Esquinas redondeadas con un radio del 8-12 % del lado de la forma.'],
 ['Luz','Siempre desde arriba a la izquierda, en todos los iconos.'],
 ['Pokémon','Nunca se dibuja un Pokémon entero ni copiado de arte oficial o de fans. En los aumentos de héroe se usa un rasgo icónico y esquemático (la sonrisa de Gengar, la cola en rayo, las cucharas de Alakazam…).'],
 ['Objetos del juego','Poké Ball plana: mitad superior roja #E5484D, inferior blanca #FFFFFF, banda negra #1B1B22 del 10 % del diámetro y botón blanco del 27 % con borde negro. Moneda: círculo dorado con aro interior de 12 px en sombra.'],
 ['Rareza','La rareza (Plata, Oro, Prismático) no se dibuja en el icono: la da la carta.'],
 ['Coordenadas','Las posiciones (x, y) de la hoja «Iconos» se miden desde la esquina superior izquierda del lienzo de 512 px.'],
 ['Columna «Notas del autor»','Única columna para rellenar a mano en «Iconos»: cambios o aprobación de cada idea (por ejemplo: «Aprobado» o «Más grande la moneda»).'],
];

(async()=>{
 const wb=new ExcelJS.Workbook(); wb.creator='Poké Tactics'; wb.created=new Date();
 const F={name:'Arial',size:10}, FB={name:'Arial',size:10,bold:true,color:{argb:'FFFFFFFF'}};
 const cab=(ws,fila,color='FF13242F')=>{ ws.getRow(fila).eachCell(c=>{ c.font=FB; c.fill={type:'pattern',pattern:'solid',fgColor:{argb:color}}; c.alignment={vertical:'middle',horizontal:'center',wrapText:true}; c.border={bottom:{style:'thin',color:{argb:'FFC9A24A'}}}; }); ws.getRow(fila).height=28; };

 // Guía de estilo
 const g=wb.addWorksheet('Guía de estilo',{views:[{state:'frozen',ySplit:3}]});
 g.columns=[{width:26},{width:110}];
 g.getCell('A1').value='Iconos de los aumentos de Poké Tactics: 2D minimalista'; g.getCell('A1').font={name:'Arial',size:14,bold:true};
 g.getCell('A2').value=`Reglas comunes a los ${augs.length} iconos. Cada fila de la hoja «Iconos» describe solo lo propio de cada aumento; todo lo demás sigue esta guía.`; g.getCell('A2').font={...F,italic:true};
 g.addRow([]); g.getRow(3).values=['Regla','Detalle']; cab(g,3);
 for(const [a,b] of GUIA){ const r=g.addRow([a,b]); r.getCell(1).font={...F,bold:true}; r.getCell(2).font=F; r.eachCell(c=>c.alignment={vertical:'top',wrapText:true}); }

 // Paletas
 const p=wb.addWorksheet('Paletas',{views:[{state:'frozen',ySplit:1}]});
 p.columns=[{header:'Tema',key:'k',width:14},{header:'Nombre',key:'n',width:26},{header:'Base',key:'b',width:22},{header:'Sombra',key:'s',width:14},{header:'Luz',key:'l',width:14},{header:'Acento',key:'a',width:30},{header:'Iconos',key:'c',width:10}];
 cab(p,1);
 const cuenta={}; for(const a of augs){ const t=I[a.id][0]; cuenta[t]=(cuenta[t]||0)+1; }
 for(const [k,t] of Object.entries(TEMAS)){
  const r=p.addRow({k,n:t.nombre,b:t.base,s:t.sombra,l:t.luz,a:t.acento,c:cuenta[k]||0}); r.font=F; r.height=22;
  ['b','s','l','a'].forEach((key,i)=>{ const c=r.getCell(i+3), v=String(c.value); if(/^#[0-9A-F]{6}$/i.test(v)){ const hex=v.slice(1).toUpperCase(), lum=(parseInt(hex.slice(0,2),16)*.3+parseInt(hex.slice(2,4),16)*.59+parseInt(hex.slice(4),16)*.11);
   c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+hex}}; c.font={...F,bold:true,color:{argb:lum<128?'FFFFFFFF':'FF1B1B22'}}; } c.alignment={vertical:'middle',horizontal:'center',wrapText:true}; });
 }
 const tot=p.addRow({n:'Total',c:{formula:`SUM(G2:G${Object.keys(TEMAS).length+1})`,result:augs.length}}); tot.font={...F,bold:true};

 // Iconos
 const w=wb.addWorksheet('Iconos',{views:[{state:'frozen',ySplit:1,xSplit:3}]});
 w.columns=[
  {header:'Nº',key:'n',width:5},{header:'Rareza',key:'r',width:11},{header:'Aumento',key:'nom',width:24},{header:'Id en el juego',key:'id',width:20},
  {header:'Qué hace (juego)',key:'d',width:44},{header:'Concepto del icono',key:'c',width:34},{header:'Elemento principal',key:'p',width:56},
  {header:'Elementos secundarios',key:'s',width:46},{header:'Composición',key:'k',width:34},{header:'Tema',key:'t',width:16},
  {header:'Paleta (base · sombra · luz · acento)',key:'pal',width:34},{header:'Evitar',key:'e',width:40},{header:'Notas del autor',key:'na',width:30}];
 cab(w,1);
 const RC={P:'FF6A3FD0',G:'FFB07A22',S:'FF7D8794'};
 augs.forEach((a,i)=>{
  const [t,c,pr,se,k,ev]=I[a.id], T=TEMAS[t];
  const r=w.addRow({n:i+1,r:RZ[a.tier],nom:a.name,id:a.id,d:a.desc,c,p:pr,s:se,k,t:T.nombre,pal:`${T.base} · ${T.sombra} · ${T.luz} · ${T.acento}`,e:ev?`${ev} ${EVITAR}`:EVITAR,na:''});
  r.font=F; r.eachCell({includeEmpty:true},cell=>cell.alignment={vertical:'top',wrapText:true});
  r.getCell('r').fill={type:'pattern',pattern:'solid',fgColor:{argb:RC[a.tier]}}; r.getCell('r').font={...F,bold:true,color:{argb:'FFFFFFFF'}};
  r.getCell('nom').font={...F,bold:true};
  r.getCell('na').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF6C9'}};
  if(i%2) ['d','c','p','s','k','t','pal','e'].forEach(key=>r.getCell(key).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF5F6F8'}});
 });
 w.autoFilter={from:'A1',to:'M1'};
 await wb.xlsx.writeFile(SAL);
 console.log('OK',augs.length,'aumentos →',SAL);
})();
