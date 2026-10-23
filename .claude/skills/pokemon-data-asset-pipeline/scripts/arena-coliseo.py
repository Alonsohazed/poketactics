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
MIR = lambda x, z: (-x, 2 * MID_Z - z)  # reflejo respecto al centro del campo: el lado del rival
HOLES2 = [MIR(x, z) for x, z in HOLES]
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
    if bevel: bv = o.modifiers.new('bisel', 'BEVEL'); bv.width = bevel; bv.segments = 5; bv.limit_method = 'NONE'; bpy.ops.object.shade_smooth()
    return o

# ---------- suelo: piedra clara con losas irregulares de bordes suaves (como el escenario de capas), sin líneas ni dibujos ----------
mf = bpy.data.materials.new('suelo'); mf.use_nodes = True; nt = mf.node_tree; bs = nt.nodes['Principled BSDF']; N = nt.nodes.new; L = nt.links.new
tc = N('ShaderNodeTexCoord')
ve = N('ShaderNodeTexVoronoi'); ve.feature = 'DISTANCE_TO_EDGE'; ve.inputs['Scale'].default_value = .42; ve.inputs['Randomness'].default_value = .9
vc = N('ShaderNodeTexVoronoi'); vc.inputs['Scale'].default_value = .42; vc.inputs['Randomness'].default_value = .9
nz = N('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = .9; nz.inputs['Detail'].default_value = 6
nf = N('ShaderNodeTexNoise'); nf.inputs['Scale'].default_value = 7; nf.inputs['Detail'].default_value = 3
for n in (ve, vc, nz, nf): L(tc.outputs['Object'], n.inputs['Vector'])
edge = N('ShaderNodeMapRange'); edge.inputs['From Min'].default_value = 0; edge.inputs['From Max'].default_value = .22; L(ve.outputs['Distance'], edge.inputs['Value'])  # 0 en la junta → 1 dentro de la losa
cell = N('ShaderNodeSeparateColor'); L(vc.outputs['Color'], cell.inputs['Color'])
tone = N('ShaderNodeMapRange'); tone.inputs['To Min'].default_value = .9; tone.inputs['To Max'].default_value = 1.05; L(cell.outputs['Red'], tone.inputs['Value'])
ramp = N('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (*lin(hexc('#a7a3b8')), 1); ramp.color_ramp.elements[1].color = (*lin(hexc('#dcd9e6')), 1)
mixv = N('ShaderNodeMath'); mixv.operation = 'MULTIPLY'; L(edge.outputs['Result'], mixv.inputs[0]); mixv.inputs[1].default_value = .55
add = N('ShaderNodeMath'); add.operation = 'ADD'; L(mixv.outputs[0], add.inputs[0]); L(nz.outputs['Fac'], add.inputs[1])
sc2 = N('ShaderNodeMath'); sc2.operation = 'MULTIPLY'; L(add.outputs[0], sc2.inputs[0]); sc2.inputs[1].default_value = .78; L(sc2.outputs[0], ramp.inputs['Fac'])
mul = N('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1; L(ramp.outputs['Color'], mul.inputs[6])
tcol = N('ShaderNodeCombineColor')
for k in ('Red', 'Green', 'Blue'): L(tone.outputs['Result'], tcol.inputs[k])
L(tcol.outputs['Color'], mul.inputs[7])
fine = N('ShaderNodeMix'); fine.data_type = 'RGBA'; fine.blend_type = 'OVERLAY'; fine.inputs['Factor'].default_value = .12; L(mul.outputs[2], fine.inputs[6]); L(nf.outputs['Color'], fine.inputs[7])
L(fine.outputs[2], bs.inputs['Base Color']); bs.inputs['Roughness'].default_value = .7
bump = N('ShaderNodeBump'); bump.inputs['Strength'].default_value = .35; bump.inputs['Distance'].default_value = .015; L(edge.outputs['Result'], bump.inputs['Height']); L(bump.outputs['Normal'], bs.inputs['Normal'])
FB0 = 2 * MID_Z - 5.75  # el suelo llega hasta la banca del rival
bpy.ops.mesh.primitive_plane_add(size=1, location=W(0, 0, (FB0 + 5.75) / 2)); fl = bpy.context.object; fl.name = 'suelo'
fl.scale = (FX1 - FX0 + .6, 5.75 - FB0, 1); bpy.ops.object.transform_apply(scale=True); fl.data.materials.append(mf)
# sombra suave junto a los bordes del campo (oclusión pintada): un marco negro que se difumina hacia dentro
M_AO = bpy.data.materials.new('oclusion'); M_AO.use_nodes = True; an = M_AO.node_tree; ab = an.nodes['Principled BSDF']; ab.inputs['Base Color'].default_value = (0, 0, 0, 1)
ag = an.nodes.new('ShaderNodeTexCoord'); asep = an.nodes.new('ShaderNodeSeparateXYZ'); an.links.new(ag.outputs['Generated'], asep.inputs[0])
def dist_edge(c):  # 0 en el borde → 0,5 en el centro
    m1 = an.nodes.new('ShaderNodeMath'); m1.operation = 'MINIMUM'; an.links.new(c, m1.inputs[0])
    m2 = an.nodes.new('ShaderNodeMath'); m2.operation = 'SUBTRACT'; m2.inputs[0].default_value = 1; an.links.new(c, m2.inputs[1]); an.links.new(m2.outputs[0], m1.inputs[1]); return m1
mx = dist_edge(asep.outputs['X']); my = dist_edge(asep.outputs['Y']); mm = an.nodes.new('ShaderNodeMath'); mm.operation = 'MINIMUM'; an.links.new(mx.outputs[0], mm.inputs[0]); an.links.new(my.outputs[0], mm.inputs[1])
ar2 = an.nodes.new('ShaderNodeMapRange'); ar2.inputs['From Max'].default_value = .09; ar2.inputs['To Min'].default_value = .55; ar2.inputs['To Max'].default_value = 0
an.links.new(mm.outputs[0], ar2.inputs['Value']); an.links.new(ar2.outputs['Result'], ab.inputs['Alpha'])
bpy.ops.mesh.primitive_plane_add(size=1, location=W(0, .004, (FB0 + 5.75) / 2)); ao = bpy.context.object; ao.scale = (FX1 - FX0 + .6, 5.75 - FB0, 1); bpy.ops.object.transform_apply(scale=True); ao.data.materials.append(M_AO)
# piedrecitas sueltas junto a los bordes, para que el campo no se vea vacío (lejos de los rombos y del centro)
M_PEB = mat('piedrecita', '#4a4656', .8)
for k in range(26):
    side = k % 3; t = rnd.random()
    if side == 0: x, z = FX0 + (FX1 - FX0) * t, FZ0 + rnd.uniform(.15, .5)
    elif side == 1: x, z = FX1 - rnd.uniform(.15, .5), FZ0 + (5.0 - FZ0) * t
    else: x, z = FX0 + rnd.uniform(.25, .6), FZ0 + (2.6 - FZ0) * t
    r = rnd.uniform(.05, .12); bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r, location=W(x, r * .35, z)); p = bpy.context.object
    p.scale = (1, rnd.uniform(.7, 1), .55); p.data.materials.append(M_PEB); bpy.ops.object.shade_smooth()

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
    o.data.polygons.foreach_set('use_smooth', [False] * len(o.data.polygons))  # toscas: facetas planas
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
wall(RL, FZ0 - .3, RL, 3.4, 22, (.55, 0))                                   # izquierda, por fuera de mi repisa
wall(-RL, MIR(0, 3.4)[1], -RL, MIR(0, FZ0 - .3)[1], 22, (-.55, 0))          # derecha, por fuera de la repisa del rival (su reflejo)

# ---------- repisa izquierda con los 5 rombos (cristales de intereses) ----------
M_LEDGE = mat('repisa', '#26252e', .8); M_SOCK = mat('rombo', '#0d0c12', .6); M_SOCKR = mat('rombo_borde', '#2f2d3a', .5, '#8a45ff', .5)
def ledge(sign, holes):
    z0, z1 = (RB + .55, 3.0) if sign < 0 else (MIR(0, 3.0)[1], MIR(0, RB + .55)[1])
    box('repisa', min(sign * 8.05, sign * (FX1 + .02)), max(sign * 8.05, sign * (FX1 + .02)), z0, z1, -.05, .04, M_LEDGE, .035)
    for (hx, hz) in holes:
        for (r, m, y) in ((.62, M_SOCKR, .045), (.5, M_SOCK, .05)):
            bpy.ops.mesh.primitive_cylinder_add(vertices=4, radius=r, depth=.02, location=W(hx, y, hz)); o = bpy.context.object; o.data.materials.append(m)
            bv = o.modifiers.new('bisel', 'BEVEL'); bv.width = .06; bv.segments = 4; bv.affect = 'VERTICES'  # rombos con las puntas redondeadas
            o.scale = (.8, 1, 1)  # rombo un poco más alto que ancho (en perspectiva queda como el del modelo)
ledge(-1, HOLES); ledge(1, HOLES2)

# ---------- banca (9 losas) sobre una base de piedra negra; sin piedras levantadas delante ----------
M_BASE = mat('base_banca', '#1d1c23', .85); M_SLAB = mat('losa', '#3a3846', .75); M_SEAM = mat('junta', '#120f18', .5, '#9b4dff', .9)
for (bz, z0, z1, z2, z3) in ((BENCH_Z, 5.62, 7.3, 5.78, 7.13), (MIR(0, BENCH_Z)[1], MIR(0, 7.3)[1], MIR(0, 5.62)[1], MIR(0, 7.13)[1], MIR(0, 5.78)[1])):
    box('base_banca', BENCH_X - .95, -BENCH_X + .95, z0, z1, -.3, .1, M_BASE, .12)
    box('junta_banca', BENCH_X - .78, -BENCH_X + .78, z2, z3, .1, .115, M_SEAM)
    for i in range(9):
        x = BENCH_X + BENCH_DX * i; box(f'losa{i}', x - .66, x + .66, bz - .6, bz + .6, .1, TOP, M_SLAB, .045)

# ---------- isla flotante: borde de piedra oscura redondeado y, debajo, la roca que cuelga ----------
M_RIM = mat('borde', '#1f1e26', .85)
box('borde', -9.7, 9.7, MIR(0, 7.55)[1], 7.55, -.6, -.03, M_RIM, .5)  # justo por debajo del suelo (si coinciden, el borde lo tapa)
M_ISLA = mat('isla', '#1c1924', .9)
# contorno azulado según el ángulo (Fresnel): la roca de debajo se lee contra el espacio
in_ = M_ISLA.node_tree; ib = in_.nodes['Principled BSDF']; lw = in_.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = .18; ir = in_.nodes.new('ShaderNodeMath'); ir.operation = 'MULTIPLY'; ir.inputs[1].default_value = .5
in_.links.new(lw.outputs['Facing'], ir.inputs[0]); ib.inputs['Emission Color'].default_value = (*lin(hexc('#5b8cff')), 1); in_.links.new(ir.outputs[0], ib.inputs['Emission Strength'])
# roca que cuelga bajo la arena: esfera achatada con el centro bajo, cortada arriba (queda escondida bajo el borde) y más ancha por debajo, con relieve
from mathutils import noise
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5, radius=1, location=W(0, -4.6, MID_Z)); isla = bpy.context.object; isla.name = 'isla'
for v in isla.data.vertices:
    c = v.co
    if c.z > .61: c.z = .61
    else:
        n = noise.noise(Vector((c.x * 2.3, c.y * 2.3, c.z * 2.3))) + .5 * noise.noise(Vector((c.x * 6, c.y * 6, c.z * 6)))
        c.x *= 1 + .16 * n; c.y *= 1 + .16 * n; c.z *= 1 + .35 * noise.noise(Vector((c.x * 4, c.y * 4, 1.7)))
isla.scale = (11.2, 9.9, 6.5); bpy.ops.object.transform_apply(scale=True); isla.data.materials.append(M_ISLA); bpy.ops.object.shade_smooth()
# rocas flotando alrededor y por debajo, a varias distancias (profundidad), lisas y oscuras; el contraluz azul les recorta el borde
M_FL = mat('roca_flotante', '#1b1922', .85)
for k in range(22):
    ang = rnd.uniform(0, math.tau); d = rnd.uniform(13, 30); x = math.cos(ang) * d * 1.25; z = math.sin(ang) * d * .9 - 2; y = rnd.uniform(-14, -2)
    if z > 9 and y > -6: continue  # delante y arriba taparía la banca
    r = rnd.uniform(.5, 2.4) * (1 + (d - 13) / 30); bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=r, location=W(x, y, z)); o = bpy.context.object
    for v in o.data.vertices: v.co *= 1 + rnd.uniform(-.18, .18)
    o.scale = (1, rnd.uniform(.7, 1.1), rnd.uniform(.6, .9)); o.rotation_euler = (rnd.uniform(0, 3), rnd.uniform(0, 3), rnd.uniform(0, 3)); o.data.materials.append(M_FL); bpy.ops.object.shade_smooth()

