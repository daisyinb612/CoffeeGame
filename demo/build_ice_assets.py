"""Bake the three settled ice piles with Blender Cycles.

Run from a shell with: blender -b --factory-startup -P demo/build_ice_assets.py
"""

import math
import random
from pathlib import Path

import bpy
from mathutils import Vector
r=random.Random(144)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.cycles.max_bounces=12
scene.cycles.transmission_bounces=9
scene.render.resolution_x=240
scene.render.resolution_y=480
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='WEBP'
scene.render.image_settings.quality=90
scene.render.image_settings.color_mode='RGBA'
scene.render.film_transparent=True
scene.cycles.film_transparent_glass=False
scene.view_settings.view_transform='AgX'
scene.view_settings.exposure=1.12
world=scene.world
world.use_nodes=True
background=world.node_tree.nodes.get('Background')
background.inputs[0].default_value=(.61,.65,.66,1)
background.inputs[1].default_value=.83

def area(name, pos, power, size, size_y, color):
    bpy.ops.object.light_add(type='AREA', location=pos)
    obj=bpy.context.object
    obj.name=name
    obj.data.shape='RECTANGLE'
    obj.data.energy=power
    obj.data.size=size
    obj.data.size_y=size_y
    obj.data.color=color
    obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat('-Z','Y').to_euler()
area('Window',(-2,-2,3),135,1.1,3,(.93,.97,1))
area('Counter light',(1.3,1.4,2),105,2,.30,(1,.94,.83))
area('Room lights',(1.6,-1.8,.4),25,1.5,2.4,(.89,.95,1))

bpy.ops.object.camera_add(location=(0,-6,3.16))
cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,.07))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO'
cam.data.ortho_scale=1.52
scene.camera=cam

mat=bpy.data.materials.new('Ice')
mat.use_nodes=True
nodes=mat.node_tree.nodes
links=mat.node_tree.links
bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
out=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
bsdf.inputs['Transmission Weight'].default_value=1
bsdf.inputs['IOR'].default_value=1.309
bsdf.inputs['Roughness'].default_value=.075
bsdf.inputs['Base Color'].default_value=(.91,.96,.97,1)
noise=nodes.new('ShaderNodeTexNoise')
noise.inputs['Scale'].default_value=5.2
noise.inputs['Detail'].default_value=2
bump=nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value=.23
bump.inputs['Distance'].default_value=.015
links.new(noise.outputs['Fac'],bump.inputs['Height'])
links.new(bump.outputs[0],bsdf.inputs['Normal'])
coord=nodes.new('ShaderNodeTexCoord')
links.new(coord.outputs['Generated'],noise.inputs[0])
scatter=nodes.new('ShaderNodeVolumeScatter')
scatter.inputs['Color'].default_value=(.85,.92,.96,1)
scatter.inputs['Anisotropy'].default_value=.19
ramp=nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position=.22
ramp.color_ramp.elements[0].color=(.009,.009,.009,1)
ramp.color_ramp.elements[1].position=.81
ramp.color_ramp.elements[1].color=(.7,.7,.7,1)
density=nodes.new('ShaderNodeMath')
density.operation='MULTIPLY'
density.inputs[1].default_value=8.4
links.new(noise.outputs['Fac'],ramp.inputs[0])
links.new(ramp.outputs[0],density.inputs[0])
links.new(density.outputs[0],scatter.inputs['Density'])
links.new(scatter.outputs[0],out.inputs['Volume'])

cubes=[]
for row in range(6):
    for col in range(2):
        angle=col*math.pi+row*.87-.25
        side=1-2*col
        x=side*(.109+.013*math.cos(row*1.9+col))+.019*math.sin(row*2.2)
        depth=side*.068*math.cos(row*1.5+.4)
        height=-.475+.975*row/5+side*.041*math.sin(row*2.4+.45)
        # Use the same scale range as the ice in the browser's scoop.
        scale=.194+.013*math.cos(row*1.37+col*2)
        bpy.ops.mesh.primitive_cube_add(size=1,location=(x,-depth,height))
        obj=bpy.context.object
        obj.scale=(scale*(1.02+r.uniform(-.03,.10)),scale*r.uniform(.88,1.05),scale*r.uniform(.74,.92))
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        bevel=obj.modifiers.new('Melted edges','BEVEL')
        bevel.width=r.uniform(.016,.031)
        bevel.segments=4
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        for v in obj.data.vertices:
            v.co.x+=.018*math.sin(v.co.z*12+v.co.y*9+row)
            v.co.y+=.009*math.sin(v.co.x*19+v.co.z*13+col)
            v.co.z+=.011*math.sin(v.co.x*10+v.co.y*13+row)
        for poly in obj.data.polygons:
            poly.use_smooth=True
        weights=obj.modifiers.new('Face normals','WEIGHTED_NORMAL')
        weights.keep_sharp=True
        obj.rotation_euler=(.38*math.sin(angle+row),.43*math.cos(row+angle),.56+angle*.68)
        obj.data.materials.append(mat)
        cubes.append(obj)

output = Path(__file__).resolve().parent / "assets" / "ice"
output.mkdir(parents=True, exist_ok=True)

for count in (4, 8, 12):
    for i,cube in enumerate(cubes):
        cube.hide_render=i>=count
    scene.render.filepath=str(output / f"pile-{count}.webp")
    bpy.ops.render.render(write_still=True)
