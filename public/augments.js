/* =====================================================================
   POKÉ TACTICS · Aumentos estratégicos
   Catálogo declarativo + motor de efectos. Se carga ANTES que game.js (en el navegador
   con <script> y en el servidor concatenado) y solo define datos y funciones: no ejecuta
   nada al cargar, así que puede usar las funciones de game.js (giveItem, addXp, note…).

   Cada aumento: {id, tier S/G/P, cat, tags, w (peso), name, icon, desc, ex (grupo excluyente),
   req(p) (requisito para ofrecerlo), on:{evento:(c)=>…} (efectos), combat(units,prm,cb,side)
   (efecto en combate, determinista), snap(c) (parámetros para el combate), ui(c) (progreso)}.

   Eventos que lanza game.js con augFire(p,evento,datos):
   select · roundStart · combatStart · win · lose · roundEnd · buy · sell · reroll · gain ·
   starUp · levelUp · kills · survive · damaged · pick (respuesta a una elección)
   ===================================================================== */

const AUG_ROUNDS_INFO='Ofertas en las rondas 2-1, 3-2 y 4-2 (3 opciones; eliges una).';
const AUG_CAT={econ:'Economía',reroll:'Reroll',slow:'Ahorro',fast:'Nivel rápido',streak:'Rachas',emblem:'Emblemas',trait:'Sinergias',
 evo:'Evolución',carry:'Hiper carry',risk:'Riesgo',chaos:'Caos',rules:'Reglas',quest:'Misión',hybrid:'Híbrido',classic:'Clásico'};
const ELEM_TRAITS=['Fuego','Agua','Planta','Eléctrico','Psíquico','Roca','Dragón','Fantasma','Hada','Normal','Acero','Siniestro','Lucha'];
const CLASS_TRAITS=['Guardián','Coloso','Peleador','Tirador','Hechicero','Asesino','Sanador','Cazatesoros','Depredadores','Team Rocket','Potencial Evolutivo'];
const AUG_MAX_DEPTH=3; // protección contra efectos que se disparan unos a otros en bucle

/* ---------- estado y utilidades ---------- */
// Estado de cada aumento de cada jugador (contadores, elecciones…): única fuente de verdad, en p.augSt
function augState(p,id){ p.augSt=p.augSt||{}; return p.augSt[id]||(p.augSt[id]={}); }
// Contexto que reciben los efectos: el jugador, el estado del aumento, los datos del evento y ayudas
function augCtx(p,def,d){
 const st=augState(p,def.id);
 const say=msg=>{ (p.augLog=p.augLog||[]).unshift(`${def.name}: ${msg}`); p.augLog.length=Math.min(p.augLog.length,30); note(p,`${def.icon} ${def.name}: ${msg}`,false); };
 return {p,st,d:d||{},def,say,
   gold:(n,cap)=>{ if(cap!=null){ st.goldMade=st.goldMade||0; n=Math.max(0,Math.min(n,cap-st.goldMade)); st.goldMade+=n; } if(n>0) p.gold+=n; return n; },
   xp:n=>addXp(p,n), item:k=>giveItem(p,k), comp:()=>giveItem(p,pick(BASIC)), full:()=>giveItem(p,pick(FULL_KEYS)),
   unit:cost=>{ const k=drawUnitOfCost(cost,threeStarSet(p)); if(k) giveUnitTo(p,k); return k; },
   once:key=>{ st.once=st.once||{}; if(st.once[key]) return false; st.once[key]=1; return true; },
   offer:(title,desc,opts)=>augOffer(p,def.id,title,desc,opts)};
}
let AUG_DEPTH=0;
// Lanza un evento a todos los aumentos del jugador (con protección contra recursión)
function augFire(p,evt,d){
 if(!p||!p.augments||!p.augments.length||AUG_DEPTH>=AUG_MAX_DEPTH) return;
 AUG_DEPTH++;
 try{ for(const id of p.augments.slice()){ const def=AUG_BY[id]; const f=def&&def.on&&def.on[evt]; if(f) f(augCtx(p,def,d)); } chaosTick(p,evt,d||{}); }
 finally{ AUG_DEPTH--; }
}
const augOwned=(p,id)=>p.augments.includes(id);
const ownedSpecies=p=>new Set(allUnits(p).map(u=>u.baseId));
const boardSpecies=p=>new Set(boardUnits(p).map(u=>u.baseId)); // solo las fichas colocadas (Coleccionista)
const elemTraitsOf=p=>{ const c=traitCounts(p); return ELEM_TRAITS.filter(t=>c[t]).sort((a,b)=>c[b]-c[a]); };
const boardKeyOf=(p,uid)=>{ for(const k in p.board) if(p.board[k].uid===uid) return k; return null; };
function unitOptions(p,filter,n=3){ // Pokémon (claves) para elegir: distintos, del pool y de costes del filtro
 const pool=UNIT_LIST.filter(u=>filter(u)&&(!G.pool||G.pool[u.key]>0));
 return shuffle(pool.slice()).slice(0,n).map(u=>({t:u.name,i:'🐾',d:`Coste ${u.cost} · ${u.traits.join(', ')}`,v:'u:'+u.key}));
}
// Recompensas genéricas codificadas en texto (para opciones de elecciones y la Llamada al Caos)
function augGrant(p,v){
 const [k,a]=String(v).split(':');
 if(k==='ev'){ const [uid,key]=String(a).split('|'), u=allUnits(p).find(x=>String(x.uid)===uid&&x.defId==='eevee'), e=DEF[key];
   if(!u||!e||e.evoOf!=='eevee') return ''; u.defId=key; p.eeveeForm=key; return 'Eevee evolucionó en '+e.name; }
 if(k==='te'){ const [st,key]=String(a).split('|'), t=TACS[p.tac], e=DEF[key], n=(+st)-1; if(!t||!t.pick||!e||!(n>=0&&n<2)||!t.pick[n].includes(key)) return ''; p.tacForm=p.tacForm||['','']; p.tacForm[n]=key; return 'Tu minileyenda evolucionó en '+e.name; }
 if(k==='g'){ p.gold+=+a; return `${a} de oro`; }
 if(k==='xp'){ addXp(p,+a); return `${a} de EXP`; }
 if(k==='c'){ const it=giveItem(p,pick(BASIC)); return ITEMS[it].name; }
 if(k==='f'){ const it=giveItem(p,pick(FULL_KEYS)); return ITEMS[it].name; }
 if(k==='it'&&ITEMS[a]){ giveItem(p,a); return ITEMS[a].name; }
 if(k==='u'&&DEF[a]){ if(G.pool&&G.pool[a]>0) G.pool[a]--; giveUnitTo(p,a); return DEF[a].name; }
 if(k==='uc'){ const key=drawUnitOfCost(+a,threeStarSet(p)); if(key){ giveUnitTo(p,key); return DEF[key].name; } p.gold+=+a; return `${a} de oro`; }
 if(k==='em'&&TRAITS[a]){ giveItem(p,'emb_'+a); return 'Emblema '+a; }
 if(k==='rr'){ p.freeRerolls+=+a; return `${a} tiendas gratis`; }
 // Forja: cambia la insignia recién creada (en el inventario o en un Pokémon) por la sinergia elegida
 if(k==='fg'&&ITEMS[a]&&ITEMS[a].forge){ const base='em_'+ITEMS[a].forge; if(a===base) return ITEMS[a].name;
   const i=p.items.lastIndexOf(base); if(i>=0){ p.items[i]=a; return ITEMS[a].name; }
   for(const u of allUnits(p)){ const j=u.items.indexOf(base); if(j>=0&&!DEF[u.defId].traits.includes(ITEMS[a].emblem)&&!unitTraits(u).includes(ITEMS[a].emblem)){ u.items[j]=a; return ITEMS[a].name; } }
   return ''; }
 return '';
}

/* ---------- elecciones pendientes (emblemas, recompensas, Llamada al Caos) ---------- */
// p.picks: cola de elecciones; cada una con opciones {t:título,i:icono,d:descripción,v:valor}. La resuelve el servidor (acción 'pick').
function augOffer(p,src,title,desc,opts){
 if(!opts||!opts.length) return null;
 G.pickSeq=(G.pickSeq||0)+1; const pk={id:G.pickSeq,src,title,desc,opts:opts.slice(0,6)};
 (p.picks=p.picks||[]).push(pk); if(p.isBot||G.auto) resolvePick(p,pk.id,botPickIndex(pk));
 return pk;
}
const botPickIndex=pk=>Math.floor(Math.random()*pk.opts.length);
function resolvePick(p,id,i){
 const k=(p.picks||[]).findIndex(x=>x.id===id); if(k<0) return {ok:false};
 const pk=p.picks[k], o=pk.opts[i]; if(!o) return {ok:false};
 p.picks.splice(k,1);
 const def=AUG_BY[pk.src]||AUG_EVENTS[pk.src];
 if(def&&def.on&&def.on.pick){ AUG_DEPTH++; try{ def.on.pick(augCtx(p,def,{v:o.v,pick:pk})); } finally{ AUG_DEPTH--; } }
 else { const got=augGrant(p,o.v); if(got) note(p,`${pk.title}: ${got}`,false); }
 return {ok:true};
}
// Las elecciones sin responder se resuelven solas (primera opción) al empezar el combate
function autoPicks(p){ for(const pk of (p.picks||[]).slice()) resolvePick(p,pk.id,0); }

/* ---------- combate: modificadores deterministas ---------- */
// Los parámetros salen del estado del jugador (snap) y viajan en el teamSnap: todos los clientes ven el mismo combate
function boost(u,o){
 if(o.hp){ u.maxHp*=1+o.hp; u.hp=u.maxHp; } if(o.hpf){ u.maxHp+=o.hpf; u.hp=u.maxHp; }
 if(o.ad) u.ad*=1+o.ad; if(o.as) u.as=Math.min(3,u.as*(1+o.as)); if(o.ap) u.ap+=o.ap;
 if(o.df){ u.df+=o.df; u.mr+=o.df; } if(o.dmg) u.dmgBonus+=o.dmg; if(o.crit) u.critC+=o.crit;
 if(o.mana) u.mana+=o.mana; if(o.shield) u.startShield+=o.shield; if(o.dodge) u.dodge+=o.dodge;
}
const hasT=(u,t)=>(u.traits||u.d.traits||[]).includes(t);
function augSnap(p){ // [[id,params]…] de los aumentos con efecto en combate
 const out=[]; for(const id of p.augments){ const def=AUG_BY[id]; if(!def||!def.combat) continue; const prm=def.snap?def.snap(augCtx(p,def)):1; if(prm!=null&&prm!==false) out.push([id,prm]); }
 return out;
}
function augCombat(cb,side,units,list){
 if(!Array.isArray(list)) return;
 for(const row of list.slice(0,30)){ const def=Array.isArray(row)&&AUG_BY[row[0]]; if(def&&def.combat) try{ def.combat(units,row[1],cb,side); }catch(e){} }
}
// Ganchos de combate (bajas): cb.kh[side] = funciones (cb,asesino,víctima)
const addKillHook=(cb,side,f)=>{ cb.kh=cb.kh||[[],[]]; cb.kh[side].push(f); };

/* ---------- catálogo ---------- */
const AUG_DEFS=[];
const AG=(o)=>{ AUG_DEFS.push(Object.assign({w:1,tags:[],on:{}},o)); };
const rnds=(st,k)=>st[k]||0;

// ===== Economía =====
AG({id:'huevo',tier:'S',cat:'slow',tags:['slow'],name:'Huevo Misterioso',icon:'🥚',desc:'Eclosiona tras 6 rondas: recibes 2 copias de un Pokémon de coste 4 aleatorio y un componente.',
 on:{roundStart:c=>{ c.st.n=(c.st.n||0)+1; if(c.st.n>=6&&c.once('x')){ const k=c.unit(4); if(k) augGrant(c.p,'u:'+k); c.comp(); c.say(`¡eclosiona! ${k?'2 × '+DEF[k].name:'un premio'} y un componente`); } }},ui:c=>c.st.once?'Eclosionado':`Eclosiona en ${6-(c.st.n||0)} rondas`});
AG({id:'amuleto2',tier:'G',cat:'classic',w:.5,name:'Amuleto Moneda II',icon:'🪙',desc:'+2 de oro al inicio de cada ronda. Recibes 4 de oro.',ex:'amuleto',on:{select:c=>{c.p.mods.income+=2;c.p.gold+=4;}}});
AG({id:'amuleto3',tier:'P',cat:'classic',w:.5,name:'Amuleto Moneda III',icon:'💰',desc:'+3 de oro al inicio de cada ronda. Recibes 10 de oro.',ex:'amuleto',on:{select:c=>{c.p.mods.income+=3;c.p.gold+=10;}}});
AG({id:'fondo_emergencia',tier:'S',cat:'econ',tags:['lose'],name:'Fondo de Emergencia',icon:'🚑',desc:'Una sola vez: cuando tu vida baje de 40, recibes 10 de oro y 1 componente.',
 on:{damaged:c=>{ if(c.p.hp<40&&c.once('x')){ c.p.gold+=10; c.comp(); c.say('10 de oro y un componente'); } }},ui:c=>c.st.once?'Usado':'Listo (vida < 40)'});
AG({id:'intercambio_eq',tier:'G',cat:'econ',name:'Intercambio Equivalente',icon:'⚖️',desc:'Al vender un Pokémon de coste 3 o 4, recibes uno aleatorio de un coste más (3 veces en toda la partida).',
 on:{sell:c=>{ const st=c.st; if((st.n||0)>=3||c.d.cost<3||c.d.cost>4) return; const k=c.unit(c.d.cost+1); if(k){ st.n=(st.n||0)+1; c.say(`recibes ${DEF[k].name}`); } }},ui:c=>`Usos: ${c.st.n||0}/3`});
AG({id:'mercado_negro',tier:'P',cat:'risk',name:'Mercado Negro del Team Rocket',icon:'🕶️',desc:'Elige un trato con su coste a la vista: 25 de oro (−1 de oro por ronda el resto de la partida), un Legendario (−12 de vida) o 2 objetos completos (−2 de oro por ronda durante 4 rondas).',
 on:{select:c=>c.offer('Mercado Negro','Cada trato tiene un coste. Elige con cuidado.',[{t:'25 de oro',i:'💰',d:'Coste: −1 de oro por ronda para siempre',v:'gold'},{t:'Un Legendario',i:'👑',d:'Coste: −12 de vida ahora',v:'leg'},{t:'2 objetos completos',i:'⚒️',d:'Coste: −2 de oro por ronda durante 4 rondas',v:'items'}]),
  pick:c=>{ const p=c.p; if(c.d.v==='gold'){ p.gold+=25; p.mods.income-=1; c.say('25 de oro (−1 de oro por ronda)'); } else if(c.d.v==='leg'){ p.hp-=12; const k=c.unit(5); c.say(`${k?DEF[k].name:'nada'} a cambio de 12 de vida`); } else { c.full(); c.full(); c.st.debt=4; c.say('2 objetos completos (deuda 4 rondas)'); } },
  roundStart:c=>{ if(c.st.debt>0){ c.st.debt--; c.p.gold=Math.max(0,c.p.gold-2); } }},ui:c=>c.st.debt?`Deuda: ${c.st.debt} rondas`:''});

// ===== Ahorro (slow roll) =====
AG({id:'ahorro_profesor',tier:'S',cat:'slow',tags:['slow'],name:'Ahorro del Profesor',icon:'🐖',desc:'Cada ronda que empiezas con 30 de oro o más suma 1 punto; con 3 puntos recibes un componente. Bajar de 30 reinicia los puntos.',
 on:{roundStart:c=>{ const st=c.st; if(c.p.gold>=30){ st.k=(st.k||0)+1; if(st.k>=3){ st.k=0; c.comp(); c.say('un componente por ahorrar'); } } else st.k=0; }},ui:c=>`Puntos: ${c.st.k||0}/3`});
AG({id:'paciencia_evo',tier:'G',cat:'slow',tags:['slow','evo'],name:'Paciencia Evolutiva',icon:'⏳',desc:'Cada ronda que empiezas con 30 de oro o más eliges una copia de uno de tus Pokémon de coste 1 o 2.',
 on:{roundStart:c=>{ if(c.p.gold<30) return; const own=[...new Set(allUnits(c.p).filter(u=>u.star<3&&DEF[u.baseId].cost<=2&&!DEF[u.baseId].evoOf).map(u=>u.baseId))]; const opts=shuffle(own).slice(0,3).map(k=>({t:DEF[k].name,i:'🧬',d:'Una copia',v:'u:'+k})); if(opts.length){ c.st.n=(c.st.n||0)+1; c.offer('Paciencia Evolutiva','Elige qué Pokémon copiar',opts); } }},ui:c=>`Copias elegidas: ${c.st.n||0}`});
AG({id:'investigacion_fin',tier:'G',cat:'slow',tags:['slow'],name:'Investigación Financiada',icon:'🔬',desc:'El oro por encima de 50 al empezar cada ronda da puntos (máx. 5 por ronda). Con 10 puntos: 3 tiendas gratis; con 25: un Pokémon de coste 4 (una vez).',
 on:{roundStart:c=>{ const st=c.st; st.pts=(st.pts||0)+Math.min(5,Math.max(0,c.p.gold-50)); if(st.pts>=10&&!st.a){ st.a=1; c.p.freeRerolls+=3; c.say('3 tiendas gratis'); } if(st.pts>=25&&!st.b){ st.b=1; const k=c.unit(4); c.say(k?DEF[k].name:'nada'); } }},ui:c=>`Puntos: ${c.st.pts||0}/25`});
AG({id:'reserva_balls',tier:'S',cat:'slow',tags:['slow'],name:'Reserva de Poké Balls',icon:'⚾',desc:'Mientras tengas 30 de oro o más, tu tienda sale como si tuvieras 1 nivel más.',
 on:{select:c=>{ c.p.mods.oddsSave=30; }}});

// ===== Reroll =====
// Crianza Selectiva: sin topes ni esperas. Cada ronda, una copia del Pokémon barato que más cerca está de subir de estrellas
AG({id:'crianza',tier:'S',cat:'reroll',tags:['reroll'],name:'Crianza Selectiva',icon:'🥚',desc:'Al empezar cada ronda recibes una copia de uno de tus Pokémon de coste 1 o 2 que aún no sea 3★ (el que más copias tenga).',
 on:{roundStart:c=>{ const cnt={}; for(const u of allUnits(c.p)){ const d=DEF[u.baseId]; if(u.star<3&&d.cost<=2&&!d.evoOf) cnt[u.baseId]=(cnt[u.baseId]||0)+Math.pow(3,u.star-1); }
   const k=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0]; if(!k) return; if(G.pool&&G.pool[k]>0) G.pool[k]--; giveUnitTo(c.p,k); c.st.n=(c.st.n||0)+1; c.say(`copia de ${DEF[k].name}`); }},ui:c=>`Copias: ${c.st.n||0}`});
AG({id:'profesor_pokemon',tier:'G',cat:'reroll',tags:['reroll','evo'],name:'Profesor Pokémon',icon:'👨‍🔬',desc:'Cada vez que un Pokémon de coste 1 o 2 sube a 2★, recibes 2 de oro y tu equipo gana +2% de velocidad de ataque permanente (máx. 10).',
 on:{starUp:c=>{ if(DEF[c.d.key].cost<=2&&c.d.star===2){ c.p.gold+=2; c.st.n=Math.min(10,(c.st.n||0)+1); c.say(`+2 de oro y velocidad (${c.st.n}/10)`); } }},
 combat:(us,n)=>{ for(const u of us) boost(u,{as:.02*n}); },snap:c=>c.st.n||null,ui:c=>`Acumulado: +${2*(c.st.n||0)}% vel. de ataque`});
AG({id:'evolucion_temprana',tier:'G',cat:'reroll',tags:['reroll','evo'],ex:'copias',name:'Evolución Temprana',icon:'🌱',desc:'Tus Pokémon de coste 1 suben de estrellas con 2 copias en vez de 3.',
 on:{select:c=>{ c.p.mods.cheapCombine=1; }}});
AG({id:'investigacion_campo',tier:'S',cat:'reroll',tags:['reroll'],name:'Investigación de Campo',icon:'📋',desc:'Cada refresco en el que no sale ninguno de tus Pokémon suma 1 punto. Con 8 puntos eliges un Pokémon de coste 1-2 y vuelves a empezar.',
 on:{reroll:c=>{ const own=ownedSpecies(c.p); if(c.p.shop.some(k=>k&&own.has(k))) return; c.st.k=(c.st.k||0)+1; if(c.st.k>=8){ c.st.k=0; c.offer('Investigación de Campo','Elige un Pokémon',unitOptions(c.p,u=>u.cost<=2)); } }},ui:c=>`Puntos: ${c.st.k||0}/8`});
