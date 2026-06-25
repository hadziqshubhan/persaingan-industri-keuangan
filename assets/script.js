// Optimized WebGIS script (replace original main parts with this)
// Dependencies: Leaflet, PapaParse, turf

// --- UTILITIES ---
const byId = id => document.getElementById(id);
const showLoading = () => { const e = byId('loading-overlay'); if (e) e.style.display = 'flex'; };
const hideLoading = () => { const e = byId('loading-overlay'); if (e) e.style.display = 'none'; };
const debounce = (fn, wait=100) => {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), wait); };
};

// Normalize/parse numeric fields once when loading CSV
function normalizeRowNumbers(row) {
  Object.keys(row).forEach(k => {
    const v = row[k];
    if (v === '' || v == null) { row[k] = null; return; }
    // If PapaParse already numeric, keep it. Otherwise try parse
    if (typeof v === 'number' && !isNaN(v)) return;
    const n = Number(String(v).replace(/[, ]+/g, '.').replace(/[^0-9.\-]/g, ''));
    row[k] = isNaN(n) ? row[k] : n;
  });
  return row;
}



// Load CSV into map keyed by keyField; parse numbers once
async function loadCSVToMap(url, keyField, targetMap) {
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
          // use numeric key as number if possible
          const key = isNaN(Number(normalized[keyField])) ? normalized[keyField] : Number(normalized[keyField]);
          targetMap[key] = normalized;
        }
        resolve();
      },
      error: err => reject(err)
    });
  });
}

// Number formatting helper (fast)
function formatNumber(value, decimals = 0) {
  if (value == null || value === '') return '-';
  if (typeof value !== 'number' || isNaN(value)) return String(value);
  if (value < 100 && value % 1 !== 0) return value.toFixed(decimals).replace('.', ',');
  if (value >= 100) return Math.round(value).toLocaleString('id-ID');
  return value.toString();
}

// Color interpolation (returns rgb string)
function interpolateColor(hex1, hex2, ratio) {
  const h = s => parseInt(s, 16);
  const r1 = h(hex1.slice(1,3)), g1 = h(hex1.slice(3,5)), b1 = h(hex1.slice(5,7));
  const r2 = h(hex2.slice(1,3)), g2 = h(hex2.slice(3,5)), b2 = h(hex2.slice(5,7));
  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);
  return `rgb(${r},${g},${b})`;
}

// --- MAP SETUP ---
const provDataMap = {}, kabDataMap = {};
const cacheProv = {}, cacheKab = {};
const kabLayerGroup = L.layerGroup();
const tooltipLayerGroup = L.layerGroup(); // group untuk tooltip leaflet markers (lebih cepat kontrol)
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
  layers: [baseCarto, kabLayerGroup]
});

map.createPane('rasterPane').style.zIndex = 200;
map.createPane('vectorPane').style.zIndex = 400;
map.createPane('kabPane').style.zIndex = 500;

// create topTooltipPane once
if (!topTooltipPaneCreated) {
  map.createPane('topTooltipPane');
  map.getPane('topTooltipPane').style.zIndex = 650;
  topTooltipPaneCreated = true;
}

// baselayers & overlays placeholder
const baseLayers = { 'None': L.layerGroup(), 'Carto Dark': baseCarto, 'OpenStreetMap': baseOSM, 'ESRI Satellite': baseESRI };
const overlays = { 'Kabupaten Layer': kabLayerGroup };

// NightTime image overlay (kecepatan: imageOverlay cepat dibandingkan raster parsing di client)
const imageBounds = [[-11.0083334214, 94.9708340931],[6.0791667153, 141.0208344615]];
L.imageOverlay('data/NightTimeLight_1.png', imageBounds, { pane: 'rasterPane' }).addTo(map);
map.fitBounds(imageBounds);

// --- GEOJSON FETCHING WITH CACHE + PARALLEL ---
const legendNTL = L.control({ position: "bottomright" });

        legendNTL.onAdd = function (map) {
            const div = L.DomUtil.create("div");

            // Style untuk div utama (legend)
            div.style.background = "rgba(255, 255, 255, 0.9)";
            div.style.padding = "10px 12px";
            div.style.borderRadius = "8px";
            div.style.boxShadow = "0 0 8px rgba(0,0,0,0.2)";
            div.style.fontSize = "13px";
            div.style.lineHeight = "1.4";
            div.style.color = "#333";

            // Konten legend
            div.innerHTML = `
                <h4 style="margin: 0 0 6px; font-weight: bold; text-align: center;">Kecerahan NTL</h4>
                <p style="margin:0;">(x 10⁻¹ nWatts/cm²/sr)</p>
                <div style="
                    width: 160px; 
                    height: 12px; 
                    border-radius: 6px; 
                    background: linear-gradient(to right, #ff7f00, #e4ff1c); 
                    margin: 4px 0;"></div>
                <div style="
                    display: flex; 
                    justify-content: space-between; 
                    font-size: 12px;">
                    <span>0</span>
                    <span>>15</span>
                </div>
            `;
            return div;
        };

        legendNTL.addTo(map);

