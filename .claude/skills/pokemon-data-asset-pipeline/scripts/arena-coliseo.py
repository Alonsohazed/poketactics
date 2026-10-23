# Escenario del tablero «coliseo»: suelo de baldosas blancas con las líneas y el emblema de Poké Ball, piedras negras con brillo morado
# detrás y a la derecha, una repisa con 5 rombos a la izquierda (cristales de intereses), la banca de 9 losas delante (sin piedras levantadas)
# y un borde de piedra oscura alrededor; fuera, oscuridad (sin gradas ni lámpara).
# Misma cámara que el tablero del juego (fitCamera de board3d.js en 1920×1080: elevación 40°, distancia 28,5, mira a z=0,5, fov vertical 30°),
# con el encuadre ampliado MARGEN veces para cubrir la pantalla; las coordenadas son las del mundo 3D del juego (1 = radio de una casilla).
# Uso: blender -b --python arena-coliseo.py -- <salida.png> [ancho=2880] [alto=1620] [muestras=64]
# Deja <salida>.json con los píxeles que necesita FLAT_IMG (esquinas del fondo del campo, centros de las 9 losas y de los 5 rombos).
import bpy, sys, math, json, random
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '//arena.png'
WR = int(argv[1]) if len(argv) > 1 else 2880
HR = int(argv[2]) if len(argv) > 2 else 1620
SAMPLES = int(argv[3]) if len(argv) > 3 else 64
EL, DIST, TZ, MARGEN = 40.0, 28.5, .5, 1.3
# geometría del juego (medida con B3.project/flatInfo): campo, banca, trofeo y cristales
FX0, FX1, FZ0, FZ1 = -6.995, 6.995, -7.285, 5.374
BENCH_Z, BENCH_X, BENCH_DX, TOP = 6.4545, -5.7735, 1.4434, .2
HOLES = [(-7.343, -4.915), (-7.342, -3.277), (-7.319, -1.599), (-7.312, -.117), (-7.292, 1.36)]
MID_Z = -.93  # línea entre las filas 3 y 4 (mitad del campo)
rnd = random.Random(11)
W = lambda x, y, z: (x, -z, y)  # mundo del juego (y arriba, z hacia la cámara) → Blender (z arriba)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
hexc = lambda h: tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
lin = lambda c: tuple(v ** 2.2 for v in c)
def mat(name, col, rough=.7, emit=None, estr=0.0, alpha=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*lin(hexc(col)), 1); b.inputs['Roughness'].default_value = rough
    if emit: b.inputs['Emission Color'].default_value = (*lin(hexc(emit)), 1); b.inputs['Emission Strength'].default_value = estr
    return m

def box(name, x0, x1, z0, z1, y0, y1, m, bevel=0.0):
    cx, cz, cy = (x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2
    bpy.ops.mesh.primitive_cube_add(size=1, location=W(cx, cy, cz)); o = bpy.context.object; o.name = name
    o.scale = (x1 - x0, z1 - z0, y1 - y0); bpy.ops.object.transform_apply(scale=True); o.data.materials.append(m)
    if bevel: bv = o.modifiers.new('bisel', 'BEVEL'); bv.width = bevel; bv.segments = 3
    return o

# ---------- suelo de baldosas ----------
mf = bpy.data.materials.new('baldosas'); mf.use_nodes = True; nt = mf.node_tree; bs = nt.nodes['Principled BSDF']
br = nt.nodes.new('ShaderNodeTexBrick'); tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
mp.inputs['Scale'].default_value = (.8, .8, 1)  # ladrillos de ~0,62 × 0,31
br.inputs['Color1'].default_value = (*lin(hexc('#e9e9ee')), 1); br.inputs['Color2'].default_value = (*lin(hexc('#d6d7de')), 1)
br.inputs['Mortar'].default_value = (*lin(hexc('#8a8b96')), 1); br.inputs['Mortar Size'].default_value = .035; br.inputs['Scale'].default_value = 1
nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 6; mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = .12
nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], br.inputs['Vector']); nt.links.new(br.outputs['Color'], mix.inputs[6]); nt.links.new(nz.outputs['Color'], mix.inputs[7])
nt.links.new(mix.outputs[2], bs.inputs['Base Color']); bs.inputs['Roughness'].default_value = .55
bpy.ops.mesh.primitive_plane_add(size=1, location=W(0, 0, (FZ0 + 5.75) / 2)); fl = bpy.context.object; fl.name = 'suelo'
fl.scale = (FX1 - FX0 + .6, 5.75 - FZ0 + .3, 1); bpy.ops.object.transform_apply(scale=True); fl.data.materials.append(mf)

