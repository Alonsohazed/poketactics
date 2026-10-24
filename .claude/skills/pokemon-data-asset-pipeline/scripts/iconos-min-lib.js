// Biblioteca de piezas para los iconos 2D minimalistas de los aumentos (ver la «Guía de estilo» del Excel):
// relleno plano, la mitad derecha (o inferior) de cada forma en el tono de sombra con un corte limpio, un reflejo plano
// arriba a la izquierda, sin contornos y fondo transparente, en un lienzo de 512 px.
// Las piezas se dibujan en coordenadas locales de unas 100 unidades centradas en 0 y se colocan con (x, y, tamaño en px).
const {TEMAS:T}=require('./iconos-aumentos-ideas.js');
let N=0; const uid=p=>p+(N++);

// ---------- colores ----------
const C=(base,sombra,luz)=>({base,sombra,luz});
const COL={
 oro:C(T.oro.base,T.oro.sombra,T.oro.luz), exp:C(T.exp.base,T.exp.sombra,T.exp.luz), tienda:C(T.tienda.base,T.tienda.sombra,T.tienda.luz),
 objeto:C(T.objeto.base,T.objeto.sombra,T.objeto.luz), vida:C(T.vida.base,T.vida.sombra,T.vida.luz), defensa:C(T.defensa.base,T.defensa.sombra,T.defensa.luz),
 ataque:C(T.ataque.base,T.ataque.sombra,T.ataque.luz), velocidad:C(T.velocidad.base,T.velocidad.sombra,T.velocidad.luz), riesgo:C(T.riesgo.base,T.riesgo.sombra,T.riesgo.luz),
 fuego:C(T.fuego.base,T.fuego.sombra,T.fuego.luz), agua:C(T.agua.base,T.agua.sombra,T.agua.luz), planta:C(T.planta.base,T.planta.sombra,T.planta.luz),
 electrico:C(T.electrico.base,T.electrico.sombra,T.electrico.luz), psiquico:C(T.psiquico.base,T.psiquico.sombra,T.psiquico.luz), fantasma:C(T.fantasma.base,T.fantasma.sombra,T.fantasma.luz),
 lucha:C(T.lucha.base,T.lucha.sombra,T.lucha.luz), dragon:C(T.dragon.base,T.dragon.sombra,T.dragon.luz), legend:C(T.legend.base,T.legend.sombra,T.legend.luz),
 rojo:C('#E5484D','#A82A30','#FFD3D4'), blanco:C('#F4F5F8','#D3D8E0','#FFFFFF'), negro:C('#26262E','#15151A','#4A4A55'), gris:C('#8A96A8','#5E6878','#D8DEE6'),
 plata:C('#C9CFD8','#9AA3B0','#FFFFFF'), marron:C('#A0703A','#6E4A22','#E8C9A0'), crema:C('#FFF4D6','#E3D6B0','#FFFFFF'), hueso:C('#EFE6CF','#C9BC98','#FFFFFF'),
 verde:C('#5CC86A','#358A43','#D7F5DC'), rosa:C('#FF8AC8','#D0559A','#FFE0F0'), violeta:C('#6A3FD0','#4A2A9E','#C9B6FF'), naranja:C('#FF7A2A','#C2410C','#FFD39A'),
 amarillo:C('#FFD23F','#C89A10','#FFF6C9'), cristal:C('#9FD8FF','#6AA8D8','#FFFFFF'), azul:C('#3B9BFF','#2266C4','#CDE6FF'), lila:C('#C9A8E8','#9C7BC4','#F0E4FF'),
 cielo:C('#D8DEE6','#AEB8C6','#FFFFFF'), tierra:C('#8A5A30','#5E3C1E','#C99A6A'),
};
const SIN={fuego:'#EE6B2F',agua:'#3B8FE8',planta:'#4CAF50',electrico:'#D9B400',psiquico:'#E0569B',dragon:'#6F5CE0',clase:'#5D7A8C',hechicero:'#8E44AD',acero:'#8A9BB0',lucha:'#B5462F',normal:'#9A987F',tirador:'#D35400',coloso:'#C0392B',potencial:'#5BBF6A'};

