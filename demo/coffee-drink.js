import * as T from "./vendor/three.module.min.js";
import { makeGlass, addIce } from "./ice-models.js";

export function createCoffeeDrink(resources, { finishedOpacity = .60 } = {}) {
  function mesh(parent, geometry, color, options = {}) {
    const object = new T.Mesh(geometry, new T.MeshStandardMaterial({ color, ...options }));
    parent.add(object);
    return object;
  }
  const cup = makeGlass();
  const liquid = mesh(cup, new T.CylinderGeometry(.29, .269, .94, 64), 0xc9d8d5,
    { transparent: true, opacity: .14, roughness: .07, depthWrite: false });
  liquid.position.y = -.11;
  const bodyOpacity = { value: finishedOpacity };
  const coffee = { value: 0 }, uniformity = { value: 0 }, swirl = { value: 0 };
  liquid.material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { coffee, uniformity, swirl, bodyOpacity });
    shader.vertexShader = "varying vec3 drinkPosition;\n" + shader.vertexShader.replace(
      "#include <begin_vertex>", "#include <begin_vertex>\n drinkPosition = position;");
    shader.fragmentShader = "varying vec3 drinkPosition; uniform float coffee, uniformity, swirl, bodyOpacity;\n" +
      shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
        float h = drinkPosition.y / .94 + .5;
        float angle = atan(drinkPosition.z, drinkPosition.x + .0001);
        float curl = sin(angle * 3. + h * 7. - swirl) * .09 + sin(angle + h * 11. - swirl) * .07;
        float plume = smoothstep(.55, 1., h + curl);
        float strength = coffee * mix(plume, .73, uniformity);
        vec3 clearWater = mix(vec3(.68,.77,.75), vec3(.085,.029,.012), sqrt(strength));
        float edge = smoothstep(.15, .29, length(drinkPosition.xz));
        vec3 brewedCoffee = mix(vec3(.045,.013,.004), vec3(.19,.065,.015), h * .48 + edge * .22);
        diffuseColor.rgb = mix(clearWater, brewedCoffee, uniformity);
        diffuseColor.a = mix(.12 + .71 * strength, bodyOpacity, uniformity);`);
  };
  const meniscus = mesh(cup, new T.TorusGeometry(.287,.007,8,72), 0xa6b8b4,
    { metalness: .35, roughness: .13 });
  meniscus.rotation.x = Math.PI / 2;
  meniscus.position.y = .36;
  // A reflective surface and a few rim bubbles give the finished drink depth.
  const finish = new T.Group();
  cup.add(finish);
  const coffeeSurface = new T.Mesh(new T.CircleGeometry(.283, 72), new T.MeshPhysicalMaterial({
    color: 0x492311, roughness: .19, metalness: 0,
    clearcoat: .75, clearcoatRoughness: .12,
    transparent: true, opacity: .48, depthWrite: false, side: T.DoubleSide,
  }));
  coffeeSurface.rotation.x = -Math.PI / 2;
  finish.add(coffeeSurface);
  const bubbleMaterial = new T.MeshStandardMaterial({
    color: 0xc3996b, roughness: .28, transparent: true, opacity: .48, depthWrite: false,
  });
  for (let i = 0; i < 9; i++) {
    const angle = .3 + i * .29;
    const radius = .259 + Math.sin(i * 2.3) * .008;
    const bubble = new T.Mesh(new T.TorusGeometry(.0035 + (i % 3) * .0016, .0012, 5, 12), bubbleMaterial);
    bubble.rotation.x = -Math.PI / 2;
    bubble.position.set(Math.cos(angle) * radius, .002, Math.sin(angle) * radius);
    finish.add(bubble);
  }
  const ice = new T.Group();
  cup.add(ice);
  addIce(ice, .81, resources, 2);
  for (const iceMaterial of resources.ice) {
    iceMaterial.transparent = true;
    iceMaterial.opacity = .62;
    iceMaterial.depthWrite = false;
  }
  function setState(amount, blend, angle = 0) {
    coffee.value = amount;
    uniformity.value = blend;
    swirl.value = angle;
    ice.rotation.y = angle * .38;
    liquid.scale.y = 1 + .14 * amount / .94;
    liquid.position.y = -.58 + .47 * liquid.scale.y;
    meniscus.position.y = .36 + .14 * amount;
    meniscus.material.color.set(blend > .7 ? 0x79502f : 0xa6b8b4);
    finish.visible = blend > .7;
    finish.position.y = meniscus.position.y - .004;
    coffeeSurface.material.opacity = .48 * T.MathUtils.smoothstep(blend, .7, 1);
  }
  setState(0, 0);
  return { cup, meniscus, setState };
}
