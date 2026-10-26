/* Cosméticos y gacha (compartido: navegador y servidor). Todo es visual: nada de esto entra en la simulación del combate.
   Lo que tiene cada cuenta se guarda como claves cortas en users.cosm: {inv:[claves], eq:{hueco:clave}, pity, dust, day, nonce, hist}.
   Sin imágenes nuevas: cada premio es un color, un degradado, un texto, un icono PX o un efecto existente con otro color. */
var COSM = (function () {
  var C = {
    PITY: 200,             // mítica garantizada en esta tirada (la diaria también cuenta): la primera que te falte de MYTHICS
    MYTHIC_P: 0.001,       // 0,1 % fijo por tirada, sin subida progresiva
    PRICE: 400, PRICE10: 3600,
    REFUND: 75,            // «caramelos de vuelta» (siempre menos que la tirada)
    EEVEE: 'tac:eevee',    // claves de inventario de las minileyendas míticas
    MEW: 'tac:mew',
    BIG_DUST: 1500,        // si ya tienes todas las míticas, la mítica da Polvo Estelar
    LOCKED_TACS: ['eevee', 'mew', 'onix', 'hitmonlee', 'hitmonchan', 'lickitung', 'tangela', 'chansey', 'kangaskhan', 'mrmime', 'jynx', 'electabuzz', 'magmar', 'pinsir', 'tauros', 'porygon', 'omanyte', 'kabuto', 'scyther', 'lapras', 'snorlax', 'ditto', 'aerodactyl', 'articuno', 'zapdos', 'moltres', 'mewtwo', 'chikorita', 'abra', 'dratini', 'caterpie', 'weedle', 'pidgey', 'rattata', 'spearow', 'ekans', 'sandshrew', 'nidoranf', 'nidoranm', 'zubat', 'oddish', 'paras', 'venonat', 'diglett', 'meowth', 'psyduck', 'mankey', 'poliwag', 'bellsprout', 'tentacool', 'geodude', 'doduo', 'seel', 'grimer', 'shellder', 'drowzee', 'krabby', 'voltorb', 'koffing', 'horsea', 'goldeen', 'magikarp', 'clefairy', 'vulpix', 'jigglypuff', 'growlithe', 'machop', 'ponyta', 'slowpoke', 'magnemite', 'gastly', 'exeggcute', 'cubone', 'rhyhorn', 'staryu', 'farfetchd'],// minileyendas que no son gratuitas (las raras, épicas y legendarias de 1.ª gen salen en el gacha)
    DEFAULT_TAC: 'charmander', // a la que pasan las cuentas que tenían Eevee sin haberla conseguido
    HIST: 20,              // tiradas que se guardan en el historial
  };
  // Rarezas: probabilidad, polvo por repetido y precio en la tienda de Polvo Estelar
  C.TIERS = [
    { k: 'm', name: 'Mítica', p: 0.001, dust: 0, price: 0, col: '#ff9ad8' },
    { k: 'l', name: 'Legendaria', p: 0.017, dust: 300, price: 1800, col: '#ffd23f' },
    { k: 'e', name: 'Épica', p: 0.082, dust: 80, price: 450, col: '#b48cff' },
    { k: 'r', name: 'Rara', p: 0.30, dust: 20, price: 120, col: '#7fb2ff' },
    { k: 'c', name: 'Común', p: 0.60, dust: 5, price: 30, col: '#b9b4d4' },
  ];
  C.TIER = {}; C.TIERS.forEach(function (t) { C.TIER[t.k] = t; });
  C.REFUND_SHARE = 0.25; // dentro de las comunes, 1 de cada 4 son caramelos de vuelta (15 % de todas las tiradas)
  // Tipos (prefijo de la clave): nombre del hueco que ocupa al equiparlo
  C.TYPES = { nc: 'Color del nombre', tt: 'Título', ic: 'Icono de perfil', fr: 'Marco', tr: 'Rastro', gr: 'Saludos', th: 'Tema del perfil', ac: 'Acento de amigos', fb: 'Bola de fuego', tl: 'Casillas', cr: 'Cristales', br: 'Barrera', fn: 'Fanfarria', sh: 'Variocolor', tac: 'Minileyenda' };
  // Paleta por elemento (colecciones)
  var P = { fuego: ['#ff6a2a', '#ffd23f'], agua: ['#3f9dff', '#7fe0ff'], planta: ['#3fbf5a', '#b8f06a'], electrico: ['#ffd23f', '#fff6a8'], psiquico: ['#ff5fb0', '#b48cff'], dragon: ['#7a5cff', '#3fd0c9'], hielo: ['#9fe8ff', '#ffffff'], siniestro: ['#7a5a9e', '#c94a6a'] };
  var NAME = { fuego: 'Fuego', agua: 'Agua', planta: 'Planta', electrico: 'Eléctrico', psiquico: 'Psíquico', dragon: 'Dragón', hielo: 'Hielo', siniestro: 'Siniestro' };
  var L = [];
  function I(key, name, t, data, col) { L.push({ key: key, name: name, t: t, d: data || {}, col: col || '' }); }
  // ----- Comunes -----
  I('cd', 'Caramelos de vuelta', 'c', { candy: C.REFUND });
  Object.keys(P).forEach(function (k) { I('nc:' + k, 'Nombre ' + NAME[k], 'c', { c: P[k][0] }, k); });
  I('nc:plata', 'Nombre Plata', 'c', { c: '#d6dde8' }); I('nc:bronce', 'Nombre Bronce', 'c', { c: '#d08b4f' }); I('nc:rosa', 'Nombre Rosa', 'c', { c: '#ff9ad8' }); I('nc:menta', 'Nombre Menta', 'c', { c: '#7dffa8' });
  [['novato', 'Entrenador Novato'], ['reroll', 'Rey del Reroll'], ['economista', 'Economista de Azulona'], ['domador', 'Domador de Dragones'], ['coleccionista', 'Coleccionista'], ['estratega', 'Estratega'],
   ['pescador', 'Pescador de Magikarp'], ['veterano', 'Veterano de la Liga'], ['madrugador', 'Madrugador'], ['rachas', 'Señor de las Rachas'], ['carrusel', 'Rey del Carrusel'], ['interes', 'Amante del Interés']]
    .forEach(function (x) { I('tt:' + x[0], x[1], 'c', { text: x[1] }); });
  [['ball', 'Poké Ball', '#e0412f'], ['star', 'Estrella', '#ffd23f'], ['trophy', 'Trofeo', '#ffd23f'], ['crystal', 'Cristal', '#9cd3ff'], ['swords', 'Espadas', '#d6dde8'], ['medal', 'Medalla', '#ffd23f'], ['candy', 'Caramelo', '#9cd3ff'], ['coin', 'Moneda', '#ffd23f']]
    .forEach(function (x) { I('ic:' + x[0], 'Icono ' + x[1], 'c', { i: x[0], c: x[2] }); });
  // ----- Raras -----
  Object.keys(P).forEach(function (k) { I('nc:g_' + k, 'Degradado ' + NAME[k], 'r', { g: P[k] }, k); });
  I('nc:g_atardecer', 'Degradado Atardecer', 'r', { g: ['#ff7a59', '#b44cff'] }); I('nc:g_aurora', 'Degradado Aurora', 'r', { g: ['#3fd0c9', '#7dffa8'] });
  I('fr:oro', 'Marco de Oro', 'r', { c: ['#ffd23f', '#b07a12'] }); I('fr:plata', 'Marco de Plata', 'r', { c: ['#e8edf5', '#8a94a6'] });
  ['fuego', 'agua', 'planta', 'psiquico', 'dragon', 'siniestro'].forEach(function (k) { I('fr:' + k, 'Marco ' + NAME[k], 'r', { c: P[k] }, k); });
  ['fuego', 'agua', 'planta', 'electrico', 'psiquico', 'dragon', 'hielo', 'siniestro'].forEach(function (k) { I('tr:' + k, 'Rastro ' + NAME[k], 'r', { c: P[k] }, k); });
  [['amable', 'Saludos amables', ['¡Hola!', '¡Buena suerte!', '¡Bien jugado!']], ['rival', 'Saludos de rival', ['¿Eso es todo?', '¡Te tengo!', 'Ni lo intentes']], ['pokemon', 'Saludos de entrenador', ['¡Yo te elijo!', '¡Hazte con todos!', '¡Atrapado!']],
   ['calma', 'Saludos tranquilos', ['Tranquilidad…', 'Todo según el plan', 'Paciencia']], ['fiesta', 'Saludos de fiesta', ['¡Vamos!', '¡Qué combo!', '¡Fiesta!']], ['sabio', 'Saludos sabios', ['Interesante…', 'Lo vi venir', 'Aprende de esto']]]
    .forEach(function (x) { I('gr:' + x[0], x[1], 'r', { lines: x[2] }); });
  // ----- Épicas -----
  [['arcoiris', 'Arcoíris', ['#ff5f5f', '#ffd23f', '#7dffa8', '#7fb2ff', '#b48cff']], ['fuego', 'Llamarada', ['#ff3d1f', '#ffd23f', '#ff6a2a']], ['agua', 'Oleaje', ['#1f6fff', '#7fe0ff', '#3f9dff']],
   ['galaxia', 'Galaxia', ['#7a5cff', '#ff5fb0', '#3fd0c9']], ['oro', 'Oro Puro', ['#b07a12', '#fff2a8', '#ffd23f']], ['aurora', 'Aurora Boreal', ['#3fd0c9', '#7dffa8', '#b48cff']]]
    .forEach(function (x) { I('nc:a_' + x[0], 'Nombre ' + x[1], 'e', { a: x[2] }, x[0] === 'fuego' || x[0] === 'agua' ? x[0] : ''); });
  ['fuego', 'agua', 'planta', 'psiquico', 'dragon'].forEach(function (k) { I('th:' + k, 'Tema ' + NAME[k], 'e', { c: P[k] }, k); }); I('th:oro', 'Tema Dorado', 'e', { c: ['#ffd23f', '#b07a12'] });
  ['fuego', 'agua', 'planta', 'psiquico', 'dragon'].forEach(function (k) { I('ac:' + k, 'Acento ' + NAME[k], 'e', { c: P[k][0] }); }); I('ac:oro', 'Acento Dorado', 'e', { c: '#ffd23f' });
  [['azul', 'Azul', '#3f9dff'], ['verde', 'Verde', '#3fbf5a'], ['morada', 'Morada', '#b48cff'], ['rosa', 'Rosa', '#ff5fb0'], ['dorada', 'Dorada', '#ffd23f']].forEach(function (x) { I('fb:' + x[0], 'Bola de fuego ' + x[1], 'e', { c: x[2] }); });
  [['fuego', P.fuego], ['agua', P.agua], ['planta', P.planta], ['psiquico', P.psiquico], ['oro', ['#ffd23f', '#b07a12']]].forEach(function (x) { I('tl:' + x[0], 'Casillas ' + (NAME[x[0]] || 'Doradas'), 'e', { c: x[1] }, NAME[x[0]] ? x[0] : ''); });
  [['rubi', 'Rubí', '#e0412f'], ['esmeralda', 'Esmeralda', '#3fbf5a'], ['zafiro', 'Zafiro', '#3f7fe0'], ['amatista', 'Amatista', '#b48cff'], ['oro', 'Oro', '#ffd23f']].forEach(function (x) { I('cr:' + x[0], 'Cristales de ' + x[1], 'e', { c: x[2] }); });
  [['fuego', P.fuego], ['planta', P.planta], ['psiquico', P.psiquico], ['dragon', P.dragon], ['oro', ['#ffd23f', '#fff2a8']]].forEach(function (x) { I('br:' + x[0], 'Barrera ' + (NAME[x[0]] || 'Dorada'), 'e', { c: x[1] }); });
  [['triunfo', 'Triunfo', [523, 659, 784, 1047]], ['liga', 'Himno de la Liga', [392, 523, 659, 784, 1047]], ['arcade', 'Arcade', [659, 880, 1319, 1760]], ['campanas', 'Campanas', [784, 988, 1175, 1568]]]
    .forEach(function (x) { I('fn:' + x[0], 'Fanfarria ' + x[1], 'e', { notes: x[2] }); });
  // ----- Legendarias: variocolor de las minileyendas gratuitas (cambio de tono en el shader, sin modelos nuevos) -----
  [['charmander', 'Charmander', 0.08, 0.13], ['bulbasaur', 'Bulbasaur', 0.38, 0.22], ['squirtle', 'Squirtle', 0.55, 0.78], ['dratini', 'Dratini', 0.62, 0.85], ['pichu', 'Pichu', 0.14, 0.05], ['abra', 'Abra', 0.13, 0.95], ['chikorita', 'Chikorita', 0.30, 0.16]]
    .forEach(function (x) { I('sh:' + x[0], x[1] + ' variocolor', 'l', { tac: x[0], from: x[2], to: x[3] }); });
  // ----- Mítica -----
  I(C.EEVEE, 'Eevee', 'm', { tac: 'eevee' });
  I(C.MEW, 'Mew', 'm', { tac: 'mew' });
  C.MYTHICS = [C.EEVEE, C.MEW]; // en este orden las da la garantía
  // ----- Minileyendas de 1.ª gen del gacha (rara, épica o legendaria; repetidas → polvo; también en la tienda de polvo) -----
  [["onix","Onix","r"],["hitmonlee","Hitmonlee","r"],["hitmonchan","Hitmonchan","r"],["lickitung","Lickitung","r"],["tangela","Tangela","r"],["chansey","Chansey","r"],["kangaskhan","Kangaskhan","r"],["mrmime","Mr. Mime","r"],["jynx","Jynx","r"],["electabuzz","Electabuzz","r"],["magmar","Magmar","r"],["pinsir","Pinsir","r"],["tauros","Tauros","r"],["porygon","Porygon","r"],["omanyte","Omanyte","r"],["kabuto","Kabuto","r"],["scyther","Scyther","r"],["lapras","Lapras","e"],["snorlax","Snorlax","e"],["ditto","Ditto","e"],["aerodactyl","Aerodactyl","e"],["articuno","Articuno","l"],["zapdos","Zapdos","l"],["moltres","Moltres","l"],["mewtwo","Mewtwo","l"]].forEach(function (x) { I('tac:' + x[0], x[1], x[2], { tac: x[0] }); });
  // ----- Minileyendas comunes y poco comunes de 1.ª gen, más Dratini, Abra y Chikorita: también solo del gacha (gratis quedan Charmander, Bulbasaur, Squirtle y Pichu) -----
  [["chikorita","Chikorita","r"],["abra","Abra","r"],["dratini","Dratini","r"],["caterpie","Caterpie","c"],["weedle","Weedle","c"],["pidgey","Pidgey","c"],["rattata","Rattata","c"],["spearow","Spearow","c"],["ekans","Ekans","c"],["sandshrew","Sandshrew","c"],["nidoranf","Nidoran♀","c"],["nidoranm","Nidoran♂","c"],["zubat","Zubat","c"],["oddish","Oddish","c"],["paras","Paras","c"],["venonat","Venonat","c"],["diglett","Diglett","c"],["meowth","Meowth","c"],["psyduck","Psyduck","c"],["mankey","Mankey","c"],["poliwag","Poliwag","c"],["bellsprout","Bellsprout","c"],["tentacool","Tentacool","c"],["geodude","Geodude","c"],["doduo","Doduo","c"],["seel","Seel","c"],["grimer","Grimer","c"],["shellder","Shellder","c"],["drowzee","Drowzee","c"],["krabby","Krabby","c"],["voltorb","Voltorb","c"],["koffing","Koffing","c"],["horsea","Horsea","c"],["goldeen","Goldeen","c"],["magikarp","Magikarp","c"],["clefairy","Clefairy","r"],["vulpix","Vulpix","r"],["jigglypuff","Jigglypuff","r"],["growlithe","Growlithe","r"],["machop","Machop","r"],["ponyta","Ponyta","r"],["slowpoke","Slowpoke","r"],["magnemite","Magnemite","r"],["gastly","Gastly","r"],["exeggcute","Exeggcute","r"],["cubone","Cubone","r"],["rhyhorn","Rhyhorn","r"],["staryu","Staryu","r"],["farfetchd","Farfetch'd","r"]].forEach(function (x) { I('tac:' + x[0], x[1], x[2], { tac: x[0] }); });
  // ----- Títulos de colección (no salen en el gacha ni se compran: se ganan al completar la colección) -----
  C.COLLECTIONS = [['fuego', 'Corazón de Llama'], ['agua', 'Señor de las Mareas'], ['planta', 'Guardián del Bosque'], ['psiquico', 'Mente Maestra'], ['dragon', 'Sangre de Dragón']].map(function (x) {
    var key = 'tt:col_' + x[0]; I(key, x[1], 'x', { text: x[1], col: x[0] });
    return { k: x[0], name: 'Colección ' + NAME[x[0]], reward: key, items: L.filter(function (i) { return i.col === x[0] && i.t !== 'x'; }).map(function (i) { return i.key; }) };
  });
  C.LIST = L; C.BY = {}; L.forEach(function (i) { C.BY[i.key] = i; });
  C.POOL = {}; C.TIERS.forEach(function (t) { C.POOL[t.k] = L.filter(function (i) { return i.t === t.k && i.key !== 'cd'; }).map(function (i) { return i.key; }); });
  C.typeOf = function (key) { return String(key).split(':')[0]; };
  C.isItem = function (key) { return !!C.BY[key] && key !== 'cd'; };
  // Huecos que ven los demás (viajan en una cadena corta «nc:fuego|tt:domador|…» una vez por partida y en la lista de amigos).
  // th (tema) y ac (acento de amigos) solo se ven en el perfil y en tu propio panel.
  // Estandartes del gacha: en cada uno solo salen sus minileyendas destacadas (tac:); el resto del catálogo (variocolor, títulos, marcos…)
  // sale en todos. La mítica (0,1 %) y su garantía en la tirada PITY solo existen en el de Eevee y Mew; en los otros ese tramo da un premio legendario
  C.BANNERS = { eevee: { tacs: ['eevee', 'mew'], mythic: true }, aves: { tacs: ['articuno', 'zapdos', 'moltres'] }, kanto: { tacs: ['mewtwo', 'ditto', 'snorlax'] } };
  C.BANNER_KEYS = Object.keys(C.BANNERS);
  C.bannerPool = function (b, t) { var B = C.BANNERS[b] || C.BANNERS.eevee; return C.POOL[t].filter(function (k) { return k.indexOf('tac:') !== 0 || B.tacs.indexOf(k.slice(4)) >= 0; }); };
  C.PUB_SLOTS = ['nc', 'tt', 'ic', 'fr', 'tr', 'gr', 'fb', 'tl', 'cr', 'br', 'fn', 'sh'];
  C.SLOTS = ['nc', 'tt', 'ic', 'fr', 'th', 'ac', 'tr', 'gr', 'fb', 'tl', 'cr', 'br', 'fn', 'sh'];
  C.validEq = function (slot, key) { return C.SLOTS.indexOf(slot) >= 0 && !!C.BY[key] && C.typeOf(key) === slot; };
  C.eqString = function (eq, slots) { slots = slots || C.PUB_SLOTS; var out = []; if (eq && typeof eq === 'object') slots.forEach(function (s) { if (C.validEq(s, eq[s])) out.push(eq[s]); }); return out.join('|').slice(0, 200); };
  C.parseCs = function (cs) { var o = {}; String(cs || '').slice(0, 200).split('|').forEach(function (k) { var s = C.typeOf(k); if (C.validEq(s, k)) o[s] = k; }); return o; };
  // Rivales generados: llevan cosméticos como las personas (si no, un nombre siempre liso los delataría). Cada hueco con su
  // probabilidad de ir equipado y el premio sorteado con el peso de su rareza (lo común, más a menudo)
  C.BOT_EQUIP = { nc: 0.55, tt: 0.45, ic: 0.35, fr: 0.4, tr: 0.3, gr: 0.25, fb: 0.15, tl: 0.15, cr: 0.15, br: 0.15, fn: 0.1, sh: 0.03 };
  C.botEquip = function (rng) { rng = rng || Math.random; var out = [];
    Object.keys(C.BOT_EQUIP).forEach(function (s) { if (rng() >= C.BOT_EQUIP[s]) return;
      var items = L.filter(function (i) { return C.typeOf(i.key) === s && C.TIER[i.t]; }), tot = 0;
      items.forEach(function (i) { tot += C.TIER[i.t].p / C.POOL[i.t].length; });
      var r = rng() * tot; for (var j = 0; j < items.length; j++) { r -= C.TIER[items[j].t].p / C.POOL[items[j].t].length; if (r <= 0) { out.push(items[j].key); break; } } });
    return out.join('|'); };
  // ¿La cuenta puede usar esta minileyenda? (cosm puede venir vacío o de una cuenta antigua)
  C.ownsTac = function (cosm, k) { return C.LOCKED_TACS.indexOf(k) < 0 || !!(cosm && Array.isArray(cosm.inv) && cosm.inv.indexOf('tac:' + k) >= 0); };
  C.missingMythics = function (cosm) { var inv = cosm && Array.isArray(cosm.inv) ? cosm.inv : []; return C.MYTHICS.filter(function (k) { return inv.indexOf(k) < 0; }); };
  C.hasEevee = function (cosm) { return !!(cosm && Array.isArray(cosm.inv) && cosm.inv.indexOf(C.EEVEE) >= 0); };
  C.pityLeft = function (cosm) { var p = cosm && Number.isFinite(+cosm.pity) ? Math.max(0, Math.min(C.PITY - 1, +cosm.pity | 0)) : 0; return C.PITY - p; };
  // Lo que ve el propio jugador de su colección (nunca de otros: a los demás solo les llega lo equipado)
  C.publicCosm = function (cosm) { cosm = cosm || {}; return { inv: Array.isArray(cosm.inv) ? cosm.inv.slice(0, 400) : [], eq: cosm.eq && typeof cosm.eq === 'object' ? cosm.eq : {}, pity: C.PITY - C.pityLeft(cosm), dust: Math.max(0, +cosm.dust || 0), eevee: C.hasEevee(cosm) }; };
  return C;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = COSM;