// ---------- utilidades ----------
const f=v=>+(+v).toFixed(2);
const E=(cx,cy,rx,ry)=>`M${f(cx-rx)} ${f(cy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(2*rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2*rx)} 0Z`;
const RR=(x,y,w,h,r)=>{ r=Math.min(r,w/2,h/2); return `M${f(x+r)} ${f(y)}h${f(w-2*r)}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(r)}v${f(h-2*r)}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(r)}h${f(-(w-2*r))}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(-r)}v${f(-(h-2*r))}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-r)}Z`; };
const P=pts=>'M'+pts.map(([x,y])=>`${f(x)} ${f(y)}`).join('L')+'Z';
const poli=(cx,cy,n,r,giro=0)=>Array.from({length:n},(_,i)=>{const a=giro+2*Math.PI*i/n; return [cx+r*Math.cos(a),cy+r*Math.sin(a)];});
const hexD=(cx,cy,r)=>P(poli(cx,cy,6,r,Math.PI/6));
const estrellaD=(cx,cy,r,n=5,k=.45)=>P(Array.from({length:2*n},(_,i)=>{const a=-Math.PI/2+Math.PI*i/n, rr=i%2?r*k:r; return [cx+rr*Math.cos(a),cy+rr*Math.sin(a)];}));
const g=(tr,c)=>`<g transform="${tr}">${c}</g>`;
const sc=(x,y,k,rot,c)=>g(`translate(${f(x)} ${f(y)})${rot?` rotate(${f(rot)})`:''}${k!==1?` scale(${f(k)})`:''}`,c);
const lin=(d,col,w,{op=1,cap='round'}={})=>`<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="${cap}" stroke-linejoin="round"${op<1?` opacity="${op}"`:''}/>`;
const rel=(d,col,op=1)=>`<path d="${d}" fill="${col}"${op<1?` opacity="${op}"`:''}/>`;
// Forma con volumen plano: base, la mitad derecha (corte en x = cx) o la inferior (corte en y = cy) en sombra y un reflejo [x, y, rx, ry]
function forma(d,c,{cx=0,cy=0,corte='derecha',luz=null,op=.85}={}){
 const id=uid('c');
 const zona=corte==='derecha'?`<rect x="${f(cx)}" y="-4000" width="8000" height="8000"/>`:corte==='abajo'?`<rect x="-4000" y="${f(cy)}" width="8000" height="8000"/>`:'';
 return `<clipPath id="${id}"><path d="${d}"/></clipPath><path d="${d}" fill="${c.base}"/>`+(zona?`<g clip-path="url(#${id})" fill="${c.sombra}">${zona}</g>`:'')+
  (luz?`<g clip-path="url(#${id})"><path d="${E(...luz)}" fill="${c.luz}" opacity="${op}"/></g>`:'');
}
// Pieza en coordenadas locales (≈100 unidades) colocada en (x, y) con un tamaño en px
const pieza=(d,x,y,tam,c,o={})=>sc(x,y,tam/100,o.rot||0,forma(d,c,o));
// Agujeros que dejan ver el fondo (coordenadas del lienzo)
const agujeros=(contenido,ds)=>{ const m=uid('m'); return `<mask id="${m}" maskUnits="userSpaceOnUse" x="-100" y="-100" width="712" height="712"><rect x="-100" y="-100" width="712" height="712" fill="#fff"/>${ds.map(a=>`<path d="${a}" fill="#000"/>`).join('')}</mask><g mask="url(#${m})">${contenido}</g>`; };
// Degradado prismático (solo tema Caos)
const prisma=()=>{ const id=uid('pr'); return {id,defs:`<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF6FD0"/><stop offset=".5" stop-color="#B57BFF"/><stop offset="1" stop-color="#5FE0FF"/></linearGradient>`}; };