AG({id:'especialista',tier:'G',cat:'reroll',tags:['reroll','carry'],name:'Especialista de Una Sola Especie',icon:'🎯',desc:'Elige una especie de tu equipo. Al llegar a 2★: 3 de oro. Al llegar a 3★: un emblema de su sinergia principal y +40% de vida y daño en combate.',
 req:p=>allUnits(p).length>0,
 on:{select:c=>{ const sp=[...ownedSpecies(c.p)].filter(k=>!DEF[k].evoOf).slice(0,4); c.offer('Especialista','Elige la especie a especializar',sp.map(k=>({t:DEF[k].name,i:'🎯',d:DEF[k].traits.join(', '),v:k}))); },
  pick:c=>{ c.st.sp=c.d.v; c.say(`especie elegida: ${DEF[c.d.v].name}`); },
  starUp:c=>{ if(c.d.key!==c.st.sp) return; if(c.d.star===2&&c.once('2')){ c.p.gold+=3; c.say('3 de oro'); } if(c.d.star===3&&c.once('3')){ const t=DEF[c.st.sp].traits.find(x=>x!=='Legendario'); if(t) c.item('emb_'+t); c.say('¡3★! Emblema y +40%'); } }},
 combat:(us,k)=>{ for(const u of us) if(u.d.key===k||u.d.evoOf===k) boost(u,{hp:.4,ad:.4,ap:20}); },
 snap:c=>c.st.once&&c.st.once['3']?c.st.sp:null,ui:c=>c.st.sp?`Especie: ${DEF[c.st.sp].name}`:'Sin elegir'});
AG({id:'laboratorio_evo',tier:'P',cat:'evo',tags:['evo','reroll'],name:'Laboratorio de Evolución',icon:'🧪',desc:'Cuando un Pokémon de coste 1-3 llega a 3★, recibes un emblema de tu sinergia más fuerte (máx. 2) y tus 3★ ganan +30% de vida y daño.',
 on:{starUp:c=>{ if(c.d.star!==3||DEF[c.d.key].cost>3||(c.st.n||0)>=2) return; const t=topTrait(c.p); if(t&&t!=='Legendario'){ c.item('emb_'+t); c.st.n=(c.st.n||0)+1; c.say(`emblema de ${t}`); } }},
 combat:us=>{ for(const u of us) if(u.star===3) boost(u,{hp:.3,ad:.3,ap:15}); }});

// ===== Nivel rápido (Fast 9) =====
AG({id:'prodigio',tier:'S',cat:'fast',tags:['fast'],name:'Entrenador Prodigio',icon:'🎓',desc:'Comprar EXP cuesta 3 de oro en vez de 4.',on:{select:c=>{ c.p.mods.xpCost=3; }}});
AG({id:'expedicion',tier:'P',cat:'fast',tags:['fast'],name:'Expedición Legendaria',icon:'🗺️',desc:'Al llegar a nivel 8 y a nivel 9, eliges 1 de 3 Legendarios.',
 on:{levelUp:c=>{ for(const L of [8,9]) if(c.d.level>=L&&c.once('l'+L)) c.offer('Expedición Legendaria','Elige un Legendario',unitOptions(c.p,u=>u.cost===5)); }},ui:c=>`Niveles 8 y 9`});
AG({id:'insignias',tier:'G',cat:'fast',tags:['fast'],name:'Insignias de Gimnasio',icon:'🏅',desc:'Cada nivel a partir del 5 te da una insignia; con 3 insignias eliges: objeto completo, 8 de oro o un Pokémon de coste 4.',
 on:{levelUp:c=>{ if(c.d.level<5) return; c.st.k=(c.st.k||0)+1; if(c.st.k>=3){ c.st.k=0; c.offer('Insignias de Gimnasio','Canjea tus 3 insignias',[{t:'Objeto completo',i:'⚒️',d:'Aleatorio',v:'f'},{t:'8 de oro',i:'💰',d:'',v:'g:8'},{t:'Pokémon de coste 4',i:'🐾',d:'Aleatorio',v:'uc:4'}]); } }},ui:c=>`Insignias: ${c.st.k||0}/3`});
AG({id:'maestro',tier:'P',cat:'fast',tags:['fast','trait'],name:'Maestro Pokémon',icon:'🎖️',desc:'La EXP que compras da +1 (5 por compra). Al llegar a nivel 9 eliges una de tus 3 sinergias principales: cuenta 1 Pokémon más el resto de la partida.',
 on:{select:c=>{ c.p.mods.xpBuy+=1; }, levelUp:c=>{ if(c.d.level<9||!c.once('m')) return; const n=traitCounts(c.p); const top=Object.keys(n).filter(t=>t!=='Legendario').sort((a,b)=>n[b]-n[a]).slice(0,3); if(top.length) c.offer('Maestro Pokémon','Elige la sinergia que cuenta 1 Pokémon más',top.map(t=>({t,i:TRAITS[t].icon,d:TRAITS[t].sum,v:t}))); },
  pick:c=>{ if(!TRAITS[c.d.v]) return; c.p.mods.extraTrait[c.d.v]=(c.p.mods.extraTrait[c.d.v]||0)+1; c.st.t=c.d.v; c.say(c.d.v+' cuenta 1 Pokémon más'); }},ui:c=>c.st.t?c.st.t+': +1 Pokémon':'EXP comprada: +1'});
AG({id:'crecimiento',tier:'S',cat:'fast',tags:['fast','win'],name:'Crecimiento Acelerado',icon:'📚',desc:'Cada victoria PvP te da 2 de EXP.',on:{win:c=>{ if(!c.d.pve){ c.xp(2); } }}});
AG({id:'camino_campeon',tier:'G',cat:'fast',tags:['fast'],name:'Camino del Campeón',icon:'🛤️',desc:'Recompensas al subir de nivel: 6 → componente · 7 → 5 de oro · 8 → objeto completo · 9 → Pokémon de coste 5.',
 on:{levelUp:c=>{ const L=c.d.level, R={6:'c',7:'g:5',8:'f',9:'uc:5'}; for(const l in R) if(L>=+l&&c.once('l'+l)) c.say(augGrant(c.p,R[l])); }}});
AG({id:'regalo_cumple',tier:'P',cat:'fast',tags:['fast'],req:p=>ST(2)(p),name:'Regalo de Cumpleaños',icon:'🎁',desc:'Cada vez que subes de nivel recibes un Pokémon de 2★. Su coste es tu nivel menos 4 (mínimo coste 1, máximo coste 5).',
 on:{levelUp:c=>{ const k=drawUnitOfCost(regaloCoste(c.d.level),threeStarSet(c.p)); if(k){ giveStar(c.p,k,2,true); c.say(`${nameOf(DEF[k],2)} ★★`); } }}});
function regaloCoste(nivel){ return Math.max(1,Math.min(5,nivel-4)); }

// ===== Rachas =====
AG({id:'invicto',tier:'G',cat:'streak',tags:['win'],ex:'racha',name:'Campeón Invicto',icon:'🏆',desc:'Rachas de victorias: 3 seguidas → 3 de oro · 5 → componente · 7 → objeto completo (cada premio una vez).',
 on:{win:c=>{ const s=c.p.streak, R={3:'g:3',5:'c',7:'f'}; for(const k in R) if(s>=+k&&c.once('s'+k)) c.say(`racha de ${k}: ${augGrant(c.p,R[k])}`); }},ui:c=>`Racha actual: ${Math.max(0,c.p.streak)}`});
AG({id:'rivalidad',tier:'G',cat:'streak',tags:['win','carry'],name:'Rivalidad Pokémon',icon:'🔥',desc:'Elige un Pokémon de tu tablero. Cada victoria seguida le da +6% de daño, +6 de poder y +60 de vida (máx. 8); al perder, se queda en la mitad.',
 req:p=>boardUnits(p).length>0,
 on:{select:c=>{ c.offer('Rivalidad','Elige a tu rival estrella',boardUnits(c.p).slice(0,4).map(u=>({t:`${nameOf(DEF[u.defId],u.star)} ${'★'.repeat(u.star)}`,i:'🔥',d:'',v:String(u.uid)}))); },
  pick:c=>{ c.st.uid=+c.d.v; c.st.n=0; c.say('rival elegido'); },
  win:c=>{ if(!c.d.pve&&c.st.uid){ c.st.n=Math.min(8,(c.st.n||0)+1); } }, lose:c=>{ c.st.n=Math.floor((c.st.n||0)/2); }},
 combat:(us,prm)=>{ const [k,n]=prm; const u=us.find(x=>x.bk===k); if(u) boost(u,{ad:.06*n,ap:6*n,hpf:60*n}); },
 snap:c=>{ const k=c.st.uid&&boardKeyOf(c.p,c.st.uid); return k&&c.st.n?[k,c.st.n]:null; },ui:c=>`Acumulado: ${c.st.n||0}/8`});
AG({id:'impulso',tier:'S',cat:'streak',tags:['win'],name:'Impulso Competitivo',icon:'🏃',desc:'Cada victoria da a tu equipo +4% de velocidad de ataque (máx. 5); una derrota lo reinicia.',
 on:{win:c=>{ c.st.n=Math.min(5,(c.st.n||0)+1); }, lose:c=>{ c.st.n=0; }},combat:(us,n)=>{ for(const u of us) boost(u,{as:.04*n}); },snap:c=>c.st.n||null,ui:c=>`Impulso: ${c.st.n||0}/5`});
AG({id:'racha_dorada',tier:'G',cat:'streak',tags:['win'],ex:'racha',name:'Racha Dorada',icon:'🌟',desc:'Cada vez que llegas a 4 victorias seguidas eliges: 10 de oro, 8 de EXP o +12% de daño de tu equipo durante 3 combates.',
 on:{win:c=>{ if(c.p.streak===4) c.offer('Racha Dorada','Has ganado 4 seguidas',[{t:'10 de oro',i:'💰',d:'',v:'g:10'},{t:'8 de EXP',i:'📚',d:'',v:'xp:8'},{t:'+12% de daño',i:'⚔️',d:'3 combates',v:'buff'}]); },
  pick:c=>{ if(c.d.v==='buff'){ c.st.left=3; c.say('+12% de daño 3 combates'); } else c.say(augGrant(c.p,c.d.v)); },
  roundEnd:c=>{ if(c.st.left>0) c.st.left--; }},combat:us=>{ for(const u of us) boost(u,{dmg:.12}); },snap:c=>c.st.left>0?1:null,ui:c=>c.st.left?`Daño extra: ${c.st.left} combates`:''});
AG({id:'regreso',tier:'G',cat:'streak',tags:['lose'],ex:'racha',name:'El Regreso del Entrenador',icon:'🔄',desc:'Cada derrota llena una reserva con 3 de oro (máx. 18) que cobras al ganar.',
 on:{lose:c=>{ c.st.res=Math.min(18,(c.st.res||0)+3); }, win:c=>{ if(c.st.res){ c.p.gold+=c.st.res; c.say(`cobras ${c.st.res} de oro`); c.st.res=0; } }},ui:c=>`Reserva: ${c.st.res||0}/18`});
AG({id:'revancha',tier:'S',cat:'streak',tags:['lose'],name:'Estrategia de Revancha',icon:'😤',desc:'Si pierdes contra un entrenador, tu equipo hace +15% de daño la próxima vez que te enfrentes a él.',
 on:{lose:c=>{ if(c.d.opp!=null) (c.st.foes=c.st.foes||[]).push(c.d.opp); }, combatStart:c=>{ c.st.now=c.d.opp!=null&&(c.st.foes||[]).includes(c.d.opp)?1:0; if(c.st.now) c.st.foes=c.st.foes.filter(x=>x!==c.d.opp); }},
 combat:us=>{ for(const u of us) boost(u,{dmg:.15}); },snap:c=>c.st.now?1:null});
AG({id:'voluntad',tier:'G',cat:'streak',tags:['lose'],name:'Voluntad de Hierro',icon:'💪',desc:'Con menos de 50 de vida, 1 tienda gratis por ronda; con menos de 25, 2.',
 on:{roundStart:c=>{ const n=c.p.hp<25?2:c.p.hp<50?1:0; if(n) c.p.freeRerolls+=n; }}});
AG({id:'ultima_ball',tier:'P',cat:'streak',tags:['lose'],name:'Última Poké Ball',icon:'🔴',desc:'Una sola vez: cuando tu vida baje de 30, eliges 1 de 3 Pokémon de coste 4 que llegan a 2★.',
 on:{damaged:c=>{ if(c.p.hp<30&&c.p.alive&&c.once('x')) c.offer('Última Poké Ball','Tu última oportunidad',unitOptions(c.p,u=>u.cost===4)); },
  pick:c=>{ const k=String(c.d.v).slice(2); if(DEF[k]){ const u=makeInst(k); u.star=2; addUnitToBench(c.p,u); c.say(`${DEF[k].name} 2★`); } }}});

// ===== Emblemas =====
const emblemOpts=(list,p)=>shuffle(list.filter(t=>TRAITS[t]).slice()).slice(0,3).map(t=>({t:'Emblema '+t,i:TRAITS[t].icon,d:TRAITS[t].sum,v:'em:'+t}));
AG({id:'emb_elemental',tier:'S',cat:'emblem',tags:['emblem'],name:'Mochila de Emblemas',icon:'🎒',desc:'Elige 1 de 3 emblemas de tipo. Un emblema añade su sinergia al Pokémon que lo lleve.',
 on:{select:c=>c.offer('Emblemas de tipo','Elige uno',emblemOpts(ELEM_TRAITS,c.p))}});
AG({id:'emb_clase',tier:'G',cat:'emblem',tags:['emblem'],name:'Insignias de Clase',icon:'🔰',desc:'Elige 1 de 3 emblemas de clase (Guardián, Coloso, Peleador, Tirador, Hechicero, Asesino, Sanador, Cazatesoros, Depredadores, Team Rocket, Potencial Evolutivo) y recibes 3 de oro.',
 on:{select:c=>{ c.p.gold+=3; c.offer('Emblemas de clase','Elige uno',emblemOpts(CLASS_TRAITS,c.p)); }}});
AG({id:'emb_doble',tier:'P',cat:'emblem',tags:['emblem'],name:'Doble Insignia',icon:'🎖️',desc:'Dos elecciones: un emblema de tipo y otro de clase, cada una entre 3.',
 on:{select:c=>{ c.offer('Emblema de tipo','Elige uno',emblemOpts(ELEM_TRAITS,c.p)); c.offer('Emblema de clase','Elige uno',emblemOpts(CLASS_TRAITS,c.p)); }}});
AG({id:'legado_arceus',tier:'P',cat:'rules',tags:['emblem','trait'],name:'Legado de Arceus',icon:'🌌',desc:'Elige una sinergia entre 3: cuenta 2 Pokémon más para el resto de la partida.',
 on:{select:c=>{ const top=elemTraitsOf(c.p).slice(0,2), opts=shuffle([...new Set([...top,...shuffle(ELEM_TRAITS.slice())])]).slice(0,3); c.offer('Legado de Arceus','Tu sinergia elegida cuenta +2',opts.map(t=>({t,i:TRAITS[t].icon,d:TRAITS[t].sum,v:t}))); },
  pick:c=>{ const t=c.d.v; if(TRAITS[t]){ c.p.mods.extraTrait[t]=(c.p.mods.extraTrait[t]||0)+2; c.st.t=t; c.say(`${t} +2`); } }},ui:c=>c.st.t?`${c.st.t} +2`:''});
AG({id:'medalla2',tier:'G',cat:'classic',w:.6,tags:['trait'],name:'Medalla de Plata',icon:'🥈',desc:'+1 a la sinergia de la que tienes más Pokémon.',
 on:{select:c=>{ const t=topTrait(c.p)||pick(ELEM_TRAITS); c.p.mods.extraTrait[t]=(c.p.mods.extraTrait[t]||0)+1; c.say(`+1 a ${t}`); }}});

// ===== Sinergias de tipo y de rol (combate) =====
AG({id:'combustion',tier:'S',cat:'trait',tags:['Fuego'],req:p=>(traitCounts(p).Fuego||0)>0,name:'Combustión',icon:'🔥',desc:'Tus Pokémon de Fuego hacen +12% de daño; con 4 o más, sus quemaduras duran el doble (+3% de vida máx./s extra).',
 combat:(us)=>{ const n=us.filter(u=>hasT(u,'Fuego')).length; for(const u of us) if(hasT(u,'Fuego')){ boost(u,{dmg:.12}); if(n>=4) u.burnPct+=.03; } }});
AG({id:'corriente',tier:'S',cat:'trait',tags:['Agua'],req:p=>(traitCounts(p).Agua||0)>0,name:'Corriente',icon:'🌊',desc:'Tus Pokémon de Agua empiezan con +25 de maná y escudo del 10% de su vida.',
 combat:us=>{ for(const u of us) if(hasT(u,'Agua')) boost(u,{mana:25,shield:u.maxHp*.1}); }});
AG({id:'fotosintesis',tier:'S',cat:'trait',tags:['Planta'],req:p=>(traitCounts(p).Planta||0)>0,name:'Fotosíntesis',icon:'🌿',desc:'Tus Pokémon de Planta regeneran +1% de vida por segundo y ganan +2% de vida por cada combate que sobrevivas (máx. +30%).',
 on:{survive:c=>{ if(c.d.n>0) c.st.n=Math.min(15,(c.st.n||0)+1); }},combat:(us,n)=>{ for(const u of us) if(hasT(u,'Planta')){ u.regen+=.01; boost(u,{hp:.02*n}); } },snap:c=>c.st.n||0,ui:c=>`Crecimiento: +${2*(c.st.n||0)}%`});
AG({id:'sobrecarga',tier:'S',cat:'trait',tags:['Eléctrico'],req:p=>(traitCounts(p)['Eléctrico']||0)>0,name:'Sobrecarga',icon:'⚡',desc:'Cada 3 ataques, tus Pokémon Eléctrico descargan un rayo a 3 enemigos (60 de daño mágico).',
 combat:us=>{ for(const u of us) if(hasT(u,'Eléctrico')) u.sp.zap=Math.max(u.sp.zap||0,60); }});
AG({id:'concentracion',tier:'G',cat:'trait',tags:['Psíquico'],req:p=>(traitCounts(p)['Psíquico']||0)>0,name:'Concentración',icon:'🔮',desc:'Las habilidades de tus Pokémon Psíquico cuestan un 20% menos de maná.',
 combat:us=>{ for(const u of us) if(hasT(u,'Psíquico')&&u.maxMana<9999) u.maxMana=Math.round(u.maxMana*.8); }});
AG({id:'espectro',tier:'G',cat:'trait',tags:['Fantasma'],req:p=>(traitCounts(p).Fantasma||0)>0,name:'Espectro',icon:'👻',desc:'Tus Pokémon Fantasma sobreviven una vez a un golpe letal y se vuelven invisibles 2 s.',
 combat:us=>{ for(const u of us) if(hasT(u,'Fantasma')){ u.focus=true; u.ghostFocus=true; } }});
AG({id:'linaje',tier:'P',cat:'trait',tags:['Dragón'],name:'Sangre de Dragón',icon:'🐉',desc:'Dragón cuenta 1 Pokémon más y tus Dragones ganan +25% de vida. Recibes un Pokémon Dragón aleatorio.',
 on:{select:c=>{ c.p.mods.extraTrait['Dragón']=(c.p.mods.extraTrait['Dragón']||0)+1; const opts=UNIT_LIST.filter(u=>u.traits.includes('Dragón')&&u.cost<=4&&G.pool[u.key]>0); if(opts.length){ const u=pick(opts); G.pool[u.key]--; giveUnitTo(c.p,u.key); } }},
 combat:us=>{ for(const u of us) if(hasT(u,'Dragón')) boost(u,{hp:.25}); }});
AG({id:'nocturnos',tier:'S',cat:'trait',tags:['Asesino','Siniestro'],name:'Cazadores Nocturnos',icon:'🌙',desc:'Tus Asesinos ganan +20% de prob. crítica; si además tienes 2 o más Siniestro, +15% de daño.',
 combat:us=>{ const dark=us.filter(u=>hasT(u,'Siniestro')).length>=2; for(const u of us) if(hasT(u,'Asesino')) boost(u,{crit:.2,dmg:dark?.15:0}); }});
AG({id:'ultima_linea',tier:'G',cat:'rules',tags:['Guardián','Sanador'],name:'Última Línea de Defensa',icon:'🧱',desc:'Si tienes un Sanador o un Hechicero en la última fila, tus Guardianes y tanques ganan +25 de defensa y resistencia y un escudo de 150.',
 combat:us=>{ const back=us.some(u=>u.bk&&u.bk.endsWith(',3')&&(hasT(u,'Sanador')||hasT(u,'Hechicero'))); if(back) for(const u of us) if(hasT(u,'Guardián')||u.role==='t') boost(u,{df:25,shield:150}); }});
