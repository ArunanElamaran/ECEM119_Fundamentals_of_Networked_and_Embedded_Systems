// based on the example on https://www.npmjs.com/package/@abandonware/noble

const noble = require('@abandonware/noble');

const uuid_service = "1101"
// use combined XYZ characteristic so we can visualize all axes
const uuid_value = "2104"

let sensorValue = {
    x: NaN,
    y: NaN,
    z: NaN
}

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

    // combined XYZ: three little-endian floats, 4 bytes each
    const x = value.readFloatLE(0);
    const y = value.readFloatLE(4);
    const z = value.readFloatLE(8);

    sensorValue = { x, y, z };
    console.log(sensorValue);

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
        sensorValue: sensorValue
    }))
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