// ---------- piezas sencillas ----------
const destello=(x,y,s,col='#FFF1C4')=>rel(estrellaD(x,y,s/2,4,.26),col);
const estrella=(x,y,s,c=COL.oro,o={})=>pieza(estrellaD(0,0,50,5,.45),x,y,s,c,{luz:[-14,-14,8,5],...o});
const mas=(x,y,s,col,w)=>lin(`M${x} ${y-s/2}V${y+s/2}M${x-s/2} ${y}H${x+s/2}`,col,w||s*.3,{cap:'round'});
const cruzD='M-20 -60H20V-20H60V20H20V60H-20V20H-60V-20H-20Z';
const cruz=(x,y,s,col)=>sc(x,y,s/120,0,rel(cruzD,col));
const D={
 corazon:'M0 44C-64 2 -58 -48 -27 -48C-11 -48 0 -38 0 -27C0 -38 11 -48 27 -48C58 -48 64 2 0 44Z',
 escudo:'M-50 -56H50V0C50 34 26 52 0 62C-26 52 -50 34 -50 0Z',
 torre:'M-50 -56H50V24L0 60L-50 24Z',
 gota:'M0 -58C22 -28 40 -4 40 20C40 44 22 58 0 58C-22 58 -40 44 -40 20C-40 -4 -22 -28 0 -58Z',
 llama:'M0 58C-34 58 -50 34 -48 8C-46 -22 -18 -40 -6 -70C6 -48 18 -38 28 -26C44 -8 50 12 46 30C42 48 22 58 0 58Z',
 hoja:'M0 -60C36 -34 40 22 0 60C-40 22 -36 -34 0 -60Z',
 rayo:'M14 -60L-30 6H-2L-14 60L32 -10H4Z',
 luna:'M10 -48A50 50 0 1 0 10 48A58 58 0 0 1 10 -48Z',
 flecha:'M0 -60L48 -8H20V60H-20V-8H-48Z',
 sacoCuerpo:'M-22 -32C-48 -24 -60 6 -56 30C-52 52 -30 60 0 60C30 60 52 52 56 30C60 6 48 -24 22 -32Z',
 sacoCuello:'M-22 -32L-34 -56C-12 -48 12 -48 34 -56L22 -32Z',
 garra:'M-12 50C-30 10 -20 -30 14 -56C0 -20 -2 15 14 50Z',
 pluma:'M0 -62C24 -30 24 30 0 56C-24 30 -24 -30 0 -62Z',
 huevo:'M0 -62C30 -62 48 -14 48 16C48 44 28 62 0 62C-28 62 -48 44 -48 16C-48 -14 -30 -62 0 -62Z',
 nube:'M-60 30H60C76 30 80 6 64 -2C66 -24 46 -36 28 -26C20 -48 -14 -52 -26 -30C-46 -36 -66 -18 -60 2C-76 8 -74 30 -60 30Z',
 copa:'M-46 -50H46C46 -2 24 18 0 20C-24 18 -46 -2 -46 -50Z',
};
const corazon=(x,y,s,c=COL.vida,o={})=>pieza(D.corazon,x,y,s,c,{luz:[-30,-28,13,7],...o});
const orbe=(x,y,d,c,o={})=>pieza(E(0,0,50,50),x,y,d,c,{luz:[-20,-24,13,8],...o});
const gota=(x,y,h,c,o={})=>pieza(D.gota,x,y,h,c,{luz:[-16,10,7,13],...o});
const llama=(x,y,h,c=COL.fuego,nucleo='#FFE14A',o={})=>sc(x,y,h/130,o.rot||0,forma(D.llama,c)+sc(2,24,.5,0,rel(D.llama,nucleo)));
const hoja=(x,y,h,c=COL.planta,rot=0)=>sc(x,y,h/120,rot,forma(D.hoja,c)+lin('M0 -46V50',c.sombra,5));
const rayo=(x,y,h,c=COL.electrico,o={})=>pieza(D.rayo,x,y,h*100/120,c,{cx:2,...o});
const luna=(x,y,d,c,o={})=>pieza(D.luna,x,y,d,c,{cx:-200,...o});
const flechaArriba=(x,y,h,c,o={})=>pieza(D.flecha,x,y,h*100/120,c,{luz:[-8,-30,6,12],...o});
const escudo=(x,y,h,c,o={})=>pieza(D.escudo,x,y,h*100/118,c,{luz:[-28,-38,12,7],...o});
const torre=(x,y,h,c,o={})=>pieza(D.torre,x,y,h*100/116,c,{luz:[-28,-38,12,7],...o});
const hexagono=(x,y,d,c,o={})=>pieza(hexD(0,0,50),x,y,d,c,{luz:[-18,-24,11,6],...o});
const chevron=(x,y,s,col,w=12,dir=1)=>lin(`M${x-dir*s*.25} ${y-s/2}L${x+dir*s*.25} ${y}L${x-dir*s*.25} ${y+s/2}`,col,w);
const flechaCirc=(cx,cy,R,a0,a1,col,w)=>{ // arco de a0 a a1 (grados, horario) con punta al final
 const r=a=>[cx+R*Math.cos(a*Math.PI/180),cy+R*Math.sin(a*Math.PI/180)], [x0,y0]=r(a0), [x1,y1]=r(a1), grande=((a1-a0+360)%360)>180?1:0;
 const t=(a1+90)*Math.PI/180, n=a1*Math.PI/180, L=w*1.9, H=w*1.5;
 return lin(`M${f(x0)} ${f(y0)}A${R} ${R} 0 ${grande} 1 ${f(x1)} ${f(y1)}`,col,w)+rel(P([[x1+Math.cos(t)*L,y1+Math.sin(t)*L],[x1+Math.cos(n)*H,y1+Math.sin(n)*H],[x1-Math.cos(n)*H,y1-Math.sin(n)*H]]),col);
};

