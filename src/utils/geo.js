function toRad(x) {
  return (x * Math.PI) / 180;
}

// Haversine distance in meters
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isInsideGeofence(storeLat, storeLng, radiusM, empLat, empLng) {
  const d = distanceMeters(storeLat, storeLng, empLat, empLng);
  return { ok: d <= radiusM, distance_m: Math.round(d) };
}

module.exports = { distanceMeters, isInsideGeofence };
