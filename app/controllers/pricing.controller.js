// Pricing page controller
exports.index = (req, res) => {
  res.renderPage("pricing", { 
    title: "Thlengta - Pricing Plans"
  });
};