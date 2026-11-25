import * as THREE from "./vendor/three.module.min.js";
import { addIce, createIceResources, cupRim, icePiece, makeGlass } from "./ice-models.js?v=ice-pile";
import { buildCupInspection, buildWaterStation } from "./ice-workshop-station.js?v=faucet-flow";

const ground = -.70;
const cupX = -.75;
const home = new THREE.Vector3(.76, .055, .27);
const scoopHeading = Math.PI;
const dragDepth = .65;
const pourPoint = new THREE.Vector3(cupX + .34, cupRim + .32, .03);
const scoopSize = 4;
const targetAmount = scoopSize * 3;
const dropInstruction = "点冰铲，或拖到杯口。";

function box(parent, size, position, material) {
  const object = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  object.position.set(...position);
  parent.add(object);
  return object;
}

function roundedRectangle(path, width, depth, radius) {
  const x = width / 2, z = depth / 2;
  path.moveTo(-x + radius, -z);
  path.lineTo(x - radius, -z);
  path.quadraticCurveTo(x, -z, x, -z + radius);
  path.lineTo(x, z - radius);
  path.quadraticCurveTo(x, z, x - radius, z);
  path.lineTo(-x + radius, z);
  path.quadraticCurveTo(-x, z, -x, z - radius);
  path.lineTo(-x, -z + radius);
  path.quadraticCurveTo(-x, -z, -x + radius, -z);
  return path;
}

function moldedPanel(parent, dimensions, position, material, opening, radius = .04) {
  const [width, depth, height] = dimensions;
  const outline = roundedRectangle(new THREE.Shape(), width, depth, radius);
  if (opening) outline.holes.push(roundedRectangle(new THREE.Path(), ...opening, .045));
  const panel = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, {
    depth: height, bevelSize: .009, bevelThickness: .009, bevelSegments: 2, curveSegments: 8,
  }), material);
  panel.position.set(...position);
  parent.add(panel);
  return panel;
}

function panelFinish(options, grainScale, variation) {
  const material = new THREE.MeshPhysicalMaterial(options);
  material.onBeforeCompile = shader => {
    shader.uniforms.grainScale = { value: new THREE.Vector3(...grainScale) };
    shader.uniforms.finishVariation = { value: variation };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 panelPosition;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\npanelPosition = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 panelPosition;
        uniform vec3 grainScale;
        uniform float finishVariation;
      `)
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec3 grainPosition = panelPosition * grainScale;
        float grain = sin(grainPosition.x + sin(grainPosition.y + grainPosition.z * .82))
          * cos(grainPosition.y * 1.27 - grainPosition.z);
        float grainFootprint = max(max(fwidth(grainPosition.x), fwidth(grainPosition.y)), fwidth(grainPosition.z));
        float finishGrain = grain * (1. - smoothstep(.70, 2.7, grainFootprint));
        diffuseColor.rgb *= 1. + finishGrain * finishVariation * .22;
      `)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + finishGrain * finishVariation, .06, 1.);
      `);
  };
  return material;
}

function contactShadow(parent, width, depth, x = 0, z = 0, y = ground + .002, strength = .24) {
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { strength: { value: strength } },
    vertexShader: `
      varying vec2 shadowUv;
      void main() {
        shadowUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: `
      varying vec2 shadowUv;
      uniform float strength;
      void main() {
        float distanceToCenter = length((shadowUv - .5) * 2.);
        float softness = 1. - smoothstep(.19, 1., distanceToCenter);
        gl_FragColor = vec4(.25, .21, .17, strength * softness * softness);
      }
    `,
  }));
  shadow.position.set(x, y, z);
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 1;
  parent.add(shadow);
}

function setShadows(group) {
  group.traverse(object => {
    if (!object.isMesh || object.material.transparent) return;
    object.castShadow = !object.material.transmission;
    object.receiveShadow = true;
  });
}

