import * as THREE from "./vendor/three.module.min.js";
import { createStudioEnvironment } from "./inventory-models.js?v=ice-3d";
import { buildScaleModels } from "./handle-scale-models.js?v=aligned-keys";

const minimum = 178;
const maximum = 182;
const basketFull = 180;
const overflowAt = 190;
const grinderLimit = 230;
const emptyHandle = 6212;
const stationLabels = { scale: "电子秤", grinder: "磨豆机", bin: "粉渣桶" };

function grindAmount(initial, elapsed) {
  let amount = initial;
  for (const [limit, rate] of [[140, .043], [166, .019], [grinderLimit, .007]]) {
    if (amount >= limit) continue;
    const increment = Math.min(limit - amount, elapsed * rate);
    amount += increment;
    elapsed = Math.max(0, elapsed - increment / rate);
  }
  return Math.floor(amount);
}

function makeButton(label, type, activate) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = type;
  button.textContent = label;
  button.onclick = activate;
  return button;
}

function brushGesture() {
  const icon = document.createElement("canvas");
  icon.width = icon.height = 96;
  icon.className = "handle-brush-icon";
  icon.setAttribute("aria-hidden", "true");
  const pen = icon.getContext("2d");
  if (!pen) return icon;
  pen.scale(2, 2);
  pen.beginPath();
  pen.moveTo(37, 34);
  pen.bezierCurveTo(31, 38, 26, 38, 21, 34);
  pen.lineTo(14, 28);
  pen.bezierCurveTo(11, 25, 14, 21, 17, 23);
  pen.lineTo(21, 26);
  pen.lineTo(7, 20);
  pen.bezierCurveTo(3, 18, 5, 13, 9, 14);
  pen.lineTo(23, 19);
  pen.bezierCurveTo(22, 14, 27, 12, 30, 17);
  pen.bezierCurveTo(31, 14, 36, 14, 37, 19);
  pen.bezierCurveTo(40, 16, 43, 18, 43, 23);
  pen.lineTo(43, 29);
  pen.bezierCurveTo(43, 31, 41, 33, 37, 34);
  pen.closePath();
  pen.fillStyle = "#fff8eb";
  pen.strokeStyle = "#65513e";
  pen.lineWidth = 2.25;
  pen.lineJoin = "round";
  pen.fill();
  pen.stroke();
  return icon;
}

