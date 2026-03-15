// IMU-over-WiFi streamer for Pong paddle
// Streams accelerometer data via a simple HTTP JSON endpoint.

#include <SPI.h>
#include <WiFiNINA.h>
#include <Arduino_LSM6DS3.h>

// Replace with your WiFi credentials
char ssid[] = "NoonyPhone";
char pass[] = "applesauce32";
int keyIndex = 0; // not used for WPA/WPA2, kept for compatibility

// Logical device name used by the laptop code to verify
// it is talking to the correct paddle.
const char DEVICE_NAME[] = "PongPaddle";

int status = WL_IDLE_STATUS;
WiFiServer server(80);

float ax, ay, az;

void printWifiStatus() {
  Serial.print("SSID: ");
  Serial.println(WiFi.SSID());

  IPAddress ip = WiFi.localIP();
  Serial.print("IP Address: ");
  Serial.println(ip);

  long rssi = WiFi.RSSI();
  Serial.print("signal strength (RSSI):");
  Serial.print(rssi);
  Serial.println(" dBm");

  Serial.print("IMU endpoint: http://");
  Serial.print(ip);
  Serial.println("/sensor");
}

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);

  Serial.begin(9600);
  while (!Serial)
    ;

  // Initialize IMU
  if (!IMU.begin()) {
    Serial.println("Failed to initialize IMU!");
    while (1)
      ;
  }

  Serial.print("Accelerometer sample rate = ");
  Serial.print(IMU.accelerationSampleRate());
  Serial.println("Hz");

  // Check WiFi module
  if (WiFi.status() == WL_NO_MODULE) {
    Serial.println("Communication with WiFi module failed!");
    while (true)
      ;
  }

  String fv = WiFi.firmwareVersion();
  if (fv < WIFI_FIRMWARE_LATEST_VERSION) {
    Serial.println("Please upgrade the firmware");
  }

  // Connect to WiFi network
  while (status != WL_CONNECTED) {
    Serial.print("Attempting to connect to network: ");
    Serial.println(ssid);
    status = WiFi.begin(ssid, pass);
    delay(10000);
  }

  digitalWrite(LED_BUILTIN, HIGH); // indicate WiFi connected

  server.begin();
  printWifiStatus();
}

void handleClient(WiFiClient &client) {
  String currentLine = "";

  while (client.connected()) {
    if (client.available()) {
      char c = client.read();
      // accumulate request line
      if (c == '\n') {
        // blank line indicates end of HTTP request headers
        if (currentLine.length() == 0) {
          // Read latest IMU sample
          if (IMU.accelerationAvailable()) {
            IMU.readAcceleration(ax, ay, az);
          }

          // Send HTTP response with JSON body
          client.println("HTTP/1.1 200 OK");
          client.println("Content-Type: application/json");
          client.println("Access-Control-Allow-Origin: *");
          client.println();

          client.print("{\"deviceName\":\"");
          client.print(DEVICE_NAME);
          client.print("\",\"sensorValue\":{");
          client.print("\"x\":");
          client.print(ax, 6);
          client.print(",\"y\":");
          client.print(ay, 6);
          client.print(",\"z\":");
          client.print(az, 6);
          client.println("}}");

          break;
        } else {
          currentLine = "";
        }
      } else if (c != '\r') {
        currentLine += c;
      }
      delay(10);
    }
  }

  client.stop();
}

void loop() {
  WiFiClient client = server.available();
  if (client) {
    Serial.println("New HTTP client");
    handleClient(client);
    Serial.println("Client disconnected");
  }
}
