/* ══════════════════════════════════════════════════════════════
   BUBBLE PoP — game.js
   Screens:  home (floating letters) → instructions → game
   Popping:  hand-tracking fingertips (MediaPipe Hands) + touch/click
   ══════════════════════════════════════════════════════════════ */
'use strict';

const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const BEST_KEY = 'bubblepop.best';
const getBest = () => Number(localStorage.getItem(BEST_KEY) || 0);

/* ────────────────────────── AUDIO ────────────────────────────── */

const MUTE_KEY = 'bubblepop.muted';
let actx = null;
let muted = localStorage.getItem(MUTE_KEY) === '1';

function audio() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    actx = new AC();
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}

function tone(f0, f1, dur, { type = 'sine', gain = 0.18, at = 0 } = {}) {
  const ctx = audio();
  if (!ctx || muted) return;
  if (ctx.state !== 'running') return; // don't queue notes while autoplay-blocked
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function splash(dur = 0.5, { gain = 0.12, f = 900, at = 0 } = {}) {
  const ctx = audio();
  if (!ctx || muted) return;
  if (ctx.state !== 'running') return;
  const t0 = ctx.currentTime + at;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(f, t0);
  bp.frequency.exponentialRampToValueAtTime(f * 2.2, t0 + dur);
  bp.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(t0);
}

const snd = {
  pop(streak = 0) {
    // pitch climbs with the combo streak — pops feel hotter and hotter
    const p = rand(0.85, 1.25) * (1 + Math.min(streak, 20) * 0.018);
    tone(320 * p, 780 * p, 0.09, { gain: 0.22 });
    splash(0.08, { gain: 0.1, f: 1600 });
  },
  jelly() {
    tone(240, 55, 0.5, { type: 'sawtooth', gain: 0.16 });
    tone(180, 45, 0.55, { type: 'square', gain: 0.07, at: 0.03 });
    splash(0.35, { gain: 0.1, f: 300 });
  },
  gift() {
    [660, 880, 1175].forEach((f, i) => tone(f, f, 0.14, { type: 'triangle', gain: 0.16, at: i * 0.08 }));
  },
  life() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.2, { type: 'triangle', gain: 0.15, at: i * 0.09 }));
  },
  click() {
    tone(500, 700, 0.08, { type: 'triangle', gain: 0.15 });
  },
  count(go) {
    tone(go ? 880 : 520, go ? 880 : 520, go ? 0.35 : 0.12, { type: 'square', gain: 0.1 });
  },
  over() {
    // proper "you died" arcade jingle — descending steps + a low final thud
    [523, 494, 440, 392, 330, 262].forEach((f, i) => tone(f, f * 0.99, 0.22, { type: 'square', gain: 0.12, at: i * 0.16 }));
    tone(131, 92, 0.9, { type: 'triangle', gain: 0.16, at: 1.05 });
  },
  record() {
    // NEW RECORD fanfare — rising run + sparkle
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.16, { type: 'square', gain: 0.12, at: i * 0.09 }));
    tone(1568, 1568, 0.45, { type: 'triangle', gain: 0.12, at: 0.5 });
    tone(2093, 2093, 0.3, { type: 'triangle', gain: 0.08, at: 0.62 });
  },
  wash() {
    // gamified wave — whoosh + rising bubble arpeggio
    splash(1.1, { gain: 0.14, f: 500 });
    [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.06, 0.13, { type: 'square', gain: 0.07, at: i * 0.07 }));
  },
  intro() {
    // Nintendo-style "press start" jingle for the loading screen
    [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.16, { type: 'square', gain: 0.1, at: i * 0.12 }));
    tone(1319, 1319, 0.4, { type: 'triangle', gain: 0.1, at: 0.52 });
  },
  blip(i) {
    // a letter lands in the title
    tone(440 + i * 65, 480 + i * 65, 0.09, { type: 'square', gain: 0.07 });
  },
  gold() {
    [784, 1047, 1319, 1568].forEach((f, i) => tone(f, f, 0.12, { type: 'triangle', gain: 0.14, at: i * 0.06 }));
    splash(0.15, { gain: 0.08, f: 2400 });
  },
  frenzy() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.09, { type: 'square', gain: 0.11, at: i * 0.06 }));
  },
  slow() {
    tone(880, 220, 0.7, { type: 'sine', gain: 0.12 });
    tone(660, 165, 0.7, { type: 'sine', gain: 0.08, at: 0.1 });
  },
  shield() {
    tone(523, 523, 0.1, { type: 'square', gain: 0.1 });
    tone(1047, 1047, 0.3, { type: 'triangle', gain: 0.14, at: 0.1 });
  },
  shieldBreak() {
    tone(700, 200, 0.25, { type: 'square', gain: 0.13 });
    splash(0.3, { gain: 0.12, f: 900 });
  },
  zone() {
    tone(196, 196, 0.4, { type: 'triangle', gain: 0.14 });
    tone(294, 294, 0.4, { type: 'triangle', gain: 0.1, at: 0.15 });
  },
  boss() {
    tone(110, 98, 0.4, { type: 'sawtooth', gain: 0.12 });
    tone(110, 98, 0.4, { type: 'sawtooth', gain: 0.12, at: 0.5 });
  },
  dodge() {
    [659, 784, 988].forEach((f, i) => tone(f, f, 0.12, { type: 'triangle', gain: 0.12, at: i * 0.07 }));
  },
  levelUp() {
    // grand "yey!" fanfare — triumphant rising run + shimmer
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, f, 0.15, { type: 'square', gain: 0.13, at: i * 0.08 }));
    tone(1047, 1047, 0.5, { type: 'triangle', gain: 0.13, at: 0.5 });
    tone(1319, 1319, 0.5, { type: 'triangle', gain: 0.11, at: 0.55 });
    tone(1568, 1568, 0.6, { type: 'triangle', gain: 0.1, at: 0.6 });
    splash(0.4, { gain: 0.1, f: 2600, at: 0.5 });
  },
  victory() {
    // big triumphant "YOU SURVIVED" fanfare
    const mel = [523, 523, 523, 523, 415, 466, 523, 466, 523];
    mel.forEach((f, i) => tone(f, f, 0.2, { type: 'square', gain: 0.14, at: i * 0.16 }));
    [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, f, 0.7, { type: 'triangle', gain: 0.11, at: 1.5 + i * 0.06 }));
    splash(0.6, { gain: 0.12, f: 3000, at: 1.5 });
  },
};

/* ─────────────── DAILY CHALLENGE SEED ────────────────────────── */
/* Everyone gets the same bubble sequence on the same day — fair
   score battles. Only spawn randomness is seeded; visuals aren't. */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let srand = Math.random;
function seedDaily() {
  const d = new Date();
  const s = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  srand = mulberry32(h);
}
const srange = (a, b) => a + srand() * (b - a);

/* tiny chiptune sequencer — melodies are just arrays of Hz (0 = rest) */
const music = {
  timer: null,
  step: 0,
  tracks: {
    // cheerful reading-the-manual tune (C major pentatonic)
    manual: {
      tempo: 160,
      lead: [659, 0, 784, 0, 880, 0, 784, 0, 659, 0, 523, 0, 587, 659, 587, 0],
      bass: [262, 0, 196, 0, 220, 0, 196, 0, 175, 0, 262, 0, 196, 0, 131, 0],
    },
    // sparse deep-sea pulse under gameplay
    game: {
      tempo: 200,
      lead: [0, 0, 0, 0, 880, 0, 0, 0, 0, 0, 0, 0, 1047, 0, 0, 0],
      bass: [131, 0, 0, 0, 165, 0, 0, 0, 147, 0, 0, 0, 196, 0, 0, 0],
    },
  },
  start(name) {
    this.stop();
    const t = this.tracks[name];
    if (!t) return;
    this.step = 0;
    this.timer = setInterval(() => {
      const i = this.step % t.lead.length;
      if (t.lead[i]) tone(t.lead[i], t.lead[i], 0.13, { type: 'square', gain: 0.045 });
      if (t.bass[i]) tone(t.bass[i], t.bass[i], 0.22, { type: 'triangle', gain: 0.075 });
      this.step++;
    }, t.tempo);
  },
  stop() {
    clearInterval(this.timer);
    this.timer = null;
  },
};

