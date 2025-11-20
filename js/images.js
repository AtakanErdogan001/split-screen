// js/images.js

// Her bina için kaç eski / yeni görsel olduğunu söylüyoruz.
// Klasör yapısı:
// images/B1/old_1.jpg, old_2.jpg ... new_1.jpg, new_2.jpg ...
const BUILDING_IMAGE_CONFIG = {
  B1: { oldCount: 4, newCount: 4 },
  B2: { oldCount: 2, newCount: 2 }
  // B3, B4... eklenecek: B3: { oldCount: 3, newCount: 4 } gibi
};

// Bir bina için klasör tabanlı dosya yollarını üret
function getImagePaths(buildingId) {
  const cfg = BUILDING_IMAGE_CONFIG[buildingId] || { oldCount: 0, newCount: 0 };
  const base = `./images/${buildingId}`;

  const old = [];
  for (let i = 1; i <= (cfg.oldCount || 0); i++) {
    old.push(`${base}/old_${i}.jpeg`);
  }

  const newer = [];
  for (let i = 1; i <= (cfg.newCount || 0); i++) {
    newer.push(`${base}/new_${i}.jpeg`);
  }

  return { old, newer };
}

// İstatistik label'ları
const STAT_LABELS = {
  buildingName: 'Bina Adı',
  ruhsat: 'Yıkım/Yapım Ruhsatı',
  area: 'Alan (m²)',
  constructionArea: 'İnşaat alanı (m²)',
  floors: 'Bina kat',
  units: 'Bağımsız birim',
  residential: 'Konut',
  commercial: 'Ticari',
  owners: 'Malik sayısı',
  disabledOwners: 'Engelli malik',
  femaleHeads: 'Hanehalkı reisi kadın',
  retired: 'Emekli',
  janitorFlat: 'Kapıcı dairesi',
  tripsEach: 'Atık çıkış tarihleri'
};

// Numeric değerleri min–max aralığına göre %'ye çevir
function getNormalizedPercent(field, value) {
  const ranges = window.STAT_RANGES || {};
  const range = ranges[field];
  if (!range) return 0;
  const { min, max } = range;
  if (max === min) return 100; // hepsi aynı ise full bar
  return ((value - min) / (max - min)) * 100;
}

function getBarColor(percent) {
  if (percent <= 20) return '#00c853';     // yeşil
  if (percent <= 50) return '#ffeb3b';     // sarı
  if (percent <= 70) return '#ff9800';     // turuncu
  return '#d32f2f';                        // kırmızı
}

let statPieChart = null;
let statPieCenters = []; // bina koordinatları

function generatePieColors(count) {
  const base = [
    '#ffcc66',
    '#ff8a65',
    '#4db6ac',
    '#ba68c8',
    '#81c784',
    '#f06292',
    '#9575cd',
    '#aed581',
    '#4fc3f7',
    '#e57373'
  ];
  const colors = [];
  for (let i = 0; i < count; i++) {
    colors.push(base[i % base.length]);
  }
  return colors;
}

function openStatPie(field, statsType) {
  const panel = document.getElementById('stat-pie-panel');
  const titleEl = document.getElementById('stat-pie-title');
  const subtitleEl = document.getElementById('stat-pie-subtitle');
  const canvas = document.getElementById('stat-pie-chart');

  if (!panel || !canvas || !window.Chart) {
    console.warn('Pie panel veya Chart.js bulunamadı.');
    return;
  }

  const ctx = canvas.getContext('2d');
  const label = STAT_LABELS[field] || field;

  const labels = [];
  const data = [];
  statPieCenters = [];

  BUILDINGS.forEach((b) => {
    const stats =
      statsType === 'old'
        ? b.oldStats
        : statsType === 'new'
        ? b.newStats
        : null;
    if (!stats) return;

    const v = stats[field];
    if (typeof v === 'number' && !Number.isNaN(v)) {
      labels.push(b.name || b.id);
      data.push(v);
      statPieCenters.push(b.coords);
    }
  });

  if (!data.length) {
    console.warn('Bu alan için numeric veri yok:', field, statsType);
    return;
  }

  const colors = generatePieColors(data.length);

  if (statPieChart) {
    statPieChart.destroy();
  }

  statPieChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderColor: '#111',
          borderWidth: 1
        }
      ]
    },
    options: {
      animation: {
        duration: 250
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: '#fff',
            font: {
              size: 11
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              const name = ctx.label || '';
              const val = ctx.parsed || 0;
              return `${name}: ${val}`;
            }
          }
        }
      },
      onClick: (evt, elements) => {
        if (!elements || !elements.length) return;
        const idx = elements[0].index;
        const center = statPieCenters[idx];
        if (!center || center.length < 2) return;

        const [lng, lat] = center;
        const flyOpts = {
          center: { lng, lat },
          zoom: 18,
          pitch: 60,
          bearing: -20,
          duration: 1000
        };

        if (typeof mapOld !== 'undefined') {
          mapOld.flyTo(flyOpts);
        }
        if (typeof mapNew !== 'undefined') {
          mapNew.flyTo(flyOpts);
        }
      }
    }
  });

  // Başlık / alt başlık
  if (titleEl) {
    const sideText = statsType === 'old' ? 'Eski Binalar' : 'Yeni Binalar';
    titleEl.textContent = `${label}`;
    if (subtitleEl) {
      subtitleEl.textContent = `${sideText} için bina dağılımı`;
    }
  }

  panel.classList.remove('hidden');
}


