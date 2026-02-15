function create(req, res) {
  const name = (req.body.name || "").trim();
  const email = (req.body.email || "").trim();
  const message = (req.body.message || "").trim();

  if (!name || !email || !message) {
    return res.status(400).send("Please fill all fields.");
  }

  return res.status(200).send("OK");
}

module.exports = { create };