/* ─────────────────── PIXEL ICONS ─────────────────────────────── */

function pixSvg(rects, vb = '0 0 8 8') {
  const body = rects
    .map(([x, y, w = 1, h = 1]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`)
    .join('');
  return `<svg viewBox="${vb}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

const ICON = {
  sndOn: pixSvg([[1, 3, 1, 2], [2, 2, 1, 4], [3, 1, 1, 6], [5, 2], [6, 3, 1, 2], [5, 5]]),
  sndOff: pixSvg([[1, 3, 1, 2], [2, 2, 1, 4], [3, 1, 1, 6], [5, 2], [7, 2], [6, 3], [5, 4], [7, 4]]),
  pause: pixSvg([[2, 1, 2, 6], [5, 1, 2, 6]]),
  play: pixSvg([[2, 1, 1, 6], [3, 2, 1, 4], [4, 3, 1, 2]]),
  bulb: pixSvg([[3, 0, 2, 1], [2, 1, 4, 1], [1, 2, 6, 2], [2, 4, 4, 1], [3, 5, 2, 1], [2, 6, 4, 1], [3, 7, 2, 1]]),
};

function heartSVG(filled) {
  const fill = filled ? '#ff3b5c' : 'rgba(255,255,255,0.30)';
  const hi = filled ? '<rect x="1" y="1" width="1" height="1" fill="rgba(255,255,255,0.85)"/>' : '';
  return (
    `<svg viewBox="0 0 8 6" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">` +
    `<g fill="${fill}"><rect x="1" y="0" width="2" height="1"/><rect x="5" y="0" width="2" height="1"/>` +
    `<rect x="0" y="1" width="8" height="2"/><rect x="1" y="3" width="6" height="1"/>` +
    `<rect x="2" y="4" width="4" height="1"/><rect x="3" y="5" width="2" height="1"/></g>${hi}</svg>`
  );
}

/* ─────────────────── SCREENS & BUBBLE WASH ───────────────────── */

const screens = {
  home: $('#screen-home'),
  instructions: $('#screen-instructions'),
  game: $('#screen-game'),
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('is-active'));
  screens[name].classList.add('is-active');
  // the floating speaker lives on menu screens; the game has its own in the HUD
  $('#btnMuteMenu').hidden = name === 'game';
}

/** Full-screen rising bubble cluster; swaps content while covered. */
function bubbleWash(midSwap) {
  return new Promise((resolve) => {
    const layer = $('#bubbleWash');
    layer.innerHTML = '';
    const n = Math.round(clamp(window.innerWidth / 26, 34, 60));
    for (let i = 0; i < n; i++) {
      const b = document.createElement('div');
      b.className = 'wb';
      const size = rand(9, 24);
      b.style.width = b.style.height = size + 'vmin';
      b.style.left = rand(-8, 100) + 'vw';
      b.style.setProperty('--wd', rand(1.25, 1.8) + 's');
      b.style.setProperty('--wdel', rand(0, 0.4) + 's');
      layer.appendChild(b);
    }
    snd.wash();
    setTimeout(() => { midSwap && midSwap(); }, 750);
    setTimeout(() => { layer.innerHTML = ''; resolve(); }, 2300);
  });
}

/* ──────────────── SCREEN 1-2 : FLOATING LETTERS ──────────────── */

// Scatter spots from the Figma "Loading Animation" frame (1200×896 canvas)
const SCATTER = [
  [210, 196], [299, 264], [423, 634], [484, 60], [580, 566],
  [619, 347], [744, 347], [795, 473], [879, 240],
];
const WORD = ['B', 'u', 'b', 'b', 'l', 'e', 'P', 'o', 'P'];

const homeTitle = $('#homeTitle');
const letterStage = $('#letterStage');
let introPlayed = false;

async function playIntro() {
  const stage = letterStage;
  stage.innerHTML = '';
  const W = window.innerWidth;
  const H = window.innerHeight;
  const targets = [...homeTitle.children].filter((s) => !s.classList.contains('sp'));

  snd.intro(); // silent until the browser allows audio (first tap/click)

  // one continuous journey per letter:
  // rise from the seabed → drift past its scatter spot → settle into the line
  const anims = WORD.map((ch, i) => {
    const el = document.createElement('div');
    el.className = 'fl';
    el.textContent = ch;
    stage.appendChild(el);

    const sx = (SCATTER[i][0] / 1200) * W + rand(-30, 30);
    const sy = H + 140 + rand(0, 140);
    const mx = (SCATTER[i][0] / 1200) * W;
    const my = (SCATTER[i][1] / 896) * H * 0.9;
    const r = targets[i].getBoundingClientRect();

    const anim = el.animate(
      [
        { transform: `translate(${sx}px, ${sy}px) rotate(${rand(-14, 14)}deg)`, easing: 'cubic-bezier(0.25, 0.8, 0.45, 1)' },
        { transform: `translate(${mx}px, ${my}px) rotate(${rand(-8, 8)}deg)`, offset: 0.45, easing: 'ease-in-out' },
        { transform: `translate(${mx + rand(-16, 16)}px, ${my - 12}px) rotate(${rand(-6, 6)}deg)`, offset: 0.62, easing: 'cubic-bezier(0.5, 0, 0.25, 1)' },
        { transform: `translate(${r.left}px, ${r.top}px) rotate(0deg)` },
      ],
      { duration: 2600, delay: i * 65, fill: 'both' }
    );
    return anim.finished.then(() => snd.blip(i)).catch(() => {});
  });

  // finish when the letters land — or after a grace period if the tab is
  // backgrounded/throttled, so the Start button is never unreachable
  await Promise.race([Promise.all(anims), wait(6000)]);

  // hand over to the real title
  homeTitle.classList.add('is-live');
  stage.innerHTML = '';
  revealHomeUi();
  introPlayed = true;
}

function revealHomeUi() {
  homeTitle.classList.add('is-live');
  $('#homeTagline').classList.add('shown');
  $('#btnStart').classList.add('shown');
}

/* ─────────────── SCREEN 3 : INSTRUCTIONS ─────────────────────── */

function openInstructions() {
  const best = getBest();
  const box = $('#bestScoreBox');
  if (best > 0) {
    box.hidden = false;
    $('#bestScoreManual').textContent = best;
  } else {
    box.hidden = true;
  }
  renderTop5();
  preloadVision(); // warm the hand model while the player reads
  showScreen('instructions');
  music.start('manual');
}

function renderTop5() {
  const wrap = $('#top5List');
  if (!wrap) return;
  const top = getTop5();
  if (!top.length) { wrap.innerHTML = '<li class="t5-empty">No runs yet — be the first!</li>'; return; }
  wrap.innerHTML = top
    .map((r, i) => `<li><span class="t5-rank">${i + 1}</span><b>${r.score}</b><span class="t5-date">${r.date}</span></li>`)
    .join('');
}


/* ─────────────────────── GAME STATE ──────────────────────────── */

const canvas = $('#gameCanvas');
const ctx2d = canvas.getContext('2d');
const video = $('#cam');
const fishLayer = $('#fishLayer');

let W = 0, H = 0, DPR = 1;
let running = false;
let rafId = 0;
let lastT = 0;
let elapsed = 0;
let spawnTimer = 0;
let score = 0;
let lives = 3;
const MAX_LIVES = 5;

/* game modes & meta systems */
let mode = '1p';                 // '1p' solo · '2p' versus
let scores = [0, 0];             // 2P: left player / right player
let matchTime = 0;               // 2P: seconds remaining
let combo = 0;
let comboTimer = 0;
let bestCombo = 0;
const fx = { frenzyT: 0, slowT: 0, shield: false };
let zoneIdx = 0;
let bossTimer = 0;
let stats = { pops: 0, jellies: 0, gold: 0, dodged: 0 };
let level = 1;

/* item artwork drawn inside bubbles */
const IMG = {};
['treasure', 'coin', 'heart'].forEach((n) => {
  const im = new Image();
  im.src = `assets/items/${n}.png`;
  IMG[n] = im;
});
function drawImageBubble(img, cx, cy, size) {
  if (!img.complete || !img.naturalWidth) return false;
  const ar = img.naturalWidth / img.naturalHeight;
  let w = size, h = size;
  if (ar > 1) h = size / ar; else w = size * ar;
  ctx2d.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  return true;
}

const MATCH_SECONDS = 90;

const ZONES = [
  { t: 0, name: 'CORAL GARDEN' },
  { t: 30, name: 'KELP FOREST' },
  { t: 60, name: 'TWILIGHT ZONE' },
  { t: 90, name: 'THE DEEP' },
  { t: 130, name: 'THE ABYSS' },
];

const TOP5_KEY = 'bubblepop.top5';
const getTop5 = () => { try { return JSON.parse(localStorage.getItem(TOP5_KEY)) || []; } catch { return []; } };
let bubbles = [];
let particles = [];
let texts = [];
let dust = [];
let pointers = [];       // smoothed fingertip cursors
let camStream = null;
let fishTimer = 0;
let handLandmarker = null;
let visionReady = false;
let handLoopOn = false;
let lastVideoTime = -1;

function resizeCanvas() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx2d.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resizeCanvas);

/* ─────────────────── DIFFICULTY CURVE ────────────────────────── */

function difficulty() {
  const ramp = clamp(elapsed / 100, 0, 1);          // 0 → 1 over 100 s
  const jelly = lerp(0.20, 0.40, ramp);             // 20 % → 40 %
  return {
    jelly,
    gift: 0.09,
    life: 0.01,
    o2: 1 - jelly - 0.10,
    speed: lerp(1, 2.15, clamp(elapsed / 90, 0, 1)) + Math.max(0, elapsed - 90) * 0.003,
    spawnMs: lerp(720, 420, clamp(elapsed / 90, 0, 1)),
  };
}

/* ─────────────────────── LEVELS ──────────────────────────────── */
// Level 2 at 350, Level 3 at 700 — survive to 1200 to win.
const LEVEL_SCORES = [0, 350, 700];
const WIN_SCORE = 1200;
let won = false;
// score milestones a boss guards; the last one (the win) is the final boss
const MILESTONES = [350, 700, 1200];
const BOSS_PROXIMITY = 100;   // boss appears within this many points of a milestone
let bossDone = new Set();
const jellySpeedMult = () => 1 + (level - 1) * 0.28;  // jellies get faster each level
const bossSpeedMult = () => 1 + (level - 1) * 0.4;    // boss gets meaner each level

function levelForScore(s) {
  let lv = 1;
  for (let i = 1; i < LEVEL_SCORES.length; i++) if (s >= LEVEL_SCORES[i]) lv = i + 1;
  return lv;
}

function checkLevel() {
  if (mode === '2p') return;
  const nl = levelForScore(score);
  if (nl > level) { level = nl; onLevelUp(); }
}

function onLevelUp() {
  banner(level >= 3 ? 'LEVEL 3 — FINAL DEPTHS!' : 'LEVEL ' + level + '!', '#ffe08a');
  snd.levelUp();
  // sink deeper: darken the water and reef more each level
  screens.game.style.setProperty('--depth', Math.min((level - 1) * 0.28, 0.72));
  // celebratory ring of bubbles
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    particles.push({ kind: 'drop', x: W / 2, y: H * 0.42, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, r: rand(3, 7), life: 1.2, color: '255,225,130' });
  }
  $('#hudLevel').textContent = 'Lv' + level;
  $('#hudLevel').hidden = false;
  bumpHud($('#hudLevel'));
}

