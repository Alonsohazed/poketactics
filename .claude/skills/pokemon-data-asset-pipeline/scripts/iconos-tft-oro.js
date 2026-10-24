// Iconos estilo TFT de los aumentos de Oro (sin los de héroe). Piezas en iconos-tft-lib.js.
const L=require('./iconos-tft-lib.js');
const {OSC,MED,CLA,E,RR,P,poli,est,rel,corte,hueco,anillo,txt,g,J,solo,cortes,pz,T,f,estela,aroDe,destellos,chevron,subir,bajar,barrido,mas,tacha,
 moneda,monedaPlana,pila,monedaCanto,pokeball,cubo,dado,regalo,saco,cofre,hucha,copa,corona,escudo,escudoHex,espada,garra,hueso,pluma,cuchara,gota,corazon,estrella,hoja,llama,rayo,luna,ojo,engranaje,cronometro,relojArena,calendario,carta,libro,matraz,yunque,martillo,iman,guante,mancuerna,diana,lupa,candado,maletin,nube,montana,bandera,flecha,velocimetro,ticket,emblemaHex,simboloTipo,pokeHueco,remolino,mano,fantasma,casilla,
 caramelo,huevo,carrito,antifaz,gorro,gema,ala,lista,escalera,rombo,lazo}=L;
