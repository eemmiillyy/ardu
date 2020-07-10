require("dotenv").config();
var WebSocketServer = require("ws").Server;
var http = require("http");
var express = require("express");
var bodyParser = require("body-parser");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
var session = require("express-session");
var pgSession = require("connect-pg-simple")(session);
var morgan = require("morgan");
var cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const saltRounds = process.env.SALT_ROUNDS;
const SESSION_LIFETIME=24 * 60 * 60 * 1000


/*********************************************************************
 *                           Database                                  *
 *********************************************************************/
const isProduction = process.env.NODE_ENV === "production";
const connectionString = `postgresql://${process.env.DB_USER}:${
  process.env.DB_PASSWORD
}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`;
const pool = new Pool({
  connectionString: isProduction ? process.env.DATABASE_URL : connectionString,
  ssl: isProduction,
});

// rate limiting
const limiter = rateLimit({
  windowMs:process.env.RATE_LIMIT_WINDOWMS,
  max: process.env.RATE_LIMIT_MAX,
});

/*********************************************************************
 *                           Utils                                  *
 *********************************************************************/
let clients = [];
let alone = function() {
  return clients.length <= 1;
};

// one user devices
const getUserDevices = async (id) => {
  const query = {
    name: "user-devices",
    text: "SELECT * FROM device WHERE ownedBy = $1",
    values: [id],
  };
  return pool
    .query(query)
    .then((res) => {
      return res.rows;
    })
    .catch((e) => {
      console.error(e.stack);
      return [];
    });
};

const formatMAC = (mac) => {
  // comes in as 2:51:EX: 5:F0:F8
  return mac.toLowerCase().trim();
};

const formatIP = (ip) => {
  // comes in as ff:ff:ff:123.123.1.123 (?)
  let addr = ip;
  let lastIndex = addr.lastIndexOf(":");
  return addr.substr(lastIndex + 1);
};

/*********************************************************************
 *                           Server                                  *
 *********************************************************************/
var app = express();
var port = process.env.PORT;
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

/*********************************************************************
 *                           Middleware                                  *
 *********************************************************************/
// redirect login middleware
const redirectLogin = (req, res, next) => {
  if (!req.session.userId || !req.app.locals.user) {
    res.redirect("/login");
  } else {
    next();
  }
};

// redirect home middleware
const redirectHome = (req, res, next) => {
  const currentCookies =
    req.get("cookie") && req.get("cookie").split(";")
      ? req.get("cookie").split(";")
      : [];
  const containsTargetCookie = currentCookies.some((cookieString) => {
    return cookieString.includes(process.env.SESSION_NAME);
  });
  if (
    (req.session.userId && req.app.locals.user) ||
    (req.app.locals.user && containsTargetCookie) //req.session.userId may not exist when server first issues the cookie
  ) {
    res.redirect("/home");
  } else {
    next();
  }
};

/*********************************************************************
 *                           Routes                                  *
 *********************************************************************/
// welcome
app.get("/", (req, res) => {
  const { userId } = req.session;
  const { user } = req.app.locals;
  const props = {
    user: user, userId: userId
  }
  res.render("welcome", props)
});

// home
app.get("/home", redirectLogin, async (req, res) => {
  const { user } = req.app.locals;
  const userDevices = await getUserDevices(user.id);
  const props = {
    title: "Home",
    message: "Home",
    user: user,
    devices: userDevices,
  };

  res.render("home", props);
});

// login
app.get("/login", redirectHome, (req, res) => {
  res.render("login");
});

// register
app.get("/register", (req, res) => {
 res.render("register");
});

// post login
app.post("/login", (req, res) => {
  const { passhash, username } = req.body;
  const query = {
    name: "login-user",
    text: 'SELECT * FROM "user" WHERE username = $1',
    values: [username],
  };
  try {
    pool.query(query, async (error, results) => {
      if (error) {
        console.log(error.stack);
        throw error;
      }
      // check password
      const savedPasshash = results.rows[0] ? results.rows[0].passhash : "";
      const matches = await bcrypt.compare(passhash, savedPasshash);
      if (matches) {
        req.session.userId = await results.rows[0].id; // the user exists so start a session
        req.app.locals.user = await results.rows[0];
        res.redirect("/home");
      } else {
        req.app.locals.user = null;
        req.session.userId = null;
        res.redirect("/home");
      }
    });
  } catch (error) {
    console.log(error);
  }
});

// post register
// to do is add email verification so a bot cannot signup with
// many fake emails
app.post("/register", async (req, res) => {
  const {
    username,
    email,
    permission,
    firstName,
    lastName,
    countryCode,
    passhash,
  } = req.body;
  const hashedpass = await bcrypt.hash(passhash, saltRounds);
  const query = {
    name: "register-user",
    text:
      'INSERT INTO "user" (username, email, permission, firstName, lastName, countryCode, passhash) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
    values: [
      username,
      email,
      permission,
      firstName,
      lastName,
      countryCode,
      hashedpass,
    ],
  };
  pool.query(query, async (error, results) => {
    if (error) {
      console.log(error.stack);
      return res.redirect("/register"); // query string errors to add
    }
    req.session.userId = await results.rows[0].id;
    req.app.locals.user = await results.rows[0];
    res.redirect("/home"); // resolves to login if there is no session
  });
});