AG({id:'formacion_kanto',tier:'G',cat:'rules',tags:['position'],name:'Formación de Kanto',icon:'🧭',desc:'Pokémon con 2 o más aliados al lado: +10% de daño. Pokémon sin ningún aliado al lado: +20% de velocidad de ataque.',
 combat:us=>{ for(const u of us){ const n=us.filter(o=>o!==u&&hexDist(o.c,o.r,u.c,u.r)===1).length; if(n>=2) boost(u,{dmg:.1}); else if(n===0) boost(u,{as:.2}); } }});
AG({id:'relampago',tier:'G',cat:'rules',tags:['Asesino'],name:'Ataque Relámpago',icon:'⚡',desc:'Las 2 primeras bajas que haga tu equipo en cada combate le dan +15% de velocidad de ataque al equipo entero.',
 combat:(us,prm,cb,side)=>{ let n=0; addKillHook(cb,side,()=>{ if(n++<2) for(const u of cb.units) if(u.side===side&&!u.dead) u.as=Math.min(3,u.as*1.15); }); }});
AG({id:'depredadores',tier:'G',cat:'rules',tags:['Asesino','carry'],name:'Instinto Salvaje',icon:'🦖',desc:'Cada baja da al que la hace +10% de daño de ataque y le cura un 15% de su vida (máx. 3 por Pokémon y combate).',
 combat:(us,prm,cb,side)=>{ addKillHook(cb,side,(cb2,src)=>{ if(!src||src.dead) return; src.predN=(src.predN||0)+1; if(src.predN<=3){ src.ad*=1.1; heal(src,src.maxHp*.15); } }); }});
AG({id:'cazadores',tier:'G',cat:'rules',tags:['carry'],name:'Equipo de Cazadores',icon:'🏹',desc:'Al empezar el combate se marca al enemigo con más vida: recibe +20% de daño. Derrotarlo da 2 de oro.',
 combat:(us,prm,cb,side)=>{ cb.huntPend=cb.huntPend||[]; cb.huntPend.push(side); addKillHook(cb,side,(cb2,src,t)=>{ if(t&&t.hunted===side&&!t.huntPaid){ t.huntPaid=1; cb.gold[side]=Math.min(12,cb.gold[side]+2); } }); }});
AG({id:'monotipo',tier:'P',cat:'trait',tags:['trait'],req:p=>elemTraitsOf(p).length>0,name:'Monotipo',icon:'🎨',desc:'Elige un tipo: cuenta 1 más y sus Pokémon ganan +20% de vida y daño; los que no son de ese tipo pierden un 10% de vida.',
 on:{select:c=>{ const ts=elemTraitsOf(c.p).slice(0,3); c.offer('Monotipo','Elige tu tipo',(ts.length?ts:shuffle(ELEM_TRAITS.slice()).slice(0,3)).map(t=>({t,i:TRAITS[t].icon,d:TRAITS[t].sum,v:t}))); },
  pick:c=>{ c.st.t=c.d.v; c.p.mods.extraTrait[c.d.v]=(c.p.mods.extraTrait[c.d.v]||0)+1; c.say(`tipo elegido: ${c.d.v}`); }},
 combat:(us,t)=>{ for(const u of us){ if(hasT(u,t)) boost(u,{hp:.2,ad:.2,ap:10}); else boost(u,{hp:-.1}); } },snap:c=>c.st.t||null,ui:c=>c.st.t?`Tipo: ${c.st.t}`:'Sin elegir'});
AG({id:'favorito',tier:'G',cat:'carry',tags:['carry'],req:p=>boardUnits(p).length>0,name:'Pokémon Favorito',icon:'💝',desc:'Elige un Pokémon de tu tablero: +30 de poder y gana +15 de vida permanente por cada ronda que siga en tu tablero.',
 on:{select:c=>c.offer('Pokémon Favorito','Elige a tu favorito',boardUnits(c.p).slice(0,4).map(u=>({t:`${nameOf(DEF[u.defId],u.star)} ${'★'.repeat(u.star)}`,i:'💝',d:'',v:String(u.uid)}))),
  pick:c=>{ c.st.uid=+c.d.v; c.say('favorito elegido'); }, roundStart:c=>{ if(c.st.uid&&boardKeyOf(c.p,c.st.uid)) c.st.n=Math.min(40,(c.st.n||0)+1); }},
 combat:(us,prm)=>{ const u=us.find(x=>x.bk===prm[0]); if(u) boost(u,{ap:30,hpf:15*prm[1]}); },snap:c=>{ const k=c.st.uid&&boardKeyOf(c.p,c.st.uid); return k?[k,c.st.n||0]:null; },ui:c=>c.st.uid?`${augUnitName(c.p,c.st.uid)}: +30 de poder y +${15*(c.st.n||0)} de vida (${c.st.n||0} rondas)`:'Sin elegir'});
AG({id:'academia',tier:'G',cat:'evo',tags:['reroll','evo'],name:'Academia Pokémon',icon:'🏫',desc:'Tus Pokémon de coste 1-2 ganan +15% de vida y daño por cada estrella por encima de 1.',
 combat:us=>{ for(const u of us) if(u.cost<=2&&u.star>1) boost(u,{hp:.15*(u.star-1),ad:.15*(u.star-1)}); }});
AG({id:'hiper_carry',tier:'P',cat:'carry',tags:['carry'],req:p=>boardUnits(p).length>0,name:'Mega Investigación',icon:'💠',desc:'Elige un Pokémon de tu tablero: +35% de daño, +35 de poder y +20% de velocidad de ataque. El resto de tu equipo pierde un 8% de vida.',
 on:{select:c=>c.offer('Mega Investigación','Elige a tu estrella',boardUnits(c.p).slice(0,4).map(u=>({t:`${nameOf(DEF[u.defId],u.star)} ${'★'.repeat(u.star)}`,i:'💠',d:'',v:String(u.uid)}))),pick:c=>{ c.st.uid=+c.d.v; c.say('Mega Investigación lista'); }},
 combat:(us,k)=>{ for(const u of us){ if(u.bk===k) boost(u,{ad:.35,ap:35,as:.2}); else boost(u,{hp:-.08}); } },snap:c=>(c.st.uid&&boardKeyOf(c.p,c.st.uid))||null});
AG({id:'apoyo',tier:'G',cat:'carry',tags:['Sanador','carry'],name:'Apoyo Incondicional',icon:'🤝',desc:'Tus Sanadores ganan +30 de poder y el aliado con más objetos gana +15% de velocidad de ataque.',
 combat:us=>{ let best=null; for(const u of us){ if(hasT(u,'Sanador')) boost(u,{ap:30}); if(!best||u.items.length>best.items.length) best=u; } if(best&&best.items.length) boost(best,{as:.15}); }});
AG({id:'cadena_evo',tier:'G',cat:'evo',tags:['evo'],name:'Herencia Elemental',icon:'⛓️',desc:'Cada vez que un Pokémon sube de estrellas, tu equipo gana un bonus permanente según su tipo (Fuego daño, Agua maná, Planta vida, Eléctrico velocidad, Psíquico poder; otros, defensa). Máx. 15.',
 on:{starUp:c=>{ const st=c.st; if((st.n||0)>=15) return; st.n=(st.n||0)+1; const t=DEF[c.d.key].traits.find(x=>ELEM_TRAITS.includes(x))||'Normal'; const k={Fuego:'ad',Agua:'mana',Planta:'hp',Eléctrico:'as','Psíquico':'ap'}[t]||'df'; st[k]=(st[k]||0)+1; c.say(`bonus de ${t}`); }},
 combat:(us,b)=>{ for(const u of us) boost(u,{ad:.02*(b.ad||0),mana:3*(b.mana||0),hp:.02*(b.hp||0),as:.02*(b.as||0),ap:3*(b.ap||0),df:2*(b.df||0)}); },
 snap:c=>c.st.n?{ad:c.st.ad||0,mana:c.st.mana||0,hp:c.st.hp||0,as:c.st.as||0,ap:c.st.ap||0,df:c.st.df||0}:null,ui:c=>{ const s=c.st, t=[['ad',2,'% de daño'],['mana',3,' de maná'],['hp',2,'% de vida'],['as',2,'% de vel. de ataque'],['ap',3,' de poder'],['df',2,' de defensa y resistencia']].filter(([k])=>s[k]).map(([k,m,x])=>`+${m*s[k]}${x}`); return `Tu equipo: ${t.length?t.join(', '):'aún nada'} (${s.n||0}/15)`; }});
AG({id:'entreno_diario',tier:'S',cat:'hybrid',tags:['win'],name:'Entrenamiento Diario',icon:'🏋️',desc:'Cada victoria da a tu equipo +1% de vida, +1% de ataque y +1 de poder permanentes (máx. 15).',
 on:{win:c=>{ c.st.n=Math.min(15,(c.st.n||0)+1); }},combat:(us,n)=>{ for(const u of us) boost(u,{hp:.01*n,ad:.01*n,ap:n}); },snap:c=>c.st.n||null,ui:c=>`Tu equipo: +${c.st.n||0}% de vida y de ataque y +${c.st.n||0} de poder (${c.st.n||0}/15)`});
AG({id:'dominio',tier:'G',cat:'trait',tags:['trait'],name:'Dominio Elemental',icon:'🌀',desc:'La primera vez que un tipo llega a su 2.º nivel al empezar un combate, eliges: su emblema, 8 de oro o un objeto completo (2 veces).',
 on:{combatStart:c=>{ const st=c.st; if((st.n||0)>=2) return; const tt=traitTiers(c.p); for(const t of ELEM_TRAITS) if((tt[t]||0)>=2&&c.once('t'+t)){ st.n=(st.n||0)+1; c.offer('Dominio Elemental',`${t} en su 2.º nivel`,[{t:'Emblema '+t,i:TRAITS[t].icon,d:'',v:'em:'+t},{t:'8 de oro',i:'💰',d:'',v:'g:8'},{t:'Objeto completo',i:'⚒️',d:'',v:'f'}]); break; } }},ui:c=>`Usos: ${c.st.n||0}/2`});

// ===== Riesgo =====
AG({id:'pacto_rocket',tier:'G',cat:'risk',tags:['fast'],name:'Pacto del Team Rocket',icon:'📜',desc:'Préstamo: ahora 10 de EXP y 8 de oro. Durante las 4 rondas siguientes pagas 3 de oro por ronda, y cada derrota PvP mientras debes alarga la deuda una ronda (máx. 6).',
 on:{select:c=>{ c.xp(10); c.p.gold+=8; c.st.debt=4; }, roundStart:c=>{ if(c.st.debt>0){ c.st.debt--; c.p.gold=Math.max(0,c.p.gold-3); } }, lose:c=>{ if(!c.d.pve&&c.st.debt>0) c.st.debt=Math.min(6,c.st.debt+1); }},ui:c=>c.st.debt?`Deuda: ${c.st.debt} rondas de 3 de oro`:'Pagado'});
AG({id:'poder_prohibido',tier:'G',cat:'risk',name:'Poder Prohibido',icon:'☠️',desc:'Tus 3 próximos combates: +30% de daño. Los 2 siguientes: −15% de daño.',
 on:{select:c=>{ c.st.k=5; }, roundEnd:c=>{ if(c.st.k>0) c.st.k--; }},combat:(us,k)=>{ for(const u of us) boost(u,{dmg:k>2?.3:-.15}); },snap:c=>c.st.k>0?c.st.k:null,ui:c=>c.st.k>2?`Poder: ${c.st.k-2} combates`:c.st.k>0?`Debilidad: ${c.st.k} combates`:'Terminado'});
AG({id:'extremo',tier:'S',cat:'risk',tags:['carry'],req:p=>boardUnits(p).length>0,name:'Entrenamiento Extremo',icon:'🥊',desc:'Elige un Pokémon: cada ronda gana +3% de daño, +3 de poder y +40 de vida permanentes (máx. 10). Coste: −1 de oro por ronda.',
 on:{select:c=>c.offer('Entrenamiento Extremo','¿A quién entrenas?',boardUnits(c.p).slice(0,4).map(u=>({t:`${nameOf(DEF[u.defId],u.star)} ${'★'.repeat(u.star)}`,i:'🥊',d:'',v:String(u.uid)}))),
  pick:c=>{ c.st.uid=+c.d.v; c.p.mods.income-=1; }, roundStart:c=>{ if(c.st.uid&&boardKeyOf(c.p,c.st.uid)) c.st.n=Math.min(10,(c.st.n||0)+1); }},
 combat:(us,prm)=>{ const u=us.find(x=>x.bk===prm[0]); if(u) boost(u,{ad:.03*prm[1],ap:3*prm[1],hpf:40*prm[1]}); },snap:c=>{ const k=c.st.uid&&boardKeyOf(c.p,c.st.uid); return k?[k,c.st.n||0]:null; },ui:c=>{ const n=c.st.n||0; return c.st.uid?`${augUnitName(c.p,c.st.uid)}: +${3*n}% de daño, +${3*n} de poder y +${40*n} de vida (${n}/10)`:'Sin elegir'; }});

// ===== Misiones =====
AG({id:'proyecto_mew',tier:'P',cat:'quest',tags:['trait'],name:'Proyecto Mew',icon:'🧬',desc:'Misión: al empezar un combate con 4 tipos distintos en el tablero → 2 componentes; con 6 → 10 de oro y un objeto completo a elegir; con 8 → Mewtwo y 2 componentes.',
 on:{combatStart:c=>{ const n=new Set(boardUnits(c.p).flatMap(u=>unitTraits(u)).filter(t=>ELEM_TRAITS.includes(t))).size; c.st.best=Math.max(c.st.best||0,n);
   if(n>=4&&c.once('4')){ c.comp(); c.comp(); c.say('fase 1: 2 componentes'); } if(n>=6&&c.once('6')){ c.p.gold+=10; c.offer('Proyecto Mew','Elige un objeto completo',shuffle(FULL_KEYS.slice()).slice(0,3).map(k=>({t:ITEMS[k].name,i:ITEMS[k].icon,d:ITEMS[k].desc,v:'it:'+k}))); c.say('fase 2: 10 de oro y objeto a elegir'); }
   if(n>=8&&c.once('8')){ if(G.pool.mewtwo>0) G.pool.mewtwo--; giveUnitTo(c.p,'mewtwo'); c.comp(); c.comp(); c.say('¡fase final: Mewtwo y 2 componentes!'); } }},ui:c=>`Mejor: ${c.st.best||0} tipos (4/6/8)`});
AG({id:'campeon_sinnoh',tier:'P',cat:'quest',tags:['win'],name:'Campeón de Sinnoh',icon:'🏔️',desc:'Victorias PvP totales: 3 → componente · 6 → objeto completo · 9 → +1 espacio en el tablero.',
 on:{win:c=>{ if(c.d.pve) return; c.st.w=(c.st.w||0)+1; const w=c.st.w; if(w>=3&&c.once('3')){ c.comp(); c.say('componente'); } if(w>=6&&c.once('6')){ c.full(); c.say('objeto completo'); } if(w>=9&&c.once('9')){ c.p.mods.boardBonus+=1; c.say('+1 espacio en el tablero'); } }},ui:c=>`Victorias: ${c.st.w||0}/9`});
AG({id:'equipo_imposible',tier:'P',cat:'trait',tags:['Legendario'],name:'Equipo Imposible',icon:'✨',desc:'Recibes un Legendario aleatorio. Tus Legendarios ganan +25% de vida y daño y Legendario cuenta como sinergia completa.',
 on:{select:c=>{ c.unit(5); c.p.mods.legend+=.25; }},combat:us=>{ for(const u of us) if(hasT(u,'Legendario')) boost(u,{ap:20}); }});

// ===== Caos =====
// Solo en el 3.er aumento (4-2): premio grande y al azar (ver CHAOS)
AG({id:'llamada_caos',tier:'P',cat:'chaos',tags:['chaos'],req:()=>!!(G.round&&G.round.s>=4),name:'Llamada al Caos',icon:'🌪️',desc:'Obtienes una recompensa poderosa y aleatoria.\nRecompensa: ¿¿??',
 on:{select:c=>chaosRoll(c,true)},ui:c=>`Recompensa: ${c.st.r||'¿¿??'}`+(c.st.egg>0?` · Huevo de Oro en ${c.st.egg} rondas`:'')});
AG({id:'eco_caos',tier:'G',cat:'chaos',tags:['chaos'],req:()=>!!(G.round&&G.round.s>=4),name:'Eco del Caos',icon:'🌀',desc:'Obtienes una recompensa grande y aleatoria.\nRecompensa: ¿¿??',
 on:{select:c=>chaosRoll(c,false)},ui:c=>`Recompensa: ${c.st.r||'¿¿??'}`});

// Sinergias del jugador de más a menos Pokémon (sin Legendario)
const traitList=p=>{ const c=traitCounts(p); return Object.keys(c).filter(t=>t!=='Legendario'&&TRAITS[t]).sort((a,b)=>c[b]-c[a]); };

// ===== Nuevos (inspirados en TFT, al estilo Pokémon) =====
// Unidos Venceremos: emblema de una sinergia al azar, un objeto completo a elegir y +30% de vel. de ataque a los de esa sinergia
AG({id:'unidos',tier:'G',cat:'emblem',tags:['emblem','trait'],name:'Unidos Venceremos',icon:'🤝',desc:'Recibes el emblema de una sinergia al azar y un Yunque de objetos (véndelo y eliges 1 de 6 objetos completos). Tus Pokémon de esa sinergia ganan +30% de velocidad de ataque.',
 on:{select:c=>{ const t=pick([...ELEM_TRAITS,...CLASS_TRAITS].filter(x=>ITEMS['emb_'+x])); c.st.t=t; c.item('emb_'+t); c.say(`emblema ${t}`);
   c.say(giveAnvil(c.p,'f')); }},
 combat:(us,t)=>{ for(const u of us) if(hasT(u,t)) boost(u,{as:.3}); },snap:c=>c.st.t||null,ui:c=>c.st.t?`${c.st.t}: +30% de vel. de ataque`:''});
// Dados Cargados: el dado siempre sale 6 y la moneda, cara; y tus Pokémon que generan oro dan 1 más cada vez
AG({id:'dados',tier:'S',cat:'econ',tags:['Cazatesoros'],name:'Dados Cargados',icon:'🎲',desc:'Tiras un dado trucado (siempre sale 6) y una moneda (siempre cara): 7 de oro. Además, los Pokémon que generan oro con su habilidad (Persian, Gholdengo…) dan 1 más cada vez y el botín de Cazatesoros da 2 de oro más.',
 on:{select:c=>{ c.p.gold+=7; c.p.mods.lucky=1; c.say('¡6 y cara! 7 de oro'); }},
 combat:us=>{ for(const u of us) if(u.ab&&u.ab[2]&&u.ab[2].g) u.payDay=(u.payDay||0)+1; },snap:()=>1});
// Llamada del Clan (como la Llamada de Blossom): al comprar un Pokémon barato de tu sinergia elegida, llega otro de esa sinergia, más caro cuanto más avanzada la partida
const CLAN_COST=s=>s<=4?[1,3]:s===5?[2,4]:[3,5];
AG({id:'llamada_clan',tier:'G',cat:'trait',tags:['trait','reroll'],req:p=>!!(G.round&&G.round.s>=3)&&elemTraitsOf(p).length+traitList(p).length>0,name:'Llamada del Clan',icon:'📯',desc:'Elige una de tus sinergias principales. Cada vez que compras un Pokémon de coste 1 o 2 de esa sinergia, recibes otro Pokémon de esa sinergia al azar: de coste 1-3 en la fase 4, 2-4 en la 5 y 3-5 desde la 6.',
 on:{select:c=>{ const ts=traitList(c.p).slice(0,3); c.offer('Llamada del Clan','Elige la sinergia que llama a los suyos',ts.map(t=>({t,i:TRAITS[t].icon,d:TRAITS[t].sum,v:t}))); },
  pick:c=>{ c.st.t=c.d.v; c.say(`clan elegido: ${c.d.v}`); },
  buy:c=>{ const t=c.st.t; if(!t||c.d.cost>2||!DEF[c.d.key].traits.includes(t)) return; const [lo,hi]=CLAN_COST(G.round?G.round.s:4);
   const pool=UNIT_LIST.filter(u=>u.traits.includes(t)&&u.cost>=lo&&u.cost<=hi&&(!G.pool||G.pool[u.key]>0)); const near=pool.length?pool:UNIT_LIST.filter(u=>u.traits.includes(t)&&(!G.pool||G.pool[u.key]>0));
   const u=near.length&&pick(near); if(u){ augGrant(c.p,'u:'+u.key); c.say(`llega ${u.name}`); } }},
 ui:c=>c.st.t?`Clan: ${c.st.t}`:'Sin elegir'});
