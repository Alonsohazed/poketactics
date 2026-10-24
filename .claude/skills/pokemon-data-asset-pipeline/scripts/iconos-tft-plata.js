// Iconos estilo TFT de los aumentos de Plata (sin los de héroe). Piezas en iconos-tft-lib.js.
const L=require('./iconos-tft-lib.js');
const {OSC,MED,CLA,E,RR,P,poli,est,rel,corte,hueco,anillo,txt,g,J,solo,cortes,pz,T,f,estela,aroDe,destellos,chevron,subir,bajar,barrido,mas,tacha,
 moneda,monedaPlana,pila,monedaCanto,pokeball,cubo,dado,regalo,saco,cofre,hucha,copa,corona,escudo,escudoHex,espada,garra,hueso,pluma,cuchara,gota,corazon,estrella,hoja,llama,rayo,luna,ojo,engranaje,cronometro,relojArena,calendario,carta,libro,matraz,yunque,martillo,iman,guante,mancuerna,diana,lupa,candado,maletin,nube,montana,bandera,flecha,velocimetro,ticket,emblemaHex,simboloTipo,pokeHueco,remolino,mano,fantasma,casilla,
 caramelo,huevo,carrito,antifaz,gorro,gema,ala,lista,escalera,rombo,lazo}=L;
// piezas propias de este grupo
const contorno=(d,tr,w=8)=>solo(`<path d="${d}" transform="${tr}" fill="none" stroke="${MED}" stroke-width="${w}" stroke-linejoin="round" opacity=".7"/>`);
const botiquin=(x,y,w)=>{ const k=w/300; return g(T(x,y,k),J(solo(`<path d="M-50 -90V-112C-50 -130 50 -130 50 -112V-90" fill="none" stroke="${MED}" stroke-width="22"/>`+pz(RR(-150,-92,300,200,24),0,RR(-134,-78,70,12,6))),cortes(hueco('M-22 -60H22V-16H66V28H22V72H-22V28H-66V-16H-22Z')))); };
const campana=(x,y,w)=>{ const k=w/300; return g(T(x,y,k),J(solo(pz('M-130 40C-130 -60 -70 -110 0 -110C70 -110 130 -60 130 40Z',0,E(-64,-60,26,12))+rel(E(0,-120,18,18),CLA)+pz(RR(-150,40,300,24,12),0)),cortes(''))); };
const etiqueta=(x,y,w,rot=0,dentro='')=>{ const k=w/300; return g(T(x,y,k,rot),J(solo(pz(P([[-150,-80],[90,-80],[150,0],[90,80],[-150,80]]),0,RR(-130,-64,80,10,5))),cortes(hueco(E(92,0,16,16))+dentro))); };
const mochila=(x,y,w)=>{ const k=w/280; return g(T(x,y,k),J(solo(`<path d="M-50 -130C-50 -170 50 -170 50 -130" fill="none" stroke="${MED}" stroke-width="20"/>`+pz(RR(-110,-130,220,270,34),0,E(-60,-80,22,30))+pz(RR(-110,-130,220,96,34),0)),cortes(corte('M-110 -34H110',8)+corte('M-70 0V110M70 0V110',10)))); };
const canon=(x,y,w)=>{ const k=w/300; return g(T(x,y,k),J(solo(`<g transform="rotate(-40)">${pz(RR(-40,-170,100,200,24),10,RR(-28,-156,14,120,7))}</g>`+pz(E(-10,60,64,64),-10)+pz(RR(-110,110,200,26,12),-10)),cortes(hueco(E(-10,60,20,20))+`<g transform="rotate(-40)">${corte('M-40 -100H60',8)}</g>`))); };
const caja=(x,y,w,{abierta=false}={})=>{ const k=w/300; return g(T(x,y,k),J(solo(pz(RR(-120,-20,240,150,14),0,RR(-104,-6,60,10,5))+(abierta?`<g transform="rotate(-24 -120 -20)">${pz(RR(-130,-56,260,40,10),0)}</g>`:pz(RR(-130,-56,260,40,10),0))),cortes(''))); };
const infinito=(x,y,w)=>{ const k=w/320; return g(T(x,y,k),J(solo(`<path d="M0 0C-50 -70 -150 -70 -150 0C-150 70 -50 70 0 0C50 -70 150 -70 150 0C150 70 50 70 0 0Z" fill="none" stroke="${MED}" stroke-width="44"/><path d="M0 0C50 -70 150 -70 150 0C150 70 50 70 0 0" fill="none" stroke="${OSC}" stroke-width="44" opacity=".45"/>`),cortes(''))); };
const varita=(x0,y0,x1,y1)=>J(solo(`<path d="M${x0} ${y0}L${x1} ${y1}" stroke="${MED}" stroke-width="16" stroke-linecap="round"/>`),estrella(x1,y1,30));
const zigzag=()=>solo(`<path d="M110 400L210 300L270 340L380 196" fill="none" stroke="${MED}" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>`+rel(P([[400,160],[414,250],[338,214]]),CLA));

