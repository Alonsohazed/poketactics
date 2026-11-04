# Arenas temáticas por tipo (agua, fuego, planta, roca, electrico) y «cascada» (isla de hierba con ríos, cascada, pinos y braseros): el mismo escenario que el «coliseo» (arena-coliseo.py) con la misma cámara,
# el mismo campo, la misma banca de 9 losas, las mismas repisas con los 5 rombos y los mismos pedestales con el trofeo de los aumentos
# (el mío a la izquierda y el del rival, reflejado, a la derecha), pero con el suelo, las piedras, la decoración flotante, las luces y el cielo de su tipo.
# Los puntos de encaje (FLAT_IMG) salen idénticos a los del coliseo, así que en board3d.js basta con cambiar la carpeta.
# Uso: blender -b --python arena-temas.py -- <tema> <salida.png> [ancho=2880] [alto=1620] [muestras=64] [gpu=1]
# Después: base.webp (q72) y base1x.webp (mitad, q74) con sharp; ver la cabecera de arena-coliseo.py.
import bpy, sys, math, json, random
from mathutils import Vector, noise
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
TEMA = argv[0] if argv else 'agua'
OUT = argv[1] if len(argv) > 1 else '//arena.png'
WR = int(argv[2]) if len(argv) > 2 else 2880
HR = int(argv[3]) if len(argv) > 3 else 1620
SAMPLES = int(argv[4]) if len(argv) > 4 else 64
GPU = (argv[5] if len(argv) > 5 else '1') == '1'
EL, DIST, TZ, MARGEN = 40.0, 28.5, .5, 1.3
FX0, FX1, FZ0, FZ1 = -6.995, 6.995, -7.285, 5.374
BENCH_Z, BENCH_X, BENCH_DX, TOP = 6.4545, -5.7735, 1.4434, .2
HOLES = [(-7.343, -4.915), (-7.342, -3.277), (-7.319, -1.599), (-7.312, -.117), (-7.292, 1.36)]
MID_Z = -.93
MIR = lambda x, z: (-x, 2 * MID_Z - z)
HOLES2 = [MIR(x, z) for x, z in HOLES]
W = lambda x, y, z: (x, -z, y)

