"""Crea en Blender los 5 clips del juego (idle, run, attack, victory, faint) para cualquier modelo de Pokemon-3D-api con el esqueleto estándar
(Hips, Spine/Spine1/Spine2, Neck/Neck1.., Head, Jaw, L/RThigh-Leg-Foot-Toe, L/RShoulder-Arm-ForeArm-Hand, Tail1.., orejas, pelo y «Feeler»).
Uso: blender -b --python crear-clips-generico.py -- <entrada.glb> <salida.glb> [render <carpeta>] [tipo=cuadrupedo|bipedo]
Después: node optimizar-modelo.mjs salida.glb public/anims/<n>.glb, su .json y el número en ANIM_SET (board3d.js).
Cómo funciona: hornea la pose por defecto del GLB como reposo y anima con rotaciones sobre ejes del mundo (X = lateral, Y = atrás, Z = arriba;
el modelo mira a -Y). El sentido en que se dobla cada articulación no se adivina: se mide (el que sube el pie, el que adelanta la mano…).
Cuadrúpedos: trote en diagonal. Bípedos: carrera con brazos contrarios. Lo que no exista en un esqueleto simplemente no se mueve.
Probado con: Pichu 172, Bayleef 153, Meganium 154, Houndoom 229, Absol 359, Gabite 444, Garchomp 445, Riolu 447, Lucario 448 y Sylveon 700."""
import bpy, math, sys, re
from mathutils import Vector, Matrix, Quaternion, Euler
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
IN, OUT = argv[0], argv[1]
RENDER = "render" in argv
VIEWS = argv[argv.index("render") + 1] if RENDER else "."
TIPO = next((a.split("=")[1] for a in argv if a.startswith("tipo=")), None)
FLOAT = "flota=1" in argv   # fantasmas y levitadores: flotan en vez de andar
AMP = float(next((a.split("=")[1] for a in argv if a.startswith("amp=")), "1"))  # multiplica la amplitud de los movimientos
FPS = 30
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=IN)
sc = bpy.context.scene; sc.render.fps = FPS
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith("Icosphere")]: bpy.data.objects.remove(o, do_unlink=True)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
# Si el GLB trae una acción (algunos guardan ahí su pose real y el reposo es una pose en T), su primer fotograma es la pose de partida
act0 = arm.animation_data.action if arm.animation_data else None
if act0: sc.frame_set(int(act0.frame_range[0])); bpy.context.view_layer.update()

# ---- 1) la pose por defecto del GLB pasa a ser la de reposo (así el reposo es el aspecto normal del juego) ----
bpy.ops.object.select_all(action='DESELECT')
for m in meshes:
    bpy.context.view_layer.objects.active = m; m.select_set(True)
    for md in list(m.modifiers):
        if md.type == 'ARMATURE': bpy.ops.object.modifier_apply(modifier=md.name)
    m.select_set(False)
bpy.context.view_layer.objects.active = arm; arm.select_set(True)
bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.select_all(action='SELECT'); bpy.ops.pose.armature_apply(selected=False); bpy.ops.object.mode_set(mode='OBJECT')
if arm.animation_data: arm.animation_data.action = None
for b in arm.pose.bones: b.location = (0, 0, 0); b.rotation_quaternion = (1, 0, 0, 0); b.rotation_euler = (0, 0, 0); b.scale = (1, 1, 1)
for m in meshes:
    md = m.modifiers.new("Armature", 'ARMATURE'); md.object = arm
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
pts = []
for m in meshes:
    e = m.evaluated_get(dg); me = e.to_mesh(); pts += [e.matrix_world @ v.co for v in me.vertices]
zmin = min(p.z for p in pts); zmax = max(p.z for p in pts)
ymin = min(p.y for p in pts); ymax = max(p.y for p in pts)

