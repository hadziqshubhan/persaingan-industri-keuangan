
        // Memuat data CSV
        // let provDataMap = {}; // map dari idProv → data CSV
        // let kabDataMap = {};  // data kabupaten

        /**
         * Load CSV ke map berdasarkan primary key
         * @param {string} url - lokasi file CSV
         * @param {string} keyField - nama kolom CSV yang jadi key
         * @param {object} targetMap - object untuk menyimpan data, key=keyField
         */
        async function loadCSVToMap(url, keyField, targetMap) {
            return new Promise((resolve, reject) => {
                Papa.parse(url, {
                    download: true,
                    header: true,
                    dynamicTyping: true,
                    complete: function (results) {
                        results.data.forEach(row => {
                            if (row[keyField] != null) targetMap[row[keyField]] = row;
                        });
                        resolve();
                    },
                    error: function (err) { reject(err); }
                });
            });
        }


        // console.log(provDataMap);

            let provDataMap = {}, kabDataMap = {};
    const cacheProv = {}, cacheKab = {};
    const kabLayerGroup = L.layerGroup();

    function showLoading() { document.getElementById('loading-overlay').style.display = 'flex'; }
    function hideLoading() { document.getElementById('loading-overlay').style.display = 'none'; }

    // === MAP DAN BASEMAP ===
    const baseOSM = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OSM'
    });

    const baseCarto = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; CARTO &copy; OSM'
    });

    const baseESRI = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: '&copy; ESRI'
    });

    const map = L.map("map", {
      center: [-2.5, 118],
      zoom: 5,
      layers: [baseCarto, kabLayerGroup]
    });

    map.createPane("rasterPane").style.zIndex = 200;
    map.createPane("vectorPane").style.zIndex = 400;
    map.createPane("kabPane").style.zIndex = 500;

    // === CONTROL UNTUK BASEMAP DAN OVERLAY ===
    const baseLayers = {
      "Carto Dark": baseCarto,
      "OpenStreetMap": baseOSM,
      "ESRI Satellite": baseESRI
    };

    const overlays = {
      "Kabupaten Layer": kabLayerGroup
    };

    L.control.layers(baseLayers, overlays).addTo(map);

    // === FITUR TOGGLE DRAG-ZOOM ===
    let boxZoomActive = false, boxZoomStart = null, boxZoomRect = null;

    function toggleBoxZoom() {
      boxZoomActive = !boxZoomActive;
      button.textContent = boxZoomActive ? "🟢 Drag-Zoom Aktif" : "🔲 Drag-Zoom";
      if (!boxZoomActive && boxZoomRect) {
        map.removeLayer(boxZoomRect);
        boxZoomRect = null;
      }
    }

    const ZoomToggle = L.Control.extend({
      onAdd: function () {
        const div = L.DomUtil.create("div", "leaflet-control-custom");
        div.textContent = "🔲 Drag-Zoom";
        div.onclick = toggleBoxZoom;
        L.DomEvent.disableClickPropagation(div);
        button = div;
        return div;
      }
    });

    new ZoomToggle({ position: "topright" }).addTo(map);

    map.on('mousedown', function (e) {
      if (!boxZoomActive) return;
      boxZoomStart = e.latlng;
      map.dragging.disable();
    });

    map.on('mousemove', function (e) {
      if (!boxZoomActive || !boxZoomStart) return;
      const bounds = L.latLngBounds(boxZoomStart, e.latlng);
      if (boxZoomRect) boxZoomRect.setBounds(bounds);
      else boxZoomRect = L.rectangle(bounds, { color: '#007bff', weight: 1, dashArray: '4', fillOpacity: 0.1 }).addTo(map);
    });

    map.on('mouseup', function (e) {
      if (!boxZoomActive || !boxZoomStart) return;
      const bounds = L.latLngBounds(boxZoomStart, e.latlng);
      if (boxZoomRect) {
        map.fitBounds(bounds);
        map.removeLayer(boxZoomRect);
        boxZoomRect = null;
      }
      boxZoomStart = null;
      map.dragging.enable();
    });

        // === Raster ===
        async function loadRaster() {
            const res = await fetch("https://pub-ae77ac36016f4866951719d9d19c80f8.r2.dev/NTL1.tif");
            const arrayBuffer = await res.arrayBuffer();
            const georaster = await parseGeoraster(arrayBuffer);
            const rasterLayer = new GeoRasterLayer({
                georaster: georaster,
                pane: "rasterPane",
                opacity: 1,
                resolution: 256,
                pixelValuesToColorFn: value => getNightLightsColor(value),
            }).addTo(map);

            rasterLayer.addTo(map);
        }

        function getNightLightsColor(value) {
            if (value <= 0) return null;
            const min = 0, max = 15; // sesuaikan dengan nilai GeoTIFF Anda
            const ratio = Math.min((value - min) / (max - min), 1);

            // Warna awal (#ff7f00) → Warna akhir (#e4ff1c)
            const start = { r: 255, g: 127, b: 0 };     // #ff7f00
            const end   = { r: 228, g: 255, b: 28 };    // #e4ff1c

            // Interpolasi linear antar warna
            const r = Math.floor(start.r + (end.r - start.r) * ratio);
            const g = Math.floor(start.g + (end.g - start.g) * ratio);
            const b = Math.floor(start.b + (end.b - start.b) * ratio);

            // Opsi transparansi lembut (semakin besar nilai, semakin kuat)
            const alpha = 0.3 + 0.7 * ratio;

            return `rgba(${r},${g},${b},${alpha})`;
        }


        const provCodes = [11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 31, 32, 33, 34, 35, 36, 51, 52, 53, 61, 62, 63, 64, 65, 71, 72, 73, 74, 75, 76, 81, 82, 91, 92, 93, 94, 95, 96];
        const kabCodes = [1201, 1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209, 1210, 1211, 1212, 1213, 1214, 1215, 1216, 1217, 1218, 1219, 1220, 1221, 1222, 1223, 1224, 1225, 1271, 1272, 1273, 1274, 1275, 1276, 1277, 1278];

        // const cacheProv = {}, cacheKab = {};

        async function fetchProvGeoJSON(code) {
            if (cacheProv[code]) return cacheProv[code];
            try {
                const res = await fetch(`https://whatsproject.my.id/geo/v1/prov/${code}/map`);
                const json = await res.json();
                const geo = json.provFeature?.provFeature || json.provFeature || json;
                if (geo && geo.type === "FeatureCollection") {
                    cacheProv[code] = { code, geo };
                    return cacheProv[code];
                }
                return null;
            } catch (e) { console.warn(`Gagal memuat provinsi ${code}`, e); return null; }
        }

        async function fetchKabGeoJSON(code) {
            if (cacheKab[code]) return cacheKab[code];
            try {
                const res = await fetch(`https://whatsproject.my.id/geo/v1/city/${code}/map`);
                const json = await res.json();
                const geo = json.cityFeature?.cityFeature || json.cityFeature || json;
                if (geo && geo.type === "FeatureCollection") {
                    cacheKab[code] = { code, geo };
                    return cacheKab[code];
                }
                return null;
            } catch (e) { console.warn(`Gagal memuat kabupaten ${code}`, e); return null; }
        }

        // === Merge & Union Provinsi ===
        const mergeProvCodes = { 92: [92, 96], 91: [91, 93, 94, 95] };

        async function mergeProvincesUnion(codes) {
            const merged = {};
            for (const code of codes) {
                const prov = await fetchProvGeoJSON(code);
                if (!prov) continue;
                let target = code;
                for (const key in mergeProvCodes) {
                    if (mergeProvCodes[key].includes(code)) target = parseInt(key);
                }
                prov.geo.features.forEach(f => {
                    if (!merged[target]) merged[target] = f;
                    else merged[target] = turf.union(merged[target], f);
                });
            }
            return Object.entries(merged).map(([code, feature]) => ({
                code: parseInt(code),
                geo: { type: "FeatureCollection", features: [feature] }
            }));
        }

        // const kabLayerGroup = L.layerGroup().addTo(map);
        let provTooltips = [];

        function addProvinceLayer({ code, geo }) {
            const defaultStyle = { color: '#00bfff', weight: 1, fillOpacity: 0 };
            const highlightStyle = { color: '#ffff00', weight: 3, fillOpacity: 0.2 };

            const bounds = L.geoJSON(geo).getBounds();
            const center = bounds.getCenter();

            const layer = L.geoJSON(geo, { pane: "vectorPane", style: defaultStyle }).addTo(map);

            // Ambil data CSV
            const csvData = provDataMap[code];
            const nama = geo.features[0].properties?.Name || `Provinsi ${code}`;
            const popupContent = csvData
                ? `<b>${nama}</b><br>Non Performance Loan: ${csvData.NPL}<br>jumlah BPR/S: ${csvData["BPR/S"]}<br>jumlah Usaha Menengah: ${csvData.UM}<br>jumlah Usaha Kecil: ${csvData.UK}<br>Indeks Penetrasi Internet: ${csvData["PENETRASI"]}`
                : `<b>${nama}</b><br>Data CSV tidak tersedia`;

            layer.bindPopup(popupContent);

            const tooltip = L.tooltip({ permanent: true, direction: "center", className: "prov-label" })
                .setContent(nama)
                .setLatLng(center);
            provTooltips.push(tooltip);
            map.addLayer(tooltip);

            layer.on("mouseover", () => layer.setStyle(highlightStyle));
            layer.on("mouseout", () => layer.setStyle(defaultStyle));



            layer.on("dblclick", async (e) => {
                L.DomEvent.stopPropagation(e); L.DomEvent.preventDefault(e);
                map.fitBounds(layer.getBounds(), { padding: [20, 20], maxZoom: 9 });
                kabLayerGroup.clearLayers();
                showLoading();
                const kabResults = await Promise.all(kabCodes.map(fetchKabGeoJSON));
                kabResults.filter(r => r).forEach(({ code, geo }) => {
                    L.geoJSON(geo, {
                        pane: "kabPane",
                        style: { color: "#ff6600", weight: 1, fillOpacity: 0 },
                        onEachFeature: (f, l) => {
                            const nama = f.properties?.Name || `Kabupaten ${code}`;
                            const kabCsvData = kabDataMap[code];  // kabCode dari GeoJSON
                            const popupContentkab = kabCsvData
                                ? `<b>${nama}</b><br>Jumlah BPR/S: ${kabCsvData["Jumlah BPR/BPRS"]}`
                                : `<b>${nama}</b><br>-`;

                            l.bindPopup(`<b>${nama}</b><br>Kode: ${f.properties.Code}`);
                            l.bindPopup(popupContentkab);
                            l.bindTooltip(nama, { permanent: false, direction: "top", className: "prov-label" });
                            l.on("mouseover", () => l.setStyle({ color: "#ffff00", weight: 3 }));
                            l.on("mouseout", () => l.setStyle({ color: "#ff6600", weight: 1 }));

                            // Circle Marker
                            if (kabCsvData && kabCsvData["Jumlah BPR/BPRS"] != null) {
                                const center = l.getBounds().getCenter();
                                const radius = Math.sqrt(kabCsvData["Jumlah BPR/BPRS"]) * 10; // skala agar tidak terlalu besar
                                L.circleMarker(center, {
                                    radius: radius,
                                    fillColor: "red",
                                    color: "red",
                                    weight: 1,
                                    fillOpacity: 0.5
                                }).addTo(kabLayerGroup);
                            }
                        }
                    }).addTo(kabLayerGroup);
                });
                hideLoading();
            });
        }

        function updateTooltipVisibility() {
            const zoom = map.getZoom();
            provTooltips.forEach(t => {
                const pos = map.latLngToContainerPoint(t.getLatLng());
                const isInViewport = pos.x > 0 && pos.y > 0 && pos.x < window.innerWidth && pos.y < window.innerHeight;
                if (zoom < 6 || !isInViewport) map.removeLayer(t);
                else if (!map.hasLayer(t)) map.addLayer(t);
            });
        }

        map.on("moveend zoomend", updateTooltipVisibility);
        map.on("zoomend", () => { if (map.getZoom() < 8) kabLayerGroup.clearLayers(); updateTooltipVisibility(); });

        // === Jalankan semua ===
        (async function () {
            showLoading();
            await loadRaster();

            await loadCSVToMap("data/data_SEM.csv", "idProv", provDataMap);   // CSV provinsi
            await loadCSVToMap("data/BPR_Sumut.csv", "idKab", kabDataMap);      // CSV kabupaten

            const mergedProv = await mergeProvincesUnion(provCodes);
            mergedProv.forEach(addProvinceLayer);

            hideLoading();

        })();


