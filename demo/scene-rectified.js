import * as T from './vendor/three.module.min.js';

const viewport=document.getElementById('viewport');
const status=document.getElementById('render-status');
const renderer=new T.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(viewport.clientWidth,viewport.clientHeight);
renderer.outputColorSpace=T.SRGBColorSpace;
viewport.prepend(renderer.domElement);
const camera=new T.PerspectiveCamera(80,viewport.clientWidth/viewport.clientHeight,.01,50);
camera.rotation.order='YXZ';
const model=new T.Scene();
model.background=new T.Color(0xd8d5cd);
const scene=new T.Scene();
const loader=new T.TextureLoader();
const base='assets/scene-boxes/';
const labels=[['前方','完整制作台与水池'],['右侧','门口与通道尽头'],['后方','工作台背面与展示柜'],['左侧','窗户']];
const files=['skybox-front-v1.png','skybox-right-v1.png','skybox-back-v1.png','skybox-left-v1.png'];
const textures=await Promise.all(files.map(file=>loader.loadAsync(base+file)));
for(const texture of textures){texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
function crop(texture,u0,v0,u1,v1){
  const t=texture.clone();t.offset.set(u0,v0);t.repeat.set(u1-u0,v1-v0);t.needsUpdate=true;return t;
}
function material(color,map){return new T.MeshBasicMaterial({color,map,side:T.DoubleSide});}
function box(w,h,d,x,y,z,mat){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);model.add(mesh);return mesh;}
function plane(w,h,x,y,z,ry,mat){const mesh=new T.Mesh(new T.PlaneGeometry(w,h),mat);mesh.position.set(x,y,z);mesh.rotation.y=ry;model.add(mesh);return mesh;}

// All dimensions are actual geometry, in metres. Four 48cm floor tiles fit
// between the parallel counter fronts. Nothing moves with view direction.
const length=5.6, aisle=1.92, depth=.64, roomDepth=aisle+depth*2;
const height=3.0, counterHeight=.90, eye=1.60;
const white=material(0xe4e1da),wood=material(0xa77b4a),stone=material(0xeeeae0),plinth=material(0x665c4d);
box(length,height,.04,0,height/2,-roomDepth/2-.02,white);
box(length,height,.04,0,height/2,roomDepth/2+.02,white);
box(.04,height,roomDepth,length/2+.02,height/2,0,white);
box(.04,height,roomDepth,-length/2-.02,height/2,0,white);

// Rectilinear photographs are sampled on the corresponding planar surfaces.
// The photographed floor is excluded; the floor is rendered only once below.
for(const [i,sign] of [[0,-1],[2,1]]){
  const wallZ=sign*(roomDepth/2-.006);
  const wallTex=i===0?crop(textures[i],0,.30,1,1):crop(textures[i],0,.39,1,1);
  plane(length,height-counterHeight,0,(height+counterHeight)/2,wallZ,sign<0?0:Math.PI,material(0xffffff,wallTex));
  // Solid countertop, cabinet body, separate straight facade and recessed plinth.
  box(length,counterHeight-.10,depth,0,(counterHeight+.10)/2,sign*(aisle/2+depth/2),wood);
  box(length,.055,depth+.025,0,counterHeight,sign*(aisle/2+depth/2),stone);
  box(length,.10,depth-.04,0,.05,sign*(aisle/2+depth/2+.02),plinth);
  const facade=i===0?crop(textures[i],0,.11,1,.295):crop(textures[i],0,.155,1,.385);
  plane(length,.755,0,.4775,sign*(aisle/2-.002),sign<0?0:Math.PI,material(0xffffff,facade));
}

// The end walls contain the door and window, centred at opposing ends.
plane(roomDepth,height,length/2-.006,height/2,0,-Math.PI/2,material(0xffffff,crop(textures[1],0,.27,1,.98)));
plane(roomDepth,height,-length/2+.006,height/2,0,Math.PI/2,material(0xffffff,crop(textures[3],0,.15,1,.98)));