function makeIceMachine(shared) {
  const bin = new THREE.Group();
  bin.position.set(.68, ground, -.23);
  bin.rotation.y = -.12;
  bin.scale.setScalar(.85);
  const enamel = panelFinish({
    color: "#d4d7d3", roughness: .52, metalness: .08, clearcoat: .23, clearcoatRoughness: .37,
  }, [97, 101, 83], .045);
  const frame = panelFinish({
    color: "#202326", roughness: .53, clearcoat: .09, clearcoatRoughness: .42,
  }, [113, 87, 101], .053);
  const liner = new THREE.MeshStandardMaterial({ color: "#4c5865", roughness: .56, metalness: .23 });
  const binFloor = new THREE.MeshStandardMaterial({ color: "#26364e", roughness: .62, metalness: .19 });
  const brushed = panelFinish({
    color: "#c3c7c8", roughness: .34, metalness: .78, anisotropy: .46, anisotropyRotation: Math.PI / 2,
  }, [17, 84, 39], .077);
  const vent = new THREE.MeshStandardMaterial({ color: "#303334", roughness: .8 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#333331", roughness: .91 });
  // The ice sits in a recessed tub behind the fixed sill and the hinged door.
  const bay = new THREE.Group();
  bay.position.y = .31;
  bin.add(bay);
  moldedPanel(bay, [1.39, 1.23, .91], [0, 1.055, -.91], enamel, [1.24, 1.065]);
  moldedPanel(bay, [1.34, 1.11, .065], [0, 1.065, .012], frame, [1.17, .90]);
  moldedPanel(bin, [1.36, .87, .97], [0, .444, -.89], enamel);
  const lid = moldedPanel(bay, [1.373, .883, .025], [0, 1.671, -.458], brushed, null, .032);
  lid.rotation.x = -Math.PI / 2;
  const capMaterial = new THREE.MeshPhysicalMaterial({ color: "#212426", roughness: .28, clearcoat: .30 });
  const cap = new THREE.Mesh(new THREE.LatheGeometry([
    [0, 0], [.173, 0], [.181, .004], [.181, .028],
    [.175, .042], [.163, .046], [.156, .041], [0, .04],
  ].map(([radius, height]) => new THREE.Vector2(radius, height)), 48), capMaterial);
  cap.position.set(.421, 1.694, -.48);
  bay.add(cap);
  const seam = new THREE.MeshStandardMaterial({ color: "#696d6a", roughness: .73 });
  box(bay, [1.312, .009, .017], [0, 1.652, .009], seam);
  box(bay, [1.292, .012, .023], [0, .549, .086], seam);
  moldedPanel(bay, [1.16, 1.06, .055], [0, 1.004, -.91], liner);
  box(bay, [1.14, .077, .86], [0, .573, -.458], binFloor);
  box(bay, [1.14, .093, .066], [0, .635, -.058], liner);
  for (const side of [-1, 1]) {
    const wall = box(bay, [.045, .29, .84], [side * .553, .716, -.449], liner);
    wall.rotation.z = -side * .09;
  }
  box(bay, [.86, .101, .067], [-.08, 1.017, -.742], brushed);
  box(bay, [.89, .28, .038], [-.08, 1.205, -.783], frame);
  const moldGrid = new THREE.MeshStandardMaterial({ color: "#42464a", roughness: .48, metalness: .37 });
  for (let column = 0; column < 9; column++) {
    box(bay, [.011, .255, .018], [-.506 + column * .106, 1.205, -.757], moldGrid);
  }
  for (const y of [1.09, 1.166, 1.242, 1.318]) {
    box(bay, [.87, .012, .018], [-.08, y, -.747], moldGrid);
  }
  const tubePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(.482, 1.388, -.650), new THREE.Vector3(.442, 1.248, -.624),
    new THREE.Vector3(.439, 1.130, -.578), new THREE.Vector3(.496, 1.072, -.554),
    new THREE.Vector3(.536, 1.102, -.595), new THREE.Vector3(.54, 1.159, -.662),
  ]);
  const tubeMaterial = new THREE.MeshStandardMaterial({ color: "#9ca7ac", roughness: .72 });
  bay.add(new THREE.Mesh(new THREE.TubeGeometry(tubePath, 24, .012, 8), tubeMaterial));
  const door = new THREE.Group();
  door.position.set(0, .595, .08);
  door.rotation.x = 1.81;
  door.scale.y = .92;
  const window = panelFinish({
    color: "#667f96", roughness: .27, clearcoat: .60, clearcoatRoughness: .19,
    ior: 1.46, transparent: true, opacity: .48, depthWrite: false,
  }, [5.4, 6.6, 9.2], .11);
  const windowSeal = new THREE.MeshPhysicalMaterial({
    color: "#4d6274", roughness: .38, clearcoat: .18, clearcoatRoughness: .25,
  });
  moldedPanel(door, [1.30, .67, .033], [0, .326, -.019], frame, [1.075, .47]);
  moldedPanel(door, [1.092, .485, .023], [0, .326, -.015], windowSeal, [.988, .395]);
  const pane = moldedPanel(door, [.993, .40, .018], [0, .326, -.009], window, null, .055);
  pane.receiveShadow = true;
  moldedPanel(door, [.30, .034, .038], [0, .643, -.033], frame, null, .012);
  const hingeGeometry = new THREE.CylinderGeometry(.022, .022, .093, 16);
  for (const x of [-.556, .556]) {
    const hinge = new THREE.Mesh(hingeGeometry, brushed);
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(x, .603, .091);
    bay.add(hinge);
  }
  bay.add(door);
  moldedPanel(bin, [.32, .115, .015], [.38, .54, .088], frame, null, .02);
  const display = new THREE.MeshStandardMaterial({
    color: "#3a6591", emissive: "#315c91", emissiveIntensity: .32, roughness: .42,
  });
  box(bin, [.106, .030, .008], [.38, .54, .110], display);
  const buttonBody = new THREE.MeshStandardMaterial({ color: "#afb4b4", roughness: .61 });
  for (const x of [.275, .488]) {
    for (const y of [.524, .555]) {
      moldedPanel(bin, [.047, .020, .005], [x, y, .109], buttonBody, null, .009);
    }
  }
  for (let row = 0; row < 10; row++) {
    for (let bank = 0; bank < 4; bank++) {
      const x = -.34 + bank * .157, y = .094 + row * .024;
      box(bin, [.135, .007, .006], [x, y, .092], vent);
      box(bin, [.138, .004, .008], [x, y - .0045, .094], enamel);
    }
  }
  const foot = new THREE.CylinderGeometry(.077, .074, .036, 24);
  for (const x of [-.49, .49]) {
    for (const z of [-.73, .01]) {
      const pad = new THREE.Mesh(foot, rubber);
      pad.position.set(x, .018, z);
      bin.add(pad);
    }
  }
  const screwGeometry = new THREE.CylinderGeometry(.012, .012, .007, 18);
  for (const z of [-.73, -.10]) {
    for (const y of [.16, .71, 1.69]) {
      const screw = new THREE.Mesh(screwGeometry, brushed);
      screw.rotation.z = Math.PI / 2;
      screw.position.set(.696, y, z);
      bin.add(screw);
    }
  }
  for (let i = 0; i < 21; i++) {
    const chunk = icePiece(shared, i);
    const col = i % 6, row = Math.floor(i / 6) % 3;
    chunk.position.set(-.47 + col * .184 + .032 * Math.sin(i * 17),
      .689 + .024 * Math.cos(i * 2.6) + (i > 17 ? .065 : 0), -.698 + row * .218 + .039 * Math.cos(i * 7.9));
    chunk.rotation.set(i * .31 - .26, i * .94, i * .19);
    chunk.scale.setScalar(.204 + .016 * Math.cos(i * 2.4));
    bay.add(chunk);
  }
  setShadows(bin);
  return bin;
}

