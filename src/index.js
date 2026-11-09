// Starts all five services + the API gateway in one process (each on its own port).
const config = require('./config');
const { createDb } = require('./shared/db');
const { createGateway } = require('./gateway/gateway');

const db = createDb();
const services = {
  users: require('./services/userService')(db),
  vehicles: require('./services/vehicleService')(db),
  telemetry: require('./services/telemetryService')(db),
  maps: require('./services/mapsService')(db),
  notifications: require('./services/notificationService')(db),
};
for (const [name, app] of Object.entries(services))
  app.listen(config.ports[name], '127.0.0.1', () => console.log(`${name} service  -> :${config.ports[name]}`));

createGateway().listen(config.gatewayPort, () => {
  console.log(`\nAPI Gateway   -> http://localhost:${config.gatewayPort}`);
  console.log(`Swagger UI    -> http://localhost:${config.gatewayPort}/api-docs`);
  console.log(`Map UI        -> http://localhost:${config.gatewayPort}/map`);
  console.log(`API key (demo)-> ${config.apiKeys[0]}`);
});
