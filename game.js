// ===== Bubble Pop — underwater O₂ survival (hand-tracking) =====
//
// The aquarium background image (from the Figma design) is shown on every
// screen via CSS; this canvas is a TRANSPARENT overlay that only draws the
// game entities (bubbles, jellyfish, cursor, effects). The webcam runs hidden
// and is used solely for MediaPipe hand tracking.
//
// Goal: pop rising O₂ bubbles to refill an oxygen meter that constantly
// drains. Avoid jellyfish — popping 3 ends the game, as does running out
// of O₂. Difficulty (rise speed + spawn rate) ramps up over time.

// ---------- DOM ----------
const video    = document.getElementById('video');
const canvas   = document.getElementById('canvas');
const ctx      = canvas.getContext('2d');
const hud      = document.getElementById('hud');
const o2Fill   = document.getElementById('o2Fill');
const strikeEls= [...document.querySelectorAll('.strike')];
const muteBtn  = document.getElementById('muteBtn');
const pauseBtn = document.getElementById('pauseBtn');

const startScreen  = document.getElementById('startScreen');
const instructions = document.getElementById('instructions');
const gameover     = document.getElementById('gameover');
const startBtn     = document.getElementById('startBtn');
const letsGoBtn    = document.getElementById('letsGoBtn');
const playAgainBtn = document.getElementById('playAgainBtn');
const statusEl     = document.getElementById('status');
const goReason     = document.getElementById('goReason');
const goTime       = document.getElementById('goTime');
const goBest       = document.getElementById('goBest');

// ---------- Canvas coordinate space (matches the 1200x896 Figma frame) ----------
const W = 1200, H = 896;
canvas.width = W; canvas.height = H;

// ---------- State machine ----------
const S = { START: 'start', INSTRUCT: 'instruct', PLAYING: 'playing',
            PAUSED: 'paused', WAVE: 'wave', GAMEOVER: 'gameover' };
let state = S.START;

// ---------- Tunables ----------
const O2_MAX     = 100;
const O2_REFILL  = 14;     // gained per O₂ bubble
const O2_PENALTY = 12;     // lost per jellyfish sting
const MAX_STRIKES= 3;

// Bubbles 20% bigger; initial rise speed 20% faster than the first build.
const O2_R_MIN = 46, O2_R_VAR = 18;   // radius 46..64
const JELLY_R_MIN = 46, JELLY_R_VAR = 16;
const BASE_SPEED = 108;               // px/s at difficulty 1.0

// Difficulty ramp — speeds the rise, spawns, and O₂ drain over time.
function difficulty()   { return 1 + Math.min(elapsed / 25, 3.5); }     // 1.0 -> ~4.5
function riseSpeed()    { return BASE_SPEED * difficulty(); }
function spawnInterval(){ return Math.max(0.40, 1.05 - elapsed * 0.012); }
function o2Drain()      { return 5.5 + difficulty() * 2.0; }            // per second
function jellyChance()  { return 0.18 + Math.min(elapsed * 0.003, 0.17); } // 0.18 -> 0.35

// ---------- Round vars ----------
let o2 = O2_MAX, strikes = 0, elapsed = 0, survived = 0;
let bestTime = Number(localStorage.getItem('bubblepop_best_time') || 0);
let lastTime = 0, tNow = 0, spawnTimer = 0, lowO2Timer = 0;
let muted = false, cameraStarted = false;
let goReasonKind = 'o2';

// ---------- Entity pools ----------
const bubbles   = [];   // O₂ bubbles + jellyfish
const floats    = [];   // floating "+O₂" / "Sting!" text
const particles = [];   // pop burst
let   cursors   = [];    // fingertip positions (per detected hand)

// Ambient background bubbles (subtle motion on every screen).
const ambient = Array.from({ length: 24 }, () => ({
  x: Math.random() * W, y: Math.random() * H,
  r: 2 + Math.random() * 6, sp: 16 + Math.random() * 42, ph: Math.random() * 7,
}));

// Game-over wave.
let waveTop = H, waveCols = [];

// ============================================================
//  SPAWNING
// ============================================================
function spawnEntity() {
  if (Math.random() < jellyChance()) spawnJelly();
  else spawnBubble();
}

