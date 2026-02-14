// Express middleware to log every route that is accessed

function routeLogger(req, res, next) {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl;
  const query = JSON.stringify(req.query);
  
  console.log(`[${timestamp}] ${method} ${url} ${query !== '{}' ? query : ''}`);
  
  next();
}

module.exports = { routeLogger };
