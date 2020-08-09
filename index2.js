const mqtt = require("mqtt");
//test client
const connectionOptions = {
  port: 1883,
  host: "localhost",
  rejectUnauthorized: true,
  protocol: "mqtt",
  username: "4:51:EB: 5:F0:F3",
  password: "password",
};
const mqttCli = mqtt.connect(connectionOptions);
// mqttCli.subscribe("/hello", "world");
mqttCli.on("connect", (ack) => {
  console.log("MQTT Client Connected!", ack);
  mqttCli.on("message", (topic, message) => {
    //may have to convert message buffer to string then parseJson to get object
    console.log(
      `MQTT Client Message.  Topic: ${topic}.  Message: ${message.toString()}`
    );
  });
});
mqttCli.on("error", (err) => {
  console.log(err);
});
mqttCli.publish("/hello", "world");
