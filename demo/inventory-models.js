import * as THREE from "./vendor/three.module.min.js";
import { clearGlassMaterial } from "./glass-material.js?v=round-glass-edge";

// The profiles and proportions are estimates from the recording.
// The profile goes along the outside, over the lip, then down the hollow inside.
export const tumblerProfile = [
  [0, -.70], [.255, -.70], [.278, -.696], [.294, -.685], [.300, -.666],
  [.300, -.632], [.292, -.610], [.291, -.570], [.305, .22], [.317, .675],
  [.320, .693], [.318, .702], [.310, .708], [.302, .705], [.298, .696],
  [.299, .676], [.286, .21], [.274, -.535], [.271, -.562], [.257, -.583],
  [.231, -.594], [0, -.595],
];

function turned(profile, material, segments = 84) {
  const points = profile.map(([radius, y]) => new THREE.Vector2(radius, y));
  return new THREE.Mesh(new THREE.LatheGeometry(points, segments), material);
}

function metal(roughness = .20) {
  return new THREE.MeshStandardMaterial({ color: "#dce2e4", metalness: .96, roughness, envMapIntensity: 1.22 });
}

export function woodMaterial([red, green, blue], { grainContrast = 1, roughness = .86, bumpScale = .0045 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const image = context.createImageData(canvas.width, canvas.height);
  const pixels = image.data;
  let seed = 2126;
  for (let y = 0; y < canvas.height; y++) {
    const along = y / canvas.height;
    for (let x = 0; x < canvas.width; x++) {
      const around = x * 2 * Math.PI / canvas.width;
      const grain = around + .062 * Math.sin(along * 4 - around * 3)
        + .022 * Math.sin(along * 11 + around * 5);
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const pores = (seed / 4294967296 - .5) * 8;
      const fibers = 5.5 * Math.sin(grain * 13 + 1.4 * Math.sin(around * 5 + along * 3))
        + 3.4 * Math.sin(grain * 31 + 1.7 * Math.cos(around * 9 + along * 5))
        + 2.4 * Math.sin(grain * 63);
      const tone = fibers * grainContrast + 4.3 * Math.sin(around * 3 + along) + pores;
      const index = (y * canvas.width + x) * 4;
      pixels[index] = red + tone;
      pixels[index + 1] = green + tone * .73;
      pixels[index + 2] = blue + tone * .54;
      pixels[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const grain = new THREE.CanvasTexture(canvas);
  grain.colorSpace = THREE.SRGBColorSpace;
  grain.wrapS = THREE.RepeatWrapping;
  grain.anisotropy = 4;
  return new THREE.MeshStandardMaterial({
    map: grain, bumpMap: grain, bumpScale, roughness, envMapIntensity: .38,
  });
}

const measuringProfile = [
  [0, -.70], [.265, -.70], [.332, -.676], [.358, -.619], [.372, -.49],
  [.405, .11], [.456, .665], [.458, .691], [.451, .708], [.436, .709],
  [.426, .692], [.425, .662], [.376, .10], [.344, -.51], [.325, -.572],
  [.296, -.597], [0, -.604],
];

function measuringCup() {
  const object = new THREE.Group();
  const gripMaterial = woodMaterial([92, 53, 40]);
  const profile = measuringProfile.map(([radius, y]) => [radius, y * .57]);
  const cup = turned(profile, clearGlassMaterial(profile, [.386, 1.044, -.015, .067]), 112);
  cup.position.x = -.27;
  const grip = turned([
    [0, -.30], [.071, -.30], [.081, -.286], [.083, -.23],
    [.101, .22], [.110, .262], [.102, .284], [0, .284],
  ], gripMaterial, 42);
  grip.rotation.z = -Math.PI / 2;
  grip.position.set(.49, -.015, 0);
  const joint = new THREE.Mesh(
    new THREE.CylinderGeometry(.070, .082, .15, 32),
    gripMaterial,
  );
  joint.rotation.z = -Math.PI / 2;
  joint.position.set(.19, -.015, 0);
  object.add(cup, grip, joint);
  return { object, pose: [.20, -.31, -.02], studio: true };
}

function tray() {
  const rings = [
    // From the underside out to the rounded rim, then back to the flat well.
    [0, 0, 0, -.070, "#a39b90"],
    [.713, .444, .084, -.070, "#aaa297"],
    [.759, .486, .100, -.057, "#afa79d"],
    [.792, .522, .116, .048, "#b5ada2"],
    [.796, .526, .118, .064, "#bdb5aa"],
    [.788, .519, .117, .076, "#c6bdb2"],
    [.767, .498, .107, .079, "#c0b8ad"],
    [.748, .480, .098, .067, "#b5ada2"],
    [.721, .450, .084, .019, "#a79f95"],
    [.704, .432, .077, -.007, "#b7afa4"],
    [.679, .412, .072, -.012, "#b7afa4"],
    [0, 0, 0, -.012, "#b7afa4"],
  ];
  const vertices = [], colors = [], faces = [];
  const steps = 10;
  const ringSize = 4 * (steps + 1);
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (const [halfWidth, halfDepth, radius, y, color] of rings) {
    const shade = new THREE.Color(color);
    for (const [corner, [sx, sz]] of corners.entries()) {
      for (let i = 0; i <= steps; i++) {
        const angle = (corner + i / steps) * Math.PI / 2;
        const x = sx * (halfWidth - radius) + radius * Math.cos(angle);
        const z = sz * (halfDepth - radius) + radius * Math.sin(angle);
        vertices.push(x, y, z);
        colors.push(shade.r, shade.g, shade.b);
      }
    }
  }
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let i = 0; i < ringSize; i++) {
      const a = ring * ringSize + i;
      const b = ring * ringSize + (i + 1) % ringSize;
      faces.push(a, a + ringSize, b, b, a + ringSize, b + ringSize);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  const object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .72 }));
  return { object, pose: [.57, -.27, -.13], studio: true };
}

function spoonStem(material) {
  const positions = [], faces = [];
  const sections = 216;
  const sides = 16;
  for (let section = 0; section <= sections; section++) {
    const t = section / sections;
    const y = -.66 + t * 1.30;
    const twist = THREE.MathUtils.smoothstep(t, .06, .91) * Math.PI * 17;
    const neck = THREE.MathUtils.smoothstep(t, .86, 1);
    const forkJoint = 1 - THREE.MathUtils.smoothstep(t, 0, .075);
    const wide = .016 + .017 * neck + .006 * forkJoint;
    const thin = .007 + .0025 * neck;
    for (let side = 0; side < sides; side++) {
      const angle = side * 2 * Math.PI / sides;
      const x = Math.cos(angle) * wide;
      const z = Math.sin(angle) * thin;
      positions.push(x * Math.cos(twist) - z * Math.sin(twist), y, x * Math.sin(twist) + z * Math.cos(twist));
      if (section === sections) continue;
      const a = section * sides + side;
      const b = section * sides + (side + 1) % sides;
      faces.push(a, a + sides, b, b, a + sides, b + sides);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function spoonFork(material) {
  const tip = new THREE.Shape();
  tip.moveTo(-.016, -.628);
  tip.quadraticCurveTo(-.022, -.675, -.047, -.703);
  tip.quadraticCurveTo(-.062, -.720, -.060, -.760);
  tip.lineTo(-.051, -.929);
  tip.quadraticCurveTo(-.049, -.950, -.041, -.950);
  tip.quadraticCurveTo(-.031, -.950, -.030, -.932);
  tip.lineTo(-.024, -.786);
  tip.quadraticCurveTo(-.019, -.770, -.014, -.787);
  tip.lineTo(-.010, -.943);
  tip.quadraticCurveTo(-.008, -.959, 0, -.959);
  tip.quadraticCurveTo(.008, -.959, .010, -.943);
  tip.lineTo(.014, -.787);
  tip.quadraticCurveTo(.019, -.770, .024, -.786);
  tip.lineTo(.030, -.932);
  tip.quadraticCurveTo(.031, -.950, .041, -.950);
  tip.quadraticCurveTo(.049, -.950, .051, -.929);
  tip.lineTo(.060, -.760);
  tip.quadraticCurveTo(.062, -.720, .047, -.703);
  tip.quadraticCurveTo(.022, -.675, .016, -.628);
  tip.closePath();
  const fork = new THREE.Mesh(new THREE.ExtrudeGeometry(tip, {
    depth: .009, bevelThickness: .002, bevelSize: .002, bevelSegments: 3, curveSegments: 8,
  }), material);
  fork.position.z = -.0045;
  return fork;
}

function spoon() {
  const object = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({
    color: "#e6e5e1", metalness: .86, roughness: .23, envMapIntensity: 1.28,
  });
  const bowl = turned([
    [0, -.041], [.031, -.039], [.054, -.030], [.073, -.016], [.084, .001],
    [.086, .007], [.084, .012], [.079, .010], [.070, -.006], [.051, -.019],
    [.028, -.026], [0, -.028],
  ], silver, 80);
  const surface = bowl.geometry.attributes.position;
  for (let i = 0; i < surface.count; i++) {
    const z = surface.getZ(i);
    surface.setX(i, surface.getX(i) * (1 - .18 * z / .086));
    surface.setZ(i, z * 1.82);
  }
  bowl.geometry.computeVertexNormals();
  bowl.rotation.x = Math.PI / 2;
  bowl.position.y = .749;
  object.add(bowl, spoonStem(silver), spoonFork(silver));
  return { object, pose: [.12, -.16, -.94], studio: true };
}

function tamper() {
  const object = new THREE.Group();
  const base = turned([
    [0, -.490], [.383, -.490], [.398, -.487], [.405, -.479], [.408, -.468],
    [.408, -.411], [.405, -.401], [.398, -.394], [.384, -.389], [.346, -.380],
    [.305, -.365], [.237, -.344], [.165, -.325], [.131, -.321], [0, -.321],
  ], new THREE.MeshPhysicalMaterial({
    color: "#d9d8d4", metalness: .96, roughness: .37, envMapIntensity: 1.05,
    anisotropy: .31,
  }), 120);
  const handleProfile = new THREE.SplineCurve([
    [0, -.328], [.126, -.328], [.147, -.321], [.151, -.297], [.143, -.272],
    [.130, -.250], [.119, -.212], [.116, -.164], [.123, -.101], [.136, -.041],
    [.159, .010], [.192, .053], [.228, .091], [.250, .141], [.258, .195],
    [.253, .252], [.233, .308], [.197, .357], [.151, .393], [.098, .419],
    [.047, .432], [0, .436],
  ].map(([radius, y]) => new THREE.Vector2(radius, y)));
  const handle = new THREE.Mesh(
    new THREE.LatheGeometry(handleProfile.getPoints(160), 120),
    woodMaterial([67, 38, 30], { grainContrast: .36, roughness: .64, bumpScale: .0015 }),
  );
  object.add(base, handle);
  object.scale.setScalar(1.30);
  object.position.y = .075;
  return { object, pose: [.25, -.19, -.14], studio: true };
}

function straw() {
  const object = new THREE.Group();
  const tube = turned([
    [.028, -.804], [.028, .804], [.021, .804], [.021, -.804], [.028, -.804],
  ], new THREE.MeshStandardMaterial({ color: "#f2eee4", roughness: .48, side: THREE.DoubleSide }), 36);
  const wrapper = new THREE.Mesh(
    new THREE.BoxGeometry(.088, 1.75, .063),
    new THREE.MeshStandardMaterial({
      color: "#d9ded9", transparent: true, opacity: .38, depthWrite: false, roughness: .59,
    }),
  );
  const seams = new THREE.Mesh(
    new THREE.BoxGeometry(.011, 1.71, .066),
    new THREE.MeshStandardMaterial({ color: "#d7d8ce", roughness: .68 }),
  );
  seams.position.x = .040;
  object.add(tube, wrapper, seams);
  for (const y of [-.870, .870]) {
    const crimp = new THREE.Mesh(
      new THREE.BoxGeometry(.096, .045, .013),
      new THREE.MeshStandardMaterial({ color: "#e3e2d8", roughness: .72 }),
    );
    crimp.position.y = y;
    object.add(crimp);
  }
  return { object, pose: [.10, -.25, -.75], studio: true };
}

export function createInventoryModel(kind) {
  switch (kind) {
    case "glass": return { object: turned(tumblerProfile, clearGlassMaterial(tumblerProfile), 96), pose: [.24, -.22, -.045] };
    case "tray": return tray();
    case "spoon": return spoon();
    case "measuring-cup": return measuringCup();
    case "tamper": return tamper();
    case "straw": return straw();
    default: throw Error("Unknown inventory model.");
  }
}

export function createStudioEnvironment(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#626466");
  const panels = [
    { size: [1.5, 4.4], location: [-3.4, 1.8, 2.0], power: 2.6 },
    { size: [1.1, 3.2], location: [3.0, .8, -.8], power: 1.9 },
    { size: [3.0, 2.1], location: [.4, 3.8, 1.0], power: 1.4 },
  ].map(({ size, location, power }) => {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(...size),
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(power) }));
    panel.position.set(...location);
    panel.lookAt(0, 0, 0);
    scene.add(panel);
    return panel;
  });
  const generator = new THREE.PMREMGenerator(renderer);
  try {
    return generator.fromScene(scene, .035);
  } finally {
    generator.dispose();
    for (const panel of panels) {
      panel.geometry.dispose();
      panel.material.dispose();
    }
  }
}