class HandleScaleBench extends HTMLElement {
  connectedCallback() {
    if (this.cleanup) return;
    const scene = new THREE.Scene();
    const input = new AbortController();
    const events = { signal: input.signal };
    let renderer, environment, observer, frame = 0, dragFrame = 0, brushFrame = 0, releaseTare;
    this.cleanup = () => {
      input.abort();
      observer?.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(dragFrame);
      cancelAnimationFrame(brushFrame);
      clearTimeout(releaseTare);
      const geometry = new Set(), materials = new Set();
      scene.traverse(part => {
        if (part.geometry) geometry.add(part.geometry);
        if (part.material) materials.add(part.material);
        if (part.isLight) part.shadow?.dispose();
      });
      for (const item of geometry) item.dispose();
      for (const item of materials) {
        item.map?.dispose();
        item.dispose();
      }
      environment?.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
      this.replaceChildren();
      this.cleanup = null;
    };

    const unavailable = () => {
      this.cleanup?.();
      this.dispatchEvent(new Event("scale-bench-unavailable"));
    };

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      let shaderFailed = false;
      renderer.debug.onShaderError = () => { shaderFailed = true; };
      environment = createStudioEnvironment(renderer);
      scene.environment = environment.texture;
      scene.background = new THREE.Color("#ebe5da");
      const light = new THREE.DirectionalLight("#fff7ea", 1.9);
      light.position.set(-2.5, 5.3, 3.2);
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      Object.assign(light.shadow.camera, { left: -2.6, right: 2.6, top: 2.4, bottom: -2.4 });
      light.shadow.camera.updateProjectionMatrix();
      light.shadow.normalBias = .018;
      light.shadow.radius = 4;
      scene.add(light, new THREE.HemisphereLight("#f7faff", "#b7afa2", 1.2));
      const counter = new THREE.Mesh(new THREE.PlaneGeometry(12, 12),
        new THREE.MeshStandardMaterial({ color: "#ded7cb", roughness: .71 }));
      counter.rotation.x = -Math.PI / 2;
      counter.receiveShadow = true;
      scene.add(counter);

      const { handle, grounds, docks, markers, keys, outlet, updateSpill, updateBrushedPowder } = buildScaleModels(scene);
      const stream = new THREE.Mesh(new THREE.CylinderGeometry(.011, .024, 1, 12),
        new THREE.MeshBasicMaterial({ color: "#59412a" }));
      stream.position.copy(outlet);
      stream.visible = false;
      scene.add(stream);
      scene.traverse(part => {
        if (part.isMesh && part !== counter && !part.material.transparent) {
          part.castShadow = part !== stream;
          part.receiveShadow = true;
        }
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.29, .013, 8, 48),
        new THREE.MeshBasicMaterial({ color: "#987652" }));
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      scene.add(ring);
      handle.position.copy(docks.bench);

      const camera = new THREE.OrthographicCamera(-1.7, 1.7, 1.34, -1.34, .1, 20);
      camera.position.set(0, 3.75, 6.15);
      camera.lookAt(0, .48, .22);
      camera.updateMatrixWorld();

      const wrap = document.createElement("div");
      wrap.className = "handle-bench-view";
      const canvas = renderer.domElement;
      canvas.className = "handle-bench-canvas";
      canvas.setAttribute("aria-hidden", "true");
      const status = document.createElement("p");
      status.className = "handle-practice-status";
      status.setAttribute("role", "status");
      const fillMeter = document.createElement("progress");
      fillMeter.className = "handle-bench-fill";
      fillMeter.max = basketFull;
      fillMeter.value = 0;
      fillMeter.setAttribute("aria-label", "粉碗的目测填充程度");
      fillMeter.hidden = true;
      const readout = document.createElement("output");
      readout.className = "handle-bench-readout";
      readout.setAttribute("aria-label", "电子秤读数");
      readout.setAttribute("aria-live", "polite");
      const tare = makeButton("去皮", "handle-bench-device handle-bench-key", () => tareScale());
      const grinder = makeButton("接粉", "handle-bench-device handle-bench-key", event => {
        if (!skipClick || event.detail === 0) doseOnce();
      });
      const keysOnScreen = [[tare, keys.tare], [grinder, keys.grind]].map(([button, model]) => {
        const glow = document.createElement("span");
        glow.className = "handle-key-glow";
        glow.setAttribute("aria-hidden", "true");
        return { button, model, glow };
      });
      const remove = makeButton("拨粉", "handle-bench-device", () => removePowder());
      const gesture = brushGesture();
      remove.append(gesture);
      remove.setAttribute("aria-label", "用手拨一点粉");
      const confirm = makeButton("确认粉量", "primary", () => checkWeight());
      const accessible = document.createElement("div");
      accessible.className = "handle-bench-keyboard";
      for (const [name, label] of Object.entries(stationLabels)) {
        accessible.append(makeButton(`手柄移到${label}`, "", () => park(name)));
      }
      wrap.append(canvas, readout, ...keysOnScreen.map(key => key.glow), tare, grinder, remove);
      this.className = "handle-practice";
      this.append(wrap, fillMeter, status, accessible, confirm);

      let location = "bench", tareOffset = 0, dose = 0, spilled = 0, picked = false;
      let drag, dosing, skipClick = false, sweep = 0;
      const say = (message, needsCorrection = false) => {
        if (status.textContent !== message) status.textContent = message;
        status.classList.toggle("handle-practice-correction", needsCorrection);
      };
      const draw = () => {
        const parked = !drag?.moved && !picked;
        tare.toggleAttribute("data-next", parked && location === "scale" && !tareOffset && !dose);
        grinder.toggleAttribute("data-next", parked && location === "grinder" && Boolean(tareOffset) && !dosing);
        for (const { button, model, glow } of keysOnScreen) {
          const active = button.hasAttribute("data-next");
          model.cap.emissive.setHex(active ? 0x276472 : 0x000000);
          model.cap.emissiveIntensity = .32;
          glow.hidden = !active;
        }
        keys.grind.press.position.z = dosing ? -.018 : 0;
        confirm.hidden = location !== "scale" || !parked || !tareOffset || !dose;
        const fill = Math.min(1, dose / basketFull);
        const spread = .58 + .42 * Math.sqrt(fill);
        const height = .019 + .106 * fill ** .76 + Math.max(0, dose - basketFull) * .00062;
        grounds.visible = dose > 0;
        grounds.scale.set(spread, height, spread);
        if (stream.visible) {
          const bottom = handle.position.y + grounds.position.y + height;
          stream.position.y = (outlet.y + bottom) / 2;
          stream.scale.y = outlet.y - bottom;
        }
        updateSpill(spilled, stream.visible && dose >= overflowAt, performance.now());
        const showGesture = location === "bin" && !drag?.moved && (dose > 0 || sweep > 0);
        gesture.hidden = !showGesture;
        gesture.style.transform = `translateX(${-25 * Math.sin(Math.PI * sweep)}px)`;
        updateBrushedPowder(showGesture, sweep);
        renderer.render(scene, camera);
      };
      const handleOnScale = () => location === "scale" && !drag?.moved;
      const weightOnScale = () => (handleOnScale() ? emptyHandle + dose : 0) - tareOffset;
      const showWeight = () => {
        const weight = `${(weightOnScale() / 10).toFixed(1)} g`;
        if (readout.textContent !== weight) readout.textContent = weight;
      };

      const narrowTarget = (position, point) => {
        const { x, y } = position.clone().project(camera);
        return Math.hypot((x - point.x) * canvas.clientWidth / 2, (y - point.y) * canvas.clientHeight / 2);
      };
      const pointer = new THREE.Vector2(), pointerWorld = new THREE.Vector3();
      const ray = new THREE.Raycaster();
      const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.34);
      const locate = event => {
        const rect = canvas.getBoundingClientRect();
        pointer.set((event.clientX - rect.left) / rect.width * 2 - 1,
          1 - (event.clientY - rect.top) / rect.height * 2);
        ray.setFromCamera(pointer, camera);
        ray.ray.intersectPlane(dragPlane, pointerWorld);
      };
      const nearestDock = () => {
        let nearest, best = Math.max(35, canvas.clientWidth * .15);
        for (const name of Object.keys(stationLabels)) {
          const distance = narrowTarget(docks[name], pointer);
          if (distance >= best) continue;
          best = distance;
          nearest = name;
        }
        return nearest;
      };

