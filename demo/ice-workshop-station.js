import * as THREE from "./vendor/three.module.min.js";
import { cupFloor, cupRim, icePiece } from "./ice-models.js?v=ice-pile";

function roundSink(path, width, depth, radius) {
  const x = width / 2, z = depth / 2;
  path.moveTo(-x + radius, -z);
  path.lineTo(x - radius, -z).quadraticCurveTo(x, -z, x, -z + radius);
  path.lineTo(x, z - radius).quadraticCurveTo(x, z, x - radius, z);
  path.lineTo(-x + radius, z).quadraticCurveTo(-x, z, -x, z - radius);
  path.lineTo(-x, -z + radius).quadraticCurveTo(-x, -z, -x + radius, -z);
  return path;
}

function buildDrainboard(fixture, counterMaterial, steel) {
  const x = -.28;
  const width = 1.52, depth = 1.19;
  const cutout = roundSink(new THREE.Path(), width, depth, .13);
  const surround = roundSink(new THREE.Shape(), 12, 12, .20);
  surround.holes.push(cutout);
  const deck = new THREE.Mesh(new THREE.ShapeGeometry(surround, 16), counterMaterial);
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(x, -.70, 0);
  fixture.add(deck);

  const rimOutline = roundSink(new THREE.Shape(), width + .093, depth + .093, .16);
  rimOutline.holes.push(roundSink(new THREE.Path(), width - .053, depth - .053, .12));
  const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(rimOutline, {
    depth: .013, bevelSize: .010, bevelThickness: .008, bevelSegments: 3, curveSegments: 12,
  }), steel);
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(x, -.701, 0);
  fixture.add(rim);

  // The welded basin is below the rim. The roll-up rack spans only part of it.
  const innerFinish = new THREE.MeshPhysicalMaterial({
    color: "#898d8d", metalness: .73, roughness: .43, anisotropy: .31, envMapIntensity: .73,
    side: THREE.DoubleSide,
  });
  const outline = roundSink(new THREE.Shape(), width, depth, .13).getSpacedPoints(60);
  const positions = [], triangles = [];
  for (const [row, y, taper] of [[0, -.698, .986], [1, -.899, .87], [2, -.951, .81]]) {
    for (const [index, corner] of outline.entries()) {
      positions.push(x + corner.x * taper, y, corner.y * taper);
      if (!row || !index) continue;
      const a = (row - 1) * outline.length + index - 1;
      const b = a + outline.length;
      triangles.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const wall = new THREE.BufferGeometry();
  wall.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  wall.setIndex(triangles);
  wall.computeVertexNormals();
  fixture.add(new THREE.Mesh(wall, innerFinish));
  const bottom = new THREE.Mesh(
    new THREE.ShapeGeometry(roundSink(new THREE.Shape(), width * .82, depth * .82, .115), 16), innerFinish,
  );
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.set(x, -.949, 0);
  fixture.add(bottom);
  const drain = new THREE.Mesh(new THREE.CylinderGeometry(.091, .092, .010, 36), steel);
  drain.position.set(x - .35, -.94, -.13);
  fixture.add(drain);
  const drainHole = new THREE.MeshBasicMaterial({ color: "#3b4243" });
  const drainHoleGeometry = new THREE.CircleGeometry(.009, 12);
  for (let i = 0; i < 7; i++) {
    const hole = new THREE.Mesh(drainHoleGeometry, drainHole);
    const angle = i * Math.PI / 3;
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(drain.position.x + (i === 6 ? 0 : .048 * Math.cos(angle)), -.934,
      drain.position.z + (i === 6 ? 0 : .048 * Math.sin(angle)));
    fixture.add(hole);
  }
  const rubber = new THREE.MeshStandardMaterial({ color: "#616665", roughness: .73 });
  for (const z of [-.536, .536]) {
    const end = new THREE.Mesh(new THREE.BoxGeometry(.94, .034, .08), rubber);
    end.position.set(x + .221, -.671, z);
    fixture.add(end);
  }
  const rod = new THREE.CylinderGeometry(.016, .016, 1.098, 20);
  for (let index = 0; index < 11; index++) {
    const rail = new THREE.Mesh(rod, steel);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(x - .205 + index * .085, -.679, 0);
    fixture.add(rail);
  }
  return deck;
}

export function buildWaterStation(scene, cup, counterMaterial) {
  const cupX = -.23;
  const steel = new THREE.MeshPhysicalMaterial({
    color: "#ced2d0", metalness: .92, roughness: .26, envMapIntensity: 1.1,
    clearcoat: .14, clearcoatRoughness: .32,
  });
  const fixture = new THREE.Group();
  fixture.visible = false;
  const foot = new THREE.Mesh(new THREE.LatheGeometry([
    [0, 0], [.124, 0], [.136, .009], [.133, .034], [.101, .045],
    [.101, .162], [.098, .181], [.071, .192], [0, .192],
  ].map(([radius, height]) => new THREE.Vector2(radius, height)), 48), steel);
  foot.position.set(.68, -.70, -.37);
  const pipePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(.68, -.54, -.37), new THREE.Vector3(.69, .44, -.36),
    new THREE.Vector3(.65, .86, -.32), new THREE.Vector3(.39, 1.02, -.25),
    new THREE.Vector3(.06, 1.00, -.15), new THREE.Vector3(cupX + .04, .94, -.025),
    new THREE.Vector3(cupX, .81, 0),
  ]);
  const pipe = new THREE.Mesh(new THREE.TubeGeometry(pipePath, 60, .039, 24), steel);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(.045, .047, .062, 32), steel);
  nozzle.position.set(cupX + .008, .809, 0);
  nozzle.rotation.z = -.22;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.043, .006, 10, 32), steel);
  collar.position.set(cupX, .790, 0);
  collar.rotation.x = Math.PI / 2;
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(.065, .073, .137, 32), steel);
  valve.position.set(.759, -.554, -.365);
  valve.rotation.z = -Math.PI / 2;
  const lever = new THREE.Group();
  lever.position.set(.816, -.532, -.344);
  const handle = new THREE.Mesh(new THREE.CapsuleGeometry(.018, .143, 6, 16), steel);
  handle.position.y = .070;
  lever.add(handle);
  fixture.add(foot, pipe, nozzle, collar, valve, lever);
  const deck = buildDrainboard(fixture, counterMaterial, steel);
  scene.add(fixture);

  const water = new THREE.Group();
  water.visible = false;
  const volume = new THREE.Mesh(
    new THREE.CylinderGeometry(.294, .272, 1, 72, 1, true),
    new THREE.MeshPhysicalMaterial({
      color: "#adc2c2", roughness: .17, transparent: true, opacity: .25,
      depthWrite: false,
    }),
  );
  const surface = new THREE.Group();
  const meniscus = new THREE.Mesh(
    new THREE.TorusGeometry(.293, .0033, 8, 72),
    new THREE.MeshBasicMaterial({ color: "#65817e", transparent: true, opacity: .54, depthWrite: false }),
  );
  const reflection = new THREE.Mesh(
    new THREE.CircleGeometry(.292, 72),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `
        varying vec2 surfacePoint;
        void main() {
          surfacePoint = position.xy / .292;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
        }
      `,
      fragmentShader: `
        varying vec2 surfacePoint;
        void main() {
          float gap = (surfacePoint.y - .36 * surfacePoint.x + .28) * 7.;
          float band = exp(-gap * gap);
          float edge = smoothstep(.72, .98, length(surfacePoint));
          gl_FragColor = vec4(.82, .92, .91, .12 + band * .27 + edge * .12);
        }
      `,
    }),
  );
  reflection.renderOrder = 3;
  meniscus.renderOrder = 4;
  surface.add(reflection, meniscus);
  surface.rotation.x = -Math.PI / 2;
  const ripple = new THREE.Mesh(
    new THREE.TorusGeometry(.159, .004, 6, 36),
    new THREE.MeshBasicMaterial({ color: "#f7ffff", transparent: true, depthWrite: false }),
  );
  ripple.rotation.x = -Math.PI / 2;
  volume.renderOrder = 2;
  ripple.renderOrder = 4;
  water.add(volume, surface, ripple);
  cup.add(water);
  const stream = new THREE.Mesh(
    new THREE.CylinderGeometry(.017, .024, 1, 18),
    new THREE.MeshPhysicalMaterial({
      color: "#b8d6d7", roughness: .14, transparent: true, opacity: .73, depthWrite: false,
    }),
  );
  stream.visible = false;
  stream.position.x = cupX;
  stream.renderOrder = 5;
  scene.add(stream);

  return {
    cupX,
    fixture,
    deck,
    switchPosition: new THREE.Vector3(.83, -.463, -.344),
    setLevel(level, running = false) {
      const depth = (cupRim - cupFloor) * Math.min(level, .993);
      const y = cupFloor + depth;
      water.visible = depth > .005;
      volume.scale.y = Math.max(depth, .005);
      volume.position.y = cupFloor + depth / 2;
      surface.position.y = y;
      surface.scale.setScalar(.943 + Math.min(level, .993) * .057);
      const wave = (performance.now() % 670) / 670;
      lever.rotation.z = running ? -.99 : -.32;
      ripple.visible = running;
      ripple.position.y = y + .002;
      ripple.scale.setScalar(.24 + wave * 1.27);
      ripple.material.opacity = .64 * (1 - wave);
      stream.visible = running;
      stream.material.opacity = .66 + .15 * Math.sin(wave * Math.PI);
      const streamBottom = cup.position.y + Math.max(y, cupFloor + .03);
      stream.position.y = (streamBottom + .784) / 2;
      stream.scale.y = .784 - streamBottom;
    },
  };
}

