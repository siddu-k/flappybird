// ─── Canvas Setup ────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const W = canvas.width;
const H = canvas.height;

// ─── Game State ───────────────────────────────────────────────────────────────
let state = 'idle'; // 'idle' | 'playing' | 'hit' | 'dead'
let score = 0;
let bestScore = 0;
let animId;

// ─── Lives / Hearts ───────────────────────────────────────────────────────────
const MAX_LIVES = 3;
let lives = MAX_LIVES;
let isInvincible = false;     // brief grace period after a hit
let invincibleTimer = 0;
const INVINCIBLE_MS = 1500;   // 1.5 s of invincibility after each hit
let flashTimer = 0;           // controls bird flash on hit

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

  // Bounce bird back up slightly after a hit
  bounce() {
    this.vy = this.jumpForce * 0.7;
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

function checkCollisions(timestamp) {
  if (isInvincible) {
    // Still check scoring even during invincibility
    for (const p of pipes) {
      if (!p.passed && p.x + PIPE_W / 2 < BIRD.x) {
        p.passed = true;
        score++;
      }
    }
    return false;
  }

  const b = BIRD.getBounds();

  // Floor / ceiling hit
  const hitBoundary = b.y <= 0 || b.y + b.h >= H - GROUND_H;

  let hitPipe = false;
  for (const p of pipes) {
    const inX = b.x < p.x + PIPE_W && b.x + b.w > p.x;
    const inTop = b.y < p.topH;
    const inBot = b.y + b.h > p.topH + PIPE_GAP;
    if (inX && (inTop || inBot)) { hitPipe = true; break; }

    if (!p.passed && p.x + PIPE_W / 2 < BIRD.x) {
      p.passed = true;
      score++;
    }
  }

  if (hitBoundary || hitPipe) {
    lives--;
    updateHeartsDisplay();

    if (lives <= 0) {
      return true; // game over
    }

    // Lost a life — grant invincibility and bounce
    isInvincible = true;
    invincibleTimer = timestamp;
    flashTimer = 0;
    BIRD.bounce();
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

// ─── Hearts HUD (drawn on canvas) ────────────────────────────────────────────
function drawHeart(x, y, size, filled) {
  ctx.save();
  ctx.beginPath();
  const s = size / 2;
  ctx.moveTo(x, y + s * 0.4);
  ctx.bezierCurveTo(x, y, x - s, y, x - s, y + s * 0.4);
  ctx.bezierCurveTo(x - s, y + s * 0.8, x, y + s * 1.2, x, y + s * 1.6);
  ctx.bezierCurveTo(x, y + s * 1.2, x + s, y + s * 0.8, x + s, y + s * 0.4);
  ctx.bezierCurveTo(x + s, y, x, y, x, y + s * 0.4);
  ctx.closePath();

  if (filled) {
    ctx.fillStyle = '#e74c3c';
    ctx.shadowColor = '#ff6b6b';
    ctx.shadowBlur = 8;
    ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawHearts() {
  const size = 26;
  const spacing = 34;
  const startX = 18 + size / 2;
  const y = 12;

  for (let i = 0; i < MAX_LIVES; i++) {
    drawHeart(startX + i * spacing, y, size, i < lives);
  }
}

// ─── Sync DOM heart icons ─────────────────────────────────────────────────────
function updateHeartsDisplay() {
  const icons = document.querySelectorAll('.heart-icon');
  icons.forEach((el, i) => {
    const shouldBeLost = i >= lives;
    const wasLost = el.classList.contains('lost');
    if (shouldBeLost && !wasLost) {
      // Trigger pulse animation then settle
      el.classList.add('losing');
      setTimeout(() => {
        el.classList.remove('losing');
        el.classList.add('lost');
      }, 360);
    } else if (!shouldBeLost) {
      el.classList.remove('lost', 'losing');
    }
  });
}

// ─── Main Loop ────────────────────────────────────────────────────────────────
function gameLoop(timestamp) {
  ctx.clearRect(0, 0, W, H);

  drawBackground();

  if (state === 'playing') {
    updateBackground();
    updatePipes(timestamp);
    BIRD.update();

    // Lift invincibility after grace period
    if (isInvincible && timestamp - invincibleTimer > INVINCIBLE_MS) {
      isInvincible = false;
    }

    if (checkCollisions(timestamp)) {
      state = 'dead';
      endGame();
      drawPipes();
      BIRD.draw();
      drawGround();
      drawScore();
      drawHearts();
      return;
    }
  }

  drawPipes();

  // Flash bird while invincible (every ~100ms)
  const shouldHide = isInvincible && Math.floor((timestamp - invincibleTimer) / 100) % 2 === 1;
  if (!shouldHide) BIRD.draw();

  drawGround();

  if (state === 'playing') {
    drawScore();
    drawHearts();
  }

  animId = requestAnimationFrame(gameLoop);
}

// ─── Game Controls ────────────────────────────────────────────────────────────
function startGame() {
  score = 0;
  lives = MAX_LIVES;
  isInvincible = false;
  pipes = [];
  lastPipeTime = 0;
  BIRD.reset();
  state = 'playing';

  updateHeartsDisplay();
  document.getElementById('hearts-bar').style.display = 'flex';
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
  document.getElementById('hearts-bar').style.display = 'none';
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