      function park(destination) {
        stopDosing();
        picked = false;
        ring.visible = false;
        location = destination;
        fillMeter.hidden = location !== "grinder" || !tareOffset;
        handle.position.copy(docks[destination]);
        handle.rotation.y = location === "scale" ? -.49 : 0;
        showWeight();
        if (location === "scale") {
          if (dose) say("秤已扣掉空手柄的重量。看粉重，17.8–18.2 g 都可以。");
          else if (tareOffset) say("空手柄在秤上，读数是 0.0 g。现在可以去接粉。");
          else say("点秤上的「去皮」，让读数归零。");
        } else if (location === "grinder") {
          if (!tareOffset) say("先把空手柄放到电子秤上去皮，再接粉。", true);
          else say("点磨豆机上的「接粉」加 0.1 g，长按连续接粉。");
        } else if (location === "bin") {
          if (dose) say("点手势图标，每次拨掉 0.1 g。再放回秤上称。");
          else say("手柄里还没有粉。先把空手柄放到秤上去皮，再接粉。", true);
        } else {
          say("把空手柄拖到秤上。也可以点手柄，再点要放的位置。");
        }
        draw();
      }

      function tareScale() {
        if (!handleOnScale()) {
          say("手柄没在秤上。先放上空手柄，再按去皮。", true);
          return;
        }
        if (dose > 0) {
          say("手柄里已经有粉了。去皮要在接粉前做，这次直接看粉重。", true);
          return;
        }
        tareOffset = emptyHandle;
        keys.tare.press.position.z = -.018;
        clearTimeout(releaseTare);
        releaseTare = setTimeout(() => {
          keys.tare.press.position.z = 0;
          draw();
        }, 145);
        showWeight();
        say("现在是 0.0 g。秤记住了空手柄的重量，把手柄移到磨豆机下接粉。");
        draw();
      }

      const canDose = () => {
        if (location === "grinder" && tareOffset && !drag?.moved) return true;
        say(tareOffset ? "先把手柄放到磨豆机的出粉口下。" : "先把空手柄放到秤上去皮，再接粉。", true);
        return false;
      };
      const addDose = amount => {
        dose = Math.max(0, Math.min(overflowAt, amount));
        fillMeter.value = Math.min(dose, basketFull);
        showWeight();
        draw();
      };