# ---------- paletas por tipo ----------
# suelo: c0/c1 (rampa de la piedra), junta (color de las juntas entre losas), jemit/jstr (brillo de las juntas), rough
# piedra: roca y su brillo; luz: puntos de luz junto a las piedras; isla: roca de debajo y su contorno; cielo: 4 tonos de la nebulosa y el de las vetas
T = {
 'agua': dict(c0='#86a6bf', c1='#d3e4ef', junta='#3f7d9c', jemit='#45d4ff', jstr=.35, jmix=.35, rough=.32, peb='#3c5666',
   roca='#0c1b27', brillo='#2fc8ff', luz='#4fcfff', repisa='#1b2a37', rombo='#07111a', ribete='#2a3d4c', banca='#152230', losa='#2e4556',
   borde='#16222d', isla='#13212c', fres='#55d8ff', flot='#15283a', cielo=('#01060f', '#08213d', '#10406e', '#1f86b8'), veta='#1fb3b0',
   amb='#14283a', sol='#9fd8ff', frente='#6fd0ff', arriba='#eef8ff'),
 'fuego': dict(c0='#9c8376', c1='#d3bfae', junta='#6a3a22', jemit='#ff6a1c', jstr=1.5, jmix=.75, rough=.75, peb='#3b2a24',
   roca='#140906', brillo='#ff5a14', luz='#ff7a2e', repisa='#2a1d19', rombo='#110806', ribete='#3a2620', banca='#221714', losa='#4a3730',
   borde='#221613', isla='#1d120e', fres='#ff7a3a', flot='#1f130f', cielo=('#0a0201', '#2e0904', '#6e1d07', '#c2430f'), veta='#ff9a3a',
   amb='#2a1610', sol='#ffb07a', frente='#ff9a5e', arriba='#fff1e4'),
 'planta': dict(c0='#94a585', c1='#d2dec2', junta='#4d7a34', jemit='#8dff7a', jstr=0, jmix=.55, rough=.8, peb='#3d4a33',
   roca='#10170c', brillo='#5fff7c', luz='#78ff8e', repisa='#1f2a1a', rombo='#0a110a', ribete='#2c3a26', banca='#18221a', losa='#34452f',
   borde='#18221a', isla='#141d12', fres='#7dff8a', flot='#1a2716', cielo=('#010703', '#07301a', '#17602f', '#4fae3c'), veta='#c8e04a',
   amb='#162a16', sol='#c8ffb0', frente='#8dffa0', arriba='#f4fff0'),
 'roca': dict(c0='#a8916f', c1='#dccaa8', junta='#6b5638', jemit='#ffb347', jstr=0, jmix=.5, rough=.85, peb='#4a3b2a',
   roca='#2c2016', brillo='#ffae3d', luz='#ffb858', repisa='#2c2219', rombo='#120c07', ribete='#3c2f22', banca='#241b14', losa='#4a3b2c',
   borde='#251c15', isla='#211810', fres='#ffb469', flot='#2a1f15', cielo=('#080403', '#2c1a10', '#6e4220', '#b8753a'), veta='#e0a05a',
   amb='#2a2014', sol='#ffd7a0', frente='#ffc07a', arriba='#fff6ea'),
 'electrico': dict(c0='#9c9ca8', c1='#dadae2', junta='#57533a', jemit='#ffd84a', jstr=.9, jmix=.5, rough=.42, peb='#3c3c44',
   roca='#121218', brillo='#ffd23a', luz='#ffe066', repisa='#22222a', rombo='#0b0b10', ribete='#33333d', banca='#1c1c22', losa='#3a3a44',
   borde='#1d1d24', isla='#17171e', fres='#ffe066', flot='#1a1a22', cielo=('#03030a', '#11163a', '#2f2a74', '#5a46b8'), veta='#ffd84a',
   amb='#1c1c2c', sol='#fff0a0', frente='#ffe27a', arriba='#fffbe8'),
 # isla de hierba con ríos y cascada: losas claras de arenisca con el borde que se funde con la hierba, piedra clara y fuego en los braseros
 'cascada': dict(c0='#a39a5f', c1='#d1c287', junta='#8b8157', jemit='#ffb347', jstr=0, jmix=.3, rough=.9, peb='#7d776a',
   roca='#5d4a3a', brillo='#ffc25a', luz='#ffb45a', repisa='#8f8a7e', rombo='#45413b', ribete='#a9a396', banca='#7a756b', losa='#aca598',
   borde='#8c877c', isla='#4a3a2c', fres='#9fbfd4', flot='#5d4a3a', cielo=('#4d5560', '#626b76', '#78828c', '#8f9aa5'), veta='#aab6c0',
   amb='#55606c', sol='#ffe6c0', frente='#d6e4ee', arriba='#fff7ea'),
}[TEMA]
rnd = random.Random({'agua': 21, 'fuego': 31, 'planta': 41, 'roca': 51, 'electrico': 61, 'cascada': 71}[TEMA])

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
hexc = lambda h: tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
lin = lambda c: tuple(v ** 2.2 for v in c)
C = lambda h: (*lin(hexc(h)), 1)
def mat(name, col, rough=.7, emit=None, estr=0.0, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = C(col); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit: b.inputs['Emission Color'].default_value = C(emit); b.inputs['Emission Strength'].default_value = estr
    return m
def box(name, x0, x1, z0, z1, y0, y1, m, bevel=0.0):
    cx, cz, cy = (x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2
    bpy.ops.mesh.primitive_cube_add(size=1, location=W(cx, cy, cz)); o = bpy.context.object; o.name = name
    o.scale = (x1 - x0, z1 - z0, y1 - y0); bpy.ops.object.transform_apply(scale=True); o.data.materials.append(m)
    if bevel: bv = o.modifiers.new('bisel', 'BEVEL'); bv.width = bevel; bv.segments = 5; bv.limit_method = 'NONE'; bpy.ops.object.shade_smooth()
    return o

# ---------- suelo: losas irregulares de bordes suaves (como el coliseo), teñidas por tipo y con juntas de su color (brillantes en fuego y eléctrico) ----------
mf = bpy.data.materials.new('suelo'); mf.use_nodes = True; nt = mf.node_tree; bs = nt.nodes['Principled BSDF']; N = nt.nodes.new; L = nt.links.new
tc = N('ShaderNodeTexCoord')
ve = N('ShaderNodeTexVoronoi'); ve.feature = 'DISTANCE_TO_EDGE'; ve.inputs['Scale'].default_value = .42; ve.inputs['Randomness'].default_value = .9
vc = N('ShaderNodeTexVoronoi'); vc.inputs['Scale'].default_value = .42; vc.inputs['Randomness'].default_value = .9
nz = N('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = .9; nz.inputs['Detail'].default_value = 6
nf = N('ShaderNodeTexNoise'); nf.inputs['Scale'].default_value = 7; nf.inputs['Detail'].default_value = 3
for n in (ve, vc, nz, nf): L(tc.outputs['Object'], n.inputs['Vector'])
edge = N('ShaderNodeMapRange'); edge.inputs['From Min'].default_value = 0; edge.inputs['From Max'].default_value = .22; L(ve.outputs['Distance'], edge.inputs['Value'])
cell = N('ShaderNodeSeparateColor'); L(vc.outputs['Color'], cell.inputs['Color'])
tone = N('ShaderNodeMapRange'); tone.inputs['To Min'].default_value = .9; tone.inputs['To Max'].default_value = 1.05; L(cell.outputs['Red'], tone.inputs['Value'])
ramp = N('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = C(T['c0']); ramp.color_ramp.elements[1].color = C(T['c1'])
mixv = N('ShaderNodeMath'); mixv.operation = 'MULTIPLY'; L(edge.outputs['Result'], mixv.inputs[0]); mixv.inputs[1].default_value = .55
add = N('ShaderNodeMath'); add.operation = 'ADD'; L(mixv.outputs[0], add.inputs[0]); L(nz.outputs['Fac'], add.inputs[1])
sc2 = N('ShaderNodeMath'); sc2.operation = 'MULTIPLY'; L(add.outputs[0], sc2.inputs[0]); sc2.inputs[1].default_value = .78; L(sc2.outputs[0], ramp.inputs['Fac'])
mul = N('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1; L(ramp.outputs['Color'], mul.inputs[6])
tcol = N('ShaderNodeCombineColor')
for k in ('Red', 'Green', 'Blue'): L(tone.outputs['Result'], tcol.inputs[k])
L(tcol.outputs['Color'], mul.inputs[7])
fine = N('ShaderNodeMix'); fine.data_type = 'RGBA'; fine.blend_type = 'OVERLAY'; fine.inputs['Factor'].default_value = .12; L(mul.outputs[2], fine.inputs[6]); L(nf.outputs['Color'], fine.inputs[7])
# junta: 1 en la línea entre losas → 0 dentro (fina: potencia 4)
jr = N('ShaderNodeMapRange'); jr.inputs['From Min'].default_value = 0; jr.inputs['From Max'].default_value = .045; jr.inputs['To Min'].default_value = 1; jr.inputs['To Max'].default_value = 0; L(ve.outputs['Distance'], jr.inputs['Value'])
jp = N('ShaderNodeMath'); jp.operation = 'POWER'; jp.inputs[1].default_value = 2.2; L(jr.outputs['Result'], jp.inputs[0])
jk = N('ShaderNodeMath'); jk.operation = 'MULTIPLY'; L(jp.outputs[0], jk.inputs[0]); jk.inputs[1].default_value = T['jmix']
jm = N('ShaderNodeMix'); jm.data_type = 'RGBA'; L(jk.outputs[0], jm.inputs['Factor']); L(fine.outputs[2], jm.inputs[6]); jm.inputs[7].default_value = C(T['junta'])
L(jm.outputs[2], bs.inputs['Base Color']); bs.inputs['Roughness'].default_value = T['rough']
if T['jstr'] > 0:
    # el brillo de las juntas varía a lo largo de la línea (ruido): como lava o corriente que se apaga y se enciende
    jn = N('ShaderNodeTexNoise'); jn.inputs['Scale'].default_value = 1.3; L(tc.outputs['Object'], jn.inputs['Vector'])
    jnr = N('ShaderNodeMapRange'); jnr.inputs['From Min'].default_value = .38; jnr.inputs['From Max'].default_value = .7; L(jn.outputs['Fac'], jnr.inputs['Value'])
    je = N('ShaderNodeMath'); je.operation = 'MULTIPLY'; L(jp.outputs[0], je.inputs[0]); L(jnr.outputs['Result'], je.inputs[1])
    je2 = N('ShaderNodeMath'); je2.operation = 'MULTIPLY'; L(je.outputs[0], je2.inputs[0]); je2.inputs[1].default_value = T['jstr']
    bs.inputs['Emission Color'].default_value = C(T['jemit']); L(je2.outputs[0], bs.inputs['Emission Strength'])
if TEMA == 'agua':  # charcos: zonas lisas y brillantes (más lisa la piedra donde el ruido grande es alto)
    pz = N('ShaderNodeTexNoise'); pz.inputs['Scale'].default_value = .35; L(tc.outputs['Object'], pz.inputs['Vector'])
    pr = N('ShaderNodeMapRange'); pr.inputs['From Min'].default_value = .5; pr.inputs['From Max'].default_value = .62; pr.inputs['To Min'].default_value = T['rough']; pr.inputs['To Max'].default_value = .08
    L(pz.outputs['Fac'], pr.inputs['Value']); L(pr.outputs['Result'], bs.inputs['Roughness'])
if TEMA == 'cascada':  # el campo se funde con la hierba hacia los bordes (por manchas, no en línea recta)
    gg = N('ShaderNodeTexCoord'); gs = N('ShaderNodeSeparateXYZ'); L(gg.outputs['Generated'], gs.inputs[0])
    def cdist(o):
        a1 = N('ShaderNodeMath'); a1.operation = 'SUBTRACT'; L(o, a1.inputs[0]); a1.inputs[1].default_value = .5
        a2 = N('ShaderNodeMath'); a2.operation = 'ABSOLUTE'; L(a1.outputs[0], a2.inputs[0]); return a2
    dxn, dyn = cdist(gs.outputs['X']), cdist(gs.outputs['Y']); mxn = N('ShaderNodeMath'); mxn.operation = 'MAXIMUM'; L(dxn.outputs[0], mxn.inputs[0]); L(dyn.outputs[0], mxn.inputs[1])
    gn2 = N('ShaderNodeTexNoise'); gn2.inputs['Scale'].default_value = .5; L(tc.outputs['Object'], gn2.inputs['Vector']); ad2 = N('ShaderNodeMath'); ad2.operation = 'MULTIPLY_ADD'; L(gn2.outputs['Fac'], ad2.inputs[0]); ad2.inputs[1].default_value = .22; L(mxn.outputs[0], ad2.inputs[2])
    gr2 = N('ShaderNodeMapRange'); gr2.inputs['From Min'].default_value = .43; gr2.inputs['From Max'].default_value = .62; gr2.inputs['To Max'].default_value = .85; L(ad2.outputs[0], gr2.inputs['Value'])
    gm2 = N('ShaderNodeMix'); gm2.data_type = 'RGBA'; L(gr2.outputs['Result'], gm2.inputs['Factor']); L(jm.outputs[2], gm2.inputs[6]); gm2.inputs[7].default_value = C('#7d9a45'); L(gm2.outputs[2], bs.inputs['Base Color'])
bump = N('ShaderNodeBump'); bump.inputs['Strength'].default_value = .35; bump.inputs['Distance'].default_value = .015; L(edge.outputs['Result'], bump.inputs['Height']); L(bump.outputs['Normal'], bs.inputs['Normal'])
FB0 = 2 * MID_Z - 5.75
bpy.ops.mesh.primitive_plane_add(size=1, location=W(0, 0, (FB0 + 5.75) / 2)); fl = bpy.context.object; fl.name = 'suelo'
fl.scale = (FX1 - FX0 + .6, 5.75 - FB0, 1); bpy.ops.object.transform_apply(scale=True); fl.data.materials.append(mf)
# sombra suave junto a los bordes del campo
M_AO = bpy.data.materials.new('oclusion'); M_AO.use_nodes = True; an = M_AO.node_tree; ab = an.nodes['Principled BSDF']; ab.inputs['Base Color'].default_value = (0, 0, 0, 1)
ag = an.nodes.new('ShaderNodeTexCoord'); asep = an.nodes.new('ShaderNodeSeparateXYZ'); an.links.new(ag.outputs['Generated'], asep.inputs[0])
def dist_edge(c):
    m1 = an.nodes.new('ShaderNodeMath'); m1.operation = 'MINIMUM'; an.links.new(c, m1.inputs[0])
    m2 = an.nodes.new('ShaderNodeMath'); m2.operation = 'SUBTRACT'; m2.inputs[0].default_value = 1; an.links.new(c, m2.inputs[1]); an.links.new(m2.outputs[0], m1.inputs[1]); return m1
mx = dist_edge(asep.outputs['X']); my = dist_edge(asep.outputs['Y']); mm = an.nodes.new('ShaderNodeMath'); mm.operation = 'MINIMUM'; an.links.new(mx.outputs[0], mm.inputs[0]); an.links.new(my.outputs[0], mm.inputs[1])
ar2 = an.nodes.new('ShaderNodeMapRange'); ar2.inputs['From Max'].default_value = .09; ar2.inputs['To Min'].default_value = .55; ar2.inputs['To Max'].default_value = 0
an.links.new(mm.outputs[0], ar2.inputs['Value']); an.links.new(ar2.outputs['Result'], ab.inputs['Alpha'])
bpy.ops.mesh.primitive_plane_add(size=1, location=W(0, .004, (FB0 + 5.75) / 2)); ao = bpy.context.object; ao.scale = (FX1 - FX0 + .6, 5.75 - FB0, 1); bpy.ops.object.transform_apply(scale=True); ao.data.materials.append(M_AO)
# piedrecitas (en planta, matas de hierba) junto a los bordes, lejos de los rombos y del centro
M_PEB = mat('piedrecita', T['peb'], .8)
M_GRASS = mat('hierba', '#4f8a32', .7) if TEMA == 'planta' else None
for k in range(26):
    side = k % 3; t = rnd.random()
    if side == 0: x, z = FX0 + (FX1 - FX0) * t, FZ0 + rnd.uniform(.15, .5)
    elif side == 1: x, z = FX1 - rnd.uniform(.15, .5), FZ0 + (5.0 - FZ0) * t
    else: x, z = FX0 + rnd.uniform(.25, .6), FZ0 + (2.6 - FZ0) * t
    if M_GRASS and k % 2 == 0:  # mata: unas hojas finas y altas abiertas en abanico
        for j in range(5):
            a = j / 5 * math.tau + rnd.uniform(-.3, .3); bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=.035, radius2=0, depth=.28, location=W(x, .12, z)); b = bpy.context.object
            b.rotation_euler = (math.cos(a) * .45, math.sin(a) * .45, a); b.data.materials.append(M_GRASS)
        continue
    r = rnd.uniform(.05, .12); bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r, location=W(x, r * .35, z)); p = bpy.context.object
    p.scale = (1, rnd.uniform(.7, 1), .55); p.data.materials.append(M_PEB); bpy.ops.object.shade_smooth()

# ---------- muros de piedra (detrás no: a la izquierda por fuera de mi repisa y a la derecha por fuera de la del rival), con la forma de su tipo ----------
def rock_mat():
    m = mat('roca', T['roca'], .8, metal=.6 if TEMA == 'electrico' else 0); nt2 = m.node_tree; b = nt2.nodes['Principled BSDF']; n2 = nt2.nodes.new; l2 = nt2.links.new
    if TEMA == 'fuego':  # grietas de lava: el borde de las celdas de Voronoi brilla
        t2 = n2('ShaderNodeTexCoord'); v2 = n2('ShaderNodeTexVoronoi'); v2.feature = 'DISTANCE_TO_EDGE'; v2.inputs['Scale'].default_value = 1.1; l2(t2.outputs['Object'], v2.inputs['Vector'])
        r2 = n2('ShaderNodeMapRange'); r2.inputs['From Min'].default_value = 0; r2.inputs['From Max'].default_value = .025; r2.inputs['To Min'].default_value = 5; r2.inputs['To Max'].default_value = 0; l2(v2.outputs['Distance'], r2.inputs['Value'])
        q2 = n2('ShaderNodeTexNoise'); q2.inputs['Scale'].default_value = 1.8; l2(t2.outputs['Object'], q2.inputs['Vector']); qr = n2('ShaderNodeMapRange'); qr.inputs['From Min'].default_value = .45; qr.inputs['From Max'].default_value = .6; l2(q2.outputs['Fac'], qr.inputs['Value'])
        qm = n2('ShaderNodeMath'); qm.operation = 'MULTIPLY'; l2(r2.outputs['Result'], qm.inputs[0]); l2(qr.outputs['Result'], qm.inputs[1])
        b.inputs['Emission Color'].default_value = C(T['brillo']); l2(qm.outputs[0], b.inputs['Emission Strength'])
    if TEMA == 'planta':  # musgo en lo alto (según la normal)
        g2 = n2('ShaderNodeNewGeometry'); s2 = n2('ShaderNodeSeparateXYZ'); l2(g2.outputs['Normal'], s2.inputs[0])
        r2 = n2('ShaderNodeMapRange'); r2.inputs['From Min'].default_value = .35; r2.inputs['From Max'].default_value = .75; l2(s2.outputs['Z'], r2.inputs['Value'])
        x2 = n2('ShaderNodeMix'); x2.data_type = 'RGBA'; l2(r2.outputs['Result'], x2.inputs['Factor']); x2.inputs[6].default_value = C(T['roca']); x2.inputs[7].default_value = C('#3f7a26'); l2(x2.outputs[2], b.inputs['Base Color'])
    if TEMA == 'roca':  # estratos de arenisca (bandas horizontales)
        t2 = n2('ShaderNodeTexCoord'); w2 = n2('ShaderNodeTexWave'); w2.wave_type = 'BANDS'; w2.bands_direction = 'Z'; w2.inputs['Scale'].default_value = 2.2; w2.inputs['Distortion'].default_value = 3; l2(t2.outputs['Object'], w2.inputs['Vector'])
        rr = n2('ShaderNodeValToRGB'); rr.color_ramp.elements[0].color = C('#3b2a1c'); rr.color_ramp.elements[1].color = C('#7a5a3a'); l2(w2.outputs['Fac'], rr.inputs['Fac']); l2(rr.outputs['Color'], b.inputs['Base Color'])
    return m
M_ROCK = rock_mat()
M_CRYS = mat('cristal', T['brillo'], .15, T['brillo'], 2.2 if TEMA == 'electrico' else 1.2)
M_BUSH = mat('arbusto', '#2f6a22', .75) if TEMA == 'planta' else None
M_GLOW = bpy.data.materials.new('brillo'); M_GLOW.use_nodes = True; g = M_GLOW.node_tree; gb = g.nodes['Principled BSDF']
gb.inputs['Base Color'].default_value = (0, 0, 0, 1); gb.inputs['Emission Color'].default_value = C(T['brillo']); gb.inputs['Emission Strength'].default_value = 5.5
gc = g.nodes.new('ShaderNodeTexCoord'); ramp = g.nodes.new('ShaderNodeValToRGB'); sep = g.nodes.new('ShaderNodeSeparateXYZ'); nz2 = g.nodes.new('ShaderNodeTexNoise'); nz2.inputs['Scale'].default_value = 9; mul = g.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
ramp.color_ramp.elements[0].position = 0; ramp.color_ramp.elements[0].color = (1, 1, 1, 1); ramp.color_ramp.elements[1].position = .85; ramp.color_ramp.elements[1].color = (0, 0, 0, 1)
g.links.new(gc.outputs['Generated'], sep.inputs[0]); g.links.new(sep.outputs['Y'], ramp.inputs['Fac']); g.links.new(ramp.outputs['Color'], mul.inputs[0]); g.links.new(nz2.outputs['Fac'], mul.inputs[1]); g.links.new(mul.outputs[0], gb.inputs['Alpha'])
def jag(o, k=.3, floor=-.55, smooth=False):
    for v in o.data.vertices: v.co *= 1 + rnd.uniform(-k, k); v.co.z = max(v.co.z, floor)
    o.data.polygons.foreach_set('use_smooth', [smooth] * len(o.data.polygons))
def rock(x, z, s, h):
    if TEMA == 'electrico':  # cristales de metal oscuro: prismas altos y afilados, algo inclinados
        bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=s * .55, radius2=0, depth=h * 2.4, location=W(x, h * 1.0, z)); o = bpy.context.object
        o.rotation_euler = (rnd.uniform(-.25, .25), rnd.uniform(-.25, .25), rnd.uniform(0, math.tau)); o.data.materials.append(M_ROCK)
        if rnd.random() < .45:  # algunos con la punta encendida
            bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=s * .2, radius2=0, depth=h * .8, location=W(x + rnd.uniform(-.25, .25), h * .4, z + rnd.uniform(-.2, .2))); c = bpy.context.object; c.data.materials.append(M_CRYS)
        return o
    if TEMA == 'roca':  # pilares de arenisca: cilindros irregulares apilados
        y = 0
        for j in range(rnd.randint(2, 3)):
            hh = h * rnd.uniform(.45, .7); rr = s * (1 - .18 * j) * rnd.uniform(.8, 1.0)
            bpy.ops.mesh.primitive_cylinder_add(vertices=9, radius=rr, depth=hh, location=W(x + rnd.uniform(-.08, .08), y + hh / 2, z + rnd.uniform(-.08, .08))); o = bpy.context.object
            jag(o, .12, -9); o.rotation_euler.z = rnd.uniform(0, math.tau); o.data.materials.append(M_ROCK); y += hh * .92
        return o
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2 if TEMA != 'agua' else 3, radius=1, location=W(x, h * .45, z)); o = bpy.context.object
    jag(o, .3 if TEMA != 'agua' else .15, smooth=TEMA == 'agua')  # agua: piedras pulidas por el agua
    o.scale = (s * rnd.uniform(.85, 1.15), s * rnd.uniform(.7, 1.0), h); o.rotation_euler = (rnd.uniform(-.12, .12), rnd.uniform(-.12, .12), rnd.uniform(0, math.tau))
    o.data.materials.append(M_ROCK)
    if TEMA == 'agua' and rnd.random() < .4:  # cristales de hielo y agua entre las piedras
        bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=s * .22, radius2=0, depth=h * 1.3, location=W(x + rnd.uniform(-.3, .3), h * .55, z + rnd.uniform(-.3, .3))); c = bpy.context.object
        c.rotation_euler = (rnd.uniform(-.3, .3), rnd.uniform(-.3, .3), 0); c.data.materials.append(M_CRYS)
    if M_BUSH and rnd.random() < .5:  # arbustos redondos entre las piedras
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=s * .55, location=W(x + rnd.uniform(-.35, .35), h * .5, z + rnd.uniform(-.35, .35))); b = bpy.context.object
        for v in b.data.vertices: v.co *= 1 + .25 * noise.noise(v.co * 3.0)
        b.scale = (1, 1, .8); b.data.materials.append(M_BUSH); bpy.ops.object.shade_smooth()
    return o
