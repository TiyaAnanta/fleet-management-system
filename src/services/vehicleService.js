const express = require('express');
const { authenticate, authorize } = require('../shared/auth');
const { validCoords } = require('../shared/geo');
const { call } = require('../shared/http');

const STATUSES = ['idle', 'active', 'maintenance', 'offline', 'emergency_stop'];

module.exports = function createVehicleService(db) {
  const app = express();
  app.use(express.json());
  const r = express.Router();
  r.use(authenticate);

  r.post('/', authorize('admin', 'operator'), async (req, res) => {
    let { plate, model = null, address = null, latitude = null, longitude = null, owner_id = null } = req.body || {};
    if (!plate) return res.status(400).json({ error: 'plate is required' });
    // Geocode address -> coordinates when none supplied
    if (address && latitude == null) {
      const g = await call('maps', `/api/maps/geocode?address=${encodeURIComponent(address)}`, { headers: { authorization: req.headers.authorization } }).catch(() => null);
      if (g && g.status === 200) ({ latitude, longitude } = g.data);
    }
    if (latitude != null && !validCoords(latitude, longitude)) return res.status(400).json({ error: 'invalid coordinates' });
    try {
      const info = db.prepare('INSERT INTO vehicles(plate,model,address,latitude,longitude,owner_id) VALUES (?,?,?,?,?,?)')
        .run(plate, model, address, latitude, longitude, owner_id);
      res.status(201).json(db.prepare('SELECT * FROM vehicles WHERE id=?').get(info.lastInsertRowid));
    } catch { res.status(409).json({ error: 'Vehicle with this plate already exists' }); }
  });

  r.get('/', (req, res) => {
    const { status } = req.query;
    res.json(status ? db.prepare('SELECT * FROM vehicles WHERE status=?').all(status) : db.prepare('SELECT * FROM vehicles').all());
  });

  r.get('/:id', (req, res) => {
    const v = db.prepare('SELECT * FROM vehicles WHERE id=?').get(req.params.id);
    v ? res.json(v) : res.status(404).json({ error: 'Vehicle not found' });
  });

  // Operational status change -> notify admins + vehicle owner
  r.patch('/:id/status', authorize('admin', 'operator'), async (req, res) => {
    const { status } = req.body || {};
    if (!STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
    const v = db.prepare('SELECT * FROM vehicles WHERE id=?').get(req.params.id);
    if (!v) return res.status(404).json({ error: 'Vehicle not found' });
    db.prepare('UPDATE vehicles SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, v.id);
    let notification = null;
    if (v.status !== status) {
      const n = await call('notifications', '/internal/notify', {
        method: 'POST',
        body: { reason: 'status_change', vehicle_id: v.id, message: `Vehicle ${v.plate} status changed: ${v.status} -> ${status}`, extra_user_ids: v.owner_id ? [v.owner_id] : [] },
      }).catch(() => null);
      notification = n ? n.data : { error: 'notification service unavailable' };
    }
    res.json({ vehicle: db.prepare('SELECT * FROM vehicles WHERE id=?').get(v.id), notification });
  });

  r.delete('/:id', authorize('admin'), (req, res) => {
    const info = db.prepare('DELETE FROM vehicles WHERE id=?').run(req.params.id);
    info.changes ? res.status(204).end() : res.status(404).json({ error: 'Vehicle not found' });
  });

  app.use('/api/vehicles', r);
  app.get('/health', (_q, res) => res.json({ service: 'vehicles', ok: true }));
  return app;
};