# ---------- pedestales con el trofeo modelado encima (ya no es una imagen aparte): el mío a la izquierda y el del rival, reflejado, a la derecha ----------
# Mismo diseño que img/trofeo.webp: base octogonal azul marino con ribete dorado, escalón turquesa, tallo azul, anillo dorado,
# esfera morada con la estrella dorada, una luna, un cristal rosa arriba, un aro dorado inclinado y dos alas lavanda
TX, TZT, TH = -6.063, -1.426, .22
M_PED = mat('pedestal', '#2a2833', .7); M_PEDT = mat('pedestal_cara', '#3a3747', .6); M_PEDG = mat('pedestal_brillo', '#120f18', .5, '#9b4dff', 2.5)
M_NAVY = mat('trofeo_base', '#2b2f6e', .55); M_TEAL = mat('trofeo_turquesa', '#3aa59e', .5); M_GOLD = mat('trofeo_oro', '#d9b25a', .3); M_GOLD.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = .8
M_STEM = mat('trofeo_tallo', '#3c5aa6', .45); M_ORB = mat('trofeo_esfera', '#6b2fb2', .35, '#4a1a8c', .4); M_MOON = mat('trofeo_luna', '#efe6c8', .6)
M_GEM = mat('trofeo_gema', '#f4a6c0', .25, '#ff9cc4', .6); M_WING = mat('trofeo_ala', '#b9a6e6', .4); M_WING.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = .82
def cyl(r0, r1, y0, y1, m, cx, cz, n=8, rot=math.pi / 8, bev=.02):
    bpy.ops.mesh.primitive_cone_add(vertices=n, radius1=r0, radius2=r1, depth=y1 - y0, location=W(cx, (y0 + y1) / 2, cz)); o = bpy.context.object; o.rotation_euler.z = rot; o.data.materials.append(m)
    if bev: bv = o.modifiers.new('bisel', 'BEVEL'); bv.width = bev; bv.segments = 3
    bpy.ops.object.shade_smooth() if n > 12 else None; return o
