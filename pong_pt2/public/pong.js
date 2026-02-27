// Browser-side two-player Pong game that uses IMU data
// from two Arduino paddles via HTTP POSTs to /sensor1 and /sensor2.

const canvas = document.getElementById('pongCanvas');
const ctx = canvas.getContext('2d');

// Game objects
const paddleWidth = 10;
const paddleHeight = 80;
const ballRadius = 8;

// Player paddle positions
let paddle1Y = (canvas.height - paddleHeight) / 2;
let paddle2Y = (canvas.height - paddleHeight) / 2;

// Gesture-driven velocities (keep moving until gesture changes)
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

// History for gesture detection
const imu1History = [];
const imu2History = [];
const MAX_HISTORY = 20; // roughly 1 second at 20 Hz

let lastShakeToggleTime1 = 0;
let lastShakeToggleTime2 = 0;
let lastSwipeTime1 = 0;
let lastSwipeTime2 = 0;

const SHAKE_THRESHOLD = 2.0;
const SHAKE_COOLDOWN_MS = 800;
const SWIPE_COOLDOWN_MS = 800;

// IMU data and gesture state
let lastImu1 = { x: NaN, y: NaN, z: NaN };
let lastImu2 = { x: NaN, y: NaN, z: NaN };
let imu1Connected = false;
let imu2Connected = false;

const GESTURE = {
  UP: 'up',
  DOWN: 'down',
  STOP: 'stop',
  UNKNOWN: 'unknown',
};

let gesture1 = GESTURE.STOP;
let gesture2 = GESTURE.STOP;

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

// Update gesture → velocity mapping.
// Once a gesture is recognized, the paddle keeps moving in that
// direction until another gesture (e.g., DOWN or STOP) is seen.
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

  if (imu2Connected) {
    const g2 = classifyGesture(lastImu2);
    if (g2 === GESTURE.UP) {
      gesture2 = GESTURE.UP;
      paddle2Vy = -PADDLE_SPEED;
    } else if (g2 === GESTURE.DOWN) {
      gesture2 = GESTURE.DOWN;
      paddle2Vy = PADDLE_SPEED;
    } else if (g2 === GESTURE.STOP) {
      gesture2 = GESTURE.STOP;
      paddle2Vy = 0;
    }
  } else {
    paddle2Vy = 0;
  }
}

// Poll IMU data for player 1
async function pollImu1() {
  try {
    const res = await fetch('/sensor1', { method: 'POST' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const { sensorValue } = data || {};
    if (sensorValue) {
      lastImu1 = sensorValue;
      const validX = typeof sensorValue.x === 'number' && Number.isFinite(sensorValue.x);
      const validY = typeof sensorValue.y === 'number' && Number.isFinite(sensorValue.y);
      const validZ = typeof sensorValue.z === 'number' && Number.isFinite(sensorValue.z);
      imu1Connected = validX && validY && validZ;

      if (imu1Connected) {
        imu1History.push({ ...sensorValue, t: Date.now() });
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

// Poll IMU data for player 2
async function pollImu2() {
  try {
    const res = await fetch('/sensor2', { method: 'POST' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const { sensorValue } = data || {};
    if (sensorValue) {
      lastImu2 = sensorValue;
      const validX = typeof sensorValue.x === 'number' && Number.isFinite(sensorValue.x);
      const validY = typeof sensorValue.y === 'number' && Number.isFinite(sensorValue.y);
      const validZ = typeof sensorValue.z === 'number' && Number.isFinite(sensorValue.z);
      imu2Connected = validX && validY && validZ;

      if (imu2Connected) {
        imu2History.push({ ...sensorValue, t: Date.now() });
        if (imu2History.length > MAX_HISTORY) imu2History.shift();
        handleSpecialGestures(2);
      }
    } else {
      imu2Connected = false;
    }
  } catch {
    imu2Connected = false;
  }

  updateImuStatus();
  setTimeout(pollImu2, 50);
}

function updateImuStatus() {
  const p1StatusEl = document.getElementById('p1Status');
  const p2StatusEl = document.getElementById('p2Status');

  const g1 = classifyGesture(lastImu1);
  const g2 = classifyGesture(lastImu2);

  if (imu1Connected) {
    p1StatusEl.textContent = `P1: connected (${g1})`;
  } else {
    p1StatusEl.textContent = 'P1: searching…';
  }

  if (imu2Connected) {
    p2StatusEl.textContent = `P2: connected (${g2})`;
  } else {
    p2StatusEl.textContent = 'P2: searching…';
  }

  // Pause game if either paddle is not connected
  if (!imu1Connected || !imu2Connected) {
    gameStarted = false;
    isPaused = false;
  }
}

// Detect vertical shakes (pause/play) and horizontal swipes (background color)
function handleSpecialGestures(playerIndex) {
  const now = Date.now();
  const history = playerIndex === 1 ? imu1History : imu2History;
  const lastImu = playerIndex === 1 ? lastImu1 : lastImu2;
  const g = classifyGesture(lastImu);

  // Vertical shake: quick large changes in Z over recent history
  if (history.length >= 4) {
    let sumAbsDeltaZ = 0;
    for (let i = 1; i < history.length; i++) {
      sumAbsDeltaZ += Math.abs(history[i].z - history[i - 1].z);
    }

    const lastShakeTime =
      playerIndex === 1 ? lastShakeToggleTime1 : lastShakeToggleTime2;

    if (
      sumAbsDeltaZ > SHAKE_THRESHOLD &&
      now - lastShakeTime > SHAKE_COOLDOWN_MS
    ) {
      // Toggle pause/play
      isPaused = !isPaused;
      if (playerIndex === 1) {
        lastShakeToggleTime1 = now;
      } else {
        lastShakeToggleTime2 = now;
      }
    }
  }

  // Horizontal swipe while in STOP: change background color
  if (g === GESTURE.STOP) {
    const current = history[history.length - 1];
    const lastSwipeTime =
      playerIndex === 1 ? lastSwipeTime1 : lastSwipeTime2;

    if (
      current &&
      typeof current.x === 'number' &&
      Math.abs(current.x) > 0.7 &&
      now - lastSwipeTime > SWIPE_COOLDOWN_MS
    ) {
      // Change background color to a random dark-ish hue
      const hue = Math.floor(Math.random() * 360);
      bgColor = `hsl(${hue}, 60%, 20%)`;

      if (playerIndex === 1) {
        lastSwipeTime1 = now;
      } else {
        lastSwipeTime2 = now;
      }
    }
  }
}

// Game loop
function updateGame() {
  // If both paddles are connected and the game hasn't started yet,
  // start the round (but allow paddles to move even before this).
  if (!gameStarted && imu1Connected && imu2Connected) {
    // Both paddles just connected: start game and reset ball.
    gameStarted = true;
    resetBall();
  }

  // If paused via vertical shake, freeze game state.
  if (isPaused) {
    return;
  }

  // Update paddle velocities based on latest gestures (always allow
  // connected paddles to move, even before the game starts).
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

  // If the game hasn't started yet or a paddle is disconnected,
  // don't move the ball or update scoring.
  if (!gameStarted || !imu1Connected || !imu2Connected) {
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

// Start everything
pollImu1();
pollImu2();
loop();

