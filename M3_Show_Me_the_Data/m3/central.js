// based on the example on https://www.npmjs.com/package/@abandonware/noble

const noble = require('@abandonware/noble');

// UUIDs must match those defined on the peripheral (see streaming_data_peripheral.ino)
const uuid_service = "1101"
// use the combined XYZ characteristic so we can visualize all axes
const uuid_value = "2104"

let sensorX = NaN
let sensorY = NaN
let sensorZ = NaN

noble.on('stateChange', async (state) => {
    if (state === 'poweredOn') {
        console.log("start scanning")
        await noble.startScanningAsync([uuid_service], false);
    }
});

noble.on('discover', async (peripheral) => {
    await noble.stopScanningAsync();
    await peripheral.connectAsync();
    const {
        characteristics
    } = await peripheral.discoverSomeServicesAndCharacteristicsAsync([uuid_service], [uuid_value]);
    readData(characteristics[0])
});

//
// read data periodically
//
let readData = async (characteristic) => {
    const value = (await characteristic.readAsync());

    // combined XYZ characteristic packs 3 floats: X[0..3], Y[4..7], Z[8..11]
    sensorX = value.readFloatLE(0);
    sensorY = value.readFloatLE(4);
    sensorZ = value.readFloatLE(8);

    console.log(`x: ${sensorX.toFixed(3)}, y: ${sensorY.toFixed(3)}, z: ${sensorZ.toFixed(3)}`);

    // read data again in t milliseconds
    setTimeout(() => {
        readData(characteristic)
    }, 10);
}

//
// hosting a web-based front-end and respond requests with sensor data
// based on example code on https://expressjs.com/
//
const express = require('express')
const app = express()
const port = 3000

app.set('view engine', 'ejs');

app.get('/', (req, res) => {
    res.render('index')
})

app.post('/', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'application/json'
    });
    res.end(JSON.stringify({
        x: sensorX,
        y: sensorY,
        z: sensorZ
    }))
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
