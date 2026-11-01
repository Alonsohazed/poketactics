# Pasa las animaciones oficiales de una eeveelución (06wj, p. ej. Vaporeon 134) al esqueleto de otra hecha con crear-clips-generico.py
# (p. ej. Sylveon 700) y simula con física sus cintas, orejas y cola para que se muevan con retraso y de forma natural.
#
# Uso (Blender 5.x en segundo plano):
#   blender -b --python retarget-eeveelucion.py -- <origen.glb> <destino.glb> <salida.glb> [render <carpeta>]
#
# Cómo funciona:
# - Cuerpo: para cada hueso del mapa (cadera, columna, cuello, cabeza, patas, cola y orejas) se toma el giro del hueso de origen respecto a su
#   pose en el fotograma 0 de su «idle», en el espacio del mundo, y se aplica sobre la pose del destino en el fotograma 0 de su «idle» actual.
#   Así el destino conserva su postura y recibe el movimiento (respiración, zancadas, embestida, salto de victoria, tumbarse) del original.
#   La cadera se desplaza lo mismo, escalado por la altura de cada uno; en los clips en bucle se quita la deriva hacia delante.
# - Cintas, orejas y cola: cadenas con física (cada segmento persigue su orientación deseada con un muelle amortiguado, la punta llega
#   después que la base, pesan algo y se mecen con una onda suave que recorre la cadena). Los bucles se simulan 3 vueltas y se queda la
#   última, cerrada sobre la primera para que no salte. Las cintas largas del cuello caen en curva (su forma de reposo se dobla por segmento).
import bpy, sys, os, math, re
from mathutils import Vector, Quaternion, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, DST, OUT = argv[0], argv[1], argv[2]
RENDER = argv[argv.index('render') + 1] if 'render' in argv else None

# Mapa origen (nombres de Switch) → destino (esqueleto estándar de Pokemon-3D-api)
MAP = {'hips': 'Hips', 'spine_01': 'Spine1', 'spine_02': 'Spine2', 'neck': 'Neck1', 'head': 'Head',
       'left_shoulder': 'LShoulder', 'left_arm_01': 'LArm', 'left_arm_02': 'LForeArm', 'left_hand': 'LHand',
       'right_shoulder': 'RShoulder', 'right_arm_01': 'RArm', 'right_arm_02': 'RForeArm', 'right_hand': 'RHand',
       'left_leg_01': 'LThigh', 'left_leg_02': 'LLeg', 'left_foot': 'LFoot', 'left_foot_index': 'LToe',
       'right_leg_01': 'RThigh', 'right_leg_02': 'RLeg', 'right_foot': 'RFoot', 'right_foot_index': 'RToe',
       'tail_01': 'Tail1', 'tail_02': 'Tail2', 'tail_03': 'Tail3', 'tail_04': 'Tail4',
       'left_ear_01': 'LEar1', 'left_ear_02': 'LEar2', 'right_ear_01': 'REar1', 'right_ear_02': 'REar2'}
CLIPS = ['idle', 'run', 'attack', 'victory', 'faint']
LOOP = {'idle', 'run'}
# Cadenas con física: prefijo → (rigidez, amortiguación, gravedad, amplitud de la onda en grados, curva por segmento en grados, peso del
# movimiento heredado del retarget). Las cintas largas son blandas y caen en curva; orejas y cola, rígidas (solo un leve latigazo).
PHYS = [
    (r'^[LR]FeelerH\d$', dict(k=170, c=24, g=.8, wave=2, curl=0, keep=0)),
    (r'^LFeelerB\d$', dict(k=190, c=25, g=.6, wave=2, curl=0, keep=0)),
    (r'^LFeelerC\d$', dict(k=190, c=25, g=.6, wave=2, curl=0, keep=0)),
    (r'^[LR]Ear[23]$', dict(k=260, c=20, g=.2, wave=2, curl=0, keep=1)),
    (r'^Tail[234]$', dict(k=200, c=17, g=.3, wave=3, curl=0, keep=1)),
]
SUB = 6  # subpasos de física por fotograma
FLOOR = .04  # altura mínima de las puntas (el suelo está en 0)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=DST)
sc = bpy.context.scene; fps = sc.render.fps
T = next(o for o in sc.objects if o.type == 'ARMATURE')
tacts = {a.name.split('|')[-1]: a for a in bpy.data.actions}
bpy.ops.import_scene.gltf(filepath=SRC)
S = next(o for o in sc.objects if o.type == 'ARMATURE' and o is not T)
sacts = {re.sub(r'\.\d+$', '', a.name.split('|')[-1]): a for a in bpy.data.actions if a not in tacts.values()}  # el segundo GLB llega con «.001»
print('ORIGEN', list(sacts), 'DESTINO', list(tacts))

