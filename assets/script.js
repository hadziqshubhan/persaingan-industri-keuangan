// Optimized WebGIS script (Single GeoJSON File, Kabupaten layer removed, No Turf.js needed)
// Dependencies: Leaflet, PapaParse

// --- UTILITIES ---
const byId = id => document.getElementById(id);
const showLoading = () => { const e = byId('loading-overlay'); if (e) e.style.display = 'flex'; };
const hideLoading = () => { const e = byId('loading-overlay'); if (e) e.style.display = 'none'; };
const debounce = (fn, wait = 100) => {
  let t; 
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); };
};

// Gunakan Intl.NumberFormat asli yang jauh lebih cepat
const idFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

// Normalize/parse numeric fields efficiently
function normalizeRowNumbers(row) {
  for (const k in row) {
    const v = row[k];
    if (v === '' || v == null) { row[k] = null; continue; }
    if (typeof v === 'number') continue;
    
    // Coba parsing cepat
    const strVal = String(v).trim();
    if (!isNaN(strVal)) {
      row[k] = Number(strVal);
      continue;
    }
    
    // Fallback regex untuk format angka Indonesia (misal: "1.000,50")
    const cleanStr = strVal.replace(/\./g, '').replace(/,/g, '.');
    const n = Number(cleanStr);
    row[k] = isNaN(n) ? row[k] : n;
  }
  return row;
}

// Load CSV into map keyed by keyField
function loadCSVToMap(url, keyField, targetMap) {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      complete: results => {
        for (const row of results.data) {
          if (row[keyField] == null) continue;
          const normalized = normalizeRowNumbers(row);
          const key = isNaN(Number(normalized[keyField])) ? normalized[keyField] : Number(normalized[keyField]);
          targetMap[key] = normalized;
        }
        resolve();
      },
      error: err => reject(err)
    });
  });
}

// Number formatting helper
function formatNumber(value) {
  if (value == null || value === '') return '-';
  if (typeof value !== 'number' || isNaN(value)) return String(value);
  return idFormatter.format(value);
}

// Color interpolation (fast bitwise)
function interpolateColor(hex1, hex2, ratio) {
  const h = s => parseInt(s, 16);
  const r1 = h(hex1.slice(1, 3)), g1 = h(hex1.slice(3, 5)), b1 = h(hex1.slice(5, 7));
  const r2 = h(hex2.slice(1, 3)), g2 = h(hex2.slice(3, 5)), b2 = h(hex2.slice(5, 7));
  
  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);
  return `rgb(${r},${g},${b})`;
}

// --- MAP SETUP ---
const provDataMap = {}; 
const tooltipLayerGroup = L.layerGroup(); 
let topTooltipPaneCreated = false;

const baseOSM = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' });
const baseCarto = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO &copy; OSM' });
const baseESRI = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '&copy; ESRI' });

const map = L.map('map', {
  center: [-2.5, 118],
  zoom: 5,
  zoomSnap: 0.1,
  preferCanvas: true,
  zoomDelta: 0.1,
  layers: [baseCarto] // Default map
});

map.createPane('rasterPane').style.zIndex = 200;
map.createPane('vectorPane').style.zIndex = 400;

if (!topTooltipPaneCreated) {
  map.createPane('topTooltipPane').style.zIndex = 650;
  topTooltipPaneCreated = true;
}

const baseLayers = { 'None': L.layerGroup(), 'Carto Dark': baseCarto, 'OpenStreetMap': baseOSM, 'ESRI Satellite': baseESRI };
const overlays = {};

// NightTime image overlay
const imageBounds = [[-11.0083334214, 94.9708340931], [6.0791667153, 141.0208344615]];
L.imageOverlay('data/NightTimeLight_1.png', imageBounds, { pane: 'rasterPane' }).addTo(map);
map.fitBounds(imageBounds);

// --- LEGEND NTL ---
const legendNTL = L.control({ position: "bottomright" });
legendNTL.onAdd = function () {
  const div = L.DomUtil.create("div");
  div.style.cssText = "background: rgba(255, 255, 255, 0.9); padding: 10px 12px; border-radius: 8px; box-shadow: 0 0 8px rgba(0,0,0,0.2); font-size: 13px; line-height: 1.4; color: #333;";
  div.innerHTML = `
    <h4 style="margin: 0 0 6px; font-weight: bold; text-align: center;">Kecerahan NTL</h4>
    <p style="margin:0; text-align: center;">(x 10⁻¹ nWatts/cm²/sr)</p>
    <div style="width: 160px; height: 12px; border-radius: 6px; background: linear-gradient(to right, #ff7f00, #e4ff1c); margin: 6px 0;"></div>
    <div style="display: flex; justify-content: space-between; font-size: 12px;">
      <span>0</span><span>>15</span>
    </div>
  `;
  return div;
};
legendNTL.addTo(map);

