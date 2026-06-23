// ===== Bubble Pop — hand-tracking bubble-popper =====
//
// Architecture overview:
//   - MediaPipe Hands runs its own loop, detects the hand each frame, and
//     writes the index-fingertip position into the shared `cursors` array.
//   - The game loop (requestAnimationFrame) reads `cursors`, updates physics,
//     checks collisions, and renders. The two are decoupled.

// --- DOM references ---
const video    = document.getElementById('video');
const canvas   = document.getElementById('canvas');
const ctx      = canvas.getContext('2d');
const overlay  = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const muteBtn  = document.getElementById('muteBtn');
const statusEl = document.getElementById('status');
const scoreEl  = document.getElementById('score');
const bestEl   = document.getElementById('best');
const timeEl   = document.getElementById('time');
const speedEl  = document.getElementById('speed');

// --- Canvas internal resolution (game coordinate space) ---
const W = 1280, H = 720;
canvas.width = W;
canvas.height = H;

// --- Game state machine ---
const State = { IDLE: 'idle', LOADING: 'loading', PLAYING: 'playing', PAUSED: 'paused' };
let state = State.IDLE;

// --- Round variables ---
let money = 0;
let best = Number(localStorage.getItem('bubble_best') || 0);
let elapsed = 0;          // seconds since round start (drives difficulty)
let lastTime = 0;         // timestamp of previous frame (for delta time)
let spawnTimer = 0;       // counts down to next bubble spawn
let muted = false;

// --- Entity pools ---
const bubbles   = [];     // falling bubbles
const floats    = [];     // floating "+$10" score popups
const particles = [];     // pop-burst particles
let   cursors   = [];     // fingertip positions, one per detected hand

bestEl.textContent = '$' + best;

// ===== Bubble definitions (weighted random) =====
// Each value has a relative `weight` — higher = more common.
const GREEN = [
  { value: 10,  weight: 45 },
  { value: 20,  weight: 30 },
  { value: 100, weight: 18 },
  { value: 500, weight: 3  },   // rare jackpot
];
const RED = [
  { value: -20,  weight: 50 },
  { value: -50,  weight: 32 },
  { value: -100, weight: 18 },
];
const GIFTS = [
  { label: '🎁', value: 25 },
  { label: '💎', value: 75 },
  { label: '⭐', value: 50 },
  { label: '🍀', value: 40 },
];

// How often each colour appears (green most common).
const CATEGORY = [
  { type: 'green', weight: 55 },
  { type: 'red',   weight: 30 },
  { type: 'blue',  weight: 15 },
];

function weightedPick(arr) {
  const total = arr.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const x of arr) { if ((r -= x.weight) <= 0) return x; }
  return arr[arr.length - 1];
}

// ===== Difficulty scaling (grows with elapsed time) =====
function difficulty() {
  return 1 + Math.min(elapsed / 25, 3.5);          // 1.0 → ~4.5 after ~90s
}
function fallSpeed() {
  return 90 * difficulty();                          // pixels per second
}
function spawnInterval() {
  return Math.max(0.35, 1.3 - elapsed * 0.012);      // seconds between spawns
}

// ===== Spawning =====
function spawnBubble() {
  const cat = weightedPick(CATEGORY).type;
  const r = cat === 'blue' ? 42 : 34 + Math.random() * 18;
  const x = r + Math.random() * (W - r * 2);
  let value, label, color, glow;

  if (cat === 'green') {
    const g = weightedPick(GREEN);
    value = g.value;
    label = '+$' + value;
    color = value >= 500 ? '#ffd54a' : '#2ecc71';    // gold for jackpot
    glow  = value >= 500 ? '#fff2a8' : '#7CFFB0';
  } else if (cat === 'red') {
    const rr = weightedPick(RED);
    value = rr.value;
    label = '-$' + Math.abs(value);
    color = '#ff4d5e';
    glow  = '#ff9aa6';
  } else {
    const gift = GIFTS[Math.floor(Math.random() * GIFTS.length)];
    value = gift.value;
    label = gift.label;
    color = '#3aa0ff';
    glow  = '#a8d6ff';
  }

  bubbles.push({
    x, y: -r, r,
    vy: fallSpeed() * (0.85 + Math.random() * 0.3),
    drift: (Math.random() - 0.5) * 30,               // gentle horizontal sway
    cat, value, label, color, glow,
    popped: false, pop: 0,
  });
}

