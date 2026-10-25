/* Idiomas (solo navegador). Todo el texto del juego está escrito en español en el código y en el HTML; este archivo lo traduce al inglés.
   - I18N.EN: diccionario español → inglés con el texto tal cual se ve (nodos de texto, atributos title/placeholder/aria-label/alt, avisos).
     Las cifras se normalizan: la clave lleva {0}, {1}… donde el texto tiene números y se rellenan con los reales («Nivel {0}»). Una clave
     con {n} en una posición que no es una cifra (nombres de jugador o de Pokémon) se compara como patrón: «Victoria contra {0}».
   - TR(s): la traducción de s si el idioma es inglés (exacta, por cifras o por patrón); si no la hay, el mismo español. Para lo que no
     pasa por el DOM: lienzo, document.title, confirmaciones.
   - Un MutationObserver traduce cada nodo de texto y cada atributo que entra en el DOM: los paneles que se pintan con innerHTML no
     necesitan tocarse. Cada nodo guarda su español (__es) para volver a él al cambiar de idioma. Lo que lleva translate="no" (nombres
     de jugadores, campos de texto) no se toca. El idioma se guarda en los ajustes (S.lang) y viaja a la cuenta como los demás. */
var I18N = (function () {
  var C = { lang: 'es', EN: {}, locale: 'es-ES' };
  var cache = new Map(), pats = null, NUM = /\d+(?:[.,]\d+)*/g;
  var ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  function compilePats() { pats = []; for (var k in C.EN) if (k.indexOf('{') >= 0) { var re = '^' + k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\d+\}/g, '([\\s\\S]+?)') + '$'; pats.push([new RegExp(re), k, k.replace(/{d+}/g, '').length]); } pats.sort(function (a, b) { return b[2] - a[2]; }); } // el más específico (más texto literal) primero: «{0} · Nivel {1} · Toca…» antes que «{0} · Nivel {1}»
  // Traducción de una cadena (ya recortada). Devuelve null si no hay
  function lookup(s) {
    var en = C.EN[s]; if (en != null) return en;
    var nums = [], k = s.replace(NUM, function (m) { nums.push(m); return '{' + (nums.length - 1) + '}'; });
    if (nums.length && (en = C.EN[k]) != null) return en.replace(/\{(\d+)\}/g, function (_, i) { return nums[+i] != null ? nums[+i] : ''; });
    if (!pats) compilePats();
    for (var i = 0; i < pats.length; i++) { var m = pats[i][0].exec(s); if (m) { var caps = m.slice(1), args = C.EN[pats[i][1]]; return args.replace(/\{(\d+)\}/g, function (_, j) { var c = caps[+j]; return c != null ? (lookup(c) || c) : ''; }); } }
    // Textos compuestos (descripciones de habilidades y aumentos): se traducen por partes (« · » y frases) si el conjunto no está
    var parts = s.indexOf(' · ') >= 0 ? s.split(' · ') : s.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¡¿★])/); // frases: solo ante mayúscula (no corta «vel. de ataque» ni «máx. 3»)
    if (parts.length > 1) { var got = false, res = parts.map(function (p) { var r = lookup(p); if (r != null) got = true; return r == null ? p : r; }); if (got) return res.join(s.indexOf(' · ') >= 0 ? ' · ' : ' '); }
    return null;
  }
  function tr(s) {
    if (C.lang !== 'en' || !s) return s;
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), core = m[2]; if (!core) return s;
    var r = cache.get(core); if (r === undefined) { r = lookup(core); if (cache.size > 4000) cache.clear(); cache.set(core, r); }
    return r == null ? s : m[1] + r + m[3];
  }
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1 };
  function noTr(el) { for (var e = el; e && e.nodeType === 1; e = e.parentNode) { if (e.getAttribute('translate') === 'no') return true; if (SKIP[e.tagName]) return true; } return false; }
  // force: al cambiar de idioma se vuelve a traducir todo desde su español (__es), aunque el nodo ya fuera nuestro
  function textNode(n, force) {
    if (noTr(n.parentNode)) return;
    if (!force && n.__en != null && n.data === n.__en) return;  // es nuestro cambio
    if (n.__es == null || n.data !== n.__en) n.__es = n.data;  // texto nuevo (en español)
    var en = C.lang === 'en' ? tr(n.__es) : n.__es;
    if (n.data !== en) { n.__en = en; n.data = en; } else n.__en = en;
  }
  function attrNode(el, a, force) {
    if (!el.hasAttribute(a) || noTr(el)) return;
    var st = el.__i18n || (el.__i18n = {}), v = el.getAttribute(a), o = st[a];
    if (!force && o && v === o.en) return;
    var es = (o && v === o.en) ? o.es : v, en = C.lang === 'en' ? tr(es) : es;
    st[a] = { es: es, en: en }; if (v !== en) el.setAttribute(a, en);
  }
  function walk(root, force) {
    if (!root) return;
    if (root.nodeType === 3) { textNode(root, force); return; }
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    var it = document.createTreeWalker(root, 5, { acceptNode: function (n) { return n.nodeType === 3 ? (SKIP[n.parentNode.tagName] ? 2 : 1) : (SKIP[n.tagName] ? 2 : 1); } });
    for (var n = it.nextNode(); n; n = it.nextNode()) { if (n.nodeType === 3) textNode(n, force); else for (var i = 0; i < ATTRS.length; i++) attrNode(n, ATTRS[i], force); }
    if (root.nodeType === 1) for (var j = 0; j < ATTRS.length; j++) attrNode(root, ATTRS[j], force);
  }
  var obs = null;
  function observe() {
    if (obs || typeof MutationObserver === 'undefined') return;
    obs = new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) { var m = ms[i];
        if (m.type === 'characterData') textNode(m.target);
        else if (m.type === 'attributes') attrNode(m.target, m.attributeName);
        else for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]); }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  // El diccionario (i18n-en.js, el grueso del peso) solo se descarga la primera vez que se elige inglés
  var dictState = 0, pend = [];
  function loadDict(cb) {
    if (dictState === 2) return cb(); pend.push(cb); if (dictState === 1) return; dictState = 1;
    var sc = document.createElement('script'); sc.src = 'i18n-en.js?v=' + (window.I18N_V || 1); sc.onload = function () { dictState = 2; pats = null; cache.clear(); var q = pend; pend = []; q.forEach(function (f) { f(); }); };
    sc.onerror = function () { dictState = 0; setTimeout(function () { var q = pend; pend = []; if (q.length) { pend = q; dictState = 1; sc.cloneNode().src = sc.src; document.head.appendChild(sc.cloneNode()); } }, 3000); };
    document.head.appendChild(sc);
  }
  function set(lang) {
    lang = lang === 'en' ? 'en' : 'es';
    var changed = lang !== C.lang; C.lang = lang; C.locale = lang === 'en' ? 'en-US' : 'es-ES'; cache.clear();
    if (typeof document === 'undefined') return;
    document.documentElement.lang = lang;
    var go = function () { if (C.lang !== lang) return; if (lang === 'en') observe(); walk(document.documentElement, true); if (changed) window.dispatchEvent(new Event('langchange')); };
    if (lang === 'en' && dictState !== 2) loadDict(go); else go();
  }
  C.tr = tr; C.set = set; C.walk = walk;
  C.pick = function (es, en) { return C.lang === 'en' ? en : es; };
  // Idioma inicial: el guardado en los ajustes (game.js lo aplica al cargarlos); si no hay, el del navegador
  C.guess = function () { try { var l = navigator.language || ''; return /^en/i.test(l) ? 'en' : 'es'; } catch (e) { return 'es'; } };
  return C;
})();
function TR(s) { return I18N.tr(s); }
