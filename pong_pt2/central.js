// WiFi-based two-player Pong server
// Fetches IMU data from two Arduino paddles over WiFi
// and exposes it to the browser Pong game.

const http = require('http');
const express = require('express');
const path = require('path');

// Configure the Arduino paddle endpoints.
// Set PONG_PADDLE1_HOST and PONG_PADDLE2_HOST in your environment
// to override these IPs (e.g., export PONG_PADDLE1_HOST=172.20.10.7).
const ARDUINO1_HOST = process.env.PONG_PADDLE1_HOST || '172.20.10.7';
const ARDUINO2_HOST = process.env.PONG_PADDLE2_HOST || '172.20.10.8';
const ARDUINO_PORT = 80;
const ARDUINO_PATH = '/sensor';
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

// Helper to request the latest IMU reading from a given Arduino.
function fetchImuFromArduino(host, callback) {
  let finished = false;
  const done = (err, result) => {
    if (finished) return;
    finished = true;
    callback(err, result);
  };

  const options = {
    host,
    port: ARDUINO_PORT,
    path: ARDUINO_PATH,
    method: 'GET',
    timeout: 1000,
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

// Endpoint polled by the browser to get latest IMU data for player 1.
// Verifies the deviceName so we only accept data from the expected paddle.
app.post('/sensor1', (req, res) => {
  fetchImuFromArduino(ARDUINO1_HOST, (err, aru) => {
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

// Endpoint polled by the browser to get latest IMU data for player 2.
app.post('/sensor2', (req, res) => {
  fetchImuFromArduino(ARDUINO2_HOST, (err, aru) => {
    if (err) {
      console.error('Error fetching IMU from Arduino 2:', err.message);
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
        'Unexpected device or missing sensor data from Arduino 2:',
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
    `Expecting Arduino paddle 1 at http://${ARDUINO1_HOST}:${ARDUINO_PORT}${ARDUINO_PATH} with name "${EXPECTED_DEVICE_NAME}"`,
  );
  console.log(
    `Expecting Arduino paddle 2 at http://${ARDUINO2_HOST}:${ARDUINO_PORT}${ARDUINO_PATH} with name "${EXPECTED_DEVICE_NAME}"`,
  );
});

