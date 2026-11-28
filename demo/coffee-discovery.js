import * as T from './vendor/three.module.min.js';
import {ITEMS,panoramaVector} from './coffee-discovery-data.js';

const $=id=>document.getElementById(id);
const storageKey='coffeegame.discovery.v1';
const known=new Set();
try {const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(saved))for(const id of saved)if(ITEMS.some(item=>item.id===id))known.add(id);}catch{/* Storage is optional. */}
let filter='all',active=null,returnFocus=null,ready=false;
let yaw=-.42,pitch=-.12,drag=null,target=null,frame=0,lastTime=0;
let renderer,camera,scene,texture;
const entries=[];
const game=document.querySelector('.game');
const itemDialog=$('item-dialog');
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;

function save(){try{localStorage.setItem(storageKey,JSON.stringify([...known]));return true;}catch{return false;}}
const mobile=matchMedia('(max-width: 850px)');
function setCollection(open){game.classList.toggle('collection-open',open);$('collection-button').setAttribute('aria-expanded',String(open));$('collection').inert=mobile.matches&&!open;}
mobile.addEventListener('change',()=>setCollection(game.classList.contains('collection-open')));
setCollection(false);
function updateCollection(){
  $('progress').value=known.size;$('progress').max=ITEMS.length;
  $('progress-text').textContent=`已认识 ${known.size} / ${ITEMS.length} 件`;
  $('compact-count').textContent=`${known.size}/${ITEMS.length}`;
  $('completion').hidden=known.size!==ITEMS.length;
  const list=$('item-list');list.replaceChildren();
  for(const [index,item] of ITEMS.entries()){
    if(filter==='new'&&known.has(item.id)||filter==='known'&&!known.has(item.id))continue;
    const button=document.createElement('button');button.type='button';button.className='item-card';button.dataset.known=String(known.has(item.id));button.dataset.itemId=item.id;
    button.setAttribute('aria-label',`查看${item.name}${known.has(item.id)?'，已认识':''}`);
    const number=document.createElement('span');number.className='item-number';number.textContent=known.has(item.id)?'✓':String(index+1).padStart(2,'0');
    const copy=document.createElement('span'),name=document.createElement('strong'),area=document.createElement('small');name.textContent=item.name;area.textContent=item.area;copy.append(name,area);
    const state=document.createElement('span');state.className='state';state.textContent=known.has(item.id)?'已认识':'去看看';button.append(number,copy,state);
    button.addEventListener('click',()=>openItem(item,button));list.append(button);
  }
  $('empty-list').hidden=list.childElementCount!==0;
  for(const {item,button} of entries){button.dataset.known=String(known.has(item.id));button.querySelector('.pin').textContent=known.has(item.id)?'✓':String(ITEMS.indexOf(item)+1);button.setAttribute('aria-label',`查看${item.name}${known.has(item.id)?'，已认识':''}`);}
}
function updatePhoto(){
  if(!active)return;
  const [file,x,y]=active.photo,el=$('item-photo');
  const w=el.clientWidth,h=el.clientHeight,iw=w*2.5,ih=iw*.75;
  el.style.backgroundImage=`url("assets/scene-boxes/${file}")`;
  el.style.backgroundSize=`${iw}px ${ih}px`;
  el.style.backgroundPosition=`${w*.5-x*iw}px ${h*.5-y*ih}px`;
  el.setAttribute('aria-label',`${active.name}的原照片特写`);
}
function openItem(item,trigger,fromScene=false){
  active=item;returnFocus=trigger||document.activeElement;
  $('item-title').textContent=item.name;$('item-category').textContent=`${item.category} · ${item.area}`;
  $('item-known').textContent=known.has(item.id)?'已收进图鉴':'还没认识';
  $('item-summary').textContent=item.summary;$('item-use').textContent=item.use;$('item-tip').textContent=item.tip;
  $('got-it').textContent=known.has(item.id)?'返回场景':'我知道啦';
  $('locate-item').hidden=fromScene;
  $('locate-item').textContent='去它的位置';
  if(!itemDialog.open)itemDialog.showModal();updatePhoto();
  $('close-item').focus();
}
function closeItem(){if(itemDialog.open)itemDialog.close();}
itemDialog.addEventListener('close',()=>{
  const id=active?.id;active=null;
  const candidate=returnFocus?.isConnected?returnFocus:(id?$(`item-list`).querySelector(`[data-item-id="${id}"]`):null);
  if(candidate&&!candidate.closest('[inert]'))candidate.focus();
  else if(mobile.matches)$('collection-button').focus();
  requestRender();
});
$('close-item').addEventListener('click',closeItem);
itemDialog.addEventListener('click',event=>{if(event.target===itemDialog){const r=itemDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeItem();}});
$('got-it').addEventListener('click',()=>{
  if(!active)return;known.add(active.id);const persisted=save();updateCollection();
  $('scene-status').textContent=known.size===ITEMS.length?'所有物品都认识啦！也可以再看一遍。':`认识了${active.name} · 已认识 ${known.size}/${ITEMS.length} 件${persisted?'':'（当前浏览器无法保存进度）'}`;
  closeItem();
});
function angleDelta(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}
function guideTo(item){
  if(!ready){$('scene-status').textContent='全景暂时不可用，可以继续查看图鉴。';return;}
  const aimYaw=-(item.u-.125)*Math.PI*2,aimPitch=(.5-item.y)*Math.PI;
  target={yaw:yaw+angleDelta(aimYaw,yaw),pitch:aimPitch};
  if(reduceMotion){yaw=target.yaw;pitch=target.pitch;target=null;}
  for(const entry of entries)entry.button.classList.toggle('is-target',entry.item.id===item.id);
  $('scene-status').textContent=`找到${item.name}了，点击它旁边的标记。`;setCollection(false);requestRender();
}
$('locate-item').addEventListener('click',()=>{const item=active;closeItem();if(item)guideTo(item);});
$('collection-button').addEventListener('click',()=>setCollection(!game.classList.contains('collection-open')));
$('close-collection').addEventListener('click',()=>{setCollection(false);$('collection-button').focus();});
$('open-fallback').addEventListener('click',()=>setCollection(true));
for(const button of document.querySelectorAll('[data-filter]'))button.addEventListener('click',()=>{filter=button.dataset.filter;for(const b of document.querySelectorAll('[data-filter]'))b.setAttribute('aria-pressed',String(b===button));updateCollection();});
$('help-button').addEventListener('click',()=>$('help-dialog').showModal());$('close-help').addEventListener('click',()=>$('help-dialog').close());
$('reset-progress').addEventListener('click',()=>$('reset-dialog').showModal());$('cancel-reset').addEventListener('click',()=>$('reset-dialog').close());
$('confirm-reset').addEventListener('click',()=>{known.clear();save();filter='all';document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter==='all')));updateCollection();$('reset-dialog').close();$('scene-status').textContent='重新开始啦，找一件你感兴趣的物品吧。';});
for(const button of document.querySelectorAll('[data-direction]'))button.addEventListener('click',()=>{
  const front=Number(button.dataset.direction)===0;
  target={yaw:yaw+angleDelta(front?-.42:-Number(button.dataset.direction)*Math.PI/2,yaw),pitch:front?-.12:0};
  if(reduceMotion){yaw=target.yaw;pitch=0;target=null;}requestRender();
});