// Physical horizontal floor: one coordinate system, straight grout lines.
const floorMaterial=new T.ShaderMaterial({
  side:T.DoubleSide,
  vertexShader:`varying vec2 floorPosition;void main(){vec4 world=modelMatrix*vec4(position,1.0);floorPosition=world.xz;gl_Position=projectionMatrix*viewMatrix*world;}`,
  fragmentShader:`varying vec2 floorPosition;
    void main(){
      vec2 p=floorPosition/0.48+vec2(0.5,0.0);
      vec2 f=fract(p);vec2 fw=fwidth(p);
      vec2 e=min(f,1.0-f);
      float grout=1.0-min(smoothstep(0.003,0.007+fw.x,e.x),smoothstep(0.003,0.007+fw.y,e.y));
      float stone=0.009*sin(floorPosition.x*29.0+sin(floorPosition.y*9.0))*sin(floorPosition.y*27.0);
      float perTile=0.012*sin(dot(floor(p),vec2(12.9898,78.233)));
      vec3 c=vec3(.48,.45,.41)+stone+perTile;
      c=mix(c,vec3(.34,.32,.29),grout*.48);
      gl_FragColor=vec4(c,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const floor=new T.Mesh(new T.PlaneGeometry(length,roomDepth),floorMaterial);
floor.rotation.x=-Math.PI/2;floor.position.y=-.005;model.add(floor);
const ceiling=new T.Mesh(new T.PlaneGeometry(length,roomDepth),white);
ceiling.rotation.x=Math.PI/2;ceiling.position.y=height;model.add(ceiling);

// Bake the complete geometry once, so the interactive result is a genuine
// fixed-viewpoint cubemap skybox, rather than a panorama distorted into a box.
const target=new T.WebGLCubeRenderTarget(1024,{generateMipmaps:true,minFilter:T.LinearMipmapLinearFilter});
const capture=new T.CubeCamera(.01,30,target);capture.position.set(0,eye,0);capture.update(renderer,model);
scene.background=target.texture;
let yaw=0,pitch=0,drag=null,current=-1;
const visited=new Set();
function render(){camera.rotation.set(pitch,yaw,0,'YXZ');renderer.render(scene,camera);updateDirection();}
function angular(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}
function turnTo(index){yaw+=angular(-index*Math.PI/2,yaw);render();}
const list=document.getElementById('view-list');
for(const [i,label] of labels.entries()){
  const button=document.createElement('button');button.className='view-card';button.type='button';button.setAttribute('aria-label','转向'+label[0]);
  const img=document.createElement('img');img.src=base+files[i];img.alt='';
  const span=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small');
  strong.textContent=label.join(' · ');small.textContent=i*90+'° 方位';span.append(strong,small);button.append(img,span);list.append(button);
  button.addEventListener('click',()=>turnTo(i));
}
function updateDirection(){
  const i=((Math.round(-yaw/(Math.PI/2))%4)+4)%4;if(current===i)return;current=i;visited.add(i);
  document.getElementById('view-title').textContent=labels[i][0];document.getElementById('view-description').textContent=labels[i][1];
  document.getElementById('progress').textContent=`已看 ${visited.size} / 4 个方向`;
  [...list.children].forEach((button,n)=>button.setAttribute('aria-current',String(n===i)));
}
document.getElementById('previous').addEventListener('click',()=>turnTo((current+3)%4));
document.getElementById('following').addEventListener('click',()=>turnTo((current+1)%4));
document.addEventListener('keydown',event=>{if(event.key==='ArrowLeft')turnTo((current+3)%4);if(event.key==='ArrowRight')turnTo((current+1)%4);});
const canvas=renderer.domElement;
canvas.addEventListener('pointerdown',event=>{drag=[event.clientX,event.clientY];canvas.setPointerCapture(event.pointerId);});
canvas.addEventListener('pointermove',event=>{if(!drag)return;yaw-=(event.clientX-drag[0])*.005;pitch=T.MathUtils.clamp(pitch-(event.clientY-drag[1])*.005,-Math.PI/2+.001,Math.PI/2-.001);drag=[event.clientX,event.clientY];render();});
canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('wheel',event=>{event.preventDefault();camera.fov=T.MathUtils.clamp(camera.fov+event.deltaY*.025,45,100);camera.updateProjectionMatrix();render();},{passive:false});
new ResizeObserver(()=>{renderer.setSize(viewport.clientWidth,viewport.clientHeight);camera.aspect=viewport.clientWidth/viewport.clientHeight;camera.updateProjectionMatrix();render();}).observe(viewport);
status.textContent='已载入 · 固定中心环视';render();

document.getElementById('export-skybox').addEventListener('click',async()=>{
  const button=document.getElementById('export-skybox');button.disabled=true;status.textContent='正在导出天空盒…';
  try{
    const size=new T.Vector2();renderer.getSize(size);const ratio=renderer.getPixelRatio();
    const exportScene=new T.Scene(),exportCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);
    const mat=new T.ShaderMaterial({uniforms:{sky:{value:target.texture}},vertexShader:`varying vec2 uv0;void main(){uv0=uv;gl_Position=vec4(position.xy,0.0,1.0);}`,fragmentShader:`uniform samplerCube sky;varying vec2 uv0;void main(){float a=(uv0.x-0.5)*6.28318530718;float b=(uv0.y-0.5)*3.14159265359;vec3 d=vec3(sin(a)*cos(b),sin(b),-cos(a)*cos(b));gl_FragColor=textureCube(sky,d);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`});
    // Keep include directives on their own lines for GLSL preprocessing.
    mat.fragmentShader=mat.fragmentShader.replace(';#include',';\n#include');
    exportScene.add(new T.Mesh(new T.PlaneGeometry(2,2),mat));
    renderer.setPixelRatio(1);renderer.setSize(4096,2048,false);renderer.render(exportScene,exportCamera);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y);render();
    if(!blob)throw new Error('无法导出图片');
    const response=await fetch('/api/rectified-skybox',{method:'POST',headers:{'Content-Type':'image/png','X-CoffeeGame-Export':'1'},body:blob});
    if(!response.ok)throw new Error('保存失败，请确认使用项目本地服务');
    mat.dispose();status.textContent='已保存 4096 × 2048 天空盒';
  }catch(error){status.textContent=error.message;render();}finally{button.disabled=false;}
});