// Zona Safari (como Expedición): cada ronda el último Pokémon de tu banquillo se va de expedición; con 33 de oro enviados vuelven con un gran premio
const pokeValue=u=>DEF[u.defId].cost*Math.pow(3,u.star-1);
AG({id:'safari',tier:'G',cat:'slow',tags:['slow'],name:'Zona Safari',icon:'🧭',desc:'Al empezar cada ronda, el Pokémon del último hueco ocupado de tu banquillo se va de expedición al Safari. Cuando hayas enviado Pokémon por valor de 33 de oro, vuelven con: 15 de oro, 2 Pokémon de coste 5, un componente a elegir y un emblema a elegir.',
 on:{roundStart:c=>{ const st=c.st; if(st.done) return; const b=c.p.bench; let i=b.length-1; while(i>=0&&!b[i]) i--; if(i<0) return;
   const u=b[i]; b[i]=null; st.sent=(st.sent||0)+pokeValue(u); returnToPool(u.baseId,Math.pow(3,u.star-1)); for(const it of u.items) giveItem(c.p,it); c.say(`${nameOf(DEF[u.defId],u.star)} se va al Safari (${st.sent}/33)`);
   if(st.sent>=33){ st.done=1; c.p.gold+=15; augGrant(c.p,'uc:5'); augGrant(c.p,'uc:5'); c.offer('Zona Safari','Elige un componente',shuffle(BASIC.filter(k=>k!=='medal')).slice(0,3).map(k=>({t:ITEMS[k].name,i:ITEMS[k].icon,d:ITEMS[k].desc,v:'it:'+k})));
     c.offer('Zona Safari','Elige un emblema',emblemOpts([...ELEM_TRAITS,...CLASS_TRAITS],c.p)); revealTo(c.p,'🧭','Zona Safari','¡Vuelve la expedición!','15 de oro, 2 Pokémon de coste 5, un componente y un emblema a elegir.','bueno'); } }},
 ui:c=>c.st.done?'Expedición completada':`Enviado: ${c.st.sent||0}/33 de oro`});
// Cimientos de Vanguardia: un Pokémon de primera línea de coste 1 a 2★ y el emblema de su clase
AG({id:'vanguardia',tier:'S',cat:'carry',tags:['Guardián','Coloso'],name:'Cimientos de Vanguardia',icon:'🛡️',desc:'Recibes un Pokémon de primera línea de coste 1 a 2★ y un emblema de su clase.',
 on:{select:c=>{ const opts=UNIT_LIST.filter(u=>u.cost===1&&(u.role==='t'||u.role==='b')&&u.traits.some(t=>CLASS_TRAITS.includes(t))); const u=pick(opts); giveStar(c.p,u.key,2);
   const t=u.traits.find(x=>CLASS_TRAITS.includes(x)); c.item('emb_'+t); c.say(`${nameOf(u,2)} ★★ y emblema ${t}`); }}});

// ===== Clásicos (estadísticas y recursos directos) =====
AG({id:'pacto_cruel',tier:'S',cat:'fast',tags:['fast'],name:'Pacto Cruel',icon:'🩸',desc:'Comprar EXP te cuesta 2 de vida en lugar de oro mientras tengas más de 20 de vida.',on:{select:c=>{ c.p.mods.xpHp=2; }}});
AG({id:'pandora',tier:'S',cat:'risk',name:'Objetos de Pandora',icon:'📦',desc:'Recibes 1 componente. Al empezar cada ronda, los objetos de tu inventario cambian al azar por otros de su tipo: componentes por componentes, completos por completos, insignias por otras insignias y emblemas por otros emblemas (p. ej. el Emblema Acero puede volverse Emblema Agua).',
 on:{select:c=>c.comp(),roundStart:c=>{ c.p.items=c.p.items.map(pandoraCambio); }}});
// Objetos de Pandora: cada objeto cambia por otro de su familia; insignias y emblemas siempre por uno distinto
function pandoraCambio(k){
 if(BASIC.includes(k)) return pick(BASIC);
 if(FULL_KEYS.includes(k)) return pick(FULL_KEYS);
 const fam=/^em_/.test(k)?'em_':/^emb_/.test(k)?'emb_':null; if(!fam) return k;
 const otros=Object.keys(ITEMS).filter(x=>x.startsWith(fam)&&x!==k&&!(fam==='em_'&&x.startsWith('emb_')));
 return otros.length?pick(otros):k;
}
AG({id:'ticket_dorado',tier:'P',cat:'reroll',tags:['reroll'],name:'Ticket Prismático',icon:'🎫',desc:'Cada refresco de pago tiene un 40% de probabilidad de salirte gratis (te devuelve los 2 de oro).',
 on:{reroll:c=>{ if(!c.d.free&&Math.random()<.4){ c.p.gold+=2; c.st.n=(c.st.n||0)+1; } }},ui:c=>`Refrescos gratis: ${c.st.n||0}`});
AG({id:'aguante',tier:'G',cat:'classic',w:.5,name:'Aguante',icon:'🎀',desc:'Cada aliado sobrevive una vez a un golpe letal.',on:{select:c=>{ c.p.mods.allFocus=true; }}});
// Antes daban un solo Pokémon de coste 4 (o un Legendario): poco para un aumento. Ahora eliges y llega casi formado
AG({id:'ultraball',tier:'G',cat:'classic',w:.5,name:'Ultra Ball',icon:'🟡',desc:'Elige 1 de 3 Pokémon de coste 4: recibes 2 copias y un componente.',
 on:{select:c=>{ c.comp(); c.offer('Ultra Ball','Elige un Pokémon de coste 4: recibes 2 copias',unitOptions(c.p,u=>u.cost===4)); },
  pick:c=>{ const k=String(c.d.v).slice(2); if(!DEF[k]) return; for(let i=0;i<2;i++) augGrant(c.p,'u:'+k); c.say(`2 × ${DEF[k].name}`); }}});
// Escalera de Sinergias (como la Trait Ladder de TFT): tras cada combate PvP, si tienes activas al menos N sinergias que no son
// únicas, recibes el premio de ese escalón y N sube en 1. Cuantas más sinergias activas metas, mejores premios.
const LADDER_COMPS=()=>shuffle(BASIC.filter(k=>k!=='medal')).slice(0,3).map(k=>({t:ITEMS[k].name,i:ITEMS[k].icon,d:ITEMS[k].desc,v:'it:'+k}));
const LADDER={2:'Imán Removedor',3:'3 de oro',4:'5 de oro',5:'un componente',6:'7 de oro o 2 Pokémon de coste 3',7:'2 de oro y un Yunque de componentes',8:'2 componentes o un Yunque de objetos',
 9:'2 de oro y 2 Pokémon de coste 5',10:'18 de oro',11:'una Medalla Maestra (+1 espacio)',12:'3 Pokémon de coste 4 y 6 de oro',13:'8 de oro y 4 componentes',14:'10 de oro y un emblema a elegir'};
function ladderReward(c,n){ const g=v=>augGrant(c.p,v);
 switch(n){ case 2: g('it:magnet'); break; case 3: g('g:3'); break; case 4: g('g:5'); break; case 5: g('c'); break;
  case 6: if(Math.random()<.5) g('g:7'); else { g('uc:3'); g('uc:3'); } break; case 7: g('g:2'); giveAnvil(c.p,'c'); break;
  case 8: if(Math.random()<.57){ g('c'); g('c'); } else giveAnvil(c.p,'f'); break; case 9: g('g:2'); g('uc:5'); g('uc:5'); break; case 10: g('g:18'); break;
  case 11: g('it:master'); break; case 12: g('uc:4'); g('uc:4'); g('uc:4'); g('g:6'); break; case 13: g('g:8'); for(let i=0;i<4;i++) g('c'); break;
  default: g('g:10'); c.offer('Escalera de Sinergias','Elige un emblema',emblemOpts(Object.keys(TRAITS).filter(t=>t!=='Legendario'),c.p)); }
 c.say(`${n} sinergias activas: ${LADDER[n]||LADDER[14]}`); }
const ladderCount=p=>{ const Tt=traitTiers(p); return Object.keys(Tt).filter(t=>t!=='Legendario'&&Tt[t]>0&&TRAITS[t]&&TRAITS[t].bp[0]>1).length; };
AG({id:'escalera',tier:'G',cat:'trait',tags:['trait','emblem'],name:'Escalera de Sinergias',icon:'🪜',desc:'Recibes un emblema al azar. Tras cada combate PvP con al menos 2 sinergias activas (no únicas), ganas un premio; después hace falta 1 sinergia más y el premio crece: 3 → 3 de oro · 5 → componente · 8 → 2 componentes u objeto completo · 10 → 18 de oro · 12 → 3 Pokémon de coste 4 · 14 → emblema y 10 de oro.',
 on:{select:c=>{ const t=pick(Object.keys(TRAITS).filter(x=>x!=='Legendario'&&ITEMS['emb_'+x])); c.item('emb_'+t); c.st.need=2; c.say(`emblema ${t}`); },
  roundEnd:c=>{ if(c.d.pve) return; const n=ladderCount(c.p), need=c.st.need||2; c.st.best=Math.max(c.st.best||0,n); if(n>=need&&need<=14){ ladderReward(c,need); c.st.need=need+1; } }},
 ui:c=>{ const need=c.st.need||2; return need>14?'Escalera completada':`Siguiente: ${need} sinergias → ${LADDER[need]} (ahora tienes ${ladderCount(c.p)})`; }});
AG({id:'corona_maldita',tier:'P',cat:'risk',name:'Corona Maldita',icon:'👑',desc:'+2 espacios en el tablero para el resto de la partida, pero cada derrota te quita el doble de vida.',
 on:{select:c=>{ c.p.mods.boardBonus+=2; },damaged:c=>{ if(c.d.d>0){ c.p.hp-=c.d.d; c.say(`la corona te quita ${c.d.d} de vida más`); } }}});
AG({id:'master',tier:'P',cat:'classic',w:.5,name:'Master Ball',icon:'🟣',desc:'Elige 1 de 3 Legendarios y recibes 2 componentes.',
 on:{select:c=>{ c.comp(); c.comp(); c.offer('Master Ball','Elige un Legendario',unitOptions(c.p,u=>u.cost===5)); }}});
AG({id:'forja_portatil',tier:'P',cat:'rules',name:'Forja Portátil',icon:'⚒️',desc:'Elige un objeto completo entre 4 y, después, otro entre otros 4.',
 on:{select:c=>{ for(let i=0;i<2;i++) c.offer('Forja Portátil','Elige un objeto completo',shuffle(FULL_KEYS.slice()).slice(0,4).map(k=>({t:ITEMS[k].name,i:ITEMS[k].icon,d:ITEMS[k].desc,v:'it:'+k}))); }}});

/* ---------- Aumentos de héroe: te dan el Pokémon y potencian solo a esa especie (y sus evoluciones) ---------- */
const isHero=(u,k)=>!!u.d&&u.d.key===k;
// Nombre del Pokémon que sigue un aumento (por uid), para los contadores
const augUnitName=(p,uid)=>{ const u=allUnits(p).find(x=>x.uid===uid); return u?`${nameOf(DEF[u.defId],u.star)} ${'★'.repeat(u.star)}`:'(ya no está)'; };
// Da un Pokémon de n estrellas sacando del pool las copias que haría falta juntar
function giveStar(p,k,star,drawn){ const need=Math.pow(3,star-1)-(drawn?1:0); if(G.pool&&k in G.pool) G.pool[k]=Math.max(0,G.pool[k]-need); const u=makeInst(k); u.star=star; if(p.bench.some(x=>!x)) addUnitToBench(p,u); else { p.gold+=DEF[k].cost*Math.pow(3,star-1); note(p,`Banquillo lleno: ${DEF[k].name} se convirtió en oro`); } }
// Solo salen en 2-1 y 3-2 (ver augmentChoices). En 3-2 (fase 3) llegan mejorados: el Pokémon directamente a 2★ (y Gyarados, además, con un componente)
// Héroe consagrado: a 3★ su línea gana además +20% de vida y de ataque y +20 de poder, para que subirlo valga la pena.
// evo: a 2★ ya usa la habilidad de su última forma (la intermedia era la más floja: Maldición, Telequinesis, Sísmico, Lanzallamas)
const HERO3={hp:.2,ad:.2,ap:20};
const HERO=(o,k,n,star)=>{ const cf=o.combat; o.combat=(us,...a)=>{ if(o.evo) for(const u of heroes(us,k)) if(u.star===2&&u.d.ab.length>2) u.ab=u.d.ab[u.d.ab.length-1]; if(cf) cf(us,...a); for(const u of heroes(us,k)) if(u.star>=3) boost(u,HERO3); };
 if(o.evo) o.desc+=` A ★★ ya usa ${o.evo}, la habilidad de su última forma.`;
 o.desc+=` A ★★★, además +${HERO3.hp*100}% de vida y de ataque y +${HERO3.ap} de poder.`;
 return AG(Object.assign({cat:'carry',w:.8},o,{tags:['carry','hero'],hero:k,on:Object.assign({select:c=>{ const late=G.round&&G.round.s>=3;
  if(late){ giveStar(c.p,k,2); if(star>=2) c.comp(); c.say(`recibes ${nameOf(DEF[k],2)} ★★${star>=2?' y un componente':''}`); return; }
  if(star>1) giveStar(c.p,k,star); else for(let i=0;i<n;i++){ if(G.pool&&G.pool[k]>0) G.pool[k]--; giveUnitTo(c.p,k); } c.say(`recibes ${n>1?n+' × ':''}${nameOf(DEF[k],star||1)}`); }},o.on||{})})); };
const heroes=(us,k)=>us.filter(u=>isHero(u,k));
HERO({id:'h_gengar',evo:'Bola Sombra',tier:'P',name:'Banquete de Almas',icon:'👻',desc:'Recibes 2 Gastly (en 3-2, un Haunter ★★). Tu línea de Gengar empieza con +30 de poder y 20 de maná, gana +10 de poder y +10% de ataque con cada lanzamiento y cada enemigo que cae en combate le da +15 de poder, +15% de ataque y 20 de maná y le cura un 8% de su vida.',
 combat:(us,prm,cb,side)=>{ const hs=heroes(us,'gastly'); if(!hs.length) return; for(const u of hs){ u.ap+=30; u.mana+=20; u.castAp=(u.castAp||0)+10; } addKillHook(cb,side,()=>{ for(const u of hs) if(!u.dead){ u.ap+=15; u.ad+=u.ad0*.15; heal(u,u.maxHp*.08); if(u.maxMana<9999) u.mana+=20; } }); }},'gastly',2);
HERO({id:'h_gyarados',tier:'P',name:'El Elegido',icon:'🐉',desc:'Recibes un Gyarados (Magikarp ★★; en 3-2, además un componente). Tus Gyarados ganan +40% de vida y de ataque y 15% de omnivampirismo y, al bajar del 50% de vida, entran en Furia: +100% de vel. de ataque el resto del combate.',
 combat:us=>{ for(const u of heroes(us,'magikarp')) if(u.star>=2){ boost(u,{hp:.4,ad:.4}); u.omni+=.15; u.lowRage=1; } }},'magikarp',1,2);
HERO({id:'h_clefable',tier:'P',name:'Precisión Lunar',icon:'🌙',desc:'Recibes 2 Cleffa (en 3-2, un Clefairy ★★). Tu línea de Clefable cambia su habilidad por Rayo Lunar: daña al objetivo y cura a los aliados más heridos a la vez, con daño y curación críticos (+50% de prob. crítica y +30% de daño crítico), +25 de poder y +20% de fuerza con cada lanzamiento. Empieza con 30 de maná.',
 // Rayo Lunar en lugar de su habilidad: antes solo curaba y escudaba, y la zona de Clefairy caía sobre ella misma
 combat:us=>{ for(const u of heroes(us,'cleffa')){ u.ab=['lunar','Rayo Lunar',{m:1.35,heal:.65,n:u.star>=3?3:2,grow:.2}]; u.healCrit=true; u.critAbil=true; u.critC+=.5; u.critM+=.3; u.ap+=25; u.mana+=30; } }},'cleffa',2);
HERO({id:'h_alakazam',evo:'Premonición',tier:'G',name:'Fuerza Creciente',icon:'🥄',desc:'Recibes 2 Abra (en 3-2, un Kadabra ★★). Tu línea de Alakazam empieza con 25 de maná, gana +5 de poder y +5% de ataque permanentes por cada ronda que pase, y +12 de poder y +12% de ataque cada vez que lanza su habilidad en combate.',
 on:{roundStart:c=>{ c.st.n=(c.st.n||0)+1; }},snap:c=>c.st.n||0,ui:c=>`Tu línea de Alakazam: +${5*(c.st.n||0)} de poder y +${5*(c.st.n||0)}% de ataque permanentes, y +12 por cada lanzamiento`,
 combat:(us,n)=>{ for(const u of heroes(us,'abra')){ u.ap+=5*(+n||0); u.ad+=u.ad0*.05*(+n||0); u.castAp=(u.castAp||0)+12; u.mana+=25; } }},'abra',2);
HERO({id:'h_raichu',tier:'G',name:'¡Emocionado!',icon:'⚡',desc:'Recibes 2 Pichu (en 3-2, un Pikachu ★★). Tu línea de Raichu empieza con +25% de vel. de ataque y, cada vez que consigue una baja, se emociona: +100% de vel. de ataque durante 3 s y +20 de maná.',
 combat:(us,prm,cb,side)=>{ const hs=heroes(us,'pichu'); if(!hs.length) return; for(const u of hs) boost(u,{as:.25}); addKillHook(cb,side,(cb2,src)=>{ if(src&&isHero(src,'pichu')&&!src.dead){ src.rushMul=Math.max(src.rushT>0?src.rushMul||1:1,2); src.rushT=3; if(src.maxMana<9999) src.mana+=20; fxText(cb2,src,'¡Emocionado!','#ffe066'); } }); }},'pichu',2);
HERO({id:'h_machamp',evo:'Puño Dinámico',tier:'G',name:'Furia Creciente',icon:'💪',desc:'Recibes 2 Machop (en 3-2, un Machoke ★★). Tu línea de Machamp gana +25% de vida, +30% de ataque y 15% de omnivampirismo, cada ataque le da +7% de vel. de ataque sin límite durante el combate y empieza con 40 de maná.',
 combat:us=>{ for(const u of heroes(us,'machop')){ boost(u,{hp:.25,ad:.3}); u.omni+=.15; u.sp.rage=(u.sp.rage||0)+.07; u.mana+=40; } }},'machop',2);
HERO({id:'h_lucario',tier:'G',name:'Aura Implacable',icon:'🔵',desc:'Recibes un Riolu (en 3-2, un Lucario ★★). Tu Lucario lanza su habilidad dos veces y gana +15 de poder.',
 combat:us=>{ for(const u of heroes(us,'riolu')){ u.echo=true; u.ap+=15; } }},'riolu',1);
HERO({id:'h_charizard',evo:'Llamarada',tier:'G',name:'Calor Acumulado',icon:'🔥',desc:'Recibes 2 Charmander (en 3-2, un Charmeleon ★★). Tu línea de Charizard empieza con +15% de ataque y 30 de maná, gana +5% de daño por segundo de combate (máx. +100%) y sus ataques queman un 3% de vida máx. por segundo.',
 combat:us=>{ for(const u of heroes(us,'charmander')){ boost(u,{ad:.15}); u.mana+=30; u.dragonRamp=(u.dragonRamp||0)+.05; u.dragonCap=(u.dragonCap||0)+1; u.burnPct+=.03; } }},'charmander',2);
HERO({id:'h_meowth',tier:'G',name:'Día de Pago',icon:'🪙',desc:'Recibes 2 Meowth (en 3-2, un Persian ★★). Su Día de Pago da 1 de oro más, cada victoria con un Meowth o Persian en el tablero te da 2 de oro y tu línea de Persian gana +1% de ataque y +1 de poder por cada 2 de oro que tengas (máx. +25%).',
 on:{win:c=>{ if(boardUnits(c.p).some(u=>u.defId==='meowth')){ c.p.gold+=2; c.say('+2 de oro'); } }},snap:c=>Math.min(50,c.p.gold||0),ui:c=>`Tu línea de Persian: +${Math.floor(Math.min(50,c.p.gold||0)/2)}% de ataque y de poder por tu oro`,
 combat:(us,g)=>{ const b=Math.floor(Math.min(50,+g||0)/2); for(const u of heroes(us,'meowth')){ u.payDay=1; boost(u,{ad:b/100,ap:b}); } }},'meowth',2);
