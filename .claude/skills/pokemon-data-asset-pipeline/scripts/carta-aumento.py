# Marco de las cartas de aumento (arte propio que sigue de cerca la composición de las cartas de TFT): cuerpo de pergamino
# violeta con orilla en relieve y labio superior rocoso; medallón oscuro con remolino (azul petróleo arriba, púrpura abajo);
# aura de pinceladas en remolino (azul junto al medallón, violeta en medio y orilla tornasolada granulada); racimo de
# cristales gruesos con punta cortada a la izquierda y unos pocos a la derecha. Colores pintados (emisión, sin luces) salvo
# el facetado de los cristales, que sale de la orientación de cada cara. Cámara ortográfica de frente: imagen 2D.
# Todas las posiciones están en píxeles de una carta de referencia de 474×627 (F las pasa a unidades: 1 unidad = 100 px).
# Uso: blender -b --python carta-aumento.py -- <salida.png> [variante=P|G|S] [escala=2] [muestras=48]
# Para el juego (public/img/aug-carta-<P|G|S>.webp, ~48 KB): renderizar con escala=2 muestras=96 y reducir a 720×1040 con sharp:
#   sharp(png).resize(720,1040,{kernel:'lanczos3'}).webp({quality:80,alphaQuality:90,effort:6})
# El CSS de .augCard3 (index.html) coloca el icono, el título y la descripción con porcentajes medidos sobre este encuadre.
import bpy, bmesh, sys, math, random
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0]; OPC = dict(a.split('=', 1) for a in argv[1:] if '=' in a)
VAR = OPC.get('variante', 'P'); ESC = float(OPC.get('escala', 2)); MUESTRAS = int(OPC.get('muestras', 48))
W, H = 7.2, 10.4
hexc = lambda h: tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
lin = lambda h: tuple(c ** 2.2 for c in hexc(h)) + (1,)
K = 1.756 / 100
def F(x, y): return ((x - 258) * K, (331 - y) * K)
def Fs(pts): return [F(*p) for p in pts]

