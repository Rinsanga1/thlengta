function sqlInListPlaceholders(n) {
  return Array.from({ length: n }, () => "?").join(",");
}

module.exports = {
  sqlInListPlaceholders,
};