HERO({id:'h_ditto',tier:'G',name:'Adaptación Perfecta',icon:'🟣',desc:'Recibes un Ditto (en 3-2, ★★). Al empezar el combate se transforma en el enemigo más caro: copia su habilidad y se queda con lo mejor de cada estadística (vida, ataque, poder, velocidad, defensa y resistencia), gana un 10% de reducción de daño y empieza con el maná lleno.',
 combat:(us,prm,cb,side)=>{ const hs=heroes(us,'ditto'); if(!hs.length) return; (cb.startFns=cb.startFns||[]).push(cb2=>{ const e=cb2.units.filter(x=>x.side!==side&&!x.dead&&!x.creep&&x.ab&&x.ab[0]!=='copy').sort((a,b)=>b.cost-a.cost||b.star-a.star||b.maxHp-a.maxHp)[0]; if(!e) return;
   for(const u of hs){ u.copied=e.ab; if(e.maxHp>u.maxHp){ u.maxHp=e.maxHp; u.hp=u.maxHp; } u.ad=Math.max(u.ad,e.ad); u.ap=Math.max(u.ap,e.ap); u.as=Math.max(u.as,e.as); u.df=Math.max(u.df,e.df); u.mr=Math.max(u.mr,e.mr); u.dr=(u.dr||0)+.1; if(u.maxMana<9999) u.mana=Math.max(u.mana,u.maxMana); fxText(cb2,u,'¡Transformación!','#c39bff'); } }); }},'ditto',1);
HERO({id:'h_dusknoir',tier:'S',w:.6,req:()=>!!(G.round&&G.round.s>=3),name:'Último Suspiro',icon:'💀',desc:'Solo aparece en 3-2. Recibes un Dusknoir ★★. Tu línea de Dusknoir gana +20% de vida y, cuando cae, explota: 45% de su vida máx. como daño mágico a los enemigos a 2 hexágonos y un escudo de 350 para tus aliados.',
 combat:(us,prm,cb,side)=>{ const hs=heroes(us,'duskull'); if(!hs.length) return; for(const u of hs) boost(u,{hp:.2}); addKillHook(cb,1-side,(cb2,src,v)=>{ if(!v||v.side!==side||!isHero(v,'duskull')) return;
   for(const e of cb2.units) if(!e.dead&&e.side!==side&&dU(v,e)<=2) dealDamage(cb2,v,e,v.maxHp*.45,'magic',false);
   for(const a of cb2.units) if(!a.dead&&a.side===side){ a.shield+=350; a.shieldT=Math.max(a.shieldT,4); } fxText(cb2,v,'¡Último Suspiro!','#b07cff'); }); }},'duskull',1);
// Nuevos
AG({id:'diferente',tier:'G',cat:'rules',name:'Diferente',icon:'🦄',desc:'Tus Pokémon sin ninguna sinergia activa ganan +400 de vida y +45% de vel. de ataque.',
 snap:c=>{ const Tt=traitTiers(c.p); const ks=Object.entries(c.p.board).filter(([k,u])=>unitTraits(u).every(t=>!Tt[t])).map(([k])=>k); return ks.length?ks:null; },
 combat:(us,ks)=>{ if(!Array.isArray(ks)) return; for(const u of us) if(ks.includes(u.bk)) boost(u,{hpf:400,as:.45}); },
 ui:c=>{ const Tt=traitTiers(c.p); return `Pokémon sin sinergia: ${boardUnits(c.p).filter(u=>unitTraits(u).every(t=>!Tt[t])).length}`; }});
AG({id:'entreno_combate',tier:'S',cat:'carry',tags:['carry'],req:p=>boardUnits(p).length>0,name:'Entrenamiento de Combate',icon:'🏋️',desc:'Elige un Pokémon de tu tablero: gana +3 de ataque, +4,5 de poder y +20 de vida permanentes por cada combate que juegue en tu tablero.',
 on:{select:c=>c.offer('Entrenamiento de Combate','Elige a quién entrenar',boardUnits(c.p).slice(0,4).map(u=>({t:`${nameOf(DEF[u.defId],u.star)} ${'★'.repeat(u.star)}`,i:'🏋️',d:'',v:String(u.uid)}))),
  pick:c=>{ c.st.uid=+c.d.v; c.say('alumno elegido'); },
  roundEnd:c=>{ const k=c.st.uid&&boardKeyOf(c.p,c.st.uid); if(!k) return; const u=c.p.board[k]; u.stk.ad+=3; u.stk.hp+=20; u.stk.ap=(u.stk.ap||0)+3*AP_PER_AD; c.st.n=(c.st.n||0)+1; }},
 ui:c=>c.st.uid?`${augUnitName(c.p,c.st.uid)}: +${3*(c.st.n||0)} de ataque, +${Math.round(4.5*(c.st.n||0))} de poder y +${20*(c.st.n||0)} de vida permanentes`:'Sin elegir'});


// ===== Inspirados en TFT (Set 18). Fase en la que salen: ST(2)=2-1, ST(3)=3-2, ST(4)=4-2 =====
const ST=(...s)=>()=>!!(G&&G.round)&&s.includes(Math.min(4,Math.max(2,G.round.s)));
const randKey=(cost,f)=>{ const l=UNIT_LIST.filter(u=>u.cost===cost&&(!f||f(u))&&(!G.pool||G.pool[u.key]>0)); return l.length?pick(l).key:null; };
const giveCopy=(p,k)=>{ if(!k) return ''; if(G.pool&&G.pool[k]>0) G.pool[k]--; giveUnitTo(p,k); return DEF[k].name; };
const randEmblem=c=>{ const t=pick([...ELEM_TRAITS,...CLASS_TRAITS].filter(x=>ITEMS['emb_'+x])); c.item('emb_'+t); return t; };
const rowOf=u=>+String(u.bk||'0,0').split(',')[1];
const stageStart=()=>!!(G&&G.round&&G.round.n===1);
const pvpRound=()=>!!(G&&G.round&&G.round.type==='pvp');
const fullFrom=comp=>FULL_KEYS.filter(k=>ITEMS[k]&&ITEMS[k].from&&ITEMS[k].from.includes(comp)&&!ITEMS[k].emblem);
const pickOpts=(keys,n)=>shuffle(keys.slice()).slice(0,n).map(k=>({t:ITEMS[k].name,i:ITEMS[k].icon,d:ITEMS[k].desc,v:'it:'+k}));
const sharesTrait=(u,us)=>us.filter(a=>a!==u&&!a.dead&&(a.d.traits||[]).some(t=>t!=='Legendario'&&(u.d.traits||[]).includes(t))).length;
const every=(cb,first,step,fn)=>{ const go=()=>{ if(cb.done) return; fn(); later2(cb,step,go); }; later2(cb,first,go); };

// --- Plata ---
AG({id:'golpe_anunciado',tier:'S',cat:'streak',tags:['win'],req:ST(2),name:'Golpe Anunciado',icon:'📣',desc:'Tu racha de victorias pasa a +4 y recibes 4 de oro.',on:{select:c=>{ c.p.streak=Math.max(4,c.p.streak); c.p.gold+=4; }}});
AG({id:'brote',tier:'S',cat:'emblem',tags:['emblem'],ex:'brote',req:ST(2),name:'Brote de Emblema',icon:'🌱',desc:'Recibes un emblema al azar.',on:{select:c=>c.say('emblema '+randEmblem(c))}});
AG({id:'brote2',tier:'S',cat:'emblem',tags:['emblem'],ex:'brote',req:ST(3),name:'Brote de Emblema+',icon:'🌿',desc:'Recibes un emblema al azar y un Imán Removedor.',on:{select:c=>{ c.say('emblema '+randEmblem(c)); c.item('magnet'); }}});
AG({id:'arranque',tier:'S',cat:'reroll',tags:['reroll'],req:ST(2),name:'Arranque',icon:'🚀',desc:'Recibes un Pokémon de coste 2 a 2★ al azar y 1 de oro.',on:{select:c=>{ const k=randKey(2); if(k) giveStar(c.p,k,2); c.p.gold+=1; }}});
AG({id:'uno_dos_tres',tier:'S',cat:'reroll',tags:['reroll'],req:ST(2),name:'Uno, Dos, Tres',icon:'🔢',desc:'Recibes 2 Pokémon de coste 1, uno de coste 2 y uno de coste 3.',on:{select:c=>{ for(const x of [1,1,2,3]) augGrant(c.p,'uc:'+x); }}});
AG({id:'uno_dos_cinco',tier:'S',cat:'classic',req:ST(4),name:'¡Uno, Dos, Cinco!',icon:'🖐️',desc:'Recibes un componente, 2 de oro y un Pokémon de coste 5 al azar.',on:{select:c=>{ c.comp(); c.p.gold+=2; augGrant(c.p,'uc:5'); }}});
AG({id:'bolsa_objetos',tier:'S',cat:'classic',name:'Bolsa de Objetos',icon:'👜',desc:'Recibes un objeto completo al azar.',on:{select:c=>c.full()}});
AG({id:'bolsita',tier:'S',cat:'classic',req:ST(3,4),name:'Bolsita de Componentes',icon:'🎒',desc:'Recibes 2 componentes.',on:{select:c=>{ c.comp(); c.comp(); }}});
AG({id:'especialista_tardio',tier:'S',cat:'fast',tags:['fast'],req:ST(3),name:'Especialista Tardío',icon:'⏰',desc:'Al llegar a nivel 9 recibes 27 de oro.',on:{levelUp:c=>{ if(c.d.level>=9&&c.once('9')){ c.p.gold+=27; c.say('27 de oro'); } }}});
AG({id:'cuchara_plata',tier:'S',cat:'fast',tags:['fast'],req:ST(2),name:'Cuchara de Plata',icon:'🥄',desc:'Recibes 10 de EXP.',on:{select:c=>c.xp(10)}});
AG({id:'tiendas_sin_fin',tier:'S',cat:'reroll',tags:['reroll'],req:ST(3,4),name:'Tiendas sin Fin',icon:'🔁',desc:'Recibes 10 tiendas gratis (se guardan entre rondas).',on:{select:c=>{ c.p.freeRerolls+=10; }}});
AG({id:'lecciones_boxeo',tier:'S',cat:'rules',req:ST(3,4),name:'Lecciones de Boxeo',icon:'🥊',desc:'Tu equipo gana +30 de vida por cada Pokémon que empieza el combate en la primera fila.',
 combat:us=>{ const n=us.filter(u=>rowOf(u)===0).length; for(const u of us) boost(u,{hpf:30*n}); }});
AG({id:'canon_cristal',tier:'S',cat:'rules',req:ST(3,4),name:'Cañón de Cristal',icon:'🔫',desc:'Tus Pokémon de la última fila empiezan con el 80% de su vida, pero hacen +16% de daño.',
 combat:us=>{ for(const u of us) if(rowOf(u)===3){ u.hp=u.maxHp*.8; u.dmgBonus+=.16; } }});
AG({id:'guardianes_gemelos',tier:'S',cat:'rules',req:ST(3,4),name:'Guardianes Gemelos',icon:'👯',desc:'Si tienes exactamente 2 Pokémon en la primera fila, ganan +100 de vida y +35 de defensa y resistencia.',
 combat:us=>{ const f=us.filter(u=>rowOf(u)===0); if(f.length===2) for(const u of f) boost(u,{hpf:100,df:35}); }});
AG({id:'centro',tier:'S',cat:'rules',req:ST(3,4),name:'Encuentra tu Centro',icon:'🎯',desc:'El Pokémon que empieza en el centro de la primera fila gana +15% de daño y +25% de vida.',
 combat:us=>{ const u=us.find(x=>x.bk==='3,0'); if(u){ boost(u,{hp:.25}); u.dmgBonus+=.15; } }});
AG({id:'fuego_concentrado',tier:'S',cat:'rules',req:ST(3,4),name:'Fuego Concentrado',icon:'🔥',desc:'Tu equipo gana +10% de ataque y otro +5% cada 5 segundos de combate.',
 combat:(us,prm,cb)=>{ for(const u of us) boost(u,{ad:.1}); every(cb,5,5,()=>{ for(const u of us) if(!u.dead) u.ad+=u.ad0*.05; }); }});
const orbHeal=n=>(us,prm,cb,side)=>{ addKillHook(cb,side,(cb2,src,t)=>{ if(!t) return; const a=us.filter(x=>!x.dead).sort((x,y)=>dU(x,t)-dU(y,t))[0]; if(a) heal(a,n); }); };
AG({id:'orbes_curativos',tier:'S',cat:'rules',ex:'orbes',req:ST(3,4),name:'Orbes Curativos',icon:'💚',desc:'Cuando cae un enemigo, el aliado más cercano se cura 250 de vida.',combat:orbHeal(250)});
AG({id:'abrazo_grupo',tier:'S',cat:'rules',req:ST(3,4),name:'Abrazo de Grupo',icon:'🤗',desc:'Al empezar el combate, cada Pokémon da +7 de defensa y resistencia a sus aliados adyacentes (se acumula).',
 combat:us=>{ for(const u of us){ const n=us.filter(a=>a!==u&&dU(a,u)<=1).length; boost(u,{df:7*n}); } }});
AG({id:'armadura_improvisada',tier:'S',cat:'rules',req:ST(3),name:'Armadura Improvisada',icon:'🧥',desc:'Tus Pokémon sin objetos ganan +30 de defensa y resistencia.',combat:us=>{ for(const u of us) if(!u.items.length) boost(u,{df:30}); }});
AG({id:'corrosion',tier:'S',cat:'rules',req:ST(3,4),name:'Corrosión',icon:'🧪',desc:'Los enemigos de sus 2 primeras filas pierden 4 de defensa y resistencia cada 2 segundos.',
 combat:(us,prm,cb,side)=>{ every(cb,2,2,()=>{ for(const e of cb.units) if(e.side!==side&&!e.dead&&rowOf(e)<=1){ e.df=Math.max(0,e.df-4); e.mr=Math.max(0,e.mr-4); } }); }});
AG({id:'matarreyes',tier:'S',cat:'econ',tags:['win'],req:ST(2,3),name:'Matarreyes',icon:'👑',desc:'Tras ganar un combate PvP, 1 de oro; si tu rival tenía más vida que tú, 6.',
 on:{win:c=>{ if(c.d.pve) return; const o=G.players.find(q=>q.id===c.d.opp); const g=o&&o.hp>c.p.hp?6:1; c.p.gold+=g; c.say(`+${g} de oro`); }}});
AG({id:'reencuentros',tier:'S',cat:'reroll',tags:['reroll'],req:ST(3,4),name:'Reencuentros',icon:'🫂',desc:'Recibes una copia de cada Pokémon de coste 1.',on:{select:c=>{ for(const u of UNIT_LIST.filter(x=>x.cost===1)) giveCopy(c.p,u.key); }}});
const delivery=(id,tier,st,cost,name)=>AG({id,tier,cat:'reroll',tags:['reroll'],ex:'reparto',req:ST(st),name,icon:'📦',desc:`Recibes 3 Pokémon de coste ${cost} al azar. Tras 6 rondas, otros 3.`,
 on:{select:c=>{ for(let i=0;i<3;i++) augGrant(c.p,'uc:'+cost); },roundStart:c=>{ c.st.n=(c.st.n||0)+1; if(c.st.n===6){ for(let i=0;i<3;i++) augGrant(c.p,'uc:'+cost); c.say('3 Pokémon más'); } }},ui:c=>(c.st.n||0)>=6?'Entregado':`Siguiente entrega en ${6-(c.st.n||0)} rondas`});
delivery('reparto','S',2,2,'Reparto Pokémon'); delivery('reparto2','G',3,3,'Reparto Pokémon+'); delivery('reparto3','P',4,4,'Reparto Pokémon++');
AG({id:'aliado_cuidador',tier:'S',cat:'fast',tags:['fast'],req:ST(2),name:'Aliado del Cuidador',icon:'🧑‍🌾',desc:'Recibes un Pokémon de coste 2 al azar y otra copia del mismo cada vez que subes de nivel.',
 on:{select:c=>{ const k=randKey(2); c.st.k=k; giveCopy(c.p,k); },levelUp:c=>{ if(c.st.k) c.say('copia de '+giveCopy(c.p,c.st.k)); }},ui:c=>c.st.k?`Pokémon: ${DEF[c.st.k].name}`:''});
AG({id:'con_suerte',tier:'S',cat:'econ',req:ST(3),name:'Con Suerte',icon:'🍀',desc:'Recibes 12 de oro y lanzas una moneda: si sale cara, 4 más.',on:{select:c=>{ const h=Math.random()<.5||c.p.mods.lucky; c.p.gold+=12+(h?4:0); c.say(h?'¡cara! 16 de oro':'cruz: 12 de oro'); }}});
AG({id:'unidos_sinergia',tier:'S',cat:'trait',tags:['trait'],req:ST(3,4),name:'Unidos en Sinergia',icon:'🧩',desc:'Tus Pokémon ganan +1,5% de ataque y +1,5 de poder por cada sinergia no única activa en tu equipo.',
 snap:c=>ladderCount(c.p)||null,combat:(us,n)=>{ for(const u of us) boost(u,{ad:.015*n,ap:1.5*n}); }});
AG({id:'verticalidad',tier:'S',cat:'trait',tags:['trait'],ex:'vertical',req:ST(3,4),name:'Verticalidad',icon:'📶',desc:'Cada Pokémon gana +1,5% de ataque, +1,5 de poder y +1,5 de defensa y resistencia por cada aliado que comparte una sinergia con él.',
 combat:us=>{ for(const u of us){ const n=sharesTrait(u,us); boost(u,{ad:.015*n,ap:1.5*n,df:1.5*n}); } }});

// --- Oro ---
AG({id:'ascension',tier:'G',cat:'rules',req:ST(3,4),name:'Ascensión',icon:'🌅',desc:'A los 12 segundos de combate, tu equipo gana +35% de daño.',combat:(us,prm,cb)=>{ later2(cb,12,()=>{ for(const u of us) if(!u.dead) u.dmgBonus+=.35; }); }});
AG({id:'victoria_arcana',tier:'G',cat:'rules',req:ST(3,4),name:'Victoria Arcana',icon:'🔮',desc:'A los 8 segundos de combate aturdes a todo el equipo rival 1,5 s; y otra vez a los 18 s.',
 combat:(us,prm,cb,side)=>{ for(const t of [8,18]) later2(cb,t,()=>{ for(const e of cb.units) if(e.side!==side&&!e.dead) stunUnit(e,1.5); }); }});
AG({id:'gran_bolsa',tier:'G',cat:'classic',req:ST(3,4),name:'Gran Bolsa',icon:'🛍️',desc:'Recibes 3 componentes, 2 de oro y un Imán Removedor.',on:{select:c=>{ c.comp(); c.comp(); c.comp(); c.p.gold+=2; c.item('magnet'); }}});
AG({id:'reunion_cumple',tier:'G',cat:'fast',tags:['fast'],req:ST(2),name:'Reunión de Cumpleaños',icon:'🎂',desc:'Recibes un Pokémon de coste 2 a 2★. A nivel 6, un componente; a nivel 9, un Pokémon de coste 5 a 2★.',
 on:{select:c=>{ const k=randKey(2); if(k) giveStar(c.p,k,2); },levelUp:c=>{ if(c.d.level>=6&&c.once('6')) c.comp(); if(c.d.level>=9&&c.once('9')){ const k=randKey(5); if(k) giveStar(c.p,k,2); c.say('¡Legendario a 2★!'); } }}});
AG({id:'guardaespaldas',tier:'G',cat:'rules',req:ST(2),name:'Entrenamiento de Guardaespaldas',icon:'🕶️',desc:'Tus Pokémon ganan +15 de defensa y resistencia, y +2 más por cada nivel de entrenador.',
 snap:c=>c.p.level,combat:(us,lv)=>{ for(const u of us) boost(u,{df:15+2*(+lv||1)}); }});
AG({id:'gracia_retador',tier:'G',cat:'rules',req:ST(3,4),name:'Gracia del Retador',icon:'⚔️',desc:'Al empezar el combate, tus Pokémon ganan +30% de velocidad de ataque durante 4 s. Cada vez que derrotáis a un enemigo, vuelven a ganarla.',
 combat:(us,prm,cb,side)=>{ const rush=()=>{ for(const u of us) if(!u.dead){ u.rushMul=Math.max(u.rushT>0?u.rushMul||1:1,1.3); u.rushT=4; } }; rush(); addKillHook(cb,side,rush); }});
AG({id:'acelerador',tier:'G',cat:'rules',req:ST(3,4),name:'Acelerador de Relojería',icon:'⏱️',desc:'Tu equipo gana +10% de velocidad de ataque cada 3 segundos de combate.',combat:(us,prm,cb)=>{ every(cb,3,3,()=>{ for(const u of us) if(!u.dead) u.as=Math.min(5,u.as*1.1); }); }});
AG({id:'mente_abarrotada',tier:'G',cat:'fast',tags:['fast'],req:ST(2),name:'Mente Abarrotada',icon:'🧠',desc:'Recibes 4 Pokémon de coste 1. Si acabas un combate PvP con el banquillo lleno, ganas 3 de EXP.',
 on:{select:c=>{ for(let i=0;i<4;i++) augGrant(c.p,'uc:1'); },roundEnd:c=>{ if(!c.d.pve&&c.p.bench.every(Boolean)){ c.xp(3); c.say('3 de EXP'); } }}});
