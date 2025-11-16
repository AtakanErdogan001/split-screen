// js/app.js

mapboxgl.accessToken = window.MAPBOX_TOKEN || '';

// Farklı taban haritalar (istediğin gibi değiştirebilirsin)
const BASEMAP_STYLES = {
  current: 'mapbox://styles/mapbox/standard',
  // Bunu sen ister özel stil, ister satellite vs. ile 2020 olarak yorumlarsın
  old2020: 'mapbox://styles/mapbox/satellite-streets-v12'
};

const IZMIR_CENTER = { lng: 27.1428, lat: 38.4237 };

// Ortak map ayarları
const baseMapOptions = {
  center: IZMIR_CENTER,
  zoom: 16.5,
  pitch: 60,
  bearing: -20,
  antialias: true,
  style: BASEMAP_STYLES.current,
  config: {
    basemap: {
      theme: 'monochrome',
      show3dObjects: false
    }
  }
};

// Solda eski bina sahnesi (default: 2020)
const mapOld = new mapboxgl.Map({
  ...baseMapOptions,
  style: BASEMAP_STYLES.old2020,
  container: 'map-old'
});

// Sağda yeni bina sahnesi (default: güncel)
const mapNew = new mapboxgl.Map({
  ...baseMapOptions,
  style: BASEMAP_STYLES.current,
  container: 'map-new'
});

// Split-screen handle
const compare = new mapboxgl.Compare(mapOld, mapNew, '#comparison-container', {});

// Threebox referansları
let tbOld = null;
let tbNew = null;

const buildingModelsOld = {};
const buildingModelsNew = {};

// Görünürlük durumlarını global tutalım
let objectsVisible = true;
let parcelsVisible = true;

// ─────────────────────────────────────────────
// Hata logları
// ─────────────────────────────────────────────
mapOld.on('error', (e) => console.error('Mapbox error (old):', e));
mapNew.on('error', (e) => console.error('Mapbox error (new):', e));

// ─────────────────────────────────────────────
// 3D bina katmanlarını fonksiyonlaştır (toggle için lazım)
// ─────────────────────────────────────────────
function add3DBuildingsOldLayer() {
  if (!objectsVisible) return; // görünür değilse hiç ekleme
  if (!tbOld) {
    tbOld = new Threebox(mapOld, mapOld.getCanvas().getContext('webgl'), {
      defaultLights: true
    });
  }

  if (mapOld.getLayer('3d-buildings-old')) return;

  mapOld.addLayer({
    id: '3d-buildings-old',
    type: 'custom',
    renderingMode: '3d',

    onAdd: function () {
      console.log('3D eski binalar yükleniyor:', BUILDINGS);
      BUILDINGS.forEach((b) => {
        if (!b.glbOld) return;

        const options = {
          obj: b.glbOld,
          type: 'gltf',
          scale: { x: 1, y: 1, z: 1 },
          units: 'meters',
          rotation: { x: 90, y: 0, z: 0 }
        };

        tbOld.loadObj(options, (model) => {
          if (!model) return;
          model.setCoords(b.coords);
          model.setRotation({ x: 0, y: 0, z: 0 });
          buildingModelsOld[b.id] = model;
          tbOld.add(model);
          console.log('Eski model eklendi:', b.id, b.glbOld);
        });
      });
    },

    render: function () {
      if (objectsVisible && tbOld) {
        tbOld.update();
      }
    }
  });
}

function add3DBuildingsNewLayer() {
  if (!objectsVisible) return;
  if (!tbNew) {
    tbNew = new Threebox(mapNew, mapNew.getCanvas().getContext('webgl'), {
      defaultLights: true
    });
  }

  if (mapNew.getLayer('3d-buildings-new')) return;

  mapNew.addLayer({
    id: '3d-buildings-new',
    type: 'custom',
    renderingMode: '3d',

    onAdd: function () {
      console.log('3D yeni binalar yükleniyor:', BUILDINGS);
      BUILDINGS.forEach((b) => {
        if (!b.glbNew) return;

        const options = {
          obj: b.glbNew,
          type: 'gltf',
          scale: { x: 1, y: 1, z: 1 },
          units: 'meters',
          rotation: { x: 90, y: 0, z: 0 }
        };

        tbNew.loadObj(options, (model) => {
          if (!model) return;
          model.setCoords(b.coords);
          model.setRotation({ x: 0, y: 0, z: 0 });
          buildingModelsNew[b.id] = model;
          tbNew.add(model);
          console.log('Yeni model eklendi:', b.id, b.glbNew);
        });
      });
    },

    render: function () {
      if (objectsVisible && tbNew) {
        tbNew.update();
      }
    }
  });
}