PAL = {
 'P': dict(cuerpo=[(300, '#4A2CC2'), (335, '#4428B6'), (362, '#361D92'), (385, '#2A187C'), (410, '#1F156A'), (455, '#18115A'), (510, '#120C44'), (570, '#130C46'), (600, '#1A1058')],
           orilla=('#7E68D0', '#4A34A2', '#2C1C78'), orilla_luz='#A688EE', labio=('#E6D2B8', '#46303F', '#4A2A8E', '#9A70E4', '#C4A0FF', '#5A34C8'), cresta='#7C4AD8',
           aura_arr=[(0, '#532FB5'), (.25, '#6A2ED5'), (.5, '#5426BE'), (.6, '#3D4FA9'), (.75, '#4340AB'), (.88, '#5439B4')], aura_der=[(0, '#3A3890'), (.12, '#4A36B0'), (.3, '#6234D0'), (.5, '#5C39C8'), (.62, '#4A3CB0'), (.8, '#4455B6'), (.88, '#4455B6')], acero='#2C5D98', franja='#4A50A0',
           aura_baja='#3256A8', holo=('#3FC8F0', '#5AE0C8', '#B4EE7A', '#F4E27A', '#F59AD8', '#7AA8FF'),
           cristal=('#2C6A9E', '#3C96BE', '#4FB8CF', '#6ECAD8', '#A0E2EA', '#E6FBFF'), tornasol=('#6CD6B2', '#D2EC86', '#F4B0E0', '#9CC8FF', '#78E8D4'),
           medallon=('#1D4058', '#162E44', '#1E2343', '#2C1440'), oro='#8A8060', linea='#1E3A70'),
 'G': dict(cuerpo=[(300, '#B67A22'), (335, '#A46C1C'), (362, '#875414'), (385, '#6E440E'), (410, '#5A360A'), (455, '#4A2C08'), (510, '#3A2206'), (570, '#3A2206'), (600, '#4A2C0A')],
           orilla=('#E6BE6C', '#A87A26', '#6A4610'), orilla_luz='#F6DC9A', labio=('#FFF2D0', '#4A3016', '#7A5014', '#D8A848', '#FFE6A0', '#B07A20'), cresta='#C8902E',
           aura_arr=[(0, '#A87420'), (.25, '#C88E28'), (.5, '#A87A22'), (.6, '#7A5A1A'), (.75, '#8A6A20'), (.88, '#A87A22')], aura_der=[(0, '#7A5A1A'), (.2, '#7A5A1A'), (.32, '#B07A22'), (.45, '#9A6A1C'), (.55, '#8A6A20'), (.72, '#7A5A1A'), (.88, '#8A6A20')], acero='#6A4A14', franja='#8A6A20',
           aura_baja='#7A5A1A', holo=('#FFF0B0', '#FFE08A', '#FFFFFF', '#F6C860', '#FFD8A0', '#F2E6B0'),
           cristal=('#7A4E10', '#B07A1E', '#E0A83E', '#F2C866', '#FFE6A8', '#FFFBEA'), tornasol=('#FFF0C0', '#FFE08A', '#FFFFFF', '#FFD27A', '#FFF6D8'),
           medallon=('#2A2210', '#1C160C', '#141008', '#20140A'), oro='#C8A050', linea='#5A3A08'),
 'S': dict(cuerpo=[(300, '#6A7EA8'), (335, '#60739C'), (362, '#4E5E84'), (385, '#404E70'), (410, '#36425E'), (455, '#2C3650'), (510, '#222A40'), (570, '#222A40'), (600, '#2A3450')],
           orilla=('#C2CEE4', '#7486AA', '#3E4C6C'), orilla_luz='#DCE6F4', labio=('#F6F8FC', '#2A3040', '#46546E', '#A8B8D6', '#D8E2F2', '#7486AA'), cresta='#8A9CC0',
           aura_arr=[(0, '#62749A'), (.25, '#7486AA'), (.5, '#62749A'), (.6, '#50628A'), (.75, '#566886'), (.88, '#62749A')], aura_der=[(0, '#46546E'), (.2, '#46546E'), (.32, '#6A7EA2'), (.45, '#5A6C90'), (.55, '#50628A'), (.72, '#46546E'), (.88, '#50628A')], acero='#3A4660', franja='#50628A',
           aura_baja='#46546E', holo=('#F2F6FF', '#D6E2F4', '#FFFFFF', '#B8CAE6', '#E6EEFA', '#C6D4EA'),
           cristal=('#46546E', '#6A7EA2', '#9AAECE', '#BCCAE2', '#DCE6F4', '#FAFCFF'), tornasol=('#FFFFFF', '#E6EEFA', '#C8D6EC', '#F0F4FF', '#D6E2F4'),
           medallon=('#1E2A3A', '#141E2A', '#10161F', '#161A26'), oro='#A8B4C8', linea='#2A3450'),
}[VAR]

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.samples = MUESTRAS; sc.cycles.use_denoising = False
try:
    cp = bpy.context.preferences.addons['cycles'].preferences; cp.compute_device_type = 'HIP'; cp.get_devices()
    for d in cp.devices: d.use = d.type == 'HIP'
    sc.cycles.device = 'GPU'
