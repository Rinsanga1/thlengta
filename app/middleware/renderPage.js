function renderPageMiddleware(req, res, next) {
  res.renderPage = (view, params = {}) => {
    const options = { ...params, favicon: "/assets/img/favicon.ico", useWrap: true };
    res.render(view, options, (err, html) => {
      if (err) return next(err);
      res.render("layouts/application", { ...params, favicon: "/assets/img/favicon.ico", body: html, useWrap: true });
    });
  };
  next();
}

module.exports = { renderPageMiddleware };
