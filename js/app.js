mapboxgl.accessToken = window.MAPBOX_TOKEN || '';

const IZMIR_CENTER = { lng: 27.1428, lat: 38.4237 };

// Ortak map ayarları
const baseMapOptions = {
  style: 'mapbox://styles/mapbox/standard',
  center: IZMIR_CENTER,
  zoom: 16.5,
  pitch: 60,
  bearing: -20,
  antialias: true,
  config: {
    basemap: {
      theme: 'monochrome',
      show3dObjects: false
    }
  }
};

// Solda eski bina sahnesi
const mapOld = new mapboxgl.Map({
  ...baseMapOptions,
  container: 'map-old'
});

// Sağda yeni bina sahnesi
const mapNew = new mapboxgl.Map({
  ...baseMapOptions,
  container: 'map-new'
});

// Split-screen handle
const compare = new mapboxgl.Compare(mapOld, mapNew, '#comparison-container', {});

// Threebox referansları
let tbOld;
let tbNew;

const buildingModelsOld = {};
const buildingModelsNew = {};

// Parsel katmanlarını ekleyen ortak fonksiyon
function addParcelsLayers(map, idSuffix) {
  const sourceId = `parcels-src-${idSuffix}`;
  const fillId = `parcels-fill-${idSuffix}`;
  const lineId = `parcels-outline-${idSuffix}`;

  if (map.getSource(sourceId)) return; // tekrar eklemeye çalışma

  map.addSource(sourceId, {
    type: 'geojson',
    data: './data/parseller.geojson'
  });

  // Dolu poligon (alan)
  map.addLayer({
    id: fillId,
    type: 'fill',
    source: sourceId,
    paint: {
      'fill-color': '#ff0000',
      'fill-opacity': 0.25
    }
  });

  // Kenar çizgisi
  map.addLayer({
    id: lineId,
    type: 'line',
    source: sourceId,
    paint: {
      'line-color': '#ffcc66',
      'line-width': 2
    }
  });
}


// Eski sahne
mapOld.on('error', (e) => console.error('Mapbox error (old):', e));
mapNew.on('error', (e) => console.error('Mapbox error (new):', e));

mapOld.on('style.load', () => {
  console.log('Old style loaded');
  tbOld = new Threebox(mapOld, mapOld.getCanvas().getContext('webgl'), {
    defaultLights: true
  });

  // Eski binalar
  mapOld.addLayer({
    id: '3d-buildings-old',
    type: 'custom',
    renderingMode: '3d',

    onAdd: function () {
      console.log('3D eski binalar yükleniyor:', BUILDINGS);
      BUILDINGS.forEach((b) => {
        const options = {
          obj: b.glbOld,
          type: 'gltf',
          scale: { x: 1, y: 1, z: 1 },
          units: 'meters',
          rotation: { x: 90, y: 0, z: 0 }
        };

        tbOld.loadObj(options, (model) => {
          model.setCoords(b.coords);
          model.setRotation({ x: 0, y: 0, z: 0 });
          buildingModelsOld[b.id] = model;
          tbOld.add(model);
          console.log('Eski model eklendi:', b.id, b.glbOld);
        });
      });
    },

    render: function () {
      tbOld.update();
    }
  });

    // Parseller (eski sahnede de göster)
  addParcelsLayers(mapOld, 'old');
});

// Yeni sahne + atık animasyonu + UI
mapNew.on('style.load', () => {
  console.log('New style loaded');
  tbNew = new Threebox(mapNew, mapNew.getCanvas().getContext('webgl'), {
    defaultLights: true
  });

  // Atık animasyonu yeni sahne üzerinde çalışacak
  WasteAnimation.setThreeboxRefs(tbNew, mapNew);

  // Yeni binalar
  mapNew.addLayer({
    id: '3d-buildings-new',
    type: 'custom',
    renderingMode: '3d',

    onAdd: function () {
      console.log('3D yeni binalar yükleniyor:', BUILDINGS);
      BUILDINGS.forEach((b) => {
        const options = {
          obj: b.glbNew,
          type: 'gltf',
          scale: { x: 1, y: 1, z: 1 },
          units: 'meters',
          rotation: { x: 90, y: 0, z: 0 }
        };

        tbNew.loadObj(options, (model) => {
          model.setCoords(b.coords);
          model.setRotation({ x: 0, y: 0, z: 0 });
          buildingModelsNew[b.id] = model;
          tbNew.add(model);
          console.log('Yeni model eklendi:', b.id, b.glbNew);
        });
      });
    },

    render: function () {
      tbNew.update();
    }
  });

    // Parseller (yeni sahnede de göster)
  addParcelsLayers(mapNew, 'new');


  // Atık sahaları + UI sadece yeni map üzerinde
  console.log('Atık sahaları GeoJSON’dan okunacak (new map)...');
  DataStore.loadWasteSitesFromGeoJSON().then(() => {
    console.log('Atık sahaları hazır:', WASTE_SITES);

    mapNew.addSource('waste-sites-src', {
      type: 'geojson',
      data: './data/waste_sites.geojson'
    });

    mapNew.addLayer({
      id: 'waste-sites-layer',
      type: 'circle',
      source: 'waste-sites-src',
      paint: {
        'circle-radius': 6,
        'circle-color': '#00ff88',
        'circle-opacity': 0.9,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#003322'
      }
    });

    // UI'yi başlat (panel, timeline)
    initUI();
  });

      // Bina tip filtreleri (sadece yeni sahnede)
  if (window.BuildingFilters && typeof window.BuildingFilters.init === 'function') {
    BuildingFilters.init(mapNew);
  }

  
});