# líneas oscuras: cruz y emblema de Poké Ball en el centro
M_LINE = mat('linea', '#3b3c44', .6)
box('linea_h', FX0 - .3, FX1 + .3, MID_Z - .07, MID_Z + .07, 0, .012, M_LINE)
box('linea_v', -.07, .07, FZ0 - .2, 5.6, 0, .012, M_LINE)
def ring(name, r0, r1, m, y=.014):
    bpy.ops.mesh.primitive_circle_add(vertices=128, radius=r1, fill_type='NGON', location=W(0, y, MID_Z)); o = bpy.context.object; o.name = name; o.data.materials.append(m)
    if r0 > 0:
        bpy.ops.mesh.primitive_circle_add(vertices=128, radius=r0, fill_type='NGON', location=W(0, y + .001, MID_Z)); h = bpy.context.object
        bo = o.modifiers.new('hueco', 'BOOLEAN'); h.scale.z = 1; bpy.ops.object.select_all(action='DESELECT')
        # el hueco se hace con un cilindro fino (las booleanas necesitan volumen)
        bpy.data.objects.remove(h); bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=r0, depth=.2, location=W(0, y, MID_Z)); h = bpy.context.object; h.hide_render = True; h.hide_viewport = True; bo.operation = 'DIFFERENCE'; bo.object = h
    return o
M_FLOOR_C = mat('suelo_centro', '#e4e4ea', .55)
ring('aro_grande', 2.0, 2.16, M_LINE); ring('fondo_aro', 0, 2.0, M_FLOOR_C, .013)
ring('aro_medio', .95, 1.1, M_LINE, .016); ring('aro_chico', 0, .45, M_LINE, .017); ring('punto', 0, .3, M_FLOOR_C, .018)

# ---------- piedras negras con brillo morado (detrás y a la derecha; a la izquierda, por fuera de la repisa) ----------
M_ROCK = mat('roca', '#0e0d12', .8)
M_GLOW = bpy.data.materials.new('brillo'); M_GLOW.use_nodes = True; g = M_GLOW.node_tree; gb = g.nodes['Principled BSDF']
gb.inputs['Base Color'].default_value = (0, 0, 0, 1); gb.inputs['Emission Color'].default_value = (*lin(hexc('#9b4dff')), 1); gb.inputs['Emission Strength'].default_value = 5.5
gr = g.nodes.new('ShaderNodeTexGradient'); gc = g.nodes.new('ShaderNodeTexCoord'); ramp = g.nodes.new('ShaderNodeValToRGB'); sep = g.nodes.new('ShaderNodeSeparateXYZ'); nz2 = g.nodes.new('ShaderNodeTexNoise'); nz2.inputs['Scale'].default_value = 9; mul = g.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
ramp.color_ramp.elements[0].position = 0; ramp.color_ramp.elements[0].color = (1, 1, 1, 1); ramp.color_ramp.elements[1].position = .85; ramp.color_ramp.elements[1].color = (0, 0, 0, 1)
g.links.new(gc.outputs['Generated'], sep.inputs[0]); g.links.new(sep.outputs['Y'], ramp.inputs['Fac']); g.links.new(ramp.outputs['Color'], mul.inputs[0]); g.links.new(nz2.outputs['Fac'], mul.inputs[1]); g.links.new(mul.outputs[0], gb.inputs['Alpha'])
def rock(x, z, s, h):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=W(x, h * .45, z)); o = bpy.context.object
    for v in o.data.vertices: v.co *= 1 + rnd.uniform(-.3, .3); v.co.z = max(v.co.z, -.55)
    o.data.polygons.foreach_set('use_smooth', [False] * len(o.data.polygons))
    o.scale = (s * rnd.uniform(.85, 1.15), s * rnd.uniform(.7, 1.0), h); o.rotation_euler = (rnd.uniform(-.12, .12), rnd.uniform(-.12, .12), rnd.uniform(0, math.tau))
    o.data.materials.append(M_ROCK); return o
def flame(x0, z0, x1, z1, h=.55):
    # cortina de brillo morado en la base de las piedras (plano vertical con transparencia que se desvanece hacia arriba)
    L = math.hypot(x1 - x0, z1 - z0); bpy.ops.mesh.primitive_plane_add(size=1, location=W((x0 + x1) / 2, h / 2, (z0 + z1) / 2)); o = bpy.context.object
    o.scale = (L, h, 1); o.rotation_euler = (math.pi / 2, 0, -math.atan2(z1 - z0, x1 - x0)); o.data.materials.append(M_GLOW); return o
def wall(x0, z0, x1, z1, n, inner):
    for i in range(n):
        t = (i + rnd.uniform(.15, .85)) / n; x = x0 + (x1 - x0) * t; z = z0 + (z1 - z0) * t
        rock(x, z, rnd.uniform(.55, .8), rnd.uniform(.6, 1.05))
    # brillo por dentro (hacia el campo) y una luz morada cada 2,5 casillas
    flame(x0 + inner[0], z0 + inner[1], x1 + inner[0], z1 + inner[1])
    flame(x0 - inner[0] * 1.1, z0 - inner[1] * 1.1, x1 - inner[0] * 1.1, z1 - inner[1] * 1.1, .4)  # también por fuera, más bajo
    L = math.hypot(x1 - x0, z1 - z0)
    for i in range(max(1, int(L / 2.5))):
        t = (i + .5) / max(1, int(L / 2.5)); bpy.ops.object.light_add(type='POINT', location=W(x0 + (x1 - x0) * t + inner[0] * 1.6, .35, z0 + (z1 - z0) * t + inner[1] * 1.6))
        lt = bpy.context.object; lt.data.color = lin(hexc('#a35bff')); lt.data.energy = 35; lt.data.shadow_soft_size = .6