def flame(x0, z0, x1, z1, h=.55):
    Ln = math.hypot(x1 - x0, z1 - z0); bpy.ops.mesh.primitive_plane_add(size=1, location=W((x0 + x1) / 2, h / 2, (z0 + z1) / 2)); o = bpy.context.object
    o.scale = (Ln, h, 1); o.rotation_euler = (math.pi / 2, 0, -math.atan2(z1 - z0, x1 - x0)); o.data.materials.append(M_GLOW); return o
def wall(x0, z0, x1, z1, n, inner):
    for i in range(n):
        t = (i + rnd.uniform(.15, .85)) / n; x = x0 + (x1 - x0) * t; z = z0 + (z1 - z0) * t
        rock(x, z, rnd.uniform(.55, .8), rnd.uniform(.6, 1.05))
    flame(x0 + inner[0], z0 + inner[1], x1 + inner[0], z1 + inner[1])
    flame(x0 - inner[0] * 1.1, z0 - inner[1] * 1.1, x1 - inner[0] * 1.1, z1 - inner[1] * 1.1, .4)
    Ln = math.hypot(x1 - x0, z1 - z0)
    for i in range(max(1, int(Ln / 2.5))):
        t = (i + .5) / max(1, int(Ln / 2.5)); bpy.ops.object.light_add(type='POINT', location=W(x0 + (x1 - x0) * t + inner[0] * 1.6, .35, z0 + (z1 - z0) * t + inner[1] * 1.6))
        lt = bpy.context.object; lt.data.color = lin(hexc(T['luz'])); lt.data.energy = 35; lt.data.shadow_soft_size = .6
