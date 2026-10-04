/* ============================================================
   Flappy Bird — HTML5 Canvas
   Pure JS, no assets. Works on desktop + mobile (tap to flap).
   ============================================================ */
'use strict';

// ---------- Canvas setup (logical resolution 360x640, scaled to fit) ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const W = 360;            // logical width
const H = 640;            // logical height
const GROUND_H = 90;
const GROUND_Y = H - GROUND_H;

let scale = 1;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width = Math.floor(W * scale) + 'px';
  canvas.style.height = Math.floor(H * scale) + 'px';
  canvas.width = Math.floor(W * scale * dpr);
  canvas.height = Math.floor(H * scale * dpr);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

// ---------- Constants ----------
const GRAVITY = 0.35;
const FLAP_VY = -7.2;
const MAX_FALL = 11;
const PIPE_SPEED = 2.3;
const PIPE_W = 62;
const PIPE_GAP = 155;
const PIPE_SPACING = 205;
const BIRD_X = 88;
const BIRD_R = 12; // collision radius (slightly forgiving)

// ---------- Game state ----------
const STATE = { READY: 0, PLAY: 1, OVER: 2 };
let state = STATE.READY;
let frames = 0;
let score = 0;
let best = Number(localStorage.getItem('flappy-best') || 0);
let flashAlpha = 0;
let overPanelY = H; // game-over panel slide-in position

const bird = {
  x: BIRD_X,
  y: H * 0.42,
  vy: 0,
  rot: 0,
  wing: 0,
};

let pipes = [];
let groundX = 0;
let clouds = [];
let bushes = [];

function initScenery() {
  clouds = [];
  for (let i = 0; i < 5; i++) {
    clouds.push({
      x: Math.random() * W,
      y: 60 + Math.random() * 180,
      s: 0.6 + Math.random() * 0.8,
      v: 0.15 + Math.random() * 0.25,
    });
  }
  bushes = [];
  for (let i = 0; i < 8; i++) {
    bushes.push({ x: i * 60 + Math.random() * 20, r: 22 + Math.random() * 18 });
  }
}
initScenery();

// ---------- Audio (tiny WebAudio beeps, no files) ----------
let audio = null;
function ensureAudio() {
  if (!audio) {
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ }
  }
  if (audio && audio.state === 'suspended') audio.resume();
}
function beep(freq, dur, type, vol, slideTo) {
  if (!audio) return;
  try {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, audio.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, audio.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.12, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + dur);
  } catch (e) { /* ignore */ }
}
const sfx = {
  flap:  () => beep(600, 0.09, 'square', 0.08, 900),
  score: () => { beep(880, 0.08, 'square', 0.10); setTimeout(() => beep(1320, 0.10, 'square', 0.10), 70); },
  hit:   () => beep(300, 0.20, 'sawtooth', 0.18, 80),
  die:   () => beep(200, 0.35, 'triangle', 0.15, 60),
};

// ---------- Input ----------
function flap() {
  ensureAudio();
  if (state === STATE.READY) {
    state = STATE.PLAY;
    bird.vy = FLAP_VY;
    sfx.flap();
  } else if (state === STATE.PLAY) {
    bird.vy = FLAP_VY;
    bird.wing = 0;
    sfx.flap();
  } else if (state === STATE.OVER && frames - overAt > 30) {
    reset();
  }
}

function onPress(e) {
  if (e.cancelable) e.preventDefault();
  flap();
}

canvas.addEventListener('pointerdown', onPress, { passive: false });
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    flap();
  }
});

// ---------- Reset ----------
let overAt = 0;
function reset() {
  state = STATE.READY;
  score = 0;
  frames = 0;
  pipes = [];
  bird.x = BIRD_X;
  bird.y = H * 0.42;
  bird.vy = 0;
  bird.rot = 0;
  overPanelY = H;
  flashAlpha = 0;
}

// ---------- Pipes ----------
function spawnPipe() {
  const minTop = 70;
  const maxTop = GROUND_Y - PIPE_GAP - 70;
  const top = minTop + Math.random() * (maxTop - minTop);
  pipes.push({ x: W + 10, top, scored: false });
}

