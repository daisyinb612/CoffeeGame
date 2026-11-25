import * as THREE from "./vendor/three.module.min.js";
import { createStudioEnvironment, tumblerProfile } from "./inventory-models.js?v=ice-3d";

export const cupFloor = -.594;
export const cupRim = .69;

export function makeGlass() {
  const shape = tumblerProfile.map(([radius, y]) => new THREE.Vector2(radius, y));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec3 eyeNormal;
      varying vec3 toEye;
      varying float height;
      void main() {
        vec4 eye = modelViewMatrix * vec4(position, 1.);
        eyeNormal = normalMatrix * normal;
        toEye = isOrthographic ? vec3(0., 0., 1.) : -eye.xyz;
        height = position.y;
        gl_Position = projectionMatrix * eye;
      }
    `,
    fragmentShader: `
      varying vec3 eyeNormal;
      varying vec3 toEye;
      varying float height;
      void main() {
        vec3 normal = normalize(eyeNormal);
        vec3 view = normalize(toEye);
        float edge = pow(1. - abs(dot(normal, view)), 4.);
        float rim = smoothstep(.685, .707, height);
        float base = 1. - smoothstep(-.690, -.631, height);
        float reflection = dot(reflect(-view, normal), normalize(vec3(-.74, .29, .56)));
        float strip = smoothstep(.90, .98, reflection) * (1. - smoothstep(.992, .999, reflection));
        float light = max(strip, rim * .63);
        float opacity = .010 + edge * .43 + rim * .27 + base * .074 + strip * .34;
        vec3 glass = mix(vec3(.18, .19, .195), vec3(.99, .995, 1.), light);
        gl_FragColor = vec4(glass, min(opacity, .73));
        #include <colorspace_fragment>
      }
    `,
  });
  const cup = new THREE.Mesh(new THREE.LatheGeometry(shape, 72), material);
  cup.renderOrder = 4;
  return cup;
}

function iceGeometry(variant) {
  const geometry = new THREE.BoxGeometry(1, 1, 1, 9, 9, 9);
  const { position, normal } = geometry.attributes;
  const corner = new THREE.Vector3(), direction = new THREE.Vector3();
  const rounding = .11 + variant * .011;
  const half = .5 - rounding;
  const aspect = new THREE.Vector3(1.02 + variant * .035, .82 + (variant % 3) * .086, .94 - variant * .019);
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
    corner.set(x, y, z).clampScalar(-half, half);
    direction.set(x, y, z).sub(corner).normalize();
    corner.addScaledVector(direction, rounding);
    // Press one corner inward, leaving broad faces and a few chipped edges.
    const sign = variant % 2 === 0 ? 1 : -1;
    const chip = Math.max(0, (x * sign - y + z) - .75) * .13;
    const texture = .012 * Math.sin(x * 18 + z * 13 + variant) * Math.cos(y * 19 - z * 16);
    corner.addScaledVector(direction, texture - chip).multiply(aspect);
    position.setXYZ(index, corner.x + .058 * y, corner.y + .047 * z, corner.z - .035 * x);
    direction.divide(aspect).normalize();
    normal.setXYZ(index, direction.x, direction.y, direction.z);
  }
  return geometry;
}

function iceMaterial(color, clarity) {
  const material = new THREE.MeshPhysicalMaterial({
    color, roughness: .125, ior: 1.31, transmission: clarity, specularIntensity: .87,
    thickness: .29, attenuationColor: "#e4e8e9", attenuationDistance: .82, envMapIntensity: .90,
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        varying vec3 localIce;
        varying vec3 iceRay;
      `)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        localIce = position;
        iceRay = transpose(mat3(modelViewMatrix)) *
          (isOrthographic ? vec3(0., 0., -1.) : normalize((modelViewMatrix * vec4(position, 1.)).xyz));
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 localIce;
        varying vec3 iceRay;
        float bubblePocket(vec3 ray, vec3 p, vec3 center, vec3 size) {
          // Integrate a soft pocket below the surface along the viewing ray.
          vec3 origin = (p - center) / size;
          vec3 direction = ray / size;
          float t = clamp(-dot(origin, direction) / dot(direction, direction), 0., .75);
          vec3 closest = origin + direction * t;
          return exp(-2.6 * dot(closest, closest));
        }
      `)
      .replace("#include <transmission_fragment>", THREE.ShaderChunk.transmission_fragment
        .replace("material.transmission = transmission;", `vec3 ray = normalize(iceRay);
         float scatter =
           bubblePocket(ray, localIce, vec3(-.12, -.13, .03), vec3(.25, .20, .25)) * .31
           + bubblePocket(ray, localIce, vec3(.12, .13, -.08), vec3(.12, .23, .17)) * .25;
         material.transmission = transmission * (1. - scatter);`)
        .replace("totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );", `
          totalDiffuse = mix(totalDiffuse, transmitted.rgb, material.transmission);
          // Show the curved wet bevel without painting a bright patch on the faces.
          float faceAngle = abs(dot(normal, normalize(vViewPosition)));
          float bevel = smoothstep(.08, .30, faceAngle) * (1. - smoothstep(.43, .69, faceAngle));
          float glint = bevel * smoothstep(-.35, .75, dot(normal, normalize(vec3(-.6, .7, .3))));
          float bubbleTrace = bubblePocket(ray, localIce, vec3(.09, -.045, .025), vec3(.06, .23, .095));
          totalDiffuse *= 1. - bevel * .16;
          totalDiffuse = mix(totalDiffuse, vec3(.86, .90, .91), scatter * .54 + bubbleTrace * .12 + glint * .52);
        `));
  };
  return material;
}

export function icePiece(shared, variant) {
  const group = new THREE.Group();
  const shape = shared.shapes[variant % shared.shapes.length];
  group.add(new THREE.Mesh(shape, shared.ice[variant % shared.ice.length]));
  return group;
}

export function addIce(group, height, shared, piecesPerRow = 3) {
  const rows = height < .35 ? 1 : height < .57 ? 3 : height < .9 ? 5 : 6;
  const peak = THREE.MathUtils.lerp(cupFloor, cupRim, Math.min(height, .98));
  for (let row = 0; row < rows; row++) {
    const rowHeight = THREE.MathUtils.lerp(cupFloor + .119, peak - .105, row / Math.max(rows - 1, 1));
    for (let column = 0; column < piecesPerRow; column++) {
      const turn = column * Math.PI * 2 / piecesPerRow + row * .87 - .25;
      const radius = .083 + .019 * Math.cos(row * 1.7 + column);
      const cube = icePiece(shared, row * piecesPerRow + column);
      if (piecesPerRow === 2) {
        const side = 1 - 2 * column;
        const x = side * (.109 + .013 * Math.cos(row * 1.9 + column)) + .019 * Math.sin(row * 2.2);
        const depth = side * .068 * Math.cos(row * 1.5 + .4);
        const height = THREE.MathUtils.lerp(cupFloor + .119, peak - .164, row / Math.max(rows - 1, 1));
        cube.position.set(x, height + side * .041 * Math.sin(row * 2.4 + .45), depth);
      } else {
        cube.position.set(Math.cos(turn) * radius, rowHeight + Math.sin(turn + row * 2) * .030, Math.sin(turn) * radius);
      }
      cube.rotation.set(.38 * Math.sin(turn + row), .56 + turn * .68, .43 * Math.cos(row + turn));
      cube.scale.setScalar(.194 + .013 * Math.cos(row * 1.37 + column * 2));
      group.add(cube);
    }
  }
  if (height > 1) {
    const cube = icePiece(shared, 4);
    cube.position.set(.038, cupRim + .058, -.033);
    cube.rotation.set(.33, .65, -.35);
    cube.scale.setScalar(.23);
    group.add(cube);
  }
}

export function createIceResources(renderer) {
  return {
    environment: createStudioEnvironment(renderer),
    shapes: Array.from({ length: 4 }, (_, variant) => iceGeometry(variant)),
    ice: ["#d5dfe2", "#e5e6e1", "#ced8de"].map((color, index) => iceMaterial(color, .96 - index * .055)),
    shadow: new THREE.MeshBasicMaterial({
      color: "#74685b", transparent: true, opacity: .13, depthWrite: false,
    }),
  };
}
