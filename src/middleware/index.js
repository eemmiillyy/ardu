module.exports = () => {
  return {
    redirectLogin: (req, res, next) => {
      if (!req.session.userId || !req.app.locals.user) {
        return res.redirect("/login");
      } else {
        next();
      }
    },
    redirectHome: (req, res, next) => {
      const currentCookies =
        req.get("cookie") && req.get("cookie").split(";")
          ? req.get("cookie").split(";")
          : [];
      const containsTargetCookie = currentCookies.some((cookieString) => {
        return cookieString.includes(process.env.SESSION_NAME);
      });
      if (
        (req.session.userId && req.app.locals.user) ||
        (!req.session.userId && req.app.locals.user && containsTargetCookie) //req.session.userId may not exist when server first issues the cookie
      ) {
        return res.redirect("/home");
      } else {
        next();
      }
    },
  };
};