// ---------- objetos del juego ----------
function moneda(x,y,r,{aro=true,c=COL.oro}={}){
 let s=pieza(E(0,0,50,50),x,y,2*r,c,{luz:[-21,-21,13,7.5],op:.9});
 if(aro&&r>40) s+=`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r-30)}" fill="none" stroke="${c.luz}" stroke-width="12" opacity=".55"/>`;
 else if(aro) s+=`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r*.62)}" fill="none" stroke="${c.sombra}" stroke-width="${f(Math.max(3,r*.12))}" opacity=".5"/>`;
 return s;
}
function monedaCanto(cx,cy,rot,k=1){
 const rx=60*k, ry=130*k, canto=22*k, o=COL.oro;
 return g(`rotate(${rot} ${cx} ${cy})`,`<path d="${E(cx+canto/2,cy,rx,ry)}" fill="${o.sombra}"/><rect x="${cx-canto/2}" y="${cy-ry}" width="${canto}" height="${2*ry}" fill="${o.sombra}"/>`+
  forma(E(cx-canto/2,cy,rx,ry),{base:o.base,sombra:'#D39A34',luz:o.luz},{cx:cx-canto/2+rx*.35,luz:[cx-canto/2-rx*.4,cy-ry*.35,rx*.18,ry*.3],op:.95})+
  `<path d="${E(cx-canto/2,cy,rx*.62,ry*.72)}" fill="none" stroke="${o.luz}" stroke-width="${8*k}" opacity=".5"/>`);
}
function monedaPlana(cx,cy,k=1){
 const rx=60*k, ry=22*k, t=14*k, o=COL.oro;
 return `<path d="M${f(cx-rx)} ${f(cy)}V${f(cy+t)}A${f(rx)} ${f(ry)} 0 0 0 ${f(cx+rx)} ${f(cy+t)}V${f(cy)}Z" fill="${o.sombra}"/>`+forma(E(cx,cy,rx,ry),{base:o.base,sombra:o.base,luz:o.luz},{luz:[cx-rx*.35,cy-ry*.3,rx*.3,ry*.28],op:.9})+
  `<path d="${E(cx,cy,rx*.62,ry*.62)}" fill="none" stroke="${o.sombra}" stroke-width="${f(5*k)}" opacity=".6"/>`;
}
const pila=(x,y,n,k=1,sep=26)=>Array.from({length:n},(_,i)=>monedaPlana(x,y-i*sep*k,k)).join('');
const trayectoria=(x0,y0,x1,y1,cxq,cyq,col='#FFF1C4')=>Array.from({length:6},(_,i)=>{ const t=i/6, x=(1-t)**2*x0+2*(1-t)*t*cxq+t*t*x1, y=(1-t)**2*y0+2*(1-t)*t*cyq+t*t*y1; return `<circle cx="${f(x)}" cy="${f(y)}" r="7" fill="${col}" opacity="${f(.45+.09*i)}"/>`; }).join('');
// Poké Ball plana: mitad superior de color, inferior blanca, banda negra del 10 % del diámetro y botón del 27 %
function pokeball(x,y,d,{top=COL.rojo,boton=true,banda='#1B1B22'}={}){
 const r=d/2, id=uid('pb');
 let s=forma(`M${f(x-r)} ${f(y)}A${f(r)} ${f(r)} 0 0 1 ${f(x+r)} ${f(y)}Z`,top,{cx:x,luz:[x-r*.42,y-r*.55,r*.24,r*.13],op:.9})+forma(`M${f(x-r)} ${f(y)}A${f(r)} ${f(r)} 0 0 0 ${f(x+r)} ${f(y)}Z`,COL.blanco,{cx:x});
 s+=`<clipPath id="${id}"><circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/></clipPath><rect x="${f(x-r)}" y="${f(y-d*.05)}" width="${f(d)}" height="${f(d*.1)}" fill="${banda}" clip-path="url(#${id})"/>`;
 if(boton) s+=`<circle cx="${f(x)}" cy="${f(y)}" r="${f(d*.135+d*.035)}" fill="${banda}"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(d*.135)}" fill="#FFFFFF"/>`;
 return s;
}
const emblema=(x,y,d,col,{c=COL.oro}={})=>hexagono(x,y,d,c)+orbe(x,y,d*.44,{base:col,sombra:col,luz:'#FFFFFF'},{cx:-200,op:.55});
function dado(x,y,s,n,rot=0,c=COL.violeta){
 const pos={1:[[0,0]],2:[[-22,-22],[22,22]],3:[[-24,-24],[0,0],[24,24]],4:[[-24,-24],[24,-24],[-24,24],[24,24]],5:[[-24,-24],[24,-24],[0,0],[-24,24],[24,24]],6:[[-24,-26],[24,-26],[-24,0],[24,0],[-24,26],[24,26]]}[n];
 return sc(x,y,s/100,rot,forma(RR(-50,-50,100,100,18),c,{luz:[-28,-32,12,6]})+pos.map(([a,b])=>`<circle cx="${a}" cy="${b}" r="9" fill="#FFFFFF"/>`).join(''));
}
const carta=(x,y,w,h,{rot=0,franja=COL.tienda.base,c=COL.blanco}={})=>sc(x,y,1,rot,forma(RR(-w/2,-h/2,w,h,Math.min(w,h)*.12),c)+g('',`<clipPath id="${N}fr"><path d="${RR(-w/2,-h/2,w,h,Math.min(w,h)*.12)}"/></clipPath>`)+`<rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h*.22}" fill="${franja}" clip-path="url(#${N++}fr)"/>`);
function saco(x,y,s,c=COL.marron,nudo=null){
 return sc(x,y,s/120,0,forma(D.sacoCuello,c,{cx:4})+forma(D.sacoCuerpo,c,{cx:6,luz:[-26,-4,12,20]})+forma(RR(-26,-40,52,13,6),{base:nudo||c.sombra,sombra:nudo||c.sombra,luz:c.luz}));
}
function hucha(x,y,s,c=COL.oro){
 return sc(x,y,s/120,0,forma(RR(-36,30,15,20,4),c)+forma(RR(12,30,15,20,4),c)+forma(P([[-30,-36],[-18,-58],[-6,-38]]),c)+
  forma(E(0,0,52,44),c,{luz:[-24,-20,13,7]})+forma(RR(44,-14,22,26,8),c,{cx:200})+`<rect x="-18" y="-46" width="36" height="8" rx="4" fill="${c.sombra}"/><circle cx="22" cy="-12" r="4" fill="#1B1B22"/>`);
}
function relojArena(x,y,w,h,{vidrio=COL.oro,tapa=COL.oro,interior=''}={}){
 const a=w/2, b=h/2, t=h*.09;
 return forma(P([[x-a*.86,y-b+t],[x+a*.86,y-b+t],[x,y]]),{base:vidrio.luz,sombra:'#E9D49A',luz:'#fff'},{cx:x})+forma(P([[x,y],[x+a*.86,y+b-t],[x-a*.86,y+b-t]]),{base:vidrio.luz,sombra:'#E9D49A',luz:'#fff'},{cx:x})+
  interior+forma(RR(x-a,y-b,w,t,t*.35),tapa,{cx:x})+forma(RR(x-a,y+b-t,w,t,t*.35),tapa,{cx:x});
}
function calendario(x,y,w,h,c=COL.exp,contenido=''){
 return forma(RR(x-w/2,y-h/2,w,h,w*.08),COL.blanco,{cx:x})+forma(RR(x-w/2,y-h/2,w,h*.22,w*.08),c,{cx:x})+`<rect x="${x-w/2}" y="${y-h/2+h*.12}" width="${w}" height="${h*.1}" fill="${c.base}"/>`+
  [-1,1].map(s=>`<rect x="${f(x+s*w*.22-8)}" y="${f(y-h/2-14)}" width="16" height="34" rx="8" fill="${c.sombra}"/>`).join('')+contenido;
}
function yunque(x,y,s,c=COL.gris,cara=COL.objeto){
 return sc(x,y,s/130,0,forma(P([[-44,-8],[44,-8],[26,20],[-26,20]]),c)+forma(P([[-44,-26],[-74,-22],[-44,-8]]),c)+forma(RR(-30,18,60,22,4),c)+forma(RR(-50,-28,100,20,5),cara,{luz:[-24,-22,14,4]}));
}
const martillo=(x,y,s,rot=0)=>sc(x,y,s/130,rot,forma(RR(-6,-30,12,95,6),COL.marron)+forma(RR(-36,-58,72,34,7),COL.gris,{luz:[-20,-50,9,4]}));
const cuchara=(x,y,s,rot=0,c=COL.plata)=>sc(x,y,s/130,rot,lin('M0 -10L0 18L12 56',c.sombra,14)+lin('M0 -10L0 18L12 56',c.base,9)+forma(E(0,-34,20,28),c,{luz:[-8,-44,6,8]}));
const garra=(x,y,s,rot=0,c=COL.objeto)=>pieza(D.garra,x,y,s*100/110,c,{rot,cx:0});
function hueso(x,y,s,rot=0,c=COL.hueso){
 return sc(x,y,s/120,rot,[[-44,-10],[-44,10],[44,-10],[44,10]].map(([a,b])=>forma(E(a,b,13,13),c,{cx:a})).join('')+forma(RR(-44,-10,88,20,10),c,{cx:200,luz:[-20,-5,14,3]}));
}
const pluma=(x,y,s,rot=0,c=COL.objeto)=>sc(x,y,s/130,rot,forma(D.pluma,c,{luz:[-8,-30,5,16]})+lin('M0 -52V70',c.sombra,5));
const lupa=(x,y,s,rot=0,c=COL.gris,dentro='')=>sc(x,y,s/130,rot,lin('M28 28L58 58',COL.marron.base,16)+dentro+`<circle cx="0" cy="0" r="38" fill="none" stroke="${c.base}" stroke-width="12"/>`);
function espada(x,y,s,rot=0,hoja=COL.plata,guarda=COL.oro){
 return sc(x,y,s/140,rot,forma(P([[0,-70],[9,-56],[9,24],[-9,24],[-9,-56]]),hoja)+forma(RR(-28,22,56,10,5),guarda)+forma(RR(-6,32,12,26,4),COL.marron)+forma(E(0,62,7,7),guarda));
}
const corona=(x,y,s,c=COL.oro,o={})=>pieza(P([[-50,30],[-50,-28],[-25,0],[0,-44],[25,0],[50,-28],[50,30]]),x,y,s,c,{luz:[-34,8,8,4],...o});
function mancuerna(x,y,s,c=COL.ataque){
 return sc(x,y,s/130,0,forma(RR(-44,-6,88,12,6),COL.gris)+[[-56,1],[40,-1]].map(([a])=>forma(RR(a,-30,16,60,6),c,{cx:a+8})).join('')+[[-66],[56]].map(([a])=>forma(RR(a,-20,10,40,4),c,{cx:a+5})).join(''));
}
const diana=(x,y,d,c=COL.ataque)=>[50,34,17].map((r,i)=>pieza(E(0,0,r,r),x,y,d,i%2?{base:'#FFFFFF',sombra:'#E6E9EE',luz:'#fff'}:c)).join('');
function copa(x,y,s,c=COL.oro){
 return sc(x,y,s/120,0,lin('M-44 -38C-66 -38 -66 -6 -38 -2',c.sombra,8)+lin('M44 -38C66 -38 66 -6 38 -2',c.sombra,8)+forma(D.copa,c,{luz:[-26,-38,10,6]})+forma(RR(-7,18,14,24,3),c)+forma(RR(-30,40,60,14,5),c));
}
function cajaRegalo(x,y,s,c=COL.rosa,lazo=COL.oro){
 return sc(x,y,s/120,0,forma(RR(-44,-8,88,62,6),c)+forma(RR(-50,-26,100,20,5),c,{luz:[-34,-20,10,3]})+`<rect x="-8" y="-26" width="16" height="80" fill="${lazo.base}"/>`+
  forma(E(-16,-36,15,10),lazo,{cx:200})+forma(E(16,-36,15,10),lazo,{cx:200}));
}
function cofre(x,y,s,c=COL.marron,banda=COL.oro){
 const tapa='M-50 -4V-20C-50 -48 50 -48 50 -20V-4Z';
 return sc(x,y,s/120,0,forma(RR(-50,-4,100,56,6),c,{luz:[-34,6,10,4]})+forma(tapa,c,{luz:[-30,-32,12,5]})+
  [-30,30].map(a=>`<rect x="${a-6}" y="-41" width="12" height="93" fill="${banda.base}"/>`).join('')+forma(RR(-11,-10,22,26,5),banda)+`<circle cx="0" cy="0" r="4" fill="#1B1B22"/>`);
}
function candado(x,y,s,c=COL.riesgo){
 return sc(x,y,s/120,0,lin('M-26 -6V-26C-26 -60 26 -60 26 -26V-6',COL.gris.base,14)+forma(RR(-42,-8,84,66,12),c,{luz:[-26,2,10,5]})+`<circle cx="0" cy="18" r="9" fill="#1B1B22"/><rect x="-4" y="20" width="8" height="20" fill="#1B1B22"/>`);
}
function matraz(x,y,s,liquido=COL.exp,contenido=''){
 const cuerpo='M-14 -60H14V-22L52 40C58 52 50 62 38 62H-38C-50 62 -58 52 -52 40L-14 -22Z', id=uid('mt');
 return sc(x,y,s/130,0,forma(cuerpo,{base:'#E8F1FA',sombra:'#C6D3E0',luz:'#FFFFFF'},{luz:[-6,-40,4,10]})+`<clipPath id="${id}"><path d="${cuerpo}"/></clipPath><g clip-path="url(#${id})">${forma(RR(-80,14,160,60,0),liquido)}</g>`+contenido+`<rect x="-20" y="-66" width="40" height="10" rx="4" fill="#C6D3E0"/>`);
}
function engranaje(x,y,d,c,dientes=12){
 const r=50, pts=[]; for(let i=0;i<dientes*4;i++){ const a=2*Math.PI*i/(dientes*4)-Math.PI/2, rr=(i%4<2)?r:r*.82; pts.push([rr*Math.cos(a),rr*Math.sin(a)]); }
 return pieza(P(pts),x,y,d,c,{luz:[-20,-26,11,6]});
}
const nube=(x,y,s,c=COL.cielo)=>pieza(D.nube,x,y,s*100/150,c,{corte:'abajo',cy:14,luz:[-22,-26,12,6]});
const montana=(x,y,w,h,c)=>forma(P([[x-w/2,y+h/2],[x,y-h/2],[x+w/2,y+h/2]]),c,{cx:x});
const huevo=(x,y,h,c=COL.crema,o={})=>pieza(D.huevo,x,y,h*100/124,c,{luz:[-20,-30,10,16],...o});
const bandera=(x,y,h,c=COL.ataque,mastil=COL.gris)=>forma(RR(x-6,y-h/2,12,h,6),mastil,{cx:x})+forma(P([[x+6,y-h/2+6],[x+6+h*.55,y-h/2+h*.2],[x+6,y-h/2+h*.4]]),c,{corte:'abajo',cy:y-h/2+h*.2});
const ola=(x,y,s,c=COL.agua)=>sc(x,y,s/130,0,forma('M-62 30C-62 -20 -20 -54 22 -50C52 -46 66 -20 54 0C46 14 26 12 22 0C34 2 40 -10 32 -20C18 -34 -16 -26 -26 4C-32 20 -24 30 -8 30Z',c,{luz:[-38,-6,8,14]}));
function remolino(x,y,s,fill){ // tres brazos en coma que giran alrededor de un centro
 const brazo='M-6 -10C-8 -40 22 -62 54 -52C34 -44 20 -30 18 -8C16 4 2 6 -6 -10Z';
 return sc(x,y,s/120,0,[0,120,240].map(a=>g(`rotate(${a})`,rel(brazo,fill))).join('')+`<circle cx="0" cy="0" r="16" fill="${fill}"/>`);
}
function guanteFrente(x,y,s,c=COL.ataque,muneca=COL.blanco,franja=COL.oro.base,rot=0){
 return sc(x,y,s/130,rot,forma('M-40 30C-56 -16 -46 -60 0 -62C44 -64 56 -20 46 30Z',c,{luz:[-22,-40,12,7]})+forma(E(-46,6,13,22),c,{cx:-200})+
  forma(RR(-38,28,76,34,9),muneca)+`<rect x="-38" y="38" width="76" height="8" fill="${franja}"/>`);
}
// Guante de boxeo de perfil (manopla con el pulgar al lado y puño de muñeca con franja), centrado en (0, 0) a unos 260 px
function guantePerfil(c,muneca,{conLuz=true,franja=T.objeto.acento}={}){
 const puno='M-96 52C-118 -30 -96 -132 -8 -142C78 -150 120 -86 112 -8C108 30 96 50 84 58Z';
 return forma('M-92 40C-132 30 -136 -40 -98 -50C-80 -54 -70 -40 -72 -22Z',c,{cx:-200})+
  forma(puno,c,{cx:24,luz:conLuz?[-46,-100,34,14]:null,op:.9})+lin('M-72 -22C-64 6 -66 26 -80 46',c.sombra,8)+
  forma(RR(-84,52,168,78,18),muneca,{cx:24})+`<rect x="-84" y="74" width="168" height="14" fill="${franja}"/>`;
}
function iman(x,y,s,rot=0){
 return sc(x,y,s/100,rot,lin('M-28 -24V6A28 28 0 0 0 28 6V-24',COL.rojo.base,24,{cap:'butt'})+lin('M14 -24V6A14 14 0 0 1 0 20',COL.rojo.sombra,0)+
  `<rect x="-40" y="-46" width="24" height="22" fill="${COL.plata.base}"/><rect x="16" y="-46" width="24" height="22" fill="${COL.plata.sombra}"/>`);
}
function carrito(x,y,s,c=COL.tienda){
 return sc(x,y,s/140,0,lin('M-70 -50H-52L-40 30H44',COL.gris.base,9)+forma(P([[-50,-36],[62,-36],[50,16],[-40,16]]),c,{luz:[-30,-28,12,4]})+
  [-22,4,30].map(a=>`<rect x="${a-4}" y="-28" width="8" height="36" rx="4" fill="${c.sombra}"/>`).join('')+forma(E(-28,46,11,11),COL.gris)+forma(E(36,46,11,11),COL.gris));
}
function gorro(x,y,s,c=COL.exp){
 return sc(x,y,s/150,0,forma(P([[-40,-6],[40,-6],[40,26],[-40,26]]),c)+forma(P([[0,-46],[76,-14],[0,18],[-76,-14]]),c,{luz:[-30,-16,14,4]})+lin('M50 -14V30',COL.oro.base,5)+forma(E(50,36,8,8),COL.oro));
}
function reloj(x,y,d){ // reloj circular de dos agujas
 return orbe(x,y,d,COL.blanco)+lin(`M${x} ${y}V${y-d*.3}M${x} ${y}H${x+d*.22}`,'#1B1B22',Math.max(4,d*.07));
}
function matrazFlecha(){}
function libroAbierto(x,y,s,c=COL.exp){
 return sc(x,y,s/150,0,forma('M0 -40C-24 -52 -52 -52 -72 -44V40C-52 32 -24 32 0 44Z',COL.blanco,{cx:200})+forma('M0 -40C24 -52 52 -52 72 -44V40C52 32 24 32 0 44Z',{base:'#D3D8E0',sombra:'#D3D8E0',luz:'#fff'})+
  lin('M-72 46C-52 38 -24 38 0 50C24 38 52 38 72 46',c.base,10));
}
function libroCerrado(x,y,s,c=COL.exp,marca=COL.rosa){
 return sc(x,y,s/150,0,forma(P([[52,-62],[60,-56],[60,64],[52,70]]),{base:'#FFFFFF',sombra:'#D3D8E0',luz:'#fff'})+forma(RR(-52,-70,108,134,8),c,{luz:[-30,-50,12,8]})+forma(RR(-48,-70,12,134,5),{base:c.sombra,sombra:c.sombra,luz:c.luz})+forma(P([[22,-76],[40,-76],[40,-30],[31,-38],[22,-30]]),marca));
}
function pizarra(x,y,w,h,contenido=''){
 return forma(RR(x-w/2,y-h/2,w,h,12),COL.marron,{cx:x})+`<rect x="${x-w/2+16}" y="${y-h/2+16}" width="${w-32}" height="${h-32}" rx="6" fill="#2F4A3A"/>`+contenido;
}
function mochila(x,y,s,c=COL.marron){
 return sc(x,y,s/140,0,lin('M-24 -60C-24 -80 24 -80 24 -60',c.sombra,10)+forma(RR(-56,-60,112,130,18),c,{luz:[-34,-40,12,8]})+forma(RR(-56,-60,112,46,18),{base:c.sombra,sombra:c.sombra,luz:c.luz})+
  `<rect x="-36" y="-20" width="10" height="70" rx="5" fill="${c.sombra}"/><rect x="26" y="-20" width="10" height="70" rx="5" fill="${c.sombra}"/>`);
}
function velocimetro(x,y,s,ang=-40,c=COL.velocidad){
 const marcas=Array.from({length:5},(_,i)=>{ const a=Math.PI+i*Math.PI/4; return lin(`M${f(Math.cos(a)*38)} ${f(Math.sin(a)*38)}L${f(Math.cos(a)*50)} ${f(Math.sin(a)*50)}`,i<3?c.base:COL.gris.base,7); }).join('');
 const a=ang*Math.PI/180;
 return sc(x,y,s/130,0,lin('M-60 0A60 60 0 0 1 60 0',COL.gris.sombra,12)+marcas+rel(P([[Math.cos(a-Math.PI/2)*6,Math.sin(a-Math.PI/2)*6],[Math.cos(a)*48,Math.sin(a)*48],[Math.cos(a+Math.PI/2)*6,Math.sin(a+Math.PI/2)*6]]),c.base)+`<circle r="9" fill="${c.sombra}"/>`);
}

module.exports={T,COL,SIN,f,E,RR,P,poli,hexD,estrellaD,g,sc,lin,rel,forma,pieza,agujeros,prisma,destello,estrella,mas,cruz,cruzD,D,corazon,orbe,gota,llama,hoja,rayo,luna,flechaArriba,escudo,torre,hexagono,chevron,flechaCirc,
 moneda,monedaCanto,monedaPlana,pila,trayectoria,pokeball,emblema,dado,carta,saco,hucha,relojArena,calendario,yunque,martillo,cuchara,garra,hueso,pluma,lupa,espada,corona,mancuerna,diana,copa,cajaRegalo,cofre,candado,matraz,engranaje,nube,montana,huevo,bandera,ola,remolino,guanteFrente,guantePerfil,iman,carrito,gorro,reloj,libroAbierto,libroCerrado,pizarra,mochila,velocimetro,uid};