RB = FZ0 - .75; RL = -8.55
if TEMA != 'cascada':  # la cascada no lleva muros de piedra: hierba, ríos y pinos (más abajo)
    wall(RL, FZ0 - .3, RL, 3.4, 22, (.55, 0))
    wall(-RL, MIR(0, 3.4)[1], -RL, MIR(0, FZ0 - .3)[1], 22, (-.55, 0))

# ---------- repisas con los 5 rombos (igual que el coliseo, con el ribete del color del tipo) ----------
M_LEDGE = mat('repisa', T['repisa'], .8); M_SOCK = mat('rombo', T['rombo'], .6); M_SOCKR = mat('rombo_borde', T['ribete'], .5, T['brillo'], .5)
def ledge(sign, holes):
    z0, z1 = (RB + .55, 3.0) if sign < 0 else (MIR(0, 3.0)[1], MIR(0, RB + .55)[1])
    box('repisa', min(sign * 8.05, sign * (FX1 + .02)), max(sign * 8.05, sign * (FX1 + .02)), z0, z1, -.05, .04, M_LEDGE, .035)
    for (hx, hz) in holes:
        for (r, m, y) in ((.62, M_SOCKR, .045), (.5, M_SOCK, .05)):
            bpy.ops.mesh.primitive_cylinder_add(vertices=4, radius=r, depth=.02, location=W(hx, y, hz)); o = bpy.context.object; o.data.materials.append(m)
            bv = o.modifiers.new('bisel', 'BEVEL'); bv.width = .06; bv.segments = 4; bv.affect = 'VERTICES'
            o.scale = (.8, 1, 1)
ledge(-1, HOLES); ledge(1, HOLES2)

# ---------- banca (9 losas) sobre su base, igual que el coliseo (la junta brilla del color del tipo) ----------
M_BASE = mat('base_banca', T['banca'], .85); M_SLAB = mat('losa', T['losa'], .75); M_SEAM = mat('junta', '#120f18', .5, T['brillo'], .9)
for (bz, z0, z1, z2, z3) in ((BENCH_Z, 5.62, 7.3, 5.78, 7.13), (MIR(0, BENCH_Z)[1], MIR(0, 7.3)[1], MIR(0, 5.62)[1], MIR(0, 7.13)[1], MIR(0, 5.78)[1])):
    box('base_banca', BENCH_X - .95, -BENCH_X + .95, z0, z1, -.3, .1, M_BASE, .12)
    box('junta_banca', BENCH_X - .78, -BENCH_X + .78, z2, z3, .1, .115, M_SEAM)
    for i in range(9):
        x = BENCH_X + BENCH_DX * i; box(f'losa{i}', x - .66, x + .66, bz - .6, bz + .6, .1, TOP, M_SLAB, .045)

# ---------- isla flotante: borde redondeado y roca que cuelga (con el contorno del color del tipo) ----------
box('borde', -9.7, 9.7, MIR(0, 7.55)[1], 7.55, -.6, -.03, mat('borde', T['borde'], .85), .5)
M_ISLA = mat('isla', T['isla'], .9)
in_ = M_ISLA.node_tree; ib = in_.nodes['Principled BSDF']; lw = in_.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = .18; ir = in_.nodes.new('ShaderNodeMath'); ir.operation = 'MULTIPLY'; ir.inputs[1].default_value = .5
in_.links.new(lw.outputs['Facing'], ir.inputs[0]); ib.inputs['Emission Color'].default_value = C(T['fres']); in_.links.new(ir.outputs[0], ib.inputs['Emission Strength'])
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5, radius=1, location=W(0, -4.6, MID_Z)); isla = bpy.context.object; isla.name = 'isla'
for v in isla.data.vertices:
    c = v.co
    if c.z > .61: c.z = .61
    else:
        n = noise.noise(Vector((c.x * 2.3, c.y * 2.3, c.z * 2.3))) + .5 * noise.noise(Vector((c.x * 6, c.y * 6, c.z * 6)))
        c.x *= 1 + .16 * n; c.y *= 1 + .16 * n; c.z *= 1 + .35 * noise.noise(Vector((c.x * 4, c.y * 4, 1.7)))
isla.scale = (11.2, 9.9, 6.5); bpy.ops.object.transform_apply(scale=True); isla.data.materials.append(M_ISLA); bpy.ops.object.shade_smooth()
if TEMA == 'fuego':  # la roca de debajo gotea lava: grietas encendidas
    v3 = in_.nodes.new('ShaderNodeTexVoronoi'); v3.feature = 'DISTANCE_TO_EDGE'; v3.inputs['Scale'].default_value = .5; t3 = in_.nodes.new('ShaderNodeTexCoord'); in_.links.new(t3.outputs['Object'], v3.inputs['Vector'])
    r3 = in_.nodes.new('ShaderNodeMapRange'); r3.inputs['From Max'].default_value = .014; r3.inputs['To Min'].default_value = 3; r3.inputs['To Max'].default_value = 0; in_.links.new(v3.outputs['Distance'], r3.inputs['Value'])
    a3 = in_.nodes.new('ShaderNodeMath'); in_.links.new(ir.outputs[0], a3.inputs[0]); in_.links.new(r3.outputs['Result'], a3.inputs[1]); in_.links.new(a3.outputs[0], ib.inputs['Emission Strength'])

# ---------- decoración flotante alrededor y por debajo (nunca delante de la banca ni sobre el campo) ----------
def spots(n, d0=13, d1=30, y0=-14, y1=-2):
    out = []
    while len(out) < n:
        ang = rnd.uniform(0, math.tau); d = rnd.uniform(d0, d1); x = math.cos(ang) * d * 1.25; z = math.sin(ang) * d * .9 - 2; y = rnd.uniform(y0, y1)
        if z > 9 and y > -6: continue
        out.append((x, y, z, d))
    return out
M_FL = mat('roca_flotante', T['flot'], .85, metal=.5 if TEMA == 'electrico' else 0)
for (x, y, z, d) in (spots(16) if TEMA != 'cascada' else []):  # rocas
    r = rnd.uniform(.5, 2.2) * (1 + (d - 13) / 30); bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=r, location=W(x, y, z)); o = bpy.context.object
    for v in o.data.vertices: v.co *= 1 + rnd.uniform(-.18, .18)
    o.scale = (1, rnd.uniform(.7, 1.1), rnd.uniform(.6, .9)); o.rotation_euler = (rnd.uniform(0, 3), rnd.uniform(0, 3), rnd.uniform(0, 3)); o.data.materials.append(M_FL); bpy.ops.object.shade_smooth()
if TEMA == 'agua':  # burbujas: esferas de vidrio con el borde encendido
    M_BUB = bpy.data.materials.new('burbuja'); M_BUB.use_nodes = True; bn = M_BUB.node_tree; bb = bn.nodes['Principled BSDF']
    bb.inputs['Base Color'].default_value = C('#bfefff'); bb.inputs['Roughness'].default_value = 0; bb.inputs['Transmission Weight'].default_value = 1; bb.inputs['IOR'].default_value = 1.33
    lw2 = bn.nodes.new('ShaderNodeLayerWeight'); lw2.inputs['Blend'].default_value = .12; bm = bn.nodes.new('ShaderNodeMath'); bm.operation = 'MULTIPLY'; bm.inputs[1].default_value = 3
    bn.links.new(lw2.outputs['Facing'], bm.inputs[0]); bb.inputs['Emission Color'].default_value = C('#6fe0ff'); bn.links.new(bm.outputs[0], bb.inputs['Emission Strength'])
    for (x, y, z, d) in spots(40, 12, 28, -12, 1):
        r = rnd.uniform(.15, .9); bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=r, location=W(x, y, z)); o = bpy.context.object; o.data.materials.append(M_BUB); bpy.ops.object.shade_smooth()
