# Fondo del carrusel: plataforma Poké Ball sobre suelo rojo, con la misma perspectiva que la cámara del carrusel del juego
# (fitCamera en board3d.js con una pantalla de 1920×1080: elevación ≈ 40°, distancia 28 radios de casilla, el borde del suelo a 1,3 radios del carrusel = 6,825).
# Uso: blender -b --python carrusel-pokeball.py -- <salida.png> [ancho=3400] [alto=2100] [muestras=96]
# Deja además <salida>.json con los píxeles de los extremos N/S/W/E del borde de la plataforma (para PLAZA_IMG en board3d.js).
import bpy, sys, math, json
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '//carrusel.png'
W = int(argv[1]) if len(argv) > 1 else 3400
H = int(argv[2]) if len(argv) > 2 else 2100
SAMPLES = int(argv[3]) if len(argv) > 3 else 96

R = 6.825          # radio de la plataforma (k·rr en unidades del 3D)
EL, DIST = 39.75, 28.0
DISC = .441       # ancho de la plataforma en la imagen, en fracción del ancho (1500 px en 3400)
CENTER_Y = 0.41     # altura del centro de la plataforma en la imagen (desde arriba): deja más suelo abajo, donde la pantalla muestra más
SUELO = -12.0       # el suelo queda muy por debajo: la plataforma flota (su sombra cae lejos y difusa)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def mat(name, col, rough=.55, metal=0.0, spec=.35):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*[c ** 2.2 for c in col], 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if 'Specular IOR Level' in b.inputs: b.inputs['Specular IOR Level'].default_value = spec
    return m
hexc = lambda h: tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
M_RIM = mat('aro', hexc('#4b4c50'), .5)
M_SIDE = mat('lateral', hexc('#1c1c1f'), .6)
M_RED = mat('rojo', hexc('#c22a30'), .45)
M_WHITE = mat('blanco', hexc('#dcdcdc'), .5)
M_BAND = mat('franja', hexc('#3f4044'), .5)
M_LINE = mat('linea', hexc('#8c1015'), .45)
M_BTN = mat('boton', hexc('#d7d7d7'), .4)
M_BTNS = mat('boton_lado', hexc('#9b9b9e'), .5)

def cyl(name, r, z0, z1, m_top, m_side=None, verts=192, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=z1 - z0, location=(0, 0, (z0 + z1) / 2))
    o = bpy.context.object; o.name = name; o.data.materials.append(m_side or m_top); o.data.materials.append(m_top)
    for p in o.data.polygons:
        p.material_index = 1 if p.normal.z > .5 else 0
    if bevel:
        bv = o.modifiers.new('bisel', 'BEVEL'); bv.width = bevel; bv.segments = 4; bv.limit_method = 'ANGLE'
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30))
    return o

def half_disc(name, r, z0, z1, m, upper):
    # media placa (mitad lejana = roja, cercana = blanca): un cilindro cortado por el eje X
    o = cyl(name, r, z0, z1, m)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(plane_co=(0, 0, 0), plane_no=(0, 1 if upper else -1, 0), clear_inner=True, use_fill=True)
    bpy.ops.object.mode_set(mode='OBJECT'); return o

# Plataforma: cuerpo negro con el aro gris oscuro arriba, la cara (media roja, media blanca), la franja y el botón central
cyl('cuerpo', R, -1.0, 0.0, M_RIM, M_SIDE, bevel=.06)
FACE = R * .86
half_disc('cara_roja', FACE, -.02, .06, M_RED, True)
half_disc('cara_blanca', FACE, -.02, .06, M_WHITE, False)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, .065)); band = bpy.context.object; band.name = 'franja'
band.scale = (FACE * 2, R * .07, .03); band.data.materials.append(M_BAND)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, R * .052, .07)); ln = bpy.context.object; ln.name = 'linea'
ln.scale = (FACE * 2 * .995, R * .032, .03); ln.data.materials.append(M_LINE)
cyl('anillo', R * .27, -.02, .11, M_BAND, M_BAND)
cyl('boton', R * .17, .0, .42, M_BTN, M_BTNS, bevel=.05)
# recorta franja y línea al círculo de la cara (que no sobresalgan sobre el aro)
for o in (band, ln):
    bo = o.modifiers.new('recorte', 'BOOLEAN'); bpy.ops.mesh.primitive_cylinder_add(vertices=192, radius=FACE, depth=2, location=(0, 0, 0))
    cut = bpy.context.object; cut.hide_render = True; cut.hide_viewport = True; bo.operation = 'INTERSECT'; bo.object = cut

