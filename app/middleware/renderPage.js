function renderPageMiddleware(req, res, next) {
  res.renderPage = (view, params = {}) => {
    const isLoggedIn = !!(req.session?.userId || req.session?.adminId || req.session?.managerId);
    const currentUser = req.session?.user || null;
    const options = { ...params, favicon: "/assets/img/favicon.ico", useWrap: true, isLoggedIn, currentUser };
    res.render(view, options, (err, html) => {
      if (err) return next(err);
      res.render("layouts/application", { ...params, favicon: "/assets/img/favicon.ico", body: html, useWrap: true, isLoggedIn, currentUser });
    });
  };
  next();
}

module.exports = { renderPageMiddleware };
