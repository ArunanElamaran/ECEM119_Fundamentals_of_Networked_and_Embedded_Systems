// Browser-side two-player Pong game.
// Player 1: IMU from Arduino via /sensor1. Player 2: keyboard (up/down = paddle, left = random color).

const canvas = document.getElementById('pongCanvas');
const ctx = canvas.getContext('2d');

// Game objects
const paddleWidth = 10;
const paddleHeight = 80;
const ballRadius = 8;

// Player paddle positions
let paddle1Y = (canvas.height - paddleHeight) / 2;
let paddle2Y = (canvas.height - paddleHeight) / 2;

// Gesture-driven velocity for P1; keyboard-driven for P2
let paddle1Vy = 0;
let paddle2Vy = 0;
const PADDLE_SPEED = 4;

// Ball state
let ballX = canvas.width / 2;
let ballY = canvas.height / 2;
let ballVX = 4;
let ballVY = 3;

let score1 = 0;
let score2 = 0;

let gameStarted = false;
let isPaused = false;
let bgColor = '#111';

// History for P1 gesture detection
const imu1History = [];
const MAX_HISTORY = 20; // roughly 1 second at 20 Hz

let lastShakeToggleTime1 = 0;
let lastSwipeTime1 = 0;

const SWIPE_COOLDOWN_MS = 800;
const KEYBOARD_COLOR_COOLDOWN_MS = 800;

// Pause: only when in STOP/UNKNOWN and quick rotation around vertical axis (yaw) from gyro.
// Gyro Z = yaw (deg/s). Threshold in deg/s.
const GYRO_YAW_THRESHOLD = 80;
const PAUSE_COOLDOWN_MS = 800;

// IMU data and gesture state (player 1 only). lastImu1 = accel; lastGyro1 = gyro (deg/s).
let lastImu1 = { x: NaN, y: NaN, z: NaN };
let lastGyro1 = { x: NaN, y: NaN, z: NaN };
let imu1Connected = false;
let lastKeyboardColorTime = 0;

const GESTURE = {
  UP: 'up',
  DOWN: 'down',
  STOP: 'stop',
  UNKNOWN: 'unknown',
};

let gesture1 = GESTURE.STOP;

// Gesture recognition:
// Use palm orientation based on accelerometer Z axis.
// - UP:   palm up  (z >  0.6 g)
// - DOWN: palm down (z < -0.6 g)
// - STOP: vertical / neutral (|z| < 0.3 g)
function classifyGesture({ x, y, z }) {
  if (
    typeof z !== 'number' ||
    !Number.isFinite(z)
  ) {
    return GESTURE.UNKNOWN;
  }

  if (z > 0.6) return GESTURE.UP;
  if (z < -0.6) return GESTURE.DOWN;
  if (Math.abs(z) < 0.3) return GESTURE.STOP;

  return GESTURE.UNKNOWN;
}

// Update gesture → velocity for P1 only. P2 velocity is set by keyboard.
function updatePaddleVelocities() {
  if (imu1Connected) {
    const g1 = classifyGesture(lastImu1);
    if (g1 === GESTURE.UP) {
      gesture1 = GESTURE.UP;
      paddle1Vy = -PADDLE_SPEED;
    } else if (g1 === GESTURE.DOWN) {
      gesture1 = GESTURE.DOWN;
      paddle1Vy = PADDLE_SPEED;
    } else if (g1 === GESTURE.STOP) {
      gesture1 = GESTURE.STOP;
      paddle1Vy = 0;
    }
  } else {
    paddle1Vy = 0;
  }
  // paddle2Vy is updated by keyboard in keydown/keyup
}