AG({id:'sobrecarga_mental',tier:'G',cat:'reroll',tags:['reroll'],req:ST(3),name:'Sobrecarga Cognitiva',icon:'🤯',desc:'Recibes 7 de oro, un Pokémon de coste 1 a 2★, uno de coste 2, dos de coste 3, 1 de EXP y una tienda gratis.',
 on:{select:c=>{ c.p.gold+=7; const k=randKey(1); if(k) giveStar(c.p,k,2); for(const x of [2,3,3]) augGrant(c.p,'uc:'+x); c.xp(1); c.p.freeRerolls+=1; }}});
AG({id:'companero',tier:'G',cat:'reroll',tags:['reroll'],req:ST(3),name:'Construye un Compañero',icon:'🧸',desc:'El próximo Pokémon de coste 1 que compres llega a 3★. Recibes 2 de oro.',
 on:{select:c=>{ c.p.gold+=2; },buy:c=>{ if(c.d.cost!==1||!c.once('x')) return; const u=allUnits(c.p).filter(x=>x.baseId===c.d.key&&x.star<3).sort((a,b)=>b.uid-a.uid)[0]; if(!u) return;
   const need=9-Math.pow(3,u.star-1); if(G.pool) G.pool[c.d.key]=Math.max(0,(G.pool[c.d.key]||0)-need); u.star=3; c.say(`¡${DEF[u.defId].name} a 3★!`); }},ui:c=>c.st.once?'Usado':'Listo'});
AG({id:'duo_legendario',tier:'G',cat:'classic',req:ST(4),name:'Dúo Legendario',icon:'👥',desc:'Recibes 2 Pokémon de coste 5 al azar y 2 copias de un componente al azar.',on:{select:c=>{ augGrant(c.p,'uc:5'); augGrant(c.p,'uc:5'); const k=pick(BASIC); c.item(k); c.item(k); }}});
AG({id:'primeras_lecciones',tier:'G',cat:'hybrid',tags:['win'],req:ST(2),name:'Primeras Lecciones',icon:'📖',desc:'Tu equipo gana +3% de ataque y +3 de poder, y +1 más tras cada combate PvP. Los de coste 1 ganan el doble.',
 on:{roundEnd:c=>{ if(!c.d.pve) c.st.n=(c.st.n||0)+1; }},snap:c=>3+(c.st.n||0),combat:(us,n)=>{ for(const u of us){ const m=u.cost===1?2:1; boost(u,{ad:.01*n*m,ap:n*m}); } },ui:c=>`+${3+(c.st.n||0)}% de ataque y poder`});
AG({id:'remontada_epica',tier:'G',cat:'fast',tags:['fast','reroll'],req:ST(3),name:'Remontada Épica',icon:'🎢',desc:'Al llegar a nivel 8 recibes 20 tiendas gratis.',on:{levelUp:c=>{ if(c.d.level>=8&&c.once('8')){ c.p.freeRerolls+=20; c.say('20 tiendas gratis'); } }}});
const epoch=(id,tier,st,x)=>AG({id,tier,cat:'fast',tags:['fast'],ex:'epoca',req:ST(st),name:x>4?'Época+':'Época',icon:'⌛',desc:`Ahora y al empezar cada fase: ${x} de EXP y 2 tiendas gratis.`,
 on:{select:c=>{ c.xp(x); c.p.freeRerolls+=2; },roundStart:c=>{ if(stageStart()){ c.xp(x); c.p.freeRerolls+=2; c.say(`${x} de EXP y 2 tiendas`); } }}});
epoch('epoca','G',2,4); epoch('epoca2','P',3,8);
const growth=(id,tier,st,x)=>AG({id,tier,cat:'fast',tags:['fast'],ex:'crecer',req:ST(st),name:x>7?'Crecimiento Explosivo+':'Crecimiento Explosivo',icon:'💥',desc:`Ahora y al empezar las 3 rondas siguientes: ${x} de EXP.`,
 on:{select:c=>c.xp(x),roundStart:c=>{ c.st.n=(c.st.n||0)+1; if(c.st.n<=3) c.xp(x); }}});
growth('crecimiento_explosivo','G',3,7); growth('crecimiento_explosivo2','G',4,9);
AG({id:'cuatro_veces',tier:'G',cat:'carry',tags:['carry'],req:ST(3),name:'Cuatro Veces Más',icon:'4️⃣',desc:'Recibes un Pokémon de coste 4 al azar. Por cada objeto que lleve, tu equipo gana +100 de vida.',
 on:{select:c=>{ const k=c.unit(4); const u=k&&allUnits(c.p).filter(x=>x.defId===k).sort((a,b)=>b.uid-a.uid)[0]; if(u) c.st.uid=u.uid; }},
 snap:c=>{ const u=allUnits(c.p).find(x=>x.uid===c.st.uid); return u&&u.items.length?u.items.length:null; },combat:(us,n)=>{ for(const u of us) boost(u,{hpf:100*n}); },ui:c=>c.st.uid?`${augUnitName(c.p,c.st.uid)}: +100 de vida al equipo por objeto`:''});
AG({id:'plano_retaguardia',tier:'G',cat:'carry',tags:['carry'],req:ST(2),name:'Plano de Retaguardia',icon:'📐',desc:'Recibes un Pokémon de coste 3 que no es tanque y un emblema de su clase.',
 on:{select:c=>{ const l=UNIT_LIST.filter(u=>u.cost===3&&u.role!=='t'&&u.traits.some(t=>CLASS_TRAITS.includes(t))); const u=pick(l); giveCopy(c.p,u.key); const t=u.traits.find(x=>CLASS_TRAITS.includes(x)); c.item('emb_'+t); c.say(`${u.name} y emblema ${t}`); }}});
AG({id:'oro21',tier:'G',cat:'econ',req:ST(3),name:'21 de Oro',icon:'🪙',desc:'Recibes 21 de oro.',on:{select:c=>{ c.p.gold+=21; }}});
AG({id:'acero_dorado',tier:'G',cat:'classic',req:ST(4),name:'Acero Dorado',icon:'🏅',desc:'Recibes 2 Pokémon de coste 5. Si colocas al menos uno de coste 5, tus Pokémon de coste 1-4 hacen +8% de daño.',
 on:{select:c=>{ augGrant(c.p,'uc:5'); augGrant(c.p,'uc:5'); }},combat:us=>{ if(us.some(u=>u.cost===5)) for(const u of us) if(u.cost<5) u.dmgBonus+=.08; }});
AG({id:'orbes_curativos2',tier:'G',cat:'rules',ex:'orbes',req:ST(3,4),name:'Orbes Curativos II',icon:'💖',desc:'Cuando cae un enemigo, el aliado más cercano se cura 575 de vida.',combat:orbHeal(575)});
AG({id:'buscavidas',tier:'G',cat:'econ',ex:'interes',req:ST(2),name:'Buscavidas',icon:'🎩',desc:'Ya no ganas intereses, pero recibes 3 de oro al empezar cada ronda PvP. Recibes 3 de oro ahora.',
 on:{select:c=>{ c.p.mods.maxInterest=0; c.p.gold+=3; },roundStart:c=>{ if(pvpRound()) c.p.gold+=3; }}});
const invest=(id,tier,per,extra,gold)=>AG({id,tier,cat:'econ',ex:'inversion_vida',req:ST(2),name:tier==='P'?'Estrategia de Inversión II':'Estrategia de Inversión',icon:'💹',desc:`Tus Pokémon ganan ${per} de vida permanente por cada punto de interés que cobres${extra?`, y tu interés máximo sube en ${extra}`:''}. Recibes ${gold} de oro.`,
 on:{select:c=>{ c.p.gold+=gold; c.p.mods.maxInterest+=extra; },roundStart:c=>{ c.st.hp=(c.st.hp||0)+per*Math.min(c.p.mods.maxInterest,Math.floor(c.p.gold/10)); }},
 snap:c=>c.st.hp||null,combat:(us,hp)=>{ for(const u of us) boost(u,{hpf:+hp||0}); },ui:c=>`Tu equipo: +${c.st.hp||0} de vida`});
invest('inversion_vida','G',9,0,3); invest('inversion_vida2','P',12,2,6);
const lotus=(id,tier,crit,cm)=>AG({id,tier,cat:'rules',ex:'loto',req:ST(3,4),name:tier==='P'?'Loto Enjoyado II':'Loto Enjoyado',icon:'🪷',desc:`Tu equipo gana +${Math.round(crit*100)}% de prob. crítica y +${Math.round(cm*100)}% de daño crítico, y sus habilidades pueden ser críticas.`,
 combat:us=>{ for(const u of us){ u.critC+=crit; u.critM+=cm; u.critAbil=true; } }});
lotus('loto','G',.15,.1); lotus('loto2','P',.25,.2);
AG({id:'conoce_rival',tier:'G',cat:'rules',name:'Conoce a tu Rival',icon:'🔍',desc:'Tu equipo hace +8% de daño, o +15% si tu rival y tú compartís alguna sinergia activa.',
 combat:(us,prm,cb,side)=>{ (cb.startFns=cb.startFns||[]).push(cb2=>{ const act=s=>{ const c={}; for(const u of cb2.units) if(u.side===s) for(const t of u.d.traits||[]) c[t]=(c[t]||0)+1; return new Set(Object.keys(c).filter(t=>c[t]>=2)); };
   const a=act(side), b=act(1-side), sh=[...a].some(t=>b.has(t)); for(const u of us) u.dmgBonus+=sh?.15:.08; }); }});
AG({id:'escalada_final',tier:'G',cat:'fast',tags:['fast'],req:ST(2),name:'Escalada Final',icon:'🧗',desc:'Recibes 2 de EXP al empezar cada ronda PvP. Tus Pokémon de coste 5 ganan +12% de vida y de velocidad de ataque.',
 on:{roundStart:c=>{ if(pvpRound()) c.xp(2); }},combat:us=>{ for(const u of us) if(u.cost===5) boost(u,{hp:.12,as:.12}); }});
AG({id:'legion_tres',tier:'G',cat:'emblem',tags:['emblem'],req:ST(2),name:'Legión de Tres',icon:'3️⃣',desc:'Recibes un emblema al azar. Tus Pokémon de coste 3 y los que llevan un emblema ganan +150 de vida y +12% de velocidad de ataque.',
 on:{select:c=>c.say('emblema '+randEmblem(c))},combat:us=>{ for(const u of us) if(u.cost===3||u.items.some(k=>ITEMS[k]&&ITEMS[k].emblem)) boost(u,{hpf:150,as:.12}); }});
AG({id:'monetizacion',tier:'G',cat:'econ',req:ST(4),name:'Monetización Maliciosa',icon:'💸',desc:'Recibes 6 de oro. Durante las 2 rondas siguientes, cada enemigo que cae suelta 2 de oro.',
 on:{select:c=>{ c.p.gold+=6; c.st.k=2; },roundEnd:c=>{ if(c.st.k>0) c.st.k--; }},snap:c=>c.st.k>0?1:null,
 combat:(us,prm,cb,side)=>{ addKillHook(cb,side,()=>{ cb.gold[side]=Math.min(30,cb.gold[side]+2); }); }});
const hungry=(id,st,now)=>AG({id,tier:'G',cat:'econ',ex:'hambre',req:ST(st),name:now>7?'Hambre de Oro+':'Hambre de Oro',icon:'🤑',desc:`Recibes ${now} de oro ahora y 7 al empezar cada fase.`,
 on:{select:c=>{ c.p.gold+=now; },roundStart:c=>{ if(stageStart()){ c.p.gold+=7; c.say('7 de oro'); } }}});
hungry('hambre_oro',2,7); hungry('hambre_oro2',3,13);
AG({id:'estudio_paciente',tier:'G',cat:'fast',tags:['fast'],req:ST(2),name:'Estudio Paciente',icon:'📚',desc:'Tras cada combate PvP, 2 de EXP si ganas o 3 si pierdes.',on:{roundEnd:c=>{ if(!c.d.pve) c.xp(c.d.won?2:3); }}});
AG({id:'armadura_argumental',tier:'G',cat:'rules',req:ST(3,4),name:'Armadura Argumental',icon:'📜',desc:'Tu equipo gana +8 de defensa y resistencia; cada Pokémon que baja del 50% de vida sube a +40 el resto del combate.',
 combat:(us,prm,cb)=>{ for(const u of us) boost(u,{df:8}); every(cb,.5,.5,()=>{ for(const u of us) if(!u.dead&&!u.plotArmor&&u.hp<u.maxHp*.5){ u.plotArmor=1; u.df+=32; u.mr+=32; } }); }});
AG({id:'baston_serafin',tier:'G',cat:'carry',tags:['carry'],req:ST(2,3),name:'Bastón del Serafín',icon:'🪄',desc:'Recibes una Piedra Lunar. Tus Piedras Lunares dan además +2 de maná por segundo si su portador tiene 110 de poder o más.',
 on:{select:c=>c.item('moon')},combat:us=>{ for(const u of us) if(u.items.includes('moon')&&u.ap>=10) u.manaRegen+=2; }});
const slam=(id,st,gold,xp)=>AG({id,tier:'G',cat:'fast',tags:['fast'],ex:'slam',req:ST(st),name:xp?'Forja Rápida+':'Forja Rápida',icon:'🔨',desc:`Recibes ${gold} de oro${xp?` y ${xp} de EXP`:''}. Tras cada combate PvP, si no te quedan objetos en el inventario, 2 de EXP.`,
 on:{select:c=>{ c.p.gold+=gold; if(xp) c.xp(xp); },roundEnd:c=>{ if(!c.d.pve&&!c.p.items.some(k=>ITEMS[k]&&!ITEMS[k].tool)) c.xp(2); }}});
slam('forja_rapida',2,3,0); slam('forja_rapida2',3,4,10);
AG({id:'doble_baja',tier:'G',cat:'econ',req:ST(2),name:'Doble Baja Veloz',icon:'⚡',desc:'Recibes una Cinta Furia. Cuando hayan caído 2 jugadores, recibes 40 de oro.',
 on:{select:c=>c.item('rage'),roundEnd:c=>{ if(G.players.filter(q=>!q.alive||q.hp<=0).length>=2&&c.once('x')){ c.p.gold+=40; c.say('¡40 de oro!'); } }},ui:c=>c.st.once?'Cobrado':'Esperando 2 eliminados'});
const roots=(id,st,two)=>AG({id,tier:'G',cat:'emblem',tags:['emblem'],ex:'raices',req:ST(st),name:two?'Raíces que Crecen+':'Raíces que Crecen',icon:'🌳',desc:two?'Recibes 2 emblemas al azar y 2 de oro.':'Recibes un emblema al azar; tras 3 combates, otro.',
 on:{select:c=>{ c.say('emblema '+randEmblem(c)); if(two){ randEmblem(c); c.p.gold+=2; } },roundEnd:c=>{ if(two) return; c.st.n=(c.st.n||0)+1; if(c.st.n===3) c.say('emblema '+randEmblem(c)); }}});
roots('raices',2,false); roots('raices2',3,true);
AG({id:'forjador_cucharas',tier:'G',cat:'classic',req:ST(4),name:'Forjador de Cucharas',icon:'🥄',desc:'Recibes 2 objetos completos al azar que llevan Cuchara Torcida.',on:{select:c=>{ for(let i=0;i<2;i++) c.item(pick(fullFrom('spoon'))); }}});

// --- Prismáticos ---
const thieves=(id,st,every3)=>AG({id,tier:'P',cat:'classic',ex:'ladrones',req:ST(st),name:every3?'Banda de Ladrones++':'Banda de Ladrones',icon:'🦹',desc:`Recibes 2 Guantes de Boxeo (guante ladrón). Tras ${every3?3:5} combates PvP, otro.`,
 on:{select:c=>{ c.item('zoom'); c.item('zoom'); },roundEnd:c=>{ if(c.d.pve) return; c.st.n=(c.st.n||0)+1; if(c.st.n===(every3?3:5)){ c.item('zoom'); c.say('otro Guante de Boxeo'); } }}});
thieves('ladrones',2,false); thieves('ladrones2',4,true);
AG({id:'guarida_baron',tier:'P',cat:'rules',req:ST(3,4),name:'Guarida del Barón',icon:'🐉',desc:'Recibes un objeto de tanque al azar. A partir de los 8 s de combate, tu equipo gana +4% de ataque y +4 de poder cada segundo.',
 on:{select:c=>c.item(pick(['vest','leftovers','helmet','scale','royal','sturdy'].filter(k=>ITEMS[k])))},combat:(us,prm,cb)=>{ every(cb,8,1,()=>{ for(const u of us) if(!u.dead){ u.ad+=u.ad0*.04; u.ap+=4; } }); }});
const overflow=(id,comp,name,desc,fx)=>AG({id,tier:'P',cat:'classic',req:ST(3,4),name,icon:'🎁',desc,on:{select:c=>{ for(let i=0;i<4;i++) giveItem(c.p,comp,true,true); }},combat:us=>{ for(const u of us){ const n=u.items.filter(k=>k===comp).length; if(n) fx(u,n); } }});
overflow('exceso_huesos','club','Exceso de Huesos','Recibes 4 Huesos Gruesos. Cada Hueso Grueso da +85 de vida más.',(u,n)=>boost(u,{hpf:85*n}));
overflow('exceso_garras','claw','Exceso de Garras','Recibes 4 Garras Afiladas. Cada Garra Afilada da +4% de velocidad de ataque.',(u,n)=>boost(u,{as:.04*n}));
overflow('exceso_cucharas','spoon','Exceso de Cucharas','Recibes 4 Cucharas Torcidas. Cada Cuchara Torcida da +5% de velocidad de ataque.',(u,n)=>boost(u,{as:.05*n}));
AG({id:'crea_amigo',tier:'P',cat:'reroll',tags:['reroll'],req:ST(2),name:'Crea un Amigo',icon:'🤝',desc:'Recibes un Pokémon de coste 1 a 3★ al azar y 9 de oro.',on:{select:c=>{ const k=randKey(1); if(k) giveStar(c.p,k,3); c.p.gold+=9; }}});
AG({id:'tesoros_enterrados',tier:'P',cat:'classic',req:ST(2),name:'Tesoros Enterrados',icon:'🏴‍☠️',desc:'Recibes un componente ahora y otro al empezar cada una de las 6 rondas siguientes.',
 on:{select:c=>c.comp(),roundStart:c=>{ c.st.n=(c.st.n||0)+1; if(c.st.n<=6) c.comp(); }},ui:c=>`Quedan ${Math.max(0,6-(c.st.n||0))} componentes`});
AG({id:'historia_remontada',tier:'P',cat:'streak',tags:['lose'],req:ST(2),name:'Historia de Remontada',icon:'📈',desc:'Tu equipo gana +4 de vida y +0,3% de velocidad de ataque por cada punto de vida de entrenador que te falta.',
 snap:c=>Math.max(0,100-c.p.hp)||null,combat:(us,m)=>{ for(const u of us) boost(u,{hpf:4*m,as:.003*m}); }});
AG({id:'nucleo_comercial',tier:'P',cat:'reroll',tags:['reroll'],req:ST(4),name:'Núcleo Comercial',icon:'🏪',desc:'Recibes 16 tiendas gratis ahora y 3 al empezar cada ronda el resto de la partida.',on:{select:c=>{ c.p.freeRerolls+=16; },roundStart:c=>{ c.p.freeRerolls+=3; }}});
AG({id:'mision_componentes',tier:'P',cat:'quest',tags:['win'],req:ST(2),name:'Misión de Componentes',icon:'🧭',desc:'Recibes un componente y 1 de oro. Tus 7 próximas victorias PvP te dan cada una un componente distinto; después, 1 de oro por victoria.',
 on:{select:c=>{ c.comp(); c.p.gold+=1; c.st.left=shuffle(BASIC.slice()); },win:c=>{ if(c.d.pve) return; const l=c.st.left||[]; if(l.length) c.item(l.shift()); else c.p.gold+=1; }},ui:c=>`Componentes que quedan: ${(c.st.left||[]).length}`});
AG({id:'flexible',tier:'P',cat:'emblem',tags:['emblem'],req:ST(2),name:'Flexible',icon:'🧘',desc:'Recibes un emblema al azar ahora y al empezar cada fase. Tu equipo gana +30 de vida por cada emblema que lleven tus Pokémon.',
 on:{select:c=>c.say('emblema '+randEmblem(c)),roundStart:c=>{ if(stageStart()) c.say('emblema '+randEmblem(c)); }},
 combat:us=>{ const n=us.reduce((s,u)=>s+u.items.filter(k=>ITEMS[k]&&ITEMS[k].emblem).length,0); for(const u of us) boost(u,{hpf:30*n}); }});