def trofeo(cx, cz, face):
    # pedestal de piedra con el aro morado
    for (r, y0, y1, m) in ((.82, 0, .06, M_PEDG), (.78, 0, .12, M_PED), (.66, .12, TH, M_PEDT)):
        cyl(r, r, y0, y1, m, cx, cz, n=64, rot=0, bev=.03)
    y = TH; antes = set(bpy.data.objects)
    cyl(.5, .5, y, y + .2, M_NAVY, cx, cz); cyl(.51, .51, y + .2, y + .225, M_GOLD, cx, cz, bev=0)          # base octogonal y ribete
    cyl(.42, .4, y + .225, y + .34, M_TEAL, cx, cz); cyl(.41, .41, y + .34, y + .355, M_GOLD, cx, cz, bev=0) # escalón turquesa
    cyl(.3, .29, y + .355, y + .45, M_NAVY, cx, cz)
    cyl(.17, .11, y + .45, y + 1.05, M_STEM, cx, cz, n=32, rot=0, bev=0)                                   # tallo
    bpy.ops.mesh.primitive_torus_add(major_radius=.15, minor_radius=.035, location=W(cx, y + 1.06, cz)); o = bpy.context.object; o.data.materials.append(M_GOLD); bpy.ops.object.shade_smooth()
    cyl(.12, .2, y + 1.06, y + 1.2, M_STEM, cx, cz, n=32, rot=0, bev=0)
    oy = y + 1.62; bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=.48, location=W(cx, oy, cz)); o = bpy.context.object; o.data.materials.append(M_ORB); bpy.ops.object.shade_smooth()
    # estrella dorada de 4 puntas en la cara de la esfera que mira a la cámara
    bpy.ops.mesh.primitive_circle_add(vertices=8, radius=.24, fill_type='NGON', location=W(cx, oy + .31, cz + .37)); st = bpy.context.object  # en la cara de la esfera que ve la cámara (elevación 40°)
    for i, v in enumerate(st.data.vertices): v.co *= 1.0 if i % 2 == 0 else .3
    st.rotation_euler = (math.radians(50), 0, 0); st.data.materials.append(M_GOLD); so = st.modifiers.new('grosor', 'SOLIDIFY'); so.thickness = .03
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=.09, location=W(cx + .28 * face, oy + .26, cz + .3)); o = bpy.context.object; o.data.materials.append(M_MOON); bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=.08, radius2=0, depth=.18, location=W(cx, oy + .56, cz)); o = bpy.context.object; o.data.materials.append(M_GEM)
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=.08, radius2=0, depth=.1, location=W(cx, oy + .42, cz)); o = bpy.context.object; o.rotation_euler.x = math.pi; o.data.materials.append(M_GEM)
    bpy.ops.mesh.primitive_torus_add(major_radius=.62, minor_radius=.022, major_segments=96, location=W(cx, oy + .05, cz)); o = bpy.context.object; o.rotation_euler = (math.radians(70), math.radians(18 * face), 0); o.data.materials.append(M_GOLD); bpy.ops.object.shade_smooth()
    for sx in (-1, 1):  # alas: pétalos curvos a los lados de la esfera
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1, location=W(cx + sx * .52, oy + .12, cz - .05)); w = bpy.context.object
        w.scale = (.1, .26, .62); w.rotation_euler = (0, math.radians(-14 * sx), 0); w.data.materials.append(M_WING); bpy.ops.object.shade_smooth()
    # el trofeo, ×1,3 desde el centro de su base (visto desde arriba lo vertical se acorta)
    piv = Vector(W(cx, TH, cz))
    for o in set(bpy.data.objects) - antes: o.location = piv + (o.location - piv) * 1.3; o.scale = o.scale * 1.3
    bpy.ops.object.light_add(type='POINT', location=W(cx, .5, cz + .4)); lt = bpy.context.object; lt.data.color = lin(hexc('#b07bff')); lt.data.energy = 25; lt.data.shadow_soft_size = .5
    bpy.ops.object.light_add(type='POINT', location=W(cx + .3, oy + .6, cz + 1.2)); lt = bpy.context.object; lt.data.color = lin(hexc('#fff2dc')); lt.data.energy = 18; lt.data.shadow_soft_size = .4  # luz de relleno: se ve el trofeo