except Exception as e: print('CPU:', e)
sc.render.resolution_x = int(W * 100 * ESC); sc.render.resolution_y = int(H * 100 * ESC); sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.filepath = OUT
sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('mundo'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = 0
bpy.ops.object.camera_add(location=(0, 0, 30)); cam = bpy.context.object; sc.camera = cam; cam.data.type = 'ORTHO'; cam.data.ortho_scale = H

# ---------- utilidades de nodos ----------
def N(nt, tipo, **kw):
    n = nt.nodes.new(tipo)
    for k, v in kw.items(): setattr(n, k, v)
    return n
def S(col, nombre, tipo='RGBA'): return next(s for s in col if s.name == nombre and s.type == tipo)   # huecos del nodo Mezclar
def L(nt, a, b): nt.links.new(a, b)
def poner(nt, sock, v):
    if isinstance(v, (int, float, tuple)): sock.default_value = v
    else: L(nt, v, sock)
def mezcla(nt, modo, fac, a, b):
    m = N(nt, 'ShaderNodeMix'); m.data_type = 'RGBA'; m.blend_type = modo
    poner(nt, m.inputs['Factor'], fac); poner(nt, S(m.inputs, 'A'), a); poner(nt, S(m.inputs, 'B'), b)
    return S(m.outputs, 'Result')
def rampa(nt, paradas, fac, interp='LINEAR'):
    # paradas: [(posición, '#color'), …]
    cr = N(nt, 'ShaderNodeValToRGB'); r = cr.color_ramp; r.interpolation = interp
    r.elements[0].position = paradas[0][0]; r.elements[0].color = lin(paradas[0][1]); r.elements[1].position = paradas[-1][0]; r.elements[1].color = lin(paradas[-1][1])
    for p, c in paradas[1:-1]: e = r.elements.new(p); e.color = lin(c)
    L(nt, fac, cr.inputs['Fac']); return cr.outputs['Color']
def reparto(cols): return [(i / (len(cols) - 1), c) for i, c in enumerate(cols)]
def M(nt, op, a, b=None, c=None):
    n = N(nt, 'ShaderNodeMath', operation=op)
    for i, v in enumerate((a, b, c)):
        if v is not None: poner(nt, n.inputs[i], v)
    return n.outputs[0]
def rango(nt, v, a, b, c=0.0, d=1.0, tipo='LINEAR'):
    n = N(nt, 'ShaderNodeMapRange'); n.interpolation_type = tipo
    for nombre, x in (('From Min', a), ('From Max', b), ('To Min', c), ('To Max', d)): poner(nt, n.inputs[nombre], x)
    L(nt, v, n.inputs['Value']); return n.outputs[0]
def ruido(nt, vec, escala, detalle=4, dist=0.0, rough=.5):
    n = N(nt, 'ShaderNodeTexNoise'); n.inputs['Scale'].default_value = escala; n.inputs['Detail'].default_value = detalle
    n.inputs['Distortion'].default_value = dist; n.inputs['Roughness'].default_value = rough; L(nt, vec, n.inputs['Vector']); return n.outputs['Fac']
def vec3(nt, x, y, z=0.0):
    n = N(nt, 'ShaderNodeCombineXYZ')
    for i, v in enumerate((x, y, z)): poner(nt, n.inputs[i], v)
    return n.outputs[0]
def pintado(nombre, construir, con_alfa=False):
    # color pintado: emisión pura (los colores salen tal cual); construir(nt, ent) devuelve (color, alfa)
    m = bpy.data.materials.new(nombre); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = N(nt, 'ShaderNodeOutputMaterial'); em = N(nt, 'ShaderNodeEmission'); em.inputs['Strength'].default_value = 1
    tc = N(nt, 'ShaderNodeTexCoord'); sep = N(nt, 'ShaderNodeSeparateXYZ'); L(nt, tc.outputs['Object'], sep.inputs[0])
    uv = N(nt, 'ShaderNodeSeparateXYZ'); L(nt, tc.outputs['UV'], uv.inputs[0])
    ent = dict(obj=tc.outputs['Object'], x=sep.outputs['X'], y=sep.outputs['Y'], u=uv.outputs['X'], v=uv.outputs['Y'])
    col, a = construir(nt, ent)
    L(nt, col, em.inputs['Color'])
    if not con_alfa: L(nt, em.outputs[0], out.inputs['Surface'])
    else:
        tr = N(nt, 'ShaderNodeBsdfTransparent'); mx = N(nt, 'ShaderNodeMixShader'); L(nt, a, mx.inputs['Fac'])
        L(nt, tr.outputs[0], mx.inputs[1]); L(nt, em.outputs[0], mx.inputs[2]); L(nt, mx.outputs[0], out.inputs['Surface'])
    return m
def liso(col): return pintado('liso' + col, lambda nt, e: (rampa(nt, [(0, col), (1, col)], e['x']), None))
def objeto(nombre, bm, mat=None, col=None):
    me = bpy.data.meshes.new(nombre); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new(nombre, me); (col or sc.collection).objects.link(o)
    if mat: me.materials.append(mat)
    return o
def losa(nombre, pts, z, mat):
    bm = bmesh.new(); vs = [bm.verts.new((x, y, z)) for x, y in pts]; f = bm.faces.new(vs); f.normal_update()
    if f.normal.z < 0: f.normal_flip()
    bmesh.ops.triangulate(bm, faces=[f])
    return objeto(nombre, bm, mat)
def tira(nombre, borde, otro, z, mat):
    # banda entre dos polilíneas con UV: u a lo largo, v de 0 (borde) a 1 (otro)
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); A = [bm.verts.new((x, y, z)) for x, y in borde]; B = [bm.verts.new((x, y, z)) for x, y in otro]
    n = len(A)
    for i in range(n - 1):
        f = bm.faces.new((A[i], A[i + 1], B[i + 1], B[i]))
        for lp, (u, v) in zip(f.loops, ((i / (n - 1), 0), ((i + 1) / (n - 1), 0), ((i + 1) / (n - 1), 1), (i / (n - 1), 1))): lp[uvl].uv = (u, v)
    return objeto(nombre, bm, mat)
