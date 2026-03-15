// WiFi-based Pong server
// Fetches IMU data from the Arduino paddle over WiFi
// and exposes it to the browser Pong game.

const http = require('http');
const express = require('express');
const path = require('path');

// Configure the Arduino paddle endpoint and expected name.
// Set PONG_PADDLE_HOST in your environment to override the IP.
// PONG_ARDUINO_TIMEOUT_MS: request timeout in ms (default 5000). Increase if the Arduino uses a large delay() in request handling.
const ARDUINO_HOST = process.env.PONG_PADDLE_HOST || '172.20.10.7';
const ARDUINO_PORT = 80;
const ARDUINO_PATH = '/sensor';
const ARDUINO_TIMEOUT_MS = parseInt(process.env.PONG_ARDUINO_TIMEOUT_MS || '5000', 10) || 5000;
const EXPECTED_DEVICE_NAME = 'PongPaddle';

const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Main Pong page
app.get('/', (req, res) => {
  res.render('index');
});

// Helper to request the latest IMU reading from the Arduino.
// Ensures the callback is only invoked once (avoids ERR_HTTP_HEADERS_SENT
// when both 'timeout' and 'error' fire).
function fetchImuFromArduino(callback) {
  let finished = false;
  const done = (err, result) => {
    if (finished) return;
    finished = true;
    callback(err, result);
  };

  const options = {
    host: ARDUINO_HOST,
    port: ARDUINO_PORT,
    path: ARDUINO_PATH,
    method: 'GET',
    timeout: ARDUINO_TIMEOUT_MS,
  };

  const req = http.request(options, (resp) => {
    let data = '';
    resp.on('data', (chunk) => {
      data += chunk;
    });
    resp.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        done(null, parsed);
      } catch (e) {
        done(e);
      }
    });
  });

  req.on('error', (err) => done(err));
  req.on('timeout', () => {
    req.destroy();
    done(new Error('Timeout talking to Arduino'));
  });

  req.end();
}

// Endpoint polled by the browser to get latest IMU data.
// Verifies the deviceName so we only accept data from the
// expected paddle.
app.post('/sensor', (req, res) => {
  fetchImuFromArduino((err, aru) => {
    if (err) {
      console.error('Error fetching IMU from Arduino:', err.message);
      res.type('application/json');
      return res.send(
        JSON.stringify({
          sensorValue: { x: NaN, y: NaN, z: NaN },
        }),
      );
    }

    const deviceName = aru && aru.deviceName;
    const sensorValue = aru && aru.sensorValue;

    if (deviceName !== EXPECTED_DEVICE_NAME || !sensorValue) {
      console.error(
        'Unexpected device or missing sensor data from Arduino:',
        deviceName,
      );
      res.type('application/json');
      return res.send(
        JSON.stringify({
          sensorValue: { x: NaN, y: NaN, z: NaN },
        }),
      );
    }

    res.type('application/json');
    res.send(JSON.stringify({ sensorValue }));
  });
});

app.listen(port, () => {
  console.log(`Pong server listening at http://localhost:${port}`);
  console.log(
    `Expecting Arduino paddle at http://${ARDUINO_HOST}:${ARDUINO_PORT}${ARDUINO_PATH} with name "${EXPECTED_DEVICE_NAME}"`,
  );
  console.log(`Arduino request timeout: ${ARDUINO_TIMEOUT_MS} ms`);
});

