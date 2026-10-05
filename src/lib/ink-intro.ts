// Fluid-ink greeting: each word is poured into a WebGL fluid simulation,
// held, faded, and replaced; the final word stays and heals after being stirred.

type GL = WebGLRenderingContext | WebGL2RenderingContext;
type RGB = [number, number, number];

export interface InkLine {
  t: string; // text
  s: number; // size relative to the first line
  w: number; // font weight
}

export interface InkWord {
  lines: InkLine[];
  color: RGB;
}

export interface InkIntroOptions {
  words: InkWord[];
  fontFamily: string;
  background: RGB;
  reducedMotion?: boolean;
  onFinalShown?: () => void;
}

export interface InkIntroHandle {
  replay: () => void;
  destroy: () => void;
}

interface FBO {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  attach: (id: number) => number;
}

interface DoubleFBO {
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  read: FBO;
  write: FBO;
  swap: () => void;
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const POUR = 0.3;
const POUR_LAST = 0.5;
const HOLD = 0.55;
const FADE = 0.22;
const INK_AMOUNT = 0.85;
const HEAL_RATE = 4;

const BASE_VS = `
precision highp float;
attribute vec2 aPosition;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const COPY_FS = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
uniform sampler2D uTexture;
void main () { gl_FragColor = texture2D(uTexture, vUv); }`;

const CLEAR_FS = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
uniform sampler2D uTexture;
uniform float value;
void main () { gl_FragColor = value * texture2D(uTexture, vUv); }`;

const SPLAT_FS = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main () {
  vec2 p = vUv - point.xy;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture2D(uTarget, vUv).xyz;
  gl_FragColor = vec4(base + splat, 1.0);
}`;

// Adds the text mask to the dye in a single ink colour.
const TEXT_FS = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform sampler2D uMask;
uniform vec3 inkColor;
uniform float amount;
void main () {
  float m = texture2D(uMask, vUv).r;
  vec3 base = texture2D(uTarget, vUv).xyz;
  gl_FragColor = vec4(base + inkColor * m * amount, 1.0);
}`;

// Pulls the dye back toward the text shape, so a stirred line heals itself.
const RESTORE_FS = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform sampler2D uMask;
uniform vec3 inkColor;
uniform float amount;
uniform float k;
void main () {
  float m = texture2D(uMask, vUv).r;
  vec3 base = texture2D(uTarget, vUv).xyz;
  gl_FragColor = vec4(mix(base, inkColor * m * amount, k), 1.0);
}`;

const ADVECTION_FS = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform vec2 dyeTexelSize;
uniform float dt;
uniform float dissipation;
vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
  vec2 st = uv / tsize - 0.5;
  vec2 iuv = floor(st);
  vec2 fuv = fract(st);
  vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
  vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
  vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
  vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
}
void main () {
#ifdef MANUAL_FILTERING
  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
  vec4 result = bilerp(uSource, coord, dyeTexelSize);
#else
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
  vec4 result = texture2D(uSource, coord);
#endif
  float decay = 1.0 + dissipation * dt;
  gl_FragColor = result / decay;
}`;

const DIVERGENCE_FS = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}`;

const CURL_FS = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).y;
  float R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x;
  float B = texture2D(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}`;

const VORTICITY_FS = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main () {
  float L = texture2D(uCurl, vL).x;
  float R = texture2D(uCurl, vR).x;
  float T = texture2D(uCurl, vT).x;
  float B = texture2D(uCurl, vB).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity += force * dt;
  velocity = min(max(velocity, -1000.0), 1000.0);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}`;

const PRESSURE_FS = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  float divergence = texture2D(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}`;

const GRADIENT_FS = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}`;

