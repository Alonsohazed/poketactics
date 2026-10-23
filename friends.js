'use strict';
/*
 * Amigos (solo servidor). Filas dirigidas en la base: A→B «pending» (A pidió), A↔B «accepted» (una fila en cada
 * sentido) y A→B «blocked» (A bloqueó a B).
 * - Añadir por nombre responde SIEMPRE lo mismo, exista o no la cuenta: si no existe (o es el nombre de un rival
 *   generado, o esa persona te bloqueó), la solicitud queda como «fantasma»: se ve pendiente y caduca a los 14 días,
 *   igual que una que la otra persona ignora. Así no se puede averiguar quién es persona ni quién te bloqueó.
 * - Solo se puede bloquear a amigos o a quien te ha enviado una solicitud (personas seguro): bloquear una solicitud
 *   enviada delataría si era una cuenta real.
 */
const COSM = require('./public/cosmetics');
const EXPIRE_MS = 14 * 864e5, MAX_FRIENDS = 100, MAX_OUT = 20;
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const OPS = ['request', 'accept', 'decline', 'cancel', 'remove', 'block', 'unblock'];
const live = l => l.status !== 'pending' || Date.now() - new Date(l.created).getTime() < EXPIRE_MS;
const fail = (code, error) => ({ code, error });

// Lo que ve un jugador de su lista. presence(uid) → {st, r, mode} (lo da server.js)
async function view(db, me, presence) {
  const L = (await db.links(me.id)).filter(live), out = { friends: [], incoming: [], outgoing: [], blocked: [], max: MAX_FRIENDS };
  for (const l of L) {
    if (l.a === me.id && l.status === 'accepted') out.friends.push(Object.assign({ name: l.bName, trainer: l.bTrainer, cs: COSM.eqString(l.bEq) }, presence ? presence(l.b) : { st: 'off' }));
    else if (l.a === me.id && l.status === 'pending') out.outgoing.push({ name: l.label || l.bName, created: l.created });
    else if (l.a === me.id && l.status === 'blocked') out.blocked.push({ name: l.bName });
    else if (l.b === me.id && l.status === 'pending' && !L.some(x => x.a === me.id && x.b === l.a && x.status === 'blocked')) out.incoming.push({ name: l.aName, trainer: l.aTrainer, cs: COSM.eqString(l.aEq), created: l.created });
  }
  for (const g of await db.ghosts(me.id)) if (live({ status: 'pending', created: g.created })) out.outgoing.push({ name: g.name, created: g.created });
  const by = (a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  out.friends.sort(by); out.outgoing.sort((a, b) => new Date(b.created) - new Date(a.created)); out.incoming.sort(by); out.blocked.sort(by);
  for (const o of out.outgoing) delete o.created; for (const o of out.incoming) delete o.created;
  return out;
}

// Una acción sobre la lista. Devuelve {ok, msg, notify: [uids cuya lista cambió]} o {code, error}
async function act(db, me, op, name) {
  if (!OPS.includes(op)) return fail(404, 'Acción no válida');
  if (typeof name !== 'string' || !NAME_RE.test(name)) return fail(400, 'Escribe un nombre de 3 a 16 letras, números o _');
  if (name.toLowerCase() === me.name.toLowerCase()) return fail(400, 'No puedes agregarte a ti mismo');
  const L = (await db.links(me.id)).filter(live), t = await db.userByName(name);
  const mine = t && L.find(l => l.a === me.id && l.b === t.id), theirs = t && L.find(l => l.a === t.id && l.b === me.id);
  const nFriends = L.filter(l => l.a === me.id && l.status === 'accepted').length;
  const ghosts = (await db.ghosts(me.id)).filter(g => live({ status: 'pending', created: g.created })), ghost = ghosts.find(g => g.name.toLowerCase() === name.toLowerCase());
  const sent = { ok: true, msg: `Solicitud enviada a ${name}` };
  switch (op) {
    case 'request': {
      if (mine && mine.status === 'accepted') return fail(409, `${mine.bName} ya es tu amigo`);
      if ((mine && mine.status === 'pending') || ghost) return fail(409, `Ya le enviaste una solicitud a ${name}`);
      if (mine && mine.status === 'blocked') return fail(400, `Tienes bloqueado a ${mine.bName}: desbloquéalo antes`);
      if (nFriends >= MAX_FRIENDS) return fail(400, `Ya tienes el máximo de ${MAX_FRIENDS} amigos`);
      if (L.filter(l => l.a === me.id && l.status === 'pending').length + ghosts.length >= MAX_OUT) return fail(400, `Tienes ${MAX_OUT} solicitudes sin respuesta: espera o cancela alguna`);
      // Sin cuenta, o te bloqueó: solicitud fantasma (misma respuesta y mismo aspecto que una pendiente)
      if (!t || (theirs && theirs.status === 'blocked')) { await db.addGhost(me.id, name); return Object.assign(sent, { notify: [me.id] }); }
      // Te había pedido amistad: se aceptan las dos
      if (theirs && theirs.status === 'pending') { if ((await db.friendIds(t.id)).length >= MAX_FRIENDS) { await db.addGhost(me.id, name); return Object.assign(sent, { notify: [me.id] }); }
        await db.setLink(t.id, me.id, 'accepted'); await db.setLink(me.id, t.id, 'accepted'); return { ok: true, msg: `Ahora ${t.name} y tú sois amigos`, notify: [me.id, t.id] }; }
      await db.setLink(me.id, t.id, 'pending', name); return Object.assign(sent, { notify: [me.id, t.id] });
    }
    case 'accept': {
      if (!theirs || theirs.status !== 'pending' || (mine && mine.status === 'blocked')) return fail(404, 'No tienes ninguna solicitud de ese jugador');
      if (nFriends >= MAX_FRIENDS) return fail(400, `Ya tienes el máximo de ${MAX_FRIENDS} amigos`);
      if ((await db.friendIds(t.id)).length >= MAX_FRIENDS) return fail(400, `${t.name} ya tiene el máximo de amigos`);
      await db.setLink(t.id, me.id, 'accepted'); await db.setLink(me.id, t.id, 'accepted'); await db.delGhost(t.id, me.name);
      return { ok: true, msg: `Ahora ${t.name} y tú sois amigos`, notify: [me.id, t.id] };
    }
    case 'decline': { // la otra persona no se entera: para ella sigue pendiente hasta que caduca
      if (!theirs || theirs.status !== 'pending') return fail(404, 'No tienes ninguna solicitud de ese jugador');
      await db.delLink(t.id, me.id); await db.addGhost(t.id, theirs.label || me.name); return { ok: true, msg: 'Solicitud rechazada', notify: [me.id] };
    }
    case 'cancel': {
      const n = (mine && mine.status === 'pending' ? await db.delLink(me.id, t.id) : 0) + (ghost ? await db.delGhost(me.id, name) : 0);
      if (!n) return fail(404, 'No tienes ninguna solicitud enviada a ese nombre');
      return { ok: true, msg: 'Solicitud cancelada', notify: mine ? [me.id, t.id] : [me.id] };
    }
    case 'remove': {
      if (!mine || mine.status !== 'accepted') return fail(404, 'Ese jugador no está en tu lista de amigos');
      await db.delLink(me.id, t.id); await db.delLink(t.id, me.id); return { ok: true, msg: `${t.name} ya no está en tu lista`, notify: [me.id, t.id] };
    }
    case 'block': {
      if (!t || !((mine && mine.status === 'accepted') || (theirs && theirs.status === 'pending'))) return fail(404, 'Solo puedes bloquear a amigos o a quien te envía una solicitud');
      await db.delLink(t.id, me.id); if (theirs && theirs.status === 'pending') await db.addGhost(t.id, theirs.label || me.name); // como al rechazar: para quien pidió sigue pendiente
      await db.setLink(me.id, t.id, 'blocked', ''); return { ok: true, msg: `Has bloqueado a ${t.name}`, notify: mine && mine.status === 'accepted' ? [me.id, t.id] : [me.id] };
    }
    case 'unblock': {
      if (!mine || mine.status !== 'blocked') return fail(404, 'Ese jugador no está bloqueado');
      await db.delLink(me.id, t.id); return { ok: true, msg: `Has desbloqueado a ${t.name}`, notify: [me.id] };
    }
  }
}
const areFriends = async (db, a, b) => (await db.friendIds(a)).includes(b);

module.exports = { view, act, areFriends, OPS, EXPIRE_MS, MAX_FRIENDS, MAX_OUT };
