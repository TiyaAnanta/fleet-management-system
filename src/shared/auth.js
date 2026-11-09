const jwt = require('jsonwebtoken');
const config = require('../config');

const sign = (user) =>
  jwt.sign({ sub: user.id, username: user.username, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

function authenticate(req, res, next) {
  const h = req.headers.authorization || '';
  const [scheme, token] = h.split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  try { req.user = jwt.verify(token, config.jwtSecret); next(); }
  catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}
const authorize = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });

module.exports = { sign, authenticate, authorize };
