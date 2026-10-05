// Blink Buddy: the 3D avatar from Meshy, brought to life with Three.js.
// It follows the cursor, blinks, gets booped and honked, gets dizzy when the mouse is shaken,
// naps when left alone, calls you back when the cursor leaves, gets grumpy when poked too much,
// and talks (the mouth moves with the words, optionally with the browser's voice).
// The model is one solid mesh with painted-on eyes and mouth, so every expression is a pose
// ("morph target") built here from the face's own points.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {
  GLTFLoader,
  type GLTF,
} from 'three/examples/jsm/loaders/GLTFLoader.js';

/* ======================= MODEL: set up for your file ======================= */
export const MODEL = {
  url: '/avatar.glb',
  turnY: 0, // radians to spin the model if it doesn't face the camera (Math.PI = turn around)
  height: 1.9, // how tall the head is drawn (scene units)
  // Where the painted-on features sit, as fractions of the model size
  // (x: -1 left edge .. 1 right edge, y: -1 bottom .. 1 top, measured from the middle).
  eyes: [
    { x: -0.365, y: -0.205 },
    { x: 0.375, y: -0.205 },
  ],
  eyeSize: { x: 0.19, y: 0.075 }, // half width / half height of each painted eye
  mouth: { x: 0, y: -0.66, width: 0.23 }, // width = distance from the middle to each corner
  nose: { x: 0, y: -0.47, radius: 0.13 }, // clicks near here count as a honk
  brows: [
    { x: -0.37, y: 0.025 },
    { x: 0.36, y: 0.025 },
  ],
  browSize: { x: 0.17, y: 0.05 }, // half width / half height of each eyebrow
};

/* ======================= BEHAVIOR: tweak me ======================= */
export const CONFIG = {
  followSpeed: 8,
  followRange: 320, // px from the face where the look reaches full strength
  headTurn: 0.55,
  headTilt: 0.32,
  blinkEvery: [2200, 5200] as const, // ms between blinks (random in this range)
  doubleBlinkChance: 0.2,
  sleepAfter: 8000,
  shakeReversals: 6, // left/right direction changes needed to get dizzy...
  shakeWindow: 900, // ...within this many ms
  dizzyFor: 2600,
  grumpyAfter: 5, // boops/honks needed to make it grumpy...
  grumpyWindow: 3500, // ...within this many ms
  grumpyFor: 3000, // ms it stays grumpy (more pokes start the timer again)
  talkRate: 13, // characters per second when talking
  mouthOpen: 1, // how wide the mouth opens when talking (0.5 = small, 1.5 = big)
  lonelyBubbleAfter: 1400,
  lines: {
    boop: ['boop!', 'hehe', 'again!', 'hey!'],
    honk: ['honk!', 'HONK'],
    wake: 'huh?!',
    lonely: 'hey, come back!',
    back: 'yay!',
  },
};
/* =========================================================================== */

export interface BlinkBuddyElements {
  container: HTMLElement; // positions the bubble, Z's and pop-up text
  canvas: HTMLCanvasElement;
  bubble: HTMLElement; // speech bubble (hidden/shown by toggling data-show)
  zzz: HTMLElement; // "z z Z" shown while napping
}

export interface BlinkBuddyHandle {
  say: (text: string, voice?: boolean) => void;
  /** Stop talking right away: the line, the bubble and any spoken voice. */
  stop: () => void;
  /** Get angry for a few seconds: grumpy face and a quick "no" head shake. */
  angry: () => void;
  destroy: () => void;
}

type Mood =
  | 'idle'
  | 'boop'
  | 'honk'
  | 'dizzy'
  | 'sleep'
  | 'surprised'
  | 'lonely'
  | 'grumpy';

interface Spring {
  s: number;
  v: number;
}

interface MouthKey {
  t: number;
  v: number;
}

interface Talk {
  text: string;
  typed: boolean; // spoken lines type into the bubble; reaction words show at once
  start: number;
  chars: string[];
  keys: MouthKey[];
  duration: number;
}

interface MouthInside {
  mesh: THREE.Mesh;
  base: THREE.Vector3; // the line between the lips
  down: THREE.Vector3; // "down" along the face
  w: number;
  h: number;
}

