import * as THREE from "./vendor/three.module.min.js";

const metal = () => new THREE.MeshPhysicalMaterial({
  color: "#c2c6c5", metalness: .87, roughness: .30, clearcoat: .15,
});

function box(parent, size, position, material) {
  const part = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  part.position.set(...position);
  parent.add(part);
  return part;
}

function turn(parent, profile, material, at = [0, 0, 0]) {
  const part = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 48), material);
  part.position.set(...at);
  parent.add(part);
  return part;
}

function footprint(parent, w, d, h, at, material, r = .06) {
  const x = w / 2, z = d / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-x + r, -z);
  shape.lineTo(x - r, -z).quadraticCurveTo(x, -z, x, -z + r);
  shape.lineTo(x, z - r).quadraticCurveTo(x, z, x - r, z);
  shape.lineTo(-x + r, z).quadraticCurveTo(-x, z, -x, z - r);
  shape.lineTo(-x, -z + r).quadraticCurveTo(-x, -z, -x + r, -z);
  const part = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
    depth: h, bevelEnabled: true, bevelSegments: 2, bevelSize: .009, bevelThickness: .006,
  }), material);
  part.position.set(...at);
  part.rotation.x = -Math.PI / 2;
  parent.add(part);
  return part;
}

function deviceKey(label, width, height, flat) {
  const group = new THREE.Group();
  const cap = new THREE.MeshStandardMaterial({ color: "#30383a", roughness: .72 });
  const bezel = new THREE.MeshStandardMaterial({ color: "#171c1e", roughness: .68 });
  const press = new THREE.Group();
  group.add(press);
  // The key face and its projected guidance share these local dimensions.
  function roundedFace(parent, w, h, depth, z, material) {
    const part = footprint(parent, w, h, depth, [0, 0, z], material, .035);
    part.rotation.x = 0;
  }
  roundedFace(group, width + .025, height + .025, .012, -.01, bezel);
  roundedFace(press, width, height, .020, .001, cap);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  ctx.font = '600 75px "PingFang SC", system-ui';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, 128, 82);
  const texture = new THREE.CanvasTexture(canvas);
  const legend = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({
    map: texture, color: "#e5efef", transparent: true, depthWrite: false,
  }));
  legend.position.z = .029;
  press.add(legend);
  if (flat) group.rotation.x = -Math.PI / 2;
  return { group, press, cap, width, height, faceZ: legend.position.z };
}

function powderMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: "#684a32", roughness: .94 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 powderPosition;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\npowderPosition = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 powderPosition;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec3 grain = floor(powderPosition * 360.);
        float noise = fract(sin(dot(grain, vec3(12.99, 78.23, 38.35))) * 43758.54);
        diffuseColor.rgb *= mix(.70, 1.23, noise);
      `);
  };
  return material;
}

function makeHandle(scene, steel, grip, powder) {
  const handle = new THREE.Group();
  turn(handle, [
    [0, -.10], [.174, -.10], [.206, -.083], [.229, -.045], [.242, .054],
    [.246, .070], [.239, .080], [.225, .077], [.220, .064], [.204, -.026],
    [.184, -.049], [0, -.049],
  ], steel);
  turn(handle, [[0, -.118], [.058, -.118], [.061, -.087], [.051, -.065], [0, -.065]], steel);
  const connector = turn(handle, [
    [0, -.08], [.043, -.08], [.061, -.051], [.061, .075], [0, .075],
  ], steel, [0, -.026, .255]);
  connector.rotation.x = Math.PI / 2;
  const shaft = turn(handle, [
    [0, -.22], [.045, -.22], [.051, -.19], [.052, -.13], [.062, .08], [.065, .19],
    [.058, .222], [.042, .237], [0, .237],
  ], grip, [0, -.028, .492]);
  shaft.rotation.x = Math.PI / 2;
  const grounds = turn(handle, [
    [0, 0], [.174, 0], [.204, .22], [.209, .49], [.187, .70],
    [.130, .84], [.059, .96], [0, 1],
  ], powder, [0, -.048, 0]);
  grounds.visible = false;
  scene.add(handle);
  return { handle, grounds };
}

export function buildFilledHandle(scene) {
  const parts = makeHandle(scene, metal(),
    new THREE.MeshStandardMaterial({ color: "#272628", roughness: .54 }), powderMaterial());
  parts.grounds.visible = true;
  parts.grounds.scale.set(1, .114, 1);
  return parts;
}

function makeBrushedPowder(scene, powder) {
  const particles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.010, 0), powder, 10);
  particles.frustumCulled = false;
  const speck = new THREE.Object3D();
  scene.add(particles);
  return (visible, progress) => {
    particles.visible = visible && progress > .20 && progress < .78;
    if (!particles.visible) return;
    for (let n = 0; n < particles.count; n++) {
      const t = THREE.MathUtils.clamp((progress - .20 - n * .014) / .43, 0, 1);
      speck.position.set(.85 - .25 * t + (n % 3) * .018, .27 - .19 * t * t, 1.039 + (n % 5) * .015);
      speck.updateMatrix();
      particles.setMatrixAt(n, speck.matrix);
    }
    particles.instanceMatrix.needsUpdate = true;
  };
}

export function buildScaleModels(scene) {
  const steel = metal();
  const grip = new THREE.MeshPhysicalMaterial({ color: "#272628", roughness: .38, clearcoat: .27 });
  const slate = new THREE.MeshStandardMaterial({ color: "#343637", roughness: .63 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#252829", roughness: .80 });
  const body = new THREE.MeshPhysicalMaterial({ color: "#deddd5", roughness: .37, clearcoat: .28 });
  const screen = new THREE.MeshPhysicalMaterial({ color: "#232a2a", roughness: .25, clearcoat: .46 });
  const powder = powderMaterial();

  footprint(scene, 1.17, 1.19, .092, [-.91, .01, .22], slate, .10);
  footprint(scene, 1.055, .76, .027, [-.91, .102, .062], rubber, .08);
  footprint(scene, .63, .229, .008, [-.984, .106, .665], screen, .04);
  const tareKey = deviceKey("去皮", .235, .19, true);
  tareKey.group.position.set(-.465, .121, .664);
  scene.add(tareKey.group);

  const grinder = new THREE.Group();
  grinder.position.set(.78, 0, -.53);
  footprint(grinder, .96, 1.04, .085, [0, .015, .25], body, .19);
  footprint(grinder, .71, .55, .019, [0, .102, .48], steel, .13);
  footprint(grinder, .60, .54, 1.04, [0, .093, -.07], body, .11);
  footprint(grinder, .71, .79, .17, [0, 1.025, .11], body, .11);
  footprint(grinder, .68, .54, .18, [0, .62, .32], body, .10);

  const panel = new THREE.Group();
  panel.position.set(0, .87, .544);
  panel.rotation.x = -.29;
  grinder.add(panel);
  box(panel, [.65, .345, .048], [0, 0, 0], grip);
  box(panel, [.55, .265, .014], [0, 0, .028], screen);
  const grindKey = deviceKey("接粉", .31, .137, false);
  grindKey.group.position.set(0, -.018, .048);
  panel.add(grindKey.group);

  const spoutZ = .593;
  const spoutY = .466;
  turn(grinder, [
    [.058, 0], [.082, 0], [.092, .095], [.112, .117], [.112, .165],
  ], steel, [0, spoutY, spoutZ]);
  turn(grinder, [[0, 0], [.058, 0], [.057, .026]], grip, [0, spoutY + .005, spoutZ]);
  box(grinder, [.34, .085, .18], [0, .193, .28], grip);
  for (const side of [-1, 1]) {
    const fork = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * .105, .205, .28),
      new THREE.Vector3(side * .223, .205, .42),
      new THREE.Vector3(side * .238, .205, .62),
      new THREE.Vector3(side * .219, .219, .715),
    ]);
    grinder.add(new THREE.Mesh(new THREE.TubeGeometry(fork, 18, .025, 10, false), steel));
  }
  const hopperMaterial = new THREE.MeshPhysicalMaterial({
    color: "#a9afb0", roughness: .22, metalness: .06, transparent: true, opacity: .49, depthWrite: false,
  });
  turn(grinder, [
    [.13, 0], [.14, .056], [.248, .261], [.263, .335], [.260, .373],
    [.245, .369], [.240, .319], [.127, .069], [.117, .012],
  ], hopperMaterial, [0, 1.218, -.04]);
  turn(grinder, [[0, 0], [.257, 0], [.272, .009], [.271, .027], [.252, .041], [0, .042]], grip, [0, 1.584, -.04]);

  const beans = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8),
    new THREE.MeshStandardMaterial({ color: "#4b2a19", roughness: .58 }), 76);
  const bean = new THREE.Object3D();
  for (let i = 0; i < beans.count; i++) {
    const angle = i * 2.39996;
    const row = Math.floor(i / 19);
    const radius = Math.sqrt((i % 19 + .5) / 19) * (.108 + row * .019);
    bean.position.set(Math.cos(angle) * radius, 1.306 + row * .041 + Math.sin(i) * .009, -.04 + Math.sin(angle) * radius);
    bean.rotation.set(i * .7, i * .23, i * .53);
    bean.scale.set(.033, .021, .025);
    bean.updateMatrix();
    beans.setMatrixAt(i, bean.matrix);
  }
  grinder.add(beans);
  scene.add(grinder);

  footprint(scene, .71, .53, .037, [.79, .007, 1.06], steel, .12);
  footprint(scene, .615, .43, .017, [.79, .052, 1.06], grip, .072);
  box(scene, [.558, .046, .043], [.79, .085, 1.08], rubber);
  const updateBrushedPowder = makeBrushedPowder(scene, powder);

  const spilled = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), powder, 55);
  const falling = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), powder, 9);
  spilled.frustumCulled = falling.frustumCulled = false;
  const grain = new THREE.Object3D();
  for (let index = 0; index < 55; index++) {
    const fraction = (index + 1) / 55;
    const angle = index * 2.39996;
    grain.position.set(.98 + Math.cos(angle) * (.025 + fraction * .105), .139 + .007 * (1 - fraction),
      .224 + Math.sin(angle) * (.023 + fraction * .091));
    grain.scale.set(.009 + .006 * (index % 3), .004, .009 + .004 * (index % 4));
    grain.updateMatrix();
    spilled.setMatrixAt(index, grain.matrix);
  }
  spilled.instanceMatrix.needsUpdate = true;
  spilled.count = 0;
  falling.visible = false;
  scene.add(spilled, falling);

  const { handle, grounds } = makeHandle(scene, steel, grip, powder);
  return {
    handle, grounds, updateBrushedPowder,
    updateSpill(amount, flowing, now) {
      spilled.count = amount ? Math.min(55, 12 + 2 * amount) : 0;
      falling.visible = flowing;
      if (!flowing) return;
      for (let index = 0; index < falling.count; index++) {
        const progress = (now / 470 + index / falling.count) % 1;
        grain.position.set(.965 + progress * (.035 + .027 * Math.sin(index * 2)), .314 - .17 * progress,
          .149 + progress * (.081 + .033 * Math.cos(index * 3)));
        grain.scale.setScalar(.009 + .003 * (index % 3));
        grain.updateMatrix();
        falling.setMatrixAt(index, grain.matrix);
      }
      falling.instanceMatrix.needsUpdate = true;
    },
    docks: {
      bench: new THREE.Vector3(-.22, .122, .94),
      scale: new THREE.Vector3(-.91, .254, .075),
      grinder: new THREE.Vector3(.78, .267, .063),
      bin: new THREE.Vector3(.79, .184, 1.060),
    },
    markers: {
      readout: new THREE.Vector3(-.984, .123, .665),
      remove: new THREE.Vector3(1.18, .329, 1.019),
    },
    keys: { tare: tareKey, grind: grindKey },
    outlet: new THREE.Vector3(grinder.position.x, spoutY, grinder.position.z + spoutZ),
  };
}