const provCodes = [11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 31, 32, 33, 34, 35, 36, 51, 52, 53, 61, 62, 63, 64, 65, 71, 72, 73, 74, 75, 76, 81, 82, 91, 92, 93, 94, 95, 96];
        const kabCodes = [1201, 1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209, 1210, 1211, 1212, 1213, 1214, 1215, 1216, 1217, 1218, 1219, 1220, 1221, 1222, 1223, 1224, 1225, 1271, 1272, 1273, 1274, 1275, 1276, 1277, 1278];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchProvGeoJSON(code) {
  if (cacheProv[code]) return cacheProv[code];
  try {
    const json = await fetchJson(`https://whatsproject.my.id/geo/v1/prov/${code}/map`);
    const geo = json.provFeature?.provFeature || json.provFeature || json;
    if (geo && geo.type === 'FeatureCollection') {
      cacheProv[code] = { code, geo };
      return cacheProv[code];
    }
  } catch (e) { console.warn('Gagal memuat provinsi', code, e); }
  return null;
}

async function fetchKabGeoJSON(code) {
  if (cacheKab[code]) return cacheKab[code];
  try {
    const json = await fetchJson(`https://whatsproject.my.id/geo/v1/city/${code}/map`);
    const geo = json.cityFeature?.cityFeature || json.cityFeature || json;
    if (geo && geo.type === 'FeatureCollection') {
      cacheKab[code] = { code, geo };
      return cacheKab[code];
    }
  } catch (e) { console.warn('Gagal memuat kabupaten', code, e); }
  return null;
}

// --- MERGE / UNION (GROUPED PROVINCES) ---
// mergeProvCodes mendefinisikan target grouping
const mergeProvCodes = { 92: [92, 96], 91: [91, 93, 94, 95] };

async function mergeProvincesUnion(codes) {
  // fetch all prov concurrently
  const promises = codes.map(c => fetchProvGeoJSON(c));
  const results = await Promise.all(promises);
  const merged = {};
  const mergedProps = {};

  for (const item of results) {
    if (!item) continue;
    const code = item.code;
    let target = code;
    for (const key in mergeProvCodes) {
      if (mergeProvCodes[key].includes(code)) { target = Number(key); break; }
    }
    // use feature-by-feature union
    for (const f of item.geo.features) {
      if (!merged[target]) merged[target] = f;
      else merged[target] = turf.union(merged[target], f);
    }
    // store props once
    if (!mergedProps[target]) {
      const f0 = item.geo.features[0];
      mergedProps[target] = { ...f0.properties, Code: target, Name: f0.properties.Name };
    }
  }

  // update cacheProv atomically
  Object.keys(cacheProv).forEach(k => delete cacheProv[k]);
  const mergedFeatures = [];
  for (const [codeStr, feat] of Object.entries(merged)) {
    const code = Number(codeStr);
    feat.properties = { ...feat.properties, ...mergedProps[code] };
    const fc = { type: 'FeatureCollection', features: [feat] };
    cacheProv[code] = { code, geo: fc };
    mergedFeatures.push({ code, geo: fc });
  }
  return mergedFeatures;
}

// --- PROVINCE LAYERS & TOOLTIPS ---
// store combined features list for choropleth creation later
let combinedProvFeatures = [];

