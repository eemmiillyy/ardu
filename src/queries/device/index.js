module.exports = (pool, Utils) => {
  return {
    // one users devices
    getUserDevices: async (id) => {
      const query = {
        name: "user-devices",
        text:
          "SELECT id, ownedBy, name, LOWER(mac) as mac, model, locatedIn, lastOnline FROM device WHERE ownedBy = $1",
        values: [id],
      };
      return pool
        .query(query)
        .then((results) => {
          if (results.rows.length == 0) return [];
          const formattedResults = [...results.rows].map((row) => {
            let newFormat = Utils.formatMAC(row["mac"]);
            row["mac"] = newFormat;
            return row;
          });
          return formattedResults;
        })
        .catch((e) => {
          console.error(e.stack);
          return [];
        });
    },
    getDevicesByPrimaryId: async (id) => {
      const query = {
        name: "user-devices-by-id",
        text:
          "SELECT id, ownedBy, name, LOWER(mac) as mac, model, locatedIn, lastOnline FROM device WHERE id = $1",
        values: [id],
      };
      return pool
        .query(query)
        .then((results) => {
          if (results.rows.length == 0) return [];
          const lastOnlineFormatted = results.rows[0]["lastonline"];
          results.rows[0]["lastonline"] = lastOnlineFormatted;
          const formattedMac = Utils.formatMAC(results.rows[0]["mac"]);
          results.rows[0]["mac"] = formattedMac;
          return results.rows ? results.rows : [];
        })
        .catch((e) => {
          console.error(e.stack);
          return [];
        });
    },
    // gets device id by the mac address
    getDeviceIdByMAC: async (recipientMAC) => {
      const query = {
        name: "get-deviceid-by-mac",
        text: "SELECT id FROM device WHERE LOWER(mac) = LOWER($1)",
        values: [recipientMAC],
      };
      return pool
        .query(query)
        .then((results) => {
          if (results.rows) {
            return results.rows[0] ? parseInt(results.rows[0].id) : null;
          }
        })
        .catch((e) => {
          console.error(e.stack);
        });
    },
    sendBitThroughGui: async (req, res) => {
      const { value } = req.body;
      //const userDevice = await getUserDevices(req.app.locals.user.id);
      // const websocket = clients.filter(
      //   (websocket) => websocket.mac === formatMAC(userDevice[0].mac)
      // );
      // if (websocket) {
      //   processor.processMessage(websocket[0], value);
      // }
      // todo: only refresh part of the page
      // todo: only display on/off if devices are connected to ws
      res.status(200).redirect("/home");
    },
  };
};
