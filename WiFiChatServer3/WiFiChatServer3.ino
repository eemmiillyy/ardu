#include <SPI.h>
#include <WiFi101.h>
#include <MQTT.h>
#include "arduino_secrets.h" 

char ssid[] = SECRET_SSID;        // your network SSID (name)
char pass[] = SECRET_PASS;    // your network password (use for WPA, or use as key for WEP)

WiFiClient net;
MQTTClient client;

char serverThem[] =  SECRET_IP;
char currentState = '3'; //connected but alone
char serverAddress[] = SECRET_IP;  // server address
byte mac[6];
String myIp = SECRET_IP;
String ipString;
int port = 7000;
int status = WL_IDLE_STATUS;
int count = 0;
int BUTTON = 2;
int LED1 = 4;
int LED2 = 5;
int state = LOW;
int reading;
int previous = LOW;
long time = 0; 
long debounce = 300;
bool firstConnection = true;
bool connectedToServer = false;
unsigned long lastMillis = 0;

void connect() {
   Serial.println("Checking wifi...");
// attempt to connect to WiFi network:
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    status = WiFi.begin(ssid, pass);
    delay(10000);
  }
  Serial.println("Checking server authentication...");
  while (!client.connect("arduino", "try", "try")) {
    Serial.print("s.");
    delay(10000);
  }
  Serial.println("yep!");
  client.subscribe("/hello");
}

void messageReceived(String &topic, String &payload) {
  Serial.println("incoming: " + topic + " - " + payload);
}

void setup() { 
  Serial.begin(9600);
  client.begin(serverAddress, net);
  client.onMessage(messageReceived);
  connect();
  pinMode(BUTTON, INPUT);
  pinMode(LED1, OUTPUT);
  pinMode(LED2, OUTPUT);
}

void loop() {
  // connect to remote server
  client.loop();
  if (!client.connected()) {
    connect();
  }
}