def rasgar(pts, amp, semilla, paso=.035, cerrado=True):
    # subdivide la polilínea y la rasga un poco (borde pintado a mano)
    r = random.Random(semilla); out = []; n_ = len(pts) if cerrado else len(pts) - 1
    for i in range(n_):
        a, b = Vector(pts[i]), Vector(pts[(i + 1) % len(pts)]); n = max(1, int((b - a).length / paso)); nrm = Vector((-(b - a).y, (b - a).x)).normalized()
        for j in range(n):
            p = a.lerp(b, j / n); d = (math.sin((i * 7 + j) * 1.3 + semilla) * .5 + r.uniform(-.5, .5)) * amp
            out.append((p.x + nrm.x * d, p.y + nrm.y * d))
    if not cerrado: out.append(pts[-1])
    return out
def hacia_dentro(pts, dist):
    # desplaza cada punto hacia el interior (contorno en sentido horario visto de frente); dist(punto) en unidades
    n = len(pts); out = []
    for i in range(n):
        a, b, c = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[(i + 1) % n])
        t = (c - a).normalized(); nrm = Vector((t.y, -t.x))      # hacia dentro: a la derecha del avance (sentido horario, y hacia arriba)
        out.append(tuple(b + nrm * dist(b)))
    return out

# ---------- cuerpo: contorno medido en la referencia (sentido horario desde arriba a la izquierda) ----------
TOPE_IZQ = [(88, 299), (96, 292), (106, 287), (116, 285), (128, 287), (140, 289), (152, 291), (170, 295), (200, 298)]
TOPE_DER = [(310, 298), (330, 281), (345, 276), (360, 268), (375, 259), (390, 252), (405, 245), (418, 243), (424, 250)]
LADO = [(422, 268), (415, 282), (412, 300), (414, 318), (424, 328), (438, 336), (431, 346), (428, 358), (425, 368), (421, 378), (414, 386), (412, 393), (416, 402),
        (417, 414), (413, 428), (410, 445), (410, 480), (413, 496), (417, 508), (421, 518), (421, 534), (418, 546), (413, 558), (408, 569), (402, 577), (392, 583),
        (379, 589), (365, 594), (344, 600), (294, 606), (261, 612), (226, 618), (213, 618), (204, 612), (196, 606), (182, 600), (160, 595), (124, 589), (111, 583),
        (100, 575), (92, 566), (86, 554), (83, 545), (85, 535), (88, 525), (92, 515), (93, 480), (92, 450), (90, 433), (88, 422), (89, 414), (85, 407), (86, 399),
        (91, 393), (94, 384), (95, 375), (91, 362), (86, 350), (82, 342), (80, 331), (84, 322), (89, 315), (89, 306)]
CONTORNO = rasgar(Fs(TOPE_IZQ + TOPE_DER + LADO), .012, 7)
def grosor_orilla(p):  # ancho de la orilla en relieve: más ancha abajo, nada en el labio de arriba
    x, y = p; yb = F(0, 560)[1]; yt = F(0, 300)[1]
    if y > yt: return .02
    base = .13 if x < -1.5 else .11
    return base + (.08 if y < yb else 0) * min(1, (yb - y) / .4 + .3)
INTERIOR = hacia_dentro(CONTORNO, grosor_orilla)
def cons_cuerpo(nt, e):
    yy = M(nt, 'MULTIPLY_ADD', e['y'], -1 / K, 331)           # vuelve a la y de la referencia
    g = rampa(nt, [((y - 300) / 300, c) for y, c in PAL['cuerpo']], rango(nt, yy, 300, 600))
    nu = ruido(nt, e['obj'], 1.3, 5, .4)
    g = mezcla(nt, 'OVERLAY', .12, g, rampa(nt, [(0, '#000000'), (1, '#FFFFFF')], nu))
    # algo más oscuro a la derecha en la mitad de abajo, más claro arriba a la derecha
    xx = M(nt, 'MULTIPLY_ADD', e['x'], 1 / K, 258)
    der = M(nt, 'MULTIPLY', rango(nt, xx, 250, 410, 0, .3), rango(nt, yy, 380, 450, 0, 1))
    g = mezcla(nt, 'MULTIPLY', der, g, lin('#5A4C9A'))
    arr = M(nt, 'MULTIPLY', rango(nt, xx, 300, 410, 0, .25), rango(nt, yy, 330, 300, 0, 1))
    g = mezcla(nt, 'SCREEN', arr, g, lin(PAL['labio'][4]))
    return g, None
