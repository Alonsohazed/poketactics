"""Crea un esqueleto completo, con los nombres estándar, para un modelo de Pokemon-3D-api que no trae huesos, y lo exporta a GLB:
después `crear-clips-generico.py` lo anima igual que a los que sí lo traen (paso de 4 patas o de piernas, brazos, cabeza, cola…).
Uso: blender -b --python crear-esqueleto.py -- <entrada.glb> <salida.glb> tipo=cuadrupedo|bipedo|flota [ajustes]
Ajustes (todo en fracciones del alto del modelo, H; el modelo mira a -Y):
  cadera=.34     altura a la que empiezan las patas (donde se unen al cuerpo)
  cuello=.62     altura de la base del cuello en los bípedos (cabeza encima)
  brazos=0       0 para no poner brazos a un bípedo; brazoz=.55 altura de los hombros
  cola=0         0 para no poner cola
  vista=<png>    deja una imagen con los huesos dibujados encima para revisarlos
Cómo coloca los huesos: los pies son los grupos de vértices pegados al suelo (k-medias por cuadrantes); la cabeza, lo más alto y
adelantado; la cola, lo que sobresale por detrás; los brazos, lo que sobresale a los lados a la altura de los hombros.
Los pesos (cuánto mueve cada hueso a cada vértice) los calcula Blender (pesos automáticos); los vértices que se quedan sin peso
(mallas abiertas o piezas sueltas) pasan al hueso más cercano, para que nada se quede atrás al moverse."""
import bpy, math, sys
from mathutils import Vector, Matrix
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
IN, OUT = argv[0], argv[1]
opt = lambda k, d: next((a.split("=", 1)[1] for a in argv if a.startswith(k + "=")), d)
TIPO = opt("tipo", "cuadrupedo")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=IN)
sc = bpy.context.scene
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith("Icosphere")]: bpy.data.objects.remove(o, do_unlink=True)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
bpy.context.view_layer.update()
# se aplican las transformaciones de las piezas (así los vértices ya están en el mundo)
for o in bpy.data.objects:
    if o.type == 'MESH':
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
bpy.ops.object.select_all(action='DESELECT')
for m in meshes: m.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in [o for o in bpy.data.objects if o.type == 'EMPTY']: bpy.data.objects.remove(o, do_unlink=True)
pts = [v.co.copy() for m in meshes for v in m.data.vertices]
xs = [p.x for p in pts]; ys = [p.y for p in pts]; zs = [p.z for p in pts]
zmin, zmax, ymin, ymax, xmin, xmax = min(zs), max(zs), min(ys), max(ys), min(xs), max(xs)
H = zmax - zmin; cx = (xmin + xmax) / 2; cy = (ymin + ymax) / 2
lerp = lambda a, b, t: a + (b - a) * t
def cen(ps): return sum(ps, Vector()) / len(ps) if ps else None
def band(z0, z1): return [p for p in pts if zmin + z0 * H <= p.z <= zmin + z1 * H]

