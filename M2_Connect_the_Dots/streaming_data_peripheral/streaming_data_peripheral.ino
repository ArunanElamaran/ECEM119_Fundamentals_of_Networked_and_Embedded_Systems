#include <ArduinoBLE.h>
#include <Arduino_LSM6DS3.h>

#define BLE_UUID_ACCELEROMETER_SERVICE "1101"

#define BLE_UUID_ACCELEROMETER_X   "2101"
#define BLE_UUID_ACCELEROMETER_Y   "2102"
#define BLE_UUID_ACCELEROMETER_Z   "2103"
#define BLE_UUID_ACCELEROMETER_XYZ "2104"

#define BLE_DEVICE_NAME "Elfo"
#define BLE_LOCAL_NAME  "Elfo"

#define ACCEL_READ_DELAY 200
#define COMBINED_SIZE    3*sizeof(float) // 4 bytes for each, x, y, z

BLEService accelerometerService(BLE_UUID_ACCELEROMETER_SERVICE);

BLEFloatCharacteristic accelerometerCharacteristicX(BLE_UUID_ACCELEROMETER_X, BLERead | BLENotify);
BLEFloatCharacteristic accelerometerCharacteristicY(BLE_UUID_ACCELEROMETER_Y, BLERead | BLENotify);
BLEFloatCharacteristic accelerometerCharacteristicZ(BLE_UUID_ACCELEROMETER_Z, BLERead | BLENotify);
BLECharacteristic accelerometerCharacteristicXYZ(BLE_UUID_ACCELEROMETER_XYZ, BLERead | BLENotify, COMBINED_SIZE);

float x, y, z;

void setup() {
  Serial.begin(9600);
  while (!Serial)
    ;

  // initialize IMU
  if (!IMU.begin()) {
    Serial.println("Failed to initialize IMU!");
    while (1)
      ;
  }

  Serial.print("Accelerometer sample rate = ");
  Serial.print(IMU.accelerationSampleRate());
  Serial.println("Hz");

  // initialize BLE
  if (!BLE.begin()) {
    Serial.println("Starting Bluetooth® Low Energy module failed!");
    while (1)
      ;
  }

  // set advertised local name and service UUID
  BLE.setLocalName(BLE_LOCAL_NAME);
  BLE.setAdvertisedService(accelerometerService);

  // add characteristics and service
  accelerometerService.addCharacteristic(accelerometerCharacteristicX);
  accelerometerService.addCharacteristic(accelerometerCharacteristicY);
  accelerometerService.addCharacteristic(accelerometerCharacteristicZ);
  accelerometerService.addCharacteristic(accelerometerCharacteristicXYZ);
  BLE.addService(accelerometerService);

  // start advertising
  BLE.advertise();

  Serial.println("BLE Accelerometer Peripheral");
}

void loop() {
  BLEDevice central = BLE.central();

  // -----------------------------------
  // Obtain and send accelerometer data
  // -----------------------------------
  // if a central is connected to peripheral:
  if (central) {
    Serial.print("Connected to central: ");
    // print the central's MAC address:
    Serial.println(central.address());
    // while the central is still connected to peripheral:
    while (central.connected()) {

      if (IMU.accelerationAvailable()) {
        IMU.readAcceleration(x, y, z);
        accelerometerCharacteristicX.writeValue(x);
        accelerometerCharacteristicY.writeValue(y);
        accelerometerCharacteristicZ.writeValue(z);
      }
      
      uint8_t xyzBytes[COMBINED_SIZE];
      memcpy(&xyzBytes[0], &x, sizeof(float));                  // X in bytes [0..3]
      memcpy(&xyzBytes[sizeof(float)], &y, sizeof(float));      // Y in bytes [4..7]
      memcpy(&xyzBytes[2 * sizeof(float)], &z, sizeof(float));  // Z in bytes [8..11]

      accelerometerCharacteristicXYZ.writeValue(xyzBytes, COMBINED_SIZE);
      }
    }
    // when the central disconnects, print it out:
    Serial.print(F("Disconnected from central: "));
    Serial.println(central.address());
}