def cons_orilla(nt, e):
    # orilla en relieve: filo claro por fuera, banda violeta y sombra hacia el interior; más clara arriba a la derecha
    o = PAL['orilla']; c = rampa(nt, [(0, o[0]), (.18, o[0]), (.32, o[1]), (.8, o[1]), (1, o[2])], e['v'])
    yy = M(nt, 'MULTIPLY_ADD', e['y'], -1 / K, 331); xx = M(nt, 'MULTIPLY_ADD', e['x'], 1 / K, 258)
    luz = M(nt, 'MULTIPLY', rango(nt, xx, 330, 420), rango(nt, yy, 360, 280))
    c = mezcla(nt, 'MIX', M(nt, 'MULTIPLY', luz, .75), c, lin(PAL['orilla_luz']))
    nu = ruido(nt, vec3(nt, M(nt, 'MULTIPLY', e['u'], 60), e['v']), 1.5, 3)
    c = mezcla(nt, 'OVERLAY', .25, c, rampa(nt, [(0, '#000000'), (1, '#FFFFFF')], nu))
    return c, None
tira('orilla', CONTORNO + [CONTORNO[0]], INTERIOR + [INTERIOR[0]], .0, pintado('orilla', cons_orilla))
losa('cuerpo', INTERIOR, .0, pintado('cuerpo', cons_cuerpo))

# ---------- labio superior: banda parda, cresta lavanda y fundido al cuerpo (filo cálido solo a la izquierda) ----------
def cons_labio(calido_ok, losa_=False):
    def c_(nt, e):
        l = PAL['labio']; nu = ruido(nt, vec3(nt, M(nt, 'MULTIPLY', e['u'], 14), 0.0), 1, 2)
        v = M(nt, 'ADD', e['v'], M(nt, 'MULTIPLY', M(nt, 'SUBTRACT', nu, .5), .12))
        c = rampa(nt, [(0, l[1]), (.08, l[1]), (.14, PAL['cresta']), (.2, l[4]), (.27, l[3]), (.36, PAL['cresta']), (.85, PAL['cresta']), (1, l[5])] if losa_ else
                  [(0, l[1]), (.2, l[1]), (.3, l[2]), (.46, l[3]), (.56, l[4]), (.68, l[3]), (1, l[5])], v)
        if calido_ok:
            calido = M(nt, 'MULTIPLY', rango(nt, e['v'], .02, .1, .8, 0), rango(nt, ruido(nt, vec3(nt, M(nt, 'MULTIPLY', e['u'], 30), 2.0), 1, 1), .6, .68))
            c = mezcla(nt, 'MIX', calido, c, lin(l[0]))
        return c, rango(nt, e['v'], .8, 1, 1, 0)
    return c_
def labio(tramo, grosor, semilla, calido_ok, losa_=False):
    r = random.Random(semilla); arriba = rasgar(Fs(tramo), .012, semilla, .07, False)
    abajo = [(x, y - grosor(x) * r.uniform(.85, 1.1)) for x, y in arriba]
    return tira('labio', arriba, abajo, .02, pintado('labio' + str(semilla), cons_labio(calido_ok, losa_), True))
labio(TOPE_IZQ + [(232, 300), (262, 301)], lambda x: .3, 21, True)          # los dos labios se juntan bajo el medallón
labio([(252, 301), (282, 300)] + TOPE_DER + [(426, 262)], lambda x: .3 + .1 * max(0, min(1, (x - F(300, 0)[0]) / .5)) + .2 * max(0, min(1, (x - F(330, 0)[0]) / 1.2)), 23, False, True)

