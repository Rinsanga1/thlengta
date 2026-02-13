function isValidEmail(email) {
  return /^\S+@\S+\.\S+$/.test(String(email || ""));
}

module.exports = {
  isValidEmail,
};