# ---- pies (k-medias empezando por cuadrantes) ----
NP = 4 if TIPO == "cuadrupedo" else 2 if TIPO == "bipedo" else 0
feet = []
if NP:
    low = [p for p in pts if p.z < zmin + .07 * H]
    mx = sorted(p.x for p in low)[len(low) // 2]; my = sorted(p.y for p in low)[len(low) // 2]
    g0 = [[p for p in low if (p.x > mx) == sx and (p.y > my) == sy] for sx in (0, 1) for sy in (0, 1)] if NP == 4 else [[p for p in low if (p.x > mx) == sx] for sx in (0, 1)]
    cents = [cen(g) for g in g0 if g]
    if len(cents) == NP:
        for _ in range(12):
            gs = [[] for _ in cents]
            for p in low: gs[min(range(NP), key=lambda i: (p.x - cents[i].x) ** 2 + (p.y - cents[i].y) ** 2)].append(p)
            cents = [cen(g) or cents[i] for i, g in enumerate(gs)]
        feet = [Vector((c.x, c.y, zmin)) for c in cents]
    print("PIES", [(round(f.x, 2), round(f.y, 2)) for f in feet])
HIP = float(opt("cadera", ".34" if NP == 4 else ".30"))
hz = zmin + HIP * H
body = [p for p in pts if p.z > hz] or pts
bc = cen(body)                                  # centro del cuerpo (sin patas)
# ---- tronco, cuello, cabeza y cola ----
if TIPO == "cuadrupedo":
    front = [p for p in body if p.y < lerp(ymin, ymax, .22)]   # lo más adelantado: la cabeza
    hc = cen(front) or Vector((cx, ymin, zmax))
    hips = Vector((cx, lerp(bc.y, ymax, .45), lerp(hz, bc.z, .6)))
    chest = Vector((cx, lerp(bc.y, ymin, .45), lerp(hz, bc.z, .7)))
    neck = Vector((cx, lerp(chest.y, hc.y, .45), lerp(chest.z, hc.z, .55)))
    head = Vector((cx, hc.y + .05 * H, hc.z)); top = Vector((cx, hc.y - .04 * H, max(p.z for p in front) if front else zmax))
else:
    NZ = float(opt("cuello", ".62")); nz = zmin + NZ * H
    hips = Vector((cx, bc.y, lerp(hz, nz, .1))); chest = Vector((cx, bc.y, lerp(hz, nz, .65)))
    neck = Vector((cx, bc.y, nz)); headp = [p for p in pts if p.z > nz]
    hc = cen(headp) or Vector((cx, cy, zmax)); head = Vector((cx, hc.y, lerp(nz, zmax, .25))); top = Vector((cx, hc.y, zmax))
tail = []
if opt("cola", "1") != "0":
    back = [p for p in pts if p.y > lerp(ymin, ymax, .82) and p.z > zmin + .12 * H and abs(p.x - cx) < .25 * (xmax - xmin)]
    if back and max(p.y for p in back) > hips.y + .12 * H:
        tip = max(back, key=lambda p: p.y)
        root = Vector((cx, lerp(hips.y, ymax, .25), hips.z))
        tail = [root.lerp(tip, i / 3) for i in range(4)]
# ---- brazos (bípedos y flotantes): lo que sobresale a los lados a la altura de los hombros ----
arms = {}
if TIPO != "cuadrupedo" and opt("brazos", "1") != "0":
    az = float(opt("brazoz", ".55")); bandp = band(az - .2, az + .2)
    half = .5 * (sorted(abs(p.x - cx) for p in band(.35, .7))[int(.6 * len(band(.35, .7)))] if band(.35, .7) else (xmax - xmin) * .3)
    for s, sgn_ in (("L", 1), ("R", -1)):
        side = [p for p in bandp if (p.x - cx) * sgn_ > half * 1.1]
        if len(side) > 10:
            hand = max(side, key=lambda p: (p.x - cx) * sgn_)
            sh = Vector((cx + sgn_ * half * .8, lerp(bc.y, hand.y, .3), lerp(zmin + az * H, hand.z, .3)))
            arms[s] = (sh, sh.lerp(hand, .5), hand)
print("BRAZOS", list(arms), "COLA", len(tail) > 0)

# ---- armadura ----
ad = bpy.data.armatures.new("Esqueleto"); rig = bpy.data.objects.new("Esqueleto", ad); sc.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig; rig.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
E = ad.edit_bones
def bone(n, a, b, parent=None, conn=False):
    e = E.new(n); e.head = a; e.tail = b if (b - a).length > 1e-4 else a + Vector((0, 0, .02 * H)); e.parent = E[parent] if parent else None; e.use_connect = conn; return e
bone("Hips", hips, chest if TIPO == "cuadrupedo" else hips.lerp(chest, .5))
bone("Spine1", hips.lerp(chest, .5) if TIPO != "cuadrupedo" else chest, chest if TIPO != "cuadrupedo" else chest.lerp(neck, .5), "Hips")
bone("Spine2", E["Spine1"].tail.copy(), neck, "Spine1", True)
bone("Neck", neck, head, "Spine2", True)
bone("Head", head, top, "Neck", True)
for i in range(len(tail) - 1): bone(f"Tail{i + 1}", tail[i], tail[i + 1], "Hips" if i == 0 else f"Tail{i}", i > 0)
for i, f in enumerate(feet):
    s = "L" if f.x > cx else "R"; frontleg = TIPO == "cuadrupedo" and f.y < sum(g.y for g in feet) / len(feet)
    hip = Vector((f.x * .85 + cx * .15, f.y, hz)); knee = Vector((f.x, f.y - .03 * H, lerp(zmin, hz, .5))); ank = Vector((f.x, f.y, zmin + .06 * H)); toe = Vector((f.x, f.y - .08 * H, zmin))
    if frontleg: names, par = ("Shoulder", "Arm", "ForeArm", "Hand"), "Spine2"
    else: names, par = ("Thigh", "Leg", "Foot", "Toe"), "Hips"
    if frontleg:
        bone(s + "Shoulder", Vector((f.x * .5 + cx * .5, f.y, lerp(hz, chest.z, .5))), hip, par)
        bone(s + "Arm", hip, knee, s + "Shoulder", True); bone(s + "ForeArm", knee, ank, s + "Arm", True); bone(s + "Hand", ank, toe, s + "ForeArm", True)
    else:
        bone(s + "Thigh", hip, knee, par); bone(s + "Leg", knee, ank, s + "Thigh", True); bone(s + "Foot", ank, toe, s + "Leg", True)
for s, (sh, el, hd) in arms.items():
    bone(s + "Arm", sh, el, "Spine2"); bone(s + "ForeArm", el, hd, s + "Arm", True); bone(s + "Hand", hd, hd + (hd - el).normalized() * .05 * H, s + "ForeArm", True)
bpy.ops.object.mode_set(mode='OBJECT')
print("HUESOS", len(ad.bones), [b.name for b in ad.bones])

# ---- pesos: automáticos y, si falla, el hueso más cercano ----
bpy.ops.object.select_all(action='DESELECT')
for m in meshes: m.select_set(True)
rig.select_set(True); bpy.context.view_layer.objects.active = rig
try: bpy.ops.object.parent_set(type='ARMATURE_AUTO')
except Exception as e: print("pesos automáticos fallaron:", e); bpy.ops.object.parent_set(type='ARMATURE_NAME')
segs = [(b.name, b.head_local.copy(), b.tail_local.copy()) for b in ad.bones]
def dseg(p, a, b):
    ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.dot(ab)))); return (a + ab * t - p).length
