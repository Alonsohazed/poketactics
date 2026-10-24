// Iconos 2D minimalistas de los aumentos Prismáticos (fichas de iconos-aumentos-ideas.js). Piezas en iconos-min-lib.js.
const L=require('./iconos-min-lib.js');
const {T,COL,SIN,f,E,RR,P,poli,hexD,estrellaD,g,sc,lin,rel,forma,pieza,agujeros,prisma,destello,estrella,mas,cruz,corazon,orbe,gota,llama,hoja,rayo,luna,flechaArriba,escudo,torre,hexagono,chevron,flechaCirc,
 moneda,monedaCanto,monedaPlana,pila,trayectoria,pokeball,emblema,dado,carta,saco,hucha,relojArena,calendario,yunque,martillo,cuchara,garra,hueso,pluma,lupa,espada,corona,mancuerna,diana,copa,cajaRegalo,cofre,candado,matraz,engranaje,nube,montana,huevo,bandera,ola,remolino,guanteFrente,guantePerfil,iman,carrito,gorro,reloj}=L;
const OBJ=COL.objeto, MUN={base:T.objeto.luz,sombra:'#A9E9F5',luz:'#FFFFFF'};
const arbol=()=>{ const em=COL.oro, hojas=[[140,190,SIN.fuego],[256,120,SIN.agua],[372,190,SIN.planta]];
 return hojas.map(([x,y])=>lin(`M256 290L${x} ${y}`,em.base,30)).join('')+forma(RR(238,280,36,160,10),em,{cx:256})+hojas.map(([x,y,c])=>emblema(x,y,90,c)).join(''); };
const lenguaje=(d,c)=>forma(d,c);