function addProvinceLayer({ code, geo }) {
  const defaultStyle = { color: '#00bfff', weight: 1, fillOpacity: 0 };
  const highlightStyle = { color: '#ffff00', weight: 3, fillOpacity: 0.2 };

  const layer = L.geoJSON(geo, { pane: 'vectorPane', style: defaultStyle }).addTo(map);

  // popup content using provDataMap (values already normalized)
  const csvData = provDataMap[code];
  const name = geo.features[0].properties?.Name || `Provinsi ${code}`;
  const popupContent = csvData ? `
    <div style="font-family:Segoe UI, sans-serif; font-size:13px; color:#333">
      <div style="font-weight:600; font-size:14px; margin-bottom:6px">${name}</div>
      <table style="width:100%; border-collapse:collapse">
        <tr><td>Laju Pertumbuhan PDRB Atas Dasar Harga Konstan</td><td style="text-align:right">${formatNumber(csvData["Laju Pertumbuhan PDRB Atas Dasar Harga Konstan"])}</td></tr>
        <tr><td>Non Performing Loan</td><td style="text-align:right">${formatNumber(csvData["Non Perform Loan (persen)"],2)}</td></tr>
        <tr><td>Jumlah BPR/S</td><td style="text-align:right">${formatNumber(csvData["Jumlah BPR/S"])}</td></tr>
        <tr><td>Industri Mikro</td><td style="text-align:right">${formatNumber(csvData["Jumlah Perusahaan Industri Skala
Mikro"])}</td></tr>
        <tr><td>Industri Kecil</td><td style="text-align:right">${formatNumber(csvData["Jumlah Perusahaan Industri Skala
Kecil"])}</td></tr>
        <tr><td>Penetrasi Internet</td><td style="text-align:right">${formatNumber(csvData["Tingkat Penetrasi Internet"],2)}</td></tr>
      </table>
    </div>
  ` : `<b>${name}</b><br><i>Data CSV tidak tersedia</i>`;

  layer.bindPopup(popupContent);

  // center label as a lightweight marker (faster than permanent tooltip layers)
  const bounds = L.geoJSON(geo).getBounds();
  const center = bounds.getCenter();
  const label = L.marker(center, {
    pane: 'topTooltipPane',
    icon: L.divIcon({ className: 'prov-label', html: `<div>${name}</div>`, iconSize: [100, 24] }),
    interactive: false
  });
  tooltipLayerGroup.addLayer(label);

  // interactions
  layer.on('mouseover', () => layer.setStyle(highlightStyle));
  layer.on('mouseout', () => layer.setStyle(defaultStyle));
  layer.on('dblclick', async e => {
    L.DomEvent.stopPropagation(e);
    L.DomEvent.preventDefault(e);
    map.fitBounds(layer.getBounds(), { padding:[20,20], maxZoom: 9 });
    kabLayerGroup.clearLayers();
    showLoading();
    // fetch kab only when needed: fetch all kab once, reuse cache
    const kabResults = await Promise.all(kabCodes.map(fetchKabGeoJSON));
    for (const r of kabResults) {
      if (!r) continue;
      L.geoJSON(r.geo, {
        pane: 'kabPane',
        style: { color: '#ff6600', weight: 1, fillOpacity: 0 },
        onEachFeature: (f, l) => {
          const nameK = f.properties?.Name || `Kabupaten ${r.code}`;
          const kabCsvData = kabDataMap[f.properties?.Code || r.code];
          const popupK = kabCsvData ? `<b>${nameK}</b><br>Jumlah BPR/S: ${formatNumber(kabCsvData["Jumlah BPR/BPRS"])}` : `<b>${nameK}</b><br>-`;
          l.bindPopup(popupK);
          l.bindTooltip(nameK, { direction: 'top', className: 'prov-label' });
          l.on('mouseover', () => l.setStyle({ color: 'blue', weight: 3 }));
          l.on('mouseout', () => l.setStyle({ color: '#ff6600', weight: 1 }));

          // circle marker scaled
          if (kabCsvData && kabCsvData["Jumlah BPR/BPRS"] != null) {
            const b = l.getBounds();
            const c = b.getCenter();
            const offsetLat = (b.getNorth() - b.getSouth()) * 0.2;
            const offsetLng = (b.getEast() - b.getWest()) * 0.2;
            const adjusted = L.latLng(c.lat + offsetLat, c.lng + offsetLng);
            const radius = Math.sqrt(kabCsvData["Jumlah BPR/BPRS"]) * 10;
            L.circleMarker(adjusted, { radius, fillColor: 'blue', color: 'blue', weight:1, fillOpacity:0.5 }).addTo(kabLayerGroup);
          }
        }
      }).addTo(kabLayerGroup);
    }
    hideLoading();
  });

  // store features for choropleth creation
  combinedProvFeatures.push(...geo.features);
}

// --- TOOLTIP VISIBILITY (debounced) ---
const updateTooltipVisibility = debounce(() => {
  const z = map.getZoom();
  if (z < 6) {
    if (map.hasLayer(tooltipLayerGroup)) map.removeLayer(tooltipLayerGroup);
  } else {
    if (!map.hasLayer(tooltipLayerGroup)) map.addLayer(tooltipLayerGroup);
  }
}, 120);

map.on('moveend zoomend', updateTooltipVisibility);
map.on('zoomend', () => { if (map.getZoom() < 8) kabLayerGroup.clearLayers(); updateTooltipVisibility(); });