# ---- nombres: se quitan sufijos numéricos (Spine1_04 -> Spine1) ----
def sv_name(n):
    """Nombres estilo Switch (left_arm_01, spine_02, feeler_a…) al estilo estándar (LArm, Spine2, FeelerA)."""
    if not re.match(r'^[a-z0-9_]+$', n): return None
    fixed = {"hips": "Hips", "waist": "Waist", "head": "Head", "origin": "Origin", "neck": "Neck", "neck_01": "Neck", "jaw": "Jaw", "jaw_01": "Jaw", "lower_jaw": "Jaw", "tail": "Tail1", "spine": "Spine1"}
    if n in fixed: return fixed[n]
    m = re.match(r'^(spine|neck|tail)_0?(\d+)$', n)
    if m: return m.group(1).capitalize() + m.group(2)
    m = re.match(r'^(left|right)_(.+)$', n); side = ''
    if m: side = 'L' if m.group(1) == 'left' else 'R'; n = m.group(2)
    if side:
        for pat, out in ((r'^arm(_0?1)?$', 'Arm'), (r'^arm_0?2$', 'ForeArm'), (r'^(arm_0?3|hand)$', 'Hand'), (r'^leg(_0?1)?$', 'Thigh'), (r'^leg_0?2$', 'Leg'), (r'^(leg_0?3|foot)$', 'Foot'), (r'^shoulder$', 'Shoulder')):
            if re.match(pat, n): return side + out
    return side + ''.join(p.capitalize() if not p.isdigit() else str(int(p)) for p in n.split('_'))
def canon(n):
    n = re.sub(r'^\d+\s+', '', n)
    return sv_name(n) or re.sub(r'_\d+$', '', n)
BN = {}
for b in arm.data.bones: BN.setdefault(canon(b.name), b.name)
has = lambda n: n in BN
H = {canon(b.name): arm.matrix_world @ b.head_local.copy() for b in arm.data.bones}
T = {canon(b.name): arm.matrix_world @ b.tail_local.copy() for b in arm.data.bones}
RW = {canon(b.name): (arm.matrix_world.to_3x3() @ b.matrix_local.to_3x3()) for b in arm.data.bones}
pb = arm.pose.bones
for b in pb: b.rotation_mode = 'QUATERNION'
ALL = [canon(b.name) for b in pb]
ROOTS = [canon(b.name) for b in arm.data.bones if b.parent is None or not b.parent.name in [x.name for x in arm.data.bones]]
first = lambda *ns: next((n for n in ns if has(n)), None)
chain = lambda pre, mx=9: [n for n in ([pre] + [f"{pre}{i}" for i in range(1, mx)]) if has(n)]
HEAD = first("Head", "UpperBeak", "UpperJaw")
JAW = first("Jaw", "LowerJaw", "LowerBeak")
SPINE = [n for n in ("Waist", "Spine", "Spine1", "Spine2", "Spine3") if has(n)]
NECK = [n for n in ("Neck", "Neck1", "Neck2", "Neck3", "Neck4") if has(n)]
TAIL = [n for n in (["Tail"] + [f"Tail{i}" for i in range(1, 10)]) if has(n)]
SEC = [n for n in ALL if re.search(r'(Hair|Feeler|Ear)', n)]   # pelo, orejas, cintas: se mecen con retraso
top = H[HEAD].z if HEAD else zmax * .92
BODYH = max(1e-3, top - zmin)
side = lambda s, n: s + n if has(s + n) else None
LEG = {s: [side(s, "Thigh"), side(s, "Leg"), side(s, "Foot"), first(s + "Toe", s + "Toe1", s + "ToeA")] for s in "LR"}
ARM = {s: [side(s, "Shoulder"), side(s, "Arm"), side(s, "ForeArm"), side(s, "Hand")] for s in "LR"}
hand_z = min([H[ARM[s][3]].z for s in "LR" if ARM[s][3]] or [zmax])
QUAD = (TIPO == "cuadrupedo") if TIPO else (hand_z < zmin + .3 * BODYH)
print("MODELO", IN, "altura", round(BODYH, 3), "cuadrúpedo" if QUAD else "bípedo", "raíces", ROOTS, "cola", TAIL, "cuello", NECK)

