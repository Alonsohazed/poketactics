"""Clips del juego (idle, run, attack, victory, faint) para modelos de Pokemon-3D-api SIN esqueleto (Cleffa, Togepi, Onix, Houndour,
Duskull, Litwick…): no hay huesos que doblar, así que se anima el cuerpo entero con un nodo padre («Cuerpo», en el suelo bajo el centro):
rebote con estirar y encoger (squash & stretch), inclinación, embestida, saltitos y caída de lado.
Uso: blender -b --python crear-clips-sin-esqueleto.py -- <entrada.glb> <salida.glb> [render <carpeta>] [flota=1]
`flota=1` (fantasmas, Magnezone…): en vez de saltar, sube y baja suave en el aire.
Después, igual que los demás: optimizar-modelo.mjs, su .json y el número en ANIM_SET (board3d.js)."""
import bpy, math, sys
from mathutils import Vector, Matrix, Euler, Quaternion
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
IN, OUT = argv[0], argv[1]
RENDER = "render" in argv
VIEWS = argv[argv.index("render") + 1] if RENDER else "."
FLOAT = "flota=1" in argv
FPS = 30
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=IN)
sc = bpy.context.scene; sc.render.fps = FPS
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith("Icosphere")]: bpy.data.objects.remove(o, do_unlink=True)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
bpy.context.view_layer.update()
pts = [m.matrix_world @ v.co for m in meshes for v in m.data.vertices]
zmin = min(p.z for p in pts); zmax = max(p.z for p in pts)
cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2; cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
BODYH = max(1e-3, zmax - zmin)
# nodo padre en el suelo bajo el centro: todo cuelga de él (se conserva la posición de cada pieza)
body = bpy.data.objects.new("Cuerpo", None); sc.collection.objects.link(body); body.location = (cx, cy, zmin)
bpy.context.view_layer.update()
for o in [o for o in bpy.data.objects if o.parent is None and o is not body]:
    mw = o.matrix_world.copy(); o.parent = body; o.matrix_world = mw
body.rotation_mode = 'XYZ'
print("SIN ESQUELETO", IN, "altura", round(BODYH, 3), "flota" if FLOAT else "salta")

S = math.sin; C = math.cos; TAU = 2 * math.pi
def smooth(a, b, x):
    x = min(1.0, max(0.0, (x - a) / (b - a))); return x * x * (3 - 2 * x)
BASE = body.location.copy()

