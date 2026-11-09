const http = require('http');
const { createDb } = require('../src/shared/db');
const { createGateway } = require('../src/gateway/gateway');

const listen = (app) => new Promise((ok) => { const s = http.createServer(app).listen(0, '127.0.0.1', () => ok(s)); });
const url = (s) => `http://127.0.0.1:${s.address().port}`;

// Boots all services + gateway on ephemeral ports. Geocoder and SMS are mocked.
async function boot({ rateLimit = { windowMs: 60000, max: 1000 }, sms } = {}) {
  const db = createDb(':memory:');
  const mockGeo = async (addr) => (addr === 'Gaya, Bihar' ? { latitude: 24.7914, longitude: 85.0002, display_name: addr } : null);
  const sent = [];
  const smsStub = sms || { sendSms: async (to, body) => { sent.push({ to, body }); return { sid: 'SMtest' }; } };

  const s = {
    users: await listen(require('../src/services/userService')(db)),
    vehicles: await listen(require('../src/services/vehicleService')(db)),
    telemetry: await listen(require('../src/services/telemetryService')(db)),
    maps: await listen(require('../src/services/mapsService')(db, mockGeo)),
    notifications: await listen(require('../src/services/notificationService')(db, smsStub)),
  };
  // sibling-service URLs used by internal calls
  process.env.MAPS_URL = url(s.maps);
  process.env.NOTIFICATIONS_URL = url(s.notifications);
  const targets = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, url(v)]));
  const gw = await listen(createGateway({ targets, apiKeys: ['test-key'], rateLimit }));
  return { db, sent, targets, gw, close: () => [...Object.values(s), gw].forEach((x) => x.close()) };
}

async function login(request, gw, username, password) {
  const r = await request(gw).post('/api/users/login').set('x-api-key', 'test-key').send({ username, password });
  return r.body.token;
}
module.exports = { boot, login };