// ===== Popping =====
function popBubble(b) {
  if (b.popped) return;
  b.popped = true;
  b.pop = 1;

  money += b.value;
  if (money > best) { best = money; localStorage.setItem('bubble_best', best); }

  floats.push({
    x: b.x, y: b.y,
    text: b.cat === 'blue' ? `${b.label} +$${b.value}` : b.label,
    color: b.value >= 0 ? (b.value >= 500 ? '#ffd54a' : '#7CFFB0') : '#ff8c98',
    life: 1,
  });

  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    particles.push({
      x: b.x, y: b.y,
      vx: Math.cos(a) * (80 + Math.random() * 120),
      vy: Math.sin(a) * (80 + Math.random() * 120),
      r: 3 + Math.random() * 3, color: b.color, life: 1,
    });
  }

  playSound(b.cat);
  updateHud();
}

// Collision: any fingertip inside a bubble (+tolerance) pops it.
function checkPops() {
  if (!cursors.length) return;
  for (const b of bubbles) {
    if (b.popped) continue;
    for (const c of cursors) {
      const dx = c.x - b.x, dy = c.y - b.y;
      if (dx * dx + dy * dy <= (b.r + 18) ** 2) { popBubble(b); break; }
    }
  }
}

// ===== Update (physics) =====
function update(dt) {
  elapsed += dt;
  spawnTimer -= dt;
  if (spawnTimer <= 0) { spawnBubble(); spawnTimer = spawnInterval(); }

  for (const b of bubbles) {
    if (b.popped) { b.pop -= dt * 4; continue; }
    b.y += b.vy * dt;
    b.x += b.drift * dt;
    if (b.x < b.r)      { b.x = b.r;     b.drift *= -1; }
    if (b.x > W - b.r)  { b.x = W - b.r; b.drift *= -1; }
  }
  checkPops();

  // Remove dead/off-screen entities.
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    if ((b.popped && b.pop <= 0) || b.y - b.r > H) bubbles.splice(i, 1);
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.y -= 40 * dt; f.life -= dt * 0.9;
    if (f.life <= 0) floats.splice(i, 1);
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; p.life -= dt * 1.6;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ===== Render =====
function drawVideoMirrored() {
  if (video.readyState >= 2) {
    ctx.save();
    ctx.translate(W, 0); ctx.scale(-1, 1);           // mirror (selfie view)
    ctx.drawImage(video, 0, 0, W, H);
    ctx.restore();
    ctx.fillStyle = 'rgba(6,10,24,0.35)';            // darken for contrast
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  }
}

function drawBubble(b) {
  const scale = b.popped ? 1 + (1 - b.pop) * 0.6 : 1;
  const alpha = b.popped ? Math.max(b.pop, 0) : 1;
  const r = b.r * scale;
  ctx.save();
  ctx.globalAlpha = alpha;

  const g = ctx.createRadialGradient(b.x - r*0.3, b.y - r*0.3, r*0.1, b.x, b.y, r);
  g.addColorStop(0, b.glow);
  g.addColorStop(1, b.color);
  ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
  ctx.fillStyle = g; ctx.shadowColor = b.glow; ctx.shadowBlur = 18; ctx.fill();
  ctx.shadowBlur = 0;

  // glossy highlight
  ctx.beginPath(); ctx.arc(b.x - r*0.32, b.y - r*0.34, r*0.28, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();

  // label
  ctx.fillStyle = b.cat === 'blue' ? '#fff' : '#04122b';
  ctx.font = `800 ${Math.round(r * (b.cat === 'blue' ? 0.9 : 0.55))}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(b.label, b.x, b.y + 1);
  ctx.restore();
}

function drawCursors() {
  for (const c of cursors) {
    ctx.beginPath(); ctx.arc(c.x, c.y, 22, 0, Math.PI*2);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
    ctx.shadowColor = '#7CFFB0'; ctx.shadowBlur = 16; ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(c.x, c.y, 5, 0, Math.PI*2);
    ctx.fillStyle = '#7CFFB0'; ctx.fill();
  }
}

function drawFx() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    ctx.fillStyle = p.color; ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const f of floats) {
    ctx.globalAlpha = Math.max(f.life, 0);
    ctx.font = '800 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function render() {
  drawVideoMirrored();
  for (const b of bubbles) drawBubble(b);
  drawFx();
  drawCursors();

  if (!cursors.length && state === State.PLAYING) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '600 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✋ Show your hand to the camera', W/2, H - 40);
  }
}

// ===== Main loop =====
function loop(ts) {
  requestAnimationFrame(loop);
  if (state !== State.PLAYING) { lastTime = ts; return; }
  const dt = Math.min((ts - lastTime) / 1000, 0.05);  // seconds, clamped
  lastTime = ts;
  update(dt);
  render();
}

// ===== HUD =====
function updateHud() {
  scoreEl.textContent = (money < 0 ? '-$' + Math.abs(money) : '$' + money);
  scoreEl.style.color = money < 0 ? '#ff4d5e' : '#2ecc71';
  bestEl.textContent = '$' + best;
}
function updateMeta() {
  timeEl.textContent = Math.floor(elapsed) + 's';
  speedEl.textContent = 'x' + difficulty().toFixed(1);
}
setInterval(() => { if (state === State.PLAYING) updateMeta(); }, 250);

// ===== Sound (WebAudio beeps) =====
let audioCtx = null;
function playSound(cat) {
  if (muted) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g); g.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  if (cat === 'red') {                 // descending buzz
    o.type = 'sawtooth'; o.frequency.setValueAtTime(180, now);
    o.frequency.exponentialRampToValueAtTime(80, now + 0.25);
  } else if (cat === 'blue') {         // sparkly rise
    o.type = 'triangle'; o.frequency.setValueAtTime(660, now);
    o.frequency.exponentialRampToValueAtTime(1320, now + 0.18);
  } else {                             // happy pop
    o.type = 'sine'; o.frequency.setValueAtTime(520, now);
    o.frequency.exponentialRampToValueAtTime(880, now + 0.12);
  }
  g.gain.setValueAtTime(0.18, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
  o.start(now); o.stop(now + 0.3);
}

// ===== Hand tracking (MediaPipe Hands) =====
let hands = null, camera = null, cameraStarted = false;

function onResults(results) {
  cursors = [];
  if (results.multiHandLandmarks) {
    for (const lm of results.multiHandLandmarks) {
      const tip = lm[8];                               // index fingertip
      cursors.push({ x: (1 - tip.x) * W, y: tip.y * H }); // mirror x to match view
    }
  }
}

async function startTracking() {
  statusEl.textContent = 'Loading hand-tracking model…';
  hands = new Hands({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });
  hands.onResults(onResults);

  camera = new Camera(video, {
    onFrame: async () => { await hands.send({ image: video }); },
    width: W, height: H,
  });
  await camera.start();
  cameraStarted = true;
}

// ===== Controls =====
async function startGame() {
  startBtn.disabled = true;
  state = State.LOADING;
  try {
    if (!cameraStarted) await startTracking();
  } catch (e) {
    statusEl.textContent = '⚠️ Camera/model failed. Allow camera access and open via http://localhost (not file://).';
    startBtn.disabled = false; state = State.IDLE;
    console.error(e);
    return;
  }
  // reset round
  money = 0; elapsed = 0; spawnTimer = 0;
  bubbles.length = floats.length = particles.length = 0;
  updateHud(); updateMeta();
  overlay.classList.add('hidden');
  pauseBtn.disabled = false;
  state = State.PLAYING;
  lastTime = performance.now();
}

pauseBtn.addEventListener('click', () => {
  if (state === State.PLAYING)      { state = State.PAUSED;  pauseBtn.textContent = '▶'; }
  else if (state === State.PAUSED)  { state = State.PLAYING; pauseBtn.textContent = '⏸'; lastTime = performance.now(); }
});

muteBtn.addEventListener('click', () => {
  muted = !muted;
  muteBtn.textContent = muted ? '🔇' : '🔊';
});

startBtn.addEventListener('click', startGame);

// Kick off the render loop (idles until state === PLAYING).
requestAnimationFrame(loop);