// --- MAPPING GEOJSON STRING ID TO BPS NUMERIC ID ---
// Dictionary ini mengubungkan ID dari file id (1).json ke ID administratif di data_SEM.csv
const provMapping = {
    "IDAC": { code: 11, name: "Aceh" },
    "IDSU": { code: 12, name: "Sumatera Utara" },
    "IDSB": { code: 13, name: "Sumatera Barat" },
    "IDRI": { code: 14, name: "Riau" },
    "IDJA": { code: 15, name: "Jambi" },
    "IDSS": { code: 16, name: "Sumatera Selatan" },
    "IDBE": { code: 17, name: "Bengkulu" },
    "IDLA": { code: 18, name: "Lampung" },
    "IDBB": { code: 19, name: "Bangka-Belitung" },
    "IDKR": { code: 21, name: "Kepulauan Riau" },
    "IDJK": { code: 31, name: "DKI Jakarta" },
    "IDJB": { code: 32, name: "Jawa Barat" },
    "IDJT": { code: 33, name: "Jawa Tengah" },
    "IDYO": { code: 34, name: "DI Yogyakarta" },
    "IDJI": { code: 35, name: "Jawa Timur" },
    "IDBT": { code: 36, name: "Banten" },
    "IDBA": { code: 51, name: "Bali" },
    "IDNB": { code: 52, name: "Nusa Tenggara Barat" },
    "IDNT": { code: 53, name: "Nusa Tenggara Timur" },
    "IDKB": { code: 61, name: "Kalimantan Barat" },
    "IDKT": { code: 62, name: "Kalimantan Tengah" },
    "IDKS": { code: 63, name: "Kalimantan Selatan" },
    "IDKI": { code: 64, name: "Kalimantan Timur" },
    "IDKU": { code: 65, name: "Kalimantan Utara" },
    "IDSA": { code: 71, name: "Sulawesi Utara" },
    "IDST": { code: 72, name: "Sulawesi Tengah" },
    "IDSN": { code: 73, name: "Sulawesi Selatan" },
    "IDSG": { code: 74, name: "Sulawesi Tenggara" },
    "IDGO": { code: 75, name: "Gorontalo" },
    "IDSR": { code: 76, name: "Sulawesi Barat" },
    "IDMA": { code: 81, name: "Maluku" },
    "IDMU": { code: 82, name: "Maluku Utara" },
    "IDPA": { code: 91, name: "Papua" },
    "IDPB": { code: 92, name: "Papua Barat" }
};

// --- SINGLE GEOJSON FETCHING ---
async function loadProvinceBoundaries() {
  // Pastikan path menunjuk ke file GeoJSON lokal Anda
  const res = await fetch('data/bataswilayah.json'); 
  if (!res.ok) throw new Error('Gagal memuat file batas wilayah (id (1).json)');
  const geojson = await res.json();
  
  geojson.features.forEach(feature => {
     let matchedProv = null;
     
     // Pencarian otomatis ID di dalam properti geojson
     for (const key in feature.properties) {
        const val = feature.properties[key];
        if (typeof val === 'string' && provMapping[val]) {
            matchedProv = provMapping[val];
            break;
        }
     }
     
     if (matchedProv) {
         // Tanamkan Code (Numerik BPS) dan Nama ke dalam properti agar dibaca Choropleth
         feature.properties.Code = matchedProv.code; 
         feature.properties.Name = matchedProv.name; 
         
         addProvinceLayer({ 
            code: matchedProv.code, 
            geo: { type: 'FeatureCollection', features: [feature] } 
         });
     }
  });
}

// --- PROVINCE LAYERS & TOOLTIPS ---
let combinedProvFeatures = []; // Untuk kalkulasi Choropleth