// ─────────────────────────────────────────────
// UI & Timeline & Panel collapse (yeni map üzerinde)
// ─────────────────────────────────────────────

let timelineMinDate = null;
let timelineMaxDate = null;

function initUI() {
  console.log('initUI çağrıldı, BUILDINGS:', BUILDINGS);

  const buildingSelect = document.getElementById('building-select');
  const infoDiv = document.getElementById('info');
  const btnZoom = document.getElementById('btn-zoom-building');

  // Bina dropdown'ını doldur
  buildingSelect.innerHTML = '';
  BUILDINGS.forEach((b) => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.name;
    buildingSelect.appendChild(opt);
  });

  // 🔍 Seçili binaya zoom yap
  btnZoom.addEventListener('click', () => {
    const id = buildingSelect.value;
    if (!id) {
      infoDiv.innerHTML = 'Lütfen bir bina seç.';
      return;
    }

    const b = BUILDINGS.find((x) => x.id === id);
    if (!b || !b.coords) {
      infoDiv.innerHTML = 'Bu bina için koordinat bulunamadı.';
      return;
    }

    const [lng, lat] = b.coords;

    // Her iki harita da aynı anda zoom yapsın
    [mapOld, mapNew].forEach((m) => {
      m.flyTo({
        center: { lng, lat },
        zoom: 18,
        pitch: 60,
        bearing: -20,
        duration: 10000
      });
    });
  });

  // Tek bina butonu
  document
    .getElementById('btn-play-single')
    .addEventListener('click', () => {
      const id = buildingSelect.value;
      if (!id) {
        infoDiv.innerHTML = 'Lütfen bir bina seç.';
        return;
      }
      WasteAnimation.playTripsForBuilding(id, (msg) => {
        infoDiv.innerHTML = msg;
      });
    });

  // Timeline kur
  initTimeline(infoDiv);

  // Panel collapse
  initPanelCollapse();
}

function initPanelCollapse() {
  const toggleBtn = document.getElementById('panel-toggle');
  const body = document.getElementById('panel-body');

  toggleBtn.addEventListener('click', () => {
    const isCollapsed = body.classList.toggle('collapsed');
    toggleBtn.textContent = isCollapsed ? '+' : '−';
  });
}

function initTimeline(infoDiv) {
  const track = document.getElementById('timeline-track');
  const labelMin = document.getElementById('timeline-min-label');
  const labelMax = document.getElementById('timeline-max-label');
  const labelSelected = document.getElementById('timeline-selected-label');
  const sliderFrom = document.getElementById('timeline-from');
  const sliderTo = document.getElementById('timeline-to');
  const btnPlayRange = document.getElementById('btn-play-range');

  // Tüm seferlerin tarihlerini topla
  const allDateStrings = [];
  BUILDINGS.forEach((b) => {
    b.trips.forEach((d) => allDateStrings.push(d));
  });

  if (!allDateStrings.length) {
    labelMin.textContent = 'Tarih yok';
    labelMax.textContent = '';
    labelSelected.textContent = 'Sefer tarihi bulunamadı.';
    sliderFrom.disabled = true;
    sliderTo.disabled = true;
    btnPlayRange.disabled = true;
    return;
  }

  const allDates = allDateStrings.map((d) => new Date(d));
  timelineMinDate = new Date(Math.min(...allDates));
  timelineMaxDate = new Date(Math.max(...allDates));

  const minStr = timelineMinDate.toISOString().slice(0, 10);
  const maxStr = timelineMaxDate.toISOString().slice(0, 10);

  labelMin.textContent = minStr;
  labelMax.textContent = maxStr;

  // Timeline üzerindeki noktaları çiz
  track.innerHTML = '';
  allDates.forEach((d) => {
    const t =
      (d.getTime() - timelineMinDate.getTime()) /
      (timelineMaxDate.getTime() - timelineMinDate.getTime());
    const pct = t * 100;

    const dot = document.createElement('div');
    dot.className = 'timeline-dot';
    dot.style.left = pct + '%';
    track.appendChild(dot);
  });

  // Slider ayarları (0..1000 normalleştirilmiş)
  sliderFrom.min = 0;
  sliderFrom.max = 1000;
  sliderFrom.value = 0;

  sliderTo.min = 0;
  sliderTo.max = 1000;
  sliderTo.value = 1000;

  function lerpDate(d1, d2, t) {
    const t1 = d1.getTime();
    const t2 = d2.getTime();
    return new Date(t1 + (t2 - t1) * t);
  }

  function clampSliders() {
    let v1 = Number(sliderFrom.value);
    let v2 = Number(sliderTo.value);

    // Birbirini geçmesin
    if (v1 > v2) {
      const temp = v1;
      v1 = v2;
      v2 = temp;
      sliderFrom.value = v1;
      sliderTo.value = v2;
    }

    const fromDate = lerpDate(timelineMinDate, timelineMaxDate, v1 / 1000);
    const toDate = lerpDate(timelineMinDate, timelineMaxDate, v2 / 1000);

    const fromStr = fromDate.toISOString().slice(0, 10);
    const toStr = toDate.toISOString().slice(0, 10);

    labelSelected.textContent = `Seçili aralık: ${fromStr} – ${toStr}`;

    return { fromDate, toDate, fromStr, toStr };
  }

  sliderFrom.addEventListener('input', clampSliders);
  sliderTo.addEventListener('input', clampSliders);

  // İlk label'ı oluştur
  clampSliders();

  btnPlayRange.addEventListener('click', () => {
    const { fromStr, toStr } = clampSliders();

    WasteAnimation.playTripsForAllBuildingsInRange(fromStr, toStr, (msg) => {
      infoDiv.innerHTML = msg;
    });
  });
}
