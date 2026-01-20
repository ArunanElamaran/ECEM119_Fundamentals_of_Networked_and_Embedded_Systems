#include <Arduino_LSM6DS3.h>

float Ax, Ay, Az;
float Gx, Gy, Gz;

void setup() {
  Serial.begin(9600);

  while(!Serial);

  if (!IMU.begin()) {
    Serial.println("Failed to initialize IMU!");
    while (1);
  }

  Serial.print("Accelerometer sample rate = ");
  Serial.print(IMU.accelerationSampleRate());
  Serial.println("Hz");
  Serial.println();

  Serial.print("Gyroscope sample rate = ");  
  Serial.print(IMU.gyroscopeSampleRate());
  Serial.println("Hz");
  Serial.println();

}

void loop() {

  if (IMU.accelerationAvailable()) {
    IMU.readAcceleration(Ax, Ay, Az);

    // Serial.println("Accelerometer data: ");
    Serial.print(Ax);
    Serial.print(", ");
    Serial.print(Ay);
    Serial.print(", ");
    Serial.print(Az);
    Serial.print(", ");
  }

  if (IMU.gyroscopeAvailable()) {
    IMU.readGyroscope(Gx, Gy, Gz);
    
    // Serial.println("Gyroscope data: ");
    Serial.print(Gx);
    Serial.print(", ");
    Serial.print(Gy);
    Serial.print(", ");
    Serial.print(Gz);
  }
  Serial.println();

delay(500);

}