# ---- utilidades ----
AX = {"x": Vector((1, 0, 0)), "y": Vector((0, 1, 0)), "z": Vector((0, 0, 1))}
FIX = {}   # giro previo del padre (brazo bajado): los hijos giran sobre los ejes del mundo de después
def rot_q(n, axis, deg):
    v = FIX[n].inverted() @ AX[axis] if n in FIX else AX[axis]
    a = RW[n].inverted() @ v; return Quaternion(a.normalized(), math.radians(deg))
def rot_v(n, v, deg):  # giro sobre un eje cualquiera del mundo (vector)
    a = RW[n].inverted() @ Vector(v); return Quaternion(a.normalized(), math.radians(deg))
def loc_local(n, v): return RW[n].inverted() @ Vector(v)
def sgn(n, axis, want, probe=None, pivot=None):
    """+1 o -1: el sentido de giro (alrededor de un eje del mundo) que lleva la punta del hueso (o `probe`) hacia `want`."""
    if not n or not has(n): return 1
    p = probe if probe is not None else T[n]; h = pivot if pivot is not None else H[n]; w = Vector(want)
    R = lambda d: Matrix.Rotation(math.radians(d), 3, axis.upper())
    return 1 if (h + R(12) @ (p - h)).dot(w) >= (h + R(-12) @ (p - h)).dot(w) else -1
def tip(ch):  # punto final de una cadena: la cabeza del último hueso (las colas que pone el importador no siguen siempre al miembro)
    ch = [c for c in ch if c]; return (H[ch[-1]] if len(ch) > 1 else T[ch[0]]) if ch else None
UP, FWD = (0, 0, 1), (0, -1, 0)
# rodillas y codos: el sentido que levanta el pie; brazos: el que adelanta o sube la mano
KNEE = {s: sgn(LEG[s][1], 'x', UP, tip(LEG[s][1:])) for s in "LR"}
ELB = {s: sgn(ARM[s][2], 'x', UP, tip(ARM[s][2:])) for s in "LR"}
# Muchos bípedos vienen en pose en T (brazos en horizontal): en todos los clips se bajan a una pose relajada (RELAX grados, sentido DOWN)
def rotp(h, p, axis, deg): return h + Matrix.Rotation(math.radians(deg), 3, axis.upper()) @ (p - h)
def lower_deg(s):
    a = ARM[s][1]
    if QUAD or not a or "relax=0" in argv: return 0.0   # relax=0: no bajar los brazos (aletas de Kyogre)
    e = tip(ARM[s][1:]); d = (e - H[a]).normalized(); return max(0.0, math.degrees(math.acos(max(-1.0, min(1.0, -d.z)))) - 18)
RELAX = {s: lower_deg(s) for s in "LR"}
DOWN = {s: sgn(ARM[s][1], 'y', (0, 0, -1), tip(ARM[s][1:])) for s in "LR"}
ARM_UP = {s: -DOWN[s] for s in "LR"}
# Al celebrar, los brazos colgando suben del todo; los que ya están en horizontal por diseño (alas, brazos de lámpara, pilares…) solo un poco
def arm_horiz(s):
    a = ARM[s][1]
    return bool(a) and abs((tip(ARM[s][1:]) - H[a]).normalized().z) < .5
def relaxed(s, p):  # dónde queda un punto del brazo tras bajarlo
    a = ARM[s][1]; return rotp(H[a], p, 'y', DOWN[s] * RELAX[s]) if a and RELAX[s] else p
ARM_FWD_AX = {s: 'x' for s in "LR"}
ARM_FWD = {s: sgn(ARM[s][1], 'x', FWD, relaxed(s, tip(ARM[s][1:]))) if ARM[s][1] else 1 for s in "LR"}
ELBF = {s: sgn(ARM[s][2], 'x', FWD, relaxed(s, tip(ARM[s][2:])), relaxed(s, H[ARM[s][2]])) if ARM[s][2] else 1 for s in "LR"}  # doblar el codo hacia delante
for s in "LR":
    if RELAX[s]:
        for c in ARM[s][2:]:
            if c: FIX[c] = Matrix.Rotation(math.radians(DOWN[s] * RELAX[s]), 3, "Y")