# Base de isla flotante bajo el disco: un cono truncado oscuro que asoma por delante
bpy.ops.mesh.primitive_cone_add(vertices=192, radius1=R * .72, radius2=R * .98, depth=3.6, location=(0, 0, -2.8)); base = bpy.context.object; base.name = 'base'
base.data.materials.append(mat('base', hexc('#121214'), .7)); bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30))

# Suelo rojo muy por debajo (sin bordes visibles), más claro a lo lejos: da profundidad
bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, SUELO)); fl = bpy.context.object; fl.name = 'suelo'
mf = bpy.data.materials.new('suelo'); mf.use_nodes = True; nt = mf.node_tree; b = nt.nodes['Principled BSDF']
b.inputs['Roughness'].default_value = .8
tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); mr = nt.nodes.new('ShaderNodeMapRange')
ramp = nt.nodes.new('ShaderNodeValToRGB')
mr.inputs['From Min'].default_value = -40; mr.inputs['From Max'].default_value = 60
ramp.color_ramp.elements[0].color = (*[c ** 2.2 for c in hexc('#9a2a31')], 1); ramp.color_ramp.elements[1].color = (*[c ** 2.2 for c in hexc('#d3646a')], 1)
nt.links.new(tc.outputs['Object'], sep.inputs[0]); nt.links.new(sep.outputs['Y'], mr.inputs['Value']); nt.links.new(mr.outputs['Result'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
fl.data.materials.append(mf)

# Luz: cielo suave y un sol desde arriba a la izquierda (como el resto del escenario), sombras blandas
wd = bpy.data.worlds.new('mundo'); sc.world = wd; wd.use_nodes = True; bg = wd.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (1, .96, .95, 1); bg.inputs['Strength'].default_value = .55
bpy.ops.object.light_add(type='SUN', rotation=(math.radians(38), math.radians(-22), math.radians(-30))); sun = bpy.context.object
sun.data.energy = 3.2; sun.data.angle = math.radians(14)
bpy.ops.object.light_add(type='AREA', location=(0, -6, 22)); ar = bpy.context.object; ar.data.energy = 2500; ar.data.size = 30

# Cámara: misma posición que en el juego (desde el sur, elevación EL, a DIST del centro), el encuadre más ancho para cubrir la pantalla
e = math.radians(EL)
bpy.ops.object.camera_add(location=(0, -math.cos(e) * DIST, math.sin(e) * DIST)); cam = bpy.context.object; sc.camera = cam
cam.rotation_euler = (math.pi / 2 - e, 0, 0)
cam.data.sensor_fit = 'VERTICAL'
sc.render.resolution_x, sc.render.resolution_y = W, H
# píxeles de foco para que el diámetro de la plataforma (a la altura del centro) mida DISC·W
f_px = DISC * W / 2 * DIST / R
cam.data.angle_y = 2 * math.atan(H / 2 / f_px)
cam.data.shift_y = (CENTER_Y - .5) * H / max(W, H)

sc.render.engine = 'CYCLES'; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
sc.render.image_settings.file_format = 'PNG'; sc.render.filepath = OUT
bpy.context.view_layer.update()
pts = {}
for k, p in {'N': (0, R, 0), 'S': (0, -R, 0), 'W': (-R, 0, 0), 'E': (R, 0, 0), 'C': (0, 0, 0)}.items():
    v = world_to_camera_view(sc, cam, Vector(p)); pts[k] = [round(v.x * W, 1), round((1 - v.y) * H, 1)]
json.dump({'w': W, 'h': H, **pts}, open(bpy.path.abspath(OUT).rsplit('.', 1)[0] + '.json', 'w'))
bpy.ops.render.render(write_still=True)
print('PUNTOS', pts)
