// js/data.js

// 🧱 Bina veri yapısı:
// Aynı koordinat, ama iki farklı model: eski ve yeni + eski/yeni istatistikler
const BUILDINGS = [
  {
    id: 'B1',
    name: 'X Apartmanı',
    coords: [27.18158, 38.46393],
    glbOld: './models/buildings/B1_old.glb', // eski model
    glbNew: './models/buildings/B1_new.glb', // yeni model
    wasteSiteId: 'W1',
    trips: ['2025-01-05', '2025-01-10', '2025-02-01'],

    // Eski bina istatistikleri
    oldStats: {
      buildingName:'Gelip Çöker Yalnızlıklar',
      ruhsat: '15/03/2021',
      area: 500,                // alan (m2)
      constructionArea: 1500,   // inşaat alanı (m2)
      floors: 5,                // bina kat
      units: 20,                // bağımsız birim
      residential: 16,
      commercial: 2,
      owners: 18,               // malik sayısı
      disabledOwners: 1,        // engelli malik
      femaleHeads: 4,           // hanehalkı reisi kadın
      retired: 6,               // emekli
      janitorFlat: 'Var'        // kapıcı dairesi
    },

    // Yeni bina istatistikleri
    newStats: {
      buildingName:'Dört Yanımda Taş Duvarlar',
      ruhsat: '15/05/2025',
      area: 520,
      constructionArea: 1800,
      floors: 7,
      units: 28,
      residential: 16,
      commercial: 4,
      owners: 20,
      disabledOwners: 2,
      femaleHeads: 7,
      retired: 8,
      janitorFlat: 'Yok'
    }
  },
  {
    id: 'B2',
    name: 'Y Apartmanı',
    coords: [27.1434, 38.4239],
    glbOld: './models/buildings/B2_old.glb',
    glbNew: './models/buildings/B2_new.glb',
    wasteSiteId: 'W1', // istersen 'W2' yapıp farklı sahaya bağlayabilirsin
    trips: ['2025-01-07', '2025-03-15'],

    oldStats: {
      buildingName:'Zindanım olur.',
      ruhsat: '01/01/2022',
      area: 400,
      constructionArea: 1200,
      floors: 4,
      units: 16,
      residential: 14,
      commercial: 0,
      owners: 14,
      disabledOwners: 0,
      femaleHeads: 3,
      retired: 4,
      janitorFlat: 'Yok'
    },
    newStats: {
      buildingName:'GECEEEEEEEEEEEEEEEEE-LER.',
      ruhsat: '05/05/2025',
      area: 450,
      constructionArea: 1350,
      floors: 5,
      units: 18,
      residential: 14,
      commercial: 2,
      owners: 16,
      disabledOwners: 1,
      femaleHeads: 5,
      retired: 5,
      janitorFlat: 'Var'
    }
  }
  // B3, B4... aynı formatta eklenir
];

// GeoJSON'dan dolacak atık sahaları
const WASTE_SITES = [];

// GeoJSON'dan atık sahası okuma fonksiyonu
function loadWasteSitesFromGeoJSON(url = './data/waste_sites.geojson') {
  console.log('GeoJSON yükleniyor:', url);

  return fetch(url)
    .then((resp) => {
      console.log('GeoJSON HTTP status:', resp.status);
      if (!resp.ok) {
        throw new Error('waste_sites.geojson yüklenemedi: HTTP ' + resp.status);
      }
      return resp.json();
    })
    .then((geojson) => {
      if (!geojson.features || !Array.isArray(geojson.features)) {
        throw new Error('GeoJSON içinde features dizisi yok.');
      }

      WASTE_SITES.length = 0;

      geojson.features.forEach((f) => {
        if (!f.geometry || f.geometry.type !== 'Point') return;
        const coords = f.geometry.coordinates;
        const props = f.properties || {};

        const site = {
          id: props.id || props.ID || props.site_id || null,
          name: props.name || props.ad || 'İsimsiz Atık Sahası',
          coords,
          properties: props
        };

        if (site.id && Array.isArray(site.coords)) {
          WASTE_SITES.push(site);
        }
      });

      console.log('WASTE_SITES GeoJSON’dan yüklendi:', WASTE_SITES);
      return WASTE_SITES;
    })
    .catch((err) => {
      console.error('Atık sahaları yüklenirken hata:', err);
      return WASTE_SITES;
    });
}

// Bu numeric alanlar için min–max hesaplayacağız
const NUMERIC_STAT_KEYS = [
  'area',
  'constructionArea',
  'floors',
  'units',
  'residential',
  'commercial',
  'owners',
  'disabledOwners',
  'femaleHeads',
  'retired'
];

const STAT_RANGES = {};

NUMERIC_STAT_KEYS.forEach((field) => {
  const values = [];

  BUILDINGS.forEach((b) => {
    ['oldStats', 'newStats'].forEach((statsKey) => {
      const stats = b[statsKey];
      if (!stats) return;
      const v = stats[field];
      if (typeof v === 'number' && !Number.isNaN(v)) {
        values.push(v);
      }
    });
  });

  if (values.length > 0) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    STAT_RANGES[field] = { min, max };
  }
});

// Global'e çıkar
window.NUMERIC_STAT_KEYS = NUMERIC_STAT_KEYS;
window.STAT_RANGES = STAT_RANGES;



// Global'e çıkaralım
window.BUILDINGS = BUILDINGS;
window.NUMERIC_STAT_KEYS = NUMERIC_STAT_KEYS;  // ⭐ BUNU EKLE
window.WASTE_SITES = WASTE_SITES;
window.DataStore = {
  BUILDINGS,
  WASTE_SITES,
  loadWasteSitesFromGeoJSON
};
