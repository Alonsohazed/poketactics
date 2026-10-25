# Renderiza las Poké Balls de los orbes de botín (sprites con aspecto 3D): mitad superior plateada, dorada o prismática,
# banda negra, botón y un «?» grande delante. Fondo transparente.
# Uso: blender -b --python pokeball-orbe.py -- <carpeta_salida> [tam=512] [muestras=96]
import bpy, sys, math, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.getcwd()
TAM = int(argv[1]) if len(argv) > 1 else 512
MUESTRAS = int(argv[2]) if len(argv) > 2 else 96
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = MUESTRAS
sc.cycles.use_denoising = True
try: sc.cycles.device = 'CPU'
except Exception: pass
sc.render.film_transparent = True
sc.render.resolution_x = sc.render.resolution_y = TAM
sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'

def mat(nombre, color, metal=0.0, rough=0.35, emit=None, emit_fuerza=0.0):
    m = bpy.data.materials.new(nombre); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = (*emit, 1)
        bsdf.inputs['Emission Strength'].default_value = emit_fuerza
    return m

def mat_prisma(nombre):
    # degradado arcoíris por la posición (x+z) con brillo metálico: la mitad «prismática»
    m = bpy.data.materials.new(nombre); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); mth = nt.nodes.new('ShaderNodeMath'); mth.operation = 'ADD'
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = -1.6; mr.inputs['From Max'].default_value = 1.6
    ramp = nt.nodes.new('ShaderNodeValToRGB'); cr = ramp.color_ramp; cr.interpolation = 'LINEAR'
    cols = [(0.98, 0.40, 0.60), (1.0, 0.80, 0.30), (0.45, 0.95, 0.55), (0.35, 0.72, 1.0), (0.78, 0.45, 1.0)]
    while len(cr.elements) < len(cols): cr.elements.new(0.5)
    for i, c in enumerate(cols): cr.elements[i].position = i / (len(cols) - 1); cr.elements[i].color = (*c, 1)
    nt.links.new(tc.outputs['Object'], sep.inputs[0]); nt.links.new(sep.outputs['X'], mth.inputs[0]); nt.links.new(sep.outputs['Z'], mth.inputs[1])
    nt.links.new(mth.outputs[0], mr.inputs['Value']); nt.links.new(mr.outputs[0], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Metallic'].default_value = 0.55; bsdf.inputs['Roughness'].default_value = 0.3
    return m

TOPS = {
    'gray': mat('plata', (0.70, 0.73, 0.78), metal=0.85, rough=0.32),
    'gold': mat('oro', (0.96, 0.72, 0.22), metal=0.85, rough=0.3),
    'prism': mat_prisma('prisma'),
}
BLANCO = mat('blanco', (0.93, 0.93, 0.95), metal=0.0, rough=0.32)
NEGRO = mat('negro', (0.03, 0.03, 0.04), metal=0.2, rough=0.45)
GRIS_BOTON = mat('botonGris', (0.78, 0.79, 0.83), metal=0.3, rough=0.4)
INTERRO = mat('interrogacion', (0.08, 0.07, 0.12), metal=0.0, rough=0.5)
INTERRO_B = mat('interrogacionBorde', (1.0, 0.98, 0.9), metal=0.0, rough=0.4, emit=(1.0, 0.97, 0.8), emit_fuerza=1.2)

def esfera(nombre, r, seg=96, anillos=48):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=seg, ring_count=anillos, location=(0, 0, 0))
    o = bpy.context.active_object; o.name = nombre
    bpy.ops.object.shade_smooth()
    return o

def cilindro(nombre, r, h, loc, rot=(0, 0, 0), v=96):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=v, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = nombre
    bpy.ops.object.shade_smooth(); return o

def texto(nombre, m, y, z, tam):
    bpy.ops.object.text_add(location=(0, y, z)); t = bpy.context.active_object; t.name = nombre
    t.data.body = '?'; t.data.size = tam; t.data.extrude = 0.05; t.data.bevel_depth = 0.014; t.data.align_x = 'CENTER'; t.data.align_y = 'CENTER'
    t.rotation_euler = (math.radians(62), 0, 0)
    t.data.materials.append(m); return t

def montar(tier):
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    # bola: dos materiales por hemisferio
    b = esfera('bola', 1.0)
    b.data.materials.append(TOPS[tier]); b.data.materials.append(BLANCO)
    for p in b.data.polygons: p.material_index = 0 if p.center.z > 0.0 else 1
    # banda ecuatorial y botón pequeño (mirando a la cámara, -Y)
    banda = cilindro('banda', 1.004, 0.10, (0, 0, 0)); banda.data.materials.append(NEGRO)
    rot = (math.radians(90), 0, 0)
    aro = cilindro('aro', 0.24, 0.09, (0, -0.985, -0.07), rot, 64); aro.data.materials.append(NEGRO)
    boton = cilindro('boton', 0.15, 0.11, (0, -0.995, -0.07), rot, 64); boton.data.materials.append(GRIS_BOTON)
    # «?» grande sobre la mitad superior: borde claro detrás y glifo oscuro delante
    texto('interroBorde', INTERRO_B, -0.96, 0.80, 1.28)
    texto('interro', INTERRO, -1.01, 0.80, 1.15)
    # luces
    bpy.ops.object.light_add(type='SUN', location=(-3, -4, 6)); sun = bpy.context.active_object; sun.data.energy = 2.6; sun.data.angle = math.radians(20)
    sun.rotation_euler = (math.radians(40), math.radians(-20), math.radians(-30))
    bpy.ops.object.light_add(type='AREA', location=(3.5, -3, 2.5)); fill = bpy.context.active_object; fill.data.energy = 90; fill.data.size = 6
    fill.rotation_euler = (math.radians(60), 0, math.radians(50))
    bpy.ops.object.light_add(type='AREA', location=(0, 3, 3)); rim = bpy.context.active_object; rim.data.energy = 70; rim.data.size = 5
    rim.rotation_euler = (math.radians(-45), 0, 0)
    # cámara: perspectiva parecida a la del tablero (elevación ~36°)
    bpy.ops.object.camera_add(location=(0, -5.2, 3.6)); cam = bpy.context.active_object
    d = Vector((0, 0, 0.1)) - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 60; sc.camera = cam
    # mundo suave para los reflejos del metal
    w = bpy.data.worlds.new('mundo') if not bpy.data.worlds else bpy.data.worlds[0]
    sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.5, 0.55, 0.65, 1); bg.inputs[1].default_value = 0.45

for tier in ('gray', 'gold', 'prism'):
    montar(tier)
    sc.render.filepath = os.path.join(OUT, 'orbe-' + tier + '.png')
    bpy.ops.render.render(write_still=True)
    print('render', sc.render.filepath)