function spawnBubble() {
  const r = O2_R_MIN + Math.random() * O2_R_VAR;
  bubbles.push({
    kind: 'o2',
    x: r + Math.random() * (W - r * 2), y: H + r,
    r, vy: riseSpeed() * (0.8 + Math.random() * 0.55),
    wobAmp: 12 + Math.random() * 26, wobFreq: 0.6 + Math.random() * 1.2,
    ph: Math.random() * 7, popped: false, pop: 0,
  });
}

function spawnJelly() {
  const r = JELLY_R_MIN + Math.random() * JELLY_R_VAR;
  const hues = [300, 285, 330, 195];
  bubbles.push({
    kind: 'jelly',
    x: r + Math.random() * (W - r * 2), y: H + r,
    r, vy: riseSpeed() * (0.5 + Math.random() * 0.35),
    wobAmp: 18 + Math.random() * 24, wobFreq: 0.4 + Math.random() * 0.8,
    ph: Math.random() * 7, hue: hues[(Math.random() * hues.length) | 0],
    popped: false, pop: 0,
  });
}

// ============================================================
//  POPPING + COLLISION
// ============================================================
function pop(b) {
  if (b.popped) return;
  b.popped = true; b.pop = 1;

  if (b.kind === 'o2') {
    o2 = Math.min(O2_MAX, o2 + O2_REFILL);
    floats.push({ x: b.x, y: b.y, text: '+O₂', color: '#7CFFB0', life: 1 });
    burst(b.x, b.y, 'rgba(150,240,255,0.95)');
    playPop();
  } else {
    strikes++;
    o2 = Math.max(0, o2 - O2_PENALTY);
    floats.push({ x: b.x, y: b.y, text: 'Sting!', color: '#ff8cc0', life: 1 });
    burst(b.x, b.y, `hsla(${b.hue},90%,80%,0.95)`);
    playCry();
    if (strikes >= MAX_STRIKES) return gameOver('jelly');
  }
}

function burst(x, y, color) {
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI * 2 * i) / 16;
    particles.push({
      x, y, vx: Math.cos(a) * (90 + Math.random() * 140),
      vy: Math.sin(a) * (90 + Math.random() * 140),
      r: 2 + Math.random() * 4, color, life: 1,
    });
  }
}

function checkPops() {
  if (!cursors.length) return;
  for (const b of bubbles) {
    if (b.popped) continue;
    for (const c of cursors) {
      const dx = c.x - b.x, dy = c.y - b.y;
      if (dx * dx + dy * dy <= (b.r + 16) ** 2) { pop(b); break; }
    }
  }
}

// ============================================================
//  UPDATE
// ============================================================
function updatePlay(dt) {
  elapsed += dt;
  survived = elapsed;

  // O₂ constantly drains.
  o2 -= o2Drain() * dt;
  if (o2 <= 0) { o2 = 0; updateHud(); return gameOver('o2'); }

  // Low-O₂ warning beep.
  if (o2 < 25) { lowO2Timer -= dt; if (lowO2Timer <= 0) { playWarn(); lowO2Timer = 0.7; } }

  // Spawn.
  spawnTimer -= dt;
  if (spawnTimer <= 0) { spawnEntity(); spawnTimer = spawnInterval(); }

  // Move entities upward with a gentle horizontal wobble.
  for (const b of bubbles) {
    if (b.popped) { b.pop -= dt * 4; continue; }
    b.ph += dt;
    b.y -= b.vy * dt;
    b.x += Math.cos(b.ph * b.wobFreq) * b.wobAmp * dt;
  }
  checkPops();

  // Cull popped / off the top.
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    if ((b.popped && b.pop <= 0) || b.y + b.r < -10) bubbles.splice(i, 1);
  }
  updateFloatsParticles(dt);
}