if TEMA == 'fuego':  # brasas: motas incandescentes
    M_EMB = mat('brasa', '#ff8a3a', .5, '#ff7a22', 9)
    for (x, y, z, d) in spots(70, 11, 26, -12, 2):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=rnd.uniform(.04, .14), location=W(x, y, z)); bpy.context.object.data.materials.append(M_EMB)
if TEMA == 'planta':  # hojas flotando
    M_LEAF = mat('hoja', '#57a83a', .6); M_LEAF2 = mat('hoja2', '#9bd04a', .6)
    for (x, y, z, d) in spots(45, 11, 26, -12, 2):
        s = rnd.uniform(.25, .7); bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1, location=W(x, y, z)); o = bpy.context.object
        for v in o.data.vertices: v.co.x *= 1 - .6 * abs(v.co.y) ** 2  # punta en los dos extremos
        o.scale = (s * .45, s, s * .06); o.rotation_euler = (rnd.uniform(0, 3), rnd.uniform(0, 3), rnd.uniform(0, 3)); o.data.materials.append(M_LEAF if rnd.random() < .6 else M_LEAF2); bpy.ops.object.shade_smooth()
if TEMA == 'roca':  # polvo de arena en suspensión: motas cálidas
    M_DUST = mat('polvo', '#e0b070', .8, '#ffb35a', 2.5)
    for (x, y, z, d) in spots(50, 11, 26, -12, 2):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=rnd.uniform(.03, .09), location=W(x, y, z)); bpy.context.object.data.materials.append(M_DUST)
if TEMA == 'electrico':  # rayos lejanos: líneas quebradas que brillan
    M_BOLT = mat('rayo', '#fff6c8', .5, '#ffe45a', 14)
    for (x, y, z, d) in spots(7, 20, 34, -10, 3):
        pts = []; px_, py_, pz_ = x, y + 5, z
        for j in range(9): pts.append((px_, py_, pz_)); px_ += rnd.uniform(-.9, .9); py_ -= rnd.uniform(.8, 1.4); pz_ += rnd.uniform(-.5, .5)
        cu = bpy.data.curves.new('rayo', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = .05; sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
        for p, (a, b, c) in zip(sp.points, pts): p.co = (*W(a, b, c), 1)
        ob = bpy.data.objects.new('rayo', cu); sc.collection.objects.link(ob); ob.data.materials.append(M_BOLT)
    for (x, y, z, d) in spots(18, 12, 28, -12, 1):  # esquirlas de cristal que flotan
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=0, radius=rnd.uniform(.3, .9), location=W(x, y, z)); o = bpy.context.object; o.scale = (.45, .45, 1.4)
        o.rotation_euler = (rnd.uniform(0, 3), rnd.uniform(0, 3), rnd.uniform(0, 3)); o.data.materials.append(M_CRYS if rnd.random() < .35 else M_FL)