// Bina "seçilmiş" sayılması için tıklama mesafesi (metre)
const CLICK_DISTANCE_THRESHOLD_METERS = 50;

// Basit mesafe fonksiyonu (tıklama için)
function distanceMetersSimple(coord1, coord2) {
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

/* ──────────────────────────────── */
/* Küçük panellerdeki görseller + istatistikler */
/* ──────────────────────────────── */

// Çoklu görseli konteynıra bas (thumbnail'ler)
function renderImages(container, paths, type, buildingId) {
  container.innerHTML = '';

  if (!paths || !paths.length) {
    return;
  }

  // Max 4 görsel
  paths.slice(0, 4).forEach((p, idx) => {
    const img = document.createElement('img');
    img.src = p;
    img.alt = 'Bina görseli';
    img.dataset.buildingId = buildingId;
    img.dataset.index = String(idx);
    img.dataset.type = type; // 'old' veya 'new'
    img.classList.add('thumb-image');

    // Thumbnail'e tıklayınca full-screen karşılaştırma aç
    img.addEventListener('click', handleThumbnailClick);

    container.appendChild(img);
  });
}

// Tek panel için stat satırlarını HTML olarak oluştur (bar destekli)
function buildStatsHtml(stats, statsType) {
  if (!stats) {
    return '<div class="bi-stat-row"><span class="bi-stat-label">Veri yok</span></div>';
  }

  const rows = [];
  const ranges = window.STAT_RANGES || {};
  const numericKeys = window.NUMERIC_STAT_KEYS || [];

  for (const [key, label] of Object.entries(STAT_LABELS)) {
    const rawValue =
      stats[key] !== undefined && stats[key] !== null ? stats[key] : '-';

    // Eğer bu alan numeric ve global range'i varsa → bar + bar sonunda değer
    if (
      numericKeys.includes(key) &&
      typeof stats[key] === 'number' &&
      ranges[key]
    ) {
      const value = stats[key];
      const pct = getNormalizedPercent(key, value);   // 0–100
      const { min, max } = ranges[key];
      const color = getBarColor(pct);

      const rawPos = 100 - pct;
      const posPct = Math.max(5, Math.min(95, rawPos));

      rows.push(`
        <div class="bi-stat-row stat-row">
          <div class="stat-header">
            <span class="stat-label">${label}</span>
          </div>
          <div class="stat-bar"
               data-stat-field="${key}"
               data-stats-type="${statsType}"
               title="Min: ${min} · Max: ${max}">
            <div class="stat-bar-fill"
                 style="width:${pct}%; background:${color};"></div>
            <div class="stat-bar-value-label"
                 style="left:calc(${posPct}% - 8px);">
              ${value}
            </div>
          </div>
        </div>
      `);
    } else {
      // String / tarih / 'Kapıcı dairesi' / trips gibi numeric olmayanlar
      rows.push(`
        <div class="bi-stat-row">
          <span class="bi-stat-label">${label}</span>
          <span class="bi-stat-value">${rawValue}</span>
        </div>
      `);
    }

  }

  return rows.join('');
}



// Seçili bina için hem eski hem yeni paneli doldur ve panelleri göster
function showBuildingPanels(buildingId) {
  const b = BUILDINGS.find((x) => x.id === buildingId);

  const oldPanel = document.getElementById('building-info-old');
  const newPanel = document.getElementById('building-info-new');

  const oldPanelTitle = document.getElementById('old-building-title');
  const oldPanelId = document.getElementById('old-building-id');
  const oldImagesContainer = document.getElementById('old-images');
  const oldStatsDiv = document.getElementById('old-building-stats');

  const newPanelTitle = document.getElementById('new-building-title');
  const newPanelId = document.getElementById('new-building-id');
  const newImagesContainer = document.getElementById('new-images');
  const newStatsDiv = document.getElementById('new-building-stats');

  if (!b) {
    hideBuildingPanels();
    return;
  }

  // Panelleri görünür yap
  if (oldPanel) oldPanel.classList.remove('hidden');
  if (newPanel) newPanel.classList.remove('hidden');

  // Başlıklar
  if (oldPanelTitle) oldPanelTitle.textContent = 'Eski: ' + b.name;
  if (oldPanelId) oldPanelId.textContent = `ID: ${b.id}`;
  if (newPanelTitle) newPanelTitle.textContent = 'Yeni: ' + b.name;
  if (newPanelId) newPanelId.textContent = `ID: ${b.id}`;

  // Görseller (klasör tabanlı)
  const { old, newer } = getImagePaths(b.id);
  renderImages(oldImagesContainer, old, 'old', b.id);
  renderImages(newImagesContainer, newer, 'new', b.id);

  // Atık tarihlerini stringe çevir
  const tripsStr =
    b.trips && b.trips.length ? b.trips.join(', ') : 'Kayıtlı sefer yok';

  const oldStatsWithTrips = {
    ...b.oldStats,
    tripsEach: tripsStr
  };

  const newStatsWithTrips = {
    ...b.newStats,
    tripsEach: tripsStr
  };

  // İstatistikleri (bar'lı) çiz
  oldStatsDiv.innerHTML = buildStatsHtml(oldStatsWithTrips, 'old');
  newStatsDiv.innerHTML = buildStatsHtml(newStatsWithTrips, 'new');

  // Bar click handler'larını bağla
  attachStatBarClickHandlers();
}

function attachStatBarClickHandlers() {
  ['old', 'new'].forEach((side) => {
    const containerId =
      side === 'old' ? 'old-building-stats' : 'new-building-stats';
    const container = document.getElementById(containerId);
    if (!container) return;

    const bars = container.querySelectorAll('.stat-bar');
    bars.forEach((bar) => {
      const field = bar.dataset.statField;
      const statsType = bar.dataset.statsType;
      if (!field || !statsType) return;

      bar.addEventListener('click', (e) => {
        e.stopPropagation();
        openStatPie(field, statsType); // 👈 pie aç
      });
    });
  });
}



// Panelleri tamamen gizle
function hideBuildingPanels() {
  const oldPanel = document.getElementById('building-info-old');
  const newPanel = document.getElementById('building-info-new');
  if (oldPanel) oldPanel.classList.add('hidden');
  if (newPanel) newPanel.classList.add('hidden');
}

/* ──────────────────────────────── */
/* Harita tıklaması → bina seçimi */
/* ──────────────────────────────── */

function initMapClickForBuildingPanels() {
  if (typeof mapOld === 'undefined' || typeof mapNew === 'undefined') {
    console.warn('mapOld / mapNew henüz tanımlı değil. Click init atlandı.');
    return;
  }

  function handleClick(e) {
    const clickLngLat = [e.lngLat.lng, e.lngLat.lat];

    let nearest = null;
    let nearestDist = Infinity;

    BUILDINGS.forEach((b) => {
      const d = distanceMetersSimple(clickLngLat, b.coords);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = b;
      }
    });

    if (!nearest || nearestDist > CLICK_DISTANCE_THRESHOLD_METERS) {
      console.log(
        'Yakında bina yok, paneller kapatılıyor. Mesafe:',
        nearestDist === Infinity ? '∞' : nearestDist.toFixed(1),
        'm'
      );
      hideBuildingPanels();
      return;
    }

    console.log(
      'Seçilen bina:',
      nearest.id,
      nearest.name,
      'mesafe:',
      nearestDist.toFixed(1),
      'm'
    );
    showBuildingPanels(nearest.id);
  }

  // Hem eski hem yeni map tıklamalarını dinleyelim
  mapOld.on('click', handleClick);
  mapNew.on('click', handleClick);
}