function setupBench(scene, shared) {
  scene.background = new THREE.Color("#eeeae0");
  scene.environment = shared.environment.texture;
  const light = new THREE.DirectionalLight("#fffaf2", 1.44);
  light.position.set(-2.15, 7, 2.7);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, { left: -2.6, right: 2.6, top: 2.3, bottom: -2.3, near: .1, far: 13 });
  light.shadow.camera.updateProjectionMatrix();
  light.shadow.bias = -.00015;
  light.shadow.normalBias = .014;
  light.shadow.radius = 7;
  scene.add(light, new THREE.HemisphereLight("#f7faff", "#bcb4a7", 1.24));

  const counter = new THREE.MeshStandardMaterial({ color: "#dfd9ce", roughness: .69 });
  const worktop = box(scene, [12, .065, 12], [0, ground - .034, -.8], counter);
  worktop.receiveShadow = true;
  const machine = makeIceMachine(shared);
  scene.add(machine);

  const cup = new THREE.Group();
  cup.position.x = cupX;
  contactShadow(cup, .71, .63, .005, 0, ground + .003, .32);
  contactShadow(cup, .92, .61, .23, -.18, ground + .004, .21);
  cup.add(makeGlass());
  const pile = new THREE.Group();
  addIce(pile, .98, shared, 2);
  for (let i = 0; i < scoopSize; i++) {
    const chunk = icePiece(shared, i + 1);
    const upper = i >= 2;
    const angle = i * Math.PI + (upper ? .6 : .12);
    const radius = upper ? .088 : .141;
    chunk.position.set(Math.cos(angle) * radius,
      cupRim + (upper ? .21 : .06) + .015 * Math.sin(i * 2.1), Math.sin(angle) * radius);
    chunk.rotation.set(.23 * i, i * .67, .24 - .075 * i);
    chunk.scale.setScalar(.194 + .010 * Math.cos(i * 1.6));
    pile.add(chunk);
  }
  const ice = pile.children;
  for (const chunk of ice) chunk.visible = false;
  cup.add(pile);
  const target = new THREE.Mesh(
    new THREE.TorusGeometry(.338, .0105, 8, 54),
    new THREE.MeshBasicMaterial({ color: "#8e6847" }),
  );
  target.position.y = cupRim + .008;
  target.rotation.x = -Math.PI / 2;
  target.visible = false;
  cup.add(target);
  scene.add(cup);
  return { ice, target, cup, machine, worktop };
}