# Cintas y lazos largos (p. ej. las de Sylveon) que en el modelo salen rectos en horizontal: se dejan caer en todos los clips
DRAPE = []
groups = {}
for n in SEC:
    m = re.match(r"^(.*?)(\d+)$", n)
    if m: groups.setdefault(m.group(1), []).append((int(m.group(2)), n))
# caer=LFeeler+RFeeler:70 → esas cadenas (por su prefijo) se dejan colgar hacia abajo esos grados (p. ej. los apéndices negros de Riolu, que el modelo trae rectos a los lados)
CAER = next((a.split("=", 1)[1] for a in argv if a.startswith("caer=")), "")
CAER_P, CAER_G = (CAER.split(":")[0].split("+"), float(CAER.split(":")[1])) if CAER else ([], 0.0)
for g, items in groups.items():
    ch = [n for _, n in sorted(items)]
    if g in CAER_P:
        d = H[ch[-1]] - H[ch[0]] if len(ch) > 1 else T[ch[0]] - H[ch[0]]
        ax = d.normalized().cross(Vector((0, 0, -1)))
        if ax.length > 1e-4: DRAPE.append((ch, 0.0, ax.normalized(), CAER_G))
        continue
    if len(ch) < 3: continue
    d = H[ch[-1]] - H[ch[0]]
    if d.length < .45 * BODYH or abs(d.normalized().z) > .45: continue
    # se llevan hacia atrás (giro sobre la vertical) y luego caen un poco: así flotan detrás del cuerpo sin atravesar el suelo
    yaw = 62 * sgn(ch[0], 'z', (0, 1, 0), H[ch[-1]])
    d2 = Matrix.Rotation(math.radians(yaw), 3, 'Z') @ d
    elev = math.degrees(math.asin(max(-1.0, min(1.0, d2.normalized().z))))
    ax = d2.normalized().cross(Vector((0, 0, -1)))
    if ax.length < 1e-4: continue
    DRAPE.append((ch, yaw, ax.normalized(), elev + 12))
print("CINTAS que caen", [(c[0], round(y), round(a)) for c, y, _, a in DRAPE])
print("BRAZOS bajados", {s: round(RELAX[s]) for s in "LR"})
JAW_OPEN = sgn(JAW, 'x', (0, 0, -1)) if JAW else 1
OUTX = {s: (1 if (H[LEG[s][0]] if LEG[s][0] else H.get(ARM[s][1] or "", Vector())).x >= 0 else -1) for s in "LR"}

class Pose:
    def __init__(s): s.q = {n: Quaternion() for n in ALL}; s.loc = {n: Vector((0, 0, 0)) for n in ALL}
    def r(s, n, axis, deg):
        if n and n in s.q and deg: s.q[n] = rot_q(n, axis, deg * AMP) @ s.q[n]
    def body(s, move=(0, 0, 0), pitch=0.0, roll=0.0, yaw=0.0, pivot=None):
        """Mueve y gira todo el cuerpo (todas las raíces) alrededor de `pivot` (por defecto, el suelo bajo las caderas)."""
        hip = H[first("Hips", "Waist", *ROOTS)]
        p = Vector(pivot) if pivot is not None else Vector((hip.x, hip.y, zmin))
        R = Euler((math.radians(pitch), math.radians(roll), math.radians(yaw)), 'XYZ').to_matrix()
        for n in ROOTS:
            h = H[n]; h2 = p + R @ (h - p) + Vector(move); s.loc[n] = loc_local(n, h2 - h)
            s.q[n] = (RW[n].inverted() @ R @ RW[n]).to_quaternion() @ s.q[n]

def key_clip(name, n, fn):
    act = bpy.data.actions.new(name); arm.animation_data_create(); arm.animation_data.action = act
    for f in range(0, n + 1):
        t = f / n; P = Pose(); base(P); fn(P, t)
        for c in ALL:
            b = pb[BN[c]]; b.rotation_quaternion = P.q[c]; b.location = P.loc[c]
            b.keyframe_insert('rotation_quaternion', frame=f)
            if c in ROOTS: b.keyframe_insert('location', frame=f)
    act.use_fake_user = True
    return act