function addProvinceLayer({ code, geo }) {
  const defaultStyle = { color: '#00bfff', weight: 1, fillOpacity: 0 };
  const highlightStyle = { color: '#ffff00', weight: 3, fillOpacity: 0.2 };

  const layer = L.geoJSON(geo, { pane: 'vectorPane', style: defaultStyle }).addTo(map);

  const csvData = provDataMap[code];
  const name = geo.features[0].properties?.Name || `Provinsi ${code}`;
  
  let popupContent = `<b>${name}</b><br><i>Data CSV tidak tersedia</i>`;
  if (csvData) {
    popupContent = `
      <div style="font-family:Segoe UI, sans-serif; font-size:13px; color:#333">
        <div style="font-weight:600; font-size:14px; margin-bottom:6px">${name}</div>
        <table style="width:100%; border-collapse:collapse">
          <tr><td>Laju Pertumbuhan PDRB (ADHK)</td><td style="text-align:right">${formatNumber(csvData["Laju Pertumbuhan PDRB Atas Dasar Harga Konstan"])}</td></tr>
          <tr><td>Non Performing Loan</td><td style="text-align:right">${formatNumber(csvData["Non Perform Loan (persen)"])}</td></tr>
          <tr><td>Jumlah BPR/S</td><td style="text-align:right">${formatNumber(csvData["Jumlah BPR/S"])}</td></tr>
          <tr><td>Industri Mikro</td><td style="text-align:right">${formatNumber(csvData["Jumlah Perusahaan Industri Skala Mikro"])}</td></tr>
          <tr><td>Industri Kecil</td><td style="text-align:right">${formatNumber(csvData["Jumlah Perusahaan Industri Skala Kecil"])}</td></tr>
          <tr><td>Penetrasi Internet</td><td style="text-align:right">${formatNumber(csvData["Tingkat Penetrasi Internet"])}</td></tr>
        </table>
      </div>
    `;
  }

  layer.bindPopup(popupContent);

  const center = L.geoJSON(geo).getBounds().getCenter();
  const label = L.marker(center, {
    pane: 'topTooltipPane',
    icon: L.divIcon({ className: 'prov-label', html: `<div>${name}</div>`, iconSize: [100, 24] }),
    interactive: false
  });
  tooltipLayerGroup.addLayer(label);

  layer.on('mouseover', () => layer.setStyle(highlightStyle));
  layer.on('mouseout', () => layer.setStyle(defaultStyle));
  layer.on('dblclick', e => {
    L.DomEvent.stopPropagation(e);
    L.DomEvent.preventDefault(e);
    // Klik ganda sekarang hanya men-zoom in mulus tanpa memuat data kabupaten
    map.fitBounds(layer.getBounds(), { padding: [20, 20], maxZoom: 8 });
  });

  combinedProvFeatures.push(...geo.features);
}

// --- TOOLTIP VISIBILITY ---
const updateTooltipVisibility = debounce(() => {
  const z = map.getZoom();
  if (z < 6 && map.hasLayer(tooltipLayerGroup)) {
    map.removeLayer(tooltipLayerGroup);
  } else if (z >= 6 && !map.hasLayer(tooltipLayerGroup)) {
    map.addLayer(tooltipLayerGroup);
  }
}, 120);

map.on('moveend zoomend', updateTooltipVisibility);

// --- CHOROPLETH ---
const colorPalettes = [
  ['#e4ff1c','#ff7f00'], ['#66ffcc','#0066ff'], ['#ff80ff','#9b00ff'],
  ['#ccff66','#00cc00'], ['#ffff66','#ff0000'], ['#ffcccc','#ff3399'],
  ['#ffff99','#996600'], ['#cc99ff','#6600cc'], ['#aaffaa','#008080']
];

const legendDiv = L.DomUtil.create('div', 'legend-choropleth');
legendDiv.style.cssText = 'display: none; background: rgba(255,255,255,0.95); padding: 8px 10px; border-radius: 8px; font-size: 13px; box-shadow: 0 0 8px rgba(0,0,0,0.15);';
const legendControl = L.control({ position: 'bottomright' });
legendControl.onAdd = () => legendDiv;
legendControl.addTo(map);