function scoopBowl() {
  const geometry = new THREE.BufferGeometry();
  const positions = [], triangles = [];
  const lengthSegments = 22, arcSegments = 24;
  const stride = (arcSegments + 1) * 2;
  // The molded scoop has a broad floor and shallow, rounded shoulders.
  for (let row = 0; row <= lengthSegments; row++) {
    const t = row / lengthSegments;
    const width = .051 + .218 * THREE.MathUtils.smoothstep(t, 0, .51) + .021 * t;
    const base = -.050 + .075 * Math.exp(-t * 8) + .015 * t ** 4;
    const height = .033 + .099 * THREE.MathUtils.smoothstep(t, .02, .37)
      * (1 - THREE.MathUtils.smoothstep(t, .48, 1));
    const shell = .009 - .004 * t;
    for (let col = 0; col < stride; col++) {
      const inside = col > arcSegments;
      const step = inside ? stride - 1 - col : col;
      const cross = Math.cos(Math.PI * step / arcSegments);
      const shoulder = Math.abs(cross) ** 4;
      const roundedTip = .035 * shoulder * THREE.MathUtils.smoothstep(t, .79, 1);
      positions.push(-.29 + .70 * t - roundedTip,
        base + height * shoulder + (inside ? shell : 0), cross * (width - (inside ? shell : 0)));
      if (!row) continue;
      const a = (row - 1) * stride + col;
      const b = (row - 1) * stride + (col + 1) % stride;
      triangles.push(a, a + stride, b, b, a + stride, b + stride);
    }
  }
  for (const row of [0, lengthSegments]) {
    const start = row * stride;
    for (let step = 0; step < arcSegments; step++) {
      const outer = start + step;
      const inner = start + stride - 1 - step;
      if (row === 0) triangles.push(outer, outer + 1, inner, outer + 1, inner - 1, inner);
      else triangles.push(outer, inner, outer + 1, outer + 1, inner, inner - 1);
    }
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  return geometry;
}

function makeScoop(scene, shared) {
  const scoop = new THREE.Group();
  const plastic = new THREE.MeshPhysicalMaterial({
    color: "#d9dcd6", roughness: .37, clearcoat: .14, clearcoatRoughness: .30,
    transmission: .24, thickness: .024, ior: 1.46, side: THREE.DoubleSide,
  });
  const bowl = new THREE.Mesh(scoopBowl(), plastic);
  scoop.add(bowl);
  const profile = [[0, -.22], [.037, -.217], [.053, -.201], [.058, -.178],
    [.055, -.11], [.051, -.035], [.048, .045], [.051, .105],
    [.066, .155], [.074, .19], [.060, .209], [0, .213]];
  const handle = new THREE.Mesh(new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)), 30,
  ), plastic);
  handle.rotation.z = -Math.PI / 2;
  handle.scale.x = .58;
  handle.position.set(-.485, .05, 0);
  scoop.add(handle);
  const carried = Array.from({ length: scoopSize }, (_, index) => {
    const chunk = icePiece(shared, index + 2);
    chunk.scale.setScalar(.176 + .008 * index);
    chunk.rotation.set(index * .32 + .22, index * .73, index * .28);
    scoop.add(chunk);
    return chunk;
  });
  scoop.position.copy(home);
  setShadows(scoop);
  // The cloudy plastic bowl still blocks some of the key light.
  bowl.castShadow = true;
  handle.castShadow = true;
  scene.add(scoop);
  return { scoop, carried };
}