/* ────────────────────── BUBBLES ──────────────────────────────── */

const JELLY_TINTS = [
  [255, 150, 200], // pink
  [140, 195, 255], // blue
  [255, 255, 255], // deceptive white
];

function pickGiftKind() {
  if (mode === '2p') return srand() < 0.6 ? 'p10' : 'p25'; // versus: points only, fair fight
  const roll = srand();
  if (roll < 0.35) return 'p10';
  if (roll < 0.55) return 'p25';
  if (roll < 0.73) return 'frenzy';
  if (roll < 0.87) return 'slow';
  return 'shield';
}

function spawnBubble(yOffset = 0) {
  if (bubbles.length > 30) return;
  const d = difficulty();
  let type;
  if (srand() < 0.015) {
    type = 'gold'; // rare golden bubble — fast and worth +50
  } else if (fx.frenzyT > 0) {
    type = 'o2'; // FRENZY: everything is oxygen
  } else {
    const roll = srand();
    if (roll < d.o2) type = 'o2';
    else if (roll < d.o2 + d.jelly) type = 'jelly';
    else if (roll < d.o2 + d.jelly + d.gift) type = 'gift';
    else type = 'life';
  }

  const vmin = Math.min(W, H);
  const gold = type === 'gold';
  const r = gold
    ? clamp(srange(0.035, 0.05) * vmin, 22, 44)
    : clamp(srange(0.05, 0.085) * vmin, 26, 74);
  bubbles.push({
    type,
    x: srange(r + 6, W - r - 6),
    y: H + r + 10 + yOffset,
    r,
    vy: (0.121 * H + srange(-14, 24)) * d.speed * (gold ? 1.7 : type === 'jelly' ? jellySpeedMult() : 1),
    phase: srange(0, Math.PI * 2),
    wobAmp: srange(8, 26),
    wobSpd: srange(0.9, 1.7),
    tint: JELLY_TINTS[(srand() * JELLY_TINTS.length) | 0],
    giftKind: pickGiftKind(),
    popped: false,
  });
}

/* the boss — a huge jellyfish that crosses the screen; dodge it for +30.
   At Level 3 it becomes the FINAL BOSS: bigger, red, and it releases a
   pack of little vicious jellies as it passes the middle. */
function spawnBoss(isFinal) {
  const dir = srand() < 0.5 ? 1 : -1;
  const vmin = Math.min(W, H);
  const finalBoss = !!isFinal;
  const r = clamp((finalBoss ? 0.17 : 0.13) * vmin, finalBoss ? 90 : 64, finalBoss ? 150 : 110);
  bubbles.push({
    type: 'jelly',
    boss: true,
    finalBoss,
    released: false,
    x: dir === 1 ? -r - 20 : W + r + 20,
    y: srange(0.22, 0.5) * H,
    r,
    vx: dir * (W * 0.09) * bossSpeedMult(),
    vy: 0,
    phase: srange(0, Math.PI * 2),
    wobAmp: 20 + (level - 1) * 8, // bobs more wildly at higher levels
    wobSpd: 1.1 + (level - 1) * 0.3,
    tint: finalBoss ? [235, 70, 90] : [200, 120, 235], // final boss glows angry red
    giftKind: 'p10',
    popped: false,
  });
  banner(finalBoss ? '☠ FINAL BOSS JELLY ☠' : level >= 2 ? 'ANGRY BOSS JELLY!' : 'BOSS JELLY!', finalBoss ? '#ff7a8a' : '#e0a0ff');
  snd.boss();
}