function updateLegend({ columnName, startColor, endColor, min, max } = {}) {
  // Jika tidak ada data layer, kosongkan dan sembunyikan kotak legenda
  if (!columnName) { 
    legendDiv.innerHTML = ''; 
    legendDiv.style.display = 'none'; 
    return; 
  }

  // Tampilkan kembali kotak legenda ketika layer aktif
  legendDiv.style.display = 'block';

  const steps = 4;
  let html = `<strong>${columnName}</strong><br/>`;
  
  const safeMin = Math.max(min, 1);
  const logMin = Math.log(safeMin);
  const logMax = Math.log(Math.max(max, safeMin + 1));
  
  for (let i = 0; i < steps; i++) {
    // Hitung rentang dalam skala log
    const currentLog = logMin + i * (logMax - logMin) / steps;
    const nextLog = logMin + (i + 1) * (logMax - logMin) / steps;
    
    // Kembalikan ke angka asli (eksponensial) untuk ditampilkan di legenda
    const currentVal = Math.exp(currentLog);
    const nextVal = Math.exp(nextLog);
    
    const c = interpolateColor(startColor, endColor, i / (steps - 1 || 1));
    html += `<i style="background:${c};width:20px;height:10px;display:inline-block;margin-right:6px;"></i> ${formatNumber(currentVal)} – ${formatNumber(nextVal)}<br/>`;
  }
  legendDiv.innerHTML = html;
}

function createChoroplethLayer(columnName, startColor, endColor) {
  const vals = [];
  
  // 1. Ambil semua nilai yang valid
  for (const f of combinedProvFeatures) {
    const code = f.properties?.Code;
    const row = provDataMap[code];
    if (row && typeof row[columnName] === 'number') {
      vals.push(row[columnName]);
    }
  }
  
  if (vals.length === 0) return null;

  // 2. Tentukan min dan max SECARA LINEAR TERLEBIH DAHULU (Jangan dihapus)
  const min = Math.min(...vals);
  const max = Math.max(...vals);

  // 3. BARU LAKUKAN TRANSFORMASI LOGARITMA DI SINI
  const safeMin = Math.max(min, 1);
  const logMin = Math.log(safeMin);
  const logMax = Math.log(Math.max(max, safeMin + 1)); 

  // 4. Fungsi penentu warna
  const getColor = v => {
    if (max === min || v <= 0) return interpolateColor(startColor, endColor, 0);
    const ratio = (Math.log(v) - logMin) / (logMax - logMin);
    const safeRatio = Math.max(0, Math.min(1, ratio)); // Menjaga rasio agar tidak bocor
    return interpolateColor(startColor, endColor, safeRatio);
  };

  const geoJson = L.geoJSON({ type: 'FeatureCollection', features: combinedProvFeatures }, {
    style: feature => {
      const code = feature.properties?.Code;
      const v = provDataMap[code]?.[columnName];
      return { 
        fillColor: (v != null && !isNaN(v)) ? getColor(v) : '#ccc', 
        color: 'white', 
        weight: 1, 
        fillOpacity: 1 // Warna solid (tidak transparan)
      };
    },
    onEachFeature: (feature, layer) => {
      const code = feature.properties?.Code;
      const val = provDataMap[code]?.[columnName];
      const displayVal = val != null ? formatNumber(val) : 'N/A';
      layer.bindTooltip(`${feature.properties.Name}<br>${columnName}: ${displayVal}`, { direction: 'top', offset: [0, -4] });
    }
  });

  // 5. Simpan meta untuk merender legenda
  geoJson._choroplethMeta = { columnName, startColor, endColor, min, max };
  return geoJson;
}

map.on('overlayadd', e => {
  if (e.layer?._choroplethMeta) {
    updateLegend(e.layer._choroplethMeta);
  }
});
map.on('overlayremove', e => {
  if (e.layer?._choroplethMeta) updateLegend(null);
});

// --- MAIN BOOTSTRAP ---
(async function init() {
  showLoading();
  try {
    // 1. Muat data CSV terlebih dahulu
    await loadCSVToMap('data/data_SEM.csv', 'idProv', provDataMap);

    // 2. Muat satu file GeoJSON (Peta Administrasi) dan render
    await loadProvinceBoundaries();

    // Setup tooltip layer
    tooltipLayerGroup.addTo(map);
    updateTooltipVisibility();

    // 3. Bangun layer Choropleth otomatis dari CSV
    const sampleRow = Object.values(provDataMap)[0];
    if (sampleRow) {
      const columns = Object.keys(sampleRow).filter(k => !['idProv', 'Nama_Prov'].includes(k));
      columns.forEach((col, i) => {
        const [start, end] = colorPalettes[i % colorPalettes.length];
        const layer = createChoroplethLayer(col, start, end);
        if (layer) {
          overlays[`Choropleth: ${col}`] = layer;
        }
      });
    }

    // Tampilkan Control Panel Layer Leaflet
    L.control.layers(baseLayers, overlays, { collapsed: true }).addTo(map);

  } catch (err) {
    console.error('Init error:', err);
  } finally {
    hideLoading();
  }
})();
