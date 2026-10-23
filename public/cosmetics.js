/* Cosméticos y gacha (compartido: navegador y servidor). Todo es visual: nada de esto entra en la simulación del combate.
   Lo que tiene cada cuenta se guarda como claves cortas en users.cosm ({inv, eq, pity, dust…}).
   Fase 1: Eevee pasa a ser la minileyenda mítica (solo del gacha, garantizada en la tirada PITY). */
var COSM = (function () {
  var C = {
    PITY: 200,             // Eevee garantizado en esta tirada (la diaria también cuenta)
    MYTHIC_P: 0.001,       // 0,1 % fijo por tirada, sin subida progresiva
    PRICE: 400, PRICE10: 3600,
    EEVEE: 'tac:eevee',    // clave de inventario de la minileyenda mítica
    LOCKED_TACS: ['eevee'],// minileyendas que no son gratuitas
    DEFAULT_TAC: 'charmander', // a la que pasan las cuentas que tenían Eevee sin haberla conseguido
  };
  // ¿La cuenta puede usar esta minileyenda? (cosm puede venir vacío o de una cuenta antigua)
  C.ownsTac = function (cosm, k) { return C.LOCKED_TACS.indexOf(k) < 0 || !!(cosm && Array.isArray(cosm.inv) && cosm.inv.indexOf('tac:' + k) >= 0); };
  C.pityLeft = function (cosm) { var p = cosm && Number.isFinite(+cosm.pity) ? Math.max(0, Math.min(C.PITY - 1, +cosm.pity | 0)) : 0; return C.PITY - p; };
  // Lo que ve el propio jugador de su colección (nunca de otros: eso irá recortado a lo equipado)
  C.publicCosm = function (cosm) { cosm = cosm || {}; return { inv: Array.isArray(cosm.inv) ? cosm.inv.slice(0, 400) : [], eq: cosm.eq && typeof cosm.eq === 'object' ? cosm.eq : {}, pity: C.PITY - C.pityLeft(cosm), dust: Math.max(0, +cosm.dust || 0) }; };
  return C;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = COSM;