trofeo(TX, TZT, 1); trofeo(*MIR(TX, TZT), -1)

# ---------- luz: sin lámpara visible; luz suave de arriba y algo de ambiente frío ----------
wd = bpy.data.worlds.new('espacio'); sc.world = wd; wd.use_nodes = True; wn = wd.node_tree; bgn = wn.nodes['Background']; WN = wn.nodes.new; WL = wn.links.new
# espacio: nebulosa azul marino con vetas moradas y turquesa (contrasta con el blanco y morado de la arena) y estrellas
wt = WN('ShaderNodeTexCoord')
neb = WN('ShaderNodeTexNoise'); neb.inputs['Scale'].default_value = 1.6; neb.inputs['Detail'].default_value = 8; neb.inputs['Roughness'].default_value = .62; WL(wt.outputs['Generated'], neb.inputs['Vector'])
neb2 = WN('ShaderNodeTexNoise'); neb2.inputs['Scale'].default_value = 3.2; neb2.inputs['Detail'].default_value = 6; WL(wt.outputs['Generated'], neb2.inputs['Vector'])
nr = WN('ShaderNodeValToRGB'); E = nr.color_ramp.elements; E[0].position = .38; E[0].color = (*lin(hexc('#03050d')), 1); E[1].position = .78; E[1].color = (*lin(hexc('#1d3f7a')), 1)
e2 = nr.color_ramp.elements.new(.6); e2.color = (*lin(hexc('#0d1838')), 1); e3 = nr.color_ramp.elements.new(.7); e3.color = (*lin(hexc('#3a1f6e')), 1)
WL(neb.outputs['Fac'], nr.inputs['Fac'])
nr2 = WN('ShaderNodeValToRGB'); nr2.color_ramp.elements[0].position = .55; nr2.color_ramp.elements[0].color = (0, 0, 0, 1); nr2.color_ramp.elements[1].position = .85; nr2.color_ramp.elements[1].color = (*lin(hexc('#1a7f9a')), 1); WL(neb2.outputs['Fac'], nr2.inputs['Fac'])
addc = WN('ShaderNodeMix'); addc.data_type = 'RGBA'; addc.blend_type = 'ADD'; addc.inputs['Factor'].default_value = .5; WL(nr.outputs['Color'], addc.inputs[6]); WL(nr2.outputs['Color'], addc.inputs[7])
st = WN('ShaderNodeTexVoronoi'); st.inputs['Scale'].default_value = 180; WL(wt.outputs['Generated'], st.inputs['Vector'])
sr = WN('ShaderNodeMapRange'); sr.inputs['From Min'].default_value = 0; sr.inputs['From Max'].default_value = .055; sr.inputs['To Min'].default_value = 1; sr.inputs['To Max'].default_value = 0; WL(st.outputs['Distance'], sr.inputs['Value'])
sp = WN('ShaderNodeMath'); sp.operation = 'POWER'; sp.inputs[1].default_value = 3; WL(sr.outputs['Result'], sp.inputs[0])
sel = WN('ShaderNodeSeparateColor'); WL(st.outputs['Color'], sel.inputs['Color'])
sk = WN('ShaderNodeMath'); sk.operation = 'MULTIPLY'; WL(sp.outputs[0], sk.inputs[0]); WL(sel.outputs['Red'], sk.inputs[1])  # no todas las celdas tienen una estrella brillante
sw = WN('ShaderNodeMix'); sw.data_type = 'RGBA'; sw.blend_type = 'ADD'; WL(sk.outputs[0], sw.inputs['Factor']); WL(addc.outputs[2], sw.inputs[6]); sw.inputs[7].default_value = (3.2, 3.2, 3.6, 1)
WL(sw.outputs[2], bgn.inputs['Color']); bgn.inputs['Strength'].default_value = 1.0
# la nebulosa solo se ve de fondo: para iluminar la escena, un ambiente azul oscuro tenue
lp = WN('ShaderNodeLightPath'); mixw = WN('ShaderNodeMixShader'); dark = WN('ShaderNodeBackground'); dark.inputs['Color'].default_value = (*lin(hexc('#1a1d2e')), 1); dark.inputs['Strength'].default_value = .6
WL(lp.outputs['Is Camera Ray'], mixw.inputs['Fac']); WL(dark.outputs['Background'], mixw.inputs[1]); WL(bgn.outputs['Background'], mixw.inputs[2]); WL(mixw.outputs['Shader'], wn.nodes['World Output'].inputs['Surface'])
bpy.ops.object.light_add(type='SUN', rotation=(math.radians(-115), 0, math.radians(20))); rim = bpy.context.object; rim.data.energy = 2.2; rim.data.color = lin(hexc('#6fa8ff'))
bpy.ops.object.light_add(type='AREA', location=W(0, -9, 20)); fr = bpy.context.object; fr.rotation_euler = (math.radians(-60), 0, 0); fr.data.energy = 3500; fr.data.size = 25; fr.data.color = lin(hexc('#7fb6ff'))  # luz fría desde delante y abajo: se ve la roca que cuelga bajo la arena  # contraluz azul desde abajo: recorta la isla y las rocas
bpy.ops.object.light_add(type='AREA', location=W(0, 16, -1)); ar = bpy.context.object; ar.data.energy = 2500; ar.data.size = 18; ar.data.color = lin(hexc('#f2f0ff'))
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
out = {'w': WR, 'h': HR, 'back': [px(FX0, 0, FZ0), px(FX1, 0, FZ0)], 'bench': [px(BENCH_X + BENCH_DX * i, TOP, BENCH_Z) for i in range(9)], 'holes': [px(x, 0, z) for x, z in HOLES], 'holes2': [px(x, 0, z) for x, z in HOLES2]}
json.dump(out, open(bpy.path.abspath(OUT).rsplit('.', 1)[0] + '.json', 'w'))
bpy.ops.render.render(write_still=True); print('PUNTOS', json.dumps(out))