function updatePipes() {
  // spawn based on distance
  const last = pipes[pipes.length - 1];
  if (!last || last.x < W - PIPE_SPACING) spawnPipe();

  for (const p of pipes) p.x -= PIPE_SPEED;
  pipes = pipes.filter((p) => p.x + PIPE_W > -20);
}

function checkCollisions() {
  // ground
  if (bird.y + BIRD_R >= GROUND_Y) {
    bird.y = GROUND_Y - BIRD_R;
    gameOver();
    return;
  }
  // ceiling (soft clamp, no death)
  if (bird.y - BIRD_R < 0) {
    bird.y = BIRD_R;
    bird.vy = 0;
  }
  // pipes
  for (const p of pipes) {
    // score
    if (!p.scored && p.x + PIPE_W < bird.x - BIRD_R) {
      p.scored = true;
      score++;
      sfx.score();
    }
    // collision (AABB vs circle, slightly forgiving)
    const withinX = bird.x + BIRD_R * 0.8 > p.x && bird.x - BIRD_R * 0.8 < p.x + PIPE_W;
    if (withinX) {
      if (bird.y - BIRD_R * 0.8 < p.top || bird.y + BIRD_R * 0.8 > p.top + PIPE_GAP) {
        gameOver();
        return;
      }
    }
  }
}

function gameOver() {
  if (state !== STATE.PLAY) return;
  state = STATE.OVER;
  overAt = frames;
  flashAlpha = 0.9;
  sfx.hit();
  setTimeout(() => sfx.die(), 120);
  if (score > best) {
    best = score;
    localStorage.setItem('flappy-best', String(best));
  }
}

// ---------- Update ----------
function update(dt) {
  frames++;

  // clouds always drift
  for (const c of clouds) {
    c.x -= c.v * dt;
    if (c.x < -60) { c.x = W + 40; c.y = 60 + Math.random() * 180; }
  }

  if (state === STATE.READY) {
    // gentle bobbing
    bird.y = H * 0.42 + Math.sin(frames / 12) * 6;
    bird.rot = Math.sin(frames / 12) * 0.08;
    groundX = (groundX - PIPE_SPEED * dt) % 24;
  }

  if (state === STATE.PLAY) {
    bird.vy = Math.min(bird.vy + GRAVITY * dt, MAX_FALL);
    bird.y += bird.vy * dt;
    bird.rot = Math.max(-0.45, Math.min(bird.vy * 0.06, 1.35));
    groundX = (groundX - PIPE_SPEED * dt) % 24;
    updatePipes();
    checkCollisions();
  }

  if (state === STATE.OVER) {
    // bird falls to the ground
    if (bird.y + BIRD_R < GROUND_Y) {
      bird.vy = Math.min(bird.vy + GRAVITY * dt, MAX_FALL);
      bird.y += bird.vy * dt;
      bird.rot = Math.min(bird.rot + 0.08 * dt, Math.PI / 2);
    } else {
      bird.y = GROUND_Y - BIRD_R;
      bird.vy = 0;
    }
    // panel slides in
    const target = H * 0.32;
    overPanelY += (target - overPanelY) * 0.12 * dt;
  }

  // wing animation
  bird.wing += (state === STATE.PLAY ? 0.35 : 0.18) * dt;

  // hit flash fade
  if (flashAlpha > 0) flashAlpha = Math.max(0, flashAlpha - 0.06 * dt);
}