def use(arm, act):
    arm.animation_data_create(); arm.animation_data.action = act
    try:
        if act.slots: arm.animation_data.action_slot = act.slots[0]
    except Exception: pass
def goto(f): sc.frame_set(int(math.floor(f)), subframe=f - math.floor(f))
rot3 = lambda m: m.to_3x3().normalized().to_quaternion()

TB = T.data.bones
order = []
def walk(b):
    order.append(b.name)
    for c in b.children: walk(c)
for b in TB:
    if not b.parent: walk(b)
restLocal = {n: (TB[n].parent.matrix_local.inverted() @ TB[n].matrix_local) if TB[n].parent else TB[n].matrix_local.copy() for n in order}
phys = {}
for n in order:
    for rx, p in PHYS:
        if re.match(rx, n): phys[n] = p
INV = {v: k for k, v in MAP.items()}
# Vector de cada segmento en el espacio local de su hueso: hasta la cabeza del siguiente de la cadena (los huesos que crea el importador de
# glTF no apuntan con su eje Y hacia el hijo). El último sigue la dirección del anterior (su cola la inventa el importador y en una cinta
# apuntaba arriba y en la otra al suelo).
def segVec(n):
    kids = [c for c in TB[n].children if c.name in phys]
    if len(kids) == 1: return restLocal[kids[0].name].translation.copy()
    b = TB[n]
    if b.parent and b.parent.name in phys: return b.matrix_local.to_3x3().inverted() @ (b.head_local - b.parent.head_local)
    return b.matrix_local.to_3x3().inverted() @ (b.tail_local - b.head_local)
SEG = {n: segVec(n) for n in phys}