// Poses built from the face's own points. Order matches the morph attribute list below.
//   blinkL / blinkR: each painted eye is squashed onto a line, so the lashes read as a closed eye
//   smile:     the mouth corners and cheeks lift (unused: the model already smiles)
//   brows:     inner eyebrow ends tip down (grumpy); negative tips them up (dazed)
//   mouthDown: the mouth corners drop
//   jaw:       everything below the lips drops, opening the mouth (talking)
const MORPH = {
  blinkL: 0,
  blinkR: 1,
  smile: 2,
  brows: 3,
  mouthDown: 4,
  jaw: 5,
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(arr: readonly T[]) =>
  arr[Math.floor(Math.random() * arr.length)];
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Starts the avatar. Returns null when WebGL isn't available. */
export function startBlinkBuddy(
  el: BlinkBuddyElements,
  callbacks: { onReady?: () => void; onError?: (err: unknown) => void } = {}
): BlinkBuddyHandle | null {
  const { container, canvas, bubble, zzz } = el;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- renderer, camera, lights ---------- */
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
  } catch (err) {
    callbacks.onError?.(err);
    return null;
  }
  // Render at twice the screen resolution (capped at 3x) and let the browser scale it down.
  // The canvas is small, so this is cheap, and it smooths the hair edges and the texture
  // speckles that come from turning mipmaps off (see onModel).
  renderer.setPixelRatio(Math.min((window.devicePixelRatio || 1) * 2, 3));
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps the texture colors true

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture; // soft studio reflections
  scene.environmentIntensity = 0.45; // enough for a sheen without washing out the colors
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8d7b6e, 0.7));
  const key = new THREE.DirectionalLight(0xfff1e6, 1.6);
  key.position.set(2.5, 3.2, 4.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc4d6ff, 0.8);
  rim.position.set(-3, 2.5, -3.5);
  scene.add(rim);

  /* ---------- rig: pivot at the neck, squash group, then the model ---------- */
  const headPivot = new THREE.Group();
  headPivot.position.set(0, -0.85, 0);
  scene.add(headPivot);
  const squash = new THREE.Group();
  headPivot.add(squash);
  const head = new THREE.Group();
  head.position.set(0, 0.85, 0);
  squash.add(head);

  // Dizzy stars.
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.05 : 0.12;
    if (i) starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starGeo = new THREE.ExtrudeGeometry(starShape, {
    depth: 0.04,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  starGeo.center();
  const starMat = new THREE.MeshStandardMaterial({
    color: '#ffc93c',
    roughness: 0.35,
    emissive: '#6b4a00',
    emissiveIntensity: 0.4,
  });
  const stars = [0, 1, 2].map(() => {
    const s = new THREE.Mesh(starGeo, starMat);
    s.visible = false;
    scene.add(s);
    return s;
  });

  /* ---------- the model ---------- */
  let model: THREE.Object3D | null = null;
  let modelSize = new THREE.Vector3(2, 2, 2);
  let destroyed = false;
  const materials: THREE.MeshStandardMaterial[] = [];
  const faceMeshes: THREE.Mesh[] = [];
  const mouthInsides: MouthInside[] = [];

  // The inside of the mouth: a dark oval with a tongue, drawn on a small canvas.
  function mouthTexture() {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 160;
    const g = cv.getContext('2d')!;
    g.filter = 'blur(3px)'; // soft edge so it blends into the lips
    g.fillStyle = '#3b0f17';
    g.beginPath();
    g.ellipse(128, 80, 116, 66, 0, 0, Math.PI * 2);
    g.fill();
    g.filter = 'blur(2px)';
    g.fillStyle = '#c95b6b';
    g.beginPath();
    g.ellipse(128, 128, 70, 34, 0, 0, Math.PI * 2);
    g.fill();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function addMouthInside(
    mesh: THREE.Mesh,
    geo: THREE.BufferGeometry,
    c: THREE.Vector3,
    h: THREE.Vector3,
    bb: THREE.Box3
  ) {
    const Mo = MODEL.mouth;
    // Find the face's surface between the lips by shooting a ray at it from the front.
    const from = new THREE.Vector3(
      c.x + Mo.x * h.x,
      c.y + (Mo.y - 0.03) * h.y,
      bb.max.z + h.z
    );
    const hit = new THREE.Raycaster(
      from,
      new THREE.Vector3(0, 0, -1)
    ).intersectObject(new THREE.Mesh(geo))[0];
    if (!hit) return;
    // Faces straight forward (the lip crease slants downward and would turn it edge-on), and is
    // drawn on top of the face, since the crease sits behind the lips. It only shows while the
    // mouth is open, and the mouth faces forward, so that's safe.
    const inside = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: mouthTexture(),
        transparent: true,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
      })
    );
    inside.position.copy(hit.point).add(new THREE.Vector3(0, 0, h.z * 0.01));
    inside.renderOrder = 2;
    inside.visible = false;
    mesh.add(inside);
    mouthInsides.push({
      mesh: inside,
      base: inside.position.clone(),
      down: new THREE.Vector3(0, -1, 0),
      w: Mo.width * 1.25 * h.x,
      h: 0.08 * h.y, // matches how far the jaw drops, so it fills the gap
    });
  }

  function buildFaceMorphs(mesh: THREE.Mesh) {
    const geo = mesh.geometry;
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const c = bb.getCenter(new THREE.Vector3());
    const h = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const pos = geo.attributes.position;
    const n = pos.count;
    const blinkL = new Float32Array(n * 3);
    const blinkR = new Float32Array(n * 3);
    const smile = new Float32Array(n * 3);
    const brows = new Float32Array(n * 3);
    const mouthDown = new Float32Array(n * 3);
    const jaw = new Float32Array(n * 3);
    const E = MODEL.eyeSize;
    const Mo = MODEL.mouth;
    const B = MODEL.browSize;

    for (let i = 0; i < n; i++) {
      const fx = (pos.getX(i) - c.x) / h.x;
      const fy = (pos.getY(i) - c.y) / h.y;
      const fz = (pos.getZ(i) - c.z) / h.z;
      if (fz < 0.2) continue; // only the front of the face moves

      // Blink: one pose per eye, so the eyes can close unevenly (dizzy).
      MODEL.eyes.forEach((e, k) => {
        const d = Math.hypot((fx - e.x) / E.x, ((fy - e.y) / E.y) * 0.8);
        const w = 1 - smooth(0.9, 1.6, d); // 1 inside the eye, fading to 0 before the brow
        if (w <= 0) return;
        const lineY = e.y - E.y * 0.25; // the closed eye sits a little below the eye's middle
        (k === 0 ? blinkL : blinkR)[i * 3 + 1] += (lineY - fy) * 0.95 * w * h.y;
      });

      for (const s of [-1, 1]) {
        const corner = Math.hypot(
          (fx - (Mo.x + s * Mo.width)) / 0.14,
          (fy - Mo.y) / 0.1
        );
        const wc = 1 - smooth(0, 1, corner);
        smile[i * 3] += s * 0.025 * wc * h.x;
        smile[i * 3 + 1] += 0.075 * wc * h.y;
        const cheek = Math.hypot(
          (fx - (Mo.x + s * 0.45)) / 0.22,
          (fy - (Mo.y + 0.3)) / 0.18
        );
        const wk = 1 - smooth(0, 1, cheek);
        smile[i * 3 + 1] += 0.025 * wk * h.y;
        smile[i * 3 + 2] += 0.02 * wk * h.z;
        mouthDown[i * 3 + 1] -= 0.06 * wc * h.y; // corners drop: the smile becomes a small frown
      }

      // Brows: each eyebrow's inner end tips down and toward the middle (a frown).
      for (const b of MODEL.brows) {
        const d = Math.hypot(
          (fx - b.x) / (B.x * 1.4),
          (fy - b.y) / (B.y * 2.2)
        );
        const w = 1 - smooth(0.6, 1.2, d);
        if (w <= 0) continue;
        const toMiddle = b.x < 0 ? 1 : -1;
        const inner = smooth(-0.8, 1, ((fx - b.x) * toMiddle) / B.x); // 0 outer end, 1 inner end
        brows[i * 3] += toMiddle * 0.025 * w * inner * h.x;
        brows[i * 3 + 1] -= 0.07 * w * inner * h.y;
      }

      // Jaw: points below the line between the lips drop; points above stay, so the lip line
      // stretches open. The line dips a little in the middle because the mouth smiles.
      const dxm = (fx - Mo.x) / Mo.width;
      const seamY = Mo.y - 0.03 * (1 - Math.min(dxm * dxm, 1));
      const below = seamY - fy;
      if (below > 0) {
        const wx = 1 - smooth(0.4, 1.3, Math.abs(dxm)); // widest in the middle, closed at the corners
        const wy = 1 - smooth(0.03, 0.5, below); // fades out toward the chin
        jaw[i * 3 + 1] -= 0.075 * wx * wy * h.y;
      }
    }

    geo.morphAttributes.position = [
      blinkL,
      blinkR,
      smile,
      brows,
      mouthDown,
      jaw,
    ].map((arr) => new THREE.Float32BufferAttribute(arr, 3));
    geo.morphTargetsRelative = true;
    mesh.updateMorphTargets();
    faceMeshes.push(mesh);
    addMouthInside(mesh, geo, c, h, bb);
  }

  function onModel(gltf: GLTF) {
    if (destroyed) return;
    model = gltf.scene;
    // Center it and scale it so the head is MODEL.height tall.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = MODEL.height / size.y;
    model.position.sub(center).multiplyScalar(s);
    model.scale.setScalar(s);
    const wrap = new THREE.Group();
    wrap.rotation.y = MODEL.turnY;
    wrap.add(model);
    head.add(wrap);
    modelSize = size.multiplyScalar(s);

    const meshes: THREE.Mesh[] = [];
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    meshes.forEach((m) => {
      [m.material]
        .flat()
        .forEach((mat) => materials.push(mat as THREE.MeshStandardMaterial));
      buildFaceMorphs(m);
    });

    // No mipmaps: Meshy packs skin and hair texture pieces tightly side by side, and the smaller
    // mipmap copies blend them, which drew light "crack" lines across the hair at small sizes.
    materials.forEach((mat) => {
      [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap].forEach(
        (tex) => {
          if (!tex) return;
          tex.minFilter = THREE.LinearFilter;
          tex.generateMipmaps = false;
          tex.needsUpdate = true;
        }
      );
    });
    callbacks.onReady?.();
  }

  new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .load(MODEL.url, onModel, undefined, (err) => {
      if (!destroyed) callbacks.onError?.(err);
    });

  /* ---------- sizing ---------- */
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(2.9 / (2 * t), 2.7 / (2 * t * camera.aspect));
    camera.position.set(0, 0.05, dist);
    camera.lookAt(0, 0.05, 0);
    camera.updateProjectionMatrix();
  }
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  const tmp = new THREE.Vector3();
  // Head-local point -> pixel position inside the container.
  function headToStage(x: number, y: number, z: number) {
    tmp.set(x, y, z);
    head.localToWorld(tmp);
    tmp.project(camera);
    return {
      x: ((tmp.x + 1) / 2) * container.clientWidth,
      y: ((1 - tmp.y) / 2) * container.clientHeight,
    };
  }

  /* ---------- state ---------- */
  const now0 = performance.now();
  const S = {
    mood: 'idle' as Mood,
    moodUntil: Infinity,
    lx: 0,
    ly: 0,
    lastMove: now0,
    cursorIn: true,
    leftAt: 0,
    lonelySaid: false,
    glance: { x: 0, y: 0, until: 0, next: 0 },
    sq: { s: 0, v: 0 } as Spring,
    jolt: { s: 0, v: 0 } as Spring,
    shutL: 0,
    shutR: 0,
    anger: 0,
    daze: 0,
    dizzyStart: -1e9,
    pokes: [] as number[],
    shakeStart: -1e9,
    talk: null as Talk | null,
    open: 0, // how open the mouth is (0..1)
    speakAmt: 0, // eases in while speaking a line (drives the talking head motion)
    blinkNext: now0 + 1500,
    blinkStart: -1,
    doubleQueued: false,
    time: 0,
  };
  const P = {
    x: 0,
    y: 0,
    has: false,
    lastX: null as number | null,
    lastSign: 0,
    reversals: [] as number[],
  };
  const setMood = (m: Mood, ms?: number) => {
    S.mood = m;
    S.moodUntil = ms ? performance.now() + ms : Infinity;
  };

  /* ---------- speech bubble + floating text ---------- */
  let bubbleTimer = 0;
  const showBubble = (on: boolean) => {
    bubble.dataset.show = on ? 'true' : 'false';
  };
  function placeBubble() {
    const p = headToStage(0.75, 1.0, 0);
    // Keep the bubble from running far past the right edge of the avatar on narrow screens.
    const maxLeft = container.clientWidth + 24 - bubble.offsetWidth;
    bubble.style.left = `${Math.max(8, Math.min(p.x, maxLeft))}px`;
    bubble.style.top = `${p.y - 30}px`;
  }
  // Short reaction words ("huh?!"): show the bubble and move the mouth with them.
  function say(text: string, ms: number) {
    bubble.textContent = text;
    placeBubble();
    showBubble(true);
    window.clearTimeout(bubbleTimer);
    if (Number.isFinite(ms))
      bubbleTimer = window.setTimeout(() => showBubble(false), ms);
    startTalk(text, false);
  }
  const hush = () => {
    window.clearTimeout(bubbleTimer);
    showBubble(false);
  };

  function popText(text: string, cx: number, cy: number) {
    const r = container.getBoundingClientRect();
    const n = document.createElement('div');
    n.textContent = text;
    n.className =
      'pointer-events-none absolute z-30 text-xl font-semibold text-orange-400';
    n.style.left = `${cx - r.left}px`;
    n.style.top = `${cy - r.top}px`;
    container.appendChild(n);
    n.animate(
      [
        { opacity: 0, transform: 'translate(-50%, -50%) scale(0.6)' },
        {
          opacity: 1,
          transform: 'translate(-50%, -90%) scale(1.15)',
          offset: 0.2,
        },
        { opacity: 0, transform: 'translate(-50%, -220%) scale(1)' },
      ],
      { duration: 900, easing: 'ease-out', fill: 'forwards' }
    ).onfinish = () => n.remove();
  }

  /* ---------- talking ---------- */
  // Text -> mouth keyframes: vowels open wide, m/b/p close, other letters half open, spaces and
  // punctuation rest. Accented vowels (Vietnamese) count as vowels.
  function startTalk(text: string, typed: boolean) {
    const chars = Array.from(text);
    const keys: MouthKey[] = [];
    let t = 0;
    for (const ch of chars) {
      const base = ch.normalize('NFD')[0];
      let v: number;
      let d = 1 / CONFIG.talkRate;
      if (/[aeiouy]/i.test(base)) v = 0.6 + Math.random() * 0.4;
      else if (/[mbp]/i.test(base)) v = 0;
      else if (/[.,!?…;:]/.test(ch)) {
        v = 0;
        d += 0.16;
      } else if (/\s/.test(ch)) v = 0.08;
      else v = 0.25 + Math.random() * 0.1;
      keys.push({ t, v });
      t += d;
    }
    keys.push({ t, v: 0 });
    S.talk = {
      text,
      typed,
      start: performance.now(),
      chars,
      keys,
      duration: t,
    };
    return S.talk;
  }

  // Say a line: the bubble types it out while the mouth moves; optionally out loud.
  function speak(raw: string, useVoice = false) {
    const text = (raw || '').trim().slice(0, 140);
    if (!text) return;
    if (S.mood === 'sleep') setMood('idle');
    S.lastMove = performance.now();
    say(text, Infinity);
    const talk = startTalk(text, true);
    if (useVoice && 'speechSynthesis' in window) {
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        if (
          /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(text)
        )
          u.lang = 'vi-VN';
        u.pitch = 1.15;
        // Keep the mouth in step with the voice: jump to the word the voice is on.
        u.onboundary = (e) => {
          if (S.talk !== talk) return;
          const idx = Array.from(text.slice(0, e.charIndex)).length;
          talk.start =
            performance.now() -
            talk.keys[Math.min(idx, talk.keys.length - 1)].t * 1000;
        };
        speechSynthesis.speak(u);
      } catch {
        /* no voice available: the mouth still moves silently */
      }
    }
  }

  // Cut a line short: the mouth eases shut on its own once there's no line to follow.
  function stopTalking() {
    S.talk = null;
    hush();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  /* ---------- reactions ---------- */
  function wake() {
    setMood('surprised', 900);
    say(CONFIG.lines.wake, 900);
    S.sq.v += 5;
  }
  // Count pokes; too many in a short time makes it grumpy. Returns true if it's (now) grumpy.
  // Grumpy shows only on the face and head (no words).
  function poked() {
    const now = performance.now();
    S.lastMove = now;
    S.pokes = S.pokes.filter((t) => now - t < CONFIG.grumpyWindow);
    S.pokes.push(now);
    if (S.mood === 'grumpy') {
      setMood('grumpy', CONFIG.grumpyFor); // still poking: stay grumpy longer
      S.sq.v += 3;
      return true;
    }
    if (S.pokes.length >= CONFIG.grumpyAfter) {
      S.pokes = [];
      setMood('grumpy', CONFIG.grumpyFor);
      S.shakeStart = now; // a quick "no" head shake
      S.sq.v += 4;
      hush();
      return true;
    }
    return false;
  }
  // Dizzy shows only on the face and head (no words).
  function getDizzy() {
    setMood('dizzy', CONFIG.dizzyFor);
    S.dizzyStart = performance.now();
    hush();
  }
  function boop(e: PointerEvent) {
    if (poked()) return;
    setMood('boop', 650);
    S.sq.v += 8;
    popText(pick(CONFIG.lines.boop), e.clientX, e.clientY);
  }
  function honk(e: PointerEvent) {
    if (poked()) return;
    setMood('honk', 700);
    S.jolt.v += 9; // the whole head jerks back
    S.sq.v += 3;
    popText(pick(CONFIG.lines.honk), e.clientX, e.clientY);
  }
  function leave() {
    if (!S.cursorIn) return;
    S.cursorIn = false;
    S.leftAt = performance.now();
    if (S.mood !== 'sleep') setMood('lonely');
  }
  function comeBack() {
    S.cursorIn = true;
    if (S.mood === 'lonely') setMood('idle');
    if (S.lonelySaid) say(CONFIG.lines.back, 900);
    else hush();
    S.lonelySaid = false;
  }

  /* ---------- input ---------- */
  const onPointerMove = (e: PointerEvent) => {
    const now = performance.now();
    if (P.lastX !== null) {
      const dx = e.clientX - P.lastX;
      if (Math.abs(dx) > 6) {
        const sign = dx > 0 ? 1 : -1;
        if (P.lastSign && sign !== P.lastSign) P.reversals.push(now);
        P.lastSign = sign;
      }
    }
    P.lastX = e.clientX;
    P.x = e.clientX;
    P.y = e.clientY;
    P.has = true;
    S.lastMove = now;
    if (!S.cursorIn) comeBack();
    if (S.mood === 'sleep') wake();
    P.reversals = P.reversals.filter((t) => now - t < CONFIG.shakeWindow);
    if (P.reversals.length >= CONFIG.shakeReversals && S.mood !== 'dizzy') {
      P.reversals = [];
      getDizzy();
    }
  };
  const onMouseOut = (e: MouseEvent) => {
    if (!e.relatedTarget) leave();
  };
  const onMouseOver = () => {
    if (!S.cursorIn) comeBack();
  };
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const onPointerDown = (e: PointerEvent) => {
    if (!model) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    );
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(head, true)[0];
    if (!hit) return;
    // Near the nose? Compare in the head's own space, as a fraction of the model size.
    const local = head.worldToLocal(hit.point.clone());
    const fx = local.x / (modelSize.x / 2);
    const fy = local.y / (modelSize.y / 2);
    const nearNose =
      Math.hypot(fx - MODEL.nose.x, fy - MODEL.nose.y) < MODEL.nose.radius &&
      local.z > 0;
    if (nearNose) honk(e);
    else boop(e);
  };
  window.addEventListener('pointermove', onPointerMove);
  document.addEventListener('mouseout', onMouseOut);
  document.addEventListener('mouseover', onMouseOver);
  canvas.addEventListener('pointerdown', onPointerDown);

  /* ---------- animation (paused while off screen) ---------- */
  const spring = (o: Spring, dt: number, k: number, c: number) => {
    o.v += (-k * o.s - c * o.v) * dt;
    o.s += o.v * dt;
  };

  const headWorld = new THREE.Vector3();
  let raf = 0;
  let running = false;
  let last = performance.now();

  function frame(now: number) {
    const dt = clamp((now - last) / 1000, 0, 0.05); // the first frame can report a time slightly before "last"
    last = now;
    S.time += dt;
    let m = S.mood;

    if (now > S.moodUntil) {
      const was = m;
      setMood(S.cursorIn ? 'idle' : 'lonely');
      m = S.mood;
      if (was === 'dizzy') S.shakeStart = now; // shakes it off
    }
    if (m === 'idle' && now - S.lastMove > CONFIG.sleepAfter) {
      setMood('sleep');
      m = 'sleep';
      hush();
    }
    if (
      m === 'lonely' &&
      !S.lonelySaid &&
      now - S.leftAt > CONFIG.lonelyBubbleAfter
    ) {
      S.lonelySaid = true;
      say(CONFIG.lines.lonely, Infinity);
    }

    // Where to look: the cursor relative to the head on screen.
    head.getWorldPosition(headWorld);
    headWorld.project(camera);
    const r = container.getBoundingClientRect();
    const cx = r.left + ((headWorld.x + 1) / 2) * r.width;
    const cy = r.top + ((1 - headWorld.y) / 2) * r.height;
    let tx = 0;
    let ty = 0;
    if (m === 'dizzy') {
      tx = Math.sin(S.time * 1.3) * 0.15; // dazed: gaze drifts low
      ty = 0.25;
    } else if (m !== 'sleep' && P.has) {
      tx = clamp((P.x - cx) / CONFIG.followRange, -1, 1);
      ty = clamp((P.y - cy) / CONFIG.followRange, -1, 1);
      if (m === 'idle' && now - S.lastMove > 2500) {
        if (now > S.glance.next) {
          S.glance = {
            x: rand(-1, 1),
            y: rand(-0.5, 0.4),
            until: now + 700,
            next: now + 700 + rand(1800, 3600),
          };
        }
        if (now < S.glance.until) {
          tx = S.glance.x;
          ty = S.glance.y;
        }
      }
    }
    // Speaking a line: stop following the cursor and look at the viewer.
    const speaking = !!S.talk?.typed;
    if (speaking) {
      tx = 0;
      ty = 0.05;
    }
    S.speakAmt += ((speaking ? 1 : 0) - S.speakAmt) * (1 - Math.exp(-dt * 4));
    if (m === 'grumpy') {
      // "Hmph": turn the face away from the cursor, chin up.
      tx = P.has && P.x < cx ? 0.75 : -0.75;
      ty = -0.35;
    }
    const k = 1 - Math.exp(-dt * CONFIG.followSpeed);
    S.lx += (tx - S.lx) * k;
    S.ly += (ty - S.ly) * k;
    spring(S.sq, dt, 260, 12);
    spring(S.jolt, dt, 220, 14);

    // Blink: random blinks (sometimes double); shut while napping or booped.
    const eyesShut = m === 'sleep' || m === 'boop';
    let blinkCurve = 0;
    if (!eyesShut && m !== 'dizzy') {
      if (S.blinkStart < 0 && now >= S.blinkNext) S.blinkStart = now;
      if (S.blinkStart >= 0) {
        const bt = (now - S.blinkStart) / 150;
        if (bt >= 1) {
          S.blinkStart = -1;
          if (S.doubleQueued) {
            S.doubleQueued = false;
            S.blinkNext = now + 90;
          } else {
            S.blinkNext =
              now + rand(CONFIG.blinkEvery[0], CONFIG.blinkEvery[1]);
            S.doubleQueued = Math.random() < CONFIG.doubleBlinkChance;
          }
        } else {
          blinkCurve = Math.sin(Math.PI * bt);
        }
      }
    }
    const squint = m === 'grumpy' ? 0.35 : 0; // grumpy eyes narrow
    const both = eyesShut ? 1 : Math.max(squint, blinkCurve);
    // Dizzy: the eyes droop unevenly and drift, like it can't focus.
    const dz = m === 'dizzy';
    const shutL = dz ? 0.55 + 0.2 * Math.sin(S.time * 2.1) : both;
    const shutR = dz ? 0.3 + 0.15 * Math.sin(S.time * 1.6 + 1) : both;
    const ke = 1 - Math.exp(-dt * (dz ? 8 : 40));
    S.shutL += (shutL - S.shutL) * ke;
    S.shutR += (shutR - S.shutR) * ke;
    // Grumpy: brows frown, mouth corners drop, face flushes a little red.
    S.anger += ((m === 'grumpy' ? 1 : 0) - S.anger) * (1 - Math.exp(-dt * 8));
    // Dizzy: brows lift at the inner ends (dazed) and the mouth sags a little.
    S.daze += ((dz ? 1 : 0) - S.daze) * (1 - Math.exp(-dt * 6));
    materials.forEach((mat) =>
      mat.color.setRGB(1, 1 - 0.16 * S.anger, 1 - 0.2 * S.anger)
    );

    // Talking: follow the line's mouth keyframes; spoken lines type out in the bubble.
    let openTarget = 0;
    if (S.talk) {
      const talk = S.talk;
      const tt = (now - talk.start) / 1000;
      let i = 0;
      while (i + 1 < talk.keys.length && talk.keys[i + 1].t <= tt) i++;
      openTarget = talk.keys[i].v;
      if (talk.typed) bubble.textContent = talk.chars.slice(0, i + 1).join('');
      if (tt > talk.duration) {
        if (talk.typed) {
          bubble.textContent = talk.text;
          window.clearTimeout(bubbleTimer);
          bubbleTimer = window.setTimeout(() => showBubble(false), 1800);
        }
        S.talk = null;
      }
    }
    S.open += (openTarget - S.open) * (1 - Math.exp(-dt * 28));
    const open = S.open * CONFIG.mouthOpen;

    faceMeshes.forEach((fm) => {
      const inf = fm.morphTargetInfluences!;
      inf[MORPH.blinkL] = S.shutL;
      inf[MORPH.blinkR] = S.shutR;
      inf[MORPH.smile] = 0; // the model already smiles
      inf[MORPH.brows] = S.anger - 0.7 * S.daze;
      inf[MORPH.mouthDown] = S.anger + 0.45 * S.daze;
      inf[MORPH.jaw] = open;
    });
    mouthInsides.forEach((mi) => {
      mi.mesh.visible = open > 0.03;
      const sy = mi.h * Math.min(open, 1.5);
      mi.mesh.scale.set(mi.w * (0.7 + 0.3 * Math.min(open, 1)), sy, 1);
      // Hang from the lip line: the top edge stays at the upper lip, the opening grows downward.
      mi.mesh.position.copy(mi.base).addScaledVector(mi.down, sy * 0.5);
    });

    // Head motion.
    const bob = reduced ? 0 : Math.sin(S.time * 2) * 0.015;
    const droop =
      m === 'sleep' ? 0.3 + (reduced ? 0 : Math.sin(S.time * 1.6) * 0.03) : 0;
    // Dizzy: the head sways in slow loops that start big and settle down.
    const dzT = clamp((now - S.dizzyStart) / CONFIG.dizzyFor, 0, 1);
    const sway = dz && !reduced ? 0.3 * Math.pow(1 - dzT, 0.7) : 0;
    const swayA = S.time * Math.PI * 2 * 0.9;
    // "No" / shake-it-off head shake, about half a second.
    const shakeT = (now - S.shakeStart) / 1000;
    const shake =
      shakeT < 0.6 && !reduced
        ? Math.sin(shakeT * 30) * 0.22 * (1 - shakeT / 0.6)
        : 0;
    // Talking: a slow, gentle drift side to side, not tied to each word.
    const talkMove = reduced ? 0 : S.speakAmt;
    headPivot.rotation.x =
      S.ly * CONFIG.headTilt +
      droop -
      S.jolt.s * 0.06 +
      sway * 0.6 * Math.sin(swayA);
    headPivot.rotation.y =
      S.lx * CONFIG.headTurn + shake + talkMove * 0.04 * Math.sin(S.time * 1.1);
    headPivot.rotation.z =
      -S.lx * 0.06 +
      sway * Math.cos(swayA) +
      talkMove * 0.02 * Math.sin(S.time * 0.8 + 0.5);
    squash.scale.set(1 + S.sq.s * 0.07, 1 - S.sq.s * 0.07, 1 + S.sq.s * 0.07);
    squash.position.y = bob;
    squash.position.z = -S.jolt.s * 0.03;

    // Effects.
    zzz.hidden = m !== 'sleep';
    if (m === 'sleep') {
      const zp = headToStage(0.7, 0.95, 0.2);
      zzz.style.left = `${zp.x}px`;
      zzz.style.top = `${zp.y}px`;
    }
    stars.forEach((st, i) => {
      st.visible = m === 'dizzy';
      if (!st.visible) return;
      const a = S.time * (reduced ? 1.2 : 4) + (i * Math.PI * 2) / 3;
      tmp.set(Math.cos(a) * 1.25, 1.15, Math.sin(a) * 1.25);
      head.localToWorld(tmp);
      st.position.copy(tmp);
      st.rotation.set(0, a * 2, a);
    });

    renderer.render(scene, camera);
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
  const visibility = new IntersectionObserver(([entry]) =>
    setRunning(entry.isIntersecting)
  );
  visibility.observe(container);

  return {
    say: (text, voice = false) => speak(text, voice),
    stop: stopTalking,
    angry() {
      if (S.mood === 'sleep') setMood('idle');
      setMood('grumpy', CONFIG.grumpyFor + 2000);
      S.shakeStart = performance.now();
      S.sq.v += 4;
    },
    destroy() {
      destroyed = true;
      setRunning(false);
      visibility.disconnect();
      resizeObserver.disconnect();
      window.clearTimeout(bubbleTimer);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('mouseout', onMouseOut);
      document.removeEventListener('mouseover', onMouseOver);
      canvas.removeEventListener('pointerdown', onPointerDown);
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      envTexture.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
