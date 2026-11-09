const express = require('express');
const { authenticate } = require('../shared/auth');
const { validCoords } = require('../shared/geo');
const { call } = require('../shared/http');

const CRITICAL = ['engine_fault', 'emergency_stop', 'low_battery'];
const LOW_BATTERY = 15;

module.exports = function createTelemetryService(db) {
  const app = express();
  app.use(express.json());
  const r = express.Router();
  r.use(authenticate);

  r.post('/', async (req, res) => {
    const { vehicle_id, latitude, longitude, speed = null, battery = null } = req.body || {};
    let { event = null } = req.body || {};
    if (!vehicle_id || !validCoords(latitude, longitude)) return res.status(400).json({ error: 'vehicle_id and valid latitude/longitude required' });
    if (battery != null && (typeof battery !== 'number' || battery < 0 || battery > 100)) return res.status(400).json({ error: 'battery must be 0-100' });
    const v = db.prepare('SELECT * FROM vehicles WHERE id=?').get(vehicle_id);
    if (!v) return res.status(404).json({ error: 'Vehicle not found' });
    if (!event && battery != null && battery < LOW_BATTERY) event = 'low_battery';

    const info = db.prepare('INSERT INTO telemetry(vehicle_id,latitude,longitude,speed,battery,event) VALUES (?,?,?,?,?,?)')
      .run(vehicle_id, latitude, longitude, speed, battery, event);
    // Store latest GPS fix on the vehicle record
    db.prepare('UPDATE vehicles SET latitude=?, longitude=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(latitude, longitude, vehicle_id);
    if (event === 'emergency_stop') db.prepare("UPDATE vehicles SET status='emergency_stop' WHERE id=?").run(vehicle_id);

    let notification = null;
    if (event && CRITICAL.includes(event)) {
      const n = await call('notifications', '/internal/notify', {
        method: 'POST',
        body: { reason: event, vehicle_id, message: `CRITICAL: vehicle ${v.plate} reported ${event.replace('_', ' ')}${battery != null ? ` (battery ${battery}%)` : ''}` },
      }).catch(() => null);
      notification = n ? n.data : { error: 'notification service unavailable' };
    }
    res.status(201).json({ id: info.lastInsertRowid, vehicle_id, event, notification });
  });

  r.get('/:vehicleId', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    res.json(db.prepare('SELECT * FROM telemetry WHERE vehicle_id=? ORDER BY id DESC LIMIT ?').all(req.params.vehicleId, limit));
  });

  app.use('/api/telemetry', r);
  app.get('/health', (_q, res) => res.json({ service: 'telemetry', ok: true }));
  return app;
};