// ---------- Drawing helpers ----------
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCloud(x, y, s) {
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(x, y, 16 * s, 0, Math.PI * 2);
  ctx.arc(x + 18 * s, y + 4 * s, 12 * s, 0, Math.PI * 2);
  ctx.arc(x - 18 * s, y + 5 * s, 11 * s, 0, Math.PI * 2);
  ctx.arc(x + 4 * s, y - 9 * s, 12 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawBackground() {
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, '#4ec0ca');
  sky.addColorStop(1, '#8ee0e6');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND_Y);

  // clouds
  for (const c of clouds) drawCloud(c.x, c.y, c.s);

  // distant bushes (parallax)
  ctx.fillStyle = '#5ec9a0';
  const bx = (groundX * 0.4) % 60;
  for (let i = -1; i < 8; i++) {
    const b = bushes[(i + 8) % bushes.length];
    ctx.beginPath();
    ctx.arc(b.x + bx, GROUND_Y - 6, b.r, Math.PI, 0);
    ctx.fill();
  }
}

function drawPipe(p) {
  const capH = 26;
  const capOver = 4;

  function pipeBody(x, y, w, h) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#5db95d');
    g.addColorStop(0.5, '#8ede6a');
    g.addColorStop(1, '#4a9e4a');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#2e6b2e';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y, w - 2, h);
  }

  // top pipe
  pipeBody(p.x, -10, PIPE_W, p.top + 10 - capH);
  pipeBody(p.x - capOver, p.top - capH, PIPE_W + capOver * 2, capH);
  // bottom pipe
  const by = p.top + PIPE_GAP;
  pipeBody(p.x - capOver, by, PIPE_W + capOver * 2, capH);
  pipeBody(p.x, by + capH, PIPE_W, GROUND_Y - by - capH + 4);
}

function drawGround() {
  // dirt
  ctx.fillStyle = '#ded895';
  ctx.fillRect(0, GROUND_Y, W, GROUND_H);
  // grass strip
  ctx.fillStyle = '#7ec850';
  ctx.fillRect(0, GROUND_Y, W, 12);
  ctx.fillStyle = '#5aa63a';
  ctx.fillRect(0, GROUND_Y + 12, W, 4);
  // diagonal stripes
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  for (let x = groundX - 24; x < W + 24; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y + 16);
    ctx.lineTo(x + 12, GROUND_Y + 16);
    ctx.lineTo(x + 4, GROUND_Y + 34);
    ctx.lineTo(x - 8, GROUND_Y + 34);
    ctx.closePath();
    ctx.fill();
  }
  // top edge line
  ctx.fillStyle = '#3f7d28';
  ctx.fillRect(0, GROUND_Y, W, 2);
}