      function dispense(increment) {
        const amount = dose + increment;
        if (amount >= overflowAt) spilled = Math.min(32, Math.max(1, spilled + amount - overflowAt));
        addDose(amount);
      }

      function doseOnce() {
        if (!canDose()) return;
        dispense(1);
        if (dose >= overflowAt) {
          say("咖啡粉从碗口溢出了。放回秤上称，再拨掉一点。", true);
        } else say(dose >= 175 ? "粉面接近碗口了。把手柄放回秤上称一下。"
          : "加了一点粉。可以继续接，也可以放回秤上。");
      }

      function startDosing() {
        if (dosing || !canDose()) return;
        const start = performance.now();
        dosing = { start, initial: dose, last: dose };
        const fill = now => {
          const elapsed = Math.max(0, now - start - 165);
          if (elapsed > 0) {
            const amount = grindAmount(dosing.initial, elapsed);
            stream.visible = amount < grinderLimit;
            if (amount > dosing.last) {
              dispense(amount - dosing.last);
              dosing.last = amount;
            } else if (stream.visible) draw();
            if (dose >= overflowAt) say("咖啡粉从碗口溢出了。松手，放回秤上称。", true);
            else if (amount >= 175) say("粉面接近碗口了。可以松手，回秤称重。");
          }
          frame = requestAnimationFrame(fill);
        };
        say("正在接粉。松开就停。");
        draw();
        frame = requestAnimationFrame(fill);
      }

      function stopDosing() {
        if (!dosing) return false;
        const held = performance.now() - dosing.start >= 165;
        dosing = undefined;
        cancelAnimationFrame(frame);
        stream.visible = false;
        if (held) {
          if (dose >= overflowAt) say("已经溢粉了。放回秤上称，再拨掉一点。", true);
          else say("接粉暂停。把手柄放回秤上看读数。");
        }
        draw();
        return held;
      }

      function removePowder() {
        if (location !== "bin" || drag?.moved) {
          say("把装粉的手柄移到粉渣桶上方，再拨掉一点。", true);
          return;
        }
        if (!dose) {
          say("手柄里还没有咖啡粉。先到磨豆机接粉。", true);
          return;
        }
        addDose(dose - 1);
        say("拨掉了 0.1 g。可以继续拨，也可以放回秤上。");
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        cancelAnimationFrame(brushFrame);
        const start = performance.now();
        const animate = now => {
          sweep = Math.min(1, (now - start) / 490);
          if (sweep === 1) sweep = 0;
          draw();
          if (sweep > 0) brushFrame = requestAnimationFrame(animate);
        };
        brushFrame = requestAnimationFrame(animate);
      }

      const checkWeight = () => {
        if (!handleOnScale()) {
          say("手柄没在秤上。把它放回秤上，再确认粉量。", true);
          return;
        }
        if (!tareOffset || !dose) {
          say(tareOffset ? "秤已归零。先接粉，再放回秤上确认。"
            : "先按去皮把空手柄的重量归零，再去接粉。", true);
          return;
        }
        const weight = weightOnScale();
        if (weight >= minimum && weight <= maximum) {
          this.dispatchEvent(new Event("scale-bench-complete"));
        } else {
          say(weight < minimum ? "粉量还少。到磨豆机补一点，再放回秤上。"
            : "粉量偏多。到粉渣桶拨掉一点，再放回秤上。", true);
        }
      };

