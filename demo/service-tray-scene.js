import * as THREE from "./vendor/three.module.min.js";
import { createCoffeeDrink } from "./coffee-drink.js?v=serving-density";
import { createIceResources, icePiece } from "./ice-models.js";
import { createInventoryModel } from "./inventory-models.js";

export function mountServiceScene(bench) {
  if (!bench.isConnected) return;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const resources = createIceResources(renderer);
  const scene = new THREE.Scene();
  scene.environment = resources.environment.texture;
  const camera = new THREE.OrthographicCamera(-2.5, 2.5, 2.15, -2.15, .1, 30);
  camera.position.set(0, 6.3, 6);
  camera.lookAt(0, .25, -.25);
  const light = new THREE.DirectionalLight(0xfff3de, 2.1);
  light.position.set(-2, 5, 4);
  scene.add(light, new THREE.HemisphereLight(0xffffff, 0xa3907d, 1.4));

  const tray = createInventoryModel("tray").object;
  tray.scale.set(2.4, .8, 2.4);
  tray.position.z = .4;
  tray.material.roughness = .35;
  scene.add(tray);
  const drink = createCoffeeDrink(resources, { finishedOpacity: .88 });
  drink.setState(1, 1, Math.PI * 4);
  drink.cup.scale.setScalar(1.2);
  // Two ice pieces break the liquid surface and catch the studio reflections.
  for (let i = 0; i < 2; i++) {
    const cube = icePiece(resources, i);
    cube.scale.setScalar(.18);
    cube.position.set(i ? .105 : -.09, .52, i ? .05 : -.055);
    cube.children[0].material = new THREE.MeshPhysicalMaterial({
      color: 0xd4b588, roughness: .12, metalness: 0, clearcoat: .85,
      transparent: true, opacity: .72, depthWrite: false,
    });
    cube.children[0].renderOrder = 3;
    cube.rotation.set(.2, i * 1.4, .16);
    drink.cup.add(cube);
  }
  const straw = createInventoryModel("straw").object;
  straw.rotation.x = Math.PI / 2;
  const napkin = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 1.12), new THREE.MeshStandardMaterial({
    color: 0xfffdfa, transparent: true, roughness: .95, side: THREE.DoubleSide, depthWrite: false,
  }));
  paper.rotation.x = -Math.PI / 2;
  napkin.add(paper);
  napkin.rotation.y = -.04;
  let disposed = false;
  new THREE.TextureLoader().load("assets/service/folded-napkin.png", texture => {
    if (disposed) { texture.dispose(); return; }
    texture.colorSpace = THREE.SRGBColorSpace;
    paper.material.map = texture;
    paper.material.needsUpdate = true;
  });
  const items = [
    { name: "cup", object: drink.cup, start: new THREE.Vector3(-1.1, .85, -1.35), end: new THREE.Vector3(0, .85, .6) },
    { name: "straw", object: straw, start: new THREE.Vector3(.05, .06, -1.7), end: new THREE.Vector3(1.1, .06, .6) },
    { name: "napkin", object: napkin, start: new THREE.Vector3(1.1, .04, -1.7), end: new THREE.Vector3(-1.05, .04, .6) },
  ];
  for (const item of items) {
    item.element = bench.querySelector(`.service-${item.name}`);
    item.object.position.copy(item.start);
    scene.add(item.object);
  }
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(.85, .7), new THREE.MeshBasicMaterial({
    color: 0x4e3926, transparent: true, opacity: .18, depthWrite: false,
  }));
  contact.rotation.x = -Math.PI / 2;
  // A radial alpha map keeps the contact shadow soft without changing the glass.
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 64;
  const context = shadowCanvas.getContext("2d");
  const gradient = context.createRadialGradient(32,32,4,32,32,32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0,0,64,64);
  contact.material.map = new THREE.CanvasTexture(shadowCanvas);
  scene.add(contact);

  renderer.domElement.setAttribute("aria-hidden", "true");
  bench.prepend(renderer.domElement);
  bench.dataset.webgl = "true";
  let width = 0, height = 0, previous = performance.now();
  const projected = new THREE.Vector3();
  function render(now) {
    const bounds = bench.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    if (width !== bounds.width || height !== bounds.height) {
      width = bounds.width;
      height = bounds.height;
      renderer.setSize(width, height, false);
      camera.top = Math.max(2.15, 2.5 * height / width);
      camera.bottom = -camera.top;
      camera.right = camera.top * width / height;
      camera.left = -camera.right;
      camera.updateProjectionMatrix();
    }
    const step = 1 - Math.exp(-Math.min(now - previous, 64) / 95);
    previous = now;
    for (const item of items) {
      const destination = item.element.hasAttribute("data-placed") ? item.end : item.start;
      item.object.position.lerp(destination, step);
    }
    contact.position.set(drink.cup.position.x, .012, drink.cup.position.z);
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    for (const item of items) {
      const box = new THREE.Box3().setFromObject(item.object);
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            projected.set(x, y, z).project(camera);
            const px = (projected.x + 1) * width / 2;
            const py = (1 - projected.y) * height / 2;
            left = Math.min(left, px); right = Math.max(right, px);
            top = Math.min(top, py); bottom = Math.max(bottom, py);
          }
        }
      }
      Object.assign(item.element.style, {
        left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px`,
      });
    }
    renderer.render(scene, camera);
  }
  const observer = new MutationObserver(() => { if (!bench.isConnected) cleanup(); });
  observer.observe(bench.parentElement.parentElement, { childList: true });
  function cleanup() {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    renderer.setAnimationLoop(null);
    const materials = new Set();
    scene.traverse(object => {
      object.geometry?.dispose();
      if (object.material) materials.add(object.material);
    });
    materials.forEach(material => { material.map?.dispose(); material.dispose(); });
    resources.shadow.dispose();
    resources.environment.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    delete bench.dataset.webgl;
  }
  renderer.setAnimationLoop(render);
  return cleanup;
}