// ─────────────────────────────────────────────
// Eski sahne: 3D eski binalar + parseller
// ─────────────────────────────────────────────
mapOld.on('style.load', () => {
  console.log('Old style loaded');
  add3DBuildingsOldLayer();
  addParcelsLayer(mapOld, 'parcels-src-old', 'parcels-layer-old');
});

// ─────────────────────────────────────────────
// Yeni sahne: 3D yeni binalar + atık animasyonu + parseller + UI
// ─────────────────────────────────────────────
mapNew.on('style.load', () => {
  console.log('New style loaded');

  add3DBuildingsNewLayer();
  addParcelsLayer(mapNew, 'parcels-src-new', 'parcels-layer-new');

  // Atık animasyonu yeni sahne üzerinde çalışacak
  if (window.WasteAnimation && typeof WasteAnimation.setThreeboxRefs === 'function') {
    WasteAnimation.setThreeboxRefs(tbNew, mapNew);
  }

  // Atık sahaları + UI sadece yeni map üzerinde
  console.log('Atık sahaları GeoJSON’dan okunacak (new map)...');

  const loadWasteSitesPromise =
    window.DataStore && typeof DataStore.loadWasteSitesFromGeoJSON === 'function'
      ? DataStore.loadWasteSitesFromGeoJSON()
      : fetch('./data/waste_sites.geojson')
          .then((r) => r.json())
          .then((geo) => {
            window.WASTE_SITES = (geo.features || []).map((f, idx) => ({
              id: f.properties?.id || `W${idx + 1}`,
              name: f.properties?.name || `Atık Sahası ${idx + 1}`,
              coords: f.geometry?.coordinates || [0, 0]
            }));
          });

  loadWasteSitesPromise
    .then(() => {
      console.log('Atık sahaları hazır:', window.WASTE_SITES);

      if (!mapNew.getSource('waste-sites-src')) {
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
      }

      initUI();

      if (window.BuildingFilters && typeof BuildingFilters.init === 'function') {
        BuildingFilters.init(mapNew);
      }

      if (window.BuildingImages && typeof BuildingImages.init === 'function') {
        BuildingImages.init(mapOld, mapNew);
      }

      initNorthIndicator(mapNew);
      initBasemapAndLayerToggles(); // taban harita + obje/parsel butonları
    })
    .catch((err) => {
      console.error('Atık sahaları yüklenirken hata:', err);
      initUI();
      if (window.BuildingFilters && typeof BuildingFilters.init === 'function') {
        BuildingFilters.init(mapNew);
      }
      if (window.BuildingImages && typeof BuildingImages.init === 'function') {
        BuildingImages.init(mapOld, mapNew);
      }
      initNorthIndicator(mapNew);
      initBasemapAndLayerToggles();
    });
});

// ─────────────────────────────────────────────
// Parsel katmanı (her iki haritada da kullanılan fonksiyon)
// ─────────────────────────────────────────────
function addParcelsLayer(map, sourceId, layerId) {
  if (!parcelsVisible) {
    // Sadece source ekleyip layer ekleme
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: './data/parseller.geojson'
      });
    }
    return;
  }

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: 'geojson',
      data: './data/parseller.geojson'
    });
  }

  if (!map.getLayer(layerId)) {
    map.addLayer({
      id: layerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': '#ffcc66',
        'fill-opacity': 0.15
      }
    });
  }

  if (!map.getLayer(layerId + '-outline')) {
    map.addLayer({
      id: layerId + '-outline',
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#ffcc66',
        'line-width': 1,
        'line-opacity': 0.7
      }
    });
  }
}