AG({id:'grande_poderoso',tier:'P',cat:'rules',req:ST(3,4),name:'Grande y Poderoso',icon:'🦣',desc:'Tu equipo gana +225 de vida y +10% de vida máxima.',combat:us=>{ for(const u of us){ boost(u,{hpf:225}); boost(u,{hp:.1}); } }});
AG({id:'a_largo_plazo',tier:'P',cat:'fast',tags:['fast'],ex:'interes',req:ST(2),name:'A Largo Plazo',icon:'🔭',desc:'Ya no ganas intereses. Recibes 10 de oro ahora y 4 de EXP tras cada combate PvP.',
 on:{select:c=>{ c.p.mods.maxInterest=0; c.p.gold+=10; },roundEnd:c=>{ if(!c.d.pve) c.xp(4); }}});
const gamble=(id,st,gold)=>AG({id,tier:'P',cat:'risk',ex:'apuesta',req:ST(st),name:gold>3?'Apuesta Dorada++':gold>2?'Apuesta Dorada+':'Apuesta Dorada',icon:'🎰',desc:`Recibes ${gold} de oro y lanzas una moneda: si sale cara, 3 objetos completos al azar; si sale cruz, eliges 2 objetos completos.`,
 on:{select:c=>{ c.p.gold+=gold; if(Math.random()<.5||c.p.mods.lucky){ c.full(); c.full(); c.full(); revealTo(c.p,'🪙','Apuesta Dorada','¡Cara!','Recibes 3 objetos completos.','bueno'); } else { for(let i=0;i<2;i++) c.offer('Apuesta Dorada','Cruz: elige un objeto completo',pickOpts(glovePool(),4)); revealTo(c.p,'🪙','Apuesta Dorada','Cruz','Eliges 2 objetos completos.','bueno'); } }}});
gamble('apuesta_dorada',2,2); gamble('apuesta_dorada2',3,3); gamble('apuesta_dorada3',4,6);
AG({id:'compromiso_total',tier:'P',cat:'emblem',tags:['emblem','trait'],req:ST(2),name:'Compromiso Total',icon:'💍',desc:'Recibes un emblema al azar. Ahora y al empezar cada fase, recibes un Pokémon de esa sinergia de coste igual a la fase (máx. 5) y 3 de oro.',
 on:{select:c=>{ c.st.t=randEmblem(c); c.def.on.give(c); },give:c=>{ const s=Math.min(5,G.round?G.round.s:2), l=UNIT_LIST.filter(u=>u.traits.includes(c.st.t)&&(!G.pool||G.pool[u.key]>0)).sort((a,b)=>Math.abs(a.cost-s)-Math.abs(b.cost-s));
   if(l.length) c.say(giveCopy(c.p,l[0].cost===s?pick(l.filter(u=>u.cost===s)).key:l[0].key)); c.p.gold+=3; },roundStart:c=>{ if(stageStart()&&c.st.t) c.def.on.give(c); }},ui:c=>c.st.t?`Sinergia: ${c.st.t}`:''});
AG({id:'fondo_cobertura',tier:'P',cat:'econ',ex:'interes',req:ST(2),name:'Fondo de Cobertura',icon:'🏦',desc:'Recibes 22 de oro y tu interés máximo sube a 10.',on:{select:c=>{ c.p.gold+=22; c.p.mods.maxInterest=Math.max(c.p.mods.maxInterest,10); }}});
AG({id:'manten_linea',tier:'P',cat:'rules',req:ST(3,4),name:'Mantén la Línea',icon:'🧱',desc:'Tus Pokémon de las 2 filas traseras ganan +11% de ataque y +11 de poder por cada Pokémon que empieza en la primera fila.',
 combat:us=>{ const n=us.filter(u=>rowOf(u)===0).length; for(const u of us) if(rowOf(u)>=2) boost(u,{ad:.11*n,ap:11*n}); }});
AG({id:'invertido',tier:'P',cat:'econ',req:ST(4),name:'Invertido++',icon:'💎',desc:'Recibes 45 de oro. Al empezar cada ronda, una tienda gratis por cada 10 de oro por encima de 50 (hasta 80).',
 on:{select:c=>{ c.p.gold+=45; },roundStart:c=>{ const n=Math.floor((Math.min(80,c.p.gold)-50)/10); if(n>0) c.p.freeRerolls+=n; }}});
AG({id:'sube_nivel',tier:'P',cat:'fast',tags:['fast'],req:ST(2),name:'¡Sube de Nivel!',icon:'⬆️',desc:'Comprar EXP te da 2 más. Recibes 10 de EXP ahora.',on:{select:c=>{ c.p.mods.xpBuy+=2; c.xp(10); }}});
const lucky=(id,st,later)=>AG({id,tier:'P',cat:'carry',tags:['carry'],ex:'guantes_suerte',req:ST(...st),name:later?'Guantes de la Suerte+':'Guantes de la Suerte',icon:'🍀',desc:`Tus Guantes de Boxeo dan siempre los objetos ideales para el Pokémon que los lleva. Recibes 2 Paracontactos${later?' ahora y otro tras 4 combates PvP':' y 4 de oro'}.`,
 on:{select:c=>{ c.p.mods.luckyGloves=1; c.item('lens'); c.item('lens'); if(!later) c.p.gold+=4; for(const u of allUnits(c.p)) rollGloves(c.p,u,true); },roundEnd:c=>{ if(!later||c.d.pve) return; c.st.n=(c.st.n||0)+1; if(c.st.n===4) c.item('lens'); }}});
lucky('guantes_suerte',[2],false); lucky('guantes_suerte2',[3,4],true);
AG({id:'suscripcion',tier:'P',cat:'classic',req:ST(3),name:'Suscripción de Lujo',icon:'📬',desc:'Recibes un paquete con un Pokémon de coste 5, uno de coste 1 a 2★ y 5 de oro. Al empezar las 2 fases siguientes, otro paquete.',
 on:{select:c=>c.def.on.pack(c),pack:c=>{ augGrant(c.p,'uc:5'); const k=randKey(1); if(k) giveStar(c.p,k,2); c.p.gold+=5; c.say('paquete recibido'); },roundStart:c=>{ if(stageStart()&&(c.st.n||0)<2){ c.st.n=(c.st.n||0)+1; c.def.on.pack(c); } }},ui:c=>`Paquetes que quedan: ${2-(c.st.n||0)}`});
AG({id:'min_max',tier:'P',cat:'classic',req:ST(3),name:'Min-Max',icon:'⚖️',desc:'Recibes un Imán Removedor, 4 componentes y 4 de oro.',on:{select:c=>{ c.item('magnet'); for(let i=0;i<4;i++) c.comp(); c.p.gold+=4; }}});
AG({id:'monzon',tier:'P',cat:'econ',req:ST(4),name:'Monzón de Dinero',icon:'🌧️',desc:'Recibes 7 de oro ahora y 7 al empezar cada ronda el resto de la partida.',on:{select:c=>{ c.p.gold+=7; },roundStart:c=>{ c.p.gold+=7; }}});
AG({id:'compras_compulsivas',tier:'P',cat:'reroll',tags:['reroll','fast'],req:ST(2),name:'Compras Compulsivas',icon:'🛒',desc:'Cada vez que subes de nivel recibes tantas tiendas gratis como tu nivel + 1. Recibes 6 de oro.',
 on:{select:c=>{ c.p.gold+=6; },levelUp:c=>{ c.p.freeRerolls+=c.d.level+1; c.say(`${c.d.level+1} tiendas gratis`); }}});
AG({id:'despertar_alma',tier:'P',cat:'rules',req:ST(3,4),name:'Despertar del Alma',icon:'👻',desc:'Al empezar el combate, tu equipo gana +1,5% de ataque y +1,5 de poder cada segundo durante 10 s.',
 combat:(us,prm,cb)=>{ for(let i=1;i<=10;i++) later2(cb,i,()=>{ for(const u of us) if(!u.dead){ u.ad+=u.ad0*.015; u.ap+=1.5; } }); }});
AG({id:'huevo_oro',tier:'P',cat:'slow',tags:['slow'],req:p=>ST(4)()&&p.hp>=40,name:'Huevo de Oro',icon:'🥚',desc:'Un huevo dorado que eclosiona en 11 rondas con un botín enorme (30 de oro, 2 Legendarios y 2 objetos completos). Ganar un combate PvP lo adelanta una ronda más.',
 on:{select:c=>{ c.st.t=11; },roundStart:c=>c.def.on.tick(c),win:c=>{ if(!c.d.pve) c.def.on.tick(c); },tick:c=>{ if(!(c.st.t>0)) return; c.st.t--; if(c.st.t===0){ c.p.gold+=30; augGrant(c.p,'uc:5'); augGrant(c.p,'uc:5'); c.full(); c.full(); revealTo(c.p,'🥚','Huevo de Oro','¡Eclosiona!','30 de oro, 2 Legendarios y 2 objetos completos.','bueno'); } }},
 ui:c=>c.st.t>0?`Eclosiona en ${c.st.t} rondas`:'Eclosionado'});
const tree=(id,st,plus)=>AG({id,tier:'P',cat:'emblem',tags:['emblem'],ex:'arbol',req:ST(st),name:plus?'Árbol de Sinergias+':'Árbol de Sinergias',icon:'🌲',desc:plus?'Recibes 3 emblemas al azar, un Imán Removedor y 4 de oro.':'Recibes 3 emblemas al azar y 2 de oro.',
 on:{select:c=>{ const t=[randEmblem(c),randEmblem(c),randEmblem(c)]; c.p.gold+=plus?4:2; if(plus) c.item('magnet'); c.say('emblemas '+t.join(', ')); }}});
tree('arbol',2,false); tree('arbol2',3,true);
AG({id:'montones_stats',tier:'P',cat:'rules',req:ST(3,4),name:'Montones de Estadísticas',icon:'📊',desc:'Tu equipo gana +88 de vida, +8% de ataque, +8 de poder, +8 de defensa y resistencia, +8% de velocidad de ataque y +8 de maná.',
 combat:us=>{ for(const u of us) boost(u,{hpf:88,ad:.08,ap:8,df:8,as:.08,mana:8}); }});
AG({id:'movilidad',tier:'P',cat:'fast',tags:['fast'],req:ST(2),name:'Movilidad Ascendente',icon:'🪜',desc:'Comprar EXP cuesta 1 de oro menos. Cada vez que subes de nivel, recuperas 2 de vida y recibes 2 tiendas gratis.',
 on:{select:c=>{ c.p.mods.xpCost=Math.max(1,(c.p.mods.xpCost||4)-1); },levelUp:c=>{ c.p.hp=Math.min(100,c.p.hp+2); c.p.freeRerolls+=2; }}});
AG({id:'bolsa_urf',tier:'P',cat:'emblem',tags:['emblem'],req:ST(3,4),name:'Bolsa de Mew',icon:'🎁',desc:'Recibes una Medalla, 3 componentes y 5 de oro.',on:{select:c=>{ c.item('medal'); c.comp(); c.comp(); c.comp(); c.p.gold+=5; }}});
AG({id:'verticalidad3',tier:'P',cat:'trait',tags:['trait'],ex:'vertical',req:ST(3,4),name:'Verticalidad III',icon:'📶',desc:'Cada Pokémon gana +4% de ataque, +4 de poder y +3,5 de defensa y resistencia por cada aliado que comparte una sinergia con él.',
 combat:us=>{ for(const u of us){ const n=sharesTrait(u,us); boost(u,{ad:.04*n,ap:4*n,df:3.5*n}); } }});
AG({id:'vale_la_pena',tier:'P',cat:'reroll',tags:['reroll'],req:ST(2),name:'Vale la Pena Esperar',icon:'⏳',desc:'Recibes 2 copias de un Pokémon de coste 2 al azar, y otra copia al empezar cada ronda el resto de la partida.',
 on:{select:c=>{ const k=randKey(2); c.st.k=k; giveCopy(c.p,k); giveCopy(c.p,k); },roundStart:c=>{ if(c.st.k) giveCopy(c.p,c.st.k); }},ui:c=>c.st.k?`Pokémon: ${DEF[c.st.k].name}`:''});


// ===== Yunques, duplicadores, radiantes y mecánicas especiales (TFT Set 18) =====
AG({id:'activos_hierro',tier:'S',cat:'classic',req:ST(2),name:'Activos de Hierro',icon:'⚒️',desc:'Recibes un Yunque de componentes (véndelo y eliges 1 de 6 componentes) y 3 de oro.',on:{select:c=>{ c.say(giveAnvil(c.p,'c')); c.p.gold+=3; }}});
AG({id:'bufe_componentes',tier:'S',cat:'classic',req:ST(2),name:'Bufé de Componentes',icon:'🍱',desc:'Cada vez que fueras a recibir un componente, recibes en su lugar un Yunque de componentes (eliges 1 de 6). Recibes un componente al azar ahora.',
 on:{select:c=>{ c.comp(); c.p.mods.anvilBuffet=1; }}});
AG({id:'favor_cuidador',tier:'G',cat:'fast',tags:['fast'],req:ST(2),name:'Favor del Cuidador',icon:'🧓',desc:'Recibes un Yunque de componentes al llegar a nivel 5, 6, 7 y 8.',
 on:{levelUp:c=>{ for(const l of [5,6,7,8]) if(c.d.level>=l&&c.once('l'+l)) c.say(giveAnvil(c.p,'c')); }}});
const grabBag=(id,st,gold)=>AG({id,tier:'G',cat:'reroll',tags:['reroll'],ex:'bolsa_heroica',req:ST(st),name:gold>8?'Bolsa Heroica++':gold>6?'Bolsa Heroica+':'Bolsa Heroica',icon:'🧬',desc:`Recibes 2 Duplicadores menores (copian un Pokémon de coste 1 a 3) y ${gold} de oro.`,
 on:{select:c=>{ c.item('dup_menor'); c.item('dup_menor'); c.p.gold+=gold; }}});
grabBag('bolsa_heroica',2,6); grabBag('bolsa_heroica2',3,8); grabBag('bolsa_heroica3',4,14);
AG({id:'formar_equipo',tier:'S',cat:'reroll',tags:['reroll'],req:ST(2,3),name:'Formar Equipo',icon:'👥',desc:'Recibes un Duplicador menor. Tras 5 combates PvP, otro.',
 on:{select:c=>c.item('dup_menor'),roundEnd:c=>{ if(c.d.pve) return; c.st.n=(c.st.n||0)+1; if(c.st.n===5){ c.item('dup_menor'); c.say('otro Duplicador menor'); } }},ui:c=>(c.st.n||0)>=5?'Entregado':`Combates PvP: ${c.st.n||0}/5`});
AG({id:'construccion_maxima',tier:'G',cat:'reroll',tags:['reroll','fast'],req:ST(4),name:'Construcción Máxima',icon:'🏗️',desc:'Recibes 10 tiendas gratis. Al llegar a nivel 9, otras 3 y un Duplicador (copia cualquier Pokémon).',
 on:{select:c=>{ c.p.freeRerolls+=10; },levelUp:c=>{ if(c.d.level>=9&&c.once('9')){ c.p.freeRerolls+=3; c.item('dup_mayor'); c.say('3 tiendas y un Duplicador'); } }}});
AG({id:'reliquias_radiantes',tier:'P',cat:'carry',tags:['carry'],name:'Reliquias Radiantes',icon:'🌟',desc:'Eliges 1 de 5 objetos radiantes (el doble de fuerza que su objeto; no se craftean) y recibes un Imán Removedor.',
 on:{select:c=>{ c.item('magnet'); c.offer('Reliquias Radiantes','Elige un objeto radiante',pickOpts(RADIANT_KEYS.filter(k=>k!=='rad_zoom'),5)); }}});
AG({id:'picaro_radiante',tier:'P',cat:'carry',tags:['carry'],req:ST(3,4),name:'Pícaro Radiante',icon:'🦹',desc:'Recibes un Guante de Boxeo radiante: cada ronda equipa 2 objetos radiantes al azar a quien lo lleve.',on:{select:c=>c.item('rad_zoom')}});
// Banco de Pandora: los Pokémon de los 3 últimos huecos del banquillo se transforman en otros del mismo coste (conservan estrellas y objetos)
AG({id:'banco_pandora',tier:'S',cat:'risk',req:ST(2,3),name:'Banco de Pandora',icon:'📦',desc:'Al empezar cada ronda, los Pokémon de los 3 huecos de la derecha de tu banquillo se transforman en otros al azar del mismo coste (conservan estrellas y objetos). Recibes 1 de oro.',
 on:{select:c=>{ c.p.gold+=1; c.p.mods.pandoraBench=1; },roundStart:c=>{ const b=c.p.bench; let n=0; for(let i=Math.max(0,b.length-3);i<b.length;i++){ const u=b[i]; if(!u||DEF[u.defId].anvil) continue; const d=DEF[u.baseId];
   const l=UNIT_LIST.filter(x=>x.cost===d.cost&&x.key!==u.baseId&&(!G.pool||G.pool[x.key]>=Math.pow(3,u.star-1))); if(!l.length) continue; const nk=pick(l).key, cp=Math.pow(3,u.star-1);
   returnToPool(u.baseId,cp); if(G.pool) G.pool[nk]-=cp; u.baseId=nk; u.defId=nk; n++; } if(n){ c.say(`${n} Pokémon transformados`); combine(c.p); } }}});
// NO SCOUT NO PIVOT: tus Pokémon que pelean en PvP se quedan para siempre; a cambio, tu equipo crece cada ronda
AG({id:'no_scout',tier:'G',cat:'hybrid',tags:['reroll'],req:ST(2),name:'NO SCOUT NO PIVOT',icon:'🔒',desc:'Los Pokémon que pelean en un combate PvP ya no se pueden vender ni devolver al banquillo. A cambio, tras cada combate PvP tu equipo gana +3% de vida, +3% de ataque y +3 de poder para siempre.',
 on:{select:c=>{ c.p.mods.noPivot=1; },roundEnd:c=>{ if(c.d.pve) return; c.st.n=(c.st.n||0)+1; for(const u of boardUnits(c.p)) u.locked=true; }},
 snap:c=>c.st.n||null,combat:(us,n)=>{ for(const u of us) boost(u,{hp:.03*n,ad:.03*n,ap:3*n}); },ui:c=>`Tu equipo: +${3*(c.st.n||0)}% de vida y ataque y +${3*(c.st.n||0)} de poder`});
// Solo Leveling: el resto de la fase pelea un único Pokémon, muy reforzado; cada baja da 1 de EXP; en la ronda PvE vuelve todo y 2 componentes
AG({id:'solo_leveling',tier:'S',cat:'carry',tags:['carry'],req:ST(2),name:'Solo Leveling',icon:'🗡️',desc:'Hasta la ronda PvE de esta fase solo pelea tu Pokémon más fuerte del tablero, con el doble de vida y +60% de ataque, +60 de poder y +40% de velocidad de ataque. Cada baja que consiga te da 1 de EXP. En la ronda PvE recuperas todos tus huecos y recibes 2 componentes.',
 on:{select:c=>{ c.p.mods.soloLevel=1; c.st.on=1; },kills:c=>{ if(c.st.on&&c.d.n>0) c.xp(c.d.n); },roundStart:c=>{ if(c.st.on&&G.round&&G.round.type==='pve'){ c.st.on=0; c.p.mods.soloLevel=0; c.comp(); c.comp(); c.say('¡vuelven tus huecos! 2 componentes'); } }},
 snap:c=>c.st.on?1:null,combat:us=>{ for(const u of us){ boost(u,{hp:1,ad:.6,ap:60,as:.4,df:20}); } },ui:c=>c.st.on?'Activo: pelea un solo Pokémon':'Terminado'});
// Saqueo (Pilfer): copia del primer Pokémon que derrotas cada combate; con 21 de oro en copias, un Guante de Boxeo
AG({id:'saqueo',tier:'G',cat:'reroll',tags:['reroll'],req:ST(3),name:'Saqueo',icon:'🫳',desc:'Tras cada combate recibes una copia (1★) del primer Pokémon rival que derrotaste. La primera vez que acumules 21 de oro en copias así, recibes un Guante de Boxeo.',
 on:{roundEnd:c=>{ const k=c.d.firstKill; if(!k||!DEF[k]||DEF[k].anvil) return; const base=DEF[k].evoOf||k; giveCopy(c.p,base); c.st.v=(c.st.v||0)+DEF[base].cost; c.say('copia de '+DEF[base].name);
   if(c.st.v>=21&&c.once('g')){ c.item('zoom'); c.say('¡Guante de Boxeo!'); } }},ui:c=>`Copias: ${c.st.v||0}/21 de oro`});