/* a pack of tiny fast vicious jellies bursts from the final boss */
function releaseViciousPack(bx, by) {
  const n = 6;
  const vmin = Math.min(W, H);
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1) - 0.5) * Math.PI * 1.1; // fan downward-ish
    const sp = rand(0.16, 0.26) * H;
    const r = clamp(0.035 * vmin, 18, 34);
    bubbles.push({
      type: 'jelly',
      vicious: true,
      x: clamp(bx + rand(-30, 30), r, W - r),
      y: by + rand(-10, 10),
      r,
      vy: -Math.sin(a) * sp * 0.5 + rand(30, 90), // mostly rise, some spread
      vx: Math.cos(a) * sp * 0.4,
      drift: Math.cos(a) * 40,
      phase: rand(0, Math.PI * 2),
      wobAmp: rand(14, 30),
      wobSpd: rand(1.6, 2.6),
      tint: [255, 60, 70], // vicious red
      giftKind: 'p10',
      popped: false,
    });
  }
  banner('SWARM!', '#ff6a7a');
  snd.jelly();
}

/* pixel-art sprites drawn cell-by-cell on canvas */
const GIFT_SPR = {
  pal: { Y: '#ffd94a', P: '#ff8fa8', p: '#ff5d7e', W: 'rgba(255,255,255,0.85)' },
  rows: [
    '..Y..Y..',
    '..YYYY..',
    'PPPYYPPP',
    'pWpYYppp',
    'pppYYppp',
    'pppYYppp',
    'pppYYppp',
    'pppppppp',
  ],
};
const HEART_SPR = {
  pal: { R: '#ff3b5c', W: 'rgba(255,255,255,0.9)' },
  rows: [
    '.RR..RR.',
    'RWRRRRRR',
    'RRRRRRRR',
    '.RRRRRR.',
    '..RRRR..',
    '...RR...',
  ],
};

function drawSprite(spr, cx, cy, size) {
  const h = spr.rows.length;
  const w = spr.rows[0].length;
  const cell = size / Math.max(w, h);
  const ox = cx - (w * cell) / 2;
  const oy = cy - (h * cell) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = spr.pal[spr.rows[y][x]];
      if (!c) continue;
      ctx2d.fillStyle = c;
      ctx2d.fillRect(ox + x * cell, oy + y * cell, cell + 0.35, cell + 0.35);
    }
  }
}

function drawBubbleBase(b, fill) {
  const g = ctx2d.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.1, b.x, b.y, b.r);
  g.addColorStop(0, `rgba(255,255,255,${fill + 0.22})`);
  g.addColorStop(0.55, `rgba(255,255,255,${fill})`);
  g.addColorStop(1, `rgba(255,255,255,${fill * 0.35})`);
  ctx2d.beginPath();
  ctx2d.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx2d.fillStyle = g;
  ctx2d.fill();
  ctx2d.lineWidth = 2;
  ctx2d.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx2d.stroke();
  // glossy highlight
  ctx2d.beginPath();
  ctx2d.ellipse(b.x - b.r * 0.35, b.y - b.r * 0.42, b.r * 0.22, b.r * 0.13, -0.6, 0, Math.PI * 2);
  ctx2d.fillStyle = 'rgba(255,255,255,0.85)';
  ctx2d.fill();
}

function drawBubble(b, t) {
  ctx2d.save();
  if (b.type === 'o2') {
    drawBubbleBase(b, 0.26);
    // pixel-font O2 — big O, small lowered 2 (Press Start 2P has no subscript glyph)
    const fs = Math.round(b.r * 0.48);
    ctx2d.fillStyle = 'rgba(255,255,255,0.95)';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.shadowColor = 'rgba(30,106,134,0.6)';
    ctx2d.shadowBlur = 6;
    ctx2d.font = `${fs}px 'Press Start 2P', monospace`;
    ctx2d.fillText('O', b.x - fs * 0.32, b.y);
    ctx2d.font = `${Math.round(fs * 0.62)}px 'Press Start 2P', monospace`;
    ctx2d.fillText('2', b.x + fs * 0.45, b.y + fs * 0.32);
  } else if (b.type === 'gold') {
    // golden bubble — a shiny gold coin, fast, +50
    const g = ctx2d.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.1, b.x, b.y, b.r);
    g.addColorStop(0, 'rgba(255,246,205,0.55)');
    g.addColorStop(1, 'rgba(226,158,32,0.2)');
    ctx2d.beginPath();
    ctx2d.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx2d.fillStyle = g;
    ctx2d.fill();
    ctx2d.lineWidth = 2.5;
    ctx2d.strokeStyle = 'rgba(255,235,150,0.95)';
    ctx2d.stroke();
    if (!drawImageBubble(IMG.coin, b.x, b.y, b.r * 1.5)) {
      ctx2d.fillStyle = '#ffd94a';
      ctx2d.font = `${Math.round(b.r)}px serif`;
      ctx2d.textAlign = 'center'; ctx2d.textBaseline = 'middle';
      ctx2d.fillText('🪙', b.x, b.y);
    }
  } else if (b.type === 'jelly') {
    const [cr, cg, cb] = b.tint;
    // tentacles first (peek from under the bubble)
    ctx2d.strokeStyle = `rgba(${cr},${cg},${cb},${b.boss ? 0.55 : 0.4})`;
    ctx2d.lineWidth = b.boss ? 3.4 : 2.4;
    ctx2d.lineCap = 'round';
    for (let i = b.boss ? -2.5 : -1.5; i <= (b.boss ? 2.5 : 1.5); i++) {
      const tx = b.x + i * b.r * 0.32;
      ctx2d.beginPath();
      ctx2d.moveTo(tx, b.y + b.r * 0.72);
      const sway = Math.sin(t * 3 + b.phase + i) * b.r * 0.16;
      ctx2d.quadraticCurveTo(tx + sway, b.y + b.r * 1.15, tx - sway * 0.6, b.y + b.r * 1.5);
      ctx2d.stroke();
    }
    drawBubbleBase(b, 0.14);
    // sneaky colour glow inside
    const g = ctx2d.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 0.85);
    g.addColorStop(0, `rgba(${cr},${cg},${cb},0.34)`);
    g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx2d.beginPath();
    ctx2d.arc(b.x, b.y, b.r * 0.85, 0, Math.PI * 2);
    ctx2d.fillStyle = g;
    ctx2d.fill();
    // eyes
    const angry = level >= 2 || b.boss; // from level 2 the jellies get mad
    const ey = b.y + b.r * 0.05;
    const ex = b.r * 0.2;
    ctx2d.fillStyle = angry ? 'rgba(40,40,70,0.65)' : 'rgba(60,60,90,0.35)';
    ctx2d.beginPath();
    ctx2d.arc(b.x - ex, ey, b.r * 0.055, 0, Math.PI * 2);
    ctx2d.arc(b.x + ex, ey, b.r * 0.055, 0, Math.PI * 2);
    ctx2d.fill();
    if (angry) {
      // angry eyebrows — slanted toward the nose
      ctx2d.strokeStyle = 'rgba(40,40,70,0.8)';
      ctx2d.lineWidth = Math.max(2, b.r * 0.05);
      ctx2d.lineCap = 'round';
      const by = b.y - b.r * 0.12;
      ctx2d.beginPath();
      ctx2d.moveTo(b.x - ex - b.r * 0.14, by - b.r * 0.1);
      ctx2d.lineTo(b.x - ex + b.r * 0.1, by + b.r * 0.04);
      ctx2d.moveTo(b.x + ex + b.r * 0.14, by - b.r * 0.1);
      ctx2d.lineTo(b.x + ex - b.r * 0.1, by + b.r * 0.04);
      ctx2d.stroke();
    }
  } else {
    drawBubbleBase(b, 0.18);
    if (b.type === 'gift') {
      if (!drawImageBubble(IMG.treasure, b.x, b.y, b.r * 1.5)) drawSprite(GIFT_SPR, b.x, b.y, b.r * 1.15);
    } else {
      if (!drawImageBubble(IMG.heart, b.x, b.y, b.r * 1.35)) drawSprite(HEART_SPR, b.x, b.y, b.r * 1.05);
    }
  }
  ctx2d.restore();
}

