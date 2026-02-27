// Browser-side Pong game that uses IMU data from the Arduino
// via periodic HTTP POSTs to /sensor.

const canvas = document.getElementById('pongCanvas');
const ctx = canvas.getContext('2d');

// Game objects
const paddleWidth = 10;
const paddleHeight = 80;
const ballRadius = 8;

let paddleY = (canvas.height - paddleHeight) / 2;
let imuPaddleY = paddleY; // target from IMU

let ballX = canvas.width / 2;
let ballY = canvas.height / 2;
let ballVX = 4;
let ballVY = 3;

let playerScore = 0;
let opponentScore = 0;

// IMU data and transfer function state
let lastImu = { x: NaN, y: NaN, z: NaN };
let imuConnected = false;

// Simple transfer function:
// Use accelerometer Y (tilt) to map to paddle position.
// Typical range is about [-1g, 1g]; we clamp to that and map to [0, canvas.height - paddleHeight].
function imuToPaddleY({ x, y, z }) {
  if (Number.isNaN(y)) {
    return paddleY;
  }

  // Clamp tilt to [-1, 1]
  const minTilt = -1.0;
  const maxTilt = 1.0;
  const clampedY = Math.max(minTilt, Math.min(maxTilt, y));

  // Normalize to [0, 1]; flip so that tilting "up" moves paddle up
  const normalized = (clampedY - minTilt) / (maxTilt - minTilt); // 0..1

  // Map to canvas coordinates
  const target = normalized * (canvas.height - paddleHeight);
  return target;
}

// Poll IMU data from server
async function pollImu() {
  try {
    const res = await fetch('/sensor', { method: 'POST' });
    if (!res.ok) {
      throw new Error('HTTP ' + res.status);
    }
    const data = await res.json();
    const { sensorValue } = data || {};
    if (sensorValue) {
      lastImu = sensorValue;
      const validX = typeof sensorValue.x === 'number' && Number.isFinite(sensorValue.x);
      const validY = typeof sensorValue.y === 'number' && Number.isFinite(sensorValue.y);
      const validZ = typeof sensorValue.z === 'number' && Number.isFinite(sensorValue.z);
      imuConnected = validX && validY && validZ;
    } else {
      imuConnected = false;
    }
  } catch (err) {
    imuConnected = false;
  }

  updateImuStatus();

  // Schedule next poll
  setTimeout(pollImu, 50); // ~20 Hz is plenty for paddle control
}

function updateImuStatus() {
  const statusEl = document.getElementById('imuStatus');
  const rawEl = document.getElementById('rawImu');

  if (imuConnected) {
    statusEl.textContent = 'IMU: connected';
  } else {
    statusEl.textContent = 'IMU: searching… (check WiFi + Arduino)';
  }

  rawEl.textContent =
    ' ax=' +
    lastImu.x.toFixed ? lastImu.x.toFixed(2) : lastImu.x +
    ' ay=' +
    (lastImu.y.toFixed ? lastImu.y.toFixed(2) : lastImu.y) +
    ' az=' +
    (lastImu.z.toFixed ? lastImu.z.toFixed(2) : lastImu.z);
}

// Game loop
function updateGame() {
  // Smooth paddle movement towards IMU target
  const targetY = imuToPaddleY(lastImu);
  const alpha = 0.2; // low-pass coefficient
  imuPaddleY = targetY;
  paddleY = paddleY + alpha * (imuPaddleY - paddleY);

  // Constrain paddle to canvas
  if (paddleY < 0) paddleY = 0;
  if (paddleY > canvas.height - paddleHeight) {
    paddleY = canvas.height - paddleHeight;
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

  // Collide with right wall (simple single-player mode)
  if (ballX + ballRadius > canvas.width) {
    ballX = canvas.width - ballRadius;
    ballVX = -ballVX;
  }

  // Collide with left paddle
  if (
    ballX - ballRadius < paddleWidth &&
    ballY > paddleY &&
    ballY < paddleY + paddleHeight &&
    ballVX < 0
  ) {
    ballX = paddleWidth + ballRadius;
    ballVX = -ballVX;

    // Add a little "spin" based on where the ball hits the paddle
    const hitPos = (ballY - (paddleY + paddleHeight / 2)) / (paddleHeight / 2);
    ballVY += hitPos * 2;
    playerScore += 1;
  }

  // Missed the paddle -> opponent scores, reset ball
  if (ballX + ballRadius < 0) {
    opponentScore += 1;
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
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Center line
  ctx.strokeStyle = '#444';
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);

  // Paddle
  ctx.fillStyle = '#0f0';
  ctx.fillRect(0, paddleY, paddleWidth, paddleHeight);

  // Ball
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(ballX, ballY, ballRadius, 0, Math.PI * 2);
  ctx.fill();

  // Scores
  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  ctx.fillText('You: ' + playerScore, 20, 30);
  ctx.fillText('Wall: ' + opponentScore, canvas.width - 130, 30);
}

function loop() {
  updateGame();
  drawGame();
  requestAnimationFrame(loop);
}

// Start everything
pollImu();
loop();

