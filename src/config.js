require('dotenv').config();
module.exports = {
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: '2h',
  apiKeys: (process.env.API_KEYS || 'fleet-demo-key-123').split(','),
  rateLimit: {
    windowMs: Number(process.env.RATE_WINDOW_MS || 60000),
    max: Number(process.env.RATE_MAX || 100),
  },
  dbFile: process.env.DB_FILE || ':memory:',
  gatewayPort: Number(process.env.PORT || 3000),
  ports: {
    users: Number(process.env.USER_SVC_PORT || 4001),
    vehicles: Number(process.env.VEHICLE_SVC_PORT || 4002),
    telemetry: Number(process.env.TELEMETRY_SVC_PORT || 4003),
    maps: Number(process.env.MAPS_SVC_PORT || 4004),
    notifications: Number(process.env.NOTIF_SVC_PORT || 4005),
  },
  // "mock" = deterministic offline stub, "osm" = real OpenStreetMap Nominatim
  geocoder: process.env.GEOCODER || 'osm',
  // SMS stub: set SMS_FAIL_NUMBERS=+1000 to simulate failures
  internalKey: process.env.INTERNAL_KEY || 'internal-service-key',
  adminPhone: process.env.ADMIN_PHONE || '+910000000000',
};