// ─────────────────────────────────────────────
// North indicator (pusula oku)
// ─────────────────────────────────────────────
function initNorthIndicator(map) {
  const arrowEl = document.querySelector('#north-indicator .north-arrow');
  if (!arrowEl) return;

  const update = () => {
    const bearing = map.getBearing();
    arrowEl.style.transform = `rotate(${-bearing}deg)`;
  };

  map.on('load', update);
  map.on('rotate', update);
  map.on('pitch', update);
  map.on('move', update);
  update();
}

// ─────────────────────────────────────────────
// Basemap + obje/parsel toggle UI
// ─────────────────────────────────────────────
function initBasemapAndLayerToggles() {
  // Sol taban harita
  document
    .querySelectorAll('input[name="basemap-left"]')
    .forEach((radio) => {
      radio.addEventListener('change', (e) => {
        if (!e.target.checked) return;
        const key = e.target.value;
        const style = BASEMAP_STYLES[key];
        if (style) {
          mapOld.setStyle(style);
        }
      });
    });

  // Sağ taban harita
  document
    .querySelectorAll('input[name="basemap-right"]')
    .forEach((radio) => {
      radio.addEventListener('change', (e) => {
        if (!e.target.checked) return;
        const key = e.target.value;
        const style = BASEMAP_STYLES[key];
        if (style) {
          mapNew.setStyle(style);
        }
      });
    });

  // 3D obje görünürlüğü
  const cbObjects = document.getElementById('toggle-objects');
  if (cbObjects) {
    cbObjects.addEventListener('change', (e) => {
      toggleBuildings(e.target.checked);
    });
  }

  // Parsel görünürlüğü
  const cbParcels = document.getElementById('toggle-parcels');
  if (cbParcels) {
    cbParcels.addEventListener('change', (e) => {
      toggleParcels(e.target.checked);
    });
  }
}

function toggleBuildings(visible) {
  objectsVisible = visible;

  // Eski katmanları kaldır
  if (mapOld.getLayer('3d-buildings-old')) {
    mapOld.removeLayer('3d-buildings-old');
  }
  if (mapNew.getLayer('3d-buildings-new')) {
    mapNew.removeLayer('3d-buildings-new');
  }

  // Tekrar görünür yapılacaksa yeniden ekle
  if (visible) {
    add3DBuildingsOldLayer();
    add3DBuildingsNewLayer();
  }
}

function toggleParcels(visible) {
  parcelsVisible = visible;

  const pairs = [
    [mapOld, 'parcels-layer-old'],
    [mapNew, 'parcels-layer-new']
  ];

  pairs.forEach(([map, baseId]) => {
    if (map.getLayer(baseId)) {
      map.removeLayer(baseId);
    }
    if (map.getLayer(baseId + '-outline')) {
      map.removeLayer(baseId + '-outline');
    }

    if (visible) {
      const srcId = baseId.replace('-layer', '-src');
      addParcelsLayer(map, srcId, baseId);
    }
  });
}

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

  buildingSelect.innerHTML = '';
  BUILDINGS.forEach((b) => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.name;
    buildingSelect.appendChild(opt);
  });

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

    [mapOld, mapNew].forEach((m) => {
      m.flyTo({
        center: { lng, lat },
        zoom: 18,
        pitch: 60,
        bearing: -20,
        duration: 1000
      });
    });
  });

  document
    .getElementById('btn-play-single')
    .addEventListener('click', () => {
      const id = buildingSelect.value;
      if (!id) {
        infoDiv.innerHTML = 'Lütfen bir bina seç.';
        return;
      }
      if (window.WasteAnimation) {
        WasteAnimation.playTripsForBuilding(id, (msg) => {
          infoDiv.innerHTML = msg;
        });
      }
    });

  initTimeline(infoDiv);
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

  const allDateStrings = [];
  BUILDINGS.forEach((b) => {
    (b.trips || []).forEach((d) => allDateStrings.push(d));
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

  clampSliders();

  btnPlayRange.addEventListener('click', () => {
    const { fromStr, toStr } = clampSliders();

    if (window.WasteAnimation) {
      WasteAnimation.playTripsForAllBuildingsInRange(fromStr, toStr, (msg) => {
        infoDiv.innerHTML = msg;
      });
    }
  });
}
