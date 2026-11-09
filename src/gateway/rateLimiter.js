// Simple fixed-window in-memory rate limiter (keyed per API key)
module.exports = function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.headers['x-api-key'] || req.ip;
    const now = Date.now();
    let e = hits.get(key);
    if (!e || now > e.reset) { e = { count: 0, reset: now + windowMs }; hits.set(key, e); }
    e.count++;
    res.set({ 'X-RateLimit-Limit': max, 'X-RateLimit-Remaining': Math.max(0, max - e.count), 'X-RateLimit-Reset': Math.ceil(e.reset / 1000) });
    if (e.count > max) {
      res.set('Retry-After', Math.ceil((e.reset - now) / 1000));
      return res.status(429).json({ error: 'Too many requests, slow down' });
    }
    next();
  };
};
