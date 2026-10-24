// Iconos 2D minimalistas de los aumentos de Oro (fichas de iconos-aumentos-ideas.js). Piezas en iconos-min-lib.js.
const L=require('./iconos-min-lib.js');
const {T,COL,SIN,f,E,RR,P,hexD,estrellaD,g,sc,lin,rel,forma,pieza,agujeros,prisma,destello,estrella,mas,cruz,cruzD,D,corazon,orbe,gota,llama,rayo,luna,flechaArriba,escudo,torre,hexagono,chevron,flechaCirc,
 moneda,monedaPlana,pila,pokeball,emblema,dado,carta,saco,hucha,relojArena,calendario,yunque,martillo,cuchara,garra,lupa,espada,diana,copa,cajaRegalo,candado,matraz,engranaje,montana,bandera,remolino,iman,libroAbierto,libroCerrado,pizarra,hoja}=L;
const ROSA_EXP={base:T.exp.acento,sombra:'#D0559A',luz:'#FFE0F0'}, CLASE={base:SIN.clase,sombra:'#3E5664',luz:'#C7D6E0'};
const txt=(x,y,s,t,col='#FFFFFF')=>`<text x="${x}" y="${y}" font-family="Arial Black,Arial" font-weight="900" font-size="${s}" fill="${col}" text-anchor="middle">${t}</text>`;
const duplicar=(x,y,s,c=COL.blanco)=>forma(RR(x-s*.5,y-s*.5,s*.7,s*.7,s*.12),{base:c.sombra,sombra:c.sombra,luz:c.luz})+forma(RR(x-s*.2,y-s*.2,s*.7,s*.7,s*.12),c,{cx:x+s*.15});
const equis=(x,y,s,col='#FFFFFF',w=12)=>lin(`M${x-s/2} ${y-s/2}L${x+s/2} ${y+s/2}M${x+s/2} ${y-s/2}L${x-s/2} ${y+s/2}`,col,w);
const estallido=(x,y,d,c,n=8,k=.5)=>pieza(estrellaD(0,0,50,n,k),x,y,d,c,{luz:[-16,-18,8,5]});
// puño esquemático de frente: bloque con 4 nudillos
const puno=(x,y,w,c,rot=0)=>sc(x,y,w/110,rot,forma(RR(-50,-30,100,70,16),c,{luz:[-30,-20,10,5]})+[-36,-12,12,36].map(a=>forma(E(a,-30,13,13),c,{cx:200})).join('')+lin('M-44 10H20',c.sombra,6));
const lingote=(x,y,s,rot=0)=>sc(x,y,s/150,rot,forma(P([[-60,-18],[60,-18],[74,20],[-74,20]]),COL.oro,{luz:[-34,-6,18,4]})+forma(P([[-60,-18],[60,-18],[50,-30],[-50,-30]]),{base:COL.oro.luz,sombra:'#F4DE9A',luz:'#fff'}));
const cuenco=(x,y,w,c=COL.oro)=>forma(`M${x-w/2} ${y}A${w/2} ${w/4} 0 0 0 ${x+w/2} ${y}Z`,c,{cx:x})+rel(E(x,y,w/2,12),c.sombra);
const eslabon=(x,y,w,h,col,ancho)=>`<rect x="${x-w/2}" y="${y-h/2}" width="${w}" height="${h}" rx="${h/2}" fill="none" stroke="${col}" stroke-width="${ancho}"/>`;
const escudoBorde=(x,y,h,c,borde=COL.oro)=>escudo(x,y,h,borde)+escudo(x,y+h*.02,h*.84,c);
const ojo=(x,y,w,c=COL.psiquico)=>sc(x,y,w/160,0,rel('M-80 0C-40 -50 40 -50 80 0C40 50 -40 50 -80 0Z','#FFFFFF')+forma(E(0,0,30,30),c,{luz:[-10,-12,7,4]})+`<circle r="12" fill="#1B1B22"/>`);
const fantasma=(x,y,h,c,op=1)=>sc(x,y,h/140,0,`<g opacity="${op}">`+agujeros(forma('M-55 70V-10C-55 -48 -30 -70 0 -70C30 -70 55 -48 55 -10V70L36 52L18 70L0 52L-18 70L-36 52Z',c,{luz:[-30,-40,10,14]}),[E(-18,-14,9,14),E(18,-14,9,14)])+'</g>');
const ala=(x,y,s,dir,c=COL.blanco)=>sc(x,y,s/170,0,[0,1,2,3].map(i=>forma(RR(dir>0?0:-(90+i*26),-50+i*26,90+i*26,22,11),c,{cx:dir>0?-400:400})).join(''));