/* ──────────────────────────────── */
/* Tam ekran overlay: büyük görseller + okla geçiş */
/* ──────────────────────────────── */

let overlayEl = null;
let icoImgOld = null;
let icoImgNew = null;
let icoPrevBtn = null;
let icoNextBtn = null;
let icoCounter = null;

let currentOverlayBuildingId = null;
let currentOverlayIndex = 0;

function getOverlayArrays() {
  if (!currentOverlayBuildingId) return { oldArr: [], newArr: [] };
  const { old, newer } = getImagePaths(currentOverlayBuildingId);
  return { oldArr: old, newArr: newer };
}

function updateFullImageCompare() {
  if (!overlayEl || !icoImgOld || !icoImgNew || !icoCounter) return;
  if (!currentOverlayBuildingId) return;

  const { oldArr, newArr } = getOverlayArrays();
  const maxIdx = Math.max(oldArr.length, newArr.length) - 1;
  if (maxIdx < 0) {
    overlayEl.classList.add('hidden');
    return;
  }

  // Index'i clamp et
  if (currentOverlayIndex > maxIdx) currentOverlayIndex = maxIdx;
  if (currentOverlayIndex < 0) currentOverlayIndex = 0;

  // Eski ve yeni için seçilen index'e göre görsel seç
  const oldSrc = oldArr[currentOverlayIndex] || oldArr[0] || '';
  const newSrc = newArr[currentOverlayIndex] || newArr[0] || '';

  icoImgOld.src = oldSrc;
  icoImgNew.src = newSrc;

  // Sayaç
  icoCounter.textContent = `${currentOverlayIndex + 1} / ${maxIdx + 1}`;
}

