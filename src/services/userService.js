const express = require('express');
const bcrypt = require('bcryptjs');
const { sign, authenticate, authorize } = require('../shared/auth');

module.exports = function createUserService(db) {
  const app = express();
  app.use(express.json());
  const r = express.Router();

  r.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
    const u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
    if (!u || !bcrypt.compareSync(password, u.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: sign(u), user: { id: u.id, username: u.username, role: u.role } });
  });

  r.post('/register', authenticate, authorize('admin'), (req, res) => {
    const { username, password, role = 'driver', phone = null } = req.body || {};
    if (!username || !password || password.length < 6) return res.status(400).json({ error: 'username and password (min 6 chars) required' });
    if (!['admin', 'operator', 'driver'].includes(role)) return res.status(400).json({ error: 'invalid role' });
    try {
      const info = db.prepare('INSERT INTO users(username,password_hash,role,phone) VALUES (?,?,?,?)')
        .run(username, bcrypt.hashSync(password, 8), role, phone);
      res.status(201).json({ id: info.lastInsertRowid, username, role, phone });
    } catch { res.status(409).json({ error: 'Username already exists' }); }
  });

  r.get('/me', authenticate, (req, res) => res.json(req.user));
  r.get('/', authenticate, authorize('admin'), (req, res) =>
    res.json(db.prepare('SELECT id,username,role,phone FROM users').all()));

  app.use('/api/users', r);
  app.get('/health', (_q, res) => res.json({ service: 'users', ok: true }));
  return app;
};