/* ──────────────────── POP EFFECTS ────────────────────────────── */

function burst(x, y, r, color) {
  particles.push({ kind: 'ring', x, y, r: r * 0.6, max: r * 1.9, life: 1, color });
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
    const sp = rand(90, 260);
    particles.push({
      kind: 'drop', x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
      r: rand(2, 5.5), life: 1, color,
    });
  }
}

function floatText(x, y, txt, color) {
  texts.push({ x, y, txt, color, life: 1 });
}

function bumpHud(el) {
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

const multiplier = () => (combo >= 20 ? 4 : combo >= 10 ? 3 : combo >= 5 ? 2 : 1);

/** Credit points to the run — or to the correct player in 2P versus. */
function addPoints(n, b) {
  if (mode === '2p') {
    const side = b.x < W / 2 ? 0 : 1;
    scores[side] = Math.max(0, scores[side] + n);
    const el = side === 0 ? $('#hudScore') : $('#hudBest');
    el.textContent = scores[side];
    bumpHud(el);
  } else {
    score = Math.max(0, score + n);
    $('#hudScore').textContent = score;
    bumpHud($('#hudScore'));
    if (n > 0) {
      checkLevel();
      if (!won && score >= WIN_SCORE) { won = true; winGame(); }
    }
  }
}

function popBubble(b) {
  if (b.popped) return;
  b.popped = true;

  if (b.type === 'o2' || b.type === 'gold') {
    combo++;
    comboTimer = 1.6;
    bestCombo = Math.max(bestCombo, combo);
    if (combo === 5) banner('COMBO x2!', '#ffe08a');
    else if (combo === 10) banner('COMBO x3!', '#ffd94a');
    else if (combo === 20) banner('COMBO x4!', '#ffb340');
    const mult = multiplier();
    const pts = (b.type === 'gold' ? 50 : 5) * mult;
    stats.pops++;
    if (b.type === 'gold') {
      stats.gold++;
      snd.gold();
      burst(b.x, b.y, b.r, '255,215,80');
    } else {
      snd.pop(combo);
      burst(b.x, b.y, b.r, '255,255,255');
    }
    addPoints(pts, b);
    floatText(b.x, b.y, `+${pts}${mult > 1 ? ' x' + mult : ''}`, b.type === 'gold' ? '#ffd94a' : '#ffffff');
  } else if (b.type === 'jelly') {
    combo = 0;
    stats.jellies++;
    burst(b.x, b.y, b.r, `${b.tint[0]},${b.tint[1]},${b.tint[2]}`);
    if (mode === '2p') {
      snd.jelly();
      skullFlash();
      addPoints(-25, b);
      floatText(b.x, b.y, '-25', '#ff6a7a');
    } else if (fx.shield) {
      fx.shield = false;
      snd.shieldBreak();
      banner('SHIELD SAVED YOU!', '#9fd8ff');
      renderLives();
    } else {
      lives--;
      snd.jelly();
      skullFlash();
      renderLives();
      if (lives <= 0) { endGame(); return; }
    }
  } else if (b.type === 'gift') {
    stats.pops++;
    burst(b.x, b.y, b.r, '255,215,130');
    const kind = b.giftKind;
    if (kind === 'p10' || kind === 'p25') {
      const v = kind === 'p10' ? 10 : 25;
      snd.gift();
      addPoints(v, b);
      floatText(b.x, b.y, '+' + v, '#ffd982');
    } else if (kind === 'frenzy') {
      fx.frenzyT = 6;
      snd.frenzy();
      banner('FRENZY!', '#ffd94a');
    } else if (kind === 'slow') {
      fx.slowT = 6;
      snd.slow();
      banner('SLOW-MO!', '#9fd8ff');
    } else {
      fx.shield = true;
      snd.shield();
      banner('SHIELD!', '#9fd8ff');
      renderLives();
    }
  } else {
    stats.pops++;
    lives = Math.min(MAX_LIVES, lives + 1);
    snd.life();
    burst(b.x, b.y, b.r, '255,150,190');
    floatText(b.x, b.y, '+1 ♥', '#ff9ec2');
    renderLives(true);
  }
}

let bannerT = 0;
function banner(text, color = '#fff') {
  const el = $('#banner');
  el.textContent = text;
  el.style.color = color;
  el.hidden = false;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(bannerT);
  bannerT = setTimeout(() => { el.hidden = true; }, 1500);
}

let toastT = 0;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2200);
}

function skullFlash() {
  const el = $('#skullFlash');
  el.hidden = false;
  el.style.animation = 'none';
  el.querySelector('.skull').style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  el.querySelector('.skull').style.animation = '';
  clearTimeout(skullFlash.t);
  skullFlash.t = setTimeout(() => { el.hidden = true; }, 700);
}

const SHIELD_SVG =
  '<svg viewBox="0 0 8 8" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">' +
  '<g fill="#8fd4ff"><rect x="1" y="0" width="6" height="1"/><rect x="1" y="1" width="6" height="3"/>' +
  '<rect x="2" y="4" width="4" height="2"/><rect x="3" y="6" width="2" height="1"/></g>' +
  '<rect x="3" y="1" width="1" height="3" fill="#e8f7ff"/></svg>';

function renderLives(gained) {
  const wrap = $('#hudLives');
  const slots = Math.max(3, lives);
  wrap.innerHTML = '';
  for (let i = 0; i < slots; i++) {
    const s = document.createElement('span');
    s.className = 'heart' + (i >= lives ? ' lost' : '');
    if (gained && i === lives - 1) s.classList.add('gain');
    s.innerHTML = heartSVG(i < lives);
    wrap.appendChild(s);
  }
  if (fx.shield) {
    const s = document.createElement('span');
    s.className = 'heart gain';
    s.innerHTML = SHIELD_SVG;
    wrap.appendChild(s);
  }
}

/* ─────────────────── INPUT : TOUCH & HANDS ───────────────────── */

function popAt(x, y, slack = 12) {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    if (b.popped) continue;
    const dx = x - b.x, dy = y - b.y;
    if (dx * dx + dy * dy <= (b.r + slack) * (b.r + slack)) {
      popBubble(b);
      return true;
    }
  }
  return false;
}

canvas.addEventListener('pointerdown', (e) => {
  if (!running) return;
  popAt(e.clientX, e.clientY, 14);
});

/* MediaPipe Tasks Vision — hand landmarker only, fully self-hosted
   (no third-party CDN at runtime; files pinned in vendor/). */
const VISION_BASE = './vendor/tasks-vision';
const HAND_MODEL = `${VISION_BASE}/hand_landmarker.task`;

