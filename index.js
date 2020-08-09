require("dotenv").config();
var http = require("http");
var express = require("express");
var bodyParser = require("body-parser");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
var session = require("express-session");
var pgSession = require("connect-pg-simple")(session);
var morgan = require("morgan");
var cors = require("cors");
const { Pool, types } = require("pg");
const ws = require("websocket-stream");
const SESSION_LIFETIME = 24 * 60 * 60 * 1000;
types.setTypeParser(1114, function(stringValue) {
  return stringValue;
});

// Client is one static connection. Pool manages a dynamic list/pool of Client objects, with automatic re-connect functionality
const isProduction = process.env.NODE_ENV === "production";
const connectionString = `postgresql://${process.env.DB_USER}:${
  process.env.DB_PASSWORD
}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`;
const pool = new Pool({
  connectionString: isProduction ? process.env.DATABASE_URL : connectionString,
  ssl: isProduction,
});
const Utils = require("././src/utils.js")();
const Device = require("././src/queries/device")(pool, Utils);
const Invitation = require("././src/queries/invitation")(pool, Device);
const User = require("././src/queries/user")(pool, Device, Invitation);
const Middleware = require("././src/middleware")();

/*********************************************************************
 *                           Server                                  *
 *********************************************************************/
const limiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOWMS,
  max: process.env.RATE_LIMIT_MAX,
});

var app = express();
var port = process.env.PORT;
var mqttPort = process.env.MQTTPORT;
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
app.use(morgan("dev"));
app.use(
  session({
    store: new pgSession({
      pool: pool,
    }),
    name: process.env.SESSION_NAME,
    cookie: { maxAge: SESSION_LIFETIME, secure: isProduction },
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(helmet());
app.set("view engine", "pug");
var httpServer = http.createServer(app);

const aedes = require("aedes")({
  authenticate: async (client, mac, password, callback) => {
    console.log("AUTH", mac);
    console.log(await User.authorizeUserByMac(mac)); // authorize if mac addressed is registered to this user and session cookie for user is set
    if ((await User.authorizeUserByMac(mac)) == false)
      return callback({ message: "no session cookie for device owner" });
    callback(null, true);
    //publishing and subscribing should be /clientID/peerID
  },
  authorizePublish: (client, packet, callback) => {
    console.log("PUB", packet.cmd);
    callback(null);
  },
  authorizeSubscribe: (client, sub, callback) => {
    console.log("SUB", sub);
    callback(null, sub);
  },
});
aedes.on("clientDisconnect", () => {
  console.log("disconnected");
});

var mqttServer = require("net").createServer(aedes.handle);
ws.createServer({ server: mqttServer }, aedes.handle);

const startServers = function() {
  return new Promise((res, rej) => {
    httpServer.listen(port, function() {
      console.log("http server listening on port:" + port);
    });
    mqttServer.listen(mqttPort, function() {
      console.log("Aedes MQTT listening on port:" + mqttPort);
      return res();
    });
  });
};
(async function() {
  try {
    await startServers();
  } catch (e) {
    console.log("error", e);
  }
})();

/*********************************************************************
 *                           Routes                                  *
 *********************************************************************/
app.get("/", (req, res) => {
  const { userId } = req.session;
  const { user } = req.app.locals;
  const props = {
    user: user,
    userId: userId,
  };
  res.render("welcome", props);
});
app.get("/login", Middleware.redirectHome, (req, res) => {
  res.render("login");
});
app.get("/register", Middleware.redirectHome, (req, res) => {
  res.render("register");
});
app.get("/home", Middleware.redirectLogin, User.home);
app.post("/login", User.login);
app.post("/register", User.register);
app.post("/logout", User.logout);
app.post("/sendBitThroughGui", Device.sendBitThroughGui);
app.post("/invite/new", Invitation.new);
app.post("/invite/accept", Invitation.accept);
app.post("/invite/reject", Invitation.reject);