def base(P):  # pose relajada común a todos los clips: brazos bajados (si venía en T) y codos algo doblados
    for s in "LR":
        a = ARM[s][1]
        if a and RELAX[s]:
            P.q[a] = rot_q(a, 'y', DOWN[s] * RELAX[s]) @ P.q[a]
            if ARM[s][2]: P.q[ARM[s][2]] = rot_q(ARM[s][2], 'x', ELBF[s] * 12) @ P.q[ARM[s][2]]
    for ch, yaw, ax, deg in DRAPE:
        P.q[ch[0]] = rot_v(ch[0], ax, deg) @ rot_q(ch[0], 'z', yaw) @ P.q[ch[0]]
        for c in ch[1:]: P.q[c] = rot_v(c, ax, 4) @ P.q[c]

S = math.sin; C = math.cos; TAU = 2 * math.pi
def smooth(a, b, x):
    x = min(1.0, max(0.0, (x - a) / (b - a))); return x * x * (3 - 2 * x)
def spread(P, ch, axis, deg):  # reparte un giro a lo largo de una cadena
    for i, n in enumerate(ch): P.r(n, axis, deg / max(1, len(ch)))
def tail_follow(P, yaw, pitch, lag=.5):
    """Cola que sigue al cuerpo: `yaw(d)` y `pitch(d)` dan el giro total (grados) con `d` de retraso (en radianes de fase o
    fracción de clip, según quien la llame); cada segmento llega más tarde que el anterior y la punta se mueve más (efecto látigo).
    pitch + = sube la cola."""
    n = len(TAIL)
    for i, nm in enumerate(TAIL):
        w = (.6 + .8 * i / max(1, n - 1)) / n; d = lag * (i + 1)
        P.r(nm, 'z', yaw(d) * w); P.r(nm, 'x', pitch(d) * w)
def sway_tail(P, ph, amp, lift=0.0):
    for i, n in enumerate(TAIL): P.r(n, 'z', amp * S(ph - i * .55) / (1 + i * .15)); P.r(n, 'x', lift / max(1, len(TAIL)))
GN = {}   # huesos de la cadena de cada hueso secundario: el giro se reparte (si no, en cintas de 8 huesos se acumula y se enrollan)
for g, items in groups.items():
    for _, n in items: GN[n] = len(items)
def secondary(P, ph, amp, back=0.0):
    for i, n in enumerate(SEC):
        k = 1 + (int(re.sub(r'\D', '', n) or 1) - 1) * .35; d = max(1.0, GN.get(n, 1) / 2)
        P.r(n, 'x', (back * .5 + amp * S(ph - k * .7)) / d); P.r(n, 'y', amp * .5 * S(ph * .7 - k) / d)
def leg(P, s, a, lift, keep=.8, bend_max=34):
    """Pata trasera (o pierna): `a` grados hacia atrás (+) o adelante (-); `lift` 0-1 la dobla para levantar el pie."""
    th, lg, ft, to = LEG[s]
    bend = KNEE[s] * bend_max * lift
    P.r(th, 'x', a); P.r(lg, 'x', bend); P.r(ft, 'x', -(a + bend) * keep)
def fleg(P, s, a, lift, keep=.8, bend_max=34):
    """Pata delantera de un cuadrúpedo (Arm, ForeArm, Hand)."""
    sh, ar, fa, hd = ARM[s]
    bend = ELB[s] * bend_max * lift
    P.r(sh, 'x', a * .3); P.r(ar, 'x', a * .7); P.r(fa, 'x', bend); P.r(hd, 'x', -(a + bend) * keep)
def arm_fwd(P, s, deg):  # brazo de bípedo hacia delante (+) o atrás (-)
    P.r(ARM[s][1], ARM_FWD_AX[s], ARM_FWD[s] * deg)
def arm_up(P, s, deg):   # brazo de bípedo hacia arriba por el lado
    P.r(ARM[s][1], 'y', ARM_UP[s] * deg)