function drawBird() {
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(bird.rot);

  // body
  ctx.fillStyle = '#f7d51d';
  ctx.strokeStyle = '#5a4a1a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // belly
  ctx.fillStyle = '#fdf3c0';
  ctx.beginPath();
  ctx.ellipse(-2, 4, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // wing (animated)
  const flapPhase = Math.sin(bird.wing * 2);
  ctx.save();
  ctx.translate(-2, 1);
  ctx.rotate(flapPhase * 0.6);
  ctx.fillStyle = '#f5a623';
  ctx.strokeStyle = '#5a4a1a';
  ctx.beginPath();
  ctx.ellipse(-3, 0, 8, 5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // eye
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(7, -4, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5a4a1a';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(8.5, -4, 2, 0, Math.PI * 2);
  ctx.fill();

  // beak
  ctx.fillStyle = '#e8610c';
  ctx.strokeStyle = '#a33f05';
  ctx.beginPath();
  ctx.moveTo(11, -1);
  ctx.lineTo(20, 1);
  ctx.lineTo(11, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawScore() {
  if (state === STATE.READY) return;
  ctx.font = 'bold 42px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#3a3a3a';
  ctx.fillStyle = '#fff';
  const y = state === STATE.OVER ? 24 : 60;
  ctx.strokeText(score, W / 2, y);
  ctx.fillText(score, W / 2, y);
}

function drawReadyUI() {
  ctx.textAlign = 'center';

  // title
  ctx.font = 'bold 34px "Courier New", monospace';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#3a3a3a';
  ctx.fillStyle = '#fff';
  ctx.strokeText('FLAPPY BIRD', W / 2, 130);
  ctx.fillText('FLAPPY BIRD', W / 2, 130);

  // tap hint (pulsing)
  const a = 0.55 + Math.sin(frames / 14) * 0.35;
  ctx.globalAlpha = Math.max(0.25, a);
  ctx.font = 'bold 18px "Courier New", monospace';
  ctx.strokeText('TAP  or  SPACE  to flap', W / 2, 190);
  ctx.fillText('TAP  or  SPACE  to flap', W / 2, 190);
  ctx.globalAlpha = 1;

  // best
  if (best > 0) {
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.strokeText('BEST  ' + best, W / 2, 226);
    ctx.fillText('BEST  ' + best, W / 2, 226);
  }
}

function medalFor(s) {
  if (s >= 40) return { color: '#e5e4e2', name: 'PLATINUM' };
  if (s >= 30) return { color: '#ffd700', name: 'GOLD' };
  if (s >= 20) return { color: '#c0c0c0', name: 'SILVER' };
  if (s >= 10) return { color: '#cd7f32', name: 'BRONZE' };
  return null;
}

function drawGameOverUI() {
  const pw = 250;
  const ph = 170;
  const px = (W - pw) / 2;
  const py = overPanelY;

  // panel
  ctx.fillStyle = 'rgba(222,216,149,0.97)';
  ctx.strokeStyle = '#5a4a1a';
  ctx.lineWidth = 3;
  roundRect(px, py, pw, ph, 10);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';

  // game over text (above panel)
  ctx.font = 'bold 30px "Courier New", monospace';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#3a3a3a';
  ctx.fillStyle = '#ff7043';
  ctx.strokeText('GAME OVER', W / 2, py - 46);
  ctx.fillText('GAME OVER', W / 2, py - 46);

  // medal
  const medal = medalFor(score);
  if (medal) {
    ctx.beginPath();
    ctx.arc(px + 52, py + 62, 26, 0, Math.PI * 2);
    ctx.fillStyle = medal.color;
    ctx.fill();
    ctx.strokeStyle = '#5a4a1a';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(px + 45, py + 55, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.fillStyle = '#5a4a1a';
    ctx.fillText(medal.name, px + 52, py + 100);
  }

  // score / best
  ctx.font = 'bold 15px "Courier New", monospace';
  ctx.fillStyle = '#5a4a1a';
  ctx.textAlign = 'right';
  ctx.fillText('SCORE', px + pw - 30, py + 40);
  ctx.fillText('BEST', px + pw - 30, py + 82);
  ctx.font = 'bold 24px "Courier New", monospace';
  ctx.fillText(score, px + pw - 30, py + 52);
  ctx.fillText(best, px + pw - 30, py + 94);

  // new best badge
  if (score >= best && score > 0) {
    ctx.save();
    ctx.translate(px + pw - 78, py + 30);
    ctx.rotate(-0.2);
    ctx.fillStyle = '#ff5252';
    roundRect(-30, -10, 60, 20, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NEW!', 0, 4);
    ctx.restore();
  }

  // restart hint
  if (frames - overAt > 30) {
    const a = 0.55 + Math.sin(frames / 12) * 0.35;
    ctx.globalAlpha = Math.max(0.3, a);
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#3a3a3a';
    ctx.fillStyle = '#fff';
    ctx.strokeText('TAP to restart', W / 2, py + ph + 26);
    ctx.fillText('TAP to restart', W / 2, py + ph + 26);
    ctx.globalAlpha = 1;
  }
}

function draw() {
  drawBackground();
  for (const p of pipes) drawPipe(p);
  drawGround();
  drawBird();
  drawScore();

  if (state === STATE.READY) drawReadyUI();
  if (state === STATE.OVER) drawGameOverUI();

  // hit flash
  if (flashAlpha > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + flashAlpha + ')';
    ctx.fillRect(0, 0, W, H);
  }
}

// ---------- Main loop (delta-time normalized to 60fps) ----------
let last = performance.now();
function loop(now) {
  let dt = (now - last) / (1000 / 60);
  last = now;
  dt = Math.min(dt, 3); // avoid huge jumps after tab switch
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
