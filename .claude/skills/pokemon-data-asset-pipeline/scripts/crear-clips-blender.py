"""Chikorita (152): crea en Blender los 5 clips del juego (idle, run, attack, victory, faint) sobre su esqueleto y los exporta a GLB.
Uso: blender -b --python crear-clips-blender.py -- <entrada.glb sin animaciones> <salida.glb> [render carpeta_de_vistas]
Ejemplo (Blender 5.2, sin ventana): "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --python crear-clips-blender.py -- 152.glb 152_anim.glb
Después: node optimizar-modelo.mjs 152_anim.glb 152.glb y copiar a public/anims/ (más su .json y el número en ANIM_SET de board3d.js).
Ojo: está escrito para el esqueleto de Chikorita (nombres de huesos Hips, Spine1/2, Neck, Head, Hair1-5, L/RArm, L/RThigh, L/RFoot y Tail; las lianas L/RFeeler01-10 se eliminan); para otro Pokémon hay que adaptar los nombres y las amplitudes.
Pasos: importa el GLB de Pokemon-3D-api (sin animaciones) -> hornea su pose por defecto como pose de reposo (así el reposo es el aspecto normal del juego)
-> anima huesos con rotaciones sobre ejes del mundo -> un clip por pista NLA -> exporta con Draco y WebP."""
import bpy, math, sys, json
from mathutils import Vector, Matrix, Quaternion, Euler
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
IN, OUT = argv[0], argv[1]
RENDER = "render" in argv
VIEWS = argv[argv.index("render") + 1] if RENDER and len(argv) > argv.index("render") + 1 else "."
FPS = 30
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=IN)
sc = bpy.context.scene; sc.render.fps = FPS
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
if "Icosphere" in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects["Icosphere"], do_unlink=True)
# Se quitan las lianas del cuello (mallas, huesos y grupos de vértices): estaban mal modeladas (dos líneas rectas a los lados) y se veían feas
for o in [o for o in bpy.data.objects if o.type == 'MESH' and 'Vine' in o.name]: bpy.data.objects.remove(o, do_unlink=True)
bpy.context.view_layer.objects.active = arm; arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for eb in [b for b in arm.data.edit_bones if 'Feeler' in b.name]: arm.data.edit_bones.remove(eb)
bpy.ops.object.mode_set(mode='OBJECT')
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for m in meshes:
    for vg in [v for v in m.vertex_groups if 'Feeler' in v.name]: m.vertex_groups.remove(vg)

# ---- 1) la pose por defecto del GLB pasa a ser la pose de reposo ----
bpy.ops.object.select_all(action='DESELECT')
for m in meshes:
    bpy.context.view_layer.objects.active = m; m.select_set(True)
    for md in list(m.modifiers):
        if md.type == 'ARMATURE': bpy.ops.object.modifier_apply(modifier=md.name)
    m.select_set(False)
bpy.context.view_layer.objects.active = arm; arm.select_set(True)
bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.select_all(action='SELECT'); bpy.ops.pose.armature_apply(selected=False); bpy.ops.object.mode_set(mode='OBJECT')
for m in meshes:
    md = m.modifiers.new("Armature", 'ARMATURE'); md.object = arm
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
pts = []
for m in meshes:
    e = m.evaluated_get(dg); me = e.to_mesh(); pts += [e.matrix_world @ v.co for v in me.vertices]
zmin = min(p.z for p in pts); zmax = max(p.z for p in pts)
body = [p for p in pts]  # mismas unidades que el esqueleto
H = {b.name: arm.matrix_world @ b.head_local.copy() for b in arm.data.bones}
BODYH = H["Head"].z - zmin  # altura aproximada del cuerpo hasta la cabeza
print("ALTURA cuerpo hasta la cabeza", round(BODYH, 3), "zmin", round(zmin, 3), "zmax hoja", round(zmax, 3))

# ---- utilidades ----
RW = {b.name: (arm.matrix_world.to_3x3() @ b.matrix_local.to_3x3()) for b in arm.data.bones}  # orientación de reposo de cada hueso en el mundo
AX = {"x": Vector((1, 0, 0)), "y": Vector((0, 1, 0)), "z": Vector((0, 0, 1))}
def rot_q(bone, axis, deg):
    """Cuaternión local que gira el hueso `deg` grados alrededor de un eje del mundo (con el reposo como referencia)."""
    a = RW[bone].inverted() @ AX[axis]
    return Quaternion(a.normalized(), math.radians(deg))
def loc_local(bone, v):  # desplazamiento en el mundo -> en el espacio local de un hueso raíz
    return RW[bone].inverted() @ Vector(v)