def look(P, pitch=0.0, yaw=0.0, roll=0.0):  # cabeza y cuello (pitch + = baja la cabeza)
    spread(P, NECK, 'x', pitch * .5); P.r(HEAD, 'x', pitch * (.5 if NECK else 1)); spread(P, NECK, 'z', yaw * .4); P.r(HEAD, 'z', yaw * .6); P.r(HEAD, 'y', roll)

# ---------------- reposo (4 s) ----------------
def idle(P, t):
    ph = TAU * t
    P.body(move=(0, 0, .004 * BODYH * S(ph * 2) + (.04 * BODYH * S(ph) if FLOAT else 0)), roll=(2.5 * S(ph * 2) if FLOAT else 0))
    spread(P, SPINE, 'x', 2.2 * S(ph)); look(P, pitch=2.5 * S(2 * ph - .9), yaw=8 * S(ph))
    if QUAD:
        for s in "LR": P.r(ARM[s][1], 'x', 1.2 * S(ph)); P.r(LEG[s][0], 'x', -1.2 * S(ph))
    else:
        for s, k in (("L", 0), ("R", math.pi)): arm_fwd(P, s, 4 * S(ph + k)); arm_up(P, s, 3 + 3 * S(ph))
    if JAW: P.r(JAW, 'x', JAW_OPEN * 3 * max(0, S(ph * 2)))
    tail_follow(P, lambda d: 9 * S(ph * 2 - d), lambda d: 3 * S(ph * 2 - d - 1)); secondary(P, ph * 2, 4)

# ---------------- correr (0,7 s en bucle) ----------------
def run(P, t):
    ph = TAU * t
    if FLOAT:   # se desliza flotando: vaivén suave, algo inclinado hacia delante y las extremidades colgando
        P.body(move=(0, 0, .05 * BODYH * S(2 * ph)), pitch=9, roll=4 * S(ph))
        for s, off in (("L", 0.0), ("R", math.pi)):
            leg(P, s, 10 * S(ph + off), 0, keep=.3); arm_fwd(P, s, -12 + 6 * S(ph + off))
        spread(P, SPINE, 'z', 3 * S(ph)); look(P, pitch=-5, yaw=3 * S(ph))
    elif QUAD:
        # trote de perro: zancadas amplias en diagonal (trasera izquierda con delantera derecha), la pata que avanza se dobla y se levanta;
        # el cuerpo apenas sube y baja (sin vaivén de lado a lado: con él parecía que solo se balanceaba el modelo)
        P.body(move=(0, 0, .025 * BODYH * (1 - C(2 * ph)) * .5), pitch=1.5 * S(2 * ph))
        for s, off in (("L", 0.0), ("R", math.pi)):
            o = "R" if s == "L" else "L"
            a = 36 * S(ph + off); lift = max(0.0, -C(ph + off))
            leg(P, s, a, lift, bend_max=62); fleg(P, o, a * .9, lift, bend_max=58)
        spread(P, SPINE, 'z', 1.5 * S(ph)); look(P, pitch=-3 + 2 * S(2 * ph + .6))
    else:
        # carrera de piernas: zancada amplia, la pierna que avanza dobla la rodilla y sube el pie; brazos al contrario
        P.body(move=(0, 0, .045 * BODYH * abs(S(ph))), pitch=8, yaw=2 * S(ph))
        for s, off in (("L", 0.0), ("R", math.pi)):
            a = 40 * S(ph + off); lift = max(0.0, -C(ph + off))
            leg(P, s, a, lift, keep=.6, bend_max=66); arm_fwd(P, s, 34 * S(ph + off)); P.r(ARM[s][2], 'x', ELBF[s] * 30)
        spread(P, SPINE, 'z', -3 * S(ph)); look(P, pitch=-6, yaw=2 * S(ph))
    if JAW: P.r(JAW, 'x', JAW_OPEN * 5)
    # la cola sigue al paso: de lado, al contrario que la cadera en cada zancada; arriba y abajo, con el rebote del cuerpo (cada media zancada)
    if FLOAT: tail_follow(P, lambda d: 8 * S(ph - d), lambda d: -6 + 3 * S(2 * ph - d))
    else: tail_follow(P, lambda d: (18 if QUAD else 10) * S(ph + math.pi - d), lambda d: (8 if QUAD else 2) + 6 * C(2 * ph - d))
    secondary(P, ph * 2, 6, back=-25)