async function preloadVision() {
  if (preloadVision.started) return;
  preloadVision.started = true;
  try {
    const vision = await import(`${VISION_BASE}/vision_bundle.mjs`);
    const fileset = await vision.FilesetResolver.forVisionTasks(`${VISION_BASE}/wasm`);

    const build = (delegate) =>
      vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

    try {
      handLandmarker = await build('GPU');
    } catch (e) {
      console.warn('GPU delegate unavailable, falling back to CPU', e);
      handLandmarker = await build('CPU');
    }
    visionReady = true;
  } catch (e) {
    console.warn('Vision models failed to load — touch mode only', e);
  }
}

/** Map a normalized video landmark to screen px (mirrored, object-fit: cover). */
function videoToScreen(nx, ny) {
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const scale = Math.max(W / vw, H / vh);
  const dw = vw * scale, dh = vh * scale;
  const ox = (W - dw) / 2, oy = (H - dh) / 2;
  return { x: W - (ox + nx * dw), y: oy + ny * dh };
}

function onHands(res) {
  const found = (res.landmarks || []).map((lm) => videoToScreen(lm[8].x, lm[8].y)); // index fingertips
  // smooth against previous cursors
  pointers = found.map((p, i) => {
    const prev = pointers[i];
    return prev
      ? { x: lerp(prev.x, p.x, 0.55), y: lerp(prev.y, p.y, 0.55) }
      : p;
  });
}

function handLoop() {
  if (!handLoopOn) return;
  if (visionReady && camStream && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    try {
      onHands(handLandmarker.detectForVideo(video, performance.now()));
    } catch (e) { /* skip frame */ }
  }
  requestAnimationFrame(handLoop);
}

/* ───────────────────── CAMERA SETUP ──────────────────────────── */

async function startCamera() {
  const notice = $('#camNotice');
  const text = $('#camNoticeText');
  const btnTouch = $('#btnTouchMode');
  notice.hidden = false;
  btnTouch.hidden = true;
  text.textContent = 'Your browser will ask for camera access — that’s how you dive in! 🫧';

  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = camStream;
    await video.play().catch(() => {});
    video.classList.add('live');
    screens.game.classList.remove('no-cam');
    notice.hidden = true;
    lastVideoTime = -1;
    handLoopOn = true;
    handLoop();
  } catch (err) {
    camStream = null;
    screens.game.classList.add('no-cam');
    text.textContent = 'Camera unavailable — but you can still pop bubbles by tapping!';
    btnTouch.hidden = false;
    await new Promise((res) => {
      btnTouch.onclick = () => { snd.click(); notice.hidden = true; res(); };
    });
  }
}

function stopCamera() {
  handLoopOn = false;
  if (camStream) {
    camStream.getTracks().forEach((t) => t.stop());
    camStream = null;
  }
  video.classList.remove('live');
  video.srcObject = null;
  pointers = [];
}

/* ─────────────────────── FISH & DUST ─────────────────────────── */

const FISH_SRC = [
  'assets/fish/fish1.png',
  'assets/fish/fish2.png',
  'assets/fish/fish3.png',
  'assets/fish/fish4.png',
  'assets/fish/fish5.png', // seahorse (portrait)
];
// warm the browser cache so the first fish doesn't pop in blank
FISH_SRC.forEach((src) => { const im = new Image(); im.src = src; });

function spawnFish() {
  const idx = (Math.random() * FISH_SRC.length) | 0;
  const f = document.createElement('img');
  f.className = 'fish';
  f.src = FISH_SRC[idx];
  f.alt = '';
  const dir = Math.random() < 0.5 ? 1 : -1;
  const w = rand(55, 110) * (idx === 4 ? 0.55 : 1); // seahorse is tall & skinny
  f.style.width = Math.round(w) + 'px';
  f.style.top = rand(12, 70) + 'vh';
  // the photos face RIGHT — flip when swimming left
  f.style.setProperty('--fdir', dir);
  f.style.setProperty('--fx0', (dir === 1 ? -15 : 115) + 'vw');
  f.style.setProperty('--fx1', (dir === 1 ? 115 : -15) + 'vw');
  f.style.setProperty('--fy1', rand(-8, 8) + 'vh');
  f.style.animationDuration = rand(9, 19) + 's';
  f.addEventListener('animationend', () => f.remove());
  fishLayer.appendChild(f);
}

function initDust() {
  dust = [];
  for (let i = 0; i < 42; i++) {
    dust.push({ x: rand(0, W), y: rand(0, H), r: rand(0.7, 2.4), v: rand(4, 16), drift: rand(-6, 6) });
  }
}

/* ─────────────────────── GAME LOOP ───────────────────────────── */

function update(dtReal, t) {
  // slow-mo bends game time but not real time (timers/effects use real dt)
  const slowFactor = fx.slowT > 0 ? 0.45 : 1;
  const dt = dtReal * slowFactor;

  elapsed += dt;
  const d = difficulty();

  // timed power-ups
  if (fx.frenzyT > 0) fx.frenzyT -= dtReal;
  if (fx.slowT > 0) fx.slowT -= dtReal;

  // combo decay
  if (comboTimer > 0) {
    comboTimer -= dtReal;
    if (comboTimer <= 0 && combo > 0) combo = 0;
  }

  // 2P match clock
  if (mode === '2p') {
    matchTime -= dtReal;
    $('#matchClock').textContent = Math.max(0, Math.ceil(matchTime));
    if (matchTime <= 0) { endGame(); return; }
  } else {
    // depth/darkening is driven by the level system (see onLevelUp).
    // a boss guards each milestone — it appears as you close in on the
    // next level-up (or the win), never at random.
    if (!bubbles.some((b) => b.boss)) {
      for (const m of MILESTONES) {
        if (!bossDone.has(m) && score >= m - BOSS_PROXIMITY) {
          bossDone.add(m);
          spawnBoss(m === WIN_SCORE);
          break;
        }
      }
    }
  }

  spawnTimer -= dt * 1000;
  if (spawnTimer <= 0) {
    spawnBubble();
    spawnTimer = d.spawnMs * rand(0.8, 1.2);
  }

  fishTimer -= dtReal;
  if (fishTimer <= 0) {
    spawnFish();
    if (Math.random() < 0.35) spawnFish(); // sometimes a pair swims by
    fishTimer = rand(1.1, 2.6);
  }

  for (const b of bubbles) {
    if (b.boss) {
      b.x += b.vx * dt;
      b.y += Math.sin(t * 1.1 + b.phase) * 20 * dt;
      // final boss unleashes its vicious pack as it reaches mid-screen
      if (b.finalBoss && !b.released && Math.abs(b.x - W / 2) < W * 0.12) {
        b.released = true;
        releaseViciousPack(b.x, b.y + b.r * 0.6);
      }
      // dodged the boss? (fully crossed without being popped)
      if ((b.vx > 0 && b.x > W + b.r + 20) || (b.vx < 0 && b.x < -b.r - 20)) {
        if (!b.popped) {
          b.popped = true;
          stats.dodged++;
          addPoints(30, { x: W / 2 });
          banner('DODGED! +30', '#9dffa8');
          snd.dodge();
        }
      }
    } else if (b.vicious) {
      // little vicious jellies drift outward and rise fast
      b.y -= b.vy * dt;
      b.x += (b.drift + Math.sin(t * b.wobSpd + b.phase) * b.wobAmp) * dt;
      b.x = clamp(b.x, b.r * 0.6, W - b.r * 0.6);
    } else {
      b.y -= b.vy * dt;
      b.x += Math.sin(t * b.wobSpd + b.phase) * b.wobAmp * dt;
      b.x = clamp(b.x, b.r * 0.6, W - b.r * 0.6);
    }
  }
  bubbles = bubbles.filter((b) => !b.popped && (b.boss || b.y > -b.r - 40));

  // fingertip popping — works with both hands at once
  for (const p of pointers) popAt(p.x, p.y, 12);

  for (const pt of particles) {
    if (pt.kind === 'drop') {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy -= 140 * dt; // buoyancy — droplets float up
      pt.life -= dt * 1.8;
    } else {
      pt.r = lerp(pt.r, pt.max, dt * 10);
      pt.life -= dt * 2.6;
    }
  }
  particles = particles.filter((p) => p.life > 0);

  for (const tx of texts) { tx.y -= 55 * dt; tx.life -= dt * 1.1; }
  texts = texts.filter((tx) => tx.life > 0);

  for (const s of dust) {
    s.y -= s.v * dt;
    s.x += s.drift * dt;
    if (s.y < -4) { s.y = H + 4; s.x = rand(0, W); }
  }
}