pb = arm.pose.bones
for b in pb: b.rotation_mode = 'QUATERNION'
ALL = [b.name for b in pb]
L_FEEL = [f"LFeeler{i:02d}" for i in range(1, 11)]; R_FEEL = [f"RFeeler{i:02d}" for i in range(1, 11)]
HAIR = [f"Hair{i}" for i in range(1, 6)]
ROOTS = ["Hips", "Spine1"]
KEYLOC = ROOTS + ["LFoot", "RFoot", "LHand", "RHand"]

class Pose:
    """Pose de un fotograma: rotaciones acumuladas por hueso (en el orden en que se piden) y desplazamiento global del cuerpo."""
    def __init__(s): s.q = {n: Quaternion() for n in ALL}; s.loc = {n: Vector((0, 0, 0)) for n in ALL}
    def mv(s, bone, v):
        """Desplaza un hueso (en ejes del mundo) respecto a su reposo: las patas de Chikorita son muñones muy cortos y girarlas apenas se nota, así que los pasos se dan trasladando pies y manos."""
        if bone in s.loc: s.loc[bone] = s.loc[bone] + loc_local(bone, v)
    def r(s, bone, axis, deg):
        if bone in s.q and deg: s.q[bone] = rot_q(bone, axis, deg) @ s.q[bone]
    def body(s, move=(0, 0, 0), pitch=0.0, roll=0.0, yaw=0.0, pivot=None):
        """Mueve y gira todo el cuerpo (ambas raíces) alrededor de `pivot` (por defecto, los pies)."""
        p = Vector(pivot) if pivot is not None else Vector((0, H["Hips"].y, zmin))
        R = Euler((math.radians(pitch), math.radians(roll), math.radians(yaw)), 'XYZ').to_matrix()
        for n in ROOTS:
            h = H[n]; h2 = p + R @ (h - p) + Vector(move); s.loc[n] = loc_local(n, h2 - h)
            s.q[n] = (RW[n].inverted() @ R @ RW[n]).to_quaternion() @ s.q[n]

def key_clip(name, frames, fn, loop=False):
    act = bpy.data.actions.new(name); arm.animation_data_create(); arm.animation_data.action = act
    for f in frames:
        t = f / (frames[-1] if frames[-1] else 1)
        P = Pose(); fn(P, t, f)
        for n in ALL:
            b = pb[n]; b.rotation_quaternion = P.q[n]; b.location = P.loc[n]
            b.keyframe_insert('rotation_quaternion', frame=f)
            if n in KEYLOC: b.keyframe_insert('location', frame=f)
    for fc in act.fcurves if hasattr(act, 'fcurves') else []:
        for k in fc.keyframe_points: k.interpolation = 'BEZIER'
    act.use_fake_user = True
    return act

S = lambda x: math.sin(x)
TAU = 2 * math.pi
def hang_feelers(P, left_deg=50.0, curl=7.0, stream=0.0, sway=0.0, ph=0.0, lift=0.0):
    """Las lianas del cuello (rectas en la pose de reposo) cuelgan hacia abajo con curvatura; `stream` las lleva hacia atrás, `sway` las mece."""
    for i, (l, r) in enumerate(zip(L_FEEL, R_FEEL)):
        down = (left_deg if i == 0 else curl) - (lift if i == 0 else lift * .3)   # grados hacia abajo (negativo = hacia arriba)
        w = sway * S(ph - i * .45)
        P.r(l, 'y', down + w); P.r(r, 'y', -(down + w))
        if stream: P.r(l, 'z', stream); P.r(r, 'z', -stream)
def leaf(P, back=0.0, sway=0.0, ph=0.0):
    for i, h in enumerate(HAIR):
        P.r(h, 'x', -back / (1 + i * .3) + sway * S(2 * ph - i * .6)); P.r(h, 'y', sway * .7 * S(ph - i * .5))

# ---------------- reposo ----------------
def idle(P, t, f):
    ph = TAU * t
    P.body(move=(0, 0, .004 * BODYH * S(ph * 2) + .0), pitch=0.0)
    P.r("Spine2", 'x', 1.6 * S(ph)); P.r("Neck", 'x', 1.2 * S(ph - .6)); P.r("Head", 'x', 2.5 * S(2 * ph - .9)); P.r("Head", 'z', 7 * S(ph))
    for s, sgn in (("L", 1), ("R", -1)):
        P.r(s + "Arm", 'x', 3 * S(ph + (0 if s == "L" else math.pi))); P.r(s + "Arm", 'y', sgn * 4 * (1 + S(ph)) * .5)
    P.r("Tail", 'z', 7 * S(2 * ph)); leaf(P, back=0, sway=4, ph=ph); hang_feelers(P, left_deg=70, curl=25, sway=4, ph=ph * 2)

