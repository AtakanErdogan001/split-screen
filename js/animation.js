// js/animation.js

// BUILDINGS ve WASTE_SITES -> data.js içinde global tanımlı
// Bu dosya kamyon animasyonlarını ve güzergâh çizgilerini yönetiyor.

// Threebox ve Map referansları (Threebox'ı sadece imza uyumu için tutuyoruz)
let tbRef = null;
let mapRef = null;

// Truck'ları çizeceğimiz GeoJSON source & layer
const truckSourceId = 'truck-anim-src';
const truckLayerId = 'truck-anim-layer';

// Güzergâh çizgileri için source & layer
const routeSourceId = 'route-anim-src';
const routeLayerId = 'route-anim-layer';

// Aktif "kamyon balonları"
let truckFeatures = [];

// Eklenen güzergah id'leri (tekrar eklememek için)
let routeFeatures = [];
const routeIds = new Set();

// Dışarıdan çağrılan setup fonksiyonu:
// app.js içinde: WasteAnimation.setThreeboxRefs(tbNew, mapNew);
function setThreeboxRefs(tb, map) {
  tbRef = tb;      // Şu an kullanmıyoruz ama dursun
  mapRef = map;

  ensureTruckLayer();
  ensureRouteLayer();

  // Eski kodlarla uyumluluk istersen:
  if (typeof window !== 'undefined') {
    window.tb = tb;
  }
}

// Basit linear interpolation
function lerp(a, b, t) {
  return a + (b - a) * t;
}

// İki [lng, lat] koordinatı arasındaki mesafeyi metre cinsinden hesapla
function distanceMeters(coord1, coord2) {
  const R = 6371000;
  const [lon1, lat1] = coord1.map((v) => (v * Math.PI) / 180);
  const [lon2, lat2] = coord2.map((v) => (v * Math.PI) / 180);

  const dlat = lat2 - lat1;
  const dlon = lon2 - lon1;

  const a =
    Math.sin(dlat / 2) * Math.sin(dlat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) * Math.sin(dlon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Kamera: iki noktayı kapsayacak şekilde zoom/fit yap
function fitMapToTwoPoints(c1, c2) {
  if (!mapRef) return;

  const minLng = Math.min(c1[0], c2[0]);
  const maxLng = Math.max(c1[0], c2[0]);
  const minLat = Math.min(c1[1], c2[1]);
  const maxLat = Math.max(c1[1], c2[1]);

  const bounds = [
    [minLng, minLat],
    [maxLng, maxLat]
  ];

  mapRef.fitBounds(bounds, {
    padding: 100,
    duration: 1000,
    maxZoom: 19
  });
}

// ─────────────────────────────────────────────
//  Truck circle layer
// ─────────────────────────────────────────────

function ensureTruckLayer() {
  if (!mapRef) return;
  if (mapRef.getSource(truckSourceId)) return;

  mapRef.addSource(truckSourceId, {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: []
    }
  });

  mapRef.addLayer({
    id: truckLayerId,
    type: 'circle',
    source: truckSourceId,
    paint: {
      // Zoom arttıkça circle büyüsün (px cinsinden)
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        12, 4,
        16, 10,
        19, 20
      ],
      'circle-color': '#D30000',
      'circle-opacity': 0.85,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#003333'
    }
  });
}

function updateTruckSource() {
  if (!mapRef) return;
  const src = mapRef.getSource(truckSourceId);
  if (!src) return;

  const fc = {
    type: 'FeatureCollection',
    features: truckFeatures.map((t) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: t.coord
      },
      properties: {
        id: t.id,
        label: t.label || ''
      }
    }))
  };

  src.setData(fc);
}

// ─────────────────────────────────────────────
//  Güzergâh line layer (Bina → Atık sahası)
// ─────────────────────────────────────────────

function ensureRouteLayer() {
  if (!mapRef) return;
  if (mapRef.getSource(routeSourceId)) return;

  mapRef.addSource(routeSourceId, {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: []
    }
  });

  mapRef.addLayer({
    id: routeLayerId,
    type: 'line',
    source: routeSourceId,
    paint: {
      'line-color': '#ffcc66',
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        12, 1.2,
        16, 3,
        19, 5
      ],
      'line-opacity': 0.75,
      'line-dasharray': [2, 1]  // hafif kesikli çizgi
    }
  });
}

function updateRouteSource() {
  if (!mapRef) return;
  const src = mapRef.getSource(routeSourceId);
  if (!src) return;

  const fc = {
    type: 'FeatureCollection',
    features: routeFeatures.map((r) => ({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [r.start, r.end]
      },
      properties: {
        id: r.id,
        buildingId: r.buildingId,
        wasteSiteId: r.wasteSiteId
      }
    }))
  };

  src.setData(fc);
}

// Belirli bina + atık sahası kombinasyonu için güzergah çizgisi ekle (bir kez)
function ensureRouteFor(building, wasteSite) {
  if (!building || !wasteSite) return;

  const routeId = `${building.id}__${wasteSite.id}`;
  if (routeIds.has(routeId)) return;

  routeIds.add(routeId);
  routeFeatures.push({
    id: routeId,
    buildingId: building.id,
    wasteSiteId: wasteSite.id,
    start: building.coords.slice(),
    end: wasteSite.coords.slice()
  });

  updateRouteSource();
}

// ─────────────────────────────────────────────
//  Animasyonlar
// ─────────────────────────────────────────────

