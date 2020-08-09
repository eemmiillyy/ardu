module.exports = (pool, Device) => {
  return {
    displaySentInvitations: async (myDeviceId) => {
      const query = {
        name: "display-sent-invitations",
        text:
          "SELECT I.id, I.createdAt, I.senderID, I.recipientID, I.seenAt, I.accepted, I.acceptedAt, I.expiresAt FROM device AS D INNER JOIN invitation AS I ON I.senderID = D.id WHERE I.senderID=$1 ORDER BY acceptedAt DESC",
        values: [myDeviceId],
      };
      return pool
        .query(query)
        .then((results) => {
          const resultsFormatted = results.rows.map((row) => {
            const expired = new Date(row.expiresat) < new Date(); // timestamp as es6 date for comparison
            row.expired = expired;
            return row;
          });
          return resultsFormatted ? resultsFormatted : [];
        })
        .catch((e) => {
          console.error(e.stack);
          return [];
        });
    },
    displayRecievedInvitations: async (myDeviceId) => {
      const query = {
        name: "display-recieved-invitations",
        text:
          "SELECT I.id, I.createdAt, I.senderID, I.recipientID, I.seenAt, I.accepted, I.acceptedAt, I.expiresAt FROM device AS D INNER JOIN invitation AS I ON I.recipientID = D.id WHERE I.recipientID=$1 ORDER BY acceptedAt DESC",
        values: [myDeviceId],
      };
      return pool
        .query(query)
        .then((results) => {
          const resultsFormatted = results.rows.map((row) => {
            const expired = new Date(row.expiresat) < new Date(); // timestamp as es6 date for comparison
            row.expired = expired;
            return row;
          });
          return resultsFormatted ? resultsFormatted : [];
        })
        .catch((e) => {
          console.error(e.stack);
          return [];
        });
    },
    updateInvitationSeenAt: async (invitationId) => {
      const seenAt = new Date()
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      const query = {
        name: "update-invitation-seen-at",
        text: "UPDATE invitation SET seenAt = $1 WHERE id = $2",
        values: [seenAt, invitationId],
      };
      return pool
        .query(query)
        .then((results) => {
          if (results) return results.rows;
        })
        .catch((e) => {
          console.error(e.stack);
          return null;
        });
    },
    new: async (req, res) => {
      const { senderID, recipientID } = req.body;
      let deviceId = await Device.getDeviceIdByMAC(recipientID); // is mac
      if (!deviceId || parseInt(deviceId) === parseInt(senderID))
        return res.redirect("/home");
      // returns true if invitation exists and not expired
      const checkInvitationExists = async (myDeviceId, peerDeviceId) => {
        const query = {
          name: "check-invitation-exists",
          text:
            "SELECT I.id FROM device AS D INNER JOIN invitation AS I ON I.recipientID = D.id WHERE ((I.recipientID=$1 AND I.senderID=$2) OR (I.recipientID=$2 AND I.senderID=$1)) AND (expiresAt >= (NOW() AT TIME ZONE 'UTC'))",
          values: [myDeviceId, peerDeviceId],
        };
        return pool
          .query(query)
          .then((results) => {
            if (results.rows[0]) return true;
            return false;
          })
          .catch((e) => {
            console.error(e.stack);
            return null;
          });
      };
      if (await checkInvitationExists(senderID, deviceId)) {
        // if theres a not yet expired one
        return res.redirect("/home");
      }
      const createDeviceInvitation = async () => {
        const query = {
          name: "create-invitation",
          text:
            "INSERT INTO invitation (senderID, recipientID) VALUES ($1, $2)",
          values: [senderID, deviceId],
        };
        return pool
          .query(query)
          .then((results) => {
            if (results.rows[0]) return true;
            return false;
          })
          .catch((e) => {
            console.error(e.stack);
            return null;
          });
      };
      if (!(await createDeviceInvitation())) return res.redirect("/home");
      return res.status(200).redirect("/");
    },
    accept: async (req, res) => {
      const val = req.body; // bool
      const acceptedAt = new Date()
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      // You must use the same client instance for all statements within a transaction
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const queryText =
          "UPDATE invitation SET accepted = TRUE, acceptedAt = $2 WHERE id = $1 AND (expiresAt >= (NOW() AT TIME ZONE 'UTC')) RETURNING id";
        const res = await client.query(queryText, [val.value, acceptedAt]);
        const switchText =
          "UPDATE invitation SET accepted = FALSE WHERE invitation.id IN (Select IC.id from invitation AS IC WHERE (IC.senderID in (Select CSEND.senderID from invitation AS CSEND WHERE id=$1) OR IC.recipientID in (Select CSEND.senderID from invitation AS CSEND WHERE id=$1) OR IC.senderID in (Select CSEND.recipientID from invitation AS CSEND WHERE id=$1) OR IC.recipientID in (Select CSEND.recipientID from invitation AS CSEND WHERE id=$1)) AND IC.id != $1)";
        const switchTextValues = [res.rows[0].id];
        await client.query(switchText, switchTextValues);
        await client.query("COMMIT");
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
    reject: async (req, res) => {
      const val = req.body; //bool
      let deviceId = await Device.getDeviceIdByMAC(val.value); // is mac
      if (!deviceId) return res.redirect("/home");
      const getInvitationId = async (deviceId) => {
        const query = {
          name: "get-invitation-id",
          text:
            "SELECT DISTINCT id, acceptedAt FROM invitation WHERE ((recipientID = $1) OR (senderID = $1)) AND ((accepted = TRUE)) ORDER BY acceptedAt DESC;",
          values: [deviceId],
        };
        return pool
          .query(query)
          .then((results) => {
            if (results.rows[0]) return results.rows[0].id; // first most recently accepted invitation id
            return null;
          })
          .catch((e) => {
            console.error(e.stack);
            return null;
          });
      };
      let invitationId = await getInvitationId(deviceId);
      if (!invitationId) return res.redirect("/home");
      const rejectInvite = async () => {
        const query = {
          name: "reject-invitation",
          text: "UPDATE invitation SET accepted = FALSE WHERE id = $1",
          values: [invitationId], //invitation id
        };
        return pool
          .query(query)
          .then((results) => {
            if (results.rows) return true;
          })
          .catch((e) => {
            console.error(e.stack);
            return null;
          });
      };
      if (!(await rejectInvite())) return res.redirect("/home");
      return res.status(200).redirect("/");
    },
  };
};