# ---------------- correr (bucle de 0,7 s) ----------------
def run(P, t, f):
    ph = TAU * t
    P.body(move=(0, 0, .06 * BODYH * abs(S(ph))), pitch=11, roll=9 * S(ph), yaw=6 * S(ph))   # contoneo y saltitos: es lo que hace de «patas»
    for s, k in (("L", 1), ("R", -1)):
        sw = S(ph) * k
        # (probado: trasladar pies y manos abulta la barriga, porque el modelo no tiene patas, solo muñones; el paso lo da el cuerpo)
        P.r(s + "Thigh", 'x', 38 * sw); P.r(s + "Foot", 'x', 38 * max(0, -math.cos(ph) * k) + 6); P.r(s + "Toe", 'x', -14 * max(0, math.cos(ph) * k))
        P.r(s + "Arm", 'x', -30 * sw); P.r(s + "Arm", 'y', (1 if s == "L" else -1) * 12)
    P.r("Spine2", 'x', -5 + 2 * S(2 * ph)); P.r("Neck", 'x', -6); P.r("Head", 'x', -8 + 3 * S(2 * ph + .5)); P.r("Head", 'z', 3 * S(ph))
    P.r("Tail", 'z', 14 * S(ph)); P.r("Tail", 'x', -10)
    leaf(P, back=28, sway=7, ph=ph); hang_feelers(P, left_deg=45, curl=19, stream=34 + 8 * S(2 * ph), sway=6, ph=ph * 2)

# ---------------- ataque (1,17 s; el golpe cae al ~49 %) ----------------
def smooth(a, b, x):
    x = min(1.0, max(0.0, (x - a) / (b - a))); return x * x * (3 - 2 * x)
def attack(P, t, f):
    wind = smooth(0.0, .30, t) * (1 - smooth(.30, .46, t))   # carga hacia atrás
    hit = smooth(.30, .47, t) * (1 - smooth(.52, .86, t))    # embestida
    back = smooth(.47, .56, t) * (1 - smooth(.56, .9, t))    # rebote
    P.body(move=(0, .09 * BODYH * wind - .26 * BODYH * hit + .04 * BODYH * back, .03 * BODYH * wind + .02 * BODYH * hit), pitch=-16 * wind + 24 * hit - 4 * back)
    P.r("Spine2", 'x', -6 * wind + 10 * hit); P.r("Neck", 'x', -10 * wind + 14 * hit); P.r("Head", 'x', -12 * wind + 18 * hit)
    for s, k in (("L", 1), ("R", -1)):
        P.r(s + "Arm", 'x', 45 * wind - 50 * hit); P.r(s + "Arm", 'y', k * (10 + 35 * hit))
        P.r(s + "Thigh", 'x', 10 * wind - 22 * hit); P.r(s + "Foot", 'x', -8 * hit)
    P.r("Tail", 'x', -20 * hit); P.r("Tail", 'z', 18 * S(TAU * t * 2) * (1 - hit))
    leaf(P, back=(-20 * wind + 30 * hit), sway=5 * back, ph=TAU * t * 2)
    hang_feelers(P, left_deg=60 - 40 * hit, curl=22 - 8 * hit, stream=40 * wind - 70 * hit, sway=4 * back, ph=TAU * t * 3, lift=20 * hit)

# ---------------- victoria (3,3 s): dos saltitos con los brazos arriba ----------------
def victory(P, t, f):
    ph = TAU * t
    def hop(a, b): x = (t - a) / (b - a); return S(math.pi * x) if 0 <= x <= 1 else 0.0
    crouch = 0.0
    for a, b in ((.08, .30), (.34, .56), (.60, .82)):
        if a - .05 <= t < a: crouch = max(crouch, smooth(a - .05, a, t))
    up = hop(.08, .30) + hop(.34, .56) + hop(.60, .82)
    P.body(move=(0, 0, .20 * BODYH * up - .05 * BODYH * crouch), pitch=-6 * up + 4 * crouch, yaw=10 * S(ph * 3) * up)
    cheer = smooth(.05, .14, t) * (1 - smooth(.88, 1.0, t))
    for s, k in (("L", 1), ("R", -1)):
        P.r(s + "Arm", 'y', k * -(110 * cheer + 14 * S(ph * 6) * cheer)); P.r(s + "Arm", 'x', 6 * S(ph * 3 + (0 if s == "L" else 1.6)))
        P.r(s + "Thigh", 'x', -16 * up + 10 * crouch); P.r(s + "Foot", 'x', 22 * up)
    P.r("Spine2", 'x', -5 * cheer); P.r("Neck", 'x', -8 * cheer); P.r("Head", 'x', -10 * cheer + 3 * S(ph * 6)); P.r("Head", 'z', 12 * S(ph * 3) * cheer)
    P.r("Tail", 'z', 28 * S(ph * 6))
    leaf(P, back=-8 * up, sway=16 * cheer, ph=ph * 3)
    hang_feelers(P, left_deg=65, curl=22, sway=8 * cheer, ph=ph * 6, lift=55 * up + 25 * cheer)