// 🚛 Tek bir sefer animasyonu: bina -> atık sahası
// Artık truck.glb yok; bunun yerine circle layer üzerinde bir nokta hareket ediyor.
function animateSingleTrip(building, wasteSite, dateLabel, durationMs = 3000) {
  return new Promise((resolve) => {
    if (!mapRef) {
      console.warn('Map referansı yok (mapRef tanımsız).');
      resolve();
      return;
    }

    ensureTruckLayer();
    ensureRouteLayer();
    ensureRouteFor(building, wasteSite);

    const start = building.coords;
    const end = wasteSite.coords;

    const segmentLength = distanceMeters(start, end);
    console.log(
      `${building.name} -> ${wasteSite.name} (${dateLabel}) ~ ${segmentLength.toFixed(
        1
      )} m`
    );

    // Bu animasyon için benzersiz bir id
    const id = `truck-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Listeye ekle
    const truck = {
      id,
      coord: start.slice(),
      label: `${building.name} → ${wasteSite.name} (${dateLabel})`
    };
    truckFeatures.push(truck);
    updateTruckSource();

    const steps = 120;
    let step = 0;
    const intervalMs = durationMs / steps;

    const intervalId = setInterval(() => {
      step++;
      const t = step / steps;

      if (t >= 1) {
        clearInterval(intervalId);

        // animasyon bitince bu truck'ı listeden çıkar
        truckFeatures = truckFeatures.filter((x) => x.id !== id);
        updateTruckSource();

        resolve();
        return;
      }

      const lon = lerp(start[0], end[0], t);
      const lat = lerp(start[1], end[1], t);
      truck.coord = [lon, lat];
      updateTruckSource();
    }, intervalMs);
  });
}

// 📅 Tek bina modu: kamyonlar 0.5 sn arayla paralel başlar
function playTripsForBuilding(buildingId, infoCallback) {
  const building = BUILDINGS.find((b) => b.id === buildingId);
  if (!building) {
    infoCallback && infoCallback('Bina bulunamadı.');
    return;
  }

  const wasteSite = WASTE_SITES.find((w) => w.id === building.wasteSiteId);
  if (!wasteSite) {
    infoCallback &&
      infoCallback('Atık sahası bulunamadı: ' + building.wasteSiteId);
    return;
  }

  const sortedTrips = [...building.trips].sort();
  if (!sortedTrips.length) {
    infoCallback && infoCallback('Bu bina için kayıtlı sefer yok.');
    return;
  }

  infoCallback &&
    infoCallback(
      `${building.name} için ${sortedTrips.length} atık çıkışı (0.5 sn arayla) başlatılıyor...`
    );

  // Kamera bina + atık sahasını kapsasın
  fitMapToTwoPoints(building.coords, wasteSite.coords);

  const delayBetween = 500; // 0.5 saniye
  const durationMs = 3500;

  sortedTrips.forEach((d, idx) => {
    setTimeout(() => {
      const label = `${building.name} → ${wasteSite.name} (${d})`;
      infoCallback && infoCallback(label);
      animateSingleTrip(building, wasteSite, d, durationMs);
    }, idx * delayBetween);
  });
}

// 🧮 Belli tarih aralığında tüm binaların seferlerini topla
function collectTripsInRange(dateFrom, dateTo) {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);

  const trips = [];

  BUILDINGS.forEach((b) => {
    const waste = WASTE_SITES.find((w) => w.id === b.wasteSiteId);
    if (!waste) return;

    b.trips.forEach((d) => {
      const dt = new Date(d);
      if (dt >= from && dt <= to) {
        trips.push({
          building: b,
          wasteSite: waste,
          date: d
        });
      }
    });
  });

  trips.sort((a, b) => (a.date < b.date ? -1 : 1));
  return trips;
}

// 🌍 Zaman çizelgesi: tüm binalar için, 0.5 sn arayla paralel animasyon
function playTripsForAllBuildingsInRange(dateFrom, dateTo, infoCallback) {
  const allTrips = collectTripsInRange(dateFrom, dateTo);

  if (!allTrips.length) {
    infoCallback && infoCallback('Bu tarih aralığında sefer bulunamadı.');
    return;
  }

  infoCallback &&
    infoCallback(
      `${dateFrom} - ${dateTo} arasında ${allTrips.length} sefer (0.5 sn arayla) başlatılıyor...`
    );

  // Kamera: tüm bina + atık sahası konumlarını kapsayan bir bbox'a otursun
  if (mapRef) {
    let minLng = Infinity,
      maxLng = -Infinity,
      minLat = Infinity,
      maxLat = -Infinity;

    allTrips.forEach((trip) => {
      const c1 = trip.building.coords;
      const c2 = trip.wasteSite.coords;

      minLng = Math.min(minLng, c1[0], c2[0]);
      maxLng = Math.max(maxLng, c1[0], c2[0]);
      minLat = Math.min(minLat, c1[1], c2[1]);
      maxLat = Math.max(maxLat, c1[1], c2[1]);
    });

    const bounds = [
      [minLng, minLat],
      [maxLng, maxLat]
    ];

    mapRef.fitBounds(bounds, {
      padding: 120,
      duration: 1200,
      maxZoom: 18
    });
  }

  const delayBetween = 500; // 0.5 sn
  const durationMs = 3500;

  allTrips.forEach((trip, idx) => {
    setTimeout(() => {
      const label = `${trip.building.name} → ${trip.wasteSite.name} (${trip.date})`;
      infoCallback && infoCallback(label);
      animateSingleTrip(trip.building, trip.wasteSite, trip.date, durationMs);
    }, idx * delayBetween);
  });
}

// Dışarı export
window.WasteAnimation = {
  setThreeboxRefs,
  playTripsForBuilding,
  playTripsForAllBuildingsInRange
};