function draw(t) {
  ctx2d.clearRect(0, 0, W, H);

  ctx2d.fillStyle = 'rgba(255,255,255,0.16)';
  for (const s of dust) {
    ctx2d.beginPath();
    ctx2d.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx2d.fill();
  }

  for (const b of bubbles) {
    if (!b.popped) drawBubble(b, t);
  }

  for (const pt of particles) {
    if (pt.kind === 'ring') {
      ctx2d.beginPath();
      ctx2d.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx2d.strokeStyle = `rgba(${pt.color},${pt.life * 0.8})`;
      ctx2d.lineWidth = 3;
      ctx2d.stroke();
    } else {
      ctx2d.beginPath();
      ctx2d.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx2d.fillStyle = `rgba(${pt.color},${pt.life * 0.9})`;
      ctx2d.fill();
    }
  }

  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  for (const tx of texts) {
    ctx2d.font = `${clamp(W * 0.03, 14, 22)}px 'Press Start 2P', monospace`;
    ctx2d.fillStyle = tx.color;
    ctx2d.globalAlpha = clamp(tx.life, 0, 1);
    ctx2d.shadowColor = 'rgba(0,0,0,0.5)';
    ctx2d.shadowBlur = 8;
    ctx2d.fillText(tx.txt, tx.x, tx.y);
    ctx2d.globalAlpha = 1;
    ctx2d.shadowBlur = 0;
  }

  drawCursors();

  // power-up screen tints
  if (fx.frenzyT > 0) {
    ctx2d.fillStyle = `rgba(255,200,60,${0.06 + Math.sin(t * 8) * 0.03})`;
    ctx2d.fillRect(0, 0, W, H);
  }
  if (fx.slowT > 0) {
    ctx2d.fillStyle = 'rgba(90,170,255,0.08)';
    ctx2d.fillRect(0, 0, W, H);
  }

  // combo meter (solo) — a little pill under the score
  if (mode !== '2p' && combo >= 2) {
    const m = multiplier();
    ctx2d.font = `${clamp(W * 0.028, 12, 18)}px 'Press Start 2P', monospace`;
    ctx2d.textAlign = 'left';
    ctx2d.textBaseline = 'top';
    ctx2d.fillStyle = m >= 3 ? '#ffb340' : m >= 2 ? '#ffe08a' : '#ffffff';
    ctx2d.shadowColor = 'rgba(0,0,0,0.6)';
    ctx2d.shadowBlur = 6;
    const bx = Math.max(20, W * 0.02);
    ctx2d.fillText(`${combo} COMBO${m > 1 ? '  x' + m : ''}`, bx, 86);
    ctx2d.shadowBlur = 0;
  }
}

/** Glowing fingertip cursors — one per detected hand. */
function drawCursors() {
  for (const p of pointers) {
    const g = ctx2d.createRadialGradient(p.x, p.y, 2, p.x, p.y, 26);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.4, 'rgba(180,235,255,0.45)');
    g.addColorStop(1, 'rgba(180,235,255,0)');
    ctx2d.beginPath();
    ctx2d.arc(p.x, p.y, 26, 0, Math.PI * 2);
    ctx2d.fillStyle = g;
    ctx2d.fill();
    ctx2d.beginPath();
    ctx2d.arc(p.x, p.y, 15, 0, Math.PI * 2);
    ctx2d.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx2d.lineWidth = 2.5;
    ctx2d.stroke();
  }
}

function frame(now) {
  if (!running) return;
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  update(dt, now / 1000);
  draw(now / 1000);
  rafId = requestAnimationFrame(frame);
}

/* ──────────────── GAME START / END / RESET ───────────────────── */

async function countdown() {
  const el = $('#countdown');
  el.hidden = false;

  // show fingertip cursors during the countdown so players can see
  // hand tracking is live before the bubbles arrive
  let preview = true;
  (function previewLoop() {
    if (!preview) return;
    ctx2d.clearRect(0, 0, W, H);
    drawCursors();
    requestAnimationFrame(previewLoop);
  })();

  for (const n of ['3', '2', '1', 'GO!']) {
    el.innerHTML = `<span>${n}</span>`;
    snd.count(n === 'GO!');
    await wait(n === 'GO!' ? 700 : 850);
  }
  preview = false;
  el.hidden = true;
}

function resetState() {
  score = 0;
  scores = [0, 0];
  lives = 3;
  elapsed = 0;
  spawnTimer = 400;
  fishTimer = 0.15;
  bubbles = [];
  particles = [];
  texts = [];
  combo = 0;
  comboTimer = 0;
  bestCombo = 0;
  zoneIdx = 0;
  level = 1;
  won = false;
  bossDone = new Set();
  bossTimer = rand(30, 42);
  matchTime = MATCH_SECONDS;
  fx.frenzyT = 0; fx.slowT = 0; fx.shield = false;
  stats = { pops: 0, jellies: 0, gold: 0, dodged: 0 };
  screens.game.style.setProperty('--depth', 0);
  $('#hudLevel').hidden = true;
  if (mode === '2p') seedForMatch();
  else if (dailyMode) seedDaily();
  else srand = Math.random;

  // HUD swaps between solo and versus layouts
  screens.game.classList.toggle('is-2p', mode === '2p');
  if (mode === '2p') {
    $('#hudScoreLabel').textContent = 'P1';
    $('#hudBestLabel').textContent = 'P2';
    $('#hudScore').textContent = '0';
    $('#hudBest').textContent = '0';
  } else {
    $('#hudScoreLabel').textContent = 'SCORE';
    $('#hudBestLabel').textContent = 'BEST';
    $('#hudScore').textContent = '0';
    $('#hudBest').textContent = getBest();
  }
  $('#matchClockChip').hidden = mode !== '2p';
  $('#hudLives').style.display = mode === '2p' ? 'none' : '';
  $('#gameOver').hidden = true;
  renderLives();
}

let dailyMode = false;
function seedForMatch() {
  // shared RNG per match so both players face the same bubbles
  let h = (Date.now() / 1000) | 0;
  srand = mulberry32(h);
}

function beginRun() {
  // opening burst so the sea is alive from the first second
  spawnBubble(0);
  spawnBubble(H * 0.14);
  spawnBubble(H * 0.28);
  spawnTimer = 350;
  running = true;
  lastT = performance.now();
  rafId = requestAnimationFrame(frame);
  music.start('game');
  updatePauseIcon();
}

async function startGame() {
  resizeCanvas();
  initDust();
  resetState();
  fishLayer.innerHTML = '';
  await startCamera();
  await countdown();
  beginRun();
}

/** Persist a finished solo run; returns { best, isRecord }. */
function saveRun() {
  const best = getBest();
  const isRecord = score > best;
  if (isRecord) localStorage.setItem(BEST_KEY, String(score));

  const top = getTop5();
  top.push({ score, date: new Date().toISOString().slice(0, 10) });
  top.sort((a, b) => b.score - a.score);
  localStorage.setItem(TOP5_KEY, JSON.stringify(top.slice(0, 5)));
  return { best, isRecord };
}

