import { Effect, Mesh, MeshBuilder, ShaderMaterial, Vector2, Vector3, type Camera, type Scene } from "@babylonjs/core";
import { WindField } from "../sailing/Wind";
import { packWaves, type Wave } from "./Waves";

/**
 * GPU ocean: Gerstner waves displaced in the vertex shader, Fresnel sky reflection, sun glitter,
 * wind ripples and darker "puff" patches in the fragment shader. The CPU does no per-vertex work.
 * The grid follows the camera (snapped to the grid step so the surface doesn't swim).
 */
const MAX_PUFFS = 8;

Effect.ShadersStore["oceanVertexShader"] = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float time;
uniform vec3 camPos;
uniform vec4 waveA[4];
uniform vec4 waveB[4];
varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;

void main(void) {
  vec4 wp = world * vec4(position, 1.0);
  vec3 p = wp.xyz;
  vec2 xz = p.xz;
  // Fade wave height with distance so far-away triangles don't alias.
  float fade = 1.0 - smoothstep(120.0, 320.0, distance(camPos.xz, xz));
  vec3 n = vec3(0.0, 1.0, 0.0);
  float crest = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 d = waveA[i].xy;
    float k = waveA[i].z;
    float a = waveA[i].w * fade;
    float w = waveB[i].x;
    float q = waveB[i].y;
    float ph = k * dot(d, xz) - w * time;
    float s = sin(ph), c = cos(ph);
    p.x += q * a * d.x * c;
    p.z += q * a * d.y * c;
    p.y += a * s;
    n.x -= d.x * k * a * c;
    n.z -= d.y * k * a * c;
    n.y -= q * k * a * s;
    crest += a * s;
  }
  vWorld = p;
  vNormal = normalize(n);
  vCrest = crest;
  gl_Position = viewProjection * vec4(p, 1.0);
}
`;

Effect.ShadersStore["oceanFragmentShader"] = /* glsl */ `
precision highp float;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
uniform vec3 camPos;
uniform vec3 sunDir;
uniform float time;
uniform vec2 windVel;
uniform float windStrength;
uniform vec4 puffs[${MAX_PUFFS}];
uniform vec3 deepColor;
uniform vec3 shallowColor;
uniform vec3 skyZenith;
uniform vec3 skyHorizon;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main(void) {
  vec3 V = camPos - vWorld;
  float dist = length(V);
  V /= dist;

  // Wind on the water: how much puff is over this spot.
  float puff = 0.0;
  for (int i = 0; i < ${MAX_PUFFS}; i++) {
    vec2 d = (vWorld.xz - puffs[i].xy) / max(puffs[i].z, 1.0);
    puff += exp(-dot(d, d) * 1.6) * puffs[i].w;
  }
  puff = clamp(puff, 0.0, 1.0);

  // Small ripples (cat's paws) that scroll downwind; stronger inside puffs.
  vec2 uv = vWorld.xz * 0.9 - windVel * time * 0.35;
  float r1 = noise(uv) - 0.5;
  float r2 = noise(uv * 2.3 + 17.0) - 0.5;
  float detail = (0.12 + 0.3 * windStrength + 0.75 * puff) * (1.0 - smoothstep(20.0, 90.0, dist));
  vec3 N = normalize(vNormal + vec3(r1, 0.0, r2) * detail * 0.3);

  float ndv = max(dot(N, V), 0.0);
  float fresnel = min(0.02 + 0.98 * pow(1.0 - ndv, 5.0), 0.78);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(skyHorizon, skyZenith, pow(clamp(R.y, 0.0, 1.0), 0.45));

  vec3 water = mix(deepColor, shallowColor, clamp(vCrest * 1.8 + 0.35, 0.0, 1.0));
  // Puffs read as darker, rougher water — exactly what sailors look for upwind.
  water *= 1.0 - 0.42 * puff;
  vec3 col = mix(water, sky * (1.0 - 0.38 * puff), fresnel);

  float spec = pow(max(dot(R, sunDir), 0.0), 220.0);
  col += vec3(1.0, 0.95, 0.85) * spec * (1.2 - puff * 0.6);
  // Foam hint on the steepest crests.
  col += vec3(0.85) * smoothstep(0.2, 0.3, vCrest) * 0.18;

  // Atmospheric haze toward the horizon.
  float haze = 1.0 - exp(-dist * 0.0038);
  col = mix(col, skyHorizon, clamp(haze, 0.0, 0.92));
  gl_FragColor = vec4(col, 1.0);
}
`;

Effect.ShadersStore["skyVertexShader"] = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;
void main(void) {
  vDir = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

Effect.ShadersStore["skyFragmentShader"] = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 sunDir;
uniform vec3 skyZenith;
uniform vec3 skyHorizon;
void main(void) {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(skyHorizon, skyZenith, pow(max(h, 0.0), 0.5));
  float s = max(dot(d, sunDir), 0.0);
  col += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.18);
  // Soft cloud band near the horizon.
  float band = exp(-pow((h - 0.06) * 14.0, 2.0)) * 0.12;
  col = mix(col, vec3(1.0), band);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Ocean {
  mesh: Mesh;
  material: ShaderMaterial;
  sky: Mesh;
  private skyMat: ShaderMaterial;
  private step: number;
  private puffData: number[] = new Array(MAX_PUFFS * 4).fill(0);
  private windVel = new Vector2(0, 0);
  readonly sunDir = new Vector3(-0.45, 0.42, 0.78).normalize();

  constructor(scene: Scene, waves: Wave[]) {
    const size = 700, sub = 230;
    this.step = size / sub;
    this.mesh = MeshBuilder.CreateGround("ocean", { width: size, height: size, subdivisions: sub }, scene);
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true; // vertices move in the shader; skip CPU culling

    const zenith = new Vector3(0.22, 0.45, 0.72), horizon = new Vector3(0.72, 0.83, 0.9);

    this.material = new ShaderMaterial("oceanMat", scene, { vertex: "ocean", fragment: "ocean" }, {
      attributes: ["position"],
      uniforms: ["world", "viewProjection", "time", "camPos", "waveA", "waveB", "sunDir", "windVel", "windStrength",
        "puffs", "deepColor", "shallowColor", "skyZenith", "skyHorizon"],
    });
    const packed = packWaves(waves);
    this.material.setArray4("waveA", packed.a);
    this.material.setArray4("waveB", packed.b);
    this.material.setVector3("sunDir", this.sunDir);
    this.material.setVector3("deepColor", new Vector3(0.02, 0.17, 0.25));
    this.material.setVector3("shallowColor", new Vector3(0.06, 0.32, 0.4));
    this.material.setVector3("skyZenith", zenith);
    this.material.setVector3("skyHorizon", horizon);
    this.material.setArray4("puffs", this.puffData);
    this.material.backFaceCulling = false;
    this.mesh.material = this.material;

    this.sky = MeshBuilder.CreateSphere("sky", { diameter: 1600, segments: 24, sideOrientation: Mesh.BACKSIDE }, scene);
    this.sky.infiniteDistance = true;
    this.sky.isPickable = false;
    this.skyMat = new ShaderMaterial("skyMat", scene, { vertex: "sky", fragment: "sky" }, {
      attributes: ["position"],
      uniforms: ["worldViewProjection", "sunDir", "skyZenith", "skyHorizon"],
    });
    this.skyMat.setVector3("sunDir", this.sunDir);
    this.skyMat.setVector3("skyZenith", zenith);
    this.skyMat.setVector3("skyHorizon", horizon);
    this.skyMat.backFaceCulling = false;
    this.skyMat.disableDepthWrite = true;
    this.sky.material = this.skyMat;
  }

  setWaves(waves: Wave[]) {
    const packed = packWaves(waves);
    this.material.setArray4("waveA", packed.a);
    this.material.setArray4("waveB", packed.b);
  }

  update(time: number, camera: Camera, wind: WindField) {
    const cp = camera.globalPosition;
    // Follow the camera target area, snapped to the grid.
    const s = this.step;
    this.mesh.position.x = Math.round(cp.x / s) * s;
    this.mesh.position.z = Math.round(cp.z / s) * s;
    this.material.setFloat("time", time);
    this.material.setVector3("camPos", cp);
    const dir = wind.meanDir + wind.shift();
    this.windVel.set(-Math.sin(dir) * wind.meanSpeed, -Math.cos(dir) * wind.meanSpeed);
    this.material.setVector2("windVel", this.windVel);
    this.material.setFloat("windStrength", Math.min(1, wind.meanSpeed / 8));
    for (let i = 0; i < MAX_PUFFS; i++) {
      const p = wind.puffs[i];
      const o = i * 4;
      if (p) {
        this.puffData[o] = p.x;
        this.puffData[o + 1] = p.z;
        this.puffData[o + 2] = p.radius;
        this.puffData[o + 3] = WindField.puffFade(p) * Math.min(1, p.strength / 2.2);
      } else {
        this.puffData[o + 3] = 0;
      }
    }
    this.material.setArray4("puffs", this.puffData);
  }
}