# ---------- «cascada»: isla de hierba con ríos a los lados que se juntan delante y caen por el borde, pinos, acantilados, matas, flores y 4 braseros ----------
def cascada():
    import bmesh
    M_GRASS2 = bpy.data.materials.new('pradera'); M_GRASS2.use_nodes = True; gt = M_GRASS2.node_tree; gbs = gt.nodes['Principled BSDF']
    gco = gt.nodes.new('ShaderNodeTexCoord'); gnz = gt.nodes.new('ShaderNodeTexNoise'); gnz.inputs['Scale'].default_value = .35; gnz.inputs['Detail'].default_value = 5; gt.links.new(gco.outputs['Object'], gnz.inputs['Vector'])
    gnf = gt.nodes.new('ShaderNodeTexNoise'); gnf.inputs['Scale'].default_value = 6; gt.links.new(gco.outputs['Object'], gnf.inputs['Vector'])
    grr = gt.nodes.new('ShaderNodeValToRGB'); grr.color_ramp.elements[0].color = C('#4f7a2e'); grr.color_ramp.elements[1].color = C('#86ad4c'); gt.links.new(gnz.outputs['Fac'], grr.inputs['Fac'])
    gov = gt.nodes.new('ShaderNodeMix'); gov.data_type = 'RGBA'; gov.blend_type = 'OVERLAY'; gov.inputs['Factor'].default_value = .2; gt.links.new(grr.outputs['Color'], gov.inputs[6]); gt.links.new(gnf.outputs['Color'], gov.inputs[7])
    gt.links.new(gov.outputs[2], gbs.inputs['Base Color']); gbs.inputs['Roughness'].default_value = .92
    M_EARTH = mat('tierra', '#5b4534', .9); M_CLIFF = rock_mat()
    # ríos: dos cauces por fuera de las repisas que bajan hacia delante y se juntan en una poza que cae por el borde
    RIO = [(-11.4, -14.8), (-12.0, -10), (-11.1, -5), (-11.9, 0), (-11.2, 4.6), (-9.6, 8.2), (-6.2, 9.7), (-3.0, 10.4), (0, 10.6)]
    RIOS = [RIO, [(-x, z) for x, z in RIO]]
    def seg_d(px, pz, a, b):
        ax, az = a; bx, bz = b; vx, vz = bx - ax, bz - az; L2 = vx * vx + vz * vz or 1; t = max(0, min(1, ((px - ax) * vx + (pz - az) * vz) / L2)); return math.hypot(px - ax - t * vx, pz - az - t * vz)
    def rio_d(x, z): return min(seg_d(x, z, r[i], r[i + 1]) for r in RIOS for i in range(len(r) - 1))
    POZA = lambda x, z: abs(x) < 3.3 and z > 9.6
    CX, CZ, RX, RZ = 0, -2.2, 16.5, 13.7
    def borde_r(a): return 1 + .07 * noise.noise(Vector((math.cos(a) * 1.7, math.sin(a) * 1.7, .4))) + .03 * noise.noise(Vector((math.cos(a) * 6, math.sin(a) * 6, 1.1)))
    def dentro(x, z):
        if abs(x) < 3.6 and 8 < z < 12.4: return True  # la poza llega hasta el borde, donde empieza la cascada
        a = math.atan2((z - CZ) / RZ, (x - CX) / RX); return math.hypot((x - CX) / RX, (z - CZ) / RZ) < borde_r(a)
    def altura(x, z):
        dx = max(0, abs(x) - 9.9); dz = max(0, z - 7.8, -11.7 - z); d = math.hypot(dx, dz); r = rio_d(x, z)
        if POZA(x, z): return -.32
        sm = lambda e0, e1, t: (lambda u: u * u * (3 - 2 * u))(max(0, min(1, (t - e0) / (e1 - e0))))
        bed = -.08 - .28 * (1 - sm(.55, 1.25, r))  # orilla en pendiente suave (sin escalones de la rejilla)
        k = min(1, d / 3.5) * sm(1.2, 3.0, r)
        return bed + k * (.18 + .5 * (noise.noise(Vector((x * .16, z * .16, .3))) + .5))
    # suelo de la isla: rejilla recortada con el contorno irregular y, por fuera, la pared de tierra que baja
    bm = bmesh.new(); NX, NZ, X0, X1, Z0, Z1 = 150, 130, -19, 19, -18.5, 14; grid = {}
    for i in range(NX + 1):
        for j in range(NZ + 1):
            x = X0 + (X1 - X0) * i / NX; z = Z0 + (Z1 - Z0) * j / NZ; grid[i, j] = bm.verts.new(W(x, altura(x, z), z))
    for i in range(NX):
        for j in range(NZ):
            x = X0 + (X1 - X0) * (i + .5) / NX; z = Z0 + (Z1 - Z0) * (j + .5) / NZ
            if dentro(x, z): bm.faces.new((grid[i, j], grid[i, j + 1], grid[i + 1, j + 1], grid[i + 1, j]))
    for v in [v for v in bm.verts if not v.link_faces]: bm.verts.remove(v)
    for v in [v for v in bm.verts if v.is_boundary]:  # el contorno sobre la curva (sin escalones de la rejilla), salvo el labio recto de la poza
        x, z = v.co.x, -v.co.y
        if abs(x) < 3.75 and z > 8: continue
        a = math.atan2((z - CZ) / RZ, (x - CX) / RX); rr = borde_r(a); nx_, nz_ = CX + RX * rr * math.cos(a), CZ + RZ * rr * math.sin(a); v.co = Vector(W(nx_, altura(nx_, nz_), nz_))
    bnd = [e for e in bm.edges if e.is_boundary]
    ext = bmesh.ops.extrude_edge_only(bm, edges=bnd); nv = [g for g in ext['geom'] if isinstance(g, bmesh.types.BMVert)]
    for v in nv:  # la pared baja entre 2,5 y 4 y se mete un poco hacia dentro, como un acantilado
        x, mz = v.co.x, -v.co.y; s = .93 + .03 * noise.noise(Vector((x * .3, mz * .3, 2)))
        v.co.x = CX + (x - CX) * s; v.co.y = -(CZ + (mz - CZ) * s); v.co.z = -2.5 - 1.5 * (noise.noise(Vector((x * .25, mz * .25, 5))) + .5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces: f.material_index = 0 if f.normal.z > .5 else 1
    me = bpy.data.meshes.new('isla_hierba'); bm.to_mesh(me); bm.free(); ob = bpy.data.objects.new('isla_hierba', me); sc.collection.objects.link(ob)
    me.materials.append(M_GRASS2); me.materials.append(M_EARTH)
    # agua: cintas a lo largo de los cauces y la poza de delante
    M_WATER = mat('agua', '#3b9dbb', .05, '#1f7896', .18)
    wn_ = M_WATER.node_tree; wbs = wn_.nodes['Principled BSDF']; wco = wn_.nodes.new('ShaderNodeTexCoord'); wnz = wn_.nodes.new('ShaderNodeTexNoise'); wnz.inputs['Scale'].default_value = 3; wn_.links.new(wco.outputs['Object'], wnz.inputs['Vector'])
    wbm = wn_.nodes.new('ShaderNodeBump'); wbm.inputs['Strength'].default_value = .15; wn_.links.new(wnz.outputs['Fac'], wbm.inputs['Height']); wn_.links.new(wbm.outputs['Normal'], wbs.inputs['Normal'])
    def cinta(pts, w, y, m, name):
        bm2 = bmesh.new(); prev = None
        for k, (x, z) in enumerate(pts):
            a = pts[max(0, k - 1)]; b = pts[min(len(pts) - 1, k + 1)]; tx, tz = b[0] - a[0], b[1] - a[1]; L = math.hypot(tx, tz) or 1; nx, nz = -tz / L, tx / L
            l = bm2.verts.new(W(x + nx * w / 2, y, z + nz * w / 2)); r = bm2.verts.new(W(x - nx * w / 2, y, z - nz * w / 2))
            if prev: bm2.faces.new((prev[0], prev[1], r, l))
            prev = (l, r)
        me2 = bpy.data.meshes.new(name); bm2.to_mesh(me2); bm2.free(); o2 = bpy.data.objects.new(name, me2); sc.collection.objects.link(o2); me2.materials.append(m); return o2
    def suave(pts, n=6):  # más puntos entre los del cauce (curva de Catmull-Rom) para que no se vea quebrado
        out = []
        for i in range(len(pts) - 1):
            p0 = pts[max(0, i - 1)]; p1 = pts[i]; p2 = pts[i + 1]; p3 = pts[min(len(pts) - 1, i + 2)]
            for s in range(n):
                t = s / n; t2 = t * t; t3 = t2 * t
                out.append(tuple(.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3) for c in (0, 1)))
        return out + [pts[-1]]
    for r in RIOS: cinta(suave(r), 1.45, -.2, M_WATER, 'rio')
    box('poza', -3.45, 3.45, 9.7, 12.4, -.6, -.2, M_WATER)
    # cascada: lámina que cae por delante con vetas blancas y se desvanece abajo, y espuma al pie de la poza
    M_FALL = bpy.data.materials.new('cascada'); M_FALL.use_nodes = True; ft = M_FALL.node_tree; fbs = ft.nodes['Principled BSDF']
    fbs.inputs['Base Color'].default_value = C('#9fd6ea'); fbs.inputs['Roughness'].default_value = .2
    fco = ft.nodes.new('ShaderNodeTexCoord'); fwv = ft.nodes.new('ShaderNodeTexWave'); fwv.bands_direction = 'X'; fwv.inputs['Scale'].default_value = 9; fwv.inputs['Distortion'].default_value = 6; fwv.inputs['Detail'].default_value = 4; ft.links.new(fco.outputs['UV'], fwv.inputs['Vector'])
    fsep = ft.nodes.new('ShaderNodeSeparateXYZ'); ft.links.new(fco.outputs['UV'], fsep.inputs[0])
    ffade = ft.nodes.new('ShaderNodeMapRange'); ffade.inputs['From Min'].default_value = 0; ffade.inputs['From Max'].default_value = .85; ffade.inputs['To Min'].default_value = .95; ffade.inputs['To Max'].default_value = 0; ft.links.new(fsep.outputs['Y'], ffade.inputs['Value'])
    fmix = ft.nodes.new('ShaderNodeMath'); fmix.operation = 'MULTIPLY'; ft.links.new(fwv.outputs['Fac'], fmix.inputs[0]); ft.links.new(ffade.outputs['Result'], fmix.inputs[1])
    fem = ft.nodes.new('ShaderNodeMath'); fem.operation = 'MULTIPLY'; fem.inputs[1].default_value = 1.6; ft.links.new(fmix.outputs[0], fem.inputs[0])
    fal = ft.nodes.new('ShaderNodeMath'); fal.operation = 'ADD'; fal.inputs[1].default_value = .25; ft.links.new(fmix.outputs[0], fal.inputs[0])
    fal2 = ft.nodes.new('ShaderNodeMath'); fal2.operation = 'MULTIPLY'; ft.links.new(fal.outputs[0], fal2.inputs[0]); ft.links.new(ffade.outputs['Result'], fal2.inputs[1]); ft.links.new(fal2.outputs[0], fbs.inputs['Alpha'])
    fbs.inputs['Emission Color'].default_value = C('#e8f7ff'); ft.links.new(fem.outputs[0], fbs.inputs['Emission Strength'])
    bm3 = bmesh.new(); uv = bm3.loops.layers.uv.new(); PERF = [(12.35, -.2), (12.8, -.6), (13.2, -1.6), (13.45, -3.4), (13.6, -6), (13.65, -9.5)]; XS = [-3.35 + 6.7 * i / 16 for i in range(17)]
    rows = [[bm3.verts.new(W(x * (1 + .02 * k), y, z + .15 * math.cos(x * .9))) for x in XS] for k, (z, y) in enumerate(PERF)]
    for k in range(len(PERF) - 1):
        for i in range(len(XS) - 1):
            f = bm3.faces.new((rows[k][i], rows[k][i + 1], rows[k + 1][i + 1], rows[k + 1][i]))
            for lp, (a, b) in zip(f.loops, ((i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1))): lp[uv].uv = (a / (len(XS) - 1), b / (len(PERF) - 1))
    me3 = bpy.data.meshes.new('cascada'); bm3.to_mesh(me3); bm3.free(); o3 = bpy.data.objects.new('cascada', me3); sc.collection.objects.link(o3); me3.materials.append(M_FALL)
    M_FOAM = mat('espuma', '#eaf7ff', .6, '#ffffff', .6)
    for i in range(16):
        x = rnd.uniform(-3.2, 3.2); bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=rnd.uniform(.12, .28), location=W(x, -.22, 12.25 + rnd.uniform(-.1, .12))); o = bpy.context.object; o.scale = (1.6, 1, .35); o.data.materials.append(M_FOAM); bpy.ops.object.shade_smooth()
    # pinos (troncos y 4 conos de copa), acantilados con hierba arriba, matas y flores
    M_TRUNK = mat('tronco', '#4a3426', .9); M_PINE = [mat('pino1', '#2d5a2c', .85), mat('pino2', '#3a6b33', .85), mat('pino3', '#24502a', .85)]
    def pino(x, z, h):
        y0 = altura(x, z); bpy.ops.mesh.primitive_cylinder_add(vertices=7, radius=h * .045, depth=h * .3, location=W(x, y0 + h * .15, z)); bpy.context.object.data.materials.append(M_TRUNK)
        m = rnd.choice(M_PINE)
        for i in range(4):
            r = h * (.3 - .055 * i); bpy.ops.mesh.primitive_cone_add(vertices=9, radius1=r, radius2=r * .15, depth=h * .36, location=W(x, y0 + h * (.33 + .17 * i), z)); o = bpy.context.object
            jag(o, .08, -9); o.rotation_euler.z = rnd.uniform(0, math.tau); o.data.materials.append(m)
    def mata(x, z, s):
        y0 = altura(x, z)
        for k in range(3):
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=s * rnd.uniform(.55, .85), location=W(x + rnd.uniform(-s, s) * .6, y0 + s * .35, z + rnd.uniform(-s, s) * .5)); o = bpy.context.object
            for v in o.data.vertices: v.co *= 1 + .2 * noise.noise(v.co * 3.5)
            o.scale = (1, 1, .75); o.data.materials.append(M_PINE[k % 3]); bpy.ops.object.shade_smooth()
    def risco(x, z, w, h):
        y0 = altura(x, z); y = y0
        for j in range(3):
            hh = h * (.45 if j == 0 else .3); rr = w * (1 - .16 * j)
            bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=rr, depth=hh, location=W(x + rnd.uniform(-.3, .3), y + hh / 2, z + rnd.uniform(-.3, .3))); o = bpy.context.object; jag(o, .1, -9); o.data.materials.append(M_CLIFF); y += hh * .95
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=w * .66, depth=.12, location=W(x, y + .04, z)); o = bpy.context.object; jag(o, .08, -9); o.data.materials.append(M_GRASS2)
    for (x, z, w, h) in ((-13.6, -13.2, 1.9, 3.6), (-11.6, -14.6, 1.4, 2.4), (13.4, -12.6, 2.2, 4.4), (15.0, -10.4, 1.5, 2.8), (14.2, -14.5, 1.6, 3.2)): risco(x, z, w, h)
    for k in range(60):
        side = rnd.random()
        if side < .4: x, z = rnd.uniform(-15.5, 15.5), rnd.uniform(-16, -12.2)            # detrás de la banca del rival
        elif side < .8: x, z = rnd.choice((-1, 1)) * rnd.uniform(12.8, 15.8), rnd.uniform(-11, 4)  # a los lados, por fuera de los ríos
        else: x, z = rnd.choice((-1, 1)) * rnd.uniform(12.2, 14.6), rnd.uniform(4, 8)
        if not dentro(x * 1.05, z * 1.03) or rio_d(x, z) < 1.7 or any(math.hypot(x - a, z - b) < c + .6 for (a, b, c, _) in ((-13.6, -13.2, 1.9, 0), (13.4, -12.6, 2.2, 0), (15.0, -10.4, 1.5, 0), (14.2, -14.5, 1.6, 0), (-11.6, -14.6, 1.4, 0))): continue
        pino(x, z, rnd.uniform(2.0, 3.6))
    for k in range(34):  # matas junto a la plataforma y entre los ríos (bajas: no tapan el campo)
        x = rnd.choice((-1, 1)) * rnd.uniform(9.9, 10.1 if k % 3 else 13.5); z = rnd.uniform(-11, 9.5)
        if rio_d(x, z) < 1.5 or POZA(x, z) or not dentro(x, z): continue
        mata(x, z, rnd.uniform(.35, .6))
    M_BOUL = mat('canto', '#7a7266', .85)
    for k in range(26):
        x = rnd.choice((-1, 1)) * rnd.uniform(10, 15.5); z = rnd.uniform(-14, 9)
        if rio_d(x, z) < 1.1 or not dentro(x, z): continue
        r = rnd.uniform(.18, .5); bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r, location=W(x, altura(x, z) + r * .25, z)); o = bpy.context.object; jag(o, .2, -9); o.scale = (1, rnd.uniform(.7, 1), .6); o.data.materials.append(M_BOUL)
    M_FLOR = [mat('flor_naranja', '#f08a3a', .6), mat('flor_lila', '#a585e0', .6), mat('flor_blanca', '#f2efe6', .6)]
    for k in range(140):
        x = rnd.uniform(-14, 14); z = rnd.uniform(-14, 11.5)
        if (abs(x) < 9.95 and -9.6 < z < 7.75) or rio_d(x, z) < 1.25 or POZA(x, z) or not dentro(x, z): continue
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=rnd.uniform(.05, .09), location=W(x, altura(x, z) + .05, z)); bpy.context.object.data.materials.append(rnd.choice(M_FLOR))
    # braseros de piedra en las 4 esquinas, con fuego y su luz
    M_BRZ = mat('brasero', '#9a9488', .8); M_BRZD = mat('brasero_oscuro', '#6d685f', .8); M_FIRE = mat('fuego', '#ffb347', .5, '#ff7a1a', 12); M_FIRE2 = mat('fuego2', '#fff0a0', .5, '#ffd35a', 18)
    for (bx, bz) in ((-7.75, 6.75), (7.75, 6.75), MIR(-7.75, 6.75), MIR(7.75, 6.75)):
        box('brasero', bx - .42, bx + .42, bz - .42, bz + .42, -.03, .55, M_BRZ, .05); box('brasero2', bx - .5, bx + .5, bz - .5, bz + .5, .55, .72, M_BRZD, .05)
        for (r, d, m, dy) in ((.26, .55, M_FIRE, .95), (.14, .42, M_FIRE2, .93)):
            bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=r, radius2=0, depth=d, location=W(bx, dy, bz)); o = bpy.context.object; jag(o, .15, -9); o.data.materials.append(m)
        bpy.ops.object.light_add(type='POINT', location=W(bx, 1.25, bz)); lt = bpy.context.object; lt.data.color = lin(hexc('#ff9a4a')); lt.data.energy = 60; lt.data.shadow_soft_size = .3