module.exports={
 uno_dos_cinco:()=>J(solo(pz(E(120,226,62,62),120,E(100,204,16,8))),moneda(256,226,62),pokeball(392,226,124),solo([[120,1],[256,2],[392,5]].map(([x,n])=>Array.from({length:n},(_,i)=>`<circle cx="${f(x+(i-(n-1)/2)*24)}" cy="340" r="9" fill="${CLA}"/>`).join('')).join('')),estela(256,400,200,44,24)),
 abrazo_grupo:()=>{ const r=118, pos=[[0,0],...Array.from({length:6},(_,i)=>{ const a=Math.PI/6+i*Math.PI/3; return [Math.cos(a)*r,Math.sin(a)*r]; })];
  return J(solo(pos.slice(1).map(([a,b])=>`<path d="M256 256L${f(256+a*.62)} ${f(256+b*.62)}" stroke="${CLA}" stroke-width="10"/>`).join('')),...pos.map(([a,b],i)=>casilla(256+a,256+b,104,i?MED:CLA)),cortes(hueco(`M240 236H272V260C272 274 264 282 256 286C248 282 240 274 240 260Z`))); },
 abrir_camino:()=>J(contorno('M-30 130C-76 26 -50 -76 36 -140C0 -50 -6 38 36 130Z','translate(330 256) rotate(20)'),contorno('M-30 130C-76 26 -50 -76 36 -140C0 -50 -6 38 36 130Z','translate(400 256) rotate(20)'),garra(220,256,280,20),destellos([110,120,18])),
 activos_hierro:()=>J(estela(240,430,170,40,24),yunque(240,340,320),moneda(336,236,40,{simb:''}),destellos([110,170,16])),
 ahorro_profesor:()=>J(estela(250,430,170,40,24),hucha(250,310,290),solo(`<circle cx="214" cy="110" r="17" fill="${MED}"/><circle cx="256" cy="110" r="17" fill="${MED}"/><circle cx="298" cy="110" r="14" fill="none" stroke="${MED}" stroke-width="7"/>`)),
 aliado_cuidador:()=>J(pokeball(186,330,170),pokeball(350,172,130),solo(`<path d="M262 260L300 222" stroke="${CLA}" stroke-width="14" stroke-linecap="round"/>`+rel(P([[318,204],[278,214],[308,244]]),CLA)),destellos([430,330,18])),
 armadura_improvisada:()=>J(escudo(236,250,300),solo(rel(E(388,390,48,48),MED)),cortes(anillo(388,390,30,9)+corte('M368 410L408 370',9)),destellos([96,120,18])),
 arranque:()=>J(estela(256,430,170,42,26),pokeball(256,300,240),estrella(206,116,36),estrella(306,116,36)),
 banco_pandora:()=>J(solo([76,196].map(x=>pz(RR(x,250,100,100,16),x+50)).join('')+pz(RR(316,250,100,100,16),366)),cortes(txt(366,330,80,'?')),barrido(366,170,64,200,340,14,CLA),barrido(366,170,64,20,160,14,CLA)),
 bolsa_objetos:()=>J(estela(256,430,170,42,26),escudoHex(256,140,90),saco(256,300,320)),
 bolsita:()=>J(estela(256,430,150,38,24),solo(rel(E(226,172,28,28),MED)+rel(E(286,166,28,28),CLA)),saco(256,300,270)),
 brote:()=>J(solo(`<path d="M256 186V120" stroke="${MED}" stroke-width="14" stroke-linecap="round"/>`),hoja(224,112,70,-60),hoja(288,112,70,60),emblemaHex(256,286,230,simboloTipo('planta',256,286,34))),
 brote2:()=>J(solo(`<path d="M230 170V108" stroke="${MED}" stroke-width="12" stroke-linecap="round"/>`),hoja(202,100,60,-60),hoja(258,100,60,60),emblemaHex(230,264,200,simboloTipo('planta',230,264,30)),iman(390,390,110,15)),
 bufe_componentes:()=>J(campana(256,230,300),solo(rel(E(196,370,26,26),MED)+rel(E(256,370,26,26),CLA)+rel(E(316,370,26,26),OSC)),destellos([420,110,18])),
 canon_cristal:()=>J(canon(220,300,300),gema(400,130,90),destellos([110,140,16])),
 nocturnos:()=>J(luna(230,230,240),espada(266,276,300,35),destellos([420,110,18],[400,330,12])),
 vanguardia:()=>J(estela(256,430,160,38,24),escudo(256,250,300),emblemaHex(256,230,100,'')),
 combustion:()=>J(llama(240,256,320),solo([[370,180,12],[392,128,9],[350,96,7]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${CLA}"/>`).join(''))),
 con_suerte:()=>J(estela(256,430,160,38,24),moneda(256,256,124,{simb:''}),cortes([[-1,-1],[1,-1],[-1,1],[1,1]].map(([a,b])=>hueco(E(256+a*24,248+b*24,24,24))).join('')+corte('M256 248L272 310',8)),destellos([420,110,22])),
 corriente:()=>J(solo(pz('M100 330C100 210 180 130 290 136C370 140 410 200 380 250C360 284 320 280 310 252C340 252 350 222 330 200C300 172 230 190 210 252C196 296 214 330 260 330Z',300,E(160,250,14,30))),gota(390,350,110),estela(256,430,180,38,22)),
 corrosion:()=>J(escudoHex(256,230,250),cortes(hueco(E(206,200,20,20))+hueco(E(300,226,20,20))+hueco(E(240,282,20,20))),...[196,256,316].map((x,i)=>gota(x,400-(i%2)*14,60))),
 crecimiento:()=>J(espada(256,262,240,45),flecha(256,256,330),destellos([420,120,18])),
 crianza:()=>J(estela(256,430,160,38,24),huevo(256,250,290,{manchas:true}),corazon(160,380,90)),
 cuchara_plata:()=>J(estela(240,410,180,46,26),cuchara(256,256,330,32),solo(`<g transform="rotate(32 256 256)">${rel(E(256,176,34,34),CLA)}${rel(P([[222,176],[192,156],[192,196]]),MED)}${rel(P([[290,176],[320,156],[320,196]]),MED)}</g>`),subir(410,140,34,16),destellos([110,140,22])),
 dados:()=>J(estela(240,430,170,40,24),dado(230,270,130),moneda(400,340,44,{simb:''}),destellos([420,110,20])),
 centro:()=>J(casilla(66,270,84,OSC),casilla(150,270,84,OSC),casilla(362,270,84,OSC),casilla(446,270,84,OSC),solo(pz(P(poli(256,270,6,80,Math.PI/6)),256)),cortes(hueco(est(256,270,40,5,.45))),destellos([256,120,22])),
 prodigio:()=>J(etiqueta(256,256,330,-14,txt(-20,32,96,'−1')),destellos([420,110,18])),
 entreno_combate:()=>J(estela(256,430,160,38,24),mancuerna(256,300,330),subir(256,130,34,16)),
 entreno_diario:()=>J(calendario(256,276,250,270,cortes([[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]].map(([a,b],i)=>`<rect x="${171+a*62}" y="${250+b*66}" width="50" height="50" rx="8" fill="${i<3?'#000':'none'}" stroke="#000" stroke-width="7"/>`).join('')))),
 extremo:()=>J(mancuerna(256,250,360),moneda(400,400,40,{simb:'−'}),destellos([110,130,18])),
 especialista_tardio:()=>J(pila(200,400,4,1.6,26),solo(rel(E(380,180,72,72),MED)),cortes(txt(380,214,96,'9')+anillo(380,180,56,7)),destellos([110,120,18])),
 revancha:()=>J(g('rotate(-45 256 256)',J(solo(pz(P([[238,96],[274,96],[274,200],[238,200]]),256)+pz(P([[238,218],[274,218],[274,300],[238,300]]),256)+rel(RR(194,296,124,22,10),CLA)+rel(RR(244,318,24,56,8),MED)),cortes(''))),espada(256,256,360,45),destellos([420,420,16])),
 fondo_emergencia:()=>J(estela(256,430,170,40,24),botiquin(250,270,300),moneda(400,400,36,{simb:''})),
 formar_equipo:()=>J(solo(pz(RR(116,116,170,170,28),201)+pz(RR(226,226,170,170,28),311,RR(240,240,60,10,5))),cortes(`<rect x="226" y="226" width="170" height="170" rx="28" fill="none" stroke="#000" stroke-width="12"/>`+hueco('M298 270H324V298H352V324H324V352H298V324H270V298H298Z')),destellos([420,110,18])),
 fotosintesis:()=>J(hoja(236,286,320,20),solo(rel(E(392,120,38,38),CLA)+Array.from({length:8},(_,i)=>{ const a=i*Math.PI/4; return `<path d="M${f(392+Math.cos(a)*52)} ${f(120+Math.sin(a)*52)}L${f(392+Math.cos(a)*70)} ${f(120+Math.sin(a)*70)}" stroke="${MED}" stroke-width="9" stroke-linecap="round"/>`; }).join(''))),
 fuego_concentrado:()=>J(solo(`<path d="M206 250L300 380L346 370Z" fill="${MED}" opacity=".5"/>`),llama(330,370,110,{nucleo:false}),lupa(196,190,250)),
 golpe_anunciado:()=>J(zigzag(),moneda(110,400,36,{simb:''}),destellos([110,140,18])),
 guardianes_gemelos:()=>J(estela(256,430,180,40,24),escudo(166,250,240,{dentro:txt(0,36,90,'2')}),escudo(346,250,240,{dentro:txt(0,36,90,'2')})),
 hebillas_extra:()=>J(solo(`<g opacity=".4">${hueso(176,166,200,-25)[0]}${hueso(336,166,200,25)[0]}</g>`),hueso(256,340,290),estela(256,430,160,36,22)),
 huevo:()=>J(estela(256,430,170,42,26),huevo(256,256,310,{manchas:true,grieta:true}),destellos([420,120,24])),
 impulso:()=>J(velocimetro(256,330,360,-45),destellos([420,120,20],[110,130,14])),
 investigacion_campo:()=>J(carta(216,236,170,236),lupa(330,330,220,0),destellos([420,110,18])),
 lagrimas:()=>J(contorno('M0 -120C46 -60 84 -10 84 40C84 92 46 122 0 122C-46 122 -84 92 -84 40C-84 -10 -46 -60 0 -120Z','translate(350 210) scale(.6)'),contorno('M0 -120C46 -60 84 -10 84 40C84 92 46 122 0 122C-46 122 -84 92 -84 40C-84 -10 -46 -60 0 -120Z','translate(410 300) scale(.5)'),gota(226,270,320),estela(226,440,140,32,20)),
 lecciones_boxeo:()=>J(estela(256,430,160,38,24),guante(256,250,320,-6),cortes(hueco('M236 228C206 206 210 178 228 178C238 178 244 186 244 194C244 186 250 178 260 178C278 178 282 206 252 228Z'))),
 matarreyes:()=>J(corona(256,300,330),espada(256,256,380,40),destellos([110,120,18])),
 emb_elemental:()=>J(estela(256,440,150,36,22),mochila(256,280,300),emblemaHex(256,200,96,'')),
 pandora:()=>J(caja(256,330,300,{abierta:true}),solo(rel(E(210,186,28,28),CLA)+rel(P([[290,120],[322,176],[258,176]]),MED)+rel(P([[356,196],[382,226],[356,256],[330,226]]),CLA)),destellos([420,110,18])),
 orbes_curativos:()=>J(solo(pz(E(256,230,110,110),256,E(220,196,28,14))),mas(256,230,100,34,CLA),gota(220,400,56),gota(292,420,48)),
 pacto_cruel:()=>J(corazon(236,262,300),cortes(hueco(E(370,232,48,48))),subir(420,110,26,12)),
 arcos_reserva:()=>J(contorno('M0 -140C54 -70 54 70 0 124C-54 70 -54 -70 0 -140Z','translate(340 250) rotate(25)'),contorno('M0 -140C54 -70 54 70 0 124C-54 70 -54 -70 0 -140Z','translate(410 250) rotate(25)'),pluma(230,256,330,25)),
 poder_aumentado:()=>J(rombo(236,380,110,OSC),rombo(236,258,110,MED),rombo(236,136,110,CLA),flecha(390,256,160),destellos([110,140,18])),
 reencuentros:()=>J(...[0,1,2,3,4].map(i=>{ const a=Math.PI+i*Math.PI/4; return pokeball(256+Math.cos(a)*150,330+Math.sin(a)*150,108); })),
 reparto:()=>J(estela(256,400,200,46,26),pokeball(130,300,130),pokeball(382,300,130),pokeball(256,290,150),solo(rel(E(256,160,40,40),CLA)),cortes(txt(256,182,60,'2'))),
 reserva_balls:()=>J(...[[166,380],[256,380],[346,380],[211,302],[301,302],[256,224]].map(([x,y])=>pokeball(x,y,92)),destellos([400,170,18])),
 sobrecarga:()=>J(solo(pz('M268 70L150 250H232L130 390L196 380L170 440L330 230H250L340 70Z',250)),solo([[130,420],[256,440],[380,420]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="16" fill="${CLA}"/>`).join(''))),
 solo_leveling:()=>{ const [a,b]=aroDe(256,330,170,50,20,0); return J(a,espada(256,240,380),b,destellos([420,110,22],[96,150,16])); },
 ticket_dorado:()=>J(estela(256,410,170,36,22),ticket(256,262,320,-16,corte('M44 -40A42 42 0 1 1 6 42',16)+hueco(P([[40,-66],[74,-36],[30,-22]]))),destellos([410,120,26],[120,400,18])),
 tiendas_sin_fin:()=>J(infinito(256,256,360),carta(160,256,52,74),destellos([420,130,18])),
 tirada_magica:()=>J(estela(240,430,160,38,24),dado(230,290,140),varita(330,200,420,100)),
 unidos_sinergia:()=>J(solo([[256,126],[256,386],[126,256],[386,256]].map(([x,y])=>`<path d="M256 256L${x} ${y}" stroke="${MED}" stroke-width="12"/>`).join('')),...[[256,126],[256,386],[126,256],[386,256]].map(([x,y])=>emblemaHex(x,y,100,'')),solo(rel(E(256,256,38,38),CLA))),
 uno_dos_tres:()=>J(...[[146,1],[256,2],[366,3]].flatMap(([x,n])=>Array.from({length:n},(_,i)=>pokeball(x,392-i*100,98)))),
 verticalidad:()=>J(solo(pz(RR(241,110,30,300,12),256)),emblemaHex(236,170,140,simboloTipo('estrella',236,170,22)),emblemaHex(236,340,140,simboloTipo('estrella',236,340,22)),flecha(390,256,150)),
};