module.exports={
 h_raichu:()=>rayo(256,250,330,COL.electrico,{rot:15})+orbe(150,330,64,{base:'#E5484D',sombra:'#B53338',luz:'#FFD3D4'})+pieza(P([[0,-50],[30,0],[0,50],[-30,0]]),390,140,44,COL.electrico,{cx:-200})+pieza(P([[0,-50],[30,0],[0,50],[-30,0]]),130,150,36,COL.electrico,{cx:-200}),
 oro21:()=>pila(256,420,7,1.6,24)+destello(392,96,52),
 academia:()=>libroAbierto(256,330,330,COL.exp)+estrella(200,150,64)+estrella(316,120,64),
 acelerador:()=>[0,1,2].map(i=>lin(`M${56} ${200+i*50}H${110}`,COL.velocidad.luz,10)).join('')+agujeros(engranaje(286,256,290,COL.velocidad),[E(286,256,52,52)])+rayo(286,256,90,{base:T.velocidad.acento,sombra:'#2550B8',luz:'#CFE0FF'}),
 acero_dorado:()=>lingote(256,330,300)+lingote(256,250,280,-20)+sc(220,348,1,0,rel(estrellaD(0,0,20),COL.oro.sombra)),
 h_ditto:()=>{ const c=COL.lila;
  return pieza('M-62 40C-76 40 -80 20 -70 6C-80 -14 -66 -38 -42 -34C-34 -54 -12 -56 0 -42C12 -60 40 -54 44 -34C68 -36 82 -10 70 8C80 24 72 40 58 40Z',220,300,260,c,{luz:[-40,-22,10,6]})+
   `<circle cx="196" cy="290" r="7" fill="#1B1B22"/><circle cx="238" cy="290" r="7" fill="#1B1B22"/>`+lin('M200 318Q218 326 236 318','#1B1B22',5)+flechaCirc(330,190,70,150,300,'#FFFFFF',12)+txt(400,186,90,'?'); },
 aguante:()=>corazon(256,262,300)+lin('M256 186L236 220L268 252L240 290L256 322',T.vida.luz,10)+[[222,238,262,234],[234,276,270,272],[232,206,262,206]].map(([a,b,c,d])=>lin(`M${a} ${b}L${c} ${d}`,'#FFFFFF',7)).join(''),
 amuleto2:()=>lin('M214 176C210 46 302 46 298 176',COL.oro.sombra,18)+agujeros(moneda(256,290,120),[229,265].map(x=>RR(x,250,18,80,4))),
 apoyo:()=>{ // manos ahuecadas: una cuna en U con los pulgares hacia arriba, bajo el orbe de curación
  const cuna='M110 300C120 390 190 440 256 440C322 440 392 390 402 300C390 288 372 290 366 304C352 360 310 396 256 396C202 396 160 360 146 304C140 290 122 288 110 300Z';
  return orbe(256,250,180,COL.vida)+cruz(256,250,84,'#FFFFFF')+forma(cuna,COL.crema,{cx:256,luz:[150,360,14,8]})+lin('M150 330C176 380 216 400 256 402M362 330C336 380 296 400 256 402',COL.crema.sombra,5,{op:.6}); },
 armadura_argumental:()=>{ const c=COL.defensa, peto='M-62 -60H62L66 0C66 40 36 62 0 72C-36 62 -66 40 -66 0Z';
  return sc(256,270,2.1,0,forma(peto,c,{corte:'abajo',cy:6,luz:[-34,-40,12,6]})+lin('M0 -58V68',c.luz,4)+lin('M-66 6H66',c.luz,4,{op:.8}))+
   forma('M110 196C110 150 150 128 196 136V196Z',c,{cx:-400,luz:[134,156,12,6]})+forma('M402 196C402 150 362 128 316 136V196Z',{base:c.sombra,sombra:c.sombra,luz:c.luz}); },
 ascension:()=>{ // alas de tres plumas redondeadas que suben en abanico a los lados de la espada
  const ala=s=>[0,1,2].map(i=>sc(256+s*(60+i*10),250-i*6,1,s*(-60+i*28),g(`scale(${s} 1)`,forma(RR(0,-18,150-i*24,36,18),COL.blanco,{cx:-400})))).join('');
  return ala(-1)+ala(1)+espada(256,262,250,0,COL.ataque,COL.oro); },
 relampago:()=>rayo(290,256,330)+equis(120,180,50)+equis(120,300,50),
 h_lucario:()=>{ const az={base:'#3FA0FF',sombra:'#2266C4',luz:'#CDE6FF'};
  return orbe(160,200,150,az)+orbe(160,200,75,COL.blanco,{cx:-200})+[[0,-150],[-150,0],[150,0],[0,150]].map(([a,b],i)=>gota(290+a*.9,260+b*.9,60,az,{rot:[0,-90,90,180][i]})).join('')+orbe(290,260,220,az)+orbe(290,260,110,COL.blanco,{cx:-200}); },
 baston_serafin:()=>forma(RR(243,140,26,320,13),COL.marron,{cx:256})+luna(256,120,150,COL.psiquico)+[[350,250],[380,320],[340,380]].map(([x,y])=>gota(x,y,44,COL.objeto)).join(''),
 bolsa_heroica:()=>saco(256,290,300,COL.marron)+duplicar(256,320,80),
 bolsa_heroica2:()=>saco(240,280,280,COL.marron)+duplicar(240,310,76)+moneda(390,400,36,{aro:false}),
 bolsa_heroica3:()=>saco(230,280,280,COL.marron)+duplicar(230,310,76)+pila(390,410,3,.85),
 buscavidas:()=>espada(210,150,170,-40,COL.blanco,COL.gris)+espada(302,150,170,40,COL.blanco,COL.gris)+moneda(256,300,110),
 h_charizard:()=>[[150,360,70],[130,280,95],[120,190,120]].map(([x,y,l],i)=>lin(`M${x+20} ${y}C${x-10} ${y-l*.3} ${x-10} ${y-l*.7} ${x+20} ${y-l}`,T.fuego.acento,14+i*4)).join('')+llama(286,256,330),
 camino_campeon:()=>[[130,410],[200,350],[270,290],[340,230]].map(([x,y])=>forma(RR(x-45,y-25,90,50,12),COL.exp,{cx:x,luz:[x-30,y-16,10,4]})).join('')+bandera(352,140,130,{base:ROSA_EXP.base,sombra:ROSA_EXP.sombra,luz:'#fff'}),
 invicto:()=>copa(256,300,300)+[196,256,316].map((x,i)=>llama(x,i===1?96:110,i===1?70:56,COL.naranja,'#FFE14A')).join(''),
 concentracion:()=>ojo(256,220,320)+rel(RR(126,370,260,30,15),'#2A3440')+rel(RR(126,370,208,30,15),T.objeto.base),
 conoce_rival:()=>espada(256,256,330,45,COL.ataque,COL.oro)+espada(256,256,330,-45,COL.ataque,COL.oro)+hexagono(256,240,80,COL.oro),
 construccion_maxima:()=>[0,1,2].map(i=>carta(296-i*28,236+i*28,130,180,{franja:COL.tienda.base})).join('')+duplicar(240,300,70,{base:COL.tienda.base,sombra:COL.tienda.sombra,luz:'#fff'}),
 companero:()=>pokeball(256,300,240)+[180,256,332].map(x=>estrella(x,110,64)).join(''),
 crecimiento_explosivo:()=>[[150,170],[256,230],[362,290]].map(([x,h])=>forma(P([[x,420-h],[x+60,420-h+66],[x+28,420-h+66],[x+28,420],[x-28,420],[x-28,420-h+66],[x-60,420-h+66]]),COL.exp,{cx:x})).join('')+rel(RR(116,428,280,16,8),COL.exp.luz),
 cuatro_veces:()=>[[196,196],[316,196],[196,316],[316,316]].map(([x,y])=>forma(RR(x-55,y-55,110,110,18),COL.objeto,{cx:x})).join('')+corazon(256,262,100),
 h_meowth:()=>[[330,170],[380,120],[420,180]].map(([x,y],i)=>moneda(x,y,22+i*2,{aro:false})).join('')+agujeros(pieza(E(0,0,45,50),240,290,200,COL.oro,{luz:[-20,-24,10,6]}),[P([[240,262],[268,290],[240,318],[212,290]])]),
 diferente:()=>[[110,400],[170,350],[230,300],[290,250]].map(([x,y])=>orbe(x,y,70,COL.gris)).join('')+orbe(380,140,120,COL.velocidad)+rayo(380,140,64,{base:T.velocidad.acento,sombra:'#2550B8',luz:'#CFE0FF'}),
 doble_baja:()=>lin('M96 190C140 120 300 110 370 160',COL.rojo.base,56,{cap:'butt'})+lin('M370 160L420 240M372 168L392 260',COL.rojo.sombra,20)+moneda(210,350,55)+equis(320,330,40)+equis(380,370,40),
 dominio:()=>emblema(256,220,220,SIN.agua)+[[196,COL.oro.base],[256,'#FFFFFF'],[316,T.objeto.base]].map(([x,col])=>`<circle cx="${x}" cy="400" r="15" fill="${col}"/>`).join(''),
 duo_legendario:()=>estrella(220,220,180,COL.legend)+estrella(300,250,180,COL.legend)+orbe(226,400,52,COL.objeto)+orbe(290,400,52,COL.objeto),
 eco_caos:()=>{ const p=prisma(); return p.defs+[150,186].map(r=>`<circle cx="256" cy="256" r="${r}" fill="none" stroke="url(#${p.id})" stroke-width="8" opacity=".5"/>`).join('')+remolino(256,256,280,`url(#${p.id})`); },
 regreso:()=>hucha(256,310,280)+flechaCirc(256,190,120,190,350,'#FFFFFF',18),
 guardaespaldas:()=>escudo(256,262,290,COL.defensa)+[0,1,2].map(i=>lin(`M216 ${300-i*44}L256 ${270-i*44}L296 ${300-i*44}`,'#FFFFFF',14)).join(''),
 epoca:()=>calendario(256,270,260,280,COL.exp,flechaArriba(256,320,110,ROSA_EXP)),
 cazadores:()=>`<circle cx="256" cy="250" r="140" fill="none" stroke="${COL.ataque.base}" stroke-width="20"/>`+lin('M256 90V190M256 310V410M96 250H196M316 250H416',COL.ataque.base,12)+`<circle cx="256" cy="250" r="22" fill="${COL.ataque.base}"/>`+moneda(400,400,30,{aro:false}),
 escalada_final:()=>montana(196,330,260,200,COL.exp)+montana(310,300,300,260,{base:COL.exp.base,sombra:COL.exp.sombra,luz:COL.exp.luz})+estrella(310,140,74),
 escalera:()=>[60,120,180,240,300].map((h,i)=>forma(RR(96+i*66,430-h,66,h,8),COL.oro,{cx:129+i*66})).join('')+hexagono(393,104,56,COL.oro),
 especialista:()=>lupa(236,236,320,0,COL.gris,estrella(0,0,72))+'',
 espectro:()=>fantasma(300,230,240,COL.fantasma,.35)+fantasma(240,270,280,COL.fantasma,.85),
 inversion_vida:()=>corazon(240,250,240)+moneda(340,340,45),
 estudio_paciente:()=>libroCerrado(256,262,300,COL.exp,ROSA_EXP),
 evolucion_temprana:()=>orbe(120,256,110,COL.exp)+orbe(220,256,110,COL.exp)+lin('M280 236H330M280 276H330','#FFFFFF',12)+estrella(400,256,110),
 favor_cuidador:()=>yunque(230,320,320)+flechaArriba(410,180,80,COL.exp),
 forja_rapida:()=>martillo(256,256,330,40)+moneda(140,380,30,{aro:false})+destello(370,380,46,COL.objeto.luz),
 forja_rapida2:()=>martillo(256,256,330,40)+moneda(130,370,30,{aro:false})+moneda(190,410,26,{aro:false})+flechaArriba(400,380,64,COL.exp),
 forjador_cucharas:()=>cuchara(256,256,330,35)+cuchara(256,256,330,-35)+destello(256,180,56,COL.objeto.luz),
 formacion_kanto:()=>[[150,320],[270,320],[210,214]].map(([x,y])=>hexagono(x,y,124,COL.defensa)).join('')+hexagono(392,150,124,COL.defensa)+espada(210,214,90,0,COL.blanco,COL.blanco)+rayo(392,150,80,COL.velocidad),
 h_alakazam:()=>{ const pts=[]; for(let i=0;i<=60;i++){ const a=i/60*Math.PI*4, r=20+i*2.6; pts.push(`${f(256+Math.cos(a)*r)} ${f(256+Math.sin(a)*r)}`); }
  return `<path d="M${pts.join('L')}" fill="none" stroke="${COL.psiquico.base}" stroke-width="12" stroke-linecap="round" opacity=".7"/>`+cuchara(256,256,330,35)+cuchara(256,256,330,-35); },
 h_machamp:()=>[[190,190],[322,190],[190,322],[322,322]].map(([x,y])=>puno(x,y,104,COL.lucha)+[-1,0,1].map(k=>lin(`M${x+(x<256?-70:70)} ${y+k*26}l${x<256?-26:26} ${k*8}`,COL.lucha.luz,6)).join('')).join(''),
 gracia_retador:()=>[0,1,2].map(i=>lin(`M56 ${270+i*36}H120`,COL.velocidad.luz,10)).join('')+
  [0,1,2].map(i=>sc(196,214,1,-30+i*-18,forma(RR(-110+i*10,-14,110-i*10,28,14),COL.blanco,{cx:-400}))).join('')+
  pieza('M-48 -62H8V-6C26 0 54 8 64 26C70 38 64 48 50 48H-48Z',280,270,250,COL.velocidad,{luz:[-34,-48,8,12]})+rel(RR(162,374,240,22,11),COL.velocidad.sombra),
 gran_bolsa:()=>iman(392,170,120,20)+orbe(300,150,60,COL.objeto,{cx:-200})+saco(236,300,330,COL.marron),
 hambre_oro:()=>[[156,300],[206,280],[256,272],[306,280],[356,300]].map(([x,y])=>moneda(x,y,36,{aro:false})).join('')+cuenco(256,316,360),
 hambre_oro2:()=>moneda(226,110,30,{aro:false})+moneda(296,170,30,{aro:false})+[[156,300],[206,280],[256,272],[306,280],[356,300]].map(([x,y])=>moneda(x,y,36,{aro:false})).join('')+cuenco(256,316,360),
 cadena_evo:()=>[[136,'#EE6B2F'],[256,'#3B8FE8'],[376,'#D9B400']].map(([x,col],i)=>eslabon(x,256,130,80,COL.oro.base,22)+`<circle cx="${x}" cy="256" r="18" fill="${col}"/>`).join(''),
 emb_clase:()=>escudoBorde(256,262,290,CLASE)+estrella(256,250,100,COL.blanco),
 insignias:()=>pieza(P([[-20,-48],[20,-48],[48,-20],[48,20],[20,48],[-20,48],[-48,20],[-48,-20]]),130,256,110,COL.oro)+pieza(P([[0,-55],[45,0],[0,55],[-45,0]]),256,256,110,COL.oro,{cx:0})+
  `<path d="${D.gota}" transform="translate(382 262) scale(.95)" fill="none" stroke="${COL.oro.base}" stroke-width="10"/>`,
 depredadores:()=>[0,1,2].map(i=>garra(190+i*66,250,280,30,COL.ataque)).join('')+gota(400,390,60,COL.vida),
 intercambio_eq:()=>flechaCirc(256,256,150,200,340,'#FFFFFF',26)+flechaCirc(256,256,150,20,160,'#FFFFFF',26)+pokeball(256,256,100)+estrella(380,130,64),
 investigacion_fin:()=>matraz(256,300,320,COL.oro,[[-20,40],[14,44],[-4,24],[30,22],[-30,22]].map(([a,b])=>`<circle cx="${a}" cy="${b}" r="13" fill="${COL.oro.luz}" stroke="${COL.oro.sombra}" stroke-width="3"/>`).join(''))+`<circle cx="276" cy="110" r="15" fill="none" stroke="${COL.oro.luz}" stroke-width="5"/>`,
 legion_tres:()=>escudoBorde(160,262,180,CLASE)+escudoBorde(352,262,180,CLASE)+escudoBorde(256,256,200,CLASE)+txt(256,282,64,'3'),
 llamada_clan:()=>[0,1,2].map(i=>lin(`M${356+i*26} ${190-i*8}Q${380+i*30} 256 ${356+i*26} ${322+i*8}`,COL.oro.luz,10,{op:.8-i*.2})).join('')+pieza('M-60 30C-70 20 -70 8 -60 2L40 -40C50 -44 56 -30 56 0C56 30 50 44 40 40Z',220,256,300,COL.oro,{luz:[-20,-12,14,5]})+forma(RR(70,240,40,32,8),COL.oro,{cx:90}),
 loto:()=>[-35,0,35].map(a=>g(`rotate(${a} 256 380)`,forma('M256 380C220 330 220 230 256 190C292 230 292 330 256 380Z',COL.ataque,{cx:256,luz:[244,250,6,18]}))).join('')+rel(estrellaD(256,330,34,6,.5),T.ataque.acento),
 medalla2:()=>forma(P([[200,80],[240,80],[276,200],[236,200]]),{base:'#3B8FE8',sombra:'#2266C4',luz:'#fff'},{cx:-400})+forma(P([[312,80],[272,80],[236,200],[276,200]]),{base:'#E5484D',sombra:'#A82A30',luz:'#fff'},{cx:-400})+
  agujeros(moneda(256,300,110,{c:COL.plata}),[]) + mas(232,300,44,'#FFFFFF',14)+txt(286,326,70,'1'),
 mente_abarrotada:()=>pieza('M-10 -60C30 -60 58 -30 56 6C55 20 50 26 46 34L50 54H18V64H-24C-36 64 -44 54 -44 42V26C-58 10 -60 -12 -50 -32C-42 -50 -28 -60 -10 -60Z',256,256,300,COL.exp,{luz:[-24,-34,12,7]})+
  [[220,210],[262,200],[244,244],[286,240],[226,280]].map(([x,y])=>pokeball(x,y,38)).join(''),
 monetizacion:()=>diana(256,170,190)+[[180,330],[256,370],[332,330]].map(([x,y])=>lin(`M${x} ${y-50}V${y-36}`,COL.oro.luz,6,{op:.7})+moneda(x,y,26,{aro:false})).join(''),
 no_scout:()=>candado(236,280,300)+flechaArriba(410,250,90,COL.blanco),
 orbes_curativos2:()=>orbe(190,220,150,COL.vida)+cruz(190,220,70,'#FFFFFF')+orbe(330,300,150,COL.vida)+cruz(330,300,70,'#FFFFFF')+orbe(160,380,90,COL.vida)+cruz(160,380,42,'#FFFFFF')+[[400,160],[420,210],[380,420]].map(([x,y])=>gota(x,y,36,COL.vida)).join(''),
 paciencia_evo:()=>relojArena(256,256,190,280,{vidrio:{luz:'#F4F5F8'},tapa:COL.marron,interior:estrella(256,330,64)}),
 pacto_rocket:()=>escudoBorde(256,262,290,COL.negro,COL.gris)+txt(256,300,130,'R',T.rocket.acento)+moneda(390,390,30,{aro:false}),
 plano_retaguardia:()=>forma(RR(116,146,280,220,16),{base:'#CFE0FF',sombra:'#AFC6EC',luz:'#fff'},{cx:256})+[1,2].map(i=>lin(`M${116+i*93} 160V352M130 ${146+i*73}H382`,'#FFFFFF',4,{op:.8})).join('')+
  `<circle cx="210" cy="182" r="18" fill="none" stroke="#2550B8" stroke-width="6"/><circle cx="210" cy="182" r="6" fill="#2550B8"/>`+lin('M290 196L330 166M318 166H330V178','#2550B8',6),
 poder_prohibido:()=>`<circle cx="256" cy="256" r="150" fill="${COL.riesgo.base}" opacity=".45"/>`+pieza(P([[0,-60],[36,0],[0,60],[-36,0]]),256,256,260,{base:'#2A2230',sombra:'#17121C',luz:'#5A4A66'},{luz:[-12,-26,5,10]})+
  `<path d="${P([[256,126],[331,256],[256,386],[181,256]])}" fill="none" stroke="${COL.riesgo.luz}" stroke-width="6"/>`+lin('M240 170L262 220L244 250L272 300',COL.riesgo.base,8)+lin('M290 240L270 270',COL.riesgo.base,6),
 favorito:()=>corazon(240,270,260,COL.rosa)+estrella(240,256,90,COL.blanco)+flechaArriba(410,140,70,COL.blanco),
 prestamo:()=>moneda(230,260,110)+flechaArriba(400,300,100,COL.riesgo,{rot:180}),
 prestamo2:()=>pila(220,330,3,1.7)+flechaArriba(400,300,100,COL.riesgo,{rot:180}),
 primeras_lecciones:()=>pizarra(256,256,300,220,mas(200,250,56,'#FFFFFF',12)+txt(254,272,60,'1')+lin('M310 290V214M290 234L310 214L330 234','#FFFFFF',10)),
 profesor_pokemon:()=>[[190,256],[322,256]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="58" fill="${COL.exp.luz}" opacity=".25"/><circle cx="${x}" cy="${y}" r="58" fill="none" stroke="${COL.exp.base}" stroke-width="18"/>`).join('')+lin('M246 248Q256 236 266 248',COL.exp.base,14)+estrella(322,256,60),
 racha_dorada:()=>llama(256,230,300,COL.oro,COL.oro.luz)+[196,236,276,316].map(x=>rel(RR(x-8,400,16,48,8),COL.oro.base)).join(''),
 raices:()=>[[-1,40,70],[0,0,96],[1,40,70],[-1,90,40],[1,90,40]].map(([s,dx,l],i)=>lin(`M256 300C${256+s*dx*.4} ${330+i*4} ${256+s*dx} ${340+l*.4} ${256+s*(dx+20)} ${320+l}`,COL.marron.base,i<3?14:9)).join('')+emblema(256,200,220,SIN.planta),
 raices2:()=>[[-1,30,50],[0,0,70],[1,30,50]].map(([s,dx,l])=>lin(`M256 370C${256+s*dx*.4} 390 ${256+s*dx} 400 ${256+s*(dx+16)} ${380+l}`,COL.marron.base,12)).join('')+emblema(256,300,160,SIN.planta)+emblema(256,146,160,SIN.planta)+moneda(400,410,30,{aro:false}),
 regalo_cumple:()=>cajaRegalo(256,300,280,COL.rosa)+estrella(200,110,60)+estrella(310,96,60),
 remontada_epica:()=>flechaCirc(256,256,180,-60,240,COL.tienda.base,18)+carta(256,256,180,250)+txt(256,300,110,'8',COL.tienda.base),
 reparto2:()=>pokeball(126,270,130)+pokeball(386,270,130)+pokeball(256,270,140)+`<circle cx="256" cy="166" r="35" fill="#1B1B22"/>`+txt(256,186,52,'3',COL.oro.base),
 reunion_cumple:()=>cajaRegalo(210,280,230,COL.rosa)+cajaRegalo(340,350,150,COL.exp),
 rivalidad:()=>puno(150,256,130,COL.ataque,90)+puno(362,256,130,COL.ataque,-90)+estallido(256,256,100,{base:T.ataque.acento,sombra:'#E0901C',luz:'#fff'}),
 saqueo:()=>`<path d="${L.D.sacoCuerpo}" transform="translate(256 300) scale(2.67)" fill="none" stroke="${COL.negro.luz}" stroke-width="5"/><path d="${L.D.sacoCuello}" transform="translate(256 300) scale(2.67)" fill="none" stroke="${COL.negro.luz}" stroke-width="5"/>`+saco(256,300,320,COL.negro)+pokeball(256,150,96),
 sobrecarga_mental:()=>{ const c=COL.psiquico;
  return pieza('M0 -50C-10 -60 -40 -60 -50 -40C-66 -36 -70 -10 -60 4C-66 24 -50 44 -30 42C-20 54 -6 52 0 44Z',256,256,250,c,{cx:-200,luz:[-38,-30,10,6]})+pieza('M0 -50C10 -60 40 -60 50 -40C66 -36 70 -10 60 4C66 24 50 44 30 42C20 54 6 52 0 44Z',256,256,250,{base:c.sombra,sombra:c.sombra,luz:c.luz},{cx:-200})+
   lin('M214 216C236 228 236 252 214 264M298 216C276 228 276 252 298 264M256 182V328',c.luz,7,{op:.7})+moneda(100,110,32,{aro:false})+pokeball(412,110,64)+flechaArriba(412,400,72,COL.exp)+carta(100,400,52,72); },
 tirada_magica3:()=>dado(170,350,110,2,-12)+dado(290,370,110,4,8)+dado(230,250,110,5,-4)+lin('M330 210L410 110',COL.marron.base,14)+estrella(414,104,50),
 ultima_linea:()=>escudo(256,160,110,COL.blanco)+[[146,330],[256,330],[366,330]].map(([x,y])=>forma(RR(x-50,y-40,100,80,10),COL.defensa,{cx:x})).join('')+forma(RR(146,380,220,40,10),COL.defensa,{cx:256}),
 ultraball:()=>pokeball(256,256,280,{top:COL.negro})+`<clipPath id="ubh"><path d="M116 256A140 140 0 0 1 396 256Z"/></clipPath><g clip-path="url(#ubh)" fill="#F5C518"><rect x="150" y="100" width="40" height="160"/><rect x="322" y="100" width="40" height="160"/></g>`,
 unidos:()=>emblema(256,210,240,SIN.clase)+rayo(176,400,96,COL.velocidad)+yunque(330,400,130),
 victoria_arcana:()=>agujeros(estallido(256,256,280,COL.psiquico,8,.55),[E(256,256,36,36)])+[0,120,240].map(a=>{ const r=a*Math.PI/180; return estrella(256+Math.cos(r)*170,256+Math.sin(r)*170*.5-10,40,COL.oro); }).join(''),
 voluntad:()=>`<path d="${D.corazon}" transform="translate(256 240) scale(2.4)" fill="none" stroke="#E5484D" stroke-width="5"/><clipPath id="vol"><rect x="0" y="246" width="512" height="200"/></clipPath><g clip-path="url(#vol)">${corazon(256,240,280,COL.rojo)}</g>`+carta(350,350,70,100),
 safari:()=>{ const k={base:'#C9A86A',sombra:'#9C7E44',luz:'#F0DDB4'};
  return forma(E(256,310,160,40),k,{cx:256})+forma('M166 300C166 230 196 196 256 196C316 196 346 230 346 300Z',k,{cx:256,luz:[210,232,20,10]})+rel(RR(170,272,172,24,6),k.sombra)+hoja(320,250,80,COL.planta,30); },
};
