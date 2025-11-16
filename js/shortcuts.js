// js/shortcuts.js

// Hem eski hem yeni map'e aynı açıyı uygular
function setViewBothMaps({ pitch, bearing, zoom }) {
  if (typeof mapOld === 'undefined' || typeof mapNew === 'undefined') return;

  [mapOld, mapNew].forEach((m) => {
    if (!m) return;

    const center = m.getCenter(); // mevcut merkezi koru
    m.easeTo({
      center,
      pitch,
      bearing,
      zoom: zoom ?? m.getZoom(),
      duration: 800
    });
  });
}

// Numpad key handler
function initViewShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Input alanındayken çalışmasın
    const tag = (e.target && e.target.tagName) || '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

    switch (e.code) {
      case 'Numpad5':
        // TOP VIEW: tam üstten
        setViewBothMaps({
          pitch: 0,
          bearing: 0
        });
        break;

      case 'Numpad8':
        // KUZEY
        setViewBothMaps({
          pitch: 60,
          bearing: 0
        });
        break;

      case 'Numpad2':
        // GÜNEY
        setViewBothMaps({
          pitch: 60,
          bearing: 180
        });
        break;

      case 'Numpad4':
        // BATI
        setViewBothMaps({
          pitch: 60,
          bearing: -90
        });
        break;

      case 'Numpad6':
        // DOĞU
        setViewBothMaps({
          pitch: 60,
          bearing: 90
        });
        break;

      default:
        break;
    }
  });
}

/* ──────────────────────────────── */
/* Kuzey göstergesi (pusula) */
/* ──────────────────────────────── */

function initNorthIndicator() {
  if (typeof mapNew === 'undefined') {
    console.warn('mapNew tanımlı değil, kuzey göstergesi başlatılamadı.');
    return;
  }

  const arrowEl = document.querySelector('#north-indicator .north-arrow');
  if (!arrowEl) {
    console.warn('#north-indicator .north-arrow bulunamadı.');
    return;
  }

  function updateArrow() {
    // mapbox bearing: kuzeyden saat yönünde derece
    const bearing = mapNew.getBearing(); // örn. 0, 90, 180...
    // Okun default hali "yukarı" = 0°, bu yüzden world north'u göstermek için -bearing döndürüyoruz
    arrowEl.style.transform = `rotate(${-bearing}deg)`;
  }

  // Bearing değiştiğinde güncelle (move tüm kamera değişimlerinde tetikleniyor)
  mapNew.on('move', updateArrow);

  // İlk yüklemede de bir kez çağır
  updateArrow();
}

/* ──────────────────────────────── */
/* DOM ready */
/* ──────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  initViewShortcuts();
  initNorthIndicator();
});
