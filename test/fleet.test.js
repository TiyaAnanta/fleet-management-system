const request = require('supertest');
const { expect } = require('chai');
const { boot, login } = require('./helpers');

const KEY = { 'x-api-key': 'test-key' };
const auth = (t) => ({ ...KEY, Authorization: `Bearer ${t}` });

describe('Fleet Management API (through the gateway)', function () {
  let env, admin, operator, driver;
  before(async () => {
    env = await boot();
    admin = await login(request, env.gw, 'admin', 'admin123');
    operator = await login(request, env.gw, 'operator', 'operator123');
    driver = await login(request, env.gw, 'driver', 'driver123');
  });
  after(() => env.close());

  describe('1. User login and JWT verification', () => {
    it('logs in and returns a JWT', async () => {
      const r = await request(env.gw).post('/api/users/login').set(KEY).send({ username: 'admin', password: 'admin123' });
      expect(r.status).to.equal(200);
      expect(r.body.token).to.be.a('string').with.length.greaterThan(20);
      expect(r.body.user.role).to.equal('admin');
    });
    it('rejects wrong credentials with 401', async () => {
      const r = await request(env.gw).post('/api/users/login').set(KEY).send({ username: 'admin', password: 'nope' });
      expect(r.status).to.equal(401);
    });
    it('rejects missing fields with 400', async () => {
      const r = await request(env.gw).post('/api/users/login').set(KEY).send({});
      expect(r.status).to.equal(400);
    });
    it('verifies the JWT on /me', async () => {
      const r = await request(env.gw).get('/api/users/me').set(auth(admin));
      expect(r.status).to.equal(200);
      expect(r.body.username).to.equal('admin');
    });
    it('rejects a tampered token and a missing token', async () => {
      expect((await request(env.gw).get('/api/users/me').set(auth(admin + 'x'))).status).to.equal(401);
      expect((await request(env.gw).get('/api/users/me').set(KEY)).status).to.equal(401);
    });
  });

  describe('2. Vehicle registration and retrieval', () => {
    it('registers a vehicle and geocodes its address', async () => {
      const r = await request(env.gw).post('/api/vehicles').set(auth(admin)).send({ plate: 'BR02-0001', model: 'Ace', address: 'Gaya, Bihar' });
      expect(r.status).to.equal(201);
      expect(r.body.latitude).to.be.closeTo(24.7914, 0.001);
      expect(r.body.status).to.equal('idle');
    });
    it('retrieves it by id and in the list', async () => {
      const list = await request(env.gw).get('/api/vehicles').set(auth(driver));
      expect(list.status).to.equal(200);
      const v = list.body.find((x) => x.plate === 'BR02-0001');
      const one = await request(env.gw).get(`/api/vehicles/${v.id}`).set(auth(driver));
      expect(one.body.plate).to.equal('BR02-0001');
    });
    it('rejects duplicate plate (409), missing plate (400), unknown id (404)', async () => {
      expect((await request(env.gw).post('/api/vehicles').set(auth(admin)).send({ plate: 'BR02-0001' })).status).to.equal(409);
      expect((await request(env.gw).post('/api/vehicles').set(auth(admin)).send({})).status).to.equal(400);
      expect((await request(env.gw).get('/api/vehicles/9999').set(auth(admin))).status).to.equal(404);
    });
  });

  describe('3. Telemetry submission and storage', () => {
    let vid;
    before(async () => {
      const r = await request(env.gw).post('/api/vehicles').set(auth(admin)).send({ plate: 'TEL-1', latitude: 10, longitude: 10 });
      vid = r.body.id;
    });
    it('stores telemetry and updates the vehicle GPS position', async () => {
      const r = await request(env.gw).post('/api/telemetry').set(auth(driver)).send({ vehicle_id: vid, latitude: 11.5, longitude: 12.5, speed: 40, battery: 80 });
      expect(r.status).to.equal(201);
      const hist = await request(env.gw).get(`/api/telemetry/${vid}`).set(auth(admin));
      expect(hist.body).to.have.length(1);
      expect(hist.body[0].speed).to.equal(40);
      const v = await request(env.gw).get(`/api/vehicles/${vid}`).set(auth(admin));
      expect(v.body.latitude).to.equal(11.5);
    });
    it('validates coordinates and vehicle existence', async () => {
      expect((await request(env.gw).post('/api/telemetry').set(auth(driver)).send({ vehicle_id: vid, latitude: 200, longitude: 0 })).status).to.equal(400);
      expect((await request(env.gw).post('/api/telemetry').set(auth(driver)).send({ vehicle_id: 9999, latitude: 1, longitude: 1 })).status).to.equal(404);
    });
  });

  describe('4. Status update and notification triggering', () => {
    let vid;
    before(async () => {
      const r = await request(env.gw).post('/api/vehicles').set(auth(admin)).send({ plate: 'NOTIF-1', latitude: 1, longitude: 1 });
      vid = r.body.id;
      env.sent.length = 0;
    });
    it('status change sends an SMS to the admin and logs it as sent', async () => {
      const r = await request(env.gw).patch(`/api/vehicles/${vid}/status`).set(auth(operator)).send({ status: 'maintenance' });
      expect(r.status).to.equal(200);
      expect(r.body.vehicle.status).to.equal('maintenance');
      expect(r.body.notification.sent).to.be.at.least(1);
      expect(env.sent.some((m) => m.body.includes('NOTIF-1') && m.body.includes('maintenance'))).to.equal(true);
      const log = await request(env.gw).get(`/api/notifications?vehicle_id=${vid}`).set(auth(admin));
      expect(log.body[0].status).to.equal('sent');
      expect(log.body[0].reason).to.equal('status_change');
    });
    it('critical telemetry event (engine_fault) triggers an SMS', async () => {
      env.sent.length = 0;
      const r = await request(env.gw).post('/api/telemetry').set(auth(driver)).send({ vehicle_id: vid, latitude: 1, longitude: 1, event: 'engine_fault' });
      expect(r.body.notification.sent).to.be.at.least(1);
      expect(env.sent[0].body).to.match(/CRITICAL/);
    });
    it('low battery (<15) auto-raises a low_battery event', async () => {
      const r = await request(env.gw).post('/api/telemetry').set(auth(driver)).send({ vehicle_id: vid, latitude: 1, longitude: 1, battery: 7 });
      expect(r.body.event).to.equal('low_battery');
    });
    it('rejects an invalid status with 400', async () => {
      expect((await request(env.gw).patch(`/api/vehicles/${vid}/status`).set(auth(admin)).send({ status: 'flying' })).status).to.equal(400);
    });
    it('records failed deliveries as "failed"', async () => {
      const failing = await boot({ sms: { sendSms: async () => { throw new Error('boom'); } } });
      const tok = await login(request, failing.gw, 'admin', 'admin123');
      const v = await request(failing.gw).post('/api/vehicles').set(auth(tok)).send({ plate: 'F-1' });
      await request(failing.gw).patch(`/api/vehicles/${v.body.id}/status`).set(auth(tok)).send({ status: 'active' });
      const log = await request(failing.gw).get('/api/notifications?status=failed').set(auth(tok));
      expect(log.body.length).to.be.at.least(1);
      failing.close();
      // restore sibling URLs for later tests
      process.env.MAPS_URL = env.targets.maps; process.env.NOTIFICATIONS_URL = env.targets.notifications;
    });
  });

  describe('5. Role-based access control', () => {
    let vid;
    before(async () => { vid = (await request(env.gw).post('/api/vehicles').set(auth(admin)).send({ plate: 'RBAC-1' })).body.id; });
    it('driver cannot delete a vehicle (403)', async () => {
      expect((await request(env.gw).delete(`/api/vehicles/${vid}`).set(auth(driver))).status).to.equal(403);
    });
    it('operator cannot delete a vehicle (403)', async () => {
      expect((await request(env.gw).delete(`/api/vehicles/${vid}`).set(auth(operator))).status).to.equal(403);
    });
    it('driver cannot register vehicles or list users', async () => {
      expect((await request(env.gw).post('/api/vehicles').set(auth(driver)).send({ plate: 'X' })).status).to.equal(403);
      expect((await request(env.gw).get('/api/users').set(auth(driver))).status).to.equal(403);
    });
    it('admin can delete (204) and then gets 404', async () => {
      expect((await request(env.gw).delete(`/api/vehicles/${vid}`).set(auth(admin))).status).to.equal(204);
      expect((await request(env.gw).delete(`/api/vehicles/${vid}`).set(auth(admin))).status).to.equal(404);
    });
  });

  describe('6. Nearby vehicle search (mocked geolocation)', () => {
    before(async () => {
      for (const [plate, lat, lon] of [['NEAR-A', 24.80, 85.01], ['NEAR-B', 24.85, 85.05], ['FAR-C', 28.61, 77.21]])
        await request(env.gw).post('/api/vehicles').set(auth(admin)).send({ plate, latitude: lat, longitude: lon });
    });
    it('returns only vehicles within the radius, sorted by distance', async () => {
      const r = await request(env.gw).get('/api/maps/nearby?lat=24.7914&lon=85.0002&radius=15').set(auth(driver));
      expect(r.status).to.equal(200);
      const plates = r.body.vehicles.map((v) => v.plate);
      expect(plates).to.include('NEAR-A').and.include('NEAR-B').and.not.include('FAR-C');
      expect(r.body.vehicles[0].distance_km).to.be.lessThan(r.body.vehicles[1].distance_km);
    });
    it('a tighter radius excludes more vehicles', async () => {
      const r = await request(env.gw).get('/api/maps/nearby?lat=24.7914&lon=85.0002&radius=3').set(auth(driver));
      expect(r.body.vehicles.map((v) => v.plate)).to.not.include('NEAR-B');
    });
    it('accepts an address (geocoded by the mock) instead of lat/lon', async () => {
      const r = await request(env.gw).get('/api/maps/nearby?address=' + encodeURIComponent('Gaya, Bihar') + '&radius=15').set(auth(driver));
      expect(r.status).to.equal(200);
      expect(r.body.count).to.be.greaterThan(0);
    });
    it('handles unknown address (404) and bad input (400)', async () => {
      expect((await request(env.gw).get('/api/maps/geocode?address=Nowhereville').set(auth(driver))).status).to.equal(404);
      expect((await request(env.gw).get('/api/maps/nearby?radius=5').set(auth(driver))).status).to.equal(400);
    });
  });

  describe('7. API Gateway: API key verification, rate limiting, errors', () => {
    it('rejects requests without an API key (401) and with a wrong one (403)', async () => {
      expect((await request(env.gw).get('/api/vehicles').set('Authorization', `Bearer ${admin}`)).status).to.equal(401);
      expect((await request(env.gw).get('/api/vehicles').set({ 'x-api-key': 'bad', Authorization: `Bearer ${admin}` })).status).to.equal(403);
    });
    it('returns 404 for an unknown route and 400 for malformed JSON', async () => {
      expect((await request(env.gw).get('/api/unknown').set(KEY)).status).to.equal(404);
      const r = await request(env.gw).post('/api/users/login').set({ ...KEY, 'content-type': 'application/json' }).send('{bad json');
      expect(r.status).to.equal(400);
    });
    it('returns 503 when a backend service is down', async () => {
      const down = await boot();
      down.close();
      await new Promise((r) => setTimeout(r, 50));
      const r = await request(down.gw).get('/api/vehicles').set(KEY);
      expect(r.status).to.equal(503);
    });
    it('rate-limits after the configured maximum (429)', async () => {
      const limited = await boot({ rateLimit: { windowMs: 60000, max: 3 } });
      const codes = [];
      for (let i = 0; i < 5; i++) codes.push((await request(limited.gw).get('/api/vehicles').set(KEY)).status);
      expect(codes.slice(0, 3)).to.not.include(429);
      expect(codes.slice(3)).to.deep.equal([429, 429]);
      limited.close();
    });
    it('serves Swagger UI and the OpenAPI JSON publicly', async () => {
      const ui = await request(env.gw).get('/api-docs/');
      expect(ui.status).to.equal(200);
      expect(ui.text).to.include('swagger-ui');
      const spec = await request(env.gw).get('/openapi.json');
      expect(spec.body.openapi).to.match(/^3\./);
      expect(Object.keys(spec.body.paths)).to.include('/api/maps/nearby');
    });
  });
});