# Malla: en el modelo de Pokemon-3D-api las cintas son tubos con vértices solo cerca de la raíz y de la punta (los huesos del medio no mueven
# casi nada), así que no pueden curvarse: se ven como palos rectos. Se subdividen a lo largo y cada vértice se reparte entre los dos huesos
# de la cadena más cercanos según su posición a lo largo de ella (en la pose de reposo).
import bmesh
CHAINS = [[n for n in order if re.match(rx, n)] for rx in (r'^LFeelerH\d$', r'^RFeelerH\d$', r'^LFeelerB\d$', r'^LFeelerC\d$')]
CHAINS = [sorted(c, key=lambda n: int(n[-1])) for c in CHAINS if c]
mesh = next(o for o in sc.objects if o.type == 'MESH' and o.vertex_groups and any(a.type == 'ARMATURE' and a.object is T for a in o.modifiers))
def densify(chain):
    VG = {g.name: g.index for g in mesh.vertex_groups}; idx = [VG[b] for b in chain if b in VG]
    heads = [mesh.matrix_world.inverted() @ (T.matrix_world @ TB[b].head_local) for b in chain]
    last = TB[chain[-1]]; heads.append(mesh.matrix_world.inverted() @ (T.matrix_world @ (last.head_local + (last.tail_local - last.head_local).normalized() * (heads[-1] - heads[-2]).length)))
    seg = (heads[-1] - heads[0]).length / len(chain)
    bm = bmesh.new(); bm.from_mesh(mesh.data); dl = bm.verts.layers.deform.verify()
    inChain = lambda v: sum(w for g, w in v[dl].items() if g in idx) > .5
    long = [e for e in bm.edges if inChain(e.verts[0]) and inChain(e.verts[1]) and e.calc_length() > seg * .45]
    if long:
        cuts = max(2, int(round(max(e.calc_length() for e in long) / (seg * .8))))
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=cuts, use_grid_fill=True)
    # reparto de pesos por la posición a lo largo de la cadena
    def param(p):
        best = (1e9, 0, 0)
        for j in range(len(chain)):
            a, b = heads[j], heads[j + 1]; ab = b - a; t = max(0, min(1, (p - a).dot(ab) / max(1e-9, ab.length_squared)))
            d = (a + ab * t - p).length
            if d < best[0]: best = (d, j, t)
        return best[1], best[2]
    n = 0
    for v in bm.verts:
        w = v[dl]; tot = sum(x for g, x in w.items() if g in idx)
        if tot <= .5: continue
        j, t = param(v.co)
        for g in idx:
            if g in w: del w[g]
        # mezcla suave: centro del segmento j → todo en j; hacia sus extremos se reparte con el vecino
        if t < .5 and j > 0: a, b, f = j - 1, j, .5 + t
        elif t >= .5 and j < len(chain) - 1: a, b, f = j, j + 1, t - .5
        else: a, b, f = j, j, 0
        w[idx[a]] = tot * (1 - f) if a != b else tot
        if a != b: w[idx[b]] = tot * f
        n += 1
    bm.to_mesh(mesh.data); bm.free(); mesh.data.update()
    print('CINTA', chain[0][:-1], 'aristas largas', len(long), 'vértices repartidos', n)
for ch in CHAINS: densify(ch)

# Referencias: fotograma 0 del idle de cada uno
use(T, tacts['idle']); goto(tacts['idle'].frame_range[0])
TrefM = {n: T.pose.bones[n].matrix.copy() for n in order}
TrefB = {n: T.pose.bones[n].matrix_basis.copy() for n in order}
use(S, sacts['idle']); goto(sacts['idle'].frame_range[0])
WS = S.matrix_world.copy()
SrefR = {k: rot3(WS @ S.pose.bones[k].matrix) for k in MAP}
SrefHip = (WS @ S.pose.bones['hips'].matrix).translation.copy()
ratio = TrefM['Hips'].translation.z / max(1e-6, SrefHip.z)
print('altura cadera', round(SrefHip.z, 3), '→', round(TrefM['Hips'].translation.z, 3), 'ratio', round(ratio, 2))

# Forma de reposo de las cintas: la del idle actual, doblada un poco más por segmento (caen en curva) alrededor de su eje lateral
def chainIndex(n):
    m = re.search(r'(\d)$', n); return int(m.group(1)) if m else 1
def curlBasis(n):
    p = phys.get(n)
    if not p or not p['curl']: return TrefB[n]
    i = chainIndex(n); ang = math.radians(p['curl']) * (1 + .15 * i)
    # eje en el espacio local del hueso: su segmento × abajo, así el giro lo dobla hacia el suelo igual en los dos lados
    M = TrefM[n]; down = M.to_3x3().inverted() @ Vector((0, 0, -1)); side = SEG[n].normalized().cross(down)
    if side.length < 1e-4: return TrefB[n]
    q = Quaternion(side.normalized(), ang)
    return TrefB[n] @ q.to_matrix().to_4x4()
RestB = {n: curlBasis(n) for n in order}

