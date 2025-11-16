// js/filters.js

(function () {
  const sourceId = 'building-points-src';
  const baseLayerId = 'building-points-base';
  const hlLayerId = 'building-points-highlight';

  let map = null;
  let summaryChart = null;

  function getCheckbox(id) {
    return document.getElementById(id);
  }

  // BUILDINGS'ten kategori flag'leri olan Feature'lar üret
  function buildFeaturesFromBuildings() {
    return BUILDINGS.map((b) => {
      const stats = b.newStats || b.oldStats || {};

      const res = stats.residential ?? 0;
      const com = stats.commercial ?? 0;
      const units = stats.units ?? 1;
      const retired = stats.retired ?? 0;
      const disabled = stats.disabledOwners ?? 0;

      const catResidential = res > com ? 1 : 0;
      const catCommercial = com > res ? 1 : 0;
      const catRetired = units > 0 && retired / units >= 0.5 ? 1 : 0;
      const catDisabled = disabled > 0 ? 1 : 0;

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: b.coords
        },
        properties: {
          id: b.id,
          name: b.name,
          catResidential,
          catCommercial,
          catRetired,
          catDisabled
        }
      };
    });
  }

  function ensureSourceAndLayers() {
    if (map.getSource(sourceId)) return;

    const fc = {
      type: 'FeatureCollection',
      features: buildFeaturesFromBuildings()
    };

    map.addSource(sourceId, {
      type: 'geojson',
      data: fc
    });

    // Gri taban: tüm binalar
    map.addLayer({
      id: baseLayerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12, 3,
          16, 5,
          19, 8
        ],
        'circle-color': '#aaaaaa',
        'circle-opacity': 0.35
      }
    });

    // Vurgulu layer: filtreye uyanlar
    map.addLayer({
      id: hlLayerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12, 5,
          16, 7,
          19, 10
        ],
        'circle-color': '#ff6a00',
        'circle-opacity': 0.9,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#221100'
      }
    });

    updateFilter(); // ilk state
  }

  // Şu andaki checkbox durumuna göre Mapbox filter'ını güncelle
  function updateFilter() {
    if (!map || !map.getLayer(hlLayerId)) return;

    const cbRes = getCheckbox('filter-residential');
    const cbCom = getCheckbox('filter-commercial');
    const cbRet = getCheckbox('filter-retired');
    const cbDis = getCheckbox('filter-disabled');

    const conds = [];

    if (cbRes && cbRes.checked) {
      conds.push(['==', ['get', 'catResidential'], 1]);
    }
    if (cbCom && cbCom.checked) {
      conds.push(['==', ['get', 'catCommercial'], 1]);
    }
    if (cbRet && cbRet.checked) {
      conds.push(['==', ['get', 'catRetired'], 1]);
    }
    if (cbDis && cbDis.checked) {
      conds.push(['==', ['get', 'catDisabled'], 1]);
    }

    if (!conds.length) {
      // Hiç filtre seçili değilse: highlight layer boş kalsın (kimseyi vurgulama)
      map.setFilter(hlLayerId, ['==', ['get', 'id'], '___none___']);
    } else {
      map.setFilter(hlLayerId, ['any', ...conds]);
    }

    // Grafik & listeyi de güncelle
    updateSummary();
  }

  // Mini donut grafik için Chart.js'i başlat
  function initChart() {
    const canvas = document.getElementById('filter-summary-chart');
    if (!canvas || !window.Chart) return;

    const ctx = canvas.getContext('2d');

    summaryChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Filtreye uyan birimler', 'Diğer birimler'],
        datasets: [
          {
            data: [0, 0],
            backgroundColor: ['#ffcc66', '#333333'],
            borderColor: ['#221100', '#000000'],
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        cutout: '55%',
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const label = ctx.label || '';
                const value = ctx.parsed || 0;
                return `${label}: ${value}`;
              }
            }
          }
        }
      }
    });

    // Grafiğe tıklayınca bina listesini aç/kapat
    const listDiv = document.getElementById('filter-buildings-list');
    canvas.addEventListener('click', () => {
      if (!listDiv) return;
      listDiv.classList.toggle('collapsed');
    });
  }

  // Şu anki filtrelere göre özet hesapla ve grafiğe + listeye yaz
  function updateSummary() {
    if (!map || !summaryChart) return;

    const cbRes = getCheckbox('filter-residential');
    const cbCom = getCheckbox('filter-commercial');
    const cbRet = getCheckbox('filter-retired');
    const cbDis = getCheckbox('filter-disabled');

    const active = {
      res: cbRes && cbRes.checked,
      com: cbCom && cbCom.checked,
      ret: cbRet && cbRet.checked,
      dis: cbDis && cbDis.checked
    };

    let selectedUnits = 0;
    let otherUnits = 0;
    const selectedBuildings = [];

    BUILDINGS.forEach((b) => {
      const stats = b.newStats || b.oldStats || {};
      const units = stats.units ?? 0;
      const res = stats.residential ?? 0;
      const com = stats.commercial ?? 0;
      const retired = stats.retired ?? 0;
      const disabled = stats.disabledOwners ?? 0;

      // Aynı mantık: bu bina seçili filtrelerden en az birine uyuyor mu?
      let match = false;
      if (active.res && res > com) match = true;
      if (active.com && com > res) match = true;
      if (active.ret && units > 0 && retired / units >= 0.5) match = true;
      if (active.dis && disabled > 0) match = true;

      if (!active.res && !active.com && !active.ret && !active.dis) {
        // Hiç filtre seçilmemişse: hepsi "diğer" sayılır
        otherUnits += units;
      } else if (match) {
        selectedUnits += units;
        selectedBuildings.push({ b, units });
      } else {
        otherUnits += units;
      }
    });

    // Chart datasını güncelle
    summaryChart.data.datasets[0].data = [selectedUnits, otherUnits];
    summaryChart.update();

    // Listeyi doldur
    const listDiv = document.getElementById('filter-buildings-list');
    if (!listDiv) return;

    listDiv.innerHTML = '';

    if (!selectedBuildings.length) {
      const empty = document.createElement('div');
      empty.className = 'filter-building-item';
      empty.textContent = 'Filtreye uyan bina yok.';
      listDiv.appendChild(empty);
      return;
    }

    selectedBuildings.forEach(({ b, units }) => {
      const item = document.createElement('div');
      item.className = 'filter-building-item';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'name';
      nameSpan.textContent = b.name;

      const unitSpan = document.createElement('span');
      unitSpan.className = 'units';
      unitSpan.textContent = `${units} birim`;

      item.appendChild(nameSpan);
      item.appendChild(unitSpan);

      // Tıklayınca mekansal zoom
      item.addEventListener('click', () => {
        const [lng, lat] = b.coords;
        map.flyTo({
          center: { lng, lat },
          zoom: 18,
          pitch: 60,
          bearing: -20,
          duration: 1000
        });
      });

      listDiv.appendChild(item);
    });
  }

  function init(mapInstance) {
    map = mapInstance;
    if (!map) return;

    ensureSourceAndLayers();
    initChart();
    updateSummary();

    const cbRes = getCheckbox('filter-residential');
    const cbCom = getCheckbox('filter-commercial');
    const cbRet = getCheckbox('filter-retired');
    const cbDis = getCheckbox('filter-disabled');

    [cbRes, cbCom, cbRet, cbDis].forEach((cb) => {
      if (!cb) return;
      cb.addEventListener('change', updateFilter);
    });
  }

  // Global export
  window.BuildingFilters = {
    init
  };
})();