class IceScoopGame extends HTMLElement {
  connectedCallback() {
    if (this.cleanup) return;
    let renderer, shared, observer, frame = 0;
    const scene = new THREE.Scene();
    const input = new AbortController();
    const events = { signal: input.signal };
    const textures = [];
    const flowSound = new Audio("assets/ice/faucet-flow.mp3");
    flowSound.preload = "none";
    flowSound.loop = true;
    this.cleanup = () => {
      input.abort();
      flowSound.pause();
      observer?.disconnect();
      cancelAnimationFrame(frame);
      const geometry = new Set(), materials = new Set();
      scene.traverse(object => {
        if (object.geometry) geometry.add(object.geometry);
        if (object.material) materials.add(object.material);
        if (object.isLight) object.shadow?.dispose();
      });
      for (const item of geometry) item.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      shared?.environment.dispose();
      const context = renderer?.getContext();
      renderer?.dispose();
      if (context && !context.isContextLost()) renderer.forceContextLoss();
      this.replaceChildren();
      this.cleanup = null;
    };
    const fallback = () => {
      this.cleanup();
      this.dispatchEvent(new Event("ice-game-unavailable"));
    };
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      let shaderFailed = false;
      renderer.debug.onShaderError = () => { shaderFailed = true; };
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
      shared = createIceResources(renderer);
      const { ice, target, cup, machine, worktop } = setupBench(scene, shared);
      const { scoop, carried } = makeScoop(scene, shared);
      const cupIce = new THREE.Sprite(new THREE.SpriteMaterial({
        transparent: true, opacity: .88, depthWrite: false,
      }));
      cupIce.position.y = .07;
      cupIce.scale.set(.76, 1.52, 1);
      cupIce.renderOrder = 1.5;
      cupIce.visible = false;
      cup.add(cupIce);
      const water = buildWaterStation(scene, cup, worktop.material);
      const inspection = buildCupInspection(scene, shared);
      setShadows(water.fixture);
      water.deck.castShadow = false;
      contactShadow(inspection.ice, .42, .21, -.075, .024, .003, .30);

      const halfHeight = 1.075;
      const camera = new THREE.OrthographicCamera(-1.8, 1.8, halfHeight, -halfHeight, .1, 20);
      camera.position.set(0, 3.16, 6);
      camera.lookAt(0, .07, 0);
      camera.updateMatrixWorld();
      const { domElement: canvas } = renderer;
      canvas.className = "ice-scoop-bench";
      const view = document.createElement("div");
      view.className = "ice-workshop-view";
      const faucet = document.createElement("button");
      faucet.type = "button";
      faucet.className = "ice-faucet-hit";
      faucet.setAttribute("aria-label", "水龙头开关");
      faucet.setAttribute("aria-pressed", "false");
      faucet.hidden = true;
      view.append(canvas, faucet);
      const steps = document.createElement("ol");
      steps.className = "ice-workshop-steps";
      steps.setAttribute("aria-label", "练习进度");
      const labels = ["加冰", "接水", "检查台面"];
      for (const [index, label] of labels.entries()) {
        const item = document.createElement("li");
        item.textContent = label;
        const count = document.createElement("span");
        count.textContent = `${index + 1} / ${labels.length}`;
        item.append(count);
        steps.append(item);
      }
      const status = document.createElement("p");
      status.className = "ice-scoop-status";
      status.setAttribute("role", "status");
      status.textContent = dropInstruction;
      const controls = document.createElement("div");
      controls.className = "ice-scoop-actions";
      const footer = document.createElement("div");
      footer.className = "ice-workshop-footer";
      const add = document.createElement("button"), finish = document.createElement("button");
      add.type = finish.type = "button";
      finish.textContent = "确认冰量";
      finish.className = "primary";
      controls.append(add, finish);
      footer.append(status, controls);
      this.append(steps, view, footer);

      const ray = new THREE.Raycaster();
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -home.z);
      const point = new THREE.Vector3(), screen = new THREE.Vector2();
      const moveScoop = event => {
        const box = canvas.getBoundingClientRect();
        screen.set((event.clientX - box.left) / box.width * 2 - 1, 1 - (event.clientY - box.top) / box.height * 2);
        ray.setFromCamera(screen, camera);
        ray.ray.intersectPlane(plane, point);
      };
      let pointer, added = 0, pouring = false, result = "";
      let phase = "ice", aspect = 1, waterLevel = 0, flowing = false;
      let pileViews = [];
      const iceTilts = ice.map(chunk => chunk.rotation.z);
      const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
      const canScoop = () => phase === "ice" && !pouring && !result && added < ice.length;
      const canDrop = () => {
        const bowlX = scoop.position.x - .20;
        // A broad target also accommodates players who drag from the end of the handle.
        const overCup = Math.abs(bowlX - cupX) < .35 || Math.abs(point.x - cupX) < .29;
        return overCup && scoop.position.y > cupRim - .22;
      };
      const draw = () => {
        const view = pileViews[added / scoopSize - 1];
        cupIce.visible = Boolean(view);
        if (view && cupIce.material.map !== view) {
          cupIce.material.map = view;
          cupIce.material.needsUpdate = true;
        }
        for (const [index, chunk] of ice.entries()) chunk.visible = !view && index < added;
        renderer.render(scene, camera);
      };
      const loader = new THREE.TextureLoader();
      const loadTexture = async filename => {
        const texture = await loader.loadAsync(`assets/ice/${filename}`);
        if (input.signal.aborted) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        textures.push(texture);
        return texture;
      };
      Promise.all([4, 8, 12].map(amount => loadTexture(`pile-${amount}.webp?v=ice-pile`))).then(views => {
        if (input.signal.aborted) return;
        pileViews = views;
        draw();
      }).catch(() => { /* Keep the real-time ice if the rendered views are unavailable. */ });
      const switchCenter = new THREE.Vector3();
      const fitCamera = () => {
        const width = Math.max(phase === "ice" ? 1.86 : 1.33, halfHeight * aspect);
        const center = phase === "ice" ? .18 : 0;
        const verticalCenter = phase === "ice" ? .255 : phase === "water" ? .015 : .052;
        const height = width / aspect;
        camera.left = center - width;
        camera.right = center + width;
        camera.top = verticalCenter + height;
        camera.bottom = verticalCenter - height;
        camera.updateProjectionMatrix();
        switchCenter.copy(water.switchPosition).project(camera);
        faucet.style.left = `${50 + 50 * switchCenter.x}%`;
        faucet.style.top = `${50 - 50 * switchCenter.y}%`;
      };
      const showPhase = (next, index, prompt) => {
        phase = this.dataset.phase = next;
        result = "";
        add.hidden = next !== "inspection";
        faucet.hidden = next !== "water";
        if (next === "ice") {
          canvas.tabIndex = 0;
          canvas.setAttribute("role", "button");
          canvas.setAttribute("aria-label", "冰铲，按下加冰");
        } else {
          for (const attr of ["tabindex", "role", "aria-label", "aria-disabled"]) canvas.removeAttribute(attr);
          canvas.setAttribute("aria-hidden", "true");
        }
        for (const [i, step] of Array.from(steps.children).entries()) {
          if (i === index) step.setAttribute("aria-current", "step");
          else step.removeAttribute("aria-current");
        }
        if (prompt) this.dispatchEvent(new CustomEvent("ice-game-prompt", { detail: prompt }));
        fitCamera();
      };
      const resetScoop = () => {
        canvas.setAttribute("aria-disabled", String(!canScoop()));
        scoop.position.copy(home);
        scoop.rotation.y = scoopHeading;
        scoop.rotation.z = 0;
        carried.forEach((chunk, index) => {
          scoop.add(chunk);
          chunk.visible = canScoop();
          chunk.position.set(.13 + .145 * (index % 2), .071 + .018 * (index % 2), index < 2 ? .047 : -.047);
          chunk.rotation.set(index * .32 + .22, index * .73, index * .28);
        });
      };

