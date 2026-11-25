import { ShaderMaterial, Vector2, Vector4 } from "./vendor/three.module.min.js";

export function clearGlassMaterial(profile, handleBounds) {
  const heights = profile.map(([, y]) => y);
  const defines = { PROFILE_SIZE: profile.length };
  if (handleBounds) defines.HAS_HANDLE = 1;
  return new ShaderMaterial({
    defines,
    uniforms: {
      profile: { value: profile.map(([radius, y]) => new Vector2(radius, y)) },
      heightRange: { value: new Vector2(Math.min(...heights), Math.max(...heights)) },
      ...(handleBounds && {
        handle: { value: new Vector4(...handleBounds) },
        floorJoin: { value: new Vector2(...profile.at(-2)) },
      }),
    },
    vertexShader: `
      varying vec3 surface;
      varying vec3 outward;
      varying vec3 observer;

      void main() {
        surface = position;
        outward = normal;
        observer = (inverse(modelViewMatrix) * vec4(0., 0., 0., 1.)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: `
      varying vec3 surface;
      varying vec3 outward;
      varying vec3 observer;
      uniform vec2 profile[PROFILE_SIZE];
      uniform vec2 heightRange;
      uniform mat4 modelViewMatrix;
      #ifdef HAS_HANDLE
        uniform vec4 handle;
        uniform vec2 floorJoin;
      #endif
      const float IOR = 1.50;
      const float EPSILON = .00125;
      const float NO_HIT = 100.;

      void testSide(vec3 origin, vec3 ray, float time, vec2 a, vec2 b, float taper,
                    inout float closest, inout vec3 normal) {
        if (time <= EPSILON || time >= closest) return;
        vec3 point = origin + time * ray;
        if (point.y < min(a.y, b.y) - .0001 || point.y > max(a.y, b.y) + .0001) return;
        vec2 radial = normalize(point.xz);
        normal = normalize(vec3(radial.x, -taper, radial.y)) * sign(b.y - a.y);
        closest = time;
      }

      // Each adjacent pair of points in the wall profile defines a conical
      // surface or a flat ring. Find the first interface along the current ray.
      float nextSurface(vec3 origin, vec3 ray, out vec3 normal) {
        float closest = NO_HIT;
        normal = vec3(0., 1., 0.);
        for (int i = 0; i < PROFILE_SIZE - 1; ++i) {
          vec2 a = profile[i], b = profile[i + 1];
          if (abs(b.y - a.y) < .0001) {
            if (abs(ray.y) < .00001) continue;
            float time = (a.y - origin.y) / ray.y;
            float radius = length(origin.xz + ray.xz * time);
            if (time > EPSILON && time < closest &&
                radius >= min(a.x, b.x) && radius <= max(a.x, b.x)) {
              closest = time;
              normal = vec3(0., sign(a.x - b.x), 0.);
            }
            continue;
          }
          float taper = (b.x - a.x) / (b.y - a.y);
          float radius = a.x + taper * (origin.y - a.y);
          float radialSpeed = taper * ray.y;
          float A = dot(ray.xz, ray.xz) - radialSpeed * radialSpeed;
          float B = dot(origin.xz, ray.xz) - radius * radialSpeed;
          float C = dot(origin.xz, origin.xz) - radius * radius;
          if (abs(A) < .00001) {
            if (abs(B) > .00001) testSide(origin, ray, -C / (2. * B), a, b, taper, closest, normal);
            continue;
          }
          float discriminant = B * B - A * C;
          if (discriminant < 0.) continue;
          float root = sqrt(discriminant);
          testSide(origin, ray, (-B - root) / A, a, b, taper, closest, normal);
          testSide(origin, ray, (-B + root) / A, a, b, taper, closest, normal);
        }
        return closest;
      }

      float fresnel(vec3 ray, vec3 normal) {
        float grazing = 1. - clamp(-dot(ray, normal), 0., 1.);
        return .04 + .96 * pow(grazing, 5.);
      }

      vec3 lightField(vec3 direction) {
        vec3 ray = normalize(mat3(modelViewMatrix) * direction);
        // Neutral paper behind the specimen, with narrow studio highlights
        // to the sides. The transmitted ray can see through multiple walls.
        const vec3 paper = vec3(.930, .905, .855);
        float side = smoothstep(.12, .86, abs(ray.x));
        float upward = smoothstep(.35, .96, ray.y);
        float key = smoothstep(.48, .62, -ray.x) * (1. - smoothstep(.73, .87, -ray.x))
          * smoothstep(-.65, .17, ray.y);
        float fill = smoothstep(.69, .84, ray.x) * smoothstep(-.55, .22, ray.y);
        vec3 base = paper - vec3(.59, .56, .51) * side - vec3(.16, .15, .12) * upward;
        return base + key * vec3(.78, .80, .83) + fill * vec3(.30, .34, .39);
      }

      #ifdef HAS_HANDLE
        float handleSurface(vec3 origin, vec3 ray, out vec3 normal) {
          // The connector has a round end face as well as a cylindrical side.
          // Either surface may be the first thing seen through the glass.
          float closest = NO_HIT;
          normal = vec3(1., 0., 0.);
          vec2 offset = origin.yz - vec2(handle.z, 0.);
          float A = dot(ray.yz, ray.yz);
          float B = dot(offset, ray.yz);
          float C = dot(offset, offset) - handle.w * handle.w;
          float discriminant = B * B - A * C;
          if (A > .0001 && discriminant >= 0.) {
            float root = sqrt(discriminant);
            for (int side = 0; side < 2; ++side) {
              float time = (-B + (side == 0 ? -root : root)) / A;
              float x = origin.x + time * ray.x;
              if (time > EPSILON && time < closest && x >= handle.x && x <= handle.y) {
                closest = time;
                normal = vec3(0., normalize(offset + time * ray.yz));
              }
            }
          }
          if (abs(ray.x) > .0001) {
            for (int end = 0; end < 2; ++end) {
              float time = ((end == 0 ? handle.x : handle.y) - origin.x) / ray.x;
              vec2 atEnd = offset + time * ray.yz;
              if (time > EPSILON && time < closest && dot(atEnd, atEnd) <= handle.w * handle.w) {
                closest = time;
                normal = vec3(end == 0 ? -1. : 1., 0., 0.);
              }
            }
          }
          return closest;
        }

        float floorRim(vec3 point) {
          float distance = length(vec2(length(point.xz), point.y) - floorJoin);
          return 1. - smoothstep(.003, .016, distance);
        }
      #endif

      void main() {
        vec3 normal = normalize(outward);
        vec3 incoming = normalize(surface - observer);
        float reflection = fresnel(incoming, normal);
        vec3 color = reflection * lightField(reflect(incoming, normal));
        float transmitted = 1. - reflection;
        vec3 ray = refract(incoming, normal, 1. / IOR);
        vec3 point = surface + ray * (EPSILON * 2.);
        bool insideGlass = true;
        #ifdef HAS_HANDLE
          float visibleFloorRim = floorRim(surface);
        #endif

        for (int boundary = 0; boundary < 7; ++boundary) {
          vec3 outwardNormal;
          float distance = nextSurface(point, ray, outwardNormal);
          #ifdef HAS_HANDLE
            vec3 woodNormal;
            float woodDistance = handleSurface(point, ray, woodNormal);
            if (woodDistance < distance) {
              float light = .70 + .36 * max(dot(woodNormal, normalize(vec3(-1., 1., 1.))), 0.);
              color += transmitted * vec3(.114, .058, .038) * light;
              transmitted = 0.;
              break;
            }
          #endif
          if (distance >= NO_HIT) break;
          point += distance * ray;
          #ifdef HAS_HANDLE
            visibleFloorRim = max(visibleFloorRim, transmitted * floorRim(point));
          #endif
          if (insideGlass) transmitted *= exp(-.041 * distance);
          bool exiting = dot(ray, outwardNormal) > 0.;
          vec3 facing = exiting ? -outwardNormal : outwardNormal;
          vec3 refracted = refract(ray, facing, exiting ? IOR : 1. / IOR);
          if (dot(refracted, refracted) < .0001) {
            ray = reflect(ray, facing);
          } else {
            float returned = fresnel(ray, facing);
            color += transmitted * returned * lightField(reflect(ray, facing));
            transmitted *= 1. - returned;
            ray = refracted;
            insideGlass = !exiting;
          }
          point += ray * (EPSILON * 2.);
        }
        color += transmitted * lightField(ray);
        float elevation = (surface.y - heightRange.x) / (heightRange.y - heightRange.x);
        float rim = smoothstep(.963, .989, elevation);
        float thickFoot = 1. - smoothstep(.032, .093, elevation);
        float outline = pow(1. - clamp(-dot(incoming, normal), 0., 1.), 2.15);
        vec3 reflectionRay = reflect(incoming, normal);
        float reflectionX = normalize(mat3(modelViewMatrix) * reflectionRay).x;
        float tubeHighlight = smoothstep(.36, .61, reflectionX)
          * (1. - smoothstep(.70, .81, reflectionX));
        vec3 reflected = lightField(reflectionRay);
        float glassEdge = max(rim, thickFoot);
        vec3 roundedEdge = mix(lightField(incoming), reflected, .35);
        color = mix(color, roundedEdge, .54 * glassEdge);
        float reflectionStrength = .22 * outline + .26 * rim + .18 * thickFoot;
        color = mix(color, reflected, reflectionStrength);
        color -= vec3(.15, .14, .12) * (rim + .74 * thickFoot + .82 * outline);
        color += vec3(.09, .10, .11) * tubeHighlight * (1. - .7 * outline);
        #ifdef HAS_HANDLE
          color = mix(color, color * vec3(.71, .74, .76), .44 * visibleFloorRim);
        #endif
        gl_FragColor = vec4(color, 1.);
        #include <colorspace_fragment>
      }
    `,
  });
}
