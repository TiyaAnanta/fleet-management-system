const express = require('express');
const config = require('../config');
const { authenticate, authorize } = require('../shared/auth');
const defaultSms = require('./smsProvider');

module.exports = function createNotificationService(db, sms = defaultSms) {
  const app = express();
  app.use(express.json());

  const record = db.prepare('INSERT INTO notifications(recipient,message,reason,vehicle_id,status) VALUES (?,?,?,?,?)');
  async function deliver(to, message, reason, vehicleId) {
    try { await sms.sendSms(to, message); record.run(to, message, reason, vehicleId ?? null, 'sent'); return 'sent'; }
    catch { record.run(to, message, reason, vehicleId ?? null, 'failed'); return 'failed'; }
  }

  // Internal endpoint used by Telemetry/Vehicle services (not reachable without internal key)
  app.post('/internal/notify', async (req, res) => {
    if (req.headers['x-internal-key'] !== config.internalKey) return res.status(403).json({ error: 'Internal only' });
    const { reason, message, vehicle_id, extra_user_ids = [] } = req.body || {};
    if (!reason || !message) return res.status(400).json({ error: 'reason and message required' });
    const admins = db.prepare("SELECT phone FROM users WHERE role='admin' AND phone IS NOT NULL").all().map((u) => u.phone);
    const extras = extra_user_ids.length
      ? db.prepare(`SELECT phone FROM users WHERE phone IS NOT NULL AND id IN (${extra_user_ids.map(() => '?').join(',')})`).all(...extra_user_ids).map((u) => u.phone)
      : [];
    const recipients = [...new Set([...admins, ...extras])];
    const results = [];
    for (const to of recipients) results.push({ to, status: await deliver(to, message, reason, vehicle_id) });
    res.status(201).json({ sent: results.filter((x) => x.status === 'sent').length, failed: results.filter((x) => x.status === 'failed').length, results });
  });

  const r = express.Router();
  r.use(authenticate);
  // Manual send (admin/operator)
  r.post('/send', authorize('admin', 'operator'), async (req, res) => {
    const { to, message } = req.body || {};
    if (!to || !message) return res.status(400).json({ error: 'to and message required' });
    const status = await deliver(to, message, 'manual', null);
    res.status(status === 'sent' ? 201 : 502).json({ to, status });
  });
  // Notification log
  r.get('/', authorize('admin', 'operator'), (req, res) => {
    const { status, vehicle_id } = req.query;
    let sql = 'SELECT * FROM notifications WHERE 1=1'; const p = [];
    if (status) { sql += ' AND status=?'; p.push(status); }
    if (vehicle_id) { sql += ' AND vehicle_id=?'; p.push(vehicle_id); }
    res.json(db.prepare(sql + ' ORDER BY id DESC LIMIT 200').all(...p));
  });
  app.use('/api/notifications', r);
  app.get('/health', (_q, res) => res.json({ service: 'notifications', ok: true }));
  return app;
};