// piezas propias de este grupo
const lingote=(x,y,w,rot=0)=>{ const k=w/300; return g(T(x,y,k,rot),J(solo(pz(P([[-120,-36],[120,-36],[148,40],[-148,40]]),0,RR(-100,-20,80,8,4))+rel(P([[-120,-36],[120,-36],[100,-62],[-100,-62]]),CLA)),cortes(corte('M-120 -36H120',6)))); };
const duplicar=(x,y,s)=>cortes(`<rect x="${f(x-s*.5)}" y="${f(y-s*.5)}" width="${f(s*.62)}" height="${f(s*.62)}" rx="${f(s*.1)}" fill="none" stroke="#000" stroke-width="${f(s*.1)}"/><rect x="${f(x-s*.12)}" y="${f(y-s*.12)}" width="${f(s*.62)}" height="${f(s*.62)}" rx="${f(s*.1)}" fill="#000"/>`);
const mira=(x,y,d)=>J(solo(rel(`${E(x,y,d/2,d/2)} ${E(x,y,d/2-22,d/2-22)}`,MED,' fill-rule="evenodd"')+rel(`M${x} ${y-d/2}A${d/2} ${d/2} 0 0 1 ${x} ${y+d/2}V${y+d/2-22}A${d/2-22} ${d/2-22} 0 0 0 ${x} ${y-d/2+22}Z`,OSC,' opacity=".55"')+`<path d="M${x} ${y-d/2-18}V${y-30}M${x} ${y+30}V${y+d/2+18}M${x-d/2-18} ${y}H${x-30}M${x+30} ${y}H${x+d/2+18}" stroke="${CLA}" stroke-width="14" stroke-linecap="round"/>`+rel(E(x,y,16,16),CLA)),cortes(''));
const cuerno=(x,y,w)=>{ const k=w/300; return g(T(x,y,k),J(solo(pz('M-140 30C-150 20 -150 4 -140 -2L60 -70C80 -76 96 -50 96 0C96 50 80 76 60 70Z',-20,E(-60,-18,30,8))+pz(RR(92,-26,44,52,10),114)),cortes(corte('M30 -60V60',8)))); };
const ondas=(x,y,n=3)=>solo(Array.from({length:n},(_,i)=>`<path d="M${x+i*26} ${y-60-i*10}Q${x+30+i*30} ${y} ${x+i*26} ${y+60+i*10}" fill="none" stroke="${CLA}" stroke-width="12" stroke-linecap="round" opacity="${1-i*.25}"/>`).join(''));
const puno=(x,y,w,rot=0)=>{ const k=w/200; return g(T(x,y,k,rot),J(solo(pz(RR(-90,-50,180,130,26),0,E(-50,-30,22,8))+[-66,-22,22,66].map(a=>rel(E(a,-50,24,24),a>0?OSC:MED)).join('')),cortes(corte('M-90 20H40',10)+corte('M-44 -44V-10M0 -44V-10M44 -44V-10',8)))); };
const zapatilla=(x,y,w)=>{ const k=w/300; return g(T(x,y,k),J(solo(pz('M-100 -110H10V-6C46 4 104 18 124 52C132 70 120 86 96 86H-100Z',20,E(-70,-80,14,24))),cortes(corte('M-100 60H120',12)+corte('M-10 -6L-40 20M-10 26L-40 50',8)))); };
const cuenco=(x,y,w)=>J(solo(pz(`M${x-w/2} ${y}A${w/2} ${w/4} 0 0 0 ${x+w/2} ${y}Z`,x)),cortes(`<ellipse cx="${x}" cy="${y}" rx="${w/2}" ry="10" fill="#000"/>`));
const eslabon=(x,y,w,h)=>[`<rect x="${x-w/2}" y="${y-h/2}" width="${w}" height="${h}" rx="${h/2}" fill="none" stroke="${MED}" stroke-width="24"/>`,''];
const pizarra=(x,y,w,h,dentro='')=>J(solo(pz(RR(x-w/2,y-h/2,w,h,14),x,RR(x-w/2+14,y-h/2+14,60,10,5))),cortes(`<rect x="${x-w/2+20}" y="${y-h/2+20}" width="${w-40}" height="${h-40}" rx="8" fill="none" stroke="#000" stroke-width="8"/>`+dentro));
const gafas=(x,y,w)=>{ const k=w/320; return g(T(x,y,k),J(solo(rel(`${E(-80,0,68,68)} ${E(-80,0,48,48)}`,MED,' fill-rule="evenodd"')+rel(`${E(80,0,68,68)} ${E(80,0,48,48)}`,OSC,' fill-rule="evenodd"')+`<path d="M-14 -10Q0 -26 14 -10" fill="none" stroke="${MED}" stroke-width="16"/>`+rel(E(80,0,48,48),CLA,' opacity=".35"')),cortes(''))); };
const cerebro=(x,y,w)=>{ const k=w/300; return g(T(x,y,k),J(solo(pz('M0 -100C-20 -120 -80 -120 -100 -80C-132 -72 -140 -20 -120 8C-132 48 -100 88 -60 84C-40 108 -12 104 0 88Z',-400,E(-70,-60,20,10))+rel('M0 -100C20 -120 80 -120 100 -80C132 -72 140 -20 120 8C132 48 100 88 60 84C40 108 12 104 0 88Z',OSC)),cortes(corte('M0 -96V86M-60 -50C-30 -40 -30 -10 -60 0M60 -50C30 -40 30 -10 60 0M-80 30C-50 36 -40 56 -50 70M80 30C50 36 40 56 50 70',8)))); };
const cabeza=(x,y,h)=>{ const k=h/300; return g(T(x,y,k),J(solo(pz('M-10 -140C60 -140 116 -80 112 0C110 26 102 40 94 56L102 96H40V130H-60C-80 130 -96 114 -96 92V54C-124 22 -128 -26 -108 -70C-90 -108 -54 -140 -10 -140Z',10,E(-50,-90,24,14))),cortes(''))); };
const plano=(x,y,w,h,dentro='')=>J(solo(pz(RR(x-w/2,y-h/2,w,h,14),x,RR(x-w/2+12,y-h/2+12,70,10,5))),cortes([1,2].map(i=>`<path d="M${f(x-w/2+i*w/3)} ${y-h/2+16}V${y+h/2-16}M${x-w/2+16} ${f(y-h/2+i*h/3)}H${x+w/2-16}" stroke="#000" stroke-width="5"/>`).join('')+dentro));
const varita=(x0,y0,x1,y1)=>J(solo(`<path d="M${x0} ${y0}L${x1} ${y1}" stroke="${MED}" stroke-width="16" stroke-linecap="round"/>`),estrella(x1,y1,30));
const muro=(x,y,w)=>{ const k=w/300; return g(T(x,y,k),J(solo([[-150,-40,96],[-50,-40,96],[50,-40,100],[-150,10,146],[0,10,150]].map(([a,b,ww],i)=>pz(RR(a,b,ww-6,46,6),a+ww/2)).join('')),cortes(''))); };
const medalla=(x,y,d,dentro='')=>J(solo(rel(P([[x-60,y-d*.95],[x-20,y-d*.95],[x+16,y-d*.3],[x-24,y-d*.3]]),MED)+rel(P([[x+60,y-d*.95],[x+20,y-d*.95],[x-16,y-d*.3],[x+24,y-d*.3]]),OSC)),moneda(x,y,d/2,{simb:''}),cortes(dentro));
const estallido=(x,y,d,n=8)=>[pz(est(x,y,d/2,n,.55),x,E(x-d*.18,y-d*.2,d*.08,d*.05)),''];
const cinta=(x,y,w)=>{ const k=w/300; return g(T(x,y,k),J(solo(`<path d="M-140 10C-110 -60 70 -70 130 -20" fill="none" stroke="${MED}" stroke-width="54"/>`+`<path d="M130 -20L170 70M124 -10L144 90" stroke="${OSC}" stroke-width="26" stroke-linecap="round"/>`),cortes(corte('M-120 0C-90 -46 60 -54 110 -20',6)))); };
const equis=(x,y,s)=>solo(`<path d="M${x-s/2} ${y-s/2}L${x+s/2} ${y+s/2}M${x+s/2} ${y-s/2}L${x-s/2} ${y+s/2}" stroke="${CLA}" stroke-width="${s*.28}" stroke-linecap="round"/>`);
const ladrillo4=(x,y,s)=>J(...[[-1,-1],[1,-1],[-1,1],[1,1]].map(([a,b])=>solo(pz(RR(x+a*s*.55-s/2,y+b*s*.55-s/2,s,s,s*.16),x+a*s*.55))));

