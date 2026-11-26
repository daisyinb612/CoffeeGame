import * as T from "./vendor/three.module.min.js";
import { buildFilledHandle } from "./handle-scale-models.js?v=distribution-tamp";
import { createInventoryModel, createStudioEnvironment, woodMaterial } from "./inventory-models.js?v=wood-grain";

const turn = 2 * Math.PI;
const cueColors = {
  action: "#22566d",
  actionLight: "#a0d9eb",
  target: "#78614c",
  targetLight: "#efddbf",
};
const steps = [
  ["按住手柄握把，拖到木底座。", "手柄放到底座", "木底座"],
  ["按住布粉器，拖到粉碗上。", "放上布粉器", "粉碗"],
  ["按住布粉器边缘，沿箭头转动。", "转一圈"],
  ["已转满两圈，把布粉器拖回原位。", "放回布粉器", "布粉器原位"],
  ["按住压粉锤木柄，拖到粉碗上。", "放上压粉锤", "粉碗"],
  ["按住木柄向下拖，压到底再松手。", "向下压一次"],
  ["压粉完成。提起压粉锤，拖回左侧的原位。", "放回压粉锤", "压粉锤原位"],
];
const done = steps.length;

export function showDistribution(host, { button, pass }) {
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
  } catch {
    return false;
  }
  const scene = new T.Scene();
  scene.background = new T.Color("#eeeae0");
  const env = createStudioEnvironment(renderer);
  scene.environment = env.texture;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  const light = new T.DirectionalLight("#fff6eb", 2.05);
  light.position.set(-2, 5, 3);
  light.castShadow = true;
  light.shadow.mapSize.set(768, 768);
  Object.assign(light.shadow.camera, { left: -2.2, right: 2.2, top: 2, bottom: -2, near: .1, far: 10 });
  light.shadow.camera.updateProjectionMatrix();
  light.shadow.normalBias = .012;
  light.shadow.intensity = .60;
  scene.add(light, new T.HemisphereLight("#f3f8fd", "#bfb0a1", .95));
  const camera = new T.OrthographicCamera(-1.65, 1.65, 1.3, -1.3, .1, 20);
  camera.position.set(0, 4.8, 4.3);
  camera.lookAt(0, .05, .12);
  camera.updateMatrixWorld();
  const material = color => new T.MeshStandardMaterial({ color, roughness: .68 });
  function mesh(parent, geometry, paint, x, y, z) {
    const object = new T.Mesh(geometry, paint);
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  }
  const counter = mesh(scene, new T.BoxGeometry(6, .08, 6), material("#d8cfc0"), 0, -.04, 0);
  const baseX = .59, baseZ = .16;
  const shape = new T.Shape();
  const w = .53, d = .55, r = .14;
  shape.moveTo(-w + r, -d);
  shape.lineTo(w - r, -d).quadraticCurveTo(w, -d, w, -d + r);
  shape.lineTo(w, d - r).quadraticCurveTo(w, d, w - r, d);
  shape.lineTo(-w + r, d).quadraticCurveTo(-w, d, -w, d - r);
  shape.lineTo(-w, -d + r).quadraticCurveTo(-w, -d, -w + r, -d);
  const socket = new T.Path();
  socket.absarc(0, 0, .268, 0, turn, true);
  shape.holes.push(socket);
  const wood = woodMaterial([118, 75, 43], { grainContrast: 1.55, roughness: .62, bumpScale: .003 });
  const baseGeometry = new T.ExtrudeGeometry(shape, { depth: .096, bevelSize: .009,
    bevelThickness: .009, bevelSegments: 3, curveSegments: 28 });
  const base = mesh(scene, baseGeometry, wood, baseX, .012, baseZ);
  base.rotation.x = -Math.PI / 2;
  mesh(scene, new T.CylinderGeometry(.273, .273, .035, 64), material("#493728"), baseX, .018, baseZ);
  const seat = mesh(scene, new T.RingGeometry(.10, .244, 64), material("#322b25"), baseX, .112, baseZ);
  seat.rotation.x = -Math.PI / 2;
  const { handle, grounds } = buildFilledHandle(scene);
  const handleHome = new T.Vector3(-.86, .12, .14);
  const handleDock = new T.Vector3(baseX, .216, baseZ);
  handle.position.copy(handleHome);

  const tool = new T.Group();
  scene.add(tool);
  const toolHome = new T.Vector3(.59, .004, -.69);
  const toolDock = new T.Vector3(baseX, handleDock.y + .087, baseZ);
  tool.position.copy(toolHome);
  const steel = new T.MeshPhysicalMaterial({ color: "#bac4c6", metalness: .88, roughness: .29,
    anisotropy: .40, clearcoat: .10 });
  const metalProfile = [[0, 0], [.185, 0], [.206, .003], [.225, .012], [.232, .028],
    [.229, .047], [.224, .053], [0, .053]];
  mesh(tool, new T.LatheGeometry(metalProfile.map(([r, y]) => new T.Vector2(r, y)), 72), steel, 0, 0, 0);
  const walnut = woodMaterial([106, 67, 40], { grainContrast: 1.4, roughness: .56, bumpScale: .0025 });
  const woodProfile = [[0, .054], [.215, .054], [.229, .063], [.230, .122],
    [.228, .140], [.219, .151], [.201, .158], [0, .158]];
  mesh(tool, new T.LatheGeometry(woodProfile.map(([r, y]) => new T.Vector2(r, y)), 72), walnut, 0, 0, 0);
  mesh(tool, new T.BoxGeometry(.101, .002, .010), material("#ae9375"), .067, .1595, 0);
  const tamper = createInventoryModel("tamper").object;
  tamper.scale.setScalar(.51);
  const tamperFoot = .49 * tamper.scale.y;
  const looseHeight = grounds.scale.y;
  const packedHeight = .106;
  const powderBase = handleDock.y + grounds.position.y;
  const tampClearance = .085;
  const tamperHome = new T.Vector3(-.78, tamperFoot + .003, -.64);
  const tamperDock = new T.Vector3(baseX, powderBase + looseHeight + tampClearance + tamperFoot, baseZ);
  const tampDepth = tampClearance + looseHeight - packedHeight;
  const gripCenter = new T.Vector3(tamperDock.x, tamperDock.y + .145, tamperDock.z);
  tamper.position.copy(tamperHome);
  scene.add(tamper);
  scene.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = object !== counter && object !== seat;
    object.receiveShadow = true;
  });
  const rotationGuide = new T.Group();
  rotationGuide.position.copy(toolDock);
  rotationGuide.position.y += .17;
  rotationGuide.visible = false;
  scene.add(rotationGuide);
  const arrowPaint = new T.MeshBasicMaterial({ color: cueColors.action, side: T.DoubleSide });
  const arrowLight = new T.MeshBasicMaterial({ color: cueColors.actionLight });
  const arrowRadius = .30;
  const arcLength = Math.PI * .46;
  for (const start of [-.48, Math.PI - .48]) {
    const arc = new T.TorusGeometry(arrowRadius, .020, 10, 28, arcLength);
    arc.rotateX(Math.PI / 2);
    arc.rotateY(-start);
    mesh(rotationGuide, arc, arrowPaint, 0, 0, 0);
    const highlight = new T.TorusGeometry(arrowRadius, .009, 8, 28, arcLength);
    highlight.rotateX(Math.PI / 2);
    highlight.rotateY(-start);
    mesh(rotationGuide, highlight, arrowLight, 0, .017, 0);
    const end = start + arcLength;
    const radial = new T.Vector3(Math.cos(end), 0, Math.sin(end));
    const tangent = new T.Vector3(-radial.z, 0, radial.x);
    const center = radial.clone().multiplyScalar(arrowRadius);
    const tip = center.clone().addScaledVector(tangent, .082);
    const base = center.clone().addScaledVector(tangent, -.018);
    const left = base.clone().addScaledVector(radial, .045);
    const right = base.clone().addScaledVector(radial, -.045);
    const head = new T.BufferGeometry();
    head.setAttribute("position", new T.Float32BufferAttribute([...left, ...right, ...tip], 3));
    mesh(rotationGuide, head, arrowPaint, 0, .001, 0);
  }
  function benchMark(parent, paint, highlight, segments, fraction) {
    const group = new T.Group();
    parent.add(group);
    const spacing = turn / segments;
    for (let i = 0; i < segments; i++) {
      const detail = segments === 1 ? 64 : 12;
      const start = i * spacing, sweep = spacing * fraction;
      const edge = new T.RingGeometry(.84, 1, detail, 1, start, sweep);
      edge.rotateX(-Math.PI / 2);
      mesh(group, edge, paint, 0, 0, 0);
      const line = new T.RingGeometry(.89, .95, detail, 1, start, sweep);
      line.rotateX(-Math.PI / 2);
      mesh(group, line, highlight, 0, .001, 0);
    }
    return group;
  }
  const pickupMark = benchMark(scene, arrowPaint, arrowLight, 2, .44);
  pickupMark.rotation.y = -Math.PI * .22;
  const dropMark = new T.Group();
  scene.add(dropMark);
  const targetPaint = new T.MeshBasicMaterial({ color: cueColors.target });
  const targetHighlight = new T.MeshBasicMaterial({ color: cueColors.targetLight });
  const dropDashes = benchMark(dropMark, targetPaint, targetHighlight, 12, .62);
  const dropReady = benchMark(dropMark, arrowPaint, arrowLight, 1, 1);
  const canvas = renderer.domElement;
  canvas.className = "handle-bench-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const view = document.createElement("div");
  view.className = "handle-bench-view";
  const pressCue = document.createElement("span");
  pressCue.className = "distribution-press-cue";
  pressCue.setAttribute("aria-hidden", "true");
  view.append(canvas, pressCue);
  const hint = document.createElement("div");
  hint.className = "distribution-hint";
  const status = document.createElement("p");
  status.className = "distribution-status";
  status.setAttribute("role", "status");
  const stepCount = document.createElement("span");
  stepCount.className = "distribution-step";
  hint.append(status, stepCount);
  const footer = document.createElement("div");
  footer.className = "distribution-footer";
  const progress = document.createElement("div");
  progress.className = "distribution-progress-group";
  const progressLabel = document.createElement("span");
  const progressBar = document.createElement("progress");
  progressBar.className = "distribution-progress";
  progressBar.setAttribute("aria-label", "操作进度");
  progressBar.max = 1;
  progress.append(progressLabel, progressBar);
  const action = button("", () => {
    if (gesture || settleFrame) return;
    if (step === 2) rotateWithButton();
    else if (step === 5) animatePress(1, advance);
    else if (step < done) transferWithButton();
  }, "distribution-action");
  footer.append(progress, action);
  host.className = "handle-practice distribution-workshop";
  host.style.setProperty("--distribution-action", cueColors.action);
  host.append(hint, view, footer);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));

  let step = 0, angle = 0, gesture;
  let lastCount = -1, settleFrame = 0, pressProgress = 0;
  const ray = new T.Raycaster();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  function render() { renderer.render(scene, camera); }
  function currentTool() { return step === 0 ? handle : step >= 4 ? tamper : tool; }
  function target() { return [handleDock, toolDock, toolDock, toolHome, tamperDock, tamperDock, tamperHome][step]; }
  function showStatus(message, ready = false) {
    if (status.textContent !== message) status.textContent = message;
    hint.toggleAttribute("data-ready", ready);
  }
  function anchor(marker, screen) {
    marker.style.left = `${(screen.x + 1) * 50}%`;
    marker.style.top = `${(1 - screen.y) * 50}%`;
  }
  function dropPosition() {
    const { x, z } = target();
    const y = step === 0 ? .123 : step === 1 || step === 4 ? toolDock.y + .003 : .003;
    return new T.Vector3(x, y, z);
  }
  function showAlignment(ready) {
    dropDashes.visible = !ready;
    dropReady.visible = ready;
  }
  function placeGuide() {
    dropMark.visible = Boolean(steps[step]?.[2]);
    const carrying = Boolean(gesture || settleFrame);
    pickupMark.visible = dropMark.visible && !carrying;
    targetPaint.color.set(carrying ? cueColors.action : cueColors.target);
    targetHighlight.color.set(carrying ? cueColors.actionLight : cueColors.targetLight);
    pressCue.hidden = step !== 5 || pressProgress >= 1;
    if (!pressCue.hidden) anchor(pressCue, gripCenter.clone().project(camera));
    if (dropMark.visible) {
      dropMark.position.copy(dropPosition());
      dropMark.scale.setScalar(step === 0 ? .285 : .269);
    }
    if (pickupMark.visible) {
      const { x, y, z } = currentTool().position;
      pickupMark.position.set(x, y + (step === 0 ? -.02 : .15), z + (step === 0 ? .50 : 0));
      pickupMark.scale.setScalar(step === 0 ? .115 : step >= 4 ? .17 : .259);
    }
  }
  function drawStep() {
    placeGuide();
    progress.hidden = step !== 2 && step !== 5;
    stepCount.textContent = `${step + 1} / ${done}`;
    stepCount.setAttribute("aria-label", `第 ${step + 1} 步，共 ${done} 步`);
    rotationGuide.visible = step === 2;
    showStatus(steps[step][0]);
    action.textContent = steps[step][1];
    showAlignment(false);
    if (step === 2) showTurns();
    if (step === 5) setPress(0);
    render();
  }
  function showTurns(event) {
    const laps = Math.min(2, Math.abs(angle) / turn);
    const count = Math.min(2, Math.floor(laps + .00001));
    progressBar.value = laps / 2;
    if (count !== lastCount) {
      if (count === 1) showStatus("已转一圈，沿箭头继续。");
      if (count === 0) showStatus(steps[2][0]);
      progressLabel.textContent = `${count} / 2 圈`;
    }
    lastCount = count;
    if (count === 2) {
      step = 3;
      if (event) gesture = grab(event, tool, gesture.level, point(event, gesture.level));
      drawStep();
    }
  }
  function advance() {
    if (step === done) return;
    if (step === 0) handle.position.copy(handleDock);
    else if (step === 1) tool.position.copy(toolDock);
    else if (step === 3) tool.position.copy(toolHome);
    else if (step === 4) tamper.position.copy(tamperDock);
    else if (step === 5) setPress(1);
    else {
      tamper.position.copy(tamperHome);
      step = done;
      placeGuide();
      progress.hidden = true;
      render();
      pass();
      return;
    }
    step++;
    drawStep();
  }
  function point(event, y) {
    const bounds = canvas.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1,
      1 - (event.clientY - bounds.top) / bounds.height * 2), camera);
    return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -y), new T.Vector3());
  }
  function grab(event, item, level, hit) {
    const dx = hit.x - item.position.x, dz = hit.z - item.position.z;
    return { id: event.pointerId, item, level, start: item.position.clone(),
      screenX: event.clientX, screenY: event.clientY, origin: hit,
      lastAngle: Math.hypot(dx, dz) > .08 ? Math.atan2(dz, dx) : null, moved: false };
  }
  function moveTool(event) {
    const { item, start, level, origin, screenX, screenY } = gesture;
    const dx = event.clientX - screenX, dy = event.clientY - screenY;
    const bounds = canvas.getBoundingClientRect();
    const travel = Math.hypot(dx, dy);
    if (!gesture.moved && travel < 5) return;
    gesture.moved = true;
    const lift = .24 * T.MathUtils.smoothstep(travel, 5, 34);
    // Keep the grip under the pointer as the tool rises toward the camera.
    const hit = point(event, level + lift);
    item.position.copy(start).add(hit.sub(origin));
    const goal = dropPosition().project(camera);
    const goalX = bounds.left + (goal.x + 1) * bounds.width / 2;
    const goalY = bounds.top + (1 - goal.y) * bounds.height / 2;
    const rest = start.clone().project(camera);
    const centerX = bounds.left + (rest.x + 1) * bounds.width / 2 + dx;
    const centerY = bounds.top + (1 - rest.y) * bounds.height / 2 + dy;
    const distance = Math.min(Math.hypot(event.clientX - goalX, event.clientY - goalY),
      Math.hypot(centerX - goalX, centerY - goalY));
    const tolerance = T.MathUtils.clamp(bounds.width * .08, 24, 40);
    const aligned = distance <= tolerance + (gesture.aligned ? 5 : 0);
    if (gesture.aligned !== aligned) {
      gesture.aligned = aligned;
      showAlignment(aligned);
      showStatus(aligned ? "已对准，松手放下。" : `拖向${steps[step][2]}的虚线圈。`, aligned);
    }
  }
  function animate(duration, update, next) {
    if (reducedMotion.matches) {
      update(1);
      next();
      return;
    }
    const started = performance.now();
    function frame(now) {
      const progress = Math.min(1, (now - started) / duration);
      update(progress);
      if (progress < 1) {
        render();
        settleFrame = requestAnimationFrame(frame);
      } else {
        settleFrame = 0;
        next();
      }
    }
    settleFrame = requestAnimationFrame(frame);
  }
  function settle(item, destination, next) {
    if (item.position.distanceToSquared(destination) < .0001) {
      item.position.copy(destination);
      next();
      return;
    }
    const start = item.position.clone();
    animate(190, progress => {
      item.position.lerpVectors(start, destination, T.MathUtils.smoothstep(progress, 0, .8));
      item.position.y = T.MathUtils.lerp(start.y, destination.y, T.MathUtils.smoothstep(progress, .2, 1));
    }, next);
  }
  function transferWithButton() {
    const item = currentTool();
    const start = item.position.clone();
    const destination = target();
    pickupMark.visible = false;
    showAlignment(true);
    showStatus(`正在移到${steps[step][2]}。`, true);
    animate(390, progress => {
      const travel = T.MathUtils.smoothstep(progress, 0, 1);
      item.position.lerpVectors(start, destination, travel);
      item.position.y += .22 * Math.sin(Math.PI * travel);
    }, advance);
  }
  function rotateWithButton() {
    const start = angle;
    const direction = Math.sign(start) || 1;
    const end = Math.min(2 * turn, Math.abs(start) + turn) * direction;
    animate(460, progress => {
      angle = T.MathUtils.lerp(start, end, T.MathUtils.smoothstep(progress, 0, 1));
      tool.rotation.y = -angle;
      progressBar.value = Math.abs(angle) / (2 * turn);
    }, () => {
      showTurns();
      render();
    });
  }
  function setPress(progress) {
    pressProgress = progress;
    const depth = tampDepth * progress;
    tamper.position.y = tamperDock.y - depth;
    grounds.scale.y = looseHeight - Math.max(0, depth - tampClearance);
    const complete = progress >= 1;
    pressCue.hidden = complete;
    pressCue.style.setProperty("--press-offset", `${progress * 12}px`);
    progressBar.value = progress;
    progressLabel.textContent = complete ? "已压实" : "下压进度";
    showStatus(complete ? "已压实，松手完成。" : progress > 0 ? "继续向下压。" : steps[5][0], complete);
  }
  function animatePress(destination, next) {
    const start = pressProgress;
    if (start === destination) {
      next();
      return;
    }
    animate(destination === 1 ? 230 : 140, progress => {
      setPress(T.MathUtils.lerp(start, destination, T.MathUtils.smoothstep(progress, 0, 1)));
    }, next);
  }
  function movePress(event) {
    if (gesture.pressed) return;
    const dy = event.clientY - gesture.screenY;
    const dx = Math.abs(event.clientX - gesture.screenX);
    const stroke = T.MathUtils.clamp(canvas.clientHeight * .085, 18, 30);
    if (!gesture.pressing && dy >= 4 && dx <= Math.max(10, dy * .8)) gesture.pressing = true;
    if (!gesture.pressing) return;
    const progress = T.MathUtils.clamp(dy / stroke, 0, 1);
    gesture.pressed = progress === 1;
    setPress(progress);
  }
  const input = new AbortController();
  const events = { signal: input.signal };
  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !event.isPrimary || gesture || settleFrame || step === done) return;
    const item = currentTool();
    const level = item.position.y + (step === 0 ? .04 : step >= 4 ? .20 : .16);
    const hit = point(event, level);
    if (!hit) return;
    const dx = hit.x - item.position.x, dz = hit.z - item.position.z;
    const onGrip = step === 0 && Math.abs(dx) < .13 && dz >= 0 && dz < .73;
    const grabRadius = step === 3 ? .40 : .32;
    if (step === 5) {
      const bounds = canvas.getBoundingClientRect();
      const screen = gripCenter.clone().project(camera);
      const x = bounds.left + (screen.x + 1) * bounds.width / 2;
      const y = bounds.top + (1 - screen.y) * bounds.height / 2;
      if (Math.hypot(event.clientX - x, event.clientY - y) > T.MathUtils.clamp(bounds.width * .052, 18, 32)) return;
    } else if (Math.hypot(dx, dz) > grabRadius && !onGrip) return;
    gesture = grab(event, item, level, hit);
    if (dropMark.visible) {
      placeGuide();
      render();
    }
    if (step === 2 && gesture.lastAngle === null) showStatus("从布粉器边缘开始，沿箭头转动。");
    canvas.setPointerCapture(event.pointerId);
  }, events);
  canvas.addEventListener("pointermove", event => {
    if (gesture?.id !== event.pointerId) return;
    if (step === 2) {
      const hit = point(event, gesture.level);
      const dx = hit.x - tool.position.x, dz = hit.z - tool.position.z;
      const next = Math.hypot(dx, dz) > .08 ? Math.atan2(dz, dx) : null;
      if (next !== null && gesture.lastAngle !== null) {
        const delta = next - gesture.lastAngle;
        angle += Math.atan2(Math.sin(delta), Math.cos(delta));
        tool.rotation.y = -angle;
      }
      gesture.lastAngle = next;
      showTurns(event);
    } else if (step === 5) {
      movePress(event);
    } else {
      moveTool(event);
    }
    render();
  }, events);
  function release(event, cancelled = false) {
    if (gesture?.id !== event.pointerId) return;
    if (!cancelled && step === 5) movePress(event);
    else if (!cancelled && step !== 2) moveTool(event);
    const { item, start, moved, aligned, pressed } = gesture;
    gesture = undefined;
    if (step === 2) return;
    if (step === 5) {
      if (!cancelled && pressed) advance();
      else animatePress(0, render);
      return;
    }
    if (!cancelled && aligned) {
      showStatus("正在放下。", true);
      settle(item, target(), advance);
    } else {
      showAlignment(false);
      showStatus(moved && !cancelled ? `拖到${steps[step][2]}的虚线圈内再松手。` : steps[step][0]);
      settle(item, start, () => {
        placeGuide();
        render();
      });
    }
  }
  canvas.addEventListener("pointerup", release, events);
  canvas.addEventListener("pointercancel", event => release(event, true), events);
  canvas.addEventListener("lostpointercapture", event => release(event, true), events);
  const resize = new ResizeObserver(() => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const extent = 1.65 * h / w;
    camera.top = extent;
    camera.bottom = -extent;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    placeGuide();
    render();
  });
  resize.observe(canvas);
  const observer = new MutationObserver(() => {
    if (host.isConnected) return;
    observer.disconnect();
    resize.disconnect();
    input.abort();
    cancelAnimationFrame(settleFrame);
    const materials = new Set(), textures = new Set();
    scene.traverse(object => {
      object.geometry?.dispose();
      if (object.material) materials.add(object.material);
    });
    for (const paint of materials) {
      if (paint.map) textures.add(paint.map);
      if (paint.bumpMap) textures.add(paint.bumpMap);
      paint.dispose();
    }
    for (const texture of textures) texture.dispose();
    light.shadow.dispose();
    env.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  });
  observer.observe(host.closest(".stage") ?? document.body, { childList: true, subtree: true });
  drawStep();
  return true;
}