// Poll IMU data for player 1
async function pollImu1() {
  try {
    const res = await fetch('/sensor1', { method: 'POST' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const { sensorValue, gyroValue } = data || {};
    if (sensorValue) {
      lastImu1 = sensorValue;
      if (gyroValue && typeof gyroValue.x === 'number' && typeof gyroValue.y === 'number' && typeof gyroValue.z === 'number') {
        lastGyro1 = gyroValue;
      }
      const validX = typeof sensorValue.x === 'number' && Number.isFinite(sensorValue.x);
      const validY = typeof sensorValue.y === 'number' && Number.isFinite(sensorValue.y);
      const validZ = typeof sensorValue.z === 'number' && Number.isFinite(sensorValue.z);
      imu1Connected = validX && validY && validZ;

      if (imu1Connected) {
        const g = lastGyro1 && typeof lastGyro1.z === 'number' ? lastGyro1 : { x: NaN, y: NaN, z: NaN };
        imu1History.push({
          ...sensorValue,
          gx: g.x,
          gy: g.y,
          gz: g.z,
          t: Date.now(),
        });
        if (imu1History.length > MAX_HISTORY) imu1History.shift();
        handleSpecialGestures(1);
      }
    } else {
      imu1Connected = false;
    }
  } catch {
    imu1Connected = false;
  }

  updateImuStatus();
  setTimeout(pollImu1, 50);
}

// Player 2 is always "ready" (keyboard). No polling.
function updateImuStatus() {
  const p1StatusEl = document.getElementById('p1Status');
  const p2StatusEl = document.getElementById('p2Status');

  const g1 = classifyGesture(lastImu1);

  if (imu1Connected) {
    p1StatusEl.textContent = `P1: connected (${g1})`;
  } else {
    p1StatusEl.textContent = 'P1: searching…';
  }

  p2StatusEl.textContent = 'P2: keyboard (↑↓ move, ← color)';

  // Pause game if P1 (Arduino) is not connected
  if (!imu1Connected) {
    gameStarted = false;
    isPaused = false;
  }
}

// Detect vertical-axis rotation via gyro (pause/play) and horizontal swipe (background color) for P1 only.
// Pause/unpause: only when in STOP or UNKNOWN and gyro shows quick rotation around vertical axis (yaw = gz).
function handleSpecialGestures(playerIndex) {
  if (playerIndex !== 1) return;

  const now = Date.now();
  const history = imu1History;
  const lastImu = lastImu1;
  const g = classifyGesture(lastImu);

  // Pause toggle: only in STOP or UNKNOWN, and gyro yaw (z) exceeds threshold (quick twist)
  if (g === GESTURE.STOP || g === GESTURE.UNKNOWN) {
    const gz = lastGyro1 && typeof lastGyro1.z === 'number' && Number.isFinite(lastGyro1.z) ? lastGyro1.z : 0;
    if (
      Math.abs(gz) > GYRO_YAW_THRESHOLD &&
      now - lastShakeToggleTime1 > PAUSE_COOLDOWN_MS
    ) {
      isPaused = !isPaused;
      lastShakeToggleTime1 = now;
    }
  }

  // Horizontal swipe while in STOP or UNKNOWN: change background color
  if (g === GESTURE.STOP || g === GESTURE.UNKNOWN) {
    const current = history[history.length - 1];

    if (
      current &&
      typeof current.x === 'number' &&
      Math.abs(current.x) > 0.7 &&
      now - lastSwipeTime1 > SWIPE_COOLDOWN_MS
    ) {
      const hue = Math.floor(Math.random() * 360);
      bgColor = `hsl(${hue}, 60%, 20%)`;
      lastSwipeTime1 = now;
    }
  }
}

// Game loop
function updateGame() {
  // If P1 is connected and the game hasn't started yet, start the round.
  if (!gameStarted && imu1Connected) {
    gameStarted = true;
    resetBall();
  }

  // If paused via vertical-axis rotation (P1), freeze game state.
  if (isPaused) {
    return;
  }

  // Update paddle velocities: P1 from gestures, P2 from keyboard (set in keydown/keyup)
  updatePaddleVelocities();

  // Move paddles
  paddle1Y += paddle1Vy;
  paddle2Y += paddle2Vy;

  // Constrain paddles
  if (paddle1Y < 0) paddle1Y = 0;
  if (paddle1Y > canvas.height - paddleHeight) {
    paddle1Y = canvas.height - paddleHeight;
  }
  if (paddle2Y < 0) paddle2Y = 0;
  if (paddle2Y > canvas.height - paddleHeight) {
    paddle2Y = canvas.height - paddleHeight;
  }

  // If the game hasn't started yet or P1 is disconnected, don't move the ball.
  if (!gameStarted || !imu1Connected) {
    return;
  }

  // Update ball position
  ballX += ballVX;
  ballY += ballVY;

  // Collide with top/bottom walls
  if (ballY - ballRadius < 0) {
    ballY = ballRadius;
    ballVY = -ballVY;
  } else if (ballY + ballRadius > canvas.height) {
    ballY = canvas.height - ballRadius;
    ballVY = -ballVY;
  }

  // Collide with right paddle (player 2)
  if (
    ballX + ballRadius > canvas.width - paddleWidth &&
    ballY > paddle2Y &&
    ballY < paddle2Y + paddleHeight &&
    ballVX > 0
  ) {
    ballX = canvas.width - paddleWidth - ballRadius;
    ballVX = -ballVX;
    const hitPos = (ballY - (paddle2Y + paddleHeight / 2)) / (paddleHeight / 2);
    ballVY += hitPos * 2;
  }

  // Collide with left paddle (player 1)
  if (
    ballX - ballRadius < paddleWidth &&
    ballY > paddle1Y &&
    ballY < paddle1Y + paddleHeight &&
    ballVX < 0
  ) {
    ballX = paddleWidth + ballRadius;
    ballVX = -ballVX;
    const hitPos = (ballY - (paddle1Y + paddleHeight / 2)) / (paddleHeight / 2);
    ballVY += hitPos * 2;
  }

  // Ball missed left side -> player 2 scores
  if (ballX + ballRadius < 0) {
    score2 += 1;
    resetBall();
  }

  // Ball missed right side -> player 1 scores
  if (ballX - ballRadius > canvas.width) {
    score1 += 1;
    resetBall();
  }
}

function resetBall() {
  ballX = canvas.width / 2;
  ballY = canvas.height / 2;
  ballVX = Math.random() < 0.5 ? 4 : -4;
  ballVY = (Math.random() * 4 - 2) || 3;
}

function drawGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Center line
  ctx.strokeStyle = '#444';
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);

  // Left paddle (player 1)
  ctx.fillStyle = '#0f0';
  ctx.fillRect(0, paddle1Y, paddleWidth, paddleHeight);

  // Right paddle (player 2)
  ctx.fillStyle = '#0ff';
  ctx.fillRect(canvas.width - paddleWidth, paddle2Y, paddleWidth, paddleHeight);

  // Ball
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(ballX, ballY, ballRadius, 0, Math.PI * 2);
  ctx.fill();

  // Scores
  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  ctx.fillText('P1: ' + score1, 20, 30);
  ctx.fillText('P2: ' + score2, canvas.width - 90, 30);
}

function loop() {
  updateGame();
  drawGame();
  requestAnimationFrame(loop);
}

// --- Player 2 keyboard controls (up/down = paddle, left = random color) ---
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') {
    paddle2Vy = -PADDLE_SPEED;
    e.preventDefault();
  } else if (e.key === 'ArrowDown') {
    paddle2Vy = PADDLE_SPEED;
    e.preventDefault();
  } else if (e.key === 'ArrowLeft') {
    const now = Date.now();
    if (now - lastKeyboardColorTime > KEYBOARD_COLOR_COOLDOWN_MS) {
      const hue = Math.floor(Math.random() * 360);
      bgColor = `hsl(${hue}, 60%, 20%)`;
      lastKeyboardColorTime = now;
    }
    e.preventDefault();
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowUp' && paddle2Vy < 0) {
    paddle2Vy = 0;
    e.preventDefault();
  } else if (e.key === 'ArrowDown' && paddle2Vy > 0) {
    paddle2Vy = 0;
    e.preventDefault();
  }
});

// Start everything: poll P1 Arduino only; P2 uses keyboard
updateImuStatus(); // show P2 keyboard hint immediately
pollImu1();
loop();

