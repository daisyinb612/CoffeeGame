import * as T from "./vendor/three.module.min.js";
import { createInventoryModel } from "./inventory-models.js";
import { makeGlass, addIce, createIceResources } from "./ice-models.js";

export function mountMixScene(game, arena) {
  if (!game.isConnected) return;
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new T.Scene();
  scene.background = new T.Color("#eeeae0");
  const resources = createIceResources(renderer);
  const env = resources.environment;
  scene.environment = env.texture;
  const camera = new T.OrthographicCamera(-2, 2, 1.4, -1.4, .1, 20);
  camera.position.z = 6;
  const sun = new T.DirectionalLight(0xfff3de, 2);
  sun.position.set(-2, 4, 4);
  scene.add(sun, new T.HemisphereLight(0xffffff, 0xa3907d, 1.7));
  function mesh(parent, geometry, color, options = {}) {
    const obj = new T.Mesh(geometry, new T.MeshStandardMaterial({ color, ...options }));
    parent.add(obj);
    return obj;
  }
  const cup = makeGlass();
  const liquid = mesh(cup, new T.CylinderGeometry(.29, .269, .94, 64), 0xc9d8d5,
    { transparent: true, opacity: .14, roughness: .07, depthWrite: false });
  liquid.position.y = -.11;
  const coffee = { value: 0 }, uniformity = { value: 0 }, swirl = { value: 0 };
  liquid.material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { coffee, uniformity, swirl });
    shader.vertexShader = "varying vec3 drinkPosition;\n" + shader.vertexShader.replace(
      "#include <begin_vertex>", "#include <begin_vertex>\n drinkPosition = position;");
    shader.fragmentShader = "varying vec3 drinkPosition; uniform float coffee, uniformity, swirl;\n" +
      shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
        float h = drinkPosition.y / .94 + .5;
        float angle = atan(drinkPosition.z, drinkPosition.x + .0001);
        float curl = sin(angle * 3. + h * 7. - swirl) * .09 + sin(angle + h * 11. - swirl) * .07;
        float plume = smoothstep(.55, 1., h + curl);
        float strength = coffee * mix(plume, .73, uniformity);
        diffuseColor.rgb = mix(vec3(.68,.77,.75), vec3(.085,.029,.012), sqrt(strength));
        diffuseColor.a = .12 + .71 * strength;`);
  };
  const meniscus = mesh(cup, new T.TorusGeometry(.287,.007,8,72), 0xa6b8b4,
    { metalness: .35, roughness: .13 });
  meniscus.rotation.x = Math.PI / 2;
  meniscus.position.y = .36;
  const ice = new T.Group();
  cup.add(ice);
  addIce(ice, .81, resources, 2);
  for (const iceMaterial of resources.ice) {
    iceMaterial.transparent = true;
    iceMaterial.opacity = .62;
    iceMaterial.depthWrite = false;
  }
  const jug = createInventoryModel("measuring-cup").object;
  jug.scale.setScalar(.80);
  const shell = jug.children[0];
  shell.material.dispose();
  shell.material = cup.material;
  shell.renderOrder = 4;
  const shot = mesh(jug, new T.CylinderGeometry(.375, .325, .43, 64), 0x371a10);
  shot.position.set(-.27, -.11, 0);
  const crema = mesh(shot, new T.CylinderGeometry(.375, .375, .018, 64), 0xb77b48);
  crema.position.y = .217;
  const spoon = createInventoryModel("spoon").object;
  const basin = new T.Group();
  scene.add(basin);
  // Keep the opening visible from the barista's side.
  const counterPitch = .34;
  const counterHeight = -1.01;
  basin.rotation.x = counterPitch;
  const steel = { metalness: .70, roughness: .30, side: T.DoubleSide };
  function outline(w,d,r) {
    const s = new T.Shape(), x=w/2, z=d/2;
    s.moveTo(-x+r,-z); s.lineTo(x-r,-z); s.quadraticCurveTo(x,-z,x,-z+r);
    s.lineTo(x,z-r); s.quadraticCurveTo(x,z,x-r,z); s.lineTo(-x+r,z);
    s.quadraticCurveTo(-x,z,-x,z-r); s.lineTo(-x,-z+r); s.quadraticCurveTo(-x,-z,-x+r,-z);
    return s;
  }
  const deck = outline(2.08,1.42,.08);
  // Both pieces share the same origin and tilt, so the rim fits into the counter cutout.
  const counterShape = outline(14, 18, .06);
  counterShape.holes.push(outline(2.02, 1.36, .08));
  const counter = new T.Group();
  counter.rotation.x = counterPitch;
  scene.add(counter);
  function countertop(shape) {
    const top = new T.Mesh(new T.ShapeGeometry(shape),
      new T.MeshBasicMaterial({ color: "#eeeae0", side: T.DoubleSide }));
    top.rotation.x = -Math.PI / 2;
    counter.add(top);
    return top;
  }
  countertop(counterShape);
  const insert = countertop(outline(2.03, 1.37, .08));
  const shadow = mesh(scene, new T.PlaneGeometry(.88,.72), 0x71675b,
    { transparent:true, depthWrite:false, opacity:.2 });
  shadow.material.onBeforeCompile = shader => {
    shader.vertexShader = "varying vec2 shadowUv;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nshadowUv=uv;");
    shader.fragmentShader = "varying vec2 shadowUv;\n" + shader.fragmentShader.replace("#include <alphamap_fragment>", "#include <alphamap_fragment>\ndiffuseColor.a *= 1. - smoothstep(.18,.50,length(shadowUv-.5));");
  };
  shadow.rotation.x = counterPitch - Math.PI / 2;
  deck.holes.push(outline(1.65,.98,.17));
  const slab = mesh(basin,new T.ExtrudeGeometry(deck,{depth:.06,bevelEnabled:false}),0xbec8c6,steel);
  slab.rotation.x = Math.PI/2;
  const rings = [[1.65,.98,.17,0],[1.59,.92,.17,-.045],[1.44,.78,.18,-.24],[1.3,.65,.18,-.30]];
  const vertices=[], indices=[];
  for (const [w,d,r,y] of rings) {
    const points=outline(w,d,r).getPoints(8);
    for (const p of points) vertices.push(p.x,y,p.y);
  }
  const stride=vertices.length/(3*rings.length);
  for(let row=0;row<rings.length-1;row++) for(let j=0;j<stride-1;j++){
    const a=row*stride+j,b=a+stride;
    indices.push(a,b,a+1,b,b+1,a+1);
  }
  const bowl = new T.BufferGeometry();
  bowl.setAttribute("position",new T.Float32BufferAttribute(vertices,3));
  bowl.setIndex(indices); bowl.computeVertexNormals();
  mesh(basin,bowl,0x94a2a3,steel);
  const floor=mesh(basin,new T.ShapeGeometry(outline(1.31,.66,.18)),0x8e9c9e,steel);
  floor.rotation.x=Math.PI/2; floor.position.y=-.30;
  mesh(basin,new T.CylinderGeometry(.096,.096,.013,32),0x47565a).position.y=-.29;
  // A single-lever mixer on the rear ledge. Local +Z points into the bowl.
  const tap = new T.Group();
  basin.add(tap);
  tap.position.set(-.30, 0, -.60);
  tap.rotation.y = .38;
  mesh(tap,new T.CylinderGeometry(.13,.14,.04,40),0xbac5c5,steel).position.y=.023;
  mesh(tap,new T.CylinderGeometry(.103,.119,.47,40),0xc7cecd,steel).position.y=.27;
  const lever = mesh(tap,new T.CapsuleGeometry(.033,.27,6,20),0xcbd2d1,steel);
  lever.position.set(-.12,.54,.018);
  lever.rotation.z=1.27;
  const pipe = new T.CatmullRomCurve3([[0,.34,0],[0,.36,.15],[0,.41,.47],
    [0,.42,.66],[0,.40,.72],[0,.345,.73]].map(p=>new T.Vector3(...p)));
  mesh(tap,new T.TubeGeometry(pipe,40,.055,20,false),0xc7cecd,steel);
  mesh(tap,new T.CylinderGeometry(.059,.056,.05,32),0xa9b6b6,steel).position.set(0,.333,.73);
  const stream = Array.from({ length: 9 }, () =>
    mesh(scene, new T.CylinderGeometry(.022, .022, 1, 12), 0x68361e, { roughness: .18 }));
  const ripple = mesh(cup, new T.TorusGeometry(.2,.008,6,48), 0xc38d62,
    { transparent: true, depthWrite: false });
  ripple.rotation.x = Math.PI / 2;
  scene.add(cup, jug, spoon);
  arena.prepend(renderer.domElement);
  game.dataset.webgl = "true";
  const el = name => arena.querySelector(".mix-" + name);
  const [glass, sink, pitcher, rod, zone] = ["cup","sink","pitcher","stirrer","stir-zone"].map(el);
  let width, height;
  function place(obj, element, bounds) {
    const box = element.getBoundingClientRect();
    obj.position.x = ((box.left + box.width / 2 - bounds.left) / width - .5) * camera.right * 2;
    obj.position.y = (.5 - (box.top + box.height / 2 - bounds.top) / height) * 2.8;
  }
  const origin = new T.Vector3(), home = new T.Vector3(), dock = new T.Vector3();
  const pivot = new T.Vector3(), previous = new T.Vector3(), point = new T.Vector3();
  const lip = new T.Vector3();
  const surface = new T.Vector3();
  const flow = new T.Vector3();
  const vertical = new T.Vector3(0, 1, 0);
  const spoonDropOrigin = new T.Vector3();
  const spoonDropRotation = new T.Quaternion();
  let spoonDropStart;
  function render(now) {
    const bounds = arena.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    if (bounds.width !== width || bounds.height !== height) {
      width = bounds.width; height = bounds.height;
      renderer.setSize(width, height, false);
      camera.right = 1.4 * width / height; camera.left = -camera.right;
      camera.updateProjectionMatrix();
    }
    const phase = game.dataset.phase;
    const elapsed = phase === "pouring" ? performance.now() - game.pourStarted : 0;
    const smooth = (a,b) => T.MathUtils.smoothstep(elapsed,a,b);
    const amount = phase === "pour" ? 0 : phase === "pouring" ? smooth(600,1780) : 1;
    basin.visible = phase === "sink" || phase === "done";
    place(cup, glass, bounds); place(basin, sink, bounds);
    basin.position.y = counterHeight + .008;
    counter.position.set(basin.position.x, counterHeight, 0);
    insert.visible = !basin.visible;
    cup.rotation.x = counterPitch;
    const cupBase = .70;
    cup.position.y = counterHeight + cupBase * Math.cos(counterPitch);
    cup.position.z = cupBase * Math.sin(counterPitch);
    shadow.position.set(cup.position.x,counterHeight+.003,0);
    jug.visible = !pitcher.hidden;
    if (jug.visible) {
      place(jug, pitcher, bounds);
      const jugBase = .40 * jug.scale.y;
      const restY = counterHeight + jugBase * Math.cos(counterPitch);
      jug.position.z = jugBase * Math.sin(counterPitch);
      jug.rotation.set(.30, 2.85, 0, "ZXY");
      if (phase === "pouring") {
        const lift = smooth(0,430), lower = smooth(1950,2300);
        origin.set((game.pourOrigin.x * 2 - 1) * camera.right, (.5 - game.pourOrigin.y) * 2.8, jug.position.z);
        home.set((.26 * 2 - 1) * camera.right, restY, jug.position.z);
        jug.rotation.z = -(smooth(330,820) * .73 + amount * .25) * (1 - smooth(1780,2080));
        pivot.set(-.68,.36,0).multiply(jug.scale).applyQuaternion(jug.quaternion);
        dock.copy(cup.position).add(lip.set(-.12,.83,.04)).sub(pivot);
        jug.position.lerpVectors(origin,dock,lift).lerp(home,lower);
        jug.position.y += .12 * Math.sin(Math.PI * lift);
        shot.scale.y = 1 - amount * .99;
        shot.position.y = -.11 - amount * .21;
        shot.visible = amount < .998;
      }
    }
    jug.localToWorld(lip.set(-.68,.36,0));
    cup.localToWorld(surface.set(.015,.36 + .14 * amount,.045));
    previous.copy(lip);
    const reach = smooth(530,655), tail = smooth(1670,1800);
    stream.forEach((part, index) => {
      part.visible = phase === "pouring" && reach > 0 && tail < 1;
      if (!part.visible) return;
      const t = reach * (index + 1) / stream.length;
      point.lerpVectors(lip,surface,t);
      point.y += (surface.y - lip.y) * (t*t - t);
      flow.subVectors(previous,point);
      part.position.copy(previous).lerp(point,.5);
      const radius = Math.max(.04, (1-tail) * (.95 - .22*t));
      part.scale.set(radius,flow.length()*1.06,radius);
      part.quaternion.setFromUnitVectors(vertical,flow.normalize());
      previous.copy(point);
    });
    const progress = parseFloat(zone.style.getPropertyValue("--stir-progress")) || 0;
    const mixed = phase === "done" || phase === "sink";
    const blend = mixed ? 1 : progress / 100;
    const motion = game.stirMotion;
    coffee.value = amount;
    uniformity.value = blend;
    swirl.value = motion.angle;
    ice.rotation.y = motion.angle * .38;
    liquid.scale.y = 1 + .14 * amount / .94;
    liquid.position.y = -.58 + .47 * liquid.scale.y;
    meniscus.position.y = .36 + .14 * amount;
    ripple.visible = phase === "pouring" && elapsed > 630 && elapsed < 1840;
    const wave = ((elapsed + 90) % 460) / 460;
    ripple.position.y = meniscus.position.y + .006;
    ripple.scale.setScalar(.15 + wave);
    ripple.material.opacity = (1-wave)*.56;
    spoon.visible = phase === "stir" || mixed;
    if (phase === "done" && spoonDropStart === undefined) {
      spoonDropStart = now;
      spoonDropOrigin.copy(spoon.position);
      spoonDropRotation.copy(spoon.quaternion);
    }
    if (phase === "sink") {
      place(spoon, rod, bounds);
      const cupTarget = glass.getBoundingClientRect();
      const gripTarget = rod.getBoundingClientRect();
      spoon.position.y = cup.position.y + (cupTarget.top + cupTarget.height * .5 -
        gripTarget.top - gripTarget.height * .5) / height * 2.8;
    } else spoon.position.copy(phase === "done" ? basin.position : cup.position);
    spoon.position.z = phase === "done" ? .04 : cup.position.z + .10;
    spoon.position.y += phase === "done" ? .05 : .42;
    spoon.rotation.set(.28, 0, phase === "done" ? 1.30 : Math.PI);
    if (phase === "stir") {
      spoon.position.x += motion.x * .19;
      spoon.position.y += .19 - motion.y * .11;
      spoon.position.z += motion.y * .1;
      spoon.rotation.z -= motion.x * .43;
      spoon.rotation.x += motion.y * .28;
    }
    if (phase === "done") {
      const settle = T.MathUtils.smoothstep(now - spoonDropStart, 0, 420);
      spoon.position.lerp(spoonDropOrigin, 1 - settle);
      spoon.position.y += .17 * Math.sin(Math.PI * settle);
      spoon.quaternion.slerp(spoonDropRotation, 1 - settle);
    }
    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(render);
  return () => {
    renderer.setAnimationLoop(null);
    scene.traverse(obj => { obj.geometry?.dispose(); obj.material?.dispose(); });
    resources.shadow.dispose(); env.dispose(); renderer.dispose(); renderer.domElement.remove();
  };
}