# ---------------- ataque (1,17 s; el golpe cae hacia el 49 %) ----------------
def attack(P, t):
    wind = smooth(0.0, .30, t) * (1 - smooth(.30, .46, t))
    hit = smooth(.30, .47, t) * (1 - smooth(.52, .86, t))
    back = smooth(.47, .56, t) * (1 - smooth(.56, .9, t))
    L = .55 if QUAD else 1.0   # los cuadrúpedos embisten menos inclinados (si no, los de cuello largo meten la cabeza en el suelo)
    P.body(move=(0, .08 * BODYH * wind - .24 * BODYH * hit * (.8 if QUAD else 1) + .03 * BODYH * back, .02 * BODYH * wind + .02 * BODYH * hit), pitch=-12 * wind + 18 * L * hit - 3 * back)
    spread(P, SPINE, 'x', -6 * wind + 10 * L * hit); look(P, pitch=-14 * wind + 16 * L * hit)
    if JAW: P.r(JAW, 'x', JAW_OPEN * (6 * wind + 26 * hit))
    if QUAD:
        for s in "LR":
            leg(P, s, 10 * wind - 18 * hit, .2 * wind); fleg(P, s, 14 * wind - 26 * hit, .5 * wind + .2 * hit)
    else:
        arm_fwd(P, "R", -35 * wind + 85 * hit); P.r(ARM["R"][2], 'x', ELBF["R"] * (50 * wind - 10 * hit))
        arm_fwd(P, "L", 15 * wind - 30 * hit); P.r(ARM["L"][2], 'x', ELBF["L"] * 35)
        for s, k in (("L", -1), ("R", 1)): leg(P, s, (8 * wind + 20 * hit) * k, .25 * wind, keep=.5)
    # la cola llega tarde a la embestida (latigazo): sube al cargar y al golpear, con un pequeño retraso en cada segmento
    wd = lambda d: smooth(0.0, .30, t - .07 * d) * (1 - smooth(.30, .46, t - .07 * d)); hd = lambda d: smooth(.30, .47, t - .07 * d) * (1 - smooth(.52, .86, t - .07 * d))
    tail_follow(P, lambda d: 10 * S(TAU * t * 2 - d) * (1 - hd(d)), lambda d: 10 * wd(d) + 16 * hd(d)); secondary(P, TAU * t * 3, 5 * back, back=-30 * hit)

# ---------------- victoria (3,3 s): tres saltitos ----------------
def victory(P, t):
    ph = TAU * t
    def hop(a, b): x = (t - a) / (b - a); return S(math.pi * x) if 0 <= x <= 1 else 0.0
    crouch = 0.0
    for a, b in ((.08, .30), (.34, .56), (.60, .82)):
        if a - .05 <= t < a: crouch = max(crouch, smooth(a - .05, a, t))
    up = hop(.08, .30) + hop(.34, .56) + hop(.60, .82)
    cheer = smooth(.05, .14, t) * (1 - smooth(.88, 1.0, t))
    P.body(move=(0, 0, .16 * BODYH * up - .04 * BODYH * crouch), pitch=-5 * up + 4 * crouch, yaw=8 * S(ph * 3) * up)
    look(P, pitch=-10 * cheer + 3 * S(ph * 6), yaw=10 * S(ph * 3) * cheer)
    if JAW: P.r(JAW, 'x', JAW_OPEN * 14 * cheer)
    if QUAD:
        for s in "LR": leg(P, s, -10 * up + 8 * crouch, .5 * up); fleg(P, s, 18 * up, .7 * up)
    else:
        for s in "LR":
            hz_ = arm_horiz(s) and not RELAX[s]; raise_ = 18 if hz_ else 100
            arm_up(P, s, raise_ * cheer + (6 if hz_ else 12) * S(ph * 6) * cheer); P.r(ARM[s][2], 'x', ELBF[s] * 15 * cheer)
            leg(P, s, -14 * up + 8 * crouch, .4 * up, keep=.5)
    tail_follow(P, lambda d: 26 * cheer * S(ph * 6 - d), lambda d: 14 * cheer + 6 * up); secondary(P, ph * 3, 10 * cheer)

