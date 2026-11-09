#!/usr/bin/env bash
# Demo requests used for screenshots. Start the server first: npm start
K="x-api-key: fleet-demo-key-123"; B=http://localhost:${PORT:-3000}
J="content-type: application/json"
TOKEN=$(curl -s -X POST $B/api/users/login -H "$K" -H "$J" -d '{"username":"admin","password":"admin123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
A="Authorization: Bearer $TOKEN"
echo "--- no API key (expect 401)";  curl -s -i $B/api/vehicles | head -1
echo "--- register vehicles";        for p in "BR02-1111 24.80 85.01" "BR02-2222 24.85 85.05" "DL01-3333 28.61 77.21"; do set -- $p
  curl -s -X POST $B/api/vehicles -H "$K" -H "$A" -H "$J" -d "{\"plate\":\"$1\",\"latitude\":$2,\"longitude\":$3}"; echo; done
echo "--- nearby (10 km of Gaya)";   curl -s "$B/api/maps/nearby?lat=24.7914&lon=85.0002&radius=10" -H "$K" -H "$A"; echo
echo "--- status change -> SMS";     curl -s -X PATCH $B/api/vehicles/1/status -H "$K" -H "$A" -H "$J" -d '{"status":"maintenance"}'; echo
echo "--- critical telemetry -> SMS";curl -s -X POST $B/api/telemetry -H "$K" -H "$A" -H "$J" -d '{"vehicle_id":2,"latitude":24.85,"longitude":85.05,"battery":9,"event":"engine_fault"}'; echo
echo "--- notification log";         curl -s $B/api/notifications -H "$K" -H "$A"; echo