module.exports={
 oro21:()=>J(estela(256,440,160,36,22),pila(256,420,7,1.5,24),destellos([400,90,26],[110,150,16])),
 academia:()=>J(estela(256,430,170,40,24),libro(256,320,320),estrella(196,150,40),estrella(316,120,40),destellos([420,220,16])),
 acelerador:()=>J(barrido(256,262,200,150,250,16),engranaje(270,256,290),cortes(hueco(`M282 196L232 262H262L246 316L300 246H270Z`)),destellos([430,110,20])),
 acero_dorado:()=>J(estela(256,430,170,40,24),lingote(256,350,300),lingote(256,262,280,-12),cortes(hueco(est(216,358,22,5,.45))),destellos([420,140,22],[96,170,14])),
 aguante:()=>J(estela(256,430,160,38,24),corazon(256,250,300,{partido:true}),cortes(corte('M226 200H286M222 250H282M232 296H276',7)),destellos([420,120,22])),
 amuleto2:()=>J(estela(256,430,160,40,24),solo(`<path d="M206 170C200 60 312 60 306 170" fill="none" stroke="${MED}" stroke-width="20" stroke-linecap="round"/>`),moneda(256,290,130,{simb:'II'}),destellos([420,140,24])),
 apoyo:()=>J(solo(pz(E(256,210,86,86),256,E(222,176,26,12))),mas(256,210,80,28,CLA),solo(pz('M110 300C120 390 190 440 256 440C322 440 392 390 402 300C390 288 372 290 366 304C352 360 310 396 256 396C202 396 160 360 146 304C140 290 122 288 110 300Z',256,E(150,350,12,8))),cortes(corte('M150 326C176 376 216 398 256 400M362 326C336 376 296 398 256 400',6)),destellos([420,110,18],[96,130,14])),
 armadura_argumental:()=>J(estela(256,430,160,38,24),escudo(256,250,300),cortes(corte('M156 262H356',12)),subir(410,150,28,13)),
 ascension:()=>J(barrido(256,262,196,110,200,22),cronometro(270,270,130,{aguja:30}),subir(420,380,26,12),destellos([430,170,20])),
 relampago:()=>J(rayo(290,256,330),equis(130,190,56),equis(130,320,56),destellos([420,110,18])),
 baston_serafin:()=>J(solo(pz(RR(240,150,30,300,15),255)),luna(256,120,170,-20),gota(370,290,70),gota(400,380,56),destellos([110,180,18])),
 bolsa_heroica:()=>J(estela(256,430,170,40,24),saco(256,280,320),duplicar(260,320,80)),
 bolsa_heroica2:()=>J(estela(240,430,170,40,24),saco(240,280,300),duplicar(244,316,76),moneda(400,400,36,{simb:''})),
 bolsa_heroica3:()=>J(estela(240,430,170,40,24),saco(230,280,300),duplicar(234,316,76),pila(400,420,3,.85)),
 buscavidas:()=>J(espada(206,160,200,-40),espada(306,160,200,40),estela(256,440,150,34,22),moneda(256,300,112)),
 camino_campeon:()=>J(...[[130,410],[200,350],[270,290],[340,230]].map(([x,y])=>solo(pz(RR(x-46,y-24,92,48,12),x))),bandera(352,130,150),destellos([110,160,18])),
 invicto:()=>J(estela(256,430,160,38,24),copa(256,300,280),llama(196,118,74,{nucleo:false}),llama(256,96,90,{nucleo:false}),llama(316,118,74,{nucleo:false})),
 concentracion:()=>J(ojo(256,220,330),solo(rel(RR(126,360,260,34,17),MED)),cortes(`<rect x="140" y="370" width="170" height="14" rx="7" fill="#000"/>`),destellos([420,110,18])),
 conoce_rival:()=>J(espada(256,256,360,45),espada(256,256,360,-45),escudoHex(256,250,90),destellos([110,110,18])),
 construccion_maxima:()=>J(carta(306,210,140,190,8),carta(266,236,140,190,0),carta(226,262,140,190,-8),duplicar(230,262,64),destellos([420,420,18])),
 companero:()=>J(estela(256,430,170,42,26),pokeball(256,300,240),estrella(176,120,34),estrella(256,96,38),estrella(336,120,34)),
 crecimiento_explosivo:()=>J(...[[150,170],[256,240],[362,300]].map(([x,h])=>flecha(x,430-h/2,h*1.05))),
 cuatro_veces:()=>J(ladrillo4(256,256,120),corazon(256,262,110),destellos([430,110,18])),
 diferente:()=>J(...[[110,400],[170,350],[230,300],[290,250]].map(([x,y])=>solo(rel(E(x,y,32,32),OSC))),solo(pz(E(380,150,72,72),380,E(354,122,20,10))),cortes(hueco(`M392 108L356 158H380L366 196L406 144H382Z`)),destellos([110,120,16])),
 doble_baja:()=>J(cinta(250,180,320),moneda(200,350,64),equis(320,330,46),equis(390,380,46)),
 dominio:()=>J(emblemaHex(256,220,220,simboloTipo('agua',256,220,34)),solo(rel(E(196,400,16,16),MED)+rel(E(256,400,16,16),CLA)+rel(E(316,400,16,16),OSC)),destellos([420,120,20])),
 duo_legendario:()=>J(estela(256,430,170,40,24),estrella(210,230,96),estrella(306,260,96),solo(rel(E(220,380,26,26),MED)+rel(E(292,380,26,26),MED))),
 eco_caos:()=>J(solo(`<circle cx="256" cy="256" r="190" fill="none" stroke="${MED}" stroke-width="8" opacity=".6"/><circle cx="256" cy="256" r="160" fill="none" stroke="${MED}" stroke-width="8"/>`),remolino(256,256,150),solo(rel(E(256,256,30,30),CLA))),
 regreso:()=>J(estela(256,440,160,36,22),hucha(256,320,280),barrido(256,190,130,190,350,22,CLA),solo(rel(P([[386,180],[402,224],[356,214]]),CLA))),
 guardaespaldas:()=>J(estela(256,430,160,38,24),escudo(256,250,300),cortes([0,1,2].map(i=>corte(`M210 ${300-i*44}L256 ${264-i*44}L302 ${300-i*44}`,12)).join(''))),
 epoca:()=>J(calendario(256,276,250,270,cortes(hueco(P([[256,240],[300,288],[274,288],[274,374],[238,374],[238,288],[212,288]]))))),
 cazadores:()=>J(mira(250,250,280),moneda(400,404,32,{simb:''}),destellos([96,110,18])),
 escalada_final:()=>J(montana(196,330,260,200),montana(312,300,300,260),estrella(312,140,42),destellos([110,140,16])),
 escalera:()=>J(escalera(250,330,5,330,250),emblemaHex(388,150,70,''),destellos([110,140,18])),
 especialista:()=>J(lupa(236,236,320,0,estrella(236,236,60)),destellos([420,110,20])),
 espectro:()=>J(solo(`<g opacity=".45">${fantasma(310,220,240)[0]}</g>`),fantasma(236,270,290),destellos([420,110,20])),
 inversion_vida:()=>J(estela(240,430,170,40,24),corazon(236,250,270),moneda(356,350,56)),
 estudio_paciente:()=>J(estela(256,430,150,36,22),libro(256,250,300,{abierto:false}),destellos([420,120,20])),
 evolucion_temprana:()=>J(pokeball(110,256,110),pokeball(220,256,110),solo(`<path d="M282 236H332M282 276H332" stroke="${CLA}" stroke-width="14" stroke-linecap="round"/>`),estrella(410,256,70)),
 favor_cuidador:()=>J(estela(240,430,170,40,24),yunque(240,340,320),subir(420,150,30,14)),
 forja_rapida:()=>J(martillo(256,256,330,40),moneda(130,390,34,{simb:''}),destellos([380,390,30],[420,320,14])),
 forja_rapida2:()=>J(martillo(256,256,330,40),moneda(120,370,30,{simb:''}),moneda(180,414,26,{simb:''}),subir(410,360,26,12)),
 forjador_cucharas:()=>J(cuchara(256,262,330,35),cuchara(256,262,330,-35),destellos([256,160,30])),
 formacion_kanto:()=>J(casilla(150,320,124),casilla(270,320,124),casilla(210,214,124),casilla(392,150,124),cortes(hueco(`M402 108L366 158H390L376 196L416 144H392Z`)+corte('M210 186V244M196 230H224',8)),destellos([110,140,16])),
 gracia_retador:()=>J(solo([0,1,2].map(i=>`<path d="M56 ${270+i*36}H120" stroke="${CLA}" stroke-width="10" stroke-linecap="round"/>`).join('')),ala(206,226,200,-1),zapatilla(296,270,280)),
 gran_bolsa:()=>J(estela(240,430,180,42,26),iman(392,170,120,20),solo(rel(E(300,150,30,30),CLA)),saco(236,300,330)),
 hambre_oro:()=>J(...[[156,300],[206,280],[256,272],[306,280],[356,300]].map(([x,y])=>moneda(x,y,36,{simb:''})),cuenco(256,316,360)),
 hambre_oro2:()=>J(moneda(226,110,30,{simb:''}),moneda(296,170,30,{simb:''}),...[[156,300],[206,280],[256,272],[306,280],[356,300]].map(([x,y])=>moneda(x,y,36,{simb:''})),cuenco(256,316,360)),
 cadena_evo:()=>J(eslabon(136,256,130,84),eslabon(256,256,130,84),eslabon(376,256,130,84),cortes(simboloTipo('fuego',136,256,18)+simboloTipo('agua',256,256,18)+simboloTipo('rayo',376,256,20)),solo(rel(E(136,256,22,22),CLA)+rel(E(256,256,22,22),CLA)+rel(E(376,256,22,22),CLA)),destellos([420,150,18])),
 emb_clase:()=>J(estela(256,430,160,38,24),escudo(256,250,300,{dentro:hueco(est(0,-6,56,5,.45))}),destellos([420,120,20])),
 insignias:()=>J(solo(pz(P(poli(130,256,8,56,Math.PI/8)),130)+pz(P([[256,196],[306,256],[256,316],[206,256]]),256)),solo(`<path d="M382 196C402 226 420 248 420 270C420 296 402 316 382 316C362 316 344 296 344 270C344 248 362 226 382 196Z" fill="none" stroke="${MED}" stroke-width="12"/>`),cortes(hueco(E(130,256,18,18))+hueco(E(256,256,16,16))),destellos([256,120,18])),
 depredadores:()=>J(...[0,1,2].map(i=>garra(190+i*66,250,280,30)),gota(410,390,70)),
 intercambio_eq:()=>J(barrido(256,256,160,200,340,24,CLA),barrido(256,256,160,20,160,24,CLA),pokeball(256,256,120),estrella(390,120,36)),
 investigacion_fin:()=>J(matraz(256,300,320),cortes([[-26,48],[18,52],[-6,22],[34,24],[-40,24]].map(([a,b])=>anillo(256+a,300+b,12,5)).join('')),destellos([300,110,16])),
 legion_tres:()=>J(escudo(160,262,180),escudo(352,262,180),escudo(256,250,220,{dentro:txt(0,34,96,'3')})),
 llamada_clan:()=>J(cuerno(220,256,300),ondas(368,256,3),destellos([110,150,18])),
 loto:()=>J(...[-36,0,36].map(a=>g(`rotate(${a} 256 390)`,solo(pz('M256 390C214 330 214 220 256 176C298 220 298 330 256 390Z',256,E(244,250,6,22))))),solo(rel(est(256,330,40,6,.45),CLA)),destellos([420,120,20])),
 medalla2:()=>J(medalla(256,290,220,mas(0,0,0,0)[1]+txt(256,320,90,'+1')),destellos([420,140,20])),
 mente_abarrotada:()=>J(cabeza(256,256,320),cortes(pokeHueco(220,210,16)+pokeHueco(266,196,16)+pokeHueco(240,250,16)+pokeHueco(290,244,16)+pokeHueco(222,292,16)),destellos([420,110,18])),
 monetizacion:()=>J(diana(256,170,190),...[[180,330],[256,380],[332,330]].map(([x,y])=>J(solo(`<path d="M${x} ${y-52}V${y-36}" stroke="${CLA}" stroke-width="6" stroke-linecap="round"/>`),moneda(x,y,28,{simb:''})))),
 no_scout:()=>J(estela(236,430,150,36,22),candado(236,280,310),subir(410,220,30,14)),
 orbes_curativos2:()=>J(solo(pz(E(190,220,74,74),190,E(166,196,20,10))+pz(E(330,300,74,74),330,E(306,276,20,10))+pz(E(160,380,44,44),160)),mas(190,220,64,22,CLA),mas(330,300,64,22,CLA),mas(160,380,38,13,CLA),gota(410,160,40),gota(430,220,34)),
 paciencia_evo:()=>J(relojArena(256,256,300),cortes(hueco(est(256,338,26,5,.45))),destellos([420,110,20])),
 pacto_rocket:()=>J(escudo(256,256,300,{dentro:txt(0,46,130,'R')}),moneda(400,400,34,{simb:''}),destellos([96,120,18])),
 plano_retaguardia:()=>J(plano(256,256,300,230,anillo(196,212,18,6)+corte('M290 232L330 196M314 196H330V212',7)),destellos([420,110,18])),
 poder_prohibido:()=>J(solo(pz(P([[256,96],[336,256],[256,416],[176,256]]),256,E(234,190,10,30))),cortes(corte('M244 170L268 222L246 256L276 312L260 352',9)),destellos([420,110,20])),
 favorito:()=>J(estela(240,430,160,38,24),corazon(240,262,280),cortes(hueco(est(240,250,46,5,.45))),subir(420,140,28,13)),
 prestamo:()=>J(estela(230,430,150,34,22),moneda(230,270,118),bajar(410,250,30,14)),
 prestamo2:()=>J(pila(220,380,4,1.6,26),bajar(410,250,30,14)),
 primeras_lecciones:()=>J(pizarra(256,256,320,230,txt(236,290,90,'+1')),subir(380,214,22,10),destellos([420,110,16])),
 profesor_pokemon:()=>J(gafas(256,256,330),estrella(336,256,40),destellos([420,120,18])),
 racha_dorada:()=>J(llama(256,230,320),solo([196,236,276,316].map(x=>rel(RR(x-9,400,18,50,9),MED)).join(''))),
 raices:()=>J(solo([[-1,40,70],[0,0,96],[1,40,70],[-1,90,40],[1,90,40]].map(([s,dx,l],i)=>`<path d="M256 300C${256+s*dx*.4} ${330+i*4} ${256+s*dx} ${340+l*.4} ${256+s*(dx+20)} ${320+l}" fill="none" stroke="${MED}" stroke-width="${i<3?16:10}" stroke-linecap="round"/>`).join('')),emblemaHex(256,200,220,simboloTipo('planta',256,200,34))),
 raices2:()=>J(solo([[-1,30,50],[0,0,70],[1,30,50]].map(([s,dx,l])=>`<path d="M256 370C${256+s*dx*.4} 390 ${256+s*dx} 400 ${256+s*(dx+16)} ${380+l}" fill="none" stroke="${MED}" stroke-width="12" stroke-linecap="round"/>`).join('')),emblemaHex(256,300,160,simboloTipo('planta',256,300,26)),emblemaHex(256,150,160,simboloTipo('planta',256,150,26)),moneda(400,410,30,{simb:''})),
 regalo_cumple:()=>J(estela(250,410,190,52,30),regalo(250,300,280),cortes(hueco(est(216,360,22,5,.45))+hueco(est(286,360,22,5,.45))),subir(412,110,34,16),destellos([96,184,26],[130,120,14])),
 remontada_epica:()=>J(solo(rel(`${E(256,256,190,190)} ${E(256,256,168,168)}`,MED,' fill-rule="evenodd"')),cortes(corte('M400 110L440 76',26)),carta(256,256,180,250,0,txt(256,296,110,'8'))),
 reparto2:()=>J(estela(256,400,200,46,26),pokeball(130,300,130),pokeball(382,300,130),pokeball(256,290,150),solo(rel(E(256,160,40,40),CLA)),cortes(txt(256,182,60,'3'))),
 reunion_cumple:()=>J(estela(256,430,180,40,24),regalo(216,270,250),regalo(356,340,160),destellos([420,110,18])),
 rivalidad:()=>J(puno(146,256,170,90),puno(366,256,170,-90),estallido(256,256,110),destellos([256,110,18])),
 saqueo:()=>J(estela(256,440,170,40,24),saco(256,300,330),pokeball(256,150,100)),
 sobrecarga_mental:()=>J(cerebro(256,262,280),moneda(100,110,32,{simb:''}),pokeball(412,110,64),flecha(412,400,90),carta(100,400,56,76)),
 tirada_magica3:()=>J(dado(170,350,90),dado(300,370,90),dado(236,244,90),varita(340,200,420,100)),
 ultima_linea:()=>J(muro(256,340,320),escudo(256,160,130),destellos([420,120,18])),
 ultraball:()=>J(estela(256,410,200,52,30),pokeball(256,256,280,{extra:corte('M176 126V214M336 126V214',30)}),destellos([430,110,22])),
 unidos:()=>J(emblemaHex(256,210,240,simboloTipo('escudo',256,210,36)),rayo(166,400,100),yunque(340,400,140)),
 victoria_arcana:()=>J(estallido(256,256,290),cortes(hueco(E(256,256,40,40))),...[0,120,240].map(a=>{ const r=a*Math.PI/180; return estrella(256+Math.cos(r)*176,256+Math.sin(r)*90-6,24); })),
 voluntad:()=>J(solo(`<path d="M256 356C116 262 128 152 198 152C232 152 256 174 256 198C256 174 280 152 314 152C384 152 396 262 256 356Z" fill="none" stroke="${MED}" stroke-width="14"/>`),solo(rel('M150 262H362C340 296 304 324 256 356C208 324 172 296 150 262Z',MED)),carta(372,370,72,100)),
 safari:()=>J(solo(pz(E(256,320,170,44),256)+pz('M160 310C160 236 192 200 256 200C320 200 352 236 352 310Z',256,E(214,236,22,10))),cortes(corte('M164 286H348',18)),hoja(330,262,90,30)),
};
