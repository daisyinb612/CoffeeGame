import * as THREE from "./vendor/three.module.min.js";
import { createInventoryModel, createStudioEnvironment } from "./inventory-models.js?v=ice-3d";

class InventoryPreview extends HTMLElement {
  connectedCallback() {
    if (this.cleanup) return;
    let renderer, model, environment, observer;
    const photo = this.previousElementSibling;
    const input = new AbortController();
    const events = { signal: input.signal };
    this.cleanup = () => {
      input.abort();
      observer?.disconnect();
      const materials = new Set();
      model?.traverse(object => {
        object.geometry?.dispose();
        if (object.material) materials.add(object.material);
      });
      for (const material of materials) {
        material.map?.dispose();
        material.dispose();
      }
      environment?.dispose();
      renderer?.dispose();
      if (renderer && !renderer.getContext().isContextLost()) renderer.forceContextLoss();
      renderer?.domElement.remove();
      this.cleanup = null;
    };
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      let shaderFailed = false;
      renderer.debug.onShaderError = () => { shaderFailed = true; };
      const glass = this.dataset.model === "glass" || this.dataset.model === "measuring-cup";
      renderer.setPixelRatio(THREE.MathUtils.clamp(devicePixelRatio, glass ? 1.5 : 1, 1.75));

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, 1, .1, 20);
      camera.position.set(0, .60, 3.05);
      camera.lookAt(0, 0, 0);

      const { object, pose, studio } = createInventoryModel(this.dataset.model);
      model = object;
      model.rotation.set(...pose, "YXZ");
      scene.add(model);
      if (studio) {
        environment = createStudioEnvironment(renderer);
        scene.environment = environment.texture;
        const key = new THREE.DirectionalLight("#fff6e8", 1.8);
        key.position.set(-2, 4, 3);
        scene.add(key, new THREE.HemisphereLight("#fff8ed", "#878784", 1.2));
      }

      const { domElement: canvas } = renderer;
      const draw = () => renderer.render(scene, camera);
      const rotate = (dx, dy) => {
        model.rotation.y += dx * .018;
        model.rotation.x = THREE.MathUtils.clamp(model.rotation.x + dy * .014, -1.3, 1.3);
        draw();
      };
      let pointer;
      canvas.addEventListener("pointerdown", event => {
        if (pointer || event.button !== 0) return;
        pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
        canvas.setPointerCapture(event.pointerId);
      }, events);
      canvas.addEventListener("pointermove", event => {
        if (pointer?.id !== event.pointerId) return;
        rotate(event.clientX - pointer.x, event.clientY - pointer.y);
        pointer.x = event.clientX;
        pointer.y = event.clientY;
      }, events);
      canvas.addEventListener("lostpointercapture", () => { pointer = null; }, events);
      canvas.addEventListener("webglcontextlost", () => {
        this.hidden = true;
        photo.hidden = false;
        this.cleanup();
      }, events);
      canvas.tabIndex = 0;
      canvas.setAttribute("aria-label", `${photo.alt} 3D 模型，可拖动或用方向键旋转`);
      canvas.addEventListener("keydown", event => {
        const steps = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -14], ArrowDown: [0, 14] };
        if (!steps[event.key]) return;
        event.preventDefault();
        rotate(...steps[event.key]);
      }, events);
      this.append(canvas);
      this.hidden = false;
      const resize = () => {
        const { clientWidth: width, clientHeight: height } = this;
        if (!width || !height) return;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        draw();
      };
      resize();
      if (shaderFailed) throw Error("Inventory model could not be rendered.");
      observer = new ResizeObserver(resize);
      observer.observe(this);
      photo.hidden = true;
    } catch {
      this.hidden = true;
      photo.hidden = false;
      this.cleanup();
    }
  }

  disconnectedCallback() {
    this.cleanup?.();
  }
}

customElements.define("coffee-object", InventoryPreview);
