const axios = require('axios');
const config = require('../config');

const KNOWN = {
  'gaya, bihar': [24.7914, 85.0002],
  'patna, bihar': [25.5941, 85.1376],
  'delhi': [28.6139, 77.209],
  'mumbai': [19.076, 72.8777],
  'bengaluru': [12.9716, 77.5946],
};
// Offline stub, deterministic
const mock = async (address) => {
  const hit = KNOWN[String(address).trim().toLowerCase()];
  return hit ? { latitude: hit[0], longitude: hit[1], display_name: address } : null;
};
// Real OpenStreetMap Nominatim (needs internet, respect usage policy: 1 req/sec, set User-Agent)
const osm = async (address) => {
  const { data } = await axios.get('https://nominatim.openstreetmap.org/search', {
    params: { q: address, format: 'json', limit: 1 },
    headers: { 'User-Agent': 'fleet-management-assignment/1.0' },
    timeout: 8000,
  });
  if (!data.length) return null;
  return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon), display_name: data[0].display_name };
};
module.exports = { geocode: config.geocoder === 'mock' ? mock : osm, mock, osm };