# ---------- aura de pinceladas en remolino ----------
CX, CY = F(255, 204); RM = 102 * K
def cons_aura(nt, e):
    r = N(nt, 'ShaderNodeVectorMath', operation='LENGTH'); L(nt, e['obj'], r.inputs[0]); r = r.outputs['Value']
    th = M(nt, 'ARCTAN2', e['y'], e['x']); gr = M(nt, 'MULTIPLY', th, 180 / math.pi)
    # radio exterior medido: ~150 arriba, ~166 en diagonal; la pincelada de arriba acaba en punta (171 a 54°) y
    # la de la derecha empieza por debajo de ella (133 a 53°), como un gancho
    base = M(nt, 'ADD', rango(nt, gr, 92, 60, 149, 168), rango(nt, M(nt, 'ABSOLUTE', M(nt, 'SUBTRACT', gr, 28)), 18, 0, 0, 8, 'SMOOTHSTEP'))
    A = rango(nt, gr, 68, 55, 0, 5); B = rango(nt, gr, 48, 55, 0, -32); s = M(nt, 'GREATER_THAN', gr, 55)
    mech = ruido(nt, vec3(nt, M(nt, 'MULTIPLY', th, 2.0), 0.0), 1.2, 2)
    rout = M(nt, 'MULTIPLY', M(nt, 'ADD', M(nt, 'ADD', base, M(nt, 'MULTIPLY_ADD', s, M(nt, 'SUBTRACT', A, B), B)), M(nt, 'MULTIPLY_ADD', mech, 8, -4)), K)
    t = rango(nt, r, RM, rout)
    # pinceladas: el radio relativo se ondula a lo largo del giro
    esp = M(nt, 'MULTIPLY_ADD', r, .6, th)
    trazo = ruido(nt, vec3(nt, M(nt, 'MULTIPLY', esp, 1.6), M(nt, 'MULTIPLY', r, 7.0)), 1.0, 4, .6, .55)
    tt = M(nt, 'ADD', t, M(nt, 'MULTIPLY', M(nt, 'SUBTRACT', trazo, .5), .18))
    # bandas medidas: arriba (45°-120°) violeta dentro y azul fuera; a la derecha (0°) azul violáceo, violeta y azul;
    # una pincelada azul acero junto al medallón hacia los 30°
    arr = rampa(nt, PAL['aura_arr'], tt); der = rampa(nt, PAL['aura_der'], tt)
    col = mezcla(nt, 'MIX', rango(nt, gr, 18, 48, 0, 1, 'SMOOTHSTEP'), der, arr)
    acero = M(nt, 'MULTIPLY', rango(nt, M(nt, 'ABSOLUTE', M(nt, 'SUBTRACT', gr, 28)), 6, 15, 1, 0, 'SMOOTHSTEP'), rango(nt, tt, .35, .45, 1, 0))
    col = mezcla(nt, 'MIX', acero, col, lin(PAL['acero']))
    veta = ruido(nt, vec3(nt, M(nt, 'MULTIPLY', esp, 3.2), M(nt, 'MULTIPLY', r, 16.0), 4.0), 1.0, 2, .3)
    col = mezcla(nt, 'MULTIPLY', rango(nt, veta, .56, .72, 0, .3), col, lin('#1A1450'))
    col = mezcla(nt, 'SCREEN', rango(nt, veta, .38, .26, 0, .18), col, lin(PAL['aura_arr'][1][1]))
    # abajo y a la izquierda el aura es azul acero
    baja = rango(nt, M(nt, 'SINE', th), .05, -.5, 0, .8, 'SMOOTHSTEP')
    col = mezcla(nt, 'MIX', baja, col, lin(PAL['aura_baja']))
    # orilla: franja tornasolada punteada (10 px arriba, ~32 px a la derecha) que se densifica hacia fuera
    ext = M(nt, 'DIVIDE', M(nt, 'SUBTRACT', rout, r), K)          # px de referencia hasta el borde
    wh = rango(nt, gr, 80, 35, 10, 26)
    dens = rango(nt, ext, wh, 3, 0, 1)
    grano = ruido(nt, e['obj'], 120, 1); grano2 = ruido(nt, vec3(nt, e['x'], e['y'], 7.0), 45, 1)
    hue = M(nt, 'FRACT', M(nt, 'ADD', M(nt, 'ADD', M(nt, 'DIVIDE', ext, 34), M(nt, 'MULTIPLY', th, .3)), M(nt, 'MULTIPLY', grano2, .5)))
    holo = rampa(nt, reparto(list(PAL['holo']) + [PAL['holo'][0]]), hue)
    umbral = M(nt, 'SUBTRACT', .6, M(nt, 'MULTIPLY', dens, .38))
    punto = rango(nt, grano, umbral, M(nt, 'ADD', umbral, .04), 0, 1)
    col = mezcla(nt, 'MIX', M(nt, 'MULTIPLY', dens, .3), col, lin(PAL['franja']))
    col = mezcla(nt, 'MIX', M(nt, 'MULTIPLY', punto, rango(nt, dens, 0, .25)), col, holo)
    alfa = M(nt, 'MAXIMUM', rango(nt, ext, 3, 6, 0, 1), M(nt, 'MULTIPLY', rango(nt, ext, 0, 3, 0, 1), punto))
    return col, alfa
