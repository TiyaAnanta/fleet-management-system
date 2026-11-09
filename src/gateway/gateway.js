const express = require('express');
const path = require('path');
const fs = require('fs');
const YAML = require('yaml');
const swaggerUi = require('swagger-ui-express');
const config = require('../config');
const rateLimiter = require('./rateLimiter');

/**
 * @param {object} opts
 * @param {object} opts.targets  route-prefix -> base URL of the backend service
 * @param {string[]} opts.apiKeys
 * @param {{windowMs:number,max:number}} opts.rateLimit
 */
function createGateway({ targets, apiKeys = config.apiKeys, rateLimit = config.rateLimit } = {}) {
  targets = targets || {
    users: `http://127.0.0.1:${config.ports.users}`,
    vehicles: `http://127.0.0.1:${config.ports.vehicles}`,
    telemetry: `http://127.0.0.1:${config.ports.telemetry}`,
    maps: `http://127.0.0.1:${config.ports.maps}`,
    notifications: `http://127.0.0.1:${config.ports.notifications}`,
  };
  const app = express();
  app.disable('x-powered-by');

  // --- Public: health, docs, map UI (no API key) ---
  app.get('/health', (_q, res) => res.json({ service: 'gateway', ok: true, routes: Object.keys(targets).map((k) => `/api/${k}/*`) }));
  const spec = YAML.parse(fs.readFileSync(path.join(__dirname, '../../docs/openapi.yaml'), 'utf8'));
  app.get('/openapi.json', (_q, res) => res.json(spec));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Fleet API Docs' }));
  app.use('/map', express.static(path.join(__dirname, '../../public')));

  // --- Everything under /api: API key -> rate limit -> route ---
  const verifyApiKey = (req, res, next) => {
    const key = req.headers['x-api-key'];
    if (!key) return res.status(401).json({ error: 'Missing x-api-key header' });
    if (!apiKeys.includes(key)) return res.status(403).json({ error: 'Invalid API key' });
    next();
  };
  app.use('/api', verifyApiKey, rateLimiter(rateLimit), express.json({ limit: '1mb' }));

  // malformed JSON -> 400
  app.use((err, _req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
    next(err);
  });

  // --- Forwarding ---
  app.use('/api/:service', async (req, res) => {
    const base = targets[req.params.service];
    if (!base) return res.status(404).json({ error: `No route for /api/${req.params.service}` });
    const headers = { 'content-type': 'application/json' };
    if (req.headers.authorization) headers.authorization = req.headers.authorization;
    const hasBody = !['GET', 'HEAD', 'DELETE'].includes(req.method) && req.body && Object.keys(req.body).length;
    try {
      const upstream = await fetch(base + req.originalUrl, {
        method: req.method, headers, body: hasBody ? JSON.stringify(req.body) : undefined,
        signal: AbortSignal.timeout(10000),
      });
      const text = await upstream.text();
      res.status(upstream.status);
      const ct = upstream.headers.get('content-type');
      if (ct) res.type(ct);
      res.send(text);
    } catch (e) {
      const timeout = e.name === 'TimeoutError';
      res.status(timeout ? 504 : 503).json({ error: timeout ? 'Upstream service timed out' : `Service '${req.params.service}' unavailable` });
    }
  });

  app.use((_q, res) => res.status(404).json({ error: 'Not found' }));
  return app;
}
module.exports = { createGateway };