export function buildCupInspection(scene, resources) {
  const ice = new THREE.Group();
  ice.position.set(-.64, -.70, .40);
  for (const [index, size] of [.18, .124].entries()) {
    const piece = icePiece(resources, index + 3);
    piece.scale.setScalar(size);
    piece.scale.y *= index ? .60 : .78;
    piece.position.set(index * -.16, size * .32, index * .057);
    piece.rotation.set(.09 + index * .22, -.55 * index, .13);
    ice.add(piece);
  }
  const edge = new THREE.SplineCurve([
    new THREE.Vector2(-.23, -.02), new THREE.Vector2(-.16, -.10),
    new THREE.Vector2(-.06, -.14), new THREE.Vector2(.03, -.086),
    new THREE.Vector2(.20, -.11), new THREE.Vector2(.24, -.015),
    new THREE.Vector2(.15, .12), new THREE.Vector2(.03, .079), new THREE.Vector2(-.07, .11),
    new THREE.Vector2(-.23, -.02),
  ]);
  const puddle = new THREE.Mesh(
    new THREE.ShapeGeometry(new THREE.Shape(edge.getPoints(42))),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `
        varying vec2 wetPoint;
        void main() {
          wetPoint = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
        }
      `,
      fragmentShader: `
        varying vec2 wetPoint;
        void main() {
          float offset = (wetPoint.y - .42 * wetPoint.x - .042) * 38.;
          float reflection = exp(-offset * offset);
          float warm = .5 + .5 * sin(wetPoint.x * 11. + wetPoint.y * 7.);
          vec3 color = mix(vec3(.46, .43, .37), vec3(.97, .96, .91), reflection);
          gl_FragColor = vec4(color, .22 + .07 * warm + .22 * reflection);
        }
      `,
    }),
  );
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(.54, -.696, .43);
  puddle.renderOrder = 1;
  const dropMaterial = new THREE.MeshPhysicalMaterial({
    color: "#b3b1a6", roughness: .17, transparent: true, opacity: .41, depthWrite: false,
    clearcoat: .71, clearcoatRoughness: .19,
  });
  for (const [x, z, size] of [[-.274, .058, .025], [.274, .048, .018], [.236, -.102, .011]]) {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 12), dropMaterial);
    drop.position.set(x, z, .001);
    drop.scale.set(.84, 1, .12);
    drop.renderOrder = puddle.renderOrder;
    puddle.add(drop);
  }
  ice.visible = puddle.visible = false;
  scene.add(ice, puddle);
  return { ice, puddle, restPosition: new THREE.Vector3(.61, 0, -.24) };
}