function updateMarkers(){
  if(!camera)return;
  camera.updateMatrixWorld();
  const width=$('scene').clientWidth,height=$('scene').clientHeight;
  const forward=camera.getWorldDirection(new T.Vector3());
  for(const entry of entries){
    const {point,button}=entry,p=point.clone().project(camera);
    const x=(p.x*.5+.5)*width,y=(-p.y*.5+.5)*height;
    const visible=point.dot(forward)>0&&p.z<1&&x>24&&x<width-24&&y>115&&y<height-125;
    button.hidden=!visible;
    if(visible){button.style.transform=`translate(${x}px,${y}px) translate(-21px,-21px)`;button.classList.toggle('label-left',x>width-170);}
  }
  const direction=((Math.round(-yaw/(Math.PI/2))%4)+4)%4;
  document.querySelectorAll('[data-direction]').forEach(b=>b.setAttribute('aria-current',String(Number(b.dataset.direction)===direction)));
}
function render(time){
  frame=0;if(!ready)return;
  const elapsed=Math.min(50,Math.max(1,time-lastTime));lastTime=time;
  if(target&&!itemDialog.open){
    const speed=1-Math.exp(-elapsed/90);yaw+=(target.yaw-yaw)*speed;pitch+=(target.pitch-pitch)*speed;
    if(Math.abs(target.yaw-yaw)<.001&&Math.abs(target.pitch-pitch)<.001){yaw=target.yaw;pitch=target.pitch;target=null;}
  }
  camera.rotation.set(pitch,yaw,0,'YXZ');renderer.render(scene,camera);updateMarkers();
  if(target&&!itemDialog.open)requestRender();
}
function requestRender(){if(!frame&&ready)frame=requestAnimationFrame(render);}
function fail(){ready=false;$('load-error').hidden=false;$('scene-status').textContent='全景暂时无法显示，物品图鉴仍可使用。';}
updateCollection();
try{
  renderer=new T.WebGLRenderer({antialias:true});renderer.outputColorSpace=T.SRGBColorSpace;renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  $('scene').prepend(renderer.domElement);
  scene=new T.Scene();camera=new T.PerspectiveCamera(76,1,.05,100);camera.rotation.order='YXZ';
  const material=new T.ShaderMaterial({side:T.BackSide,uniforms:{panorama:{value:null}},vertexShader:`varying vec3 ray;void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`uniform sampler2D panorama;varying vec3 ray;void main(){vec3 d=normalize(ray);float u=fract(atan(d.x,-d.z)/6.28318530718+0.125);float v=asin(clamp(d.y,-1.0,1.0))/3.14159265359+0.5;gl_FragColor=texture2D(panorama,vec2(u,v));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`});
  scene.add(new T.Mesh(new T.SphereGeometry(50,96,64),material));
  for(const [i,item] of ITEMS.entries()){
    const button=document.createElement('button');button.type='button';button.className='hotspot';button.dataset.hotspotId=item.id;button.hidden=true;
    const pin=document.createElement('span');pin.className='pin';pin.textContent=String(i+1);pin.setAttribute('aria-hidden','true');
    const label=document.createElement('span');label.className='pin-label';label.textContent=item.name;button.append(pin,label);
    button.addEventListener('pointerdown',event=>event.stopPropagation());button.addEventListener('click',()=>openItem(item,button,true));
    $('markers').append(button);entries.push({item,button,point:panoramaVector(T,item.u,item.y)});
  }
  texture=await new T.TextureLoader().loadAsync('assets/scene-boxes/coffee-skybox-detail-v1.png');
  texture.colorSpace=T.SRGBColorSpace;texture.wrapS=T.RepeatWrapping;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());material.uniforms.panorama.value=texture;
  ready=true;
  const resize=()=>{const w=$('scene').clientWidth,h=$('scene').clientHeight;renderer.setSize(w,h,false);camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();updatePhoto();requestRender();};
  new ResizeObserver(resize).observe($('scene'));resize();updateCollection();
  $('scene-status').textContent='拖动画面环视 · 点击圆形标记认识物品';
  const canvas=renderer.domElement;
  canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;target=null;drag={x:event.clientX,y:event.clientY,yaw,pitch};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{if(!drag)return;yaw=drag.yaw-(event.clientX-drag.x)*.004;pitch=T.MathUtils.clamp(drag.pitch-(event.clientY-drag.y)*.004,-1.35,1.35);requestRender();});
  canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);canvas.addEventListener('lostpointercapture',()=>drag=null);
  const zoom=amount=>{camera.fov=T.MathUtils.clamp(camera.fov+amount,45,95);camera.updateProjectionMatrix();requestRender();};
  canvas.addEventListener('wheel',event=>{event.preventDefault();zoom(event.deltaY*.025);},{passive:false});
  $('zoom-in').addEventListener('click',()=>zoom(-8));$('zoom-out').addEventListener('click',()=>zoom(8));
  document.addEventListener('keydown',event=>{
    if(document.querySelector('dialog[open]')||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;
    const steps={ArrowLeft:[.14,0],ArrowRight:[-.14,0],ArrowUp:[0,.10],ArrowDown:[0,-.10]};
    if(steps[event.key]){event.preventDefault();target=null;yaw+=steps[event.key][0];pitch=T.MathUtils.clamp(pitch+steps[event.key][1],-1.35,1.35);requestRender();}
  });
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fail();});
  let seenHelp=false;try{seenHelp=localStorage.getItem(storageKey+'.help')==='1';localStorage.setItem(storageKey+'.help','1');}catch{seenHelp=known.size>0;}
  if(!seenHelp)$('help-dialog').showModal();
  requestRender();
}catch(error){console.error('Unable to display café panorama:',error);fail();}
window.addEventListener('pagehide',event=>{if(!event.persisted){cancelAnimationFrame(frame);texture?.dispose();renderer?.dispose();}});
window.addEventListener('pageshow',()=>requestRender());