def bodyFrame(clip, f, drift):
    """Matrices de pose (espacio de la armadura) del destino en el fotograma f del clip de origen, sin la física."""
    goto(f); M = {}; want = {}
    for k, tn in MAP.items():
        D = rot3(WS @ S.pose.bones[k].matrix) @ SrefR[k].inverted(); want[tn] = D @ rot3(TrefM[tn])
    hip = (WS @ S.pose.bones['hips'].matrix).translation - SrefHip
    hip = Vector((hip.x * ratio, (hip.y - drift) * ratio, hip.z * ratio))
    for n in order:
        par = M[TB[n].parent.name] if TB[n].parent else Matrix.Identity(4)
        base = par @ restLocal[n]
        if n == 'Waist':
            m = base @ TrefB[n]; m.translation = TrefM[n].translation + hip; M[n] = m
        elif n in want:
            pos = (base @ TrefB[n]).translation; m = want[n].to_matrix().to_4x4(); m.translation = pos; M[n] = m
        else:
            M[n] = base @ RestB[n]
    return M

def simulate(clip, frames, drift, loops):
    """Recorre el clip `loops` veces con la física y devuelve las bases de cada hueso en la última vuelta."""
    chains = [n for n in order if n in phys]
    tip = {}; vel = {}; out = []
    dt = 1 / fps / SUB; nF = len(frames); dur = nF / fps
    for lp in range(loops):
        for fi, f in enumerate(frames):
            M = bodyFrame(clip, f, drift); t = (lp * nF + fi) / fps; tc = fi / fps
            B = {}
            for n in order:
                par = M[TB[n].parent.name] if TB[n].parent else Matrix.Identity(4)
                if n not in phys:
                    B[n] = (par @ restLocal[n]).inverted() @ M[n]; continue
                p = phys[n]; i = chainIndex(n)
                # orientación deseada: la del padre ya simulado, su forma de reposo, la onda (bucle exacto en los clips que se repiten) y,
                # en orejas y cola, lo que trae el retarget
                cyc = max(1, round(dur / 2.6)) if clip in LOOP else 0
                w = 2 * math.pi * (cyc / dur if cyc else 1 / 2.6)
                wv = math.radians(p['wave']) * (i / 4) * math.sin(w * (tc if cyc else t) - .9 * i)
                wv2 = math.radians(p['wave']) * .6 * (i / 4) * math.sin(w * (tc if cyc else t) * 1 - .9 * i + 1.7)
                baseB = (TrefB[n] if p['keep'] else RestB[n]) if n not in MAP.values() else ((par @ restLocal[n]).inverted() @ M[n])
                # la onda sube y baja (eje segmento × abajo) y se mece de lado (eje vertical): igual en las dos cintas, sean cuales sean
                # los ejes locales del hueso
                down = (par @ restLocal[n] @ baseB).to_3x3().inverted() @ Vector((0, 0, -1)); s = SEG[n].normalized()
                ax1 = s.cross(down); ax2 = down - s * down.dot(s)
                rot = Matrix.Identity(4)
                if ax1.length > 1e-4: rot = rot @ Quaternion(ax1.normalized(), wv).to_matrix().to_4x4()
                if ax2.length > 1e-4: rot = rot @ Quaternion(ax2.normalized(), wv2).to_matrix().to_4x4()
                desB = baseB @ rot
                Md = par @ restLocal[n] @ desB
                h = Md.translation; L = SEG[n].length; dDir = (Md.to_3x3() @ SEG[n]).normalized(); target = h + dDir * L
                if n not in tip: tip[n] = target.copy(); vel[n] = Vector()
                for _ in range(SUB):
                    acc = (target - tip[n]) * p['k'] - vel[n] * p['c'] + Vector((0, 0, -p['g']))
                    vel[n] += acc * dt; tip[n] += vel[n] * dt
                    d = tip[n] - h; tip[n] = h + d.normalized() * L
                    if tip[n].z < FLOOR: tip[n].z = FLOOR; vel[n].z = max(0, vel[n].z); vel[n] *= .9  # no atraviesan el suelo
                # gira la orientación deseada para que apunte a la punta simulada
                q = dDir.rotation_difference((tip[n] - h).normalized())
                Ms = (q.to_matrix() @ Md.to_3x3()).to_4x4(); Ms.translation = h; M[n] = Ms
                B[n] = (par @ restLocal[n]).inverted() @ Ms
            if lp == loops - 1: out.append(B)
    return out