function endGame() {
  running = false;
  userPaused = false;
  cancelAnimationFrame(rafId);
  music.stop();

  if (mode === '2p') return endMatch();

  const { best, isRecord } = saveRun();
  if (isRecord) snd.record(); else snd.over();

  const card = $('#gameOver .go-card');
  if (card) card.classList.remove('win');
  $('#goTitle').textContent = 'GAME OVER';
  $('#goSub').textContent = 'The jellyfish got you…';
  $('#goScore').textContent = score;
  $('#goBest').textContent = Math.max(best, score);
  $('#goRecord').hidden = !isRecord;
  renderShare(score);
  setTimeout(() => { $('#gameOver').hidden = false; }, 750);
}

/** Reached the win score — a grand victory. */
function winGame() {
  running = false;
  userPaused = false;
  cancelAnimationFrame(rafId);
  music.stop();
  snd.victory();

  const { best, isRecord } = saveRun();

  // grand celebration: rising bubbles + confetti burst
  bubbleWash();
  confettiBurst();

  const card = $('#gameOver .go-card');
  if (card) card.classList.add('win');
  $('#goTitle').textContent = 'YOU SURVIVED!';
  $('#goSub').textContent = 'You conquered the deep — legend! 🏆';
  $('#goScore').textContent = score;
  $('#goBest').textContent = Math.max(best, score);
  $('#goRecord').hidden = !isRecord;
  renderShare(score);
  setTimeout(() => { $('#gameOver').hidden = false; }, 1600);
}

/* colourful confetti rain for the victory screen */
function confettiBurst() {
  const layer = $('#confetti');
  layer.innerHTML = '';
  const colors = ['#ffd94a', '#29abf5', '#ff6a7a', '#3fae6a', '#e0619b', '#fff'];
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('i');
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[(Math.random() * colors.length) | 0];
    c.style.setProperty('--dx', (Math.random() * 2 - 1) * 30 + 'vw');
    c.style.animationDelay = Math.random() * 0.8 + 's';
    c.style.animationDuration = 1.8 + Math.random() * 1.6 + 's';
    layer.appendChild(c);
  }
  setTimeout(() => { layer.innerHTML = ''; }, 4000);
}

function endMatch() {
  const p1 = scores[0], p2 = scores[1];
  const winner = p1 === p2 ? 'TIE!' : p1 > p2 ? 'PLAYER 1 WINS!' : 'PLAYER 2 WINS!';
  snd.record();
  $('#goTitle').textContent = winner;
  $('#goSub').textContent = `P1 ${p1}  ·  P2 ${p2}`;
  $('#goScore').textContent = p1;
  $('#goBest').textContent = p2;
  $('#goRecord').hidden = true;
  renderShare(Math.max(p1, p2));
  setTimeout(() => { $('#gameOver').hidden = false; }, 700);
}

function renderShare(sc) {
  const btn = $('#btnShare');
  btn.onclick = async () => {
    snd.click();
    const url = location.origin + location.pathname;
    const text = `I scored ${sc} in Bubble PoP! 🫧 Can you beat me? ${url}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Bubble PoP', text, url });
      else { await navigator.clipboard.writeText(text); toast('Score copied — paste it to a friend!'); }
    } catch (e) { /* user cancelled */ }
  };
}

/* ─────────────────── PAUSE / RESUME ──────────────────────────── */

let userPaused = false;

function pauseGame() {
  if (running !== true) return;
  running = 'paused';
  cancelAnimationFrame(rafId);
  music.stop();
  screens.game.classList.add('is-paused');
  $('#pausedOverlay').hidden = false;
  updatePauseIcon();
}

function resumeGame() {
  if (running !== 'paused') return;
  screens.game.classList.remove('is-paused');
  $('#pausedOverlay').hidden = true;
  running = true;
  lastT = performance.now();
  rafId = requestAnimationFrame(frame);
  music.start('game');
  updatePauseIcon();
}

function updatePauseIcon() {
  $('#btnPause').innerHTML = running === 'paused' ? ICON.play : ICON.pause;
}

/* ─────────────────────── WIRING ──────────────────────────────── */

$('#btnStart').addEventListener('click', async () => {
  snd.click();
  await bubbleWash(() => openInstructions());
});

function launch(chosenMode, daily) {
  mode = chosenMode;
  dailyMode = !!daily;
  music.stop();
  return bubbleWash(() => {
    showScreen('game');
    startGame();
  });
}

$('#btnPlay').addEventListener('click', () => { snd.click(); launch('1p', false); });
$('#btnDaily') && $('#btnDaily').addEventListener('click', () => { snd.click(); launch('1p', true); });
$('#btnVersus') && $('#btnVersus').addEventListener('click', () => { snd.click(); launch('2p', false); });

$('#btnRetry').addEventListener('click', async () => {
  snd.click();
  await bubbleWash(async () => {
    resetState();
    if (!camStream) await startCamera();
    await countdown();
    beginRun();
  });
});

$('#btnHome').addEventListener('click', async () => {
  snd.click();
  music.stop();
  await bubbleWash(() => {
    running = false;
    userPaused = false;
    cancelAnimationFrame(rafId);
    stopCamera();
    $('#gameOver').hidden = true;
    showScreen('home');
    revealHomeUi();
  });
});

/* sound toggle — one state, two buttons (menu + game HUD) */
function updateSoundIcons() {
  const icon = muted ? ICON.sndOff : ICON.sndOn;
  $('#btnMute').innerHTML = icon;
  $('#btnMuteMenu').innerHTML = icon;
}

function toggleMute() {
  muted = !muted;
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  updateSoundIcons();
  if (!muted) snd.click(); // little confirmation beep when unmuting
}

$('#btnMute').addEventListener('click', toggleMute);
$('#btnMuteMenu').addEventListener('click', toggleMute);

$('#btnPause').addEventListener('click', () => {
  snd.click();
  if (running === true) {
    userPaused = true;
    pauseGame();
  } else if (running === 'paused') {
    userPaused = false;
    resumeGame();
  }
});

/* help popup — pauses the game while open */
let helpWasRunning = false;
$('#btnHelp').addEventListener('click', () => {
  snd.click();
  helpWasRunning = running === true;
  if (helpWasRunning) { userPaused = true; pauseGame(); }
  $('#helpPopup').hidden = false;
});
function closeHelp() {
  snd.click();
  $('#helpPopup').hidden = true;
  if (helpWasRunning) { userPaused = false; resumeGame(); }
  helpWasRunning = false;
}
$('#btnHelpClose').addEventListener('click', closeHelp);
$('#btnHelpResume').addEventListener('click', closeHelp);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseGame(); // no-op unless mid-run
  } else if (!userPaused) {
    resumeGame(); // auto-resume only if the pause wasn't the player's choice
  }
});

/* ─────────────────────── BOOT ────────────────────────────────── */

resizeCanvas();
$('#hudBest').textContent = getBest();
updateSoundIcons();
updatePauseIcon();
$('#btnHelp').innerHTML = ICON.bulb;

// fade the aquarium photo in once it's fully downloaded
const aquariumImg = new Image();
aquariumImg.onload = () => {
  document.querySelectorAll('.aquarium-bg').forEach((el) => el.classList.add('bg-loaded'));
};
aquariumImg.src = 'assets/aquarium.jpg';

// browsers unlock audio on the first user gesture — catch it wherever it lands
document.addEventListener('pointerdown', () => audio(), { once: true });

// wait for the scribble font so the letters render correctly, then play
if (document.fonts && document.fonts.ready) {
  Promise.race([document.fonts.ready, wait(900)]).then(() => playIntro());
} else {
  playIntro();
}
