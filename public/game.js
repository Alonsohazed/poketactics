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
const SPRITE=d=>`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${d}.png`;
const ITEM_SPRITE=n=>`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${n}.png`;
const TRAINER_SPRITE=k=>`https://play.pokemonshowdown.com/sprites/trainers/${k}.png`;
const weighted=arr=>{ const tot=arr.reduce((s,a)=>s+a[0],0); let r=Math.random()*tot; for(const a of arr){ r-=a[0]; if(r<0) return a[1]; } return arr[arr.length-1][1]; };
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return((t^t>>>14)>>>0)/4294967296; }; }
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* =============================== [DATA] =============================== */
const POOL_SIZE=[30,25,18,10,9];
const SHOP_ODDS={1:[100,0,0,0,0],2:[100,0,0,0,0],3:[75,25,0,0,0],4:[55,30,15,0,0],5:[45,33,20,2,0],6:[30,40,25,5,0],7:[16,30,43,10,1],8:[15,20,32,30,3],9:[10,17,25,33,15],10:[5,10,20,40,25]};
const XP_NEED={1:2,2:2,3:6,4:10,5:20,6:36,7:56,8:68,9:68};
const BASE_INCOME=[0,2,3,4], PASSIVE_XP=[0,2,0,2];
const STAGE_DMG={1:1,2:2,3:4,4:6,5:9,6:11,7:15,8:18,9:22};
const COST_HEX=['#7d8593','#23964a','#2f6fde','#9446cf','#d99a00'];
const BENCH=9, MAX_ITEMS_BENCH=10;

const T=(icon,color,bp,scope,sum,lv)=>({icon,color,bp,scope,sum,lv});
const TRAITS={
 'Fuego':T('🔥','#ee6b2f',[2,4,6],'Afecta a tus Pokémon Fuego','Sus ataques queman al objetivo.',['Quemadura: 2% de la vida máx. del objetivo por segundo','Quemadura: 4% por segundo','Quemadura: 7% por segundo y +20% de daño']),
 'Agua':T('💧','#3b8fe8',[2,4,6],'Afecta a tus Pokémon Agua (y a todo tu equipo con 6)','Cargan su habilidad más rápido.',['+4 de maná por ataque','+8 de maná por ataque','+14 de maná por ataque · Todo tu equipo: +3']),
 'Planta':T('🌿','#4caf50',[2,4],'Afecta a tus Pokémon Planta','Se curan solos durante el combate.',['Regeneran 1.5% de vida máx. por segundo','Regeneran 3.5% de vida máx. por segundo']),
 'Eléctrico':T('⚡','#d9b400',[2,4],'Afecta a tus Pokémon Eléctrico','Atacan más rápido y pueden paralizar.',['+25% de velocidad de ataque','+55% de velocidad de ataque y 20% de prob. de paralizar 0.4s al golpear']),
 'Psíquico':T('🔮','#e0569b',[2,4,6],'Afecta a tus Pokémon Psíquico (y a todo tu equipo con 6)','Sus habilidades pegan más fuerte.',['+25 de poder de habilidad','+55 de poder de habilidad','+100 de poder · Todo tu equipo: +20']),
 'Roca':T('🪨','#a08c5b',[2,4,6],'Afecta a tus Pokémon Roca (y a todo tu equipo desde 4)','Más defensa contra ataques físicos.',['Roca: +25 de defensa','Roca: +55 · Equipo: +10','Roca: +100 · Equipo: +25']),
 'Dragón':T('🐉','#6f5ce0',[2,4,6],'Afecta a tus Pokémon Dragón','Más vida y más daño.',['+200 de vida y +8% de daño','+450 de vida y +18% de daño','+800 de vida y +35% de daño']),
 'Fantasma':T('👻','#7b62a3',[2,4,6],'Afecta a tus Pokémon Fantasma','Esquivan ataques físicos.',['Esquivan el 15%','Esquivan el 30%','Esquivan el 45%']),
 'Hada':T('🧚','#e27bb9',[2,4,6],'Afecta a TODO tu equipo','Todo tu equipo empieza el combate con escudo.',['Escudo de 100 (8s)','Escudo de 220 (8s)','Escudo de 400 (8s)']),
 'Normal':T('⭕','#9a987f',[2,4,6],'Afecta a tus Pokémon Normal','Más resistentes y algo más rápidos.',['+120 de vida y +8% de vel. de ataque','+300 de vida y +15%','+550 de vida y +25%']),
 'Acero':T('🔩','#8a9bb0',[2,4],'Afecta a tus Pokémon Acero','Reciben menos daño de todo tipo.',['Reciben un 15% menos de daño','Reciben un 30% menos de daño']),
 'Siniestro':T('🌑','#4b3f5c',[2,4],'Afecta a tus Pokémon Siniestro','Rematan a los heridos.',['+25% de daño a enemigos por debajo del 50% de vida','+60% de daño a enemigos por debajo del 50% de vida']),
 'Lucha':T('🥋','#b5462f',[2,4],'Afecta a tus Pokémon Lucha','Se curan con el daño que hacen.',['12% de robo de vida','25% de robo de vida']),
 'Guardián':T('🛡️','#5d7a8c',[2,4,6,8],'Afecta a tus Guardianes y, desde 4, a TODO tu equipo','Defensa y resistencia para aguantar en primera fila.',['Guardianes: +20 de defensa y resistencia','Guardianes: +40 · Equipo: +10','Guardianes: +70 · Equipo: +25','Guardianes: +110 · Equipo: +45']),
 'Coloso':T('🦍','#c0392b',[2,4,6,8],'Afecta a tus Colosos','Ganan vida máxima.',['+15% de vida máxima','+30% de vida máxima','+50% de vida máxima','+80% de vida máxima']),
 'Tirador':T('🎯','#d35400',[2,4,6],'Afecta a tus Tiradores','Más daño de ataque.',['+18% de daño de ataque','+40% de daño de ataque','+70% de daño de ataque']),
 'Hechicero':T('✨','#8e44ad',[2,4,6,8],'Afecta a TODO tu equipo (doble para Hechiceros)','Poder de habilidad para todo tu equipo.',['Equipo +12 · Hechiceros +24','Equipo +25 · Hechiceros +50','Equipo +45 · Hechiceros +90','Equipo +70 · Hechiceros +140']),
 'Asesino':T('🗡️','#34495e',[2,4,6],'Afecta a tus Asesinos','Saltan a la retaguardia al empezar. La sinergia les da críticos.',['+15% de prob. crítica y +10% de daño crítico','+30% y +20%','+45% y +35%']),
 'Sanador':T('💖','#16a085',[2,4,6],'Afecta a TODO tu equipo','Todo tu equipo recupera maná con el tiempo.',['+2 de maná por segundo','+4 de maná por segundo','+7 de maná por segundo']),
 'Fortuna':T('💰','#e0a800',[2,3],'Afecta a tu economía','Ganas oro después de cada combate.',['+1 de oro por combate (+1 extra si ganas)','+3 de oro por combate (+2 extra si ganas)']),
 'Legendario':T('👑','#c79400',[1],'Afecta a cada Legendario','Bonificación propia de cada Legendario.',['+20% de vida y de daño de ataque']),
};
const ROLE={
 t:{hp:720,ad:45,as:.6,range:1,df:45,mr:40,mana:50,maxMana:100},
 b:{hp:660,ad:56,as:.7,range:1,df:35,mr:30,mana:20,maxMana:80},
 a:{hp:560,ad:60,as:.8,range:1,df:25,mr:20,mana:0,maxMana:60},
 r:{hp:500,ad:56,as:.75,range:4,df:20,mr:20,mana:0,maxMana:70},
 m:{hp:500,ad:40,as:.7,range:4,df:20,mr:25,mana:20,maxMana:75},
 h:{hp:560,ad:36,as:.65,range:3,df:25,mr:25,mana:30,maxMana:90},
};
const HPM=[1,1.12,1.28,1.5,1.85], ADM=[1,1.12,1.3,1.55,1.9];
const STAR=[1,1.8,3.24];
const ABIL_BASE=[180,250,330,440,600], ABIL_STAR=[1,1.5,2.6];
const ROLE_NAME={t:'Tanque',b:'Cuerpo a cuerpo',a:'Asesino',r:'Tirador',m:'Mago',h:'Soporte'};