if TEMA == 'cascada': cascada()

# ---------- pedestales con el trofeo de los aumentos: idénticos a los del coliseo (solo el aro del pedestal toma el color del tipo) ----------
TX, TZT, TH, TS = -6.063, -1.426, .14, .56
M_PED = mat('pedestal', '#2a2833', .7); M_PEDT = mat('pedestal_cara', '#3a3747', .6); M_PEDG = mat('pedestal_brillo', '#120f18', .5, T['brillo'], 2.5)
def pmat(name, col, rough, metal=0.0, emit=None, estr=0.0, coat=0.0):
    m = mat(name, col, rough, emit, estr, metal); b = m.node_tree.nodes['Principled BSDF']
    if coat: b.inputs['Coat Weight'].default_value = coat
    return m
M_NAVY = pmat('trofeo_base', '#262a66', .45, coat=.3); M_NAVYT = pmat('trofeo_base_cara', '#343a86', .45, coat=.3); M_TEAL = pmat('trofeo_turquesa', '#3fb3a8', .4, coat=.3)
M_GOLD = pmat('trofeo_oro', '#e2b85c', .28, .85); M_STEM = pmat('trofeo_tallo', '#3e63b4', .38, coat=.4)
M_ORB = pmat('trofeo_esfera', '#6a2bb8', .42, emit='#2c0d58', estr=.25, coat=.25); M_MOON = pmat('trofeo_luna', '#efe4c2', .5)
M_GEM = pmat('trofeo_gema', '#f3a2bd', .2, emit='#ff8fbf', estr=.5, coat=.6)
M_WING = pmat('trofeo_ala', '#b9a3ea', .45, emit='#6c52b8', estr=.2); M_WING.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = .9
def prism(r0, r1, y0, y1, m, n=8, bev=.012):
    bpy.ops.mesh.primitive_cone_add(vertices=n, radius1=r0, radius2=r1, depth=y1 - y0, location=(0, 0, (y0 + y1) / 2)); o = bpy.context.object; o.rotation_euler.z = math.pi / n; o.data.materials.append(m)
    if bev: bv = o.modifiers.new('bisel', 'BEVEL'); bv.width = bev; bv.segments = 3
    if n > 12: bpy.ops.object.shade_smooth()
    return o
def build_trofeo(face):
    parts = []
    add = lambda o: parts.append(o) or o
    add(prism(.5, .5, 0, .2, M_NAVY)); add(prism(.505, .505, .2, .215, M_GOLD, bev=0))
    add(prism(.47, .45, .215, .27, M_NAVYT)); add(prism(.43, .41, .27, .36, M_TEAL)); add(prism(.415, .415, .36, .372, M_GOLD, bev=0))
    add(prism(.36, .33, .372, .44, M_NAVY))
    add(prism(.15, .1, .44, 1.08, M_STEM, n=40, bev=0))
    bpy.ops.mesh.primitive_torus_add(major_radius=.12, minor_radius=.03, location=(0, 0, 1.08)); add(bpy.context.object).data.materials.append(M_GOLD); bpy.ops.object.shade_smooth()
    add(prism(.1, .2, 1.08, 1.2, M_STEM, n=40, bev=0))
    oz = 1.62; bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=.46, location=(0, 0, oz)); add(bpy.context.object).data.materials.append(M_ORB); bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_circle_add(vertices=8, radius=.2, fill_type='NGON', location=(0, 0, 0)); st = add(bpy.context.object)
    for i, v in enumerate(st.data.vertices): v.co *= 1.0 if i % 2 == 0 else .26
    so = st.modifiers.new('grosor', 'SOLIDIFY'); so.thickness = .025; st.data.materials.append(M_GOLD)
    d = Vector((0, -math.cos(math.radians(15)), math.sin(math.radians(15)))).normalized(); st.location = Vector((0, 0, oz)) + d * .46; st.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=.075, location=(.27 * face, -.27, oz + .23)); add(bpy.context.object).data.materials.append(M_MOON); bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=.075, radius2=0, depth=.17, location=(0, 0, oz + .55)); add(bpy.context.object).data.materials.append(M_GEM)
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=.075, radius2=0, depth=.08, location=(0, 0, oz + .43)); o = add(bpy.context.object); o.rotation_euler.x = math.pi; o.data.materials.append(M_GEM)
    bpy.ops.mesh.primitive_torus_add(major_radius=.6, minor_radius=.018, major_segments=96, location=(0, 0, oz + .02)); o = add(bpy.context.object); o.rotation_euler = (math.radians(80), math.radians(-48 * face), math.radians(18 * face)); o.data.materials.append(M_GOLD); bpy.ops.object.shade_smooth()
    for sx in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=24, radius=1, location=(0, 0, 0)); w = add(bpy.context.object)
        w.scale = (.06, .19, .62); bpy.ops.object.transform_apply(scale=True)
        for v in w.data.vertices:
            t = (v.co.z + .62) / 1.24
            v.co.y *= 1 - .75 * t ** 3
            v.co.x += sx * .3 * t ** 2
        w.location = (sx * .36, .2, oz + .2); w.rotation_euler = (math.radians(-10), math.radians(-12 * sx), math.radians(-14 * sx)); w.data.materials.append(M_WING); bpy.ops.object.shade_smooth()
    return parts
