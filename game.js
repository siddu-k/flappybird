// ─── Canvas Setup ────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const W = canvas.width;
const H = canvas.height;

// ─── Game State ───────────────────────────────────────────────────────────────
let state = 'idle'; // 'idle' | 'playing' | 'dead'
let score = 0;
let bestScore = 0;
let animId;

// ─── Bird ─────────────────────────────────────────────────────────────────────
const BIRD = {
  x: 90,
  y: H / 2,
  w: 36,
  h: 28,
  vy: 0,
  gravity: 0.45,
  jumpForce: -8,
  rotation: 0,

  reset() {
    this.y = H / 2;
    this.vy = 0;
    this.rotation = 0;
  },

  flap() {
    this.vy = this.jumpForce;
  },

  update() {
    this.vy += this.gravity;
    this.y += this.vy;
    // Tilt: nose up on flap, nose down on fall
    this.rotation = Math.min(Math.max(this.vy * 3, -25), 90);
  },

  draw() {
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    ctx.rotate((this.rotation * Math.PI) / 180);

    // Body
    ctx.fillStyle = '#ffe94e';
    ctx.beginPath();
    ctx.ellipse(0, 0, this.w / 2, this.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wing
    ctx.fillStyle = '#f0c020';
    ctx.beginPath();
    ctx.ellipse(-4, 4, 10, 6, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(8, -5, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(10, -5, 4, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = '#ff8c00';
    ctx.beginPath();
    ctx.moveTo(14, -1);
    ctx.lineTo(22, 2);
    ctx.lineTo(14, 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  },

  getBounds() {
    // Slightly smaller hitbox for fairness
    return {
      x: this.x + 6,
      y: this.y + 4,
      w: this.w - 10,
      h: this.h - 8,
    };
  },
};

// ─── Pipes ────────────────────────────────────────────────────────────────────
const PIPE_W = 60;
const PIPE_GAP = 155;
const PIPE_SPEED = 2.8;
const PIPE_INTERVAL = 1600; // ms between spawns

let pipes = [];
let lastPipeTime = 0;

function spawnPipe() {
  const minTop = 80;
  const maxTop = H - PIPE_GAP - 80;
  const topH = Math.floor(Math.random() * (maxTop - minTop + 1)) + minTop;
  pipes.push({ x: W, topH, passed: false });
}

function updatePipes(timestamp) {
  if (timestamp - lastPipeTime > PIPE_INTERVAL) {
    spawnPipe();
    lastPipeTime = timestamp;
  }

  pipes.forEach((p) => (p.x -= PIPE_SPEED));
  pipes = pipes.filter((p) => p.x + PIPE_W > -10);
}

function drawPipe(p) {
  const capH = 20;
  const capOverhang = 4;

  // Top pipe body
  const topGrad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
  topGrad.addColorStop(0, '#4caf50');
  topGrad.addColorStop(0.5, '#81c784');
  topGrad.addColorStop(1, '#388e3c');
  ctx.fillStyle = topGrad;
  ctx.fillRect(p.x, 0, PIPE_W, p.topH - capH);

  // Top pipe cap
  ctx.fillStyle = '#388e3c';
  ctx.fillRect(p.x - capOverhang, p.topH - capH, PIPE_W + capOverhang * 2, capH);

  // Bottom pipe body
  const botY = p.topH + PIPE_GAP;
  const botH = H - botY;
  ctx.fillStyle = topGrad;
  ctx.fillRect(p.x, botY + capH, PIPE_W, botH);

  // Bottom pipe cap
  ctx.fillStyle = '#388e3c';
  ctx.fillRect(p.x - capOverhang, botY, PIPE_W + capOverhang * 2, capH);
}

function drawPipes() {
  pipes.forEach(drawPipe);
}

function checkCollisions() {
  const b = BIRD.getBounds();

  // Floor / ceiling
  if (b.y <= 0 || b.y + b.h >= H - GROUND_H) return true;

  for (const p of pipes) {
    const inX = b.x < p.x + PIPE_W && b.x + b.w > p.x;
    const inTop = b.y < p.topH;
    const inBot = b.y + b.h > p.topH + PIPE_GAP;
    if (inX && (inTop || inBot)) return true;

    // Score when bird passes pipe centre
    if (!p.passed && p.x + PIPE_W / 2 < BIRD.x) {
      p.passed = true;
      score++;
    }
  }
  return false;
}

// ─── Background / Ground ──────────────────────────────────────────────────────
const GROUND_H = 80;
let bgOffset = 0;
let groundOffset = 0;

// Clouds
const clouds = Array.from({ length: 5 }, () => ({
  x: Math.random() * W,
  y: 40 + Math.random() * 160,
  w: 60 + Math.random() * 60,
  speed: 0.3 + Math.random() * 0.3,
}));

function updateBackground() {
  groundOffset = (groundOffset + PIPE_SPEED) % 40;
  clouds.forEach((c) => {
    c.x -= c.speed;
    if (c.x + c.w < 0) {
      c.x = W + 20;
      c.y = 40 + Math.random() * 160;
    }
  });
}

function drawBackground() {
  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H - GROUND_H);
  sky.addColorStop(0, '#87ceeb');
  sky.addColorStop(1, '#b0e0ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H - GROUND_H);

  // Clouds
  clouds.forEach((c) => {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(c.x + c.w / 2, c.y, c.w / 2, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + c.w * 0.3, c.y + 6, c.w * 0.3, 14, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + c.w * 0.7, c.y + 6, c.w * 0.3, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawGround() {
  // Dirt base
  ctx.fillStyle = '#c8a96e';
  ctx.fillRect(0, H - GROUND_H, W, GROUND_H);

  // Grass strip
  ctx.fillStyle = '#5ab552';
  ctx.fillRect(0, H - GROUND_H, W, 18);

  // Scrolling stripes
  ctx.fillStyle = '#4a9a44';
  for (let x = -groundOffset; x < W; x += 40) {
    ctx.fillRect(x, H - GROUND_H, 20, 18);
  }
}

// ─── Score HUD ────────────────────────────────────────────────────────────────
function drawScore() {
  ctx.textAlign = 'center';
  ctx.font = 'bold 38px Arial';
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillText(score, W / 2 + 2, 60 + 2);
  ctx.fillStyle = '#fff';
  ctx.fillText(score, W / 2, 60);
}

// ─── Main Loop ────────────────────────────────────────────────────────────────
function gameLoop(timestamp) {
  ctx.clearRect(0, 0, W, H);

  drawBackground();

  if (state === 'playing') {
    updateBackground();
    updatePipes(timestamp);
    BIRD.update();

    if (checkCollisions()) {
      state = 'dead';
      endGame();
      drawPipes();
      BIRD.draw();
      drawGround();
      drawScore();
      return;
    }
  }

  drawPipes();
  BIRD.draw();
  drawGround();

  if (state === 'playing') drawScore();

  animId = requestAnimationFrame(gameLoop);
}

// ─── Game Controls ────────────────────────────────────────────────────────────
function startGame() {
  score = 0;
  pipes = [];
  lastPipeTime = 0;
  BIRD.reset();
  state = 'playing';

  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('game-over-screen').classList.add('hidden');

  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(gameLoop);
}

function endGame() {
  if (score > bestScore) bestScore = score;
  document.getElementById('final-score').textContent = score;
  document.getElementById('best-score').textContent = bestScore;
  document.getElementById('game-over-screen').classList.remove('hidden');
}

// ─── Input ────────────────────────────────────────────────────────────────────
function handleFlap() {
  if (state === 'playing') BIRD.flap();
}

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    handleFlap();
  }
});

canvas.addEventListener('click', handleFlap);
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  handleFlap();
}, { passive: false });

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);

// ─── Initial idle render ──────────────────────────────────────────────────────
(function idleRender() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  BIRD.draw();
  drawGround();
})();
