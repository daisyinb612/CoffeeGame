import * as T from './vendor/three.module.min.js';

const directions = [
  { id: 'front', name: '前方', angle: 0 },
  { id: 'right', name: '右侧', angle: -Math.PI / 2 },
  { id: 'back', name: '后方', angle: -Math.PI },
  { id: 'left', name: '左侧', angle: Math.PI / 2 },
];
const names = {
  'coffee-bar.jpg': '咖啡机与置物架',
  'back-room.jpg': '门口与冰箱',
  'lounge.jpg': '店内长桌',
  'sink.jpg': '水槽与窗户',
};
const cleaned = {
  'coffee-bar.jpg': 'coffee-bar-clean-v2.png',
  'back-room.jpg': 'back-room-clean-v3.png',
  'lounge.jpg': 'lounge-clean-v1.png',
  'sink.jpg': 'sink-clean-v3.png',
};
const reviewed = {
  'coffee-bar.jpg': 'coffee-bar-review-v1.png',
  'back-room.jpg': 'back-room-review-v1.png',
  'lounge.jpg': 'lounge-review-v1.png',
  'sink.jpg': 'sink-review-v1.png',
};
const showOriginals = new URLSearchParams(location.search).has('original');
const reviewNames = {
  'coffee-bar.jpg': '完整制作台与水池',
  'back-room.jpg': '门口与通道尽头',
  'lounge.jpg': '工作台背面与展示柜',
  'sink.jpg': '窗户',
};
const fallback = ['coffee-bar.jpg', 'back-room.jpg', 'lounge.jpg', 'sink.jpg'];
let faces = Object.fromEntries(directions.map((direction, index) => [direction.id, fallback[index]]));
let mappingChanged = false;
try {
  const response = await fetch('assets/scene-boxes/scene-positions.json', { cache: 'no-store' });
  if (response.ok) {
    const saved = (await response.json()).faces;
    if (directions.every(direction => /^[\w.-]+\.(?:jpg|png|webp)$/i.test(saved?.[direction.id]))) {
      mappingChanged = directions.some(direction => saved[direction.id] !== faces[direction.id]);
      if (!mappingChanged) faces = saved;
    }
  }
} catch { /* Use the original photos until a mapping is saved. */ }
if (mappingChanged) document.querySelector('.note').textContent = '方向分配已改变；当前仍显示上一次生成的球形全景。请重新生成全景以应用新方向。';
const views = directions.map(direction => {
  const filename = faces[direction.id];
  return {
    ...direction,
    detail: (showOriginals ? names : reviewNames)[filename] || '已上传照片',
    src: `assets/scene-boxes/${showOriginals ? filename : reviewed[filename] || filename}`,
    edgeSrc: `assets/scene-boxes/${showOriginals ? cleaned[filename] || filename : reviewed[filename] || filename}`,
  };
});
const viewport = document.getElementById('viewport');
const list = document.getElementById('view-list');
const visited = new Set([0]);
let current = -1, yaw = 0, pitch = 0, drag = null;

const renderer = new T.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.outputColorSpace = T.SRGBColorSpace;
viewport.prepend(renderer.domElement);
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(90, viewport.clientWidth / viewport.clientHeight, .05, 100);
function aim() { camera.rotation.order = 'YXZ'; camera.rotation.y = yaw; camera.rotation.x = pitch; }
const textureLoader = new T.TextureLoader();
// One continuous latitude-longitude image covers the entire field of view.
// No face switching, alpha overlays, replacement floor, or cube-face blending.
const panorama = textureLoader.load(new URLSearchParams(location.search).has('previous') ? 'assets/scene-boxes/coffee-skybox-continuous-v2.png' : 'assets/scene-boxes/coffee-skybox-detail-v1.png');
panorama.colorSpace = T.SRGBColorSpace;
panorama.wrapS = T.RepeatWrapping;
panorama.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
const skyMaterial = new T.ShaderMaterial({
  side: T.BackSide,
  uniforms: { panorama: { value: panorama } },
  vertexShader: `varying vec3 ray;void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `uniform sampler2D panorama;varying vec3 ray;
    void main(){
      vec3 d=normalize(ray);
      float u=fract(atan(d.x,-d.z)/6.28318530718+0.125);
      float v=asin(clamp(d.y,-1.0,1.0))/3.14159265359+0.5;
      gl_FragColor=texture2D(panorama,vec2(u,v));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
scene.add(new T.Mesh(new T.SphereGeometry(50,128,64),skyMaterial));

views.forEach((view, index) => {
  const button = document.createElement('button'); button.className = 'view-card'; button.type = 'button';
  button.setAttribute('aria-label', `转向${view.name}`);
  const thumb = document.createElement('img'); thumb.src = view.src; thumb.alt = '';
  const label = document.createElement('span'), title = document.createElement('strong'), detail = document.createElement('small');
  title.textContent = `${view.name} · ${view.detail}`; detail.textContent = `${index * 90}° 方位`;
  label.append(title, detail); button.append(thumb, label); list.append(button);
  button.addEventListener('click', () => turnTo(index));
});
function angularDistance(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
function nearestDirection() {
  let best = 0, smallest = Infinity;
  views.forEach((view, index) => {
    const distance = Math.abs(angularDistance(yaw, view.angle));
    if (distance < smallest) { best = index; smallest = distance; }
  });
  return best;
}
function updateDirection() {
  const index = nearestDirection();
  if (index === current) return;
  current = index; visited.add(index);
  document.getElementById('view-title').textContent = views[index].name;
  document.getElementById('view-description').textContent = views[index].detail;
  document.getElementById('progress').textContent = `已看 ${visited.size} / 4 个方向`;
  [...list.children].forEach((button, buttonIndex) => button.setAttribute('aria-current', String(buttonIndex === index)));
}
function turnTo(index) {
  yaw += angularDistance(views[index].angle, yaw);
  aim(); updateDirection(); renderer.render(scene, camera);
}
document.getElementById('previous').addEventListener('click', () => turnTo((nearestDirection() + 3) % 4));
document.getElementById('following').addEventListener('click', () => turnTo((nearestDirection() + 1) % 4));
document.addEventListener('keydown', event => {
  if (event.key === 'ArrowRight') turnTo((nearestDirection() + 1) % 4);
  if (event.key === 'ArrowLeft') turnTo((nearestDirection() + 3) % 4);
});
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', event => { drag = [event.clientX, event.clientY]; canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener('pointermove', event => {
  if (!drag) return;
  yaw -= (event.clientX - drag[0]) * .005;
  pitch = T.MathUtils.clamp(pitch - (event.clientY - drag[1]) * .005, -1.48, 1.48);
  drag = [event.clientX, event.clientY]; aim();
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });
canvas.addEventListener('wheel', event => { event.preventDefault(); camera.fov = T.MathUtils.clamp(camera.fov + event.deltaY * .025, 42, 110); camera.updateProjectionMatrix(); }, { passive: false });
new ResizeObserver(() => { renderer.setSize(viewport.clientWidth, viewport.clientHeight); camera.aspect = viewport.clientWidth / viewport.clientHeight; camera.updateProjectionMatrix(); }).observe(viewport);
renderer.setAnimationLoop(() => {
  aim(); updateDirection(); renderer.render(scene, camera);
});