const U=(key,names,dex,cost,role,traits,ab)=>({key,names,dex,name:names[0],cost,role,traits,ab});
const UNIT_LIST=[
 U('charmander',['Charmander','Charmeleon','Charizard'],[4,5,6],1,'b',['Fuego','Coloso'],[['burn','Ascuas',{m:1.1}],['cone','Lanzallamas',{m:1,len:2,burn:.03}],['cone','Llamarada',{m:1.3,len:3,burn:.04}]]),
 U('bulbasaur',['Bulbasaur','Ivysaur','Venusaur'],[1,2,3],1,'t',['Planta','Guardián'],[['seed','Drenadoras',{m:1.2,dur:4,h:1}],['knock','Látigo Cepa',{m:1,k:2,stun:1}],['zone','Planta Feroz',{r:1,m:1.3,dur:3,root:1.2}]]),
 U('squirtle',['Squirtle','Wartortle','Blastoise'],[7,8,9],1,'t',['Agua','Guardián'],[['shield','Refugio',{m:1.3}],['spin','Giro Rápido',{m:.3,n:4,dr:.3}],['wave','Hidrocañón',{m:1.2,w:1.2,push:1}]]),
 U('pichu',['Pichu','Pikachu','Raichu'],[172,25,26],1,'r',['Eléctrico','Tirador'],[['bolt','Impactrueno',{m:1.4}],['chain','Rayo',{n:3,m:.9}],['strike','Trueno',{r:1,m:1.4,delay:.6,stun:.8}]]),
 U('geodude',['Geodude','Graveler','Golem'],[74,75,76],1,'b',['Roca','Coloso'],[['harden','Rizo Defensa',{df:25,heal:.5}],['slam','Rodar',{r:1,m:.9,stun:.8}],['nova','Explosión',{r:2,m:1.75,selfDmg:.3}]]),
 U('gastly',['Gastly','Haunter','Gengar'],[92,93,94],1,'m',['Fantasma','Hechicero'],[['bolt','Lengüetazo',{m:1.2,stun:1}],['mark','Maldición',{m:.9,amp:.3,dur:4}],['blast','Bola Sombra',{r:1,m:1.15,shred:.3}]]),
 U('abra',['Abra','Kadabra','Alakazam'],[63,64,65],1,'m',['Psíquico','Hechicero'],[['bolt','Confusión',{m:1.3}],['pull','Telequinesis',{r:2,m:.8,stun:.8}],['strike','Premonición',{r:1,m:1.6,delay:1.2,stun:.5,ghost:1}]]),
 U('cleffa',['Cleffa','Clefairy','Clefable'],[173,35,36],1,'h',['Hada','Sanador'],[['heal','Encanto',{n:1,m:.9}],['zone','Luz Lunar',{r:1,m:1.1,dur:3,ally:1,self:1}],['teamShield','Deseo',{m:.45,heal:.25}]]),
 U('rattata',['Rattata','Raticate'],[19,20],1,'a',['Normal','Asesino'],[['dash','Ataque Rápido',{m:1.3,to:'low'}],['execute','Hipercolmillo',{m:1.4,th:.25}]]),
 U('dratini',['Dratini','Dragonair','Dragonite'],[147,148,149],1,'r',['Dragón','Tirador'],[['bolt','Furia Dragón',{m:1.4}],['frenzy','Danza Dragón',{as:.2,ad:.15}],['line','Hiperrayo',{m:2,stunSelf:1}]]),
 U('meowth',['Meowth','Persian'],[52,53],1,'r',['Normal','Fortuna'],[['gold','Día de Pago',{m:1,g:1}],['gold','Día de Pago',{m:1.1,g:1,r:1}]]),
 U('machop',['Machop','Machoke','Machamp'],[66,67,68],1,'b',['Lucha','Coloso'],[['empower','Golpe Kárate',{n:3,m:.5}],['knock','Sísmico',{m:1.15,k:2,stun:1}],['combo','Puño Dinámico',{n:4,m:.55,stun:1.5}]]),
 U('magikarp',['Magikarp','Gyarados'],[129,130],1,'b',['Agua','Coloso'],[['splash','Salpicadura',{}],['wave','Cascada',{m:1.1,w:1.2,stun:.6}],['line','Hiperrayo',{m:2.2}]]),
 U('diglett',['Diglett','Dugtrio'],[50,51],1,'a',['Roca','Asesino'],[['dash','Excavar',{m:1.4,to:'far',stealth:1}],['nova','Terremoto',{r:2,m:.8}]]),
 U('eevee',['Eevee'],[133],2,'b',['Normal','Coloso'],[['stack','Adaptación',{m:.6,hp:25,ad:3,mm:50}]]),
 U('growlithe',['Growlithe','Arcanine'],[58,59],2,'b',['Fuego','Coloso'],[['dash','Colmillo Ígneo',{m:1.2,to:'target',burn:.03}],['dash','Velocidad Extrema',{m:1.5,to:'low',r:1,burn:.03}]]),
 U('psyduck',['Psyduck','Golduck'],[54,55],2,'m',['Agua','Hechicero'],[['sing','Confusión',{r:0,s:1.5,m:1}],['wave','Hidropulso',{m:1,w:1,stun:.8}]]),
 U('chikorita',['Chikorita','Bayleef','Meganium'],[152,153,154],2,'h',['Planta','Sanador'],[['heal','Síntesis',{n:2,m:.8}],['teamShield','Pantalla de Luz',{m:.4}],['zone','Aromaterapia',{r:2,m:1,dur:4,ally:1,self:1}]]),
 U('magnemite',['Magnemite','Magneton','Magnezone'],[81,82,462],2,'r',['Eléctrico','Acero','Tirador'],[['bolt','Onda Voltio',{m:1.3,stun:.5}],['chain','Bomba Imán',{n:3,m:.85}],['line','Cañón Destello',{m:1.6,shred:.3}]]),
 U('onix',['Onix','Steelix'],[95,208],2,'t',['Roca','Guardián'],[['harden','Fortaleza',{df:30,heal:.8}],['slam','Cola Férrea',{r:1,m:.9,stun:1.3}]]),
 U('drowzee',['Drowzee','Hypno'],[96,97],2,'t',['Psíquico','Guardián'],[['sing','Hipnosis',{r:0,s:2,m:.6}],['sing','Come Sueños',{r:1,s:1.5,m:.8,drain:.5}]]),
 U('igglybuff',['Igglybuff','Jigglypuff','Wigglytuff'],[174,39,40],2,'h',['Hada','Normal','Sanador'],[['heal','Encanto',{n:2,m:.7}],['sing','Canto',{r:1,s:2,m:.3}],['sing','Voz Cautivadora',{r:2,s:2,m:.6}]]),
 U('scyther',['Scyther','Scizor'],[123,212],2,'a',['Acero','Asesino'],[['combo','Corte Furia',{n:3,m:.55}],['execute','Puño Bala',{m:1.5,th:.2}]]),
 U('poliwag',['Poliwag','Poliwhirl','Poliwrath'],[60,61,62],2,'b',['Agua','Lucha','Coloso'],[['bolt','Burbuja',{m:1.2}],['sing','Hipnosis',{r:1,s:1.2,m:.6}],['combo','Puño Dinámico',{n:3,m:.7,stun:1.2}]]),
 U('sableye',['Sableye'],[302],2,'a',['Siniestro','Fortuna'],[['dash','Ladrón',{m:1.2,to:'low',g:1}]]),
 U('houndour',['Houndour','Houndoom'],[228,229],2,'m',['Fuego','Siniestro','Hechicero'],[['burn','Ascuas',{m:1.1}],['cone','Lanzallamas',{m:1,len:4,burn:.04}]]),
 U('riolu',['Riolu','Lucario'],[447,448],2,'r',['Lucha','Acero','Tirador'],[['bolt','Palmeo',{m:1.3,stun:.6}],['multi','Esfera Aural',{n:3,m:.75}]]),
 U('ponyta',['Ponyta','Rapidash'],[77,78],3,'a',['Fuego','Asesino'],[['dash','Nitrocarga',{m:1.2,to:'far',burn:.03,selfAs:.15}],['dash','Envite Ígneo',{m:1.7,to:'low',r:1,burn:.04}]]),
 U('shellder',['Shellder','Cloyster'],[90,91],3,'t',['Agua','Guardián'],[['harden','Refugio',{df:35,heal:.6}],['multi','Carámbano',{n:5,m:.5,chill:3,el:'Hielo'}]]),
 U('oddish',['Oddish','Gloom','Vileplume'],[43,44,45],3,'m',['Planta','Hechicero'],[['zone','Somnífero',{r:1,m:.5,dur:2,sleep:1.2}],['poison','Polvo Veneno',{m:1.1,dur:5,r:1,el:'Veneno'}],['zone','Danza Pétalo',{r:2,m:1.2,dur:3}]]),
 U('elekid',['Elekid','Electabuzz','Electivire'],[239,125,466],3,'b',['Eléctrico','Coloso'],[['empower','Puño Trueno',{n:3,m:.55,stun:.3}],['chain','Puño Trueno',{n:3,m:.9}],['slam','Voltio Cruel',{r:1,m:1.4,stun:1}]]),
 U('rhyhorn',['Rhyhorn','Rhydon','Rhyperior'],[111,112,464],3,'b',['Roca','Coloso'],[['dash','Derribo',{m:1.2,to:'target',stun:1}],['nova','Terremoto',{r:2,m:.75}],['strike','Avalancha',{r:1,m:1.5,delay:.5,stun:1,v:'rocks'}]]),
 U('misdreavus',['Misdreavus','Mismagius'],[200,429],3,'h',['Fantasma','Sanador'],[['drain','Mal de Ojo',{m:1,h:1,ally:1}],['drain','Poder Oculto',{m:1.2,h:1.2,ally:1,shred:.3}]]),
 U('mimejr',['Mime Jr.','Mr. Mime'],[439,122],3,'t',['Psíquico','Hada','Guardián'],[['teamShield','Pantalla de Luz',{m:.4}],['reflect','Barrera',{m:1,pct:.4}]]),
 U('horsea',['Horsea','Seadra','Kingdra'],[116,117,230],3,'m',['Dragón','Hechicero'],[['bolt','Pistola Agua',{m:1.4}],['line','Hidrobomba',{m:1.3}],['blast','Pulso Dragón',{r:2,m:.9}]]),
 U('togepi',['Togepi','Togetic','Togekiss'],[175,176,468],3,'h',['Hada','Sanador'],[['metro','Metrónomo',{}],['heal','Deseo',{n:3,m:.7}],['buff','Gracia Divina',{as:.25,heal:.4}]]),
 U('tauros',['Tauros'],[128],3,'b',['Normal','Coloso'],[['dash','Derribo',{m:1.3,to:'target',stun:1,r:1}]]),
 U('gimmighoul',['Gimmighoul','Gholdengo'],[999,1000],3,'m',['Fantasma','Fortuna'],[['gold','Moneda Oculta',{m:1.1,g:1}],['gold','Fiebre Dorada',{m:.75,g:2,all:1}]]),
 U('munchlax',['Munchlax','Snorlax'],[446,143],3,'t',['Normal','Guardián'],[['rest','Engullir',{m:1}],['rest','Descanso',{m:2,sleep:1.5}],['slam','Golpe Cuerpo',{r:1,m:1.05,stun:1.3}]]),
 U('absol',['Absol'],[359],3,'a',['Siniestro','Asesino'],[['execute','Tajo Umbrío',{m:1.5,th:.3}]]),
 U('ditto',['Ditto'],[132],3,'b',['Normal','Coloso'],[['copy','Transformación',{}]]),
 U('larvitar',['Larvitar','Pupitar','Tyranitar'],[246,247,248],4,'t',['Roca','Guardián'],[['harden','Endurecimiento',{df:40,heal:.6}],['shield','Fortaleza',{m:1.6}],['zone','Tormenta Arena',{r:2,m:1.8,dur:4,self:1,root:1,chill:1,v:'sand'}]]),
 U('ralts',['Ralts','Kirlia','Gardevoir'],[280,281,282],4,'h',['Psíquico','Hada','Sanador'],[['heal','Encanto',{n:2,m:.8}],['teamShield','Paz Mental',{m:.45,ap:10}],['meteor','Fuerza Lunar',{m:.55,healAll:.3}]]),
 U('gible',['Gible','Gabite','Garchomp'],[443,444,445],4,'a',['Dragón','Asesino'],[['dash','Garra Dragón',{m:1.3,to:'far'}],['execute','Carga Dragón',{m:1.5,th:.25}],['slam','Terremoto',{r:2,m:.85,stun:.3}]]),
 U('duskull',['Duskull','Dusclops','Dusknoir'],[355,356,477],4,'t',['Fantasma','Guardián'],[['sing','Mal de Ojo',{r:0,s:1.5,m:.6}],['taunt','Anulación',{m:1.2}],['pull','Mundo Sombrío',{r:2,m:.9,stun:1.2,self:1}]]),
 U('shinx',['Shinx','Luxio','Luxray'],[403,404,405],4,'a',['Eléctrico','Asesino'],[['dash','Placaje',{m:1.3,to:'far'}],['chain','Chispa',{n:3,m:1}],['execute','Colmillo Rayo',{m:1.6,th:.25,stun:1}]]),
 U('turtwig',['Turtwig','Grotle','Torterra'],[387,388,389],4,'t',['Planta','Guardián'],[['harden','Refugio',{df:35,heal:.7}],['drain','Gigadrenado',{m:1.2,h:1.2}],['nova','Terremoto',{r:2,m:1,stun:1}]]),
 U('beldum',['Beldum','Metang','Metagross'],[374,375,376],4,'b',['Acero','Coloso'],[['dash','Derribo',{m:1.3,to:'target'}],['empower','Puño Meteoro',{n:3,m:.7}],['slam','Puño Meteoro',{r:1,m:1,stun:.6}]]),
 U('bagon',['Bagon','Shelgon','Salamence'],[371,372,373],4,'m',['Dragón','Hechicero'],[['burn','Ascuas',{m:1.2}],['harden','Fortaleza',{df:40,heal:1}],['meteor','Draco Meteoro',{m:.7}]]),
 U('lapras',['Lapras'],[131],4,'h',['Agua','Sanador'],[['wave','Surf',{m:.6,w:1.6,stun:.4,healTeam:.18}]]),
 U('zorua',['Zorua','Zoroark'],[570,571],4,'a',['Siniestro','Asesino'],[['dash','Finta',{m:1.4,to:'low',stealth:1}],['dash','Juego Sucio',{m:1.8,to:'low',stealth:2,r:1}]]),
 U('timburr',['Timburr','Gurdurr','Conkeldurr'],[532,533,534],4,'b',['Lucha','Coloso'],[['empower','Ultrapuño',{n:3,m:.6}],['nova','Martillazo',{r:1,m:1.1,stun:1}],['combo','Ultrapuño',{n:5,m:.6}]]),
 U('hatenna',['Hatenna','Hattrem','Hatterene'],[856,857,858],4,'m',['Psíquico','Hada','Hechicero'],[['bolt','Confusión',{m:1.4}],['blast','Brillo Mágico',{r:1,m:1}],['meteor','Velo Mental',{m:.65,stun:.5}]]),
 U('litwick',['Litwick','Lampent','Chandelure'],[607,608,609],4,'m',['Fuego','Fantasma','Hechicero'],[['drain','Infortunio',{m:1.1,h:.6}],['burn','Fuego Fatuo',{m:1,r:1}],['zone','Infierno',{r:2,m:2,dur:3,burn:.03}]]),
 U('rowlet',['Rowlet','Dartrix','Decidueye'],[722,723,724],4,'r',['Planta','Fantasma','Tirador'],[['multi','Hoja Afilada',{n:3,m:.6}],['multi','Hoja Aguda',{n:4,m:.6}],['line','Puntada Sombría',{m:1.8,shred:.4}]]),
 U('mewtwo',['Mewtwo'],[150],5,'m',['Psíquico','Hechicero','Legendario'],[['meteor','Onda Mental',{m:.75,stun:.5}]]),
 U('rayquaza',['Rayquaza'],[384],5,'r',['Dragón','Tirador','Legendario'],[['line','Ascenso Draco',{m:2.2}]]),
 U('zapdos',['Zapdos'],[145],5,'r',['Eléctrico','Tirador','Legendario'],[['chain','Electrocañón',{n:6,m:.9,stun:.6}]]),
 U('moltres',['Moltres'],[146],5,'m',['Fuego','Hechicero','Legendario'],[['meteor','Sofoco',{m:.75,burn:.04}]]),
 U('kyogre',['Kyogre'],[382],5,'m',['Agua','Hechicero','Legendario'],[['meteor','Pulso Primigenio',{m:.7,manaTeam:20}]]),
 U('groudon',['Groudon'],[383],5,'b',['Roca','Coloso','Legendario'],[['strike','Filo del Abismo',{r:2,m:1.1,delay:.4,stun:1,v:'rocks'}]]),
 U('giratina',['Giratina'],[487],5,'a',['Fantasma','Dragón','Asesino','Legendario'],[['dash','Golpe Umbrío',{m:1.9,to:'low',stealth:1.5,r:1}]]),
 U('lugia',['Lugia'],[249],5,'t',['Psíquico','Guardián','Legendario'],[['taunt','Aerochorro',{m:1.5,teamShield:.3}]]),
 U('hooh',['Ho-Oh'],[250],5,'h',['Fuego','Sanador','Legendario'],[['meteor','Fuego Sagrado',{m:.55,burn:.03,healAll:.4}]]),
 U('darkrai',['Darkrai'],[491],5,'m',['Siniestro','Hechicero','Legendario'],[['sing','Brecha Negra',{all:1,s:2,m:.5,drain:.4}]]),
];
const EVOS=[
 U('vaporeon',['Vaporeon'],[134],2,'t',['Agua','Guardián'],[['taunt','Acua Aro',{m:1.2,heal:.5,stk:1}]]),
 U('jolteon',['Jolteon'],[135],2,'a',['Eléctrico','Asesino'],[['multi','Pin Misil',{n:6,m:.4,stk:1}]]),
 U('flareon',['Flareon'],[136],2,'b',['Fuego','Coloso'],[['burn','Envite Ígneo',{m:1.2,r:1,stk:1}]]),
 U('espeon',['Espeon'],[196],2,'m',['Psíquico','Hechicero'],[['blast','Psicocarga',{r:1,m:1.2,stun:.5,stk:1}]]),
 U('umbreon',['Umbreon'],[197],2,'t',['Siniestro','Guardián'],[['reflect','Luz Lunar',{m:1,pct:.4,heal:.5,stk:1}]]),
 U('leafeon',['Leafeon'],[470],2,'a',['Planta','Asesino'],[['execute','Hoja Aguda',{m:1.6,th:.25,stk:1}]]),
 U('sylveon',['Sylveon'],[700],2,'h',['Hada','Sanador'],[['teamShield','Voz Cautivadora',{m:.4,heal:.3,stk:1}]]),
].map(e=>({...e,evoOf:'eevee',mult:1.3}));
const DEF={}; for(const u of [...UNIT_LIST,...EVOS]) DEF[u.key]=u;
const dexOf=(d,star)=>Array.isArray(d.dex)?d.dex[Math.min(star-1,d.dex.length-1)]:d.dex;
const nameOf=(d,star)=>d.names?d.names[Math.min(star-1,d.names.length-1)]:d.name;
const abOf=(d,star)=>d.ab[Math.min(star-1,d.ab.length-1)];
const typeColor=d=>d&&d.traits&&d.traits[0]&&TRAITS[d.traits[0]]?TRAITS[d.traits[0]].color:'#e9d27a';
const METRO=[['bolt','Hiperrayo',{m:1.8}],['nova','Explosión',{r:2,m:1}],['heal','Recuperación',{n:3,m:.8}],['meteor','Cometa Draco',{m:.6}],['sing','Canto',{r:1,s:2,m:.3}],['splash','Salpicadura',{}],['teamShield','Protección',{m:.5}],['chain','Rayo',{n:4,m:.8}]];
const KIND_NAME={bolt:'Disparo',burn:'Fuego',blast:'Área',nova:'Área propia',line:'Rayo en línea',chain:'Cadena',multi:'Proyectiles',combo:'Combo',dash:'Salto',execute:'Remate',meteor:'Golpe global',shield:'Escudo',taunt:'Provocación',reflect:'Reflejo',harden:'Endurecer',rest:'Descanso',heal:'Curación',teamShield:'Escudo de equipo',buff:'Mejora de equipo',frenzy:'Frenesí',empower:'Potenciar ataques',sing:'Sueño',drain:'Drenaje',gold:'Oro',stack:'Acumulación infinita',splash:'¿?',copy:'Copia',metro:'Aleatoria',
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

/* ============================ [ABILITIES] ============================ */
function abDesc(ab,P,star){
 const [k,,p]=ab; const d=x=>R0(P*x); const ex=[];
 if(p.stun) ex.push(`aturde ${p.stun}s`); if(p.burn&&k!=='zone') ex.push(`quema ${(p.burn*100).toFixed(0)}% de vida máx./s (4s)`); if(p.shred) ex.push(`reduce su resistencia un ${R0(p.shred*100)}%`); if(p.chill&&k!=='zone') ex.push(`le hace atacar un 35% más lento ${p.chill}s`);
 const e=ex.length?` (${ex.join(', ')})`:''; let t='';
 switch(k){
  case 'bolt': t=`Golpea al objetivo por ${d(p.m)} de daño mágico${e}.`; break;
  case 'burn': t=p.r?`Llamas en el objetivo y los adyacentes: ${d(p.m)} de daño y quemadura del ${R0((p.burn||.03)*100)}%/s.`:`Quema al objetivo: ${d(p.m)} de daño y ${R0((p.burn||.03)*100)}% de su vida máx. por segundo (4s).`; break;
  case 'blast': t=`Explosión en el objetivo (radio ${p.r}): ${d(p.m)} de daño mágico${e}.`; break;
  case 'nova': t=`Golpea a los enemigos a ${p.r} casilla${p.r>1?'s':''} a su alrededor: ${d(p.m)} de daño${e}.${p.selfDmg?` Pierde un ${R0(p.selfDmg*100)}% de su vida (nunca muere por ello).`:''}`; break;
  case 'line': t=`Rayo en línea recta que atraviesa a todos los enemigos: ${d(p.m)} de daño${e}.${p.stunSelf?` Después se recarga ${p.stunSelf}s.`:''}`; break;
  case 'chain': t=`Rebota entre ${p.n} enemigos: ${d(p.m)} de daño a cada uno${e}.`; break;
  case 'multi': t=`Lanza ${p.n} proyectiles a enemigos al azar: ${d(p.m)} de daño cada uno${e}.`; break;
  case 'combo': t=`Golpea ${p.n} veces seguidas al objetivo: ${d(p.m)} por golpe${p.stun?`; el último aturde ${p.stun}s`:''}.`; break;
  case 'dash': t=`Salta junto al enemigo ${p.to==='far'?'más lejano':p.to==='low'?'con menos vida':'objetivo'} y le inflige ${d(p.m)}${p.r?` (y ${d(p.m*.6)} a los cercanos)`:''}${e}.${p.stealth?` Se vuelve invisible ${p.stealth}s.`:''}${p.selfAs?` Gana +${R0(p.selfAs*100)}% de vel. de ataque.`:''}`; break;
  case 'execute': t=`Inflige ${d(p.m)} al objetivo${e}. Si queda por debajo del ${R0((p.th+.05*(star-1))*100)}% de vida, lo remata.`; break;
  case 'meteor': t=`Golpea a TODOS los enemigos por ${d(p.m)}${e}.${p.healAll?` Cura ${d(p.healAll)} a todos sus aliados.`:''}${p.manaTeam?` Da ${p.manaTeam} de maná a sus aliados.`:''}`; break;
  case 'shield': t=`Se cubre con un escudo de ${d(p.m)} durante 4s.`; break;
  case 'taunt': t=`Provoca a los enemigos cercanos para que le ataquen, gana un escudo de ${d(p.m*.6)} y recibe un 30% menos de daño 3s.${p.heal?` Se cura ${d(p.heal)}.`:''}${p.teamShield?` Sus aliados ganan un escudo de ${d(p.teamShield)}.`:''}`; break;
  case 'reflect': t=`Gana un escudo de ${d(p.m*.6)} y devuelve el ${R0(p.pct*100)}% del daño recibido durante 4s.${p.heal?` Se cura ${d(p.heal)}.`:''}`; break;
  case 'harden': t=`Gana +${p.df*star} de defensa y resistencia (se acumula) y se cura ${d(p.heal)}.`; break;
  case 'rest': t=`Se cura ${d(p.m)}${p.sleep?` y se duerme ${p.sleep}s`:''}.`; break;
  case 'heal': t=p.n>=99?`Cura ${d(p.m)} a todo su equipo.`:`Cura ${d(p.m)} a ${p.n===1?'el aliado':`los ${p.n} aliados`} con menos vida.`; break;
  case 'teamShield': t=`Todo su equipo gana un escudo de ${d(p.m)} (4s).${p.heal?` Y se cura ${d(p.heal)}.`:''}${p.ap?` Aliados +${p.ap} de poder (se acumula).`:''}`; break;
  case 'buff': t=`Todo su equipo gana +${R0(p.as*100)}% de velocidad de ataque (se acumula)${p.heal?` y se cura ${d(p.heal)}`:''}.`; break;
  case 'frenzy': t=`Gana +${R0(p.as*100)}% de vel. de ataque y +${R0(p.ad*100)}% de daño de ataque (se acumula).`; break;
  case 'empower': t=`Sus próximos ${p.n} ataques infligen ${d(p.m)} de daño mágico extra${p.stun?` y aturden ${p.stun}s`:''}.`; break;
  case 'sing': t=`${p.all?'Duerme a TODOS los enemigos':p.r?`Duerme a los enemigos en radio ${p.r} del objetivo`:'Duerme al objetivo'} ${p.s}s y les inflige ${d(p.m)}.${p.drain?` Se cura un ${R0(p.drain*100)}% del daño.`:''}${p.healTeam?` Cura ${d(p.healTeam)} a sus aliados.`:''}`; break;
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
  case 'slam': t=`Salta a la casilla con más enemigos cerca y cae golpeando a los que estén a ${p.r||1} casilla: ${d(p.m)} de daño${e}.`; break;
 }
 if(p.g) t+=` Genera ${p.g+(star-1)} de oro (máx. 12 por combate).`;
 if(p.stk) t+=` Cada uso suma +15 de vida y +2 de ataque permanentes.`;
 return t;
}

/* =============================== [ITEMS] =============================== */
const COMPS={
 claw:{name:'Garra Afilada',icon:'🗡️',s:{adPct:.10}}, wing:{name:'Pluma Veloz',icon:'🪶',s:{asPct:.10}},
 spoon:{name:'Cuchara Torcida',icon:'🥄',s:{ap:10}}, water:{name:'Agua Mística',icon:'🧪',s:{mana:15}},
 coat:{name:'Revestimiento Metálico',icon:'🔩',s:{df:20}}, goggles:{name:'Gafas Protectoras',icon:'🥽',s:{mr:20}},
 club:{name:'Hueso Grueso',icon:'🦴',s:{hp:150}}, lens:{name:'Lente Zoom',icon:'🔍',s:{crit:.2}}, medal:{name:'Medalla',icon:'🏅',s:{}},
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
 ['lens','lens','zoom','Lente Zoom+','🔭','+40% de prob. crítica y +30% de daño crítico adicionales.',{crit:.4,critM:.3}],
];
const EMBLEM_OF={claw:'Coloso',wing:'Tirador',spoon:'Hechicero',water:'Agua',coat:'Guardián',goggles:'Hada',club:'Dragón',lens:'Asesino'};
const STAT_TXT={adPct:v=>`+${R0(v*100)}% daño de ataque`,asPct:v=>`+${R0(v*100)}% vel. de ataque`,ap:v=>`+${v} poder`,mana:v=>`+${v} maná inicial`,df:v=>`+${v} defensa`,mr:v=>`+${v} resistencia`,hp:v=>`+${v} vida`,crit:v=>`+${R0(v*100)}% prob. crítica`,critM:v=>`+${R0(v*100)}% daño crítico`,dmg:v=>`+${R0(v*100)}% daño`,omni:v=>`+${R0(v*100)}% robo de vida`,mpa:v=>`+${v} maná por ataque`,manaRegen:v=>`+${v} maná/s`,regen:v=>`+${(v*100).toFixed(1)}% vida/s`,dodge:v=>`+${R0(v*100)}% esquiva`,range:v=>`+${v} alcance`};
const sumStats=(...ss)=>{ const o={}; for(const s of ss) for(const k in s) o[k]=(o[k]||0)+s[k]; return o; };
const ITEMS={}, RECIPE={};
for(const k of ORDER) ITEMS[k]={...COMPS[k],key:k,comp:true,sp:{},desc:k==='medal'?'Combínala con un componente para crear una Insignia, o con otra Medalla para una Medalla Maestra.':'Componente. Combínalo con otro para crear un objeto.'};
for(const [a,b,id,name,icon,desc,s,sp] of FULL){ ITEMS[id]={key:id,name,icon,desc,s:sumStats(COMPS[a].s,COMPS[b].s,s||{}),sp:sp||{},from:[a,b]}; RECIPE[rk(a,b)]=id; }
// Cada insignia lleva el arte de una medalla de gimnasio afín a su sinergia (número de sprite en PokeAPI)
const BADGE_OF={claw:[18,'Puño'],wing:[22,'Pluma'],spoon:[6,'Pantano'],water:[2,'Cascada'],coat:[1,'Roca'],goggles:[4,'Arcoíris'],club:[16,'Dragón'],lens:[5,'Alma']};
for(const c of BASIC){ const t=EMBLEM_OF[c], id='em_'+c; ITEMS[id]={key:id,name:'Insignia '+t,icon:TRAITS[t].icon,badge:BADGE_OF[c][0],desc:`Medalla ${BADGE_OF[c][1]}. El portador gana la sinergia ${t}.`,s:{...COMPS[c].s},sp:{},emblem:t,from:[c,'medal']}; RECIPE[rk(c,'medal')]=id; }
// Herramienta: no se equipa; devuelve al inventario todos los objetos de un Pokémon (es la única forma de quitarlos)
ITEMS.magnet={key:'magnet',name:'Imán Removedor',icon:'🧲',desc:'Arrástralo sobre un Pokémon: todos sus objetos vuelven a tu inventario. Se gasta al usarlo. Recibes uno en cada fase contra Pokémon salvajes.',s:{},sp:{},tool:true};
ITEMS.master={key:'master',name:'Medalla Maestra',icon:'🏆',desc:'+1 espacio en el tablero mientras la lleve un Pokémon colocado en el tablero.',s:{},sp:{teamsize:1},from:['medal','medal']}; RECIPE['medal+medal']='master';
const FULL_KEYS=FULL.map(f=>f[2]);
const statLine=s=>Object.entries(s).map(([k,v])=>STAT_TXT[k]?STAT_TXT[k](v):'').filter(Boolean).join(' · ');
const combineKey=(a,b)=>RECIPE[rk(a,b)];

/* =============================== [CORE] =============================== */
let G=null, UID=1;
let S={name:'Tú',avatar:'🧢',trainer:'red',speed:1,timer:30,theme:'dark',vol:.5,muted:false,diff:'normal'};
const defaultMods=()=>({income:0,maxInterest:5,winStreakMult:1,lossStreakMult:1,lossBonus:0,xpRound:0,xpBuy:0,freeRerolls:0,hpPct:0,adPct:0,ap:0,asPct:0,def:0,mr:0,allFocus:false,extraTrait:{},winGold:0,winHeal:0,boardBonus:0,eeveeKills:3,legend:0});
function makePlayer(id,name,isBot,emoji,tr){
 return {id,name,isBot,emoji,tr:TRAINER_BY[tr]?tr:'',hp:100,gold:0,level:1,xp:0,bench:Array(BENCH).fill(null),board:{},shop:[null,null,null,null,null],locked:false,
   streak:0,augments:[],mods:defaultMods(),items:[],orbs:[],alive:true,place:0,lastOpp:-1,met:[],oppRound:{},ghosts:0,po:null,history:[],freeRerolls:0,lastDmg:0,remote:false,peer:'',ready:false,log:[],toasts:[],tseq:0};
}
const makeInst=key=>({uid:UID++,defId:key,baseId:DEF[key].evoOf||key,star:1,kills:0,items:[],stk:{hp:0,ad:0}});
const boardUnits=p=>Object.values(p.board);
const allUnits=p=>[...boardUnits(p),...p.bench.filter(Boolean)];
const maxBoard=p=>p.level+p.mods.boardBonus+boardUnits(p).reduce((s,u)=>s+u.items.filter(i=>i==='master').length,0);
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
function refreshShop(p){ for(const k of p.shop) if(k) returnToPool(k,1); const ex=threeStarSet(p); p.shop=[0,0,0,0,0].map(()=>drawUnitOfCost(rollCost(p.level),ex)); }
function income(p,idx){
 const base=idx<BASE_INCOME.length?BASE_INCOME[idx]:5;
 const interest=Math.min(p.mods.maxInterest,Math.floor(p.gold/10));
 const s=Math.abs(p.streak); let st=s>=5?3:s>=4?2:s>=2?1:0;
 if(st){ if(p.streak>0) st*=p.mods.winStreakMult; else st=st*p.mods.lossStreakMult+p.mods.lossBonus; }
 return {base,interest,streak:st,bonus:p.mods.income,total:base+interest+st+p.mods.income};
}
function addXp(p,n){ p.xp+=n; while(p.level<10&&p.xp>=XP_NEED[p.level]){ p.xp-=XP_NEED[p.level]; p.level++; } if(p.level>=10) p.xp=0; }
function buyXp(p){ if(p.level>=10||p.gold<4) return false; p.gold-=4; addXp(p,4+p.mods.xpBuy); return true; }
function reroll(p){ if(p.freeRerolls>0) p.freeRerolls--; else { if(p.gold<2) return false; p.gold-=2; } refreshShop(p); return true; }
function countSame(p,base,star){ return allUnits(p).filter(u=>u.baseId===base&&u.star===star).length; }
function canBuy(p,i){
 const k=p.shop[i]; if(!k||!DEF[k]) return false; const d=DEF[k]; if(p.gold<d.cost) return false;
 if(p.bench.some(x=>!x)) return true;
 return p.bench.filter(u=>u&&u.baseId===k&&u.star===1).length+(G.phase!=='combat'?boardUnits(p).filter(u=>u.baseId===k&&u.star===1).length:0)>=2;
}
function buy(p,i){ if(!canBuy(p,i)) return false; const k=p.shop[i]; p.gold-=DEF[k].cost; p.shop[i]=null; addUnitToBench(p,makeInst(k)); return true; }
function addUnitToBench(p,inst){
 const idx=p.bench.findIndex(x=>!x);
 if(idx>=0){ p.bench[idx]=inst; combine(p); return true; }
 p.bench.push(inst); combine(p);
 if(p.bench.length>BENCH){
   const extra=p.bench.splice(BENCH);
   for(const e of extra) if(e){ const j=p.bench.findIndex(x=>!x); if(j>=0) p.bench[j]=e; else { p.gold+=sellValue(e); returnToPool(e.baseId,Math.pow(3,e.star-1)); } }
 }
 return true;
}
function giveUnitTo(p,key){
 if(!key) return false;
 if(p.bench.some(x=>!x)||p.bench.filter(u=>u&&u.baseId===key&&u.star===1).length>=2){ addUnitToBench(p,makeInst(key)); return true; }
 p.gold+=DEF[key].cost; returnToPool(key,1); note(p,`Banquillo lleno: ${DEF[key].name} se convirtió en oro`); return false;
}
function giveItem(p,it){ it=it||pick(BASIC); if(p.items.length<MAX_ITEMS_BENCH) p.items.push(it); else { p.gold+=2; note(p,'Inventario lleno: objeto convertido en 2 de oro'); } return it; }
function addItemToUnit(u,k){
 const I=ITEMS[k]; if(!I) return {ok:false,why:'Objeto no válido'};
 if(I.tool) return {ok:false,why:'Eso no se equipa'};
 if(I.comp){ const j=u.items.findIndex(x=>ITEMS[x].comp); if(j>=0){ const res=combineKey(u.items[j],k); const em=ITEMS[res].emblem; if(em&&DEF[u.defId].traits.includes(em)) return {ok:false,why:`Ya es ${em}`}; u.items[j]=res; return {ok:true,made:res}; } }
 if(u.items.length>=3) return {ok:false,why:'Ya lleva 3 objetos'};
 if(I.emblem&&unitTraits(u).includes(I.emblem)) return {ok:false,why:`Ya es ${I.emblem}`};
 u.items.push(k); return {ok:true};
}
// Dos componentes del inventario se combinan en un objeto completo (se queda en el sitio del segundo)
const benchCombo=(p,a,b)=>{ const x=p.items[a], y=p.items[b]; return a!==b&&x&&y&&ITEMS[x].comp&&ITEMS[y].comp?combineKey(x,y):null; };
function combineBench(p,a,b){ const res=benchCombo(p,a,b); if(!res) return {ok:false,why:'Solo se combinan dos componentes'}; p.items[b]=res; p.items.splice(a,1); return {ok:true,made:res}; }
function useItem(p,idx,u,loc){
 const it=p.items[idx]; if(!it||!u) return {ok:false};
 if(G.phase==='combat'&&loc&&loc.b!==undefined) return {ok:false,why:'No puedes cambiar objetos en pleno combate'};
 if(it==='magnet'){
   if(!u.items.length) return {ok:false,why:'Ese Pokémon no lleva objetos'};
   if(p.items.length-1+u.items.length>MAX_ITEMS_BENCH) return {ok:false,why:'No caben sus objetos en tu inventario'};
   p.items.splice(idx,1); p.items.push(...u.items); u.items=[]; return {ok:true,removed:true};
 }
 const r=addItemToUnit(u,it); if(r.ok) p.items.splice(idx,1); return r;
}
function removeItem(p,u,idx){
 if(!u.items[idx]) return {ok:false,why:'No hay objeto ahí'};
 if(p.items.length>=MAX_ITEMS_BENCH) return {ok:false,why:'Tu inventario está lleno (10 objetos)'};
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
   const add=(u,loc)=>{ const g=u.baseId+'|'+u.star; (groups[g]=groups[g]||[]).push({u,loc}); };
   if(boardOk) for(const k in p.board) add(p.board[k],{b:k});
   p.bench.forEach((u,i)=>u&&add(u,{i}));
   for(const g in groups){
     const arr=groups[g]; if(arr.length<3||arr[0].u.star>=3) continue;
     const three=arr.slice(0,3), keep=three[0], evolved=three.find(x=>DEF[x.u.defId].evoOf);
     const before=nameOf(DEF[keep.u.defId],keep.u.star);
     keep.u.star++; if(evolved) keep.u.defId=evolved.u.defId;
     for(const o of three.slice(1)){
       keep.u.kills+=o.u.kills; keep.u.stk.hp+=o.u.stk.hp; keep.u.stk.ad+=o.u.stk.ad;
       for(const it of o.u.items){ const r=addItemToUnit(keep.u,it); if(!r.ok) giveItem(p,it); }
       setAt(p,o.loc,null);
     }
     const after=nameOf(DEF[keep.u.defId],keep.u.star);
     if(keep.u.star>=3){ for(let i=0;i<5;i++) if(p.shop[i]===keep.u.baseId){ returnToPool(p.shop[i],1); p.shop[i]=null; } }
     note(p,before!==after?`✨ ¡${before} evolucionó en ${after}! Nueva habilidad: ${abOf(DEF[keep.u.defId],keep.u.star)[1]}`:`⭐ ${after} sube a ${keep.u.star} estrellas`,true);
     // Aviso para la lista de jugadores: foto del Pokémon y estrellas a las que sube
     p.upSeq=(p.upSeq||0)+1; p.lastUp=[dexOf(DEF[keep.u.defId],keep.u.star),keep.u.star,p.upSeq];
     changed=true; break;
   }
 }
}
function sellValue(u){ const c=DEF[u.defId].cost; return u.star===1?c:c*Math.pow(3,u.star-1)-(c>1?1:0); }
function sellAt(p,loc){
 const u=getAt(p,loc); if(!u) return false;
 if(loc.b!==undefined&&G.phase==='combat') return false;
 p.gold+=sellValue(u); returnToPool(u.baseId,Math.pow(3,u.star-1));
 for(const it of u.items) giveItem(p,it);
 setAt(p,loc,null); return true;
}
function moveTo(p,from,to){
 const same=(from.b!==undefined&&from.b===to.b)||(from.i!==undefined&&from.i===to.i); if(same) return false;
 const a=getAt(p,from), b=getAt(p,to); if(!a) return false;
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
function traitTiers(p){ const c=traitCounts(p),Tt={}; for(const t in c) Tt[t]=TRAITS[t].bp.filter(b=>c[t]>=b).length; return Tt; }
function topTrait(p){ const c=traitCountsOf(allUnits(p)); delete c['Legendario']; const e=Object.entries(c).sort((a,b)=>b[1]-a[1]); return e.length?e[0][0]:null; }
function pushLog(p,msg,t){ p.log.unshift(msg); p.log.length=Math.min(p.log.length,12); if(t){ p.tseq++; p.toasts=p.toasts.concat([[p.tseq,msg]]).slice(-4); } }
function note(p,msg,toastIt){
 if(!G) return;
 if(!p||p===G.me){ G.log.unshift(msg); G.log.length=Math.min(G.log.length,40); if(toastIt&&(!p||p===G.me)) toast(msg); }
 if(!p){ for(const q of G.players||[]) if(q.remote) pushLog(q,msg,false); }
 else if(p.remote) pushLog(p,msg,toastIt);
}

/* ============================== [COMBAT] ============================== */
const DT=0.05;
function hexDist(c1,r1,c2,r2){ const x1=c1-(r1-(r1&1))/2, x2=c2-(r2-(r2&1))/2; const y1=-x1-r1,y2=-x2-r2; return Math.max(Math.abs(x1-x2),Math.abs(y1-y2),Math.abs(r1-r2)); }
const dU=(a,b)=>hexDist(a.c,a.r,b.c,b.r);
function neighbors(c,r){ const d=(r&1)?[[1,0],[-1,0],[1,-1],[0,-1],[1,1],[0,1]]:[[1,0],[-1,0],[0,-1],[-1,-1],[0,1],[-1,1]]; return d.map(([dc,dr])=>[c+dc,r+dr]).filter(([a,b])=>a>=0&&a<7&&b>=0&&b<8); }
const toGrid=(side,c,r)=>side===0?[c,4+r]:[6-c,3-r];
const pickR=(cb,a)=>a[Math.floor(cb.rng()*a.length)];

function applyTraits(u,traits,Tt,mods){
 const has=t=>traits.includes(t), tv=(t,arr)=>arr[Tt[t]||0]||0;
 if(has('Fuego')){ u.burnPct+=tv('Fuego',[0,.02,.04,.07]); u.dmgBonus+=tv('Fuego',[0,0,0,.2]); }
 if(has('Agua')) u.manaPerAtk+=tv('Agua',[0,4,8,14]);
 u.manaPerAtk+=tv('Agua',[0,0,0,3]);
 if(has('Planta')) u.regen+=tv('Planta',[0,.015,.035]);
 if(has('Eléctrico')){ u.as*=1+tv('Eléctrico',[0,.25,.55]); u.shock+=tv('Eléctrico',[0,0,.2]); }
 if(has('Psíquico')) u.ap+=tv('Psíquico',[0,25,55,100]);
 u.ap+=tv('Psíquico',[0,0,0,20]);
 if(has('Roca')) u.df+=tv('Roca',[0,25,55,100]);
 u.df+=tv('Roca',[0,0,10,25]);
 if(has('Dragón')){ u.maxHp+=tv('Dragón',[0,200,450,800]); u.dmgBonus+=tv('Dragón',[0,.08,.18,.35]); }
 if(has('Fantasma')) u.dodge+=tv('Fantasma',[0,.15,.3,.45]);
 u.startShield+=tv('Hada',[0,100,220,400]);
 if(has('Normal')){ u.maxHp+=tv('Normal',[0,120,300,550]); u.as*=1+tv('Normal',[0,.08,.15,.25]); }
 if(has('Acero')) u.dr+=tv('Acero',[0,.15,.3]);
 if(has('Siniestro')) u.bully+=tv('Siniestro',[0,.25,.6]);
 if(has('Lucha')) u.omni+=tv('Lucha',[0,.12,.25]);
 const g=has('Guardián')?tv('Guardián',[0,20,40,70,110]):tv('Guardián',[0,0,10,25,45]); u.df+=g; u.mr+=g;
 if(has('Coloso')) u.maxHp*=1+tv('Coloso',[0,.15,.3,.5,.8]);
 if(has('Tirador')) u.ad*=1+tv('Tirador',[0,.18,.4,.7]);
 u.ap+=tv('Hechicero',[0,12,25,45,70])*(has('Hechicero')?2:1);
 if(has('Asesino')){ u.critC+=tv('Asesino',[0,.15,.3,.45]); u.critM+=tv('Asesino',[0,.1,.2,.35]); }
 u.manaRegen+=tv('Sanador',[0,2,4,7]);
 if(has('Legendario')){ const b=1.2+(mods?mods.legend:0); u.maxHp*=b; u.ad*=b; }
}
function applyStats(u,s){
 for(const k in s){ const v=s[k]; switch(k){
  case 'adPct':u.ad*=1+v;break; case 'asPct':u.as*=1+v;break; case 'ap':u.ap+=v;break; case 'mana':u.mana+=v;break;
  case 'df':u.df+=v;break; case 'mr':u.mr+=v;break; case 'hp':u.maxHp+=v;break; case 'crit':u.critC+=v;break;
  case 'critM':u.critM+=v;break; case 'dmg':u.dmgBonus+=v;break; case 'omni':u.omni+=v;break; case 'mpa':u.manaPerAtk+=v;break;
  case 'manaRegen':u.manaRegen+=v;break; case 'regen':u.regen+=v;break; case 'dodge':u.dodge+=v;break; case 'range':u.range+=v;break; } }
}
function baseCombatUnit(d,side,star,rand=Math.random){
 const ro=ROLE[d.role], s=STAR[star-1], cm=d.cost-1, em=d.mult||1, ab=abOf(d,star);
 return {side,d,star,cost:d.cost,name:nameOf(d,star),ab,maxHp:ro.hp*HPM[cm]*s*em,ad:ro.ad*ADM[cm]*s*em,as:ro.as,range:ro.range,df:ro.df,mr:ro.mr,ap:0,
   mana:ro.mana,maxMana:ab[2].mm||ro.maxMana,critC:.25,critM:1.4,dodge:0,burnPct:0,manaPerAtk:0,regen:0,manaRegen:0,omni:0,dr:0,bully:0,shock:0,
   focus:false,berry:false,dmgBonus:0,shield:0,shieldT:0,startShield:0,stun:0,sleepT:0,stealth:0,tdr:0,tdrT:0,reflT:0,reflPct:0,empN:0,empDmg:0,empStun:0,glow:0,
   atkCd:.25+rand()*.35,moveCd:rand()*.2,target:null,burns:[],dead:false,kills:0,flash:0,mt:1,role:d.role,items:[],ref:null,sp:{},atkN:0,titanN:0};
}
function makeCombatUnit(inst,p,Tt,side,rand){
 const d=DEF[inst.defId]; const u=baseCombatUnit(d,side,inst.star,rand);
 if(inst.stk){ u.maxHp+=inst.stk.hp; u.ad+=inst.stk.ad; }
 applyTraits(u,unitTraits(inst),Tt,p.mods);
 const m=p.mods; u.maxHp*=1+m.hpPct; u.ad*=1+m.adPct; u.ap+=m.ap; u.as*=1+m.asPct; u.df+=m.def; u.mr+=m.mr; if(m.allFocus) u.focus=true;
 for(const it of inst.items){ const I=ITEMS[it]; if(!I) continue; applyStats(u,I.s); for(const k in I.sp) u.sp[k]=(u.sp[k]||0)+I.sp[k]; }
 if(u.sp.focus) u.focus=true; if(u.sp.berry) u.berry=true;
 if(u.sp.blood&&u.range===1) u.omni+=.1;
 u.items=inst.items.slice(); u.hp=u.maxHp; u.as=Math.min(u.as,3);
 return u;
}
const abilPower=u=>ABIL_BASE[u.cost-1]*ABIL_STAR[u.star-1]*(1+u.ap/100);

// Instantánea compacta de un equipo: es lo que se envía por red y lo que usa la simulación
function teamSnap(p){ const m=p.mods; return {m:{hp:m.hpPct,ad:m.adPct,ap:m.ap,as:m.asPct,df:m.def,mr:m.mr,f:m.allFocus?1:0,lg:m.legend,x:m.extraTrait},u:Object.entries(p.board).map(([k,u])=>[k,u.defId,u.star,u.items.slice(),R0(u.stk.hp),R0(u.stk.ad)])}; }
function snapPlayer(snap){
 const m=snap&&snap.m||{}; const mods=Object.assign(defaultMods(),{hpPct:+m.hp||0,adPct:+m.ad||0,ap:+m.ap||0,asPct:+m.as||0,def:+m.df||0,mr:+m.mr||0,allFocus:!!m.f,legend:+m.lg||0,extraTrait:(m.x&&typeof m.x==='object')?m.x:{}});
 const board={};
 for(const row of (snap&&Array.isArray(snap.u)?snap.u:[])){
   const [k,defId,star,items,sh,sa]=row;
   if(typeof k!=='string'||!/^[0-6],[0-3]$/.test(k)||!DEF[defId]||![1,2,3].includes(star)) continue;
   board[k]={defId,baseId:DEF[defId].evoOf||defId,star,items:(Array.isArray(items)?items:[]).filter(i=>ITEMS[i]).slice(0,3),stk:{hp:+sh||0,ad:+sa||0}};
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
   [u.c,u.r]=toGrid(side,c,r); u.pc=u.c; u.pr=u.r; u.ref=refs&&refs[k]||null; cb.units.push(u);
 }
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
 return [CREEP(130,'Gyarados',3600*m,140*m,2,0,{boss:true}),CREEP(130,'Gyarados',3600*m,140*m,4,0,{boss:true}),CREEP(143,'Snorlax',4300*m,125*m,3,1,{as:.55,boss:true})];
}
function addCreeps(cb,R){
 for(const cr of pveWave(R.s,R.n)){
   const d={key:'creep',name:cr.name,dex:cr.dex,cost:clamp(R.s-1,1,5),role:'b',traits:[],ab:[['nova','Golpe Salvaje',{r:1,m:.75,stun:1}]]};
   const u=baseCombatUnit(d,1,1,cb.rng);
   Object.assign(u,{maxHp:cr.hp,hp:cr.hp,ad:cr.ad,as:cr.as||.65,range:cr.range||1,df:15+R.s*5,mr:15+R.s*5,mana:0,maxMana:cr.boss?120:99999,creep:true,role:cr.range?'r':'b'});
   [u.c,u.r]=toGrid(1,cr.c,cr.r); u.pc=u.c; u.pr=u.r; cb.units.push(u);
 }
}
// efectos visuales (no afectan a la simulación)
function fx(cb,o){ if(cb.visual){ o.t=0; o.life=o.life||.8; cb.fx.push(o); } }
function fxText(cb,u,txt,color){ fx(cb,{type:'text',c:u.c,r:u.r,txt:String(txt),color,dx:(Math.random()-.5)*14}); }
// Las heridas (veneno) reducen a la mitad la curación recibida
// Estadísticas del combate (daño hecho, recibido y curación), solo para el registro de daño: no cambian la simulación
let HEALER=null;
function heal(u,a){ if(!u.dead&&a>0){ const b=u.hp; u.hp=Math.min(u.maxHp,u.hp+a*(u.woundT>0?.5:1)); const s=HEALER||u; s.sHeal=(s.sHeal||0)+u.hp-b; } }
function stunUnit(e,s,sleep){ if(!e.sp.noStun){ e.stun=Math.max(e.stun,s); if(sleep) e.sleepT=Math.max(e.sleepT,s); } }
const foesOf=(cb,u)=>cb.units.filter(e=>!e.dead&&e.side!==u.side);
const alliesOf=(cb,u)=>cb.units.filter(e=>!e.dead&&e.side===u.side);
function nearestEnemy(cb,u,except){
 let best=null,bd=1e9;
 for(const e of cb.units){ if(e.dead||e.side===u.side||e===except||e.stealth>0) continue; const d=dU(u,e)+cb.rng()*.1; if(d<bd){bd=d;best=e;} }
 return best;
}
function freeCell(cb,c,r,except){ return !cb.units.some(x=>!x.dead&&x!==except&&x.c===c&&x.r===r); }
function nextStep(cb,u,t){
 const occ=new Set(cb.units.filter(x=>!x.dead&&x!==u).map(x=>x.c+','+x.r));
 const start=u.c+','+u.r, prev={[start]:null}, q=[[u.c,u.r]];
 while(q.length){
   const [c,r]=q.shift();
   if(!(c===u.c&&r===u.r)&&hexDist(c,r,t.c,t.r)<=u.range){ let k=c+','+r; while(prev[k]!==start) k=prev[k]; return k.split(',').map(Number); }
   for(const [nc,nr] of neighbors(c,r)){ const k=nc+','+nr; if(k in prev||occ.has(k)) continue; prev[k]=c+','+r; q.push([nc,nr]); }
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
 if(kind==='phys'&&t.dodge&&cb.rng()<t.dodge){ fxText(cb,t,'esquiva','#9aa4c0'); return false; }
 let dmg=raw*(1+(src&&kind!=='true'?src.dmgBonus:0))*(t.markT>0&&kind!=='true'?1+t.markAmp:1);
 if(src&&src.bully&&kind!=='true'&&t.hp<t.maxHp*.5) dmg*=1+src.bully;
 if(kind==='phys') dmg*=100/(100+t.df); else if(kind==='magic') dmg*=100/(100+t.mr);
 const dr=t.dr+(t.sp.dr||0)+(t.tdrT>0?t.tdr:0); if(dr) dmg*=1-Math.min(.75,dr);
 t.sTank=(t.sTank||0)+dmg; if(src&&src!==t&&src.side!==t.side) src.sDmg=(src.sDmg||0)+dmg;
 if(t.shield>0){ const a=Math.min(t.shield,dmg); t.shield-=a; dmg-=a; }
 t.hp-=dmg; if(!silent) t.flash=.12;
 if(cb.caster&&src===cb.caster){ cb.cDmg+=dmg; cb.cHits.add(t); }
 if(kind!=='true'){ t.mana+=Math.min(dmg*.04,12); if(t.sp.titan&&t.titanN<25){ t.titanN++; t.dmgBonus+=t.sp.titan; } }
 if(t.reflT>0&&src&&src!==t&&kind!=='true'&&!src.dead) dealDamage(cb,t,src,dmg*t.reflPct,'true',true);
 if(src&&src.omni&&!src.dead) heal(src,dmg*src.omni);
 if(!silent&&dmg>=1) fxText(cb,t,R0(dmg),crit?'#ffb400':kind==='magic'?'#7fb6ff':'#ffffff');
 if(src&&src.sp.execute&&kind!=='true'&&t.hp>0&&t.hp<t.maxHp*src.sp.execute){ t.hp=0; fxText(cb,t,'¡Rematado!','#ff6b6b'); }
 if(t.berry&&t.hp>0&&t.hp<t.maxHp*.5){ t.berry=false; heal(t,t.maxHp*.35); fxText(cb,t,'Baya Zidra','#4caf50'); }
 if(t.sp.blood&&!t.bloodUsed&&t.hp>0&&t.hp<t.maxHp*.4){ t.bloodUsed=true; t.shield+=t.maxHp*.25; t.shieldT=Math.max(t.shieldT,5); fxText(cb,t,'¡Sed de sangre!','#ff5a5a'); }
 if(t.hp<=0){
   if(t.focus){ t.focus=false; t.hp=1; fxText(cb,t,'¡Aguanta!','#ffb400'); }
   else { t.hp=0; t.dead=true; if(src&&src.side!==t.side) src.kills++; fx(cb,{type:'ring',c:t.c,r:t.r,color:'#ffffff',life:.5}); if(cb.caster&&src===cb.caster) cb.cKills++; }
 }
 return true;
}
function abilDamage(cb,u,t,amount){
 let crit=false; if(u.sp.abilCrit&&cb.rng()<u.critC){ amount*=u.critM; crit=true; }
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
}
function attack(cb,u,t){
 const crit=cb.rng()<u.critC; const dmg=u.ad*(crit?u.critM:1);
 fx(cb,u.range>1?{type:'proj',fc:u.c,fr:u.r,tc:t.c,tr:t.r,color:typeColor(u.d),el:u.d.traits&&u.d.traits[0],life:.22}:{type:'swing',c:u.c,r:u.r,tc:t.c,tr:t.r,life:.15});
 const hit=dealDamage(cb,u,t,dmg,'phys',false,crit);
 if(hit&&crit&&u.sp.shred&&!t.shredded){ t.df*=1-u.sp.shred; t.shredded=true; }
 if(hit&&t.sp.thorns&&!u.dead) dealDamage(cb,t,u,t.sp.thorns+t.maxHp*.03,'magic',true);
 if(hit&&u.shock&&cb.rng()<u.shock) stunUnit(t,.4);
 if(u.empN>0&&!t.dead){ u.empN--; dealDamage(cb,u,t,u.empDmg,'magic'); if(u.empStun) stunUnit(t,u.empStun); fx(cb,{type:'area',c:t.c,r:t.r,rad:.4,color:'#ffd23f',life:.3}); }
 u.mana+=10+u.manaPerAtk; u.atkN++;
 if(u.sp.rage) u.as=Math.min(5,u.as*(1+u.sp.rage));
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
function gainStacks(u,hp,ad){ u.maxHp+=hp; u.hp+=hp; u.ad+=ad; if(u.ref){ u.ref.stk=u.ref.stk||{hp:0,ad:0}; u.ref.stk.hp+=hp; u.ref.stk.ad+=ad; } }
const elIcon=el=>TRAITS[el]?TRAITS[el].icon:({Hielo:'❄️',Veneno:'☠️'})[el]||'';
function castAbility(cb,u,ab,depth=0){
 const [k,name,p]=ab; const P=abilPower(u), col=typeColor(u.d), el=p.el||u.d.traits[0]||'Normal';
 // Todos los efectos de la habilidad llevan su elemento y su estilo (p.v) para que board3d.js los pinte distintos
 const FX=o=>fx(cb,{el,v:p.v,color:col,...o});
 const foes=foesOf(cb,u), allies=alliesOf(cb,u);
 let t=u.target&&!u.target.dead&&!(u.target.stealth>0)?u.target:nearestEnemy(cb,u);
 if(depth===0){ u.castN=(u.castN||0)+1; cb.caster=u; HEALER=u; cb.cDmg=0; cb.cHits=new Set(); cb.cHeal=0; cb.cShield=0; cb.cStun=false; cb.cKills=0; cb.cExtra='';
   fx(cb,{type:'banner',u,txt:name,color:col,icon:elIcon(el),life:1.3}); u.glow=.6; u.flash=.2; }
 const H=(a,amt)=>{ const b=a.hp; heal(a,amt); cb.cHeal+=a.hp-b; FX({type:'plus',c:a.c,r:a.r,life:.8}); };
 const SH=(a,amt,dur)=>{ u.sHeal=(u.sHeal||0)+amt; a.shield+=amt; a.shieldT=Math.max(a.shieldT,dur); cb.cShield+=amt; FX({type:'ring',c:a.c,r:a.r,color:'#dff4ff',life:.5}); };
 const near=(c,r,rad)=>foesOf(cb,u).filter(e=>hexDist(e.c,e.r,c,r)<=rad);
 switch(k){
  case 'bolt': if(t){ FX({type:'proj',fc:u.c,fr:u.r,tc:t.c,tr:t.r,life:.32,big:true}); hitFx(cb,u,t,P*p.m,p); } break;
  case 'burn': if(t){ FX({type:'proj',fc:u.c,fr:u.r,tc:t.c,tr:t.r,life:.28,big:true}); const tg=p.r?foes.filter(e=>dU(t,e)<=p.r):[t]; for(const e of tg) hitFx(cb,u,e,P*p.m,{...p,burn:p.burn||.03}); FX({type:'area',c:t.c,r:t.r,rad:(p.r||0)+.5,life:.6}); } break;
  case 'blast': if(t){ FX({type:'proj',fc:u.c,fr:u.r,tc:t.c,tr:t.r,life:.28,big:true}); for(const e of foes) if(dU(t,e)<=p.r) hitFx(cb,u,e,P*p.m,p); FX({type:'area',c:t.c,r:t.r,rad:p.r+.5,life:.65}); } break;
  case 'nova': for(const e of foes) if(dU(u,e)<=p.r) hitFx(cb,u,e,P*p.m,p); FX({type:'area',c:u.c,r:u.r,rad:p.r+.5,life:.7,quake:p.r>=2});
    if(p.selfDmg){ u.hp=Math.max(1,u.hp-u.maxHp*p.selfDmg); cb.cExtra=` · pierde ${R0(p.selfDmg*100)}% de su vida`; } break;
  case 'line': if(t){ for(const e of lineTargets(cb,u,t)) hitFx(cb,u,e,P*p.m,p); FX({type:'beam',fc:u.c,fr:u.r,tc:t.c,tr:t.r,life:.5}); } if(p.stunSelf){ u.stun=Math.max(u.stun,p.stunSelf); cb.cExtra=' · se recarga'; } break;
  case 'chain': { let cur=t, prev=u; const hit=new Set(); for(let i=0;i<p.n&&cur;i++){ FX({type:'zap',fc:prev.c,fr:prev.r,tc:cur.c,tr:cur.r,life:.4}); hitFx(cb,u,cur,P*p.m,p); hit.add(cur); prev=cur; cur=foes.filter(e=>!e.dead&&!hit.has(e)&&dU(prev,e)<=3).sort((a,b)=>dU(prev,a)-dU(prev,b))[0]; } break; }
  case 'multi': for(let i=0;i<p.n;i++){ const live=foes.filter(e=>!e.dead); if(!live.length) break; const e=pickR(cb,live); FX({type:'proj',fc:u.c,fr:u.r,tc:e.c,tr:e.r,life:.25+i*.04}); hitFx(cb,u,e,P*p.m,p); } if(p.chill) cb.cExtra=' · ralentiza'; break;
  case 'combo': if(t){ for(let i=0;i<p.n&&!t.dead;i++) hitFx(cb,u,t,P*p.m,i===p.n-1?p:{...p,stun:0}); FX({type:'hits',c:t.c,r:t.r,n:p.n,life:.6}); } break;
  case 'dash': { const tg=p.to==='far'?foes.filter(e=>!(e.stealth>0)).sort((a,b)=>dU(u,b)-dU(u,a))[0]:p.to==='low'?foes.filter(e=>!(e.stealth>0)).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0]:t;
    if(tg){ teleportNear(cb,u,tg); u.target=tg; hitFx(cb,u,tg,P*p.m,p); FX({type:'hits',c:tg.c,r:tg.r,n:2,life:.5}); if(p.r){ for(const e of foes) if(e!==tg&&dU(tg,e)<=p.r) hitFx(cb,u,e,P*p.m*.6,p); FX({type:'area',c:tg.c,r:tg.r,rad:p.r+.5,life:.6}); } if(p.stealth){ u.stealth=p.stealth; for(const e of foes) if(e.target===u) e.target=null; cb.cExtra=' · invisible'; } if(p.selfAs) u.as=Math.min(3,u.as*(1+p.selfAs)); } break; }
  case 'execute': if(t){ hitFx(cb,u,t,P*p.m,p); FX({type:'hits',c:t.c,r:t.r,n:3,color:'#ff5a5a',life:.6}); if(!t.dead&&t.hp<t.maxHp*(p.th+.05*(u.star-1))){ dealDamage(cb,u,t,t.hp+t.shield+1,'true',true); fxText(cb,t,'¡Rematado!','#ff6b6b'); } } break;
  case 'meteor': for(const e of foes){ FX({type:'meteor',c:e.c,r:e.r,life:.7}); hitFx(cb,u,e,P*p.m,p); } if(p.healAll) for(const a of allies) H(a,P*p.healAll); if(p.manaTeam) for(const a of allies) if(a!==u) a.mana+=p.manaTeam; FX({type:'flash',life:.4}); break;
  case 'shield': SH(u,P*p.m,4); break;
  case 'taunt': SH(u,P*p.m*.6,4); u.tdr=.3; u.tdrT=3; for(const e of foes) if(dU(u,e)<=3) e.target=u; if(p.heal) H(u,P*p.heal); if(p.teamShield) for(const a of allies) SH(a,P*p.teamShield,4); FX({type:'area',c:u.c,r:u.r,rad:3.2,color:'#ff5a5a',life:.6,thin:true}); cb.cExtra=' · provoca'; break;
  case 'reflect': SH(u,P*p.m*.6,4); u.reflT=4; u.reflPct=p.pct||.4; if(p.heal) H(u,P*p.heal); FX({type:'aura',u,life:4,color:'#e6f0ff'}); cb.cExtra=` · refleja ${R0((p.pct||.4)*100)}%`; break;
  case 'harden': u.df+=p.df*u.star; u.mr+=p.df*u.star; H(u,P*p.heal); FX({type:'aura',u,life:1,color:'#c9c9c9'}); cb.cExtra=` · +${p.df*u.star} def/res`; break;
  case 'rest': H(u,P*p.m); if(p.sleep){ u.stun=Math.max(u.stun,p.sleep); u.sleepT=p.sleep; } break;
  case 'heal': allies.sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp).slice(0,p.n).forEach(a=>{ FX({type:'proj',fc:u.c,fr:u.r,tc:a.c,tr:a.r,life:.3,heal:true}); H(a,P*p.m); }); break;
  case 'teamShield': for(const a of allies){ SH(a,P*p.m,4); if(p.heal) H(a,P*p.heal); if(p.ap) a.ap+=p.ap; } FX({type:'flash',color:'#ffd6f0',life:.35}); break;
  case 'buff': for(const a of allies){ a.as=Math.min(3,a.as*(1+p.as)); if(p.heal) H(a,P*p.heal); FX({type:'arrows',c:a.c,r:a.r,life:.8}); } cb.cExtra=` · equipo +${R0(p.as*100)}% vel.`; break;
  case 'frenzy': u.as=Math.min(3,u.as*(1+p.as)); u.ad*=1+p.ad; FX({type:'arrows',c:u.c,r:u.r,life:.8}); FX({type:'aura',u,life:1.2}); cb.cExtra=' · más rápido y fuerte'; break;
  case 'empower': u.empN=p.n; u.empDmg=P*p.m; u.empStun=p.stun||0; FX({type:'aura',u,life:1.2,color:'#ffd23f'}); cb.cExtra=` · próximos ${p.n} golpes potenciados`; break;
  case 'sing': { const tg=p.all?foes:t?foes.filter(e=>dU(t,e)<=(p.r||0)):[]; let tot=0; for(const e of tg){ const b=e.hp; abilDamage(cb,u,e,P*p.m); if(!e.dead){ stunUnit(e,p.s,true); cb.cStun=true; } tot+=Math.max(0,b-e.hp); } if(t) FX({type:'area',c:t.c,r:t.r,rad:p.all?6:(p.r||0)+.5,color:'#c9a7ff',life:.7,notes:true}); if(p.drain) H(u,tot*p.drain); if(p.healTeam) for(const a of allies) H(a,P*p.healTeam); cb.cExtra=' · duerme'; break; }
  case 'drain': if(t){ const b=t.hp; hitFx(cb,u,t,P*p.m,p); const d=Math.max(0,b-t.hp); FX({type:'proj',fc:t.c,fr:t.r,tc:u.c,tr:u.r,life:.4,heal:true}); const who=p.ally?allies.sort((a,b2)=>a.hp/a.maxHp-b2.hp/b2.maxHp)[0]:u; if(who) H(who,d*p.h); } break;
  case 'gold': { const tg=p.all?foes:t?(p.r?foes.filter(e=>dU(t,e)<=p.r):[t]):[]; for(const e of tg){ FX({type:'coins',fc:u.c,fr:u.r,tc:e.c,tr:e.r,life:.5}); hitFx(cb,u,e,P*p.m,p); } break; }
  case 'stack': if(t){ FX({type:'proj',fc:u.c,fr:u.r,tc:t.c,tr:t.r,life:.25}); hitFx(cb,u,t,P*p.m,p); } gainStacks(u,p.hp*u.star,p.ad*u.star); fxText(cb,u,`+${p.hp*u.star} PS`,'#7dff9b'); cb.cExtra=` · +${p.hp*u.star} vida y +${p.ad*u.star} ataque para siempre`; break;
  case 'splash': FX({type:'area',c:u.c,r:u.r,rad:.5,life:.5,el:'Agua'}); fxText(cb,u,'¡Pero no pasó nada!','#9aa4c0'); cb.cExtra=' · no pasó nada'; break;
  case 'copy': { if(!u.copied){ const src=foes.filter(e=>!e.creep).sort((a,b)=>b.cost-a.cost||b.star-a.star)[0]; u.copied=src&&src.ab[0]!=='copy'?src.ab:['nova','Golpe',{r:1,m:.8}]; } cb.cExtra=` → copia ${u.copied[1]}`; if(depth<2) castAbility(cb,u,u.copied,depth+1); break; }
  case 'metro': { const m=pickR(cb,METRO); cb.cExtra=` → ${m[1]}`; if(depth<2) castAbility(cb,u,m,depth+1); break; }
  // ---- mecánicas nuevas ----
  case 'cone': if(t){ for(const e of dirTargets(cb,u,t,{len:p.len||2,half:.55})) hitFx(cb,u,e,P*p.m,p); FX({type:'cone',fc:u.c,fr:u.r,tc:t.c,tr:t.r,len:p.len||2,life:.7}); } break;
  case 'wave': if(t){ for(const e of dirTargets(cb,u,t,{w:p.w||1.3})){ hitFx(cb,u,e,P*p.m,p); if(p.push&&!e.dead) shove(cb,e,u.c,u.r,p.push,true); } FX({type:'wave',fc:u.c,fr:u.r,tc:t.c,tr:t.r,w:p.w||1.3,life:.9});
    if(p.healTeam) for(const a of allies) H(a,P*p.healTeam); if(p.push) cb.cExtra=' · empuja'; } break;
  case 'strike': if(t){ const c=t.c, r=t.r, rad=p.r||0, d=p.delay||.6; FX({type:'tele',c,r,rad:rad+.5,life:d}); cb.cExtra=` · cae en ${d}s`;
    later2(cb,d,()=>{ if(u.dead&&!p.ghost) return; const pc=cb.caster; cb.caster=null; for(const e of near(c,r,rad)) hitFx(cb,u,e,P*p.m,p); cb.caster=pc; FX({type:'strike',c,r,rad:rad+.5,life:.75}); }); } break;
  case 'zone': { const center=p.self||!t?u:t, c=center.c, r=center.r, rad=p.r||1, dur=p.dur||3, n=Math.round(dur/.5);
    FX({type:'zone',c,r,rad:rad+.5,life:dur,heal:!!p.ally});
    for(let i=1;i<=n;i++) later2(cb,i*.5,()=>{ if(u.dead) return;
      if(p.ally){ HEALER=u; for(const a of cb.units) if(!a.dead&&a.side===u.side&&hexDist(a.c,a.r,c,r)<=rad){ heal(a,P*p.m/n); if(i%2===0) FX({type:'plus',c:a.c,r:a.r,life:.6}); } HEALER=null; return; }
      for(const e of near(c,r,rad)){ abilDamage(cb,u,e,P*p.m/n); if(e.dead) continue; if(i===1&&(p.root||p.sleep)) stunUnit(e,p.root||p.sleep,!!p.sleep); if(p.burn) addBurn(e,u,p.burn*e.maxHp,2,'abil'); if(p.chill) e.chillT=Math.max(e.chillT||0,1); } });
    cb.cExtra=` · zona ${dur}s`; break; }
  case 'knock': if(t){ hitFx(cb,u,t,P*p.m,p); FX({type:'hits',c:t.c,r:t.r,n:2,life:.5}); if(!t.dead&&shove(cb,t,u.c,u.r,p.k||2,true)) { cb.cExtra=' · lo lanza lejos'; FX({type:'trail',fc:t.pc,fr:t.pr,tc:t.c,tr:t.r,life:.45}); } } break;
  case 'pull': { const center=p.self||!t?u:t, c=center.c, r=center.r, rad=p.r||2; const tg=near(c,r,rad).sort((a,b)=>hexDist(a.c,a.r,c,r)-hexDist(b.c,b.r,c,r));
    for(const e of tg){ if(e!==center) shove(cb,e,c,r,2,false); hitFx(cb,u,e,P*p.m,p); } FX({type:'vortex',c,r,rad:rad+.5,life:.9}); cb.cExtra=' · atrae'; break; }
  case 'seed': if(t){ hitFx(cb,u,t,P*p.m*.25,p); const b=addBurn(t,u,P*p.m*.75/(p.dur||4),p.dur||4,'seed'); b.leech=p.h||1; FX({type:'tether',u,t,life:p.dur||4}); cb.cExtra=' · drena con el tiempo'; } break;
  case 'poison': { const tg=t?(p.r?foes.filter(e=>dU(t,e)<=p.r):[t]):[]; if(t) FX({type:'proj',fc:u.c,fr:u.r,tc:t.c,tr:t.r,life:.3,big:true});
    for(const e of tg){ abilDamage(cb,u,e,P*p.m*.3); if(e.dead) continue; addBurn(e,u,P*p.m*.7/(p.dur||5),p.dur||5,'poison'); e.woundT=Math.max(e.woundT||0,p.dur||5); FX({type:'aura',u:e,life:p.dur||5,color:'#b25bd6',el:'Veneno'}); } cb.cExtra=' · envenena (cura a la mitad)'; break; }
  case 'mark': if(t){ hitFx(cb,u,t,P*p.m,p); if(!t.dead){ t.markT=p.dur||4; t.markAmp=p.amp||.25; FX({type:'mark',u:t,life:p.dur||4}); } cb.cExtra=` · +${R0((p.amp||.25)*100)}% de daño recibido`; } break;
  case 'spin': { const n=p.n||4; u.tdr=Math.max(u.tdr,p.dr||0); u.tdrT=Math.max(u.tdrT,n*.3); FX({type:'spin',u,life:n*.3});
    for(let i=0;i<n;i++) later2(cb,i*.3,()=>{ if(u.dead) return; for(const e of foesOf(cb,u)) if(dU(u,e)<=1) abilDamage(cb,u,e,P*p.m); }); cb.cExtra=` · ${n} giros`; break; }
  case 'slam': { const rad=p.r||1; let best=null, bs=-1;
    for(let r=0;r<8;r++) for(let c=0;c<7;c++){ if(!(c===u.c&&r===u.r)&&!freeCell(cb,c,r,u)) continue; const n=near(c,r,rad).length; const sc=n*10-hexDist(c,r,u.c,u.r)*.1; if(n>0&&sc>bs){ bs=sc; best=[c,r]; } }
    if(best){ FX({type:'leap',fc:u.c,fr:u.r,tc:best[0],tc2:best[1],tr:best[1],life:.35}); u.pc=u.c; u.pr=u.r; [u.c,u.r]=best; u.mt=0; u.stun=Math.max(u.stun,.3);
      later2(cb,.3,()=>{ if(u.dead) return; for(const e of near(u.c,u.r,rad)) hitFx(cb,u,e,P*p.m,p); FX({type:'area',c:u.c,r:u.r,rad:rad+.5,life:.7,quake:true}); }); cb.cExtra=' · salta al grupo'; } break; }
 }
 if(depth===0){
   if(p.g){ const g=p.g+(u.star-1); const before=cb.gold[u.side]; cb.gold[u.side]=Math.min(12,before+g); if(cb.gold[u.side]>before){ fxText(cb,u,`+${cb.gold[u.side]-before} 💰`,'#ffd23f'); cb.cExtra+=` · +${cb.gold[u.side]-before} oro`; } }
   if(p.stk) gainStacks(u,15,2);
   if(u.sp.healCast) heal(u,u.maxHp*u.sp.healCast);
   if(cb.visual){ cb.feed.push({s:u.side,n:u.name,mv:name,ic:elIcon(el)||'🐾',d:R0(cb.cDmg),h:cb.cHits.size,hl:R0(cb.cHeal),sh:R0(cb.cShield),st:cb.cStun,k:cb.cKills,x:cb.cExtra}); if(cb.feed.length>12) cb.feed.shift(); cb.feedV++; }
   cb.caster=null; HEALER=null;
 }
}
function stepCombat(cb){
 if(cb.done) return;
 if(!cb.started){
   cb.started=true;
   for(const u of cb.units){ if(u.startShield){ u.shield+=u.startShield; u.shieldT=8; } if(u.sp.startShieldPct){ u.shield+=u.maxHp*u.sp.startShieldPct; u.shieldT=8; } }
   for(const u of cb.units) if(u.sp.veil) for(const a of cb.units) if(a!==u&&a.side===u.side&&dU(u,a)<=1){ a.shield+=u.sp.veil; a.shieldT=Math.max(a.shieldT,8); }
   for(const u of cb.units){
     if(u.role==='a'&&!u.creep){
       const foes=cb.units.filter(e=>e.side!==u.side); if(!foes.length) continue;
       const far=foes.sort((a,b)=>dU(u,b)-dU(u,a))[0];
       if(teleportNear(cb,u,far)){ u.target=far; fxText(cb,u,'¡Salto!','#ffffff'); }
     }
   }
 }
 cb.t+=DT;
 if(cb.pend&&cb.pend.length){ const due=cb.pend.filter(q=>q.at<=cb.t+1e-9); if(due.length){ cb.pend=cb.pend.filter(q=>q.at>cb.t+1e-9); for(const q of due) q.run(); } }
 for(const u of cb.units){
   if(u.dead) continue;
   u.mt+=DT; u.flash=Math.max(0,u.flash-DT); u.glow=Math.max(0,u.glow-DT);
   if(u.shieldT>0){ u.shieldT-=DT; if(u.shieldT<=0) u.shield=0; }
   if(u.stealth>0) u.stealth-=DT; if(u.tdrT>0) u.tdrT-=DT; if(u.reflT>0) u.reflT-=DT; if(u.sleepT>0) u.sleepT-=DT;
   if(u.woundT>0) u.woundT-=DT; if(u.chillT>0) u.chillT-=DT; if(u.markT>0) u.markT-=DT;
   // Quemaduras, veneno y drenadoras (estas curan a quien las lanzó)
   for(const b of u.burns){ if(b.t>0&&!u.dead){ b.t-=DT; const hp0=u.hp; dealDamage(cb,b.src,u,b.dps*DT,'true',true); if(b.leech&&b.src&&!b.src.dead) heal(b.src,(hp0-u.hp)*b.leech); } }
   u.burns=u.burns.filter(b=>b.t>0);
   if(u.dead) continue;
   if(u.regen) heal(u,u.maxHp*u.regen*DT);
   if(u.manaRegen) u.mana+=u.manaRegen*DT;
   if(u.sp.rampAp) u.ap+=u.sp.rampAp*DT;
   if(u.sp.aura){ u.auraT=(u.auraT||0)+DT; if(u.auraT>=5){ u.auraT=0; for(const a of cb.units) if(!a.dead&&a.side===u.side) heal(a,a.maxHp*u.sp.aura); } }
   if(u.sp.sunfire){ u.sunT=(u.sunT||0)+DT; if(u.sunT>=1){ u.sunT=0; for(const e of cb.units) if(!e.dead&&e.side!==u.side&&dU(u,e)<=1) dealDamage(cb,u,e,e.maxHp*u.sp.sunfire,'true',true); } }
   if(u.stun>0){ u.stun-=DT; continue; }
   if(!u.target||u.target.dead||u.target.stealth>0) u.target=nearestEnemy(cb,u);
   if(!u.target) continue;
   if(u.mana>=u.maxMana){ u.mana=u.sp.refund||0; castAbility(cb,u,u.ab); continue; }
   const d=dU(u,u.target);
   if(d<=u.range){ u.atkCd-=DT; if(u.atkCd<=0){ u.atkCd=1/(u.as*(u.chillT>0?.65:1)); attack(cb,u,u.target); } }
   else { u.moveCd-=DT; if(u.moveCd<=0){ const s=nextStep(cb,u,u.target); if(s){ u.pc=u.c;u.pr=u.r;u.c=s[0];u.r=s[1];u.mt=0; } else u.target=nearestEnemy(cb,u); u.moveCd=.35; } }
 }
 const a0=cb.units.some(u=>!u.dead&&u.side===0), a1=cb.units.some(u=>!u.dead&&u.side===1);
 if(!a0||!a1){ cb.done=true; cb.winner=a0?0:a1?1:null; }
 else if(cb.t>40){ cb.done=true; cb.winner=null; }
}
function simulate(cb){ let g=0; while(!cb.done&&g++<2000) stepCombat(cb); cb.done=true; }
const survivors=(cb,side)=>cb.units.filter(u=>!u.dead&&u.side===side).reduce((s,u)=>s+(u.star>=3?2:1),0);

/* ============================== [BOTS] ============================== */
function botValue(u,counts){ const d=DEF[u.defId]; return d.cost*Math.pow(3,u.star-1)+u.items.length*1.5+d.traits.reduce((s,t)=>s+(counts[t]||0)*.35,0); }
function botMakeRoom(p,key){
 const counts=traitCountsOf(allUnits(p));
 const cand=p.bench.map((u,i)=>({u,i})).filter(x=>x.u&&x.u.baseId!==key&&countSame(p,x.u.baseId,x.u.star)<2).sort((a,b)=>botValue(a.u,counts)-botValue(b.u,counts));
 if(!cand.length) return false; sellAt(p,{i:cand[0].i}); return true;
}
function botShop(p,reserve){
 const easy=G.diff==='facil';
 let bought=true, guard=0;
 while(bought&&guard++<10){
   bought=false; const all=allUnits(p); const counts=traitCountsOf(all);
   const top=Object.entries(counts).filter(e=>e[0]!=='Legendario').sort((a,b)=>b[1]-a[1]).slice(0,2).map(x=>x[0]);
   for(let i=0;i<5;i++){
     const k=p.shop[i]; if(!k) continue; const d=DEF[k];
     const copies=all.filter(u=>u.baseId===k).length;
     let want=copies>0||d.traits.some(t=>top.includes(t))||all.length<maxBoard(p)+2||(d.cost>=4&&p.level>=7);
     if(easy&&Math.random()<.4) want=false;
     const budget=copies>=2?0:reserve;
     if(!want||p.gold-d.cost<budget) continue;
     if(!canBuy(p,i)&&!botMakeRoom(p,k)) continue;
     if(buy(p,i)) bought=true;
   }
 }
}
function placeBot(p,u){
 const role=DEF[u.defId].role, C=[3,2,4,1,5,0,6]; let order;
 if(G.diff==='facil') order=shuffle([0,1,2,3].flatMap(r=>C.map(c=>[c,r])));
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
 for(const u of rest){ const j=p.bench.findIndex(x=>!x); if(j>=0) p.bench[j]=u; else { p.gold+=sellValue(u); returnToPool(u.baseId,Math.pow(3,u.star-1)); for(const it of u.items) giveItem(p,it); } }
}
function botEquip(p){
 if(G.diff==='facil'&&Math.random()<.5) return;
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
 const R=G.round, s=R.s, df=G.diff||'normal';
 let tgt=s===1?3:s===2?(R.n<=3?4:5):s===3?(R.n<=2?6:7):s===4?8:s===5?9:10;
 if(df==='facil') tgt=Math.max(2,tgt-1);
 if(df==='dificil'&&s>=3) tgt=Math.min(10,tgt+(R.n>=4?1:0));
 let reserve=s<=1?0:s===2?10:30; if(p.hp<45) reserve=10; if(p.hp<25) reserve=0;
 if(df==='facil') reserve+=10; if(df==='dificil'&&p.hp<60) reserve=Math.max(0,reserve-10);
 let g=0; while(p.level<tgt&&p.gold-4>=Math.min(reserve,20)&&g++<40) buyXp(p);
 botShop(p,reserve);
 let rolls=0; let maxRolls=p.hp<40?12:s>=5?6:p.gold>60?3:0;
 if(df==='facil') maxRolls=0; if(df==='dificil') maxRolls+=3;
 while(rolls<maxRolls&&(p.freeRerolls>0||p.gold-2>=reserve)){ reroll(p); rolls++; botShop(p,reserve); }
 while(p.freeRerolls>0){ reroll(p); botShop(p,reserve); }
 botArrange(p); botEquip(p);
}

/* ============================ [AUGMENTS] ============================ */
function giveRandom(p,cost){ const k=drawUnitOfCost(cost,threeStarSet(p)); if(k) giveUnitTo(p,k); return k; }
const A=(id,tier,name,icon,desc,apply)=>({id,tier,name,icon,desc,apply});
const AUGS=[
 A('amuleto1','S','Amuleto Moneda I','🪙','+1 de oro al inicio de cada ronda. Recibes 3 de oro.',p=>{p.mods.income+=1;p.gold+=3;}),
 A('exp1','S','Repartir Exp. I','📡','+1 de EXP extra por ronda y +4 de EXP ahora.',p=>{p.mods.xpRound+=1;addXp(p,4);}),
 A('bolsa1','S','Bolsa de Objetos I','👜','Recibes 1 componente y 2 de oro.',p=>{giveItem(p,pick(BASIC));p.gold+=2;}),
 A('danza1','S','Danza Espada I','⚔️','Tu equipo gana +8% de daño de ataque.',p=>p.mods.adPct+=.08),
 A('maquina1','S','Maquinación I','🧠','Tu equipo gana +12 de poder de habilidad.',p=>p.mods.ap+=12),
 A('agilidad1','S','Agilidad I','💨','Tu equipo gana +8% de velocidad de ataque.',p=>p.mods.asPct+=.08),
 A('ferrea1','S','Defensa Férrea I','🛡️','Tu equipo gana +12 de defensa y +12 de resistencia.',p=>{p.mods.def+=12;p.mods.mr+=12;}),
 A('vital1','S','Vitalidad I','❤️','Tu equipo gana +6% de vida y recuperas 8 de vida de entrenador.',p=>{p.mods.hpPct+=.06;p.hp=Math.min(100,p.hp+8);}),
 A('guarde1','S','Guardería I','🥚','Recibes 2 Pokémon aleatorios de coste 1 y 2 de oro.',p=>{giveRandom(p,1);giveRandom(p,1);p.gold+=2;}),
 A('ruleta1','S','Ruleta Pokémon I','🎰','1 tienda gratis cada ronda.',p=>{p.mods.freeRerolls+=1;p.freeRerolls+=1;}),
 A('medalla1','S','Medalla de Bronce','🏅','Recibes una Medalla para crear una Insignia de sinergia.',p=>giveItem(p,'medal')),
 A('rocket1','S','Plan Rocket I','🚀','Recibes 5 de oro. Tus rachas de derrotas dan +1 de oro extra.',p=>{p.gold+=5;p.mods.lossBonus+=1;}),
 A('amuleto2','G','Amuleto Moneda II','🪙','+2 de oro al inicio de cada ronda. Recibes 4 de oro.',p=>{p.mods.income+=2;p.gold+=4;}),
 A('interes','G','Interés Compuesto','🏦','El interés máximo sube de 5 a 7 de oro.',p=>p.mods.maxInterest=Math.max(p.mods.maxInterest,7)),
 A('caramelo','G','Caramelo Raro','🍬','Subes 1 nivel al instante.',p=>{ if(p.level<10){p.level++;p.xp=0;} }),
 A('exp2','G','Repartir Exp. II','📡','+2 de EXP extra por ronda y +6 de EXP ahora.',p=>{p.mods.xpRound+=2;addXp(p,6);}),
 A('entreno','G','Entrenamiento Intensivo','🏋️','Comprar EXP te da 2 de EXP extra.',p=>p.mods.xpBuy+=2),
 A('danza2','G','Danza Espada II','⚔️','Tu equipo gana +15% de daño de ataque.',p=>p.mods.adPct+=.15),
 A('maquina2','G','Maquinación II','🧠','Tu equipo gana +25 de poder de habilidad.',p=>p.mods.ap+=25),
 A('agilidad2','G','Agilidad II','💨','Tu equipo gana +15% de velocidad de ataque.',p=>p.mods.asPct+=.15),
 A('aguante','G','Aguante','🎀','Cada aliado sobrevive una vez a un golpe letal.',p=>p.mods.allFocus=true),
 A('bolsa2','G','Bolsa de Objetos II','🎒','Recibes 2 componentes.',p=>{giveItem(p,pick(BASIC));giveItem(p,pick(BASIC));}),
 A('ultraball','G','Ultra Ball','🟡','Recibes un Pokémon aleatorio de coste 4.',p=>giveRandom(p,4)),
 A('campeon','G','Racha de Campeón','🏆','El oro por racha de victorias se duplica y cada victoria te cura 2 de vida.',p=>{p.mods.winStreakMult=2;p.mods.winHeal+=2;}),
 A('rocket2','G','Plan Rocket II','🚀','El oro por racha de derrotas se duplica. Recibes 6 de oro.',p=>{p.mods.lossStreakMult=2;p.gold+=6;}),
 A('paga','G','Día de Pago','💸','+3 de oro por cada victoria PvP. Recibes 4 de oro.',p=>{p.mods.winGold+=3;p.gold+=4;}),
 A('piedra','G','Piedra Evolutiva','💎','Recibes un Eevee. Tus Eevee evolucionan tras derrotar a 1 enemigo.',p=>{p.mods.eeveeKills=1; if(G.pool.eevee>0){G.pool.eevee--;giveUnitTo(p,'eevee');}}),
 A('medalla2','G','Medalla de Plata','🥈','+1 a la sinergia de la que tienes más Pokémon.',p=>{ const t=topTrait(p)||pick(Object.keys(TRAITS).filter(x=>x!=='Legendario')); p.mods.extraTrait[t]=(p.mods.extraTrait[t]||0)+1; note(p,`🥈 Medalla de Plata: +1 a ${t}`,true); }),
 A('amuleto3','P','Amuleto Moneda III','💰','+3 de oro al inicio de cada ronda. Recibes 10 de oro.',p=>{p.mods.income+=3;p.gold+=10;}),
 A('master','P','Master Ball','🟣','Recibes un Legendario aleatorio y 1 componente.',p=>{giveRandom(p,5);giveItem(p,pick(BASIC));}),
 A('recluta','P','Nuevo Recluta','➕','+1 espacio en el tablero para el resto de la partida.',p=>p.mods.boardBonus+=1),
 A('caramelos','P','Caramelos Raros','🍭','Subes 1 nivel y recibes 8 de EXP.',p=>{ if(p.level<10){p.level++;p.xp=0;} addXp(p,8); }),
 A('oculto','P','Poder Oculto','🌀','Tu equipo gana +18% de daño de ataque y +30 de poder.',p=>{p.mods.adPct+=.18;p.mods.ap+=30;}),
 A('cofre','P','Cofre del Profesor','🧰','Recibes 2 objetos completos aleatorios.',p=>{giveItem(p,pick(FULL_KEYS));giveItem(p,pick(FULL_KEYS));}),
 A('legado','P','Legado Legendario','👑','Tus Legendarios ganan +40% de vida y daño. Recibes un Legendario aleatorio.',p=>{p.mods.legend+=.4;giveRandom(p,5);}),
 A('vital3','P','Vitalidad III','💖','Tu equipo gana +20% de vida y recuperas 20 de vida de entrenador.',p=>{p.mods.hpPct+=.2;p.hp=Math.min(100,p.hp+20);}),
 A('ruleta3','P','Ruleta Pokémon III','🎰','3 tiendas gratis cada ronda.',p=>{p.mods.freeRerolls+=3;p.freeRerolls+=3;}),
];
const AUG_BY={}; for(const a of AUGS) AUG_BY[a.id]=a;
const TIER_NAME={S:'Plata',G:'Oro',P:'Prismático'};
function rollAugTiers(){
 const a1=weighted([[26,'S'],[65,'G'],[9,'P']]);
 const T2={S:[[36,'S'],[61,'G'],[4,'P']],G:[[28,'S'],[48,'G'],[24,'P']],P:[[50,'S'],[30,'G'],[20,'P']]};
 const a2=weighted(T2[a1]);
 const T3={S:{S:[[50,'G'],[50,'P']],G:[[71,'G'],[29,'P']],P:[[100,'P']]},G:{S:[[90,'G'],[10,'P']],G:[[65,'G'],[35,'P']],P:[[35,'S'],[59,'G'],[6,'P']]},P:{S:[[80,'G'],[20,'P']],G:[[67,'G'],[33,'P']],P:[[50,'G'],[50,'P']]}};
 return [a1,a2,weighted(T3[a1][a2])];
}
function augmentChoices(p,tier,n=3){ return shuffle(AUGS.filter(a=>a.tier===tier&&!p.augments.includes(a.id))).slice(0,n).map(a=>a.id); }
function applyAugment(p,a){ p.augments.push(a.id); a.apply(p); note(p,`✨ Aumento ${TIER_NAME[a.tier]}: ${a.name}`); }

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
 else if(k==='c'){ const it=giveItem(p,pick(BASIC)); out.push(ITEMS[it].icon+' '+ITEMS[it].name); }
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
function dropOrb(p,key){ const toks=ORBS[key]?weighted(ORBS[key].t):[key]; G.orbSeq=(G.orbSeq||0)+1; p.orbs.push({id:G.orbSeq,tier:ORB_TIER(key),toks}); }
function openPlayerOrb(p,id,quick){
 const i=p.orbs.findIndex(o=>o.id===id); if(i<0) return null;
 const o=p.orbs.splice(i,1)[0], out=[]; NO_ANVIL=!!quick; for(const t of o.toks) grant(p,t,out); NO_ANVIL=false;
 note(p,`${{gray:'⚪',gold:'🟡',prism:'🌈'}[o.tier]} Orbe: ${out.join(', ')}`,true); return o;
}
function openOrb(p,key,out){ const O=ORBS[key]; const sub=[]; for(const t of weighted(O.t)) grant(p,t,sub); out.push(`${O.icon} ${sub.join(', ')}`); }
function pveLoot(p,R,won){
 const s=R.s,n=R.n; let orbs=[],comps=0,extra=[];
 if(s===1){ if(n<=2){orbs=['gray12'];comps=1;} else {orbs=['blue123'];comps=2;} }
 else if(s===2){ orbs=['gray12','blue123']; comps=1; }
 else if(s===3){ orbs=['gray3',Math.random()<.3?'gold23':'blue123']; comps=1; }
 else if(s===4){ orbs=['blue4',Math.random()<.4?'gold4':'blue4']; extra=['fa']; }
 else { orbs=['gold4',Math.random()<.15?'prism':'blue4']; extra=['ca']; }
 if(!won){ orbs=orbs.slice(0,1); comps=Math.min(comps,1); extra=[]; }
 // Las personas reciben orbes para recoger en el tablero; los bots, el botín directamente
 if(isHuman(p)&&!G.auto){ const all=[...(s>1||n===3?['mag']:[]),...Array(comps).fill('c'),...extra,...orbs]; for(const k of all) dropOrb(p,k); return [`${all.length} orbes de botín (tócalos para abrirlos)`]; }
 const out=[]; for(let i=0;i<comps;i++) grant(p,'c',out); for(const t of extra) grant(p,t,out); for(const o of orbs) openOrb(p,o,out);
 return out;
}

/* ============================== [FLOW] ============================== */
const BOT_NAMES=[['Brock','🪨','brock'],['Misty','💧','misty'],['Erika','🌸','erika'],['Sabrina','🔮','sabrina'],['Blaine','🔥','blaine'],['Koga','🥷','koga'],['Surge','⚡','ltsurge'],['Lance','🐉','lance'],['Blue','😏','blue'],['Cintia','🌟','cynthia'],['Morti','👻','morty'],['Yasmina','🔩','jasmine']];
const DIFF_NAME={facil:'Fácil',normal:'Normal',dificil:'Difícil'};
function later(fn,ms){ const g=G; setTimeout(()=>{ if(G===g&&!G.over) fn(); }, G.auto?0:ms); }
function buildRounds(){
 const R=[]; for(let n=1;n<=3;n++) R.push({s:1,n,type:'pve',aug:-1});
 for(let s=2;s<=9;s++) for(let n=1;n<=7;n++) R.push({s,n,type:n===4?'carousel':n===7?'pve':'pvp',aug:(s===2&&n===1)?0:(s===3&&n===2)?1:(s===4&&n===2)?2:-1});
 return R;
}
const ROUNDS=buildRounds();
function newGame(opts={}){
 UID=1;
 G={pool:{},players:[],roundIdx:-1,round:null,phase:'idle',timer:0,combat:null,fights:[],log:[],over:false,speed:S.speed,auto:!!opts.auto,acc:0,resolving:false,myOpp:'',anvils:[],augTiers:rollAugTiers(),carousel:null,diff:opts.diff||'normal',mp:!!opts.mp,resolveNotBefore:0};
 for(const u of UNIT_LIST) G.pool[u.key]=POOL_SIZE[u.cost-1];
 if(!opts.server) G.players.push(makePlayer(0,opts.auto?'Tú':S.name||'Tú',!!opts.auto,S.avatar||'🧢',S.trainer));
 let id=opts.server?0:1;
 for(const h of (opts.humans||[])){ const p=makePlayer(id++,String(h.nick||'Entrenador').slice(0,14),false,'🧢',h.tr); p.remote=true; p.peer=h.peer; G.players.push(p); }
 const taken=new Set(G.players.map(p=>p.tr)), bots=shuffle(BOT_NAMES.filter(b=>!taken.has(b[2])));
 while(G.players.length<8){ const [n,e,t]=bots.pop(); G.players.push(makePlayer(id++,n+(G.mp?' 🤖':''),true,e,t)); }
 // En el servidor no hay jugador local: G.me es un espectador fantasma fuera de la lista
 G.me=opts.server?Object.assign(makePlayer(-1,'',true,''),{alive:false}):G.players[0];
 note(null,`Empieza la partida (bots: ${DIFF_NAME[G.diff]}). ¡Suerte, entrenador!`);
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
   p.gold+=income(p,idx).total;
   p.freeRerolls=p.mods.freeRerolls;
   if(!p.locked) refreshShop(p); p.locked=false;
   if(idx===0) giveUnitTo(p,drawUnitOfCost(1));
 }
 if(R.type==='carousel'){ startCarousel(); return; }
 if(R.aug>=0){
   const tier=G.augTiers[R.aug];
   for(const p of alivePlayers()){
     if(p.isBot) applyAugment(p,AUG_BY[pick(augmentChoices(p,tier))]);
     else { p.augChoices=augmentChoices(p,tier); p.augPicked=false; p.augRerolled=false; }
   }
   if(alivePlayers().some(isHuman)){ G.phase='augment'; G.augDeadline=G.mp?Date.now()+35000:Infinity; renderUI(); if(G.me.alive&&!G.me.isBot) showAugment(); return; }
 }
 startPlanning();
}
function checkAugDone(){ if(G.phase==='augment'&&alivePlayers().every(p=>p.isBot||p.augPicked)){ if(NET.modal==='aug') closeModal(); startPlanning(); } }
function autoAugs(){ for(const p of alivePlayers()) if(!p.isBot&&!p.augPicked&&p.augChoices){ applyAugment(p,AUG_BY[pick(p.augChoices)]); p.augPicked=true; } checkAugDone(); }
function startPlanning(){
 const R=G.round; G.phase='planning'; G.timer=S.timer||Infinity; if(G.mp&&!isFinite(G.timer)) G.timer=60;
 G.preview=R.type==='pve'?pveWave(R.s,R.n):null;
 for(const p of G.players) p.ready=false;
 for(const p of alivePlayers()) if(p.isBot) botPlan(p);
 renderUI();
 if(G.auto) later(startCombat,0);
}
function humansReady(){ const hs=alivePlayers().filter(isHuman); return hs.length>0&&hs.every(p=>p.ready); }
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
 for(const p of alivePlayers()) if(isHuman(p)){ const n=autoFill(p); if(n) note(p,`Se colocaron ${n} Pokémon del banquillo en el tablero`,true); }
 G.phase='combat'; G.acc=0; G.resolving=false;
 const alive=alivePlayers(); G.fights=[];
 if(R.type==='pve') for(const p of alive) G.fights.push({a:p,b:null,pve:true});
 else G.fights=makeFights(alive);
 for(const f of G.fights) if(f.b===me&&!f.ghost) [f.a,f.b]=[f.b,f.a];
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
 G.resolveNotBefore=G.mp?Date.now()+maxRemote/G.speed*1000+600:0;
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
function resolveRound(){
 if(G.phase!=='combat') return;
 const R=G.round, base=STAGE_DMG[R.s]||22, me=G.me; const msgs=new Map(), extraGold={};
 G.anvils=[]; const won=new Map();
 const say=(p,m)=>msgs.set(p,m);
 for(const f of G.fights){
   const c=f.c; if(!c.done) simulate(c);
   for(const u of c.units) if(u.ref&&u.kills) u.ref.kills+=u.kills;
   const addG=(p,g)=>{ if(g>0){ p.gold+=g; extraGold[p.id]=(extraGold[p.id]||0)+g; } };
   if(f.pve){
     const p=f.a, w=c.winner===0; won.set(p,w); addG(p,c.gold[0]);
     if(!w){ const d=base+survivors(c,1); p.hp-=d; p.lastDmg=d; }
     const loot=pveLoot(p,R,w);
     say(p,(w?'🐾 Ronda PvE superada':`🐾 Los salvajes te ganaron: −${p.lastDmg} de vida`)+(loot.length?' · Botín: '+loot.join(' · '):''));
     continue;
   }
   const A=f.a,B=f.b; addG(A,c.gold[0]); if(!f.ghost) addG(B,c.gold[1]);
   if(c.winner===0){ win(A); won.set(A,true); if(!f.ghost){ lose(B,base+survivors(c,0)); won.set(B,false); } }
   else if(c.winner===1){ lose(A,base+survivors(c,1)); won.set(A,false); if(!f.ghost){ win(B); won.set(B,true); } }
   else { lose(A,base+survivors(c,1)); won.set(A,false); if(!f.ghost){ lose(B,base+survivors(c,0)); won.set(B,false); } }
   A.lastOpp=B.id; if(!f.ghost) B.lastOpp=A.id;
   say(A,c.winner===0?`✅ Victoria contra ${B.name}`:c.winner===1?`❌ Derrota contra ${B.name}: −${A.lastDmg} de vida`:`⏱️ Empate por tiempo con ${B.name}: −${A.lastDmg} de vida`);
   if(!f.ghost) say(B,c.winner===1?`✅ Victoria contra ${A.name}`:c.winner===0?`❌ Derrota contra ${A.name}: −${B.lastDmg} de vida`:`⏱️ Empate por tiempo con ${A.name}: −${B.lastDmg} de vida`);
 }
 for(const p of alivePlayers()){ const tier=traitTiers(p)['Fortuna']||0; if(tier){ const g=[0,1,3][tier]+(won.get(p)?[0,1,2][tier]:0); p.gold+=g; extraGold[p.id]=(extraGold[p.id]||0)+g; } }
 for(const [p,m] of msgs) if(isHuman(p)) note(p,m,true);
 for(const p of G.players) if(isHuman(p)&&extraGold[p.id]) note(p,`💰 Fortuna y habilidades de oro: +${extraGold[p.id]} de oro`,true);
 const dead=G.players.filter(p=>p.alive&&p.hp<=0).sort((a,b)=>a.hp-b.hp);
 let n=alivePlayers().length;
 for(const p of dead){
   p.place=n--; p.alive=false; p.hp=0;
   for(const u of allUnits(p)) returnToPool(u.baseId,Math.pow(3,u.star-1));
   for(const k of p.shop) if(k) returnToPool(k,1);
   p.board={}; p.bench=Array(BENCH).fill(null); p.shop=[null,null,null,null,null];
   note(null,`💀 ${p.name} queda eliminado (puesto ${p.place})`);
 }
 G.phase='results'; G.combat=null; G.view=null;
 for(const p of alivePlayers()) combine(p);
 const queue=[];
 for(const p of alivePlayers()) for(const u of allUnits(p)) if(u.defId==='eevee'&&u.kills>=p.mods.eeveeKills){
   if(p!==G.me||G.auto||p.isBot){ u.defId=pick(EVOS).key; note(p,`🌀 Eevee evolucionó en ${DEF[u.defId].name}`,true); } else queue.push(done=>showEvolve(u,done));
 }
 for(const a of G.anvils) queue.push(done=>showAnvil(a,done));
 G.anvils=[];
 renderUI();
 if(alivePlayers().length<=1||(!G.mp&&!me.alive)){ if(alivePlayers().length===1) alivePlayers()[0].place=1; later(endGame,900); return; }
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
 const itemPool=s<=3?BASIC:FULL_KEYS;
 const opts=[]; for(let i=0;i<9;i++){ const k=drawUnitOfCost(pick(costs)); if(k) opts.push({key:k,item:Math.random()<.04?'medal':pick(itemPool),taken:null}); }
 const order=alivePlayers().sort((a,b)=>a.hp-b.hp||Math.random()-.5);
 G.carousel={opts,order,t:0,rot:Math.random()*6,av:{},endT:0,finished:false};
 if(G.auto||(HEADLESS&&!SERVER)){ for(const p of order){ const i=carouselChoice(p); if(i!=null) takeCarousel(p,i); } finishCarousel(); return; }
 order.forEach((p,j)=>{ G.carousel.av[p.id]={ang:j*Math.PI*2/order.length,x:null,y:null,target:null,done:false,rel:false,delay:.4+Math.random()*1.2}; });
 note(null,'🎠 Carrusel: eligen primero los entrenadores con menos vida (de 2 en 2)');
 renderUI();
}
function takeCarousel(p,i){ const o=G.carousel.opts[i]; if(!o||o.taken) return false; o.taken=p; giveUnitTo(p,o.key); giveItem(p,o.item); note(p,`🎠 Elegiste ${DEF[o.key].name} con ${ITEMS[o.item].name}`,true); return true; }
function finishCarousel(){ const C=G.carousel; for(const o of C.opts) if(!o.taken) returnToPool(o.key,1); G.carousel=null; renderUI(); later(nextRound,400); }
const releaseAt=idx=>1.5+3.5*Math.floor(idx/2);
function endGame(){ G.over=true; G.phase='over'; if(G.me.alive&&!G.me.place) G.me.place=1; renderUI(); if(NET.mode==='host') netFlush(true); if(!G.auto&&!HEADLESS) showGameOver(); }