function updateFloatsParticles(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.y -= 46 * dt; f.life -= dt * 0.9;
    if (f.life <= 0) floats.splice(i, 1);
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 40 * dt; p.life -= dt * 1.5;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function updateAmbient(dt) {
  for (const a of ambient) {
    a.y -= a.sp * dt; a.ph += dt;
    if (a.y < -10) { a.y = H + 10; a.x = Math.random() * W; }
  }
}

function updateWave(dt) {
  waveTop -= 720 * dt;                       // froth climbs the screen
  updateFloatsParticles(dt);
  for (const b of bubbles) if (b.popped) b.pop -= dt * 4;
  if (waveTop < -80) finalizeGameOver();
}

// ============================================================
//  RENDER  (canvas is transparent; the aquarium shows through from CSS)
// ============================================================
function drawAmbient() {
  ctx.save();
  for (const a of ambient) {
    ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(a.x + Math.sin(a.ph) * 4, a.y, a.r, 0, 7);
    ctx.fillStyle = 'rgba(225,250,255,0.7)'; ctx.fill();
  }
  ctx.restore();
}

function drawO2Bubble(b) {
  const scale = b.popped ? 1 + (1 - b.pop) * 0.7 : 1;
  const a = b.popped ? Math.max(b.pop, 0) : 1;
  const r = b.r * scale;
  ctx.save(); ctx.globalAlpha = a;

  const g = ctx.createRadialGradient(b.x - r*0.35, b.y - r*0.35, r*0.1, b.x, b.y, r);
  g.addColorStop(0, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.5, 'rgba(190,245,255,0.22)');
  g.addColorStop(1, 'rgba(120,210,255,0.12)');
  ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 7); ctx.fillStyle = g; ctx.fill();

  ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();

  ctx.beginPath(); ctx.arc(b.x - r*0.34, b.y - r*0.36, r*0.18, 0, 7);
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
  ctx.beginPath(); ctx.arc(b.x + r*0.3, b.y + r*0.28, r*0.08, 0, 7);
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  ctx.font = `800 ${Math.round(r * 0.6)}px Rubik, system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,60,90,0.7)'; ctx.shadowBlur = 6;
  ctx.fillText('O₂', b.x, b.y + 1);
  ctx.restore();
}

function drawJelly(b) {
  const scale = b.popped ? 1 + (1 - b.pop) * 0.7 : 1;
  const a = (b.popped ? Math.max(b.pop, 0) : 1) * 0.96;
  const r = b.r * scale;
  const pulse = 1 + Math.sin(b.ph * 2) * 0.06;
  const cx = b.x, cy = b.y;
  ctx.save(); ctx.globalAlpha = a;

  // tentacles
  ctx.strokeStyle = `hsla(${b.hue},90%,82%,0.6)`; ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (let k = -2; k <= 2; k++) {
    const tx = cx + k * (r * 0.26);
    ctx.beginPath(); ctx.moveTo(tx, cy + r * 0.25);
    for (let s = 1; s <= 4; s++) {
      const yy = cy + r * 0.25 + s * (r * 0.30);
      const xx = tx + Math.sin(b.ph * 1.6 + s * 0.9 + k) * (r * 0.13);
      ctx.lineTo(xx, yy);
    }
    ctx.stroke();
  }

  // bell with scalloped bottom
  const bw = r * 0.82 * pulse, bh = r * 0.72 * pulse;
  const bell = ctx.createRadialGradient(cx, cy - bh*0.4, r*0.1, cx, cy, r);
  bell.addColorStop(0, `hsla(${b.hue},95%,90%,0.65)`);
  bell.addColorStop(1, `hsla(${b.hue},90%,72%,0.22)`);
  ctx.beginPath();
  ctx.moveTo(cx - bw, cy);
  ctx.quadraticCurveTo(cx - bw, cy - bh * 1.5, cx, cy - bh * 1.5);
  ctx.quadraticCurveTo(cx + bw, cy - bh * 1.5, cx + bw, cy);
  const scN = 4;
  for (let s = 0; s < scN; s++) {
    const x1 = cx + bw - (s + 1) * (2 * bw / scN);
    const midx = x1 + bw / scN;
    ctx.quadraticCurveTo(midx, cy + bh * 0.34, x1, cy);
  }
  ctx.closePath();
  ctx.fillStyle = bell; ctx.fill();
  ctx.strokeStyle = `hsla(${b.hue},90%,88%,0.75)`; ctx.lineWidth = 2; ctx.stroke();

  // cute eyes
  const ex = r * 0.24, ey = -r * 0.16, er = r * 0.13;
  drawEye(cx - ex, cy + ey, er); drawEye(cx + ex, cy + ey, er);
  ctx.restore();
}

function drawEye(x, y, r) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.beginPath(); ctx.arc(x + r*0.18, y + r*0.1, r*0.55, 0, 7); ctx.fillStyle = '#10223a'; ctx.fill();
  ctx.beginPath(); ctx.arc(x - r*0.15, y - r*0.2, r*0.22, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
}

function drawEntities() {
  for (const b of bubbles) (b.kind === 'o2' ? drawO2Bubble : drawJelly)(b);
}

function drawFX() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fillStyle = p.color; ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const f of floats) {
    ctx.globalAlpha = Math.max(f.life, 0);
    ctx.font = '800 34px Rubik, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawCursors() {
  for (const c of cursors) {
    ctx.beginPath(); ctx.arc(c.x, c.y, 24, 0, 7);
    ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 4;
    ctx.shadowColor = '#39c4ff'; ctx.shadowBlur = 18; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(c.x, c.y, 5, 0, 7); ctx.fillStyle = '#9af6ff'; ctx.fill();
  }
}

function drawWave() {
  ctx.save();
  ctx.fillStyle = 'rgba(150,228,255,0.55)';
  ctx.fillRect(0, waveTop + 30, W, H - waveTop);
  for (const col of waveCols) {
    const y = waveTop + Math.sin(tNow * 4 + col.ph) * 10;
    ctx.beginPath(); ctx.arc(col.x, y, col.r, 0, 7);
    ctx.fillStyle = 'rgba(210,248,255,0.8)'; ctx.fill();
    ctx.beginPath(); ctx.arc(col.x - col.r*0.3, y - col.r*0.3, col.r*0.3, 0, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
  }
  ctx.restore();
}

function drawPaused() {
  ctx.fillStyle = 'rgba(3,18,34,0.5)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#eaffff'; ctx.font = '800 56px Rubik, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⏸ Paused', W/2, H/2);
}

function render() {
  ctx.clearRect(0, 0, W, H);     // keep canvas transparent so the aquarium shows
  drawAmbient();
  if (state === S.PLAYING || state === S.PAUSED) {
    drawEntities(); drawFX(); drawCursors();
    if (!cursors.length && state === S.PLAYING) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '700 26px Rubik, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,20,40,0.9)'; ctx.shadowBlur = 8;
      ctx.fillText('✋ Show your hand to the camera', W/2, H - 40); ctx.shadowBlur = 0;
    }
    updateHud();
    if (state === S.PAUSED) drawPaused();
  } else if (state === S.WAVE) {
    drawEntities(); drawFX(); drawWave();
  }
}

// ============================================================
//  MAIN LOOP
// ============================================================
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min((ts - (lastTime || ts)) / 1000, 0.05);
  lastTime = ts; tNow += dt;
  updateAmbient(dt);
  if (state === S.PLAYING) updatePlay(dt);
  else if (state === S.WAVE) updateWave(dt);
  render();
}

// ============================================================
//  HUD
// ============================================================
function updateHud() {
  o2Fill.style.width = (o2 / O2_MAX * 100) + '%';
  o2Fill.classList.toggle('low', o2 < 25);
  strikeEls.forEach((el, i) => el.classList.toggle('used', i < strikes));
}

// ============================================================
//  SOUND (WebAudio — synthesized, no files)
// ============================================================
let actx = null;
function audio() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); return actx; }

function tone(type, f0, f1, dur, gain, when = 0) {
  const ac = audio(), t = ac.currentTime + when;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}

function noiseBurst(dur, gain, freq) {
  const ac = audio(), t = ac.currentTime;
  const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ac.createBufferSource(); src.buffer = buf;
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq;
  const g = ac.createGain(); g.gain.value = gain;
  src.connect(bp); bp.connect(g); g.connect(ac.destination); src.start(t);
}

function playClick() { if (muted) return; tone('triangle', 680, 1040, 0.09, 0.3); tone('square', 1040, 1320, 0.06, 0.1, 0.05); }
function playPop()   { if (muted) return; tone('sine', 900, 280, 0.12, 0.32); noiseBurst(0.06, 0.14, 1200); }
function playWarn()  { if (muted) return; tone('sine', 440, 440, 0.12, 0.2); }
function playGameOverSound() { if (muted) return; tone('sawtooth', 320, 70, 0.7, 0.26); tone('sine', 240, 60, 0.8, 0.16, 0.05); }
function playCry() {                              // wavering, sad jellyfish cry
  if (muted) return;
  const ac = audio(), t = ac.currentTime;
  const o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
  o.type = 'triangle'; o.frequency.setValueAtTime(520, t);
  o.frequency.exponentialRampToValueAtTime(190, t + 0.55);
  lfo.frequency.value = 13; lg.gain.value = 28; lfo.connect(lg); lg.connect(o.frequency);
  g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  o.connect(g); g.connect(ac.destination);
  o.start(t); lfo.start(t); o.stop(t + 0.62); lfo.stop(t + 0.62);
}

// ============================================================
//  HAND TRACKING (MediaPipe Hands)
// ============================================================
let hands = null, camera = null;

function onResults(res) {
  cursors = [];
  if (res.multiHandLandmarks) {
    for (const lm of res.multiHandLandmarks) {
      const tip = lm[8];                                  // index fingertip
      cursors.push({ x: (1 - tip.x) * W, y: tip.y * H });  // mirror x to match a selfie view
    }
  }
}

async function startTracking() {
  hands = new Hands({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
  hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
  hands.onResults(onResults);
  camera = new Camera(video, { onFrame: async () => { await hands.send({ image: video }); }, width: 1280, height: 720 });
  await camera.start();
  cameraStarted = true;
}

// ============================================================
//  SCREEN FLOW
// ============================================================
function show(el, on) { el.classList.toggle('hidden', !on); }

function beginRound() {
  o2 = O2_MAX; strikes = 0; elapsed = 0; survived = 0; spawnTimer = 0; lowO2Timer = 0;
  bubbles.length = floats.length = particles.length = 0;
  updateHud();
  show(startScreen, false); show(instructions, false); show(gameover, false);
  hud.classList.remove('hidden');
  pauseBtn.textContent = '⏸';
  state = S.PLAYING; lastTime = performance.now();
}

function gameOver(reason) {
  if (state !== S.PLAYING) return;
  goReasonKind = reason;
  survived = elapsed;
  if (survived > bestTime) { bestTime = survived; localStorage.setItem('bubblepop_best_time', bestTime); }
  playGameOverSound();
  // launch the rising bubble-wave closing animation
  waveTop = H + 40;
  waveCols = Array.from({ length: 80 }, () => ({
    x: Math.random() * W, r: 14 + Math.random() * 44, ph: Math.random() * 7,
  }));
  state = S.WAVE;
}

function finalizeGameOver() {
  goReason.textContent = goReasonKind === 'jelly'
    ? '🪼 Stung by 3 jellyfish!' : '🌬️ You ran out of oxygen!';
  goTime.textContent = Math.floor(survived) + 's';
  goBest.textContent = Math.floor(bestTime) + 's';
  hud.classList.add('hidden');
  show(gameover, true);
  state = S.GAMEOVER;
}

// ---------- Controls ----------
startBtn.addEventListener('click', async () => {
  playClick();
  startBtn.disabled = true;
  statusEl.textContent = 'Loading camera & hand tracking…';
  try {
    if (!cameraStarted) await startTracking();
  } catch (e) {
    statusEl.textContent = '⚠️ Camera/model failed. Allow camera access and open via http://localhost (not file://).';
    startBtn.disabled = false; console.error(e); return;
  }
  statusEl.textContent = '';
  state = S.INSTRUCT;
  show(startScreen, false); show(instructions, true);
});

letsGoBtn.addEventListener('click', () => { playClick(); beginRound(); });
playAgainBtn.addEventListener('click', () => { playClick(); beginRound(); });

pauseBtn.addEventListener('click', () => {
  if (state === S.PLAYING) { state = S.PAUSED; pauseBtn.textContent = '▶'; }
  else if (state === S.PAUSED) { state = S.PLAYING; pauseBtn.textContent = '⏸'; lastTime = performance.now(); }
});

muteBtn.addEventListener('click', () => { muted = !muted; muteBtn.textContent = muted ? '🔇' : '🔊'; });

// Start the render loop (idles on the start screen until play begins).
requestAnimationFrame(loop);
