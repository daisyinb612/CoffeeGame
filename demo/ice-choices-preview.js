import * as THREE from "./vendor/three.module.min.js";
import { addIce, createIceResources, cupFloor, cupRim, icePiece, makeGlass } from "./ice-models.js?v=ice-scoop";

const examples = {
  "ice-heaped": { ice: 1.12 },
  "ice-half": { ice: .5 },
  "ice-full": { ice: .98 },
  "water-near-rim": { water: .97 },
  "water-eight": { water: .8 },
  "water-half": { water: .5 },
  "check-water": { water: .8, spill: "water" },
  "check-ice": { water: .8, spill: "ice" },
};
function addWater(group, fraction) {
  const y = THREE.MathUtils.lerp(cupFloor, cupRim, fraction);
  const radius = THREE.MathUtils.lerp(.275, .296, fraction);
  const shape = [[0, cupFloor], [.271, cupFloor], [radius, y], [0, y]];
  const water = new THREE.Mesh(
    new THREE.LatheGeometry(shape.map(([r, h]) => new THREE.Vector2(r, h)), 64),
    new THREE.MeshStandardMaterial({
      color: "#a6cbd1", roughness: .25, transparent: true, opacity: .21,
      depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  water.renderOrder = 2;
  const line = new THREE.Mesh(
    new THREE.TorusGeometry(radius - .003, .0065, 8, 64),
    new THREE.MeshBasicMaterial({ color: "#4b8193", transparent: true, opacity: .76, depthWrite: false }),
  );
  line.position.y = y;
  line.rotation.x = -Math.PI / 2;
  line.renderOrder = 3;
  group.add(water, line);
}

function addSpill(group, kind, shared) {
  if (kind === "ice") {
    for (const [x, z, scale, variant] of [[.51, .17, .20, 3], [.62, -.018, .142, 1]]) {
      const cube = icePiece(shared, variant);
      cube.position.set(x, -.703 + scale * .44, z);
      cube.rotation.y = x * 4;
      cube.scale.setScalar(scale);
      group.add(cube);
    }
    return;
  }
  const contour = new THREE.SplineCurve([
    new THREE.Vector2(-.26, -.035), new THREE.Vector2(-.14, -.105),
    new THREE.Vector2(.035, -.12), new THREE.Vector2(.19, -.06),
    new THREE.Vector2(.24, .046), new THREE.Vector2(.11, .112),
    new THREE.Vector2(-.08, .09), new THREE.Vector2(-.26, -.035),
  ]);
  const puddle = new THREE.Mesh(
    new THREE.ShapeGeometry(new THREE.Shape(contour.getPoints(28))),
    new THREE.MeshStandardMaterial({ color: "#8cbdd0", side: THREE.DoubleSide, roughness: .33 }),
  );
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(.44, -.697, .18);
  group.add(puddle);
}

function makeExample(example, shared) {
  if (!example) throw Error("Unknown cup example.");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f4f1ea");
  scene.environment = shared.environment.texture;
  const key = new THREE.DirectionalLight("#ffffff", 1.7);
  key.position.set(-2, 4, 3);
  scene.add(key, new THREE.HemisphereLight("#f0faff", "#c0b8ab", 1.18));
  const base = new THREE.Mesh(new THREE.CircleGeometry(.356, 40), shared.shadow);
  base.rotation.x = -Math.PI / 2;
  base.scale.y = .76;
  base.position.set(0, -.705, .028);
  scene.add(base);

  const object = new THREE.Group();
  object.add(makeGlass());
  addIce(object, example.ice ?? example.water, shared);
  if (example.water) addWater(object, example.water);
  if (example.spill) addSpill(object, example.spill, shared);
  scene.add(object);
  return { scene, object };
}

class IceChoicesPreview extends HTMLElement {
  connectedCallback() {
    if (this.cleanup) return;
    const controls = Array.from(this.querySelectorAll("[data-ice-example]"));
    const note = this.querySelector(".practice-image-note");
    const views = [];
    const input = new AbortController();
    const events = { signal: input.signal };
    let renderer, shared, observer, frame = 0;
    this.cleanup = () => {
      input.abort();
      observer?.disconnect();
      cancelAnimationFrame(frame);
      const geometries = new Set();
      const materials = new Set();
      for (const { scene } of views) {
        scene.traverse(object => {
          if (object.geometry) geometries.add(object.geometry);
          if (object.material) materials.add(object.material);
        });
      }
      for (const control of controls) {
        control.querySelector(".ice-model")?.remove();
        control.querySelector("img").hidden = false;
      }
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      shared?.environment.dispose();
      const context = renderer?.getContext();
      renderer?.dispose();
      if (context && !context.isContextLost()) renderer.forceContextLoss();
      note.textContent = "练习示意";
      this.cleanup = null;
    };

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
      let shaderFailed = false;
      renderer.debug.onShaderError = () => { shaderFailed = true; };
      const { domElement: source } = renderer;
      shared = createIceResources(renderer);

      const ratio = Math.min(2, Math.max(devicePixelRatio, 1.5));
      let yaw = -.34, elevation = .25;
      const camera = new THREE.PerspectiveCamera(35, 1, .1, 12);
      const paint = () => {
        frame = 0;
        for (const { scene, object, canvas, context } of views) {
          const w = Math.round(canvas.clientWidth * ratio);
          const h = Math.round(canvas.clientHeight * ratio);
          if (!w || !h) continue;
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }
          if (source.width !== w || source.height !== h) renderer.setSize(w, h, false);
          object.rotation.y = yaw;
          camera.aspect = w / h;
          camera.position.set(0, 3.03 * Math.sin(elevation), 3.03 * Math.cos(elevation));
          camera.lookAt(.035, .025, 0);
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);
          context.drawImage(source, 0, 0);
        }
      };
      const queuePaint = () => { if (!frame) frame = requestAnimationFrame(paint); };
      let pointer;
      for (const control of controls) {
        const photo = control.querySelector("img");
        const canvas = document.createElement("canvas");
        canvas.setAttribute("aria-hidden", "true");
        const context = canvas.getContext("2d");
        canvas.className = "ice-model";
        control.insertBefore(canvas, photo);
        const example = examples[control.dataset.iceExample];
        views.push({ ...makeExample(example, shared), canvas, context });
        photo.hidden = true;

        let ignoreClick = false;
        control.addEventListener("pointerdown", () => { ignoreClick = false; }, { ...events, capture: true });
        canvas.addEventListener("pointerdown", event => {
          if (event.button !== 0 || pointer) return;
          ignoreClick = false;
          pointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY };
          canvas.setPointerCapture(event.pointerId);
        }, events);
        canvas.addEventListener("pointermove", event => {
          if (pointer?.id !== event.pointerId) return;
          if (!ignoreClick && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 6) return;
          ignoreClick = true;
          yaw += (event.clientX - pointer.x) * .024;
          elevation = THREE.MathUtils.clamp(elevation + (event.clientY - pointer.y) * .009, .10, .58);
          pointer.x = event.clientX;
          pointer.y = event.clientY;
          queuePaint();
        }, events);
        canvas.addEventListener("lostpointercapture", event => {
          if (pointer?.id === event.pointerId) pointer = null;
        }, events);
        control.addEventListener("click", event => {
          if (ignoreClick && event.detail > 0) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
          ignoreClick = false;
        }, { ...events, capture: true });
      }
      this.addEventListener("keydown", event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        yaw += event.key === "ArrowLeft" ? -.26 : .26;
        queuePaint();
      }, events);
      source.addEventListener("webglcontextlost", () => this.cleanup(), events);
      paint();
      if (shaderFailed) throw Error("Could not render the glass cups.");
      observer = new ResizeObserver(queuePaint);
      for (const { canvas } of views) observer.observe(canvas);
      note.textContent = "拖动转杯，轻点选择";
    } catch {
      this.cleanup();
    }
  }

  disconnectedCallback() {
    this.cleanup?.();
  }
}

customElements.define("ice-choices-preview", IceChoicesPreview);