# ---- patas automáticas (patas=4 cuadrúpedos, patas=2 bípedos): se buscan los pies en la malla y se crea un hueso por pata ----
# Los vértices de cada pata pesan en su hueso más cuanto más cerca del pie (0 en la cadera): al girar el hueso desde la cadera la pata
# se dobla con suavidad y al subirlo el pie se levanta. `cadera=` (fracción de la altura) ajusta dónde empieza la pata.
PATAS = int(next((a.split("=")[1] for a in argv if a.startswith("patas=")), "0"))
rig = None; LEGS = []   # (nombre del hueso, fase del paso, centro del pie)
if PATAS in (2, 4):
    from collections import defaultdict
    ext = max(max(p.x for p in pts) - min(p.x for p in pts), max(p.y for p in pts) - min(p.y for p in pts))
    low = [p for p in pts if p.z < zmin + .07 * BODYH]
    # k-medias empezando por los cuadrantes (delante/detrás × izquierda/derecha) o por los lados (bípedos): siempre da PATAS grupos
    xs = sorted(p.x for p in low); ys = sorted(p.y for p in low); mx = xs[len(xs) // 2]; my = ys[len(ys) // 2]
    if PATAS == 4: groups0 = [[p for p in low if (p.x > mx) == sx and (p.y > my) == sy] for sx in (0, 1) for sy in (0, 1)]
    else: groups0 = [[p for p in low if (p.x > mx) == sx] for sx in (0, 1)]
    cents = [sum(g, Vector()) / len(g) for g in groups0 if g]
    feet = []
    if len(cents) == PATAS:
        for _ in range(12):
            feet = [[] for _ in cents]
            for p in low: feet[min(range(len(cents)), key=lambda i: (p.x - cents[i].x) ** 2 + (p.y - cents[i].y) ** 2)].append(p)
            cents = [sum(g, Vector()) / len(g) if g else cents[i] for i, g in enumerate(feet)]
        feet = [g for g in feet if g]
    if len(feet) == PATAS:
        HIPF = float(next((a.split("=")[1] for a in argv if a.startswith("cadera=")), ".34" if PATAS == 4 else ".32"))
        hz = zmin + HIPF * BODYH
        FEET = []
        for fp in feet:
            c = sum(fp, Vector()) / len(fp); c.z = zmin
            r = max(math.hypot(p.x - c.x, p.y - c.y) for p in fp) * 1.3 + ext * .03
            FEET.append((c, r))
        ad = bpy.data.armatures.new("Patas"); rig = bpy.data.objects.new("Patas", ad); sc.collection.objects.link(rig)
        rig.parent = body; bpy.context.view_layer.update(); rig.matrix_world = Matrix.Identity(4)
        bpy.context.view_layer.objects.active = rig; rig.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
        root = ad.edit_bones.new("Raiz"); root.head = (cx, cy, zmin); root.tail = (cx, cy, zmin + .2 * BODYH)
        for i, (c, r) in enumerate(FEET):
            b = ad.edit_bones.new(f"Pata{i}"); b.head = (c.x, c.y, hz); b.tail = (c.x, c.y, zmin + .01 * BODYH); b.parent = root
        bpy.ops.object.mode_set(mode='OBJECT')
        for m in meshes:
            mw = m.matrix_world; gr = m.vertex_groups.new(name="Raiz"); gl = [m.vertex_groups.new(name=f"Pata{i}") for i in range(len(FEET))]
            for v in m.data.vertices:
                p = mw @ v.co; best, bw = None, 0.0
                for i, (c, r) in enumerate(FEET):
                    d = math.hypot(p.x - c.x, p.y - c.y)
                    if d < r and p.z < hz:
                        w = smooth(hz, zmin + .45 * (hz - zmin), p.z) * (1 - smooth(r * .75, r, d))
                        if w > bw: best, bw = i, w
                if best is not None and bw > 0: gl[best].add([v.index], bw, 'REPLACE')
                gr.add([v.index], 1 - bw, 'REPLACE')
            md = m.modifiers.new("Patas", 'ARMATURE'); md.object = rig
        # trote en diagonal (cuadrúpedos: delantera izquierda con trasera derecha) o piernas alternas (bípedos); el modelo mira a -Y
        for i, (c, r) in enumerate(FEET):
            front, left = c.y < cy, c.x > cx
            ph = (0.0 if front == left else math.pi) if PATAS == 4 else (0.0 if left else math.pi)
            LEGS.append((f"Pata{i}", ph, c))
        for b in rig.pose.bones: b.rotation_mode = 'QUATERNION'
        print("PATAS", PATAS, "cadera", round(HIPF, 2), [(round(c.x, 2), round(c.y, 2)) for c, r in FEET])
    else: print("PATAS no encontradas: hay", len(feet), "grupos de pies")
LEGPOSE = {}
def pata(ang=0.0, lift=0.0, ph=0.0):
    """Paso de todas las patas para este fotograma: `ang` grados de zancada (+ = pie hacia atrás) y `lift` (0-1) para levantar el que avanza."""
    for n, off, c in LEGS:
        a = ang * S(ph + off); l = lift * max(0.0, -C(ph + off)); LEGPOSE[n] = (a, l)
def key_legs(f):
    if not rig: return
    LL = (hz - zmin)
    for n, off, c in LEGS:
        a, l = LEGPOSE.get(n, (0.0, 0.0)); pbn = rig.pose.bones[n]; RWb = rig.data.bones[n].matrix_local.to_3x3()
        pbn.rotation_quaternion = Quaternion((RWb.inverted() @ Vector((1, 0, 0))).normalized(), math.radians(a))
        pbn.location = RWb.inverted() @ Vector((0, 0, .22 * LL * l))
        pbn.keyframe_insert('rotation_quaternion', frame=f); pbn.keyframe_insert('location', frame=f)
    LEGPOSE.clear()
def put(f, move=(0, 0, 0), pitch=0.0, roll=0.0, yaw=0.0, sq=1.0, pivot=None):
    """Coloca el cuerpo: desplazamiento, giros (grados, + pitch = hacia delante; el modelo mira a -Y) alrededor de `pivot`
    (por defecto, su base) y `sq` = estirar (>1) o encoger (<1) en vertical conservando el volumen."""
    R = Euler((math.radians(pitch), math.radians(roll), math.radians(yaw)), 'XYZ')
    p = Vector(pivot) if pivot is not None else BASE
    loc = p + R.to_matrix() @ (BASE - p) + Vector(move)
    body.location = loc; body.rotation_euler = R; w = 1 / math.sqrt(max(.3, sq)); body.scale = (w, w, sq)
    body.keyframe_insert('location', frame=f); body.keyframe_insert('rotation_euler', frame=f); body.keyframe_insert('scale', frame=f)

def idle(f, t):
    ph = TAU * t
    if FLOAT: put(f, move=(0, 0, .05 * BODYH * S(ph)), roll=3 * S(ph * 2), yaw=6 * S(ph), sq=1 + .02 * S(ph * 2))
    else: put(f, move=(0, 0, 0), roll=2 * S(ph), yaw=7 * S(ph), sq=1 + .03 * S(ph * 2))
def run(f, t):
    ph = TAU * t
    if FLOAT: put(f, move=(0, 0, .06 * BODYH * S(ph * 2)), pitch=10, roll=5 * S(ph), sq=1 + .03 * S(ph * 2))
    elif LEGS:   # con patas: camina (zancada y pie levantado), el cuerpo solo sube y baja un poco
        pata(30 if PATAS == 4 else 34, 1.0, ph)
        put(f, move=(0, 0, .02 * BODYH * (1 - C(2 * ph)) * .5), pitch=3 + 1.5 * S(2 * ph), sq=1 + .015 * S(2 * ph))
    else:
        h = abs(S(ph)); land = 1 - min(1, h * 4)   # saltitos: se estira en el aire y se aplasta al tocar el suelo
        put(f, move=(0, 0, .12 * BODYH * h), pitch=8, roll=6 * S(ph), yaw=4 * S(ph), sq=1 + .08 * h - .12 * land)
def attack(f, t):
    wind = smooth(0.0, .30, t) * (1 - smooth(.30, .46, t)); hit = smooth(.30, .47, t) * (1 - smooth(.52, .86, t)); back = smooth(.47, .56, t) * (1 - smooth(.56, .9, t))
    put(f, move=(0, .10 * BODYH * wind - .30 * BODYH * hit + .04 * BODYH * back, .04 * BODYH * hit), pitch=-12 * wind + 16 * hit - 4 * back, sq=1 - .14 * wind + .12 * hit - .05 * back)
def victory(f, t):
    ph = TAU * t
    def hop(a, b): x = (t - a) / (b - a); return S(math.pi * x) if 0 <= x <= 1 else 0.0
    crouch = 0.0
    for a, b in ((.08, .30), (.34, .56), (.60, .82)):
        if a - .06 <= t < a: crouch = max(crouch, smooth(a - .06, a, t))
    up = hop(.08, .30) + hop(.34, .56) + hop(.60, .82)
    spin = 360 * smooth(.34, .56, t)   # una vuelta en el segundo salto
    put(f, move=(0, 0, .22 * BODYH * up), yaw=spin + 8 * S(ph * 3) * (1 - up), sq=1 + .10 * up - .14 * crouch)
def faint(f, t):
    wob = (1 - smooth(.05, .22, t)) * smooth(0, .05, t); fall = smooth(.18, .62, t)
    pv = Vector((BASE.x + .35 * BODYH, BASE.y, BASE.z))
    put(f, move=(0, 0, -.03 * BODYH * smooth(.1, .3, t) + (-.05 * BODYH * fall if FLOAT else 0)), roll=84 * fall + 8 * S(TAU * t * 4) * wob, sq=1 - .06 * fall, pivot=pv)

clips = [("idle", 120, idle), ("run", 21, run), ("attack", 35, attack), ("victory", 100, victory), ("faint", 90, faint)]
body.animation_data_create(); acts = {}
for name, n, fn in clips:
    act = bpy.data.actions.new(name); body.animation_data.action = act
    if rig: rig.animation_data_create(); ra = bpy.data.actions.new(name + "_patas"); rig.animation_data.action = ra; ra.use_fake_user = True; acts[name + "_patas"] = ra
    for f in range(0, n + 1): fn(f, f / n); key_legs(f)   # las patas se fijan en todos los clips (si no, al cambiar de clip se quedarían a medio paso)
    act.use_fake_user = True; acts[name] = act; print("CLIP", name, n)
body.animation_data.action = None
if rig: rig.animation_data.action = None
for name, n, fn in clips:
    tr = body.animation_data.nla_tracks.new(); tr.name = name; st = tr.strips.new(name, 0, acts[name]); st.name = name
    if rig: tr = rig.animation_data.nla_tracks.new(); tr.name = name; st = tr.strips.new(name, 0, acts[name + "_patas"]); st.name = name   # mismo nombre: el exportador lo une en una sola animación

if RENDER:
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x = 300; sc.render.resolution_y = 300; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam; cam.data.type = 'ORTHO'
    for name, n, fn in clips:
        for ob in [body] + ([rig] if rig else []):
            for track in ob.animation_data.nla_tracks: track.mute = (track.name != name)
        marks = {"run": [0, .25, .5, .75], "attack": [0, .3, .47, .7], "victory": [0, .19, .45, .7], "faint": [0, .3, .6, 1], "idle": [0, .5]}[name]
        c = Vector((cx, cy, zmin + BODYH * .6)); cam.data.ortho_scale = BODYH * 2.4
        for view, d in (("lado", Vector((1, 0, 0))), ("frente", Vector((0, -1, 0)))):
            for i, m in enumerate(marks):
                sc.frame_set(int(m * n)); cam.location = c + d * 30; cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
                sc.render.filepath = VIEWS + f"/{name}_{view}_{i}.png"; bpy.ops.render.render(write_still=True)
    for ob in [body] + ([rig] if rig else []):
        for track in ob.animation_data.nla_tracks: track.mute = False
    sc.frame_set(0)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_force_sampling=True, export_frame_step=1, export_optimize_animation_size=True,
                          export_image_format='WEBP', export_skins=True, export_draco_mesh_compression_enable=True, export_draco_position_quantization=12, export_draco_normal_quantization=8,
                          export_yup=True, export_apply=False)
print("EXPORTADO", OUT)
