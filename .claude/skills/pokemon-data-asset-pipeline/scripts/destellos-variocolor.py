# Marca de variocolor: tres destellos dorados de 4 puntas (réplica de la imagen que aportó el autor), con relieve suave, fondo transparente.
# Posiciones y tamaños medidos sobre la referencia (94×100 px): grande centrado en (33, 46,5) con 57×82; pequeño arriba a la derecha en (59, 23)
# con ~22×24; mediano abajo a la derecha en (71, 66) con ~28×30. Colores: dorado medio (238,210,41), claro (254,231,89) y borde ocre.
# Uso: blender -b --python destellos.py -- <salida.png> [tam=512] [muestras=64]
import bpy, sys, math, os
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.join(os.getcwd(), 'destellos.png')
TAM = int(argv[1]) if len(argv) > 1 else 512
MUESTRAS = int(argv[2]) if len(argv) > 2 else 64

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.samples = MUESTRAS; sc.cycles.use_denoising = True
try: sc.cycles.device = 'CPU'
except Exception: pass
sc.render.film_transparent = True
sc.render.resolution_x = sc.render.resolution_y = TAM; sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'

def srgb(c): return tuple(((v / 255) ** 2.2) for v in c) + (1,)

# Material: dorado con degradado de arriba (claro) a abajo (algo más naranja), como la referencia
m = bpy.data.materials.new('oro'); m.use_nodes = True; nt = m.node_tree; bsdf = nt.nodes['Principled BSDF']
tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); mr = nt.nodes.new('ShaderNodeMapRange')
mr.inputs['From Min'].default_value = -1.0; mr.inputs['From Max'].default_value = 1.0
ramp = nt.nodes.new('ShaderNodeValToRGB'); cr = ramp.color_ramp
cr.elements[0].position = 0.0; cr.elements[0].color = srgb((232, 182, 24))
cr.elements[1].position = 1.0; cr.elements[1].color = srgb((252, 222, 58))
nt.links.new(tc.outputs['Generated'], sep.inputs[0]); nt.links.new(tc.outputs['Object'], sep.inputs[0])
nt.links.new(sep.outputs['Y'], mr.inputs['Value']); nt.links.new(mr.outputs[0], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.35; mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.inputs['B'].default_value = srgb((196, 128, 14))
nt.links.new(lw.outputs['Facing'], mix.inputs['Factor']); nt.links.new(ramp.outputs['Color'], mix.inputs['A']); nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.35; bsdf.inputs['Metallic'].default_value = 0.0
bsdf.inputs['Emission Color'].default_value = srgb((250, 205, 45)); bsdf.inputs['Emission Strength'].default_value = 0.35

def destello(nombre, cx, cy, ancho, alto, k=0.18, n=60):
    """Estrella de 4 puntas: entre punta y punta, una curva cuadrática que se mete hacia el centro (control en (k·a, k·b) de su cuadrante)."""
    cu = bpy.data.curves.new(nombre, 'CURVE'); cu.dimensions = '2D'; cu.fill_mode = 'BOTH'
    sp = cu.splines.new('POLY'); a, b = ancho / 2, alto / 2
    tips = [(0, b), (a, 0), (0, -b), (-a, 0)]; pts = []
    for q in range(4):
        p0, p2 = tips[q], tips[(q + 1) % 4]; cxq = k * a * (1 if p0[0] + p2[0] > 0 else -1); cyq = k * b * (1 if p0[1] + p2[1] > 0 else -1)
        for i in range(n):
            t = i / n; u = 1 - t; pts.append((u * u * p0[0] + 2 * u * t * cxq + t * t * p2[0], u * u * p0[1] + 2 * u * t * cyq + t * t * p2[1]))
    sp.points.add(len(pts) - 1)
    for i, (x, y) in enumerate(pts): sp.points[i].co = (x, y, 0, 1)
    sp.use_cyclic_u = True
    s = min(ancho, alto)
    cu.extrude = s * 0.05; cu.bevel_depth = s * 0.06; cu.bevel_resolution = 6
    o = bpy.data.objects.new(nombre, cu); bpy.context.collection.objects.link(o); o.location = (cx, cy, 0); cu.materials.append(m)
    return o

# Coordenadas de la referencia (94×100 px, y hacia abajo) → mundo (y hacia arriba), unidades = píxeles de la referencia
W, H = 94, 100
def P(x, y): return (x - W / 2, H / 2 - y)
destello('grande', *P(33, 46.5), 50, 76)
destello('arriba', *P(59, 22.5), 19, 21)
destello('abajo', *P(70.5, 66), 25, 28)

# Luz suave desde arriba a la izquierda y otra de relleno: relieve de pegatina, como la referencia
bpy.ops.object.light_add(type='AREA', location=(-60, 80, 120)); l = bpy.context.active_object; l.data.energy = 1.6e5; l.data.size = 120
l.rotation_euler = (math.radians(-30), math.radians(-25), 0)
bpy.ops.object.light_add(type='AREA', location=(40, -40, 140)); l2 = bpy.context.active_object; l2.data.energy = 6e4; l2.data.size = 160
w = bpy.data.worlds.new('mundo'); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (1, 1, 1, 1); bg.inputs[1].default_value = 0.6

bpy.ops.object.camera_add(location=(0, 0, 200)); cam = bpy.context.active_object; cam.data.type = 'ORTHO'; cam.data.ortho_scale = 104; sc.camera = cam
sc.render.filepath = OUT; bpy.ops.render.render(write_still=True); print('render', OUT)