def trofeo(cx, cz, face):
    for (r, y0, y1, m) in ((.54, 0, .05, M_PEDG), (.51, 0, .09, M_PED), (.43, .09, TH, M_PEDT)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=r, depth=y1 - y0, location=W(cx, (y0 + y1) / 2, cz)); o = bpy.context.object; o.data.materials.append(m)
        bv = o.modifiers.new('bisel', 'BEVEL'); bv.width = .025; bv.segments = 4; bpy.ops.object.shade_smooth()
    root = bpy.data.objects.new('trofeo', None); sc.collection.objects.link(root)
    for o in build_trofeo(face): o.parent = root
    root.scale = (TS, TS, TS); root.location = W(cx, TH, cz)
    bpy.ops.object.light_add(type='POINT', location=W(cx, .4, cz + .4)); lt = bpy.context.object; lt.data.color = lin(hexc('#b07bff')); lt.data.energy = 14; lt.data.shadow_soft_size = .4
    bpy.ops.object.light_add(type='POINT', location=W(cx + .5, 1.6, cz + 1.4)); lt = bpy.context.object; lt.data.color = lin(hexc('#fff3e0')); lt.data.energy = 12; lt.data.shadow_soft_size = .5
trofeo(TX, TZT, 1); trofeo(*MIR(TX, TZT), -1)
TROFEO_TOP = TH + 2.38 * TS

# ---------- cielo de su tipo: nebulosa de 4 tonos con vetas y estrellas (las del fondo solo se ven, no iluminan) ----------
wd = bpy.data.worlds.new('cielo'); sc.world = wd; wd.use_nodes = True; wn = wd.node_tree; bgn = wn.nodes['Background']; WN = wn.nodes.new; WL = wn.links.new
wt = WN('ShaderNodeTexCoord')
neb = WN('ShaderNodeTexNoise'); neb.inputs['Scale'].default_value = 1.6; neb.inputs['Detail'].default_value = 8; neb.inputs['Roughness'].default_value = .62; WL(wt.outputs['Generated'], neb.inputs['Vector'])
neb2 = WN('ShaderNodeTexNoise'); neb2.inputs['Scale'].default_value = 3.2; neb2.inputs['Detail'].default_value = 6; WL(wt.outputs['Generated'], neb2.inputs['Vector'])
k0, k1, k2, k3 = T['cielo']
nr = WN('ShaderNodeValToRGB'); E = nr.color_ramp.elements; E[0].position = .38; E[0].color = C(k0); E[1].position = .8; E[1].color = C(k3)
nr.color_ramp.elements.new(.58).color = C(k1); nr.color_ramp.elements.new(.7).color = C(k2)
WL(neb.outputs['Fac'], nr.inputs['Fac'])
nr2 = WN('ShaderNodeValToRGB'); nr2.color_ramp.elements[0].position = .55; nr2.color_ramp.elements[0].color = (0, 0, 0, 1); nr2.color_ramp.elements[1].position = .85; nr2.color_ramp.elements[1].color = C(T['veta']); WL(neb2.outputs['Fac'], nr2.inputs['Fac'])
addc = WN('ShaderNodeMix'); addc.data_type = 'RGBA'; addc.blend_type = 'ADD'; addc.inputs['Factor'].default_value = .45; WL(nr.outputs['Color'], addc.inputs[6]); WL(nr2.outputs['Color'], addc.inputs[7])
st = WN('ShaderNodeTexVoronoi'); st.inputs['Scale'].default_value = 180; WL(wt.outputs['Generated'], st.inputs['Vector'])
sr = WN('ShaderNodeMapRange'); sr.inputs['From Min'].default_value = 0; sr.inputs['From Max'].default_value = .055; sr.inputs['To Min'].default_value = 1; sr.inputs['To Max'].default_value = 0; WL(st.outputs['Distance'], sr.inputs['Value'])
sp = WN('ShaderNodeMath'); sp.operation = 'POWER'; sp.inputs[1].default_value = 3; WL(sr.outputs['Result'], sp.inputs[0])
sel = WN('ShaderNodeSeparateColor'); WL(st.outputs['Color'], sel.inputs['Color'])
sk = WN('ShaderNodeMath'); sk.operation = 'MULTIPLY'; WL(sp.outputs[0], sk.inputs[0]); WL(sel.outputs['Red'], sk.inputs[1])
skw = WN('ShaderNodeMath'); skw.operation = 'MULTIPLY'; skw.inputs[1].default_value = 0 if TEMA == 'cascada' else .55 if TEMA in ('planta', 'roca') else 1; WL(sk.outputs[0], skw.inputs[0])  # menos estrellas en los cielos «de día»
sw = WN('ShaderNodeMix'); sw.data_type = 'RGBA'; sw.blend_type = 'ADD'; WL(skw.outputs[0], sw.inputs['Factor']); WL(addc.outputs[2], sw.inputs[6]); sw.inputs[7].default_value = (3.2, 3.2, 3.6, 1)
WL(sw.outputs[2], bgn.inputs['Color']); bgn.inputs['Strength'].default_value = 1.0
lp = WN('ShaderNodeLightPath'); mixw = WN('ShaderNodeMixShader'); dark = WN('ShaderNodeBackground'); dark.inputs['Color'].default_value = C(T['amb']); dark.inputs['Strength'].default_value = .6
WL(lp.outputs['Is Camera Ray'], mixw.inputs['Fac']); WL(dark.outputs['Background'], mixw.inputs[1]); WL(bgn.outputs['Background'], mixw.inputs[2]); WL(mixw.outputs['Shader'], wn.nodes['World Output'].inputs['Surface'])
bpy.ops.object.light_add(type='SUN', rotation=(math.radians(-115), 0, math.radians(20))); rim = bpy.context.object; rim.data.energy = 2.2; rim.data.color = lin(hexc(T['sol']))
bpy.ops.object.light_add(type='AREA', location=W(0, -9, 20)); fr = bpy.context.object; fr.rotation_euler = (math.radians(-60), 0, 0); fr.data.energy = 3500; fr.data.size = 25; fr.data.color = lin(hexc(T['frente']))
bpy.ops.object.light_add(type='AREA', location=W(0, 16, -1)); ar = bpy.context.object; ar.data.energy = 2500; ar.data.size = 18; ar.data.color = lin(hexc(T['arriba']))
bpy.ops.object.light_add(type='SUN', rotation=(math.radians(35), math.radians(-25), math.radians(-35))); sn = bpy.context.object; sn.data.energy = 1.3; sn.data.angle = math.radians(20)

# ---------- cámara del juego (la misma del coliseo) ----------
e = math.radians(EL)
bpy.ops.object.camera_add(location=W(0, math.sin(e) * DIST, TZ + math.cos(e) * DIST)); cam = bpy.context.object; sc.camera = cam
cam.rotation_euler = (math.pi / 2 - e, 0, 0); cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = 2 * math.atan(MARGEN * math.tan(math.radians(15)))
sc.render.resolution_x, sc.render.resolution_y = WR, HR
sc.render.engine = 'CYCLES'; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
if GPU:  # HIP (AMD), CUDA u OptiX si hay; si no, CPU
    try:
        pr = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('HIP', 'OPTIX', 'CUDA', 'METAL', 'ONEAPI'):
            try: pr.compute_device_type = kind
            except Exception: continue
            pr.get_devices(); devs = [d for d in pr.devices if d.type == kind]
            if devs:
                for d in pr.devices: d.use = d.type == kind
                sc.cycles.device = 'GPU'; print('GPU', kind, [d.name for d in devs]); break
    except Exception as ex: print('sin GPU', ex)
sc.view_settings.view_transform = 'Standard'; sc.render.image_settings.file_format = 'PNG'; sc.render.filepath = OUT
bpy.context.view_layer.update()
px = lambda x, y, z: (lambda v: [round(v.x * WR, 1), round((1 - v.y) * HR, 1)])(world_to_camera_view(sc, cam, Vector(W(x, y, z))))
out = {'w': WR, 'h': HR, 'back': [px(FX0, 0, FZ0), px(FX1, 0, FZ0)], 'bench': [px(BENCH_X + BENCH_DX * i, TOP, BENCH_Z) for i in range(9)], 'holes': [px(x, 0, z) for x, z in HOLES], 'holes2': [px(x, 0, z) for x, z in HOLES2], 'totemTopY': round(TROFEO_TOP, 3)}
json.dump(out, open(bpy.path.abspath(OUT).rsplit('.', 1)[0] + '.json', 'w'))
bpy.ops.render.render(write_still=True); print('PUNTOS', json.dumps(out))