# ---------------- caída (3 s, una vez): se tambalea y se derrumba de lado ----------------
def faint(P, t, f):
    wob = (1 - smooth(.05, .22, t)) * smooth(0, .05, t)
    fall = smooth(.18, .62, t)
    side = Vector((H["Hips"].x + .12 * BODYH, H["Hips"].y, zmin))
    P.body(move=(0, 0, -.05 * BODYH * smooth(.1, .3, t)), pitch=0, roll=88 * fall + 9 * S(TAU * t * 4) * wob, pivot=side)
    droop = smooth(.05, .5, t)
    P.r("Spine2", 'x', 14 * droop); P.r("Neck", 'x', 20 * droop); P.r("Head", 'x', 28 * droop); P.r("Head", 'z', 14 * S(TAU * t * 3) * wob)
    for s, k in (("L", 1), ("R", -1)):
        P.r(s + "Arm", 'y', k * (30 + 25 * fall) * droop); P.r(s + "Arm", 'x', 20 * droop)
        P.r(s + "Thigh", 'x', 12 * droop); P.r(s + "Foot", 'x', -16 * droop)
    P.r("Tail", 'z', 30 * droop); P.r("Tail", 'x', 20 * droop)
    leaf(P, back=-50 * droop, sway=6 * (1 - droop), ph=TAU * t * 3)
    hang_feelers(P, left_deg=60 + 30 * droop, curl=22 + 4 * droop, sway=6 * (1 - droop), ph=TAU * t * 3)

clips = [("idle", 120, idle), ("run", 21, run), ("attack", 35, attack), ("victory", 100, victory), ("faint", 90, faint)]
actions = {}
for name, n, fn in clips:
    actions[name] = key_clip(name, list(range(0, n + 1 if name not in ("idle", "run") else n + 1)), fn)
    print("CLIP", name, n, "fotogramas")
arm.animation_data.action = None
# una pista NLA por clip (así el exportador crea una animación por nombre)
for name, n, fn in clips:
    tr = arm.animation_data.nla_tracks.new(); tr.name = name
    st = tr.strips.new(name, 0, actions[name]); st.name = name
# ---- vista previa opcional ----
if RENDER:
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x = 360; sc.render.resolution_y = 360; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam; cam.data.type = 'ORTHO'
    c = Vector((0, H["Hips"].y, BODYH * .55)); cam.data.ortho_scale = BODYH * 3.6
    arm.animation_data.nla_tracks  # mantener
    for track in arm.animation_data.nla_tracks: track.mute = True
    for name, n, fn in clips:
        for track in arm.animation_data.nla_tracks: track.mute = (track.name != name)
        marks = [0, .2, .4, .5, .65, .85] if name in ("attack", "faint", "victory") else [0, .125, .25, .375, .5, .625, .75, .875] if name == "run" else [0, .25, .5, .75]
        cam.data.ortho_scale = BODYH * (2.8 if name == "run" else 3.6); c = Vector((0, H["Hips"].y, BODYH * (.35 if name == "run" else .55)))
        for view, d in (("lado", Vector((1, 0, 0))), ("frente", Vector((0, -1, 0)))):
            for i, m in enumerate(marks):
                sc.frame_set(int(m * n)); cam.location = c + d * 10; cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
                sc.render.filepath = VIEWS + f"/{name}_{view}_{i}.png"; bpy.ops.render.render(write_still=True)
    for track in arm.animation_data.nla_tracks: track.mute = False
# ---- exportar ----
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_force_sampling=True, export_frame_step=1, export_optimize_animation_size=True, export_skins=True,
                          export_image_format='WEBP', export_draco_mesh_compression_enable=True, export_draco_position_quantization=12, export_draco_normal_quantization=8,
                          export_yup=True, export_apply=False)
print("EXPORTADO", OUT)
