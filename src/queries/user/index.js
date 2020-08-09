const bcrypt = require("bcrypt");
const saltRounds = 10;

module.exports = (pool, Device, Invitation) => {
  return {
    // device is registered and this user is logged in through portal (has cookie set)
    authorizeUserByMac: async (mac) => {
      const query = {
        name: "user-by-mac",
        text:
          "SELECT CU.customerId AS id FROM (SELECT U.id, D.mac FROM device AS D INNER JOIN \"user\" AS U ON U.id = D.ownedBy WHERE LOWER(D.mac) = LOWER($1)) AS DU INNER JOIN (SELECT sess -> 'userId' ->> 'id' AS customerId FROM session) AS CU ON DU.id = CAST (CU.customerId AS INTEGER)",
        values: [mac],
      };
      return pool
        .query(query)
        .then(async (results) => {
          if (!results.rows[0]) return false;
          const updateDeviceLogin = async (mac) => {
            const lastOnline = new Date()
              .toISOString()
              .slice(0, 19)
              .replace("T", " ");
            const query = {
              name: "update-device-last-online",
              text:
                "UPDATE device SET lastOnline = $1 WHERE LOWER(mac) = LOWER($2) RETURNING id",
              values: [lastOnline, mac],
            };
            return pool
              .query(query)
              .then(async (results) => {
                if (results.rows[0].id) {
                  return true;
                } else {
                  throw new Error();
                }
              })
              .catch((e) => {
                console.error(e.stack);
                throw new Error();
              });
          };
          await updateDeviceLogin(mac);
          return true;
        })
        .catch((e) => {
          console.error(e.stack);
          return false;
        });
    },
    register: async (req, res) => {
      const { username, email, firstName, lastName, passhash } = req.body;
      const createdAt = new Date()
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      const lastLogin = new Date()
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      const hashedpass = await bcrypt.hash(passhash, saltRounds);
      const query = {
        name: "register-user",
        text:
          'INSERT INTO "user" (username, email, firstName, lastName, passhash, createdAt, lastLogin) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, username, email, firstName, lastName',
        values: [
          username,
          email,
          firstName,
          lastName,
          hashedpass,
          createdAt,
          lastLogin,
        ],
      };
      pool
        .query(query)
        .then(async (results) => {
          if (!results.rows || !results.rows[0]) {
            return res.status(200).redirect("/register");
          }
          req.session.userId = results.rows[0].id;
          req.app.locals.user = results.rows[0];
          return res.status(200).redirect("/home");
        })
        .catch((e) => {
          console.error(e.stack);
          return res.status(200).redirect("/register");
        });
    },
    login: async (req, res) => {
      const { passhash, username } = req.body;
      const lastLogin = new Date()
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const queryText =
          'SELECT id, username, email, firstName, lastName, passhash FROM "user" WHERE lower(username) = $1 LIMIT 1';
        const results = await client.query(queryText, [username.toLowerCase()]);
        const userId =
          results && results.rows && results.rows[0]
            ? results.rows[0].id
            : null;
        if (!userId) throw new Error();
        const savedPasshash = results.rows[0].passhash;
        const matches = await bcrypt.compare(passhash, savedPasshash);
        if (!matches) {
          req.app.locals.user = null;
          req.session.userId = null;
          throw new Error();
        } else {
          req.session.userId = results.rows[0]; // the user exists so start a session
          delete savedPasshash;
          req.app.locals.user = results.rows[0];
          const queryTextUpdate =
            'UPDATE "user" SET lastLogin = $1 WHERE id = $2';
          await client.query(queryTextUpdate, [lastLogin, userId]);
          await client.query("COMMIT");
        }
      } catch (e) {
        console.log("error in transaction, rollingback");
        await client.query("ROLLBACK");
        throw e;
      } finally {
        console.log("done");
        client.release();
        return res.status(200).redirect("/home");
      }
    },
    home: async (req, res) => {
      const { user } = req.app.locals;
      if (!user) return false;
      const userDevices = await Device.getUserDevices(user.id);
      if (!userDevices) return false;
      await Promise.all(
        userDevices.map(async (device, i) => {
          let invitation = await Invitation.displaySentInvitations(device.id);
          let invitationsReceived = await Invitation.displayRecievedInvitations(
            device.id
          );
          await Promise.all(
            invitationsReceived.map(async (receivedInvitation, index) => {
              if (!receivedInvitation.seenat)
                await Invitation.updateInvitationSeenAt(receivedInvitation.id);
            })
          );
          let combined = [...invitation, ...invitationsReceived];
          let highest = new Date("2010-08-03 12:45:39");
          let pairedWith = await Promise.all(
            combined.filter((invite) => {
              if (invite.accepted) {
                let timeAccepted = invite.acceptedat;
                let newTimeFormat = new Date(timeAccepted.replace(" ", "T"));
                if (newTimeFormat >= highest) {
                  highest = newTimeFormat;
                  return true;
                }
              }
            })
          );
          let peerDeviceId = pairedWith.length
            ? pairedWith[0].senderid === device.id
              ? pairedWith[0].recipientid
              : pairedWith[0].senderid
            : "";
          let peer = peerDeviceId
            ? await Device.getDevicesByPrimaryId(peerDeviceId)
            : null;
          userDevices[i]["invitations"] = combined;
          userDevices[i]["pairedWith"] = peer && peer.length ? peer[0].mac : "";
          return true;
        })
      );
      const props = {
        title: "Home",
        message: "Home",
        errors: "",
        user: user,
        devices: userDevices,
      };
      return res.render("home", props);
    },
    logout: (req, res) => {
      req.session.destroy((error) => {
        if (error) {
          return res.redirect("/home");
        }
        req.app.locals.user = null;
        res.clearCookie(process.env.SESSION_NAME);
        return res.redirect("/login");
      });
    },
  };
};
