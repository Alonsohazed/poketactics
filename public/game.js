'use strict';
/* =====================================================================
   POKÉ TACTICS v4
   [DATA] [ABILITIES] [ITEMS] [CORE] [COMBAT] [BOTS] [AUGMENTS] [LOOT]
   [FLOW] [NET] [MUSIC] [UI]
   Multijugador: el servidor ejecuta toda la lógica (este mismo archivo) y envía
   el estado; los combates son deterministas (semilla compartida) y cada cliente los anima.
   ===================================================================== */
const HEADLESS = typeof document === 'undefined';
const SERVER = HEADLESS && typeof __SERVER__ !== 'undefined'; // dentro del servidor (vm por sala)
const rnd=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const R0=n=>Math.round(n);
// Sprites 2D de PokeAPI; las formas especiales del 3D ('y/150' es Mega Mewtwo Y) usan su sprite propio o el de su número
const SPRITE_ALT={'y/150':10044,'x/150':10043};
const SPRITE=d=>`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${SPRITE_ALT[d]||String(d).split('/').pop()}.png`;
const ITEM_SPRITE=n=>`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${n}.png`;
const TRAINER_SPRITE=k=>`https://play.pokemonshowdown.com/sprites/trainers/${k}.png`;
const weighted=arr=>{ const tot=arr.reduce((s,a)=>s+a[0],0); let r=Math.random()*tot; for(const a of arr){ r-=a[0]; if(r<0) return a[1]; } return arr[arr.length-1][1]; };
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return((t^t>>>14)>>>0)/4294967296; }; }
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* =============================== [DATA] =============================== */
const POOL_SIZE=[30,25,18,10,9];
const SHOP_ODDS={1:[100,0,0,0,0],2:[100,0,0,0,0],3:[75,25,0,0,0],4:[55,30,15,0,0],5:[45,33,20,2,0],6:[30,40,25,5,0],7:[16,30,43,10,1],8:[15,20,32,30,3],9:[10,17,25,33,15],10:[5,10,20,40,25]};
const XP_NEED={1:2,2:2,3:6,4:10,5:20,6:36,7:56,8:68,9:68};
const BASE_INCOME=[0,2,3,4], PASSIVE_XP=[0,2,2]; // 1-2: nivel 2; 1-3: nivel 3 (tres fichas); después +2 por ronda
const STAGE_DMG={1:1,2:2,3:4,4:6,5:9,6:11,7:15,8:18,9:22};
const COST_HEX=['#7d8593','#23964a','#2f6fde','#9446cf','#d99a00'];
const BENCH=9, MAX_ITEMS_BENCH=10, ITEMS_HARD=16;

const T=(icon,color,bp,scope,sum,lv)=>({icon,color,bp,scope,sum,lv});
const TRAITS={
 'Fuego':T('🔥','#ee6b2f',[2,4,6],'Afecta a tus Pokémon Fuego','Sus ataques queman y el fuego se propaga: cuando un enemigo muere quemado, la quemadura salta a otro.',['Quemadura del 2% de vida máx./s · se propaga al morir','Quemadura del 4%/s · se propaga','Quemadura del 7%/s, +20% de daño · al propagarse explota (150 de daño mágico alrededor)']),
 'Agua':T('💧','#3b8fe8',[2,4,6],'Afecta a tus Pokémon Agua; las oleadas, a TODO tu equipo','Cargan antes su habilidad y, cada 4 habilidades de tu equipo, una oleada cura a tus aliados y golpea a los enemigos.',['+3 de maná por ataque · oleada: cura 4% y 60 de daño','+6 de maná por ataque · oleada: cura 7% y 120 de daño','+10 de maná por ataque · oleada: cura 12% y 220 de daño']),
 'Planta':T('🌿','#4caf50',[2,4],'Afecta a tus Pokémon Planta','Se curan solos durante el combate.',['Regeneran 1.5% de vida máx. por segundo','Regeneran 3.5% de vida máx. por segundo']),
 'Eléctrico':T('⚡','#d9b400',[2,4],'Afecta a tus Pokémon Eléctrico','Sobrecarga: sus habilidades cargan al equipo y, al completar la carga, sale un rayo en cadena gratis.',['+20% de vel. de ataque · cada 3 habilidades eléctricas, rayo a 3 enemigos','+40% de vel. de ataque · cada 2 habilidades, rayo a 5 enemigos que aturde 0,5 s']),
 'Psíquico':T('🔮','#e0569b',[2,4,6],'Afecta a tus Pokémon Psíquico (y a todo tu equipo con 6)','Ciclos de maná: al lanzar su habilidad, regalan maná al aliado que más lo necesita.',['+15 de poder · regalan 10 de maná','+30 de poder · regalan 20 de maná','+60 de poder · regalan 35 de maná · Todo tu equipo: +15 de poder']),
 'Roca':T('🪨','#a08c5b',[2,3,4,5],'Afecta a tus Pokémon Roca (y a todo tu equipo desde 3)','Más defensa contra ataques físicos.',['Roca: +25 de defensa','Roca: +40 · Equipo: +5','Roca: +55 · Equipo: +10','Roca: +82 · Equipo: +19']),
 'Dragón':T('🐉','#6f5ce0',[2,3,4,5],'Afecta a tus Pokémon Dragón','Más vida y su daño crece cuanto más dura el combate.',['+150 de vida · +1,5% de daño por segundo (máx. +30%)','+225 de vida · +2% por segundo (máx. +40%)','+300 de vida · +2,5% por segundo (máx. +50%)','+420 de vida · +3,4% por segundo (máx. +68%)']),
 'Fantasma':T('👻','#7b62a3',[2,4,6],'Afecta a tus Pokémon Fantasma','Esquivan ataques físicos.',['Esquivan el 15%','Esquivan el 30%','Esquivan el 45%']),
 'Hada':T('🧚','#e27bb9',[2,4,6],'Afecta a TODO tu equipo','Todo tu equipo empieza el combate con escudo.',['Escudo de 100 (8s)','Escudo de 220 (8s)','Escudo de 400 (8s)']),
 'Normal':T('⭕','#9a987f',[2,4,6],'Afecta a tus Pokémon Normal','Más resistentes y algo más rápidos.',['+120 de vida y +8% de vel. de ataque','+300 de vida y +15%','+550 de vida y +25%']),
 'Acero':T('🔩','#8a9bb0',[2,4],'Afecta a tus Pokémon Acero','Fortaleza: reciben menos daño y absorben parte del que va a los aliados que tienen al lado.',['10% menos de daño · absorben el 25% del daño de los aliados adyacentes','20% menos de daño · absorben el 40%']),
 'Siniestro':T('🌑','#4b3f5c',[2,4],'Afecta a tus Pokémon Siniestro','Ejecuciones: rematan a los enemigos heridos y cada remate envalentona a todo tu equipo.',['Rematan por debajo del 12% de vida · cada remate: equipo +4% de daño (máx. 5)','Rematan por debajo del 20% · cada remate: equipo +8% de daño (máx. 5)']),
 'Lucha':T('🥋','#b5462f',[2,4],'Afecta a tus Pokémon Lucha','Se curan con el daño que hacen.',['12% de robo de vida','25% de robo de vida']),
 'Guardián':T('🛡️','#5d7a8c',[2,4,6,8],'Afecta a tus Guardianes','Aguantan en primera fila y, a los 1,5 s de combate, provocan a los enemigos cercanos y se cubren con un escudo.',['+20 de defensa y resistencia · escudo del 10% de su vida al provocar','+40 · escudo del 15%','+70 · escudo del 22%','+110 · escudo del 30%']),
 'Coloso':T('🦍','#c0392b',[2,3,4,5],'Afecta a TODO tu equipo (doble para Colosos)','Los pesos pesados: más vida para todo tu equipo; los Colosos reciben el doble.',['Equipo +100 de vida · Colosos +200','Equipo +160 · Colosos +320','Equipo +220 · Colosos +440','Equipo +320 · Colosos +640']),
 'Peleador':T('🥊','#e67e22',[2,4,6],'Afecta a tus Peleadores','Cuerpo a cuerpo ágiles con mucha vida: al bajar del 50% de vida entran en furia y atacan más rápido.',['+18% de vida máx. · furia: +20% de vel. de ataque','+35% de vida máx. · furia: +35%','+55% de vida máx. · furia: +55% y +10% de daño']),
 'Tirador':T('🎯','#d35400',[2,3,4,5],'Afecta a tus Tiradores','Hacen más daño cuanto más lejos está su objetivo (ataques y habilidades).',['+6% de daño por casilla de distancia','+8% por casilla','+10% por casilla','+13% por casilla']),
 'Hechicero':T('✨','#8e44ad',[2,4,6,8],'Afecta a TODO tu equipo (doble para Hechiceros)','Poder de habilidad para todos y, cada vez que un aliado lanza su habilidad, los Hechiceros aprenden y ganan más poder.',['Equipo +8 · Hechiceros +16 y +2 por cada habilidad aliada','Equipo +15 · Hechiceros +30 y +4 por habilidad','Equipo +25 · Hechiceros +50 y +7 por habilidad','Equipo +40 · Hechiceros +80 y +12 por habilidad']),
 'Asesino':T('🗡️','#34495e',[2,4,6],'Afecta a tus Asesinos','Ganan críticos y sus habilidades pueden ser críticas. Al bajar del 50% de vida se esfuman: los enemigos dejan de apuntarles unos segundos.',['+15% de prob. crítica y +10% de daño crítico · se esfuman 1,5 s','+30% y +20% · 2 s','+45% y +35% · 2,5 s']),
 'Sanador':T('💖','#16a085',[2,4,6],'Afecta a TODO tu equipo','Las curaciones y escudos de las habilidades de tu equipo son más fuertes, y todos ganan resistencia.',['+20% de curación y escudos · +10 de resistencia','+40% · +20 de resistencia','+70% · +35 de resistencia']),
 'Cazatesoros':T('💎','#e0a800',[2,3],'Afecta a tu economía','Consiguen botín al ganar combates, más con rachas de victorias. Toca la sinergia para ver todo lo que te han dado.',['Al ganar: 2 de oro (+1 por cada victoria seguida, máx. +3) · al perder: 1 de oro','Al ganar: un orbe de botín y oro de racha · al perder: 2 de oro']),
 'Legendario':T('👑','#c79400',[1],'Afecta a cada Legendario','Resonancia: cada Legendario se hace más fuerte con los niveles activos de sus OTRAS sinergias, contando solo a tus Pokémon no legendarios (vida, ataque y habilidad). Sin apoyo, se debilita.',['Sin sinergias activas −8% · 1 nivel +0% · 2 niveles +12% · 3 niveles +25% · 4 niveles +40% · 5 o más +50%']),
 'Depredadores':T('🩸','#e8572a',[2,4,6],'Afecta a tus Depredadores','Atacan más rápido y, al derrotar a su objetivo, saltan al siguiente con un acelerón y recuperan maná: una baja puede encadenar otra.',['+15% de vel. de ataque · al matar: acelerón +40% 2 s y 30% de maná','+30% · acelerón +60% 2,5 s y 50% de maná','+50% · acelerón +90% 3 s y reinicia su habilidad']),
 'Potencial Evolutivo':T('🌱','#5bbf6a',[2,4,6],'Afecta a tus Pokémon con Potencial Evolutivo','Crecen para siempre: al terminar cada ronda en el tablero ganan vida y ataque permanentes (el doble a 3★).',['+12 de vida, +1 de ataque y +1,5 de poder por ronda','+25 de vida, +2 de ataque y +3 de poder por ronda','+45 de vida, +4 de ataque y +6 de poder por ronda']),
 'Team Rocket':T('🚀','#b8203c',[3,5],'Afecta a tus miembros del Team Rocket','La primera vez que bajan del 60% de vida se ponen serios durante 4 s.',['25% menos de daño, +50% de vel. de ataque y regeneran 3% de vida/s','45% menos de daño, +80% de vel. de ataque y regeneran 5% de vida/s']),
};
// Nivel prismático: un escalón más allá del máximo que solo se alcanza si al menos un emblema cuenta para la sinergia
const PRISM={
 'Fuego':[8,'Quemadura del 10%/s, +35% de daño · al propagarse explota por 300'],
 'Agua':[8,'+14 de maná por ataque · oleada cada 2 habilidades: cura 18% y 320 de daño'],
 'Planta':[6,'Regeneran 6% de vida máx./s · todo tu equipo regenera 2%/s'],
 'Eléctrico':[6,'+70% de vel. de ataque · cada habilidad eléctrica lanza un rayo a 7 enemigos que aturde 1 s'],
 'Psíquico':[8,'+100 de poder · regalan 60 de maná · Todo tu equipo: +40 de poder'],
 'Roca':[7,'Roca: +160 de defensa · Todo tu equipo: +50'],
 'Dragón':[7,'+800 de vida · +6% de daño por segundo (máx. +150%)'],
 'Fantasma':[8,'Esquivan el 60% de los ataques físicos'],
 'Hada':[8,'Escudo de 700 (8s) para todo tu equipo'],
 'Normal':[8,'+900 de vida y +40% de vel. de ataque'],
 'Acero':[6,'35% menos de daño · absorben el 60% del daño de los aliados adyacentes'],
 'Siniestro':[6,'Rematan por debajo del 30% · cada remate: equipo +12% de daño (máx. 5)'],
 'Lucha':[6,'45% de robo de vida y +20% de daño'],
 'Guardián':[10,'+170 de defensa y resistencia · protegen con el 45%'],
 'Coloso':[7,'+650 de vida para todo tu equipo (el doble para Colosos)'],
 'Peleador':[8,'+85% de vida máx. · furia: +80% de vel. de ataque y +25% de daño'],
 'Tirador':[7,'+25% de daño por hexágono de distancia y +1 de alcance'],
 'Hechicero':[10,'Todo tu equipo: +60 de poder (doble para Hechiceros) · las habilidades de los Hechiceros se lanzan dos veces'],
 'Asesino':[8,'+70% de prob. crítica y +60% de daño crítico'],
 'Sanador':[8,'Curas y escudos +120% · +60 de resistencia'],
 'Cazatesoros':[5,'Al ganar: un orbe de botín, 4 de oro y oro de racha · al perder: 4 de oro'],
 'Depredadores':[8,'+80% de vel. de ataque · al matar: acelerón +130% 4 s y reinicia su habilidad'],
 'Potencial Evolutivo':[8,'+80 de vida, +8 de ataque y +12 de poder por ronda'],
 'Team Rocket':[7,'Se ponen serios con 60% menos de daño · la primera vez que caen ¡despegan! y vuelven con la mitad de vida · cada baja roba 1 de oro'],
};
for(const t in PRISM) TRAITS[t].pr=PRISM[t];
// Tirador, Dragón y Roca pasaron de 2/4/6 a 2/3/4/5. Para los Legendarios (Rayquaza, Zapdos, Giratina, Groudon) se cuentan como antes, así con las mismas fichas
// rinden igual que antes: su resonancia usa los escalones viejos (rbp) y el efecto propio de la sinergia, el escalón equivalente (LEG_OLD_TIER en applyTraits).
// Coloso no: perdió miembros con Peleador y Groudon ya iba justo, así que su resonancia sigue los escalones nuevos
for(const t of ['Tirador','Dragón','Roca']){ TRAITS[t].rbp=[2,4,6]; TRAITS[t].legOld=true; }
const LEG_OLD_TIER=[0,1,1,3,3,5]; // escalón nuevo → el que da lo mismo que su escalón viejo (2-3 fichas = 1.º, 4-5 = el de 4, prismático igual)
const ROLE={
 t:{hp:720,ad:45,as:.6,range:1,df:45,mr:40,mana:50,maxMana:100},
 b:{hp:700,ad:61,as:.7,range:1,df:35,mr:30,mana:20,maxMana:80},
 a:{hp:650,ad:65,as:.8,range:1,df:30,mr:25,mana:0,maxMana:60},
 r:{hp:500,ad:56,as:.75,range:4,df:20,mr:20,mana:0,maxMana:70},
 m:{hp:500,ad:40,as:.7,range:4,df:20,mr:25,mana:20,maxMana:75},
 h:{hp:560,ad:36,as:.65,range:3,df:25,mr:25,mana:30,maxMana:90},
};
const HPM=[1,1.12,1.28,1.5,1.85], ADM=[1,1.12,1.3,1.55,1.9];
const STAR=[1,1.8,3.24];
// Tanques a 2★: +20% de vida y +15 de defensa y resistencia, para que aguanten lo que cuestan sin ser inmortales con objetos
const TANK2={hp:1.2,res:15};
// A 3★ los costes altos se disparan: los costes 4 y 5 de 3 estrellas son casi una victoria asegurada (como en TFT)
const STAR3_BY_COST=[3.24,3.24,3.4,5,8], ABIL3_BY_COST=[3,3.1,3.3,6,11];
const ABIL_BASE=[180,250,330,520,600], ABIL_STAR=[1,1.5,2.6];
const ROLE_NAME={t:'Tanque',b:'Cuerpo a cuerpo',a:'Asesino',r:'Tirador',m:'Mago',h:'Soporte'};

const U=(key,names,dex,cost,role,traits,ab,x)=>({key,names,dex,name:names[0],cost,role,traits,ab,...x}); // x: extras de una ficha (p. ej. scale)
// Energía que necesita Mewtwo para volverse Mega (1 por baja y 1 por ronda en el tablero)
const MEW_NEED=10;
const UNIT_LIST=[
 U('charmander',['Charmander','Charmeleon','Charizard'],[4,5,6],1,'b',['Fuego','Peleador','Potencial Evolutivo'],[['burn','Ascuas',{m:1.1}],['cone','Lanzallamas',{m:1,len:2,burn:.03}],['cone','Llamarada',{m:1.3,len:3,burn:.04}]]),
 U('bulbasaur',['Bulbasaur','Ivysaur','Venusaur'],[1,2,3],1,'t',['Planta','Guardián','Potencial Evolutivo'],[['seed','Drenadoras',{m:1.2,dur:4,h:1}],['knock','Látigo Cepa',{m:1,k:2,stun:1}],['zone','Planta Feroz',{r:1,m:1.3,dur:3,root:1.2}]]),
 U('squirtle',['Squirtle','Wartortle','Blastoise'],[7,8,9],1,'t',['Agua','Guardián','Potencial Evolutivo'],[['shield','Refugio',{m:1.3}],['spin','Giro Rápido',{m:.3,n:4,dr:.3}],['wave','Hidrocañón',{m:1.2,w:1.2,push:1}]]),
 U('pichu',['Pichu','Pikachu','Raichu'],[172,25,26],1,'r',['Eléctrico','Tirador'],[['bolt','Impactrueno',{selfAs:0.1,m:1.4}],['chain','Rayo',{selfAs:0.15,n:3,m:.9}],['strike','Trueno',{selfAs:0.25,r:1,m:1.4,delay:.6,stun:.8}]]),
 U('geodude',['Geodude','Graveler','Golem'],[74,75,76],1,'b',['Roca','Coloso'],[['harden','Rizo Defensa',{df:25,heal:.5}],['slam','Rodar',{r:1,m:.9,stun:.8}],['nova','Explosión',{r:2,m:1.75,selfDmg:.3}]]),
 U('gastly',['Gastly','Haunter','Gengar'],[92,93,94],1,'m',['Fantasma','Hechicero','Team Rocket'],[['bolt','Lengüetazo',{m:1.2,stun:1}],['mark','Maldición',{m:.9,amp:.3,dur:4}],['blast','Bola Sombra',{r:1,m:1.15,shred:.3}]]),
 U('abra',['Abra','Kadabra','Alakazam'],[63,64,65],1,'m',['Psíquico','Hechicero'],[['bolt','Confusión',{m:1.3}],['pull','Telequinesis',{r:2,m:.8,stun:.8}],['strike','Premonición',{r:1,m:1.6,delay:1.2,stun:.5,ghost:1}]]),
 U('cleffa',['Cleffa','Clefairy','Clefable'],[173,35,36],1,'h',['Hada','Sanador'],[['heal','Encanto',{n:1,m:1.4}],['zone','Luz Lunar',{r:1,m:1.6,dur:3,ally:1}],['teamShield','Deseo',{m:.55,heal:.3}]]),
 U('rattata',['Rattata','Raticate'],[19,20],1,'a',['Normal','Asesino','Depredadores'],[['dash','Ataque Rápido',{m:1.3,to:'low'}],['execute','Hipercolmillo',{m:1.4,th:.25}]]),
 U('dratini',['Dratini','Dragonair','Dragonite'],[147,148,149],1,'r',['Dragón','Tirador','Potencial Evolutivo'],[['bolt','Furia Dragón',{m:1.4}],['frenzy','Danza Dragón',{as:.2,ad:.15}],['line','Hiperrayo',{m:2,stunSelf:1}]]),
 U('meowth',['Meowth','Persian'],[52,53],1,'r',['Normal','Cazatesoros','Team Rocket'],[['gold','Día de Pago',{m:1,g:1}],['gold','Día de Pago',{m:1.1,g:1,r:1}]]),
 U('machop',['Machop','Machoke','Machamp'],[66,67,68],1,'b',['Lucha','Peleador','Depredadores'],[['empower','Golpe Kárate',{n:3,m:.5}],['knock','Sísmico',{m:1.15,k:2,stun:1}],['combo','Puño Dinámico',{n:4,m:.55,stun:1.5}]]),
 U('magikarp',['Magikarp','Gyarados'],[129,130],1,'b',['Agua','Coloso','Team Rocket'],[['splash','Salpicadura',{}],['wave','Cascada',{m:.85,w:1.2,stun:.5}],['line','Hiperrayo',{m:2.2}]]),
 U('diglett',['Diglett','Dugtrio'],[50,51],1,'a',['Roca','Asesino'],[['dash','Excavar',{m:1.4,to:'far',stealth:1}],['nova','Terremoto',{r:2,m:.8}]]),
 U('eevee',['Eevee'],[133],2,'b',['Normal','Peleador'],[['stack','Adaptación',{m:.6,hp:25,ad:3,mm:50}]]),
 U('growlithe',['Growlithe','Arcanine'],[58,59],2,'b',['Fuego','Peleador','Depredadores'],[['dash','Colmillo Ígneo',{m:1.2,to:'target',burn:.03}],['dash','Velocidad Extrema',{m:1.5,to:'low',r:1,burn:.03}]]),
 U('psyduck',['Psyduck','Golduck'],[54,55],2,'m',['Agua','Hechicero'],[['sing','Confusión',{r:0,s:1.5,m:.85}],['wave','Hidropulso',{m:.8,w:1,stun:.6}]]),
 U('chikorita',['Chikorita','Bayleef','Meganium'],[152,153,154],2,'t',['Planta','Sanador'],[['heal','Síntesis',{n:2,m:.9}],['teamShield','Pantalla de Luz',{m:.5,heal:.2}],['zone','Aromaterapia',{r:2,m:1.4,dur:4,ally:1}]]),
 U('magnemite',['Magnemite','Magneton','Magnezone'],[81,82,462],2,'r',['Eléctrico','Acero','Tirador'],[['bolt','Onda Voltio',{selfAs:0.08,m:1.1,stun:.5}],['chain','Bomba Imán',{selfAs:0.08,n:3,m:.6}],['line','Cañón Destello',{selfAs:0.2,m:1.6,shred:.3}]]),
 U('onix',['Onix','Steelix'],[95,208],2,'t',['Roca','Guardián'],[['harden','Fortaleza',{df:35,heal:1}],['slam','Cola Férrea',{r:1,m:.9,stun:1.3}]]),
 U('drowzee',['Drowzee','Hypno'],[96,97],2,'t',['Psíquico','Guardián','Team Rocket'],[['sing','Hipnosis',{r:0,s:2,m:.6}],['sing','Come Sueños',{r:1,s:1.5,m:.8,drain:.5}]]),
 U('igglybuff',['Igglybuff','Jigglypuff','Wigglytuff'],[174,39,40],2,'t',['Hada','Normal','Sanador'],[['heal','Encanto',{n:2,m:.8}],['sing','Canto',{r:1,s:2,m:.35,healTeam:.25}],['sing','Voz Cautivadora',{r:2,s:2,m:.6,healTeam:.3}]]),
 U('scyther',['Scyther','Scizor'],[123,212],2,'a',['Acero','Asesino','Depredadores'],[['combo','Corte Furia',{n:3,m:.55}],['execute','Puño Bala',{m:1.8,th:.25}]]),
 U('poliwag',['Poliwag','Poliwhirl','Poliwrath'],[60,61,62],2,'b',['Agua','Lucha','Peleador'],[['bolt','Burbuja',{m:1.2}],['sing','Hipnosis',{r:1,s:1.2,m:.6}],['combo','Puño Dinámico',{n:3,m:.7,stun:1.2}]]),
 U('sableye',['Sableye'],[302],2,'a',['Siniestro','Cazatesoros','Team Rocket'],[['dash','Ladrón',{m:1.6,to:'low',g:1,stealth:1}]]),
 U('houndour',['Houndour','Houndoom'],[228,229],2,'m',['Fuego','Siniestro','Hechicero'],[['burn','Ascuas',{m:1.1}],['cone','Lanzallamas',{m:1,len:4,burn:.04}]]),
 U('riolu',['Riolu','Lucario'],[447,448],2,'r',['Lucha','Acero','Tirador'],[['bolt','Palmeo',{selfAs:0.12,m:1.3,stun:.6}],['multi','Esfera Aural',{selfAs:0.2,n:3,m:.75}]]),
 U('ponyta',['Ponyta','Rapidash'],[77,78],3,'a',['Fuego','Asesino','Depredadores'],[['dash','Nitrocarga',{m:1.2,to:'far',burn:.03,selfAs:.15}],['dash','Envite Ígneo',{m:1.45,to:'low',r:1,burn:.04}]]),
 U('shellder',['Shellder','Cloyster'],[90,91],3,'t',['Agua','Guardián'],[['harden','Refugio',{df:35,heal:.6}],['multi','Carámbano',{n:4,m:.38,chill:3,el:'Hielo'}]]),
 U('oddish',['Oddish','Gloom','Vileplume'],[43,44,45],3,'m',['Planta','Hechicero'],[['zone','Somnífero',{r:1,m:.5,dur:2,sleep:1.2}],['poison','Polvo Veneno',{m:1.1,dur:5,r:1,el:'Veneno'}],['zone','Danza Pétalo',{r:2,m:1.2,dur:3}]]),
 U('elekid',['Elekid','Electabuzz','Electivire'],[239,125,466],3,'b',['Eléctrico','Peleador'],[['empower','Puño Trueno',{n:3,m:.55,stun:.3}],['chain','Puño Trueno',{n:3,m:.9}],['slam','Voltio Cruel',{r:1,m:1.4,stun:1}]]),
 U('rhyhorn',['Rhyhorn','Rhydon','Rhyperior'],[111,112,464],3,'b',['Roca','Coloso'],[['dash','Derribo',{m:1.2,to:'target',stun:1}],['nova','Terremoto',{r:2,m:.75}],['strike','Avalancha',{r:1,m:1.5,delay:.5,stun:1,v:'rocks'}]]),
 U('misdreavus',['Misdreavus','Mismagius'],[200,429],3,'h',['Fantasma','Sanador'],[['drain','Mal de Ojo',{m:1.5,h:1.6,ally:1}],['drain','Poder Oculto',{m:1.7,h:1.8,ally:1,shred:.3}]]),
 U('mimejr',['Mime Jr.','Mr. Mime'],[439,122],3,'t',['Psíquico','Hada','Guardián'],[['teamShield','Pantalla de Luz',{m:.4}],['reflect','Barrera',{m:1,pct:.4}]]),
 U('horsea',['Horsea','Seadra','Kingdra'],[116,117,230],3,'m',['Dragón','Hechicero'],[['bolt','Pistola Agua',{m:1.4}],['line','Hidrobomba',{m:1.3}],['blast','Pulso Dragón',{r:2,m:.9}]]),
 U('togepi',['Togepi','Togetic','Togekiss'],[175,176,468],3,'h',['Hada','Sanador'],[['metro','Metrónomo',{}],['heal','Deseo',{n:3,m:1.3}],['buff','Gracia Divina',{as:.3,heal:.6}]]),
 U('tauros',['Tauros'],[128],3,'b',['Normal','Coloso'],[['dash','Derribo',{m:1.3,to:'target',stun:1,r:1}]]),
 U('gimmighoul',['Gimmighoul','Gholdengo'],[999,1000],3,'m',['Fantasma','Cazatesoros'],[['gold','Moneda Oculta',{m:1.1,g:1}],['gold','Fiebre Dorada',{m:.75,g:2,all:1}]]),
 U('munchlax',['Munchlax','Snorlax'],[446,143],3,'t',['Normal','Guardián'],[['rest','Engullir',{m:1}],['rest','Descanso',{m:2,sleep:1.5}],['slam','Golpe Cuerpo',{r:1,m:1.05,stun:1.3}]]),
 U('absol',['Absol'],[359],3,'a',['Siniestro','Asesino','Depredadores'],[['execute','Tajo Umbrío',{m:1.5,th:.3}]]),
 U('ditto',['Ditto'],[132],3,'b',['Normal','Peleador'],[['copy','Transformación',{}]]),
 U('larvitar',['Larvitar','Pupitar','Tyranitar'],[246,247,248],4,'t',['Roca','Guardián','Potencial Evolutivo'],[['harden','Endurecimiento',{df:40,heal:.6}],['shield','Fortaleza',{m:1.6}],['zone','Tormenta Arena',{r:2,m:1.8,dur:4,self:1,root:1,chill:1,v:'sand'}]]),
 U('ralts',['Ralts','Kirlia','Gardevoir'],[280,281,282],4,'h',['Psíquico','Hada','Sanador'],[['heal','Encanto',{n:2,m:1.1}],['teamShield','Paz Mental',{m:.55,ap:10}],['meteor','Fuerza Lunar',{m:.4,healAll:1.6,mana0:60,mm:70}]]),
 U('gible',['Gible','Gabite','Garchomp'],[443,444,445],4,'a',['Dragón','Asesino','Depredadores'],[['dash','Garra Dragón',{m:1.3,to:'far'}],['execute','Carga Dragón',{m:1.5,th:.25}],['slam','Terremoto',{r:2,m:.95,stun:.5}]]),
 U('duskull',['Duskull','Dusclops','Dusknoir'],[355,356,477],4,'t',['Fantasma','Guardián'],[['sing','Mal de Ojo',{r:0,s:1.5,m:.6}],['taunt','Anulación',{m:1.2}],['pull','Mundo Sombrío',{r:2,m:.9,stun:1.2,self:1}]]),
 U('shinx',['Shinx','Luxio','Luxray'],[403,404,405],4,'a',['Eléctrico','Asesino','Depredadores'],[['dash','Placaje',{m:1.3,to:'far'}],['chain','Chispa',{n:3,m:1}],['execute','Colmillo Rayo',{m:1.8,th:.25,stun:1,reset:.4}]]),
 U('turtwig',['Turtwig','Grotle','Torterra'],[387,388,389],4,'t',['Planta','Guardián','Potencial Evolutivo'],[['harden','Refugio',{df:35,heal:.7}],['drain','Gigadrenado',{m:1.2,h:1.2}],['nova','Terremoto',{r:2,m:1,stun:1}]]),
 U('beldum',['Beldum','Metang','Metagross'],[374,375,376],4,'b',['Acero','Coloso','Potencial Evolutivo'],[['dash','Derribo',{m:1.3,to:'target'}],['empower','Puño Meteoro',{n:3,m:.7}],['slam','Puño Meteoro',{r:1,m:1,stun:.6}]]),
 // Bagon: mago tanque (stats y casilla de tanque, alcance 1) cuya habilidad escala con poder (scale:'ap')
 U('bagon',['Bagon','Shelgon','Salamence'],[371,372,373],4,'t',['Dragón','Hechicero','Potencial Evolutivo'],[['burn','Ascuas',{m:1.2}],['harden','Fortaleza',{df:40,heal:1}],['meteor','Draco Meteoro',{m:.6,sh:.2,dr:.25}]],{scale:'ap'}),
 U('lapras',['Lapras'],[131],4,'t',['Agua','Sanador'],[['wave','Surf',{m:.6,w:1.6,stun:.4,healTeam:.25}]]),
 U('zorua',['Zorua','Zoroark'],[570,571],4,'a',['Siniestro','Asesino','Team Rocket'],[['dash','Finta',{m:1.4,to:'low',stealth:1}],['dash','Juego Sucio',{m:1.8,to:'low',stealth:2,r:1}]]),
 U('timburr',['Timburr','Gurdurr','Conkeldurr'],[532,533,534],4,'b',['Lucha','Peleador'],[['empower','Ultrapuño',{n:3,m:.6}],['nova','Martillazo',{r:1,m:1.6,stun:1.2}],['combo','Ultrapuño',{n:5,m:.6,stun:1.2,spill:1}]]),
 U('hatenna',['Hatenna','Hattrem','Hatterene'],[856,857,858],4,'m',['Psíquico','Hada','Hechicero'],[['bolt','Confusión',{m:1.4}],['blast','Brillo Mágico',{r:1,m:1}],['meteor','Velo Mental',{m:.7,stun:.5,mana0:40}]]),
 U('litwick',['Litwick','Lampent','Chandelure'],[607,608,609],4,'m',['Fuego','Fantasma','Hechicero'],[['drain','Infortunio',{m:1.1,h:.6}],['burn','Fuego Fatuo',{m:1,r:1}],['zone','Infierno',{r:2,m:2,dur:3,burn:.03}]]),
 U('rowlet',['Rowlet','Dartrix','Decidueye'],[722,723,724],4,'r',['Planta','Fantasma','Tirador'],[['multi','Hoja Afilada',{selfAs:0.1,n:3,m:.6}],['multi','Hoja Aguda',{selfAs:0.15,n:4,m:.6}],['line','Puntada Sombría',{selfAs:0.25,m:1.5,shred:.4,mana0:10}]]),
 // Mewtwo (rework): daño 500/750/4500 (m=.833 y m3=.682 sobre la potencia de coste 5), maná 0/45 y radio 1 (con 30 de maná y radio 2 ganaba el 90 % de los combates contra los demás coste 5 y los vaciaba en 2-3 s con objetos de maná); ver el caso 'psy' de castAbility
 U('mewtwo',['Mewtwo'],[150],5,'m',['Psíquico','Hechicero','Legendario'],[['psy','Onda Mental',{r:1,m:.833,m3:.682,mana0:0,mm:45,charge:.04,judge:4,th:[.10,.15,1],judgeDmg:.6,mega:MEW_NEED}]]),
 // Rayquaza (balance): apunta el rayo hacia donde atraviesa a más enemigos (aim), cada lanzamiento suma un +rise de daño (máx. riseCap, aditivo) y a 3★ el rayo es más ancho (w3)
 U('rayquaza',['Rayquaza'],[384],5,'r',['Dragón','Tirador','Legendario'],[['line','Ascenso Draco',{m:1.1,refundKill:.25,fall:.3,mm:85,mana0:40,aim:1,w:.65,w3:1.1,rise:.15,riseCap:.75}]]),
 // Zapdos (rework): Electrocución igual que antes (cadena de 6, +15 % por salto, híbrida) pero solo aturde al primero; Tormenta Creciente: +1 % de vel. de ataque cada 2 bajas y un rebote más en sus ataques cada 5 (todo el combate, sin límite)
 U('zapdos',['Zapdos'],[145],5,'r',['Eléctrico','Tirador','Legendario'],[['chain','Electrocución',{n:6,m:.55,amp:.15,stun:.6,stunFirst:1,adExp:1.35,mm:65,mana0:15,storm:[2,.01,5,.35]}]]),
 U('moltres',['Moltres'],[146],5,'m',['Fuego','Hechicero','Legendario'],[['meteor','Sofoco',{m:.18,burn:.02,wound:5,mm:45,mana0:20,revive:.5,nova:1}]]),
 U('kyogre',['Kyogre'],[382],5,'m',['Agua','Hechicero','Legendario'],[['tide','Pulso Primigenio',{m:.5,big:1.5,r:2,n:4,tide0:1,chill:1.5,mm:35,mana0:35}]]),
 U('groudon',['Groudon'],[383],5,'t',['Roca','Coloso','Legendario'],[['titan','Filo del Abismo',{hp:.5,m:.22,n:5,r:1,dr:.3,dur:5,stun:1.2,quake:15,mm:200,mana0:170,v:'rocks'}]]),
 U('giratina',['Giratina'],[487],5,'a',['Fantasma','Dragón','Asesino','Legendario'],[['devour','Mundo Distorsión',{m:2.6,dur:2,ghp:120,gad:11,mm:60,mana0:20}]]),
 U('lugia',['Lugia'],[249],5,'t',['Psíquico','Guardián','Legendario'],[['wave','Aerochorro',{m:.38,w:1.8,push:2,stun:.6,healTeam:.16,asTeam:.2,mm:110}]]),
 // Ho-Oh (rework): 300/450/3300 de daño a un objetivo, le quita armadura y cura 270/405/2970 a todos sus aliados; renace el primer aliado que cae y otro cada 3 lanzamientos
 U('hooh',['Ho-Oh'],[250],5,'h',['Fuego','Sanador','Legendario'],[['sacred','Fuego Sagrado',{m:.5,arm:.4,armT:5,healAll:.45,phoenix:.4,rebirth:3,mm:65,mana0:20}]]),
 U('darkrai',['Darkrai'],[491],5,'m',['Siniestro','Hechicero','Legendario'],[['sing','Brecha Negra',{pick:3,s:2.4,sStar:.8,m:.3,drain:.4,markAll:.3,markDur:6,mm:140,mana0:105}]]),
];
const EVOS=[
 U('vaporeon',['Vaporeon'],[134],2,'t',['Agua','Guardián'],[['taunt','Acua Aro',{m:1.2,heal:.5,stk:1}]]),
 U('jolteon',['Jolteon'],[135],2,'a',['Eléctrico','Asesino'],[['multi','Pin Misil',{n:6,m:.4,stk:1}]]),
 U('flareon',['Flareon'],[136],2,'b',['Fuego','Peleador'],[['burn','Envite Ígneo',{m:1.2,r:1,stk:1}]]),
 U('espeon',['Espeon'],[196],2,'m',['Psíquico','Hechicero'],[['blast','Psicocarga',{r:1,m:1.2,stun:.5,stk:1}]]),
 U('umbreon',['Umbreon'],[197],2,'t',['Siniestro','Guardián'],[['reflect','Luz Lunar',{m:1,pct:.4,heal:.5,stk:1}]]),
 U('leafeon',['Leafeon'],[470],2,'a',['Planta','Asesino'],[['execute','Hoja Aguda',{m:1.6,th:.25,stk:1}]]),
 U('sylveon',['Sylveon'],[700],2,'h',['Hada','Sanador'],[['teamShield','Voz Cautivadora',{m:.4,heal:.3,stk:1}]]),
].map(e=>({...e,evoOf:'eevee',mult:1.3}));
// Formas Mega: no salen en la tienda; Mewtwo se transforma en Mega Mewtwo Y DENTRO de un combate al reunir energía psíquica (caso 'psy' de castAbility) y vuelve a ser Mewtwo en el siguiente
const MEGAS=[
 U('megamewtwo',['Mega Mewtwo Y'],['y/150'],5,'m',['Psíquico','Hechicero','Legendario'],[['psy','Onda Mental',{r:1,m:.833,m3:.682,mana0:0,mm:45,charge:.04,judge:4,th:[.10,.15,1],judgeDmg:.6,mega:MEW_NEED,megaStart:1}]]),
].map(e=>({...e,evoOf:'mewtwo',mult:1.4}));
// Yunques: fichas del banquillo que no pelean; al venderlas eliges 1 de 6 componentes (o de 6 objetos completos el dorado)
const ANVILS=[{key:'yunque',name:'Yunque de componentes',names:null,dex:'anvil',cost:1,role:'t',traits:[],ab:[['shield','—',{m:0}]],anvil:'c'},
 {key:'yunque_oro',name:'Yunque de objetos',names:null,dex:'anvil:oro',cost:1,role:'t',traits:[],ab:[['shield','—',{m:0}]],anvil:'f'}];
const DEF={}; for(const u of [...UNIT_LIST,...EVOS,...MEGAS,...ANVILS]) DEF[u.key]=u;
DEF.lugia.hpm=1.12; // Lugia: menos daño pero más aguante
DEF.giratina.mult=.9; // Giratina: empieza más flojo y crece devorando (ghp/gad altos): pide objetos y tiempo
// Forma de cada estrella. Los costes 4 de 3 formas empiezan en su 2.ª forma (Pupitar, Kirlia, Gabite…):
// a 2★ ya son la forma final con su mejor habilidad, porque llevarlos a 3★ es muy difícil
const formIdx=(d,star,len)=>Math.max(0,Math.min(d.cost===4&&len===3?star:star-1,len-1));
const dexOf=(d,star)=>Array.isArray(d.dex)?d.dex[formIdx(d,star,d.dex.length)]:d.dex;
const nameOf=(d,star)=>d.names?d.names[formIdx(d,star,d.names.length)]:d.name;
const abOf=(d,star)=>d.ab[formIdx(d,star,d.ab.length)];
const typeColor=d=>d&&d.traits&&d.traits[0]&&TRAITS[d.traits[0]]?TRAITS[d.traits[0]].color:'#e9d27a';
const METRO=[['bolt','Hiperrayo',{m:1.8}],['nova','Explosión',{r:2,m:1}],['heal','Recuperación',{n:3,m:.8}],['meteor','Cometa Draco',{m:.6}],['sing','Canto',{r:1,s:2,m:.3}],['splash','Salpicadura',{}],['teamShield','Protección',{m:.5}],['chain','Rayo',{n:4,m:.8}]];
const KIND_NAME={psy:'Juicio Psíquico',sacred:'Golpe y cura',tide:'Marea',lunar:'Daño y curación',titan:'Coloso',devour:'Devorar',bolt:'Disparo',burn:'Fuego',blast:'Área',nova:'Área propia',line:'Rayo en línea',chain:'Cadena',multi:'Proyectiles',combo:'Combo',dash:'Salto',execute:'Remate',meteor:'Golpe global',shield:'Escudo',taunt:'Provocación',reflect:'Reflejo',harden:'Endurecer',rest:'Descanso',heal:'Curación',teamShield:'Escudo de equipo',buff:'Mejora de equipo',frenzy:'Frenesí',empower:'Potenciar ataques',sing:'Sueño',drain:'Drenaje',gold:'Oro',stack:'Acumulación infinita',splash:'¿?',copy:'Copia',metro:'Aleatoria',
 cone:'Cono',wave:'Ola',strike:'Golpe retardado',zone:'Zona',knock:'Empujón',pull:'Atracción',seed:'Drenadoras',poison:'Veneno',mark:'Marca',spin:'Giro',slam:'Salto en área'};

// Entrenadores que se pueden elegir como estratega (sprites de Pokémon Showdown)
const TRAINERS=[
 ['red','Red','Kanto'],['blue','Blue','Kanto'],['ethan','Eco','Johto'],['lyra','Lyra','Johto'],['kris','Kris','Johto'],['silver','Plata','Johto'],
 ['brendan','Bruno','Hoenn'],['may','Aura','Hoenn'],['wally','Blasco','Hoenn'],['lucas','Leo','Sinnoh'],['dawn','Maya','Sinnoh'],['barry','Israel','Sinnoh'],
 ['hilbert','Hilbert','Teselia'],['hilda','Hilda','Teselia'],['nate','Nate','Teselia'],['rosa','Rosa','Teselia'],['cheren','Cheren','Teselia'],['bianca','Bel','Teselia'],['n','N','Teselia'],
 ['calem','Calem','Kalos'],['serena','Serena','Kalos'],['elio','Elio','Alola'],['selene','Selene','Alola'],['hau','Tilo','Alola'],['lillie','Lylia','Alola'],['gladion','Gladio','Alola'],
 ['victor','Víctor','Galar'],['gloria','Gloria','Galar'],['hop','Paul','Galar'],['marnie','Roxy','Galar'],
 ['brock','Brock','Líder'],['misty','Misty','Líder'],['ltsurge','Lt. Surge','Líder'],['erika','Erika','Líder'],['koga','Koga','Líder'],['sabrina','Sabrina','Líder'],['blaine','Blaine','Líder'],
 ['morty','Morti','Líder'],['jasmine','Yasmina','Líder'],['whitney','Blanca','Líder'],['elesa','Camila','Líder'],['skyla','Gerania','Líder'],['nessa','Cathy','Líder'],['raihan','Roy','Líder'],['acerola','Zarala','Alola'],
 ['lance','Lance','Campeón'],['steven','Máximo','Campeón'],['cynthia','Cintia','Campeona'],['iris','Iris','Campeona'],['diantha','Dianta','Campeona'],['leon','Lionel','Campeón'],
 ['giovanni','Giovanni','Rocket'],['oak','Prof. Oak','Profesor'],
].map(([key,name,from])=>({key,name,from}));
const TRAINER_BY={}; for(const t of TRAINERS) TRAINER_BY[t.key]=t;
// Minileyendas: el Pokémon que te representa en el tablero (evoluciona al llegar a nivel 6)
// Etapas: base · nivel 6 · nivel 8 (sin Megaevoluciones). Eevee no tiene línea fija: al llegar a 6 y a 8 eliges su evolución (pick: opciones de cada subida)
const TACS={charmander:{name:'Charmander',evo:'Charmeleon y Charizard',dex:[4,5,6]},bulbasaur:{name:'Bulbasaur',evo:'Ivysaur y Venusaur',dex:[1,2,3]},squirtle:{name:'Squirtle',evo:'Wartortle y Blastoise',dex:[7,8,9]},
 dratini:{name:'Dratini',evo:'Dragonair y Dragonite',dex:[147,148,149]},pichu:{name:'Pichu',evo:'Pikachu y Raichu',dex:[172,25,26]},abra:{name:'Abra',evo:'Kadabra y Alakazam',dex:[63,64,65]},chikorita:{name:'Chikorita',evo:'Bayleef y Meganium',dex:[152,153,154]},
 eevee:{name:'Eevee',evo:'la evolución que elijas en los niveles 6 y 8',dex:[133,134,196],locked:true,pick:[['flareon','jolteon','vaporeon'],['espeon','umbreon','leafeon','sylveon']]},
 // Mew (mítica del gacha): no evoluciona; al ganar un combate copia la minileyenda del rival (mimic: ver mewWin, tecla 1 y 2)
 mew:{name:'Mew',evo:'copia la minileyenda de quien derrotas',dex:[151,151,151],locked:true,mimic:true},
 // Líneas de 1.ª gen (todas con modelo animado oficial): dex por etapa (niveles 1, 6 y 8; las de 2 formas repiten la 2.ª y las de 1, la única).
 // tier: c y p gratis; r, e y l solo del gacha (locked, premios 'tac:<clave>' de su rareza en cosmetics.js)
 caterpie:{name:"Caterpie",evo:"Metapod y Butterfree",dex:[10,11,12],tier:'c'},
 weedle:{name:"Weedle",evo:"Kakuna y Beedrill",dex:[13,14,15],tier:'c'},
 pidgey:{name:"Pidgey",evo:"Pidgeotto y Pidgeot",dex:[16,17,18],tier:'c'},
 rattata:{name:"Rattata",evo:"Raticate",dex:[19,20,20],tier:'c'},
 spearow:{name:"Spearow",evo:"Fearow",dex:[21,22,22],tier:'c'},
 ekans:{name:"Ekans",evo:"Arbok",dex:[23,24,24],tier:'c'},
 sandshrew:{name:"Sandshrew",evo:"Sandslash",dex:[27,28,28],tier:'c'},
 nidoranf:{name:"Nidoran♀",evo:"Nidorina y Nidoqueen",dex:[29,30,31],tier:'c'},
 nidoranm:{name:"Nidoran♂",evo:"Nidorino y Nidoking",dex:[32,33,34],tier:'c'},
 zubat:{name:"Zubat",evo:"Golbat",dex:[41,42,42],tier:'c'},
 oddish:{name:"Oddish",evo:"Gloom y Vileplume",dex:[43,44,45],tier:'c'},
 paras:{name:"Paras",evo:"Parasect",dex:[46,47,47],tier:'c'},
 venonat:{name:"Venonat",evo:"Venomoth",dex:[48,49,49],tier:'c'},
 diglett:{name:"Diglett",evo:"Dugtrio",dex:[50,51,51],tier:'c'},
 meowth:{name:"Meowth",evo:"Persian",dex:[52,53,53],tier:'c'},
 psyduck:{name:"Psyduck",evo:"Golduck",dex:[54,55,55],tier:'c'},
 mankey:{name:"Mankey",evo:"Primeape",dex:[56,57,57],tier:'c'},
 poliwag:{name:"Poliwag",evo:"Poliwhirl y Poliwrath",dex:[60,61,62],tier:'c'},
 bellsprout:{name:"Bellsprout",evo:"Weepinbell y Victreebel",dex:[69,70,71],tier:'c'},
 tentacool:{name:"Tentacool",evo:"Tentacruel",dex:[72,73,73],tier:'c'},
 geodude:{name:"Geodude",evo:"Graveler y Golem",dex:[74,75,76],tier:'c'},
 doduo:{name:"Doduo",evo:"Dodrio",dex:[84,85,85],tier:'c'},
 seel:{name:"Seel",evo:"Dewgong",dex:[86,87,87],tier:'c'},
 grimer:{name:"Grimer",evo:"Muk",dex:[88,89,89],tier:'c'},
 shellder:{name:"Shellder",evo:"Cloyster",dex:[90,91,91],tier:'c'},
 drowzee:{name:"Drowzee",evo:"Hypno",dex:[96,97,97],tier:'c'},
 krabby:{name:"Krabby",evo:"Kingler",dex:[98,99,99],tier:'c'},
 voltorb:{name:"Voltorb",evo:"Electrode",dex:[100,101,101],tier:'c'},
 koffing:{name:"Koffing",evo:"Weezing",dex:[109,110,110],tier:'c'},
 horsea:{name:"Horsea",evo:"Seadra",dex:[116,117,117],tier:'c'},
 goldeen:{name:"Goldeen",evo:"Seaking",dex:[118,119,119],tier:'c'},
 magikarp:{name:"Magikarp",evo:"Gyarados",dex:[129,130,130],tier:'c'},
 clefairy:{name:"Clefairy",evo:"Clefable",dex:[35,36,36],tier:'p'},
 vulpix:{name:"Vulpix",evo:"Ninetales",dex:[37,38,38],tier:'p'},
 jigglypuff:{name:"Jigglypuff",evo:"Wigglytuff",dex:[39,40,40],tier:'p'},
 growlithe:{name:"Growlithe",evo:"Arcanine",dex:[58,59,59],tier:'p'},
 machop:{name:"Machop",evo:"Machoke y Machamp",dex:[66,67,68],tier:'p'},
 ponyta:{name:"Ponyta",evo:"Rapidash",dex:[77,78,78],tier:'p'},
 slowpoke:{name:"Slowpoke",evo:"Slowbro",dex:[79,80,80],tier:'p'},
 magnemite:{name:"Magnemite",evo:"Magneton",dex:[81,82,82],tier:'p'},
 gastly:{name:"Gastly",evo:"Haunter y Gengar",dex:[92,93,94],tier:'p'},
 exeggcute:{name:"Exeggcute",evo:"Exeggutor",dex:[102,103,103],tier:'p'},
 cubone:{name:"Cubone",evo:"Marowak",dex:[104,105,105],tier:'p'},
 rhyhorn:{name:"Rhyhorn",evo:"Rhydon",dex:[111,112,112],tier:'p'},
 staryu:{name:"Staryu",evo:"Starmie",dex:[120,121,121],tier:'p'},
 farfetchd:{name:"Farfetch'd",evo:"no evoluciona",dex:[83,83,83],tier:'p'},
 onix:{name:"Onix",evo:"no evoluciona",dex:[95,95,95],locked:true,tier:'r'},
 hitmonlee:{name:"Hitmonlee",evo:"no evoluciona",dex:[106,106,106],locked:true,tier:'r'},
 hitmonchan:{name:"Hitmonchan",evo:"no evoluciona",dex:[107,107,107],locked:true,tier:'r'},
 lickitung:{name:"Lickitung",evo:"no evoluciona",dex:[108,108,108],locked:true,tier:'r'},
 tangela:{name:"Tangela",evo:"no evoluciona",dex:[114,114,114],locked:true,tier:'r'},
 chansey:{name:"Chansey",evo:"no evoluciona",dex:[113,113,113],locked:true,tier:'r'},
 kangaskhan:{name:"Kangaskhan",evo:"no evoluciona",dex:[115,115,115],locked:true,tier:'r'},
 mrmime:{name:"Mr. Mime",evo:"no evoluciona",dex:[122,122,122],locked:true,tier:'r'},
 jynx:{name:"Jynx",evo:"no evoluciona",dex:[124,124,124],locked:true,tier:'r'},
 electabuzz:{name:"Electabuzz",evo:"no evoluciona",dex:[125,125,125],locked:true,tier:'r'},
 magmar:{name:"Magmar",evo:"no evoluciona",dex:[126,126,126],locked:true,tier:'r'},
 pinsir:{name:"Pinsir",evo:"no evoluciona",dex:[127,127,127],locked:true,tier:'r'},
 tauros:{name:"Tauros",evo:"no evoluciona",dex:[128,128,128],locked:true,tier:'r'},
 porygon:{name:"Porygon",evo:"no evoluciona",dex:[137,137,137],locked:true,tier:'r'},
 omanyte:{name:"Omanyte",evo:"Omastar",dex:[138,139,139],locked:true,tier:'r'},
 kabuto:{name:"Kabuto",evo:"Kabutops",dex:[140,141,141],locked:true,tier:'r'},
 scyther:{name:"Scyther",evo:"no evoluciona",dex:[123,123,123],locked:true,tier:'r'},
 lapras:{name:"Lapras",evo:"no evoluciona",dex:[131,131,131],locked:true,tier:'e'},
 snorlax:{name:"Snorlax",evo:"no evoluciona",dex:[143,143,143],locked:true,tier:'e'},
 ditto:{name:"Ditto",evo:"no evoluciona",dex:[132,132,132],locked:true,tier:'e'},
 aerodactyl:{name:"Aerodactyl",evo:"no evoluciona",dex:[142,142,142],locked:true,tier:'e'},
 articuno:{name:"Articuno",evo:"no evoluciona",dex:[144,144,144],locked:true,tier:'l'},
 zapdos:{name:"Zapdos",evo:"no evoluciona",dex:[145,145,145],locked:true,tier:'l'},
 moltres:{name:"Moltres",evo:"no evoluciona",dex:[146,146,146],locked:true,tier:'l'},
 mewtwo:{name:"Mewtwo",evo:"no evoluciona",dex:[150,150,150],locked:true,tier:'l'}};
const tacStage=p=>p&&p.level>=8?2:p&&p.level>=6?1:0;
// Etapa visible: cuántas formas distintas ha pasado (las líneas de 2 formas no «evolucionan» otra vez a nivel 8, ni las de 1 nunca; Mew tampoco)
// Altura real (m, de la Pokédex vía PokeAPI) de cada forma de minileyenda. Los modelos se normalizan a la misma altura, así que todas las primeras
// formas se ven iguales; las evoluciones crecen según su altura real respecto a su forma base (raíz 0,35, hasta ×1,45) y los gigantes de una sola
// forma (≥ 1,5 m: Onix, Snorlax, Lapras…) según su altura respecto a 1 m (raíz 0,35, hasta ×2)
const DEX_H={1:0.7,2:1,3:2,4:0.6,5:1.1,6:1.7,7:0.5,8:1,9:1.6,10:0.3,11:0.7,12:1.1,13:0.3,14:0.6,15:1,16:0.3,17:1.1,18:1.5,19:0.3,20:0.7,21:0.3,22:1.2,23:2,24:3.5,25:0.4,26:0.8,27:0.6,28:1,29:0.4,30:0.8,31:1.3,32:0.5,33:0.9,34:1.4,35:0.6,36:1.3,37:0.6,38:1.1,39:0.5,40:1,41:0.8,42:1.6,43:0.5,44:0.8,45:1.2,46:0.3,47:1,48:1,49:1.5,50:0.2,51:0.7,52:0.4,53:1,54:0.8,55:1.7,56:0.5,57:1,58:0.7,59:1.9,60:0.6,61:1,62:1.3,63:0.9,64:1.3,65:1.5,66:0.8,67:1.5,68:1.6,69:0.7,70:1,71:1.7,72:0.9,73:1.6,74:0.4,75:1,76:1.4,77:1,78:1.7,79:1.2,80:1.6,81:0.3,82:1,83:0.8,84:1.4,85:1.8,86:1.1,87:1.7,88:0.9,89:1.2,90:0.3,91:1.5,92:1.3,93:1.6,94:1.5,95:8.8,96:1,97:1.6,98:0.4,99:1.3,100:0.5,101:1.2,102:0.4,103:2,104:0.4,105:1,106:1.5,107:1.4,108:1.2,109:0.6,110:1.2,111:1,112:1.9,113:1.1,114:1,115:2.2,116:0.4,117:1.2,118:0.6,119:1.3,120:0.8,121:1.1,122:1.3,123:1.5,124:1.4,125:1.1,126:1.3,127:1.5,128:1.4,129:0.9,130:6.5,131:2.5,132:0.3,133:0.3,134:1,135:0.8,136:0.9,137:0.8,138:0.4,139:1,140:0.5,141:1.3,142:1.8,143:2.1,144:1.7,145:1.6,146:2,147:1.8,148:4,149:2.2,150:2,151:0.4,152:0.9,153:1.2,154:1.8,172:0.3,173:0.3,174:0.3,175:0.3,176:0.6,196:0.9,197:1,200:0.7,208:9.2,212:1.8,228:0.6,229:1.4,230:1.8,239:0.6,246:0.6,247:1.2,248:2,249:5.2,250:3.8,280:0.4,281:0.8,282:1.6,302:0.5,355:0.8,356:1.6,359:1.2,371:0.6,372:1.1,373:1.5,374:0.6,375:1.2,376:1.6,382:4.5,383:3.5,384:7,387:0.4,388:1.1,389:2.2,403:0.5,404:0.9,405:1.4,429:0.9,439:0.6,443:0.7,444:1.4,445:1.9,446:0.6,447:0.7,448:1.2,462:1.2,464:2.4,466:1.8,468:1.5,470:1,471:0.8,477:2.2,487:4.5,491:1.5,532:0.6,533:1.2,534:1.4,570:0.7,571:1.6,607:0.3,608:0.6,609:1,700:1,722:0.3,723:0.7,724:1.6,856:0.4,857:0.6,858:2.1,999:0.3,1000:1.2};
// Tamaño por altura real: 1 en la primera forma; las evoluciones, (altura/altura de la base)^0,35 hasta ×1,45 y sin encoger nunca;
// los gigantes de una sola forma (≥ 1,5 m), altura^0,35 hasta `cap`
const dexNum=d=>+String(d).split(/[:/]/).pop();
function heightSize(chain,d,cap){ const b=chain[0], hb=DEX_H[b]||1, h=DEX_H[d]||1;
 if(d!==b){ const i=chain.indexOf(d), st=i>0?chain.slice(1,i+1):[d]; return Math.max(...st.map(x=>clamp(Math.pow((DEX_H[x]||1)/hb,.35),1,1.45))); }
 if(new Set(chain).size===1&&h>=1.5) return clamp(Math.pow(h,.35),1,cap);
 return 1; }
const tacLineOf=d=>Object.values(TACS).find(t=>!t.mimic&&(t.dex.includes(d)||(t.pick&&t.pick.flat().some(k=>DEF[k]&&dexOf(DEF[k],1)===d))))||null;
function tacSize(p){ const d=+tacDex(p), t=tacLineOf(d)||tacOf(p); return heightSize(t.dex,d,2); }
const tacStar=p=>{ const t=tacOf(p); if(t.mimic) return 1; if(t.pick) return tacStage(p)+1; return new Set(t.dex.slice(0,tacStage(p)+1)).size; };
const TAC_KEYS=Object.keys(TACS);
// Minileyendas gratuitas: las únicas que reciben los rivales generados por ahora (Eevee es mítica y solo sale del gacha)
const FREE_TACS=TAC_KEYS.filter(k=>!TACS[k].locked);
// Rarezas del selector de minileyendas (lista seccionada; las vacías salen como «Próximamente»)
const TAC_TIERS=[['Común','comun',['charmander','bulbasaur','squirtle','pichu','chikorita','caterpie','weedle','pidgey','rattata','spearow','ekans','sandshrew','nidoranf','nidoranm','zubat','oddish','paras','venonat','diglett','meowth','psyduck','mankey','poliwag','bellsprout','tentacool','geodude','doduo','seel','grimer','shellder','drowzee','krabby','voltorb','koffing','horsea','goldeen','magikarp']],['Poco común','pococomun',['dratini','abra','clefairy','vulpix','jigglypuff','growlithe','machop','ponyta','slowpoke','magnemite','gastly','exeggcute','cubone','rhyhorn','staryu','farfetchd']],['Raro','raro',['onix','hitmonlee','hitmonchan','lickitung','tangela','chansey','kangaskhan','mrmime','jynx','electabuzz','magmar','pinsir','tauros','porygon','omanyte','kabuto','scyther']],['Épico','epico',['lapras','snorlax','ditto','aerodactyl']],['Legendario','legendario',['eevee','mew','articuno','zapdos','moltres','mewtwo']]];
const tacOwned=k=>!!TACS[k]&&(!TACS[k].locked||!!(typeof ACC!=='undefined'&&ACC&&ACC.cosm&&Array.isArray(ACC.cosm.inv)&&ACC.cosm.inv.includes('tac:'+k)));
// Número de Pokédex que se dibuja: el de la línea, o el que haya elegido el jugador con Eevee (tacForm = [forma de nivel 6, forma de nivel 8])
const tacOf=p=>TACS[p&&p.tac]||TACS.charmander;
const tacDex=p=>{ const t=tacOf(p), st=tacStage(p); if(t.mimic) return p.mewF||t.dex[0]; if(t.pick&&st>0){ const k=p.tacForm&&(st>1&&p.tacForm[1]||p.tacForm[0]); if(k&&DEF[k]) return dexOf(DEF[k],1); return t.dex[0]; } return t.dex[st]; };
// Eevee (prueba): desde el nivel 6 (y para siempre), las teclas 1, 2 y 3 le dan la forma Vaporeon, Flareon o Jolteon (se puede cambiar cuantas veces se quiera)
const EEVEE_KEYS=['vaporeon','flareon','jolteon'];

/* ============================ [ABILITIES] ============================ */
// Habilidad al estilo TFT: cada número es el valor real (con tus estadísticas) y lleva el icono de lo que lo hace crecer.
// Al pasar el ratón se ve el ratio (p. ej. «216% ✨»: con 100 de poder base, el valor es 2,16 veces tu poder) y abajo
// los valores de cada estrella [1★/2★/3★] con la actual resaltada. El poder (✨) se muestra como en TFT: empieza en 100.
let ABD=null;
const SCALE_ICON={ap:'✨',ad:'✨⚔️',hp:'✨❤️'};
const starMul=(cost,s)=>s>=3?ABIL3_BY_COST[cost-1]:ABIL_STAR[s-1];
function abLabel(before,after){
 // la palabra clave más cercana al número decide la etiqueta
 const b=before.toLowerCase(), kw=[['escudo','Escudo'],['cura','Curación'],['drena','Drenaje'],['daño','Daño'],['golpea','Daño'],['inflige','Daño']].map(([w,n])=>[b.lastIndexOf(w),n]).sort((x,y)=>y[0]-x[0])[0]; let lb=kw[0]>=0?kw[1]:'Daño';
 if(/^ (de daño )?(mágico )?(por golpe|cada uno|cada vez|a cada)/.test(after)) lb+=' por golpe'; else if(/cercanos/.test(after)) lb+=' a los cercanos'; else if(/^ más durante/.test(after)) lb+=' en el tiempo'; else if(/^ al momento/.test(after)) lb+=' al momento';
 return lb;
}
function abHTML(ab,u,star,opt={}){
 const P=abilPower(u), k=scaleOf(u), ic=SCALE_ICON[k], vals=[];
 ABD=vals; let t; try{ t=abDesc(ab,P,star); } finally{ ABD=null; }
 const d=u.d, sm=starMul(u.cost,star), unit=P/sm/(1+u.ap/100); // ratio por estrella: base × factor del rol (sin poder)
 const same=[1,2,3].map(s=>(!d.names||abOf(d,s)[1]===ab[1])&&!(s===3&&ab[2].m3)), rows=[], seen=new Set(); // m3: daño propio a 3★ (Mewtwo)
 const ratio=x=>`${R0(unit*sm*x)}% ✨${k!=='ap'?` · crece también con ${k==='ad'?'⚔️ el ataque':'❤️ la vida máxima'}`:''}`;
 t=t.replace(/\u0001(\d+)\u0002/g,(m,i,off,str)=>{ const x=vals[+i], lb=abLabel(str.slice(Math.max(0,off-30),off),str.slice(off+m.length,off+m.length+24));
   const key=lb+'|'+x; if(!seen.has(key)){ seen.add(key); rows.push([lb,x]); }
   return `<b class="sv" title="${ratio(x)}">${R0(P*x)}<i>${ic}</i></b>`; });
 if(opt.short) return t;
 // Si la habilidad cambia con la estrella, cada una calcula sus propios números: siempre se ven los 3 niveles para comparar el escalado (solo queda «—» si esa estrella no tiene ese efecto)
 const rowsOf=(abx,s)=>{ const v2=[], out=[], sn=new Set(); ABD=v2; let t2; try{ t2=abDesc(abx,P,s); } finally{ ABD=null; }
   t2.replace(/\u0001(\d+)\u0002/g,(m,i,off,str)=>{ const x=v2[+i], lb=abLabel(str.slice(Math.max(0,off-30),off),str.slice(off+m.length,off+m.length+24)), key=lb+'|'+x; if(!sn.has(key)){ sn.add(key); out.push([lb,x]); } return m; }); return out; };
 const byStar=[1,2,3].map(s=>same[s-1]?rows:rowsOf(abOf(d,s),s)), labels=[], seenL=new Set();
 for(const rs of [rows,...byStar]) for(const [lb] of rs){ const bs=lb.split(' ')[0]; if(!seenL.has(lb)&&!(rs!==rows&&labels.length&&labels.some(l=>l.split(' ')[0]===bs&&rows.every(r=>r[0]!==lb)&&!byStar.some(q=>q!==rs&&q.some(r=>r[0]===l))))){ seenL.add(lb); labels.push(lb); } }
 const list=labels.map(lb=>{ const mine=rows.find(r=>r[0]===lb), cells=[1,2,3].map(s=>{ const bs=lb.split(' ')[0], r=byStar[s-1].find(q=>q[0]===lb)||byStar[s-1].find(q=>q[0].split(' ')[0]===bs); return r?`<b class="${s===star?'on':''}">${R0(P/sm*starMul(u.cost,s)*r[1])}</b>`:'<b>—</b>'; }).join(' / ');
   return `<div class="abv"><span>${lb}</span><span>${cells}</span>${mine?`<small>${ratio(mine[1]).split(' · ')[0]}</small>`:''}</div>`; }).join('');
 const bonus=u.castBoost>0?`<div class="abBonus">Bonificación actual: <b>+${R0(u.castBoost*100)}%</b> de ${ic}</div>`:'';
 return `<p>${t}</p>${bonus}${list?`<div class="abList">${list}</div>`:''}`;
}
function abDesc(ab,P,star){
 const [k,,p]=ab; const d=x=>ABD?(ABD.push(x),'\u0001'+(ABD.length-1)+'\u0002'):R0(P*x); const ex=[];
 if(p.stun) ex.push(`aturde ${p.stun}s`); if(p.burn&&k!=='zone') ex.push(`quema ${(p.burn*100).toFixed(0)}% de vida máx./s (4s)`); if(p.shred) ex.push(`reduce su resistencia un ${R0(p.shred*100)}%`); if(p.chill&&k!=='zone') ex.push(`le hace atacar un 35% más lento ${p.chill}s`); if(p.wound) ex.push(`reduce su curación a la mitad ${p.wound}s`);
 const e=ex.length?` (${ex.join(', ')})`:''; let t='';
 switch(k){
  case 'bolt': t=`Golpea al objetivo por ${d(p.m)} de daño mágico${e}.`; break;
  case 'burn': t=p.r?`Llamas en el objetivo y los adyacentes: ${d(p.m)} de daño y quemadura del ${R0((p.burn||.03)*100)}%/s.`:`Quema al objetivo: ${d(p.m)} de daño y ${R0((p.burn||.03)*100)}% de su vida máx. por segundo (4s).`; break;
  case 'blast': t=`Explosión en el objetivo (radio ${p.r}): ${d(p.m)} de daño mágico${e}.`; break;
  case 'nova': t=`Golpea a los enemigos a ${p.r} casilla${p.r>1?'s':''} a su alrededor: ${d(p.m)} de daño${e}.${p.selfDmg?` Pierde un ${R0(p.selfDmg*100)}% de su vida (nunca muere por ello).`:''}`; break;
  case 'line': t=`Rayo en línea recta${p.aim?' hacia donde atraviesa a más enemigos':''}${star>=3&&p.w3?' (más ancho a 3★)':''}: ${d(p.m)} de daño${e}${p.fall?` (cada enemigo atravesado recibe un ${R0(p.fall*100)}% menos que el anterior, mín. 40 %)`:''}.${p.stunSelf?` Después se recarga ${p.stunSelf}s.`:''}${p.rise?` Cada lanzamiento hace los siguientes un ${R0(p.rise*100)}% más fuertes (hasta +${R0((p.riseCap||1)*100)}% en el combate).`:''}`; break;
  case 'chain': t=`Rebota entre ${p.n} enemigos: ${d(p.m)} de daño a cada uno${p.amp?`, y cada salto pega un ${R0(p.amp*100)}% más`:''}${e}.`; break;
  case 'multi': t=`Lanza ${p.n} proyectiles a enemigos al azar: ${d(p.m)} de daño cada uno${e}.`; break;
  case 'combo': t=`Golpea ${p.n} veces seguidas al objetivo: ${d(p.m)} por golpe${p.stun?`; el último aturde ${p.stun}s`:''}.${p.spill?' Si el objetivo cae, los golpes que sobran van al enemigo más cercano.':''}`; break;
  case 'dash': t=`Salta junto al enemigo ${p.to==='far'?'más alejado a 3 casillas o menos':p.to==='low'?'con menos vida a 3 casillas o menos':'objetivo'} y le inflige ${d(p.m)}${p.r?` (y ${d(p.m*.6)} a los cercanos)`:''}${e}.${p.stealth?` Se vuelve invisible ${p.stealth}s.`:''}${p.selfAs?` Gana +${R0(p.selfAs*100)}% de vel. de ataque.`:''}`; break;
  case 'execute': t=`Inflige ${d(p.m)} al objetivo${e}. Si queda por debajo del ${R0((p.th+.05*(star-1))*100)}% de vida, lo remata.${p.reset?` Si lo derrota, recupera el ${R0(p.reset*100)}% de su maná.`:''}`; break;
  case 'tide': t=`Dispara al objetivo: ${d(p.m)} de daño mágico. Cada ${p.n} lanzamientos desata un maremoto en la zona con más enemigos (radio ${p.r}): ${d(p.big)} de daño mágico${e}.`; break;
  case 'meteor': t=`Golpea a TODOS los enemigos por ${d(p.m)}${e}.${p.sh?` Se cubre con un escudo del ${R0(p.sh*100)}% de su vida máxima (4s)`:''}${p.dr?`${p.sh?' y':' Después'} recibe un ${R0(p.dr*100)}% menos de daño 3s.`:p.sh?'.':''}${p.healAll?` Cura ${d(p.healAll)} a todos sus aliados.`:''}${p.manaTeam?` Da ${p.manaTeam} de maná a sus aliados.`:''}`; break;
  case 'psy': t=`Onda mental en el objetivo (radio ${p.r}): ${d(star>=3&&p.m3?p.m3:p.m)} de daño mágico. Cada lanzamiento le da una carga psíquica: +${R0((p.charge||0)*100)}% de daño de esta habilidad durante el combate. Cada ${p.judge} lanzamientos, Juicio Psíquico: ${star>=3?'ejecuta al enemigo con menos vida (salvo escudos y renacimientos)':`ejecuta al enemigo con menos vida si le queda menos del ${R0((p.th||[])[Math.min(2,star-1)]*100)}%; si no, le lanza otra descarga de ${d((star>=3&&p.m3?p.m3:p.m)*(p.judgeDmg||.6))}`}. Con ${p.mega} de energía psíquica (1 por lanzamiento y 1 por baja) se vuelve Mega Mewtwo Y hasta el final del combate: radio ${p.r+1} y una segunda descarga en otro grupo.`; break;
  case 'sacred': t=`Golpea a su objetivo con ${d(p.m)} de daño mágico y le quita un ${R0((p.arm||0)*100)}% de armadura durante ${p.armT||5}s (no se acumula: se renueva). Cura ${d(p.healAll)} a todos sus aliados.`; break;
  case 'shield': t=`Se cubre con un escudo de ${d(p.m)} durante 4s.`; break;
  case 'taunt': t=`Provoca a los enemigos cercanos para que le ataquen, gana un escudo de ${d(p.m*.6)} y recibe un 30% menos de daño 3s.${p.heal?` Se cura ${d(p.heal)}.`:''}${p.teamShield?` Sus aliados ganan un escudo de ${d(p.teamShield)}.`:''}`; break;
  case 'reflect': t=`Gana un escudo de ${d(p.m*.6)} y devuelve el ${R0(p.pct*100)}% del daño recibido durante 4s.${p.heal?` Se cura ${d(p.heal)}.`:''}`; break;
  case 'harden': t=`Gana +${p.df*star} de defensa y resistencia (se acumula) y se cura ${d(p.heal)}.`; break;
  case 'rest': t=`Se cura ${d(p.m)}${p.sleep?` y se duerme ${p.sleep}s`:''}.`; break;
  case 'lunar': t=`Lanza un rayo lunar al objetivo: ${d(p.m)} de daño mágico (la mitad a los enemigos adyacentes) y cura ${d(p.heal)} a los ${p.n} aliados con menos vida (ella incluida). Daño y curación pueden ser críticos y crecen un ${R0(p.grow*100)}% con cada lanzamiento.`; break;
  case 'heal': t=p.n>=99?`Cura ${d(p.m)} a todo su equipo.`:`Cura ${d(p.m)} a ${p.n===1?'el aliado':`los ${p.n} aliados`} con menos vida.`; break;
  case 'teamShield': t=`Todo su equipo gana un escudo de ${d(p.m)} (4s).${p.heal?` Y se cura ${d(p.heal)}.`:''}${p.ap?` Aliados +${p.ap} de poder (se acumula).`:''}`; break;
  case 'buff': t=`Todo su equipo gana +${R0(p.as*100)}% de velocidad de ataque (se acumula)${p.heal?` y se cura ${d(p.heal)}`:''}.`; break;
  case 'frenzy': t=`Gana +${R0(p.as*100)}% de vel. de ataque, +${R0(p.ad*100)}% de daño de ataque y +${R0(p.ad*100)} de poder (se acumula).`; break;
  case 'empower': t=`Sus próximos ${p.n} ataques infligen ${d(p.m)} de daño mágico extra${p.stun?` y aturden ${p.stun}s`:''}.`; break;
  case 'sing': t=p.pick?`Duerme a ${p.pick+star-1} enemigos al azar ${R0((p.s+(p.sStar||0)*(star-1))*10)/10}s y les inflige ${d(p.m)}.${p.drain?` Se cura un ${R0(p.drain*100)}% del daño.`:''}`:`${p.all?'Duerme a TODOS los enemigos':p.r?`Duerme a los enemigos en radio ${p.r} del objetivo`:'Duerme al objetivo'} ${p.s}s y les inflige ${d(p.m)}.${p.drain?` Se cura un ${R0(p.drain*100)}% del daño.`:''}${p.healTeam?` Cura ${d(p.healTeam)} a sus aliados.`:''}`; break;
  case 'drain': t=`Drena ${d(p.m)} al objetivo${e} y cura ${R0(p.h*100)}% de eso ${p.ally?'al aliado con menos vida':'a sí mismo'}.`; break;
  case 'gold': t=`${p.all?'Lluvia de monedas sobre TODOS los enemigos':p.r?`Monedas en radio ${p.r}`:'Lanza monedas al objetivo'}: ${d(p.m)} de daño.`; break;
  case 'stack': t=`Golpea por ${d(p.m)} y gana PERMANENTEMENTE +${p.hp*star} de vida y +${p.ad*star} de ataque (se acumula para siempre, también al evolucionar).`; break;
  case 'splash': t='Salpica… pero no pasa nada. ¡Súbelo a 2★!'; break;
  case 'copy': t='Se transforma: copia la habilidad del enemigo más caro y la usa durante el resto del combate.'; break;
  case 'metro': t='Usa un movimiento aleatorio: desde Hiperrayo y Explosión hasta… Salpicadura.'; break;
  case 'cone': t=`Lanza un cono de ${p.len||2} casillas hacia el objetivo: ${d(p.m)} de daño a cada enemigo dentro${e}.`; break;
  case 'wave': t=`Una ola de ${R0((p.w||1.3)*2)} casillas de ancho cruza el tablero hacia el objetivo: ${d(p.m)} de daño a cada enemigo${e}${p.push?` y los empuja ${p.push} casilla hacia atrás`:''}.${p.healTeam?` Cura ${d(p.healTeam)} a sus aliados.`:''}`; break;
  case 'strike': t=`Marca el suelo bajo el objetivo y ${p.delay||.6}s después cae sobre ${p.r?`la zona (radio ${p.r})`:'esa casilla'}: ${d(p.m)} de daño a quien siga ahí${e}.`; break;
  case 'zone': t=p.ally?`Crea una zona curativa (radio ${p.r||1}) durante ${p.dur||3}s: cura ${d(p.m)} en total a los aliados que estén dentro.`:`Crea una zona (radio ${p.r||1}) ${p.self?'a su alrededor':'en el objetivo'} durante ${p.dur||3}s: ${d(p.m)} de daño en total a los enemigos dentro${p.root?`; al aparecer los enraíza ${p.root}s`:''}${p.sleep?`; al aparecer los duerme ${p.sleep}s`:''}${p.burn?'; además los quema':''}${p.chill?'; además los ralentiza':''}.`; break;
  case 'knock': t=`Golpea al objetivo por ${d(p.m)}${e} y lo lanza ${p.k||2} casillas hacia atrás.`; break;
  case 'pull': t=`Atrae a los enemigos en radio ${p.r||2} ${p.self?'hacia sí mismo':'hacia el objetivo'} y les inflige ${d(p.m)}${e}.`; break;
  case 'seed': t=`Planta una semilla en el objetivo: ${d(p.m*.25)} de daño al momento y ${d(p.m*.75)} más durante ${p.dur||4}s. Se cura el ${R0((p.h||1)*100)}% de lo que drena.`; break;
  case 'poison': t=`Envenena ${p.r?`al objetivo y a los enemigos a ${p.r} casilla`:'al objetivo'}: ${d(p.m)} de daño en ${p.dur||5}s, y mientras dure solo reciben la mitad de curación.`; break;
  case 'mark': t=`Inflige ${d(p.m)} y marca al objetivo ${p.dur||4}s: recibe un ${R0((p.amp||.25)*100)}% más de daño de todo su equipo.`; break;
  case 'spin': t=`Gira ${p.n||4} veces seguidas golpeando a los enemigos adyacentes por ${d(p.m)} cada vez. Mientras gira recibe un ${R0((p.dr||0)*100)}% menos de daño.`; break;
  case 'titan': t=`Se cubre con un escudo del ${R0((p.hp||.4)*100)}% de su vida máxima durante ${p.dur||5}s y golpea ${p.n||6} veces a los enemigos a ${p.r||1} casilla por ${d(p.m)} cada vez.${p.dr?` Mientras tanto recibe un ${R0(p.dr*100)}% menos de daño.`:''}${p.stun?` Al empezar, un terremoto aturde ${p.stun}s a los enemigos a ${(p.r||1)+1} casillas.`:''}`; break;
  case 'devour': t=`Arrastra al enemigo con menos vida a su mundo y lo inmoviliza ${p.dur||2}s: ${d(p.m)} de daño. Si lo derrota, gana +${p.ghp||40} de vida, +${p.gad||4} de ataque y +${R0((p.gad||4)*AP_PER_AD)} de poder PARA SIEMPRE.`; break;
  case 'slam': t=`Salta a la casilla con más enemigos cerca y cae golpeando a los que estén a ${p.r||1} casilla: ${d(p.m)} de daño${e}.`; break;
 }
 if(p.g) t+=` Genera ${p.g+(star-1)} de oro (máx. 12 por combate).`;
 if(p.stk) t+=` Cada uso suma +15 de vida, +2 de ataque y +3 de poder permanentes.`;
 if(p.asTeam) t+=` Sus aliados ganan un ${R0(p.asTeam*100)}% de velocidad de ataque.`;
 if(p.refundKill) t+=` Por cada enemigo que derrote recupera el ${R0(p.refundKill*100)}% de su maná: puede volver a lanzarla enseguida.`;
 if(p.markAll) t+=` Durante ${p.markDur||5}s todos los enemigos reciben un ${R0(p.markAll*100)}% más de daño.`;
 if(p.revive) t+=` Pasiva: la primera vez que cae, renace con el ${R0(p.revive*100)}% de su vida${p.nova?` y quema a los enemigos cercanos por ${d(p.nova)}`:''}.`;
 if(p.phoenix) t+=` Pasiva: el primer aliado que cae en cada combate renace con el ${R0(p.phoenix*100)}% de su vida.`;
 if(p.rebirth) t+=` Cada ${p.rebirth} lanzamientos devuelve al combate al aliado caído más valioso con el ${R0((p.phoenix||.4)*100)}% de su vida.`;
 if(p.quake) t+=` Pasiva: cada Pokémon que cae a 2 casillas o menos le da +${p.quake*star} de vida PARA SIEMPRE.`;
 if(p.tide0) t+=` Empieza el combate con la marea en ${p.tide0}/${p.n}.`;
 if(p.adExp) t+=' Hipercarry: el ataque extra (objetos, sinergias) potencia su habilidad más que proporcionalmente.';
 if(p.stunFirst) t=t.replace(/ \(aturde ([\d.]+)s/,' (aturde $1s solo al primero');
 if(p.storm) t+=` Tormenta Creciente: cada ${p.storm[0]} bajas gana +${R0(p.storm[1]*100)}% de velocidad de ataque y cada ${p.storm[2]} bajas sus ataques rebotan a un enemigo más (${R0(p.storm[3]*100)}% del daño, sin efectos de objetos), hasta el final del combate y sin límite.`;
 if(p.grow) t+=` Cada vez que la lanza, su poder crece un ${R0(p.grow*100)}% durante el resto del combate.`;
 if(p.mega) t+=` Forma Mega: cada lanzamiento le da +6% de vida máxima, +8 de poder y +8% de ataque durante el combate.`;
 if(p.selfAs&&k!=='dash') t+=` Gana +${R0(p.selfAs*100)}% de vel. de ataque (se acumula durante el combate).`;
 if(star>=3) t+=` ★★★: cada lanzamiento la hace más fuerte (+20%, o +25% en costes 4 y 5), sin límite.`;
 return t;
}

/* =============================== [ITEMS] =============================== */
const COMPS={
 claw:{name:'Garra Afilada',icon:'🗡️',s:{adPct:.10}}, wing:{name:'Pluma Veloz',icon:'🪶',s:{asPct:.10}},
 spoon:{name:'Cuchara Torcida',icon:'🥄',s:{ap:10}}, water:{name:'Agua Mística',icon:'🧪',s:{mana:15}},
 coat:{name:'Revestimiento Metálico',icon:'🔩',s:{df:20}}, goggles:{name:'Gafas Protectoras',icon:'🥽',s:{mr:20}},
 club:{name:'Hueso Grueso',icon:'🦴',s:{hp:150}}, lens:{name:'Paracontacto',icon:'🧤',s:{crit:.2}}, medal:{name:'Medalla',icon:'🏅',s:{}},
};
const BASIC=['claw','wing','spoon','water','coat','goggles','club','lens'];
const ORDER=[...BASIC,'medal'];
const rk=(a,b)=>[a,b].sort((x,y)=>ORDER.indexOf(x)-ORDER.indexOf(y)).join('+');
const FULL=[
 ['claw','claw','band','Cinta Elegida','🎗️','+45% de daño de ataque adicional.',{adPct:.45}],
 ['claw','wing','expert','Cinta Experto','🥋','+18% a todo el daño que inflige.',{dmg:.18}],
 ['claw','spoon','shellbell','Campana Concha','🐚','Se cura el 20% de todo el daño que inflige.',{omni:.2}],
 ['claw','water','mental','Hierba Mental','🧠','+5 de maná extra por ataque.',{mpa:5}],
 ['claw','coat','sash','Banda Focus','🎀','Sobrevive una vez a un golpe letal con 1 PS.',{},{focus:1}],
 ['claw','goggles','blood','Colmillo Sanguinario','🩸','Se cura el 20% del daño que inflige (30% si es cuerpo a cuerpo). Al bajar del 40% de vida gana un escudo del 25% (5s).',{omni:.2},{blood:1}],
 ['claw','club','sitrus','Baya Zidra','🍋','Al bajar del 50% de vida se cura un 35%.',{},{berry:1}],
 ['claw','lens','sharp','Garra Certera','💥','Sus habilidades pueden ser críticas. +30% de daño crítico.',{critM:.3},{abilCrit:1}],
 ['wing','wing','scarf','Pañuelo Elegido','🧣','+30% de velocidad de ataque y +1 de alcance.',{asPct:.3,range:1}],
 ['wing','spoon','rage','Cinta Furia','😤','Cada ataque le da +6% de velocidad de ataque, sin límite durante el combate.',{},{rage:.06}],
 ['wing','water','light','Bola Luminosa','💡','Cada 3 ataques lanza un rayo a 3 enemigos (70 de daño mágico).',{},{zap:70}],
 ['wing','coat','titan','Coraza Titán','🦾','Cada golpe recibido le da +2% de daño (máx. 25 veces).',{},{titan:.02}],
 ['wing','goggles','twin','Garra Doble','✌️','Sus ataques golpean a un segundo enemigo por el 50%.',{},{split:.5}],
 ['wing','club','quick','Polvo Veloz','💨','+25% de velocidad de ataque y +150 de vida adicionales.',{asPct:.25,hp:150}],
 ['wing','lens','razorfang','Colmillo Afilado','🐺','Sus críticos reducen la defensa del objetivo un 30%.',{},{shred:.3}],
 ['spoon','spoon','specs','Gafas Elegidas','👓','+45 de poder de habilidad adicional.',{ap:45}],
 ['spoon','water','moon','Piedra Lunar','🌙','Gana +3 de poder de habilidad por segundo en combate.',{},{rampAp:3}],
 ['spoon','coat','royal','Escudo Real','🔰','Empieza con un escudo del 25% de su vida máx. (8s).',{},{startShieldPct:.25}],
 ['spoon','goggles','veil','Velo Sagrado','🕊️','Al empezar, los aliados adyacentes ganan un escudo de 200.',{},{veil:200}],
 ['spoon','club','charcoal','Carbón','⚫','Sus habilidades queman: 2% de vida máx. por segundo (5s).',{},{abilBurn:.02}],
 ['spoon','lens','wise','Lente Potente','💎','Sus habilidades pueden ser críticas. +15 de poder adicional.',{ap:15},{abilCrit:1}],
 ['water','water','soothe','Campana Alivio','🛎️','Tras lanzar su habilidad recupera 20 de maná.',{},{refund:20}],
 ['water','coat','energy','Hierba Energía','🍃','Regenera +3 de maná por segundo.',{manaRegen:3}],
 ['water','goggles','holy','Agua Sagrada','⛲','Al lanzar su habilidad se cura el 12% de su vida máx.',{},{healCast:.12}],
 ['water','club','cure','Campana Cura','💗','Cada 5s cura a todo el equipo un 5% de su vida máx.',{},{aura:.05}],
 ['water','lens','justice','Cinta Justicia','⚖️','+12% de daño y se cura el 12% del daño que inflige.',{dmg:.12,omni:.12}],
 ['coat','coat','helmet','Casco Dentado','🪖','Quien le ataca recibe 30 + 3% de su vida máx. como daño mágico.',{},{thorns:30}],
 ['coat','goggles','vest','Chaleco Asalto','🦺','+30 de defensa y +30 de resistencia adicionales.',{df:30,mr:30}],
 ['coat','club','flame','Llamasfera','☄️','Quema a los enemigos adyacentes: 1.5% de su vida máx. por segundo.',{},{sunfire:.015}],
 ['coat','lens','sturdy','Chaleco Robusto','🧱','Recibe un 12% menos de daño.',{},{dr:.12}],
 ['goggles','goggles','scale','Escama Dragón','🐲','+40 de resistencia y regenera 1.5% de vida por segundo.',{mr:40,regen:.015}],
 ['goggles','club','bright','Polvo Brillo','🌟','+15% de esquiva.',{dodge:.15}],
 ['goggles','lens','whiteherb','Hierba Blanca','🌼','Inmune a aturdimientos. +10% de prob. crítica.',{crit:.1},{noStun:1}],
 ['club','club','leftovers','Restos','🍎','+300 de vida adicional y regenera 2% de vida por segundo.',{hp:300,regen:.02}],
 ['club','lens','hook','Garra Garfio','🪝','Remata a los enemigos que bajen del 12% de vida.',{},{execute:.12}],
 ['lens','lens','zoom','Guante de Boxeo','🥊','Guante ladrón: cada ronda recibe 2 objetos completos al azar (cambian al empezar la ronda). Ocupa los 3 huecos: quien lo lleva no puede llevar otros objetos. +20% de prob. crítica.',{crit:.2}],
];
const EMBLEM_OF={claw:'Coloso',wing:'Tirador',spoon:'Hechicero',water:'Agua',coat:'Guardián',goggles:'Hada',club:'Dragón',lens:'Asesino'};
// Sinergias afines de cada componente (la primera es la de siempre): al forjar Medalla + componente se elige entre ellas
// Insignias que se craftean: Medalla + componente → siempre la misma sinergia (como las recetas de emblemas de TFT).
// Las demás sinergias no se craftean: sus emblemas solo salen de aumentos y recompensas.
const FORGE_OF={claw:['Coloso'],wing:['Tirador'],spoon:['Hechicero'],water:['Agua'],coat:['Guardián'],goggles:['Hada'],club:['Dragón'],lens:['Asesino']};
// Estadísticas de cada emblema (además de su sinergia), al estilo de los emblemas de TFT
const EMBLEM_STATS={Fuego:{adPct:.15,ap:15},Agua:{hp:150,mana:15},Planta:{hp:250},'Eléctrico':{asPct:.2},'Psíquico':{ap:25},Roca:{df:25,mr:25},'Dragón':{hp:200,adPct:.1},
 Fantasma:{hp:150,crit:.15},Hada:{hp:200,ap:10},Normal:{hp:250},Acero:{df:30,hp:100},Siniestro:{crit:.2,critM:.1},Lucha:{adPct:.2,hp:100},
 'Guardián':{df:30,mr:30},Coloso:{hp:300},Peleador:{hp:250,adPct:.1},Tirador:{asPct:.2},Hechicero:{ap:25},Asesino:{crit:.2,critM:.15},Sanador:{mana:20,mr:20},
 Cazatesoros:{hp:150,crit:.1},Depredadores:{adPct:.15,omni:.08},'Team Rocket':{asPct:.15,df:15},'Potencial Evolutivo':{hp:200}};
const STAT_TXT={adPct:v=>`+${R0(v*100)}% daño de ataque`,asPct:v=>`+${R0(v*100)}% vel. de ataque`,ap:v=>`+${v} poder`,mana:v=>`+${v} maná inicial`,df:v=>`+${v} defensa`,mr:v=>`+${v} resistencia`,hp:v=>`+${v} vida`,crit:v=>`+${R0(v*100)}% prob. crítica`,critM:v=>`+${R0(v*100)}% daño crítico`,dmg:v=>`+${R0(v*100)}% daño`,omni:v=>`+${R0(v*100)}% robo de vida`,mpa:v=>`+${v} maná por ataque`,manaRegen:v=>`+${v} maná/s`,regen:v=>`+${(v*100).toFixed(1)}% vida/s`,dodge:v=>`+${R0(v*100)}% esquiva`,range:v=>`+${v} alcance`};
const sumStats=(...ss)=>{ const o={}; for(const s of ss) for(const k in s) o[k]=(o[k]||0)+s[k]; return o; };
const ITEMS={}, RECIPE={};
for(const k of ORDER) ITEMS[k]={...COMPS[k],key:k,comp:true,sp:{},desc:k==='medal'?'Combínala con un componente para forjar su Insignia (cada componente graba siempre la misma sinergia), o con otra Medalla para una Medalla Maestra. Los emblemas desbloquean el nivel prismático de las sinergias.':'Componente. Combínalo con otro para crear un objeto.'};
for(const [a,b,id,name,icon,desc,s,sp] of FULL){ ITEMS[id]={key:id,name,icon,desc,s:sumStats(COMPS[a].s,COMPS[b].s,s||{}),sp:sp||{},from:[a,b]}; RECIPE[rk(a,b)]=id; }
// Cada insignia lleva el arte de una medalla de gimnasio afín a su sinergia (número de sprite en PokeAPI)
const BADGE_OF={claw:[18,'Puño'],wing:[22,'Pluma'],spoon:[6,'Pantano'],water:[2,'Cascada'],coat:[1,'Roca'],goggles:[4,'Arcoíris'],club:[16,'Dragón'],lens:[5,'Alma']};
for(const c of BASIC){ const t=FORGE_OF[c][0], id='em_'+c; ITEMS[id]={key:id,name:'Insignia '+t,icon:TRAITS[t].icon,badge:BADGE_OF[c][0],desc:`Medalla ${BADGE_OF[c][1]}. El portador gana la sinergia ${t}.`,s:{...EMBLEM_STATS[t]},sp:{},emblem:t,from:[c,'medal'],forge:c}; RECIPE[rk(c,'medal')]=id; }
// Herramienta: no se equipa; devuelve al inventario todos los objetos de un Pokémon (es la única forma de quitarlos)
ITEMS.magnet={key:'magnet',name:'Imán Removedor',icon:'🧲',desc:'Arrástralo sobre un Pokémon: todos sus objetos vuelven a tu inventario. Se gasta al usarlo. Recibes uno en cada fase contra Pokémon salvajes.',s:{},sp:{},tool:true};
// Emblema de cada sinergia: el Pokémon que lo lleve cuenta para ella (sin contar dos veces el mismo rasgo)
const CRAFTABLE_EMB=new Set(Object.values(FORGE_OF).map(l=>l[0]));
for(const t in TRAITS) if(t!=='Legendario') ITEMS['emb_'+t]={key:'emb_'+t,name:'Emblema '+t,icon:TRAITS[t].icon,desc:`El portador gana la sinergia ${t}. No se combina.${CRAFTABLE_EMB.has(t)?'':' Este emblema no se craftea: solo sale de aumentos y recompensas.'}`,s:{...(EMBLEM_STATS[t]||{})},sp:{},emblem:t};
// Duplicadores: se sueltan sobre un Pokémon y te dan otra copia suya (se crea aunque no quede en el pool)
ITEMS.dup_menor={key:'dup_menor',name:'Duplicador menor',icon:'🧬',desc:'Suéltalo sobre un Pokémon de coste 1 a 3: recibes otra copia suya. Se gasta al usarlo.',s:{},sp:{},tool:true,dup:3};
ITEMS.dup_mayor={key:'dup_mayor',name:'Duplicador',icon:'🧪',desc:'Suéltalo sobre cualquier Pokémon (coste 1 a 5): recibes otra copia suya. Se gasta al usarlo.',s:{},sp:{},tool:true,dup:5};
ITEMS.master={key:'master',name:'Medalla Maestra',icon:'🏆',desc:'+1 espacio en el tablero mientras la lleve un Pokémon colocado en el tablero.',s:{},sp:{teamsize:1},from:['medal','medal']}; RECIPE['medal+medal']='master';
const FULL_KEYS=FULL.map(f=>f[2]);
// Radiantes: versión de cada objeto completo con el doble de estadísticas y de efecto (no tienen receta)
const RADIANT_KEYS=FULL_KEYS.map(k=>{ const I=ITEMS[k], id='rad_'+k, dbl=o=>Object.fromEntries(Object.entries(o).map(([a,v])=>[a,typeof v==='number'?v*2:v]));
 ITEMS[id]={key:id,name:I.name+' radiante',icon:I.icon,desc:`Versión radiante: el doble de estadísticas y de efecto. ${I.desc}`,s:dbl(I.s),sp:dbl(I.sp),radiant:true,base:k}; return id; });
const statLine=s=>Object.entries(s).map(([k,v])=>STAT_TXT[k]?STAT_TXT[k](v):'').filter(Boolean).join(' · ');
const combineKey=(a,b)=>RECIPE[rk(a,b)];

/* =============================== [CORE] =============================== */
let G=null, UID=1;
let S={name:'Tú',avatar:'🧢',trainer:'red',speed:1,timer:30,theme:'dark',vol:.5,muted:false,diff:'normal'};
const defaultMods=()=>({income:0,maxInterest:5,winStreakMult:1,lossStreakMult:1,lossBonus:0,xpRound:0,xpBuy:0,freeRerolls:0,hpPct:0,adPct:0,ap:0,asPct:0,def:0,mr:0,allFocus:false,extraTrait:{},winGold:0,winHeal:0,boardBonus:0,eeveeKills:3,legend:0,xpCost:4,oddsSave:0,cheapCombine:0});
function makePlayer(id,name,isBot,emoji,tr){
 return {id,name,isBot,emoji,tr:TRAINER_BY[tr]?tr:'',hp:100,gold:0,level:1,xp:0,bench:Array(BENCH).fill(null),board:{},shop:[null,null,null,null,null],locked:false,
   streak:0,augments:[],augSt:{},picks:[],mods:defaultMods(),items:[],orbs:[],tac:pick(FREE_TACS),tacForm:['',''],alive:true,place:0,lastOpp:-1,met:[],oppRound:{},ghosts:0,po:null,history:[],freeRerolls:0,lastDmg:0,remote:false,peer:'',ready:false,log:[],toasts:[],tseq:0};
}
// stk: lo ganado para siempre (vida, ataque y poder). Los escalados infinitos dan ataque y poder a la par para que sirvan a cualquier ficha
const AP_PER_AD=1.5;
const makeInst=key=>({uid:UID++,defId:key,baseId:DEF[key].evoOf||key,star:1,kills:0,items:[],stk:{hp:0,ad:0,ap:0}});
const boardUnits=p=>Object.values(p.board);
const allUnits=p=>[...boardUnits(p),...p.bench.filter(Boolean)];
const maxBoard=p=>p.mods.soloLevel?1:p.level+p.mods.boardBonus+boardUnits(p).reduce((s,u)=>s+u.items.filter(i=>i==='master').length,0);
const alivePlayers=()=>G.players.filter(p=>p.alive);
const unitTraits=u=>{ const t=DEF[u.defId].traits.slice(); for(const i of u.items){ const e=ITEMS[i]&&ITEMS[i].emblem; if(e&&!t.includes(e)) t.push(e); } return t; };
const threeStarSet=p=>new Set(allUnits(p).filter(u=>u.star>=3).map(u=>u.baseId));
const isHuman=p=>!p.isBot;

function returnToPool(key,n){ if(G.pool&&key in G.pool) G.pool[key]+=n; }
function rollCost(level){ const o=SHOP_ODDS[level]; let r=Math.random()*100; for(let i=0;i<5;i++){ r-=o[i]; if(r<0) return i+1; } return 1; }
function drawUnitOfCost(cost,excl){
 const order=[1,2,3,4,5].sort((a,b)=>Math.abs(a-cost)-Math.abs(b-cost));
 for(const c of order){
   const cands=UNIT_LIST.filter(u=>u.cost===c&&G.pool[u.key]>0&&!(excl&&excl.has(u.key))); if(!cands.length) continue;
   const tot=cands.reduce((s,u)=>s+G.pool[u.key],0); let r=Math.random()*tot;
   for(const u of cands){ r-=G.pool[u.key]; if(r<=0){ G.pool[u.key]--; return u.key; } }
   const u=cands[cands.length-1]; G.pool[u.key]--; return u.key;
 }
 return null;
}
function refreshShop(p){ for(const k of p.shop) if(k) returnToPool(k,1); const ex=threeStarSet(p), lv=Math.min(10,p.level+(p.mods.oddsSave&&p.gold>=p.mods.oddsSave?1:0)); p.shop=[0,0,0,0,0].map(()=>drawUnitOfCost(rollCost(lv),ex)); }
function income(p,idx){
 const base=idx<BASE_INCOME.length?BASE_INCOME[idx]:5;
 const interest=Math.min(p.mods.maxInterest,Math.floor(p.gold/10));
 const s=Math.abs(p.streak); let st=s>=5?3:s>=4?2:s>=2?1:0;
 if(st){ if(p.streak>0) st*=p.mods.winStreakMult; else st=st*p.mods.lossStreakMult+p.mods.lossBonus; }
 return {base,interest,streak:st,bonus:p.mods.income,total:base+interest+st+p.mods.income};
}
function addXp(p,n){ const l0=p.level; p.xp+=n; while(p.level<10&&p.xp>=XP_NEED[p.level]){ p.xp-=XP_NEED[p.level]; p.level++; } if(p.level>=10) p.xp=0; if(p.level>l0){ augFire(p,'levelUp',{level:p.level}); tacOffer(p); } }
// Minileyenda Eevee: al subir a 6 y a 8 se ofrece elegir su evolución (los rivales eligen solos)
function tacOffer(p){ const t=TACS[p.tac]; if(!t||!t.pick) return; p.tacOff=p.tacOff||[0,0];
 for(let st=1;st<=2;st++){ if(tacStage(p)<st||p.tacOff[st-1]||(p.tacForm&&p.tacForm[st-1])) continue; if(!p.isBot&&!G.auto) continue; p.tacOff[st-1]=1;
   augOffer(p,'__tac',st===1?'🌀 Tu Eevee evoluciona':'🌀 Tu Eevee vuelve a evolucionar','Elige la forma de tu minileyenda.',t.pick[st-1].map(k=>({t:DEF[k].name,i:'🌀',d:DEF[k].traits.join(' · '),v:'te:'+st+'|'+k}))); } }
const xpCost=p=>p.mods.xpCost||4;
const xpByHp=p=>!!(p.mods.xpHp&&p.hp>20);
function buyXp(p){ if(p.level<10&&xpByHp(p)){ p.hp-=p.mods.xpHp; addXp(p,4+p.mods.xpBuy); return true; } if(p.level>=10||p.gold<xpCost(p)) return false; p.gold-=xpCost(p); addXp(p,4+p.mods.xpBuy); return true; }
function reroll(p){ const free=p.freeRerolls>0; if(free) p.freeRerolls--; else { if(p.gold<2) return false; p.gold-=2; } refreshShop(p); augFire(p,'reroll',{free}); return true; }
function countSame(p,base,star){ return allUnits(p).filter(u=>u.baseId===base&&u.star===star).length; }
// Ronda 1-1: se juega con el Pokémon que te tocó (no se compra ni se vende)
const firstRound=()=>!!G&&G.roundIdx===0;
function canBuy(p,i){
 if(firstRound()) return false; const k=p.shop[i]; if(!k||!DEF[k]) return false; const d=DEF[k]; if(p.gold<d.cost) return false;
 if(p.bench.some(x=>!x)) return true;
 return p.bench.filter(u=>u&&u.baseId===k&&u.star===1).length+(G.phase!=='combat'?boardUnits(p).filter(u=>u.baseId===k&&u.star===1).length:0)>=2;
}
function buy(p,i){ if(!canBuy(p,i)) return false; const k=p.shop[i]; p.gold-=DEF[k].cost; p.shop[i]=null; augFire(p,'buy',{key:k,cost:DEF[k].cost}); addUnitToBench(p,makeInst(k)); return true; }
function addUnitToBench(p,inst){
 const dup=allUnits(p).some(u=>u.baseId===inst.baseId);
 augFire(p,'gain',{key:inst.baseId,dup});
 const idx=p.bench.findIndex(x=>!x);
 if(idx>=0){ p.bench[idx]=inst; combine(p); return true; }
 p.bench.push(inst); combine(p);
 if(p.bench.length>BENCH){
   const extra=p.bench.splice(BENCH);
   for(const e of extra) if(e){ const j=p.bench.findIndex(x=>!x); if(j>=0) p.bench[j]=e; else { p.gold+=sellValue(e); returnToPool(e.baseId,Math.pow(3,e.star-1)); } }
 }
 return true;
}
// Yunque al banquillo; si no cabe (o es un bot), se abre al momento
function giveAnvil(p,kind){ const key=kind==='f'?'yunque_oro':'yunque'; if(!p.isBot&&p.bench.some(x=>!x)){ addUnitToBench(p,makeInst(key)); return 'un '+DEF[key].name; } openAnvil(p,kind); return DEF[key].name+' (abierto)'; }
function openAnvil(p,kind){ const pool=kind==='f'?FULL_KEYS.slice():BASIC.slice(), opts=shuffle(pool.slice()).slice(0,6).map(k=>({t:ITEMS[k].name,i:ITEMS[k].icon,d:ITEMS[k].desc,v:'it:'+k}));
 if(p.isBot){ giveItem(p,opts[0].v.slice(3),true); return; } augOffer(p,'__anvil',kind==='f'?'⚒️ Yunque de objetos':'⚒️ Yunque de componentes','Elige uno',opts); }
function giveUnitTo(p,key){
 if(!key) return false;
 if(p.bench.some(x=>!x)||p.bench.filter(u=>u&&u.baseId===key&&u.star===1).length>=2){ addUnitToBench(p,makeInst(key)); return true; }
 // Banquillo lleno (carrusel, aumentos…): va al tablero aunque se pase del máximo (el contador sale en rojo, n+1/n); si al empezar el combate sigue sobrando, se vende uno al azar (sellOverflow)
 if(!p.isBot&&G.phase!=='combat'){ const k=freeBoardCell(p,DEF[key]); if(k){ augFire(p,'gain',{key,dup:allUnits(p).some(u=>u.baseId===key)}); p.board[k]=makeInst(key); combine(p); note(p,`Banquillo lleno: ${DEF[key].name} va al tablero. Si sobra al empezar el combate se venderá uno al azar`,true); return true; } }
 p.gold+=DEF[key].cost; returnToPool(key,1); note(p,`Banquillo lleno: ${DEF[key].name} se convirtió en oro`); return false;
}
// Casilla libre de tu mitad del tablero (tanques y luchadores delante), en el mismo orden que autoFill
function freeBoardCell(p,d){ const C=[3,2,4,1,5,0,6], rows=['t','b'].includes(d.role)?[0,1,2,3]:[3,2,1,0]; for(const r of rows) for(const c of C) if(!p.board[c+','+r]) return c+','+r; return null; }
// Al empezar el combate el tablero no puede pasar del máximo: se venden fichas al azar (su valor en oro y sus objetos al inventario)
function sellOverflow(p){
 const out=[]; let extra=boardUnits(p).length-maxBoard(p);
 while(extra-->0){ const ks=Object.keys(p.board).filter(k=>p.board[k]); if(!ks.length) break; const k=pick(ks), u=p.board[k], g=sellValue(u);
   p.gold+=g; returnToPool(u.baseId,Math.pow(3,u.star-1)); augFire(p,'sell',{key:u.baseId,star:u.star,cost:DEF[u.defId].cost}); for(const it of u.items) giveItem(p,it); delete p.board[k]; out.push(`${DEF[u.defId].name} (+${g} de oro)`); }
 if(out.length) note(p,`Tablero lleno: se vendió ${out.join(', ')}`,true);
 return out.length;
}
// force: entra aunque el inventario esté lleno (hasta ITEMS_HARD); lo usan los aumentos cuyo efecto depende de tener ese objeto
function giveItem(p,it,raw,force){ it=it||pick(BASIC); if(!raw&&p.mods&&p.mods.anvilBuffet&&ITEMS[it]&&ITEMS[it].comp&&it!=='medal'){ giveAnvil(p,'c'); return it; } if(p.items.length<(force?ITEMS_HARD:MAX_ITEMS_BENCH)) p.items.push(it); else { p.gold+=2; note(p,'Inventario lleno: objeto convertido en 2 de oro'); } return it; }
// Guante de Boxeo: objetos que da esta ronda (u.tg). Con Guantes de la Suerte (mods.luckyGloves), los ideales para su rol
const GLOVE_BIS={r:['band','rage','sharp','expert','razorfang','twin'],a:['band','blood','sharp','hook','justice','expert'],b:['blood','titan','sturdy','band','quick','justice'],
 m:['moon','specs','wise','soothe','energy','expert'],h:['moon','soothe','energy','cure','holy','specs'],t:['vest','leftovers','helmet','scale','royal','sturdy']};
const glovePool=()=>FULL_KEYS.filter(k=>ITEMS[k]&&!ITEMS[k].emblem&&!ITEMS[k].forge&&!ITEMS[k].tool&&!['zoom','master','magnet'].includes(k));
const GLOVES=['zoom','rad_zoom'];
function rollGloves(p,u,force){ const g=u.items.find(k=>GLOVES.includes(k)); if(!g){ if(u.tg) delete u.tg; return; } if(u.tg&&!force) return;
 let pool=p&&p.mods&&p.mods.luckyGloves?(GLOVE_BIS[DEF[u.defId].role]||[]).filter(k=>ITEMS[k]):glovePool(); if(g==='rad_zoom') pool=pool.map(k=>'rad_'+k).filter(k=>ITEMS[k]);
 const a=shuffle(pool.slice()); u.tg=a.slice(0,2); }
const ensureGloves=(p,force)=>{ for(const u of allUnits(p)) rollGloves(p,u,force); };
function addItemToUnit(u,k){
 const I=ITEMS[k]; if(!I) return {ok:false,why:'Objeto no válido'};
 if(I.tool) return {ok:false,why:'Eso no se equipa'};
 // Guante de Boxeo (guante ladrón): ocupa los 3 huecos
 if(u.items.some(x=>GLOVES.includes(x))) return {ok:false,why:'El Guante de Boxeo ocupa todos los huecos'};
 if(GLOVES.includes(k)&&u.items.length) return {ok:false,why:'Quítale antes sus otros objetos'};
 if(I.comp&&k==='lens'&&u.items.length>1&&u.items.includes('lens')) return {ok:false,why:'El Guante de Boxeo ocupa todos los huecos: quítale antes sus otros objetos'};
 if(I.comp){ const j=u.items.findIndex(x=>ITEMS[x].comp); if(j>=0){ const res=combineKey(u.items[j],k); const em=ITEMS[res].emblem; if(em&&DEF[u.defId].traits.includes(em)) return {ok:false,why:`Ya es ${em}`}; u.items[j]=res; return {ok:true,made:res}; } }
 if(u.items.length>=3) return {ok:false,why:'Ya lleva 3 objetos'};
 if(I.emblem&&unitTraits(u).includes(I.emblem)) return {ok:false,why:`Ya es ${I.emblem}`};
 u.items.push(k); return {ok:true};
}
// Dos componentes del inventario se combinan en un objeto completo (se queda en el sitio del segundo)
const benchCombo=(p,a,b)=>{ const x=p.items[a], y=p.items[b]; return a!==b&&x&&y&&ITEMS[x].comp&&ITEMS[y].comp?combineKey(x,y):null; };
function combineBench(p,a,b){ const res=benchCombo(p,a,b); if(!res) return {ok:false,why:'Solo se combinan dos componentes'}; p.items[b]=res; p.items.splice(a,1); forgeOffer(p,res,null); return {ok:true,made:res}; }
// Forja: al crear una insignia (Medalla + componente) se elige qué sinergia graba entre 3 afines al componente
// La forja ya no pide elegir: cada receta graba siempre su sinergia (se deja la función por compatibilidad)
function forgeOffer(p,made,u){
 return;
 const I=ITEMS[made]; if(!I||!I.forge||(typeof NET!=='undefined'&&NET.mode==='client')) return;
 const own=u?DEF[u.defId].traits:[];
 const opts=FORGE_OF[I.forge].map((t,j)=>({t:'Insignia '+t,i:TRAITS[t].icon,d:TRAITS[t].sum,v:'fg:em_'+I.forge+(j?'_'+j:'')})).filter(o=>!own.includes(ITEMS[o.v.slice(3)].emblem));
 if(opts.length>1) augOffer(p,'__forge','⚒️ Forja de Insignias','Elige qué sinergia graba la Medalla',opts);
}
function useItem(p,idx,u,loc){
 const r=useItem0(p,idx,u,loc); if(r.ok){ if(r.made) forgeOffer(p,r.made,u); liveItems(p,u); } return r;
}
// Si el Pokémon está combatiendo, sus objetos nuevos cuentan ya en ese combate.
// En solitario se cambia el combate en vivo. En multijugador el servidor apunta un evento (tiempo, lado, casilla, objetos),
// vuelve a calcular el combate con él y lo envía: cada cliente lo aplica en el mismo instante del combate (determinista).
function applyLiveItems(cb,side,bk,items){
 const cu=cb.units.find(x=>x.side===side&&x.bk===bk&&!x.dead); if(!cu) return false;
 const sum=list=>sumStats(...list.map(i=>ITEMS[i]?ITEMS[i].s:{}));
 const a=sum(cu.items), b=sum(items), dlt={}; for(const k of new Set([...Object.keys(a),...Object.keys(b)])) dlt[k]=(b[k]||0)-(a[k]||0);
 const hp0=cu.maxHp; applyStats(cu,dlt); cu.hp=Math.max(1,cu.hp+(cu.maxHp-hp0)); cu.sp={}; for(const i of items) for(const k in (ITEMS[i]||{}).sp||{}) cu.sp[k]=(cu.sp[k]||0)+ITEMS[i].sp[k];
 if(cu.sp.focus) cu.focus=true; if(cu.sp.berry) cu.berry=true; cu.items=items.slice(); cu.as=Math.min(3,cu.as); fxText(cb,cu,'⚒️','#ffd75e'); return true;
}
// Avanza un paso aplicando antes los eventos de objetos que ya tocan
function stepWithEv(cb){ if(cb.evq&&cb.evq.length){ while(cb.evq.length&&cb.t>=cb.evq[0].t-1e-9){ const e=cb.evq.shift(); applyLiveItems(cb,e.side,e.bk,e.items); } } stepCombat(cb); }
let NO_PERMA=false; // al recalcular un combate no se repiten las mejoras permanentes (Eevee, oro generado)
function resimFight(f,R){
 NO_PERMA=true; try{ const cb=createCombatSnap(f.sa,f.sb,R,{seed:f.seed,visual:false,refsA:f.a.board,refsB:f.ghost||!f.b?null:f.b.board}); cb.evq=(f.ev||[]).slice().sort((x,y)=>x.t-y.t); let g=0; while(!cb.done&&g++<2000) stepWithEv(cb); cb.done=true; return cb; } finally{ NO_PERMA=false; }
}
// Reconstruye un combate visual con sus eventos hasta el instante t (para clientes que van por delante o espectadores)
function rebuildCombat(a,b,R,seed,evs,t){
 const cb=createCombatSnap(a,b,R,{seed,visual:true}); cb.evq=(evs||[]).slice().sort((x,y)=>x.t-y.t); let g=0; while(!cb.done&&cb.t<t-1e-6&&g++<2000) stepWithEv(cb); cb.fx=[]; return cb;
}
function liveItems(p,inst){
 if(G.phase!=='combat') return;
 const f=(G.fights||[]).find(x=>x.a===p||(x.b===p&&!x.ghost)); if(!f||!f.c) return;
 const side=f.a===p?0:1, bk=Object.keys(p.board).find(k=>p.board[k]===inst); if(!bk) return;
 if(!G.mp){ if(!f.c.done) applyLiveItems(f.c,side,bk,inst.items.slice()); return; }
 const t=Math.max(0,Math.ceil(((Date.now()-f.t0)/1000*G.speed)/DT)*DT), ev={t,side,bk,items:inst.items.slice()};
 (f.ev=f.ev||[]).push(ev); f.c=resimFight(f,G.round);
 G.resolveNotBefore=Math.max(G.resolveNotBefore||0,f.t0+f.c.t/G.speed*1000+5000+END_T*1000);
 if(NET.named) NET.named.emit('cmbev',{seed:f.seed,ev}).catch(()=>{});
}
function useItem0(p,idx,u,loc){
 const it=p.items[idx]; if(!it||!u) return {ok:false};
 if(ITEMS[it]&&ITEMS[it].dup){ const d=DEF[u.defId];
   if(d.anvil) return {ok:false,why:'Eso no se puede duplicar'}; if(d.cost>ITEMS[it].dup) return {ok:false,why:`El ${ITEMS[it].name} solo copia Pokémon de coste 1 a ${ITEMS[it].dup}`};
   if(!p.bench.some(x=>!x)&&countSame(p,u.baseId,1)<2) return {ok:false,why:'No te cabe la copia en el banquillo'};
   p.items.splice(idx,1); addUnitToBench(p,makeInst(u.baseId)); combine(p); note(p,`🧬 Copia de ${DEF[u.baseId].name}`,true); return {ok:true,removed:true}; }
 if(it==='magnet'){
   if(!u.items.length) return {ok:false,why:'Ese Pokémon no lleva objetos'};
   if(p.items.length-1+u.items.length>MAX_ITEMS_BENCH) return {ok:false,why:'No caben sus objetos en tu inventario'};
   p.items.splice(idx,1); p.items.push(...u.items); u.items=[]; return {ok:true,removed:true};
 }
 const r=addItemToUnit(u,it); if(r.ok) p.items.splice(idx,1); return r;
}
function removeItem(p,u,idx){
 if(!u.items[idx]) return {ok:false,why:'No hay objeto ahí'};
 if(p.items.length>=MAX_ITEMS_BENCH) return {ok:false,why:`Tu inventario está lleno (${MAX_ITEMS_BENCH} objetos)`};
 const loc=findLoc(p,u); if(G.phase==='combat'&&loc&&loc.b!==undefined) return {ok:false,why:'No puedes quitar objetos en pleno combate'};
 p.items.push(u.items.splice(idx,1)[0]); return {ok:true};
}
function getAt(p,loc){ return loc.b!==undefined?p.board[loc.b]:p.bench[loc.i]; }
function setAt(p,loc,u){ if(loc.b!==undefined){ if(u) p.board[loc.b]=u; else delete p.board[loc.b]; } else p.bench[loc.i]=u||null; }
function findLoc(p,inst){ if(!inst) return null; for(const k in p.board) if(p.board[k]===inst) return {b:k}; const i=p.bench.indexOf(inst); return i>=0?{i}:null; }
function combine(p){
 const boardOk=G.phase!=='combat'; let changed=true, guard=0;
 while(changed&&guard++<20){
   changed=false; const groups={};
   const add=(u,loc)=>{ if(DEF[u.defId].anvil) return; const g=u.baseId+'|'+u.star; (groups[g]=groups[g]||[]).push({u,loc}); };
   if(boardOk) for(const k in p.board) add(p.board[k],{b:k});
   p.bench.forEach((u,i)=>u&&add(u,{i}));
   for(const g in groups){
     const arr=groups[g], need=p.mods.cheapCombine&&DEF[arr[0].u.baseId].cost===1?2:3; if(arr.length<need||arr[0].u.star>=3) continue;
     const three=arr.slice(0,need), keep=three[0], evolved=three.find(x=>DEF[x.u.defId].evoOf);
     const before=nameOf(DEF[keep.u.defId],keep.u.star);
     keep.u.star++; if(evolved) keep.u.defId=evolved.u.defId;
     for(const o of three.slice(1)){
       // Los aumentos que siguen a un Pokémon concreto (p. ej. «Pokémon favorito») pasan a la copia que queda
       for(const st of Object.values(p.augSt||{})) if(st&&st.uid===o.u.uid) st.uid=keep.u.uid;
       keep.u.kills+=o.u.kills; keep.u.goldGen=(keep.u.goldGen||0)+(o.u.goldGen||0); keep.u.stk.hp+=o.u.stk.hp; keep.u.stk.ad+=o.u.stk.ad; keep.u.stk.ap=(keep.u.stk.ap||0)+(o.u.stk.ap||0);
       for(const it of o.u.items){ const r=addItemToUnit(keep.u,it); if(!r.ok) giveItem(p,it); }
       setAt(p,o.loc,null);
     }
     const after=nameOf(DEF[keep.u.defId],keep.u.star);
     if(keep.u.star>=3){ for(let i=0;i<5;i++) if(p.shop[i]===keep.u.baseId){ returnToPool(p.shop[i],1); p.shop[i]=null; } }
     note(p,before!==after?`✨ ¡${before} evolucionó en ${after}! Nueva habilidad: ${abOf(DEF[keep.u.defId],keep.u.star)[1]}`:`⭐ ${after} sube a ${keep.u.star} estrellas`,true);
     // Aviso para la lista de jugadores: foto del Pokémon y estrellas a las que sube
     p.upSeq=(p.upSeq||0)+1; p.lastUp=[dexOf(DEF[keep.u.defId],keep.u.star),keep.u.star,p.upSeq];
     augFire(p,'starUp',{key:keep.u.baseId,star:keep.u.star});
     changed=true; break;
   }
 }
}
function sellValue(u){ const c=DEF[u.defId].cost; return u.star===1?c:c*Math.pow(3,u.star-1)-(c>1?1:0); }
function sellAt(p,loc){
 const u=getAt(p,loc); if(!u||firstRound()) return false;
 if(loc.b!==undefined&&G.phase==='combat') return false;
 if(DEF[u.defId].anvil){ setAt(p,loc,null); openAnvil(p,DEF[u.defId].anvil); return true; }
 if(u.locked&&p.mods.noPivot){ note(p,'NO SCOUT NO PIVOT: este Pokémon no se puede vender',true); return false; }
 p.gold+=sellValue(u); returnToPool(u.baseId,Math.pow(3,u.star-1)); augFire(p,'sell',{key:u.baseId,star:u.star,cost:DEF[u.defId].cost});
 for(const it of u.items) giveItem(p,it);
 setAt(p,loc,null); return true;
}
function moveTo(p,from,to){
 const same=(from.b!==undefined&&from.b===to.b)||(from.i!==undefined&&from.i===to.i); if(same) return false;
 const a=getAt(p,from), b=getAt(p,to); if(!a) return false;
 if(to.b!==undefined&&DEF[a.defId].anvil){ note(p,'El yunque no pelea: véndelo para elegir tu objeto',true); return false; }
 if(from.b!==undefined&&b&&DEF[b.defId].anvil) return false;
 if(p.mods.noPivot&&from.b!==undefined&&to.b===undefined&&a.locked){ note(p,'NO SCOUT NO PIVOT: este Pokémon ya no sale del tablero',true); return false; }
 if(to.b!==undefined&&from.b===undefined&&!b&&boardUnits(p).length>=maxBoard(p)){ note(p,'Tablero lleno: sube de nivel para colocar más Pokémon',true); return false; }
 setAt(p,from,b); setAt(p,to,a); return true;
}
function traitCountsOf(units,extra){
 const seen=new Set(), c={};
 for(const u of units){
   const d=DEF[u.defId];
   if(!seen.has(u.defId)){ seen.add(u.defId); for(const t of d.traits) c[t]=(c[t]||0)+1; }
   for(const i of u.items){ const e=ITEMS[i]&&ITEMS[i].emblem; if(e&&!d.traits.includes(e)) c[e]=(c[e]||0)+1; }
 }
 if(extra) for(const t in extra) if(TRAITS[t]) c[t]=(c[t]||0)+extra[t];
 return c;
}
const traitCounts=p=>traitCountsOf(boardUnits(p),p.mods.extraTrait);
// Emblemas que cuentan para cada sinergia (un Pokémon que ya la tiene de serie no suma)
function emblemCountsOf(units){ const e={}; for(const u of units){ const d=DEF[u.defId]; for(const i of u.items){ const t=ITEMS[i]&&ITEMS[i].emblem; if(t&&!d.traits.includes(t)) e[t]=(e[t]||0)+1; } } return e; }
const tierOf=(t,n,e)=>{ const Tr=TRAITS[t]; let k=Tr.bp.filter(b=>n>=b).length; if(k===Tr.bp.length&&Tr.pr&&e>0&&n>=Tr.pr[0]) k++; return k; };
// Tt.nl (no enumerable): niveles contando solo a los no legendarios, para la resonancia (unos legendarios no activan la de otros)
const resTierOf=(t,n,e)=>{ const Tr=TRAITS[t]; if(!Tr||!Tr.rbp) return tierOf(t,n,e); let k=Tr.rbp.filter(b=>n>=b).length; if(k===Tr.rbp.length&&Tr.pr&&e>0&&n>=Tr.pr[0]) k++; return k; };
function traitTiers(p){ const bu=boardUnits(p), c=traitCounts(p), e=emblemCountsOf(bu), Tt={}; for(const t in c) Tt[t]=tierOf(t,c[t],e[t]||0);
 const nu=bu.filter(u=>!DEF[u.defId].traits.includes('Legendario')), cn=traitCountsOf(nu,p.mods.extraTrait), en=emblemCountsOf(nu), nl={}; for(const t in cn) nl[t]=resTierOf(t,cn[t],en[t]||0);
 Object.defineProperty(Tt,'nl',{value:nl,enumerable:false}); return Tt; }
function topTrait(p){ const c=traitCountsOf(allUnits(p)); delete c['Legendario']; const e=Object.entries(c).sort((a,b)=>b[1]-a[1]); return e.length?e[0][0]:null; }
function pushLog(p,msg,t){ p.log.unshift(msg); p.log.length=Math.min(p.log.length,12); if(t){ p.tseq++; p.toasts=p.toasts.concat([[p.tseq,msg]]).slice(-4); } }
function note(p,msg,toastIt){
 if(!G) return;
 if(!p||p===G.me){ G.log.unshift(msg); G.log.length=Math.min(G.log.length,40); if(toastIt&&(!p||p===G.me)) toast(msg); }
 if(!p){ for(const q of G.players||[]) if(q.remote) pushLog(q,msg,false); }
 else if(p.remote) pushLog(p,msg,toastIt);
}

/* ============================== [COMBAT] ============================== */
const DT=0.05, COMBAT_T=40, PREP_T=3, END_T=3; // duración máxima del combate (luego empate), preparación antes de pelear (las fichas se dan la vuelta hacia el rival) y finalización: segundos de más tras acabar el último combate antes de volver a tu tablero, para ver qué pasó
const PLAN_T=30, AUG_T=45; // tiempos fijos (no se configuran): planificación de cada ronda y elección de aumento
function hexDist(c1,r1,c2,r2){ const x1=c1-(r1-(r1&1))/2, x2=c2-(r2-(r2&1))/2; const y1=-x1-r1,y2=-x2-r2; return Math.max(Math.abs(x1-x2),Math.abs(y1-y2),Math.abs(r1-r2)); }
const dU=(a,b)=>hexDist(a.c,a.r,b.c,b.r);
function neighbors(c,r){ const d=(r&1)?[[1,0],[-1,0],[1,-1],[0,-1],[1,1],[0,1]]:[[1,0],[-1,0],[0,-1],[-1,-1],[0,1],[-1,1]]; return d.map(([dc,dr])=>[c+dc,r+dr]).filter(([a,b])=>a>=0&&a<7&&b>=0&&b<8); }
const toGrid=(side,c,r)=>side===0?[c,4+r]:[6-c,3-r];
const pickR=(cb,a)=>a[Math.floor(cb.rng()*a.length)];

const LEG_RES=[.92,1,1.12,1.25,1.4,1.5]; // por niveles activos de sus otras sinergias
function applyTraits(u,traits,Tt,mods){
 const has=t=>traits.includes(t), leg=traits.includes('Legendario'), tv=(t,arr)=>{ let k=Tt[t]||0; if(leg&&TRAITS[t]&&TRAITS[t].legOld) k=LEG_OLD_TIER[k]; return arr[Math.min(k,arr.length-1)]||0; };
 // Tipos con identidad propia: incendio, oleadas, sobrecarga, ciclos de maná, escalado dracónico, fortaleza y ejecuciones
 if(has('Fuego')){ u.burnPct+=tv('Fuego',[0,.02,.04,.07,.1]); u.dmgBonus+=tv('Fuego',[0,0,0,.2,.35]); if(Tt['Fuego']){ u.fireSpread=true; u.fireBoom=tv('Fuego',[0,0,0,150,300]); } }
 if(has('Agua')) u.manaPerAtk+=tv('Agua',[0,3,6,10,14]);
 u.waterTier=Tt['Agua']||0;
 if(has('Planta')) u.regen+=tv('Planta',[0,.015,.035,.06]);
 u.regen+=tv('Planta',[0,0,0,.02]);
 if(has('Eléctrico')){ u.as*=1+tv('Eléctrico',[0,.2,.4,.7]); u.elecTier=Tt['Eléctrico']||0; }
 if(has('Psíquico')){ u.ap+=tv('Psíquico',[0,15,30,60,100]); u.psyMana=tv('Psíquico',[0,10,20,35,60]); }
 u.ap+=tv('Psíquico',[0,0,0,15,40]);
 if(has('Roca')) u.df+=tv('Roca',[0,25,40,55,82,160]);
 u.df+=tv('Roca',[0,0,5,10,19,50]);
 if(has('Dragón')){ u.maxHp+=tv('Dragón',[0,150,225,300,420,800]); u.dragonRamp=tv('Dragón',[0,.015,.02,.025,.034,.06]); u.dragonCap=tv('Dragón',[0,.3,.4,.5,.68,1.5]); }
 if(has('Fantasma')) u.dodge+=tv('Fantasma',[0,.15,.3,.45,.6]);
 u.startShield+=tv('Hada',[0,100,220,400,700]);
 if(has('Normal')){ u.maxHp+=tv('Normal',[0,120,300,550,900]); u.as*=1+tv('Normal',[0,.08,.15,.25,.4]); }
 if(has('Acero')){ u.dr+=tv('Acero',[0,.1,.2,.35]); u.fort=tv('Acero',[0,.25,.4,.6]); }
 if(has('Siniestro')&&Tt['Siniestro']){ u.execTh=tv('Siniestro',[0,.12,.2,.3]); u.execBuff=tv('Siniestro',[0,.04,.08,.12]); }
 if(has('Lucha')){ u.omni+=tv('Lucha',[0,.12,.25,.45]); u.dmgBonus+=tv('Lucha',[0,0,0,.2]); }
 // Clases (inspiradas en TFT): Guardaespaldas, Matones, Tiradores, Académicos, Asesinos, Encantadores, Retadores, Quimtech
 if(has('Guardián')){ const g=tv('Guardián',[0,20,40,70,110,170]); u.df+=g; u.mr+=g; u.bodyguard=tv('Guardián',[0,.1,.15,.22,.3,.45]); }
 u.maxHp+=tv('Coloso',[0,100,160,220,320,650])*(has('Coloso')?2:1);
 // Peleador (el Brawler de TFT): más vida máxima y, al bajar del 50% de vida, furia (vel. de ataque y daño; ver dealDamage)
 if(has('Peleador')&&Tt['Peleador']){ u.maxHp*=1+tv('Peleador',[0,.18,.35,.55,.85]); u.fury=[tv('Peleador',[0,.2,.35,.55,.8]),tv('Peleador',[0,0,0,.1,.25])]; }
 if(has('Tirador')){ u.hexAmp=tv('Tirador',[0,.06,.08,.1,.13,.25]); u.range+=tv('Tirador',[0,0,0,0,0,1]); }
 u.ap+=tv('Hechicero',[0,8,15,25,40,60])*(has('Hechicero')?2:1); if(has('Hechicero')){ u.scholar=tv('Hechicero',[0,2,4,7,12,18]); u.echo=(Tt['Hechicero']||0)>TRAITS['Hechicero'].bp.length; }
 if(has('Asesino')){ u.critC+=tv('Asesino',[0,.15,.3,.45,.7]); u.critM+=tv('Asesino',[0,.1,.2,.35,.6]); if(Tt['Asesino']){ u.critAbil=true; u.vanish=tv('Asesino',[0,1.5,2,2.5,3]); } }
 u.healAmp=(u.healAmp||0)+tv('Sanador',[0,.2,.4,.7,1.2]); u.mr+=tv('Sanador',[0,10,20,35,60]);
 if(has('Depredadores')&&Tt['Depredadores']){ u.as*=1+tv('Depredadores',[0,.15,.3,.5,.8]); u.rival=[tv('Depredadores',[0,.4,.6,.9,1.3]),tv('Depredadores',[0,2,2.5,3,4]),tv('Depredadores',[0,.3,.5,1,1])]; }
 if(has('Team Rocket')&&Tt['Team Rocket']) u.rocket=Tt['Team Rocket'];
 // Resonancia: un Legendario sin su arquetipo (p. ej. Rayquaza sin Dragón ni Tirador) rinde menos; llenar el tablero de legendarios no basta
 if(has('Legendario')){ let n=0; const T2=Tt.nl||Tt; for(const t of traits) if(t!=='Legendario') n+=T2[t]||0; const b=LEG_RES[Math.min(n,LEG_RES.length-1)]+(mods?mods.legend:0); u.maxHp*=b; u.ad*=b; u.legMul=b; u.legRes=n; }
}
function applyStats(u,s){
 for(const k in s){ const v=s[k]; switch(k){
  case 'adPct':u.ad*=1+v;break; case 'asPct':u.as*=1+v;break; case 'ap':u.ap+=v;break; case 'mana':u.mana+=v;break;
  case 'df':u.df+=v;break; case 'mr':u.mr+=v;break; case 'hp':u.maxHp+=v;break; case 'crit':u.critC+=v;break;
  case 'critM':u.critM+=v;break; case 'dmg':u.dmgBonus+=v;break; case 'omni':u.omni+=v;break; case 'mpa':u.manaPerAtk+=v;break;
  case 'manaRegen':u.manaRegen+=v;break; case 'regen':u.regen+=v;break; case 'dodge':u.dodge+=v;break; case 'range':u.range+=v;break; } }
}
function baseCombatUnit(d,side,star,rand=Math.random){
 const ro=ROLE[d.role], cm=d.cost-1, s=star>=3?STAR3_BY_COST[cm]:STAR[star-1], em=d.mult||1, ab=abOf(d,star), t2=d.role==='t'&&star>=2, hm=em*(d.hpm||1)*(t2?TANK2.hp:1), rs=t2?TANK2.res:0;
 return {side,d,star,cost:d.cost,name:nameOf(d,star),ab,maxHp:ro.hp*HPM[cm]*s*hm,ad:ro.ad*ADM[cm]*s*em,hp0:ro.hp*HPM[cm]*s*hm,ad0:ro.ad*ADM[cm]*s*em,as:ro.as,range:ro.range,df:ro.df+rs,mr:ro.mr+rs,ap:0,
   mana:ab[2].mana0!=null?ab[2].mana0:ro.mana,maxMana:ab[2].mm||ro.maxMana,critC:.25,critM:1.4,dodge:0,burnPct:0,manaPerAtk:0,regen:0,manaRegen:0,omni:0,dr:0,bully:0,shock:0,
   focus:false,berry:false,dmgBonus:0,shield:0,shieldT:0,startShield:0,stun:0,sleepT:0,stealth:0,tdr:0,tdrT:0,reflT:0,reflPct:0,empN:0,empDmg:0,empStun:0,glow:0,
   atkCd:.25+rand()*.35,moveCd:rand()*.2,target:null,burns:[],dead:false,kills:0,flash:0,mt:1,role:d.role,items:[],ref:null,sp:{},atkN:0,titanN:0};
}
function makeCombatUnit(inst,p,Tt,side,rand){
 const d=DEF[inst.defId]; const u=baseCombatUnit(d,side,inst.star,rand);
 if(inst.stk){ u.maxHp+=inst.stk.hp; u.ad+=inst.stk.ad; u.ap+=inst.stk.ap||0; }
 applyTraits(u,unitTraits(inst),Tt,p.mods);
 const m=p.mods; u.maxHp*=1+m.hpPct; u.ad*=1+m.adPct; u.ap+=m.ap; u.as*=1+m.asPct; u.df+=m.def; u.mr+=m.mr; if(m.allFocus) u.focus=true;
 for(const it of [...inst.items,...(inst.tg||[])]){ const I=ITEMS[it]; if(!I) continue; applyStats(u,I.s); for(const k in I.sp) u.sp[k]=(u.sp[k]||0)+I.sp[k]; }
 if(u.sp.focus) u.focus=true; if(u.sp.berry) u.berry=true;
 if(u.sp.blood&&u.range===1) u.omni+=.1;
 u.items=inst.items.slice(); u.traits=unitTraits(inst); u.hp=u.maxHp; u.as=Math.min(u.as,3);
 return u;
}
// Poder de las habilidades: base por coste y estrellas × (1 + poder/100) × escalado del rol (híbrido).
// Sin objetos el factor del rol vale 1 (mismo daño que antes); con ellos crece: asesinos, luchadores y
// tiradores escalan también con su ataque, y los tanques con su vida máxima. Se recalcula en cada lanzamiento,
// así que lo que se acumula durante el combate o para siempre (Eevee, «Acumular») hace crecer la habilidad.
const SCALE_BY_ROLE={a:'ad',b:'ad',r:'ad',t:'hp'};
const SCALE_TXT={ad:'✨ Poder y ⚔️ Ataque',hp:'✨ Poder y ❤️ Vida máxima',ap:'✨ Poder de habilidad'};
const scaleOf=u=>u.creep?'ap':u.d&&u.d.scale||SCALE_BY_ROLE[u.role]||'ap';
function abilPower(u){
 const k=scaleOf(u); let f=1;
 if(k==='ad'&&u.ad0>0) f=u.ad/u.ad0; else if(k==='hp'&&u.hp0>0) f=Math.pow(u.maxHp/u.hp0,.75);
 // castBoost: lo que la habilidad ha crecido en este combate (3★ y legendarios que se fortalecen al lanzarla)
 if(k==='ad'&&u.ab&&u.ab[2].adExp) f=Math.pow(f,u.ab[2].adExp); // hipercarry (Zapdos): el ataque extra de los objetos rinde más que proporcional
 return ABIL_BASE[u.cost-1]*(u.star>=3?ABIL3_BY_COST[u.cost-1]:ABIL_STAR[u.star-1])*(1+u.ap/100)*Math.max(.5,f)*(1+(u.castBoost||0))*(k==='ap'?u.legMul||1:1); // la resonancia ya entra por el ataque o la vida en los demás roles
}

// Instantánea compacta de un equipo: es lo que se envía por red y lo que usa la simulación
function teamSnap(p){ ensureGloves(p); const m=p.mods; let ent=Object.entries(p.board); if(m.soloLevel&&ent.length>1) ent=[ent.sort((a,b)=>DEF[b[1].defId].cost*Math.pow(3,b[1].star)-DEF[a[1].defId].cost*Math.pow(3,a[1].star))[0]];
 return {ag:augSnap(p),m:{hp:m.hpPct,ad:m.adPct,ap:m.ap,as:m.asPct,df:m.def,mr:m.mr,f:m.allFocus?1:0,lg:m.legend,x:m.extraTrait},u:ent.map(([k,u])=>[k,u.defId,u.star,u.items.concat(u.tg||[]),R0(u.stk.hp),R0(u.stk.ad),R0(u.stk.ap||0)])}; }
function snapPlayer(snap){
 const m=snap&&snap.m||{}; const mods=Object.assign(defaultMods(),{hpPct:+m.hp||0,adPct:+m.ad||0,ap:+m.ap||0,asPct:+m.as||0,def:+m.df||0,mr:+m.mr||0,allFocus:!!m.f,legend:+m.lg||0,extraTrait:(m.x&&typeof m.x==='object')?m.x:{}});
 const board={};
 for(const row of (snap&&Array.isArray(snap.u)?snap.u:[])){
   const [k,defId,star,items,sh,sa,sp]=row;
   if(typeof k!=='string'||!/^[0-6],[0-3]$/.test(k)||!DEF[defId]||![1,2,3].includes(star)) continue;
   board[k]={defId,baseId:DEF[defId].evoOf||defId,star,items:(Array.isArray(items)?items:[]).filter(i=>ITEMS[i]).slice(0,3),stk:{hp:+sh||0,ad:+sa||0,ap:+sp||0}};
 }
 return {mods,board};
}
function createCombatSnap(snapA,snapB,R,opt={}){
 const cb={t:0,units:[],fx:[],feed:[],feedV:0,done:false,winner:null,started:false,visual:!!opt.visual,gold:[0,0],pend:[],rng:mulberry32((opt.seed>>>0)||1)};
 addTeamSnap(cb,snapA,0,opt.refsA);
 if(snapB) addTeamSnap(cb,snapB,1,opt.refsB); else addCreeps(cb,R);
 return cb;
}
function addTeamSnap(cb,snap,side,refs){
 const p=snapPlayer(snap), Tt=traitTiers(p);
 for(const k in p.board){
   const [c,r]=k.split(',').map(Number); const u=makeCombatUnit(p.board[k],p,Tt,side,cb.rng);
   [u.c,u.r]=toGrid(side,c,r); u.pc=u.c; u.pr=u.r; u.ref=refs&&refs[k]||null; u.bk=k; cb.units.push(u);
 }
 // Efectos de combate de los aumentos (deterministas: salen de los parámetros del teamSnap)
 // Pasivas de habilidad (legendarios): renacer propio (Moltres) o del primer aliado que caiga (Ho-Oh)
 for(const u of cb.units){ if(u.side!==side||!u.ab) continue; const q=u.ab[2]||{};
   if(q.revive){ u.revive=q.revive; u.rebirthNova=q.nova||0; }
   if(q.quake) u.quake=q.quake*u.star; if(q.tide0) u.tideN=q.tide0;
   if(q.phoenix){ cb.phoenix=cb.phoenix||[0,0]; cb.phoenix[side]=Math.max(cb.phoenix[side],q.phoenix); } }
 augCombat(cb,side,cb.units.filter(u=>u.side===side),snap&&snap.ag);
}
const CREEP=(dex,name,hp,ad,c,r,extra={})=>({dex,name,hp,ad,c,r,...extra});
function pveWave(s,n){
 const k=s+'-'+n;
 if(k==='1-1') return [CREEP(129,'Magikarp',200,8,2,0),CREEP(129,'Magikarp',200,8,4,0)];
 if(k==='1-2') return [CREEP(10,'Caterpie',260,14,2,0),CREEP(10,'Caterpie',260,14,4,0),CREEP(13,'Weedle',220,16,3,1)];
 if(k==='1-3') return [CREEP(21,'Spearow',300,20,2,0),CREEP(21,'Spearow',300,20,4,0),CREEP(16,'Pidgey',260,18,3,2,{range:3})];
 if(s===2) return [CREEP(98,'Krabby',560,36,2,0),CREEP(98,'Krabby',560,36,4,0),CREEP(98,'Krabby',560,36,3,1),CREEP(99,'Kingler',950,55,3,0)];
 if(s===3) return [CREEP(143,'Snorlax',2900,85,3,0,{as:.55,boss:true}),CREEP(446,'Munchlax',620,40,1,1),CREEP(446,'Munchlax',620,40,5,1)];
 if(s===4) return [CREEP(142,'Aerodactyl',1800,105,2,0,{as:.8}),CREEP(142,'Aerodactyl',1800,105,4,0,{as:.8}),CREEP(142,'Aerodactyl',1800,105,3,2,{as:.8,range:3})];
 const m=Math.pow(1.3,Math.max(0,s-5));
 // Desde la fase 5: un único Gyarados variocolor grande (la vida y el daño de los tres jefes de antes juntos)
 return [CREEP(130,'Gyarados variocolor',11500*m,300*m,3,1,{boss:true,shiny:true,big:1.9,as:.7})];
}
function addCreeps(cb,R){
 for(const cr of pveWave(R.s,R.n)){
   const d={key:'creep',name:cr.name,dex:cr.dex,shiny:!!cr.shiny,big:cr.big||1,cost:clamp(R.s-1,1,5),role:'b',traits:[],ab:[['nova','Golpe Salvaje',{r:1,m:.75,stun:1}]]};
   const u=baseCombatUnit(d,1,1,cb.rng);
   Object.assign(u,{maxHp:cr.hp,hp:cr.hp,ad:cr.ad,as:cr.as||.65,range:cr.range||1,df:15+R.s*5,mr:15+R.s*5,mana:0,maxMana:cr.boss?120:99999,creep:true,role:cr.range?'r':'b'});
   [u.c,u.r]=toGrid(1,cr.c,cr.r); u.pc=u.c; u.pr=u.r; cb.units.push(u);
 }
}
// efectos visuales (no afectan a la simulación)
// cb.visDelay (solo visual): retrasa los textos y reacciones de impacto hasta que el proyectil llega al objetivo
function fx(cb,o){ if(cb.visual){ o.t=-(cb.visDelay||0); o.life=o.life||.8; cb.fx.push(o); } }
function fxText(cb,u,txt,color,big){ fx(cb,{type:'text',c:u.c,r:u.r,txt:String(txt),color,big:!!big,dx:(Math.random()-.5)*14}); }
// Avanza el tiempo de los efectos (se hace en cada fotograma para que se muevan a la frecuencia de la pantalla)
function ageFx(cb,dt){ if(!cb||!cb.fx.length) return; for(const f of cb.fx) f.t+=dt; cb.fx=cb.fx.filter(f=>f.t<f.life); }
// Las heridas (veneno) reducen a la mitad la curación recibida
// Estadísticas del combate (daño hecho, recibido y curación), solo para el registro de daño: no cambian la simulación
let HEALER=null;
function heal(u,a){ if(!u.dead&&a>0){ const b=u.hp; u.hp=Math.min(u.maxHp,u.hp+a*(u.woundT>0?.5:1)); const s=HEALER||u; s.sHeal=(s.sHeal||0)+u.hp-b; } }
function stunUnit(e,s,sleep){ if(!e.sp.noStun){ e.stun=Math.max(e.stun,s); if(sleep) e.sleepT=Math.max(e.sleepT,s); } }
const foesOf=(cb,u)=>cb.units.filter(e=>!e.dead&&e.side!==u.side);
const alliesOf=(cb,u)=>cb.units.filter(e=>!e.dead&&e.side===u.side);
// Áreas y control al grupo más grande: entre los enemigos a su alcance (+2 casillas), el que tiene más enemigos a 'rad'.
// Desempate: el objetivo actual y luego el más cercano. Así un área no se gasta en un enemigo suelto si hay un grupo al lado.
function aoeTarget(cb,u,t,rad,cnt){ if(!t) return t; const fs=foesOf(cb,u).filter(e=>!(e.stealth>0)); const reach=Math.max((u.range||1)+2,3); let best=t, bs=-1e9;
 for(const c of fs){ if(c!==t&&dU(u,c)>reach) continue; const n=cnt?cnt(c):fs.filter(e=>dU(c,e)<=rad).length, sc=n*100+(c===t?50:0)-dU(u,c); if(sc>bs){ bs=sc; best=c; } } return best; }
// Igual para conos y oleadas: la dirección que atraviesa a más enemigos
const aoeDir=(cb,u,t,o)=>aoeTarget(cb,u,t,0,c=>dirTargets(cb,u,c,o).length);
// Zonas de curación: donde más aliados heridos quedan dentro (antes caían sobre el lanzador o sobre el enemigo)
function allyCluster(cb,u,rad){ const al=alliesOf(cb,u); let best=u, bs=-1; for(const c of al){ const sc=al.reduce((s2,a)=>s2+(dU(c,a)<=rad?1+2*(1-a.hp/a.maxHp):0),0); if(sc>bs){ bs=sc; best=c; } } return best; }
function nearestEnemy(cb,u,except,ok){
 let best=null,bd=1e9;
 for(const e of cb.units){ if(e.dead||e.side===u.side||e===except||e.stealth>0||(ok&&!ok(e))) continue; const d=dU(u,e)+cb.rng()*.1; if(d<bd){bd=d;best=e;} }
 return best;
}
// Agro inicial de tanques (solo en el primer tick del combate): si una ficha tiene a su alcance, en las posiciones iniciales, un tanque enemigo
// (rol 't', vivo y sin sigilo), empieza atacándolo: el más cercano, con el mismo desempate por cb.rng que nearestEnemy. Así un tanque bien
// colocado protege a los aliados que tiene al lado. Si no hay ninguno, devuelve null y la ficha elige como siempre (el más cercano, en su turno).
// No se vuelve a aplicar en ese combate: al cambiar de objetivo manda la cercanía, y Guardianes y provocar lo siguen sobrescribiendo.
function pickInitialTarget(cb,u){ return nearestEnemy(cb,u,null,e=>e.role==='t'&&dU(u,e)<=u.range); }
// Enemigo más cercano que el objetivo actual (a menos de d casillas); sin azar: en empate, el primero de cb.units
function closerFoe(cb,u,d){ let best=null,bd=d; for(const e of cb.units){ if(e.dead||e.side===u.side||e.stealth>0) continue; const x=dU(u,e); if(x<bd){bd=x;best=e;} } return best; }
function freeCell(cb,c,r,except){ return !cb.units.some(x=>!x.dead&&x!==except&&x.c===c&&x.r===r); }
// Primer paso del camino más corto (por anchura, nivel a nivel) hasta quedar a su alcance: devuelve [c, r, enemigo].
// Con any, si otro enemigo queda a su alcance en menos pasos que el objetivo, va a por ese (no rodea un atasco teniendo a otro más a mano); en empate, su objetivo
function nextStep(cb,u,t,any){
 const occ=new Set(cb.units.filter(x=>!x.dead&&x!==u).map(x=>x.c+','+x.r)), foes=any?cb.units.filter(e=>!e.dead&&e.side!==u.side&&!(e.stealth>0)&&e!==t):[];
 const start=u.c+','+u.r, prev={[start]:null}, first=k=>{ while(prev[k]!==start) k=prev[k]; return k.split(',').map(Number); };
 let lvl=[[u.c,u.r]];
 while(lvl.length){ let alt=null; const nx=[];
   for(const [c,r] of lvl){ if(c===u.c&&r===u.r) continue; const k=c+','+r;
     if(hexDist(c,r,t.c,t.r)<=u.range) return [...first(k),t];
     if(!alt) for(const e of foes) if(hexDist(c,r,e.c,e.r)<=u.range){ alt=[...first(k),e]; break; } }
   if(alt) return alt;
   for(const [c,r] of lvl) for(const [nc,nr] of neighbors(c,r)){ const k=nc+','+nr; if(k in prev||occ.has(k)) continue; prev[k]=c+','+r; nx.push([nc,nr]); }
   lvl=nx;
 }
 return null;
}
function teleportNear(cb,u,t){
 const cells=neighbors(t.c,t.r).filter(([c,r])=>freeCell(cb,c,r,u)); if(!cells.length) return false;
 cells.sort((a,b)=>hexDist(a[0],a[1],u.c,u.r)-hexDist(b[0],b[1],u.c,u.r));
 fx(cb,{type:'trail',fc:u.c,fr:u.r,tc:cells[0][0],tr:cells[0][1],color:typeColor(u.d),life:.45});
 u.pc=u.c;u.pr=u.r;u.c=cells[0][0];u.r=cells[0][1];u.mt=0; return true;
}
function addBurn(t,src,dps,dur,key){ let ex=t.burns.find(b=>b.key===key); if(ex){ ex.t=dur; ex.dps=Math.max(ex.dps,dps); ex.src=src; } else t.burns.push(ex={key,t:dur,dps,src}); return ex; }
function dealDamage(cb,src,t,raw,kind,silent,crit){
 if(t.dead) return false;
 if(kind==='phys'&&t.dodge&&cb.rng()<t.dodge){ fxText(cb,t,'¡Esquiva!','#b9c3dc'); return false; }
 let dmg=raw*(1+(src&&kind!=='true'?src.dmgBonus:0))*(t.markT>0&&kind!=='true'?1+t.markAmp:1);
 if(src&&src.bully&&kind!=='true'&&t.hp<t.maxHp*.5) dmg*=1+src.bully;
 if(src&&src.hexAmp&&kind!=='true') dmg*=1+src.hexAmp*dU(src,t); // Tiradores: más daño cuanto más lejos
 if(kind==='phys') dmg*=100/(100+t.df); else if(kind==='magic') dmg*=100/(100+t.mr);
 const dr=t.dr+(t.sp.dr||0)+(t.tdrT>0?t.tdr:0); if(dr) dmg*=1-Math.min(.75,dr);
 t.sTank=(t.sTank||0)+dmg; if(src&&src!==t&&src.side!==t.side){ src.sDmg=(src.sDmg||0)+dmg; if(kind==='phys') src.sPhys=(src.sPhys||0)+dmg; }
 // Fortaleza (Acero): un aliado Acero adyacente absorbe parte del daño (lo absorbido es daño verdadero: no se encadena)
 if(kind!=='true'&&!t.fort&&dmg>0){ const g=cb.units.find(a=>a.fort&&!a.dead&&a.side===t.side&&a!==t&&dU(a,t)<=1); if(g){ const share=dmg*g.fort; dmg-=share; dealDamage(cb,src,g,share*(1-Math.min(.75,g.dr)),'true',true); } }
 if(t.shield>0){ const a=Math.min(t.shield,dmg); t.shield-=a; dmg-=a; }
 t.hp-=dmg; if(!silent) t.flash=.12;
 if(cb.caster&&src===cb.caster){ cb.cDmg+=dmg; cb.cHits.add(t); }
 if(kind!=='true'){ t.mana+=Math.min(dmg*.04,12); if(t.sp.titan&&t.titanN<25){ t.titanN++; t.dmgBonus+=t.sp.titan; } }
 if(t.reflT>0&&src&&src!==t&&kind!=='true'&&!src.dead) dealDamage(cb,t,src,dmg*t.reflPct,'true',true);
 if(src&&src.omni&&!src.dead) heal(src,dmg*src.omni);
 if(!silent&&dmg>=1){ fxText(cb,t,crit?R0(dmg)+'!':R0(dmg),crit?'#ffb400':kind==='magic'?'#7fb6ff':'#ffffff',crit); if(cb.visual) fx(cb,{type:'hit',u:t,src,crit,kind,k:Math.min(1,dmg/Math.max(1,t.maxHp)*4),life:.4}); }
 if(src&&src.sp.execute&&kind!=='true'&&t.hp>0&&t.hp<t.maxHp*src.sp.execute){ t.hp=0; fxText(cb,t,'¡Rematado!','#ff6b6b'); }
 if(src&&src.execTh&&kind!=='true'&&t.hp>0&&t.hp<t.maxHp*src.execTh){ t.hp=0; fxText(cb,t,'¡Ejecutado!','#b07cff'); cb.darkN=cb.darkN||[0,0]; if(cb.darkN[src.side]<5){ cb.darkN[src.side]++; for(const a of cb.units) if(!a.dead&&a.side===src.side) a.dmgBonus+=src.execBuff; } }
 // Team Rocket: la primera vez que bajan del 60% se ponen serios 4 s
 if(t.fury&&!t.furyOn&&t.hp>0&&t.hp<t.maxHp*.5){ t.furyOn=true; t.as=Math.min(3,t.as*(1+t.fury[0])); t.dmgBonus+=t.fury[1]; fxText(cb,t,'¡Furia!','#ff7a2f'); fx(cb,{type:'aura',u:t,life:3,color:'#ff7a2f'}); }
 if(t.rocket&&!t.rocketUsed&&t.hp>0&&t.hp<t.maxHp*.6){ t.rocketUsed=true; const R=[null,{dr:.25,as:.5,rg:.03},{dr:.45,as:.8,rg:.05},{dr:.6,as:1.2,rg:.08}][t.rocket]||{dr:.25,as:.5,rg:.03}; t.tdr=Math.max(t.tdr,R.dr); t.tdrT=Math.max(t.tdrT,4); t.rushMul=1+R.as; t.rushT=4; t.rocketT=4; t.rocketRg=R.rg; fxText(cb,t,'¡Team Rocket!','#ff4d6d'); fx(cb,{type:'aura',u:t,life:4,color:'#ff4d6d'}); }
 if(t.vanish&&!t.vanished&&t.hp>0&&t.hp<t.maxHp*.5){ t.vanished=true; t.stealth=Math.max(t.stealth||0,t.vanish); for(const e of cb.units) if(e.target===t) e.target=null; fxText(cb,t,'¡Se esfuma!','#c9a7ff'); }
 if(t.lowRage&&!t.lowRaged&&t.hp>0&&t.hp<t.maxHp*.5){ t.lowRaged=true; t.as=Math.min(5,t.as*(1+t.lowRage)); fxText(cb,t,'¡Furia!','#ff5a3a'); }
 if(t.berry&&t.hp>0&&t.hp<t.maxHp*.5){ t.berry=false; heal(t,t.maxHp*.35); fxText(cb,t,'Baya Zidra','#4caf50'); }
 if(t.sp.blood&&!t.bloodUsed&&t.hp>0&&t.hp<t.maxHp*.4){ t.bloodUsed=true; t.shield+=t.maxHp*.25; t.shieldT=Math.max(t.shieldT,5); fxText(cb,t,'¡Sed de sangre!','#ff5a5a'); }
 if(t.hp<=0){
   if(t.focus){ t.focus=false; t.hp=1; fxText(cb,t,'¡Aguanta!','#ffb400'); if(t.ghostFocus){ t.stealth=2; t.ghostFocus=false; } }
   else if(t.rocket>=3&&!t.blasted){ t.blasted=true; t.hp=t.maxHp*.5; t.stealth=2; t.burns=[]; fxText(cb,t,'¡Despegamos!','#ff4d6d'); }
   // Renacer: Moltres renace una vez; con Ho-Oh, el primer aliado que cae renace
   else if(!t.creep&&(t.revive>0||(cb.phoenix&&cb.phoenix[t.side]>0))){ const pct=t.revive>0?t.revive:cb.phoenix[t.side]; if(t.revive>0) t.revive=0; else cb.phoenix[t.side]=0;
     t.hp=t.maxHp*pct; t.stun=0; t.burns=[]; t.mana=Math.max(t.mana,t.maxMana*.5); fxText(cb,t,'¡Renace!','#ffb347'); fx(cb,{type:'area',c:t.c,r:t.r,rad:1.8,color:'#ff8a3a',life:.9,el:'Fuego'});
     if(t.rebirthNova) for(const e of foesOf(cb,t)) if(dU(t,e)<=2) dealDamage(cb,t,e,abilPower(t)*t.rebirthNova,'magic',false); }
   else { t.hp=0; t.dead=true; if(src&&!t.creep&&src.side!==t.side){ cb.firstKill=cb.firstKill||[null,null]; if(cb.firstKill[src.side]==null) cb.firstKill[src.side]=t.d.key; } spreadFire(cb,t); if(src&&src.rocket>=3&&!t.creep&&cb.gold[src.side]<12){ cb.gold[src.side]++; fxText(cb,src,'+1 💰','#ffd23f'); } if(t.creep) (cb.deaths=cb.deaths||[]).push([cb.t,t.c,t.r]); if(src&&src.side!==t.side){ src.kills++; if(src.ab&&src.ab[2].storm) stormKill(cb,src,t); if(src.rival&&src.target===t&&!src.dead){ src.rushMul=1+src.rival[0]; src.rushT=src.rival[1]; if(src.maxMana<9999) src.mana+=src.maxMana*(src.rival[2]||0); const n=nearestEnemy(cb,src,t); if(n){ teleportNear(cb,src,n); src.target=n; } } if(cb.kh) for(const h of cb.kh[src.side]) h(cb,src,t); } fx(cb,{type:'ring',c:t.c,r:t.r,color:'#ffffff',life:.5}); if(cb.caster&&src===cb.caster) cb.cKills++; quakeFeed(cb,t); }
 }
 return true;
}
// Zapdos, Tormenta Creciente: storm=[bajas por +vel., +vel. por paso, bajas por rebote, daño del rebote]. Todo dura hasta el final del combate (la unidad se crea de nuevo en cada combate)
function stormKill(cb,u,t){ const [per,as,bEvery]=u.ab[2].storm; u.stormSeen=u.stormSeen||new Set(); if(u.stormSeen.has(t)) return; u.stormSeen.add(t); u.stormK=(u.stormK||0)+1;
 if(u.stormK%per===0){ u.as=Math.min(5,u.as*(1+as)); u.stormAs=(u.stormAs||0)+as; }
 const b=Math.floor(u.stormK/bEvery); if(b>(u.stormBounce||0)){ u.stormBounce=b; fxText(cb,u,'¡Rebote +1!','#ffe066'); } }
// Rebotes del ataque básico de Zapdos: daño reducido a enemigos distintos (el más cercano al anterior; empates por orden de unidades). Sin efectos de objetos ni maná: no se multiplican
function stormBounces(cb,u,t,dmg,crit){ let prev=t; const hit=new Set([t]); for(let i=0;i<u.stormBounce;i++){ const e=cb.units.filter(x=>!x.dead&&x.side!==u.side&&!hit.has(x)&&!(x.stealth>0)).sort((a,b)=>dU(prev,a)-dU(prev,b)||cb.units.indexOf(a)-cb.units.indexOf(b))[0]; if(!e) break; hit.add(e);
  fx(cb,{type:'zap',fc:prev.c,fr:prev.r,tc:e.c,tr:e.r,color:'#ffe066',life:.25,el:'Eléctrico'}); dealDamage(cb,u,e,dmg*u.ab[2].storm[3],'phys',false,crit); prev=e; } }
// Fuego: si muere quemado, la quemadura salta al enemigo más cercano (y con Fuego 6 explota)
function spreadFire(cb,t){
 const b=t.burns&&t.burns.find(x=>x.t>0&&x.src&&x.src.fireSpread); if(!b) return;
 const n=cb.units.filter(e=>!e.dead&&e!==t&&e.side===t.side).sort((a,c)=>dU(t,a)-dU(t,c))[0];
 if(n){ addBurn(n,b.src,b.dps,3,'fire'); fx(cb,{type:'proj',fc:t.c,fr:t.r,tc:n.c,tr:n.r,color:'#ff7a2a',life:.3,el:'Fuego'}); }
 if(b.src.fireBoom){ for(const e of cb.units) if(!e.dead&&e!==t&&e.side===t.side&&dU(t,e)<=1) dealDamage(cb,b.src,e,b.src.fireBoom,'magic',false); fx(cb,{type:'area',c:t.c,r:t.r,rad:1.5,color:'#ff7a2a',life:.6,el:'Fuego'}); }
}
function abilDamage(cb,u,t,amount){
 let crit=false; if((u.sp.abilCrit||u.critAbil)&&cb.rng()<u.critC){ amount*=u.critM; crit=true; }
 const hit=dealDamage(cb,u,t,amount,'magic',false,crit);
 if(hit&&u.sp.abilBurn&&!t.dead) addBurn(t,u,u.sp.abilBurn*t.maxHp,5,'charcoal');
 return hit;
}
function hitFx(cb,u,e,amt,p){
 abilDamage(cb,u,e,amt); if(e.dead) return;
 if(p.stun){ stunUnit(e,p.stun); cb.cStun=true; }
 if(p.burn) addBurn(e,u,p.burn*e.maxHp,4,'abil');
 if(p.shred&&!e.mrShred){ e.mr*=1-p.shred; e.mrShred=1; }
 if(p.chill) e.chillT=Math.max(e.chillT||0,p.chill);
 if(p.wound) e.woundT=Math.max(e.woundT||0,p.wound);
}
function attack(cb,u,t){
 const crit=cb.rng()<u.critC; const dmg=u.ad*(crit?u.critM:1);
 const el0=u.d.traits&&u.d.traits.find(x=>FX_EL.has(x));
 fx(cb,u.range>1?{type:'proj',fc:u.c,fr:u.r,tc:t.c,tr:t.r,color:typeColor(u.d),el:el0,life:.22,atk:1}:{type:'swing',c:u.c,r:u.r,tc:t.c,tr:t.r,el:el0,life:.18});
 if(cb.visual) cb.visDelay=u.range>1?.19:.07;
 const hit=dealDamage(cb,u,t,dmg,'phys',false,crit); cb.visDelay=0;
 if(u.stormBounce>0) stormBounces(cb,u,t,dmg,crit);
 if(hit&&crit&&u.sp.shred&&!t.shredded){ t.df*=1-u.sp.shred; t.shredded=true; }
 if(hit&&t.sp.thorns&&!u.dead) dealDamage(cb,t,u,t.sp.thorns+t.maxHp*.03,'magic',true);
 if(hit&&u.shock&&cb.rng()<u.shock) stunUnit(t,.4);
 if(u.empN>0&&!t.dead){ u.empN--; dealDamage(cb,u,t,u.empDmg,'magic'); if(u.empStun) stunUnit(t,u.empStun); fx(cb,{type:'area',c:t.c,r:t.r,rad:.4,color:'#ffd23f',life:.3}); }
 u.mana+=10+u.manaPerAtk; u.atkN++;
 if(u.sp.rage&&u.as<5){ u.as=Math.min(5,u.as*(1+u.sp.rage)); u.rageN=(u.rageN||0)+1; } // cargas de la Cinta Furia (solo las que suman)
 if(u.sp.split){ const o=nearestEnemy(cb,u,t); if(o&&dU(u,o)<=u.range+1) dealDamage(cb,u,o,dmg*u.sp.split,'phys',false); }
 if(u.sp.zap&&u.atkN%3===0){ const fs=foesOf(cb,u).sort((a,b)=>dU(u,a)-dU(u,b)).slice(0,3); for(const e of fs){ fx(cb,{type:'zap',fc:u.c,fr:u.r,tc:e.c,tr:e.r,color:'#ffe066',life:.25}); dealDamage(cb,u,e,u.sp.zap,'magic'); } }
 if(hit&&u.burnPct&&!t.dead) addBurn(t,u,u.burnPct*t.maxHp,3,'fire');
}
// Posición "real" de una casilla (las filas impares van desplazadas media casilla)
const hxy=(c,r)=>[c+.5*(r&1),r*.866];
// Enemigos dentro de una franja (o de un cono si half>0) que sale de u hacia t
function dirTargets(cb,u,t,{w=.65,len=99,half=0}={}){
 const [ux,uy]=hxy(u.c,u.r),[tx,ty]=hxy(t.c,t.r); let dx=tx-ux, dy=ty-uy; const L=Math.hypot(dx,dy)||1; dx/=L; dy/=L;
 return foesOf(cb,u).filter(e=>{ const [ex,ey]=hxy(e.c,e.r); const vx=ex-ux, vy=ey-uy; const proj=vx*dx+vy*dy, perp=Math.abs(vx*dy-vy*dx); return proj>0&&proj<=len+.4&&perp<(half?proj*Math.tan(half)+.45:w); });
}
const lineTargets=(cb,u,t)=>dirTargets(cb,u,t);
// Mueve a e k casillas alejándolo de (o acercándolo a) una casilla, solo por casillas libres
function shove(cb,e,c,r,k,away){
 let moved=false;
 for(let i=0;i<k;i++){
   const d0=hexDist(e.c,e.r,c,r); let best=null,bd=d0;
   for(const [nc,nr] of neighbors(e.c,e.r)){ if(!freeCell(cb,nc,nr,e)) continue; const d=hexDist(nc,nr,c,r); if(away?d>bd:d<bd&&d>0){ bd=d; best=[nc,nr]; } }
   if(!best) break; if(!moved){ e.pc=e.c; e.pr=e.r; e.mt=0; } [e.c,e.r]=best; moved=true;
 }
 return moved;
}
// Efecto que se resuelve más tarde (golpes retardados, zonas que hacen daño por tics…)
const later2=(cb,dt,run)=>cb.pend.push({at:cb.t+dt,run});
// Ho-Oh: devuelve al combate al aliado caído más valioso, junto a él si su casilla está ocupada
function rebirthAlly(cb,u,pct){ const d=cb.units.filter(a=>a.dead&&a.side===u.side&&!a.creep).sort((a,b)=>b.cost*Math.pow(3,b.star)-a.cost*Math.pow(3,a.star))[0]; if(!d){ cb.cExtra+=' · nadie a quien revivir'; return; }
  if(!freeCell(cb,d.c,d.r,d)&&!teleportNear(cb,d,u)) return; d.dead=false; d.hp=d.maxHp*pct; d.burns=[]; d.stun=0; d.mana=0; d.target=null; d.pc=d.c; d.pr=d.r;
  fxText(cb,d,'¡Renace!','#ffb347'); fx(cb,{type:'area',c:d.c,r:d.r,rad:1.5,color:'#ff8a3a',life:.9,el:'Fuego'}); cb.cExtra+=` · ¡${d.name} renace!`; }
// Groudon: cada Pokémon (de cualquier bando, no salvajes) que cae a 2 casillas o menos le da vida PARA SIEMPRE
function quakeFeed(cb,t){ if(t.creep) return; for(const g of cb.units) if(g.quake&&!g.dead&&g!==t&&dU(g,t)<=2){ gainStacks(g,g.quake,0); g.quakeGain=(g.quakeGain||0)+g.quake; fxText(cb,g,`+${g.quake} PS`,'#d9a066'); } }
function gainStacks(u,hp,ad){ const ap=ad*AP_PER_AD; u.maxHp+=hp; u.hp+=hp; u.ad+=ad; u.ap+=ap; if(u.ref&&!NO_PERMA){ u.ref.stk=u.ref.stk||{hp:0,ad:0,ap:0}; u.ref.stk.hp+=hp; u.ref.stk.ad+=ad; u.ref.stk.ap=(u.ref.stk.ap||0)+ap; } }
const elIcon=el=>TRAITS[el]?TRAITS[el].icon:({Hielo:'❄️',Veneno:'☠️'})[el]||'';
// Efectos de tipo que se disparan con cada habilidad lanzada
function typeOnCast(cb,u){
 const s=u.side, P=abilPower(u);
 if(u.elecTier){ cb.eC=cb.eC||[0,0]; const need=[3,3,2,1][Math.min(3,u.elecTier)]; if(++cb.eC[s]>=need){ cb.eC[s]=0; const n=[3,3,5,7][Math.min(3,u.elecTier)]; let prev=u; const hit=new Set();
   for(let i=0;i<n;i++){ const e=cb.units.filter(x=>!x.dead&&x.side!==s&&!hit.has(x)).sort((a,b)=>dU(prev,a)-dU(prev,b))[0]; if(!e) break; hit.add(e); fx(cb,{type:'zap',fc:prev.c,fr:prev.r,tc:e.c,tr:e.r,color:'#ffe066',life:.4,el:'Eléctrico'}); dealDamage(cb,u,e,P*(u.elecTier>=2?.6:.4),'magic',false); if(u.elecTier>=2&&!e.dead) stunUnit(e,u.elecTier>=3?1:.5); prev=e; }
   fxText(cb,u,'¡Sobrecarga!','#ffe066'); } }
 if(u.waterTier){ cb.wN=cb.wN||[0,0]; if(++cb.wN[s]%(u.waterTier>=4?2:4)===0){ const k=u.waterTier, hl=[0,.04,.07,.12,.18][k], dm=[0,60,120,220,320][k];
   for(const a of cb.units) if(!a.dead){ if(a.side===s) heal(a,a.maxHp*hl); else dealDamage(cb,u,a,dm,'magic',true); }
   fx(cb,{type:'flash',color:'#3b8fe8',life:.4}); fxText(cb,u,'¡Oleada!','#7fc8ff'); } }
 if(u.psyMana){ const a=cb.units.filter(x=>!x.dead&&x.side===s&&x!==u&&x.maxMana<9999).sort((x,y)=>x.mana/x.maxMana-y.mana/y.maxMana)[0]; if(a){ a.mana+=u.psyMana; fx(cb,{type:'proj',fc:u.c,fr:u.r,tc:a.c,tr:a.r,color:'#e0569b',life:.35,heal:true}); } }
}
function castAbility(cb,u,ab,depth=0){
 const [k,name,p]=ab; const P=abilPower(u), col=typeColor(u.d), el=p.el||u.d.traits[0]||'Normal';
 // Todos los efectos de la habilidad llevan su elemento y su estilo (p.v) para que board3d.js los pinte distintos
 const FX=o=>fx(cb,{el,v:p.v,color:col,...o});
 const foes=foesOf(cb,u), allies=alliesOf(cb,u);
 let t=u.target&&!u.target.dead&&!(u.target.stealth>0)?u.target:nearestEnemy(cb,u);
 if(depth===0){ u.castN=(u.castN||0)+1; if(u.castAp){ u.ap+=u.castAp; u.ad+=u.ad0*u.castAp/100; } typeOnCast(cb,u); for(const a of cb.units) if(a.scholar&&!a.dead&&a.side===u.side){ a.ap+=a.scholar; a.ad+=a.ad0*a.scholar/100; } cb.caster=u; HEALER=u; cb.cDmg=0; cb.cHits=new Set(); cb.cHeal=0; cb.cShield=0; cb.cStun=false; cb.cKills=0; cb.cExtra='';
   fx(cb,{type:'banner',u,txt:name,color:col,icon:elIcon(el),life:1.3}); u.glow=.6; u.flash=.2; }
 const amp=1+(u.healAmp||0); // Sanadores: curas y escudos más fuertes
 // Precisión Lunar: las curas y escudos de la línea de Clefable pueden ser críticos
 const hc=()=>{ if(u.healCrit&&cb.rng()<u.critC){ fxText(cb,u,'¡Crítico!','#ffb400'); return u.critM; } return 1; };
 const H=(a,amt)=>{ amt*=amp*hc(); const b=a.hp; heal(a,amt); cb.cHeal+=a.hp-b; FX({type:'plus',c:a.c,r:a.r,life:.8}); if(a.hp-b>=10) fxText(cb,a,'+'+R0(a.hp-b),'#5dff9a'); };
 const SH=(a,amt,dur)=>{ amt*=amp*hc(); u.sHeal=(u.sHeal||0)+amt; a.shield+=amt; a.shieldT=Math.max(a.shieldT,dur); cb.cShield+=amt; FX({type:'ring',c:a.c,r:a.r,color:'#dff4ff',life:.5}); };
 const near=(c,r,rad)=>foesOf(cb,u).filter(e=>hexDist(e.c,e.r,c,r)<=rad);
 switch(k){
  case 'bolt': if(t){ FX({type:'proj',fc:u.c,fr:u.r,tc:t.c,tr:t.r,life:.32,big:true}); hitFx(cb,u,t,P*p.m,p); } break;
  case 'burn': if(t){ if(p.r) t=aoeTarget(cb,u,t,p.r); FX({type:'proj',fc:u.c,fr:u.r,tc:t.c,tr:t.r,life:.28,big:true}); const tg=p.r?foes.filter(e=>dU(t,e)<=p.r):[t]; for(const e of tg) hitFx(cb,u,e,P*p.m,{...p,burn:p.burn||.03}); FX({type:'area',c:t.c,r:t.r,rad:(p.r||0)+.5,life:.6}); } break;
  case 'blast': if(t){ t=aoeTarget(cb,u,t,p.r); FX({type:'proj',fc:u.c,fr:u.r,tc:t.c,tr:t.r,life:.28,big:true}); for(const e of foes) if(dU(t,e)<=p.r) hitFx(cb,u,e,P*p.m,p); FX({type:'area',c:t.c,r:t.r,rad:p.r+.5,life:.65}); } break;
  case 'nova': for(const e of foes) if(dU(u,e)<=p.r) hitFx(cb,u,e,P*p.m,p); FX({type:'area',c:u.c,r:u.r,rad:p.r+.5,life:.7,quake:p.r>=2});
    if(p.selfDmg){ u.hp=Math.max(1,u.hp-u.maxHp*p.selfDmg); cb.cExtra=` · pierde ${R0(p.selfDmg*100)}% de su vida`; } break;
  // fall: cada enemigo atravesado recibe ese porcentaje menos que el anterior (mín. 40 %): el rayo no borra una fila entera
  case 'line': if(t){ const w=u.star>=3&&p.w3?p.w3:p.w||.65; if(p.aim) t=aoeDir(cb,u,t,{w}); const rise=p.rise?1+Math.min(p.riseCap||1,p.rise*((u.castN||1)-1)):1; let k=1;
    for(const e of dirTargets(cb,u,t,{w})){ hitFx(cb,u,e,P*p.m*k*rise,p); if(p.fall) k=Math.max(.4,k-p.fall); } FX({type:'beam',fc:u.c,fr:u.r,tc:t.c,tr:t.r,life:.5,w}); if(rise>1) cb.cExtra+=` · +${R0((rise-1)*100)}% de daño`; } if(p.stunSelf){ u.stun=Math.max(u.stun,p.stunSelf); cb.cExtra=' · se recarga'; } break;
  case 'chain': { let cur=t, prev=u; const hit=new Set(); for(let i=0;i<p.n&&cur;i++){ FX({type:'zap',fc:prev.c,fr:prev.r,tc:cur.c,tr:cur.r,life:.4}); hitFx(cb,u,cur,P*p.m*(1+(p.amp||0)*i),i&&p.stunFirst?{...p,stun:0}:p); hit.add(cur); prev=cur; cur=foes.filter(e=>!e.dead&&!hit.has(e)&&dU(prev,e)<=3).sort((a,b)=>dU(prev,a)-dU(prev,b))[0]; } break; }
  case 'multi': for(let i=0;i<p.n;i++){ const live=foes.filter(e=>!e.dead); if(!live.length) break; const e=pickR(cb,live); FX({type:'proj',fc:u.c,fr:u.r,tc:e.c,tr:e.r,life:.25+i*.04}); hitFx(cb,u,e,P*p.m,p); } if(p.chill) cb.cExtra=' · ralentiza'; break;
  // spill: si el objetivo cae, los golpes que sobran van al enemigo vivo más cercano (Timburr; Scyther, Machop y Poliwag no lo llevan)
  case 'combo': if(t){ let tg=t; for(let i=0;i<p.n;i++){ if(tg.dead){ if(!p.spill) break; tg=foesOf(cb,u).filter(e=>!(e.stealth>0)).sort((a,b)=>dU(u,a)-dU(u,b)||cb.units.indexOf(a)-cb.units.indexOf(b))[0]; if(!tg) break; cb.cExtra=' · los golpes saltan al siguiente'; } hitFx(cb,u,tg,P*p.m,i===p.n-1?p:{...p,stun:0}); } FX({type:'hits',c:t.c,r:t.r,n:p.n,life:.6}); } break;
  case 'dash': { const nearF=foes.filter(e=>!(e.stealth>0)&&dU(u,e)<=3); const tg=p.to==='far'?nearF.sort((a,b)=>dU(u,b)-dU(u,a))[0]||t:p.to==='low'?nearF.sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0]||t:t;
    if(tg){ teleportNear(cb,u,tg); u.target=tg; hitFx(cb,u,tg,P*p.m,p); FX({type:'hits',c:tg.c,r:tg.r,n:2,life:.5}); if(p.r){ for(const e of foes) if(e!==tg&&dU(tg,e)<=p.r) hitFx(cb,u,e,P*p.m*.6,p); FX({type:'area',c:tg.c,r:tg.r,rad:p.r+.5,life:.6}); } if(p.stealth){ u.stealth=p.stealth; for(const e of foes) if(e.target===u) e.target=null; cb.cExtra=' · invisible'; } if(p.selfAs) u.as=Math.min(3,u.as*(1+p.selfAs)); } break; }
  case 'execute': if(t){ hitFx(cb,u,t,P*p.m,p); FX({type:'hits',c:t.c,r:t.r,n:3,color:'#ff5a5a',life:.6}); if(!t.dead&&t.hp<t.maxHp*(p.th+.05*(u.star-1))){ dealDamage(cb,u,t,t.hp+t.shield+1,'true',true); fxText(cb,t,'¡Rematado!','#ff6b6b'); }
    if(t.dead&&p.reset&&u.maxMana<9999){ u.mana+=u.maxMana*p.reset; cb.cExtra+=' · ¡recupera maná!'; } } break;
  case 'meteor': for(const e of foes){ FX({type:'meteor',c:e.c,r:e.r,life:.7}); hitFx(cb,u,e,P*p.m,p); } if(p.sh) SH(u,u.maxHp*p.sh,4); if(p.dr){ u.tdr=Math.max(u.tdr,p.dr); u.tdrT=Math.max(u.tdrT,3); } if(p.healAll) for(const a of allies) H(a,P*p.healAll); if(p.manaTeam) for(const a of allies) if(a!==u) a.mana+=p.manaTeam; FX({type:'flash',life:.4});
    if(p.rebirth&&(u.rbN=(u.rbN||0)+1)>=p.rebirth){ u.rbN=0; rebirthAlly(cb,u,p.phoenix||.4); } else if(p.rebirth) cb.cExtra+=` · renacer ${u.rbN}/${p.rebirth}`; break;
  // Kyogre: disparos pequeños que cargan la marea; el n.º lanzamiento desata un maremoto en área (radio y daño acotados para no vaciar la mesa)
  case 'tide': { u.tideN=(u.tideN||0)+1; if(u.tideN<p.n){ if(t){ FX({type:'proj',fc:u.c,fr:u.r,tc:t.c,tr:t.r,life:.3,big:true}); hitFx(cb,u,t,P*p.m,{}); } cb.cExtra=` · marea ${u.tideN}/${p.n}`; break; }
    u.tideN=0; if(t) t=aoeTarget(cb,u,t,p.r); if(t){ for(const e of foes) if(dU(t,e)<=p.r) hitFx(cb,u,e,P*p.big,p); FX({type:'area',c:t.c,r:t.r,rad:p.r+.5,life:.8}); FX({type:'flash',life:.4}); fxText(cb,u,'¡Maremoto!','#7fc8ff'); } cb.cExtra=' · ¡maremoto!'; break; }
  // Mewtwo: Onda Mental en área; cada lanzamiento le da una carga psíquica (+4 % de daño de esta habilidad, todo el combate).
  // Cada 4.º lanzamiento, Juicio Psíquico sobre el enemigo con menos % de vida: lo ejecuta si está por debajo del umbral de sus estrellas; si no, otra descarga.
  // Energía psíquica = lanzamientos + bajas de Mewtwo: con 10 se vuelve Mega Mewtwo Y hasta el final del combate (radio +1 y una segunda descarga)
  case 'psy': { if(p.megaStart&&!u.megaOn) u.megaOn=true; const rad=p.r+(u.megaOn?1:0), dm=P*(u.star>=3&&p.m3?p.m3:p.m)*(1+(p.charge||0)*(u.psyC||0)), live=()=>foes.filter(e=>!e.dead);
    let c1=null; if(t){ c1=aoeTarget(cb,u,t,rad); FX({type:'proj',fc:u.c,fr:u.r,tc:c1.c,tr:c1.r,life:.28,big:true}); for(const e of live()) if(dU(c1,e)<=rad) hitFx(cb,u,e,dm,p); FX({type:'area',c:c1.c,r:c1.r,rad:rad+.5,life:.65}); }
    if(u.megaOn&&c1){ const rest=live().filter(e=>!(e.stealth>0)&&dU(c1,e)>rad); const c2=rest.length?aoeTarget(cb,u,rest[0],rad,c=>rest.filter(e=>dU(c,e)<=rad).length):null;
      if(c2&&dU(c1,c2)>rad){ for(const e of live()) if(dU(c2,e)<=rad) hitFx(cb,u,e,dm,p); FX({type:'area',c:c2.c,r:c2.r,rad:rad+.5,life:.65}); cb.cExtra+=' · doble descarga'; } }
    u.psyC=(u.psyC||0)+1; cb.cExtra+=` · carga ${u.psyC} (+${R0((p.charge||0)*u.psyC*100)}%)`;
    if(p.judge&&u.psyC%p.judge===0){ const order=cb.units; const j=live().filter(e=>!(e.stealth>0)).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.hp-b.hp||order.indexOf(a)-order.indexOf(b))[0];
      if(j){ u.judgeN=(u.judgeN||0)+1; const th=(p.th||[0,0,0])[Math.min(2,u.star-1)]*(j.creep&&u.star>=3?.25:1); FX({type:'proj',fc:u.c,fr:u.r,tc:j.c,tr:j.r,life:.3,big:true,color:'#d9a7ff'});
        if(j.hp/j.maxHp<=th){ dealDamage(cb,u,j,j.hp+j.shield+1,'true',false); fxText(cb,j,'¡Juicio!','#d9a7ff'); cb.cExtra+=' · ¡Juicio Psíquico!'; }
        else { hitFx(cb,u,j,dm*(p.judgeDmg||.6),{}); cb.cExtra+=' · descarga del Juicio'; } } }
    if(p.mega&&!u.megaOn&&u.psyC+(u.kills||0)>=p.mega){ u.megaOn=true; if(DEF.megamewtwo){ u.d=DEF.megamewtwo; u.name=DEF.megamewtwo.name; } fx(cb,{type:'flash',color:'#d9a7ff',life:.5}); fxText(cb,u,'¡Mega Mewtwo Y!','#d9a7ff'); cb.cExtra+=' · ¡se transforma en Mega Mewtwo Y!'; }
    break; }
  // Ho-Oh: golpe a un solo objetivo que le quita un % de armadura unos segundos (se renueva, no se acumula), cura a todo su equipo y cada N lanzamientos revive a un aliado
  case 'sacred': if(t){ FX({type:'proj',fc:u.c,fr:u.r,tc:t.c,tr:t.r,life:.32,big:true}); hitFx(cb,u,t,P*p.m,p); if(!t.dead&&p.arm){ if(!(t.armCut>0)){ t.armCut=t.df*p.arm; t.df-=t.armCut; } t.armT=p.armT||5; FX({type:'aura',u:t,life:p.armT||5,color:'#ff8a3a'}); cb.cExtra+=` · -${R0(p.arm*100)}% de armadura ${p.armT||5}s`; } }
    if(p.healAll) for(const a of allies) H(a,P*p.healAll); FX({type:'flash',color:'#ffb347',life:.35});
    if(p.rebirth&&(u.rbN=(u.rbN||0)+1)>=p.rebirth){ u.rbN=0; rebirthAlly(cb,u,p.phoenix||.4); } else if(p.rebirth) cb.cExtra+=` · renacer ${u.rbN}/${p.rebirth}`; break;
  case 'shield': SH(u,P*p.m,4); break;
  case 'taunt': SH(u,P*p.m*.6,4); u.tdr=.3; u.tdrT=3; for(const e of foes) if(dU(u,e)<=3) e.target=e.taunt=u; if(p.heal) H(u,P*p.heal); if(p.teamShield) for(const a of allies) SH(a,P*p.teamShield,4); FX({type:'area',c:u.c,r:u.r,rad:3.2,color:'#ff5a5a',life:.6,thin:true}); cb.cExtra=' · provoca'; break;
  case 'reflect': SH(u,P*p.m*.6,4); u.reflT=4; u.reflPct=p.pct||.4; if(p.heal) H(u,P*p.heal); FX({type:'aura',u,life:4,color:'#e6f0ff'}); cb.cExtra=` · refleja ${R0((p.pct||.4)*100)}%`; break;
  case 'harden': u.df+=p.df*u.star; u.mr+=p.df*u.star; H(u,P*p.heal); FX({type:'aura',u,life:1,color:'#c9c9c9'}); cb.cExtra=` · +${p.df*u.star} def/res`; break;
  case 'rest': H(u,P*p.m); if(p.sleep){ u.stun=Math.max(u.stun,p.sleep); u.sleepT=p.sleep; } break;
  // Rayo Lunar (Precisión Lunar): daña y cura a la vez; cada lanzamiento lo hace más fuerte
  case 'lunar': { const g=1+p.grow*((u.castN||1)-1); if(t){ FX({type:'proj',fc:u.c,fr:u.r,tc:t.c,tr:t.r,life:.3,big:true,color:'#ffd6f0'}); for(const e of foes) if(e===t||dU(t,e)<=1) hitFx(cb,u,e,P*p.m*g*(e===t?1:.5),p); FX({type:'area',c:t.c,r:t.r,rad:1.5,color:'#ffd6f0',life:.55}); }
    allies.sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp).slice(0,p.n).forEach(a=>{ FX({type:'proj',fc:u.c,fr:u.r,tc:a.c,tr:a.r,life:.3,heal:true}); H(a,P*p.heal*g); }); if(g>1) cb.cExtra+=` · ×${g.toFixed(1)}`; break; }
  case 'heal': allies.sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp).slice(0,p.n).forEach(a=>{ FX({type:'proj',fc:u.c,fr:u.r,tc:a.c,tr:a.r,life:.3,heal:true}); H(a,P*p.m); }); break;
  case 'teamShield': for(const a of allies){ SH(a,P*p.m,4); if(p.heal) H(a,P*p.heal); if(p.ap) a.ap+=p.ap; } FX({type:'flash',color:'#ffd6f0',life:.35}); break;
  case 'buff': for(const a of allies){ a.as=Math.min(3,a.as*(1+p.as)); if(p.heal) H(a,P*p.heal); FX({type:'arrows',c:a.c,r:a.r,life:.8}); } cb.cExtra=` · equipo +${R0(p.as*100)}% vel.`; break;
  case 'frenzy': u.as=Math.min(3,u.as*(1+p.as)); u.ad*=1+p.ad; u.ap+=p.ad*100; FX({type:'arrows',c:u.c,r:u.r,life:.8}); FX({type:'aura',u,life:1.2}); cb.cExtra=' · más rápido y fuerte'; break;
  case 'empower': u.empN=p.n; u.empDmg=P*p.m; u.empStun=p.stun||0; FX({type:'aura',u,life:1.2,color:'#ffd23f'}); cb.cExtra=` · próximos ${p.n} golpes potenciados`; break;
  case 'sing': { if(!p.all&&!p.pick&&p.r) t=aoeTarget(cb,u,t,p.r);
    // pick: duerme a N enemigos al azar (N = pick + estrellas − 1); sStar alarga el sueño por estrella
    let tg; if(p.pick){ const pool=foes.filter(e=>!(e.stealth>0)); tg=[]; for(let i=0,n=p.pick+u.star-1;i<n&&pool.length;i++) tg.push(pool.splice(Math.floor(cb.rng()*pool.length),1)[0]); } else tg=p.all?foes:t?foes.filter(e=>dU(t,e)<=(p.r||0)):[];
    const sl=p.s+(p.sStar||0)*(u.star-1); let tot=0; for(const e of tg){ const b=e.hp; abilDamage(cb,u,e,P*p.m); if(!e.dead){ stunUnit(e,sl,true); cb.cStun=true; FX({type:'area',c:e.c,r:e.r,rad:.6,color:'#c9a7ff',life:.7,notes:true}); } tot+=Math.max(0,b-e.hp); } if(t) FX({type:'area',c:t.c,r:t.r,rad:p.all?6:(p.r||0)+.5,color:'#c9a7ff',life:.7,notes:true}); if(p.drain) H(u,tot*p.drain); if(p.healTeam) for(const a of allies) H(a,P*p.healTeam); cb.cExtra=' · duerme'; break; }
  case 'drain': if(t){ const b=t.hp; hitFx(cb,u,t,P*p.m,p); const d=Math.max(0,b-t.hp); FX({type:'proj',fc:t.c,fr:t.r,tc:u.c,tr:u.r,life:.4,heal:true}); const who=p.ally?allies.sort((a,b2)=>a.hp/a.maxHp-b2.hp/b2.maxHp)[0]:u; if(who) H(who,d*p.h); } break;
  case 'gold': { if(!p.all&&p.r) t=aoeTarget(cb,u,t,p.r); const tg=p.all?foes:t?(p.r?foes.filter(e=>dU(t,e)<=p.r):[t]):[]; for(const e of tg){ FX({type:'coins',fc:u.c,fr:u.r,tc:e.c,tr:e.r,life:.5}); hitFx(cb,u,e,P*p.m,p); } break; }
  case 'stack': if(t){ FX({type:'proj',fc:u.c,fr:u.r,tc:t.c,tr:t.r,life:.25}); hitFx(cb,u,t,P*p.m,p); } gainStacks(u,p.hp*u.star,p.ad*u.star); fxText(cb,u,`+${p.hp*u.star} PS`,'#7dff9b'); cb.cExtra=` · +${p.hp*u.star} vida y +${p.ad*u.star} ataque para siempre`; break;
  case 'splash': FX({type:'area',c:u.c,r:u.r,rad:.5,life:.5,el:'Agua'}); fxText(cb,u,'¡Pero no pasó nada!','#9aa4c0'); cb.cExtra=' · no pasó nada'; break;
  case 'copy': { if(!u.copied){ const src=foes.filter(e=>!e.creep).sort((a,b)=>b.cost-a.cost||b.star-a.star)[0]; u.copied=src&&src.ab[0]!=='copy'?src.ab:['nova','Golpe',{r:1,m:.8}]; } cb.cExtra=` → copia ${u.copied[1]}`; if(depth<2) castAbility(cb,u,u.copied,depth+1); break; }
  case 'metro': { const m=pickR(cb,METRO); cb.cExtra=` → ${m[1]}`; if(depth<2) castAbility(cb,u,m,depth+1); break; }
  // ---- mecánicas nuevas ----
  case 'cone': if(t){ t=aoeDir(cb,u,t,{len:p.len||2,half:.55}); for(const e of dirTargets(cb,u,t,{len:p.len||2,half:.55})) hitFx(cb,u,e,P*p.m,p); FX({type:'cone',fc:u.c,fr:u.r,tc:t.c,tr:t.r,len:p.len||2,life:.7}); } break;
  case 'wave': if(t){ t=aoeDir(cb,u,t,{w:p.w||1.3}); for(const e of dirTargets(cb,u,t,{w:p.w||1.3})){ hitFx(cb,u,e,P*p.m,p); if(p.push&&!e.dead) shove(cb,e,u.c,u.r,p.push,true); } FX({type:'wave',fc:u.c,fr:u.r,tc:t.c,tr:t.r,w:p.w||1.3,life:.9});
    if(p.healTeam) for(const a of allies) H(a,P*p.healTeam); if(p.asTeam) for(const a of allies){ a.as=Math.min(3,a.as*(1+p.asTeam)); FX({type:'arrows',c:a.c,r:a.r,life:.8}); } if(p.push) cb.cExtra=' · empuja'; } break;
  case 'strike': if(t){ if(p.r) t=aoeTarget(cb,u,t,p.r); const c=t.c, r=t.r, rad=p.r||0, d=p.delay||.6; FX({type:'tele',c,r,rad:rad+.5,life:d}); cb.cExtra=` · cae en ${d}s`;
    later2(cb,d,()=>{ if(u.dead&&!p.ghost) return; const pc=cb.caster; cb.caster=null; for(const e of near(c,r,rad)) hitFx(cb,u,e,P*p.m,p); cb.caster=pc; FX({type:'strike',c,r,rad:rad+.5,life:.75}); }); } break;
  case 'zone': { if(t&&!p.self&&!p.ally) t=aoeTarget(cb,u,t,p.r||1); const center=p.ally?allyCluster(cb,u,p.r||1):p.self||!t?u:t, c=center.c, r=center.r, rad=p.r||1, dur=p.dur||3, n=Math.round(dur/.5);
    FX({type:'zone',c,r,rad:rad+.5,life:dur,heal:!!p.ally});
    for(let i=1;i<=n;i++) later2(cb,i*.5,()=>{ if(u.dead) return;
      if(p.ally){ HEALER=u; for(const a of cb.units) if(!a.dead&&a.side===u.side&&hexDist(a.c,a.r,c,r)<=rad){ heal(a,P*p.m/n); if(i%2===0) FX({type:'plus',c:a.c,r:a.r,life:.6}); } HEALER=null; return; }
      for(const e of near(c,r,rad)){ abilDamage(cb,u,e,P*p.m/n); if(e.dead) continue; if(i===1&&(p.root||p.sleep)) stunUnit(e,p.root||p.sleep,!!p.sleep); if(p.burn) addBurn(e,u,p.burn*e.maxHp,2,'abil'); if(p.chill) e.chillT=Math.max(e.chillT||0,1); } });
    cb.cExtra=` · zona ${dur}s`; break; }
  case 'knock': if(t){ hitFx(cb,u,t,P*p.m,p); FX({type:'hits',c:t.c,r:t.r,n:2,life:.5}); if(!t.dead&&shove(cb,t,u.c,u.r,p.k||2,true)) { cb.cExtra=' · lo lanza lejos'; FX({type:'trail',fc:t.pc,fr:t.pr,tc:t.c,tr:t.r,life:.45}); } } break;
  case 'pull': { if(t&&!p.self) t=aoeTarget(cb,u,t,p.r||2); const center=p.self||!t?u:t, c=center.c, r=center.r, rad=p.r||2; const tg=near(c,r,rad).sort((a,b)=>hexDist(a.c,a.r,c,r)-hexDist(b.c,b.r,c,r));
    for(const e of tg){ if(e!==center) shove(cb,e,c,r,2,false); hitFx(cb,u,e,P*p.m,p); } FX({type:'vortex',c,r,rad:rad+.5,life:.9}); cb.cExtra=' · atrae'; break; }
  case 'seed': if(t){ hitFx(cb,u,t,P*p.m*.25,p); const b=addBurn(t,u,P*p.m*.75/(p.dur||4),p.dur||4,'seed'); b.leech=p.h||1; FX({type:'tether',u,t,life:p.dur||4}); cb.cExtra=' · drena con el tiempo'; } break;
  case 'poison': { if(t&&p.r) t=aoeTarget(cb,u,t,p.r); const tg=t?(p.r?foes.filter(e=>dU(t,e)<=p.r):[t]):[]; if(t) FX({type:'proj',fc:u.c,fr:u.r,tc:t.c,tr:t.r,life:.3,big:true});
    for(const e of tg){ abilDamage(cb,u,e,P*p.m*.3); if(e.dead) continue; addBurn(e,u,P*p.m*.7/(p.dur||5),p.dur||5,'poison'); e.woundT=Math.max(e.woundT||0,p.dur||5); FX({type:'aura',u:e,life:p.dur||5,color:'#b25bd6',el:'Veneno'}); } cb.cExtra=' · envenena (cura a la mitad)'; break; }
  case 'mark': if(t){ hitFx(cb,u,t,P*p.m,p); if(!t.dead){ t.markT=p.dur||4; t.markAmp=p.amp||.25; FX({type:'mark',u:t,life:p.dur||4}); } cb.cExtra=` · +${R0((p.amp||.25)*100)}% de daño recibido`; } break;
  case 'spin': { const n=p.n||4; u.tdr=Math.max(u.tdr,p.dr||0); u.tdrT=Math.max(u.tdrT,n*.3); FX({type:'spin',u,life:n*.3});
    for(let i=0;i<n;i++) later2(cb,i*.3,()=>{ if(u.dead) return; for(const e of foesOf(cb,u)) if(dU(u,e)<=1) abilDamage(cb,u,e,P*p.m); }); cb.cExtra=` · ${n} giros`; break; }
  // ---- legendarios ----
  // Escudo enorme según su vida y golpes en área mientras dura (estilo Mordekaiser)
  case 'titan': { const amt=u.maxHp*(p.hp||.4); SH(u,amt,p.dur||5); u.tdr=Math.max(u.tdr,p.dr||0); u.tdrT=Math.max(u.tdrT,p.dur||5); const n=p.n||6, rad=p.r||1; FX({type:'spin',u,life:n*.45});
    if(p.stun){ for(const e of near(u.c,u.r,rad+1)){ stunUnit(e,p.stun); cb.cStun=true; } FX({type:'area',c:u.c,r:u.r,rad:rad+1.5,life:.6,quake:true}); } // terremoto inicial: aturde a los que estén a 2 casillas
    for(let i=0;i<n;i++) later2(cb,i*.45,()=>{ if(u.dead) return; for(const e of foesOf(cb,u)) if(dU(u,e)<=rad) abilDamage(cb,u,e,abilPower(u)*p.m); FX({type:'area',c:u.c,r:u.r,rad:rad+.5,life:.4,quake:i%2===0}); });
    cb.cExtra=` · escudo de ${R0(amt)} y ${n} golpes`; break; }
  // Arrastra al enemigo más débil a su mundo: daño durante 2 s y, si cae, se queda con parte de su fuerza PARA SIEMPRE (estilo Tahm Kench)
  case 'devour': { const v=foes.filter(e=>!(e.stealth>0)).sort((a,b)=>a.hp-b.hp)[0]; if(!v) break; teleportNear(cb,u,v); stunUnit(v,p.dur||2); v.stealth=0; FX({type:'tether',u,t:v,life:p.dur||2}); FX({type:'vortex',c:v.c,r:v.r,rad:1,life:p.dur||2});
    const ticks=4; let got=false; for(let i=1;i<=ticks;i++) later2(cb,i*(p.dur||2)/ticks,()=>{ if(u.dead||got) return; if(!v.dead) abilDamage(cb,u,v,P*p.m/ticks); if(v.dead&&!got){ got=true; u.devN=(u.devN||0)+1; gainStacks(u,p.ghp||40,p.gad||4); fxText(cb,u,`¡Devorado! +${p.ghp||40} PS`,'#c9a7ff'); } });
    cb.cExtra=' · si lo derrota, crece para siempre'; break; }
  case 'slam': { const rad=p.r||1; let best=null, bs=-1;
    for(let r=0;r<8;r++) for(let c=0;c<7;c++){ if(!(c===u.c&&r===u.r)&&!freeCell(cb,c,r,u)) continue; const n=near(c,r,rad).length; const sc=n*10-hexDist(c,r,u.c,u.r)*.1; if(n>0&&sc>bs){ bs=sc; best=[c,r]; } }
    if(best){ FX({type:'leap',fc:u.c,fr:u.r,tc:best[0],tc2:best[1],tr:best[1],life:.35}); u.pc=u.c; u.pr=u.r; [u.c,u.r]=best; u.mt=0; u.stun=Math.max(u.stun,.3);
      later2(cb,.3,()=>{ if(u.dead) return; for(const e of near(u.c,u.r,rad)) hitFx(cb,u,e,P*p.m,p); FX({type:'area',c:u.c,r:u.r,rad:rad+.5,life:.7,quake:true}); }); cb.cExtra=' · salta al grupo'; } break; }
 }
 if(depth===0){
   if(u.echo&&!u.echoing&&!u.dead){ u.echoing=true; cb.cExtra+=' · ¡doble lanzamiento!'; castAbility(cb,u,ab,1); u.echoing=false; }
   if(p.g){ const g=p.g+(u.star-1)+(u.payDay||0); const before=cb.gold[u.side]; cb.gold[u.side]=Math.min(12,before+g); if(cb.gold[u.side]>before){ if(u.ref&&!NO_PERMA) u.ref.goldGen=(u.ref.goldGen||0)+cb.gold[u.side]-before; fxText(cb,u,`+${cb.gold[u.side]-before} 💰`,'#ffd23f'); cb.cExtra+=` · +${cb.gold[u.side]-before} oro`; } }
   if(p.stk) gainStacks(u,15,2);
   // Crecimiento dentro del combate: las 3★ y algunos legendarios pegan más cada vez que lanzan su habilidad
   const grow=(p.grow||0)+(u.star>=3&&!u.creep?(u.cost>=4?.25:.2):0); if(grow){ u.castBoost=(u.castBoost||0)+grow; cb.cExtra+=` · +${R0(grow*100)}% de poder (${R0(u.castBoost*100)}%)`; }
   // Recupera maná por cada enemigo derrotado con la habilidad: puede encadenar lanzamientos
   if(p.refundKill&&cb.cKills>0){ u.mana+=u.maxMana*p.refundKill*cb.cKills; cb.cExtra+=' · ¡recupera maná!'; }
   if(p.markAll) for(const e of foesOf(cb,u)){ e.markT=Math.max(e.markT||0,p.markDur||5); e.markAmp=Math.max(e.markAmp||0,p.markAll); }
   if(u.sp.healCast) heal(u,u.maxHp*u.sp.healCast);
   if(p.mega){ const g=u.maxHp*.06; u.maxHp+=g; heal(u,g); u.ap+=8; u.ad+=u.ad0*.08; cb.cExtra+=' · se fortalece'; }
   if(p.selfAs&&k!=='dash'){ u.as=Math.min(5,u.as*(1+p.selfAs)); cb.cExtra+=` · +${R0(p.selfAs*100)}% de vel. de ataque`; }
   if(cb.visual){ cb.feed.push({s:u.side,n:u.name,mv:name,ic:elIcon(el)||'🐾',d:R0(cb.cDmg),h:cb.cHits.size,hl:R0(cb.cHeal),sh:R0(cb.cShield),st:cb.cStun,k:cb.cKills,x:cb.cExtra}); if(cb.feed.length>12) cb.feed.shift(); cb.feedV++; }
   cb.caster=null; HEALER=null;
 }
}
function stepCombat(cb){
 if(cb.done) return;
 if(!cb.started){
   cb.started=true;
   for(const f of cb.startFns||[]) f(cb);
   for(const side of cb.huntPend||[]){ const foes=cb.units.filter(e=>e.side!==side); const t=foes.sort((a,b)=>b.maxHp-a.maxHp)[0]; if(t){ t.markT=99; t.markAmp=Math.max(t.markAmp||0,.2); t.hunted=side; } }
   for(const u of cb.units){ if(u.startShield){ u.shield+=u.startShield; u.shieldT=8; } if(u.sp.startShieldPct){ u.shield+=u.maxHp*u.sp.startShieldPct; u.shieldT=8; } }
   for(const u of cb.units) if(u.sp.veil) for(const a of cb.units) if(a!==u&&a.side===u.side&&dU(u,a)<=1){ a.shield+=u.sp.veil; a.shieldT=Math.max(a.shieldT,8); }
   // Agro inicial de tanques, una sola vez y con las posiciones iniciales (antes de que nadie se mueva). Solo gasta azar si hay un tanque a tiro:
   // sin tanques a su alcance, nadie cambia y el combate es idéntico al de antes de esta regla
   for(const u of cb.units) if(!u.dead&&!u.target){ const t=pickInitialTarget(cb,u); if(t) u.target=t; }
   for(const u of cb.units){
     // Los asesinos ya no saltan a la retaguardia al empezar: entran por delante y la sinergia Asesino los hace esfumarse al 50 %
   }
 }
 cb.t+=DT;
 // Guardianes: a los 1,5 s provocan a los enemigos cercanos y se cubren con un escudo
 if(!cb.bgDone&&cb.t>=1.5){ cb.bgDone=true; for(const g of cb.units) if(g.bodyguard&&!g.dead){ const amt=g.maxHp*g.bodyguard; g.shield+=amt; g.shieldT=Math.max(g.shieldT,4); for(const e of cb.units) if(!e.dead&&e.side!==g.side&&dU(g,e)<=2) e.target=e.taunt=g; fxText(cb,g,'¡Provoca!','#9fd0ff'); fx(cb,{type:'area',c:g.c,r:g.r,rad:2.2,color:'#9fd0ff',life:.6,thin:true}); } }
 if(cb.pend&&cb.pend.length){ const due=cb.pend.filter(q=>q.at<=cb.t+1e-9); if(due.length){ cb.pend=cb.pend.filter(q=>q.at>cb.t+1e-9); for(const q of due) q.run(); } }
 for(const u of cb.units){
   if(u.dead) continue;
   u.mt+=DT; u.flash=Math.max(0,u.flash-DT); u.glow=Math.max(0,u.glow-DT);
   if(u.shieldT>0){ u.shieldT-=DT; if(u.shieldT<=0) u.shield=0; }
   if(u.stealth>0) u.stealth-=DT; if(u.tdrT>0) u.tdrT-=DT; if(u.reflT>0) u.reflT-=DT; if(u.sleepT>0) u.sleepT-=DT;
   if(u.woundT>0) u.woundT-=DT; if(u.chillT>0) u.chillT-=DT; if(u.markT>0) u.markT-=DT;
   if(u.armT>0){ u.armT-=DT; if(u.armT<=0&&u.armCut>0){ u.df+=u.armCut; u.armCut=0; } }
   // Quemaduras, veneno y drenadoras (estas curan a quien las lanzó)
   for(const b of u.burns){ if(b.t>0&&!u.dead){ b.t-=DT; const hp0=u.hp; dealDamage(cb,b.src,u,b.dps*DT,'true',true); if(b.leech&&b.src&&!b.src.dead) heal(b.src,(hp0-u.hp)*b.leech); } }
   u.burns=u.burns.filter(b=>b.t>0);
   if(u.dead) continue;
   if(u.regen) heal(u,u.maxHp*u.regen*DT);
   if(u.dragonRamp&&(u.drgGain||0)<u.dragonCap){ const g=Math.min(u.dragonRamp*DT,u.dragonCap-(u.drgGain||0)); u.drgGain=(u.drgGain||0)+g; u.dmgBonus+=g; }
   if(u.rushT>0) u.rushT-=DT; if(u.rocketT>0){ u.rocketT-=DT; heal(u,u.maxHp*u.rocketRg*DT); }
   if(u.manaRegen) u.mana+=u.manaRegen*DT;
   if(u.sp.rampAp){ u.ap+=u.sp.rampAp*DT; u.apGain=(u.apGain||0)+u.sp.rampAp*DT; }
   if(u.sp.aura){ u.auraT=(u.auraT||0)+DT; if(u.auraT>=5){ u.auraT=0; for(const a of cb.units) if(!a.dead&&a.side===u.side) heal(a,a.maxHp*u.sp.aura); } }
   if(u.sp.sunfire){ u.sunT=(u.sunT||0)+DT; if(u.sunT>=1){ u.sunT=0; for(const e of cb.units) if(!e.dead&&e.side!==u.side&&dU(u,e)<=1) dealDamage(cb,u,e,e.maxHp*u.sp.sunfire,'true',true); } }
   if(u.stun>0){ u.stun-=DT; continue; }
   if(!u.target||u.target.dead||u.target.stealth>0) u.target=nearestEnemy(cb,u);
   if(!u.target) continue;
   if(u.mana>=u.maxMana){ u.mana=u.sp.refund||0; castAbility(cb,u,u.ab); continue; }
   let d=dU(u,u.target);
   // Como en TFT: el objetivo se mantiene mientras está a su alcance; si no lo está y otro enemigo sí, pasa a ese (no ignora al que tiene delante),
   // y al caminar va a por el enemigo al que llega antes (nextStep con any: sin rodeos). Quien fue provocado (Guardián, Provocar) sigue yendo a por quien lo provocó.
   const free=u.target!==u.taunt;
   if(d>u.range&&free){ const n=closerFoe(cb,u,u.range+1); if(n){ u.target=n; d=dU(u,n); } }
   if(d<=u.range){ u.atkCd-=DT; if(u.atkCd<=0){ u.atkCd=1/(u.as*(u.chillT>0?.65:1)*(u.rushT>0?u.rushMul:1)); attack(cb,u,u.target); } }
   else { u.moveCd-=DT; if(u.moveCd<=0){ const s=nextStep(cb,u,u.target,free); if(s){ u.target=s[2]; u.pc=u.c;u.pr=u.r;u.c=s[0];u.r=s[1];u.mt=0; } else u.target=nearestEnemy(cb,u); u.moveCd=.35; } }
 }
 const a0=cb.units.some(u=>!u.dead&&u.side===0), a1=cb.units.some(u=>!u.dead&&u.side===1);
 if(!a0||!a1){ cb.done=true; cb.winner=a0?0:a1?1:null; }
 else if(cb.t>COMBAT_T){ cb.done=true; cb.winner=null; }
 // Oro ganado en combate (Día de Pago, Gholdengo, Team Rocket, aumentos…): se apunta con su segundo para cobrarlo en ese momento
 if(cb.gold){ const gl=cb.gl||(cb.gl=[0,0]); for(let sd=0;sd<2;sd++) if(cb.gold[sd]>gl[sd]){ (cb.goldEv=cb.goldEv||[]).push([cb.t,sd,cb.gold[sd]-gl[sd]]); gl[sd]=cb.gold[sd]; } }
}
function simulate(cb){ let g=0; while(!cb.done&&g++<2000) stepCombat(cb); cb.done=true; }
const survivors=(cb,side)=>cb.units.filter(u=>!u.dead&&u.side===side).reduce((s,u)=>s+(u.star>=3?2:1),0);

/* ============================== [BOTS] ============================== */
// Niveles de los bots: cambian sus decisiones (economía, refrescos, nivel, colocación, objetos y aumentos), nunca sus estadísticas
const BOT_SKILL={
 principiante:{lvl:-1,reserve:10,rolls:0,randBuy:.4,randPlace:true,skipEquip:.5},
 intermedio:{lvl:0,reserve:0,rolls:0,randBuy:0},
 avanzado:{lvl:1,reserve:-10,rolls:3,randBuy:0,smart:true},
 experto:{lvl:1,reserve:-10,rolls:3,randBuy:0,smart:true,econ:true,carry:true},
 maestro:{lvl:2,reserve:-10,rolls:6,randBuy:0,smart:true,econ:true,carry:true},
};
const DIFF_SKILL={facil:'principiante',normal:'intermedio',dificil:'avanzado'};
const botSkill=p=>BOT_SKILL[p.skill]||BOT_SKILL[DIFF_SKILL[G.diff]||'intermedio'];
function botValue(u,counts){ const d=DEF[u.defId]; return d.cost*Math.pow(3,u.star-1)+u.items.length*1.5+d.traits.reduce((s,t)=>s+(counts[t]||0)*.35,0); }
function botMakeRoom(p,key){
 const counts=traitCountsOf(allUnits(p));
 const cand=p.bench.map((u,i)=>({u,i})).filter(x=>x.u&&x.u.baseId!==key&&countSame(p,x.u.baseId,x.u.star)<2).sort((a,b)=>botValue(a.u,counts)-botValue(b.u,counts));
 if(!cand.length) return false; sellAt(p,{i:cand[0].i}); return true;
}
function botShop(p,reserve){
 const easy=botSkill(p).randBuy>0;
 let bought=true, guard=0;
 while(bought&&guard++<10){
   bought=false; const all=allUnits(p); const counts=traitCountsOf(all);
   const top=Object.entries(counts).filter(e=>e[0]!=='Legendario').sort((a,b)=>b[1]-a[1]).slice(0,2).map(x=>x[0]);
   for(let i=0;i<5;i++){
     const k=p.shop[i]; if(!k) continue; const d=DEF[k];
     const copies=all.filter(u=>u.baseId===k).length;
     let want=copies>0||d.traits.some(t=>top.includes(t))||all.length<maxBoard(p)+2||(d.cost>=4&&p.level>=7);
     if(easy&&Math.random()<botSkill(p).randBuy) want=false;
     const budget=copies>=2?0:reserve;
     if(!want||p.gold-d.cost<budget) continue;
     if(!canBuy(p,i)&&!botMakeRoom(p,k)) continue;
     if(buy(p,i)) bought=true;
   }
 }
}
function placeBot(p,u){
 const role=DEF[u.defId].role, C=[3,2,4,1,5,0,6]; let order;
 if(botSkill(p).randPlace) order=shuffle([0,1,2,3].flatMap(r=>C.map(c=>[c,r])));
 else if(role==='t'||role==='b') order=[0,1].flatMap(r=>C.map(c=>[c,r]));
 else if(role==='a') order=[[0,3],[6,3],[1,3],[5,3],[0,2],[6,2]];
 else order=[3,2].flatMap(r=>C.map(c=>[c,r]));
 order=order.concat([0,1,2,3].flatMap(r=>C.map(c=>[c,r])));
 for(const [c,r] of order){ const k=c+','+r; if(!p.board[k]){ p.board[k]=u; return; } }
}
function botArrange(p){
 const all=allUnits(p); p.board={}; p.bench=Array(BENCH).fill(null);
 const counts=traitCountsOf(all); all.sort((a,b)=>botValue(b,counts)-botValue(a,counts));
 const n=p.level+p.mods.boardBonus+all.filter(u=>u.items.includes('master')).length, chosen=[], rest=[], seen=new Set();
 for(const u of all){ if(chosen.length<n&&!seen.has(u.defId)){ chosen.push(u); seen.add(u.defId); } else rest.push(u); }
 while(chosen.length<n&&rest.length) chosen.push(rest.shift());
 for(const u of chosen) placeBot(p,u);
 // Expertos: su mejor atacante (el que más objetos lleva) va a una esquina trasera, lejos del centro
 if(botSkill(p).carry){ const ks=Object.keys(p.board), car=ks.map(k=>p.board[k]).filter(u=>!['t','b'].includes(DEF[u.defId].role)).sort((a,b)=>b.items.length-a.items.length||botValue(b,counts)-botValue(a,counts))[0];
   if(car){ const from=ks.find(k=>p.board[k]===car), to=['0,3','6,3'].find(k=>k!==from); if(from&&to&&!['0,3','6,3'].includes(from)){ const o=p.board[to]; p.board[to]=car; if(o) p.board[from]=o; else delete p.board[from]; } } }
 for(const u of rest){ const j=p.bench.findIndex(x=>!x); if(j>=0) p.bench[j]=u; else { p.gold+=sellValue(u); returnToPool(u.baseId,Math.pow(3,u.star-1)); for(const it of u.items) giveItem(p,it); } }
}
function botEquip(p){
 if(botSkill(p).skipEquip&&Math.random()<botSkill(p).skipEquip) return;
 const comps=shuffle(p.items.filter(k=>ITEMS[k].comp)), rest=p.items.filter(k=>!ITEMS[k].comp);
 while(comps.length>=2){ const a=comps.pop(), b=comps.pop(); rest.push(combineKey(a,b)); }
 p.items=[...rest,...comps];
 const counts=traitCountsOf(allUnits(p)), carry=u=>['r','m','a'].includes(DEF[u.defId].role)?2:0;
 const units=boardUnits(p).sort((a,b)=>botValue(b,counts)+carry(b)-botValue(a,counts)-carry(a));
 const left=[];
 for(const it of p.items){ let ok=false; for(const u of units){ if(addItemToUnit(u,it).ok){ ok=true; break; } } if(!ok) left.push(it); }
 p.items=left;
}
function botPlan(p){
 const R=G.round, s=R.s, K=botSkill(p);
 let tgt=s===1?3:s===2?(R.n<=3?4:5):s===3?(R.n<=2?6:7):s===4?8:s===5?9:10;
 if(K.lvl<0) tgt=Math.max(2,tgt+K.lvl);
 if(K.lvl>0&&s>=3) tgt=Math.min(10,tgt+(R.n>=4||K.lvl>1?1:0));
 let reserve=s<=1?0:s===2?10:30; if(p.hp<45) reserve=10; if(p.hp<25) reserve=0;
 if(K.reserve>0) reserve+=K.reserve; if(K.reserve<0&&p.hp<60) reserve=Math.max(0,reserve+K.reserve);
 // Economía de experto: guarda 50 de oro para el interés máximo mientras tiene vida, y en 4-1 gasta todo para estabilizar
 if(K.econ){ if(s>=2&&s<=4&&p.hp>=55) reserve=Math.max(reserve,50); if((s===4&&R.n<=2)||p.hp<35) reserve=Math.min(reserve,10); }
 let g=0; while(p.level<tgt&&p.gold-4>=Math.min(reserve,20)&&g++<40) buyXp(p);
 botShop(p,reserve);
 let rolls=0; let maxRolls=p.hp<40?12:s>=5?6:p.gold>60?3:0;
 if(K.randBuy>0) maxRolls=0; else maxRolls+=K.rolls; if(K.econ&&s===4&&R.n<=2) maxRolls=Math.max(maxRolls,15);
 while(rolls<maxRolls&&(p.freeRerolls>0||p.gold-2>=reserve)){ reroll(p); rolls++; botShop(p,reserve); }
 while(p.freeRerolls>0){ reroll(p); botShop(p,reserve); }
 botArrange(p); botEquip(p);
}

/* ============================ [AUGMENTS] ============================ */
function giveRandom(p,cost){ const k=drawUnitOfCost(cost,threeStarSet(p)); if(k) giveUnitTo(p,k); return k; }
// El catálogo de aumentos y su motor de efectos están en augments.js (se carga antes que este archivo)
const TIER_NAME={S:'Plata',G:'Oro',P:'Prismático'};
function rollAugTiers(){
 const a1=weighted([[26,'S'],[65,'G'],[9,'P']]);
 const T2={S:[[36,'S'],[61,'G'],[4,'P']],G:[[28,'S'],[48,'G'],[24,'P']],P:[[50,'S'],[30,'G'],[20,'P']]};
 const a2=weighted(T2[a1]);
 const T3={S:{S:[[50,'G'],[50,'P']],G:[[71,'G'],[29,'P']],P:[[100,'P']]},G:{S:[[90,'G'],[10,'P']],G:[[65,'G'],[35,'P']],P:[[35,'S'],[59,'G'],[6,'P']]},P:{S:[[80,'G'],[20,'P']],G:[[67,'G'],[33,'P']],P:[[50,'G'],[50,'P']]}};
 return [a1,a2,weighted(T3[a1][a2])];
}

/* ============================== [LOOT] ============================== */
const ORBS={
 gray12:{icon:'⚪',t:[[48,['u1','u1']],[47,['u2']],[3,['g2','c']],[1,['g2','c']],[1,['dup']]]},
 gray3:{icon:'⚪',t:[[49,['u3']],[46,['g1','u2']],[3,['g3','c']],[1,['g3','c']],[1,['dup']]]},
 blue123:{icon:'🔵',t:[[33,['u3','u3']],[31,['g3','u3']],[31,['u2','u2','u2']],[2,['u2','u2','dup']],[2,['g6','c']],[1,['u3','dup']]]},
 blue4:{icon:'🔵',t:[[49,['g4','u4']],[47,['g2','u3','u3']],[3,['g8','c']],[1,['g3','dup']]]},
 gold23:{icon:'🟡',t:[[20,['g15']],[18,['fa']],[15,['g4','m','c']],[15,['g6','u4','u4']],[13,['g2','u3','u3','u3','u3']],[10,['g1','c']],[3,['g6','dup']],[3,['g2','dup','dup']],[3,['g5','u3','u3','u3']]]},
 gold4:{icon:'🟡',t:[[21,['g13','u5']],[21,['g2','ca','ca']],[16,['g10','u4','u4']],[16,['g2','fa']],[11,['g3','c']],[5,['g8','dup']],[5,['g7','u5','u5']],[5,['g1','ca','m','c']]]},
 prism:{icon:'🌈',t:[[15,['fa','fa','c']],[15,['fa','ca','c']],[15,['g24','u5']],[15,['g10','fa']],[15,['g18','ca','fa','m']],[15,['g18','ca','ca','m']],[10,['g25','fa','c']]]},
};
function grant(p,tok,out){
 const m=tok.match(/^([a-z]+)(\d*)$/); const k=m[1], n=+m[2]||0;
 if(k==='g'){ p.gold+=n; out.push(`${n} de oro`); }
 else if(k==='u'){ const key=drawUnitOfCost(n,threeStarSet(p)); if(key){ giveUnitTo(p,key); out.push(DEF[key].name); } }
 // Medallas al azar: ninguna en la fase 1 (para no empezar con 2 o 3 emblemas) y un 5 % después
 else if(k==='c'){ const it=giveItem(p,G.round&&G.round.s>=2&&Math.random()<.05?'medal':pick(BASIC)); out.push(ITEMS[it].icon+' '+ITEMS[it].name); }
 else if(k==='m'){ giveItem(p,'medal'); out.push('🏅 Medalla'); }
 else if(k==='mag'){ giveItem(p,'magnet'); out.push('🧲 Imán Removedor'); }
 else if(k==='dup'){ const own=allUnits(p).filter(u=>!DEF[u.baseId].evoOf&&u.star<3&&G.pool[u.baseId]>0); if(own.length){ const u=pick(own); G.pool[u.baseId]--; giveUnitTo(p,u.baseId); out.push('🧬 Copia de '+DEF[u.baseId].name); } else { p.gold+=3; out.push('3 de oro'); } }
 else if(k==='ca'||k==='fa'){ const opts=shuffle((k==='ca'?BASIC:FULL_KEYS).slice()).slice(0,4);
   if(p===G.me&&!p.isBot&&!G.auto&&!NO_ANVIL){ G.anvils.push({kind:k,opts}); out.push(k==='ca'?'⚒️ Yunque de componentes':'⚒️ Yunque de objeto'); }
   else { const it=giveItem(p,pick(opts)); out.push('⚒️ '+ITEMS[it].name); } }
}
let NO_ANVIL=false; // al abrir orbes de golpe (empieza el combate) los yunques eligen solos
// Orbe de botín: color según lo bueno que es (gris, dorado o prismático) y contenido ya decidido al soltarlo
const ORB_TIER=k=>k==='prism'?'prism':/^(gray|c$|mag$)/.test(k)?'gray':'gold';
function dropOrb(p,key,at){ const toks=ORBS[key]?weighted(ORBS[key].t):[key]; G.orbSeq=(G.orbSeq||0)+1; p.orbs.push({id:G.orbSeq,tier:ORB_TIER(key),toks,c:at?at.c:null,r:at?at.r:null}); }
// Un orbe con Pokémon dentro no se abre (ni a mano ni solo al empezar el combate) si no caben en el banquillo: espera en el suelo a que hagas sitio
const orbUnits=o=>o.toks&&o.toks.length?o.toks.filter(t=>/^(u\d|dup$)/.test(t)).length:(o.nu|0);
const benchFree=p=>p.bench.filter(x=>!x).length;
const orbBlocked=(p,o)=>!p.isBot&&orbUnits(o)>benchFree(p); // los rivales generados los abren siempre (si no cabe, oro): así no se les acumulan
function openPlayerOrb(p,id,quick){
 const i=p.orbs.findIndex(o=>o.id===id); if(i<0||orbBlocked(p,p.orbs[i])) return null;
 const o=p.orbs.splice(i,1)[0], out=[]; NO_ANVIL=!!quick; for(const t of o.toks) grant(p,t,out); NO_ANVIL=false;
 note(p,`${{gray:'⚪',gold:'🟡',prism:'🌈'}[o.tier]} Orbe: ${out.join(', ')}`,true); return o;
}
function openOrb(p,key,out){ const O=ORBS[key]; const sub=[]; for(const t of weighted(O.t)) grant(p,t,sub); out.push(`${O.icon} ${sub.join(', ')}`); }
// Botín de una ronda PvE como lista de orbes (para soltarlos uno a uno al derrotar a cada salvaje)
function pveLootKeys(p,R){
 const s=R.s,n=R.n; let orbs=[],comps=0,extra=[];
 if(s===1){ if(n<=2){orbs=['gray12'];comps=1;} else {orbs=['blue123'];comps=2;} }
 else if(s===2){ orbs=['gray12','blue123']; comps=1; }
 else if(s===3){ orbs=['gray3',Math.random()<.3?'gold23':'blue123']; comps=1; }
 else if(s===4){ orbs=['blue4',Math.random()<.4?'gold4':'blue4']; extra=['fa']; }
 else { orbs=['gold4',Math.random()<.15?'prism':'blue4']; extra=['ca']; }
 return [...(s>1||n===3?['mag']:[]),...Array(comps).fill('c'),...extra,...orbs];
}
// Suelta los orbes de los salvajes ya derrotados (en solitario, según el combate en vivo; en el servidor, según el tiempo)
function payCombatGold(final){
 if(G.phase!=='combat'&&!final) return;
 for(const f of G.fights||[]){ const c=f.c; if(!c||!c.gold) continue; const el=final?Infinity:(Date.now()-(f.t0||0))/1000*G.speed; f.paid=f.paid||[0,0];
   for(const [p,sd] of [[f.a,0],[f.pve||f.ghost?null:f.b,1]]){ if(!p) continue;
     const due=final?c.gold[sd]:(c.goldEv||[]).reduce((a,e)=>a+(e[1]===sd&&e[0]<=el?e[2]:0),0), pay=Math.min(c.gold[sd],due)-f.paid[sd];
     if(pay>0){ p.gold+=pay; f.paid[sd]+=pay; p.combatGold=(p.combatGold||0)+pay; } } }
}
function dropKillOrbs(){
 for(const f of G.fights||[]){ if(!f.pve||!f.lootKeys||!f.c) continue;
   const el=G.mp?(Date.now()-f.t0)/1000*G.speed:Infinity, deaths=(f.c.deaths||[]).filter(d=>d[0]<=el), total=f.c.units.filter(u=>u.creep).length||1;
   while(f.lootN<deaths.length&&f.lootKeys.length){ const d=deaths[f.lootN++], left=Math.max(1,total-f.lootN+1), k=f.lootN>=total?f.lootKeys.length:Math.ceil(f.lootKeys.length/left);
     for(const key of f.lootKeys.splice(0,k)) dropOrb(f.a,key,{c:d[1],r:d[2]}); if(isHuman(f.a)) note(f.a,'✨ ¡Un salvaje soltó botín!',false); }
 }
}
function pveLoot(p,R,won){
 const s=R.s,n=R.n; let orbs=[],comps=0,extra=[];
 if(s===1){ if(n<=2){orbs=['gray12'];comps=1;} else {orbs=['blue123'];comps=2;} }
 else if(s===2){ orbs=['gray12','blue123']; comps=1; }
 else if(s===3){ orbs=['gray3',Math.random()<.3?'gold23':'blue123']; comps=1; }
 else if(s===4){ orbs=['blue4',Math.random()<.4?'gold4':'blue4']; extra=['fa']; }
 else { orbs=['gold4',Math.random()<.15?'prism':'blue4']; extra=['ca']; }
 if(!won){ orbs=orbs.slice(0,1); comps=Math.min(comps,1); extra=[]; }
 // Las personas reciben orbes que sueltan los salvajes al caer (ver pveLootKeys); los bots, el botín directamente
 const out=[]; for(let i=0;i<comps;i++) grant(p,'c',out); for(const t of extra) grant(p,t,out); for(const o of orbs) openOrb(p,o,out);
 return out;
}

/* ============================== [FLOW] ============================== */
/* Nombres de los rivales: cuentas con aspecto real, en el mismo formato que el registro (letras, números y _; 3 a 14 caracteres).
   generateBotName(usados) evita repetir nombre (sin mayúsculas ni símbolos), parte de otro nombre y la misma estructura que los ya usados. */
const NM_BASE='Alex Alexis Alejandro Angel Alan Alonso Diego Dani Daniel David Dany Luis Luisito Mau Mauricio Mario Marco Kevin Brandon Bryan Fer Fernando Rafa Rafael Gael Emiliano Santiago Mateo Sebastian Ivan Isaac Omar Erik Edgar Carlos Carlitos Cristian Cesar Miguel Jose Jesus Juan Jorge Manuel Andre Leo Leonardo Nico Nicolas Val Vale Regina Sofi Camila Andrea Vane Sam Ferch Pablo Hugo Adrian Abraham Axel Bruno Dario Eduardo Eric Fabian Gerardo Gus Hector Ian Jaime Joaquin Julian Lalo Lucas Memo Moy Nacho Oscar Paco Rodrigo Ruben Saul Tomas Tono Ulises Victor Yael Ale Ana Ari Bere Caro Dana Fati Gaby Isa Jime Karla Lau Lupita Mari Mony Nata Paola Pau Sandy Vicky Yuli Ximena Renata Fernanda Daniela Valeria Mia Ines Cande Eli Rosy Dulce Montse Sergio Pedro Tadeo Rene Raul Beto Chava Gil Ivo Noe Osvaldo Uriel Alfredo Armando Jair Josue Cinthia Marisol'.split(' ');
const NM_CASUAL=['ElMau','Pablito','Charly','Rulas','Tavo','Borre','Chuy','Panchito','ElNene','Pollito','Mishi','Kira','Galletita','Cafecito','SinMana','NoEraCrit','OtroReroll','MeFaltoUno','PuroTop4','Chato','Gordo','Flaco','Wero','Tito','Pepe','Neto','Cheto','Pancho','Meno','Nano','Taquito','Elotito','Conchita','Tamalito','ElGuero','Chilango','LaNeta','Chamba','Quesadilla','Mijo','Chelito','Nena','Lobito','Patito','Chiquis','Mimi','Pelon','Bigote','ElPrimo'];
const NM_COMP='Kuro Nox Vex Kaizen Renzo Akira Kiro Yuki Zenn Naru Rivenx Zyro Nexo Kenz Vyn Lune Rei Sora Kai Ryu Raze Orion Atlas Nyx Zeke Axl Rex Ash Sen Taro Hiro Ren Zed Kano Rocko Dex Mako Rune Soma Onyx Zane Cael Niko'.split(' ');
const NM_GAME=['GengarMx','Eevee27','DittoMain','PikaDani','Snorlaxito','Mimikyu','LucarioGG','Ditto_exe','MewtwoMX','PokeMau','ShinyHunter','CriticalHit','SinRerolls','Top4Enjoyer','Squirtle_7','Umbreon99','Gyarados_x','TogepiLove','Garchomp17','CharizardX','BulbaFer','PsyduckMood','Pokeball_77','MasterBall','Tilteado','Snorlax_zzz','Magikarp1','PikaAlex','Mew_2','ReRollKing','Gengar_xd','Eevee_Lau','DragoniteMx','Shiny_Nico'];
const NM_PRE=['soy','its','el','mr','x','yo'], NM_SUF=['mx','gg','qt','exe','x','xd','lol','jr','mz','zz','_mx','_gg','_exe','_x'];
const NM_BADNUM=/69|420|666|88|14|187/, NM_BAD=/nazi|hitler|puta|pinche|verga|culo|mierda|sex|porn|gay|negro|joto|pene|cum|rape|isis|kkk/i, NM_AVATARS=['🧢','🎒','⭐','🎯','🎮','👾','🔥','💧','🌿','⚡','🎲','🍀'];
const nmRnd=a=>a[Math.floor(Math.random()*a.length)], nmW=pairs=>{ let t=0; for(const p of pairs) t+=p[0]; let r=Math.random()*t; for(const p of pairs){ r-=p[0]; if(r<0) return p[1]; } return pairs[0][1]; };
const nmNorm=n=>String(n).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'');
const nmWord=n=>nmNorm(n).replace(/\d+/g,''), nmSig=n=>String(n).replace(/[A-Z][a-z]+/g,'A').replace(/[a-z]+/g,'a').replace(/\d+/g,m=>'d'+m.length);
const nmCase=(w,lower)=>lower?w.toLowerCase():w.charAt(0).toUpperCase()+w.slice(1);
function nmNum(){ return nmW([[34,()=>nmRnd(['7','17','27','77','10','21','23','33','11','99','98','97','96','00','01','02','03','04','05','08','12','3','5','9','1','2','22'])],[24,()=>String(10+Math.floor(Math.random()*90))],[10,()=>nmRnd(['1998','1999','2000','2001','2002','2003','2004','2005','2006','2007','1997','1996'])],[8,()=>String(100+Math.floor(Math.random()*900))]])(); }
// Variante de ortografía moderada de un nombre (Carlos→Karlos, Dani→Danii, Dany→Danyx)
function nmVar(w){ if(Math.random()>.2) return w; return nmW([[3,()=>/c[aou]/i.test(w)?w.replace(/c([aou])/i,'k$1'):w],[3,()=>/[aio]$/i.test(w)?w+w.slice(-1):w],[2,()=>w.length<7?w+'x':w]])(); }
const NM_STYLES=[[30,'simple'],[31,'numero'],[19,'afijo'],[9,'casual'],[8,'comp'],[3,'juego']];
function nmBuild(style){ const low=Math.random()<.3, base=nmVar(nmRnd(NM_BASE));
 switch(style){
  case 'simple': return nmCase(base,low);
  case 'numero': { const n=nmNum(), f=nmW([[55,0],[25,1],[10,2],[10,3]]), b=nmCase(base,low); return f===1?b+'_'+n:f===2?b+'x'+n:b+n; }
  case 'afijo': { if(Math.random()<.45) return (low?nmRnd(NM_PRE)+base.toLowerCase():nmCase(nmRnd(NM_PRE),false)+nmCase(base,false))+(Math.random()<.2?nmNum().slice(0,2):'');
   const sf=nmRnd(NM_SUF); return nmCase(base,low)+(low||sf[0]==='_'?sf:sf.length<=3?sf.toUpperCase():sf)+(Math.random()<.25?nmNum().slice(0,2):''); }
  case 'casual': return nmRnd(NM_CASUAL)+(Math.random()<.2?nmNum():'');
  case 'comp': { const w=nmRnd(NM_COMP), r=Math.random(); return r<.55?w:r<.8?w+nmNum().slice(0,2):w+'_'+nmRnd(['mx','gg','x','7','17']); }
  default: return nmRnd(NM_GAME); } }
function generateBotName(used,tries=60){ const arr=[...(used||[])], norms=arr.map(nmNorm), words=arr.map(nmWord).filter(w=>w.length>=3), sigs=new Set(arr.map(nmSig));
 const clash=(n,strict)=>{ const nn=nmNorm(n), w=nmWord(n); if(norms.includes(nn)) return true; if(!strict) return false; if(sigs.has(nmSig(n))) return true; return w.length>=3&&words.some(x=>x.includes(w)||w.includes(x)); };
 for(let i=0;i<tries;i++){ const n=nmBuild(nmW(NM_STYLES)).replace(/[^A-Za-z0-9_]/g,''); if(n.length<3||n.length>14||NM_BAD.test(n)||/^\d/.test(n)||(/\d/.test(n)&&NM_BADNUM.test(n.replace(/\D/g,'')))) continue; if(!clash(n,i<tries-12)) return n; }
 for(let i=0;i<400;i++){ const n=nmRnd(NM_BASE)+(3+Math.floor(Math.random()*9990)); if(n.length<=14&&!NM_BAD.test(n)&&!clash(n,false)) return n; }
 return 'Jugador'+Date.now().toString().slice(-6); }
const DIFF_NAME={facil:'Fácil',normal:'Normal',dificil:'Difícil'};
function later(fn,ms){ const g=G; setTimeout(()=>{ if(G===g&&!G.over) fn(); }, G.auto?0:ms); }
function buildRounds(){
 const R=[]; for(let n=1;n<=3;n++) R.push({s:1,n,type:'pve',aug:-1});
 for(let s=2;s<=9;s++) for(let n=1;n<=7;n++) R.push({s,n,type:n===4?'carousel':n===7?'pve':'pvp',aug:(s===2&&n===1)?0:(s===3&&n===2)?1:(s===4&&n===2)?2:-1});
 return R;
}
const ROUNDS=buildRounds();
function newGame(opts={}){
 if(!HEADLESS&&!opts.auto&&typeof guardBack==='function') guardBack();
 if(!HEADLESS&&window.B3&&B3.dropQueue) B3.dropQueue();
 UID=1;
 G={pool:{},players:[],roundIdx:-1,round:null,phase:'idle',timer:0,combat:null,fights:[],log:[],over:false,speed:1,auto:!!opts.auto,acc:0,resolving:false,myOpp:'',anvils:[],augTiers:rollAugTiers(),carousel:null,diff:opts.diff||'normal',mp:!!opts.mp,resolveNotBefore:0};
 for(const u of UNIT_LIST) G.pool[u.key]=POOL_SIZE[u.cost-1];
 if(!opts.server){ G.players.push(makePlayer(0,opts.auto?'Tú':S.name||'Tú',!!opts.auto,S.avatar||'🧢',S.trainer)); if(!opts.auto&&!HEADLESS&&savedTac()) G.players[0].tac=savedTac(); if(!HEADLESS&&typeof COSM!=='undefined'&&ACC&&ACC.cosm) G.players[0].cs=COSM.eqString(ACC.cosm.eq); }
 let id=opts.server?0:1;
 for(const h of (opts.humans||[])){ const p=makePlayer(id++,String(h.nick||'Entrenador').slice(0,14),false,'🧢',h.tr); if(TACS[h.tr]) p.tac=h.tr; p.cs=String(h.cs||'').slice(0,200); p.remote=true; p.peer=h.peer; G.players.push(p); }
 const usados=G.players.map(p=>p.name);
 // opts.taken (servidor): nombre de una cuenta real; un rival generado nunca se llama como una persona
 while(G.players.length<8){ let n=generateBotName(usados); const no=[]; for(let k=0;k<20&&opts.taken&&opts.taken(n);k++){ no.push(n); n=generateBotName(usados.concat(no)); } usados.push(n); const bp=makePlayer(id++,n,true,pick(NM_AVATARS),''); const bs=(opts.bots||[])[G.players.length-(opts.humans||[]).length-(opts.server?0:1)]; if(bs&&BOT_SKILL[bs.skill]) bp.skill=bs.skill; bp.cs=bs&&typeof bs.cs==='string'?bs.cs.slice(0,200):(!HEADLESS&&typeof COSM!=='undefined'?COSM.botEquip():''); bp.botIdx=G.players.length; G.players.push(bp); }
 // En el servidor no hay jugador local: G.me es un espectador fantasma fuera de la lista
 G.me=opts.server?Object.assign(makePlayer(-1,'',true,''),{alive:false}):G.players[0];
 note(null,`Empieza la partida (dificultad: ${DIFF_NAME[G.diff]}). ¡Suerte, entrenador!`);
 nextRound();
}
function nextRound(){
 if(G.over) return;
 G.roundIdx++; const R=ROUNDS[G.roundIdx]; G.round=R; G.resolving=false;
 if(!R){ endGame(); return; }
 const idx=G.roundIdx;
 for(const p of alivePlayers()){
   if(R.type==='carousel') continue;
   addXp(p,(idx<PASSIVE_XP.length?PASSIVE_XP[idx]:2)+(idx>0?p.mods.xpRound:0));
   p.freeRerolls=(p.freeRerolls||0)+p.mods.freeRerolls; // las tiendas gratis que no gastas se guardan (como en TFT)
   augFire(p,'roundStart',{idx});
   ensureGloves(p,true); // el Guante de Boxeo cambia sus objetos cada ronda
   if(!p.locked) refreshShop(p); p.locked=false;
   // Primero cambia la tienda y después llega el oro (el pendiente de los resultados y el ingreso de la ronda)
   if(p.pendGold){ p.gold+=p.pendGold; p.pendGold=0; }
   p.gold+=income(p,idx).total;
   if(idx===0) giveUnitTo(p,drawUnitOfCost(1));
 }
 if(R.type==='carousel'){ startCarousel(); return; }
 if(R.aug>=0){
   const tier=G.augTiers[R.aug];
   for(const p of alivePlayers()){
     const TT=['S','G','P'], tp=p.augShift?TT[Math.max(0,Math.min(2,TT.indexOf(tier)+p.augShift))]:tier; p.augTier=tp; p.augShift=0;
     if(p.isBot) applyAugment(p,AUG_BY[botAugPick(p,augmentChoices(p,tp),R.aug)]);
     else { p.augChoices=augmentChoices(p,tp); p.augPicked=false; p.augRR=[0,0,0]; }
   }
   if(alivePlayers().some(isHuman)){ G.phase='augment'; G.augDeadline=Date.now()+AUG_T*1000; renderUI(); if(G.me.alive&&!G.me.isBot) showAugment(); return; }
 }
 startPlanning();
}
function checkAugDone(){ if(G.phase==='augment'){ for(const p of alivePlayers()) if(p.away&&!p.augPicked&&p.augChoices){ applyAugment(p,AUG_BY[pick(p.augChoices)]); p.augPicked=true; } } // el ausente no hace esperar a los demás: se le aplica al azar lo que se aplicaría al acabar el plazo
 if(G.phase==='augment'&&alivePlayers().every(p=>p.isBot||p.augPicked)){ if(NET.modal==='aug') closeModal(); startPlanning(); } }
function botAugPick(p,choices,stage){
 if(!botSkill(p).smart||!choices.length) return pick(choices);
 const top=topTrait(p), score=id=>{ const a=AUG_BY[id]; let s=Math.random()*.5; if(stage===0&&['econ','fast','slow','streak'].includes(a.cat)) s+=2; if(top&&(a.tags||[]).includes(top)) s+=3;
   if(stage>0&&['trait','emblem','carry'].includes(a.cat)) s+=1.5; if(a.hero&&allUnits(p).some(u=>u.baseId===a.hero)) s+=2.5; if(a.req&&!a.req(p)) s-=9; return s; };
 return choices.slice().sort((x,y)=>score(y)-score(x))[0];
}
function autoAugs(){ for(const p of alivePlayers()) if(!p.isBot&&!p.augPicked&&p.augChoices){ applyAugment(p,AUG_BY[pick(p.augChoices)]); p.augPicked=true; } checkAugDone(); }
function startPlanning(){
 const R=G.round; G.phase='planning'; G.timer=PLAN_T; // siempre 30 s: ya no hay «¡Listo!» para empezar antes ni se configura
 G.preview=R.type==='pve'?pveWave(R.s,R.n):null;
 for(const p of G.players) p.ready=false;
 for(const p of alivePlayers()) if(p.isBot) botPlan(p);
 renderUI();
 if(G.auto) later(startCombat,0);
}
function humansReady(){ const hs=alivePlayers().filter(p=>isHuman(p)&&!p.away); return hs.length>0&&hs.every(p=>p.ready); }
function autoFill(p){
 let free=maxBoard(p)-boardUnits(p).length; if(free<=0) return 0; let n=0; const C=[3,2,4,1,5,0,6];
 for(let i=0;i<BENCH&&free>0;i++){
   const u=p.bench[i]; if(!u) continue;
   const rows=['t','b'].includes(DEF[u.defId].role)?[0,1,2,3]:[3,2,1,0];
   outer: for(const r of rows) for(const c of C){ const k=c+','+r; if(!p.board[k]){ p.board[k]=u; p.bench[i]=null; free--; n++; break outer; } }
 }
 return n;
}
function startCombat(){
 if(G.phase!=='planning') return;
 const R=G.round, me=G.me;
 for(const p of alivePlayers()) for(const o of p.orbs.slice()) openPlayerOrb(p,o.id,true);
 for(const p of alivePlayers()) sellOverflow(p);
 for(const p of alivePlayers()) if(isHuman(p)){ const n=autoFill(p); if(n) note(p,`Se colocaron ${n} Pokémon del banquillo en el tablero`,true); }
 G.phase='combat'; G.acc=0; G.resolving=false;
 const alive=alivePlayers(); G.fights=[];
 if(R.type==='pve') for(const p of alive) G.fights.push({a:p,b:null,pve:true});
 else G.fights=makeFights(alive);
 for(const f of G.fights) if(f.b===me&&!f.ghost) [f.a,f.b]=[f.b,f.a];
 // El reloj de cada combate empieza tras la preparación: todo lo que se mide desde f.t0 (objetos en directo, oro, orbes, fin de ronda) la tiene en cuenta
 const prepMs=G.auto?0:PREP_T*1000/G.speed; G.prepT=G.auto?0:PREP_T;
 for(const f of G.fights){ f.t0=Date.now()+prepMs; if(f.pve&&isHuman(f.a)&&!G.auto){ f.lootKeys=pveLootKeys(f.a,R); f.lootN=0; } }
 for(const p of alive) autoPicks(p);
 for(const f of G.fights){ augFire(f.a,'combatStart',{pve:!!f.pve,opp:f.b?f.b.id:null}); if(f.b&&!f.ghost) augFire(f.b,'combatStart',{pve:false,opp:f.a.id}); }
 let myFight=null, maxRemote=0;
 for(const f of G.fights){
   const mine=f.a===me&&!me.isBot;
   f.seed=(Math.random()*4294967296)>>>0; f.sa=teamSnap(f.a); f.sb=f.b?teamSnap(f.b):null;
   f.c=createCombatSnap(f.sa,f.sb,R,{seed:f.seed,visual:mine,refsA:f.a.board,refsB:f.ghost||!f.b?null:f.b.board});
   if(mine) myFight=f;
   // En multijugador la ronda dura lo que el combate más largo, para que se puedan ver todos enteros
   else { const probe=f.c; simulate(probe); maxRemote=Math.max(maxRemote,probe.t); }
 }
 G.combat=myFight?myFight.c:null; G.flip=false; G.view=null;
 G.myOpp=myFight?oppLabel(myFight,0):''; G.myOppTr=myFight&&!myFight.pve&&myFight.b?myFight.b.tr:'';
 G.resolveNotBefore=G.mp?Date.now()+prepMs+maxRemote/G.speed*1000+5000+END_T*1000:0;
 if(NET.mode==='host') netSendCombats();
 renderUI();
 if(!G.combat&&!G.mp) later(resolveRound,0);
}
function oppLabel(f,side){ const R=G.round; if(f.pve) return pveWave(R.s,R.n)[0].name+' salvajes'; const o=side===0?f.b:f.a; return o.name+(f.ghost?' (fantasma)':''); }
/* Emparejamiento al estilo TFT: nunca repites rival dos rondas seguidas y antes de repetir
   te enfrentas a todos los que siguen vivos (un «ciclo»). Con 8 jugadores hay solo 105 formas
   de emparejar, así que se prueban todas y se elige la de menor coste. */
function pairCost(a,b){
 let c=0;
 if(a.lastOpp===b.id||b.lastOpp===a.id) c+=1000;
 if(a.met.includes(b.id)) c+=100; if(b.met.includes(a.id)) c+=100;
 for(const [x,y] of [[a,b],[b,a]]){ const r=x.oppRound[y.id]; if(r!=null) c+=Math.max(0,12-(G.roundIdx-r)); }
 return c;
}
function bestMatching(list){
 if(list.length<2) return {cost:0,pairs:[]};
 const [x,...rest]=list; let best=null;
 for(let i=0;i<rest.length;i++){ const sub=bestMatching(rest.filter((_,j)=>j!==i)); const c=pairCost(x,rest[i])+sub.cost; if(!best||c<best.cost) best={cost:c,pairs:[[x,rest[i]],...sub.pairs]}; }
 return best;
}
function makeFights(alive){
 const list=shuffle(alive.slice()); let best=null;
 if(list.length%2===0) best=bestMatching(list);
 else for(const g of list){ // con número impar, uno juega contra el «fantasma» de otro
   const sub=bestMatching(list.filter(p=>p!==g)), opp=list.filter(p=>p!==g).sort((a,b)=>pairCost(g,a)-pairCost(g,b))[0];
   const c=sub.cost+g.ghosts*30+pairCost(g,opp)*.5;
   if(!best||c<best.cost) best={cost:c,pairs:sub.pairs,ghost:[g,opp]};
 }
 const f=best.pairs.map(([a,b])=>({a,b}));
 if(best.ghost){ f.push({a:best.ghost[0],b:best.ghost[1],ghost:true}); best.ghost[0].ghosts++; }
 // Apunta a quién se ha enfrentado cada uno; al completar el ciclo, empieza otro
 const meet=(p,o)=>{ p.oppRound[o.id]=G.roundIdx; if(!p.met.includes(o.id)) p.met.push(o.id); if(alive.every(q=>q===p||p.met.includes(q.id))) p.met=[o.id]; };
 for(const x of f){ meet(x.a,x.b); if(!x.ghost) meet(x.b,x.a); }
 return f;
}
// Rivales posibles en la próxima ronda PvP: los que aún no has visto en este ciclo (y nunca el último)
function possibleOpps(p){
 const others=alivePlayers().filter(q=>q!==p); if(others.length<=1) return others;
 const fresh=others.filter(q=>!p.met.includes(q.id)&&q.id!==p.lastOpp);
 return fresh.length?fresh:others.filter(q=>q.id!==p.lastOpp);
}
function win(p){ p.streak=p.streak>0?p.streak+1:1; p.gold+=p.mods.winGold; p.hp=Math.min(100,p.hp+p.mods.winHeal); p.history.push('W'); p.lastDmg=0; }
function lose(p,d){ p.streak=p.streak<0?p.streak-1:-1; p.hp-=d; p.lastDmg=d; p.history.push('L'); }
// Mide lo que da una recompensa (oro, Pokémon y objetos) y lo suma al botín del jugador (Cazatesoros)
function lootTrack(p,fn){
 const g0=p.gold, it0=p.items.length, u0=allUnits(p).reduce((s,u)=>s+DEF[u.defId].cost*Math.pow(3,u.star-1),0), n0=allUnits(p).length;
 fn();
 const L=p.loot=p.loot||{gold:0,units:0,items:0,value:0}; const dg=Math.max(0,p.gold-g0), di=Math.max(0,p.items.length-it0), du=Math.max(0,allUnits(p).length-n0), dv=Math.max(0,allUnits(p).reduce((s,u)=>s+DEF[u.defId].cost*Math.pow(3,u.star-1),0)-u0);
 L.gold+=dg; L.items+=di; L.units+=du; L.value+=dg+dv+di*3;
}
// Potencial Evolutivo: crecen para siempre al acabar cada ronda en el tablero
// Mewtwo: la Mega Evolución ya solo dura un combate (energía de Onda Mental); devuelve a su forma normal cualquier Mega Mewtwo guardado de antes
const mewEnergy=u=>(u.kills||0)+(u.mwR||0);
// (Antes Mewtwo se volvía Mega para siempre con bajas y rondas; ahora se transforma dentro de cada combate: ver el caso 'psy' de castAbility)
function mewtwoUnstable(){
 for(const p of alivePlayers()) for(const u of allUnits(p)) if(u.defId==='megamewtwo'){ u.defId='mewtwo'; u.baseId='mewtwo'; }
}
function growPotential(){
 for(const p of alivePlayers()){ const k=traitTiers(p)['Potencial Evolutivo']||0; if(!k) continue; const hp=[0,12,25,45,80][k], ad=[0,1,2,4,8][k];
   for(const u of boardUnits(p)) if(unitTraits(u).includes('Potencial Evolutivo')){ const m=u.star>=3?2:1; u.stk.hp+=hp*m; u.stk.ad+=ad*m; u.stk.ap=(u.stk.ap||0)+ad*m*AP_PER_AD; } }
}
// Mew (minileyenda mítica): al ganar un combate PvP toma la apariencia de la minileyenda del rival (tal como la lleva: evolución y forma)
// y la desbloquea para esta partida; con la tecla 1 cambia al azar entre las desbloqueadas y con la 2 vuelve a ser Mew (acción mform). Solo visual
const MEW_MAX=16;
function mewWin(w,l){ if(!w||!l||!tacOf(w).mimic) return; const d=tacDex(l); if(!d||d===tacOf(w).dex[0]) return;
 w.mewSk=w.mewSk||[]; if(!w.mewSk.includes(d)&&w.mewSk.length<MEW_MAX) w.mewSk.push(d); w.mewF=d; w.mewN=(w.mewN|0)+1;
 note(w,`✨ Mew toma la forma de la minileyenda de ${l.name}`); }
function resolveRound(){
 if(G.phase!=='combat') return;
 const R=G.round, base=STAGE_DMG[R.s]||22, me=G.me; const msgs=new Map(), extraGold={}, gold0=new Map(G.players.map(p=>[p,p.gold]));
 G.anvils=[]; const won=new Map();
 const say=(p,m)=>msgs.set(p,m);
 for(const f of G.fights) if(f.c&&!f.c.done) simulate(f.c);
 payCombatGold(true);
 for(const p of G.players) if(p.combatGold){ extraGold[p.id]=p.combatGold; p.combatGold=0; }
 for(const f of G.fights){
   const c=f.c; if(!c.done) simulate(c);
   for(const u of c.units) if(u.ref&&u.kills) u.ref.kills+=u.kills;
   const addG=()=>{};
   if(f.pve){
     const p=f.a, w=c.winner===0; won.set(p,w); addG(p,c.gold[0]);
     if(!w){ const d=base+survivors(c,1); p.hp-=d; p.lastDmg=d; }
     // Si el imán no llegó a caer (no derrotó a ninguno), se entrega igualmente
     if(f.lootKeys&&f.lootKeys.includes('mag')) giveItem(p,'magnet');
     const loot=f.lootKeys?[]:pveLoot(p,R,w);
     say(p,(w?'🐾 Ronda PvE superada':`🐾 Los salvajes te ganaron: −${p.lastDmg} de vida`)+(loot.length?' · Botín: '+loot.join(' · '):''));
     continue;
   }
   const A=f.a,B=f.b; addG(A,c.gold[0]); if(!f.ghost) addG(B,c.gold[1]);
   if(c.winner===0){ win(A); won.set(A,true); if(!f.ghost){ lose(B,base+survivors(c,0)); won.set(B,false); } }
   else if(c.winner===1){ lose(A,base+survivors(c,1)); won.set(A,false); if(!f.ghost){ win(B); won.set(B,true); } }
   else { lose(A,base+survivors(c,1)); won.set(A,false); if(!f.ghost){ lose(B,base+survivors(c,0)); won.set(B,false); } }
   A.lastOpp=B.id; if(!f.ghost) B.lastOpp=A.id;
   // Resultado de cada ronda PvP (las espadas de la barra de fases se pintan de verde o rojo; el empate cuenta como derrota)
   for(const p of f.ghost?[A]:[A,B]) (p.rres=p.rres||{})[G.roundIdx]=won.get(p)?'W':'L';
   if(!f.ghost){ if(won.get(A)) mewWin(A,B); if(won.get(B)) mewWin(B,A); }
   say(A,c.winner===0?`✅ Victoria contra ${B.name}`:c.winner===1?`❌ Derrota contra ${B.name}: −${A.lastDmg} de vida`:`⏱️ Empate por tiempo con ${B.name}: −${A.lastDmg} de vida`);
   if(!f.ghost) say(B,c.winner===1?`✅ Victoria contra ${A.name}`:c.winner===0?`❌ Derrota contra ${A.name}: −${B.lastDmg} de vida`:`⏱️ Empate por tiempo con ${A.name}: −${B.lastDmg} de vida`);
 }
 // Eventos de los aumentos, después de apuntar el resultado (una sola vez por combate)
 for(const f of G.fights){ const c=f.c, sides=f.pve?[[f.a,0,null]]:[[f.a,0,f.b],...(f.ghost?[]:[[f.b,1,f.a]])];
   for(const [p,side,o] of sides){ const w=c.winner===side, n=c.units.filter(u=>u.side===side&&!u.dead).length, k=c.units.filter(u=>u.side===side).reduce((a,u)=>a+u.kills,0);
     augFire(p,w?'win':'lose',{pve:!!f.pve,opp:o?o.id:null,streak:p.streak}); augFire(p,'survive',{n}); augFire(p,'kills',{n:k}); if(!w) augFire(p,'damaged',{d:p.lastDmg||0}); const us=c.units.filter(u=>u.side===side), cs={atk:us.reduce((a,u)=>a+(u.atkN||0),0),phys:us.reduce((a,u)=>a+(u.sPhys||0),0),taken:us.reduce((a,u)=>a+(u.sTank||0),0),mana:us.reduce((a,u)=>a+(u.castN||0)*(u.maxMana<9999?u.maxMana:0),0)};
     augFire(p,'roundEnd',{won:w,pve:!!f.pve,cs,firstKill:c.firstKill?c.firstKill[side]:null}); } }
 // Cazatesoros: botín tras cada combate (apuntado para la ficha de la sinergia)
 for(const p of alivePlayers()){ const tier=traitTiers(p)['Cazatesoros']||0; if(!tier) continue; const w=won.get(p);
   lootTrack(p,()=>{ if(p.mods.lucky) p.gold+=2; if(w){ const st=Math.min(3,Math.max(0,p.streak-1)); p.gold+=(tier>=3?4:tier>=2?0:2)+st; if(tier>=2){ const out=[]; openOrb(p,G.round.s<=2?'gray12':'blue123',out); if(isHuman(p)) note(p,'💎 Cazatesoros: '+out.join(', '),true); } } else p.gold+=tier>=3?4:tier>=2?2:1; }); }
 for(const [p,m] of msgs) if(isHuman(p)) note(p,m,true);
 for(const p of G.players) if(isHuman(p)&&extraGold[p.id]) note(p,`💰 Oro ganado en combate: +${extraGold[p.id]} de oro`,true);
 const dead=G.players.filter(p=>p.alive&&p.hp<=0).sort((a,b)=>a.hp-b.hp);
 let n=alivePlayers().length;
 for(const p of dead){
   p.finalComp=compSnap(p); p.place=n--; p.alive=false; p.hp=0;
   for(const u of allUnits(p)) returnToPool(u.baseId,Math.pow(3,u.star-1));
   for(const k of p.shop) if(k) returnToPool(k,1);
   p.board={}; p.bench=Array(BENCH).fill(null); p.shop=[null,null,null,null,null];
   note(null,`💀 ${p.name} queda eliminado (puesto ${p.place})`);
 }
 // El oro de los resultados (victoria, Cazatesoros, aumentos) entra al momento: cuenta para el interés de la ronda siguiente
 G.phase='results'; G.combat=null; G.view=null;
 growPotential();
 for(const p of alivePlayers()) combine(p);
 const queue=[];
 mewtwoUnstable();
 for(const p of alivePlayers()) for(const u of allUnits(p)) if(u.defId==='eevee'&&u.kills>=p.mods.eeveeKills){
   if(G.auto||p.isBot){ u.defId=pick(EVOS).key; p.eeveeForm=u.defId; note(p,`🌀 Eevee evolucionó en ${DEF[u.defId].name}`,true); }
   else if(!u.evoOffer){ u.evoOffer=1; augOffer(p,'__eevee','🌀 ¡Eevee va a evolucionar!','Ha derrotado a suficientes enemigos. Elige su evolución: conserva todo lo que ha acumulado y gana una habilidad nueva.',shuffle(EVOS.slice()).slice(0,3).map(e=>({t:e.name,i:'🌀',d:e.traits.join(' · '),v:'ev:'+u.uid+'|'+e.key}))); }
 }
 for(const a of G.anvils) queue.push(done=>showAnvil(a,done));
 G.anvils=[];
 renderUI();
 if(alivePlayers().length<=1||(!G.mp&&!me.alive)){ if(alivePlayers().length===1){ const w=alivePlayers()[0]; w.finalComp=compSnap(w); w.place=1; } later(endGame,900); return; }
 if(G.mp&&!SERVER&&!me.alive&&!G.hostOutShown){ G.hostOutShown=true; queue.push(done=>{ openModal(`<h1>Has quedado eliminado</h1><p>Puesto ${me.place}. Como anfitrión, la partida sigue en tu pestaña: no la cierres hasta que termine para que los demás puedan acabar.</p><button class="btn primary" id="okOut">Seguir como espectador</button>`); $('okOut').onclick=()=>{ closeModal(); done(); }; }); }
 const proceed=()=>later(nextRound,1100);
 if(G.auto){ proceed(); return; }
 runQueue(queue,proceed);
}
function runQueue(q,done){ const f=q.shift(); if(!f){ done(); return; } f(()=>runQueue(q,done)); }

function carouselChoice(p){
 const C=G.carousel; const free=C.opts.map((o,i)=>i).filter(i=>!C.opts[i].taken); if(!free.length) return null;
 const owned=new Set(allUnits(p).filter(u=>u.star<3).map(u=>u.baseId));
 const mine=free.filter(i=>owned.has(C.opts[i].key)); if(mine.length) return pick(mine);
 return free.sort((a,b)=>DEF[C.opts[b].key].cost-DEF[C.opts[a].key].cost)[0];
}
function startCarousel(){
 G.phase='carousel';
 const s=G.round.s, costs=s<=2?[1,2]:s===3?[2,3]:s===4?[3,4]:[4,5];
 // Objetos: en las fases 1-3, un componente de cada tipo y uno repetido; después, objetos completos distintos.
 // Con muy poca probabilidad aparece un emblema, y entonces el resto de objetos sale al azar.
 const emb=Math.random()<.05, embKeys=Object.keys(ITEMS).filter(k=>k.startsWith('emb_'));
 let items=s<=3?shuffle([...BASIC,pick(BASIC)]):shuffle(FULL_KEYS.slice()).slice(0,9);
 if(emb){ items=[pick(embKeys),...Array.from({length:8},()=>pick(s<=3?BASIC:FULL_KEYS))]; shuffle(items); }
 const opts=[]; for(let i=0;i<9;i++){ const k=drawUnitOfCost(pick(costs)); if(k) opts.push({key:k,item:items[i],taken:null}); }
 const order=alivePlayers().sort((a,b)=>a.hp-b.hp||Math.random()-.5);
 G.carousel={opts,order,t:0,rot:Math.random()*6,av:{},endT:0,finished:false};
 if(G.auto||(HEADLESS&&!SERVER)){ for(const p of order){ const i=carouselChoice(p); if(i!=null) takeCarousel(p,i); } finishCarousel(); return; }
 order.forEach((p,j)=>{ G.carousel.av[p.id]={ang:carAng(j,order.length),x:null,y:null,target:null,tx:null,ty:null,done:false,rel:false,delay:.4+Math.random()*1.2}; });
 note(null,'🎠 Carrusel: salen primero los entrenadores con menos vida (de 2 en 2). Muévete con clic derecho y pasa por encima del Pokémon que quieras');
 renderUI();
}
function takeCarousel(p,i){ const o=G.carousel.opts[i]; if(!o||o.taken) return false; o.taken=p; giveUnitTo(p,o.key); giveItem(p,o.item); note(p,`🎠 Elegiste ${DEF[o.key].name} con ${ITEMS[o.item].name}`,true); return true; }
function finishCarousel(){ const C=G.carousel; for(const o of C.opts) if(!o.taken) returnToPool(o.key,1); G.carousel=null; renderUI(); later(nextRound,400); }
const releaseAt=idx=>8+3.5*Math.floor(idx/2); // la primera pareja sale a los 8 s (da tiempo a ver todos los Pokémon y objetos y elegir); las demás, cada 3,5 s
// Cada pareja que sale a la vez empieza en lados opuestos (misma distancia a todos los Pokémon)
const carAng=(j,n)=>Math.floor(j/2)*Math.PI/Math.ceil(n/2)+(j%2)*Math.PI+Math.PI/8;
// Instantánea del equipo para el historial: guarda nombre y número de Pokédex, no solo la clave (sobrevive a cambios futuros)
function compSnap(p){ const tt=traitTiers(p), tc=traitCounts(p);
 return {lvl:p.level,round:G.round?G.round.s+'-'+G.round.n:'',units:Object.entries(p.board).map(([k,u])=>{ const d=DEF[u.defId]; return [u.defId,u.star,u.items.slice(0,3),dexOf(d,u.star),nameOf(d,u.star),d.cost]; }).slice(0,12),
  traits:Object.keys(tt).filter(t=>tt[t]>0&&t!=='Legendario').map(t=>[t,tc[t],tt[t]]).sort((a,b)=>b[2]-a[2]||b[1]-a[1]).slice(0,9),augs:p.augments.slice(0,3)}; }
function endGame(){ G.over=true; G.phase='over'; if(G.me.alive&&!G.me.place) G.me.place=1; renderUI(); if(NET.mode==='host') netFlush(true); if(!G.auto&&!HEADLESS) showGameOver(); }

// Acciones de un jugador (las del anfitrión, las de los clientes y las de un jugador solo pasan por aquí)
function normLoc(l){ if(!l||typeof l!=='object') return null; if(typeof l.b==='string'&&/^[0-6],[0-3]$/.test(l.b)) return {b:l.b}; if(Number.isInteger(l.i)&&l.i>=0&&l.i<BENCH) return {i:l.i}; return null; }
function applyAct(p,a){
 if(!p||!a||typeof a!=='object'||!G||G.over||!p.alive||!G.players.length) return {ok:false};
 const ph=G.phase, idx=x=>Number.isInteger(x)?x:-1;
 switch(a.t){
  case 'buy': { const i=idx(a.i); if(i<0||i>4) return {ok:false}; const k=p.shop[i]; if(!k) return {ok:false}; if(!buy(p,i)) return {ok:false,why:firstRound()?'En la primera ronda juegas con el Pokémon que te tocó':p.gold<DEF[k].cost?'No tienes oro suficiente':'Banquillo lleno'}; return {ok:true}; }
  case 'reroll': return {ok:!firstRound()&&reroll(p),why:firstRound()?'En la primera ronda juegas con el Pokémon que te tocó':'No tienes oro suficiente'};
  case 'xp': return {ok:!firstRound()&&buyXp(p),why:firstRound()?'En la primera ronda juegas con el Pokémon que te tocó':'No tienes oro suficiente'};
  case 'lock': p.locked=!p.locked; return {ok:true};
  case 'sell': { const loc=normLoc(a.loc); return {ok:!!(loc&&sellAt(p,loc)),why:firstRound()?'En la primera ronda no se puede vender':'No puedes vender eso ahora'}; }
  case 'move': { const f=normLoc(a.from), to=normLoc(a.to); if(!f||!to) return {ok:false}; if((ph==='combat'||ph==='carousel')&&(f.b!==undefined||to.b!==undefined)) return {ok:false}; return {ok:moveTo(p,f,to)}; }
  case 'item': { const loc=normLoc(a.loc), u=loc&&getAt(p,loc); if(!u) return {ok:false}; const r=useItem(p,idx(a.idx),u,loc); if(r.ok&&r.made) note(p,`⚒️ ¡Creaste ${ITEMS[r.made].name} en ${nameOf(DEF[u.defId],u.star)}!`,true); if(r.ok&&r.removed) note(p,`🧲 Los objetos de ${nameOf(DEF[u.defId],u.star)} volvieron a tu inventario`,true); return r; }
  case 'pick': return resolvePick(p,a.id|0,idx(a.i));
  case 'tac': { if(!TACS[a.k]) return {ok:false}; p.tac=a.k; return {ok:true}; }
  case 'mform': { if(!tacOf(p).mimic) return {ok:false}; const k=a.k|0, now=Date.now(); if(now-(p.mewT||0)<900) return {ok:false};
    if(k===2){ if(!p.mewF) return {ok:false}; p.mewF=0; }
    else if(k===1){ const o=(p.mewSk||[]).filter(d=>d!==p.mewF); if(!o.length) return {ok:false,why:'Gana un combate para copiar la minileyenda de tu rival'}; p.mewF=pick(o); }
    else return {ok:false};
    p.mewT=now; p.mewN=(p.mewN|0)+1; return {ok:true}; }
  case 'tform': { const f=EEVEE_KEYS[(a.k|0)-1]; if(p.tac!=='eevee'||tacStage(p)<1||!f) return {ok:false}; p.tacForm=p.tacForm||['','']; p.tacForm[0]=f; return {ok:true}; }
  case 'orb': { return {ok:!!openPlayerOrb(p,a.id|0,false)}; }
  // Burla de Charmander (H): se cuenta para que todos los que miran su tablero la vean (el contador viaja en pub.pl[i][17])
  case 'greet': { const t=Date.now(); if(t-(p.greetAt||0)<1400) return {ok:false}; p.greetAt=t; p.gn=((p.gn||0)+1)%1000; return {ok:true}; }
  case 'taunt': { if((TACS[p.tac]?p.tac:'charmander')!=='charmander') return {ok:false}; const t=Date.now(); if(t-(p.tauntAt||0)<1400) return {ok:false}; p.tauntAt=t; p.tn=((p.tn||0)+1)%1000; return {ok:true}; }
  // Dónde está tu minileyenda para los demás: tablero que miras y destino (en radios de casilla desde la esquina del tablero)
  case 'tpos': { const b=idx(a.b), q=v=>Math.round(clamp(+v||0,-3,20)*100)/100; if(!G.players.some(o=>o.id===b)) return {ok:false}; p.tp=[b,q(a.x),q(a.y)]; return {ok:true}; }
  case 'icomb': { const r=combineBench(p,idx(a.a),idx(a.b)); if(r.ok) note(p,`⚒️ ¡Creaste ${ITEMS[r.made].name}!`,true); return r; }
  case 'rmitem': return {ok:false,why:'Para quitar objetos usa un 🧲 Imán Removedor'};
  case 'ready': if(ph==='planning') p.ready=true; return {ok:true};
  case 'surrender': { if(!p.alive||G.over||!G.round||G.round.s<3||ph==='carousel'||ph==='over') return {ok:false,why:'Rendirse solo se puede desde la fase 3-1'}; return {ok:surrenderPlayer(p)}; }
  case 'aug': { if(ph!=='augment'||!p.augChoices||p.augPicked) return {ok:false}; const id=p.augChoices[idx(a.i)]; if(!id) return {ok:false}; applyAugment(p,AUG_BY[id]); p.augPicked=true; checkAugDone(); return {ok:true}; }
  case 'augrr': { const i=idx(a.i); if(ph!=='augment'||p.augPicked||!p.augChoices||i<0||i>2||(p.augRR||[])[i]) return {ok:false};
    // Refresco de una sola carta: otra del mismo nivel que no esté ya en la oferta
    const keep=p.augChoices.filter((_,j)=>j!==i), tmp={...p,augments:[...p.augments,...keep]}, nw=augmentChoices(tmp,p.augTier||G.augTiers[G.round.aug],1)[0]; if(!nw) return {ok:false,why:'No hay más aumentos de este nivel'};
    p.augChoices[i]=nw; (p.augRR=p.augRR||[0,0,0])[i]=1; return {ok:true}; }
  case 'carmove': { if(ph!=='carousel'||!G.carousel) return {ok:false}; const av=G.carousel.av[p.id]; if(!av) return {ok:false}; let nx=+a.x, ny=+a.y; if(!Number.isFinite(nx)||!Number.isFinite(ny)) return {ok:false}; const {cx,cy,rr}=carGeo(), d=Math.hypot(nx,ny), M=1.2; if(d>M){ nx*=M/d; ny*=M/d; } av.tx=cx+nx*rr; av.ty=cy+ny*rr; av.target=null; return {ok:true}; }
  case 'car': { if(ph!=='carousel'||!G.carousel) return {ok:false}; const av=G.carousel.av[p.id], i=idx(a.i); if(av&&av.rel&&!av.done&&G.carousel.opts[i]&&!G.carousel.opts[i].taken){ av.target=i; return {ok:true}; } return {ok:false}; }
 }
 return {ok:false};
}

/* =============================== [NET] =============================== */
// Multijugador: en el servidor (anfitrión, NET.mode 'host') y en el navegador de cada jugador (espejo, 'client').
const NET={mode:'sp',sock:null,rooms:[],owner:'',named:null,code:'',isHost:false,hostPeer:'',myPeer:'',seats:[],cfg:null,lastPub:'',lastPriv:{},lastForce:0,lastCar:0,modal:'',lastToast:0,unsub:[],shownOver:false};
const TOPICS=['act','pub','priv','cmb','car','start','lobby','bye'];
function randomCode(){ const a='abcdefghjkmnpqrstuvwxyz23456789'; let s=''; for(let i=0;i<5;i++) s+=a[Math.floor(Math.random()*a.length)]; return s; }
function myPeerOf(room){ const me=room.peers().find(p=>p.sameTab); return me?me.peer:''; }
function packInst(u){ return [u.uid,u.defId,u.star,u.items,R0(u.stk.hp),R0(u.stk.ad),u.kills,u.goldGen||0,R0(u.stk.ap||0),u.mwR||0,u.tg||0]; }
function unpackInst(a){ if(!Array.isArray(a)||!DEF[a[1]]) return null; return {uid:a[0],defId:a[1],baseId:DEF[a[1]].evoOf||a[1],star:clamp(a[2]|0,1,3),items:(a[3]||[]).filter(i=>ITEMS[i]),stk:{hp:+a[4]||0,ad:+a[5]||0,ap:+a[8]||0},kills:+a[6]||0,mwR:+a[9]||0,goldGen:Math.max(0,+a[7]||0),tg:Array.isArray(a[10])?a[10].filter(i=>ITEMS[i]).slice(0,3):undefined}; }
// Cristales de intereses de un jugador (1 por cada 10 de oro, hasta su máximo y 5): el propio se calcula; el de los demás llega en pub.pl[i][19]
const interestOf=p=>p.mods&&p!==G.me&&p.icn!=null&&NET.mode==='client'?p.icn:Math.min(p.mods?p.mods.maxInterest:5,5,Math.floor((p.gold||0)/10));
// Rival del combate que se está viendo (null en salvajes): su banca y sus cristales se ven en su lado del campo
function combatOpp(){ const me=G.me, v=G.view; if(G.phase!=='combat'||!G.round||G.round.type==='pve') return null; const o=v?v.opp:G.players.find(p=>p!==me&&G.myOpp&&G.myOpp.replace(' (fantasma)','')===p.name); return o&&o!==me?o:null; }
function makePub(){
 return {ph:G.phase,ri:G.roundIdx,tl:isFinite(G.timer)?Math.max(0,Math.ceil(G.timer)):-1,sp:G.speed,at:G.augTiers,ov:G.over?1:0,dif:G.diff,
   pl:G.players.map(p=>[p.id,p.name,p.emoji,R0(p.hp),p.level,p.streak,p.alive?1:0,p.place,p.peer||'',0,p.ready?1:0,boardUnits(p).length,p.tr||'',p.lastUp||0,p.tac,(p.tacForm||['','']).join(','),p.tp||0,p.tn||0,p.gn||0,interestOf(p),[p.mewF|0,p.mewN|0,(p.mewSk||[]).length]]),
   // Tableros y banquillos de todos, para poder mirarlos fuera del combate
   bd:G.players.map(p=>[Object.entries(p.board).map(([k,u])=>[k,u.defId,u.star,u.items]),p.bench.map(u=>u?[u.defId,u.star,u.items]:0),p.items.slice(0,ITEMS_HARD),p.augments])};
}
function makePriv(p){ ensureGloves(p);
 const d={to:p.peer,id:p.id,aq:p.aq|0,g:p.gold,l:p.level,x:p.xp,sh:p.shop,lk:p.locked?1:0,fr:p.freeRerolls,au:p.augments,it:p.items,md:p.mods,
   be:p.bench.map(u=>u?packInst(u):null),bo:Object.entries(p.board).map(([k,u])=>[k,packInst(u)]),
   po:possibleOpps(p).map(q=>q.id),ac:G.phase==='augment'&&!p.augPicked?p.augChoices:null,ar:p.augRR||[0,0,0],ef:p.eeveeForm||'',lg:p.log.slice(0,8),ts:p.toasts,ob:p.orbs.slice(0,12).map(o=>[o.id,o.tier,o.c,o.r,orbUnits(o)]),rr:Object.entries(p.rres||{}).filter(([i])=>G.round&&ROUNDS[i]&&ROUNDS[i].s===G.round.s).map(([i,v])=>i+v).join(','),pk:p.picks&&p.picks[0]?p.picks[0]:null,ap:Object.fromEntries(p.augments.map(id=>[id,augProgress(p,id)])),ag:augSnap(p),rv:(p.reveals||[]).slice(-3),lt:p.loot||null};
 if(JSON.stringify(d).length>3900){ d.lg=d.lg.slice(0,2); d.ts=d.ts.slice(-1); }
 return d;
}
function netFlush(force){
 if(NET.mode!=='host'||!NET.named||!G||!G.players.length) return;
 const emit=(t,d)=>NET.named.emit(t,d).catch(()=>{});
 // Ahorro de transferencia: cada tablero (bd) solo viaja cuando cambia (0 = sin cambios; el cliente conserva el que tenía).
 // Antes iban los 8 tableros cada segundo porque el temporizador cambia; un envío completo cada 10 s cubre a quien se conecte tarde.
 const pub=makePub(), bdS=pub.bd.map(b=>JSON.stringify(b)); NET.lastBdP=NET.lastBdP||[];
 pub.bd=pub.bd.map((b,i)=>force||bdS[i]!==NET.lastBdP[i]?b:0); const ps=JSON.stringify(pub);
 if(force||ps!==NET.lastPub){ emit('pub',pub); NET.lastPub=ps; NET.lastBdP=bdS; }
 for(const p of G.players) if(p.remote){ const d=makePriv(p), s=JSON.stringify(d); if(force||s!==NET.lastPriv[p.id]){ emit('priv',d); NET.lastPriv[p.id]=s; } }
}
function netSendCombats(only){
 // Todos los combates de la ronda, para que cada jugador pueda ver el de cualquier otro (con `only`: solo para ese jugador, al reconectarse)
 NET.named.emit('cmbs',{...(only?{to:only.peer}:{}),R:[G.round.s,G.round.n],list:G.fights.map(f=>({seed:f.seed,a:f.sa,b:f.sb,ia:f.a.id,ib:f.b?f.b.id:-1,pve:f.pve?1:0,ghost:f.ghost?1:0}))}).catch(()=>{});
 for(const f of G.fights){
   const send=(p,side)=>{ if(!p||!p.remote||(only&&p!==only)) return; const o=f.pve?null:side===0?f.b:f.a; NET.named.emit('cmb',{to:p.peer,seed:f.seed,side,a:f.sa,b:f.sb,R:[G.round.s,G.round.n],opp:oppLabel(f,side),ot:o?o.tr:''}).catch(()=>{}); };
   send(f.a,0); if(!f.ghost) send(f.b,1);
 }
}
function netCarousel(){
 const C=G.carousel; if(!C||!NET.named) return;
 // Posiciones relativas al centro y radio del carrusel: así cuadran aunque cada pantalla tenga otro tamaño
 const {cx,cy,rr}=carGeo(), nx=x=>+((x-cx)/rr).toFixed(3), ny=y=>+((y-cy)/rr).toFixed(3);
 NET.named.emit('car',{rot:+C.rot.toFixed(3),t:+C.t.toFixed(2),opts:C.opts.map(o=>[o.key,o.item,o.taken?o.taken.id:-1]),
   av:C.order.map(p=>{ const a=C.av[p.id]||{}; return [p.id,a.x==null?null:nx(a.x),a.y==null?null:ny(a.y),a.rel?1:0,a.done?1:0,a.carry?a.carry.key:'',a.target==null?-1:a.target]; })}).catch(()=>{});
}
function hostNetTick(){
 if(NET.mode!=='host') return;
 const now=Date.now();
 if(now-NET.lastForce>10000){ NET.lastForce=now; netFlush(true); } else netFlush(false);
 if(G.phase==='carousel'&&now-NET.lastCar>160){ NET.lastCar=now; netCarousel(); }
}
// ----- vestíbulo (Socket.io: el servidor lleva las salas y la partida) -----
function sock(){
 if(NET.sock) return NET.sock;
 if(HEADLESS||typeof io==='undefined') return null;
 const s=io({transports:['websocket','polling']}); NET.sock=s; NET.rooms=[];
 s.on('connect',()=>{ NET.myPeer=s.id; if(NET.screen==='lobby') s.emit('list'); if(NET.lost){ NET.mode='joining'; s.emit('rejoin'); } }); // tras un corte, vuelve solo a su asiento
 s.on('connect_error',err=>{ if(err&&err.message==='auth'){ resetSocket(); resetNet(); showAuth('Tu sesión ha caducado. Vuelve a entrar.'); } });
 s.on('disconnect',reason=>{ if(NET.queue) endQueue();
   if(NET.mode==='client'){ connLost(reason,s); }
   else if(NET.mode==='joining'&&NET.lost){ showLostBar(reason); if(reason==='io server disconnect') s.connect(); } // otro corte mientras volvía: sigue intentándolo
   else if(NET.mode==='joining'){ toast('Se perdió la conexión con el servidor ('+reasonText(reason)+')'); if(G&&G.mirror) G.over=true; resetNet(); closeModal(); showMenu(); } });
 s.on('resume',d=>{ NET.resume=d&&typeof d==='object'?{mode:String(d.mode||'').slice(0,12),round:String(d.round||'').slice(0,6)}:null; renderResume(); });
 s.on('rejoinfail',d=>{ toast(String(d&&d.why||'No se pudo volver a la partida')); giveUpLost(); });
 s.on('rooms',list=>{ NET.rooms=Array.isArray(list)?list.slice(0,50):[]; if(NET.screen==='lobby') renderRoomList(); });
 s.on('err',m=>{ toast(String(m||'Error')); if(NET.queue&&NET.queue.state!=='matched') endQueue(); if(NET.mode==='joining'&&NET.screen!=='room'&&!NET.queue) NET.mode='sp'; });
 s.on('lobby',d=>{
   if(NET.mode!=='joining'||!d) return;
   NET.cfg={name:String(d.name||'Sala').slice(0,24),max:+d.max||8,diff:DIFF_NAME[d.diff]?d.diff:'normal'};
   NET.code=String(d.code||'').slice(0,5); NET.owner=String(d.owner||''); NET.seats=Array.isArray(d.seats)?d.seats.slice(0,8):[];
   if(NET.screen!=='room') showRoomScreen(); else renderSeats();
 });
 s.on('start',d=>{ if(NET.mode!=='joining') return; const seats=(d&&d.seats)||[]; if(seats.find(x=>x.peer===NET.myPeer)){ NET.queue=null; renderQueue(); NET.result=null; NET.lost=null; NET.resume=null; hideLostBar(); startClient(); } });
 s.on('queue',onQueue);
 s.on('result',onResult);
 s.on('friends',()=>loadFriends()); // mi lista cambió (solicitud, aceptar, eliminar…)
 s.on('friendUpd',onFriendUpd);
 s.on('ann',onAnn);
 s.on('cos',onCos);                 // cosméticos de los 8 (una vez por partida)                 // alguien ha conseguido a Eevee     // un amigo cambió de estado (menú, cola, partida…)
 s.on('pub',d=>{ if(NET.mode==='client') applyPub(d); });
 s.on('priv',d=>{ if(NET.mode==='client'&&d&&d.to===NET.myPeer) applyPriv(d); });
 s.on('cmb',d=>{ if(NET.mode==='client'&&d&&d.to===NET.myPeer) applyCmb(d); });
 s.on('car',d=>{ if(NET.mode==='client') applyCar(d); });
 s.on('cmbev',d=>{ if(NET.mode==='client'&&d&&d.ev) onCmbEv(d); });
 s.on('cmbs',d=>{ if(NET.mode==='client'&&d&&Array.isArray(d.list)&&(!d.to||d.to===NET.myPeer)){ G.allFights=d.list.slice(0,8); G.allR={s:clamp(d.R&&d.R[0]|0,1,9),n:clamp(d.R&&d.R[1]|0,1,7)}; G.view=null; } });
 s.on('bye',d=>{ if(NET.mode==='client'||NET.mode==='joining'){ hideLostBar(); NET.lost=null; toast(d&&d.reason==='otra ventana'?'Tu partida se abrió en otra ventana':'La sala se cerró'); if(G&&G.mirror) G.over=true; resetNet(); closeModal(); showMenu(); } });
 return s;
}
// ---- corte de conexión: se explica el motivo, se intenta volver solo y se puede forzar con el botón ----
const reasonText=r=>({'ping timeout':'el servidor dejó de responder','transport close':'se cortó la red o el servidor se reinició','transport error':'falló la red','io server disconnect':'el servidor cerró la conexión','io client disconnect':'te desconectaste'}[r]||String(r||'desconocido'));
function connLost(reason,s){
 NET.lost=Date.now(); console.warn('Conexión perdida:',reason); try{ localStorage.setItem('pt_dc',new Date().toISOString()+' '+reason); }catch(e){}
 showLostBar(reason); if(reason==='io server disconnect') s.connect(); // el servidor nos echó: socket.io no reintenta solo en ese caso
 clearTimeout(NET.lostT); NET.lostT=setTimeout(()=>{ if(NET.lost&&Date.now()-NET.lost>=290000){ toast('No se pudo recuperar la conexión'); giveUpLost(); } },300000);
}
function showLostBar(reason){
 let b=$('lostBar'); if(!b){ b=document.createElement('div'); b.id='lostBar'; b.setAttribute('role','alert'); document.body.appendChild(b); b.addEventListener('click',e=>{ const a=e.target.closest('button'); if(!a) return; if(a.dataset.a==='back') tryRejoin(); else if(a.dataset.a==='menu') giveUpLost(); }); }
 b.innerHTML=`<b>Conexión perdida</b> · ${esc(reasonText(reason))}. <i class="lbMsg">Reconectando…</i><span><button class="btn sm" data-a="back">Volver a mi partida</button><button class="btn sm" data-a="menu">Salir al menú</button></span>`; b.hidden=false;
}
function hideLostBar(){ const b=$('lostBar'); if(b) b.hidden=true; clearTimeout(NET.lostT); clearTimeout(NET.rjT); }
// «Volver a mi partida»: reintenta YA (sin esperar la espera creciente de socket.io) y, si en 8 s no llega el asiento, rehace la conexión
// (puede estar «conectada» a medias: el navegador aún no ha notado el corte). Con el socket conectado, 'connect' emite rejoin al volver
function tryRejoin(){ const s=sock(); if(!s) return; NET.mode='joining'; NET.lost=NET.lost||Date.now();
 if(s.connected) s.emit('rejoin'); else { s.disconnect(); s.connect(); } lostBarMsg('Volviendo a tu partida…');
 clearTimeout(NET.rjT); NET.rjT=setTimeout(()=>{ if(NET.mode==='joining'&&NET.lost){ s.disconnect(); s.connect(); lostBarMsg('Sin respuesta, reconectando…'); } },8000); }
function lostBarMsg(t){ const b=$('lostBar'), m=b&&b.querySelector('.lbMsg'); if(m) m.textContent=t; }
function giveUpLost(){ hideLostBar(); NET.lost=null; if(G&&G.mirror) G.over=true; resetNet(); closeModal(); showMenu(); }
// Botón del menú para volver a una partida a medias (el servidor guarda tu asiento unos minutos; un bot juega por ti mientras tanto)
function renderResume(){
 const nav=document.querySelector('.mnNav'); if(!nav) return; let b=$('resumeBtn');
 if(!NET.resume){ if(b) b.remove(); return; }
 if(!b){ b=document.createElement('button'); b.id='resumeBtn'; b.className='pxb pxb-main'; b.innerHTML='<i data-i="swap" data-s="44"></i><span class="pxbT"><b>Volver a tu partida</b><small></small></span>'; nav.prepend(b); b.onclick=()=>{ NET.lost=NET.lost||Date.now(); tryRejoin(); }; if(window.PX) PX.hydrate(b); }
 b.querySelector('small').textContent='Ronda '+(NET.resume.round||'?')+' · tu asiento te espera';
}
// El botón Atrás del navegador no saca de la partida: al volver atrás se avisa y se queda; al recargar o cerrar la pestaña en multijugador, el navegador pide confirmación
const liveGame=()=>!!(G&&G.players&&G.players.length&&!G.over&&$('menu')&&$('menu').classList.contains('hidden'));
function guardBack(){
 if(!history.state||!history.state.pt) history.pushState({pt:1},'',location.href);
 if(guardBack.on) return; guardBack.on=true;
 addEventListener('popstate',()=>{ if(liveGame()){ history.pushState({pt:1},'',location.href); toast('El botón Atrás está bloqueado durante la partida. Usa el menú ☰ para salir.'); } });
 addEventListener('beforeunload',e=>{ if(liveGame()&&NET.mode==='client'){ e.preventDefault(); e.returnValue=''; } });
}
function renderRoomList(){
 const el=$('roomList'); if(!el) return;
 const rooms=NET.rooms||[];
 el.innerHTML=rooms.length?rooms.map(r=>`<div class="roomItem">${tacHeadHTML(r.tr,34)}<b>${esc(String(r.name||'Sala').slice(0,24))}</b><span class="small muted">${+r.n||1}/${+r.max||8} · ${esc(DIFF_NAME[r.diff]||'Normal')}</span><button class="btn sm" data-code="${esc(r.code)}">Unirse</button></div>`).join(''):'<p class="muted small">No hay salas abiertas ahora. Crea una y pasa el código a tus amigos.</p>';
 el.querySelectorAll('button[data-code]').forEach(b=>b.onclick=()=>{ NET.mode='joining'; NET.sock.emit('join',{code:b.dataset.code}); });
}
function showRoomScreen(){
 NET.screen='room';
 openModal(`<h1>Sala <span class="code">${esc(NET.code)}</span></h1><p class="muted" id="roomInfo"></p><div class="seats" id="seats"></div>
  <div class="row" id="rmActions"></div>
  <p class="small muted">Pasa el código a tus amigos: lo escriben en Normal → Sala informal → Unirse.</p>`,{closable:false});
 renderSeats();
}
function renderSeats(){
 const el=$('seats'); if(!el) return; const cfg=NET.cfg||{name:'Sala',max:8,diff:'normal'};
 $('roomInfo').textContent=`${cfg.name} · sala informal (da caramelos, no cambia tu rango)`;
 const rows=[]; for(let i=0;i<8;i++){ const s=NET.seats[i]; rows.push(s?`<div class="seat ${s.peer===NET.owner?'host':''}">${tacHeadHTML(s.tr,44)}${nameHTML(s.nick,s.cs)}${s.peer===NET.myPeer?' (tú)':''}${s.peer===NET.owner?' <em class="hostTag">anfitrión</em>':''}</div>`:`<div class="seat wait"><i data-i="people" data-s="20"></i>Buscando jugador…</div>`); }
 el.innerHTML=rows.join(''); if(window.PX) PX.hydrate(el);
 const owner=NET.owner&&NET.owner===NET.myPeer;
 $('rmActions').innerHTML=(owner?'<button class="btn primary" id="rmStart">Empezar partida</button>':'<span class="muted" style="margin-right:auto">Esperando a que el creador de la sala empiece…</span>')+'<button class="btn" id="rmLeave">Salir de la sala</button>';
 if($('rmStart')) $('rmStart').onclick=()=>NET.sock.emit('start',{timer:PLAN_T,speed:1});
 $('rmLeave').onclick=()=>{ leaveRoom(); showNormal(); };
}
function resetNet(){ Object.assign(NET,{mode:'sp',code:'',owner:'',seats:[],cfg:null,screen:'',modal:'',shownOver:false,lastToast:0}); }
function leaveRoom(){ if(NET.sock) NET.sock.emit('leave'); if(G&&G.mirror) G.over=true; resetNet(); }
// ----- cliente: espejo del estado que manda el anfitrión -----
function startClient(){
 guardBack(); NET.mode='client'; closeModal(); NET.screen=''; $('menu').classList.add('hidden'); selected=null; selCombat=null; NET.shownOver=false; NET.lastToast=0;
 const me=makePlayer(-1,S.name,false,S.avatar,S.trainer);
 G={mirror:true,players:[me],me,phase:'idle',roundIdx:0,round:ROUNDS[0],timer:0,log:[],speed:1,pool:{},augTiers:['G','G','G'],diff:'normal',over:false,combat:null,acc:0,flip:false,myOpp:'',mp:true};
 me.tac=savedTac()||me.tac; renderUI();
}
function applyPub(d){
 if(!d||!Array.isArray(d.pl)) return;
 const prevPh=G.phase;
 G.phase=typeof d.ph==='string'?d.ph:G.phase; G.roundIdx=clamp(d.ri|0,0,ROUNDS.length-1); G.round=ROUNDS[G.roundIdx];
 G.timer=d.tl>=0?d.tl:Infinity; G.speed=[1,2,4].includes(d.sp)?d.sp:1; if(Array.isArray(d.at)) G.augTiers=d.at; G.diff=d.dif||'normal';
 const list=[];
 for(const r of d.pl.slice(0,8)){
   const [id,name,emoji,hp,level,streak,alive,place,peer,bot,ready,bn,tr,up,tac,tf,tp,tn,gn,icn,mw]=r;
   if(Number.isFinite(+icn)) r.icn=clamp(+icn|0,0,5);
   const p=peer&&peer===NET.myPeer?G.me:(G.players.find(x=>x.id===id&&x!==G.me)||makePlayer(id,'',!!bot,''));
   Object.assign(p,{id,name:String(name).slice(0,20),emoji:String(emoji).slice(0,4),tr:TRAINER_BY[tr]?tr:'',hp:+hp,level:+level,streak:+streak,alive:!!alive,place:+place,peer:String(peer||''),isBot:!!bot,ready:!!ready,boardN:+bn||0,lastUp:Array.isArray(up)&&up.length===3?up.map(Number):null,tac:TACS[tac]?tac:p.tac,tacForm:String(tf||',').split(',').slice(0,2).map(k=>DEF[k]?k:''),tp:Array.isArray(tp)&&tp.length===3&&tp.every(Number.isFinite)?tp:null,tn:(+tn|0)%1000,gn:(+gn|0)%1000});
   if(r.icn!=null&&p!==G.me) p.icn=r.icn;
   if(Array.isArray(mw)){ p.mewF=clamp(mw[0]|0,0,1100); p.mewN=mw[1]|0; p.mewK=clamp(mw[2]|0,0,MEW_MAX); }
   const bd=Array.isArray(d.bd)?d.bd[list.length]:null;
   if(p!==G.me&&Array.isArray(bd)){ unpackBoard(p,bd); if(Array.isArray(bd[2])) p.items=bd[2].filter(k=>ITEMS[k]).slice(0,ITEMS_HARD); if(Array.isArray(bd[3])) p.augments=bd[3].filter(a=>AUG_BY[a]); }
   list.push(p);
 }
 G.players=list;
 G.preview=G.round.type==='pve'&&G.phase==='planning'?pveWave(G.round.s,G.round.n):null;
 if(prevPh==='combat'&&G.phase!=='combat'){ G.combat=null; G.view=null; selCombat=null; }
 if(prevPh!=='combat'&&G.phase==='combat') G.prepT=PREP_T; // preparación, igual que en el servidor (f.t0 empieza tras ella)
 if(G.phase!=='carousel') G.carousel=null;
 if(prevPh==='augment'&&G.phase!=='augment'&&NET.modal==='aug') closeModal();
 if((d.ov||!G.me.alive)&&!NET.shownOver){ NET.shownOver=true; showGameOver(); }
 if(d.ov) G.over=true;
 renderUI();
}
// Tablero y banquillo de otro jugador (solo para mirarlos); se valida todo lo que llega
function unpackBoard(p,[bo,be]){
 const mk=(defId,star,items)=>DEF[defId]?{uid:'v'+p.id+defId+Math.random(),defId,baseId:DEF[defId].evoOf||defId,star:clamp(star|0,1,3),items:(Array.isArray(items)?items:[]).filter(i=>ITEMS[i]).slice(0,3),stk:{hp:0,ad:0},kills:0}:null;
 const old=new Map(allUnits(p).map(u=>[u.defId+'|'+u.star+'|'+u.items.join(),u]));
 // Reutiliza los objetos ya creados para que el 3D no recargue los modelos en cada mensaje
 const keep=u=>{ if(!u) return null; const k=u.defId+'|'+u.star+'|'+u.items.join(), o=old.get(k); if(o){ old.delete(k); return o; } return u; };
 p.board={}; for(const row of Array.isArray(bo)?bo.slice(0,12):[]){ if(Array.isArray(row)&&/^[0-6],[0-3]$/.test(row[0])){ const u=keep(mk(row[1],row[2],row[3])); if(u) p.board[row[0]]=u; } }
 p.bench=Array(BENCH).fill(null).map((_,i)=>{ const r=Array.isArray(be)&&be[i]; return Array.isArray(r)?keep(mk(r[0],r[1],r[2])):null; });
}
function applyPriv(d){
 const aq=d.aq|0; if(aq<(NET.q|0)&&Date.now()-(NET.qT||0)<1500) return; if(aq>(NET.q|0)) NET.q=aq; // aún no ha procesado tu última acción: este estado es anterior
 const me=G.me;
 Object.assign(me,{id:d.id,gold:+d.g||0,level:clamp(+d.l||1,1,10),xp:+d.x||0,shop:(d.sh||[]).slice(0,5).map(k=>DEF[k]?k:null),locked:!!d.lk,freeRerolls:+d.fr||0,augments:(d.au||[]).filter(a=>AUG_BY[a]),items:(d.it||[]).filter(i=>ITEMS[i]).slice(0,ITEMS_HARD)});
 me.mods=Object.assign(defaultMods(),d.md||{}); me.po=Array.isArray(d.po)?d.po.slice(0,8):null;
 me.agSnap=Array.isArray(d.ag)?d.ag.filter(r=>Array.isArray(r)&&AUG_BY[r[0]]).slice(0,30):[];
 me.loot=d.lt&&typeof d.lt==='object'?{gold:+d.lt.gold||0,units:+d.lt.units||0,items:+d.lt.items||0,value:+d.lt.value||0}:null;
 me.reveals=Array.isArray(d.rv)?d.rv.filter(r=>Array.isArray(r)&&r.length>=5).slice(-3).map(r=>[+r[0]||0,...r.slice(1,6).map(x=>String(x).slice(0,300)),Array.isArray(r[6])?r[6].slice(0,3).map(n=>clamp(+n|0,1,6)):0]):[];
 me.picks=d.pk&&Array.isArray(d.pk.opts)?[{id:+d.pk.id,src:String(d.pk.src),title:String(d.pk.title).slice(0,60),desc:String(d.pk.desc||'').slice(0,400),opts:d.pk.opts.slice(0,6).map(o=>({t:String(o.t).slice(0,60),i:String(o.i||'').slice(0,4),d:String(o.d||'').slice(0,200),v:String(o.v)}))}]:[];
 me.augUi=d.ap&&typeof d.ap==='object'?d.ap:{};
 me.rres={}; for(const s of String(d.rr||'').split(',').slice(0,8)){ const m=/^(\d{1,3})([WL])$/.exec(s); if(m) me.rres[+m[1]]=m[2]; }
 me.orbs=Array.isArray(d.ob)?d.ob.slice(0,12).filter(o=>Array.isArray(o)&&['gray','gold','prism'].includes(o[1])).map(([id,tier,c,r,nu])=>({id:+id,tier,toks:[],nu:clamp(nu|0,0,9),c:Number.isInteger(c)?clamp(c,0,6):null,r:Number.isInteger(r)?clamp(r,0,7):null})):[];
 const selUid=selected&&selected.uid;
 // Cada mensaje trae las fichas otra vez: se reutiliza el mismo objeto (por uid) para que el 3D no destruya y recree el modelo
 // (si no, cada acción de cualquiera reiniciaba la animación y la ficha daba un giro al aparecer de nuevo)
 const oldU=new Map(allUnits(me).map(u=>[u.uid,u])), keepU=a=>{ const n=unpackInst(a); if(!n) return null; const o=oldU.get(n.uid); if(!o) return n; Object.assign(o,n); return o; };
 me.bench=Array(BENCH).fill(null).map((_,i)=>d.be&&d.be[i]?keepU(d.be[i]):null);
 me.board={}; for(const row of d.bo||[]){ const u=keepU(row[1]); if(u&&/^[0-6],[0-3]$/.test(row[0])) me.board[row[0]]=u; }
 selected=selUid?allUnits(me).find(u=>u.uid===selUid)||null:null;
 const hadChoices=!!me.augChoices; me.augChoices=Array.isArray(d.ac)?d.ac.filter(a=>AUG_BY[a]):null; me.eeveeForm=DEF[d.ef]?d.ef:''; me.augRR=Array.isArray(d.ar)?d.ar.slice(0,3).map(x=>x?1:0):[0,0,0];
 G.log=Array.isArray(d.lg)?d.lg.map(String):[];
 for(const [seq,msg] of d.ts||[]) if(seq>NET.lastToast){ NET.lastToast=seq; toast(String(msg)); }
 if(G.phase==='augment'&&me.augChoices&&me.augChoices.length&&(NET.modal!=='aug'||!hadChoices||NET.augKey!==me.augChoices.join()+'|'+(me.augRR||[]).join())) showAugment();
 if(!me.augChoices&&NET.modal==='aug') closeModal();
 renderUI();
}
function applyCmb(d){
 if(!d||!d.a) return;
 const R={s:clamp(d.R&&d.R[0]|0,1,9),n:clamp(d.R&&d.R[1]|0,1,7)};
 G.cmbData={a:d.a,b:d.b||null,R,seed:d.seed}; G.fightEv=G.fightEv||{}; const evs=G.fightEv[d.seed]||[];
 G.combat=createCombatSnap(d.a,d.b||null,R,{seed:d.seed,visual:true}); G.combat.evq=evs.slice(); G.flip=d.side===1; G.acc=0; if(!(G.prepT>0)) G.prepT=PREP_T; G.myOpp=String(d.opp||'').slice(0,40); G.myOppTr=TRAINER_BY[d.ot]?d.ot:''; selCombat=null;
 renderUI();
}
// Evento de objeto en un combate en curso: se aplica a su tiempo o se reconstruye el combate si ya pasó
function onCmbEv(d){
 const ev={t:+d.ev.t||0,side:d.ev.side?1:0,bk:String(d.ev.bk),items:(Array.isArray(d.ev.items)?d.ev.items:[]).filter(i=>ITEMS[i]).slice(0,3)};
 if(!/^[0-6],[0-3]$/.test(ev.bk)) return; G.fightEv=G.fightEv||{}; (G.fightEv[d.seed]=G.fightEv[d.seed]||[]).push(ev);
 const fix=(cb,data)=>{ if(!cb) return cb; if(cb.t<ev.t){ (cb.evq=cb.evq||[]).push(ev); cb.evq.sort((x,y)=>x.t-y.t); return cb; } return rebuildCombat(data.a,data.b,data.R,data.seed,G.fightEv[d.seed],cb.t); };
 if(G.cmbData&&G.cmbData.seed===d.seed&&G.combat){ const sel=selCombat; G.combat=fix(G.combat,G.cmbData); if(sel) selCombat=null; }
 if(G.view&&G.view.cb&&G.view.seed===d.seed) G.view.cb=fix(G.view.cb,G.view.data);
}
function applyCar(d){
 if(!d||!Array.isArray(d.opts)||!Array.isArray(d.av)) return;
 const byId=id=>G.players.find(p=>p.id===id);
 const opts=d.opts.slice(0,9).map(o=>({key:DEF[o[0]]?o[0]:'pichu',item:ITEMS[o[1]]?o[1]:'claw',taken:o[2]>=0?(byId(o[2])||{}):null}));
 const order=[], av={}, {cx,cy,rr}=carGeo(), prev=G.carousel&&G.carousel.av||{};
 for(const a of d.av.slice(0,8)){
   const p=byId(a[0]); if(!p) continue; order.push(p);
   const x=typeof a[1]==='number'?cx+a[1]*rr:null, y=typeof a[2]==='number'?cy+a[2]*rr:null, o=prev[p.id];
   // Guarda la posición anterior para que el entrenador se deslice y mire hacia donde camina
   av[p.id]={x,y,px:o&&o.x!=null?o.x:x,py:o&&o.y!=null?o.y:y,at:performance.now(),face:o&&o.x!=null&&x!=null&&Math.abs(x-o.x)>.5?(x<o.x?-1:1):(o?o.face:1),rel:!!a[3],done:!!a[4],carry:DEF[a[5]]?{key:a[5],item:'claw'}:null,target:a[6]>=0?a[6]:null};
 }
 G.carousel={opts,order,av,rot:+d.rot||0,rotAt:performance.now(),t:+d.t||0,mirror:true};
}
// Acción local: en modo cliente se envía al anfitrión; en solitario o como anfitrión se aplica directamente
function doAct(a,optimistic){
 if(!G||!G.players.length) return;
 if(NET.mode==='client'){
   if(!G.me.alive) return;
   // Las acciones con efecto inmediato llevan un número: el servidor lo devuelve en su estado (aq) y así se descartan los mensajes viejos que aún viajaban y harían rebotar la ficha a su sitio anterior
   if(optimistic){ a={...a,q:NET.q=(NET.q|0)+1}; NET.qT=Date.now(); }
   if(NET.sock) NET.sock.emit('act',a);
   if(optimistic) optimistic();
   renderSoon(a); return;
 }
 const r=applyAct(G.me,a);
 if(r&&!r.ok&&r.why) note(G.me,r.why,true);
 renderSoon(a); return r;
}
// Mover una ficha cambia el estado al instante y el 3D la dibuja ya en su sitio en el siguiente fotograma; el resto de paneles (ocho listas con imágenes y filtros) se reescribe justo después de pintarlo, para que soltar no espere ~10 ms de DOM
let uiSoon=false;
function renderSoon(a){ if(!a||a.t!=='move'||typeof requestAnimationFrame!=='function'){ renderUI(); return; }
 // El 3D ya dibuja el tablero nuevo en el siguiente fotograma: se invalidan las cachés de sinergias y estadísticas (se indexan por G.uiV) para que ese fotograma use el tablero nuevo; si no, la sinergia que se activa con esta ficha (p. ej. el 2.º Guardián) se calculaba con el tablero viejo y el efecto de colocación no salía
 G.uiV=(G.uiV||0)+1;
 if(uiSoon) return; uiSoon=true; requestAnimationFrame(()=>setTimeout(()=>{ uiSoon=false; renderUI(); },0)); }

/* ============================== [MUSIC] ============================== */
// Sintetizador con canales tipo Game Boy: 2 pulsos (12.5% y 25%), onda y ruido, vibrato e intros.
// Todas las melodías son originales, compuestas para este juego al estilo de las bandas sonoras de la época.
const SONGS={
 menu:{bpm:128,bass:'eighth',arp:'none',harm:true,drums:'fast',intro:[
   {c:'C4 E4 G4',m:'C5/2 G4/2 C5/2 E5/2 G5/4 C6/4'},{c:'G3 B3 D4',m:'B5/4 G5/4 D5/4 r/4'}],bars:[
  {c:'C4 E4 G4',m:'E5/4 G5/4 C6/6 B5/2'},{c:'G3 B3 D4',m:'D6/4 B5/4 G5/8'},{c:'A3 C4 E4',m:'A5/2 B5/2 C6/4 E6/4 C6/4'},{c:'F3 A3 C4',m:'A5/6 G5/2 F5/4 A5/4'},
  {c:'C4 E4 G4',m:'G5/4 E5/4 C5/4 E5/4'},{c:'G3 B3 D4',m:'D5/2 E5/2 G5/4 B5/4 D6/4'},{c:'F3 A3 C4',m:'C6/4 A5/4 F5/4 A5/4'},{c:'G3 B3 D4',m:'G5/8 D5/4 B4/4'}]},
 plan:{bpm:112,bass:'walk',arp:'8',harm:true,drums:'soft',bars:[
  {c:'F3 A3 C4',m:'A4/2 C5/2 F5/4 E5/2 F5/2 G5/4'},{c:'D3 F3 A3',m:'A5/4 F5/2 D5/2 A4/8'},{c:'Bb2 D3 F3',m:'Bb4/2 D5/2 F5/4 D5/2 F5/2 Bb5/4'},{c:'C3 E3 G3',m:'A5/4 G5/4 E5/4 C5/4'},
  {c:'F3 A3 C4',m:'F5/2 G5/2 A5/4 C6/4 A5/4'},{c:'A2 C3 E3',m:'G5/4 E5/2 C5/2 E5/8'},{c:'Bb2 D3 F3',m:'D5/2 F5/2 Bb5/4 A5/2 G5/2 F5/4'},{c:'C3 E3 G3',m:'E5/4 G5/4 C5/8'}]},
 battle:{bpm:184,bass:'sixteen',arp:'none',harm:true,drums:'battle',intro:[
   {c:'A3 C4 E4',m:'E6/1 D#6/1 D6/1 C#6/1 C6/1 B5/1 A#5/1 A5/1 G#5/1 G5/1 F#5/1 F5/1 E5/1 D#5/1 D5/1 C#5/1'},
   {c:'A3 C4 E4',m:'C5/1 B4/1 A#4/1 A4/1 G#4/1 G4/1 F#4/1 F4/1 E4/2 r/2 E4/2 r/2'},
   {c:'A3 C4 E4',m:'A4/3 A4/3 A4/2 r/2 E5/2 A5/4'},{c:'E3 G#3 B3',m:'G#5/3 G#5/3 G#5/2 r/2 B5/2 E6/4'}],bars:[
  {c:'A3 C4 E4',m:'A5/3 E5/3 A5/2 C6/4 B5/2 A5/2'},{c:'F3 A3 C4',m:'C6/6 B5/2 A5/4 F5/4'},{c:'G3 B3 D4',m:'G5/3 D5/3 G5/2 B5/4 A5/2 G5/2'},{c:'E3 G#3 B3',m:'B5/6 A5/2 G#5/4 E5/4'},
  {c:'A3 C4 E4',m:'A5/2 B5/2 C6/2 E6/2 D6/4 C6/4'},{c:'F3 A3 C4',m:'A5/3 C6/3 F6/2 E6/4 C6/4'},{c:'D3 F3 A3',m:'D6/3 C6/3 A5/2 F5/4 A5/4'},{c:'E3 G#3 B3',m:'G#5/2 A5/2 B5/2 D6/2 E6/8'},
  {c:'C4 E4 G4',m:'G5/3 E5/3 C5/2 E5/2 G5/2 C6/4'},{c:'G3 B3 D4',m:'B5/3 A5/3 G5/2 D5/8'},{c:'F3 A3 C4',m:'A5/3 G5/3 F5/2 C5/2 F5/2 A5/4'},{c:'E3 G#3 B3',m:'G#5/4 B5/4 E6/4 D6/2 B5/2'}]},
 wild:{bpm:192,bass:'sixteen',arp:'none',harm:true,drums:'battle',intro:[
   {c:'E3 G3 B3',m:'E4/1 F#4/1 G4/1 A4/1 B4/1 C5/1 D5/1 E5/1 F#5/1 G5/1 A5/1 B5/1 C6/1 D6/1 E6/2'},
   {c:'B2 D#3 F#3',m:'B5/2 r/2 B5/2 r/2 B5/2 A5/2 G5/2 F#5/2'}],bars:[
  {c:'E3 G3 B3',m:'E5/2 B4/2 E5/2 G5/2 F#5/4 E5/4'},{c:'C3 E3 G3',m:'G5/4 E5/2 C5/2 E5/8'},{c:'D3 F#3 A3',m:'F#5/2 A5/2 D6/4 C6/2 B5/2 A5/4'},{c:'B2 D#3 F#3',m:'B5/8 A5/2 F#5/2 D#5/4'},
  {c:'E3 G3 B3',m:'E5/2 G5/2 B5/4 A5/2 G5/2 F#5/4'},{c:'C3 E3 G3',m:'E5/4 G5/4 C6/4 B5/4'},{c:'A2 C3 E3',m:'A5/2 C6/2 E6/4 D6/2 C6/2 A5/4'},{c:'B2 D#3 F#3',m:'B5/6 A5/2 F#5/4 D#5/4'}]},
 carousel:{bpm:124,bass:'walk',arp:'8',harm:true,drums:'soft',bars:[
  {c:'G3 B3 D4',m:'B4/2 D5/2 G5/2 D5/2 B5/4 G5/4'},{c:'E3 G3 B3',m:'E5/2 G5/2 B5/4 A5/4 G5/4'},{c:'C3 E3 G3',m:'E5/4 C5/4 G5/4 E5/4'},{c:'D3 F#3 A3',m:'F#5/2 A5/2 D6/4 C6/2 A5/2 F#5/4'},
  {c:'G3 B3 D4',m:'D5/2 G5/2 B5/2 G5/2 D6/4 B5/4'},{c:'E3 G3 B3',m:'G5/4 E5/4 B4/4 E5/4'},{c:'C3 E3 G3',m:'C5/2 E5/2 G5/2 C6/2 B5/4 A5/4'},{c:'D3 F#3 A3',m:'A5/4 F#5/4 D5/8'}]},
 win:{bpm:150,bass:'half',arp:'none',harm:true,loop:false,bars:[{c:'C4 E4 G4',m:'G5/1 G5/1 G5/1 G5/1 E5/2 G5/2 C6/8'},{c:'F3 A3 C4',m:'A5/2 C6/2 F6/4 E6/2 D6/2 C6/4'},{c:'G3 B3 D4',m:'B5/2 D6/2 G6/4 F6/2 D6/2 B5/4'},{c:'C4 E4 G4',m:'C6/16'}]},
 lose:{bpm:84,bass:'half',arp:'none',harm:true,loop:false,bars:[{c:'A3 C4 E4',m:'E5/4 D5/4 C5/4 B4/4'},{c:'F3 A3 C4',m:'C5/4 A4/4 F4/8'},{c:'E3 G#3 B3',m:'G#4/8 B4/8'},{c:'A3 C4 E4',m:'A4/16'}]},
};
const Music=(()=>{
 let ac=null, master=null, cur=null, curName='', step=0, nextT=0, noise=null, waves={}; const compiled={};
 const NOTE={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
 const midi=n=>{ const m=n.match(/^([A-G])([#b]?)(\d)$/); return 12*(+m[3]+1)+NOTE[m[1]]+(m[2]==='#'?1:m[2]==='b'?-1:0); };
 const fq=m=>440*Math.pow(2,(m-69)/12);
 function build(song){
  const map={}; const push=(s,e)=>{ (map[s]=map[s]||[]).push(e); };
  const all=[...(song.intro||[]),...song.bars];
  all.forEach((bar,bi)=>{
   const b0=bi*16; let t=0; const ch=bar.c.split(' ').map(midi); const pcs=new Set(ch.map(x=>x%12));
   for(const tok of bar.m.trim().split(/\s+/)){ const [n,l]=tok.split('/'); if(n!=='r'){ const m=midi(n); push(b0+t,{ch:'lead',m,l:+l});
     if(song.harm){ let h=m-3; while(h>m-10&&!pcs.has(((h%12)+12)%12)) h--; if(h>m-10) push(b0+t,{ch:'harm',m:h,l:+l}); } } t+=+l; }
   if(song.bass==='sixteen') for(let i=0;i<16;i++) push(b0+i,{ch:'bass',m:ch[0]-12+(i%2?12:0),l:1});
   else if(song.bass==='eighth') for(let i=0;i<8;i++) push(b0+i*2,{ch:'bass',m:ch[0]-12+(i%2?12:0),l:2});
   else if(song.bass==='half'){ push(b0,{ch:'bass',m:ch[0]-12,l:8}); push(b0+8,{ch:'bass',m:ch[2]-12,l:8}); }
   else if(song.bass==='walk') [0,2,1,2].forEach((k,i)=>push(b0+i*4,{ch:'bass',m:ch[k]-12,l:3}));
   if(song.arp==='8') for(let i=0;i<8;i++) push(b0+i*2,{ch:'arp',m:ch[i%3]+12,l:1});
   if(song.drums==='battle') for(let i=0;i<16;i++){ if(i===0||i===8||i===10) push(b0+i,{ch:'kick'}); if(i===4||i===12) push(b0+i,{ch:'snare'}); if(i%2===1) push(b0+i,{ch:'hat'}); }
   else if(song.drums==='fast') for(let i=0;i<16;i++){ if(i%4===0) push(b0+i,{ch:'kick'}); if(i%8===4) push(b0+i,{ch:'snare'}); if(i%2===1) push(b0+i,{ch:'hat'}); }
   else if(song.drums==='soft') for(let i=0;i<16;i++){ if(i%8===0) push(b0+i,{ch:'kick'}); if(i%4===2) push(b0+i,{ch:'hat'}); }
  });
  return {bpm:song.bpm,len:all.length*16,loopAt:(song.intro||[]).length*16,map,loop:song.loop!==false};
 }
 function pulseWave(d){ const n=40, re=new Float32Array(n), im=new Float32Array(n); for(let k=1;k<n;k++) re[k]=(2/(k*Math.PI))*Math.sin(k*Math.PI*d); return ac.createPeriodicWave(re,im); }
 function voice(wave,f,t,dur,vol,vib){
  const o=ac.createOscillator(), g=ac.createGain();
  if(typeof wave==='string') o.type=wave; else o.setPeriodicWave(wave);
  o.frequency.setValueAtTime(f,t);
  if(vib&&dur>.18){ const l=ac.createOscillator(), lg=ac.createGain(); l.frequency.value=5.8; lg.gain.setValueAtTime(0,t); lg.gain.linearRampToValueAtTime(f*.012,t+Math.min(.25,dur*.6)); l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t+dur+.1); }
  g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+.005); g.gain.setTargetAtTime(vol*.72,t+.02,.12); g.gain.setTargetAtTime(0,t+Math.max(.02,dur-.02),.015);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+dur+.12);
 }
 function drum(kind,t){
  if(kind==='kick'){ const o=ac.createOscillator(), g=ac.createGain(); o.type='square'; o.frequency.setValueAtTime(180,t); o.frequency.exponentialRampToValueAtTime(40,t+.09); g.gain.setValueAtTime(.16,t); g.gain.exponentialRampToValueAtTime(.001,t+.11); o.connect(g); g.connect(master); o.start(t); o.stop(t+.12); return; }
  const s=ac.createBufferSource(); s.buffer=noise; const f=ac.createBiquadFilter(); f.type=kind==='hat'?'highpass':'bandpass'; f.frequency.value=kind==='hat'?8000:2400;
  const g=ac.createGain(), d=kind==='hat'?.025:.09; g.gain.setValueAtTime(kind==='hat'?.035:.12,t); g.gain.exponentialRampToValueAtTime(.001,t+d);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t+d+.02);
 }
 function tick(){
  if(!ac||!cur) return; const spb=60/cur.bpm/4;
  while(nextT<ac.currentTime+.15){
   const evs=cur.map[step];
   if(evs) for(const e of evs){
    const dur=(e.l||1)*spb;
    if(e.ch==='lead') voice(waves.p25,fq(e.m),nextT,dur*.95,.055,true);
    else if(e.ch==='harm') voice(waves.p12,fq(e.m),nextT,dur*.9,.03,false);
    else if(e.ch==='arp') voice(waves.p12,fq(e.m),nextT,dur*.8,.018,false);
    else if(e.ch==='bass') voice('triangle',fq(e.m),nextT,dur*.85,.13,false);
    else drum(e.ch,nextT);
   }
   nextT+=spb; step++;
   if(step>=cur.len){ if(cur.loop) step=cur.loopAt; else { cur=null; break; } }
  }
 }
 return {
  init(){ if(ac||HEADLESS) return; const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return;
   ac=new AC(); master=ac.createGain(); master.connect(ac.destination);
   noise=ac.createBuffer(1,ac.sampleRate*.3,ac.sampleRate); const d=noise.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
   waves.p12=pulseWave(.125); waves.p25=pulseWave(.25);
   this.setVol(); setInterval(tick,25); if(curName){ const n=curName; curName=''; this.play(n); } },
  play(name){ if(name===curName) return; curName=name; if(!ac) return; cur=compiled[name]||(compiled[name]=build(SONGS[name])); step=0; nextT=ac.currentTime+.06; },
  setVol(){ if(master) master.gain.setTargetAtTime(S.muted?0:S.vol*.9,ac.currentTime,.05); },
  // Pitido corto (aviso de tiempo)
  beep(f,dur){ if(!ac||S.muted) return; voice(waves.p25||'square',f,ac.currentTime+.01,dur,.22); },
  // Nota de cristal: seno con un armónico suave, ataque rápido y cola larga (eco ligero)
  chime(f,t,vol,len){ const o=ac.createOscillator(), o2=ac.createOscillator(), g=ac.createGain(); o.type='sine'; o2.type='triangle'; o.frequency.value=f; o2.frequency.value=f*2.01;
   const g2=ac.createGain(); g2.gain.value=.18; o2.connect(g2); g2.connect(g); o.connect(g); g.connect(master);
   g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(vol,t+.012); g.gain.exponentialRampToValueAtTime(.0001,t+len);
   o.start(t); o2.start(t); o.stop(t+len+.05); o2.stop(t+len+.05); },
  // Reloj: dos notas que suben cada segundo (5 → 1), cada vez más agudas y juntas, para meter prisa sin sonar a alarma
  sample(url,vol=1,alt){ if(HEADLESS||S.muted||!S.vol) return; const a=new Audio(url); a.volume=Math.min(1,S.vol*vol); a.onerror=()=>{ if(alt) this.sample(alt,vol); }; a.play().catch(()=>{}); },
  cry(name,dex){ const id=String(name||'').toLowerCase().replace(/[^a-z0-9]/g,''); if(id) this.sample('https://play.pokemonshowdown.com/audio/cries/'+id+'.mp3',.55,dex?'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/'+dex+'.ogg':null); },
  sfx(k){ const u=SFX[k]; if(u) this.sample(u[0],u[1]); },
  hurry(sec){ if(!ac||S.muted) return; const t=ac.currentTime+.01, k=5-sec, base=[659,784,880,1047,1175][Math.max(0,Math.min(4,k))], gap=.11-k*.012;
   this.chime(base,t,.16,.38); this.chime(base*1.5,t+gap,.13,.45); if(sec<=2) this.chime(base*2,t+gap*2,.08,.5); },
  // Evolución épica propia: subida brillante en arpegio, golpe grave y acorde mayor que se abre con destellos.
  // big: minileyenda (más larga); mega: Mega evolución (más grave, con segunda subida)
  // Fanfarria cosmética (gacha): arpegio de campanas con las notas del premio y un acorde final; dura ~1,3 s
  fanfare(notes){ if(!ac||S.muted||!Array.isArray(notes)) return; const t0=ac.currentTime+.03;
   const bell=(f,t,len,vol)=>{ const o=ac.createOscillator(), o2=ac.createOscillator(), g=ac.createGain(); o.type='triangle'; o2.type='sine'; o.frequency.value=f; o2.frequency.value=f*2;
     g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(vol,t+.015); g.gain.exponentialRampToValueAtTime(.0001,t+len); o.connect(g); o2.connect(g); g.connect(master); o.start(t); o2.start(t); o.stop(t+len+.05); o2.stop(t+len+.05); };
   notes.slice(0,6).forEach((f,i)=>bell(f,t0+i*.11,.5,.16)); const tf=t0+notes.length*.11+.05; notes.slice(-3).forEach(f=>bell(f,tf,.9,.1)); },
  evolve(kind){ if(!ac||S.muted) return; const t0=ac.currentTime+.02, big=kind!=='unit', mega=kind==='mega';
   const pad=(f,t,len,vol,type='sawtooth')=>{ const o=ac.createOscillator(), fl=ac.createBiquadFilter(), g=ac.createGain(); o.type=type; o.frequency.value=f; o.detune.value=(Math.random()-.5)*14;
     fl.type='lowpass'; fl.frequency.setValueAtTime(400,t); fl.frequency.exponentialRampToValueAtTime(4200,t+len*.4); fl.Q.value=2;
     g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(vol,t+Math.min(.25,len*.2)); g.gain.exponentialRampToValueAtTime(.0001,t+len);
     o.connect(fl); fl.connect(g); g.connect(master); o.start(t); o.stop(t+len+.05); };
   // 1) arpegio que sube (cada vez más rápido) hacia la tónica
   const run=mega?[262,330,392,523,659,784,1047,1319]:big?[294,370,440,587,740,880,1175]:[392,494,587,784,988];
   let t=t0; run.forEach((f,i)=>{ this.chime(f,t,.1,.35); t+=Math.max(.045,(big?.11:.08)-i*.009); });
   // 2) golpe grave y acorde mayor amplio (con quinta y octava) que crece
   const hit=t+.02, root=mega?131:big?147:196;
   { const o=ac.createOscillator(), g=ac.createGain(); o.type='sine'; o.frequency.setValueAtTime(root*1.5,hit); o.frequency.exponentialRampToValueAtTime(root/2,hit+.35);
     g.gain.setValueAtTime(.0001,hit); g.gain.exponentialRampToValueAtTime(.32,hit+.01); g.gain.exponentialRampToValueAtTime(.0001,hit+.5); o.connect(g); g.connect(master); o.start(hit); o.stop(hit+.55); }
   const len=mega?2.4:big?1.9:1.2, chord=[1,1.25,1.5,2,2.5,3].map(m=>root*2*m);
   chord.forEach((f,i)=>pad(f,hit+i*.012,len,(i<3?.05:.03)*(big?1.15:1)));
   // 3) destellos que caen en cascada sobre el acorde
   for(let i=0;i<(big?9:5);i++) this.chime(root*8*[1,1.25,1.5,2][i%4]*(i%2?1.0:2),hit+.08+i*(big?.09:.07),.05,.5);
   if(mega){ const t2=hit+.55; [523,659,784,1047].forEach((f,i)=>this.chime(f*2,t2+i*.05,.07,.6)); pad(root*4,t2,1.6,.035,'triangle'); } },
  // Transformación de Mew: zumbido psíquico que ondula (baja y vuelve a subir) y un destello al final, menos de medio segundo
  morph(){ if(!ac||S.muted) return; const t=ac.currentTime+.01;
   for(const [f0,det] of [[880,0],[887,9]]){ const o=ac.createOscillator(), lfo=ac.createOscillator(), lg=ac.createGain(), bp=ac.createBiquadFilter(), g=ac.createGain();
     o.type='triangle'; o.detune.value=det; o.frequency.setValueAtTime(f0,t); o.frequency.exponentialRampToValueAtTime(240,t+.2); o.frequency.exponentialRampToValueAtTime(700,t+.42);
     lfo.frequency.value=22; lg.gain.value=60; lfo.connect(lg); lg.connect(o.frequency); bp.type='bandpass'; bp.frequency.value=900; bp.Q.value=.8;
     g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.07,t+.04); g.gain.exponentialRampToValueAtTime(.0001,t+.46);
     o.connect(bp); bp.connect(g); g.connect(master); o.start(t); lfo.start(t); o.stop(t+.5); lfo.stop(t+.5); }
   this.chime(1568,t+.36,.08,.35); this.chime(2093,t+.42,.06,.4); },
  // Comprar EXP: oro que se convierte en energía (barrido ascendente con brillo al final)
  xp(){ if(!ac||S.muted) return; const t=ac.currentTime+.01, o=ac.createOscillator(), f=ac.createBiquadFilter(), g=ac.createGain();
   o.type='sawtooth'; o.frequency.setValueAtTime(220,t); o.frequency.exponentialRampToValueAtTime(880,t+.22); f.type='lowpass'; f.frequency.setValueAtTime(600,t); f.frequency.exponentialRampToValueAtTime(3200,t+.22); f.Q.value=6;
   g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.09,t+.03); g.gain.exponentialRampToValueAtTime(.0001,t+.28); o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t+.3);
   this.chime(1319,t+.2,.1,.35); this.chime(1760,t+.27,.08,.4); },
  // Soltar una ficha: golpe suave y redondo, sin estridencias
  drop(){ if(!ac||S.muted) return; const t=ac.currentTime+.005, o=ac.createOscillator(), g=ac.createGain(); o.type='sine'; o.frequency.setValueAtTime(260,t); o.frequency.exponentialRampToValueAtTime(120,t+.09);
   g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.2,t+.008); g.gain.exponentialRampToValueAtTime(.0001,t+.14); o.connect(g); g.connect(master); o.start(t); o.stop(t+.16);
   const s=ac.createBufferSource(); s.buffer=noise; const f=ac.createBiquadFilter(); f.type='lowpass'; f.frequency.value=900; const gn=ac.createGain(); gn.gain.setValueAtTime(.05,t); gn.gain.exponentialRampToValueAtTime(.0001,t+.05); s.connect(f); f.connect(gn); gn.connect(master); s.start(t); s.stop(t+.06); },
 };
})();
function wantedSong(){
 if(!$('menu').classList.contains('hidden')||!G||!G.players||!G.players.length) return 'menu';
 if(G.phase==='over'||(G.mirror&&G.over)) return G.me.place===1?'win':'lose';
 if(G.phase==='combat') return G.round&&G.round.type==='pve'?'wild':'battle';
 if(G.phase==='carousel') return 'carousel';
 return 'plan';
}

/* =============================== [UI] =============================== */
const $=id=>HEADLESS?null:document.getElementById(id);
let cv,ctx,geo={},imgCache={},drag=null,itemDrag=null,hover=null,selected=null,selCombat=null,colors={},lastPhaseTxt='',lastFeedV=-1,lastCardT=0;
function loadImg(key,src){
 let e=imgCache[key]; if(e) return e;
 e=imgCache[key]={img:new Image(),status:'loading'};
 e.img.onload=()=>e.status='ok'; e.img.onerror=()=>e.status='fail'; e.img.src=src; return e;
}
const getImg=dex=>loadImg(dex,SPRITE(dex));
const getTrImg=k=>loadImg('tr:'+k,TRAINER_SPRITE(k));
// Arte de cada objeto (sprites de objetos de PokeAPI); las insignias se dibujan con el icono de su sinergia
const ITEM_ART={claw:'razor-claw',wing:'swift-wing',spoon:'twisted-spoon',water:'mystic-water',coat:'metal-coat',goggles:'safety-goggles',club:'thick-club',lens:'protective-pads',medal:'gold-bottle-cap',
 band:'choice-band',expert:'expert-belt',shellbell:'shell-bell',mental:'mental-herb',sash:'focus-sash',blood:'big-root',sitrus:'sitrus-berry',sharp:'scope-lens',scarf:'choice-scarf',rage:'muscle-band',
 light:'light-ball',titan:'protector',twin:'quick-claw',quick:'quick-powder',razorfang:'razor-fang',specs:'choice-specs',moon:'moon-stone',royal:'kings-rock',veil:'light-clay',charcoal:'charcoal',
 wise:'wise-glasses',soothe:'soothe-bell',energy:'energy-root',holy:'fresh-water',cure:'lum-berry',justice:'life-orb',helmet:'rocky-helmet',vest:'assault-vest',flame:'flame-orb',sturdy:'eviolite',
 scale:'dragon-scale',bright:'bright-powder',whiteherb:'white-herb',leftovers:'leftovers',hook:'grip-claw',zoom:'punching-glove',master:'master-ball',magnet:'magnet'};
const BADGE_SPRITE=n=>`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/badges/${n}.png`;
// Objetos: sprites de Wikidex (Escarlata/Púrpura) reducidos a 80 px en WebP (2 KB cada uno), en public/items/<clave>.webp y por CDN como los retratos; si fallan, cae al sprite pequeño de PokeAPI (data-alt). Las insignias siguen con sus sprites pixelados de PokeAPI
// Aura de fondo del color de cada sprite (la tabla es el tono dominante de cada imagen; los 8 componentes básicos lo llevan en el CSS). Las insignias y los emblemas no tienen sprite propio y no llevan aura
const ITEM_FX={has:()=>true}; // TODOS los objetos llevan aura, en la banca, sobre un Pokémon, en el carrusel y donde sea
const BASIC_FXC={claw:'210,222,245',wing:'170,235,255',spoon:'190,110,255',water:'70,170,255',coat:'150,195,225',goggles:'255,110,90',club:'255,228,160',lens:'120,150,255'};
const ITEM_FXC={...BASIC_FXC,band:'243,110,104',blood:'243,193,104',bright:'104,243,112',charcoal:'205,215,245',cure:'169,240,70',energy:'243,197,104',expert:'205,215,245',flame:'243,114,104',helmet:'240,195,71',holy:'190,205,235',hook:'205,215,245',justice:'240,67,167',leftovers:'243,107,104',light:'239,230,57',magnet:'242,90,97',master:'243,104,180',medal:'239,216,62',mental:'190,205,235',moon:'205,215,245',quick:'104,171,243',rage:'240,209,70',razorfang:'190,205,235',royal:'240,218,73',sash:'242,98,104',scale:'104,209,243',scarf:'104,187,243',sharp:'243,228,104',shellbell:'190,205,235',sitrus:'243,229,104',soothe:'243,104,109',specs:'242,139,89',sturdy:'192,104,243',titan:'241,134,85',twin:'243,198,104',veil:'188,243,104',vest:'240,75,87',whiteherb:'190,205,235',wise:'205,215,245',zoom:'240,64,68'};
const artKey=k=>ITEMS[k]&&ITEMS[k].base||k; // los radiantes usan el arte de su objeto
const itemHQ=k=>{ k=artKey(k); return !!(ITEM_ART[k]&&!(ITEMS[k]&&ITEMS[k].badge)); };
const itemAlt=k=>{ k=artKey(k); return ITEM_ART[k]?ITEM_SPRITE(ITEM_ART[k]):''; };
const itemSrc=k=>{ k=artKey(k); return ITEMS[k]&&ITEMS[k].badge?BADGE_SPRITE(ITEMS[k].badge):ITEM_ART[k]?(window.ASSET_BASE||'')+'items/'+k+'.webp':''; };
const getItemImg=k=>itemSrc(k)?loadImg('it:'+k,itemSrc(k)):{status:'fail'};
const itemTier=I=>I.comp||I.tool?'comp':I.emblem?'emb':'full';
const hexRGB=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(',');
const itemFxRGB=k=>ITEMS[k]&&ITEMS[k].radiant?'255,214,90':ITEM_FXC[k]||(ITEMS[k]?hexRGB(itemColor(ITEMS[k])):'200,215,245');
const itemColor=I=>I.tool?'#ff6a5f':I.emblem&&TRAITS[I.emblem]?TRAITS[I.emblem].color:I.comp?'#aab4c8':'#f4c04e';
function itemHTML(k,size){
 const I=ITEMS[k]; if(!I) return '';
 const art=itemSrc(k)&&getItemImg(k).status!=='fail';
 return `<span class="ii ${itemTier(I)}${I.radiant?' rad':''}${ITEM_FX.has(k)?' fx-'+artKey(k):''}" style="--ic:${itemColor(I)}${size?`;--is:${size}px`:''}${`;--fx:${itemFxRGB(k)}`}">${art?`<img src="${itemSrc(k)}" alt="${esc(I.name)}" data-fb="${esc(I.icon)}"${itemHQ(k)?` class="hq" data-alt="${itemAlt(k)}" decoding="async"`:''}>`:I.emblem&&TRAIT_SVG[I.emblem]?`<i class="isvg">${traitIcon(I.emblem)}</i>`:`<i>${I.icon}</i>`}</span>`;
}
const trainerOf=p=>p&&TRAINER_BY[p.tr]?p.tr:'';
function headHTML(p,size){ const t=typeof p==='string'?p:trainerOf(p); return t?`<span class="head em" style="--src:url('${TRAINER_SPRITE(t)}')${size?`;--hs:${size}px`:''}"></span>`:`<span class="head em">${esc(p&&p.emoji||'🧢')}</span>`; }
// Si una imagen de objeto no carga, se sustituye por su emoji
if(!HEADLESS) document.addEventListener('error',e=>{ const el=e.target; if(!el||el.tagName!=='IMG'||!el.dataset) return;
 if(el.dataset.hop){ delete el.dataset.hop; return; } // el manejador de la CDN acaba de reintentar desde nuestro servidor
 if(el.dataset.alt&&!el.dataset.fb5){ el.dataset.fb5=1; el.src=el.dataset.alt; el.classList.remove('hq'); return; }
 if(el.dataset.fb){ const i=document.createElement('i'); i.textContent=el.dataset.fb; el.replaceWith(i); } },true);
function initials(name){ return name.replace(/[^A-Za-zÁÉÍÓÚáéíóúñÑ]/g,'').slice(0,3); }
function spriteHTML(d,size,star=1){ return `<span class="spr" style="--s:${size}px" data-dex="${dexOf(d,star)}" data-name="${esc(nameOf(d,star))}" data-color="${typeColor(d)}"></span>`; }
// Los huecos .spr se rellenan con el retrato 3D del Pokémon
function hydrate(root){
 root.querySelectorAll('.spr:not([data-h])').forEach(el=>{ el.dataset.h=1; el.innerHTML=portraitImg(/^\d+$/.test(el.dataset.dex)?+el.dataset.dex:el.dataset.dex); el.firstChild.alt=el.dataset.name; });
}
// Quien tiene la pestaña abierta desde antes de un despliegue sigue con el código viejo hasta recargar: se le avisa una sola vez (en local no hay commit y no avisa)
let build0=null, buildWarned=false;
async function checkBuild(){ try{ const b=await (await fetch('/api/build',{cache:'no-store'})).json(); if(!b||!b.commit) return; if(!build0){ build0=b.commit; return; } if(b.commit!==build0&&!buildWarned){ buildWarned=true; toast('Hay una versión nueva del juego. Recarga con Ctrl+Shift+R cuando termines esta partida.'); } }catch(e){} }
function toast(msg){
 if(HEADLESS||(G&&G.auto)) return; const box=$('toast'); const d=document.createElement('div'); d.textContent=msg; box.appendChild(d);
 setTimeout(()=>d.remove(),2800); while(box.children.length>3) box.firstChild.remove();
}
const isDark=()=>S.theme==='dark'||(S.theme==='system'&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);
function readColors(){
 const cs=getComputedStyle(document.documentElement), g=n=>cs.getPropertyValue(n).trim();
 colors={bench:g('--bench'),ink:g('--ink'),panel:g('--panel'),panel2:g('--panel2'),muted:g('--muted'),good:g('--good'),bad:g('--bad'),blue:g('--blue'),red:g('--red'),line:g('--line')};
}
// Geometría del tablero: rejilla hexagonal 7×8, banquillo debajo y un lateral a cada lado para los entrenadores
function computeGeo(W){
 const pad=8, SIDE=W<420?1.1:1.5;
 const R=clamp((W-pad*2)/(7.5*Math.sqrt(3)+SIDE*2),15,44), side=R*SIDE, hw=Math.sqrt(3)*R, bw=hw*7.5, bh=R*2+7*1.5*R, bs=bw/9;
 return {pad,R,hw,bw,bh,bs,side,ox:pad+side,W:bw+(pad+side)*2,H:pad+bh+18+bs+pad+R*.25};
}
// Escritorio: el lienzo ocupa toda la pantalla (el campo se ve detrás de los paneles) y el tablero se encaja en el hueco central.
// Móvil y tablet: el lienzo mide lo mismo que el tablero, entre la barra superior y la tienda.
const fullField=()=>!HEADLESS&&((window.matchMedia&&matchMedia('(min-width:1101px)').matches)||(!$('menu').classList.contains('hidden')||!$('auth').classList.contains('hidden')));
let view={W:0,H:0,rect:null};
function layout(){
 const wrap=$('boardWrap'), hOf=el=>el?el.offsetHeight:0, full=fullField();
 // La banca de objetos va dentro, a la izquierda: se deja su hueco para que no tape el tablero
 const it=$('items'), side=it&&getComputedStyle(it).position==='absolute'?it.offsetWidth+8:0;
 document.body.style.setProperty('--shopH',hOf($('shopPanel'))+'px'); // los paneles laterales acaban encima de la tienda flotante
 let rect=null, availH, w;
 if(full){
   const c=document.querySelector('.center').getBoundingClientRect(), inf=document.querySelector('.boardInfo').getBoundingClientRect(), sh=$('shopPanel').getBoundingClientRect();
   rect={x:c.left+side,y:inf.bottom+4,w:Math.max(200,c.width-side),h:Math.max(200,sh.top-6-(inf.bottom+4))};
   availH=rect.h; w=Math.min(rect.w,1100);
 } else { availH=innerHeight-hOf(document.querySelector('.top'))-hOf($('shopPanel'))-hOf(document.querySelector('.boardInfo'))-36; w=Math.min((wrap.clientWidth||600)-side*2,760); }
 for(let i=0;i<3;i++){ const g=computeGeo(w); if(g.H<=availH) break; w*=availH/g.H; }
 const g=computeGeo(Math.max(280,w)), dpr=Math.min(window.devicePixelRatio||1,2);
 const V=full?{W:innerWidth,H:innerHeight,rect}:{W:g.W,H:g.H,rect:{x:0,y:0,w:g.W,h:g.H}};
 const key=[g.W,g.H,dpr,V.W,V.H,rect&&[rect.x,rect.y,rect.w,rect.h].map(Math.round)].join();
 if(key===layout.key) return; layout.key=key; // sin cambios: no rehace el tablero 3D
 geo=g; view=V; layout.dpr=dpr; document.body.classList.toggle('fullField',full);
 cv.width=view.W*dpr; cv.height=view.H*dpr; cv.style.width=view.W+'px'; cv.style.height=view.H+'px';
 ctx.setTransform(dpr,0,0,dpr,0,0); readColors(); sizeB3();
}
const cellXY=(c,r)=>[geo.ox+geo.hw*(c+.5*(r&1))+geo.hw/2, geo.pad+geo.R+r*1.5*geo.R];
const vXY=(c,r)=>G&&curFlip()?cellXY(6-c,7-r):cellXY(c,r);
// Combate que se está mostrando: el tuyo o el de otro entrenador que estés mirando
const viewCombat=()=>G&&G.view&&G.view.cb?G.view.cb:G&&G.combat;
const curFlip=()=>G.view&&G.view.cb?G.view.flip:!!G.flip;
// Tablero que se está mirando fuera del combate (el tuyo o el de otro entrenador)
const viewedPlayer=()=>G.view&&G.view.board&&G.players.find(p=>p.id===G.view.pid)||G.me;
const viewOwner=()=>G.view&&G.players.find(p=>p.id===G.view.pid)||G.me;
function fightsList(){
 if(G.mirror) return G.allFights||[];
 return (G.fights||[]).map(f=>({seed:f.seed,a:f.sa,b:f.sb,ia:f.a.id,ib:f.b?f.b.id:-1,pve:f.pve?1:0,ghost:f.ghost?1:0}));
}
// Transición de «vuelo» entre islas al cambiar de tablero
function warp(){ const el=$('boardStack'); if(!el) return; el.classList.remove('warp'); void el.offsetWidth; el.classList.add('warp'); }
const ISLE_THEME={charmander:'fire',bulbasaur:'grass',squirtle:'water'};
// Minimapa 3×3 (como el de TFT): los 8 jugadores rodean el centro; en combate, el visitante aparece sobre el campo que visita
const ISLE_SLOT=[0,1,2,5,8,7,6,3];
function renderIslands(){
 let box=$('islands'); if(!box){ box=document.createElement('div'); box.id='islands'; box.className='islands'; box.setAttribute('aria-label','Mapa de campos'); $('boardWrap').appendChild(box);
   box.addEventListener('click',e=>{ const b=e.target.closest('[data-pid]'); if(b){ e.stopPropagation(); spectate(+b.dataset.pid); } });
   // El minimapa solo se pulsa: nada de arrastrar (ni la imagen, ni el clic derecho) ni de mover la minileyenda desde aquí
   for(const t of ['dragstart','contextmenu','selectstart']) box.addEventListener(t,e=>e.preventDefault());
   for(const t of ['pointerdown','pointermove','mousedown']) box.addEventListener(t,e=>{ e.stopPropagation(); if(e.button>0||e.buttons>1) e.preventDefault(); }); }
 // Solo durante la partida: al terminar o al volver al menú desaparece
 box.hidden=!!G.over||!$('menu').classList.contains('hidden'); if(box.hidden) return;
 const ps=G.players, cur=viewOwner(), combat=G.phase==='combat', fl=combat?fightsList():[], guest={};
 for(const f of fl){ if(f.ib>=0&&!f.ghost&&!f.pve) guest[f.ia]=f.ib; } // quien visita el campo de f.ia
 const key=ps.map(p=>p.id+':'+(p.alive?1:0)+':'+(p.tac||'')+':'+(guest[p.id]!=null?guest[p.id]:'')).join()+'|'+cur.id+'|'+G.phase+'|'+G.me.id;
 if(box.dataset.k===key) return; box.dataset.k=key;
 const cells=Array(9).fill('');
 ps.forEach((p,i)=>{ const g=guest[p.id]!=null?ps.find(x=>x.id===guest[p.id]):null;
   cells[ISLE_SLOT[i%8]]=`<button class="isleCell ${p===G.me?'me':''} ${p===cur?'cur':''} ${p.alive?'':'dead'}" data-pid="${p.id}" title="${esc(p.name)} · ${p.alive?R0(p.hp)+' de vida':'eliminado'}"><span class="mini">${artImg(tacKey(p))}</span>${g?`<span class="vis" data-pid="${g.id}" title="${esc(g.name)}">${artImg(tacKey(g))}</span>`:''}</button>`; });
 cells[4]='<span class="isleCenter"><i data-i="ball" data-s="28"></i></span>';
 box.innerHTML=cells.join(''); if(window.PX) PX.hydrate(box);
}
function spectate(pid){
 if(!G||!G.players.length) return;
 const me=G.me, back=()=>{ if(G.view) warp(); G.view=null; selCombat=null; renderUI(); };
 if(pid===me.id) return back();
 if(G.phase==='carousel'){ toast('En el carrusel no se pueden mirar tableros'); return; }
 if(G.phase!=='combat'){ const p=G.players.find(x=>x.id===pid); if(!p||!p.alive) return; if(!G.view||G.view.pid!==pid) warp(); G.view={board:true,pid}; selected=null; selCombat=null; renderUI(); return; }
 const list=fightsList(), f=list.find(x=>x.ia===pid)||list.find(x=>x.ib===pid&&!x.ghost);
 if(!f){ toast('Ese entrenador no está combatiendo'); return; }
 if((f.ia===me.id||(f.ib===me.id&&!f.ghost))) return back(); // es tu propio combate
 const side=f.ia===pid?0:1, R=G.mirror?(G.allR||G.round):G.round;
 // Lo adelanta hasta el mismo segundo que tu combate (con los objetos que se hayan puesto): como es determinista, se ve igual que en el servidor
 const target=G.combat?G.combat.t:0, cb=rebuildCombat(f.a,f.b,R,f.seed,(G.fightEv||{})[f.seed],target);
 const oid=side===0?f.ib:f.ia, opp=G.players.find(p=>p.id===oid);
 if(!G.view||G.view.pid!==pid) warp();
 G.view={cb,flip:side===1,pid,opp:f.pve?null:opp||null,pve:!!f.pve,ghost:!!f.ghost,acc:0,seed:f.seed,data:{a:f.a,b:f.b,R,seed:f.seed}};
 selCombat=null; renderUI();
}
const benchXY=i=>[geo.ox+geo.bs*i+geo.bs/2, geo.pad+geo.bh+18+geo.bs/2];
// Al dibujar se suma la parte del paso de simulación ya transcurrida (drawSub) y se suaviza el inicio y el final: el movimiento no va a saltos de 0,05 s
let drawSub=0;
function unitXY(u){ const [x1,y1]=vXY(u.pc,u.pr), [x2,y2]=vXY(u.c,u.r), q=clamp((u.mt+(u.mt<.3?drawSub:0))/.3,0,1), k=q*q*(3-2*q); return [x1+(x2-x1)*k,y1+(y2-y1)*k]; }
// Devuelve el punto del suelo (píxeles de tablero) bajo el puntero y guarda su posición en pantalla
function canvasPos(e){ const b=cv.getBoundingClientRect(); ptr=[(e.clientX-b.left)*(view.W/b.width),(e.clientY-b.top)*(view.H/b.height)]; return b3On()?B3.unproject(ptr[0],ptr[1]):ptr.slice(); }
function hitCell(x,y){ let best=null,bd=1e9; for(let r=0;r<8;r++) for(let c=0;c<7;c++){ const [cx,cy]=cellXY(c,r); const d=Math.hypot(x-cx,y-cy); if(d<bd){bd=d;best=[c,r];} } return bd<geo.R*.95?best:null; }
function hitBench(x,y){ const top=geo.pad+geo.bh+18; if(y<top||y>top+geo.bs) return -1; const i=Math.floor((x-geo.ox)/geo.bs); return i>=0&&i<BENCH?i:-1; }
function unitAt(x,y){
 if(G.view&&G.view.board) return null; // el tablero de otro solo se mira
 const pk=pickActor(a=>a.loc&&(a.loc.i!=null||(G.phase!=='combat'&&G.phase!=='carousel'))); if(pk) return {u:pk.u,loc:pk.loc};
 const me=G.me; const b=hitBench(x,y); if(b>=0&&me.bench[b]) return {u:me.bench[b],loc:{i:b}};
 if(G.phase!=='combat'&&G.phase!=='carousel'){ const cell=hitCell(x,y); if(cell&&cell[1]>=4){ const k=cell[0]+','+(cell[1]-4); if(me.board[k]) return {u:me.board[k],loc:{b:k}}; } }
 return null;
}
function combatUnitAt(x,y){ const cb=viewCombat(); if(!cb) return null; const pk=pickActor(a=>a.cu&&!a.cu.dead); if(pk) return pk.cu; let best=null,bd=geo.R*.9; for(const u of cb.units){ if(u.dead) continue; const [ux,uy]=unitXY(u); const d=Math.hypot(x-ux,y-uy+geo.R*.1); if(d<bd){bd=d;best=u;} } return best; }
function overShop(e){ const r=$('shopPanel').getBoundingClientRect(); return e.clientY>=r.top&&e.clientY<=r.bottom&&e.clientX>=r.left&&e.clientX<=r.right; }
function inGame(){ return G&&G.players&&G.players.length&&!G.over&&G.me.alive; }
const modalOpen=()=>!$('modal').classList.contains('hidden');

/* ---------- fondos ---------- */
/* ---------- arte pixel (estilo GBA, 3.ª generación) ---------- */
// Las arenas y el menú se pintan a baja resolución con una paleta corta y se amplían sin suavizado.
function rng(seed){ let s=seed; return ()=>{ s=(s*16807)%2147483647; return (s-1)/2147483646; }; }
function rrPath(g,x,y,w,h,rad){ g.beginPath(); if(g.roundRect) g.roundRect(x,y,w,h,rad); else g.rect(x,y,w,h); }
const PAL={
 g0:'#205018',g1:'#387820',g2:'#58a838',g3:'#78c850',g4:'#98d860',g5:'#b8f080',
 t0:'#103810',t1:'#286828',t2:'#409840',t3:'#60b858',t4:'#90d870',
 w0:'#603818',w1:'#805028',w2:'#a87040',w3:'#c89058',
 d0:'#a07840',d1:'#c8a060',d2:'#e0c088',d3:'#f0d8a8',
 s0:'#4890e0',s1:'#78c8f8',s2:'#a0dcf8',s3:'#c8ecf8',
 a0:'#2860c8',a1:'#3890f8',a2:'#68b8f8',a3:'#a8e0f8',
 white:'#f8f8f8',ink:'#283040',
};
function pixelPainter(w,h,seed){
 const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d');
 const P={c,g,w,h,r:rng(seed),
  rect(x,y,ww,hh,col){ g.fillStyle=col; g.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(ww)),Math.max(1,Math.round(hh))); },
  px(x,y,col){ g.fillStyle=col; g.fillRect(Math.round(x),Math.round(y),1,1); },
  // Relleno fila a fila: f(dy) da la mitad del ancho de esa fila (así no hay antialiasing)
  rows(cx,cy,ry,f,col){ g.fillStyle=col; const y0=Math.round(cy); for(let y=-Math.floor(ry);y<=Math.floor(ry);y++){ const hw=f(y); if(hw<0) continue; const x0=Math.round(cx-hw), x1=Math.round(cx+hw); if(x1>=x0) g.fillRect(x0,y0+y,x1-x0+1,1); } },
  ell(cx,cy,rx,ry,col){ P.rows(cx,cy,ry,y=>rx*Math.sqrt(Math.max(0,1-(y*y)/((ry+.5)*(ry+.5))))-.35,col); },
  disc(cx,cy,rad,col){ P.ell(cx,cy,rad,rad,col); },
  hexHW(rad,y){ const a=Math.abs(y); return a<=rad/2?Math.sqrt(3)/2*rad:Math.sqrt(3)*(rad-a); },
  hex(cx,cy,rad,col){ P.rows(cx,cy,rad,y=>P.hexHW(rad,y)-.5,col); },
  // Borde de 1 píxel de un hexágono
  hexRing(cx,cy,rad,col){
   g.fillStyle=col; const y0=Math.round(cy);
   for(let y=-Math.floor(rad);y<=Math.floor(rad);y++){
     const o=P.hexHW(rad,y)-.5, i=Math.abs(y)>=Math.floor(rad)-1?-1:P.hexHW(rad-1.2,y)-.5;
     const xo0=Math.round(cx-o), xo1=Math.round(cx+o);
     if(i<0){ g.fillRect(xo0,y0+y,xo1-xo0+1,1); continue; }
     const xi0=Math.round(cx-i), xi1=Math.round(cx+i);
     g.fillRect(xo0,y0+y,Math.max(1,xi0-xo0),1); g.fillRect(xi1+1,y0+y,Math.max(1,xo1-xi1),1);
   }
  },
  // Rectángulo con esquinas redondeadas en escalera
  rrect(x,y,ww,hh,rad,col){ g.fillStyle=col; x=Math.round(x); y=Math.round(y); ww=Math.round(ww); hh=Math.round(hh);
   for(let j=0;j<hh;j++){ const dy=j<rad?rad-j-.5:j>=hh-rad?j-(hh-rad)+.5:0; const ins=dy?Math.round(rad-Math.sqrt(Math.max(0,rad*rad-dy*dy))):0; g.fillRect(x+ins,y+j,ww-ins*2,1); } },
  // Mata de hierba de 3 píxeles
  tuft(x,y,dark,light){ P.px(x,y,dark); P.px(x+2,y,dark); P.px(x+1,y-1,dark); P.px(x-1,y-1,light); P.px(x+3,y-1,light); },
  // Copa de árbol con sombreado en 4 tonos
  crown(x,y,rad){ P.disc(x+1,y+2,rad+1,PAL.t0); P.disc(x,y,rad+1,PAL.t0); P.disc(x,y,rad,PAL.t1); P.disc(x-rad*.25,y-rad*.25,rad*.72,PAL.t2); P.disc(x-rad*.4,y-rad*.42,rad*.38,PAL.t3);
   for(let k=0;k<3;k++) P.px(x-rad*.5+P.r()*rad*.6,y-rad*.6+P.r()*rad*.5,PAL.t4); },
  tree(x,y,rad){ P.ell(x+1,y+rad*1.25,rad*.9,rad*.3,'rgba(0,0,0,.25)'); P.rect(x-1,y+rad*.4,3,rad*.9,PAL.w0); P.rect(x-1,y+rad*.4,1,rad*.9,PAL.w1); P.crown(x,y,rad); },
  bushPx(x,y,rad,flower){ P.ell(x,y+rad*.6,rad*1.2,rad*.35,'rgba(0,0,0,.22)'); P.disc(x-rad*.5,y,rad*.7,PAL.t0); P.disc(x+rad*.5,y,rad*.7,PAL.t0); P.disc(x,y-rad*.3,rad*.8,PAL.t0);
   P.disc(x-rad*.5,y,rad*.6,PAL.t2); P.disc(x+rad*.5,y,rad*.6,PAL.t2); P.disc(x,y-rad*.3,rad*.7,PAL.t2); P.disc(x-rad*.2,y-rad*.5,rad*.35,PAL.t3);
   if(flower) for(let k=0;k<3;k++){ const fx=x-rad*.6+k*rad*.6, fy=y-rad*.2-(k%2)*rad*.4; P.px(fx,fy,flower); P.px(fx+1,fy,flower); P.px(fx,fy+1,flower); P.px(fx+1,fy+1,PAL.white); } },
  // Flor de 3×3 como las de las rutas de Hoenn
  flower(x,y,col){ P.px(x,y-1,col); P.px(x-1,y,col); P.px(x+1,y,col); P.px(x,y+1,col); P.px(x,y,'#f8e070'); },
  // Hierba alta (los parches donde salen Pokémon salvajes)
  tallGrass(x,y,ww,hh){ for(let j=0;j<hh;j+=4) for(let i=(j/4)%2*2;i<ww;i+=4){ const bx=x+i, by=y+j+3; P.px(bx,by,PAL.g1); P.px(bx+1,by-1,PAL.g1); P.px(bx+2,by,PAL.g1); P.px(bx+1,by-2,PAL.g4); P.px(bx,by-1,PAL.g3); P.px(bx+2,by-1,PAL.g3); } },
  lampPx(x,y){ P.ell(x,y,3,1,'rgba(0,0,0,.3)'); P.rect(x-1,y-11,2,11,'#384058'); P.rect(x-1,y-11,1,11,'#506080'); P.rect(x-2,y-14,4,3,'#384058'); P.rect(x-1,y-13,2,2,'#f8e890'); },
  flag(x,y,col){ P.rect(x,y-10,1,10,'#585868'); P.rect(x+1,y-10,4,1,col); P.rect(x+1,y-9,3,1,col); P.rect(x+1,y-8,2,1,col); P.rect(x+1,y-7,1,1,col); },
 };
 return P;
}

/* ---------- entrenadores (estrategas) ---------- */
let trEmote=null;
// Saludos de otros jugadores: cuando sube su contador (pub.pl[i][18]) se ve su frase 1,8 s
const greetSeen=new Map();
function otherGreet(p){ const n=p.gn|0, g=greetSeen.get(p.id); if(!g){ greetSeen.set(p.id,{n,t:0}); return ''; } if(n!==g.n){ g.n=n; g.t=performance.now(); } return performance.now()-g.t<1800?greetText(p,n):''; }
// (x,y) en el suelo del tablero; se proyecta a pantalla y devuelve [x,y,tamaño] en pantalla
function drawTrainer(x0,y0,key,o={}){
 const R=geo.R, [x,y,s]=trScreen(x0,y0,o.s||R*2), t=performance.now()/1000+(o.seed||0);
 let lift=0, sq=1;
 if(o.mode==='run'){ lift=Math.abs(Math.sin(t*11))*s*.07; }
 else if(o.mode==='cheer'){ lift=Math.abs(Math.sin(t*6))*s*.16; sq=1+Math.sin(t*12)*.03; }
 else if(o.mode==='sad'){ lift=0; sq=.97; }
 else { lift=(Math.sin(t*2.4)*.5+.5)*s*.035; sq=1+Math.sin(t*2.4)*.012; }
 ctx.save();
 // peana
 const pr=s*.34, ring=o.ring||'#4c8dff';
 if(!o.noSprite){ ctx.fillStyle='rgba(0,0,0,.32)'; ctx.beginPath(); ctx.ellipse(x,y+s*.03,pr*1.1,pr*.36,0,0,7); ctx.fill();
 const pg=ctx.createRadialGradient(x,y,0,x,y,pr); pg.addColorStop(0,ring); pg.addColorStop(1,'rgba(0,0,0,0)');
 ctx.globalAlpha=o.dim?.4:.85; ctx.fillStyle=pg; ctx.beginPath(); ctx.ellipse(x,y,pr,pr*.33,0,0,7); ctx.fill();
 ctx.strokeStyle=ring; ctx.lineWidth=2; ctx.beginPath(); ctx.ellipse(x,y,pr,pr*.33,0,0,7); ctx.stroke(); }
 ctx.globalAlpha=o.dim?.55:1;
 const e=key&&!o.noSprite?getTrImg(key):{status:'none'};
 if(o.noSprite){} else if(e.status==='ok'){
   ctx.imageSmoothingEnabled=false; ctx.translate(x,y-lift); ctx.scale((o.face||1)*(2-sq),sq);
   ctx.drawImage(e.img,-s/2,-s*.96,s,s);
 } else {
   ctx.fillStyle='#2b3a70'; ctx.beginPath(); ctx.arc(x,y-s*.35-lift,s*.26,0,7); ctx.fill(); ctx.strokeStyle=ring; ctx.lineWidth=2; ctx.stroke();
   ctx.font=`${s*.28}px system-ui`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(o.emoji||'🧢',x,y-s*.35-lift);
 }
 ctx.restore();
 if(o.label){
   ctx.save(); ctx.font=`900 ${Math.max(9,R*.27)}px Nunito,system-ui,sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
   const w=ctx.measureText(o.label).width+R*.4, h=R*.38, ly=y+s*.2, lx=clamp(x,w/2+2,view.W-w/2-2);
   ctx.globalAlpha=o.dim?.6:1; ctx.fillStyle='rgba(8,12,30,.78)'; rrPath(ctx,lx-w/2,ly-h/2,w,h,h/2); ctx.fill(); ctx.strokeStyle=ring; ctx.lineWidth=1.5; ctx.stroke();
   ctx.fillStyle='#fff'; ctx.fillText(o.label,lx,ly+.5);
   // Vida del estratega debajo del nombre
   if(o.hp!==undefined){ const bw=Math.max(w,R*1.5), bx=clamp(x,bw/2+2,view.W-bw/2-2)-bw/2, by2=ly+h/2+2, bh=Math.max(5,R*.16), f=clamp(o.hp/100,0,1);
     ctx.fillStyle='rgba(8,12,30,.85)'; rrPath(ctx,bx-1.5,by2-1.5,bw+3,bh+3,3); ctx.fill();
     ctx.fillStyle=f>.5?'#3fd27a':f>.25?'#f4c04e':'#ff5a5f'; rrPath(ctx,bx,by2,Math.max(0,bw*f),bh,2); ctx.fill();
     ctx.font=`900 ${Math.max(8,bh*1.05)}px Nunito,system-ui,sans-serif`; ctx.fillStyle='#fff'; ctx.strokeStyle='rgba(0,0,0,.7)'; ctx.lineWidth=2.5; const tx=bx+bw/2, ty=by2+bh/2+.5; ctx.strokeText(Math.max(0,R0(o.hp)),tx,ty); ctx.fillText(Math.max(0,R0(o.hp)),tx,ty); }
   ctx.restore();
 }
 if(o.bubble){
   ctx.save(); ctx.font=`900 ${Math.max(11,R*.36)}px Nunito,system-ui,sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
   const w=ctx.measureText(o.bubble).width+R*.5, h=R*.55, by=y-s*.98-lift;
   ctx.fillStyle='#fff'; rrPath(ctx,x-w/2,by-h,w,h,R*.2); ctx.fill(); ctx.beginPath(); ctx.moveTo(x-R*.12,by-1); ctx.lineTo(x,by+R*.15); ctx.lineTo(x+R*.12,by-1); ctx.fill();
   ctx.fillStyle='#16203d'; ctx.fillText(o.bubble,x,by-h/2); ctx.restore();
 }
 return [x,y,s];
}
// Dónde está cada entrenador en el tablero: el tuyo abajo a la izquierda y el rival arriba a la derecha
function trainerSpots(){
 const R=geo.R, s=Math.min(R*2.2,geo.side*2);
 // Junto al borde del tablero: así se ven aunque los paneles tapen los laterales
 return {s, me:[geo.ox+geo.bw+R*.55,cellXY(0,7)[1]+R*.2], opp:[geo.ox+geo.bw+R*.55,cellXY(0,0)[1]+R*.2]}; // a la izquierda quedan el tótem y los cristales de intereses
}
// Encima de cada minileyenda: nombre, y debajo su nivel y una barra con la vida que le queda
function drawTacLabel(x,y,p,col,bub){
 const R=geo.R, [sx,sy]=scr(x,y,1.75), nm=p.name.length>14?p.name.slice(0,13)+'…':p.name;
 ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle';
 ctx.font=`900 ${Math.max(11,R*.32)}px Nunito,system-ui,sans-serif`; ctx.lineWidth=4; ctx.lineJoin='round'; ctx.strokeStyle='rgba(0,0,0,.75)'; ctx.fillStyle='#fff'; ctx.strokeText(nm,sx,sy-R*.46); ctx.fillText(nm,sx,sy-R*.46);
 const bw=R*1.75, bh=Math.max(8,R*.26), rad=bh/2, br=bh*.95, x0=sx-bw/2+br*.6, f=clamp(p.hp/100,0,1);
 // cápsula de la vida
 ctx.shadowColor='rgba(0,0,0,.55)'; ctx.shadowBlur=6; ctx.fillStyle='rgba(10,12,24,.9)'; rrPath(ctx,x0-2,sy-rad-2,bw+4,bh+4,rad+2); ctx.fill(); ctx.shadowBlur=0;
 if(f>0){ const g=ctx.createLinearGradient(0,sy-rad,0,sy+rad); g.addColorStop(0,col==='#ff9a2e'?'#ffd36b':'#ffe9a0'); g.addColorStop(1,col); ctx.fillStyle=g; rrPath(ctx,x0,sy-rad,Math.max(bh,bw*f),bh,rad); ctx.fill();
   ctx.fillStyle='rgba(255,255,255,.35)'; rrPath(ctx,x0+2,sy-rad+1,Math.max(0,bw*f-4),bh*.34,rad); ctx.fill(); }
 ctx.font=`900 ${Math.max(8,bh*.85)}px Nunito,system-ui,sans-serif`; ctx.lineWidth=3; ctx.strokeStyle='rgba(0,0,0,.6)'; ctx.fillStyle='#fff'; const ht=Math.max(0,R0(p.hp)); ctx.strokeText(ht,x0+bw/2,sy+.5); ctx.fillText(ht,x0+bw/2,sy+.5);
 // nivel en una insignia redonda con aro dorado
 const lx=x0-br*.35; ctx.beginPath(); ctx.arc(lx,sy,br,0,7); const lg=ctx.createRadialGradient(lx-br*.3,sy-br*.3,1,lx,sy,br); lg.addColorStop(0,'#3a4a7a'); lg.addColorStop(1,'#141a30'); ctx.fillStyle=lg; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='#ffd75e'; ctx.stroke();
 ctx.fillStyle='#fff'; ctx.font=`900 ${Math.max(9,br*1.05)}px Nunito,system-ui,sans-serif`; ctx.fillText(p.level,lx,sy+.5);
 if(bub){ ctx.font=`900 ${Math.max(16,R*.6)}px system-ui`; const w=R*1.1, by=sy-R*1.05; ctx.fillStyle='#fff'; rrPath(ctx,sx-w/2,by-R*.85,w,R*.8,R*.3); ctx.fill(); ctx.beginPath(); ctx.moveTo(sx-R*.12,by-.05*R); ctx.lineTo(sx,by+R*.15); ctx.lineTo(sx+R*.12,by-.05*R); ctx.fill(); ctx.fillStyle='#16203d'; ctx.fillText(bub,sx,by-R*.45); }
 ctx.restore(); return [sx,sy+R*1.2,R*2.4];
}
// Iconos de los aumentos sobre el tótem (con su descripción al pasar el cursor)
let hudAugs=[];
// Pokémon en el tablero / máximo: se pinta en el suelo del 3D (board3d.js, floorCount) con la misma inclinación que el tablero.
// Llamativo mientras quede hueco; apagado cuando el tablero está lleno
function floorCountSpec(){
 const me=G.me; if(G.phase!=='planning'||!me||!me.alive||viewedPlayer()!==me) return null;
 const n=boardUnits(me).length, max=maxBoard(me), [ax,ay]=cellXY(3,1), [bx,by]=cellXY(3,2);
 return {txt:n+'/'+max,full:n===max,over:n>max,x:(ax+bx)/2,y:(ay+by)/2}; // over: más fichas que el máximo (en rojo: hay que sacar una o se venderá sola)
}
// Aumentos sobre el trofeo: cada uno en un recuadro negro con marco negro (como los objetos sobre un Pokémon) y solo su icono de carta:
// la silueta del color de su rareza (augSil; mientras se calcula, nada dentro del recuadro)
const AUG_SIL_IMG={};
function augSilImg(a){ let v=AUG_SIL_IMG[a.id]; if(!v){ v=AUG_SIL_IMG[a.id]={img:null}; augSil(a).then(u=>{ if(!u) return; const im=new Image(); im.onload=()=>{ v.img=im; }; im.src=u; }); } return v.img; }
function drawTotemIcons(){
 hudAugs=[]; const tt=B3.totemTop&&B3.totemTop(); if(!tt) return;
 const list=(viewOwner().augments||[]).map(id=>AUG_BY[id]).filter(Boolean); if(!list.length) return; // sin aumentos no hay recuadros: el trofeo se ve solo hasta elegir el primero
 const R=geo.R, sz=Math.max(28,R*1.0), bw=Math.max(2,sz*.1), gap=bw*2+3, w=list.length*(sz+gap)-3, x0=tt[0]-w/2, cy=tt[1]-sz/2-bw-4;
 ctx.save();
 list.forEach((a,i)=>{ const cx=x0+i*(sz+gap)+sz/2+bw; ctx.fillStyle='#000'; ctx.fillRect(cx-sz/2-bw,cy-sz/2-bw,sz+2*bw,sz+2*bw); ctx.fillStyle='#04090c'; ctx.fillRect(cx-sz/2,cy-sz/2,sz,sz);
   const im=augSilImg(a); if(im){ const k=Math.min(sz*.86/im.width,sz*.86/im.height), iw=im.width*k, ih=im.height*k; ctx.imageSmoothingEnabled=true; ctx.drawImage(im,cx-iw/2,cy-ih/2,iw,ih); }
   hudAugs.push({id:a.id,x:cx,y:cy,s:sz}); });
 ctx.restore();
}
function drawBoardTrainers(){
 const me=G.me; if(!me||!G.players.length) return;
 const bub=trEmote&&performance.now()-trEmote.t0<1800?trEmote.txt:'';
 // La tuya, la del dueño del tablero que miras, la de su rival y las de quien esté de visita (stepOthers)
 myTrBox=drawTacLabel(TAC.x,TAC.y,me,'#ff9a2e',bub);
 for(const o of tacOthers) drawTacLabel(o.x,o.y,o.p,o.col==='#7fc8ff'?'#4c8dff':o.col,otherGreet(o.p));
}
// Burla de la minileyenda de Charmander (H): hace su animación de habilidad (también Charmeleon y Charizard) y lanza una bola de fuego al campo rival
function tacFire(){
 const me=G&&G.me; if(!me||!me.alive||!window.B3||tacKey(me)!=='charmander'||G.phase==='carousel'||modalOpen()) return;
 const now=performance.now(); if(now-(TAC.fireT||0)<1500) return; TAC.fireT=now; TAC.castN=(TAC.castN||0)+1; trEmote={t0:now,txt:'🔥'};
 const [tx,ty]=cellXY(3,1); TAC.fx=tx; TAC.fy=ty;
 setTimeout(()=>{ if(G&&G.me===me&&B3.fireball) B3.fireball(TAC.x,TAC.y-geo.R*.2,tx,ty,0,(cosD(me,'fb')||{}).c); },170);
 if(NET.mode==='client') doAct({t:'taunt'}); // los demás la ven en su pantalla (stepOthers)
}
// Saludo (T): sin juego de saludos, el 👍 de siempre; con él, sus 3 frases por turnos. Los demás lo ven (act greet → pub, como la burla)
function greetText(p,n){ const d=cosD(p,'gr'); return d?d.lines[(n|0)%d.lines.length]:'👍'; }
function greet(){ const me=G&&G.me; if(!me||!me.alive||modalOpen()) return; const now=performance.now(); if(now-(TAC.grT||0)<1500) return; TAC.grT=now;
 TAC.grN=(TAC.grN||0)+1; trEmote={t0:now,txt:greetText(me,TAC.grN)}; if(NET.mode==='client') doAct({t:'greet'}); }
// Teclas 1-3 con la minileyenda Eevee desde el nivel 6: cambia su forma al momento y avisa a los demás
function mewForm(n){ const me=G&&G.me; if(!me||!me.alive||!tacOf(me).mimic||n>2) return; if(n===2&&!me.mewF) return;
 if(n===1&&!(me.mewK||(me.mewSk||[]).length)){ toast('Gana un combate para copiar la minileyenda de tu rival'); return; } doAct({t:'mform',k:n}); }
function eeveeForm(n){ const me=G&&G.me; if(!me||!me.alive||me.tac!=='eevee'||tacStage(me)<1||!EEVEE_KEYS[n-1]) return; if(me.tacForm&&me.tacForm[0]===EEVEE_KEYS[n-1]) return;
 doAct({t:'tform',k:n}); }
const EMOTES=['¡Vamos!','😤','👍','¡Allá voy!','😎','GG','🔥','¿Eso es todo?'];
function hitMyTrainer(){ if(!G||!G.players.length||G.phase==='carousel'||!myTrBox) return false; const [x,y]=ptr, [tx,ty,s]=myTrBox; return Math.abs(x-tx)<s*.4&&y<ty+s*.1&&y>ty-s*.95; }

/* ---------- carrusel ---------- */
// CAR_K agranda el carrusel sin agrandar las fichas (la cámara se aleja para encuadrarlo): más sitio para caminar entre los Pokémon
const CAR_K=1.4;
function carGeo(){ const cx=geo.W/2, cy=geo.pad+geo.bh/2, rr=Math.min(geo.W*.42,geo.bh*.42)*CAR_K; return {cx,cy,rr}; }
// Vista girada para que tu puesto quede siempre abajo (solo dibujo y ratón: la simulación y la red no giran). inv: de pantalla a simulación
function carTheta(){ const C=G.carousel, i=C?C.order.indexOf(G.me):-1; return i<0?0:Math.PI/2-carAng(i,C.order.length); }
function carV(x,y,inv){ const {cx,cy}=carGeo(), t=inv?-carTheta():carTheta(), c=Math.cos(t), s=Math.sin(t), dx=x-cx, dy=y-cy; return [cx+dx*c-dy*s,cy+dx*s+dy*c]; }
// Los Pokémon giran con la rotación de la simulación más lo que ha pasado desde su último paso (60 fps suaves aunque el paso sea de 33 ms o llegue cada 160 ms por red)
// En multijugador la rotación del cliente nunca se para ni retrocede entre mensajes: con los retrasos de red se detenía y arrancaba, y la animación de correr se reiniciaba
let carRotV=null;
function carRot(C){ // en el servidor (HEADLESS) no hay performance ni tickAt: solo C.rot
 if(!C.mirror) return C.rot+(C.tickAt?.2*clamp((performance.now()-C.tickAt)/1000,0,.3):0);
 const now=performance.now(), tgt=C.rot+.2*Math.min(1.5,(now-C.rotAt)/1000), v=carRotV;
 if(!v||Math.abs(tgt-v.r)>.6){ carRotV={r:tgt,t:now}; return tgt; } // carrusel nuevo o salto grande: se coloca sin más
 const dt=(now-v.t)/1000; if(dt>0){ let r=v.r+.2*dt; r+=(tgt-r)*Math.min(1,dt*1.5); v.r=Math.max(v.r,r); v.t=now; } return v.r; }
function optPos(C,i){ const {cx,cy,rr}=carGeo(); const a=i*Math.PI*2/C.opts.length+carRot(C); return [cx+Math.cos(a)*rr*.55, cy+Math.sin(a)*rr*.55]; }
function updateCarousel(dt){
 const C=G.carousel; if(!C||C.finished||C.mirror) return;
 C.t+=dt; C.rot+=.2*dt; if(!HEADLESS) C.tickAt=performance.now(); // despacio: da tiempo a correr hasta el Pokémon que quieres
 const {cx,cy,rr}=carGeo(), sp=geo.R*5;
 const toward=(a,tx,ty)=>{ const dx=tx-a.x, dy=ty-a.y, d=Math.hypot(dx,dy); if(d>1){ const st=Math.min(d,sp*dt); a.x+=dx/d*st; a.y+=dy/d*st; } return d; };
 C.order.forEach((p,idx)=>{
   const a=C.av[p.id]; if(!a) return;
   // Empiezan en el borde, cada uno dentro de su campo de fuerza
   if(a.x===null){ a.x=cx+Math.cos(a.ang)*rr*1.12; a.y=cy+Math.sin(a.ang)*rr*1.12; }
   if(a.done){ if(isHuman(p)&&!p.away){ if(a.tx!=null) toward(a,a.tx,a.ty); } else toward(a,cx+Math.cos(a.ang)*rr*1.12,cy+Math.sin(a.ang)*rr*1.12); return; }
   if(C.t<releaseAt(idx)) return;
   if(p.away){ a.rel=true; return; } // desconectado: no camina; al final se le da uno de los que sobran (más abajo)
   if(!a.rel){ a.rel=true; a.relT=C.t; if(p===G.me) toast('¡Se abre tu barrera! Muévete con clic derecho hasta un Pokémon'); else if(p.remote) note(p,'¡Te toca en el carrusel! Muévete con clic derecho',true); }
   // Los bots (y las personas que no se mueven en 10 s) van a por un Pokémon; las personas van a donde hacen clic derecho
   if(a.target!=null&&C.opts[a.target].taken) a.target=null;
   if(a.tx==null&&a.target==null&&(!isHuman(p)?C.t-a.relT>a.delay:C.t-a.relT>10)) a.target=carouselChoice(p);
   if(a.target!=null){ const [ox,oy]=optPos(C,a.target); toward(a,ox,oy); } else if(a.tx!=null) toward(a,a.tx,a.ty);
   // Se lleva el Pokémon que toque al pasar por encima
   for(let i=0;i<C.opts.length;i++){ const o=C.opts[i]; if(o.taken) continue; const [ox,oy]=optPos(C,i); if(Math.hypot(ox-a.x,oy-a.y)<geo.R*.6&&takeCarousel(p,i)){ a.done=true; a.target=null; a.carry=o; a.ang=Math.atan2(a.y-cy,a.x-cx); renderUI(); break; } }
 });
 // Cuando todos los presentes han elegido, a quien está desconectado se le da uno de los Pokémon que sobran (con su objeto)
 const pend=C.order.filter(p=>p.away&&C.av[p.id]&&!C.av[p.id].done);
 if(pend.length&&C.order.every(p=>p.away||(C.av[p.id]&&C.av[p.id].done))){ for(const p of pend){ const a=C.av[p.id], i=carouselChoice(p); if(i!=null&&takeCarousel(p,i)){ a.carry=C.opts[i]; a.ang=Math.atan2(a.y-cy,a.x-cx); } a.done=true; a.rel=true; } renderUI(); }
 if(C.order.every(p=>C.av[p.id]&&C.av[p.id].done)||C.opts.every(o=>o.taken)){ if(!C.endT) C.endT=C.t; if(C.t-C.endT>1.3){ C.finished=true; if(NET.mode==='host') netCarousel(); finishCarousel(); } }
}

/* ---------- eventos ---------- */
function bindEvents(){
 // En la partida no hay menú del navegador con el clic derecho (aumentos, tienda, objetos, sinergias, barra superior, lateral...): se usa para mover la minileyenda y el menú de «Atrás/Guardar/Imprimir» solo estorba. Fuera de la partida (menú, acceso) y en los campos de texto sigue disponible
 document.addEventListener('contextmenu',e=>{ if(!G||!G.players||!G.players.length||!$('menu').classList.contains('hidden')||!$('auth').classList.contains('hidden')) return; const t=e.target; if(t&&t.closest&&t.closest('input,textarea,select,[contenteditable]')) return; e.preventDefault(); },true);
 // Los paneles se reescriben en cada acción aunque no cambien: repintar el lateral con sus recortes y sombras costaba ~30 ms de trama (el tirón al soltar una ficha). Si el HTML es idéntico, no se toca el DOM
 for(const id of ['cards','traits','players','augBar','augList','log','odds','rerollBtn','incomeInfo','dmgList']){ const el=$(id); if(!el) continue; const d=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML'); Object.defineProperty(el,'innerHTML',{configurable:true,get(){ return d.get.call(this); },set(v){ v=String(v); if(this._h===v) return; this._h=v; d.set.call(this,v); }}); }
 document.addEventListener('pointerdown',()=>Music.init());
 document.addEventListener('pointerdown',e=>{ if(tipPinned&&!e.target.closest('#tip')&&!e.target.closest('[data-pop]')) unpinTip(); },true);
 // La ficha de un Pokémon se cierra al tocar cualquier otra cosa (si se toca otro Pokémon, se abre la suya)
 document.addEventListener('pointerdown',e=>{ if((selected||selCombat)&&!e.target.closest('#ucard')){ selected=null; selCombat=null; renderCard(); } },true);
 cv.addEventListener('pointerdown',e=>{
   // Solo el botón izquierdo (o un toque) selecciona y arrastra: el derecho mueve la minileyenda y no abre la ficha
   if(e.button!==0||!G||!G.players||!G.players.length) return; const [x,y]=canvasPos(e);
   if(hitMyTrainer(x,y)){ trEmote={t0:performance.now(),txt:pick(EMOTES)}; return; }
   if(G.phase==='combat'&&hitBench(x,y)<0){ const cu=combatUnitAt(x,y); if(cu){ selCombat=cu; selected=null; renderCard(); return; } }
   if(!inGame()) return;
   const hit=unitAt(x,y);
   if(hit){ drag={...hit,sx:x,sy:y,x,y,moved:false}; cv.setPointerCapture(e.pointerId); cv.style.cursor='grabbing'; }
 });
 cv.addEventListener('pointermove',e=>{
   if(!G||!G.players.length) return; const [x,y]=canvasPos(e);
   // Objetos dibujados sobre los Pokémon: al pasar el cursor se ve su descripción
   if(!drag&&!itemDrag){ const hi=hudItems.find(h=>Math.abs(ptr[0]-h.x)<=h.s/2&&Math.abs(ptr[1]-h.y)<=h.s/2), ha=!hi&&hudAugs.find(h=>Math.abs(ptr[0]-h.x)<=h.s/2&&Math.abs(ptr[1]-h.y)<=h.s/2), key=hi?'item:'+hi.k:ha?'aug:'+ha.id:null; if(key){ if(tipCanvas!==key){ showTip(key,e); tipCanvas=key; } else moveTip(e); } else if(tipCanvas){ tipCanvas=null; hideTip(); } }
   if(!inGame()) return; hover=unitAt(x,y);
   if(drag){ drag.x=x; drag.y=y; if(Math.hypot(x-drag.sx,y-drag.sy)>6) drag.moved=true;
     const sell=drag.moved&&overShop(e); $('shopPanel').classList.toggle('sell',sell); if(sell) $('sellMsg').textContent=firstRound()?'En la primera ronda no se puede vender':`Vender ${nameOf(DEF[drag.u.defId],drag.u.star)} por ${sellValue(drag.u)} de oro`; }
 });
 cv.addEventListener('pointerleave',()=>{ hover=null; });
 // Clic derecho: mueve la minileyenda. Manteniéndolo pulsado, sigue al puntero (como en TFT); en el tótem abre la lista de aumentos
 const onTotem=()=>{ const tt=B3.totemTop&&B3.totemTop(); return tt&&Math.abs(ptr[0]-tt[0])<geo.R*1.6&&ptr[1]>tt[1]-geo.R*1.2&&ptr[1]<tt[1]+geo.R*2.6?tt:null; };
 let tacHold=false, carSent=0;
 const tacGoto=(e,mark)=>{ if(!G||!G.players.length||!G.me.alive) return; const [x,y]=canvasPos(e), now=performance.now();
   // En el carrusel cada destino es un mensaje al servidor: como mucho uno cada 120 ms mientras se arrastra
   if(G.phase==='carousel'){ if(!mark&&now-carSent<120) return; carSent=now; const {cx,cy,rr}=carGeo(), [lx,ly]=carV(x,y,true); TAC.mark={x,y,t0:now}; doAct({t:'carmove',x:(lx-cx)/rr,y:(ly-cy)/rr}); return; }
   const A=tacArea(); TAC.tx=clamp(x,A.x0,A.x1); TAC.ty=clamp(y,A.y0,A.y1); if(mark||!TAC.mark) TAC.mark={x:TAC.tx,y:TAC.ty,t0:now}; };
 cv.addEventListener('pointerdown',e=>{ if(e.button!==2||!G||!G.players.length) return; canvasPos(e); if(onTotem()) return; tacHold=true; tacGoto(e,true); });
 cv.addEventListener('pointermove',e=>{ if(!tacHold) return; if(!(e.buttons&2)){ tacHold=false; return; } tacGoto(e,false); });
 window.addEventListener('pointerup',e=>{ if(e.button===2) tacHold=false; });
 // Si se sostiene el clic derecho y el puntero pasa por el minimapa, la minileyenda deja de seguirlo
 document.addEventListener('pointermove',e=>{ if(tacHold&&e.target.closest&&e.target.closest('#islands')) tacHold=false; },true);
 cv.addEventListener('contextmenu',e=>{ e.preventDefault(); if(!G||!G.players.length) return; canvasPos(e);
   const tt=onTotem(); if(tt){ const b=$('augList'); b.hidden=!b.hidden; if(!b.hidden){ const r=cv.getBoundingClientRect(); b.style.left=(r.left+tt[0]+geo.R)+'px'; b.style.top=Math.max(60,r.top+tt[1]-40)+'px'; } } });
 cv.addEventListener('pointerup',e=>{
   if(!drag) return; const me=G.me; const [x,y]=canvasPos(e); const d=drag; drag=null;
   $('shopPanel').classList.remove('sell'); cv.style.cursor='grab';
   if(!d.moved){ selected=d.u; selCombat=null; renderUI(); return; }
   if(overShop(e)){ doAct({t:'sell',loc:d.loc}); if(selected===d.u) selected=null; return; }
   let to=null; const b=hitBench(x,y); if(b>=0) to={i:b}; else if(G.phase!=='combat'&&G.phase!=='carousel'){ const cell=hitCell(x,y); if(cell&&cell[1]>=4) to={b:cell[0]+','+(cell[1]-4)}; }
   if(to){ Music.drop(); doAct({t:'move',from:d.loc,to},()=>moveTo(me,d.loc,to)); } else renderUI();
 });
 $('items').addEventListener('contextmenu',e=>{ const el=e.target.closest('.item'); if(!el||!inGame()||viewOwner()!==G.me) return; e.preventDefault(); openRecipes(+el.dataset.i,el); });
 document.addEventListener('pointerdown',e=>{ if(recipeOpen&&!e.target.closest('#recipeBox')&&!(e.button===2&&e.target.closest('#items .item'))) closeRecipes(); },true);
 document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&recipeOpen) closeRecipes(); });
 $('items').addEventListener('pointerdown',e=>{
   const el=e.target.closest('.item'); if(!el||!inGame()||viewOwner()!==G.me) return; e.preventDefault();
   itemDrag={idx:+el.dataset.i,sx:e.clientX,sy:e.clientY,moved:false,target:-1,t0:0}; $('ghost').innerHTML=itemHTML(G.me.items[itemDrag.idx],48);
 });
 window.addEventListener('pointermove',e=>{
   if(itemDrag){ if(Math.hypot(e.clientX-itemDrag.sx,e.clientY-itemDrag.sy)>5) itemDrag.moved=true;
     const g=$('ghost'); g.style.display=itemDrag.moved?'block':'none'; g.style.left=e.clientX+'px'; g.style.top=e.clientY+'px';
     if(itemDrag.moved){
       // Encima de otro componente del inventario: vista previa del objeto que saldrá al soltar
       const el=document.elementFromPoint(e.clientX,e.clientY), it=el&&el.closest&&el.closest('#items .item'), j=it?+it.dataset.i:-1, res=j>=0?benchCombo(G.me,itemDrag.idx,j):null;
       document.querySelectorAll('#items .item.target').forEach(x=>{ if(x!==it) x.classList.remove('target'); });
       if((res?j:-1)!==itemDrag.target){ itemDrag.target=res?j:-1; itemDrag.t0=performance.now(); if(res) holdTick(); }
       if(res){ it.classList.add('target'); const I=ITEMS[res], t=$('tip'), sl=statLine(I.s); t.classList.remove('shopTip'); tipAnchor=null;
         const ka=G.me.items[itemDrag.idx], kb=G.me.items[j];
         t.innerHTML=`<div class="combRes">${itemHTML(res,64)}<div><h4>${esc(I.name)}</h4>${sl?`<div class="scope">${sl}</div>`:''}</div></div><div>${I.desc}</div><div class="combBar">${itemHTML(ka,40)}<b>+</b>${itemHTML(kb,40)}<div class="cbM"><span class="cbT">Mantén para combinar</span><i><s></s></i></div>${itemHTML(res,40)}</div>`;
         t.style.display='block'; tipOn=true; }
       else {
         // Encima de un Pokémon tuyo que ya lleva un componente: qué objeto saldrá al soltar
         const k=G.me.items[itemDrag.idx], hit=!it&&ITEMS[k]&&ITEMS[k].comp?itemTargetAt(e):null, cj=hit&&hit.u.items.find(x=>ITEMS[x]&&ITEMS[x].comp), ur=cj?combineKey(cj,k):null;
         if(ur){ const I=ITEMS[ur], t=$('tip'), sl=statLine(I.s), forge=cj==='medal'||k==='medal', blocked=I.emblem&&DEF[hit.u.defId].traits.includes(I.emblem);
           t.classList.remove('shopTip'); tipAnchor=null;
           t.innerHTML=`<div class="combRes">${itemHTML(ur,64)}<div><div class="scope">${blocked?'No se puede: ya tiene esa sinergia':'Suelta para crear en '+esc(nameOf(DEF[hit.u.defId],hit.u.star))}</div><h4>${forge?'Insignia (eliges su sinergia entre 3)':esc(I.name)}</h4></div></div>${sl&&!forge?`<div class="scope">${sl}</div>`:''}<div>${forge?'Medalla + componente: forjas una insignia y eliges a qué sinergia pertenece.':I.desc}</div>`;
           t.style.display='block'; tipOn=true; }
         else hideTip(); }
     } }
   moveTip(e);
 });
 window.addEventListener('pointerup',e=>{
   if(!itemDrag) return; const d=itemDrag; itemDrag=null; $('ghost').style.display='none'; const me=G.me;
   document.querySelectorAll('#items .item.target').forEach(x=>x.classList.remove('target')); hideTip();
   if(!d.moved) return;
   if(d.target>=0){ if(performance.now()-d.t0>=1000) doAct({t:'icomb',a:d.idx,b:d.target},()=>combineBench(me,d.idx,d.target)); return; }
   const hit=itemTargetAt(e);
   if(hit){ doAct({t:'item',idx:d.idx,loc:hit.loc},()=>useItem0(me,d.idx,hit.u,hit.loc)); selected=hit.u; selCombat=null; renderUI(); }
 });
 const shopBuy=i=>{ const me=G.me, k=me.shop[i]; hideTip();
   if(k&&DEF[k]&&canBuy(me,i)&&!allUnits(me).some(u=>u.baseId===k)){ const d=DEF[k]; Music.cry(shopName(d),dexOf(d,1)); }
   doAct({t:'buy',i}); };
 $('cards').addEventListener('click',e=>{ const el=e.target.closest('.card[data-i]'); if(!el||!inGame()) return; if(shopDrag.bought){ shopDrag.bought=false; return; } shopBuy(+el.dataset.i); });
 // Comprar arrastrando: sacar la carta hacia arriba (SHOP_PULL px) la compra y va a la banca; si se suelta antes, vuelve a su sitio
 const shopDrag={el:null,y:0,id:0,bought:false}, SHOP_PULL=120, shopReset=()=>{ if(shopDrag.el){ shopDrag.el.style.transform=''; shopDrag.el.style.transition=''; } shopDrag.el=null; };
 $('cards').addEventListener('dragstart',e=>e.preventDefault());
 $('cards').addEventListener('pointerdown',e=>{ const el=e.target.closest('.card[data-i]'); if(!el||e.button!==0||!inGame()) return; shopDrag.el=el; shopDrag.y=e.clientY; shopDrag.id=e.pointerId; shopDrag.bought=false; el.style.transition='none'; });
 addEventListener('pointermove',e=>{ const s=shopDrag; if(!s.el||e.pointerId!==s.id) return; const dy=Math.min(0,e.clientY-s.y); s.el.style.transform=`translateY(${dy}px)`;
   if(dy<=-SHOP_PULL){ const i=+s.el.dataset.i; s.bought=true; shopReset(); shopBuy(i); } });
 addEventListener('pointerup',e=>{ if(shopDrag.el&&e.pointerId===shopDrag.id) shopReset(); });
 addEventListener('pointercancel',shopReset);
 $('xpBtn').addEventListener('click',()=>{ if(inGame()){ if(!$('xpBtn').disabled) Music.xp(); doAct({t:'xp'}); } });
 $('rerollBtn').addEventListener('click',()=>{ if(inGame()) doAct({t:'reroll'}); });
 $('lockBtn').addEventListener('click',()=>{ if(inGame()) doAct({t:'lock'},()=>{G.me.locked=!G.me.locked;}); });
 // Engranaje de la partida: abre la ventana de configuración (con Rendirse y Volver al menú abajo)
 $('menuBtn').addEventListener('click',()=>showOptions(true));
 $('playBtn').addEventListener('click',()=>{ Music.init(); showNormal(); });
 $('rankedBtn').addEventListener('click',()=>{ Music.init(); showRanked(); });
 $('histBtn').addEventListener('click',showHistory); $('frBtn').addEventListener('click',()=>openFriends()); $('eeveeGacha').addEventListener('click',showGacha); // el Eevee con halo del menú abre el gacha
 $('howBtn').addEventListener('click',showHow);
 $('dexMenuBtn').addEventListener('click',()=>showDex(0));
 $('recMenuBtn').addEventListener('click',showRecipes);
 $('optBtn').addEventListener('click',()=>showOptions(false));
 bindAuth();
 $('players').addEventListener('click',e=>{ const row=e.target.closest('.pl[data-pid]'); if(row&&G&&G.players.length) spectate(+row.dataset.pid); });
 document.querySelector('.sideTabs').addEventListener('click',e=>{ const b=e.target.closest('[data-tab]'); if(b) setSideTab(b.dataset.tab); });
 document.querySelector('.dmgModes').addEventListener('click',e=>{ const b=e.target.closest('[data-m]'); if(!b) return; dmgMode=b.dataset.m; document.querySelectorAll('.dmgModes [data-m]').forEach(x=>x.setAttribute('aria-pressed',x===b)); renderDmg(); });
 // Pantalla completa (el navegador puede negarse si no viene de un clic)
 $('augBar').addEventListener('contextmenu',e=>{ e.preventDefault(); const b=$('augList'); b.hidden=!b.hidden; });
 document.addEventListener('pointerdown',e=>{ if(!e.target.closest('#augList,#augBar')) $('augList').hidden=true; });
 $('goldBox').addEventListener('click',e=>{ e.stopPropagation(); $('incomeInfo').hidden=!$('incomeInfo').hidden; });
 document.addEventListener('pointerdown',e=>{ if(!e.target.closest('#goldBox')) $('incomeInfo').hidden=true; });
 $('fsBtn').addEventListener('click',()=>{ const d=document; try{ if(d.fullscreenElement) d.exitFullscreen(); else d.documentElement.requestFullscreen({navigationUI:'hide'}).catch(()=>toast('Tu navegador no permite la pantalla completa')); }catch(e){ toast('Tu navegador no permite la pantalla completa'); } });
 document.addEventListener('fullscreenchange',()=>{ $('fsBtn').classList.toggle('on',!!document.fullscreenElement); $('fsBtn').title=document.fullscreenElement?'Salir de pantalla completa':'Pantalla completa'; layout(); });
 $('ucard').addEventListener('click',e=>{
   const me=G.me;
   if(e.target.closest('.uc-x')){ selected=null; selCombat=null; renderCard(); return; }
   const pop=e.target.closest('[data-pop]'); if(pop){ e.stopPropagation(); ucPop(pop.dataset.pop,pop); return; }
   const rm=e.target.closest('[data-rm]'); if(rm&&selected){ const loc=findLoc(me,selected); if(loc) doAct({t:'rmitem',loc,idx:+rm.dataset.rm},()=>{ removeItem(me,selected,+rm.dataset.rm); }); return; }
   if(e.target.closest('#ucSell')&&selected){ const loc=findLoc(me,selected); if(loc){ doAct({t:'sell',loc}); selected=null; renderCard(); } }
 });
 window.addEventListener('keydown',e=>{
   if(e.key==='F3'){ e.preventDefault(); toggleFps(); return; }
   if(e.key==='Escape'&&(selected||selCombat)&&!modalOpen()){ selected=null; selCombat=null; renderCard(); return; }
   if(!inGame()||modalOpen()||!$('menu').classList.contains('hidden')||!$('auth').classList.contains('hidden')) return;
   if(['INPUT','SELECT'].includes(e.target.tagName)) return;
   const k=e.key.toLowerCase();
   if(k==='d') doAct({t:'reroll'});
   else if(k==='f'){ if(!$('xpBtn').disabled) Music.xp(); doAct({t:'xp'}); }
   else if(k==='e'&&hover){ doAct({t:'sell',loc:hover.loc}); if(selected===hover.u) selected=null; hover=null; }
   else if(k==='t'){ greet(); }
   else if(k==='h'){ tacFire(); }
   else if(k>='1'&&k<='3'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){ if(G.me&&tacOf(G.me).mimic) mewForm(+k); else eeveeForm(+k); }
 });
 document.addEventListener('pointerover',e=>{ const el=e.target.closest&&e.target.closest('[data-tip]'); if(!el||itemDrag){ if(!itemDrag) hideTip(); return; } if(tipAnchor===el) return; showTip(el.dataset.tip,e,el); });
 window.addEventListener('resize',layout);
 // La tienda y la barra superior cambian de alto (cartas, botones que saltan de línea): el tablero se reajusta
 if(window.ResizeObserver){ const ro=new ResizeObserver(()=>layout()); for(const el of [document.querySelector('.top'),$('shopPanel'),document.querySelector('.boardInfo')]) if(el) ro.observe(el); }
 if(window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',readColors);
}

/* ---------- tooltips ---------- */
function unitTip(key){
 const d=DEF[key]; if(!d) return '';
 const forms=[1,2,3].map(s=>{ const u=baseCombatUnit(d,0,s); const ab=abOf(d,s); return `<div class="form"><b>${'★'.repeat(s)} ${nameOf(d,s)}</b> · ${ab[1]} <span class="muted">(${KIND_NAME[ab[0]]})</span><br>${abHTML(ab,u,s,{short:1})}</div>`; }).join('');
 return `<h4>${d.name} <span class="chip" style="color:${COST_HEX[d.cost-1]}">Coste ${d.cost}</span></h4><div class="scope">${d.traits.map(t=>TRAITS[t].icon+' '+t).join(' · ')} · ${ROLE_NAME[d.role]}</div><div class="units">📈 Habilidad: escala con ${SCALE_TXT[SCALE_BY_ROLE[d.role]||'ap']} (números sin objetos)</div>${forms}`;
}
// Botín acumulado por Cazatesoros en esta partida (oro, Pokémon, objetos y su valor total en oro)
function lootHTML(){ const L=G&&G.me&&G.me.loot; if(!L) return '<div class="loot"><b>💎 Botín de la partida</b><br><span class="muted">Todavía nada: gana combates con 2 o más Cazatesoros.</span></div>';
 return `<div class="loot"><b>💎 Botín de la partida</b><div>🪙 Oro: <b>${L.gold}</b></div><div>🐾 Pokémon: <b>${L.units}</b></div><div>🎒 Objetos: <b>${L.items}</b></div><div class="lootTot">≈ <b>${L.value}</b> de oro en total</div></div>`; }
function tipHTML(spec){
 const i=spec.indexOf(':'), type=spec.slice(0,i), key=spec.slice(i+1);
 if(type==='unit') return unitTip(key);
 if(type==='shop') return shopTip(key);
 if(type==='form'){ const [k,s]=key.split('|'); const d=DEF[k]; if(!d) return ''; const st=+s; const ab=abOf(d,st); return `<h4>${nameOf(d,st)} ${'★'.repeat(st)}</h4><div class="scope">${ab[1]} · ${KIND_NAME[ab[0]]}</div><div>${abHTML(ab,baseCombatUnit(d,0,st),st)}</div>`; }
 if(type==='trait'){
   const Tr=TRAITS[key]; if(!Tr) return '';
   const live=G&&G.me&&G.players&&G.players.length, c=live?(traitCounts(G.me)[key]||0):0, e=live?(emblemCountsOf(boardUnits(G.me))[key]||0):0, tier=tierOf(key,c,e);
   const units=UNIT_LIST.filter(u=>u.traits.includes(key));
   const onBoard=new Set(G&&G.me?boardUnits(G.me).map(u=>u.defId):[]);
   return `<h4>${Tr.icon} ${key} <span class="small muted">${c}/${Tr.bp.find(b=>b>c)||Tr.bp[Tr.bp.length-1]}</span></h4><div class="scope">${Tr.scope}</div><div>${Tr.sum}</div>
     <div style="margin-top:6px">${Tr.lv.map((t,j)=>`<div class="tl ${tier>j?'on':''}"><b>(${Tr.bp[j]})</b> ${t}</div>`).join('')}${Tr.pr?`<div class="tl pr ${tier>Tr.bp.length?'on':''}"><b>(${Tr.pr[0]})</b> 🌈 ${Tr.pr[1]}${e?'':' <i>🔒 Solo con al menos un emblema</i>'}</div>`:''}</div>
     <div class="trUnits">${units.map(u=>{ const k=CARD_ART[u.key]?u.key:null; return `<span class="trU c${u.cost} ${onBoard.has(u.key)?'on':''}" title="${esc(u.name)}">${k?`<img src="${artThumb(k)}" alt="" class="artPic" data-dex="${dexOf(u,1)}">`:portraitImg(dexOf(u,1))}</span>`; }).join('')}</div>${key==='Cazatesoros'?lootHTML():''}`;
 }
 if(type==='item'){
   const I=ITEMS[key]; if(!I) return '';
   let h=`<h4>${itemHTML(key,30)} ${I.name}</h4>`; const sl=statLine(I.s); if(sl) h+=`<div class="scope">${sl}</div>`; h+=`<div>${I.desc}</div>`;
   if(I.from) h+=`<div class="units">Receta: ${ITEMS[I.from[0]].name} + ${ITEMS[I.from[1]].name}</div>`;
   if(I.comp) h+=`<div class="units">Clic derecho: ver qué puedes crear con él</div>`;
   return h;
 }
 if(type==='aug'){ const a=AUG_BY[key]; if(!a) return ''; const pg=G&&G.me&&G.me.augments.includes(key)?(G.mirror?(G.me.augUi||{})[key]:augProgress(G.me,key)):''; return `<h4>${augIcon(a,'augTipIco')} ${a.name}</h4><div class="scope">${TIER_NAME[a.tier]} · ${AUG_CAT[a.cat]||''}</div><div>${a.desc}</div>${pg?`<div class="units">${esc(pg)}</div>`:''}`; }
 return '';
}
let tipOn=false, tipCanvas=null;
// Las fichas de las cartas de la tienda se anclan encima de la carta; el resto sigue al puntero
let tipAnchor=null;
function showTip(spec,e,el){ tipPinned=false; const h=tipHTML(spec); if(!h){ hideTip(); return; } const t=$('tip'); t.innerHTML=h; t.style.display='block'; tipOn=true;
 t.classList.toggle('shopTip',spec.startsWith('shop:')); tipAnchor=spec.startsWith('shop:')&&el?el:null;
 if(tipAnchor){ const r=el.getBoundingClientRect(), w=t.offsetWidth, hh=t.offsetHeight; t.style.setProperty('--cc',getComputedStyle(el).getPropertyValue('--cc')); t.style.left=clamp(r.left+r.width/2-w/2,8,innerWidth-w-8)+'px'; t.style.top=Math.max(8,r.top-hh-10)+'px'; }
 else moveTip(e); }
function moveTip(e){ if(!tipOn||tipAnchor) return; const t=$('tip'); const w=t.offsetWidth, h=t.offsetHeight; let x=e.clientX+16, y=e.clientY+16; if(x+w>innerWidth-8) x=e.clientX-w-16; if(y+h>innerHeight-8) y=Math.max(8,innerHeight-h-8); t.style.left=Math.max(8,x)+'px'; t.style.top=y+'px'; }
function hideTip(){ if(!tipOn||tipPinned) return; tipOn=false; tipAnchor=null; $('tip').style.display='none'; }

/* ---------- tablero 3D + capa 2D ---------- */
// El tablero, los Pokémon y los efectos los pinta board3d.js (three.js). Aquí se le dice qué hay
// en pantalla y encima se dibuja la capa 2D: barras, estrellas, objetos, textos y entrenadores.
let ptr=[0,0], hudActors=[], hudItems=[], myTrBox=null;
const b3On=()=>!HEADLESS&&window.B3&&B3.ready;
function b3Geo(){ const cells=[]; for(let r=0;r<8;r++) for(let c=0;c<7;c++) cells.push(cellXY(c,r)); return {...geo,cells,bench:[...Array(BENCH)].map((_,i)=>benchXY(i))}; }
function sizeB3(){ if(!window.B3||!geo.W) return; if(!B3.ready){ B3.init($('gl')); applyGfx(); $('gl').addEventListener('webglcontextlost',()=>toast('El navegador perdió el dibujo 3D; intentando recuperarlo… Si se queda gris, recarga (F5)')); $('gl').addEventListener('webglcontextrestored',()=>toast('Dibujo 3D recuperado')); } B3.resize(b3Geo(),window.devicePixelRatio||1,view); }
// Calidad gráfica y temblor de cámara: preferencias de este dispositivo (no de la cuenta)
const GFX={get q(){ try{ return localStorage.getItem('pt_gfx')||'auto'; }catch(e){ return 'auto'; } }};
function applyGfx(){ if(!window.B3||!B3.ready) return; const q=GFX.q; if(B3.setAuto) B3.setAuto(q==='auto'); if(q!=='auto') B3.setQuality(+q); }
// De píxeles de tablero (suelo) a pantalla; h en radios de casilla
const scr=(x,y,h=0)=>b3On()?B3.project(x,y,h/1):[x,y];
// Fondo del tablero: el escenario por capas en todas las fases; solo el carrusel usa la plaza 3D
function bgKind(){ if(G.phase==='carousel') return 'plaza'; return 'glade'; }
const STAR_SCALE=[1,1.13,1.27];
// Etapa evolutiva: las primeras formas son más pequeñas y al evolucionar se nota el cambio (líneas de 1, 2 o 3 formas)
// Tamaño de las fichas: todas las primeras formas se ven iguales (×0,85: los modelos se normalizan a la misma altura) y, según su altura real,
// las evoluciones crecen respecto a su base (hasta ×1,45) y los gigantes de una sola forma son más grandes (hasta ×1,6: Rayquaza, Lugia, Kyogre…);
// los legendarios que no son gigantes, ×1,15. Solo visual
const UNIT_BASE=.85;
const stageScale=(d,star)=>{ const ch=[].concat(d.dex).map(dexNum); if(!ch.length) return UNIT_BASE; const n=ch.length, cur=n>1?ch[formIdx(d,star,n)]:ch[0]; return UNIT_BASE*heightSize(ch,cur,1.6); };
const unitScale=(d,star,o={})=>{ const st=stageScale(d,star), giant=st>UNIT_BASE*1.01&&[].concat(d.dex).length===1; return STAR_SCALE[star-1]*st*(d.traits&&d.traits.includes('Legendario')&&!giant?1.15:1)*(o.boss?1.35:1); };
// Pokémon bajo el puntero (en pantalla, porque los modelos están de pie)
function pickActor(test){
 const [px,py]=ptr; let best=null,bd=1e9;
 for(const a of hudActors){ if(!a.base||!test(a)) continue; const [bx,by]=a.base, ay=a.anchor[1], w=Math.max(geo.R*.55,(by-ay)*.42);
   if(px<bx-w||px>bx+w||py<ay-6||py>by+geo.R*.35) continue; const d=Math.abs(px-bx)+Math.abs(py-(ay+by)/2)*.5; if(d<bd){bd=d;best=a;} }
 return best;
}
// Objeto sobre un Pokémon en el lienzo (tablero, combate propio y rival, carrusel): siempre con su aura del color del objeto, igual de viva que en la ficha
function drawItemBadge(k,x,y,sz,n){
 const I=ITEMS[k]; if(!I) return;
 ctx.save(); const col=itemColor(I);
 const fxc=itemFxRGB(k), pu=.5+.5*Math.sin(performance.now()/1000*2.4+k.length*1.7), g=ctx.createRadialGradient(x,y+sz*.04,0,x,y,sz*.74); g.addColorStop(0,`rgba(${fxc},${(.85+.12*pu).toFixed(2)})`); g.addColorStop(.48,`rgba(${fxc},${(.42+.12*pu).toFixed(2)})`); g.addColorStop(.76,`rgba(${fxc},.1)`); g.addColorStop(1,`rgba(${fxc},0)`); const bw=Math.max(2,sz*.1); ctx.fillStyle='#000'; ctx.fillRect(x-sz/2-bw,y-sz/2-bw,sz+2*bw,sz+2*bw); ctx.fillStyle='#04090c'; ctx.fillRect(x-sz/2,y-sz/2,sz,sz); ctx.fillStyle=g; ctx.fillRect(x-sz/2,y-sz/2,sz,sz); ctx.globalAlpha=1; ctx.strokeStyle='#000'; ctx.lineWidth=1; ctx.strokeRect(x-sz/2+.5,y-sz/2+.5,sz-1,sz-1);
 const e=getItemImg(k);
 if(e.status==='ok'){ ctx.imageSmoothingEnabled=itemHQ(k); ctx.drawImage(e.img,x-sz*.46,y-sz*.46,sz*.92,sz*.92); }
 else { ctx.font=`${sz*.62}px system-ui`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(I.icon,x,y+1); }
 // Contador de acumulaciones dentro del objeto, como en TFT (cargas de la Cinta Furia, poder ganado con la Piedra Lunar…)
 if(n){ const t=String(n), fs=Math.max(8,sz*.4), bh=fs*.95; ctx.globalAlpha=.78; ctx.fillStyle='#05070f'; ctx.fillRect(x-sz/2,y+sz/2-bh,sz,bh); ctx.globalAlpha=1; ctx.font=`900 ${fs}px Nunito,system-ui`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.lineWidth=2.5; ctx.strokeStyle='#000'; ctx.fillStyle='#ffd75e'; ctx.strokeText(t,x,y+sz/2-bh/2+.5); ctx.fillText(t,x,y+sz/2-bh/2+.5); }
 ctx.restore();
}
// Barras al estilo TFT encima de la cabeza: vida con marcas cada 300 PS y maná debajo (brilla cuando va a lanzar)
// Vida que se ve bajar con retraso en cada barra (solo visual)
const HP_TRAIL=new WeakMap();
// Tipos con efecto visual propio para los ataques básicos
const FX_EL=new Set(['Fuego','Agua','Planta','Eléctrico','Psíquico','Roca','Dragón','Fantasma','Hada','Normal','Acero','Siniestro','Lucha','Hielo','Veneno']);
function drawHud(a){
 if(!a.anchor||a.dead) return;
 const R=geo.R, o=a.hud; let [hx,hy]=a.anchor;
 // Como en TFT: barra arriba y, debajo, la fila de objetos; las estrellas encima de todo, solo en la planificación (en combate no)
 // Los objetos van pegados, marco con marco, y las barras de vida y maná miden exactamente lo mismo que la fila de 3 objetos (marcos incluidos)
 const bsz=Math.max(22,R*.8), bbw=Math.max(2,bsz*.1), slot=bsz+2*bbw, rowW=slot*3;
 const isz=o.items&&o.items.length?bsz:0; let itemsY=hy-isz-4;
 ctx.save();
 if(o.hp!==undefined){
   const w=rowW-3, bx=hx-w/2, hh=Math.max(5,R*.17), mh=Math.max(3,R*.1), hasM=o.maxMana<9999, by=Math.round(hy-hh-(hasM?mh+1:0)-6-(isz?isz+1.5+2*bbw:0));
   itemsY=by+hh+(hasM?mh+1:0)+1.5+bbw;
   ctx.fillStyle='rgba(10,12,24,.85)'; ctx.fillRect(bx-1.5,by-1.5,w+3,hh+(hasM?mh+1:0)+3);
   // Como en TFT, el escudo es un tramo blanco a continuación de la vida; si vida + escudo pasan del máximo, la barra se comprime para que quepa (wh = ancho de la vida máxima)
   const hpK=clamp(o.hp/o.maxHp,0,1), shv=Math.max(0,o.shield||0), tot=Math.max(o.maxHp,o.hp+shv), wh=w*o.maxHp/tot;
   if(a.cu){ let tr=HP_TRAIL.get(a.cu); if(tr==null||tr<hpK) tr=hpK; else tr=Math.max(hpK,tr-(tr-hpK)*.06-.003); HP_TRAIL.set(a.cu,tr); if(tr>hpK){ ctx.fillStyle='rgba(255,236,200,.9)'; ctx.fillRect(bx+wh*hpK,by,wh*(tr-hpK),hh); } }
   ctx.fillStyle=o.mine?'#3fd27a':'#ff5a5f'; ctx.fillRect(bx,by,wh*hpK,hh);
   if(a.cu&&hpK<.25&&hpK>0){ ctx.strokeStyle=`rgba(255,70,70,${.55+.45*Math.sin(performance.now()/110)})`; ctx.lineWidth=2; ctx.strokeRect(bx-2.5,by-2.5,w+5,hh+5); }
   ctx.fillStyle='rgba(255,255,255,.25)'; ctx.fillRect(bx,by,wh*hpK,hh*.35);
   if(shv>0){ ctx.fillStyle='rgba(245,245,245,.95)'; ctx.fillRect(bx+wh*hpK,by,w*shv/tot,hh); }
   ctx.fillStyle='rgba(10,12,24,.7)'; for(let k=300;k<tot;k+=300){ const tx=bx+w*k/tot; ctx.fillRect(tx,by,1,k%1500?hh*.55:hh); }
   if(hasM){ const full=o.mana>=o.maxMana*.9; ctx.fillStyle='#1b2a48'; ctx.fillRect(bx,by+hh+1,w,mh); ctx.fillStyle=full?`hsl(205,100%,${70+15*Math.sin(performance.now()/90)}%)`:'#4aa3ff'; ctx.fillRect(bx,by+hh+1,w*clamp(o.mana/o.maxMana,0,1),mh); }
   hy=by;
 } else if(isz) hy=itemsY;
 if(!o.creep&&o.star&&!a.cu&&(G.phase==='planning'||G.phase==='augment')){
   ctx.font=`900 ${Math.max(9,R*.32)}px Nunito,system-ui,sans-serif`; ctx.textAlign='center'; ctx.textBaseline='bottom';
   ctx.fillStyle=o.star===3?'#ffcf33':o.star===2?'#d6dde8':'#cd8f52'; ctx.strokeStyle='rgba(0,0,0,.6)'; ctx.lineWidth=3;
   const st='★'.repeat(o.star); ctx.strokeText(st,hx,hy-2); ctx.fillText(st,hx,hy-2);
 }
 if(o.items&&o.items.length){ const sz=isz, iy=itemsY+sz/2; o.items.forEach((it,i)=>{ const ix=hx+(i-(o.items.length-1)/2)*slot; drawItemBadge(it,ix,iy,sz,o.cnt&&o.cnt[it]); hudItems.push({k:it,x:ix,y:iy,s:sz}); }); }
 ctx.restore();
}
// Posición en pantalla y tamaño de un entrenador colocado en (x,y) del tablero con altura s (px de tablero)
function trScreen(x,y,s){ const [sx,sy]=scr(x,y,0), [,ty]=scr(x,y,s*1.35/geo.R); return [sx,sy,Math.max(10,sy-ty)]; }
// Qué se ve en cada momento: lista de Pokémon para board3d.js
// Tu minileyenda: se mueve con clic derecho por tu mitad del tablero y recoge los orbes al pasar por encima
const TAC={g:null,x:0,y:0,tx:null,ty:null,mark:null,picked:new Set()};
function tacArea(){ const R=geo.R; return {x0:geo.pad,x1:geo.W-geo.pad,y0:cellXY(0,0)[1]-R*.9,y1:benchXY(0)[1]+geo.bs*.5+R*.5}; }
function stepTac(dt){
 if(!G||!G.players.length||!geo.W) return;
 if(TAC.g!==G){ const sp=trainerSpots().me; Object.assign(TAC,{g:G,x:sp[0],y:sp[1],tx:null,ty:null,mark:null}); TAC.picked.clear(); tacSent=''; tacVis.clear(); }
 if(TAC.tx!=null){ const dx=TAC.tx-TAC.x, dy=TAC.ty-TAC.y, d=Math.hypot(dx,dy), toOrb=orbList().some(o=>!TAC.picked.has(o.id)&&Math.hypot(TAC.tx-o.x,TAC.ty-o.y)<geo.R*2.2), st=geo.R*3.6*(toOrb?2.4:1)*dt;
   if(d<=st){ TAC.x=TAC.tx; TAC.y=TAC.ty; TAC.tx=null; } else { TAC.x+=dx/d*st; TAC.y+=dy/d*st; } }
 tacSync();
 if(!G.me.alive||G.phase==='carousel'||G.view) return;
 for(const o of orbList()) if(o.ready&&!TAC.picked.has(o.id)&&Math.hypot(TAC.x-o.x,TAC.y-o.y)<geo.R*.85){
   const src=G.me.orbs.find(q=>q.id===o.id); if(src&&orbBlocked(G.me,src)){ if(TAC.blockT!==o.id){ TAC.blockT=o.id; toast('Banquillo lleno: haz sitio para abrir este orbe (lleva un Pokémon)'); } continue; }
   if(TAC.blockT===o.id) TAC.blockT=null; TAC.picked.add(o.id); doAct({t:'orb',id:o.id},()=>{ G.me.orbs=G.me.orbs.filter(q=>q.id!==o.id); }); if(G.anvils&&G.anvils.length){ const q=G.anvils.map(a=>done=>showAnvil(a,done)); G.anvils=[]; runQueue(q,()=>renderUI()); } }
}
// Envía al servidor el tablero que miras y adónde va tu minileyenda (solo cuando cambia: al hacer clic derecho o cambiar de tablero)
// Al arrastrar con el clic derecho el destino cambia en cada movimiento: como mucho un mensaje cada 150 ms (el último siempre llega)
let tacSent='', tacSentT=0;
function tacSync(){
 if(NET.mode!=='client'||!NET.sock||!G.me.alive||G.phase==='carousel') return;
 const go=TAC.tx!=null, a={t:'tpos',b:G.view?G.view.pid:G.me.id,x:+(((go?TAC.tx:TAC.x)-geo.ox)/geo.R).toFixed(2),y:+(((go?TAC.ty:TAC.y)-geo.pad)/geo.R).toFixed(2)}, k=a.b+','+a.x+','+a.y, now=performance.now();
 if(k!==tacSent&&(now-tacSentT>150||a.b!==+tacSent.split(',')[0])){ tacSent=k; tacSentT=now; NET.sock.emit('act',a); }
}
// Minileyendas de los demás en el tablero que miras: las que están en él (llegan por la red) caminan hasta su destino;
// el dueño del tablero y su rival, si no están en él, en su sitio de siempre
const tacVis=new Map(); let tacOthers=[];
// Burla de Charmander de otros jugadores: cuando sube su contador (pub), lanza su animación y su bola de fuego si están en el tablero que miras
const tauntFx=new Map();
function otherTaunt(o,now){
 const f=tauntFx.get(o.p.id); if(!f) return;
 if(f.fire){ const [tx,ty]=cellXY(3,1); setTimeout(()=>{ if(G&&window.B3&&B3.fireball&&tacOthers.some(q=>q.p===o.p)) B3.fireball(o.x,o.y-geo.R*.2,tx,ty,0,(cosD(o.p,'fb')||{}).c); },170); f.fire=false; }
 o.cast=f.castN; if(now-f.t<1100){ const [tx,ty]=cellXY(3,1); o.tx=tx; o.ty=ty; }
}
function stepOthers(inCombat){
 const me=G.me, v=G.view, bp=v?v.pid:me.id, sp=trainerSpots(), now=performance.now(), out=[], seen=new Set([me.id]);
 for(const p of G.players){ if(p===me) continue; let f=tauntFx.get(p.id); if(!f){ f={n:p.tn||0,castN:0,t:0,fire:false}; tauntFx.set(p.id,f); } if((p.tn||0)!==f.n){ f.n=p.tn||0; f.castN++; f.t=now; f.fire=true; } } // contadores de todos (aunque no se vean)
 const at=(p,x,y,face,col)=>{ if(!p||seen.has(p.id)) return; seen.add(p.id); out.push({p,x,y,face,col}); };
 for(const p of G.players){ if(p===me||!p.alive||!p.tp||p.tp[0]!==bp) continue;
   const tx=geo.ox+p.tp[1]*geo.R, ty=geo.pad+p.tp[2]*geo.R; let s=tacVis.get(p.id);
   if(!s||s.b!==bp||s.R!==geo.R){ s={b:bp,R:geo.R,x:tx,y:ty,t:now}; tacVis.set(p.id,s); }
   const dx=tx-s.x, dy=ty-s.y, d=Math.hypot(dx,dy), st=geo.R*3.6*Math.min(.1,(now-s.t)/1000); s.t=now;
   if(d<=st){ s.x=tx; s.y=ty; } else { s.x+=dx/d*st; s.y+=dy/d*st; }
   at(p,s.x,s.y,Math.PI*.85,p.id===bp?'#ffd75e':'#7fc8ff'); }
 // Sin posición en la red (bots, solitario) se quedan en su sitio; una persona que está en otro tablero no se dibuja aquí
 const bottom=G.players.find(p=>p.id===bp); if(bottom&&bottom!==me&&!bottom.tp) at(bottom,sp.me[0],sp.me[1],Math.PI*.85,'#ffd75e');
 // El rival del combate: arriba si es un bot o si está mirando su propio combate (que es este mismo)
 const opp=inCombat&&G.round&&G.round.type!=='pve'?(v?v.opp:G.players.find(p=>p!==me&&G.myOpp&&G.myOpp.replace(' (fantasma)','')===p.name)):null;
 if(opp&&opp!==me&&(!opp.tp||opp.tp[0]===opp.id)) at(opp,sp.opp[0],sp.opp[1],-Math.PI*.15,'#ef4b3a');
 tacOthers=out; for(const o of out) otherTaunt(o,now); for(const [id,f] of tauntFx) if(f.fire&&!out.some(o=>o.p.id===id)) f.fire=false; return out;
}
// Orbes de botín. Los que suelta un salvaje al caer salen volando desde su casilla (f = progreso del vuelo, 0 a 1) y aterrizan algo más cerca de ti; se ven al instante y se recogen en cuanto han aterrizado (ready), aunque el combate siga en marcha
const ORB_FLY_MS=1100;
function orbList(){
 const cbm=G.phase==='combat'&&G.combat; if(!G.me.orbs||!G.me.orbs.length||G.phase==='carousel'||(G.view&&G.view.board)) return [];
 const born=G.orbBorn||(G.orbBorn=new Map()), now=performance.now(), A=tacArea(), yMax=cellXY(0,7)[1];
 return G.me.orbs.map((o,i)=>{ const j=((o.id*37)%7)/7-.5, [x,y]=o.c!=null?cellXY(o.c,o.r):cellXY([1,5,3,0,6,2,4][i%7],4+(i*3)%4), px=x+j*geo.R*.8, py=y+((o.id*53)%5/5-.5)*geo.R*.6, fall=o.c!=null;
   let lx=px, ly=py; if(fall){ lx=clamp(px+(((o.id*97)%9)/9-.5)*geo.R*2.6,A.x0+geo.R*.5,A.x1-geo.R*.5); ly=clamp(py+geo.R*(.9+((o.id*61)%5)/5*1.1),A.y0,yMax); }
   if(!born.has(o.id)) born.set(o.id,now); const fl=fall?clamp((now-born.get(o.id))/ORB_FLY_MS,0,1):1;
   return {id:o.id,tier:o.tier,x:lx,y:ly,x0:px,y0:py,f:fl,ready:fl>=1}; });
}
let synCache={v:-1,who:null,t:{}};
function activeTraits(who){ if(synCache.v!==G.uiV||synCache.who!==who){ const t=traitTiers(who); synCache={v:G.uiV,who,t}; } return synCache.t; }
let sceneLinks=[];
// Entrenadores del carrusel: la posición que se dibuja persigue a la real con suavizado exponencial (sin saltos entre pasos de 33 ms ni entre mensajes de red)
const carVis=new Map(); let carFrame=0, carVisT=0, carDt=0;
function carPos(pid,x,y){ let v=carVis.get(pid); if(!v){ v={x,y,f:-1}; carVis.set(pid,v); } if(v.f!==carFrame){ const k=1-Math.exp(-carDt*(G.carousel&&G.carousel.mirror?7:15)); v.x+=(x-v.x)*k; v.y+=(y-v.y)*k; v.f=carFrame; } return [v.x,v.y]; }
// Efecto de una vez al colocar una ficha que comparte sinergia: memoria de cada ficha del tablero (casilla y sinergias activas)
const synMem=new WeakMap(); let synCtx='', synFrame=0; // m.last = último fotograma en que la ficha estaba en el tablero (entrar = no estaba en el anterior)
function sceneActors(){
 const A=[], me=G.me, inCombat=G.phase==='combat'&&viewCombat(), inCar=G.phase==='carousel'&&G.carousel;
 sceneLinks=[]; if(inCar){ const tn=performance.now(); carFrame++; carDt=Math.min(.1,(tn-carVisT)/1000); carVisT=tn; } else if(carVis.size) carVis.clear();
 const since=NET.lastTick?Math.max(0,(performance.now()-NET.lastTick)/1000)*(G.speed||1):0;
 drawSub=inCombat&&!inCombat.done?Math.min(DT,((G.view&&G.view.cb===inCombat?G.view.acc:G.acc)||0)+since):0;
 if(inCombat){
   const cb=viewCombat(), mySide=curFlip()?1:0;
   for(const u of cb.units){
     const [x,y]=unitXY(u), t=u.target&&!u.target.dead?unitXY(u.target):null, mine=u.side===mySide;
     // Para la animación: cuánto falta para el próximo golpe (el impacto del clip se alinea con el daño), cada cuánto ataca y si ganó
     const tg=u.target&&!u.target.dead?u.target:null, inR=!!tg&&!u.dead&&!(u.stun>0)&&dU(u,tg)<=u.range, sp=G.speed||1;
     A.push({key:u,cu:u,atkIn:inR?Math.max(0,u.atkCd-drawSub)/sp:null,atkP:1/((u.as||1)*sp),spd:sp,win:!!(cb.done&&cb.winner===u.side&&!u.dead),charge:u.maxMana<9999?u.mana/u.maxMana:0,ranged:u.range>1,dex:u.creep?(u.d.shiny?'shiny:':'')+u.d.dex:dexOf(u.d,u.star),x,y,tx:t&&u.mt>=.3?t[0]:null,ty:t?t[1]:null,face:mine?Math.PI:0,atk:u.atkN,cast:u.castN||0,dead:u.dead,stun:u.stun,sleep:u.sleepT,shield:u.shield,flash:u.flash,glow:u.glow,glowColor:typeColor(u.d),
       alpha:u.stealth>0?.35:1,scale:unitScale(u.d,u.star,{boss:u.maxMana===120&&u.creep})*(u.d.big||1),ring:u.creep?'#8a8a8a':mine?'#3fd27a':'#ff5a5f',sel:u===selCombat,
       hud:{hp:u.hp,maxHp:u.maxHp,mana:u.mana,maxMana:u.maxMana,shield:u.shield,mine,items:u.items,creep:u.creep,star:u.star,cnt:{rage:u.rageN||0,titan:u.titanN||0,moon:R0(u.apGain||0)}}});
   }
 } else if(inCar){
   const C=G.carousel; C.opts.forEach((o,i)=>{ if(o.taken) return; const [x,y]=carV(...optPos(C,i)); A.push({key:'co'+i+':'+o.key,opt:i,hold:.5,dex:dexOf(DEF[o.key],1),x,y,face:0,ring:COST_HEX[DEF[o.key].cost-1],scale:1,hud:{items:[o.item]}}); });
 } else {
   const who=viewedPlayer(), mine=who===me, ctx=who.id+'|'+G.phase+'|'+G.roundIdx, quiet=ctx!==synCtx, now=performance.now(); synCtx=ctx;
   const info=[], fr=++synFrame, tiers=activeTraits(who), showSyn=G.phase==='planning'||G.phase==='augment'||G.phase==='results';
   for(const k in who.board){ const u=who.board[k]; if(drag&&drag.moved&&drag.u===u){ const dm=synMem.get(u); if(dm) dm.last=fr; continue; } const [c,r]=k.split(',').map(Number); const [x,y]=cellXY(c,4+r);
     const syn=showSyn?unitTraits(u).filter(t=>(tiers[t]||0)>=1):null; let m=synMem.get(u); const entered=!m||m.last!==fr-1; if(!m){ m={n:0,t:0}; synMem.set(u,m); }
     info.push({u,k,c,r,x,y,syn,m,init:!quiet&&showSyn&&!!syn&&syn.length>0&&entered}); m.last=fr; }
   // Quien se acaba de colocar estalla con el elemento de su sinergia y lanza un destello hacia las fichas con las que la comparte (que también reaccionan)
   for(const i of info) if(i.init){ const par=info.filter(o=>o!==i&&o.syn&&o.syn.some(t=>i.syn.includes(t))); if(!par.length) continue; const sh=i.syn.filter(t=>par.some(p=>p.syn.includes(t)));
     i.m.n++; i.m.t=now; i.m.tr=sh; i.m.from=null; i.m.to=par.slice(0,4).map(p=>[p.x,p.y]);
     for(const p of par){ if(p.m.t===now) continue; p.m.n++; p.m.t=now; p.m.tr=sh.filter(t=>p.syn.includes(t)); p.m.from=[i.x,i.y]; p.m.to=null; } }
   for(const i of info){ const {u,k,x,y,syn,m}=i, st=mine?planStats(u):null, d=DEF[u.defId];
     if(syn&&syn.includes('Coloso')) sceneLinks.push([x,y]);
     A.push({key:u,u,loc:{b:k},star:u.star,still:true,syn,joinN:m.n,joinT:m.t,joinTraits:m.tr,joinFrom:m.from,joinTo:m.to,dex:dexOf(d,u.star),x,y,face:0,ring:COST_HEX[d.cost-1],sel:selected===u,scale:unitScale(d,u.star),hud:st?{items:u.items,hp:st.maxHp,maxHp:st.maxHp,mana:st.mana,maxMana:st.maxMana,mine:true,star:u.star}:{items:u.items,star:u.star}}); }
 if(G.preview&&G.phase==='planning') G.preview.forEach((cr,ci)=>{ const [gc,gr]=toGrid(1,cr.c,cr.r); const [x,y]=cellXY(gc,gr); A.push({key:'pv'+ci,dex:(cr.shiny?'shiny:':'')+cr.dex,x,y,face:0,ring:'#8a8a8a',alpha:.85,scale:(cr.boss?1.35:1)*(cr.big||1),hud:{creep:true}}); }); // clave estable: en multijugador la lista llega nueva en cada mensaje
 }
 // Minileyendas: la tuya donde la lleves; la del rival en su lado durante los combates PvP
 if(!inCar){
   A.push({key:'tac:'+me.id,tac:true,dex:tacDexC(me),trail:trailOf(me),star:tacStar(me),morph:me.mewN|0,x:TAC.x,y:TAC.y,face:Math.PI*.85,cast:TAC.castN||0,tx:TAC.fireT&&performance.now()-TAC.fireT<1100?TAC.fx:null,ty:TAC.fy,ring:'#4c8dff',scale:.72*tacSize(me),hud:{}});
   for(const o of stepOthers(inCombat)) A.push({key:'tac:'+o.p.id,tac:true,dex:tacDexC(o.p),trail:trailOf(o.p),star:tacStar(o.p),morph:o.p.mewN|0,x:o.x,y:o.y,face:o.face,cast:o.cast||0,tx:o.tx!=null?o.tx:null,ty:o.ty,ring:o.col,scale:.72*tacSize(o.p),hud:{}}); }
 else { tacOthers=[]; const C=G.carousel; for(const p of C.order){ const a=C.av[p.id]; if(!a||a.x===null) continue; const [vx,vy]=carPos(p.id,...carV(a.x,a.y)); A.push({key:'tac:'+p.id,tac:true,hold:.45,dex:tacDexC(p),trail:trailOf(p),star:tacStar(p),morph:p.mewN|0,x:vx,y:vy+geo.R*.35,face:Math.PI,ring:p===me?'#4c8dff':a.rel&&!a.done?'#3fd27a':'#8a93ad',scale:.62*tacSize(p),alpha:!a.rel&&!a.done?.55:1,hud:{}}); } }
 const benchOf=inCombat||inCar?me:viewedPlayer();
 (inCar?[]:benchOf.bench).forEach((u,i)=>{ if(!u||(drag&&drag.moved&&drag.u===u)) return; const [x,y]=benchXY(i), d=DEF[u.defId]; A.push({key:u,u,loc:{i},star:d.anvil?0:u.star,still:true,dex:dexOf(d,u.star),x,y,face:0,ring:COST_HEX[d.cost-1],sel:selected===u,scale:unitScale(d,u.star)*.9,hud:{items:u.items,star:d.anvil?0:u.star}}); });
 // En combate, la banca del rival en sus losas (reflejo de la tuya respecto al centro del campo): se ve qué tiene guardado
 const opp=inCombat&&combatOpp(); if(opp){ const cy2=cellXY(0,0)[1]+cellXY(0,7)[1]; (opp.bench||[]).forEach((u,i)=>{ if(!u||!DEF[u.defId]) return; const [x,y]=benchXY(i), d=DEF[u.defId]; A.push({key:'ob'+opp.id+':'+i+':'+u.defId+':'+u.star,still:true,dex:dexOf(d,u.star),x:geo.W-x,y:cy2-y,face:0,ring:COST_HEX[d.cost-1],scale:unitScale(d,u.star)*.9,hud:{items:u.items,star:d.anvil?0:u.star}}); }); }
 if(drag&&drag.moved){ const d=DEF[drag.u.defId]; A.push({key:drag.u,dex:dexOf(d,drag.u.star),x:drag.x,y:drag.y,face:0,drag:true,alpha:.9,ring:'#ffffff',scale:unitScale(d,drag.u.star),hud:{star:drag.u.star}}); }
 return A;
}
function draw(){
 if(!G||!geo.W) return;
 ctx.clearRect(0,0,view.W,view.H);
 const me=G.me; if(!me) return;
 if(!b3On()){ ctx.save(); ctx.fillStyle='#16203d'; ctx.fillRect(0,0,view.W,view.H); ctx.fillStyle='#fff'; ctx.font=`900 ${Math.max(14,geo.R*.5)}px Nunito,system-ui,sans-serif`; ctx.textAlign='center'; ctx.fillText('Cargando tablero 3D…',view.W/2,view.H/2); ctx.restore(); return; }
 const inCombat=G.phase==='combat'&&viewCombat(), inCar=G.phase==='carousel'&&G.carousel, playing=G.players&&G.players.length;
 const dragBoard=drag&&drag.moved&&G.phase!=='combat'&&!inCar, cell=dragBoard?hitCell(drag.x,drag.y):null, bh=drag&&drag.moved?hitBench(drag.x,drag.y):-1;
 // Menú y acceso: fondo estático (CSS), sin dibujar el campo 3D ni cargar modelos
 if(!$('menu').classList.contains('hidden')||!$('auth').classList.contains('hidden')){ ctx.clearRect(0,0,view.W,view.H); return; }
 const A=playing?sceneActors():[];
 const tP=viewedPlayer(), tsp=trainerSpots();
 const bubbles=inCar?G.carousel.order.map((p,idx)=>{ const a=G.carousel.av[p.id]; if(!a||a.x==null||a.rel||a.done) return null; const left=releaseAt(idx)-G.carousel.t; const [vx,vy]=carPos(p.id,...carV(a.x,a.y)); return {id:p.id,x:vx,y:vy+geo.R*.35,k:clamp(left/3,0,1),col:(cosD(p,'br')||{}).c||null}; }).filter(Boolean):[];
 const pads=inCar?(()=>{ const {cx,cy,rr}=carGeo(), C=G.carousel; return C.order.map((p,idx)=>{ const a=C.av[p.id]||{}, an=carAng(idx,C.order.length), [px,py]=carV(cx+Math.cos(an)*rr*1.12,cy+Math.sin(an)*rr*1.12); return {id:p.id,x:px,y:py+geo.R*.35,dim:!!(a.rel||a.done)}; }); })():[];
 const links=[]; if(sceneLinks.length>1){ const rest=sceneLinks.slice(1); let cur=sceneLinks[0]; while(rest.length){ let bi=0,bd=1e9; rest.forEach((q,i)=>{ const d=Math.hypot(q[0]-cur[0],q[1]-cur[1]); if(d<bd){bd=d;bi=i;} }); const nx=rest.splice(bi,1)[0]; links.push([cur[0],cur[1],nx[0],nx[1]]); cur=nx; } }
 B3.render({arena:playing?bgKind():'glade',car:inCar?carGeo():null,pads,links,actors:A,bubbles,orbs:playing?orbList():[],totem:playing&&G.phase!=='carousel'?{x:geo.ox-geo.R*.35,y:cellXY(0,4)[1]-geo.R*.75}:null,
   floorCount:playing&&!inCar?floorCountSpec():null,pandora:playing&&!inCar&&tP&&tP.mods&&tP.mods.pandoraBench?[BENCH-3,BENCH-2,BENCH-1]:null,interest:playing&&G.phase!=='carousel'?{x:geo.ox-geo.R*.55,y:cellXY(0,7)[1]-geo.R*.2,dy:-geo.R*.85,n2:(()=>{ const o=inCombat&&combatOpp(); return o?interestOf(o):0; })(),col2:(()=>{ const o=inCombat&&combatOpp(); return o?(cosD(o,'cr')||{}).c||null:null; })(),n:Math.min(tP.mods.maxInterest,5,Math.floor(tP.gold/10)),col:(cosD(tP,'cr')||{}).c||null}:null,tiles:playing&&!inCar&&tP?(cosD(tP,'tl')||{}).c||null:null,fx:inCombat?viewCombat().fx:[],cellPx:vXY,unitPx:unitXY,cells:{drop:dragBoard,hover:cell&&cell[1]>=4?cell[1]*7+cell[0]:-1},benchHover:bh});
 hudActors=A; hudItems=[];
 if(!playing) return;
 if(inCar) drawCarouselHud(); else { drawBoardTrainers(); drawTotemIcons(); }
 if(TAC.mark){ const k=(performance.now()-TAC.mark.t0)/500; if(k>=1) TAC.mark=null; else { const [mx,my]=scr(TAC.mark.x,TAC.mark.y,0), [,my2]=scr(TAC.mark.x,TAC.mark.y+geo.R*.5,0); ctx.save(); ctx.globalAlpha=1-k; ctx.strokeStyle='#7fe0ff'; ctx.lineWidth=3; ctx.beginPath(); ctx.ellipse(mx,my,geo.R*(.25+k*.35),Math.max(3,(my2-my)*(.5+k*.7)),0,0,7); ctx.stroke(); ctx.restore(); } }
 // De atrás adelante: si las barras se solapan, la del Pokémon más cercano queda encima
 for(const a of A.filter(a=>a.base).sort((p,q)=>p.base[1]-q.base[1])) drawHud(a);
 if(inCombat) drawFxHud(viewCombat());
}
// Textos flotantes, carteles de habilidad y destellos (lo demás lo pinta el 3D)
function drawFxHud(cb){
 const R=geo.R;
 for(const f of cb.fx){
   if(f.t<0) continue; const p=f.t/f.life; ctx.save();
   switch(f.type){
    case 'text': { const [x0,y0]=vXY(f.c,f.r), [x,y]=scr(x0,y0,1.9); ctx.globalAlpha=1-p*p; const pop=f.big?1.45+.5*Math.max(0,1-f.t/.12):1; ctx.font=`900 ${Math.max(10,R*.36*pop)}px Nunito,system-ui,sans-serif`; ctx.textAlign='center'; ctx.lineWidth=3; ctx.strokeStyle='rgba(0,0,0,.7)'; ctx.fillStyle=f.color; const yy=y-p*R*.9; ctx.strokeText(f.txt,x+f.dx,yy); ctx.fillText(f.txt,x+f.dx,yy); break; }
    case 'banner': { if(f.u.dead&&p>.3) break; const [x0,y0]=unitXY(f.u), [x,y]=scr(x0,y0,2.5); const a=p<.1?p/.1:p>.75?(1-p)/.25:1; ctx.globalAlpha=a; ctx.font=`900 ${Math.max(12,R*.44)}px Nunito,system-ui,sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
      const txt=(f.icon?f.icon+' ':'')+f.txt, w=ctx.measureText(txt).width+R*.7, h=R*.62, by=y-p*R*.25; ctx.fillStyle='rgba(15,20,40,.88)'; ctx.strokeStyle=f.color; ctx.lineWidth=2.5; rrPath(ctx,x-w/2,by-h/2,w,h,h/2); ctx.fill(); ctx.stroke(); ctx.fillStyle='#fff'; ctx.fillText(txt,x,by+1); break; }
    case 'flash': { ctx.globalAlpha=(1-p)*.25; ctx.fillStyle=f.color; ctx.fillRect(0,0,view.W,view.H); break; }
   }
   ctx.restore();
 }
}
function drawCarouselHud(){
 const C=G.carousel, R=geo.R;
 const meAv=C.av[G.me.id];
 if(meAv&&meAv.target!=null&&!meAv.done&&C.opts[meAv.target]&&!C.opts[meAv.target].taken){ const [ox,oy]=carV(...optPos(C,meAv.target)), [x,y]=scr(ox,oy,0), [,y2]=scr(ox,oy+R*.9,0); ctx.save(); ctx.strokeStyle='#ffd75e'; ctx.lineWidth=3; ctx.setLineDash([6,5]); ctx.lineDashOffset=-performance.now()/40; ctx.beginPath(); ctx.ellipse(x,y,R*.95,Math.max(4,y2-y),0,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
 const now=performance.now();
 // Los entrenadores corren hacia el Pokémon que eligen (de atrás adelante para que se solapen bien)
 const list=C.order.map(p=>{ const a=C.av[p.id]; if(!a||a.x===null) return null;
   let x=a.x, y=a.y; if(C.mirror&&a.px!=null){ const k=clamp((now-a.at)/170,0,1); x=a.px+(a.x-a.px)*k; y=a.py+(a.y-a.py)*k; }
   if(!C.mirror){ if(a.lx!=null&&Math.abs(x-a.lx)>.3) a.face=x<a.lx?-1:1; a.moving=a.lx!=null&&Math.hypot(x-a.lx,y-a.ly)>.2; a.lx=x; a.ly=y; }
   else a.moving=a.px!=null&&Math.hypot(a.x-a.px,a.y-a.py)>.5;
   [x,y]=carV(x,y); return {p,a,x,y}; }).filter(Boolean).sort((u,v)=>u.y-v.y);
 for(const {p,a,x,y} of list){
   const locked=!a.rel&&!a.done, mine=p===G.me;
   const [sx,sy,ss]=drawTrainer(x,y+R*.35,trainerOf(p),{noSprite:true,s:R*1.7,ring:mine?'#4c8dff':a.rel&&!a.done?'#3fd27a':'#8a93ad',face:a.face||1,mode:a.moving?'run':a.done?'cheer':'idle',seed:p.id*.7,dim:locked,label:(p.name.length>10?p.name.slice(0,9)+'…':p.name)+(locked?' 🔒':''),emoji:p.emoji});
   if(a.carry&&DEF[a.carry.key]){ const dx=dexOf(DEF[a.carry.key],1), u=B3.portrait(dx); const e=u?loadImg('pt:'+dx,u):null; const s=ss*.65; if(e&&e.status==='ok') ctx.drawImage(e.img,sx+ss*.1,sy-ss*.95-s*.5,s,s); }
 }
 const myIdx=C.order.indexOf(G.me), myAv=C.av[G.me.id];
 const msg=!myAv?'Mirando el carrusel':myAv.done?'Ya tienes tu Pokémon: sigue moviéndote con clic derecho mientras eligen los demás':myAv.rel?'¡Libre! Clic derecho para moverte y pasa por encima de un Pokémon':`Tu barrera se abre en ${Math.max(0,Math.ceil(releaseAt(myIdx)-C.t))}s · menos vida = sales antes`;
 ctx.save(); ctx.font=`900 ${Math.max(12,R*.42)}px Nunito,system-ui,sans-serif`; ctx.textAlign='center'; ctx.textBaseline='top'; ctx.lineWidth=4; ctx.strokeStyle='rgba(0,0,0,.45)'; ctx.fillStyle='#fff'; const mx=view.rect?view.rect.x+view.rect.w/2:view.W/2, my=view.rect?view.rect.y+8:8; ctx.strokeText(msg,mx,my); ctx.fillText(msg,mx,my); ctx.restore();
}
function renderFeed(){ return; // el registro de habilidades ya no se muestra
 const box=$('feed'); const cb=G&&G.phase==='combat'?viewCombat():null;
 if(!cb){ if(!box.classList.contains('hidden')){ box.classList.add('hidden'); lastFeedV=-1; } return; }
 box.classList.remove('hidden');
 if(cb.feedV===lastFeedV&&cb===renderFeed.cb) return; lastFeedV=cb.feedV; renderFeed.cb=cb;
 const mySide=curFlip()?1:0;
 $('feedList').innerHTML=cb.feed.length?cb.feed.slice(-6).reverse().map(e=>{
   const parts=[]; if(e.d>0) parts.push(`${e.d} de daño${e.h>1?` a ${e.h} enemigos`:''}`); if(e.hl>0) parts.push(`cura ${e.hl}`); if(e.sh>0) parts.push(`escudo ${e.sh}`); if(e.st) parts.push('aturde'); if(e.k>0) parts.push(`${e.k} derrotado${e.k>1?'s':''}`);
   return `<li class="${e.s===mySide?'':'foe'}"><span>${e.ic}</span><span><b>${esc(e.n)}</b> usó <span class="mv">${esc(e.mv)}</span> <span class="dt">${parts.join(' · ')}${esc(e.x||'')}</span></span></li>`;
 }).join(''):'<li><span class="dt">Las habilidades aparecerán aquí cuando un Pokémon llene su barra de maná (azul).</span></li>';
}
function tick(){
 const now=performance.now(); const dt=Math.min(.1,(now-(NET.lastTick||now))/1000); NET.lastTick=now;
 if(G&&G.players&&G.players.length&&!G.over){
   if(G.view&&G.view.board&&(G.phase==='combat'||G.phase==='carousel')){ G.view=null; renderUI(); }
   if(G.mirror){
     if(G.phase==='planning'&&isFinite(G.timer)) G.timer=Math.max(0,G.timer-dt);
     stepVisual(dt,false);
   } else {
     if(G.phase==='planning'){ if(isFinite(G.timer)&&(G.mp||!modalOpen())){ G.timer-=dt; if(G.timer<=0) startCombat(); } }
     if(G.phase==='augment'&&G.augDeadline&&Date.now()>G.augDeadline) autoAugs();
     if(G.phase==='carousel'&&(G.mp||!modalOpen())) updateCarousel(dt);
     if(G.phase==='combat') stepVisual(dt,true);
   }
   updatePhase();
 }
 if(NET.mode==='host') hostNetTick();
}
function stepVisual(dt,isHost){
 const cb=G.combat;
 // Preparación (PREP_T): los combates aún no avanzan mientras las fichas se dan la vuelta; al acabar sale «¡Combate!»
 const prep=G.prepT>0; if(prep){ G.prepT-=dt*G.speed; if(G.prepT<=0) combatBanner(); }
 if(cb&&!cb.done&&!prep){ if(isHost&&document.hidden) simulate(cb); else { G.acc+=dt*G.speed; let n=0; while(G.acc>=DT&&n++<200){ stepWithEv(cb); G.acc-=DT; if(cb.done) break; } } }
 if(cb&&document.hidden) ageFx(cb,dt*Math.min(G.speed,2));

 if(isHost){ dropKillOrbs(); payCombatGold(false); }
 // El combate que estás mirando avanza al mismo ritmo que el tuyo
 const v=G.view&&G.view.cb?G.view:null;
 if(v){ if(!v.cb.done&&!prep){ v.acc+=dt*G.speed; let n=0; while(v.acc>=DT&&n++<200){ stepWithEv(v.cb); v.acc-=DT; if(v.cb.done) break; } }
   if(document.hidden) ageFx(v.cb,dt*Math.min(G.speed,2)); }
 if(isHost&&!G.resolving&&(!cb||cb.done)&&(!v||v.cb.done)&&Date.now()>=(G.resolveNotBefore||0)){ G.resolving=true; later(resolveRound,cb?5000+END_T*1000:300); } // 5 s para recoger orbes y vender, más la finalización (END_T)
}
// Contador de FPS (F3): media, peor fotograma y calidad del 3D, cada medio segundo
let fpsOn=false, fpsT=[];
function toggleFps(){ fpsOn=!fpsOn; let el=$('fpsTag'); if(!el){ el=document.createElement('div'); el.id='fpsTag'; el.className='fpsTag'; document.body.appendChild(el); } el.hidden=!fpsOn; fpsT=[]; }
// El bucle de dibujo nunca muere: una excepción dentro de un fotograma se registra (y se avisa una vez) y el siguiente fotograma sigue.
// Si muriera, el lienzo dejaría de pintarse (se vería el fondo gris) y la partida parecería colgada.
function frame(){ try{ frameBody(); }catch(e){ frameErr(e); } requestAnimationFrame(frame); }
function frameErr(e){ const m=String(e&&e.stack||e).slice(0,300); frameErr.n=(frameErr.n||0)+1; if(frameErr.last!==m){ frameErr.last=m; console.error('Error al dibujar:',e); try{ localStorage.setItem('pt_err',new Date().toISOString()+' '+m); }catch(x){} if(frameErr.n<=1&&typeof toast==='function') toast('Error al dibujar; si la pantalla se queda gris, recarga (F5)'); } }
function frameBody(){
 if(fpsOn){ const n=performance.now(); fpsT.push(n); while(fpsT.length&&n-fpsT[0]>1000) fpsT.shift(); if(!frame.fpsU||n-frame.fpsU>500){ frame.fpsU=n; let worst=0; for(let i=1;i<fpsT.length;i++) worst=Math.max(worst,fpsT[i]-fpsT[i-1]); const inf=window.B3&&B3.info; $('fpsTag').textContent=fpsT.length+' FPS · peor '+worst.toFixed(0)+' ms'+(window.B3?' · calidad '+B3.quality+(inf?' · '+inf.calls+' dibujos':''):''); } }
 const fnow=performance.now(), fdt=Math.min(.1,(fnow-(frame.t||fnow))/1000); frame.t=fnow; stepTac(fdt);
 if(G&&G.phase==='combat'){ const k=fdt*Math.min(G.speed||1,2); ageFx(G.combat,k); if(G.view&&G.view.cb&&G.view.cb!==G.combat) ageFx(G.view.cb,k); }
 if(G) draw();
 try{ Scene.frame(performance.now()); }catch(e){ /* la escena del menú nunca debe parar el bucle del juego */ }
 if(G&&G.players&&G.players.length){ renderFeed();
   // El registro de daño sigue al combate que se ve; al acabar se queda con el último hasta que empieza el siguiente
   const vc=G.phase==='combat'&&viewCombat(); if(vc&&vc!==statsCb){ statsCb=vc; statsSide=curFlip()?1:0; renderDmg(); }
   if(vc&&performance.now()-lastDmgT>400){ lastDmgT=performance.now(); renderDmg(); }
   if(selCombat&&performance.now()-lastCardT>250){ lastCardT=performance.now(); renderCard(); } }
 Music.play(wantedSong());
}

/* ---------- paneles ---------- */
// Vida y maná de cada Pokémon del tablero tal y como empezarían el combate (se recalcula al cambiar algo)
// Pokémon de un tablero tal y como empezarían el combate: igual que addTeamSnap, aumentos incluidos
// (así la ficha y las barras muestran, por ejemplo, la vida acumulada de «Pokémon favorito»)
function prepTeam(p){ ensureGloves(p);
 const Tt=traitTiers(p), units=[], byUid=new Map();
 for(const k in p.board){ const [c,r]=k.split(',').map(Number); const u=makeCombatUnit(p.board[k],p,Tt,0); [u.c,u.r]=toGrid(0,c,r); u.pc=u.c; u.pr=u.r; u.bk=k; units.push(u); byUid.set(p.board[k].uid,u); }
 const cb={t:0,units,fx:[],feed:[],feedV:0,pend:[],kh:[[],[]],done:false,started:false,visual:false,gold:[0,0],rng:mulberry32(1)};
 try{ augCombat(cb,0,units,G.mirror&&p===G.me?(p.agSnap||[]):augSnap(p)); }catch(e){}
 return byUid;
}
let statsCache={v:-1,team:null};
function prepUnit(inst){
 if(statsCache.v!==G.uiV) statsCache={v:G.uiV,team:null};
 if(!statsCache.team) try{ statsCache.team=prepTeam(G.me); }catch(e){ statsCache.team=new Map(); }
 return statsCache.team.get(inst.uid)||null;
}
function planStats(u){
 const cu=prepUnit(u); if(cu) return {maxHp:cu.maxHp,mana:cu.mana,maxMana:cu.maxMana};
 try{ const b=makeCombatUnit(u,G.me,traitTiers(G.me),0); return {maxHp:b.maxHp,mana:b.mana,maxMana:b.maxMana}; }catch(e){ return {maxHp:1,mana:0,maxMana:99999}; }
}
function renderUI(){ if(HEADLESS||!G||G.auto||!G.players||!G.players.length) return; G.uiV=(G.uiV||0)+1; soundWatch(); renderIslands(); renderTop(); renderShop(); renderTraits(); renderPlayers(); renderItems(); renderCard(); renderLog(); layout(); if(G.me.picks&&G.me.picks.length&&!modalOpen()) setTimeout(showPick,0); else if((G.me.reveals||[]).some(x=>x[0]>(G.rvSeen||0))&&!modalOpen()) setTimeout(showReveal,0); }
// Iconos de las rondas: salvajes (garra), PvP (espadas cruzadas) y carrusel
const ROUND_SVG={pve:'<svg viewBox="0 0 24 24"><path d="M6 3l2.2 7.6L4 9l3.4 6.6L5 21l5-4 2 5 2-5 5 4-2.4-5.4L20 9l-4.2 1.6L18 3l-6 5z"/></svg>',pvp:'<svg viewBox="0 0 24 24"><path d="M3 3l7.5 7.5-1.4 1.4L2 4.8V3zm18 0v1.8l-7.1 7.1-1.4-1.4L20 3zM5 14l5 5-2 2-1.5-1.5L4 22l-2-2 2.5-2.5L3 16zm14 0l2 2-1.5 1.5L22 20l-2 2-2.5-2.5L16 21l-2-2z"/></svg>',carousel:'<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 1 8.5 6h-3a6.2 6.2 0 0 0-11 0h-3A9 9 0 0 1 12 3zm0 18a9 9 0 0 1-8.5-6h3a6.2 6.2 0 0 0 11 0h3A9 9 0 0 1 12 21zm0-12a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/></svg>'};
let lastBeep=-1;
// Cartel «¡Combate!» cuando acaba la preparación y empieza a pelear (stepVisual)
function combatBanner(){ const el=$('cbBanner'); if(!el) return; el.innerHTML='<img src="img/ui/combate.webp" alt=""><span>¡Combate!</span>'; /* emblema (escudo y espadas) del mismo blanco azulado que las letras */ el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); clearTimeout(combatBanner.t); combatBanner.t=setTimeout(()=>el.classList.remove('on'),1600); }
function updatePhase(){
 let t=''; // Temporizador y barra de la planificación; en los últimos 5 s suena un aviso cada segundo
 const plan=G.phase==='planning'&&isFinite(G.timer), sec=plan?Math.max(0,Math.ceil(G.timer)):-1, tot=PLAN_T;
 // En combate, cuenta atrás del combate que se está viendo (el tuyo o el que miras), como la barra de TFT
 const vc=G.phase==='combat'&&viewCombat(), left=vc&&!vc.done?Math.max(0,COMBAT_T-vc.t):-1, csec=left>=0?Math.ceil(left):-1;
 $('rbTimer').textContent=plan?sec:csec>=0?csec:G.phase==='combat'?'⚔':'·';
 // Reloj circular: se vacía durante la planificación y durante el combate
 const frac=plan?clamp(G.timer/tot,0,1):left>=0?clamp(left/COMBAT_T,0,1):G.phase==='combat'?1:0; $('rbRing').setAttribute('stroke-dashoffset',(100.5*(1-frac)).toFixed(1)); $('roundBar').classList.toggle('hurry',plan&&sec<=5||csec>=0&&csec<=5);
 const alive=G.players.filter(p=>p.alive).length; $('rbAlive').textContent=`👤 ${alive}/${G.players.length}`;
 if(plan&&sec<=5&&sec>0&&sec!==lastBeep&&!modalOpen()){ lastBeep=sec; Music.hurry(sec); } if(!plan) lastBeep=-1;
 switch(G.phase){
  case 'planning': t=(isFinite(G.timer)?`Planificación · ${Math.max(0,Math.ceil(G.timer))}s`:'Planificación')+(G.mp&&G.me&&G.me.ready?' · esperando al resto':''); break;
  case 'combat': t=G.myOpp?`Combate contra ${G.myOpp}`:'Combates en curso'; break;
  case 'carousel': t='Carrusel'; break; case 'augment': t='Elige un aumento'; break;
  case 'results': t='Resultados'; break; case 'over': t='Fin de la partida'; break; default: t='Esperando al anfitrión…';
 }
 if(!G.me.alive&&G.phase!=='over') t+=' · espectador';
 if(t!==lastPhaseTxt){ $('phase').textContent=t; lastPhaseTxt=t; }
}
// Pokémon principal de una ronda de salvajes (el de más vida) y nombre de cada ronda para el planificador
const pveBoss=R=>{ const w=pveWave(R.s,R.n); return w.reduce((a,b)=>b.hp>a.hp?b:a,w[0]); };
function roundName(R){
 if(R.type==='carousel') return 'Carrusel';
 if(R.type==='pve'){ const w=pveWave(R.s,R.n), b=pveBoss(R), n=w.filter(c=>c.name===b.name).length; return `${b.name} salvaje${n>1?'s':''}`; }
 return R.aug>=0?'Combate y aumento':'Combate PvP';
}
function renderTop(){
 const R=G.round; if(!R) return;
 $('stage').textContent=`Fase ${R.s}-${R.n}`; // solo la fase (qué ronda es ya lo dicen los iconos y su descripción al pasar el ratón)
 // Una ficha por ronda de la fase, sin círculos y del mismo tamaño: espadas (PvP), dos cartas (PvP con elección de aumento), el icono del carrusel y el sprite
 // del Pokémon salvaje (PvE). La ronda actual va en dorado; las PvP jugadas, en verde si ganaste y en rojo si perdiste (G.me.rres; en multijugador llega en priv.rr)
 const rres=(G.me&&G.me.rres)||{}, fase=ROUNDS.filter(x=>x.s===R.s); $('pills').classList.toggle('few',fase.length<5); // fase 1 (3 rondas): juntas en el centro, no repartidas a lo ancho
 $('pills').innerHTML=fase.map(x=>{ const boss=x.type==='pve'?pveBoss(x):null, res=x.type==='pvp'?rres[ROUNDS.indexOf(x)]:null, cur=x===R;
   const tint=res==='W'?'gana':res==='L'?'pierde':cur?'oro':'neutra', kind=x.type==='carousel'?'carrusel':x.aug>=0?'cartas':'espadas';
   // El salvaje con el mismo retrato de la Pokédex que la ficha (public/dex, render de 128 px): el sprite pixelado de PokeAPI no se distinguía a este tamaño
   const dn=boss?String(boss.dex).split('/').pop():'', ico=boss?`<img src="${DEX_FILES.has(+dn)?dexUrl(dn):SPRITE(boss.dex)}" alt="">`:`<img class="ico" src="img/ui/${kind}-${tint}.webp" alt="">`;
   return `<span class="pill rt-${x.type} ${cur?'cur':''} ${x.n<R.n?'past':''} ${res?'res-'+res:''}" title="${x.s}-${x.n}: ${esc(roundName(x))}${res?(res==='W'?' · ganado':' · perdido'):''}${x.aug>=0?' · aumento '+TIER_NAME[G.augTiers[x.aug]]:''}">${ico}</span>`; }).join('');
 lastPhaseTxt=''; updatePhase();
}
// Iconos de las sinergias: un símbolo de un solo color (SVG 24×24) que va dentro de un hexágono metálico, al estilo de TFT
const TRAIT_SVG={
 'Fuego':'M12 2c.6 3.6 4.8 5.6 4.8 10.6a4.8 4.8 0 0 1-9.6 0c0-2.4 1.3-3.9 2.4-5.5.4 1.9 1.4 3 2.6 3.4.9-2.4.4-5.4-.2-8.5z',
 'Agua':'M12 2.5C9.2 7 6 10.2 6 14.4a6 6 0 0 0 12 0C18 10.2 14.8 7 12 2.5zm-2.6 11.2c.3 1.6 1.2 2.6 2.6 3-1.9.4-3.2-1-2.6-3z',
 'Planta':'M4 20.5C4 10.8 10.4 4 20.5 3.5 20 13.6 13.2 20 4 20.5zm1.6-1.6 9-9-.7-.7-9 9z',
 'Eléctrico':'M13.5 2 4.5 13.5h6l-1.5 8.5 10-12h-6.2z',
 'Psíquico':'M12 5C6.5 5 2.5 12 2.5 12S6.5 19 12 19s9.5-7 9.5-7S17.5 5 12 5zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z',
 'Roca':'M8 3.5 3 11l2.6 9.5h12.8L21 12l-4.6-8.5zm1 2h3.6l-2.4 5.2L6 12z',
 'Dragón':'M3 21c4.2-1.4 7-5 7.6-10.2L14 15c1.6-1.8 2.4-4.4 2-7.4 1.8 1.4 3 3.6 3 6.4 2-2.4 2.4-6.6 0-10.5-1.6 2-3.8 2.6-6.6 2.2-4.4-.6-8.2 2.6-8.8 7.3-.4 3.2.2 5.8 2.4 8z',
 'Fantasma':'M12 2.5a7 7 0 0 0-7 7v12l2.3-2 2.4 2 2.3-2 2.3 2 2.4-2 2.3 2v-12a7 7 0 0 0-7-7zM9.5 8.5a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2zm5 0a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z',
 'Hada':'M12 2l2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3zM19 2l.8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8z',
 'Normal':'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 3.2a5.8 5.8 0 1 1 0 11.6 5.8 5.8 0 0 1 0-11.6zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
 'Acero':'M12 2l8.7 5v10L12 22l-8.7-5V7zm0 6.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z',
 'Siniestro':'M14.5 2.5a9.5 9.5 0 1 0 7 15.4A8 8 0 0 1 14.5 2.5z',
 'Lucha':'M7 6.5a2 2 0 0 1 4 0V8a2 2 0 0 1 4 0v.5a2 2 0 0 1 4 .5v5.5c0 4-3 7-7 7s-7-3-7-7V10a2 2 0 0 1 2-2zM9 13h6.5v-1.5H9z',
 'Guardián':'M12 2 4 5.2v6c0 5 3.4 9.4 8 10.8 4.6-1.4 8-5.8 8-10.8v-6zm0 3.2 4.8 2v4c0 3.2-2 6.2-4.8 7.4z',
 'Coloso':'M2 20.5 8.5 7l3.8 6.2L15 9l7 11.5zm6.5-9.2-1.6 3.4h3.4z',
 'Peleador':'M14 2.5h1.5a5 5 0 0 1 5 5v4a5 5 0 0 1-5 5h-1.5a4.4 4.4 0 0 1-4.4-4.4V6.9A4.4 4.4 0 0 1 14 2.5zM6.4 7.8a2.6 3.7 0 1 1 0 7.4 2.6 3.7 0 1 1 0-7.4zM9.4 17.4h11v4.1h-11z', // guante de boxeo: puño, pulgar y puño de la manga
 'Tirador':'M11 1.5h2v4h-2zm0 17h2v4h-2zM1.5 11h4v2h-4zm17 0h4v2h-4zM12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zm0 3a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
 'Hechicero':'M13.6 2C10 4.6 6.8 10.6 6 17h12c-.6-3.4-1.6-6.2-1-9.2-1 .8-2.2.8-3.2-.2 1.2-1.8 1.2-3.6-.2-5.6zM2.5 18h19v3.5h-19z',
 'Asesino':'M12 1.5l3 10.5h-2v4h3.5v2H13v4.5h-2V18H7.5v-2H11v-4H9z',
 'Sanador':'M12 21.3 3.6 12.9A5.2 5.2 0 0 1 12 6a5.2 5.2 0 0 1 8.4 6.9zM11 9.5v2.5H8.5v2H11v2.5h2V14h2.5v-2H13V9.5z',
 'Cazatesoros':'M12 2 3 9l9 13 9-13zm0 3.2L17.2 9H6.8z',
 'Legendario':'M3 17.5 2 6.5l5.5 4.5L12 3.5l4.5 7.5L22 6.5l-1 11zM3 19h18v2.5H3z',
 'Depredadores':'M2.5 5.5 6 2l7.5 7.5-1.4 1.4zm19 0L18 2l-7.5 7.5 1.4 1.4zM5 14.5l4.5 4.5L7 21.5l-1.6-1.6-2.4 2.4L1.6 21l2.4-2.4L2.5 17zm14 0L21.5 17 20 18.6l2.4 2.4L21 22.3l-2.4-2.4-1.6 1.6L14.5 19zM12 8.4l3.6 3.6-3.6 3.6L8.4 12z',
 'Potencial Evolutivo':'M12 21v-7m0 0c0-4.5 3-7.5 8-8-.2 4.8-3.3 8-8 8zm0-2c0-3.4-2.4-5.8-6.5-6.2.2 3.6 2.6 6 6.5 6.2z',
 'Team Rocket':'M5.5 3H13a5.5 5.5 0 0 1 2.2 10.5L19.5 21h-4.2l-3.8-7H9.2v7H5.5zm3.7 3.3v4.5H13a2.25 2.25 0 0 0 0-4.5z',
};
const traitIcon=t=>TRAIT_SVG[t]?`<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${TRAIT_SVG[t]}"/></svg>`:(TRAITS[t]?TRAITS[t].icon:'');
// Mientras llega el retrato 3D se ve una Poké Ball (nunca un sprite 2D)
const BALL_IMG="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='40' fill='%23f4f4f4' stroke='%231a1a22' stroke-width='6'/%3E%3Cpath d='M10 50a40 40 0 0 1 80 0z' fill='%23e8402e' stroke='%231a1a22' stroke-width='6'/%3E%3Ccircle cx='50' cy='50' r='11' fill='%23f4f4f4' stroke='%231a1a22' stroke-width='6'/%3E%3C/svg%3E";
// Retratos (public/art): sprites de Pokémon GO compuestos con un aura de sus colores, el Pokémon a la derecha (centro en el 68 % del ancho y el 52 % del alto) y la izquierda oscura para sinergias y nombre (retrato.js en la skill de recursos). Sin cargar modelos 3D
// ART_FOCUS: [x %, y %, zoom] del punto que la carta coloca a la derecha; todos los retratos comparten encuadre
// Versión de los retratos: las imágenes se guardan 7 días en el navegador con el mismo nombre; al cambiarlos hay que subir este número para que se descarguen de nuevo
const ART_V=3;
// Formato de los retratos: AVIF (un tercio menos que WebP con la misma calidad); si el navegador no lo entiende (Safari < 16.4…), WebP. Ver artFormat()
let ART_EXT='avif';
const ART_FOCUS={}, ART_DEF=[68,50,1,.87];   // 4.º valor: escala mínima respecto al ancho (.87 = el retrato entero, sin ampliar de más)
const shopArtKey=k=>k==='eevee'&&G.me&&G.me.eeveeForm&&DEF[G.me.eeveeForm]?G.me.eeveeForm:k;
const CARD_ART=Object.fromEntries('abra absol aerodactyl articuno bagon beldum bellsprout bulbasaur caterpie chansey charmander chikorita clefairy cleffa cubone darkrai diglett ditto doduo dratini drowzee duskull eevee ekans electabuzz elekid espeon exeggcute farfetchd flareon gastly geodude gible gimmighoul giratina goldeen grimer groudon growlithe hatenna hitmonchan hitmonlee hooh horsea houndour igglybuff jigglypuff jolteon jynx kabuto kangaskhan koffing krabby kyogre lapras larvitar leafeon lickitung litwick lugia machop magikarp magmar magnemite mankey meowth mew mewtwo mimejr misdreavus moltres mrmime munchlax nidoranf nidoranm oddish omanyte onix paras pichu pidgey pinsir poliwag ponyta porygon psyduck ralts rattata rayquaza rhyhorn riolu rowlet sableye sandshrew scyther seel shellder shinx slowpoke snorlax spearow squirtle staryu sylveon tangela tauros tentacool timburr togepi turtwig umbreon vaporeon venonat voltorb vulpix weedle zapdos zorua zubat'.split(' ').map(k=>[k,`art/${k}.${ART_EXT}?v=${ART_V}`])); // cada ilustración muestra la forma que sale en la tienda (los de coste 4, su 2.ª forma)
const tacKey=p=>TACS[p&&p.tac]?p.tac:'charmander';
// Cabezas, minimapa y menú usan la miniatura (224 px, ~5 KB; la ilustración completa de la tienda pesa hasta 43 KB). Si falla (CDN y luego nuestro servidor), se muestra el sprite de la Pokédex en vez de una imagen rota o de cargar un modelo 3D
const artThumb=k=>(window.ASSET_BASE||'')+'art/t/'+k+'.'+ART_EXT+'?v='+ART_V;
const ART_PRE=new Set();
function preloadArt(keys){ for(const k of keys){ if(ART_PRE.has(k)||!CARD_ART[k]) continue; ART_PRE.add(k); const im=new Image(); im.decoding='async'; im.src=artThumb(k); } } // las 7 minileyendas ya están en caché cuando salen en la lista de jugadores
const dexUrl=dex=>(window.ASSET_BASE||'')+'dex/'+String(dex).split('/').pop()+'.png';
const artImg=k=>CARD_ART[k]?`<img src="${artThumb(k)}" alt="" class="artPic" decoding="async" data-dex="${TACS[k]?TACS[k].dex[0]:dexOf(DEF[k],1)}">`:portraitImg(TACS[k]?TACS[k].dex[0]:dexOf(DEF[k],1));
// Tipo elemental de un Pokémon: pinta el fondo de su carta
const ELEMS=['Fuego','Agua','Planta','Eléctrico','Psíquico','Roca','Dragón','Fantasma','Hada','Normal','Acero','Siniestro','Lucha'];
const elemOf=d=>(d&&d.traits||[]).find(t=>ELEMS.includes(t))||'Normal';
// Retrato 3D (la cara del modelo); mientras se genera, el sprite 2D. Cuando llega, se cambia en todas las imágenes de ese Pokémon
// Retratos pedidos antes de que cargue el módulo 3D: se piden en cuanto esté listo
const portraitWait=new Set();
if(!HEADLESS) window.addEventListener('b3ready',()=>{ for(const d of portraitWait) portraitImg(d); portraitWait.clear(); });
// Retratos pequeños (ficha, lista de daño, formas): el sprite de public/dex (~3 KB, instantáneo) en vez de renderizar el modelo 3D, que obligaba a descargar el .glb (50-460 KB) y mostraba una Poké Ball girando hasta entonces. Solo los que no tienen sprite siguen con el 3D
const DEX_FILES=new Set([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,172,173,174,175,176,196,197,200,208,212,228,229,230,239,246,247,248,249,250,280,281,282,302,355,356,359,371,372,373,374,375,376,382,383,384,387,388,389,403,404,405,429,439,443,444,445,446,447,448,462,464,466,468,470,471,477,487,491,532,533,534,570,571,607,608,609,700,722,723,724,856,857,858,999,1000]);
function portraitImg(dex){ const n=String(dex).split(/[:/]/).pop(); if(DEX_FILES.has(+n)) return `<img src="${dexUrl(n)}" alt="" decoding="async" data-sp="${n}" class="dexPic">`;
 if(!(window.B3&&B3.portrait)) portraitWait.add(dex);
 const url=window.B3&&B3.portrait?B3.portrait(dex,u=>{ if(u) document.querySelectorAll(`img[data-pdex="${dex}"]`).forEach(im=>{ im.src=u; im.classList.remove('loadingBall'); }); }):null;
 return url?`<img src="${url}" alt="">`:`<img src="${BALL_IMG}" alt="" class="loadingBall" data-pdex="${dex}">`;
}
function renderShop(){
 const me=G.me; $('shopPanel').classList.toggle('first',firstRound());
 $('lvl').textContent=me.level;
 $('xpTxt').textContent=me.level>=10?'Máx.':`${me.xp}/${XP_NEED[me.level]}`;
 $('xpbar').style.width=me.level>=10?'100%':(me.xp/XP_NEED[me.level]*100)+'%';
 { const need=XP_NEED[me.level], cut=[]; if(me.level<10) for(let x=need%4||4;x<need;x+=4) cut.push(x/need*100);
   $('xpbar').parentElement.style.setProperty('--sep',cut.length?'linear-gradient(90deg,'+cut.map(p=>`transparent calc(${p}% - 1px),rgba(6,8,18,.9) calc(${p}% - 1px) calc(${p}% + 1px),transparent calc(${p}% + 1px)`).join(',')+')':'none'); }
 $('gold').textContent=me.gold;
 $('odds').innerHTML=SHOP_ODDS[me.level].map((o,i)=>`<span style="color:${COST_HEX[i]}" title="Coste ${i+1}">${o}%</span>`).join('');
 $('xpBtn').disabled=(me.gold<xpCost(me)&&!xpByHp(me))||me.level>=10||!me.alive; { const hp=xpByHp(me); $('xpCostTxt').textContent=hp?me.mods.xpHp:xpCost(me); $('xpCoin').classList.toggle('hp',!!hp); $('xpBtn').title=hp?`Comprar 4 de XP por ${me.mods.xpHp} de vida (tecla F)`:`Comprar 4 de XP por ${xpCost(me)} de oro (tecla F)`; }
 { const fr=me.freeRerolls>0; $('rrCostTxt').textContent=fr?`Gratis${me.freeRerolls>1?' ×'+me.freeRerolls:''}`:2; $('rrCoin').style.display=fr?'none':''; }
 $('rerollBtn').disabled=(me.freeRerolls<=0&&me.gold<2)||!me.alive;
 $('lockBtn').textContent=me.locked?'🔒':'🔓'; $('lockBtn').setAttribute('aria-pressed',me.locked);
 const owned={}, have=new Set(), two={}; for(const u of allUnits(me)){ have.add(u.baseId); if(u.star===1) owned[u.baseId]=(owned[u.baseId]||0)+1; if(u.star===2) two[u.baseId]=(two[u.baseId]||0)+1; }
 // Comprarla completaría un 2★ (y, si ya hay dos 2★, un 3★)
 const need=k=>me.mods.cheapCombine&&DEF[k].cost===1?1:2, upTo=k=>(owned[k]||0)>=need(k)?((two[k]||0)>=need(k)?3:2):0;
 // Solo se rehacen las cartas si cambia algo (así no parpadean los retratos)
 const key=(me.eeveeForm||'')+me.shop.map((k,i)=>k?k+(canBuy(me,i)&&me.alive?'+':'-')+(owned[k]||0)+(have.has(k)?'h':'')+upTo(k):'_').join();
 if(key!==renderShop.key){ renderShop.key=key;
   // Precarga los modelos 3D de la tienda y de la siguiente evolución de lo que tienes, para que no haya esperas
   if(window.B3&&B3.preload) B3.preload([...me.shop.filter(k=>k&&DEF[k]).map(k=>dexOf(DEF[k],1)),...allUnits(me).map(u=>dexOf(DEF[u.defId],Math.min(3,u.star+1)))]);
   $('cards').innerHTML=me.shop.map((k,i)=>{
     if(!k||!DEF[k]) return `<div class="card empty"></div>`;
     const d=DEF[k], can=canBuy(me,i)&&me.alive, ak=shopArtKey(k), fo=CARD_ART[ak]&&(ART_FOCUS[ak]||ART_DEF);
     return `<button class="card c${d.cost} ${fo?'v2':''} ${can?'':'off'} ${have.has(k)?'owned':''}" data-i="${i}" data-tip="shop:${k}" aria-label="Comprar ${d.name} por ${d.cost}">
       ${fo?`<span class="art v2art"><img src="${CARD_ART[ak]}" alt="" style="--fx:${fo[0]/100};--fy:${fo[1]/100};--z:${fo[2]};--zr:${(fo[3]||Math.min(1.6,Math.max(1,52/fo[0]))).toFixed(2)}"></span>`:CARD_ART[shopArtKey(k)]?`<span class="art cardArt" style="background-image:url('${CARD_ART[shopArtKey(k)]}')"></span>`:`<span class="art bg-${elemOf(d)}"><i class="fx"></i></span><span class="pic">${portraitImg(dexOf(d,1))}</span>`}
       <i class="frame"></i>${upTo(k)?`<span class="upStars s${upTo(k)}" title="Al comprarlo sube a ${upTo(k)} estrellas">${'★'.repeat(upTo(k))}</span>`:''}
       <span class="cn">${DEF[shopArtKey(k)].name}</span>
       <span class="tr">${d.traits.map(t=>`<span title="${t}"><i>${traitIcon(t)}</i>${t}</span>`).join('')}</span>
       <span class="cc">${d.cost}</span></button>`;
   }).join('');
 }
 const inc=income(me,G.roundIdx+1);
 $('incomeInfo').innerHTML=`<b>Próximo ingreso: +${inc.total}</b><span>Base ${inc.base}</span><span>Interés ${inc.interest} (1 por cada 10 de oro, máx. ${me.mods.maxInterest})</span><span>Racha ${inc.streak}</span>${inc.bonus?`<span>Extra ${inc.bonus}</span>`:''}`;
 // Racha: llama roja con las victorias seguidas, azul con las derrotas
 const sk=$('streak'); sk.hidden=Math.abs(me.streak)<1; sk.className='streak '+(me.streak>0?'win':'loss'); sk.querySelector('b').textContent=Math.abs(me.streak); sk.title=me.streak>0?`Racha de ${me.streak} victorias`:`Racha de ${-me.streak} derrotas`;
 $('streakInfo').textContent='';
}
// Iconos blancos y sin fondo del tipo de ataque: diana (a distancia, alcance de más de 2 hexágonos) y puño (cuerpo a cuerpo). Dibujados aquí en SVG, sin imágenes externas
const ICON_RANGED='<svg viewBox="0 0 64 64" width="36" height="36" aria-hidden="true"><defs><mask id="rgM"><rect width="64" height="64" fill="#fff"/><path d="M33 31 L58 6" stroke="#000" stroke-width="9" stroke-linecap="round"/></mask></defs><g mask="url(#rgM)" fill="none" stroke="#fff" stroke-width="5"><circle cx="32" cy="32" r="27"/><circle cx="32" cy="32" r="16"/></g><circle cx="32" cy="32" r="5.5" fill="#fff"/><path d="M34 30 L58 6 M58 6 L49 6 M58 6 L58 15 M52 12 L45 12 M52 12 L52 19" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none"/></svg>';
const ICON_MELEE='<svg viewBox="0 0 64 64" width="36" height="36" aria-hidden="true"><defs><mask id="fiM"><rect width="64" height="64" fill="#fff"/><path d="M21 14 V36 M33 12 V36 M45 14 V36" stroke="#000" stroke-width="2.6" stroke-linecap="round"/><rect x="4" y="33" width="36" height="15" rx="7.5" fill="#fff" stroke="#000" stroke-width="3"/></mask></defs><g mask="url(#fiM)" fill="#fff"><rect x="9" y="15" width="12.5" height="26" rx="6"/><rect x="21" y="11" width="12.5" height="30" rx="6"/><rect x="33" y="12" width="12.5" height="29" rx="6"/><rect x="45" y="15" width="11.5" height="26" rx="5.75"/><rect x="9" y="28" width="47.5" height="26" rx="11"/></g></svg>';
const rangeIcon=r=>r>2?`<span class="stRange" title="A distancia (${r} hex.)">${ICON_RANGED}</span>`:`<span class="stRange" title="Cuerpo a cuerpo">${ICON_MELEE}</span>`;
// Ficha de habilidad que se ve al pasar por una carta de la tienda (antes de comprarla)
function shopTip(key){
 const d=DEF[key]; if(!d) return ''; const u=baseCombatUnit(d,0,1), ab=abOf(d,1), el=elemOf(d), ic=elIcon(ab[2].el||el)||TRAITS[el].icon;
 return `<div class="stHead" style="--tc:${TRAITS[el].color}"><span class="stIco">${ic}</span><div><div class="stName">${esc(ab[1])}</div><div class="stMana">💧 ${R0(u.mana)}/${u.maxMana>=9999?'—':u.maxMana} de maná · ${KIND_NAME[ab[0]]}</div></div>${rangeIcon(u.range)}</div>
  <div class="stBody">${abHTML(ab,u,1)}<div class="stMeta">${esc(d.name)} · ${ROLE_NAME[d.role]} · ❤️ ${R0(u.maxHp)} · ⚔️ ${R0(u.ad)} · 🎯 ${u.range}</div></div>`;
}
// Nivel de una sinergia: 1 bronce, 2 plata, 3 oro y el máximo prismático (si tiene 3 niveles o más)
function traitClass(Tr,tier){ if(!tier) return 'off'; const n=Tr.bp.length; if(tier>n) return 't4'; if(tier>=n) return 't3'; return 't'+Math.min(tier,2); }
// Escalón prismático en la lista de niveles: 🔒 sin emblema, 🌈 si ya cuenta alguno
const prismTag=(Tr,n,e)=>Tr.pr?` › <i class="pz${e?' on':''}${n>=Tr.pr[0]&&e?' got':''}" title="Prismático: ${e?'':'necesita al menos un emblema · '}${esc(Tr.pr[1])}">${e?'🌈':'🔒'}${Tr.pr[0]}</i>`:'';
function renderTraits(){
 const c=traitCounts(viewedPlayer()), em=emblemCountsOf(boardUnits(viewedPlayer())); // las del tablero que se está mirando
 const rows=Object.entries(c).map(([t,n])=>({t,n,e:em[t]||0,tier:tierOf(t,n,em[t]||0)})).sort((a,b)=>b.tier-a.tier||(b.tier?b.n-a.n:b.n/TRAITS[b.t].bp[0]-a.n/TRAITS[a.t].bp[0]));
 $('traits').innerHTML=rows.length?rows.map(r=>{ const Tr=TRAITS[r.t], next=Tr.bp.find(b=>b>r.n)||Tr.bp[Tr.bp.length-1];
   return r.tier?`<div class="trait ${traitClass(Tr,r.tier)}" data-tip="trait:${r.t}" tabindex="0"><span class="ti">${traitIcon(r.t)}</span><span class="tc">${r.n}</span><span class="tn">${r.t}<div class="tb">${Tr.bp.map(b=>r.n>=b?`<b>${b}</b>`:b).join(' › ')}${prismTag(Tr,r.n,r.e)}</div></span></div>`
     :`<div class="trait off" data-tip="trait:${r.t}" tabindex="0"><span class="ti">${traitIcon(r.t)}</span><span class="tc"></span><span class="tn">${r.t}<div class="tb">${r.n} / ${next}</div></span></div>`;
 }).join(''):'<p class="muted small">Coloca Pokémon en el tablero para activar sinergias. Pasa el cursor por una sinergia para ver qué le da a tu equipo.</p>';
 renderAugs();
}
// Avisos de subida de estrellas: se ven unos segundos junto al nombre
const UPS={}, UP_MS=7000;
const POGO='https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Sounds/';
const SFX={ball:[POGO+'Encounter/se_go_ball_out.wav',.6]};
// Nombre de la forma que sale en la tienda (para su grito)
const shopName=d=>Array.isArray(d.names)?d.names[formIdx(d,1,d.dex.length)]:d.name;
// Suena la evolución cuando una ficha tuya sube de estrellas o tu minileyenda cambia de etapa
let sndWatch={g:null,up:0,tac:0};
function soundWatch(){ const me=G.me; if(!me) return; const up=me.lastUp?me.lastUp[2]:0, tac=tacStar(me), frm=(me.tacForm||[]).join(), stk=me.streak|0;
 if(sndWatch.g!==G){ sndWatch={g:G,up,tac,frm,stk,mew:me.mewN|0}; return; }
 if(stk>0&&stk!==sndWatch.stk&&G.round&&G.round.type!=='pve'){ const d=cosD(me,'fn'); if(d) Music.fanfare(d.notes); }
 if(up>sndWatch.up) Music.evolve(me.lastUp[1]>=3?'big':'unit'); // a 3★, la versión larga (la de la minileyenda)
 if((tac>sndWatch.tac&&!tacOf(me).mimic)||(frm!==sndWatch.frm&&me.tac==='eevee'&&tac>=1)) Music.evolve('big');
 if((me.mewN|0)>(sndWatch.mew|0)) Music.morph();
 sndWatch.mew=me.mewN|0; sndWatch.up=up; sndWatch.tac=tac; sndWatch.frm=frm; sndWatch.stk=stk; }
// Aviso de subida de estrellas de otro jugador: un recuadro semitransparente (nombre del jugador, cara del Pokémon, su nombre y las estrellas: plata a 2★, oro a 3★) que sale del círculo de su minileyenda hacia la izquierda y se desvanece solo. Vive en #upLayer (fixed) para poder salirse de la columna
let DEX_NAME=null;
const dexName=dex=>{ if(!DEX_NAME){ DEX_NAME={}; for(const k in DEF){ const d=DEF[k]; if(!d.names) continue; d.names.forEach((n,i)=>{ const dx=Array.isArray(d.dex)?d.dex[i]:d.dex; if(dx!=null&&!DEX_NAME[dx]) DEX_NAME[dx]=n; }); } } return DEX_NAME[String(dex).split('/').pop()]||''; };
const UP_CARDS=new Map(); let UP_NAT=0; // altura natural del recuadro (con escala 1)
function renderUps(){
 if(HEADLESS||!G||!G.players) return; let L=$('upLayer'); if(!L){ L=document.createElement('div'); L.id='upLayer'; document.body.appendChild(L); }
 const now=performance.now(), live=new Set(); L.hidden=!liveGame();
 // Si suben varios a la vez, todos los recuadros se reducen lo justo (--cs) para que quepan en la separación entre filas sin tocarse
 const rc=[...document.querySelectorAll('#players .pl')].map(e=>{ const b=e.getBoundingClientRect(); return b.top+b.height/2; }).sort((a,b)=>a-b), pitch=rc.length>1?Math.min(...rc.slice(1).map((y,i)=>y-rc[i])):90;
 if(!L.hidden) for(const p of G.players){ const u=p.lastUp; if(!u||p===G.me||!p.alive) continue; const [dex,star,seq]=u;
   let r=UPS[p.id]; if(!r||r.seq!==seq){ r=UPS[p.id]={seq,t:now}; setTimeout(()=>{ if(G&&G.players) renderUps(); },UP_MS+50); }
   if(now-r.t>=UP_MS) continue; const row=document.querySelector('#players .pl[data-pid="'+p.id+'"]'); if(!row) continue;
   let c=UP_CARDS.get(p.id); if(!c||c.dataset.seq!==String(seq)){ if(c) c.remove(); c=document.createElement('div'); c.className='upCard s'+star; c.dataset.seq=seq; c.style.setProperty('--life',UP_MS+'ms');
     c.innerHTML=`<span class="un">${esc(p.name)}</span><span class="face"><img src="${dexUrl(dex)}" alt="" data-sp="${String(dex).split('/').pop()}" decoding="async"></span><span class="pi"><b class="pn">${esc(dexName(dex)||'Pokémon')}</b><i class="st" title="Subió a ${star} estrellas">${'★'.repeat(star)}</i></span>`; c.style.visibility='hidden'; L.appendChild(c); UP_CARDS.set(p.id,c); c._new=true; }
   if(!UP_NAT){ c.style.setProperty('--cs',1); UP_NAT=c.offsetHeight||76; } c.style.setProperty('--cs',clamp((pitch-6)/UP_NAT,.45,1).toFixed(3));
   const info=row.querySelector('.plInfo').getBoundingClientRect(), ring=row.querySelector('.ring').getBoundingClientRect(), h=c.offsetHeight;
   c.style.right=(innerWidth-info.left+10)+'px'; c.style.top=(ring.top+ring.height/2-h/2)+'px';
   if(c._new){ c._new=false; const l=c.getBoundingClientRect().left; c.style.setProperty('--ox',(ring.left+ring.width/2-l)+'px'); c.style.visibility=''; }
   live.add(p.id); }
 for(const [id,c] of UP_CARDS) if(!live.has(id)){ c.remove(); UP_CARDS.delete(id); }
}
function upBadge(){ return ''; }
// Aumentos: tira de iconos sobre el tablero; con clic derecho se abre la lista con sus nombres
// Icono de un aumento: su sprite (PokeAPI) con el emoji de reserva si no carga
const augIcon=(a,cls)=>a.img?`<img class="augImg${cls?' '+cls:''}" src="${a.img}" alt="" data-fb="${esc(a.icon)}">`:a.icon;
function renderAugs(){
 const list=viewedPlayer().augments.map(id=>AUG_BY[id]).filter(Boolean), bar=$('augBar'), box=$('augList');
 $('augWrap').innerHTML=''; bar.hidden=true; if(!list.length&&!box.hidden) box.innerHTML='';
 document.getElementById('boardWrap').style.setProperty('--augTop',($('items').offsetHeight+10)+'px');
 bar.innerHTML=list.map(a=>`<span class="aug tier${a.tier}" data-tip="aug:${a.id}">${augIcon(a)}</span>`).join('');
 const P=viewedPlayer(), prog=id=>P===G.me&&G.mirror?(G.me.augUi||{})[id]||'':augProgress(P,id);
 box.innerHTML='<h4>Aumentos</h4>'+list.map(a=>`<div class="augRow tier${a.tier}" data-tip="aug:${a.id}"><span class="aug tier${a.tier}">${augIcon(a)}</span><span><b>${esc(a.name)}</b><small>${TIER_NAME[a.tier]} · ${AUG_CAT[a.cat]||''}</small>${prog(a.id)?`<em>${esc(prog(a.id))}</em>`:''}</span></div>`).join('')
   +`<div class="augMeta">${P.streak>=2?`🔥 Racha de ${P.streak} victorias`:P.streak<=-2?`🧊 Racha de ${-P.streak} derrotas`:'Sin racha'} · Nivel ${P.level} · ${P.gold} de oro</div>`;
}
function renderPlayers(){
 const list=G.players.slice().sort((a,b)=>(b.alive-a.alive)||b.hp-a.hp||(a.place-b.place));
 const combat=G.phase==='combat', oppName=combat?G.myOpp.replace(' (fantasma)',''):'';
 // Fuera del combate: marca con ⚔️ contra quién puedes tocar en la próxima ronda PvP
 const po=!combat&&G.me.alive?new Set(G.mirror?(G.me.po||[]):possibleOpps(G.me).map(p=>p.id)):new Set();
 const watching=G.view?G.view.pid:-1;
 $('players').innerHTML=list.map(p=>`<div class="pl ${p===G.me?'me':''} ${p.name===oppName&&!G.view?'opp':''} ${p.id===watching?'watch':''} ${p.alive?'':'dead'} ${p.alive||p===G.me?'click':''}" data-pid="${p.id}" title="${esc(p.name)} · Nivel ${p.level}${p!==G.me?' · Toca para ver '+(combat?'su combate':'su tablero'):''}">
   <div class="plInfo"><span class="nm">${po.has(p.id)?'<span class="poTag" title="Posible rival: aún no te has enfrentado a él en este ciclo">⚔️</span>':''}${p.id===watching?'<span class="poTag" title="Lo estás mirando">👁</span>':''}${nameHTML(p.name,csOfP(p))}${p.remote||(G.mirror&&!p.isBot&&p!==G.me)?' 🌐':''}${p.streak>=2?' 🔥':p.streak<=-2?' 🧊':''}${G.mp&&G.phase==='planning'&&!p.isBot&&p.ready?' ✔':''}</span>
   <span class="hp">${p.alive?Math.max(0,R0(p.hp)):'#'+p.place}</span></div><span class="ring${csParse(csOfP(p)).fr?' fr':''}" style="--p:${clamp(p.hp,0,100)}${frameVars(csOfP(p))}">${p.alive?`<span class="head tacHead">${tacArtNow(p)}</span>`:'<span class="head em">💀</span>'}</span></div>`).join('');
 const vi=$('viewInfo');
 if(G.view){ const p=G.players.find(x=>x.id===G.view.pid), o=G.view.opp; vi.hidden=false;
   vi.innerHTML=G.view.board?`👁 Tablero de <b>${esc(p?p.name:'?')}</b> <button class="btn sm" id="viewBack">Volver al mío</button>`:`👁 Viendo: <b>${esc(p?p.name:'?')}</b> vs <b>${G.view.pve?'Salvajes':esc(o?o.name:'?')}</b> <button class="btn sm" id="viewBack">Volver a mi combate</button>`;
   $('viewBack').onclick=()=>spectate(G.me.id); }
 else vi.hidden=true;
 renderUps();
}
// Banca de objetos: en escritorio, casillas fijas (las vacías punteadas) a la izquierda del tablero
// Recetas de un componente (clic derecho en la banca de objetos, como en TFT): las 9 combinaciones; resaltadas las que puedes hacer ya
// con lo que tienes en la banca. Al pasar por una fila se ve el objeto que sale y, si lo tienes todo, el botón «Crear objeto» (acción icomb)
let recipeOpen=null;
function closeRecipes(){ recipeOpen=null; const b=$('recipeBox'); if(b) b.remove(); }
function recipePartner(me,i,o){ return me.items.findIndex((k,j)=>j!==i&&k===o); }
function openRecipes(i,anchor){
 const me=G.me, k=me.items[i], I=ITEMS[k]; if(!I||!I.comp){ closeRecipes(); return; }
 if(recipeOpen&&recipeOpen.i===i&&recipeOpen.k===k){ closeRecipes(); return; }
 closeRecipes(); hideTip(); recipeOpen={i,k};
 const rows=ORDER.map(o=>{ const r=combineKey(k,o), j=recipePartner(me,i,o); return {o,r,j,ok:j>=0&&inGame()&&viewOwner()===me}; }).filter(x=>x.r&&ITEMS[x.r]);
 const box=document.createElement('div'); box.id='recipeBox'; const sl=statLine(I.s);
 box.innerHTML=`<div class="rbHead">${itemHTML(k,52)}<div><b>${esc(I.name)}</b>${sl?`<span>${sl}</span>`:''}</div></div>`
  +rows.map((x,n)=>`<div class="rbRow${x.ok?' ok':''}" data-n="${n}"><i>+</i>${itemHTML(x.o,34)}<i>›</i>${itemHTML(x.r,34)}<span>${esc(ITEMS[x.r].name)}</span></div>`).join('')
  +'<div class="rbSide" hidden></div>';
 document.body.appendChild(box);
 const r=anchor.getBoundingClientRect(); box.style.left=Math.round(r.right+10)+'px'; box.style.top=Math.round(clamp(r.top-8,8,Math.max(8,innerHeight-box.offsetHeight-8)))+'px';
 const side=box.querySelector('.rbSide');
 const show=(row)=>{ const x=rows[+row.dataset.n], R=ITEMS[x.r], rs=statLine(R.s); box.querySelectorAll('.rbRow.cur').forEach(e=>e.classList.remove('cur')); row.classList.add('cur');
   side.innerHTML=`<div class="rbHead">${itemHTML(x.r,52)}<div><b>${esc(R.name)}</b>${rs?`<span>${rs}</span>`:''}</div></div><p>${R.desc}</p>`+(x.ok?`<button class="rbMake" type="button">Crear objeto</button>`:`<p class="rbNeed">Te falta: ${esc(ITEMS[x.o].name)}</p>`);
   side.hidden=false; const br=box.getBoundingClientRect(), rr=row.getBoundingClientRect(); side.style.top=Math.round(clamp(rr.top-br.top-20,0,Math.max(0,innerHeight-br.top-side.offsetHeight-8)))+'px';
   const mk=side.querySelector('.rbMake'); if(mk) mk.onclick=()=>{ const me2=G.me, a=me2.items.indexOf(k)===i?i:me2.items.indexOf(k), b=recipePartner(me2,a,x.o); closeRecipes(); if(a<0||b<0) return; Music.drop&&Music.drop(); doAct({t:'icomb',a,b},()=>combineBench(me2,a,b)); }; };
 box.querySelectorAll('.rbRow').forEach(row=>{ row.addEventListener('pointerenter',()=>show(row)); row.addEventListener('click',()=>show(row)); });
}
function renderItems(){
 const me=viewOwner(), spy=me!==G.me, slots=window.matchMedia&&matchMedia('(min-width:1101px)').matches;
 const key=me.id+':'+(me.items||[]).join()+'|'+slots; $('items').classList.toggle('spy',spy); $('items').title=spy?'Objetos de '+me.name:'';
 if(key===renderItems.last&&$('items').childElementCount) return; renderItems.last=key; closeRecipes();
 const groups=[]; me.items.forEach((k,i)=>{ const g=ITEMS[k]&&ITEMS[k].tool&&groups.find(x=>x.k===k); if(g) g.n++; else groups.push({k,i,n:1}); });
 const it=groups.map(g=>`<div class="item" data-i="${g.i}" data-tip="item:${g.k}" tabindex="0">${itemHTML(g.k)}${g.n>1?`<b class="icount">×${g.n}</b>`:''}</div>`).join('');
 $('items').innerHTML=slots?it+'<span class="islot"></span>'.repeat(Math.max(0,MAX_ITEMS_BENCH-groups.length)):(it||'<span class="muted small">Sin objetos. Arrastra los que consigas sobre un Pokémon.</span>');
}
// Registro de daño: daño hecho, daño recibido y curación (con escudos) de cada Pokémon del último combate
let dmgMode='dmg', statsCb=null, statsSide=0, sideTab='pl', lastDmgT=0;
function renderDmg(){
 if(HEADLESS||sideTab!=='dmg') return;
 const cb=statsCb; if(!cb){ $('dmgTitle').textContent='Aparecerá cuando empiece el primer combate.'; $('dmgList').innerHTML=''; return; }
 const side=statsSide, f={dmg:'sDmg',tank:'sTank',heal:'sHeal'}[dmgMode];
 const us=cb.units.filter(u=>u.side===side).map(u=>({u,v:R0(u[f]||0)})).sort((a,b)=>b.v-a.v), max=Math.max(1,...us.map(x=>x.v));
 $('dmgTitle').textContent=(G.phase==='combat'?'Combate en curso':'Último combate')+' · '+{dmg:'daño infligido',tank:'daño recibido (con escudos)',heal:'curación y escudos dados'}[dmgMode];
 $('dmgList').innerHTML=us.map(({u,v})=>`<div class="dmgRow ${dmgMode}" style="--cc:${u.creep?'#8a8a8a':COST_HEX[(u.d.cost||1)-1]}"><span class="pic">${portraitImg(u.creep?u.d.dex:dexOf(u.d,u.star))}</span>
   <div><div class="nm"><span>${esc(u.name)} ${u.creep?'':'★'.repeat(u.star)}</span><b>${v}</b></div><div class="bar"><i style="width:${v/max*100}%"></i></div></div></div>`).join('');
}
// Pokémon tuyo bajo el puntero al soltar un objeto (en pleno combate, el que está peleando: se equipa en el momento, ver applyLiveItems)
function itemTargetAt(e){
 const b=cv.getBoundingClientRect(); if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom) return null;
 const [x,y]=canvasPos(e), me=G.me; let hit=unitAt(x,y);
 if(G.phase==='combat'&&G.combat&&!G.combat.done&&viewCombat()===G.combat){ const cu=combatUnitAt(x,y); if(cu&&!cu.creep&&cu.side===(curFlip()?1:0)&&cu.bk&&me.board[cu.bk]) hit={u:me.board[cu.bk],loc:{b:cu.bk}}; }
 return hit;
}
// Barra de carga en la ficha al mantener un componente sobre otro: se llena en 1 s (combinar sigue siendo al soltar)
function holdTick(){
 const d=itemDrag; if(!d||d.target<0) return;
 const p=Math.min(1,(performance.now()-d.t0)/1000), bar=document.querySelector('#tip .combBar');
 if(bar){ bar.style.setProperty('--p',p); const done=p>=1; if(bar.classList.contains('ready')!==done){ bar.classList.toggle('ready',done); bar.querySelector('.cbT').textContent=done?'✓ Suelta para combinar':'Mantén para combinar'; } }
 setTimeout(holdTick,30);
}
function setSideTab(t){ sideTab=t; document.querySelectorAll('.sideTabs [data-tab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t)); $('tabPl').hidden=t!=='pl'; $('tabDmg').hidden=t!=='dmg'; $('tabLog').hidden=t!=='log'; renderDmg(); }
function renderLog(){ $('log').innerHTML=G.log.slice(0,16).map(l=>`<li>${esc(l)}</li>`).join(''); }
// ---------- Ficha del Pokémon (estilo TFT): iconos, carta, ventanas con clic ----------
const UC_STATS=['ad','ap','df','mr','as','cc','cd','om','dr','dg'];
const UC_ST={
 ad:{n:"Ataque",d:"Daño de cada ataque básico."},
 ap:{n:"Poder",d:"Aumenta el daño, la curación y los escudos de sus habilidades (100 es lo normal)."},
 df:{n:"Defensa",d:"Reduce el daño físico que recibe: daño × 100 / (100 + defensa)."},
 mr:{n:"Resistencia",d:"Reduce el daño mágico que recibe: daño × 100 / (100 + resistencia)."},
 as:{n:"Velocidad de ataque",d:"Ataques básicos por segundo."},
 cc:{n:"Probabilidad de crítico",d:"Probabilidad de que un ataque básico sea crítico."},
 cd:{n:"Daño crítico",d:"Daño de los críticos (140 % = el golpe hace ×1,4)."},
 om:{n:"Omnivampirismo",d:"Porcentaje del daño que inflige (también con habilidades) que recupera como vida."},
 dr:{n:"Reducción de daño",d:"Porcentaje fijo de todo el daño que recibe que se ignora (máximo 75 %)."},
 dg:{n:"Esquiva",d:"Probabilidad de evitar por completo un ataque básico."}
};
// Iconos de la ficha: un solo sprite de <symbol> que se inserta una vez (color de cada uno incluido); cada ficha solo lleva un <use>
const UC_SYM={
 ad:["#ff8a3d","<path d=\"M4 20l1.5-4.5L16 5h4v4L9.5 19.5zM3 17l4 4M14 7l3 3\" fill=\"currentColor\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linejoin=\"round\"/>"],
 ap:["#9a86ff","<path d=\"M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z\" fill=\"currentColor\"/>"],
 df:["#ffd24a","<path d=\"M12 2l8 3v6c0 5-3.6 8.6-8 11-4.4-2.4-8-6-8-11V5z\" fill=\"currentColor\"/>"],
 mr:["#4cc9f0","<path d=\"M12 2l8 3v6c0 5-3.6 8.6-8 11-4.4-2.4-8-6-8-11V5z\" fill=\"currentColor\"/><circle cx=\"12\" cy=\"11.5\" r=\"3.4\" fill=\"#0b1324\"/>"],
 as:["#ffe45e","<path d=\"M13.5 2L5 13.5h6L9.5 22 19 10h-6z\" fill=\"currentColor\"/>"],
 cc:["#ff6b6b","<circle cx=\"12\" cy=\"12\" r=\"7.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\"/><path d=\"M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5\" stroke=\"currentColor\" stroke-width=\"2.2\"/><circle cx=\"12\" cy=\"12\" r=\"2\" fill=\"currentColor\"/>"],
 cd:["#ff3b6a","<path d=\"M12 1l2.6 6.4L21 4.6l-2.8 6.5L23 14l-6.8.9L16 22l-4-5.4L8 22l-.2-7.1L1 14l4.8-2.9L3 4.6l6.4 2.8z\" fill=\"currentColor\"/>"],
 om:["#ff4d8d","<path d=\"M12 2.5C9 7 5 11 5 15.2A7 7 0 0 0 19 15.2C19 11 15 7 12 2.5z\" fill=\"currentColor\"/>"],
 dr:["#3fd27a","<path d=\"M3 5h18v4H3zM3 10h8v4H3zM12 10h9v4h-9zM3 15h18v4H3z\" fill=\"currentColor\"/>"],
 dg:["#5ee0c8","<path d=\"M12 4a8 8 0 1 0 8 8 5.5 5.5 0 0 0-11-1 3 3 0 0 0 6 .5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\"/>"],
 hf:["#f1f6f8","<path d=\"M7.6 2.4000000000000004l4 2.3v4.6l-4 2.3-4-2.3v-4.6z\" fill=\"currentColor\" /><path d=\"M16.4 2.4000000000000004l4 2.3v4.6l-4 2.3-4-2.3v-4.6z\" fill=\"currentColor\" /><path d=\"M12 10l4 2.3v4.6l-4 2.3-4-2.3v-4.6z\" fill=\"currentColor\" opacity=\".28\"/><path d=\"M12 21.8v-3M9.6 19.8L12 22l2.4-2.2\" stroke=\"currentColor\" stroke-width=\"1.4\" fill=\"none\" opacity=\".7\"/>"],
 hb:["#f1f6f8","<path d=\"M7.6 2.4000000000000004l4 2.3v4.6l-4 2.3-4-2.3v-4.6z\" fill=\"currentColor\" opacity=\".28\"/><path d=\"M16.4 2.4000000000000004l4 2.3v4.6l-4 2.3-4-2.3v-4.6z\" fill=\"currentColor\" opacity=\".28\"/><path d=\"M12 10l4 2.3v4.6l-4 2.3-4-2.3v-4.6z\" fill=\"currentColor\" />"],
 rg:["#f1f6f8","<path d=\"M3 21L20 4M20 4h-7M20 4v7\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M4 14l6 6\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\"/>"],
 rh:["#6fe0ee","<path d=\"M12 2l8 3v6c0 5-3.6 8.6-8 11-4.4-2.4-8-6-8-11V5z\" fill=\"currentColor\"/>"],
 ra:["#6fe0ee","<path d=\"M4 20l1.5-4.5L16 5h4v4L9.5 19.5zM3 17l4 4\" fill=\"currentColor\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linejoin=\"round\"/>"],
 rp:["#6fe0ee","<path d=\"M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z\" fill=\"currentColor\"/>"]
};
const ucUse=id=>'<svg viewBox="0 0 24 24"><use href="#ucs-'+id+'"/></svg>';
function ucSprite(){ if(document.getElementById('ucSprite')) return; const w=document.createElement('div'); w.innerHTML='<svg id="ucSprite" width="0" height="0" style="position:absolute" aria-hidden="true">'+Object.entries(UC_SYM).map(([k,[c,p]])=>'<symbol id="ucs-'+k+'" viewBox="0 0 24 24"><g style="color:'+c+'" fill="currentColor">'+p+'</g></symbol>').join('')+'</svg>'; document.body.appendChild(w.firstChild); }
let UC_CUR=null, tipPinned=false;
// La misma carta que se compra en la tienda, sin botón, para reconocer al Pokémon en su ficha
// Retratos de las formas evolucionadas (public/art/f/<n.º>): la ficha muestra la forma de su estrella (Charmeleon a 2★, Charizard a 3★); la tienda sigue con la primera
const FORM_ART=new Set('2 3 5 6 8 9 11 12 14 15 17 18 20 22 24 25 26 28 30 31 33 34 35 36 38 39 40 42 44 45 47 49 51 53 55 57 59 61 62 64 65 67 68 70 71 73 75 76 78 80 82 85 87 89 91 93 94 97 99 101 103 105 110 112 117 119 121 122 125 130 139 141 143 148 149 153 154 176 208 212 229 230 248 282 373 376 389 405 429 445 448 462 464 466 468 477 534 571 609 724 858 1000'.split(' ').map(Number));
const formArt=dx=>FORM_ART.has(dx)?`art/f/${dx}.${ART_EXT}?v=${ART_V}`:null;
function unitCardHTML(d,who,star){
 const sx=star&&Array.isArray(d.dex)?dexOf(d,star):null, fa=sx!=null&&sx!==dexOf(d,1)?formArt(sx):null;
 const ak=DEF[d.key]?shopArtKey(d.key):d.key, fo=fa?ART_DEF:CARD_ART[ak]&&(ART_FOCUS[ak]||ART_DEF), cn=fa?nameOf(d,star):(DEF[ak]||d).name;
 const art=fo?'<span class="art v2art"><img src="'+(fa||CARD_ART[ak])+'" alt="" style="--fx:'+fo[0]/100+';--fy:'+fo[1]/100+';--z:'+fo[2]+';--zr:'+(fo[3]||Math.min(1.6,Math.max(1,52/fo[0]))).toFixed(2)+'"></span>':'<span class="art bg-'+elemOf(d)+'"><i class="fx"></i></span><span class="pic">'+portraitImg(dexOf(d,1))+'</span>';
 return '<div class="card c'+(d.cost||1)+' '+(fo?'v2':'')+' ucShopCard" title="'+esc(who)+'">'+art+'<span class="cn">'+esc(cn)+'</span><span class="tr">'+(d.traits||[]).map(t=>'<span title="'+t+'"><i>'+traitIcon(t)+'</i>'+t+'</span>').join('')+'</span>'+(d.cost?'<span class="cc">'+d.cost+'</span>':'')+'</div>';
}
// Ventana fijada junto a la ficha (se cierra al hacer clic fuera, con Esc o al repetir el clic)
function pinTip(html,anchor){ const t=$('tip'); t.innerHTML=html; t.style.display='block'; t.classList.add('shopTip'); t.style.setProperty('--cc',getComputedStyle($('ucard')).getPropertyValue('--tc')||'#7fd0ff'); tipOn=true; tipAnchor=anchor; tipPinned=true;
 const r=$('ucard').getBoundingClientRect(), ar=anchor.getBoundingClientRect(), w=t.offsetWidth, h=t.offsetHeight; t.style.left=Math.max(8,r.left-w-10)+'px'; t.style.top=clamp(ar.top+ar.height/2-h/2,8,Math.max(8,innerHeight-h-8))+'px'; }
function unpinTip(){ if(!tipPinned) return; tipPinned=false; tipAnchor=null; hideTip(); }
function ucPop(key,anchor){
 const cu=UC_CUR&&UC_CUR.cu; if(!cu) return; const [k,v]=key.split(':'); if(tipPinned&&tipPinned===key){ unpinTip(); return; }
 let h='';
 if(k==='ab'){ const {ab,star}=UC_CUR, d=cu.d, el=elemOf(d), ic=elIcon(ab[2]&&ab[2].el||el)||'✨'; h='<div class="stHead" style="--tc:'+(TRAITS[el]?TRAITS[el].color:'#7fd0ff')+'"><span class="stIco">'+ic+'</span><div><div class="stName">'+esc(ab[1])+'</div><div class="stMana">Activa · '+KIND_NAME[ab[0]]+' · 💧 '+(cu.maxMana>=9999?'—':R0(cu.mana)+'/'+cu.maxMana)+'</div></div></div><div class="stBody">'+abHTML(ab,cu,star)+'</div>'; }
 else if(k==='it') h=tipHTML('item:'+v);
 else if(k==='st'){ const i=UC_STATS.indexOf(v), s=UC_ST[v]; h='<h4>'+s.n+'</h4><div>'+s.d+'</div><div class="scope">Valor actual: <b>'+UC_CUR.stats[i][2]+'</b></div>'; }
 if(!h) return; pinTip(h,anchor); tipPinned=key;
}
function renderCard(){
 if(HEADLESS) return; const el=$('ucard'), me=G.me;
 let inst=null, cu=null, live=false;
 if(selCombat&&viewCombat()&&viewCombat().units.includes(selCombat)&&!selCombat.dead){ cu=selCombat; live=true; }
 else if(selected&&findLoc(me,selected)){ inst=selected; cu=prepUnit(inst)||makeCombatUnit(inst,me,traitTiers(me),0); }
 else { selected=null; selCombat=null; el.classList.add('hidden'); return; }
 const d=cu.d, star=cu.star, ab=cu.copied||cu.ab, col=typeColor(d);
 el.style.setProperty('--tc',col); el.classList.remove('hidden');
 const mineSide=curFlip()?1:0;
 const who=live?(cu.side===mineSide?'Tu Pokémon':'Rival'):`Coste ${d.cost||'—'} · ${ROLE_NAME[d.role]||'Salvaje'}`;
 const pct=v=>R0(v*100)+'%';
 const stats=[['⚔️','Ataque',R0(cu.ad)],['✨','Poder',R0(100+cu.ap)],['🛡️','Defensa',R0(cu.df)],['🔰','Resistencia',R0(cu.mr)],['⚡','Vel. de ataque',cu.as.toFixed(2)],['💥','Prob. crítica',pct(Math.min(1,cu.critC))],['💢','Daño crítico',pct(cu.critM)],['🩸','Omnivampirismo',pct(cu.omni)],['🧱','Reducción de daño',pct(Math.min(.75,cu.dr))],['🌀','Esquiva',pct(cu.dodge)]];
 const hp=live?cu.hp:cu.maxHp, noMana=cu.maxMana>=9999;
 // --- Ficha del Pokémon, al estilo TFT: estrellas, la carta de la tienda, barras, habilidad / posición / alcance, objetos, rol y estadísticas (solo icono; con clic, su descripción) ---
 const gab=abOf(d,star), goldLine=inst&&gab[2]&&gab[2].g?`<p class="small goldGen">💰 Oro generado por ${esc(gab[1])}: <b>${inst.goldGen||0}</b></p>`:'';
 const legLine=cu.legMul?`<p class="small">👑 Resonancia: <b>${cu.legMul>=1?'+':'−'}${R0(Math.abs(cu.legMul-1)*100)}%</b> de vida, ataque y habilidad (${cu.legRes||0} niveles activos de sus otras sinergias)</p>`:'';
 const stacks=live?[cu.sp.rage?`😤 Cinta Furia: <b>${cu.rageN||0}</b> cargas (vel. de ataque ${cu.as.toFixed(2)})`:'',cu.sp.rampAp?`🌙 Piedra Lunar: <b>+${R0(cu.apGain||0)}</b> de poder`:'',cu.sp.titan?`🦾 Coraza Titán: <b>${cu.titanN||0}</b>/25 cargas`:'',cu.quakeGain?`🌋 Vida ganada en este combate: <b>+${R0(cu.quakeGain)}</b> (para siempre)`:'',cu.d.key==='giratina'&&cu.devN?`🌀 Devorados en este combate: <b>${cu.devN}</b>`:''].filter(Boolean).map(t=>`<p class="small">${t}</p>`).join(''):'';
 const extra=live&&cu.ab[0]==='psy'?`<p class="small">Cargas psíquicas: <b>${cu.psyC||0}</b> (+${R0((cu.ab[2].charge||0)*(cu.psyC||0)*100)}% de daño) · energía <b>${Math.min(MEW_NEED,(cu.psyC||0)+(cu.kills||0))}/${MEW_NEED}</b>${cu.megaOn?' · Mega Mewtwo Y':''}</p>`:inst&&inst.defId==='eevee'?`<p class="small">🌀 Evoluciona al derrotar ${me.mods.eeveeKills} enemigos: <b>${Math.min(inst.kills,me.mods.eeveeKills)}/${me.mods.eeveeKills}</b></p>`:'';
 const gloveLine=inst&&inst.tg&&inst.tg.length?`<p class="small">🥊 Guante de Boxeo esta ronda: <b>${inst.tg.map(k=>ITEMS[k]?ITEMS[k].name:k).join(", ")}</b></p>`:"";
 const stk=inst&&inst.stk&&(inst.stk.hp||inst.stk.ad||inst.stk.ap)?`<p class="small">Acumulado para siempre: +${R0(inst.stk.hp)} vida · +${R0(inst.stk.ad)} ataque · +${R0(inst.stk.ap||0)} poder</p>`:'';
 const front=d.role==='t'||d.role==='b', sc=scaleOf(cu), role={hp:['Tanque','Su habilidad escala sobre todo con la vida máxima'],ad:['Tirador','Su habilidad escala sobre todo con el ataque'],ap:[d.role==='t'?'Mago tanque':'Mago',d.role==='t'?'Aguanta en primera fila y su habilidad escala sobre todo con el poder':'Su habilidad escala sobre todo con el poder']}[sc];
 const hpTxt=R0(hp)+' / '+R0(cu.maxHp), mpTxt=noMana?'Sin maná':R0(cu.mana)+' / '+cu.maxMana;
 UC_CUR={cu,inst,star,ab,live,stats,role};
 const slots=[0,1,2].map(i=>{ const it=inst?inst.items[i]:cu.items&&cu.items[i]; if(!ITEMS[it]) return '<div class="ucIt empty"></div>'; return '<button class="ucIt" data-pop="it:'+it+'">'+itemHTML(it)+(cu.cnt&&cu.cnt[it]?'<b>'+cu.cnt[it]+'</b>':'')+'</button>'; }).join('');

 const html='<button class="uc-x" aria-label="Cerrar ficha">✕</button>'
  +'<div class="ucStars s'+star+'"><span>'+'★'.repeat(star)+'</span></div>'
  +unitCardHTML(d,who,star)
  +'<div class="ucBar hp"><i style="width:'+clamp(hp/cu.maxHp*100,0,100)+'%"></i><span>'+hpTxt+'</span></div>'
  +'<div class="ucBar mp"><i style="width:'+(noMana?0:clamp(cu.mana/cu.maxMana*100,0,100))+'%"></i><span>'+mpTxt+'</span></div>'
  +'<div class="ucTrio">'
  +'<button class="ucBox ab" data-pop="ab" style="--tc:'+col+'"><span class="abI">'+(elIcon(ab[2]&&ab[2].el||elemOf(d))||'✨')+'</span><em>'+esc(ab[1])+'</em></button>'
  +'<div class="ucBox pos">'+ucUse(front?'hf':'hb')+'<em>'+(front?'Al frente':'Atrás')+'</em></div>'
  +'<div class="ucBox rng">'+ucUse('rg')+'<em>'+cu.range+' hex.</em></div></div>'
  +'<hr class="ucHr">'
  +'<div class="ucItems">'+slots+'</div>'
  +'<div class="ucRole">'+ucUse({hp:'rh',ad:'ra',ap:'rp'}[sc])+'<i></i><span>'+role[0]+'</span></div>'
  +'<hr class="ucHr"><hr class="ucHr">'
  +'<div class="ucStats">'+stats.map((s,k)=>'<button class="ucSt" data-pop="st:'+UC_STATS[k]+'">'+ucUse(UC_STATS[k])+'<b>'+s[2]+'</b></button>').join('')+'</div>'
  +(goldLine+legLine+gloveLine+stacks+extra+stk?'<div class="ucNotes">'+goldLine+legLine+gloveLine+stacks+extra+stk+'</div>':'')
  +(inst?'<button class="btn sm" id="ucSell">Vender por '+sellValue(inst)+' de oro</button>':'');
 // sin cambios (mismo HTML y misma altura de pantalla) no se toca el DOM: así renderUI no repinta la ficha a cada paso
 const key=html+'|'+innerHeight; if(el._k===key) return; el._k=key; ucSprite(); el.innerHTML=html; unpinTip();
 hydrate(el);
 // la ficha es larga: si no cabe por encima de la tienda, se reduce para verla entera
 el.style.transform=''; { const sp=$('shopPanel'), lim=(sp?sp.getBoundingClientRect().top:innerHeight-190)-8, r=el.getBoundingClientRect(), z=Math.min(1,(lim-r.top)/r.height); if(z<1) el.style.transform='scale('+Math.max(.6,z).toFixed(3)+')'; }
}

/* ---------- modales ---------- */
function openModal(html,opt={}){ NET.modal=opt.kind||''; NET.onClose=opt.onClose||null; $('mbox').classList.toggle('bare',!!opt.bare); $('mbox').classList.toggle('cfg',!!opt.cfg); $('mbox').classList.toggle('tp',!!opt.tp); $('mbox').innerHTML=(opt.closable?'<div class="mtop"><button class="mclose" aria-label="Cerrar" id="mClose">'+(window.PX?PX.icon('close',18):'×')+'</button></div>':'')+html; $('modal').classList.remove('hidden'); hydrate($('mbox')); if(window.PX) PX.hydrate($('mbox')); hideTip(); if(opt.closable) $('mClose').onclick=closeModal; }
function closeModal(){ $('modal').classList.add('hidden'); $('mbox').innerHTML=''; hideTip(); NET.modal=''; const f=NET.onClose; NET.onClose=null; if(f) f(); }
// Elegir minileyenda al empezar la partida (se recuerda en este navegador)
function savedTac(){ if(ACC&&TACS[ACC.trainer]&&tacOwned(ACC.trainer)) return ACC.trainer; try{ const k=localStorage.getItem('pt_tac'); return TACS[k]&&tacOwned(k)?k:''; }catch(e){ return ''; } }
// La minileyenda se elige en el menú (una vez) y se guarda en la cuenta: el campo «trainer» de la base de datos guarda su clave
// Selector de minileyenda: ventana azul con el título y un «?» que muestra la explicación en un globo al pasar el ratón (sin clic), lista seccionada por rareza (TAC_TIERS) con
// retratos circulares de marco dorado (sin nombre ni etapas; la elegida lleva una marca), Eevee bloqueada con «Gacha» y la garantía, y «Confirmar»
function showTacPick(first){
 let sel=savedTac()||'charmander';
 $('menu').classList.remove('hidden'); $('auth').classList.add('hidden');
 const opt=k=>{ const t=TACS[k], own=tacOwned(k);
   if(!own) return `<button class="tacOpt locked" data-k="${k}" type="button" aria-disabled="true" title="${t.name}: solo se consigue en el gacha" aria-label="${t.name}"><span class="tpRing">${artImg(k)}</span><span class="tacLock"><i data-i="crystal" data-s="14"></i>Gacha</span><small class="tpPity">Mítica · ${typeof COSM!=='undefined'?(COSM.missingMythics(ACC&&ACC.cosm)[0]==='tac:'+k?`${t.name} garantizado en ${COSM.pityLeft(ACC&&ACC.cosm)} tiradas`:`${t.name}: tras conseguir la otra mítica`):'Solo en el gacha'}</small></button>`;
   return `<button class="tacOpt ${k===sel?'on':''}" data-k="${k}" type="button" title="${t.name}" aria-label="${t.name}"><span class="tpRing">${artImg(k)}</span></button>`; };
 openModal(`<div class="tpHead"><h1>${first?'Elige tu minileyenda':'Cambiar minileyenda'}</h1><span class="tpHelpWrap"><button class="tpHelp" id="tpHelp" type="button" aria-label="Qué es la minileyenda" aria-describedby="tpInfo">?</button><p class="tpInfo" id="tpInfo" role="tooltip">Te acompaña en todas tus partidas: muévela por el tablero con <b>clic derecho</b> y pasa por encima de los orbes para recogerlos. Evoluciona en los niveles 6 y 8. Con <b>T</b> saluda y con <b>H</b> (Charmander) lanza una bola de fuego.</p></span></div>
  <div class="tacPick">${TAC_TIERS.map(([name,cls,keys])=>`<section class="tpTier ${cls}"><h4>${name}</h4><div class="tpList">${keys.length?keys.map(opt).join(''):'<span class="tpSoon">Próximamente</span>'}</div></section>`).join('')}</div>
  <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn gold tpOk" id="tacOk">Confirmar</button></div>`,{closable:!first,tp:true,onClose:()=>{ if(ACC) showMenu(); }});
 $('mbox').querySelectorAll('.tacOpt').forEach(b=>b.onclick=()=>{ if(b.classList.contains('locked')){ toast(`${TACS[b.dataset.k].name} solo se consigue en el gacha`); return; } sel=b.dataset.k; $('mbox').querySelectorAll('.tacOpt').forEach(x=>x.classList.toggle('on',x===b)); });
 $('tacOk').onclick=async()=>{
   $('tacOk').disabled=true;
   try{ const {user}=await api('/api/me',{trainer:sel}); applyAccount(user); closeModal(); showMenu(); }
   catch(err){ toast(err.message); $('tacOk').disabled=false; if(err.status===401) showAuth(err.message); }
 };
}
// Retrato de la minileyenda de un jugador en su etapa actual (niveles 6 y 8): la forma de Eevee elegida con su carta, las evoluciones con su retrato de forma (art/f)
function tacArtNow(p){ const t=tacOf(p), st=tacStage(p); if(!st||t.mimic) return artImg(tacKey(p));
 if(t.pick){ const k=p.tacForm&&(st>1&&p.tacForm[1]||p.tacForm[0]); return k&&CARD_ART[k]?artImg(k):artImg(tacKey(p)); }
 const dx=t.dex[st], fa=formArt(+dx); return fa?`<img src="${fa}" alt="" class="artPic hF" decoding="async" data-dex="${dx}">`:portraitImg(dx); }
const tacHeadHTML=(k,s)=>`<span class="head tacHead" style="--hs:${s}px">${artImg(tacKey({tac:k}))}</span>`;

function showHow(){
 openModal(`<h1>Cómo jugar</h1>
 <p>Juegas contra 7 rivales. Cada ronda compras Pokémon, los colocas en el tablero y combaten solos. Si pierdes, pierdes vida de entrenador. El último en pie gana.</p>
 <h3>Habilidades</h3><ul class="help"><li>Cada Pokémon llena su barra azul de maná al atacar y recibir golpes. Al llenarla lanza su habilidad: verás el nombre sobre él, el efecto en el tablero y una línea en «Habilidades en este combate».</li><li>Toca cualquier Pokémon (también los rivales en pleno combate) para ver su ficha completa a la derecha.</li></ul>
 <h3>Economía</h3><ul class="help"><li>Ingreso por ronda: 0 · 2 · 3 en la fase 1, 4 en la 2-1 y 5 desde entonces.</li><li>Interés: +1 por cada 10 de oro (máx. 5). Rachas de 2+ victorias o derrotas dan +1 a +3.</li></ul>
 <h3>Pokémon</h3><ul class="help"><li>3 copias = 2★ y evoluciona con una habilidad nueva. 3 de 2★ = 3★. A 3★ deja de salir en tu tienda.</li><li>Eevee acumula vida y ataque para siempre y evoluciona al derrotar enemigos.</li></ul>
 <h3>Objetos</h3><ul class="help"><li>Arrastra un componente sobre un Pokémon que ya lleve otro y se combinan. En el inventario, suelta un componente sobre otro para combinarlos. Para quitar objetos a un Pokémon usa el Imán Removedor (recibes uno en cada fase contra salvajes).</li></ul>
 <h3>Modos de juego</h3><ul class="help"><li><b>Normal</b>: rivales de tu nivel que se adaptan a ti (si ganas, juegan mejor; si te cuesta, más asequibles). No cambia tu rango.</li><li><b>Clasificatoria</b>: 3 partidas de posicionamiento y después ligas de Hierro a Retador. Ganas o pierdes LP según tu puesto y la fuerza de la sala.</li><li><b>Sala informal</b>: con amigos y un código. Da caramelos, pero no cambia tu nivel ni tu rango.</li><li>Todas dan caramelos (65 a 100 según el puesto) y quedan en tu historial. La práctica sin conexión no cuenta.</li></ul>
 <h3>Atajos</h3><p><span class="kbd">D</span> nueva tienda · <span class="kbd">F</span> comprar EXP · <span class="kbd">E</span> vender · <span class="kbd">Espacio</span> listo · <span class="kbd">Esc</span> cerrar ficha · <span class="kbd">T</span> tu minileyenda saluda · <span class="kbd">H</span> bola de fuego (Charmander)</p>
 <h3>Créditos</h3><p class="small muted">Fangame gratuito y sin ánimo de lucro, sin relación con Nintendo, Game Freak ni The Pokémon Company. Sprites de Pokémon y objetos: PokeAPI/sprites. Música original.</p>`,{closable:true});
}
// Pokédex: sprites 2D de Pokémon Bank (pokemondb.net; HOME en los de 8.ª y 9.ª gen), copiados a public/dex/<n.º>.png (128 px, ~3 KB). Antes eran retratos renderizados desde los modelos 3D (~190 KB por modelo: abrirla pedía ~35 MB). Cada forma usa SU número (d.dex[i]); dexOf desplaza una forma en los costes 4 de 3 formas
const dexSprite=(d,size,i)=>`<span class="spr2" style="--s:${size}px"><img src="${(window.ASSET_BASE||'')}dex/${Array.isArray(d.dex)?d.dex[i]:d.dex}.png" alt="${esc(d.names[i])}" loading="lazy" decoding="async" width="${size}" height="${size}"></span>`;
function showDex(cost){
 const list=UNIT_LIST.filter(u=>!cost||u.cost===cost);
 openModal(`<h1>Pokédex</h1><p>${UNIT_LIST.length} líneas evolutivas. Pasa el cursor por una carta para ver sus 3 habilidades (una por estrella).</p>
 <div class="dexFilters">${[0,1,2,3,4,5].map(c=>`<button class="btn sm" data-c="${c}" aria-pressed="${c===cost}">${c?'Coste '+c:'Todos'}</button>`).join('')}</div>
 <div class="dexGrid">${list.map(d=>`<div class="dexCard c${d.cost}" data-tip="unit:${d.key}"><div class="forms">${d.names.map((n,i)=>`${i?'<span class="ar">›</span>':''}${dexSprite(d,d.names.length>2?52:64,i)}`).join('')}</div><b>${d.names.join(' › ')}</b><span class="t">${d.traits.join(' · ')}</span></div>`).join('')}</div>`,{closable:true});
 $('mbox').querySelectorAll('.dexFilters button').forEach(b=>b.onclick=()=>showDex(+b.dataset.c));
}
function showRecipes(){
 openModal(`<h1>Objetos</h1><p class="muted">Fila + columna = objeto. Pasa el cursor por una casilla para ver qué hace.</p>
 <div class="rtable"><table><tr><th></th>${ORDER.map(c=>`<th data-tip="item:${c}">${itemHTML(c,40)}</th>`).join('')}</tr>
 ${ORDER.map(a=>`<tr><th data-tip="item:${a}">${itemHTML(a,40)}</th>${ORDER.map(b=>{ const id=combineKey(a,b); return `<td data-tip="item:${id}">${itemHTML(id,40)}</td>`; }).join('')}</tr>`).join('')}</table></div>`,{closable:true});
}
// Ventana de configuración (menú y partida): volumen, tema y calidad con botones redondos (CSS .cfg*; los tiempos de planificación y de aumento son fijos, PLAN_T y AUG_T);
// en partida (inGame), abajo y separado, Rendirse (solo desde la fase 3-1) y Volver al menú; en el menú, Cerrar sesión
function showOptions(inGame){
 const rd=(name,opts,cur)=>`<div class="cfgOpts" id="${name}">${opts.map(([v,t])=>`<label class="rd"><input type="radio" name="${name}" value="${v}" ${String(cur)===String(v)?'checked':''}><i></i><span>${t}</span></label>`).join('')}</div>`;
 const can=canSurrender(), vol=R0(S.vol*100);
 openModal(`<h1>Configuración</h1>
 <div class="cfgRow"><b>Volumen de la música</b><div class="cfgVol"><input type="range" id="optVol" min="0" max="100" value="${vol}" aria-label="Volumen de la música"><b id="optVolV">${vol}</b></div></div>
 <div class="cfgRow"><b>Tema</b>${rd('optTheme',[['system','Según el sistema'],['light','Claro'],['dark','Oscuro']],S.theme||'system')}</div>
 <div class="cfgRow"><b>Calidad gráfica</b>${rd('optGfx',[['auto','Automática'],['2','Alta'],['1','Media'],['0','Baja']],GFX.q)}</div>
 <div class="cfgBtns">${inGame?'':'<button class="cfgBtn ghost" id="logoutBtn">Cerrar sesión</button>'}<button class="cfgBtn" id="saveOpt">Guardar</button></div>
 ${inGame?`<div class="cfgSep"></div><div class="cfgSur"><div><button class="cfgBtn red" id="surrBtn" ${can?'':'disabled'}>Rendirse</button><button class="cfgBtn ghost" id="quitBtn">Volver al menú</button></div><small>${can?'Quedas eliminado en el último puesto entre los que siguen vivos y la partida termina para ti':'Rendirse solo se puede desde la fase 3-1'}</small></div>`:''}`,{closable:true,cfg:true});
 const val=n=>{ const e=document.querySelector(`input[name="${n}"]:checked`); return e?e.value:''; };
 $('optVol').oninput=e=>{ S.vol=+e.target.value/100; S.muted=false; $('optVolV').textContent=e.target.value; Music.init(); Music.setVol(); };
 $('saveOpt').onclick=()=>{ try{ localStorage.setItem('pt_gfx',val('optGfx')||'auto'); }catch(e){} applyGfx(); S.theme=val('optTheme')||'system'; saveSettings(); applyTheme(); renderMenu(); closeModal(); };
 if($('logoutBtn')) $('logoutBtn').onclick=()=>{ closeModal(); logout(); };
 if($('quitBtn')) $('quitBtn').onclick=()=>{ closeModal(); confirmQuit(); };
 if($('surrBtn')) $('surrBtn').onclick=()=>{ if(!canSurrender()) return; closeModal(); confirmSurrender(); };
}
// Rendirse: solo desde la fase 3-1, vivo y fuera del carrusel (en multijugador lo valida igual el servidor en applyAct)
function canSurrender(){ return !!(G&&G.players&&G.players.length&&!G.over&&G.me&&G.me.alive&&G.round&&G.round.s>=3&&G.phase!=='carousel'&&G.phase!=='over'); }
function confirmSurrender(){
 openModal(`<h1>¿Rendirse?</h1><p>Quedarás eliminado en el puesto ${alivePlayers().length} y la partida termina para ti.</p><div class="cfgBtns"><button class="cfgBtn ghost" id="srNo">Seguir jugando</button><button class="cfgBtn red" id="srYes">Rendirse</button></div>`,{closable:true,cfg:true});
 $('srYes').onclick=()=>{ closeModal(); if(canSurrender()) doAct({t:'surrender'}); }; $('srNo').onclick=closeModal;
}
function confirmQuit(){
 openModal(`<h1>¿Volver al menú?</h1><p>${NET.mode==='client'?'Saldrás de la sala y tu partida continuará sin ti.':'La partida actual se perderá.'}</p><div style="display:flex;gap:8px"><button class="btn primary" id="qYes">Volver al menú</button><button class="btn" id="qNo">Seguir jugando</button></div>`,{closable:true});
 $('qYes').onclick=()=>{ closeModal(); if(G) G.over=true; if(NET.mode!=='sp') leaveRoom(); showMenu(); };
 $('qNo').onclick=closeModal;
}
// Carta de aumento: marco dorado (img/aug-marco.svg) y el icono del aumento como silueta del color de su rareza (plata, oro o prismático),
// que conserva sus detalles por la luminosidad. Se calcula una vez por aumento en un lienzo (sprite recortado y ampliado sin suavizar)
const AUG_TINT={S:[[134,140,149],[228,231,236]],G:[[146,98,36],[240,208,140]],P:[[150,88,226],[70,196,190],[128,186,255]]}, augSilC={};
function augSil(a){
 if(augSilC[a.id]) return augSilC[a.id];
 return augSilC[a.id]=new Promise(res=>{
   const paint=im=>{ try{
     let w,h,src=document.createElement('canvas'), c=src.getContext('2d',{willReadFrequently:true});
     if(im){ src.width=im.naturalWidth; src.height=im.naturalHeight; c.drawImage(im,0,0); } else { src.width=src.height=120; c.font='96px "Segoe UI Emoji","Apple Color Emoji",sans-serif'; c.textAlign='center'; c.textBaseline='middle'; c.fillText(a.icon||'✨',60,64); }
     let d=c.getImageData(0,0,src.width,src.height), x0=1e9,y0=1e9,x1=-1,y1=-1;
     for(let y=0;y<d.height;y++) for(let x=0;x<d.width;x++) if(d.data[(y*d.width+x)*4+3]>20){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
     if(x1<0) return res(null); w=x1-x0+1; h=y1-y0+1; d=c.getImageData(x0,y0,w,h);
     const T=AUG_TINT[a.tier]||AUG_TINT.S, P=d.data;
     for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const i=(y*w+x)*4; if(!P[i+3]) continue; const lum=(P[i]*.3+P[i+1]*.59+P[i+2]*.11)/255;
       let t=T.length>2?((x/w)+(1-y/h))/2:1-y/h, col; if(T.length>2){ const k=t*2, j=Math.min(1,Math.floor(k)), f=k-j; col=T[j].map((v,n)=>v+(T[j+1][n]-v)*f); } else col=T[0].map((v,n)=>v+(T[1][n]-v)*t);
       const s=.55+.6*lum; P[i]=Math.min(255,col[0]*s); P[i+1]=Math.min(255,col[1]*s); P[i+2]=Math.min(255,col[2]*s); }
     const tmp=document.createElement('canvas'); tmp.width=w; tmp.height=h; tmp.getContext('2d').putImageData(d,0,0);
     // sprites pequeños (objetos): ampliados sin suavizar; ilustraciones grandes (Pokémon): reducidas con suavizado
     const big=Math.max(w,h)>180, k=big?200/Math.max(w,h):Math.max(1,Math.min(8,Math.floor(180/Math.max(w,h)))), out=document.createElement('canvas'); out.width=Math.round(w*k); out.height=Math.round(h*k);
     const o=out.getContext('2d'); o.imageSmoothingEnabled=big||!im; o.imageSmoothingQuality='high'; o.drawImage(tmp,0,0,out.width,out.height); res(out.toDataURL());
   }catch(e){ res(null); } };
   if(!a.img) return paint(null);
   // Pokémon: su ilustración oficial (silueta suave); si no carga, el sprite de siempre
   const art=(a.img.match(/sprites\/pokemon\/(\d+)\.png$/)||[])[1], load=(u,fb)=>{ const im=new Image(); im.crossOrigin='anonymous'; im.onload=()=>paint(im); im.onerror=()=>fb?load(fb):paint(null); im.src=u; };
   art?load(a.img.replace(/\d+\.png$/,`other/official-artwork/${art}.png`),a.img):load(a.img);
 });
}
// Título y descripción caben siempre en su hueco: se reduce la letra hasta que no se salen
function fitAugCard(el){
 const fit=(n,max,min,ok)=>{ for(let s=max;s>=min;s-=.5){ n.style.fontSize=s+'px'; if(ok()) return; } };
 const b=el.querySelector('.ac3Name'), d=el.querySelector('.ac3Desc');
 const sp=b&&b.firstElementChild, lines=()=>sp.offsetHeight/(parseFloat(b.style.fontSize)*1.05);
 // título: en una línea si cabe con letra decente; si no, en dos sin pasar de su hueco (se mide el texto, que crece hacia arriba y abajo)
 if(sp){ fit(b,27,19,()=>lines()<1.5&&sp.offsetWidth<=b.clientWidth+1); if(lines()>=1.5) fit(b,24,14,()=>sp.offsetHeight<=b.clientHeight+1&&sp.offsetWidth<=b.clientWidth+1); }
 if(d) fit(d,15,9,()=>d.scrollHeight<=d.clientHeight+1);
}
function augCardHTML(a,i,anim){ return `<button class="augCard3 t${a.tier}${anim!=null?' nuevo':''}" data-i="${i}"${anim!=null?` style="--d:${anim*.12}s"`:''} title="${esc(TIER_NAME[a.tier])}"><span class="ac3Ico" data-aug="${esc(a.id)}"></span><b class="ac3Name"><span>${esc(a.name)}</span></b><span class="ac3Desc">${esc(a.desc)}</span></button>`; }
function hydrateAugCards(root){
 root.querySelectorAll('.augCard3').forEach(fitAugCard);
 root.querySelectorAll('.ac3Ico[data-aug]').forEach(el=>{ const a=AUG_BY[el.dataset.aug]; if(!a) return; augSil(a).then(u=>{ el.innerHTML=u?`<img src="${u}" alt="">`:`<span class="ac3Emo">${esc(a.icon||'✨')}</span>`; }); });
}
// Aumentos ya mostrados en esta ronda: solo aparecen con efecto los nuevos (al cambiar uno, solo ese)
let augSeen={round:-1,ids:new Set()};
function showAugment(){
 const me=G.me; if(!me.augChoices||!me.augChoices.length) return;
 const choices=me.augChoices.map(id=>AUG_BY[id]).filter(Boolean), rr=me.augRR||[0,0,0];
 NET.augKey=me.augChoices.join()+'|'+(rr).join();
 if(augSeen.round!==G.roundIdx) augSeen={round:G.roundIdx,ids:new Set()};
 let k=0; const anim=choices.map(a=>augSeen.ids.has(a.id)?null:k++); choices.forEach(a=>augSeen.ids.add(a.id));
 openModal(`<div class="augPick">${choices.map((a,i)=>`<div class="augCol">${augCardHTML(a,i,anim[i])}<button class="augRR" data-r="${i}" ${rr[i]?'disabled':''} title="Cambiar este aumento (1 vez)">⟳</button></div>`).join('')}</div>`,{kind:'aug',bare:true});
 hydrateAugCards($('mbox'));
 $('mbox').querySelectorAll('.augCard3').forEach(b=>b.onclick=()=>{ const i=+b.dataset.i, a=choices[i]; closeModal(); toast(`✨ ${a.name}`); doAct({t:'aug',i},()=>{ me.augChoices=null; }); });
 $('mbox').querySelectorAll('.augRR').forEach(b=>b.onclick=()=>{ const i=+b.dataset.r; doAct({t:'augrr',i},()=>{ (me.augRR=me.augRR||[0,0,0])[i]=1; }); if(NET.mode!=='client') showAugment(); });
}
// Elecciones pendientes de los aumentos (emblemas, recompensas, Llamada al Caos…)
// Ventana con el resultado de un aumento (Llamada al Caos, contratos…): sale cuando no hay otra ventana abierta
const REVEAL_KIND={bueno:['¡Bendición!','#3fd27a'],mixto:['Intercambio','#f4c04e'],riesgo:['Riesgo','#ff9f43'],malo:['Maldición','#ff5a5f']};
function showReveal(){
 const r=(G.me.reveals||[]).find(x=>x[0]>(G.rvSeen||0)); if(!r||modalOpen()) return false;
 G.rvSeen=r[0]; const [,icon,title,name,text,kind,dice]=r, K=REVEAL_KIND[kind], hasDice=Array.isArray(dice)&&dice.length;
 openModal(`<div class="reveal${hasDice?' rvDice':''}" style="--rk:${K?K[1]:'var(--gold)'}">${hasDice?`<div class="dice">${dice.map((n,i)=>`<span class="die roll" style="--d:${i*.12}s" data-n="${n}">${'<i></i>'.repeat(9)}</span>`).join('')}</div>`:`<div class="rvIcon">${esc(icon)}</div>`}<div class="rvAfter"><div class="muted small">${esc(title)}</div><h1>${esc(name)}</h1>${K?`<span class="rvKind">${K[0]}</span>`:''}<p>${esc(text)}</p><button class="btn gold" id="rvOk">Entendido</button></div></div>`);
 $('rvOk').onclick=()=>{ closeModal(); renderUI(); };
 if(hasDice) rollDiceUI();
 return true;
}
// Caras de dado (huecos 0-8 de una rejilla 3×3) y animación: mientras ruedan cambian de cara y al final queda la buena
const PIPS=[[],[4],[0,8],[0,4,8],[0,2,6,8],[0,2,4,6,8],[0,2,3,5,6,8]];
function dieFace(el,n){ el.querySelectorAll('i').forEach((p,i)=>p.classList.toggle('on',PIPS[n].includes(i))); }
function rollDiceUI(){ const ds=[...document.querySelectorAll('#mbox .die')]; const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches; let t=0;
 const tick=()=>{ t++; for(const d of ds) dieFace(d,t<11&&!reduce?1+Math.floor(Math.random()*6):+d.dataset.n); if(t<11&&!reduce) setTimeout(tick,80); else if(typeof Music!=="undefined"&&Music.drop) Music.drop(); }; tick(); }
function showPick(){
 const pk=G.me.picks&&G.me.picks[0]; if(!pk||modalOpen()) return;
 if(pk.src==='__eevee'){ showEvolve(pk); return; }
 if(pk.src==='__tac'){ showTacEvolve(pk); return; }
 openModal(`<h1>${esc(pk.title)}</h1><p class="muted">${esc(pk.desc||'')}</p><div class="choices">${pk.opts.map((o,i)=>`<button class="choice" data-i="${i}"><span class="big">${esc(o.i||'✨')}</span><b>${esc(o.t)}</b><span class="small">${esc(o.d||'')}</span></button>`).join('')}</div>`,{kind:'pick'});
 $('mbox').querySelectorAll('.choice').forEach(b=>b.onclick=()=>{ const i=+b.dataset.i; closeModal(); doAct({t:'pick',id:pk.id,i},()=>{ G.me.picks=G.me.picks.filter(x=>x.id!==pk.id); }); });
}
function showTacEvolve(pk){
 const opts=pk.opts.map(o=>DEF[String(o.v).split('|')[1]]).filter(Boolean);
 openModal(`<h1>${esc(pk.title)}</h1><p>${esc(pk.desc||'')}</p><div class="choices">${opts.map((e,i)=>`<button class="choice" data-i="${i}">${CARD_ART[e.key]?`<span class="evoArt" style="background-image:url('${CARD_ART[e.key]}')"></span>`:spriteHTML(e,64)}<b>${e.name}</b><span class="small">${e.traits.join(' · ')}</span></button>`).join('')}</div>`,{kind:'pick'});
 $('mbox').querySelectorAll('.choice').forEach(b=>b.onclick=()=>{ const i=+b.dataset.i; closeModal(); doAct({t:'pick',id:pk.id,i},()=>{ G.me.picks=G.me.picks.filter(x=>x.id!==pk.id); }); });
}
function showEvolve(pk){
 const opts=pk.opts.map(o=>DEF[String(o.v).split('|')[1]]).filter(Boolean), u={star:1};
 openModal(`<h1>¡Eevee va a evolucionar!</h1><p>Ha derrotado a suficientes enemigos. Elige su evolución: conserva todo lo que ha acumulado y gana una habilidad nueva.</p>
 <div class="choices">${opts.map((e,i)=>{ const cu=baseCombatUnit(e,0,u.star); return `<button class="choice" data-i="${i}">${CARD_ART[e.key]?`<span class="evoArt" style="background-image:url('${CARD_ART[e.key]}')"></span>`:spriteHTML(e,64)}<b>${e.name}</b><span class="small">${e.traits.map(t=>TRAITS[t].icon+' '+t).join(' · ')} · ${ROLE_NAME[e.role]}<br><b style="display:inline;font-size:12px">${e.ab[0][1]}:</b> ${abDesc(e.ab[0],abilPower(cu),u.star)}</span></button>`; }).join('')}</div>`);
 $('mbox').querySelectorAll('.choice').forEach(b=>b.onclick=()=>{ const i=+b.dataset.i; closeModal(); doAct({t:'pick',id:pk.id,i},()=>{ G.me.picks=G.me.picks.filter(x=>x.id!==pk.id); }); });
}
function showAnvil(a,done){
 openModal(`<h1>⚒️ ${a.kind==='ca'?'Yunque de componentes':'Yunque de objeto'}</h1><p>Elige uno.</p>
 <div class="choices">${a.opts.map((k,i)=>`<button class="choice" data-i="${i}" data-tip="item:${k}">${itemHTML(k,52)}<b>${ITEMS[k].name}</b><span class="small">${statLine(ITEMS[k].s)}${ITEMS[k].comp?'':'<br>'+ITEMS[k].desc}</span></button>`).join('')}</div>`);
 $('mbox').querySelectorAll('.choice').forEach(b=>b.onclick=()=>{ giveItem(G.me,a.opts[+b.dataset.i]); closeModal(); renderUI(); done(); });
}
/* ----- pantalla de resultados: sale UNA vez al terminar tu partida (eliminado o campeón) y «Continuar» lleva al menú -----
   Los 8 jugadores con su minileyenda, nivel, equipo (estrellas y objetos), sinergias, aumentos y la ronda en que cayeron; los
   que siguen vivos, arriba y «En juego». En multijugador los datos llegan del servidor con el resultado (result.board); en la
   práctica sin conexión se calculan aquí con la misma forma. Ningún perfil se abre desde aquí; sí se puede pedir amistad. */
function localBoard(){ return G.players.map(p=>{ const c=p.place&&p.finalComp?p.finalComp:compSnap(p); return {n:p.name,cs:csOfP(p),pl:p.place||0,tac:p.tac,tf:p.tacForm||['',''],lvl:c.lvl,rd:c.round,u:c.units,t:c.traits,a:c.augs,me:p===G.me}; }); }
function rsFriendBtn(b){ if(b.me||NET.mode==='sp'&&!ACC) return ''; const L=FR.list, k=String(b.n).toLowerCase();
 if(L&&L.friends.some(f=>f.name.toLowerCase()===k)) return '<span class="rsTag">Amigo</span>';
 if(L&&L.outgoing.some(f=>f.name.toLowerCase()===k)) return '<span class="rsTag">Enviada</span>';
 return `<button class="pxb pxb-sq frIc rsAdd" data-n="${esc(b.n)}" type="button" aria-label="Enviar solicitud de amistad a ${esc(b.n)}" title="Añadir amigo"><i data-i="addfriend" data-s="18"></i></button>`; }
function rsRow(b){ const pl=b.pl||0, tp={tac:TACS[b.tac]?b.tac:'charmander',tacForm:Array.isArray(b.tf)?b.tf:['',''],level:b.lvl|0};
 return `<div class="rsRow${b.me?' me':''} pl${!pl?0:pl===1?1:pl<=4?2:3}"><div class="rsPl">${pl?ordinal(pl):'—'}</div><span class="frAv rsAv${csParse(b.cs).fr?' fr':''}" style="${frameVars(b.cs).slice(1)}">${tacArtNow(tp)}</span>
  <div class="rsWho"><b>${nameHTML(b.n,b.cs)}</b>${titleOf(b.cs)?`<small class="rsTitle2">«${esc(titleOf(b.cs))}»</small>`:''}<small>Nivel ${b.lvl||'—'} · ${!pl?'En juego':pl===1?'Ganador':'Cae en '+esc(b.rd||'—')}</small></div>
  <div class="hComp rsComp">${(b.u||[]).map(histUnit).join('')||'<span class="small muted">Sin Pokémon</span>'}</div>
  <div class="hTraits rsTr">${(b.t||[]).slice(0,6).map(histTrait).join('')}${(b.a||[]).map(id=>AUG_BY[id]?`<span class="hA" title="${esc(AUG_BY[id].name)}">${augIcon(AUG_BY[id])}</span>`:'').join('')}</div>
  <div class="rsAct">${rsFriendBtn(b)}</div></div>`; }
function renderResultsTable(board){ const el=$('rsTable'); if(!el) return;
 const B=(board||[]).slice(0,8).sort((x,y)=>(x.pl||0)-(y.pl||0)); // los vivos (puesto 0) arriba, luego 1.º, 2.º…
 el.innerHTML=B.length?B.map(rsRow).join(''):'<p class="muted">Cargando los equipos…</p>'; hydrate(el); window.PX&&PX.hydrate(el);
 el.querySelectorAll('.rsAdd').forEach(bt=>bt.onclick=async()=>{ bt.disabled=true; await friendOp('request',bt.dataset.n); if(FR.msg&&FR.msg.ok) bt.outerHTML='<span class="rsTag">Enviada</span>'; else { bt.disabled=false; toast(FR.msg?FR.msg.t:'No se pudo enviar'); } }); }
// late: resultado reenviado tras un corte justo al terminar (se muestra sobre el menú)
function showGameOver(late){
 const place=late?late.place:G.me.place, won=place===1, sp=!late&&NET.mode==='sp';
 if(won&&!late){ const d=cosD(G.me,'fn'); if(d) Music.fanfare(d.notes); }
 if(ACC&&!FR.list) loadFriends();
 openModal(`<div class="rsHead${won?' win':''}"><div class="rsBig"><b>${place?ordinal(place):'—'}</b><span>de 8</span></div>
  <div class="rsTitle"><div class="pxKicker">${won?'¡Campeón de la Liga!':'Fin de la partida'}</div><h1>${won?'Eres el último entrenador en pie':'Has quedado eliminado'}</h1>
   <div id="goRes">${sp?'<p class="small muted">Práctica sin conexión: no da caramelos ni cuenta para el historial.</p>':NET.result?resultHTML(NET.result):'<p class="small muted">Guardando el resultado en tu cuenta…</p>'}</div></div></div>
  <div class="rsTable" id="rsTable"></div>
  <div class="rsFoot"><button class="pxb pxb-main" id="rsGo" type="button"><span class="pxbT"><b>Continuar</b></span><i class="pxCaret" aria-hidden="true"></i></button>${sp?'<button class="pxLink" id="againBtn" type="button">Practicar otra vez</button>':''}</div>`,{kind:'over'});
 renderResultsTable(sp?localBoard():NET.result&&NET.result.board);
 if($('againBtn')) $('againBtn').onclick=()=>{ closeModal(); selected=null; selCombat=null; newGame({diff:'normal'}); };
 $('rsGo').onclick=()=>{ closeModal(); if(!sp&&!late) leaveRoom(); showMenu(); };
 if(window.PX) PX.hydrate($('mbox'));
}
// Ficha del menú (centrada bajo el logo): copa del rango, retrato redondo con marco dorado, nombre, y dos recuadros con marco dorado
// (la minileyenda, el único que abre el selector —el retrato redondo es solo decorativo—, y la arena); debajo, el rango compacto, los caramelos y «Ver perfil»
function renderMenu(){
 if(!ACC) return; const tk=savedTac()||'charmander', t=TACS[tk], rk=COMP().ranked;
 $('menuWho').classList.add('mnCard');
 $('menuWho').innerHTML=`<div class="mcRank" title="${esc(rankText(rk))}">${rankBadge(rk,44)}</div>
  <div class="mcAvatar">${artImg(tk)}</div>
  <div class="tname">${nameHTML(ACC.name,myCs())}</div>${titleOf(myCs())?`<div class="tTitle">«${esc(titleOf(myCs()))}»</div>`:''}
  <div class="mcSep"></div>
  <div class="mcEq"><button class="mcBox" id="pickTr" type="button" title="Cambiar minileyenda"><span class="mcImg">${artImg(tk)}</span><span class="tfrom">${esc(t.name)}</span></button><div class="mcBox static" title="Arena"><span class="mcImg"><img src="arena/coliseo/base1x.webp" alt="" decoding="async"></span><span>Arena</span></div></div>
  <div class="mcFoot">${rankMiniHTML()}</div>
  <div class="row"><button class="pxb" id="pfBtn"><i data-i="people" data-s="18"></i><span>Ver perfil</span></button></div>`;
 $('pickTr').onclick=()=>showTacPick(false); $('pfBtn').onclick=()=>showProfile(ACC.name); $('rkMini').onclick=showRanked; pxArt($('menu'));
}
/* ---------- modos de juego, colas, rango, resultados e historial (todo sale del servidor) ---------- */
const COMP=()=>(ACC&&ACC.comp)||{candies:0,ranked:{placing:true,done:0,of:3}};
const MODE_NAME={normal:'Normal',ranked:'Clasificatoria',custom:'Sala informal'};
const ordinal=n=>n+'.º';
function rankBadge(rk,size){ return window.PX?PX.badge(rk&&!rk.placing&&rk.league?rk.league:'none',size):''; }
const rankText=rk=>!rk?'Sin clasificar':rk.placing?`Posicionamiento ${rk.done}/${rk.of}`:`${rk.name}${rk.div?' '+rk.div:''}`;
// Barra de progreso hacia la siguiente división (o las 3 partidas de posicionamiento)
function lpBar(rk){
 if(rk.placing) return `<div class="rkPips" aria-label="Partidas de posicionamiento: ${rk.done} de ${rk.of}">${Array.from({length:rk.of},(_,i)=>`<i class="${i<rk.done?'on':''}"></i>`).join('')}</div>`;
 const pct=rk.apex?(rk.next?clamp(rk.lp/(rk.lp+rk.next.need)*100,0,100):100):rk.lp;
 return `<div class="rkBar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${R0(pct)}"><i style="width:${pct}%"></i></div><div class="rkNext">${rk.next?`${rk.next.need} LP para ${esc(rk.next.name)}`:'La cima de la clasificación'}</div>`;
}
// Panel compacto de rango (ficha del menú)
function rankMiniHTML(){ const c=COMP(), rk=c.ranked;
 return `<button class="rkMini" id="rkMini" type="button" aria-label="Ver la clasificatoria">${rankBadge(rk,48)}<span class="rkTxt"><b>${esc(rankText(rk))}</b><small>${rk.placing?'Juega 3 partidas para revelar tu rango':rk.lp+' LP'}</small>${lpBar(rk)}</span></button>
  <div class="candyRow" title="Caramelos: se ganan en cada partida de Normal, Clasificatoria o sala informal"><i data-i="candy" data-s="20"></i><b>${c.candies}</b><span>caramelos</span></div>`; }

// ----- cola -----
function startQueue(mode){
 const s=sock(); if(!s){ toast('Para jugar hace falta el servidor del juego'); return; }
 if(NET.queue) { toast('Ya estás buscando partida'); return; }
 NET.queue={mode,since:Date.now(),found:1,fill:12,state:'on'}; NET.mode='joining'; closeModal(); s.emit('queue',{mode}); renderQueue();
}
function stopQueue(){ if(NET.sock) NET.sock.emit('unqueue'); endQueue(); }
function endQueue(){ NET.queue=null; if(NET.mode==='joining'&&!NET.code) NET.mode='sp'; renderQueue(); }
function onQueue(d){
 if(!d||!NET.queue&&d.state!=='matched') return;
 if(d.state==='off'){ endQueue(); return; }
 NET.queue=Object.assign(NET.queue||{mode:d.mode,since:Date.now()},{state:d.state,found:d.found||NET.queue&&NET.queue.found||1,fill:d.fill||12,humans:d.humans});
 if(d.state==='on'&&typeof d.wait==='number') NET.queue.since=Date.now()-d.wait*1000;
 renderQueue();
}
function renderQueue(){
 const el=$('queueBar'); if(!el) return; const q=NET.queue;
 if(!q){ el.classList.add('hidden'); clearInterval(renderQueue.iv); renderQueue.iv=0; return; }
 const t=Math.floor((Date.now()-q.since)/1000), mm=`${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`, ranked=q.mode==='ranked';
 el.classList.remove('hidden'); el.classList.toggle('ranked',ranked);
 el.innerHTML=q.state==='matched'?`<i data-i="${ranked?'ranked':'ball'}" data-s="32"></i><div class="qTxt"><b>¡Partida encontrada!</b><small>Partida de 8 entrenadores · preparando el tablero…</small></div>`
  :`<i data-i="${ranked?'ranked':'ball'}" data-s="32"></i><div class="qTxt"><b>Buscando ${ranked?'clasificatoria':'partida normal'} <span class="qTime">${mm}</span></b><small>${q.found||1}/8 entrenadores con tu nivel · ${t<(q.fill||12)?'buscando rivales…':'completando la sala…'}</small></div><button class="pxb" id="qCancel" type="button"><i data-i="close" data-s="16"></i><span>Cancelar</span></button>`;
 window.PX&&PX.hydrate(el); if($('qCancel')) $('qCancel').onclick=stopQueue;
 if(!renderQueue.iv) renderQueue.iv=setInterval(()=>{ if(NET.queue&&NET.queue.state==='on') renderQueue(); },1000);
}

// ----- pantallas de modo -----
function showNormal(){
 if(!sock()){ openModal(`<h1>Partida normal</h1><p>Hace falta el servidor del juego. Abre el juego desde su dirección (Render), no como archivo suelto.</p><button class="pxb" id="practiceBtn"><span>Práctica sin conexión</span></button>`,{closable:true}); $('practiceBtn').onclick=startPractice; return; }
 openModal(`<div class="modeHead"><i data-i="ball" data-s="48"></i><div><h1>Partida normal</h1><p class="muted">8 entrenadores · sin rango en juego</p></div></div>
  <div class="modeInfo"><p><b>Dificultad adaptativa.</b> Te emparejamos con entrenadores de tu nivel y el nivel de la sala se ajusta a ti: si ganas a menudo, los rivales juegan mejor (economía, sinergias y colocación); si te cuesta, son más asequibles. Tu rango no cambia.</p>
  <p>Cada partida da <b>caramelos</b> (de 65 a 100 según tu puesto) y queda en tu historial.</p></div>
  <button class="pxb pxb-main wide" id="qNormal" type="button"><i data-i="ball" data-s="40"></i><span class="pxbT"><b>Buscar partida</b><small>Te emparejamos con entrenadores de tu nivel</small></span><i class="pxCaret" aria-hidden="true"></i></button>
  <h3 class="pxH">Sala informal</h3><p class="small muted">Juega con amigos con un código de sala. Da caramelos, pero no cambia tu dificultad ni tu rango.</p>
  <div class="roomRow"><button class="pxb" id="rmCreate" type="button"><i data-i="people" data-s="20"></i><span>Crear sala</span></button><div class="field"><label for="rmCode">Código de sala</label><input id="rmCode" maxlength="5" placeholder="abc12" autocomplete="off"></div><button class="pxb" id="rmJoin" type="button"><span>Unirse</span></button></div>
  <button class="pxLink" id="practiceBtn" type="button">Práctica sin conexión (sin recompensas ni historial)</button>`,{closable:true});
 const s=sock();
 $('qNormal').onclick=()=>startQueue('normal');
 $('rmCreate').onclick=()=>{ if(NET.queue) return toast('Sal de la cola antes de crear una sala'); NET.mode='joining'; s.emit('create',{name:`Sala de ${S.name}`.slice(0,24),max:8}); };
 $('rmJoin').onclick=()=>{ const c=$('rmCode').value.trim().toLowerCase(); if(!/^[a-z0-9]{5}$/.test(c)){ toast('El código tiene 5 letras o números'); return; } if(NET.queue) return toast('Sal de la cola antes de unirte'); NET.mode='joining'; s.emit('join',{code:c}); };
 $('practiceBtn').onclick=startPractice;
}
function startPractice(){ closeModal(); $('menu').classList.add('hidden'); selected=null; selCombat=null; newGame({diff:'normal'}); }
function leaguesHTML(rk){ const cur=rk.placing?'':rk.league;
 return [['iron','Hierro'],['bronze','Bronce'],['silver','Plata'],['gold','Oro'],['platinum','Platino'],['emerald','Esmeralda'],['diamond','Diamante'],['master','Maestro'],['grandmaster','Gran Maestro'],['challenger','Retador']]
  .map(([k,n],i)=>`<div class="lgItem ${k===cur?'on':''}">${window.PX?PX.badge(k,34+i*2.4|0):''}<span>${n}</span></div>`).join(''); } // cada liga, un poco más grande
function showRanked(){
 const rk=COMP().ranked;
 openModal(`<div class="rkBig">${rankBadge(rk,128)}<div class="rkBigTxt"><div class="pxKicker">Clasificatoria</div><h1>${esc(rankText(rk))}</h1>${rk.placing?`<p class="muted">Juega ${rk.of-rk.done} partida${rk.of-rk.done===1?'':'s'} más para revelar tu rango.</p>`:`<p class="rkLp">${rk.lp} LP</p>`}${lpBar(rk)}</div></div>
  <div class="modeInfo"><p>Contra entrenadores de tu nivel y <b>rivales competitivos</b>, bastante mejores que en Normal: gestionan la economía, buscan sinergias y colocan bien. El <b>1.º</b> gana muchos LP; del <b>2.º al 4.º</b>, pocos; del <b>5.º al 8.º</b> se pierden, más cuanto más abajo. Si tu nivel real está por encima de tu rango, subes más rápido.</p>
  <p>Cada partida también da <b>caramelos</b>. De Hierro a Diamante hay 5 divisiones (V a I) de 100 LP; Maestro, Gran Maestro y Retador no tienen divisiones.</p></div>
  <div class="leagues">${leaguesHTML(rk)}</div>
  <button class="pxb pxb-alt wide" id="qRanked" type="button"><i data-i="ranked" data-s="36"></i><span class="pxbT"><b>Buscar clasificatoria</b><small>Entrenadores de tu nivel y partidas más exigentes</small></span><i class="pxCaret" aria-hidden="true"></i></button>`,{closable:true});
 $('qRanked').onclick=()=>startQueue('ranked');
}

// ----- resultado de la partida, ascensos y revelación del rango -----
function onResult(d){
 if(!d||!d.rec) return; NET.result=d; if(NET.sock) NET.sock.emit('resultSeen'); if(ACC&&d.comp){ ACC.comp=d.comp; renderMenu(); }
 if(Array.isArray(d.board)) d.board=d.board.slice(0,8).filter(b=>b&&typeof b==='object').map(b=>({n:String(b.n||'').slice(0,20),cs:String(b.cs||'').slice(0,200),pl:clamp(b.pl|0,0,8),tac:TACS[b.tac]?b.tac:'charmander',tf:Array.isArray(b.tf)?b.tf.slice(0,2).map(k=>DEF[k]?k:''):['',''],lvl:clamp(b.lvl|0,0,10),rd:String(b.rd||'').slice(0,6),u:Array.isArray(b.u)?b.u.slice(0,12):[],t:Array.isArray(b.t)?b.t.slice(0,9):[],a:Array.isArray(b.a)?b.a.slice(0,4):[],me:!!b.me}));
 if(NET.modal==='over') renderResultsTable(d.board);
 else if(d.late&&NET.mode!=='client'&&ACC&&!NET.modal) showGameOver({place:d.rec.place});
 if(d.rec.promoted||d.rec.revealed||d.rec.demoted) NET.rankFx=d;
 const el=$('goRes'); if(el){ el.innerHTML=resultHTML(d); window.PX&&PX.hydrate(el); }
}
function resultHTML(d){ const r=d.rec, chips=[`<span class="rChip candy"><i data-i="candy" data-s="18"></i>+${r.candies} caramelos</span>`];
 if(r.mode==='ranked'){ if(r.placement&&!r.revealed) chips.push(`<span class="rChip">Posicionamiento ${r.placement.done}/${r.placement.of}</span>`);
   else if(r.revealed) chips.push(`<span class="rChip up">Rango revelado: ${esc(rankText(r.revealed))}</span>`);
   else chips.push(`<span class="rChip ${r.lp>=0?'up':'down'}">${r.lp>=0?'+':'−'}${Math.abs(r.lp)} LP${r.promoted?' · ¡Ascenso!':r.demoted?' · Descenso':''}</span>`); }
 else if(r.mode==='custom') chips.push('<span class="rChip">Sala informal: sin cambios de rango</span>');
 return `<div class="goChips">${chips.join('')}</div>`; }
function showRankChange(d){
 const r=d.rec, after=r.revealed||r.rankAfter, before=r.rankBefore, title=r.revealed?'¡Rango revelado!':r.promoted?'¡Ascenso!':'Descenso';
 openModal(`<div class="rkFx ${r.demoted?'down':''}"><div class="rkFxBadges">${before?`<div class="old">${rankBadge(before,72)}<span>${esc(rankText(before))}</span></div><i class="rkArrow" aria-hidden="true"></i>`:''}<div class="new">${rankBadge(after,128)}<span>${esc(rankText(after))}</span></div></div>
  <h1>${title}</h1><p>${r.revealed?'Tras tus 3 partidas de posicionamiento, empiezas en':'Ahora estás en'} <b>${esc(rankText(after))}</b> con ${after.lp} LP.</p><button class="pxb pxb-main wide" id="rkOk" type="button"><span class="pxbT"><b>Continuar</b></span></button></div>`,{kind:'rank'});
 $('rkOk').onclick=closeModal;
}

// ----- historial (6 partidas más recientes, al estilo TFT) -----
const fmtDate=s=>{ try{ return new Date(s).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }catch(e){ return ''; } };
const fmtDur=s=>s>0?`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`:'';
// Con el mismo retrato que la carta de la tienda y la ficha: la forma de su estrella (art/f) o la miniatura de su carta (art/t); el sprite solo si no hay retrato
function histUnit(u){ const [key,star,items,dex,name,cost]=u, d=DEF[key], dx=dex||(d?dexOf(d,star):0), fa=d&&dx!==dexOf(d,1)?formArt(dx):null;
 const pic=fa?`<img class="artPic hF" src="${fa}" alt="${esc(name||key)}" loading="lazy" data-dex="${dx}">`:CARD_ART[key]?`<img class="artPic" src="${artThumb(key)}" alt="${esc(name||key)}" loading="lazy" data-dex="${dx}">`:`<img src="${SPRITE(dx)}" alt="${esc(name||key)}" loading="lazy">`;
 return `<div class="hU" style="--cc:${COST_HEX[(cost||(d&&d.cost)||1)-1]}" title="${esc(name||(d?d.name:key))} ${'★'.repeat(star||1)}"><span class="hStars s${star}">${'★'.repeat(star||1)}</span>${pic}<span class="hItems">${(items||[]).map(k=>ITEMS[k]?itemHTML(k,13):'').join('')}</span></div>`; }
function histTrait([t,n,tier]){ const Tr=TRAITS[t]; if(!Tr) return ''; const cls=tier>Tr.bp.length?'t4':tier>=Tr.bp.length?'t3':'t'+Math.min(tier,2); return `<span class="hT ${cls}" title="${esc(t)} (${n})">${traitIcon(t)}</span>`; }
function histRow(m,i){
 const r=m.data||{}, c=r.comp||{units:[],traits:[],augs:[]}, pl=r.place||8, ranked=m.mode==='ranked';
 const right=ranked?(r.placement&&!r.revealed?`<span class="rChip">Posicionamiento ${r.placement.done}/${r.placement.of}</span>`:r.revealed?`<span class="rChip up">Revelado</span>`:`<span class="rChip ${r.lp>=0?'up':'down'}">${r.lp>=0?'+':'−'}${Math.abs(r.lp||0)} LP</span>`):'';
 const det=[];
 if(r.mmrBefore!=null) det.push(`<div><span>MMR ${ranked?'clasificatorio':'normal'}</span><b>${r.mmrBefore} → ${r.mmrAfter} (${r.mmrAfter-r.mmrBefore>=0?'+':''}${r.mmrAfter-r.mmrBefore})</b></div>`);
 if(r.rankBefore&&r.rankAfter) det.push(`<div><span>Rango</span><b>${esc(rankText(r.rankBefore))} · ${r.rankBefore.lp} LP → ${esc(rankText(r.rankAfter))} · ${r.rankAfter.lp} LP</b></div>`);
 if(r.why) det.push(`<div><span>Por qué esos LP</span><b>puesto ${r.why.base>=0?'+':''}${r.why.base} · tu nivel frente a tu rango ${r.why.mmrVsRank>=0?'+':''}${r.why.mmrVsRank} · fuerza de la sala ${r.why.lobby>=0?'+':''}${r.why.lobby}</b></div>`);
 if(r.oppAvg) det.push(`<div><span>Nivel medio de los rivales</span><b>${r.oppAvg} MMR</b></div>`);
 det.push(`<div><span>Ronda y nivel</span><b>${esc(c.round||'—')} · nivel ${c.lvl||'—'}</b></div>`);
 if(c.augs&&c.augs.length) det.push(`<div><span>Aumentos</span><b>${c.augs.map(id=>AUG_BY[id]?esc(AUG_BY[id].name):'').filter(Boolean).join(' · ')}</b></div>`);
 const parts=(r.participants||[]).slice().sort((a,b)=>(a.place||9)-(b.place||9));
 return `<div class="hRow pl${pl===1?1:pl<=4?2:3}" data-i="${i}">
  <button class="hMain" type="button" aria-expanded="false"><div class="hPlace"><b>${ordinal(pl)} lugar</b><small>${MODE_NAME[m.mode]||m.mode}</small><small>${fmtDate(m.created)}${r.duration?' · '+fmtDur(r.duration):''}</small></div>
   <div class="hLvl" title="Nivel">${c.lvl||'—'}</div>
   <div class="hMid"><div class="hComp">${(c.units||[]).map(histUnit).join('')||'<span class="small muted">Sin Pokémon en el tablero</span>'}</div><div class="hTraits">${(c.traits||[]).map(histTrait).join('')}${(c.augs||[]).map(id=>AUG_BY[id]?`<span class="hA">${augIcon(AUG_BY[id])}</span>`:'').join('')}</div></div>
   <div class="hRight">${right}<span class="rChip candy"><i data-i="candy" data-s="16"></i>+${r.candies||0}</span></div></button>
  <div class="hDet" hidden><div class="hDetGrid">${det.join('')}</div>${parts.length?`<div class="hParts">${parts.map(p=>`<span class="${p.me?'me':''}">${p.place?ordinal(p.place):'—'} ${esc(String(p.name||'').replace(/ (bot)$/,''))}</span>`).join('')}</div>`:''}</div></div>`;
}
async function showHistory(){
 openModal(`<div class="modeHead"><i data-i="hourglass" data-s="44"></i><div><h1>Historial de partidas</h1><p class="muted">Tus 6 partidas más recientes. Toca una para ver los detalles.</p></div></div><div class="hList" id="hList"><p class="muted">Cargando…</p></div>`,{closable:true});
 let list=[]; try{ list=(await api('/api/history')).matches||[]; }catch(e){ $('hList').innerHTML=`<p class="muted">${esc(e.message)}</p>`; return; }
 const el=$('hList'); if(!el) return;
 el.innerHTML=list.length?list.slice(0,6).map(histRow).join(''):'<div class="hEmpty"><i data-i="ball" data-s="40"></i><p>Aún no has jugado ninguna partida de Normal, Clasificatoria o sala informal.</p></div>';
 window.PX&&PX.hydrate(el);
 el.querySelectorAll('.hMain').forEach(b=>b.onclick=()=>{ const det=b.parentElement.querySelector('.hDet'), open=det.hidden; det.hidden=!open; b.setAttribute('aria-expanded',open); b.parentElement.classList.toggle('open',open); });
}
// ----- perfil (estilo LoL): minileyenda, nivel de cuenta, rango, mejor rango, estadísticas por modo y las 10 últimas partidas -----
// Todo sale de /api/profile, que nunca manda MMR, rivales ni ajustes. Desde la pantalla de resultados no se abre ningún perfil.
const fmtMonth=s=>{ try{ return new Date(s+'-01T12:00:00').toLocaleDateString('es-ES',{month:'long',year:'numeric'}); }catch(e){ return ''; } };
function pfRow(m){ const c=m.comp||{}, pl=m.place||8;
 const lp=m.mode!=='ranked'?'':m.revealed?`<span class="rChip up">Rango revelado: ${esc(rankText(m.revealed))}</span>`:m.placement?`<span class="rChip">Posicionamiento ${m.placement.done}/${m.placement.of}</span>`:typeof m.lp==='number'?`<span class="rChip ${m.lp>=0?'up':'down'}">${m.lp>=0?'+':'−'}${Math.abs(m.lp)} LP</span>`:'';
 return `<div class="hRow pfRow pl${pl===1?1:pl<=4?2:3}"><div class="hMain"><div class="hPlace"><b>${ordinal(pl)} lugar</b><small>${MODE_NAME[m.mode]||esc(m.mode)}</small><small>${fmtDate(m.created)}${m.duration?' · '+fmtDur(m.duration):''}</small></div>
  <div class="hLvl" title="Nivel">${c.lvl||'—'}</div>
  <div class="hMid"><div class="hComp">${(c.units||[]).map(histUnit).join('')||'<span class="small muted">Sin Pokémon en el tablero</span>'}</div><div class="hTraits">${(c.traits||[]).map(histTrait).join('')}${(c.augs||[]).map(id=>AUG_BY[id]?`<span class="hA" title="${esc(AUG_BY[id].name)}">${augIcon(AUG_BY[id])}</span>`:'').join('')}</div></div>
  <div class="hRight">${lp}<span class="rChip candy"><i data-i="candy" data-s="16"></i>+${m.candies||0}</span></div></div></div>`; }
function pfStatsHTML(s){ return `<div class="stats pfStats"><div><b>${s.games}</b><span>Partidas</span></div><div><b>${s.wins}</b><span>Victorias</span></div><div><b>${s.top4}</b><span>Top 4</span></div><div><b>${s.avg==null?'—':String(s.avg).replace('.',',')}</b><span>Puesto medio</span></div><div><b>${s.candies}</b><span>Caramelos</span></div></div>`; }
function profileHTML(P,ctx={}){
 const t=TACS[P.trainer]||TACS.charmander, tk=TACS[P.trainer]?P.trainer:'charmander', rk=P.ranked, a=P.account, unranked=rk.placing&&!rk.done;
 const mode0=P.byMode.ranked.games?'ranked':P.byMode.normal.games||!P.byMode.custom.games?'normal':'custom';
 // Pokémon más usados en las partidas del historial (por línea, la forma de la ficha más reciente)
 const use={}; for(const m of P.history){ const seen=new Set(); for(const u of (m.comp&&m.comp.units)||[]){ const d=DEF[u[0]], k=d&&d.evoOf||u[0]; if(seen.has(k)) continue; seen.add(k); (use[k]=use[k]||{n:0,dex:u[3],name:u[4]}).n++; } }
 const thk=csParse(P.cs).th, thm=thk?COSM.BY[thk].d.c:null;
 const fav=Object.values(use).sort((x,y)=>y.n-x.n).slice(0,3), lg=!rk.placing&&rk.league?rk.league:'none';
 const favDot=f=>f?`<span class="pfDot" title="${esc(f.name||'')} · en ${f.n} partida${f.n===1?'':'s'}">${portraitImg(f.dex)}</span>`:'<span class="pfDot"></span>';
 // Como el perfil del LoL: estandarte vertical (nivel, retrato con el marco de su liga, nombre y 3 favoritos) sobre la ilustración de la minileyenda y una fila de vitrinas
 return `<div class="pfHero"><div class="pfBg" style="background-image:url('${CARD_ART[tk]||''}')"></div>
 <aside class="pfBanner lg-${lg}${thm?' themed':''}"${thm?` style="--lg:${thm[0]};--th2:${thm[1]}"`:''}><span class="pfLvlChip" title="Nivel de cuenta">${a.level}</span>${P.eevee?'<span class="pfMythic" title="Ha conseguido a Eevee, la minileyenda mítica">Mítica</span>':''}
  <div class="pfAvatar"><span class="pfRing${csParse(P.cs).fr?' fr':''}" style="${frameVars(P.cs).slice(1)}">${artImg(tk)}</span><span class="pfCrest">${rankBadge(rk,54)}</span></div>
  <b class="pfName">${iconOf(P.cs,18)}${nameHTML(P.name,P.cs)}</b>${titleOf(P.cs)?`<small class="pfTitle">«${esc(titleOf(P.cs))}»</small>`:''}<small class="pfSince">${esc(t.name)}${P.since?'<br>Desde '+esc(fmtMonth(P.since)):''}</small>${ctx.presence?`<small class="frSt st-${esc(ctx.presence.st)}"><i></i>${esc(frStatus(ctx.presence))}</small>`:''}
  <div class="pfDots">${[0,1,2].map(i=>favDot(fav[i])).join('')}</div>${ctx.friend?`<button class="pxb pfAct" id="pfRemove" type="button"><i data-i="close" data-s="14"></i><span>Eliminar amigo</span></button>`:ctx.self?`<button class="pxb pfAct" id="pfFriends" type="button"><i data-i="people" data-s="16"></i><span>Amigos</span></button><button class="pxb pfAct" id="pfCustom" type="button"><i data-i="gear" data-s="16"></i><span>Personalizar</span></button>`:''}<i class="pfTail" aria-hidden="true"></i></aside>
 <div class="pfShow">
  <div class="pfCase"><span class="pfCap">Clasificatoria</span><small>${unranked?'Sin clasificar':esc(rankText(rk))}</small><div class="pfBig">${rankBadge(rk,76)}</div><small class="muted">${rk.placing?`Posicionamiento ${rk.done}/${rk.of}`:rk.lp+' LP'}</small>${lpBar(rk)}</div>
  <div class="pfCase"><span class="pfCap">Mejor rango</span><small>${P.peak?esc(rankText(P.peak)):'—'}</small><div class="pfBig">${P.peak?rankBadge(P.peak,64):rankBadge(null,64)}</div></div>
  <div class="pfCase"><span class="pfCap">Nivel</span><small>${a.xp}/${a.need}</small><div class="pfBig"><b class="pfNum">${a.level}</b></div><div class="rkBar" role="progressbar" aria-label="Nivel de cuenta" aria-valuemin="0" aria-valuemax="${a.need}" aria-valuenow="${a.xp}"><i style="width:${R0(a.xp/a.need*100)}%"></i></div></div>
  <div class="pfCase"><span class="pfCap">Caramelos</span><small>en total</small><div class="pfBig"><i data-i="candy" data-s="44"></i></div><b class="pfNum sm">${P.candies}</b></div>
  <div class="pfCase"><span class="pfCap">Favorito</span><small>${fav[0]?esc(fav[0].name||''):'—'}</small><div class="pfBig">${fav[0]?`<span class="pfDot big">${portraitImg(fav[0].dex)}</span>`:'<span class="pfDot big"></span>'}</div>${fav[0]?`<small class="muted">${fav[0].n} partida${fav[0].n===1?'':'s'}</small>`:''}</div>
 </div></div>
 <div class="pfTabs" role="tablist">${['normal','ranked','custom'].map(m=>`<button class="pxb${m===mode0?' on':''}" role="tab" aria-selected="${m===mode0}" data-m="${m}" type="button"><span>${MODE_NAME[m]}</span></button>`).join('')}</div>
 <div id="pfStats">${pfStatsHTML(P.byMode[mode0])}</div>
 <h3 class="pxH">Últimas partidas</h3>
 <div class="hList">${P.history.length?P.history.map(pfRow).join(''):'<div class="hEmpty"><i data-i="ball" data-s="40"></i><p>Aún no hay partidas de Normal, Clasificatoria o sala informal.</p></div>'}</div>`; }
async function showProfile(name){
 openModal('<div class="pfWrap" id="pfWrap"><p class="muted">Cargando el perfil…</p></div>',{closable:true,kind:'profile'});
 let P, D; try{ D=await api('/api/profile/'+encodeURIComponent(name)); P=D.profile; }catch(e){ const el=$('pfWrap'); if(el) el.innerHTML=`<p class="muted">${esc(e.message)}</p>`; return; }
 const el=$('pfWrap'); if(!el||NET.modal!=='profile') return;
 el.innerHTML=profileHTML(P,D); hydrate(el); window.PX&&PX.hydrate(el);
 if($('pfFriends')) $('pfFriends').onclick=()=>{ closeModal(); openFriends(true); };
 if($('pfCustom')) $('pfCustom').onclick=async()=>{ await showGacha(); if(GA.st) gaPz('nc'); };
 if($('pfRemove')) $('pfRemove').onclick=e=>{ const b=e.currentTarget; if(!b.dataset.sure){ b.dataset.sure=1; b.querySelector('span').textContent='¿Seguro? Pulsa otra vez'; return; } closeModal(); friendOp('remove',P.name); };
 el.querySelectorAll('.pfTabs .pxb').forEach(b=>b.onclick=()=>{ el.querySelectorAll('.pfTabs .pxb').forEach(x=>{ x.classList.toggle('on',x===b); x.setAttribute('aria-selected',x===b); }); $('pfStats').innerHTML=pfStatsHTML(P.byMode[b.dataset.m]); });
}
/* ---------- amigos: panel lateral del menú (estilo LoL) ----------
   Grupos En partida / En línea / Desconectados, solicitudes recibidas y enviadas y bloqueados. Todo lo valida el servidor
   (/api/friends); el estado de cada amigo llega en directo por Socket.io (friendUpd). Añadir por nombre responde siempre igual. */
const FR={list:null,open:false,sel:'',fold:{off:true,blocked:true},msg:null};
const FR_ST={game:'En partida',lobby:'En una sala',queue:'Buscando partida',menu:'En línea',off:'Desconectado'};
const frStatus=f=>f.st==='game'?`En partida${f.r?' · Ronda '+f.r:''}`:FR_ST[f.st]||'Desconectado';
async function loadFriends(){ if(!ACC) return; let d; try{ d=await api('/api/friends'); }catch(e){ return; }
 const prev=FR.list?new Set(FR.list.incoming.map(x=>x.name)):null; FR.list=d;
 if(prev) for(const x of d.incoming) if(!prev.has(x.name)) toast(`${x.name} quiere ser tu amigo`);
 renderFriends(); }
function onFriendUpd(d){ if(!FR.list||!d||typeof d.name!=='string') return; const f=FR.list.friends.find(x=>x.name===d.name); if(!f) return;
 f.st=FR_ST[d.st]?d.st:'off'; f.r=String(d.r||'').slice(0,6); f.mode=String(d.mode||'').slice(0,10); renderFriends(); }
async function friendOp(op,name){ try{ const d=await api('/api/friends/'+op,{name}); FR.list=d; FR.msg={ok:true,t:d.msg}; if(op!=='request') toast(d.msg); }catch(e){ FR.msg={ok:false,t:e.message}; if(op!=='request') toast(e.message); } FR.sel=''; renderFriends(); }
function openFriends(on){ FR.open=on===undefined?!FR.open:!!on; if(FR.open&&!FR.list) loadFriends(); renderFriends(); if(FR.open) setTimeout(()=>$('frName')&&$('frName').focus(),30); }
function frRow(f,kind){ const tk=TACS[f.trainer]?f.trainer:'', av=tk?artImg(tk):'<span class="frNone"></span>', n=esc(f.name), cs=kind==='friend'||kind==='in'?f.cs:'';
 let acts='', sub='';
 if(kind==='friend'){ sub=`<small class="frSt st-${f.st}"><i></i>${esc(frStatus(f))}</small>`;
   if(FR.sel===f.name) acts=`<div class="frActs"><button class="pxb" data-op="profile" data-n="${n}" type="button"><span>Perfil</span></button><button class="pxb" data-op="remove" data-n="${n}" type="button"><span>Eliminar</span></button><button class="pxb" data-op="block" data-n="${n}" type="button"><span>Bloquear</span></button></div>`; }
 else if(kind==='in'){ sub='<small class="frSt">Quiere ser tu amigo</small>'; acts=`<div class="frBtns"><button class="pxb pxb-sq frIc" data-op="accept" data-n="${n}" aria-label="Aceptar a ${n}" title="Aceptar" type="button"><i data-i="check" data-s="16"></i></button><button class="pxb pxb-sq frIc" data-op="decline" data-n="${n}" aria-label="Rechazar a ${n}" title="Rechazar" type="button"><i data-i="close" data-s="14"></i></button></div>`; }
 else if(kind==='out'){ sub='<small class="frSt">Solicitud enviada</small>'; acts=`<div class="frBtns"><button class="pxb pxb-sq frIc" data-op="cancel" data-n="${n}" aria-label="Cancelar la solicitud a ${n}" title="Cancelar" type="button"><i data-i="close" data-s="14"></i></button></div>`; }
 else if(kind==='blk'){ acts=`<div class="frBtns"><button class="pxb frTxtBtn" data-op="unblock" data-n="${n}" type="button"><span>Desbloquear</span></button></div>`; }
 return `<div class="frRow k-${kind}${kind==='friend'?' st-'+f.st:''}${FR.sel===f.name?' sel':''}" ${kind==='friend'?`data-pick="${n}" role="button" tabindex="0"`:''}><span class="frAv${csParse(cs).fr?' fr':''}" style="${frameVars(cs).slice(1)}">${av}</span><span class="frTxt"><b>${nameHTML(f.name,cs)}</b>${sub}</span>${kind!=='friend'?acts:''}</div>${kind==='friend'?acts:''}`; }
function frGroup(key,title,rows,kind){ if(!rows.length&&key!=='online') return ''; const fold=FR.fold[key];
 return `<section class="frGrp"><button class="frGrpH" data-fold="${key}" type="button" aria-expanded="${!fold}"><i class="frCar${fold?'':' open'}" aria-hidden="true"></i><span>${title}</span><b>${rows.length}</b></button>${fold?'':rows.map(f=>frRow(f,kind)).join('')||'<p class="frEmpty">Nadie por aquí ahora mismo.</p>'}</section>`; }
function renderFriends(){
 const btn=$('frBtn'), L=FR.list; if(!btn) return;
 const on=L?L.friends.filter(f=>f.st!=='off').length:0, inc=L?L.incoming.length:0;
 btn.innerHTML=`<i data-i="people" data-s="24"></i><span>Amigos</span><b class="frOn">${on}</b>${inc?`<em class="frBadge" aria-label="${inc} solicitudes">${inc}</em>`:''}`; btn.setAttribute('aria-expanded',FR.open); window.PX&&PX.hydrate(btn);
 const P=$('frPanel'); P.classList.toggle('hidden',!FR.open); if(!FR.open) return;
 const ack=csParse(myCs()).ac; P.style.setProperty('--frAc',ack?COSM.BY[ack].d.c:'');
 const game=L?L.friends.filter(f=>f.st==='game'):[], online=L?L.friends.filter(f=>f.st!=='game'&&f.st!=='off'):[], off=L?L.friends.filter(f=>f.st==='off'):[];
 const keep=$('frName')?$('frName').value:'';
 P.innerHTML=`<div class="frHead"><b>Amigos</b><span>${L?L.friends.length:0}/${L?L.max:100}</span><button class="mclose" id="frClose" aria-label="Cerrar amigos" type="button"><i data-i="close" data-s="16"></i></button></div>
  <form class="frAdd" id="frAdd" autocomplete="off"><input id="frName" maxlength="16" placeholder="Nombre exacto del jugador" aria-label="Nombre del jugador"><button class="pxb pxb-sq frIc" type="submit" aria-label="Enviar solicitud" title="Enviar solicitud"><i data-i="addfriend" data-s="20"></i></button></form>
  ${FR.msg?`<p class="frMsg ${FR.msg.ok?'ok':'bad'}" role="status">${esc(FR.msg.t)}</p>`:''}
  <div class="frList">${!L?'<p class="frEmpty">Cargando…</p>':
   (L.incoming.length?frGroup('in','Solicitudes',L.incoming,'in'):'')+frGroup('game','En partida',game,'friend')+frGroup('online','En línea',online,'friend')+frGroup('off','Desconectados',off,'friend')
   +(L.outgoing.length?frGroup('out','Enviadas',L.outgoing,'out'):'')+(L.blocked.length?frGroup('blocked','Bloqueados',L.blocked,'blk'):'')}</div>`;
 hydrate(P); window.PX&&PX.hydrate(P); if(keep&&!(FR.msg&&FR.msg.ok)) $('frName').value=keep;
 $('frClose').onclick=()=>openFriends(false);
 $('frAdd').onsubmit=e=>{ e.preventDefault(); const n=$('frName').value.trim(); if(!/^[A-Za-z0-9_]{3,16}$/.test(n)){ FR.msg={ok:false,t:'Escribe un nombre de 3 a 16 letras, números o _'}; renderFriends(); return; } friendOp('request',n); };
 P.querySelectorAll('[data-fold]').forEach(b=>b.onclick=()=>{ FR.fold[b.dataset.fold]=!FR.fold[b.dataset.fold]; renderFriends(); });
 P.querySelectorAll('[data-pick]').forEach(r=>{ const f=()=>{ FR.sel=FR.sel===r.dataset.pick?'':r.dataset.pick; renderFriends(); }; r.onclick=f; r.onkeydown=e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); f(); } }; });
 P.querySelectorAll('[data-op]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); const op=b.dataset.op, n=b.dataset.n;
   if(op==='profile'){ FR.sel=''; renderFriends(); return showProfile(n); }
   if((op==='remove'||op==='block')&&!b.dataset.sure){ b.dataset.sure=1; b.querySelector('span').textContent='¿Seguro?'; return; }
   friendOp(op,n); });
}
/* ---------- gacha cosmético (solo caramelos; todo es visual) ----------
   El servidor tira y cobra (/api/gacha). Cada pulsación lleva un nonce: un doble clic o un reintento no cobra dos veces.
   La Poké Ball es CSS: tiembla y se tiñe del color de la mejor rareza antes de mostrar las cartas. */
const GA={st:null,busy:false};
/* Cosméticos equipados: «cs» es una cadena corta («nc:fuego|tt:domador|…») validada contra el catálogo; los colores salen del
   catálogo, nunca del texto que llegue. Lo mismo para personas y rivales generados. */
const csParse=cs=>typeof COSM!=='undefined'?COSM.parseCs(cs):{};
const myCs=()=>ACC&&ACC.cosm&&typeof COSM!=='undefined'?COSM.eqString(ACC.cosm.eq,COSM.SLOTS):'';
function nameHTML(name,cs){ const k=csParse(cs).nc, d=k&&COSM.BY[k].d;
 if(!d) return `<span class="cn">${esc(name)}</span>`;
 return d.c?`<span class="cn" style="color:${d.c}">${esc(name)}</span>`:d.g?`<span class="cn cnG" style="--g1:${d.g[0]};--g2:${d.g[1]}">${esc(name)}</span>`:`<span class="cn cnA" style="--a:${d.a.join(',')}">${esc(name)}</span>`; }
const frameVars=cs=>{ const k=csParse(cs).fr, d=k&&COSM.BY[k].d; return d?`;--f1:${d.c[0]};--f2:${d.c[1]}`:''; };
const titleOf=cs=>{ const k=csParse(cs).tt; return k?COSM.BY[k].d.text:''; };
const iconOf=(cs,z)=>{ const k=csParse(cs).ic, d=k&&COSM.BY[k].d; return d&&window.PX?`<span class="cIc" style="--c:${d.c}">${PX.icon(d.i,z||18)}</span>`:''; };
// Datos del cosmético de un hueco que lleva un jugador (del catálogo, nunca de la red)
const cosD=(p,slot)=>{ const k=csParse(csOfP(p))[slot]; return k?COSM.BY[k].d:null; };
// Variocolor equipado (solo para su minileyenda y si es gratuita): 'hue:<de>,<a>:<dex>' para board3d
const tacDexC=p=>{ const d=cosD(p,'sh'), k=tacKey(p); return d&&d.tac===k&&!TACS[k].locked?`hue:${d.from},${d.to}:${tacDex(p)}`:tacDex(p); };
const trailOf=p=>{ const d=cosD(p,'tr'); return d?d.c:null; };
const csOfP=p=>p?(p===G.me&&!G.mirror&&!p.cs?myCs():p.cs||(NET.cos&&NET.cos[p.id])||''):'';
function onCos(d){ if(!d||!Array.isArray(d.pl)) return; NET.cos={}; for(const r of d.pl.slice(0,8)) if(Array.isArray(r)) NET.cos[r[0]|0]=String(r[1]||'').slice(0,200);
 if(G&&G.players) for(const p of G.players) if(NET.cos[p.id]!=null) p.cs=NET.cos[p.id]; renderUI(); }
const gaNonce=()=>{ try{ return crypto.randomUUID().replace(/-/g,'').slice(0,24); }catch(e){ return (Date.now().toString(36)+Math.random().toString(36).slice(2)).slice(0,24); } };
const cosTier=k=>COSM.TIER[(COSM.BY[k]||{}).t]||{name:'',col:'#b9b4d4'};
// Muestra en miniatura de un premio, hecha solo con CSS, iconos PX y retratos que ya existen
function cosChip(key){ const it=COSM.BY[key], d=it?it.d:{}, ty=COSM.typeOf(key), px=(n,z)=>window.PX?PX.icon(n,z):'';
 if(key==='cd') return `<span class="cc cc-amount">${px('candy',28)}<b>+${COSM.REFUND}</b></span>`;
 if(key==='dust') return `<span class="cc cc-amount">${px('crystal',28)}<b>+${COSM.BIG_DUST}</b></span>`;
 if(!it) return '';
 switch(ty){
  case 'nc': return `<span class="cc cc-name ${d.a?'anim':''}" style="${d.c?'color:'+d.c:d.g?`--g1:${d.g[0]};--g2:${d.g[1]}`:`--a:${d.a.join(',')}`}">${esc(ACC?ACC.name:'Entrenador')}</span>`;
  case 'tt': return `<span class="cc cc-title">«${esc(d.text)}»</span>`;
  case 'ic': return `<span class="cc cc-icon" style="--c:${d.c}">${px(d.i,30)}</span>`;
  case 'fr': return `<span class="cc cc-frame" style="--c1:${d.c[0]};--c2:${d.c[1]}">${artImg('pichu')}</span>`;
  case 'tr': return `<span class="cc cc-trail" style="--c1:${d.c[0]};--c2:${d.c[1]}"><i></i><i></i><i></i><i></i></span>`;
  case 'gr': return `<span class="cc cc-bubble">${esc(d.lines[0])}</span>`;
  case 'th': return `<span class="cc cc-theme" style="--c1:${d.c[0]};--c2:${d.c[1]}"><i></i></span>`;
  case 'ac': return `<span class="cc cc-accent" style="--c:${d.c}"><i></i><i></i><i></i></span>`;
  case 'fb': return `<span class="cc cc-orb" style="--c:${d.c}"></span>`;
  case 'tl': return `<span class="cc cc-tiles" style="--c1:${d.c[0]};--c2:${d.c[1]}"><i></i><i></i><i></i></span>`;
  case 'cr': return `<span class="cc cc-gem" style="--c:${d.c}"><i></i><i></i><i></i></span>`;
  case 'br': return `<span class="cc cc-barrier" style="--c1:${d.c[0]};--c2:${d.c[1]}"></span>`;
  case 'fn': return `<span class="cc cc-icon" style="--c:#ffd23f">${px('sound',30)}</span>`;
  case 'sh': return `<span class="cc cc-shiny" style="--h:${Math.round((d.to-d.from)*360)}deg">${portraitImg(TACS[d.tac].dex[0])}<i>${px('star',14)}</i></span>`;
  case 'tac': return `<span class="cc cc-mythic">${artImg(d.tac)}</span>`;
 } return ''; }
function gaCard(r,i){ const t=COSM.TIER[r.t]||cosTier(r.key), it=COSM.BY[r.key], name=r.key==='cd'?'Caramelos de vuelta':r.key==='dust'?'Polvo Estelar':it?it.name:r.key;
 return `<div class="gaCard t-${r.t}" style="--tc:${t.col};--i:${i}"><span class="gaTier">${r.t==='x'?'Colección':t.name}</span>${cosChip(r.key)}<b>${esc(name)}</b><small>${r.key==='cd'?'Caramelos':r.key==='dust'?'Ya tienes las míticas':COSM.TYPES[COSM.typeOf(r.key)]||''}</small>${r.new?'<em class="gaNew">Nuevo</em>':r.dup?`<em class="gaDup">Repetido · +${r.dust} polvo</em>`:''}</div>`; }
function gaPityHTML(st){ if(st.allMythic) return '<div class="gaPity owned"><span>Ya tienes a Eevee y a Mew: si vuelve a salir la mítica, recibes 1.500 de Polvo Estelar</span></div>';
 const done=COSM.PITY-st.pityLeft; const nx=(COSM.BY[COSM.missingMythics({inv:st.inv||[]})[0]]||{}).name||'Eevee'; return `<div class="gaPity"><span>${nx} garantizado en <b>${st.pityLeft}</b> tirada${st.pityLeft===1?'':'s'}</span><div class="rkBar" role="progressbar" aria-label="Garantía de mítica" aria-valuemin="0" aria-valuemax="${COSM.PITY}" aria-valuenow="${done}"><i style="width:${done/COSM.PITY*100}%"></i></div></div>`; }
function gaDailyBtn(st){ const l={lista:'Tirada diaria gratis',usada:'Diaria usada hoy',jugar:'Diaria: termina una partida'}[st.daily];
 return `<button class="pxb gaDaily${st.daily==='lista'?' ready':''}" id="gaD" type="button" ${st.daily==='lista'?'':'aria-disabled="true"'}><i data-i="star" data-s="20"></i><span>${l}</span></button>`; }
function renderGacha(){ const el=$('gaWrap'), st=GA.st; if(!el||!st) return;
 el.innerHTML=`<div class="gaHead"><div><div class="pxKicker">Gacha cosmético</div><h1>Poké Ball de la suerte</h1><p class="muted small">Solo cosméticos: nada cambia la partida.</p></div>
  <div class="gaBal"><span title="Caramelos">${PX.icon('candy',22)}<b id="gaCandy">${st.candies.toLocaleString('es-ES')}</b></span><span title="Polvo Estelar">${PX.icon('crystal',22)}<b id="gaDust">${st.dust.toLocaleString('es-ES')}</b></span></div></div>
 <div class="gaStage"><div class="gaBall" id="gaBall" aria-hidden="true"><i class="gbTop"></i><i class="gbBand"></i><i class="gbBtn"></i></div><div class="gaRes" id="gaRes" aria-live="polite"></div></div>
 ${gaPityHTML(st)}
 <div class="gaBtns"><button class="pxb pxb-main" id="ga1" type="button"><span class="pxbT"><b>Tirada</b><small>${PX.icon('candy',14)} ${st.price}</small></span></button>
  <button class="pxb pxb-alt" id="ga10" type="button"><span class="pxbT"><b>10 tiradas</b><small>${PX.icon('candy',14)} ${st.price10.toLocaleString('es-ES')}</small></span></button>${gaDailyBtn(st)}</div>
 <div class="gaLinks"><button class="pxb" id="gaOdds" type="button"><span>Probabilidades</span></button><button class="pxb" id="gaHist" type="button"><span>Historial</span></button><button class="pxb" id="gaShop" type="button"><i data-i="crystal" data-s="16"></i><span>Tienda de polvo</span></button><button class="pxb" id="gaColl" type="button"><i data-i="book" data-s="16"></i><span>Colección</span></button><button class="pxb pxb-alt" id="gaPz" type="button"><i data-i="gear" data-s="16"></i><span>Personalizar</span></button></div>`;
 hydrate(el); PX.hydrate(el);
 $('ga1').onclick=()=>gaDo('roll',{n:1}); $('ga10').onclick=()=>gaDo('roll',{n:10});
 $('gaD').onclick=()=>{ if(st.daily==='lista') gaDo('daily',{}); else toast(st.daily==='usada'?'Ya usaste la tirada gratis de hoy':'Termina una partida hoy para desbloquear la tirada gratis'); };
 $('gaOdds').onclick=gaOdds; $('gaHist').onclick=gaHist; $('gaShop').onclick=gaShop; $('gaColl').onclick=gaColl; $('gaPz').onclick=()=>gaPz(); }
async function showGacha(){ openModal('<div class="gaWrap" id="gaWrap"><p class="muted">Cargando…</p></div>',{closable:true,kind:'gacha'});
 try{ GA.st=await api('/api/gacha'); }catch(e){ const el=$('gaWrap'); if(el) el.innerHTML=`<p class="muted">${esc(e.message)}</p>`; return; } renderGacha(); }
function gaSync(o){ const st=GA.st; st.candies=o.candies; st.dust=o.dust; st.pity=o.pity; st.pityLeft=o.pityLeft; for(const r of o.res||[]) if(r.new&&!st.inv.includes(r.key)) st.inv.push(r.key); if((o.res||[]).some(r=>r.key===COSM.EEVEE&&r.new)) st.eevee=true; if(!COSM.missingMythics({inv:st.inv}).length) st.allMythic=true;
 if(ACC){ ACC.comp.candies=o.candies; ACC.cosm=Object.assign(ACC.cosm||{},{inv:st.inv.slice(),pity:o.pity,dust:o.dust,eevee:st.eevee}); renderMenu(); } }
async function gaDo(op,body){ if(GA.busy) return; const st=GA.st; if(op==='roll'&&st.candies<(body.n===10?st.price10:st.price)){ toast(`Necesitas ${body.n===10?st.price10:st.price} caramelos`); return; }
 GA.busy=true; document.querySelectorAll('#gaWrap .gaBtns .pxb').forEach(b=>b.disabled=true);
 const ball=$('gaBall'), res=$('gaRes'); res.innerHTML=''; ball.className='gaBall shake'; ball.style.removeProperty('--tc');
 let o; try{ o=await api('/api/gacha/'+op,Object.assign({nonce:gaNonce()},body)); }catch(e){ toast(e.message); GA.busy=false; renderGacha(); return; }
 if(op==='daily') st.daily='usada';
 const best=['m','l','e','r','c','x'].find(t=>o.res.some(r=>r.t===t))||'c', tc=(COSM.TIER[best]||{col:'#b9b4d4'}).col;
 await new Promise(r=>setTimeout(r,900)); if(!$('gaBall')) { GA.busy=false; return; }
 ball.className='gaBall glow t-'+best; ball.style.setProperty('--tc',tc); if(best==='m'||best==='l') Music.evolve(best==='m'?'mega':'tac');
 await new Promise(r=>setTimeout(r,650)); GA.busy=false; gaSync(o); if(!$('gaWrap')) return; renderGacha();
 $('gaBall').className='gaBall open t-'+best; $('gaBall').style.setProperty('--tc',tc);
 $('gaRes').innerHTML=`<div class="gaCards n${o.res.length>1?'10':'1'}">${o.res.map(gaCard).join('')}</div>`; hydrate($('gaRes')); PX.hydrate($('gaRes'));
 if(o.eevee) toast(o.mythic===COSM.MEW?'¡Has conseguido a Mew, la minileyenda mítica!':'¡Has conseguido a Eevee, la minileyenda mítica!'); }
function gaBack(){ return '<button class="pxLink" id="gaBack" type="button">← Volver al gacha</button>'; }
function gaSub(html){ const el=$('gaWrap'); el.innerHTML=gaBack()+html; hydrate(el); PX.hydrate(el); $('gaBack').onclick=renderGacha; }
function gaOdds(){ const per=t=>COSM.POOL[t].length;
 gaSub(`<h2 class="pxH">Probabilidades</h2><p class="small muted">Cada tirada sortea primero la rareza y después un premio de esa rareza, todos con la misma probabilidad. La tirada diaria funciona igual.</p>
 <table class="gaOdds"><thead><tr><th>Rareza</th><th>Probabilidad</th><th>Premios</th><th>Cada premio</th><th>Si se repite</th></tr></thead><tbody>
 ${COSM.TIERS.map(t=>{ const n=per(t.k), pc=t.k==='c'?t.p*(1-COSM.REFUND_SHARE):t.p; return `<tr style="--tc:${t.col}"><td><b>${t.name}</b></td><td>${(t.p*100).toLocaleString('es-ES',{maximumFractionDigits:1})} %</td><td>${n}${t.k==='c'?' + caramelos de vuelta':''}</td><td>${(pc/n*100).toLocaleString('es-ES',{maximumFractionDigits:3})} %</td><td>${t.dust?'+'+t.dust+' polvo':'—'}</td></tr>`; }).join('')}
 </tbody></table>
 <ul class="help"><li><b>Caramelos de vuelta:</b> ${(COSM.TIER.c.p*COSM.REFUND_SHARE*100).toLocaleString('es-ES')} % de las tiradas devuelven ${COSM.REFUND} caramelos.</li>
 <li><b>Eevee y Mew</b> (míticas): 0,1 % fijo por tirada (te toca una de las que te faltan), sin subida progresiva, y <b>garantizada en la tirada ${COSM.PITY}</b> (primero Eevee y después Mew). La tirada diaria también cuenta. Al salir, el contador vuelve a 0.</li>
 <li><b>Colecciones:</b> reúne todos los premios de un elemento y ganas su título exclusivo (${COSM.COLLECTIONS.map(c=>'«'+esc(COSM.BY[c.reward].name)+'»').join(', ')}).</li>
 <li><b>Tirada diaria:</b> gratis una vez al día después de terminar una partida.</li></ul>`); }
function gaHist(){ const h=(GA.st.hist||[]).slice().reverse();
 gaSub(`<h2 class="pxH">Tus últimas tiradas</h2>${h.length?`<div class="gaHist">${h.map(([t,k])=>{ const tr=k==='cd'?COSM.TIER.c:k==='dust'?COSM.TIER.m:cosTier(k), it=COSM.BY[k]; return `<div class="gaHRow" style="--tc:${tr.col}"><span class="gaHT">${tr.name}</span><span class="gaHN">${esc(k==='cd'?'Caramelos de vuelta':k==='dust'?'Polvo Estelar':it?it.name:k)}</span><small>${fmtDate(t*1000)}</small></div>`; }).join('')}</div>`:'<div class="hEmpty"><p>Aún no has tirado.</p></div>'}`); }
function gaShop(){ const st=GA.st, own=new Set(st.inv);
 const tiers=COSM.TIERS.filter(t=>t.price);
 gaSub(`<h2 class="pxH">Tienda de Polvo Estelar</h2><p class="small muted">Los premios repetidos se convierten en Polvo Estelar. Aquí compras premios concretos (Eevee no está a la venta). Tienes <b>${st.dust}</b> de polvo.</p>
 ${tiers.map(t=>{ const items=COSM.POOL[t.k].filter(k=>!own.has(k)); return `<h3 class="gaShopH" style="--tc:${t.col}">${t.name} · ${t.price} polvo</h3>${items.length?`<div class="gaShop">${items.map(k=>`<button class="gaItem" data-k="${k}" type="button" ${st.dust<t.price?'aria-disabled="true"':''} style="--tc:${t.col}">${cosChip(k)}<b>${esc(COSM.BY[k].name)}</b><small>${COSM.TYPES[COSM.typeOf(k)]}</small></button>`).join('')}</div>`:'<p class="small muted">Ya los tienes todos.</p>'}`; }).join('')}`);
 $('gaWrap').querySelectorAll('.gaItem').forEach(b=>b.onclick=async()=>{ const k=b.dataset.k, t=COSM.TIER[COSM.BY[k].t]; if(GA.st.dust<t.price) return toast(`Necesitas ${t.price} de Polvo Estelar`); if(GA.busy) return;
   if(!b.dataset.sure){ b.dataset.sure=1; b.querySelector('small').textContent=`¿Comprar por ${t.price}? Pulsa otra vez`; return; }
   GA.busy=true; try{ const o=await api('/api/gacha/buy',{key:k,nonce:gaNonce()}); gaSync(o); toast('Comprado: '+COSM.BY[k].name); }catch(e){ toast(e.message); } GA.busy=false; gaShop(); }); }
// ----- Personalizar: equipar lo que tienes, con vista previa de cómo te ven los demás -----
const PZ_GAME=new Set(['tr','gr','fb','tl','cr','br','fn','sh']); // se ven dentro de la partida
function pzPreview(eq){ const cs=COSM.eqString(eq,COSM.SLOTS), tk=savedTac()||'charmander', thk=csParse(cs).th, th=thk?COSM.BY[thk].d.c:null;
 return `<div class="pzPrev"><div class="pzCard${th?' themed':''}" ${th?`style="--lg:${th[0]};--th2:${th[1]}"`:''}><span class="frAv pzAv${csParse(cs).fr?' fr':''}" style="${frameVars(cs).slice(1)}">${artImg(tk)}</span>
  <div class="pzWho"><b>${iconOf(cs,16)}${nameHTML(ACC?ACC.name:'Entrenador',cs)}</b>${titleOf(cs)?`<small>«${esc(titleOf(cs))}»</small>`:'<small class="muted">Sin título</small>'}</div></div>
  <p class="small muted">Así te ven en la lista de jugadores, en la sala, en tus amigos y en la pantalla de resultados.</p></div>`; }
function gaPz(slot){ const st=GA.st; GA.slot=slot||GA.slot||'nc'; const sl=GA.slot, own=st.inv.filter(k=>COSM.typeOf(k)===sl&&COSM.validEq(sl,k)&&(sl!=='sh'||tacOwned(COSM.BY[k].d.tac))), cur=st.eq[sl]||'';
 gaSub(`<h2 class="pxH">Personalizar</h2>${pzPreview(st.eq)}
 <div class="pzSlots" role="tablist">${COSM.SLOTS.map(x=>`<button class="pxb${x===sl?' on':''}" role="tab" aria-selected="${x===sl}" data-sl="${x}" type="button"><span>${COSM.TYPES[x]}</span>${st.eq[x]?'<i class="pzDot" aria-label="equipado"></i>':''}</button>`).join('')}</div>
 ${PZ_GAME.has(sl)?'<p class="small muted">Se ve dentro de la partida.</p>':''}
 <div class="gaShop pzItems"><button class="gaItem${cur?'':' on'}" data-k="" type="button" style="--tc:#6f6a88"><span class="cc"><b class="muted">—</b></span><b>Ninguno</b><small>Quitar</small></button>
 ${own.map(k=>{ const t=cosTier(k); return `<button class="gaItem${k===cur?' on':''}" data-k="${k}" type="button" style="--tc:${t.col}">${cosChip(k)}<b>${esc(COSM.BY[k].name)}</b><small>${k===cur?'Equipado':t.name||'Colección'}</small></button>`; }).join('')}</div>
 ${own.length?'':'<p class="small muted">Aún no tienes ninguno de este tipo: consíguelos en el gacha o en la tienda de polvo.</p>'}`);
 const W=$('gaWrap'); W.querySelectorAll('[data-sl]').forEach(b=>b.onclick=()=>gaPz(b.dataset.sl));
 W.querySelectorAll('.pzItems .gaItem').forEach(b=>b.onclick=async()=>{ if(GA.busy) return; GA.busy=true;
   try{ const o=await api('/api/cosm/equip',{slot:sl,key:b.dataset.k}); st.eq=o.eq||{}; if(ACC){ ACC.cosm=Object.assign(ACC.cosm||{},{eq:Object.assign({},st.eq)}); renderMenu(); } }catch(e){ toast(e.message); }
   GA.busy=false; gaPz(sl); }); }
// ----- Colección: todo el catálogo, lo que tienes en color y lo que falta en silueta, y el progreso de cada colección -----
function gaColl(){ const st=GA.st, own=new Set(st.inv), all=COSM.LIST.filter(i=>i.key!=='cd'&&i.t!=='x'), got=all.filter(i=>own.has(i.key)).length;
 const cols=COSM.COLLECTIONS.map(c=>{ const n=c.items.filter(k=>own.has(k)).length, done=own.has(c.reward); return `<div class="coRow${done?' done':''}"><b>${esc(c.name)}</b><div class="rkBar" role="progressbar" aria-valuemin="0" aria-valuemax="${c.items.length}" aria-valuenow="${n}"><i style="width:${n/c.items.length*100}%"></i></div><span>${n}/${c.items.length}</span><small>${done?'Título conseguido: ':'Premio: título '}«${esc(COSM.BY[c.reward].name)}»</small></div>`; }).join('');
 const types=COSM.SLOTS.concat(['tac']);
 gaSub(`<h2 class="pxH">Colección · ${got}/${all.length}</h2><div class="coCols">${cols}</div>
 ${types.map(ty=>{ const items=all.filter(i=>COSM.typeOf(i.key)===ty); if(!items.length) return ''; const n=items.filter(i=>own.has(i.key)).length;
   return `<h3 class="gaShopH">${COSM.TYPES[ty]} · ${n}/${items.length}</h3><div class="gaShop coGrid">${items.map(i=>{ const t=COSM.TIER[i.t], h=own.has(i.key);
     return `<div class="gaItem${h?'':' locked'}" style="--tc:${t.col}" title="${h?'':'Aún no lo tienes · '}${esc(t.name)}">${cosChip(i.key)}<b>${esc(i.name)}</b><small>${t.name}</small></div>`; }).join('')}</div>`; }).join('')}`); }
// Anuncio: alguien ha conseguido a Eevee (solo llega a quien está en el menú)
function onAnn(d){ if(!d||typeof d.name!=='string') return; const el=$('annBar'); if(!el) return; el.innerHTML=`${PX.icon('star',22)}<span><b>${esc(d.name.slice(0,20))}</b> ha conseguido a ${d.k==='mew'?'Mew':'Eevee'}</span>`; el.classList.remove('hidden'); clearTimeout(onAnn.t); onAnn.t=setTimeout(()=>el.classList.add('hidden'),6000); }
// Mientras se está en el menú se precargan el escenario y los modelos seguros de la primera ronda (minileyenda, Magikarp y los coste 1); en móvil o con ahorro de datos, solo el escenario
function prefetchForGame(){ if(!window.B3||!B3.prefetch||!B3.ready) return; const save=navigator.connection&&navigator.connection.saveData, t=TACS[savedTac()]||TACS.charmander;
 const dex=save?[]:[t.dex[0],129,...(matchMedia("(min-width:1101px)").matches?Object.values(DEF).filter(d=>d.cost===1&&!d.evoOf).map(d=>dexOf(d,1)):[])]; B3.prefetch([...new Set(dex)]); }
function showMenu(){ loadFriends(); setTimeout(()=>{ layout.key=''; layout(); prefetchForGame(); },50); renderMenu(); try{ const sk=sock(); if(sk&&sk.connected) sk.emit('resumable'); renderResume(); }catch(e){} if($('islands')) $('islands').hidden=true; $('auth').classList.add('hidden'); $('menu').classList.remove('hidden'); pxArt($('menu'));
 // tras una partida con ascenso, descenso o rango revelado, se celebra al volver al menú
 if(NET.rankFx){ const d=NET.rankFx; NET.rankFx=null; setTimeout(()=>showRankChange(d),250); } }
// Iconos pixel y escenario del menú (ui-art.js); si no cargó, el menú sigue funcionando con texto
function pxArt(root){ if(window.PX) PX.hydrate(root||document); } // la escena pixel del menú (MenuScene) ya no se arranca: fondo azul liso hasta que haya fondo nuevo
/* ---------- escena pixel del menú (estilo Esmeralda) ---------- */
// Cielo por bandas, nubes grandes, mar con destellos, valla y hierba; Latios y Latias cruzan el cielo.
const GEN3=d=>`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iii/emerald/${d}.png`;
function cloudSprite(w,h,seed){
 const P=pixelPainter(w,h,seed), r=P.r, n=5+Math.floor(r()*4), blobs=[];
 for(let i=0;i<n;i++){ const rad=h*(.2+r()*.16)*(1-Math.abs(i/(n-1)-.5)*.6); blobs.push([w*(.16+.68*i/(n-1)),h*.62-rad*.6-r()*h*.08,rad]); }
 blobs.push([w*.5,h*.38,h*.3]);
 for(const [x,y,rad] of blobs) P.disc(x,y+2,rad,'#a8cbea');
 P.rrect(w*.1,h*.62,w*.8,h*.2,3,'#a8cbea');
 for(const [x,y,rad] of blobs) P.disc(x,y,rad,'#e4f2fb');
 P.rrect(w*.12,h*.6,w*.76,h*.16,3,'#cfe5f5');
 for(const [x,y,rad] of blobs) P.disc(x-rad*.18,y-rad*.22,rad*.68,'#ffffff');
 return P.c;
}
const Scene={
 cv:null,g:null,ps:3,lw:0,lh:0,base:null,clouds:[],sparkles:[],last:0,
 init(){ this.cv=$('scene'); this.g=this.cv.getContext('2d'); addEventListener('resize',()=>this.resize()); this.resize(); },
 resize(){
   const ps=Math.max(3,Math.round(Math.min(innerWidth,innerHeight)/175));
   this.ps=ps; this.lw=Math.max(8,Math.ceil(innerWidth/ps)); this.lh=Math.max(8,Math.ceil(innerHeight/ps));
   this.cv.width=this.lw; this.cv.height=this.lh; this.build();
 },
 build(){
   const {lw,lh}=this, P=pixelPainter(lw,lh,5), hz=Math.round(lh*.62), ground=Math.round(lh*.8);
   this.hz=hz; this.ground=ground;
   // cielo en bandas con transición en damero
   const bands=['#4880e8','#5890f0','#68a0f0','#78b0f8','#88c0f8','#98d0f8','#b0dcf8','#c8e8f8'];
   const bh=hz/bands.length;
   bands.forEach((c,i)=>{ const y=Math.round(i*bh); P.rect(0,y,lw,Math.ceil(bh)+1,c); if(i) for(let x=0;x<lw;x+=2){ P.px(x+((y)%2),y,bands[i-1]); P.px(x+((y+1)%2),y+1,bands[i-1]); } });
   // nubecillas en el horizonte
   for(let x=-6;x<lw+6;x+=9+Math.floor(P.r()*8)){ const rad=2+P.r()*3; P.disc(x,hz-rad*.6,rad,'#e8f4fc'); P.disc(x-1,hz-rad*.8,rad*.6,'#ffffff'); }
   P.rect(0,hz-1,lw,1,'#f8f8f8');
   // mar
   const sea=['#3070e0','#3878e8','#4080e8','#4888f0'];
   for(let y=hz;y<ground;y++){ const k=Math.min(sea.length-1,Math.floor((y-hz)/((ground-hz)/sea.length))); P.rect(0,y,lw,1,sea[k]); }
   for(let i=0;i<lw*(ground-hz)/14;i++){ const y=hz+1+Math.floor(P.r()*(ground-hz-1)), x=P.r()*lw; P.rect(x,y,2+P.r()*4,1,'#5898f0'); }
   // reflejo del sol
   for(let y=hz+1;y<ground;y+=2){ const w=(y-hz)*.9+4; P.rect(lw*.62-w/2+P.r()*3,y,w*(.4+P.r()*.5),1,'#88c0f8'); }
   // hierba con borde irregular
   P.rect(0,ground,lw,lh-ground,'#58a838');
   for(let x=0;x<lw;x++){ const h=1+((x*7)%5===0?2:(x*3)%4===0?1:0); P.rect(x,ground-h,1,h,'#78c850'); P.px(x,ground-h,'#a8e070'); }
   for(let y=ground+3;y<lh;y++) for(let x=(y%2);x<lw;x+=2) if(P.r()<.06) P.px(x,y,y>lh*.92?'#489030':'#78c850');
   for(let i=0;i<lw*(lh-ground)/40;i++) P.tuft(P.r()*lw,ground+3+P.r()*(lh-ground-3),'#387820','#98d860');
   // valla blanca como la de la ilustración de referencia
   for(let x=3;x<lw;x+=8){ P.rect(x,ground-6,2,6,'#f8f8f8'); P.px(x+1,ground-6,'#c8d0e0'); P.rect(x,ground-1,2,1,'#a8b0c0'); }
   P.rect(0,ground-4,lw,1,'#e8ecf4');
   this.base=P.c;
   // nubes grandes (dos capas de paralaje)
   this.clouds=[];
   for(let i=0;i<6;i++){ const w=Math.round(40+(i%3)*22), h=Math.round(w*.42); this.clouds.push({img:cloudSprite(w,h,11+i),x:(i*lw/5.5)%(lw+w),y:Math.round(hz*(.12+((i*37)%50)/100)),sp:(i%2?1.2:2.2),w}); }
   this.sparkles=Array.from({length:Math.round(lw/6)},(_,i)=>[Math.floor(((i*97)%lw)),hz+2+((i*31)%(ground-hz-3)),i*.7]);
 },
 visible(){ return !$('menu').classList.contains('hidden')||!$('auth').classList.contains('hidden'); },
 frame(now){
   if(!this.visible()||now-this.last<60) return; this.last=now;
   const g=this.g, t=now/1000, {lw,lh,hz}=this; g.imageSmoothingEnabled=false;
   g.drawImage(this.base,0,0);
   for(const c of this.clouds){ const x=Math.round(((c.x-t*c.sp)%(lw+c.w)+lw+c.w)%(lw+c.w)-c.w); g.drawImage(c.img,x,c.y); }
   for(const [x,y,ph] of this.sparkles){ const k=(t*1.6+ph)%3; if(k<.5){ g.fillStyle='#f8f8f8'; g.fillRect(x,y,k<.25?1:2,1); } }
   // Latios y Latias (sprites de Esmeralda) cruzando el cielo
   const span=lw+120, fly=(d,off,yy,sp)=>{ const e=loadImg('g3:'+d,GEN3(d)); if(e.status!=='ok') return; const x=Math.round(lw+30-((t*sp+off)%span)), y=Math.round(yy+Math.sin(t*1.6+off)*2); g.drawImage(e.img,x,y,32,32); };
   fly(380,0,hz*.04,10); fly(381,22,hz*.16,10);
   const w=loadImg('g3:278',GEN3(278)); if(w.status==='ok'){ const x=Math.round(((t*14+lw*.3)%(lw+64))-32), y=Math.round(hz*.12+Math.sin(t*2)*3); g.save(); g.translate(x+32,y); g.scale(-1,1); g.drawImage(w.img,-16,0,32,32); g.restore(); }
 },
};

const SETTINGS_KEY='pokeTactics.settings';
const SYNCED=['vol','muted','timer','speed','theme','diff'];
function loadSettings(){ try{ const s=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null'); if(s) for(const k of SYNCED) if(k in s) S[k]=s[k]; }catch(e){} }
let settingsTimer=0;
function saveSettings(){
 const o={}; for(const k of SYNCED) o[k]=S[k];
 try{ localStorage.setItem(SETTINGS_KEY,JSON.stringify(o)); }catch(e){}
 // Se guardan también en la cuenta (agrupando cambios seguidos)
 if(ACC){ clearTimeout(settingsTimer); settingsTimer=setTimeout(()=>api('/api/me',{settings:o}).catch(()=>{}),1200); }
}
function applyTheme(){ const r=document.documentElement; const dark=S.theme==='dark'||(S.theme==='system'&&!(window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches)); r.dataset.theme=dark?'dark':'light'; readColors(); }

/* ---------- cuentas ---------- */
let ACC=null;
async function api(path,body){
 let res;
 try{ res=await fetch(path,body===undefined?{credentials:'same-origin'}:{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); }
 catch(e){ throw Object.assign(new Error('No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.'),{status:0}); }
 let data={}; try{ data=await res.json(); }catch(e){}
 if(!res.ok) throw Object.assign(new Error(data.error||'Algo salió mal, inténtalo de nuevo'),{status:res.status,field:data.field});
 return data;
}
function applyAccount(user){
 ACC=user; S.name=user.name.slice(0,14); if(TACS[user.trainer]) try{ localStorage.setItem('pt_tac',user.trainer); }catch(e){}
 const s=user.settings||{}; for(const k of SYNCED) if(k in s) S[k]=s[k];
 try{ localStorage.setItem(SETTINGS_KEY,JSON.stringify(Object.fromEntries(SYNCED.map(k=>[k,S[k]])))); }catch(e){}
 applyTheme(); Music.setVol();
 if(G&&!G.players.length) G.me=makePlayer(0,S.name,false,S.avatar,S.trainer);
}
let authMode='login', authBusy=false;
function setAuthMode(m){
 authMode=m; const reg=m==='register';
 $('tabLogin').setAttribute('aria-selected',!reg); $('tabReg').setAttribute('aria-selected',reg);
 $('auPass2Wrap').hidden=!reg; $('auUserHint').hidden=!reg;
 $('auPass').autocomplete=reg?'new-password':'current-password';
 $('auGo').textContent=reg?'Crear cuenta':'Entrar';
 authError('');
}
function authError(msg,field){
 $('auErr').textContent=msg||'';
 for(const [id,f] of [['auUser','user'],['auPass','pass'],['auPass2','pass2']]) $(id).setAttribute('aria-invalid',field===f?'true':'false');
 if(field==='user') $('auUser').focus(); else if(field==='pass') $('auPass').focus(); else if(field==='pass2') $('auPass2').focus();
}
function showAuth(msg){ setTimeout(()=>{ layout.key=''; layout(); },0);
 ACC=null; FR.list=null; FR.open=false; FR.msg=null; closeModal(); $('menu').classList.add('hidden'); $('auth').classList.remove('hidden'); pxArt();
 $('auPass').value=''; $('auPass2').value=''; setAuthMode(authMode); if(msg) authError(msg);
 setTimeout(()=>($('auUser').value?$('auPass'):$('auUser')).focus(),50);
}
async function submitAuth(e){
 e.preventDefault(); if(authBusy) return;
 const user=$('auUser').value.trim(), pass=$('auPass').value, reg=authMode==='register';
 if(!user) return authError('Escribe tu usuario','user');
 if(reg&&!/^[A-Za-z0-9_]{3,16}$/.test(user)) return authError('El usuario debe tener de 3 a 16 letras, números o _','user');
 if(!pass) return authError('Escribe tu contraseña','pass');
 if(reg&&pass.length<6) return authError('La contraseña debe tener al menos 6 caracteres','pass');
 if(reg&&pass!==$('auPass2').value) return authError('Las contraseñas no coinciden','pass2');
 authBusy=true; $('auGo').disabled=true; $('auGo').textContent=reg?'Creando…':'Entrando…'; authError('');
 try{
   const {user:u}=await api(reg?'/api/register':'/api/login',{user,pass});
   $('auPass').value=''; $('auPass2').value='';
   applyAccount(u); resetSocket();
   if(!TACS[u.trainer]) showTacPick(true); else showMenu();
 }catch(err){ authError(err.message,err.field); }
 finally{ authBusy=false; $('auGo').disabled=false; $('auGo').textContent=reg?'Crear cuenta':'Entrar'; }
}
function bindAuth(){
 $('authForm').addEventListener('submit',submitAuth);
 $('tabLogin').onclick=()=>setAuthMode('login');
 $('tabReg').onclick=()=>setAuthMode('register');
 $('auShow').onclick=()=>{ const on=$('auPass').type==='password'; $('auPass').type=$('auPass2').type=on?'text':'password'; $('auShow').textContent=on?'Ocultar':'Ver'; $('auShow').setAttribute('aria-label',on?'Ocultar contraseña':'Mostrar contraseña'); };
}
async function logout(){
 try{ await api('/api/logout',{}); }catch(e){}
 if(G) G.over=true; if(NET.mode!=='sp') leaveRoom(); resetSocket();
 G={phase:'idle',me:makePlayer(0,'Tú',false,'🧢'),players:[],log:[],speed:1,pool:{}};
 showAuth();
}
// El socket se abre con la sesión: al entrar o salir de la cuenta hay que rehacerlo
function resetSocket(){ if(NET.sock){ NET.sock.removeAllListeners(); NET.sock.disconnect(); NET.sock=null; } }

// Ahorro de transferencia de Render: los retratos (art/) y las insignias (img/rank) se piden a jsDelivr fijados al commit
// desplegado, como los modelos animados. Solo se cambia si jsDelivr responde; si una imagen falla, vuelve a nuestro servidor.
// Las imágenes pequeñas (retratos, objetos, Pokédex, insignias, trofeo) se piden a nuestro servidor: jsDelivr tardaba hasta 30 s en servir por primera vez cada archivo de un commit nuevo y no había forma de saber cuáles estaban listos. Solo los modelos 3D van por CDN (con respaldo en carrera, ver hedged en board3d.js). Aquí queda la cadena de respaldo de imágenes y la precarga de los retratos
// Un AVIF diminuto: si el navegador no sabe decodificarlo, todos los retratos pasan a WebP (y se repinta lo que ya estaba en pantalla)
function artFormat(){ const im=new Image(); im.onerror=()=>{ if(ART_EXT==='webp') return; ART_EXT='webp'; for(const k in CARD_ART) CARD_ART[k]=CARD_ART[k].replace('.avif?','.webp?'); if(G&&G.players&&G.players.length) renderUI(); };
 im.src='data:image/avif;base64,AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAAA+gABAAAAAAAAAB0AAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABhdjAxAAAAAA5waXRtAAAAAAABAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAlbWRhdBIACgc4AAaQENBpMhAZQmMEwAA0AACQQM6Xt10S'; }
function cdnAssets(){
 artFormat();
 addEventListener('error',e=>{ const el=e.target; if(!el||el.tagName!=='IMG') return;
   // un retrato AVIF que falla se pide en WebP antes de caer al sprite de la Pokédex
   const src=el.getAttribute('src')||''; if(src.includes('.avif?')&&!el.dataset.fbw){ el.dataset.fbw=1; el.src=src.replace('.avif?','.webp?'); return; }
   if(el.dataset&&el.dataset.sp&&!el.dataset.fb3){ el.dataset.fb3=1; el.src=SPRITE(el.dataset.sp); }
   else if(el.dataset&&el.dataset.dex&&!el.dataset.fb2){ el.dataset.fb2=1; el.src='dex/'+String(el.dataset.dex).split('/').pop()+'.png'; el.classList.add('artFb'); } },true);
 preloadArt(TAC_KEYS);
}
async function boot(){
 cv=$('cv'); ctx=cv.getContext('2d');
 cdnAssets();
 loadSettings();
 G={phase:'idle',me:makePlayer(0,S.name,false,S.avatar,S.trainer),players:[],log:[],speed:1,pool:{}};

 layout(); applyTheme(); bindEvents(); Scene.init();
 // Sin precarga en el menú: los modelos se piden al entrar en la partida (primero los tuyos)
 if(!window.B3) window.addEventListener('b3ready',()=>sizeB3());
 setInterval(tick,33); requestAnimationFrame(frame); checkBuild(); setInterval(checkBuild,300000);
 try{ const {user}=await api('/api/me'); applyAccount(user); if(!TACS[user.trainer]) showTacPick(true); else showMenu(); }
 catch(err){ showAuth(err.status===401?'':err.message); }
}

/* ============================ [SERVER API] ============================ */
// La usa server.js: cada sala ejecuta este mismo archivo en su propio contexto aislado (vm).
function serverCreate(cfg,emit){
 geo=computeGeo(640);
 NET.mode='host'; NET.named={emit:(t,d)=>{ try{ emit(t,d); }catch(e){} return Promise.resolve(); }};
 S.timer=PLAN_T; S.speed=[1,2,4].includes(cfg.speed)?cfg.speed:1; // el tiempo de planificación es fijo (cfg.timer ya no se usa)
 newGame({mp:true,server:true,diff:DIFF_NAME[cfg.diff]?cfg.diff:'normal',humans:cfg.humans||[],bots:Array.isArray(cfg.bots)?cfg.bots:[],taken:typeof cfg.taken==='function'?cfg.taken:null});
 // Solo en las pruebas (cfg.fast, que server.js pone con PT_TEST_FAST): «listo» adelanta el combate y vale la velocidad x2/x4. En partida real, nunca
 G.fast=!!cfg.fast; G.speed=G.fast?S.speed:1;
 netFlush(true);
}
function serverTick(dt){
 if(!G||G.over) return;
 if(G.phase==='planning'){ G.timer-=dt; if(G.timer<=0||(G.fast&&humansReady())) startCombat(); } // nadie puede adelantar el inicio de la ronda (ya no hay «¡Listo!»; G.fast solo en pruebas)
 if(G.phase==='augment'&&Date.now()>G.augDeadline) autoAugs();
 if(G.phase==='carousel') updateCarousel(dt);
 if(G.phase==='combat'){ dropKillOrbs(); payCombatGold(false); }
 if(G.phase==='combat'&&!G.resolving&&Date.now()>=(G.resolveNotBefore||0)){ G.resolving=true; later(resolveRound,300); }
 hostNetTick();
}
function serverAct(peer,a){ if(!G||!G.players) return; const p=G.players.find(x=>x.remote&&x.peer===peer); if(!p) return; if(Number.isInteger(a.q)&&a.q>=0&&a.q<1e9) p.aq=a.q; const r=applyAct(p,a); if(r&&!r.ok&&r.why) note(p,r.why,true); }
// Un jugador desconectado queda «ausente» (p.away): conserva su asiento y se comporta como un jugador presente que no toca nada (cobra su economía, su tablero pelea,
// se aplican los mismos automatismos que a cualquiera que no actúa), pero NO lo juega ningún bot y la partida no se espera a que esté listo
function serverLeave(peer){ if(!G||!G.players) return; const p=G.players.find(x=>x.remote&&x.peer===peer); if(p){ p.remote=false; p.away=true; p.tp=null; note(null,`🔌 ${p.name} se desconectó (su asiento queda reservado)`); } }
// Reconexión: el asiento vuelve a ser suyo con otro id de conexión. También si el servidor aún cree viva la conexión vieja
// (un corte de red tarda hasta 55 s en notarse por el latido): si no, «Volver a mi partida» fallaba justo cuando hace falta
function serverRejoin(oldPeer,newPeer){
 if(!G||!G.players||G.over) return false; const p=G.players.find(x=>x.peer===oldPeer&&x.alive&&(x.away||x.remote)); if(!p) return false;
 p.peer=newPeer; p.remote=true; p.away=false; p.tp=null; if(G.phase==='augment'&&G.augDeadline) G.augDeadline=Math.max(G.augDeadline,Date.now()+20000); NET.lastPriv[p.id]=''; NET.lastPub=''; NET.lastBdP=[]; note(null,`🔌 ${p.name} volvió a la partida`); return true;
}
// Reenvía a quien vuelve lo que solo se manda una vez: su estado, el combate de la ronda y el carrusel
function serverResend(peer){
 if(!G||!G.players) return; const p=G.players.find(x=>x.remote&&x.peer===peer); if(!p) return;
 netFlush(true);
 if(G.phase==='combat'&&G.fights) netSendCombats(p);
 if(G.phase==='carousel') netCarousel();
}
// Pasado el plazo de reconexión, los ausentes quedan eliminados (último puesto entre los vivos) para que su resultado se apunte
function serverForfeit(){
 if(!G||!G.players||G.over) return; let n=alivePlayers().length;
 for(const p of G.players.filter(x=>x.away&&x.alive)){ p.finalComp=compSnap(p); p.place=n--; p.alive=false; p.hp=0; }
}
// Rendirse (act surrender, desde la fase 3-1): queda eliminado en el último puesto entre los vivos, su equipo y su tienda vuelven al pool y la partida sigue
// para los demás (si solo queda uno, gana). En una partida en curso su combate termina solo; en el carrusel no se admite (su avatar seguiría eligiendo)
function surrenderPlayer(p){
 if(!p||!p.alive||!G||G.over) return false;
 p.finalComp=compSnap(p); p.place=alivePlayers().length; p.alive=false; p.hp=0;
 for(const u of allUnits(p)) returnToPool(u.baseId,Math.pow(3,u.star-1)); for(const k of p.shop) if(k) returnToPool(k,1);
 p.board={}; p.bench=Array(BENCH).fill(null); p.shop=[null,null,null,null,null]; p.orbs=[];
 note(null,`🏳️ ${p.name} se rinde (puesto ${p.place})`);
 if(alivePlayers().length<=1||(!G.mp&&p===G.me)){ if(alivePlayers().length===1){ const w=alivePlayers()[0]; w.finalComp=compSnap(w); w.place=1; } later(endGame,600); }
 return true;
}
// Los 8 jugadores para la pantalla de resultados (solo al terminar alguien, no en cada tick): los eliminados con su equipo final y
// los que siguen vivos con el de ahora. Todos con la misma forma: nada distingue a una persona de un rival generado.
// Cosméticos equipados de los 8 (cadena corta por jugador; viaja una vez por partida en «cos»)
function serverCosmetics(){ return G&&G.players?G.players.map(p=>[p.id,String(p.cs||'').slice(0,200)]):[]; }
function serverBoards(){ return G&&G.players?G.players.map(p=>({peer:p.peer||null,name:String(p.name).slice(0,20),cs:p.cs||'',place:p.place||0,tac:p.tac,tf:(p.tacForm||['','']).slice(0,2),comp:p.place&&p.finalComp?p.finalComp:compSnap(p)})):[]; }
function serverInfo(){ return {over:!!(G&&G.over),humans:G&&G.players?G.players.filter(p=>p.remote&&p.alive).length:0,round:G&&G.round?G.round.s+'-'+G.round.n:'',places:G&&G.players?G.players.filter(p=>p.peer&&p.place>0).map(p=>[p.peer,p.place]):[],
  plist:G&&G.players?G.players.map(p=>({peer:p.peer||null,name:String(p.name).slice(0,20),place:p.place||0,comp:p.peer&&p.place?p.finalComp||null:null})):[]}; }

if(HEADLESS){ module.exports={generateBotName,serverBoards,serverCosmetics,serverCreate,serverTick,serverAct,serverLeave,serverRejoin,serverResend,serverForfeit,serverInfo,newGame,TRAINERS,TAC_KEYS,makeFights,possibleOpps,get G(){return G},ROUNDS,DEF,UNIT_LIST,AUGS,ITEMS,RECIPE,FULL_KEYS,BASIC,abDesc,baseCombatUnit,abilPower,abOf,SONGS,createCombatSnap,teamSnap,simulate,castAbility,dealDamage,applyAct,
  // Para las pruebas de aumentos (test/augments.js)
  AUG_BY,augProgress,augmentChoices,applyAugment,augFire,augSnap,resolvePick,autoPicks,CHAOS,makeInst,addUnitToBench,giveItem,traitCounts,traitTiers,addItemToUnit,reroll,buy,sellAt,addXp,combine,resolveRound,startCombat,nextRound,
  // Para test/sinergias.js
  TRAITS,PRISM,FORGE_OF,tierOf,mewtwoUnstable,MEW_NEED,packInst,unpackInst,emblemCountsOf,useItem,combineBench,ensureGloves,makeCombatUnit,lootTrack,growPotential,boardUnits}; } else boot();