function openFullImageCompare(buildingId, index) {
  currentOverlayBuildingId = buildingId;
  currentOverlayIndex = Number(index) || 0;

  if (!overlayEl) return;

  updateFullImageCompare();
  overlayEl.classList.remove('hidden');
}

function closeFullImageCompare() {
  if (!overlayEl) return;
  overlayEl.classList.add('hidden');
  currentOverlayBuildingId = null;
  currentOverlayIndex = 0;
}

// Thumbnail tıklama handler'ı
function handleThumbnailClick(e) {
  const img = e.currentTarget;
  const buildingId = img.dataset.buildingId;
  const index = img.dataset.index || '0';
  openFullImageCompare(buildingId, index);
}

function showPrevImage() {
  const { oldArr, newArr } = getOverlayArrays();
  const maxIdx = Math.max(oldArr.length, newArr.length) - 1;
  if (maxIdx < 0) return;

  currentOverlayIndex = (currentOverlayIndex - 1 + (maxIdx + 1)) % (maxIdx + 1);
  updateFullImageCompare();
}

function showNextImage() {
  const { oldArr, newArr } = getOverlayArrays();
  const maxIdx = Math.max(oldArr.length, newArr.length) - 1;
  if (maxIdx < 0) return;

  currentOverlayIndex = (currentOverlayIndex + 1) % (maxIdx + 1);
  updateFullImageCompare();
}

function initFullImageOverlay() {
  overlayEl = document.getElementById('image-compare-overlay');
  icoImgOld = document.getElementById('ico-img-old');
  icoImgNew = document.getElementById('ico-img-new');
  icoPrevBtn = document.getElementById('ico-prev');
  icoNextBtn = document.getElementById('ico-next');
  icoCounter = document.getElementById('ico-counter');

  if (!overlayEl || !icoImgOld || !icoImgNew || !icoPrevBtn || !icoNextBtn || !icoCounter) {
    console.warn('image-compare-overlay elementleri bulunamadı.');
    return;
  }

  // Boş alana tıklayınca kapat (arka plan)
  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) {
      closeFullImageCompare();
    }
  });

  // Butonlarla ileri / geri
  icoPrevBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showPrevImage();
  });

  icoNextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showNextImage();
  });

  // ESC ile kapatma + ok tuşlarıyla geçiş
  document.addEventListener('keydown', (e) => {
    if (overlayEl.classList.contains('hidden')) return;

    if (e.key === 'Escape') {
      closeFullImageCompare();
    } else if (e.key === 'ArrowLeft') {
      showPrevImage();
    } else if (e.key === 'ArrowRight') {
      showNextImage();
    }
  });
}

/* ──────────────────────────────── */
/* DOM ready */
/* ──────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  // İlk açılışta paneller kapalı
  hideBuildingPanels();

  // Harita tıklamasını başlat
  initMapClickForBuildingPanels();

  // Full-screen overlay'i hazırla
  initFullImageOverlay();

  const pieCloseBtn = document.getElementById('stat-pie-close');
  if (pieCloseBtn) {
    pieCloseBtn.addEventListener('click', () => {
      const panel = document.getElementById('stat-pie-panel');
      if (panel) panel.classList.add('hidden');
    });
  }
});