bpy.ops.mesh.primitive_plane_add(size=7.0, location=(CX, CY, -.3)); bpy.context.object.data.materials.append(pintado('aura', cons_aura, True))

# ---------- medallón: remolino azul petróleo (arriba a la izquierda) a púrpura (abajo a la derecha) ----------
def cons_medallon(nt, e):
    r = N(nt, 'ShaderNodeVectorMath', operation='LENGTH'); L(nt, e['obj'], r.inputs[0]); r = r.outputs['Value']
    th = M(nt, 'ARCTAN2', e['y'], e['x'])
    giro = M(nt, 'ADD', th, M(nt, 'MULTIPLY', r, .3))                      # el remolino gira con el radio
    nu = ruido(nt, e['obj'], 1.0, 4, 2.4)
    f = M(nt, 'ADD', M(nt, 'MULTIPLY', M(nt, 'SINE', M(nt, 'ADD', giro, 2.36)), .5), M(nt, 'MULTIPLY', M(nt, 'SUBTRACT', nu, .5), .6))
    f = M(nt, 'MULTIPLY', f, rango(nt, r, 0, RM * .75, .15, 1, 'SMOOTHSTEP'))   # el centro queda en el tono intermedio
    md = PAL['medallon']; col = rampa(nt, [(0, md[0]), (.35, md[1]), (.6, md[2]), (1, md[3])], rango(nt, f, -.5, .5))
    # vetas del remolino: arcos algo más claros que giran hacia dentro, sobre todo arriba a la izquierda
    veta = M(nt, 'SINE', M(nt, 'ADD', M(nt, 'SUBTRACT', th, M(nt, 'MULTIPLY', r, 3.2)), M(nt, 'MULTIPLY', nu, 2.0)))
    col = mezcla(nt, 'SCREEN', M(nt, 'MULTIPLY', rango(nt, veta, .5, .95, 0, .35, 'SMOOTHSTEP'), rango(nt, M(nt, 'COSINE', M(nt, 'SUBTRACT', th, 2.2)), -.3, .8, .25, 1)), col, lin(md[0]))
    # filo cálido muy tenue arriba a la izquierda
    filo = M(nt, 'MULTIPLY', rango(nt, r, RM - .1, RM, 0, 1, 'SMOOTHSTEP'), rango(nt, M(nt, 'COSINE', M(nt, 'SUBTRACT', th, 2.5)), .5, 1, 0, .6))
    col = mezcla(nt, 'MIX', filo, col, lin(PAL['oro']))
    return col, None
bpy.ops.mesh.primitive_circle_add(vertices=220, radius=RM, fill_type='NGON', location=(CX, CY, .9)); bpy.context.object.data.materials.append(pintado('medallon', cons_medallon))