      function pour() {
        if (!canScoop()) return;
        pouring = true;
        target.visible = false;
        canvas.setAttribute("aria-disabled", "true");
        finish.disabled = true;
        status.textContent = "把冰倒进杯里。";
        const origin = scoop.position.clone();
        const started = performance.now();
        const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1040;
        const destinations = ice.slice(added, added + scoopSize)
          .map(chunk => new THREE.Vector3(cupX + chunk.position.x, chunk.position.y, chunk.position.z));
        const loaded = carried.map(chunk => chunk.position.clone());
        let launchPoints, landed = false;
        const animate = now => {
          const t = duration ? Math.min(1, (now - started) / duration) : 1;
          const travel = Math.min(t / .38, 1);
          const ease = travel * travel * (3 - 2 * travel);
          const returning = THREE.MathUtils.smoothstep(t, .72, 1);
          scoop.position.lerpVectors(origin, pourPoint, ease).lerp(home, returning);
          scoop.position.y += .22 * Math.sin(travel * Math.PI) + .10 * Math.sin(returning * Math.PI);
          scoop.rotation.z = -.64 * THREE.MathUtils.smoothstep(t, .31, .48) * (1 - returning);
          if (!launchPoints) {
            const slide = THREE.MathUtils.smoothstep(t, .32, .48);
            carried.forEach((chunk, index) => {
              chunk.position.x = THREE.MathUtils.lerp(loaded[index].x, .405 - (index % 2) * .016, slide);
              chunk.position.y = loaded[index].y + .027 * slide;
            });
          }
          if (t >= .48 && !landed) {
            if (!launchPoints) {
              launchPoints = carried.map(chunk => {
                scene.attach(chunk);
                return chunk.position.clone();
              });
            }
            carried.forEach((chunk, index) => {
              const delay = index * .022;
              const drop = THREE.MathUtils.clamp((t - .48 - delay) / (.22 - delay), 0, 1);
              chunk.position.lerpVectors(launchPoints[index], destinations[index], drop * drop);
              chunk.rotation.z += .085;
            });
            if (t >= .70) {
              for (const chunk of carried) chunk.visible = false;
              added += scoopSize;
              landed = true;
            }
          }
          if (t < 1) {
            draw();
            frame = requestAnimationFrame(animate);
            return;
          }
          pouring = false;
          finish.disabled = false;
          status.textContent = added < ice.length
            ? "看一看杯里的冰，再决定要不要加。"
            : "看一看杯里的冰，再点「确认冰量」。";
          resetScoop();
          draw();
        };
        frame = requestAnimationFrame(animate);
      }