// Préstamo Avanzado / Poder Aumentado: cambian la rareza de tu siguiente aumento
AG({id:'prestamo',tier:'G',cat:'econ',ex:'prestamo',req:ST(2),name:'Préstamo Avanzado',icon:'🏦',desc:'Recibes 20 de oro. Tu siguiente aumento será de una rareza menor.',on:{select:c=>{ c.p.gold+=20; c.p.augShift=(c.p.augShift||0)-1; }}});
AG({id:'prestamo2',tier:'G',cat:'econ',ex:'prestamo',req:ST(3),name:'Préstamo Avanzado+',icon:'🏦',desc:'Recibes 33 de oro. Tu siguiente aumento será de una rareza menor.',on:{select:c=>{ c.p.gold+=33; c.p.augShift=(c.p.augShift||0)-1; }}});
AG({id:'poder_aumentado',tier:'S',cat:'classic',req:ST(3),name:'Poder Aumentado',icon:'⏫',desc:'Tu siguiente aumento será de una rareza mayor.',on:{select:c=>{ c.p.augShift=(c.p.augShift||0)+1; }}});
// Contadores visibles: objetos extra tras cierta cantidad de ataques, daño, daño recibido o maná gastado por tu equipo
const counter=(id,comp,name,need,key,txt)=>AG({id,tier:'S',cat:'classic',req:ST(2),name,icon:'📈',desc:`Recibes ${ITEM_NAME[comp]}. Cuando tu equipo ${txt} ${need.toLocaleString('es')}, recibes 2 más.`,
 on:{select:c=>c.item(comp),roundEnd:c=>{ if(c.st.done||!c.d.cs) return; c.st.v=(c.st.v||0)+Math.round(c.d.cs[key]||0); if(c.st.v>=need){ c.st.done=1; c.item(comp); c.item(comp); c.say(`¡2 × ${ITEM_NAME[comp]}!`); } }},
 ui:c=>c.st.done?'Completado':`${Math.min(need,c.st.v||0).toLocaleString('es')} / ${need.toLocaleString('es')}`});
const ITEM_NAME={wing:'una Pluma Veloz',claw:'una Garra Afilada',club:'un Hueso Grueso',water:'un Agua Mística'};
counter('arcos_reserva','wing','Plumas de Reserva',1000,'atk','haya atacado');
counter('abrir_camino','claw','Abrir Camino',65000,'phys','haya hecho de daño físico');
counter('hebillas_extra','club','Huesos de Más',75000,'taken','haya recibido de daño');
counter('lagrimas','water','Lágrimas que Fluyen',7000,'mana','haya gastado de maná');
// Tiradas de dados (con ventana animada). Con Dados Cargados, siempre el mejor resultado
// Tabla de Slightly Magic Roll (TFT 18.5): 1 → 6 tiendas · 2 → 10 de oro · 3 → coste 2 a 2★ y 3 de oro · 4 → objeto completo e Imán · 5 → +160 de vida a todo el equipo · 6 → emblema
const DICE_SMALL=[null,{t:'6 tiendas gratis',g:p=>{ p.freeRerolls+=6; }},{t:'10 de oro',g:p=>{ p.gold+=10; }},{t:'Un Pokémon de coste 2 a 2★ y 3 de oro',g:p=>{ const k=randKey(2); if(k) giveStar(p,k,2); p.gold+=3; }},
 {t:'Un objeto completo y un Imán Removedor',g:p=>{ augGrant(p,'f'); giveItem(p,'magnet'); }},{t:'+160 de vida para todo tu equipo (para siempre)',g:(p,st)=>{ st.hp160=1; }},{t:'Un emblema al azar',g:p=>{ giveItem(p,'emb_'+pick([...ELEM_TRAITS,...CLASS_TRAITS])); }}];
const rollDie=p=>p.mods.lucky?6:1+Math.floor(Math.random()*6);
function diceReveal(p,title,dice,name,text){ revealTo(p,'🎲',title,name,text,'bueno',dice); }
AG({id:'tirada_magica',tier:'S',cat:'chaos',tags:['chaos'],req:ST(2),name:'Tirada Ligeramente Mágica',icon:'🎲',desc:'Tiras un dado y ganas según el número: 1 → 6 tiendas gratis · 2 → 10 de oro · 3 → Pokémon de coste 2 a 2★ y 3 de oro · 4 → objeto completo e Imán Removedor · 5 → +160 de vida para todo tu equipo · 6 → emblema al azar.',
 on:{select:c=>{ const d=rollDie(c.p), r=DICE_SMALL[d]; r.g(c.p,c.st); c.st.last=r.t; diceReveal(c.p,'Tirada Ligeramente Mágica',[d],`¡Sale un ${d}!`,r.t); }},
 snap:c=>c.st.hp160?1:null,combat:us=>{ for(const u of us) boost(u,{hpf:160}); },ui:c=>c.st.last?`Resultado: ${c.st.last}`:''});
// 3 dados: premio según la suma
const DICE3=[[6,'10 de oro',p=>{ p.gold+=10; }],[9,'2 componentes y 3 de oro',p=>{ augGrant(p,'c'); augGrant(p,'c'); p.gold+=3; }],[11,'Un objeto completo y 4 de oro',p=>{ augGrant(p,'f'); p.gold+=4; }],
 [14,'Un Pokémon de coste 3 a 2★ y un objeto completo',p=>{ const k=randKey(3); if(k) giveStar(p,k,2); augGrant(p,'f'); }],[17,'2 objetos completos y un emblema',p=>{ augGrant(p,'f'); augGrant(p,'f'); giveItem(p,'emb_'+pick([...ELEM_TRAITS,...CLASS_TRAITS])); }],
 [18,'¡Un Legendario a 2★!',p=>{ const k=randKey(5); if(k) giveStar(p,k,2); }]];
function roll3(c,title,min){ const lucky=c.p.mods.lucky; let d=[rollDie(c.p),rollDie(c.p),rollDie(c.p)]; while(min&&lucky&&d[0]+d[1]+d[2]<min) d=[rollDie(c.p),rollDie(c.p),rollDie(c.p)];
 const sum=d[0]+d[1]+d[2], row=DICE3.find(r=>sum<=r[0])||DICE3[DICE3.length-1]; row[2](c.p); c.st.last=`${sum}: ${row[1]}`; diceReveal(c.p,title,d,`Suma ${sum}`,row[1]); }
AG({id:'tirada_magica3',tier:'G',cat:'chaos',tags:['chaos'],req:ST(3),name:'Tirada Mágica',icon:'🎲',desc:'Tiras 3 dados y ganas según la suma: hasta 6 → 10 de oro · 7-9 → 2 componentes y 3 de oro · 10-11 → objeto completo y 4 de oro · 12-14 → coste 3 a 2★ y objeto · 15-17 → 2 objetos y emblema · 18 → Legendario a 2★. Con Dados Cargados, siempre 14 o más.',
 on:{select:c=>roll3(c,'Tirada Mágica',14)},ui:c=>c.st.last?`Última tirada: ${c.st.last}`:''});
AG({id:'inesperado',tier:'P',cat:'chaos',tags:['chaos'],req:ST(2),name:'Lo Esperado de lo Inesperado',icon:'🎲',desc:'Ahora y al empezar las 2 fases siguientes, tiras 3 dados y ganas según la suma (de 10 de oro con poca suerte a un Legendario a 2★ con un 18).',
 on:{select:c=>roll3(c,'Lo Esperado de lo Inesperado'),roundStart:c=>{ if(stageStart()&&(c.st.n||0)<2){ c.st.n=(c.st.n||0)+1; roll3(c,'Lo Esperado de lo Inesperado'); } }},ui:c=>c.st.last?`Última tirada: ${c.st.last} · quedan ${2-(c.st.n||0)}`:''});

/* ---------- Llamada al Caos ---------- */
// Solo en el 3.er aumento (4-2): un premio enorme y al azar, sin maldiciones. 9 resultados con la misma probabilidad (11 %, la tabla del parche 18.5 de TFT;
// los cofres de la suerte, que aquí no existen, son objetos completos). La carta no dice cuál: al elegirla, su descripción muestra la recompensa.
// La versión de oro (Eco del Caos) tiene los mismos resultados, más pequeños.
const CHAOS=[
 {id:'oro',name:'Lluvia de Oro',P:'58 de oro',G:'30 de oro',run:(p,big)=>augGrant(p,'g:'+(big?58:30))},
 {id:'exp',name:'Sabiduría Ancestral',P:'64 de EXP',G:'32 de EXP',run:(p,big)=>augGrant(p,'xp:'+(big?64:32))},
 {id:'tiendas',name:'Mercado Infinito',P:'40 tiendas gratis',G:'20 tiendas gratis',run:(p,big)=>augGrant(p,'rr:'+(big?40:20))},
 {id:'huevo',name:'Huevo de Oro',P:'un objeto completo a elegir y un Huevo de Oro (en 3 rondas: 2 Legendarios y 15 de oro)',G:'un objeto completo a elegir y un Legendario',
  run:(p,big,st)=>{ chaosItems(p,1); if(big){ st.egg=3; return 'objeto a elegir y Huevo de Oro'; } return 'objeto a elegir y '+augGrant(p,'uc:5'); }},
 {id:'forja',name:'Forja del Caos',P:'2 componentes y 2 emblemas a elegir',G:'un componente y un emblema a elegir',
  run:(p,big)=>{ for(let i=0;i<(big?2:1);i++){ augOffer(p,'__chaos','Forja del Caos','Elige un componente',shuffle(BASIC.filter(k=>k!=='medal')).slice(0,3).map(k=>({t:ITEMS[k].name,i:ITEMS[k].icon,d:ITEMS[k].desc,v:'it:'+k}))); augOffer(p,'__chaos','Forja del Caos','Elige un emblema',emblemOpts([...ELEM_TRAITS,...CLASS_TRAITS],p)); } return big?'2 componentes y 2 emblemas a elegir':'un componente y un emblema a elegir'; }},
 {id:'botin',name:'Botín del Team Rocket',P:'3 objetos completos al azar',G:'2 objetos completos al azar',run:(p,big)=>Array.from({length:big?3:2},()=>augGrant(p,'f')).join(', ')},
 {id:'guantes',name:'Guantes de Ladrón',P:'3 Guantes de Boxeo',G:'un Guante de Boxeo y 5 de oro',run:(p,big)=>big?[augGrant(p,'it:zoom'),augGrant(p,'it:zoom'),augGrant(p,'it:zoom')].join(', '):[augGrant(p,'it:zoom'),augGrant(p,'g:5')].join(', ')},
 {id:'componentes',name:'Saco de Componentes',P:'6 componentes distintos',G:'4 componentes distintos',run:(p,big)=>shuffle(BASIC.slice()).slice(0,big?6:4).map(k=>augGrant(p,'it:'+k)).join(', ')},
 {id:'radiante',name:'Cofre Radiante',P:'8 de oro y un objeto radiante al azar',G:'4 de oro y un objeto completo a elegir',run:(p,big)=>{ augGrant(p,'g:'+(big?8:4)); if(big) return '8 de oro y '+augGrant(p,'it:'+pick(RADIANT_KEYS.filter(k=>k!=='rad_zoom'))); chaosItems(p,1); return '4 de oro y un objeto a elegir'; }},
];
const chaosItems=(p,n)=>{ for(let i=0;i<n;i++) augOffer(p,'__chaos','Llamada al Caos','Elige un objeto completo',shuffle(FULL_KEYS.slice()).slice(0,4).map(k=>({t:ITEMS[k].name,i:ITEMS[k].icon,d:ITEMS[k].desc,v:'it:'+k}))); };
// Resultados que el jugador debe ver aunque no esté mirando: se muestran en una ventana (también en multijugador, vía priv.rv)
function revealTo(p,icon,title,name,text,kind,dice){
 p.rvSeq=(p.rvSeq||0)+1; (p.reveals=p.reveals||[]).push([p.rvSeq,icon,title,name,text,kind||'',dice||0]); if(p.reveals.length>3) p.reveals=p.reveals.slice(-3);
}
function chaosRoll(c,big){
 const o=pick(CHAOS), txt=o.run(c.p,big,c.st); const title=big?'Llamada al Caos':'Eco del Caos';
 c.st.last=o.name; c.st.r=big?o.P:o.G; (c.p.chaosLog=c.p.chaosLog||[]).push([G.round?G.round.s+'-'+G.round.n:'',o.id]);
 c.say(`${o.name}: ${txt}`); revealTo(c.p,'🌪️',title,o.name,`${big?o.P:o.G}.`,'bueno');
}
const AUG_EVENTS={
 __anvil:{id:'__anvil',name:'Yunque',icon:'⚒️',on:{pick:c=>{ const k=String(c.d.v).slice(3); if(ITEMS[k]){ giveItem(c.p,k,true); c.say(ITEMS[k].name); } }}},
 __chaos:{id:'__chaos',name:'Llamada al Caos',icon:'🌪️',on:{pick:c=>c.say(augGrant(c.p,c.d.v))}},
};
// Huevo de Oro del Caos: eclosiona a las 3 rondas
function chaosTick(p,evt){
 if(evt!=='roundStart'||!augOwned(p,'llamada_caos')) return; const st=augState(p,'llamada_caos');
 if(st.egg>0&&--st.egg===0){ const a=augGrant(p,'uc:5'), b=augGrant(p,'uc:5'); p.gold+=15; note(p,'🌪️ ¡Eclosiona el Huevo de Oro!',false); revealTo(p,'🥚','Huevo de Oro','¡Eclosiona!',`${a}, ${b} y 15 de oro.`,'bueno'); }
}

/* ---------- registro, ofertas y selección ---------- */
const AUGS=AUG_DEFS.map(a=>({...a,apply:p=>augFire1(p,a,'select')}));
const AUG_BY={}; for(const a of AUGS) AUG_BY[a.id]=a;
function augFire1(p,def,evt,d){ const f=def.on&&def.on[evt]; if(f){ AUG_DEPTH++; try{ f(augCtx(p,def,d)); } finally{ AUG_DEPTH--; } } }
// Aleatoriedad centralizada: con G.augSeed (modo depuración) las ofertas son reproducibles
function augRand(){ if(G&&G.augSeed!=null){ G.augRng=G.augRng||mulberry32(G.augSeed>>>0); return G.augRng(); } return Math.random(); }
// Peso de un aumento para un jugador: el base, más si encaja con lo que tiene (sin obligar: siempre puede pivotar)
function augWeight(p,a){
 let w=a.w; const c=traitCounts(p);
 for(const t of a.tags){ if(TRAITS[t]&&c[t]) w*=1.35; }
 if(a.tags.includes('win')&&p.streak>=2) w*=1.25; if(a.tags.includes('lose')&&p.streak<=-2) w*=1.25;
 if(a.tags.includes('fast')&&p.gold>=30) w*=1.15; if(a.tags.includes('reroll')&&allUnits(p).some(u=>u.star===2&&DEF[u.defId].cost<=2)) w*=1.2;
 return w;
}
function augmentChoices(p,tier,n=3){
 const groups=new Set(p.augments.map(id=>AUG_BY[id]&&AUG_BY[id].ex).filter(Boolean));
 // Los aumentos de héroe solo salen en 2-1 y 3-2: después ya estás comprometido con tu estilo de juego
 let pool=AUGS.filter(a=>a.tier===tier&&!p.augments.includes(a.id)&&!(a.ex&&groups.has(a.ex))&&(!a.req||a.req(p))&&!(a.hero&&G&&G.round&&G.round.s>=4));
 const out=[]; const cats=new Set();
 while(out.length<n&&pool.length){
   // Ruleta ponderada; se evita repetir categoría mientras haya alternativas
   const cand=pool.filter(a=>!cats.has(a.cat)).length?pool.filter(a=>!cats.has(a.cat)):pool;
   const tot=cand.reduce((s,a)=>s+augWeight(p,a),0); let r=augRand()*tot, pickA=cand[cand.length-1];
   for(const a of cand){ r-=augWeight(p,a); if(r<=0){ pickA=a; break; } }
   out.push(pickA.id); cats.add(pickA.cat); pool=pool.filter(a=>a!==pickA&&!(pickA.ex&&a.ex===pickA.ex));
 }
 return out;
}
function applyAugment(p,a){
 if(!a||p.augments.includes(a.id)) return false;
 p.augments.push(a.id); augState(p,a.id); note(p,`✨ Aumento ${TIER_NAME[a.tier]}: ${a.name}`);
 augFire1(p,a,'select');
 return true;
}
// Texto de progreso de cada aumento (para el panel)
function augProgress(p,id){ const def=AUG_BY[id]; if(!def||!def.ui) return ''; try{ return def.ui(augCtx(p,def)); }catch(e){ return ''; } }
// Sinergias que encaja un aumento con lo que tiene el jugador (para la tarjeta de la oferta)
function augFits(p,a){ const c=traitCounts(p); return a.tags.filter(t=>TRAITS[t]&&c[t]); }


// Sprite de cada aumento: objeto de PokeAPI, Pokémon (número) o medalla (b + número). El emoji queda de reserva.
const AUG_IMG={"escalera":"up-grade","unidos":"soothe-bell","dados":"lucky-egg","llamada_clan":"poke-flute","safari":"safari-ball","vanguardia":"protective-pads","eco_caos":"rocky-helmet","huevo":"mystery-egg","paga_extra":"nugget","fondo_emergencia":"revive","ahorro_profesor":"coin-case","reserva_balls":"premier-ball","crianza":"oval-stone","investigacion_campo":"poke-radar","equipo_cria":"destiny-knot","prodigio":"exp-share","crecimiento":"exp-candy-xl","impulso":"x-speed","revancha":"red-card","emb_elemental":"berry-pouch","combustion":"fire-stone","corriente":"water-stone","fotosintesis":"leaf-stone","sobrecarga":"thunder-stone","nocturnos":"dusk-stone","supervivientes":"max-potion","entreno_diario":"power-weight","coleccionista":"pokemon-box-link","extremo":"macho-brace","pacto_cruel":"black-sludge","pandora":"zygarde-cube","ticket_dorado":"rainbow-pass","entreno_combate":"power-anklet","h_dusknoir":355,"amuleto2":"amulet-coin","banco_rocket":"gold-teeth","comerciante_trigal":"relic-gold","inversion":"pearl","intercambio_eq":"old-amber","paciencia_evo":"everstone","investigacion_fin":"silph-scope","profesor_pokemon":"rare-candy","evolucion_temprana":"miracle-seed","especialista":"repeat-ball","insignias":"b1","camino_campeon":"bicycle","regalo_cumple":"sweet-heart","invicto":"dire-hit","rivalidad":"vs-seeker","racha_dorada":"comet-shard","regreso":"max-revive","voluntad":"iron","emb_clase":"ability-capsule","medalla2":"bottle-cap","concentracion":"mind-plate","espectro":"spooky-plate","ultima_linea":"stone-plate","formacion_kanto":"town-map","relampago":"quick-ball","depredadores":"sharp-beak","cazadores":"dusk-ball","favorito":"luxury-ball","academia":"tm-case","apoyo":"heal-ball","cadena_evo":"zap-plate","dominio":"prism-scale","pacto_rocket":"card-key","poder_prohibido":"adrenaline-orb","llamada_caos":"metronome","aguante":"focus-band","ultraball":"ultra-ball","diferente":"odd-incense","h_alakazam":65,"h_raichu":26,"h_machamp":68,"h_lucario":448,"h_charizard":6,"h_meowth":52,"h_ditto":132,"amuleto3":"big-nugget","mercado_negro":"smoke-ball","laboratorio_evo":"dna-splicers","expedicion":"lustrous-orb","maestro":"cherish-ball","ultima_ball":"poke-ball","emb_doble":"b2","legado_arceus":"blank-plate","linaje":"draco-plate","monotipo":"shiny-stone","hiper_carry":"reveal-glass","proyecto_mew":151,"campeon_sinnoh":"adamant-orb","equipo_imposible":"star-piece","caos_absoluto":"griseous-orb","corona_maldita":"relic-crown","master":"master-ball","forja_portatil":"hard-stone","h_gengar":94,"h_gyarados":130,"h_clefable":36};
// Sprite por categoría para los aumentos sin uno propio
const CAT_IMG={econ:"amulet-coin",fast:"exp-candy-xl",reroll:"repeat-ball",emblem:"ability-capsule",trait:"prism-scale",rules:"town-map",carry:"luxury-ball",classic:"ultra-ball",quest:"adamant-orb",streak:"comet-shard",slow:"everstone",risk:"smoke-ball",hybrid:"power-weight",chaos:"metronome",evo:"dna-splicers"};
for(const a of AUGS){ const v=AUG_IMG[a.id]!=null?AUG_IMG[a.id]:CAT_IMG[a.cat]; if(v!=null) a.img=typeof v==='number'?`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${v}.png`:/^b\d+$/.test(v)?`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/badges/${v.slice(1)}.png`:`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${v}.png`; }
// Icono propio (img/aug/<id>.webp, estilo TFT ya teñido con su rareza; iconos-aumentos-tft.js de la skill de recursos): todos menos los
// de héroe, que siguen con la ilustración de su Pokémon. Al cambiar iconos o rarezas, regenera y sube AUG_ICO_V (el navegador guarda las imágenes 7 días).
const AUG_ICO_V=4;
for(const a of AUGS) if(!a.hero) a.ico=`img/aug/${a.id}.webp?v=${AUG_ICO_V}`;