def blend(m, v):
    """Pesos por cercanía mezclados entre los huesos más próximos (1/d⁴): la malla se dobla con suavidad en las articulaciones."""
    ds = [(dseg(v.co, a, b), n) for n, a, b in segs]; dmin = min(d for d, _ in ds)
    near = [(d, n) for d, n in ds if d <= dmin * 1.6 + .015 * H]
    ws = [(1 / (d + .01 * H)) ** 4 for d, _ in near]; t = sum(ws)
    for (d, n), w in zip(near, ws):
        vg = m.vertex_groups.get(n) or m.vertex_groups.new(name=n); vg.add([v.index], w / t, 'REPLACE')
miss = 0
for m in meshes:
    if not any(md.type == 'ARMATURE' for md in m.modifiers): md = m.modifiers.new("Esqueleto", 'ARMATURE'); md.object = rig
    groups = {g.index: g.name for g in m.vertex_groups}
    miss += sum(1 for v in m.data.vertices if sum(g.weight for g in v.groups if g.group in groups and groups[g.group] in ad.bones) < .05)
ALL_BLEND = miss > .25 * len(pts)   # si los pesos automáticos fallaron en buena parte de la malla, se rehacen todos por cercanía
for m in meshes:
    groups = {g.index: g.name for g in m.vertex_groups}
    if ALL_BLEND:
        for g in list(m.vertex_groups):
            if g.name in ad.bones: m.vertex_groups.remove(g)
    for v in m.data.vertices:
        if ALL_BLEND or sum(g.weight for g in v.groups if g.group in groups and groups[g.group] in ad.bones) < .05: blend(m, v)
print("PESOS", "por cercanía en toda la malla" if ALL_BLEND else "automáticos", "· sin asignar:", miss, "de", len(pts))

if opt("vista", ""):
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x = 360; sc.render.resolution_y = 360; sc.display.shading.color_type = 'TEXTURE'
    rig.show_in_front = True; ad.display_type = 'STICK'
    cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera = cam; cam.data.type = 'ORTHO'; cam.data.ortho_scale = max(H, ymax - ymin, xmax - xmin) * 1.15
    c = Vector((cx, cy, zmin + H / 2))
    for nm, d in (("lado", Vector((1, 0, 0))), ("frente", Vector((0, -1, 0)))):
        cam.location = c + d * 50; cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = opt("vista", "") + "_" + nm + ".png"
        # los huesos no salen en el render de Workbench: se dibujan como cilindros finos temporales
        tmp = []
        for b in ad.bones:
            L = (b.tail_local - b.head_local).length; mid = (b.head_local + b.tail_local) / 2
            bpy.ops.mesh.primitive_cylinder_add(radius=.012 * H, depth=L, location=mid); o = bpy.context.object
            o.rotation_euler = (b.tail_local - b.head_local).to_track_quat('Z', 'Y').to_euler(); o.show_in_front = True
            mat = bpy.data.materials.get("hueso") or bpy.data.materials.new("hueso"); mat.diffuse_color = (1, .2, .1, 1); o.data.materials.append(mat); tmp.append(o)
        sc.display.shading.color_type = 'MATERIAL'; bpy.ops.render.render(write_still=True); sc.display.shading.color_type = 'TEXTURE'
        for o in tmp: bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_animations=False, export_skins=True,
                          export_image_format='WEBP', export_yup=True, export_apply=False)
print("EXPORTADO", OUT)