// Acciones de un jugador (las del anfitrión, las de los clientes y las de un jugador solo pasan por aquí)
function normLoc(l){ if(!l||typeof l!=='object') return null; if(typeof l.b==='string'&&/^[0-6],[0-3]$/.test(l.b)) return {b:l.b}; if(Number.isInteger(l.i)&&l.i>=0&&l.i<BENCH) return {i:l.i}; return null; }
function applyAct(p,a){
 if(!p||!a||typeof a!=='object'||!G||G.over||!p.alive||!G.players.length) return {ok:false};
 const ph=G.phase, idx=x=>Number.isInteger(x)?x:-1;
 switch(a.t){
  case 'buy': { const i=idx(a.i); if(i<0||i>4) return {ok:false}; const k=p.shop[i]; if(!k) return {ok:false}; if(!buy(p,i)) return {ok:false,why:p.gold<DEF[k].cost?'No tienes oro suficiente':'Banquillo lleno'}; return {ok:true}; }
  case 'reroll': return {ok:reroll(p),why:'No tienes oro suficiente'};
  case 'xp': return {ok:buyXp(p),why:'No tienes oro suficiente'};
  case 'lock': p.locked=!p.locked; return {ok:true};
  case 'sell': { const loc=normLoc(a.loc); return {ok:!!(loc&&sellAt(p,loc)),why:'No puedes vender eso ahora'}; }
  case 'move': { const f=normLoc(a.from), to=normLoc(a.to); if(!f||!to) return {ok:false}; if((ph==='combat'||ph==='carousel')&&(f.b!==undefined||to.b!==undefined)) return {ok:false}; return {ok:moveTo(p,f,to)}; }
  case 'item': { const loc=normLoc(a.loc), u=loc&&getAt(p,loc); if(!u) return {ok:false}; const r=useItem(p,idx(a.idx),u,loc); if(r.ok&&r.made) note(p,`⚒️ ¡Creaste ${ITEMS[r.made].name} en ${nameOf(DEF[u.defId],u.star)}!`,true); if(r.ok&&r.removed) note(p,`🧲 Los objetos de ${nameOf(DEF[u.defId],u.star)} volvieron a tu inventario`,true); return r; }
  case 'orb': { if(ph==='combat') return {ok:false}; return {ok:!!openPlayerOrb(p,a.id|0,false)}; }
  case 'icomb': { const r=combineBench(p,idx(a.a),idx(a.b)); if(r.ok) note(p,`⚒️ ¡Creaste ${ITEMS[r.made].name}!`,true); return r; }
  case 'rmitem': return {ok:false,why:'Para quitar objetos usa un 🧲 Imán Removedor'};
  case 'ready': if(ph==='planning') p.ready=true; return {ok:true};
  case 'aug': { if(ph!=='augment'||!p.augChoices||p.augPicked) return {ok:false}; const id=p.augChoices[idx(a.i)]; if(!id) return {ok:false}; applyAugment(p,AUG_BY[id]); p.augPicked=true; checkAugDone(); return {ok:true}; }
  case 'augrr': { if(ph!=='augment'||p.augPicked||p.augRerolled) return {ok:false}; p.augChoices=augmentChoices(p,G.augTiers[G.round.aug]); p.augRerolled=true; return {ok:true}; }
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
function packInst(u){ return [u.uid,u.defId,u.star,u.items,R0(u.stk.hp),R0(u.stk.ad),u.kills]; }
function unpackInst(a){ if(!Array.isArray(a)||!DEF[a[1]]) return null; return {uid:a[0],defId:a[1],baseId:DEF[a[1]].evoOf||a[1],star:clamp(a[2]|0,1,3),items:(a[3]||[]).filter(i=>ITEMS[i]),stk:{hp:+a[4]||0,ad:+a[5]||0},kills:+a[6]||0}; }
function makePub(){
 return {ph:G.phase,ri:G.roundIdx,tl:isFinite(G.timer)?Math.max(0,Math.ceil(G.timer)):-1,sp:G.speed,at:G.augTiers,ov:G.over?1:0,dif:G.diff,
   pl:G.players.map(p=>[p.id,p.name,p.emoji,R0(p.hp),p.level,p.streak,p.alive?1:0,p.place,p.peer||'',p.isBot?1:0,p.ready?1:0,boardUnits(p).length,p.tr||'',p.lastUp||0]),
   // Tableros y banquillos de todos, para poder mirarlos fuera del combate
   bd:G.players.map(p=>[Object.entries(p.board).map(([k,u])=>[k,u.defId,u.star,u.items]),p.bench.map(u=>u?[u.defId,u.star,u.items]:0)])};
}
function makePriv(p){
 const d={to:p.peer,id:p.id,g:p.gold,l:p.level,x:p.xp,sh:p.shop,lk:p.locked?1:0,fr:p.freeRerolls,au:p.augments,it:p.items,md:p.mods,
   be:p.bench.map(u=>u?packInst(u):null),bo:Object.entries(p.board).map(([k,u])=>[k,packInst(u)]),
   po:possibleOpps(p).map(q=>q.id),ac:G.phase==='augment'&&!p.augPicked?p.augChoices:null,ar:p.augRerolled?1:0,lg:p.log.slice(0,8),ts:p.toasts,ob:p.orbs.slice(0,12).map(o=>[o.id,o.tier])};
 if(JSON.stringify(d).length>3900){ d.lg=d.lg.slice(0,2); d.ts=d.ts.slice(-1); }
 return d;
}
function netFlush(force){
 if(NET.mode!=='host'||!NET.named||!G||!G.players.length) return;
 const emit=(t,d)=>NET.named.emit(t,d).catch(()=>{});
 const pub=makePub(), ps=JSON.stringify(pub);
 if(force||ps!==NET.lastPub){ emit('pub',pub); NET.lastPub=ps; }
 for(const p of G.players) if(p.remote){ const d=makePriv(p), s=JSON.stringify(d); if(force||s!==NET.lastPriv[p.id]){ emit('priv',d); NET.lastPriv[p.id]=s; } }
}
function netSendCombats(){
 // Todos los combates de la ronda, para que cada jugador pueda ver el de cualquier otro
 NET.named.emit('cmbs',{R:[G.round.s,G.round.n],list:G.fights.map(f=>({seed:f.seed,a:f.sa,b:f.sb,ia:f.a.id,ib:f.b?f.b.id:-1,pve:f.pve?1:0,ghost:f.ghost?1:0}))}).catch(()=>{});
 for(const f of G.fights){
   const send=(p,side)=>{ if(!p||!p.remote) return; const o=f.pve?null:side===0?f.b:f.a; NET.named.emit('cmb',{to:p.peer,seed:f.seed,side,a:f.sa,b:f.sb,R:[G.round.s,G.round.n],opp:oppLabel(f,side),ot:o?o.tr:''}).catch(()=>{}); };
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
 if(now-NET.lastForce>2000){ NET.lastForce=now; netFlush(true); } else netFlush(false);
 if(G.phase==='carousel'&&now-NET.lastCar>160){ NET.lastCar=now; netCarousel(); }
}
// ----- vestíbulo (Socket.io: el servidor lleva las salas y la partida) -----
function sock(){
 if(NET.sock) return NET.sock;
 if(HEADLESS||typeof io==='undefined') return null;
 const s=io({transports:['websocket','polling']}); NET.sock=s; NET.rooms=[];
 s.on('connect',()=>{ NET.myPeer=s.id; if(NET.screen==='lobby') s.emit('list'); });
 s.on('connect_error',err=>{ if(err&&err.message==='auth'){ resetSocket(); resetNet(); showAuth('Tu sesión ha caducado. Vuelve a entrar.'); } });
 s.on('disconnect',()=>{ if(NET.mode==='client'||NET.mode==='joining'){ toast('Se perdió la conexión con el servidor'); if(G&&G.mirror) G.over=true; resetNet(); closeModal(); showMenu(); } });
 s.on('rooms',list=>{ NET.rooms=Array.isArray(list)?list.slice(0,50):[]; if(NET.screen==='lobby') renderRoomList(); });
 s.on('err',m=>{ toast(String(m||'Error')); if(NET.mode==='joining'&&NET.screen!=='room') NET.mode='sp'; });
 s.on('lobby',d=>{
   if(NET.mode!=='joining'||!d) return;
   NET.cfg={name:String(d.name||'Sala').slice(0,24),max:+d.max||8,diff:DIFF_NAME[d.diff]?d.diff:'normal'};
   NET.code=String(d.code||'').slice(0,5); NET.owner=String(d.owner||''); NET.seats=Array.isArray(d.seats)?d.seats.slice(0,8):[];
   if(NET.screen!=='room') showRoomScreen(); else renderSeats();
 });
 s.on('start',d=>{ if(NET.mode!=='joining') return; const seats=(d&&d.seats)||[]; if(seats.find(x=>x.peer===NET.myPeer)) startClient(); });
 s.on('pub',d=>{ if(NET.mode==='client') applyPub(d); });
 s.on('priv',d=>{ if(NET.mode==='client'&&d&&d.to===NET.myPeer) applyPriv(d); });
 s.on('cmb',d=>{ if(NET.mode==='client'&&d&&d.to===NET.myPeer) applyCmb(d); });
 s.on('car',d=>{ if(NET.mode==='client') applyCar(d); });
 s.on('cmbs',d=>{ if(NET.mode==='client'&&d&&Array.isArray(d.list)){ G.allFights=d.list.slice(0,8); G.allR={s:clamp(d.R&&d.R[0]|0,1,9),n:clamp(d.R&&d.R[1]|0,1,7)}; G.view=null; } });
 s.on('bye',()=>{ if(NET.mode==='client'||NET.mode==='joining'){ toast('La sala se cerró'); if(G&&G.mirror) G.over=true; resetNet(); closeModal(); showMenu(); } });
 return s;
}
function showMP(){
 const s=sock();
 if(!s){ openModal(`<h1>Multijugador</h1><p>El multijugador necesita el servidor del juego. Abre el juego desde la dirección donde está desplegado (tu app de Render), no como archivo suelto.</p>`,{closable:true}); return; }
 NET.screen='lobby';
 openModal(`<h1>Multijugador</h1>
  <p class="muted">Los asientos vacíos los ocupan bots.</p>
  <h3>Crear sala</h3>
  <div class="row">
   <div class="field"><label for="rmName">Nombre de la sala</label><input id="rmName" maxlength="24" value="Sala de ${esc(S.name)}"></div>
   <div class="field"><label for="rmMax">Jugadores humanos</label><select id="rmMax">${[2,3,4,5,6,7,8].map(n=>`<option ${n===8?'selected':''}>${n}</option>`).join('')}</select></div>
   <div class="field"><label for="rmDiff">Dificultad de los bots</label><select id="rmDiff">${Object.entries(DIFF_NAME).map(([k,v])=>`<option value="${k}" ${k===S.diff?'selected':''}>${v}</option>`).join('')}</select></div>
  </div>
  <button class="btn primary" id="rmCreate">Crear sala</button>
  <h3>Salas abiertas</h3><div class="roomList" id="roomList"></div>
  <h3>Unirse con código</h3><div class="row"><div class="field"><label for="rmCode">Código</label><input id="rmCode" maxlength="5" placeholder="abc12"></div><button class="btn" id="rmJoin" style="margin-bottom:10px">Unirse</button></div>`,{closable:true,onClose:()=>{ if(NET.screen==='lobby') NET.screen=''; }});
 renderRoomList(); s.emit('list');
 $('rmCreate').onclick=()=>{ S.diff=$('rmDiff').value; saveSettings(); NET.mode='joining'; s.emit('create',{name:$('rmName').value.trim()||'Sala',max:+$('rmMax').value,diff:$('rmDiff').value}); };
 $('rmJoin').onclick=()=>{ const c=$('rmCode').value.trim().toLowerCase(); if(!/^[a-z0-9]{5}$/.test(c)){ toast('El código tiene 5 letras o números'); return; } NET.mode='joining'; s.emit('join',{code:c}); };
}
function renderRoomList(){
 const el=$('roomList'); if(!el) return;
 const rooms=NET.rooms||[];
 el.innerHTML=rooms.length?rooms.map(r=>`<div class="roomItem">${headHTML(TRAINER_BY[r.tr]?r.tr:'',34)}<b>${esc(String(r.name||'Sala').slice(0,24))}</b><span class="small muted">${+r.n||1}/${+r.max||8} · bots ${esc(DIFF_NAME[r.diff]||'Normal')}</span><button class="btn sm" data-code="${esc(r.code)}">Unirse</button></div>`).join(''):'<p class="muted small">No hay salas abiertas ahora. Crea una y pasa el código a tus amigos.</p>';
 el.querySelectorAll('button[data-code]').forEach(b=>b.onclick=()=>{ NET.mode='joining'; NET.sock.emit('join',{code:b.dataset.code}); });
}
function showRoomScreen(){
 NET.screen='room';
 openModal(`<h1>Sala <span class="code">${esc(NET.code)}</span></h1><p class="muted" id="roomInfo"></p><div class="seats" id="seats"></div>
  <div class="row" id="rmActions"></div>
  <p class="small muted">Pasa el código a tus amigos: lo escriben en Multijugador → Unirse con código.</p>`,{closable:false});
 renderSeats();
}
function renderSeats(){
 const el=$('seats'); if(!el) return; const cfg=NET.cfg||{name:'Sala',max:8,diff:'normal'};
 $('roomInfo').textContent=`${cfg.name} · hasta ${cfg.max} humanos · bots en ${DIFF_NAME[cfg.diff]}`;
 const rows=[]; for(let i=0;i<8;i++){ const s=NET.seats[i]; rows.push(s?`<div class="seat ${s.peer===NET.owner?'host':''}">${headHTML(TRAINER_BY[s.tr]?s.tr:'',44)}${esc(s.nick)}${s.peer===NET.myPeer?' (tú)':''}${s.peer===NET.owner?' 👑':''}</div>`:`<div class="seat bot">🤖 Bot ${DIFF_NAME[cfg.diff]}</div>`); }
 el.innerHTML=rows.join('');
 const owner=NET.owner&&NET.owner===NET.myPeer;
 $('rmActions').innerHTML=(owner?'<button class="btn primary" id="rmStart">Empezar partida</button>':'<span class="muted" style="margin-right:auto">Esperando a que el creador de la sala empiece…</span>')+'<button class="btn" id="rmLeave">Salir de la sala</button>';
 if($('rmStart')) $('rmStart').onclick=()=>NET.sock.emit('start',{timer:S.timer||30,speed:S.speed||1});
 $('rmLeave').onclick=()=>{ leaveRoom(); showMP(); };
}
function resetNet(){ Object.assign(NET,{mode:'sp',code:'',owner:'',seats:[],cfg:null,screen:'',modal:'',shownOver:false,lastToast:0}); updateNetTag(); }
function leaveRoom(){ if(NET.sock) NET.sock.emit('leave'); if(G&&G.mirror) G.over=true; resetNet(); }
// ----- cliente: espejo del estado que manda el anfitrión -----
function startClient(){
 NET.mode='client'; closeModal(); NET.screen=''; $('menu').classList.add('hidden'); selected=null; selCombat=null; NET.shownOver=false; NET.lastToast=0;
 const me=makePlayer(-1,S.name,false,S.avatar,S.trainer);
 G={mirror:true,players:[me],me,phase:'idle',roundIdx:0,round:ROUNDS[0],timer:0,log:[],speed:1,pool:{},augTiers:['G','G','G'],diff:'normal',over:false,combat:null,acc:0,flip:false,myOpp:'',mp:true};
 updateNetTag(); renderUI();
}
function applyPub(d){
 if(!d||!Array.isArray(d.pl)) return;
 const prevPh=G.phase;
 G.phase=typeof d.ph==='string'?d.ph:G.phase; G.roundIdx=clamp(d.ri|0,0,ROUNDS.length-1); G.round=ROUNDS[G.roundIdx];
 G.timer=d.tl>=0?d.tl:Infinity; G.speed=[1,2,4].includes(d.sp)?d.sp:1; if(Array.isArray(d.at)) G.augTiers=d.at; G.diff=d.dif||'normal';
 const list=[];
 for(const r of d.pl.slice(0,8)){
   const [id,name,emoji,hp,level,streak,alive,place,peer,bot,ready,bn,tr,up]=r;
   const p=peer&&peer===NET.myPeer?G.me:(G.players.find(x=>x.id===id&&x!==G.me)||makePlayer(id,'',!!bot,''));
   Object.assign(p,{id,name:String(name).slice(0,20),emoji:String(emoji).slice(0,4),tr:TRAINER_BY[tr]?tr:'',hp:+hp,level:+level,streak:+streak,alive:!!alive,place:+place,peer:String(peer||''),isBot:!!bot,ready:!!ready,boardN:+bn||0,lastUp:Array.isArray(up)&&up.length===3?up.map(Number):null});
   const bd=Array.isArray(d.bd)?d.bd[list.length]:null;
   if(p!==G.me&&Array.isArray(bd)) unpackBoard(p,bd);
   list.push(p);
 }
 G.players=list;
 G.preview=G.round.type==='pve'&&G.phase==='planning'?pveWave(G.round.s,G.round.n):null;
 if(prevPh==='combat'&&G.phase!=='combat'){ G.combat=null; G.view=null; selCombat=null; }
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
 const me=G.me;
 Object.assign(me,{id:d.id,gold:+d.g||0,level:clamp(+d.l||1,1,10),xp:+d.x||0,shop:(d.sh||[]).slice(0,5).map(k=>DEF[k]?k:null),locked:!!d.lk,freeRerolls:+d.fr||0,augments:(d.au||[]).filter(a=>AUG_BY[a]),items:(d.it||[]).filter(i=>ITEMS[i]).slice(0,MAX_ITEMS_BENCH)});
 me.mods=Object.assign(defaultMods(),d.md||{}); me.po=Array.isArray(d.po)?d.po.slice(0,8):null;
 me.orbs=Array.isArray(d.ob)?d.ob.slice(0,12).filter(o=>Array.isArray(o)&&['gray','gold','prism'].includes(o[1])).map(([id,tier])=>({id:+id,tier,toks:[]})):[];
 const selUid=selected&&selected.uid;
 me.bench=Array(BENCH).fill(null).map((_,i)=>d.be&&d.be[i]?unpackInst(d.be[i]):null);
 me.board={}; for(const row of d.bo||[]){ const u=unpackInst(row[1]); if(u&&/^[0-6],[0-3]$/.test(row[0])) me.board[row[0]]=u; }
 selected=selUid?allUnits(me).find(u=>u.uid===selUid)||null:null;
 const hadChoices=!!me.augChoices; me.augChoices=Array.isArray(d.ac)?d.ac.filter(a=>AUG_BY[a]):null; me.augRerolled=!!d.ar;
 G.log=Array.isArray(d.lg)?d.lg.map(String):[];
 for(const [seq,msg] of d.ts||[]) if(seq>NET.lastToast){ NET.lastToast=seq; toast(String(msg)); }
 if(G.phase==='augment'&&me.augChoices&&me.augChoices.length&&(NET.modal!=='aug'||!hadChoices||NET.augKey!==me.augChoices.join())) showAugment();
 if(!me.augChoices&&NET.modal==='aug') closeModal();
 renderUI();
}
function applyCmb(d){
 if(!d||!d.a) return;
 const R={s:clamp(d.R&&d.R[0]|0,1,9),n:clamp(d.R&&d.R[1]|0,1,7)};
 G.combat=createCombatSnap(d.a,d.b||null,R,{seed:d.seed,visual:true}); G.flip=d.side===1; G.acc=0; G.myOpp=String(d.opp||'').slice(0,40); G.myOppTr=TRAINER_BY[d.ot]?d.ot:''; selCombat=null;
 renderUI();
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
 G.carousel={opts,order,av,rot:+d.rot||0,t:+d.t||0,mirror:true};
}
function updateNetTag(){ if(HEADLESS) return; const el=$('netTag'); if(NET.mode==='client'){ el.hidden=false; el.textContent=`Sala ${NET.code}`; } else el.hidden=true; }
// Acción local: en modo cliente se envía al anfitrión; en solitario o como anfitrión se aplica directamente
function doAct(a,optimistic){
 if(!G||!G.players.length) return;
 if(NET.mode==='client'){
   if(!G.me.alive) return;
   if(NET.sock) NET.sock.emit('act',a);
   if(optimistic) optimistic();
   renderUI(); return;
 }
 const r=applyAct(G.me,a);
 if(r&&!r.ok&&r.why) note(G.me,r.why,true);
 renderUI(); return r;
}

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
const ITEM_ART={claw:'razor-claw',wing:'swift-wing',spoon:'twisted-spoon',water:'mystic-water',coat:'metal-coat',goggles:'safety-goggles',club:'thick-club',lens:'zoom-lens',medal:'gold-bottle-cap',
 band:'choice-band',expert:'expert-belt',shellbell:'shell-bell',mental:'mental-herb',sash:'focus-sash',blood:'big-root',sitrus:'sitrus-berry',sharp:'scope-lens',scarf:'choice-scarf',rage:'muscle-band',
 light:'light-ball',titan:'protector',twin:'quick-claw',quick:'quick-powder',razorfang:'razor-fang',specs:'choice-specs',moon:'moon-stone',royal:'kings-rock',veil:'light-clay',charcoal:'charcoal',
 wise:'wise-glasses',soothe:'soothe-bell',energy:'energy-root',holy:'fresh-water',cure:'lum-berry',justice:'life-orb',helmet:'rocky-helmet',vest:'assault-vest',flame:'flame-orb',sturdy:'eviolite',
 scale:'dragon-scale',bright:'bright-powder',whiteherb:'white-herb',leftovers:'leftovers',hook:'grip-claw',zoom:'wide-lens',master:'master-ball',magnet:'magnet'};
const BADGE_SPRITE=n=>`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/badges/${n}.png`;
const itemSrc=k=>ITEMS[k]&&ITEMS[k].badge?BADGE_SPRITE(ITEMS[k].badge):ITEM_ART[k]?ITEM_SPRITE(ITEM_ART[k]):'';
const getItemImg=k=>itemSrc(k)?loadImg('it:'+k,itemSrc(k)):{status:'fail'};
const itemTier=I=>I.comp||I.tool?'comp':I.emblem?'emb':'full';
const itemColor=I=>I.tool?'#ff6a5f':I.emblem&&TRAITS[I.emblem]?TRAITS[I.emblem].color:I.comp?'#aab4c8':'#f4c04e';
function itemHTML(k,size){
 const I=ITEMS[k]; if(!I) return '';
 const art=itemSrc(k)&&getItemImg(k).status!=='fail';
 return `<span class="ii ${itemTier(I)}" style="--ic:${itemColor(I)}${size?`;--is:${size}px`:''}">${art?`<img src="${itemSrc(k)}" alt="${esc(I.name)}" data-fb="${esc(I.icon)}">`:`<i>${I.icon}</i>`}</span>`;
}
const trainerOf=p=>p&&TRAINER_BY[p.tr]?p.tr:'';
function headHTML(p,size){ const t=typeof p==='string'?p:trainerOf(p); return t?`<span class="head em" style="--src:url('${TRAINER_SPRITE(t)}')${size?`;--hs:${size}px`:''}"></span>`:`<span class="head em">${esc(p&&p.emoji||'🧢')}</span>`; }
// Si una imagen de objeto no carga, se sustituye por su emoji
if(!HEADLESS) document.addEventListener('error',e=>{ const el=e.target; if(el&&el.tagName==='IMG'&&el.dataset&&el.dataset.fb){ const i=document.createElement('i'); i.textContent=el.dataset.fb; el.replaceWith(i); } },true);
function initials(name){ return name.replace(/[^A-Za-zÁÉÍÓÚáéíóúñÑ]/g,'').slice(0,3); }
function spriteHTML(d,size,star=1){ return `<span class="spr" style="--s:${size}px" data-dex="${dexOf(d,star)}" data-name="${esc(nameOf(d,star))}" data-color="${typeColor(d)}"></span>`; }
function hydrate(root){
 root.querySelectorAll('.spr:not([data-h])').forEach(el=>{
   el.dataset.h=1; const dex=+el.dataset.dex, e=getImg(dex);
   const fb=()=>{ el.innerHTML=`<span class="tok" style="background:${el.dataset.color}">${esc(initials(el.dataset.name))}</span>`; };
   if(e.status==='fail'){ fb(); return; }
   const img=document.createElement('img'); img.alt=el.dataset.name; img.src=SPRITE(dex);
   img.addEventListener('error',()=>{ e.status='fail'; fb(); }); el.appendChild(img);
 });
}
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
const fullField=()=>!HEADLESS&&window.matchMedia&&matchMedia('(min-width:1101px)').matches;
let view={W:0,H:0,rect:null};
function layout(){
 const wrap=$('boardWrap'), hOf=el=>el?el.offsetHeight:0, full=fullField();
 // La banca de objetos va dentro, a la izquierda: se deja su hueco para que no tape el tablero
 const it=$('items'), side=it&&getComputedStyle(it).position==='absolute'?it.offsetWidth+8:0;
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
function fightsList(){
 if(G.mirror) return G.allFights||[];
 return (G.fights||[]).map(f=>({seed:f.seed,a:f.sa,b:f.sb,ia:f.a.id,ib:f.b?f.b.id:-1,pve:f.pve?1:0,ghost:f.ghost?1:0}));
}
function spectate(pid){
 if(!G||!G.players.length) return;
 const me=G.me, back=()=>{ G.view=null; selCombat=null; renderUI(); };
 if(pid===me.id) return back();
 if(G.phase==='carousel'){ toast('En el carrusel no se pueden mirar tableros'); return; }
 if(G.phase!=='combat'){ const p=G.players.find(x=>x.id===pid); if(!p||!p.alive) return; G.view={board:true,pid}; selected=null; selCombat=null; renderUI(); return; }
 const list=fightsList(), f=list.find(x=>x.ia===pid)||list.find(x=>x.ib===pid&&!x.ghost);
 if(!f){ toast('Ese entrenador no está combatiendo'); return; }
 if((f.ia===me.id||(f.ib===me.id&&!f.ghost))) return back(); // es tu propio combate
 const side=f.ia===pid?0:1, R=G.mirror?(G.allR||G.round):G.round;
 const cb=createCombatSnap(f.a,f.b,R,{seed:f.seed,visual:true});
 // Lo adelanta hasta el mismo segundo que tu combate: como es determinista, se ve igual que en el servidor
 const target=G.combat?G.combat.t:0; let g=0; while(!cb.done&&cb.t<target-1e-6&&g++<2000) stepCombat(cb);
 cb.fx=[];
 const oid=side===0?f.ib:f.ia, opp=G.players.find(p=>p.id===oid);
 G.view={cb,flip:side===1,pid,opp:f.pve?null:opp||null,pve:!!f.pve,ghost:!!f.ghost,acc:0};
 selCombat=null; renderUI();
}
const benchXY=i=>[geo.ox+geo.bs*i+geo.bs/2, geo.pad+geo.bh+18+geo.bs/2];
function unitXY(u){ const [x1,y1]=vXY(u.pc,u.pr), [x2,y2]=vXY(u.c,u.r), k=clamp(u.mt/.3,0,1); return [x1+(x2-x1)*k,y1+(y2-y1)*k]; }
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
 ctx.fillStyle='rgba(0,0,0,.32)'; ctx.beginPath(); ctx.ellipse(x,y+s*.03,pr*1.1,pr*.36,0,0,7); ctx.fill();
 const pg=ctx.createRadialGradient(x,y,0,x,y,pr); pg.addColorStop(0,ring); pg.addColorStop(1,'rgba(0,0,0,0)');
 ctx.globalAlpha=o.dim?.4:.85; ctx.fillStyle=pg; ctx.beginPath(); ctx.ellipse(x,y,pr,pr*.33,0,0,7); ctx.fill();
 ctx.strokeStyle=ring; ctx.lineWidth=2; ctx.beginPath(); ctx.ellipse(x,y,pr,pr*.33,0,0,7); ctx.stroke();
 ctx.globalAlpha=o.dim?.55:1;
 const e=key?getTrImg(key):{status:'fail'};
 if(e.status==='ok'){
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
 return {s, me:[Math.max(s*.28,geo.pad+geo.side*.42),cellXY(0,7)[1]+R*.6], opp:[Math.min(geo.W-s*.28,geo.W-geo.pad-geo.side*.42),cellXY(0,0)[1]+R*.6]};
}
function drawBoardTrainers(){
 const me=G.me; if(!me||!G.players.length) return;
 const sp=trainerSpots(), cb=G.phase==='combat'?viewCombat():null, mySide=curFlip()?1:0, v=G.view;
 const mode=cb&&cb.done?(cb.winner===mySide?'cheer':'sad'):'idle';
 const bub=!v&&trEmote&&performance.now()-trEmote.t0<1800?trEmote.txt:'';
 const nm=s=>s.length>12?s.slice(0,11)+'…':s;
 // Abajo: tú (o el entrenador cuyo combate estás mirando). Arriba: su rival.
 const bottom=v?G.players.find(p=>p.id===v.pid)||me:me;
 myTrBox=drawTrainer(sp.me[0],sp.me[1],trainerOf(bottom),{s:sp.s,ring:bottom===me?'#4c8dff':'#ffd75e',label:nm(bottom.name),hp:bottom.hp,mode:bub?'cheer':mode,bubble:bub,emoji:bottom.emoji});
 if(cb&&G.round&&G.round.type!=='pve'){
   let opp=null, tr='', label='';
   if(v){ opp=v.opp; tr=trainerOf(opp); label=opp?nm(opp.name)+(v.ghost?' 👻':''):''; }
   else if(G.myOpp){ opp=G.players.find(p=>p!==me&&G.myOpp.replace(' (fantasma)','')===p.name); tr=G.myOppTr||trainerOf(opp); label=opp?nm(opp.name):nm(G.myOpp); }
   if(label) drawTrainer(sp.opp[0],sp.opp[1],tr,{s:sp.s,ring:'#ef4b3a',label,hp:opp?opp.hp:undefined,mode:cb.done?(cb.winner===mySide?'sad':'cheer'):'idle',seed:1.3,face:-1,emoji:opp&&opp.emoji});
 }
}
const EMOTES=['¡Vamos!','😤','👍','¡Allá voy!','😎','GG','🔥','¿Eso es todo?'];
function hitMyTrainer(){ if(!G||!G.players.length||G.phase==='carousel'||!myTrBox) return false; const [x,y]=ptr, [tx,ty,s]=myTrBox; return Math.abs(x-tx)<s*.4&&y<ty+s*.1&&y>ty-s*.95; }

/* ---------- carrusel ---------- */
function carGeo(){ const cx=geo.W/2, cy=geo.pad+geo.bh/2, rr=Math.min(geo.W*.42,geo.bh*.42); return {cx,cy,rr}; }
function optPos(C,i){ const {cx,cy,rr}=carGeo(); const a=i*Math.PI*2/C.opts.length+C.rot; return [cx+Math.cos(a)*rr, cy+Math.sin(a)*rr*.82]; }
function updateCarousel(dt){
 const C=G.carousel; if(!C||C.finished||C.mirror) return;
 C.t+=dt; C.rot+=.32*dt;
 const {cx,cy,rr}=carGeo(), sp=geo.R*4.5;
 C.order.forEach((p,idx)=>{
   const a=C.av[p.id]; if(!a) return;
   if(a.x===null){ a.x=cx+Math.cos(a.ang)*rr*.3; a.y=cy+Math.sin(a.ang)*rr*.25; }
   if(a.done){ const tx=cx+Math.cos(a.ang)*rr*1.12, ty=cy+Math.sin(a.ang)*rr*.95; const dx=tx-a.x,dy=ty-a.y,d=Math.hypot(dx,dy); if(d>1){ const st=Math.min(d,sp*dt); a.x+=dx/d*st; a.y+=dy/d*st; } return; }
   if(C.t<releaseAt(idx)) return;
   if(!a.rel){ a.rel=true; a.relT=C.t; if(p===G.me) toast('¡Te toca! Toca un Pokémon del carrusel para ir a por él'); else if(p.remote) note(p,'¡Te toca en el carrusel! Toca un Pokémon',true); }
   if(a.target!=null&&C.opts[a.target].taken) a.target=null;
   if(a.target==null){ if(isHuman(p)){ if(C.t-a.relT>10) a.target=carouselChoice(p); } else if(C.t-a.relT>a.delay) a.target=carouselChoice(p); }
   if(a.target==null) return;
   const [tx,ty]=optPos(C,a.target); const dx=tx-a.x, dy=ty-a.y, d=Math.hypot(dx,dy);
   if(d<geo.R*.5){ if(takeCarousel(p,a.target)){ a.done=true; a.carry=C.opts[a.target]; a.ang=Math.atan2((a.y-cy)/.82,a.x-cx); renderUI(); } else a.target=null; }
   else { const st=Math.min(d,sp*dt); a.x+=dx/d*st; a.y+=dy/d*st; }
 });
 if(C.order.every(p=>C.av[p.id]&&C.av[p.id].done)||C.opts.every(o=>o.taken)){ if(!C.endT) C.endT=C.t; if(C.t-C.endT>1.3){ C.finished=true; if(NET.mode==='host') netCarousel(); finishCarousel(); } }
}

/* ---------- eventos ---------- */
function bindEvents(){
 document.addEventListener('pointerdown',()=>Music.init());
 cv.addEventListener('pointerdown',e=>{
   if(!G||!G.players||!G.players.length) return; const [x,y]=canvasPos(e);
   const ob=b3On()&&G.me.alive&&orbAt(); if(ob){ doAct({t:'orb',id:ob.id},()=>{ G.me.orbs=G.me.orbs.filter(o=>o.id!==ob.id); }); if(G.anvils&&G.anvils.length){ const q=G.anvils.map(a=>done=>showAnvil(a,done)); G.anvils=[]; runQueue(q,()=>renderUI()); } return; }
   if(hitMyTrainer(x,y)){ trEmote={t0:performance.now(),txt:pick(EMOTES)}; return; }
   if(G.phase==='carousel'&&G.carousel&&G.me.alive){
     const C=G.carousel, a=C.av[G.me.id];
     if(a&&a.rel&&!a.done){ const pk=pickActor(q=>q.opt!=null&&!C.opts[q.opt].taken); let best=pk?pk.opt:-1,bd=geo.R*1.1; if(best<0) C.opts.forEach((o,i)=>{ if(o.taken) return; const [ox,oy]=optPos(C,i); const d=Math.hypot(x-ox,y-oy); if(d<bd){bd=d;best=i;} }); if(best>=0){ a.target=best; doAct({t:'car',i:best}); return; } }
   }
   if(G.phase==='combat'&&hitBench(x,y)<0){ const cu=combatUnitAt(x,y); if(cu){ selCombat=cu; selected=null; renderCard(); return; } }
   if(!inGame()) return;
   const hit=unitAt(x,y);
   if(hit){ drag={...hit,sx:x,sy:y,x,y,moved:false}; cv.setPointerCapture(e.pointerId); cv.style.cursor='grabbing'; }
 });
 cv.addEventListener('pointermove',e=>{
   if(!inGame()) return; const [x,y]=canvasPos(e); hover=unitAt(x,y);
   if(drag){ drag.x=x; drag.y=y; if(Math.hypot(x-drag.sx,y-drag.sy)>6) drag.moved=true;
     const sell=drag.moved&&overShop(e); $('shopPanel').classList.toggle('sell',sell); if(sell) $('sellMsg').textContent=`Vender ${nameOf(DEF[drag.u.defId],drag.u.star)} por ${sellValue(drag.u)} de oro`; }
 });
 cv.addEventListener('pointerleave',()=>{ hover=null; });
 cv.addEventListener('pointerup',e=>{
   if(!drag) return; const me=G.me; const [x,y]=canvasPos(e); const d=drag; drag=null;
   $('shopPanel').classList.remove('sell'); cv.style.cursor='grab';
   if(!d.moved){ selected=d.u; selCombat=null; renderUI(); return; }
   if(overShop(e)){ doAct({t:'sell',loc:d.loc}); if(selected===d.u) selected=null; return; }
   let to=null; const b=hitBench(x,y); if(b>=0) to={i:b}; else if(G.phase!=='combat'&&G.phase!=='carousel'){ const cell=hitCell(x,y); if(cell&&cell[1]>=4) to={b:cell[0]+','+(cell[1]-4)}; }
   if(to) doAct({t:'move',from:d.loc,to},()=>moveTo(me,d.loc,to)); else renderUI();
 });
 $('items').addEventListener('pointerdown',e=>{
   const el=e.target.closest('.item'); if(!el||!inGame()) return; e.preventDefault();
   itemDrag={idx:+el.dataset.i,sx:e.clientX,sy:e.clientY,moved:false,target:-1,t0:0}; $('ghost').innerHTML=itemHTML(G.me.items[itemDrag.idx],48);
   setTimeout(holdTick,30);
 });
 window.addEventListener('pointermove',e=>{
   if(itemDrag){ if(Math.hypot(e.clientX-itemDrag.sx,e.clientY-itemDrag.sy)>5) itemDrag.moved=true;
     const g=$('ghost'); g.style.display=itemDrag.moved?'block':'none'; g.style.left=e.clientX+'px'; g.style.top=e.clientY+'px';
     if(itemDrag.moved){
       // Encima de otro componente del inventario: hay que mantenerlo 1 s (círculo de carga) para combinarlos
       const el=document.elementFromPoint(e.clientX,e.clientY), it=el&&el.closest&&el.closest('#items .item'), j=it?+it.dataset.i:-1, res=j>=0?benchCombo(G.me,itemDrag.idx,j):null;
       document.querySelectorAll('#items .item.target').forEach(x=>{ if(x!==it) x.classList.remove('target'); });
       if((res?j:-1)!==itemDrag.target){ itemDrag.target=res?j:-1; itemDrag.t0=performance.now(); }
       if(res){ it.classList.add('target'); const I=ITEMS[res], t=$('tip'), sl=statLine(I.s); t.classList.remove('shopTip'); tipAnchor=null;
         t.innerHTML=`<div class="combRes">${itemHTML(res,64)}<div><div class="scope">Mantén 1 segundo para crear</div><h4>${esc(I.name)}</h4></div></div>${sl?`<div class="scope">${sl}</div>`:''}<div>${I.desc}</div>`;
         t.style.display='block'; tipOn=true; }
       else hideTip();
     } }
   moveTip(e);
 });
 window.addEventListener('pointerup',e=>{
   if(!itemDrag) return; const d=itemDrag; itemDrag=null; $('ghost').style.display='none'; const me=G.me;
   document.querySelectorAll('#items .item.target').forEach(x=>x.classList.remove('target')); hideTip();
   if(!d.moved||d.target>=0) return; // soltarlo encima de otro objeto antes de tiempo no hace nada
   const b=cv.getBoundingClientRect();
   if(e.clientX>=b.left&&e.clientX<=b.right&&e.clientY>=b.top&&e.clientY<=b.bottom){
     const [x,y]=canvasPos(e); const hit=unitAt(x,y);
     if(hit){ doAct({t:'item',idx:d.idx,loc:hit.loc},()=>useItem(me,d.idx,hit.u,hit.loc)); selected=hit.u; selCombat=null; renderUI(); }
   }
 });
 $('cards').addEventListener('click',e=>{ const el=e.target.closest('.card[data-i]'); if(!el||!inGame()) return; hideTip(); doAct({t:'buy',i:+el.dataset.i}); });
 $('xpBtn').addEventListener('click',()=>{ if(inGame()) doAct({t:'xp'}); });
 $('rerollBtn').addEventListener('click',()=>{ if(inGame()) doAct({t:'reroll'}); });
 $('lockBtn').addEventListener('click',()=>{ if(inGame()) doAct({t:'lock'},()=>{G.me.locked=!G.me.locked;}); });
 $('readyBtn').addEventListener('click',onReady);
 $('speedBtn').addEventListener('click',()=>{ if(NET.mode==='client'){ toast('La velocidad la elige el anfitrión'); return; } G.speed=G.speed===1?2:G.speed===2?4:1; S.speed=G.speed; saveSettings(); renderTop(); });
 $('muteBtn').addEventListener('click',()=>{ Music.init(); S.muted=!S.muted; saveSettings(); Music.setVol(); $('muteBtn').textContent=S.muted?'🔇':'🔊'; });
 $('recBtn').addEventListener('click',showRecipes);
 $('dexBtn').addEventListener('click',()=>showDex(0));
 $('menuBtn').addEventListener('click',confirmQuit);
 $('playBtn').addEventListener('click',()=>{ Music.init(); showDifficulty(); });
 $('mpBtn').addEventListener('click',()=>{ Music.init(); showMP(); });
 $('howBtn').addEventListener('click',showHow);
 $('dexMenuBtn').addEventListener('click',()=>showDex(0));
 $('recMenuBtn').addEventListener('click',showRecipes);
 $('optBtn').addEventListener('click',showOptions);
 bindAuth();
 $('players').addEventListener('click',e=>{ const row=e.target.closest('.pl[data-pid]'); if(row&&G&&G.players.length) spectate(+row.dataset.pid); });
 document.querySelector('.sideTabs').addEventListener('click',e=>{ const b=e.target.closest('[data-tab]'); if(b) setSideTab(b.dataset.tab); });
 document.querySelector('.dmgModes').addEventListener('click',e=>{ const b=e.target.closest('[data-m]'); if(!b) return; dmgMode=b.dataset.m; document.querySelectorAll('.dmgModes [data-m]').forEach(x=>x.setAttribute('aria-pressed',x===b)); renderDmg(); });
 // Pantalla completa (el navegador puede negarse si no viene de un clic)
 $('fsBtn').addEventListener('click',()=>{ const d=document; try{ if(d.fullscreenElement) d.exitFullscreen(); else d.documentElement.requestFullscreen({navigationUI:'hide'}).catch(()=>toast('Tu navegador no permite la pantalla completa')); }catch(e){ toast('Tu navegador no permite la pantalla completa'); } });
 document.addEventListener('fullscreenchange',()=>{ $('fsBtn').textContent=document.fullscreenElement?'🗗':'⛶'; layout(); });
 $('ucard').addEventListener('click',e=>{
   const me=G.me;
   if(e.target.closest('.uc-x')){ selected=null; selCombat=null; renderCard(); return; }
   const rm=e.target.closest('[data-rm]'); if(rm&&selected){ const loc=findLoc(me,selected); if(loc) doAct({t:'rmitem',loc,idx:+rm.dataset.rm},()=>{ removeItem(me,selected,+rm.dataset.rm); }); return; }
   if(e.target.closest('#ucSell')&&selected){ const loc=findLoc(me,selected); if(loc){ doAct({t:'sell',loc}); selected=null; renderCard(); } }
 });
 window.addEventListener('keydown',e=>{
   if(e.key==='Escape'&&(selected||selCombat)&&!modalOpen()){ selected=null; selCombat=null; renderCard(); return; }
   if(!inGame()||modalOpen()||!$('menu').classList.contains('hidden')||!$('auth').classList.contains('hidden')) return;
   if(['INPUT','SELECT'].includes(e.target.tagName)) return;
   const k=e.key.toLowerCase();
   if(k==='d') doAct({t:'reroll'});
   else if(k==='f') doAct({t:'xp'});
   else if(k==='e'&&hover){ doAct({t:'sell',loc:hover.loc}); if(selected===hover.u) selected=null; hover=null; }
   else if(k===' '){ e.preventDefault(); onReady(); }
 });
 document.addEventListener('pointerover',e=>{ const el=e.target.closest&&e.target.closest('[data-tip]'); if(!el||itemDrag){ if(!itemDrag) hideTip(); return; } if(tipAnchor===el) return; showTip(el.dataset.tip,e,el); });
 window.addEventListener('resize',layout);
 // La tienda y la barra superior cambian de alto (cartas, botones que saltan de línea): el tablero se reajusta
 if(window.ResizeObserver){ const ro=new ResizeObserver(()=>layout()); for(const el of [document.querySelector('.top'),$('shopPanel'),document.querySelector('.boardInfo')]) if(el) ro.observe(el); }
 if(window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',readColors);
}
function onReady(){
 if(!G||!G.players.length) return;
 if(G.phase==='planning'&&G.me.alive){ doAct({t:'ready'},()=>{G.me.ready=true;}); if(!G.mp&&!G.mirror) startCombat(); }
 else if(G.phase==='combat'&&((G.combat&&!G.combat.done)||(G.view&&G.view.cb&&!G.view.cb.done))){
   for(const cb of [G.combat,G.view&&G.view.cb]) if(cb&&!cb.done){ cb.visual=false; simulate(cb); cb.fx=[]; }
 }
}

/* ---------- tooltips ---------- */
function unitTip(key){
 const d=DEF[key]; if(!d) return '';
 const forms=[1,2,3].map(s=>{ const u=baseCombatUnit(d,0,s); const ab=abOf(d,s); return `<div class="form"><b>${'★'.repeat(s)} ${nameOf(d,s)}</b> · ${ab[1]} <span class="muted">(${KIND_NAME[ab[0]]})</span><br>${abDesc(ab,abilPower(u),s)}</div>`; }).join('');
 return `<h4>${d.name} <span class="chip" style="color:${COST_HEX[d.cost-1]}">Coste ${d.cost}</span></h4><div class="scope">${d.traits.map(t=>TRAITS[t].icon+' '+t).join(' · ')} · ${ROLE_NAME[d.role]}</div>${forms}`;
}
function tipHTML(spec){
 const i=spec.indexOf(':'), type=spec.slice(0,i), key=spec.slice(i+1);
 if(type==='unit') return unitTip(key);
 if(type==='shop') return shopTip(key);
 if(type==='form'){ const [k,s]=key.split('|'); const d=DEF[k]; if(!d) return ''; const st=+s; const ab=abOf(d,st); return `<h4>${nameOf(d,st)} ${'★'.repeat(st)}</h4><div class="scope">${ab[1]} · ${KIND_NAME[ab[0]]}</div><div>${abDesc(ab,abilPower(baseCombatUnit(d,0,st)),st)}</div>`; }
 if(type==='trait'){
   const Tr=TRAITS[key]; if(!Tr) return '';
   const c=(G&&G.me&&G.players&&G.players.length)?(traitCounts(G.me)[key]||0):0, tier=Tr.bp.filter(b=>c>=b).length;
   const units=UNIT_LIST.filter(u=>u.traits.includes(key));
   const onBoard=new Set(G&&G.me?boardUnits(G.me).map(u=>u.defId):[]);
   return `<h4>${Tr.icon} ${key} <span class="small muted">${c}/${Tr.bp.find(b=>b>c)||Tr.bp[Tr.bp.length-1]}</span></h4><div class="scope">${Tr.scope}</div><div>${Tr.sum}</div>
     <div style="margin-top:6px">${Tr.lv.map((t,j)=>`<div class="tl ${tier>j?'on':''}"><b>(${Tr.bp[j]})</b> ${t}</div>`).join('')}</div>
     <div class="units">Pokémon (${units.length}): ${units.map(u=>onBoard.has(u.key)?`<b>${u.name}</b>`:u.name).join(', ')}</div>`;
 }
 if(type==='item'){
   const I=ITEMS[key]; if(!I) return '';
   let h=`<h4>${itemHTML(key,30)} ${I.name}</h4>`; const sl=statLine(I.s); if(sl) h+=`<div class="scope">${sl}</div>`; h+=`<div>${I.desc}</div>`;
   if(I.from) h+=`<div class="units">Receta: ${ITEMS[I.from[0]].name} + ${ITEMS[I.from[1]].name}</div>`;
   if(I.comp) h+=`<div class="units">Combina con: ${ORDER.map(o=>{ const r=ITEMS[combineKey(key,o)]; return `${ITEMS[o].name} → <b>${r.name}</b>`; }).join('<br>')}</div>`;
   return h;
 }
 if(type==='aug'){ const a=AUG_BY[key]; return a?`<h4>${a.icon} ${a.name}</h4><div class="scope">${TIER_NAME[a.tier]}</div><div>${a.desc}</div>`:''; }
 return '';
}
let tipOn=false;
// Las fichas de las cartas de la tienda se anclan encima de la carta; el resto sigue al puntero
let tipAnchor=null;
function showTip(spec,e,el){ const h=tipHTML(spec); if(!h){ hideTip(); return; } const t=$('tip'); t.innerHTML=h; t.style.display='block'; tipOn=true;
 t.classList.toggle('shopTip',spec.startsWith('shop:')); tipAnchor=spec.startsWith('shop:')&&el?el:null;
 if(tipAnchor){ const r=el.getBoundingClientRect(), w=t.offsetWidth, hh=t.offsetHeight; t.style.setProperty('--cc',getComputedStyle(el).getPropertyValue('--cc')); t.style.left=clamp(r.left+r.width/2-w/2,8,innerWidth-w-8)+'px'; t.style.top=Math.max(8,r.top-hh-10)+'px'; }
 else moveTip(e); }
function moveTip(e){ if(!tipOn||tipAnchor) return; const t=$('tip'); const w=t.offsetWidth, h=t.offsetHeight; let x=e.clientX+16, y=e.clientY+16; if(x+w>innerWidth-8) x=e.clientX-w-16; if(y+h>innerHeight-8) y=Math.max(8,innerHeight-h-8); t.style.left=Math.max(8,x)+'px'; t.style.top=y+'px'; }
function hideTip(){ if(!tipOn) return; tipOn=false; tipAnchor=null; $('tip').style.display='none'; }

/* ---------- tablero 3D + capa 2D ---------- */
// El tablero, los Pokémon y los efectos los pinta board3d.js (three.js). Aquí se le dice qué hay
// en pantalla y encima se dibuja la capa 2D: barras, estrellas, objetos, textos y entrenadores.
let ptr=[0,0], hudActors=[], myTrBox=null;
const b3On=()=>!HEADLESS&&window.B3&&B3.ready;
function b3Geo(){ const cells=[]; for(let r=0;r<8;r++) for(let c=0;c<7;c++) cells.push(cellXY(c,r)); return {...geo,cells,bench:[...Array(BENCH)].map((_,i)=>benchXY(i))}; }
function sizeB3(){ if(!window.B3||!geo.W) return; if(!B3.ready) B3.init($('gl')); B3.resize(b3Geo(),window.devicePixelRatio||1,view); }
// De píxeles de tablero (suelo) a pantalla; h en radios de casilla
const scr=(x,y,h=0)=>b3On()?B3.project(x,y,h/1):[x,y];
function bgKind(){ if(G.phase==='carousel') return 'plaza'; if(G.round&&G.round.type==='pve'&&['planning','combat'].includes(G.phase)) return 'route'; return 'stadium'; }
const STAR_SCALE=[1,1.13,1.27];
const unitScale=(d,star,o={})=>STAR_SCALE[star-1]*(d.traits&&d.traits.includes('Legendario')?1.15:1)*(o.boss?1.35:1);
// Pokémon bajo el puntero (en pantalla, porque los modelos están de pie)
function pickActor(test){
 const [px,py]=ptr; let best=null,bd=1e9;
 for(const a of hudActors){ if(!a.base||!test(a)) continue; const [bx,by]=a.base, ay=a.anchor[1], w=Math.max(geo.R*.55,(by-ay)*.42);
   if(px<bx-w||px>bx+w||py<ay-6||py>by+geo.R*.35) continue; const d=Math.abs(px-bx)+Math.abs(py-(ay+by)/2)*.5; if(d<bd){bd=d;best=a;} }
 return best;
}
function drawItemBadge(k,x,y,sz){
 const I=ITEMS[k]; if(!I) return;
 ctx.save(); const col=itemColor(I);
 ctx.fillStyle='rgba(8,12,30,.85)'; rrPath(ctx,x-sz/2,y-sz/2,sz,sz,sz*.25); ctx.fill(); ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.stroke();
 const e=getItemImg(k);
 if(e.status==='ok'){ ctx.imageSmoothingEnabled=false; ctx.drawImage(e.img,x-sz*.42,y-sz*.42,sz*.84,sz*.84); }
 else { ctx.font=`${sz*.62}px system-ui`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(I.icon,x,y+1); }
 ctx.restore();
}
// Barras al estilo TFT encima de la cabeza: vida con marcas cada 300 PS y maná debajo (brilla cuando va a lanzar)
function drawHud(a){
 if(!a.anchor||a.dead) return;
 const R=geo.R, o=a.hud, [bx0,by0]=a.base; let [hx,hy]=a.anchor;
 ctx.save();
 if(o.hp!==undefined){
   const w=R*1.45, bx=Math.round(hx-w/2), hh=Math.max(5,R*.17), mh=Math.max(3,R*.1), hasM=o.maxMana<9999, by=Math.round(hy-hh-(hasM?mh+1:0)-6);
   ctx.fillStyle='rgba(10,12,24,.85)'; ctx.fillRect(bx-1.5,by-1.5,w+3,hh+(hasM?mh+1:0)+3);
   ctx.fillStyle=o.mine?'#3fd27a':'#ff5a5f'; ctx.fillRect(bx,by,w*clamp(o.hp/o.maxHp,0,1),hh);
   ctx.fillStyle='rgba(255,255,255,.25)'; ctx.fillRect(bx,by,w*clamp(o.hp/o.maxHp,0,1),hh*.35);
   if(o.shield>0){ ctx.fillStyle='rgba(240,240,240,.9)'; ctx.fillRect(bx,by,w*clamp(o.shield/o.maxHp,0,1),hh*.45); }
   ctx.fillStyle='rgba(10,12,24,.7)'; for(let k=300;k<o.maxHp;k+=300){ const tx=bx+w*k/o.maxHp; ctx.fillRect(tx,by,1,k%1500?hh*.55:hh); }
   if(hasM){ const full=o.mana>=o.maxMana*.9; ctx.fillStyle='#1b2a48'; ctx.fillRect(bx,by+hh+1,w,mh); ctx.fillStyle=full?`hsl(205,100%,${70+15*Math.sin(performance.now()/90)}%)`:'#4aa3ff'; ctx.fillRect(bx,by+hh+1,w*clamp(o.mana/o.maxMana,0,1),mh); }
   hy=by;
 }
 if(!o.creep&&o.star){
   ctx.font=`900 ${Math.max(9,R*.32)}px Nunito,system-ui,sans-serif`; ctx.textAlign='center'; ctx.textBaseline='bottom';
   ctx.fillStyle=o.star===3?'#ffcf33':o.star===2?'#d6dde8':'#cd8f52'; ctx.strokeStyle='rgba(0,0,0,.6)'; ctx.lineWidth=3;
   const st='★'.repeat(o.star); ctx.strokeText(st,hx,hy-2); ctx.fillText(st,hx,hy-2);
 }
 if(o.items&&o.items.length){ const sz=Math.max(12,R*.42); o.items.forEach((it,i)=>drawItemBadge(it,bx0+(i-(o.items.length-1)/2)*sz*1.1,by0+R*.35,sz)); }
 ctx.restore();
}
// Posición en pantalla y tamaño de un entrenador colocado en (x,y) del tablero con altura s (px de tablero)
function trScreen(x,y,s){ const [sx,sy]=scr(x,y,0), [,ty]=scr(x,y,s*1.35/geo.R); return [sx,sy,Math.max(10,sy-ty)]; }
// Qué se ve en cada momento: lista de Pokémon para board3d.js
// Orbes en tu mitad del tablero, en casillas fijas según su número
function orbList(){
 if(!G.me.orbs||!G.me.orbs.length||G.phase==='combat'||G.phase==='carousel'||(G.view&&G.view.board)) return [];
 return G.me.orbs.map((o,i)=>{ const [x,y]=cellXY([1,5,3,0,6,2,4][i%7],4+(i*3)%4); return {id:o.id,tier:o.tier,x,y}; });
}
function orbAt(){ const [px,py]=ptr; let best=null,bd=geo.R*.95; for(const o of orbList()){ const [sx,sy]=B3.project(o.x,o.y,.7); const d=Math.hypot(px-sx,py-sy); if(d<bd){ bd=d; best=o; } } return best; }
function sceneActors(){
 const A=[], me=G.me, inCombat=G.phase==='combat'&&viewCombat(), inCar=G.phase==='carousel'&&G.carousel;
 if(inCombat){
   const cb=viewCombat(), mySide=curFlip()?1:0;
   for(const u of cb.units){
     const [x,y]=unitXY(u), t=u.target&&!u.target.dead?unitXY(u.target):null, mine=u.side===mySide;
     A.push({key:u,cu:u,dex:u.creep?u.d.dex:dexOf(u.d,u.star),x,y,tx:t&&u.mt>=.3?t[0]:null,ty:t?t[1]:null,face:mine?Math.PI:0,atk:u.atkN,cast:u.castN||0,dead:u.dead,stun:u.stun,sleep:u.sleepT,shield:u.shield,flash:u.flash,glow:u.glow,glowColor:typeColor(u.d),
       alpha:u.stealth>0?.35:1,scale:unitScale(u.d,u.star,{boss:u.maxMana===120&&u.creep}),ring:u.creep?'#8a8a8a':mine?'#3fd27a':'#ff5a5f',sel:u===selCombat,
       hud:{hp:u.hp,maxHp:u.maxHp,mana:u.mana,maxMana:u.maxMana,shield:u.shield,mine,items:u.items,creep:u.creep,star:u.star}});
   }
 } else if(inCar){
   const C=G.carousel; C.opts.forEach((o,i)=>{ if(o.taken) return; const [x,y]=optPos(C,i); A.push({key:o,opt:i,dex:dexOf(DEF[o.key],1),x,y,face:0,ring:COST_HEX[DEF[o.key].cost-1],scale:1,hud:{items:[o.item]}}); });
 } else {
   const who=viewedPlayer(), mine=who===me;
   for(const k in who.board){ const u=who.board[k]; if(drag&&drag.moved&&drag.u===u) continue; const [c,r]=k.split(',').map(Number); const [x,y]=cellXY(c,4+r), st=mine?planStats(u):null, d=DEF[u.defId];
     A.push({key:u,u,loc:{b:k},star:u.star,dex:dexOf(d,u.star),x,y,face:Math.PI,ring:COST_HEX[d.cost-1],sel:selected===u,scale:unitScale(d,u.star),hud:st?{items:u.items,hp:st.maxHp,maxHp:st.maxHp,mana:st.mana,maxMana:st.maxMana,mine:true,star:u.star}:{items:u.items,star:u.star}}); }
   if(G.preview&&G.phase==='planning') for(const cr of G.preview){ const [gc,gr]=toGrid(1,cr.c,cr.r); const [x,y]=cellXY(gc,gr); A.push({key:cr,dex:cr.dex,x,y,face:0,ring:'#8a8a8a',alpha:.85,scale:1,hud:{creep:true}}); }
 }
 const benchOf=inCombat||inCar?me:viewedPlayer();
 benchOf.bench.forEach((u,i)=>{ if(!u||(drag&&drag.moved&&drag.u===u)) return; const [x,y]=benchXY(i), d=DEF[u.defId]; A.push({key:u,u,loc:{i},star:u.star,dex:dexOf(d,u.star),x,y,face:Math.PI,ring:COST_HEX[d.cost-1],sel:selected===u,scale:unitScale(d,u.star)*.9,hud:{items:u.items,star:u.star}}); });
 if(drag&&drag.moved){ const d=DEF[drag.u.defId]; A.push({key:drag.u,dex:dexOf(d,drag.u.star),x:drag.x,y:drag.y,face:Math.PI,drag:true,alpha:.9,ring:'#ffffff',scale:unitScale(d,drag.u.star),hud:{star:drag.u.star}}); }
 return A;
}
function draw(){
 if(!G||!geo.W) return;
 ctx.clearRect(0,0,view.W,view.H);
 const me=G.me; if(!me) return;
 if(!b3On()){ ctx.save(); ctx.fillStyle='#16203d'; ctx.fillRect(0,0,view.W,view.H); ctx.fillStyle='#fff'; ctx.font=`900 ${Math.max(14,geo.R*.5)}px Nunito,system-ui,sans-serif`; ctx.textAlign='center'; ctx.fillText('Cargando tablero 3D…',view.W/2,view.H/2); ctx.restore(); return; }
 const inCombat=G.phase==='combat'&&viewCombat(), inCar=G.phase==='carousel'&&G.carousel, playing=G.players&&G.players.length;
 const dragBoard=drag&&drag.moved&&G.phase!=='combat'&&!inCar, cell=dragBoard?hitCell(drag.x,drag.y):null, bh=drag&&drag.moved?hitBench(drag.x,drag.y):-1;
 // Con el menú o el login delante (pantalla completa) no se ve el tablero: no se pinta, y el móvil lo agradece
 if(!$('menu').classList.contains('hidden')||!$('auth').classList.contains('hidden')) return;
 const A=playing?sceneActors():[];
 B3.render({arena:playing?bgKind():'stadium',actors:A,orbs:playing?orbList():[],fx:inCombat?viewCombat().fx:[],cellPx:vXY,unitPx:unitXY,cells:{drop:dragBoard,hover:cell&&cell[1]>=4?cell[1]*7+cell[0]:-1},benchHover:bh});
 hudActors=A;
 if(!playing) return;
 if(inCar) drawCarouselHud(); else drawBoardTrainers();
 // De atrás adelante: si las barras se solapan, la del Pokémon más cercano queda encima
 for(const a of A.filter(a=>a.base).sort((p,q)=>p.base[1]-q.base[1])) drawHud(a);
 if(inCombat) drawFxHud(viewCombat());
}
// Textos flotantes, carteles de habilidad y destellos (lo demás lo pinta el 3D)
function drawFxHud(cb){
 const R=geo.R;
 for(const f of cb.fx){
   const p=f.t/f.life; ctx.save();
   switch(f.type){
    case 'text': { const [x0,y0]=vXY(f.c,f.r), [x,y]=scr(x0,y0,1.9); ctx.globalAlpha=1-p; ctx.font=`900 ${Math.max(10,R*.36)}px Nunito,system-ui,sans-serif`; ctx.textAlign='center'; ctx.lineWidth=3; ctx.strokeStyle='rgba(0,0,0,.7)'; ctx.fillStyle=f.color; const yy=y-p*R*.9; ctx.strokeText(f.txt,x+f.dx,yy); ctx.fillText(f.txt,x+f.dx,yy); break; }
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
 if(meAv&&meAv.target!=null&&!meAv.done&&C.opts[meAv.target]&&!C.opts[meAv.target].taken){ const [ox,oy]=optPos(C,meAv.target), [x,y]=scr(ox,oy,0), [,y2]=scr(ox,oy+R*.9,0); ctx.save(); ctx.strokeStyle='#ffd75e'; ctx.lineWidth=3; ctx.setLineDash([6,5]); ctx.lineDashOffset=-performance.now()/40; ctx.beginPath(); ctx.ellipse(x,y,R*.95,Math.max(4,y2-y),0,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
 const now=performance.now();
 // Los entrenadores corren hacia el Pokémon que eligen (de atrás adelante para que se solapen bien)
 const list=C.order.map(p=>{ const a=C.av[p.id]; if(!a||a.x===null) return null;
   let x=a.x, y=a.y; if(C.mirror&&a.px!=null){ const k=clamp((now-a.at)/170,0,1); x=a.px+(a.x-a.px)*k; y=a.py+(a.y-a.py)*k; }
   if(!C.mirror){ if(a.lx!=null&&Math.abs(x-a.lx)>.3) a.face=x<a.lx?-1:1; a.moving=a.lx!=null&&Math.hypot(x-a.lx,y-a.ly)>.2; a.lx=x; a.ly=y; }
   else a.moving=a.px!=null&&Math.hypot(a.x-a.px,a.y-a.py)>.5;
   return {p,a,x,y}; }).filter(Boolean).sort((u,v)=>u.y-v.y);
 for(const {p,a,x,y} of list){
   const locked=!a.rel&&!a.done, mine=p===G.me;
   const [sx,sy,ss]=drawTrainer(x,y+R*.35,trainerOf(p),{s:R*1.7,ring:mine?'#4c8dff':a.rel&&!a.done?'#3fd27a':'#8a93ad',face:a.face||1,mode:a.moving?'run':a.done?'cheer':'idle',seed:p.id*.7,dim:locked,label:(p.name.length>10?p.name.slice(0,9)+'…':p.name)+(locked?' 🔒':''),emoji:p.emoji});
   if(a.carry&&DEF[a.carry.key]){ const e=getImg(dexOf(DEF[a.carry.key],1)); const s=ss*.65; if(e.status==='ok'){ ctx.imageSmoothingEnabled=false; ctx.drawImage(e.img,sx+ss*.1,sy-ss*.95-s*.5,s,s); } }
 }
 const myIdx=C.order.indexOf(G.me), myAv=C.av[G.me.id];
 const msg=!myAv?'Mirando el carrusel':myAv.done?'Ya tienes tu Pokémon. Esperando al resto…':myAv.rel?'¡Te toca! Toca un Pokémon':`Sales en ${Math.max(0,Math.ceil(releaseAt(myIdx)-C.t))}s · menos vida = eliges antes`;
 ctx.save(); ctx.font=`900 ${Math.max(12,R*.42)}px Nunito,system-ui,sans-serif`; ctx.textAlign='center'; ctx.textBaseline='top'; ctx.lineWidth=4; ctx.strokeStyle='rgba(0,0,0,.45)'; ctx.fillStyle='#fff'; const mx=view.rect?view.rect.x+view.rect.w/2:view.W/2, my=view.rect?view.rect.y+8:8; ctx.strokeText(msg,mx,my); ctx.fillText(msg,mx,my); ctx.restore();
}
function renderFeed(){
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
     if(G.phase==='planning'){ if(isFinite(G.timer)&&(G.mp||!modalOpen())){ G.timer-=dt; if(G.timer<=0) startCombat(); } if(G.mp&&G.phase==='planning'&&humansReady()) startCombat(); }
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
 if(cb&&!cb.done){ if(isHost&&document.hidden) simulate(cb); else { G.acc+=dt*G.speed; let n=0; while(G.acc>=DT&&n++<200){ stepCombat(cb); G.acc-=DT; if(cb.done) break; } } }
 if(cb){ for(const f of cb.fx) f.t+=dt*Math.min(G.speed,2); cb.fx=cb.fx.filter(f=>f.t<f.life); }
 // El combate que estás mirando avanza al mismo ritmo que el tuyo
 const v=G.view&&G.view.cb?G.view:null;
 if(v){ if(!v.cb.done){ v.acc+=dt*G.speed; let n=0; while(v.acc>=DT&&n++<200){ stepCombat(v.cb); v.acc-=DT; if(v.cb.done) break; } }
   for(const f of v.cb.fx) f.t+=dt*Math.min(G.speed,2); v.cb.fx=v.cb.fx.filter(f=>f.t<f.life); }
 if(isHost&&!G.resolving&&(!cb||cb.done)&&(!v||v.cb.done)&&Date.now()>=(G.resolveNotBefore||0)){ G.resolving=true; later(resolveRound,cb?900:300); }
}
function frame(){
 if(G) draw();
 try{ Scene.frame(performance.now()); }catch(e){ /* la escena del menú nunca debe parar el bucle del juego */ }
 if(G&&G.players&&G.players.length){ renderFeed();
   // El registro de daño sigue al combate que se ve; al acabar se queda con el último hasta que empieza el siguiente
   const vc=G.phase==='combat'&&viewCombat(); if(vc&&vc!==statsCb){ statsCb=vc; statsSide=curFlip()?1:0; renderDmg(); }
   if(vc&&performance.now()-lastDmgT>400){ lastDmgT=performance.now(); renderDmg(); }
   if(selCombat&&performance.now()-lastCardT>250){ lastCardT=performance.now(); renderCard(); } }
 Music.play(wantedSong());
 requestAnimationFrame(frame);
}

/* ---------- paneles ---------- */
// Vida y maná de cada Pokémon del tablero tal y como empezarían el combate (se recalcula al cambiar algo)
let statsCache={v:-1,m:new Map(),tt:null};
function planStats(u){
 if(statsCache.v!==G.uiV) statsCache={v:G.uiV,m:new Map(),tt:traitTiers(G.me)};
 let s=statsCache.m.get(u.uid);
 if(!s){ try{ const cu=makeCombatUnit(u,G.me,statsCache.tt,0); s={maxHp:cu.maxHp,mana:cu.mana,maxMana:cu.maxMana}; }catch(e){ s={maxHp:1,mana:0,maxMana:99999}; } statsCache.m.set(u.uid,s); }
 return s;
}
function renderUI(){ if(HEADLESS||!G||G.auto||!G.players||!G.players.length) return; G.uiV=(G.uiV||0)+1; renderTop(); renderShop(); renderTraits(); renderPlayers(); renderItems(); renderCard(); renderLog(); layout(); }
function updatePhase(){
 let t='';
 switch(G.phase){
  case 'planning': t=(isFinite(G.timer)?`Planificación · ${Math.max(0,Math.ceil(G.timer))}s`:'Planificación')+(G.mp?` · listos ${G.players.filter(p=>!p.isBot&&p.alive&&p.ready).length}/${G.players.filter(p=>!p.isBot&&p.alive).length}`:''); break;
  case 'combat': t=G.myOpp?`Combate contra ${G.myOpp}`:'Combates en curso'; break;
  case 'carousel': t='Carrusel'; break; case 'augment': t='Elige un aumento'; break;
  case 'results': t='Resultados'; break; case 'over': t='Fin de la partida'; break; default: t='Esperando al anfitrión…';
 }
 if(!G.me.alive&&G.phase!=='over') t+=' · espectador';
 if(t!==lastPhaseTxt){ $('phase').textContent=t; lastPhaseTxt=t; const rb=$('readyBtn'); const waiting=G.phase==='planning'&&G.me.ready&&G.mp; rb.textContent=G.phase==='combat'?'Saltar combate':waiting?'Esperando…':'¡Listo!'; rb.disabled=!['planning','combat'].includes(G.phase)||waiting||(!G.me.alive&&G.phase==='planning'); }
}
function renderTop(){
 const R=G.round; if(!R) return;
 $('stage').textContent=`Ronda ${R.s}-${R.n}`;
 $('pills').innerHTML=ROUNDS.filter(x=>x.s===R.s).map(x=>`<span class="pill ${x===R?'cur':''} ${x.n<R.n?'past':''}" title="${x.type==='pve'?'PvE':x.type==='carousel'?'Carrusel':'PvP'}${x.aug>=0?' + aumento '+TIER_NAME[G.augTiers[x.aug]]:''}">${x.type==='pve'?'🐾':x.type==='carousel'?'🎠':'⚔️'}${x.aug>=0?'✨':''}</span>`).join('');
 $('speedBtn').textContent=`x${G.speed}`; lastPhaseTxt=''; updatePhase(); updateNetTag();
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
 'Tirador':'M11 1.5h2v4h-2zm0 17h2v4h-2zM1.5 11h4v2h-4zm17 0h4v2h-4zM12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zm0 3a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
 'Hechicero':'M13.6 2C10 4.6 6.8 10.6 6 17h12c-.6-3.4-1.6-6.2-1-9.2-1 .8-2.2.8-3.2-.2 1.2-1.8 1.2-3.6-.2-5.6zM2.5 18h19v3.5h-19z',
 'Asesino':'M12 1.5l3 10.5h-2v4h3.5v2H13v4.5h-2V18H7.5v-2H11v-4H9z',
 'Sanador':'M12 21.3 3.6 12.9A5.2 5.2 0 0 1 12 6a5.2 5.2 0 0 1 8.4 6.9zM11 9.5v2.5H8.5v2H11v2.5h2V14h2.5v-2H13V9.5z',
 'Fortuna':'M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zm0 4 4.5 5.5L12 17.5 7.5 12z',
 'Legendario':'M3 17.5 2 6.5l5.5 4.5L12 3.5l4.5 7.5L22 6.5l-1 11zM3 19h18v2.5H3z',
};
const traitIcon=t=>TRAIT_SVG[t]?`<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${TRAIT_SVG[t]}"/></svg>`:(TRAITS[t]?TRAITS[t].icon:'');
// Tipo elemental de un Pokémon: pinta el fondo de su carta
const ELEMS=['Fuego','Agua','Planta','Eléctrico','Psíquico','Roca','Dragón','Fantasma','Hada','Normal','Acero','Siniestro','Lucha'];
const elemOf=d=>(d&&d.traits||[]).find(t=>ELEMS.includes(t))||'Normal';
// Retrato 3D (la cara del modelo); mientras se genera, el sprite 2D. Cuando llega, se cambia en todas las imágenes de ese Pokémon
function portraitImg(dex){
 const url=window.B3&&B3.portrait?B3.portrait(dex,u=>{ if(u) document.querySelectorAll(`img[data-pdex="${dex}"]`).forEach(im=>{ im.src=u; im.classList.remove('px'); }); }):null;
 return url?`<img src="${url}" alt="">`:`<img src="${SPRITE(dex)}" alt="" class="px" data-pdex="${dex}">`;
}
function renderShop(){
 const me=G.me;
 $('lvl').textContent=me.level;
 $('xpTxt').textContent=me.level>=10?'Máx.':`${me.xp}/${XP_NEED[me.level]}`;
 $('xpbar').style.width=me.level>=10?'100%':(me.xp/XP_NEED[me.level]*100)+'%';
 $('gold').textContent=me.gold;
 $('odds').innerHTML=SHOP_ODDS[me.level].map((o,i)=>`<span style="color:${COST_HEX[i]}" title="Coste ${i+1}">${o}%</span>`).join('');
 $('xpBtn').disabled=me.gold<4||me.level>=10||!me.alive;
 $('rerollBtn').innerHTML=me.freeRerolls>0?`<b>🔄 Gratis</b><span>quedan ${me.freeRerolls}</span>`:'<b>🔄 Tienda</b><span>2 de oro</span>';
 $('rerollBtn').disabled=(me.freeRerolls<=0&&me.gold<2)||!me.alive;
 $('lockBtn').textContent=me.locked?'🔒':'🔓'; $('lockBtn').setAttribute('aria-pressed',me.locked);
 const owned={}; for(const u of allUnits(me)) if(u.star===1) owned[u.baseId]=(owned[u.baseId]||0)+1;
 // Solo se rehacen las cartas si cambia algo (así no parpadean los retratos)
 const key=me.shop.map((k,i)=>k?k+(canBuy(me,i)&&me.alive?'+':'-')+(owned[k]||0):'_').join();
 if(key!==renderShop.key){ renderShop.key=key;
   $('cards').innerHTML=me.shop.map((k,i)=>{
     if(!k||!DEF[k]) return `<div class="card empty"></div>`;
     const d=DEF[k], can=canBuy(me,i)&&me.alive;
     return `<button class="card c${d.cost} ${can?'':'off'} ${owned[k]?'owned':''}" data-i="${i}" data-tip="shop:${k}" aria-label="Comprar ${d.name} por ${d.cost}">
       <span class="art bg-${elemOf(d)}"><i class="fx"></i></span><span class="pic">${portraitImg(dexOf(d,1))}</span>
       ${owned[k]?`<span class="own">${owned[k]}/3</span>`:''}
       <span class="cn">${d.name}</span>
       <span class="tr">${d.traits.map(t=>`<span title="${t}"><i>${traitIcon(t)}</i>${t}</span>`).join('')}</span>
       <span class="cc">${d.cost}</span></button>`;
   }).join('');
 }
 const inc=income(me,G.roundIdx+1);
 $('incomeInfo').textContent=`Próximo ingreso: +${inc.total} (base ${inc.base} · interés ${inc.interest} · racha ${inc.streak}${inc.bonus?' · extra '+inc.bonus:''})`;
 $('boardCount').textContent=`Tablero ${boardUnits(me).length}/${maxBoard(me)}`;
 $('streakInfo').textContent=me.streak>=2?`🔥 Racha de ${me.streak} victorias`:me.streak<=-2?`🧊 Racha de ${-me.streak} derrotas`:'';
}
// Ficha de habilidad que se ve al pasar por una carta de la tienda (antes de comprarla)
function shopTip(key){
 const d=DEF[key]; if(!d) return ''; const u=baseCombatUnit(d,0,1), ab=abOf(d,1), el=elemOf(d), ic=elIcon(ab[2].el||el)||TRAITS[el].icon;
 return `<div class="stHead" style="--tc:${TRAITS[el].color}"><span class="stIco">${ic}</span><div><div class="stName">${esc(ab[1])}</div><div class="stMana">💧 ${R0(u.mana)}/${u.maxMana>=9999?'—':u.maxMana} de maná · ${KIND_NAME[ab[0]]}</div></div></div>
  <div class="stBody"><p>${abDesc(ab,abilPower(u),1)}</p><div class="stMeta">${esc(d.name)} · ${ROLE_NAME[d.role]} · ❤️ ${R0(u.maxHp)} · ⚔️ ${R0(u.ad)} · 🎯 ${u.range}</div></div>`;
}
// Nivel de una sinergia: 1 bronce, 2 plata, 3 oro y el máximo prismático (si tiene 3 niveles o más)
function traitClass(Tr,tier){ if(!tier) return 'off'; const n=Tr.bp.length; if(tier>=n) return n>=3?'t4':'t3'; return 't'+tier; }
function renderTraits(){
 const c=traitCounts(viewedPlayer()); // las del tablero que se está mirando
 const rows=Object.entries(c).map(([t,n])=>({t,n,tier:TRAITS[t].bp.filter(b=>n>=b).length})).sort((a,b)=>b.tier-a.tier||(b.tier?b.n-a.n:b.n/TRAITS[b.t].bp[0]-a.n/TRAITS[a.t].bp[0]));
 $('traits').innerHTML=rows.length?rows.map(r=>{ const Tr=TRAITS[r.t], next=Tr.bp.find(b=>b>r.n)||Tr.bp[Tr.bp.length-1];
   return r.tier?`<div class="trait ${traitClass(Tr,r.tier)}" data-tip="trait:${r.t}" tabindex="0"><span class="ti">${traitIcon(r.t)}</span><span class="tc">${r.n}</span><span class="tn">${r.t}<div class="tb">${Tr.bp.map(b=>r.n>=b?`<b>${b}</b>`:b).join(' › ')}</div></span></div>`
     :`<div class="trait off" data-tip="trait:${r.t}" tabindex="0"><span class="ti">${traitIcon(r.t)}</span><span class="tc"></span><span class="tn">${r.t}<div class="tb">${r.n} / ${next}</div></span></div>`;
 }).join(''):'<p class="muted small">Coloca Pokémon en el tablero para activar sinergias. Pasa el cursor por una sinergia para ver qué le da a tu equipo.</p>';
 $('augWrap').innerHTML=G.me.augments.length?`<h2 style="margin-top:12px">Aumentos</h2><div class="augs">${G.me.augments.map(id=>{const a=AUG_BY[id];return a?`<span class="aug tier${a.tier}" data-tip="aug:${a.id}">${a.icon}</span>`:'';}).join('')}</div>`:'';
}
// Avisos de subida de estrellas: se ven unos segundos junto al nombre
const UPS={}, UP_MS=12000;
function upBadge(p){
 const u=p.lastUp; if(!u||p===G.me) return ''; const [dex,star,seq]=u, now=performance.now();
 let r=UPS[p.id]; if(!r||r.seq!==seq){ r=UPS[p.id]={seq,t:now}; setTimeout(()=>{ if(G&&G.players) renderPlayers(); },UP_MS+50); }
 return now-r.t<UP_MS?`<span class="upb s${star}" title="Subió un Pokémon a ${star} estrellas"><img src="${SPRITE(dex)}" alt=""><b>${'★'.repeat(star)}</b></span>`:'';
}
function renderPlayers(){
 const list=G.players.slice().sort((a,b)=>(b.alive-a.alive)||b.hp-a.hp||(a.place-b.place));
 const combat=G.phase==='combat', oppName=combat?G.myOpp.replace(' (fantasma)',''):'';
 // Fuera del combate: marca con ⚔️ contra quién puedes tocar en la próxima ronda PvP
 const po=!combat&&G.me.alive?new Set(G.mirror?(G.me.po||[]):possibleOpps(G.me).map(p=>p.id)):new Set();
 const watching=G.view?G.view.pid:-1;
 $('players').innerHTML=list.map(p=>`<div class="pl ${p===G.me?'me':''} ${p.name===oppName&&!G.view?'opp':''} ${p.id===watching?'watch':''} ${p.alive?'':'dead'} ${p.alive||p===G.me?'click':''}" data-pid="${p.id}" title="${esc(p.name)} · Nivel ${p.level}${p!==G.me?' · Toca para ver '+(combat?'su combate':'su tablero'):''}">
   ${upBadge(p)}<span class="nm">${po.has(p.id)?'<span class="poTag" title="Posible rival: aún no te has enfrentado a él en este ciclo">⚔️</span>':''}${p.id===watching?'<span class="poTag" title="Lo estás mirando">👁</span>':''}${esc(p.name)}${p.remote||(G.mirror&&!p.isBot&&p!==G.me)?' 🌐':''}${p.streak>=2?' 🔥':p.streak<=-2?' 🧊':''}${G.mp&&G.phase==='planning'&&!p.isBot&&p.ready?' ✔':''}</span>
   <span class="hp">${p.alive?Math.max(0,R0(p.hp)):'#'+p.place}</span><span class="ring" style="--p:${clamp(p.hp,0,100)}">${p.alive?headHTML(p):'<span class="head em">💀</span>'}<span class="lv">${p.level}</span></span></div>`).join('');
 $('plHint').textContent=combat?'Toca un entrenador para ver su combate':'Toca un entrenador para ver su tablero'+(po.size?' · ⚔️ = posible rival':'');
 const vi=$('viewInfo');
 if(G.view){ const p=G.players.find(x=>x.id===G.view.pid), o=G.view.opp; vi.hidden=false;
   vi.innerHTML=G.view.board?`👁 Tablero de <b>${esc(p?p.name:'?')}</b> <button class="btn sm" id="viewBack">Volver al mío</button>`:`👁 Viendo: <b>${esc(p?p.name:'?')}</b> vs <b>${G.view.pve?'Salvajes':esc(o?o.name:'?')}</b> <button class="btn sm" id="viewBack">Volver a mi combate</button>`;
   $('viewBack').onclick=()=>spectate(G.me.id); }
 else vi.hidden=true;
}
// Banca de objetos: en escritorio, casillas fijas (las vacías punteadas) a la izquierda del tablero
function renderItems(){
 const me=G.me, slots=window.matchMedia&&matchMedia('(min-width:1101px)').matches;
 const key=me.items.join()+'|'+slots;
 if(key===renderItems.last&&$('items').childElementCount) return; renderItems.last=key;
 const it=me.items.map((k,i)=>`<div class="item" data-i="${i}" data-tip="item:${k}" tabindex="0">${itemHTML(k)}</div>`).join('');
 $('items').innerHTML=slots?it+'<span class="islot"></span>'.repeat(Math.max(0,MAX_ITEMS_BENCH-me.items.length)):(it||'<span class="muted small">Sin objetos. Arrastra los que consigas sobre un Pokémon.</span>');
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
// Combinación en la banca: el círculo se llena en 1 s y entonces se crea el objeto
function holdTick(){
 const d=itemDrag; if(!d) return;
 const el=d.target>=0&&document.querySelector(`#items .item[data-i="${d.target}"]`);
 if(el){ const p=Math.min(1,(performance.now()-d.t0)/1000); el.style.setProperty('--p',p);
   if(p>=1){ const me=G.me; itemDrag=null; $('ghost').style.display='none'; el.classList.remove('target'); hideTip(); doAct({t:'icomb',a:d.idx,b:d.target},()=>combineBench(me,d.idx,d.target)); return; } }
 setTimeout(holdTick,30);
}
function setSideTab(t){ sideTab=t; document.querySelectorAll('.sideTabs [data-tab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t)); $('tabPl').hidden=t!=='pl'; $('tabDmg').hidden=t!=='dmg'; $('tabLog').hidden=t!=='log'; renderDmg(); }
function renderLog(){ $('log').innerHTML=G.log.slice(0,16).map(l=>`<li>${esc(l)}</li>`).join(''); }
function renderCard(){
 if(HEADLESS) return; const el=$('ucard'), me=G.me;
 let inst=null, cu=null, live=false;
 if(selCombat&&viewCombat()&&viewCombat().units.includes(selCombat)&&!selCombat.dead){ cu=selCombat; live=true; }
 else if(selected&&findLoc(me,selected)){ inst=selected; cu=makeCombatUnit(inst,me,traitTiers(me),0); }
 else { selected=null; selCombat=null; el.classList.add('hidden'); return; }
 const d=cu.d, star=cu.star, ab=cu.copied||cu.ab, P=abilPower(cu), col=typeColor(d);
 el.style.setProperty('--tc',col); el.classList.remove('hidden');
 const traits=inst?unitTraits(inst):(d.traits||[]);
 const mineSide=curFlip()?1:0;
 const who=live?(cu.side===mineSide?'Tu Pokémon':'Rival'):`Coste ${d.cost||'—'} · ${ROLE_NAME[d.role]||'Salvaje'}`;
 const stats=[['❤️ Vida',live?`${R0(cu.hp)}/${R0(cu.maxHp)}`:R0(cu.maxHp)],['⚔️ Ataque',R0(cu.ad)],['⚡ Vel. ataque',cu.as.toFixed(2)],['🎯 Alcance',cu.range],['🛡️ Defensa',R0(cu.df)],['🔰 Resistencia',R0(cu.mr)],['✨ Poder',R0(cu.ap)],['💧 Maná',`${R0(cu.mana)}/${cu.maxMana>=9999?'—':cu.maxMana}`],['💥 Crítico',R0(cu.critC*100)+'%'],['🌀 Esquiva',R0(cu.dodge*100)+'%']];
 const evo=d.names&&!d.evoOf?`<div class="uc-evo">${[1,2,3].map(s=>`<div class="f ${s===star?'on':''}" data-tip="form:${d.key}|${s}">${spriteHTML(d,40,s)}<b>${'★'.repeat(s)}</b>${esc(nameOf(d,s))}<span class="muted">${esc(abOf(d,s)[1])}</span></div>`).join('')}</div>`:'';
 const items=inst?`<div class="uc-items">${[0,1,2].map(i=>{ const it=inst.items[i]; if(!it) return `<div class="slot">Vacío</div>`; const I=ITEMS[it]; return `<div class="slot full" data-tip="item:${it}">${itemHTML(it)}${esc(I.name)}</div>`; }).join('')}</div>`:(cu.items.length?`<div>${cu.items.map(i=>ITEMS[i]?`<span class="chip" data-tip="item:${i}">${itemHTML(i,18)} ${ITEMS[i].name}</span>`:'').join('')}</div>`:'');
 const extra=inst&&inst.defId==='eevee'?`<p class="small">🌀 Evoluciona al derrotar ${me.mods.eeveeKills} enemigos: <b>${Math.min(inst.kills,me.mods.eeveeKills)}/${me.mods.eeveeKills}</b></p>`:'';
 const stk=inst&&inst.stk&&(inst.stk.hp||inst.stk.ad)?`<p class="small">♾️ Acumulado para siempre: +${R0(inst.stk.hp)} vida · +${R0(inst.stk.ad)} ataque</p>`:'';
 el.innerHTML=`<div class="uc-head">${spriteHTML(d,64,star)}<div><div class="uc-name">${esc(cu.name)} <span style="color:${star===3?'#d9a400':star===2?'#8e9bb0':'#b07a45'}">${'★'.repeat(star)}</span></div><div class="uc-sub">${who}</div></div><button class="uc-x" aria-label="Cerrar ficha">✕</button></div>
  ${live?`<div class="uc-hp"><i style="width:${clamp(cu.hp/cu.maxHp*100,0,100)}%"></i></div>`:''}
  <div>${traits.map(t=>TRAITS[t]?`<span class="chip" data-tip="trait:${t}">${TRAITS[t].icon} ${t}</span>`:'').join('')}</div>
  <div class="uc-ab"><div class="t">${esc(ab[1])}</div><div class="m">${KIND_NAME[ab[0]]} · se lanza al llenar el maná (${cu.maxMana>=9999?'—':cu.maxMana})</div><p>${abDesc(ab,P,star)}</p></div>
  <div class="uc-stats">${stats.map(([a,b])=>`<div><span>${a}</span><b>${b}</b></div>`).join('')}</div>
  ${evo}${items}${extra}${stk}
  ${inst?`<button class="btn sm" id="ucSell">Vender por ${sellValue(inst)} de oro</button>`:''}`;
 hydrate(el);
}

/* ---------- modales ---------- */
function openModal(html,opt={}){ NET.modal=opt.kind||''; NET.onClose=opt.onClose||null; $('mbox').innerHTML=(opt.closable?'<div class="mtop"><button class="mclose" aria-label="Cerrar" id="mClose">✕</button></div>':'')+html; $('modal').classList.remove('hidden'); hydrate($('mbox')); hideTip(); if(opt.closable) $('mClose').onclick=closeModal; }
function closeModal(){ $('modal').classList.add('hidden'); $('mbox').innerHTML=''; hideTip(); NET.modal=''; const f=NET.onClose; NET.onClose=null; if(f) f(); }
function showDifficulty(){
 openModal(`<h1>Contra bots</h1><p class="muted">7 entrenadores rivales. Elige la dificultad.</p>
 <div class="diffs">
  <button class="choice" data-d="facil"><span class="big">🌱</span><b>Fácil</b><span class="small">No refrescan la tienda, colocan sus Pokémon al azar y equipan objetos a medias.</span></button>
  <button class="choice" data-d="normal"><span class="big">⚔️</span><b>Normal</b><span class="small">Juegan una economía estándar y buscan sinergias.</span></button>
  <button class="choice" data-d="dificil"><span class="big">🔥</span><b>Difícil</b><span class="small">Refrescan más, suben de nivel antes y gastan mejor cuando tienen poca vida.</span></button>
 </div>`,{closable:true});
 $('mbox').querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{ S.diff=b.dataset.d; saveSettings(); closeModal(); $('menu').classList.add('hidden'); selected=null; selCombat=null; newGame({diff:S.diff}); });
}
function showHow(){
 openModal(`<h1>Cómo jugar</h1>
 <p>Juegas contra 7 entrenadores. Cada ronda compras Pokémon, los colocas en el tablero y combaten solos. Si pierdes, pierdes vida de entrenador. El último en pie gana.</p>
 <h3>Habilidades</h3><ul class="help"><li>Cada Pokémon llena su barra azul de maná al atacar y recibir golpes. Al llenarla lanza su habilidad: verás el nombre sobre él, el efecto en el tablero y una línea en «Habilidades en este combate».</li><li>Toca cualquier Pokémon (también los rivales en pleno combate) para ver su ficha completa a la derecha.</li></ul>
 <h3>Economía</h3><ul class="help"><li>Ingreso por ronda: 0 · 2 · 3 en la fase 1, 4 en la 2-1 y 5 desde entonces.</li><li>Interés: +1 por cada 10 de oro (máx. 5). Rachas de 2+ victorias o derrotas dan +1 a +3.</li></ul>
 <h3>Pokémon</h3><ul class="help"><li>3 copias = 2★ y evoluciona con una habilidad nueva. 3 de 2★ = 3★. A 3★ deja de salir en tu tienda.</li><li>Eevee acumula vida y ataque para siempre y evoluciona al derrotar enemigos.</li></ul>
 <h3>Objetos</h3><ul class="help"><li>Arrastra un componente sobre un Pokémon que ya lleve otro y se combinan. En el inventario, mantén un componente 1 segundo sobre otro para combinarlos. Para quitar objetos a un Pokémon usa el 🧲 Imán Removedor (recibes uno en cada fase contra salvajes).</li></ul>
 <h3>Multijugador</h3><ul class="help"><li>Crea una sala, comparte el código y empieza cuando quieras: los asientos vacíos los ocupan bots.</li></ul>
 <h3>Atajos</h3><p><span class="kbd">D</span> nueva tienda · <span class="kbd">F</span> comprar EXP · <span class="kbd">E</span> vender · <span class="kbd">Espacio</span> listo · <span class="kbd">Esc</span> cerrar ficha · toca a tu entrenador para saludar</p>
 <h3>Créditos</h3><p class="small muted">Fangame gratuito y sin ánimo de lucro, sin relación con Nintendo, Game Freak ni The Pokémon Company. Sprites de Pokémon y objetos: PokeAPI/sprites. Entrenadores: Pokémon Showdown. Música original.</p>`,{closable:true});
}
function showDex(cost){
 const list=UNIT_LIST.filter(u=>!cost||u.cost===cost);
 openModal(`<h1>Pokédex</h1><p>${UNIT_LIST.length} líneas evolutivas. Pasa el cursor por una carta para ver sus 3 habilidades (una por estrella).</p>
 <div class="dexFilters">${[0,1,2,3,4,5].map(c=>`<button class="btn sm" data-c="${c}" aria-pressed="${c===cost}">${c?'Coste '+c:'Todos'}</button>`).join('')}</div>
 <div class="dexGrid">${list.map(d=>`<div class="dexCard c${d.cost}" data-tip="unit:${d.key}"><div class="forms">${d.names.map((n,i)=>`${i?'<span class="ar">›</span>':''}${spriteHTML(d,d.names.length>2?44:54,i+1)}`).join('')}</div><b>${d.names.join(' › ')}</b><span class="t">${d.traits.join(' · ')}</span></div>`).join('')}</div>`,{closable:true});
 $('mbox').querySelectorAll('.dexFilters button').forEach(b=>b.onclick=()=>showDex(+b.dataset.c));
}
function showRecipes(){
 openModal(`<h1>Objetos</h1><p class="muted">Fila + columna = objeto. Pasa el cursor por una casilla para ver qué hace.</p>
 <div class="rtable"><table><tr><th></th>${ORDER.map(c=>`<th data-tip="item:${c}">${itemHTML(c,40)}</th>`).join('')}</tr>
 ${ORDER.map(a=>`<tr><th data-tip="item:${a}">${itemHTML(a,40)}</th>${ORDER.map(b=>{ const id=combineKey(a,b); return `<td data-tip="item:${id}">${itemHTML(id,40)}</td>`; }).join('')}</tr>`).join('')}</table></div>`,{closable:true});
}
function showOptions(){
 openModal(`<h1>Opciones</h1>
 <div class="field"><label for="optVol">Volumen de la música</label><input type="range" id="optVol" min="0" max="100" value="${R0(S.vol*100)}"></div>
 <div class="field"><label for="optTimer">Tiempo de planificación (solo / anfitrión)</label><select id="optTimer">${[[30,'30 segundos'],[45,'45 segundos'],[60,'60 segundos'],[0,'Sin límite (pulsas Listo)']].map(([v,t])=>`<option value="${v}" ${S.timer===v?'selected':''}>${t}</option>`).join('')}</select></div>
 <div class="field"><label for="optSpeed">Velocidad de combate</label><select id="optSpeed">${[1,2,4].map(v=>`<option value="${v}" ${S.speed===v?'selected':''}>x${v}</option>`).join('')}</select></div>
 <div class="field"><label for="optTheme">Tema</label><select id="optTheme">${[['system','Según el sistema'],['light','Claro'],['dark','Oscuro']].map(([v,t])=>`<option value="${v}" ${S.theme===v?'selected':''}>${t}</option>`).join('')}</select></div>
 <div class="row" style="justify-content:space-between;margin-top:16px"><button class="btn primary" id="saveOpt">Guardar</button><button class="btn ghost" id="logoutBtn">Cerrar sesión</button></div>`,{closable:true});
 $('optVol').oninput=e=>{ S.vol=+e.target.value/100; S.muted=false; Music.init(); Music.setVol(); $('muteBtn').textContent='🔊'; };
 $('saveOpt').onclick=()=>{ S.timer=+$('optTimer').value; S.speed=+$('optSpeed').value; S.theme=$('optTheme').value; saveSettings(); applyTheme(); renderMenu(); closeModal(); };
 $('logoutBtn').onclick=()=>{ closeModal(); logout(); };
}
function confirmQuit(){
 openModal(`<h1>¿Volver al menú?</h1><p>${NET.mode==='client'?'Saldrás de la sala; un bot jugará por ti.':'La partida actual se perderá.'}</p><div style="display:flex;gap:8px"><button class="btn primary" id="qYes">Volver al menú</button><button class="btn" id="qNo">Seguir jugando</button></div>`,{closable:true});
 $('qYes').onclick=()=>{ closeModal(); if(G) G.over=true; if(NET.mode!=='sp') leaveRoom(); showMenu(); };
 $('qNo').onclick=closeModal;
}
function showAugment(){
 const me=G.me; if(!me.augChoices||!me.augChoices.length) return;
 const R=G.round, tier=G.augTiers[R.aug]||'G', choices=me.augChoices.map(id=>AUG_BY[id]).filter(Boolean);
 NET.augKey=me.augChoices.join();
 openModal(`<h1>Aumento ${R.aug+1} de 3</h1><p><span class="tierTag tier${tier}">${TIER_NAME[tier]}</span> Elige una mejora permanente. Todos los entrenadores reciben aumentos del mismo nivel en esta ronda.</p>
 <div class="choices">${choices.map((a,i)=>`<button class="choice tier${a.tier}" data-i="${i}"><span class="big">${a.icon}</span><b>${a.name}</b><span class="small">${a.desc}</span></button>`).join('')}</div>
 ${me.augRerolled?'':'<button class="btn" id="augReroll">Cambiar opciones (1 vez)</button>'}`,{kind:'aug'});
 $('mbox').querySelectorAll('.choice').forEach(b=>b.onclick=()=>{ const a=choices[+b.dataset.i]; closeModal(); toast(`✨ ${a.name}`); doAct({t:'aug',i:+b.dataset.i},()=>{ me.augChoices=null; }); });
 if($('augReroll')) $('augReroll').onclick=()=>{ doAct({t:'augrr'},()=>{ me.augRerolled=true; }); if(NET.mode!=='client') showAugment(); };
}
function showEvolve(u,done){
 const opts=shuffle(EVOS.slice()).slice(0,3);
 openModal(`<h1>¡Eevee va a evolucionar!</h1><p>Ha derrotado a suficientes enemigos. Elige su evolución: conserva todo lo que ha acumulado y gana una habilidad nueva.</p>
 <div class="choices">${opts.map((e,i)=>{ const cu=baseCombatUnit(e,0,u.star); return `<button class="choice" data-i="${i}">${spriteHTML(e,64)}<b>${e.name}</b><span class="small">${e.traits.map(t=>TRAITS[t].icon+' '+t).join(' · ')} · ${ROLE_NAME[e.role]}<br><b style="display:inline;font-size:12px">${e.ab[0][1]}:</b> ${abDesc(e.ab[0],abilPower(cu),u.star)}</span></button>`; }).join('')}</div>`);
 $('mbox').querySelectorAll('.choice').forEach(b=>b.onclick=()=>{ u.defId=opts[+b.dataset.i].key; note(G.me,`🌀 Eevee evolucionó en ${DEF[u.defId].name}`,true); closeModal(); renderUI(); done(); });
}
function showAnvil(a,done){
 openModal(`<h1>⚒️ ${a.kind==='ca'?'Yunque de componentes':'Yunque de objeto'}</h1><p>Elige uno.</p>
 <div class="choices">${a.opts.map((k,i)=>`<button class="choice" data-i="${i}" data-tip="item:${k}">${itemHTML(k,52)}<b>${ITEMS[k].name}</b><span class="small">${statLine(ITEMS[k].s)}${ITEMS[k].comp?'':'<br>'+ITEMS[k].desc}</span></button>`).join('')}</div>`);
 $('mbox').querySelectorAll('.choice').forEach(b=>b.onclick=()=>{ giveItem(G.me,a.opts[+b.dataset.i]); closeModal(); renderUI(); done(); });
}
function showGameOver(){
 const me=G.me, won=me.place===1;
 if(NET.mode==='sp'&&!G.reported){ G.reported=true; reportResult(me.place); }
 openModal(`<h1>${won?'¡Campeón de la Liga!':me.alive?'Fin de la partida':'Has quedado eliminado'}</h1>
 <p>${won?'Eres el último entrenador en pie.':`Puesto ${me.place||'—'} de 8.`} Ronda ${G.round?G.round.s+'-'+G.round.n:'—'} · nivel ${me.level}.</p>
 <p class="small muted">Aumentos: ${me.augments.map(id=>AUG_BY[id]?AUG_BY[id].name:'').filter(Boolean).join(', ')||'ninguno'}</p>
 <div style="display:flex;gap:8px;flex-wrap:wrap">${NET.mode==='sp'?'<button class="btn primary" id="againBtn">Jugar otra vez</button>':''}${NET.mode==='client'&&!G.over?'<button class="btn" id="watchBtn">Seguir mirando</button>':''}<button class="btn" id="toMenu">Menú principal</button></div>`,{kind:'over'});
 if($('againBtn')) $('againBtn').onclick=()=>{ closeModal(); selected=null; selCombat=null; newGame({diff:S.diff}); };
 if($('watchBtn')) $('watchBtn').onclick=closeModal;
 $('toMenu').onclick=()=>{ closeModal(); if(NET.mode!=='sp') leaveRoom(); showMenu(); };
}
function renderMenu(){
 if(!ACC) return; const t=TRAINER_BY[S.trainer]||TRAINER_BY.red, st=ACC.stats||{};
 $('menuWho').innerHTML=`<div class="stand"><img src="${TRAINER_SPRITE(t.key)}" alt="${esc(t.name)}"></div>
  <div class="tname">${esc(ACC.name)}</div><div class="tfrom">${esc(t.name)} · ${esc(t.from)}</div>
  <div class="stats"><div><b>${st.games||0}</b><span>Partidas</span></div><div><b>${st.wins||0}</b><span>Victorias</span></div><div><b>${st.top4||0}</b><span>Top 4</span></div><div><b>${st.best?'#'+st.best:'—'}</b><span>Mejor</span></div></div>
  <div class="row"><button class="btn sm" id="pickTr">Cambiar entrenador</button></div>`;
 $('pickTr').onclick=()=>showTrainerPick(false);
}
function showMenu(){ renderMenu(); $('auth').classList.add('hidden'); $('menu').classList.remove('hidden'); }
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
 ACC=user; S.name=user.name.slice(0,14); if(TRAINER_BY[user.trainer]) S.trainer=user.trainer;
 const s=user.settings||{}; for(const k of SYNCED) if(k in s) S[k]=s[k];
 try{ localStorage.setItem(SETTINGS_KEY,JSON.stringify(Object.fromEntries(SYNCED.map(k=>[k,S[k]])))); }catch(e){}
 applyTheme(); Music.setVol(); $('muteBtn').textContent=S.muted?'🔇':'🔊';
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
function showAuth(msg){
 ACC=null; closeModal(); $('menu').classList.add('hidden'); $('auth').classList.remove('hidden');
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
   if(!TRAINER_BY[u.trainer]) showTrainerPick(true); else showMenu();
 }catch(err){ authError(err.message,err.field); }
 finally{ authBusy=false; $('auGo').disabled=false; $('auGo').textContent=reg?'Crear cuenta':'Entrar'; }
}
function bindAuth(){
 $('authForm').addEventListener('submit',submitAuth);
 $('tabLogin').onclick=()=>setAuthMode('login');
 $('tabReg').onclick=()=>setAuthMode('register');
 $('auShow').onclick=()=>{ const on=$('auPass').type==='password'; $('auPass').type=$('auPass2').type=on?'text':'password'; $('auShow').textContent=on?'Ocultar':'Ver'; $('auShow').setAttribute('aria-label',on?'Ocultar contraseña':'Mostrar contraseña'); };
}
function showTrainerPick(first){
 let cur=S.trainer;
 $('menu').classList.remove('hidden'); $('auth').classList.add('hidden');
 openModal(`<h1>${first?'Elige a tu estratega':'Cambiar entrenador'}</h1><p class="muted">Te acompañará en el tablero y en el carrusel.</p>
  <div class="trGrid" id="trGrid">${TRAINERS.map(t=>`<button class="trOpt" data-k="${t.key}" aria-pressed="${t.key===cur}"><img src="${TRAINER_SPRITE(t.key)}" alt="" loading="lazy"><b>${esc(t.name)}</b><span>${esc(t.from)}</span></button>`).join('')}</div>
  <div class="trBar"><span class="muted small" id="trSel"></span><button class="btn primary" id="trOk">Confirmar</button></div>`,{closable:!first,onClose:()=>{ if(ACC) showMenu(); }});
 const sel=()=>{ const t=TRAINER_BY[cur]; $('trSel').textContent=t?`${t.name} · ${t.from}`:'Toca un entrenador'; $('trOk').disabled=!t; };
 sel();
 $('trGrid').onclick=e=>{ const b=e.target.closest('.trOpt'); if(!b) return; cur=b.dataset.k; $('trGrid').querySelectorAll('.trOpt').forEach(x=>x.setAttribute('aria-pressed',x===b)); sel(); };
 $('trOk').onclick=async()=>{
   $('trOk').disabled=true;
   try{ const {user}=await api('/api/me',{trainer:cur}); applyAccount(user); S.trainer=cur; closeModal(); showMenu(); }
   catch(err){ toast(err.message); $('trOk').disabled=false; if(err.status===401) showAuth(err.message); }
 };
}
async function logout(){
 try{ await api('/api/logout',{}); }catch(e){}
 if(G) G.over=true; if(NET.mode!=='sp') leaveRoom(); resetSocket();
 G={phase:'idle',me:makePlayer(0,'Tú',false,'🧢'),players:[],log:[],speed:S.speed,pool:{}};
 showAuth();
}
// El socket se abre con la sesión: al entrar o salir de la cuenta hay que rehacerlo
function resetSocket(){ if(NET.sock){ NET.sock.removeAllListeners(); NET.sock.disconnect(); NET.sock=null; } }
function reportResult(place){ if(!ACC||!(place>=1&&place<=8)) return; api('/api/result',{place}).then(d=>{ if(d&&d.user){ ACC=d.user; renderMenu(); } }).catch(()=>{}); }

async function boot(){
 cv=$('cv'); ctx=cv.getContext('2d');
 loadSettings();
 G={phase:'idle',me:makePlayer(0,S.name,false,S.avatar,S.trainer),players:[],log:[],speed:S.speed,pool:{}};
 $('muteBtn').textContent=S.muted?'🔇':'🔊';
 layout(); applyTheme(); bindEvents(); Scene.init();
 if(!window.B3) window.addEventListener('b3ready',sizeB3);
 setInterval(tick,33); requestAnimationFrame(frame);
 try{ const {user}=await api('/api/me'); applyAccount(user); if(!TRAINER_BY[user.trainer]) showTrainerPick(true); else showMenu(); }
 catch(err){ showAuth(err.status===401?'':err.message); }
}

/* ============================ [SERVER API] ============================ */
// La usa server.js: cada sala ejecuta este mismo archivo en su propio contexto aislado (vm).
function serverCreate(cfg,emit){
 geo=computeGeo(640);
 NET.mode='host'; NET.named={emit:(t,d)=>{ try{ emit(t,d); }catch(e){} return Promise.resolve(); }};
 S.timer=[30,45,60].includes(cfg.timer)?cfg.timer:30; S.speed=[1,2,4].includes(cfg.speed)?cfg.speed:1;
 newGame({mp:true,server:true,diff:DIFF_NAME[cfg.diff]?cfg.diff:'normal',humans:cfg.humans||[]});
 netFlush(true);
}
function serverTick(dt){
 if(!G||G.over) return;
 if(G.phase==='planning'){ G.timer-=dt; if(G.timer<=0||humansReady()) startCombat(); }
 if(G.phase==='augment'&&Date.now()>G.augDeadline) autoAugs();
 if(G.phase==='carousel') updateCarousel(dt);
 if(G.phase==='combat'&&!G.resolving&&Date.now()>=(G.resolveNotBefore||0)){ G.resolving=true; later(resolveRound,300); }
 hostNetTick();
}
function serverAct(peer,a){ if(!G||!G.players) return; const p=G.players.find(x=>x.remote&&x.peer===peer); if(!p) return; const r=applyAct(p,a); if(r&&!r.ok&&r.why) note(p,r.why,true); }
function serverLeave(peer){ if(!G||!G.players) return; const p=G.players.find(x=>x.remote&&x.peer===peer); if(p){ p.remote=false; p.isBot=true; p.name=p.name+' (bot)'; note(null,`🔌 ${p.name} se desconectó; un bot juega por él`); } }
function serverInfo(){ return {over:!!(G&&G.over),humans:G&&G.players?G.players.filter(p=>p.remote&&p.alive).length:0,round:G&&G.round?G.round.s+'-'+G.round.n:'',places:G&&G.players?G.players.filter(p=>p.peer&&p.place>0).map(p=>[p.peer,p.place]):[]}; }

if(HEADLESS){ module.exports={serverCreate,serverTick,serverAct,serverLeave,serverInfo,newGame,TRAINERS,makeFights,possibleOpps,get G(){return G},ROUNDS,DEF,UNIT_LIST,AUGS,ITEMS,RECIPE,FULL_KEYS,BASIC,abDesc,baseCombatUnit,abilPower,abOf,SONGS,createCombatSnap,teamSnap,simulate,applyAct}; } else boot();