// Soft shading so the ink has a little body, composited over the background.
const DISPLAY_FS = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uTexture;
uniform vec2 texelSize;
uniform vec3 bgColor;
void main () {
  vec3 c = texture2D(uTexture, vUv).rgb;
  vec3 lc = texture2D(uTexture, vL).rgb;
  vec3 rc = texture2D(uTexture, vR).rgb;
  vec3 tc = texture2D(uTexture, vT).rgb;
  vec3 bc = texture2D(uTexture, vB).rgb;
  float dx = length(rc) - length(lc);
  float dy = length(tc) - length(bc);
  vec3 n = normalize(vec3(dx, dy, length(texelSize)));
  float diffuse = clamp(dot(n, vec3(0.0, 0.0, 1.0)) + 0.8, 0.8, 1.0);
  c *= diffuse;
  float a = clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0);
  gl_FragColor = vec4(bgColor * (1.0 - a) + c, 1.0);
}`;

function supportsRender(
  gl: GL,
  internal: number,
  format: number,
  type: number
) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, 4, 4, 0, format, type, null);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    tex,
    0
  );
  const ok =
    gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  gl.deleteTexture(tex);
  return ok;
}

function getWebGL(canvas: HTMLCanvasElement) {
  const params: WebGLContextAttributes = {
    alpha: false,
    depth: false,
    stencil: false,
    antialias: false,
    preserveDrawingBuffer: false,
  };
  const gl2 = canvas.getContext('webgl2', params);
  if (gl2) {
    gl2.getExtension('EXT_color_buffer_float');
    gl2.getExtension('EXT_color_buffer_half_float');
    if (!supportsRender(gl2, gl2.RGBA16F, gl2.RGBA, gl2.HALF_FLOAT))
      return null;
    return {
      gl: gl2 as GL,
      internal: gl2.RGBA16F,
      format: gl2.RGBA,
      type: gl2.HALF_FLOAT,
      linear: true,
    };
  }
  const gl1 = (canvas.getContext('webgl', params) ||
    canvas.getContext(
      'experimental-webgl',
      params
    )) as WebGLRenderingContext | null;
  if (!gl1) return null;
  const hf = gl1.getExtension('OES_texture_half_float');
  if (!hf) return null;
  gl1.getExtension('EXT_color_buffer_half_float');
  if (!supportsRender(gl1, gl1.RGBA, gl1.RGBA, hf.HALF_FLOAT_OES)) return null;
  return {
    gl: gl1 as GL,
    internal: gl1.RGBA,
    format: gl1.RGBA,
    type: hf.HALF_FLOAT_OES,
    linear: !!gl1.getExtension('OES_texture_half_float_linear'),
  };
}

/** Starts the ink intro on a canvas. Returns null when WebGL half-float isn't available. */
export function startInkIntro(
  canvas: HTMLCanvasElement,
  opts: InkIntroOptions
): InkIntroHandle | null {
  const ctx = getWebGL(canvas);
  if (!ctx) return null;
  const { gl } = ctx;
  const reduced = !!opts.reducedMotion;
  const words = opts.words;
  const BG = opts.background;

  const config = {
    SIM_RES: 128,
    DYE_RES: ctx.linear ? 1024 : 512,
    DENSITY: 0.05,
    VELOCITY: 1.2,
    PRESSURE: 0.8,
    PRESSURE_ITER: 20,
    CURL: 12,
    FORCE: 3500,
  };

  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

  function resizeCanvas() {
    const w = Math.floor(canvas.clientWidth * dpr());
    const h = Math.floor(canvas.clientHeight * dpr());
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      return true;
    }
    return false;
  }
  resizeCanvas();

  // ---------- Programs ----------
  function compile(type: number, src: string, defines?: string[]) {
    const source = (defines ?? []).map((d) => `#define ${d}\n`).join('') + src;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      console.error(gl.getShaderInfoLog(s));
    return s;
  }

  class Program {
    program: WebGLProgram;
    uniforms: Record<string, WebGLUniformLocation | null> = {};
    constructor(vs: WebGLShader, fs: WebGLShader) {
      const p = gl.createProgram()!;
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.bindAttribLocation(p, 0, 'aPosition');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS))
        console.error(gl.getProgramInfoLog(p));
      this.program = p;
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
      for (let i = 0; i < n; i++) {
        const name = gl.getActiveUniform(p, i)!.name;
        this.uniforms[name] = gl.getUniformLocation(p, name);
      }
    }
    bind() {
      gl.useProgram(this.program);
    }
    u(name: string) {
      return this.uniforms[name] ?? null;
    }
  }

  const baseVS = compile(gl.VERTEX_SHADER, BASE_VS);
  const fs = (src: string, defines?: string[]) =>
    new Program(baseVS, compile(gl.FRAGMENT_SHADER, src, defines));

  const copyProgram = fs(COPY_FS);
  const clearProgram = fs(CLEAR_FS);
  const splatProgram = fs(SPLAT_FS);
  const textProgram = fs(TEXT_FS);
  const restoreProgram = fs(RESTORE_FS);
  const advectionProgram = fs(
    ADVECTION_FS,
    ctx.linear ? undefined : ['MANUAL_FILTERING']
  );
  const divergenceProgram = fs(DIVERGENCE_FS);
  const curlProgram = fs(CURL_FS);
  const vorticityProgram = fs(VORTICITY_FS);
  const pressureProgram = fs(PRESSURE_FS);
  const gradientProgram = fs(GRADIENT_FS);
  const displayProgram = fs(DISPLAY_FS);

  // ---------- Geometry ----------
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]),
    gl.STATIC_DRAW
  );
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array([0, 1, 2, 0, 2, 3]),
    gl.STATIC_DRAW
  );
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  function blit(target: FBO | null) {
    if (target == null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  // ---------- Framebuffers ----------
  function createFBO(w: number, h: number, param: number): FBO {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      ctx!.internal,
      w,
      h,
      0,
      ctx!.format,
      ctx!.type,
      null
    );
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    );
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      texture,
      fbo,
      width: w,
      height: h,
      texelSizeX: 1 / w,
      texelSizeY: 1 / h,
      attach(id: number) {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return id;
      },
    };
  }

  function createDoubleFBO(w: number, h: number, param: number): DoubleFBO {
    return {
      width: w,
      height: h,
      texelSizeX: 1 / w,
      texelSizeY: 1 / h,
      read: createFBO(w, h, param),
      write: createFBO(w, h, param),
      swap() {
        const t = this.read;
        this.read = this.write;
        this.write = t;
      },
    };
  }

  function resizeDoubleFBO(
    target: DoubleFBO,
    w: number,
    h: number,
    param: number
  ) {
    if (target.width === w && target.height === h) return target;
    const next = createFBO(w, h, param);
    copyProgram.bind();
    gl.uniform1i(copyProgram.u('uTexture'), target.read.attach(0));
    blit(next);
    target.read = next;
    target.write = createFBO(w, h, param);
    target.width = w;
    target.height = h;
    target.texelSizeX = 1 / w;
    target.texelSizeY = 1 / h;
    return target;
  }

  function getResolution(res: number) {
    let a = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (a < 1) a = 1 / a;
    const min = Math.round(res);
    const max = Math.round(res * a);
    return gl.drawingBufferWidth > gl.drawingBufferHeight
      ? { width: max, height: min }
      : { width: min, height: max };
  }

  let dye: DoubleFBO | null = null;
  let velocity: DoubleFBO | null = null;
  let divergence!: FBO;
  let curl!: FBO;
  let pressure!: DoubleFBO;

  function initFramebuffers() {
    const sim = getResolution(config.SIM_RES);
    const dr = getResolution(config.DYE_RES);
    const filt = ctx!.linear ? gl.LINEAR : gl.NEAREST;
    gl.disable(gl.BLEND);
    dye = dye
      ? resizeDoubleFBO(dye, dr.width, dr.height, filt)
      : createDoubleFBO(dr.width, dr.height, filt);
    velocity = velocity
      ? resizeDoubleFBO(velocity, sim.width, sim.height, filt)
      : createDoubleFBO(sim.width, sim.height, filt);
    divergence = createFBO(sim.width, sim.height, gl.NEAREST);
    curl = createFBO(sim.width, sim.height, gl.NEAREST);
    pressure = createDoubleFBO(sim.width, sim.height, gl.NEAREST);
  }
  initFramebuffers();
  const D = () => dye!;
  const V = () => velocity!;

  // ---------- Simulation step ----------
  function step(dt: number) {
    const vel = V();
    gl.disable(gl.BLEND);

    curlProgram.bind();
    gl.uniform2f(curlProgram.u('texelSize'), vel.texelSizeX, vel.texelSizeY);
    gl.uniform1i(curlProgram.u('uVelocity'), vel.read.attach(0));
    blit(curl);

    vorticityProgram.bind();
    gl.uniform2f(
      vorticityProgram.u('texelSize'),
      vel.texelSizeX,
      vel.texelSizeY
    );
    gl.uniform1i(vorticityProgram.u('uVelocity'), vel.read.attach(0));
    gl.uniform1i(vorticityProgram.u('uCurl'), curl.attach(1));
    gl.uniform1f(vorticityProgram.u('curl'), config.CURL);
    gl.uniform1f(vorticityProgram.u('dt'), dt);
    blit(vel.write);
    vel.swap();

    divergenceProgram.bind();
    gl.uniform2f(
      divergenceProgram.u('texelSize'),
      vel.texelSizeX,
      vel.texelSizeY
    );
    gl.uniform1i(divergenceProgram.u('uVelocity'), vel.read.attach(0));
    blit(divergence);

    clearProgram.bind();
    gl.uniform1i(clearProgram.u('uTexture'), pressure.read.attach(0));
    gl.uniform1f(clearProgram.u('value'), config.PRESSURE);
    blit(pressure.write);
    pressure.swap();

    pressureProgram.bind();
    gl.uniform2f(
      pressureProgram.u('texelSize'),
      vel.texelSizeX,
      vel.texelSizeY
    );
    gl.uniform1i(pressureProgram.u('uDivergence'), divergence.attach(0));
    for (let i = 0; i < config.PRESSURE_ITER; i++) {
      gl.uniform1i(pressureProgram.u('uPressure'), pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    gradientProgram.bind();
    gl.uniform2f(
      gradientProgram.u('texelSize'),
      vel.texelSizeX,
      vel.texelSizeY
    );
    gl.uniform1i(gradientProgram.u('uPressure'), pressure.read.attach(0));
    gl.uniform1i(gradientProgram.u('uVelocity'), vel.read.attach(1));
    blit(vel.write);
    vel.swap();

    advectionProgram.bind();
    gl.uniform2f(
      advectionProgram.u('texelSize'),
      vel.texelSizeX,
      vel.texelSizeY
    );
    if (!ctx!.linear)
      gl.uniform2f(
        advectionProgram.u('dyeTexelSize'),
        vel.texelSizeX,
        vel.texelSizeY
      );
    const vid = vel.read.attach(0);
    gl.uniform1i(advectionProgram.u('uVelocity'), vid);
    gl.uniform1i(advectionProgram.u('uSource'), vid);
    gl.uniform1f(advectionProgram.u('dt'), dt);
    gl.uniform1f(advectionProgram.u('dissipation'), config.VELOCITY);
    blit(vel.write);
    vel.swap();

    const d = D();
    if (!ctx!.linear)
      gl.uniform2f(
        advectionProgram.u('dyeTexelSize'),
        d.texelSizeX,
        d.texelSizeY
      );
    gl.uniform1i(advectionProgram.u('uVelocity'), vel.read.attach(0));
    gl.uniform1i(advectionProgram.u('uSource'), d.read.attach(1));
    gl.uniform1f(advectionProgram.u('dissipation'), config.DENSITY);
    blit(d.write);
    d.swap();
  }

  function render() {
    gl.disable(gl.BLEND);
    displayProgram.bind();
    gl.uniform2f(
      displayProgram.u('texelSize'),
      1 / gl.drawingBufferWidth,
      1 / gl.drawingBufferHeight
    );
    gl.uniform3f(displayProgram.u('bgColor'), BG[0], BG[1], BG[2]);
    gl.uniform1i(displayProgram.u('uTexture'), D().read.attach(0));
    blit(null);
  }

  // ---------- Splats ----------
  const aspect = () => canvas.width / canvas.height;
  const correctRadius = (r: number) => (aspect() > 1 ? r * aspect() : r);
  const correctDX = (d: number) => (aspect() < 1 ? d * aspect() : d);
  const correctDY = (d: number) => (aspect() > 1 ? d / aspect() : d);

  // Velocity-only push: moves the ink without adding colour.
  function push(x: number, y: number, dx: number, dy: number, radius: number) {
    const vel = V();
    splatProgram.bind();
    gl.uniform1i(splatProgram.u('uTarget'), vel.read.attach(0));
    gl.uniform1f(splatProgram.u('aspectRatio'), aspect());
    gl.uniform2f(splatProgram.u('point'), x, y);
    gl.uniform3f(splatProgram.u('color'), dx, dy, 0);
    gl.uniform1f(splatProgram.u('radius'), correctRadius(radius / 100));
    blit(vel.write);
    vel.swap();
  }

  function clearField(f: DoubleFBO) {
    clearProgram.bind();
    gl.uniform1i(clearProgram.u('uTexture'), f.read.attach(0));
    gl.uniform1f(clearProgram.u('value'), 0);
    blit(f.write);
    f.swap();
  }

  // ---------- Text mask ----------
  const maskCanvas = document.createElement('canvas');
  const mctx = maskCanvas.getContext('2d')!;
  const maskTex = gl.createTexture();

  function drawMask(lines: InkLine[]): Box {
    const { width: w, height: h } = getResolution(config.DYE_RES);
    maskCanvas.width = w;
    maskCanvas.height = h;
    mctx.fillStyle = '#000';
    mctx.fillRect(0, 0, w, h);

    const font = (l: InkLine, base: number) =>
      `${l.w} ${base * l.s}px ${opts.fontFamily}`;
    let base = Math.min(h * 0.3, w * 0.2);
    let widest = 0;
    for (const l of lines) {
      mctx.font = font(l, base);
      widest = Math.max(widest, mctx.measureText(l.t).width);
    }
    if (widest > w * 0.84) base *= (w * 0.84) / widest;

    const heights = lines.map((l) => base * l.s * 1.18);
    const total = heights.reduce((a, b) => a + b, 0);
    let y = h * 0.48 - total / 2;
    let maxW = 0;

    mctx.fillStyle = '#fff';
    mctx.textAlign = 'center';
    mctx.textBaseline = 'middle';
    lines.forEach((l, i) => {
      mctx.font = font(l, base);
      maxW = Math.max(maxW, mctx.measureText(l.t).width);
      mctx.fillText(l.t, w / 2, y + heights[i] / 2);
      y += heights[i];
    });

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      maskCanvas
    );
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    // Text bounds in texture space (y up), used for the pour wobble.
    const tw = maxW / w;
    const th = total / h;
    return {
      x0: 0.5 - tw / 2,
      x1: 0.5 + tw / 2,
      y0: 0.52 - th / 2,
      y1: 0.52 + th / 2,
    };
  }

  function bindMask(program: Program, color: RGB) {
    gl.uniform1i(program.u('uTarget'), D().read.attach(0));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.uniform1i(program.u('uMask'), 1);
    gl.uniform3f(program.u('inkColor'), color[0], color[1], color[2]);
  }

  function injectInk(color: RGB, amount: number) {
    textProgram.bind();
    bindMask(textProgram, color);
    gl.uniform1f(textProgram.u('amount'), amount);
    blit(D().write);
    D().swap();
  }

  function restoreInk(color: RGB, dt: number) {
    restoreProgram.bind();
    bindMask(restoreProgram, color);
    gl.uniform1f(restoreProgram.u('amount'), INK_AMOUNT);
    gl.uniform1f(restoreProgram.u('k'), 1 - Math.exp(-HEAL_RATE * dt));
    blit(D().write);
    D().swap();
  }

  // ---------- Sequence: pour -> hold -> fade -> next; the last word stays ----------
  const seq = {
    index: -1,
    phase: 'idle' as 'idle' | 'pour' | 'hold' | 'fade',
    t: 0,
    box: null as Box | null,
    restart: false,
    finalShown: false,
  };

  function startWord(i: number) {
    seq.index = i;
    seq.phase = 'pour';
    seq.t = 0;
    seq.box = drawMask(words[i].lines);
    // Greetings lose a little ink while held; the final line never fades.
    config.DENSITY = i === words.length - 1 ? 0 : 0.05;
    clearField(V());
  }

  function tickSequence(dt: number) {
    if (seq.phase === 'idle' || !seq.box) return;
    const item = words[seq.index];
    const isLast = seq.index === words.length - 1;
    seq.t += dt;

    if (seq.phase === 'pour') {
      const pourTime = isLast ? POUR_LAST : POUR;
      injectInk(item.color, (INK_AMOUNT * dt) / pourTime);
      // Greetings wobble as they pour; the final line just fades in.
      if (!reduced && !isLast) {
        const b = seq.box;
        push(
          b.x0 + Math.random() * (b.x1 - b.x0),
          b.y0 + Math.random() * (b.y1 - b.y0),
          (Math.random() - 0.5) * 70,
          (Math.random() - 0.5) * 70,
          0.08
        );
      }
      if (seq.t >= pourTime) {
        seq.phase = 'hold';
        seq.t = 0;
      }
    } else if (seq.phase === 'hold') {
      if (isLast) {
        restoreInk(item.color, dt);
        if (!seq.finalShown) {
          seq.finalShown = true;
          opts.onFinalShown?.();
        }
        return;
      }
      if (seq.t >= HOLD) {
        seq.phase = 'fade';
        seq.t = 0;
      }
    } else if (seq.phase === 'fade') {
      // Quick, still fade: the word dims out in place.
      config.DENSITY = 14;
      if (seq.t >= FADE) {
        clearField(D());
        if (seq.restart) {
          seq.restart = false;
          startWord(0);
        } else {
          startWord(Math.min(seq.index + 1, words.length - 1));
        }
      }
    }
  }

  // ---------- Pointer: stirs only while over the canvas ----------
  const pointer = { x: 0.5, y: 0.5, dx: 0, dy: 0, moved: false, inside: false };

  const onPointerMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = 1 - (e.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      pointer.inside = false;
      return;
    }
    if (!pointer.inside) {
      pointer.x = x;
      pointer.y = y;
      pointer.inside = true;
      return;
    }
    pointer.dx += correctDX(x - pointer.x);
    pointer.dy += correctDY(y - pointer.y);
    pointer.x = x;
    pointer.y = y;
    pointer.moved = true;
  };
  const onPointerEnd = () => {
    pointer.inside = false;
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerEnd);
  window.addEventListener('pointercancel', onPointerEnd);

  // ---------- Loop (paused while the hero is off screen) ----------
  let raf = 0;
  let running = false;
  let last = performance.now();

  function frame() {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.016666);
    last = now;
    if (resizeCanvas()) initFramebuffers();
    tickSequence(dt);
    if (pointer.moved) {
      pointer.moved = false;
      push(
        pointer.x,
        pointer.y,
        pointer.dx * config.FORCE,
        pointer.dy * config.FORCE,
        0.18
      );
      pointer.dx = 0;
      pointer.dy = 0;
    }
    step(dt);
    render();
    raf = requestAnimationFrame(frame);
  }

  function setRunning(on: boolean) {
    if (on === running) return;
    running = on;
    if (on) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else {
      cancelAnimationFrame(raf);
    }
  }

  const observer = new IntersectionObserver(([entry]) =>
    setRunning(entry.isIntersecting)
  );
  observer.observe(canvas);

  // Start once the font is ready (the Vietnamese accents need it), or after a short wait.
  let destroyed = false;
  let started = false;
  const begin = () => {
    if (started || destroyed) return;
    started = true;
    startWord(0);
  };
  const fontTimer = window.setTimeout(begin, 1500);
  Promise.all(
    [...new Set(words.flatMap((w) => w.lines.map((l) => l.w)))].map((weight) =>
      document.fonts.load(`${weight} 100px ${opts.fontFamily}`, 'Xin chào')
    )
  ).then(begin, begin);

  return {
    replay() {
      if (!seq.box || seq.phase === 'fade') return;
      seq.phase = 'fade';
      seq.t = 0;
      seq.restart = true;
      seq.finalShown = false;
    },
    destroy() {
      destroyed = true;
      window.clearTimeout(fontTimer);
      setRunning(false);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
    },
  };
}
