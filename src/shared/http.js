// Tiny helper to call sibling services (used by telemetry/vehicle -> notifications/maps)
const config = require('../config');
const base = (name) => process.env[`${name.toUpperCase()}_URL`] || `http://127.0.0.1:${config.ports[name]}`;
async function call(service, path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(base(service) + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-internal-key': config.internalKey, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
module.exports = { call, base };