      grinder.addEventListener("pointerdown", event => {
        if (event.button !== 0 || !event.isPrimary) return;
        skipClick = false;
        grinder.setPointerCapture(event.pointerId);
        startDosing();
      }, events);
      grinder.addEventListener("pointerup", () => { skipClick = stopDosing(); }, events);
      grinder.addEventListener("lostpointercapture", () => { if (dosing) skipClick = stopDosing(); }, events);
      grinder.addEventListener("keydown", event => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        if (!event.repeat) startDosing();
      }, events);
      grinder.addEventListener("keyup", event => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        if (!stopDosing()) doseOnce();
      }, events);
      grinder.addEventListener("blur", stopDosing, events);
      this.addEventListener("scale-bench-pause", stopDosing, events);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) stopDosing();
      }, events);

      canvas.addEventListener("pointerdown", event => {
        if (event.button !== 0 || drag || dosing) return;
        locate(event);
        const grip = handle.position.clone().add(new THREE.Vector3(0, 0, .40));
        const hit = narrowTarget(handle.position, pointer) < 33 || narrowTarget(grip, pointer) < 30;
        if (!hit && picked) {
          const target = nearestDock();
          if (target) park(target);
          else say("没点到放置位置。点电子秤、磨豆机出粉口下方或粉渣桶。", true);
          return;
        }
        if (!hit) return;
        drag = {
          id: event.pointerId, x: event.clientX, y: event.clientY,
          offsetX: handle.position.x - pointerWorld.x, offsetZ: handle.position.z - pointerWorld.z,
        };
        canvas.setPointerCapture(event.pointerId);
      }, events);
      const follow = event => {
        locate(event);
        const x = THREE.MathUtils.clamp(pointerWorld.x + drag.offsetX, -1.36, 1.43);
        const front = THREE.MathUtils.lerp(-.34, .065, THREE.MathUtils.smoothstep(x, .18, .45));
        handle.position.set(x, .31, THREE.MathUtils.clamp(pointerWorld.z + drag.offsetZ, front, 1.18));
        const target = nearestDock();
        ring.visible = Boolean(target);
        if (target) ring.position.set(docks[target].x, docks[target].y - .073, docks[target].z);
      };
      canvas.addEventListener("pointermove", event => {
        if (drag?.id !== event.pointerId) return;
        if (!drag.moved && Math.hypot(drag.x - event.clientX, drag.y - event.clientY) < 6) return;
        drag.moved = true;
        follow(event);
        showWeight();
        if (!dragFrame) dragFrame = requestAnimationFrame(() => { dragFrame = 0; draw(); });
      }, events);
      canvas.addEventListener("pointerup", event => {
        if (drag?.id !== event.pointerId) return;
        locate(event);
        const moved = drag.moved;
        drag = undefined;
        if (moved) {
          const target = nearestDock();
          park(target ?? location);
          if (!target) say("手柄放回原位了。拖到电子秤、出粉口下方或粉渣桶，再松手。", true);
        } else {
          picked = true;
          ring.position.set(handle.position.x, handle.position.y - .04, handle.position.z);
          ring.visible = true;
          say("现在点要放的位置，或把手柄拖过去。");
          draw();
        }
      }, events);
      canvas.addEventListener("lostpointercapture", event => {
        if (drag?.id !== event.pointerId) return;
        drag = undefined;
        park(location);
      }, events);
      canvas.addEventListener("webglcontextlost", unavailable, events);

      const align = (element, point) => {
        const { x, y } = point.clone().project(camera);
        element.style.left = `${50 + 50 * x}%`;
        element.style.top = `${50 - 50 * y}%`;
      };
      function alignKey({ button, model, glow }, w, h) {
        const project = (x, y) => {
          const point = model.group.localToWorld(new THREE.Vector3(x, y, model.faceZ)).project(camera);
          return new THREE.Vector2((point.x + 1) * w / 2, (1 - point.y) * h / 2);
        };
        const origin = project(-model.width / 2, model.height / 2);
        const right = project(model.width / 2, model.height / 2).sub(origin);
        const down = project(-model.width / 2, -model.height / 2).sub(origin);
        const width = model.width * 100, height = model.height * 100;
        glow.style.width = `${width}px`;
        glow.style.height = `${height}px`;
        glow.style.transform = `matrix(${right.x / width},${right.y / width},${down.x / height},${down.y / height},${origin.x},${origin.y})`;
        const center = project(0, 0);
        button.style.left = `${center.x}px`;
        button.style.top = `${center.y}px`;
      }
      const resize = () => {
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return;
        const halfWidth = Math.max(1.74, w / h * 1.28);
        const height = halfWidth * h / w;
        camera.left = -halfWidth;
        camera.right = halfWidth;
        camera.top = height + .12;
        camera.bottom = .12 - height;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        align(readout, markers.readout);
        for (const key of keysOnScreen) alignKey(key, w, h);
        align(remove, markers.remove);
        draw();
      };
      park("bench");
      resize();
      if (shaderFailed) throw Error("Could not render the scale bench.");
      observer = new ResizeObserver(resize);
      observer.observe(canvas);
    } catch {
      unavailable();
    }
  }

  disconnectedCallback() {
    this.cleanup?.();
  }
}

customElements.define("handle-scale-bench", HandleScaleBench);
