// Iconos 2D minimalistas de los aumentos de Plata (fichas de iconos-aumentos-ideas.js). Piezas en iconos-min-lib.js.
const L=require('./iconos-min-lib.js');
const {T,COL,SIN,f,E,RR,P,hexD,estrellaD,g,sc,lin,rel,forma,pieza,agujeros,prisma,destello,estrella,mas,cruz,D,corazon,orbe,gota,llama,hoja,rayo,luna,flechaArriba,escudo,torre,hexagono,chevron,flechaCirc,
 moneda,monedaPlana,pila,pokeball,emblema,dado,carta,saco,hucha,calendario,yunque,cuchara,garra,hueso,pluma,lupa,espada,corona,mancuerna,huevo,ola,guanteFrente,iman,mochila,velocimetro}=L;
const txt=(x,y,s,t,col='#FFFFFF')=>`<text x="${x}" y="${y}" font-family="Arial Black,Arial" font-weight="900" font-size="${s}" fill="${col}" text-anchor="middle">${t}</text>`;
const contorno=(d,tr,col,w=10)=>`<path d="${d}" transform="${tr}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round"/>`;
const peto='M-62 -60H62L66 0C66 40 36 62 0 72C-36 62 -66 40 -66 0Z';
const sprout=(x,y,k=1)=>sc(x,y,k,0,lin('M0 0V-60',COL.planta.sombra,12)+sc(-26,-58,1,-30,forma(E(0,0,26,14),COL.planta,{cx:200}))+sc(26,-58,1,30,forma(E(0,0,26,14),COL.planta)));
const peso=(x,y,s,c)=>mancuerna(x,y,s,c);
const trebol=(x,y,k=1)=>sc(x,y,k,0,[[-14,-14],[14,-14],[-14,14],[14,14]].map(([a,b])=>`<circle cx="${a}" cy="${b}" r="16" fill="${COL.verde.base}"/>`).join('')+lin('M0 0L10 34',COL.verde.sombra,6));