module.exports={
 sube_nivel:()=>{ const t=COL.exp;
  // la ficha suma 418 px de alto: el cuerpo de la flecha baja de 190 a 170 px para caber en la zona segura
  let s=forma(P([[256,60],[376,170],[304,170],[304,340],[208,340],[208,170],[136,170]]),t,{cx:256,luz:[206,128,26,10],op:.8});
  [[354,t.luz],[390,t.base],[426,t.sombra]].forEach(([y,c])=>s+=rel(RR(166,y,180,22,11),c));
  return s+mas(400,110,60,T.exp.acento,18); },
 a_largo_plazo:()=>{ // reloj de 190×280 (la ficha pide 200×300) para no tocar la flecha circular de radio 190
  return relojArena(256,256,220,296,{interior:moneda(256,338,35,{aro:false})})+flechaCirc(256,256,190,0,270,COL.exp.base,16); },
 amuleto3:()=>lin('M214 176C210 46 302 46 298 176',COL.oro.sombra,18)+agujeros(moneda(256,290,130),[211,247,283].map(x=>RR(x,250,18,80,4))),
 apuesta_dorada:()=>trayectoria(120,420,262,250,150,260)+monedaCanto(300,200,20),
 apuesta_dorada2:()=>trayectoria(120,420,262,250,150,260)+monedaPlana(150,420)+monedaCanto(300,200,20),
 apuesta_dorada3:()=>trayectoria(120,400,262,250,150,250)+pila(150,410,3)+monedaCanto(300,200,20)+destello(400,110,40)+destello(210,120,40),
 arbol:()=>arbol(),
 arbol2:()=>arbol()+iman(330,400,80)+moneda(170,430,30,{aro:false}),
 ladrones:()=>g('translate(290 240) rotate(-15)',guantePerfil({base:OBJ.sombra,sombra:'#1F6F82',luz:OBJ.sombra},{base:OBJ.sombra,sombra:'#1F6F82',luz:OBJ.sombra},{conLuz:false}))+g('translate(230 270) rotate(-15)',guantePerfil(OBJ,MUN)),
 ladrones2:()=>{ const antifaz='M76 220C76 160 150 145 205 165C228 174 244 186 256 200C268 186 284 174 307 165C362 145 436 160 436 220C436 280 370 300 314 282C290 274 270 262 256 250C242 262 222 274 198 282C142 300 76 280 76 220Z';
  return agujeros(forma(antifaz,OBJ,{cx:256,luz:[150,175,40,10],op:.8}),[E(170,222,45,28),E(342,222,45,28)])+g('translate(256 392) scale(.5)',guantePerfil(OBJ,MUN))+
   [0,1].map(i=>chevron(362+i*28,390,44,T.objeto.acento,12)).join(''); },
 h_gengar:()=>{ const c=COL.fantasma;
  // sonrisa ancha con dientes en zigzag y ojos triangulares rojos sobre un círculo morado (sin dibujar a Gengar)
  const dientes=[]; for(let i=0;i<=7;i++){ const x=126+i*260/7, y=262+Math.sin(Math.PI*i/7)*14; dientes.push([x,y]); if(i<7) dientes.push([x+130/7,y+(i%2?16:22)]); }
  const sonrisa=`M126 262Q256 400 386 262Z`;
  return orbe(256,256,320,c,{luz:[-24,-28,12,7]})+rel(sonrisa,'#FFFFFF')+rel(`M126 262${dientes.map(([x,y],i)=>`L${f(x)} ${f(y+(i%2?0:0))}`).join('')}L386 262Q256 290 126 262Z`,c.sombra)+
   rel(P([[176,200],[236,212],[204,236]]),'#E5484D')+rel(P([[336,200],[276,212],[308,236]]),'#E5484D')+
   [[110,130],[400,120],[420,330]].map(([x,y])=>sc(x,y,.4,180,rel('M0 -58C22 -28 40 -4 40 20C40 44 22 58 0 58C-22 58 -40 44 -40 20C-40 -4 -22 -28 0 -58Z',c.luz))).join(''); },
 bolsa_urf:()=>[[214,'#4FD1E8'],[256,'#8A96A8'],[298,'#E8B84A']].map(([x,col],i)=>orbe(x,170+(i===1?-14:0),54,{base:col,sombra:col,luz:'#fff'},{cx:-200,op:.6})).join('')+saco(256,300,330),
 campeon_sinnoh:()=>{ const c=COL.oro;
  return copa(256,250,300,c)+[200,256,312].map((x,i)=>i<2?`<circle cx="${x}" cy="200" r="15" fill="${c.luz}"/>`:`<circle cx="${x}" cy="200" r="12" fill="none" stroke="${c.luz}" stroke-width="6"/>`).join(''); },
 compras_compulsivas:()=>[-28,0,28].map((r,i)=>carta(232+i*34,170-(i===1?18:0),60,84,{rot:r})).join('')+carrito(256,300,300),
 compromiso_total:()=>emblema(256,190,240,SIN.fuego)+[300,340,378].map((y,i)=>`<ellipse cx="256" cy="${y}" rx="${i%2?10:16}" ry="22" fill="none" stroke="${COL.gris.base}" stroke-width="10"/>`).join('')+pokeball(256,428,80),
 corona_maldita:()=>{ const c=COL.riesgo;
  return hexagono(86,330,44,COL.blanco)+hexagono(426,330,44,COL.blanco)+forma(P([[116,320],[116,215],[166,280],[211,190],[256,262],[301,190],[346,280],[396,215],[396,320]]),c,{cx:256,luz:[140,292,16,6]})+
   forma(RR(116,320,280,64,10),c,{cx:256})+lin('M200 196L236 270L214 296L262 360L246 392',T.riesgo.acento,12); },
 crea_amigo:()=>pokeball(256,300,260)+[[176,130],[256,100],[336,130]].map(([x,y])=>estrella(x,y,56)).join(''),
 crecimiento_explosivo2:()=>[[124,140],[214,190],[304,240],[390,290]].map(([x,h])=>forma(P([[x,420-h],[x+55,420-h+60],[x+25,420-h+60],[x+25,420],[x-25,420],[x-25,420-h+60],[x-55,420-h+60]]),COL.exp,{cx:x})).join('')+rel(RR(96,428,320,16,8),COL.exp.luz),
 despertar_alma:()=>{ const c=COL.fantasma;
  const fl='M0 62C-36 62 -54 38 -50 8C-48 -10 -40 -20 -36 -40C-26 -26 -24 -16 -18 -10C-20 -36 -6 -56 10 -76C8 -52 20 -40 30 -28C34 -38 34 -48 30 -58C48 -38 56 -6 52 22C48 46 28 62 0 62Z';
  return [130,155,180].map(r=>lin(`M${256-r} 270A${r} ${r} 0 0 0 ${256+r} 270`,c.luz,8,{op:.45})).join('')+sc(256,236,2.25,0,forma(fl,c,{luz:[-26,10,6,12]})+sc(4,26,.48,0,rel(fl,c.luz))+`<ellipse cx="-8" cy="28" rx="5" ry="9" fill="#1B1B22"/><ellipse cx="14" cy="28" rx="5" ry="9" fill="#1B1B22"/>`); },
 emb_doble:()=>emblema(190,256,200,SIN.fuego)+hexagono(322,256,200,COL.oro)+escudo(322,258,92,{base:SIN.clase,sombra:'#3E5664',luz:'#C7D6E0'}),
 h_gyarados:()=>{ const c=COL.agua;
  const pico=(x,h,rot)=>sc(x,330,1,rot,forma(`M-28 0C-26 ${-h*.6} 0 ${-h} 20 ${-h}C8 ${-h*.7} 10 ${-h*.3} 28 0Z`,c,{luz:[-10,-h*.6,5,h*.15]}));
  return pico(190,140,-12)+pico(256,190,0)+pico(322,150,12)+forma('M60 330C120 270 180 300 256 330C332 360 392 300 452 330V420H60Z',c,{corte:'abajo',cy:380})+
   lin('M60 330C120 270 180 300 256 330C332 360 392 300 452 330',c.luz,10)+sc(392,148,1,-20,forma(E(0,0,35,22),COL.naranja,{luz:[-12,-8,8,4]})+rel(P([[30,0],[54,-18],[54,18]]),COL.naranja.sombra)+`<circle cx="-16" cy="-4" r="4" fill="#1B1B22"/>`); },
 epoca2:()=>calendario(256,270,260,280,COL.exp,flechaArriba(226,320,120,{base:T.exp.acento,sombra:'#D0559A',luz:'#FFE0F0'})+carta(320,346,50,70,{franja:COL.exp.base})),
 equipo_imposible:()=>{ const c=COL.legend;
  const ramas=[-1,1].map(s=>Array.from({length:5},(_,i)=>{ const a=(100+i*30)*Math.PI/180, x=256-s*Math.cos(a)*-150*-1, y=256+Math.sin(a)*150, xx=s<0?256+Math.cos(a)*150:256-Math.cos(a)*150, rot=s<0?(100+i*30)+90+25:-((100+i*30)+90+25);
   return sc(xx,y,1,rot,forma(E(0,0,14,30),COL.verde,{cx:200})); }).join('')).join('');
  return lin('M282 404A150 150 0 0 1 108 236',COL.verde.sombra,8)+lin('M230 404A150 150 0 0 0 404 236',COL.verde.sombra,8)+ramas+estrella(256,250,180,c); },
 inversion_vida2:()=>corazon(240,250,260)+mas(220,236,50,'#FFFFFF',16)+moneda(340,340,55),
 exceso_cucharas:()=>[-30,-10,10,30].map(r=>g(`rotate(${r} 256 430)`,cuchara(256,220,260))).join(''),
 exceso_garras:()=>[0,1,2,3].map(i=>garra(140+i*78,256,230,25,i%2?{base:OBJ.sombra,sombra:'#1F6F82',luz:OBJ.luz}:OBJ)).join(''),
 exceso_huesos:()=>hueso(220,370,230)+hueso(300,330,230)+hueso(256,250,240,32)+hueso(256,250,240,-32),
 expedicion:()=>montana(256,350,380,200,COL.legend)+forma(P([[256,250],[300,330],[212,330]]),{base:'#FFFFFF',sombra:'#E6E9EE',luz:'#fff'},{cx:256})+
  agujeros(bandera(256,150,220,COL.legend,COL.gris),[estrellaD(310,105,26)]),
 flexible:()=>emblema(150,360,130,SIN.fuego)+emblema(256,256,130,SIN.agua)+emblema(362,152,130,SIN.planta)+corazon(420,90,60),
 fondo_cobertura:()=>moneda(250,120,40,{aro:false})+hucha(250,300,280),
 forja_portatil:()=>yunque(240,350,300)+martillo(360,190,200,40)+destello(170,230,40,COL.objeto.luz)+destello(300,256,30,COL.objeto.luz),
 grande_poderoso:()=>`<path d="M0 44C-64 2 -58 -48 -27 -48C-11 -48 0 -38 0 -27C0 -38 11 -48 27 -48C58 -48 64 2 0 44Z" transform="translate(256 262) scale(3.4)" fill="none" stroke="${COL.vida.luz}" stroke-width="3"/>`+corazon(256,262,300)+mas(256,248,120,'#FFFFFF',36),
 guantes_suerte:()=>guanteFrente(256,262,300,OBJ,MUN,T.objeto.acento)+sc(256,232,1.15,0,[[-22,-22],[22,-22],[-22,22],[22,22]].map(([a,b])=>`<circle cx="${a*.7}" cy="${b*.7}" r="17" fill="${COL.verde.base}"/>`).join('')+lin('M0 0L10 34',COL.verde.sombra,6)),
 guantes_suerte2:()=>guanteFrente(300,240,250,{base:OBJ.sombra,sombra:'#1F6F82',luz:OBJ.sombra},{base:OBJ.sombra,sombra:'#1F6F82',luz:OBJ.sombra},OBJ.sombra)+guanteFrente(220,280,280,OBJ,MUN,T.objeto.acento)+
  sc(220,252,1,0,[[-22,-22],[22,-22],[-22,22],[22,22]].map(([a,b])=>`<circle cx="${a*.7}" cy="${b*.7}" r="17" fill="${COL.verde.base}"/>`).join('')+lin('M0 0L10 34',COL.verde.sombra,6))+reloj(410,100,70),
 guarida_baron:()=>espada(256,250,380,0,COL.ataque,COL.oro)+torre(256,272,280,COL.defensa),
 historia_remontada:()=>{ const c=COL.vida, d='M0 44C-64 2 -58 -48 -27 -48C-11 -48 0 -38 0 -27C0 -38 11 -48 27 -48C58 -48 64 2 0 44Z';
  const grieta='M0 -27L-8 -6L8 10L-4 26L0 44';
  return sc(230,280,3,0,`<clipPath id="hrI"><path d="M-100 -100H0L-8 -6L8 10L-4 26L0 44V100H-100Z"/></clipPath><clipPath id="hrD"><path d="M100 -100H0L-8 -6L8 10L-4 26L0 44V100H100Z"/></clipPath>`+
   g('translate(-5 0)',`<g clip-path="url(#hrI)">${forma(d,c,{cx:200,luz:[-30,-28,13,7]})}</g>`)+g('translate(5 0)',`<g clip-path="url(#hrD)">${forma(d,{base:c.sombra,sombra:c.sombra,luz:c.luz})}</g>`))+
   flechaCirc(330,250,130,150,265,'#FFFFFF',18); },
 huevo_oro:()=>huevo(256,262,300,COL.oro)+lin('M210 170L236 196L222 214L258 232L246 252L282 262',T.oro.luz,10)+destello(390,120,44)+destello(130,380,34),
 invertido:()=>[[160,120],[256,200],[352,290]].map(([x,h])=>forma(RR(x-35,420-h,70,h,14),COL.oro,{cx:x})).join('')+rel(RR(106,424,300,14,7),COL.oro.luz)+moneda(352,82,45,{aro:false}),
 laboratorio_evo:()=>matraz(256,320,300,COL.exp)+estrella(306,160,36)+estrella(336,112,44)+estrella(382,64,52),
 legado_arceus:()=>{ const c=COL.legend;
  return `<circle cx="256" cy="256" r="150" fill="none" stroke="${c.base}" stroke-width="26"/>`+[0,90,180,270].map(a=>sc(256,256,1,a,rel(RR(-13,-150,26,62,8),c.base))).join('')+
   orbe(256,256,110,c,{luz:[-20,-24,13,8]})+mas(232,256,40,'#FFFFFF',13)+`<text x="282" y="276" font-family="Arial Black,Arial" font-weight="900" font-size="58" fill="#FFFFFF" text-anchor="middle">2</text>`; },
 llamada_caos:()=>{ const p=prisma();
  return p.defs+remolino(256,256,320,`url(#${p.id})`)+`<circle cx="104" cy="104" r="20" fill="#fff"/>`+rel(P([[408,84],[430,124],[386,124]]),'#fff')+rel(RR(86,388,40,40,6),'#fff')+rel(estrellaD(410,408,24),'#fff'); },
 inesperado:()=>dado(178,330,110,1,-15)+dado(334,330,110,3,5)+dado(256,180,110,6,20)+[[118,300],[274,300],[196,150]].map(([x,y])=>lin(`M${x-10} ${y}C${x-30} ${y+20} ${x-30} ${y+50} ${x-12} ${y+66}`,COL.exp.luz,8,{op:.6})).join(''),
 loto2:()=>{ const c=COL.ataque;
  return [-60,-30,0,30,60].map(a=>g(`rotate(${a} 256 380)`,forma('M256 380C220 330 220 230 256 190C292 230 292 330 256 380Z',c,{cx:256,luz:[244,250,6,18]}))).join('')+rel(estrellaD(256,330,40,8,.5),T.ataque.acento); },
 maestro:()=>gorro(230,250,320)+flechaArriba(420,240,90,{base:T.exp.acento,sombra:'#D0559A',luz:'#FFE0F0'}),
 manten_linea:()=>[200,312].map(x=>flechaArriba(x,150,64,{base:T.defensa.acento,sombra:'#7F92A8',luz:'#fff'})).join('')+forma(RR(91,256,330,30,10),COL.defensa,{cx:256})+[146,256,366].map(x=>hexagono(x,272,110,COL.defensa)).join(''),
 master:()=>pokeball(256,256,300,{top:{base:'#6A22E0',sombra:'#4A12A8',luz:'#C9A6FF'}})+[[-1,170,176],[1,342,176]].map(([s,x,y])=>orbe(x,y,50,{base:'#F28CC6',sombra:'#C95E9C',luz:'#fff'})).join('')+
  `<path d="M226 186V146L256 172L286 146V186" fill="none" stroke="#FFFFFF" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>`,
 hiper_carry:()=>diana(256,270,300)+lin('M262 264L392 134',COL.marron.base,14)+rel(P([[392,134],[420,128],[404,152]]),T.ataque.acento)+rel(P([[392,134],[386,106],[410,118]]),T.ataque.acento),
 mercado_negro:()=>{ const c=COL.rocket;
  return lin('M206 150V128C206 112 306 112 306 128V150',COL.negro.luz,22)+forma(RR(106,150,300,200,22),{base:'#26262E',sombra:'#15151A',luz:'#4A4A55'},{cx:256,luz:[150,180,30,10]})+
   rel(RR(140,170,30,20,5),COL.gris.base)+rel(RR(342,170,30,20,5),COL.gris.base)+`<text x="256" y="294" font-family="Arial Black,Arial" font-weight="900" font-size="110" fill="${T.rocket.acento}" text-anchor="middle">R</text>`; },
 min_max:()=>`<path d="M226 230A36 36 0 0 1 286 230" fill="none" stroke="${COL.objeto.luz}" stroke-width="6" opacity=".7"/><path d="M216 214A50 50 0 0 1 296 214" fill="none" stroke="${COL.objeto.luz}" stroke-width="6" opacity=".5"/>`+
  orbe(226,180,50,COL.objeto,{cx:-200})+orbe(290,150,50,COL.oro,{cx:-200})+iman(256,330,260),
 mision_componentes:()=>forma(RR(120,106,240,300,18),COL.blanco,{cx:240})+[170,250,330].map((y,i)=>rel(RR(150,y-20,40,40,8),'#D3D8E0')+rel(RR(206,y-7,120,14,7),'#D3D8E0')+(i<2?lin(`M158 ${y}L168 ${y+10}L184 ${y-10}`,T.objeto.acento,8):'')).join('')+orbe(400,380,60,COL.objeto),
 monotipo:()=>emblema(256,256,280,SIN.fuego)+`<text x="256" y="284" font-family="Arial Black,Arial" font-weight="900" font-size="80" fill="#FFFFFF" text-anchor="middle">1</text>`,
 montones_stats:()=>['#2EC4B6','#E5484D','#9B6BFF','#5B8DEF','#FFD23F','#4FD1E8'].map((col,i)=>{ const a=-Math.PI/2+i*Math.PI/3; return pieza(P([[0,-50],[40,0],[0,50],[-40,0]]),256+Math.cos(a)*120,256+Math.sin(a)*120,60,{base:col,sombra:col,luz:'#fff'},{cx:-200,luz:[-10,-18,5,8],op:.5}); }).join('')+orbe(256,256,90,COL.blanco)+mas(256,256,44,COL.vida.base,13),
 monzon:()=>nube(256,150,300)+[[176,260],[256,280],[336,260],[216,370],[296,370]].map(([x,y])=>lin(`M${x} ${y-44}V${y-30}`,COL.oro.luz,6,{op:.7})+moneda(x,y,22,{aro:false})).join(''),
 movilidad:()=>[0,1,2,3].map(i=>forma(RR(96+i*80,360-i*60,80,60+i*60,8),COL.exp,{cx:136+i*80})).join('')+moneda(136,330,25,{aro:false})+flechaCirc(330,330,190,195,262,'#FFFFFF',14),
 nucleo_comercial:()=>[-30,-15,0,15,30].map(r=>g(`rotate(${r} 256 400)`,carta(256,260,100,140))).join('')+flechaCirc(256,262,200,-60,240,COL.tienda.base,18),
 picaro_radiante:()=>[0,60,120,180,240,300].map(a=>sc(256,262,1,a,rel(RR(-8,-205,16,50,8),COL.oro.luz))).join('')+guanteFrente(256,262,280,COL.oro,{base:'#FFF1C4',sombra:'#E9D49A',luz:'#fff'},COL.oro.sombra)+destello(390,110,50),
 h_clefable:()=>`<path d="M210 196L250 206L404 420L322 440Z" fill="#F2A9CF" opacity=".8"/>`+luna(180,170,260,{base:'#FFD6EA',sombra:'#F0B4D2',luz:'#fff'})+destello(320,230,30,'#fff')+destello(380,320,30,'#fff')+destello(110,320,30,'#fff'),
 proyecto_mew:()=>orbe(256,256,280,COL.psiquico,{luz:[-22,-26,14,9]})+['#EE6B2F','#3B8FE8','#4CAF50','#D9B400','#E0569B','#7B62A3','#6F5CE0','#9A987F'].map((col,i)=>{ const a=-Math.PI/2+i*Math.PI/4; return `<circle cx="${f(256+Math.cos(a)*90)}" cy="${f(256+Math.sin(a)*90)}" r="13" fill="${col}"/>`; }).join(''),
 reliquias_radiantes:()=>{ const c=COL.oro, cx=256, cy=262, pts=[[cx,cy-130],[cx+100,cy-50],[cx+100,cy+50],[cx,cy+130],[cx-100,cy+50],[cx-100,cy-50]];
  return `<circle cx="${cx}" cy="${cy}" r="170" fill="none" stroke="${c.luz}" stroke-width="12" opacity=".6"/>`+[0,90,180,270].map(a=>sc(cx,cy,1,a,rel(RR(-7,-226,14,40,7),c.luz))).join('')+
   pts.map((p,i)=>rel(P([[cx,cy],p,pts[(i+1)%6]]),[c.base,c.luz,c.sombra,c.base,c.luz,c.sombra][i])).join(''); },
 reparto3:()=>pokeball(126,270,130)+pokeball(386,270,130)+pokeball(256,270,140)+`<circle cx="256" cy="166" r="35" fill="#1B1B22"/><text x="256" y="186" font-family="Arial Black,Arial" font-weight="900" font-size="52" fill="${COL.oro.base}" text-anchor="middle">4</text>`,
 linaje:()=>{ const c=COL.dragon;
  return forma('M120 120C200 110 320 120 400 200C380 230 350 240 330 236C330 270 300 290 270 284C270 320 230 340 200 330C190 260 160 180 120 120Z',c,{cx:290,luz:[200,160,30,10]})+
   [['M120 120C220 140 330 160 400 200'],['M120 120C200 170 260 220 270 284'],['M120 120C170 190 190 260 200 330']].map(([d])=>lin(d,c.sombra,14)).join('')+gota(330,380,90,{base:T.dragon.acento,sombra:'#C2410C',luz:'#FFD39A'}); },
 suscripcion:()=>cajaRegalo(256,270,280,COL.pokemon?COL.rojo:COL.rojo,COL.oro)+`<text x="330" y="252" font-family="Arial Black,Arial" font-weight="900" font-size="44" fill="${COL.oro.base}" text-anchor="middle">5</text>`+pokeball(400,390,62),
 tesoros_enterrados:()=>cofre(240,250,280)+lin('M330 120L390 230',COL.marron.base,12)+forma(P([[380,214],[420,224],[400,260]]),COL.gris)+
  forma('M86 330C140 310 200 350 256 330C312 310 372 350 426 330V400C426 420 410 430 390 430H122C102 430 86 420 86 400Z',COL.tierra,{cx:256})+[362,396].map(y=>lin(`M110 ${y}C160 ${y-16} 210 ${y+16} 256 ${y}C302 ${y-16} 352 ${y+16} 402 ${y}`,COL.tierra.sombra,10)).join(''),
 ultima_ball:()=>pokeball(240,290,260)+`<path d="M0 44C-64 2 -58 -48 -27 -48C-11 -48 0 -38 0 -27C0 -38 11 -48 27 -48C58 -48 64 2 0 44Z" transform="translate(400 120) scale(.66)" fill="none" stroke="#E5484D" stroke-width="10"/>`+
  `<clipPath id="ub"><rect x="350" y="120" width="100" height="60"/></clipPath><path d="M0 44C-64 2 -58 -48 -27 -48C-11 -48 0 -38 0 -27C0 -38 11 -48 27 -48C58 -48 64 2 0 44Z" transform="translate(400 120) scale(.66)" fill="#E5484D" clip-path="url(#ub)"/>`,
 vale_la_pena:()=>relojArena(256,256,190,280,{vidrio:{luz:'#F4F5F8'},tapa:COL.negro,interior:pokeball(230,348,36)+pokeball(270,348,36)+pokeball(250,318,36)+pokeball(256,236,30)}),
 verticalidad3:()=>forma(RR(241,90,30,330,12),COL.oro,{cx:256})+[136,256,376].map(y=>emblema(236,y,130,SIN.dragon)).join('')+flechaArriba(380,256,90,COL.blanco)+[0,1,2].map(i=>rel(RR(196+i*20,440,10,30,4),COL.oro.luz)).join(''),
};