def keyclip(name, frames, Bs, loop):
    act = bpy.data.actions.new(name); use(T, act); prev = {}
    if loop:  # cierra el bucle: los últimos fotogramas se funden con el primero
        nb = min(6, len(Bs) // 4)
        for j in range(nb):
            a = (j + 1) / (nb + 1); i = len(Bs) - nb + j
            for n in order:
                q0 = Bs[i][n].to_quaternion(); q1 = Bs[0][n].to_quaternion(); qm = q0.slerp(q1, a)
                m = qm.to_matrix().to_4x4(); m.translation = Bs[i][n].translation.lerp(Bs[0][n].translation, a); Bs[i][n] = m
    for fi, B in enumerate(Bs):
        for n in order:
            pb = T.pose.bones[n]; q = B[n].to_quaternion()
            if n in prev and prev[n].dot(q) < 0: q.negate()
            prev[n] = q; pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=fi)
            if n == 'Waist': pb.location = B[n].translation; pb.keyframe_insert('location', frame=fi)
    act.use_fake_user = True
    return act

new = {}
for clip in CLIPS:
    sa = sacts[clip]; use(S, sa); f0, f1 = sa.frame_range; n = max(2, int(round(f1 - f0)))
    frames = [f0 + (f1 - f0) * i / n for i in range(n + (0 if clip in LOOP else 1))]
    drift = 0.0
    if clip in LOOP:
        ys = []
        for f in frames[::3]: goto(f); ys.append(((WS @ S.pose.bones['hips'].matrix).translation - SrefHip).y)
        drift = sum(ys) / len(ys)
    # los clips de un solo uso empiezan con la física ya asentada en el idle (una vuelta previa del primer fotograma)
    Bs = simulate(clip, ([frames[0]] * 24 + frames) if clip not in LOOP else frames, drift, 3 if clip in LOOP else 1)
    if clip not in LOOP: Bs = Bs[24:]
    new[clip] = keyclip(clip + '_n', frames, Bs, clip in LOOP)
    print('CLIP', clip, len(Bs), 'fotogramas')

# Fuera el origen y los clips viejos; los nuevos se quedan con su nombre
for o in list(sc.objects):
    if o is S or (o.parent and o.parent is S) or o.name.startswith(('pm0134', 'origin', 'waist')) and o is not T: bpy.data.objects.remove(o, do_unlink=True)
for k, a in list(tacts.items()): bpy.data.actions.remove(a)
for a in list(sacts.values()):
    if a.name in bpy.data.actions: bpy.data.actions.remove(a)
for clip, a in new.items(): a.name = clip
for o in list(sc.objects):
    if o.type == 'ARMATURE' and o is not T: bpy.data.objects.remove(o, do_unlink=True)
# la NLA lleva cada acción como pista para que el exportador las saque todas
T.animation_data.action = None
for tr in list(T.animation_data.nla_tracks): T.animation_data.nla_tracks.remove(tr)  # las pistas que trajo el importador (clips viejos)
for clip, a in new.items():
    tr = T.animation_data.nla_tracks.new(); tr.name = clip; st = tr.strips.new(clip, int(a.frame_range[0]), a); st.name = clip
sc.frame_start = 0; sc.frame_end = int(max(a.frame_range[1] for a in new.values()))
print('EXPORTA', [(a.name, tuple(a.frame_range)) for a in bpy.data.actions])
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_frame_step=1, export_frame_range=False,
                          export_draco_mesh_compression_enable=True, export_image_format='WEBP', export_yup=True)
print('HECHO', OUT)