module.exports={
 uno_dos_cinco:()=>orbe(120,230,130,COL.objeto)+moneda(256,230,65)+pokeball(392,230,130)+[[120,1],[256,2],[392,5]].map(([x,n])=>Array.from({length:n},(_,i)=>`<circle cx="${f(x+(i-(n-1)/2)*24)}" cy="350" r="8" fill="#FFFFFF"/>`).join('')).join(''),
 abrazo_grupo:()=>{ const c=COL.defensa, r=116, pos=[[0,0],...Array.from({length:6},(_,i)=>{ const a=Math.PI/6+i*Math.PI/3; return [Math.cos(a)*r,Math.sin(a)*r]; })];
  return pos.slice(1).map(([a,b])=>lin(`M256 256L${f(256+a*.62)} ${f(256+b*.62)}`,'#FFFFFF',10)).join('')+pos.map(([a,b],i)=>hexagono(256+a,256+b,104,i?c:{base:c.luz,sombra:'#B4C8F2',luz:'#fff'})).join(''); },
 abrir_camino:()=>[120,60].map(dx=>contorno(L.D.garra,`translate(${200+dx} 256) rotate(20) scale(2.36)`,T.objeto.acento,4)).join('')+garra(200,256,260,20),
 activos_hierro:()=>yunque(240,320,340)+moneda(320,226,34,{aro:false}),
 ahorro_profesor:()=>hucha(250,300,270)+[220,256,292].map((x,i)=>i<2?`<circle cx="${x}" cy="110" r="15" fill="${COL.oro.base}"/>`:`<circle cx="${x}" cy="110" r="12" fill="none" stroke="${COL.oro.base}" stroke-width="6"/>`).join(''),
 aliado_cuidador:()=>pokeball(190,320,150)+pokeball(340,170,120)+flechaArriba(270,250,70,COL.exp,{rot:45}),
 armadura_improvisada:()=>sc(240,250,2.1,0,forma(peto,COL.defensa,{luz:[-34,-40,12,6]})+lin('M0 -58V68',COL.defensa.luz,4))+`<circle cx="380" cy="380" r="40" fill="#1B1B22"/><circle cx="380" cy="380" r="34" fill="none" stroke="#FFFFFF" stroke-width="10"/>`+lin('M356 404L404 356','#FFFFFF',10),
 arranque:()=>pokeball(256,300,240)+estrella(214,110,62,COL.plata)+estrella(298,110,62,COL.plata),
 banco_pandora:()=>{ const p=prisma(); return p.defs+forma(RR(76,250,100,100,16),COL.gris,{cx:126})+forma(RR(196,250,100,100,16),COL.gris,{cx:246})+rel(RR(316,250,100,100,16),`url(#${p.id})`)+flechaCirc(366,166,52,200,340,'#FFFFFF',12)+flechaCirc(366,166,52,20,160,'#FFFFFF',12); },
 bolsa_objetos:()=>hexagono(256,150,80,COL.objeto)+saco(256,300,300,COL.marron),
 bolsita:()=>orbe(230,180,56,COL.objeto,{cx:-200})+orbe(284,174,56,COL.gris,{cx:-200})+saco(256,290,260,COL.marron),
 brote:()=>sprout(256,190,1.4)+emblema(256,290,220,SIN.planta),
 brote2:()=>sprout(230,180,1.2)+emblema(230,270,200,SIN.planta)+iman(380,390,110),
 bufe_componentes:()=>forma('M126 290C126 200 186 150 256 150C326 150 386 200 386 290Z',COL.gris,{cx:256,luz:[190,200,20,10]})+orbe(256,140,30,COL.gris)+rel(RR(106,290,300,20,10),COL.gris.sombra)+[[196,COL.objeto],[256,COL.oro],[316,COL.gris]].map(([x,c])=>orbe(x,380,50,c)).join(''),
 canon_cristal:()=>[0,1,2].map(i=>lin(`M${300+i*14} ${196-i*22}L${336+i*14} ${176-i*22}`,COL.ataque.luz,6,{op:.6})).join('')+pieza(P([[0,-50],[30,0],[0,50],[-30,0]]),396,130,80,COL.ataque,{rot:55})+
  sc(214,300,1,50,forma(RR(-150,-46,230,92,24),COL.cristal,{cx:-35,luz:[-120,-30,30,8]})+lin('M-130 -14H60M-130 18H60','#FFFFFF',4,{op:.55}))+forma(E(200,360,64,64),COL.gris,{cx:200})+`<circle cx="200" cy="360" r="20" fill="${COL.gris.sombra}"/>`+rel(RR(110,416,190,22,11),COL.gris.sombra),
 nocturnos:()=>luna(230,230,220,COL.blanco)+espada(256,260,300,35,COL.ataque,COL.gris),
 vanguardia:()=>torre(256,262,290,COL.defensa)+hexagono(256,240,96,COL.oro),
 combustion:()=>llama(256,256,320)+[[370,180,12],[390,130,9],[350,96,7]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#FFE14A"/>`).join(''),
 con_suerte:()=>moneda(256,256,115)+trebol(256,248,1.6),
 corriente:()=>ola(250,250,300)+gota(380,330,100,{base:COL.agua.luz,sombra:'#A8CDF4',luz:'#fff'}),
 corrosion:()=>agujeros(hexagono(256,230,250,COL.gris),[E(206,200,20,20),E(296,220,20,20),E(240,280,20,20)])+[196,256,316].map((x,i)=>gota(x,400-(i%2)*14,56,COL.verde)).join(''),
 crecimiento:()=>espada(256,256,200,45,COL.ataque,COL.oro)+flechaArriba(256,256,320,COL.exp),
 crianza:()=>huevo(256,256,270,COL.crema)+corazon(180,380,70,COL.rosa),
 cuchara_plata:()=>sc(256,276,1.3,30,cuchara(0,0,330,0)+orbe(0,-77,60,COL.violeta,{cx:-200})+rel(P([[-30,-77],[-50,-92],[-50,-62]]),COL.violeta.base)+rel(P([[30,-77],[50,-92],[50,-62]]),COL.violeta.base)),
 dados:()=>dado(230,270,180,6)+moneda(390,330,40,{aro:false}),
 centro:()=>[[66],[150],[362],[446]].map(([x])=>hexagono(x,270,84,COL.gris)).join('')+hexagono(256,270,160,COL.defensa)+estrella(256,270,74,COL.blanco),
 prodigio:()=>sc(256,256,1,-15,agujeros(forma(P([[-150,-75],[90,-75],[150,0],[90,75],[-150,75]]),COL.exp,{luz:[-110,-50,24,8]}),[])+`<circle cx="96" cy="0" r="13" fill="#0b0a09"/>`+lin('M-110 0H-60','#FFFFFF',14)+txt(-6,28,80,'1')),
 entreno_combate:()=>peso(256,300,300,COL.ataque)+flechaArriba(256,140,80,COL.blanco),
 entreno_diario:()=>calendario(256,270,240,260,COL.exp,[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]].map(([a,b],i)=>rel(RR(171+a*62,250+b*66,50,50,8),'#E6E9EE')+(i<3?lin(`M${181+a*62} ${276+b*66}L${193+a*62} ${288+b*66}L${211+a*62} ${266+b*66}`,T.exp.acento,8):'')).join('')),
 extremo:()=>peso(256,250,330,COL.riesgo)+moneda(390,390,32,{aro:false})+lin('M376 390H404','#FFFFFF',8),
 especialista_tardio:()=>pila(220,380,4,1.7,26)+txt(400,240,110,'9',COL.exp.base),
 revancha:()=>sc(256,256,1,-45,forma(P([[-9,-140],[9,-140],[9,-30],[-9,-30]]),COL.gris)+forma(P([[-9,-14],[9,-14],[9,40],[-9,40]]),COL.gris)+forma(RR(-34,40,68,12,6),COL.gris)+forma(RR(-7,52,14,34,4),COL.marron))+espada(256,256,340,45,COL.ataque,COL.oro),
 fondo_emergencia:()=>lin('M216 150V128C216 116 296 116 296 128V150',COL.blanco.sombra,16)+forma(RR(136,150,240,200,24),COL.blanco,{cx:256,luz:[180,180,26,10]})+cruz(256,250,96,COL.vida.base)+moneda(380,380,32,{aro:false}),
 formar_equipo:()=>forma(RR(126,126,160,160,26),{base:COL.rojo.sombra,sombra:COL.rojo.sombra,luz:'#fff'})+rel(RR(226,226,160,160,26),COL.rojo.base)+rel(RR(236,236,140,140,20),'#FFFFFF')+mas(306,306,64,COL.rojo.base,16),
 fotosintesis:()=>hoja(240,280,320,COL.planta,20)+orbe(390,120,70,COL.amarillo,{cx:-200})+Array.from({length:8},(_,i)=>{ const a=i*Math.PI/4; return lin(`M${f(390+Math.cos(a)*46)} ${f(120+Math.sin(a)*46)}L${f(390+Math.cos(a)*62)} ${f(120+Math.sin(a)*62)}`,COL.amarillo.base,7); }).join(''),
 fuego_concentrado:()=>`<path d="M220 250L300 380L340 380Z" fill="#FFE4A0" opacity=".45"/>`+llama(320,380,100)+lupa(200,190,240,0,COL.gris),
 golpe_anunciado:()=>lin('M110 400L210 300L270 340L380 190',COL.oro.base,30)+rel(P([[400,160],[410,240],[340,200]]),COL.oro.base)+moneda(110,400,30,{aro:false}),
 guardianes_gemelos:()=>escudo(170,256,220,COL.defensa)+escudo(342,256,220,COL.defensa)+txt(170,276,56,'2')+txt(342,276,56,'2'),
 hebillas_extra:()=>`<g opacity=".35">${hueso(180,170,200,-25,COL.hueso)}${hueso(332,170,200,25,COL.hueso)}</g>`+hueso(256,340,280),
 huevo:()=>huevo(256,262,300,COL.crema)+[[220,300,22],[290,250,26],[240,200,16],[300,340,18]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${COL.verde.base}"/>`).join('')+lin('M226 140L246 160L232 176L262 192','#C9BC98',8),
 impulso:()=>velocimetro(256,330,340,-45),
 investigacion_campo:()=>carta(220,240,160,220)+lupa(330,330,190,0,COL.gris),
 lagrimas:()=>[[360,190],[400,270]].map(([x,y])=>contorno(L.D.gota,`translate(${x} ${y}) scale(1.2)`,T.objeto.acento,4)).join('')+gota(240,270,290,COL.objeto),
 lecciones_boxeo:()=>guanteFrente(256,262,320,COL.rojo,COL.blanco,COL.oro.base)+corazon(256,232,80,COL.vida),
 matarreyes:()=>corona(256,290,300,COL.oro)+espada(256,256,370,40,COL.plata,COL.gris),
 emb_elemental:()=>mochila(256,270,320,COL.marron)+hexagono(256,190,70,COL.oro),
 pandora:()=>{ const p=prisma(); return p.defs+forma(RR(146,280,220,150,14),COL.negro,{cx:256,luz:[176,300,20,6]})+sc(146,280,1,-30,forma(RR(0,-34,230,34,10),COL.negro))+
  `<circle cx="210" cy="190" r="26" fill="url(#${p.id})"/>`+rel(P([[290,120],[322,176],[258,176]]),`url(#${p.id})`)+rel(P([[350,200],[376,230],[350,260],[324,230]]),`url(#${p.id})`)+
  `<path d="${RR(146,280,220,150,14)}" fill="none" stroke="${COL.negro.luz}" stroke-width="5"/>`; },
 orbes_curativos:()=>orbe(256,230,220,COL.vida)+cruz(256,230,100,'#FFFFFF')+gota(220,400,50,COL.vida)+gota(290,420,44,COL.vida),
 pacto_cruel:()=>agujeros(corazon(240,262,290,COL.riesgo),[E(370,236,48,48)])+flechaArriba(380,220,90,COL.exp),
 arcos_reserva:()=>[[330,0],[390,0]].map(([x])=>contorno(L.D.pluma,`translate(${x} 250) rotate(25) scale(2.1)`,T.objeto.acento,3)).join('')+pluma(240,256,330,25),
 poder_aumentado:()=>{ const p=prisma(), rombo=P([[0,-50],[50,0],[0,50],[-50,0]]);
  return p.defs+pieza(rombo,236,380,100,COL.plata)+pieza(rombo,236,260,100,COL.oro)+sc(236,140,1,0,rel(rombo,`url(#${p.id})`))+flechaArriba(380,256,110,COL.blanco); },
 reencuentros:()=>[0,1,2,3,4].map(i=>{ const a=Math.PI+i*Math.PI/4; return pokeball(256+Math.cos(a)*150,330+Math.sin(a)*150,106); }).join(''),
 reparto:()=>pokeball(126,270,130)+pokeball(386,270,130)+pokeball(256,270,140)+`<circle cx="256" cy="166" r="35" fill="#1B1B22"/>`+txt(256,186,52,'2',COL.oro.base),
 reserva_balls:()=>[[166,380],[256,380],[346,380],[211,302],[301,302],[256,224]].map(([x,y])=>pokeball(x,y,92)).join(''),
 sobrecarga:()=>pieza('M18 -60L-26 0H0L-40 40H-14L-30 62L24 22H0L36 -14H10Z',236,256,300,COL.electrico)+[[150,420],[236,440],[330,420]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="15" fill="${T.objeto.acento}"/>`).join('')+lin('M200 360L150 420M236 380V440M270 360L330 420',COL.electrico.base,8),
 solo_leveling:()=>`<circle cx="256" cy="256" r="190" fill="none" stroke="${COL.ataque.luz}" stroke-width="10" opacity=".7"/>`+espada(256,256,380,0,COL.ataque,COL.oro),
 ticket_dorado:()=>sc(256,256,1,-12,agujeros(forma(RR(-140,-75,280,150,14),COL.oro,{luz:[-100,-50,24,8]}),[])+`<circle cx="-140" cy="0" r="22" fill="#0b0a09"/><circle cx="140" cy="0" r="22" fill="#0b0a09"/>`+lin('M-70 -75V75',COL.oro.sombra,4,{op:.6})+flechaCirc(30,0,36,-60,240,'#FFFFFF',10)),
 tiendas_sin_fin:()=>lin('M256 256C210 190 110 190 110 256C110 322 210 322 256 256C302 190 402 190 402 256C402 322 302 322 256 256Z',COL.tienda.base,40)+carta(160,256,46,64),
 tirada_magica:()=>dado(230,290,190,5)+lin('M330 200L410 110',COL.marron.base,16)+estrella(414,104,56),
 h_dusknoir:()=>`<circle cx="256" cy="256" r="196" fill="none" stroke="${COL.lila.base}" stroke-width="12" opacity=".8"/>`+
  `<path d="M126 400V230C126 150 186 96 256 96C326 96 386 150 386 230V400Z" fill="none" stroke="#6A6080" stroke-width="6"/>`+forma('M126 400V230C126 150 186 96 256 96C326 96 386 150 386 230V400Z',{base:'#3A3350',sombra:'#2A2440',luz:'#6A6080'},{cx:256,luz:[176,150,20,30]})+orbe(256,240,120,COL.rojo,{cx:-200})+`<circle cx="256" cy="240" r="22" fill="#1B1B22"/>`,
 unidos_sinergia:()=>[[256,126],[256,386],[126,256],[386,256]].map(([x,y])=>lin(`M256 256L${x} ${y}`,'#FFFFFF',10)).join('')+[[256,126],[256,386],[126,256],[386,256]].map(([x,y])=>hexagono(x,y,96,COL.oro)).join('')+orbe(256,256,76,COL.blanco),
 uno_dos_tres:()=>[[146,1],[256,2],[366,3]].map(([x,n])=>Array.from({length:n},(_,i)=>pokeball(x,392-i*100,98)).join('')).join(''),
 verticalidad:()=>forma(RR(241,120,30,280,12),COL.oro,{cx:256})+emblema(236,170,150,SIN.dragon)+emblema(236,340,150,SIN.dragon)+flechaArriba(380,256,90,COL.blanco),
};