# ---------- cristales: prismas gruesos con los extremos cortados, facetados por orientación ----------
def mat_cristal():
    m = bpy.data.materials.new('cristal'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = N(nt, 'ShaderNodeOutputMaterial'); em = N(nt, 'ShaderNodeEmission'); em.inputs['Strength'].default_value = 1
    geo = N(nt, 'ShaderNodeNewGeometry'); oi = N(nt, 'ShaderNodeObjectInfo'); tc = N(nt, 'ShaderNodeTexCoord')
    az = N(nt, 'ShaderNodeAttribute'); az.attribute_name = 'azar'
    sep = N(nt, 'ShaderNodeSeparateXYZ'); L(nt, geo.outputs['Normal'], sep.inputs[0])
    # luz pintada desde arriba a la izquierda + un azar por cara: facetas planas de tonos distintos
    luz = M(nt, 'ADD', M(nt, 'MULTIPLY', sep.outputs['Z'], .45), M(nt, 'ADD', M(nt, 'MULTIPLY', sep.outputs['X'], -.4), M(nt, 'MULTIPLY', sep.outputs['Y'], .45)))
    luz = M(nt, 'ADD', luz, M(nt, 'MULTIPLY', M(nt, 'SUBTRACT', az.outputs['Fac'], .5), .45))
    ps = N(nt, 'ShaderNodeSeparateXYZ'); L(nt, geo.outputs['Position'], ps.inputs[0])          # más luz hacia arriba a la izquierda
    luz = M(nt, 'ADD', luz, M(nt, 'ADD', M(nt, 'MULTIPLY', ps.outputs['Y'], .07), M(nt, 'MULTIPLY', ps.outputs['X'], -.04)))
    c = PAL['cristal']; base = rampa(nt, [(0, c[0]), (.2, c[1]), (.4, c[2]), (.6, c[3]), (.78, c[4]), (.92, c[5])], rango(nt, luz, -.4, .78), 'CONSTANT')
    # destellos tornasolados (verde, amarillo, rosa) en algunas caras
    nu = ruido(nt, tc.outputs['Object'], 1.8, 2)
    hue = M(nt, 'FRACT', M(nt, 'ADD', nu, M(nt, 'MULTIPLY', az.outputs['Fac'], 7.0)))
    tor = rampa(nt, reparto(list(PAL['tornasol']) + [PAL['tornasol'][0]]), hue)
    fac = M(nt, 'MAXIMUM', rango(nt, az.outputs['Fac'], .74, .75, 0, .75), rango(nt, nu, .7, .78, 0, .45))
    col = mezcla(nt, 'MIX', fac, base, tor)
    L(nt, col, em.inputs['Color']); L(nt, em.outputs[0], out.inputs['Surface'])
    return m
MC = mat_cristal()
CC = bpy.data.collections.new('Cristales'); sc.collection.children.link(CC)
def cristal(base, punta, sa, z, semilla, lados=7):
    # envolvente convexa de puntos repartidos en un prisma irregular con la punta cortada en diagonal: esquirla facetada
    rr = random.Random(semilla); a, b = Vector(F(*base)), Vector(F(*punta)); eje = b - a; nrm = Vector((-eje.y, eje.x)).normalized(); sa *= K
    corte = rr.uniform(0, 2 * math.pi); pts = []
    for t in (0, .1, .3, .5, .7, .84, .93, 1.0):
        k = 1.0 if t < .8 else 1 - (t - .8) / .2 * .3
        for i in range(lados):
            an = 2 * math.pi * (i + rr.uniform(-.12, .12)) / lados; rad = sa * k * rr.uniform(.72, 1.05)
            tt = t - (.16 * (1 + math.cos(an - corte)) / 2 if t > .9 else 0) + rr.uniform(-.03, .03)
            p = a + eje * tt + nrm * math.cos(an) * rad
            pts.append((p.x, p.y, z + math.sin(an) * rad * .55))
    bm = bmesh.new(); vs = [bm.verts.new(p) for p in pts]; res = bmesh.ops.convex_hull(bm, input=vs)
    sobra = list({v for v in res['geom_interior'] + res['geom_unused'] if isinstance(v, bmesh.types.BMVert) and v.is_valid})
    if sobra: bmesh.ops.delete(bm, geom=sobra, context='VERTS')
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(4), verts=bm.verts[:], edges=bm.edges[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    capa = bm.faces.layers.float.new('azar')
    for f in bm.faces: f[capa] = rr.random()
    return objeto('cristal', bm, MC, CC)
# (base, punta, semiancho) en píxeles de la referencia
CRIS = [((125, 234), (147, 58), 34), ((163, 115), (208, 49), 22), ((88, 280), (72, 194), 16), ((117, 291), (108, 261), 10),
        ((236, 75), (268, 65), 5), ((215, 66), (224, 57), 3.5), ((285, 63), (295, 58), 3),
        ((416, 254), (437, 184), 14), ((402, 240), (392, 214), 6), ((428, 289), (441, 272), 6)]
for i, (b, p, sa) in enumerate(CRIS): cristal(b, p, sa, .3 + i * .02, 40 + i)

# ---------- contorno oscuro fino de los cristales (Freestyle) ----------
sc.render.use_freestyle = True; sc.render.line_thickness_mode = 'ABSOLUTE'; sc.render.line_thickness = .9 * ESC
fs = sc.view_layers[0].freestyle_settings; ls = fs.linesets[0] if fs.linesets else fs.linesets.new('cristales')
ls.select_by_collection = True; ls.collection = CC; ls.select_by_visibility = True
ls.select_silhouette = True; ls.select_border = True; ls.select_crease = False
ls.linestyle = ls.linestyle or bpy.data.linestyles.new('linea'); ls.linestyle.color = hexc(PAL['linea']); ls.linestyle.alpha = .55

bpy.ops.render.render(write_still=True); print('CARTA', VAR, OUT)
