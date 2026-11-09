const express = require('express');
const { authenticate } = require('../shared/auth');
const { distanceKm, validCoords } = require('../shared/geo');

module.exports = function createMapsService(db, geocoder = require('./geocoder').geocode) {
  const app = express();
  app.use(express.json());
  const r = express.Router();
  r.use(authenticate);

  // Address -> coordinates
  r.get('/geocode', async (req, res) => {
    if (!req.query.address) return res.status(400).json({ error: 'address query param required' });
    try {
      const result = await geocoder(req.query.address);
      if (!result) return res.status(404).json({ error: 'Address not found' });
      res.json(result);
    } catch (e) { res.status(502).json({ error: 'Geocoding provider failed', detail: e.message }); }
  });

  // Vehicles within radius_km of a point (lat/lon or address)
  r.get('/nearby', async (req, res) => {
    let lat = parseFloat(req.query.lat), lon = parseFloat(req.query.lon);
    const radius = parseFloat(req.query.radius ?? 5);
    if (!(radius > 0)) return res.status(400).json({ error: 'radius must be a positive number (km)' });
    if (isNaN(lat) && req.query.address) {
      try {
        const g = await geocoder(req.query.address);
        if (!g) return res.status(404).json({ error: 'Address not found' });
        ({ latitude: lat, longitude: lon } = g);
      } catch (e) { return res.status(502).json({ error: 'Geocoding provider failed', detail: e.message }); }
    }
    if (!validCoords(lat, lon)) return res.status(400).json({ error: 'Valid lat & lon (or address) required' });
    const vehicles = db.prepare('SELECT * FROM vehicles WHERE latitude IS NOT NULL AND longitude IS NOT NULL').all()
      .map((v) => ({ ...v, distance_km: +distanceKm(lat, lon, v.latitude, v.longitude).toFixed(3) }))
      .filter((v) => v.distance_km <= radius)
      .sort((a, b) => a.distance_km - b.distance_km);
    res.json({ center: { latitude: lat, longitude: lon }, radius_km: radius, count: vehicles.length, vehicles });
  });

  // All vehicle positions for the map UI
  r.get('/locations', (_q, res) =>
    res.json(db.prepare('SELECT id,plate,model,status,latitude,longitude FROM vehicles WHERE latitude IS NOT NULL').all()));

  app.use('/api/maps', r);
  app.get('/health', (_q, res) => res.json({ service: 'maps', ok: true }));
  return app;
};
