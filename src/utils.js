module.exports = () => {
  return {
    formatMAC: (mac) => {
      // comes in as 2:51:EX: 5:F0:F8
      return mac.toLowerCase().trim();
    },

    formatIP: (ip) => {
      // comes in as ff:ff:ff:123.123.1.123 (?)
      let addr = ip;
      let lastIndex = addr.lastIndexOf(":");
      return addr.substr(lastIndex + 1);
    },
  };
};