// --- CHOROPLETH (single global legend handling) ---
const colorPalettes = [
  ['#e4ff1c','#ff7f00'],
  ['#66ffcc','#0066ff'],
  ['#ff80ff','#9b00ff'],
  ['#ccff66','#00cc00'],
  ['#ffff66','#ff0000'],
  ['#ffcccc','#ff3399'],
  ['#ffff99','#996600'],
  ['#cc99ff','#6600cc'],
  ['#aaffaa','#008080']
];

// legend container (single control)
const legendDiv = L.DomUtil.create('div', 'legend-choropleth');
Object.assign(legendDiv.style, {
  background: 'rgba(255,255,255,0.95)', padding: '8px 10px', borderRadius:'8px', fontSize:'13px', boxShadow:'0 0 8px rgba(0,0,0,0.15)'
});
const legendControl = L.control({ position: 'bottomright' });
legendControl.onAdd = () => legendDiv;
legendControl.addTo(map);

function updateLegend({ title, start, end, min, max } = {}) {
  if (!title) { legendDiv.innerHTML = ''; return; }
  const steps = 4;
  const grades = Array.from({length: steps+1}, (_,i) => min + i*(max-min)/steps);
  let html = `<strong>${title}</strong><br/>`;
  for (let i=0;i<grades.length-1;i++) {
    const c = interpolateColor(start, end, i/(steps-1 || 1));
    html += `<i style="background:${c};width:20px;height:10px;display:inline-block;margin-right:6px;"></i> ${formatNumber(grades[i])} – ${formatNumber(grades[i+1])}<br/>`;
  }
  legendDiv.innerHTML = html;
}

function createChoroplethLayer(columnName, startColor, endColor) {
  // collect numeric values
  const vals = [];
  const codeIndex = {}; // map feature -> code
  for (const f of combinedProvFeatures) {
    const code = f.properties?.Code;
    const row = provDataMap[code];
    const v = row && row[columnName] != null ? Number(row[columnName]) : null;
    if (v != null && !isNaN(v)) vals.push(v);
  }
  if (vals.length === 0) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const getColor = v => interpolateColor(startColor, endColor, (v - min) / (max - min));

  const geoJson = L.geoJSON({ type: 'FeatureCollection', features: combinedProvFeatures }, {
    style: feature => {
      const code = feature.properties?.Code;
      const row = provDataMap[code];
      const v = row && row[columnName] != null ? Number(row[columnName]) : null;
      return { fillColor: v != null ? getColor(v) : '#ccc', color: 'white', weight: 1, fillOpacity: 1 };
    },
    onEachFeature: (feature, layer) => {
      const code = feature.properties?.Code;
      const row = provDataMap[code];
      const val = row && row[columnName] != null ? row[columnName] : 'N/A';
      layer.bindTooltip(`${feature.properties.Name}<br>${columnName}: ${val}`, { direction:'top', offset:[0,-4], className:'prov-tooltip' });
    }
  });

  // return layer but legend handling global: overlay name will be used by layer control event listeners
  geoJson._choroplethMeta = { columnName, startColor, endColor, min, max };
  return geoJson;
}

// One-time overlayadd/overlayremove listener to manage choropleth legend
map.on('overlayadd', e => {
  const layer = e.layer;
  if (layer && layer._choroplethMeta) {
    const m = layer._choroplethMeta;
    updateLegend({ title: m.columnName, start: m.startColor, end: m.endColor, min: m.min, max: m.max });
  }
});
map.on('overlayremove', e => {
  const layer = e.layer;
  if (layer && layer._choroplethMeta) updateLegend(null);
});

// --- MAIN BOOTSTRAP ---

(async function init() {
  showLoading();
  try {
    await Promise.all([
      loadCSVToMap('data/data_SEM.csv', 'idProv', provDataMap),
      loadCSVToMap('data/BPR_Sumut.csv', 'idKab', kabDataMap)
    ]);

    // Merge provinces and add layers
    const merged = await mergeProvincesUnion(provCodes);
    merged.forEach(addProvinceLayer);

    // add tooltip layer group (initial visibility handled by updateTooltipVisibility)
    tooltipLayerGroup.addTo(map);
    updateTooltipVisibility();

    // Build choropleths
    const sampleRow = Object.values(provDataMap)[0];
    if (sampleRow) {
      const columns = Object.keys(sampleRow).filter(k => !['idProv','Nama_Prov'].includes(k));
      columns.forEach((col, i) => {
        const [start,end] = colorPalettes[i % colorPalettes.length];
        const layer = createChoroplethLayer(col, start, end);
        if (layer) {
          const name = `Choropleth: ${col}`;
          overlays[name] = layer;
        }
      });
    }

    L.control.layers(baseLayers, overlays, { collapsed: true }).addTo(map);

  } catch (err) {
    console.error('Init error', err);
  } finally {
    hideLoading();
  }
})();
