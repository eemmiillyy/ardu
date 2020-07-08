#include <ArduinoHttpClient.h>
#include <SPI.h>
#include <WiFi101.h>


#include "arduino_secrets.h" 
char ssid[] = SECRET_SSID;        // your network SSID (name)
char pass[] = SECRET_PASS;    // your network password (use for WPA, or use as key for WEP)
char serverThem[] =  SECRET_IP;
String myIp = SECRET_IP;
String ipString;
char serverAddress[] = SECRET_IP;  // server address
int port = 7000;
byte mac[6];

WiFiClient wifi;
WebSocketClient client = WebSocketClient(wifi, serverAddress, port);
int status = WL_IDLE_STATUS;
int count = 0;

boolean connectedToServer = false;
char currentState = '3'; //connected but alone
bool firstConnection = true;

int BUTTON = 2;
int LED1 = 4;
int LED2 = 5;
int state = LOW;
int reading;
int previous = LOW;

long time = 0; 
long debounce = 300;

void setup() {
  pinMode(BUTTON, INPUT);
  pinMode(LED1, OUTPUT);
  pinMode(LED2, OUTPUT);
  //Initialize serial and wait for port to open:
  Serial.begin(9600);
  //while (!Serial) {
   // ; // wait for serial port to connect. Needed for native USB port only
  //}

  // check for the presence of the shield:
  if (WiFi.status() == WL_NO_SHIELD) {
    Serial.println("WiFi shield not present");
    // don't continue:
    while (true);
  }

  // attempt to connect to WiFi network:
  while ( status != WL_CONNECTED) {
    Serial.print("Attempting to connect to SSID: ");
    Serial.println(ssid);
    // Connect to WPA/WPA2 network. Change this line if using open or WEP network:
    status = WiFi.begin(ssid, pass);

    // wait 10 seconds for connection:
    delay(10000);
  }

  printWiFiStatus();

}

void loop() {
  // connect to remote server
  if (connectedToServer == false) {
      Serial.println("Starting websocket client");
      client.begin(); //connect to server

      connectedToServer = true;
      
        while (client.connected()) {
          //send mac address to the server as first message
           if (firstConnection) {
              WiFi.macAddress(mac);  
              client.beginMessage(TYPE_TEXT);
              char macAddr[18];
              sprintf(macAddr, "%2X:%2X:%2X:%2X:%2X:%2X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
              client.print(macAddr);
              Serial.print(macAddr);
              client.endMessage();
              firstConnection = false;
            }  
            
            // check if a message is available to be received
            int messageSize = client.parseMessage();
            if (messageSize > 0) {
              // read from server
                  String c = client.readString();
                  char cc = c[0];
                 
                  c.remove(0,1);
                  currentState = cc;
         
                  if (cc == '0') {
                    if (c == ipString) {
                        digitalWrite(LED2, LOW);
                        if (state == HIGH) {
                          state = LOW;
                        } else {
                          state = HIGH;
                        }
                      } else {
                        digitalWrite(LED1, LOW);
                     }
                  } else if (cc == '1') {
                     if (c == ipString) {
                        digitalWrite(LED2, HIGH);
                        if (state == HIGH) {
                          state = LOW;
                        } else {
                          state = HIGH;
                        }
                      } else {
                        digitalWrite(LED1, HIGH);
                      }
                  } 
                  else if (cc == '3') {
                      digitalWrite(LED1, LOW);
                      digitalWrite(LED2, LOW);
                  } else if (cc == '4') {
                      digitalWrite(LED1, HIGH);
                      digitalWrite(LED2, HIGH);
                  }

                Serial.print("Received a message:");
                Serial.println(cc);
                delay(500);
              } 

            // write to server  
            if (currentState != '3') {
                reading = digitalRead(BUTTON);
                if (reading == HIGH && previous == LOW && millis() - time > debounce) {
                    if (state == HIGH) {
                        //state = LOW;
                    }
                    else {
                        //state = HIGH;
                        time = millis();
                    }
                    client.beginMessage(TYPE_TEXT);
                    client.print(state);
                    client.endMessage();
                }
            }     
            previous = reading;      
        } // while connected
        Serial.println("disconnected");
        digitalWrite(LED1, LOW);
        digitalWrite(LED2, LOW);
        connectedToServer = false;
        firstConnection = true;
        currentState = '3';
         // wait 10 seconds for connection:
        delay(10000);

  }
}

void printWiFiStatus() {
  // print the SSID of the network you're attached to:
  Serial.print("SSID: ");
  Serial.println(WiFi.SSID());

  // print your WiFi shield's IP address:
  IPAddress ipAddress = WiFi.localIP();
  ipString = String(ipAddress[0]) + String(".") +\
  String(ipAddress[1]) + String(".") +\
  String(ipAddress[2]) + String(".") +\
  String(ipAddress[3]);
  Serial.print("IP Address: ");
  Serial.println(ipAddress);

  // print the received signal strength:
  long rssi = WiFi.RSSI();
  Serial.print("signal strength (RSSI):");
  Serial.print(rssi);
  Serial.println(" dBm");
}