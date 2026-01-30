// based on the example on https://www.npmjs.com/package/@abandonware/noble
const noble = require('@abandonware/noble');

const uuid_service = "1101";
const uuid_value   = "2104";   // XYZ combined characteristic (12 bytes: x,y,z)

noble.on('stateChange', async (state) => {
  if (state === 'poweredOn') {
    console.log("start scanning");
    await noble.startScanningAsync([uuid_service], false);
  } else {
    await noble.stopScanningAsync().catch(() => {});
  }
});

noble.on('discover', async (peripheral) => {
  await noble.stopScanningAsync();

  console.log("found:", peripheral.advertisement?.localName || peripheral.id);

  await peripheral.connectAsync();

  const { characteristics } =
    await peripheral.discoverSomeServicesAndCharacteristicsAsync(
      [uuid_service],
      [uuid_value]
    );

  if (!characteristics || characteristics.length === 0) {
    console.error("XYZ characteristic not found");
    await peripheral.disconnectAsync();
    return;
  }

  readData(characteristics[0]);
});

//
// read data periodically
//
let readData = async (characteristic) => {
  const value = await characteristic.readAsync(); // Node Buffer

  // Expect 12 bytes: float32 LE x, then y, then z
  if (value.length < 12) {
    console.log(`got ${value.length} bytes (expected 12)`);
  } else {
    const x = value.readFloatLE(0);
    const y = value.readFloatLE(4);
    const z = value.readFloatLE(8);
    console.log(`${x}, ${y}, ${z}`);
  }

  // read data again in t milliseconds
  setTimeout(() => {
    readData(characteristic);
  }, 10);
};