# ---------------- caída (3 s): se tambalea y se derrumba de lado ----------------
def faint(P, t):
    wob = (1 - smooth(.05, .22, t)) * smooth(0, .05, t)
    fall = smooth(.18, .62, t); droop = smooth(.05, .5, t)
    hip = H[first("Hips", "Waist", *ROOTS)]
    pv = Vector((hip.x + .12 * BODYH, hip.y, zmin))
    P.body(move=(0, 0, -.04 * BODYH * smooth(.1, .3, t)), roll=86 * fall + 8 * S(TAU * t * 4) * wob, pivot=pv)
    spread(P, SPINE, 'x', 12 * droop); look(P, pitch=26 * droop, yaw=12 * S(TAU * t * 3) * wob)
    if JAW: P.r(JAW, 'x', JAW_OPEN * 10 * droop)
    for s in "LR":
        if QUAD: leg(P, s, -14 * droop, .4 * droop); fleg(P, s, 18 * droop, .5 * droop)
        else: arm_up(P, s, 25 * droop); P.r(ARM[s][2], 'x', ELBF[s] * 20 * droop); leg(P, s, -10 * droop, .3 * droop, keep=.4)
    tail_follow(P, lambda d: 10 * (1 - droop) * S(TAU * t * 3 - d), lambda d: -22 * droop); secondary(P, TAU * t * 3, 6 * (1 - droop), back=30 * droop)

clips = [("idle", 120, idle), ("run", 21, run), ("attack", 35, attack), ("victory", 100, victory), ("faint", 90, faint)]
actions = {}
for name, n, fn in clips:
    actions[name] = key_clip(name, n, fn); print("CLIP", name, n)
arm.animation_data.action = None
for tr in list(arm.animation_data.nla_tracks): arm.animation_data.nla_tracks.remove(tr)
for name, n, fn in clips:
    tr = arm.animation_data.nla_tracks.new(); tr.name = name; st = tr.strips.new(name, 0, actions[name]); st.name = name
# acciones sobrantes del GLB original (p. ej. «ArmatureAction») fuera
for a in list(bpy.data.actions):
    if a.name not in actions: bpy.data.actions.remove(a)

if RENDER:
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x = 300; sc.render.resolution_y = 300; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam; cam.data.type = 'ORTHO'
    hip = H[first("Hips", "Waist", *ROOTS)]
    for name, n, fn in clips:
        for track in arm.animation_data.nla_tracks: track.mute = (track.name != name)
        marks = {"run": [0, .25, .5, .75], "attack": [0, .3, .47, .7], "victory": [0, .19, .45, .7], "faint": [0, .3, .6, 1], "idle": [0, .5]}[name]
        c = Vector((hip.x, (ymin + ymax) / 2, zmin + BODYH * .6)); cam.data.ortho_scale = max(BODYH, ymax - ymin) * 2.2
        for view, d in (("lado", Vector((1, 0, 0))), ("frente", Vector((0, -1, 0)))):
            for i, m in enumerate(marks):
                sc.frame_set(int(m * n)); cam.location = c + d * 30; cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
                sc.render.filepath = VIEWS + f"/{name}_{view}_{i}.png"; bpy.ops.render.render(write_still=True)
    for track in arm.animation_data.nla_tracks: track.mute = False

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_force_sampling=True, export_frame_step=1, export_optimize_animation_size=True, export_skins=True,
                          export_image_format='WEBP', export_draco_mesh_compression_enable=True, export_draco_position_quantization=12, export_draco_normal_quantization=8,
                          export_yup=True, export_apply=False)
print("EXPORTADO", OUT)