      const setWater = (level, running = false) => {
        waterLevel = Math.min(level, 1.12);
        const wobble = running && !reducedMotion.matches ? .018 : 0;
        const time = performance.now() * .007;
        cupIce.material.rotation = Math.sin(time) * wobble;
        for (const [index, chunk] of ice.entries()) {
          chunk.rotation.z = iceTilts[index] + Math.sin(time + index * .82) * wobble * 1.5;
        }
        water.setLevel(waterLevel, running);
        inspection.puddle.visible = waterLevel > 1;
        draw();
      };
      const beginWater = () => {
        showPhase("water", 1, "接多少直饮水才刚好？");
        machine.visible = scoop.visible = false;
        water.fixture.visible = true;
        worktop.visible = false;
        cup.position.x = water.cupX;
        cup.position.y = .035;
        faucet.disabled = false;
        finish.textContent = "确认水位";
        status.textContent = "点水龙头开关开始接水。";
        if (finish.matches(":focus-visible")) faucet.focus({ preventScroll: true });
        setWater(0);
      };
      const beginInspection = () => {
        showPhase("inspection", 2, "放好杯子前，检查台面。");
        water.fixture.visible = false;
        worktop.visible = true;
        cup.position.set(0, 0, 0);
        inspection.ice.visible = inspection.puddle.visible = true;
        add.disabled = false;
        add.textContent = "清理一处";
        finish.textContent = "放好备用";
        status.textContent = "练习找出碎冰和水迹。点到就能清理。";
        finish.focus();
        draw();
      };
      const clean = spot => {
        spot.visible = false;
        add.disabled = !inspection.ice.visible && !inspection.puddle.visible;
        status.textContent = add.disabled ? "台面干净了，可以把杯子放好备用。"
          : spot === inspection.ice ? "碎冰收好了。再看看有没有水迹。"
          : "水迹擦干了。再看看有没有碎冰。";
        draw();
      };
      const finishInspection = () => {
        if (inspection.ice.visible || inspection.puddle.visible) {
          status.textContent = "台面还有要清理的地方。找一找，或点「清理一处」。";
          return;
        }
        finish.disabled = true;
        status.textContent = "冰水杯放稳了。";
        const start = performance.now();
        const destination = inspection.restPosition;
        const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 480;
        const slide = now => {
          const t = duration ? Math.min((now - start) / duration, 1) : 1;
          cup.position.copy(destination).multiplyScalar(t * (2 - t));
          cup.position.y += .09 * Math.sin(t * Math.PI);
          draw();
          if (t < 1) frame = requestAnimationFrame(slide);
          else this.dispatchEvent(new Event("ice-game-complete"));
        };
        frame = requestAnimationFrame(slide);
      };
      const finishWater = () => {
        if (flowing) return;
        if (result === "correct") {
          beginInspection();
          return;
        }
        if (result === "retry") {
          result = "";
          faucet.disabled = false;
          finish.textContent = "确认水位";
          status.textContent = "冰还在杯里。点水龙头重新接水。";
          setWater(0);
          if (finish.matches(":focus-visible")) faucet.focus({ preventScroll: true });
          return;
        }
        faucet.disabled = true;
        if (waterLevel >= .74 && waterLevel <= .86) {
          result = "correct";
          finish.textContent = "检查台面";
          status.textContent = "刚好约八分满，杯口还留了一点空间。";
        } else {
          result = "retry";
          finish.textContent = "重新接水";
          status.textContent = waterLevel < .74 ? "水还少了一些。冰和水一起到约八分满。"
            : "水接多了。到约八分满就停，给杯口留一点空间。";
        }
      };
      add.onclick = () => clean(inspection.ice.visible ? inspection.ice : inspection.puddle);
      const stopFlow = () => {
        if (!flowing) return;
        flowing = false;
        cancelAnimationFrame(frame);
        flowSound.pause();
        faucet.setAttribute("aria-pressed", "false");
        finish.disabled = false;
        status.textContent = waterLevel > 1
          ? "水溢出来了。确认后可以重试。"
          : "水关好了。可以确认水位，也可以再接一点。";
        setWater(waterLevel);
      };
      faucet.onclick = () => {
        if (phase !== "water" || result) return;
        if (flowing) {
          stopFlow();
          return;
        }
        flowing = true;
        faucet.setAttribute("aria-pressed", "true");
        status.textContent = "正在接水。再点一次开关就能停。";
        finish.disabled = true;
        flowSound.play().catch(() => { /* Water can still be controlled without audio. */ });
        const start = performance.now();
        const level = waterLevel;
        const fill = now => {
          setWater(level + Math.max(0, now - start) * .000145, true);
          frame = requestAnimationFrame(fill);
        };
        frame = requestAnimationFrame(fill);
      };
      this.addEventListener("ice-game-pause", stopFlow, events);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) stopFlow();
      }, events);
      finish.onclick = () => {
        if (phase === "water") {
          finishWater();
          return;
        }
        if (phase === "inspection") {
          finishInspection();
          return;
        }
        if (pouring) return;
        if (result === "correct") {
          beginWater();
          return;
        }
        if (result === "retry") {
          added = 0;
          result = "";
          finish.textContent = "确认冰量";
          status.textContent = dropInstruction;
          resetScoop();
          draw();
          return;
        }
        if (added === targetAmount) {
          result = "correct";
          finish.textContent = "继续接水";
          status.textContent = "冰接近杯口，刚好可以去接水。";
        } else {
          result = "retry";
          finish.textContent = "重新加冰";
          status.textContent = added < targetAmount
            ? "冰太少了，还没接近杯口。"
            : "冰太多了，已经堆过杯口。";
        }
        resetScoop();
        draw();
      };
      const spotCenter = new THREE.Vector3();
      let dragFrame = 0;
      input.signal.addEventListener("abort", () => cancelAnimationFrame(dragFrame), { once: true });
      const movedFromStart = event => Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) >= 5;
      const updateDrag = event => {
        moveScoop(event);
        const distance = Math.hypot(point.x - pointer.startX, point.y - pointer.startY);
        const front = THREE.MathUtils.smoothstep(distance, 0, .33) * (dragDepth - home.z);
        // Moving in depth clears the machine door while preserving the grab point on screen.
        const screenRise = front * (camera.position.y - .07) / camera.position.z;
        scoop.position.set(
          THREE.MathUtils.clamp(point.x + pointer.offsetX, camera.left + .43, camera.right - .71),
          THREE.MathUtils.clamp(point.y + pointer.offsetY + screenRise, ground + .075, camera.top),
          home.z + front,
        );
        target.visible = canDrop();
      };
      canvas.addEventListener("click", event => {
        if (event.detail === 0 && !pointer) pour();
      }, events);
      canvas.addEventListener("keydown", event => {
        if (phase !== "ice" || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        if (!event.repeat && !pointer) pour();
      }, events);
      canvas.addEventListener("pointerdown", event => {
        if (event.button !== 0 || pointer) return;
        event.preventDefault();
        moveScoop(event);
        if (phase === "inspection") {
          const spot = [inspection.ice, inspection.puddle].find(object => {
            spotCenter.copy(object.position).project(camera);
            return object.visible && Math.hypot((spotCenter.x - screen.x) * aspect, spotCenter.y - screen.y) < .33;
          });
          if (spot) clean(spot);
          return;
        }
        if (!canScoop()) return;
        if (point.x < -.04 || point.x > 1.42 || point.y < -.5 || point.y > .37) return;
        pointer = {
          id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false,
          startX: point.x, startY: point.y,
          offsetX: scoop.position.x - point.x, offsetY: scoop.position.y - point.y,
        };
        canvas.setPointerCapture(event.pointerId);
      }, events);
      canvas.addEventListener("pointermove", event => {
        if (pointer?.id !== event.pointerId) return;
        if (!pointer.dragging) {
          if (!movedFromStart(event)) return;
          pointer.dragging = true;
          status.textContent = "把冰铲对准杯口。";
        }
        updateDrag(event);
        if (!dragFrame) {
          dragFrame = requestAnimationFrame(() => {
            dragFrame = 0;
            draw();
          });
        }
      }, events);
      canvas.addEventListener("pointerup", event => {
        if (pointer?.id !== event.pointerId) return;
        const tapped = !pointer.dragging && !movedFromStart(event);
        if (!tapped) updateDrag(event);
        const dropping = !tapped && canDrop();
        pointer = null;
        target.visible = false;
        if (tapped || dropping) {
          pour();
        } else {
          status.textContent = "还没对准杯口，拖到杯口上方再松手。";
          resetScoop();
          draw();
        }
      }, events);
      canvas.addEventListener("lostpointercapture", event => {
        if (pointer?.id !== event.pointerId) return;
        pointer = null;
        target.visible = false;
        resetScoop();
        status.textContent = dropInstruction;
        draw();
      }, events);
      canvas.addEventListener("webglcontextlost", fallback, events);
      this.hidden = false;
      const resize = () => {
        const width = canvas.clientWidth, height = canvas.clientHeight;
        if (!width || !height) return;
        aspect = width / height;
        fitCamera();
        renderer.setSize(width, height, false);
        draw();
      };
      showPhase("ice", 0);
      resetScoop();
      resize();
      if (shaderFailed) throw Error("Could not render the ice scoop game.");
      observer = new ResizeObserver(resize);
      observer.observe(canvas);
    } catch {
      fallback();
    }
  }

  disconnectedCallback() {
    this.cleanup?.();
  }
}

customElements.define("ice-scoop-game", IceScoopGame);