RB = FZ0 - .75; RR = FX1 + .75; RL = -8.55
wall(FX0 - .4, RB, FX1 + .4, RB, 30, (0, .62))                 # detrás
wall(RR, RB + .4, RR, 5.2, 24, (-.62, 0))                         # derecha
wall(RL, RB + .4, RL, 3.4, 19, (.55, 0))                           # izquierda, por fuera de la repisa de los rombos

# ---------- repisa izquierda con los 5 rombos (cristales de intereses) ----------
M_LEDGE = mat('repisa', '#26252e', .8); M_SOCK = mat('rombo', '#0d0c12', .6); M_SOCKR = mat('rombo_borde', '#2f2d3a', .5, '#8a45ff', .5)
box('repisa', -8.05, FX0 - .02, RB + .55, 3.0, -.05, .04, M_LEDGE, .04)
for (hx, hz) in HOLES:
    for (r, m, y) in ((.62, M_SOCKR, .045), (.5, M_SOCK, .05)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=4, radius=r, depth=.02, location=W(hx, y, hz)); o = bpy.context.object; o.data.materials.append(m)
        o.scale = (.8, 1, 1)  # rombo un poco más alto que ancho (en perspectiva queda como el del modelo)

# ---------- banca (9 losas) sobre una base de piedra negra; sin piedras levantadas delante ----------
M_BASE = mat('base_banca', '#1d1c23', .85); M_SLAB = mat('losa', '#3a3846', .75); M_SEAM = mat('junta', '#120f18', .5, '#9b4dff', .9)
box('base_banca', BENCH_X - .95, -BENCH_X + .95, 5.62, 7.3, -.3, .1, M_BASE, .06)
box('junta_banca', BENCH_X - .78, -BENCH_X + .78, 5.78, 7.13, .1, .115, M_SEAM)
for i in range(9):
    x = BENCH_X + BENCH_DX * i; box(f'losa{i}', x - .66, x + .66, BENCH_Z - .6, BENCH_Z + .6, .1, TOP, M_SLAB, .05)

# ---------- borde exterior de piedra oscura (el «segundo círculo»), y nada más allá ----------
M_RIM = mat('borde', '#1f1e25', .9)
box('borde_atras', -10.4, 10.4, RB - 1.9, RB - .55, -.35, .0, M_RIM, .08)
box('borde_der', RR + .55, RR + 1.9, RB - 1.9, 7.6, -.35, .0, M_RIM, .08)
box('borde_izq', RL - 1.9, RL - .55, RB - 1.9, 7.6, -.35, .0, M_RIM, .08)
box('suelo_piedras', -10.4, 10.4, RB - 1.9, 7.6, -.42, -.36, mat('fondo_piedras', '#0e0d12', .95))

# ---------- luz: sin lámpara visible; luz suave de arriba y algo de ambiente frío ----------
wd = bpy.data.worlds.new('mundo'); sc.world = wd; wd.use_nodes = True; bgn = wd.node_tree.nodes['Background']; bgn.inputs['Color'].default_value = (*lin(hexc('#0a0a10')), 1); bgn.inputs['Strength'].default_value = .5
bpy.ops.object.light_add(type='AREA', location=W(0, 16, -1)); ar = bpy.context.object; ar.data.energy = 3800; ar.data.size = 18; ar.data.color = lin(hexc('#f2f0ff'))
bpy.ops.object.light_add(type='SUN', rotation=(math.radians(35), math.radians(-25), math.radians(-35))); sn = bpy.context.object; sn.data.energy = 1.3; sn.data.angle = math.radians(20)

# ---------- cámara del juego, con el encuadre ampliado ----------
e = math.radians(EL)
bpy.ops.object.camera_add(location=W(0, math.sin(e) * DIST, TZ + math.cos(e) * DIST)); cam = bpy.context.object; sc.camera = cam
cam.rotation_euler = (math.pi / 2 - e, 0, 0); cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = 2 * math.atan(MARGEN * math.tan(math.radians(15)))
sc.render.resolution_x, sc.render.resolution_y = WR, HR
sc.render.engine = 'CYCLES'; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
sc.view_settings.view_transform = 'Standard'; sc.render.image_settings.file_format = 'PNG'; sc.render.filepath = OUT
bpy.context.view_layer.update()
px = lambda x, y, z: (lambda v: [round(v.x * WR, 1), round((1 - v.y) * HR, 1)])(world_to_camera_view(sc, cam, Vector(W(x, y, z))))
out = {'w': WR, 'h': HR, 'back': [px(FX0, 0, FZ0), px(FX1, 0, FZ0)], 'bench': [px(BENCH_X + BENCH_DX * i, TOP, BENCH_Z) for i in range(9)], 'holes': [px(x, 0, z) for x, z in HOLES]}
json.dump(out, open(bpy.path.abspath(OUT).rsplit('.', 1)[0] + '.json', 'w'))
bpy.ops.render.render(write_still=True); print('PUNTOS', json.dumps(out))