// logout
app.post("/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.redirect("/home");
    }
    req.app.locals.user = null;
    res.clearCookie(process.env.SESSION_NAME);
    res.redirect("/login");
  });
});

app.post("/sendBitThroughGui", async (req, res) => {
  const {value} = req.body
  const userDevice = await getUserDevices(req.app.locals.user.id);
  const websocket = clients.filter(
    (websocket) => websocket.mac === formatMAC(userDevice[0].mac)
  );
  if (websocket) {
    processor.processMessage(websocket[0], value);
  }
  // todo: only refresh part of the page
  // todo: only display on/off if devices are connected to ws
  res.status(200).redirect("/home");
});

var server = http.createServer(app);
server.listen(port);
console.log("http server listening on %d", port);
var wss = new WebSocketServer({ server: server });
console.log("websocket server created");

/*********************************************************************
 *                           Message Broker                          *
 *********************************************************************/
class MessageBroker {
  constructor() {
    //routing messages to either processor or database manager
    this.handleServerConnection = function(websocket) {
      processor.processConnection(websocket);
    };
    this.handleServerDisconnection = function(websocket) {
      processor.processDisconnection(websocket);
    };
    this.handleSocketSpecificMessage = function(websocket, message) {
      processor.processMessage(websocket, message);
    };
  }
}
/*********************************************************************
 *                           Processor                                  *
 *********************************************************************/
class Processor {
  constructor() {
    this.processConnection = function(websocket) {
      websocket.isAlive = true;
      websocket.alreadyConnected = false;
      websocket.count = 0;
      clients.push(websocket);
      if (alone()) {
        deviceController.feedback(websocket, 3);
      } else {
        deviceController.multicast(websocket, 4);
        deviceController.feedback(websocket, 4);
      }
    };
    this.processDisconnection = function(websocket) {
      for (var i = 0; i < clients.length; i++) {
        if (clients[i] === websocket) {
          websocket.terminate();
          clients.splice(i);
        }
      }
      if (alone()) {
        deviceController.multicast(websocket, 3);
      } else {
        deviceController.multicast(websocket, 4);
      }
    };

    this.processMessage = async (websocket, message) => {
      if (websocket.count === 0) {
        websocket.count += 1;
        const clientIndex = clients.findIndex((client) => {
          return (
            formatIP(client._socket.remoteAddress) ===
            formatIP(websocket._socket.remoteAddress)
          );
        });
        if (clientIndex > -1) {
          clients[clientIndex].mac = formatMAC(message);
        }
      } else {
        deviceController.multicast(websocket, message);
        deviceController.feedback(websocket, message);
      }
    };
  }
}

/*********************************************************************
 *                           Device                                  *
 *********************************************************************/
class DeviceController {
  constructor() {
    //sends x.ipaddress;
    this.multicast = function(websocket, statusCode) {
      for (var i = 0; i < clients.length; i++) {
        if (clients[i] !== websocket) {
          let address = formatIP(websocket._socket.remoteAddress);
          clients[i].send(statusCode + address);
        }
      }
    };
    this.feedback = function(websocket, statusCode) {
      let address = formatIP(websocket._socket.remoteAddress);
      websocket.send(statusCode + address);
    };
  }
}

let messageBroker = new MessageBroker();
let processor = new Processor();
let deviceController = new DeviceController();

/*********************************************************************
 *                           Backend                                  *
 *********************************************************************/
//backend server listeners
// only allow connections from registered devices to currently logged in user
wss.on("connection", function(ws) {
  messageBroker.handleServerConnection(ws);
  //move to handleServer connnection function
  ws.on("pong", function heartbeat() {
    for (var i = 0; i < clients.length; i++) {
      if (clients[i] === ws) {
        clients[i].alreadyConnected = true;
        clients[i].isAlive = true;
      }
    }
  });
  ws.on("close", function() {
    messageBroker.handleServerDisconnection(ws);
  });
  ws.on("message", function(message) {
    messageBroker.handleSocketSpecificMessage(ws, message);
  });
});

const interval = setInterval(function ping() {
  for (var i = 0; i < clients.length; i++) {
    if (clients[i].isAlive === false) {
      if (clients[i].alreadyConnected === true) {
        messageBroker.handleServerDisconnection(clients[i]);
      }
      return;
    }
    clients[i].isAlive = false;
    clients[i].ping();
  }
}, process.env.HEARTBEAT_INTERVAL);
interval;
